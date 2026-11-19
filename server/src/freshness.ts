// "How fresh is the data?" Shared by the routes, the score job and /api/status.
// Every feed has its own limit: a feed fetched every 15 minutes is out of date
// much sooner than the 7-day outlook, which is fetched every 6 hours.

import type { FeedHealth, FeedId, Freshness, SignalName } from '@ph-monitor/shared';
import { pool } from './db.ts';

const MINUTE_MS = 60 * 1000;

/** The heat map is out of date after this (also used by heatMap.ts for each model). */
export const HEAT_MAP_STALE_MINUTES = 25 * 60;

type FeedRule = {
  id: FeedId;
  /** Names in the `fetch_runs` table. The feed is as fresh as the newest of them. */
  sources: string[];
  /** Out of date when the last success is older than this. */
  staleAfterMinutes: number;
  /** The score signal that becomes "unknown" when this feed is stale, if any. */
  signal?: SignalName; // `?` means the field may be left out
};

/**
 * Every feed, in the order the banner lists them. Limits are a few missed
 * runs, so one slow fetch does not raise the banner.
 * Weather has no `signal` here: each province's and town's weather is unknown
 * when it has no reading in the last 4.5 hours (see computeScores.ts).
 */
export const FEED_RULES: FeedRule[] = [
  { id: 'earthquakes', sources: ['usgs'], staleAfterMinutes: 60, signal: 'quake' },
  // Weather is fetched every 2 hours, so one missed run passes and the second raises the banner.
  { id: 'weather', sources: ['open-meteo'], staleAfterMinutes: 270 },
  { id: 'officialAlerts', sources: ['pagasa'], staleAfterMinutes: 60 },
  { id: 'events', sources: ['gdacs'], staleAfterMinutes: 120, signal: 'event' },
  { id: 'naturalEvents', sources: ['eonet'], staleAfterMinutes: 120 },
  // JTWC is the backup for JMA, so one of the two is enough.
  { id: 'storms', sources: ['jma', 'jtwc'], staleAfterMinutes: 120 },
  { id: 'outlook', sources: ['open-meteo-daily'], staleAfterMinutes: 13 * 60 },
  { id: 'riverFlow', sources: ['open-meteo-flood'], staleAfterMinutes: 13 * 60 },
  // The heat map runs every 12 hours, so two missed runs raise the banner.
  { id: 'heatMap', sources: ['open-meteo-heat'], staleAfterMinutes: HEAT_MAP_STALE_MINUTES },
  { id: 'news', sources: ['news'], staleAfterMinutes: 60 },
];

/** A weather run is "fresh" only if at least this share of weather points answered. */
const MIN_SAVED_SHARE = 0.9;

/** True when enough of a run was saved to call the feed fresh. */
export function isFreshEnough(saved: number, total: number): boolean {
  return total > 0 && saved / total >= MIN_SAVED_SHARE;
}

/**
 * How every feed is doing. Pure: `lastOk` is fetch_runs as a lookup table
 * (source name → last success) and the clock is passed in.
 */
export function buildFeedHealth(lastOk: Map<string, Date>, now: Date): FeedHealth[] {
  return FEED_RULES.map((rule) => {
    const times = rule.sources.flatMap((source) => lastOk.get(source)?.getTime() ?? []);
    const newest = times.length > 0 ? Math.max(...times) : null;
    const isStale = newest === null || now.getTime() - newest > rule.staleAfterMinutes * MINUTE_MS;
    return { id: rule.id, lastOkAt: newest === null ? null : new Date(newest).toISOString(), isStale };
  });
}

/** The score signals that cannot be trusted because their feed is stale. */
export function staleSignals(health: FeedHealth[]): SignalName[] {
  const signals: SignalName[] = [];
  for (const rule of FEED_RULES) {
    const entry = health.find((feed) => feed.id === rule.id);
    if (rule.signal && entry?.isStale) signals.push(rule.signal);
  }
  return signals;
}

/** fetch_runs as a lookup table: source name → last success. */
async function readLastOk(): Promise<Map<string, Date>> {
  const runs = await pool.query<{ source: string; last_ok_at: Date }>(
    'SELECT source, last_ok_at FROM fetch_runs',
  );
  return new Map(runs.rows.map((row) => [row.source, row.last_ok_at]));
}

/** How every feed is doing right now. */
export async function getFeedHealth(now: Date = new Date()): Promise<FeedHealth[]> {
  return buildFeedHealth(await readLastOk(), now);
}

// ---------- The "last updated" rows on the status card ----------

/** Data is "stale" on the card when a feed's last successful fetch is older than this. */
const STALE_AFTER_MS = 60 * MINUTE_MS;

/** When the two scored, scheduled feeds last succeeded (null = never). */
export async function getLastOk(): Promise<{ earthquakes: Date | null; weather: Date | null }> {
  const lastOk = await readLastOk();
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
