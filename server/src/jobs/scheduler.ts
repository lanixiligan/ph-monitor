// Runs the jobs on a timer while the server is up.
//
// Core cycle (feeds the score), every 15 minutes:
//   earthquakes every 15 minutes, weather every hour, then the scores.
// Extras cycle (shown on the page; only GDACS alert levels reach the score), every 15 minutes:
//   official alerts and news every 15 minutes; events, storms and the live stream check every 30;
//   feed link check every hour; the 7-day outlook every 6 hours.
// How often each job runs is set in due.ts (JOB_RULES).
//
// At start, only the jobs that are due run (see due.ts), so restarting the
// server again and again does not hammer the feeds.

import cron from 'node-cron';
import { checkFeeds, checkStreams } from './checkSources.ts';
import { computeScores } from './computeScores.ts';
import { jobsOnTick, readDueJobs } from './due.ts';
// `import type` brings in a type only; it disappears when the code runs.
import type { JobName } from './due.ts';
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

/** `wanted` lists the jobs to run this time. The scores are always worked out. */
async function runCycle(wanted: JobName[]): Promise<void> {
  // If the previous cycle is somehow still going, skip this one.
  if (coreRunning) {
    console.warn('Scheduler: previous run still in progress, skipping this one.');
    return;
  }
  coreRunning = true;
  console.log(`Scheduler: run started at ${new Date().toISOString()}`);
  try {
    if (wanted.includes('earthquakes')) await runJob('earthquakes', ingestEarthquakes);
    if (wanted.includes('weather')) await runJob('weather', ingestWeather);
    // The scores read only our own database, so they cost no feed calls.
    await runJob('scores', computeScores);
  } finally {
    coreRunning = false;
  }
  console.log('Scheduler: run finished.');
}

async function runExtras(wanted: JobName[]): Promise<void> {
  if (extrasRunning) {
    console.warn('Scheduler: previous extras run still in progress, skipping this one.');
    return;
  }
  extrasRunning = true;
  try {
    if (wanted.includes('alerts')) await runJob('official alerts', ingestAlerts);
    if (wanted.includes('news')) await runJob('news', ingestNews);
    if (wanted.includes('events')) await runJob('events', ingestEvents);
    if (wanted.includes('storms')) await runJob('storms', ingestStorms);
    if (wanted.includes('streamCheck')) await runJob('stream check', checkStreams);
    if (wanted.includes('feedCheck')) await runJob('feed check', checkFeeds);
    if (wanted.includes('outlook')) await runJob('outlook', ingestForecast);
  } finally {
    extrasRunning = false;
  }
}

/** A timer tick: the clock picks the jobs (see jobsOnTick). */
async function runTick(minute: number): Promise<void> {
  let wanted = jobsOnTick(minute);
  // The outlook is the costly one, so it also has to be due in the database.
  if (wanted.includes('outlook')) {
    let outlookIsDue = false;
    try {
      outlookIsDue = (await readDueJobs()).includes('outlook');
    } catch (error) {
      console.error('Scheduler: could not check whether the outlook is due:', error);
    }
    if (!outlookIsDue) wanted = wanted.filter((job) => job !== 'outlook');
  }
  await Promise.all([runCycle(wanted), runExtras(wanted)]);
}

/** At start: run only what is due, so a restart does not fetch fresh feeds again. */
async function runAtStart(): Promise<void> {
  try {
    const due = await readDueJobs();
    console.log(`Scheduler: due at start: ${due.length > 0 ? due.join(', ') : 'nothing (all feeds are recent)'}.`);
    await Promise.all([runCycle(due), runExtras(due)]);
  } catch (error) {
    // Most likely the database is not up yet. The next tick tries again.
    console.error('Scheduler: could not check which jobs are due at start:', error);
  }
}

export function startScheduler(): void {
  cron.schedule(EVERY_15_MINUTES, () => {
    // `void` says "start this and don't wait for it" (errors are handled inside).
    void runTick(new Date().getMinutes());
  });

  void runAtStart();
  console.log(
    'Scheduler: started (earthquakes, official alerts and news every 15 min; weather hourly; events, storms and streams every 30 min; ' +
      'feed check hourly; outlook every 6 hours).',
  );
}
