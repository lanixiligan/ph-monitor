// Tests for the rain forecast field (Typhoon view; display only, never the score).
// No network: fixtures/rain/open-meteo-ecmwf-2-points.json is a real answer (see its README).
// Run with: npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fetchOpenMeteoRain, parseRainLocation } from '../src/fetchers/openMeteoRain.ts';
import { buildFrames, gridPoints, RAIN_GRID } from '../src/rainForecast.ts';
// `import type` brings in a type only; it disappears when the code runs.
import type { SavedRainPoint } from '../src/rainForecast.ts';

const HOUR_MS = 60 * 60 * 1000;

function fixture(): unknown[] {
  return JSON.parse(readFileSync(new URL('./fixtures/rain/open-meteo-ecmwf-2-points.json', import.meta.url), 'utf8'));
}

// ---------- The fetcher (src/fetchers/openMeteoRain.ts) ----------

test('parseRainLocation: a real answer gives 168 hours of rain in mm', () => {
  const hours = parseRainLocation(fixture()[0]);
  assert.ok(hours);
  assert.equal(hours.times.length, 168);
  assert.equal(hours.mm.length, 168);
  assert.ok(hours.mm.every((value) => value === null || value >= 0));
});

test('parseRainLocation: negative rain, unequal lists or only nulls are refused', () => {
  assert.equal(parseRainLocation({ hourly: { time: [0, 3600], precipitation: [1, -2] } }), null);
  assert.equal(parseRainLocation({ hourly: { time: [0, 3600], precipitation: [1] } }), null);
  assert.equal(parseRainLocation({ hourly: { time: [0, 3600], precipitation: [null, null] } }), null);
  assert.equal(parseRainLocation({ nothing: true }), null);
});

test('fetchOpenMeteoRain: asks for ECMWF rain for 7 days; a failed request leaves its points null', async () => {
  const urls: string[] = [];
  const one = fixture()[0];
  const fetcher = async (url: string): Promise<Response> => {
    urls.push(url);
    const count = (new URL(url).searchParams.get('latitude') ?? '').split(',').length;
    // The second request (6 points) always fails.
    return count === 50 ? Response.json(Array.from({ length: count }, () => one)) : new Response('busy', { status: 503 });
  };
  const points = gridPoints(RAIN_GRID).slice(0, 56);
  const locations = await fetchOpenMeteoRain(points, { fetcher, pauseMs: 0 });
  assert.equal(locations.length, 56);
  assert.ok(locations.slice(0, 50).every((location) => location !== null));
  assert.ok(locations.slice(50).every((location) => location === null));
  const first = new URL(urls[0] ?? '').searchParams;
  assert.equal(first.get('hourly'), 'precipitation');
  assert.equal(first.get('models'), 'ecmwf_ifs');
  assert.equal(first.get('forecast_days'), '7');
});

test('fetchOpenMeteoRain: throws when every request failed', async () => {
  const fetcher = async (): Promise<Response> => new Response('busy', { status: 503 });
  await assert.rejects(fetchOpenMeteoRain([{ lat: 13, lon: 125 }], { fetcher, pauseMs: 0 }), /every request failed/);
});

// ---------- The grid and the frames (src/rainForecast.ts) ----------

test('the grid covers the PAR (115–135°E, 5–25°N) in 256 points, rows from the south', () => {
  const points = gridPoints(RAIN_GRID);
  assert.equal(points.length, 256);
  assert.deepEqual(points[0], { index: 0, lat: 4, lon: 114 });
  assert.deepEqual(points[1], { index: 1, lat: 4, lon: 115.5 });
  assert.deepEqual(points[16], { index: 16, lat: 5.5, lon: 114 });
  const last = points[255];
  assert.ok(last && last.lat >= 25 && last.lon >= 135);
});

/** A point whose hours start at `start` (end of its first hour) with the given rain. */
function point(index: number, start: Date, mm: (number | null)[]): SavedRainPoint {
  return { index, startAt: start, mm };
}

test('buildFrames: 3-hour totals ending on 00, 03, 06 … UTC, from the period that holds now', () => {
  const start = new Date('2026-11-20T00:00:00Z');
  // 13 hours: 00:00 … 12:00 (each value is the rain in the hour before).
  const mm = [0, 1, 1, 1, 2, 2, 2, 0, 0, 0, 5, 5, 5];
  const now = new Date('2026-11-20T04:30:00Z');
  const frames = buildFrames([point(0, start, mm)], 2, now);
  // Periods ending 06:00, 09:00, 12:00 (04:30 falls in 03:00–06:00).
  assert.deepEqual(
    frames.map((frame) => frame.endsAt),
    ['2026-11-20T06:00:00.000Z', '2026-11-20T09:00:00.000Z', '2026-11-20T12:00:00.000Z'],
  );
  // 06:00 = hours ending 04, 05, 06 = 2 + 2 + 2.
  assert.deepEqual(
    frames.map((frame) => frame.mm[0]),
    [6, 0, 15],
  );
  // A grid cell with no point stays null (no data), never 0.
  assert.ok(frames.every((frame) => frame.mm[1] === null));
});

test('buildFrames: a period with a missing hour is null (unknown), never a smaller total', () => {
  const start = new Date('2026-11-20T00:00:00Z');
  const mm = [0, 1, null, 1, 2, 2, 2];
  const frames = buildFrames([point(0, start, mm)], 1, new Date('2026-11-20T01:00:00Z'));
  assert.deepEqual(frames.map((frame) => frame.mm[0]), [null, 6]);
});

test('buildFrames: the real answer gives frames to the end of the 7 days, one decimal', () => {
  const hours = parseRainLocation(fixture()[0]);
  assert.ok(hours);
  const startAt = hours.times[0] ?? new Date(0);
  const now = new Date(startAt.getTime() + 10 * HOUR_MS);
  const frames = buildFrames([point(0, startAt, hours.mm)], 1, now);
  // 167 hours after the first: periods ending at 12:00 on day 1 … 21:00 on day 7.
  assert.equal(frames.length, 52);
  for (const frame of frames) {
    const value = frame.mm[0];
    assert.ok(value !== null && value !== undefined && Math.round(value * 10) / 10 === value);
  }
});

test('buildFrames: no saved points gives no frames', () => {
  assert.deepEqual(buildFrames([], 256, new Date()), []);
});
