// Database tests for the rain forecast field (Typhoon view; display only):
// saving a run (saveRainRun) and GET /api/rainforecast.
// Run with: npm run test:db

import { pool, resetDb } from './testDb.ts';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express from 'express';
// `import type` brings in a type only; it disappears when the code runs.
import type { RainForecastMap } from '@ph-monitor/shared';
import type { RainHours } from '../../src/fetchers/openMeteoRain.ts';
import { saveRainRun } from '../../src/jobs/ingestRainForecast.ts';
import { RAIN_GRID } from '../../src/rainForecast.ts';
import { rainForecastRouter } from '../../src/routes/rainForecast.ts';

const HOUR_MS = 60 * 60 * 1000;
const CELLS = RAIN_GRID.cols * RAIN_GRID.rows;

let server: Server;
let baseUrl = '';

/** 2 mm every hour, for 48 hours from the start of this UTC hour. */
function steadyRain(): RainHours {
  const start = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  return {
    times: Array.from({ length: 48 }, (_, i) => new Date(start + i * HOUR_MS)),
    mm: Array.from({ length: 48 }, () => 2),
  };
}

async function getForecast(): Promise<RainForecastMap> {
  const response = await fetch(`${baseUrl}/api/rainforecast`);
  assert.equal(response.status, 200);
  // `as` tells TypeScript the shape of the JSON (the route builds exactly this).
  return (await response.json()) as RainForecastMap;
}

before(async () => {
  await resetDb();
  const app = express();
  app.use('/api/rainforecast', rainForecastRouter);
  // Port 0 = "any free port". The Promise waits until the server is listening.
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  // `as AddressInfo`: for a network port, address() is an object with the port number.
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
});

test('before any run: no frames, out of date, never a calm-looking empty field', async () => {
  const forecast = await getForecast();
  assert.equal(forecast.fetchedAt, null);
  assert.equal(forecast.isStale, true);
  assert.deepEqual(forecast.frames, []);
  assert.deepEqual(forecast.grid, RAIN_GRID);
});

test('a run under 90% of points is not saved; the old state stays', async () => {
  const indexes = Array.from({ length: CELLS }, (_, i) => i);
  // Only 200 of 256 points answered (78%).
  const locations = indexes.map((i) => (i < 200 ? steadyRain() : null));
  await saveRainRun(indexes, locations);
  const forecast = await getForecast();
  assert.equal(forecast.fetchedAt, null);
  assert.deepEqual(forecast.frames, []);
});

test('a good run is saved: 3-hour totals per point, missing points null', async () => {
  const indexes = Array.from({ length: CELLS }, (_, i) => i);
  // Every point but the last answered (99.6%).
  const locations = indexes.map((i) => (i < CELLS - 1 ? steadyRain() : null));
  await saveRainRun(indexes, locations);
  const forecast = await getForecast();
  assert.ok(forecast.fetchedAt !== null);
  assert.equal(forecast.isStale, false);
  assert.equal(forecast.model, 'ecmwf_ifs');
  assert.equal(forecast.stepHours, 3);
  assert.ok(forecast.frames.length > 0);
  const first = forecast.frames[0];
  assert.ok(first);
  assert.equal(first.mm.length, CELLS);
  // The first frame's period may start before the saved hours: then it is unknown (null).
  const full = forecast.frames[1];
  assert.ok(full);
  assert.equal(full.mm[0], 6);
  // The point with no answer: no data, never 0.
  assert.equal(full.mm[CELLS - 1], null);
});

test('a later good run replaces the earlier one completely', async () => {
  const indexes = Array.from({ length: CELLS }, (_, i) => i);
  await saveRainRun(indexes, indexes.map(() => steadyRain()));
  const rows = await pool.query<{ count: string }>('SELECT count(*) FROM rain_forecasts');
  assert.equal(Number(rows.rows[0]?.count), CELLS);
});

test('nothing answered at all: the run throws and keeps the last good one', async () => {
  const indexes = [0, 1];
  await assert.rejects(saveRainRun(indexes, [null, null]), /no point answered/);
  const rows = await pool.query<{ count: string }>('SELECT count(*) FROM rain_forecasts');
  assert.equal(Number(rows.rows[0]?.count), CELLS);
});
