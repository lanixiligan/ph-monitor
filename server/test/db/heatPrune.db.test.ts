// Database test for the heat map's delete rule: after a run, forecast hours
// from before today's midnight (Philippine time) are deleted; today's stay.
// Run with: npm run test:db

import { pool, resetDb } from './testDb.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { barTime, phDate } from '@ph-monitor/shared';
import type { HeatModelId } from '@ph-monitor/shared';
import type { HeatLocation } from '../../src/fetchers/openMeteoHeat.ts';
import { saveHeatRun } from '../../src/jobs/ingestHeatMap.ts';
import type { WeatherPoint } from '../../src/jobs/ingestWeather.ts';

const MODELS: HeatModelId[] = ['ecmwf_ifs'];
let point: WeatherPoint;

before(async () => {
  await resetDb();
  const result = await pool.query<WeatherPoint>(
    `INSERT INTO weather_points (kind, geom) VALUES ('grid', ST_SetSRID(ST_MakePoint(121.45, 14.45), 4326))
     RETURNING id, ST_Y(geom) AS lat, ST_X(geom) AS lon`,
  );
  point = result.rows[0] as WeatherPoint;
});

after(async () => {
  await pool.end();
});

test('saveHeatRun: deletes hours before PH midnight today, keeps today from 00:00', async () => {
  await pool.query('DELETE FROM heat_forecasts');
  // A pretend "now": 2026-11-20 10:00 in the Philippines.
  const now = barTime('2026-11-20', 10);
  const midnight = barTime(phDate(now), 0);
  const yesterday2300 = new Date(midnight.getTime() - 60 * 60 * 1000);
  const today0100 = new Date(midnight.getTime() + 60 * 60 * 1000);
  const insert = `INSERT INTO heat_forecasts (model, point_id, valid_at, temp_c, humidity_pct, heat_index_c)
                  VALUES ('dwd_icon_global_native', $1, $2, 30, 60, 33)`;
  await pool.query(insert, [point.id, yesterday2300]);
  await pool.query(insert, [point.id, today0100]);

  // ECMWF answers with one hour; ICON sends nothing, so its old rows stay unless the rule deletes them.
  const answer: HeatLocation = {
    times: [now],
    models: { ecmwf_ifs: { tempC: [34], humidityPct: [60] } },
  };
  await saveHeatRun([point], [answer], MODELS, now);

  const left = await pool.query<{ valid_at: Date }>(
    `SELECT valid_at FROM heat_forecasts WHERE model = 'dwd_icon_global_native'`,
  );
  assert.deepEqual(left.rows.map((row) => row.valid_at.getTime()), [today0100.getTime()]);
});
