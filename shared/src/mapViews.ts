// The views of the top bar's view switch, in the order the buttons show.
// Only one view is pressed at a time, so two warm colour scales never show
// at once. A view is display only: it never changes the score.
// Adding a view later means adding a row here (and its words in the i18n files).

// `import type` brings in a type only; it disappears when the code runs.
import type { HazardMapKind, MapLayerName, MapViewId } from './types.ts';
import type { NewsType } from './newsTypes.ts';

/** One button of the view switch. */
export type MapView = {
  id: MapViewId;
  /** Which small picture the button draws (the web app maps the name to a drawing). */
  icon: 'overall' | 'typhoon' | 'flood' | 'earthquake' | 'heat' | 'stormSurge' | 'tsunami';
  /** The headline filter the view sets; null = all headlines (Overall). */
  newsType: NewsType | null;
  /** 'row' = always visible; 'more' = inside the "More" menu. */
  place: 'row' | 'more';
  /** false = no data behind it yet: greyed out with a note, and it can't be pressed. */
  available: boolean;
  /**
   * The fixed hazard map (Project NOAH) the view shows, or null. A view that
   * needs one is available only while GET /api/hazards lists that map.
   */
  needsHazardMap: HazardMapKind | null;
  /** The map layers pressing the view ticks (the reader can still change them). */
  layers: MapLayerName[];
};

// `MapView[]` = a list of MapView rows.
export const MAP_VIEWS: MapView[] = [
  { id: 'overall', icon: 'overall', newsType: null, place: 'row', available: true, needsHazardMap: null, layers: [] },
  // Storm tracks and the rain forecast field (no wind yet); the NOAH storm
  // surge zones too when that map is loaded (see viewTicks).
  { id: 'typhoon', icon: 'typhoon', newsType: 'typhoon', place: 'row', available: true, needsHazardMap: null, layers: ['storms', 'rainForecast', 'stormSurge'] },
  // Towns coloured by the rain part of the score.
  { id: 'flood', icon: 'flood', newsType: 'flood', place: 'row', available: true, needsHazardMap: null, layers: [] },
  // Towns coloured by the earthquake part of the score, plus the quake markers.
  { id: 'earthquake', icon: 'earthquake', newsType: 'earthquake', place: 'row', available: true, needsHazardMap: null, layers: ['quakes'] },
  { id: 'heat', icon: 'heat', newsType: 'heat', place: 'row', available: true, needsHazardMap: null, layers: [] },
  // The NOAH storm surge zones. NEWS_TYPES files storm surge under tsunami.
  { id: 'stormSurge', icon: 'stormSurge', newsType: 'tsunami', place: 'more', available: true, needsHazardMap: 'stormSurge', layers: ['stormSurge'] },
  // No live tsunami feed: tsunamis appear only in bulletins.
  { id: 'tsunami', icon: 'tsunami', newsType: 'tsunami', place: 'more', available: false, needsHazardMap: null, layers: [] },
];

/** The view the page opens with. */
export const DEFAULT_MAP_VIEW: MapViewId = 'overall';

// The map layers that are fixed hazard maps: they can be shown only once loaded.
// `HazardMapKind[]` = a list of map kinds; these names are also MapLayerNames.
const HAZARD_MAP_LAYERS: HazardMapKind[] = ['landslide', 'stormSurge'];

/**
 * Can the view be pressed now? `loadedMaps` = the map kinds GET /api/hazards
 * lists. A view with no data, or whose NOAH map is not loaded, is greyed out.
 */
export function isViewAvailable(view: MapView, loadedMaps: HazardMapKind[]): boolean {
  if (!view.available) return false;
  return view.needsHazardMap === null || loadedMaps.includes(view.needsHazardMap);
}

/** The layers pressing the view ticks: a NOAH map layer only when that map is loaded. */
export function viewTicks(view: MapView, loadedMaps: HazardMapKind[]): MapLayerName[] {
  return view.layers.filter((layer) => {
    // `as HazardMapKind` lets us look the layer up in the list of map kinds.
    const isHazardMap = HAZARD_MAP_LAYERS.includes(layer as HazardMapKind);
    return !isHazardMap || loadedMaps.includes(layer as HazardMapKind);
  });
}
