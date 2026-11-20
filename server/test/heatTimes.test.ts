// Tests for the Heat view's time bar maths (shared/src/heatTimes.ts).
// Pure date maths: no network, no database. Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { barDays, barTime, barTimes, defaultBarTime, isBarTime, phDate } from '@ph-monitor/shared';

test('phDate: PH date, not UTC', () => {
  assert.equal(phDate(new Date('2026-11-20T15:59:00Z')), '2026-11-20');
  assert.equal(phDate(new Date('2026-11-20T16:00:00Z')), '2026-11-21');
});
test('barDays: six days from PH today', () => {
  assert.deepEqual(barDays(new Date('2026-11-20T16:30:00Z')),
    ['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26']);
});
test('barTime: PH 8 AM is 00:00 UTC', () => {
  assert.equal(barTime('2026-11-21', 8).toISOString(), '2026-11-21T00:00:00.000Z');
  assert.equal(barTime('2026-11-21', 17).toISOString(), '2026-11-21T09:00:00.000Z');
});
test('barTimes: 60 instants, first today 8 AM', () => {
  const times = barTimes(new Date('2026-11-20T04:30:00Z'));
  assert.equal(times.length, 60);
  assert.equal(times[0]?.toISOString(), '2026-11-20T00:00:00.000Z');
  assert.equal(times[59]?.toISOString(), '2026-11-25T09:00:00.000Z');
});
test('defaultBarTime: current hour by day, 8 AM before, tomorrow 8 AM after', () => {
  assert.equal(defaultBarTime(new Date('2026-11-20T04:30:00Z')).toISOString(), '2026-11-20T04:00:00.000Z'); // 12:30 PM
  assert.equal(defaultBarTime(new Date('2026-11-19T22:00:00Z')).toISOString(), '2026-11-20T00:00:00.000Z'); // 6 AM
  assert.equal(defaultBarTime(new Date('2026-11-20T09:59:00Z')).toISOString(), '2026-11-20T09:00:00.000Z'); // 5:59 PM
  assert.equal(defaultBarTime(new Date('2026-11-20T10:15:00Z')).toISOString(), '2026-11-21T00:00:00.000Z'); // 6:15 PM
});
test('isBarTime: only whole bar hours inside the six days', () => {
  const now = new Date('2026-11-20T04:30:00Z');
  assert.equal(isBarTime(new Date('2026-11-20T00:00:00Z'), now), true);   // today 8 AM (past is fine)
  assert.equal(isBarTime(new Date('2026-11-25T09:00:00Z'), now), true);   // day 6, 5 PM
  assert.equal(isBarTime(new Date('2026-11-19T23:00:00Z'), now), false);  // 7 AM
  assert.equal(isBarTime(new Date('2026-11-20T10:00:00Z'), now), false);  // 6 PM
  assert.equal(isBarTime(new Date('2026-11-26T00:00:00Z'), now), false);  // day 7
  assert.equal(isBarTime(new Date('2026-11-19T04:00:00Z'), now), false);  // yesterday
  assert.equal(isBarTime(new Date('2026-11-20T04:30:00Z'), now), false);  // not whole hour
});
