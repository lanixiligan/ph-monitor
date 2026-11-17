// Picks extra weather sample points for big and island provinces and saves
// them in province_weather_points. Run with: npm run weather-points
// (after npm run load-provinces and npm run load-places). Safe to run again:
// the table is rebuilt each time.
//
// Candidates are one point inside each city or municipality of the province;
// the rule for choosing among them is pickExtraPoints() in src/weatherPoints.ts.

import { pool } from '../src/db.ts';
import { pickExtraPoints } from '../src/weatherPoints.ts';

try {
  // ST_X / ST_Y read the longitude / latitude out of a point.
  const provinces = await pool.query<{ psgc: number; name: string; lon: number; lat: number }>(
    'SELECT psgc, name, ST_X(weather_point) AS lon, ST_Y(weather_point) AS lat FROM provinces ORDER BY psgc',
  );
  // ST_PointOnSurface picks a point guaranteed to be inside the shape.
  const places = await pool.query<{ province_psgc: number; lon: number; lat: number }>(
    `SELECT province_psgc, ST_X(ST_PointOnSurface(geom)) AS lon, ST_Y(ST_PointOnSurface(geom)) AS lat
     FROM places`,
  );
  if (places.rows.length === 0) {
    throw new Error('No places in the database. Run `npm run load-places` first.');
  }

  // One transaction: the table is never left half-built.
  const client = await pool.connect();
  let total = 0;
  let withExtras = 0;
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM province_weather_points');
    for (const province of provinces.rows) {
      const candidates = places.rows.filter((place) => place.province_psgc === province.psgc);
      const extras = pickExtraPoints(province, candidates);
      if (extras.length > 0) withExtras += 1;
      // `entries()` gives each point with its position (0, 1), so `n` is 1 or 2.
      for (const [i, point] of extras.entries()) {
        await client.query(
          `INSERT INTO province_weather_points (province_psgc, n, geom)
           VALUES ($1, $2, ST_SetSRID(ST_MakePoint($3, $4), 4326))`,
          [province.psgc, i + 1, point.lon, point.lat],
        );
        total += 1;
      }
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  console.log(
    `Saved ${total} extra weather points for ${withExtras} of ${provinces.rows.length} provinces ` +
      `(${provinces.rows.length + total} points in all).`,
  );
} catch (error) {
  console.error('Picking weather points failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
