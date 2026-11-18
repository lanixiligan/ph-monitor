// Tests for the heat map colours (src/heatColors.ts) and the heat colours in
// styles.css. Run with: npm test

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import type { HeatMapData } from '@ph-monitor/shared';
import type { PlaceCollection, ProvinceCollection } from '../src/api.ts';
import { emptyHeatMap, heatColor, heatForMap, heatText, withProvinceHeat, withTownHeat } from '../src/heatColors.ts';
import { en } from '../src/i18n/en.ts';
import type { Palette } from '../src/palette.ts';

// Colour names instead of real colours, so a failure says which one was picked.
const palette: Palette = {
  sea: 'sea',
  paper: 'paper',
  ink: 'ink',
  inkSoft: 'ink-soft',
  news: 'news',
  noData: 'no-data',
  surge: [],
  landslide: [],
  heat: { below: 'below', bands: ['caution', 'extreme-caution', 'danger', 'extreme-danger'] },
};

// Two provinces; the first has an incomplete score, which the heat map must not stripe.
const provinces: ProvinceCollection = {
  type: 'FeatureCollection',
  features: [1, 2].map((psgc) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [121, 14] },
    properties: {
      psgc,
      name: `Province ${psgc}`,
      score: 50,
      quake_score: 0,
      weather_score: 50,
      event_score: 0,
      incomplete: psgc === 1,
      top_place: 'Somewhere',
      point_lat: 14,
      point_lon: 121,
    },
  })),
};

// Three towns: 101 and 102 are in the heat answer below, 103 is not.
const towns: PlaceCollection = {
  type: 'FeatureCollection',
  features: [101, 102, 103].map((psgc) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [121, 14] },
    properties: { psgc, name: `Town ${psgc}`, province_name: 'Province 1' },
  })),
};

const heat: HeatMapData = {
  model: 'ecmwf_ifs',
  fetchedAt: '2026-11-19T00:00:00Z',
  isStale: false,
  validAt: '2026-11-19T06:00:00Z',
  places: [
    { psgc: 101, heatIndexC: 43, band: 'danger' },
    { psgc: 102, heatIndexC: 25, band: null },
  ],
  provinces: [
    { psgc: 1, heatIndexC: 43, band: 'danger' },
    { psgc: 2, heatIndexC: null, band: null },
  ],
};

// The map's extra fields are not in the shape types, so read them as "any names".
// `as` tells TypeScript which shape to expect.
const props = (feature: { properties: unknown }) => feature.properties as Record<string, unknown>;

test('heatColor: each band gets its colour', () => {
  assert.deepEqual(heatColor({ psgc: 1, heatIndexC: 27, band: 'caution' }, palette), { color: 'caution', noData: false });
  assert.equal(heatColor({ psgc: 1, heatIndexC: 33, band: 'extreme caution' }, palette).color, 'extreme-caution');
  assert.equal(heatColor({ psgc: 1, heatIndexC: 42, band: 'danger' }, palette).color, 'danger');
  assert.equal(heatColor({ psgc: 1, heatIndexC: 52, band: 'extreme danger' }, palette).color, 'extreme-danger');
});

test('heatColor: below 27 gets palette.heat.below and noData false', () => {
  assert.deepEqual(heatColor({ psgc: 1, heatIndexC: 26.9, band: null }, palette), { color: 'below', noData: false });
});

test('heatColor: null or missing gives noData true', () => {
  assert.deepEqual(heatColor({ psgc: 1, heatIndexC: null, band: null }, palette), { color: 'no-data', noData: true });
  assert.deepEqual(heatColor(undefined, palette), { color: 'no-data', noData: true });
});

test('withTownHeat: a town missing from heat.places is noData', () => {
  const features = withTownHeat(towns, heat, palette).features;
  assert.equal(props(features[0]!).color, 'danger');
  assert.equal(props(features[0]!).heatIndexC, 43);
  assert.equal(props(features[1]!).color, 'below');
  assert.equal(props(features[1]!).noData, false);
  assert.equal(props(features[2]!).noData, true);
  assert.equal(props(features[2]!).color, 'no-data');
  assert.equal(props(features[2]!).heatIndexC, null);
});

test('withProvinceHeat: keeps the shape, colours by heat, and drops the score stripes', () => {
  const [first, second] = withProvinceHeat(provinces, heat, palette).features;
  assert.equal(props(first!).name, 'Province 1');
  assert.equal(props(first!).color, 'danger');
  assert.equal(props(first!).band, 'danger');
  // The score was incomplete; the heat value is not, so no "at least" stripes.
  assert.equal(props(first!).incomplete, false);
  assert.equal(props(second!).noData, true);
});

// Review Focus 2: the page loaded before the first heat run. The server lists
// every town and province with null values; the map must stripe them all.
test('before the first heat run every province and town is striped, never a cool colour', () => {
  const nothingYet: HeatMapData = {
    model: 'ecmwf_ifs',
    fetchedAt: null,
    isStale: true,
    validAt: null,
    places: [101, 102, 103].map((psgc) => ({ psgc, heatIndexC: null, band: null })),
    provinces: [1, 2].map((psgc) => ({ psgc, heatIndexC: null, band: null })),
  };
  for (const answer of [nothingYet, emptyHeatMap('ecmwf_ifs')]) {
    const shapes = [...withProvinceHeat(provinces, answer, palette).features, ...withTownHeat(towns, answer, palette).features];
    for (const shape of shapes) {
      assert.equal(props(shape).noData, true, `psgc ${props(shape).psgc}`);
      assert.equal(props(shape).color, 'no-data', `psgc ${props(shape).psgc}`);
    }
  }
});

test('heatForMap: off gives null, so the map shows the score', () => {
  assert.equal(heatForMap(null, heat), null);
  assert.equal(heatForMap(null, null), null);
});

test('heatForMap: the answer for the chosen model is drawn as it is', () => {
  assert.equal(heatForMap('ecmwf_ifs', heat), heat);
});

test('heatForMap: while loading, every shape is striped, never score-coloured', () => {
  assert.deepEqual(heatForMap('ecmwf_ifs', null), emptyHeatMap('ecmwf_ifs'));
});

// Review Focus 4: the reader switched to GFS, then ECMWF's (older) answer arrived.
test('heatForMap: a late answer for another model is never drawn', () => {
  assert.deepEqual(heatForMap('ncep_gfs_global', heat), emptyHeatMap('ncep_gfs_global'));
});

test('emptyHeatMap: nothing known for the chosen model', () => {
  assert.deepEqual(emptyHeatMap('ncep_gfs_global'), {
    model: 'ncep_gfs_global',
    fetchedAt: null,
    isStale: true,
    validAt: null,
    places: [],
    provinces: [],
  });
});

test('heatText: the number with its band, "below" with no band, or "unknown"', () => {
  assert.equal(heatText(41, 'extreme caution', en), '41 °C, extreme caution');
  assert.equal(heatText(25.4, null, en), '25 °C');
  assert.equal(heatText(null, null, en), 'unknown');
});

test('heatText: whole degrees never contradict the band (41.9 is still 41, extreme caution)', () => {
  assert.equal(heatText(41.9, 'extreme caution', en), '41 °C, extreme caution');
  assert.equal(heatText(26.9, null, en), '26 °C');
});

// ---------- The colours themselves (styles.css) ----------

// How bright a '#rrggbb' colour looks, 0 (black) to 1 (white): the WCAG formula.
function luminance(hex: string): number {
  const channel = (start: number) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const HEAT_NAMES = ['below', 'caution', 'extreme-caution', 'danger', 'extreme-danger'];

/** The five heat colours in the CSS block that starts with `selector`, mildest first. */
function heatColorsIn(selector: string): string[] {
  const start = css.indexOf(`${selector} {`);
  const block = css.slice(start, css.indexOf('}', start));
  return HEAT_NAMES.map((name) => {
    const match = block.match(new RegExp(`--heat-${name}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(match, `--heat-${name} in ${selector}`);
    return match[1]!;
  });
}

test('styles.css: light heat colours get darker with each band (from below 27 up)', () => {
  const values = heatColorsIn(':root').map(luminance);
  for (let i = 1; i < values.length; i++) assert.ok(values[i]! < values[i - 1]!, HEAT_NAMES[i]);
});

test('styles.css: dark heat colours get brighter with each band, like the dark score scale', () => {
  const values = heatColorsIn(":root[data-theme='dark']").map(luminance);
  for (let i = 1; i < values.length; i++) assert.ok(values[i]! > values[i - 1]!, HEAT_NAMES[i]);
});
