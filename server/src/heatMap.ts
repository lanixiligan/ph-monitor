// The heat map's data for one weather model: each town's and province's heat
// index for the current hour. Display only: it never changes the score.
// A town takes its hottest linked point (the same links the score uses); a
// province takes its hottest town. Missing is null, never a guess.
// The average view averages each town's value from every model that has one.

// `import type` brings in a type only; it disappears when the code runs.
import { HEAT_MODELS } from '@ph-monitor/shared';
import type { HeatBandName, HeatMapData, HeatModelId, HeatSpread, HeatValue, HeatViewId } from '@ph-monitor/shared';
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

/**
 * One town's value, with the province it belongs to. `spread?` is only there
 * in the average view (the `?` means it may be left out).
 */
export type TownHeat = { psgc: number; provincePsgc: number; heatIndexC: number | null; spread?: HeatSpread };

/** Each province's hottest town. A province with no known town is null. */
export function provinceHeat(provincePsgcs: number[], towns: TownHeat[]): HeatValue[] {
  // province → its hottest known town so far.
  const hottest = new Map<number, TownHeat>();
  for (const town of towns) {
    if (town.heatIndexC === null) continue;
    const current = hottest.get(town.provincePsgc);
    // Only known towns are kept, so `?? -Infinity` never really applies; it satisfies TypeScript.
    if (current === undefined || town.heatIndexC > (current.heatIndexC ?? -Infinity)) hottest.set(town.provincePsgc, town);
  }
  return provincePsgcs.map((psgc) => {
    const town = hottest.get(psgc);
    const heatIndexC = town?.heatIndexC ?? null;
    const value: HeatValue = { psgc, heatIndexC, band: bandOf(heatIndexC) };
    // The average view also says how far apart the models were in that town.
    if (town?.spread !== undefined) value.spread = town.spread;
    return value;
  });
}

/** The mean of the known values (to 0.1 °C), with how many there were and their range. None known = unknown. */
export function averageHeat(values: (number | null)[]): { heatIndexC: number | null; spread?: HeatSpread } {
  // `(v): v is number` tells TypeScript the list left over has only numbers.
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return { heatIndexC: null };
  const sum = known.reduce((total, value) => total + value, 0);
  return {
    // To 0.1 °C: enough for the map, and the band is worked out from this same number.
    heatIndexC: Math.round((sum / known.length) * 10) / 10,
    spread: { used: known.length, lowC: Math.min(...known), highC: Math.max(...known) },
  };
}

/** Each town's average over the models' answers (one list per model), in the first list's order. */
export function averageTowns(perModel: TownHeat[][]): TownHeat[] {
  // One psgc → value lookup per model, so the lists need not be in the same order.
  const lookups = perModel.map((towns) => new Map(towns.map((town) => [town.psgc, town.heatIndexC])));
  return (perModel[0] ?? []).map((town) => ({
    psgc: town.psgc,
    provincePsgc: town.provincePsgc,
    ...averageHeat(lookups.map((lookup) => lookup.get(town.psgc) ?? null)),
  }));
}

/** Out of date when there is no good run, it is over 25 hours old, or it has no row for the hour shown. */
export function isHeatStale(fetchedAt: Date | null, hasHourShown: boolean, now: Date): boolean {
  if (fetchedAt === null || !hasHourShown) return true;
  return now.getTime() - fetchedAt.getTime() > HEAT_MAP_STALE_MINUTES * 60 * 1000;
}

/** One model's run: when it last succeeded, and whether it has a row for the hour shown. */
export type RunState = { fetchedAt: Date | null; hasHourShown: boolean };

/**
 * The average view's run state: its oldest source's run (so "Updated" never
 * sounds newer than the data), stale if any source is, and an hour shown if
 * any source has one.
 */
export function combineRuns(runs: RunState[], now: Date): RunState & { isStale: boolean } {
  const times = runs.flatMap((run) => (run.fetchedAt === null ? [] : [run.fetchedAt.getTime()]));
  return {
    fetchedAt: times.length === 0 ? null : new Date(Math.min(...times)),
    hasHourShown: runs.some((run) => run.hasHourShown),
    isStale: runs.some((run) => isHeatStale(run.fetchedAt, run.hasHourShown, now)),
  };
}

/** One model's towns for `hour`, and its run state. */
async function loadModel(model: HeatModelId, hour: Date): Promise<RunState & { towns: TownHeat[] }> {
  // The three questions don't depend on each other, so they go to the database
  // at the same time. `Promise.all` waits for all of them and keeps their order.
  const [towns, run, stored] = await Promise.all([
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
    pool.query<{ last_ok_at: Date }>('SELECT last_ok_at FROM heat_runs WHERE model = $1', [model]),
    // A quick lookup (the primary key starts with model), not a scan.
    pool.query<{ has: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM heat_forecasts WHERE model = $1 AND valid_at = $2) AS has',
      [model, hour],
    ),
  ]);
  // `?.` reads a field only if the row is there; `?? null` fills the gap.
  return { towns: towns.rows, fetchedAt: run.rows[0]?.last_ok_at ?? null, hasHourShown: stored.rows[0]?.has ?? false };
}

/** Every town's and province's heat index from one model (or their average) for the current hour. */
export async function getHeatMap(view: HeatViewId, now: Date = new Date()): Promise<HeatMapData> {
  const hour = hourShown(now);
  const models = view === 'average' ? HEAT_MODELS.map((model) => model.id) : [view];
  const [answers, provinces] = await Promise.all([
    Promise.all(models.map((model) => loadModel(model, hour))),
    pool.query<{ psgc: number }>('SELECT psgc FROM provinces ORDER BY psgc'),
  ]);

  const towns = view === 'average' ? averageTowns(answers.map((answer) => answer.towns)) : (answers[0]?.towns ?? []);
  const run = combineRuns(answers, now);
  return {
    model: view,
    fetchedAt: run.fetchedAt?.toISOString() ?? null,
    isStale: run.isStale,
    validAt: run.hasHourShown ? hour.toISOString() : null,
    places: towns.map((town) => {
      const value: HeatValue = { psgc: town.psgc, heatIndexC: town.heatIndexC, band: bandOf(town.heatIndexC) };
      if (town.spread !== undefined) value.spread = town.spread;
      return value;
    }),
    provinces: provinceHeat(provinces.rows.map((row) => row.psgc), towns),
  };
}
