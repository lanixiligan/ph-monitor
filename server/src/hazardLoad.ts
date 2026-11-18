// Helpers for `npm run load-hazards` (scripts/load-hazards.ts): where the NOAH
// hazard files are, which layer a file belongs to, and which of our provinces
// a file covers. Pure functions, no network and no database, so they can be
// tested (test/hazardLoad.test.ts).
//
// Source: the Hugging Face copy of Project NOAH's hazard maps
// (bettergovph/project-noah-hazard-maps), byte for byte the same as NOAH's own.

import { z } from 'zod';
import type { HazardMapKind } from '@ph-monitor/shared';

export const DATASET = 'bettergovph/project-noah-hazard-maps';

/** The folder of each layer inside the data set. `Record<A, B>`: an object with a B for every A. */
export const LAYER_FOLDERS: Record<HazardMapKind, string> = {
  stormSurge: 'Storm Surge',
  landslide: 'Landslide/LandslideHazards',
};

/** One map layer: storm surge level 1 to 4, or landslide (level 0). */
export type HazardLayer = { kind: HazardMapKind; surgeLevel: number };

/** One zip in the data set that holds a layer for a province. `&` joins two types' fields. */
export type HazardFile = HazardLayer & { path: string; size: number; sha256: string };

/** A province as the loader needs it (from our `provinces` table). */
export type ProvinceRow = { psgc: number; name: string; geoLevel: string };

/** The link that lists the files in one folder (first page). */
export function listingUrl(folder: string): string {
  return `https://huggingface.co/api/datasets/${DATASET}/tree/main/${encodePath(folder)}?recursive=true&expand=true`;
}

/** The link that downloads one file. Spaces and other odd letters are encoded. */
export function downloadUrl(filePath: string): string {
  return `https://huggingface.co/datasets/${DATASET}/resolve/main/${encodePath(filePath)}`;
}

function encodePath(filePath: string): string {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

/**
 * Which layer a path in the data set holds, or null for any other file.
 * 'Storm Surge/StormSurgeAdvisory3/Leyte.zip' → storm surge level 3;
 * 'Landslide/LandslideHazards/Benguet.zip' → landslide.
 */
export function layerOfPath(filePath: string): HazardLayer | null {
  const surge = /^Storm Surge\/StormSurgeAdvisory([1-4])\/[^/]+\.zip$/.exec(filePath);
  if (surge) return { kind: 'stormSurge', surgeLevel: Number(surge[1]) };
  if (/^Landslide\/LandslideHazards\/[^/]+\.zip$/.test(filePath)) return { kind: 'landslide', surgeLevel: 0 };
  return null;
}

/**
 * The province part of a .shp file name, or null if the name does not fit
 * the layer: 'SouthernLeyte_StormSurge_SSA3.shp' → 'SouthernLeyte'.
 * A storm surge file must name the same level as its folder.
 */
export function shpProvinceName(shpName: string, layer: HazardLayer): string | null {
  if (layer.kind === 'stormSurge') {
    // `.+?` takes as few letters as it can, so 'Davao_del_Norte_StormSurge_SSA1' works.
    const match = /^(.+?)_StormSurge_SSA([1-4])\.shp$/i.exec(shpName);
    if (!match || Number(match[2]) !== layer.surgeLevel) return null;
    return match[1] ?? null;
  }
  const match = /^(.+?)_LandslideHazards\.shp$/i.exec(shpName);
  return match?.[1] ?? null; // `?.` gives undefined instead of failing when there is no match
}

/** True if `only` (from `--only`) names this zip: 'Siquijor' or 'Siquijor.zip'. */
export function matchesOnly(filePath: string, only: string): boolean {
  const zipName = filePath.split('/').pop() ?? '';
  return zipName.toLowerCase().replace(/\.zip$/, '') === only.toLowerCase().replace(/\.zip$/, '');
}

// ---------- The file list ----------

// One entry of the Hugging Face file list. `lfs.oid` is the file's SHA-256.
const entrySchema = z.object({
  type: z.string(),
  path: z.string(),
  size: z.number().int().nonnegative(),
  lfs: z.object({ oid: z.string().regex(/^[0-9a-f]{64}$/) }).optional(),
});

/**
 * The layer zips in one page of the file list. A zip without a hash is left
 * out, because its download could not be checked. Throws if the page is not
 * a file list at all.
 */
export function parseListing(json: unknown): HazardFile[] {
  const entries = z.array(entrySchema).parse(json);
  const files: HazardFile[] = [];
  for (const entry of entries) {
    const layer = layerOfPath(entry.path);
    if (entry.type !== 'file' || !layer || !entry.lfs) continue;
    files.push({ path: entry.path, size: entry.size, sha256: entry.lfs.oid, ...layer });
  }
  return files;
}

/** The next page's link from a `Link` header, or null on the last page. */
export function nextPageUrl(linkHeader: string | null): string | null {
  const match = /<([^>]+)>;\s*rel="next"/.exec(linkHeader ?? '');
  return match?.[1] ?? null;
}

// ---------- File names → our provinces ----------

/** 'Tawi-Tawi', 'TawiTawi' and 'tawi_tawi' all become 'tawitawi'. */
export function normaliseName(name: string): string {
  // NFD splits 'ñ' into 'n' plus a mark; the marks are then removed.
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Either our province names, or every province of one geo level. */
type ProvinceRule = { names: string[] } | { geoLevel: string };

/**
 * NOAH file names that do not match one of our province names. Each was checked
 * by hand; anything else that does not match is skipped, never guessed.
 */
export const NAME_OVERRIDES: Record<string, ProvinceRule> = {
  // Metro Manila is split into four NCR districts in our table (geo level 'Dist').
  metromanila: { geoLevel: 'Dist' },
  // Compostela Valley was renamed Davao de Oro in 2019.
  compostelavalley: { names: ['Davao de Oro'] },
  // Maguindanao was split in two in 2022.
  maguindanao: { names: ['Maguindanao del Norte', 'Maguindanao del Sur'] },
  // Basilan's file also covers the City of Isabela (checked: its storm surge
  // pieces reach into the city), which our table keeps as its own area.
  basilan: { names: ['Basilan', 'City of Isabela'] },
};

/**
 * Which of our provinces a NOAH file name covers. Most names match exactly
 * once spaces and case are ignored; the rest come from NAME_OVERRIDES.
 * Answer: the province codes, or the reason there is no safe match.
 */
export function matchProvinces(fileName: string, provinces: ProvinceRow[]): { psgcs: number[] } | { problem: string } {
  const key = normaliseName(fileName);
  const rule = NAME_OVERRIDES[key];

  if (!rule) {
    const found = provinces.filter((province) => normaliseName(province.name) === key);
    if (found.length === 1 && found[0]) return { psgcs: [found[0].psgc] };
    if (found.length > 1) return { problem: `"${fileName}" matches ${found.length} provinces` };
    return { problem: `no province named like "${fileName}"` };
  }

  // `'geoLevel' in rule` tells the two kinds of rule apart.
  if ('geoLevel' in rule) {
    const found = provinces.filter((province) => province.geoLevel === rule.geoLevel);
    if (found.length === 0) return { problem: `no provinces with geo level ${rule.geoLevel} for "${fileName}"` };
    return { psgcs: found.map((province) => province.psgc) };
  }

  const psgcs: number[] = [];
  for (const name of rule.names) {
    const province = provinces.find((row) => row.name === name);
    if (!province) return { problem: `override for "${fileName}" names "${name}", which is not in the database` };
    psgcs.push(province.psgc);
  }
  return { psgcs };
}
