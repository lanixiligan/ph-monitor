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
  geo_level     TEXT NOT NULL,                 -- 'Prov', 'Dist' or 'Other'
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
  humidity_pct    REAL,                        -- relative humidity, 0 to 100
  heat_index_c    REAL,                        -- "feels like", computed by us (see heatIndex.ts)
  rain_1h_mm      REAL,
  rain_24h_mm     REAL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (province_psgc, valid_at)
);
-- For databases created before the heat index change: swap the old
-- "feels like" column for the two new ones. Does nothing on a fresh database.
ALTER TABLE weather_readings DROP COLUMN IF EXISTS apparent_temp_c;
ALTER TABLE weather_readings ADD COLUMN IF NOT EXISTS humidity_pct REAL;
ALTER TABLE weather_readings ADD COLUMN IF NOT EXISTS heat_index_c REAL;

-- The latest score for each province (one row per province).
CREATE TABLE IF NOT EXISTS province_scores (
  province_psgc BIGINT PRIMARY KEY REFERENCES provinces,
  score         SMALLINT NOT NULL,             -- 0 to 100
  quake_score   SMALLINT NOT NULL,
  weather_score SMALLINT NOT NULL,
  reasons       JSONB NOT NULL,                -- short human-readable list
  computed_at   TIMESTAMPTZ NOT NULL
);

-- Phase 2: the share of the score that comes from disaster event alert levels.
ALTER TABLE province_scores ADD COLUMN IF NOT EXISTS event_score SMALLINT NOT NULL DEFAULT 0;

-- Signals that could not be checked when the score was computed ('quake',
-- 'weather', 'event'). Not empty = the score is a lower limit ("at least N").
ALTER TABLE province_scores ADD COLUMN IF NOT EXISTS unknown_signals TEXT[] NOT NULL DEFAULT '{}';

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
  source      TEXT PRIMARY KEY,                -- 'usgs', 'open-meteo', 'gdacs', ... (see freshness.ts)
  last_ok_at  TIMESTAMPTZ NOT NULL
);
-- How much the latest run saved, even when it was too little to count as a
-- success (weather only: provinces saved, out of how many).
ALTER TABLE fetch_runs ADD COLUMN IF NOT EXISTS last_saved INTEGER;
ALTER TABLE fetch_runs ADD COLUMN IF NOT EXISTS last_total INTEGER;

-- Cities and municipalities. Used to name the spot a reader clicks on.
-- Loaded by `npm run load-places`.
CREATE TABLE IF NOT EXISTS places (
  psgc          BIGINT PRIMARY KEY,            -- official place code (adm3_psgc)
  name          TEXT NOT NULL,
  province_psgc BIGINT NOT NULL REFERENCES provinces,
  geo_level     TEXT NOT NULL,                 -- 'City', 'Mun', ...
  geom          geometry(MultiPolygon, 4326) NOT NULL
);
CREATE INDEX IF NOT EXISTS places_geom_idx ON places USING GIST (geom);

-- ---------- Phase 2 ----------

-- Disaster events from GDACS and NASA EONET (typhoons, floods, volcanoes...).
CREATE TABLE IF NOT EXISTS events (
  id          TEXT PRIMARY KEY,                -- source + its id, e.g. 'gdacs:TC:1001234'
  source      TEXT NOT NULL,                   -- 'gdacs' or 'eonet'
  kind        TEXT NOT NULL,                   -- 'typhoon', 'earthquake', 'flood', 'volcano', 'wildfire', 'drought', 'other'
  alert_level TEXT,                            -- 'green', 'orange', 'red'; NULL when the source gives none
  title       TEXT NOT NULL,
  started_at  TIMESTAMPTZ NOT NULL,
  ended_at    TIMESTAMPTZ,                     -- NULL while the event is still going
  url         TEXT,                            -- the source's page about the event
  geom        geometry(Geometry, 4326) NOT NULL,  -- a point, or an area
  raw         JSONB NOT NULL,                  -- original record
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_geom_idx ON events USING GIST (geom);
CREATE INDEX IF NOT EXISTS events_time_idx ON events (started_at);

-- Tropical storms from JMA (main) and JTWC (backup).
CREATE TABLE IF NOT EXISTS storms (
  id          TEXT PRIMARY KEY,                -- source + its id, e.g. 'jma:TC2625'
  source      TEXT NOT NULL,                   -- 'jma', 'jtwc' or 'sample'
  name        TEXT NOT NULL,
  category    TEXT,                            -- the source's own class, e.g. 'TY'
  is_active   BOOLEAN NOT NULL,                -- false once the source stops listing it
  url         TEXT,
  raw         JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL,            -- time of the source's latest advisory
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Where a storm has been and where it is forecast to go.
CREATE TABLE IF NOT EXISTS storm_track_points (
  storm_id     TEXT REFERENCES storms ON DELETE CASCADE,
  valid_at     TIMESTAMPTZ NOT NULL,           -- time the position is (or will be) valid
  is_forecast  BOOLEAN NOT NULL,               -- false = where it was, true = where it may go
  geom         geometry(Point, 4326) NOT NULL,
  pressure_hpa REAL,                           -- central pressure
  wind_kt      REAL,                           -- strongest steady wind, in knots
  radius_km    REAL,                           -- forecast only: how uncertain the position is
  PRIMARY KEY (storm_id, valid_at, is_forecast)
);

-- The "next 7 days" outlook for each province's sample point (modelled).
CREATE TABLE IF NOT EXISTS forecast_days (
  province_psgc       BIGINT REFERENCES provinces,
  day                 DATE NOT NULL,           -- the calendar day in Philippine time
  rain_mm             REAL,                    -- total rain that day
  gust_kmh            REAL,                    -- strongest wind gust that day
  river_discharge_m3s REAL,                    -- river flow near the point (GloFAS)
  fetched_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (province_psgc, day)
);

-- Disaster headlines. One row per story: the same story from other outlets
-- is added to `other_outlets` instead of becoming a new row.
-- Headline, outlet, category, time and link only; never the article text.
CREATE TABLE IF NOT EXISTS news (
  id             BIGSERIAL PRIMARY KEY,        -- BIGSERIAL = a number the database counts up by itself
  story_key      TEXT NOT NULL UNIQUE,         -- the headline boiled down, used to spot the same story
  title          TEXT NOT NULL,
  url            TEXT NOT NULL,
  outlet         TEXT NOT NULL,
  category       TEXT NOT NULL,                -- outlet category, see server/src/sources.ts
  published_at   TIMESTAMPTZ NOT NULL,
  province_psgcs BIGINT[] NOT NULL DEFAULT '{}',   -- provinces named in the headline
  other_outlets  JSONB NOT NULL DEFAULT '[]',  -- list of { outlet, category, url }
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS news_time_idx ON news (published_at);

-- The health of every news feed and live stream link, filled by the link
-- checker (`npm run check:sources`). The links themselves live in
-- server/src/sources.ts; this table only records what the checker found.
CREATE TABLE IF NOT EXISTS sources (
  id              TEXT PRIMARY KEY,            -- same id as in sources.ts
  kind            TEXT NOT NULL,               -- 'feed' or 'stream'
  outlet          TEXT NOT NULL,
  category        TEXT NOT NULL,
  url             TEXT NOT NULL,
  status          TEXT NOT NULL,               -- 'ok', 'dead', 'not-live' or 'not-embeddable'
  is_stale        BOOLEAN NOT NULL DEFAULT false,  -- feed only: nothing new for 7 days
  video_id        TEXT,                        -- stream only: the YouTube video to embed
  note            TEXT,                        -- why it is not ok, in a few words
  last_checked_at TIMESTAMPTZ NOT NULL,
  last_ok_at      TIMESTAMPTZ
);
-- Stream only: true = seen live, false = not live, NULL = unknown (no YouTube key).
ALTER TABLE sources ADD COLUMN IF NOT EXISTS is_live BOOLEAN;
-- Stream only: the title and upload time of the video in video_id.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS video_title TEXT;
ALTER TABLE sources ADD COLUMN IF NOT EXISTS video_published_at TIMESTAMPTZ;
-- Stream only: since when every check has failed to get an answer (NULL = the
-- last check got one). After a day of this the link is marked 'dead'.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS failing_since TIMESTAMPTZ;
