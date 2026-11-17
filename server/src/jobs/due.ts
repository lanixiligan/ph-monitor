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
  | 'outlook';

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
 * Weather is hourly: the model's values are hourly and one run asks for about
 * 200 points, so the day's total stays near 4,800 of Open-Meteo's 10,000 calls.
 * The outlook costs about 176 Open-Meteo calls a run, so it runs rarely.
 */
export const JOB_RULES: JobRule[] = [
  { job: 'earthquakes', everyMinutes: 15, sources: ['usgs'], needs: 'all' },
  { job: 'weather', everyMinutes: 60, sources: ['open-meteo'], needs: 'all' },
  { job: 'alerts', everyMinutes: 15, sources: ['pagasa'], needs: 'all' },
  { job: 'news', everyMinutes: 15, sources: ['news'], needs: 'all' },
  { job: 'events', everyMinutes: 30, sources: ['gdacs', 'eonet'], needs: 'all' },
  // JTWC is only the backup for JMA, so one of the two is enough.
  { job: 'storms', everyMinutes: 30, sources: ['jma', 'jtwc'], needs: 'any' },
  { job: 'streamCheck', everyMinutes: 30, sources: ['check:stream'], needs: 'all' },
  { job: 'feedCheck', everyMinutes: 60, sources: ['check:feed'], needs: 'all' },
  { job: 'outlook', everyMinutes: 6 * 60, sources: ['open-meteo-daily'], needs: 'all' },
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
 * runs at :00 and :30. `minute` is the clock minute of the tick.
 */
export function jobsOnTick(minute: number): JobName[] {
  return JOB_RULES.filter((rule) => minute % Math.min(rule.everyMinutes, 60) === 0).map((rule) => rule.job);
}

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
