// Job: fetch recent earthquakes, save them, and link each one to the
// provinces it affects. Run by hand with: npm run ingest:earthquakes

import { pool } from '../db.ts';
import { fetchUsgsQuakes } from '../fetchers/usgs.ts';
import { radiusKm, WEIGHTS } from '../scoring/scoring.ts';

// How far back to ask USGS. Longer than the scoring window, so a quake that
// USGS revises a few days later is still updated.
const FETCH_DAYS = 7;

export async function ingestEarthquakes(): Promise<void> {
  const since = new Date(Date.now() - FETCH_DAYS * 24 * 60 * 60 * 1000);
  const { quakes, skipped } = await fetchUsgsQuakes(since, WEIGHTS.quake.minMagnitude);

  // Borrow one connection so all the changes below happen in one
  // "transaction": either everything is saved, or (on error) nothing is.
  const client = await pool.connect();
  let links = 0;
  try {
    await client.query('BEGIN');

    for (const quake of quakes) {
      // Save the quake. ON CONFLICT: if we already have this id, update it
      // (USGS often revises magnitude and depth after the first report).
      // epicenter_psgc is the province the epicentre is inside, if any.
      await client.query(
        `WITH point AS (
           SELECT ST_SetSRID(ST_MakePoint($7, $8), 4326) AS geom
         )
         INSERT INTO earthquakes
           (id, magnitude, depth_km, place, occurred_at, url, geom, epicenter_psgc, raw, fetched_at)
         SELECT $1, $2, $3, $4, $5, $6, point.geom,
           (SELECT psgc FROM provinces p WHERE ST_Contains(p.geom, point.geom) LIMIT 1),
           $9, now()
         FROM point
         ON CONFLICT (id) DO UPDATE SET
           magnitude = EXCLUDED.magnitude,
           depth_km = EXCLUDED.depth_km,
           place = EXCLUDED.place,
           occurred_at = EXCLUDED.occurred_at,
           url = EXCLUDED.url,
           geom = EXCLUDED.geom,
           epicenter_psgc = EXCLUDED.epicenter_psgc,
           raw = EXCLUDED.raw,
           fetched_at = EXCLUDED.fetched_at`,
        [
          quake.id,
          quake.magnitude,
          quake.depthKm,
          quake.place,
          quake.occurredAt,
          quake.url,
          quake.lon,
          quake.lat,
          JSON.stringify(quake.raw),
        ],
      );

      // Rebuild this quake's links: every province within its radius.
      // `::geography` makes PostGIS measure on the real, round Earth and
      // answer in metres. The distance is to the province's edge (0 if the
      // epicentre is inside it).
      await client.query('DELETE FROM earthquake_provinces WHERE earthquake_id = $1', [quake.id]);
      const inserted = await client.query(
        `INSERT INTO earthquake_provinces (earthquake_id, province_psgc, distance_km)
         SELECT q.id, p.psgc, ST_Distance(p.geom::geography, q.geom::geography) / 1000
         FROM earthquakes q, provinces p
         WHERE q.id = $1
           AND ST_DWithin(p.geom::geography, q.geom::geography, $2)`,
        [quake.id, radiusKm(quake.magnitude) * 1000],
      );
      // `rowCount` can be null for some commands; `?? 0` covers that.
      links += inserted.rowCount ?? 0;
    }

    // Remember that the fetch worked, even if it found no quakes.
    await client.query(
      `INSERT INTO fetch_runs (source, last_ok_at) VALUES ('usgs', now())
       ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Give the connection back to the pool.
    client.release();
  }

  console.log(
    `Earthquakes: saved ${quakes.length}, skipped ${skipped}, linked to provinces ${links} times.`,
  );
}
