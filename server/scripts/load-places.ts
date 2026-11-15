// Downloads the city and municipality boundaries and saves each one in the
// `places` table. They are used to name the spot a reader clicks on.
// Run with: npm run load-places   (after npm run load-provinces)
// Safe to run again: files already in data/ are reused, and rows are updated.
//
// Source: github.com/faeldon/philippines-json-maps (boundaries by NAMRIA and PSA
// via OCHA, CC BY 3.0 IGO). One file per province, named after its code.

import { z } from 'zod';
import { pool } from '../src/db.ts';
import { getBoundaryFile } from './boundaryFiles.ts';

// What one city or municipality must look like in the file.
const featureSchema = z.object({
  properties: z.object({
    adm3_psgc: z.number().int(),
    adm3_en: z.string().min(1),
    adm2_psgc: z.number().int(),
    // 'City', 'Mun' (municipality) and a few others; missing for some areas.
    geo_level: z.string().nullable(),
  }),
  geometry: z.object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    coordinates: z.array(z.unknown()),
  }),
});

const fileSchema = z.object({ features: z.array(z.unknown()) });

try {
  const provinces = await pool.query<{ psgc: number; name: string }>(
    'SELECT psgc, name FROM provinces ORDER BY psgc',
  );
  if (provinces.rows.length === 0) {
    throw new Error('No provinces in the database. Run `npm run load-provinces` first.');
  }

  let saved = 0;
  let skipped = 0;

  for (const province of provinces.rows) {
    const text = await getBoundaryFile(
      'provdists/medres',
      `municities-provdist-${province.psgc}.0.01.json`,
    );
    const file = fileSchema.parse(JSON.parse(text));

    for (const rawFeature of file.features) {
      const parsed = featureSchema.safeParse(rawFeature);
      if (!parsed.success) {
        skipped += 1;
        console.warn(`Skipped a place in ${province.name}: ${z.prettifyError(parsed.error)}`);
        continue;
      }
      const { properties, geometry } = parsed.data;

      // Same shape handling as in load-provinces.ts (see the notes there).
      await pool.query(
        `WITH shape AS (
           SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(
             ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)), 3)) AS geom
         )
         INSERT INTO places (psgc, name, province_psgc, geo_level, geom)
         SELECT $1, $2, $3, $4, geom FROM shape
         ON CONFLICT (psgc) DO UPDATE SET
           name = EXCLUDED.name,
           province_psgc = EXCLUDED.province_psgc,
           geo_level = EXCLUDED.geo_level,
           geom = EXCLUDED.geom`,
        [
          properties.adm3_psgc,
          properties.adm3_en,
          // Use the province whose file this is, which we know exists.
          province.psgc,
          properties.geo_level ?? 'Other',
          JSON.stringify(geometry),
        ],
      );
      saved += 1;
    }
  }

  const total = await pool.query<{ count: number }>('SELECT count(*) FROM places');
  console.log(`Saved ${saved} cities and municipalities, skipped ${skipped}.`);
  console.log(`The places table now has ${total.rows[0]?.count} rows.`);
} catch (error) {
  console.error('Loading places failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
