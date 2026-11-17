// Helpers for sampling the weather at more than one point in a big province.
// One point cannot stand for Palawan (650 km long); a few well-spread points
// get much closer. Pure functions: no network, no database.

import type { Point, WeatherReading } from './fetchers/openMeteo.ts';
import { heatIndexC } from './heatIndex.ts';

/** At most this many extra points per province. */
export const MAX_EXTRA_POINTS = 2;
/** An extra point must be at least this far from every point already picked. */
export const MIN_SPACING_KM = 40;

const EARTH_RADIUS_KM = 6371;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance between two points on the round Earth, in km (the haversine formula). */
export function distanceKm(a: Point, b: Point): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Picks extra weather points for a province. `first` is the point it already
 * has; `candidates` are places inside it (one per city or municipality).
 * Each round takes the candidate furthest from everything picked so far, and
 * stops when that is closer than MIN_SPACING_KM. A small province gets none.
 */
export function pickExtraPoints(first: Point, candidates: Point[]): Point[] {
  const picked = [first];
  const extras: Point[] = [];

  while (extras.length < MAX_EXTRA_POINTS) {
    let best: Point | null = null;
    let bestDistance = MIN_SPACING_KM;
    for (const candidate of candidates) {
      // How far this candidate is from the nearest point already picked.
      const nearest = Math.min(...picked.map((point) => distanceKm(point, candidate)));
      if (nearest >= bestDistance) {
        best = candidate;
        bestDistance = nearest;
      }
    }
    if (best === null) break;
    picked.push(best);
    extras.push(best);
  }
  return extras;
}

/**
 * One reading that stands for a whole province: the most rain seen at any of
 * its points (last hour, and last 24 hours) and the temperature and humidity
 * of its hottest-feeling point. Missing values never beat real ones.
 * Returns null when no point gave a reading.
 */
export function worstReading(readings: (WeatherReading | null)[]): WeatherReading | null {
  // `(r): r is WeatherReading` tells TypeScript the filter removes the nulls.
  const real = readings.filter((r): r is WeatherReading => r !== null);
  const first = real[0];
  if (!first) return null;

  // The largest of the values that are not null; null if every one is null.
  const most = (values: (number | null)[]): number | null => {
    const known = values.filter((value): value is number => value !== null);
    return known.length > 0 ? Math.max(...known) : null;
  };

  // The hottest-feeling point: highest heat index (needs both temperature and humidity).
  let hottest: WeatherReading | null = null;
  let hottestIndex = -Infinity;
  for (const reading of real) {
    if (reading.tempC === null || reading.humidityPct === null) continue;
    const index = heatIndexC(reading.tempC, reading.humidityPct);
    if (index > hottestIndex) {
      hottest = reading;
      hottestIndex = index;
    }
  }

  return {
    // The newest hour any point reported.
    validAt: new Date(Math.max(...real.map((reading) => reading.validAt.getTime()))),
    tempC: hottest?.tempC ?? most(real.map((reading) => reading.tempC)),
    humidityPct: hottest?.humidityPct ?? most(real.map((reading) => reading.humidityPct)),
    rain1hMm: most(real.map((reading) => reading.rain1hMm)),
    rain24hMm: most(real.map((reading) => reading.rain24hMm)),
  };
}
