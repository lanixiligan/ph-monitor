// Checks that the 7-day outlook parsers accept good records and reject bad ones.
// Run with: npm test
// No network or database is used: the samples below are copied from real answers.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseDailyLocation } from '../src/fetchers/openMeteoDaily.ts';
import { parseFloodLocation } from '../src/fetchers/openMeteoFlood.ts';

const days = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

// Real answer for one point (Manila area), trimmed to the fields we read.
const goodDaily = {
  latitude: 14.586995,
  longitude: 121.002785,
  daily: {
    time: days,
    precipitation_sum: [0.0, 0.0, 1.3, 2.2, 1.8, 3.9, 0.0],
    wind_gusts_10m_max: [31.7, 32.0, 35.6, 31.3, 25.2, 30.6, 32.0],
  },
};

const goodFlood = {
  latitude: 14.575005,
  longitude: 121.025024,
  daily: {
    time: days,
    river_discharge: [4.27, 4.21, 3.24, 1.94, 1.52, 1.32, 2.33],
  },
};

test('Daily: a good answer gives 7 days with the right dates', () => {
  const result = parseDailyLocation(goodDaily);

  assert.equal(result?.length, 7);
  assert.equal(result?.[0]?.day, '2026-11-16');
  assert.equal(result?.[6]?.day, '2026-11-22');
  assert.equal(result?.[2]?.rainMm, 1.3);
  assert.equal(result?.[2]?.gustKmh, 35.6);
});

test('Daily: missing values are allowed', () => {
  const withNulls = {
    daily: { ...goodDaily.daily, precipitation_sum: [null, 0, 0, 0, 0, 0, 0] },
  };
  const result = parseDailyLocation(withNulls);

  assert.equal(result?.[0]?.rainMm, null);
  assert.equal(result?.[0]?.gustKmh, 31.7);
});

test('Daily: lists of different lengths are rejected', () => {
  const uneven = {
    daily: { ...goodDaily.daily, wind_gusts_10m_max: [31.7, 32.0] },
  };

  assert.equal(parseDailyLocation(uneven), null);
});

test('Daily: broken locations are skipped, good ones are kept', () => {
  const negativeRain = { daily: { ...goodDaily.daily, precipitation_sum: [-5, 0, 0, 0, 0, 0, 0] } };
  const badDate = { daily: { ...goodDaily.daily, time: ['16/11/2026', ...days.slice(1)] } };
  const results = [goodDaily, negativeRain, {}, badDate, goodDaily].map(parseDailyLocation);

  assert.equal(results.filter((r) => r !== null).length, 2);
  assert.equal(results[1], null);
  assert.equal(results[2], null);
  assert.equal(results[3], null);
});

test('Flood: a good answer gives 7 days with the right dates', () => {
  const result = parseFloodLocation(goodFlood);

  assert.equal(result?.length, 7);
  assert.equal(result?.[0]?.day, '2026-11-16');
  assert.equal(result?.[6]?.day, '2026-11-22');
  assert.equal(result?.[0]?.riverDischargeM3s, 4.27);
});

test('Flood: no river (null values) is allowed', () => {
  const noRiver = { daily: { time: days, river_discharge: days.map(() => null) } };
  const result = parseFloodLocation(noRiver);

  assert.equal(result?.length, 7);
  assert.equal(result?.[3]?.riverDischargeM3s, null);
});

test('Flood: lists of different lengths are rejected', () => {
  const uneven = { daily: { time: days, river_discharge: [4.27, 4.21] } };

  assert.equal(parseFloodLocation(uneven), null);
});

test('Flood: broken locations are skipped, good ones are kept', () => {
  const negative = { daily: { time: days, river_discharge: [-1, 0, 0, 0, 0, 0, 0] } };
  const results = [goodFlood, negative, { daily: 'nope' }].map(parseFloodLocation);

  assert.equal(results.filter((r) => r !== null).length, 1);
  assert.notEqual(results[0], null);
});
