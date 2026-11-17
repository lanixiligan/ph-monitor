// Job: fetch the latest weather at every weather point and save it.
// The points are a ~28 km grid over the land plus a few extras (built by
// `npm run weather-points`). Each point's reading is saved as it is; each
// province also gets one reading, the worst of its points (most rain,
// hottest point), for the province card and history.
// Run by hand with: npm run ingest:weather

import { pool } from '../db.ts';
import { fetchOpenMeteo } from '../fetchers/openMeteo.ts';
import type { WeatherReading } from '../fetchers/openMeteo.ts';
import { isFreshEnough } from '../freshness.ts';
import { heatIndexC } from '../heatIndex.ts';
import { worstByOwner } from '../weatherPoints.ts';
import type { PointLink } from '../weatherPoints.ts';

/** About 50 points go in one request; 10 seconds apart spreads ~600 points over 2 minutes. */
const GAP_BETWEEN_REQUESTS_MS = 10_000;

/** Point readings older than this are deleted. */
const KEEP_POINT_READINGS_HOURS = 48;

/** One weather point: its id in `weather_points` and where it is. */
export type WeatherPoint = { id: number; lat: number; lon: number };

/** Heat index needs both temperature and humidity. */
function heatIndexOf(reading: WeatherReading): number | null {
  return reading.tempC !== null && reading.humidityPct !== null
    ? heatIndexC(reading.tempC, reading.humidityPct)
    : null;
}

export async function ingestWeather(): Promise<void> {
  const points = await pool.query<WeatherPoint>(
    'SELECT id, ST_Y(geom) AS lat, ST_X(geom) AS lon FROM weather_points ORDER BY id',
  );
  if (points.rows.length === 0) {
    throw new Error('No weather points in the database. Run `npm run weather-points` first.');
  }
  const readings = await fetchOpenMeteo(points.rows, { gapMs: GAP_BETWEEN_REQUESTS_MS });
  await saveWeatherRun(points.rows, readings);
}

/**
 * Saves one run: `readings` has one entry per point, in the same order
 * (null = no usable answer). Split from ingestWeather so a test can call it
 * without the network.
 */
export async function saveWeatherRun(points: WeatherPoint[], readings: (WeatherReading | null)[]): Promise<void> {
  // point id → its reading. `entries()` gives each point with its position.
  const byPoint = new Map<number, WeatherReading | null>();
  for (const [i, point] of points.entries()) byPoint.set(point.id, readings[i] ?? null);

  // 1. Every point's own reading, saved in one statement. `unnest` turns the
  //    lists into rows, one row per position.
  const answered = points.filter((point) => byPoint.get(point.id));
  const rows = answered.map((point) => byPoint.get(point.id) as WeatherReading);
  if (answered.length > 0) {
    await pool.query(
      `INSERT INTO point_readings
         (point_id, valid_at, temp_c, humidity_pct, heat_index_c, rain_1h_mm, rain_24h_mm, fetched_at)
       SELECT *, now() FROM unnest($1::int[], $2::timestamptz[], $3::real[], $4::real[], $5::real[], $6::real[], $7::real[])
       ON CONFLICT (point_id, valid_at) DO UPDATE SET
         temp_c = EXCLUDED.temp_c,
         humidity_pct = EXCLUDED.humidity_pct,
         heat_index_c = EXCLUDED.heat_index_c,
         rain_1h_mm = EXCLUDED.rain_1h_mm,
         rain_24h_mm = EXCLUDED.rain_24h_mm,
         fetched_at = EXCLUDED.fetched_at`,
      [
        answered.map((point) => point.id),
        rows.map((reading) => reading.validAt),
        rows.map((reading) => reading.tempC),
        rows.map((reading) => reading.humidityPct),
        rows.map(heatIndexOf),
        rows.map((reading) => reading.rain1hMm),
        rows.map((reading) => reading.rain24hMm),
      ],
    );
  }
  await pool.query(`DELETE FROM point_readings WHERE valid_at < now() - make_interval(hours => $1)`, [
    KEEP_POINT_READINGS_HOURS,
  ]);

  // 2. One reading per province: the worst of the points inside it and the
  //    points its towns read from.
  const links = await pool.query<PointLink>(
    `SELECT p.psgc AS owner, w.id AS "pointId"
     FROM provinces p JOIN weather_points w ON ST_Intersects(p.geom, w.geom)
     UNION
     SELECT c.province_psgc, l.point_id
     FROM place_weather_points l JOIN places c ON c.psgc = l.place_psgc`,
  );
  const byProvince = worstByOwner(links.rows, byPoint);
  for (const [psgc, reading] of byProvince) {
    await pool.query(
      `INSERT INTO weather_readings
         (province_psgc, valid_at, temp_c, humidity_pct, heat_index_c, rain_1h_mm, rain_24h_mm, fetched_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (province_psgc, valid_at) DO UPDATE SET
         temp_c = EXCLUDED.temp_c,
         humidity_pct = EXCLUDED.humidity_pct,
         heat_index_c = EXCLUDED.heat_index_c,
         rain_1h_mm = EXCLUDED.rain_1h_mm,
         rain_24h_mm = EXCLUDED.rain_24h_mm,
         fetched_at = EXCLUDED.fetched_at`,
      [psgc, reading.validAt, reading.tempC, reading.humidityPct, heatIndexOf(reading), reading.rain1hMm, reading.rain24hMm],
    );
  }

  if (answered.length === 0) {
    throw new Error('Open-Meteo: every location failed the checks; nothing saved.');
  }

  // The run only counts as a success when nearly every point answered. A thin
  // run still records how much it saved, but keeps the old "last success"
  // time, so the page shows the weather as out of date.
  const saved = answered.length;
  const total = points.length;
  if (isFreshEnough(saved, total)) {
    await pool.query(
      `INSERT INTO fetch_runs (source, last_ok_at, last_saved, last_total) VALUES ('open-meteo', now(), $1, $2)
       ON CONFLICT (source) DO UPDATE SET
         last_ok_at = EXCLUDED.last_ok_at,
         last_saved = EXCLUDED.last_saved,
         last_total = EXCLUDED.last_total`,
      [saved, total],
    );
    console.log(`Weather: ${total} points, saved ${saved}; ${byProvince.size} provinces.`);
  } else {
    await pool.query(
      `UPDATE fetch_runs SET last_saved = $1, last_total = $2 WHERE source = 'open-meteo'`,
      [saved, total],
    );
    console.warn(`Weather: saved only ${saved} of ${total} points; not counted as a fresh run.`);
  }
}
