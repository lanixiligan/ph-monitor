// The heat map's panel, over the top-right corner of the map, under the zoom
// and locate buttons. It shows while Heat is pressed in the top bar's view
// switch. It lists the sources and their average (the reader can switch at
// any time) and says how fresh the chosen one is. The band key is in the
// legend (HeatLegend.tsx). Closing the panel goes back to Overall, and the
// score colours come back.
// A display layer only: it never changes the score.

import { HEAT_MODELS } from '@ph-monitor/shared';
import type { HeatMapData, HeatSourceId, HeatViewId } from '@ph-monitor/shared';
import { timeAgo } from '../format.ts';
import { heatTier } from '../heatColors.ts';
import { fill, useStrings } from '../i18n/index.ts';
import { useNow } from '../useNow.ts';
import { viewButtonId } from './ViewSwitch.tsx';
import { WarnIcon } from './WarnIcon.tsx';

type Props = {
  /** The chosen model, or 'average'. */
  chosen: HeatViewId;
  /** The answer for the chosen model; null while it is loading. */
  data: HeatMapData | null;
  /** true when the last load failed. */
  failed: boolean;
  /** Called with a view to switch source. */
  onChoose: (model: HeatViewId) => void;
  /** Called by the close button: back to Overall. */
  onClose: () => void;
};

/** The models whose data the chosen view shows: one, or all of them for the average. */
function creditsFor(view: HeatViewId): HeatSourceId[] {
  return view === 'average' ? HEAT_MODELS.map((model) => model.id) : [view];
}

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
        {data !== null && data.fetchedAt !== null && data.validAt === null && (
          <p className="notice heat-warn">
            <WarnIcon /> {t.heat.noHour}
          </p>
        )}
        {data !== null && data.fetchedAt !== null && data.isStale && (
          <p className="notice heat-warn">
            <WarnIcon /> {data.model === 'average' ? t.heat.staleSome : t.heat.stale}
          </p>
        )}
      </div>
    </div>
  );
}

export function HeatMapPanel({ chosen, data, failed, onChoose, onClose }: Props) {
  const { t } = useStrings();

  function close() {
    onClose();
    // The panel is gone now: the keyboard goes back to the Heat button in the top bar.
    document.getElementById(viewButtonId('heat'))?.focus();
  }

  return (
    <div className="heat-control">
      <section className="heat-panel" aria-labelledby="heat-title">
        <div className="heat-head">
          <h2 id="heat-title">{t.heat.title}</h2>
          <button type="button" className="filter" onClick={close} aria-label={t.heat.close}>
            {t.card.close}
          </button>
        </div>
        <span className="tag">
          {heatTier(chosen, t)}
        </span>

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
          <label className="heat-source">
            <input
              type="radio"
              name="heat-model"
              checked={chosen === 'pagasa'}
              onChange={() => onChoose('pagasa')}
            />
            <span>{t.heat.models.pagasa}</span>
            <span className="muted">{t.heat.pagasaNote}</span>
          </label>
          <label className="heat-source">
            <input
              type="radio"
              name="heat-model"
              checked={chosen === 'average'}
              onChange={() => onChoose('average')}
            />
            <span>{t.heat.average}</span>
            <span className="muted">{fill(t.heat.averageNote, { total: HEAT_MODELS.length })}</span>
          </label>
        </fieldset>

        <HeatStatus data={data} failed={failed} />

        {/* The source's credit, next to its data (DWD and Open-Meteo ask for it here). The average credits every model. */}
        {creditsFor(chosen).map((model) => (
          <p key={model} className="heat-note muted">
            {t.heat.credit[model]}
            {model === 'pagasa' ? (
              <>
                <a href="https://iheatmap.pagasa.dost.gov.ph/">iheatmap.pagasa.dost.gov.ph</a>
                {t.heat.creditPagasaEnd}
              </>
            ) : (
              <>
                {' '}
                <a href="https://open-meteo.com/">{t.heat.creditLink}</a>
              </>
            )}
          </p>
        ))}
        <p className="heat-note muted">{chosen === 'pagasa' ? t.heat.pagasaSpacing : t.heat.spacing}</p>
        <p className="heat-note muted">{t.heat.cardDiffers}</p>
      </section>
    </div>
  );
}
