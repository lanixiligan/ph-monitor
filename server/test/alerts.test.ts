// Tests for the official PAGASA alerts (src/fetchers/pagasa.ts).
// No network: the samples in fixtures/alerts/ are real files (see its README).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isAlertInEffect, newPsgc, parsePagasaCap, parsePagasaFeed, provincesForAreas } from '../src/fetchers/pagasa.ts';

// Reads a sample file next to this test. `import.meta.url` is this file's own location.
function sample(name: string): string {
  return readFileSync(new URL(`./fixtures/alerts/${name}`, import.meta.url), 'utf8');
}

const provinces = [
  { psgc: 1102500000, name: 'Davao Oriental' },
  { psgc: 1102400000, name: 'Davao del Sur' },
  { psgc: 1108200000, name: 'Davao de Oro' },
  { psgc: 102900000, name: 'Ilocos Sur' },
];

test('feed: every entry gives an id, a title, a time and the link to its alert file', () => {
  const { entries, skipped } = parsePagasaFeed(sample('pagasa-feed.xml'));
  assert.equal(entries.length, 15);
  assert.equal(skipped, 0);
  assert.deepEqual(entries[0], {
    id: 'bd7f6925-22e0-459a-83ce-c499ac546cf7',
    title: 'GFA #4 (Final) - Region 12 (SOCCSKSARGEN)',
    updatedAt: new Date('2026-11-14T05:17:01+08:00'),
    capUrl: 'https://publicalert.pagasa.dost.gov.ph/output/gfa/bd7f6925-22e0-459a-83ce-c499ac546cf7.cap',
  });
});

test('feed: an entry without an alert link is skipped; text that is not a feed throws', () => {
  const broken =
    '<feed><entry><id>urn:uuid:1</id><title>No link</title><updated>2026-11-14T05:17:01+08:00</updated></entry></feed>';
  assert.deepEqual(parsePagasaFeed(broken), { entries: [], skipped: 1 });
  assert.throws(() => parsePagasaFeed('<html></html>'));
});

test('feed: only links to PAGASA\'s own https address are accepted', () => {
  const elsewhere =
    '<feed><entry><id>urn:uuid:1</id><title>T</title><updated>2026-11-14T05:17:01+08:00</updated>' +
    '<link type="application/cap+xml" href="https://example.com/x.cap"/></entry></feed>';
  assert.deepEqual(parsePagasaFeed(elsewhere), { entries: [], skipped: 1 });
});

test('alert file: a flood advisory gives its level, times and the provinces it names', () => {
  const alert = parsePagasaCap(sample('gfa-moderate.cap'));
  assert.ok(alert);
  assert.equal(alert.id, '0d3dec69-26b3-4b48-97b7-6179681d4b35');
  assert.equal(alert.event, 'General Flood Advisory (Moderate)');
  assert.equal(alert.headline, 'General Flood Advisory');
  assert.equal(alert.severity, 'Moderate');
  assert.equal(alert.isAllClear, false);
  assert.deepEqual(alert.sentAt, new Date('2026-11-13T17:11:02+08:00'));
  assert.deepEqual(alert.expiresAt, new Date('2026-11-14T05:11:02+08:00'));
  assert.deepEqual(alert.replaces, ['054c6c75-4658-4ba7-a167-4204e4a8e5ad']);
  assert.deepEqual(alert.areas, [
    { name: 'Davao Oriental', code: '112500000' },
    { name: 'Davao Del Sur', code: '112400000' },
    { name: 'Davao De Oro', code: '118200000' },
  ]);
  assert.match(alert.description, /Davao Oriental/);
  assert.match(alert.web ?? '', /^https?:\/\/www\.pagasa\.dost\.gov\.ph\//);
});

test('alert file: a "final" advisory is marked as the all-clear', () => {
  const alert = parsePagasaCap(sample('gfa-final.cap'));
  assert.equal(alert?.isAllClear, true);
});

test('alert file: a cyclone alert for the whole area has one area and no place code', () => {
  const alert = parsePagasaCap(sample('cyclone-alert.cap'));
  assert.ok(alert);
  assert.equal(alert.event, 'Tropical Cyclone Alert');
  assert.equal(alert.headline, 'Tropical Cyclone Alert : Typhoon Samuel (CEMPAKA)');
  assert.deepEqual(alert.areas, [{ name: 'Philippine Area of Responsibility', code: null }]);
});

test('alert file: broken text gives null instead of an error', () => {
  assert.equal(parsePagasaCap('<alert><identifier>x</identifier></alert>'), null);
  assert.equal(parsePagasaCap('not xml at all'), null);
});

test('place codes: PAGASA\'s 9-digit codes become our 10-digit ones', () => {
  assert.equal(newPsgc('112500000'), 1102500000);
  assert.equal(newPsgc('126300000'), 1206300000);
  // Regions 1 to 9 can lose their leading zero.
  assert.equal(newPsgc('12900000'), 102900000);
  assert.equal(newPsgc('012900000'), 102900000);
  assert.equal(newPsgc('abc'), null);
});

test('areas are matched to provinces by code, and by name when the code is unknown', () => {
  const found = provincesForAreas(
    [
      { name: 'Davao Oriental', code: '112500000' },
      { name: 'Davao Del Sur', code: null },
      { name: 'Ilocos Sur', code: '999999999' },
      { name: 'Atlantis', code: null },
    ],
    provinces,
  );
  assert.deepEqual(found, { psgcs: [102900000, 1102400000, 1102500000], isNationwide: false });
});

test('an alert whose areas match no province counts for the whole country', () => {
  const found = provincesForAreas([{ name: 'Philippine Area of Responsibility', code: null }], provinces);
  assert.deepEqual(found, { psgcs: [], isNationwide: true });
});

test('an alert is in effect until it expires, is replaced, or is an all-clear', () => {
  const now = new Date('2026-11-13T20:00:00+08:00');
  const base = { expiresAt: new Date('2026-11-14T05:00:00+08:00'), isAllClear: false, isReplaced: false };
  assert.equal(isAlertInEffect(base, now), true);
  assert.equal(isAlertInEffect({ ...base, expiresAt: new Date('2026-11-13T19:00:00+08:00') }, now), false);
  assert.equal(isAlertInEffect({ ...base, isReplaced: true }, now), false);
  assert.equal(isAlertInEffect({ ...base, isAllClear: true }, now), false);
  // No expiry time given: believed for one day after it was sent.
  assert.equal(isAlertInEffect({ ...base, expiresAt: null }, now), true);
});
