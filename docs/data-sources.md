# Data sources

Every feed the server reads. None needs an API key. Each has one fetcher file in
`server/src/fetchers/`, which downloads the data and checks it with zod before anything is
saved. Records that fail the check are skipped and logged.

News feeds and YouTube streams are on their own page: [news-and-streams.md](news-and-streams.md).

## At a glance

| Data | Source | Fetched | Changes the score? |
|---|---|---|---|
| Earthquakes | USGS | every 15 min | Yes |
| Current weather | Open-Meteo | every 30 min | Yes |
| Official alerts | PAGASA public alert feed | every 15 min | No, shown above the score |
| Disaster events with alert levels | GDACS | every 30 min | Yes (typhoon, flood, volcano, wildfire) |
| Natural events | NASA EONET | every 30 min | No, shown only |
| Storm tracks | JMA, with JTWC as backup | every 30 min | No, shown only |
| 7-day outlook: rain and gusts | Open-Meteo | every 6 hours | No, shown only |
| 7-day outlook: river flow | Open-Meteo Flood API (GloFAS) | every 6 hours | No, shown only |
| Boundaries | NAMRIA and PSA via OCHA | once, by hand | Used to measure distances |
| Basemap tiles | OpenFreeMap | by the browser | No |

## Earthquakes: USGS

- **Address:** `https://earthquake.usgs.gov/fdsnws/event/1/query` ([docs](https://earthquake.usgs.gov/fdsnws/event/1/))
- **What we ask for:** magnitude 4.0 and above, the last 7 days, in a box around the
  Philippines (latitude 4.5 to 21.5, longitude 116 to 127) widened by 4 degrees on every side,
  so a strong quake just outside the country is not missed.
- **What we keep:** id, magnitude, depth, place text, time, link, epicentre, and the original
  record. Each quake is linked to the provinces within its reach.
- **Licence:** public domain.
- **Limits:** USGS is a global catalogue. Near the Philippines it reliably reports only about
  magnitude 4 and above, sometimes late. PHIVOLCS records many more.
- **Code:** `fetchers/usgs.ts`, `jobs/ingestEarthquakes.ts`.

## Current weather: Open-Meteo

- **Address:** `https://api.open-meteo.com/v1/forecast` ([docs](https://open-meteo.com/en/docs))
- **What we ask for:** temperature, humidity and hourly rain at one sample point inside each
  province (88 points, up to 50 per request).
- **What we keep:** temperature, humidity, rain in the last hour and last 24 hours, and a heat
  index we compute ourselves (`server/src/heatIndex.ts`).
- **Also on demand:** when a reader clicks the map, weather for that spot is fetched, snapped
  to a 0.05° grid (about 5 km) and reused for 30 minutes (`server/src/pointWeather.ts`).
- **Licence:** CC BY 4.0. The free tier is for non-commercial use only.
- **Limits:** the values are **modelled**, not measured by a station.
- **Code:** `fetchers/openMeteo.ts`, `jobs/ingestWeather.ts`.

## Disaster events: GDACS

- **Address:** `https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?country=Philippines`.
  If that fails, the backup is the RSS feed `https://www.gdacs.org/xml/rss.xml`.
- **What it is:** the UN and EU's Global Disaster Alert and Coordination System. Each event has
  a Green, Orange or Red level: an estimate of how much international help it may need. It is
  **not** a PAGASA signal number or a PHIVOLCS alert level.
- **What we keep:** kind (typhoon, earthquake, flood, volcano, wildfire, drought, other), alert
  level, title, start and end time, link, point or area, and the original record.
- **Licence:** CC BY 4.0, © European Union.
- **Code:** `fetchers/gdacs.ts`, `jobs/ingestEvents.ts`.

## Natural events: NASA EONET

- **Address:** `https://eonet.gsfc.nasa.gov/api/v3/events` ([docs](https://eonet.gsfc.nasa.gov/docs/v3)),
  for the same box as the earthquakes, the last 30 days, open and closed events.
- **What we keep:** the same fields as GDACS events, but EONET gives no alert level, so these
  are shown on the map and never scored. Events EONET copied from GDACS are skipped.
- **Licence:** free to use; credit NASA.
- **Code:** `fetchers/eonet.ts`, `jobs/ingestEvents.ts`.

Events from both sources are removed 30 days after they end. The page shows an event until
7 days after it ends.

## Storm tracks: JMA, with JTWC as backup

- **Main: Japan Meteorological Agency.** Public JSON under
  `https://www.jma.go.jp/bosai/typhoon/data` (the files behind JMA's own
  [typhoon map](https://www.jma.go.jp/bosai/map.html#contents=typhoon)). JMA is the official
  agency for the Northwest Pacific. It gives the current position, forecast positions,
  category, pressure, wind and the uncertainty circle.
- **Backup: US Joint Typhoon Warning Center.** RSS list at
  `https://www.metoc.navy.mil/jtwc/rss/jtwc.rss`, then one plain-text warning per storm. Used
  only when JMA fails. It has the current and forecast positions, but no past track, pressure
  or uncertainty circle.
- **What we keep:** name, category, whether it is still active, and each track point (time,
  position, pressure, wind in knots, uncertainty radius in km).
- **Licence:** JMA terms of use, credit required. JTWC is public domain.
- **Limits:** no storm was active when the JMA fetcher was written, so some of its format is
  inferred and read tolerantly. `npm run sample-storm` loads a clearly labelled fake storm for
  testing the map.
- **Code:** `fetchers/jma.ts`, `fetchers/jtwc.ts`, `jobs/ingestStorms.ts`.

## 7-day outlook: Open-Meteo and GloFAS

- **Rain and gusts:** `https://api.open-meteo.com/v1/forecast`, daily totals per province
  sample point, in Philippine calendar days.
- **River flow:** `https://flood-api.open-meteo.com/v1/flood`
  ([docs](https://open-meteo.com/en/docs/flood-api)), from the GloFAS model of the Copernicus
  Emergency Management Service. Flow is in m³/s on a grid of about 5 km. Many points are not
  near a river, so empty values are normal.
- **Licence:** CC BY 4.0. The free tier is for non-commercial use only.
- **Limits:** modelled, one point per province.
- **Code:** `fetchers/openMeteoDaily.ts`, `fetchers/openMeteoFlood.ts`, `jobs/ingestForecast.ts`.

## Boundaries: NAMRIA and PSA via OCHA

- **Address:** GeoJSON files from
  [faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps),
  downloaded once by `npm run load-provinces` and `npm run load-places` and kept in `data/`
  (git-ignored).
- **What we keep:** province shapes (medium resolution) and city and municipality shapes, each
  with its official PSGC code.
- **Licence:** boundaries CC BY 3.0 IGO; the repository is MIT.
- **Code:** `server/scripts/boundaryFiles.ts`, `load-provinces.ts`, `load-places.ts`.

## Basemap: OpenFreeMap

Roads and place names under the provinces. The reader's browser loads these tiles straight
from [OpenFreeMap](https://openfreemap.org/) (© OpenMapTiles, data © OpenStreetMap
contributors, ODbL). Turn it off with `SHOW_BASEMAP` in `web/src/mapSettings.ts`.

## Official alerts: PAGASA

- **Address:** `https://publicalert.pagasa.dost.gov.ph/feeds/`, a list of the latest alerts;
  each one links to its own CAP file (Common Alerting Protocol, an XML standard).
- **What it carries (seen so far):** General Flood Advisories, whose areas are provinces with
  their place codes, and Tropical Cyclone Alerts, whose one area is the whole Philippine Area
  of Responsibility. Not in the feed: rainfall warnings, wind signals by province, anything
  from PHIVOLCS.
- **What we keep:** PAGASA's own headline, text, level, issue and end times, and the areas,
  matched to our provinces by place code (then by name). An alert that matches no province
  is shown for the whole country.
- **Shown:** while it has not expired, has not been replaced by a newer alert, and is not a
  "final" (all-clear) message. Always above the score, never part of it.
- **Licence:** "Copyright PAGASA. Licensed under CC BY 4.0" (the feed's own rights line).
- **Limits:** a cyclone alert with wind signals over named provinces has not been seen yet.
- **Code:** `fetchers/pagasa.ts`, `jobs/ingestAlerts.ts`. By hand: `npm run ingest:alerts`.

## Official bulletin links

The status card also links to four official pages. We only link to them; nothing is fetched.

| Agency | Page |
|---|---|
| PAGASA | [Tropical cyclone bulletin](https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin) |
| PAGASA | [Flood information](https://www.pagasa.dost.gov.ph/flood) |
| PHIVOLCS | [Volcano bulletins](https://wovodat.phivolcs.dost.gov.ph/bulletin/list-of-bulletin) |
| PHIVOLCS | [Earthquake information](https://earthquake.phivolcs.dost.gov.ph/) |

The list is `BULLETIN_LINKS` in `server/src/sources.ts`.

## Adding a source

1. Add a fetcher in `server/src/fetchers/` with a zod schema, and a test with a real sample in
   `server/test/fixtures/`.
2. Add or extend a job in `server/src/jobs/` and put it in `scheduler.ts`.
3. Add its credit line to the UI and to the table in the main `README.md`, and describe it here.
