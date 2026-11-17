// The place search rule: which cities, municipalities and provinces match
// what the reader typed, and in what order. Pure: the list is passed in.
// (routes/places.ts loads the list from the database.)

import type { PlaceMatch } from '@ph-monitor/shared';

export type SearchPlace = PlaceMatch;

/** Fewer letters than this find nothing. */
export const MIN_QUERY_LETTERS = 2;
const DEFAULT_LIMIT = 10;

// Words that say what a place is, not what it is called: "City of Cebu" and
// "Cebu City" are both looked up as "cebu".
const FILLER_WORDS = ['city', 'of'];

/**
 * Lower case, no accents, words only: "City of Parañaque" → ['city', 'of', 'paranaque'].
 * normalize('NFD') splits "ñ" into "n" plus a separate accent mark, which the
 * first replace then removes.
 */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '');
}

const withoutFillers = (list: string[]) => list.filter((word) => !FILLER_WORDS.includes(word));

// Cities first: someone typing "cebu" most likely means the city.
const KIND_ORDER = { city: 0, province: 1, municipality: 2 };

/**
 * The places matching `query`, best first.
 * Every typed word must be the start of a word in the place's name or in its
 * province's name, and at least one must be in the place's own name.
 * Order: an exact name, then a name that starts with the query, then the rest;
 * within each, cities, then provinces, then municipalities, by name.
 */
export function searchPlaces(places: SearchPlace[], query: string, limit: number = DEFAULT_LIMIT): SearchPlace[] {
  const typed = words(query);
  if (typed.join('').length < MIN_QUERY_LETTERS) return [];
  const typedName = withoutFillers(typed).join(' ');

  const matches: { place: SearchPlace; rank: number }[] = [];
  for (const place of places) {
    const nameWords = words(place.name);
    const provinceWords = words(place.provinceName ?? '');
    const startsAWord = (list: string[], typedWord: string) => list.some((word) => word.startsWith(typedWord));

    // `every` = true for all of them; `some` = true for at least one.
    const allFound = typed.every((word) => startsAWord(nameWords, word) || startsAWord(provinceWords, word));
    const oneInName = typed.some((word) => startsAWord(nameWords, word));
    if (!allFound || !oneInName) continue;

    const name = withoutFillers(nameWords).join(' ');
    const rank = name === typedName ? 0 : name.startsWith(typedName) ? 1 : 2;
    matches.push({ place, rank });
  }

  matches.sort(
    (a, b) =>
      a.rank - b.rank ||
      KIND_ORDER[a.place.kind] - KIND_ORDER[b.place.kind] ||
      a.place.name.localeCompare(b.place.name) ||
      (a.place.provinceName ?? '').localeCompare(b.place.provinceName ?? ''),
  );
  return matches.slice(0, limit).map((match) => match.place);
}
