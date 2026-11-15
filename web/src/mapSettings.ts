// Settings for how the map looks and how far it can move.

/**
 * false = show ONLY the Philippines: province shapes on a plain background.
 * true  = draw the provinces on top of a world basemap (seas, neighbouring
 *         countries, city names) from OpenFreeMap.
 */
export const SHOW_BASEMAP = false;

// A box is written as [[west, south], [east, north]] in degrees.
type Box = [[number, number], [number, number]];

/** The box the map opens on: the Philippines, edge to edge. */
export const PH_BOUNDS: Box = [
  [116.5, 4.5],
  [127, 21.2],
];

/**
 * How far the reader can pan and zoom out. It is wider than it is tall so
 * the whole country still fits on a wide screen.
 */
export const MAX_BOUNDS: Box = [
  [96, 1],
  [148, 25],
];
