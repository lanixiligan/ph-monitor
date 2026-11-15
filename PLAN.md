# PH Monitor — Phase 1 plan

> **Historical Phase 1 plan, kept for reference.** It was written before the code and has not
> been kept up to date. Where it differs, [README.md](README.md),
> [METHODOLOGY.md](METHODOLOGY.md) and the code are correct.

## Amendments (2026-11-15, after step 1)

These override the original text below where they differ.

- **Heat index** is computed by us from temperature + relative humidity with the NWS (Rothfusz)
  formula that PAGASA uses, instead of Open-Meteo's `apparent_temperature`. We fetch
  `relative_humidity_2m` and store `humidity_pct` and `heat_index_c` (replacing
  `apparent_temp_c` / `apparentTempC`).
- **Identity**: no branding yet. "PH Monitor" is a placeholder kept in one constant
  (`shared/src/appInfo.ts`). Plain, neutral UI: no logo, no custom fonts, no colour theme beyond
  the score scale.
- **Git**: one commit per step, with Conventional Commits messages.
- **Docs**: add a short `CLAUDE.md` for future Claude sessions; keep README brief.

## After Phase 1

- **Spot scores** (the "my city" idea, first part): cities and municipalities are loaded into a
  `places` table, `GET /api/point?lat=&lon=` scores one exact spot on demand, and a map click
  opens the card for that spot. A place-name search box is the planned next step.

## Context

PH Monitor is a Philippines real-time risk dashboard. Phase 1 delivers one thing: a map of
provinces coloured by a 0–100 "stress right now" score built from earthquakes (USGS) and weather
stress (Open-Meteo), with a status card on click showing the score, the reasons and the raw events.
The project folder is empty, so everything is new. Code is TypeScript everywhere with simple
types, small files, short comments, and each step is runnable on its own.

Out of scope: news, AI briefs, typhoon tracks, hazard maps, "my city" view, user accounts.

## Verified facts (checked 2026-11-15)

- **USGS** `earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` with a PH bounding box
  (lat 4.5–21.5, lon 116–127): works, no key, public domain.
- **Open-Meteo** `api.open-meteo.com/v1/forecast`: works, no key, accepts comma-separated lists of
  coordinates. Free tier is non-commercial, ~10,000 calls/day, data CC BY 4.0 (credit required).
  Owner confirmed the project is non-commercial.
- **Boundaries**: `faeldon/philippines-json-maps` (PSGC 3Q 2026). 18 files at
  `latest/geojson/regions/medres/provdists-region-<code>.0.01.json`, ~5 MB total. Properties:
  `adm2_psgc`, `adm2_en`, `adm1_psgc`, `geo_level`. Coordinates are WGS84 (EPSG:4326).
  Repo is MIT; boundaries are CC BY 3.0 IGO (NAMRIA + PSA via OCHA COD-AB) — credit required.
  Metro Manila appears as districts, not a province.
- **Database**: PostgreSQL with PostGIS (`postgis/postgis:17-3.5`) runs in Docker on port
  **5433**, so it cannot clash with a PostgreSQL already installed on 5432.

## Decisions

- **Earthquake matching (owner's choice): radius by magnitude.** A quake affects every province
  within `radiusKm(magnitude)`; closer means stronger. Point-in-polygon (`ST_Contains`) is still
  used to label the epicentre's province when it is on land.
- **Distances** are computed with `::geography` (PostGIS's "real Earth" mode, which returns
  metres; we divide by 1000 for km) and measured from the epicentre to the province's
  **boundary**, not its centre: `ST_Distance(p.geom::geography, q.geom::geography)`. This is 0
  when the epicentre is inside the province. Matching uses `ST_DWithin` on the same geography
  values.
- **Depth weakens a quake**: deeper = less shaking at the surface. Documented in METHODOLOGY.md.
- **Weather**: one reading per province, taken at a point guaranteed to be inside it
  (`ST_PointOnSurface`). Recorded in METHODOLOGY.md as a known limitation (a large or mountainous
  province can differ a lot from its one sample point). Open-Meteo values are **modelled** (from
  weather models, not a station reading), so the time column is `valid_at` — the time the value
  is valid for — and METHODOLOGY.md says so.
- **Score history**: every recompute also appends to `province_score_history`.
- **Freshness**: the status card shows "last updated"; data older than 1 hour is marked stale.
  Earthquake freshness is the time of the last successful USGS fetch (a quiet day with no quakes
  is not stale), so the API reports `lastFetch` times alongside `computedAt`.
- **`docker-compose.yml` sets `name: ph-monitor` at the top**, so Docker names the project (and
  its database volume) from that line instead of the folder name; renaming the folder doesn't
  orphan the data.
- **Schedule**: earthquakes every 15 min, weather every 30 min (~4,200 Open-Meteo calls/day),
  scores recomputed after each fetch.
- **Combining signals**: strongest signal counts in full, the other adds a fraction, capped at
  100. Averaging would hide a severe earthquake behind calm weather. (My call — easy to change in
  the scoring file.)
- **No secrets are actually needed** (both APIs are keyless). `.env` holds the database URL and
  ports; the frontend only ever talks to our own backend.
- **TypeScript everywhere, strict mode on** (owner's choice). Backend runs in dev with `tsx`
  (runs `.ts` files directly, no separate compile step). Types stay simple: plain `type`
  definitions, no advanced generics. Each TypeScript-specific piece of syntax gets a one-line
  explanation the first time it appears.
- **zod validates feed data before it is saved.** One zod schema per feed (USGS, Open-Meteo) in
  the fetcher file. A record that doesn't match is skipped and logged, never stored. The feed's
  TypeScript type is derived from the schema (`z.infer`), so the two can't drift apart.
- **Shared types in one `shared/` folder**, used by both backend and frontend: `Province`,
  `HazardEvent`, `ProvinceScore`, plus the API response shapes. Wired up with npm workspaces
  (one root `package.json` that links the three folders) and imported as `@ph-monitor/shared`.
  It exports `.ts` source directly, so there is no build step for it.
- deck.gl is not needed for Phase 1.
- **Basemap**: OpenFreeMap (free, no key) — to be reachability-checked in step 8; fallback is a
  plain background with province shapes only.

## Folder structure

```
ph-monitor/
├── package.json               # npm workspaces: links shared, server, web
├── tsconfig.base.json         # strict TypeScript settings all three extend
├── docker-compose.yml         # the PostGIS database
├── .env.example               # copy to .env (which is git-ignored)
├── .gitignore
├── README.md                  # how to run, data credits
├── METHODOLOGY.md             # how the score is calculated
├── shared/
│   ├── package.json           # name: @ph-monitor/shared
│   └── src/
│       ├── types.ts           # Province, HazardEvent, ProvinceScore, API shapes
│       └── index.ts           # re-exports
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── db/schema.sql          # all tables
│   ├── scripts/
│   │   ├── migrate.ts         # applies schema.sql
│   │   └── load-provinces.ts  # downloads the 18 files, inserts provinces
│   ├── src/
│   │   ├── index.ts           # starts Express + the scheduler
│   │   ├── config.ts          # reads .env (checked with zod)
│   │   ├── db.ts              # database connection
│   │   ├── scoring/scoring.ts # THE scoring file: weights + formulas, nothing else
│   │   ├── fetchers/usgs.ts       # fetch + zod schema for the USGS feed
│   │   ├── fetchers/openMeteo.ts  # fetch + zod schema for Open-Meteo
│   │   ├── jobs/ingestEarthquakes.ts
│   │   ├── jobs/ingestWeather.ts
│   │   ├── jobs/computeScores.ts
│   │   ├── jobs/scheduler.ts  # node-cron timers
│   │   └── routes/provinces.ts
│   └── test/                  # Node's built-in test runner, run through tsx
│       ├── scoring.test.ts
│       └── fetchers.test.ts   # zod schemas accept good samples, reject bad ones
└── web/                       # Vite + React (TypeScript template)
    ├── tsconfig.json
    └── src/
        ├── App.tsx
        ├── api.ts             # typed fetch helpers for /api
        └── components/        # ProvinceMap.tsx, StatusCard.tsx, Legend.tsx
```

### Shared types (sketch)

```ts
export type Province = { psgc: number; name: string; regionPsgc: number; geoLevel: 'Prov' | 'Dist' };

export type HazardEvent =
  | { kind: 'earthquake'; id: string; magnitude: number; depthKm: number | null; place: string | null;
      occurredAt: string; distanceKm: number; url: string | null }
  | { kind: 'weather'; validAt: string; tempC: number | null; apparentTempC: number | null;
      rain1hMm: number | null; rain24hMm: number | null };

export type ProvinceScore = { psgc: number; score: number; quakeScore: number; weatherScore: number;
  reasons: string[]; computedAt: string };

export type Freshness = { earthquakesFetchedAt: string | null; weatherFetchedAt: string | null;
  isStale: boolean };   // stale = either fetch is more than 1 hour old

export type ProvinceDetail = { province: Province; score: ProvinceScore; events: HazardEvent[];
  freshness: Freshness };
```

## Database schema

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE provinces (
  psgc          BIGINT PRIMARY KEY,            -- adm2_psgc
  name          TEXT NOT NULL,
  region_psgc   BIGINT NOT NULL,
  geo_level     TEXT NOT NULL,                 -- 'Prov' or 'Dist'
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  weather_point geometry(Point, 4326) NOT NULL -- where we sample weather
);
CREATE INDEX provinces_geom_idx ON provinces USING GIST (geom);

CREATE TABLE earthquakes (
  id             TEXT PRIMARY KEY,             -- USGS event id
  magnitude      REAL NOT NULL,
  depth_km       REAL,
  place          TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL,
  url            TEXT,
  geom           geometry(Point, 4326) NOT NULL,
  epicenter_psgc BIGINT REFERENCES provinces,  -- NULL when offshore
  raw            JSONB NOT NULL,               -- original USGS record
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX earthquakes_time_idx ON earthquakes (occurred_at);

CREATE TABLE earthquake_provinces (            -- which provinces a quake affects
  earthquake_id TEXT   REFERENCES earthquakes ON DELETE CASCADE,
  province_psgc BIGINT REFERENCES provinces,
  distance_km   REAL NOT NULL,                 -- to the province boundary; 0 if inside
  PRIMARY KEY (earthquake_id, province_psgc)
);

CREATE TABLE weather_readings (
  province_psgc   BIGINT REFERENCES provinces,
  valid_at        TIMESTAMPTZ NOT NULL,        -- time the modelled value is valid for
  temp_c          REAL,
  apparent_temp_c REAL,                        -- "feels like"
  rain_1h_mm      REAL,
  rain_24h_mm     REAL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (province_psgc, valid_at)
);

CREATE TABLE province_scores (                 -- latest score per province
  province_psgc BIGINT PRIMARY KEY REFERENCES provinces,
  score         SMALLINT NOT NULL,             -- 0–100
  quake_score   SMALLINT NOT NULL,
  weather_score SMALLINT NOT NULL,
  reasons       JSONB NOT NULL,                -- short human-readable list
  computed_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE province_score_history (          -- one row per province per recompute
  province_psgc BIGINT REFERENCES provinces,
  score         SMALLINT NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (province_psgc, computed_at)
);

CREATE TABLE fetch_runs (                      -- when each feed last succeeded (for "stale")
  source      TEXT PRIMARY KEY,                -- 'usgs' or 'open-meteo'
  last_ok_at  TIMESTAMPTZ NOT NULL
);
```

`fetch_runs` is my addition: it is what lets the card tell "no quakes lately" apart from "the
earthquake fetch has been failing". History grows by ~90 rows per recompute (~3 million a year
at 15-minute runs), which is fine for Phase 1; pruning can come later.

Re-fetching is safe: inserts use `ON CONFLICT` so the same quake or reading is updated, not
duplicated.

## Scoring (all in `server/src/scoring/scoring.ts`)

One `WEIGHTS` object at the top, then pure functions (same input → same output, no database), so
they are easy to test and tune:

- `radiusKm(mag)` — `50 × 2^(mag − 4)`, capped at 400 km (M4 → 50, M5 → 100, M6 → 200, M7 → 400).
- `quakeScore(quakes)` — per quake: magnitude strength × distance fade × **depth fade** × time
  fade (window 72 h, minimum M4.0); take the strongest, plus a small bonus for several quakes.
  Depth fade starts at 1.0 for shallow quakes (≤ 20 km) and falls smoothly with depth down to a
  floor (e.g. 0.3 at 300 km+); unknown depth is treated as shallow. All numbers live in `WEIGHTS`.
- `weatherScore(reading)` — the higher of a rain score (1-hour and 24-hour rain against PAGASA-style
  warning thresholds) and a heat score ("feels like" temperature against PAGASA heat-index bands).
- `totalScore(quake, weather)` — strongest + `secondaryWeight` × the other, capped at 100.
- `buildReasons(...)` — the sentences shown on the card.

Initial threshold numbers are starting guesses, documented in METHODOLOGY.md as such.

## API

- `GET /api/health`
- `GET /api/provinces` — GeoJSON of all provinces (shapes simplified by PostGIS for speed, cached
  in memory) with `score`, `quake_score`, `weather_score` in each feature's properties.
- `GET /api/provinces/:psgc` — score, reasons, earthquakes (with distance), latest weather, and
  freshness (last fetch times + stale flag).

## Build steps (each ends with something to run and see)

0. **Setup**: `git init`, `.gitignore`, `.env.example`, `docker-compose.yml`, root workspace
   `package.json`, `tsconfig.base.json` (strict), and the `shared/` types.
   Check: `docker compose up -d`, then `SELECT postgis_version();` returns a version;
   `npm run typecheck` (runs `tsc --noEmit`, which checks types without producing files) passes.
1. **Schema**: `schema.sql` + `migrate.ts`. Check: `\dt` lists the seven tables.
2. **Provinces**: `load-provinces.ts` (zod-checks each boundary feature's properties).
   Check: row count (~80+ provinces and NCR districts), and a query that a Cebu City coordinate
   falls inside "Cebu".
3. **Earthquakes**: zod schema test first, then fetcher + ingest job, run by hand.
   Check: rows in `earthquakes`, and `earthquake_provinces` shows an offshore quake linked to
   nearby provinces with distances.
4. **Weather**: zod schema test first, then fetcher + ingest job, run by hand.
   Check: one fresh reading per province.
5. **Scoring**: tests first for `scoring.ts`, then the file, then `computeScores.ts`.
   Check: `npm test` passes (including "deeper quake scores lower"); `province_scores` has a row
   per province and `province_score_history` gains a row per province on each run.
6. **API**: Express routes. Check: open the three URLs in a browser / `curl`.
7. **Scheduler**: node-cron wiring in `index.ts`. Check: server log shows runs on the timers.
8. **Map**: Vite + React + MapLibre, provinces coloured by score, legend, credits line.
   Check: the map shows in the browser and colours match the API.
9. **Status card**: click a province → card with score, reasons, raw events, "last updated", and
   a stale badge when data is over 1 hour old. Check: stop the server's scheduler for an hour (or
   backdate `fetch_runs` by hand) and see the badge appear.
10. **Docs**: `README.md` (run instructions, data sources, licenses) and `METHODOLOGY.md`: the
    formula, the depth factor, boundary-distance matching, weather being modelled data
    (`valid_at`), and one weather point per province as a known limitation.

I stop after each step, say what to run and what you should see, and continue once it works.

## End-to-end verification

1. `docker compose up -d`, `npm run migrate`, `npm run load-provinces`, `npm run dev` in `server/`
   and `web/`.
2. Pick a real recent quake from the USGS site; confirm the provinces near it are coloured and the
   card lists that quake with a sensible distance.
3. Compare one province's card weather numbers with open-meteo.com for the same spot.
4. Change a weight in `scoring.ts`, rerun the score job, see the map change.
5. `npm run typecheck` and `npm test` pass across all three workspaces.
6. Feed a deliberately broken USGS record to the ingest job; it is logged and skipped, not saved.
7. Search the built frontend (`web/dist`) for the database URL — it must not appear.
