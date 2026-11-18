# How it works

## The path from a feed to the map

```
public feeds ──▶ fetchers ──▶ jobs ──▶ PostgreSQL + PostGIS ──▶ /api ──▶ web page
(USGS, GDACS…)   download     save,     (tables below)          Express   React + MapLibre
                 and check    link,
                 with zod     score
```

1. A **fetcher** (`server/src/fetchers/`) downloads one feed and checks every record.
2. A **job** (`server/src/jobs/`) saves the good records and notes that the fetch worked.
3. The **scoring job** (`computeScores.ts`) reads the database and writes a 0–100 score for
   each province. The formulas are only in `server/src/scoring/scoring.ts`; see
   [../METHODOLOGY.md](../METHODOLOGY.md).
4. The **API** (`server/src/routes/`) answers the web page from the database.
5. The **web page** (`web/src/`) draws the map, the status card and the panels. It refreshes
   its data every 5 minutes.

The three parts share their types through `shared/src/types.ts`.

## Schedule

The scheduler (`server/src/jobs/scheduler.ts`) ticks every 15 minutes while the server is up.

| Job | How often | By hand |
|---|---|---|
| Earthquakes | 15 min | `npm run ingest:earthquakes` |
| Weather | 2 hours | `npm run ingest:weather` |
| Official alerts | 15 min | `npm run ingest:alerts` |
| Scores (after the two above) | 15 min | `npm run compute:scores` |
| News | 15 min | `npm run ingest:news` |
| Disaster events | 30 min | `npm run ingest:events` |
| Storm tracks | 30 min | `npm run ingest:storms` |
| Stream check | 30 min | `npm run check:sources` |
| Feed check | 1 hour | `npm run check:sources` |
| 7-day outlook | 6 hours | `npm run ingest:forecast` |
| Heat map (`ingestHeatMap.ts`, all three models in one request) | 12 hours | `npm run ingest:heatmap` |

When the server starts, it runs only the jobs that are due: a job is skipped if it last
succeeded less than its own interval ago (`server/src/jobs/due.ts` asks the database). So
restarting the server again and again does not fetch the feeds again. The scores are always
worked out at start. A job that fails is logged and the next jobs still run.

## Database tables

All in `server/db/schema.sql`, applied by `npm run migrate` (safe to run again).

| Table | Holds |
|---|---|
| `provinces` | Province shapes and the weather sample point of each |
| `places` | City and municipality shapes, to name a clicked spot and colour the map |
| `earthquakes` | One row per USGS quake |
| `earthquake_provinces` | Which provinces each quake reaches, with the distance |
| `weather_points` | The ~600 weather points: a 0.25° grid, province points, far-off towns (`npm run weather-points`). Re-running that command empties this table with `TRUNCATE ... CASCADE`, so `point_readings` and `heat_forecasts` are empty too until the weather job (its next run) and the heat map job fill them again. The command also clears the heat map's run records, so the heat job runs at the next hourly tick |
| `place_weather_points` | Which points each town reads its weather from |
| `point_readings` | Each weather point's reading per model hour (last 2 days) |
| `weather_readings` | The worst weather across each province's points, per model hour |
| `place_scores` | The latest score, reasons and per-hazard scores for each town (no history) |
| `official_alerts` | PAGASA alerts, in PAGASA's own words |
| `province_scores` | The latest score and reasons for each province: those of its highest town |
| `province_score_history` | Past scores with their part-scores; a row is added only when something changed |
| `events` | Disaster events from GDACS and EONET |
| `storms`, `storm_track_points` | Tropical storms and their past and forecast positions |
| `forecast_days` | The 7-day outlook per province |
| `news` | Disaster headlines, one row per story |
| `sources` | What the link checker found for each feed and stream |
| `fetch_runs` | When each feed last succeeded |
| `hazard_zones` | Project NOAH hazard zones (landslide, storm surge levels 1–4), class 1–3, in small pieces; kept apart from the score tables (ODbL) |
| `hazard_coverage` | Which province's hazard file is loaded for each map, so "no hazard map here" is told apart from "not in a zone" |
| `heat_forecasts` | The heat map: per model, weather point and hour, the temperature, humidity and heat index of the newest good run (next 48 hours). Never read by the score |
| `heat_runs` | Each heat map model's last good run (when, how many points answered) |
| `job_tries` | When a job last started, even if it failed (only the heat map for now): a failed heat run waits 12 hours before the next try, even after a restart |

`fetch_runs` is how the app tells "no earthquakes lately" apart from "the earthquake fetch has
been failing". A banner on the page names every feed that is past its own limit, and a score
that is missing a signal is shown as "at least N" with stripes on the map (see METHODOLOGY.md).

## API

The web page talks only to these addresses on our own server (port 3001).

| Address | Returns |
|---|---|
| `GET /api/health` | Whether the server and database are up |
| `GET /api/provinces` | Every province's shape and score, for the map |
| `GET /api/provinces/:psgc` | One province in detail |
| `GET /api/point?lat=..&lon=..` | The clicked town's saved score (the card's main number) and the exact spot's score, worked out on demand |
| `GET /api/places?q=..` | Place search: cities, municipalities and provinces by name, from our own database |
| `GET /api/places/shapes` | Every town's shape (downloaded once, when the map first loads) |
| `GET /api/places/scores` | Every town's latest score, for the map colours |
| `GET /api/events` | Current disaster events, for map markers |
| `GET /api/storms` | Active storms with their tracks |
| `GET /api/news` | Latest headlines; optional `type` (a kind of disaster or `general`), `category`, `psgc`, `limit` (1–100, default 30) |
| `GET /api/streams` | Stream slots the page may show |
| `GET /api/bulletins` | Links to official PAGASA and PHIVOLCS pages |
| `GET /api/alerts` | Official alerts in effect (PAGASA) |
| `GET /api/status` | When each feed last succeeded, and which are out of date |
| `GET /api/hazards` | Which fixed hazard maps are loaded (kind, storm surge level, provinces, when), for the legend |
| `GET /api/heatmap?model=..` | The heat map for one model (`ecmwf_ifs`, the default; `dwd_icon_global_native`; `ncep_gfs_global`): the current hour's heat index and band for every town (its hottest point) and province (its hottest town), when the run was fetched, and whether it is out of date. An unknown model gives 400 |
| `GET /api/hazards/tiles/:layer/:z/:x/:y.mvt` | Hazard zones as vector tiles (`landslide` or `surge1`…`surge4`), storm surge from zoom 4, landslide from zoom 9; empty below that |

## What the reader sees

- **Map:** every city and municipality coloured by its own score at every zoom level (0–19
  nothing detected, 20–39 low, 40–59 moderate, 60–79 high, 80–100 severe), with event markers and storm
  tracks on top. A province or town with no score yet is striped grey. The picked spot's town
  gets a thick outline. The fixed hazard maps (Project NOAH: landslide, and storm surge at its
  widest level, SSA 4) can be switched on in the legend; they show as cool-toned stripes from
  zoom 9, denser for a higher class. Storm surge also shows further out, as coloured zone
  outlines along the coast; landslide starts at zoom 9.
- **Heat map:** a "Heat map" button at the top right of the map turns it on and opens a small
  panel. The panel lists the sources (ECMWF, DWD ICON, NOAA GFS) with each model's grid size;
  the reader can switch at any time and the map recolours straight away. It also shows the
  "Model estimate" tag, when the data was updated, and the band key. While it is on, the score
  colours are hidden (the legend says so), and the same town and province shapes are coloured
  by PAGASA's heat bands instead: a pale neutral fill below 27 °C, then caution, extreme
  caution, danger and extreme danger. A shape with no value is striped, never cool. The hover
  label gives the heat index, for example "Kiamba: 41 °C, extreme caution · ECMWF". The status
  card still opens on a click. Closing the panel turns the heat map off and brings the score
  colours back. It never changes the score.
- **Light or dark:** follows the device setting until the reader picks one in the top bar
  (remembered in the browser). The dark theme uses a dark basemap and a score scale where
  brighter means more stress.
- **Status card:** opens on a click. The town's score (the same as its map colour) with its
  reasons, the exact spot's own score, the province's score,
  the 7-day outlook, nearby events (within 300 km), storms forecast to pass within 300 km,
  headlines naming the province, and official bulletin links. A "Hazard map" block under the
  hazard rows says what the fixed NOAH maps show for the spot (landslide class, and storm
  surge level by level); it never changes the score.
- **Headlines panel** and **live news panel** (streams): see [news-and-streams.md](news-and-streams.md).
- **Language:** English or Filipino. Every string is in `web/src/i18n/en.ts` and `fil.ts`. The
  server sends score reasons as message keys plus numbers, and the page writes the sentence.
  The Filipino text is a draft until the owner reviews it.
- A link can open a spot directly: `/?lat=10.3157&lon=123.8854`.
