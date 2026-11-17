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
| Weather | 1 hour | `npm run ingest:weather` |
| Official alerts | 15 min | `npm run ingest:alerts` |
| Scores (after the two above) | 15 min | `npm run compute:scores` |
| News | 15 min | `npm run ingest:news` |
| Disaster events | 30 min | `npm run ingest:events` |
| Storm tracks | 30 min | `npm run ingest:storms` |
| Stream check | 30 min | `npm run check:sources` |
| Feed check | 1 hour | `npm run check:sources` |
| 7-day outlook | 6 hours | `npm run ingest:forecast` |

Everything also runs once when the server starts. The outlook is skipped at startup if it was
fetched less than 6 hours ago. A job that fails is logged and the next jobs still run.

## Database tables

All in `server/db/schema.sql`, applied by `npm run migrate` (safe to run again).

| Table | Holds |
|---|---|
| `provinces` | Province shapes and the weather sample point of each |
| `places` | City and municipality shapes, to name a clicked spot |
| `earthquakes` | One row per USGS quake |
| `earthquake_provinces` | Which provinces each quake reaches, with the distance |
| `weather_readings` | Weather at each province's sample point, per model hour |
| `official_alerts` | PAGASA alerts, in PAGASA's own words |
| `province_scores` | The latest score and reasons for each province |
| `province_score_history` | Every past score |
| `events` | Disaster events from GDACS and EONET |
| `storms`, `storm_track_points` | Tropical storms and their past and forecast positions |
| `forecast_days` | The 7-day outlook per province |
| `news` | Disaster headlines, one row per story |
| `sources` | What the link checker found for each feed and stream |
| `fetch_runs` | When each feed last succeeded |

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
| `GET /api/point?lat=..&lon=..` | The score for one exact spot, worked out on demand |
| `GET /api/events` | Current disaster events, for map markers |
| `GET /api/storms` | Active storms with their tracks |
| `GET /api/news` | Latest headlines; optional `category`, `psgc`, `limit` (1–100, default 30) |
| `GET /api/streams` | Stream slots the page may show |
| `GET /api/bulletins` | Links to official PAGASA and PHIVOLCS pages |
| `GET /api/alerts` | Official alerts in effect (PAGASA) |
| `GET /api/status` | When each feed last succeeded, and which are out of date |

## What the reader sees

- **Map:** provinces coloured by score (0–19 nothing detected, 20–39 low, 40–59 moderate, 60–79 high,
  80–100 severe), with event markers and storm tracks on top. A province with no score yet
  is striped grey.
- **Light or dark:** follows the device setting until the reader picks one in the top bar
  (remembered in the browser). The dark theme uses a dark basemap and a score scale where
  brighter means more stress.
- **Status card:** opens on a click. Score for that spot, the reasons, the province's score,
  the 7-day outlook, nearby events (within 300 km), storms forecast to pass within 300 km,
  headlines naming the province, and official bulletin links.
- **Headlines panel** and **live streams panel:** see [news-and-streams.md](news-and-streams.md).
- **Language:** English or Filipino. Every string is in `web/src/i18n/en.ts` and `fil.ts`. The
  server sends score reasons as message keys plus numbers, and the page writes the sentence.
  The Filipino text is a draft until the owner reviews it.
- A link can open a spot directly: `/?lat=10.3157&lon=123.8854`.
