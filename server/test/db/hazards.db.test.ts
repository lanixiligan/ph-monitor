// Database tests for the fixed hazard maps (Project NOAH): what the maps say
// about one spot, the list of loaded layers, and the map tiles route.
// Run with: npm run test:db

import { addHazardCoverage, addHazardZone, ALPHA, BRAVO, CHARLIE, pool, resetDb, SPOT } from './testDb.ts';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, test } from 'node:test';
import express from 'express';
import type { HazardLayerInfo } from '@ph-monitor/shared';
import { getHazardZones, listHazardLayers } from '../../src/hazardZones.ts';
import { hazardsRouter } from '../../src/routes/hazards.ts';

let server: Server;
let baseUrl = '';

/** The map tile (x, y) that holds a spot at zoom z (the usual web map numbering). */
function tileAt(z: number, lat: number, lon: number): { x: number; y: number } {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n),
  };
}

before(async () => {
  await resetDb();

  // Alpha (lon 121–122, lat 14–15): landslide and surge levels 1, 2 and 4 loaded.
  // Inserted out of order on purpose: the answer must still come in order 1–4.
  for (const surgeLevel of [4, 2, 1]) await addHazardCoverage({ kind: 'stormSurge', surgeLevel, provincePsgc: ALPHA });
  await addHazardCoverage({ kind: 'landslide', surgeLevel: 0, provincePsgc: ALPHA });
  // Two landslide classes overlap at the spot (14.5, 121.5): the higher one wins.
  await addHazardZone({ kind: 'landslide', surgeLevel: 0, hazardClass: 2, provincePsgc: ALPHA, west: 121.4, south: 14.4, east: 121.6, north: 14.6 });
  await addHazardZone({ kind: 'landslide', surgeLevel: 0, hazardClass: 3, provincePsgc: ALPHA, west: 121.45, south: 14.45, east: 121.55, north: 14.55 });
  await addHazardZone({ kind: 'stormSurge', surgeLevel: 2, hazardClass: 1, provincePsgc: ALPHA, west: 121.4, south: 14.4, east: 121.6, north: 14.6 });
  await addHazardZone({ kind: 'stormSurge', surgeLevel: 4, hazardClass: 3, provincePsgc: ALPHA, west: 121.4, south: 14.4, east: 121.6, north: 14.6 });

  // Bravo: only surge level 1 loaded, no zones.
  await addHazardCoverage({ kind: 'stormSurge', surgeLevel: 1, provincePsgc: BRAVO });

  // Charlie has no map of its own, but Bravo's file holds a piece that lies in Charlie.
  await addHazardZone({ kind: 'stormSurge', surgeLevel: 3, hazardClass: 2, provincePsgc: BRAVO, west: 125.4, south: 7.4, east: 125.6, north: 7.6 });
  await addHazardZone({ kind: 'landslide', surgeLevel: 0, hazardClass: 1, provincePsgc: BRAVO, west: 125.4, south: 7.4, east: 125.6, north: 7.6 });

  const app = express();
  app.use('/api/hazards', hazardsRouter);
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

test('spot in zones: the highest overlapping class, and one surge entry per loaded level, in order', async () => {
  const zones = await getHazardZones(SPOT.lat, SPOT.lon, ALPHA);
  assert.deepEqual(zones, {
    landslide: { hazardClass: 3 },
    stormSurge: [
      { level: 1, hazardClass: null }, // loaded, but this surge does not reach the spot
      { level: 2, hazardClass: 1 },
      { level: 4, hazardClass: 3 },
    ],
  });
});

test('spot in a covered province but outside every zone: "not in a zone", never unknown', async () => {
  const zones = await getHazardZones(14.9, 121.9, ALPHA);
  assert.deepEqual(zones, {
    landslide: { hazardClass: null },
    stormSurge: [
      { level: 1, hazardClass: null },
      { level: 2, hazardClass: null },
      { level: 4, hazardClass: null },
    ],
  });
});

test('no map loaded: unknown (null), not "safe"', async () => {
  // Bravo has surge level 1 only; no landslide map.
  assert.deepEqual(await getHazardZones(10.5, 124.5, BRAVO), {
    landslide: null,
    stormSurge: [{ level: 1, hazardClass: null }],
  });
});

test('a zone from a neighbour province\'s file still counts', async () => {
  assert.deepEqual(await getHazardZones(7.5, 125.5, CHARLIE), {
    landslide: { hazardClass: 1 },
    stormSurge: [{ level: 3, hazardClass: 2 }],
  });
  // Elsewhere in Charlie there is no zone and no map: both unknown.
  assert.deepEqual(await getHazardZones(7.9, 125.9, CHARLIE), { landslide: null, stormSurge: null });
});

test('loaded layers: one row per kind and level, with the province count and load time', async () => {
  const layers = await listHazardLayers();
  assert.deepEqual(
    layers.map((layer) => [layer.kind, layer.surgeLevel, layer.provinces]),
    [['landslide', null, 1], ['stormSurge', 1, 2], ['stormSurge', 2, 1], ['stormSurge', 4, 1]],
  );
  const loadedAt = Date.parse(layers[0]?.loadedAt ?? '');
  assert.ok(Math.abs(Date.now() - loadedAt) < 60_000, `loadedAt was ${layers[0]?.loadedAt}`);

  const response = await fetch(`${baseUrl}/api/hazards`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=300');
  assert.deepEqual((await response.json()) as HazardLayerInfo[], layers);
});

test('tiles: bad layer or numbers give 400', async () => {
  for (const path of [
    'flood/9/0/0.mvt', // unknown layer
    'surge5/9/0/0.mvt',
    'surge4/23/0/0.mvt', // zoom too high
    'surge4/9/512/0.mvt', // x past the edge (0 to 511 at zoom 9)
    'surge4/9/0/-1.mvt',
    'surge4/9/1.5/0.mvt',
    'surge4/9/a/0.mvt',
  ]) {
    const response = await fetch(`${baseUrl}/api/hazards/tiles/${path}`);
    assert.equal(response.status, 400, path);
  }
});

test('tiles: below each layer\'s lowest zoom, and where there are no zones, an empty answer (204)', async () => {
  // Landslide starts at zoom 9, storm surge at zoom 4.
  const low = tileAt(8, SPOT.lat, SPOT.lon);
  const below = await fetch(`${baseUrl}/api/hazards/tiles/landslide/8/${low.x}/${low.y}.mvt`);
  assert.equal(below.status, 204);
  assert.equal((await below.arrayBuffer()).byteLength, 0);
  const far = tileAt(3, SPOT.lat, SPOT.lon);
  assert.equal((await fetch(`${baseUrl}/api/hazards/tiles/surge4/3/${far.x}/${far.y}.mvt`)).status, 204);

  const empty = await fetch(`${baseUrl}/api/hazards/tiles/surge4/9/0/0.mvt`);
  assert.equal(empty.status, 204);
  // Surge level 3 has no zone in Alpha.
  const tile = tileAt(9, SPOT.lat, SPOT.lon);
  assert.equal((await fetch(`${baseUrl}/api/hazards/tiles/surge3/9/${tile.x}/${tile.y}.mvt`)).status, 204);
});

test('tiles: a tile over a zone holds the zones layer with the class as "c"', async () => {
  // `as const` keeps each pair's exact types (a text and a number) instead of a mixed list.
  for (const [layer, z] of [['surge4', 9], ['landslide', 12], ['surge2', 15]] as const) {
    const { x, y } = tileAt(z, SPOT.lat, SPOT.lon);
    const response = await fetch(`${baseUrl}/api/hazards/tiles/${layer}/${z}/${x}/${y}.mvt`);
    assert.equal(response.status, 200, `${layer}/${z}`);
    assert.equal(response.headers.get('content-type'), 'application/vnd.mapbox-vector-tile');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=86400');
    const body = Buffer.from(await response.arrayBuffer());
    assert.ok(body.length > 0);
    // A vector tile stores its layer name and property names as plain text.
    assert.ok(body.includes('zones') && body.includes('c'));
  }
});
