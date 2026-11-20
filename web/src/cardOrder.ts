// Small rules for what the status card shows where. Pure functions, so they
// can be tested without drawing anything.

import type { DisasterEvent, MapViewId } from '@ph-monitor/shared';

/** The rows of the status card's "By hazard" table. */
export type HazardRowId = 'quake' | 'rain' | 'heat' | 'event';

/** Today's order of the hazard rows (the order on Overall). */
export const HAZARD_ROWS: HazardRowId[] = ['quake', 'rain', 'heat', 'event'];

// Which hazard row each map view shows on the map. A view with no row here
// (Overall, Tsunami) keeps today's order.
// `Partial<Record<A, B>>` = an object that may have a B for some of the A keys.
const VIEW_ROW: Partial<Record<MapViewId, HazardRowId>> = {
  heat: 'heat',
  earthquake: 'quake',
};

/** The hazard row the pressed view shows on the map, or null when it has none. */
export function viewRow(view: MapViewId): HazardRowId | null {
  return VIEW_ROW[view] ?? null;
}

/** The card's detail sections that a view can bring up to just under the hazard table. */
export type DetailSectionId = 'quakes' | 'weather';

// Which detail section each map view moves up (and opens). The weather
// section holds the heat index, so it belongs to Heat.
const VIEW_SECTION: Partial<Record<MapViewId, DetailSectionId>> = {
  earthquake: 'quakes',
  heat: 'weather',
};

/** The detail section the pressed view moves to the top, or null (Overall: today's order). */
export function viewSection(view: MapViewId): DetailSectionId | null {
  return VIEW_SECTION[view] ?? null;
}

/** The hazard rows in order: the pressed view's own row first, the others in today's order. */
export function hazardRowOrder(view: MapViewId): HazardRowId[] {
  const first = viewRow(view);
  if (first === null) return HAZARD_ROWS;
  return [first, ...HAZARD_ROWS.filter((row) => row !== first)];
}

/**
 * Does this event belong in the block above the score? Yes while it is still
 * going, and yes for an orange or red one even after it has ended. A finished
 * green event (or one with no alert level) is listed lower down, in the details.
 */
export function isTopEvent(event: DisasterEvent): boolean {
  const stillGoing = event.endedAt === null;
  const serious = event.alertLevel === 'orange' || event.alertLevel === 'red';
  return stillGoing || serious;
}

/** Lower case with single spaces, so "Advisory  (Final) " equals "advisory (final)". */
function plain(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * The title lines of an official alert. PAGASA sends a headline and an event
 * name, and often one only repeats the other with something added (a level,
 * a storm's name). Then only the fuller line is shown; otherwise both are.
 */
export function alertTitleLines(headline: string, event: string): string[] {
  const a = plain(headline);
  const b = plain(event);
  if (a.startsWith(b)) return [headline];
  if (b.startsWith(a)) return [event];
  return [headline, event];
}
