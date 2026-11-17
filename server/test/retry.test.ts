// Tests for "try once more" downloads and for the weather fetch surviving
// one failed request. No network: a pretend `fetch` is passed in.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchWithRetry } from '../src/fetchers/retry.ts';
import { fetchOpenMeteo } from '../src/fetchers/openMeteo.ts';

// A pretend fetch that gives back the listed answers in order, counting calls.
function fakeFetch(answers: (Response | Error)[]) {
  let calls = 0;
  const fetcher = async (): Promise<Response> => {
    const answer = answers[Math.min(calls, answers.length - 1)];
    calls += 1;
    if (answer instanceof Error) throw answer;
    // `!` says "this is not undefined": the list is never empty in these tests.
    return answer!.clone();
  };
  return { fetcher, calls: () => calls };
}

const ok = () => new Response('{"fine":true}', { status: 200 });
const busy = () => new Response('busy', { status: 503 });

test('retry: a good first answer is returned without a second call', async () => {
  const fake = fakeFetch([ok()]);
  const response = await fetchWithRetry('https://example.test', {}, { fetcher: fake.fetcher, pauseMs: 0 });
  assert.equal(response.status, 200);
  assert.equal(fake.calls(), 1);
});

test('retry: a failed answer is tried once more', async () => {
  const fake = fakeFetch([busy(), ok()]);
  const response = await fetchWithRetry('https://example.test', {}, { fetcher: fake.fetcher, pauseMs: 0 });
  assert.equal(response.status, 200);
  assert.equal(fake.calls(), 2);
});

test('retry: a network error is tried once more too', async () => {
  const fake = fakeFetch([new Error('offline'), ok()]);
  const response = await fetchWithRetry('https://example.test', {}, { fetcher: fake.fetcher, pauseMs: 0 });
  assert.equal(response.status, 200);
});

test('retry: two failures give up with an error, after exactly two calls', async () => {
  const fake = fakeFetch([busy(), busy(), ok()]);
  await assert.rejects(
    fetchWithRetry('https://example.test', {}, { fetcher: fake.fetcher, pauseMs: 0 }),
    /HTTP 503/,
  );
  assert.equal(fake.calls(), 2);
});

// One good Open-Meteo location: 25 hourly values ending at 03:00 UTC.
const lastHour = Date.UTC(2026, 10, 16, 3) / 1000;
const hours = Array.from({ length: 25 }, (_, i) => lastHour - (24 - i) * 3600);
const location = {
  hourly: {
    time: hours,
    temperature_2m: hours.map(() => 30),
    relative_humidity_2m: hours.map(() => 70),
    precipitation: hours.map(() => 1),
  },
};
const points = (count: number) => Array.from({ length: count }, (_, i) => ({ lat: 10 + i / 100, lon: 123 }));
// The answer for a request of `count` points: a list of that many locations.
const answerFor = (count: number) => new Response(JSON.stringify(Array.from({ length: count }, () => location)));

test('Open-Meteo: one failed request leaves gaps (null) and keeps the rest', async () => {
  // 60 points = two requests (50 + 10). The second one fails, twice.
  const fake = fakeFetch([answerFor(50), busy(), busy()]);
  const readings = await fetchOpenMeteo(points(60), { fetcher: fake.fetcher, pauseMs: 0 });
  assert.equal(readings.length, 60);
  assert.equal(readings.filter((reading) => reading !== null).length, 50);
  assert.equal(readings[59], null);
});

test('Open-Meteo: when every request fails, it throws', async () => {
  const fake = fakeFetch([busy()]);
  await assert.rejects(fetchOpenMeteo(points(60), { fetcher: fake.fetcher, pauseMs: 0 }), /Open-Meteo/);
});
