// Fetches active tropical cyclones from the Japan Meteorological Agency (JMA)
// and checks them. JMA is our main storm source (it is the official agency
// for the Northwest Pacific). Public JSON, no key.
//
// File layout, as read from the JavaScript of JMA's own typhoon map page:
//   data/targetTc.json                    list of active storms ([] when none)
//   data/<id>/forecast.json               analysis position + forecast positions
//   data/<id>/specifications.json         category, pressure, wind for each of those
// <id> is like "TC2601". Units are converted here: wind stays in knots (JMA gives
// both m/s and kt, we read kt) and the probability-circle radius goes from
// metres to km. Positions are [latitude, longitude] pairs.
// Not seen in real data (no storm was active when this was written), so inferred
// and read tolerantly: the exact time text, number-or-text values, the title slot.

import { z } from 'zod';
import { checkStorm, toNumberOrNull } from './stormRecord.ts';
import type { StormRecord, TrackPoint } from './stormRecord.ts';

const JMA_DATA_URL = 'https://www.jma.go.jp/bosai/typhoon/data';
// JMA's own map page for storms (the data is drawn there).
const JMA_PAGE_URL = 'https://www.jma.go.jp/bosai/map.html#contents=typhoon';

// JMA gives no times for the past track points, only the order. We label them
// at 6 hour steps back from the analysis time. This is an approximation.
const PAST_STEP_MS = 6 * 60 * 60 * 1000;

// One entry of targetTc.json. Extra fields are ignored.
const targetSchema = z.object({
  tropicalCyclone: z.string().min(1),
  typhoonNumber: z.string().optional(),
});

// One time slot in forecast.json. Every field is optional on purpose: JMA
// adds a "title" slot and some slots lack a circle. Slots that are unusable
// are skipped one by one.
const forecastPartSchema = z.object({
  part: z.string().optional(),
  advancedHours: z.number().optional(),
  validtime: z.object({ JST: z.string().optional(), UTC: z.string().optional() }).optional(),
  center: z.tuple([z.number(), z.number()]).optional(),
  probabilityCircle: z.object({ radius: z.number().optional() }).nullish(),
  track: z.unknown().optional(),
});

// One slot in specifications.json (the first one is the "title" slot).
const specPartSchema = z.object({
  part: z.string().optional(),
  advancedHours: z.number().optional(),
  typhoonNumber: z.string().optional(),
  name: z.object({ en: z.string().nullish() }).nullish(),
  issue: z.object({ JST: z.string().optional(), UTC: z.string().optional() }).nullish(),
  category: z.object({ en: z.string().nullish() }).nullish(),
  pressure: z.unknown().optional(),
  maximumWind: z.object({ sustained: z.object({ kt: z.unknown().optional() }).nullish() }).nullish(),
});

type ForecastPart = z.infer<typeof forecastPartSchema>;
type SpecPart = z.infer<typeof specPartSchema>;

/** The two files JMA keeps for one storm, still unchecked. */
export type JmaStormFiles = { forecast: unknown; specifications: unknown };

// JMA's English class names, shortened to the usual codes.
const CATEGORY_CODES: Record<string, string> = {
  'tropical depression': 'TD',
  'tropical storm': 'TS',
  'severe tropical storm': 'STS',
  typhoon: 'TY',
};

/** Reads a JMA time. A time without a zone is Japan time (+09:00). */
function parseJmaTime(time: { JST?: string | undefined; UTC?: string | undefined } | null | undefined): Date | null {
  const text = time?.JST ?? time?.UTC;
  if (!text) return null;
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/.test(text);
  const zone = time?.JST ? '+09:00' : 'Z';
  const date = new Date(hasZone ? text : `${text}${zone}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Turns a JMA track ([[lat, lon], ...] or {preTyphoon, typhoon}) into a flat list. */
function trackPositions(track: unknown): Array<[number, number]> {
  const pair = z.tuple([z.number(), z.number()]);
  const list = z.array(pair);
  if (Array.isArray(track)) {
    const parsed = list.safeParse(track);
    return parsed.success ? parsed.data : [];
  }
  const object = z.object({ preTyphoon: z.unknown(), typhoon: z.unknown() }).safeParse(track);
  if (!object.success) return [];
  const before = list.safeParse(object.data.preTyphoon);
  const after = list.safeParse(object.data.typhoon);
  const joined = before.success ? [...before.data] : [];
  if (after.success) {
    // The "typhoon" part starts where "preTyphoon" ended; skip the repeated point.
    const [first, ...rest] = after.data;
    const last = joined[joined.length - 1];
    const repeated = first && last && first[0] === last[0] && first[1] === last[1];
    if (first && !repeated) joined.push(first);
    joined.push(...rest);
  }
  return joined;
}

/** Shortens "Severe Tropical Storm" to "STS"; unknown names are kept as written. */
function categoryCode(name: string | null | undefined): string | null {
  const text = name?.trim();
  if (!text) return null;
  return CATEGORY_CODES[text.toLowerCase()] ?? text;
}

// Runs `parse` on each slot of a file and keeps the ones it accepts.
function readParts<T>(file: unknown, parse: (part: unknown) => T | null, label: string): T[] {
  if (!Array.isArray(file)) {
    console.warn(`${label}: expected a list, skipped the file`);
    return [];
  }
  const parts: T[] = [];
  for (const raw of file) {
    const part = parse(raw);
    if (part) parts.push(part);
  }
  return parts;
}

/** Builds one storm from its two files. Returns null (and logs) if it is unusable. */
function buildStorm(id: string, typhoonNumber: string | undefined, target: unknown, files: JmaStormFiles): StormRecord | null {
  const label = `JMA ${id}`;
  const forecastParts = readParts<ForecastPart>(
    files.forecast,
    (raw) => {
      const parsed = forecastPartSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    label,
  );
  const specParts = readParts<SpecPart>(
    files.specifications,
    (raw) => {
      const parsed = specPartSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
    label,
  );

  const analysis = forecastParts.find((part) => part.advancedHours === 0 && part.center);
  const analysisTime = parseJmaTime(analysis?.validtime);
  if (!analysis?.center || !analysisTime) {
    console.warn(`${label}: skipped, no usable analysis position`);
    return null;
  }

  const title = specParts.find((part) => part.part === 'title') ?? specParts[0];
  const specAt = (hours: number | undefined): SpecPart | undefined =>
    specParts.find((part) => part.part !== 'title' && part.advancedHours === hours);

  const points: TrackPoint[] = [];

  // Where it has been: the track in the analysis slot, oldest first.
  const past = trackPositions(analysis.track);
  const lastPast = past[past.length - 1];
  // The last past point is usually the analysis position itself.
  if (lastPast && Math.abs(lastPast[0] - analysis.center[0]) < 0.05 && Math.abs(lastPast[1] - analysis.center[1]) < 0.05) {
    past.pop();
  }
  past.forEach(([lat, lon], index) => {
    const stepsBack = past.length - index;
    points.push({
      validAt: new Date(analysisTime.getTime() - stepsBack * PAST_STEP_MS),
      isForecast: false,
      lat,
      lon,
      pressureHpa: null,
      windKt: null,
      radiusKm: null,
    });
  });

  // Where it is now (hour 0), then the forecast slots.
  for (const part of forecastParts) {
    // Hour 1 is JMA's "estimate one hour ahead", not a real forecast point.
    if (part.part === 'title' || part.advancedHours === undefined || part.advancedHours === 1 || !part.center) continue;
    const validAt = parseJmaTime(part.validtime);
    if (!validAt) {
      console.warn(`${label}: skipped a position without a valid time`);
      continue;
    }
    const spec = specAt(part.advancedHours);
    const pressure = toNumberOrNull(spec?.pressure);
    const wind = toNumberOrNull(spec?.maximumWind?.sustained?.kt);
    const radiusM = part.probabilityCircle?.radius;
    points.push({
      validAt,
      isForecast: part.advancedHours !== 0,
      lat: part.center[0],
      lon: part.center[1],
      // JMA writes 0 when a value is unknown.
      pressureHpa: pressure && pressure > 0 ? pressure : null,
      windKt: wind && wind > 0 ? wind : null,
      radiusKm: radiusM && radiusM > 0 ? radiusM / 1000 : null,
    });
  }
  points.sort((a, b) => a.validAt.getTime() - b.validAt.getTime());

  const number = title?.typhoonNumber ?? typhoonNumber;
  const name = title?.name?.en?.trim() || (number ? `JMA ${number}` : `JMA ${id}`);

  return checkStorm(
    {
      id: `jma:${id}`,
      source: 'jma',
      name,
      category: categoryCode(title?.category?.en ?? specAt(0)?.category?.en),
      url: JMA_PAGE_URL,
      updatedAt: parseJmaTime(title?.issue) ?? analysisTime,
      raw: { target, forecast: files.forecast, specifications: files.specifications },
      track: points,
    },
    label,
  );
}

/**
 * Checks JMA's data. `targetTc` is the parsed targetTc.json and `files` holds
 * each listed storm's two files, by storm id. A storm that fails the checks
 * is skipped and logged; it is never saved. Throws if `targetTc` is not a list.
 */
export function parseJmaStorms(
  targetTc: unknown,
  files: Record<string, JmaStormFiles>,
): { storms: StormRecord[]; skipped: number } {
  // `unknown` means "we don't know the shape yet", so TypeScript forces us
  // to check it (with zod) before using it.
  const list = z.array(z.unknown()).parse(targetTc);
  const storms: StormRecord[] = [];
  let skipped = 0;

  for (const entry of list) {
    const target = targetSchema.safeParse(entry);
    if (!target.success) {
      skipped += 1;
      console.warn('JMA: skipped a listed storm that failed the checks:', z.prettifyError(target.error));
      continue;
    }
    const id = target.data.tropicalCyclone;
    const stormFiles = files[id];
    const storm = stormFiles ? buildStorm(id, target.data.typhoonNumber, entry, stormFiles) : null;
    if (!storm) {
      skipped += 1;
      continue;
    }
    storms.push(storm);
  }
  return { storms, skipped };
}

// Downloads one JSON file, giving up after 30 seconds.
async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`JMA request failed: HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

/** Downloads the active storms from JMA. Throws on network or format problems. */
export async function fetchJmaStorms(): Promise<{ storms: StormRecord[]; skipped: number }> {
  const targetTc = await fetchJson(`${JMA_DATA_URL}/targetTc.json`);
  // Bad entries are skipped later, in parseJmaStorms; here we only pick the ids.
  const ids: string[] = [];
  for (const entry of z.array(z.unknown()).parse(targetTc)) {
    const target = targetSchema.safeParse(entry);
    if (target.success) ids.push(target.data.tropicalCyclone);
  }

  const files: Record<string, JmaStormFiles> = {};
  for (const id of ids) {
    const [forecast, specifications] = await Promise.all([
      fetchJson(`${JMA_DATA_URL}/${id}/forecast.json`),
      fetchJson(`${JMA_DATA_URL}/${id}/specifications.json`),
    ]);
    files[id] = { forecast, specifications };
  }
  return parseJmaStorms(targetTc, files);
}
