// Typed helpers for talking to our own server. The web app never calls USGS
// or Open-Meteo itself: everything goes through /api.

import type { FeatureCollection, Geometry } from 'geojson';
import type {
  BulletinLink,
  DisasterEvent,
  NewsItem,
  OfficialAlert,
  PointDetail,
  ProvinceMapProperties,
  StatusReport,
  Storm,
  StreamSlot,
} from '@ph-monitor/shared';

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

/** One exact place on the map: latitude and longitude in degrees. */
export type Spot = { lat: number; lon: number };

/** The score and details for one spot. */
export async function fetchPointDetail(spot: Spot): Promise<PointDetail> {
  return (await getJson(`/api/point?lat=${spot.lat}&lon=${spot.lon}`)) as PointDetail;
}

// The Phase 2 lists. Each one may come back empty.

export async function fetchEvents(): Promise<DisasterEvent[]> {
  return (await getJson('/api/events')) as DisasterEvent[];
}

export async function fetchStorms(): Promise<Storm[]> {
  return (await getJson('/api/storms')) as Storm[];
}

/** Latest headlines. `category` is an outlet category id, or 'all' for no filter. */
export async function fetchNews(category: string, limit: number): Promise<NewsItem[]> {
  const filter = category === 'all' ? '' : `&category=${encodeURIComponent(category)}`;
  return (await getJson(`/api/news?limit=${limit}${filter}`)) as NewsItem[];
}

export async function fetchStreams(): Promise<StreamSlot[]> {
  return (await getJson('/api/streams')) as StreamSlot[];
}

export async function fetchBulletins(): Promise<BulletinLink[]> {
  return (await getJson('/api/bulletins')) as BulletinLink[];
}

/** When each feed last succeeded, and which ones are out of date. */
export async function fetchStatus(): Promise<StatusReport> {
  return (await getJson('/api/status')) as StatusReport;
}

/** Official alerts in effect anywhere in the country. May come back empty. */
export async function fetchAlerts(): Promise<OfficialAlert[]> {
  return (await getJson('/api/alerts')) as OfficialAlert[];
}
