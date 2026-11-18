# PH Monitor — plan

> **Phase 2 below is the current plan (built; Filipino text awaits review; see "Progress").**
> Reliability work from the audit has its own phases: see "Reliability roadmap".
> Everything from "Amendments" down is the historical Phase 1 plan, kept for reference; it has
> not been kept up to date. Where it differs, [README.md](README.md),
> [METHODOLOGY.md](METHODOLOGY.md) and the code are correct.

## Phase 2 — disaster conditions, forecasts, news, Filipino (planned 2026-11-15)

Goal: keep the province map and score, and add what is happening now, what is coming, and what
the news says, focused only on disasters. This replaces Phase 1's "out of scope" line for news
and typhoon tracks.

### Progress (updated 2026-11-16, branch `phase-2`)

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
| 9. Filipino option | Built as a draft. Every string in `web/src/i18n/fil.ts` is marked `// REVIEW` and waits for the owner's review |
| 10. AI summaries | Skipped |

Next: the owner reviews the Filipino text and the page; then the open questions below.

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

1. **Disaster events** (server done; map and card to do): GDACS + EONET fetchers (zod schemas, tests first) → new `events` table
   (kind, alert level, time, geometry, source, link) → markers on the map, listed on the status
   card. Check: a recent GDACS PH event (e.g. a Kanlaon eruption) shows on the map.
2. **Events in the score** (done): GDACS alert level near a province adds to its score, in
   `scoring.ts`, with METHODOLOGY.md updated. Check: `npm test`, and a province beside an Orange
   event scores higher. As built: Green/Orange/Red give 10/50/80 points within 100/200/300 km;
   only typhoons, floods, volcanoes and wildfires count (quakes are already scored from USGS);
   the score is the strongest signal plus 25% of each of the other two.
3. **Typhoon tracks** (server done; map layer to do): JMA (main) + JTWC (backup) → `storms` and `storm_track_points` tables →
   past and forecast track drawn on the map; provinces near the forecast track get a "coming"
   flag. Check: with no storm the layer is empty; a saved sample storm draws correctly
   (`npm run sample-storm`, and `npm run sample-storm -- remove` to delete it).
4. **Outlook ("next 7 days")** (server done; card row to do): Open-Meteo daily rain + gusts, and flood discharge, per province
   → shown on the status card as a short day-by-day row. The "now" score stays separate from the
   outlook. Check: card numbers match open-meteo.com for the same spot. As built: fetched every
   6 hours, about 704 Open-Meteo calls a day (about 4,900 with the weather job, of 10,000).
5. **News panel** (server done; panel to do): fetch the RSS feeds every 15 min → keep only disaster headlines (keyword list
   in English and Filipino, e.g. bagyo, baha, lindol, pagputok, landslide, storm surge) → merge
   the same story from several outlets → tag a province when the headline names one → `news`
   table. Each outlet has a category (see "Outlet categories" below), and the panel can filter by
   it. UI: "Latest" list, and "News near here" on the status card. Each item links to the
   original article (headline + outlet + category + time only, no article text). Check: the list
   shows today's PH disaster headlines with no duplicates, and the category filter works.
   Known limits: some duplicates are missed, and repeated stories about one long-running event
   merge into one row within 48 hours.
6. **Live streams panel** (data ready; panel to do): a short list of PH YouTube channels,
   grouped by the same outlet categories. Each slot shows the channel's live stream when it is
   live ("LIVE"), otherwise its latest video ("Latest"), with the title and upload time.
   12 slots passed the check: PAGASA, Civil Defense PH, PTV, GMA News, ABS-CBN News (backup:
   ANC), UNTV, One News PH, DZRH, DZBB, Rappler, INQUIRER.net, Bombo Radyo. Dropped: PHIVOLCS and
   DZMM (the channels found were not the real ones), News5 (not found), SunStar (dormant). Shown in YouTube's own player through `youtube-nocookie.com`, which only
   loads YouTube when the viewer presses play. YouTube embeds only; no re-streaming of raw TV
   feeds (`.m3u8`). Each slot can list backup links, tried in order. This is the one exception to
   "the web app talks only to our own `/api`" besides the basemap; CLAUDE.md is updated to say
   so when this is built. Check: a live slot plays, and a slot whose links are all dead is hidden.
7. **Link checker** (done; for news feeds and live streams): a `sources` table holds every feed
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
   - Known limit: on a channel that uploads very often, a live stream that started hours before
     the server did can be missed (it is no longer among the newest 50 uploads). A known video
     ID can be pinned in `sources.ts` for such a case.
   - `npm run check:sources` runs it by hand and prints a table of what is broken and why.
   - The UI hides dead links and never shows a stream as live unless the check said so.
   - Link lists live in one file (`server/src/sources.ts`) so a dead link is fixed in one place.
   Check: put a fake link in the list, run the checker, see it marked `dead` and hidden.
8. **Official PH bulletins (skipped for now)**: PAGASA wind signal numbers and rainfall
   warnings, PHIVOLCS volcano alert levels. These are the official PH warnings the global feeds
   do not carry, but there is no API, so we would have to scrape web pages. Do this only after
   checking their terms of use, and keep it isolated so a page change cannot break the rest.
   Instead, the status card gets plain links to the PAGASA and PHIVOLCS bulletin pages.
9. **Filipino option** (to do): an English / Filipino switch in the page header, remembered in the
   browser. Details below. Check: switching changes every label, the legend, the disclaimer, the
   card and the outlet category names, with no English left over.
10. **AI summaries (skipped for now)**: a short "what is happening" brief from the news and
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
- Pin video IDs for long-running live streams on busy channels, or accept the known limit?
- The Filipino labels are drafts until the owner has reviewed them (step 9).
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

## Reliability roadmap (from the audit of 2026-11-16)

Goal: make what exists more reliable and trustworthy, not add features. These phases are
numbered on their own, separate from the product phases above. Finding numbers (1.1 to 1.20)
refer to the audit report.

| Phase | Goal | Status |
|---|---|---|
| 1 | Data integrity: unknown is never calm, `/api/status` and banner, close dropped events, retries, wording | Built, not committed |
| 2 | Official warnings: PAGASA alert feed, three-tier labels, official block at the top of the card | Built, not committed |
| 3 | Geography and hazards: storm distance to the track line, JTWC fallback, extra weather points, "not covered" list, per-hazard levels | Built, not committed |
| 4 | Stability: jobs run only when due (1.11), score history with part-scores (1.12), database tests in CI, historical replay (results: `docs/replay-results.md`) | Built, not committed. Deployment basics (1.13) skipped for now: no plan to go online soon |
| 5 | Experience: place search and "use my location" (1.17), card order (1.18), keyboard and touch (1.19), Filipino review, news fixes (1.14, 1.15) | Built, not committed. 5.4: headlines sorted into nine kinds of disaster (owner's choice). 5.5: owner read all 230 Filipino lines on 2026-11-17 and changed three ("lalawigan/probinsya" everywhere, "Ayon sa uri ng banta"); every line still has its `// REVIEW` mark, as asked |
| 6 | Later: see below | Replay has run; not started |

### Phase 6 — later

Starts only after Phase 4's historical replay has run, because its main job is acting on what
the replay shows.

- **Tune the weights from replay results.** Change `WEIGHTS` in `scoring.ts` only where the
  replay shows a clear miss: a known disaster that never reached "High" at the right time, or
  an ordinary week with false "High" readings. Tests first; update METHODOLOGY.md.
- **Headline number.** Decide whether the total stays "strongest + 0.25 × each other" or
  becomes the worst single hazard. Today rain 39 plus earthquakes 6 gives 41 ("Moderate")
  when no single hazard is above "Low". Owner's call; the replay helps decide.
- **USGS impact fields (1.10).** USGS's PAGER `alert`, `mmi` (shaking intensity) and
  `tsunami` are already saved in `raw` but not used. Use them in the earthquake signal, or
  at least show them on the card.
- **Landslide and storm surge maps.** There is no live feed for either. Static hazard maps
  (for example government geohazard maps) could mark areas at risk, but only if their licence
  allows reuse with credit. Check the licence first; if none allows it, keep the "not
  covered" line on the card.
- **Man-made disasters in the headlines.** Step 5.4 sorts headlines into nine natural types
  (the owner's list plus extreme heat). Building fires and garbage, landfill or mine
  collapses are disasters too, but man-made; the owner chose to leave them out for now
  (2026-11-17). A later "Man-made" group could bring them back.

Small leftovers with no phase: a repeated identical headline is dropped for 14 days (1.16),
and a few outdated comments (1.20).

## Per-town map colours (approved 2026-11-17, being built)

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
- Provinces take the worst of the points inside them. That replaces `province_weather_points`
  and `npm run weather-points`, which were built in audit Phase 3 and are not committed yet.

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
