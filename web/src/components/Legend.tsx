// The map legend: which colour means which score.

import { NO_DATA_COLOR, SCORE_BANDS } from '../scoreScale.ts';

export function Legend() {
  return (
    <div className="legend">
      <div className="legend-title">Stress score (0–100)</div>
      <ul>
        {SCORE_BANDS.map((band) => (
          <li key={band.label}>
            <span className="swatch" style={{ background: band.color }} />
            {band.label}
            <span className="muted">
              {band.from}–{band.to}
            </span>
          </li>
        ))}
        <li>
          <span className="swatch" style={{ background: NO_DATA_COLOR }} />
          No score yet
        </li>
      </ul>
    </div>
  );
}
