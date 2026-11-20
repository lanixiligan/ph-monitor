// Database tests for the Earthquake view: GET /api/quakes (src/quakeMap.ts)
// and the earthquake part of GET /api/places/scores. Both are display only.
// Run with: npm run test:db

import { addQuake, ALPHA, ALPHA_CITY, hoursAgo, pool, resetDb, setFeedRuns } from './testDb.ts';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express from 'express';
// `import type` brings in a type only; it disappears when the code runs.
import type { PlaceScores, ProvinceMapProperties, QuakeMap } from '@ph-monitor/shared';
import { computeScores } from '../../src/jobs/computeScores.ts';
import { conditionsRouter } from '../../src/routes/conditions.ts';
import { placesRouter } from '../../src/routes/places.ts';
import { provincesRouter } from '../../src/routes/provinces.ts';
import { WEIGHTS } from '../../src/scoring/scoring.ts';

const WINDOW = WEIGHTS.quake.windowHours;
const USGS_PAGE = 'https://earthquake.usgs.gov/earthquakes/eventpage/';

let server: Server;
let baseUrl = '';

/** Fetches one of our own routes and returns the JSON. */
async function get(path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200);
  return response.json();
}

/** Gives a quake a depth, a place and a link (addQuake leaves the link empty). */
async function addDetails(id: string, depthKm: number, url: string): Promise<void> {
  await pool.query('UPDATE earthquakes SET depth_km = $2, place = $3, url = $4 WHERE id = $1', [
    id, depthKm, `place of ${id}`, url,
  ]);
}

before(async () => {
  await resetDb();
  await setFeedRuns();
  // Two quakes inside the window (the older one first), one just outside it, one too small.
  await addQuake('older', { lat: 15.0, lon: 121.5, magnitude: 5, occurredAt: hoursAgo(10), reachKm: 100 });
  await addQuake('newer', { lat: 10.5, lon: 124.5, magnitude: 4.5, occurredAt: hoursAgo(2), reachKm: 50 });
  await addQuake('outside', { lat: 7.5, lon: 125.5, magnitude: 6, occurredAt: hoursAgo(WINDOW + 1), reachKm: 100 });
  await addQuake('small', { lat: 7.5, lon: 125.5, magnitude: WEIGHTS.quake.minMagnitude - 0.5, occurredAt: hoursAgo(1), reachKm: 10 });
  await addDetails('older', 12, `${USGS_PAGE}older`);
  await addDetails('newer', 40, 'javascript:alert(1)');
  await computeScores();

  const app = express();
  app.use('/api/places', placesRouter);
  app.use('/api/provinces', provincesRouter);
  app.use('/api', conditionsRouter);
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

test('quakes: only those inside the score window and above its minimum, newest first', async () => {
  const map = (await get('/api/quakes')) as QuakeMap;
  assert.equal(map.windowHours, WINDOW);
  assert.deepEqual(map.quakes.map((quake) => quake.id), ['newer', 'older']);

  const older = map.quakes[1];
  assert.ok(older);
  assert.equal(older.lat, 15.0);
  assert.equal(older.lon, 121.5);
  assert.equal(older.magnitude, 5);
  assert.equal(older.depthKm, 12);
  assert.equal(older.place, 'place of older');
  assert.equal(older.url, `${USGS_PAGE}older`);
  // The time is ISO text, within a minute of the seeded time.
  assert.ok(Math.abs(Date.parse(older.occurredAt) - hoursAgo(10).getTime()) < 60_000);
  assert.match(older.occurredAt, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
});

test('quakes: a link that is not http(s) is not sent', async () => {
  const map = (await get('/api/quakes')) as QuakeMap;
  assert.equal(map.quakes.find((quake) => quake.id === 'newer')?.url, null);
});

test('quakes and town scores: fresh feed gives fresh quakes and a known quake part', async () => {
  const map = (await get('/api/quakes')) as QuakeMap;
  assert.equal(map.isStale, false);
  assert.ok(map.fetchedAt !== null);

  const scores = (await get('/api/places/scores')) as PlaceScores;
  const town = scores.places.find((place) => place.psgc === ALPHA_CITY);
  assert.ok(town);
  const saved = await pool.query<{ quake_score: number }>(
    'SELECT quake_score FROM place_scores WHERE place_psgc = $1',
    [ALPHA_CITY],
  );
  assert.equal(town.quakeScore, saved.rows[0]?.quake_score);
  assert.ok(town.quakeScore > 0); // the 'older' quake is on Alpha's north edge
  assert.equal(town.quakeUnknown, false);

  // The province carries its highest town's earthquake part, and that town's name.
  const provinces = (await get('/api/provinces')) as { features: { properties: ProvinceMapProperties }[] };
  const alpha = provinces.features.find((feature) => feature.properties.psgc === ALPHA)?.properties;
  assert.equal(alpha?.quake_top_score, town.quakeScore);
  assert.equal(alpha?.quake_top_place, 'Alpha City');
  assert.equal(alpha?.quake_unknown, false);
});

test('quakes and town scores: a dead USGS feed is reported, never calm', async () => {
  // USGS last answered 2 hours ago: past its limit in FEED_RULES.
  await setFeedRuns(120, ['usgs']);
  await computeScores();

  const map = (await get('/api/quakes')) as QuakeMap;
  assert.equal(map.isStale, true);
  assert.ok(map.fetchedAt !== null && Date.parse(map.fetchedAt) < Date.now() - 100 * 60 * 1000);

  const scores = (await get('/api/places/scores')) as PlaceScores;
  const town = scores.places.find((place) => place.psgc === ALPHA_CITY);
  assert.equal(town?.quakeUnknown, true);
  assert.equal(town?.incomplete, true);

  const provinces = (await get('/api/provinces')) as { features: { properties: ProvinceMapProperties }[] };
  const alpha = provinces.features.find((feature) => feature.properties.psgc === ALPHA)?.properties;
  assert.equal(alpha?.quake_unknown, true);
});

test('quakes: a feed that never answered has no fetch time and is stale', async () => {
  await pool.query("DELETE FROM fetch_runs WHERE source = 'usgs'");
  const map = (await get('/api/quakes')) as QuakeMap;
  assert.equal(map.fetchedAt, null);
  assert.equal(map.isStale, true);
});
