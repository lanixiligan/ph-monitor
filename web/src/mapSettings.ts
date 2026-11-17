// Settings for how the map looks and how far it can move.

/**
 * true  = draw the provinces on top of a grey basemap from OpenFreeMap:
 *         roads, towns and place names.
 *         Neighbouring countries are visible at the edges.
 * false = show ONLY the Philippines: province shapes on a plain background,
 *         with no roads or names.
 */
export const SHOW_BASEMAP = true;

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

/** Which parts of the map are switched on (the tick boxes in the legend). */
export type MapLayers = { scores: boolean; events: boolean; storms: boolean; news: boolean };

export const ALL_LAYERS_ON: MapLayers = { scores: true, events: true, storms: true, news: true };
