// Tests for the rule that decides which weather points a town uses.
// Pure function only: no network, no database.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OWN_POINT_KM, townPoints } from '../src/weatherPoints.ts';

test('town points: a town with grid points inside it uses all of them', () => {
  assert.deepEqual(townPoints([4, 9], { id: 4, km: 0 }), { use: 'inside', ids: [4, 9] });
});

test('town points: a town with no point inside uses its nearest point', () => {
  assert.deepEqual(townPoints([], { id: 7, km: 12 }), { use: 'nearest', ids: [7] });
});

test('town points: a town far from every point gets a point of its own', () => {
  assert.deepEqual(townPoints([], { id: 7, km: OWN_POINT_KM + 1 }), { use: 'own', ids: [] });
});

test('town points: exactly at the limit still uses the nearest point', () => {
  assert.deepEqual(townPoints([], { id: 7, km: OWN_POINT_KM }), { use: 'nearest', ids: [7] });
});

test('town points: no points at all means a point of its own', () => {
  assert.deepEqual(townPoints([], null), { use: 'own', ids: [] });
});
