// How the heat map colours each province and town, and the words for its
// hover label. It reuses the score's layers: each shape gets a `color` and
// `noData`, so the map's fill and stripe layers work unchanged.
// A display layer only: nothing here touches the score.
//
// The palette is passed in (not read from the page), so tests need no browser.

// `import type` brings in types only; they vanish when the code runs.
import { HEAT_MODELS } from '@ph-monitor/shared';
import type { HeatBandName, HeatMapData, HeatValue, HeatViewId } from '@ph-monitor/shared';
import type { PlaceCollection, ProvinceCollection } from './api.ts';
import { fill, lookup } from './i18n/index.ts';
import type { Strings } from './i18n/index.ts';
import type { Palette } from './palette.ts';

// The same order as `palette.heat.bands`.
const BANDS: HeatBandName[] = ['caution', 'extreme caution', 'danger', 'extreme danger'];

/**
 * The colour of one heat value. Unknown (null, or not in the answer) is never
 * calm: it gets the striped "no data" look. Below 27 °C (a value with no band)
 * gets the neutral `below` colour.
 * `HeatValue | undefined` = a value, or nothing at all.
 */
export function heatColor(value: HeatValue | undefined, palette: Palette): { color: string; noData: boolean } {
  if (value === undefined || value.heatIndexC === null) return { color: palette.noData, noData: true };
  if (value.band === null) return { color: palette.heat.below, noData: false };
  const color = palette.heat.bands[BANDS.indexOf(value.band)];
  // A band this page does not know is unknown too.
  return color === undefined ? { color: palette.noData, noData: true } : { color, noData: false };
}

/** The extra properties the map reads while the heat map is on. */
function heatProperties(value: HeatValue | undefined, palette: Palette) {
  return {
    ...heatColor(value, palette),
    // The score's "at least" stripes don't apply to a heat value.
    incomplete: false,
    // `?.` gives undefined instead of failing when `value` is missing; `??` then picks null.
    heatIndexC: value?.heatIndexC ?? null,
    band: value?.band ?? null,
    // Average view only: the spread, as plain numbers (the map keeps flat values best).
    spreadUsed: value?.spread?.used ?? null,
    spreadLowC: value?.spread?.lowC ?? null,
    spreadHighC: value?.spread?.highC ?? null,
  };
}

/** The province shapes, each coloured by its hottest town. */
export function withProvinceHeat(data: ProvinceCollection, heat: HeatMapData, palette: Palette): ProvinceCollection {
  // psgc → that province's value.
  const byPsgc = new Map(heat.provinces.map((value) => [value.psgc, value]));
  return {
    ...data,
    features: data.features.map((feature) => {
      const properties = { ...feature.properties, ...heatProperties(byPsgc.get(feature.properties.psgc), palette) };
      return { ...feature, properties };
    }),
  };
}

/** The town shapes, each coloured by its hottest point. */
export function withTownHeat(shapes: PlaceCollection, heat: HeatMapData, palette: Palette): PlaceCollection {
  const byPsgc = new Map(heat.places.map((value) => [value.psgc, value]));
  return {
    ...shapes,
    features: shapes.features.map((feature) => {
      const properties = { ...feature.properties, ...heatProperties(byPsgc.get(feature.properties.psgc), palette) };
      return { ...feature, properties };
    }),
  };
}

/**
 * An answer with nothing in it, for the chosen model. The map shows it while
 * the real answer is loading (or could not be loaded), so every shape is
 * striped and the score's colours never show under the heat key.
 */
export function emptyHeatMap(model: HeatViewId): HeatMapData {
  return { model, fetchedAt: null, isStale: true, validAt: null, places: [], provinces: [] };
}

/**
 * What the map colours by. null = the heat map is off: the score. Otherwise
 * the answer, but only if it is for the view chosen now; an answer for
 * another view (one that arrived late, after a switch) is never drawn.
 */
export function heatForMap(chosen: HeatViewId | null, answer: HeatMapData | null): HeatMapData | null {
  if (chosen === null) return null;
  return answer !== null && answer.model === chosen ? answer : emptyHeatMap(chosen);
}

/**
 * "41 °C, extreme caution", "25 °C" (below the bands), or "unknown".
 * Whole degrees, rounded down, so the number never contradicts its band
 * (41.9 is "extreme caution", and so is 41; rounding up would say 42).
 */
export function heatText(heatIndexC: number | null, band: string | null, t: Strings): string {
  if (heatIndexC === null) return t.heat.unknown;
  const heat = Math.floor(heatIndexC);
  return band === null
    ? fill(t.heat.degrees, { heat })
    : fill(t.heat.degreesBand, { heat, band: lookup(t.heatBands, band) });
}

/**
 * Where a hover label's number comes from: the model's name, or for the
 * average "average of 2 of 3 models: 39–43 °C". `props` are the map shape's
 * properties (see heatProperties). Whole degrees, rounded down like heatText.
 */
export function heatSource(view: HeatViewId, props: Record<string, unknown>, t: Strings): string {
  if (view !== 'average') return t.heat.models[view];
  const total = HEAT_MODELS.length;
  const { spreadUsed: used, spreadLowC, spreadHighC } = props;
  if (typeof used !== 'number' || typeof spreadLowC !== 'number' || typeof spreadHighC !== 'number') {
    return fill(t.heat.averageNone, { total });
  }
  const low = Math.floor(spreadLowC);
  const high = Math.floor(spreadHighC);
  const range = low === high ? fill(t.heat.degrees, { heat: low }) : fill(t.heat.range, { from: low, to: high });
  return fill(used === total ? t.heat.averageAll : t.heat.averagePart, { used, total, range });
}
