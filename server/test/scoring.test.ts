// Tests for the scoring formulas. Run with: npm test
// Each test states one thing the score must do, in plain words.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildReasons,
  combineSignals,
  eventScore,
  heatScore,
  quakeScore,
  radiusKm,
  rainScore,
  singleEventScore,
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

test('missing weather is unknown (null), never 0', () => {
  assert.equal(weatherScore(null), null);
  assert.equal(weatherScore({ rain1hMm: null, rain24hMm: null, heatIndexC: null }), null);
});

test('a reading with only some values is scored from what it has', () => {
  assert.equal(weatherScore({ rain1hMm: 30, rain24hMm: null, heatIndexC: null }), 85);
});

// ---------- Unknown signals ----------

test('all signals known: the score is the usual total and nothing is unknown', () => {
  assert.deepEqual(combineSignals({ quake: 80, weather: 40, event: 0 }), { score: 90, unknown: [] });
});

test('an unknown signal is named, and the score is built from the known ones', () => {
  assert.deepEqual(combineSignals({ quake: 40, weather: null, event: 20 }), {
    score: 45,
    unknown: ['weather'],
  });
});

test('nothing known: score 0 with every signal named', () => {
  assert.deepEqual(combineSignals({ quake: null, weather: null, event: null }), {
    score: 0,
    unknown: ['quake', 'weather', 'event'],
  });
});

test('an unknown signal is given as a reason, and the place is never called calm', () => {
  assert.deepEqual(buildReasons([], calmWeather, 'province', [], ['quake', 'event']), [
    { key: 'noQuakeData' },
    { key: 'noEventData' },
  ]);
  assert.deepEqual(buildReasons([], null, 'province', [], ['weather']), [
    { key: 'noWeather', target: 'province' },
  ]);
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

  // Reasons are message keys plus numbers; the web app turns them into words.
  assert.deepEqual(reasons, [
    { key: 'quake', target: 'province', magnitude: 5.2, distanceKm: 34, isVeryClose: false, depthKm: 12, hoursAgo: 5 },
    { key: 'rain', rain1hMm: 20, rain24hMm: 60, level: 'orange' },
    { key: 'heat', heatIndexC: 43, band: 'danger' },
  ]);
});

test('for a single spot, the reasons say the target is the spot', () => {
  const reasons = buildReasons(
    [{ magnitude: 5.2, depthKm: null, distanceKm: 0.4, hoursAgo: 0.2 }],
    null,
    'point',
  );

  assert.deepEqual(reasons, [
    { key: 'quake', target: 'point', magnitude: 5.2, distanceKm: 0, isVeryClose: true, depthKm: null, hoursAgo: 0 },
    { key: 'noWeather', target: 'point' },
  ]);
});

test('more than three quakes are summed up in one extra reason', () => {
  const quake = { magnitude: 5.2, depthKm: 12, distanceKm: 34, hoursAgo: 5 };
  const reasons = buildReasons([quake, quake, quake, quake, quake], calmWeather);
  assert.equal(reasons.length, 4);
  assert.deepEqual(reasons[3], { key: 'moreQuakes', count: 2 });
});

test('a calm province gets one reassuring reason', () => {
  assert.deepEqual(buildReasons([], calmWeather), [{ key: 'calm' }]);
});

// ---------- Disaster events (GDACS alert levels) ----------

// An ongoing Orange typhoon right at the province. Tests change one thing at a time.
const baseEvent = { kind: 'typhoon' as const, alertLevel: 'orange' as const, distanceKm: 0, hoursSinceEnd: null };

test('a higher alert level scores higher: green < orange < red', () => {
  const green = singleEventScore({ ...baseEvent, alertLevel: 'green' });
  const orange = singleEventScore(baseEvent);
  const red = singleEventScore({ ...baseEvent, alertLevel: 'red' });

  assert.equal(green, WEIGHTS.event.levelScore.green);
  assert.equal(orange, WEIGHTS.event.levelScore.orange);
  assert.equal(red, WEIGHTS.event.levelScore.red);
  assert.ok(green < orange && orange < red);
});

test('a closer event scores higher, and outside its reach it scores 0', () => {
  const reach = WEIGHTS.event.reachKm.orange;
  const near = singleEventScore({ ...baseEvent, distanceKm: 10 });
  const far = singleEventScore({ ...baseEvent, distanceKm: reach - 1 });

  assert.ok(near > far);
  assert.ok(far > 0);
  assert.equal(singleEventScore({ ...baseEvent, distanceKm: reach + 1 }), 0);
});

test('a red alert reaches further than an orange one', () => {
  const distanceKm = WEIGHTS.event.reachKm.orange + 20;
  assert.equal(singleEventScore({ ...baseEvent, distanceKm }), 0);
  assert.ok(singleEventScore({ ...baseEvent, alertLevel: 'red', distanceKm }) > 0);
});

test('an event with no alert level does not score', () => {
  assert.equal(singleEventScore({ ...baseEvent, alertLevel: null }), 0);
});

test('earthquake and drought events do not score (quakes are already counted from USGS)', () => {
  assert.equal(singleEventScore({ ...baseEvent, kind: 'earthquake', alertLevel: 'red' }), 0);
  assert.equal(singleEventScore({ ...baseEvent, kind: 'drought', alertLevel: 'red' }), 0);
  assert.ok(singleEventScore({ ...baseEvent, kind: 'flood' }) > 0);
  assert.ok(singleEventScore({ ...baseEvent, kind: 'volcano' }) > 0);
});

test('an event that has ended fades out and then stops counting', () => {
  const ongoing = singleEventScore(baseEvent);
  const justEnded = singleEventScore({ ...baseEvent, hoursSinceEnd: WEIGHTS.event.endedFadeHours / 2 });

  assert.ok(Math.abs(justEnded - ongoing / 2) < 0.001);
  assert.equal(singleEventScore({ ...baseEvent, hoursSinceEnd: WEIGHTS.event.endedFadeHours + 1 }), 0);
});

test('the event score is the strongest event, and 0 with no events', () => {
  assert.equal(eventScore([]), 0);
  assert.equal(
    eventScore([{ ...baseEvent, alertLevel: 'green' }, { ...baseEvent, alertLevel: 'red' }]),
    WEIGHTS.event.levelScore.red,
  );
});

test('a province beside an Orange event scores higher than the same province without it', () => {
  const quake = quakeScore([{ ...baseQuake, magnitude: 4.5, distanceKm: 30 }]);
  const weather = weatherScore(calmWeather) ?? 0;
  const withEvent = eventScore([{ ...baseEvent, distanceKm: 20 }]);

  assert.ok(totalScore(quake, weather, withEvent) > totalScore(quake, weather));
});

test('with three signals the strongest counts in full and each other adds a share', () => {
  assert.equal(totalScore(40, 20, 80), 80 + WEIGHTS.secondaryWeight * 40 + WEIGHTS.secondaryWeight * 20);
  assert.equal(totalScore(40, 20), totalScore(40, 20, 0));
  assert.equal(totalScore(90, 90, 90), 100);
});

test('an event that scores is named in the reasons with its level and distance', () => {
  const reasons = buildReasons([], calmWeather, 'province', [{ ...baseEvent, distanceKm: 120 }]);
  assert.deepEqual(reasons, [
    { key: 'event', target: 'province', alertLevel: 'orange', kind: 'typhoon', distanceKm: 120, isVeryClose: false, hasEnded: false },
  ]);
});

test('an event that does not score is not mentioned', () => {
  const reasons = buildReasons([], calmWeather, 'province', [{ ...baseEvent, alertLevel: null }]);
  assert.deepEqual(reasons, buildReasons([], calmWeather));
});
