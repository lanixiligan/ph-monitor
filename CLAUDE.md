# PH Monitor — guide for Claude sessions

## What this is

A Philippines real-time risk dashboard. Phase 1: a map of provinces coloured by a 0–100 "stress
right now" score from earthquakes (USGS) and weather (Open-Meteo). Clicking the map shows a
status card with a score worked out for that exact spot.
Phase 2 (in progress, see `PLAN.md`): the server also collects disaster events (GDACS, EONET;
GDACS alert levels count in the score), storm tracks (JMA, JTWC), a 7-day outlook, disaster news
and YouTube stream links. The page does not show these yet.
Non-commercial. Plan and decisions: `PLAN.md`. Score formula: `METHODOLOGY.md`.

## Stack

TypeScript everywhere (strict). npm workspaces: `shared`, `server`, `web`.
Server: Node 24, Express, `pg`, zod, node-cron, run with `tsx` (no compile step).
Database: PostgreSQL + PostGIS in Docker, port 5433. Web: Vite, React, MapLibre.
TypeScript is pinned to 5.9.3 on purpose (do not move to 7 without asking).

## Folder map

```
shared/src/        types.ts (shared types), appInfo.ts (APP_NAME)
server/db/         schema.sql (all tables; re-runnable)
server/scripts/    migrate.ts, load-provinces.ts, load-places.ts, run-job.ts,
                   check-sources.ts, load-sample-storm.ts
server/src/        index.ts, config.ts, db.ts, heatIndex.ts, freshness.ts,
                   pointWeather.ts (on-demand weather for one spot),
                   sources.ts (every news feed and stream link, outlet categories),
                   conditions.ts (outlook, nearby events, storms, news for the card)
  fetchers/        one file per feed (fetch + zod schema): usgs, openMeteo, gdacs, eonet,
                   jma, jtwc, openMeteoDaily, openMeteoFlood, rss
  jobs/            ingestEarthquakes, ingestWeather, ingestEvents, ingestStorms,
                   ingestForecast, ingestNews, checkSources, computeScores, scheduler
  news/            keyword filter, same-story merging, province tagging
  checker/         link checks for feeds and YouTube streams
  scoring/         scoring.ts (WEIGHTS + all formulas)
  routes/          provinces.ts (map data), point.ts (score for one spot),
                   conditions.ts (events, storms, news, streams, bulletins)
server/test/       one test file per area, real feed samples in fixtures/
web/src/           App.tsx, api.ts, scoreScale.ts, mapSettings.ts, components/
data/              downloaded boundary files (git-ignored)
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
npm run typecheck        tsc over all workspaces
npm run ingest:earthquakes | ingest:weather | compute:scores   one job by hand
npm run ingest:events | ingest:storms | ingest:forecast | ingest:news
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
- The app name appears in the UI only through `APP_NAME` (`shared/src/appInfo.ts`).
- UI stays plain and neutral: no logo, no custom fonts, no colours beyond the score scale
  (`web/src/scoreScale.ts`).
- The web app talks only to our own `/api`, with one exception: the basemap tiles come straight
  from OpenFreeMap (switch: `SHOW_BASEMAP` in `web/src/mapSettings.ts`).
- `.env` is server-only and never committed. `YOUTUBE_API_KEY` is optional and never reaches
  the browser. The YouTube checker uses only 1-unit API calls (never `search.list`).
- Every news feed and stream link lives in `server/src/sources.ts`.
- Data credits (USGS, Open-Meteo CC BY 4.0, NAMRIA/PSA via OCHA CC BY 3.0 IGO, OpenStreetMap,
  GDACS CC BY 4.0, NASA EONET, JMA, JTWC, GloFAS via Open-Meteo, the news outlets) must stay
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
