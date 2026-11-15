// Runs one job by hand, once. Examples:
//   npm run ingest:earthquakes
// (The running server does the same jobs on a timer.)

import { pool } from '../src/db.ts';
import { ingestEarthquakes } from '../src/jobs/ingestEarthquakes.ts';

// A lookup table from job name to the function that runs it.
// `Record<string, X>` means "an object whose values are all X".
const jobs: Record<string, () => Promise<void>> = {
  earthquakes: ingestEarthquakes,
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
