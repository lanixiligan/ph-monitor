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
 * the whole country still fits on a wide screen. North and south it leaves
 * room around the Philippine Area of Responsibility (5–25°N, see parArea.ts),
 * so the Typhoon view can show all of it, with storms just north of it.
 */
export const MAX_BOUNDS: Box = [
  [96, -1],
  [148, 28],
];

/** Which parts of the map are switched on (the tick boxes in the legend). */
export type MapLayers = {
  scores: boolean;
  events: boolean;
  storms: boolean;
  news: boolean;
  /** The fixed Project NOAH hazard maps. */
  landslide: boolean;
  stormSurge: boolean;
  /** Earthquake markers (USGS), sized by magnitude. */
  quakes: boolean;
  /** The rain forecast field (ECMWF), Typhoon view only. */
  rainForecast: boolean;
};

/** What the page opens with: everything on except the two hazard maps and the quake markers (the Earthquake view ticks them). */
export const DEFAULT_LAYERS: MapLayers = {
  scores: true,
  events: true,
  storms: true,
  news: true,
  landslide: false,
  stormSurge: false,
  quakes: false,
  // Typhoon view only (Legend.tsx offers it nowhere else): it is a warm scale.
  rainForecast: false,
};

/**
 * Each hazard map shows from this zoom level up (the server sends no tiles below
 * it). Storm surge shows even for the whole country; landslide is much bigger,
 * so it waits until zoom 9.
 */
export const HAZARD_MIN_ZOOM = { stormSurge: 4, landslide: 9 };
