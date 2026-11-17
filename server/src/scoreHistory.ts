// "Does this score need a new history row?" The history keeps a row only
// when something changed, so it grows with what happens, not with the clock.
// To read it: a province's score at some time is its newest row at or before
// that time.

const HOUR_MS = 60 * 60 * 1000;

/** An unchanged score is still saved this often, so a longer gap means "the job was not running". */
export const HISTORY_HEARTBEAT_HOURS = 24;

export type HistoryEntry = {
  score: number;
  /** The part-scores are null only in rows saved before they were recorded. */
  // `number | null` means "a number, or nothing".
  quakeScore: number | null;
  weatherScore: number | null;
  eventScore: number | null;
  /** Signals that could not be checked ('quake', 'weather', 'event'). */
  unknownSignals: string[] | null;
  computedAt: Date;
};

/** True when `next` differs from the province's last saved row, or that row is a day old. */
export function needsHistoryRow(last: HistoryEntry | null, next: HistoryEntry): boolean {
  if (last === null) return true;
  if (last.unknownSignals === null || next.unknownSignals === null) return true;
  // Sorted copies, so ['quake', 'event'] equals ['event', 'quake'].
  const sameUnknown = [...last.unknownSignals].sort().join() === [...next.unknownSignals].sort().join();
  const same =
    last.score === next.score &&
    last.quakeScore === next.quakeScore &&
    last.weatherScore === next.weatherScore &&
    last.eventScore === next.eventScore &&
    sameUnknown;
  if (!same) return true;
  return next.computedAt.getTime() - last.computedAt.getTime() >= HISTORY_HEARTBEAT_HOURS * HOUR_MS;
}
