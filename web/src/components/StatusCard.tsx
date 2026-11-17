// The status card: everything we know about the spot the reader clicked.
// Shows the score, why it is what it is, the raw events, and how fresh the data is.

import { useEffect, useState } from 'react';
import type { EarthquakeEvent, PointDetail, WeatherEvent } from '@ph-monitor/shared';
import { fetchPointDetail } from '../api.ts';
import type { Spot } from '../api.ts';
import { formatTime, formatValue } from '../format.ts';
import { reasonText } from '../reasonText.ts';
import { fill, useStrings } from '../i18n/index.ts';
import { bandColors, bandFor, bandLabel, scoreText } from '../scoreScale.ts';
import { useTheme } from '../theme/index.ts';
import { WarnIcon } from './WarnIcon.tsx';
import { ConditionsSections, NearHere } from './Conditions.tsx';
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

  // Load the details when a spot is chosen, then refresh now and then.
  useEffect(() => {
    // If the reader clicks another spot before this answer arrives,
    // `cancelled` stops the late answer from overwriting the newer one.
    let cancelled = false;
    setDetail(null);
    setFailed(false);

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
        <CardHead title={t.card.thisSpot} onClose={onClose} />
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
        <CardHead title={t.card.loading} onClose={onClose} />
      </aside>
    );
  }

  const { place, province, provinceScore, score, events, freshness } = detail;
  const band = bandFor(score.score);
  // Some signal could not be checked: the score is a lower limit.
  const incomplete = score.unknownSignals.length > 0;
  // A part of the score, or the word "unknown" when it could not be checked.
  const part = (name: 'quake' | 'weather' | 'event', value: number) =>
    score.unknownSignals.includes(name) ? t.card.partUnknown : value;
  const colors = bandColors(band, theme);

  // Split the events by kind. The `(e): e is ...` part tells TypeScript what
  // the filter keeps, so `quakes` is known to hold only earthquakes.
  const quakes = events.filter((e): e is EarthquakeEvent => e.kind === 'earthquake');
  const weather = events.find((e): e is WeatherEvent => e.kind === 'weather');

  return (
    <aside className="panel card">
      {/* The city or municipality if we know it, otherwise the province. */}
      <CardHead title={place?.name ?? province.name} onClose={onClose} />
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

      {/* Storms and events come before the score, so a low number never hides them. */}
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
          <br />
          <span className="muted">
            {fill(t.card.parts, {
              quake: part('quake', score.quakeScore),
              weather: part('weather', score.weatherScore),
              event: part('event', score.eventScore),
            })}
          </span>
        </span>
      </div>
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

      <h3>{t.card.quakesTitle}</h3>
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

      <h3>{t.card.weatherTitle}</h3>
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

      <ConditionsSections conditions={detail.conditions} />

      <h3>{t.card.updatedTitle}</h3>
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

      <p className="muted">
        <Disclaimer />
      </p>
      </div>
    </aside>
  );
}

/** The top line of the card: a title and a close button. */
function CardHead({ title, onClose }: { title: string; onClose: () => void }) {
  const { t } = useStrings();
  return (
    <div className="panel-head">
      <h2>{title}</h2>
      <button className="filter" onClick={onClose} aria-label={t.card.close}>
        {t.card.close}
      </button>
    </div>
  );
}
