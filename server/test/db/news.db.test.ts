// Database test for what the news job reads before it sorts headlines:
// provinces, towns, and the names of storms seen lately.
// Run with: npm run test:db

import { addAlert, addStorm, ALPHA, ALPHA_CITY, hoursAgo, hoursAhead, pool, resetDb } from './testDb.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { loadNewsContext } from '../../src/jobs/ingestNews.ts';

before(async () => {
  await resetDb();
});

after(async () => {
  await pool.end();
});

test('news context: provinces, towns, and storm names from the last 14 days', async () => {
  // A storm from the storms table (international name, needs no quotes)...
  await addStorm('FUNG-WONG', { track: [] });
  // ...one that last moved 20 days ago (too old to count)...
  await addStorm('OLDSTORM', { track: [] });
  await pool.query(`UPDATE storms SET updated_at = now() - interval '20 days' WHERE id = 'OLDSTORM'`);
  // ...and a PAGASA cyclone alert, which also gives the local name (quotes needed).
  await addAlert('Tropical Cyclone Alert : Typhoon Uwan (FUNG-WONG)', { sentAt: hoursAgo(2), expiresAt: hoursAhead(10) });

  const context = await loadNewsContext();

  assert.ok(context.provinces.some((province) => province.psgc === ALPHA));
  assert.ok(context.towns.some((town) => town.provincePsgc === ALPHA));
  assert.equal(context.towns.length, 1, `one test town (${ALPHA_CITY})`);
  // `localeCompare` sorts by name so the check does not depend on row order.
  const names = [...context.storms].sort((a, b) => a.name.localeCompare(b.name));
  assert.deepEqual(names, [
    { name: 'FUNG-WONG', needsQuotes: false },
    { name: 'Uwan', needsQuotes: true },
  ]);
});
