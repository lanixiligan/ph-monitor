// Tests for the geography and hazard pieces: which storm source to trust,
// extra weather points for big provinces, and per-hazard scores.
// Pure functions only: no network, no database.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StormRecord } from '../src/fetchers/stormRecord.ts';
import { chooseStorms } from '../src/jobs/ingestStorms.ts';
import { hazardScores } from '../src/scoring/scoring.ts';
import { distanceKm, pickExtraPoints, worstReading } from '../src/weatherPoints.ts';

// ---------- Storm sources ----------

function storm(source: 'jma' | 'jtwc', id: string, name: string): StormRecord {
  return { id: `${source}:${id}`, source, name, category: null, url: null, updatedAt: new Date(0), raw: {}, track: [] };
}

test('storms: when JMA fails, JTWC is used', () => {
  const jtwc = { storms: [storm('jtwc', '28W', 'UWAN')], skipped: 0 };
  assert.deepEqual(chooseStorms(null, jtwc)?.map((s) => s.id), ['jtwc:28W']);
});

test('storms: when both list the same storm, only JMA\'s copy is kept', () => {
  const jma = { storms: [storm('jma', 'TC2625', 'Uwan')], skipped: 0 };
  const jtwc = { storms: [storm('jtwc', '28W', 'UWAN')], skipped: 0 };
  assert.deepEqual(chooseStorms(jma, jtwc)?.map((s) => s.id), ['jma:TC2625']);
});

test('storms: a storm JMA does not give us (not listed, or unreadable) is taken from JTWC', () => {
  // JMA answered but its one storm failed the checks: an empty list.
  const jma = { storms: [], skipped: 1 };
  const jtwc = { storms: [storm('jtwc', '28W', 'UWAN')], skipped: 0 };
  assert.deepEqual(chooseStorms(jma, jtwc)?.map((s) => s.id), ['jtwc:28W']);
});

test('storms: nothing to save when both sources failed', () => {
  assert.equal(chooseStorms(null, null), null);
});

// ---------- Weather points ----------

test('distance: Manila to Cebu City is about 570 km', () => {
  const km = distanceKm({ lat: 14.5995, lon: 120.9842 }, { lat: 10.3157, lon: 123.8854 });
  assert.ok(km > 560 && km < 580, `got ${km}`);
});

test('extra points: the furthest places are added, each far from the ones already picked', () => {
  const first = { lat: 10, lon: 119 };
  const candidates = [
    { lat: 10.1, lon: 119 }, // 11 km away: too close to matter
    { lat: 12, lon: 120 }, // far north-east
    { lat: 8, lon: 117.5 }, // far south-west
    { lat: 11.9, lon: 120 }, // right beside the north-east one
  ];
  assert.deepEqual(pickExtraPoints(first, candidates), [
    { lat: 8, lon: 117.5 },
    { lat: 12, lon: 120 },
  ]);
});

test('extra points: a small province gets none', () => {
  assert.deepEqual(pickExtraPoints({ lat: 10, lon: 119 }, [{ lat: 10.2, lon: 119.1 }]), []);
});

const reading = (rain1hMm: number | null, rain24hMm: number | null, tempC: number | null, hour = 3) => ({
  validAt: new Date(Date.UTC(2026, 10, 16, hour)),
  tempC,
  humidityPct: tempC === null ? null : 70,
  rain1hMm,
  rain24hMm,
});

test('worst reading: the most rain and the hottest point of a province are kept', () => {
  const worst = worstReading([reading(0, 10, 34), reading(22, 5, 28), null, reading(1, 80, 30)]);
  assert.deepEqual(worst, reading(22, 80, 34));
});

test('worst reading: missing values never beat real ones, and nothing gives null', () => {
  assert.deepEqual(worstReading([reading(null, null, null), reading(2, null, 29)]), reading(2, null, 29));
  assert.equal(worstReading([null, null]), null);
  assert.equal(worstReading([]), null);
});

// ---------- Per-hazard scores ----------

test('hazards: each hazard gets its own score', () => {
  const quake = { magnitude: 6, depthKm: 10, distanceKm: 0, hoursAgo: 0 };
  const event = { kind: 'typhoon' as const, alertLevel: 'orange' as const, distanceKm: 0, hoursSinceEnd: null };
  assert.deepEqual(hazardScores([quake], { rain1hMm: 15, rain24hMm: 0, heatIndexC: 42 }, [event]), {
    quake: 75,
    rain: 60,
    heat: 50,
    event: 50,
  });
});

test('hazards: rain and heat are unknown (null) when the reading lacks them', () => {
  assert.deepEqual(hazardScores([], { rain1hMm: null, rain24hMm: null, heatIndexC: 30 }, []), {
    quake: 0,
    rain: null,
    heat: 5,
    event: 0,
  });
  const none = hazardScores([], null, []);
  assert.equal(none.rain, null);
  assert.equal(none.heat, null);
});
