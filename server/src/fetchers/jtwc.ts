// Fetches active Northwest Pacific storms from the US Joint Typhoon Warning
// Center (JTWC). This is the BACKUP source, used when JMA fails.
//
// Two steps, both public and without a key:
//   1. The RSS feed lists current warnings (a storm id, name and warning number).
//   2. Each storm links to a plain-text warning that holds the current position
//      and forecast positions (but no past track, pressure or uncertainty circle).
// Wind is already in knots in the text, so no conversion is needed here.

import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { checkStorm } from './stormRecord.ts';
import type { StormRecord, TrackPoint } from './stormRecord.ts';

const JTWC_RSS_URL = 'https://www.metoc.navy.mil/jtwc/rss/jtwc.rss';
const JTWC_PAGE_URL = 'https://www.metoc.navy.mil/jtwc/jtwc.html';

// The feed item that lists Northwest Pacific (and North Indian) warnings.
const NWPAC_GUID = 'NWPAC-NIO-WARNINGS';

// The US Navy site can refuse requests that do not look like a browser.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; ph-monitor)' };

// One <item> of the feed. Extra fields are ignored.
const itemSchema = z.object({
  guid: z.string(),
  description: z.string().optional(),
  link: z.string().optional(),
  pubDate: z.string().optional(),
});

// The wording JTWC uses in the warning header, shortened to the usual codes.
const CATEGORY_CODES: Record<string, string> = {
  'SUPER TYPHOON': 'STY',
  TYPHOON: 'TY',
  'TROPICAL STORM': 'TS',
  'TROPICAL DEPRESSION': 'TD',
  'TROPICAL CYCLONE': 'TC',
  'SUBTROPICAL STORM': 'STS',
  'SUBTROPICAL DEPRESSION': 'STD',
};

// e.g. "Typhoon 28W (Name) Warning #12". The name may be missing.
const HEADER_PATTERN =
  /(SUPER TYPHOON|TYPHOON|TROPICAL STORM|TROPICAL DEPRESSION|TROPICAL CYCLONE|SUBTROPICAL STORM|SUBTROPICAL DEPRESSION)\s+(\d{2}[A-Z])\s*(?:\(([^)]*)\))?\s*Warning\s*#?\s*(\d+)/gi;

/** A storm named in the feed, before its warning text is read. */
export type JtwcListing = {
  id: string;
  name: string;
  category: string | null;
  warningNumber: number;
  /** Link to the warning text (or to the JTWC page if no text link was found). */
  url: string;
  /** When the warning was issued. */
  issuedAt: Date;
  /** The feed's own wording, kept as the raw record. */
  raw: unknown;
};

// Works out the full date of "DDHHMMZ" times, which carry no month or year:
// we take the month (last, this or next) that lands closest to `reference`.
function resolveDayHour(day: number, hour: number, minute: number, reference: Date): Date {
  let best: Date | null = null;
  for (const monthShift of [-1, 0, 1]) {
    const candidate = new Date(
      Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth() + monthShift, day, hour, minute),
    );
    // A day like the 31st can roll into the next month; ignore those.
    if (candidate.getUTCDate() !== day) continue;
    const distance = Math.abs(candidate.getTime() - reference.getTime());
    if (!best || distance < Math.abs(best.getTime() - reference.getTime())) best = candidate;
  }
  return best ?? reference;
}

/**
 * Reads the feed and lists the Northwest Pacific storms with a warning out.
 * Only ids ending in "W" are kept (the other letters are other basins).
 * Throws if the text is not an RSS feed. `now` is used when a date is missing.
 */
export function parseJtwcFeed(xml: string, now: Date): { listings: JtwcListing[]; skipped: number } {
  // `isArray` makes <item> always a list, even when the feed has only one.
  const parser = new XMLParser({ isArray: (name) => name === 'item' });
  const feed = z
    .object({ rss: z.object({ channel: z.object({ item: z.array(z.unknown()).optional() }) }) })
    .parse(parser.parse(xml));

  const listings: JtwcListing[] = [];
  let skipped = 0;

  for (const rawItem of feed.rss.channel.item ?? []) {
    const item = itemSchema.safeParse(rawItem);
    if (!item.success) {
      skipped += 1;
      console.warn('JTWC: skipped a feed item that failed the checks:', z.prettifyError(item.error));
      continue;
    }
    if (item.data.guid !== NWPAC_GUID) continue;

    const description = item.data.description ?? '';
    const feedTime = new Date(item.data.pubDate ?? '');
    const reference = Number.isNaN(feedTime.getTime()) ? now : feedTime;

    // Each warning starts at its header; cut the text there so a storm's
    // links and "Issued at" time are not mixed up with the next storm's.
    const headers = [...description.matchAll(HEADER_PATTERN)];
    headers.forEach((header, index) => {
      const block = description.slice(header.index, headers[index + 1]?.index ?? description.length);
      const id = (header[2] ?? '').toUpperCase();
      if (!id.endsWith('W')) return;

      const issued = /Issued at\s+(\d{2})\/(\d{2})(\d{2})Z/i.exec(block);
      const issuedAt = issued
        ? resolveDayHour(Number(issued[1]), Number(issued[2]), Number(issued[3]), reference)
        : reference;
      // The anchor text of the warning text link is "TC Warning Text".
      const textLink = /href=['"]([^'"]+)['"][^>]*>\s*TC Warning Text/i.exec(block);

      listings.push({
        id,
        name: header[3]?.trim() || id,
        category: CATEGORY_CODES[(header[1] ?? '').toUpperCase()] ?? null,
        warningNumber: Number(header[4]),
        url: textLink?.[1] ?? item.data.link ?? JTWC_PAGE_URL,
        issuedAt,
        raw: { guid: item.data.guid, block: block.trim() },
      });
    });
  }
  return { listings, skipped };
}

/**
 * Reads positions from a JTWC warning text. Lines look like
 * "151800Z --- NEAR 8.1S 160.1W" (the position now) and
 * "160600Z --- 8.4S 161.2W" (forecasts, after the "FORECASTS:" line), each
 * followed by "MAX SUSTAINED WINDS - 040 KT". Anything else is ignored.
 * `reference` is any date near the warning, to fill in month and year.
 */
export function parseJtwcWarningText(text: string, reference: Date): TrackPoint[] {
  const points: TrackPoint[] = [];
  let inForecast = false;
  // Winds not yet filled in: the next "MAX SUSTAINED WINDS" line belongs to the latest position.
  let waitingForWind = false;

  for (const line of text.split('\n')) {
    if (/^\s*FORECASTS:/i.test(line)) inForecast = true;

    const position = /^\s*(\d{2})(\d{2})(\d{2})Z\s*---\s*(?:NEAR\s+)?(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])/i.exec(
      line,
    );
    if (position) {
      const lat = Number(position[4]) * (position[5]?.toUpperCase() === 'S' ? -1 : 1);
      const lon = Number(position[6]) * (position[7]?.toUpperCase() === 'W' ? -1 : 1);
      points.push({
        validAt: resolveDayHour(Number(position[1]), Number(position[2]), Number(position[3]), reference),
        isForecast: inForecast,
        lat,
        lon,
        pressureHpa: null,
        windKt: null,
        radiusKm: null,
      });
      waitingForWind = true;
      continue;
    }

    const wind = /MAX SUSTAINED WINDS\s*-\s*(\d+)\s*KT/i.exec(line);
    const latest = points[points.length - 1];
    if (wind && waitingForWind && latest) {
      latest.windKt = Number(wind[1]);
      waitingForWind = false;
    }
  }
  return points;
}

/** Turns a listing plus its warning-text positions into a checked storm. */
export function buildJtwcStorm(listing: JtwcListing, track: TrackPoint[]): StormRecord | null {
  return checkStorm(
    {
      id: `jtwc:${listing.id}`,
      source: 'jtwc',
      name: listing.name,
      category: listing.category,
      url: listing.url,
      updatedAt: listing.issuedAt,
      raw: listing.raw,
      track,
    },
    `JTWC ${listing.id}`,
  );
}

// Downloads text, giving up after 30 seconds.
async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`JTWC request failed: HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

/**
 * Downloads the Northwest Pacific storms from JTWC. Throws if the feed itself
 * cannot be read. If one storm's warning text fails or has no positions, the
 * storm is still returned, with an empty track.
 */
export async function fetchJtwcStorms(): Promise<{ storms: StormRecord[]; skipped: number }> {
  const now = new Date();
  const { listings, skipped } = parseJtwcFeed(await fetchText(JTWC_RSS_URL), now);

  const storms: StormRecord[] = [];
  let bad = skipped;
  for (const listing of listings) {
    let track: TrackPoint[] = [];
    try {
      track = parseJtwcWarningText(await fetchText(listing.url), listing.issuedAt);
    } catch (error) {
      console.warn(`JTWC ${listing.id}: warning text not read, saving the storm without a track:`, error);
    }
    if (track.length === 0) console.warn(`JTWC ${listing.id}: no positions found in the warning text`);

    const storm = buildJtwcStorm(listing, track);
    if (storm) storms.push(storm);
    else bad += 1;
  }
  return { storms, skipped: bad };
}
