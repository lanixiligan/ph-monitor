// Shared set-up for the database tests (npm run test:db).
//
// These tests run the real SQL against a real PostGIS database, but never
// against your data: they use a separate database on the same server, named
// after the one in .env with "_test" added (phmonitor → phmonitor_test).
// It is created here if missing, then emptied and seeded before each file.
//
// IMPORT THIS FILE FIRST in a test file.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
// Must stay above the import of src/db.ts: it sets the test database's address.
import { mainUrl, root, testName } from './testEnv.ts';
import { pool } from '../../src/db.ts';

export { pool };

// ---------- The seeded map: three square provinces and one city ----------
//
//   Alpha    lon 121–122, lat 14–15   (Alpha City: 121.4–121.6, 14.4–14.6)
//   Bravo    lon 124–125, lat 10–11
//   Charlie  lon 125–126, lat 7–8

export const ALPHA = 101;
export const BRAVO = 102;
export const CHARLIE = 103;
export const ALPHA_CITY = 10101;
/** A spot inside Alpha City. */
export const SPOT = { lat: 14.5, lon: 121.5 };

const now = () => Date.now();
export const minutesAgo = (minutes: number) => new Date(now() - minutes * 60 * 1000);
export const hoursAgo = (hours: number) => minutesAgo(hours * 60);
export const hoursAhead = (hours: number) => minutesAgo(-hours * 60);

/** SQL for a square, given its west, south, east and north edges. */
function square(west: number, south: number, east: number, north: number): string {
  return `ST_Multi(ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326))`;
}

/** Applies the schema, empties every table and seeds the map. Call at the top of each test file. */
export async function resetDb(): Promise<void> {
  // Create the test database on the first run. Connected to the main
  // database only for this one command; nothing in it is read or changed.
  const admin = new pg.Client({ connectionString: mainUrl });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [testName]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${testName}"`);
  await admin.end();

  // A last check: never empty a database that is not the test one.
  const name = await pool.query<{ name: string }>('SELECT current_database() AS name');
  if (!name.rows[0]?.name.endsWith('_test')) throw new Error('Refusing to reset a non-test database.');

  await pool.query(await readFile(path.join(root, 'server/db/schema.sql'), 'utf8'));

  const tables = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys'`,
  );
  const names = tables.rows.map((row) => `"${row.tablename}"`).join(', ');
  // CASCADE also empties tables that point at these; RESTART IDENTITY resets the counters.
  await pool.query(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);

  await pool.query(
    `INSERT INTO provinces (psgc, name, region_psgc, geo_level, geom, weather_point) VALUES
       (${ALPHA}, 'Alpha', 1, 'Prov', ${square(121, 14, 122, 15)}, ST_SetSRID(ST_MakePoint(121.5, 14.5), 4326)),
       (${BRAVO}, 'Bravo', 1, 'Prov', ${square(124, 10, 125, 11)}, ST_SetSRID(ST_MakePoint(124.5, 10.5), 4326)),
       (${CHARLIE}, 'Charlie', 2, 'Prov', ${square(125, 7, 126, 8)}, ST_SetSRID(ST_MakePoint(125.5, 7.5), 4326))`,
  );
  await pool.query(
    `INSERT INTO places (psgc, name, province_psgc, geo_level, geom) VALUES
       (${ALPHA_CITY}, 'Alpha City', ${ALPHA}, 'City', ${square(121.4, 14.4, 121.6, 14.6)})`,
  );
}

// ---------- Small helpers to add rows ----------

/** Marks feeds as fetched `minutes` ago (default: every feed, just now). */
export async function setFeedRuns(minutes = 1, sources?: string[]): Promise<void> {
  const all = [
    'usgs', 'open-meteo', 'pagasa', 'gdacs', 'eonet', 'jma', 'jtwc', 'open-meteo-daily', 'open-meteo-flood', 'news',
    'open-meteo-heat', 'open-meteo-rain', 'pagasa-heat', 'radio-browser', 'radio-check',
  ];
  for (const source of sources ?? all) {
    await pool.query(
      `INSERT INTO fetch_runs (source, last_ok_at) VALUES ($1, $2)
       ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
      [source, minutesAgo(minutes)],
    );
  }
}

/** Adds a quake and links it to the provinces in reach, the way the earthquake job does. */
export async function addQuake(
  id: string,
  quake: { lat: number; lon: number; magnitude: number; occurredAt: Date; reachKm: number },
): Promise<void> {
  await pool.query(
    `INSERT INTO earthquakes (id, magnitude, depth_km, place, occurred_at, url, geom, raw)
     VALUES ($1, $2, 10, 'test quake', $3, NULL, ST_SetSRID(ST_MakePoint($4, $5), 4326), '{}')`,
    [id, quake.magnitude, quake.occurredAt, quake.lon, quake.lat],
  );
  await pool.query(
    `INSERT INTO earthquake_provinces (earthquake_id, province_psgc, distance_km)
     SELECT q.id, p.psgc, ST_Distance(p.geom::geography, q.geom::geography) / 1000
     FROM earthquakes q, provinces p
     WHERE q.id = $1 AND ST_DWithin(p.geom::geography, q.geom::geography, $2)`,
    [id, quake.reachKm * 1000],
  );
}

export async function addWeather(
  psgc: number,
  reading: { validAt: Date; rain1hMm: number; rain24hMm: number; heatIndexC?: number },
): Promise<void> {
  await pool.query(
    `INSERT INTO weather_readings (province_psgc, valid_at, temp_c, humidity_pct, heat_index_c, rain_1h_mm, rain_24h_mm)
     VALUES ($1, $2, 26, 70, $3, $4, $5)`,
    [psgc, reading.validAt, reading.heatIndexC ?? 26, reading.rain1hMm, reading.rain24hMm],
  );
}

/**
 * Gives a town a weather point (inside it) with one reading, the way the
 * weather job and `npm run weather-points` do.
 */
export async function addTownWeather(
  placePsgc: number,
  reading: { validAt: Date; rain1hMm: number; rain24hMm: number },
): Promise<void> {
  const point = await pool.query<{ id: number }>(
    `INSERT INTO weather_points (kind, geom)
     SELECT 'grid', ST_PointOnSurface(geom) FROM places WHERE psgc = $1 RETURNING id`,
    [placePsgc],
  );
  const id = point.rows[0]?.id;
  await pool.query('INSERT INTO place_weather_points (place_psgc, point_id) VALUES ($1, $2)', [placePsgc, id]);
  await pool.query(
    `INSERT INTO point_readings (point_id, valid_at, temp_c, humidity_pct, heat_index_c, rain_1h_mm, rain_24h_mm)
     VALUES ($1, $2, 26, 70, 26, $3, $4)`,
    [id, reading.validAt, reading.rain1hMm, reading.rain24hMm],
  );
}

export async function addEvent(
  id: string,
  event: {
    lat: number;
    lon: number;
    kind?: string;
    alertLevel?: 'green' | 'orange' | 'red' | null;
    startedAt?: Date;
    endedAt?: Date | null;
    fetchedAt?: Date;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO events (id, source, kind, alert_level, title, started_at, ended_at, url, geom, raw, fetched_at)
     VALUES ($1, 'gdacs', $2, $3, $1, $4, $5, NULL, ST_SetSRID(ST_MakePoint($6, $7), 4326), '{}', $8)`,
    [
      id,
      event.kind ?? 'typhoon',
      event.alertLevel === undefined ? 'red' : event.alertLevel,
      event.startedAt ?? hoursAgo(6),
      event.endedAt ?? null,
      event.lon,
      event.lat,
      event.fetchedAt ?? minutesAgo(1),
    ],
  );
}

export async function addStorm(
  id: string,
  storm: { isActive?: boolean; track: { lat: number; lon: number; validAt: Date; isForecast: boolean }[] },
): Promise<void> {
  await pool.query(
    `INSERT INTO storms (id, source, name, category, is_active, url, raw, updated_at)
     VALUES ($1, 'jma', $1, 'TY', $2, NULL, '{}', now())`,
    [id, storm.isActive ?? true],
  );
  for (const point of storm.track) {
    await pool.query(
      `INSERT INTO storm_track_points (storm_id, valid_at, is_forecast, geom)
       VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326))`,
      [id, point.validAt, point.isForecast, point.lon, point.lat],
    );
  }
}

export async function addAlert(
  id: string,
  alert: {
    sentAt: Date;
    expiresAt: Date;
    provincePsgcs?: number[];
    isNationwide?: boolean;
    isAllClear?: boolean;
    isReplaced?: boolean;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO official_alerts
       (id, agency, event, headline, severity, description, url, sent_at, expires_at,
        is_all_clear, is_replaced, province_psgcs, is_nationwide)
     VALUES ($1, 'PAGASA', 'Rainfall Warning', $1, 'Moderate', 'test text', 'https://example.org/alert', $2, $3,
             $4, $5, $6::bigint[], $7)`,
    [
      id, alert.sentAt, alert.expiresAt, alert.isAllClear ?? false, alert.isReplaced ?? false,
      alert.provincePsgcs ?? [], alert.isNationwide ?? false,
    ],
  );
}

export async function addNews(title: string, publishedAt: Date, provincePsgcs: number[], types: string[] = []): Promise<void> {
  await pool.query(
    `INSERT INTO news (story_key, title, url, outlet, category, published_at, province_psgcs, types)
     VALUES ($1, $1, 'https://example.org/story', 'Test Outlet', 'national', $2, $3::bigint[], $4::text[])`,
    [title, publishedAt, provincePsgcs, types],
  );
}

/** Adds one hazard map piece: a square from `west`/`south` to `east`/`north`, the way the hazard loader stores it. */
export async function addHazardZone(zone: {
  kind: 'landslide' | 'stormSurge';
  surgeLevel: number; // 0 for landslide, 1 to 4 for storm surge
  hazardClass: number;
  provincePsgc: number;
  west: number;
  south: number;
  east: number;
  north: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO hazard_zones (kind, surge_level, hazard_class, province_psgc, geom)
     VALUES ($1, $2, $3, $4, ST_MakeEnvelope($5, $6, $7, $8, 4326))`,
    [zone.kind, zone.surgeLevel, zone.hazardClass, zone.provincePsgc, zone.west, zone.south, zone.east, zone.north],
  );
}

/** Marks one province's hazard map file as loaded (for one kind and surge level). */
export async function addHazardCoverage(coverage: {
  kind: 'landslide' | 'stormSurge';
  surgeLevel: number;
  provincePsgc: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO hazard_coverage (kind, surge_level, province_psgc, source_file, sha256, zone_count)
     VALUES ($1, $2, $3, 'test.zip', 'test-hash', 1)`,
    [coverage.kind, coverage.surgeLevel, coverage.provincePsgc],
  );
}
