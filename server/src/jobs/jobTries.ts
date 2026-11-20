// When a job last started, kept in the database (table job_tries) so it
// survives a server restart. Used to space out tries: a failed heat map run is
// not tried again for 12 hours, a failed PAGASA heat run for 3 (see scheduler.ts).

import { pool } from '../db.ts';
import { isDue } from './due.ts';
// `import type` brings in a type only; it disappears when the code runs.
import type { JobName } from './due.ts';

/** When `job` last started; null if never. */
export async function lastTried(job: JobName): Promise<Date | null> {
  // `<{ tried_at: Date }>` tells TypeScript what each row looks like.
  const result = await pool.query<{ tried_at: Date }>('SELECT tried_at FROM job_tries WHERE job = $1', [job]);
  // `?.` reads the field only if there is a row; `??` gives null otherwise.
  return result.rows[0]?.tried_at ?? null;
}

/** Notes that `job` starts now. */
export async function markTried(job: JobName): Promise<void> {
  await pool.query(
    `INSERT INTO job_tries (job, tried_at) VALUES ($1, now())
     ON CONFLICT (job) DO UPDATE SET tried_at = EXCLUDED.tried_at`,
    [job],
  );
}

/** True when `job` was never tried, or last tried at least `everyMinutes` before `now`. */
export async function spacedEnough(job: JobName, everyMinutes: number, now: Date): Promise<boolean> {
  return isDue(await lastTried(job), everyMinutes, now);
}
