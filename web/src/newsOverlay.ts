// The headlines layer: a dot on every province named in recent headlines.
// A bigger dot means more headlines. A click lists them with their links.

import * as maplibregl from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import type { NewsItem } from '@ph-monitor/shared';
import type { ProvinceCollection } from './api.ts';
import { fetchNews } from './api.ts';
import { formatTime, safeUrl } from './format.ts';
import { fill, getI18n } from './i18n/index.ts';
import type { NewsDot } from './newsGeo.ts';
import { readPalette } from './palette.ts';
import { newsToGeoJson } from './newsGeo.ts';
import { emptyCollection } from './stormGeo.ts';

const REFRESH_MS = 5 * 60 * 1000;
// How many recent headlines are placed on the map.
const NEWS_LIMIT = 60;
// How many headlines one popup lists before "and N more".
const POPUP_LIMIT = 5;

/** The headline layers, for the legend's tick box and for click handling. */
export const NEWS_LAYERS = ['news-dot'];

function addLayer(map: maplibregl.Map) {
  // The page's headline and panel colours, in the current theme.
  const { news, paper } = readPalette();
  map.addSource('news', { type: 'geojson', data: emptyCollection() });
  map.addLayer(
    {
      id: 'news-dot',
      type: 'circle',
      source: 'news',
      paint: {
        // 1 headline = small dot, 5 or more = the biggest.
        'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 5, 5, 10],
        'circle-color': news,
        'circle-opacity': 0.85,
        'circle-stroke-color': paper,
        'circle-stroke-width': 2,
      },
    },
    // Under the storm and event marks, so those stay on top.
    map.getLayer('storm-radii') ? 'storm-radii' : undefined,
  );
}

// Built when the reader clicks, so it uses the language chosen at that moment.
function newsPopup(dot: NewsDot): HTMLElement {
  const { t } = getI18n();
  const box = document.createElement('div');
  box.className = 'map-popup';
  const title = document.createElement('strong');
  // textContent (not innerHTML) so text from a feed can never become page code.
  title.textContent = fill(t.map.popupNewsTitle, { province: dot.name, count: String(dot.items.length) });
  box.appendChild(title);

  const list = document.createElement('ul');
  list.className = 'map-popup-list';
  for (const item of dot.items.slice(0, POPUP_LIMIT)) {
    const row = document.createElement('li');
    const href = safeUrl(item.url);
    const link = document.createElement(href ? 'a' : 'span');
    if (link instanceof HTMLAnchorElement && href) {
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }
    link.textContent = item.title;
    const meta = document.createElement('div');
    meta.className = 'muted';
    meta.textContent = `${item.outlet} · ${formatTime(item.publishedAt)}`;
    row.append(link, meta);
    list.appendChild(row);
  }
  box.appendChild(list);

  const more = dot.items.length - POPUP_LIMIT;
  if (more > 0) {
    const line = document.createElement('div');
    line.className = 'muted';
    line.textContent = fill(t.map.popupNewsMore, { count: String(more) });
    box.appendChild(line);
  }
  return box;
}

/** Draws the headline dots and refreshes them every 5 minutes. */
export function useNewsDots(
  mapRef: RefObject<maplibregl.Map | null>,
  ready: boolean,
  provinces: ProvinceCollection | null,
) {
  // The latest headlines, kept so the dots can be redrawn when provinces reload.
  const newsRef = useRef<NewsItem[]>([]);
  // Province shapes and points, read when the headlines arrive.
  const provincesRef = useRef(provinces);
  provincesRef.current = provinces;

  function draw(map: maplibregl.Map) {
    const shapes = provincesRef.current;
    if (!shapes) return;
    (map.getSource('news') as maplibregl.GeoJSONSource | undefined)?.setData(newsToGeoJson(newsRef.current, shapes));
  }

  // Add the layer once, then load the headlines now and every few minutes.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (!map.getSource('news')) addLayer(map);

    const onClick = (click: maplibregl.MapLayerMouseEvent) => {
      const text = click.features?.[0]?.properties?.json;
      if (typeof text !== 'string') return;
      // `as` tells TypeScript the shape; safe because newsToGeoJson wrote it.
      const dot = JSON.parse(text) as NewsDot;
      new maplibregl.Popup({ offset: 12, maxWidth: '280px' })
        .setLngLat(click.lngLat)
        .setDOMContent(newsPopup(dot))
        .addTo(map);
    };
    const onEnter = () => (map.getCanvas().style.cursor = 'pointer');
    const onLeave = () => (map.getCanvas().style.cursor = '');
    map.on('click', 'news-dot', onClick);
    map.on('mouseenter', 'news-dot', onEnter);
    map.on('mouseleave', 'news-dot', onLeave);

    let cancelled = false;
    async function refresh() {
      try {
        const news = await fetchNews('all', NEWS_LIMIT);
        if (cancelled || !map) return;
        newsRef.current = news;
        draw(map);
      } catch {
        // Keep what is already drawn.
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      map.off('click', 'news-dot', onClick);
      map.off('mouseenter', 'news-dot', onEnter);
      map.off('mouseleave', 'news-dot', onLeave);
    };
  }, [ready, mapRef]);

  // New province data (every few minutes): place the dots again.
  useEffect(() => {
    const map = mapRef.current;
    if (ready && map) draw(map);
  }, [ready, mapRef, provinces]);
}
