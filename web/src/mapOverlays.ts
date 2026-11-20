// Extra map layers: disaster event markers, storm tracks, and the outline of
// the Philippine Area of Responsibility (PAR) for the Typhoon view.
// `useOverlays` is a React "hook": a function that runs along with a component
// (here ProvinceMap) and can start and stop things when the component does.

import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
// `RefObject` is the type of a ref: a box holding a value that survives re-renders.
import type { RefObject } from 'react';
import type { DisasterEvent, Storm, StormTrackPoint } from '@ph-monitor/shared';
import { fetchEvents, fetchStorms } from './api.ts';
import { formatTime, safeUrl } from './format.ts';
import { readPalette } from './palette.ts';
import { fill, getI18n, lookup, useStrings } from './i18n/index.ts';
import { emptyCollection, eventsToGeoJson, stormsToGeoJson } from './stormGeo.ts';
import { PAR_LABEL_AT, parGeoJson } from './parArea.ts';

const REFRESH_MS = 5 * 60 * 1000;

/** Every event layer and every storm layer, for the legend's tick boxes. */
export const EVENT_LAYERS = ['events-dot'];
export const STORM_LAYERS = ['storm-radii', 'storm-past', 'storm-forecast', 'storm-dots'];

/** The PAR outline (Typhoon view only; its label is HTML, hidden by CSS like the storm names). */
export const PAR_LAYERS = ['par-line'];

/** Layers that react to clicks. ProvinceMap uses this to ignore clicks on them. */
export const OVERLAY_CLICK_LAYERS = ['events-dot', 'storm-dots'];

const SOURCE_NAMES = ['events', 'storm-lines', 'storm-dots', 'storm-radii'];

/** Adds the sources and layers. Called once, when the map is ready. */
function addLayers(map: maplibregl.Map) {
  // The page's ink, muted and panel colours, in the current theme.
  const { ink: INK, inkSoft: GREY, paper: PAPER } = readPalette();
  for (const name of SOURCE_NAMES) {
    map.addSource(name, { type: 'geojson', data: emptyCollection() });
  }
  // The PAR outline: a fixed shape, long dashes in the muted ink, under the storm tracks.
  map.addSource('par', { type: 'geojson', data: parGeoJson() });
  map.addLayer({
    id: 'par-line',
    type: 'line',
    source: 'par',
    layout: { visibility: 'none' },
    paint: { 'line-color': GREY, 'line-width': 1.5, 'line-dasharray': [6, 4] },
  });
  // Its label, as HTML so no map fonts are needed.
  const parLabel = document.createElement('div');
  parLabel.className = 'par-label';
  parLabel.textContent = getI18n().t.typhoon.parShort;
  new maplibregl.Marker({ element: parLabel, anchor: 'bottom' }).setLngLat(PAR_LABEL_AT).addTo(map);
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
      'circle-color': ['case', ['get', 'forecast'], PAPER, INK],
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
      'circle-color': PAPER,
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

// The popups are built when the reader clicks, so they use the language
// chosen at that moment (getI18n()).
function eventPopup(event: DisasterEvent): HTMLElement {
  const { t } = getI18n();
  const box = document.createElement('div');
  box.className = 'map-popup';
  addLine(box, event.title, true);
  addLine(box, fill(t.map.popupKind, { kind: lookup(t.kinds, event.kind) }));
  if (event.alertLevel) {
    addLine(box, fill(t.map.popupAlert, { level: lookup(t.alertLevels, event.alertLevel) }));
  }
  const source = event.source === 'gdacs' ? 'GDACS' : 'NASA EONET';
  addLine(box, fill(t.map.popupSource, { source }));
  addLine(box, fill(t.map.popupStarted, { time: formatTime(event.startedAt) }));
  addLink(box, event.url, t.map.popupSourcePage);
  return box;
}

function stormPopup(name: string, source: Storm['source'], point: StormTrackPoint): HTMLElement {
  const { t } = getI18n();
  const box = document.createElement('div');
  box.className = 'map-popup';
  addLine(box, name, true);
  if (source === 'sample') addLine(box, t.map.sampleNotice, true);
  addLine(box, point.isForecast ? t.map.popupForecast : t.map.popupObserved);
  addLine(box, fill(t.map.popupTime, { time: formatTime(point.validAt) }));
  const wind = point.windKt === null ? '–' : `${point.windKt} kt`;
  addLine(box, fill(t.map.popupWind, { value: wind }));
  const pressure = point.pressureHpa === null ? '–' : `${point.pressureHpa} hPa`;
  addLine(box, fill(t.map.popupPressure, { value: pressure }));
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
    label.textContent = storm.source === 'sample' ? getI18n().t.map.sampleNotice : storm.name;
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

/**
 * Draws events and storms on the map and refreshes them every 5 minutes.
 * `onStorms` hears each storm list, or 'failed' (the Typhoon view's map note uses it).
 */
export function useOverlays(
  mapRef: RefObject<maplibregl.Map | null>,
  ready: boolean,
  onStorms: (result: Storm[] | 'failed') => void,
) {
  // `lang` is only read so this hook re-runs when the language changes.
  const { lang } = useStrings();
  // Kept in a ref so a new function from the parent doesn't restart the loading.
  const onStormsRef = useRef(onStorms);
  onStormsRef.current = onStorms;
  // The latest storms and their labels, kept so the labels can be redrawn.
  const stormsRef = useRef<Storm[]>([]);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!map.getSource('events')) addLayers(map);
    const markers = markersRef.current;

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
        stormsRef.current = storms;
        if (map) drawLabels(map, storms, markers);
        onStormsRef.current(storms);
      } catch {
        // Keep what is already drawn; the Typhoon view says the list could not be loaded.
        onStormsRef.current('failed');
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      for (const marker of markers) marker.remove();
    };
  }, [ready, mapRef]);

  // Draw the storm labels again when the language changes (the sample notice is text).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    drawLabels(map, stormsRef.current, markersRef.current);
  }, [lang, ready, mapRef]);
}
