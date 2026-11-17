# Historical replay results

Would the score have reached "High" (60 or more) during past disasters, and how often does it
reach "High" in an ordinary week? Run on 2026-11-17 with `npm run replay`, using the weights as
they are. Nothing was tuned; these results are the input for Phase 6 of the reliability roadmap.

> **Not an official warning service.** This is a check of our own unofficial score against
> past events, not a record of any official warning.

## Summary

| Case | Reached "High"? | When |
|---|---|---|
| Typhoon Yolanda, Nov 2013 | Yes, all 6 provinces (peaks 89–96) | From 3 h before the first landfall (Eastern Samar) to 7 h after it (Capiz, Iloilo, as the storm reached them) |
| Taal eruption, Jan 2020 | Yes, barely (peaks 62–65) | Late: 8 h (Batangas) to 16 h (Cavite) after the eruption began |
| Typhoon Odette, Dec 2021 | Yes, all 6 provinces (peaks 85–100) | From 6 h before the first landfall (Surigao del Norte) to 6 h after it (Negros Oriental) |
| Abra M7.0, Jul 2022 | Yes, all 4 provinces (peak 100) | In the first hourly step after the quake |
| Ordinary week, 6–12 Feb 2023 | 7 of 14,872 province-hours | Seven separate single hours, in 6 provinces |

## What the replay shows (for Phase 6)

1. **The score follows a typhoon; it does not run ahead of it.** A red event only pushes a
   province to "High" once the storm centre is within about 100 km, so "High" arrives a few
   hours before the storm at best, and at provinces further along the path only as it gets
   there. That fits "stress right now", but the card's storm section and the official alerts
   have to carry the "it is coming" message.
2. **An orange event alone can never reach "High".** Orange is worth 50 points at most. Taal
   reached "High" only because of the magnitude 4+ volcanic earthquakes that followed, hours
   after the eruption began.
3. **One hour of heavy rain is enough for "High".** All seven ordinary-week readings were a
   single hour of 15–19 mm of rain (15 mm in an hour scores exactly 60). No earthquake or event
   caused a "High" that week.

## The tables

Times are Philippine time. "Parts" are the three part-scores at the peak hour.

### Typhoon Yolanda (Haiyan), November 2013

Key time: first landfall, Guiuan, Eastern Samar (Nov 8, 4:40 am).

| Province | Peak | Peak at | Parts at the peak | First "High" (60+) | Compared with the key time |
|---|---|---|---|---|---|
| Capiz | 93 | Nov 8, 18:00 | quake 0, weather 51, event 80 | Nov 8, 12:00 | 7 h after |
| Cebu | 91 | Nov 8, 12:00 | quake 18, weather 52, event 73 | Nov 8, 08:00 | 3 h after |
| Eastern Samar | 89 | Nov 8, 08:00 | quake 0, weather 50, event 76 | Nov 8, 02:00 | 3 h before |
| Iloilo | 90 | Nov 8, 18:00 | quake 0, weather 55, event 76 | Nov 8, 12:00 | 7 h after |
| Leyte | 96 | Nov 8, 10:00 | quake 0, weather 62, event 80 | Nov 8, 08:00 | 3 h after |
| Samar | 93 | Nov 8, 08:00 | quake 0, weather 50, event 80 | Nov 8, 08:00 | 3 h after |

### Taal Volcano eruption, January 2020

Key time: eruption begins (Jan 12, about 1 pm).

| Province | Peak | Peak at | Parts at the peak | First "High" (60+) | Compared with the key time |
|---|---|---|---|---|---|
| Batangas | 65 | Jan 13, 00:00 | quake 52, weather 3, event 50 | Jan 12, 21:00 | 8 h after |
| Cavite | 62 | Jan 13, 12:00 | quake 47, weather 8, event 48 | Jan 13, 05:00 | 16 h after |
| Laguna | 62 | Jan 13, 00:00 | quake 50, weather 1, event 47 | Jan 12, 22:00 | 9 h after |

### Typhoon Odette (Rai), December 2021

Key time: first landfall, Siargao, Surigao del Norte (Dec 16, 1:30 pm).

| Province | Peak | Peak at | Parts at the peak | First "High" (60+) | Compared with the key time |
|---|---|---|---|---|---|
| Bohol | 100 | Dec 16, 21:00 | quake 0, weather 92, event 80 | Dec 16, 18:00 | 5 h after |
| Cebu | 92 | Dec 17, 07:00 | quake 0, weather 76, event 63 | Dec 16, 17:00 | 4 h after |
| Dinagat Islands | 97 | Dec 16, 18:00 | quake 23, weather 69, event 74 | Dec 16, 12:00 | 2 h before |
| Negros Oriental | 100 | Dec 17, 01:00 | quake 0, weather 92, event 58 | Dec 16, 19:00 | 6 h after |
| Southern Leyte | 85 | Dec 16, 20:00 | quake 0, weather 64, event 69 | Dec 16, 14:00 | within the hour after |
| Surigao del Norte | 100 | Dec 16, 14:00 | quake 38, weather 72, event 80 | Dec 16, 08:00 | 6 h before |

### Abra earthquake, magnitude 7.0, July 2022

Key time: the earthquake (Jul 27, 8:43 am).

| Province | Peak | Peak at | Parts at the peak | First "High" (60+) | Compared with the key time |
|---|---|---|---|---|---|
| Abra | 100 | Jul 27, 10:00 | quake 100, weather 8, event 0 | Jul 27, 09:00 | within the hour after |
| Benguet | 100 | Jul 27, 11:00 | quake 92, weather 34, event 0 | Jul 27, 09:00 | within the hour after |
| Ilocos Sur | 100 | Jul 27, 10:00 | quake 96, weather 15, event 0 | Jul 27, 09:00 | within the hour after |
| Mountain Province | 100 | Jul 27, 11:00 | quake 98, weather 9, event 0 | Jul 27, 09:00 | within the hour after |

### An ordinary week, 6 to 12 February 2023 (all provinces)

88 provinces × 169 hours = 14,872 province-hours. "High" or above: 7 province-hours, in 6
provinces. The five highest peaks:

| Province | Peak | Peak at | Parts at the peak | Hours at "High" |
|---|---|---|---|---|
| Southern Leyte | 67 | Feb 10, 01:00 | quake 0, weather 67, event 0 | 1 |
| Tarlac | 65 | Feb 8, 15:00 | quake 0, weather 65, event 0 | 2 |
| Zamboanga del Sur | 62 | Feb 9, 15:00 | quake 0, weather 62, event 0 | 1 |
| Maguindanao del Norte | 61 | Feb 9, 15:00 | quake 0, weather 61, event 0 | 1 |
| Agusan del Norte | 60 | Feb 6, 18:00 | quake 0, weather 60, event 0 | 1 |

The week was picked as one with no typhoon and no damaging earthquake; change the dates in
`server/scripts/replay.ts` to try another.

## How the replay differs from the live app

Read the numbers with these in mind:

- **Rain comes from a coarser archive** (Open-Meteo's archive, the ERA5 reanalysis), not the
  forecast model the live app reads. It smooths out the heaviest typhoon rain.
- **One weather point per province.** The live app uses the worst of several.
- **GDACS events carry their final alert level from their first hour,** and the start date is
  when the event began, not when GDACS published it. Live, the level can start lower and the
  event can appear later, so the "event" part here is a best case.
- **Typhoon positions come from JMA's best track** (every 6 hours), because the GDACS archive
  keeps only a storm's last position. Between two positions the storm "stands still".
- **Earthquakes use USGS's final magnitudes,** which can differ a little from the first report.
- **Every feed is treated as working,** and scores are worked out once an hour, on the hour.

Sources: USGS (public domain), Open-Meteo archive (CC BY 4.0), GDACS (CC BY 4.0), JMA RSMC
Tokyo best track data.
