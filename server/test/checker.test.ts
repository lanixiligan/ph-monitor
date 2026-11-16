// Checks the link checker's decisions: feeds and live streams.
// Run with: npm test
// No network or database is used. The fixtures are copied from real answers
// (a YouTube oEmbed answer, a trimmed channel feed, trimmed YouTube Data API
// answers, a trimmed RSS feed).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { judgeFeed } from '../src/checker/checkFeed.ts';
import {
  decideStream,
  judgeWithKey,
  judgeWithoutKey,
  pickVideo,
  settleUnknown,
} from '../src/checker/checkStream.ts';
import type { LinkOutcome, PreviousRow } from '../src/checker/checkStream.ts';
import { judgeOembed, parseChannelFeed, parsePlaylistItems, parseVideosList } from '../src/checker/youtube.ts';
import type { VideoInfo } from '../src/checker/youtube.ts';

// Reads a fixture file next to this test.
function fixture(name: string): string {
  return readFileSync(new URL(`./fixtures/checker/${name}`, import.meta.url), 'utf8');
}

const oembedOk: unknown = JSON.parse(fixture('oembed-ok.json'));
const channelFeed = fixture('channel-feed.xml');
const rssFeed = fixture('rss-feed.xml');
const playlistItems: unknown = JSON.parse(fixture('playlist-items.json'));
const videosList: unknown = JSON.parse(fixture('videos-list.json'));

// The newest story in rss-feed.xml is from 2026-11-16 04:00 UTC.
const freshNow = new Date('2026-11-16T06:00:00Z');

// ---- Feeds ----

test('feed: a recent RSS feed is ok and not stale', () => {
  assert.deepEqual(judgeFeed(200, rssFeed, freshNow), { status: 'ok', isStale: false, note: null });
});

test('feed: an old feed is ok but stale, with the number of days', () => {
  const result = judgeFeed(200, rssFeed, new Date('2026-11-25T06:00:00Z'));
  assert.equal(result.status, 'ok');
  assert.equal(result.isStale, true);
  assert.equal(result.note, 'nothing new for 9 days');
});

test('feed: 6 days old is not yet stale', () => {
  assert.equal(judgeFeed(200, rssFeed, new Date('2026-11-22T06:00:00Z')).isStale, false);
});

test('feed: an Atom feed works too', () => {
  const result = judgeFeed(200, channelFeed, freshNow);
  assert.equal(result.status, 'ok');
  assert.equal(result.isStale, false);
});

test('feed: an HTTP error is dead and says which', () => {
  assert.deepEqual(judgeFeed(404, 'Not found', freshNow), { status: 'dead', isStale: false, note: 'HTTP 404' });
});

test('feed: a web page that is not a feed is dead', () => {
  const result = judgeFeed(200, '<html><body>Hello</body></html>', freshNow);
  assert.equal(result.status, 'dead');
  assert.equal(result.note, 'not RSS');
});

test('feed: a feed with no items is dead', () => {
  const result = judgeFeed(200, '<rss version="2.0"><channel><title>x</title></channel></rss>', freshNow);
  assert.equal(result.status, 'dead');
  assert.equal(result.note, 'feed has no items');
});

// ---- YouTube answers ----

test('oEmbed: 200 with the expected JSON is embeddable, with the title', () => {
  const answer = judgeOembed(200, oembedOk);
  assert.equal(answer.kind, 'ok');
  // `answer.kind === 'ok' &&` lets TypeScript know `value` exists.
  assert.ok(answer.kind === 'ok' && answer.value.embeddable && answer.value.title !== null);
});

test('oEmbed: 200 with something else is an error, not a pass', () => {
  assert.equal(judgeOembed(200, { hello: 1 }).kind, 'error');
});

test('oEmbed: 401 and 403 mean embedding is off; 400 and 404 mean missing', () => {
  assert.deepEqual(judgeOembed(401, null), { kind: 'ok', value: { embeddable: false, title: null } });
  assert.deepEqual(judgeOembed(403, null), { kind: 'ok', value: { embeddable: false, title: null } });
  assert.equal(judgeOembed(404, null).kind, 'missing');
  assert.equal(judgeOembed(400, null).kind, 'missing');
  assert.equal(judgeOembed(500, null).kind, 'error');
});

test('channel feed: videos come out newest first, with title and upload time', () => {
  const videos = parseChannelFeed(channelFeed);
  assert.equal(videos?.length, 3);
  assert.equal(videos?.[0]?.id, 'VCJ-P9LKb_g');
  assert.equal(videos?.[0]?.publishedAt, '2026-11-16T04:00:08+00:00');
  assert.ok(videos?.[0]?.title?.includes('GMA News Feed'));
  assert.equal(videos?.[0]?.live, null);
});

test('channel feed: an error page is not a feed', () => {
  assert.equal(parseChannelFeed('<html><title>Error 404</title></html>'), null);
});

test('uploads list: a real answer gives the video ids, newest first', () => {
  assert.deepEqual(parsePlaylistItems(playlistItems), ['6csg_AQ5VJM', 'Jv7L3w7M6aI', '0T48ELXvOa8']);
  assert.equal(parsePlaylistItems({ error: { code: 403 } }), null);
});

test('videos list: a real answer gives title, time, live state and embeddable', () => {
  const videos = parseVideosList(videosList);
  assert.equal(videos?.length, 4);
  const live = videos?.find((video) => video.id === '6csg_AQ5VJM');
  assert.equal(live?.live, 'live');
  assert.equal(live?.liveStartedAt, '2026-11-16T05:15:10Z');
  assert.equal(live?.embeddable, true);
  assert.equal(videos?.find((video) => video.id === 'Yc3PuoXV2Es')?.live, 'upcoming');
  assert.equal(parseVideosList({ items: [{ id: 'x' }] }), null);
});

// ---- Picking the video (with a key) ----

// A small helper to build a video; `Partial<VideoInfo>` means "any of VideoInfo's fields".
function video(id: string, fields: Partial<VideoInfo>): VideoInfo {
  return { id, title: id, publishedAt: '2026-11-16T00:00:00Z', live: 'none', liveStartedAt: null, embeddable: true, ...fields };
}
const channelUrl = 'https://www.youtube.com/channel/UCexample';

test('pick: a live video beats a newer ordinary one', () => {
  const videos = [video('new', { publishedAt: '2026-11-16T05:00:00Z' }), video('live', { live: 'live', liveStartedAt: '2026-11-16T01:00:00Z' })];
  assert.equal(pickVideo(videos, null)?.id, 'live');
});

test('pick: of two live videos, the one on air longest wins', () => {
  const videos = [
    video('premiere', { live: 'live', liveStartedAt: '2026-11-16T05:15:00Z' }),
    video('broadcast', { live: 'live', liveStartedAt: '2026-11-15T15:00:00Z' }),
  ];
  assert.equal(pickVideo(videos, null)?.id, 'broadcast');
});

test('pick: the stream shown last time is kept while it is still live', () => {
  const videos = [
    video('older', { live: 'live', liveStartedAt: '2026-11-15T15:00:00Z' }),
    video('shown', { live: 'live', liveStartedAt: '2026-11-16T03:00:00Z' }),
  ];
  assert.equal(pickVideo(videos, 'shown')?.id, 'shown');
});

test('pick: nothing live gives the newest ordinary video, never a scheduled one', () => {
  const videos = [
    video('scheduled', { live: 'upcoming', publishedAt: '2026-11-16T06:00:00Z' }),
    video('old', { publishedAt: '2026-11-15T00:00:00Z' }),
    video('newest', { publishedAt: '2026-11-16T04:00:00Z' }),
  ];
  assert.equal(pickVideo(videos, null)?.id, 'newest');
});

test('pick: a video with embedding turned off is never picked', () => {
  const videos = [video('locked', { live: 'live', embeddable: false }), video('open', {})];
  assert.equal(pickVideo(videos, null)?.id, 'open');
});

// ---- Streams, with a key ----

test('stream with key: a live channel is ok, LIVE, with title and time', () => {
  const videos = parseVideosList(videosList) ?? [];
  const outcome = judgeWithKey(channelUrl, { kind: 'ok', value: videos }, null);
  assert.equal(outcome.status, 'ok');
  assert.equal(outcome.isLive, true);
  assert.equal(outcome.videoId, '6csg_AQ5VJM');
  assert.equal(outcome.publishedAt, '2026-11-16T05:15:10Z');
  assert.ok(outcome.title);
});

test('stream with key: nothing live is not-live and shows the latest video', () => {
  const outcome = judgeWithKey(channelUrl, { kind: 'ok', value: [video('a', {}), video('b', { publishedAt: '2026-11-16T03:00:00Z' })] }, null);
  assert.equal(outcome.status, 'not-live');
  assert.equal(outcome.isLive, false);
  assert.equal(outcome.videoId, 'b');
});

test('stream with key: YouTube saying "not found" is dead at once', () => {
  assert.equal(judgeWithKey(channelUrl, { kind: 'missing' }, null).status, 'dead');
});

test('stream with key: a failed call is unknown, not dead', () => {
  const outcome = judgeWithKey(channelUrl, { kind: 'error', note: 'YouTube API HTTP 403' }, null);
  assert.equal(outcome.status, 'unknown');
  assert.equal(outcome.note, 'YouTube API HTTP 403');
});

test('stream with key: every video locked is not-embeddable', () => {
  const outcome = judgeWithKey(channelUrl, { kind: 'ok', value: [video('a', { embeddable: false })] }, null);
  assert.equal(outcome.status, 'not-embeddable');
});

// ---- Streams, without a key ----

const feedOk = { kind: 'ok', value: [video('new1', { live: null, embeddable: null }), video('old2', {})] } as const;
const embedOk = { kind: 'ok', value: { embeddable: true, title: 'From oEmbed' } } as const;

test('stream without key: embeddable is ok, live unknown, newest video', () => {
  const outcome = judgeWithoutKey(channelUrl, { kind: 'ok', value: [...feedOk.value] }, embedOk);
  assert.equal(outcome.status, 'ok');
  assert.equal(outcome.isLive, null);
  assert.equal(outcome.videoId, 'new1');
});

test('stream without key: a failed channel feed is unknown, never dead', () => {
  const outcome = judgeWithoutKey(channelUrl, { kind: 'error', note: 'channel feed HTTP 404' }, null);
  assert.equal(outcome.status, 'unknown');
  assert.equal(outcome.note, 'channel feed HTTP 404');
});

test('stream without key: embedding switched off is not-embeddable', () => {
  const locked = { kind: 'ok', value: { embeddable: false, title: null } } as const;
  assert.equal(judgeWithoutKey(channelUrl, { kind: 'ok', value: [...feedOk.value] }, locked).status, 'not-embeddable');
});

test('stream without key: a missing video is dead; an empty channel is dead', () => {
  assert.equal(judgeWithoutKey('u', { kind: 'ok', value: [...feedOk.value] }, { kind: 'missing' }).status, 'dead');
  assert.equal(judgeWithoutKey('u', { kind: 'ok', value: [] }, null).status, 'dead');
});

// ---- A failed check keeps the last status for a day ----

const now = new Date('2026-11-16T12:00:00Z');
const unknown: LinkOutcome = { url: 'u', status: 'unknown', videoId: null, title: null, publishedAt: null, isLive: null, note: 'timeout' };
const lastGood: PreviousRow = { status: 'ok', videoId: 'vid', title: 'Title', publishedAt: '2026-11-16T00:00:00Z', failingSince: null };

test('failed check: the first failure keeps the last status and video, but not "live"', () => {
  const settled = settleUnknown(unknown, lastGood, now);
  assert.equal(settled.outcome.status, 'ok');
  assert.equal(settled.outcome.videoId, 'vid');
  assert.equal(settled.outcome.isLive, null);
  assert.deepEqual(settled.failingSince, now);
});

test('failed check: 23 hours of failures still keeps the last status', () => {
  const since = new Date('2026-11-15T13:00:00Z');
  const settled = settleUnknown(unknown, { ...lastGood, failingSince: since }, now);
  assert.equal(settled.outcome.status, 'ok');
  assert.deepEqual(settled.failingSince, since);
});

test('failed check: a full day of failures is dead', () => {
  const since = new Date('2026-11-15T12:00:00Z');
  const settled = settleUnknown(unknown, { ...lastGood, failingSince: since }, now);
  assert.equal(settled.outcome.status, 'dead');
  assert.equal(settled.outcome.videoId, null);
});

test('failed check: a link that never worked has nothing to show yet', () => {
  const settled = settleUnknown(unknown, null, now);
  assert.equal(settled.outcome.status, 'dead');
  assert.ok(settled.outcome.note?.startsWith('not confirmed yet'));
});

// ---- Choosing between a slot's links ----

function outcome(url: string, status: LinkOutcome['status'], videoId: string | null): LinkOutcome {
  return { url, status, videoId, title: null, publishedAt: null, isLive: null, note: status === 'dead' ? 'why' : null };
}

test('stream slot: the backup link is used when the first is dead', () => {
  const result = decideStream([outcome('first', 'dead', null), outcome('backup', 'ok', 'vid')]);
  assert.equal(result.url, 'backup');
  assert.equal(result.status, 'ok');
  assert.equal(result.videoId, 'vid');
});

test('stream slot: an ok link beats a not-live one', () => {
  const result = decideStream([outcome('first', 'not-live', 'a'), outcome('backup', 'ok', 'b')]);
  assert.equal(result.url, 'backup');
});

test('stream slot: unknown beats dead, so one bad answer cannot kill the slot', () => {
  const result = decideStream([outcome('first', 'unknown', null), outcome('backup', 'dead', null)]);
  assert.equal(result.status, 'unknown');
});

test('stream slot: all dead gives dead with the first link and every reason', () => {
  const result = decideStream([outcome('first', 'dead', null), outcome('backup', 'dead', null)]);
  assert.equal(result.status, 'dead');
  assert.equal(result.url, 'first');
  assert.equal(result.note, 'why; why');
});

test('stream slot: dead plus not-embeddable gives not-embeddable', () => {
  const result = decideStream([outcome('first', 'dead', null), outcome('backup', 'not-embeddable', 'v')]);
  assert.equal(result.status, 'not-embeddable');
  assert.equal(result.url, 'backup');
});
