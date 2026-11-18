// The map legend: which colour means which score, and what the marks for
// disaster events and storms mean. Each part has a tick box that shows or
// hides it on the map. Its title is a button that folds the legend away.

import { useState } from 'react';
import { newsTypeLabel } from '../format.ts';
import { useStrings } from '../i18n/index.ts';
import type { MapLayers } from '../mapSettings.ts';
import { bandColors, bandLabel, SCORE_BANDS } from '../scoreScale.ts';
import { useTheme } from '../theme/index.ts';

type Props = {
  layers: MapLayers;
  /** The headline filter ('all', a kind of disaster, or 'general'), named next to the headlines mark. */
  newsType: string;
  // Called with the new settings when a tick box changes.
  onChange: (layers: MapLayers) => void;
};

export function Legend({ layers, onChange, newsType }: Props) {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  const { theme } = useTheme();
  // `keyof MapLayers` means "one of the names in MapLayers": scores, events, storms or news.
  const toggle = (name: keyof MapLayers) => onChange({ ...layers, [name]: !layers[name] });
  // false when the reader has folded the legend away (the tick boxes keep their settings).
  const [open, setOpen] = useState(true);

  return (
    <div className="legend" role="group" aria-label={t.legend.showLabel}>
      <button
        className="legend-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls="legend-body"
      >
        {t.legend.heading}
        <span aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>

      {/* `hidden` hides the part without removing it from the page. */}
      <div id="legend-body" hidden={!open}>
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
        <div className="legend-row legend-indent">
          <span className="swatch swatch-incomplete" />
          {t.legend.incomplete}
        </div>
        <p className="legend-note muted">{t.legend.towns}</p>

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
          {newsType !== 'all' && <span className="muted"> · {newsTypeLabel(newsType)}</span>}
        </label>
      </div>
    </div>
  );
}
