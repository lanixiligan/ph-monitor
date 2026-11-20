// Fetches the next 7 days of hourly rain on the rain forecast grid, from ECMWF
// via Open-Meteo (CC BY 4.0, non-commercial). Display only: the score never
// reads this; it has its own weather fetch (openMeteo.ts).
// One variable from one model: Open-Meteo counts one call per point.

import { z } from 'zod';
// `import type` brings in a type only; it disappears when the code runs.
import type { OpenMeteoOptions, Point } from './openMeteo.ts';
import { fetchWithRetry } from './retry.ts';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** Same as the other Open-Meteo jobs: keeps the URL a sensible length. */
const POINTS_PER_REQUEST = 50;

/** The model, always named (never Open-Meteo's default blend). */
export const RAIN_MODEL = 'ecmwf_ifs';

/** Days of forecast: Open-Meteo starts at today's midnight (UTC). */
const FORECAST_DAYS = 7;

/** One point's hours: `times[i]` is the end of the hour whose rain is `mm[i]` (null = missing). */
export type RainHours = { times: Date[]; mm: (number | null)[] };

const locationSchema = z.object({
  hourly: z.object({
    time: z.array(z.number()),
    // Rain in the hour before each time, in mm; never below 0.
    precipitation: z.array(z.number().min(0).nullable()),
  }),
});

/** Checks Open-Meteo's answer for one point. Returns null (and logs why) when it fails the checks. */
export function parseRainLocation(json: unknown): RainHours | null {
  const parsed = locationSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('Open-Meteo rain: skipped a location that failed the checks:', z.prettifyError(parsed.error));
    return null;
  }
  const { time, precipitation } = parsed.data.hourly;
  if (time.length !== precipitation.length) {
    console.warn('Open-Meteo rain: skipped a location whose lists have different lengths.');
    return null;
  }
  // Only nulls: no forecast here at all.
  if (!precipitation.some((value) => value !== null)) return null;
  return { times: time.map((seconds) => new Date(seconds * 1000)), mm: precipitation };
}

/**
 * Downloads the rain hours for every point. One entry per point, in the same
 * order (null = no usable answer). Each request is tried twice; if it still
 * fails, its points are null and the others carry on. Throws only when every
 * request failed. `options` lets a test pass in a pretend `fetch`.
 */
export async function fetchOpenMeteoRain(points: Point[], options: OpenMeteoOptions = {}): Promise<(RainHours | null)[]> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const locations: (RainHours | null)[] = [];
  let requests = 0;
  const problems: string[] = [];
  const totalRequests = Math.ceil(points.length / POINTS_PER_REQUEST);

  for (let start = 0; start < points.length; start += POINTS_PER_REQUEST) {
    const chunk = points.slice(start, start + POINTS_PER_REQUEST);
    // Spread the run out, so it stays well under Open-Meteo's per-minute limit.
    if (start > 0 && options.gapMs) await new Promise((resolve) => setTimeout(resolve, options.gapMs));

    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat.toFixed(2)).join(','),
      longitude: chunk.map((p) => p.lon.toFixed(2)).join(','),
      hourly: 'precipitation',
      models: RAIN_MODEL,
      forecast_days: String(FORECAST_DAYS),
      timeformat: 'unixtime',
    });

    requests += 1;
    try {
      const response = await fetchWithRetry(
        `${OPEN_METEO_URL}?${params}`,
        () => ({ signal: AbortSignal.timeout(timeoutMs) }),
        options,
      );
      // A list for several points, a single object for one: make it a list either way.
      const json: unknown = await response.json();
      const answers = Array.isArray(json) ? json : [json];
      if (answers.length !== chunk.length) throw new Error(`${answers.length} answers for ${chunk.length} points`);
      for (const answer of answers) locations.push(parseRainLocation(answer));
      console.log(`Open-Meteo rain: request ${requests} of ${totalRequests} ok`);
    } catch (error) {
      const why = error instanceof Error ? error.message : String(error);
      problems.push(why);
      console.warn(`Open-Meteo rain: a request for ${chunk.length} points failed twice (request ${requests} of ${totalRequests}): ${why}`);
      for (let i = 0; i < chunk.length; i += 1) locations.push(null);
    }
  }

  if (requests > 0 && problems.length === requests) {
    throw new Error(`Open-Meteo rain: every request failed (${problems[0]})`);
  }
  return locations;
}
