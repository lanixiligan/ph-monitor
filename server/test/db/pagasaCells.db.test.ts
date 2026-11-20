// Database tests for the PAGASA squares per town (src/pagasaCells.ts): which
// grid squares fall inside each town, the one-square fallback for a town too
// small for any square, and skipping the rebuild when nothing changed.
// Run with: npm run test:db

import { ALPHA, ALPHA_CITY, pool, resetDb } from './testDb.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
// `import type` brings in a type only; it disappears when the code runs.
import type { GridInfo } from '../../src/pagasaGrid.ts';
import { lonLatToMercator, mercatorToLonLat } from '../../src/pagasaGrid.ts';
import { ensureTownCells, forgetPagasaGrid } from '../../src/pagasaCells.ts';

const origin = lonLatToMercator(121.0, 15.0);
/** 40 × 40 squares of 5 km, top-left corner at 121.0 E, 15.0 N. Alpha City is 121.4–121.6 E, 14.4–14.6 N. */
const FINE: GridInfo = { width: 40, height: 40, originX: origin.x, originY: origin.y, pixelSize: 5000 };
/** Squares of 50 km: bigger than Alpha City, so no square's centre is inside it. */
const COARSE: GridInfo = { ...FINE, pixelSize: 50000 };

/** The centre of one square, as longitude and latitude. */
function centre(grid: GridInfo, cell: number): { lon: number; lat: number } {
  const row = Math.floor(cell / grid.width);
  const col = cell % grid.width;
  return mercatorToLonLat(grid.originX + (col + 0.5) * grid.pixelSize, grid.originY - (row + 0.5) * grid.pixelSize);
}

/** The row version of the saved grid: it changes whenever the grid row is written again. */
async function gridVersion(): Promise<string> {
  // `query<{ ... }>` says what each returned row looks like.
  const result = await pool.query<{ xmin: string }>('SELECT xmin::text AS xmin FROM pagasa_grid WHERE id = 1');
  return result.rows[0]?.xmin ?? 'missing';
}

/** Where the town's square rows sit on disk: a rebuild deletes them and writes new ones elsewhere. */
async function cellRowPlaces(): Promise<string> {
  const result = await pool.query<{ places: string }>(
    'SELECT string_agg(ctid::text, \',\' ORDER BY cell) AS places FROM pagasa_town_cells',
  );
  return result.rows[0]?.places ?? '';
}

before(resetDb);
after(() => pool.end());

test('every square of Alpha City has its centre inside the town', async () => {
  const cells = await ensureTownCells(FINE);
  const list = cells.get(ALPHA_CITY) ?? [];
  assert.ok(list.length > 0, 'Alpha City has squares');
  for (const cell of list) {
    const { lon, lat } = centre(FINE, cell);
    assert.ok(lon > 121.4 && lon < 121.6 && lat > 14.4 && lat < 14.6, `cell ${cell} at ${lon}, ${lat}`);
  }
  // 22 km by 23 km in 5 km squares: about 4 × 4 or 4 × 5.
  assert.ok(list.length >= 12 && list.length <= 25, `${list.length} squares`);
});

test('a second call with the same grid and towns does not rebuild', async () => {
  await ensureTownCells(FINE);
  const versionBefore = await gridVersion();
  const placesBefore = await cellRowPlaces();
  const cells = await ensureTownCells(FINE);
  assert.equal(await gridVersion(), versionBefore);
  assert.equal(await cellRowPlaces(), placesBefore);
  assert.ok((cells.get(ALPHA_CITY) ?? []).length > 0, 'still returns the squares');
});

test('a new town makes it rebuild, and a town outside the grid gets no squares', async () => {
  await ensureTownCells(FINE);
  const versionBefore = await gridVersion();
  // Far east of the grid (the grid ends near 122.8 E).
  await pool.query(
    `INSERT INTO places (psgc, name, province_psgc, geo_level, geom)
     VALUES (10199, 'Far Town', ${ALPHA}, 'Mun', ST_Multi(ST_MakeEnvelope(125.4, 14.4, 125.6, 14.6, 4326)))`,
  );
  const cells = await ensureTownCells(FINE);
  assert.notEqual(await gridVersion(), versionBefore);
  assert.deepEqual(cells.get(10199), []);
  assert.ok((cells.get(ALPHA_CITY) ?? []).length > 0);
  await pool.query('DELETE FROM places WHERE psgc = 10199');
});

test('squares bigger than the town: it gets the one square under its middle', async () => {
  const cells = await ensureTownCells(COARSE);
  const list = cells.get(ALPHA_CITY) ?? [];
  assert.equal(list.length, 1);
  // The point inside the town (121.5 E, 14.5 N) is in row 1, column 1.
  assert.equal(list[0], 1 * COARSE.width + 1);
});

test('after the towns are reloaded (forgetPagasaGrid) it rebuilds, even with the same count', async () => {
  await ensureTownCells(FINE);
  // One town goes and another comes: the count stays at 1, so the count alone would not notice.
  await pool.query(`DELETE FROM places WHERE psgc = ${ALPHA_CITY}`);
  await pool.query(
    `INSERT INTO places (psgc, name, province_psgc, geo_level, geom)
     VALUES (10198, 'New Town', ${ALPHA}, 'Mun', ST_Multi(ST_MakeEnvelope(121.4, 14.4, 121.6, 14.6, 4326)))`,
  );
  await forgetPagasaGrid(); // what load-places does after saving the towns
  const cells = await ensureTownCells(FINE);
  assert.ok((cells.get(10198) ?? []).length > 0, 'the new town has squares');
  // Put the seeded map back for any test after this one.
  await resetDb();
});
