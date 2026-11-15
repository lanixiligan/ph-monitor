// The map: provinces coloured by score. Hover shows the name and score;
// a click selects the province.
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
import type { ProvinceCollection } from '../api.ts';
import { bandFor, NO_DATA_COLOR } from '../scoreScale.ts';

maplibregl.setWorkerUrl(workerUrl);

// Free basemap, no key needed (OpenFreeMap).
const BASEMAP_URL = 'https://tiles.openfreemap.org/styles/positron';

// Used when the basemap can't be reached: a plain background, shapes only.
const PLAIN_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#eef1f3' } }],
};

// The box the map opens on: [west, south] to [east, north].
const PH_BOUNDS: [[number, number], [number, number]] = [
  [116.5, 4.5],
  [127, 21.2],
];

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
  try {
    const response = await fetch(BASEMAP_URL);
    if (response.ok) return BASEMAP_URL;
  } catch {
    // Offline or blocked: fall through to the plain style.
  }
  return PLAIN_STYLE;
}

// `type Props` lists what the parent must pass to this component.
type Props = {
  data: ProvinceCollection | null;
  selectedPsgc: number | null;
  // A function the map calls when a province is clicked.
  onSelect: (psgc: number) => void;
};

export function ProvinceMap({ data, selectedPsgc, onSelect }: Props) {
  // A "ref" holds a value that survives re-renders without causing one.
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

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
      });
      const theMap = map;
      mapRef.current = theMap;
      theMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');

      theMap.on('load', () => {
        theMap.addSource('provinces', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // Put our shapes underneath the basemap's place names, if it has any.
        const firstLabel = theMap.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;

        theMap.addLayer(
          {
            id: 'province-fill',
            type: 'fill',
            source: 'provinces',
            // ['get', 'color'] means "read this province's own color property".
            paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.85 },
          },
          firstLabel,
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
        // A thick outline, shown only for the selected province (none at first).
        theMap.addLayer({
          id: 'province-selected',
          type: 'line',
          source: 'provinces',
          paint: { 'line-color': '#111111', 'line-width': 2.5 },
          filter: ['==', ['get', 'psgc'], -1],
        });

        // Hover: a small label with the name and score.
        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
        theMap.on('mousemove', 'province-fill', (event) => {
          const properties = event.features?.[0]?.properties;
          if (!properties) return;
          theMap.getCanvas().style.cursor = 'pointer';
          const score = typeof properties.score === 'number' ? properties.score : 'no score yet';
          popup
            .setLngLat(event.lngLat)
            .setText(`${properties.name}: ${score}`)
            .addTo(theMap);
        });
        theMap.on('mouseleave', 'province-fill', () => {
          theMap.getCanvas().style.cursor = '';
          popup.remove();
        });

        theMap.on('click', 'province-fill', (event) => {
          const psgc = event.features?.[0]?.properties?.psgc;
          if (typeof psgc === 'number') onSelectRef.current(psgc);
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

  // Whenever the selection changes, move the thick outline.
  useEffect(() => {
    if (!ready) return;
    mapRef.current?.setFilter('province-selected', ['==', ['get', 'psgc'], selectedPsgc ?? -1]);
  }, [ready, selectedPsgc]);

  return <div ref={containerRef} className="map" />;
}
