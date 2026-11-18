// The map legend: which colour means which score, and what the marks for
// disaster events, storms and the fixed hazard maps mean. Each part has a
// tick box that shows or hides it on the map. Its title is a button that
// folds the legend away.

import { useState } from 'react';
import type { HazardLayerInfo, HazardMapKind } from '@ph-monitor/shared';
import { newsTypeLabel } from '../format.ts';
import { hasMapLayer } from '../hazardLabels.ts';
import { useStrings } from '../i18n/index.ts';
import { HAZARD_MIN_ZOOM } from '../mapSettings.ts';
import type { MapLayers } from '../mapSettings.ts';
import { bandColors, bandLabel, SCORE_BANDS } from '../scoreScale.ts';
import { useTheme } from '../theme/index.ts';

type Props = {
  layers: MapLayers;
  /** The headline filter ('all', a kind of disaster, or 'general'), named next to the headlines mark. */
  newsType: string;
  // Called with the new settings when a tick box changes.
  onChange: (layers: MapLayers) => void;
  /** The fixed hazard maps the server has loaded; a kind not in it gets no tick box. */
  hazards: HazardLayerInfo[] | null;
  /** The map's zoom level now; below a map's HAZARD_MIN_ZOOM its zones are not drawn. */
  zoom: number;
};

// The class names used in the swatches' CSS (styles.css): `surge-1` … `landslide-3`.
// `Record<HazardMapKind, string>` = an object with one text for each kind of map.
const SWATCH_PREFIX: Record<HazardMapKind, string> = { stormSurge: 'surge', landslide: 'landslide' };

export function Legend({ layers, onChange, newsType, hazards, zoom }: Props) {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  const { theme } = useTheme();
  // `keyof MapLayers` means "one of the names in MapLayers": scores, events, storms, news, …
  const toggle = (name: keyof MapLayers) => onChange({ ...layers, [name]: !layers[name] });
  // false when the reader has folded the legend away (the tick boxes keep their settings).
  const [open, setOpen] = useState(true);

  // The hazard maps that can be shown, each with its tick box and title.
  // `as const` keeps the exact names ('stormSurge', …) instead of "any text".
  const hazardKinds = (['stormSurge', 'landslide'] as const).filter((kind) => hasMapLayer(hazards, kind));
  // A ticked hazard map that is not drawn at this zoom: the legend says to zoom in.
  const hiddenByZoom = hazardKinds.some((kind) => layers[kind] && zoom < HAZARD_MIN_ZOOM[kind]);

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

        {/* The fixed hazard maps: off at first, and only those the server has. */}
        {hazardKinds.map((kind) => (
          <div key={kind}>
            <label className="legend-row">
              <input type="checkbox" checked={layers[kind]} onChange={() => toggle(kind)} />
              {kind === 'stormSurge' ? t.legend.stormSurge : t.legend.landslide}
            </label>
            <ul className="hazard-scale">
              {([1, 2, 3] as const).map((hazardClass) => (
                <li key={hazardClass}>
                  <span className={`hazard-swatch ${SWATCH_PREFIX[kind]}-${hazardClass}`} />
                  {t.legend.hazardClasses[hazardClass]}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {hiddenByZoom && (
          <p className="legend-note" role="status">
            {t.legend.zoomIn}
          </p>
        )}
        {hazardKinds.length > 0 && <p className="legend-note muted">{t.legend.hazardNote}</p>}
      </div>
    </div>
  );
}
