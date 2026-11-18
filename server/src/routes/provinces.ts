// API routes for provinces:
//   GET /api/provinces        → every province's shape and score (for the map)
//   GET /api/provinces/:psgc  → one province in detail (for the status card)

import { Router } from 'express';
import { z } from 'zod';
import type {
  HazardEvent,
  ProvinceDetail,
  ProvinceMapProperties,
  ScoreReason,
  SignalName,
} from '@ph-monitor/shared';
import { getConditions } from '../conditions.ts';
import { pool } from '../db.ts';
import { buildFreshness, getLastOk } from '../freshness.ts';
import { readQuakeImpact } from '../quakeImpact.ts';
import { WEIGHTS } from '../scoring/scoring.ts';

export const provincesRouter = Router();

const HOUR_MS = 60 * 60 * 1000;

// ---------- GET /api/provinces ----------

type Shape = { psgc: number; name: string; geometry: unknown; point_lat: number; point_lon: number };

// Province shapes never change while the server runs, and simplifying them
// takes a moment, so we do it once and keep the result in memory.
let cachedShapes: Shape[] | null = null;

async function getShapes(): Promise<Shape[]> {
  if (cachedShapes === null) {
    // ST_SimplifyPreserveTopology drops tiny details (smaller than ~0.005°,
    // about 500 m) so the map downloads faster. ST_AsGeoJSON turns the shape
    // into GeoJSON, keeping 4 decimals (about 10 m). The weather point is a
    // spot inside the province; the map pins headlines there.
    const result = await pool.query<Shape>(
      `SELECT psgc, name,
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005), 4)::json AS geometry,
              round(ST_Y(weather_point)::numeric, 4)::float8 AS point_lat,
              round(ST_X(weather_point)::numeric, 4)::float8 AS point_lon
       FROM provinces ORDER BY psgc`,
    );
    cachedShapes = result.rows;
  }
  return cachedShapes;
}

provincesRouter.get('/', async (_req, res) => {
  const shapes = await getShapes();

  const scores = await pool.query<{
    province_psgc: number;
    score: number;
    quake_score: number;
    weather_score: number;
    event_score: number;
    unknown_signals: SignalName[];
    top_place: string | null;
  }>(
    `SELECT s.province_psgc, s.score, s.quake_score, s.weather_score, s.event_score, s.unknown_signals,
            c.name AS top_place
     FROM province_scores s LEFT JOIN places c ON c.psgc = s.top_place_psgc`,
  );

  const scoreByPsgc = new Map(scores.rows.map((row) => [row.province_psgc, row]));

  const features = shapes.map((shape) => {
    const score = scoreByPsgc.get(shape.psgc);
    const properties: ProvinceMapProperties = {
      psgc: shape.psgc,
      name: shape.name,
      // `?.` reads a field only if `score` exists; `?? null` fills the gap.
      score: score?.score ?? null,
      quake_score: score?.quake_score ?? null,
      weather_score: score?.weather_score ?? null,
      event_score: score?.event_score ?? null,
      incomplete: (score?.unknown_signals.length ?? 0) > 0,
      top_place: score?.top_place ?? null,
      point_lat: shape.point_lat,
      point_lon: shape.point_lon,
    };
    return { type: 'Feature', id: shape.psgc, properties, geometry: shape.geometry };
  });

  res.json({ type: 'FeatureCollection', features });
});

// ---------- GET /api/provinces/:psgc ----------

// The code in the URL is text; it must be a positive whole number.
/**
 * Scores saved before reasons became message keys hold plain sentences.
 * Those are dropped here; the next score run (every 15 minutes) replaces them.
 */
function keyedReasons(saved: unknown[]): ScoreReason[] {
  // `as` tells TypeScript the shape; safe because computeScores writes only these.
  return saved.filter((reason) => typeof reason === 'object' && reason !== null) as ScoreReason[];
}

const psgcSchema = z.coerce.number().int().positive();

provincesRouter.get('/:psgc', async (req, res) => {
  const parsedPsgc = psgcSchema.safeParse(req.params.psgc);
  if (!parsedPsgc.success) {
    res.status(400).json({ error: 'The province code must be a number.' });
    return;
  }
  const psgc = parsedPsgc.data;

  const provinceResult = await pool.query<{
    psgc: number;
    name: string;
    region_psgc: number;
    geo_level: 'Prov' | 'Dist' | 'Other';
  }>('SELECT psgc, name, region_psgc, geo_level FROM provinces WHERE psgc = $1', [psgc]);
  const province = provinceResult.rows[0];
  if (!province) {
    res.status(404).json({ error: `No province with code ${psgc}.` });
    return;
  }

  const scoreResult = await pool.query<{
    score: number;
    quake_score: number;
    weather_score: number;
    event_score: number;
    unknown_signals: SignalName[];
    reasons: unknown[];
    computed_at: Date;
  }>(
    `SELECT score, quake_score, weather_score, event_score, unknown_signals, reasons, computed_at
     FROM province_scores WHERE province_psgc = $1`,
    [psgc],
  );
  const score = scoreResult.rows[0];

  // The quakes that count towards the score, newest first.
  const quakeResult = await pool.query<{
    id: string;
    magnitude: number;
    depth_km: number | null;
    place: string | null;
    occurred_at: Date;
    distance_km: number;
    url: string | null;
    props: unknown; // the USGS record's properties, checked by readQuakeImpact
  }>(
    `SELECT q.id, q.magnitude, q.depth_km, q.place, q.occurred_at, l.distance_km, q.url,
            q.raw->'properties' AS props
     FROM earthquake_provinces l
     JOIN earthquakes q ON q.id = l.earthquake_id
     WHERE l.province_psgc = $1 AND q.occurred_at >= $2 AND q.magnitude >= $3
     ORDER BY q.occurred_at DESC`,
    [psgc, new Date(Date.now() - WEIGHTS.quake.windowHours * HOUR_MS), WEIGHTS.quake.minMagnitude],
  );

  // The newest weather reading.
  const weatherResult = await pool.query<{
    valid_at: Date;
    temp_c: number | null;
    humidity_pct: number | null;
    heat_index_c: number | null;
    rain_1h_mm: number | null;
    rain_24h_mm: number | null;
  }>(
    `SELECT valid_at, temp_c, humidity_pct, heat_index_c, rain_1h_mm, rain_24h_mm
     FROM weather_readings WHERE province_psgc = $1
     ORDER BY valid_at DESC LIMIT 1`,
    [psgc],
  );
  const weather = weatherResult.rows[0];

  const events: HazardEvent[] = quakeResult.rows.map((row) => ({
    kind: 'earthquake',
    id: row.id,
    magnitude: row.magnitude,
    depthKm: row.depth_km,
    place: row.place,
    occurredAt: row.occurred_at.toISOString(),
    distanceKm: row.distance_km,
    url: row.url,
    // `...` copies in the fields readQuakeImpact returns (PAGER alert, mmi, tsunami link).
    ...readQuakeImpact(row.props),
  }));
  if (weather) {
    events.push({
      kind: 'weather',
      validAt: weather.valid_at.toISOString(),
      tempC: weather.temp_c,
      humidityPct: weather.humidity_pct,
      heatIndexC: weather.heat_index_c,
      rain1hMm: weather.rain_1h_mm,
      rain24hMm: weather.rain_24h_mm,
    });
  }

  const lastOk = await getLastOk();

  const detail: ProvinceDetail = {
    province: {
      psgc: province.psgc,
      name: province.name,
      regionPsgc: province.region_psgc,
      geoLevel: province.geo_level,
    },
    score: score
      ? {
          psgc,
          score: score.score,
          quakeScore: score.quake_score,
          weatherScore: score.weather_score,
          eventScore: score.event_score,
          unknownSignals: score.unknown_signals,
          reasons: keyedReasons(score.reasons),
          computedAt: score.computed_at.toISOString(),
        }
      : null,
    events,
    freshness: buildFreshness(lastOk.earthquakes, lastOk.weather),
    conditions: await getConditions(psgc, null),
  };
  res.json(detail);
});
