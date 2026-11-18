// USGS's own impact estimates for one earthquake, read from the saved USGS
// record (`earthquakes.raw`, its `properties` part) when a card is asked for.
// For display only: the score never uses them (see scoring/scoring.ts).
//
// Each field is checked on its own, so one strange value never hides the
// others. A strange value is dropped (null or false), never shown.

import { z } from 'zod';
import type { PagerAlert } from '@ph-monitor/shared';

export type QuakeImpact = {
  pagerAlert: PagerAlert | null;
  mmi: number | null;
  tsunamiInfo: boolean;
};

// The record must be an object; each field is checked separately below.
// `z.unknown().optional()` accepts any value, or no field at all.
const propsSchema = z.object({
  alert: z.unknown().optional(),
  mmi: z.unknown().optional(),
  tsunami: z.unknown().optional(),
});

const alertSchema = z.enum(['green', 'yellow', 'orange', 'red']);
// Modified Mercalli runs 1 to 10 in practice (12 on the old scale). zod's
// number already refuses NaN and Infinity.
const mmiSchema = z.number().min(0).max(12);
// USGS writes 1 when it shows a tsunami information link, 0 when not.
const tsunamiSchema = z.union([z.literal(0), z.literal(1)]);

/** Logs a value that is there but failed its check. Missing or null stays quiet. */
function warnIfStrange(field: string, value: unknown, ok: boolean): void {
  if (!ok && value !== undefined && value !== null) {
    console.warn(`USGS impact: dropped a strange ${field} value:`, JSON.stringify(value));
  }
}

/** Reads the PAGER alert, shaking intensity and tsunami link from `raw.properties`. */
export function readQuakeImpact(props: unknown): QuakeImpact {
  const parsed = propsSchema.safeParse(props);
  if (!parsed.success) return { pagerAlert: null, mmi: null, tsunamiInfo: false };
  const { alert, mmi, tsunami } = parsed.data;

  const alertCheck = alertSchema.safeParse(alert);
  const mmiCheck = mmiSchema.safeParse(mmi);
  const tsunamiCheck = tsunamiSchema.safeParse(tsunami);
  warnIfStrange('alert', alert, alertCheck.success);
  warnIfStrange('mmi', mmi, mmiCheck.success);
  warnIfStrange('tsunami', tsunami, tsunamiCheck.success);

  return {
    // `a ? b : c` means "if a then b, otherwise c".
    pagerAlert: alertCheck.success ? alertCheck.data : null,
    mmi: mmiCheck.success ? mmiCheck.data : null,
    tsunamiInfo: tsunamiCheck.success && tsunamiCheck.data === 1,
  };
}
