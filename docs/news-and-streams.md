# News and live streams

Every news feed and stream link lives in one file: `server/src/sources.ts`. A dead link is
fixed there. Neither news nor streams change the score.

## Headlines

### Where they come from

13 RSS feeds, read every 15 minutes:

| Outlet | Category | Feed |
|---|---|---|
| Google News (search) | mixed | `news.google.com/rss/search` |
| PTV | Official | `ptvnews.ph/feed/` |
| GMA News | TV | `data.gmanetwork.com/gno/rss/news/feed.xml` |
| GMA News (regions) | TV | `data.gmanetwork.com/gno/rss/news/regions/feed.xml` |
| Bombo Radyo | Radio | `www.bomboradyo.com/feed/` |
| Rappler | Online | `www.rappler.com/philippines/feed/` |
| Inquirer | Online | `newsinfo.inquirer.net/feed` |
| PhilStar (headlines) | Online | `www.philstar.com/rss/headlines` |
| PhilStar (nation) | Online | `www.philstar.com/rss/nation` |
| The Manila Times | Online | `www.manilatimes.net/news/feed/` |
| Interaksyon | Online | `interaksyon.philstar.com/feed/` |
| SunStar | Regional | `www.sunstar.com.ph/api/v1/collections/home.rss` |
| MindaNews | Regional | `mindanews.com/feed/` |

The Google News feed is a search for
`(bagyo OR baha OR lindol OR typhoon OR earthquake OR flood OR landslide OR volcano) Philippines`
over the last 2 days. It mixes many outlets, so each of its stories takes the category of the
outlet it names (the `KNOWN_OUTLETS` list). An outlet we don't know is filed under "Online and
newspapers". Social media posts and a few repost sites are dropped (`IGNORED_OUTLETS` in
`server/src/news/outlets.ts`).

### Categories

Official, TV, Radio, Online and newspapers, Regional, International. They are labels for
filtering, **not a ranking of trust**.

### What we store

Headline, outlet, category, time and link. **Never the article text.** Each headline links to
the original article on the outlet's own site.

### How a headline gets onto the page

1. **Read** each feed (`fetchers/rss.ts`). Items older than 3 days, or dated more than an hour
   in the future, are dropped. One failing feed does not stop the others.
2. **Filter** to disaster headlines (`news/keywords.ts`). The headline must contain a whole
   keyword in English, Filipino or Cebuano: typhoon, bagyo, flood, baha, earthquake, lindol,
   linog, landslide, volcano, bulkan, evacuation, PAGASA, PHIVOLCS and so on. Phrases like
   "flooded with complaints" are cut out first, and quake bulletins below magnitude 4 are
   dropped.
3. **Tag provinces** named in the headline (`news/tagProvinces.ts`). The longest name wins
   ("Davao del Sur" does not also tag "Davao"), and some cities and volcanoes tag their
   province (Tacloban → Leyte, Mayon → Albay).
4. **Merge the same story** from different outlets (`news/storyKey.ts`). Two headlines are one
   story when they boil down to the same significant words, or share at least half of them
   (and at least 3 words) within 48 hours. The earliest report is the main row; the others are
   listed under it.
5. **Save** (`jobs/ingestNews.ts`). Headlines older than 14 days are deleted.

The headlines panel shows the latest 30 by default and can be filtered by category. The status
card shows up to 5 headlines from the last 3 days that name the province.

### Known noise

- Aurora, Isabela, Rizal and Quezon are also people's names, so a headline about a person can
  get a wrong province tag.
- Regions ("Bicol", "Eastern Visayas") are not tagged.
- The keyword filter can let through a non-disaster story that uses a disaster word.

## Live streams

### Where they come from

12 YouTube channels, each confirmed through the YouTube API on 2026-11-16:

| Outlet | Category |
|---|---|
| DOST-PAGASA | Official |
| Civil Defense PH | Official |
| PTV | Official |
| GMA News | TV |
| ABS-CBN News (backup: ANC) | TV |
| UNTV News and Rescue | TV |
| One News PH | TV |
| DZRH News Television | Radio |
| Super Radyo DZBB | Radio |
| Rappler | Online |
| INQUIRER.net | Online |
| Bombo Radyo Philippines | Regional |

Left out after that check: PHIVOLCS and DZMM (the channels found under those names are not the
real ones), News5 (not found) and SunStar (no uploads since 2023).

### What the page shows

Each slot shows the channel's live stream when it is live ("LIVE"), otherwise its latest video
("Latest"). Rules:

- A video plays only in YouTube's own player, embedded from `youtube-nocookie.com`, and loads
  only after the reader clicks Play. Only one plays at a time.
- Raw TV feeds (`.m3u8`) are never re-streamed.
- Dead links and videos that may not be embedded are never sent to the page.

## The link checker

`npm run check:sources` checks everything and prints a table. The scheduler also runs it: feeds
every hour, streams every 30 minutes. Results go in the `sources` table.

**Feeds** (`checker/checkFeed.ts`): does the address answer, is it RSS or Atom, does it have
items? If not, it is `dead`. A feed with nothing new for 7 days is `ok` but marked stale.

**Streams** (`checker/checkStream.ts`, `checker/youtube.ts`):

| | With `YOUTUBE_API_KEY` | Without a key |
|---|---|---|
| How | Two YouTube Data API calls of 1 unit each: newest uploads, then video details | The channel's public video feed, then oEmbed on the newest video |
| Knows if it is live | Yes | No: shown as "Latest (may be offline)" |
| Cost | About 1,200 of the 10,000 free units a day | Free |

`search.list` (100 units a call) is never used, and no page is scraped. When a check gets no
answer the slot keeps its last status; only after 24 hours without an answer is it marked dead.
