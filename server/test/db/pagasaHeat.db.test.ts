// Database tests for the PAGASA heat job (src/jobs/ingestPagasaHeat.ts): saving a
// forecast, refusing a short one, a half-published forecast (a file answers 404),
// a full run with saved PAGASA answers, and deleting old forecasts.
// No network: a pretend fetcher answers with the saved files in fixtures/pagasa-heat.
// Run with: npm run test:db

import { ALPHA_CITY, pool, resetDb } from './testDb.ts';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
// `import type` brings in a type only; it disappears when the code runs.
import type { Fetcher } from '../../src/fetchers/retry.ts';
import type { PagasaHourValues } from '../../src/jobs/ingestPagasaHeat.ts';
import {
  ingestPagasaHeat,
  isFullListing,
  prunePagasaIssuances,
  savePagasaIssuance,
} from '../../src/jobs/ingestPagasaHeat.ts';
import { markTried, spacedEnough } from '../../src/jobs/jobTries.ts';

const FIXTURES = path.join(import.meta.dirname, '..', 'fixtures', 'pagasa-heat');

/** Ten made-up hours on 2026-11-21 (8 AM to 5 PM PH time = 00:00 to 09:00 UTC). */
function madeUpHours(value: number | null): PagasaHourValues[] {
  const hours: PagasaHourValues[] = [];
  for (let i = 0; i < 10; i++) {
    hours.push({ validAt: new Date(Date.UTC(2026, 10, 21, i)), towns: new Map([[ALPHA_CITY, value]]) });
  }
  return hours;
}

/** Rows per forecast: how many, and how many distinct hours. */
async function rowsFor(issuedOn: string): Promise<{ rows: number; hours: number; max: number | null }> {
  // `query<{ ... }>` says what each returned row looks like.
  const result = await pool.query<{ rows: number; hours: number; max: number | null }>(
    `SELECT count(*)::int AS rows, count(DISTINCT valid_at)::int AS hours, max(heat_index_c) AS max
     FROM pagasa_heat WHERE issued_on = $1`,
    [issuedOn],
  );
  return result.rows[0] ?? { rows: 0, hours: 0, max: null };
}

async function hasFetchRun(): Promise<boolean> {
  const result = await pool.query("SELECT 1 FROM fetch_runs WHERE source = 'pagasa-heat'");
  return (result.rowCount ?? 0) > 0;
}

/** A pretend fetcher that answers like PAGASA, with the saved answers. */
type Pretend = { fetcher: Fetcher; presignedCalls: () => number };

/** The saved file list cut down to its first day only (10 hours), as if caught mid-publish. */
async function firstDayListing(): Promise<string> {
  // `as { ... }` tells TypeScript the shape of the parsed JSON.
  const full = JSON.parse(await readFile(path.join(FIXTURES, 'tif-files.json'), 'utf8')) as {
    files: string[];
    availability: Record<string, string[]>;
  };
  const first = Object.keys(full.availability).sort()[0]!;
  return JSON.stringify({
    ...full,
    files: full.files.filter((file) => file.includes(`${first}_`)),
    availability: { [first]: full.availability[first] },
  });
}

async function pretendPagasa(options: { failFile?: string; tifFiles?: string } = {}): Promise<Pretend> {
  const currentDate = await readFile(path.join(FIXTURES, 'current-date.json'), 'utf8');
  const tifFiles = options.tifFiles ?? (await readFile(path.join(FIXTURES, 'tif-files.json'), 'utf8'));
  const presigned = await readFile(path.join(FIXTURES, 'presigned.json'), 'utf8');
  const tif = await readFile(path.join(FIXTURES, '20261121_1200_cog.tif'));
  let presignedCalls = 0;

  const fetcher: Fetcher = async (url) => {
    if (url.endsWith('/internal/api/current-date')) return new Response(currentDate);
    if (url.endsWith('/internal/api/tif-files')) return new Response(tifFiles);
    if (url.includes('/internal/api/presigned-tif?')) {
      presignedCalls += 1;
      if (options.failFile && url.includes(`file=${options.failFile}`)) return new Response('Not Found', { status: 404 });
      return new Response(presigned);
    }
    // Every file link (whatever the hour) gets the one saved forecast file.
    if (url.startsWith('https://iheatmap.s3.ap-southeast-1.amazonaws.com/')) return new Response(tif);
    return new Response('unexpected', { status: 500 });
  };
  return { fetcher, presignedCalls: () => presignedCalls };
}

before(resetDb);
after(() => pool.end());

test('a forecast with every town in every hour is saved', async () => {
  const saved = await savePagasaIssuance('2026-11-21', madeUpHours(35), 1);
  assert.equal(saved, true);
  assert.deepEqual(await rowsFor('2026-11-21'), { rows: 10, hours: 10, max: 35 });
  const run = await pool.query<{ last_saved: number; last_total: number }>(
    "SELECT last_saved, last_total FROM heat_runs WHERE model = 'pagasa'",
  );
  assert.deepEqual(run.rows[0], { last_saved: 1, last_total: 1 });
});

test('a short forecast is not saved and the earlier one stays', async () => {
  // 1 town of 20 has a value: below 90%.
  const short = madeUpHours(40);
  short[3]!.towns.delete(ALPHA_CITY); // `!` tells TypeScript the hour is there
  assert.equal(await savePagasaIssuance('2026-11-21', short, 20), false);
  // Every town but one hour without a value: that hour fails, so nothing is saved.
  const gap = madeUpHours(40);
  gap[3]!.towns.set(ALPHA_CITY, null);
  assert.equal(await savePagasaIssuance('2026-11-21', gap, 1), false);
  assert.deepEqual(await rowsFor('2026-11-21'), { rows: 10, hours: 10, max: 35 });
});

test('a forecast with a missing file saves nothing and the run fails', async () => {
  await pool.query('DELETE FROM pagasa_heat');
  // The third hour's link answers 404 (every try).
  const pretend = await pretendPagasa({ failFile: '20261121_1000_cog.tif' });
  // 10 AM on 2026-11-21 PH time: today is the latest forecast, so only that one is wanted.
  await assert.rejects(ingestPagasaHeat(pretend.fetcher, new Date('2026-11-21T02:00:00Z')));
  assert.equal((await rowsFor('2026-11-21')).rows, 0);
  assert.equal(await hasFetchRun(), false);
});

test('a file list with only the first day is not saved, so the run fails and is tried again', async () => {
  const pretend = await pretendPagasa({ tifFiles: await firstDayListing() });
  await assert.rejects(ingestPagasaHeat(pretend.fetcher, new Date('2026-11-21T02:00:00Z')));
  assert.equal((await rowsFor('2026-11-21')).rows, 0);
  assert.equal(await hasFetchRun(), false);
  assert.equal(pretend.presignedCalls(), 0, 'nothing downloaded');
});

test('isFullListing: needs the issue date first and all ten hours on days 1 to 3', () => {
  const day = (date: string) => ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']
    .map((time) => ({ date, time }));
  const three = [...day('2026-11-21'), ...day('2026-11-22'), ...day('2026-11-23')];
  assert.equal(isFullListing('2026-11-21', three), true);
  // Days 4 and 5 may have any number of hours.
  assert.equal(isFullListing('2026-11-21', [...three, { date: '2026-11-24', time: '08:00' }]), true);
  assert.equal(isFullListing('2026-11-21', three.slice(0, 29)), false, 'day 3 short one hour');
  assert.equal(isFullListing('2026-11-22', three), false, 'starts on another date');
  assert.equal(isFullListing('2026-11-21', []), false);
});

test('a full run saves today (from yesterday) and the latest forecast, then downloads nothing more', async () => {
  const pretend = await pretendPagasa();
  // 9:30 PM on 2026-11-20 PH time; PAGASA's latest forecast is 2026-11-21.
  const now = new Date('2026-11-20T13:30:00Z');
  await ingestPagasaHeat(pretend.fetcher, now);

  const today = await rowsFor('2026-11-20');
  assert.equal(today.hours, 10);
  const todayHours = await pool.query<{ first: Date; last: Date }>(
    "SELECT min(valid_at) AS first, max(valid_at) AS last FROM pagasa_heat WHERE issued_on = '2026-11-20'",
  );
  // 8 AM and 5 PM on 2026-11-20 PH time.
  assert.equal(todayHours.rows[0]?.first.toISOString(), '2026-11-20T00:00:00.000Z');
  assert.equal(todayHours.rows[0]?.last.toISOString(), '2026-11-20T09:00:00.000Z');
  const latest = await rowsFor('2026-11-21');
  assert.equal(latest.hours, 35);
  assert.ok(latest.max !== null && latest.max > 20 && latest.max < 50, `max ${latest.max}`);
  assert.equal(await hasFetchRun(), true);
  assert.equal(pretend.presignedCalls(), 45);

  const again = await pretendPagasa();
  await ingestPagasaHeat(again.fetcher, now);
  assert.equal(again.presignedCalls(), 0);
});

test('when PAGASA is late (newest forecast older than today) the feed is not marked fresh', async () => {
  const before = await pool.query<{ at: Date }>("SELECT last_ok_at AS at FROM fetch_runs WHERE source = 'pagasa-heat'");
  const pretend = await pretendPagasa();
  // 10 AM on 2026-11-22 PH time, two days after the full run; PAGASA still says 2026-11-21.
  await ingestPagasaHeat(pretend.fetcher, new Date('2026-11-22T02:00:00Z'));
  const after = await pool.query<{ at: Date }>("SELECT last_ok_at AS at FROM fetch_runs WHERE source = 'pagasa-heat'");
  assert.equal(after.rows[0]?.at.getTime(), before.rows[0]?.at.getTime());
  assert.equal(pretend.presignedCalls(), 0);
});

test('job_tries spacing: a PAGASA try waits 3 hours before the next', async () => {
  await pool.query('DELETE FROM job_tries');
  assert.equal(await spacedEnough('pagasaHeat', 180, new Date()), true, 'never tried');
  await markTried('pagasaHeat');
  assert.equal(await spacedEnough('pagasaHeat', 180, new Date()), false, 'just tried');
  assert.equal(await spacedEnough('pagasaHeat', 180, new Date(Date.now() + 180 * 60 * 1000)), true, '3 hours later');
  // The heat map's longer wait is unchanged by this.
  assert.equal(await spacedEnough('heatMap', 690, new Date()), true);
});

test('forecasts older than yesterday (PH date) are deleted', async () => {
  // 10 AM on 2026-11-22 PH time: 2026-11-20 goes, 2026-11-21 stays.
  await prunePagasaIssuances(new Date('2026-11-22T02:00:00Z'));
  assert.equal((await rowsFor('2026-11-20')).rows, 0);
  assert.equal((await rowsFor('2026-11-21')).hours, 35);
});
