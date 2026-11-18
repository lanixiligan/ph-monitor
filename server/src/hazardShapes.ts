// Reading the shapes in one NOAH hazard file (for scripts/load-hazards.ts):
// the class of each shape, its pieces, and the batches they are sent in.
// Each file holds three shapes, one per class (1 low, 2 medium, 3 high), each
// made of up to about 200,000 pieces. Tested in test/hazardLoad.test.ts.

import { open } from 'shapefile';
import { z } from 'zod';
import type { HazardClass, HazardMapKind } from '@ph-monitor/shared';

/** The field that holds the class: `HAZ` for storm surge, `LH` for landslide. */
export const CLASS_FIELD: Record<HazardMapKind, string> = { stormSurge: 'HAZ', landslide: 'LH' };

/** One ring: a list of [longitude, latitude] points, the last one equal to the first. */
export type Ring = number[][];
/** One polygon: its outer ring, then any holes. */
export type PolygonCoords = Ring[];

/** One shape of a file, checked: its class and its single polygons. */
export type HazardFeature = { hazardClass: HazardClass; parts: PolygonCoords[] };

// The class is sometimes the text "1" and sometimes a number such as 1.0.
const classSchema = z.union([z.number(), z.string().trim().min(1)]).transform(Number).pipe(z.number().finite());

/** The class as 1, 2 or 3, or null if the value is not one of them. */
export function parseHazardClass(value: unknown): HazardClass | null {
  const parsed = classSchema.safeParse(value);
  if (!parsed.success) return null;
  const rounded = Math.round(parsed.data);
  return rounded === 1 || rounded === 2 || rounded === 3 ? rounded : null;
}

const position = z.array(z.number()).min(2);
const ring = z.array(position).min(4);
const polygon = z.array(ring).min(1);
// `z.discriminatedUnion` picks the right shape by the `type` field.
const geometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: polygon }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygon) }),
]);
const featureSchema = z.object({
  properties: z.record(z.string(), z.unknown()),
  geometry: geometrySchema,
});

/** A checked polygon or multipolygon. `z.infer` turns the zod schema into a type. */
export type HazardGeometry = z.infer<typeof geometrySchema>;

/** A multipolygon's single polygons (a polygon is just itself). */
export function polygonParts(geometry: HazardGeometry): PolygonCoords[] {
  return geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
}

/**
 * Checks one shape from the file. Answer: the shape, or a sentence saying
 * why it was refused (so the loader can log it and carry on).
 */
// `unknown`: anything at all, which must be checked before use; `|` means "one or the other".
export function parseHazardFeature(raw: unknown, kind: HazardMapKind): HazardFeature | string {
  const parsed = featureSchema.safeParse(raw);
  if (!parsed.success) return `not a polygon shape: ${z.prettifyError(parsed.error).slice(0, 200)}`;
  const field = CLASS_FIELD[kind];
  const value = parsed.data.properties[field];
  const hazardClass = parseHazardClass(value);
  if (hazardClass === null) return `field ${field} is ${JSON.stringify(value) ?? 'missing'}, not a class 1-3`;
  return { hazardClass, parts: polygonParts(parsed.data.geometry) };
}

/**
 * Splits the pieces into batches of at most `maxParts` pieces and about
 * `maxPoints` points, so no single query gets too big. A piece larger than
 * `maxPoints` goes in a batch of its own.
 */
export function batchParts(parts: PolygonCoords[], maxParts: number, maxPoints: number): PolygonCoords[][] {
  const batches: PolygonCoords[][] = [];
  let batch: PolygonCoords[] = [];
  let points = 0;
  for (const part of parts) {
    const size = part.reduce((sum, partRing) => sum + partRing.length, 0);
    if (batch.length > 0 && (batch.length >= maxParts || points + size > maxPoints)) {
      batches.push(batch);
      batch = [];
      points = 0;
    }
    batch.push(part);
    points += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}

/**
 * Reads the shapes of one .shp file (and the .dbf beside it), one at a time.
 * Each answer is a checked shape or the reason it was refused.
 * `async function*` makes a list that arrives piece by piece (`for await`).
 */
export async function* readHazardFeatures(shpPath: string, kind: HazardMapKind): AsyncGenerator<HazardFeature | string> {
  const source = await open(shpPath, shpPath.replace(/\.shp$/i, '.dbf'));
  for (;;) {
    const result = await source.read();
    if (result.done) return;
    yield parseHazardFeature(result.value, kind);
  }
}
