# Heat Index Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Heat map" button that recolours every town by the heat index from a chosen
weather model (ECMWF, ICON or GFS), switchable while it is on, without touching the score.

**Architecture:** A new job, run every 12 hours, fetches temperature and humidity for all 599
`weather_points` from Open-Meteo for all three models in one request. It stores the next 48
hours per model in `heat_forecasts`. `GET /api/heatmap?model=` gives each town's hottest
linked point for the current hour, and each province's hottest town. The web app keeps the
existing province and town layers, and swaps the score colours for heat band colours while
the heat map is on.

**Tech Stack:** TypeScript (strict), Express, `pg`, zod, PostGIS, React, MapLibre, node:test via tsx.

**Spec:** `PLAN.md`, section "Phase 4 — heat index map (approved 2026-11-19)". Read it first.

## Global Constraints

- Never change the score. No scoring code reads `heat_forecasts`. `scoring.ts` gains only a
  read-only export, `heatBandOf`.
- Open-Meteo request: `hourly=temperature_2m,relative_humidity_2m`, `models=` all three ids
  joined by commas, `forecast_hours=48`, `timeformat=unixtime`, 50 points per request, 10 s
  between requests.
- Model ids, exactly: `ecmwf_ifs` (9 km, default), `dwd_icon_global_native` (13 km),
  `ncep_gfs_global` (13 km).
- Heat index comes only from `heatIndexC()` in `server/src/heatIndex.ts`, never from
  Open-Meteo's `apparent_temperature`.
- Job every 720 minutes. Source `open-meteo-heat`. Feed `heatMap`, stale after 25 × 60 minutes.
  A model's run counts only when `isFreshEnough(saved, total)` is true.
- Unknown is never calm. A missing value is `null` and is drawn with the existing striped
  "no data" look. Below 27 °C gets the neutral `--heat-below` fill, never an empty one.
- Colours only as CSS variables in `web/src/styles.css` (light and dark sets), read through
  `web/src/palette.ts`.
- Every string the reader sees lives in `web/src/i18n/en.ts` and `fil.ts`. Filipino lines get
  a `// REVIEW` mark.
- Explain each new piece of TypeScript syntax in one line the first time it appears in a file.
  Keep comments short (CLAUDE.md).
- Commit only when the owner asks. Each task ends with checks, not a commit.

## Review Focus

1. **A model that sends only nulls** (ICON may be retired). The other two must still save, and
   that model must answer `fetchedAt: null`, not an error. Test it in Task 3.
2. **The page loaded before the first heat run** (empty table). The panel must say "no data
   yet", and the map must show stripes, not cool colours. Test it in Tasks 4 and 5.
3. **A forecast older than 48 hours** (the job stopped). There is no row for the current hour,
   so every town must be null and `isStale` true. Test it in Task 4.
4. **Switching models quickly.** An older answer arriving after a newer one must not paint the
   map. Handle it in Task 6 by ignoring an answer whose `model` is not the one chosen now.
5. **Re-running `npm run weather-points`.** Its `TRUNCATE` must not fail on the new foreign
  key. Fix it in Task 3: add `CASCADE` to that statement. The heat table empties, and the next
  heat run fills it again.

---

### Task 1: Shared types and the model list

**Files:**
- Create: `shared/src/heatModels.ts`
- Modify: `shared/src/types.ts` (add the types below; add `'heatMap'` to `FeedId`)
- Modify: `shared/src/index.ts` (re-export the model list)
- Modify: `web/src/i18n/en.ts` and `fil.ts`: `feeds.heatMap` only ("heat map"), so the
  typecheck still passes after the `FeedId` change

**Interfaces (produces):**
```ts
// types.ts
export type HeatModelId = 'ecmwf_ifs' | 'dwd_icon_global_native' | 'ncep_gfs_global';
export type HeatBandName = 'caution' | 'extreme caution' | 'danger' | 'extreme danger';
/** One town's or province's heat index for the hour shown. null = unknown. */
export type HeatValue = { psgc: number; heatIndexC: number | null; band: HeatBandName | null };
/** GET /api/heatmap?model= */
export type HeatMapData = {
  model: HeatModelId;
  /** The newest good run for this model; null = none yet. */
  fetchedAt: string | null;
  isStale: boolean;
  /** The hour shown (the current hour, ISO); null when nothing is stored for it. */
  validAt: string | null;
  places: HeatValue[];
  provinces: HeatValue[];
};
// heatModels.ts
export type HeatModel = { id: HeatModelId; km: number };
export const HEAT_MODELS: HeatModel[]; // ecmwf_ifs 9, dwd_icon_global_native 13, ncep_gfs_global 13
export const DEFAULT_HEAT_MODEL: HeatModelId; // 'ecmwf_ifs'
```

- [ ] **Step 1:** Add the types and the list. Re-export with `export { HEAT_MODELS, DEFAULT_HEAT_MODEL } from './heatModels.ts'` and `export type { HeatModel } from './heatModels.ts'`.
- [ ] **Step 2:** Run `npm run typecheck`. Expected: no errors.

---

### Task 2: Fetcher (server)

**Files:**
- Create: `server/src/fetchers/openMeteoHeat.ts`
- Create: `server/test/fixtures/heat/three-models.json` (a real answer, see Step 1)
- Create: `server/test/fixtures/heat/README.md` (one line: where and when it was fetched)
- Test: `server/test/heatMap.test.ts`

**Interfaces:**
- Consumes: `HeatModelId` (Task 1); `fetchWithRetry`, `RetryOptions` from `./retry.ts`;
  `Point` and `OpenMeteoOptions` from `./openMeteo.ts`.
- Produces:
```ts
/** One point's 48 hours. A model is left out when every value it sent is null. */
export type HeatLocation = {
  times: Date[];
  // `Partial<Record<K, V>>` = an object that may have any of the keys K.
  models: Partial<Record<HeatModelId, { tempC: (number | null)[]; humidityPct: (number | null)[] }>>;
};
export function parseHeatLocation(json: unknown, models: HeatModelId[]): HeatLocation | null;
export async function fetchOpenMeteoHeat(points: Point[], models: HeatModelId[], options?: OpenMeteoOptions): Promise<(HeatLocation | null)[]>;
```

- [ ] **Step 1: Save the fixture.** Make one live request for two points (Manila 14.6,121.0 and
  Cebu 10.3,123.9), with the parameters from Global Constraints. Save the JSON answer as
  `three-models.json`. This costs 2 calls.
- [ ] **Step 2: Write the failing tests** in `server/test/heatMap.test.ts`:
  - `parseHeatLocation: reads suffixed lists for three models`: from the fixture's first
    location, `times.length === 48`, and all three models are present with 48 values each.
  - `parseHeatLocation: one model with plain names`: a hand-made object whose `hourly` has
    `time`, `temperature_2m` and `relative_humidity_2m`, with `models = ['ecmwf_ifs']`. The
    values come out under `ecmwf_ifs`.
  - `parseHeatLocation: a model of only nulls is left out`: copy the fixture and set every ICON
    value to null. `models.dwd_icon_global_native === undefined`, and the other two are present.
  - `parseHeatLocation: lists of different lengths give null`.
  - `fetchOpenMeteoHeat: one failed request leaves its points null`: pass a pretend `fetcher`
    that fails for the second chunk, and give it 60 points. The first 50 are not null and the
    last 10 are null.
- [ ] **Step 3:** Run `npm test --workspace server`. Expected: the new tests FAIL (the module is missing).
- [ ] **Step 4: Implement.**
  - Follow `fetchOpenMeteo`'s chunk loop: list or single object; the count must match; a failed
    chunk becomes nulls; throw only if every request failed.
  - The zod schema is built per call from `models`. For each model, accept
    `temperature_2m_<id>`, or the plain `temperature_2m` when only one model was asked for.
- [ ] **Step 5:** Run `npm test --workspace server`. Expected: all pass.

---

### Task 3: Table, job, schedule, freshness (server)

**Files:**
- Modify: `server/db/schema.sql` (append the tables below)
- Modify: `server/scripts/pick-weather-points.ts` (`TRUNCATE ... RESTART IDENTITY CASCADE`)
- Create: `server/src/jobs/ingestHeatMap.ts`
- Modify: `server/src/jobs/due.ts` (`JobName` gains `'heatMap'`; rule `{ job: 'heatMap', everyMinutes: 720, sources: ['open-meteo-heat'], needs: 'all' }`; update the budget comment: about 1,198 calls a day)
- Modify: `server/src/jobs/scheduler.ts` (extras cycle: `if (wanted.includes('heatMap')) await runJob('heat map', ingestHeatMap);`)
- Modify: `server/src/freshness.ts` (`{ id: 'heatMap', sources: ['open-meteo-heat'], staleAfterMinutes: 25 * 60 }`, after `riverFlow`)
- Modify: `server/scripts/run-job.ts` (job `heatmap`), `server/package.json` and root `package.json` (`ingest:heatmap`)
- Modify: `server/test/due.test.ts` and `server/test/freshness.test.ts` if they list every job or feed
- Test: `server/test/db/heatMap.db.test.ts`

```sql
-- Heat index forecasts per weather model (display only; the score never reads this).
CREATE TABLE IF NOT EXISTS heat_forecasts (
  model        TEXT NOT NULL,
  point_id     INTEGER NOT NULL REFERENCES weather_points ON DELETE CASCADE,
  valid_at     TIMESTAMPTZ NOT NULL,
  temp_c       REAL NOT NULL,
  humidity_pct REAL NOT NULL,
  heat_index_c REAL NOT NULL,
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (model, point_id, valid_at)
);
-- Each model's last good run (like fetch_runs, one row per model).
CREATE TABLE IF NOT EXISTS heat_runs (
  model      TEXT PRIMARY KEY,
  last_ok_at TIMESTAMPTZ NOT NULL,
  last_saved INTEGER NOT NULL,
  last_total INTEGER NOT NULL
);
```

**Interfaces:**
- Consumes: `fetchOpenMeteoHeat`, `HeatLocation` (Task 2); `WeatherPoint` from
  `./ingestWeather.ts`; `isFreshEnough`; `heatIndexC`; `HEAT_MODELS`.
- Produces:
```ts
export async function ingestHeatMap(): Promise<void>;
/** Saves one run; split out so a test can call it without the network. */
export async function saveHeatRun(points: WeatherPoint[], locations: (HeatLocation | null)[], models: HeatModelId[]): Promise<void>;
```
- Rules for `saveHeatRun`, per model:
  - A point is "saved" when it has at least one hour with both values.
  - If `isFreshEnough(saved, total)`: in one transaction, delete that model's rows, insert the
    new hours (skip hours with a null), and upsert `heat_runs`.
  - Otherwise leave that model's old rows and `heat_runs` row alone, and log a warning.
  - After all models: delete rows with `valid_at < now() - interval '6 hours'`.
  - If at least one model was good, upsert `fetch_runs` `open-meteo-heat`.
  - Throw if no point answered for any model.

- [ ] **Step 1: Write the failing database tests** (`heatMap.db.test.ts`; seed three points
  with `addTownWeather`, or plain inserts into `weather_points`):
  - `saveHeatRun: stores 48 hours per model and marks the run`: there are rows for all three
    models, and `heat_runs` has three rows.
  - `saveHeatRun: a second run replaces the first`: after the second run, the first run's
    `fetched_at` is gone for that model.
  - `saveHeatRun: a model of only nulls keeps its old rows and the others save`: ICON is left
    out of every location. The ICON rows from an earlier run are still there, and the ECMWF
    rows are new.
  - `saveHeatRun: a thin run (under 90%) does not mark the feed fresh`.
- [ ] **Step 2:** Run `npm run test:db`. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement the schema, the job and the wiring listed under Files.
- [ ] **Step 4:** Run `npm run test:db` and `npm test`. Expected: all pass (including due and freshness).

---

### Task 4: Route (server)

**Files:**
- Modify: `server/src/scoring/scoring.ts`: add only `export function heatBandOf(heatIndexC: number): string | null { return nameFor(WEIGHTS.heat.bands, heatIndexC); }`
- Create: `server/src/heatMap.ts`
- Create: `server/src/routes/heatmap.ts`
- Modify: `server/src/index.ts`: `app.use('/api/heatmap', heatmapRouter)`, before the `/api` conditions router
- Test: `server/test/db/heatMap.db.test.ts` (same file as Task 3), `server/test/heatMap.test.ts`

**Interfaces:**
- Produces:
```ts
// heatMap.ts
export function bandOf(heatIndexC: number | null): HeatBandName | null; // null below 27 or for null
export async function getHeatMap(model: HeatModelId, now?: Date): Promise<HeatMapData>;
// routes/heatmap.ts
export const heatmapRouter: Router; // GET /?model=<HeatModelId>; missing model = DEFAULT_HEAT_MODEL; unknown = 400
```
- SQL rules:
  - The hour shown is `date_trunc('hour', now)`.
  - A town's value is the max of `heat_index_c` over its `place_weather_points` at that hour,
    or null when none of its points has a row.
  - A province's value is the max over its towns (`places.province_psgc`). Every town and
    every province is listed.
  - `fetchedAt` is `heat_runs.last_ok_at`.
  - `isStale` is true when `fetchedAt` is null, older than 25 h, or no row exists for the hour
    shown.
  - Cache header: `public, max-age=300`.

- [ ] **Step 1: Write the failing tests.**
  - Pure (`heatMap.test.ts`): `bandOf(26.9) === null`, `bandOf(27) === 'caution'`,
    `bandOf(41.9) === 'extreme caution'`, `bandOf(52) === 'extreme danger'`,
    `bandOf(null) === null`.
  - Database:
    - `getHeatMap: a town takes its hottest point`: two points at 35 and 43 give 43, band
      `'danger'`.
    - `getHeatMap: a point with no row this hour makes a town null`: the town's only point has
      rows for other hours only.
    - `getHeatMap: empty table`: `fetchedAt === null`, `isStale === true`, every value is null.
    - `getHeatMap: old forecast`: all rows are more than 48 h old, so `validAt === null` and
      `isStale === true`.
    - `GET /api/heatmap?model=nope` gives 400.
    - `GET /api/heatmap` with no model gives `model === 'ecmwf_ifs'`.
- [ ] **Step 2:** Run both test commands. Expected: the new tests FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`, `npm run test:db` and `npm run typecheck`. Expected: all pass.

---

### Task 5: Heat colours (web, pure)

**Files:**
- Modify: `web/src/styles.css`: add `--heat-below`, `--heat-caution`, `--heat-extreme-caution`,
  `--heat-danger` and `--heat-extreme-danger` to the light set and the dark set.
  - Below 27 °C: a pale ink tint.
  - The four bands: yellow → orange → red → dark red.
  - In the dark set: brighter = worse, as with the score scale.
  - Each must stay readable under the 0.45–0.8 fill opacity used by the map.
- Modify: `web/src/palette.ts`: `Palette` gains `heat: { below: string; bands: string[] }`
  (bands in the order caution, extreme caution, danger, extreme danger).
- Create: `web/src/heatColors.ts`
- Test: `web/test/heatColors.test.ts`

**Interfaces:**
- Consumes: `HeatMapData`, `HeatValue`, `HeatBandName` (Task 1); `ProvinceCollection`,
  `PlaceCollection` from `./api.ts`.
- Produces (the `palette` is passed in, so tests need no browser):
```ts
export function heatColor(value: HeatValue | undefined, palette: Palette): { color: string; noData: boolean };
export function withProvinceHeat(data: ProvinceCollection, heat: HeatMapData, palette: Palette): ProvinceCollection;
export function withTownHeat(shapes: PlaceCollection, heat: HeatMapData, palette: Palette): PlaceCollection;
```
- The returned features keep their own properties and set `color`, `noData`, `incomplete: false`,
  `heatIndexC` and `band`, so the existing fill, stripe and hover code works unchanged.

- [ ] **Step 1: Write the failing tests** (a fixed test palette object):
  - `heatColor: each band gets its colour`.
  - `heatColor: below 27 gets palette.heat.below and noData false`.
  - `heatColor: null or missing gives noData true`.
  - `withTownHeat: a town missing from heat.places is noData`.
- [ ] **Step 2:** Run `npm test --workspace web`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test --workspace web` and `npm run typecheck`. Expected: pass.

---

### Task 6: Button, panel and map (web)

**Files:**
- Modify: `web/src/api.ts`: `export async function fetchHeatMap(model: HeatModelId): Promise<HeatMapData>` (uses `getJson`)
- Create: `web/src/components/HeatMapPanel.tsx`
- Modify: `web/src/App.tsx`
  - State: `heatModel: HeatModelId | null` (null = off) and `heat: HeatMapData | null`.
  - Fetch when `heatModel` changes, and again every `REFRESH_MS` while it is on. Drop an answer
    whose `model` is not the current `heatModel` (Review Focus 4).
  - Render `<HeatMapPanel>` inside `.map-area`, and pass `heat` to `ProvinceMap` and
    `heatOn` to `Legend`.
- Modify: `web/src/components/ProvinceMap.tsx`
  - New prop `heat: HeatMapData | null`.
  - The province and town `setData` effects use `withProvinceHeat` and `withTownHeat` when
    `heat` is set, and the score colours otherwise.
  - Fill opacity is on when `layers.scores || heat !== null`.
  - `showLabel` reads `heat` through a ref. When it is set, the label uses
    `t.heat.townLabel` and `t.heat.provinceLabel`.
- Modify: `web/src/components/Legend.tsx`: prop `heatOn: boolean`. When true, show the note
  `t.heat.scoresHidden` under the score scale.
- Modify: `web/src/styles.css`: the button and panel, which sit under the zoom and locate
  buttons at the top right. At phone width the panel must fit in the map with a 16 px edge
  and never cause sideways scrolling.
- Modify: `web/src/i18n/en.ts` and `fil.ts`: a `heat` block. Suggested English (the builder
  may polish it):
  - `button: 'Heat map'`
  - `title: 'Heat index map'`
  - `close: 'Close heat map'`
  - `source: 'Source'`
  - `models: { ecmwf_ifs: 'ECMWF', dwd_icon_global_native: 'ICON (DWD)', ncep_gfs_global: 'GFS (NOAA)' }`
  - `km: '{km} km model'`
  - `spacing: 'Points are about 28 km apart for every source; a town shows its hottest point.'`
  - `cardDiffers: 'The status card uses Open-Meteo\'s blended forecast, so its number can differ.'`
  - `updated: 'Updated {ago}'`
  - `noData: 'No data yet for this source.'`
  - `stale: 'This forecast is out of date.'`
  - `below: 'Below 27 °C'`
  - `townLabel: '{town}, {province}: {heat} °C{band} · {model}'`
  - `provinceLabel: '{province}: {heat} °C{band} · {model}'`
  - `unknown: 'unknown'`
  - `scoresHidden: 'Score colours are hidden while the heat map is on.'`

  Band names reuse `t.heatBands`. The tag reuses `t.tiers.model`.
- Modify: `web/src/components/CreditsPage.tsx`: the ECMWF, DWD ICON and NOAA GFS credit
  lines (strings in i18n).

**Panel contents, top to bottom:**
- the title, with a close button;
- `t.tiers.model` as a `.tag`;
- one radio button per `HEAT_MODELS` entry, showing the label and `km`;
- "Updated {ago}" (`uploadedAgo` + `useNow`), or `WarnIcon` + `noData` / `stale`;
- the band key: `below`, then the four bands with their ranges 27–32, 33–41, 42–51, 52+;
- `spacing` and `cardDiffers` as muted notes.

Pressing the button sets `heatModel` to `DEFAULT_HEAT_MODEL`, and close sets it to null.

- [ ] **Step 1:** Implement the API helper, the panel, the App wiring, the map changes, the
  legend note, the styles and the strings.
- [ ] **Step 2:** Run `npm run typecheck` and `npm test`. Expected: pass.

---

### Task 7: Docs and project rules

**Files:**
- `CLAUDE.md`:
  - Colour rule: the heat map's band colours are a second exception, shown only while the
    score colours are hidden.
  - Folder map: the new files.
  - Commands: `npm run ingest:heatmap`.
  - Credits list: ECMWF, DWD, NOAA via Open-Meteo.
- `README.md`: credits.
- `docs/data-sources.md`: the three models and their licences.
- `docs/how-it-works.md`: the route, the job and the map.
- `docs/privacy-and-limits.md`:
  - a 9 km model smooths out hills and cities, and can read low in hot city centres;
  - points are about 28 km apart;
  - a town shows its hottest point;
  - the card can differ from the map.
- `METHODOLOGY.md`: one line saying the heat map never changes the score.
- `PLAN.md`: Phase 4 status, and the budget line in `due.ts`.

- [ ] **Step 1:** Write the docs.
- [ ] **Step 2:** Check that `grep -rn "ECMWF" README.md web/src/i18n/en.ts` finds the credit lines.

---

### Task 8: Live check

- [ ] **Step 1:** Run `npm run migrate`, then `npm run ingest:heatmap`. Expected: a log line
  for each model showing about 599 points saved (about 599 calls, 12 requests, about 2 minutes).
- [ ] **Step 2:** Run `curl -s localhost:3001/api/heatmap | head -c 400`. Expected: `model`
  is `"ecmwf_ifs"`, `fetchedAt` is recent, and `places` has values.
- [ ] **Step 3:** Start `npm run dev:server` and `npm run dev:web`. Press "Heat map" and switch
  through all three sources. Take a screenshot in light and dark mode. Expected: warm town
  colours, hover labels with the model name, the score colours hidden, and closing the panel
  brings the score colours back.
- [ ] **Step 4:** Run `npm run typecheck`, `npm test` and `npm run test:db`, and show the output.
- [ ] **Step 5:** Ask for a code review (`/code-review`) before handing over.
