// Job: read the news feeds, keep headlines about disasters, tag the provinces
// they name, merge the same story from different outlets, and save them.
// Only headline, outlet, category, time and link are stored (never the text).

import type { NewsOutletLink, OutletCategory } from '@ph-monitor/shared';
import { pool } from '../db.ts';
import { fetchFeed, type FeedItem } from '../fetchers/rss.ts';
import { isDisasterHeadline } from '../news/keywords.ts';
import { outletFor, outletKey } from '../news/outlets.ts';
import { isSameStory, storyKey } from '../news/storyKey.ts';
import { tagProvinces } from '../news/tagProvinces.ts';
import { NEWS_FEEDS } from '../sources.ts';

const KEEP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
// Rows this recent are compared with new headlines. Feeds carry at most
// 3 days of items and the story window is 2 days, so 6 days is enough.
const COMPARE_DAYS = 6;

// A headline that passed every check, ready to be merged or saved.
type Candidate = {
  title: string;
  url: string;
  outlet: string;
  category: OutletCategory;
  publishedAt: Date;
  provincePsgcs: number[];
};

// A row already in the `news` table.
type SavedStory = Candidate & {
  id: number;
  storyKey: string;
  otherOutlets: NewsOutletLink[];
};

// Names the same outlet however it is written ("Inquirer" = "Inquirer.net").
function sameOutlet(a: string, b: string): boolean {
  return outletKey(a) === outletKey(b);
}

// True if this outlet or link is already on the story.
function alreadyListed(story: SavedStory, candidate: Candidate): boolean {
  return (
    story.url === candidate.url ||
    sameOutlet(story.outlet, candidate.outlet) ||
    story.otherOutlets.some((other) => other.url === candidate.url || sameOutlet(other.outlet, candidate.outlet))
  );
}

export async function ingestNews(): Promise<void> {
  const provinceRows = await pool.query<{ psgc: number; name: string }>('SELECT psgc, name FROM provinces');

  // 1. Read every feed. One failing feed is logged and the others go on.
  const candidates: Candidate[] = [];
  const seenUrls = new Set<string>();
  let feedsOk = 0;
  let feedsFailed = 0;
  let itemsRead = 0;
  let itemsDropped = 0; // bad, too old, future-dated, or no usable outlet
  let disasterItems = 0;

  for (const feed of NEWS_FEEDS) {
    let items: FeedItem[];
    try {
      const result = await fetchFeed(feed.url);
      items = result.items;
      itemsRead += result.items.length + result.skipped + result.dropped;
      itemsDropped += result.skipped + result.dropped;
      feedsOk += 1;
    } catch (error) {
      feedsFailed += 1;
      console.warn(`News: feed "${feed.id}" failed: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    for (const item of items) {
      const outlet = outletFor(feed, item.outlet);
      if (!outlet) {
        itemsDropped += 1;
        continue;
      }
      if (!isDisasterHeadline(item.title)) continue;
      // The same link can come from two feeds (for example PhilStar's two).
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      disasterItems += 1;
      candidates.push({
        title: item.title,
        url: item.url,
        outlet: outlet.outlet,
        category: outlet.category,
        publishedAt: item.publishedAt,
        provincePsgcs: tagProvinces(item.title, provinceRows.rows),
      });
    }
  }

  if (feedsOk === 0) {
    throw new Error('Every news feed failed.');
  }

  // Oldest first, so the earliest report of a story becomes its main row.
  candidates.sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

  // 2. Merge with what is already saved, and save. One transaction: all or nothing.
  const client = await pool.connect();
  let newRows = 0;
  let merged = 0;
  let unchanged = 0;
  let removed = 0;
  try {
    await client.query('BEGIN');

    const saved = await client.query(
      `SELECT id, story_key, title, url, outlet, category, published_at, province_psgcs, other_outlets
       FROM news WHERE published_at >= $1`,
      [new Date(Date.now() - COMPARE_DAYS * DAY_MS)],
    );
    const stories: SavedStory[] = saved.rows.map((row) => ({
      id: row.id,
      storyKey: row.story_key,
      title: row.title,
      url: row.url,
      outlet: row.outlet,
      category: row.category,
      publishedAt: row.published_at,
      // BIGINT arrays arrive as text, so turn them into numbers.
      provincePsgcs: (row.province_psgcs as string[]).map(Number),
      otherOutlets: row.other_outlets,
    }));

    for (const candidate of candidates) {
      const key = storyKey(candidate.title);
      // The same key, or very similar words within two days, is the same story.
      const match = stories.find((story) => story.storyKey === key || isSameStory(story, candidate));

      if (match) {
        if (alreadyListed(match, candidate)) {
          unchanged += 1;
          continue;
        }
        match.otherOutlets.push({ outlet: candidate.outlet, category: candidate.category, url: candidate.url });
        await client.query('UPDATE news SET other_outlets = $2::jsonb WHERE id = $1', [
          match.id,
          JSON.stringify(match.otherOutlets),
        ]);
        merged += 1;
        continue;
      }

      const inserted = await client.query(
        `INSERT INTO news (story_key, title, url, outlet, category, published_at, province_psgcs)
         VALUES ($1, $2, $3, $4, $5, $6, $7::bigint[])
         ON CONFLICT (story_key) DO NOTHING
         RETURNING id`,
        [key, candidate.title, candidate.url, candidate.outlet, candidate.category, candidate.publishedAt, candidate.provincePsgcs],
      );
      // No row back means an old row (past the compare window) has this exact key.
      if (inserted.rows[0] === undefined) {
        unchanged += 1;
        continue;
      }
      stories.push({ ...candidate, id: inserted.rows[0].id, storyKey: key, otherOutlets: [] });
      newRows += 1;
    }

    // Old headlines are not useful; keep two weeks.
    const old = await client.query('DELETE FROM news WHERE published_at < $1', [new Date(Date.now() - KEEP_DAYS * DAY_MS)]);
    removed = old.rowCount ?? 0;

    await client.query(
      `INSERT INTO fetch_runs (source, last_ok_at) VALUES ('news', now())
       ON CONFLICT (source) DO UPDATE SET last_ok_at = EXCLUDED.last_ok_at`,
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(
    `News: feeds ok ${feedsOk}, failed ${feedsFailed}; items read ${itemsRead}, skipped ${itemsDropped}; ` +
      `disaster ${disasterItems}; new ${newRows}, merged ${merged}, already saved ${unchanged}, removed old ${removed}.`,
  );
}
