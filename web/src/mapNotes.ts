// The short note shown on the map while a view has nothing (or not all) to
// show, so an empty map is never mistaken for calm. A pure function, so it
// can be tested without drawing anything. Which words each note uses lives
// in MapNote.tsx.

// `import type` brings in types only; they vanish when the code runs.
import type { FeedHealth, MapViewId, Storm } from '@ph-monitor/shared';

/**
 * The note's id. `warn` notes are drawn with the WarnIcon (data missing or
 * old); the others are plain words. `'a' | 'b'` = exactly one of these texts.
 */
export type MapNoteId =
  | 'stormsLoading'
  | 'stormsFailed'
  | 'stormsStale'
  | 'stormsUnchecked'
  | 'stormsNone'
  | 'stormsHidden'
  | 'surgeHidden'
  | 'surgeZoomIn';

// `Storm[] | null` = a list of storms, or null.
export type MapNoteInput = {
  view: MapViewId;
  /** The storms from GET /api/storms; null = not loaded yet. */
  storms: Storm[] | null;
  /** true when the last storm list request failed. */
  stormsFailed: boolean;
  /** Every feed's health (GET /api/status); null = not loaded yet, 'failed' = the check failed. */
  feeds: FeedHealth[] | 'failed' | null;
  /** The tick boxes for the storm tracks and the storm surge zones. */
  stormsTicked: boolean;
  surgeTicked: boolean;
  /** The map's zoom now, and the zoom the storm surge zones start at. */
  zoom: number;
  surgeMinZoom: number;
};

/** The note for the view now, or null when the map shows what it should. */
export function mapNote(input: MapNoteInput): MapNoteId | null {
  if (input.view === 'typhoon') return typhoonNote(input);
  if (input.view === 'stormSurge') {
    if (!input.surgeTicked) return 'surgeHidden';
    if (input.zoom < input.surgeMinZoom) return 'surgeZoomIn';
  }
  return null;
}

/** Typhoon: tracks only. A down or old feed is said first: "no storm" must never hide it. */
function typhoonNote(input: MapNoteInput): MapNoteId | null {
  const { storms, feeds } = input;
  if (input.stormsFailed) return 'stormsFailed';
  // `find` gives undefined when the feed is not in the list (never fetched).
  const feed = Array.isArray(feeds) ? feeds.find((entry) => entry.id === 'storms') : undefined;
  if (Array.isArray(feeds) && (feed === undefined || feed.isStale)) return 'stormsStale';
  if (storms === null || feeds === null) return 'stormsLoading';
  if (!input.stormsTicked) return 'stormsHidden';
  // We could not check the feed: say so (a storm may be missing), whether or
  // not some are drawn, so the map agrees with the status card.
  if (feeds === 'failed') return 'stormsUnchecked';
  if (storms.length > 0) return null;
  return 'stormsNone';
}

/** true for the notes that mean data is missing or old (drawn with the WarnIcon). */
export function isWarnNote(id: MapNoteId): boolean {
  return id === 'stormsFailed' || id === 'stormsStale' || id === 'stormsUnchecked';
}

/**
 * Can the status card trust "no storm near here"? Not when the storm list
 * failed, the feed is old, or its health could not be checked.
 */
export function stormsUnsure(stormsFailed: boolean, feeds: FeedHealth[] | 'failed' | null): boolean {
  if (stormsFailed || feeds === 'failed') return true;
  if (feeds === null) return false;
  const feed = feeds.find((entry) => entry.id === 'storms');
  return feed === undefined || feed.isStale;
}
