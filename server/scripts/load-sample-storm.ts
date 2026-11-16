// Loads a made-up SAMPLE storm so you can see a track on the map when no real
// storm is active. Run with:   npx tsx scripts/load-sample-storm.ts
// Remove it again with:        npx tsx scripts/load-sample-storm.ts remove
// It is saved with source 'sample', so the real storm job never touches it.

import { readFileSync } from 'node:fs';
import { pool } from '../src/db.ts';
import { parseJmaStorms } from '../src/fetchers/jma.ts';

const SAMPLE_ID = 'sample:storm';
const FIXTURE = new URL('../test/fixtures/storms/jma-sample/', import.meta.url);

// `unknown` because the file's shape is checked by the parser, not by us.
const readJson = (name: string): unknown => JSON.parse(readFileSync(new URL(name, FIXTURE), 'utf8'));

async function load(): Promise<void> {
  // Same parser as the real JMA data, so the sample proves the format works.
  const { storms } = parseJmaStorms(readJson('targetTc.json'), {
    TC9901: { forecast: readJson('forecast.json'), specifications: readJson('specifications.json') },
  });
  const storm = storms[0];
  if (!storm) throw new Error('The sample storm did not pass the checks');

  // The sample is dated 2026-11-16 21:00 Japan time. Move every time so that
  // the "now" point is the current hour, and the track looks live.
  // The track is sorted oldest first, so the last non-forecast point is "now".
  const sampleNow = storm.track.filter((point) => !point.isForecast).at(-1);
  if (!sampleNow) throw new Error('The sample storm has no "now" point');
  const currentHour = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
  const shiftMs = currentHour.getTime() - sampleNow.validAt.getTime();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO storms (id, source, name, category, is_active, url, raw, updated_at, fetched_at)
       VALUES ($1, 'sample', $2, $3, true, NULL, $4, $5, now())
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, category = EXCLUDED.category, is_active = true,
         raw = EXCLUDED.raw, updated_at = EXCLUDED.updated_at, fetched_at = EXCLUDED.fetched_at`,
      [
        SAMPLE_ID,
        'SAMPLE (not a real storm)',
        storm.category,
        JSON.stringify({ note: 'Made-up sample storm for testing the map. Not real data.' }),
        currentHour,
      ],
    );
    await client.query('DELETE FROM storm_track_points WHERE storm_id = $1', [SAMPLE_ID]);
    for (const point of storm.track) {
      await client.query(
        `INSERT INTO storm_track_points
           (storm_id, valid_at, is_forecast, geom, pressure_hpa, wind_kt, radius_km)
         VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6, $7, $8)`,
        [
          SAMPLE_ID,
          new Date(point.validAt.getTime() + shiftMs),
          point.isForecast,
          point.lon,
          point.lat,
          point.pressureHpa,
          point.windKt,
          point.radiusKm,
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  console.log(`Sample storm loaded: ${storm.track.length} track points. Remove it with "remove".`);
}

async function remove(): Promise<void> {
  // The track points go too (ON DELETE CASCADE in schema.sql).
  const result = await pool.query("DELETE FROM storms WHERE id = $1 AND source = 'sample'", [SAMPLE_ID]);
  console.log(`Sample storm removed (${result.rowCount ?? 0} row).`);
}

try {
  // `process.argv[2]` is the first word typed after the script name.
  if (process.argv[2] === 'remove') await remove();
  else await load();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
