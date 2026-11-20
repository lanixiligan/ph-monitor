// The rain forecast panel, over the top-right corner of the map (where the
// heat map's panel goes in the Heat view). It shows in the Typhoon view while
// the rain forecast tick box is on: the period shown, play and pause, a
// slider through the next 7 days, and how fresh the forecast is. The colour
// key is in the legend. Display only: it never changes the score.

import type { RainForecastMap } from '@ph-monitor/shared';
import { formatForecastDay, formatPeriod, timeAgo } from '../format.ts';
import { fill, useStrings } from '../i18n/index.ts';
import { useNow } from '../useNow.ts';
import { WarnIcon } from './WarnIcon.tsx';

type Props = {
  /** The forecast; null while it is loading (or after a failed first load). */
  data: RainForecastMap | null;
  /** true when the last load failed. */
  failed: boolean;
  /** The frame shown (0 = the period that holds now). */
  index: number;
  onIndex: (index: number) => void;
  playing: boolean;
  onPlaying: (playing: boolean) => void;
};

/** How fresh the forecast is, or why there is none. Missing or old data: ink, the icon and words. */
function RainStatus({ data, failed }: { data: RainForecastMap | null; failed: boolean }) {
  const { t } = useStrings();
  // The time now, so "Updated 5 minutes ago" keeps counting.
  const now = useNow();
  return (
    <div className="rain-status">
      {data !== null && data.fetchedAt !== null && <p>{fill(t.rain.updated, { ago: timeAgo(data.fetchedAt, now, t) })}</p>}
      {/* Read out when it changes; the ticking "Updated" line above is left out on purpose. */}
      <div role="status">
        {failed && (
          <p className="notice rain-warn">
            <WarnIcon /> {t.rain.loadError}
          </p>
        )}
        {!failed && data === null && <p className="muted">{t.rain.loading}</p>}
        {data !== null && data.frames.length === 0 && (
          <p className="notice rain-warn">
            <WarnIcon /> {t.rain.noData}
          </p>
        )}
        {data !== null && data.frames.length > 0 && data.isStale && (
          <p className="notice rain-warn">
            <WarnIcon /> {t.rain.stale}
          </p>
        )}
      </div>
    </div>
  );
}

export function RainForecastPanel({ data, failed, index, onIndex, playing, onPlaying }: Props) {
  const { t } = useStrings();
  const frames = data?.frames ?? [];
  const frame = frames[index];
  const first = frames[0];
  const last = frames[frames.length - 1];
  const period = frame !== undefined && data !== null ? formatPeriod(frame.endsAt, data.stepHours) : null;

  return (
    <div className="rain-control">
      <section className="rain-panel" aria-labelledby="rain-title">
        <div className="rain-head">
          <h2 id="rain-title">{t.rain.panelTitle}</h2>
          <span className="tag">{t.tiers.model}</span>
        </div>

        {period !== null && (
          <>
            <p className="rain-time">{period}</p>
            <div className="rain-controls">
              <button
                type="button"
                className="filter"
                aria-pressed={playing}
                onClick={() => onPlaying(!playing)}
              >
                {playing ? t.rain.pause : t.rain.play}
              </button>
              <input
                type="range"
                min={0}
                max={frames.length - 1}
                step={1}
                value={index}
                aria-label={t.rain.slider}
                // Read out as the period, not as a bare number.
                aria-valuetext={period}
                onChange={(event) => {
                  onPlaying(false);
                  onIndex(Number(event.target.value));
                }}
              />
            </div>
            {first !== undefined && last !== undefined && (
              <p className="rain-ends muted">
                <span>{formatForecastDay(first.endsAt)}</span>
                <span>{formatForecastDay(last.endsAt)}</span>
              </p>
            )}
          </>
        )}

        <RainStatus data={data} failed={failed} />

        {/* The source's credit, next to its data (Open-Meteo asks for it here). */}
        <p className="rain-note muted">
          {t.heat.credit.ecmwf_ifs} <a href="https://open-meteo.com/">{t.heat.creditLink}</a>
        </p>
        {/* Hidden on a narrow screen (the legend says the same), so the panel covers less map. */}
        <p className="rain-note rain-about muted">{t.rain.about}</p>
      </section>
    </div>
  );
}
