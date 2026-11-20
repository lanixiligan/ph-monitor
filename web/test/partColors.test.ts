// Tests for the part views' colours (src/partColors.ts): Earthquake and Flood.
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PlaceScores, ProvinceMapProperties } from '@ph-monitor/shared';
import type { PlaceCollection, ProvinceCollection } from '../src/api.ts';
import { partProperties, partViewOf, withProvincePart, withTownPart } from '../src/partColors.ts';
import { bandColors, bandFor } from '../src/scoreScale.ts';

const NO_DATA = 'no-data';
const colorOf = (score: number) => bandColors(bandFor(score), 'light').color;

// Four towns: 1 with known parts, 2 where earthquakes were unknown, 3 with no
// score entry at all, 4 with no rain reading.
const towns: PlaceCollection = {
  type: 'FeatureCollection',
  features: [1, 2, 3, 4].map((psgc) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [121, 14] },
    properties: { psgc, name: `Town ${psgc}`, province_name: 'Somewhere' },
  })),
};

const scores: PlaceScores = {
  computedAt: '2026-11-20T00:00:00Z',
  places: [
    // A high overall score (from rain), but a small earthquake part: the view shows the part.
    { psgc: 1, score: 70, incomplete: false, quakeScore: 25, quakeUnknown: false, rainScore: 70 },
    { psgc: 2, score: 10, incomplete: true, quakeScore: 5, quakeUnknown: true, rainScore: 10 },
    // No rain reading: the overall score is "at least", the rain part unknown.
    { psgc: 4, score: 30, incomplete: true, quakeScore: 30, quakeUnknown: false, rainScore: null },
  ],
};

/** One province's map data; each test changes only what it is about. */
function province(changes: Partial<ProvinceMapProperties>): ProvinceMapProperties {
  return {
    psgc: 1,
    name: 'P',
    score: 40,
    quake_score: 0,
    weather_score: 40,
    event_score: 0,
    incomplete: false,
    top_place: null,
    quake_top_score: 0,
    quake_top_place: null,
    quake_unknown: false,
    rain_top_score: 0,
    rain_top_place: null,
    rain_unknown: false,
    point_lat: 14,
    point_lon: 121,
    ...changes,
  };
}

function provinces(list: ProvinceMapProperties[]): ProvinceCollection {
  return {
    type: 'FeatureCollection',
    features: list.map((properties) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [121, 14] },
      properties,
    })),
  };
}

test('only Earthquake and Flood colour by a part of the score', () => {
  assert.equal(partViewOf('earthquake'), 'earthquake');
  assert.equal(partViewOf('flood'), 'flood');
  for (const view of ['overall', 'heat', 'typhoon', 'stormSurge', 'tsunami'] as const) {
    assert.equal(partViewOf(view), null, view);
  }
});

// --- Earthquake (the same behaviour as before the move) ---

test('earthquake: a town is coloured by its earthquake part, not its overall score', () => {
  const props = withTownPart('earthquake', towns, scores, 'light', NO_DATA).features[0]!.properties;
  assert.equal(props.partScore, 25);
  assert.equal(props.color, colorOf(25));
  assert.notEqual(props.color, colorOf(70));
  assert.equal(props.noData, false);
  assert.equal(props.incomplete, false);
});

test('earthquake: a town where earthquakes were unknown keeps its colour with the "at least" stripes', () => {
  const props = withTownPart('earthquake', towns, scores, 'light', NO_DATA).features[1]!.properties;
  assert.equal(props.incomplete, true);
  assert.equal(props.noData, false);
  assert.equal(props.color, colorOf(5));
});

test('earthquake: a town with no score is striped as no data, never calm', () => {
  const props = withTownPart('earthquake', towns, scores, 'light', NO_DATA).features[2]!.properties;
  assert.equal(props.partScore, null);
  assert.equal(props.noData, true);
  assert.equal(props.color, NO_DATA);
  assert.equal(props.scored, false);
  // No scores loaded at all: every town is no data.
  for (const feature of withTownPart('earthquake', towns, null, 'light', NO_DATA).features) {
    assert.equal(feature.properties.noData, true);
  }
});

test('the dark theme uses the dark score colours', () => {
  assert.equal(partProperties(60, false, 'dark', NO_DATA).color, bandColors(bandFor(60), 'dark').color);
});

test('earthquake: a province uses its highest town earthquake part; null or unknown is never calm', () => {
  const [known, otherMissing, incomplete, none] = withProvincePart(
    'earthquake',
    provinces([
      // The province's own earthquake part is 0 (its highest overall town has none),
      // but one of its towns has 30: the province shows 30, and names that town.
      province({ psgc: 1, quake_score: 0, quake_top_score: 30, quake_top_place: 'Town 1' }),
      // Incomplete only because of another signal: no earthquake stripes.
      province({ psgc: 4, quake_score: 30, quake_top_score: 30, incomplete: true }),
      province({ psgc: 2, quake_score: 30, quake_top_score: 30, quake_unknown: true, incomplete: true }),
      province({ psgc: 3, quake_score: null, quake_top_score: null }),
    ]),
    'light',
    NO_DATA,
  ).features.map((f) => f.properties);
  assert.equal(known!.color, colorOf(30));
  assert.equal(known!.incomplete, false);
  assert.equal(known!.partTopPlace, 'Town 1');
  assert.equal(otherMissing!.incomplete, false);
  assert.equal(incomplete!.incomplete, true);
  assert.equal(none!.noData, true);
  assert.equal(none!.color, NO_DATA);
});

// --- Flood: the rain part ---

test('flood: a town is coloured by its rain part', () => {
  const props = withTownPart('flood', towns, scores, 'light', NO_DATA).features[0]!.properties;
  assert.equal(props.partScore, 70);
  assert.equal(props.color, colorOf(70));
  assert.equal(props.noData, false);
  assert.equal(props.incomplete, false);
});

test('flood: unknown earthquakes do not stripe the rain part', () => {
  const props = withTownPart('flood', towns, scores, 'light', NO_DATA).features[1]!.properties;
  assert.equal(props.partScore, 10);
  assert.equal(props.incomplete, false);
});

test('flood: a town with no rain reading is striped as no data, never coloured as 0', () => {
  const props = withTownPart('flood', towns, scores, 'light', NO_DATA).features[3]!.properties;
  assert.equal(props.partScore, null);
  assert.equal(props.noData, true);
  assert.equal(props.color, NO_DATA);
  assert.notEqual(props.color, colorOf(0));
  // It has a score entry, so the hover label still names the town.
  assert.equal(props.scored, true);
});

test('flood: a town with no score entry is no data too', () => {
  const props = withTownPart('flood', towns, scores, 'light', NO_DATA).features[2]!.properties;
  assert.equal(props.noData, true);
  assert.equal(props.scored, false);
});

test('flood: a province uses its highest known town rain; some unknown = "at least"; none known = no data', () => {
  const [known, someUnknown, none] = withProvincePart(
    'flood',
    provinces([
      // A high earthquake part does not leak into the rain colour.
      province({ psgc: 1, quake_top_score: 90, rain_top_score: 45, rain_top_place: 'Town 1' }),
      province({ psgc: 2, rain_top_score: 20, rain_top_place: 'Town 2', rain_unknown: true, incomplete: true }),
      province({ psgc: 3, rain_top_score: null, rain_top_place: null, rain_unknown: true, incomplete: true }),
    ]),
    'light',
    NO_DATA,
  ).features.map((f) => f.properties);
  assert.equal(known!.color, colorOf(45));
  assert.equal(known!.partTopPlace, 'Town 1');
  assert.equal(known!.incomplete, false);
  assert.equal(someUnknown!.color, colorOf(20));
  assert.equal(someUnknown!.incomplete, true);
  assert.equal(someUnknown!.noData, false);
  assert.equal(none!.noData, true);
  assert.equal(none!.color, NO_DATA);
  // No data already has its own stripes; it is never also "incomplete".
  assert.equal(none!.incomplete, false);
});
