// Light or dark colours, kept in one place so code outside React (the map)
// can read it too. The colours themselves are CSS variables in styles.css;
// this file only sets <html data-theme="light|dark">, which picks the set.

// A union type: the value must be exactly one of these two texts.
export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'ph-monitor-theme';

/** The reader's saved choice, or null if they never picked one (or storage is blocked). */
function readSaved(): Theme | null {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Blocked or unavailable: no saved choice.
  }
  return null;
}

/** What the device asks for (its own light/dark setting). */
export function systemTheme(): Theme {
  // `?.` stops here (giving undefined) if matchMedia doesn't exist.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let saved: Theme | null = readSaved();
let current: Theme = saved ?? systemTheme();
// Set it at once, before React draws anything, so the page never flashes the wrong colours.
document.documentElement.dataset.theme = current;

/**
 * Changes the colours. `remember` = the reader chose it, so keep it for
 * next time; otherwise (following the device) nothing is saved.
 */
export function setCurrentTheme(theme: Theme, remember: boolean): void {
  current = theme;
  document.documentElement.dataset.theme = theme;
  if (!remember) return;
  saved = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not saved; the page still works.
  }
}

export function getTheme(): Theme {
  return current;
}

/** true once the reader has picked a theme themselves. */
export function hasSavedTheme(): boolean {
  return saved !== null;
}
