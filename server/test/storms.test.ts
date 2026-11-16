// Checks the storm parsers (JMA main, JTWC backup) without network or database.
// Run with: npm test
// Samples are in test/fixtures/storms (see the README.txt there for which are real).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { parseJmaStorms } from '../src/fetchers/jma.ts';
import { buildJtwcStorm, parseJtwcFeed, parseJtwcWarningText } from '../src/fetchers/jtwc.ts';

const DIR = new URL('./fixtures/storms/', import.meta.url);
const readText = (name: string): string => readFileSync(new URL(name, DIR), 'utf8');
const readJson = (name: string): unknown => JSON.parse(readText(name));

// A fixed "now" near the samples, so month and year come out the same every run.
const NOW = new Date('2026-11-16T05:00:00Z');

function jmaSample(): { targetTc: unknown; files: Record<string, { forecast: unknown; specifications: unknown }> } {
  return {
    targetTc: readJson('jma-sample/targetTc.json'),
    files: {
      TC9901: {
        forecast: readJson('jma-sample/forecast.json'),
        specifications: readJson('jma-sample/specifications.json'),
      },
    },
  };
}

test('JMA: an empty list means no storms (a normal day)', () => {
  const result = parseJmaStorms([], {});

  assert.deepEqual(result, { storms: [], skipped: 0 });
});

test('JMA: the sample storm gives past, now and forecast points', () => {
  const { targetTc, files } = jmaSample();
  const result = parseJmaStorms(targetTc, files);

  assert.equal(result.skipped, 0);
  assert.equal(result.storms.length, 1);
  const storm = result.storms[0];
  assert.equal(storm?.id, 'jma:TC9901');
  assert.equal(storm?.source, 'jma');
  assert.equal(storm?.name, 'Sample');
  assert.equal(storm?.category, 'TY');
  assert.equal(storm?.updatedAt.toISOString(), '2026-11-16T12:50:00.000Z');

  const track = storm?.track ?? [];
  // 5 past + 1 now + 5 forecast. The "1 hour ahead" slot is not a forecast point.
  assert.equal(track.length, 11);
  assert.equal(track.filter((point) => !point.isForecast).length, 6);
  assert.equal(track.filter((point) => point.isForecast).length, 5);

  // Oldest first.
  const times = track.map((point) => point.validAt.getTime());
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test('JMA: units and values of the analysis and a forecast point', () => {
  const { targetTc, files } = jmaSample();
  const track = parseJmaStorms(targetTc, files).storms[0]?.track ?? [];

  // "Now": 21:00 Japan time is 12:00 UTC. JMA writes positions as [lat, lon].
  const now = track.find((point) => !point.isForecast && point.validAt.toISOString() === '2026-11-16T12:00:00.000Z');
  assert.equal(now?.lat, 14.7);
  assert.equal(now?.lon, 124.0);
  assert.equal(now?.pressureHpa, 960);
  assert.equal(now?.windKt, 75);
  assert.equal(now?.radiusKm, null);

  // The 12 hour forecast: radius 40000 m becomes 40 km; text numbers are read.
  const forecast = track.find((point) => point.validAt.toISOString() === '2026-11-17T00:00:00.000Z');
  assert.equal(forecast?.isForecast, true);
  assert.equal(forecast?.lat, 15.0);
  assert.equal(forecast?.radiusKm, 40);
  assert.equal(forecast?.pressureHpa, 955);
  assert.equal(forecast?.windKt, 80);

  // The last past point comes just before "now" (6 hour steps back).
  const lastPast = track.filter((point) => !point.isForecast).at(-2);
  assert.equal(lastPast?.validAt.toISOString(), '2026-11-16T06:00:00.000Z');
  assert.equal(lastPast?.lat, 14.5);
});

test('JMA: a broken storm is skipped, a good one is kept', () => {
  const { files } = jmaSample();
  const targetTc = [
    { tropicalCyclone: 'TC9901', typhoonNumber: '9901' },
    { tropicalCyclone: 'TC9902', typhoonNumber: '9902' },
    { tropicalCyclone: 'TC9903' },
    { nothing: 'useful' },
  ];
  const allFiles = {
    ...files,
    // No analysis slot at all.
    TC9902: { forecast: [{ part: 'title' }], specifications: [] },
    // A position outside the globe.
    TC9903: {
      forecast: [{ advancedHours: 0, validtime: { JST: '2026-11-16T21:00:00+09:00' }, center: [99, 124] }],
      specifications: [],
    },
  };
  const result = parseJmaStorms(targetTc, allFiles);

  assert.equal(result.storms.length, 1);
  assert.equal(result.storms[0]?.id, 'jma:TC9901');
  assert.equal(result.skipped, 3);
});

test('JMA: something that is not a list is rejected', () => {
  assert.throws(() => parseJmaStorms({ oops: true }, {}));
});

test('JTWC: the real feed with no warning gives no storms', () => {
  const result = parseJtwcFeed(readText('jtwc-real-2026-11-16.rss'), NOW);

  assert.deepEqual(result, { listings: [], skipped: 0 });
});

test('JTWC: a Northwest Pacific warning is listed, other basins are not', () => {
  const result = parseJtwcFeed(readText('jtwc-nwpac-CONSTRUCTED.rss'), NOW);

  // 28W is kept; 03B is the North Indian Ocean and is dropped.
  assert.equal(result.listings.length, 1);
  const listing = result.listings[0];
  assert.equal(listing?.id, '28W');
  assert.equal(listing?.name, 'Sample');
  assert.equal(listing?.category, 'TY');
  assert.equal(listing?.warningNumber, 12);
  assert.equal(listing?.url, 'https://www.metoc.navy.mil/jtwc/products/wp2826web.txt');
  assert.equal(listing?.issuedAt.toISOString(), '2026-11-15T21:00:00.000Z');
});

test('JTWC: the real warning text gives the position now and the forecasts', () => {
  const points = parseJtwcWarningText(readText('jtwc-warning-real-sh04.txt'), new Date('2026-11-15T21:00:00Z'));

  // Now, then 12, 24, 36, 48, 60, 72, 96 and 120 hours ahead.
  assert.equal(points.length, 9);
  const now = points[0];
  assert.equal(now?.isForecast, false);
  assert.equal(now?.validAt.toISOString(), '2026-11-15T18:00:00.000Z');
  // South and west are negative.
  assert.equal(now?.lat, -8.1);
  assert.equal(now?.lon, -160.1);
  assert.equal(now?.windKt, 40);

  const day1 = points[2];
  assert.equal(day1?.isForecast, true);
  assert.equal(day1?.validAt.toISOString(), '2026-11-16T18:00:00.000Z');
  assert.equal(day1?.windKt, 70);
  assert.equal(day1?.radiusKm, null);
});

test('JTWC: a storm is built from a listing, and no positions means an empty track', () => {
  const { listings } = parseJtwcFeed(readText('jtwc-nwpac-CONSTRUCTED.rss'), NOW);
  const listing = listings[0];
  assert.ok(listing);

  const storm = buildJtwcStorm(listing, parseJtwcWarningText('not a warning at all', NOW));

  assert.equal(storm?.id, 'jtwc:28W');
  assert.equal(storm?.source, 'jtwc');
  assert.deepEqual(storm?.track, []);
});

test('JTWC: something that is not RSS is rejected', () => {
  assert.throws(() => parseJtwcFeed('<html>blocked</html>', NOW));
});
