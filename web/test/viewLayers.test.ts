// Tests for the tick boxes as the reader switches map views (src/viewLayers.ts).
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_MAP_VIEW, MAP_VIEWS } from '@ph-monitor/shared';
import type { HazardMapKind, MapView } from '@ph-monitor/shared';
import { DEFAULT_LAYERS } from '../src/mapSettings.ts';
import { changeLayers, initialViewState, mapViewById, pressView, tickLoadedMaps, turnOnLayer } from '../src/viewLayers.ts';
import type { ViewState } from '../src/viewLayers.ts';

// Made-up views, so the rule is tested with views that tick layers.
const overall: MapView = {
  id: 'overall', icon: 'overall', newsType: null, place: 'row', available: true, needsHazardMap: null, layers: [],
};
const heat: MapView = {
  id: 'heat', icon: 'heat', newsType: 'heat', place: 'row', available: true, needsHazardMap: null, layers: ['stormSurge'],
};
const quake: MapView = {
  id: 'earthquake',
  icon: 'earthquake',
  newsType: 'earthquake',
  place: 'row',
  available: true,
  needsHazardMap: null,
  layers: ['landslide', 'events'],
};
const tsunami: MapView = {
  id: 'tsunami', icon: 'tsunami', newsType: 'tsunami', place: 'more', available: false, needsHazardMap: null, layers: ['news'],
};

// Both fixed hazard maps loaded, so these made-up views tick all their layers.
const BOTH: HazardMapKind[] = ['stormSurge', 'landslide'];

// The reader's own Overall ticks: events off, which no view should quietly turn back on.
const own = { ...DEFAULT_LAYERS, events: false };
const start: ViewState = { view: 'overall', layers: own, overallLayers: null };

test('the page opens on the default view with the default tick boxes', () => {
  const state = initialViewState();
  assert.equal(state.view, DEFAULT_MAP_VIEW);
  assert.deepEqual(state.layers, DEFAULT_LAYERS);
});

test("leaving Overall saves the reader's ticks and ticks the view's layers", () => {
  const state = pressView(start, heat, BOTH);
  assert.equal(state.view, 'heat');
  assert.deepEqual(state.layers, { ...own, stormSurge: true });
  assert.deepEqual(state.overallLayers, own);
});

test("back to Overall gives the reader's own ticks back exactly", () => {
  const state = pressView(pressView(start, heat, BOTH), overall, BOTH);
  assert.deepEqual(state, start);
});

test('ticks changed on a hazard view are dropped on the way back to Overall', () => {
  const onHeat = pressView(start, heat, BOTH);
  const changed = changeLayers(onHeat, { ...onHeat.layers, storms: false, stormSurge: false });
  assert.equal(changed.layers.storms, false);
  const back = pressView(changed, overall, BOTH);
  assert.deepEqual(back.layers, own);
  assert.equal(back.overallLayers, null);
});

test("hazard to hazard: the saved Overall ticks stay, the last view's ticks don't carry over", () => {
  const state = pressView(pressView(start, heat, BOTH), quake, BOTH);
  assert.equal(state.view, 'earthquake');
  // Heat's storm surge is off again; the earthquake view's own layers are on.
  assert.deepEqual(state.layers, { ...own, landslide: true, events: true });
  assert.deepEqual(state.overallLayers, own);
  assert.deepEqual(pressView(state, overall, BOTH).layers, own);
});

test('an unavailable view, or the view already pressed, changes nothing', () => {
  assert.equal(pressView(start, tsunami, BOTH), start);
  assert.equal(pressView(start, overall, BOTH), start);
  const onHeat = pressView(start, heat, BOTH);
  assert.equal(pressView(onHeat, heat, BOTH), onHeat);
});

test('changing a tick box on Overall keeps it (nothing is saved on Overall)', () => {
  const state = changeLayers(start, { ...own, news: false });
  assert.equal(state.layers.news, false);
  assert.equal(state.overallLayers, null);
});

test('"Show on the map" turns the headline dots on now and in the saved Overall ticks', () => {
  const noNews = { ...own, news: false };
  const onHeat = pressView({ view: 'overall', layers: noNews, overallLayers: null }, heat, BOTH);
  const shown = turnOnLayer(onHeat, 'news');
  assert.equal(shown.layers.news, true);
  assert.equal(shown.overallLayers?.news, true);
  assert.equal(pressView(shown, overall, BOTH).layers.news, true);
  // On Overall there is nothing saved to change.
  assert.equal(turnOnLayer({ view: 'overall', layers: noNews, overallLayers: null }, 'news').overallLayers, null);
});

test('the real views: Overall and Heat exist, Heat ticks nothing, Tsunami cannot be pressed', () => {
  assert.equal(mapViewById('overall')?.place, 'row');
  const realHeat = mapViewById('heat');
  assert.ok(realHeat);
  assert.deepEqual(pressView(start, realHeat, BOTH).layers, own);
  const realTsunami = MAP_VIEWS.find((view) => view.id === 'tsunami');
  assert.ok(realTsunami);
  assert.equal(pressView(start, realTsunami, BOTH), start);
});

test('Typhoon ticks the storm tracks, and the storm surge zones only when that map is loaded', () => {
  const typhoon = mapViewById('typhoon');
  assert.ok(typhoon);
  const noMaps = pressView(start, typhoon, []);
  assert.equal(noMaps.view, 'typhoon');
  assert.equal(noMaps.layers.storms, true);
  assert.equal(noMaps.layers.rainForecast, true);
  assert.equal(noMaps.layers.stormSurge, false);
  const withSurge = pressView(start, typhoon, ['stormSurge']);
  assert.equal(withSurge.layers.stormSurge, true);
  // Back to Overall: the reader's own ticks, storm surge off again.
  assert.deepEqual(pressView(withSurge, mapViewById('overall')!, ['stormSurge']).layers, own);
});

test('Typhoon pressed before the hazard list arrived ticks the surge zones once it does', () => {
  const typhoon = mapViewById('typhoon');
  assert.ok(typhoon);
  const early = pressView(start, typhoon, []);
  const late = tickLoadedMaps(early, ['stormSurge']);
  assert.equal(late.layers.stormSurge, true);
  assert.equal(late.layers.storms, true);
  // The saved Overall ticks are not touched.
  assert.deepEqual(late.overallLayers, early.overallLayers);
  // On Overall the reader's own ticks never change.
  assert.equal(tickLoadedMaps(start, ['stormSurge']), start);
});

test('the rain forecast (a warm scale) is off on Overall and comes back off after Typhoon', () => {
  assert.equal(start.layers.rainForecast, false);
  const typhoon = mapViewById('typhoon');
  assert.ok(typhoon);
  const back = pressView(pressView(start, typhoon, []), mapViewById('overall')!, []);
  assert.equal(back.layers.rainForecast, false);
});

test('Flood ticks nothing of its own: it recolours the towns', () => {
  const flood = mapViewById('flood');
  assert.ok(flood);
  assert.deepEqual(pressView(start, flood, BOTH).layers, own);
});
