// Job: fetch the latest weather at each province's sample points and save it.
// A big or island province has up to two extra points (see weatherPoints.ts);
// what is saved is the worst of them: the most rain and the hottest point.
// Run by hand with: npm run ingest:weather

import { pool } from '../db.ts';
import { fetchOpenMeteo } from '../fetchers/openMeteo.ts';
import { isFreshEnough } from '../freshness.ts';
import { heatIndexC } from '../heatIndex.ts';
import { worstReading } from '../weatherPoints.ts';

export async function ingestWeather(): Promise<void> {
  const provinces = await pool.query<{ psgc: number }>('SELECT psgc FROM provinces ORDER BY psgc');
  if (provinces.rows.length === 0) {
    throw new Error('No provinces in the database. Run `npm run load-provinces` first.');
  }

  // Every sample point: each province's own, plus its extra ones (if any).
  // ST_X / ST_Y read the longitude / latitude out of a point.
  const points = await pool.query<{ psgc: number; lon: number; lat: number }>(
    `SELECT psgc, ST_X(weather_point) AS lon, ST_Y(weather_point) AS lat FROM provinces
     UNION ALL
     SELECT province_psgc, ST_X(geom), ST_Y(geom) FROM province_weather_points
     ORDER BY psgc`,
  );

  const readings = await fetchOpenMeteo(points.rows);

  // Group the answers by province. A Map is a lookup table: psgc → its readings.
  const byProvince = new Map<number, (typeof readings)[number][]>();
  // `entries()` gives each row together with its position in the list, so we
  // can pick the reading at the same position.
  for (const [i, point] of points.rows.entries()) {
    const list = byProvince.get(point.psgc) ?? [];
    list.push(readings[i] ?? null);
    byProvince.set(point.psgc, list);
  }

  let saved = 0;
  let skipped = 0;

  for (const province of provinces.rows) {
    const reading = worstReading(byProvince.get(province.psgc) ?? []);
    if (!reading) {
      skipped += 1;
      continue;
    }

    // Heat index needs both temperature and humidity.
    const heatIndex =
      reading.tempC !== null && reading.humidityPct !== null
        ? heatIndexC(reading.tempC, reading.humidityPct)
        : null;

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
      [
        province.psgc,
        reading.validAt,
        reading.tempC,
        reading.humidityPct,
        heatIndex,
        reading.rain1hMm,
        reading.rain24hMm,
      ],
    );
    saved += 1;
  }

  if (saved === 0) {
    throw new Error('Open-Meteo: every location failed the checks; nothing saved.');
  }

  // The run only counts as a success when nearly every province got a
  // reading. A thin run still records how much it saved, but keeps the old
  // "last success" time, so the page shows the weather as out of date.
  const total = provinces.rows.length;
  if (isFreshEnough(saved, total)) {
    await pool.query(
      `INSERT INTO fetch_runs (source, last_ok_at, last_saved, last_total) VALUES ('open-meteo', now(), $1, $2)
       ON CONFLICT (source) DO UPDATE SET
         last_ok_at = EXCLUDED.last_ok_at,
         last_saved = EXCLUDED.last_saved,
         last_total = EXCLUDED.last_total`,
      [saved, total],
    );
    console.log(
      `Weather: saved ${saved} of ${total} provinces from ${points.rows.length} points, skipped ${skipped}.`,
    );
  } else {
    await pool.query(
      `UPDATE fetch_runs SET last_saved = $1, last_total = $2 WHERE source = 'open-meteo'`,
      [saved, total],
    );
    console.warn(
      `Weather: saved only ${saved} of ${total} provinces (skipped ${skipped}); not counted as a fresh run.`,
    );
  }
}
