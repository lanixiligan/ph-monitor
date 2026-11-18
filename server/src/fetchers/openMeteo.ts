// Fetches the latest weather for a list of points from Open-Meteo and checks it.
// Docs: https://open-meteo.com/en/docs (no key; free for non-commercial use;
// data is CC BY 4.0, so we must credit Open-Meteo).
//
// The values are MODELLED (computed by weather models), not measured by a
// station. Each value is valid for a specific hour, which we keep as `validAt`.

import { z } from 'zod';
import { fetchWithRetry } from './retry.ts';
import type { RetryOptions } from './retry.ts';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

// How many points to ask for in one request (keeps the URL a sensible length).
const POINTS_PER_REQUEST = 50;

// What the answer for one point must look like: four lists, one entry per hour.
const locationSchema = z
  .object({
    hourly: z.object({
      /** Seconds since 1970 (we ask for `timeformat=unixtime`). */
      time: z.array(z.number()),
      temperature_2m: z.array(z.number().nullable()),
      relative_humidity_2m: z.array(z.number().min(0).max(100).nullable()),
      /** Rain in the hour BEFORE each time, in mm. */
      precipitation: z.array(z.number().min(0).nullable()),
    }),
  })
  // `refine` adds a custom rule: the four lists must be the same length.
  .refine(
    (loc) =>
      loc.hourly.temperature_2m.length === loc.hourly.time.length &&
      loc.hourly.relative_humidity_2m.length === loc.hourly.time.length &&
      loc.hourly.precipitation.length === loc.hourly.time.length,
    { message: 'hourly lists have different lengths' },
  );

/** The weather at one point, checked and ready to save. */
export type WeatherReading = {
  /** The hour these modelled values are valid for. */
  validAt: Date;
  tempC: number | null;
  humidityPct: number | null;
  rain1hMm: number | null;
  rain24hMm: number | null;
};

export type Point = { lat: number; lon: number };

/**
 * Checks Open-Meteo's answer for one point and picks out the latest hour
 * that is not in the future. Returns null (and logs why) if it fails the checks.
 */
export function parseOpenMeteoLocation(json: unknown, now: Date): WeatherReading | null {
  const parsed = locationSchema.safeParse(json);
  if (!parsed.success) {
    console.warn('Open-Meteo: skipped a location that failed the checks:', z.prettifyError(parsed.error));
    return null;
  }
  const { time, temperature_2m, relative_humidity_2m, precipitation } = parsed.data.hourly;

  // Find the last hour that has already started.
  const nowSeconds = now.getTime() / 1000;
  let latest = -1;
  for (let i = 0; i < time.length; i++) {
    // `time[i]` could be undefined as far as TypeScript knows, hence `?? Infinity`.
    if ((time[i] ?? Infinity) <= nowSeconds) latest = i;
  }
  const validAtSeconds = time[latest];
  if (validAtSeconds === undefined) {
    console.warn('Open-Meteo: skipped a location with no past hours.');
    return null;
  }

  // Rain over the last 24 hours = the last 24 hourly amounts added up.
  // If any hour is missing we say "unknown" (null) instead of guessing.
  const last24 = precipitation.slice(Math.max(0, latest - 23), latest + 1);
  let rain24hMm: number | null = 0;
  for (const amount of last24) {
    if (amount === null || rain24hMm === null) {
      rain24hMm = null;
    } else {
      rain24hMm += amount;
    }
  }
  if (last24.length < 24) rain24hMm = null;

  return {
    validAt: new Date(validAtSeconds * 1000),
    tempC: temperature_2m[latest] ?? null,
    humidityPct: relative_humidity_2m[latest] ?? null,
    rain1hMm: precipitation[latest] ?? null,
    rain24hMm: rain24hMm === null ? null : Math.round(rain24hMm * 10) / 10,
  };
}

/**
 * Downloads the weather for every point.
 * The result has one entry per point, in the same order (null = no usable
 * answer). Each request is tried twice; if it still fails, its points are
 * null and the other requests carry on. Throws only when every request failed.
 * `options` lets a test pass in a pretend `fetch`.
 */
/**
 * Retry settings, plus how long one try may take (default 30 seconds) and how
 * long to wait between two requests (default none).
 */
// `RetryOptions & { ... }` means "everything in RetryOptions, plus these fields".
export type OpenMeteoOptions = RetryOptions & { timeoutMs?: number; gapMs?: number };

export async function fetchOpenMeteo(
  points: Point[],
  options: OpenMeteoOptions = {},
): Promise<(WeatherReading | null)[]> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const now = new Date();
  const readings: (WeatherReading | null)[] = [];
  let requests = 0;
  const problems: string[] = [];
  // A big run (the weather grid) prints one line per request so it does not look stuck.
  const totalRequests = Math.ceil(points.length / POINTS_PER_REQUEST);
  const showProgress = totalRequests > 1;

  for (let start = 0; start < points.length; start += POINTS_PER_REQUEST) {
    const chunk = points.slice(start, start + POINTS_PER_REQUEST);
    // Spread a big run out, so it stays well under Open-Meteo's per-minute limit.
    if (start > 0 && options.gapMs) await new Promise((resolve) => setTimeout(resolve, options.gapMs));

    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat.toFixed(4)).join(','),
      longitude: chunk.map((p) => p.lon.toFixed(4)).join(','),
      hourly: 'temperature_2m,relative_humidity_2m,precipitation',
      past_hours: '24',
      forecast_hours: '1',
      timeformat: 'unixtime',
    });

    requests += 1;
    try {
      // Give up on each try after `timeoutMs` instead of waiting forever.
      const response = await fetchWithRetry(
        `${OPEN_METEO_URL}?${params}`,
        () => ({ signal: AbortSignal.timeout(timeoutMs) }),
        options,
      );

      // For several points the answer is a list; for one point it is a single
      // object. Make it a list either way.
      const json: unknown = await response.json();
      const locations = Array.isArray(json) ? json : [json];
      if (locations.length !== chunk.length) {
        throw new Error(`${locations.length} answers for ${chunk.length} points`);
      }
      for (const location of locations) {
        readings.push(parseOpenMeteoLocation(location, now));
      }
      if (showProgress) console.log(`Open-Meteo: request ${requests} of ${totalRequests} ok`);
    } catch (error) {
      // This request is lost; its points get "no answer" and the rest go on.
      const why = error instanceof Error ? error.message : String(error);
      problems.push(why);
      const which = showProgress ? ` (request ${requests} of ${totalRequests})` : '';
      console.warn(`Open-Meteo: a request for ${chunk.length} points failed twice${which}: ${why}`);
      for (let i = 0; i < chunk.length; i += 1) readings.push(null);
    }
  }

  if (requests > 0 && problems.length === requests) {
    throw new Error(`Open-Meteo: every request failed (${problems[0]})`);
  }
  return readings;
}
