// Typed helpers for talking to our own server. The web app never calls USGS
// or Open-Meteo itself: everything goes through /api.

import type { FeatureCollection, Geometry } from 'geojson';
import type {
  BulletinLink,
  DisasterEvent,
  HazardLayerInfo,
  HeatMapData,
  HeatViewId,
  NewsItem,
  OfficialAlert,
  PlaceMatch,
  PlaceScores,
  PlaceShapeProperties,
  PointDetail,
  ProvinceMapProperties,
  QuakeMap,
  RadioStation,
  RainForecastMap,
  StatusReport,
  Storm,
  StreamSlot,
} from '@ph-monitor/shared';

/** All province shapes with their scores, as GeoJSON. */
export type ProvinceCollection = FeatureCollection<Geometry, ProvinceMapProperties>;

/** All city and municipality shapes, as GeoJSON (no scores; those come separately). */
export type PlaceCollection = FeatureCollection<Geometry, PlaceShapeProperties>;

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

/** Every town's shape. Large (about 750 kB), so the map asks for it only once, when needed. */
export async function fetchPlaceShapes(): Promise<PlaceCollection> {
  return (await getJson('/api/places/shapes')) as PlaceCollection;
}

/** Every town's latest score. */
export async function fetchPlaceScores(): Promise<PlaceScores> {
  return (await getJson('/api/places/scores')) as PlaceScores;
}

/** One exact place on the map: latitude and longitude in degrees. */
export type Spot = { lat: number; lon: number };

/** The score and details for one spot. */
export async function fetchPointDetail(spot: Spot): Promise<PointDetail> {
  return (await getJson(`/api/point?lat=${spot.lat}&lon=${spot.lon}`)) as PointDetail;
}

/** Cities, municipalities and provinces whose name matches the text. May come back empty. */
export async function searchPlaces(query: string): Promise<PlaceMatch[]> {
  // encodeURIComponent makes any typed text safe to put in an address.
  return (await getJson(`/api/places?q=${encodeURIComponent(query)}`)) as PlaceMatch[];
}

// The Phase 2 lists. Each one may come back empty.

export async function fetchEvents(): Promise<DisasterEvent[]> {
  return (await getJson('/api/events')) as DisasterEvent[];
}

/** The quakes inside the score's time window, and how fresh the USGS feed is. */
export async function fetchQuakes(): Promise<QuakeMap> {
  return (await getJson('/api/quakes')) as QuakeMap;
}

export async function fetchStorms(): Promise<Storm[]> {
  return (await getJson('/api/storms')) as Storm[];
}

/** Latest headlines. `type` is a kind of disaster ('flood'), 'general', or 'all' for no filter. */
export async function fetchNews(type: string, limit: number): Promise<NewsItem[]> {
  const filter = type === 'all' ? '' : `&type=${encodeURIComponent(type)}`;
  return (await getJson(`/api/news?limit=${limit}${filter}`)) as NewsItem[];
}

/** Radio stations: the News & Emergency group first, then the rest by votes. */
export async function fetchRadio(): Promise<RadioStation[]> {
  return (await getJson('/api/radio')) as RadioStation[];
}

export async function fetchStreams(): Promise<StreamSlot[]> {
  return (await getJson('/api/streams')) as StreamSlot[];
}

/** Asks the server to check the channels again now (it may say "too soon" and skip), then the slots. */
export async function refreshStreams(): Promise<StreamSlot[]> {
  const response = await fetch('/api/streams/refresh', { method: 'POST' });
  if (!response.ok) {
    throw new Error(`The server answered ${response.status} for /api/streams/refresh`);
  }
  return (await response.json()) as StreamSlot[];
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

/** Which fixed hazard maps (Project NOAH) are loaded, for the legend and the map. May come back empty. */
export async function fetchHazards(): Promise<HazardLayerInfo[]> {
  return (await getJson('/api/hazards')) as HazardLayerInfo[];
}

/** Every town's and province's heat index from one source (or the average of the models), at one forecast time `at` (ISO; display only). */
export async function fetchHeatMap(model: HeatViewId, at: string): Promise<HeatMapData> {
  return (await getJson(`/api/heatmap?model=${model}&at=${encodeURIComponent(at)}`)) as HeatMapData;
}

/** The rain forecast field for the Typhoon view: 7 days, 3 hours at a time. */
export async function fetchRainForecast(): Promise<RainForecastMap> {
  return (await getJson('/api/rainforecast')) as RainForecastMap;
}
