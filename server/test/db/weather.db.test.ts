// Database tests for saving a weather run (src/jobs/ingestWeather.ts). The
// readings are made up here, so no test goes out to Open-Meteo.
// Run with: npm run test:db

import { ALPHA, ALPHA_CITY, BRAVO, minutesAgo, pool, resetDb } from './testDb.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { WeatherReading } from '../../src/fetchers/openMeteo.ts';
import { saveWeatherRun } from '../../src/jobs/ingestWeather.ts';
import type { WeatherPoint } from '../../src/jobs/ingestWeather.ts';

let points: WeatherPoint[] = [];

function reading(rain1hMm: number): WeatherReading {
  return { validAt: minutesAgo(30), tempC: 30, humidityPct: 70, rain1hMm, rain24hMm: rain1hMm * 3 };
}

before(async () => {
  await resetDb();
  // Two points in Alpha (one inside Alpha City, linked to it) and one in Bravo.
  const result = await pool.query<WeatherPoint>(
    `INSERT INTO weather_points (kind, geom) VALUES
       ('grid', ST_SetSRID(ST_MakePoint(121.5, 14.5), 4326)),
       ('grid', ST_SetSRID(ST_MakePoint(121.9, 14.9), 4326)),
       ('grid', ST_SetSRID(ST_MakePoint(124.5, 10.5), 4326))
     RETURNING id, ST_Y(geom) AS lat, ST_X(geom) AS lon`,
  );
  points = result.rows;
  await pool.query('INSERT INTO place_weather_points (place_psgc, point_id) VALUES ($1, $2)', [ALPHA_CITY, points[0]?.id]);
});

after(() => pool.end());

test('weather run: every point is saved, and each province gets the worst of its points', async () => {
  await saveWeatherRun(points, [reading(2), reading(20), reading(5)]);
  const saved = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM point_readings');
  assert.equal(saved.rows[0]?.n, 3);

  const provinces = await pool.query<{ province_psgc: number; rain_1h_mm: number }>(
    'SELECT province_psgc, rain_1h_mm FROM weather_readings ORDER BY province_psgc',
  );
  assert.deepEqual(provinces.rows, [
    { province_psgc: ALPHA, rain_1h_mm: 20 },
    { province_psgc: BRAVO, rain_1h_mm: 5 },
  ]);
  const run = await pool.query<{ last_saved: number; last_total: number }>(
    `SELECT last_saved, last_total FROM fetch_runs WHERE source = 'open-meteo'`,
  );
  assert.deepEqual(run.rows[0], { last_saved: 3, last_total: 3 });
});

test('weather run: a thin run is saved but does not count as fresh', async () => {
  const before = await pool.query<{ last_ok_at: Date }>(`SELECT last_ok_at FROM fetch_runs WHERE source = 'open-meteo'`);
  await saveWeatherRun(points, [reading(1), null, null]);
  const after = await pool.query<{ last_ok_at: Date; last_saved: number }>(
    `SELECT last_ok_at, last_saved FROM fetch_runs WHERE source = 'open-meteo'`,
  );
  assert.equal(after.rows[0]?.last_saved, 1);
  assert.deepEqual(after.rows[0]?.last_ok_at, before.rows[0]?.last_ok_at);
});
