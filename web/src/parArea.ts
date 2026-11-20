// The Philippine Area of Responsibility (PAR): the box of sea in which PAGASA
// tracks a tropical cyclone, gives it a local name and issues warnings. Drawn
// as a dashed outline in the Typhoon view. A fixed shape, not data from a feed.
//
// The corners, as PAGASA gives them: 25°N 120°E, 25°N 135°E, 5°N 135°E,
// 5°N 115°E, 15°N 115°E, 21°N 120°E, and back to the start.

// `import type` brings in types only; they vanish when the code runs.
import type { FeatureCollection, LineString } from 'geojson';

// `[number, number][]` = a list of [longitude, latitude] pairs (GeoJSON order).
export const PAR_CORNERS: [number, number][] = [
  [120, 25],
  [135, 25],
  [135, 5],
  [115, 5],
  [115, 15],
  [120, 21],
  [120, 25],
];

/** The box around the PAR, [west, south] and [east, north], for zooming the map to it. */
export const PAR_BOUNDS: [[number, number], [number, number]] = [
  [115, 5],
  [135, 25],
];

/** Where the "PAR" label sits: the middle of the top edge. */
export const PAR_LABEL_AT: [number, number] = [127.5, 25];

/** The outline as GeoJSON, for a MapLibre line layer. */
// `FeatureCollection<LineString>` = a GeoJSON collection whose shapes are all lines.
export function parGeoJson(): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: PAR_CORNERS } }],
  };
}
