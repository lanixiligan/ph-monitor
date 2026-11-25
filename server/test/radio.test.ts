// Tests for the Radio Browser station list. No network: a real sample and a pretend fetch.
// Run with: npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fetchRadioStations, orderMirrors, parseRadioStations } from '../src/fetchers/radioBrowser.ts';
import { orderStations } from '../src/routes/radio.ts';

// Seven real PH stations (2026-11-25), trimmed: one HLS, two sharing one stream.
const sample: unknown = JSON.parse(readFileSync(new URL('./fixtures/radio/stations.json', import.meta.url), 'utf8'));

test('radio: the sample is read, HLS left out, a shared stream kept once', () => {
  const result = parseRadioStations(sample);
  assert.equal(result.skipped, 0);
  assert.equal(result.hls, 1);
  assert.equal(result.duplicates, 1);
  assert.equal(result.stations.length, 5);

  const dzrh = result.stations.find((station) => station.name === 'DZRH');
  assert.equal(dzrh?.id, '2940f5dc-195e-4547-ab7a-f33ae2f70f41');
  assert.equal(dzrh?.url, 'https://azura.dzrh.com.ph/listen/dzrh_manila/radio.mp3');
  assert.equal(dzrh?.state, null); // empty text becomes null
  assert.equal(dzrh?.bitrate, 128);

  // DZMM Radyo Patrol 630 and Radyo 630 share a stream: the one with more votes stays.
  const shared = result.stations.filter((station) => station.url === 'http://209.126.124.126:8852/stream');
  assert.deepEqual(shared.map((station) => station.name), ['Radyo 630']);
});

test('radio: a curated station wins a shared stream, even with fewer votes', () => {
  const dzmm = 'e3e06b8c-f725-4d3d-8e8f-3fde8704adff';
  const result = parseRadioStations(sample, [dzmm]);
  const shared = result.stations.filter((station) => station.url === 'http://209.126.124.126:8852/stream');
  assert.deepEqual(shared.map((station) => station.id), [dzmm]);
});

test('radio: a bad record is skipped, the rest are kept', () => {
  const good = (sample as unknown[])[0];
  const noUrl = { ...(good as object), stationuuid: '00000000-0000-4000-8000-000000000000', url_resolved: 'ftp://x' };
  const result = parseRadioStations([good, noUrl, 'junk']);
  assert.equal(result.stations.length, 1);
  assert.equal(result.skipped, 2);
});

test('radio: a bitrate of 0 means unknown', () => {
  const zero = { ...((sample as unknown[])[0] as object), bitrate: 0 };
  assert.equal(parseRadioStations([zero]).stations[0]?.bitrate, null);
});

test('radio: mirrors are shuffled and the fallback is added last once', () => {
  // A "random" that always says 0 swaps every item to the front: a, b, c -> b, c, a.
  assert.deepEqual(orderMirrors(['a', 'b', 'c'], () => 0), ['b', 'c', 'a', 'de1.api.radio-browser.info']);
  assert.deepEqual(orderMirrors(['de1.api.radio-browser.info']), ['de1.api.radio-browser.info']);
  assert.deepEqual(orderMirrors([]), ['de1.api.radio-browser.info']);
});

test('radio: a failing mirror is skipped for the next one', async () => {
  const asked: string[] = [];
  const fetcher = async (url: string): Promise<Response> => {
    asked.push(new URL(url).host);
    if (url.includes('broken.test')) return new Response('down', { status: 503 });
    return new Response(JSON.stringify(sample), { status: 200 });
  };
  // One mirror, so the order is fixed: broken.test, then the fallback.
  const result = await fetchRadioStations({ mirrors: ['broken.test'], fetcher, pauseMs: 0 });
  assert.equal(result.stations.length, 5);
  // broken.test is tried twice (one retry), then the fallback answers.
  assert.deepEqual(asked, ['broken.test', 'broken.test', 'de1.api.radio-browser.info']);
});

test('radio: every mirror failing is an error', async () => {
  const fetcher = async (): Promise<Response> => new Response('down', { status: 503 });
  await assert.rejects(fetchRadioStations({ mirrors: ['a.test'], fetcher, pauseMs: 0 }), /every mirror failed/);
});

test('radio: the news group comes first, in its own order and with its own names', () => {
  const row = (id: string, name: string) => ({ id, name, state: null, codec: 'MP3', bitrate: 64, url: `http://radio.test/${id}` });
  // Rows arrive sorted by votes: a, b, c.
  const rows = [row('a', 'Popular'), row('b', '702 Dzas'), row('c', 'DZRH')];
  const news = [
    { stationId: 'c', label: 'DZRH' },
    { stationId: 'b', label: 'DZAS 702' },
    { stationId: 'gone', label: 'Not listed any more' },
  ];
  const result = orderStations(rows, news);
  assert.deepEqual(result.map((s) => [s.name, s.isNews]), [['DZRH', true], ['DZAS 702', true], ['Popular', false]]);
});
