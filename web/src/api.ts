// Typed helpers for talking to our own server. The web app never calls USGS
// or Open-Meteo itself: everything goes through /api.

import type { FeatureCollection, Geometry } from 'geojson';
import type { ProvinceDetail, ProvinceMapProperties } from '@ph-monitor/shared';

/** All province shapes with their scores, as GeoJSON. */
export type ProvinceCollection = FeatureCollection<Geometry, ProvinceMapProperties>;

async function getJson(path: string): Promise<unknown> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`The server answered ${response.status} for ${path}`);
  }
  return response.json();
}

// `as` tells TypeScript which shape to expect. We trust it here because the
// server builds these answers from the same shared types.

export async function fetchProvinces(): Promise<ProvinceCollection> {
  return (await getJson('/api/provinces')) as ProvinceCollection;
}

export async function fetchProvinceDetail(psgc: number): Promise<ProvinceDetail> {
  return (await getJson(`/api/provinces/${psgc}`)) as ProvinceDetail;
}
