// The Phase 2 part of the status card: 7-day outlook, nearby events, storms
// forecast to pass near, recent headlines and official bulletin links.
// A section with nothing to show is left out, except the bulletin links.

import { useEffect, useState } from 'react';
import type { BulletinLink, Conditions } from '@ph-monitor/shared';
import { fetchBulletins } from '../api.ts';
import { formatDay, formatKm, formatTime, formatValue, safeUrl } from '../format.ts';

// Props lists what the parent hands to this component. `{ conditions }` below
// pulls that one value out of the props object.
type Props = { conditions: Conditions };

export function ConditionsSections({ conditions }: Props) {
  const { outlook, nearbyEvents, stormsComing, news } = conditions;

  return (
    <>
      {outlook.length > 0 && (
        <>
          <h3>Next 7 days</h3>
          <div className="outlook">
            {outlook.map((day) => (
              <div className="outlook-day" key={day.day}>
                <strong>{formatDay(day.day)}</strong>
                <span>Rain {formatValue(day.rainMm, 'mm')}</span>
                <span>Gust {formatValue(day.gustKmh, 'km/h')}</span>
                {day.riverDischargeM3s !== null && <span>River {day.riverDischargeM3s} m³/s</span>}
              </div>
            ))}
          </div>
          <p className="muted">
            Modelled data, not measurements: Open-Meteo. River flow: GloFAS, via Open-Meteo.
          </p>
        </>
      )}

      {nearbyEvents.length > 0 && (
        <>
          <h3>Disaster events nearby</h3>
          <ul>
            {nearbyEvents.map((event) => (
              <li key={event.id}>
                {event.title}
                <br />
                <span className="muted">
                  {event.distanceKm === undefined ? '' : `${formatKm(event.distanceKm)} away, `}
                  {event.kind}
                  {event.alertLevel ? `, alert level ${event.alertLevel}` : ''},{' '}
                  {event.source === 'gdacs' ? 'GDACS' : 'NASA EONET'}, {formatTime(event.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {stormsComing.length > 0 && (
        <>
          <h3>Storms forecast to pass near</h3>
          <ul>
            {stormsComing.map((storm) => (
              <li key={storm.stormId}>
                <strong>{storm.name}</strong>: about {formatKm(storm.distanceKm)} away around{' '}
                {formatTime(storm.closestAt)}
              </li>
            ))}
          </ul>
          <p className="muted">The forecast centre is uncertain; the real path can be different.</p>
        </>
      )}

      {news.length > 0 && (
        <>
          <h3>Recent headlines</h3>
          <ul>
            {news.map((item) => (
              <li key={item.id}>
                {/* The link goes to the outlet's own page; we never copy article text. */}
                <a href={safeUrl(item.url) ?? undefined} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
                <br />
                <span className="muted">
                  {item.outlet}, {formatTime(item.publishedAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <Bulletins />
    </>
  );
}

/** Plain links to the official agency pages. Always shown. */
function Bulletins() {
  const [links, setLinks] = useState<BulletinLink[]>([]);

  useEffect(() => {
    // Load once. If it fails the list just stays empty and the note below still shows.
    void fetchBulletins()
      .then(setLinks)
      .catch(() => undefined);
  }, []);

  return (
    <>
      <h3>Official bulletins</h3>
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            <a href={safeUrl(link.url) ?? undefined} target="_blank" rel="noopener noreferrer">
              {link.agency}: {link.label}
            </a>
          </li>
        ))}
      </ul>
      {links.length === 0 && <p className="muted">Official pages: pagasa.dost.gov.ph and phivolcs.dost.gov.ph.</p>}
    </>
  );
}
