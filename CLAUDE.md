# PH Monitor — guide for Claude sessions

## What this is

A Philippines real-time risk dashboard. Phase 1: a map of provinces coloured by a 0–100 "stress
right now" score from earthquakes (USGS) and weather (Open-Meteo), with a status card on click.
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
server/scripts/    migrate.ts, load-provinces.ts, run-job.ts
server/src/        index.ts, config.ts, db.ts, heatIndex.ts
  fetchers/        usgs.ts, openMeteo.ts (fetch + zod schema)
  jobs/            ingestEarthquakes, ingestWeather, computeScores, scheduler
  scoring/         scoring.ts (WEIGHTS + all formulas)
  routes/          provinces.ts
server/test/       scoring.test.ts, fetchers.test.ts
web/src/           App.tsx, api.ts, scoreScale.ts, components/
data/              downloaded boundary files (git-ignored)
```

## Commands (from the project root)

```
npm run db:up            start the database
npm run migrate          apply schema.sql
npm run load-provinces   load province boundaries
npm run dev:server       API + scheduler on :3001
npm run dev:web          map on :5173
npm test                 tests
npm run typecheck        tsc over all workspaces
npm run ingest:earthquakes | ingest:weather | compute:scores   one job by hand
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
- The web app talks only to our own `/api`; `.env` is server-only and never committed.
- Data credits (USGS, Open-Meteo CC BY 4.0, NAMRIA/PSA via OCHA CC BY 3.0 IGO, OpenStreetMap)
  must stay visible in the UI and README.
- The "not an official warning service" notice must stay on the page footer, the status card
  (`web/src/components/Disclaimer.tsx`), the README and METHODOLOGY.

## Working with the owner

- Beginner developer, new to TypeScript: explain in plain language, keep it short.
- Work in small steps; after each one say what to run and what should appear.
- Run the checks yourself and show the output before claiming something works.
- Prefers short docs.

## Git

Local commits only. **No remote yet: do not create a GitHub repository, add a remote, or push.**

Commit messages: Conventional Commits subject under 72 characters, e.g.
`feat(db): add PostGIS schema with 7 tables`, then a blank line and 2–4 bullets saying what
changed and why.
