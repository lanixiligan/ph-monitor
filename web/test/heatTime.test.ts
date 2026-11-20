// The Heat view's time bar rules: keeping the chosen hour, jumping to a day, labels.
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dayLabel, hourLabel, keepOrDefault, pickDay, timeText } from '../src/heatTime.ts';
import { en } from '../src/i18n/en.ts';

test('keepOrDefault keeps a choice that is still on the bar', () => {
  const chosen = '2026-11-20T04:00:00.000Z';
  assert.equal(keepOrDefault(chosen, new Date('2026-11-20T05:10:00Z')), chosen);
});

test('keepOrDefault moves on when the chosen day has left the bar (00:10 PH on 11/21)', () => {
  assert.equal(
    keepOrDefault('2026-11-20T04:00:00.000Z', new Date('2026-11-20T16:10:00Z')),
    '2026-11-21T00:00:00.000Z',
  );
});

test('keepOrDefault with no choice uses this hour', () => {
  assert.equal(keepOrDefault(null, new Date('2026-11-20T04:30:00Z')), '2026-11-20T04:00:00.000Z');
});

const chosen = '2026-11-21T04:00:00.000Z';

test('pickDay keeps the hour when the source has it, or says nothing about hours', () => {
  assert.equal(pickDay('2026-11-24', chosen, null), '2026-11-24T04:00:00.000Z');
  assert.equal(
    pickDay('2026-11-24', chosen, ['2026-11-24T00:00:00.000Z', '2026-11-24T04:00:00.000Z']),
    '2026-11-24T04:00:00.000Z',
  );
});

test('pickDay falls back to the first hour of that day the source has', () => {
  assert.equal(
    pickDay('2026-11-24', chosen, ['2026-11-24T00:00:00.000Z', '2026-11-24T03:00:00.000Z']),
    '2026-11-24T00:00:00.000Z',
  );
});

test('pickDay keeps the same hour when the source has nothing on that day', () => {
  assert.equal(pickDay('2026-11-24', chosen, ['2026-11-22T00:00:00.000Z']), '2026-11-24T04:00:00.000Z');
});

test('hourLabel and dayLabel', () => {
  assert.equal(hourLabel(8, en), '8AM');
  assert.equal(hourLabel(12, en), '12PM');
  assert.equal(hourLabel(17, en), '5PM');
  assert.equal(dayLabel('2026-11-21', en), 'Sat 11/21');
});

test('timeText: day and hour in Philippine time; no hour says so', () => {
  assert.equal(timeText('2026-11-21T04:00:00.000Z', en), 'Sat 11/21 12PM');
  assert.equal(timeText('2026-11-20T16:00:00.000Z', en), 'Sat 11/21 12AM');
  assert.equal(timeText(null, en), en.heat.noHour);
});
