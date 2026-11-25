// Tests for the right column's tabs (live news, radio, headlines). Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FEED_TABS, nextTab, playingTab } from '../src/feedTabs.ts';

test('feed tabs: live news first, then radio, then headlines', () => {
  assert.deepEqual(FEED_TABS, ['streams', 'radio', 'news']);
});

test('feed tabs: arrows move one tab and wrap round at the ends', () => {
  assert.equal(nextTab('streams', 'ArrowRight'), 'radio');
  assert.equal(nextTab('news', 'ArrowRight'), 'streams');
  assert.equal(nextTab('radio', 'ArrowLeft'), 'streams');
  assert.equal(nextTab('streams', 'ArrowLeft'), 'news');
});

test('feed tabs: Home and End jump to the first and last tab', () => {
  assert.equal(nextTab('radio', 'Home'), 'streams');
  assert.equal(nextTab('radio', 'End'), 'news');
});

test('feed tabs: any other key moves nothing', () => {
  assert.equal(nextTab('radio', 'Enter'), null);
  assert.equal(nextTab('radio', 'ArrowDown'), null);
});

test('feed tabs: the tab that holds the sound', () => {
  assert.equal(playingTab({ kind: 'video', id: 'a' }), 'streams');
  assert.equal(playingTab({ kind: 'radio', id: 'b' }), 'radio');
  assert.equal(playingTab(null), null);
});
