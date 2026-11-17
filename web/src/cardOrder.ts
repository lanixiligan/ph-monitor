// Small rules for what the status card shows where. Pure functions, so they
// can be tested without drawing anything.

import type { DisasterEvent } from '@ph-monitor/shared';

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
