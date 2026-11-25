// Checks one radio stream: open it, wait for the first audio bytes, hang up.
// Never plays or keeps anything. A failure only starts the "failing since"
// clock; the station is hidden after a full day of failures (DEAD_AFTER_HOURS),
// like the YouTube link checker: one bad check never hides a station.

import { RADIO_USER_AGENT } from '../fetchers/radioBrowser.ts';

/** Enough bytes to be sure audio is flowing (about 0.1 s at 64 kbps). */
export const AUDIO_BYTES = 1024;
/** The whole check (connecting, redirects, first bytes) must fit in this. */
const LIMIT_MS = 12_000;
const MAX_REDIRECTS = 3;

/** What the network gave back. `bytes` = body bytes read before hanging up. */
export type Probe =
  | { kind: 'answer'; status: number; contentType: string | null; bytes: number }
  | { kind: 'error'; note: string; unreadable: boolean };

/**
 * 'ok' = audio came; 'failed' = it did not; 'unchecked' = we cannot tell: the server
 * answers in an old Shoutcast way ("ICY 200 OK") that Node cannot read, or it
 * refuses our checker (401/403). Unchecked never hides a station.
 */
export type RadioVerdict = { status: 'ok' | 'failed' | 'unchecked'; note: string | null };

/** Judges a probe. Pure: no network. */
export function judgeRadio(probe: Probe): RadioVerdict {
  if (probe.kind === 'error') return { status: probe.unreadable ? 'unchecked' : 'failed', note: probe.note };
  // 401/403: the server refused our checker. That says nothing about a reader's
  // browser, so we can't tell (we never pretend to be a browser).
  if (probe.status === 401 || probe.status === 403) {
    return { status: 'unchecked', note: `HTTP ${probe.status}: refused our check` };
  }
  if (probe.status !== 200) return { status: 'failed', note: `HTTP ${probe.status}` };
  const type = (probe.contentType ?? '').toLowerCase();
  if (type.startsWith('text/')) return { status: 'failed', note: 'a web page, not audio' };
  if (type.includes('mpegurl') || type.includes('scpls')) return { status: 'failed', note: 'a playlist, not a stream' };
  if (probe.bytes < AUDIO_BYTES) return { status: 'failed', note: 'no audio came' };
  return { status: 'ok', note: null };
}

/**
 * The new "failing since" after a check. Pure.
 * failed → keeps the old start, or starts now. ok and unchecked → null: only
 * real failures, one after another, can hide a station.
 */
export function nextFailingSince(verdict: RadioVerdict, previous: Date | null, now: Date): Date | null {
  if (verdict.status !== 'failed') return null;
  return previous ?? now;
}

function describe(error: unknown): { note: string; unreadable: boolean } {
  // fetch hides the real reason in `cause`.
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  const raw = cause && typeof cause === 'object' && 'code' in cause ? cause.code : null;
  const code = typeof raw === 'string' ? raw : '';
  // An "ICY 200 OK" first line: fetch says HTTPParserError, "Expected HTTP/".
  if (cause instanceof Error && cause.name === 'HTTPParserError' && cause.message.includes('Expected HTTP/')) {
    return { note: 'old Shoutcast reply Node cannot read', unreadable: true };
  }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return { note: 'no answer in time', unreadable: false };
  }
  return { note: code || (cause instanceof Error && cause.message ? cause.message : 'could not connect'), unreadable: false };
}

/** Opens the stream and counts the first bytes. Never throws. */
export async function probeRadio(startUrl: string): Promise<Probe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new DOMException('timed out', 'TimeoutError')), LIMIT_MS);
  let url = startUrl;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      // `redirect: 'manual'` hands us each redirect, so we can count them.
      const response = await fetch(url, {
        headers: { 'User-Agent': RADIO_USER_AGENT },
        redirect: 'manual',
        signal: controller.signal,
      });
      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        url = new URL(location, url).toString();
        if (!/^https?:$/.test(new URL(url).protocol)) return { kind: 'error', note: 'redirect to a non-web address', unreadable: false };
        continue;
      }
      let bytes = 0;
      const reader = response.body?.getReader();
      while (reader && bytes < AUDIO_BYTES) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
      }
      // Hang up: we never listen longer than the first bytes.
      await reader?.cancel().catch(() => {});
      return { kind: 'answer', status: response.status, contentType: response.headers.get('content-type'), bytes };
    }
    return { kind: 'error', note: `more than ${MAX_REDIRECTS} redirects`, unreadable: false };
  } catch (error) {
    return { kind: 'error', ...describe(error) };
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
