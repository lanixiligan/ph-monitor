// Turns the quakes from GET /api/quakes into GeoJSON for the quake markers.
// Pure functions: data in, data out, nothing about the map itself.

// `import type` brings in types only; they vanish when the code runs.
import type { Feature, FeatureCollection } from 'geojson';
import type { QuakePoint } from '@ph-monitor/shared';

// `FeatureCollection<A, B>` = GeoJSON whose shapes are of type A and whose properties are B.
// `Record<string, unknown>` is just "an object with text keys and any values".
type Collection = FeatureCollection<Feature['geometry'], Record<string, unknown>>;

/**
 * The marker's radius in pixels: bigger for a stronger quake. Magnitude is a
 * log scale (each step is about 32 times the energy), so the radius grows by a
 * fixed amount per step instead: M4 is 5 px, M7 is 17 px, never over 22.
 */
export function quakeRadius(magnitude: number): number {
  return Math.min(22, Math.max(4, 5 + (magnitude - 4) * 4));
}

/** One dot per quake, strongest drawn last (on top). GeoJSON wants longitude first. */
export function quakesToGeoJson(quakes: QuakePoint[]): Collection {
  // `[...quakes]` copies the list, so sorting does not change the caller's list.
  const order = [...quakes].sort((a, b) => a.magnitude - b.magnitude);
  return {
    type: 'FeatureCollection',
    features: order.map((quake) => ({
      type: 'Feature',
      // A full copy of the quake rides along so the popup can read it back.
      properties: { radius: quakeRadius(quake.magnitude), json: JSON.stringify(quake) },
      geometry: { type: 'Point', coordinates: [quake.lon, quake.lat] },
    })),
  };
}
