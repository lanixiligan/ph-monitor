// Tests for the heat map: reading Open-Meteo's answer (src/fetchers/openMeteoHeat.ts)
// and the pure parts of the map data (src/heatMap.ts).
// No network: three-models.json in fixtures/heat/ is a real answer (see its README),
// and the download test passes in a pretend `fetch`. No database either.
// Run with: npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
// `import type` brings in a type only; it disappears when the code runs.
import type { HeatModelId } from '@ph-monitor/shared';
import { fetchOpenMeteoHeat, parseHeatLocation } from '../src/fetchers/openMeteoHeat.ts';
import type { HeatHours } from '../src/fetchers/openMeteoHeat.ts';
import { bandOf, hourShown, isHeatStale, provinceHeat } from '../src/heatMap.ts';
import { cacheSeconds } from '../src/routes/heatmap.ts';

const ALL_MODELS: HeatModelId[] = ['ecmwf_ifs', 'dwd_icon_global_native', 'ncep_gfs_global'];

/** The real answer: a list of two locations (Manila, then Cebu). */
function fixture(): unknown[] {
  return JSON.parse(readFileSync(new URL('./fixtures/heat/three-models.json', import.meta.url), 'utf8'));
}

/** The first location of the real answer, as a plain object we can change. */
// `Record<string, X>` = an object whose values are all X; `as` tells TypeScript the shape.
function manila(): { hourly: Record<string, (number | null)[]> } {
  return fixture()[0] as { hourly: Record<string, (number | null)[]> };
}

test('parseHeatLocation: reads suffixed lists for three models', () => {
  const location = parseHeatLocation(manila(), ALL_MODELS);
  assert.ok(location);
  assert.equal(location.times.length, 48);
  for (const model of ALL_MODELS) {
    const values: HeatHours | undefined = location.models[model];
    assert.ok(values, `${model} is missing`);
    assert.equal(values.tempC.length, 48);
    assert.equal(values.humidityPct.length, 48);
  }
  // Unix seconds became dates: the first hour is the hour the answer was fetched in.
  // `?.` reads a field only if the value is there.
  assert.equal(location.times[0]?.toISOString(), '2026-11-18T17:00:00.000Z');
  assert.equal(location.models.ecmwf_ifs?.tempC[0], 27.8);
});

test('parseHeatLocation: one model with plain names', () => {
  const plain = {
    hourly: { time: [1_800_000_000, 1_800_003_600], temperature_2m: [31, 32], relative_humidity_2m: [70, 75] },
  };
  const location = parseHeatLocation(plain, ['ecmwf_ifs']);
  assert.ok(location);
  assert.deepEqual(location.models.ecmwf_ifs, { tempC: [31, 32], humidityPct: [70, 75] });
  assert.deepEqual(Object.keys(location.models), ['ecmwf_ifs']);
});

test('parseHeatLocation: a model of only nulls is left out', () => {
  const answer = manila();
  // `!` says "this is not undefined": the real answer always has these lists.
  answer.hourly.temperature_2m_dwd_icon_global_native = answer.hourly.time!.map(() => null);
  answer.hourly.relative_humidity_2m_dwd_icon_global_native = answer.hourly.time!.map(() => null);
  const location = parseHeatLocation(answer, ALL_MODELS);
  assert.ok(location);
  assert.equal(location.models.dwd_icon_global_native, undefined);
  assert.ok(location.models.ecmwf_ifs);
  assert.ok(location.models.ncep_gfs_global);
});

test('parseHeatLocation: a model missing from the answer is left out, the others stay', () => {
  const answer = manila();
  delete answer.hourly.temperature_2m_dwd_icon_global_native;
  delete answer.hourly.relative_humidity_2m_dwd_icon_global_native;
  const location = parseHeatLocation(answer, ALL_MODELS);
  assert.ok(location);
  assert.equal(location.models.dwd_icon_global_native, undefined);
  assert.ok(location.models.ecmwf_ifs);
});

test('parseHeatLocation: lists of different lengths give null', () => {
  const answer = manila();
  answer.hourly.temperature_2m_ecmwf_ifs = answer.hourly.temperature_2m_ecmwf_ifs!.slice(0, 47);
  assert.equal(parseHeatLocation(answer, ALL_MODELS), null);
});

test('parseHeatLocation: humidity over 100 gives null', () => {
  const answer = manila();
  answer.hourly.relative_humidity_2m_ncep_gfs_global![3] = 140;
  assert.equal(parseHeatLocation(answer, ALL_MODELS), null);
});

/** A pretend Open-Meteo answer: Manila's hours, once for every point asked about. */
function answerFor(url: string): Response {
  const count = (new URL(url).searchParams.get('latitude') ?? '').split(',').length;
  return Response.json(Array.from({ length: count }, () => manila()));
}

test('fetchOpenMeteoHeat: one failed request leaves its points null', async () => {
  const urls: string[] = [];
  const fetcher = async (url: string): Promise<Response> => {
    urls.push(url);
    // The second request (10 points) always fails.
    const count = (new URL(url).searchParams.get('latitude') ?? '').split(',').length;
    return count === 50 ? answerFor(url) : new Response('busy', { status: 503 });
  };
  // 60 points spread out a little, so every coordinate is different.
  const points = Array.from({ length: 60 }, (_, i) => ({ lat: 5 + i * 0.1, lon: 120 + i * 0.1 }));
  const locations = await fetchOpenMeteoHeat(points, ALL_MODELS, { fetcher, pauseMs: 0 });

  assert.equal(locations.length, 60);
  assert.ok(locations.slice(0, 50).every((location) => location !== null));
  assert.ok(locations.slice(50).every((location) => location === null));

  // The request asks for exactly what the plan says, all three models at once.
  const first = new URL(urls[0] ?? '').searchParams;
  assert.equal(first.get('hourly'), 'temperature_2m,relative_humidity_2m');
  assert.equal(first.get('models'), 'ecmwf_ifs,dwd_icon_global_native,ncep_gfs_global');
  assert.equal(first.get('forecast_hours'), '48');
  assert.equal(first.get('timeformat'), 'unixtime');
  // 1 good request + 2 tries of the failed one.
  assert.equal(urls.length, 3);
});

test('fetchOpenMeteoHeat: throws when every request failed', async () => {
  const fetcher = async (): Promise<Response> => new Response('busy', { status: 503 });
  await assert.rejects(
    fetchOpenMeteoHeat([{ lat: 14.6, lon: 121 }], ALL_MODELS, { fetcher, pauseMs: 0 }),
    /every request failed/,
  );
});

// ---------- The map data (src/heatMap.ts) ----------

test('bandOf: PAGASA bands; null below 27 and for an unknown value', () => {
  assert.equal(bandOf(26.9), null);
  assert.equal(bandOf(27), 'caution');
  assert.equal(bandOf(41.9), 'extreme caution');
  assert.equal(bandOf(42), 'danger');
  assert.equal(bandOf(52), 'extreme danger');
  assert.equal(bandOf(null), null);
});

test('hourShown: the start of the current hour', () => {
  assert.equal(hourShown(new Date('2026-11-19T05:42:10.500Z')).toISOString(), '2026-11-19T05:00:00.000Z');
  assert.equal(hourShown(new Date('2026-11-19T06:00:00.000Z')).toISOString(), '2026-11-19T06:00:00.000Z');
});

test('provinceHeat: each province takes its hottest town; unknown towns never win; no known town is null', () => {
  const towns = [
    { psgc: 1, provincePsgc: 10, heatIndexC: 35 },
    { psgc: 2, provincePsgc: 10, heatIndexC: 43 },
    { psgc: 3, provincePsgc: 10, heatIndexC: null },
    { psgc: 4, provincePsgc: 20, heatIndexC: null },
  ];
  assert.deepEqual(provinceHeat([10, 20, 30], towns), [
    { psgc: 10, heatIndexC: 43, band: 'danger' },
    { psgc: 20, heatIndexC: null, band: null },
    { psgc: 30, heatIndexC: null, band: null },
  ]);
});

test('isHeatStale: no run, a run over 25 hours old, or no row for the hour shown', () => {
  const now = new Date('2026-11-19T12:00:00Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);
  assert.equal(isHeatStale(hoursAgo(1), true, now), false);
  assert.equal(isHeatStale(hoursAgo(24), true, now), false);
  assert.equal(isHeatStale(null, false, now), true);
  assert.equal(isHeatStale(hoursAgo(26), true, now), true);
  assert.equal(isHeatStale(hoursAgo(1), false, now), true);
});

test('cacheSeconds: 5 minutes, but never past the end of the hour', () => {
  assert.equal(cacheSeconds(new Date('2026-11-19T10:00:00Z')), 300);
  assert.equal(cacheSeconds(new Date('2026-11-19T10:54:59Z')), 300);
  // 10:58:00 → 120 seconds left in the hour.
  assert.equal(cacheSeconds(new Date('2026-11-19T10:58:00Z')), 120);
  assert.equal(cacheSeconds(new Date('2026-11-19T10:59:59.500Z')), 1);
});
