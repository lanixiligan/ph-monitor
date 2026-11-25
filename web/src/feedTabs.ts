// The right column's three tabs: live news, radio and disaster headlines.
// One shows at a time; the others stay loaded, so a sound keeps playing.

/** The tabs, in the order they sit in the row. */
export const FEED_TABS = ['streams', 'radio', 'news'] as const;

/** One tab's id. `(typeof FEED_TABS)[number]` = any one value of the list above. */
export type FeedTab = (typeof FEED_TABS)[number];

/** What is playing: a live news video (a stream slot's id) or a radio station (its id). */
export type Playing = { kind: 'video' | 'radio'; id: string };

/** The tab a key moves to: arrows go one step (wrapping round), Home and End to the ends. null = no move. */
export function nextTab(current: FeedTab, key: string): FeedTab | null {
  const at = FEED_TABS.indexOf(current);
  const last = FEED_TABS.length - 1;
  let to: number;
  if (key === 'ArrowRight') to = at === last ? 0 : at + 1;
  else if (key === 'ArrowLeft') to = at === 0 ? last : at - 1;
  else if (key === 'Home') to = 0;
  else if (key === 'End') to = last;
  else return null;
  // `?? null`: TypeScript can't tell `to` is inside the list, so it allows "not found".
  return FEED_TABS[to] ?? null;
}

/** The tab that holds the sound playing now, or null when nothing plays. */
export function playingTab(playing: Playing | null): FeedTab | null {
  if (playing === null) return null;
  return playing.kind === 'video' ? 'streams' : 'radio';
}
