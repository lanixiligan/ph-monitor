// Tests for the PAGASA GeoTIFF reader and Mercator maths, using one real saved file. No network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  readGrid,
  cellAt,
  cleanValue,
  sameGrid,
  lonLatToMercator,
  mercatorToLonLat,
} from '../src/pagasaGrid.ts';

// A Node Buffer may share a bigger memory block, so copy out exactly the file's bytes.
function fileBytes(): ArrayBuffer {
  const buf = readFileSync(new URL('./fixtures/pagasa-heat/20261121_1200_cog.tif', import.meta.url));
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

test('reads the grid numbers PAGASA publishes', async () => {
  const grid = await readGrid(fileBytes());
  assert.equal(grid.width, 945);
  assert.equal(grid.height, 1659);
  assert.equal(grid.values.length, 945 * 1659);
  assert.ok(Math.abs(grid.pixelSize - 1137.85) < 0.01);
  assert.ok(Math.abs(grid.originX - 13019362.81) < 0.01);
  assert.ok(Math.abs(grid.originY - 2406477.32) < 0.01);
});

test('Manila has a plausible heat index', async () => {
  const grid = await readGrid(fileBytes());
  const cell = cellAt(grid, 120.9842, 14.5995);
  assert.ok(cell !== null);
  const value = cleanValue(grid.values[cell]!);
  assert.ok(value !== null && value >= 25 && value <= 45, `value ${value}`);
});

test('a point outside the grid has no cell', async () => {
  const grid = await readGrid(fileBytes());
  assert.equal(cellAt(grid, 110, 14), null);
});

test('rejects bytes that are not a GeoTIFF', async () => {
  await assert.rejects(readGrid(new Uint8Array([1, 2, 3]).buffer));
});

test('cleanValue keeps only real heat index numbers', () => {
  for (const bad of [NaN, -9999, 0, Infinity, 71]) assert.equal(cleanValue(bad), null);
  assert.equal(cleanValue(33.5), 33.5);
});

test('Mercator round-trips', () => {
  const { x, y } = lonLatToMercator(121, 14);
  const back = mercatorToLonLat(x, y);
  assert.ok(Math.abs(back.lon - 121) < 1e-9);
  assert.ok(Math.abs(back.lat - 14) < 1e-9);
});

test('sameGrid compares size, origin and pixel size', () => {
  const a = { width: 2, height: 2, originX: 100, originY: 200, pixelSize: 10 };
  assert.ok(sameGrid(a, { ...a, originX: 100.005 }));
  assert.ok(!sameGrid(a, { ...a, originX: 100.5 }));
  assert.ok(!sameGrid(a, { ...a, width: 3 }));
});

test('cellAt gives null for a spot that is not a real number', () => {
  const grid = { width: 2, height: 2, originX: 0, originY: 300000, pixelSize: 150000 };
  assert.equal(cellAt(grid, NaN, 14), null);
  assert.equal(cellAt(grid, 1, 95), null); // a latitude past the pole
});

test('cellAt gives null exactly on the right edge', () => {
  // Pick the pixel size so the right edge (originX + width * pixelSize) is exactly 2 E.
  const edgeX = lonLatToMercator(2, 0).x;
  const grid = { width: 2, height: 2, originX: 0, originY: edgeX, pixelSize: edgeX / 2 };
  assert.equal(grid.originX + grid.width * grid.pixelSize, edgeX);
  assert.equal(cellAt(grid, 2, 0.5), null);
  assert.equal(cellAt(grid, 1.99, 0.5), 1 * grid.width + 1);
});
