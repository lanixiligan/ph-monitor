// Fetches natural events around the Philippines from NASA EONET and checks them.
// Docs: https://eonet.gsfc.nasa.gov/docs/v3 (no key). Events that come from
// GDACS are skipped: the GDACS fetcher already saves them.

import { z } from 'zod';
import type { DisasterKind } from '@ph-monitor/shared';
import type { EventGeometry, EventRecord } from './eventRecord.ts';

// bbox order is: west, north, east, south. Last 30 days, open and closed events.
const EONET_URL =
  'https://eonet.gsfc.nasa.gov/api/v3/events?bbox=116,21.5,127,4.5&status=all&days=30';

// A "tuple" is a list with a fixed order: [longitude, latitude].
const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

// One place and time of an event: a point, or an area (a closed ring of positions).
// `discriminatedUnion` picks the right schema by looking at the `type` field.
const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Point'), date: z.string(), coordinates: position }),
  z.object({
    type: z.literal('Polygon'),
    date: z.string(),
    coordinates: z.array(z.array(position).min(4)).min(1),
  }),
]);

const eventSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  link: z.string().nullable(),
  closed: z.string().nullable(),
  categories: z.array(z.object({ id: z.string() })),
  sources: z.array(z.object({ id: z.string() })),
  geometry: z.array(geometrySchema).min(1),
});

const feedSchema = z.object({ events: z.array(z.unknown()) });

/** EONET's category id to our kind. */
function eonetKind(categoryId: string | undefined): DisasterKind {
  // `Record<string, DisasterKind>` is a lookup table: text in, kind out.
  const kinds: Record<string, DisasterKind> = {
    severeStorms: 'typhoon',
    floods: 'flood',
    volcanoes: 'volcano',
    wildfires: 'wildfire',
    earthquakes: 'earthquake',
    drought: 'drought',
  };
  return (categoryId && kinds[categoryId]) || 'other';
}

type EonetResult = { events: EventRecord[]; skipped: number; fromGdacs: number };

/**
 * Checks an EONET response. Bad events are skipped and logged. Events that
 * GDACS also reports are left out and counted in `fromGdacs`.
 */
export function parseEonet(json: unknown): EonetResult {
  const feed = feedSchema.parse(json);
  const events: EventRecord[] = [];
  let skipped = 0;
  let fromGdacs = 0;

  for (const rawEvent of feed.events) {
    const parsed = eventSchema.safeParse(rawEvent);
    if (!parsed.success) {
      skipped += 1;
      console.warn('EONET: skipped an event that failed the checks:', z.prettifyError(parsed.error));
      continue;
    }
    const event = parsed.data;
    if (event.sources.some((source) => source.id === 'GDACS')) {
      fromGdacs += 1;
      continue;
    }

    // Oldest date = when it started; newest geometry = where it is now.
    const times = event.geometry.map((g) => new Date(g.date).getTime());
    const newest = event.geometry[times.indexOf(Math.max(...times))];
    const closed = event.closed ? new Date(event.closed) : null;
    if (!newest || times.some(Number.isNaN) || (closed && Number.isNaN(closed.getTime()))) {
      skipped += 1;
      console.warn(`EONET: skipped ${event.id}: a date could not be read`);
      continue;
    }
    const geometry: EventGeometry =
      newest.type === 'Point'
        ? { type: 'Point', coordinates: [...newest.coordinates] }
        : { type: 'Polygon', coordinates: newest.coordinates.map((ring) => ring.map((p) => [...p])) };

    events.push({
      id: `eonet:${event.id}`,
      source: 'eonet',
      kind: eonetKind(event.categories[0]?.id),
      alertLevel: null,
      title: event.title,
      startedAt: new Date(Math.min(...times)),
      endedAt: closed,
      url: event.link,
      geometry,
      raw: rawEvent,
    });
  }
  return { events, skipped, fromGdacs };
}

/** Downloads the last 30 days of events around the Philippines. */
export async function fetchEonetEvents(): Promise<EonetResult> {
  const response = await fetch(EONET_URL, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`EONET request failed: HTTP ${response.status}`);
  return parseEonet(await response.json());
}
