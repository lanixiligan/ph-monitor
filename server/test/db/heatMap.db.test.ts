// Database tests for the heat map: saving a run (src/jobs/ingestHeatMap.ts),
// the map data and its route (src/heatMap.ts, GET /api/heatmap), and
// re-running `npm run weather-points` (its TRUNCATE). The forecasts are made
// up here, so no test goes out to Open-Meteo.
// Run with: npm run test:db

import { ALPHA, ALPHA_CITY, BRAVO, CHARLIE, hoursAgo, pool, resetDb } from './testDb.ts';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express from 'express';
// `import type` brings in a type only; it disappears when the code runs.
import type { HeatMapData, HeatModelId } from '@ph-monitor/shared';
import type { HeatLocation } from '../../src/fetchers/openMeteoHeat.ts';
import { heatIndexC } from '../../src/heatIndex.ts';
import { getHeatMap, hourShown } from '../../src/heatMap.ts';
import { saveHeatRun } from '../../src/jobs/ingestHeatMap.ts';
import type { WeatherPoint } from '../../src/jobs/ingestWeather.ts';
import { heatmapRouter } from '../../src/routes/heatmap.ts';
import { lastTried, markTried } from '../../src/jobs/jobTries.ts';
import { CLEAR_HEAT_RUNS_SQL, CLEAR_WEATHER_POINTS_SQL } from '../../src/weatherPoints.ts';

const ALL_MODELS: HeatModelId[] = ['ecmwf_ifs', 'dwd_icon_global_native', 'ncep_gfs_global'];
const HOUR_MS = 60 * 60 * 1000;
/** A second town, in Bravo, with one weather point. */
const BRAVO_TOWN = 10201;

let points: WeatherPoint[] = [];
let server: Server;
let baseUrl = '';

/** The start of the current hour: Open-Meteo's first forecast hour. */
function thisHour(): Date {
  return new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS);
}

/**
 * One point's made-up forecast: 48 hours from this hour, the same temperature
 * every hour, 60% humidity. `temps` gives each model's temperature; a model
 * left out sent nothing. `null` makes a model send only nulls.
 */
// `Partial<Record<K, V>>` = an object that may have any of the keys K.
function forecast(temps: Partial<Record<HeatModelId, number | null>>): HeatLocation {
  const start = thisHour().getTime();
  const times = Array.from({ length: 48 }, (_, i) => new Date(start + i * HOUR_MS));
  const location: HeatLocation = { times, models: {} };
  for (const model of ALL_MODELS) {
    const temp = temps[model];
    if (temp === undefined) continue;
    location.models[model] = { tempC: times.map(() => temp), humidityPct: times.map(() => (temp === null ? null : 60)) };
  }
  return location;
}

const everyModel = (temp: number) => forecast({ ecmwf_ifs: temp, dwd_icon_global_native: temp, ncep_gfs_global: temp });

/** Empties the heat tables, so each test starts clean. */
async function clearHeat(): Promise<void> {
  await pool.query('DELETE FROM heat_forecasts');
  await pool.query('DELETE FROM heat_runs');
  await pool.query(`DELETE FROM fetch_runs WHERE source = 'open-meteo-heat'`);
}

/** One model's rows: how many, and each distinct fetch time and temperature. */
async function rowsOf(model: HeatModelId): Promise<{ n: number; fetchedAt: number[]; temps: number[] }> {
  const result = await pool.query<{ n: number; fetched: Date[]; temps: number[] }>(
    `SELECT count(*)::int AS n,
            coalesce(array_agg(DISTINCT fetched_at) FILTER (WHERE fetched_at IS NOT NULL), '{}') AS fetched,
            coalesce(array_agg(DISTINCT temp_c) FILTER (WHERE temp_c IS NOT NULL), '{}') AS temps
     FROM heat_forecasts WHERE model = $1`,
    [model],
  );
  const row = result.rows[0];
  return { n: row?.n ?? 0, fetchedAt: (row?.fetched ?? []).map((date) => date.getTime()), temps: row?.temps ?? [] };
}

/** When the heat feed last succeeded, and how much the last run saved. */
async function heatFeed(): Promise<{ last_ok_at: Date; last_saved: number | null } | undefined> {
  const result = await pool.query<{ last_ok_at: Date; last_saved: number | null }>(
    `SELECT last_ok_at, last_saved FROM fetch_runs WHERE source = 'open-meteo-heat'`,
  );
  return result.rows[0];
}

before(async () => {
  await resetDb();
  await pool.query(
    `INSERT INTO places (psgc, name, province_psgc, geo_level, geom)
     VALUES ($1, 'Bravo Town', $2, 'Mun', ST_Multi(ST_MakeEnvelope(124.4, 10.4, 124.6, 10.6, 4326)))`,
    [BRAVO_TOWN, BRAVO],
  );
  // Two points inside Alpha City, one inside Bravo Town.
  const result = await pool.query<WeatherPoint>(
    `INSERT INTO weather_points (kind, geom) VALUES
       ('grid', ST_SetSRID(ST_MakePoint(121.45, 14.45), 4326)),
       ('grid', ST_SetSRID(ST_MakePoint(121.55, 14.55), 4326)),
       ('grid', ST_SetSRID(ST_MakePoint(124.5, 10.5), 4326))
     RETURNING id, ST_Y(geom) AS lat, ST_X(geom) AS lon`,
  );
  points = result.rows;
  await pool.query(
    `INSERT INTO place_weather_points (place_psgc, point_id) VALUES ($1, $3), ($1, $4), ($2, $5)`,
    [ALPHA_CITY, BRAVO_TOWN, points[0]?.id, points[1]?.id, points[2]?.id],
  );

  const app = express();
  app.use('/api/heatmap', heatmapRouter);
  // Port 0 = "any free port". The Promise waits until the server is listening.
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve());
  });
  // `as AddressInfo`: for a network port, address() is an object with the port number.
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await pool.end();
});

// ---------- Saving a run ----------

test('saveHeatRun: stores 48 hours per model and marks the run', async () => {
  await clearHeat();
  await saveHeatRun(points, [everyModel(32), everyModel(32), everyModel(32)], ALL_MODELS);

  for (const model of ALL_MODELS) {
    const rows = await rowsOf(model);
    assert.equal(rows.n, 3 * 48, model);
  }
  // The heat index is our own formula, worked out when saved.
  const one = await pool.query<{ heat_index_c: number }>('SELECT DISTINCT heat_index_c FROM heat_forecasts');
  assert.deepEqual(one.rows, [{ heat_index_c: heatIndexC(32, 60) }]);

  const runs = await pool.query<{ model: string; last_saved: number; last_total: number }>(
    'SELECT model, last_saved, last_total FROM heat_runs ORDER BY model',
  );
  assert.deepEqual(runs.rows, [
    { model: 'dwd_icon_global_native', last_saved: 3, last_total: 3 },
    { model: 'ecmwf_ifs', last_saved: 3, last_total: 3 },
    { model: 'ncep_gfs_global', last_saved: 3, last_total: 3 },
  ]);
  assert.equal((await heatFeed())?.last_saved, 3);
});

test('saveHeatRun: a second run replaces the first', async () => {
  await clearHeat();
  await saveHeatRun(points, [everyModel(30), everyModel(30), everyModel(30)], ALL_MODELS);
  const first = await rowsOf('ecmwf_ifs');
  await saveHeatRun(points, [everyModel(34), everyModel(34), everyModel(34)], ALL_MODELS);
  const second = await rowsOf('ecmwf_ifs');

  assert.equal(second.n, 3 * 48);
  assert.equal(second.fetchedAt.length, 1);
  assert.ok(!second.fetchedAt.includes(first.fetchedAt[0] ?? 0), 'the first run is still there');
  assert.deepEqual(second.temps, [34]);
});

test('saveHeatRun: a model of only nulls keeps its old rows and the others save', async () => {
  await clearHeat();
  await saveHeatRun(points, [everyModel(30), everyModel(30), everyModel(30)], ALL_MODELS);
  const iconBefore = await rowsOf('dwd_icon_global_native');
  const ecmwfBefore = await rowsOf('ecmwf_ifs');
  const runBefore = await pool.query<{ last_ok_at: Date }>(
    `SELECT last_ok_at FROM heat_runs WHERE model = 'dwd_icon_global_native'`,
  );

  // ICON is left out of every location (the fetcher drops a model of only nulls).
  const noIcon = () => forecast({ ecmwf_ifs: 34, ncep_gfs_global: 34 });
  await saveHeatRun(points, [noIcon(), noIcon(), noIcon()], ALL_MODELS);

  assert.deepEqual(await rowsOf('dwd_icon_global_native'), iconBefore);
  const ecmwf = await rowsOf('ecmwf_ifs');
  assert.equal(ecmwf.n, 3 * 48);
  assert.ok(!ecmwf.fetchedAt.includes(ecmwfBefore.fetchedAt[0] ?? 0), 'ECMWF still has the old run');
  assert.deepEqual(ecmwf.temps, [34]);
  const runAfter = await pool.query<{ last_ok_at: Date }>(
    `SELECT last_ok_at FROM heat_runs WHERE model = 'dwd_icon_global_native'`,
  );
  assert.deepEqual(runAfter.rows, runBefore.rows);
});

test('saveHeatRun: a model that only ever sent nulls saves nothing, and the others save', async () => {
  await clearHeat();
  // ICON's lists are there but hold only nulls.
  const iconNulls = () => forecast({ ecmwf_ifs: 33, dwd_icon_global_native: null, ncep_gfs_global: 33 });
  await saveHeatRun(points, [iconNulls(), iconNulls(), iconNulls()], ALL_MODELS);

  assert.equal((await rowsOf('dwd_icon_global_native')).n, 0);
  assert.equal((await rowsOf('ecmwf_ifs')).n, 3 * 48);
  assert.equal((await rowsOf('ncep_gfs_global')).n, 3 * 48);
  const runs = await pool.query<{ model: string }>('SELECT model FROM heat_runs ORDER BY model');
  assert.deepEqual(runs.rows.map((row) => row.model), ['ecmwf_ifs', 'ncep_gfs_global']);
  // The run as a whole still counts: two models were good.
  assert.ok(await heatFeed());
});

test('saveHeatRun: a thin run (under 90%) does not mark the feed fresh', async () => {
  await clearHeat();
  await pool.query(`INSERT INTO fetch_runs (source, last_ok_at) VALUES ('open-meteo-heat', $1)`, [hoursAgo(13)]);
  const before = await heatFeed();

  // 1 of 3 points answered: no model reaches 90%.
  await saveHeatRun(points, [everyModel(30), null, null], ALL_MODELS);

  const after = await heatFeed();
  assert.deepEqual(after?.last_ok_at, before?.last_ok_at);
  assert.equal(after?.last_saved, 1);
  assert.equal((await pool.query('SELECT 1 FROM heat_forecasts')).rowCount, 0);
  assert.equal((await pool.query('SELECT 1 FROM heat_runs')).rowCount, 0);
});

test('saveHeatRun: hours more than 6 hours old are deleted', async () => {
  await clearHeat();
  await pool.query(
    `INSERT INTO heat_forecasts (model, point_id, valid_at, temp_c, humidity_pct, heat_index_c)
     VALUES ('dwd_icon_global_native', $1, $2, 30, 60, 33), ('dwd_icon_global_native', $1, $3, 30, 60, 33)`,
    [points[0]?.id, hoursAgo(7), hoursAgo(5)],
  );
  // ICON sends nothing, so its old rows stay, except the one more than 6 hours old.
  const noIcon = () => forecast({ ecmwf_ifs: 34, ncep_gfs_global: 34 });
  await saveHeatRun(points, [noIcon(), noIcon(), noIcon()], ALL_MODELS);
  assert.equal((await rowsOf('dwd_icon_global_native')).n, 1);
});

test('saveHeatRun: throws when no point answered for any model', async () => {
  await clearHeat();
  await assert.rejects(saveHeatRun(points, [null, null, null], ALL_MODELS), /nothing saved/);
});

// ---------- The map data: getHeatMap and GET /api/heatmap ----------

/** Adds one stored forecast hour for one point. */
async function addHeat(model: HeatModelId, pointId: number | undefined, validAt: Date, heat: number): Promise<void> {
  await pool.query(
    `INSERT INTO heat_forecasts (model, point_id, valid_at, temp_c, humidity_pct, heat_index_c)
     VALUES ($1, $2, $3, 30, 60, $4)`,
    [model, pointId, validAt, heat],
  );
}

/** Marks a model's last good run. */
async function markRun(model: HeatModelId, lastOkAt: Date): Promise<void> {
  await pool.query(
    `INSERT INTO heat_runs (model, last_ok_at, last_saved, last_total) VALUES ($1, $2, 3, 3)`,
    [model, lastOkAt],
  );
}

/** One town's or province's entry in the answer; fails the test if it is missing. */
function valueOf(list: HeatMapData['places'], psgc: number) {
  const found = list.find((entry) => entry.psgc === psgc);
  assert.ok(found, `${psgc} is missing`);
  return found;
}

const inHours = (from: Date, hours: number) => new Date(from.getTime() + hours * HOUR_MS);

test('getHeatMap: a town takes its hottest point, and a province its hottest town', async () => {
  await clearHeat();
  const now = new Date();
  const hour = hourShown(now);
  await addHeat('ecmwf_ifs', points[0]?.id, hour, 35);
  await addHeat('ecmwf_ifs', points[1]?.id, hour, 43);
  const ranAt = hoursAgo(1);
  await markRun('ecmwf_ifs', ranAt);

  const heat = await getHeatMap('ecmwf_ifs', now);
  assert.deepEqual(valueOf(heat.places, ALPHA_CITY), { psgc: ALPHA_CITY, heatIndexC: 43, band: 'danger' });
  assert.deepEqual(valueOf(heat.provinces, ALPHA), { psgc: ALPHA, heatIndexC: 43, band: 'danger' });
  assert.equal(heat.validAt, hour.toISOString());
  assert.equal(heat.isStale, false);
  assert.equal(heat.fetchedAt, ranAt.toISOString());
});

test('getHeatMap: a point with no row this hour makes a town null', async () => {
  await clearHeat();
  const now = new Date();
  const hour = hourShown(now);
  await addHeat('ecmwf_ifs', points[0]?.id, hour, 35);
  // Bravo Town's only point has the hours before and after, not this one.
  await addHeat('ecmwf_ifs', points[2]?.id, inHours(hour, -1), 40);
  await addHeat('ecmwf_ifs', points[2]?.id, inHours(hour, 1), 40);
  await markRun('ecmwf_ifs', hoursAgo(1));

  const heat = await getHeatMap('ecmwf_ifs', now);
  assert.deepEqual(valueOf(heat.places, BRAVO_TOWN), { psgc: BRAVO_TOWN, heatIndexC: null, band: null });
  assert.deepEqual(valueOf(heat.provinces, BRAVO), { psgc: BRAVO, heatIndexC: null, band: null });
  // A province with no towns at all is listed too, as unknown.
  assert.deepEqual(valueOf(heat.provinces, CHARLIE), { psgc: CHARLIE, heatIndexC: null, band: null });
  // Alpha City still has its one point: 35 is "extreme caution".
  assert.deepEqual(valueOf(heat.places, ALPHA_CITY), { psgc: ALPHA_CITY, heatIndexC: 35, band: 'extreme caution' });
});

test('getHeatMap: empty table (before the first heat run): no time, stale, every value null', async () => {
  await clearHeat();
  const heat = await getHeatMap('ecmwf_ifs');
  assert.equal(heat.model, 'ecmwf_ifs');
  assert.equal(heat.fetchedAt, null);
  assert.equal(heat.isStale, true);
  assert.equal(heat.validAt, null);
  // Every town and province is listed, and every one is unknown.
  assert.deepEqual(heat.places.map((entry) => entry.psgc), [ALPHA_CITY, BRAVO_TOWN]);
  assert.deepEqual(heat.provinces.map((entry) => entry.psgc), [ALPHA, BRAVO, CHARLIE]);
  assert.ok([...heat.places, ...heat.provinces].every((entry) => entry.heatIndexC === null && entry.band === null));
});

test('getHeatMap: old forecast (the job stopped over 48 hours ago): no hour shown, stale, every value null', async () => {
  await clearHeat();
  const now = new Date();
  const hour = hourShown(now);
  // The last run's 48 hours ended 2 hours ago.
  for (let back = 50; back > 2; back -= 1) {
    for (const point of points) await addHeat('ecmwf_ifs', point.id, inHours(hour, -back), 44);
  }
  await markRun('ecmwf_ifs', hoursAgo(50));

  const heat = await getHeatMap('ecmwf_ifs', now);
  assert.equal(heat.validAt, null);
  assert.equal(heat.isStale, true);
  assert.ok(heat.fetchedAt !== null);
  assert.ok([...heat.places, ...heat.provinces].every((entry) => entry.heatIndexC === null));
});

test('getHeatMap: a run over 25 hours old still shows its values, marked stale', async () => {
  await clearHeat();
  const now = new Date();
  await addHeat('ecmwf_ifs', points[0]?.id, hourShown(now), 36);
  await markRun('ecmwf_ifs', hoursAgo(26));

  const heat = await getHeatMap('ecmwf_ifs', now);
  assert.equal(heat.isStale, true);
  assert.equal(valueOf(heat.places, ALPHA_CITY).heatIndexC, 36);
});

test('getHeatMap: a model that only sent nulls answers fetchedAt null, not an error, while the others show', async () => {
  await clearHeat();
  const iconNulls = () => forecast({ ecmwf_ifs: 33, dwd_icon_global_native: null, ncep_gfs_global: 33 });
  await saveHeatRun(points, [iconNulls(), iconNulls(), iconNulls()], ALL_MODELS);

  const icon = await getHeatMap('dwd_icon_global_native');
  assert.equal(icon.fetchedAt, null);
  assert.equal(icon.isStale, true);
  assert.ok(icon.places.every((entry) => entry.heatIndexC === null));

  const ecmwf = await getHeatMap('ecmwf_ifs');
  assert.ok(ecmwf.fetchedAt !== null);
  assert.equal(ecmwf.isStale, false);
  assert.equal(valueOf(ecmwf.places, ALPHA_CITY).heatIndexC, heatIndexC(33, 60));

  // The route answers the same, with status 200.
  const response = await fetch(`${baseUrl}/api/heatmap?model=dwd_icon_global_native`);
  assert.equal(response.status, 200);
  assert.equal(((await response.json()) as HeatMapData).fetchedAt, null);
});

test('GET /api/heatmap?model=nope gives 400', async () => {
  const response = await fetch(`${baseUrl}/api/heatmap?model=nope`);
  assert.equal(response.status, 400);
});

test('GET /api/heatmap with no model gives the default model (ECMWF), cached for at most 5 minutes', async () => {
  const response = await fetch(`${baseUrl}/api/heatmap`);
  assert.equal(response.status, 200);
  // 300 seconds, or fewer near the end of the hour (see cacheSeconds).
  const maxAge = Number(/^public, max-age=(\d+)$/.exec(response.headers.get('cache-control') ?? '')?.[1]);
  assert.ok(maxAge >= 1 && maxAge <= 300);
  const heat = (await response.json()) as HeatMapData; // `as` tells TypeScript the shape of the JSON
  assert.equal(heat.model, 'ecmwf_ifs');
  assert.equal(heat.places.length, 2);
  assert.equal(heat.provinces.length, 3);
});

// ---------- When the heat job last started (job_tries) ----------

test('job_tries: a heat try is remembered in the database', async () => {
  await pool.query('DELETE FROM job_tries');
  assert.equal(await lastTried('heatMap'), null);
  await markTried('heatMap');
  const first = await lastTried('heatMap');
  assert.ok(first !== null && Date.now() - first.getTime() < 60_000);
  await markTried('heatMap');
  const rows = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM job_tries');
  assert.equal(rows.rows[0]?.n, 1);
});

// ---------- Re-running `npm run weather-points` (keep this test last: it empties the points) ----------

test('weather-points: its TRUNCATE works with readings and heat forecasts saved, empties them, and resets the heat runs', async () => {
  const id = points[0]?.id;
  await pool.query(
    `INSERT INTO point_readings (point_id, valid_at, temp_c, humidity_pct, heat_index_c) VALUES ($1, now(), 30, 60, 33)`,
    [id],
  );
  await pool.query(
    `INSERT INTO heat_forecasts (model, point_id, valid_at, temp_c, humidity_pct, heat_index_c)
     VALUES ('ecmwf_ifs', $1, $2, 30, 60, 33) ON CONFLICT DO NOTHING`,
    [id, thisHour()],
  );

  await pool.query(
    `INSERT INTO fetch_runs (source, last_ok_at) VALUES ('open-meteo-heat', now()), ('open-meteo', now())
     ON CONFLICT (source) DO UPDATE SET last_ok_at = now()`,
  );
  await pool.query(`INSERT INTO heat_runs (model, last_ok_at, last_saved, last_total) VALUES ('ecmwf_ifs', now(), 1, 1)
     ON CONFLICT (model) DO NOTHING`);
  await markTried('heatMap');

  await pool.query(CLEAR_WEATHER_POINTS_SQL);
  await pool.query(CLEAR_HEAT_RUNS_SQL);

  for (const table of ['weather_points', 'place_weather_points', 'point_readings', 'heat_forecasts', 'heat_runs', 'job_tries']) {
    const left = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
    assert.equal(left.rows[0]?.n, 0, `${table} is not empty`);
  }
  // The heat job is due again; the weather feed's own record is left alone.
  const runs = await pool.query<{ source: string }>('SELECT source FROM fetch_runs ORDER BY source');
  const sources = runs.rows.map((row) => row.source);
  assert.ok(!sources.includes('open-meteo-heat'));
  assert.ok(sources.includes('open-meteo'));
  // The towns themselves are not touched.
  const towns = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM places');
  assert.equal(towns.rows[0]?.n, 2);
});
