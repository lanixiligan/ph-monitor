// What the spot panel shows before the reader has clicked the map: how to
// pick a spot, and the provinces with the highest scores right now.

import { useEffect, useState } from 'react';
import type { OfficialAlert } from '@ph-monitor/shared';
import { fetchAlerts } from '../api.ts';
import type { ProvinceCollection } from '../api.ts';
import { useStrings } from '../i18n/index.ts';
import { bandFor, bandLabel, scoreText } from '../scoreScale.ts';
import { Ladder } from './Ladder.tsx';
import { OfficialAlerts } from './OfficialAlerts.tsx';

const HOW_MANY = 10;
const REFRESH_MS = 5 * 60 * 1000;

type Props = { provinces: ProvinceCollection | null };

export function SpotHint({ provinces }: Props) {
  const { t } = useStrings();
  // Official alerts in effect. null = not loaded (or the load failed): nothing is claimed then.
  const [alerts, setAlerts] = useState<OfficialAlert[] | null>(null);

  // Load the alerts now, then again every few minutes.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await fetchAlerts();
        if (!cancelled) setAlerts(result);
      } catch {
        if (!cancelled) setAlerts(null);
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Keep the provinces that have a score, highest first.
  const ranked = (provinces?.features ?? [])
    .map((feature) => feature.properties)
    .filter((province) => province.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, HOW_MANY);

  return (
    <aside className="panel">
      <div className="panel-head">
        <h2>{t.spot.title}</h2>
      </div>
      <div className="panel-body">
        <p>{t.spot.hint}</p>

        {alerts !== null && (
          <>
            <h3>{t.spot.alertsTitle}</h3>
            {alerts.length === 0 && <p className="muted">{t.spot.alertsNone}</p>}
            <OfficialAlerts alerts={alerts} compact />
          </>
        )}

        <h3>{t.spot.highest}</h3>
        {provinces !== null && ranked.length === 0 && <p className="muted">{t.spot.noScores}</p>}
        <ol className="ranking">
          {ranked.map((province) => (
            <li key={province.psgc}>
              <span className="ranking-name">{province.name}</span>
              <Ladder score={province.score} />
              <span className="ranking-band muted">{bandLabel(bandFor(province.score ?? 0))}</span>
              <strong className="ranking-score">{scoreText(province.score, province.incomplete)}</strong>
            </li>
          ))}
        </ol>
      </div>
    </aside>
  );
}
