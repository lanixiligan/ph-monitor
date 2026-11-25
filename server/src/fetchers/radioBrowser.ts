// Fetches the list of Philippine radio stations from Radio Browser and checks it.
// Docs: https://api.radio-browser.info/ (free, no key). The API runs on several
// mirror servers. As the docs ask, the list of mirrors comes from DNS, is put in
// random order, and a mirror that fails is skipped for the next one.

import { promises as dns } from 'node:dns';
import { z } from 'zod';
import { fetchWithRetry } from './retry.ts';
import type { Fetcher } from './retry.ts';

/** The docs ask for a "speaking" User-Agent: app name and version. */
export const RADIO_USER_AGENT = 'ph-monitor/0.1';

/** Used when the DNS lookup fails or forgets it. The only mirror on 2026-11-25. */
const FALLBACK_MIRROR = 'de1.api.radio-browser.info';

// Only stations that Radio Browser's own check found working.
const STATIONS_PATH = '/json/stations/bycountrycodeexact/PH?hidebroken=true&limit=100000';

/** One station as we keep it. */
export type RadioRecord = {
  /** Radio Browser's stationuuid. */
  id: string;
  name: string;
  /** The place the station gave (province, city or region), as typed by whoever added it. */
  state: string | null;
  tags: string | null;
  codec: string | null;
  /** kbps; null when unknown. */
  bitrate: number | null;
  /** The stream itself (Radio Browser's url_resolved). */
  url: string;
  homepage: string | null;
  votes: number;
};

// Empty text becomes null. `z.preprocess` runs before the check.
const text = z.preprocess((value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : null), z.string().nullable());

const stationSchema = z.object({
  stationuuid: z.string().regex(/^[0-9a-f-]{36}$/i),
  name: z.string().trim().min(1),
  url_resolved: z.string().regex(/^https?:\/\//i),
  homepage: text,
  tags: text,
  state: text,
  codec: text,
  bitrate: z.number().int().nonnegative(),
  hls: z.number(),
  votes: z.number(),
});

/** HLS playlists need an extra player library, so they are left out. */
function isHls(station: z.infer<typeof stationSchema>): boolean {
  return station.hls === 1 || /\.m3u8?(\?|$)/i.test(station.url_resolved);
}

export type RadioResult = { stations: RadioRecord[]; skipped: number; hls: number; duplicates: number };

/**
 * Checks Radio Browser's answer. Pure: no network. Bad records are skipped and
 * logged; HLS stations are left out; two stations with the same stream keep
 * only one: a station in `preferIds` (our curated list), else the most votes.
 */
export function parseRadioStations(json: unknown, preferIds: string[] = []): RadioResult {
  const list = z.array(z.unknown()).parse(json);
  // A Map keeps one station per stream address.
  const byUrl = new Map<string, RadioRecord>();
  let skipped = 0;
  let hls = 0;
  let duplicates = 0;

  for (const raw of list) {
    const parsed = stationSchema.safeParse(raw);
    if (!parsed.success) {
      skipped += 1;
      console.warn('Radio Browser: skipped a station that failed the checks:', z.prettifyError(parsed.error));
      continue;
    }
    const station = parsed.data;
    if (isHls(station)) {
      hls += 1;
      continue;
    }
    const record: RadioRecord = {
      id: station.stationuuid.toLowerCase(),
      name: station.name,
      state: station.state,
      tags: station.tags,
      codec: station.codec,
      bitrate: station.bitrate > 0 ? station.bitrate : null,
      url: station.url_resolved,
      homepage: station.homepage,
      votes: station.votes,
    };
    const seen = byUrl.get(record.url);
    if (seen) duplicates += 1;
    // A number for "which one to keep": curated first, then votes.
    const rank = (r: RadioRecord) => (preferIds.includes(r.id) ? Infinity : r.votes);
    if (!seen || rank(record) > rank(seen)) byUrl.set(record.url, record);
  }
  return { stations: [...byUrl.values()], skipped, hls, duplicates };
}

/** Puts the mirrors in random order (spreads the load) and adds the fallback last. Pure. */
export function orderMirrors(found: string[], random: () => number = Math.random): string[] {
  const shuffled = [...found];
  // Fisher–Yates shuffle: swap each item with a random earlier one.
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as string, shuffled[i] as string];
  }
  return shuffled.includes(FALLBACK_MIRROR) ? shuffled : [...shuffled, FALLBACK_MIRROR];
}

/** The mirrors listed in DNS (an SRV record holds the server names). Never throws. */
async function findMirrors(): Promise<string[]> {
  try {
    const records = await dns.resolveSrv('_api._tcp.radio-browser.info');
    return records.map((record) => record.name);
  } catch (error) {
    console.warn('Radio Browser: mirror lookup failed, using the fallback:', error instanceof Error ? error.message : error);
    return [];
  }
}

export type RadioFetchOptions = {
  /** Pretend mirror list and fetch, for tests. */
  mirrors?: string[];
  fetcher?: Fetcher;
  pauseMs?: number;
  /** Stations to keep when two share a stream (see parseRadioStations). */
  preferIds?: string[];
};

/** Downloads the PH station list, trying one mirror after another. Throws if all fail. */
export async function fetchRadioStations(options: RadioFetchOptions = {}): Promise<RadioResult> {
  const mirrors = orderMirrors(options.mirrors ?? (await findMirrors()));
  const failures: string[] = [];
  for (const mirror of mirrors) {
    try {
      const response = await fetchWithRetry(
        `https://${mirror}${STATIONS_PATH}`,
        () => ({ headers: { 'User-Agent': RADIO_USER_AGENT }, signal: AbortSignal.timeout(60_000) }),
        { fetcher: options.fetcher, pauseMs: options.pauseMs },
      );
      return parseRadioStations(await response.json(), options.preferIds);
    } catch (error) {
      failures.push(`${mirror}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`Radio Browser: every mirror failed (${failures.join('; ')})`);
}
