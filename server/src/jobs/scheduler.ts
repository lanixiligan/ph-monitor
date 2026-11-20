// Runs the jobs on a timer while the server is up.
//
// Core cycle (feeds the score), every 15 minutes:
//   earthquakes every 15 minutes, weather every 2 hours, then the scores.
// Extras cycle (shown on the page; only GDACS alert levels reach the score), every 15 minutes:
//   official alerts and news every 15 minutes; events, storms and the live stream check every 30;
//   feed link check every hour; the 7-day outlook every 6 hours; PAGASA's heat forecast every
//   3 hours; the heat map and then the rain forecast field every 12 hours (display only: they
//   never change the score).
// How often each job runs is set in due.ts (JOB_RULES).
//
// At start, only the jobs that are due run (see due.ts), so restarting the
// server again and again does not hammer the feeds.

import cron from 'node-cron';
import { checkFeeds, checkStreams } from './checkSources.ts';
import { computeScores } from './computeScores.ts';
import { HEAT_MAP_EVERY_MINUTES, isDue, jobsOnTick, readDueJobs, SLOW_JOBS } from './due.ts';
import { lastTried, markTried } from './jobTries.ts';
// `import type` brings in a type only; it disappears when the code runs.
import type { JobName } from './due.ts';
import { ingestAlerts } from './ingestAlerts.ts';
import { ingestEarthquakes } from './ingestEarthquakes.ts';
import { ingestEvents } from './ingestEvents.ts';
import { ingestForecast } from './ingestForecast.ts';
import { ingestHeatMap } from './ingestHeatMap.ts';
import { ingestNews } from './ingestNews.ts';
import { ingestPagasaHeat } from './ingestPagasaHeat.ts';
import { ingestRainForecast } from './ingestRainForecast.ts';
import { ingestStorms } from './ingestStorms.ts';
import { ingestWeather } from './ingestWeather.ts';

// Cron pattern: "minute hour day month weekday". `*/15` in the minute slot
// means "every 15 minutes": at :00, :15, :30 and :45.
const EVERY_15_MINUTES = '*/15 * * * *';

let coreRunning = false;
let extrasRunning = false;
let modelRunning = false;

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
    // About 1 call when nothing is new; about 72 for a new forecast (PAGASA, not Open-Meteo).
    if (wanted.includes('pagasaHeat')) await runJob('PAGASA heat', ingestPagasaHeat);
  } finally {
    extrasRunning = false;
  }
  // Started after the outlook, so their Open-Meteo calls don't pile up, but not
  // waited for: their minutes must not make the next tick skip alerts and news.
  if (wanted.includes('heatMap') || wanted.includes('rainForecast')) void runModelLane(wanted);
}

/**
 * The heat map, then the rain forecast field, one after the other in a lane of
 * their own, so their Open-Meteo calls never run at the same time as each other.
 */
async function runModelLane(wanted: JobName[]): Promise<void> {
  if (modelRunning) return;
  modelRunning = true;
  try {
    if (wanted.includes('heatMap')) await runOnceIn12Hours('heatMap', 'heat map', ingestHeatMap);
    if (wanted.includes('rainForecast')) await runOnceIn12Hours('rainForecast', 'rain forecast', ingestRainForecast);
  } finally {
    modelRunning = false;
  }
}

/**
 * A try is not repeated for 12 hours, even when it failed or the server
 * restarted mid-run (job_tries keeps the time): each try costs hundreds of
 * Open-Meteo calls, and trying every hour could use up the calls the score's
 * weather job needs. The last good run stays on the map meanwhile (out of date after 25 hours).
 */
async function runOnceIn12Hours(job: JobName, label: string, run: () => Promise<void>): Promise<void> {
  try {
    if (!isDue(await lastTried(job), HEAT_MAP_EVERY_MINUTES, new Date())) {
      console.warn(`Scheduler: ${label} tried less than 12 hours ago; waiting.`);
      return;
    }
    await markTried(job);
    await runJob(label, run);
  } catch (error) {
    console.error(`Scheduler: ${label} could not start:`, error);
  }
}

/** A timer tick: the clock picks the jobs (see jobsOnTick). */
async function runTick(minute: number): Promise<void> {
  let wanted = jobsOnTick(minute);
  // Jobs that run less often than hourly (weather, the outlook, the heat map) come up every
  // hour, so they also have to be due in the database.
  if (wanted.some((job) => SLOW_JOBS.includes(job))) {
    let due: JobName[] = [];
    try {
      due = await readDueJobs();
    } catch (error) {
      console.error('Scheduler: could not check which slow jobs are due:', error);
    }
    wanted = wanted.filter((job) => !SLOW_JOBS.includes(job) || due.includes(job));
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
    'Scheduler: started (earthquakes, official alerts and news every 15 min; weather every 2 hours; events, storms and streams every 30 min; ' +
      'feed check hourly; PAGASA heat every 3 hours; outlook every 6 hours; heat map and rain forecast every 12 hours).',
  );
}
