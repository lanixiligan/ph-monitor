// Works out which outlet and category a headline belongs to.

import type { OutletCategory } from '@ph-monitor/shared';
import { DEFAULT_CATEGORY, KNOWN_OUTLETS, type NewsFeed } from '../sources.ts';
import { hasWords, normalize } from './text.ts';

// Not news outlets: Google News also lists social-media posts. Dropped.
// Also dropped: Volcano Discovery, which posts automatic bulletins for every
// small quake, and two sites that only repost wire stories.
export const IGNORED_OUTLETS = [
  'facebook', 'youtube', 'x', 'twitter', 'instagram', 'tiktok', 'reddit', 'linkedin',
  'volcano discovery',
  'latest news from azerbaijan',
  'operativ media',
];

// Different spellings of one outlet that "contains a known name" does not catch.
const OUTLET_ALIASES: Record<string, string> = { 'gma network': 'gma news' };

/** The category for an outlet name seen in Google News. Case does not matter. */
export function categoryForOutlet(outlet: string): OutletCategory {
  const wanted = normalize(outlet);
  // Exact name first, then "the known name is inside the given name".
  const exact = KNOWN_OUTLETS.find((known) => normalize(known.name) === wanted);
  if (exact) return exact.category;
  const partial = KNOWN_OUTLETS.find((known) => hasWords(wanted, normalize(known.name)));
  return partial?.category ?? DEFAULT_CATEGORY;
}

/**
 * The outlet and category to store for one item. Normal feeds use the
 * feed's own; mixed feeds (Google News) use the outlet named in the item.
 * Returns null if the item has no usable outlet (it is then skipped).
 */
export function outletFor(
  feed: NewsFeed,
  itemOutlet: string | null,
): { outlet: string; category: OutletCategory } | null {
  if (!feed.mixed) return { outlet: feed.outlet, category: feed.category };
  if (!itemOutlet || IGNORED_OUTLETS.includes(normalize(itemOutlet))) return null;
  return { outlet: itemOutlet, category: categoryForOutlet(itemOutlet) };
}

/**
 * A text that is equal for every spelling of one outlet, so "Inquirer.net",
 * "INQUIRER" and "Philippine Daily Inquirer" count as the same outlet.
 */
export function outletKey(outlet: string): string {
  const name = normalize(outlet);
  const known = KNOWN_OUTLETS.map((entry) => normalize(entry.name)).find((knownName) => hasWords(name, knownName));
  const key = known ?? name;
  return OUTLET_ALIASES[key] ?? key;
}
