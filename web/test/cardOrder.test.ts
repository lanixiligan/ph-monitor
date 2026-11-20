// Tests for the status card's small rules (src/cardOrder.ts): which events go
// in the block above the score, which lines an alert's title needs, and the
// order of the hazard rows for the pressed map view.
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DisasterEvent } from '@ph-monitor/shared';
import { HAZARD_ROWS, alertTitleLines, hazardRowOrder, isTopEvent, viewRow, viewSection } from '../src/cardOrder.ts';

// One event; each test changes only what it is about.
function event(changes: Partial<DisasterEvent>): DisasterEvent {
  return {
    id: 'gdacs:EQ:1',
    source: 'gdacs',
    kind: 'earthquake',
    alertLevel: 'green',
    title: 'Earthquake in Philippines',
    startedAt: '2026-11-15T00:00:00Z',
    endedAt: '2026-11-15T00:00:00Z',
    url: null,
    lat: 10,
    lon: 125,
    distanceKm: 238,
    ...changes,
  };
}

test('a finished green event (or one with no level) goes down to the details', () => {
  assert.equal(isTopEvent(event({})), false);
  assert.equal(isTopEvent(event({ alertLevel: null })), false);
});

test('an event that is still going stays above the score, whatever its level', () => {
  assert.equal(isTopEvent(event({ endedAt: null })), true);
  assert.equal(isTopEvent(event({ endedAt: null, alertLevel: null })), true);
});

test('an orange or red event stays above the score even after it has ended', () => {
  assert.equal(isTopEvent(event({ alertLevel: 'orange' })), true);
  assert.equal(isTopEvent(event({ alertLevel: 'red' })), true);
});

test('alert title: when one line only repeats the other with more added, only the fuller line is shown', () => {
  // The event name adds the level.
  assert.deepEqual(alertTitleLines('General Flood Advisory', 'General Flood Advisory (Moderate)'), [
    'General Flood Advisory (Moderate)',
  ]);
  // The headline adds the storm's name.
  assert.deepEqual(
    alertTitleLines('Tropical Cyclone Alert : Typhoon Samuel (CEMPAKA)', 'Tropical Cyclone Alert'),
    ['Tropical Cyclone Alert : Typhoon Samuel (CEMPAKA)'],
  );
  // The same text twice (capital letters and spaces aside) is shown once.
  assert.deepEqual(alertTitleLines('General Flood Advisory (Final)', 'general flood advisory  (final) '), [
    'General Flood Advisory (Final)',
  ]);
});

test('alert title: two different lines are both shown, headline first', () => {
  assert.deepEqual(alertTitleLines('Heavy rain over Cebu tonight', 'Rainfall Warning (Orange)'), [
    'Heavy rain over Cebu tonight',
    'Rainfall Warning (Orange)',
  ]);
});

test("hazard rows: Overall keeps today's order", () => {
  assert.deepEqual(hazardRowOrder('overall'), ['quake', 'rain', 'heat', 'event']);
  assert.equal(viewRow('overall'), null);
});

test('hazard rows: the pressed view puts its own row first, the others keep their order', () => {
  assert.deepEqual(hazardRowOrder('heat'), ['heat', 'quake', 'rain', 'event']);
  assert.deepEqual(hazardRowOrder('earthquake'), ['quake', 'rain', 'heat', 'event']);
  assert.equal(viewRow('heat'), 'heat');
  assert.equal(viewRow('earthquake'), 'quake');
});

test('hazard rows: a view with no row of its own keeps the order, and every row stays listed', () => {
  assert.deepEqual(hazardRowOrder('tsunami'), HAZARD_ROWS);
  for (const view of ['overall', 'heat', 'earthquake', 'tsunami'] as const) {
    assert.deepEqual([...hazardRowOrder(view)].sort(), [...HAZARD_ROWS].sort());
  }
});

test('a view moves its own detail section up: Earthquake the quakes, Heat the weather', () => {
  assert.equal(viewSection('earthquake'), 'quakes');
  assert.equal(viewSection('heat'), 'weather');
  // Overall and a view with no section keep the card as it is.
  assert.equal(viewSection('overall'), null);
  assert.equal(viewSection('tsunami'), null);
});
