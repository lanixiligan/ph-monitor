// Tests for the Earthquake view's colours (src/quakeColors.ts).
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlaceScores } from '@ph-monitor/shared';
import type { PlaceCollection, ProvinceCollection } from '../src/api.ts';
import { quakeProperties, withProvinceQuake, withTownQuake } from '../src/quakeColors.ts';
import { bandColors, bandFor } from '../src/scoreScale.ts';

const NO_DATA = 'no-data';
const colorOf = (score: number) => bandColors(bandFor(score), 'light').color;

// Three towns: one with a known earthquake part, one where earthquakes were
// unknown, one with no score entry at all.
const towns: PlaceCollection = {
  type: 'FeatureCollection',
  features: [1, 2, 3].map((psgc) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [121, 14] },
    properties: { psgc, name: `Town ${psgc}`, province_name: 'Somewhere' },
  })),
};

const scores: PlaceScores = {
  computedAt: '2026-11-20T00:00:00Z',
  places: [
    // A high overall score (from rain), but a small earthquake part: the view shows the part.
    { psgc: 1, score: 70, incomplete: false, quakeScore: 25, quakeUnknown: false },
    { psgc: 2, score: 10, incomplete: true, quakeScore: 5, quakeUnknown: true },
  ],
};

test('a town is coloured by its earthquake part, not its overall score', () => {
  const props = withTownQuake(towns, scores, 'light', NO_DATA).features[0]!.properties;
  assert.equal(props.quakeScore, 25);
  assert.equal(props.color, colorOf(25));
  assert.notEqual(props.color, colorOf(70));
  assert.equal(props.noData, false);
  assert.equal(props.incomplete, false);
});

test('a town where earthquakes were unknown keeps its colour with the "at least" stripes', () => {
  const props = withTownQuake(towns, scores, 'light', NO_DATA).features[1]!.properties;
  assert.equal(props.incomplete, true);
  assert.equal(props.noData, false);
  assert.equal(props.color, colorOf(5));
});

test('a town with no score is striped as no data, never calm', () => {
  const props = withTownQuake(towns, scores, 'light', NO_DATA).features[2]!.properties;
  assert.equal(props.quakeScore, null);
  assert.equal(props.noData, true);
  assert.equal(props.color, NO_DATA);
  // No scores loaded at all: every town is no data.
  for (const feature of withTownQuake(towns, null, 'light', NO_DATA).features) {
    assert.equal(feature.properties.noData, true);
  }
});

test('the dark theme uses the dark score colours', () => {
  assert.equal(quakeProperties(60, false, 'dark', NO_DATA).color, bandColors(bandFor(60), 'dark').color);
});

test('a province uses its highest town earthquake part; null or unknown is never calm', () => {
  const base = {
    name: 'P',
    score: 40,
    weather_score: 40,
    event_score: 0,
    top_place: null,
    quake_top_place: null,
    point_lat: 14,
    point_lon: 121,
  };
  const provinces: ProvinceCollection = {
    type: 'FeatureCollection',
    features: [
      // The province's own earthquake part is 0 (its highest overall town has none),
      // but one of its towns has 30: the province shows 30.
      { psgc: 1, quake_score: 0, quake_top_score: 30, quake_unknown: false, incomplete: false },
      // Incomplete only because of another signal: no earthquake stripes.
      { psgc: 4, quake_score: 30, quake_top_score: 30, quake_unknown: false, incomplete: true },
      { psgc: 2, quake_score: 30, quake_top_score: 30, quake_unknown: true, incomplete: true },
      { psgc: 3, quake_score: null, quake_top_score: null, quake_unknown: false, incomplete: false },
    ].map((extra) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [121, 14] },
      properties: { ...base, ...extra },
    })),
  };
  const [known, otherMissing, incomplete, none] = withProvinceQuake(provinces, 'light', NO_DATA).features.map(
    (f) => f.properties,
  );
  assert.equal(known!.color, colorOf(30));
  assert.equal(known!.incomplete, false);
  assert.equal(otherMissing!.incomplete, false);
  assert.equal(incomplete!.incomplete, true);
  assert.equal(none!.noData, true);
  assert.equal(none!.color, NO_DATA);
});
