// Every map view and every kind of headline has its words in both languages
// (the view switch's names, the headlines panel's titles and "none" lines).
// Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAP_VIEWS, NEWS_TYPES } from '@ph-monitor/shared';
import { en } from '../src/i18n/en.ts';
import { fil } from '../src/i18n/fil.ts';

// `as const` keeps each pair as exactly ['en', en] and ['fil', fil].
for (const [name, t] of [['en', en], ['fil', fil]] as const) {
  test(`${name}: every map view has a name, and every view that can be greyed out a note`, () => {
    for (const view of MAP_VIEWS) {
      assert.ok(t.views.names[view.id], view.id);
      // No data at all, or a fixed hazard map that may not be loaded yet.
      const canBeGreyed = !view.available || view.needsHazardMap !== null;
      if (canBeGreyed) assert.ok(view.id in t.views.notes, `note for ${view.id}`);
    }
  });

  test(`${name}: every kind of headline has a title and a "none in the last N days" line`, () => {
    for (const kind of [...NEWS_TYPES, 'general']) {
      assert.ok(kind in t.news.titles, `title for ${kind}`);
      assert.ok(kind in t.news.noneOfKind, `none line for ${kind}`);
      // `as Record<string, string>` lets the table be read with any text key.
      const none = (t.news.noneOfKind as Record<string, string>)[kind];
      assert.ok(none?.includes('{days}'), `{days} in the none line for ${kind}`);
    }
  });
}
