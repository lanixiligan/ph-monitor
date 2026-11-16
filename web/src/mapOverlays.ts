// Extra map layers: disaster event markers and storm tracks.
// `useOverlays` is a React "hook": a function that runs along with a component
// (here ProvinceMap) and can start and stop things when the component does.

import * as maplibregl from 'maplibre-gl';
import { useEffect } from 'react';
// `RefObject` is the type of a ref: a box holding a value that survives re-renders.
import type { RefObject } from 'react';
import type { DisasterEvent, Storm, StormTrackPoint } from '@ph-monitor/shared';
import { fetchEvents, fetchStorms } from './api.ts';
import { formatTime, safeUrl } from './format.ts';
import { emptyCollection, eventsToGeoJson, SAMPLE_NOTICE, stormsToGeoJson } from './stormGeo.ts';

const REFRESH_MS = 5 * 60 * 1000;
const INK = '#1f1f1f';
const GREY = '#6b6b6b';

/** Layers that react to clicks. ProvinceMap uses this to ignore clicks on them. */
export const OVERLAY_CLICK_LAYERS = ['events-dot', 'storm-dots'];

const SOURCE_NAMES = ['events', 'storm-lines', 'storm-dots', 'storm-radii'];

/** Adds the sources and layers. Called once, when the map is ready. */
function addLayers(map: maplibregl.Map) {
  for (const name of SOURCE_NAMES) {
    map.addSource(name, { type: 'geojson', data: emptyCollection() });
  }
  map.addLayer({
    id: 'storm-radii',
    type: 'line',
    source: 'storm-radii',
    paint: { 'line-color': GREY, 'line-width': 1 },
  });
  // Observed positions: solid line. Forecast positions: dashed line.
  map.addLayer({
    id: 'storm-past',
    type: 'line',
    source: 'storm-lines',
    filter: ['==', ['get', 'forecast'], false],
    paint: { 'line-color': INK, 'line-width': 2.5 },
  });
  map.addLayer({
    id: 'storm-forecast',
    type: 'line',
    source: 'storm-lines',
    filter: ['==', ['get', 'forecast'], true],
    paint: { 'line-color': INK, 'line-width': 2, 'line-dasharray': [2, 2] },
  });
  // Observed dot: filled. Forecast dot: hollow.
  map.addLayer({
    id: 'storm-dots',
    type: 'circle',
    source: 'storm-dots',
    paint: {
      'circle-radius': 5,
      'circle-color': ['case', ['get', 'forecast'], '#ffffff', INK],
      'circle-stroke-color': INK,
      'circle-stroke-width': 2,
    },
  });
  // Events: a bigger, thicker ring means a higher alert level.
  map.addLayer({
    id: 'events-dot',
    type: 'circle',
    source: 'events',
    paint: {
      'circle-radius': ['match', ['get', 'alert'], 'red', 10, 'orange', 8, 6],
      'circle-color': '#ffffff',
      'circle-stroke-color': INK,
      'circle-stroke-width': ['match', ['get', 'alert'], 'red', 4, 'orange', 3, 'green', 2, 1],
    },
  });
}

/** Adds a plain line of text to a popup. */
function addLine(box: HTMLElement, text: string, bold = false) {
  const line = document.createElement(bold ? 'strong' : 'div');
  // textContent (not innerHTML) so text from a feed can never become page code.
  line.textContent = text;
  box.appendChild(line);
}

function addLink(box: HTMLElement, url: string | null, text: string) {
  const href = safeUrl(url);
  if (!href) return;
  const link = document.createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = text;
  box.appendChild(link);
}

function eventPopup(event: DisasterEvent): HTMLElement {
  const box = document.createElement('div');
  box.className = 'map-popup';
  addLine(box, event.title, true);
  addLine(box, `Kind: ${event.kind}`);
  if (event.alertLevel) addLine(box, `Alert level: ${event.alertLevel}`);
  addLine(box, `Source: ${event.source === 'gdacs' ? 'GDACS' : 'NASA EONET'}`);
  addLine(box, `Started: ${formatTime(event.startedAt)}`);
  addLink(box, event.url, 'Source page');
  return box;
}

function stormPopup(name: string, source: Storm['source'], point: StormTrackPoint): HTMLElement {
  const box = document.createElement('div');
  box.className = 'map-popup';
  addLine(box, name, true);
  if (source === 'sample') addLine(box, SAMPLE_NOTICE, true);
  addLine(box, point.isForecast ? 'Forecast position' : 'Observed position');
  addLine(box, `Time: ${formatTime(point.validAt)}`);
  addLine(box, `Wind: ${point.windKt === null ? '–' : `${point.windKt} kt`}`);
  addLine(box, `Pressure: ${point.pressureHpa === null ? '–' : `${point.pressureHpa} hPa`}`);
  return box;
}

/** Puts each storm's name beside its latest observed dot (HTML, so no map fonts are needed). */
function drawLabels(map: maplibregl.Map, storms: Storm[], markers: maplibregl.Marker[]) {
  for (const marker of markers) marker.remove();
  markers.length = 0;
  for (const storm of storms) {
    const observed = storm.track.filter((point) => !point.isForecast);
    const anchor = observed[observed.length - 1] ?? storm.track[0];
    if (!anchor) continue;
    const label = document.createElement('div');
    label.className = 'storm-label';
    // The sample storm shows only its warning, so it cannot pass for a real one.
    label.textContent = storm.source === 'sample' ? SAMPLE_NOTICE : storm.name;
    const marker = new maplibregl.Marker({ element: label, anchor: 'left', offset: [10, -12] })
      .setLngLat([anchor.lon, anchor.lat])
      .addTo(map);
    markers.push(marker);
  }
}

/** Reads the data the clicked feature carries. Returns null if it is missing. */
function readJson(properties: Record<string, unknown> | undefined): unknown {
  const text = properties?.json;
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Draws events and storms on the map and refreshes them every 5 minutes. */
export function useOverlays(mapRef: RefObject<maplibregl.Map | null>, ready: boolean) {
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!map.getSource('events')) addLayers(map);
    const markers: maplibregl.Marker[] = [];

    // Show a popup when a dot is clicked; show a pointer hand over it.
    map.on('click', 'events-dot', (click) => {
      const event = readJson(click.features?.[0]?.properties) as DisasterEvent | null;
      if (!event) return;
      new maplibregl.Popup({ offset: 12 }).setLngLat([event.lon, event.lat]).setDOMContent(eventPopup(event)).addTo(map);
    });
    map.on('click', 'storm-dots', (click) => {
      const data = readJson(click.features?.[0]?.properties) as
        | { storm: string; source: Storm['source']; point: StormTrackPoint }
        | null;
      if (!data) return;
      new maplibregl.Popup({ offset: 12 })
        .setLngLat([data.point.lon, data.point.lat])
        .setDOMContent(stormPopup(data.storm, data.source, data.point))
        .addTo(map);
    });
    for (const layer of OVERLAY_CLICK_LAYERS) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''));
    }

    // Load both lists. A failure just leaves the old drawing in place.
    async function refresh() {
      try {
        const events = await fetchEvents();
        (map?.getSource('events') as maplibregl.GeoJSONSource | undefined)?.setData(eventsToGeoJson(events));
      } catch {
        // Keep what is already drawn.
      }
      try {
        const storms = await fetchStorms();
        const shapes = stormsToGeoJson(storms);
        const source = (name: string) => map?.getSource(name) as maplibregl.GeoJSONSource | undefined;
        source('storm-lines')?.setData(shapes.lines);
        source('storm-dots')?.setData(shapes.dots);
        source('storm-radii')?.setData(shapes.radii);
        if (map) drawLabels(map, storms, markers);
      } catch {
        // Keep what is already drawn.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      for (const marker of markers) marker.remove();
    };
  }, [ready, mapRef]);
}
