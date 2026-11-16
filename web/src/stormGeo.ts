// Turns storms and events into GeoJSON (the shape MapLibre draws from).
// Pure functions: data in, data out, nothing about the map itself.

import type { Feature, FeatureCollection } from 'geojson';
import type { DisasterEvent, Storm } from '@ph-monitor/shared';

/** The sample storm must never be mistaken for a real one. */
export const SAMPLE_NOTICE = 'Sample data, not a real storm';

// `Record<string, unknown>` is just "an object with text keys and any values".
type Props = Record<string, unknown>;
type Collection = FeatureCollection<Feature['geometry'], Props>;

export function emptyCollection(): Collection {
  return { type: 'FeatureCollection', features: [] };
}

/** One dot per event. GeoJSON wants longitude first, then latitude. */
export function eventsToGeoJson(events: DisasterEvent[]): Collection {
  return {
    type: 'FeatureCollection',
    features: events.map((event) => ({
      type: 'Feature',
      // A full copy of the event rides along so the popup can read it back.
      properties: { alert: event.alertLevel ?? 'none', json: JSON.stringify(event) },
      geometry: { type: 'Point', coordinates: [event.lon, event.lat] },
    })),
  };
}

/** A circle outline of `radiusKm` around a point, as a closed line of 48 steps. */
function circle(lat: number, lon: number, radiusKm: number): [number, number][] {
  const ring: [number, number][] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * 2 * Math.PI;
    // About 111.32 km per degree of latitude; longitude degrees shrink away from the equator.
    const dLat = (radiusKm * Math.sin(angle)) / 111.32;
    const dLon = (radiusKm * Math.cos(angle)) / (111.32 * Math.cos((lat * Math.PI) / 180));
    ring.push([lon + dLon, lat + dLat]);
  }
  return ring;
}

/** Everything the storm layers draw: lines, dots and radius circles. */
export function stormsToGeoJson(storms: Storm[]): { lines: Collection; dots: Collection; radii: Collection } {
  const lines = emptyCollection();
  const dots = emptyCollection();
  const radii = emptyCollection();

  for (const storm of storms) {
    const past = storm.track.filter((point) => !point.isForecast);
    const forecast = storm.track.filter((point) => point.isForecast);

    if (past.length >= 2) {
      lines.features.push({
        type: 'Feature',
        properties: { forecast: false },
        geometry: { type: 'LineString', coordinates: past.map((p) => [p.lon, p.lat]) },
      });
    }
    // The dashed line starts at the last observed position so the track is unbroken.
    const lastPast = past[past.length - 1];
    const forecastPath = lastPast ? [lastPast, ...forecast] : forecast;
    if (forecastPath.length >= 2) {
      lines.features.push({
        type: 'Feature',
        properties: { forecast: true },
        geometry: { type: 'LineString', coordinates: forecastPath.map((p) => [p.lon, p.lat]) },
      });
    }

    for (const point of storm.track) {
      dots.features.push({
        type: 'Feature',
        properties: {
          forecast: point.isForecast,
          json: JSON.stringify({ storm: storm.name, source: storm.source, point }),
        },
        geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      });
      if (point.isForecast && point.radiusKm !== null && point.radiusKm > 0) {
        radii.features.push({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: circle(point.lat, point.lon, point.radiusKm) },
        });
      }
    }
  }
  return { lines, dots, radii };
}
