// The Earthquake map view: the quakes the score counts right now (same time
// window and minimum magnitude as the score), plus how fresh the USGS feed is.
// Display only: it reads the earthquakes table and never changes the score.

// `import type` brings in types only; they vanish when the code runs.
import type { FeedHealth, QuakeMap, QuakePoint } from '@ph-monitor/shared';
import { pool } from './db.ts';
import { getFeedHealth } from './freshness.ts';
import { WEIGHTS } from './scoring/scoring.ts';

const HOUR_MS = 60 * 60 * 1000;

/** One row of the query below. */
export type QuakeRow = {
  id: string;
  magnitude: number;
  depth_km: number | null;
  place: string | null;
  occurred_at: Date;
  url: string | null;
  lat: number;
  lon: number;
};

/** The link only if it is a web address (http or https); anything else becomes null. */
export function webUrlOrNull(url: string | null): string | null {
  if (url === null) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

export function toQuakePoint(row: QuakeRow): QuakePoint {
  return {
    id: row.id,
    magnitude: row.magnitude,
    depthKm: row.depth_km,
    place: row.place,
    occurredAt: row.occurred_at.toISOString(),
    url: webUrlOrNull(row.url),
    lat: row.lat,
    lon: row.lon,
  };
}

/**
 * The answer for GET /api/quakes. Pure: the rows and the feed health are passed in.
 * A feed missing from the health list counts as never fetched (stale), never as calm.
 */
export function buildQuakeMap(rows: QuakeRow[], health: FeedHealth[]): QuakeMap {
  const feed = health.find((entry) => entry.id === 'earthquakes');
  // `?.` reads a field only if the entry exists; `??` gives the fallback when it does not.
  return {
    windowHours: WEIGHTS.quake.windowHours,
    fetchedAt: feed?.lastOkAt ?? null,
    isStale: feed?.isStale ?? true,
    quakes: rows.map(toQuakePoint),
  };
}

/** Reads the quakes inside the score's window, newest first, and the feed's freshness. */
// `now: Date = new Date()`: the time used when the caller gives none (tests pass their own).
// `Promise<QuakeMap>`: the answer arrives later (after the database replies).
export async function getQuakeMap(now: Date = new Date()): Promise<QuakeMap> {
  // The same two rules as the score's own quake queries (computeScores, townInputs).
  // ST_Y is the latitude, ST_X the longitude. `<QuakeRow>` tells TypeScript the shape of each row.
  const result = await pool.query<QuakeRow>(
    `SELECT id, magnitude, depth_km, place, occurred_at, url, ST_Y(geom) AS lat, ST_X(geom) AS lon
     FROM earthquakes
     WHERE occurred_at >= $1 AND magnitude >= $2
     ORDER BY occurred_at DESC, id`,
    [new Date(now.getTime() - WEIGHTS.quake.windowHours * HOUR_MS), WEIGHTS.quake.minMagnitude],
  );
  return buildQuakeMap(result.rows, await getFeedHealth(now));
}
