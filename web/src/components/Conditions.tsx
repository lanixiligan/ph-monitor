// The status card's sections beyond the score: storms and events near here
// (above the score), official bulletin links, and the sections that start
// closed: other events, the 7-day outlook and recent headlines.
// A section with nothing to show is left out, except the bulletin links.

import { useEffect, useState } from 'react';
import type { BulletinLink, Conditions, DisasterEvent } from '@ph-monitor/shared';
import { fetchBulletins } from '../api.ts';
import { isTopEvent } from '../cardOrder.ts';
import {
  bulletinLabel,
  formatDay,
  formatKm,
  formatTime,
  formatValue,
  safeUrl,
} from '../format.ts';
import { fill, lookup, useStrings } from '../i18n/index.ts';
import { Fold } from './Fold.tsx';

// Props lists what the parent hands to this component. `{ conditions }` below
// pulls that one value out of the props object.
type Props = { conditions: Conditions };

/** A list of disaster events: title, distance, kind, alert level, source and times. */
function EventList({ events }: { events: DisasterEvent[] }) {
  const { t } = useStrings();
  const c = t.conditions;
  return (
    <ul>
      {events.map((event) => (
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
            {event.endedAt !== null && fill(c.eventEnded, { time: formatTime(event.endedAt) })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Storms forecast to pass near, and the nearby disaster events that are still
 * going or are orange or red (see isTopEvent). Shown above the score: a low
 * score must never hide these. Draws nothing when there are none.
 */
export function NearHere({ conditions }: Props) {
  const { t } = useStrings();
  const c = t.conditions;
  const { stormsComing } = conditions;
  const topEvents = conditions.nearbyEvents.filter(isTopEvent);
  if (topEvents.length === 0 && stormsComing.length === 0) return null;

  return (
    <div className="near-here">
      <h3>
        {t.card.nearTitle} <span className="tag">{t.tiers.global}</span>
      </h3>
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

      {topEvents.length > 0 && (
        <>
          <h4>{c.eventsTitle}</h4>
          <EventList events={topEvents} />
        </>
      )}
    </div>
  );
}

/**
 * The sections that start closed: nearby events that did not make the top
 * block (finished, and green or with no level), the 7-day outlook and the
 * recent headlines.
 */
export function ConditionsSections({ conditions }: Props) {
  const { t } = useStrings();
  const c = t.conditions;
  const { outlook, news } = conditions;
  // `!isTopEvent(event)` = every event the top block left out.
  const otherEvents = conditions.nearbyEvents.filter((event) => !isTopEvent(event));

  return (
    <>
      {otherEvents.length > 0 && (
        <Fold title={c.otherEventsTitle} count={otherEvents.length} tag={t.tiers.global}>
          <EventList events={otherEvents} />
        </Fold>
      )}

      {outlook.length > 0 && (
        <Fold title={c.outlookTitle} tag={t.tiers.model}>
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
        </Fold>
      )}

      {news.length > 0 && (
        <Fold title={c.newsTitle} count={news.length}>
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
        </Fold>
      )}
    </>
  );
}

/** Plain links to the official agency pages. Always shown, right under the score's reasons. */
export function Bulletins() {
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
