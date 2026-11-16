// The map legend: which colour means which score, and what the marks for
// disaster events and storms mean. Each part has a tick box that shows or
// hides it on the map.

import { useStrings } from '../i18n/index.ts';
import type { MapLayers } from '../mapSettings.ts';
import { bandColors, bandLabel, SCORE_BANDS } from '../scoreScale.ts';
import { useTheme } from '../theme/index.ts';

type Props = {
  layers: MapLayers;
  // Called with the new settings when a tick box changes.
  onChange: (layers: MapLayers) => void;
};

export function Legend({ layers, onChange }: Props) {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  const { theme } = useTheme();
  // `keyof MapLayers` means "one of the names in MapLayers": scores, events, storms or news.
  const toggle = (name: keyof MapLayers) => onChange({ ...layers, [name]: !layers[name] });

  return (
    <div className="legend" role="group" aria-label={t.legend.showLabel}>
      <label className="legend-row">
        <input type="checkbox" checked={layers.scores} onChange={() => toggle('scores')} />
        <strong>{t.legend.title}</strong>
      </label>
      <ul className="scale">
        {SCORE_BANDS.map((band) => (
          <li key={band.id}>
            <span className="scale-color" style={{ background: bandColors(band, theme).color }} />
            {bandLabel(band)}
            <span className="muted">
              {band.from}–{band.to}
            </span>
          </li>
        ))}
      </ul>
      <div className="legend-row legend-indent">
        <span className="swatch swatch-nodata" />
        {t.legend.noScore}
      </div>

      <label className="legend-row">
        <input type="checkbox" checked={layers.events} onChange={() => toggle('events')} />
        <span className="mark mark-event" />
        {t.legend.event}
      </label>

      <label className="legend-row">
        <input type="checkbox" checked={layers.storms} onChange={() => toggle('storms')} />
        <span className="mark mark-storm" />
        {t.legend.stormPast}
      </label>
      <div className="legend-row legend-indent">
        <span className="mark mark-forecast" />
        {t.legend.stormForecast}
      </div>

      <label className="legend-row">
        <input type="checkbox" checked={layers.news} onChange={() => toggle('news')} />
        <span className="mark mark-news" />
        {t.legend.news}
      </label>
    </div>
  );
}
