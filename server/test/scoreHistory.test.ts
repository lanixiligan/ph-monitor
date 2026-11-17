// Tests for "does this score need a new history row?" (src/scoreHistory.ts).
// Run with: npm test. Pure functions only: no database.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { needsHistoryRow } from '../src/scoreHistory.ts';
import type { HistoryEntry } from '../src/scoreHistory.ts';

const now = new Date('2026-11-17T12:00:00Z');
const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 60 * 60 * 1000);

const last: HistoryEntry = {
  score: 41,
  quakeScore: 6,
  weatherScore: 39,
  eventScore: 0,
  unknownSignals: [],
  computedAt: hoursAgo(1),
};
// `{ ...last, score: 50 }` copies `last` and replaces one field.
const next = { ...last, computedAt: now };

test('the first score of a province is always saved', () => {
  assert.equal(needsHistoryRow(null, next), true);
});

test('an unchanged score is not saved again', () => {
  assert.equal(needsHistoryRow(last, next), false);
});

test('a change in the total or in any part-score is saved', () => {
  assert.equal(needsHistoryRow(last, { ...next, score: 42 }), true);
  // Same total, different parts: still a change worth keeping.
  assert.equal(needsHistoryRow(last, { ...next, quakeScore: 7 }), true);
  assert.equal(needsHistoryRow(last, { ...next, weatherScore: 38 }), true);
  assert.equal(needsHistoryRow(last, { ...next, eventScore: 10 }), true);
});

test('a signal becoming unknown (or known again) is saved', () => {
  assert.equal(needsHistoryRow(last, { ...next, unknownSignals: ['weather'] }), true);
  const wasUnknown = { ...last, unknownSignals: ['quake', 'event'] };
  assert.equal(needsHistoryRow(wasUnknown, { ...next, unknownSignals: ['event', 'quake'] }), false);
});

test('an old row without part-scores is followed by a full row', () => {
  const old = { ...last, quakeScore: null, weatherScore: null, eventScore: null, unknownSignals: null };
  assert.equal(needsHistoryRow(old, next), true);
});

test('an unchanged score is saved once a day anyway, so a gap means "the job was not running"', () => {
  assert.equal(needsHistoryRow({ ...last, computedAt: hoursAgo(23) }, next), false);
  assert.equal(needsHistoryRow({ ...last, computedAt: hoursAgo(24) }, next), true);
});
