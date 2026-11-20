// Which PAGASA grid squares belong to each town, and each town's hottest value.
// A square belongs to a town when the square's centre is inside the town. A town
// too small for any centre gets the one square under a point inside it.
// The list is saved (pagasa_town_cells) and only rebuilt when the grid or the
// number of towns changes. Display only: the score never reads this.

import { pool } from './db.ts';
// `import type` brings in a type only; it disappears when the code runs.
import type { GridInfo } from './pagasaGrid.ts';
import { cleanValue, sameGrid } from './pagasaGrid.ts';

/**
 * Each town's hottest clean value among its squares, or null when none is clean
 * (all sea / no data, or no squares at all). Never 0, never a neighbour's value.
 */
// `Map<number, number[]>` = a lookup from a town code to its list of square numbers.
export function townMaxima(values: Float32Array, cells: Map<number, number[]>): Map<number, number | null> {
  const maxima = new Map<number, number | null>();
  for (const [psgc, list] of cells) {
    let hottest: number | null = null;
    for (const cell of list) {
      // `?? NaN` = use NaN when the cell is past the end of the list; cleanValue turns it into null.
      const value = cleanValue(values[cell] ?? NaN);
      if (value !== null && (hottest === null || value > hottest)) hottest = value;
    }
    maxima.set(psgc, hottest);
  }
  return maxima;
}

// $1 width, $2 height, $3 origin x, $4 origin y, $5 pixel size (Web Mercator metres).
// Each town is moved to Web Mercator once (MATERIALIZED keeps PostgreSQL from
// doing it again for every square), then every square in its bounding box is
// tried. The square at (row, col) has its centre at
// (originX + (col + 0.5) × size, originY − (row + 0.5) × size); its number is row × width + col.
const INSIDE_SQL = `
  WITH towns AS MATERIALIZED (
    SELECT psgc, ST_Transform(geom, 3857) AS geom FROM places
  ), boxes AS MATERIALIZED (
    SELECT psgc, geom,
      GREATEST(0, floor((ST_XMin(geom) - $3) / $5))::int AS col0,
      LEAST($1 - 1, floor((ST_XMax(geom) - $3) / $5))::int AS col1,
      GREATEST(0, floor(($4 - ST_YMax(geom)) / $5))::int AS row0,
      LEAST($2 - 1, floor(($4 - ST_YMin(geom)) / $5))::int AS row1
    FROM towns
  )
  INSERT INTO pagasa_town_cells (psgc, cell)
  SELECT b.psgc, r * $1 + c
  FROM boxes b, generate_series(b.row0, b.row1) AS r, generate_series(b.col0, b.col1) AS c
  WHERE ST_Contains(b.geom, ST_SetSRID(ST_MakePoint($3 + (c + 0.5) * $5, $4 - (r + 0.5) * $5), 3857))`;

// Towns still without a square get the one under ST_PointOnSurface (a point
// always inside the town), if that point is on the grid. Same $1..$5.
const FALLBACK_SQL = `
  INSERT INTO pagasa_town_cells (psgc, cell)
  SELECT psgc, r * $1 + c
  FROM (
    SELECT p.psgc,
      floor((ST_X(s.point) - $3) / $5)::int AS c,
      floor(($4 - ST_Y(s.point)) / $5)::int AS r
    FROM places p
    CROSS JOIN LATERAL (SELECT ST_Transform(ST_PointOnSurface(p.geom), 3857) AS point) s
    WHERE NOT EXISTS (SELECT 1 FROM pagasa_town_cells t WHERE t.psgc = p.psgc)
  ) spots
  WHERE c BETWEEN 0 AND $1 - 1 AND r BETWEEN 0 AND $2 - 1`;

/** True when the saved squares were built for this grid and the towns there are now. */
async function upToDate(grid: GridInfo): Promise<boolean> {
  // `query<{ ... }>` says what each returned row looks like.
  const saved = await pool.query<{
    width: number; height: number; origin_x: number; origin_y: number; pixel_size: number; towns: number;
  }>('SELECT width, height, origin_x, origin_y, pixel_size, towns FROM pagasa_grid WHERE id = 1');
  const row = saved.rows[0];
  if (!row) return false;
  const towns = await pool.query<{ count: number }>('SELECT count(*) AS count FROM places');
  const savedGrid = {
    width: row.width, height: row.height, originX: row.origin_x, originY: row.origin_y, pixelSize: row.pixel_size,
  };
  return sameGrid(savedGrid, grid) && row.towns === towns.rows[0]?.count;
}

/** Empties and refills pagasa_town_cells for this grid, in one transaction (never half built). */
async function rebuild(grid: GridInfo): Promise<void> {
  const params = [grid.width, grid.height, grid.originX, grid.originY, grid.pixelSize];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM pagasa_town_cells');
    await client.query(INSIDE_SQL, params);
    await client.query(FALLBACK_SQL, params);
    await client.query(
      `INSERT INTO pagasa_grid (id, width, height, origin_x, origin_y, pixel_size, towns)
       SELECT 1, $1, $2, $3, $4, $5, count(*) FROM places
       ON CONFLICT (id) DO UPDATE SET
         width = EXCLUDED.width, height = EXCLUDED.height, origin_x = EXCLUDED.origin_x,
         origin_y = EXCLUDED.origin_y, pixel_size = EXCLUDED.pixel_size, towns = EXCLUDED.towns`,
      params,
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Forgets which grid the squares were built for, so the next ensureTownCells
 * rebuilds. Call it after the towns are reloaded: a reload can swap towns
 * while keeping the same count, which the count check alone would miss.
 */
export async function forgetPagasaGrid(): Promise<void> {
  await pool.query('DELETE FROM pagasa_grid');
}

/**
 * Makes sure the saved squares match this grid (rebuilding them if not), then
 * returns every town's squares: town code → square numbers. A town outside
 * the grid gets an empty list.
 */
export async function ensureTownCells(grid: GridInfo): Promise<Map<number, number[]>> {
  if (!(await upToDate(grid))) await rebuild(grid);
  const result = await pool.query<{ psgc: number; cells: number[] }>(
    `SELECT p.psgc,
       COALESCE(array_agg(t.cell ORDER BY t.cell) FILTER (WHERE t.cell IS NOT NULL), '{}') AS cells
     FROM places p LEFT JOIN pagasa_town_cells t ON t.psgc = p.psgc
     GROUP BY p.psgc`,
  );
  return new Map(result.rows.map((row) => [row.psgc, row.cells]));
}
