// Tests for the historical replay's own logic (src/replay/replay.ts).
// Run with: npm test. Pure functions only: no database, no internet.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventsAt, parseBestTrack, quakesAt, summarize } from '../src/replay/replay.ts';
import type { ProvinceEvent, ReplayStep } from '../src/replay/replay.ts';

const at = (text: string) => new Date(text);

test('quakesAt: only quakes that have already happened, and not older than the 72-hour window', () => {
  const quakes = [
    { magnitude: 7, depthKm: 10, distanceKm: 5, occurredAt: at('2022-07-27T00:43:00Z') },
    { magnitude: 5, depthKm: null, distanceKm: 40, occurredAt: at('2022-07-23T00:00:00Z') },
  ];
  // An hour before the big quake: nothing recent enough.
  assert.deepEqual(quakesAt(quakes, at('2022-07-26T23:43:00Z')), []);
  // Two hours after: the big quake only, with its age in hours.
  assert.deepEqual(quakesAt(quakes, at('2022-07-27T02:43:00Z')), [
    { magnitude: 7, depthKm: 10, distanceKm: 5, hoursAgo: 2 },
  ]);
  // Four days later it has dropped out again.
  assert.deepEqual(quakesAt(quakes, at('2022-07-31T00:00:00Z')), []);
});

const typhoon: ProvinceEvent = {
  kind: 'typhoon',
  alertLevel: 'red',
  startedAt: at('2021-12-13T00:00:00Z'),
  endedAt: at('2021-12-20T18:00:00Z'),
  positions: [
    { at: at('2021-12-15T00:00:00Z'), distanceKm: 900 },
    { at: at('2021-12-16T00:00:00Z'), distanceKm: 150 },
    { at: at('2021-12-16T06:00:00Z'), distanceKm: 0 },
  ],
};

test('eventsAt: an event counts from its start, measured from where it was at that hour', () => {
  assert.deepEqual(eventsAt([typhoon], at('2021-12-12T12:00:00Z')), []); // not started
  assert.deepEqual(eventsAt([typhoon], at('2021-12-14T00:00:00Z')), []); // started, position not known yet
  assert.deepEqual(eventsAt([typhoon], at('2021-12-16T03:00:00Z')), [
    { kind: 'typhoon', alertLevel: 'red', distanceKm: 150, hoursSinceEnd: null },
  ]);
  assert.deepEqual(eventsAt([typhoon], at('2021-12-16T06:00:00Z')), [
    { kind: 'typhoon', alertLevel: 'red', distanceKm: 0, hoursSinceEnd: null },
  ]);
});

test('eventsAt: after its end an event reports how long ago it ended (the formula then fades it)', () => {
  assert.deepEqual(eventsAt([typhoon], at('2021-12-21T00:00:00Z')), [
    { kind: 'typhoon', alertLevel: 'red', distanceKm: 0, hoursSinceEnd: 6 },
  ]);
});

test('parseBestTrack: reads one storm from a JMA best-track file (positions in tenths of a degree)', () => {
  const file = [
    '66666 1329  012 0035 1329 0 6               KROSA              20131218        ',
    '13102918 002 2 150 1340 1004     000                                            ',
    '66666 1330  033 0036 1330 0 6               HAIYAN              20131218        ',
    '13110718 002 5 106 1269  895     125     90080 0080 80250 0180                  ',
    '13110800 002 5 110 1248  910     110     90070 0070 80250 0180                  ',
    '66666 9901  002 0001 9901 0 6               OLD                 19990101        ',
    '99010100 002 2 100 1300 1000     000                                            ',
  ].join('\n');
  assert.deepEqual(parseBestTrack(file, 'HAIYAN', 2013), [
    { at: at('2013-11-07T18:00:00Z'), lat: 10.6, lon: 126.9 },
    { at: at('2013-11-08T00:00:00Z'), lat: 11, lon: 124.8 },
  ]);
  // Years before 2000 are read as 19xx, and an unknown storm gives nothing.
  assert.deepEqual(parseBestTrack(file, 'OLD', 1999), [{ at: at('1999-01-01T00:00:00Z'), lat: 10, lon: 130 }]);
  assert.deepEqual(parseBestTrack(file, 'HAIYAN', 2007), []);
});

function step(time: string, score: number): ReplayStep {
  return { at: at(time), score, quake: score, weather: 0, event: 0 };
}

test('summarize: the peak, the first hour at "High" (60 or more) and how that compares with the key time', () => {
  const steps = [
    step('2022-07-26T23:00:00Z', 4),
    step('2022-07-27T00:00:00Z', 4),
    step('2022-07-27T01:00:00Z', 88),
    step('2022-07-27T02:00:00Z', 87),
    step('2022-07-27T03:00:00Z', 59),
  ];
  const summary = summarize(steps, at('2022-07-27T00:43:00Z'));
  assert.equal(summary.peak?.score, 88);
  assert.deepEqual(summary.firstHighAt, at('2022-07-27T01:00:00Z'));
  assert.equal(summary.highHours, 2);
  // 17 minutes after the key time, as a share of an hour.
  assert.ok(Math.abs((summary.hoursFromKey ?? 0) - 17 / 60) < 0.001);
});

test('summarize: a province that never reaches "High" says so', () => {
  const summary = summarize([step('2022-07-27T00:00:00Z', 30), step('2022-07-27T01:00:00Z', 59)], at('2022-07-27T00:43:00Z'));
  assert.equal(summary.firstHighAt, null);
  assert.equal(summary.hoursFromKey, null);
  assert.equal(summary.highHours, 0);
  assert.equal(summary.peak?.score, 59);
});
