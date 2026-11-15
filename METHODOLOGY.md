# How the score is calculated

Each province gets a score from 0 (calm) to 100 (severe) describing stress **right now** from
two signals: recent earthquakes and current weather. Every number below is a constant in
`WEIGHTS` at the top of `server/src/scoring/scoring.ts`.

**All thresholds are starting guesses, not calibrated values.** They are meant to be tuned.

**The score is not a forecast or an official warning.** It has not been checked against past
events. For official warnings, follow PAGASA (weather) and PHIVOLCS (earthquakes).

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

A weather reading older than 3 hours is not used; the weather score is then 0 and the card says
there is no recent weather data.

## Overall score

`score = stronger signal + 0.25 × weaker signal`, capped at 100.

An average would hide a severe earthquake behind calm weather, so the stronger signal always
counts in full.

On the map: 0–19 calm, 20–39 low, 40–59 moderate, 60–79 high, 80–100 severe.

## Freshness

Earthquakes are fetched every 15 minutes, weather every 30. The card shows when each feed was
last fetched **successfully**. If either is more than 1 hour old, the data is marked stale.
A quiet day with no earthquakes is not stale: what counts is that the fetch worked.

## Known limitations

- **Weather is modelled, not measured.** Open-Meteo values come from weather models, not from a
  station. Each value is stored with the hour it is valid for (`valid_at`).
- **One weather point per province.** We sample a single point guaranteed to be inside the
  province (PostGIS `ST_PointOnSurface`). A large or mountainous province can differ a lot from
  its one point, and a storm over another part of the province can be missed.
- **Rain is hourly.** "Last hour" means the latest full model hour, so a short burst can be
  smoothed out.
- **USGS is a global catalogue.** Around the Philippines it reliably reports only quakes of
  about magnitude 4 and above, sometimes with a delay; PHIVOLCS records many more.
- **The score is not shaking intensity.** It uses magnitude, distance and depth only, not ground
  conditions or building types.
- **Metro Manila** appears as four districts. Two areas that are not provinces are also scored:
  the City of Isabela and BARMM's Special Geographic Area.
- **No hazards beyond these two**: no typhoon tracks, floods, landslides or volcanoes yet.
