-- All database tables for PH Monitor.
-- Applied by `npm run migrate`. Safe to run again: every statement uses
-- IF NOT EXISTS, so existing tables and their data are left alone.

-- PostGIS adds the `geometry` column type and the map functions (ST_...).
CREATE EXTENSION IF NOT EXISTS postgis;

-- 4326 below is the code for plain latitude/longitude (WGS84), as used by GPS.

CREATE TABLE IF NOT EXISTS provinces (
  psgc          BIGINT PRIMARY KEY,            -- official place code (adm2_psgc)
  name          TEXT NOT NULL,
  region_psgc   BIGINT NOT NULL,
  geo_level     TEXT NOT NULL,                 -- 'Prov' or 'Dist'
  geom          geometry(MultiPolygon, 4326) NOT NULL,  -- the province's shape
  weather_point geometry(Point, 4326) NOT NULL          -- where we sample weather
);
-- A GIST index makes "which province is near this point?" fast.
CREATE INDEX IF NOT EXISTS provinces_geom_idx ON provinces USING GIST (geom);

CREATE TABLE IF NOT EXISTS earthquakes (
  id             TEXT PRIMARY KEY,             -- USGS event id
  magnitude      REAL NOT NULL,
  depth_km       REAL,
  place          TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL,
  url            TEXT,
  geom           geometry(Point, 4326) NOT NULL,  -- the epicentre
  epicenter_psgc BIGINT REFERENCES provinces,  -- NULL when offshore
  raw            JSONB NOT NULL,               -- original USGS record
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS earthquakes_time_idx ON earthquakes (occurred_at);

-- Which provinces each quake affects.
CREATE TABLE IF NOT EXISTS earthquake_provinces (
  earthquake_id TEXT   REFERENCES earthquakes ON DELETE CASCADE,
  province_psgc BIGINT REFERENCES provinces,
  distance_km   REAL NOT NULL,                 -- to the province boundary; 0 if inside
  PRIMARY KEY (earthquake_id, province_psgc)
);

CREATE TABLE IF NOT EXISTS weather_readings (
  province_psgc   BIGINT REFERENCES provinces,
  valid_at        TIMESTAMPTZ NOT NULL,        -- time the modelled value is valid for
  temp_c          REAL,
  apparent_temp_c REAL,                        -- "feels like"
  rain_1h_mm      REAL,
  rain_24h_mm     REAL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (province_psgc, valid_at)
);

-- The latest score for each province (one row per province).
CREATE TABLE IF NOT EXISTS province_scores (
  province_psgc BIGINT PRIMARY KEY REFERENCES provinces,
  score         SMALLINT NOT NULL,             -- 0 to 100
  quake_score   SMALLINT NOT NULL,
  weather_score SMALLINT NOT NULL,
  reasons       JSONB NOT NULL,                -- short human-readable list
  computed_at   TIMESTAMPTZ NOT NULL
);

-- Every past score (one row per province per recompute).
CREATE TABLE IF NOT EXISTS province_score_history (
  province_psgc BIGINT REFERENCES provinces,
  score         SMALLINT NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (province_psgc, computed_at)
);

-- When each feed last succeeded. Used to tell "no quakes lately" apart from
-- "the earthquake fetch has been failing".
CREATE TABLE IF NOT EXISTS fetch_runs (
  source      TEXT PRIMARY KEY,                -- 'usgs' or 'open-meteo'
  last_ok_at  TIMESTAMPTZ NOT NULL
);
