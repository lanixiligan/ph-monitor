// Job: fetch the latest weather at each province's sample point and save it.
// Run by hand with: npm run ingest:weather

import { pool } from '../db.ts';
import { fetchOpenMeteo } from '../fetchers/openMeteo.ts';
import { heatIndexC } from '../heatIndex.ts';

export async function ingestWeather(): Promise<void> {
  // ST_X / ST_Y read the longitude / latitude out of a point.
  const provinces = await pool.query<{ psgc: number; lon: number; lat: number }>(
    `SELECT psgc, ST_X(weather_point) AS lon, ST_Y(weather_point) AS lat
     FROM provinces ORDER BY psgc`,
  );
  if (provinces.rows.length === 0) {
    throw new Error('No provinces in the database. Run `npm run load-provinces` first.');
  }

  const readings = await fetchOpenMeteo(provinces.rows);

  let saved = 0;
  let skipped = 0;

  // `entries()` gives each row together with its position in the list, so we
  // can pick the reading at the same position.
  for (const [i, province] of provinces.rows.entries()) {
    const reading = readings[i];
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

  await pool.query(
    `INSERT INTO fetch_runs (source, last_ok_at) VALUES ('open-meteo', now())
     ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
  );

  console.log(`Weather: saved ${saved} readings, skipped ${skipped}.`);
}
