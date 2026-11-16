// The map legend: which colour means which score, and what the marks for
// disaster events and storms mean.

import { useStrings } from '../i18n/index.ts';
import { bandLabel, NO_DATA_COLOR, SCORE_BANDS } from '../scoreScale.ts';

export function Legend() {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  return (
    <div className="legend">
      <div className="legend-title">{t.legend.title}</div>
      <ul>
        {SCORE_BANDS.map((band) => (
          <li key={band.id}>
            <span className="swatch" style={{ background: band.color }} />
            {bandLabel(band)}
            <span className="muted">
              {band.from}–{band.to}
            </span>
          </li>
        ))}
        <li>
          <span className="swatch" style={{ background: NO_DATA_COLOR }} />
          {t.legend.noScore}
        </li>
        <li>
          <span className="mark mark-event" />
          {t.legend.event}
        </li>
        <li>
          <span className="mark mark-storm" />
          {t.legend.stormPast}
        </li>
        <li>
          <span className="mark mark-forecast" />
          {t.legend.stormForecast}
        </li>
      </ul>
    </div>
  );
}
