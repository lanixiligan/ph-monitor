// The rain forecast's period label. The test machine's time zone is unknown,
// so these check the label's shape, not the exact hours.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatForecastDay, formatPeriod } from '../src/format.ts';

test('a period is "day, start – end", with no full dates in it', () => {
  const label = formatPeriod('2026-11-21T03:00:00Z', 3);
  assert.match(label, /^[A-Za-z]{3}, [A-Za-z]{3} \d{1,2}, .+ – .+$/);
  assert.equal(label.includes('/'), false);
});

test('a period over midnight stays short (each end is only an hour)', () => {
  // Some 3-hour period crosses midnight in any time zone; every label stays short.
  for (let hour = 0; hour < 24; hour += 3) {
    const end = new Date(Date.UTC(2026, 10, 21, hour)).toISOString();
    const label = formatPeriod(end, 3);
    assert.equal(label.includes('/'), false, label);
    assert.ok(label.length < 30, label);
  }
});

test('the slider ends show the weekday and date only', () => {
  assert.match(formatForecastDay('2026-11-21T03:00:00Z'), /^[A-Za-z]{3}, [A-Za-z]{3} \d{1,2}$/);
});
