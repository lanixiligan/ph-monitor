# How the score is calculated

Each city and municipality ("town") gets a score from 0 (calm) to 100 (severe) describing
stress **right now** from three signals: recent earthquakes, current weather, and disaster
events with an alert level. A province shows the score of its highest town (see "Towns and
provinces" below). Every number below is a constant in `WEIGHTS` at the top of
`server/src/scoring/scoring.ts`.

**All thresholds are starting guesses, not calibrated values.** They are meant to be tuned.

**The score is not a forecast or an official warning.** It has not been checked against past
events. For official warnings, follow PAGASA (weather) and PHIVOLCS (earthquakes and volcanoes).

## Earthquake score

Source: USGS, magnitude 4.0 and above, last 72 hours.

**Which provinces a quake affects.** Every province within a radius that grows with magnitude:
`50 km × 2^(magnitude − 4)`, at most 400 km (M4 → 50, M5 → 100, M6 → 200, M7+ → 400).

**Distance** is measured from the epicentre to the province's **boundary**, not its centre, on
the real curved Earth (PostGIS `geography`). It is 0 when the epicentre is inside the province.
Province shapes are simplified ("medium resolution"), so distances are good to about a kilometre.

**Points for one quake** = strength × distance fade × depth fade × time fade

| Factor | Rule |
|---|---|
| Strength | 25 points at M4.0, rising in a straight line to 100 at M7.0 and above |
| Distance fade | 1.0 at the epicentre, falling in a straight line to 0.25 at the edge of the radius |
| Depth fade | 1.0 down to 20 km deep, falling in a straight line to 0.3 at 300 km and deeper |
| Time fade | 1.0 now, falling in a straight line to 0 at 72 hours |

**Why depth matters:** a deep quake's energy spreads out before it reaches the surface, so it
shakes less than a shallow quake of the same magnitude. When USGS gives no depth, the quake is
treated as shallow (the cautious choice).

**Province's earthquake score** = its strongest quake's points, plus 3 for each additional
quake that scores at least 1 (at most +10), capped at 100.

**USGS impact fields are shown, not scored.** When USGS gives them, the card shows each quake's
PAGER alert (USGS's estimate of possible deaths and damage), its strongest estimated shaking
(Modified Mercalli intensity) and whether USGS shows tsunami information for it. They are
tagged "Global assessment" and do not change the score. The tsunami flag only means USGS
links to tsunami information for a large ocean quake; for official tsunami warnings, check
PHIVOLCS.

## Weather score

Source: Open-Meteo. The weather score is the **higher** of a rain score and a heat score.

**Rain** uses two amounts, each mapped to a score along PAGASA-style warning levels, with
straight lines between the listed points. The rain score is the higher of the two.

| Rain in the last hour | Score | | Rain in the last 24 hours | Score |
|---|---|---|---|---|
| 0 mm | 0 | | 0 mm | 0 |
| 7.5 mm (yellow) | 40 | | 50 mm | 40 |
| 15 mm (orange) | 60 | | 100 mm | 60 |
| 30 mm (red) | 85 | | 200 mm | 85 |
| 50 mm | 100 | | 300 mm | 100 |

**The wet day rule.** One heavy hour below red (under 30 mm) reaches "High" only if the last
24 hours had at least 50 mm (PAGASA's "heavy" rain); on a drier day its score stops at 59, just
under "High". Red-level rain (30 mm or more in an hour) always counts in full, and an unknown
24-hour amount never counts as a dry day. Why: in the historical replay, an ordinary week had
30 "High" province-hours, all from a single downpour on an otherwise dry day; with this rule it
had 4, and no past disaster reached "High" any later (`docs/replay-results.md`).

**Heat** uses the heat index ("feels like" temperature), mapped along PAGASA's bands:

| Heat index | PAGASA band | Score |
|---|---|---|
| below 27 °C | none | 0 |
| 27–32 °C | caution | 0 → 10 |
| 33–41 °C | extreme caution | 10 → 50 |
| 42–51 °C | danger | 50 → 100 |
| 52 °C and above | extreme danger | 100 |

**The heat index is computed by us** from air temperature and relative humidity, using the US
National Weather Service method (the Rothfusz regression with its two adjustments), which
PAGASA also uses. We do not use Open-Meteo's own "apparent temperature", which follows a
different formula. Code: `server/src/heatIndex.ts`.

A weather reading older than 4.5 hours is not used; the weather signal is then unknown (see
"Unknown is not calm" below). Weather is fetched every 2 hours, so one failed run still leaves
a usable reading.

## Disaster event score

Source: GDACS (Global Disaster Alert and Coordination System), which gives each event an alert
level: Green, Orange or Red. The level is GDACS's estimate of how much international help the
event may need. It is **not** a PAGASA signal number or a PHIVOLCS alert level.

**Which events count.** Typhoons, floods, volcanoes and wildfires that have an alert level.
- Earthquakes are left out here because they are already scored from USGS.
- Droughts are left out because they are slow and cover whole regions.
- NASA EONET events are shown but never scored, because EONET gives no alert level.

**Points for one event** = level strength × distance fade × ended fade

| Factor | Rule |
|---|---|
| Level strength | Green 10, Orange 50, Red 80 |
| Reach | Green 100 km, Orange 200 km, Red 300 km; beyond that the event scores 0 |
| Distance fade | 1.0 at the event, falling in a straight line to 0.25 at the edge of the reach |
| Ended fade | 1.0 while the event is going on, falling in a straight line to 0 at 48 hours after it ends |

**Distance** is measured from the event's point or area to the province's boundary (0 when it
touches the province). GDACS often gives a single point for an event; for a typhoon that is its
latest position, not the whole storm, so a large storm's edge can be closer than the distance
suggests.

**Province's event score** = its strongest event's points.

## Overall score

`score = strongest signal + 0.25 × each of the other two`, capped at 100.

An average would hide a severe earthquake behind calm weather, so the strongest signal always
counts in full.

On the map: 0–19 nothing detected, 20–39 low, 40–59 moderate, 60–79 high, 80–100 severe.
The lowest band is named for what we know ("nothing detected"); it is not an all-clear.

## Towns and provinces

- **A town** is scored from the quakes and events near it, measured to the town's edge (0 km if
  inside), and from the weather at its grid points (the worst of them: most rain, hottest
  point). The radius, reach and fading are the same as everywhere else.
- **A province** shows the score, part-scores and reasons of its highest town
  (`highestTown`). So the number on the map always belongs to a real town, and the hover label
  names it. If any of its towns is missing a signal, the province is "at least N" too. A
  province with no towns loaded is scored as a whole, from its own inputs.
- **The map** colours every town by its own score at every zoom level, never by its
  province's highest town. Province colours show only until the town shapes have loaded.
- Town scores are replaced on every run and have no history; province history is kept as
  before.

## Unknown is not calm

A signal that could not be checked is **unknown**, never 0:

| Signal | Unknown when |
|---|---|
| Weather | the town (or spot) has no reading from the last 4.5 hours |
| Earthquakes | the USGS fetch has not succeeded for 1 hour |
| Disaster events | the GDACS fetch has not succeeded for 2 hours |

The score is then built from the signals we do know, so it is a lower limit. The page writes it
as "at least N", draws stripes over the town or province, and names the missing signal in the reasons.
Earthquakes and events already saved still count while their feed is down.

## Score for one spot

Clicking the map scores that exact spot with the same formulas, worked out on demand and not
saved:

- **Earthquakes and disaster events:** distance is measured from the spot itself instead of the
  town's edge. A spot far from a quake or event can score lower than its town, whose score uses
  the nearest edge.
- **Weather:** fetched from Open-Meteo for the spot, snapped to a 0.05° grid (about 5 km) and
  reused for 30 minutes. This is finer than the weather model itself, so nothing is lost.
- **Place name:** the city or municipality containing the spot. A click up to 2 km outside a
  boundary still counts as the nearest one, because the drawn shapes are simplified.

**The card's main number is the town's**, the very score that colours the town on the map, with
its hazard rows and reasons. So the number always matches the colour that was clicked. The
exact spot's own score is a smaller line under it, with a note that the town counts its most
exposed part, so the spot can be lower. (Example: Santa Catalina reads a coastal grid point,
heat index 38 → 32, while a spot in its hills reads 32.7 → 10.) Without a town score (no town
there, or before the first score run) the main number is the spot's. The card also shows the
province's score.

## Hazard by hazard

The card also shows the same formulas one hazard at a time: earthquakes, rain, heat, and storms
and disaster events (GDACS). Each gets its own 0–100 number and band, or "unknown". The overall
score is still the strongest signal plus a share of the others.

## Official alerts are not in the score

PAGASA's alerts (flood advisories, tropical cyclone alerts) are shown above the score in
PAGASA's own words. They never raise or lower the number, and a low number never hides them.
Storm tracks are shown the same way: a storm counts as "near" when its path (from where it is
now through its forecast positions) passes within 300 km.

## Reasons on the card

Along with each score the server sends the reasons behind it as message keys plus numbers
(for example `quake`, magnitude 5.2, 34 km, 5 hours ago), not as finished sentences. The web
app writes the sentence, so the same reason can be shown in English or Filipino. This does not
change any score.

## Freshness

Earthquakes are fetched every 15 minutes, weather every 2 hours, disaster events every 30 minutes. The card shows
when the earthquake and weather feeds were last fetched **successfully**. If either is more than
1 hour old, the data is marked stale.

Every feed also has its own limit (`FEED_RULES` in `server/src/freshness.ts`): earthquakes and
headlines 1 hour, weather 4.5 hours, disaster events and storm tracks 2 hours, the outlook 13
hours. A banner at the top of the page names each feed past its limit. A weather run counts as
a success only when at least 90% of weather points answered; each request is tried twice.

A disaster event with no end date is dropped from the score and the map once its feed stops
listing it, or after 24 hours without a refresh.
A quiet day with no earthquakes is not stale: what counts is that the fetch worked.

## Known limitations

- **Weather is modelled, not measured.** Open-Meteo values come from weather models, not from a
  station. Each value is stored with the hour it is valid for (`valid_at`).
- **A weather grid, about 28 km apart.** Weather is fetched at about 600 points: a 0.25° grid
  over the land, each province's own point, and a point for any small-island town more than
  30 km from the others (`npm run weather-points`). A town uses the points inside it, or else
  its nearest one; a province uses all of its points. Rain between points can still be missed,
  and the "last hour" of rain can be up to 2 hours old.
- **Rain is hourly.** "Last hour" means the latest full model hour, so a short burst can be
  smoothed out.
- **USGS is a global catalogue.** Around the Philippines it reliably reports only quakes of
  about magnitude 4 and above, sometimes with a delay; PHIVOLCS records many more.
- **The score is not shaking intensity.** It uses magnitude, distance and depth only, not ground
  conditions or building types.
- **Metro Manila** appears as four districts. Two areas that are not provinces are also scored:
  the City of Isabela and BARMM's Special Geographic Area.
- **Disaster events are coarse.** GDACS levels are global estimates made for aid agencies, and
  an event is usually one point. Official PAGASA wind signals and PHIVOLCS volcano alert levels
  are not in the score.
- **Storm tracks, the 7-day outlook and news do not change the score.** They are collected
  (JMA, JTWC, Open-Meteo, GloFAS, news feeds) for display only.
- **Storm surge zones come from a fixed map, not a live feed.** Project NOAH's storm surge
  maps (2021 data) show where a surge of each advisory level (SSA 1 up to 2 m … SSA 4 more than
  4 m) would reach. They are scenarios, not a forecast, and are shown on the map and the status
  card only: they do not change the score.
- **Landslides** are not covered yet (the landslide hazard map is not loaded).
