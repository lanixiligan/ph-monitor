// The PAR outline: PAGASA's corners, closed, in [longitude, latitude] order.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PAR_CORNERS, PAR_LABEL_AT, parGeoJson } from '../src/parArea.ts';

test('the PAR outline is closed: it ends where it starts', () => {
  assert.deepEqual(PAR_CORNERS[0], PAR_CORNERS[PAR_CORNERS.length - 1]);
});

test("the PAR corners are PAGASA's six points", () => {
  assert.deepEqual(PAR_CORNERS.slice(0, 6), [
    [120, 25],
    [135, 25],
    [135, 5],
    [115, 5],
    [115, 15],
    [120, 21],
  ]);
});

test('every corner is longitude first (115–135°E), then latitude (5–25°N)', () => {
  for (const [lon, lat] of PAR_CORNERS) {
    assert.ok(lon >= 115 && lon <= 135);
    assert.ok(lat >= 5 && lat <= 25);
  }
  assert.deepEqual(PAR_LABEL_AT, [127.5, 25]);
});

test('parGeoJson gives one line with those corners', () => {
  const shape = parGeoJson();
  assert.equal(shape.features.length, 1);
  assert.deepEqual(shape.features[0]?.geometry.coordinates, PAR_CORNERS);
});
