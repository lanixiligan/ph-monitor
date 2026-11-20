// Small helpers for showing times, numbers and links. Shared by all panels.
// Words and date style follow the language chosen now (see i18n/).

import { NEWS_TYPES } from '@ph-monitor/shared';
import { fill, getI18n, localeFor, lookup } from './i18n/index.ts';
import type { Strings } from './i18n/index.ts';

/** "2026-11-15T03:00:00Z" becomes "Nov 15, 2026, 11:00 AM" in the reader's time zone. */
export function formatTime(iso: string | null): string {
  // `string | null` means "text, or nothing".
  const { t, lang } = getI18n();
  if (iso === null) return t.format.never;
  return new Date(iso).toLocaleString(localeFor(lang), { dateStyle: 'medium', timeStyle: 'short' });
}

/**
 * A forecast period in the reader's own time: "Sat, Nov 21, 3 PM – 6 PM" for the
 * `hours` that end at `endIso`. The browser's clock decides the time zone.
 */
export function formatPeriod(endIso: string, hours: number): string {
  const { lang } = getI18n();
  const end = new Date(endIso);
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  const day = start.toLocaleDateString(localeFor(lang), { weekday: 'short', month: 'short', day: 'numeric' });
  // Each end on its own ("11 PM – 2 AM"), so a period over midnight stays short.
  const hour = (date: Date) => date.toLocaleTimeString(localeFor(lang), { hour: 'numeric' });
  return `${day}, ${hour(start)} – ${hour(end)}`;
}

/** The weekday and date only, for the ends of the forecast slider: "Sat, Nov 21". */
export function formatForecastDay(iso: string): string {
  return new Date(iso).toLocaleDateString(localeFor(getI18n().lang), { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * "Uploaded 12 minutes ago": how long ago `iso` was, counted from `nowMs`.
 * `t` is the language's strings; it defaults to the current one.
 */
export function uploadedAgo(iso: string, nowMs: number, t: Strings = getI18n().t): string {
  const ago = timeAgo(iso, nowMs, t);
  return ago === '' ? '' : fill(t.format.uploaded, { ago });
}

/**
 * "12 minutes ago" on its own (the heat map says "Updated 12 minutes ago").
 * Under 5 seconds (or a time slightly in the future, when a clock is off) is
 * "just now". A time that is not a date gives ''.
 */
export function timeAgo(iso: string, nowMs: number, t: Strings = getI18n().t): string {
  const seconds = Math.floor((nowMs - Date.parse(iso)) / 1000);
  if (Number.isNaN(seconds)) return '';
  const a = t.format.ago;
  // Pick the biggest unit that fits, then "1 minute" or "2 minutes".
  return seconds < 5
    ? a.justNow
    : seconds < 60
      ? countText(seconds, a.second, a.seconds)
      : seconds < 3600
        ? countText(Math.floor(seconds / 60), a.minute, a.minutes)
        : seconds < 86400
          ? countText(Math.floor(seconds / 3600), a.hour, a.hours)
          : countText(Math.floor(seconds / 86400), a.day, a.days);
}

/** "{n} minute ago" for 1, "{n} minutes ago" for any other number. */
function countText(n: number, one: string, many: string): string {
  return fill(n === 1 ? one : many, { n });
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

/** The headline filters, in the order shown: all, the nine kinds of disaster, then general. */
export const NEWS_FILTER_IDS: string[] = ['all', ...NEWS_TYPES, 'general'];

/** The readable name of a headline filter or kind ('flood' becomes 'Floods'). */
export function newsTypeLabel(id: string): string {
  return lookup(getI18n().t.newsTypes, id);
}

/** A headline's kinds as one line: "Typhoons, Tsunamis and storm surges", or "General". */
export function newsTypesText(types: string[]): string {
  return types.length === 0 ? newsTypeLabel('general') : types.map(newsTypeLabel).join(', ');
}

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
