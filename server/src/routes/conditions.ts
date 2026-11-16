// API routes for the Phase 2 data (none of it changes the score):
//   GET /api/events     → current disaster events (for map markers)
//   GET /api/storms     → active storms with their tracks (for the map)
//   GET /api/news       → latest disaster headlines; ?category=tv  ?psgc=...  ?limit=...
//   GET /api/streams    → live stream slots the page may show
//   GET /api/bulletins  → links to official PAGASA and PHIVOLCS pages

import { Router } from 'express';
import { z } from 'zod';
import type { Storm, StormTrackPoint, StreamSlot, OutletCategory } from '@ph-monitor/shared';
import {
  CURRENT_EVENT_SQL,
  EVENT_COLUMNS,
  NEWS_COLUMNS,
  toDisasterEvent,
  toNewsItem,
} from '../conditions.ts';
import type { EventRow, NewsRow } from '../conditions.ts';
import { pool } from '../db.ts';
import { BULLETIN_LINKS, OUTLET_CATEGORIES } from '../sources.ts';

export const conditionsRouter = Router();

conditionsRouter.get('/events', async (_req, res) => {
  const result = await pool.query<EventRow>(
    `SELECT ${EVENT_COLUMNS} FROM events e WHERE ${CURRENT_EVENT_SQL} ORDER BY e.started_at DESC`,
  );
  res.json(result.rows.map(toDisasterEvent));
});

conditionsRouter.get('/storms', async (_req, res) => {
  const storms = await pool.query<{
    id: string;
    source: 'jma' | 'jtwc' | 'sample';
    name: string;
    category: string | null;
    is_active: boolean;
    url: string | null;
    updated_at: Date;
  }>('SELECT id, source, name, category, is_active, url, updated_at FROM storms WHERE is_active ORDER BY id');

  const points = await pool.query<{
    storm_id: string;
    valid_at: Date;
    is_forecast: boolean;
    lat: number;
    lon: number;
    pressure_hpa: number | null;
    wind_kt: number | null;
    radius_km: number | null;
  }>(
    `SELECT t.storm_id, t.valid_at, t.is_forecast, ST_Y(t.geom) AS lat, ST_X(t.geom) AS lon,
            t.pressure_hpa, t.wind_kt, t.radius_km
     FROM storm_track_points t JOIN storms s ON s.id = t.storm_id
     WHERE s.is_active
     ORDER BY t.storm_id, t.valid_at, t.is_forecast`,
  );

  const answer: Storm[] = storms.rows.map((storm) => {
    const track: StormTrackPoint[] = points.rows
      .filter((point) => point.storm_id === storm.id)
      .map((point) => ({
        validAt: point.valid_at.toISOString(),
        isForecast: point.is_forecast,
        lat: point.lat,
        lon: point.lon,
        pressureHpa: point.pressure_hpa,
        windKt: point.wind_kt,
        radiusKm: point.radius_km,
      }));
    return {
      id: storm.id,
      source: storm.source,
      name: storm.name,
      category: storm.category,
      isActive: storm.is_active,
      url: storm.url,
      updatedAt: storm.updated_at.toISOString(),
      track,
    };
  });
  res.json(answer);
});

// The category must be one of ours. `as [string, ...string[]]` tells
// TypeScript the list is not empty, which z.enum needs.
const categoryIds = OUTLET_CATEGORIES.map((category) => category.id) as [string, ...string[]];
const newsQuerySchema = z.object({
  category: z.enum(categoryIds).optional(),
  psgc: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

conditionsRouter.get('/news', async (req, res) => {
  const parsed = newsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Unknown category, province code or limit.' });
    return;
  }
  const { category, psgc, limit } = parsed.data;

  // `$1::text IS NULL OR ...` means "skip this rule when no value was given".
  // A story matches a category when its main outlet or any other outlet has it.
  const result = await pool.query<NewsRow>(
    `SELECT ${NEWS_COLUMNS} FROM news
     WHERE ($1::text IS NULL OR category = $1
            OR other_outlets @> jsonb_build_array(jsonb_build_object('category', $1::text)))
       AND ($2::bigint IS NULL OR $2 = ANY(province_psgcs))
     ORDER BY published_at DESC LIMIT $3`,
    [category ?? null, psgc ?? null, limit],
  );
  res.json(result.rows.map(toNewsItem));
});

conditionsRouter.get('/streams', async (_req, res) => {
  // Dead and not-embeddable links are never sent, so the page cannot show them.
  const result = await pool.query<{
    id: string;
    outlet: string;
    category: OutletCategory;
    video_id: string;
    video_title: string | null;
    video_published_at: Date | null;
    is_live: boolean | null;
    last_checked_at: Date;
  }>(
    `SELECT id, outlet, category, video_id, video_title, video_published_at, is_live, last_checked_at
     FROM sources
     WHERE kind = 'stream' AND status IN ('ok', 'not-live') AND video_id IS NOT NULL
     ORDER BY id`,
  );
  const slots: StreamSlot[] = result.rows.map((row) => ({
    id: row.id,
    outlet: row.outlet,
    category: row.category,
    videoId: row.video_id,
    title: row.video_title,
    publishedAt: row.video_published_at?.toISOString() ?? null,
    isLive: row.is_live,
    lastCheckedAt: row.last_checked_at.toISOString(),
  }));
  res.json(slots);
});

conditionsRouter.get('/bulletins', (_req, res) => {
  res.json(BULLETIN_LINKS);
});
