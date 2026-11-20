// Tests for the Earthquake view's quake list (src/quakeMap.ts). Run with: npm test
// Pure functions only: no database.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// `import type` brings in a type only; it disappears when the code runs.
import type { FeedHealth } from '@ph-monitor/shared';
import { buildQuakeMap, toQuakePoint, webUrlOrNull } from '../src/quakeMap.ts';
import type { QuakeRow } from '../src/quakeMap.ts';
import { WEIGHTS } from '../src/scoring/scoring.ts';

const row: QuakeRow = {
  id: 'us7000abcd',
  magnitude: 5.2,
  depth_km: 33,
  place: '7 km SE of Tagbina, Philippines',
  occurred_at: new Date('2026-11-16T10:00:00Z'),
  url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd',
  lat: 8.4,
  lon: 126.2,
};

test('a row becomes a QuakePoint with an ISO time', () => {
  assert.deepEqual(toQuakePoint(row), {
    id: 'us7000abcd',
    magnitude: 5.2,
    depthKm: 33,
    place: '7 km SE of Tagbina, Philippines',
    occurredAt: '2026-11-16T10:00:00.000Z',
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000abcd',
    lat: 8.4,
    lon: 126.2,
  });
});

test('only http and https links are sent', () => {
  assert.equal(webUrlOrNull('http://example.org/a'), 'http://example.org/a');
  assert.equal(webUrlOrNull('HTTPS://example.org/a'), 'HTTPS://example.org/a');
  assert.equal(webUrlOrNull('javascript:alert(1)'), null);
  assert.equal(webUrlOrNull('ftp://example.org/a'), null);
  assert.equal(webUrlOrNull(''), null);
  assert.equal(webUrlOrNull(null), null);
  assert.equal(toQuakePoint({ ...row, url: 'javascript:alert(1)' }).url, null);
});

test('the window comes from the score, and the freshness from the earthquake feed', () => {
  const health: FeedHealth[] = [
    { id: 'weather', lastOkAt: '2026-11-16T11:00:00.000Z', isStale: false },
    { id: 'earthquakes', lastOkAt: '2026-11-16T09:00:00.000Z', isStale: true },
  ];
  const map = buildQuakeMap([row], health);
  assert.equal(map.windowHours, WEIGHTS.quake.windowHours);
  assert.equal(map.fetchedAt, '2026-11-16T09:00:00.000Z');
  assert.equal(map.isStale, true);
  assert.equal(map.quakes.length, 1);
});

test('unknown is never calm: no earthquake feed entry means stale and never fetched', () => {
  const map = buildQuakeMap([], []);
  assert.equal(map.fetchedAt, null);
  assert.equal(map.isStale, true);
  assert.deepEqual(map.quakes, []);
});
