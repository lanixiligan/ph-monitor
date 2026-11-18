// The heat map's data for one weather model: each town's and province's heat
// index for the current hour. Display only: it never changes the score.
// A town takes its hottest linked point (the same links the score uses); a
// province takes its hottest town. Missing is null, never a guess.

// `import type` brings in a type only; it disappears when the code runs.
import type { HeatBandName, HeatMapData, HeatModelId, HeatValue } from '@ph-monitor/shared';
import { pool } from './db.ts';
import { HEAT_MAP_STALE_MINUTES } from './freshness.ts';
import { heatBandOf } from './scoring/scoring.ts';

const HOUR_MS = 60 * 60 * 1000;

const BAND_NAMES: HeatBandName[] = ['caution', 'extreme caution', 'danger', 'extreme danger'];

/** PAGASA's band for a heat index; null below 27 °C or when the value is unknown. */
export function bandOf(heatIndexC: number | null): HeatBandName | null {
  if (heatIndexC === null) return null;
  const name = heatBandOf(heatIndexC);
  // `find` hands back the matching name, typed as a band name (or undefined).
  return BAND_NAMES.find((band) => band === name) ?? null;
}

/** The hour shown: the start of the current hour (forecasts are on whole UTC hours). */
export function hourShown(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}

/** One town's value, with the province it belongs to. */
export type TownHeat = { psgc: number; provincePsgc: number; heatIndexC: number | null };

/** Each province's hottest town. A province with no known town is null. */
export function provinceHeat(provincePsgcs: number[], towns: TownHeat[]): HeatValue[] {
  // province → its hottest known town so far.
  const hottest = new Map<number, number>();
  for (const town of towns) {
    if (town.heatIndexC === null) continue;
    const current = hottest.get(town.provincePsgc);
    if (current === undefined || town.heatIndexC > current) hottest.set(town.provincePsgc, town.heatIndexC);
  }
  return provincePsgcs.map((psgc) => {
    const heatIndexC = hottest.get(psgc) ?? null;
    return { psgc, heatIndexC, band: bandOf(heatIndexC) };
  });
}

/** Out of date when there is no good run, it is over 25 hours old, or it has no row for the hour shown. */
export function isHeatStale(fetchedAt: Date | null, hasHourShown: boolean, now: Date): boolean {
  if (fetchedAt === null || !hasHourShown) return true;
  return now.getTime() - fetchedAt.getTime() > HEAT_MAP_STALE_MINUTES * 60 * 1000;
}

/** Every town's and province's heat index from `model` for the current hour. */
export async function getHeatMap(model: HeatModelId, now: Date = new Date()): Promise<HeatMapData> {
  const hour = hourShown(now);

  // The four questions don't depend on each other, so they go to the database
  // at the same time. `Promise.all` waits for all of them and keeps their order.
  const [towns, provinces, run, stored] = await Promise.all([
    // Each town: the hottest of its linked points at this hour. `max` skips
    // missing rows, and is null when none of its points has one.
    // `<TownHeat>` tells TypeScript what each row looks like.
    pool.query<TownHeat>(
      `SELECT c.psgc, c.province_psgc AS "provincePsgc", max(f.heat_index_c) AS "heatIndexC"
       FROM places c
       LEFT JOIN place_weather_points l ON l.place_psgc = c.psgc
       LEFT JOIN heat_forecasts f ON f.point_id = l.point_id AND f.model = $1 AND f.valid_at = $2
       GROUP BY c.psgc, c.province_psgc
       ORDER BY c.psgc`,
      [model, hour],
    ),
    pool.query<{ psgc: number }>('SELECT psgc FROM provinces ORDER BY psgc'),
    pool.query<{ last_ok_at: Date }>('SELECT last_ok_at FROM heat_runs WHERE model = $1', [model]),
    // A quick lookup (the primary key starts with model), not a scan.
    pool.query<{ has: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM heat_forecasts WHERE model = $1 AND valid_at = $2) AS has',
      [model, hour],
    ),
  ]);

  // `?.` reads a field only if the row is there; `?? null` fills the gap.
  const fetchedAt = run.rows[0]?.last_ok_at ?? null;
  const hasHourShown = stored.rows[0]?.has ?? false;
  return {
    model,
    fetchedAt: fetchedAt?.toISOString() ?? null,
    isStale: isHeatStale(fetchedAt, hasHourShown, now),
    validAt: hasHourShown ? hour.toISOString() : null,
    places: towns.rows.map((town) => ({ psgc: town.psgc, heatIndexC: town.heatIndexC, band: bandOf(town.heatIndexC) })),
    provinces: provinceHeat(provinces.rows.map((row) => row.psgc), towns.rows),
  };
}
