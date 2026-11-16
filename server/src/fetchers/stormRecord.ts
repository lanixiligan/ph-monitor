// The checked storm shape shared by the JMA and JTWC fetchers.
// Units are fixed here: wind in knots, radius in km, positions in degrees.

import { z } from 'zod';

// One position of a storm.
const trackPointSchema = z.object({
  validAt: z.date(),
  isForecast: z.boolean(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  pressureHpa: z.number().positive().nullable(),
  windKt: z.number().min(0).nullable(),
  radiusKm: z.number().min(0).nullable(),
});

const stormRecordSchema = z.object({
  id: z.string().min(1),
  source: z.enum(['jma', 'jtwc']),
  name: z.string().min(1),
  category: z.string().nullable(),
  url: z.string().nullable(),
  updatedAt: z.date(),
  raw: z.unknown(),
  track: z.array(trackPointSchema),
});

/**
 * One position of a storm, checked and ready to save. `z.infer` makes
 * TypeScript read the type straight from the zod schema above, so the two
 * can never disagree.
 */
export type TrackPoint = z.infer<typeof trackPointSchema>;

/** One storm, checked and ready to save. */
export type StormRecord = z.infer<typeof stormRecordSchema>;

/** Checks a finished storm. Returns it, or null (and logs why) if it is bad. */
export function checkStorm(candidate: unknown, label: string): StormRecord | null {
  const parsed = stormRecordSchema.safeParse(candidate);
  if (!parsed.success) {
    console.warn(`${label}: skipped a storm that failed the checks:`, z.prettifyError(parsed.error));
    return null;
  }
  // Two positions with the same time and kind would clash in the database.
  const seen = new Set<string>();
  const track = parsed.data.track.filter((point) => {
    const key = `${point.validAt.getTime()}:${point.isForecast}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...parsed.data, track };
}

/** A number from a value that may arrive as text. Anything else gives null. */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
