// "Which jobs are due?" Used by the scheduler so a restart does not fetch
// feeds that were fetched a moment ago (`tsx watch` restarts on every save).
// The answer comes from the database: fetch_runs holds each feed's last
// success, and the sources table holds the last link check.

import { pool } from '../db.ts';

// A union of exact texts: a JobName can only be one of these.
export type JobName =
  | 'earthquakes'
  | 'weather'
  | 'alerts'
  | 'news'
  | 'events'
  | 'storms'
  | 'streamCheck'
  | 'feedCheck'
  | 'outlook'
  | 'heatMap'
  | 'rainForecast'
  | 'pagasaHeat'
  | 'radioList'
  | 'radioCheck';

/**
 * The heat map runs every 12 hours. The rule says 11.5: a run is stamped when it
 * ends, several minutes after the :00 tick (it waits for the other extras and
 * takes about 4 minutes), so with a full 12 the next 12-hour tick would find it
 * not quite due and it would slip to every 13 hours. Slow jobs only start on
 * :00 ticks, so 11.5 still means one run every 12 hours, two a day.
 * The scheduler also uses this to space out tries after a failure.
 */
export const HEAT_MAP_EVERY_MINUTES = 12 * 60 - 30;

/** PAGASA's heat forecast is checked every 3 hours; a failed try also waits 3 hours. */
export const PAGASA_HEAT_EVERY_MINUTES = 180;

type JobRule = {
  job: JobName;
  everyMinutes: number;
  /** Names in fetch_runs, or 'check:feed' / 'check:stream' for the link checker. */
  sources: string[];
  /** 'all': due when any source is old. 'any': one recent source is enough. */
  needs: 'all' | 'any';
};

/**
 * Every fetching job and how often it runs, in the order the scheduler runs them.
 * Weather runs every 2 hours: one run asks for about 600 points, so the day's
 * total stays near 7,200 of Open-Meteo's 10,000 calls (see PLAN.md).
 * The outlook costs about 176 Open-Meteo calls a run, so it runs rarely.
 * The heat map asks for the same ~600 points (all its models in one request)
 * every 12 hours: about 1,198 calls a day. The rain forecast field asks for 256
 * grid points every 12 hours: 512 a day. Day total: about 9,600, leaving about
 * 400 for spots readers click.
 */
export const JOB_RULES: JobRule[] = [
  { job: 'earthquakes', everyMinutes: 15, sources: ['usgs'], needs: 'all' },
  { job: 'weather', everyMinutes: 120, sources: ['open-meteo'], needs: 'all' },
  { job: 'alerts', everyMinutes: 15, sources: ['pagasa'], needs: 'all' },
  { job: 'news', everyMinutes: 15, sources: ['news'], needs: 'all' },
  { job: 'events', everyMinutes: 30, sources: ['gdacs', 'eonet'], needs: 'all' },
  // JTWC is only the backup for JMA, so one of the two is enough.
  { job: 'storms', everyMinutes: 30, sources: ['jma', 'jtwc'], needs: 'any' },
  { job: 'streamCheck', everyMinutes: 30, sources: ['check:stream'], needs: 'all' },
  { job: 'feedCheck', everyMinutes: 60, sources: ['check:feed'], needs: 'all' },
  { job: 'outlook', everyMinutes: 6 * 60, sources: ['open-meteo-daily'], needs: 'all' },
  { job: 'heatMap', everyMinutes: HEAT_MAP_EVERY_MINUTES, sources: ['open-meteo-heat'], needs: 'all' },
  // Same rhythm as the heat map (and run right after it: see scheduler.ts).
  { job: 'rainForecast', everyMinutes: HEAT_MAP_EVERY_MINUTES, sources: ['open-meteo-rain'], needs: 'all' },
  // PAGASA's own heat index forecast: a small download, checked every 3 hours.
  { job: 'pagasaHeat', everyMinutes: PAGASA_HEAT_EVERY_MINUTES, sources: ['pagasa-heat'], needs: 'all' },
  // The radio station list (Radio Browser): one download a day. A failed one is tried again hourly.
  { job: 'radioList', everyMinutes: 24 * 60, sources: ['radio-browser'], needs: 'all' },
  // Our own check of every radio stream: every 6 hours, about 10 minutes a run.
  { job: 'radioCheck', everyMinutes: 6 * 60, sources: ['radio-check'], needs: 'all' },
];

const MINUTE_MS = 60 * 1000;

/** True when the job never ran, or last ran `everyMinutes` or more ago. */
export function isDue(lastRun: Date | null, everyMinutes: number, now: Date): boolean {
  if (lastRun === null) return true;
  // One minute of slack, so a run that finished a few seconds late still counts.
  return now.getTime() - lastRun.getTime() >= (everyMinutes - 1) * MINUTE_MS;
}

/** The jobs that are due. Pure: `lastRun` is a lookup table, source name → last run. */
export function dueJobs(lastRun: Map<string, Date>, now: Date): JobName[] {
  return JOB_RULES.filter((rule) => {
    const due = rule.sources.map((source) => isDue(lastRun.get(source) ?? null, rule.everyMinutes, now));
    // `every` = true for all of them; `some` = true for at least one.
    return rule.needs === 'any' ? due.every(Boolean) : due.some(Boolean);
  }).map((rule) => rule.job);
}

/**
 * The jobs a timer tick wants, by the clock: a job that runs every 30 minutes
 * runs at :00 and :30. `minute` is the clock minute of the tick. A job that
 * runs less often than hourly is wanted every hour at :00; the scheduler then
 * also checks that it is due (see `SLOW_JOBS`).
 */
export function jobsOnTick(minute: number): JobName[] {
  return JOB_RULES.filter((rule) => minute % Math.min(rule.everyMinutes, 60) === 0).map((rule) => rule.job);
}

/** Jobs that run less often than hourly: a tick runs them only when they are due. */
export const SLOW_JOBS: JobName[] = JOB_RULES.filter((rule) => rule.everyMinutes > 60).map((rule) => rule.job);

/** Reads the last run of every job from the database and returns the due ones. */
export async function readDueJobs(now: Date = new Date()): Promise<JobName[]> {
  const fetches = await pool.query<{ source: string; last_run: Date }>(
    'SELECT source, last_ok_at AS last_run FROM fetch_runs',
  );
  const checks = await pool.query<{ source: string; last_run: Date }>(
    `SELECT 'check:' || kind AS source, max(last_checked_at) AS last_run FROM sources GROUP BY kind`,
  );
  const lastRun = new Map([...fetches.rows, ...checks.rows].map((row) => [row.source, row.last_run]));
  return dueJobs(lastRun, now);
}
