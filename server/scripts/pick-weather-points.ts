// Builds the weather grid and links every city and municipality to it.
// Run with: npm run weather-points
// (after npm run load-provinces and npm run load-places). Safe to run again:
// both tables are rebuilt each time.
//
// The points (saved in weather_points):
//   - a square grid over the land, GRID_DEGREES apart (about 28 km); a cell
//     gets a point only if at least MIN_LAND_SHARE of it is land;
//   - each province's own weather point, so small islands always have one;
//   - a point inside any town that is still too far from all of these.
// Which points a town uses is decided by townPoints() in src/weatherPoints.ts.

import { pool } from '../src/db.ts';
import {
  CLEAR_HEAT_RUNS_SQL,
  CLEAR_WEATHER_POINTS_SQL,
  GRID_DEGREES,
  MIN_LAND_SHARE,
  townPoints,
} from '../src/weatherPoints.ts';

try {
  const placeCount = await pool.query<{ n: number }>('SELECT count(*)::int AS n FROM places');
  if ((placeCount.rows[0]?.n ?? 0) === 0) {
    throw new Error('No places in the database. Run `npm run load-places` first.');
  }

  // One transaction: the tables are never left half-built.
  const client = await pool.connect();
  const counts = { grid: 0, province: 0, town: 0, inside: 0, nearest: 0 };
  let towns = 0;
  try {
    await client.query('BEGIN');
    // TRUNCATE empties the tables; RESTART IDENTITY numbers new points from 1 again.
    // CASCADE: re-running this script now also empties point_readings and
    // heat_forecasts. The weather job refills the first within about 3 hours, and
    // the heat job refills the second at the next hourly tick (its run records are
    // cleared too, so it is due straight away).
    await client.query(CLEAR_WEATHER_POINTS_SQL);
    await client.query(CLEAR_HEAT_RUNS_SQL);

    // The grid. ST_SquareGrid cuts the land's bounding area into square cells.
    // A cell's point is its centre if that is on land, otherwise a spot on
    // the land inside the cell (ST_PointOnSurface).
    const grid = await client.query(
      `WITH land AS (
         SELECT ST_Union(ST_SimplifyPreserveTopology(geom, 0.005)) AS geom FROM provinces
       ),
       cells AS (
         SELECT c.geom AS cell, ST_Intersection(c.geom, land.geom) AS land_part
         FROM land, ST_SquareGrid($1, land.geom) c
         WHERE ST_Intersects(c.geom, land.geom)
       )
       INSERT INTO weather_points (kind, geom)
       SELECT 'grid',
              CASE WHEN ST_Intersects(ST_Centroid(cell), land_part) THEN ST_Centroid(cell)
                   ELSE ST_PointOnSurface(land_part) END
       FROM cells
       WHERE ST_Area(land_part) >= $2 * ST_Area(cell)`,
      [GRID_DEGREES, MIN_LAND_SHARE],
    );
    counts.grid = grid.rowCount ?? 0;

    const provincePoints = await client.query(
      `INSERT INTO weather_points (kind, geom) SELECT 'province', weather_point FROM provinces`,
    );
    counts.province = provincePoints.rowCount ?? 0;

    // For every town: the points inside it, and the nearest point with its
    // distance in km. `<->` lets the map index find the nearest point fast;
    // `::geography` measures on the round Earth, in metres.
    const candidates = await client.query<{
      psgc: number;
      inside: number[];
      nearest_id: number | null;
      nearest_km: number | null;
    }>(
      `SELECT c.psgc,
              ARRAY(SELECT w.id FROM weather_points w WHERE ST_Intersects(w.geom, c.geom) ORDER BY w.id) AS inside,
              n.id AS nearest_id, n.km AS nearest_km
       FROM places c
       LEFT JOIN LATERAL (
         SELECT w.id, ST_Distance(w.geom::geography, c.geom::geography) / 1000 AS km
         FROM weather_points w ORDER BY w.geom <-> c.geom LIMIT 1
       ) n ON true
       ORDER BY c.psgc`,
    );

    for (const town of candidates.rows) {
      towns += 1;
      const nearest =
        town.nearest_id !== null && town.nearest_km !== null ? { id: town.nearest_id, km: town.nearest_km } : null;
      const choice = townPoints(town.inside, nearest);
      let ids = choice.ids;

      if (choice.use === 'own') {
        // A spot guaranteed to be inside the town becomes a new point.
        const added = await client.query<{ id: number }>(
          `INSERT INTO weather_points (kind, geom)
           SELECT 'town', ST_PointOnSurface(geom) FROM places WHERE psgc = $1
           RETURNING id`,
          [town.psgc],
        );
        ids = added.rows.map((row) => row.id);
        counts.town += 1;
      } else {
        counts[choice.use] += 1;
      }

      // unnest turns the list of ids into one row per id.
      await client.query(
        `INSERT INTO place_weather_points (place_psgc, point_id) SELECT $1, unnest($2::int[])`,
        [town.psgc, ids],
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const points = counts.grid + counts.province + counts.town;
  console.log(
    `${points} points (${counts.grid} grid, ${counts.province} province, ${counts.town} town); ` +
      `${towns} towns linked (${counts.inside} with points inside, ${counts.nearest} to the nearest, ` +
      `${counts.town} with their own).`,
  );
} catch (error) {
  console.error('Picking weather points failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
