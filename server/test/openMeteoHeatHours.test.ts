// Test for the heat map download: it asks Open-Meteo for 16 past hours and
// 144 forecast hours, so six days are covered. A pretend `fetch` records the URL.
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORECAST_HOURS, PAST_HOURS, fetchOpenMeteoHeat } from '../src/fetchers/openMeteoHeat.ts';

test('fetchOpenMeteoHeat: asks for 16 past hours and 144 forecast hours', async () => {
  const urls: string[] = [];
  // Answers with "one point, no hours": enough to read the request.
  const fetcher = async (url: string): Promise<Response> => {
    urls.push(url);
    return Response.json({ hourly: { time: [] } });
  };
  await fetchOpenMeteoHeat([{ lat: 14.6, lon: 121 }], ['ecmwf_ifs'], { fetcher, pauseMs: 0 });

  assert.equal(FORECAST_HOURS, 144);
  assert.equal(PAST_HOURS, 16);
  const params = new URL(urls[0] ?? '').searchParams;
  assert.equal(params.get('forecast_hours'), '144');
  assert.equal(params.get('past_hours'), '16');
});
