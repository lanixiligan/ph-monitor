// The heat map's button and panel, over the top-right corner of the map, under
// the zoom and locate buttons. The button turns the heat map on and opens the
// panel; the panel lists the sources (the reader can switch at any time), says
// how fresh the chosen one is, and shows the band key. Closing it turns the
// heat map off, and the score colours come back.
// A display layer only: it never changes the score.

import { useRef } from 'react';
import { DEFAULT_HEAT_MODEL, HEAT_MODELS } from '@ph-monitor/shared';
import type { HeatBandName, HeatMapData, HeatModelId } from '@ph-monitor/shared';
import { capitalise, timeAgo } from '../format.ts';
import { fill, useStrings } from '../i18n/index.ts';
import { useNow } from '../useNow.ts';
import { WarnIcon } from './WarnIcon.tsx';

type Props = {
  /** The chosen model; null = the heat map is off. */
  chosen: HeatModelId | null;
  /** The answer for the chosen model; null while it is loading. */
  data: HeatMapData | null;
  /** true when the last load failed. */
  failed: boolean;
  /** Called with a model to turn the heat map on or switch source, and with null to turn it off. */
  onChoose: (model: HeatModelId | null) => void;
};

// The band key, mildest first: PAGASA's ranges in °C (`to: null` = no top),
// and the swatch class in styles.css. The same limits as WEIGHTS.heat.bands
// in server/src/scoring/scoring.ts; change both together.
// `{ ... }[]` = a list of objects, each with these fields.
const KEY: { band: HeatBandName; from: number; to: number | null; swatch: string }[] = [
  { band: 'caution', from: 27, to: 32, swatch: 'heat-caution' },
  { band: 'extreme caution', from: 33, to: 41, swatch: 'heat-extreme-caution' },
  { band: 'danger', from: 42, to: 51, swatch: 'heat-danger' },
  { band: 'extreme danger', from: 52, to: null, swatch: 'heat-extreme-danger' },
];

/** How fresh the chosen source is. Its own part, so its ticking clock runs only while the panel is open. */
function HeatStatus({ data, failed }: { data: HeatMapData | null; failed: boolean }) {
  const { t } = useStrings();
  // The time now, so "Updated 5 minutes ago" keeps counting.
  const now = useNow();
  return (
    // Missing or old data: ink, the icon and words.
    <div className="heat-status">
      {data !== null && data.fetchedAt !== null && (
        <p>{fill(t.heat.updated, { ago: timeAgo(data.fetchedAt, now, t) })}</p>
      )}
      {/* Read out when it changes; the ticking "Updated" line above is left out on purpose. */}
      <div role="status">
        {failed && (
          <p className="notice heat-warn">
            <WarnIcon /> {t.heat.loadError}
          </p>
        )}
        {!failed && data === null && <p className="muted">{t.heat.loading}</p>}
        {data !== null && data.fetchedAt === null && (
          <p className="notice heat-warn">
            <WarnIcon /> {t.heat.noData}
          </p>
        )}
        {data !== null && data.fetchedAt !== null && data.isStale && (
          <p className="notice heat-warn">
            <WarnIcon /> {t.heat.stale}
          </p>
        )}
      </div>
    </div>
  );
}

export function HeatMapPanel({ chosen, data, failed, onChoose }: Props) {
  const { t } = useStrings();
  // The button, so the keyboard can go back to it when the panel closes.
  // `<HTMLButtonElement>` says what the ref will hold: a button.
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    onChoose(null);
    buttonRef.current?.focus();
  }

  return (
    <div className="heat-control">
      {/* A toggle: pressed while the heat map is on. */}
      <button
        ref={buttonRef}
        type="button"
        className="heat-button"
        aria-pressed={chosen !== null}
        onClick={() => (chosen === null ? onChoose(DEFAULT_HEAT_MODEL) : close())}
      >
        {t.heat.button}
      </button>

      {chosen !== null && (
        <section className="heat-panel" aria-labelledby="heat-title">
          <div className="heat-head">
            <h2 id="heat-title">{t.heat.title}</h2>
            <button type="button" className="filter" onClick={close} aria-label={t.heat.close}>
              {t.card.close}
            </button>
          </div>
          <span className="tag">{t.tiers.model}</span>

          <fieldset className="heat-sources">
            <legend>{t.heat.source}</legend>
            {HEAT_MODELS.map((model) => (
              <label key={model.id} className="heat-source">
                <input
                  type="radio"
                  name="heat-model"
                  checked={model.id === chosen}
                  onChange={() => onChoose(model.id)}
                />
                <span>{t.heat.models[model.id]}</span>
                <span className="muted">{fill(t.heat.km, { km: model.km })}</span>
              </label>
            ))}
          </fieldset>

          <HeatStatus data={data} failed={failed} />

          <h3>{t.heat.keyTitle}</h3>
          <ul className="heat-key">
            <li>
              <span className="swatch heat-below" />
              {t.heat.below}
            </li>
            {KEY.map((row) => (
              <li key={row.band}>
                <span className={`swatch ${row.swatch}`} />
                {capitalise(t.heatBands[row.band])}
                <span className="muted">
                  {row.to === null
                    ? fill(t.heat.rangeTop, { from: row.from })
                    : fill(t.heat.range, { from: row.from, to: row.to })}
                </span>
              </li>
            ))}
            <li>
              <span className="swatch swatch-nodata" />
              {t.heat.noValue}
            </li>
          </ul>

          {/* The source's credit, next to its data (DWD and Open-Meteo ask for it here). */}
          <p className="heat-note muted">
            {t.heat.credit[chosen]} <a href="https://open-meteo.com/">{t.heat.creditLink}</a>
          </p>
          <p className="heat-note muted">{t.heat.spacing}</p>
          <p className="heat-note muted">{t.heat.cardDiffers}</p>
        </section>
      )}
    </div>
  );
}
