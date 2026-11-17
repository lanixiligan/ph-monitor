// Job: fetch the "next 7 days" outlook (rain, gusts, river flow) for each
// province's sample point and save it in forecast_days.
//
// Call budget (Open-Meteo free tier: about 10,000 calls a day; a request for
// N points counts as about N calls). Meant to run every 6 hours, 4 times a day:
//   88 provinces x 2 APIs (daily + flood) x 4 runs = 704 calls a day.
// Together with the weather job (about 4,800 a day) this stays below the limit.

import { pool } from '../db.ts';
import { fetchOpenMeteoDaily } from '../fetchers/openMeteoDaily.ts';
import { fetchOpenMeteoFlood } from '../fetchers/openMeteoFlood.ts';

export async function ingestForecast(): Promise<void> {
  // ST_X / ST_Y read the longitude / latitude out of a point.
  const provinces = await pool.query<{ psgc: number; lon: number; lat: number }>(
    `SELECT psgc, ST_X(weather_point) AS lon, ST_Y(weather_point) AS lat
     FROM provinces ORDER BY psgc`,
  );
  if (provinces.rows.length === 0) {
    throw new Error('No provinces in the database. Run `npm run load-provinces` first.');
  }

  // `Promise.allSettled` runs both downloads at once and waits for both, even
  // if one fails. Each result says "fulfilled" (with a value) or "rejected".
  const [daily, flood] = await Promise.allSettled([
    fetchOpenMeteoDaily(provinces.rows),
    fetchOpenMeteoFlood(provinces.rows),
  ]);
  if (daily.status === 'rejected') console.error('Outlook: rain and gusts failed:', daily.reason);
  if (flood.status === 'rejected') console.error('Outlook: river discharge failed:', flood.reason);
  if (daily.status === 'rejected' && flood.status === 'rejected') {
    throw new Error('Outlook: both Open-Meteo sources failed; nothing saved.');
  }

  let dailySaved = 0;
  let floodSaved = 0;
  let skipped = 0;

  for (const [i, province] of provinces.rows.entries()) {
    // Each upsert touches only its own columns, so a flood failure never
    // wipes the rain values (and the other way round).
    const days = daily.status === 'fulfilled' ? daily.value[i] : undefined;
    if (days) {
      for (const d of days) {
        await pool.query(
          `INSERT INTO forecast_days (province_psgc, day, rain_mm, gust_kmh, fetched_at)
           VALUES ($1, $2, $3, $4, now())
           ON CONFLICT (province_psgc, day) DO UPDATE SET
             rain_mm = EXCLUDED.rain_mm,
             gust_kmh = EXCLUDED.gust_kmh,
             fetched_at = EXCLUDED.fetched_at`,
          [province.psgc, d.day, d.rainMm, d.gustKmh],
        );
      }
      dailySaved += 1;
    } else if (daily.status === 'fulfilled') {
      skipped += 1;
    }

    const floodDays = flood.status === 'fulfilled' ? flood.value[i] : undefined;
    if (floodDays) {
      for (const d of floodDays) {
        await pool.query(
          `INSERT INTO forecast_days (province_psgc, day, river_discharge_m3s, fetched_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (province_psgc, day) DO UPDATE SET
             river_discharge_m3s = EXCLUDED.river_discharge_m3s,
             fetched_at = EXCLUDED.fetched_at`,
          [province.psgc, d.day, d.riverDischargeM3s],
        );
      }
      floodSaved += 1;
    } else if (flood.status === 'fulfilled') {
      skipped += 1;
    }
  }

  if (dailySaved === 0 && floodSaved === 0) {
    throw new Error('Outlook: every location failed the checks; nothing saved.');
  }

  // Forget days that are over (today is counted in Philippine time).
  const removed = await pool.query(
    `DELETE FROM forecast_days WHERE day < (now() AT TIME ZONE 'Asia/Manila')::date`,
  );

  // Record a successful run only for the sources that worked.
  if (dailySaved > 0) {
    await pool.query(
      `INSERT INTO fetch_runs (source, last_ok_at) VALUES ('open-meteo-daily', now())
       ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
    );
  }
  if (floodSaved > 0) {
    await pool.query(
      `INSERT INTO fetch_runs (source, last_ok_at) VALUES ('open-meteo-flood', now())
       ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
    );
  }

  console.log(
    `Outlook: rain/gusts for ${dailySaved} provinces, river flow for ${floodSaved}, ` +
      `skipped ${skipped}, removed ${removed.rowCount ?? 0} old days.`,
  );
}
