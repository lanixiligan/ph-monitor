// Decides whether a headline is about a natural disaster, and which kinds.
// English, Filipino and a few common Cebuano words. Matching is on whole
// words, ignoring case and accents, so "flood" does not match "floodlight".
//
// Steps (classifyHeadline):
// 1. Weak quake bulletins (below magnitude 4) are dropped.
// 2. Phrases that only look like a disaster ("flood control", "Pagasa
//    Island", "landslide win") are cut out.
// 3. The kinds of disaster named (TYPE_KEYWORDS, plus the names of current
//    storms) are collected.
// 4. With no kind named, a response word (evacuation, state of calamity, an
//    agency name) still counts, as "general", unless the headline names a
//    cause that is not a natural hazard (a building fire, a war, a disease)
//    or a place abroad.
// 5. A disaster abroad is dropped unless the headline also names the
//    Philippines or a Philippine province.

import { NEWS_TYPES } from '@ph-monitor/shared';
import type { NewsType } from '@ph-monitor/shared';
import { normalize } from './text.ts';

// Each entry is a small pattern written on already-normalized text
// (lower-case, no accents, no punctuation). `s?` means "an optional s";
// `\d` means "one digit". Only whole words match.
// `Record<NewsType, string[]>` means "one list of patterns for each kind".
export const TYPE_KEYWORDS: Record<NewsType, string[]> = {
  typhoon: [
    'typhoons?',
    'super typhoons?',
    'tropical storms?',
    'tropical depressions?',
    'tropical cyclones?',
    'cyclones?',
    'storm surges?',
    'low pressure areas?',
    'lpa',
    'signal no \\d',
    'wind signals?',
    // Filipino bagyo, Cebuano unos: storm. Daluyong: storm surge.
    'bagyo(?:ng)?',
    'unos',
    'daluyong',
  ],
  flood: [
    'floods?',
    'flooded',
    'flooding',
    'floodwaters?',
    'flash floods?',
    'heavy rains?',
    'rainfall warnings?',
    'habagat',
    'southwest monsoon',
    // Filipino baha, binaha, pagbaha: flood; ulan: rain. Cebuano lunop: flood.
    'baha',
    'binaha',
    'pagbaha',
    'ulan',
    'lunop',
  ],
  earthquake: [
    'earthquakes?',
    'quakes?',
    'aftershocks?',
    'tremors?',
    // "Magnitude 6.9 jolts Cebu" names no quake word.
    'magnitude \\d',
    // Filipino lindol, Cebuano linog: earthquake.
    'lindol',
    'linog',
  ],
  volcano: [
    'volcanos?',
    'volcanoes',
    'volcanic',
    'eruptions?',
    'erupts?',
    'erupted',
    'erupting',
    'phreatic',
    'ashfall',
    'lahars?',
    'kanlaon',
    'mayon',
    'bulusan',
    // Filipino bulkan: volcano.
    'bulkan',
    'pagputok ng bulkan',
  ],
  landslide: [
    'landslides?',
    'mudslides?',
    'rockslides?',
    // Filipino: landslide.
    'pagguho ng lupa',
  ],
  tsunami: ['tsunamis?', 'storm surges?', 'daluyong'],
  drought: [
    'droughts?',
    'dry spells?',
    'el nino',
    // Filipino tagtuyot: drought.
    'tagtuyot',
  ],
  wildfire: [
    'wildfires?',
    'forest fires?',
    'grass fires?',
    'brush fires?',
    'bush fires?',
    // Filipino: a fire on a mountain or in a forest.
    'sunog sa (?:bundok|gubat|kagubatan)',
  ],
  heat: [
    'heat index',
    'heat indices',
    'heat indexes',
    'extreme heat',
    'dangerous heat',
    'heat waves?',
    'heatwaves?',
    'heat ?strokes?',
    'heat exhaustion',
    // Filipino: extreme heat; alinsangan: sultry heat.
    'matinding init',
    'alinsangan',
  ],
};

// Words that say "a disaster is going on" without naming its kind.
export const GENERAL_KEYWORDS: string[] = [
  'evacuations?',
  'evacuees?',
  'evacuated',
  'evacuate',
  'state of calamity',
  'pagasa',
  'phivolcs',
  'ndrrmc',
  // Filipino: to evacuate, evacuation.
  'lumikas',
  'paglikas',
];

// Causes that are not natural hazards. A headline with only a general word
// and one of these (an evacuation after a building fire, a calamity over a
// pest) is not kept.
export const OTHER_CAUSES: string[] = [
  'fires?',
  'blaze',
  'sunog',
  'arson',
  'bomb(?:s|ing)?',
  'missiles?',
  'wars?',
  'conflicts?',
  'clash(?:es)?',
  'armed',
  'rebels?',
  'terror\\w*',
  'infestation',
  'pests?',
  'energy',
  'power (?:crisis|outage)',
  'swine fever',
  'asf',
  'coronavirus',
  'covid(?: 19)?',
  'dengue',
  'outbreak',
  'disease',
  'oil spill',
];

// Places abroad. A disaster there is dropped unless the Philippines is named too.
export const ABROAD: string[] = [
  'indonesian?',
  'aceh',
  'sumatra',
  'java',
  'bali',
  'japan(?:ese)?',
  'okinawa',
  'taiwan(?:ese)?',
  'china',
  'hong kong',
  'vietnam(?:ese)?',
  'thailand',
  'thai',
  'malaysian?',
  'myanmar',
  'india',
  'nepal',
  'pakistan',
  'bangladesh',
  'sri lanka',
  'korean?',
  'guam',
  'europe(?:an)?',
  'turkey',
  'afghanistan',
  'iran',
  'iraq',
  'israel',
  'gaza',
  'lebanon',
  'ukraine',
  'middle east',
  'africa',
  'mexico',
  'california',
];

// Words that place a headline in the Philippines. PAR is the area PAGASA watches.
export const PHILIPPINES: string[] = ['philippines?', 'ph', 'pinas', 'pilipinas', 'filipinos?', 'par'];

// Phrases that contain a keyword but are not about a disaster. They are
// cut out of the headline before the keywords are checked.
// Left out on purpose: "amihan" (also a first name) and bare "storm"
// (sports teams, songs).
export const EXCLUDE_PHRASES: string[] = [
  'floods? of (?:complaints?|tears|messages?|praise|support|criticism|tourists?|cash|orders?)',
  'floods? (?:the )?(?:market|social media|timeline|feeds?)',
  'flooded with',
  'flooding (?:the )?(?:market|social media|timeline)',
  'floodlights?',
  // The flood-control corruption scandal and its projects are not a flood.
  'flood control',
  'erupt(?:s|ed)? (?:in|with|into) (?:applause|cheers?|laughter|anger|joy|tears|violence|controversy|protest)',
  'eruptions? of (?:laughter|anger|violence|cheers|applause|joy|controversy)',
  'quake champions',
  // An island in the West Philippine Sea, not the weather agency.
  'pagasa island',
  // Elections.
  'landslides? (?:win|wins|victory|vote)',
  '(?:wins?|won|winning) by a landslide',
  // Man-made collapses, left out while the focus is natural disasters.
  'garbage landslides?',
  // A daily worldwide list, not news about one place.
  'world earthquake report',
  // "Philippine Sea" alone does not place a quake in the Philippines.
  'philippine sea',
];

// `(?:^| )` and `(?: |$)` make a pattern match whole words only.
function wordsPattern(patterns: string[]): RegExp {
  return new RegExp(`(?:^| )(?:${patterns.join('|')})(?: |$)`);
}

const typePatterns = NEWS_TYPES.map((type) => ({ type, pattern: wordsPattern(TYPE_KEYWORDS[type]) }));
const generalPattern = wordsPattern(GENERAL_KEYWORDS);
const otherCausePattern = wordsPattern(OTHER_CAUSES);
const abroadPattern = wordsPattern(ABROAD);
const philippinesPattern = wordsPattern(PHILIPPINES);
const excludePattern = new RegExp(`(?:^| )(?:${EXCLUDE_PHRASES.join('|')})(?= |$)`, 'g');

// Quakes weaker than this are not news (several happen every hour).
const MIN_NEWS_MAGNITUDE = 4;

/** A storm seen lately. A local PAGASA name ("Uwan") is often also a person's name, so it counts only in quotes. */
export type StormName = { name: string; needsQuotes: boolean };

/** What the filter decided. `types` is empty for a general disaster headline. */
export type HeadlineCheck = { disaster: boolean; types: NewsType[] };

export type CheckOptions = {
  /** Names of storms seen lately; a headline naming one is about a typhoon. */
  storms?: StormName[];
  /** True if the headline names a Philippine province (from the place tagger). */
  namesProvince?: boolean;
};

// Regex special characters in a storm name ("Man-yi") are escaped.
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True if the headline names one of the storms (quoted, when the name needs quotes). */
function namesStorm(title: string, text: string, storms: StormName[]): boolean {
  for (const storm of storms) {
    const name = normalize(storm.name);
    if (name.length < 3) continue;
    if (storm.needsQuotes) {
      // Straight or curly quotes, single or double, right around the name.
      const quoted = new RegExp(`['‘’"“”]${escapeRegex(storm.name)}['‘’"“”]`, 'i');
      if (quoted.test(title)) return true;
    } else if (` ${text} `.includes(` ${name} `)) {
      return true;
    }
  }
  return false;
}

const NOT_A_DISASTER: HeadlineCheck = { disaster: false, types: [] };

/** Is the headline about a natural disaster, and which kinds? */
export function classifyHeadline(title: string, options: CheckOptions = {}): HeadlineCheck {
  // "Weak mag. 2.1 earthquake - ..." style bulletins are dropped.
  const magnitude = /\bmag(?:nitude|\.)?\s?(\d(?:\.\d)?)/i.exec(title);
  if (magnitude && Number(magnitude[1]) < MIN_NEWS_MAGNITUDE) return NOT_A_DISASTER;

  // Cut out the false-positive phrases first, leaving a space behind.
  const text = normalize(title).replace(excludePattern, ' ').replace(/ +/g, ' ').trim();

  const types: NewsType[] = typePatterns.filter(({ pattern }) => pattern.test(text)).map(({ type }) => type);
  if (!types.includes('typhoon') && namesStorm(title, text, options.storms ?? [])) {
    // Keep the panel's order: typhoon is first.
    types.unshift('typhoon');
  }

  const abroad = abroadPattern.test(text);
  const inPhilippines = philippinesPattern.test(text) || options.namesProvince === true;

  if (types.length === 0) {
    // Only a response word: kept as general, unless the cause is not a
    // natural hazard or the response is abroad (evacuations from a war zone).
    if (!generalPattern.test(text) || otherCausePattern.test(text) || abroad) return NOT_A_DISASTER;
    return { disaster: true, types: [] };
  }

  if (abroad && !inPhilippines) return NOT_A_DISASTER;
  return { disaster: true, types };
}

/** True if the headline is about a storm, flood, quake, volcano or similar. */
export function isDisasterHeadline(title: string, options: CheckOptions = {}): boolean {
  return classifyHeadline(title, options).disaster;
}
