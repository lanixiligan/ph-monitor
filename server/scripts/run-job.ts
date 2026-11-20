// Runs one job by hand, once. Examples:
//   npm run ingest:earthquakes
//   npm run ingest:weather
//   npm run compute:scores
//   npm run ingest:events
//   npm run ingest:storms
//   npm run ingest:forecast
//   npm run ingest:news
//   npm run ingest:alerts
//   npm run ingest:heatmap
//   npm run ingest:rainforecast
//   npm run ingest:pagasaheat
// (The running server does the same jobs on a timer.)

import { pool } from '../src/db.ts';
import { computeScores } from '../src/jobs/computeScores.ts';
import { ingestAlerts } from '../src/jobs/ingestAlerts.ts';
import { ingestEarthquakes } from '../src/jobs/ingestEarthquakes.ts';
import { ingestEvents } from '../src/jobs/ingestEvents.ts';
import { ingestStorms } from '../src/jobs/ingestStorms.ts';
import { ingestForecast } from '../src/jobs/ingestForecast.ts';
import { ingestHeatMap } from '../src/jobs/ingestHeatMap.ts';
import { ingestNews } from '../src/jobs/ingestNews.ts';
import { ingestPagasaHeat } from '../src/jobs/ingestPagasaHeat.ts';
import { ingestRainForecast } from '../src/jobs/ingestRainForecast.ts';
import { ingestWeather } from '../src/jobs/ingestWeather.ts';

// A lookup table from job name to the function that runs it.
// `Record<string, X>` means "an object whose values are all X".
const jobs: Record<string, () => Promise<void>> = {
  earthquakes: ingestEarthquakes,
  weather: ingestWeather,
  scores: computeScores,
  events: ingestEvents,
  storms: ingestStorms,
  forecast: ingestForecast,
  news: ingestNews,
  alerts: ingestAlerts,
  heatmap: ingestHeatMap,
  rainforecast: ingestRainForecast,
  pagasaheat: ingestPagasaHeat,
};

// process.argv holds the words typed on the command line; [2] is the first
// one after the script name.
const name = process.argv[2] ?? '';
const job = jobs[name];

try {
  if (!job) {
    throw new Error(`Unknown job "${name}". Choose one of: ${Object.keys(jobs).join(', ')}`);
  }
  await job();
} catch (error) {
  console.error(`Job "${name}" failed:`, error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
