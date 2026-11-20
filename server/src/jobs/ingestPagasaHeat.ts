// Job: download PAGASA's iHeatMAP heat index forecast and save each town's hottest
// square per hour (table pagasa_heat). Display only: the score never reads it.
// Runs every 3 hours (due.ts). A run that finds the newest forecast saved costs 1 call;
// a new forecast costs about 2 calls per file (a link, then the file), about 72.
// Run by hand with: npm run ingest:pagasaheat

import { phDate, barTime } from '@ph-monitor/shared';
import { pool } from '../db.ts';
// `import type` brings in a type only; it disappears when the code runs.
import type { PagasaHour } from '../fetchers/pagasaHeat.ts';
import { DAY_ONE_TIMES, fetchPagasaFile, fetchPagasaLatest, fetchPagasaListing } from '../fetchers/pagasaHeat.ts';
import type { Fetcher } from '../fetchers/retry.ts';
import { isFreshEnough } from '../freshness.ts';
import { ensureTownCells, townMaxima } from '../pagasaCells.ts';
import type { GridInfo } from '../pagasaGrid.ts';
import { readGrid, sameGrid } from '../pagasaGrid.ts';

/** One forecast hour: each town's value (null = no data for that town). */
export type PagasaHourValues = { validAt: Date; towns: Map<number, number | null> };

const DAY_MS = 24 * 60 * 60 * 1000;

/** How many towns have a value (not null) in one hour. */
function withValue(towns: Map<number, number | null>): number {
  let count = 0;
  for (const value of towns.values()) if (value !== null) count += 1;
  return count;
}

/**
 * Saves one forecast, replacing any earlier copy of it, in one transaction.
 * Only when every hour has a value for at least 90% of `totalTowns`; otherwise
 * nothing changes. Returns whether it saved.
 */
export async function savePagasaIssuance(
  issuedOn: string,
  hours: PagasaHourValues[],
  totalTowns: number,
): Promise<boolean> {
  if (hours.length === 0) return false;
  for (const hour of hours) {
    const saved = withValue(hour.towns);
    if (!isFreshEnough(saved, totalTowns)) {
      console.warn(
        `PAGASA heat: forecast ${issuedOn} has values for only ${saved} of ${totalTowns} towns at ` +
          `${hour.validAt.toISOString()}; not saved.`,
      );
      return false;
    }
  }

  // One entry per town and hour, ready for one INSERT.
  const psgcs: number[] = [];
  const validAts: Date[] = [];
  const values: (number | null)[] = [];
  for (const hour of hours) {
    for (const [psgc, value] of hour.towns) {
      psgcs.push(psgc);
      validAts.push(hour.validAt);
      values.push(value);
    }
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM pagasa_heat WHERE issued_on = $1', [issuedOn]);
    // `unnest` turns the lists into rows, one row per position.
    await client.query(
      `INSERT INTO pagasa_heat (issued_on, psgc, valid_at, heat_index_c)
       SELECT $1, * FROM unnest($2::bigint[], $3::timestamptz[], $4::real[])`,
      [issuedOn, psgcs, validAts, values],
    );
    await client.query(
      `INSERT INTO heat_runs (model, last_ok_at, last_saved, last_total) VALUES ('pagasa', now(), $1, $2)
       ON CONFLICT (model) DO UPDATE SET
         last_ok_at = EXCLUDED.last_ok_at,
         last_saved = EXCLUDED.last_saved,
         last_total = EXCLUDED.last_total`,
      // `!` tells TypeScript the first hour is there (checked above).
      [withValue(hours[0]!.towns), totalTowns],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return true;
}

/** Deletes forecasts issued before yesterday (PH date). */
export async function prunePagasaIssuances(now: Date): Promise<void> {
  const yesterday = phDate(new Date(now.getTime() - DAY_MS));
  await pool.query('DELETE FROM pagasa_heat WHERE issued_on < $1::date', [yesterday]);
}

/** True when this forecast has rows saved. */
async function isSaved(issuedOn: string): Promise<boolean> {
  const result = await pool.query('SELECT 1 FROM pagasa_heat WHERE issued_on = $1 LIMIT 1', [issuedOn]);
  return (result.rowCount ?? 0) > 0;
}

/**
 * Downloads every hour of one forecast and saves it. Any failed or odd file
 * (or a grid that differs from the first) skips the whole forecast: nothing is
 * saved and the last good one stays. Files are read one at a time, so only one grid is in memory.
 */
async function fetchAndSave(issuedOn: string, hours: PagasaHour[], fetcher?: Fetcher): Promise<void> {
  try {
    const values: PagasaHourValues[] = [];
    // `let x: A | null` = x holds an A, or null until the first file is read.
    let first: GridInfo | null = null;
    let cells = new Map<number, number[]>();
    for (const hour of hours) {
      const grid = await readGrid(await fetchPagasaFile(issuedOn, hour, fetcher));
      if (first === null) {
        first = grid;
        cells = await ensureTownCells(grid);
      } else if (!sameGrid(first, grid)) {
        throw new Error(`file ${hour.date} ${hour.time} has a different grid`);
      }
      // '13:00' → 13 o'clock PH time.
      values.push({ validAt: barTime(hour.date, Number(hour.time.slice(0, 2))), towns: townMaxima(grid.values, cells) });
    }
    if (await savePagasaIssuance(issuedOn, values, cells.size)) {
      const firstHour = values[0];
      const saved = firstHour ? withValue(firstHour.towns) : 0;
      console.log(`PAGASA heat: forecast ${issuedOn} saved: ${values.length} hours, ${saved} of ${cells.size} towns.`);
    }
  } catch (error) {
    console.warn(`PAGASA heat: forecast ${issuedOn} skipped; the last good forecast stays:`, error);
  }
}

/** Marks the feed as fresh: towns with a value in the forecast's first hour, of all towns. */
async function recordFetchRun(issuedOn: string): Promise<void> {
  await pool.query(
    `INSERT INTO fetch_runs (source, last_ok_at, last_saved, last_total)
     SELECT 'pagasa-heat', now(),
       (SELECT count(*) FROM pagasa_heat
        WHERE issued_on = $1 AND heat_index_c IS NOT NULL
          AND valid_at = (SELECT min(valid_at) FROM pagasa_heat WHERE issued_on = $1)),
       (SELECT count(*) FROM places)
     ON CONFLICT (source) DO UPDATE SET
       last_ok_at = EXCLUDED.last_ok_at,
       last_saved = EXCLUDED.last_saved,
       last_total = EXCLUDED.last_total`,
    [issuedOn],
  );
}

/**
 * Saves PAGASA's newest forecast if it is new. Also today's (PH date) forecast,
 * issued yesterday, while it is still missing, so today's hours are there from the
 * first run. Throws when the newest forecast could not be saved, so the run counts as failed.
 * `fetcher` and `now` are for tests (default: the real `fetch` and the clock).
 */
export async function ingestPagasaHeat(fetcher?: Fetcher, now: Date = new Date()): Promise<void> {
  const latest = await fetchPagasaLatest(fetcher);
  const today = phDate(now);
  console.log(`PAGASA heat: newest forecast ${latest}, today ${today}.`);

  // Today's forecast has only the 8 AM to 5 PM hours of today. When today is the
  // newest forecast, the listing below has it; after it (PAGASA late), it does not exist yet.
  if (today < latest) {
    if (await isSaved(today)) console.log(`PAGASA heat: forecast ${today} already saved.`);
    else await fetchAndSave(today, DAY_ONE_TIMES.map((time) => ({ date: today, time })), fetcher);
  }

  if (await isSaved(latest)) {
    console.log(`PAGASA heat: forecast ${latest} already saved.`);
  } else {
    const listing = await fetchPagasaListing(fetcher);
    if (listing.issuedOn === latest) await fetchAndSave(latest, listing.hours, fetcher);
    else console.warn(`PAGASA heat: the file list is for ${listing.issuedOn}, not ${latest}; skipped.`);
  }

  await prunePagasaIssuances(now);

  if (!(await isSaved(latest))) throw new Error(`PAGASA heat: newest forecast ${latest} could not be saved.`);
  await recordFetchRun(latest);
}
