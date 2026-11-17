// Fetches official alerts from PAGASA's public alert feed and checks them.
// Feed: https://publicalert.pagasa.dost.gov.ph/feeds/ (no key; "Copyright PAGASA,
// licensed under CC BY 4.0", so we must credit PAGASA).
//
// Two steps:
//   1. The feed (Atom) lists the latest alerts, each with a link to its file.
//   2. Each file is a CAP alert (Common Alerting Protocol, an XML standard):
//      what it is, how serious, when it ends, and which areas it covers.
// Seen in real data so far: General Flood Advisories (areas are provinces,
// each with its place code) and Tropical Cyclone Alerts (one area: the whole
// Philippine Area of Responsibility). The text is PAGASA's own and is never
// reworded here.

import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';
import { normalize } from '../news/text.ts';
import { fetchWithRetry } from './retry.ts';
import { decodeEntities } from './rss.ts';

export const PAGASA_FEED_URL = 'https://publicalert.pagasa.dost.gov.ph/feeds/';
// Alert files are only ever downloaded from PAGASA's own address.
const PAGASA_FILES = 'https://publicalert.pagasa.dost.gov.ph/';
const USER_AGENT = 'ph-monitor-alerts/0.1';

// processEntities: false keeps "&#xD;" etc. as typed; decodeEntities() handles them.
const parser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
  parseTagValue: false,
  // These tags may appear once or many times; always read them as lists.
  isArray: (name) => ['entry', 'link', 'info', 'area', 'geocode'].includes(name),
});

// The XML reader gives text, or an object when a tag has attributes.
function textOf(value: unknown): string {
  if (typeof value === 'string') return decodeEntities(value).replace(/\r/g, '').trim();
  if (value && typeof value === 'object' && '#text' in value) return textOf(value['#text']);
  return '';
}

// ---------- Step 1: the feed ----------

/** One line of the feed: an alert and where its file is. */
export type AlertEntry = { id: string; title: string; updatedAt: Date; capUrl: string };

const entrySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  updatedAt: z.date().refine((date) => !Number.isNaN(date.getTime())),
  capUrl: z.string().startsWith(PAGASA_FILES),
});

/**
 * Reads the feed. Entries that fail the checks are skipped and logged.
 * Throws if the text is not an Atom feed at all.
 */
export function parsePagasaFeed(xml: string): { entries: AlertEntry[]; skipped: number } {
  // `as` tells TypeScript the shape we expect; zod proves each entry below.
  const root = parser.parse(xml) as { feed?: { entry?: Record<string, unknown>[] } };
  if (!root.feed) throw new Error('PAGASA: not an Atom feed');

  const entries: AlertEntry[] = [];
  let skipped = 0;
  for (const raw of root.feed.entry ?? []) {
    // The alert file is the link marked as CAP.
    const links = (raw.link ?? []) as Record<string, unknown>[];
    const capLink = links.find((link) => link['@_type'] === 'application/cap+xml');
    const parsed = entrySchema.safeParse({
      id: textOf(raw.id).replace(/^urn:uuid:/, ''),
      title: textOf(raw.title),
      updatedAt: new Date(textOf(raw.updated)),
      capUrl: textOf(capLink?.['@_href']),
    });
    if (!parsed.success) {
      skipped += 1;
      console.warn('PAGASA: skipped a feed entry that failed the checks:', z.prettifyError(parsed.error));
      continue;
    }
    entries.push(parsed.data);
  }
  return { entries, skipped };
}

// ---------- Step 2: one alert file ----------

/** One area an alert covers. `code` is PAGASA's place code, when it gives one. */
export type AlertArea = { name: string; code: string | null };

/** One official alert, checked and ready to save. */
export type OfficialAlertRecord = {
  /** PAGASA's own identifier. */
  id: string;
  /** What kind of alert, in PAGASA's words, e.g. "General Flood Advisory (Moderate)". */
  event: string;
  headline: string;
  /** CAP's scale: 'Extreme', 'Severe', 'Moderate', 'Minor' or 'Unknown'. */
  severity: string;
  /** PAGASA's full text. */
  description: string;
  instruction: string | null;
  /** PAGASA's page about this kind of alert. */
  web: string | null;
  sentAt: Date;
  /** null when the file gives no end time. */
  expiresAt: Date | null;
  /** True for a "final" message: the alert is over. */
  isAllClear: boolean;
  /** Ids of earlier alerts this one replaces. */
  replaces: string[];
  areas: AlertArea[];
};

const date = z.date().refine((value) => !Number.isNaN(value.getTime()), 'not a valid date');

const alertSchema = z.object({
  id: z.string().min(1),
  event: z.string().min(1),
  headline: z.string().min(1),
  severity: z.string().min(1),
  description: z.string(),
  sentAt: date,
  expiresAt: date.nullable(),
  areas: z.array(z.object({ name: z.string().min(1), code: z.string().nullable() })).min(1),
});

/**
 * Reads one CAP alert file. Returns null (and logs why) if it is not a
 * usable alert. The signature block at the end of the file is ignored.
 */
export function parsePagasaCap(xml: string): OfficialAlertRecord | null {
  let root: { alert?: Record<string, unknown> };
  try {
    root = parser.parse(xml) as { alert?: Record<string, unknown> };
  } catch {
    console.warn('PAGASA: skipped an alert file that is not XML');
    return null;
  }
  const alert = root.alert;
  // A file can carry the alert in several languages; the first one is used.
  const info = ((alert?.info ?? []) as Record<string, unknown>[])[0];
  if (!alert || !info) {
    console.warn('PAGASA: skipped an alert file with no alert text');
    return null;
  }

  const areas: AlertArea[] = ((info.area ?? []) as Record<string, unknown>[]).map((area) => {
    // The place code is the geocode named "SAME".
    const codes = (area.geocode ?? []) as Record<string, unknown>[];
    const same = codes.find((code) => textOf(code.valueName) === 'SAME');
    const code = textOf(same?.value);
    return { name: textOf(area.areaDesc), code: code === '' ? null : code };
  });

  const expires = textOf(info.expires);
  const parsed = alertSchema.safeParse({
    id: textOf(alert.identifier),
    event: textOf(info.event),
    // Some alerts have no headline; the event name stands in.
    headline: textOf(info.headline) || textOf(info.event),
    severity: textOf(info.severity) || 'Unknown',
    description: textOf(info.description),
    sentAt: new Date(textOf(alert.sent)),
    expiresAt: expires === '' ? null : new Date(expires),
    areas,
  });
  if (!parsed.success) {
    console.warn('PAGASA: skipped an alert that failed the checks:', z.prettifyError(parsed.error));
    return null;
  }

  // <references> lists "sender,identifier,time" for each alert this one replaces.
  const replaces = textOf(alert.references)
    .split(/\s+/)
    .map((reference) => reference.split(',')[1] ?? '')
    .filter((id) => id !== '');
  const instruction = textOf(info.instruction);
  const web = textOf(info.web);

  return {
    ...parsed.data,
    instruction: instruction === '' ? null : instruction,
    web: /^https?:\/\//i.test(web) ? web : null,
    isAllClear: textOf(info.responseType) === 'AllClear',
    replaces,
  };
}

// ---------- Matching areas to our provinces ----------

/**
 * PAGASA writes place codes the old 9-digit way (region 2, province 2, rest 5);
 * ours have 10 digits (region 2, province 3, rest 5). "112500000" → 1102500000.
 * Returns null if the text is not a code.
 */
export function newPsgc(code: string): number | null {
  if (!/^\d{8,9}$/.test(code)) return null;
  const nine = code.padStart(9, '0');
  return Number(`${nine.slice(0, 2)}0${nine.slice(2)}`);
}

/**
 * The provinces an alert's areas stand for: by place code first, then by
 * name. If no area matches any province (for example "Philippine Area of
 * Responsibility"), the alert counts for the whole country.
 */
export function provincesForAreas(
  areas: AlertArea[],
  provinces: { psgc: number; name: string }[],
): { psgcs: number[]; isNationwide: boolean } {
  const known = new Set(provinces.map((province) => province.psgc));
  const byName = new Map(provinces.map((province) => [normalize(province.name), province.psgc]));

  const found = new Set<number>();
  for (const area of areas) {
    const fromCode = area.code === null ? null : newPsgc(area.code);
    const psgc = fromCode !== null && known.has(fromCode) ? fromCode : byName.get(normalize(area.name));
    if (psgc !== undefined) found.add(psgc);
  }
  const psgcs = [...found].sort((a, b) => a - b);
  return { psgcs, isNationwide: psgcs.length === 0 };
}

/** An alert with no end time is believed for this long after it was fetched. */
export const NO_EXPIRY_HOURS = 24;

/**
 * True while an alert should be shown: not expired, not replaced by a newer
 * one, and not an all-clear. (When the file gave no end time, the job saves
 * one NO_EXPIRY_HOURS after the alert was sent, so null here means "keep".)
 */
export function isAlertInEffect(
  alert: { expiresAt: Date | null; isAllClear: boolean; isReplaced: boolean },
  now: Date,
): boolean {
  if (alert.isAllClear || alert.isReplaced) return false;
  return alert.expiresAt === null || alert.expiresAt.getTime() > now.getTime();
}

// ---------- Downloading ----------

async function download(url: string): Promise<string> {
  const response = await fetchWithRetry(url, () => ({
    headers: { 'User-Agent': USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  }));
  return response.text();
}

/** Downloads the feed's list of alerts. Throws if the feed cannot be read. */
export async function fetchPagasaFeed(): Promise<{ entries: AlertEntry[]; skipped: number }> {
  return parsePagasaFeed(await download(PAGASA_FEED_URL));
}

/** Downloads and checks one alert file. null = unusable (logged). Throws on network failure. */
export async function fetchPagasaAlert(entry: AlertEntry): Promise<OfficialAlertRecord | null> {
  return parsePagasaCap(await download(entry.capUrl));
}
