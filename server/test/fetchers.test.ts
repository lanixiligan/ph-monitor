// Checks that the feed parsers accept good records and reject bad ones.
// Run with: npm test
// No network or database is used: the samples below are copied from real feeds.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseUsgsFeed } from '../src/fetchers/usgs.ts';

// One real USGS record (trimmed to the fields we read, plus one extra).
const goodQuake = {
  type: 'Feature',
  id: 'us7000ty9v',
  properties: {
    mag: 4.6,
    place: '96 km SSE of Pondaguitan, Philippines',
    time: 1794675399533,
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000ty9v',
    status: 'reviewed',
  },
  geometry: { type: 'Point', coordinates: [126.6097, 5.5982, 65.399] },
};

test('USGS: a good record is accepted and converted', () => {
  const result = parseUsgsFeed({ features: [goodQuake] });

  assert.equal(result.skipped, 0);
  assert.equal(result.quakes.length, 1);

  const quake = result.quakes[0];
  assert.equal(quake?.id, 'us7000ty9v');
  assert.equal(quake?.magnitude, 4.6);
  assert.equal(quake?.depthKm, 65.399);
  assert.equal(quake?.lon, 126.6097);
  assert.equal(quake?.lat, 5.5982);
  assert.equal(quake?.occurredAt.toISOString(), '2026-11-14T16:56:39.533Z');
});

test('USGS: a missing depth is allowed', () => {
  const noDepth = {
    ...goodQuake,
    geometry: { type: 'Point', coordinates: [126.6097, 5.5982, null] },
  };
  const result = parseUsgsFeed({ features: [noDepth] });

  assert.equal(result.quakes[0]?.depthKm, null);
});

test('USGS: broken records are skipped, good ones are kept', () => {
  const noMagnitude = { ...goodQuake, id: 'bad1', properties: { ...goodQuake.properties, mag: null } };
  const badLatitude = {
    ...goodQuake,
    id: 'bad2',
    geometry: { type: 'Point', coordinates: [126.6, 95, 10] },
  };
  const noId = { ...goodQuake, id: undefined };

  const result = parseUsgsFeed({
    features: [noMagnitude, goodQuake, badLatitude, noId, 'not even an object'],
  });

  assert.equal(result.quakes.length, 1);
  assert.equal(result.quakes[0]?.id, 'us7000ty9v');
  assert.equal(result.skipped, 4);
});

test('USGS: a response that is not a feed at all throws', () => {
  assert.throws(() => parseUsgsFeed({ error: 'server exploded' }));
});
