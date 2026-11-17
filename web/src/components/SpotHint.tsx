// What the spot panel shows before the reader has clicked the map: how to
// pick a spot, and the provinces with the highest scores right now.

import type { ProvinceCollection } from '../api.ts';
import { useStrings } from '../i18n/index.ts';
import { bandFor, bandLabel, scoreText } from '../scoreScale.ts';
import { Ladder } from './Ladder.tsx';

const HOW_MANY = 10;

type Props = { provinces: ProvinceCollection | null };

export function SpotHint({ provinces }: Props) {
  const { t } = useStrings();

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
