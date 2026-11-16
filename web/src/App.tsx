// The whole page: a header, the map with its legend, the status card for
// the clicked spot, the headlines and live streams below the map, and the
// credits line.

import { useEffect, useState } from 'react';
import { APP_NAME } from '@ph-monitor/shared';
import { fetchProvinces } from './api.ts';
import type { ProvinceCollection, Spot } from './api.ts';
import { Disclaimer } from './components/Disclaimer.tsx';
import { Legend } from './components/Legend.tsx';
import { NewsPanel } from './components/NewsPanel.tsx';
import { ProvinceMap } from './components/ProvinceMap.tsx';
import { StatusCard } from './components/StatusCard.tsx';
import { StreamsPanel } from './components/StreamsPanel.tsx';
import { LanguageSwitch, useStrings } from './i18n/index.ts';
import { SHOW_BASEMAP } from './mapSettings.ts';

// How often the map asks the server for new scores.
const REFRESH_MS = 5 * 60 * 1000;

/**
 * Lets a link open a spot straight away: /?lat=10.3157&lon=123.8854
 * Returns null when the address has no (valid) coordinates.
 */
function spotFromAddress(): Spot | null {
  const params = new URLSearchParams(window.location.search);
  const lat = Number(params.get('lat'));
  const lon = Number(params.get('lon'));
  // Number(null) is 0, which is not in the Philippines, so this also
  // rejects an address with no coordinates at all.
  const valid = lat >= 4 && lat <= 22 && lon >= 116 && lon <= 128;
  return valid ? { lat, lon } : null;
}

export function App() {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  // `useState` remembers a value between re-draws of the page.
  const [provinces, setProvinces] = useState<ProvinceCollection | null>(null);
  // true when the last load failed; the message is looked up when drawn.
  const [failed, setFailed] = useState(false);
  const [spot, setSpot] = useState<Spot | null>(spotFromAddress);

  // Keep the address in step with the chosen spot, so it can be copied and
  // shared: /?lat=10.3157&lon=123.8854. `replaceState` changes the address
  // without reloading the page or adding a step to the Back button.
  useEffect(() => {
    const address = new URL(window.location.href);
    if (spot === null) {
      address.searchParams.delete('lat');
      address.searchParams.delete('lon');
    } else {
      // 4 decimals is about 10 metres, plenty for a spot on the map.
      address.searchParams.set('lat', spot.lat.toFixed(4));
      address.searchParams.set('lon', spot.lon.toFixed(4));
    }
    window.history.replaceState(null, '', address);
  }, [spot]);

  // Load the provinces now, then again every few minutes.
  useEffect(() => {
    async function load() {
      try {
        setProvinces(await fetchProvinces());
        setFailed(false);
      } catch {
        setFailed(true);
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app">
      <header>
        <h1>{APP_NAME}</h1>
        <LanguageSwitch />
        <p>{t.app.intro}</p>
        {/* Links that jump down the page; `#news-title` is the id of a heading. */}
        <nav>
          <a href="#news-title">{t.app.jumpHeadlines}</a> ·{' '}
          <a href="#streams-title">{t.app.jumpStreams}</a>
        </nav>
      </header>

      {failed && <div className="error">{t.app.loadError}</div>}

      <main>
        <ProvinceMap data={provinces} spot={spot} onSelect={setSpot} />
        <Legend />
        {spot !== null && <StatusCard spot={spot} onClose={() => setSpot(null)} />}
      </main>

      <div className="below-map">
        <NewsPanel />
        <StreamsPanel />
      </div>

      <footer>
        <Disclaimer />{' '}
        {t.app.creditQuakes} <a href="https://earthquake.usgs.gov/">USGS</a>.{' '}
        {t.app.creditWeather} <a href="https://open-meteo.com/">Open-Meteo</a>
        {t.app.creditWeatherEnd} {t.app.creditBoundaries}{' '}
        <a href="https://github.com/faeldon/philippines-json-maps">philippines-json-maps</a>.{' '}
        {t.app.creditEvents} <a href="https://www.gdacs.org/">GDACS</a>
        {t.app.creditEventsMid} <a href="https://eonet.gsfc.nasa.gov/">NASA EONET</a>.{' '}
        {t.app.creditStorms}{' '}
        <a href="https://www.jma.go.jp/bosai/map.html#contents=typhoon">JMA</a> {t.app.creditStormsMid}{' '}
        <a href="https://www.metoc.navy.mil/jtwc/jtwc.html">JTWC</a>.{' '}
        {t.app.creditOutlook} <a href="https://open-meteo.com/">Open-Meteo</a>
        {t.app.creditOutlookMid}{' '}
        <a href="https://open-meteo.com/en/docs/flood-api">GloFAS via Open-Meteo</a>
        {t.app.creditOutlookEnd} {t.app.creditNews} {t.app.creditVideo}{' '}
        <a href="https://www.youtube.com/">YouTube</a>
        {t.app.creditVideoEnd}
        {/* The basemap credit is only needed when the basemap is shown. */}
        {SHOW_BASEMAP && (
          <>
            {' '}
            {t.app.creditBasemap} <a href="https://openfreemap.org/">OpenFreeMap</a>
            {t.app.creditBasemapMid} <a href="https://www.openmaptiles.org/">OpenMapTiles</a>
            {t.app.creditBasemapData}{' '}
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>{' '}
            {t.app.creditBasemapEnd}
          </>
        )}
      </footer>
    </div>
  );
}
