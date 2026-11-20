# Data sources

Every feed the server reads. None needs an API key. Each has one fetcher file in
`server/src/fetchers/`, which downloads the data and checks it with zod before anything is
saved. Records that fail the check are skipped and logged.

News feeds and YouTube streams are on their own page: [news-and-streams.md](news-and-streams.md).

## At a glance

| Data | Source | Fetched | Changes the score? |
|---|---|---|---|
| Earthquakes | USGS | every 15 min | Yes |
| Current weather | Open-Meteo | every 2 hours | Yes |
| Official alerts | PAGASA public alert feed | every 15 min | No, shown above the score |
| Disaster events with alert levels | GDACS | every 30 min | Yes (typhoon, flood, volcano, wildfire) |
| Natural events | NASA EONET | every 30 min | No, shown only |
| Storm tracks | JMA, with JTWC as backup | every 30 min | No, shown only |
| 7-day outlook: rain and gusts | Open-Meteo | every 6 hours | No, shown only |
| 7-day outlook: river flow | Open-Meteo Flood API (GloFAS) | every 6 hours | No, shown only |
| Heat index map | ECMWF, DWD ICON and NOAA GFS models, via Open-Meteo | every 12 hours | No, shown only |
| Heat index forecast (PAGASA iHeatMAP) | PAGASA's internal iHeatMAP API and files | checked every 3 hours | No, shown only |
| Rain forecast field (Typhoon view) | ECMWF model, via Open-Meteo | every 12 hours | No, shown only |
| Boundaries | NAMRIA and PSA via OCHA | once, by hand | Used to measure distances |
| Landslide and storm surge hazard maps | Project NOAH | once, by hand | No, shown only |
| Basemap tiles | OpenFreeMap | by the browser | No |

## Earthquakes: USGS

- **Address:** `https://earthquake.usgs.gov/fdsnws/event/1/query` ([docs](https://earthquake.usgs.gov/fdsnws/event/1/))
- **What we ask for:** magnitude 4.0 and above, the last 7 days, in a box around the
  Philippines (latitude 4.5 to 21.5, longitude 116 to 127) widened by 4 degrees on every side,
  so a strong quake just outside the country is not missed.
- **What we keep:** id, magnitude, depth, place text, time, link, epicentre, and the original
  record. Each quake is linked to the provinces within its reach.
- **Shown from the original record:** PAGER alert, strongest estimated shaking (MMI) and the
  tsunami information flag, read and checked when the card asks (`quakeImpact.ts`). Shown only,
  not scored.
- **Map:** the quakes inside the score's 72-hour window are drawn as markers sized by magnitude
  (`GET /api/quakes`; a legend tick box, ticked by the Earthquake view).
- **Licence:** public domain.
- **Limits:** USGS is a global catalogue. Near the Philippines it reliably reports only about
  magnitude 4 and above, sometimes late. PHIVOLCS records many more.
- **Code:** `fetchers/usgs.ts`, `jobs/ingestEarthquakes.ts`.

## Current weather: Open-Meteo

- **Address:** `https://api.open-meteo.com/v1/forecast` ([docs](https://open-meteo.com/en/docs))
- **What we ask for:** temperature, humidity and hourly rain at about 600 points (built by
  `npm run weather-points`): a 0.25° grid over the land, each province's own point, and a point
  for any town more than 30 km from the others. Up to 50 points go in one request, 10 seconds
  apart, so a run takes about 2 minutes and a day about 7,200 of Open-Meteo's 10,000 calls.
  A town's reading is the worst of its points (most rain, hottest point); so is a province's.
- **What we keep:** temperature, humidity, rain in the last hour and last 24 hours, and a heat
  index we compute ourselves (`server/src/heatIndex.ts`).
- **Also on demand:** when a reader clicks the map, weather for that spot is fetched, snapped
  to a 0.05° grid (about 5 km) and reused for 30 minutes (`server/src/pointWeather.ts`).
- **Licence:** CC BY 4.0. The free tier is for non-commercial use only.
- **Limits:** the values are **modelled**, not measured by a station. No wind is fetched.
- **Map:** the Flood view colours towns by the rain part of their score, worked out from these
  readings (null rain = striped).
- **Code:** `fetchers/openMeteo.ts`, `jobs/ingestWeather.ts`, `weatherPoints.ts`.

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
  when JMA fails, and for any storm JMA does not give us (not listed, or a file we could not
  read). It has the current and forecast positions, but no past track, pressure
  or uncertainty circle.
- **What we keep:** name, category, whether it is still active, and each track point (time,
  position, pressure, wind in knots, uncertainty radius in km).
- **Licence:** JMA terms of use, credit required. JTWC is public domain.
- **Limits:** no storm was active when the JMA fetcher was written, so some of its format is
  inferred and read tolerantly. `npm run sample-storm` loads a clearly labelled fake storm for
  testing the map.
- **Map:** drawn as tracks and forecasts (a legend tick box), ticked by the Typhoon view. The
  track points carry wind, but the weather grid has none, so towns get no wind colours yet.
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

## Heat index map: ECMWF, DWD ICON and NOAA GFS via Open-Meteo

- **Address:** `https://api.open-meteo.com/v1/forecast` with the models named in `models=`,
  never Open-Meteo's default blend.
- **What we ask for:** hourly temperature and humidity for the next 48 hours, for all three
  models in one request, at the same ~600 weather points as the score's weather. 50 points per
  request, 20 seconds apart (half the weather job's pace, so the two together stay well under
  Open-Meteo's 600 calls a minute; a run takes about 4 minutes). Three models cost the same as
  one, so a run is about 600 calls and a day (two runs) about 1,200. With the weather job and
  the outlook that is about 9,100 of the 10,000 a day, leaving about 900 for card clicks. A
  failed run is not tried again for 12 hours, so failures never cost extra calls.

| Model | Open-Meteo name | Grid | New model run | Licence |
|---|---|---|---|---|
| ECMWF IFS HRES (the default) | `ecmwf_ifs` | 9 km | every 6 hours | CC BY 4.0 (ECMWF open data since 1 October 2025) |
| DWD ICON, global, native grid | `dwd_icon_global_native` | about 13 km | every 6 hours | CC BY 4.0 (DWD open data) |
| NOAA GFS | `ncep_gfs_global` | 0.11° (about 13 km) | every 6 hours | Public domain |

- **What we keep:** per model, point and hour: temperature, humidity and a heat index we work
  out ourselves (`server/src/heatIndex.ts`, not Open-Meteo's "apparent temperature"). Only the
  newest good run of each model is kept. A model counts only when at least 90% of points
  answered; otherwise its previous run stays. Hours more than 6 hours past are deleted.
- **Fetched:** every 12 hours, so the map can be up to 12 hours behind the newest model run.
  Each run holds 48 hours, so the current hour is always in it.
- **Credit, in each provider's own words:**
  - ECMWF: "based on data and products of the European Centre for Medium-Range Weather
    Forecasts (ECMWF)", source www.ecmwf.int, CC BY 4.0, and a note that we changed the data
    (we work out the heat index). From ECMWF's
    [licence page](https://apps.ecmwf.int/datasets/licences/general).
  - DWD: "Based on data from Deutscher Wetterdienst, gridded data reproduced graphically", placed
    next to the data. From DWD's
    [source templates](https://www.dwd.de/EN/service/legal_notice/templates_dwd_as_source.html).
  - NOAA: public domain; no wording is asked for, and the NOAA name must not suggest that NOAA
    endorses the app ([NWS disclaimer](https://www.weather.gov/disclaimer)).
  - Open-Meteo: "Weather data by Open-Meteo.com", with a link, CC BY 4.0.
- **Limits:** modelled, not measured. Open-Meteo marks the old ICON global grid "Discontinued
  2026-11-30"; we use the native grid. A model that sends nothing shows "no data" while the
  others carry on.
- **Code:** `shared/src/heatModels.ts` (the model list), `fetchers/openMeteoHeat.ts`,
  `jobs/ingestHeatMap.ts`, `server/src/heatMap.ts`, `server/src/routes/heatmap.ts`. By hand:
  `npm run ingest:heatmap`.

## Heat index forecast: PAGASA iHeatMAP

- **What:** PAGASA's own heat index forecast, built on ECMWF data, as GeoTIFF pictures
  (945 x 1659 squares of about 1.1 km). It is the "PAGASA" source in the Heat view.
- **Addresses:** the API at `https://iheatmap.pagasa.dost.gov.ph/internal/api/` (`current-date`,
  `tif-files`, `presigned-tif`) and the files from `https://iheatmap.s3.ap-southeast-1.amazonaws.com/`.
  No key. The word "internal" in the path means it is not a published feed: it may change
  or stop without notice. If it does, the PAGASA source goes out of date and the other
  sources carry on.
- **How often:** we check every 3 hours and download only when a new forecast appears (around
  21:00 PH time, dated the next day). A forecast has 35 files: days 1 to 3 every hour from
  8 AM to 5 PM, day 4 at 8, 11, 14 and 17, day 5 at 8 AM. About 150 KB each.
- **What we keep:** per town, the hottest square inside it (a small town with no square
  centre takes the squares it touches). A forecast is saved only when all files came and at
  least 90% of towns have a value; otherwise the old one stays. We keep the newest forecast
  and drop ones older than yesterday. Today's hours come from yesterday's forecast.
- **Limits:** about 20 small island towns and Kalayaan have no PAGASA value and show as unknown.
  Fresh while the newest forecast is dated today or later; stale after 30 hours.
- **Licence:** no terms page. Under RA 8293 Sec. 176 there is no copyright in Philippine
  government works; prior approval is needed only for use for profit. This app is
  non-commercial, so we credit: "Heat index forecast: DOST-PAGASA iHeatMAP
  (iheatmap.pagasa.dost.gov.ph), based on ECMWF data. Used without changes, for a
  non-commercial purpose."
- **Code:** `fetchers/pagasaHeat.ts`, `pagasaGrid.ts`, `pagasaCells.ts`, `jobs/ingestPagasaHeat.ts`,
  `heatMap.ts`. By hand: `npm run ingest:pagasaheat`.

## Rain forecast field: ECMWF via Open-Meteo (Typhoon view)

- **Address:** `https://api.open-meteo.com/v1/forecast` with `models=ecmwf_ifs`,
  `hourly=precipitation`, `forecast_days=7`.
- **What we ask for:** hourly rain for the next 7 days at 256 fixed points: a 1.5° grid (about
  165 km) from 114°E 4°N to 136.5°E 26.5°N, which covers the Philippine Area of Responsibility
  and a small margin (`RAIN_GRID` in `server/src/rainForecast.ts`). 50 points per request, 20
  seconds apart; a run takes about a minute and costs 256 calls. It runs every 12 hours, right
  after the heat map (never at the same time): 512 calls a day, about 9,600 in total with the
  other Open-Meteo jobs. A finer grid does not fit the 10,000 a day.
- **What we keep:** each point's hourly rain in mm (missing hours stay missing). Only the newest
  good run is kept, and only when at least 90% of points answered. A failed run is not tried
  again for 12 hours.
- **What the map shows:** the rain in each 3 hours (00, 03, 06 … UTC), from the period that holds
  now to the end of the 7 days. A period with a missing hour is "no forecast", never a smaller
  total. From about day 4 ECMWF gives 3-hour (later 6-hour) totals, which Open-Meteo spreads
  evenly over the hours.
- **Licence and credit:** as for the ECMWF heat map source above (CC BY 4.0; we changed the data
  by adding the hours up).
- **Limits:** a model estimate, not a PAGASA forecast. The points are far apart, so the field
  shows the broad pattern only; it is smoothed between points.
- **Never part of the score.**
- **Code:** `fetchers/openMeteoRain.ts`, `jobs/ingestRainForecast.ts`, `rainForecast.ts`.

## Boundaries: NAMRIA and PSA via OCHA

- **Address:** GeoJSON files from
  [faeldon/philippines-json-maps](https://github.com/faeldon/philippines-json-maps),
  downloaded once by `npm run load-provinces` and `npm run load-places` and kept in `data/`
  (git-ignored).
- **What we keep:** province shapes (medium resolution) and city and municipality shapes, each
  with its official PSGC code.
- **Licence:** boundaries CC BY 3.0 IGO; the repository is MIT.
- **Code:** `server/scripts/boundaryFiles.ts`, `load-provinces.ts`, `load-places.ts`.

## Hazard maps: Project NOAH

- **What it is:** Project NOAH's fixed hazard maps (UP NOAH Center): landslide zones by UP
  NIGS, and storm surge zones by PAGASA with UP NIGS. Each zone is class 1 (low), 2 (medium)
  or 3 (high). The province files are dated November 2021.
- **Address:** downloaded once, by hand (`npm run load-hazards`), from the Hugging Face mirror
  `bettergovph/project-noah-hazard-maps`. Its files are byte for byte the same as NOAH's own
  download folder (linked from [noah.up.edu.ph](https://noah.up.edu.ph/)), and each download
  is checked against the mirror's SHA-256 hash. One zip per province; each is deleted after
  loading.
- **Storm surge levels**, in NOAH's wording: SSA 1 up to 2 m, SSA 2 up to 3 m, SSA 3 up to
  4 m, SSA 4 more than 4 m. These are **scenarios** ("if a surge this high comes"), **not a
  forecast**. The map draws SSA 4, the widest; the status card lists all four.
- **What we keep:** the zones of each province, simplified: pieces under 1,000 m² are dropped
  and edges move about 20 m. A list of which province files are loaded tells "no hazard map
  here" apart from "not in a zone".
- **Shown:** as striped map layers, storm surge from zoom 4 (the whole country) and landslide
  from zoom 9 (tick boxes in the legend, off at first), and
  as a "Hazard map" block on the status card. The Storm surge view (and the Typhoon view)
  ticks the storm surge layer; that view can be pressed only once the map is loaded. Never
  part of the score.
- **Licence:** Open Data Commons Open Database License
  ([ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)). Credit "Project NOAH and its
  contributors". The simplified shapes our API sends out are offered under the same licence.
- **Papers to cite** (listed in NOAH's storm surge readme):
  - Lapidez et al. (2015), Identification of storm surge vulnerable areas in the Philippines
    through the simulation of Typhoon Haiyan-induced storm surge levels over historical storm
    tracks. *Natural Hazards and Earth System Sciences* 15, 1473–1481,
    doi:10.5194/nhess-15-1473-2015.
  - Lagmay and Kerle (2015), Typhoons: Storm-surge models helped for Hagupit. *Nature* 519, 414,
    doi:10.1038/519414b.
  - Tablazon et al. (2015), Probabilistic storm surge inundation maps for Metro Manila based on
    Philippine public storm warning signals. *Natural Hazards and Earth System Sciences* 15,
    557–570, doi:10.5194/nhess-15-557-2015.
  - Lagmay et al. (2015), Devastating storm surges of Typhoon Haiyan. *International Journal of
    Disaster Risk Reduction* 11, 1–12.
- **Limits:** fixed maps, not live. Mountain provinces are mostly "high" landslide (most of
  Benguet, for example), so the card says "high" for most spots there: that is what the map
  says. A province with no file loaded shows "no hazard map here", never "safe".
- **Code:** `server/scripts/load-hazards.ts`, `server/src/hazardLoad.ts` (file list, name
  matching), `server/src/hazardShapes.ts` (reading and checking the shapes),
  `server/src/hazardZones.ts`, `server/src/routes/hazards.ts`, `web/src/hazardOverlay.ts`,
  `web/src/components/HazardZones.tsx`.

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
