// Tests for the hazard map words on the status card and the legend's tick
// boxes (src/hazardLabels.ts). Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { HazardLayerInfo, HazardZones } from '@ph-monitor/shared';
import { hasMapLayer, landslideText, surgeLines } from '../src/hazardLabels.ts';
import { en } from '../src/i18n/en.ts';

const noMaps: HazardZones = { landslide: null, stormSurge: null };

test('landslide: the class word, "not in a zone", or "no hazard map here"', () => {
  assert.equal(landslideText({ ...noMaps, landslide: { hazardClass: 3 } }, en), 'high');
  assert.equal(landslideText({ ...noMaps, landslide: { hazardClass: 2 } }, en), 'medium');
  assert.equal(landslideText({ ...noMaps, landslide: { hazardClass: 1 } }, en), 'low');
  assert.equal(landslideText({ ...noMaps, landslide: { hazardClass: null } }, en), 'not in a zone');
  // No map is unknown, never "not in a zone".
  assert.equal(landslideText(noMaps, en), 'no hazard map here');
});

test('storm surge: one line per level, in NOAH wording, with "not reached" outside a zone', () => {
  const zones: HazardZones = {
    landslide: null,
    stormSurge: [
      { level: 1, hazardClass: null },
      { level: 2, hazardClass: 1 },
      { level: 3, hazardClass: 2 },
      { level: 4, hazardClass: 3 },
    ],
  };
  assert.deepEqual(surgeLines(zones, en), [
    { label: 'SSA 1 (up to 2 m)', value: 'not reached' },
    { label: 'SSA 2 (up to 3 m)', value: 'low' },
    { label: 'SSA 3 (up to 4 m)', value: 'medium' },
    { label: 'SSA 4 (more than 4 m)', value: 'high' },
  ]);
});

test('storm surge: no map (or no levels) gives null, so the card says "no hazard map here"', () => {
  assert.equal(surgeLines(noMaps, en), null);
  assert.equal(surgeLines({ landslide: null, stormSurge: [] }, en), null);
});

// One loaded layer; each test changes only what it is about.
function layer(changes: Partial<HazardLayerInfo>): HazardLayerInfo {
  return { kind: 'stormSurge', surgeLevel: 4, provinces: 67, loadedAt: '2026-11-18T00:00:00Z', ...changes };
}

test('legend: a tick box only for a kind the server has loaded', () => {
  const surgeOnly = [1, 2, 3, 4].map((level) => layer({ surgeLevel: level as 1 | 2 | 3 | 4 }));
  assert.equal(hasMapLayer(surgeOnly, 'stormSurge'), true);
  assert.equal(hasMapLayer(surgeOnly, 'landslide'), false);
  assert.equal(hasMapLayer([layer({ kind: 'landslide', surgeLevel: null })], 'landslide'), true);
  assert.equal(hasMapLayer([], 'stormSurge'), false);
  assert.equal(hasMapLayer(null, 'stormSurge'), false);
});

test('legend: storm surge needs level 4, the scenario the map draws', () => {
  assert.equal(hasMapLayer([layer({ surgeLevel: 1 }), layer({ surgeLevel: 2 })], 'stormSurge'), false);
});
