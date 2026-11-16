// Fetches disaster events from GDACS (UN/EU alert system) and checks them.
// Main source: the JSON API. Backup when it fails: the RSS feed.
// Data reuse is allowed with credit (CC BY 4.0): https://www.gdacs.org/

import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { gdacsKind, toAlertLevel, type EventRecord } from './eventRecord.ts';

const API_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?country=Philippines';
const RSS_URL = 'https://www.gdacs.org/xml/rss.xml';

// The same box around the Philippines that usgs.ts uses.
const PH_BOX = { minLat: 4.5, maxLat: 21.5, minLon: 116, maxLon: 127 };

type Result = { events: EventRecord[]; skipped: number };

// An id may arrive as a number or as text; we always keep it as text.
// `.transform(String)` converts the value after it passed the check.
const idSchema = z.union([z.string().min(1), z.number()]).transform(String);

// What one feature of the GDACS API must look like. Extra fields are ignored.
const apiFeatureSchema = z.object({
  geometry: z.object({
    // A "tuple" is a list with a fixed order: [longitude, latitude].
    coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  }),
  properties: z.object({
    eventtype: z.string().min(1),
    eventid: idSchema,
    name: z.string().optional(),
    eventname: z.string().optional(),
    alertlevel: z.string().optional(),
    fromdate: z.string().min(1),
    todate: z.string().optional(),
    iscurrent: z.union([z.string(), z.boolean()]).optional(),
    url: z.object({ report: z.string().optional() }).optional(),
  }),
});

const apiSchema = z.object({ features: z.array(z.unknown()) });

// What one RSS item must look like, after we have read its XML.
// `z.coerce.number()` turns text such as "9.7595" into a number first.
const rssItemSchema = z.object({
  eventtype: z.string().min(1),
  eventid: idSchema,
  title: z.string().min(1),
  link: z.string().optional(),
  alertlevel: z.string().optional(),
  country: z.string().optional(),
  fromdate: z.string().min(1),
  todate: z.string().optional(),
  iscurrent: z.string().optional(),
  lat: z.coerce.number().min(-90).max(90),
  lon: z.coerce.number().min(-180).max(180),
});

/** API dates look like "2026-11-15T13:41:35" (no zone, but UTC); RSS ones end in GMT. */
function parseDate(text: string): Date | null {
  const hasZone = /(Z|GMT|[+-]\d\d:?\d\d)$/.test(text);
  const isIso = /^\d{4}-\d\d-\d\dT/.test(text);
  const date = new Date(isIso && !hasZone ? `${text}Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Start and end dates; the end is null while GDACS says the event is current. */
function readDates(fromdate: string, todate: string | undefined, iscurrent: string | boolean | undefined) {
  const isCurrent = String(iscurrent).toLowerCase() === 'true';
  const end = todate ? parseDate(todate) : null;
  return { startedAt: parseDate(fromdate), endedAt: isCurrent ? null : end };
}

/** Checks a GDACS API response. Bad features are skipped and logged. */
export function parseGdacsApi(json: unknown): Result {
  const feed = apiSchema.parse(json);
  const events: EventRecord[] = [];
  let skipped = 0;

  for (const rawFeature of feed.features) {
    const parsed = apiFeatureSchema.safeParse(rawFeature);
    if (!parsed.success) {
      skipped += 1;
      console.warn('GDACS API: skipped a record that failed the checks:', z.prettifyError(parsed.error));
      continue;
    }
    const { geometry, properties: props } = parsed.data;
    const { startedAt, endedAt } = readDates(props.fromdate, props.todate, props.iscurrent);
    if (!startedAt) {
      skipped += 1;
      console.warn(`GDACS API: skipped ${props.eventtype} ${props.eventid}: bad start date`);
      continue;
    }

    events.push({
      id: `gdacs:${props.eventtype.toUpperCase()}:${props.eventid}`,
      source: 'gdacs',
      kind: gdacsKind(props.eventtype),
      alertLevel: toAlertLevel(props.alertlevel),
      title: props.name || props.eventname || `${props.eventtype} ${props.eventid}`,
      startedAt,
      endedAt,
      url: props.url?.report ?? null,
      geometry: { type: 'Point', coordinates: [...geometry.coordinates] },
      raw: rawFeature,
    });
  }
  return { events, skipped };
}

// Reads XML into plain objects. Values stay text, so "0012" is not turned into 12.
const xmlParser = new XMLParser({ parseTagValue: false, isArray: (name) => name === 'item' });

type XmlItem = Record<string, unknown>;

/** Finds the item's position: geo:Point first, georss:point ("lat lon") as backup. */
function readPosition(item: XmlItem): { lat?: string; lon?: string } {
  const point = item['geo:Point'] as { 'geo:lat'?: string; 'geo:long'?: string } | undefined;
  if (point?.['geo:lat'] && point['geo:long']) return { lat: point['geo:lat'], lon: point['geo:long'] };
  const [lat, lon] = String(item['georss:point'] ?? '').trim().split(/\s+/);
  return { lat, lon };
}

/** True when the item is about the Philippines: by country name or by position. */
function isInPhilippines(country: string | undefined, lat: number, lon: number): boolean {
  if (country?.toLowerCase().includes('philippines')) return true;
  return lat >= PH_BOX.minLat && lat <= PH_BOX.maxLat && lon >= PH_BOX.minLon && lon <= PH_BOX.maxLon;
}

/**
 * Checks the GDACS RSS feed text and keeps only Philippines items. Items that
 * fail the checks are skipped and logged. Throws if the text isn't an RSS feed.
 */
export function parseGdacsRss(xmlText: string): Result {
  // Remove the invisible byte-order mark some servers put at the very start.
  const doc: unknown = xmlParser.parse(xmlText.replace(/^﻿/, ''));
  // `as` tells TypeScript the shape we expect; zod proves each item below.
  const items = (doc as { rss?: { channel?: { item?: unknown } } }).rss?.channel?.item;
  if (!Array.isArray(items)) throw new Error('GDACS RSS: no items found in the feed');

  const events: EventRecord[] = [];
  let skipped = 0;

  for (const item of items as XmlItem[]) {
    const position = readPosition(item);
    const parsed = rssItemSchema.safeParse({
      eventtype: item['gdacs:eventtype'],
      eventid: item['gdacs:eventid'],
      title: item['title'],
      link: item['link'],
      alertlevel: item['gdacs:alertlevel'],
      country: item['gdacs:country'],
      fromdate: item['gdacs:fromdate'],
      todate: item['gdacs:todate'],
      iscurrent: item['gdacs:iscurrent'],
      lat: position.lat,
      lon: position.lon,
    });
    if (!parsed.success) {
      skipped += 1;
      console.warn('GDACS RSS: skipped an item that failed the checks:', z.prettifyError(parsed.error));
      continue;
    }
    const data = parsed.data;
    const { startedAt, endedAt } = readDates(data.fromdate, data.todate, data.iscurrent);
    if (!startedAt) {
      skipped += 1;
      console.warn(`GDACS RSS: skipped ${data.eventtype} ${data.eventid}: bad start date`);
      continue;
    }
    if (!isInPhilippines(data.country, data.lat, data.lon)) continue;

    events.push({
      id: `gdacs:${data.eventtype.toUpperCase()}:${data.eventid}`,
      source: 'gdacs',
      kind: gdacsKind(data.eventtype),
      alertLevel: toAlertLevel(data.alertlevel),
      title: data.title,
      startedAt,
      endedAt,
      url: data.link ? data.link.replace(/^http:\/\//, 'https://') : null,
      geometry: { type: 'Point', coordinates: [data.lon, data.lat] },
      raw: item,
    });
  }
  return { events, skipped };
}

/** Downloads a URL, giving up after `seconds`. */
async function download(url: string, seconds: number): Promise<Response> {
  const response = await fetch(url, { signal: AbortSignal.timeout(seconds * 1000) });
  if (!response.ok) throw new Error(`GDACS request failed: HTTP ${response.status}`);
  return response;
}

/** Tries the API first, then the RSS feed. Throws only if both fail. */
export async function fetchGdacsEvents(): Promise<Result & { via: 'api' | 'rss' }> {
  try {
    const result = parseGdacsApi(await (await download(API_URL, 30)).json());
    console.log('GDACS: used the API.');
    return { ...result, via: 'api' };
  } catch (apiError) {
    console.warn('GDACS: the API failed, trying the RSS feed:', String(apiError));
    const result = parseGdacsRss(await (await download(RSS_URL, 60)).text());
    console.log('GDACS: used the RSS feed.');
    return { ...result, via: 'rss' };
  }
}
