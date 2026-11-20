// The quake markers: one dot per earthquake from GET /api/quakes, sized by
// magnitude (quakeGeo.ts). Hovering a dot shows its magnitude, depth and how
// long ago it was; a click opens the same lines with the USGS page link.
// Display only: the markers never change the score.
// `useQuakeMarkers` is a React "hook": it runs along with ProvinceMap.

import * as maplibregl from 'maplibre-gl';
import { useEffect } from 'react';
// `RefObject` is the type of a ref: a box holding a value that survives re-renders.
import type { RefObject } from 'react';
import type { QuakeMap, QuakePoint } from '@ph-monitor/shared';
import { formatTime, safeUrl, timeAgo } from './format.ts';
import { fill, getI18n } from './i18n/index.ts';
import { readPalette } from './palette.ts';
import { emptyCollection } from './stormGeo.ts';
import { quakesToGeoJson } from './quakeGeo.ts';

/** The quake layer, for the legend's tick box and for ProvinceMap's click and hover checks. */
export const QUAKE_LAYERS = ['quakes-dot'];

/** Adds the source and the layer. Called once each time the map is (re)made. */
function addLayer(map: maplibregl.Map) {
  const { ink, inkSoft } = readPalette();
  map.addSource('quakes', { type: 'geojson', data: emptyCollection() });
  // A see-through ink disc with an ink ring: bigger = stronger. Ink, not a
  // warm colour, so it never competes with the score colours under it.
  map.addLayer({
    id: 'quakes-dot',
    type: 'circle',
    source: 'quakes',
    paint: {
      'circle-radius': ['get', 'radius'],
      'circle-color': inkSoft,
      'circle-opacity': 0.35,
      'circle-stroke-color': ink,
      'circle-stroke-width': 1.5,
    },
  });
}

/** Reads the quake a dot carries. Returns null if it is missing. */
function quakeOf(properties: Record<string, unknown> | undefined): QuakePoint | null {
  // `?.` gives undefined instead of failing when `properties` is missing.
  const text = properties?.json;
  if (typeof text !== 'string') return null;
  try {
    // `as QuakePoint`: we tell TypeScript what the text holds (we wrote it ourselves, in quakeGeo.ts).
    return JSON.parse(text) as QuakePoint;
  } catch {
    return null;
  }
}

/** Adds a plain line of text. textContent (not innerHTML), so feed text can never become page code. */
// `bold = false`: the value used when the caller leaves `bold` out.
function addLine(box: HTMLElement, text: string, bold = false) {
  const line = document.createElement(bold ? 'strong' : 'div');
  line.textContent = text;
  box.appendChild(line);
}

/** The popup's lines, in the language chosen at that moment. `withLink` adds the USGS page. */
export function quakePopup(quake: QuakePoint, withLink: boolean): HTMLElement {
  const { t } = getI18n();
  const box = document.createElement('div');
  box.className = 'map-popup';
  addLine(box, fill(t.quakes.popupMagnitude, { magnitude: quake.magnitude.toFixed(1) }), true);
  if (quake.place) addLine(box, quake.place);
  addLine(
    box,
    quake.depthKm === null ? t.quakes.popupNoDepth : fill(t.card.kmDeep, { km: Math.round(quake.depthKm) }),
  );
  addLine(box, `${timeAgo(quake.occurredAt, Date.now(), t)} · ${formatTime(quake.occurredAt)}`);
  const href = safeUrl(quake.url);
  if (withLink && href) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = t.card.usgsPage;
    box.appendChild(link);
  } else if (href) {
    addLine(box, t.quakes.popupClick);
  }
  return box;
}

/** Draws the quake markers and keeps them in step with `quakes` (null = not loaded: nothing drawn). */
export function useQuakeMarkers(mapRef: RefObject<maplibregl.Map | null>, ready: boolean, quakes: QuakeMap | null) {
  // Add the layer and its hover and click popups once the map is ready.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!map.getSource('quakes')) addLayer(map);
    const hover = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
    // The quake whose click popup is open; its hover popup is not drawn over it.
    let clickedId: string | null = null;

    const onMove = (event: maplibregl.MapLayerMouseEvent) => {
      const quake = quakeOf(event.features?.[0]?.properties);
      if (!quake) return;
      map.getCanvas().style.cursor = 'pointer';
      if (quake.id === clickedId) return;
      hover.setLngLat([quake.lon, quake.lat]).setDOMContent(quakePopup(quake, false)).addTo(map);
    };
    const onLeave = () => {
      map.getCanvas().style.cursor = '';
      hover.remove();
    };
    const onClick = (event: maplibregl.MapLayerMouseEvent) => {
      const quake = quakeOf(event.features?.[0]?.properties);
      if (!quake) return;
      hover.remove();
      clickedId = quake.id;
      const popup = new maplibregl.Popup({ offset: 12 })
        .setLngLat([quake.lon, quake.lat])
        .setDOMContent(quakePopup(quake, true))
        .addTo(map);
      popup.on('close', () => {
        if (clickedId === quake.id) clickedId = null;
      });
    };
    map.on('mousemove', 'quakes-dot', onMove);
    map.on('mouseleave', 'quakes-dot', onLeave);
    map.on('click', 'quakes-dot', onClick);
    return () => {
      map.off('mousemove', 'quakes-dot', onMove);
      map.off('mouseleave', 'quakes-dot', onLeave);
      map.off('click', 'quakes-dot', onClick);
      hover.remove();
    };
  }, [ready, mapRef]);

  // Hand new quakes to the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // `as ... | undefined`: getSource gives a general source; ours is GeoJSON, or missing.
    const source = map.getSource('quakes') as maplibregl.GeoJSONSource | undefined;
    source?.setData(quakes === null ? emptyCollection() : quakesToGeoJson(quakes.quakes));
  }, [ready, mapRef, quakes]);
}
