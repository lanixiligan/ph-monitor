// Job: fetch official alerts from PAGASA's public alert feed and save them.
// Run by hand with: npm run ingest:alerts
//
// The feed lists the latest alerts; each one has its own file. A file is
// downloaded only once (an alert never changes: a newer alert replaces it).

import { pool } from '../db.ts';
import { fetchPagasaAlert, fetchPagasaFeed, NO_EXPIRY_HOURS, provincesForAreas } from '../fetchers/pagasa.ts';

// Old-row rule: an alert that expired more than this many days ago is deleted.
const KEEP_DAYS = 7;
// At most this many alert files are downloaded in one run, a little apart, to be polite.
const MAX_DOWNLOADS = 30;
const PAUSE_MS = 500;
const HOUR_MS = 60 * 60 * 1000;

export async function ingestAlerts(): Promise<void> {
  const { entries, skipped: badEntries } = await fetchPagasaFeed();

  const provinces = await pool.query<{ psgc: number; name: string }>('SELECT psgc, name FROM provinces');
  const saved = await pool.query<{ id: string }>('SELECT id FROM official_alerts');
  const have = new Set(saved.rows.map((row) => row.id));
  const fresh = entries.filter((entry) => !have.has(entry.id)).slice(0, MAX_DOWNLOADS);

  let added = 0;
  let failed = 0;
  for (const entry of fresh) {
    try {
      const alert = await fetchPagasaAlert(entry);
      if (!alert) {
        failed += 1;
        continue;
      }
      const { psgcs, isNationwide } = provincesForAreas(alert.areas, provinces.rows);
      // No end time in the file: believe the alert for a day after it was sent.
      const expiresAt = alert.expiresAt ?? new Date(alert.sentAt.getTime() + NO_EXPIRY_HOURS * HOUR_MS);

      await pool.query(
        `INSERT INTO official_alerts
           (id, agency, event, headline, severity, description, instruction, web, url, sent_at, expires_at,
            is_all_clear, replaces, area_names, province_psgcs, is_nationwide)
         VALUES ($1, 'PAGASA', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::text[], $13::text[], $14::bigint[], $15)
         ON CONFLICT (id) DO NOTHING`,
        [
          alert.id, alert.event, alert.headline, alert.severity, alert.description, alert.instruction,
          alert.web, entry.capUrl, alert.sentAt, expiresAt, alert.isAllClear, alert.replaces,
          alert.areas.map((area) => area.name), psgcs, isNationwide,
        ],
      );
      added += 1;
    } catch (error) {
      // Not saved, so the next run tries this alert again.
      failed += 1;
      console.warn(`Alerts: "${entry.title}" could not be read: ${error instanceof Error ? error.message : String(error)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, PAUSE_MS));
  }

  // An alert named in a newer alert's `replaces` list is no longer in effect.
  // `= ANY(list)` means "is one of the ids in this list".
  const replaced = await pool.query(
    `UPDATE official_alerts old SET is_replaced = true
     WHERE NOT old.is_replaced
       AND EXISTS (SELECT 1 FROM official_alerts newer WHERE old.id = ANY(newer.replaces))`,
  );

  const removed = await pool.query(
    `DELETE FROM official_alerts WHERE expires_at < now() - make_interval(days => $1)`,
    [KEEP_DAYS],
  );

  // The feed answered, so the list of alerts is up to date even if one file failed.
  await pool.query(
    `INSERT INTO fetch_runs (source, last_ok_at) VALUES ('pagasa', now())
     ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
  );

  console.log(
    `Alerts: feed lists ${entries.length} (skipped ${badEntries}); new ${added}, failed ${failed}, ` +
      `marked replaced ${replaced.rowCount ?? 0}, removed old ${removed.rowCount ?? 0}.`,
  );
}
