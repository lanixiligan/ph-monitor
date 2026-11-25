# Privacy, keys and limits

## What the reader's browser contacts

The web page talks only to our own `/api`, with three exceptions:

1. **Basemap tiles** load straight from OpenFreeMap (switch: `SHOW_BASEMAP` in
   `web/src/mapSettings.ts`).
2. **A video** loads from `youtube-nocookie.com`, and only after the reader clicks Play.
3. **A radio stream** plays straight from the station's own server (its address comes from
   Radio Browser), and only after the reader clicks Play. That server sees the reader's IP
   address, as YouTube does. Our server never relays the audio.

The browser never calls USGS, Open-Meteo, GDACS or any news site. The server does that.
The hazard map tiles (Project NOAH zones) and the heat map come from our own `/api` too.

## Search and "use my location"

- **Place search** looks names up in our own database through `/api/places`. What the reader
  types goes to our server only, never to an outside search service, and is not saved.
- **"Use my location"** (the button under the map's zoom buttons) works only after the reader
  presses it and allows it in the browser's own permission prompt. The browser gives the page
  one position; it is not followed afterwards.
- That position is treated exactly like a click on the map: rounded to 4 decimals (about 11 m),
  sent to our own `/api/point`, and written into the page address (`?lat=..&lon=..`). The server
  does not save it. It asks Open-Meteo for the weather of the surrounding 5 km cell, not of the
  exact position.
- **Sharing the page address shares that spot.** After using the button, a copied link shows
  where the reader was.

## Keys and settings

- `.env` is read only by the server and is never committed. `.env.example` lists every setting.
- No data feed needs a key.
- `YOUTUBE_API_KEY` is optional. It lets the stream check tell which channels are live. It is
  sent in a request header, never logged, and never reaches the browser.

## Call budgets

| Service | Free limit | What we use |
|---|---|---|
| Open-Meteo | about 10,000 calls a day | Weather job about 7,200 a day (about 600 points, every 2 hours); outlook about 700 a day; heat map about 1,200 a day (the same points, all three models in one request, every 12 hours); rain forecast field 512 a day (256 grid points, every 12 hours); together about 9,600, leaving about 400 for clicked spots (reused for 30 minutes per 5 km cell) |
| PAGASA iHeatMAP | none stated | About 44 API calls a day (about 8 date checks, 1 file list, 35 download links) and 35 file downloads from PAGASA's storage bucket |
| YouTube Data API | 10,000 units a day | About 1,900 units a day, at most about 7,500 (only 1-unit calls) |
| Radio Browser | none stated | One station list download a day (about 830 KB) |
| Radio stations | none | Every 6 hours, each stream is opened for its first 1 KB, then closed (about 670 stations, under 1 MB) |

Open-Meteo's free tier is for non-commercial use. This project is non-commercial.

## What the data cannot tell you

- **This is not a warning service.** The score is an untuned estimate and has not been checked
  against past events.
- **The heat map's model sources show only 8 AM to 5 PM.** The night hours are no longer shown.
- **PAGASA's heat API is internal** and may change or stop; then the PAGASA source goes out of
  date. About 20 small island towns and Kalayaan never get a PAGASA value and show as unknown.
- **Weather and the outlook are modelled**, not measured, and sampled at one point per province.
- **USGS misses small quakes** near the Philippines; PHIVOLCS records many more.
- **GDACS alert levels are global estimates** for aid agencies. PAGASA wind signals and
  PHIVOLCS volcano alert levels are not in the score.
- **Storm tracks, the outlook, news and the heat map never change the score.**
- **The heat map is a model estimate, sampled coarsely.**
  - A 9 km model (ECMWF) smooths out hills and cities, so it can read low in hot city centres.
    ICON and GFS are coarser still (about 13 km).
  - The map reads each model at the same points, about 28 km apart, whatever the model's own
    grid.
  - A town shows its hottest point, and a province its hottest town.
  - The status card uses Open-Meteo's blended forecast, not the chosen model, so its heat index
    can differ from the map.
- **Storm surge zones come from a fixed map** (Project NOAH, 2021 data): scenarios for each
  surge level, not live and not a forecast. They are shown on the map and the card, never in
  the score.
- **Landslides** are not covered yet: the landslide hazard map is not loaded.
- **Headlines are picked by keyword**, so a few will be off-topic or tagged to the wrong province.
- **The Filipino text is a draft.**

The full list for the score is in [../METHODOLOGY.md](../METHODOLOGY.md).

## Licences

The code is MIT. Each data source keeps its own licence; see
[data-sources.md](data-sources.md) and the credits table in [../README.md](../README.md).
Credits must stay visible in the UI and the README.
