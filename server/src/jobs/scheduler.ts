// Runs the jobs on a timer while the server is up.
//
// Core cycle (feeds the score), every 15 minutes:
//   earthquakes every 15 minutes, weather every 30, then the scores.
// Extras cycle (shown on the page; only GDACS alert levels reach the score), every 15 minutes:
//   official alerts and news every 15 minutes; events, storms and the live stream check every 30;
//   feed link check every hour; the 7-day outlook every 6 hours.

import cron from 'node-cron';
import { pool } from '../db.ts';
import { checkFeeds, checkStreams } from './checkSources.ts';
import { computeScores } from './computeScores.ts';
import { ingestAlerts } from './ingestAlerts.ts';
import { ingestEarthquakes } from './ingestEarthquakes.ts';
import { ingestEvents } from './ingestEvents.ts';
import { ingestForecast } from './ingestForecast.ts';
import { ingestNews } from './ingestNews.ts';
import { ingestStorms } from './ingestStorms.ts';
import { ingestWeather } from './ingestWeather.ts';

// Cron pattern: "minute hour day month weekday". `*/15` in the minute slot
// means "every 15 minutes": at :00, :15, :30 and :45.
const EVERY_15_MINUTES = '*/15 * * * *';
// Weather is fetched only on the ticks at :00 and :30.
const WEATHER_EVERY_MINUTES = 30;
// The outlook costs about 176 Open-Meteo calls a run, so it runs rarely.
const OUTLOOK_EVERY_HOURS = 6;
const HOUR_MS = 60 * 60 * 1000;

let coreRunning = false;
let extrasRunning = false;

/** Runs one job; a failure is logged but doesn't stop the jobs after it. */
async function runJob(name: string, job: () => Promise<void>): Promise<void> {
  try {
    await job();
  } catch (error) {
    console.error(`Scheduler: ${name} failed:`, error);
  }
}

async function runCycle(withWeather: boolean): Promise<void> {
  // If the previous cycle is somehow still going, skip this one.
  if (coreRunning) {
    console.warn('Scheduler: previous run still in progress, skipping this one.');
    return;
  }
  coreRunning = true;
  console.log(`Scheduler: run started at ${new Date().toISOString()}`);
  try {
    await runJob('earthquakes', ingestEarthquakes);
    if (withWeather) await runJob('weather', ingestWeather);
    await runJob('scores', computeScores);
  } finally {
    coreRunning = false;
  }
  console.log('Scheduler: run finished.');
}

/** True when the outlook was never fetched, or last fetched 6 or more hours ago. */
async function outlookIsDue(): Promise<boolean> {
  const result = await pool.query<{ last_ok_at: Date }>(
    `SELECT last_ok_at FROM fetch_runs WHERE source = 'open-meteo-daily'`,
  );
  const lastOk = result.rows[0]?.last_ok_at;
  if (!lastOk) return true;
  // One minute of slack, so a run that finished a few seconds late still counts.
  return Date.now() - lastOk.getTime() >= OUTLOOK_EVERY_HOURS * HOUR_MS - 60_000;
}

/** `minute` is the clock minute of this tick; 'start' means "the server just started". */
// `number | 'start'` is a union: a number, or exactly the text 'start'.
async function runExtras(minute: number | 'start'): Promise<void> {
  if (extrasRunning) {
    console.warn('Scheduler: previous extras run still in progress, skipping this one.');
    return;
  }
  extrasRunning = true;
  try {
    const halfHour = minute === 'start' || minute % 30 === 0;
    const fullHour = minute === 'start' || minute === 0;

    await runJob('official alerts', ingestAlerts);
    await runJob('news', ingestNews);
    if (halfHour) {
      await runJob('events', ingestEvents);
      await runJob('storms', ingestStorms);
      await runJob('stream check', checkStreams);
    }
    if (fullHour) await runJob('feed check', checkFeeds);
    // Asking the database (instead of the clock) means a restart does not
    // spend Open-Meteo calls on an outlook that is still fresh.
    if (fullHour && (await outlookIsDue())) await runJob('outlook', ingestForecast);
  } catch (error) {
    console.error('Scheduler: extras run failed:', error);
  } finally {
    extrasRunning = false;
  }
}

export function startScheduler(): void {
  cron.schedule(EVERY_15_MINUTES, () => {
    const minute = new Date().getMinutes();
    // `void` says "start this and don't wait for it" (errors are handled inside).
    void runCycle(minute % WEATHER_EVERY_MINUTES === 0);
    void runExtras(minute);
  });

  // Also run everything once right now, so the data is fresh after a restart.
  void runCycle(true);
  void runExtras('start');
  console.log(
    'Scheduler: started (earthquakes and news every 15 min; weather, events, storms and streams every 30 min; ' +
      'feed check hourly; outlook every 6 hours).',
  );
}
