import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadedAgo } from '../src/format.ts';
import { en } from '../src/i18n/en.ts';
import { fil } from '../src/i18n/fil.ts';

const NOW = Date.parse('2026-11-18T12:00:00Z');
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The ISO time `ms` milliseconds before NOW. */
function before(ms: number): string {
  return new Date(NOW - ms).toISOString();
}

test('a few seconds old is "just now"', () => {
  assert.equal(uploadedAgo(before(0), NOW, en), 'Uploaded just now');
  assert.equal(uploadedAgo(before(4 * SECOND), NOW, en), 'Uploaded just now');
});

test('a time a little in the future (clock off) is "just now", not negative', () => {
  assert.equal(uploadedAgo(before(-30 * SECOND), NOW, en), 'Uploaded just now');
});

test('seconds, minutes, hours and days, with one and many', () => {
  assert.equal(uploadedAgo(before(5 * SECOND), NOW, en), 'Uploaded 5 seconds ago');
  assert.equal(uploadedAgo(before(59 * SECOND), NOW, en), 'Uploaded 59 seconds ago');
  assert.equal(uploadedAgo(before(MINUTE), NOW, en), 'Uploaded 1 minute ago');
  assert.equal(uploadedAgo(before(12 * MINUTE + 40 * SECOND), NOW, en), 'Uploaded 12 minutes ago');
  assert.equal(uploadedAgo(before(HOUR), NOW, en), 'Uploaded 1 hour ago');
  assert.equal(uploadedAgo(before(23 * HOUR + 59 * MINUTE), NOW, en), 'Uploaded 23 hours ago');
  assert.equal(uploadedAgo(before(DAY), NOW, en), 'Uploaded 1 day ago');
  assert.equal(uploadedAgo(before(9 * DAY), NOW, en), 'Uploaded 9 days ago');
});

test('Filipino uses its own words', () => {
  assert.equal(uploadedAgo(before(12 * MINUTE), NOW, fil), fill12(fil.format.ago.minutes));
});

test('a time that is not a date gives an empty text, not "NaN"', () => {
  assert.equal(uploadedAgo('not a date', NOW, en), '');
});

// The Filipino line for 12 minutes, built the same way the helper does.
function fill12(text: string): string {
  return fil.format.uploaded.replace('{ago}', text.replace('{n}', '12'));
}
