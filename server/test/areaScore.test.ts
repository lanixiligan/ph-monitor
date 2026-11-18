// Tests for scoring one area (a town or a province) and for the rule that a
// province shows its highest town. Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { highestTown, scoreArea } from '../src/scoring/scoring.ts';
import type { AreaScore } from '../src/scoring/scoring.ts';

const calmWeather = { heatIndexC: 27, rain1hMm: 0, rain24hMm: 0 };
const quakeHere = { magnitude: 6.5, depthKm: 10, distanceKm: 0, hoursAgo: 1 };

test('area score: same formulas as before (a strong quake inside gives a high score)', () => {
  const area = scoreArea([quakeHere], calmWeather, [], []);
  assert.ok(area.quake >= 60, `quake part was ${area.quake}`);
  assert.equal(area.score >= area.quake, true);
  assert.deepEqual(area.unknown, []);
});

test('area score: no weather reading means weather is unknown, not calm', () => {
  const area = scoreArea([], null, [], []);
  assert.equal(area.weather, null);
  assert.deepEqual(area.unknown, ['weather']);
});

test('area score: one score per hazard, so the card can show the town hazard by hazard', () => {
  const area = scoreArea([quakeHere], { heatIndexC: 38, rain1hMm: null, rain24hMm: null }, [], []);
  assert.equal(area.hazards.quake, area.quake);
  assert.ok(area.hazards.heat !== null && area.hazards.heat > 0);
  // No rain reading at all: rain is unknown, not zero.
  assert.equal(area.hazards.rain, null);
  assert.equal(area.hazards.event, 0);
});

test('area score: a stale feed makes its signal unknown', () => {
  assert.deepEqual(scoreArea([], calmWeather, [], ['quake']).unknown, ['quake']);
});

// A finished town score with the given total and unknown signals.
function town(psgc: number, score: number, unknown: AreaScore['unknown'] = []) {
  return { psgc, area: {
    score, quake: score, weather: 0, event: 0, unknown, reasons: [],
    hazards: { quake: score, rain: 0, heat: 0, event: 0 },
  } };
}

test('highest town: the province takes the score of its highest town', () => {
  const top = highestTown([town(1, 12), town(2, 24), town(3, 5)]);
  assert.equal(top?.psgc, 2);
  assert.equal(top?.area.score, 24);
});

test('highest town: if any town is missing a signal, the province is too ("at least")', () => {
  const top = highestTown([town(1, 24), town(2, 3, ['weather'])]);
  assert.equal(top?.psgc, 1);
  assert.deepEqual(top?.area.unknown, ['weather']);
});

test('highest town: no towns means no answer (the province is scored as a whole)', () => {
  assert.equal(highestTown([]), null);
});
