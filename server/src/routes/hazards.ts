// API routes for the fixed hazard maps (Project NOAH):
//   GET /api/hazards                             → which map layers are loaded (HazardLayerInfo[])
//   GET /api/hazards/tiles/:layer/:z/:x/:y.mvt   → one map tile of zones (vector tile)
// layer is landslide, surge1, surge2, surge3 or surge4. Tiles below zoom 9 are
// always empty (204): the map hides zones there.
// The zone shapes are from Project NOAH under the ODbL licence.

import { Router } from 'express';
import { z } from 'zod';
import type { HazardMapKind } from '@ph-monitor/shared';
import { pool } from '../db.ts';
import { listHazardLayers } from '../hazardZones.ts';

export const hazardsRouter = Router();

hazardsRouter.get('/', async (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json(await listHazardLayers());
});

// ---------- GET /api/hazards/tiles/:layer/:z/:x/:y.mvt ----------

// Which rows of hazard_zones each layer name means, and the lowest zoom it is
// drawn at (below it every tile is empty). Storm surge tiles stay small even for
// the whole country (measured 2026-11-19: 12 KB and about 250 ms at zoom 4). Landslide stays
// at zoom 9 until its own tiles are measured: it is about ten times bigger.
const LAYERS: Record<string, { kind: HazardMapKind; surgeLevel: number; minZoom: number }> = {
  landslide: { kind: 'landslide', surgeLevel: 0, minZoom: 9 },
  surge1: { kind: 'stormSurge', surgeLevel: 1, minZoom: 4 },
  surge2: { kind: 'stormSurge', surgeLevel: 2, minZoom: 4 },
  surge3: { kind: 'stormSurge', surgeLevel: 3, minZoom: 4 },
  surge4: { kind: 'stormSurge', surgeLevel: 4, minZoom: 4 },
};

// The numbers in the address are text: whole numbers only, x and y inside the
// zoom's grid (0 to 2^z − 1). `refine` adds a check that needs several fields.
const wholeNumber = z.string().regex(/^\d{1,7}$/).transform(Number);
const tileSchema = z
  .object({
    layer: z.enum(['landslide', 'surge1', 'surge2', 'surge3', 'surge4']),
    z: wholeNumber.pipe(z.number().max(22)),
    x: wholeNumber,
    y: wholeNumber,
  })
  .refine((tile) => tile.x < 2 ** tile.z && tile.y < 2 ** tile.z);

// Built tiles, kept in memory until the server restarts. null = an empty tile.
// A Map remembers the order things were added, so the oldest goes first when full.
const MAX_CACHED_TILES = 2000;
const tileCache = new Map<string, Buffer | null>();

/** The zoom where the map's stripes take over from the far-out outlines (web/src/hazardOverlay.ts). */
const OUTLINES_BELOW = 9;

/**
 * Builds one tile with PostGIS. ST_TileEnvelope is the tile's square in web map
 * metres (3857); `&&` compares bounding boxes, so the GIST index on geom is used.
 * Each zone becomes a shape in the "zones" layer with one number, c = its class.
 *
 * For speed at low zoom (tens of thousands of pieces per tile), `px` is one
 * screen pixel in degrees (a tile is drawn 512 pixels wide): pieces smaller
 * than a pixel are left out, and the rest are simplified to half a pixel
 * before the slow change of map projection. Neither can be seen on screen.
 *
 * Below OUTLINES_BELOW the map draws zone outlines instead of stripes, and most
 * storm surge pieces are smaller than a pixel there; keeping pieces down to a
 * quarter pixel lets the coasts show (tiles measured under 120 KB, 2026-11-19).
 */

async function buildTile(kind: HazardMapKind, surgeLevel: number, z: number, x: number, y: number): Promise<Buffer | null> {
  const result = await pool.query<{ tile: Buffer | null }>(
    `WITH bounds AS (SELECT ST_TileEnvelope($1, $2, $3) AS env, 360.0 / (2 ^ $1) / 512 AS px),
     pieces AS (
       SELECT ST_AsMVTGeom(ST_Transform(ST_Simplify(h.geom, bounds.px / 2, true), 3857), bounds.env, 4096, 64, true) AS geom,
              h.hazard_class::int AS c
       FROM hazard_zones h, bounds
       WHERE h.kind = $4 AND h.surge_level = $5
         AND h.geom && ST_Transform(bounds.env, 4326)
         AND (ST_XMax(h.geom) - ST_XMin(h.geom) > bounds.px * $6 OR ST_YMax(h.geom) - ST_YMin(h.geom) > bounds.px * $6)
     )
     SELECT ST_AsMVT(pieces, 'zones', 4096, 'geom') AS tile FROM pieces WHERE geom IS NOT NULL`,
    [z, x, y, kind, surgeLevel, z < OUTLINES_BELOW ? 0.25 : 1],
  );
  const tile = result.rows[0]?.tile;
  return tile && tile.length > 0 ? tile : null;
}

hazardsRouter.get('/tiles/:layer/:z/:x/:y.mvt', async (req, res) => {
  const parsed = tileSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'Unknown layer, or the tile numbers are outside the map.' });
    return;
  }
  const { layer, z, x, y } = parsed.data;
  if (z < (LAYERS[layer]?.minZoom ?? 0)) {
    res.status(204).end();
    return;
  }

  const key = `${layer}/${z}/${x}/${y}`;
  let tile = tileCache.get(key);
  if (tile === undefined) {
    const { kind, surgeLevel } = LAYERS[layer]!; // `!`: every layer name in the schema is in LAYERS
    tile = await buildTile(kind, surgeLevel, z, x, y);
    if (tileCache.size >= MAX_CACHED_TILES) {
      // keys().next().value is the oldest key in the Map.
      const oldest = tileCache.keys().next().value;
      if (oldest !== undefined) tileCache.delete(oldest);
    }
    tileCache.set(key, tile);
  }

  res.set('Cache-Control', 'public, max-age=86400');
  if (tile === null) {
    res.status(204).end();
    return;
  }
  res.set('Content-Type', 'application/vnd.mapbox-vector-tile');
  res.send(tile);
});
