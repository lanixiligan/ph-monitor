// Tests for the radio panel's search. Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RadioStation } from '@ph-monitor/shared';
import { MAX_MATCHES, matchStations } from '../src/radioSearch.ts';

const station = (name: string, place: string | null, isNews = false): RadioStation => ({
  id: name, name, place, codec: 'MP3', bitrate: 64, url: `http://radio.test/${name}`, isNews,
});

const list = [
  station('DZRH', null, true),
  station('Bombo Radyo Iloilo', null),
  station('Brigada News FM Cebu', null),
  station('Your Love FM', 'NCR'),
  station('Radyo Parañaque', null),
];

test('radio search: every word must match the name or the place, any case', () => {
  assert.deepEqual(matchStations(list, 'bombo').shown.map((s) => s.name), ['Bombo Radyo Iloilo']);
  assert.deepEqual(matchStations(list, '  NEWS   cebu ').shown.map((s) => s.name), ['Brigada News FM Cebu']);
  assert.deepEqual(matchStations(list, 'ncr').shown.map((s) => s.name), ['Your Love FM']);
});

test('radio search: accents are ignored, the news group is not repeated, empty finds nothing', () => {
  assert.deepEqual(matchStations(list, 'paranaque').shown.map((s) => s.name), ['Radyo Parañaque']);
  assert.equal(matchStations(list, 'dzrh').total, 0);
  assert.equal(matchStations(list, '   ').total, 0);
});

test('radio search: at most MAX_MATCHES are shown, the total counts them all', () => {
  const many = Array.from({ length: MAX_MATCHES + 5 }, (_, i) => station(`Radyo ${i}`, null));
  const result = matchStations(many, 'radyo');
  assert.equal(result.shown.length, MAX_MATCHES);
  assert.equal(result.total, MAX_MATCHES + 5);
});
