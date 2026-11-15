// Tests for the scoring formulas. Run with: npm test
// Each test states one thing the score must do, in plain words.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildReasons,
  heatScore,
  quakeScore,
  radiusKm,
  rainScore,
  singleQuakeScore,
  totalScore,
  weatherScore,
  WEIGHTS,
} from '../src/scoring/scoring.ts';

// A shallow M6 right under the province, just now. Tests change one thing at a time.
const baseQuake = { magnitude: 6, depthKm: 10, distanceKm: 0, hoursAgo: 0 };
const calmWeather = { rain1hMm: 0, rain24hMm: 0, heatIndexC: 25 };

// ---------- Earthquakes ----------

test('radius doubles with each magnitude step and stops at 400 km', () => {
  assert.equal(radiusKm(4), 50);
  assert.equal(radiusKm(5), 100);
  assert.equal(radiusKm(6), 200);
  assert.equal(radiusKm(7), 400);
  assert.equal(radiusKm(8.5), 400);
});

test('a bigger quake scores higher', () => {
  assert.ok(singleQuakeScore({ ...baseQuake, magnitude: 7 }) > singleQuakeScore(baseQuake));
  assert.equal(singleQuakeScore({ ...baseQuake, magnitude: 7 }), 100);
});

test('a deeper quake scores lower', () => {
  const shallow = singleQuakeScore({ ...baseQuake, depthKm: 10 });
  const middle = singleQuakeScore({ ...baseQuake, depthKm: 150 });
  const deep = singleQuakeScore({ ...baseQuake, depthKm: 600 });

  assert.ok(shallow > middle);
  assert.ok(middle > deep);
  // Very deep quakes keep the floor share of their strength, never zero.
  assert.ok(Math.abs(deep - shallow * WEIGHTS.quake.deepDepthFade) < 0.001);
});

test('unknown depth is treated as shallow', () => {
  assert.equal(
    singleQuakeScore({ ...baseQuake, depthKm: null }),
    singleQuakeScore({ ...baseQuake, depthKm: 5 }),
  );
});

test('a closer quake scores higher, and outside the radius it scores 0', () => {
  const near = singleQuakeScore({ ...baseQuake, distanceKm: 10 });
  const far = singleQuakeScore({ ...baseQuake, distanceKm: 150 });

  assert.ok(near > far);
  assert.ok(far > 0);
  assert.equal(singleQuakeScore({ ...baseQuake, distanceKm: 201 }), 0);
});

test('an older quake scores lower, and after the window it scores 0', () => {
  const fresh = singleQuakeScore({ ...baseQuake, hoursAgo: 1 });
  const old = singleQuakeScore({ ...baseQuake, hoursAgo: 48 });

  assert.ok(fresh > old);
  assert.ok(old > 0);
  assert.equal(singleQuakeScore({ ...baseQuake, hoursAgo: 73 }), 0);
});

test('quakes below the minimum magnitude are ignored', () => {
  assert.equal(singleQuakeScore({ ...baseQuake, magnitude: 3.9 }), 0);
  assert.equal(quakeScore([{ ...baseQuake, magnitude: 3.9 }]), 0);
});

test('no quakes means a quake score of 0', () => {
  assert.equal(quakeScore([]), 0);
});

test('several quakes add a small bonus, with a limit', () => {
  const one = quakeScore([baseQuake]);
  const two = quakeScore([baseQuake, { ...baseQuake, magnitude: 5 }]);
  const many = quakeScore(Array.from({ length: 30 }, () => baseQuake));

  assert.equal(two, one + WEIGHTS.quake.extraQuakeBonus);
  assert.equal(many, one + WEIGHTS.quake.maxBonus);
  assert.ok(quakeScore(Array.from({ length: 30 }, () => ({ ...baseQuake, magnitude: 8 }))) <= 100);
});

// ---------- Weather ----------

test('rain score follows the warning thresholds', () => {
  assert.equal(rainScore({ ...calmWeather }), 0);
  assert.equal(rainScore({ ...calmWeather, rain1hMm: 7.5 }), 40);
  assert.equal(rainScore({ ...calmWeather, rain1hMm: 30 }), 85);
  assert.equal(rainScore({ ...calmWeather, rain24hMm: 100 }), 60);
  assert.equal(rainScore({ ...calmWeather, rain1hMm: 500 }), 100);
  // Halfway between two thresholds gives a score halfway between.
  assert.equal(rainScore({ ...calmWeather, rain1hMm: 11.25 }), 50);
});

test('rain score uses the worse of the 1-hour and 24-hour amounts', () => {
  assert.equal(rainScore({ ...calmWeather, rain1hMm: 7.5, rain24hMm: 200 }), 85);
});

test('heat score follows the heat-index bands', () => {
  assert.equal(heatScore({ ...calmWeather, heatIndexC: 26 }), 0);
  assert.equal(heatScore({ ...calmWeather, heatIndexC: 33 }), 10);
  assert.equal(heatScore({ ...calmWeather, heatIndexC: 42 }), 50);
  assert.equal(heatScore({ ...calmWeather, heatIndexC: 60 }), 100);
});

test('weather score is the higher of rain and heat', () => {
  assert.equal(weatherScore({ rain1hMm: 30, rain24hMm: 0, heatIndexC: 42 }), 85);
  assert.equal(weatherScore({ rain1hMm: 0, rain24hMm: 0, heatIndexC: 42 }), 50);
});

test('missing weather values count as 0, not as an error', () => {
  assert.equal(weatherScore(null), 0);
  assert.equal(weatherScore({ rain1hMm: null, rain24hMm: null, heatIndexC: null }), 0);
});

// ---------- Combining ----------

test('total = strongest signal + a fraction of the other, at most 100', () => {
  assert.equal(totalScore(80, 40), 90);
  assert.equal(totalScore(40, 80), 90);
  assert.equal(totalScore(0, 0), 0);
  assert.equal(totalScore(100, 100), 100);
});

// ---------- Reasons ----------

test('reasons name the quake and the weather that caused the score', () => {
  const reasons = buildReasons(
    [{ magnitude: 5.2, depthKm: 12, distanceKm: 34, hoursAgo: 5 }],
    { rain1hMm: 20, rain24hMm: 60, heatIndexC: 43 },
  );
  const text = reasons.join(' | ');

  assert.match(text, /M5\.2 earthquake 34 km away/);
  assert.match(text, /20 mm in the last hour/);
  assert.match(text, /Heat index 43 °C/);
});

test('for a single spot, the wording talks about the spot, not a province', () => {
  const reasons = buildReasons(
    [{ magnitude: 5.2, depthKm: 12, distanceKm: 0.4, hoursAgo: 5 }],
    null,
    'point',
  );
  const text = reasons.join(' | ');

  assert.match(text, /M5\.2 earthquake less than 1 km away/);
  assert.match(text, /No recent weather data for this spot/);
  assert.doesNotMatch(text, /province/);
});

test('a calm province gets one reassuring reason', () => {
  assert.deepEqual(buildReasons([], calmWeather), [
    'No significant earthquake or weather stress right now.',
  ]);
});
