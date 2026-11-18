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
  /** Hazard map stripes, one colour per class: [low, medium, high]. */
  surge: string[];
  landslide: string[];
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
    surge: [get('--hazard-surge-1'), get('--hazard-surge-2'), get('--hazard-surge-3')],
    landslide: [get('--hazard-landslide-1'), get('--hazard-landslide-2'), get('--hazard-landslide-3')],
  };
}

/** How a striped tile looks. */
export type Hatch = {
  color: string;
  /** Fills the tile under the lines. Left out = see-through. */
  background?: string; // `?` means the value may be left out
  /** Tile size in pixels: the gap from one line to the next. Smaller = denser. */
  spacing?: number;
  lineWidth?: number;
  /** 'rising' = /, 'falling' = \, 'flat' = horizontal lines. */
  direction?: 'rising' | 'falling' | 'flat';
};

/**
 * A small tile of lines that the map repeats over a shape. With the
 * no-data colour behind them, the lines mark provinces with no score yet, so
 * "we don't know" never looks like calm or like empty sea. Without a
 * background they are laid over a score colour (an incomplete score, or a
 * hazard zone). Returns null if the browser can't draw it.
 */
export function hatchImage(hatch: Hatch): ImageData | null {
  const size = hatch.spacing ?? 8;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) return null;
  if (hatch.background) {
    context.fillStyle = hatch.background;
    context.fillRect(0, 0, size, size);
  }
  context.strokeStyle = hatch.color;
  context.lineWidth = hatch.lineWidth ?? 1.5;
  context.beginPath();
  const direction = hatch.direction ?? 'rising';
  if (direction === 'flat') {
    context.moveTo(0, size / 2);
    context.lineTo(size, size / 2);
  } else if (direction === 'rising') {
    // One line corner to corner, plus two short ends, so tiles join seamlessly.
    context.moveTo(0, size);
    context.lineTo(size, 0);
    context.moveTo(-1, 1);
    context.lineTo(1, -1);
    context.moveTo(size - 1, size + 1);
    context.lineTo(size + 1, size - 1);
  } else {
    // The same, mirrored.
    context.moveTo(0, 0);
    context.lineTo(size, size);
    context.moveTo(-1, size - 1);
    context.lineTo(1, size + 1);
    context.moveTo(size - 1, -1);
    context.lineTo(size + 1, 1);
  }
  context.stroke();
  return context.getImageData(0, 0, size, size);
}
