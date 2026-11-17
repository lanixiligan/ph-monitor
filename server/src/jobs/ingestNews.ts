// Job: read the news feeds, keep headlines about natural disasters, note
// which kinds (typhoon, flood...) and which provinces they name, merge the
// same story from different outlets, and save them. Saved headlines from the
// last few days are checked again with the current rules.
// Only headline, outlet, category, time and link are stored (never the text).

import type { NewsOutletLink, NewsType, OutletCategory } from '@ph-monitor/shared';
import { pool } from '../db.ts';
import { fetchFeed, type FeedItem } from '../fetchers/rss.ts';
import { checkHeadline } from '../news/checkHeadline.ts';
import type { NewsContext } from '../news/checkHeadline.ts';
import type { StormName } from '../news/keywords.ts';
import { outletFor, outletKey } from '../news/outlets.ts';
import { stormNamesFromAlerts } from '../news/stormNames.ts';
import { isSameStory, storyKey } from '../news/storyKey.ts';
import { NEWS_FEEDS } from '../sources.ts';

const KEEP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
// Rows this recent are compared with new headlines. Feeds carry at most
// 3 days of items and the story window is 2 days, so 6 days is enough.
const COMPARE_DAYS = 6;
// Storms seen within this many days count by name ("'Uwan' leaves 5 dead").
const STORM_NAME_DAYS = 14;

// A headline that passed every check, ready to be merged or saved.
type Candidate = {
  title: string;
  url: string;
  outlet: string;
  category: OutletCategory;
  publishedAt: Date;
  provincePsgcs: number[];
  types: NewsType[];
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

// True if two lists hold the same items in the same order.
function sameList<T>(a: T[], b: T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/** Provinces, towns, and the names of storms seen lately, for checking headlines. */
export async function loadNewsContext(): Promise<NewsContext> {
  // BIGINT codes come back as text, so they are turned into numbers.
  const provinces = await pool.query<{ psgc: string; name: string }>('SELECT psgc, name FROM provinces');
  const towns = await pool.query<{ name: string; province_psgc: string }>('SELECT name, province_psgc FROM places');
  const since = new Date(Date.now() - STORM_NAME_DAYS * DAY_MS);
  const storms = await pool.query<{ name: string }>('SELECT DISTINCT name FROM storms WHERE updated_at >= $1', [since]);
  const alerts = await pool.query<{ headline: string }>(
    'SELECT headline FROM official_alerts WHERE sent_at >= $1',
    [since],
  );

  // International names from the storms table, then both names from PAGASA's
  // cyclone alerts. Each name once; a name that needs no quotes wins.
  const byName = new Map<string, StormName>();
  const all = [
    ...storms.rows.map((row) => ({ name: row.name, needsQuotes: false })),
    ...stormNamesFromAlerts(alerts.rows.map((row) => row.headline)),
  ];
  for (const storm of all) {
    const key = storm.name.toLowerCase();
    const known = byName.get(key);
    if (!known || (known.needsQuotes && !storm.needsQuotes)) byName.set(key, storm);
  }
  return {
    provinces: provinces.rows.map((row) => ({ psgc: Number(row.psgc), name: row.name })),
    towns: towns.rows.map((row) => ({ name: row.name, provincePsgc: Number(row.province_psgc) })),
    storms: [...byName.values()],
  };
}

export async function ingestNews(): Promise<void> {
  const context = await loadNewsContext();

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
      const check = checkHeadline(item.title, context);
      if (!check.disaster) continue;
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
        provincePsgcs: check.provincePsgcs,
        types: check.types,
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
  let rechecked = 0;
  let droppedNow = 0;
  try {
    await client.query('BEGIN');

    const saved = await client.query(
      `SELECT id, story_key, title, url, outlet, category, published_at, province_psgcs, types, other_outlets
       FROM news WHERE published_at >= $1`,
      [new Date(Date.now() - COMPARE_DAYS * DAY_MS)],
    );
    const savedStories: SavedStory[] = saved.rows.map((row) => ({
      id: row.id,
      storyKey: row.story_key,
      title: row.title,
      url: row.url,
      outlet: row.outlet,
      category: row.category,
      publishedAt: row.published_at,
      // BIGINT arrays arrive as text, so turn them into numbers.
      provincePsgcs: (row.province_psgcs as string[]).map(Number),
      types: row.types,
      otherOutlets: row.other_outlets,
    }));

    // Check recent saved headlines again with today's rules: a headline that
    // no longer counts is removed; new kinds or places are saved.
    const stories: SavedStory[] = [];
    for (const story of savedStories) {
      const check = checkHeadline(story.title, context);
      if (!check.disaster) {
        await client.query('DELETE FROM news WHERE id = $1', [story.id]);
        droppedNow += 1;
        continue;
      }
      if (!sameList(check.types, story.types) || !sameList(check.provincePsgcs, story.provincePsgcs)) {
        await client.query('UPDATE news SET types = $2::text[], province_psgcs = $3::bigint[] WHERE id = $1', [
          story.id,
          check.types,
          check.provincePsgcs,
        ]);
        story.types = check.types;
        story.provincePsgcs = check.provincePsgcs;
        rechecked += 1;
      }
      stories.push(story);
    }

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
        `INSERT INTO news (story_key, title, url, outlet, category, published_at, province_psgcs, types)
         VALUES ($1, $2, $3, $4, $5, $6, $7::bigint[], $8::text[])
         ON CONFLICT (story_key) DO NOTHING
         RETURNING id`,
        [
          key,
          candidate.title,
          candidate.url,
          candidate.outlet,
          candidate.category,
          candidate.publishedAt,
          candidate.provincePsgcs,
          candidate.types,
        ],
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
      `disaster ${disasterItems}; new ${newRows}, merged ${merged}, already saved ${unchanged}, removed old ${removed}; ` +
      `saved headlines re-checked: ${rechecked} updated, ${droppedNow} no longer count.`,
  );
}
