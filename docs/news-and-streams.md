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

Official, TV, Radio, Online and newspapers, Regional, International. They are labels, **not a
ranking of trust**. Since step 5.4 the headlines panel filters by kind of disaster instead (see
below); the outlet category is still saved and the API still accepts `?category=`.

### Kinds of disaster

Each headline gets the kinds it names (`shared/src/newsTypes.ts`): typhoon, flood (and heavy
rain), earthquake, volcano, landslide, tsunami (and storm surge), drought (and El Niño), wildfire
(forest and grass fires, not building fires) and extreme heat. A headline can have more than
one: a storm surge is typhoon and tsunami, quakes at a volcano are volcano and earthquake. A
headline that names no kind, only a response such as an evacuation or a state of calamity, is
**General**. Man-made disasters (building fires, landfill or mine collapses) are left out for now.
The panel's filter buttons and the map's headline dots follow the same choice.

### What we store

Headline, outlet, category, kinds of disaster, provinces, time and link. **Never the article text.** Each headline links to
the original article on the outlet's own site.

### How a headline gets onto the page

1. **Read** each feed (`fetchers/rss.ts`). Items older than 3 days, or dated more than an hour
   in the future, are dropped. One failing feed does not stop the others.
2. **Tag provinces** named in the headline (`news/tagProvinces.ts`). The longest name wins
   ("Davao del Sur" does not also tag "Davao"), and some cities, islands and volcanoes tag
   their province (Tacloban → Leyte, Siargao → Surigao del Norte, Mayon → Albay). Towns from
   the `places` table tag their province too, but only when the headline uses the name as a
   place ("in Guiuan", "Tabaco City", or first in the headline), only when one province has a
   town of that name, and never for names that are also surnames or common words (Marcos,
   Real, Gubat...). People and streets ("Jose Rizal", "Aurora Boulevard") and the Manila
   Trench tag nothing.
3. **Filter and sort** (`news/keywords.ts`, both steps together in `news/checkHeadline.ts`).
   The headline must name a kind of disaster in English, Filipino or Cebuano (typhoon, bagyo,
   baha, ulan, lindol, "magnitude 6", bulkan, El Niño, tagtuyot, forest fire, heat index...),
   or the name of a storm seen in the last 14 days (from the storms table and PAGASA's
   cyclone alerts; a local name such as 'Uwan' counts only in quotes). A response word alone
   (evacuation, state of calamity, PAGASA, PHIVOLCS) counts as General, unless the headline
   names another cause (a building fire, a war, a pest, a disease) or a place abroad. Phrases
   like "flood control", "Pagasa Island" and "landslide win" are cut out first, and quake
   bulletins below magnitude 4 are dropped. A disaster abroad is dropped unless the headline
   also names the Philippines or a province.
4. **Merge the same story** from different outlets (`news/storyKey.ts`). Two headlines are one
   story when they boil down to the same significant words, or share at least half of them
   (and at least 3 words) within 48 hours. The earliest report is the main row; the others are
   listed under it.
5. **Save** (`jobs/ingestNews.ts`). Headlines older than 14 days are deleted. Saved headlines
   from the last 6 days are checked again with the current rules on every run: new kinds or
   provinces are saved, and a headline that no longer counts is removed.

The headlines panel shows the latest 30 by default and can be filtered by kind of disaster. The status
card shows up to 5 headlines from the last 3 days that name the province.

### How well it works

`npm run measure:news` checks the rules against 242 real headlines labelled by hand
(`server/test/fixtures/news/labelled-headlines.json`), and a test fails if they get clearly
worse. On 2026-11-17: 93% of the headlines kept are really about a disaster, 99% of the
disaster headlines are found, the kinds are exactly right for 97% and the provinces for 100%.
The rules were written while looking at these same headlines, so new headlines will do
somewhat worse.

### Known noise

- A person named after a province who is not on the tagger's list can get a wrong tag.
- Regions ("Bicol", "Eastern Visayas") are not tagged.
- Explainers and stories about equipment pass ("FACT SHEET: The heat index, explained").
- A local storm name without quotes, or one PAGASA has not put in an alert, is not known.

## Live news panel (streams)

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
every hour, streams every 30 minutes. Opening the page or pressing Refresh in the live news
panel checks the streams again too, at most once every 10 minutes. Results go in the `sources` table.

**Feeds** (`checker/checkFeed.ts`): does the address answer, is it RSS or Atom, does it have
items? If not, it is `dead`. A feed with nothing new for 7 days is `ok` but marked stale.

**Streams** (`checker/checkStream.ts`, `checker/youtube.ts`):

| | With `YOUTUBE_API_KEY` | Without a key |
|---|---|---|
| How | Three YouTube Data API calls of 1 unit each: the channel's live streams list and newest uploads, then video details. A live stream is shown first; if none is on air, the latest video | The channel's public video feed, then oEmbed on the newest video |
| Knows if it is live | Yes | No: shown as "Latest (may be offline)" |
| Cost | About 1,900 of the 10,000 free units a day, at most about 7,500 with many refreshes | Free |

`search.list` (100 units a call) is never used, and no page is scraped. When a check gets no
answer the slot keeps its last status; only after 24 hours without an answer is it marked dead.
