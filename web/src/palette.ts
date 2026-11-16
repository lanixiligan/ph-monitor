// The page colours for code that can't use CSS (the map, which MapLibre draws
// on a canvas). They are read from the CSS variables at the top of
// styles.css, so there is only one place to change a colour, and the map
// follows the light/dark theme automatically.

export type Palette = {
  sea: string;
  paper: string;
  ink: string;
  inkSoft: string;
  news: string;
  noData: string;
};

/** Reads the colours of the theme now in use. Call it when you draw, not once at start-up. */
export function readPalette(): Palette {
  const style = getComputedStyle(document.documentElement);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    sea: get('--sea'),
    paper: get('--paper'),
    ink: get('--ink'),
    inkSoft: get('--ink-soft'),
    news: get('--news'),
    noData: get('--no-data'),
  };
}

/**
 * A small tile of diagonal lines for provinces with no score yet, so "we
 * don't know" never looks like calm or like empty sea. Returns null if the
 * browser can't draw it (the plain no-data colour is used then).
 */
export function hatchImage(palette: Palette): ImageData | null {
  const size = 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.fillStyle = palette.noData;
  context.fillRect(0, 0, size, size);
  context.strokeStyle = palette.inkSoft;
  context.lineWidth = 1.5;
  // One line corner to corner, plus two short ends, so tiles join seamlessly.
  context.beginPath();
  context.moveTo(0, size);
  context.lineTo(size, 0);
  context.moveTo(-1, 1);
  context.lineTo(1, -1);
  context.moveTo(size - 1, size + 1);
  context.lineTo(size + 1, size - 1);
  context.stroke();
  return context.getImageData(0, 0, size, size);
}
