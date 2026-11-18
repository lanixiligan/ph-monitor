// The "Hazard map" block on the status card: what the fixed Project NOAH maps
// say about the picked spot. Landslide on one line, then storm surge level by
// level. These are fixed scenario maps, not a forecast, and never change the score.

// `as Zones` renames the shared type, because this component has the same name.
import type { HazardZones as Zones } from '@ph-monitor/shared';
import { landslideText, surgeLines } from '../hazardLabels.ts';
import { useStrings } from '../i18n/index.ts';

type Props = {
  /** undefined only while the server is an older version that does not send it. */
  zones: Zones | undefined;
};

export function HazardZones({ zones }: Props) {
  const { t } = useStrings();
  if (!zones) return null;
  const h = t.hazardMap;
  const surge = surgeLines(zones, t);

  return (
    <div className="hazard-map">
      <h3>
        {h.title} <span className="tag">{t.tiers.hazardMap}</span>
      </h3>
      <table aria-label={h.title}>
        <tbody>
          <tr>
            <td>{h.landslide}</td>
            <td>{landslideText(zones, t)}</td>
          </tr>
          <tr>
            {/* No storm surge map here: unknown, so it says so instead of "not reached". */}
            <td colSpan={surge ? 2 : 1}>{h.stormSurge}</td>
            {!surge && <td>{h.noMap}</td>}
          </tr>
          {/* `?.` skips the rows when `surge` is null. */}
          {surge?.map((line) => (
            <tr key={line.label} className="hazard-sub">
              <td>{line.label}</td>
              <td>{line.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{h.note}</p>
    </div>
  );
}
