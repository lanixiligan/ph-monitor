// Tests for "which jobs are due?" (src/jobs/due.ts). Run with: npm test
// Pure functions only: no database, and the clock is passed in.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dueJobs, isDue, jobsOnTick, SLOW_JOBS } from '../src/jobs/due.ts';

const now = new Date('2026-11-17T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);

// Every job ran 5 minutes ago. Tests change one thing at a time.
function allRecent(): Map<string, Date> {
  const names = [
    'usgs', 'open-meteo', 'pagasa', 'news', 'gdacs', 'eonet', 'jma', 'jtwc',
    'open-meteo-daily', 'check:feed', 'check:stream', 'open-meteo-heat',
  ];
  return new Map(names.map((name) => [name, minutesAgo(5)]));
}

test('isDue: a job that never ran is due', () => {
  assert.equal(isDue(null, 15, now), true);
});

test('isDue: not due before its interval has passed, due after', () => {
  assert.equal(isDue(minutesAgo(10), 15, now), false);
  assert.equal(isDue(minutesAgo(15), 15, now), true);
  assert.equal(isDue(minutesAgo(200), 15, now), true);
});

test('isDue: a run that finished a few seconds late still counts (one minute of slack)', () => {
  assert.equal(isDue(new Date(now.getTime() - (15 * 60 - 20) * 1000), 15, now), true);
});

test('dueJobs: nothing is due right after everything ran (a restart fetches nothing)', () => {
  assert.deepEqual(dueJobs(allRecent(), now), []);
});

test('dueJobs: with an empty database every job is due', () => {
  assert.deepEqual(dueJobs(new Map(), now), [
    'earthquakes', 'weather', 'alerts', 'news', 'events', 'storms', 'streamCheck', 'feedCheck', 'outlook', 'heatMap',
  ]);
});

test('dueJobs: each job follows its own interval', () => {
  const runs = allRecent();
  runs.set('usgs', minutesAgo(20)); // every 15 minutes: due
  runs.set('open-meteo', minutesAgo(100)); // every 2 hours: not due
  runs.set('open-meteo-daily', minutesAgo(5 * 60)); // every 6 hours: not due
  assert.deepEqual(dueJobs(runs, now), ['earthquakes']);

  runs.set('open-meteo', minutesAgo(120));
  runs.set('open-meteo-daily', minutesAgo(6 * 60));
  assert.deepEqual(dueJobs(runs, now), ['earthquakes', 'weather', 'outlook']);
});

test('dueJobs: events are due when either of their two feeds is old', () => {
  const runs = allRecent();
  runs.set('eonet', minutesAgo(45));
  assert.deepEqual(dueJobs(runs, now), ['events']);
});

test('dueJobs: storms are not due while one of JMA or JTWC is recent (JTWC is only the backup)', () => {
  const runs = allRecent();
  runs.delete('jtwc');
  assert.deepEqual(dueJobs(runs, now), []);
  runs.set('jma', minutesAgo(45));
  assert.deepEqual(dueJobs(runs, now), ['storms']);
});

test('jobsOnTick: the clock decides which jobs a tick wants', () => {
  assert.deepEqual(jobsOnTick(15), ['earthquakes', 'alerts', 'news']);
  assert.deepEqual(jobsOnTick(30), ['earthquakes', 'alerts', 'news', 'events', 'storms', 'streamCheck']);
  assert.deepEqual(jobsOnTick(0), [
    'earthquakes', 'weather', 'alerts', 'news', 'events', 'storms', 'streamCheck', 'feedCheck', 'outlook', 'heatMap',
  ]);
});

test('slow jobs: weather (every 2 hours), the outlook and the heat map must also be due when a tick wants them', () => {
  assert.deepEqual(SLOW_JOBS, ['weather', 'outlook', 'heatMap']);
});

test('dueJobs: the heat map runs every 12 hours', () => {
  const runs = allRecent();
  runs.set('open-meteo-heat', minutesAgo(11 * 60));
  assert.deepEqual(dueJobs(runs, now), []);
  runs.set('open-meteo-heat', minutesAgo(12 * 60));
  assert.deepEqual(dueJobs(runs, now), ['heatMap']);
});

test('dueJobs: a heat run stamped minutes after its tick is due at the tick 12 hours later', () => {
  // Stamped at 00:07 (it ends a few minutes after the 00:00 tick); now is the 12:00 tick.
  const runs = allRecent();
  runs.set('open-meteo-heat', minutesAgo(11 * 60 + 53));
  assert.deepEqual(dueJobs(runs, now), ['heatMap']);
});
