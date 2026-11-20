// The map legend: which colour means what, and what the marks for disaster
// events, storms and the fixed hazard maps mean. Each part has a tick box that
// shows or hides it on the map. Its title is a button that folds the legend away.
// It follows the pressed map view: the top shows that view's scale (Overall:
// the score; Heat: the heat bands; Earthquake: the earthquake part of the
// score, in the score's colours), then the view's own layers. On a hazard
// view the other layers move under a folded "Other layers" heading; they keep
// their tick boxes. On Overall every layer is listed, as before.

import { Fragment, useState } from 'react';
import type { HazardLayerInfo, HazardMapKind, HeatViewId, MapViewId, QuakeMap } from '@ph-monitor/shared';
import { newsTypeLabel } from '../format.ts';
import { hasMapLayer } from '../hazardLabels.ts';
import { fill, useStrings } from '../i18n/index.ts';
import { HAZARD_MIN_ZOOM } from '../mapSettings.ts';
import type { MapLayers } from '../mapSettings.ts';
import { bandColors, bandLabel, SCORE_BANDS } from '../scoreScale.ts';
import { useTheme } from '../theme/index.ts';
import { mapViewById } from '../viewLayers.ts';
import { HeatLegend } from './HeatLegend.tsx';
import { WarnIcon } from './WarnIcon.tsx';

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
  /** The pressed map view. */
  view: MapViewId;
  /** The heat map's chosen source, named in the heat key while Heat is pressed. */
  heatModel: HeatViewId;
  /** The quakes behind the quake markers; null = not loaded yet. */
  quakes: QuakeMap | null;
  /** true when the last quake list load failed. */
  quakesFailed: boolean;
};

// The class names used in the swatches' CSS (styles.css): `surge-1` … `landslide-3`.
// `Record<HazardMapKind, string>` = an object with one text for each kind of map.
const SWATCH_PREFIX: Record<HazardMapKind, string> = { stormSurge: 'surge', landslide: 'landslide' };

// `Exclude<A, B>` = the names in A without B: every layer but the score colours,
// which belong to Overall's scale at the top.
type MarkLayer = Exclude<keyof MapLayers, 'scores'>;

export function Legend({ layers, onChange, newsType, hazards, zoom, view, heatModel, quakes, quakesFailed }: Props) {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  const { theme } = useTheme();
  // `keyof MapLayers` means "one of the names in MapLayers": scores, events, storms, news, …
  const toggle = (name: keyof MapLayers) => onChange({ ...layers, [name]: !layers[name] });
  // false when the reader has folded the legend away (the tick boxes keep their settings).
  const [open, setOpen] = useState(true);
  // true when the reader has opened "Other layers" (folded at first).
  const [otherOpen, setOtherOpen] = useState(false);

  // The hazard maps that can be shown, each with its tick box and title.
  // `as const` keeps the exact names ('stormSurge', …) instead of "any text".
  const hazardKinds = (['stormSurge', 'landslide'] as const).filter((kind) => hasMapLayer(hazards, kind));

  // Every mark layer in today's order; the pressed view's own layers first, the rest under "Other layers".
  const allMarks: MarkLayer[] = ['events', 'storms', 'news', 'quakes', ...hazardKinds];
  const viewLayers = mapViewById(view)?.layers ?? [];
  const ownMarks = view === 'overall' ? allMarks : allMarks.filter((name) => viewLayers.includes(name));
  const otherMarks = view === 'overall' ? [] : allMarks.filter((name) => !viewLayers.includes(name));

  /** One mark layer's tick box and key. */
  function markRow(name: MarkLayer) {
    if (name === 'events') {
      return (
        <label key={name} className="legend-row">
          <input type="checkbox" checked={layers.events} onChange={() => toggle('events')} />
          <span className="mark mark-event" />
          {t.legend.event}
        </label>
      );
    }
    if (name === 'storms') {
      // A Fragment groups the two rows without adding a box around them.
      return (
        <Fragment key={name}>
          <label className="legend-row">
            <input type="checkbox" checked={layers.storms} onChange={() => toggle('storms')} />
            <span className="mark mark-storm" />
            {t.legend.stormPast}
          </label>
          <div className="legend-row legend-indent">
            <span className="mark mark-forecast" />
            {t.legend.stormForecast}
          </div>
        </Fragment>
      );
    }
    if (name === 'news') {
      return (
        <label key={name} className="legend-row">
          <input type="checkbox" checked={layers.news} onChange={() => toggle('news')} />
          <span className="mark mark-news" />
          {t.legend.news}
          {newsType !== 'all' && <span className="muted"> · {newsTypeLabel(newsType)}</span>}
        </label>
      );
    }
    if (name === 'quakes') {
      return (
        <Fragment key={name}>
          <label className="legend-row">
            <input type="checkbox" checked={layers.quakes} onChange={() => toggle('quakes')} />
            <span className="mark mark-quake" />
            {t.quakes.legend}
          </label>
          {/* On the Earthquake view the status sits under its scale instead, whatever this tick box says. */}
          {layers.quakes && view !== 'earthquake' && <QuakeStatus quakes={quakes} failed={quakesFailed} />}
        </Fragment>
      );
    }
    // A fixed hazard map (Project NOAH): off at first, and only those the server has.
    return (
      <div key={name}>
        <label className="legend-row">
          <input type="checkbox" checked={layers[name]} onChange={() => toggle(name)} />
          {name === 'stormSurge' ? t.legend.stormSurge : t.legend.landslide}
        </label>
        <ul className="hazard-scale">
          {([1, 2, 3] as const).map((hazardClass) => (
            <li key={hazardClass}>
              <span className={`hazard-swatch ${SWATCH_PREFIX[name]}-${hazardClass}`} />
              {t.legend.hazardClasses[hazardClass]}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  /** Some mark layers, with the hazard map notes after them when they include a hazard map. */
  function markRows(names: MarkLayer[]) {
    const kinds = hazardKinds.filter((kind) => names.includes(kind));
    // A ticked hazard map that is not drawn at this zoom: the legend says to zoom in.
    const hiddenByZoom = kinds.some((kind) => layers[kind] && zoom < HAZARD_MIN_ZOOM[kind]);
    return (
      <>
        {names.map(markRow)}
        {hiddenByZoom && (
          <p className="legend-note" role="status">
            {t.legend.zoomIn}
          </p>
        )}
        {kinds.length > 0 && <p className="legend-note muted">{t.legend.hazardNote}</p>}
      </>
    );
  }

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
        {view === 'overall' ? (
          <>
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
          </>
        ) : (
          <>
            {view === 'heat' && <HeatLegend model={heatModel} />}
            {view === 'earthquake' && (
              <>
                <QuakeScale />
                <QuakeStatus quakes={quakes} failed={quakesFailed} />
              </>
            )}
            <p className="legend-view-note muted">
              {view === 'earthquake' ? t.quakes.overallHidden : t.legend.scoresHidden}
            </p>
          </>
        )}

        {markRows(ownMarks)}

        {otherMarks.length > 0 && (
          <>
            <button
              type="button"
              className="legend-other"
              onClick={() => setOtherOpen(!otherOpen)}
              aria-expanded={otherOpen}
              aria-controls="legend-other"
            >
              {t.legend.otherLayers}
              <span aria-hidden="true">{otherOpen ? '▾' : '▸'}</span>
            </button>
            <div id="legend-other" hidden={!otherOpen}>
              {markRows(otherMarks)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** The Earthquake view's scale: the score's own colours, for the earthquake part only. */
function QuakeScale() {
  const { t } = useStrings();
  const { theme } = useTheme();
  return (
    <>
      <strong className="legend-row">{t.quakes.scaleTitle}</strong>
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
        {t.quakes.unknownStripes}
      </div>
    </>
  );
}

/**
 * Under the quake tick box: how many quakes are drawn, or why there may be
 * some missing. An empty list always gets words, never a calm-looking blank.
 */
function QuakeStatus({ quakes, failed }: { quakes: QuakeMap | null; failed: boolean }) {
  const { t } = useStrings();
  if (failed && quakes === null) {
    return (
      <p className="legend-note" role="status">
        <WarnIcon /> {t.quakes.loadError}
      </p>
    );
  }
  if (quakes === null) return <p className="legend-note muted">{t.quakes.loading}</p>;
  const hours = quakes.windowHours;
  return (
    <div role="status">
      {failed && (
        <p className="legend-note">
          <WarnIcon /> {t.quakes.loadError}
        </p>
      )}
      {quakes.isStale && (
        <p className="legend-note">
          <WarnIcon /> {t.quakes.stale}
        </p>
      )}
      <p className="legend-note muted">
        {quakes.quakes.length === 0
          ? fill(t.quakes.none, { hours })
          : fill(quakes.quakes.length === 1 ? t.quakes.countOne : t.quakes.count, {
              count: quakes.quakes.length,
              hours,
            })}
      </p>
    </div>
  );
}
