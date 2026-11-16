// Small helpers for showing times, numbers and links. Shared by all panels.
// Words and date style follow the language chosen now (see i18n/).

import { getI18n, localeFor, lookup } from './i18n/index.ts';

/** "2026-11-15T03:00:00Z" becomes "Nov 15, 2026, 11:00 AM" in the reader's time zone. */
export function formatTime(iso: string | null): string {
  // `string | null` means "text, or nothing".
  const { t, lang } = getI18n();
  if (iso === null) return t.format.never;
  return new Date(iso).toLocaleString(localeFor(lang), { dateStyle: 'medium', timeStyle: 'short' });
}

/** A number with its unit, or a dash when the value is missing. */
export function formatValue(value: number | null, unit: string): string {
  return value === null ? '–' : `${value} ${unit}`;
}

/** "2026-11-17" becomes "Tue 17". Read as a plain calendar day, so no time zone shift. */
export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(localeFor(getI18n().lang), {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Distance in whole kilometres. */
export function formatKm(km: number): string {
  return km < 1 ? getI18n().t.format.lessThanOneKm : `${Math.round(km)} km`;
}

/** Returns the link only if it starts with http:// or https://, otherwise null. */
export function safeUrl(url: string | null): string | null {
  if (url === null) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** The six outlet group ids, in the order shown. A label, not a ranking of trust. */
export const CATEGORY_IDS: string[] = ['official', 'tv', 'radio', 'online', 'regional', 'international'];

/** The readable name of a category id, in the current language; falls back to the id itself. */
export function categoryLabel(id: string): string {
  return lookup(getI18n().t.categories, id);
}

/** An official bulletin link's label, by id; falls back to the server's label. */
export function bulletinLabel(id: string, serverLabel: string): string {
  return lookup(getI18n().t.bulletins, id, serverLabel);
}

/** 'orange' becomes 'Orange'. */
export function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}
