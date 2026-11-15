// THE scoring file: every weight and formula that turns raw events into the
// 0–100 score lives here, and nothing else does.
//
// All functions are "pure": same input, same output, no database, no clock.
// That makes them easy to test (see test/scoring.test.ts) and safe to tune.
// How it all fits together is explained in METHODOLOGY.md.

/** Every number you might want to tune. These are starting guesses. */
export const WEIGHTS = {
  quake: {
    /** Smaller quakes are ignored. */
    minMagnitude: 4.0,
    /** A quake reaches provinces within radiusBaseKm × 2^(magnitude − 4)... */
    radiusBaseKm: 50,
    /** ...but never further than this. */
    radiusMaxKm: 400,
  },
};

/**
 * How far a quake of this magnitude reaches, in km.
 * M4 → 50, M5 → 100, M6 → 200, M7 and above → 400.
 */
export function radiusKm(magnitude: number): number {
  const q = WEIGHTS.quake;
  const radius = q.radiusBaseKm * 2 ** (magnitude - 4);
  return Math.min(radius, q.radiusMaxKm);
}
