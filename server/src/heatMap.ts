// The heat map's data for one source (a weather model or PAGASA): each town's
// and province's heat index for one bar hour. Display only: it never changes the score.
// A town takes its hottest linked point (the same links the score uses); a
// province takes its hottest town. Missing is null, never a guess.
// The average view averages each town's value from every model that has one.

// `import type` brings in a type only; it disappears when the code runs.
import { HEAT_MODELS, barTimes, phDate } from '@ph-monitor/shared';
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

/** Out of date when there is no good run or it is over 25 hours old. (Which hour is shown does not matter.) */
export function isHeatStale(fetchedAt: Date | null, now: Date): boolean {
  if (fetchedAt === null) return true;
  return now.getTime() - fetchedAt.getTime() > HEAT_MAP_STALE_MINUTES * 60 * 1000;
}

/** One source's run: when it last succeeded (null = never). */
export type RunState = { fetchedAt: Date | null };

/**
 * The average view's run state: its oldest source's run (so "Updated" never
 * sounds newer than the data), stale if any source is.
 */
export function combineRuns(runs: RunState[], now: Date): RunState & { isStale: boolean } {
  const times = runs.flatMap((run) => (run.fetchedAt === null ? [] : [run.fetchedAt.getTime()]));
  return {
    fetchedAt: times.length === 0 ? null : new Date(Math.min(...times)),
    isStale: runs.some((run) => isHeatStale(run.fetchedAt, now)),
  };
}

/** Every bar time as an ISO string, for asking the database which ones have rows. */
function barIsoTimes(now: Date): string[] {
  return barTimes(now).map((time) => time.toISOString());
}

/** One source's answer for the hour asked: its towns, run, whether `at` has rows, and the bar hours it has. */
type SourceAnswer = RunState & { towns: TownHeat[]; hasAt: boolean; hours: string[] };

/** One model's towns for `at`, and its run state. */
async function loadModel(model: HeatModelId, at: Date, now: Date): Promise<SourceAnswer> {
  // The questions don't depend on each other, so they go to the database
  // at the same time. `Promise.all` waits for all of them and keeps their order.
  const [towns, run, stored, atRows] = await Promise.all([
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
      [model, at],
    ),
    pool.query<{ last_ok_at: Date }>('SELECT last_ok_at FROM heat_runs WHERE model = $1', [model]),
    // The bar hours this model has rows for (the primary key starts with model).
    pool.query<{ valid_at: Date }>(
      'SELECT DISTINCT valid_at FROM heat_forecasts WHERE model = $1 AND valid_at = ANY($2::timestamptz[]) ORDER BY valid_at',
      [model, barIsoTimes(now)],
    ),
    // Does the model have any row at exactly `at`? (`at` may not be a bar time.)
    pool.query<{ has: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM heat_forecasts WHERE model = $1 AND valid_at = $2) AS has',
      [model, at],
    ),
  ]);
  const hours = stored.rows.map((row) => row.valid_at.toISOString());
  // `?.` reads a field only if the row is there; `?? null` fills the gap.
  return { towns: towns.rows, fetchedAt: run.rows[0]?.last_ok_at ?? null, hasAt: atRows.rows[0]?.has ?? false, hours };
}

/** PAGASA's towns for `at`: each town takes the newest issuance that has a row for it. */
async function loadPagasa(at: Date, now: Date): Promise<SourceAnswer & { isStale: boolean }> {
  const [towns, run, stored, newest] = await Promise.all([
    // The subquery picks, per town, the newest issued_on that has a row at `at`.
    pool.query<TownHeat>(
      `SELECT c.psgc, c.province_psgc AS "provincePsgc",
              (SELECT p.heat_index_c FROM pagasa_heat p
               WHERE p.psgc = c.psgc AND p.valid_at = $1
               ORDER BY p.issued_on DESC LIMIT 1) AS "heatIndexC"
       FROM places c
       ORDER BY c.psgc`,
      [at],
    ),
    pool.query<{ last_ok_at: Date }>("SELECT last_ok_at FROM heat_runs WHERE model = 'pagasa'"),
    pool.query<{ valid_at: Date }>(
      'SELECT DISTINCT valid_at FROM pagasa_heat WHERE valid_at = ANY($1::timestamptz[]) ORDER BY valid_at',
      [barIsoTimes(now)],
    ),
    pool.query<{ newest: string | null; has: boolean }>(
      `SELECT to_char(max(issued_on), 'YYYY-MM-DD') AS newest,
              coalesce(bool_or(valid_at = $1), false) AS has
       FROM pagasa_heat`,
      [at],
    ),
  ]);
  const fetchedAt = run.rows[0]?.last_ok_at ?? null;
  const newestIssue = newest.rows[0]?.newest ?? null;
  // Also stale when the newest issuance is older than today (PH date); 'YYYY-MM-DD' text compares in date order.
  const isStale = isHeatStale(fetchedAt, now) || newestIssue === null || newestIssue < phDate(now);
  return {
    towns: towns.rows,
    fetchedAt,
    hasAt: newest.rows[0]?.has ?? false,
    hours: stored.rows.map((row) => row.valid_at.toISOString()),
    isStale,
  };
}

/** Every town's and province's heat index from one source (or the models' average) at the bar time `at`. */
export async function getHeatMap(view: HeatViewId, at: Date, now: Date = new Date()): Promise<HeatMapData> {
  const provinces = await pool.query<{ psgc: number }>('SELECT psgc FROM provinces ORDER BY psgc');
  const provincePsgcs = provinces.rows.map((row) => row.psgc);
  const toValue = (town: TownHeat): HeatValue => {
    const value: HeatValue = { psgc: town.psgc, heatIndexC: town.heatIndexC, band: bandOf(town.heatIndexC) };
    if (town.spread !== undefined) value.spread = town.spread;
    return value;
  };

  if (view === 'pagasa') {
    const answer = await loadPagasa(at, now);
    return {
      model: view,
      fetchedAt: answer.fetchedAt?.toISOString() ?? null,
      isStale: answer.isStale,
      validAt: answer.hasAt ? at.toISOString() : null,
      hours: answer.hours,
      places: answer.towns.map(toValue),
      provinces: provinceHeat(provincePsgcs, answer.towns),
    };
  }

  const models = view === 'average' ? HEAT_MODELS.map((model) => model.id) : [view];
  const answers = await Promise.all(models.map((model) => loadModel(model, at, now)));
  const towns = view === 'average' ? averageTowns(answers.map((answer) => answer.towns)) : (answers[0]?.towns ?? []);
  const run = combineRuns(answers, now);
  // The union of every model's hours, sorted (ISO strings in one format sort in time order).
  const hours = [...new Set(answers.flatMap((answer) => answer.hours))].sort();
  return {
    model: view,
    fetchedAt: run.fetchedAt?.toISOString() ?? null,
    isStale: run.isStale,
    validAt: answers.some((answer) => answer.hasAt) ? at.toISOString() : null,
    hours,
    places: towns.map(toValue),
    provinces: provinceHeat(provincePsgcs, towns),
  };
}
