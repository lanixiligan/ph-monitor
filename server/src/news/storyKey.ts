// Spots the same story told by different outlets.
// storyKey() boils a headline down to its significant words (exact match);
// isSameStory() also catches near-duplicates by comparing word overlap.

import { normalize } from './text.ts';

/** How much two headlines must overlap (0 to 1) to count as one story. */
export const SAME_STORY_THRESHOLD = 0.5;
/** ...and they must share at least this many significant words. */
const MIN_SHARED_WORDS = 3;
/** Stories further apart in time than this are never merged. */
const WINDOW_MS = 48 * 60 * 60 * 1000;

// Little words that carry no meaning for matching (English and Filipino),
// plus words every disaster headline repeats.
const STOP_WORDS = new Set(
  (
    'a an the of in on at to for and or but is are was were be been by with from as that this it its into ' +
    'after over amid vs says said say new more than up out off no not has have had will may ' +
    'ang ng sa mga na at ay si ni kay para ito dahil may mayroon pa din rin daw ' +
    'live update updates latest news philippines philippine ph signal'
  ).split(' '),
);

// Different words for the same thing become one word.
const SAME_MEANING: Record<string, string> = {
  quake: 'earthquake',
  lindol: 'earthquake',
  bagyo: 'typhoon',
  baha: 'flood',
  flooding: 'flood',
  flooded: 'flood',
  evacuated: 'evacuate',
  evacuation: 'evacuate',
  erupt: 'eruption',
  erupted: 'eruption',
  strike: 'hit',
  jolt: 'hit',
  shake: 'hit',
  rock: 'hit',
  batter: 'hit',
};

// "magnitude 6.1", "mag. 6.1" or "M6.1" becomes the one word "mag6p1" (letters
// only, because normalize() would split "6.1"), so two different earthquakes
// are not mistaken for one story.
function protectMagnitudes(title: string): string {
  return title.replace(
    /\b(?:(?:magnitude|mag\.?)\s?|m)(\d)(?:\.(\d))?\b/gi,
    (_all, whole: string, tenth?: string) => ` mag${whole}p${tenth ?? '0'} `,
  );
}

/** The significant words of a headline, without repeats. */
export function storyWords(title: string): string[] {
  const words: string[] = [];
  for (const raw of normalize(protectMagnitudes(title)).split(' ')) {
    if (raw === '' || STOP_WORDS.has(raw)) continue;
    // Plain numbers (counts, signal numbers, dates) change between outlets
    // and updates, so they say nothing about which story it is.
    if (/^\d+$/.test(raw)) continue;
    // Cut a plural "s": "floods" and "flood" are the same word.
    const singular = raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw;
    const word = SAME_MEANING[singular] ?? singular;
    if (!STOP_WORDS.has(word) && !words.includes(word)) words.push(word);
  }
  return words;
}

/** A short text that is equal for headlines with the same significant words. */
export function storyKey(title: string): string {
  return storyWords(title).sort().join(' ');
}

/** What isSameStory needs to know about a headline. */
export type StoryRef = {
  title: string;
  publishedAt: Date;
  /** Provinces named in the headline, if known. */
  provincePsgcs?: number[];
};

// The magnitude in a list of words ("mag6p1" means 6.1), or null.
function magnitudeOf(words: string[]): number | null {
  const word = words.find((w) => /^mag\dp\d$/.test(w));
  return word ? Number(`${word[3]}.${word[5]}`) : null;
}

// Outlets often report slightly different magnitudes for one quake
// (PHIVOLCS 5.4, USGS 5.8). A gap of this much or more means two quakes.
const MAGNITUDE_GAP = 0.5;

const unifyMagnitude = (word: string) => (/^mag\dp\d$/.test(word) ? 'mag' : word);

/** True if the two headlines are very likely the same story. */
export function isSameStory(a: StoryRef, b: StoryRef): boolean {
  if (Math.abs(a.publishedAt.getTime() - b.publishedAt.getTime()) > WINDOW_MS) return false;

  const wordsA = storyWords(a.title);
  const wordsB = storyWords(b.title);
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  // Two different provinces named: two different events (Cebu vs Davao flood).
  const provincesA = a.provincePsgcs ?? [];
  const provincesB = b.provincePsgcs ?? [];
  if (provincesA.length > 0 && provincesB.length > 0 && !provincesA.some((p) => provincesB.includes(p))) {
    return false;
  }

  // Two different magnitudes: two different earthquakes.
  const magA = magnitudeOf(wordsA);
  const magB = magnitudeOf(wordsB);
  if (magA !== null && magB !== null && Math.abs(magA - magB) >= MAGNITUDE_GAP) return false;

  // Two close magnitudes (5.4 and 5.8) count as one shared word.
  const bothHaveMagnitude = magA !== null && magB !== null;
  const closeA = bothHaveMagnitude ? wordsA.map(unifyMagnitude) : wordsA;
  const closeB = bothHaveMagnitude ? wordsB.map(unifyMagnitude) : wordsB;
  const shared = closeA.filter((word) => closeB.includes(word)).length;
  const union = closeA.length + closeB.length - shared;
  return shared >= MIN_SHARED_WORDS && shared / union >= SAME_STORY_THRESHOLD;
}
