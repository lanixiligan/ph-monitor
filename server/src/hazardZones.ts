// What the fixed hazard maps (Project NOAH: landslide and storm surge) say
// about one spot, and which maps are loaded. Shown on the status card and the
// legend; never part of the score. The shapes are under the ODbL licence.
//
// Unknown is never calm: a spot gets "not in a zone" (hazardClass null) only
// when its province's map is loaded. With no map and no zone, the answer is
// null ("no hazard map here").

import type { HazardClass, HazardLayerInfo, HazardMapKind, HazardZones, SurgeAtSpot, SurgeLevel } from '@ph-monitor/shared';
import { pool } from './db.ts';

const SURGE_LEVELS: SurgeLevel[] = [1, 2, 3, 4];

/** One map layer: a kind plus its surge level (0 for landslide). */
type LayerKey = { kind: HazardMapKind; surge_level: number };

/** The class at the spot, "not in a zone" (null) or unknown (undefined) for one layer. */
function answerFor(
  zones: (LayerKey & { hazard_class: HazardClass })[],
  covered: LayerKey[],
  kind: HazardMapKind,
  level: number,
): HazardClass | null | undefined {
  const zone = zones.find((row) => row.kind === kind && row.surge_level === level);
  // A zone counts even if it came from a neighbour province's file.
  if (zone) return zone.hazard_class;
  if (covered.some((row) => row.kind === kind && row.surge_level === level)) return null;
  return undefined;
}

export async function getHazardZones(lat: number, lon: number, provincePsgc: number): Promise<HazardZones> {
  // Promise.all runs both queries at the same time and waits for both.
  const [zoneResult, coverageResult] = await Promise.all([
    // Classes overlap a little at their edges, so the spot takes the highest.
    // `&` joins two types: each row has the LayerKey fields plus hazard_class.
    pool.query<LayerKey & { hazard_class: HazardClass }>(
      `SELECT kind, surge_level, max(hazard_class) AS hazard_class
       FROM hazard_zones
       WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
       GROUP BY kind, surge_level`,
      [lon, lat],
    ),
    pool.query<LayerKey>('SELECT kind, surge_level FROM hazard_coverage WHERE province_psgc = $1', [provincePsgc]),
  ]);
  const zones = zoneResult.rows;
  const covered = coverageResult.rows;

  const landslide = answerFor(zones, covered, 'landslide', 0);
  const stormSurge: SurgeAtSpot[] = [];
  for (const level of SURGE_LEVELS) {
    const hazardClass = answerFor(zones, covered, 'stormSurge', level);
    if (hazardClass !== undefined) stormSurge.push({ level, hazardClass });
  }
  return {
    landslide: landslide === undefined ? null : { hazardClass: landslide },
    stormSurge: stormSurge.length > 0 ? stormSurge : null,
  };
}

/** Every loaded map layer, for the legend: landslide first, then surge levels 1 to 4. */
export async function listHazardLayers(): Promise<HazardLayerInfo[]> {
  const result = await pool.query<{ kind: HazardMapKind; surge_level: number; provinces: number; loaded_at: Date }>(
    `SELECT kind, surge_level, count(*) AS provinces, max(loaded_at) AS loaded_at
     FROM hazard_coverage
     GROUP BY kind, surge_level
     ORDER BY kind, surge_level`,
  );
  return result.rows.map((row) => ({
    kind: row.kind,
    // The table allows only 0 to 4, and 0 means landslide; `as` tells TypeScript so.
    surgeLevel: row.surge_level === 0 ? null : (row.surge_level as SurgeLevel),
    provinces: row.provinces,
    loadedAt: row.loaded_at.toISOString(),
  }));
}
