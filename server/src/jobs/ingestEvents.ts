// Job: fetch disaster events from GDACS and NASA EONET and save them.
// One source failing does not stop the other. Run by hand with: npm run ingest:events

import { pool } from '../db.ts';
import { fetchEonetEvents } from '../fetchers/eonet.ts';
import { droppedEventIds } from '../fetchers/eventRecord.ts';
import type { EventRecord } from '../fetchers/eventRecord.ts';
import { fetchGdacsEvents } from '../fetchers/gdacs.ts';

// Old-row rule: an event that ended more than this many days ago is not saved,
// and is deleted if we already have it. Events still going (no end date) are
// always kept, so a long drought stays until GDACS closes it.
const KEEP_DAYS = 30;

/**
 * Saves one source's events and notes the success, all in one transaction.
 * `closeDropped`: also close this source's open events that the feed no
 * longer lists (only safe when the feed was the full list).
 */
async function saveEvents(
  source: 'gdacs' | 'eonet',
  events: EventRecord[],
  closeDropped: boolean,
): Promise<{ saved: number; closed: number }> {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000);
  const fresh = events.filter((e) => e.endedAt === null || e.endedAt >= cutoff);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const e of fresh) {
      // ON CONFLICT: if we already have this id, update it (alerts get raised,
      // events get closed). ST_GeomFromGeoJSON reads the shape from JSON text.
      await client.query(
        `INSERT INTO events
           (id, source, kind, alert_level, title, started_at, ended_at, url, geom, raw, fetched_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
                 ST_SetSRID(ST_GeomFromGeoJSON($9), 4326), $10, now())
         ON CONFLICT (id) DO UPDATE SET
           kind = EXCLUDED.kind,
           alert_level = EXCLUDED.alert_level,
           title = EXCLUDED.title,
           started_at = EXCLUDED.started_at,
           ended_at = EXCLUDED.ended_at,
           url = EXCLUDED.url,
           geom = EXCLUDED.geom,
           raw = EXCLUDED.raw,
           fetched_at = EXCLUDED.fetched_at`,
        [
          e.id,
          e.source,
          e.kind,
          e.alertLevel,
          e.title,
          e.startedAt,
          e.endedAt,
          e.url,
          JSON.stringify(e.geometry),
          JSON.stringify(e.raw),
        ],
      );
    }
    // An open event (no end date) that left the feed would otherwise stay
    // "ongoing" for ever. Its end is set to the last time we saw it.
    let closed = 0;
    if (closeDropped) {
      const open = await client.query<{ id: string }>(
        'SELECT id FROM events WHERE source = $1 AND ended_at IS NULL',
        [source],
      );
      const dropped = droppedEventIds(
        open.rows.map((row) => row.id),
        events.map((e) => e.id),
      );
      if (dropped.length > 0) {
        // `= ANY($1)` means "is one of the ids in this list".
        const result = await client.query(
          'UPDATE events SET ended_at = fetched_at WHERE id = ANY($1::text[])',
          [dropped],
        );
        closed = result.rowCount ?? 0;
      }
    }

    await client.query(
      `INSERT INTO fetch_runs (source, last_ok_at) VALUES ($1, now())
       ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
      [source],
    );
    await client.query('COMMIT');
    return { saved: fresh.length, closed };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestEvents(): Promise<void> {
  const problems: string[] = [];
  const parts: string[] = [];

  try {
    const gdacs = await fetchGdacsEvents();
    // The RSS backup only carries the newest items worldwide, so a missing
    // event proves nothing there; only the API's full list closes events.
    const { saved, closed } = await saveEvents('gdacs', gdacs.events, gdacs.via === 'api');
    parts.push(`GDACS (${gdacs.via}) saved ${saved}, skipped ${gdacs.skipped}, closed ${closed}`);
  } catch (error) {
    problems.push(`GDACS: ${String(error)}`);
  }

  try {
    const eonet = await fetchEonetEvents();
    const { saved, closed } = await saveEvents('eonet', eonet.events, true);
    parts.push(`EONET saved ${saved}, skipped ${eonet.skipped}, left to GDACS ${eonet.fromGdacs}, closed ${closed}`);
  } catch (error) {
    problems.push(`EONET: ${String(error)}`);
  }

  // Only fail when nothing worked at all.
  for (const problem of problems) console.warn(`Events: ${problem}`);
  if (parts.length === 0) throw new Error(`Events: both sources failed. ${problems.join(' | ')}`);

  // Delete events that ended too long ago (see KEEP_DAYS above).
  const removed = await pool.query(
    `DELETE FROM events WHERE ended_at < now() - make_interval(days => $1)`,
    [KEEP_DAYS],
  );
  console.log(`Events: ${parts.join('; ')}; removed ${removed.rowCount ?? 0} old.`);
}
