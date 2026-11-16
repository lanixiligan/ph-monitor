// Fetches the 7-day outlook (daily rain and strongest wind gust) from Open-Meteo.
// Docs: https://open-meteo.com/en/docs (no key; free for non-commercial use;
// data is CC BY 4.0, so we must credit Open-Meteo).
//
// The values are MODELLED (computed by weather models), not measured.
// We ask for `timezone=Asia/Manila`, so each `day` is a Philippine calendar day.

import { z } from 'zod';
// `import type` brings in a type only; it disappears when the code runs.
import type { Point } from './openMeteo.ts';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// How many points to ask for in one request (keeps the URL a sensible length).
const POINTS_PER_REQUEST = 50;

// What the answer for one point must look like: three lists, one entry per day.
const locationSchema = z
  .object({
    daily: z.object({
      /** Calendar days like "2026-11-17". */
      time: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
      /** Total rain that day, in mm. */
      precipitation_sum: z.array(z.number().min(0).nullable()),
      /** Strongest gust that day, in km/h. */
      wind_gusts_10m_max: z.array(z.number().min(0).nullable()),
    }),
  })
  // `refine` adds a custom rule: the three lists must be the same length.
  .refine(
    (loc) =>
      loc.daily.precipitation_sum.length === loc.daily.time.length &&
      loc.daily.wind_gusts_10m_max.length === loc.daily.time.length,
    { message: 'daily lists have different lengths' },
  );

/** Rain and gusts for one day at one point, checked and ready to save. */
export type DailyWeather = {
  /** Calendar day in Philippine time, "YYYY-MM-DD". */
  day: string;
  rainMm: number | null;
  gustKmh: number | null;
};

/**
 * Checks Open-Meteo's answer for one point and turns it into a list of days.
 * Returns null (and logs why) if it fails the checks.
 */
export function parseDailyLocation(json: unknown): DailyWeather[] | null {
  const parsed = locationSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('Open-Meteo daily: skipped a location that failed the checks:', z.prettifyError(parsed.error));
    return null;
  }
  const { time, precipitation_sum, wind_gusts_10m_max } = parsed.data.daily;

  // `?? null` turns a missing entry (undefined) into null.
  return time.map((day, i) => ({
    day,
    rainMm: precipitation_sum[i] ?? null,
    gustKmh: wind_gusts_10m_max[i] ?? null,
  }));
}

/**
 * Downloads the 7-day outlook for every point.
 * The result has one entry per point, in the same order (null = failed checks).
 */
export async function fetchOpenMeteoDaily(points: Point[]): Promise<(DailyWeather[] | null)[]> {
  const results: (DailyWeather[] | null)[] = [];

  for (let start = 0; start < points.length; start += POINTS_PER_REQUEST) {
    const chunk = points.slice(start, start + POINTS_PER_REQUEST);

    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat.toFixed(4)).join(','),
      longitude: chunk.map((p) => p.lon.toFixed(4)).join(','),
      daily: 'precipitation_sum,wind_gusts_10m_max',
      forecast_days: '7',
      timezone: 'Asia/Manila',
    });

    const response = await fetch(`${OPEN_METEO_URL}?${params}`, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Open-Meteo daily request failed: HTTP ${response.status}`);
    }

    // For several points the answer is a list; for one point it is a single
    // object. Make it a list either way.
    const json: unknown = await response.json();
    const locations = Array.isArray(json) ? json : [json];
    if (locations.length !== chunk.length) {
      throw new Error(`Open-Meteo daily sent ${locations.length} answers for ${chunk.length} points`);
    }

    for (const location of locations) {
      results.push(parseDailyLocation(location));
    }
  }

  return results;
}
