# PH Monitor — hazard map buttons (plan)

**Status:** proposal, 2026-11-19. Built so far: the heat map (Phase 4), step 0 of the build
order (2026-11-20: the view switch with Overall, Earthquake and Heat; see the reference below)
and step 1 (2026-11-20: Typhoon, Flood and Storm surge). The Heat view also gained PAGASA iHeatMAP as a source and a time bar (2026-11-20).
The main plan lives in [PLAN.md](PLAN.md). This file covers only the hazard buttons.

## What and why

Phase 4 added one map button: the heat map. The owner wants a button for each kind of
disaster. Each button shows that one hazard across the whole country. Like the heat map, a
hazard view is **display only. It never changes the score.**

**Anti-goals (a failure even if it works):** the score changes. Two warm colour scales show
at once. Missing data looks calm. A button shows an empty map when we simply have no data.

## Categories

The buttons use the nine kinds already in `shared/src/newsTypes.ts` (`NEWS_TYPES`), so a
button on the map and the matching headlines filter mean the same thing. They are grouped
by cause, which also tells us where the data comes from:

| Group | Buttons | Data we already have | Missing |
|---|---|---|---|
| **Wind and water** | Typhoon, Flood, Storm surge | JMA/JTWC tracks (`ingestStorms`), rain (`ingestWeather`), GloFAS river flow (`openMeteoFlood`), NOAH surge zones (`load-hazards`) | Nothing much: the first group to build |
| **Ground** | Earthquake, Landslide, Tsunami | USGS quakes (`ingestEarthquakes`), NOAH landslide zones (next in PLAN.md) | No tsunami feed; tsunamis appear only in bulletins |
| **Volcano** | Volcano | GDACS/EONET points (`ingestEvents`) | PHIVOLCS alert levels (no feed) |
| **Dry and hot** | Heat (built), Drought, Wildfire | Heat map; EONET fires | A drought signal; better fire data (NASA FIRMS needs a key) |

**One difference from the news list:** in `NEWS_TYPES`, storm surge counts as `tsunami`.
On the map, storm surge goes with **Typhoon**, because typhoons cause storm surges, while
tsunamis come from earthquakes. The news filter stays as it is.

## Two kinds of button

- **Area views** recolour the province and town shapes, the way the heat map does: heat,
  flood (the rain part of the score), drought, and later typhoon wind (there is no wind in
  the weather grid yet: `weather_readings` and `point_readings` have no wind columns).
  - **Only one at a time.** Turning one on turns the others off and hides the score colours.
    This is the same rule as the heat map, so two warm scales never show at once.
  - An area view that shows a part of the score (Earthquake, Flood) uses the score colours.
    Any other area view gets its own band colours (`--<hazard>-*` in `styles.css`, light and dark
    sets, read through `palette.ts`). Before adding new warm scales, CLAUDE.md's colour rule
    needs the owner's OK. A cool scale (blues for flood) needs no exception.
- **Point views** add markers or lines on top of the map: earthquakes, volcanoes, fires, storm
  tracks. Several can be on at once, alongside an area view or the score.
  - Some already exist as legend tick boxes: disaster events, storm tracks, headline dots,
    NOAH zones (`mapOverlays.ts`, `stormGeo.ts`, `hazardOverlay.ts`). The button can turn on
    the existing layer.
  - **Earthquakes** got their map layer in step 0b: `GET /api/quakes` and quake markers sized by
    magnitude (`quakeOverlay.ts`).

**Rules for every button:**
- With no data behind it, a button is not shown, or it is greyed out with a short note
  ("no live feed for tsunamis"). It never shows an empty, calm-looking map.
- A null value uses the striped "no data" look. Stale data uses ink, `WarnIcon` and words.
- Every view carries a tag: Official, Global assessment, Model estimate, or Fixed hazard map
  (NOAH).
- Every string goes in `en.ts` and `fil.ts`, and every new source gets its credit line on the
  credits page and in the README.

## Where the buttons go: a view switch in the top bar

Decided 2026-11-20. One row of buttons in the top bar: **Overall** first, then the hazards.
Only one is pressed at a time, like tabs.

```
[ ▤ PH Monitor ]  [● Overall] [Typhoon] [Flood] [Earthquake] [Heat] [Volcano] [More ▾]   EN|FIL  ◐
```

**A pressed button puts the whole page's focus on that hazard:**

| Part of the page | Overall (default) | A hazard pressed (e.g. Earthquake) |
|---|---|---|
| Map colours | Stress score | That hazard's view (see the next point) |
| Status card | Usual order | That hazard's section moves to the top (`cardOrder.ts`) |
| Headlines | All | Filtered to that kind (see "Headlines" below) |
| Legend | Score scale and the reader's tick boxes | That hazard's scale, tag and layers (see "Legend" below) |

- **Hazards that already have a part-score** (earthquake, rain, heat, GDACS events): the view
  can colour towns by that 0–100 part-score with the existing score colours. No new warm
  scale is needed, and the colour rule stays as it is. Hazards without one (river flow,
  typhoon wind) need their own view and colours, as described under "Two kinds of button".
- **Look:** icon plus word on every button, never colour alone. The pressed button has a
  filled ink background (sea-and-ink palette). Buttons are never warm-coloured.
- **About 5–6 visible**, ordered by how often they matter: Typhoon, Flood, Earthquake, Heat,
  Volcano. The rest go under **More ▾** (Landslide, Storm surge, Wildfire, Drought, Tsunami).
- **No data:** the button is greyed out with a short note ("No live feed for tsunamis yet"),
  not hidden.
- **Under 900px:** the switch becomes its own row under the bar and scrolls sideways.
- **Accessibility:** a tab group (`role="tablist"`, or buttons with `aria-pressed`), usable
  from the keyboard.
- **The heat map button moves into this row.** `HeatMapPanel` (the model picker) shows only
  while Heat is pressed.
- **The score stays the same:** strongest signal + 0.25 × each other signal (see METHODOLOGY).
  It is not an average, and pressing a button never changes it.

### Legend, per pressed button

- **The top block shows the pressed view's scale.** Overall: the stress score scale (as
  today). Heat: the heat bands, the model's name and the "Model estimate" tag. Earthquake:
  "Earthquake part of the score" with the score colours. The heat bands move from
  `HeatMapPanel` into the legend, so the key is shown only once.
- **Each view ticks its own layers.** Earthquake turns on the quake markers. Typhoon
  turns on storm tracks and storm surge zones. The reader can still change any tick box.
- **Overall gives the reader's own tick boxes back.** Going back to Overall restores the
  reader's ticks from before they pressed a hazard. A button never quietly changes the
  reader's own settings.
- **Layers that don't belong to the view stay available**, under a folded "Other layers"
  heading. They are not removed.

### Headlines, per pressed button

- **The filter jumps to that kind** (`NEWS_TYPES` keys). The panel title changes too, e.g.
  "Earthquake headlines". The headline dots on the map follow the same filter (already true).
- **No matching headlines gets a clear message:** "No earthquake headlines in the last 14
  days" (`NEWS_KEEP_DAYS`, how long headlines are kept), with a "Show all headlines" link. Never just an empty panel.
- **The link only goes from button to filter.** Picking a filter by hand doesn't change the
  map view. Otherwise picking "drought" headlines would try to open a view that doesn't exist.
- **Live streams stay as they are.** Streams aren't sorted by hazard.

## Each button: first idea (to check with the owner)

| Button | Kind | What it shows | Source |
|---|---|---|---|
| Typhoon | Point (**built**) | Storm tracks and forecasts, plus NOAH surge zones when loaded; towns as plain outlines. Wind bands later, once there is a wind source | JMA/JTWC |
| Flood | Area (**built**) | Towns coloured by the rain part of the score (last hour and last 24 h). River flow later | `ingestWeather` |
| Storm surge | Area (fixed, **built**) | NOAH zones; greyed out until that map is loaded | Project NOAH |
| Earthquake | Area + point | Towns coloured by the earthquake part-score, plus quake markers sized by magnitude (new layer and route) | USGS |
| Landslide | Area (fixed) | NOAH zones, once loaded | Project NOAH |
| Tsunami | — | Not built until there is a feed | — |
| Volcano | Point | GDACS/EONET volcano events | GDACS, EONET |
| Heat | Area | **Built**, see the reference below | Open-Meteo (ECMWF, ICON, GFS) |
| Drought | Area | Later: rain over the last 30 days against normal | to find |
| Wildfire | Point | EONET fire events; FIRMS later if the owner gets a key | EONET |

## Reference: how the heat map was built (copy this pattern)

The full design is "Phase 4" in [PLAN.md](PLAN.md). In short:

**Shared**
- `shared/src/heatModels.ts`: the list of models (`HEAT_MODELS`), the default, and the views
  (`HEAT_VIEWS`: each model plus `'average'`). Adding a model means adding a row.
- `shared/src/types.ts`: `HeatModelId`, `HeatViewId`, `HeatMapData`.

**Server**
- Fetcher `server/src/fetchers/openMeteoHeat.ts`: one request for all three models, 50 points
  per request, zod check per location.
- Tables `heat_forecasts` and `heat_runs` in `server/db/schema.sql`. Only the newest good run
  counts. A run under 90% of points doesn't replace the last good one.
- Job `server/src/jobs/ingestHeatMap.ts`, every 12 h (`due.ts`, `HEAT_MAP_EVERY_MINUTES`).
  Retries are spaced out with `jobTries.ts`. Command: `npm run ingest:heatmap`.
- Freshness: the `heatMap` entry in `FEED_RULES` (`server/src/freshness.ts`), stale after 25 h.
- `server/src/heatMap.ts`: each town takes its hottest linked point (`place_weather_points`);
  each province takes its hottest town; the average view takes the mean of the models.
- Route `GET /api/heatmap?model=…` (`server/src/routes/heatmap.ts`). Unknown model → 400.
- Bands come from `WEIGHTS.heat.bands` in `scoring.ts`, read only. The score never reads
  `heat_forecasts`.

**Web**
- `web/src/App.tsx`: state `heatModel` (null = off), loads `/api/heatmap` and reloads every
  few minutes while it's on.
- `web/src/components/HeatMapPanel.tsx`: the button's panel (source picker, tag, "updated …
  ago", band key, close = off).
- `web/src/heatColors.ts`: colours province and town shapes by band (`withProvinceHeat`,
  `withTownHeat`) and writes the hover text.
- `web/src/components/ProvinceMap.tsx`: `heat` prop. While it's set, the score fills are
  hidden and the hover label shows the heat index and its model.
- Colours: `--heat-below` and `--heat-*` in `styles.css`, read through `palette.ts`.
- Strings: `t.heat` and `t.heatBands` in `web/src/i18n/en.ts` and `fil.ts`.

**Tests:** `server/test/heatMap.test.ts`, `server/test/db/heatMap.db.test.ts`,
`web/test/heatColors.test.ts`, plus a real Open-Meteo answer in `server/test/fixtures/`.

**What a new area view will probably reuse:** the town/province shapes and the "worst point
per town, worst town per province" rule; the panel layout; the "one view at a time, hide the
score" switch. That switch should become general (e.g. `mapView: 'score' | 'heat' | 'flood'
…` in `App.tsx`) rather than one `useState` per hazard. Do that as the first step of the
second area view, not before.

## Reference: how the view switch was built (step 0)

**Shared**
- `shared/src/mapViews.ts`: `MAP_VIEWS`, one row per view (id, icon, NewsType, visible row or
  "More", available, the layers it ticks). Adding a view means adding a row (plus its words in
  `views.names` in the i18n files, and a drawing for a new icon in `ViewSwitch.tsx`).
- `shared/src/types.ts`: `MapViewId`, `MapLayerName`, `QuakePoint`, `QuakeMap`; `PlaceScoreEntry`
  gained `quakeScore` and `quakeUnknown`. `NEWS_KEEP_DAYS` (`newsTypes.ts`) is the headline window.

**Server** (read only; no new tables, no scoring change)
- `GET /api/places/scores` (`routes/places.ts`) also sends each town's earthquake part.
- `GET /api/quakes` (`routes/conditions.ts`, code in `server/src/quakeMap.ts`): the quakes inside
  `WEIGHTS.quake.windowHours` from `WEIGHTS.quake.minMagnitude`, plus the USGS feed's freshness.

**Web**
- `App.tsx`: one `viewState` (pressed view plus tick boxes) and the heat model as its own state,
  used only while Heat is pressed. Pressing a view sets the headline filter (one way only).
- `components/ViewSwitch.tsx`: the buttons in the top bar (`aria-pressed`, a "More" menu,
  greyed-out views with a note). Under 900px it is its own row that scrolls sideways.
- `viewLayers.ts`: the tick box rule (save on leaving Overall, tick the view's layers, give the
  reader's own ticks back on Overall). `Legend.tsx`: the view's scale on top, other layers
  folded under "Other layers". `HeatLegend.tsx`: the heat band key (moved out of the panel).
- `cardOrder.ts`: `hazardRowOrder` and `viewSection` put the view's row and section on top of the card.
- `NewsPanel.tsx`: title per kind; "No … headlines in the last 14 days" with "Show all headlines".
- Earthquake: `quakeColors.ts` (since step 1: `partColors.ts`; towns by their earthquake part in the score colours, unknown
  striped), `quakeGeo.ts` + `quakeOverlay.ts` (markers and popups), `ProvinceMap.tsx` (`view` and
  `quakes` props, hover label "earthquake part").

**Tests:** `web/test/viewLayers.test.ts`, `cardOrder.test.ts`, `quakeColors.test.ts` (now `partColors.test.ts`),
`quakeGeo.test.ts`, `viewStrings.test.ts`; `server/test/quakeMap.test.ts`,
`server/test/db/quakes.db.test.ts`.

**A new view will probably need:** its row in `MAP_VIEWS`; for a part-score view, a row in
`PART_VIEWS` (`partColors.ts`), otherwise its look in `mapLook.ts`; its scale block in
`Legend.tsx`; its row and section in `cardOrder.ts`; a map note in `mapNotes.ts` if it can be empty.

## Reference: step 1 (Typhoon, Flood, Storm surge)

**Shared:** `MapViewId` and `MAP_VIEWS` gained `typhoon`, `flood` and `stormSurge`. A view can
need a NOAH map (`needsHazardMap`); `isViewAvailable` and `viewTicks` (`mapViews.ts`) check it
against what `GET /api/hazards` lists. `PlaceScoreEntry.rainScore`; on provinces
`rain_top_score`, `rain_top_place`, `rain_unknown`.

**Server** (read only): `GET /api/places/scores` sends each town's rain part
(`hazards ->> 'rain'`, null when unknown or saved before the parts were stored).
`GET /api/provinces` sends the town with the highest known rain part and whether any town's
rain is unknown; no fallback to the province's own weather. Test: `server/test/db/rain.db.test.ts`.

**Web**
- `partColors.ts` (was `quakeColors.ts`): one table, `PART_VIEWS`, for Earthquake and Flood.
- `mapLook.ts`: what each view's shapes show (score, heat, a part, or plain outlines).
- `mapNotes.ts` + `MapNote.tsx`: the note on the map ("No tropical cyclone tracked right now",
  storm feed out of date with `WarnIcon`, "Zoom in to see zones", a view's own layer switched off).
- Typhoon also draws the PAR outline (`parArea.ts`, PAGASA's corners) and zooms out to it when
  pressed; `MAX_BOUNDS` reaches 28°N so the whole box fits.
- Typhoon's rain forecast field (built 2026-11-20, owner asked for a Panahon-style map): 7 days
  of ECMWF rain on a 1.5° grid over the PAR (`server/src/rainForecast.ts`, job
  `ingestRainForecast`, every 12 h, 256 calls a run; `GET /api/rainforecast`), drawn as 3-hour
  totals with a time slider (`RainForecastPanel.tsx`, `rainField.ts`, `rainOverlay.ts`). Its
  colours (`--rain-*`) are the third warm scale, approved by the owner; the legend offers the
  layer only in the Typhoon view.
- Typhoon and Storm surge hide the score colours and draw plain town outlines. Storm surge is
  available only when the SSA 4 level (the one the map draws) is loaded (`loadedMapKinds` in
  `hazardLabels.ts`).
- `cardOrder.ts`: Flood puts the rain row and the weather section first; Typhoon moves the
  "Storms forecast to pass near" block up and always shows it (`Conditions.tsx`).
- Storm surge sets the headline filter to `tsunami`, because `NEWS_TYPES` files storm surge there.

**Tests:** `web/test/partColors.test.ts`, `viewAvailability.test.ts`, `mapNotes.test.ts`, plus
`viewLayers`, `cardOrder` and `viewStrings`.

## Build order (proposal)

0. **The switch itself and the first part-score view** (**built** 2026-11-20):
   - a. **Built.** Make the map view switch general (`mapView` in `App.tsx`) and add the top bar view
     switch with Overall and Heat (the heat button moves there). The legend and headlines
     follow the pressed view, as described above. The heat bands move into the legend.
   - b. **Built.** Earthquake view: add the earthquake part-score to `GET /api/places/scores` (read
     only; `place_scores` already stores it), a new quakes route, and a quake marker layer
     with its own legend tick box.
1. **Wind and water** (**built** 2026-11-20):
   - a. **Built.** Flood view: towns by the rain part of the score (score colours, "Model estimate").
   - b. **Built.** Typhoon view: storm tracks only (plus NOAH surge zones when loaded), towns as
     plain outlines; a note when no storm is tracked or the storm feed is out of date.
   - c. **Built.** Storm surge view: the NOAH layer; available only when `GET /api/hazards`
     lists it (`needsHazardMap`, `isViewAvailable`).
   - d. Later: **Typhoon wind.** Wind bands per town need a new data field (wind speed or gusts
     in the weather grid) and the owner's OK for its colours.
2. **Ground:** Landslide once its NOAH zones load.
3. **Volcano** and **Wildfire** as point buttons from GDACS/EONET.
4. **Drought** and **Tsunami** only once a source is found and checked (licence, limits).

Each step ends with `npm test`, `npm run typecheck` and something to see on the map.

## Open questions for the owner

- ~~Where do the buttons go?~~ Decided: a view switch in the top bar (see above).
- ~~What does Flood show first: rain in the last 24 h, or river flow?~~ Decided 2026-11-20:
  the rain part of the score first (last hour and last 24 h). River flow (GloFAS) later.
- ~~Should buttons with no data be hidden?~~ Decided: greyed out with a note.
- ~~Are new warm scales OK (typhoon wind)?~~ Decided 2026-11-20 for now: no warm wind scale.
  Wind needs a new source or field first (step 1d). The same day the owner approved a
  Panahon-style warm scale for the rain forecast field (blue → green → yellow → red → magenta).
