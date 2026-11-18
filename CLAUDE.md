# PH Monitor — guide for Claude sessions

## What this is

A Philippines real-time risk dashboard. Phase 1: a map of provinces coloured by a 0–100 "stress
right now" score from earthquakes (USGS) and weather (Open-Meteo). Clicking the map shows a
status card with a score worked out for that exact spot.
Phase 2 (built; status of every phase in `PLAN.md`): the server also collects disaster events (GDACS, EONET;
GDACS alert levels count in the score), storm tracks (JMA, JTWC), a 7-day outlook, disaster news
and YouTube stream links. The page shows them as map layers, extra status card sections, a
headlines panel and a live news panel (YouTube streams).
Non-commercial. Plan and decisions: `PLAN.md`. Score formula: `METHODOLOGY.md`.

## Stack

TypeScript everywhere (strict). npm workspaces: `shared`, `server`, `web`.
Server: Node 24, Express, `pg`, zod, node-cron, run with `tsx` (no compile step).
Database: PostgreSQL + PostGIS in Docker, port 5433. Web: Vite, React, MapLibre.
TypeScript is pinned to 5.9.3 on purpose (do not move to 7 without asking).

## Folder map

```
shared/src/        types.ts (shared types), appInfo.ts (APP_NAME), newsTypes.ts (kinds of disaster)
server/db/         schema.sql (all tables; re-runnable)
server/scripts/    migrate.ts, load-provinces.ts, load-places.ts, run-job.ts,
                   check-sources.ts, load-sample-storm.ts, pick-weather-points.ts,
                   load-hazards.ts (Project NOAH hazard zones),
                   replay.ts (historical replay; downloads archives into data/replay/)
server/src/        index.ts, config.ts, db.ts, heatIndex.ts, freshness.ts,
                   pointWeather.ts (on-demand weather for one spot),
                   weatherPoints.ts (extra sample points, worst reading per province),
                   sources.ts (every news feed and stream link, outlet categories),
                   conditions.ts (outlook, nearby events, storms, news, official alerts),
                   placeSearch.ts (which place names match a typed text),
                   scoreHistory.ts (a history row only when a score changed),
                   hazardLoad.ts + hazardShapes.ts (NOAH file list, names, shape checks),
                   hazardZones.ts (fixed hazard map answer for one spot)
  fetchers/        one file per feed (fetch + zod schema): usgs, openMeteo, gdacs, eonet,
                   jma, jtwc, openMeteoDaily, openMeteoFlood, rss, pagasa (official
                   alerts), retry (one more try for a failed download)
  jobs/            ingestEarthquakes, ingestWeather (weather grid), ingestEvents, ingestStorms,
                   ingestAlerts, ingestForecast, ingestNews, checkSources, computeScores
                   (towns, then provinces = highest town), townInputs, scheduler,
                   due (which jobs are due; every job's interval)
  news/            keyword filter and kinds of disaster, province and town tagging,
                   checkHeadline (both together), storm names, same-story merging
  checker/         link checks for feeds and YouTube streams
  scoring/         scoring.ts (WEIGHTS + all formulas)
  replay/          replay.ts (archived records → score inputs for a past hour)
  routes/          provinces.ts (map data), point.ts (score for one spot),
                   places.ts (place search, town shapes and scores),
                   conditions.ts (events, storms, news, streams, bulletins),
                   hazards.ts (loaded hazard maps, hazard zone vector tiles)
server/test/       one test file per area, real feed samples in fixtures/
  db/              database tests (testDb.ts seeds a small map; import it first)
web/src/           App.tsx, api.ts, scoreScale.ts, mapSettings.ts, format.ts (time, number
                   and link helpers, "uploaded … ago"), useNow.ts (a clock for it), cardOrder.ts (what the status card shows where), mapOverlays.ts + stormGeo.ts (event markers and
                   storm tracks), hazardOverlay.ts + hazardLabels.ts (NOAH hazard zones),
                   styles.css (all colours and layout), palette.ts (CSS
                   colours for the map), components/
  i18n/            en.ts and fil.ts (every string the reader sees), language switch
  theme/           light/dark choice (sets <html data-theme>), theme switch
data/              downloaded boundary files (git-ignored)
docs/              reference pages: data sources, news and streams, how it works, limits
```

## Commands (from the project root)

```
npm run db:up            start the database
npm run migrate          apply schema.sql
npm run load-provinces   load province boundaries
npm run load-places      load city and municipality boundaries
npm run dev:server       API + scheduler on :3001
npm run dev:web          map on :5173
npm test                 tests
npm run test:db          database tests (real SQL, separate phmonitor_test database; needs db:up)
npm run replay           replay past disasters through the score formula, print a table
npm run measure:news     check the news rules against the hand-labelled headlines
npm run typecheck        tsc over all workspaces
npm run ingest:earthquakes | ingest:weather | compute:scores   one job by hand
npm run ingest:events | ingest:storms | ingest:forecast | ingest:news | ingest:alerts
npm run weather-points   pick extra weather points for big provinces (after load-places)
npm run load-hazards -- stormSurge   load Project NOAH zones (or `landslide`); restart the server after
npm run check:sources    check every feed and stream link, print a table
npm run sample-storm     load a sample storm track (add `-- remove` to delete it)
```

## Conventions

- Strict TypeScript, simple types: plain `type` definitions, no advanced generics.
- Feed data is validated with zod before it is saved; bad records are skipped and logged.
- All scoring weights and formulas live only in `server/src/scoring/scoring.ts` (pure functions,
  tests first). If the formula changes, update `METHODOLOGY.md` too.
- Types used by both server and web go in `shared/src/types.ts`.
- Small files, short comments. Explain each TypeScript-specific piece of syntax in one line the
  first time it appears in a file.
- Every string the reader sees lives in `web/src/i18n/en.ts` and `fil.ts` (same keys; a missing
  key fails the typecheck). The server sends score reasons as message keys plus numbers
  (`ScoreReason`), never as sentences. The Filipino text is a draft until the owner reviews it.
- The app name appears in the UI only through `APP_NAME` (`shared/src/appInfo.ts`).
- UI look ("sea chart"): cool sea-and-ink colours (plus one red, `--live`, only for the LIVE stream badge), defined once as CSS variables at the top of
  `web/src/styles.css`, with a light set and a dark set (`[data-theme='dark']`). Never write a
  hex colour anywhere else: the map reads the variables through `web/src/palette.ts`. The score
  scale (`web/src/scoreScale.ts`) is the only warm colour on the page; it has a light version
  (darker = worse) and a dark version (brighter = worse). Errors and stale data use ink, the
  `WarnIcon` and words, never red or amber. Two fonts, Barlow Condensed (titles, numbers) and Atkinson Hyperlegible (text), come
  from `@fontsource` npm packages and ship with the app; never load a font from a font site.
- Layout: top bar, then three columns: on the left the spot panel with the legend under it
  (its tick boxes switch map layers; its title folds it away), the map in the middle with
  the place search (top left) and the zoom and locate buttons (top right), and live news
  plus headlines on the right. Along the bottom the notice plus a link to the
  credits page (`/credits`, `web/src/components/CreditsPage.tsx`). Under 900px wide it
  is one scrolling page.
- The web app talks only to our own `/api`, with two exceptions: the basemap tiles come straight
  from OpenFreeMap (switch: `SHOW_BASEMAP` in `web/src/mapSettings.ts`), and a video plays in
  YouTube's own player, embedded from `youtube-nocookie.com` only after the reader clicks Play.
  Raw TV feeds (`.m3u8`) are never re-streamed.
- `.env` is server-only and never committed. `YOUTUBE_API_KEY` is optional and never reaches
  the browser. The YouTube checker uses only 1-unit API calls (never `search.list`).
- Every news feed and stream link lives in `server/src/sources.ts`.
- Unknown is never calm: a signal that could not be checked is `null`, the score is then
  "at least N" and the province is striped. Feed limits live in `server/src/freshness.ts`.
- Official alerts (PAGASA) are shown above the score in the agency's own words and never
  change the score. Sections are tagged Official, Global assessment or Model estimate.
- Data credits (USGS, Open-Meteo CC BY 4.0, NAMRIA/PSA via OCHA CC BY 3.0 IGO, OpenStreetMap,
  GDACS CC BY 4.0, NASA EONET, JMA, JTWC, GloFAS via Open-Meteo, PAGASA CC BY 4.0, Project NOAH ODbL,
  the news outlets) must stay
  visible in the UI and README. A new source gets its credit line in both.
- The "not an official warning service" notice must stay on the page footer, the status card
  (`web/src/components/Disclaimer.tsx`), the README and METHODOLOGY.

## Working style

- Explain in plain language and keep it short.
- Work in small steps; after each one say what to run and what should appear.
- Run the checks yourself and show the output before claiming something works.
- Keep docs short.

## Git

Commit messages: Conventional Commits subject under 72 characters, e.g.
`feat(db): add PostGIS schema with 7 tables`, then a blank line and 2–4 bullets saying what
changed and why.
