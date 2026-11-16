// Fetches the 7-day river discharge outlook from the Open-Meteo flood API.
// Docs: https://open-meteo.com/en/docs/flood-api (GloFAS model; no key; free
// for non-commercial use; CC BY 4.0, so we must credit Open-Meteo).
//
// Discharge is in m³/s and MODELLED on a coarse grid (about 5 km). Many points
// are not near a river, so null values are normal.

import { z } from 'zod';
// `import type` brings in a type only; it disappears when the code runs.
import type { Point } from './openMeteo.ts';

const FLOOD_URL = 'https://flood-api.open-meteo.com/v1/flood';

// How many points to ask for in one request (keeps the URL a sensible length).
const POINTS_PER_REQUEST = 50;

// What the answer for one point must look like: two lists, one entry per day.
const locationSchema = z
  .object({
    daily: z.object({
      /** Calendar days like "2026-11-17". */
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
      /** River flow in m³/s. */
      river_discharge: z.array(z.number().min(0).nullable()),
    }),
  })
  // `refine` adds a custom rule: the two lists must be the same length.
  .refine((loc) => loc.daily.river_discharge.length === loc.daily.time.length, {
    message: 'daily lists have different lengths',
  });

/** River discharge for one day at one point, checked and ready to save. */
export type FloodDay = {
  /** Calendar day in Philippine time, "YYYY-MM-DD". */
  day: string;
  riverDischargeM3s: number | null;
};

/**
 * Checks the flood API's answer for one point and turns it into a list of days.
 * Returns null (and logs why) if it fails the checks.
 */
export function parseFloodLocation(json: unknown): FloodDay[] | null {
  const parsed = locationSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('Open-Meteo flood: skipped a location that failed the checks:', z.prettifyError(parsed.error));
    return null;
  }
  const { time, river_discharge } = parsed.data.daily;

  // `?? null` turns a missing entry (undefined) into null.
  return time.map((day, i) => ({ day, riverDischargeM3s: river_discharge[i] ?? null }));
}

/**
 * Downloads the river discharge outlook for every point.
 * The result has one entry per point, in the same order (null = failed checks).
 */
export async function fetchOpenMeteoFlood(points: Point[]): Promise<(FloodDay[] | null)[]> {
  const results: (FloodDay[] | null)[] = [];

  for (let start = 0; start < points.length; start += POINTS_PER_REQUEST) {
    const chunk = points.slice(start, start + POINTS_PER_REQUEST);

    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat.toFixed(4)).join(','),
      longitude: chunk.map((p) => p.lon.toFixed(4)).join(','),
      daily: 'river_discharge',
      forecast_days: '7',
      timezone: 'Asia/Manila',
    });

    const response = await fetch(`${FLOOD_URL}?${params}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo flood request failed: HTTP ${response.status}`);
    }

    // For several points the answer is a list; for one point it is a single
    // object. Make it a list either way.
    const json: unknown = await response.json();
    const locations = Array.isArray(json) ? json : [json];
    if (locations.length !== chunk.length) {
      throw new Error(`Open-Meteo flood sent ${locations.length} answers for ${chunk.length} points`);
    }

    for (const location of locations) {
      results.push(parseFloodLocation(location));
    }
  }

  return results;
}
