// Database test for saving the radio station list: stations no longer listed
// are deleted, our check results survive a new list, a new stream address
// starts unchecked, and a tiny list changes nothing.
// Run with: npm run test:db

import { hoursAgo, pool, resetDb } from './testDb.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { RadioRecord } from '../../src/fetchers/radioBrowser.ts';
import { MIN_STATIONS, saveRadioStations } from '../../src/jobs/ingestRadio.ts';
import { readRadioStations } from '../../src/routes/radio.ts';

// A made-up list of MIN_STATIONS stations; ids are fake uuids ending in the number.
function makeList(count: number): RadioRecord[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    name: `Station ${i}`,
    state: null,
    tags: null,
    codec: 'MP3',
    bitrate: 64,
    url: `http://radio.test/${i}`,
    homepage: null,
    votes: i,
  }));
}

const FIRST = '00000000-0000-4000-8000-000000000000';
const SECOND = '00000000-0000-4000-8000-000000000001';

before(async () => {
  await resetDb();
});

after(async () => {
  await pool.end();
});

test('saveRadioStations: keeps checks, resets them for a new address, deletes the unlisted', async () => {
  const list = makeList(MIN_STATIONS + 1);
  await saveRadioStations(list);
  // Pretend our check found both stations failing for 5 hours.
  await pool.query('UPDATE radio_stations SET last_checked_at = now(), failing_since = $1', [hoursAgo(5)]);

  // Next day: the second station has a new address and the last one is gone.
  const next = list.slice(0, -1).map((s) => (s.id === SECOND ? { ...s, url: 'https://radio.test/new' } : s));
  const result = await saveRadioStations(next);
  assert.equal(result.removed, 1);

  const rows = await pool.query<{ id: string; url: string; failing_since: Date | null }>(
    'SELECT id, url, failing_since FROM radio_stations WHERE id = ANY($1::text[]) ORDER BY id',
    [[FIRST, SECOND]],
  );
  assert.notEqual(rows.rows[0]?.failing_since, null); // same address: check kept
  assert.equal(rows.rows[1]?.url, 'https://radio.test/new');
  assert.equal(rows.rows[1]?.failing_since, null); // new address: starts unchecked

  const count = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM radio_stations');
  assert.equal(count.rows[0]?.n, MIN_STATIONS);
});

test('saveRadioStations: a tiny list is refused and the old one stays', async () => {
  await assert.rejects(saveRadioStations(makeList(3)), /keeping the old list/);
  const count = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM radio_stations');
  assert.equal(count.rows[0]?.n, MIN_STATIONS);
});

test('readRadioStations: a station failing for a day is hidden, for less than a day it stays', async () => {
  await pool.query('UPDATE radio_stations SET failing_since = NULL');
  await pool.query('UPDATE radio_stations SET failing_since = $1 WHERE id = $2', [hoursAgo(25), FIRST]);
  await pool.query('UPDATE radio_stations SET failing_since = $1 WHERE id = $2', [hoursAgo(23), SECOND]);
  const ids = (await readRadioStations()).map((station) => station.id);
  assert.equal(ids.includes(FIRST), false);
  assert.equal(ids.includes(SECOND), true);
  assert.equal(ids.length, MIN_STATIONS - 1);
});
