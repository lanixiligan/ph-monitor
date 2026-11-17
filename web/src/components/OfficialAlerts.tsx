// Official alerts (PAGASA) for the picked spot. Shown first on the status
// card, in the agency's own words, and never mixed into the score.

import type { OfficialAlert } from '@ph-monitor/shared';
import { alertTitleLines } from '../cardOrder.ts';
import { formatTime, safeUrl } from '../format.ts';
import { fill, useStrings } from '../i18n/index.ts';

// `compact` (optional, the `?`) leaves out the full text: used in the list
// of all alerts before a spot is picked.
type Props = { alerts: OfficialAlert[]; compact?: boolean };

export function OfficialAlerts({ alerts, compact }: Props) {
  const { t } = useStrings();
  const a = t.alerts;
  if (alerts.length === 0) return null;

  return (
    <ul className="plain-list alerts">
      {alerts.map((alert) => {
        // One line when the headline and the event name only repeat each
        // other (the fuller one is kept); two when they really differ.
        const [title, second] = alertTitleLines(alert.headline, alert.event);
        return (
        <li key={alert.id} className="alert">
          <span className="tag tag-live">{fill(t.tiers.official, { agency: alert.agency })}</span>{' '}
          <strong>{title}</strong>
          {second !== undefined && <div>{second}</div>}
          <div className="muted">
            {alert.isNationwide ? a.nationwide : alert.areaNames.join(', ')}
            <br />
            {fill(a.times, { sent: formatTime(alert.sentAt), expires: formatTime(alert.expiresAt) })}
          </div>
          {!compact && (
            // <details> is a built-in "click to open" block; <summary> is its label.
            <details>
              <summary>{fill(a.fullText, { agency: alert.agency })}</summary>
              {/* The agency's own wording, line breaks kept (see .alert-text in styles.css). */}
              <p className="alert-text">{alert.description}</p>
              {alert.instruction && <p className="alert-text">{alert.instruction}</p>}
            </details>
          )}
          <div>
            <a href={safeUrl(alert.url) ?? undefined} target="_blank" rel="noopener noreferrer">
              {fill(a.file, { agency: alert.agency })}
            </a>
            {alert.web && (
              <>
                {' · '}
                <a href={safeUrl(alert.web) ?? undefined} target="_blank" rel="noopener noreferrer">
                  {a.about}
                </a>
              </>
            )}
          </div>
        </li>
        );
      })}
    </ul>
  );
}
