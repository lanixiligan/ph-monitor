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
import { EVENT_LAYERS, OVERLAY_CLICK_LAYERS, STORM_LAYERS, useOverlays } from '../mapOverlays.ts';
import { MAX_BOUNDS, PH_BOUNDS, SHOW_BASEMAP } from '../mapSettings.ts';
import type { MapLayers } from '../mapSettings.ts';
import { provincesBox } from '../newsGeo.ts';
import { NEWS_LAYERS, useNewsDots } from '../newsOverlay.ts';
import { hatchImage, readPalette } from '../palette.ts';
import { bandColors, bandFor, scoreText } from '../scoreScale.ts';
import { useTheme } from '../theme/index.ts';
import type { Theme } from '../theme/index.ts';

maplibregl.setWorkerUrl(workerUrl);

// Free basemaps, no key needed (OpenFreeMap), one per theme. Both are grey
// with roads and place names; grey keeps the score colours easy to read.
const BASEMAP_URLS: Record<Theme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

// The name the no-data stripes are stored under inside the map.
const HATCH = 'no-data-hatch';
// Lines only, laid over the colour of a province whose score is incomplete.
const HATCH_LINES = 'incomplete-hatch';

/**
 * A plain background with the province shapes only. Used when SHOW_BASEMAP
 * is off, and as a fallback when the basemap can't be reached.
 */
function plainStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'background', type: 'background', paint: { 'background-color': readPalette().sea } }],
  };
}

/**
 * Returns a copy of the data where every province also carries the colour it
 * should be drawn in, and `noData` for one with no score yet. Using bandFor()
 * here means the map and the legend can never disagree.
 */
function withColors(data: ProvinceCollection, theme: Theme) {
  const noDataColor = readPalette().noData;
  return {
    ...data,
    features: data.features.map((feature) => {
      const score = feature.properties.score;
      const color = score === null ? noDataColor : bandColors(bandFor(score), theme).color;
      // `incomplete` rides along as it is: some data was missing, so the score is "at least".
      return { ...feature, properties: { ...feature.properties, color, noData: score === null } };
    }),
  };
}

async function pickStyle(theme: Theme): Promise<string | StyleSpecification> {
  if (!SHOW_BASEMAP) return plainStyle();
  const url = BASEMAP_URLS[theme];
  try {
    // Give up after 4 seconds, so a slow basemap never holds up our own map.
    const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (response.ok) return url;
  } catch {
    // Offline, blocked or too slow: fall through to the plain style.
  }
  return plainStyle();
}

// `type Props` lists what the parent must pass to this component.
type Props = {
  data: ProvinceCollection | null;
  /** The spot the reader picked, marked with a dot. null = none. */
  spot: Spot | null;
  // A function the map calls when the reader clicks on land.
  onSelect: (spot: Spot) => void;
  /** Which layers are switched on in the legend. */
  layers: MapLayers;
  /** Provinces picked from a headline: outlined, and the map moves to them. null = none. */
  focus: { psgcs: number[] } | null;
};

// No province has this code, so a filter with it matches nothing.
const MATCH_NONE: maplibregl.FilterSpecification = ['in', ['get', 'psgc'], ['literal', [-1]]];

// How see-through the province colours are. Over a basemap they fade as you
// zoom in (zoom 5 = whole country, 10 = one city), so towns show through.
// `ExpressionSpecification` is MapLibre's type for a rule like this one.
const FADE_WITH_ZOOM: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 0.45];

export function ProvinceMap({ data, spot, onSelect, layers, focus }: Props) {
  // A "ref" holds a value that survives re-renders without causing one.
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const spotRef = useRef(spot);
  spotRef.current = spot;
  const dataRef = useRef(data);
  dataRef.current = data;
  const { theme } = useTheme();
  // Where the reader was looking, kept so a theme change doesn't move the map.
  const cameraRef = useRef<{ center: maplibregl.LngLat; zoom: number } | null>(null);

  // Becomes true once the map has loaded and our layers exist.
  const [ready, setReady] = useState(false);
  // The province colours' normal opacity, kept so the legend can restore it.
  const fillOpacityRef = useRef<maplibregl.ExpressionSpecification | number>(0.85);

  // Create the map when the component first appears, and again when the
  // theme changes (the basemap and every colour change with it).
  useEffect(() => {
    let cancelled = false;
    let map: maplibregl.Map | null = null;
    const palette = readPalette();

    void pickStyle(theme).then((style) => {
      if (cancelled || !containerRef.current) return;

      const options: maplibregl.MapOptions = {
        container: containerRef.current,
        style,
        bounds: PH_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        // Stops the reader from panning or zooming out to the rest of the world.
        maxBounds: MAX_BOUNDS,
      };
      // After a theme change, open where the reader was instead.
      const camera = cameraRef.current;
      if (camera) {
        options.bounds = undefined;
        options.center = camera.center;
        options.zoom = camera.zoom;
      }
      map = new maplibregl.Map(options);
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
              'fill-opacity': hasBasemap ? FADE_WITH_ZOOM : 0.85,
            },
          },
          firstRoad ?? firstLabel,
        );
        fillOpacityRef.current = hasBasemap ? FADE_WITH_ZOOM : 0.85;
        // Diagonal stripes over provinces with no score yet (if the browser can draw them).
        const hatch = hatchImage(palette);
        if (hatch) {
          theMap.addImage(HATCH, hatch);
          theMap.addLayer(
            {
              id: 'province-nodata',
              type: 'fill',
              source: 'provinces',
              filter: ['==', ['get', 'noData'], true],
              paint: { 'fill-pattern': HATCH, 'fill-opacity': fillOpacityRef.current },
            },
            firstRoad ?? firstLabel,
          );
        }
        // Stripes over the colour of provinces whose score is missing a signal.
        const lines = hatchImage(palette, false);
        if (lines) {
          theMap.addImage(HATCH_LINES, lines);
          theMap.addLayer(
            {
              id: 'province-incomplete',
              type: 'fill',
              source: 'provinces',
              filter: ['all', ['==', ['get', 'incomplete'], true], ['==', ['get', 'noData'], false]],
              paint: { 'fill-pattern': HATCH_LINES, 'fill-opacity': fillOpacityRef.current },
            },
            firstRoad ?? firstLabel,
          );
        }
        theMap.addLayer(
          {
            id: 'province-outline',
            type: 'line',
            source: 'provinces',
            paint: { 'line-color': palette.inkSoft, 'line-width': 0.6 },
          },
          firstLabel,
        );
        // A thick outline around the provinces picked from a headline (none at first).
        theMap.addLayer(
          {
            id: 'news-focus',
            type: 'line',
            source: 'provinces',
            filter: MATCH_NONE,
            paint: { 'line-color': palette.news, 'line-width': 3.5 },
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
            'circle-color': palette.paper,
            'circle-stroke-color': palette.ink,
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
          const score = scoreText(
            typeof properties.score === 'number' ? properties.score : null,
            properties.incomplete === true,
          );
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
          // A click on an event, storm or headline dot opens its popup instead.
          const hits = [...OVERLAY_CLICK_LAYERS, ...NEWS_LAYERS].filter((id) => theMap.getLayer(id));
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

    // Cleanup: runs when the component goes away or the theme changes.
    return () => {
      cancelled = true;
      if (map) cameraRef.current = { center: map.getCenter(), zoom: map.getZoom() };
      mapRef.current = null;
      map?.remove();
      setReady(false);
    };
  }, [theme]);

  // Whenever new data arrives (or the map becomes ready), hand it to the map.
  useEffect(() => {
    if (!ready || !data) return;
    const source = mapRef.current?.getSource('provinces') as maplibregl.GeoJSONSource | undefined;
    source?.setData(withColors(data, theme));
  }, [ready, data, theme]);

  // Event markers and storm tracks (see mapOverlays.ts).
  useOverlays(mapRef, ready);
  // Headline dots (see newsOverlay.ts).
  useNewsDots(mapRef, ready, data);

  // A place picked from a headline: outline it and move the map to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const psgcs = focus?.psgcs ?? [];
    map.setFilter('news-focus', psgcs.length > 0 ? ['in', ['get', 'psgc'], ['literal', psgcs]] : MATCH_NONE);
    const box = dataRef.current ? provincesBox(dataRef.current, psgcs) : null;
    // maxZoom stops a small province from filling the whole screen.
    if (box) map.fitBounds(box, { padding: 60, maxZoom: 8 });
  }, [ready, focus]);

  // Show or hide layers when a legend tick box changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // The province colours turn fully see-through instead of being removed,
    // so a click on land still picks a spot.
    const opacity = layers.scores ? fillOpacityRef.current : 0;
    map.setPaintProperty('province-fill', 'fill-opacity', opacity);
    for (const id of ['province-nodata', 'province-incomplete']) {
      if (map.getLayer(id)) map.setPaintProperty(id, 'fill-opacity', opacity);
    }
    const show = (ids: string[], on: boolean) => {
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      }
    };
    show(EVENT_LAYERS, layers.events);
    show(STORM_LAYERS, layers.storms);
    show(NEWS_LAYERS, layers.news);
    // Storm names are HTML labels, not map layers; CSS hides them.
    containerRef.current?.classList.toggle('hide-storm-labels', !layers.storms);
  }, [ready, layers]);

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
