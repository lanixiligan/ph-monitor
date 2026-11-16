// The map: provinces coloured by score. Hover shows the province's name and
// score; a click picks the exact spot under the pointer.
//
// MapLibre draws the map itself (outside React), so this component's job is
// to create it once and then pass along changes: new data, new selection.

// `import * as` gathers everything the package exports under one name.
import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
// MapLibre does its heavy work in a "worker" (a helper script running beside
// the page). `?worker&url` asks Vite to package that script and give us its
// address, which we then hand to MapLibre.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import type { ProvinceCollection, Spot } from '../api.ts';
import { getI18n } from '../i18n/index.ts';
import { OVERLAY_CLICK_LAYERS, useOverlays } from '../mapOverlays.ts';
import { MAX_BOUNDS, PH_BOUNDS, SHOW_BASEMAP } from '../mapSettings.ts';
import { bandFor, NO_DATA_COLOR } from '../scoreScale.ts';

maplibregl.setWorkerUrl(workerUrl);

// Free basemap, no key needed (OpenFreeMap). "positron" is its grey style
// with roads and place names; grey keeps the score colours easy to read.
const BASEMAP_URL = 'https://tiles.openfreemap.org/styles/positron';

// A plain background with the province shapes only. Used when SHOW_BASEMAP
// is off, and as a fallback when the basemap can't be reached.
const PLAIN_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef1f3' } }],
};

/**
 * Returns a copy of the data where every province also carries the colour it
 * should be drawn in. Using bandFor() here means the map and the legend can
 * never disagree.
 */
function withColors(data: ProvinceCollection) {
  return {
    ...data,
    features: data.features.map((feature) => {
      const score = feature.properties.score;
      const color = score === null ? NO_DATA_COLOR : bandFor(score).color;
      return { ...feature, properties: { ...feature.properties, color } };
    }),
  };
}

async function pickStyle(): Promise<string | StyleSpecification> {
  if (!SHOW_BASEMAP) return PLAIN_STYLE;
  try {
    // Give up after 4 seconds, so a slow basemap never holds up our own map.
    const response = await fetch(BASEMAP_URL, { signal: AbortSignal.timeout(4000) });
    if (response.ok) return BASEMAP_URL;
  } catch {
    // Offline, blocked or too slow: fall through to the plain style.
  }
  return PLAIN_STYLE;
}

// `type Props` lists what the parent must pass to this component.
type Props = {
  data: ProvinceCollection | null;
  /** The spot the reader picked, marked with a dot. null = none. */
  spot: Spot | null;
  // A function the map calls when the reader clicks on land.
  onSelect: (spot: Spot) => void;
};

export function ProvinceMap({ data, spot, onSelect }: Props) {
  // A "ref" holds a value that survives re-renders without causing one.
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const spotRef = useRef(spot);
  spotRef.current = spot;

  // Becomes true once the map has loaded and our layers exist.
  const [ready, setReady] = useState(false);

  // Create the map once, when the component first appears.
  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | null = null;

    void pickStyle().then((style) => {
      if (cancelled || !containerRef.current) return;

      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        bounds: PH_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        // Stops the reader from panning or zooming out to the rest of the world.
        maxBounds: MAX_BOUNDS,
      });
      const theMap = map;
      mapRef.current = theMap;
      theMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

      theMap.on('load', () => {
        theMap.addSource('provinces', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // A basemap is a stack of layers: land and water at the bottom, then
        // roads, then place names on top. We slot the province colours in
        // just under the roads, and the province outlines just under the
        // names, so roads and names stay readable. (With the plain style
        // neither exists, and our layers simply go on top.)
        const layers = theMap.getStyle().layers;
        const firstRoad = layers.find(
          (layer) => 'source-layer' in layer && layer['source-layer'] === 'transportation',
        )?.id;
        const firstLabel = layers.find((layer) => layer.type === 'symbol')?.id;
        const hasBasemap = firstLabel !== undefined;

        theMap.addLayer(
          {
            id: 'province-fill',
            type: 'fill',
            source: 'provinces',
            paint: {
              // ['get', 'color'] means "read this province's own color property".
              'fill-color': ['get', 'color'],
              // Over a basemap the colour gets more see-through as you zoom
              // in (zoom 5 = whole country, 10 = one city), so the towns and
              // land underneath show through.
              'fill-opacity': hasBasemap
                ? ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 0.45]
                : 0.85,
            },
          },
          firstRoad ?? firstLabel,
        );
        theMap.addLayer(
          {
            id: 'province-outline',
            type: 'line',
            source: 'provinces',
            paint: { 'line-color': '#6b6b6b', 'line-width': 0.6 },
          },
          firstLabel,
        );
        // A dot marking the picked spot (empty until the reader clicks).
        theMap.addSource('spot', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        theMap.addLayer({
          id: 'spot-dot',
          type: 'circle',
          source: 'spot',
          paint: {
            'circle-radius': 6,
            'circle-color': '#ffffff',
            'circle-stroke-color': '#111111',
            'circle-stroke-width': 3,
          },
        });

        // Hover: a small label with the name and score.
        const popup = new maplibregl.Popup({
          closeButton: false,
          closeOnClick: false,
          // Sit a little away from the pointer so it doesn't cover the dot.
          offset: 14,
        });
        theMap.on('mousemove', 'province-fill', (event) => {
          const properties = event.features?.[0]?.properties;
          if (!properties) return;
          theMap.getCanvas().style.cursor = 'pointer';
          // Read at hover time, so the label follows the language chosen now.
          const score =
            typeof properties.score === 'number' ? properties.score : getI18n().t.map.noScoreYet;
          popup
            .setLngLat(event.lngLat)
            .setText(`${properties.name}: ${score}`)
            .addTo(theMap);
        });
        theMap.on('mouseleave', 'province-fill', () => {
          theMap.getCanvas().style.cursor = '';
          popup.remove();
        });

        // A click on any province shape picks the exact spot under the pointer.
        // 4 decimals is about 11 m, plenty for our purposes and tidy in links.
        theMap.on('click', 'province-fill', (event) => {
          // A click on an event or storm dot opens its popup instead.
          const hits = OVERLAY_CLICK_LAYERS.filter((id) => theMap.getLayer(id));
          if (hits.length > 0 && theMap.queryRenderedFeatures(event.point, { layers: hits }).length > 0) {
            return;
          }
          onSelectRef.current({
            lat: Number(event.lngLat.lat.toFixed(4)),
            lon: Number(event.lngLat.lng.toFixed(4)),
          });
        });

        // On a small screen the map shrinks when the card opens. If that
        // pushes the picked spot out of view, slide the map to bring it back.
        theMap.on('resize', () => {
          const picked = spotRef.current;
          if (picked && !theMap.getBounds().contains([picked.lon, picked.lat])) {
            theMap.easeTo({ center: [picked.lon, picked.lat] });
          }
        });

        setReady(true);
      });
    });

    // Cleanup: runs when the component goes away.
    return () => {
      cancelled = true;
      mapRef.current = null;
      map?.remove();
      setReady(false);
    };
  }, []);

  // Whenever new data arrives (or the map becomes ready), hand it to the map.
  useEffect(() => {
    if (!ready || !data) return;
    const source = mapRef.current?.getSource('provinces') as maplibregl.GeoJSONSource | undefined;
    source?.setData(withColors(data));
  }, [ready, data]);

  // Event markers and storm tracks (see mapOverlays.ts).
  useOverlays(mapRef, ready);

  // Whenever the picked spot changes, move the dot (or remove it).
  useEffect(() => {
    if (!ready) return;
    const source = mapRef.current?.getSource('spot') as maplibregl.GeoJSONSource | undefined;
    source?.setData({
      type: 'FeatureCollection',
      features: spot
        ? [
            {
              type: 'Feature',
              properties: {},
              // GeoJSON wants longitude first, then latitude.
              geometry: { type: 'Point', coordinates: [spot.lon, spot.lat] },
            },
          ]
        : [],
    });
  }, [ready, spot]);

  return <div ref={containerRef} className="map" />;
}
