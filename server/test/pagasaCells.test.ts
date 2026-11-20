// Tests for each town's hottest PAGASA value (no database, no network).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { townMaxima } from '../src/pagasaCells.ts';

test('townMaxima keeps the hottest clean value; a town with none is null', () => {
  const values = Float32Array.from([30, NaN, 41.5, -9999]);
  const maxima = townMaxima(values, new Map([[1, [0, 2]], [2, [1, 3]], [3, []]]));
  assert.equal(maxima.get(1), 41.5);
  // A coastal town whose squares are all no data: unknown, never 0 or a neighbour's value.
  assert.equal(maxima.get(2), null);
  // A town with no squares at all (outside the grid): unknown too.
  assert.equal(maxima.get(3), null);
  assert.equal(maxima.size, 3);
});

test('townMaxima ignores a cell number past the end of the grid', () => {
  const maxima = townMaxima(Float32Array.from([33]), new Map([[1, [0, 5]]]));
  assert.equal(maxima.get(1), 33);
});
