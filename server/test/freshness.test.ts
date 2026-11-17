// Tests for "how fresh is each feed?" (src/freshness.ts). Run with: npm test
// Pure functions only: no database, and the clock is passed in.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFeedHealth, isFreshEnough, staleSignals } from '../src/freshness.ts';

const now = new Date('2026-11-16T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);

// Every feed fetched 5 minutes ago. Tests change one thing at a time.
function allFresh(): Map<string, Date> {
  const names = ['usgs', 'open-meteo', 'pagasa', 'gdacs', 'eonet', 'jma', 'jtwc', 'open-meteo-daily', 'open-meteo-flood', 'news'];
  return new Map(names.map((name) => [name, minutesAgo(5)]));
}

// Finds one feed in the answer; fails the test if it is not there.
function feed(health: ReturnType<typeof buildFeedHealth>, id: string) {
  const found = health.find((entry) => entry.id === id);
  assert.ok(found, `feed ${id} is missing`);
  return found;
}

test('every feed is listed, and none is stale when all were just fetched', () => {
  const health = buildFeedHealth(allFresh(), now);
  assert.deepEqual(
    health.map((entry) => entry.id),
    ['earthquakes', 'weather', 'officialAlerts', 'events', 'naturalEvents', 'storms', 'outlook', 'riverFlow', 'news'],
  );
  assert.ok(health.every((entry) => !entry.isStale));
});

test('a feed that never succeeded is stale and has no time', () => {
  const lastOk = allFresh();
  lastOk.delete('gdacs');
  assert.deepEqual(feed(buildFeedHealth(lastOk, now), 'events'), { id: 'events', lastOkAt: null, isStale: true });
});

test('each feed has its own limit: 3 hours is stale for weather, fine for the outlook', () => {
  const lastOk = allFresh();
  lastOk.set('open-meteo', minutesAgo(180));
  lastOk.set('open-meteo-daily', minutesAgo(180));
  const health = buildFeedHealth(lastOk, now);
  assert.equal(feed(health, 'weather').isStale, true);
  assert.equal(feed(health, 'outlook').isStale, false);
});

test('storm tracks are fresh while either JMA or JTWC is', () => {
  const lastOk = allFresh();
  lastOk.set('jtwc', minutesAgo(600));
  assert.equal(feed(buildFeedHealth(lastOk, now), 'storms').isStale, false);
  lastOk.set('jma', minutesAgo(600));
  assert.equal(feed(buildFeedHealth(lastOk, now), 'storms').isStale, true);
});

test('a stale earthquake or event feed makes that score signal unknown', () => {
  const lastOk = allFresh();
  assert.deepEqual(staleSignals(buildFeedHealth(lastOk, now)), []);
  lastOk.set('usgs', minutesAgo(61));
  lastOk.delete('gdacs');
  assert.deepEqual(staleSignals(buildFeedHealth(lastOk, now)), ['quake', 'event']);
});

test('a weather run counts as fresh only when at least 90% of provinces were saved', () => {
  assert.equal(isFreshEnough(88, 88), true);
  assert.equal(isFreshEnough(80, 88), true);
  assert.equal(isFreshEnough(79, 88), false);
  assert.equal(isFreshEnough(0, 0), false);
});
