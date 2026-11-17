// The Phase 2 part of the status card: 7-day outlook, nearby events, storms
// forecast to pass near, recent headlines and official bulletin links.
// A section with nothing to show is left out, except the bulletin links.

import { useEffect, useState } from 'react';
import type { BulletinLink, Conditions } from '@ph-monitor/shared';
import { fetchBulletins } from '../api.ts';
import {
  bulletinLabel,
  formatDay,
  formatKm,
  formatTime,
  formatValue,
  safeUrl,
} from '../format.ts';
import { fill, lookup, useStrings } from '../i18n/index.ts';

// Props lists what the parent hands to this component. `{ conditions }` below
// pulls that one value out of the props object.
type Props = { conditions: Conditions };

/**
 * Storms forecast to pass near, and disaster events nearby. Shown at the very
 * top of the card, above the score: a low score must never hide these.
 * Draws nothing when there are none.
 */
export function NearHere({ conditions }: Props) {
  const { t } = useStrings();
  const c = t.conditions;
  const { nearbyEvents, stormsComing } = conditions;
  if (nearbyEvents.length === 0 && stormsComing.length === 0) return null;

  return (
    <div className="near-here">
      <h3>{t.card.nearTitle}</h3>
      {stormsComing.length > 0 && (
        <>
          <h4>{c.stormsTitle}</h4>
          <ul>
            {stormsComing.map((storm) => (
              <li key={storm.stormId}>
                <strong>{storm.name}</strong>:{' '}
                {fill(c.stormLine, {
                  distance: formatKm(storm.distanceKm),
                  time: formatTime(storm.closestAt),
                })}
              </li>
            ))}
          </ul>
          <p className="muted">{c.stormNote}</p>
        </>
      )}

      {nearbyEvents.length > 0 && (
        <>
          <h4>{c.eventsTitle}</h4>
          <ul>
            {nearbyEvents.map((event) => (
              <li key={event.id}>
                {event.title}
                <br />
                <span className="muted">
                  {event.distanceKm === undefined
                    ? ''
                    : fill(c.eventAway, { distance: formatKm(event.distanceKm) })}
                  {lookup(t.kinds, event.kind)}
                  {event.alertLevel
                    ? fill(c.eventAlert, { level: lookup(t.alertLevels, event.alertLevel) })
                    : ''}
                  , {event.source === 'gdacs' ? 'GDACS' : 'NASA EONET'}, {formatTime(event.startedAt)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

    </div>
  );
}

export function ConditionsSections({ conditions }: Props) {
  const { t } = useStrings();
  const c = t.conditions;
  const { outlook, news } = conditions;

  return (
    <>
      {outlook.length > 0 && (
        <>
          <h3>{c.outlookTitle}</h3>
          <div className="outlook">
            {outlook.map((day) => (
              <div className="outlook-day" key={day.day}>
                <strong>{formatDay(day.day)}</strong>
                <span>{fill(c.rain, { value: formatValue(day.rainMm, 'mm') })}</span>
                <span>{fill(c.gust, { value: formatValue(day.gustKmh, 'km/h') })}</span>
                {day.riverDischargeM3s !== null && (
                  <span>{fill(c.river, { value: `${day.riverDischargeM3s} m³/s` })}</span>
                )}
              </div>
            ))}
          </div>
          <p className="muted">{c.outlookNote}</p>
        </>
      )}

      {news.length > 0 && (
        <>
          <h3>{c.newsTitle}</h3>
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
  const { t } = useStrings();
  const [links, setLinks] = useState<BulletinLink[]>([]);

  useEffect(() => {
    // Load once. If it fails the list just stays empty and the note below still shows.
    void fetchBulletins()
      .then(setLinks)
      .catch(() => undefined);
  }, []);

  return (
    <>
      <h3>{t.conditions.bulletinsTitle}</h3>
      <ul>
        {links.map((link) => (
          <li key={link.id}>
            <a href={safeUrl(link.url) ?? undefined} target="_blank" rel="noopener noreferrer">
              {link.agency}: {bulletinLabel(link.id, link.label)}
            </a>
          </li>
        ))}
      </ul>
      {links.length === 0 && <p className="muted">{t.conditions.bulletinsFallback}</p>}
    </>
  );
}
