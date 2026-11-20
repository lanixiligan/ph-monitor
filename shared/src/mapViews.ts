// The views of the top bar's view switch, in the order the buttons show.
// Only one view is pressed at a time, so two warm colour scales never show
// at once. A view is display only: it never changes the score.
// Adding a view later means adding a row here (and its words in the i18n files).

// `import type` brings in a type only; it disappears when the code runs.
import type { MapLayerName, MapViewId } from './types.ts';
import type { NewsType } from './newsTypes.ts';

/** One button of the view switch. */
export type MapView = {
  id: MapViewId;
  /** Which small picture the button draws (the web app maps the name to a drawing). */
  icon: 'overall' | 'heat' | 'earthquake' | 'tsunami';
  /** The headline filter the view sets; null = all headlines (Overall). */
  newsType: NewsType | null;
  /** 'row' = always visible; 'more' = inside the "More" menu. */
  place: 'row' | 'more';
  /** false = no data behind it yet: greyed out with a note, and it can't be pressed. */
  available: boolean;
  /** The map layers pressing the view ticks (the reader can still change them). */
  layers: MapLayerName[];
};

// `MapView[]` = a list of MapView rows.
export const MAP_VIEWS: MapView[] = [
  { id: 'overall', icon: 'overall', newsType: null, place: 'row', available: true, layers: [] },
  // Towns coloured by the earthquake part of the score, plus the quake markers.
  { id: 'earthquake', icon: 'earthquake', newsType: 'earthquake', place: 'row', available: true, layers: ['quakes'] },
  { id: 'heat', icon: 'heat', newsType: 'heat', place: 'row', available: true, layers: [] },
  // No live tsunami feed: tsunamis appear only in bulletins.
  { id: 'tsunami', icon: 'tsunami', newsType: 'tsunami', place: 'more', available: false, layers: [] },
];

/** The view the page opens with. */
export const DEFAULT_MAP_VIEW: MapViewId = 'overall';
