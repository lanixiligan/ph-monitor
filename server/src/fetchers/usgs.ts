// Fetches recent earthquakes around the Philippines from USGS and checks them.
// Feed docs: https://earthquake.usgs.gov/fdsnws/event/1/ (no key, public domain)

import { z } from 'zod';

const USGS_URL = 'https://earthquake.usgs.gov/fdsnws/event/1/query';

// A box around the Philippines' land and nearby sea.
const PH_BOX = { minLat: 4.5, maxLat: 21.5, minLon: 116, maxLon: 127 };

// A strong quake is felt up to 400 km away (about 3.6 degrees), so we also
// ask for quakes up to 4 degrees outside that box. Without this, a big quake
// just across the border would be missed.
const REACH_DEG = 4;

/** The area we ask USGS about. `export` lets the tests read it. */
export const QUAKE_BOX = {
  minLat: PH_BOX.minLat - REACH_DEG,
  maxLat: PH_BOX.maxLat + REACH_DEG,
  minLon: PH_BOX.minLon - REACH_DEG,
  maxLon: PH_BOX.maxLon + REACH_DEG,
};

// What one earthquake in the feed must look like. Extra fields are ignored.
const featureSchema = z.object({
  id: z.string().min(1),
  properties: z.object({
    mag: z.number(),
    place: z.string().nullable(),
    // Milliseconds since 1970, which is how JavaScript counts time.
    time: z.number(),
    url: z.string().nullable(),
  }),
  geometry: z.object({
    // A "tuple" is a list with a fixed order: [longitude, latitude, depth in km].
    coordinates: z.tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number().nullable(),
    ]),
  }),
});

const feedSchema = z.object({ features: z.array(z.unknown()) });

/** One earthquake, checked and ready to save. */
export type Quake = {
  id: string;
  magnitude: number;
  depthKm: number | null;
  place: string | null;
  occurredAt: Date;
  url: string | null;
  lon: number;
  lat: number;
  /** The original record, kept so nothing from the feed is lost. */
  raw: unknown;
};

/**
 * Checks a USGS response. Records that don't match the schema are skipped
 * and logged; they are never saved. Throws if the response isn't a feed at all.
 *
 * `unknown` means "we don't know the shape yet", so TypeScript forces us to
 * check it (with zod) before using it.
 */
export function parseUsgsFeed(json: unknown): { quakes: Quake[]; skipped: number } {
  const feed = feedSchema.parse(json);
  const quakes: Quake[] = [];
  let skipped = 0;

  for (const rawFeature of feed.features) {
    const parsed = featureSchema.safeParse(rawFeature);
    if (!parsed.success) {
      skipped += 1;
      console.warn('USGS: skipped a record that failed the checks:', z.prettifyError(parsed.error));
      continue;
    }
    const { id, properties, geometry } = parsed.data;
    const [lon, lat, depthKm] = geometry.coordinates;

    quakes.push({
      id,
      magnitude: properties.mag,
      depthKm,
      place: properties.place,
      occurredAt: new Date(properties.time),
      url: properties.url,
      lon,
      lat,
      raw: rawFeature,
    });
  }

  return { quakes, skipped };
}

/** Downloads earthquakes since `since` with at least `minMagnitude`. */
export async function fetchUsgsQuakes(
  since: Date,
  minMagnitude: number,
): Promise<{ quakes: Quake[]; skipped: number }> {
  const params = new URLSearchParams({
    format: 'geojson',
    eventtype: 'earthquake',
    starttime: since.toISOString(),
    minmagnitude: String(minMagnitude),
    minlatitude: String(QUAKE_BOX.minLat),
    maxlatitude: String(QUAKE_BOX.maxLat),
    minlongitude: String(QUAKE_BOX.minLon),
    maxlongitude: String(QUAKE_BOX.maxLon),
  });

  // Give up after 30 seconds instead of waiting forever.
  const response = await fetch(`${USGS_URL}?${params}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`USGS request failed: HTTP ${response.status}`);
  }
  return parseUsgsFeed(await response.json());
}
