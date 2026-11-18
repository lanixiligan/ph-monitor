// Tests for the rule that decides which weather points a town uses.
// Pure function only: no network, no database.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WeatherReading } from '../src/fetchers/openMeteo.ts';
import { OWN_POINT_KM, townPoints, worstByOwner } from '../src/weatherPoints.ts';

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

// A reading with the given rain; the rest is a mild day.
function reading(rain1hMm: number): WeatherReading {
  return { validAt: new Date('2026-11-17T10:00:00Z'), tempC: 27, humidityPct: 70, rain1hMm, rain24hMm: rain1hMm * 2 };
}

test('worst by owner: each owner gets the worst of its own points only', () => {
  const links = [
    { owner: 1, pointId: 10 },
    { owner: 1, pointId: 11 },
    { owner: 2, pointId: 11 },
  ];
  const readings = new Map([[10, reading(30)], [11, reading(2)]]);
  const result = worstByOwner(links, readings);
  assert.equal(result.get(1)?.rain1hMm, 30);
  assert.equal(result.get(2)?.rain1hMm, 2);
});

test('worst by owner: an owner whose points all failed has no reading', () => {
  const links = [{ owner: 1, pointId: 10 }, { owner: 2, pointId: 11 }];
  const readings = new Map([[10, null], [11, reading(5)]]);
  const result = worstByOwner(links, readings);
  assert.equal(result.has(1), false);
  assert.equal(result.get(2)?.rain1hMm, 5);
});
