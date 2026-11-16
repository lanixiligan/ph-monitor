// Checks one news feed (RSS or Atom): does it answer, is it a feed, is it fresh?

import { XMLParser } from 'fast-xml-parser';
import type { SourceStatus } from '@ph-monitor/shared';
import { z } from 'zod';
import { describeError } from './youtube.ts';

const STALE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What the checker learned about one feed. */
export type FeedResult = { status: SourceStatus; isStale: boolean; note: string | null };

// `isArray` makes a single <item> or <entry> still arrive as a list.
const xmlParser = new XMLParser({ isArray: (name) => name === 'item' || name === 'entry' });

// RSS keeps stories in rss.channel.item, Atom in feed.entry. Each story's
// date is under one of a few names, so the dates are read loosely.
const storySchema = z.object({
  pubDate: z.string().optional(),
  'dc:date': z.string().optional(),
  updated: z.string().optional(),
  published: z.string().optional(),
});
const rssSchema = z.object({ rss: z.object({ channel: z.object({ item: z.array(storySchema).default([]) }) }) });
const atomSchema = z.object({ feed: z.object({ entry: z.array(storySchema).default([]) }) });

type Story = z.infer<typeof storySchema>;

function findStories(xml: string): Story[] | null {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml);
  } catch {
    return null;
  }
  const rss = rssSchema.safeParse(parsed);
  if (rss.success) return rss.data.rss.channel.item;
  const atom = atomSchema.safeParse(parsed);
  if (atom.success) return atom.data.feed.entry;
  return null;
}

/**
 * Decides the status of a feed from what the network returned. Pure: no
 * network, so it can be tested. `now` is passed in for the same reason.
 */
export function judgeFeed(httpStatus: number, body: string, now: Date): FeedResult {
  if (httpStatus < 200 || httpStatus >= 300) {
    return { status: 'dead', isStale: false, note: `HTTP ${httpStatus}` };
  }
  const stories = findStories(body);
  if (stories === null) return { status: 'dead', isStale: false, note: 'not RSS' };
  if (stories.length === 0) return { status: 'dead', isStale: false, note: 'feed has no items' };

  const times = stories
    .map((story) => story.pubDate ?? story['dc:date'] ?? story.updated ?? story.published)
    .map((text) => (text === undefined ? NaN : Date.parse(text)))
    .filter((time) => !Number.isNaN(time));
  if (times.length === 0) return { status: 'ok', isStale: false, note: 'items have no dates' };

  const days = Math.floor((now.getTime() - Math.max(...times)) / DAY_MS);
  if (days >= STALE_DAYS) {
    return { status: 'ok', isStale: true, note: `nothing new for ${days} days` };
  }
  return { status: 'ok', isStale: false, note: null };
}

/** Downloads a feed (20 second limit) and judges it. Never throws. */
export async function checkFeed(url: string): Promise<FeedResult> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ph-monitor-linkcheck/0.1', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(20_000),
    });
    return judgeFeed(response.status, await response.text(), new Date());
  } catch (error) {
    return { status: 'dead', isStale: false, note: describeError(error) };
  }
}
