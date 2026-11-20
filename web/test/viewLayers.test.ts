// Tests for the tick boxes as the reader switches map views (src/viewLayers.ts).
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MAP_VIEW, MAP_VIEWS } from '@ph-monitor/shared';
import type { MapView } from '@ph-monitor/shared';
import { DEFAULT_LAYERS } from '../src/mapSettings.ts';
import { changeLayers, initialViewState, mapViewById, pressView, turnOnLayer } from '../src/viewLayers.ts';
import type { ViewState } from '../src/viewLayers.ts';

// Made-up views, so the rule is tested with views that tick layers.
const overall: MapView = { id: 'overall', icon: 'overall', newsType: null, place: 'row', available: true, layers: [] };
const heat: MapView = { id: 'heat', icon: 'heat', newsType: 'heat', place: 'row', available: true, layers: ['stormSurge'] };
const quake: MapView = {
  id: 'earthquake',
  icon: 'earthquake',
  newsType: 'earthquake',
  place: 'row',
  available: true,
  layers: ['landslide', 'events'],
};
const tsunami: MapView = { id: 'tsunami', icon: 'tsunami', newsType: 'tsunami', place: 'more', available: false, layers: ['news'] };

// The reader's own Overall ticks: events off, which no view should quietly turn back on.
const own = { ...DEFAULT_LAYERS, events: false };
const start: ViewState = { view: 'overall', layers: own, overallLayers: null };

test('the page opens on the default view with the default tick boxes', () => {
  const state = initialViewState();
  assert.equal(state.view, DEFAULT_MAP_VIEW);
  assert.deepEqual(state.layers, DEFAULT_LAYERS);
});

test("leaving Overall saves the reader's ticks and ticks the view's layers", () => {
  const state = pressView(start, heat);
  assert.equal(state.view, 'heat');
  assert.deepEqual(state.layers, { ...own, stormSurge: true });
  assert.deepEqual(state.overallLayers, own);
});

test("back to Overall gives the reader's own ticks back exactly", () => {
  const state = pressView(pressView(start, heat), overall);
  assert.deepEqual(state, start);
});

test('ticks changed on a hazard view are dropped on the way back to Overall', () => {
  const onHeat = pressView(start, heat);
  const changed = changeLayers(onHeat, { ...onHeat.layers, storms: false, stormSurge: false });
  assert.equal(changed.layers.storms, false);
  const back = pressView(changed, overall);
  assert.deepEqual(back.layers, own);
  assert.equal(back.overallLayers, null);
});

test("hazard to hazard: the saved Overall ticks stay, the last view's ticks don't carry over", () => {
  const state = pressView(pressView(start, heat), quake);
  assert.equal(state.view, 'earthquake');
  // Heat's storm surge is off again; the earthquake view's own layers are on.
  assert.deepEqual(state.layers, { ...own, landslide: true, events: true });
  assert.deepEqual(state.overallLayers, own);
  assert.deepEqual(pressView(state, overall).layers, own);
});

test('an unavailable view, or the view already pressed, changes nothing', () => {
  assert.equal(pressView(start, tsunami), start);
  assert.equal(pressView(start, overall), start);
  const onHeat = pressView(start, heat);
  assert.equal(pressView(onHeat, heat), onHeat);
});

test('changing a tick box on Overall keeps it (nothing is saved on Overall)', () => {
  const state = changeLayers(start, { ...own, news: false });
  assert.equal(state.layers.news, false);
  assert.equal(state.overallLayers, null);
});

test('"Show on the map" turns the headline dots on now and in the saved Overall ticks', () => {
  const noNews = { ...own, news: false };
  const onHeat = pressView({ view: 'overall', layers: noNews, overallLayers: null }, heat);
  const shown = turnOnLayer(onHeat, 'news');
  assert.equal(shown.layers.news, true);
  assert.equal(shown.overallLayers?.news, true);
  assert.equal(pressView(shown, overall).layers.news, true);
  // On Overall there is nothing saved to change.
  assert.equal(turnOnLayer({ view: 'overall', layers: noNews, overallLayers: null }, 'news').overallLayers, null);
});

test('the real views: Overall and Heat exist, Heat ticks nothing, Tsunami cannot be pressed', () => {
  assert.equal(mapViewById('overall')?.place, 'row');
  const realHeat = mapViewById('heat');
  assert.ok(realHeat);
  assert.deepEqual(pressView(start, realHeat).layers, own);
  const realTsunami = MAP_VIEWS.find((view) => view.id === 'tsunami');
  assert.ok(realTsunami);
  assert.equal(pressView(start, realTsunami), start);
});
