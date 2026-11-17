// Shares the light/dark choice with every component, and re-draws them when it changes.

import { createContext, useContext, useEffect, useState } from 'react';
// `ReactNode` is the type of anything React can draw (text, elements, ...).
import type { ReactNode } from 'react';
import { getTheme, hasSavedTheme, setCurrentTheme, systemTheme } from './state.ts';
import type { Theme } from './state.ts';

type Value = { theme: Theme; setTheme: (theme: Theme) => void };

// The starting value is a fallback only; ThemeProvider supplies the real one.
const ThemeContext = createContext<Value>({ theme: getTheme(), setTheme: () => undefined });

/** Put this once around the whole app (see main.tsx). */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getTheme);

  // Until the reader picks one, follow the device when its setting changes
  // (for example a phone that turns dark at sunset).
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!query) return;
    const onChange = () => {
      if (hasSavedTheme()) return;
      const next = systemTheme();
      setCurrentTheme(next, false);
      setThemeState(next);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  function setTheme(next: Theme) {
    // Update the page first, so code outside React sees the new colours at once.
    setCurrentTheme(next, true);
    setThemeState(next);
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

/** A hook a component calls to get the current theme (and re-draw when it changes). */
export function useTheme(): Value {
  return useContext(ThemeContext);
}
