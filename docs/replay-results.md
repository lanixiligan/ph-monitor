# Historical replay results

Would the score have reached "High" (60 or more) during past disasters, and how often does it
reach "High" in an ordinary week? Run on 2026-11-18 with `npm run replay`, using the weights as
they are. Nothing was tuned; these results are the input for Phase 6 of the reliability roadmap.

> **Not an official warning service.** This is a check of our own unofficial score against
> past events, not a record of any official warning.

The replay scores the way the live app does: every town in the affected provinces gets its
own score (weather from the ~28 km grid, quakes and events measured to the town's edge), and a
province shows its highest town. The first run (2026-11-17) used one weather point per
province; its numbers are kept under "Compared with the first run" below.

## Summary

| Case | Reached "High"? | When |
|---|---|---|
| Typhoon Yolanda, Nov 2013 | Yes, all 6 provinces (peaks 89–96) | From 3 h before the first landfall (Eastern Samar) to 7 h after it (Capiz, Iloilo, as the storm reached them) |
| Taal eruption, Jan 2020 | Yes, barely (peaks 61–65) | Late: 8 h (Batangas) to 16 h (Cavite) after the eruption began |
| Typhoon Odette, Dec 2021 | Yes, all 6 provinces (peaks 87–100) | From 10 h before the first landfall (Surigao del Norte) to 7 h after it (Negros Oriental) |
| Abra M7.0, Jul 2022 | Yes, all 4 provinces (peaks 98–100) | In the first hourly step after the quake |
| Ordinary week, 6–12 Feb 2023 | 30 of 14,872 province-hours | In 13 provinces, every one from a single heavy hour of rain |

## What the replay shows (for Phase 6)

1. **The score follows a typhoon; it does not run ahead of it.** A red event only pushes a
   province to "High" once the storm centre is within about 100 km, so "High" arrives a few
   hours before the storm at best (10 hours for Odette, from its rain), and at provinces further
   along the path only as it gets there. That fits "stress right now", but the card's storm
   section and the official alerts have to carry the "it is coming" message.
2. **An orange event alone can never reach "High".** Orange is worth 50 points at most. Taal
   reached "High" only because of the magnitude 4+ volcanic earthquakes that followed, hours
   after the eruption began, added on top of the event (strongest + 0.25 × the others).
3. **One heavy hour of rain at one grid point is enough for "High", and the grid finds many
   more of them.** All 30 ordinary-week readings were rain in one hour of 15–24 mm (15 mm
   scores exactly 60). In none of them was the 24-hour rain enough on its own; at the ten
   highest peaks it was 18–50 mm, below or at the edge of "heavy" (50 mm). A reading lasts 2 hours, because the weather is
   fetched every 2 hours, so 30 province-hours are about 15 separate downpours. No earthquake
   or event caused a "High" that week.
4. **The disaster cases barely changed.** Every province still reached "High"; with the grid,
   Odette reached it a few hours earlier in some provinces (Surigao del Norte 10 h before
   landfall instead of 6, Bohol within the hour after instead of 5 h after).

## The tables

Times are Philippine time. "Town at the peak" is the town whose score the province showed.
"Parts" are its three part-scores at the peak hour.

### Typhoon Yolanda (Haiyan), November 2013

Key time: first landfall, Guiuan, Eastern Samar (Nov 8, 4:40 am).

| Province | Peak | Peak at | Town at the peak | Parts at the peak | First "High" (60+) | Compared with the key time |
|---|---|---|---|---|---|---|
| Capiz | 94 | Nov 8, 18:00 | Jamindan | quake 0, weather 54, event 80 | Nov 8, 12:00 | 7 h after |
| Cebu | 89 | Nov 8, 10:00 | City of Lapu-Lapu | quake 16, weather 70, event 59 | Nov 8, 08:00 | 3 h after |
| Eastern Samar | 91 | Nov 8, 10:00 | City of Borongan | quake 0, weather 58, event 76 | Nov 8, 02:00 | 3 h before |
| Iloilo | 89 | Nov 8, 18:00 | Bingawan | quake 0, weather 51, event 76 | Nov 8, 12:00 | 7 h after |
| Leyte | 96 | Nov 8, 10:00 | Burauen | quake 0, weather 62, event 80 | Nov 8, 08:00 | 3 h after |
| Samar | 95 | Nov 8, 10:00 | Santa Rita | quake 0, weather 58, event 80 | Nov 8, 08:00 | 3 h after |

### Taal Volcano eruption, January 2020

Key time: eruption begins (Jan 12, about 1 pm).

| Province | Peak | Peak at | Town at the peak | Parts at the peak | First "High" (60+) | Compared with the key time |
|---|---|---|---|---|---|---|
| Batangas | 65 | Jan 13, 00:00 | City of Lipa | quake 52, weather 3, event 48 | Jan 12, 21:00 | 8 h after |
| Cavite | 61 | Jan 13, 16:00 | City of Tagaytay | quake 44, weather 6, event 48 | Jan 13, 05:00 | 16 h after |
| Laguna | 62 | Jan 13, 00:00 | Alaminos | quake 50, weather 3, event 45 | Jan 12, 22:00 | 9 h after |

### Typhoon Odette (Rai), December 2021

Key time: first landfall, Siargao, Surigao del Norte (Dec 16, 1:30 pm).

| Province | Peak | Peak at | Town at the peak | Parts at the peak | First "High" (60+) | Compared with the key time |
|---|---|---|---|---|---|---|
| Bohol | 100 | Dec 16, 20:00 | Anda | quake 0, weather 84, event 73 | Dec 16, 14:00 | within the hour after |
| Cebu | 100 | Dec 17, 04:00 | Alegria | quake 0, weather 84, event 63 | Dec 16, 18:00 | 5 h after |
| Dinagat Islands | 100 | Dec 16, 18:00 | Dinagat | quake 21, weather 88, event 72 | Dec 16, 08:00 | 6 h before |
| Negros Oriental | 100 | Dec 17, 00:00 | Ayungon | quake 0, weather 88, event 55 | Dec 16, 20:00 | 7 h after |
| Southern Leyte | 87 | Dec 16, 20:00 | Liloan | quake 0, weather 71, event 62 | Dec 16, 14:00 | within the hour after |
| Surigao del Norte | 100 | Dec 16, 14:00 | Burgos | quake 38, weather 65, event 78 | Dec 16, 04:00 | 10 h before |

### Abra earthquake, magnitude 7.0, July 2022

Key time: the earthquake (Jul 27, 8:43 am).

| Province | Peak | Peak at | Town at the peak | Parts at the peak | First "High" (60+) | Compared with the key time |
|---|---|---|---|---|---|---|
| Abra | 100 | Jul 27, 09:00 | Licuan-Baay | quake 96, weather 14, event 0 | Jul 27, 09:00 | within the hour after |
| Benguet | 98 | Jul 27, 11:00 | Bakun | quake 92, weather 24, event 0 | Jul 27, 09:00 | within the hour after |
| Ilocos Sur | 100 | Jul 27, 11:00 | Banayoyo | quake 96, weather 15, event 0 | Jul 27, 09:00 | within the hour after |
| Mountain Province | 100 | Jul 27, 11:00 | Besao | quake 97, weather 18, event 0 | Jul 27, 09:00 | within the hour after |

### An ordinary week, 6 to 12 February 2023 (all provinces)

88 provinces × 169 hours = 14,872 province-hours. "High" or above: 30 province-hours, in 13 provinces. In 30 of them the weather alone scored 60 or more.

Which rain was enough for "High": one hour only 30, 24 hours only 0, both 0.

The ten highest peaks of the week:

| Province | Peak | Peak at | Town at the peak | Parts at the peak | Rain 1 h / 24 h (mm) | Hours at "High" |
|---|---|---|---|---|---|---|
| Surigao del Sur | 74 | Feb 9, 02:00 | City of Bislig | quake 0, weather 74, event 0 | 23.6 / 50.1 | 4 |
| Northern Samar | 72 | Feb 10, 02:00 | Catubig | quake 0, weather 72, event 0 | 22.2 / 44.1 | 2 |
| Davao Oriental | 67 | Feb 8, 20:00 | Baganga | quake 0, weather 67, event 0 | 19.1 / 38.6 | 4 |
| Iloilo | 66 | Feb 10, 08:00 | Ajuy | quake 0, weather 66, event 0 | 18.6 / 26.4 | 2 |
| Agusan del Norte | 65 | Feb 6, 18:00 | City of Cabadbaran | quake 0, weather 65, event 0 | 17.7 / 35 | 2 |
| Bohol | 64 | Feb 10, 02:00 | President Carlos P. Garcia | quake 0, weather 64, event 0 | 17.2 / 29 | 2 |
| Davao Occidental | 62 | Feb 10, 12:00 | Jose Abad Santos | quake 0, weather 62, event 0 | 16.4 / 18.4 | 2 |
| Leyte | 62 | Feb 8, 22:00 | Abuyog | quake 0, weather 62, event 0 | 16 / 34.8 | 2 |
| Southern Leyte | 62 | Feb 8, 22:00 | Silago | quake 0, weather 62, event 0 | 16 / 34.8 | 2 |
| South Cotabato | 61 | Feb 9, 20:00 | Norala | quake 0, weather 61, event 0 | 15.4 / 44.1 | 2 |

The week was picked as one with no typhoon and no damaging earthquake; change the dates in
`server/scripts/replay.ts` to try another.

## Compared with the first run (one weather point per province, 2026-11-17)

| Case | First run | This run (towns and the grid) |
|---|---|---|
| Yolanda | All 6 "High", peaks 89–96, first 3 h before landfall | The same; peaks 89–96 |
| Taal | All 3 "High", peaks 62–65 | All 3 "High", peaks 61–65 |
| Odette | All 6 "High", peaks 85–100, first 6 h before landfall | All 6 "High", peaks 87–100, first 10 h before landfall |
| Abra | All 4 "High", peak 100 | All 4 "High", peaks 98–100 |
| Ordinary week | 7 province-hours in 6 provinces | 30 province-hours in 13 provinces |

## How the replay differs from the live app

Read the numbers with these in mind:

- **Rain comes from a coarser archive** (Open-Meteo's archive, the ERA5 reanalysis), not the
  forecast model the live app reads. It smooths out the heaviest typhoon rain.
- **The weather is "fetched" every 2 hours, from midnight UTC,** like the live job, and the
  score uses that reading until the next one. The live job's real fetch times depend on when
  the server started.
- **GDACS events carry their final alert level from their first hour,** and the start date is
  when the event began, not when GDACS published it. Live, the level can start lower and the
  event can appear later, so the "event" part here is a best case.
- **Typhoon positions come from JMA's best track** (every 6 hours), because the GDACS archive
  keeps only a storm's last position. Between two positions the storm "stands still".
- **Earthquakes use USGS's final magnitudes,** which can differ a little from the first report.
- **Every feed is treated as working,** and scores are worked out once an hour, on the hour.

Sources: USGS (public domain), Open-Meteo archive (CC BY 4.0), GDACS (CC BY 4.0), JMA RSMC
Tokyo best track data.
