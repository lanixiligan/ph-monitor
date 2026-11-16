// The YouTube interfaces the link checker uses. No page is scraped.
//
// With a YouTube key (YOUTUBE_API_KEY in .env), two Data API calls that cost
// 1 quota unit each (search.list costs 100 and is never used):
//   1. playlistItems.list: a channel's newest uploads
//   2. videos.list: title, upload time, live or not, embeddable or not
// Without a key:
//   3. Channel video feed: newest videos (fails at random, see below)
//   4. oEmbed: "may this video be embedded?"
//
// The key is sent in a request header, never in the address, and is never logged.

import { XMLParser } from 'fast-xml-parser';
import { z } from 'zod';

const USER_AGENT = 'ph-monitor-linkcheck/0.1';
const TIMEOUT_MS = 20_000;
const API_URL = 'https://www.googleapis.com/youtube/v3';
/** The most ids videos.list takes in one call, and the most uploads one call returns. */
export const MAX_IDS = 50;

/** What we know about one video. */
export type VideoInfo = {
  id: string;
  title: string | null;
  /** ISO time the video was uploaded (for a live stream: when it was set up). */
  publishedAt: string | null;
  /** 'live' = on air now; 'upcoming' = scheduled; 'none' = an ordinary video; null = unknown (no key). */
  live: 'live' | 'upcoming' | 'none' | null;
  /** When the live stream went on air, if it is live. */
  liveStartedAt: string | null;
  /** null = unknown. */
  embeddable: boolean | null;
};

/**
 * An answer from YouTube. `missing` = YouTube clearly said "no such thing".
 * `error` = we could not tell (timeout, busy server, quota used up).
 */
// `<T>` is a generic: the same three cases, around whatever value type T is.
export type Answer<T> = { kind: 'ok'; value: T } | { kind: 'missing' } | { kind: 'error'; note: string };

/** Says why a request failed, in a few words. `unknown` = any kind of error. */
export function describeError(error: unknown): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'timeout';
  }
  return 'unreachable';
}

// ---- Data API (needs the key) ----

const playlistItemsSchema = z.object({
  items: z.array(z.object({ contentDetails: z.object({ videoId: z.string().min(1) }) })),
});

/** Newest-first video ids from a playlistItems.list answer, or null if not understood. */
export function parsePlaylistItems(json: unknown): string[] | null {
  const result = playlistItemsSchema.safeParse(json);
  return result.success ? result.data.items.map((item) => item.contentDetails.videoId) : null;
}

const videosListSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      snippet: z.object({
        title: z.string(),
        publishedAt: z.string(),
        liveBroadcastContent: z.enum(['live', 'upcoming', 'none']),
      }),
      status: z.object({ embeddable: z.boolean() }),
      // `.optional()`: ordinary videos have no live details at all.
      liveStreamingDetails: z.object({ actualStartTime: z.string().optional() }).optional(),
    }),
  ),
});

/** The videos in a videos.list answer, or null if not understood. */
export function parseVideosList(json: unknown): VideoInfo[] | null {
  const result = videosListSchema.safeParse(json);
  if (!result.success) return null;
  return result.data.items.map((item) => ({
    id: item.id,
    title: item.snippet.title,
    publishedAt: item.snippet.publishedAt,
    live: item.snippet.liveBroadcastContent,
    liveStartedAt: item.liveStreamingDetails?.actualStartTime ?? null,
    embeddable: item.status.embeddable,
  }));
}

// One Data API call. 404 = "no such thing"; anything else that fails = "could not tell".
async function callApi(path: string, params: Record<string, string>, apiKey: string): Promise<Answer<unknown>> {
  try {
    const response = await fetch(`${API_URL}/${path}?${new URLSearchParams(params)}`, {
      headers: { 'User-Agent': USER_AGENT, 'X-goog-api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) return { kind: 'missing' };
    if (!response.ok) return { kind: 'error', note: `YouTube API HTTP ${response.status}` };
    return { kind: 'ok', value: await response.json() };
  } catch (error) {
    return { kind: 'error', note: describeError(error) };
  }
}

/**
 * A channel's newest uploads (up to 50 ids, newest first). 1 quota unit.
 * Every channel has an "uploads" playlist whose id is the channel id with
 * its first two letters "UC" swapped for "UU".
 */
export async function fetchUploads(channelId: string, apiKey: string): Promise<Answer<string[]>> {
  const answer = await callApi(
    'playlistItems',
    { part: 'contentDetails', playlistId: `UU${channelId.slice(2)}`, maxResults: String(MAX_IDS) },
    apiKey,
  );
  if (answer.kind !== 'ok') return answer;
  const ids = parsePlaylistItems(answer.value);
  return ids === null ? { kind: 'error', note: 'uploads answer not understood' } : { kind: 'ok', value: ids };
}

/** Details of up to 50 videos in one call. 1 quota unit. Missing videos are simply left out. */
export async function fetchVideos(videoIds: string[], apiKey: string): Promise<Answer<VideoInfo[]>> {
  const answer = await callApi(
    'videos',
    { part: 'snippet,status,liveStreamingDetails', id: videoIds.slice(0, MAX_IDS).join(',') },
    apiKey,
  );
  if (answer.kind !== 'ok') return answer;
  const videos = parseVideosList(answer.value);
  return videos === null ? { kind: 'error', note: 'videos answer not understood' } : { kind: 'ok', value: videos };
}

// ---- Without a key: channel video feed (Atom) ----

// `isArray` makes a single <entry> still arrive as a list.
const xmlParser = new XMLParser({ isArray: (name) => name === 'entry' });

const channelFeedSchema = z.object({
  feed: z.object({
    entry: z
      .array(
        z.object({
          'yt:videoId': z.string().min(1),
          // The parser turns an all-digits title into a number; accept both.
          title: z.union([z.string(), z.number()]).optional(),
          published: z.string().optional(),
        }),
      )
      .default([]),
  }),
});

/** Newest-first videos from a channel feed's XML, or null if it is not that feed. */
export function parseChannelFeed(xml: string): VideoInfo[] | null {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch {
    return null;
  }
  const result = channelFeedSchema.safeParse(parsed);
  if (!result.success) return null;
  return result.data.feed.entry.map((entry) => ({
    id: entry['yt:videoId'],
    title: entry.title === undefined ? null : String(entry.title),
    publishedAt: entry.published ?? null,
    live: null,
    liveStartedAt: null,
    embeddable: null,
  }));
}

// Measured on 2026-11-16: this YouTube feed server often answers 404 or 500
// for channels that exist, then 200 a moment later. So a failure is tried
// again a few times, and even then it only ever means "could not tell".
const FEED_TRIES = 3;
const FEED_PAUSE_MS = 2_000;

export async function fetchChannelFeed(channelId: string): Promise<Answer<VideoInfo[]>> {
  const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  let note = 'not checked';
  for (let attempt = 1; attempt <= FEED_TRIES; attempt += 1) {
    if (attempt > 1) await new Promise((resolve) => setTimeout(resolve, FEED_PAUSE_MS * (attempt - 1)));
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        note = `channel feed HTTP ${response.status}`;
        continue;
      }
      const videos = parseChannelFeed(await response.text());
      if (videos === null) return { kind: 'error', note: 'channel feed not understood' };
      return { kind: 'ok', value: videos };
    } catch (error) {
      note = describeError(error);
    }
  }
  return { kind: 'error', note };
}

// ---- Without a key: oEmbed ----

// A real oEmbed answer has a title and the iframe code. Extra fields are ignored.
const oembedSchema = z.object({ title: z.string(), html: z.string() });

/**
 * Turns an oEmbed answer into "may it be embedded?". Pure: no network.
 * 200 = yes. 401/403 = the owner turned embedding off (or the video is
 * private). 400/404 = no such video.
 */
export function judgeOembed(httpStatus: number, body: unknown): Answer<{ embeddable: boolean; title: string | null }> {
  if (httpStatus === 200) {
    const parsed = oembedSchema.safeParse(body);
    return parsed.success
      ? { kind: 'ok', value: { embeddable: true, title: parsed.data.title } }
      : { kind: 'error', note: 'oEmbed answer not understood' };
  }
  if (httpStatus === 401 || httpStatus === 403) return { kind: 'ok', value: { embeddable: false, title: null } };
  if (httpStatus === 400 || httpStatus === 404) return { kind: 'missing' };
  return { kind: 'error', note: `oEmbed HTTP ${httpStatus}` };
}

export async function fetchOembed(videoId: string): Promise<Answer<{ embeddable: boolean; title: string | null }>> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // A failed answer may not be JSON, so reading it must not throw.
    const body: unknown = await response.json().catch(() => null);
    return judgeOembed(response.status, body);
  } catch (error) {
    return { kind: 'error', note: describeError(error) };
  }
}
