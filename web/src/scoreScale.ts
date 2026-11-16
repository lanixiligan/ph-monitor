// The score scale: how a 0–100 score is named and coloured on the map, the
// legend and the status card. This is the app's only colour scheme.
//
// One hue, light to dark, so "darker = more stress" also works for
// colour-blind readers. This is presentation only: how the score is
// CALCULATED lives in server/src/scoring/scoring.ts.

import { getI18n } from './i18n/index.ts';

// `id` names the band; its words come from the language files (i18n/).
export type ScoreBand = {
  id: 'calm' | 'low' | 'moderate' | 'high' | 'severe';
  from: number;
  to: number;
  color: string;
};

export const SCORE_BANDS: ScoreBand[] = [
  { id: 'calm', from: 0, to: 19, color: '#feedde' },
  { id: 'low', from: 20, to: 39, color: '#fdbe85' },
  { id: 'moderate', from: 40, to: 59, color: '#fd8d3c' },
  { id: 'high', from: 60, to: 79, color: '#e6550d' },
  { id: 'severe', from: 80, to: 100, color: '#a63603' },
];

/** Used for a province that has no score yet. */
export const NO_DATA_COLOR = '#d4d4d4';

/** The band's name in the current language. */
export function bandLabel(band: ScoreBand): string {
  return getI18n().t.bands[band.id];
}

/** The band a score falls in. */
export function bandFor(score: number): ScoreBand {
  let match = SCORE_BANDS[0]!;
  for (const band of SCORE_BANDS) {
    if (score >= band.from) match = band;
  }
  return match;
}
