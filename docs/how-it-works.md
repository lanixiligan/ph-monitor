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
| PAGASA iHeatMAP heat forecast (`ingestPagasaHeat.ts`; downloads only a new forecast) | 3 hours | `npm run ingest:pagasaheat` |

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
| `heat_forecasts` | The heat map: per model, weather point and hour, the temperature, humidity and heat index of the newest good run (today's hours from PH midnight through day 6: 16 past and 144 forecast hours fetched). Never read by the score |
| `heat_runs` | Each heat map model's last good run (when, how many points answered) |
| `pagasa_heat` | PAGASA's heat index per town and hour, from the newest forecast that has the hour. Never read by the score |
| `pagasa_town_cells` | Which PAGASA squares (about 1 km) belong to each town; rebuilt when the grid changes or towns are reloaded |
| `pagasa_grid` | The shape of PAGASA's grid, so we know when it changed (`load-places` clears it) |
| `job_tries` | When a job last started, even if it failed (the heat map, the rain forecast and PAGASA heat): a failed heat run waits 12 hours before the next try (PAGASA heat, 3 hours), even after a restart |

`fetch_runs` is how the app tells "no earthquakes lately" apart from "the earthquake fetch has
been failing". A banner on the page names every feed that is past its own limit, and a score
that is missing a signal is shown as "at least N" with stripes on the map (see METHODOLOGY.md).

## API

The web page talks only to these addresses on our own server (port 3001).

| Address | Returns |
|---|---|
| `GET /api/health` | Whether the server and database are up |
| `GET /api/provinces` | Every province's shape and score, for the map; also the highest earthquake part among its towns and that town (`quake_top_score`, `quake_top_place`) and `quake_unknown`, for the Earthquake view; and the highest known rain part among its towns and that town (`rain_top_score`, `rain_top_place`, null when no town's rain is known) and `rain_unknown` (some town's rain is unknown), for the Flood view |
| `GET /api/provinces/:psgc` | One province in detail |
| `GET /api/point?lat=..&lon=..` | The clicked town's saved score (the card's main number) and the exact spot's score, worked out on demand |
| `GET /api/places?q=..` | Place search: cities, municipalities and provinces by name, from our own database |
| `GET /api/places/shapes` | Every town's shape (downloaded once, when the map first loads) |
| `GET /api/places/scores` | Every town's latest score, for the map colours, plus its earthquake part (`quakeScore`) and whether earthquakes were unknown for it (`quakeUnknown`), for the Earthquake view, and its rain part (`rainScore`, null when unknown), for the Flood view |
| `GET /api/events` | Current disaster events, for map markers |
| `GET /api/quakes` | The earthquakes inside the score's window (`WEIGHTS.quake.windowHours`, magnitude from `WEIGHTS.quake.minMagnitude`), newest first: position, magnitude, depth, time, USGS link; plus when USGS last answered and whether that is out of date. For the quake markers |
| `GET /api/storms` | Active storms with their tracks |
| `GET /api/news` | Latest headlines; optional `type` (a kind of disaster or `general`), `category`, `psgc`, `limit` (1–100, default 30) |
| `GET /api/streams` | Stream slots the page may show |
| `GET /api/bulletins` | Links to official PAGASA and PHIVOLCS pages |
| `GET /api/alerts` | Official alerts in effect (PAGASA) |
| `GET /api/status` | When each feed last succeeded, and which are out of date |
| `GET /api/hazards` | Which fixed hazard maps are loaded (kind, storm surge level, provinces, when), for the legend |
| `GET /api/heatmap?model=..&at=..` | The heat map for one model (`ecmwf_ifs`, the default; `dwd_icon_global_native`; `ncep_gfs_global`) or `average` or `pagasa` (PAGASA's own forecast). It gives the heat index and band at the chosen hour for every town (its hottest point) and province (its hottest town), when the run was fetched, and whether it is out of date. For `average`, each value also has `spread` (models used, lowest, highest). `at` is an ISO time on a whole hour, 8 AM to 5 PM PH time, from today to today plus 5 days; anything else gives 400. Without `at` you get the default hour: this hour during the day, 8 AM before it, tomorrow 8 AM after 5 PM. The answer lists the `hours` available. An unknown model gives 400 |
| `GET /api/rainforecast` | The rain forecast field for the Typhoon view: the grid (1.5° apart over the PAR), and the next 7 days of ECMWF rain as 3-hour totals per grid point (null = no forecast), from the period that holds now; when it was fetched and whether that is out of date |
| `GET /api/hazards/tiles/:layer/:z/:x/:y.mvt` | Hazard zones as vector tiles (`landslide` or `surge1`…`surge4`), storm surge from zoom 4, landslide from zoom 9; empty below that |

## What the reader sees

- **Map:** every city and municipality coloured by its own score at every zoom level (0–19
  nothing detected, 20–39 low, 40–59 moderate, 60–79 high, 80–100 severe), with event markers and storm
  tracks on top. A province or town with no score yet is striped grey. The picked spot's town
  gets a thick outline. The fixed hazard maps (Project NOAH: landslide, and storm surge at its
  widest level, SSA 4) can be switched on in the legend; they show as cool-toned stripes from
  zoom 9, denser for a higher class. Storm surge also shows further out, as coloured zone
  outlines along the coast; landslide starts at zoom 9.
- **View switch:** a row of buttons in the top bar: Overall (the default), Typhoon, Flood,
  Earthquake and Heat, plus "More" with Storm surge (greyed out, "Storm surge map not loaded
  yet", until the NOAH map is loaded) and Tsunami greyed out ("No live feed for tsunamis yet"). Only one is pressed at
  a time. Pressing a hazard ticks its legend layers, sets the headline filter to that kind
  (with the panel title "Earthquake headlines", or "No … headlines in the last 14 days" and a
  "Show all headlines" link), and moves that hazard's row and section to the top of the status
  card. The legend shows that view's scale; the layers that don't belong to it fold under
  "Other layers". Overall gives back the reader's own tick boxes. Picking a headline filter by
  hand never changes the view. Display only: no view changes the score.
- **Earthquake view:** towns are coloured by the earthquake part of their score (provinces, until
  the towns load, by the highest earthquake part among their towns), in the score's own colours; the hover label says
  "earthquake part". A town where earthquakes could not be checked keeps the "at least"
  stripes. Quake markers (a legend tick box, off on Overall) are sized by magnitude; hovering
  shows magnitude, depth and how long ago, a click adds the USGS link. Under the tick box the
  legend says how many quakes are drawn, or that there are none, or that the feed is out of date.
- **Flood view:** towns are coloured by the rain part of their score (rain in the last hour and
  the last 24 hours; provinces, until the towns load, by the highest rain part among their
  towns), in the score's own colours, tagged "Model estimate". The hover label says "rain
  part". A town with no rain reading is striped, never shown as dry. The status card puts the
  rain row and the weather section first.
- **Typhoon view:** storm tracks and forecasts (JMA, JTWC), plus the NOAH storm surge zones when
  loaded, and the Philippine Area of Responsibility (PAR) as a dashed outline; pressing it zooms
  the map out to the whole PAR. The score colours are hidden and towns show as plain outlines.
  The rain forecast field (a legend tick box, ticked by this view and offered nowhere else)
  colours sea and land by the rain expected in 3 hours (ECMWF, 7 days ahead), blue for light
  rain through green, yellow and red to magenta for 80 mm or more; nothing is drawn below
  0.5 mm, and a spot with no forecast is shown as "no data", never as dry. A panel over the
  map has the period shown, Play/Pause and a slider through the 7 days, the "Model estimate"
  tag, when it was updated, and the ECMWF credit. The grid points are about 165 km apart and
  the field is smoothed between them, so it shows the broad pattern, not single storms. A note on the map says
  "No tropical cyclone tracked right now", or, with the warning sign, that the storm feed is out
  of date. Wind colours per town are not available yet (no wind in the weather grid). The
  status card moves its "Storms forecast to pass near" block up and always shows it: the list,
  "none within 300 km", or a warning that the tracks could not be checked.
- **Storm surge view:** the NOAH storm surge zones, a fixed map of where a surge could reach (not
  a live surge), tagged "Fixed map · Project NOAH". Score colours hidden, towns as plain outlines.
- **Heat map:** the Heat button in the view switch turns it on and opens a small
  panel over the map. The panel lists the sources (ECMWF, DWD ICON, NOAA GFS) with each model's grid size,
  then "Average of all three"; the reader can switch at any time and the map recolours straight away. It also shows the
  "Model estimate" tag and when the data was updated; the band key is in the legend. While it is on, the score
  colours are hidden (the legend says so), and the same town and province shapes are coloured
  by PAGASA's heat bands instead: a pale neutral fill below 27 °C, then caution, extreme
  caution, danger and extreme danger. A shape with no value is striped, never cool. The hover
  label gives the heat index, for example "Kiamba: 41 °C, extreme caution · ECMWF". In the
  average view each town is the mean (to 0.1 °C) of every model that has a value for it, and
  the label says how many and how far apart they were: "· average of 3 models: 39–43 °C", or
  "average of 2 of 3 models" when one is missing. A town with no model at all is striped. The
  view is marked out of date if any of its sources is, and "Updated" gives the oldest source's
  run. The status
  card still opens on a click. Closing the panel (or pressing Overall) turns the heat map off and brings the score
  colours back. It never changes the score.
  A time bar at the bottom of the map (`HeatTimeBar.tsx`) picks the day (six days) and the hour
  (8 AM to 5 PM); hours a source has no data for are greyed out, and hover labels show the time.
  The PAGASA source carries an Official tag and its credit line.
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
