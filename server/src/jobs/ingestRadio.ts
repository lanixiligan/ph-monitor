// Job: download the Philippine radio station list from Radio Browser and save it.
// Runs once a day (due.ts). Run by hand with: npm run ingest:radio
// Display only: radio never changes the score.

import { pool } from '../db.ts';
import { fetchRadioStations } from '../fetchers/radioBrowser.ts';
import type { RadioRecord } from '../fetchers/radioBrowser.ts';
import { RADIO_NEWS } from '../sources.ts';

/** A list shorter than this is treated as a broken answer and changes nothing. */
export const MIN_STATIONS = 100;

/**
 * Saves the list in one transaction: new and changed stations are written,
 * stations no longer listed are deleted. Our own check results are kept,
 * unless the stream address changed (then the new address starts unchecked).
 */
export async function saveRadioStations(stations: RadioRecord[]): Promise<{ saved: number; removed: number }> {
  if (stations.length < MIN_STATIONS) {
    throw new Error(`Radio Browser: only ${stations.length} stations, keeping the old list`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const s of stations) {
      await client.query(
        `INSERT INTO radio_stations (id, name, state, tags, codec, bitrate, url, homepage, votes, seen_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, state = EXCLUDED.state, tags = EXCLUDED.tags,
           codec = EXCLUDED.codec, bitrate = EXCLUDED.bitrate, homepage = EXCLUDED.homepage,
           votes = EXCLUDED.votes, seen_at = EXCLUDED.seen_at,
           -- A new stream address: forget the checks of the old one.
           last_checked_at = CASE WHEN radio_stations.url = EXCLUDED.url THEN radio_stations.last_checked_at END,
           last_ok_at      = CASE WHEN radio_stations.url = EXCLUDED.url THEN radio_stations.last_ok_at END,
           failing_since   = CASE WHEN radio_stations.url = EXCLUDED.url THEN radio_stations.failing_since END,
           check_note      = CASE WHEN radio_stations.url = EXCLUDED.url THEN radio_stations.check_note END,
           url = EXCLUDED.url`,
        [s.id, s.name, s.state, s.tags, s.codec, s.bitrate, s.url, s.homepage, s.votes],
      );
    }
    // `<> ALL($1)` means "is none of the ids in this list".
    const removed = await client.query('DELETE FROM radio_stations WHERE id <> ALL($1::text[])', [
      stations.map((s) => s.id),
    ]);
    await client.query(
      `INSERT INTO fetch_runs (source, last_ok_at) VALUES ('radio-browser', now())
       ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
    );
    await client.query('COMMIT');
    return { saved: stations.length, removed: removed.rowCount ?? 0 };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestRadio(): Promise<void> {
  // Curated stations win when they share a stream with another entry.
  const result = await fetchRadioStations({ preferIds: RADIO_NEWS.map((station) => station.stationId) });
  const { saved, removed } = await saveRadioStations(result.stations);
  console.log(
    `Radio: saved ${saved} stations, removed ${removed} (${result.hls} HLS and ` +
      `${result.duplicates} duplicate streams left out, ${result.skipped} bad records).`,
  );
}
