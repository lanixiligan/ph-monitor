// The fixed hazard map layers (Project NOAH): landslide zones and storm surge
// zones, drawn as see-through stripes over the score colours. Denser, darker
// stripes mean a higher class. The map shows storm surge level 4 only (the
// widest scenario); the status card lists all four levels.
//
// The shapes come as vector tiles from our own /api, from zoom 9 up. They
// never take clicks: the town under a stripe is still picked as usual.

// `import type` brings in only MapLibre's types; nothing of it runs from this file.
import type * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { HazardLayerInfo, HazardMapKind } from '@ph-monitor/shared';
import { hasMapLayer, MAP_SURGE_LEVEL } from './hazardLabels.ts';
import { useStrings } from './i18n/index.ts';
import type { MapLayers } from './mapSettings.ts';
import { HAZARD_MIN_ZOOM } from './mapSettings.ts';
import { hatchImage, readPalette } from './palette.ts';

/** The layers of each kind, for the legend's tick boxes. */
const SURGE_FILL = 'hazard-surge-fill';
const LANDSLIDE_FILL = 'hazard-landslide-fill';
// Zoomed far out a zone is thinner than a pixel and its stripes cannot show, so
// its outline is drawn in the class colour instead, until the stripes take over.
const SURGE_FAR = 'hazard-surge-far';
const LANDSLIDE_FAR = 'hazard-landslide-far';
export const SURGE_LAYERS = [SURGE_FILL, SURGE_FAR];
export const LANDSLIDE_LAYERS = [LANDSLIDE_FILL, LANDSLIDE_FAR];

// From this zoom up the stripes are wide enough to read; below it the outlines show.
const STRIPES_FROM = 9;

// The server makes no tiles past this zoom; MapLibre enlarges level 14 tiles.
const MAX_TILE_ZOOM = 14;

// Stripe spacing and width per class (1 low, 2 medium, 3 high): denser = higher.
const STRIPES = [
  { spacing: 10, lineWidth: 1.5 },
  { spacing: 7, lineWidth: 1.75 },
  { spacing: 5, lineWidth: 2 },
];

// Everything that differs between the two kinds. `kind` is also the name of
// its tick box in MapLayers.
type KindSetup = {
  kind: HazardMapKind;
  source: string;
  layer: string;
  /** The outline layer shown when zoomed far out. */
  farLayer: string;
  /** The layer name in the tile address (/api/hazards/tiles/{tiles}/...). */
  tiles: string;
  /** Storm surge: flat lines, landslide: falling lines, so both read when shown together. */
  direction: 'flat' | 'falling';
};

const KINDS: KindSetup[] = [
  {
    kind: 'stormSurge',
    source: 'hazard-surge',
    layer: SURGE_FILL,
    farLayer: SURGE_FAR,
    tiles: `surge${MAP_SURGE_LEVEL}`,
    direction: 'flat',
  },
  {
    kind: 'landslide',
    source: 'hazard-landslide',
    layer: LANDSLIDE_FILL,
    farLayer: LANDSLIDE_FAR,
    tiles: 'landslide',
    direction: 'falling',
  },
];

/** The name a class's stripes are stored under inside the map. */
function imageName(setup: KindSetup, hazardClass: number): string {
  return `${setup.source}-${hazardClass}`;
}

/** Adds one kind's stripes, source and fill layer, just under the town borders. */
function addKind(map: maplibregl.Map, setup: KindSetup, attribution: string, visible: boolean) {
  const colors = setup.kind === 'stormSurge' ? readPalette().surge : readPalette().landslide;
  // `entries()` gives each stripe style with its place in the list (0, 1, 2).
  for (const [index, stripes] of STRIPES.entries()) {
    const name = imageName(setup, index + 1);
    // `?? ''` stands in if a colour were missing; the stripes would then not show.
    const image = hatchImage({ color: colors[index] ?? '', direction: setup.direction, ...stripes });
    // No stripes (the browser could not draw them): leave this kind off the map.
    if (!image) return;
    if (!map.hasImage(name)) map.addImage(name, image);
  }
  map.addSource(setup.source, {
    type: 'vector',
    // MapLibre's worker needs a full address, not "/api/...".
    tiles: [`${window.location.origin}/api/hazards/tiles/${setup.tiles}/{z}/{x}/{y}.mvt`],
    minzoom: HAZARD_MIN_ZOOM[setup.kind],
    maxzoom: MAX_TILE_ZOOM,
    attribution,
  });
  map.addLayer(
    {
      id: setup.layer,
      type: 'fill',
      source: setup.source,
      // The tiles hold one layer, "zones"; each shape carries its class as `c` (1–3).
      'source-layer': 'zones',
      minzoom: HAZARD_MIN_ZOOM[setup.kind],
      layout: {
        // Higher classes are drawn last, so they sit on top where zones overlap.
        'fill-sort-key': ['get', 'c'],
        visibility: visible ? 'visible' : 'none',
      },
      paint: {
        'fill-pattern': [
          'match',
          ['get', 'c'],
          3,
          imageName(setup, 3),
          2,
          imageName(setup, 2),
          imageName(setup, 1),
        ],
      },
    },
    // Over the town colours, under the town borders (see ProvinceMap.tsx).
    map.getLayer('town-outline') ? 'town-outline' : undefined,
  );
  // The far-out outlines, only for a kind that is shown before the stripes can be read.
  if (HAZARD_MIN_ZOOM[setup.kind] < STRIPES_FROM) {
    map.addLayer(
      {
        id: setup.farLayer,
        type: 'line',
        source: setup.source,
        'source-layer': 'zones',
        minzoom: HAZARD_MIN_ZOOM[setup.kind],
        maxzoom: STRIPES_FROM,
        layout: { 'line-sort-key': ['get', 'c'], visibility: visible ? 'visible' : 'none' },
        paint: {
          'line-color': ['match', ['get', 'c'], 3, colors[2] ?? '', 2, colors[1] ?? '', colors[0] ?? ''],
          'line-width': 1.5,
        },
      },
      map.getLayer('town-outline') ? 'town-outline' : undefined,
    );
  }
}

/** Takes one kind off the map again (before it is added in another language). */
function removeKind(map: maplibregl.Map, setup: KindSetup) {
  if (map.getLayer(setup.farLayer)) map.removeLayer(setup.farLayer);
  if (map.getLayer(setup.layer)) map.removeLayer(setup.layer);
  if (map.getSource(setup.source)) map.removeSource(setup.source);
}

/**
 * Draws the hazard maps the server has loaded (`loaded`, from /api/hazards).
 * The tick boxes in `layers` only set how they start; ProvinceMap's legend
 * effect shows and hides them after that.
 */
export function useHazardZones(
  mapRef: RefObject<maplibregl.Map | null>,
  ready: boolean,
  loaded: HazardLayerInfo[] | null,
  layers: MapLayers,
) {
  const { t } = useStrings();
  // The latest tick boxes, read when the layers are added.
  const layersRef = useRef(layers);
  layersRef.current = layers;

  // Runs when the map is (re)built, when the list arrives, and when the
  // language changes: the credit line is fixed when a source is added, so
  // the layers are added again with the new text.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || loaded === null) return;
    for (const setup of KINDS) {
      removeKind(map, setup);
      if (hasMapLayer(loaded, setup.kind)) {
        addKind(map, setup, t.map.hazardAttribution, layersRef.current[setup.kind]);
      }
    }
  }, [ready, mapRef, loaded, t]);
}
