# PH Monitor

A map of the Philippines where each province is coloured by a 0–100 "stress right now" score,
built from recent earthquakes and current weather. Click anywhere on land to get a score for
that exact spot, with the reasons and the raw events behind it.

> **Not an official warning service.** Scores are unofficial estimates from public data and
> untuned starting weights. For official warnings, follow [PAGASA](https://www.pagasa.dost.gov.ph/)
> and [PHIVOLCS](https://www.phivolcs.dost.gov.ph/).

**Status: work in progress.** The map and score use earthquakes, weather and disaster event
alert levels. The page also shows disaster events and storm tracks on the map, a 7-day outlook
and links to official bulletins on the status card, disaster headlines, and live streams or
latest videos from news channels. A view switch in the top bar puts the page's focus on one
hazard: Typhoon shows the storm tracks, the Philippine Area of Responsibility and a 7-day rain
forecast (ECMWF) with a time slider; Flood colours the towns by the rain part of their
score; Earthquake colours them by the earthquake part and draws the quakes; Storm surge shows
Project NOAH's fixed surge zones; Heat recolours the map by the heat index from a weather model you pick (ECMWF, DWD ICON
or NOAA GFS), PAGASA's own iHeatMAP forecast, or the models' average, for any hour from 8 AM to 5 PM over six days (a time bar at the bottom of the map). Views are shown only and never change the score. The page can be read in English or Filipino (the Filipino
text is a draft under review). Expect rough edges, and scores that change as the formula is
tuned.

"PH Monitor" is a placeholder name (set in `shared/src/appInfo.ts`). Non-commercial project.

## Run it

You need Node 24+ and Docker.

```bash
cp .env.example .env      # first time only
npm install               # first time only
npm run db:up             # start the database (PostGIS in Docker, port 5433)
npm run migrate           # create the tables
npm run load-provinces    # download province boundaries (first time only)
npm run load-places       # download city and municipality boundaries (first time only)
npm run weather-points    # build the weather grid and link each town to it (first time only)

npm run dev:server        # terminal 1: API + data fetching, http://localhost:3001
npm run dev:web           # terminal 2: the map, http://localhost:5173
```

Re-running `npm run weather-points` later empties the stored weather readings (`point_readings`)
and the heat map (`heat_forecasts`) until the next weather run and the next heat map run (at the
next hourly tick) fill them again.

The server fetches earthquakes, official alerts and news every 15 minutes; weather every 2 hours;
disaster events, storm tracks and the stream check every 30 minutes; the feed check every hour; the 7-day outlook every
6 hours; and the heat map every 12 hours. At startup only the jobs that are due run, so a restart does not fetch fresh feeds again.
Weather for a clicked spot is fetched when you click, and reused for 30 minutes.

Optional: put a free YouTube Data API key in `.env` as `YOUTUBE_API_KEY` so the stream check can
tell which channels are live. The key stays on the server.

A link can open a spot directly: `http://localhost:5173/?lat=10.3157&lon=123.8854`.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Run the tests (scoring and feed checks) |
| `npm run test:db` | Run the database tests against a separate `phmonitor_test` database (needs `npm run db:up`) |
| `npm run replay` | Replay past disasters through the score formula and print a results table (see `docs/replay-results.md`) |
| `npm run typecheck` | Check all TypeScript |
| `npm run ingest:earthquakes` / `ingest:weather` / `compute:scores` | Run one job by hand |
| `npm run ingest:events` / `ingest:storms` / `ingest:forecast` / `ingest:news` / `ingest:alerts` / `ingest:heatmap` / `ingest:pagasaheat` | Run one of the newer jobs by hand |
| `npm run check:sources` | Check every news feed and stream link and print a table |
| `npm run sample-storm` (add `-- remove` to delete it) | Load a sample storm track, clearly labelled as not real |
| `npm run build` | Build the web app into `web/dist` |
| `npm run db:psql` | Open a database prompt |
| `npm run db:down` | Stop the database (data is kept) |

## How the score works

See [METHODOLOGY.md](METHODOLOGY.md). All weights live in `server/src/scoring/scoring.ts`.
The build plan is in [PLAN.md](PLAN.md).

## More detail

The [docs/](docs/README.md) folder explains the data sources, the news and live streams, how
data flows through the app, and its limits.

## Data sources and credits

| Data | Source | Licence |
|---|---|---|
| Earthquakes | [USGS Earthquake Catalog](https://earthquake.usgs.gov/fdsnws/event/1/) | Public domain |
| Weather (modelled) | [Open-Meteo](https://open-meteo.com/) | CC BY 4.0; free tier is non-commercial only |
| Official alerts (flood advisories, tropical cyclone alerts) | [PAGASA public alert feed](https://publicalert.pagasa.dost.gov.ph/feeds/) | © PAGASA, CC BY 4.0 |
| Province, city and municipality boundaries (simplified) | NAMRIA and PSA via OCHA, from [faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps) | Boundaries CC BY 3.0 IGO; repository MIT |
| Disaster events (typhoons, floods, volcanoes, quakes) with alert levels | [GDACS](https://www.gdacs.org/), European Commission JRC and UN OCHA | CC BY 4.0, © European Union |
| Natural events | [NASA EONET](https://eonet.gsfc.nasa.gov/) | Free to use; credit NASA |
| Tropical storm tracks and forecasts | [Japan Meteorological Agency (JMA)](https://www.jma.go.jp/bosai/map.html#contents=typhoon) | JMA terms of use; credit required |
| Tropical storm warnings (backup) | [Joint Typhoon Warning Center (JTWC)](https://www.metoc.navy.mil/jtwc/jtwc.html), US Navy | Public domain |
| 7-day outlook: rain and wind gusts (modelled) | [Open-Meteo](https://open-meteo.com/) | CC BY 4.0; free tier is non-commercial only |
| 7-day outlook: river flow (modelled) | [Open-Meteo Flood API](https://open-meteo.com/en/docs/flood-api), from GloFAS (Copernicus Emergency Management Service) | CC BY 4.0 |
| Heat index map (ECMWF source) and rain forecast field (modelled; shown only, not in the score) | Based on data and products of the European Centre for Medium-Range Weather Forecasts ([ECMWF](https://www.ecmwf.int/)): IFS HRES [open data](https://www.ecmwf.int/en/forecasts/datasets/open-data), via [Open-Meteo](https://open-meteo.com/). Changed: we work out the heat index from its temperature and humidity, and add up the rain in 3-hour steps | CC BY 4.0 |
| Heat index map, ICON source (same) | Based on data from [Deutscher Wetterdienst](https://www.dwd.de/) (DWD), gridded data reproduced graphically: the ICON global model, via [Open-Meteo](https://open-meteo.com/) | CC BY 4.0 |
| Heat index map, GFS source (same) | Global Forecast System of [NOAA](https://www.noaa.gov/)'s National Weather Service (NCEP), via [Open-Meteo](https://open-meteo.com/) | Public domain |
| Heat index map, PAGASA source (shown only, not in the score) | Heat index forecast: [DOST-PAGASA iHeatMAP](https://iheatmap.pagasa.dost.gov.ph/) (iheatmap.pagasa.dost.gov.ph), based on ECMWF data. Used without changes, for a non-commercial purpose | Philippine government work (RA 8293 Sec. 176); credit given, non-commercial use |
| News headlines (headline, outlet, time and link only) | RSS feeds of the outlets listed in `server/src/sources.ts`, and [Google News](https://news.google.com/) search | Headlines belong to their outlets; each links to the original article |
| Live streams and latest videos | [YouTube](https://www.youtube.com/) channels listed in `server/src/sources.ts` | Shown only in YouTube's own player |
| Basemap: roads and place names (switch in `web/src/mapSettings.ts`) | [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles, data © OpenStreetMap contributors | ODbL (OpenStreetMap data) |
| Landslide and storm surge hazard maps (fixed maps, simplified; shown only, not in the score) | [Project NOAH](https://noah.up.edu.ph/) and its contributors (UP NOAH Center); landslide maps by UP NIGS, storm surge maps by PAGASA with UP NIGS. Downloaded from the Hugging Face mirror `bettergovph/project-noah-hazard-maps` | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |

## Licence

The code is under the [MIT licence](LICENSE). The data keeps its own licences, listed above.

The hazard zone shapes our map serves are simplified from Project NOAH data and are available
under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/).
