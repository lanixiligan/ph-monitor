// The Heat view's time bar: six days, ten hours a day, in Philippine time.
// Philippine time is UTC+8 all year (no daylight saving), so plain
// date maths with a fixed offset is enough. Pure functions: no clock reads.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Philippine time is this many hours ahead of UTC. */
export const PH_OFFSET_HOURS = 8;

/** The hours the bar offers each day, PH time: 8 AM to 5 PM. */
export const BAR_HOURS: number[] = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];

/** How many days the bar covers: today (PH time) plus 5. */
export const BAR_DAYS = 6;

/** The date in Philippine time, as 'YYYY-MM-DD'. */
export function phDate(at: Date): string {
  // Shift the clock 8 h forward, then read the UTC date off it.
  return new Date(at.getTime() + PH_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 10);
}

/** The hour of day in Philippine time, 0 to 23. */
export function phHour(at: Date): number {
  return new Date(at.getTime() + PH_OFFSET_HOURS * HOUR_MS).getUTCHours();
}

/** The bar's days: today in PH time and the next five, as 'YYYY-MM-DD'. */
export function barDays(now: Date): string[] {
  // Midnight UTC of the PH date; adding whole days from it never crosses a date by mistake.
  const start = new Date(`${phDate(now)}T00:00:00Z`).getTime();
  const days: string[] = [];
  for (let i = 0; i < BAR_DAYS; i++) days.push(new Date(start + i * DAY_MS).toISOString().slice(0, 10));
  return days;
}

/** The instant of `hour` o'clock PH time on `day` ('YYYY-MM-DD'). PH 8 AM is 00:00 UTC. */
export function barTime(day: string, hour: number): Date {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + (hour - PH_OFFSET_HOURS) * HOUR_MS);
}

/** Every instant on the bar (6 days x 10 hours = 60), in day then hour order. */
export function barTimes(now: Date): Date[] {
  // `flatMap` makes one list of times per day and joins them into one.
  return barDays(now).flatMap((day) => BAR_HOURS.map((hour) => barTime(day, hour)));
}

/** True when `at` is exactly one of the bar's instants (today's past hours count). */
export function isBarTime(at: Date, now: Date): boolean {
  return barTimes(now).some((time) => time.getTime() === at.getTime());
}

/** The hour to show first: this hour in the day, else today's 8 AM before it, tomorrow's 8 AM after it. */
export function defaultBarTime(now: Date): Date {
  const [today, tomorrow] = barDays(now);
  const hour = phHour(now);
  if (hour < BAR_HOURS[0]!) return barTime(today!, BAR_HOURS[0]!);
  if (hour > BAR_HOURS[BAR_HOURS.length - 1]!) return barTime(tomorrow!, BAR_HOURS[0]!);
  // The start of the current hour (PH hours line up with UTC hours).
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS);
}
