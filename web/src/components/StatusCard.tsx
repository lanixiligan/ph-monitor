// The status card: everything we know about the selected province.
// Shows the score, why it is what it is, the raw events, and how fresh the data is.

import { useEffect, useState } from 'react';
import type { EarthquakeEvent, ProvinceDetail, WeatherEvent } from '@ph-monitor/shared';
import { fetchProvinceDetail } from '../api.ts';
import { bandFor } from '../scoreScale.ts';
import { Disclaimer } from './Disclaimer.tsx';

// How often an open card asks the server again.
const REFRESH_MS = 5 * 60 * 1000;

/** "2026-11-15T03:00:00Z" → "Nov 15, 2026, 11:00 AM" in the reader's own time zone. */
function formatTime(iso: string | null): string {
  if (iso === null) return 'never';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** A number with its unit, or a dash when the value is missing. */
function formatValue(value: number | null, unit: string): string {
  return value === null ? '–' : `${value} ${unit}`;
}

type Props = {
  psgc: number;
  onClose: () => void;
};

export function StatusCard({ psgc, onClose }: Props) {
  const [detail, setDetail] = useState<ProvinceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the details when a province is chosen, then refresh now and then.
  useEffect(() => {
    // If the reader clicks another province before this answer arrives,
    // `cancelled` stops the late answer from overwriting the newer one.
    let cancelled = false;
    setDetail(null);
    setError(null);

    async function load() {
      try {
        const result = await fetchProvinceDetail(psgc);
        if (!cancelled) setDetail(result);
      } catch {
        if (!cancelled) setError('Could not load this province. Is the server running?');
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [psgc]);

  if (error) {
    return (
      <aside className="card">
        <CardHead title="Province" onClose={onClose} />
        <p>{error}</p>
      </aside>
    );
  }
  if (!detail) {
    return (
      <aside className="card">
        <CardHead title="Loading…" onClose={onClose} />
      </aside>
    );
  }

  const { province, score, events, freshness } = detail;

  // Split the events by kind. The `(e): e is ...` part tells TypeScript what
  // the filter keeps, so `quakes` is known to hold only earthquakes.
  const quakes = events.filter((e): e is EarthquakeEvent => e.kind === 'earthquake');
  const weather = events.find((e): e is WeatherEvent => e.kind === 'weather');

  return (
    <aside className="card">
      <CardHead title={province.name} onClose={onClose} />

      {/* Shown at the top so it can't be missed. */}
      {freshness.isStale && (
        <p>
          <span className="stale">STALE</span> Some data is more than 1 hour old.
        </p>
      )}

      {score === null ? (
        <p>No score yet. It appears after the first data fetch.</p>
      ) : (
        <>
          <div className="score-row">
            <span className="score-number">{score.score}</span>
            <span className="swatch" style={{ background: bandFor(score.score).color }} />
            <span>
              <strong>{bandFor(score.score).label}</strong>
              <br />
              <span className="muted">
                Earthquakes {score.quakeScore} · Weather {score.weatherScore}
              </span>
            </span>
          </div>

          <h3>Why</h3>
          <ul>
            {score.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </>
      )}

      <h3>Earthquakes, last 3 days</h3>
      {quakes.length === 0 ? (
        <p className="muted">None within reach of this province.</p>
      ) : (
        <ul>
          {quakes.map((quake) => (
            <li key={quake.id}>
              <strong>M{quake.magnitude.toFixed(1)}</strong>
              {quake.place ? `, ${quake.place}` : ''}
              <br />
              <span className="muted">
                {quake.distanceKm < 1 ? 'Inside the province' : `${Math.round(quake.distanceKm)} km away`}
                {quake.depthKm === null ? '' : `, ${Math.round(quake.depthKm)} km deep`},{' '}
                {formatTime(quake.occurredAt)}
                {quake.url && (
                  <>
                    {' · '}
                    <a href={quake.url} target="_blank" rel="noreferrer">
                      USGS page
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3>Weather</h3>
      {weather ? (
        <>
          <table>
            <tbody>
              <tr>
                <td>Temperature</td>
                <td>{formatValue(weather.tempC, '°C')}</td>
              </tr>
              <tr>
                <td>Humidity</td>
                <td>{formatValue(weather.humidityPct, '%')}</td>
              </tr>
              <tr>
                <td>Heat index (feels like)</td>
                <td>{formatValue(weather.heatIndexC, '°C')}</td>
              </tr>
              <tr>
                <td>Rain, last hour</td>
                <td>{formatValue(weather.rain1hMm, 'mm')}</td>
              </tr>
              <tr>
                <td>Rain, last 24 hours</td>
                <td>{formatValue(weather.rain24hMm, 'mm')}</td>
              </tr>
            </tbody>
          </table>
          <p className="muted">
            Modelled for one point in the province, valid for {formatTime(weather.validAt)}. Not a
            station reading.
          </p>
        </>
      ) : (
        <p className="muted">No weather reading yet.</p>
      )}

      <h3>Last updated</h3>
      <table>
        <tbody>
          <tr>
            <td>Score computed</td>
            <td>{formatTime(score?.computedAt ?? null)}</td>
          </tr>
          <tr>
            <td>Earthquakes checked</td>
            <td>{formatTime(freshness.earthquakesFetchedAt)}</td>
          </tr>
          <tr>
            <td>Weather checked</td>
            <td>{formatTime(freshness.weatherFetchedAt)}</td>
          </tr>
        </tbody>
      </table>

      <p className="muted">
        <Disclaimer />
      </p>
    </aside>
  );
}

/** The top line of the card: a title and a close button. */
function CardHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="card-head">
      <h2>{title}</h2>
      <button className="card-close" onClick={onClose} aria-label="Close">
        Close
      </button>
    </div>
  );
}
