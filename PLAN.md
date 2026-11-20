# PH Monitor — plan

> Everything from "Amendments" down is the historical Phase 1 plan, kept for reference; it has
> not been kept up to date. Where it differs, [README.md](README.md),
> [METHODOLOGY.md](METHODOLOGY.md) and the code are correct.

## Where things stand (updated 2026-11-18)

There are two sets of phases: **product phases** (what the app does) and the **reliability
roadmap** (making what exists more trustworthy, numbered on its own).

| Work | Status |
|---|---|
| Product Phase 1: province map, score, status card | Done |
| Product Phase 2: events, storms, outlook, news, streams, Filipino | Done (PR #1). Official bulletins only partly (no feed for wind signals or PHIVOLCS); AI summaries skipped |
| Reliability phases 1–5 | Done (PR #2) |
| Per-town map colours and the 2-hour weather grid | Done (PRs #3, #4) |
| Reliability Phase 6: tune the score from the replay | **In progress.** Replay re-run on the grid (PR #5); wet day rule for heavy rain (PR #6); USGS impact fields on the card (PR #7); NOAH storm surge zones on the map and card (PR #9) |
| Product Phase 3: all kinds of news on the map | Idea only; needs the owner's answers first |
| Product Phase 4: heat index map with switchable models | Design approved 2026-11-19 (see "Phase 4"). Built 2026-11-19 on `heat-index-map`: step 1 (three models: ECMWF, DWD ICON, NOAA GFS) and step 2 (their average) |
| Hazard map buttons (one per kind of disaster) | Steps 0 and 1 built 2026-11-20 on `hazard-map-buttons`: the top bar view switch (Overall, Typhoon, Flood, Earthquake, Heat; Storm surge under More). Next steps: [HAZARD_MAPS_PLAN.md](HAZARD_MAPS_PLAN.md) |

**Next:** NOAH landslide zones (same code as storm surge). First speed up reading the large
landslide files (see "Build notes" under "NOAH hazard layer: design").

## Phase 2 — disaster conditions, forecasts, news, Filipino (planned 2026-11-15, done)

Goal: keep the province map and score, and add what is happening now, what is coming, and what
the news says, focused only on disasters. This replaces Phase 1's "out of scope" line for news
and typhoon tracks.

### Progress (done; merged 2026-11-16 in PR #1)

| Step | Status |
|---|---|
| 1. Disaster events | Done (fetch, table, `/api/events`, map markers with popups, list on the card) |
| 2. Events in the score | Done |
| 3. Typhoon tracks | Done (fetch, tables, `/api/storms`, sample storm, map layer) |
| 4. Outlook | Done (fetch, table, 7-day row on the card) |
| 5. News panel | Done (ingest, `/api/news`, panel with category filter) |
| 6. Live streams panel | Done (`/api/streams`, panel; a video loads from youtube-nocookie.com only after Play) |
| 7. Link checker | Done |
| 8. Official PH bulletins | Partly done: PAGASA's public alert feed (flood advisories, cyclone alerts) is shown above the score. Wind signals, rainfall warnings and PHIVOLCS alert levels have no feed; plain links stay on the card |
| 9. Filipino option | Done. The owner read all the Filipino lines on 2026-11-17 and changed three; every line keeps its `// REVIEW` mark, as asked. New lines are drafts until read |
| 10. AI summaries | Skipped (owner's choice) |

Not verified yet, because nothing real was available to test with:
- JMA storm parsing has never run on a real storm (none was active). The format was read from
  JMA's own map page and the sample storm is built to match.
- The JTWC backup was tested on a real warning from the Southern Hemisphere only.
- Typhoon and flood headlines were tested with saved samples only.
- No real video with embedding turned off was found, so that status is untested on real data.

### Sources (checked 2026-11-15 and again 2026-11-16, all keyless unless noted)

| Source | Gives | Status |
|---|---|---|
| GDACS `gdacsapi/api/events/geteventlist/SEARCH?country=Philippines` | Typhoon, quake, flood, volcano alerts (Green/Orange/Red) | in use; the API was down for hours on 2026-11-16, so `gdacs.org/xml/rss.xml` is the automatic backup |
| JMA `jma.go.jp/bosai/typhoon/data/targetTc.json` | Active typhoons + forecast track | in use (empty when no storm; untested on a real storm) |
| JTWC `metoc.navy.mil/jtwc/rss/jtwc.rss` | Typhoon warnings | in use as the backup for JMA |
| NASA EONET `api/v3/events` with PH bounding box | Natural events | in use; shown but never scored (no alert level) |
| Open-Meteo forecast (already used) | 7-day rain and wind gusts | in use, CC BY 4.0 |
| Open-Meteo flood `flood-api.open-meteo.com/v1/flood` | River discharge outlook (GloFAS) | in use |
| Google News RSS search (PH, disaster words) | Latest news | in use; social posts, automatic quake bulletins and two repost sites are filtered out |
| Rappler, Inquirer, PhilStar, GMA, PTV, Bombo Radyo, Manila Times, Interaksyon, SunStar, MindaNews RSS | Local news | in use (13 feeds with Google News) |
| ABS-CBN, PNA, PIA, DZRH, News5, Manila Bulletin RSS | Local news | dropped: no working news feed (404, 403, or entertainment only) |
| ReliefWeb API v2 | Humanitarian reports | not used (needs a free approved `appname`) |
| PAGASA | Official alerts | CAP alert feed (CC BY 4.0) in use; other bulletins are web pages only, linked not scraped |
| PHIVOLCS | Official PH bulletins | web pages only, no API; linked from the card, not scraped |
| YouTube oEmbed `youtube.com/oembed?url=...` | Can a video be embedded | used only without a key; accepts video links, not channel links |
| YouTube channel feed `youtube.com/feeds/videos.xml?channel_id=...` | A channel's newest videos | used only without a key; fails at random (404/500 for real channels) |
| YouTube Data API | A channel's live stream or latest video | in use with the owner's key; 1-unit calls only, about 1,900 (at most 7,500) of 10,000 units a day |
| NDRRMC | Situation reports | blocks automated requests; skip |

Each new source must get its credit line in the UI and README, like the existing ones.

### Steps (each ends with something to run and see)

1. **Disaster events**: GDACS + EONET fetchers (zod schemas, tests first) → new `events` table
   (kind, alert level, time, geometry, source, link) → markers on the map, listed on the status
   card. Check: a recent GDACS PH event (e.g. a Kanlaon eruption) shows on the map.
2. **Events in the score**: GDACS alert level near a province adds to its score, in
   `scoring.ts`, with METHODOLOGY.md updated. Check: `npm test`, and a province beside an Orange
   event scores higher. As built: Green/Orange/Red give 10/50/80 points within 100/200/300 km;
   only typhoons, floods, volcanoes and wildfires count (quakes are already scored from USGS);
   the score is the strongest signal plus 25% of each of the other two.
3. **Typhoon tracks**: JMA (main) + JTWC (backup) → `storms` and `storm_track_points` tables →
   past and forecast track drawn on the map; provinces near the forecast track get a "coming"
   flag. Check: with no storm the layer is empty; a saved sample storm draws correctly
   (`npm run sample-storm`, and `npm run sample-storm -- remove` to delete it).
4. **Outlook ("next 7 days")**: Open-Meteo daily rain + gusts, and flood discharge, per province
   → shown on the status card as a short day-by-day row. The "now" score stays separate from the
   outlook. Check: card numbers match open-meteo.com for the same spot. As built: fetched every
   6 hours, about 704 Open-Meteo calls a day (about 4,900 with the weather job, of 10,000).
5. **News panel**: fetch the RSS feeds every 15 min → keep only disaster headlines (keyword list
   in English and Filipino, e.g. bagyo, baha, lindol, pagputok, landslide, storm surge) → merge
   the same story from several outlets → tag a province when the headline names one → `news`
   table. Each outlet has a category (see "Outlet categories" below), and the panel can filter by
   it. UI: "Latest" list, and "News near here" on the status card. Each item links to the
   original article (headline + outlet + category + time only, no article text). Check: the list
   shows today's PH disaster headlines with no duplicates, and the category filter works.
   Known limits: some duplicates are missed, and repeated stories about one long-running event
   merge into one row within 48 hours.
6. **Live streams panel**: a short list of PH YouTube channels,
   grouped by the same outlet categories. Each slot shows the channel's live stream when it is
   live ("LIVE"), otherwise its latest video ("Latest"), with the title and upload time.
   12 slots passed the check: PAGASA, Civil Defense PH, PTV, GMA News, ABS-CBN News (backup:
   ANC), UNTV, One News PH, DZRH, DZBB, Rappler, INQUIRER.net, Bombo Radyo. Dropped: PHIVOLCS and
   DZMM (the channels found were not the real ones), News5 (not found), SunStar (dormant). Shown in YouTube's own player through `youtube-nocookie.com`, which only
   loads YouTube when the viewer presses play. YouTube embeds only; no re-streaming of raw TV
   feeds (`.m3u8`). Each slot can list backup links, tried in order. This is the one exception to
   "the web app talks only to our own `/api`" besides the basemap (CLAUDE.md says so). Check: a live slot plays, and a slot whose links are all dead is hidden.
7. **Link checker** (for news feeds and live streams): a `sources` table holds every feed
   and stream link with its outlet, category, status (`ok`, `dead`, `not-live`,
   `not-embeddable`), last checked and last OK time.
   - News feeds, every hour: reachable, valid RSS, newest item age. A feed with nothing new for
     7 days is flagged.
   - Streams, every 30 min (and on page load or Refresh, at most every 10 min), with a YouTube
     key: three 1-unit Data API calls per channel (live streams list, newest uploads, then those
     videos' details) find the live stream first, else the latest video. Never
     `search.list` (100 units). The key stays on the server.
   - Streams without a key: the channel feed plus oEmbed. That feed fails at random, so a failed
     check keeps the last status, and a link is marked dead only after a day of failures. Live
     status is then unknown and the slot shows "may be offline".
   - A busy channel's live stream is found through its live-streams list, so it is no longer
     missed when it drops out of the newest 50 uploads (fixed 2026-11-18, PR #4). A known video
     ID can still be pinned in `sources.ts`.
   - `npm run check:sources` runs it by hand and prints a table of what is broken and why.
   - The UI hides dead links and never shows a stream as live unless the check said so.
   - Link lists live in one file (`server/src/sources.ts`) so a dead link is fixed in one place.
   Check: put a fake link in the list, run the checker, see it marked `dead` and hidden.
8. **Official PH bulletins (partly)**: PAGASA's public alert feed (CAP, CC BY 4.0) is in use and
   shown above the score. PAGASA wind signal numbers and rainfall warnings, and PHIVOLCS volcano
   alert levels, have no feed; scraping their pages was declined (owner, 2026-11-16), so the
   status card has plain links to the PAGASA and PHIVOLCS bulletin pages instead.
9. **Filipino option**: an English / Filipino switch in the page header, remembered in the
   browser. Details below. Check: switching changes every label, the legend, the disclaimer, the
   card and the outlet category names, with no English left over.
10. **AI summaries (skipped)**: a short "what is happening" brief from the news and
    events, only if a local model (Ollama) or an API key is set up. Off by default.

### Outlet categories

Every news feed and live stream belongs to one category. They are labels for filtering and
grouping, not a ranking of trust.

| Category | Filipino label | Examples in use (full list: `server/src/sources.ts`) |
|---|---|---|
| `official` — government agencies | Opisyal | PAGASA, PTV, Civil Defense PH |
| `tv` — national TV networks | Telebisyon | GMA, ABS-CBN News, UNTV, One News PH |
| `radio` — AM/FM news radio | Radyo | DZRH, DZBB, Bombo Radyo (news feed) |
| `online` — newspapers and news sites | Online at diyaryo | Rappler, Inquirer, PhilStar, Manila Times |
| `regional` — outlets covering one region | Panrehiyon | SunStar, MindaNews, Bombo Radyo (stream) |
| `international` — foreign or wire services | Pandaigdig | Reuters, AP via Google News |

Google News search results take the category of the outlet they come from; unknown outlets go
under `online` until they are added to the list.

### Filipino translation

- **Interface text**: every label moves into two files, `web/src/i18n/en.ts` and
  `web/src/i18n/fil.ts` (same keys). Written by hand, not machine-translated, and checked by the
  owner, because warning wording must be exact. Use the terms PAGASA and PHIVOLCS use themselves
  (e.g. "Signal No. 2", "Alert Level 3", "bagyo").
- **Score reasons** on the card are built on the server; they become message keys plus numbers
  so the web app can show them in either language.
- **The "not an official warning service" notice** gets a Filipino version, shown everywhere the
  English one is required.
- **News headlines** are shown in their original language. Machine translation of headlines is a
  later option (self-hosted LibreTranslate or the AI step), always labelled "machine-translated"
  with a link to the original.
- Dates and numbers use the `fil-PH` locale when Filipino is on.

### Owner's decisions (2026-11-16)

- Scrape PAGASA and PHIVOLCS (step 8): no for now; plain links on the card instead.
- AI summaries (step 10): no for now.
- ReliefWeb `appname`: not requested; ReliefWeb is not used.
- YouTube Data API key: yes, set in `.env` (server only).

### Open questions for the owner

- Confirm that the "Civil Defense PH" YouTube channel is the real one (it is small).
- New Filipino lines added since the review (2026-11-17) are drafts until the owner reads them.
- All kinds of news on the map: see "Phase 3 idea" below.

## Phase 3 idea — all kinds of news on the map (proposed 2026-11-16, not designed yet)

Idea: stop keeping only disaster headlines. Keep every headline, give it a topic, and mark the
place it names on the map. Nothing is built or decided; this records what we know so far.

How it works today:
- The 13 feeds already carry all kinds of news. `server/src/news/keywords.ts` throws away
  everything that is not about a disaster.
- `server/src/news/tagProvinces.ts` already tags a headline with any province it names.
- Headlines appear only in the panel and on the status card, never on the map.

What it would take:
- **Topic**: replace the disaster-only filter with a sorter that gives each headline one topic
  (for example disaster, crime, politics, health, transport). Keyword rules can do it roughly.
- **Map marker**: a marker at the centre of the province or city the headline names, with a
  topic filter.

Known limits:
- The place is only as exact as the headline: a city or province, never a street. Stories that
  name no place get no marker.
- Wrong tags will get worse: Rizal, Aurora, Quezon and Isabela are also people's names, and
  political news is full of them.
- Sorting topics by keywords is rough. Doing it well needs an AI model (step 10, skipped).
- It changes the project's focus. Phase 2 is "focused only on disasters" and the score only
  measures hazards; general news would sit beside the score without changing it.

To settle before designing:
- What should a reader learn from the map that the disaster view does not give today?
- Which topics, and is "other" shown or dropped?
- Keyword rules or an AI model for topics?
- How to stop person names being read as provinces.
- How many markers the map can show before it becomes unreadable (how many days, grouping).

## Phase 4 — heat index map (approved 2026-11-19)

**Status:** both steps built 2026-11-19 on `heat-index-map`: the three models, then their average.

**What and why.** A map of the heat index ("feels like" temperature) over the whole country,
coloured by PAGASA's bands, so a reader can see where it is dangerously hot right now. The
reader can switch between weather models. Seeing several models side by side, and where they
disagree, shows how far to trust the estimate. It is a display layer only. **It never
changes the score**: no scoring code reads its table.

**Goals.** A heat map button. Pressing it turns the heat map on and shows the sources to pick
from: ECMWF, DWD ICON and NOAA GFS. While the heat map is on, the reader can switch sources at
any time (owner's design). Then an "Agreement" view.
**Non-goals.** A time slider (only the current hour is shown). Heat on the status card. Finer
cells than the weather grid. Satellite land surface temperature (MODIS, Himawari): it measures
how hot the ground is, not the air.
**Anti-goals (a failure even if it works).** The score changes. The score's weather fetch
breaks or gets slower. The page shows two warm scales at once. Missing data looks cool.

### Facts (checked 2026-11-19 on open-meteo.com, with live calls)

- Open-Meteo `/v1/forecast` with `models=` named explicitly, never the default blend.
  - `ecmwf_ifs`: ECMWF IFS HRES, 9 km. Hourly to 90 h, a new run every 6 h. ECMWF open data, CC BY 4.0
    since 2025-10-01.
  - `ncep_gfs_global`: NOAA GFS, 0.11° (~13 km), hourly to 120 h, every 6 h.
  - ICON: `icon_global` is marked "Discontinued 2026-11-30" (DWD moves to native grids). Use
    `dwd_icon_global_native`, which works now. Check again before step 2.
  - All three returned 48 of 48 hourly values for `temperature_2m` and `relative_humidity_2m`.
- **How calls are counted** (pricing page and its cost calculator): one call per location,
  times `max(1, variables × models / 10)` for spans up to 2 weeks. 2 variables × 3 models is
  0.6, so **all three models in one request cost the same as one**: 1 call per point.
- Free tier: 600 a minute, 5,000 an hour, 10,000 a day; non-commercial only.
- The heat index uses our own `heatIndexC()` (PAGASA's formula), not Open-Meteo's
  `apparent_temperature`.

### Budget (owner's choice: option A)

| Today | Points | Runs a day | Calls a day |
|---|---|---|---|
| Score weather (`ingestWeather`, every 2 h) | 599 | 12 | 7,188 |
| Outlook + river flow | 88 × 2 | 4 | 704 |
| **Heat map, all models in one request, every 12 h** | **599** | **2** | **1,198** |
| Rain forecast field (Typhoon view, added 2026-11-20) | 256 | 2 | 512 |
| Total | | | **9,602**, leaving ~400 for card clicks |

Options not chosen: every 6 h (+2,396: over the limit); riding along on the score's
weather fetch (+480, but it changes the request the score depends on); finer grids (0.15° is
1,265 points, 0.1° is 2,731: too many at any rate). Downloading ECMWF/NOAA files directly has no
call limit and keeps the full 9 km, but needs a GRIB reader: too much to build and maintain.

Every 12 h is enough: each fetch holds 48 hours of forecast, so the current hour is always in
it. The cost is a forecast up to 12 h older than the newest model run.

### Approaches

- **Chosen: its own job on the score's weather points, colouring towns.** It reads all 599
  points in `weather_points`: the 0.25° land grid plus each province's point and the 29
  small-island towns' points. That table is built from the province boundaries in PostGIS
  by `pick-weather-points`, so no new grid script is needed. Each city and municipality takes
  the hottest of its linked points (`place_weather_points`, the same links and the same
  "worst point" rule the score uses). Every town is covered, and the map looks like the one
  readers already know.
- Not chosen:
  - one square per grid point (482 points): small islands and some remote towns would get no
    square, and so would look the same as places under 27 °C;
  - a new, finer heat grid: it doesn't fit the budget;
  - adding the models to `ingestWeather`: it puts the score at risk.

### Owner's decisions (2026-11-19)

- **Button and source picker.** A "Heat map" button on the map. Pressing it turns the heat map
  on and opens a small panel that lists the sources. The panel stays open while the heat map is
  on, so the reader can switch sources at any time; the map recolours straight away.
- **All three sources from the first build** (ECMWF, ICON, GFS): they come in the same request,
  so they cost nothing extra. Agreement comes second.
- **Colours: warm bands that replace the score.** PAGASA-style yellow → orange → red → dark red.
  While the heat map is on, the score colours are hidden, so two warm scales never show at once.
  CLAUDE.md's colour rule gets a second exception (like `--live`).
- **Colour each town**, not grid squares: all 599 points, 1,198 calls a day.
- **Branch:** `heat-index-map`, started from `phase6-noah-hazard-maps` (PR #9).

### Design

**Server.**
- `shared/src/heatModels.ts`: the list of models, one row each with the Open-Meteo name, a short
  label, the grid size in km, and the credit. Holds ECMWF (`ecmwf_ifs`, 9 km), ICON
  (`dwd_icon_global_native`, 13 km) and GFS (`ncep_gfs_global`, 13 km). ECMWF is the default.
  Adding a model later means adding a row; nothing else in the code path changes.
- `server/src/fetchers/openMeteoHeat.ts`:
  - The request: `hourly=temperature_2m,relative_humidity_2m&models=<all>&forecast_hours=48&timeformat=unixtime`,
    50 points per request, paced like the weather job.
  - With several models the answer names each list `temperature_2m_<model>`. With one model the
    names may have no suffix; the fetcher handles both.
  - zod checks each location; a bad one is skipped and logged.
- Table `heat_forecasts` in `schema.sql` (re-runnable): `model`, `point_id` (references
  `weather_points`, `ON DELETE CASCADE`), `valid_at`, `temp_c`, `humidity_pct`,
  `heat_index_c`, `fetched_at`. Primary key: (model, point_id, valid_at).
  - **Only the newest run counts** (builder's call). Each run replaces a model's rows inside a
    transaction: delete, then insert. A point that did not answer has no rows, so it shows as
    "no data". It never falls back to an older run's value.
  - A run where a model falls under 90% of points does not replace that model's rows: the
    previous good run stays whole, and its age shows as "out of date" after 25 h. Runs are
    never mixed. Last good run per model: table `heat_runs`.
  - Rows more than 6 hours in the past are deleted.
  - If `pick-weather-points` is re-run, the cascade empties the table, and the next run fills
    it again.
- Each model is judged separately: a model is "ok" in a run only if at least 90% of points
  have values for it (`isFreshEnough`). A model that returns all nulls (ICON may be retired) is
  marked "no data" while the others carry on. `fetch_runs` gets the row `open-meteo-heat` for
  the run as a whole, and each model's `fetchedAt` comes from its own rows.
- Job `ingestHeatMap`:
  - In `due.ts`, every 720 minutes, source `open-meteo-heat`.
  - Command `npm run ingest:heatmap`.
  - Freshness: a new `heatMap` entry in `FEED_RULES`, stale after 25 h (two missed runs).
  - A run counts as successful only if `isFreshEnough` (90% of points answered).
- Route `GET /api/heatmap?model=ecmwf_ifs`. It returns:
  - the model, `fetchedAt` (null = no data), `isStale`, and the hour shown (`validAt`);
  - `places: [{ psgc, heatIndexC | null, band | null }]`: each town's hottest linked point;
  - `provinces: [{ psgc, heatIndexC | null, band | null }]`: each province's hottest town, for
    the zoomed-out map, as with the score.
  The band name comes from `WEIGHTS.heat.bands` in `scoring.ts`, which is read only; the
  formula itself stays untouched. The hour shown is the current hour from the newest stored run.
  A town whose points all lack a value for that hour is null, never a guess. A town with some
  points missing takes the hottest of the rest, the same rule as `worstReading` (builder's call).

**Web.**
- A "Heat map" button with the map buttons at the top right. It opens a panel:
  - the sources as radio buttons, each with its model's grid size;
  - a short note that the points are about 28 km apart whatever the model;
  - the "Model estimate" tag and "updated … ago";
  - the band key; a close button.
  Closing the panel turns the heat map off.
- The map colours the same shapes as the score: provinces when zoomed out, towns when zoomed
  in, using the town and province shapes the map already loads.
  - Each shape is coloured by its band.
  - Below 27 °C a shape gets a light neutral ink fill, labelled "below 27 °C" in the key. It is
    not a warm colour, and it is not left empty, so it can't be mixed up with a missing value.
  - A null shape uses the existing striped "no data" look.
- While the heat map is on, the score fill layers are hidden. The legend says so, and the
  status card still opens on click.
- **The number (builder's call):** while the heat map is on, the hover label shows the heat
  index instead of the score, for example "Kiamba: 41 °C, extreme caution · ECMWF".
  - The panel says the status card uses Open-Meteo's blended forecast, so its number can
    differ from the chosen model.
  - Step 2's agreement text goes in the same hover label.
- Stale or missing data uses ink, `WarnIcon` and words, never a colour.
- Colours: `--heat-caution`, `--heat-extreme-caution`, `--heat-danger`, `--heat-extreme-danger`
  in `styles.css`, light and dark sets, read through `palette.ts`.
- Every string is in `en.ts` and `fil.ts`. The band names reuse `t.heatBands`. Filipino lines are
  drafts.

**Credits and docs.**
- Credits page and README: "ECMWF open data (CC BY 4.0) via Open-Meteo", plus DWD ICON and NOAA
  GFS via Open-Meteo. Each uses its provider's credit wording, checked while building.
- `docs/data-sources.md`, `how-it-works.md` and `privacy-and-limits.md` explain the limits:
  - a 9 km model smooths out hills and cities, and can read low in hot city centres;
  - the map samples it at points about 28 km apart, and a town shows its hottest point.

**Tests.**
- Pure functions first:
  - picking the current hour from a stored run;
  - reading both answer shapes (with and without model suffixes);
  - the band of a value;
  - each town's hottest point, and each province's hottest town.
- A real Open-Meteo answer (one request, a few points) is saved in `server/test/fixtures/`.
- Database tests:
  - ingest into `heat_forecasts`, and a second run replaces the first;
  - the route: current hour, a stale run, a point missing from the newest run is null, an
    unknown model gives 400.

### Build order

1. **The three models**, built as above. The owner looks at them side by side before step 2.
2. **Then the average** (owner's decisions, 2026-11-19, replacing the "agree / disagree"
   idea): a fourth choice, "Average of all three", coloured with the same bands.
   - Each town: the mean (to 0.1 °C) of each model's town value (its hottest point). A model
     with no value is left out and counted ("average of 2 of 3 models"); none = unknown.
   - The hover label also shows the range: "· average of 3 models: 39–43 °C".
   - A province: its hottest town's average, with that town's range.
   - "Updated" is the oldest source's run; the view is out of date if any source is.
   - First live run: every town had all three; the models' range was 2.1 °C at the median,
     4.2 °C at the 90th percentile, 10 °C at most.

### Left to the builder

- Exact file names in the web app, and how the panel is laid out at phone width.
- How the 50-point requests are paced.
- The wording of every string.
- Unknown-model handling beyond returning a 400.

## Reliability roadmap (from the audit of 2026-11-16)

Goal: make what exists more reliable and trustworthy, not add features. These phases are
numbered on their own, separate from the product phases above. Finding numbers (1.1 to 1.20)
refer to the audit report.

| Phase | Goal | Status |
|---|---|---|
| 1 | Data integrity: unknown is never calm, `/api/status` and banner, close dropped events, retries, wording | Done (PR #2) |
| 2 | Official warnings: PAGASA alert feed, three-tier labels, official block at the top of the card | Done (PR #2) |
| 3 | Geography and hazards: storm distance to the track line, JTWC fallback, extra weather points, "not covered" list, per-hazard levels | Done (PR #2). The extra weather points were later replaced by the weather grid (PR #3) |
| 4 | Stability: jobs run only when due (1.11), score history with part-scores (1.12), database tests in CI, historical replay (results: `docs/replay-results.md`) | Done (PR #2). Deployment basics (1.13) skipped for now: no plan to go online soon |
| 5 | Experience: place search and "use my location" (1.17), card order (1.18), keyboard and touch (1.19), Filipino review, news fixes (1.14, 1.15) | Done (PR #2). 5.4: headlines sorted into nine kinds of disaster (owner's choice). 5.5: owner read all 230 Filipino lines on 2026-11-17 and changed three ("lalawigan/probinsya" everywhere, "Ayon sa uri ng banta"); every line still has its `// REVIEW` mark, as asked |
| 6 | Tune the score from the replay, then the extras below | In progress (see "Phase 6") |

### Phase 6

Its main job is acting on what the replay shows. Status, in order:

| Item | Status |
|---|---|
| Replay re-run the way the live app scores (towns, the weather grid, a reading every 2 hours) | Done 2026-11-18 (PR #5). Every known disaster still reaches "High"; the ordinary week had 30 "High" province-hours (was 7), all from a single heavy hour of rain |
| **Wet day rule** (owner's choice): a heavy hour under 30 mm reaches "High" only after 50 mm in 24 hours | Done 2026-11-18 (PR #6). The ordinary week drops from 30 "High" province-hours to 4; no known disaster changes. Other amounts can be tried with `WET_DAY_MM=<mm> npm run replay` |
| **Headline number**: keep "strongest + 0.25 × each other", or use the worst single hazard | Kept for now, as recommended: Taal reached "High" only through it. The owner has not decided yet |
| **USGS impact fields (1.10)**: PAGER `alert`, `mmi` (shaking intensity) and `tsunami` are saved in `raw` but not used. Show them on the card, or use them in the earthquake signal | Done 2026-11-18 (PR #7). Shown on the card, tagged "Global assessment"; not in the score |
| **Landslide and storm surge maps**: no live feed for either. Static hazard maps (for example government geohazard maps) could mark areas at risk, but only if their licence allows reuse with credit. If none does, keep the "not covered" line | Licences checked 2026-11-18 (see below): Project NOAH's maps are usable under ODbL. Owner's choice (2026-11-18): show them as a map layer and a status card line, score unchanged; ODbL accepted. Storm surge built 2026-11-19 (all 4 levels, 72 provinces). To do: landslide |
| **Man-made disasters in the headlines**: building fires and garbage, landfill or mine collapses. Left out on 2026-11-17 (owner's choice); a later "Man-made" group could bring them back | To do, if the owner wants it |

Rule for any further tuning: change `WEIGHTS` in `scoring.ts` only where the replay shows a clear
miss (a known disaster that never reached "High" at the right time, or false "High" readings in
an ordinary week). Tests first; update METHODOLOGY.md.

Small leftovers with no phase: a repeated identical headline is dropped for 14 days (1.16),
and a few outdated comments (1.20).

#### Landslide and storm surge maps: licence check (2026-11-18)

Research only; nothing was downloaded into the repo. Every quote below was read on the page
named, on 2026-11-18. "NC" = non-commercial use allowed.

**The law.** RA 8293 Sec. 176.1 (read on lawphil.net, an unofficial copy; the Official Gazette
page refused the request): "No copyright shall subsist in any work of the Government of the
Philippines. However, prior approval of the government agency or office wherein the work is
created shall be necessary for exploitation of such work for profit." RA 10372 (2013) does not
change Sec. 176. This points to free non-profit use of government works, but it is not a
licence: an agency's own terms of use still apply, and 176.3 keeps copyright in outside
material the government republishes (for example co-produced project maps).

| Source (owner, where) | Licence: quote and where | NC / credit / changes / redistribute | Format, coverage, date | Access | Verdict |
|---|---|---|---|---|---|
| **Project NOAH landslide and storm surge hazard maps** (UP NOAH Center; landslide by UP NIGS, storm surge by PAGASA with NIGS). "Downloads" button on noah.up.edu.ph → Google Drive folder `1ALE4-E9c-4AGjm1fqiPprWHrLUskeY9o` | `NOAH_License.pdf` in that folder: "open data licensed under the Open Data Commons Open Database License (ODC-ODbL)… You are free to download, copy, transmit, redistribute, and adapt our data provided that Project NOAH and its contributors are always properly attributed… If you alter or build upon our data, you may only distribute the result under the same license (ODC-ODbL)." The metadata files say the same | Yes / "Project NOAH and its contributors", and the readmes ask to cite their journal papers / yes / yes, but only under ODbL | Shapefile per province, WGS 84, field `HAZ` 1–3 (low, medium, high). Landslide: 82 province files from 1 m LiDAR / 5 m IfSAR. Storm surge: 4 scenario levels (SSA 1–4) for all coastal provinces. Province files dated Nov 2021. Large (Batanes landslide alone is 11.9 MB) | Free, no sign-up. A copy with the identical licence file is on Hugging Face (`bettergovph/project-noah-hazard-maps`) | **Usable** (owner-stated open licence, vector, whole country) |
| MGB 1:10,000 rain-induced landslide susceptibility (DENR MGB). ArcGIS service on `controlmap.mgb.gov.ph`, `GDI_Detailed_Rain_induced_Landslide_Susceptibility` | No licence. Service fields only: copyright "Lands Geological Survey Division Mines and Geosciences Bureau", licenseInfo "Boundaries are approximate". mgb.gov.ph itself blocked automated reads | Not stated | Vector polygons (GeoJSON query), whole country, 1,705,748 polygons, 1:10,000. No date given | Free, no key | **Unclear: ask MGB** |
| NAMRIA Geoportal (`geoportal.gov.ph`): MGB 1:10k landslide and READY 1:50k storm surge layers | Download form (in `geoportal.gov.ph/js/map.js`): "I shall not reproduce, sell or use the requested data for any purpose other than that/those stated above." It asks for name, email, agency and purpose | Download: no redistribution | WMS images; the vector service (WFS) needs a login | Download needs personal details | **Not usable** (download terms forbid reproducing); WMS images unclear |
| NAMRIA Downloads and GeoRiskPH `ulap-hazards` READY maps (MGB 2012, PAGASA) | No licence text; licence fields empty | Not stated | PNG images and image-only map services, 27 provinces, 1:50,000 | Free | **Not usable** (images only, no licence) |
| HazardHunterPH (PHIVOLCS; shows MGB landslide and PAGASA storm surge) | `hazardhunter.georisk.gov.ph/terms-of-use`: "All intellectual property rights are reserved… You must not: Republish material… Redistribute content from HazardHunterPH (unless content is specifically made for redistribution)." | No redistribution | Map services behind an app token | Token | **Not usable** |
| PAGASA storm surge pages | No map download and no licence text. The CC BY 4.0 line covers the public alert feed only | Not stated | Explainer pages only | — | **Unclear: ask PAGASA** |
| HDX (`data.humdata.org`): UNDRR GAR15 storm surge; WFP 2014 landslide index; others | GAR15: "available for free for non commercial purposes…" (nothing on changes or redistribution). WFP: tagged ODbL by WFP, but the data comes from MGB. Others: faults only, one 2014 storm forecast, or tables | GAR15 NC only; WFP not from the owner | GAR15: coastal points, 2015. WFP: one class per province. No real hazard zones | Free | **Unclear / not usable** (coarse, or not the owner's licence) |
| NASA Global Landslide Susceptibility Map (NASA GSFC), `gpm.nasa.gov/applications/landslides` | No licence of its own. NASA's data policy (`earthdata.nasa.gov/…/data-use-guidance`): "Unless the content is marked with a use restriction or license, data provided from a NASA-led mission are licensed as Creative Commons Zero (CC0)." and "NASA should be acknowledged as the source of the material." | Yes / credit NASA / yes / yes | GeoTIFF, about 1 km, worldwide, 5 classes, revised Feb 2023 | Free | **Usable**, but coarse (1 km) |
| NASA LHASA v2 landslide nowcast, `portal.nccs.nasa.gov/datashare/landslides/nrt/` | No licence on the folder; NASA policy as above. The AWS registry lists the archive as "Creative Commons BY 4.0" | Yes / credit NASA / yes / yes | Daily GeoTIFF of landslide probability, about 1 km, 138 MB, readable in parts. README: "NASA provides these data on a best-effort basis, typically twice each day, but with frequent server downtime." Newest file arrived about a day late | Free, no key | **Usable**; could be a best-effort live feed later |
| WRI Aqueduct Floods, coastal (`datasets.wri.org/datasets/aqueduct-floods-hazard-maps`) | Dataset record: "Creative Commons Attribution" (no version given) | Yes / credit WRI / yes / yes | GeoTIFF flood depth, 1 km, worldwide, 2020. Storm surge plus tide, ignores sea walls | Free | **Usable**, but coarse and global |
| Deltares Global Flood Maps (Microsoft Planetary Computer) | `CDLA-Permissive-1.0`: "If You Publish Data You Receive, You must preserve all credit or attribution to the Data Provider(s)" | Yes / credit Deltares / yes, mark the changes / yes | NetCDF flood depth, 90 m or 1 km, worldwide, 2021. Storm surge plus tide; includes a Haiyan 2013 footprint | Free (anonymous token) | **Usable**, but global and from a simple model |
| JRC LISCOAST, COAST-RP, Copernicus GTSM | CC BY 4.0 (JRC: "Reuse is allowed provided appropriate credit is given and any changes are indicated.") | Yes | Water levels at coastal points, not flooded areas. Copernicus needs sign-up | Free (Copernicus: sign-up) | **Not usable as a map** |

Not covered above: NASA's landslide catalogue (past events only; its terms page did not load),
ThinkHazard (one CC BY level per province, no shapes), UP DREAM/LiPAD (flood only; site
did not load), and two World Bank catalogue entries (pages could not be read, so dropped).

**Recommendation.** Use **Project NOAH's** maps for both hazards: they are the only source
that is national, detailed (1 m–5 m elevation data), in vector form, and under a licence the
owner wrote down. Three conditions come with it:
- Credit "Project NOAH and its contributors" (plus the cited papers) on the credits page and
  in the README.
- ODbL share-alike: the simplified shapes the API sends out must also be offered under ODbL,
  with a notice saying so (our reading, not legal advice).
- The storm surge maps are scenarios ("if the surge reaches SSA level N"), not a forecast.

The global maps (NASA, WRI, Deltares) are a fallback only: open, but about 1 km and
worldwide. NASA LHASA could become a best-effort live landslide feed; that is a separate
decision.

**Owner's decisions (2026-11-18).** Show the NOAH landslide and storm surge maps as a map layer
and a line on the status card; they do not change the score (a "zone + heavy rain" score rule
could be tried with the replay later, as a separate decision). The ODbL terms are accepted:
credit on the credits page and in the README, a short ODbL notice for the shapes we send out,
and the NOAH shapes kept in their own table, apart from the score tables. The "Not covered
here" line changes only when the layer ships.

#### NOAH hazard layer: design (approved 2026-11-18)

Based on measuring sample files (Benguet, Siquijor, Leyte, Southern Leyte) in the test
database. M = measured, E = estimated (±50%).

**What the data is.**
- Shapefiles, WGS 84, one zip per province.
  - Landslide: `Landslide/LandslideHazards/<Province>.zip`, 82 files, 12.7 GB zipped.
  - Storm surge: `Storm Surge/StormSurgeAdvisory{1..4}/<Province>.zip`, 67 coastal provinces
    per level, 2.0 GB in all.
- Each file holds three shapes, one per class (1 low, 2 medium, 3 high), each made of up to
  200,000 pieces. The class field is `LH` for landslide (not `HAZ`, despite the metadata) and
  `HAZ` for storm surge. Some files store it as text, some as a number, so parse it as a
  number. The storm surge level is only in the folder name.
- About 1% of pieces are broken shapes; `ST_MakeValid` fixes them all (M). Classes overlap a
  little, so a spot takes the highest class. Storm surge levels mostly nest, but not exactly,
  so all four are stored.
- File names run words together (`MetroManila`), so the loader needs a name → PSGC list. The
  Leyte, Samar and Cotabato zips also hold copies of their neighbours; skip duplicate `.shp`
  names.
- Storm surge levels, in NOAH's current wording (metadata of Aug 2025): SSA 1 up to 2 m,
  SSA 2 up to 3 m, SSA 3 up to 4 m, SSA 4 more than 4 m. The mirror's old readme says
  otherwise; use NOAH's wording.
- Mountain provinces are mostly "high" landslide (most of Benguet), so the card will say
  "high" for most clicks there. That is what the map says, not a mistake.

**Size is the main problem.** Landslide is about 44 million pieces, about 20 GB in the
database at full detail (E). Storm surge is about a tenth of that. Even simplified, landslide
cannot be sent as one GeoJSON file the way provinces and towns are.

**Design.**
1. **Source:** the Hugging Face mirror `bettergovph/project-noah-hazard-maps`. Its files are
   byte for byte the same as NOAH's Drive folder (M). It has a file list API and a SHA-256 per
   file, so each download can be checked, and it is about twice as fast. Drive needs
   undocumented page scraping. Credit stays "Project NOAH and its contributors".
2. **Loader, `npm run load-hazards`:** one province zip at a time.
   - Download into `data/hazards/`, check the hash, unzip with the `unzip` command (already
     used by `replay.ts`), read the shapefile.
   - Split into pieces, drop pieces under 1,000 m², simplify
     (`ST_SimplifyPreserveTopology` 0.0002°, edges move about 20 m), make valid,
     `ST_Subdivide(256)` so lookups stay fast.
   - Replace that province's rows in one transaction, so a re-run is safe.
   - The zip is deleted after loading.
   - Storm surge loads in minutes; landslide takes about 2–3 hours (E).
3. **Tables (own section in `schema.sql`):**
   - `hazard_zones` (kind, scenario 1–4 or none, class 1–3, province PSGC, geom, GIST index).
   - `hazard_coverage` (kind, province, source file, loaded at). Coverage tells "no data"
     apart from "not in a zone". Unknown is never calm: a province with no file shows "no
     hazard map here".
   - Stored size about 0.25 GB for storm surge and about 2.5 GB for landslide (E). The disk
     has 47 GB free.
4. **Map: vector tiles from our own `/api`.** Route `GET /api/hazards/tiles/:layer/:z/:x/:y.mvt`
   (layer `landslide` or `surge1`…`surge4`),
   built by PostGIS `ST_AsMVT`, with cache headers. MapLibre reads them as a `vector` source,
   so the "only our `/api`" rule holds.
   - Storm surge zones show from zoom 4 (the whole country), landslide from zoom 9; below
     that the legend says "zoom in to see zones". Below zoom 9 a surge zone is thinner than a
     pixel, so the map draws zone outlines in the class colour instead of stripes, and the
     server keeps pieces down to a quarter pixel there (tiles measured under 120 KB, 300 ms).
   - The map shows storm surge level 4 (the widest); the card covers all four levels.
   - Zones are cool-toned stripes (a generalised `hatchImage` in `palette.ts`, new
     `--hazard-*` variables in both themes), denser for higher classes, high drawn on top.
     They are never warm colours, so the score colours stay readable underneath.
   - Both tick boxes are off by default.
5. **Status card:** a short "Hazard map" block right under the hazard rows, with the new tag
   `tiers.hazardMap`. Each line is answered for the clicked spot:
   - "Landslide: high", "not in a zone", or "no hazard map here".
   - Storm surge for levels 1–4: the class for each level, or "not reached".
   - The block notes that these are scenarios, not a forecast, and do not change the score.
   - Comes from `/api/point` (`PointDetail.hazardZones`, new `server/src/hazardZones.ts`).
6. **Credits and notices:** Project NOAH on the credits page, README, `docs/data-sources.md`.
   An ODbL notice for the shapes we send, in the README licence section and in the map's
   attribution line. Drop "landslides, storm surge" from "Not covered here" (en and fil),
   METHODOLOGY.md and `docs/privacy-and-limits.md`, saying instead "fixed hazard map, not
   live".
7. **Order of work:** storm surge first, from start to finish (loader, tiles, map, card,
   credits). Then measure tile speed, then load landslide with the same code. Most of the risk
   is in landslide's size, and storm surge tests the whole pipeline at a tenth of the size.

**Left out for now:** NOAH's debris flow / alluvial fan maps (2 national files), the mirror's
ready-made PMTiles (they would load from outside our `/api`), and checking Drive for NOAH
updates (later: compare file sizes with the mirror).

**Owner's decisions (2026-11-18):** storm surge first, then landslide (7); read shapefiles
with the npm `shapefile` package (one new server dependency); delete each zip after loading.

**Build notes (storm surge, 2026-11-19).**
- Loaded: 268 files, all 4 levels, 69 provinces with zones (72 with coverage, counting NCR
  districts, Davao de Oro, Maguindanao del Sur and City of Isabela). 667,000 zone pieces,
  253 MB with indexes. The full load took 24 minutes; a re-run is safe.
- Name overrides live in `NAME_OVERRIDES` (`server/src/hazardLoad.ts`): `MetroManila` → the
  four NCR districts, `CompostelaValley` → Davao de Oro, `Maguindanao` → del Norte and del Sur,
  `Basilan` → Basilan and City of Isabela. `Cotabato.zip` for storm surge is the same file as
  `SouthCotabato.zip`, and Cotabato has no coast, so it has no coverage.
- A file with a missing or bad class is refused whole, so a gap never reads as "not in a zone".
- Tiles: zoom 9 tiles over Leyte, Manila and Cebu take under 50 ms. Pieces under one screen
  pixel are left out, and the rest simplified to half a pixel. The server keeps 2,000 tiles in
  memory: **restart it after loading new hazard files.**
- `--try <folder>` runs the whole pipeline on local files and rolls back (used for landslide
  samples: Benguet 24,275 zones in 4 minutes).
- **Landslide is slow to read:** the `shapefile` package matches holes to outer rings slowly
  (Benguet's 64 MB took about 4 minutes before the database did any work), so 12.7 GB could take
  well over the 2–3 hours estimated. Faster ring matching of our own is the next decision.
- The card tag reads "Fixed map · Project NOAH" (the section title already says "Hazard map").

## Per-town map colours (approved 2026-11-17, done)

Built and merged 2026-11-18 (PRs #3 and #4). Changes made after this design, which win where the
text below differs:
- **Towns are coloured at every zoom level** (PR #4), not only from zoom 8, so a town never shows
  its province's highest town. Province colours show only until the town shapes have loaded,
  and the shapes are downloaded when the map first loads.
- **The card's main number is the town's score**, the same one that colours the town on the
  map, hazard by hazard (`place_scores.hazards`). The exact spot's own score is a smaller line.
- `province_weather_points` was dropped; the grid replaced it.


**Problem.** The map colours whole provinces, using the worst of up to 3 weather points. The
card scores the exact spot. Clicking Kiamba gives 12 on the card, while the map under it says
"Sarangani: 21". **Goal:** colour each of the 1,642 cities and municipalities, so the colour
under a click belongs to that town.

### Weather budget (Open-Meteo terms, checked 2026-11-17)

Free limits: 600 calls a minute, 5,000 an hour, 10,000 a day, 300,000 a month. The docs don't
say how a request with many locations is counted, so we count each location as one call.

| | Points | Runs a day | Calls a day |
|---|---|---|---|
| Today: province points + extras | 197 | 24 (hourly) | 4,728 |
| Today: outlook + river flow | 88 × 2 | 4 | 704 |
| One point per town, hourly | 1,642 | 24 | 39,408 (far too many) |
| **Proposed grid, every 2 hours** | **599** | **12** | **7,188** |
| Coarser grid instead, hourly | 301 | 24 | 7,224 |

The proposed grid plus the outlook is about 7,900 calls a day, which leaves about 2,100 for
card clicks. Each click asks for one ~5.5 km cell, and the answer is reused for 30 minutes.

**Why every 2 hours is acceptable.** Each fetch already brings back the last 24 hours, so no
rain is missed for the 24-hour total. The global models behind Open-Meteo publish new runs only
every few hours, so an hourly fetch mostly re-reads the same run. The cost is that the "last
hour" of rain can be up to 2 hours old.

**Pacing.** 599 locations in one burst would come close to the 600-a-minute limit. The job
waits about 10 seconds between its 12 requests, which spreads one run over about 2 minutes.

### Grid design

- A 0.25° square grid (about 28 km). A cell gets a point only if at least a quarter of it is
  land. The point is the cell's centre, or a point on its land when the centre is in the sea.
  That gives 482 points.
- Every province's own weather point is kept, so small islands always have one. That adds 88.
- A town gets the worst reading of the grid points inside it (most rain, hottest point, the
  same rule as `worstReading`). Most towns are smaller than a cell (median 112 km², a cell is
  about 770 km²). Those take their nearest point, which is under 30 km away.
- Measured: 29 small-island towns are more than 30 km from any point. They are in Batanes,
  Sulu, Tawi-Tawi, the Palawan islands, Calayan and similar places; Kalayaan is about 430 km
  away. Each gets a point of its own (599 in all).
- Provinces take the worst of the points inside them. That replaced `province_weather_points`
  and the old `npm run weather-points` from audit Phase 3.

### Database

```
weather_points        id, geom, kind ('grid' | 'province' | 'town')    built once by a script
place_weather_points  place_psgc, point_id    the points inside the town, or its nearest one
point_readings        point_id, valid_at, temp, humidity, heat index, rain 1h/24h
                      (only the last 2 days are kept)
place_scores          place_psgc, score, quake/weather/event parts, unknown_signals, reasons,
                      computed_at    one row per town, replaced on every run
```

- `weather_readings` (per province) keeps being written, so the province card and history are
  unchanged.
- **No town history for now.** It would add about 158,000 rows a day. Phase 4's score history
  decides that.

### Scoring (`computeScores`)

- **Same formulas, new unit.** Quakes and GDACS events are measured from the epicentre or event
  to the town's edge (0 if inside), using the same radius, reach and fading as provinces. This
  runs in SQL at score time, because there are only a few dozen recent quakes and events. The
  existing map index on `places.geom` narrows the search down first.
- **Missing data carries over.** Stale feeds count as unknown for every town (from
  `staleSignals`, as today). A town whose weather points all failed gets `weather = null`. The
  town then shows "at least N" and gets stripes.
- **Province colour (owner's choice).**
  - Recommended: the province score becomes the highest town score in it, with that town's
    reasons. The province is striped if any town is. "Sarangani: 21" then always matches a
    real town, and the hover can name it.
  - The other option keeps today's province formula, fed by the same grid. The province number
    is then close to its worst town, but not always equal.
- **Freshness.** With a run every 2 hours, the weather limit in `FEED_RULES` goes from 150 to
  270 minutes, and `WEIGHTS.weather.maxAgeHours` from 3 to 4.5. As today, that lets one failed
  run pass before the page warns. "Fresh enough" becomes at least 90% of points answered.
  METHODOLOGY.md gets updated.

### API

- `GET /api/places/shapes` returns GeoJSON of the town shapes, simplified to about 500 m
  (742 kB raw, 37,557 vertices), with `psgc`, `name` and `province_psgc`. The server keeps it
  in memory, and the browser downloads it once, the first time the reader zooms in to about
  7.5.
- `GET /api/places/scores` returns `{ computedAt, places: [{ psgc, score, incomplete }] }`,
  about 50 kB. It reloads every 5 minutes with the rest of the page.
- The browser joins the two by `psgc`. New shared types go in `shared/src/types.ts`.

### Map

- Province colours below zoom 8. From 7.5 to 8.5 the town colours fade in and the province fill
  fades out. Province outlines stay drawn; town outlines are thin.
- Hover shows "Kiamba, Sarangani: 12" (or "at least 12"). Incomplete towns get the same
  stripes. Clicking still opens the card for the exact spot.
- Known side effect: the database can't keep shared edges while simplifying (its geometry
  library is too old for that), so neighbouring towns may show slivers of up to about 500 m
  at high zoom. A faint province fill left underneath hides most of them.
- The card stays per spot (`pointWeather.ts`). It uses a 5.5 km cell, while the town uses its
  grid point, so the two can still differ by a few points. That is far less than today's
  21 against 12.

### Build steps (each ends with `npm test` + `npm run typecheck`, and something to see)

1. Schema plus a rewritten `npm run weather-points` that builds the grid and the town links.
   You should see "599 points; 1,642 towns linked".
2. The weather job fetches points with pacing, saves `point_readings`, and keeps writing
   province readings. You should see "Weather: 599 points, saved N".
3. Town scores in `computeScores`, plus the province rule the owner picks. You should see
   "Scores: 88 provinces, 1,642 towns".
4. The two API routes. `curl /api/places/scores | head` shows them.
5. The town layer, hover text, stripes and legend note, with the new strings in en/fil.
6. METHODOLOGY.md, docs/how-it-works.md and docs/data-sources.md.

**Owner's decisions (2026-11-17):** (a) a province shows its highest town score; (b) the 0.25°
grid, fetched every 2 hours.

**Progress:** steps 1–6 done (2026-11-17). Also added: the picked spot's town gets a thick
outline, the card shows the whole town's score next to the province's, and the province hover
names its highest town. `province_weather_points` was dropped (2026-11-18).

## Amendments (2026-11-15, after step 1)

These override the original text below where they differ.

- **Heat index** is computed by us from temperature + relative humidity with the NWS (Rothfusz)
  formula that PAGASA uses, instead of Open-Meteo's `apparent_temperature`. We fetch
  `relative_humidity_2m` and store `humidity_pct` and `heat_index_c` (replacing
  `apparent_temp_c` / `apparentTempC`).
- **Identity**: no branding yet. "PH Monitor" is a placeholder kept in one constant
  (`shared/src/appInfo.ts`). Plain, neutral UI: no logo, no custom fonts, no colour theme beyond
  the score scale.
- **Git**: one commit per step, with Conventional Commits messages.
- **Docs**: add a short `CLAUDE.md` for future Claude sessions; keep README brief.

## After Phase 1

- **Spot scores** (the "my city" idea, first part): cities and municipalities are loaded into a
  `places` table, `GET /api/point?lat=&lon=` scores one exact spot on demand, and a map click
  opens the card for that spot. A place-name search box is the planned next step.

## Context

PH Monitor is a Philippines real-time risk dashboard. Phase 1 delivers one thing: a map of
provinces coloured by a 0–100 "stress right now" score built from earthquakes (USGS) and weather
stress (Open-Meteo), with a status card on click showing the score, the reasons and the raw events.
The project folder is empty, so everything is new. Code is TypeScript everywhere with simple
types, small files, short comments, and each step is runnable on its own.

Out of scope: news, AI briefs, typhoon tracks, hazard maps, "my city" view, user accounts.

## Verified facts (checked 2026-11-15)

- **USGS** `earthquake.usgs.gov/fdsnws/event/1/query?format=geojson` with a PH bounding box
  (lat 4.5–21.5, lon 116–127): works, no key, public domain.
- **Open-Meteo** `api.open-meteo.com/v1/forecast`: works, no key, accepts comma-separated lists of
  coordinates. Free tier is non-commercial, ~10,000 calls/day, data CC BY 4.0 (credit required).
  Owner confirmed the project is non-commercial.
- **Boundaries**: `faeldon/philippines-json-maps` (PSGC 3Q 2026). 18 files at
  `latest/geojson/regions/medres/provdists-region-<code>.0.01.json`, ~5 MB total. Properties:
  `adm2_psgc`, `adm2_en`, `adm1_psgc`, `geo_level`. Coordinates are WGS84 (EPSG:4326).
  Repo is MIT; boundaries are CC BY 3.0 IGO (NAMRIA + PSA via OCHA COD-AB) — credit required.
  Metro Manila appears as districts, not a province.
- **Database**: PostgreSQL with PostGIS (`postgis/postgis:17-3.5`) runs in Docker on port
  **5433**, so it cannot clash with a PostgreSQL already installed on 5432.

## Decisions

- **Earthquake matching (owner's choice): radius by magnitude.** A quake affects every province
  within `radiusKm(magnitude)`; closer means stronger. Point-in-polygon (`ST_Contains`) is still
  used to label the epicentre's province when it is on land.
- **Distances** are computed with `::geography` (PostGIS's "real Earth" mode, which returns
  metres; we divide by 1000 for km) and measured from the epicentre to the province's
  **boundary**, not its centre: `ST_Distance(p.geom::geography, q.geom::geography)`. This is 0
  when the epicentre is inside the province. Matching uses `ST_DWithin` on the same geography
  values.
- **Depth weakens a quake**: deeper = less shaking at the surface. Documented in METHODOLOGY.md.
- **Weather**: one reading per province, taken at a point guaranteed to be inside it
  (`ST_PointOnSurface`). Recorded in METHODOLOGY.md as a known limitation (a large or mountainous
  province can differ a lot from its one sample point). Open-Meteo values are **modelled** (from
  weather models, not a station reading), so the time column is `valid_at` — the time the value
  is valid for — and METHODOLOGY.md says so.
- **Score history**: every recompute also appends to `province_score_history`.
- **Freshness**: the status card shows "last updated"; data older than 1 hour is marked stale.
  Earthquake freshness is the time of the last successful USGS fetch (a quiet day with no quakes
  is not stale), so the API reports `lastFetch` times alongside `computedAt`.
- **`docker-compose.yml` sets `name: ph-monitor` at the top**, so Docker names the project (and
  its database volume) from that line instead of the folder name; renaming the folder doesn't
  orphan the data.
- **Schedule**: earthquakes every 15 min, weather every 30 min (~4,200 Open-Meteo calls/day),
  scores recomputed after each fetch.
- **Combining signals**: strongest signal counts in full, the other adds a fraction, capped at
  100. Averaging would hide a severe earthquake behind calm weather. (My call — easy to change in
  the scoring file.)
- **No secrets are actually needed** (both APIs are keyless). `.env` holds the database URL and
  ports; the frontend only ever talks to our own backend.
- **TypeScript everywhere, strict mode on** (owner's choice). Backend runs in dev with `tsx`
  (runs `.ts` files directly, no separate compile step). Types stay simple: plain `type`
  definitions, no advanced generics. Each TypeScript-specific piece of syntax gets a one-line
  explanation the first time it appears.
- **zod validates feed data before it is saved.** One zod schema per feed (USGS, Open-Meteo) in
  the fetcher file. A record that doesn't match is skipped and logged, never stored. The feed's
  TypeScript type is derived from the schema (`z.infer`), so the two can't drift apart.
- **Shared types in one `shared/` folder**, used by both backend and frontend: `Province`,
  `HazardEvent`, `ProvinceScore`, plus the API response shapes. Wired up with npm workspaces
  (one root `package.json` that links the three folders) and imported as `@ph-monitor/shared`.
  It exports `.ts` source directly, so there is no build step for it.
- deck.gl is not needed for Phase 1.
- **Basemap**: OpenFreeMap (free, no key) — to be reachability-checked in step 8; fallback is a
  plain background with province shapes only.

## Folder structure

```
ph-monitor/
├── package.json               # npm workspaces: links shared, server, web
├── tsconfig.base.json         # strict TypeScript settings all three extend
├── docker-compose.yml         # the PostGIS database
├── .env.example               # copy to .env (which is git-ignored)
├── .gitignore
├── README.md                  # how to run, data credits
├── METHODOLOGY.md             # how the score is calculated
├── shared/
│   ├── package.json           # name: @ph-monitor/shared
│   └── src/
│       ├── types.ts           # Province, HazardEvent, ProvinceScore, API shapes
│       └── index.ts           # re-exports
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── db/schema.sql          # all tables
│   ├── scripts/
│   │   ├── migrate.ts         # applies schema.sql
│   │   └── load-provinces.ts  # downloads the 18 files, inserts provinces
│   ├── src/
│   │   ├── index.ts           # starts Express + the scheduler
│   │   ├── config.ts          # reads .env (checked with zod)
│   │   ├── db.ts              # database connection
│   │   ├── scoring/scoring.ts # THE scoring file: weights + formulas, nothing else
│   │   ├── fetchers/usgs.ts       # fetch + zod schema for the USGS feed
│   │   ├── fetchers/openMeteo.ts  # fetch + zod schema for Open-Meteo
│   │   ├── jobs/ingestEarthquakes.ts
│   │   ├── jobs/ingestWeather.ts
│   │   ├── jobs/computeScores.ts
│   │   ├── jobs/scheduler.ts  # node-cron timers
│   │   └── routes/provinces.ts
│   └── test/                  # Node's built-in test runner, run through tsx
│       ├── scoring.test.ts
│       └── fetchers.test.ts   # zod schemas accept good samples, reject bad ones
└── web/                       # Vite + React (TypeScript template)
    ├── tsconfig.json
    └── src/
        ├── App.tsx
        ├── api.ts             # typed fetch helpers for /api
        └── components/        # ProvinceMap.tsx, StatusCard.tsx, Legend.tsx
```

### Shared types (sketch)

```ts
export type Province = { psgc: number; name: string; regionPsgc: number; geoLevel: 'Prov' | 'Dist' };

export type HazardEvent =
  | { kind: 'earthquake'; id: string; magnitude: number; depthKm: number | null; place: string | null;
      occurredAt: string; distanceKm: number; url: string | null }
  | { kind: 'weather'; validAt: string; tempC: number | null; apparentTempC: number | null;
      rain1hMm: number | null; rain24hMm: number | null };

export type ProvinceScore = { psgc: number; score: number; quakeScore: number; weatherScore: number;
  reasons: string[]; computedAt: string };

export type Freshness = { earthquakesFetchedAt: string | null; weatherFetchedAt: string | null;
  isStale: boolean };   // stale = either fetch is more than 1 hour old

export type ProvinceDetail = { province: Province; score: ProvinceScore; events: HazardEvent[];
  freshness: Freshness };
```

## Database schema

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE provinces (
  psgc          BIGINT PRIMARY KEY,            -- adm2_psgc
  name          TEXT NOT NULL,
  region_psgc   BIGINT NOT NULL,
  geo_level     TEXT NOT NULL,                 -- 'Prov' or 'Dist'
  geom          geometry(MultiPolygon, 4326) NOT NULL,
  weather_point geometry(Point, 4326) NOT NULL -- where we sample weather
);
CREATE INDEX provinces_geom_idx ON provinces USING GIST (geom);

CREATE TABLE earthquakes (
  id             TEXT PRIMARY KEY,             -- USGS event id
  magnitude      REAL NOT NULL,
  depth_km       REAL,
  place          TEXT,
  occurred_at    TIMESTAMPTZ NOT NULL,
  url            TEXT,
  geom           geometry(Point, 4326) NOT NULL,
  epicenter_psgc BIGINT REFERENCES provinces,  -- NULL when offshore
  raw            JSONB NOT NULL,               -- original USGS record
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX earthquakes_time_idx ON earthquakes (occurred_at);

CREATE TABLE earthquake_provinces (            -- which provinces a quake affects
  earthquake_id TEXT   REFERENCES earthquakes ON DELETE CASCADE,
  province_psgc BIGINT REFERENCES provinces,
  distance_km   REAL NOT NULL,                 -- to the province boundary; 0 if inside
  PRIMARY KEY (earthquake_id, province_psgc)
);

CREATE TABLE weather_readings (
  province_psgc   BIGINT REFERENCES provinces,
  valid_at        TIMESTAMPTZ NOT NULL,        -- time the modelled value is valid for
  temp_c          REAL,
  apparent_temp_c REAL,                        -- "feels like"
  rain_1h_mm      REAL,
  rain_24h_mm     REAL,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (province_psgc, valid_at)
);

CREATE TABLE province_scores (                 -- latest score per province
  province_psgc BIGINT PRIMARY KEY REFERENCES provinces,
  score         SMALLINT NOT NULL,             -- 0–100
  quake_score   SMALLINT NOT NULL,
  weather_score SMALLINT NOT NULL,
  reasons       JSONB NOT NULL,                -- short human-readable list
  computed_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE province_score_history (          -- one row per province per recompute
  province_psgc BIGINT REFERENCES provinces,
  score         SMALLINT NOT NULL,
  computed_at   TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (province_psgc, computed_at)
);

CREATE TABLE fetch_runs (                      -- when each feed last succeeded (for "stale")
  source      TEXT PRIMARY KEY,                -- 'usgs' or 'open-meteo'
  last_ok_at  TIMESTAMPTZ NOT NULL
);
```

`fetch_runs` is my addition: it is what lets the card tell "no quakes lately" apart from "the
earthquake fetch has been failing". History grows by ~90 rows per recompute (~3 million a year
at 15-minute runs), which is fine for Phase 1; pruning can come later.

Re-fetching is safe: inserts use `ON CONFLICT` so the same quake or reading is updated, not
duplicated.

## Scoring (all in `server/src/scoring/scoring.ts`)

One `WEIGHTS` object at the top, then pure functions (same input → same output, no database), so
they are easy to test and tune:

- `radiusKm(mag)` — `50 × 2^(mag − 4)`, capped at 400 km (M4 → 50, M5 → 100, M6 → 200, M7 → 400).
- `quakeScore(quakes)` — per quake: magnitude strength × distance fade × **depth fade** × time
  fade (window 72 h, minimum M4.0); take the strongest, plus a small bonus for several quakes.
  Depth fade starts at 1.0 for shallow quakes (≤ 20 km) and falls smoothly with depth down to a
  floor (e.g. 0.3 at 300 km+); unknown depth is treated as shallow. All numbers live in `WEIGHTS`.
- `weatherScore(reading)` — the higher of a rain score (1-hour and 24-hour rain against PAGASA-style
  warning thresholds) and a heat score ("feels like" temperature against PAGASA heat-index bands).
- `totalScore(quake, weather)` — strongest + `secondaryWeight` × the other, capped at 100.
- `buildReasons(...)` — the sentences shown on the card.

Initial threshold numbers are starting guesses, documented in METHODOLOGY.md as such.

## API

- `GET /api/health`
- `GET /api/provinces` — GeoJSON of all provinces (shapes simplified by PostGIS for speed, cached
  in memory) with `score`, `quake_score`, `weather_score` in each feature's properties.
- `GET /api/provinces/:psgc` — score, reasons, earthquakes (with distance), latest weather, and
  freshness (last fetch times + stale flag).

## Build steps (each ends with something to run and see)

0. **Setup**: `git init`, `.gitignore`, `.env.example`, `docker-compose.yml`, root workspace
   `package.json`, `tsconfig.base.json` (strict), and the `shared/` types.
   Check: `docker compose up -d`, then `SELECT postgis_version();` returns a version;
   `npm run typecheck` (runs `tsc --noEmit`, which checks types without producing files) passes.
1. **Schema**: `schema.sql` + `migrate.ts`. Check: `\dt` lists the seven tables.
2. **Provinces**: `load-provinces.ts` (zod-checks each boundary feature's properties).
   Check: row count (~80+ provinces and NCR districts), and a query that a Cebu City coordinate
   falls inside "Cebu".
3. **Earthquakes**: zod schema test first, then fetcher + ingest job, run by hand.
   Check: rows in `earthquakes`, and `earthquake_provinces` shows an offshore quake linked to
   nearby provinces with distances.
4. **Weather**: zod schema test first, then fetcher + ingest job, run by hand.
   Check: one fresh reading per province.
5. **Scoring**: tests first for `scoring.ts`, then the file, then `computeScores.ts`.
   Check: `npm test` passes (including "deeper quake scores lower"); `province_scores` has a row
   per province and `province_score_history` gains a row per province on each run.
6. **API**: Express routes. Check: open the three URLs in a browser / `curl`.
7. **Scheduler**: node-cron wiring in `index.ts`. Check: server log shows runs on the timers.
8. **Map**: Vite + React + MapLibre, provinces coloured by score, legend, credits line.
   Check: the map shows in the browser and colours match the API.
9. **Status card**: click a province → card with score, reasons, raw events, "last updated", and
   a stale badge when data is over 1 hour old. Check: stop the server's scheduler for an hour (or
   backdate `fetch_runs` by hand) and see the badge appear.
10. **Docs**: `README.md` (run instructions, data sources, licenses) and `METHODOLOGY.md`: the
    formula, the depth factor, boundary-distance matching, weather being modelled data
    (`valid_at`), and one weather point per province as a known limitation.

I stop after each step, say what to run and what you should see, and continue once it works.

## End-to-end verification

1. `docker compose up -d`, `npm run migrate`, `npm run load-provinces`, `npm run dev` in `server/`
   and `web/`.
2. Pick a real recent quake from the USGS site; confirm the provinces near it are coloured and the
   card lists that quake with a sensible distance.
3. Compare one province's card weather numbers with open-meteo.com for the same spot.
4. Change a weight in `scoring.ts`, rerun the score job, see the map change.
5. `npm run typecheck` and `npm test` pass across all three workspaces.
6. Feed a deliberately broken USGS record to the ingest job; it is logged and skipped, not saved.
7. Search the built frontend (`web/dist`) for the database URL — it must not appear.
