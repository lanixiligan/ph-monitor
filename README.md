# PH Monitor

A map of the Philippines where each province is coloured by a 0–100 "stress right now" score,
built from recent earthquakes and current weather. Click anywhere on land to get a score for
that exact spot, with the reasons and the raw events behind it.

> **Not an official warning service.** Scores are unofficial estimates from public data and
> untuned starting weights. For official warnings, follow [PAGASA](https://www.pagasa.dost.gov.ph/)
> and [PHIVOLCS](https://www.phivolcs.dost.gov.ph/).

**Status: work in progress.** Phase 1 only (earthquakes and weather). Expect rough edges, and
scores that change as the formula is tuned.

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

npm run dev:server        # terminal 1: API + data fetching, http://localhost:3001
npm run dev:web           # terminal 2: the map, http://localhost:5173
```

The server fetches earthquakes every 15 minutes and weather every 30 minutes, and once at startup.
Weather for a clicked spot is fetched when you click, and reused for 30 minutes.

A link can open a spot directly: `http://localhost:5173/?lat=10.3157&lon=123.8854`.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Run the tests (scoring and feed checks) |
| `npm run typecheck` | Check all TypeScript |
| `npm run ingest:earthquakes` / `ingest:weather` / `compute:scores` | Run one job by hand |
| `npm run build` | Build the web app into `web/dist` |
| `npm run db:psql` | Open a database prompt |
| `npm run db:down` | Stop the database (data is kept) |

## How the score works

See [METHODOLOGY.md](METHODOLOGY.md). All weights live in `server/src/scoring/scoring.ts`.
The build plan is in [PLAN.md](PLAN.md).

## Data sources and credits

| Data | Source | Licence |
|---|---|---|
| Earthquakes | [USGS Earthquake Catalog](https://earthquake.usgs.gov/fdsnws/event/1/) | Public domain |
| Weather (modelled) | [Open-Meteo](https://open-meteo.com/) | CC BY 4.0; free tier is non-commercial only |
| Province, city and municipality boundaries (simplified) | NAMRIA and PSA via OCHA, from [faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps) | Boundaries CC BY 3.0 IGO; repository MIT |
| Disaster events (typhoons, floods, volcanoes, quakes) with alert levels | [GDACS](https://www.gdacs.org/), European Commission JRC and UN OCHA | CC BY 4.0, © European Union |
| Natural events | [NASA EONET](https://eonet.gsfc.nasa.gov/) | Free to use; credit NASA |
| Basemap: roads and place names (switch in `web/src/mapSettings.ts`) | [OpenFreeMap](https://openfreemap.org/), © OpenMapTiles, data © OpenStreetMap contributors | ODbL (OpenStreetMap data) |

## Licence

The code is under the [MIT licence](LICENSE). The data keeps its own licences, listed above.
