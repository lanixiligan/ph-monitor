// Downloads Project NOAH's hazard maps and saves them in `hazard_zones` and
// `hazard_coverage`. They are shown on the map and the status card, and never
// change the score. One province file at a time.
//
// Run with:  npm run load-hazards -- stormSurge      (all 4 levels, about 2 GB, minutes)
//            npm run load-hazards -- landslide       (about 12.7 GB, hours)
//            npm run load-hazards -- stormSurge --only Siquijor   (one province, to test)
//            npm run load-hazards -- landslide --try data/noah-sample/x
//              (reads the .shp files already in that folder, saves nothing)
// Needs `npm run load-provinces` first, and the `unzip` program.
// Safe to run again: each province's rows are replaced in one transaction.
//
// Source: Hugging Face copy of Project NOAH's maps (bettergovph/project-noah-hazard-maps),
// ODbL. Credit "Project NOAH and its contributors". Each zip is checked against its
// SHA-256 from the file list, and deleted after loading. The files are treated as
// data only: nothing in them is ever run.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
// `import type` brings in types only; they vanish when the script runs.
import type { PoolClient } from 'pg';
import type { HazardMapKind } from '@ph-monitor/shared';
import { pool } from '../src/db.ts';
import { fetchWithRetry } from '../src/fetchers/retry.ts';
import {
  downloadUrl,
  LAYER_FOLDERS,
  listingUrl,
  matchesOnly,
  matchProvinces,
  nextPageUrl,
  normaliseName,
  parseListing,
  shpProvinceName,
} from '../src/hazardLoad.ts';
import type { HazardFile, HazardLayer, ProvinceRow } from '../src/hazardLoad.ts';
import { batchParts, readHazardFeatures } from '../src/hazardShapes.ts';

const workDir = path.resolve(import.meta.dirname, '../../data/hazards');

// Pieces per query, and a cap on points so one query stays a few MB.
const BATCH_PARTS = 2_000;
const BATCH_POINTS = 200_000;

// ---------- Cleaning the shapes (in the database) ----------

// For one batch of pieces of one class: drop pieces under 1,000 m², simplify
// (edges move about 20 m), make valid again (simplifying can break a shape),
// keep only the polygon parts, and cut big pieces into ones of at most 256 points.
const STAGE_SQL = `
  INSERT INTO hazard_stage (hazard_class, geom)
  SELECT $1, piece.geom
  FROM (
    SELECT shape.geom
    FROM unnest($2::text[]) AS input(json)
    CROSS JOIN LATERAL (SELECT ST_SetSRID(ST_GeomFromGeoJSON(input.json), 4326) AS geom) AS shape
    WHERE ST_Area(shape.geom::geography) >= 1000
  ) AS kept
  CROSS JOIN LATERAL ST_Dump(ST_CollectionExtract(ST_MakeValid(ST_SimplifyPreserveTopology(kept.geom, 0.0002)), 3)) AS fixed
  CROSS JOIN LATERAL ST_Subdivide(fixed.geom, 256) AS piece(geom)
  WHERE GeometryType(piece.geom) = 'POLYGON' AND NOT ST_IsEmpty(piece.geom)`;

// A file for one province: every piece belongs to it.
const INSERT_ONE_SQL = `
  INSERT INTO hazard_zones (kind, surge_level, hazard_class, province_psgc, geom)
  SELECT $1, $2, hazard_class, $3, geom FROM hazard_stage`;

// A file for several provinces (Metro Manila → NCR districts): each piece goes
// to the province that holds a point inside it, else to the first one.
const INSERT_MANY_SQL = `
  INSERT INTO hazard_zones (kind, surge_level, hazard_class, province_psgc, geom)
  SELECT $1, $2, stage.hazard_class, COALESCE(inside.psgc, $3), stage.geom
  FROM hazard_stage AS stage
  LEFT JOIN LATERAL (
    SELECT psgc FROM provinces
    WHERE psgc = ANY($4::bigint[]) AND ST_Intersects(geom, ST_PointOnSurface(stage.geom))
    ORDER BY array_position($4::bigint[], psgc)
    LIMIT 1
  ) AS inside ON true`;

const COVERAGE_SQL = `
  INSERT INTO hazard_coverage (kind, surge_level, province_psgc, source_file, sha256, zone_count, loaded_at)
  SELECT $1, $2, covered.psgc, $3, $4,
         (SELECT count(*) FROM hazard_zones AS zone
          WHERE zone.kind = $1 AND zone.surge_level = $2 AND zone.province_psgc = covered.psgc),
         now()
  FROM unnest($5::bigint[]) AS covered(psgc)
  ON CONFLICT (kind, surge_level, province_psgc) DO UPDATE SET
    source_file = EXCLUDED.source_file,
    sha256 = EXCLUDED.sha256,
    zone_count = EXCLUDED.zone_count,
    loaded_at = EXCLUDED.loaded_at
  RETURNING province_psgc, zone_count`;

/** Where a .shp came from, for `hazard_coverage`. */
type Source = { path: string; sha256: string };

/**
 * Saves one .shp: its pieces are cleaned into a temporary table, then the
 * provinces' old rows are swapped for the new ones in one transaction.
 * `save: false` (for --try) rolls everything back. Answer: zones per province,
 * or the reason the file was refused (then nothing changes).
 */
async function saveShapefile(
  shpPath: string,
  layer: HazardLayer,
  psgcs: number[],
  source: Source,
  save: boolean,
): Promise<Map<number, number> | string> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    // ON COMMIT DROP: the table disappears when the transaction ends.
    await client.query(
      `CREATE TEMP TABLE hazard_stage (hazard_class SMALLINT NOT NULL, geom geometry(Polygon, 4326) NOT NULL)
       ON COMMIT DROP`,
    );

    let shapes = 0;
    for await (const feature of readHazardFeatures(shpPath, layer.kind)) {
      // A refused shape would leave a class missing, which would read as "not in
      // a zone". Unknown is never calm, so the whole file is refused instead.
      if (typeof feature === 'string') {
        await client.query('ROLLBACK');
        return feature;
      }
      shapes += 1;
      for (const batch of batchParts(feature.parts, BATCH_PARTS, BATCH_POINTS)) {
        // Each piece is turned into GeoJSON text on its own, never the whole shape.
        const json = batch.map((coordinates) => JSON.stringify({ type: 'Polygon', coordinates }));
        await client.query(STAGE_SQL, [feature.hazardClass, json]);
      }
    }
    if (shapes === 0) {
      await client.query('ROLLBACK');
      return 'the file has no shapes';
    }

    await client.query('DELETE FROM hazard_zones WHERE kind = $1 AND surge_level = $2 AND province_psgc = ANY($3)', [
      layer.kind,
      layer.surgeLevel,
      psgcs,
    ]);
    if (psgcs.length === 1) {
      await client.query(INSERT_ONE_SQL, [layer.kind, layer.surgeLevel, psgcs[0]]);
    } else {
      await client.query(INSERT_MANY_SQL, [layer.kind, layer.surgeLevel, psgcs[0], psgcs]);
    }
    // `query<{...}>` says what each answer row looks like.
    const coverage = await client.query<{ province_psgc: number; zone_count: number }>(COVERAGE_SQL, [
      layer.kind,
      layer.surgeLevel,
      source.path,
      source.sha256,
      psgcs,
    ]);
    await client.query(save ? 'COMMIT' : 'ROLLBACK');
    return new Map(coverage.rows.map((row) => [row.province_psgc, row.zone_count]));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------- Files ----------

/** Every layer zip in one folder of the data set, following the pages of the list. */
async function listFiles(folder: string): Promise<HazardFile[]> {
  const files: HazardFile[] = [];
  let url: string | null = listingUrl(folder);
  while (url) {
    const response = await fetchWithRetry(url, () => ({ signal: AbortSignal.timeout(60_000) }));
    files.push(...parseListing(await response.json()));
    url = nextPageUrl(response.headers.get('link'));
  }
  return files;
}

// A download that sends nothing for this long is given up (it sometimes hangs).
const STALL_MS = 60_000;

/** Downloads one zip into `target` and gives back its SHA-256. Tries twice. */
async function download(file: HazardFile, target: string): Promise<string> {
  try {
    return await downloadOnce(file, target);
  } catch (error) {
    console.warn(`  download failed (${error instanceof Error ? error.message : String(error)}); trying once more`);
    return await downloadOnce(file, target);
  }
}

async function downloadOnce(file: HazardFile, target: string): Promise<string> {
  // The timer starts again every time a chunk arrives; if it runs out, the
  // download is stopped.
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(new Error('download stalled')), STALL_MS);
  const handle = await open(target, 'w');
  try {
    const response = await fetch(downloadUrl(file.path), { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
    const hash = createHash('sha256');
    // The file arrives in chunks; each is hashed and written as it comes.
    for await (const chunk of response.body) {
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(new Error('download stalled')), STALL_MS);
      hash.update(chunk);
      await handle.write(chunk);
    }
    return hash.digest('hex');
  } finally {
    clearTimeout(timer);
    await handle.close();
  }
}

/** The .shp files in a folder and its subfolders (real files only, no links). */
async function findShapefiles(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.shp$/i.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name))
    .sort();
}

// ---------- The run ----------

// What happened to each file, for the summary at the end.
const loaded: { layer: HazardLayer; zones: number }[] = [];
const skipped: { file: string; reason: string }[] = [];

function skip(file: string, reason: string): void {
  console.warn(`Skipped ${file}: ${reason}`);
  skipped.push({ file, reason });
}

const layerName = (layer: HazardLayer) => (layer.kind === 'landslide' ? 'landslide' : `surge SSA${layer.surgeLevel}`);

/**
 * Loads every .shp of one unpacked zip. `loadedShp` and `loadedProvince` stop a
 * file or a province from being loaded twice in one run.
 */
async function loadShapefiles(
  shpPaths: string[],
  layerOf: (shpName: string) => HazardLayer | null,
  context: {
    zipName: string;
    source: Source;
    provinces: ProvinceRow[];
    ownZips: Set<string>;
    loadedShp: Set<string>;
    loadedProvince: Map<string, string>;
    save: boolean;
  },
): Promise<void> {
  if (shpPaths.length === 0) skip(context.zipName, 'no .shp file inside');
  for (const shpPath of shpPaths) {
    const shpName = path.basename(shpPath);
    const label = `${context.zipName} → ${shpName}`;
    const layer = layerOf(shpName);
    const provinceName = layer ? shpProvinceName(shpName, layer) : null;
    if (!layer || !provinceName) {
      skip(label, 'name does not fit this layer');
      continue;
    }
    // A neighbour's copy inside another province's zip (Leyte, Samar, Cotabato):
    // skip it when that neighbour has its own zip, which is loaded instead.
    const zipProvince = context.zipName.replace(/\.zip$/i, '');
    if (normaliseName(provinceName) !== normaliseName(zipProvince) && context.ownZips.has(normaliseName(provinceName))) {
      console.log(`  ${label}: a copy; that province has its own zip`);
      continue;
    }
    const shpKey = `${layer.kind}/${layer.surgeLevel}/${shpName.toLowerCase()}`;
    if (context.loadedShp.has(shpKey)) {
      console.log(`  ${label}: already loaded in this run`);
      continue;
    }
    const match = matchProvinces(provinceName, context.provinces);
    if ('problem' in match) {
      skip(label, match.problem);
      continue;
    }
    const provinceKeys = match.psgcs.map((psgc) => `${layer.kind}/${layer.surgeLevel}/${psgc}`);
    const clash = provinceKeys.map((key) => context.loadedProvince.get(key)).find(Boolean);
    if (clash) {
      skip(label, `its province was already loaded from ${clash}`);
      continue;
    }

    const started = Date.now();
    const result = await saveShapefile(shpPath, layer, match.psgcs, context.source, context.save);
    if (typeof result === 'string') {
      skip(label, result);
      continue;
    }
    context.loadedShp.add(shpKey);
    for (const key of provinceKeys) context.loadedProvince.set(key, label);
    const zones = [...result.values()].reduce((sum, count) => sum + count, 0);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const perProvince = result.size > 1 ? ` (${[...result.values()].join(' + ')})` : '';
    console.log(`  ${layerName(layer)} ${provinceName}: ${zones} zones${perProvince} in ${seconds} s`);
    loaded.push({ layer, zones });
  }
}

async function readProvinces(): Promise<ProvinceRow[]> {
  const result = await pool.query<ProvinceRow>('SELECT psgc, name, geo_level AS "geoLevel" FROM provinces ORDER BY psgc');
  if (result.rows.length === 0) throw new Error('No provinces in the database. Run `npm run load-provinces` first.');
  return result.rows;
}

/** Downloads, checks, unpacks and loads every zip of one kind. */
async function loadFromDataSet(kind: HazardMapKind, only: string | undefined): Promise<void> {
  const provinces = await readProvinces();
  const all = (await listFiles(LAYER_FOLDERS[kind])).sort((a, b) => a.path.localeCompare(b.path));
  const files = only ? all.filter((file) => matchesOnly(file.path, only)) : all;
  console.log(`${files.length} files to load (${(files.reduce((sum, file) => sum + file.size, 0) / 1e6).toFixed(0)} MB).`);
  if (files.length === 0) return;

  const loadedShp = new Set<string>();
  const loadedProvince = new Map<string, string>();
  await mkdir(workDir, { recursive: true });

  for (const file of files) {
    const zipName = path.basename(file.path);
    const label = `${layerName(file)} ${zipName}`;
    // Province names that have a zip of their own at this level.
    const ownZips = new Set(
      all
        .filter((other) => other.surgeLevel === file.surgeLevel)
        .map((other) => normaliseName(path.basename(other.path).replace(/\.zip$/i, ''))),
    );
    const zipPath = path.join(workDir, `${kind}-${file.surgeLevel}-${zipName}`);
    let unpacked: string | null = null;
    try {
      console.log(`${label}: downloading ${(file.size / 1e6).toFixed(1)} MB`);
      const sha256 = await download(file, zipPath);
      if (sha256 !== file.sha256) {
        skip(label, `SHA-256 is ${sha256}, the list says ${file.sha256}`);
        continue;
      }
      unpacked = await mkdtemp(path.join(workDir, 'unzip-'));
      // -qq: quiet, -o: overwrite, -d: into this folder. unzip leaves out any
      // "../" in names, so nothing lands outside the folder.
      execFileSync('unzip', ['-qq', '-o', zipPath, '-d', unpacked]);
      await loadShapefiles(await findShapefiles(unpacked), () => file, {
        zipName,
        source: { path: file.path, sha256 },
        provinces,
        ownZips,
        loadedShp,
        loadedProvince,
        save: true,
      });
    } catch (error) {
      skip(label, error instanceof Error ? error.message : String(error));
    } finally {
      // The owner's choice: keep no zips or unpacked files after loading.
      await rm(zipPath, { force: true });
      if (unpacked) await rm(unpacked, { recursive: true, force: true });
    }
  }
}

/** --try: reads the .shp files already in a folder and saves nothing. */
async function tryFolder(kind: HazardMapKind, folder: string): Promise<void> {
  const provinces = await readProvinces();
  const layerOf = (shpName: string): HazardLayer | null => {
    if (kind === 'landslide') return { kind, surgeLevel: 0 };
    const level = /_SSA([1-4])\.shp$/i.exec(shpName);
    return level ? { kind, surgeLevel: Number(level[1]) } : null;
  };
  // npm runs the script inside server/; INIT_CWD is the folder the command was typed in.
  const shpPaths = (await findShapefiles(path.resolve(process.env.INIT_CWD ?? process.cwd(), folder))).filter((shpPath) => {
    const layer = layerOf(path.basename(shpPath));
    return layer !== null && shpProvinceName(path.basename(shpPath), layer) !== null;
  });
  console.log(`Trying ${shpPaths.length} files from ${folder} (nothing is saved).`);
  await loadShapefiles(shpPaths, layerOf, {
    zipName: path.basename(folder),
    source: { path: `try:${folder}`, sha256: '-' },
    provinces,
    ownZips: new Set(),
    loadedShp: new Set(),
    loadedProvince: new Map(),
    save: false,
  });
}

function printSummary(seconds: number, saved: boolean): void {
  console.log(`\n${saved ? 'Loaded' : 'Tried'} ${loaded.length} files, skipped ${skipped.length}, in ${(seconds / 60).toFixed(1)} min.`);
  const perLayer = new Map<string, { files: number; zones: number }>();
  for (const file of loaded) {
    const row = perLayer.get(layerName(file.layer)) ?? { files: 0, zones: 0 };
    row.files += 1;
    row.zones += file.zones;
    perLayer.set(layerName(file.layer), row);
  }
  console.table([...perLayer.entries()].sort().map(([layer, row]) => ({ layer, ...row })));
  if (skipped.length > 0) console.table(skipped);
}

// ---------- Command line ----------

const started = Date.now();
let saved = true;
try {
  // `parseArgs` reads the words after the script name: a kind and two options.
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { only: { type: 'string' }, try: { type: 'string' } },
  });
  const kind = positionals[0];
  if (kind !== 'stormSurge' && kind !== 'landslide') {
    throw new Error('Say which map: `npm run load-hazards -- stormSurge` or `-- landslide`.');
  }
  if (values.try) {
    saved = false;
    await tryFolder(kind, values.try);
  } else {
    await loadFromDataSet(kind, values.only);
  }
  printSummary((Date.now() - started) / 1000, saved);
} catch (error) {
  console.error('Loading hazard maps failed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
