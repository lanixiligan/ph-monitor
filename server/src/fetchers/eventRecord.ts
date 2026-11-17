// The common shape of one disaster event, whichever feed it came from.

// `import type` tells TypeScript these names are only types (they vanish when the code runs).
import type { AlertLevel, DisasterKind } from '@ph-monitor/shared';

/** The shape on the map, in GeoJSON (longitude first, then latitude). */
export type EventGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'Polygon'; coordinates: number[][][] };

/** One event, checked and ready to save. */
export type EventRecord = {
  /** Source plus its own id, e.g. "gdacs:EQ:1577487" or "eonet:EONET_25339". */
  id: string;
  source: 'gdacs' | 'eonet';
  kind: DisasterKind;
  alertLevel: AlertLevel | null;
  title: string;
  startedAt: Date;
  /** null while the event is still going. */
  endedAt: Date | null;
  url: string | null;
  geometry: EventGeometry;
  /** The original record, kept so nothing from the feed is lost. */
  raw: unknown;
};

/** Turns GDACS's "Green" / "Orange" / "Red" into our lower-case level. */
export function toAlertLevel(text: string | undefined): AlertLevel | null {
  const level = text?.trim().toLowerCase();
  if (level === 'green' || level === 'orange' || level === 'red') return level;
  return null;
}

/** Turns GDACS's two-letter event type into our kind. */
export function gdacsKind(eventType: string): DisasterKind {
  // `Record<string, DisasterKind>` is a lookup table: text in, kind out.
  const kinds: Record<string, DisasterKind> = {
    TC: 'typhoon',
    EQ: 'earthquake',
    FL: 'flood',
    VO: 'volcano',
    WF: 'wildfire',
    DR: 'drought',
  };
  return kinds[eventType.toUpperCase()] ?? 'other';
}

/**
 * The open events (no end date) that the feed no longer lists. They are
 * over as far as we can tell, so the job closes them.
 */
export function droppedEventIds(openIds: string[], fetchedIds: string[]): string[] {
  // A Set answers "is this id in the list?" quickly.
  const fetched = new Set(fetchedIds);
  return openIds.filter((id) => !fetched.has(id));
}
