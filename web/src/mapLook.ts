// What the town and province shapes show for each map view. Only one view is
// pressed at a time, so two warm colour scales never show at once.
//   'score' = the stress score colours (Overall; the reader's tick box decides)
//   'heat'  = the heat index bands (heatColors.ts)
//   'part'  = one part of the score, in the score colours (partColors.ts)
//   'plain' = no fill at all, outlines only, so the marks on top stand out
//             (storm tracks, the storm surge zones)
// Display only: no look changes the score.

// `import type` brings in a type only; it disappears when the code runs.
import type { MapViewId } from '@ph-monitor/shared';

// `'a' | 'b'` = exactly one of these texts.
export type MapLook = 'score' | 'heat' | 'part' | 'plain';

// `Record<MapViewId, MapLook>` = one look for every view, so a new view
// fails the typecheck until its look is chosen here.
const LOOKS: Record<MapViewId, MapLook> = {
  overall: 'score',
  typhoon: 'plain',
  flood: 'part',
  earthquake: 'part',
  heat: 'heat',
  stormSurge: 'plain',
  // Can't be pressed (no feed); if it ever is, it keeps the score.
  tsunami: 'score',
};

export function mapLook(view: MapViewId): MapLook {
  return LOOKS[view];
}
