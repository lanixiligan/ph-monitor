// Tests for the PAGASA iHeatMAP fetcher, using real saved answers. No network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PAGASA_HEAT_API,
  PAGASA_HEAT_FILES,
  DAY_ONE_TIMES,
  pagasaFileName,
  parseCurrentDate,
  parsePresigned,
  parseTifFiles,
  fetchPagasaFile,
} from '../src/fetchers/pagasaHeat.ts';

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/pagasa-heat/${name}`, import.meta.url), 'utf8'));
}

test('reads the latest date', () => {
  assert.equal(parseCurrentDate(fixture('current-date.json')), '2026-11-21');
  assert.throws(() => parseCurrentDate({ latest_issuance_date: 'tomorrow' }));
});

test('reads the hours from availability', () => {
  const listing = parseTifFiles(fixture('tif-files.json'));
  assert.equal(listing.issuedOn, '2026-11-21');
  assert.equal(listing.hours.length, 35);
  assert.deepEqual(listing.hours[0], { date: '2026-11-21', time: '08:00' });
  const day4 = listing.hours.filter((h) => h.date === '2026-11-24').map((h) => h.time);
  assert.deepEqual(day4, ['08:00', '11:00', '14:00', '17:00']);
  assert.equal(DAY_ONE_TIMES.length, 10);
});

test('rejects an empty or malformed listing', () => {
  assert.throws(() => parseTifFiles({ date: '20261120', times: [] }));
  assert.throws(() => parseTifFiles({ files: ['20261121/a.tif'], availability: {} }));
});

test('accepts only links on the PAGASA bucket', () => {
  assert.throws(() => parsePresigned({ url: 'https://evil.example/x.tif' }));
  const url = parsePresigned(fixture('presigned.json'));
  assert.ok(url.startsWith(PAGASA_HEAT_FILES));
});

test('names a file', () => {
  assert.equal(pagasaFileName({ date: '2026-11-21', time: '08:00' }), '20261121_0800_cog.tif');
});

test('asks for a link, then downloads it', async () => {
  const asked: string[] = [];
  const s3 = `${PAGASA_HEAT_FILES}20261121/x.tif?sig=1`;
  const fetcher = async (url: string): Promise<Response> => {
    asked.push(url);
    if (url.startsWith(PAGASA_HEAT_API)) return new Response(JSON.stringify({ url: s3 }));
    return new Response(new Uint8Array([1, 2, 3]));
  };
  const bytes = await fetchPagasaFile('2026-11-21', { date: '2026-11-21', time: '12:00' }, fetcher);
  assert.equal(asked[0], `${PAGASA_HEAT_API}presigned-tif?date=20261121&file=20261121_1200_cog.tif`);
  assert.equal(asked[1], s3);
  assert.deepEqual([...new Uint8Array(bytes)], [1, 2, 3]);
});

test('rejects look-alike hosts and plain http', () => {
  assert.throws(() => parsePresigned({ url: 'https://iheatmap.s3.ap-southeast-1.amazonaws.com.evil.example/x.tif' }));
  assert.throws(() => parsePresigned({ url: 'http://iheatmap.s3.ap-southeast-1.amazonaws.com/x.tif' }));
  assert.throws(() => parsePresigned({ url: 'not a url' }));
});
