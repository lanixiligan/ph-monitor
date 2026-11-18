// The reader's "Refresh" button in the live streams panel, and every page
// load: check the YouTube channels again now instead of waiting for the 30-minute scheduled check.
// Anyone can press it, so it is limited: at most one check every few minutes
// (counted from the last check, scheduled or not), and presses that arrive
// while a check is running wait for that same check instead of starting another.

import { pool } from '../db.ts';
import { checkStreams } from './checkSources.ts';

/** No new check if the channels were checked less than this long ago.
 *  10 minutes keeps the YouTube quota safe (see the sums in checker/checkStream.ts). */
export const REFRESH_COOLDOWN_MINUTES = 10;

const MINUTE_MS = 60 * 1000;

/** True when the channels were never checked, or the cooldown has passed. Pure. */
export function mayRecheck(lastCheck: Date | null, now: Date): boolean {
  if (lastCheck === null) return true;
  return now.getTime() - lastCheck.getTime() >= REFRESH_COOLDOWN_MINUTES * MINUTE_MS;
}

// The check that is running now, shared by every press that arrives meanwhile.
let running: Promise<void> | null = null;

async function lastStreamCheck(): Promise<Date | null> {
  const result = await pool.query<{ last: Date | null }>(
    `SELECT max(last_checked_at) AS last FROM sources WHERE kind = 'stream'`,
  );
  return result.rows[0]?.last ?? null;
}

/** Checks the channels again if allowed; otherwise does nothing. */
export async function refreshStreams(): Promise<void> {
  if (running) return running;
  if (!mayRecheck(await lastStreamCheck(), new Date())) return;
  // A second press may have started a check while we read the database.
  if (running) return running;
  running = checkStreams().finally(() => {
    running = null;
  });
  return running;
}
