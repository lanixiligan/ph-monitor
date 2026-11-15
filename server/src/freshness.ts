// "How fresh is the data?" Shared by the province and point routes.

import type { Freshness } from '@ph-monitor/shared';
import { pool } from './db.ts';

/** Data is "stale" when a feed's last successful fetch is older than this. */
const STALE_AFTER_MS = 60 * 60 * 1000;

/** When each scheduled feed last succeeded (null = never). */
export async function getLastOk(): Promise<{ earthquakes: Date | null; weather: Date | null }> {
  const runs = await pool.query<{ source: string; last_ok_at: Date }>(
    'SELECT source, last_ok_at FROM fetch_runs',
  );
  const lastOk = new Map(runs.rows.map((row) => [row.source, row.last_ok_at]));
  return {
    earthquakes: lastOk.get('usgs') ?? null,
    weather: lastOk.get('open-meteo') ?? null,
  };
}

/** Turns the two fetch times into the Freshness shape the web app shows. */
export function buildFreshness(earthquakes: Date | null, weather: Date | null): Freshness {
  const oldestAllowed = Date.now() - STALE_AFTER_MS;
  const isStale =
    earthquakes === null ||
    weather === null ||
    earthquakes.getTime() < oldestAllowed ||
    weather.getTime() < oldestAllowed;

  return {
    // `?.` reads a field only if the value exists; `?? null` fills the gap.
    earthquakesFetchedAt: earthquakes?.toISOString() ?? null,
    weatherFetchedAt: weather?.toISOString() ?? null,
    isStale,
  };
}
