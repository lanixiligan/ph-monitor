// The score scale: how a 0–100 score is named and coloured on the map, the
// legend and the status card. This is the app's only colour scheme.
//
// One hue, light to dark, so "darker = more stress" also works for
// colour-blind readers. This is presentation only: how the score is
// CALCULATED lives in server/src/scoring/scoring.ts.

export type ScoreBand = { from: number; to: number; label: string; color: string };

export const SCORE_BANDS: ScoreBand[] = [
  { from: 0, to: 19, label: 'Calm', color: '#feedde' },
  { from: 20, to: 39, label: 'Low', color: '#fdbe85' },
  { from: 40, to: 59, label: 'Moderate', color: '#fd8d3c' },
  { from: 60, to: 79, label: 'High', color: '#e6550d' },
  { from: 80, to: 100, label: 'Severe', color: '#a63603' },
];

/** Used for a province that has no score yet. */
export const NO_DATA_COLOR = '#d4d4d4';

/** The band a score falls in. */
export function bandFor(score: number): ScoreBand {
  let match = SCORE_BANDS[0]!;
  for (const band of SCORE_BANDS) {
    if (score >= band.from) match = band;
  }
  return match;
}
