// Small rules for the fixed hazard maps (Project NOAH): which words the
// status card shows for a spot, and which map layers can be ticked in the
// legend. Pure functions, so they can be tested without drawing anything.
// A missing map always reads "no hazard map here": unknown, never "safe".

import type { HazardClass, HazardLayerInfo, HazardMapKind, HazardZones, SurgeLevel } from '@ph-monitor/shared';
import type { Strings } from './i18n/index.ts';

/** One line of the card: what it is about, and what the map says. */
export type HazardLine = { label: string; value: string };

/** The class word ("high"), or `outside` when the spot is in no zone. */
function classWord(hazardClass: HazardClass | null, outside: string, t: Strings): string {
  return hazardClass === null ? outside : t.hazardMap.classes[hazardClass];
}

/** The landslide line: "high" / "medium" / "low", "not in a zone", or "no hazard map here". */
export function landslideText(zones: HazardZones, t: Strings): string {
  if (zones.landslide === null) return t.hazardMap.noMap;
  return classWord(zones.landslide.hazardClass, t.hazardMap.notInZone, t);
}

/**
 * One line per storm surge level: "SSA 1 (up to 2 m)" with "high" or "not
 * reached". null when no storm surge map covers the spot.
 */
export function surgeLines(zones: HazardZones, t: Strings): HazardLine[] | null {
  const levels = zones.stormSurge;
  if (levels === null || levels.length === 0) return null;
  return levels.map((entry) => ({
    label: t.hazardMap.levels[entry.level],
    value: classWord(entry.hazardClass, t.hazardMap.notReached, t),
  }));
}

/** The map's tile layer for each kind: storm surge shows its widest scenario, level 4. */
export const MAP_SURGE_LEVEL: SurgeLevel = 4;

/**
 * Can this kind be drawn on the map? Only if the server has it loaded (and,
 * for storm surge, the level the map shows). Without it, the legend shows no tick box.
 */
export function hasMapLayer(loaded: HazardLayerInfo[] | null, kind: HazardMapKind): boolean {
  return (loaded ?? []).some(
    (layer) => layer.kind === kind && (kind === 'landslide' || layer.surgeLevel === MAP_SURGE_LEVEL),
  );
}
