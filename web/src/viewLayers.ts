// Which legend tick boxes are on as the reader moves between map views (the
// top bar's view switch). Pure functions, so they can be tested without React.
//
// The rule:
// - Leaving Overall saves the reader's own tick boxes, then the new view ticks
//   its own layers (MAP_VIEWS[..].layers) on top of them.
// - Hazard to hazard: the saved Overall ticks stay saved. The new view starts
//   again from them and ticks its own layers, so the last view's ticks don't
//   carry over.
// - Back to Overall: the saved ticks come back exactly. Ticks the reader changed
//   while a hazard view was pressed are dropped then: Overall always gives back
//   the reader's own Overall ticks, and a button never quietly changes them.
// - One exception: "Show on the map" under a headline turns the headline dots
//   on in Overall's saved ticks too, since the reader asked for it (turnOnLayer).

import { DEFAULT_MAP_VIEW, MAP_VIEWS } from '@ph-monitor/shared';
// `import type` brings in types only; they vanish when the code runs.
import type { MapLayerName, MapView, MapViewId } from '@ph-monitor/shared';
import { DEFAULT_LAYERS } from './mapSettings.ts';
import type { MapLayers } from './mapSettings.ts';

/** The pressed view and the tick boxes. */
export type ViewState = {
  view: MapViewId;
  /** The tick boxes now. */
  layers: MapLayers;
  /** The reader's own Overall ticks, saved while a hazard view is pressed; null on Overall. */
  overallLayers: MapLayers | null;
};

/** A view's row in MAP_VIEWS; undefined for an id that has none. */
export function mapViewById(id: MapViewId): MapView | undefined {
  return MAP_VIEWS.find((view) => view.id === id);
}

/** A copy of `layers` with each of `names` ticked. */
function withTicks(layers: MapLayers, names: MapLayerName[]): MapLayers {
  // `{ ...layers }` copies the object, so the original is never changed.
  const next = { ...layers };
  for (const name of names) next[name] = true;
  return next;
}

/** Presses a view. An unavailable view, or the one already pressed, changes nothing. */
export function pressView(state: ViewState, view: MapView): ViewState {
  if (!view.available || view.id === state.view) return state;
  // The reader's own Overall ticks: the ones now when leaving Overall, else the saved ones.
  // `??` picks the right-hand side when the left is null.
  const own = state.overallLayers ?? state.layers;
  if (view.id === 'overall') return { view: 'overall', layers: own, overallLayers: null };
  return { view: view.id, layers: withTicks(own, view.layers), overallLayers: own };
}

/** What the page opens with: the default view, with the default tick boxes. */
export function initialViewState(): ViewState {
  const start: ViewState = { view: 'overall', layers: DEFAULT_LAYERS, overallLayers: null };
  const view = mapViewById(DEFAULT_MAP_VIEW);
  return view === undefined ? start : pressView(start, view);
}

/** The reader changed a tick box: it holds until the view changes (see the rule above). */
export function changeLayers(state: ViewState, layers: MapLayers): ViewState {
  return { ...state, layers };
}

/** Turns one layer on now, and in the saved Overall ticks too (the reader asked for it). */
export function turnOnLayer(state: ViewState, name: MapLayerName): ViewState {
  return {
    ...state,
    layers: withTicks(state.layers, [name]),
    overallLayers: state.overallLayers === null ? null : withTicks(state.overallLayers, [name]),
  };
}
