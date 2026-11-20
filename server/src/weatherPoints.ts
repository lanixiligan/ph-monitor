// Helpers for the weather grid. Weather is fetched at a few hundred points
// (a grid over the land, plus each province's own point); every city and
// municipality takes its reading from the points it is linked to.
// Pure functions: no network, no database.

import type { WeatherReading } from './fetchers/openMeteo.ts';
import { heatIndexC } from './heatIndex.ts';

/** Grid spacing in degrees. 0.25° is about 28 km. */
export const GRID_DEGREES = 0.25;
/** A grid cell gets a point only if at least this share of it is land. */
export const MIN_LAND_SHARE = 0.25;
/** A town further than this from every point gets a point of its own. */
export const OWN_POINT_KM = 30;

/**
 * How `npm run weather-points` empties the old points before building new ones.
 * RESTART IDENTITY numbers new points from 1 again. CASCADE also empties the
 * tables that point at weather_points: point_readings (the weather job refills
 * it within about 3 hours) and heat_forecasts (see CLEAR_HEAT_RUNS_SQL).
 */
export const CLEAR_WEATHER_POINTS_SQL = 'TRUNCATE place_weather_points, weather_points RESTART IDENTITY CASCADE';

/**
 * Run right after CLEAR_WEATHER_POINTS_SQL: the heat map's rows are gone, so its
 * run records go too. The panel then says "no data yet" (not "updated 1 hour
 * ago"), and the heat job is due at the next hourly tick instead of up to 12
 * hours later. PAGASA's run record stays: its forecast is not tied to the weather points.
 * (Several statements in one text: allowed when it has no $1 values.)
 */
export const CLEAR_HEAT_RUNS_SQL =
  "DELETE FROM heat_runs WHERE model <> 'pagasa'; DELETE FROM fetch_runs WHERE source = 'open-meteo-heat'; DELETE FROM job_tries WHERE job = 'heatMap'";

/** Which points a town reads its weather from. */
export type TownPoints = { use: 'inside' | 'nearest' | 'own'; ids: number[] };

/**
 * The rule for one town. `inside` are the ids of the points inside it;
 * `nearest` is the closest point and how far it is (null if there are none).
 * Points inside win; otherwise the nearest one, if it is close enough;
 * otherwise the town needs a point of its own (added by the caller).
 */
export function townPoints(inside: number[], nearest: { id: number; km: number } | null): TownPoints {
  if (inside.length > 0) return { use: 'inside', ids: inside };
  if (nearest !== null && nearest.km <= OWN_POINT_KM) return { use: 'nearest', ids: [nearest.id] };
  return { use: 'own', ids: [] };
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

/** One link: a province or town (`owner`) reads its weather from this point. */
export type PointLink = { owner: number; pointId: number };

/**
 * The worst reading for each owner (a province or a town), from the readings
 * of the points it is linked to. An owner whose points all gave nothing is
 * left out, so the caller sees it as "no reading".
 */
export function worstByOwner(
  links: PointLink[],
  readings: Map<number, WeatherReading | null>,
): Map<number, WeatherReading> {
  // Gather each owner's readings first: owner → its readings.
  const byOwner = new Map<number, (WeatherReading | null)[]>();
  for (const link of links) {
    const list = byOwner.get(link.owner) ?? [];
    list.push(readings.get(link.pointId) ?? null);
    byOwner.set(link.owner, list);
  }
  const result = new Map<number, WeatherReading>();
  for (const [owner, list] of byOwner) {
    const worst = worstReading(list);
    if (worst) result.set(owner, worst);
  }
  return result;
}
