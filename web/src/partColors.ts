// How a "part of the score" view (Earthquake, Flood) colours each town and
// province: by that one part of the score, with the same score colours
// (scoreScale.ts), so no new warm scale is added. It reuses the score's
// layers: each shape gets a `color`, `noData` and `incomplete`, so the map's
// fill and stripe layers work unchanged. A display layer only: nothing here
// touches the score.
//
// Adding another part view means adding a row to PART_VIEWS (and its words).
// The theme and the no-data colour are passed in (not read from the page),
// so tests need no browser.

// `import type` brings in types only; they vanish when the code runs.
import type { MapViewId, PlaceScoreEntry, PlaceScores, ProvinceMapProperties } from '@ph-monitor/shared';
import type { PlaceCollection, ProvinceCollection } from './api.ts';
import type { Strings } from './i18n/index.ts';
import { bandColors, bandFor } from './scoreScale.ts';
import type { Theme } from './theme/index.ts';

/** The views that colour the map by one part of the score. `'a' | 'b'` = exactly one of these. */
export type PartViewId = 'earthquake' | 'flood';

/** One part read off a town or a province. score null = unknown (striped, never calm). */
type PartValue = { score: number | null; unknown: boolean };

/** Where a view finds its part: in a town's score entry, and in a province's map data. */
// `PartValue & { topPlace }` = a PartValue with one more field.
type PartRule = {
  town: (entry: PlaceScoreEntry) => PartValue;
  province: (props: ProvinceMapProperties) => PartValue & { topPlace: string | null };
};

// `Record<PartViewId, PartRule>` = one rule for each part view.
const PART_VIEWS: Record<PartViewId, PartRule> = {
  earthquake: {
    town: (entry) => ({ score: entry.quakeScore, unknown: entry.quakeUnknown }),
    province: (props) => ({ score: props.quake_top_score, unknown: props.quake_unknown, topPlace: props.quake_top_place }),
  },
  // A town's rain is either known or null (no reading): there is no "at least" for one town.
  flood: {
    town: (entry) => ({ score: entry.rainScore, unknown: false }),
    province: (props) => ({ score: props.rain_top_score, unknown: props.rain_unknown, topPlace: props.rain_top_place }),
  },
};

/** The part view for a map view, or null when the view does not colour by a part. */
export function partViewOf(view: MapViewId): PartViewId | null {
  return view === 'earthquake' || view === 'flood' ? view : null;
}

/**
 * The map properties for one part. null = unknown or no score yet: the
 * striped "no data" look. `unknown` = some of it could not be checked, so the
 * number is a lower limit: coloured, with the "at least" stripes.
 */
export function partProperties(partScore: number | null, unknown: boolean, theme: Theme, noDataColor: string) {
  return {
    partScore,
    noData: partScore === null,
    incomplete: partScore !== null && unknown,
    color: partScore === null ? noDataColor : bandColors(bandFor(partScore), theme).color,
  };
}

/** The town shapes, each coloured by its own part. A town with no score entry is no data. */
export function withTownPart(
  view: PartViewId,
  shapes: PlaceCollection,
  scores: PlaceScores | null,
  theme: Theme,
  noDataColor: string,
): PlaceCollection {
  // psgc → that town's score entry.
  const byPsgc = new Map((scores?.places ?? []).map((entry) => [entry.psgc, entry]));
  return {
    ...shapes,
    features: shapes.features.map((feature) => {
      const entry = byPsgc.get(feature.properties.psgc);
      const value: PartValue = entry === undefined ? { score: null, unknown: false } : PART_VIEWS[view].town(entry);
      const extra = partProperties(value.score, value.unknown, theme, noDataColor);
      // `scored`: the town has a score entry, so its label can name it even when its part is unknown.
      return { ...feature, properties: { ...feature.properties, ...extra, scored: entry !== undefined } };
    }),
  };
}

/**
 * The province shapes (shown only until the towns arrive), each coloured by
 * the highest part among its towns, so a hit town is never hidden behind a
 * calm province. `partTopPlace` names that town for the hover label.
 */
export function withProvincePart(
  view: PartViewId,
  data: ProvinceCollection,
  theme: Theme,
  noDataColor: string,
): ProvinceCollection {
  return {
    ...data,
    features: data.features.map((feature) => {
      const value = PART_VIEWS[view].province(feature.properties);
      const extra = partProperties(value.score, value.unknown, theme, noDataColor);
      return { ...feature, properties: { ...feature.properties, ...extra, partTopPlace: value.topPlace } };
    }),
  };
}

/** The words of a part view (its legend block, hover labels and map name). */
export function partWords(view: PartViewId, t: Strings) {
  return view === 'earthquake' ? t.quakes : t.flood;
}
