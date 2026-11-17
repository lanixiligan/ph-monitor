// The status card: everything we know about the spot the reader picked.
// Order: the place, official alerts, storms and serious events, the score
// with its reasons, official links, then the details (each starts closed).

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { EarthquakeEvent, PointDetail, WeatherEvent } from '@ph-monitor/shared';
import { fetchPointDetail } from '../api.ts';
import type { Spot } from '../api.ts';
import { formatTime, formatValue } from '../format.ts';
import { reasonText } from '../reasonText.ts';
import { fill, useStrings } from '../i18n/index.ts';
import { bandColors, bandFor, bandLabel, scoreText } from '../scoreScale.ts';
import { useTheme } from '../theme/index.ts';
import { WarnIcon } from './WarnIcon.tsx';
import { Bulletins, ConditionsSections, NearHere } from './Conditions.tsx';
import { Fold } from './Fold.tsx';
import { OfficialAlerts } from './OfficialAlerts.tsx';
import { Disclaimer } from './Disclaimer.tsx';
import { Ladder } from './Ladder.tsx';

// How often an open card asks the server again.
const REFRESH_MS = 5 * 60 * 1000;

type Props = {
  spot: Spot;
  onClose: () => void;
};

export function StatusCard({ spot, onClose }: Props) {
  // `t` holds all the words in the current language.
  const { t } = useStrings();
  const { theme } = useTheme();
  const [detail, setDetail] = useState<PointDetail | null>(null);
  // true when the last load failed (the message itself is looked up when drawn).
  const [failed, setFailed] = useState(false);
  // The card's title, so the keyboard and screen readers can be moved to it.
  const titleRef = useRef<HTMLHeadingElement>(null);
  // true from the moment a new spot is picked until its card has been announced.
  const announceRef = useRef(false);

  // When a new spot's details arrive, move the keyboard focus to the card's
  // title: a screen reader then reads the place name, and Tab continues into
  // the card. Not while the reader is steering the map with the keyboard, and
  // without scrolling the page.
  useEffect(() => {
    if (!detail || !announceRef.current) return;
    announceRef.current = false;
    if (document.activeElement?.closest('.map')) return;
    titleRef.current?.focus({ preventScroll: true });
  }, [detail]);

  // Load the details when a spot is chosen, then refresh now and then.
  useEffect(() => {
    // If the reader clicks another spot before this answer arrives,
    // `cancelled` stops the late answer from overwriting the newer one.
    let cancelled = false;
    setDetail(null);
    setFailed(false);
    announceRef.current = true;

    async function load() {
      try {
        const result = await fetchPointDetail(spot);
        if (!cancelled) {
          setDetail(result);
          // Clear any earlier error, so one failed refresh doesn't stick.
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [spot.lat, spot.lon]);

  if (failed) {
    return (
      <aside className="panel card">
        <CardHead title={t.card.thisSpot} onClose={onClose} titleRef={titleRef} />
        <div className="panel-body">
          <p className="notice">
            <WarnIcon /> {t.card.loadError}
          </p>
        </div>
      </aside>
    );
  }
  if (!detail) {
    return (
      <aside className="panel card">
        <CardHead title={t.card.loading} onClose={onClose} titleRef={titleRef} />
      </aside>
    );
  }

  const { place, province, provinceScore, score, events, freshness } = detail;
  const band = bandFor(score.score);
  // Some signal could not be checked: the score is a lower limit.
  const incomplete = score.unknownSignals.length > 0;
  // One row per hazard. `value` is null when that hazard could not be checked.
  const unknown = (name: 'quake' | 'weather' | 'event') => score.unknownSignals.includes(name);
  const hazardRows: { label: string; value: number | null }[] = [
    { label: t.hazards.quake, value: unknown('quake') ? null : score.hazards.quake },
    { label: t.hazards.rain, value: score.hazards.rain },
    { label: t.hazards.heat, value: score.hazards.heat },
    { label: t.hazards.event, value: unknown('event') ? null : score.hazards.event },
  ];
  const colors = bandColors(band, theme);

  // Split the events by kind. The `(e): e is ...` part tells TypeScript what
  // the filter keeps, so `quakes` is known to hold only earthquakes.
  const quakes = events.filter((e): e is EarthquakeEvent => e.kind === 'earthquake');
  const weather = events.find((e): e is WeatherEvent => e.kind === 'weather');

  return (
    <aside className="panel card">
      {/* The city or municipality if we know it, otherwise the province. */}
      <CardHead title={place?.name ?? province.name} onClose={onClose} titleRef={titleRef} />
      <div className="panel-body">
      <p className="muted card-where">
        {place ? `${province.name} · ` : ''}
        {detail.lat.toFixed(4)}, {detail.lon.toFixed(4)}
      </p>

      {/* Shown at the top so it can't be missed. */}
      {freshness.isStale && (
        <p>
          <span className="stale">
            <WarnIcon /> {t.card.stale}
          </span> {t.card.staleText}
        </p>
      )}

      {/* Official alerts first, then storms and events, then the score: a low
          number must never hide any of them. */}
      {detail.conditions.officialAlerts.length > 0 && (
        <div className="near-here">
          <h3>{t.alerts.title}</h3>
          <OfficialAlerts alerts={detail.conditions.officialAlerts} />
        </div>
      )}
      <NearHere conditions={detail.conditions} />

      <div className="score-row">
        {/* The number sits on its band's colour; `ink` is the text colour that reads on it. */}
        <span className="score-number" style={{ background: colors.color, color: colors.ink }}>
          {score.score}
        </span>
        <span>
          <strong>
            {incomplete
              ? scoreText(score.score, true)
              : fill(t.card.bandAtSpot, { band: bandLabel(band) })}
          </strong>{' '}
          <Ladder score={score.score} />
        </span>
      </div>

      {/* The same formulas hazard by hazard, so heat is never read as an earthquake. */}
      <table className="hazards" aria-label={t.card.hazardsTitle}>
        <tbody>
          {hazardRows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>
                {row.value === null ? t.hazards.unknown : bandLabel(bandFor(row.value))}
              </td>
              <td className="hazard-number">{row.value ?? '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{t.card.notCovered}</p>
      {incomplete && (
        <p className="notice">
          <WarnIcon /> {t.card.incomplete}
        </p>
      )}
      {provinceScore !== null && (
        <p className="muted">
          {fill(t.card.wholeProvince, {
            province: province.name,
            score: provinceScore,
            band: bandLabel(bandFor(provinceScore)).toLowerCase(),
          })}
        </p>
      )}

      <h3>{t.card.why}</h3>
      <ul>
        {/* `index` is the reason's place in the list; the list never reorders. */}
        {score.reasons.map((reason, index) => (
          <li key={index}>{reasonText(reason)}</li>
        ))}
      </ul>

      {/* Links to the official pages, straight after the score and its reasons. */}
      <Bulletins />

      {/* Everything else starts closed; each title opens its section. */}
      <Fold title={t.card.quakesTitle} count={quakes.length}>
      {quakes.length === 0 ? (
        <p className="muted">{t.card.quakesNone}</p>
      ) : (
        <ul>
          {quakes.map((quake) => (
            <li key={quake.id}>
              <strong>M{quake.magnitude.toFixed(1)}</strong>
              {quake.place ? `, ${quake.place}` : ''}
              <br />
              <span className="muted">
                {quake.distanceKm < 1
                  ? t.card.lessThanOneKmAway
                  : fill(t.card.kmAway, { km: Math.round(quake.distanceKm) })}
                {quake.depthKm === null
                  ? ''
                  : `, ${fill(t.card.kmDeep, { km: Math.round(quake.depthKm) })}`}
                ,{' '}
                {formatTime(quake.occurredAt)}
                {quake.url && (
                  <>
                    {' · '}
                    <a href={quake.url} target="_blank" rel="noreferrer">
                      {t.card.usgsPage}
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      </Fold>

      <Fold title={t.card.weatherTitle} tag={t.tiers.model}>
      {weather ? (
        <>
          <table>
            <tbody>
              <tr>
                <td>{t.card.temperature}</td>
                <td>{formatValue(weather.tempC, '°C')}</td>
              </tr>
              <tr>
                <td>{t.card.humidity}</td>
                <td>{formatValue(weather.humidityPct, '%')}</td>
              </tr>
              <tr>
                <td>{t.card.heatIndex}</td>
                <td>{formatValue(weather.heatIndexC, '°C')}</td>
              </tr>
              <tr>
                <td>{t.card.rain1h}</td>
                <td>{formatValue(weather.rain1hMm, 'mm')}</td>
              </tr>
              <tr>
                <td>{t.card.rain24h}</td>
                <td>{formatValue(weather.rain24hMm, 'mm')}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted">
            {fill(t.card.weatherNote, { time: formatTime(weather.validAt) })}
          </p>
        </>
      ) : (
        <p className="muted">{t.card.weatherNone}</p>
      )}
      </Fold>

      <ConditionsSections conditions={detail.conditions} />

      <Fold title={t.card.updatedTitle}>
      <table>
        <tbody>
          <tr>
            <td>{t.card.scoreComputed}</td>
            <td>{formatTime(score.computedAt)}</td>
          </tr>
          <tr>
            <td>{t.card.quakesChecked}</td>
            <td>{formatTime(freshness.earthquakesFetchedAt)}</td>
          </tr>
          <tr>
            <td>{t.card.weatherChecked}</td>
            <td>{formatTime(freshness.weatherFetchedAt)}</td>
          </tr>
        </tbody>
      </table>
      </Fold>

      <p className="muted">
        <Disclaimer />
      </p>
      </div>
    </aside>
  );
}

/** The top line of the card: a title and a close button. */
// `RefObject<...>` is the type of a ref: a box holding the element once it is drawn.
type CardHeadProps = { title: string; onClose: () => void; titleRef: RefObject<HTMLHeadingElement | null> };

function CardHead({ title, onClose, titleRef }: CardHeadProps) {
  const { t } = useStrings();
  return (
    <div className="panel-head">
      {/* tabIndex -1: the title can be given the focus by code, but Tab skips it. */}
      <h2 ref={titleRef} tabIndex={-1}>
        {title}
      </h2>
      <button className="filter" onClick={onClose} aria-label={t.card.close}>
        {t.card.close}
      </button>
    </div>
  );
}
