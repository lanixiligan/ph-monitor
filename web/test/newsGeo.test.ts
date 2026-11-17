import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { FeatureCollection, Geometry } from 'geojson';
import type { NewsItem, ProvinceMapProperties } from '@ph-monitor/shared';
import { groupByProvince, newsToGeoJson, provincesBox } from '../src/newsGeo.ts';

function province(psgc: number, name: string, ring: [number, number][]) {
  const properties: ProvinceMapProperties = {
    psgc,
    name,
    score: null,
    quake_score: null,
    weather_score: null,
    event_score: null,
    point_lat: ring[0]![1],
    point_lon: ring[0]![0],
  };
  return { type: 'Feature' as const, properties, geometry: { type: 'Polygon' as const, coordinates: [ring] } };
}

const provinces: FeatureCollection<Geometry, ProvinceMapProperties> = {
  type: 'FeatureCollection',
  features: [
    province(1, 'Albay', [[123.5, 13.1], [123.9, 13.1], [123.9, 13.4], [123.5, 13.1]]),
    province(2, 'Sorsogon', [[123.8, 12.6], [124.2, 12.6], [124.2, 13.0], [123.8, 12.6]]),
  ],
};

function headline(id: number, publishedAt: string, provincePsgcs: number[]): NewsItem {
  return { id, title: `Story ${id}`, url: 'https://example.com', outlet: 'X', category: 'tv', publishedAt, provincePsgcs, otherOutlets: [] };
}

test('groups headlines by province, newest first, and skips untagged ones', () => {
  const news = [
    headline(1, '2026-11-16T01:00:00Z', [1]),
    headline(2, '2026-11-16T03:00:00Z', [1, 2]),
    headline(3, '2026-11-16T02:00:00Z', []),
    headline(4, '2026-11-16T02:00:00Z', [999]),
  ];
  const dots = groupByProvince(news, provinces);
  assert.deepEqual(
    dots.map((dot) => [dot.name, dot.items.map((item) => item.id)]),
    [
      ['Albay', [2, 1]],
      ['Sorsogon', [2]],
    ],
  );
});

test('puts one dot per province at its point, with a headline count', () => {
  const geo = newsToGeoJson([headline(1, '2026-11-16T01:00:00Z', [1]), headline(2, '2026-11-16T02:00:00Z', [1])], provinces);
  assert.equal(geo.features.length, 1);
  assert.equal(geo.features[0]!.properties.count, 2);
  assert.deepEqual(geo.features[0]!.geometry, { type: 'Point', coordinates: [123.5, 13.1] });
});

test('finds the box around the chosen provinces', () => {
  assert.deepEqual(provincesBox(provinces, [1, 2]), [[123.5, 12.6], [124.2, 13.4]]);
  assert.equal(provincesBox(provinces, [999]), null);
});
