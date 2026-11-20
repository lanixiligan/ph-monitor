// Tests for the quake markers' GeoJSON (src/quakeGeo.ts). Run with: npm test

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { QuakePoint } from '@ph-monitor/shared';
import { quakeRadius, quakesToGeoJson } from '../src/quakeGeo.ts';

function quake(id: string, magnitude: number): QuakePoint {
  return {
    id,
    magnitude,
    depthKm: 10,
    place: '12 km SSE of Jimalalud, Philippines',
    occurredAt: '2026-11-18T20:30:54Z',
    url: 'https://earthquake.usgs.gov/earthquakes/eventpage/' + id,
    lat: 9.88,
    lon: 123.26,
  };
}

test('a stronger quake gets a bigger marker, within limits', () => {
  assert.ok(quakeRadius(6) > quakeRadius(5));
  assert.ok(quakeRadius(5) > quakeRadius(4));
  assert.equal(quakeRadius(2), 4);
  assert.equal(quakeRadius(9.5), 22);
});

test('each quake becomes a dot at its epicentre (longitude first), strongest last', () => {
  const geo = quakesToGeoJson([quake('big', 6.1), quake('small', 4.4)]);
  assert.equal(geo.features.length, 2);
  const last = geo.features[1]!;
  assert.deepEqual(last.geometry, { type: 'Point', coordinates: [123.26, 9.88] });
  assert.equal(JSON.parse(String(last.properties.json)).id, 'big');
  assert.equal(last.properties.radius, quakeRadius(6.1));
});

test('no quakes gives an empty collection', () => {
  assert.deepEqual(quakesToGeoJson([]).features, []);
});
