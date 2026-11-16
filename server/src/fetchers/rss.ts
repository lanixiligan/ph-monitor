// Fetches one news feed (RSS 2.0 or Atom) and checks every item.
// Only the headline, outlet, time and link are kept; article text is dropped.

import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

const USER_AGENT = 'ph-monitor-news/0.1';
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // older items are dropped
const MAX_AHEAD_MS = 60 * 60 * 1000; // items dated further ahead are dropped

// What one item must look like once the XML is read.
const itemSchema = z.object({
  title: z.string().min(1),
  // `.url()` alone also accepts things like "ftp://..."; we want web links only.
  link: z.url().refine((link) => /^https?:\/\//i.test(link)),
  publishedAt: z.date({ error: 'not a valid date' }).refine((date) => !Number.isNaN(date.getTime()), 'not a valid date'),
});

/** One headline, checked and ready to filter. */
export type FeedItem = {
  title: string;
  url: string;
  /** The outlet named by the item itself (Google News `<source>`), if any. */
  outlet: string | null;
  publishedAt: Date;
};

type ParsedFeed = { items: FeedItem[]; skipped: number; dropped: number };

// processEntities: false keeps "&amp;" etc. as typed; decodeEntities() below
// handles them (the library skips numeric ones such as &#8217;).
const parser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
  parseTagValue: false,
  isArray: (name) => name === 'item' || name === 'entry',
});

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Turns "&amp;", "&#8217;" and "&#x2019;" into the real characters. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#')) {
      const hex = code[1]?.toLowerCase() === 'x';
      const number = parseInt(code.slice(hex ? 2 : 1), hex ? 16 : 10);
      return number > 0 && number < 0x110000 ? String.fromCodePoint(number) : whole;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? whole;
  });
}

// The XML reader gives strings, or objects when a tag has attributes.
// `unknown` forces us to check what we got before using it.
function textOf(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value && typeof value === 'object' && '#text' in value) return textOf(value['#text']);
  return '';
}

// Atom links look like <link href="..."/>; RSS links are plain text.
function linkOf(value: unknown): string {
  const first: unknown = Array.isArray(value) ? value[0] : value;
  if (first && typeof first === 'object' && '@_href' in first) return textOf(first['@_href']);
  return textOf(first);
}

/** Removes a trailing " - Outlet" (Google News adds the outlet to the title). */
export function stripOutletSuffix(title: string, outlet: string): string {
  const suffix = ` - ${outlet}`.toLowerCase();
  if (title.toLowerCase().endsWith(suffix)) return title.slice(0, title.length - suffix.length).trim();
  return title;
}

/**
 * Reads a feed. Items that fail the checks are skipped and logged (never
 * saved); items too old or dated in the future are dropped quietly.
 * Throws if the text is not an RSS or Atom feed at all.
 */
export function parseFeed(xml: string, now: Date = new Date()): ParsedFeed {
  // `as` tells TypeScript "trust me, this has that shape".
  const root = parser.parse(xml) as {
    rss?: { channel?: { item?: Record<string, unknown>[] } };
    feed?: { entry?: Record<string, unknown>[] };
  };
  const rawItems = root.rss?.channel?.item ?? root.feed?.entry;
  if (!rawItems) throw new Error('not an RSS or Atom feed');

  const items: FeedItem[] = [];
  let skipped = 0;
  let dropped = 0;

  for (const raw of rawItems) {
    const source = decodeEntities(textOf(raw.source));
    const outlet = source === '' ? null : source;
    let title = decodeEntities(textOf(raw.title));
    if (outlet) title = stripOutletSuffix(title, outlet);

    const parsed = itemSchema.safeParse({
      title,
      link: decodeEntities(linkOf(raw.link)),
      publishedAt: new Date(textOf(raw.pubDate) || textOf(raw.published) || textOf(raw.updated)),
    });
    if (!parsed.success) {
      skipped += 1;
      console.warn(`News: skipped an item that failed the checks ("${title.slice(0, 50)}"):`, z.prettifyError(parsed.error));
      continue;
    }

    const age = now.getTime() - parsed.data.publishedAt.getTime();
    if (age > MAX_AGE_MS || age < -MAX_AHEAD_MS) {
      dropped += 1;
      continue;
    }
    items.push({ title: parsed.data.title, url: parsed.data.link, outlet, publishedAt: parsed.data.publishedAt });
  }

  return { items, skipped, dropped };
}

/** Downloads one feed and checks it. */
export async function fetchFeed(url: string): Promise<ParsedFeed> {
  // Give up after 20 seconds instead of waiting forever.
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`feed request failed: HTTP ${response.status}`);
  }
  return parseFeed(await response.text());
}
