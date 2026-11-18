// Tests for the hazard map loader's helpers (src/hazardLoad.ts and
// src/hazardShapes.ts). Run with: npm test
// No network and no database. The last test reads the NOAH sample files in
// data/noah-sample/x/ when they are there, and is skipped when they are not.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  downloadUrl,
  layerOfPath,
  matchesOnly,
  matchProvinces,
  nextPageUrl,
  normaliseName,
  parseListing,
  shpProvinceName,
} from '../src/hazardLoad.ts';
import type { ProvinceRow } from '../src/hazardLoad.ts';
import { batchParts, parseHazardClass, parseHazardFeature, polygonParts, readHazardFeatures } from '../src/hazardShapes.ts';

// ---------- Paths in the data set ----------

test('the folder gives the layer: storm surge level 1-4, landslide 0', () => {
  assert.deepEqual(layerOfPath('Storm Surge/StormSurgeAdvisory3/Leyte.zip'), { kind: 'stormSurge', surgeLevel: 3 });
  assert.deepEqual(layerOfPath('Landslide/LandslideHazards/Benguet.zip'), { kind: 'landslide', surgeLevel: 0 });
});

test('other files in the data set are not layers', () => {
  assert.equal(layerOfPath('Storm Surge/01ReadMe_StormSurge.pdf'), null);
  assert.equal(layerOfPath('Storm Surge/StormSurgeAdvisory1/metadata_stormsurge.txt'), null);
  assert.equal(layerOfPath('Storm Surge/StormSurgeAdvisory5/Leyte.zip'), null);
  assert.equal(layerOfPath('Landslide/DebrisFlowAlluvialFan/Philippines_DebrisFlow.zip'), null);
});

test('the province comes from the .shp name, and its level must match the folder', () => {
  // `as const` keeps 'stormSurge' as that exact word instead of any string.
  const surge3 = { kind: 'stormSurge', surgeLevel: 3 } as const;
  const landslide = { kind: 'landslide', surgeLevel: 0 } as const;
  assert.equal(shpProvinceName('SouthernLeyte_StormSurge_SSA3.shp', surge3), 'SouthernLeyte');
  assert.equal(shpProvinceName('Davao_del_Norte_StormSurge_SSA3.shp', surge3), 'Davao_del_Norte');
  assert.equal(shpProvinceName('Benguet_LandslideHazards.shp', landslide), 'Benguet');
  // A level-1 file inside a level-3 folder is not trusted.
  assert.equal(shpProvinceName('Leyte_StormSurge_SSA1.shp', surge3), null);
  // A landslide file in a storm surge folder, or a name we don't know.
  assert.equal(shpProvinceName('Benguet_LandslideHazards.shp', surge3), null);
  assert.equal(shpProvinceName('Leyte.shp', surge3), null);
});

test('download links encode spaces but keep the slashes', () => {
  assert.equal(
    downloadUrl('Storm Surge/StormSurgeAdvisory1/Siquijor.zip'),
    'https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps/resolve/main/Storm%20Surge/StormSurgeAdvisory1/Siquijor.zip',
  );
});

test('--only picks a zip by its name, in any case', () => {
  assert.equal(matchesOnly('Storm Surge/StormSurgeAdvisory2/Siquijor.zip', 'Siquijor'), true);
  assert.equal(matchesOnly('Storm Surge/StormSurgeAdvisory2/Siquijor.zip', 'siquijor.zip'), true);
  assert.equal(matchesOnly('Storm Surge/StormSurgeAdvisory2/SouthernLeyte.zip', 'Leyte'), false);
});

// ---------- The file list ----------

const sha = 'a'.repeat(64);

test('the file list keeps only layer zips that have a hash', () => {
  const page = [
    { type: 'directory', path: 'Storm Surge/StormSurgeAdvisory1', size: 0 },
    { type: 'file', path: 'Storm Surge/StormSurgeAdvisory1/Albay.zip', size: 10, lfs: { oid: sha, size: 10 } },
    { type: 'file', path: 'Storm Surge/StormSurgeAdvisory1/metadata_stormsurge.txt', size: 5 },
    { type: 'file', path: 'Storm Surge/01ReadMe_StormSurge.pdf', size: 9, lfs: { oid: sha, size: 9 } },
    // No hash: it cannot be checked, so it is left out.
    { type: 'file', path: 'Storm Surge/StormSurgeAdvisory1/Aklan.zip', size: 10 },
  ];
  assert.deepEqual(parseListing(page), [
    { path: 'Storm Surge/StormSurgeAdvisory1/Albay.zip', size: 10, sha256: sha, kind: 'stormSurge', surgeLevel: 1 },
  ]);
});

test('a broken file list is an error, not an empty list', () => {
  assert.throws(() => parseListing({ error: 'not found' }));
});

test('the next page comes from the Link header', () => {
  const next = 'https://huggingface.co/api/datasets/x/tree/main/Storm%20Surge?cursor=abc%3D%3D';
  assert.equal(nextPageUrl(`<${next}>; rel="next"`), next);
  assert.equal(nextPageUrl('<https://example.org/a>; rel="prev"'), null);
  assert.equal(nextPageUrl(null), null);
});

// ---------- File names → our provinces ----------

const provinces: ProvinceRow[] = [
  { psgc: 1, name: 'Agusan del Norte', geoLevel: 'Prov' },
  { psgc: 2, name: 'Tawi-Tawi', geoLevel: 'Prov' },
  { psgc: 3, name: 'Davao de Oro', geoLevel: 'Prov' },
  { psgc: 4, name: 'NCR, City of Manila, First District', geoLevel: 'Dist' },
  { psgc: 5, name: 'NCR, Second District', geoLevel: 'Dist' },
  { psgc: 6, name: 'Maguindanao del Norte', geoLevel: 'Prov' },
  { psgc: 7, name: 'Maguindanao del Sur', geoLevel: 'Prov' },
  { psgc: 8, name: 'Isabela', geoLevel: 'Prov' },
  { psgc: 9, name: 'City of Isabela', geoLevel: 'Other' },
  { psgc: 10, name: 'Southern Leyte', geoLevel: 'Prov' },
];

test('names are compared without case, spaces, dashes or accents', () => {
  assert.equal(normaliseName('Agusan del Norte'), 'agusandelnorte');
  assert.equal(normaliseName('AgusanDelNorte'), 'agusandelnorte');
  assert.equal(normaliseName('Tawi-Tawi'), 'tawitawi');
  assert.equal(normaliseName('Davao_del_Norte'), 'davaodelnorte');
  assert.equal(normaliseName('Parañaque'), 'paranaque');
});

test('file names that run words together find their province', () => {
  assert.deepEqual(matchProvinces('AgusanDelNorte', provinces), { psgcs: [1] });
  assert.deepEqual(matchProvinces('TawiTawi', provinces), { psgcs: [2] });
  assert.deepEqual(matchProvinces('SouthernLeyte', provinces), { psgcs: [10] });
  // "Isabela" is the province, never the city.
  assert.deepEqual(matchProvinces('Isabela', provinces), { psgcs: [8] });
});

test('the override list handles renamed and split provinces', () => {
  assert.deepEqual(matchProvinces('CompostelaValley', provinces), { psgcs: [3] });
  assert.deepEqual(matchProvinces('Maguindanao', provinces), { psgcs: [6, 7] });
  // Metro Manila → every NCR district.
  assert.deepEqual(matchProvinces('MetroManila', provinces), { psgcs: [4, 5] });
  // Basilan's file also covers the City of Isabela, which our table keeps apart.
  assert.deepEqual(matchProvinces('Basilan', [...provinces, { psgc: 12, name: 'Basilan', geoLevel: 'Prov' }]), {
    psgcs: [12, 9],
  });
});

test('a name we cannot match is never guessed', () => {
  const result = matchProvinces('NorthCotabato', provinces);
  assert.ok('problem' in result);
  // An override that names a province missing from the database fails too.
  const withoutDavaoDeOro = provinces.filter((province) => province.psgc !== 3);
  assert.ok('problem' in matchProvinces('CompostelaValley', withoutDavaoDeOro));
});

test('two provinces with the same name are not guessed between', () => {
  const twice = [...provinces, { psgc: 11, name: 'Tawi Tawi', geoLevel: 'Prov' }];
  assert.ok('problem' in matchProvinces('TawiTawi', twice));
});

// ---------- Classes, features, pieces ----------

test('the class may be text or a number; it is rounded and must be 1-3', () => {
  assert.equal(parseHazardClass('1'), 1);
  assert.equal(parseHazardClass(2), 2);
  assert.equal(parseHazardClass(3.0), 3);
  assert.equal(parseHazardClass(' 2 '), 2);
  assert.equal(parseHazardClass(0), null);
  assert.equal(parseHazardClass(4), null);
  assert.equal(parseHazardClass(''), null);
  assert.equal(parseHazardClass('high'), null);
  assert.equal(parseHazardClass(null), null);
});

const square = [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]];

test('a feature is read with the field of its layer: HAZ or LH', () => {
  const surge = { type: 'Feature', properties: { HAZ: '3' }, geometry: { type: 'Polygon', coordinates: square } };
  assert.deepEqual(parseHazardFeature(surge, 'stormSurge'), { hazardClass: 3, parts: [square] });
  const slide = { type: 'Feature', properties: { LH: 1 }, geometry: { type: 'MultiPolygon', coordinates: [square, square] } };
  assert.deepEqual(parseHazardFeature(slide, 'landslide'), { hazardClass: 1, parts: [square, square] });
});

test('a feature with the wrong field, a bad class or no polygon is refused', () => {
  const wrongField = { type: 'Feature', properties: { HAZ: 1 }, geometry: { type: 'Polygon', coordinates: square } };
  assert.equal(typeof parseHazardFeature(wrongField, 'landslide'), 'string');
  const badClass = { type: 'Feature', properties: { HAZ: 7 }, geometry: { type: 'Polygon', coordinates: square } };
  assert.equal(typeof parseHazardFeature(badClass, 'stormSurge'), 'string');
  const line = { type: 'Feature', properties: { HAZ: 1 }, geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } };
  assert.equal(typeof parseHazardFeature(line, 'stormSurge'), 'string');
  const noShape = { type: 'Feature', properties: { HAZ: 1 }, geometry: null };
  assert.equal(typeof parseHazardFeature(noShape, 'stormSurge'), 'string');
});

test('a multipolygon splits into single polygons', () => {
  assert.deepEqual(polygonParts({ type: 'Polygon', coordinates: square }), [square]);
  assert.deepEqual(polygonParts({ type: 'MultiPolygon', coordinates: [square, square, square] }), [square, square, square]);
});

test('pieces are sent in batches limited by count and by points', () => {
  const parts = [square, square, square, square, square]; // 5 points each
  assert.deepEqual(
    batchParts(parts, 2, 1000).map((batch) => batch.length),
    [2, 2, 1],
  );
  // At most 12 points per batch: two squares (10 points) fit, a third does not.
  assert.deepEqual(
    batchParts(parts, 100, 12).map((batch) => batch.length),
    [2, 2, 1],
  );
  // One piece bigger than the point limit still goes, alone.
  assert.deepEqual(batchParts([square], 100, 3).map((batch) => batch.length), [1]);
  assert.deepEqual(batchParts([], 100, 3), []);
});

// ---------- The real sample files (skipped when they are not there) ----------

const sampleDir = path.resolve(import.meta.dirname, '../../data/noah-sample/x');
const samples = [
  { file: 'Siquijor_StormSurge_SSA1', kind: 'stormSurge' },
  { file: 'Siquijor_LandslideHazards', kind: 'landslide' },
] as const;

test('the NOAH sample files read as three classes each', { skip: !existsSync(sampleDir) }, async () => {
  for (const sample of samples) {
    const features = [];
    for await (const feature of readHazardFeatures(path.join(sampleDir, `${sample.file}.shp`), sample.kind)) {
      features.push(feature);
    }
    const classes = features.map((feature) => (typeof feature === 'string' ? feature : feature.hazardClass));
    assert.deepEqual(classes.sort(), [1, 2, 3], sample.file);
    for (const feature of features) {
      if (typeof feature !== 'string') assert.ok(feature.parts.length > 100, sample.file);
    }
  }
});
