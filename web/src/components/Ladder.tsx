// The score ladder: five rising steps, one per score band. The steps up to
// the score's own band are filled with their colours; the rest stay empty.
// It is a picture only (the score and band name are always written beside it).

import { bandColors, bandFor, SCORE_BANDS } from '../scoreScale.ts';
import { useTheme } from '../theme/index.ts';
import type { Theme } from '../theme/index.ts';

// `score` may be null for "no score yet": every step then stays empty.
// `theme` (optional, the `?`) forces one colour set; normally the page's own is used.
type Props = { score: number | null; theme?: Theme };

export function Ladder({ score, theme }: Props) {
  const pageTheme = useTheme().theme;
  const colorsFrom = theme ?? pageTheme;
  const reached = score === null ? -1 : SCORE_BANDS.indexOf(bandFor(score));
  return (
    // aria-hidden: screen readers skip it and read the number instead.
    <span className="ladder" aria-hidden="true">
      {SCORE_BANDS.map((band, index) => (
        <span
          key={band.id}
          className="ladder-step"
          style={index <= reached ? { background: bandColors(band, colorsFrom).color } : undefined}
        />
      ))}
    </span>
  );
}
