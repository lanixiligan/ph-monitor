// Job: fetch active tropical storms and save them with their tracks.
// JMA is the main source. JTWC is the backup: it is used when JMA fails, and
// for any storm JMA does not give us (not listed, or a file we could not read).
// Run by hand with: npm run ingest:storms

import { pool } from '../db.ts';
import { fetchJmaStorms } from '../fetchers/jma.ts';
import { fetchJtwcStorms } from '../fetchers/jtwc.ts';
import type { StormRecord } from '../fetchers/stormRecord.ts';

type Fetched = { storms: StormRecord[]; skipped: number };

/**
 * Which storms to save. JMA's are kept as they are. A JTWC storm is added
 * when JMA does not give us one with the same name: JMA failed, does not
 * list it, or sent a file we could not read. (Both agencies use the same
 * international names.) Returns null when both sources failed.
 */
export function chooseStorms(jma: Fetched | null, jtwc: Fetched | null): StormRecord[] | null {
  if (!jma && !jtwc) return null;
  const jmaStorms = jma?.storms ?? [];
  const jmaNames = new Set(jmaStorms.map((storm) => storm.name.toUpperCase()));
  const extra = (jtwc?.storms ?? []).filter((storm) => !jmaNames.has(storm.name.toUpperCase()));
  return [...jmaStorms, ...extra];
}

export async function ingestStorms(): Promise<void> {
  // Which sources worked. chooseStorms() picks what to save.
  let jma: Fetched | null = null;
  let jtwc: Fetched | null = null;

  try {
    jma = await fetchJmaStorms();
  } catch (error) {
    console.warn('Storms: JMA failed, falling back to JTWC:', error);
  }

  try {
    jtwc = await fetchJtwcStorms();
  } catch (error) {
    // Only a problem if JMA also failed (checked below).
    console.warn('Storms: JTWC failed:', error);
  }

  const storms = chooseStorms(jma, jtwc);
  if (!storms) {
    throw new Error('Storms: both JMA and JTWC failed, nothing saved');
  }
  const source = jma ? (storms.some((storm) => storm.source === 'jtwc') ? 'jma + jtwc' : 'jma') : 'jtwc';
  for (const storm of storms) {
    if (jma && storm.source === 'jtwc') {
      console.warn(`Storms: ${storm.name} (${storm.id}) is not in JMA's data; using JTWC's.`);
    }
  }
  const savedIds = storms.map((storm) => storm.id);
  const jmaNames = (jma?.storms ?? []).map((storm) => storm.name.toUpperCase());

  // Borrow one connection so all the changes below happen in one transaction.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const storm of storms) {
      await client.query(
        `INSERT INTO storms (id, source, name, category, is_active, url, raw, updated_at, fetched_at)
         VALUES ($1, $2, $3, $4, true, $5, $6, $7, now())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           is_active = true,
           url = EXCLUDED.url,
           raw = EXCLUDED.raw,
           updated_at = EXCLUDED.updated_at,
           fetched_at = EXCLUDED.fetched_at`,
        [storm.id, storm.source, storm.name, storm.category, storm.url, JSON.stringify(storm.raw), storm.updatedAt],
      );

      // Replace the whole track: the source re-draws it with every advisory.
      await client.query('DELETE FROM storm_track_points WHERE storm_id = $1', [storm.id]);
      for (const point of storm.track) {
        await client.query(
          `INSERT INTO storm_track_points
             (storm_id, valid_at, is_forecast, geom, pressure_hpa, wind_kt, radius_km)
           VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8)`,
          [storm.id, point.validAt, point.isForecast, point.lon, point.lat, point.pressureHpa, point.windKt, point.radiusKm],
        );
      }
    }

    // Storms that a working source no longer gives us are over: keep them,
    // but mark them inactive. `<> ALL($2)` means "not equal to any id in the list".
    // A source that failed this time keeps its storms (we simply don't know).
    // Rows with source 'sample' are never touched (the source must match).
    const worked = [jma ? 'jma' : null, jtwc ? 'jtwc' : null].filter((name) => name !== null);
    const ended = await client.query(
      `UPDATE storms SET is_active = false
       WHERE source = ANY($1::text[]) AND is_active AND id <> ALL($2::text[])`,
      [worked, savedIds],
    );

    // JTWC rows saved during an earlier JMA outage, now covered by JMA's own data.
    const superseded = await client.query(
      `UPDATE storms SET is_active = false
       WHERE source = 'jtwc' AND is_active AND upper(name) = ANY($1::text[])`,
      [jmaNames],
    );

    // Remember which fetches worked, even if they found no storms.
    for (const name of worked) {
      await client.query(
        `INSERT INTO fetch_runs (source, last_ok_at) VALUES ($1, now())
         ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
        [name],
      );
    }

    await client.query('COMMIT');

    const points = storms.reduce((total, storm) => total + storm.track.length, 0);
    const skipped = (jma?.skipped ?? 0) + (jtwc?.skipped ?? 0);
    console.log(
      `Storms (${source}): saved ${storms.length} (${points} track points), skipped ${skipped}, ` +
        `marked over ${(ended.rowCount ?? 0) + (superseded.rowCount ?? 0)}.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
