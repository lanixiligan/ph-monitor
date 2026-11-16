// The score scale: how a 0–100 score is named and coloured on the map, the
// legend and the status card. These are the only warm colours on the page;
// everything else is the cool sea-and-ink palette in styles.css.
//
// One hue (orange), so the order also works for colour-blind readers:
//   light theme: pale to dark, darker = more stress;
//   dark theme:  dark to bright, brighter = more stress.
// This is presentation only: how the score is CALCULATED lives in
// server/src/scoring/scoring.ts.

import { getI18n } from './i18n/index.ts';
import type { Theme } from './theme/index.ts';

type BandId = 'calm' | 'low' | 'moderate' | 'high' | 'severe';

// `id` names the band; its words come from the language files (i18n/).
export type ScoreBand = { id: BandId; from: number; to: number };

export type BandColors = {
  color: string;
  /** Text colour that stays readable on top of `color`. */
  ink: string;
};

export const SCORE_BANDS: ScoreBand[] = [
  { id: 'calm', from: 0, to: 19 },
  { id: 'low', from: 20, to: 39 },
  { id: 'moderate', from: 40, to: 59 },
  { id: 'high', from: 60, to: 79 },
  { id: 'severe', from: 80, to: 100 },
];

// `Record<A, B>` is an object with a B for every A: here, colours for every
// band in each theme (a missing one fails the typecheck).
const COLORS: Record<Theme, Record<BandId, BandColors>> = {
  light: {
    calm: { color: '#feedde', ink: '#10313b' },
    low: { color: '#fdbe85', ink: '#10313b' },
    moderate: { color: '#fd8d3c', ink: '#10313b' },
    high: { color: '#e6550d', ink: '#1a0e06' },
    severe: { color: '#a63603', ink: '#ffffff' },
  },
  // On a dark map the calm provinces (most of them, most days) must stay dim,
  // so the scale runs the other way: the brightest orange is the worst.
  dark: {
    calm: { color: '#3d2a1e', ink: '#f5e9df' },
    low: { color: '#71401d', ink: '#f5e9df' },
    moderate: { color: '#a9541b', ink: '#ffffff' },
    high: { color: '#e2671c', ink: '#1a0e06' },
    severe: { color: '#ff9a4a', ink: '#1a0e06' },
  },
};

/** The band's colours in the given theme. */
export function bandColors(band: ScoreBand, theme: Theme): BandColors {
  return COLORS[theme][band.id];
}

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
