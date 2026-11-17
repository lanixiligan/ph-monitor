// The "Data sources and credits" page, at /credits. The data licences ask for
// these credits to be shown; the footer of the map page links here.

import { APP_NAME } from '@ph-monitor/shared';
import { LanguageSwitch, useStrings } from '../i18n/index.ts';
import { SHOW_BASEMAP } from '../mapSettings.ts';
import { ThemeSwitch } from '../theme/index.ts';
import { Disclaimer } from './Disclaimer.tsx';

export function CreditsPage() {
  const { t } = useStrings();
  return (
    <div className="app">
      <header className="topbar">
        <h1>
          <a href="/">{APP_NAME}</a>
        </h1>
        <LanguageSwitch />
        <ThemeSwitch />
      </header>

      <main className="credits-page">
        <p>
          <a href="/">← {t.app.backToMap}</a>
        </p>
        <h2>{t.app.creditsTitle}</h2>
        <ul className="credits-list">
          <li>
            {t.app.creditQuakes} <a href="https://earthquake.usgs.gov/">USGS</a>.
          </li>
          <li>
            {t.app.creditWeather} <a href="https://open-meteo.com/">Open-Meteo</a>
            {t.app.creditWeatherEnd}
          </li>
          <li>
            {t.app.creditBoundaries}{' '}
            <a href="https://github.com/faeldon/philippines-json-maps">philippines-json-maps</a>.
          </li>
          <li>
            {t.app.creditEvents} <a href="https://www.gdacs.org/">GDACS</a>
            {t.app.creditEventsMid} <a href="https://eonet.gsfc.nasa.gov/">NASA EONET</a>.
          </li>
          <li>
            {t.app.creditStorms}{' '}
            <a href="https://www.jma.go.jp/bosai/map.html#contents=typhoon">JMA</a> {t.app.creditStormsMid}{' '}
            <a href="https://www.metoc.navy.mil/jtwc/jtwc.html">JTWC</a>.
          </li>
          <li>
            {t.app.creditOutlook} <a href="https://open-meteo.com/">Open-Meteo</a>
            {t.app.creditOutlookMid}{' '}
            <a href="https://open-meteo.com/en/docs/flood-api">GloFAS via Open-Meteo</a>
            {t.app.creditOutlookEnd}
          </li>
          <li>{t.app.creditAlerts}</li>
          <li>{t.app.creditNews}</li>
          <li>
            {t.app.creditVideo} <a href="https://www.youtube.com/">YouTube</a>
            {t.app.creditVideoEnd}
          </li>
          {/* The basemap credit is only needed when the basemap is shown. */}
          {SHOW_BASEMAP && (
            <li>
              {t.app.creditBasemap} <a href="https://openfreemap.org/">OpenFreeMap</a>
              {t.app.creditBasemapMid} <a href="https://www.openmaptiles.org/">OpenMapTiles</a>
              {t.app.creditBasemapData}{' '}
              <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> {t.app.creditBasemapEnd}
            </li>
          )}
        </ul>
      </main>

      <footer>
        <Disclaimer />
      </footer>
    </div>
  );
}
