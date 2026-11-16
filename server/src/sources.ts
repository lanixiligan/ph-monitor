// Every news feed and live stream link, in one place. A dead link is fixed here.
// Each link was checked by hand on 2026-11-16; `npm run check:sources` re-checks them.
//
// Outlet categories are labels for filtering and grouping, not a ranking of trust.

import type { OutletCategory } from '@ph-monitor/shared';

/** Every category with its English and Filipino label. */
// Filipino labels are drafts for the owner to review.
export const OUTLET_CATEGORIES: { id: OutletCategory; label: string; labelFil: string }[] = [
  { id: 'official', label: 'Official', labelFil: 'Opisyal' },
  { id: 'tv', label: 'TV', labelFil: 'Telebisyon' },
  { id: 'radio', label: 'Radio', labelFil: 'Radyo' },
  { id: 'online', label: 'Online and newspapers', labelFil: 'Online at diyaryo' },
  { id: 'regional', label: 'Regional', labelFil: 'Panrehiyon' },
  { id: 'international', label: 'International', labelFil: 'Pandaigdig' },
];

/** Stories from outlets we don't know go under this category. */
export const DEFAULT_CATEGORY: OutletCategory = 'online';

export type NewsFeed = {
  /** Short fixed name, also the key in the `sources` table. */
  id: string;
  outlet: string;
  category: OutletCategory;
  url: string;
  /**
   * true = a search feed that mixes many outlets (Google News). Each story
   * then takes the category of the outlet it names, see KNOWN_OUTLETS.
   */
  mixed?: boolean; // `?` means the field may be left out
};

// The words Google News searches for. Kept short; the full keyword filter
// (English + Filipino) lives with the news job.
const GOOGLE_NEWS_QUERY =
  '(bagyo OR baha OR lindol OR typhoon OR earthquake OR flood OR landslide OR volcano) Philippines when:2d';

export const NEWS_FEEDS: NewsFeed[] = [
  {
    id: 'feed-google-news',
    outlet: 'Google News',
    category: 'international',
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(GOOGLE_NEWS_QUERY)}&hl=en-PH&gl=PH&ceid=PH:en`,
    mixed: true,
  },
  { id: 'feed-ptv', outlet: 'PTV', category: 'official', url: 'https://ptvnews.ph/feed/' },
  { id: 'feed-gma', outlet: 'GMA News', category: 'tv', url: 'https://data.gmanetwork.com/gno/rss/news/feed.xml' },
  { id: 'feed-gma-regions', outlet: 'GMA News', category: 'tv', url: 'https://data.gmanetwork.com/gno/rss/news/regions/feed.xml' },
  { id: 'feed-bombo', outlet: 'Bombo Radyo', category: 'radio', url: 'https://www.bomboradyo.com/feed/' },
  { id: 'feed-rappler', outlet: 'Rappler', category: 'online', url: 'https://www.rappler.com/philippines/feed/' },
  { id: 'feed-inquirer', outlet: 'Inquirer', category: 'online', url: 'https://newsinfo.inquirer.net/feed' },
  { id: 'feed-philstar', outlet: 'PhilStar', category: 'online', url: 'https://www.philstar.com/rss/headlines' },
  { id: 'feed-philstar-nation', outlet: 'PhilStar', category: 'online', url: 'https://www.philstar.com/rss/nation' },
  { id: 'feed-manila-times', outlet: 'The Manila Times', category: 'online', url: 'https://www.manilatimes.net/news/feed/' },
  { id: 'feed-interaksyon', outlet: 'Interaksyon', category: 'online', url: 'https://interaksyon.philstar.com/feed/' },
  { id: 'feed-sunstar', outlet: 'SunStar', category: 'regional', url: 'https://www.sunstar.com.ph/api/v1/collections/home.rss' },
  { id: 'feed-mindanews', outlet: 'MindaNews', category: 'regional', url: 'https://mindanews.com/feed/' },
];

/**
 * Outlet names as they appear in Google News results, with their category.
 * Matching ignores upper/lower case. Anything not listed gets DEFAULT_CATEGORY.
 */
export const KNOWN_OUTLETS: { name: string; category: OutletCategory }[] = [
  { name: 'PAGASA', category: 'official' },
  { name: 'PHIVOLCS', category: 'official' },
  { name: 'Philippine News Agency', category: 'official' },
  { name: 'Philippine Information Agency', category: 'official' },
  { name: 'PTV', category: 'official' },
  { name: 'GMA Network', category: 'tv' },
  { name: 'GMA News', category: 'tv' },
  { name: 'ABS-CBN', category: 'tv' },
  { name: 'News5', category: 'tv' },
  { name: 'UNTV', category: 'tv' },
  { name: 'DZRH', category: 'radio' },
  { name: 'DZBB', category: 'radio' },
  { name: 'Bombo Radyo', category: 'radio' },
  { name: 'Rappler', category: 'online' },
  { name: 'Inquirer', category: 'online' },
  { name: 'Philstar', category: 'online' },
  { name: 'Manila Bulletin', category: 'online' },
  { name: 'The Manila Times', category: 'online' },
  { name: 'BusinessWorld', category: 'online' },
  { name: 'SunStar', category: 'regional' },
  { name: 'MindaNews', category: 'regional' },
  { name: 'Reuters', category: 'international' },
  { name: 'AP News', category: 'international' },
  { name: 'Associated Press', category: 'international' },
  { name: 'AFP', category: 'international' },
  { name: 'BBC', category: 'international' },
  { name: 'Al Jazeera', category: 'international' },
  { name: 'CNN', category: 'international' },
  { name: 'The Guardian', category: 'international' },
  { name: 'Bloomberg', category: 'international' },
];

/**
 * One way to reach a stream.
 * `channelId`: a YouTube channel (id starts with "UC"); the checker looks up
 * its newest video. `videoId`: one fixed YouTube video.
 */
export type StreamLink = { channelId: string } | { videoId: string };

export type StreamSlotConfig = {
  /** Short fixed name, also the key in the `sources` table. */
  id: string;
  outlet: string;
  category: OutletCategory;
  /** Tried in order; the first one that works is shown. */
  links: StreamLink[];
};

// YouTube only. Raw TV feeds (.m3u8) are never re-streamed.
export const STREAM_SLOTS: StreamSlotConfig[] = [
  { id: 'stream-pagasa', outlet: 'DOST-PAGASA', category: 'official', links: [{ channelId: 'UCpyLikj1x70S8UPxVqsPr6g' }] },
  { id: 'stream-phivolcs', outlet: 'PHIVOLCS', category: 'official', links: [{ channelId: 'UCNtpwEyrUvcs7HHppMbLP8A' }] },
  { id: 'stream-civil-defense', outlet: 'Civil Defense PH', category: 'official', links: [{ channelId: 'UCil7YQ9Hwc2mTTQcaRw1InA' }] },
  { id: 'stream-ptv', outlet: 'PTV', category: 'official', links: [{ channelId: 'UCJCUbMaY593_4SN1QPG7NFQ' }] },
  { id: 'stream-gma', outlet: 'GMA News', category: 'tv', links: [{ channelId: 'UCqYw-CTd1dU2yGI71sEyqNw' }] },
  {
    id: 'stream-abs-cbn',
    outlet: 'ABS-CBN News',
    category: 'tv',
    // Backup: ANC, ABS-CBN's news channel.
    links: [{ channelId: 'UCE2606prvXQc_noEqKxVJXA' }, { channelId: 'UCvi6hEzLM-Z_unKPSuuzKvg' }],
  },
  { id: 'stream-untv', outlet: 'UNTV News and Rescue', category: 'tv', links: [{ channelId: 'UC3XaG-7UVi2vD8ZZEMNnnpw' }] },
  { id: 'stream-one-news', outlet: 'One News PH', category: 'tv', links: [{ channelId: 'UCzEAC4xGrhpShopTYgBhGJA' }] },
  {
    id: 'stream-dzrh',
    outlet: 'DZRH',
    category: 'radio',
    links: [{ channelId: 'UCcTiBX8js_djhSSlmJRI99A' }, { channelId: 'UCkvhMUPIoV9oaM05W5XpBVQ' }],
  },
  { id: 'stream-dzbb', outlet: 'Super Radyo DZBB', category: 'radio', links: [{ channelId: 'UCYFgnkDYr-G5L_iy6DZdvSA' }] },
  {
    id: 'stream-dzmm',
    outlet: 'DZMM Teleradyo',
    category: 'radio',
    links: [{ channelId: 'UC-RoNhw2na0SfUbHdT8K_8w' }, { channelId: 'UCuPHU8aJythPHPBrdHCZiBA' }],
  },
  { id: 'stream-rappler', outlet: 'Rappler', category: 'online', links: [{ channelId: 'UCdnZdQxYXnbN4uWJg96oGxw' }] },
  { id: 'stream-inquirer', outlet: 'INQUIRER.net', category: 'online', links: [{ channelId: 'UCvRAX-ujvZ0eTMLGG2vki9w' }] },
  { id: 'stream-bombo', outlet: 'Bombo Radyo Philippines', category: 'regional', links: [{ channelId: 'UCVVw9u0pZ3nnWxx7WyE8YkQ' }] },
  { id: 'stream-sunstar', outlet: 'SunStar Philippines', category: 'regional', links: [{ channelId: 'UCRNMeOnzX8ZRExN24gqWUsg' }] },
];

/** Official bulletin pages, shown as plain links on the status card. */
export const BULLETIN_LINKS = [
  { id: 'pagasa-cyclone', agency: 'PAGASA', label: 'Tropical cyclone bulletin', url: 'https://www.pagasa.dost.gov.ph/tropical-cyclone/severe-weather-bulletin' },
  { id: 'pagasa-flood', agency: 'PAGASA', label: 'Flood information', url: 'https://www.pagasa.dost.gov.ph/flood' },
  { id: 'phivolcs-volcano', agency: 'PHIVOLCS', label: 'Volcano bulletins', url: 'https://wovodat.phivolcs.dost.gov.ph/bulletin/list-of-bulletin' },
  { id: 'phivolcs-earthquake', agency: 'PHIVOLCS', label: 'Earthquake information', url: 'https://earthquake.phivolcs.dost.gov.ph/' },
];
