// Job: fetch the next 7 days of hourly rain on the rain forecast grid (ECMWF
// via Open-Meteo) and save it. Display only: no scoring code reads rain_forecasts.
// Runs every 12 hours, right after the heat map (due.ts, scheduler.ts);
// 256 Open-Meteo calls a run. Run by hand with: npm run ingest:rainforecast

import { pool } from '../db.ts';
import { fetchOpenMeteoRain } from '../fetchers/openMeteoRain.ts';
import type { RainHours } from '../fetchers/openMeteoRain.ts';
import { isFreshEnough } from '../freshness.ts';
import { gridPoints, RAIN_GRID } from '../rainForecast.ts';

/** 50 points a request, 20 seconds apart, like the heat map: about 1 minute a run. */
const GAP_BETWEEN_REQUESTS_MS = 20_000;

// `Promise<void>` = an async function that hands back nothing when it is done.
export async function ingestRainForecast(): Promise<void> {
  const points = gridPoints(RAIN_GRID);
  const locations = await fetchOpenMeteoRain(points, { gapMs: GAP_BETWEEN_REQUESTS_MS });
  await saveRainRun(points.map((point) => point.index), locations);
}

/**
 * Saves one run: `locations` has one entry per point index (null = no usable
 * answer). Split out so a test can call it without the network. The run
 * replaces the old one only when at least 90% of points answered; otherwise
 * the last good run stays (and goes out of date after 25 hours).
 */
export async function saveRainRun(indexes: number[], locations: (RainHours | null)[]): Promise<void> {
  const total = indexes.length;
  const kept: { index: number; hours: RainHours }[] = [];
  for (const [i, index] of indexes.entries()) {
    const hours = locations[i];
    if (hours) kept.push({ index, hours });
  }
  if (kept.length === 0) throw new Error('Open-Meteo rain: no point answered; nothing saved.');

  if (!isFreshEnough(kept.length, total)) {
    await pool.query(`UPDATE fetch_runs SET last_saved = $1, last_total = $2 WHERE source = 'open-meteo-rain'`, [kept.length, total]);
    console.warn(`Rain forecast: only ${kept.length} of ${total} points answered; the last good run stays.`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM rain_forecasts');
    for (const { index, hours } of kept) {
      // `?? 0` never happens (parseRainLocation keeps only points with hours); it satisfies the type.
      const startAt = hours.times[0] ?? new Date(0);
      await client.query(
        'INSERT INTO rain_forecasts (point_index, start_at, hourly_mm, fetched_at) VALUES ($1, $2, $3::real[], now())',
        [index, startAt, hours.mm],
      );
    }
    await client.query(
      `INSERT INTO fetch_runs (source, last_ok_at, last_saved, last_total) VALUES ('open-meteo-rain', now(), $1, $2)
       ON CONFLICT (source) DO UPDATE SET
         last_ok_at = EXCLUDED.last_ok_at,
         last_saved = EXCLUDED.last_saved,
         last_total = EXCLUDED.last_total`,
      [kept.length, total],
    );
    await client.query('COMMIT');
    console.log(`Rain forecast: saved ${kept.length} of ${total} points.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
