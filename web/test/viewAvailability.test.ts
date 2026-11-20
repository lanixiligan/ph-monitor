// Tests for which views can be pressed, as the web app uses the rule: the
// loaded hazard maps come from GET /api/hazards (loadedMapKinds), then
// isViewAvailable and viewTicks (shared/src/mapViews.ts) decide.
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isViewAvailable, viewTicks } from '@ph-monitor/shared';
import type { HazardLayerInfo, MapView } from '@ph-monitor/shared';
import { loadedMapKinds } from '../src/hazardLabels.ts';
import { DEFAULT_LAYERS } from '../src/mapSettings.ts';
import { mapViewById, pressView } from '../src/viewLayers.ts';
import type { ViewState } from '../src/viewLayers.ts';

/** A real view's row; fails the test when it is missing. */
function view(id: MapView['id']): MapView {
  const found = mapViewById(id);
  assert.ok(found, id);
  return found;
}

const start: ViewState = { view: 'overall', layers: DEFAULT_LAYERS, overallLayers: null };

// What GET /api/hazards lists: the map shows storm surge level 4 only.
const surgeLevel4: HazardLayerInfo = { kind: 'stormSurge', surgeLevel: 4, provinces: 3, loadedAt: '2026-11-20T00:00:00Z' };
const surgeLevel1: HazardLayerInfo = { ...surgeLevel4, surgeLevel: 1 };
const landslide: HazardLayerInfo = { kind: 'landslide', surgeLevel: null, provinces: 2, loadedAt: '2026-11-20T00:00:00Z' };

test('loaded maps: unknown (still loading, or the request failed) means none', () => {
  assert.deepEqual(loadedMapKinds(null), []);
  assert.deepEqual(loadedMapKinds([]), []);
});

test('loaded maps: storm surge counts only with the level the map draws', () => {
  assert.deepEqual(loadedMapKinds([surgeLevel1]), []);
  assert.deepEqual(loadedMapKinds([surgeLevel1, surgeLevel4, landslide]), ['stormSurge', 'landslide']);
});

test('Storm surge can be pressed only while its map is loaded', () => {
  const surge = view('stormSurge');
  assert.equal(isViewAvailable(surge, []), false);
  assert.equal(isViewAvailable(surge, ['landslide']), false);
  assert.equal(isViewAvailable(surge, loadedMapKinds([surgeLevel4])), true);
});

test('views with no hazard map need nothing loaded; Tsunami never can be pressed', () => {
  for (const id of ['overall', 'typhoon', 'flood', 'earthquake', 'heat'] as const) {
    assert.equal(isViewAvailable(view(id), []), true, id);
  }
  assert.equal(isViewAvailable(view('tsunami'), ['stormSurge', 'landslide']), false);
});

test('ticks: a NOAH map layer is left out until that map is loaded', () => {
  assert.deepEqual(viewTicks(view('typhoon'), []), ['storms', 'rainForecast']);
  assert.deepEqual(viewTicks(view('typhoon'), ['stormSurge']), ['storms', 'rainForecast', 'stormSurge']);
  assert.deepEqual(viewTicks(view('stormSurge'), ['stormSurge']), ['stormSurge']);
  assert.deepEqual(viewTicks(view('earthquake'), []), ['quakes']);
});

test('pressing Storm surge with its map not loaded changes nothing', () => {
  assert.equal(pressView(start, view('stormSurge'), []), start);
});

test('pressing Storm surge with its map loaded ticks the zones', () => {
  const state = pressView(start, view('stormSurge'), ['stormSurge']);
  assert.equal(state.view, 'stormSurge');
  assert.equal(state.layers.stormSurge, true);
  assert.deepEqual(state.overallLayers, DEFAULT_LAYERS);
});
