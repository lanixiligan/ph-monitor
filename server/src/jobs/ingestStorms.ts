// Job: fetch active tropical storms and save them with their tracks.
// JMA is the main source. JTWC is the backup: it is used only when JMA fails,
// and otherwise just looked at, to log storms JMA does not list.
// There is no npm script yet; see the report for how to run it by hand.

import { pool } from '../db.ts';
import { fetchJmaStorms } from '../fetchers/jma.ts';
import { fetchJtwcStorms } from '../fetchers/jtwc.ts';
import type { StormRecord } from '../fetchers/stormRecord.ts';

type Fetched = { storms: StormRecord[]; skipped: number };

export async function ingestStorms(): Promise<void> {
  // Which sources worked. The storms to save come from `main`.
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

  const main = jma ?? jtwc;
  if (!main) {
    throw new Error('Storms: both JMA and JTWC failed, nothing saved');
  }
  const source = jma ? 'jma' : 'jtwc';

  // When JMA works, JTWC storms are only noticed, never saved twice.
  // A storm is "the same" if the names match (both agencies use WMO names).
  if (jma && jtwc) {
    const jmaNames = new Set(jma.storms.map((storm) => storm.name.toUpperCase()));
    for (const storm of jtwc.storms) {
      if (!jmaNames.has(storm.name.toUpperCase())) {
        console.warn(`Storms: JTWC lists ${storm.name} (${storm.id}) but JMA does not.`);
      }
    }
  }

  // Borrow one connection so all the changes below happen in one transaction.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const storm of main.storms) {
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

    // Storms of this source that the feed no longer lists are over: keep them,
    // but mark them inactive. `<> ALL($2)` means "not equal to any id in the list".
    // Rows with source 'sample' are never touched (the source must match).
    const ended = await client.query(
      `UPDATE storms SET is_active = false
       WHERE source = $1 AND is_active AND id <> ALL($2::text[])`,
      [source, main.storms.map((storm) => storm.id)],
    );

    // JTWC rows saved during an earlier JMA outage are replaced by JMA's data.
    let superseded = 0;
    if (source === 'jma') {
      const result = await client.query(
        "UPDATE storms SET is_active = false WHERE source = 'jtwc' AND is_active",
      );
      superseded = result.rowCount ?? 0;
    }

    // Remember which fetches worked, even if they found no storms.
    for (const worked of [
      { name: 'jma', ok: jma !== null },
      { name: 'jtwc', ok: jtwc !== null },
    ]) {
      if (!worked.ok) continue;
      await client.query(
        `INSERT INTO fetch_runs (source, last_ok_at) VALUES ($1, now())
         ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
        [worked.name],
      );
    }

    await client.query('COMMIT');

    const points = main.storms.reduce((total, storm) => total + storm.track.length, 0);
    console.log(
      `Storms (${source}): saved ${main.storms.length} (${points} track points), skipped ${main.skipped}, ` +
        `marked over ${(ended.rowCount ?? 0) + superseded}.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
