// Turns headlines into map dots: one dot per province named in the news.
// Pure functions: data in, data out, nothing about the map itself.

import type { Feature, FeatureCollection, Geometry, Position } from 'geojson';
import type { NewsItem, ProvinceMapProperties } from '@ph-monitor/shared';

// `Record<string, unknown>` is just "an object with text keys and any values".
type Collection = FeatureCollection<Geometry, Record<string, unknown>>;
type Provinces = FeatureCollection<Geometry, ProvinceMapProperties>;

/** A box written as [[west, south], [east, north]] in degrees. */
export type Box = [[number, number], [number, number]];

/** What a news dot's popup shows: the province and its headlines, newest first. */
export type NewsDot = { psgc: number; name: string; items: NewsItem[] };

/** Groups headlines by the provinces they name. Headlines naming no province are left out. */
export function groupByProvince(news: NewsItem[], provinces: Provinces): NewsDot[] {
  const nameByPsgc = new Map(provinces.features.map((f) => [f.properties.psgc, f.properties.name]));
  const dots = new Map<number, NewsDot>();
  for (const item of news) {
    for (const psgc of item.provincePsgcs) {
      const name = nameByPsgc.get(psgc);
      if (name === undefined) continue;
      const dot = dots.get(psgc) ?? { psgc, name, items: [] };
      dot.items.push(item);
      dots.set(psgc, dot);
    }
  }
  const newestFirst = (a: NewsItem, b: NewsItem) => b.publishedAt.localeCompare(a.publishedAt);
  for (const dot of dots.values()) dot.items.sort(newestFirst);
  return [...dots.values()];
}

/** One dot per province named in the news, at the province's own point. */
export function newsToGeoJson(news: NewsItem[], provinces: Provinces): Collection {
  const pointByPsgc = new Map(
    provinces.features.map((f) => [f.properties.psgc, [f.properties.point_lon, f.properties.point_lat]]),
  );
  const features: Feature<Geometry, Record<string, unknown>>[] = [];
  for (const dot of groupByProvince(news, provinces)) {
    const point = pointByPsgc.get(dot.psgc);
    if (!point) continue;
    features.push({
      type: 'Feature',
      // A full copy of the dot rides along so the popup can read it back.
      properties: { count: dot.items.length, json: JSON.stringify(dot) },
      geometry: { type: 'Point', coordinates: point },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Calls `visit` for every corner point of a shape. */
function eachPosition(geometry: Geometry, visit: (position: Position) => void) {
  switch (geometry.type) {
    case 'Polygon':
      geometry.coordinates.flat().forEach(visit);
      break;
    case 'MultiPolygon':
      geometry.coordinates.flat(2).forEach(visit);
      break;
    case 'GeometryCollection':
      for (const part of geometry.geometries) eachPosition(part, visit);
      break;
    default:
      // Province shapes are always polygons; other kinds are ignored.
      break;
  }
}

/** The smallest box around the given provinces, or null if none of them is found. */
export function provincesBox(provinces: Provinces, psgcs: number[]): Box | null {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const feature of provinces.features) {
    if (!psgcs.includes(feature.properties.psgc)) continue;
    eachPosition(feature.geometry, ([lon, lat]) => {
      if (lon === undefined || lat === undefined) return;
      west = Math.min(west, lon);
      south = Math.min(south, lat);
      east = Math.max(east, lon);
      north = Math.max(north, lat);
    });
  }
  return west === Infinity ? null : [[west, south], [east, north]];
}
