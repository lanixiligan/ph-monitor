// The rain forecast field's bands: millimetres of rain in 3 hours, each band
// with its colour (--rain-1 … --rain-10 in styles.css, read through palette.ts).
// Below the first band nothing is drawn, so dry sea and land show the basemap.
// A display scale only: it never changes the score.

/** The lowest millimetres of each band, lightest rain first (10 bands, matching --rain-1 … --rain-10). */
export const RAIN_BANDS = [0.5, 1, 2, 5, 10, 15, 20, 30, 50, 80];

/** The band a total falls in (0 = the first), or -1 below the first band (nothing drawn). */
export function rainBand(mm: number): number {
  let band = -1;
  for (const [i, lowest] of RAIN_BANDS.entries()) {
    if (mm >= lowest) band = i;
  }
  return band;
}

/** The legend's words for one band: "0.5–1", …, "80+". */
export function rainBandLabel(band: number): string {
  const lowest = RAIN_BANDS[band];
  const next = RAIN_BANDS[band + 1];
  if (lowest === undefined) return '';
  return next === undefined ? `${lowest}+` : `${lowest}–${next}`;
}

// `[number, number, number]` = exactly three numbers: red, green and blue, 0–255.
export type Rgb = [number, number, number];

/** "#a9d7f2" (as written in styles.css) → [169, 215, 242]. Anything else → null. */
export function hexToRgb(color: string): Rgb | null {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color.trim());
  if (match === null) return null;
  return [parseInt(match[1] ?? '0', 16), parseInt(match[2] ?? '0', 16), parseInt(match[3] ?? '0', 16)];
}
