// Runs the jobs on a timer while the server is up:
//   earthquakes every 15 minutes, weather every 30 minutes,
//   and the scores are recomputed after every fetch.

import cron from 'node-cron';
import { computeScores } from './computeScores.ts';
import { ingestEarthquakes } from './ingestEarthquakes.ts';
import { ingestWeather } from './ingestWeather.ts';

// Cron pattern: "minute hour day month weekday". `*/15` in the minute slot
// means "every 15 minutes": at :00, :15, :30 and :45.
const EVERY_15_MINUTES = '*/15 * * * *';
// Weather is fetched only on the ticks at :00 and :30.
const WEATHER_EVERY_MINUTES = 30;

let running = false;

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
  if (running) {
    console.warn('Scheduler: previous run still in progress, skipping this one.');
    return;
  }
  running = true;
  console.log(`Scheduler: run started at ${new Date().toISOString()}`);
  try {
    await runJob('earthquakes', ingestEarthquakes);
    if (withWeather) await runJob('weather', ingestWeather);
    await runJob('scores', computeScores);
  } finally {
    running = false;
  }
  console.log('Scheduler: run finished.');
}

export function startScheduler(): void {
  cron.schedule(EVERY_15_MINUTES, () => {
    const withWeather = new Date().getMinutes() % WEATHER_EVERY_MINUTES === 0;
    // `void` says "start this and don't wait for it" (errors are handled inside).
    void runCycle(withWeather);
  });

  // Also run everything once right now, so the data is fresh after a restart.
  void runCycle(true);
  console.log('Scheduler: started (earthquakes every 15 min, weather every 30 min).');
}
