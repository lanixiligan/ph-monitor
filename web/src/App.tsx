// The whole page: a header, the map with its legend, and the credits line.

import { useEffect, useState } from 'react';
import { APP_NAME } from '@ph-monitor/shared';
import { fetchProvinces } from './api.ts';
import type { ProvinceCollection } from './api.ts';
import { Legend } from './components/Legend.tsx';
import { ProvinceMap } from './components/ProvinceMap.tsx';

// How often the map asks the server for new scores.
const REFRESH_MS = 5 * 60 * 1000;

export function App() {
  // `useState` remembers a value between re-draws of the page.
  const [provinces, setProvinces] = useState<ProvinceCollection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPsgc, setSelectedPsgc] = useState<number | null>(null);

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
        <p>Stress right now, by province: earthquakes and weather. Click a province for details.</p>
      </header>

      {error && <div className="error">{error}</div>}

      <main>
        <ProvinceMap data={provinces} selectedPsgc={selectedPsgc} onSelect={setSelectedPsgc} />
        <Legend />
      </main>

      <footer>
        Earthquakes: <a href="https://earthquake.usgs.gov/">USGS</a>. Weather (modelled):{' '}
        <a href="https://open-meteo.com/">Open-Meteo</a>, CC BY 4.0. Boundaries: NAMRIA and PSA via
        OCHA, CC BY 3.0 IGO, from{' '}
        <a href="https://github.com/faeldon/philippines-json-maps">philippines-json-maps</a>.
        Basemap: <a href="https://openfreemap.org/">OpenFreeMap</a>, ©{' '}
        <a href="https://www.openmaptiles.org/">OpenMapTiles</a>, data ©{' '}
        <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.
      </footer>
    </div>
  );
}
