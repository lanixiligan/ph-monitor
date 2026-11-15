// The status card: everything we know about the spot the reader clicked.
// Shows the score, why it is what it is, the raw events, and how fresh the data is.

import { useEffect, useState } from 'react';
import type { EarthquakeEvent, PointDetail, WeatherEvent } from '@ph-monitor/shared';
import { fetchPointDetail } from '../api.ts';
import type { Spot } from '../api.ts';
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
  spot: Spot;
  onClose: () => void;
};

export function StatusCard({ spot, onClose }: Props) {
  const [detail, setDetail] = useState<PointDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the details when a spot is chosen, then refresh now and then.
  useEffect(() => {
    // If the reader clicks another spot before this answer arrives,
    // `cancelled` stops the late answer from overwriting the newer one.
    let cancelled = false;
    setDetail(null);
    setError(null);

    async function load() {
      try {
        const result = await fetchPointDetail(spot);
        if (!cancelled) setDetail(result);
      } catch {
        if (!cancelled) {
          setError('Could not load this spot. It may be off the coast, or the server is not running.');
        }
      }
    }
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [spot.lat, spot.lon]);

  if (error) {
    return (
      <aside className="card">
        <CardHead title="This spot" onClose={onClose} />
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

  const { place, province, provinceScore, score, events, freshness } = detail;
  const band = bandFor(score.score);

  // Split the events by kind. The `(e): e is ...` part tells TypeScript what
  // the filter keeps, so `quakes` is known to hold only earthquakes.
  const quakes = events.filter((e): e is EarthquakeEvent => e.kind === 'earthquake');
  const weather = events.find((e): e is WeatherEvent => e.kind === 'weather');

  return (
    <aside className="card">
      {/* The city or municipality if we know it, otherwise the province. */}
      <CardHead title={place?.name ?? province.name} onClose={onClose} />
      <p className="muted card-where">
        {place ? `${province.name} · ` : ''}
        {detail.lat.toFixed(4)}, {detail.lon.toFixed(4)}
      </p>

      {/* Shown at the top so it can't be missed. */}
      {freshness.isStale && (
        <p>
          <span className="stale">STALE</span> Some data is more than 1 hour old.
        </p>
      )}

      <div className="score-row">
        <span className="score-number">{score.score}</span>
        <span className="swatch" style={{ background: band.color }} />
        <span>
          <strong>{band.label}</strong> at this spot
          <br />
          <span className="muted">
            Earthquakes {score.quakeScore} · Weather {score.weatherScore}
          </span>
        </span>
      </div>
      {provinceScore !== null && (
        <p className="muted">
          Whole province ({province.name}): {provinceScore}, {bandFor(provinceScore).label.toLowerCase()}
        </p>
      )}

      <h3>Why</h3>
      <ul>
        {score.reasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>

      <h3>Earthquakes, last 3 days</h3>
      {quakes.length === 0 ? (
        <p className="muted">None within reach of this spot.</p>
      ) : (
        <ul>
          {quakes.map((quake) => (
            <li key={quake.id}>
              <strong>M{quake.magnitude.toFixed(1)}</strong>
              {quake.place ? `, ${quake.place}` : ''}
              <br />
              <span className="muted">
                {quake.distanceKm < 1 ? 'Less than 1 km away' : `${Math.round(quake.distanceKm)} km away`}
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
            Modelled for this spot (to the nearest 5 km), valid for {formatTime(weather.validAt)}.
            Not a station reading.
          </p>
        </>
      ) : (
        <p className="muted">No weather reading for this spot right now.</p>
      )}

      <h3>Last updated</h3>
      <table>
        <tbody>
          <tr>
            <td>Score computed</td>
            <td>{formatTime(score.computedAt)}</td>
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
