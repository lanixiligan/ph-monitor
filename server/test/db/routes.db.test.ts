// Database tests for the API routes: the spot route (/api/point), the map
// data (/api/provinces) and the feed status. The real routes run on a
// spare port; Open-Meteo is replaced by a pretend answer, so no test goes
// out to the internet. Run with: npm run test:db

import {
  addQuake, addWeather, ALPHA, ALPHA_CITY, BRAVO, hoursAgo, minutesAgo, pool, resetDb, setFeedRuns, SPOT,
} from './testDb.ts';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express from 'express';
import type { PlaceMatch, PointDetail, ProvinceDetail, StatusReport } from '@ph-monitor/shared';
import { computeScores } from '../../src/jobs/computeScores.ts';
import { readDueJobs } from '../../src/jobs/due.ts';
import { conditionsRouter } from '../../src/routes/conditions.ts';
import { placesRouter } from '../../src/routes/places.ts';
import { pointRouter } from '../../src/routes/point.ts';
import { provincesRouter } from '../../src/routes/provinces.ts';

const realFetch = globalThis.fetch;
let weatherCalls = 0;
let server: Server;
let baseUrl = '';

/** A pretend Open-Meteo answer: 25 hours ending now, 1 mm of rain every hour. */
function pretendWeather(): Response {
  const thisHour = Math.floor(Date.now() / 3_600_000) * 3600;
  // Array.from({ length: 25 }, fn) builds a list of 25 items from a function.
  const time = Array.from({ length: 25 }, (_, i) => thisHour - (24 - i) * 3600);
  const hourly = {
    time,
    temperature_2m: time.map(() => 30),
    relative_humidity_2m: time.map(() => 70),
    precipitation: time.map(() => 1),
  };
  return Response.json({ hourly });
}

/** Fetches one of our own routes and returns the status code and the JSON. */
async function get(path: string): Promise<{ status: number; body: unknown }> {
  const response = await realFetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() };
}

before(async () => {
  await resetDb();
  await setFeedRuns();
  // A magnitude 5 quake half a degree (about 55 km) north of the spot, on Alpha's north edge.
  await addQuake('q1', { lat: 15.0, lon: 121.5, magnitude: 5, occurredAt: hoursAgo(2), reachKm: 100 });
  await addWeather(ALPHA, { validAt: minutesAgo(30), rain1hMm: 0, rain24hMm: 5 });
  await addWeather(BRAVO, { validAt: minutesAgo(30), rain1hMm: 0, rain24hMm: 0 });
  await computeScores();

  // Calls to Open-Meteo get the pretend answer; everything else is refused.
  globalThis.fetch = async (input) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.startsWith('https://api.open-meteo.com/')) throw new Error(`A test tried to fetch ${url}`);
    weatherCalls += 1;
    return pretendWeather();
  };

  const app = express();
  app.use('/api/provinces', provincesRouter);
  app.use('/api/point', pointRouter);
  app.use('/api/places', placesRouter);
  app.use('/api', conditionsRouter);
  // Port 0 = "any free port". The Promise waits until the server is listening.
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  // `as AddressInfo`: for a network port, address() is an object with the port number.
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await pool.end();
});

test('spot route: names the town and province, and measures the quake from the spot itself', async () => {
  const { status, body } = await get(`/api/point?lat=${SPOT.lat}&lon=${SPOT.lon}`);
  assert.equal(status, 200);
  const detail = body as PointDetail; // `as` tells TypeScript the shape of the JSON
  assert.deepEqual(detail.place, { psgc: ALPHA_CITY, name: 'Alpha City', geoLevel: 'City' });
  assert.equal(detail.province.name, 'Alpha');

  const quake = detail.events.find((event) => event.kind === 'earthquake');
  assert.ok(quake && quake.kind === 'earthquake');
  assert.ok(quake.distanceKm > 53 && quake.distanceKm < 57, `distance was ${quake.distanceKm} km`);
  assert.ok(detail.score.quakeScore > 0);
  // The province's own score measures the same quake from its edge (0 km), so it is higher.
  assert.ok((detail.provinceScore ?? 0) > detail.score.score);
});

test('spot route: weather is fetched for the spot, scored, and reused for the same 5 km cell', async () => {
  const before = weatherCalls;
  const { body } = await get(`/api/point?lat=${SPOT.lat + 0.01}&lon=${SPOT.lon}`);
  const detail = body as PointDetail;
  const weather = detail.events.find((event) => event.kind === 'weather');
  assert.ok(weather && weather.kind === 'weather');
  assert.equal(weather.rain24hMm, 24);
  assert.ok(detail.score.weatherScore > 0);
  assert.deepEqual(detail.score.unknownSignals, []);
  assert.equal(weatherCalls, before, 'the first test already fetched this cell');
});

test('spot route: just outside a province still counts; the open sea and bad input do not', async () => {
  // About 1 km east of Alpha's east edge (inside the 2 km tolerance), outside any town.
  const edge = await get('/api/point?lat=14.9&lon=122.009');
  assert.equal(edge.status, 200);
  assert.equal((edge.body as PointDetail).province.psgc, ALPHA);
  assert.equal((edge.body as PointDetail).place, null);

  assert.equal((await get('/api/point?lat=6&lon=118')).status, 404);
  assert.equal((await get('/api/point?lat=99&lon=121')).status, 400);
  assert.equal((await get('/api/point?lat=abc&lon=121')).status, 400);
});

test('place search: finds towns and provinces by name, each with a point inside it that the spot route accepts', async () => {
  const { status, body } = await get('/api/places?q=alpha');
  assert.equal(status, 200);
  const matches = body as PlaceMatch[];
  assert.deepEqual(
    matches.map((match) => [match.name, match.kind, match.provinceName]),
    [['Alpha City', 'city', 'Alpha'], ['Alpha', 'province', null]],
  );
  // Alpha City is the square 121.4–121.6, 14.4–14.6.
  const city = matches[0];
  assert.ok(city && city.lat > 14.4 && city.lat < 14.6 && city.lon > 121.4 && city.lon < 121.6);
  const opened = await get(`/api/point?lat=${city.lat}&lon=${city.lon}`);
  assert.equal((opened.body as PointDetail).place?.name, 'Alpha City');

  assert.deepEqual((await get('/api/places?q=zzz')).body, []);
  assert.equal((await get('/api/places')).status, 400);
});

test('map data: every province comes with its shape, score and "incomplete" mark', async () => {
  const { status, body } = await get('/api/provinces');
  assert.equal(status, 200);
  const collection = body as {
    features: { id: number; properties: { name: string; score: number | null; incomplete: boolean }; geometry: { type: string } }[];
  };
  assert.deepEqual(collection.features.map((feature) => feature.properties.name), ['Alpha', 'Bravo', 'Charlie']);
  // A province in one piece comes back as a Polygon, one with islands as a MultiPolygon.
  assert.ok(collection.features.every((feature) => feature.geometry.type.endsWith('Polygon')));
  // Charlie has no weather reading: its score is "at least", so it is marked.
  assert.deepEqual(collection.features.map((feature) => feature.properties.incomplete), [false, false, true]);
  assert.ok((collection.features[0]?.properties.score ?? 0) > 0);
});

test('province card: the saved score, the quakes linked to the province and its latest weather', async () => {
  const { status, body } = await get(`/api/provinces/${ALPHA}`);
  assert.equal(status, 200);
  const detail = body as ProvinceDetail;
  assert.equal(detail.province.name, 'Alpha');
  assert.ok(detail.score && detail.score.quakeScore > 0);
  assert.deepEqual(detail.events.map((event) => event.kind), ['earthquake', 'weather']);
  assert.equal(detail.freshness.isStale, false);

  assert.equal((await get('/api/provinces/999')).status, 404);
  assert.equal((await get('/api/provinces/abc')).status, 400);
});

test('feed status and due jobs: both read the same record of when each feed last worked', async () => {
  // Right after every feed worked, nothing is stale and only the link checks (never run) are due.
  const fresh = (await get('/api/status')).body as StatusReport;
  assert.deepEqual(fresh.feeds.filter((feed) => feed.isStale), []);
  assert.deepEqual(await readDueJobs(), ['streamCheck', 'feedCheck']);

  await setFeedRuns(61, ['usgs']);
  await pool.query(
    `INSERT INTO sources (id, kind, outlet, category, url, status, last_checked_at) VALUES
       ('feed-1', 'feed', 'Test', 'national', 'https://example.org/rss', 'ok', now()),
       ('stream-1', 'stream', 'Test', 'tv', 'https://example.org/live', 'ok', now())`,
  );
  const later = (await get('/api/status')).body as StatusReport;
  assert.deepEqual(later.feeds.filter((feed) => feed.isStale).map((feed) => feed.id), ['earthquakes']);
  assert.deepEqual(await readDueJobs(), ['earthquakes']);
});
