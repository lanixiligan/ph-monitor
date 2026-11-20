// How the Earthquake view colours each town and province: by the earthquake
// part of the score, with the same score colours (scoreScale.ts), so no new
// warm scale is added. It reuses the score's layers: each shape gets a
// `color`, `noData` and `incomplete`, so the map's fill and stripe layers work
// unchanged. A display layer only: nothing here touches the score.
//
// The theme and the no-data colour are passed in (not read from the page),
// so tests need no browser.

// `import type` brings in types only; they vanish when the code runs.
import type { PlaceScores } from '@ph-monitor/shared';
import type { PlaceCollection, ProvinceCollection } from './api.ts';
import { bandColors, bandFor } from './scoreScale.ts';
import type { Theme } from './theme/index.ts';

/**
 * The map properties for one earthquake part. null = no score for this shape
 * yet: the striped "no data" look. `unknown` = earthquakes could not be
 * checked, so the number is a lower limit: coloured, with the "at least" stripes.
 */
export function quakeProperties(quakeScore: number | null, unknown: boolean, theme: Theme, noDataColor: string) {
  return {
    quakeScore,
    noData: quakeScore === null,
    incomplete: quakeScore !== null && unknown,
    color: quakeScore === null ? noDataColor : bandColors(bandFor(quakeScore), theme).color,
  };
}

/** The town shapes, each coloured by its own earthquake part. */
export function withTownQuake(
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
      // `?.` gives undefined instead of failing when `entry` is missing; `??` then picks null.
      const extra = quakeProperties(entry?.quakeScore ?? null, entry?.quakeUnknown ?? false, theme, noDataColor);
      return { ...feature, properties: { ...feature.properties, ...extra } };
    }),
  };
}

/**
 * The province shapes (shown only until the towns arrive), each coloured by
 * the highest earthquake part among its towns, so a shaken town is never
 * hidden behind a calm province. Unknown earthquakes keep the "at least" stripes.
 */
export function withProvinceQuake(data: ProvinceCollection, theme: Theme, noDataColor: string): ProvinceCollection {
  return {
    ...data,
    features: data.features.map((feature) => {
      const { quake_top_score: quakeScore, quake_unknown: unknown } = feature.properties;
      const extra = quakeProperties(quakeScore, unknown, theme, noDataColor);
      return { ...feature, properties: { ...feature.properties, ...extra } };
    }),
  };
}
