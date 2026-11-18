// USGS's own impact estimates for one earthquake (PAGER alert, strongest
// shaking, tsunami information), shown under its row in the status card.
// Only the ones USGS gave are shown; with none, nothing is drawn.
// These never change the score, and no level gets its own colour.

import type { ReactNode } from 'react';
import type { EarthquakeEvent } from '@ph-monitor/shared';
import { fill, useStrings } from '../i18n/index.ts';

type Props = { quake: EarthquakeEvent };

export function QuakeImpact({ quake }: Props) {
  const { t } = useStrings();
  const q = t.quakeImpact;
  // `ReactNode[]` is a list of things React can draw; one entry per line.
  const lines: ReactNode[] = [];

  if (quake.pagerAlert !== null) {
    lines.push(fill(q.pager, { level: q.levels[quake.pagerAlert] }));
  }
  if (quake.mmi !== null) {
    lines.push(fill(q.mmi, { mmi: quake.mmi.toFixed(1) }));
  }
  // Only a link USGS shows; it does not mean a tsunami happened or is coming.
  if (quake.tsunamiInfo) {
    lines.push(
      <>
        {q.tsunamiLead}{' '}
        <a href="https://www.phivolcs.dost.gov.ph/" target="_blank" rel="noreferrer">
          PHIVOLCS
        </a>
        {q.tsunamiEnd}
      </>,
    );
  }
  if (lines.length === 0) return null;

  return (
    <div className="quake-impact">
      {/* `index` is the line's place; the list is rebuilt the same way each time. */}
      {lines.map((line, index) => (
        <p key={index}>
          {/* The "Global assessment" tag once, in front of the first line. */}
          {index === 0 && (
            <>
              <span className="tag">{t.tiers.global}</span>{' '}
            </>
          )}
          {line}
        </p>
      ))}
    </div>
  );
}
