// Tests for "may a reader's Refresh check the channels again?" (src/jobs/streamRefresh.ts).
// Pure function only: the clock is passed in. Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REFRESH_COOLDOWN_MINUTES, mayRecheck } from '../src/jobs/streamRefresh.ts';

const now = new Date('2026-11-18T12:00:00Z');
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60 * 1000);

test('mayRecheck: channels never checked may be checked', () => {
  assert.equal(mayRecheck(null, now), true);
});

test('mayRecheck: not again within the cooldown', () => {
  assert.equal(mayRecheck(minutesAgo(0), now), false);
  assert.equal(mayRecheck(minutesAgo(REFRESH_COOLDOWN_MINUTES - 0.5), now), false);
});

test('mayRecheck: again once the cooldown has passed', () => {
  assert.equal(mayRecheck(minutesAgo(REFRESH_COOLDOWN_MINUTES), now), true);
  assert.equal(mayRecheck(minutesAgo(30), now), true);
});
