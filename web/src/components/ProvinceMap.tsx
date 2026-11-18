// The map: each city and municipality ("town") coloured by its own score at
// every zoom level (provinces only until the towns arrive). Hover shows the name and score; a click picks the
// exact spot under the pointer, and the town it is in gets an outline. The
// locate button (under the zoom buttons) picks the spot where the reader is.
// While the heat map is on, the same shapes are coloured by heat index instead
// (heatColors.ts), and the hover label shows the heat index and its model.
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
import type { HazardLayerInfo, HeatMapData, PlaceScores } from '@ph-monitor/shared';
import { fetchPlaceShapes } from '../api.ts';
import type { PlaceCollection, ProvinceCollection, Spot } from '../api.ts';
import { LANDSLIDE_LAYERS, SURGE_LAYERS, useHazardZones } from '../hazardOverlay.ts';
import { heatText, withProvinceHeat, withTownHeat } from '../heatColors.ts';
import { EVENT_LAYERS, OVERLAY_CLICK_LAYERS, STORM_LAYERS, useOverlays } from '../mapOverlays.ts';
import { MAX_BOUNDS, PH_BOUNDS, SHOW_BASEMAP } from '../mapSettings.ts';
import type { MapLayers } from '../mapSettings.ts';
import { provincesBox } from '../newsGeo.ts';
import { NEWS_LAYERS, useNewsDots } from '../newsOverlay.ts';
import { hatchImage, readPalette } from '../palette.ts';
import { bandColors, bandFor, scoreText } from '../scoreScale.ts';
import { fill, getI18n, useStrings } from '../i18n/index.ts';
import type { PickedArea } from './StatusCard.tsx';
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

// The thin town borders fade in between these zoom levels (5 = whole country,
// 10 = one city); further out they would hide the colours. The town colours
// themselves show at every zoom level.
const BORDERS_FROM = 7.5;
const BORDERS_FULL = 8.5;

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
 * The colour a score is drawn in. Using bandFor() here means the map and the
 * legend can never disagree.
 */
function colorOf(score: number | null, theme: Theme, noDataColor: string): string {
  return score === null ? noDataColor : bandColors(bandFor(score), theme).color;
}

/**
 * Returns a copy of the data where every province also carries the colour it
 * should be drawn in, and `noData` for one with no score yet.
 */
function withColors(data: ProvinceCollection, theme: Theme) {
  const noDataColor = readPalette().noData;
  return {
    ...data,
    features: data.features.map((feature) => {
      const score = feature.properties.score;
      const color = colorOf(score, theme, noDataColor);
      // `incomplete` rides along as it is: some data was missing, so the score is "at least".
      return { ...feature, properties: { ...feature.properties, color, noData: score === null } };
    }),
  };
}

/** The town shapes joined with their scores (by psgc), each with its colour. */
function withTownColors(shapes: PlaceCollection, scores: PlaceScores | null, theme: Theme) {
  const noDataColor = readPalette().noData;
  // psgc → that town's score entry.
  const byPsgc = new Map((scores?.places ?? []).map((entry) => [entry.psgc, entry]));
  return {
    ...shapes,
    features: shapes.features.map((feature) => {
      const entry = byPsgc.get(feature.properties.psgc);
      const score = entry?.score ?? null;
      const properties = {
        ...feature.properties,
        score,
        incomplete: entry?.incomplete ?? false,
        color: colorOf(score, theme, noDataColor),
        noData: score === null,
      };
      return { ...feature, properties };
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
  /** Every town's score, shown when zoomed in. null = not loaded. */
  placeScores: PlaceScores | null;
  /**
   * The heat map. While it is set, the same shapes are coloured by heat
   * index instead of the score (the score colours are hidden). null = off.
   */
  heat: HeatMapData | null;
  /** The spot the reader picked, marked with a dot. null = none. */
  spot: Spot | null;
  /** The town (or province) the picked spot is in, outlined. null = none. */
  picked: PickedArea | null;
  // A function the map calls when the reader clicks on land.
  onSelect: (spot: Spot) => void;
  /** Which layers are switched on in the legend. */
  layers: MapLayers;
  /** Provinces picked from a headline: outlined, and the map moves to them. null = none. */
  focus: { psgcs: number[] } | null;
  /** A place picked in the search box: the map flies to it. A new object for every pick. null = none. */
  goTo: Spot | null;
  /**
   * Called after the locate button was used: 'outside' = the reader is not in
   * the Philippines, 'failed' = the browser gave no location, null = it worked.
   */
  // `'outside' | 'failed' | null` is a union: exactly one of these three values.
  onLocateResult: (problem: 'outside' | 'failed' | null) => void;
  /** The headline filter chosen in the headlines panel; the news dots follow it. */
  newsType: string;
  /** The fixed hazard maps the server has loaded (null = not known yet). */
  hazards: HazardLayerInfo[] | null;
  /** Called with the zoom level whenever the reader stops zooming (the legend needs it). */
  onZoom: (zoom: number) => void;
};

// The box a spot must be in to have a score (the same limits as the server's /api/point).
const SPOT_BOX = { minLat: 4, maxLat: 22, minLon: 116, maxLon: 128 };

// No province has this code, so a filter with it matches nothing.
const MATCH_NONE: maplibregl.FilterSpecification = ['in', ['get', 'psgc'], ['literal', [-1]]];

// How see-through the colours are. Over a basemap they fade as you zoom in,
// so the basemap's towns and roads show through.
// `ExpressionSpecification` is MapLibre's type for a rule like this one.
const FADE_WITH_ZOOM: maplibregl.ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 0.45];

export function ProvinceMap({
  data, placeScores, heat, spot, picked, onSelect, layers, focus, goTo, onLocateResult, newsType, hazards, onZoom,
}: Props) {
  // A "ref" holds a value that survives re-renders without causing one.
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onLocateResultRef = useRef(onLocateResult);
  onLocateResultRef.current = onLocateResult;
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  const { t } = useStrings();
  const spotRef = useRef(spot);
  spotRef.current = spot;
  const dataRef = useRef(data);
  dataRef.current = data;
  // Read by the hover label, which the map keeps from its first draw.
  const heatRef = useRef(heat);
  heatRef.current = heat;
  const heatOn = heat !== null;
  const { theme } = useTheme();
  // The small name-and-score label, kept so it can be removed when the spot is closed.
  const popupRef = useRef<maplibregl.Popup | null>(null);
  // Where the reader was looking, kept so a theme change doesn't move the map.
  const cameraRef = useRef<{ center: maplibregl.LngLat; zoom: number } | null>(null);

  // Becomes true once the map has loaded and our layers exist.
  const [ready, setReady] = useState(false);
  // The province colours' normal opacity, kept so the legend can restore it.
  const fillOpacityRef = useRef<maplibregl.ExpressionSpecification | number>(0.85);

  // The town shapes: large (about 1 MB), so they are downloaded once, when the
  // map is first drawn. null = not downloaded (yet).
  const [townShapes, setTownShapes] = useState<PlaceCollection | null>(null);
  const townsRequestedRef = useRef(false);
  // Uses only a ref and a state setter, which never change, so the copy kept
  // by the map's zoom handler (made on the first draw) still works.
  const requestTowns = () => {
    if (townsRequestedRef.current) return;
    townsRequestedRef.current = true;
    fetchPlaceShapes()
      .then(setTownShapes)
      // Allow another try on the next zoom.
      .catch(() => (townsRequestedRef.current = false));
  };
  const requestTownsRef = useRef(requestTowns);
  // True when there is something to show for the towns: shapes, and scores
  // or the heat map (a town the heat map has no value for is striped).
  const townsShown =
    townShapes !== null &&
    townShapes.features.length > 0 &&
    (heatOn || (placeScores !== null && placeScores.places.length > 0));

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
        // The locate button's tooltip, in the language chosen now.
        locale: {
          'GeolocateControl.FindMyLocation': getI18n().t.search.locate,
          'GeolocateControl.LocationNotAvailable': getI18n().t.search.locateFailed,
        },
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
      // Top right, because the search box sits in the top-left corner.
      theMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      // "Use my location": the browser asks the reader for permission first.
      // We ask once per press (no tracking) and mark the place with our own
      // spot dot, so MapLibre's blue dot is switched off.
      const locate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: false, timeout: 10_000 },
        trackUserLocation: false,
        showUserLocation: false,
        // Town level, not street level.
        fitBoundsOptions: { maxZoom: 10 },
      });
      locate.on('geolocate', (event) => {
        const { latitude, longitude } = event.coords;
        const inside =
          latitude >= SPOT_BOX.minLat && latitude <= SPOT_BOX.maxLat &&
          longitude >= SPOT_BOX.minLon && longitude <= SPOT_BOX.maxLon;
        if (!inside) {
          onLocateResultRef.current('outside');
          return;
        }
        onLocateResultRef.current(null);
        // 4 decimals (about 11 m), like a click.
        onSelectRef.current({ lat: Number(latitude.toFixed(4)), lon: Number(longitude.toFixed(4)) });
      });
      // Further away than the map can even show.
      locate.on('outofmaxbounds', () => onLocateResultRef.current('outside'));
      locate.on('error', () => onLocateResultRef.current('failed'));
      theMap.addControl(locate, 'top-right');

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
        const hatch = hatchImage({ color: palette.inkSoft, background: palette.noData });
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
        const lines = hatchImage({ color: palette.inkSoft });
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
        // The towns: the same colours and stripes, drawn over the provinces.
        // Fully see-through until the town colours are loaded (see the legend effect below).
        theMap.addSource('places', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        theMap.addLayer(
          {
            id: 'town-fill',
            type: 'fill',
            source: 'places',
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0 },
          },
          firstRoad ?? firstLabel,
        );
        if (hatch) {
          theMap.addLayer(
            {
              id: 'town-nodata',
              type: 'fill',
              source: 'places',
              filter: ['==', ['get', 'noData'], true],
              paint: { 'fill-pattern': HATCH, 'fill-opacity': 0 },
            },
            firstRoad ?? firstLabel,
          );
        }
        if (lines) {
          theMap.addLayer(
            {
              id: 'town-incomplete',
              type: 'fill',
              source: 'places',
              filter: ['all', ['==', ['get', 'incomplete'], true], ['==', ['get', 'noData'], false]],
              paint: { 'fill-pattern': HATCH_LINES, 'fill-opacity': 0 },
            },
            firstRoad ?? firstLabel,
          );
        }
        // Thin town borders, appearing as the reader zooms in.
        theMap.addLayer(
          {
            id: 'town-outline',
            type: 'line',
            source: 'places',
            minzoom: BORDERS_FROM,
            paint: {
              'line-color': palette.inkSoft,
              'line-width': 0.4,
              'line-opacity': ['interpolate', ['linear'], ['zoom'], BORDERS_FROM, 0, BORDERS_FULL, 0.7],
            },
          },
          firstLabel,
        );
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
        // The outline of the picked spot's town (or its province when the
        // town is unknown): a light band under a dark line, so it shows on
        // every colour in both themes. Matches nothing until a spot is picked.
        for (const source of ['places', 'provinces']) {
          theMap.addLayer({
            id: `picked-${source}-casing`,
            type: 'line',
            source,
            filter: MATCH_NONE,
            paint: { 'line-color': palette.paper, 'line-width': 6 },
          });
          theMap.addLayer({
            id: `picked-${source}`,
            type: 'line',
            source,
            filter: MATCH_NONE,
            paint: { 'line-color': palette.ink, 'line-width': 2.5 },
          });
        }

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
        popupRef.current = popup;
        // `MapLayerMouseEvent` is MapLibre's type for a pointer event on one of our layers.
        const showLabel = (event: maplibregl.MapLayerMouseEvent) => {
          const properties = event.features?.[0]?.properties;
          if (!properties) return;
          // Read at this moment, so the label follows the language chosen now.
          const words = getI18n().t.map;
          // `Record<string, unknown>` = an object with any names; MapLibre's properties are like that.
          const scoreOf = (props: Record<string, unknown>) =>
            scoreText(typeof props.score === 'number' ? props.score : null, props.incomplete === true);
          // Name the town under the pointer (at any zoom), once its colours are loaded.
          const town = theMap.getLayer('town-fill')
            ? theMap.queryRenderedFeatures(event.point, { layers: ['town-fill'] })[0]?.properties
            : undefined;
          const heatNow = heatRef.current;
          let text: string;
          if (heatNow) {
            // The heat map is on: the heat index and its model, never the score.
            const t = getI18n().t;
            const heatOf = (props: Record<string, unknown>) =>
              heatText(
                typeof props.heatIndexC === 'number' ? props.heatIndexC : null,
                typeof props.band === 'string' ? props.band : null,
                t,
              );
            const model = t.heat.models[heatNow.model];
            text = town
              ? fill(t.heat.townLabel, { town: town.name, province: town.province_name, heat: heatOf(town), model })
              : fill(t.heat.provinceLabel, { province: properties.name, heat: heatOf(properties), model });
          } else if (town && typeof town.score === 'number') {
            text = fill(words.townLabel, { town: town.name, province: town.province_name, score: scoreOf(town) });
          } else if (typeof properties.top_place === 'string') {
            // A province shows its highest town's score, so say which town.
            text = fill(words.provinceTopLabel, {
              province: properties.name,
              score: scoreOf(properties),
              town: properties.top_place,
            });
          } else {
            text = fill(words.provinceLabel, { province: properties.name, score: scoreOf(properties) });
          }
          popup.setLngLat(event.lngLat).setText(text).addTo(theMap);
        };
        theMap.on('mousemove', 'province-fill', (event) => {
          theMap.getCanvas().style.cursor = 'pointer';
          showLabel(event);
        });
        // A touch screen has no hover, so a tap shows the label too. It stays
        // beside the dot until the next tap or until the card is closed.
        theMap.on('mouseleave', 'province-fill', () => {
          theMap.getCanvas().style.cursor = '';
          popup.remove();
        });

        // A click on any province shape picks the exact spot under the pointer.
        // The hazard stripes drawn over it have no click handler, so they never get in the way.
        // 4 decimals is about 11 m, plenty for our purposes and tidy in links.
        theMap.on('click', 'province-fill', (event) => {
          // A click on an event, storm or headline dot opens its popup instead.
          const hits = [...OVERLAY_CLICK_LAYERS, ...NEWS_LAYERS].filter((id) => theMap.getLayer(id));
          if (hits.length > 0 && theMap.queryRenderedFeatures(event.point, { layers: hits }).length > 0) {
            return;
          }
          showLabel(event);
          onSelectRef.current({
            lat: Number(event.lngLat.lat.toFixed(4)),
            lon: Number(event.lngLat.lng.toFixed(4)),
          });
        });

        // The town shapes are downloaded right away: the map colours towns at
        // every zoom. If that fails, the next zoom tries again.
        requestTownsRef.current();
        theMap.on('zoomend', () => {
          requestTownsRef.current();
          onZoomRef.current(theMap.getZoom());
        });
        onZoomRef.current(theMap.getZoom());

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

  // Whenever new data arrives (or the map becomes ready), hand it to the map:
  // coloured by heat while the heat map is on, by score otherwise.
  useEffect(() => {
    if (!ready || !data) return;
    const source = mapRef.current?.getSource('provinces') as maplibregl.GeoJSONSource | undefined;
    source?.setData(heat ? withProvinceHeat(data, heat, readPalette()) : withColors(data, theme));
  }, [ready, data, theme, heat]);

  // Whenever the town shapes, scores or heat values change, hand them to the map.
  useEffect(() => {
    if (!ready || !townShapes) return;
    const source = mapRef.current?.getSource('places') as maplibregl.GeoJSONSource | undefined;
    source?.setData(
      heat ? withTownHeat(townShapes, heat, readPalette()) : withTownColors(townShapes, placeScores, theme),
    );
  }, [ready, townShapes, placeScores, theme, heat]);

  // Outline the picked spot's town, or its province when the town is unknown.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const placePsgc = picked?.placePsgc ?? null;
    // The town outline needs the town shapes.
    if (placePsgc !== null) requestTownsRef.current();
    const townFilter: maplibregl.FilterSpecification =
      placePsgc !== null ? ['==', ['get', 'psgc'], placePsgc] : MATCH_NONE;
    const provinceFilter: maplibregl.FilterSpecification =
      picked && placePsgc === null ? ['==', ['get', 'psgc'], picked.provincePsgc] : MATCH_NONE;
    for (const id of ['picked-places', 'picked-places-casing']) map.setFilter(id, townFilter);
    for (const id of ['picked-provinces', 'picked-provinces-casing']) map.setFilter(id, provinceFilter);
  }, [ready, picked]);

  // Event markers and storm tracks (see mapOverlays.ts).
  useOverlays(mapRef, ready);
  // Headline dots (see newsOverlay.ts).
  useNewsDots(mapRef, ready, data, newsType);
  // Fixed hazard map stripes, over the town colours (see hazardOverlay.ts).
  useHazardZones(mapRef, ready, hazards, layers);

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

  // A place picked in the search box: fly to it, zooming in to town level
  // (zoom 9) unless the reader is already closer.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !goTo) return;
    map.flyTo({ center: [goTo.lon, goTo.lat], zoom: Math.max(map.getZoom(), 9) });
  }, [ready, goTo]);

  // Keep the locate button's tooltip and the map's own name in the reader's language.
  useEffect(() => {
    if (!ready) return;
    const button = containerRef.current?.querySelector('.maplibregl-ctrl-geolocate');
    button?.setAttribute('title', t.search.locate);
    button?.setAttribute('aria-label', t.search.locate);
    // What a screen reader says when it reaches the map itself.
    mapRef.current?.getCanvas().setAttribute('aria-label', heatOn ? t.heat.mapLabel : t.map.label);
  }, [ready, t, heatOn]);

  // Show or hide layers when a legend tick box changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // The colours turn fully see-through instead of being removed, so a
    // click on land still picks a spot. Once the town colours are there, they
    // replace the province colours at every zoom, so each town shows its own
    // score, never its province's highest. The province colour stays only
    // until the towns arrive. The heat map uses the same layers, so they are
    // on while it is, whatever the score tick box says.
    const colorsOn = layers.scores || heatOn;
    const provinceOpacity = colorsOn && !townsShown ? fillOpacityRef.current : 0;
    const townOpacity = colorsOn && townsShown ? fillOpacityRef.current : 0;
    for (const id of ['province-fill', 'province-nodata', 'province-incomplete']) {
      if (map.getLayer(id)) map.setPaintProperty(id, 'fill-opacity', provinceOpacity);
    }
    for (const id of ['town-fill', 'town-nodata', 'town-incomplete']) {
      if (map.getLayer(id)) map.setPaintProperty(id, 'fill-opacity', townOpacity);
    }
    const show = (ids: string[], on: boolean) => {
      for (const id of ids) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
      }
    };
    show(EVENT_LAYERS, layers.events);
    show(STORM_LAYERS, layers.storms);
    show(NEWS_LAYERS, layers.news);
    show(SURGE_LAYERS, layers.stormSurge);
    show(LANDSLIDE_LAYERS, layers.landslide);
    // Storm names are HTML labels, not map layers; CSS hides them.
    containerRef.current?.classList.toggle('hide-storm-labels', !layers.storms);
  }, [ready, layers, townsShown, heatOn]);

  // Whenever the picked spot changes, move the dot (or remove it).
  useEffect(() => {
    if (!ready) return;
    // Closing the card also takes away the label a tap left behind.
    if (spot === null) popupRef.current?.remove();
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
