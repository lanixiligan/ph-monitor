// Downloads the province boundary files and saves each province in the database.
// Run with: npm run load-provinces
// Safe to run again: files already in data/ are reused, and rows are updated.
//
// Source: github.com/faeldon/philippines-json-maps (boundaries by NAMRIA and PSA
// via OCHA, CC BY 3.0 IGO). One file per region; each holds that region's
// provinces. Metro Manila comes as four districts instead of a province.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { pool } from '../src/db.ts';

const BASE_URL =
  'https://raw.githubusercontent.com/faeldon/philippines-json-maps/master/latest/geojson/regions/medres';

// The 18 region codes (PSGC). Each one is a file to download.
const REGION_CODES = [
  100000000, 200000000, 300000000, 400000000, 500000000, 600000000, 700000000,
  800000000, 900000000, 1000000000, 1100000000, 1200000000, 1300000000,
  1400000000, 1600000000, 1700000000, 1800000000, 1900000000,
];

// Downloaded files are kept here (git-ignored) so a second run is instant.
const dataDir = path.resolve(import.meta.dirname, '../../data/boundaries');

// What one province must look like in the file. Anything else is skipped.
const featureSchema = z.object({
  properties: z.object({
    adm2_psgc: z.number().int(),
    adm2_en: z.string().min(1),
    adm1_psgc: z.number().int(),
    // Two areas have no level in the file: the City of Isabela and BARMM's
    // Special Geographic Area. `.nullable()` allows that; we store 'Other'.
    geo_level: z.enum(['Prov', 'Dist']).nullable(),
  }),
  geometry: z.object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    // The shape itself is checked by PostGIS when it is inserted.
    coordinates: z.array(z.unknown()),
  }),
});

const fileSchema = z.object({ features: z.array(z.unknown()) });

/** Returns the file's text, downloading it first if we don't have it yet. */
async function getRegionFile(code: number): Promise<string> {
  const fileName = `provdists-region-${code}.0.01.json`;
  const localPath = path.join(dataDir, fileName);

  try {
    return await readFile(localPath, 'utf8');
  } catch {
    // Not downloaded yet: fall through and fetch it.
  }

  const response = await fetch(`${BASE_URL}/${fileName}`);
  if (!response.ok) {
    throw new Error(`Download failed for ${fileName}: HTTP ${response.status}`);
  }
  const text = await response.text();
  await writeFile(localPath, text);
  return text;
}

try {
  await mkdir(dataDir, { recursive: true });

  let saved = 0;
  let skipped = 0;

  for (const code of REGION_CODES) {
    const file = fileSchema.parse(JSON.parse(await getRegionFile(code)));

    for (const rawFeature of file.features) {
      // `safeParse` doesn't throw: it reports success or failure.
      const parsed = featureSchema.safeParse(rawFeature);
      if (!parsed.success) {
        skipped += 1;
        console.warn(`Skipped a feature in region ${code}: ${parsed.error.message}`);
        continue;
      }
      const { properties, geometry } = parsed.data;

      // "NCR, Second District (Not a Province)" -> "NCR, Second District"
      const name = properties.adm2_en.replace(' (Not a Province)', '');

      // $1, $2 ... are placeholders filled from the list below; this keeps
      // data out of the SQL text (the safe way to pass values).
      //
      // ST_GeomFromGeoJSON reads the shape, ST_MakeValid repairs small
      // drawing errors, ST_CollectionExtract(.., 3) keeps only polygons, and
      // ST_Multi makes it a MultiPolygon even when it is a single piece.
      // ST_PointOnSurface picks a point guaranteed to be inside the province.
      await pool.query(
        `WITH shape AS (
           SELECT ST_Multi(ST_CollectionExtract(ST_MakeValid(
             ST_SetSRID(ST_GeomFromGeoJSON($5), 4326)), 3)) AS geom
         )
         INSERT INTO provinces (psgc, name, region_psgc, geo_level, geom, weather_point)
         SELECT $1, $2, $3, $4, geom, ST_PointOnSurface(geom) FROM shape
         ON CONFLICT (psgc) DO UPDATE SET
           name = EXCLUDED.name,
           region_psgc = EXCLUDED.region_psgc,
           geo_level = EXCLUDED.geo_level,
           geom = EXCLUDED.geom,
           weather_point = EXCLUDED.weather_point`,
        [
          properties.adm2_psgc,
          name,
          properties.adm1_psgc,
          // `??` means "use the right side when the left is null".
          properties.geo_level ?? 'Other',
          JSON.stringify(geometry),
        ],
      );
      saved += 1;
    }
  }

  const total = await pool.query<{ count: number }>('SELECT count(*) FROM provinces');
  console.log(`Saved ${saved} provinces, skipped ${skipped}.`);
  console.log(`The provinces table now has ${total.rows[0]?.count} rows.`);
} catch (error) {
  console.error('Loading provinces failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
