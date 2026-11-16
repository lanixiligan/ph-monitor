// Job: check every news feed and live stream link in sources.ts and record
// the result in the `sources` table. Run by hand with: npm run check:sources

import type { SourceStatus } from '@ph-monitor/shared';
import { checkFeed } from '../checker/checkFeed.ts';
import { checkStream, settleUnknown } from '../checker/checkStream.ts';
import type { PreviousRow } from '../checker/checkStream.ts';
import { config } from '../config.ts';
import { pool } from '../db.ts';
import { NEWS_FEEDS, STREAM_SLOTS } from '../sources.ts';

// How many links are checked at the same time. Small, to be polite.
const AT_A_TIME = 4;

// One row of the `sources` table, as we write it.
type Row = {
  id: string;
  kind: 'feed' | 'stream';
  outlet: string;
  category: string;
  url: string;
  status: SourceStatus;
  isStale: boolean;
  videoId: string | null;
  note: string | null;
  isLive: boolean | null;
  // Streams only: the video's title and upload time, and since when checks get no answer.
  videoTitle: string | null;
  videoPublishedAt: string | null;
  failingSince: Date | null;
};

// Runs `work` on every item, but never more than `limit` at once.
// `<T, R>` is a generic: "any type T in, any type R out".
async function inBatches<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// Saves one row. last_ok_at is set when a check just confirmed the link works
// ('ok' or 'not-live', and not a kept status from a failed check); otherwise
// the old value is kept, so we always know when it last worked.
async function saveRow(row: Row): Promise<void> {
  const works = (row.status === 'ok' || row.status === 'not-live') && row.failingSince === null;
  await pool.query(
    `INSERT INTO sources
       (id, kind, outlet, category, url, status, is_stale, video_id, note, last_checked_at, last_ok_at, is_live,
        video_title, video_published_at, failing_since)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), CASE WHEN $10 THEN now() END, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       kind = EXCLUDED.kind,
       outlet = EXCLUDED.outlet,
       category = EXCLUDED.category,
       url = EXCLUDED.url,
       status = EXCLUDED.status,
       is_stale = EXCLUDED.is_stale,
       video_id = EXCLUDED.video_id,
       note = EXCLUDED.note,
       last_checked_at = EXCLUDED.last_checked_at,
       last_ok_at = COALESCE(EXCLUDED.last_ok_at, sources.last_ok_at),
       is_live = EXCLUDED.is_live,
       video_title = EXCLUDED.video_title,
       video_published_at = EXCLUDED.video_published_at,
       failing_since = EXCLUDED.failing_since`,
    [
      row.id, row.kind, row.outlet, row.category, row.url, row.status,
      row.isStale, row.videoId, row.note, works, row.isLive,
      row.videoTitle, row.videoPublishedAt, row.failingSince,
    ],
  );
}

// A broken link must never stop the others, so every check is wrapped.
async function safely(row: () => Promise<Row>, fallback: Row): Promise<Row> {
  try {
    return await row();
  } catch (error) {
    return { ...fallback, status: 'dead', note: error instanceof Error ? error.message : 'check failed' };
  }
}

export async function checkFeeds(): Promise<void> {
  await inBatches(NEWS_FEEDS, AT_A_TIME, async (feed) => {
    const base: Row = {
      id: feed.id, kind: 'feed', outlet: feed.outlet, category: feed.category, url: feed.url,
      status: 'dead', isStale: false, videoId: null, note: null, isLive: null,
      videoTitle: null, videoPublishedAt: null, failingSince: null,
    };
    const row = await safely(async () => {
      const result = await checkFeed(feed.url);
      return { ...base, status: result.status, isStale: result.isStale, note: result.note };
    }, base);
    await saveRow(row);
  });
}

// What the table holds for one stream slot from the last check, if anything.
async function readPrevious(id: string): Promise<PreviousRow | null> {
  const result = await pool.query<{
    status: SourceStatus;
    video_id: string | null;
    video_title: string | null;
    video_published_at: Date | null;
    failing_since: Date | null;
  }>(
    `SELECT status, video_id, video_title, video_published_at, failing_since
     FROM sources WHERE id = $1 AND kind = 'stream'`,
    [id],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    status: row.status,
    videoId: row.video_id,
    title: row.video_title,
    publishedAt: row.video_published_at?.toISOString() ?? null,
    failingSince: row.failing_since,
  };
}

export async function checkStreams(): Promise<void> {
  const now = new Date();
  await inBatches(STREAM_SLOTS, AT_A_TIME, async (slot) => {
    const base: Row = {
      id: slot.id, kind: 'stream', outlet: slot.outlet, category: slot.category,
      url: 'https://www.youtube.com', status: 'dead', isStale: false, videoId: null, note: null, isLive: null,
      videoTitle: null, videoPublishedAt: null, failingSince: null,
    };
    const row = await safely(async () => {
      const previous = await readPrevious(slot.id);
      const result = await checkStream(slot, config.youtubeApiKey, previous?.videoId ?? null);

      // "Could not find out" keeps the last status for up to a day.
      let failingSince: Date | null = null;
      let outcome = result;
      if (result.status === 'unknown') {
        const settled = settleUnknown(result, previous, now);
        outcome = settled.outcome;
        failingSince = settled.failingSince;
      }
      // After settleUnknown the status can no longer be 'unknown'; this line
      // is here so TypeScript knows it too.
      if (outcome.status === 'unknown') throw new Error('unsettled check');

      return {
        ...base, url: outcome.url, status: outcome.status, videoId: outcome.videoId,
        isLive: outcome.isLive, note: outcome.note,
        videoTitle: outcome.title, videoPublishedAt: outcome.publishedAt, failingSince,
      };
    }, base);
    await saveRow(row);
  });
  console.log(
    `Streams: checked ${STREAM_SLOTS.length} slots ${config.youtubeApiKey ? 'with' : 'without'} a YouTube key.`,
  );
}

// Removes rows for links that are no longer listed in sources.ts.
async function removeOldRows(): Promise<void> {
  const ids = [...NEWS_FEEDS.map((feed) => feed.id), ...STREAM_SLOTS.map((slot) => slot.id)];
  await pool.query('DELETE FROM sources WHERE id <> ALL($1::text[])', [ids]);
}

export async function checkSources(): Promise<void> {
  await checkFeeds();
  await checkStreams();
  await removeOldRows();
  console.log(`Sources: checked ${NEWS_FEEDS.length} feeds and ${STREAM_SLOTS.length} streams.`);
}
