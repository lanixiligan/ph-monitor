// Shares the chosen language with every component, and re-draws them when it changes.

import { createContext, useContext, useEffect, useState } from 'react';
// `ReactNode` is the type of anything React can draw (text, elements, ...).
import type { ReactNode } from 'react';
import { getI18n, getLanguage, setCurrentLanguage } from './state.ts';
import type { I18n, Language } from './state.ts';

type Value = I18n & { setLanguage: (language: Language) => void };

// A "context" lets a parent hand a value to any component below it without
// passing it through every level. The starting value is a fallback only.
const LanguageContext = createContext<Value>({ ...getI18n(), setLanguage: () => undefined });

/** Put this once around the whole app (see main.tsx). */
export function LanguageProvider({ children }: { children: ReactNode }) {
  // `useState` remembers the language between re-draws; changing it re-draws the page.
  const [language, setLanguageState] = useState<Language>(getLanguage);

  // Set <html lang="..."> when the page first appears.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  function setLanguage(next: Language) {
    // Update the shared variable first, so code outside React sees it at once.
    setCurrentLanguage(next);
    setLanguageState(next);
  }

  return (
    <LanguageContext.Provider value={{ ...getI18n(), setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * A "hook" (a function whose name starts with `use`) that a component calls
 * to get `t` (the strings) and `lang` (the current language).
 */
export function useStrings(): Value {
  return useContext(LanguageContext);
}
