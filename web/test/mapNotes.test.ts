// Tests for the note over the map (src/mapNotes.ts) and what each view's
// shapes show (src/mapLook.ts): an empty map must never look calm.
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FeedHealth, Storm } from '@ph-monitor/shared';
import { mapLook } from '../src/mapLook.ts';
import { isWarnNote, mapNote, stormsUnsure } from '../src/mapNotes.ts';
import type { MapNoteInput } from '../src/mapNotes.ts';

const fresh: FeedHealth[] = [{ id: 'storms', lastOkAt: '2026-11-20T00:00:00Z', isStale: false }];
const stale: FeedHealth[] = [{ id: 'storms', lastOkAt: '2026-11-19T00:00:00Z', isStale: true }];
const storm: Storm = {
  id: 'jma:1',
  source: 'jma',
  name: 'Typhoon Test',
  category: 'TY',
  isActive: true,
  url: null,
  updatedAt: '2026-11-20T00:00:00Z',
  track: [],
};

/** Typhoon pressed, everything loaded and fresh, no storm; each test changes what it is about. */
function input(changes: Partial<MapNoteInput>): MapNoteInput {
  return {
    view: 'typhoon',
    storms: [],
    stormsFailed: false,
    feeds: fresh,
    stormsTicked: true,
    surgeTicked: true,
    zoom: 6,
    surgeMinZoom: 4,
    ...changes,
  };
}

test('typhoon: no storm tracked says so in words', () => {
  assert.equal(mapNote(input({})), 'stormsNone');
  assert.equal(isWarnNote('stormsNone'), false);
});

test('typhoon: a tracked storm needs no note', () => {
  assert.equal(mapNote(input({ storms: [storm] })), null);
});

test('typhoon: a stale or never-fetched feed is said with a warning, before "none"', () => {
  assert.equal(mapNote(input({ feeds: stale })), 'stormsStale');
  assert.equal(mapNote(input({ feeds: stale, storms: [storm] })), 'stormsStale');
  // Not in the list at all: never fetched.
  assert.equal(mapNote(input({ feeds: [] })), 'stormsStale');
  assert.equal(isWarnNote('stormsStale'), true);
});

test('typhoon: a failed storm request is said with a warning', () => {
  assert.equal(mapNote(input({ stormsFailed: true, storms: null })), 'stormsFailed');
  assert.equal(mapNote(input({ stormsFailed: true, storms: [storm] })), 'stormsFailed');
  assert.equal(isWarnNote('stormsFailed'), true);
});

test('typhoon: freshness unknown and no storm is never "none"', () => {
  assert.equal(mapNote(input({ feeds: 'failed' })), 'stormsUnchecked');
  // Storms drawn, but the check failed: still said, like the status card does.
  assert.equal(mapNote(input({ feeds: 'failed', storms: [storm] })), 'stormsUnchecked');
  assert.equal(isWarnNote('stormsUnchecked'), true);
});

test('typhoon: still loading says so; tracks switched off says so', () => {
  assert.equal(mapNote(input({ storms: null })), 'stormsLoading');
  assert.equal(mapNote(input({ feeds: null })), 'stormsLoading');
  assert.equal(mapNote(input({ stormsTicked: false, storms: [storm] })), 'stormsHidden');
});

test('storm surge: below the zones\' zoom the note says to zoom in', () => {
  assert.equal(mapNote(input({ view: 'stormSurge', zoom: 3 })), 'surgeZoomIn');
  assert.equal(mapNote(input({ view: 'stormSurge', zoom: 4 })), null);
  assert.equal(mapNote(input({ view: 'stormSurge', surgeTicked: false })), 'surgeHidden');
});

test('other views get no map note', () => {
  for (const view of ['overall', 'flood', 'earthquake', 'heat'] as const) {
    assert.equal(mapNote(input({ view, storms: null, feeds: 'failed' })), null, view);
  }
});

test('status card: "no storm near here" is trusted only with a fresh, loaded feed', () => {
  assert.equal(stormsUnsure(false, fresh), false);
  assert.equal(stormsUnsure(true, fresh), true);
  assert.equal(stormsUnsure(false, stale), true);
  assert.equal(stormsUnsure(false, []), true);
  assert.equal(stormsUnsure(false, 'failed'), true);
});

test('map look: Typhoon and Storm surge hide the fills; Flood and Earthquake show a part', () => {
  assert.equal(mapLook('overall'), 'score');
  assert.equal(mapLook('heat'), 'heat');
  assert.equal(mapLook('earthquake'), 'part');
  assert.equal(mapLook('flood'), 'part');
  assert.equal(mapLook('typhoon'), 'plain');
  assert.equal(mapLook('stormSurge'), 'plain');
});
