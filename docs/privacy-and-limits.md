# Privacy, keys and limits

## What the reader's browser contacts

The web page talks only to our own `/api`, with two exceptions:

1. **Basemap tiles** load straight from OpenFreeMap (switch: `SHOW_BASEMAP` in
   `web/src/mapSettings.ts`).
2. **A video** loads from `youtube-nocookie.com`, and only after the reader clicks Play.

The browser never calls USGS, Open-Meteo, GDACS or any news site. The server does that.

## Keys and settings

- `.env` is read only by the server and is never committed. `.env.example` lists every setting.
- No data feed needs a key.
- `YOUTUBE_API_KEY` is optional. It lets the stream check tell which channels are live. It is
  sent in a request header, never logged, and never reaches the browser.

## Call budgets

| Service | Free limit | What we use |
|---|---|---|
| Open-Meteo | about 10,000 calls a day | Weather job about 4,800 a day (about 200 points, hourly); outlook about 700 a day; plus clicked spots (reused for 30 minutes per 5 km cell) |
| YouTube Data API | 10,000 units a day | About 1,200 units a day (only 1-unit calls) |

Open-Meteo's free tier is for non-commercial use. This project is non-commercial.

## What the data cannot tell you

- **This is not a warning service.** The score is an untuned estimate and has not been checked
  against past events.
- **Weather and the outlook are modelled**, not measured, and sampled at one point per province.
- **USGS misses small quakes** near the Philippines; PHIVOLCS records many more.
- **GDACS alert levels are global estimates** for aid agencies. PAGASA wind signals and
  PHIVOLCS volcano alert levels are not in the score.
- **Storm tracks, the outlook and news never change the score.**
- **Landslides** are not covered.
- **Headlines are picked by keyword**, so a few will be off-topic or tagged to the wrong province.
- **The Filipino text is a draft.**

The full list for the score is in [../METHODOLOGY.md](../METHODOLOGY.md).

## Licences

The code is MIT. Each data source keeps its own licence; see
[data-sources.md](data-sources.md) and the credits table in [../README.md](../README.md).
Credits must stay visible in the UI and the README.
