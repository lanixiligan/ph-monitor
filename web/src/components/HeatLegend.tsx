// The top of the legend while Heat is pressed: PAGASA's heat index bands, the
// chosen source and its tag (Official for PAGASA, else Model estimate). The only place the band key is
// shown. A display layer only: it never changes the score.

// `import type` brings in types only; they vanish when the code runs.
import type { HeatBandName, HeatViewId } from '@ph-monitor/shared';
import { capitalise } from '../format.ts';
import { heatTier } from '../heatColors.ts';
import { fill, useStrings } from '../i18n/index.ts';

// The band key, mildest first: PAGASA's ranges in °C (`to: null` = no top),
// and the swatch class in styles.css. The same limits as WEIGHTS.heat.bands
// in server/src/scoring/scoring.ts; change both together.
// `{ ... }[]` = a list of objects, each with these fields.
const KEY: { band: HeatBandName; from: number; to: number | null; swatch: string }[] = [
  { band: 'caution', from: 27, to: 32, swatch: 'heat-caution' },
  { band: 'extreme caution', from: 33, to: 41, swatch: 'heat-extreme-caution' },
  { band: 'danger', from: 42, to: 51, swatch: 'heat-danger' },
  { band: 'extreme danger', from: 52, to: null, swatch: 'heat-extreme-danger' },
];

export function HeatLegend({ model }: { model: HeatViewId }) {
  const { t } = useStrings();
  const source = model === 'average' ? t.heat.average : t.heat.models[model];
  return (
    <div className="legend-heat">
      <div className="legend-row">
        <strong>{t.heat.keyTitle}</strong>
        <span className="tag">{heatTier(model, t)}</span>
      </div>
      <p className="muted">{fill(t.legend.heatSource, { model: source })}</p>
      <ul className="heat-key">
        <li>
          <span className="swatch heat-below" />
          {t.heat.below}
        </li>
        {KEY.map((row) => (
          <li key={row.band}>
            <span className={`swatch ${row.swatch}`} />
            {capitalise(t.heatBands[row.band])}
            <span className="muted">
              {row.to === null
                ? fill(t.heat.rangeTop, { from: row.from })
                : fill(t.heat.range, { from: row.from, to: row.to })}
            </span>
          </li>
        ))}
        {/* Unknown is never calm: the same stripes as on the map. */}
        <li>
          <span className="swatch swatch-nodata" />
          {t.heat.noValue}
        </li>
      </ul>
    </div>
  );
}
