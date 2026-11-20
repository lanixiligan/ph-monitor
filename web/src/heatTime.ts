// Rules for the Heat view's time bar: which time stays chosen, what a day
// button picks, and the words on the buttons. Pure functions: no clock reads.

import { barTimes, defaultBarTime, phDate } from '@ph-monitor/shared';
import { fill } from './i18n/index.ts';
// `import type` brings in a type only; it vanishes when the code runs.
import type { Strings } from './i18n/index.ts';

/** Keep the chosen time while it is still on the bar; else the default time (ISO). */
export function keepOrDefault(chosen: string | null, now: Date): string {
  // `string | null` means the value is a string or null (nothing chosen yet).
  if (chosen !== null && barTimes(now).some((time) => time.toISOString() === chosen)) return chosen;
  return defaultBarTime(now).toISOString();
}

/**
 * The time a day button picks: the same hour on `day` ('YYYY-MM-DD'). If the
 * source lists its hours (`hours`) and lacks that one, the first hour it has on
 * that day; if it has nothing that day, the same hour anyway.
 */
export function pickDay(day: string, chosen: string, hours: string[] | null): string {
  // The time of day part, e.g. '04:00:00.000Z'.
  const same = `${day}T${chosen.slice(11)}`;
  if (hours === null || hours.includes(same)) return same;
  return hours.find((hour) => hour.startsWith(day)) ?? same;
}

/** '8AM', '12PM', '5PM' for an hour of day 0 to 23. */
export function hourLabel(hour: number, t: Strings): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return fill(hour < 12 ? t.heat.hourAm : t.heat.hourPm, { hour: twelve });
}

/** 'Sat 11/21' for a PH date 'YYYY-MM-DD'. The weekday is read as a UTC date, never the browser's zone. */
export function dayLabel(day: string, t: Strings): string {
  const weekday = t.heat.weekdays[new Date(`${day}T00:00:00Z`).getUTCDay()] ?? '';
  return fill(t.heat.dayShort, { weekday, month: Number(day.slice(5, 7)), day: Number(day.slice(8, 10)) });
}

/** 'Sat 11/21 12PM' for a shown time (ISO); the "no value" words when there is none. */
export function timeText(validAt: string | null, t: Strings): string {
  if (validAt === null) return t.heat.noHour;
  const at = new Date(validAt);
  // Philippine time is UTC+8, so the PH hour is the UTC hour plus 8.
  return `${dayLabel(phDate(at), t)} ${hourLabel((at.getUTCHours() + 8) % 24, t)}`;
}
