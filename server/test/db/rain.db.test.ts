// Database tests for the Flood view: the rain part in GET /api/places/scores
// (rainScore) and in GET /api/provinces (rain_top_score, rain_top_place,
// rain_unknown). Display only; unknown rain is null, never 0.
// Run with: npm run test:db

import {
  addTownWeather, addWeather, ALPHA, ALPHA_CITY, BRAVO, CHARLIE, minutesAgo, pool, resetDb, setFeedRuns,
} from './testDb.ts';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express from 'express';
// `import type` brings in a type only; it disappears when the code runs.
import type { PlaceScores, ProvinceMapProperties } from '@ph-monitor/shared';
import { computeScores } from '../../src/jobs/computeScores.ts';
import { placesRouter } from '../../src/routes/places.ts';
import { provincesRouter } from '../../src/routes/provinces.ts';

// Extra towns and one extra province, on top of the seeded map in testDb.ts.
const ALPHA_TWO = 10102; // rain: null (unknown)
const ALPHA_THREE = 10103; // hazards: NULL (row saved before that column)
const ALPHA_FOUR = 10104; // rain 55, the highest known in Alpha
const BRAVO_ONE = 10201; // rain: null
const BRAVO_TWO = 10202; // hazards: NULL
const DELTA = 104;
const DELTA_TOWN = 10401; // rain 0: known and calm (not the same as unknown)
const ECHO = 105;
const ECHO_ONE = 10501; // rain 20
const ECHO_TWO = 10502; // no score row yet: unknown rain

let server: Server;
let baseUrl = '';

/** Fetches one of our own routes and returns the JSON. */
async function get(path: string): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`);
  assert.equal(response.status, 200);
  return response.json();
}

/** Adds a town: a small square at (`lon`, `lat`) inside its province. */
async function addTown(psgc: number, name: string, provincePsgc: number, lon: number, lat: number): Promise<void> {
  await pool.query(
    `INSERT INTO places (psgc, name, province_psgc, geo_level, geom)
     VALUES ($1, $2, $3, 'Mun', ST_Multi(ST_MakeEnvelope($4::float8, $5::float8, $4::float8 + 0.1, $5::float8 + 0.1, 4326)))`,
    [psgc, name, provincePsgc, lon, lat],
  );
}

/**
 * Saves a town score the way computeScores does. `hazards` null = a row saved
 * before the hazards column; otherwise `rain` (a number or null) goes in it.
 */
async function addTownScore(psgc: number, hazards: { rain: number | null } | null): Promise<void> {
  const json = hazards === null ? null : JSON.stringify({ quake: 0, rain: hazards.rain, heat: 0, event: 0 });
  await pool.query(
    `INSERT INTO place_scores
       (place_psgc, score, quake_score, weather_score, event_score, unknown_signals, reasons, hazards, computed_at)
     VALUES ($1, 10, 0, 10, 0, '{}', '[]', $2::jsonb, now())`,
    [psgc, json],
  );
}

/** Saves a province score. Its own weather score is high on purpose: it must never be used as rain. */
async function addProvinceScore(psgc: number, topPlace: number | null): Promise<void> {
  await pool.query(
    `INSERT INTO province_scores
       (province_psgc, score, quake_score, weather_score, event_score, unknown_signals, reasons, computed_at, top_place_psgc)
     VALUES ($1, 80, 0, 80, 0, '{}', '[]', now(), $2)`,
    [psgc, topPlace],
  );
}

/** Reads one province's map properties from GET /api/provinces. */
async function provinceProps(psgc: number): Promise<ProvinceMapProperties | undefined> {
  const map = (await get('/api/provinces')) as { features: { properties: ProvinceMapProperties }[] };
  return map.features.find((feature) => feature.properties.psgc === psgc)?.properties;
}

before(async () => {
  await resetDb();
  await setFeedRuns();
  await pool.query(
    `INSERT INTO provinces (psgc, name, region_psgc, geo_level, geom, weather_point)
     VALUES ($1, 'Delta', 2, 'Prov', ST_Multi(ST_MakeEnvelope(122, 12, 123, 13, 4326)),
             ST_SetSRID(ST_MakePoint(122.5, 12.5), 4326))`,
    [DELTA],
  );
  await pool.query(
    `INSERT INTO provinces (psgc, name, region_psgc, geo_level, geom, weather_point)
     VALUES ($1, 'Echo', 2, 'Prov', ST_Multi(ST_MakeEnvelope(118, 9, 119, 10, 4326)),
             ST_SetSRID(ST_MakePoint(118.5, 9.5), 4326))`,
    [ECHO],
  );
  await addTown(ALPHA_TWO, 'Alpha Two', ALPHA, 121.1, 14.1);
  await addTown(ALPHA_THREE, 'Alpha Three', ALPHA, 121.1, 14.8);
  await addTown(ALPHA_FOUR, 'Alpha Four', ALPHA, 121.8, 14.8);
  await addTown(BRAVO_ONE, 'Bravo One', BRAVO, 124.1, 10.1);
  await addTown(BRAVO_TWO, 'Bravo Two', BRAVO, 124.8, 10.8);
  await addTown(DELTA_TOWN, 'Delta Town', DELTA, 122.4, 12.4);
  await addTown(ECHO_ONE, 'Echo One', ECHO, 118.1, 9.1);
  await addTown(ECHO_TWO, 'Echo Two', ECHO, 118.6, 9.6);

  // Alpha: known 30 and 55, one rain null, one hazards NULL.
  await addTownScore(ALPHA_CITY, { rain: 30 });
  await addTownScore(ALPHA_TWO, { rain: null });
  await addTownScore(ALPHA_THREE, null);
  await addTownScore(ALPHA_FOUR, { rain: 55 });
  // Bravo: no town's rain is known. Charlie: no towns at all. Delta: one calm town.
  await addTownScore(BRAVO_ONE, { rain: null });
  await addTownScore(BRAVO_TWO, null);
  await addTownScore(DELTA_TOWN, { rain: 0 });
  // Echo: one known town, one with no score row at all.
  await addTownScore(ECHO_ONE, { rain: 20 });
  await addProvinceScore(ALPHA, ALPHA_FOUR);
  await addProvinceScore(BRAVO, BRAVO_ONE);
  await addProvinceScore(CHARLIE, null);
  await addProvinceScore(DELTA, DELTA_TOWN);
  await addProvinceScore(ECHO, ECHO_ONE);

  const app = express();
  app.use('/api/places', placesRouter);
  app.use('/api/provinces', provincesRouter);
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

test('town scores: rainScore is the saved rain part, null when unknown or not saved', async () => {
  const scores = (await get('/api/places/scores')) as PlaceScores;
  // `new Map(...)` = a lookup from town code to its rain part.
  const rain = new Map(scores.places.map((place) => [place.psgc, place.rainScore]));
  assert.equal(rain.get(ALPHA_CITY), 30);
  assert.equal(rain.get(ALPHA_FOUR), 55);
  assert.equal(rain.get(DELTA_TOWN), 0); // known and calm
  assert.equal(rain.get(ALPHA_TWO), null); // rain: null in hazards
  assert.equal(rain.get(ALPHA_THREE), null); // hazards NULL
  assert.equal(rain.get(BRAVO_TWO), null);
});

test('provinces: the highest KNOWN rain town is picked; a null town is never picked', async () => {
  const alpha = await provinceProps(ALPHA);
  assert.equal(alpha?.rain_top_score, 55);
  assert.equal(alpha?.rain_top_place, 'Alpha Four');
  // Two of Alpha's towns have unknown rain: "at least 55".
  assert.equal(alpha?.rain_unknown, true);
});

test('provinces: every town known gives rain_unknown false; 0 stays 0', async () => {
  const delta = await provinceProps(DELTA);
  assert.equal(delta?.rain_top_score, 0);
  assert.equal(delta?.rain_top_place, 'Delta Town');
  assert.equal(delta?.rain_unknown, false);
});

test('provinces: all towns unknown gives null rain, never 0 or the province weather', async () => {
  const bravo = await provinceProps(BRAVO);
  assert.equal(bravo?.rain_top_score, null);
  assert.equal(bravo?.rain_top_place, null);
  assert.equal(bravo?.rain_unknown, true);
});

test('provinces: no town scores gives null rain (striped as no data)', async () => {
  const charlie = await provinceProps(CHARLIE);
  assert.equal(charlie?.weather_score, 80); // the province's own weather is not used
  assert.equal(charlie?.rain_top_score, null);
  assert.equal(charlie?.rain_top_place, null);
  assert.equal(charlie?.rain_unknown, false);
});

test('provinces: a town with no score row yet counts as unknown rain ("at least")', async () => {
  const echo = await provinceProps(ECHO);
  assert.equal(echo?.rain_top_score, 20);
  assert.equal(echo?.rain_top_place, 'Echo One');
  assert.equal(echo?.rain_unknown, true);
});

// Last, because computeScores replaces every saved score above.
test('computeScores: the rain part it saves is what both routes send', async () => {
  await addWeather(ALPHA, { validAt: minutesAgo(30), rain1hMm: 30, rain24hMm: 120 });
  await addTownWeather(ALPHA_CITY, { validAt: minutesAgo(30), rain1hMm: 30, rain24hMm: 120 });
  await computeScores();

  const saved = await pool.query<{ rain: number | null }>(
    "SELECT (hazards->>'rain')::float8 AS rain FROM place_scores WHERE place_psgc = $1",
    [ALPHA_CITY],
  );
  const savedRain = saved.rows[0]?.rain;
  assert.ok(typeof savedRain === 'number' && savedRain > 0);

  const scores = (await get('/api/places/scores')) as PlaceScores;
  assert.equal(scores.places.find((place) => place.psgc === ALPHA_CITY)?.rainScore, savedRain);
  // No other Alpha town has a higher rain part than the one with heavy rain.
  const alpha = await provinceProps(ALPHA);
  assert.ok(alpha?.rain_top_score !== null && alpha?.rain_top_score !== undefined);
  assert.ok(alpha.rain_top_score >= savedRain);
});
