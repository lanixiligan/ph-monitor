// Small helpers for showing times, numbers and links. Shared by all panels.

/** "2026-11-15T03:00:00Z" becomes "Nov 15, 2026, 11:00 AM" in the reader's time zone. */
export function formatTime(iso: string | null): string {
  // `string | null` means "text, or nothing".
  if (iso === null) return 'never';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A number with its unit, or a dash when the value is missing. */
export function formatValue(value: number | null, unit: string): string {
  return value === null ? '–' : `${value} ${unit}`;
}

/** "2026-11-17" becomes "Tue 17". Read as a plain calendar day, so no time zone shift. */
export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Distance in whole kilometres. */
export function formatKm(km: number): string {
  return km < 1 ? 'less than 1 km' : `${Math.round(km)} km`;
}

/** Returns the link only if it starts with http:// or https://, otherwise null. */
export function safeUrl(url: string | null): string | null {
  if (url === null) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** The six outlet groups, in the order shown. A label, not a ranking of trust. */
export const CATEGORY_LABELS: { id: string; label: string }[] = [
  { id: 'official', label: 'Official' },
  { id: 'tv', label: 'TV' },
  { id: 'radio', label: 'Radio' },
  { id: 'online', label: 'Online and newspapers' },
  { id: 'regional', label: 'Regional' },
  { id: 'international', label: 'International' },
];

/** The readable name of a category id; falls back to the id itself. */
export function categoryLabel(id: string): string {
  return CATEGORY_LABELS.find((category) => category.id === id)?.label ?? id;
}
