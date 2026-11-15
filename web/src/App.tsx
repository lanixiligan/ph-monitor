// The whole page: a header, the map with its legend, the status card for
// the clicked spot, and the credits line.

import { useEffect, useState } from 'react';
import { APP_NAME } from '@ph-monitor/shared';
import { fetchProvinces } from './api.ts';
import type { ProvinceCollection, Spot } from './api.ts';
import { Disclaimer } from './components/Disclaimer.tsx';
import { Legend } from './components/Legend.tsx';
import { ProvinceMap } from './components/ProvinceMap.tsx';
import { StatusCard } from './components/StatusCard.tsx';
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
  // `useState` remembers a value between re-draws of the page.
  const [provinces, setProvinces] = useState<ProvinceCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [spot, setSpot] = useState<Spot | null>(spotFromAddress);

  // Load the provinces now, then again every few minutes.
  useEffect(() => {
    async function load() {
      try {
        setProvinces(await fetchProvinces());
        setError(null);
      } catch {
        setError('Could not load the scores. Is the server running?');
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
        <p>Stress right now from earthquakes and weather. Click anywhere on land for that spot.</p>
      </header>

      {error && <div className="error">{error}</div>}

      <main>
        <ProvinceMap data={provinces} spot={spot} onSelect={setSpot} />
        <Legend />
        {spot !== null && <StatusCard spot={spot} onClose={() => setSpot(null)} />}
      </main>

      <footer>
        <Disclaimer />{' '}
        Earthquakes: <a href="https://earthquake.usgs.gov/">USGS</a>. Weather (modelled):{' '}
        <a href="https://open-meteo.com/">Open-Meteo</a>, CC BY 4.0. Boundaries: NAMRIA and PSA via
        OCHA, CC BY 3.0 IGO, from{' '}
        <a href="https://github.com/faeldon/philippines-json-maps">philippines-json-maps</a>.
        {/* The basemap credit is only needed when the basemap is shown. */}
        {SHOW_BASEMAP && (
          <>
            {' '}
            Basemap: <a href="https://openfreemap.org/">OpenFreeMap</a>, ©{' '}
            <a href="https://www.openmaptiles.org/">OpenMapTiles</a>, data ©{' '}
            <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.
          </>
        )}
      </footer>
    </div>
  );
}
