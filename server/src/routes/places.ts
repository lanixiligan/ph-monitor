// API route for the place search:
//   GET /api/places?q=cebu  → up to 10 cities, municipalities and provinces
// Every name comes from our own database (no outside geocoder). The rule for
// what matches is in placeSearch.ts.

import { Router } from 'express';
import { z } from 'zod';
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
