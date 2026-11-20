// Fetches PAGASA's iHeatMAP heat index forecast (DOST-PAGASA; a Philippine government work,
// RA 8293 Sec. 176: credited, non-commercial use; based on ECMWF data).
// Three calls: the latest date, the list of forecast files, and a short-lived
// download link per file. Display only: the score never reads this.
// The API is "internal" (not a published feed) and may change, so every answer is checked.

import { z } from 'zod';
import type { Fetcher } from './retry.ts';
import { fetchWithRetry } from './retry.ts';

export const PAGASA_HEAT_API = 'https://iheatmap.pagasa.dost.gov.ph/internal/api/';
export const PAGASA_HEAT_FILES = 'https://iheatmap.s3.ap-southeast-1.amazonaws.com/';

const USER_AGENT = 'ph-monitor-heat/0.1';
const TIMEOUT_MS = 30_000;

/** One forecast hour, PH time: date '2026-11-21', time '08:00'. */
export type PagasaHour = { date: string; time: string };

/** Day 1 to 3 hours: every hour from 8 AM to 5 PM. */
// `string[]` = a list of text values.
export const DAY_ONE_TIMES: string[] = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

// Extra fields in an answer are allowed (zod ignores them).
const currentDateSchema = z.object({ latest_issuance_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

const tifFilesSchema = z.object({
  files: z.array(z.string()),
  // `z.record` = an object with any keys: date 'YYYYMMDD' → its hours.
  availability: z.record(z.string().regex(/^\d{8}$/), z.array(z.string().regex(/^\d{2}:\d{2}$/))),
});

const presignedSchema = z.object({ url: z.string() });

/** '20261121' → '2026-11-21'. */
function dashed(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/** '2026-11-21' → '20261121'. */
function compact(date: string): string {
  return date.replaceAll('-', '');
}

/** The date of the newest forecast, 'YYYY-MM-DD'. Throws on a bad answer. */
export function parseCurrentDate(json: unknown): string {
  return currentDateSchema.parse(json).latest_issuance_date;
}

/** The forecast's issue date and every hour it holds. Throws when no hours are listed. */
export function parseTifFiles(json: unknown): { issuedOn: string; hours: PagasaHour[] } {
  const parsed = tifFilesSchema.parse(json);
  const first = parsed.files[0] ?? '';
  const prefix = /^(\d{8})\//.exec(first);
  if (!prefix) throw new Error('PAGASA file list: no dated file path');
  const hours: PagasaHour[] = [];
  for (const date of Object.keys(parsed.availability).sort()) {
    for (const time of parsed.availability[date] ?? []) hours.push({ date: dashed(date), time });
  }
  if (hours.length === 0) throw new Error('PAGASA file list: no hours available');
  return { issuedOn: dashed(prefix[1]!), hours };
}

/** The download link from a presigned answer. Throws unless it is on PAGASA's bucket. */
export function parsePresigned(json: unknown): string {
  const { url } = presignedSchema.parse(json);
  // `new URL` splits the link into parts (and throws on a malformed one), so a look-alike
  // host such as '…amazonaws.com.evil.example' cannot pass a plain text prefix check.
  const link = new URL(url);
  if (link.protocol !== 'https:' || link.origin !== new URL(PAGASA_HEAT_FILES).origin) {
    throw new Error('PAGASA download link is not on the expected host');
  }
  return url;
}

/** The plain file name for an hour: '20261121_0800_cog.tif'. */
export function pagasaFileName(hour: PagasaHour): string {
  return `${compact(hour.date)}_${hour.time.replace(':', '')}_cog.tif`;
}

/** Asks one API call; returns its JSON. */
async function getJson(path: string, fetcher?: Fetcher): Promise<unknown> {
  const response = await fetchWithRetry(
    `${PAGASA_HEAT_API}${path}`,
    // A function so every try gets a fresh timeout. `redirect: 'error'` refuses redirects, so the two-host rule holds.
    () => ({ headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' }),
    { fetcher },
  );
  return response.json();
}

/** The newest forecast date, 'YYYY-MM-DD'. */
export async function fetchPagasaLatest(fetcher?: Fetcher): Promise<string> {
  return parseCurrentDate(await getJson('current-date', fetcher));
}

/** The newest forecast's issue date and its hours. */
export async function fetchPagasaListing(fetcher?: Fetcher): Promise<{ issuedOn: string; hours: PagasaHour[] }> {
  return parseTifFiles(await getJson('tif-files', fetcher));
}

/** Downloads one forecast file (a GeoTIFF) as bytes: asks for a link, then fetches it. */
export async function fetchPagasaFile(issuedOn: string, hour: PagasaHour, fetcher?: Fetcher): Promise<ArrayBuffer> {
  const query = `presigned-tif?date=${compact(issuedOn)}&file=${pagasaFileName(hour)}`;
  const link = parsePresigned(await getJson(query, fetcher));
  const response = await fetchWithRetry(
    link,
    () => ({ headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' }),
    { fetcher },
  );
  return response.arrayBuffer();
}
