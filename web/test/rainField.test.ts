// The rain forecast field: its bands and how a frame is drawn as pixels.

import assert from 'node:assert/strict';
import { test } from 'node:test';
// `import type` brings in a type only; it disappears when the code runs.
import type { RainGrid } from '@ph-monitor/shared';
import { hexToRgb, RAIN_BANDS, rainBand, rainBandLabel } from '../src/rainColors.ts';
import type { Rgb } from '../src/rainColors.ts';
import { imageCorners, latitudeOf, mercatorY, renderField, valueAt } from '../src/rainField.ts';

// A tiny 2 × 2 grid, 10° apart: 120–130°E, 5–15°N.
const grid: RainGrid = { west: 120, south: 5, step: 10, cols: 2, rows: 2 };
// `Array.from(…)` builds the 10 band colours: [1,1,1], [2,2,2], …
const bands: Rgb[] = Array.from({ length: 10 }, (_, i) => [i + 1, i + 1, i + 1]);
const colors = { bands, noData: [200, 200, 200] as Rgb };

test('rainBand: below 0.5 mm nothing; each band from its lowest value', () => {
  assert.equal(rainBand(0), -1);
  assert.equal(rainBand(0.49), -1);
  assert.equal(rainBand(0.5), 0);
  assert.equal(rainBand(4.9), 2);
  assert.equal(rainBand(5), 3);
  assert.equal(rainBand(79.9), 8);
  assert.equal(rainBand(500), 9);
  assert.equal(RAIN_BANDS.length, 10);
});

test('rainBandLabel: ranges, and "80+" for the last band', () => {
  assert.equal(rainBandLabel(0), '0.5–1');
  assert.equal(rainBandLabel(3), '5–10');
  assert.equal(rainBandLabel(9), '80+');
});

test('hexToRgb: reads the CSS colours; anything else is null', () => {
  assert.deepEqual(hexToRgb('#a9d7f2'), [169, 215, 242]);
  assert.deepEqual(hexToRgb(' #FF0000 '), [255, 0, 0]);
  assert.equal(hexToRgb('red'), null);
});

test('imageCorners: top-left, top-right, bottom-right, bottom-left, point to point', () => {
  assert.deepEqual(imageCorners(grid), [
    [120, 15],
    [130, 15],
    [130, 5],
    [120, 5],
  ]);
});

test('mercatorY and latitudeOf undo each other', () => {
  for (const lat of [0, 4, 12.5, 26.5]) assert.ok(Math.abs(latitudeOf(mercatorY(lat)) - lat) < 1e-9);
});

test('valueAt: blends the four nearest points; any missing point gives null', () => {
  // South row 0 and 10, north row 20 and 30.
  const mm = [0, 10, 20, 30];
  assert.equal(valueAt(mm, grid, 0, 0), 0);
  assert.equal(valueAt(mm, grid, 1, 1), 30);
  assert.equal(valueAt(mm, grid, 0.5, 0.5), 15);
  assert.equal(valueAt([0, 10, null, 30], grid, 0.5, 0.5), null);
});

test('valueAt: the smooth curve never goes past the 4 nearest points', () => {
  // A 4 × 4 grid with one wet point in the middle: around it the curve would
  // overshoot below 0 and above 50; it is kept inside the nearest values.
  const big: RainGrid = { west: 120, south: 5, step: 1, cols: 4, rows: 4 };
  const mm = Array(16).fill(0);
  mm[1 * 4 + 1] = 50;
  for (let row = 0; row <= 3; row += 0.25) {
    for (let col = 0; col <= 3; col += 0.25) {
      const value = valueAt(mm, big, row, col);
      assert.ok(value !== null && value >= 0 && value <= 50, `${row},${col}: ${value}`);
    }
  }
  // Next to a missing outer point it still answers (straight blend), not null.
  const holes = [...mm];
  holes[3 * 4 + 3] = null;
  assert.notEqual(valueAt(holes, big, 1.5, 1.5), null);
});

test('renderField: dry is see-through, rain gets its band colour, no data is never dry', () => {
  // Heavy rain everywhere: every pixel has the "50–80" colour, fully opaque.
  const wet = renderField([60, 60, 60, 60], grid, 4, 4, colors);
  assert.deepEqual([...wet.slice(0, 4)], [9, 9, 9, 255]);
  // Dry everywhere: every pixel see-through.
  const dry = renderField([0, 0, 0.2, 0.4], grid, 4, 4, colors);
  assert.ok([...dry].every((value) => value === 0));
  // One point unknown: every pixel touches it on a 2 × 2 grid, so all are "no data".
  const unknown = renderField([60, null, 60, 60], grid, 2, 2, colors);
  assert.deepEqual([...unknown.slice(0, 4)], [200, 200, 200, 150]);
});

test('renderField: the top row of pixels is the north of the grid', () => {
  // South points dry, north points heavy: the top row has the heaviest band,
  // the bottom row (blended, a few mm) a much lighter one.
  const pixels = renderField([0, 0, 90, 90], grid, 2, 10, colors);
  assert.deepEqual([...pixels.slice(0, 4)], [10, 10, 10, 255]);
  const lastRow = pixels.slice(9 * 2 * 4, 9 * 2 * 4 + 4);
  assert.ok((lastRow[0] ?? 0) <= 3);
});
