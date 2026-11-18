// Checks one live-stream slot and decides what the page may show for it:
// the live stream when the channel is live ("LIVE"), otherwise its latest
// video ("Latest").
//
// With a YouTube key, per channel link:
//   live streams list (1 unit) + uploads list (1 unit)
//   -> details of up to 50 of those videos (1 unit) -> pick one (live first)
// Without a key, per channel link:
//   channel video feed -> oEmbed on the newest video
//   (that feed fails at random, so a failure means "unknown", never "dead")
//
// An "unknown" answer keeps the slot's last status. Only after a full day of
// unknown answers is the link marked dead (see settleUnknown).
//
// YouTube quota, with a key (the free daily quota is 10,000 units):
//   one channel link costs 3 units per check (three 1-unit calls).
//   12 slots, main link only:            12 x 3 = 36 units per check
//   worst case, the 1 backup link too:   13 x 3 = 39 units per check
//   scheduled, every 30 minutes = 48 checks a day: 48 x 39 = 1,872 units.
//   Refresh button and page loads: at most one check every 10 minutes
//   (jobs/streamRefresh.ts) = 144 more a day: 144 x 39 = 5,616 units.
//   Worst case 7,488 units a day (about 75% of the quota); usually far less.

import type { SourceStatus } from '@ph-monitor/shared';
import type { StreamLink, StreamSlotConfig } from '../sources.ts';
import { fetchChannelFeed, fetchLiveStreams, fetchOembed, fetchUploads, fetchVideos, MAX_IDS } from './youtube.ts';
import type { Answer, VideoInfo } from './youtube.ts';

/** A link is given up on after this long without a single answer. */
export const DEAD_AFTER_HOURS = 24;

/** What the checker learned about one link. 'unknown' = could not find out this time. */
export type LinkOutcome = {
  url: string;
  status: SourceStatus | 'unknown';
  videoId: string | null;
  title: string | null;
  publishedAt: string | null;
  /** true = live, false = not live, null = unknown. */
  isLive: boolean | null;
  note: string | null;
};

function noVideo(url: string, status: 'dead' | 'unknown' | 'not-embeddable', note: string): LinkOutcome {
  return { url, status, videoId: null, title: null, publishedAt: null, isLive: null, note };
}

/**
 * Picks the video to show from a channel's videos (with a key).
 * A live one wins: the one shown last time if it is still live, otherwise
 * the one that has been on air longest (a long broadcast, not a short
 * premiere clip). If nothing is live: the newest ordinary video.
 * Scheduled ("upcoming") and non-embeddable videos are never picked.
 */
export function pickVideo(videos: VideoInfo[], rememberedId: string | null): VideoInfo | null {
  const usable = videos.filter((video) => video.embeddable === true);

  const live = usable.filter((video) => video.live === 'live');
  const remembered = live.find((video) => video.id === rememberedId);
  if (remembered) return remembered;
  // ISO times sort correctly as plain text; an unknown start time goes last.
  const byStart = [...live].sort((a, b) => (a.liveStartedAt ?? '9').localeCompare(b.liveStartedAt ?? '9'));
  if (byStart[0]) return byStart[0];

  const ordinary = usable.filter((video) => video.live === 'none');
  const newestFirst = [...ordinary].sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  return newestFirst[0] ?? null;
}

/** Judges one link from the Data API's answers (with a key). Pure: no network. */
export function judgeWithKey(url: string, videos: Answer<VideoInfo[]>, rememberedId: string | null): LinkOutcome {
  if (videos.kind === 'missing') return noVideo(url, 'dead', 'YouTube says it does not exist');
  if (videos.kind === 'error') return noVideo(url, 'unknown', videos.note);
  if (videos.value.length === 0) return noVideo(url, 'dead', 'no videos found');

  const picked = pickVideo(videos.value, rememberedId);
  if (picked === null) {
    const anyEmbeddable = videos.value.some((video) => video.embeddable === true);
    return anyEmbeddable
      ? noVideo(url, 'unknown', 'only scheduled videos right now')
      : noVideo(url, 'not-embeddable', 'embedding is turned off');
  }
  const isLive = picked.live === 'live';
  return {
    url,
    status: isLive ? 'ok' : 'not-live',
    videoId: picked.id,
    title: picked.title,
    publishedAt: picked.publishedAt,
    isLive,
    note: isLive ? null : 'not live right now; showing the latest video',
  };
}

/**
 * Judges one link without a key. Pure: no network.
 * `feed`: the channel's videos, newest first. `embed`: oEmbed's answer for
 * the newest one (null if we never got that far).
 */
export function judgeWithoutKey(
  url: string,
  feed: Answer<VideoInfo[]>,
  embed: Answer<{ embeddable: boolean; title: string | null }> | null,
): LinkOutcome {
  // The channel feed fails at random, so even "missing" only means unknown.
  if (feed.kind !== 'ok') return noVideo(url, 'unknown', feed.kind === 'error' ? feed.note : 'channel feed not found');
  const newest = feed.value[0];
  if (!newest || embed === null) return noVideo(url, 'dead', 'no videos found');

  if (embed.kind === 'missing') return noVideo(url, 'dead', 'video not found');
  if (embed.kind === 'error') return noVideo(url, 'unknown', embed.note);
  if (!embed.value.embeddable) return noVideo(url, 'not-embeddable', 'embedding is turned off');

  return {
    url,
    status: 'ok',
    videoId: newest.id,
    title: newest.title ?? embed.value.title,
    publishedAt: newest.publishedAt,
    isLive: null,
    note: null,
  };
}

/**
 * Picks the winning link of a slot: the first 'ok', else the first
 * 'not-live', then 'not-embeddable', then 'unknown'. If every link is
 * dead, the answer shows the first link with all the reasons.
 */
export function decideStream(outcomes: LinkOutcome[]): LinkOutcome {
  const order: LinkOutcome['status'][] = ['ok', 'not-live', 'not-embeddable', 'unknown'];
  for (const status of order) {
    const winner = outcomes.find((outcome) => outcome.status === status);
    if (winner) return winner;
  }
  const notes = outcomes.map((outcome) => outcome.note ?? 'failed').join('; ');
  return noVideo(outcomes[0]?.url ?? '', 'dead', notes);
}

/** What the `sources` table held for a slot before this check. */
export type PreviousRow = {
  status: SourceStatus;
  videoId: string | null;
  title: string | null;
  publishedAt: string | null;
  /** Since when every check has been unknown; null = the last check got an answer. */
  failingSince: Date | null;
};

/** What to save for a slot, and since when it has been failing (null = it is not). */
export type Settled = { outcome: LinkOutcome & { status: SourceStatus }; failingSince: Date | null };

/**
 * Turns an 'unknown' check into something to save. Pure: no network, no clock.
 * - Less than a day of failures: keep the last status and video, but drop
 *   the live flag (we never say "live" unless a check just said so).
 * - A day or more: dead.
 * - Never checked successfully: dead for now (there is no video to show),
 *   and it recovers on the first good check.
 */
export function settleUnknown(unknown: LinkOutcome, previous: PreviousRow | null, now: Date): Settled {
  const failingSince = previous?.failingSince ?? now;
  const hours = (now.getTime() - failingSince.getTime()) / (60 * 60 * 1000);
  const why = unknown.note ?? 'no answer';

  if (previous === null || hours >= DEAD_AFTER_HOURS) {
    const note = previous === null ? `not confirmed yet: ${why}` : `no answer for a day: ${why}`;
    return { outcome: { ...noVideo(unknown.url, 'dead', note), status: 'dead' }, failingSince };
  }
  return {
    outcome: {
      url: unknown.url,
      status: previous.status,
      videoId: previous.videoId,
      title: previous.title,
      publishedAt: previous.publishedAt,
      isLive: null,
      note: `check failed, keeping the last status: ${why}`,
    },
    failingSince,
  };
}

function linkUrl(link: StreamLink): string {
  return 'channelId' in link
    ? `https://www.youtube.com/channel/${link.channelId}`
    : `https://www.youtube.com/watch?v=${link.videoId}`;
}

/** At most this many of the 50 ids come from the live streams list; the rest are uploads. */
const LIVE_ID_SHARE = 35;

/**
 * Which videos to ask about, 50 at most (one videos.list call). Pure.
 * First the video shown last time (so a long stream is never lost), then the
 * channel's newest live streams (where an on-air stream is found), then its
 * newest uploads (where the latest video is found if nothing is live).
 * A channel with few live streams leaves their room to uploads.
 */
export function idsToCheck(liveIds: string[], uploadIds: string[], rememberedId: string | null): string[] {
  const ids: string[] = rememberedId ? [rememberedId] : [];
  const add = (id: string) => {
    if (ids.length < MAX_IDS && !ids.includes(id)) ids.push(id);
  };
  liveIds.slice(0, LIVE_ID_SHARE).forEach(add);
  uploadIds.forEach(add);
  liveIds.slice(LIVE_ID_SHARE).forEach(add);
  return ids;
}

// With a key: the channel's live streams and newest uploads, then their details.
async function checkLinkWithKey(link: StreamLink, apiKey: string, rememberedId: string | null): Promise<LinkOutcome> {
  const url = linkUrl(link);
  let ids: string[];
  if ('channelId' in link) {
    // Both lists are asked for at the same time.
    const [live, uploads] = await Promise.all([
      fetchLiveStreams(link.channelId, apiKey),
      fetchUploads(link.channelId, apiKey),
    ]);
    if (uploads.kind !== 'ok') return judgeWithKey(url, uploads, rememberedId);
    // Without the live list we cannot tell "not live" from "missed it": unknown keeps the last status.
    if (live.kind !== 'ok') return noVideo(url, 'unknown', `live streams list: ${live.kind === 'error' ? live.note : 'missing'}`);
    ids = idsToCheck(live.value, uploads.value, rememberedId);
  } else {
    ids = [link.videoId];
  }
  if (ids.length === 0) return judgeWithKey(url, { kind: 'ok', value: [] }, rememberedId);
  return judgeWithKey(url, await fetchVideos(ids, apiKey), rememberedId);
}

async function checkLinkWithoutKey(link: StreamLink): Promise<LinkOutcome> {
  const url = linkUrl(link);
  const feed: Answer<VideoInfo[]> =
    'channelId' in link
      ? await fetchChannelFeed(link.channelId)
      : { kind: 'ok', value: [{ id: link.videoId, title: null, publishedAt: null, live: null, liveStartedAt: null, embeddable: null }] };
  const newest = feed.kind === 'ok' ? feed.value[0] : undefined;
  const embed = newest ? await fetchOembed(newest.id) : null;
  return judgeWithoutKey(url, feed, embed);
}

/**
 * Checks every link of a slot in order, stopping at the first 'ok'. Never throws.
 * `rememberedId`: the video this slot showed after the last check, if any.
 */
export async function checkStream(
  slot: StreamSlotConfig,
  apiKey: string | null,
  rememberedId: string | null,
): Promise<LinkOutcome> {
  const outcomes: LinkOutcome[] = [];
  for (const link of slot.links) {
    try {
      outcomes.push(apiKey ? await checkLinkWithKey(link, apiKey, rememberedId) : await checkLinkWithoutKey(link));
    } catch {
      outcomes.push(noVideo(linkUrl(link), 'unknown', 'check failed'));
    }
    if (outcomes[outcomes.length - 1]?.status === 'ok') break;
  }
  return decideStream(outcomes);
}
