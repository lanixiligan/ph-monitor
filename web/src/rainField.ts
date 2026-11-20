// Draws one frame of the rain forecast field as pixels, for the map's image
// layer (rainOverlay.ts). Pure: it fills a list of red-green-blue-alpha
// values, so it can be tested without a browser.
//
// The grid points are about 165 km apart; between them the value follows a
// smooth curve through the nearest points (valueAt), then is coloured by its
// band, so the field looks smooth but never invents rain where no point has it. A spot next
// to a point with no forecast is drawn in the "no data" colour, never as dry.
//
// The map stretches the image in Web Mercator (the map's own projection), so
// each pixel row is turned back into a latitude before it is looked up.

// `import type` brings in types only; they vanish when the code runs.
import type { RainGrid } from '@ph-monitor/shared';
import { rainBand } from './rainColors.ts';
import type { Rgb } from './rainColors.ts';

/** The image's four corners for MapLibre: top-left, top-right, bottom-right, bottom-left ([lon, lat]). */
export function imageCorners(grid: RainGrid): [[number, number], [number, number], [number, number], [number, number]] {
  const east = grid.west + grid.step * (grid.cols - 1);
  const north = grid.south + grid.step * (grid.rows - 1);
  return [
    [grid.west, north],
    [east, north],
    [east, grid.south],
    [grid.west, grid.south],
  ];
}

const DEG = Math.PI / 180;

/** Latitude (degrees) → Web Mercator y (no units). */
export function mercatorY(lat: number): number {
  return Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2));
}

/** Web Mercator y → latitude (degrees). */
export function latitudeOf(y: number): number {
  return Math.atan(Math.sinh(y)) / DEG;
}

export type FieldColors = {
  /** One colour per band (RAIN_BANDS), lightest rain first. */
  bands: Rgb[];
  /** For spots next to a point with no forecast. */
  noData: Rgb;
};

/** How opaque the "no data" look is (0–255): visible, but quieter than rain. */
const NO_DATA_ALPHA = 150;

/** A smooth curve through four evenly spaced values (Catmull-Rom), at `t` (0–1) between the middle two. */
function curve(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t);
}

/**
 * The value at a fractional grid position (row from the south, column from
 * the west). A smooth curve through the 4 × 4 nearest points, kept between the
 * lowest and highest of the 4 nearest, so it rounds off the shapes without
 * ever making more (or less) rain than they have. null when any of the 4
 * nearest has no forecast; next to a missing outer point it blends straight.
 */
export function valueAt(mm: (number | null)[], grid: RainGrid, row: number, col: number): number | null {
  const r0 = Math.max(0, Math.min(grid.rows - 1, Math.floor(row)));
  const c0 = Math.max(0, Math.min(grid.cols - 1, Math.floor(col)));
  const fr = Math.max(0, Math.min(1, row - r0));
  const fc = Math.max(0, Math.min(1, col - c0));
  // A point's value; rows and columns past the edge repeat the edge.
  const at = (r: number, c: number) => {
    const rr = Math.max(0, Math.min(grid.rows - 1, r));
    const cc = Math.max(0, Math.min(grid.cols - 1, c));
    return mm[rr * grid.cols + cc] ?? null;
  };
  const near = [at(r0, c0), at(r0, c0 + 1), at(r0 + 1, c0), at(r0 + 1, c0 + 1)];
  // `.some(...)` = true when at least one of them is missing.
  if (near.some((value) => value === null)) return null;
  // `as number[]`: none of them is null any more (checked just above).
  const [a, b, c, d] = near as number[];
  const low = Math.min(a ?? 0, b ?? 0, c ?? 0, d ?? 0);
  const high = Math.max(a ?? 0, b ?? 0, c ?? 0, d ?? 0);

  // The four rows of four, south to north; null when an outer point is missing.
  const rows: number[][] = [];
  for (let r = r0 - 1; r <= r0 + 2; r += 1) {
    const values = [at(r, c0 - 1), at(r, c0), at(r, c0 + 1), at(r, c0 + 2)];
    if (values.some((value) => value === null)) {
      // An outer point is missing: blend the 4 nearest in straight lines instead.
      const south = (a ?? 0) + ((b ?? 0) - (a ?? 0)) * fc;
      const north = (c ?? 0) + ((d ?? 0) - (c ?? 0)) * fc;
      return south + (north - south) * fr;
    }
    rows.push(values as number[]);
  }
  const across = rows.map((v) => curve(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0, fc));
  const value = curve(across[0] ?? 0, across[1] ?? 0, across[2] ?? 0, across[3] ?? 0, fr);
  return Math.max(low, Math.min(high, value));
}

/**
 * The pixels for one frame: `width` × `height`, 4 values each (red, green,
 * blue, alpha), top row first. Rain below the first band is see-through.
 */
export function renderField(
  mm: (number | null)[],
  grid: RainGrid,
  width: number,
  height: number,
  colors: FieldColors,
  // `<ArrayBuffer>` says the numbers sit in plain memory, which a canvas's ImageData needs.
): Uint8ClampedArray<ArrayBuffer> {
  // A `Uint8ClampedArray` is a list of 0–255 numbers: the format a canvas uses.
  const pixels = new Uint8ClampedArray(width * height * 4);
  const north = grid.south + grid.step * (grid.rows - 1);
  const yTop = mercatorY(north);
  const yBottom = mercatorY(grid.south);
  for (let py = 0; py < height; py += 1) {
    const lat = latitudeOf(yTop + ((py + 0.5) / height) * (yBottom - yTop));
    const row = (lat - grid.south) / grid.step;
    for (let px = 0; px < width; px += 1) {
      const col = ((px + 0.5) / width) * (grid.cols - 1);
      const value = valueAt(mm, grid, row, col);
      const at = (py * width + px) * 4;
      if (value === null) {
        pixels.set([...colors.noData, NO_DATA_ALPHA], at);
        continue;
      }
      const band = rainBand(value);
      const color = colors.bands[band];
      // Dry (below the first band): left see-through (alpha 0).
      if (band < 0 || color === undefined) continue;
      pixels.set([...color, 255], at);
    }
  }
  return pixels;
}
