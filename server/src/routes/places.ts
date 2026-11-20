// API routes for cities and municipalities ("towns"):
//   GET /api/places?q=cebu    → up to 10 cities, municipalities and provinces
//   GET /api/places/shapes    → every town's shape, as GeoJSON (for the map)
//   GET /api/places/scores    → every town's latest score and its earthquake part (for the map)
// Every name comes from our own database (no outside geocoder). The rule for
// what matches is in placeSearch.ts.

import { Router } from 'express';
import { z } from 'zod';
import type { PlaceScores, PlaceShapeProperties, SignalName } from '@ph-monitor/shared';
import { pool } from '../db.ts';
import { searchPlaces } from '../placeSearch.ts';
import type { SearchPlace } from '../placeSearch.ts';

export const placesRouter = Router();

// Names and shapes never change while the server runs, so the list (about
// 1,700 rows) is read once and searched in memory.
let cachedPlaces: SearchPlace[] | null = null;

async function getPlaces(): Promise<SearchPlace[]> {
  if (cachedPlaces !== null) return cachedPlaces;
  // ST_PointOnSurface picks a point that is surely inside the shape (the
  // middle of a curved or island town can fall in the sea). A province uses
  // its weather point, which is also inside it. 4 decimals is about 10 m.
  const result = await pool.query<SearchPlace>(
    `SELECT c.psgc, c.name, p.name AS "provinceName",
            CASE WHEN c.geo_level = 'City' THEN 'city' ELSE 'municipality' END AS kind,
            round(ST_Y(ST_PointOnSurface(c.geom))::numeric, 4)::float8 AS lat,
            round(ST_X(ST_PointOnSurface(c.geom))::numeric, 4)::float8 AS lon
     FROM places c JOIN provinces p ON p.psgc = c.province_psgc
     UNION ALL
     SELECT psgc, name, NULL, 'province',
            round(ST_Y(weather_point)::numeric, 4)::float8,
            round(ST_X(weather_point)::numeric, 4)::float8
     FROM provinces`,
  );
  // An empty list is not kept: the places may simply not be loaded yet.
  if (result.rows.length > 0) cachedPlaces = result.rows;
  return result.rows;
}

const querySchema = z.object({ q: z.string().max(80) });

placesRouter.get('/', async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Give the text to look for as q (80 letters at most).' });
    return;
  }
  res.json(searchPlaces(await getPlaces(), parsed.data.q));
});

// ---------- GET /api/places/shapes ----------

// Town shapes never change while the server runs, and simplifying them takes
// a moment, so the answer is built once and kept in memory as JSON text.
let cachedShapes: string | null = null;

placesRouter.get('/shapes', async (_req, res) => {
  if (cachedShapes === null) {
    // Simplified to about 500 m (0.005°), 4 decimals (about 10 m), like the provinces.
    const result = await pool.query<{ psgc: number; name: string; province_name: string; geometry: unknown }>(
      `SELECT c.psgc, c.name, p.name AS province_name,
              ST_AsGeoJSON(ST_SimplifyPreserveTopology(c.geom, 0.005), 4)::json AS geometry
       FROM places c JOIN provinces p ON p.psgc = c.province_psgc
       ORDER BY c.psgc`,
    );
    const features = result.rows.map((row) => {
      const properties: PlaceShapeProperties = { psgc: row.psgc, name: row.name, province_name: row.province_name };
      return { type: 'Feature', id: row.psgc, properties, geometry: row.geometry };
    });
    const json = JSON.stringify({ type: 'FeatureCollection', features });
    // An empty list is not kept: the places may simply not be loaded yet.
    if (features.length === 0) {
      res.type('application/json').send(json);
      return;
    }
    cachedShapes = json;
  }
  // The browser may keep it for a day; the shapes only change with a new boundary file.
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('application/json').send(cachedShapes);
});

// ---------- GET /api/places/scores ----------

placesRouter.get('/scores', async (_req, res) => {
  const result = await pool.query<{
    psgc: number;
    score: number;
    quake_score: number;
    unknown_signals: SignalName[];
    computed_at: Date;
  }>(
    'SELECT place_psgc AS psgc, score, quake_score, unknown_signals, computed_at FROM place_scores ORDER BY place_psgc',
  );
  const answer: PlaceScores = {
    computedAt: result.rows[0]?.computed_at.toISOString() ?? null,
    places: result.rows.map((row) => ({
      psgc: row.psgc,
      score: row.score,
      incomplete: row.unknown_signals.length > 0,
      // For the Earthquake view (display only). Unknown quakes are never shown as calm.
      quakeScore: row.quake_score,
      quakeUnknown: row.unknown_signals.includes('quake'),
    })),
  };
  res.json(answer);
});
