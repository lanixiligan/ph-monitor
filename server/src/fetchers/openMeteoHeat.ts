// Fetches six days of temperature and humidity for the heat map, from
// several weather models in one request (Open-Meteo, CC BY 4.0, non-commercial).
// Display only: the score never reads this; it has its own fetch (openMeteo.ts).
//
// Open-Meteo counts one call per point as long as variables × models stays at
// 10 or under, so 2 variables × 3 models cost the same as one model.

import { z } from 'zod';
// `import type` brings in a type only; it disappears when the code runs.
import type { HeatModelId } from '@ph-monitor/shared';
import type { OpenMeteoOptions, Point } from './openMeteo.ts';
import { fetchWithRetry } from './retry.ts';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/** Same as the weather job: keeps the URL a sensible length. */
const POINTS_PER_REQUEST = 50;

/** Hours ahead: 6 days, so the Heat view's time bar reaches day 6 at 5 PM. */
export const FORECAST_HOURS = 144;

/**
 * Hours back from the current hour. 16 always reaches today's 8 AM
 * Philippine time (at 11 PM, 16 hours back starts at 7 AM, so 8 AM is always
 * inside), so the bar's earlier hours of today stay available.
 */
export const PAST_HOURS = 16;

/** One model's hours at one point; null = no value for that hour. */
export type HeatHours = { tempC: (number | null)[]; humidityPct: (number | null)[] };

/** One point's hours (16 past, 144 ahead). A model is left out when it sent no hour with both values (for example, only nulls). */
export type HeatLocation = {
  times: Date[];
  // `Partial<Record<K, V>>` = an object that may have any of the keys K.
  models: Partial<Record<HeatModelId, HeatHours>>;
};

/** One hourly list: a value per hour, or null. */
const valuesSchema = z.array(z.number().nullable()).optional();
const humiditySchema = z.array(z.number().min(0).max(100).nullable()).optional();

/**
 * The two list names for a model. With several models Open-Meteo adds the
 * model to each name (`temperature_2m_ecmwf_ifs`); with one it may not.
 */
function listNames(model: HeatModelId, onlyModel: boolean): { temp: string[]; humidity: string[] } {
  const suffixed = { temp: [`temperature_2m_${model}`], humidity: [`relative_humidity_2m_${model}`] };
  if (!onlyModel) return suffixed;
  return { temp: [...suffixed.temp, 'temperature_2m'], humidity: [...suffixed.humidity, 'relative_humidity_2m'] };
}

/** What one location must look like, for the models asked for. Built per call. */
function locationSchema(models: HeatModelId[]) {
  // list name → its check. Every list may be missing: a model can be left out.
  // `typeof valuesSchema` = "the same kind of check as valuesSchema".
  const lists: Record<string, typeof valuesSchema> = {};
  for (const model of models) {
    const names = listNames(model, models.length === 1);
    for (const name of names.temp) lists[name] = valuesSchema;
    for (const name of names.humidity) lists[name] = humiditySchema;
  }
  return z.object({
    // `.and` = both checks must pass: the hours, and the lists.
    hourly: z.object({ time: z.array(z.number()) }).and(z.object(lists)),
  });
}

/** The first of `names` that is in `hourly`. */
function pick(hourly: Record<string, (number | null)[] | undefined>, names: string[]): (number | null)[] | undefined {
  for (const name of names) {
    const values = hourly[name];
    if (values !== undefined) return values;
  }
  return undefined;
}

/**
 * Checks Open-Meteo's answer for one point. Returns null (and logs why) when
 * it fails the checks; a model with no usable hour is left out.
 */
export function parseHeatLocation(json: unknown, models: HeatModelId[]): HeatLocation | null {
  const parsed = locationSchema(models).safeParse(json);
  if (!parsed.success) {
    console.warn('Open-Meteo heat: skipped a location that failed the checks:', z.prettifyError(parsed.error));
    return null;
  }
  const hourly = parsed.data.hourly;
  const location: HeatLocation = { times: hourly.time.map((seconds) => new Date(seconds * 1000)), models: {} };

  for (const model of models) {
    const names = listNames(model, models.length === 1);
    const tempC = pick(hourly, names.temp);
    const humidityPct = pick(hourly, names.humidity);
    if (tempC === undefined || humidityPct === undefined) continue;
    if (tempC.length !== hourly.time.length || humidityPct.length !== hourly.time.length) {
      console.warn(`Open-Meteo heat: skipped a location whose ${model} lists have different lengths.`);
      return null;
    }
    // Only nulls (or never both values in the same hour): no data from this model here.
    const usable = tempC.some((temp, i) => temp !== null && (humidityPct[i] ?? null) !== null);
    if (usable) location.models[model] = { tempC, humidityPct };
  }
  return location;
}

/**
 * Downloads the heat map hours for every point, all `models` in one request.
 * The result has one entry per point, in the same order (null = no usable
 * answer). Each request is tried twice; if it still fails, its points are
 * null and the other requests carry on. Throws only when every request failed.
 * `options` lets a test pass in a pretend `fetch`, and sets the gap between requests.
 */
export async function fetchOpenMeteoHeat(
  points: Point[],
  models: HeatModelId[],
  options: OpenMeteoOptions = {},
): Promise<(HeatLocation | null)[]> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const locations: (HeatLocation | null)[] = [];
  let requests = 0;
  const problems: string[] = [];
  const totalRequests = Math.ceil(points.length / POINTS_PER_REQUEST);

  for (let start = 0; start < points.length; start += POINTS_PER_REQUEST) {
    const chunk = points.slice(start, start + POINTS_PER_REQUEST);
    // Spread the run out, so it stays well under Open-Meteo's per-minute limit.
    if (start > 0 && options.gapMs) await new Promise((resolve) => setTimeout(resolve, options.gapMs));

    const params = new URLSearchParams({
      latitude: chunk.map((p) => p.lat.toFixed(4)).join(','),
      longitude: chunk.map((p) => p.lon.toFixed(4)).join(','),
      hourly: 'temperature_2m,relative_humidity_2m',
      // Always named, never Open-Meteo's default blend.
      models: models.join(','),
      past_hours: String(PAST_HOURS),
      forecast_hours: String(FORECAST_HOURS),
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
      if (answers.length !== chunk.length) {
        throw new Error(`${answers.length} answers for ${chunk.length} points`);
      }
      for (const answer of answers) locations.push(parseHeatLocation(answer, models));
      console.log(`Open-Meteo heat: request ${requests} of ${totalRequests} ok`);
    } catch (error) {
      // This request is lost; its points get "no answer" and the rest go on.
      const why = error instanceof Error ? error.message : String(error);
      problems.push(why);
      console.warn(`Open-Meteo heat: a request for ${chunk.length} points failed twice (request ${requests} of ${totalRequests}): ${why}`);
      for (let i = 0; i < chunk.length; i += 1) locations.push(null);
    }
  }

  if (requests > 0 && problems.length === requests) {
    throw new Error(`Open-Meteo heat: every request failed (${problems[0]})`);
  }
  return locations;
}
