// Checks the news pipeline: reading feeds, the disaster filter, outlet
// categories, same-story merging and province tagging.
// Run with: npm test
// No network or database is used: the feed samples are trimmed copies of real feeds.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { decodeEntities, parseFeed } from '../src/fetchers/rss.ts';
import { isDisasterHeadline } from '../src/news/keywords.ts';
import { categoryForOutlet, outletFor, outletKey } from '../src/news/outlets.ts';
import { isSameStory, storyKey } from '../src/news/storyKey.ts';
import { tagProvinces } from '../src/news/tagProvinces.ts';
import { NEWS_FEEDS } from '../src/sources.ts';

function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/news/${name}`, import.meta.url), 'utf8');
}

// "Now" for the samples, so their dates are always judged the same way.
const NOW = new Date('2026-11-16T05:00:00Z');

// ---- Reading feeds ----

test('RSS: good items are read, bad ones skipped, old and future ones dropped', () => {
  const result = parseFeed(fixture('outlet-feed.xml'), NOW);

  assert.deepEqual(
    result.items.map((item) => item.title),
    [
      'Incoming BOC chief vows to pursue Marcos Jr. admin’s priorities',
      'Kanlaon Volcano emits ash anew; Alert Level 2 remains',
      'Fishermen & farmers hit by flood in Cebu',
    ],
  );
  assert.equal(result.skipped, 4); // no link, bad link, bad date, empty title
  assert.equal(result.dropped, 2); // a week old, and dated tomorrow
  assert.equal(result.items[0]?.url, 'https://ptvnews.ph/incoming-boc-chief-vows/');
  assert.equal(result.items[0]?.publishedAt.toISOString(), '2026-11-16T04:00:44.000Z');
  assert.equal(result.items[0]?.outlet, null);
});

test('RSS: Google News outlet comes from <source> and the title suffix is removed', () => {
  const result = parseFeed(fixture('google-news.xml'), NOW);
  const first = result.items[0];

  assert.equal(first?.outlet, 'Rappler');
  assert.equal(first?.title, 'Tropical Depression Luis maintains strength; Dolphin weakens into typhoon outside PAR');
  assert.equal(result.items[1]?.outlet, 'Manila Bulletin');
  assert.equal(result.items[1]?.title.endsWith('Uwan'), true);
  // No <source>: the title is left alone and the outlet is unknown.
  assert.equal(result.items[3]?.outlet, null);
  assert.equal(result.items[3]?.title, 'Headline without a source tag');
});

test('RSS: Atom entries are read too', () => {
  const result = parseFeed(fixture('atom.xml'), NOW);

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0]?.url, 'https://example.ph/lindol');
  assert.equal(result.items[0]?.title, 'Lindol sa Surigao del Norte');
});

test('RSS: text that is not a feed is rejected', () => {
  assert.throws(() => parseFeed('<html><body>Error 404</body></html>', NOW));
});

test('RSS: entities in links are decoded too', () => {
  const xml =
    '<rss><channel><item><title>Baha sa Cebu</title><link>https://a.ph/x?u=1&#038;v=2</link>' +
    '<pubDate>Mon, 16 Nov 2026 04:00:00 +0000</pubDate></item></channel></rss>';
  assert.equal(parseFeed(xml, NOW).items[0]?.url, 'https://a.ph/x?u=1&v=2');
});

test('RSS: HTML entities are decoded', () => {
  assert.equal(decodeEntities('Tom &amp; Jerry &#8217;s &#x2019; &lt;b&gt; &unknown;'), 'Tom & Jerry ’s ’ <b> &unknown;');
});

// ---- Disaster filter ----

test('keywords: disaster headlines in English and Filipino pass', () => {
  const yes = [
    'Super Typhoon Champi enters PAR, named Rosal',
    'Tropical Depression Luis maintains strength',
    'Flash flood hits Cebu City',
    'Floods displace 3,000 families in Pampanga',
    'Magnitude 6.1 earthquake jolts Davao Oriental',
    'Aftershocks continue after Surigao quake',
    'PHIVOLCS: Kanlaon Volcano emits ash anew; Alert Level 2 remains',
    'Mayon eruption: 500 families evacuated',
    'Signal No. 3 raised over Catanduanes',
    'State of calamity declared in Albay',
    'Bagyong Rosal, papasok na sa PAR',
    'Lindol sa Surigao del Norte, 2 patay',
    'Baha sa Marikina, libu-libo apektado',
    'Pagguho ng lupa sa Benguet, 3 nawawala',
    'Pagputok ng bulkan, inaasahan ng Phivolcs',
    'Habagat nagpaulan sa Metro Manila',
    'LPA sa loob ng PAR, posibleng maging bagyo',
    'Gikalit sa linog ang Cebu',
    'NDRRMC: 12 dead after landslide',
    'Moderate Magnitude 4.9 Earthquake Reported 66 km Northeast of Santa Monica, Philippines',
  ];
  for (const title of yes) {
    assert.equal(isDisasterHeadline(title), true, title);
  }
});

test('keywords: ordinary headlines and false-positive words do not pass', () => {
  const no = [
    'PBBM opens ASEAN Summit, urges unity amid global headwinds',
    'Floodlight installed at Rizal Park',
    'Seattle Storm sign new guard',
    'STORM AND ITS LOVING FORCE | SHEAN talks about hit debut single',
    'Flood of complaints hits telco after outage',
    'Netizens flooded with praise for the new video',
    'Crowd erupts in applause as Gilas wins',
    'Eruption of laughter at the press briefing',
    'Quake Champions tournament set for December',
    'Bahamas tourism rebounds',
    'Bahay Kubo Festival opens in Bulacan',
    'Mobile signal no longer reaches the island',
    'Marcos Signs Executive Order 131 Establishing National AI Council',
    'Weak mag. 2.1 earthquake - Philippine Sea, 27 km southeast of Dapa, Philippines',
  ];
  for (const title of no) {
    assert.equal(isDisasterHeadline(title), false, title);
  }
});

test('keywords: case and accents are ignored', () => {
  assert.equal(isDisasterHeadline('TYPHOON hits Parañaque'), true);
  assert.equal(isDisasterHeadline('lindol'), true);
});

// ---- Outlet category ----

test('outlets: normal feeds use their own outlet and category', () => {
  const ptv = NEWS_FEEDS.find((feed) => feed.id === 'feed-ptv');
  assert.ok(ptv);
  assert.deepEqual(outletFor(ptv, null), { outlet: 'PTV', category: 'official' });
  assert.deepEqual(outletFor(ptv, 'Something else'), { outlet: 'PTV', category: 'official' });
});

test('outlets: Google News items take the category of the outlet they name', () => {
  const google = NEWS_FEEDS.find((feed) => feed.mixed);
  assert.ok(google);
  assert.deepEqual(outletFor(google, 'Rappler'), { outlet: 'Rappler', category: 'online' });

test('outlets: repost sites and social media in Google News are dropped', () => {
  const google = { id: 'g', outlet: 'Google News', category: 'international' as const, url: 'u', mixed: true };
  assert.equal(outletFor(google, 'Latest news from Azerbaijan'), null);
  assert.equal(outletFor(google, 'Operativ Media'), null);
  assert.equal(outletFor(google, 'Facebook'), null);
});
  assert.deepEqual(outletFor(google, 'gma news'), { outlet: 'gma news', category: 'tv' });
  assert.equal(outletFor(google, 'Some Village Blog')?.category, 'online'); // the default
  assert.equal(outletFor(google, 'Facebook'), null); // not a news outlet
  assert.equal(outletFor(google, 'LinkedIn'), null);
  assert.equal(outletFor(google, null), null);
  assert.equal(outletFor(google, 'Volcano Discovery'), null); // automatic bulletins
});

test('outlets: spellings of one outlet share a key', () => {
  assert.equal(outletKey('Inquirer.net'), outletKey('Inquirer'));
  assert.equal(outletKey('Philippine Daily Inquirer'), outletKey('INQUIRER'));
  assert.equal(outletKey('GMA Network'), outletKey('GMA News'));
  assert.notEqual(outletKey('Rappler'), outletKey('Inquirer'));
});

test('outlets: names are matched ignoring case, also inside longer names', () => {
  assert.equal(categoryForOutlet('PHILSTAR.COM'), 'online');
  assert.equal(categoryForOutlet('CNN Philippines'), 'international');
  assert.equal(categoryForOutlet('Philippine News Agency'), 'official');
  assert.equal(categoryForOutlet('Bombo Radyo Baguio'), 'radio');
});

// ---- Same story ----

const T0 = new Date('2026-11-16T01:00:00Z');
const hoursLater = (hours: number) => new Date(T0.getTime() + hours * 60 * 60 * 1000);
const story = (title: string, hours = 0, provincePsgcs?: number[]) => ({
  title,
  publishedAt: hoursLater(hours),
  provincePsgcs,
});

test('story key: same words in a different order give the same key', () => {
  assert.equal(storyKey('Floods hit Cebu City!'), storyKey('Cebu City: flood hits'));
  assert.notEqual(storyKey('Flood hits Cebu'), storyKey('Flood hits Davao'));
});

test('story: the same event from different outlets is merged', () => {
  const pairs: [string, string][] = [
    ['Magnitude 6.1 quake hits Surigao del Norte', 'Magnitude 6.1 earthquake jolts Surigao del Norte'],
    ['Signal No. 1 raised in 5 areas as Typhoon Rosal nears', 'Signal No. 3 raised over 8 areas as Typhoon Rosal nears'],
    ['Kanlaon Volcano emits ash anew; Alert Level 2 remains', 'Kanlaon Volcano emits ash again, Alert Level 2 remains'],
    ['Lindol sa Surigao del Norte, 2 patay', 'Lindol tumama sa Surigao del Norte; 2 patay'],
    ['Magnitude 5.1 earthquake hits Philippines', "Magnitude 5.1 earthquake strikes Philippines' Mindanao island"],
    // The agencies often differ by a few tenths of a magnitude.
    ['Magnitude 5.4 earthquake hits off Surigao del Norte', 'Magnitude 5.8 earthquake jolts waters off Surigao del Norte'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(isSameStory(story(a), story(b, 3)), true, `${a}  |  ${b}`);
  }
});

test('story: different events are not merged', () => {
  const pairs: [string, string][] = [
    ['Magnitude 6.1 earthquake jolts Surigao del Norte', 'Magnitude 5.2 earthquake jolts Surigao del Norte'],
    ['Kanlaon Volcano emits ash anew', 'Typhoon Rosal enters PAR'],
    ['Typhoon Rosal batters Catanduanes', 'Typhoon Rosal weakens, exits PAR'],
  ];
  for (const [a, b] of pairs) {
    assert.equal(isSameStory(story(a), story(b, 3)), false, `${a}  |  ${b}`);
  }
  // Same wording, different place: the province tags keep them apart.
  const cebu = story('Flood hits Cebu City, 500 families evacuated', 0, tagProvinces('Cebu City', PROVINCES));
  const davao = story('Flood hits Davao City, 500 families evacuated', 3, tagProvinces('Davao City', PROVINCES));
  assert.equal(isSameStory(cebu, davao), false);
  const benguet = story('Landslide in Benguet kills 3', 0, tagProvinces('Benguet', PROVINCES));
  const leyte = story('Landslide in Leyte kills 3', 3, tagProvinces('Leyte', PROVINCES));
  assert.equal(isSameStory(benguet, leyte), false);
});

test('story: provinces that differ stop a merge, even if the words match', () => {
  const a = story('Flash flood hits town, families evacuated', 0, [702200000]);
  const b = story('Flash flood hits town, families evacuated', 1, [1102400000]);
  assert.equal(isSameStory(a, b), false);
  assert.equal(isSameStory(a, story('Flash flood hits town, families evacuated', 1, [702200000])), true);
});

test('story: the same words 3 days apart are not merged', () => {
  const title = 'Kanlaon Volcano emits ash anew; Alert Level 2 remains';
  assert.equal(isSameStory(story(title), story(title, 47)), true);
  assert.equal(isSameStory(story(title), story(title, 49)), false);
});

// ---- Province tagging ----

// A few real rows from the provinces table.
const PROVINCES = [
  { psgc: 702200000, name: 'Cebu' },
  { psgc: 990100000, name: 'City of Isabela' },
  { psgc: 203100000, name: 'Isabela' },
  { psgc: 1900700000, name: 'Basilan' },
  { psgc: 1102400000, name: 'Davao del Sur' },
  { psgc: 1102300000, name: 'Davao del Norte' },
  { psgc: 1102500000, name: 'Davao Oriental' },
  { psgc: 1108200000, name: 'Davao de Oro' },
  { psgc: 1108600000, name: 'Davao Occidental' },
  { psgc: 806000000, name: 'Samar' },
  { psgc: 804800000, name: 'Northern Samar' },
  { psgc: 802600000, name: 'Eastern Samar' },
  { psgc: 1404400000, name: 'Mountain Province' },
  { psgc: 1401100000, name: 'Benguet' },
  { psgc: 803700000, name: 'Leyte' },
  { psgc: 806400000, name: 'Southern Leyte' },
  { psgc: 500500000, name: 'Albay' },
  { psgc: 405600000, name: 'Quezon' },
  { psgc: 1303900000, name: 'NCR, City of Manila, First District' },
  { psgc: 1307400000, name: 'NCR, Second District' },
  { psgc: 1307500000, name: 'NCR, Third District' },
  { psgc: 1307600000, name: 'NCR, Fourth District' },
  { psgc: 1204700000, name: 'Cotabato' },
  { psgc: 1206300000, name: 'South Cotabato' },
  { psgc: 1908700000, name: 'Maguindanao del Norte' },
  { psgc: 1908800000, name: 'Maguindanao del Sur' },
  { psgc: 907300000, name: 'Zamboanga del Sur' },
  { psgc: 907200000, name: 'Zamboanga del Norte' },
  { psgc: 1907000000, name: 'Tawi-Tawi' },
];

test('provinces: plain names, with accents and case ignored', () => {
  assert.deepEqual(tagProvinces('Flood hits CEBU', PROVINCES), [702200000]);
  assert.deepEqual(tagProvinces('Baha sa Tawi Tawi', PROVINCES), [1907000000]);
  assert.deepEqual(tagProvinces('PBBM opens ASEAN Summit', PROVINCES), []);
});

test('provinces: whole words only', () => {
  assert.deepEqual(tagProvinces('Cebuano fishermen rescued', PROVINCES), []);
});

test('provinces: the longest name wins', () => {
  assert.deepEqual(tagProvinces('Quake hits Davao del Sur', PROVINCES), [1102400000]);
  assert.deepEqual(tagProvinces('Quake hits Davao Oriental', PROVINCES), [1102500000]);
  assert.deepEqual(tagProvinces('Typhoon hits Northern Samar', PROVINCES), [804800000]);
  assert.deepEqual(tagProvinces('Typhoon hits Eastern Samar and Samar', PROVINCES), [802600000, 806000000]);
  assert.deepEqual(tagProvinces('Flood in Southern Leyte', PROVINCES), [806400000]);
  assert.deepEqual(tagProvinces('Flood in South Cotabato', PROVINCES), [1206300000]);
  assert.deepEqual(tagProvinces('Landslide in Mountain Province', PROVINCES), [1404400000]);
  assert.deepEqual(tagProvinces('Quezon City flood', PROVINCES), [1307400000]); // not Quezon province
});

test('provinces: bare Davao and Zamboanga tag the "del Sur" province', () => {
  assert.deepEqual(tagProvinces('Earthquake shakes Davao', PROVINCES), [1102400000]);
  assert.deepEqual(tagProvinces('Flood in Zamboanga City', PROVINCES), [907300000]);
});

test('provinces: Metro Manila, NCR and Manila', () => {
  const all = [1303900000, 1307400000, 1307500000, 1307600000];
  assert.deepEqual(tagProvinces('Heavy rain floods Metro Manila', PROVINCES), all);
  assert.deepEqual(tagProvinces('NCR on alert for flooding', PROVINCES), all);
  assert.deepEqual(tagProvinces('Flood in Manila', PROVINCES), [1303900000]);
  assert.deepEqual(tagProvinces('Quake at 10:00 am (Manila time), says Manila Bulletin', PROVINCES), []);
  assert.deepEqual(tagProvinces('Flood in Marikina and Makati', PROVINCES), [1307400000, 1307600000]);
});

test('provinces: Isabela province and Isabela City (Basilan)', () => {
  assert.deepEqual(tagProvinces('Flood in Isabela', PROVINCES), [203100000]);
  assert.deepEqual(tagProvinces('Flood in Isabela City', PROVINCES), [1900700000]);
  assert.deepEqual(tagProvinces('Flood in the City of Isabela', PROVINCES), [1900700000]);
});

test('provinces: Maguindanao and Cotabato', () => {
  assert.deepEqual(tagProvinces('Flood in Maguindanao', PROVINCES), [1908700000, 1908800000]);
  assert.deepEqual(tagProvinces('Flood in Cotabato City', PROVINCES), [1908700000]);
  assert.deepEqual(tagProvinces('Flood in North Cotabato', PROVINCES), [1204700000]);
});

test('provinces: cities and volcanoes name their province', () => {
  assert.deepEqual(tagProvinces('Flood in Cebu City', PROVINCES), [702200000]);
  assert.deepEqual(tagProvinces('Tacloban residents evacuate', PROVINCES), [803700000]);
  assert.deepEqual(tagProvinces('Legazpi flooded', PROVINCES), [500500000]);
  assert.deepEqual(tagProvinces('Baguio landslide', PROVINCES), [1401100000]);
  assert.deepEqual(tagProvinces('Mayon erupts', PROVINCES), [500500000]);
});

test('provinces: two provinces in one headline', () => {
  assert.deepEqual(tagProvinces('Floods in Cebu and Leyte', PROVINCES), [702200000, 803700000]);
});
