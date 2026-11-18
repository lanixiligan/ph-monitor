// Checks how USGS's impact estimates (PAGER alert, shaking intensity, tsunami
// link) are read from a saved earthquake record. Run with: npm test
// No network or database is used.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readQuakeImpact } from '../src/quakeImpact.ts';

const NOTHING = { pagerAlert: null, mmi: null, tsunamiInfo: false };

test('all three fields are read when USGS gives good values', () => {
  assert.deepEqual(readQuakeImpact({ alert: 'orange', mmi: 7.2, tsunami: 1, mag: 6.9 }), {
    pagerAlert: 'orange',
    mmi: 7.2,
    tsunamiInfo: true,
  });
  for (const level of ['green', 'yellow', 'orange', 'red']) {
    assert.equal(readQuakeImpact({ alert: level }).pagerAlert, level);
  }
});

test('USGS gave no values: nothing to show', () => {
  assert.deepEqual(readQuakeImpact({ alert: null, mmi: null, tsunami: 0 }), NOTHING);
  assert.deepEqual(readQuakeImpact({ mag: 5 }), NOTHING); // fields missing
  assert.deepEqual(readQuakeImpact({}), NOTHING);
});

test('no properties at all (old or odd record): nothing to show', () => {
  assert.deepEqual(readQuakeImpact(null), NOTHING);
  assert.deepEqual(readQuakeImpact(undefined), NOTHING);
  assert.deepEqual(readQuakeImpact('properties'), NOTHING);
  assert.deepEqual(readQuakeImpact([1, 2, 3]), NOTHING);
});

test('strange values are dropped, never shown', () => {
  assert.equal(readQuakeImpact({ alert: 'purple' }).pagerAlert, null);
  assert.equal(readQuakeImpact({ alert: 'ORANGE' }).pagerAlert, null);
  assert.equal(readQuakeImpact({ alert: 3 }).pagerAlert, null);
  assert.equal(readQuakeImpact({ mmi: '6' }).mmi, null);
  assert.equal(readQuakeImpact({ mmi: -1 }).mmi, null);
  assert.equal(readQuakeImpact({ mmi: 99 }).mmi, null);
  assert.equal(readQuakeImpact({ tsunami: true }).tsunamiInfo, false);
  assert.equal(readQuakeImpact({ tsunami: '1' }).tsunamiInfo, false);
  assert.equal(readQuakeImpact({ tsunami: 2 }).tsunamiInfo, false);
});

test('the edges of the intensity range are kept', () => {
  assert.equal(readQuakeImpact({ mmi: 0 }).mmi, 0);
  assert.equal(readQuakeImpact({ mmi: 12 }).mmi, 12);
});

test('one strange field does not hide the others', () => {
  assert.deepEqual(readQuakeImpact({ alert: 'purple', mmi: 6.1, tsunami: 1 }), {
    pagerAlert: null,
    mmi: 6.1,
    tsunamiInfo: true,
  });
  assert.deepEqual(readQuakeImpact({ alert: 'red', mmi: 'strong', tsunami: 1 }), {
    pagerAlert: 'red',
    mmi: null,
    tsunamiInfo: true,
  });
  assert.deepEqual(readQuakeImpact({ alert: 'yellow', mmi: 5.5, tsunami: 'yes' }), {
    pagerAlert: 'yellow',
    mmi: 5.5,
    tsunamiInfo: false,
  });
});
