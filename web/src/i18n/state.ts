// The language the page is using right now, kept in one place so that code
// outside React (map popups, date formatting) can read it too.

import { en } from './en.ts';
import type { Strings } from './en.ts';
import { fil } from './fil.ts';

// A union type: the value must be exactly one of these two texts.
export type Language = 'en' | 'fil';

/** The strings of the current language, plus its name (used for dates). */
export type I18n = { t: Strings; lang: Language };

const STORAGE_KEY = 'ph-monitor-language';

/** Reads the saved choice. Storage can be blocked, so any failure means English. */
function readSaved(): Language {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'fil' || saved === 'en') return saved;
  } catch {
    // Blocked or unavailable: use the default.
  }
  return 'en';
}

// `let` is a variable that can change later. This one holds the choice.
let current: Language = readSaved();

/** Changes the language, remembers it, and tells the browser the page language. */
export function setCurrentLanguage(language: Language): void {
  current = language;
  document.documentElement.lang = language;
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Not saved; the page still works.
  }
}

export function getLanguage(): Language {
  return current;
}

/** The strings now in use. Call this when you need them (for example at click time). */
export function getI18n(): I18n {
  return { t: current === 'fil' ? fil : en, lang: current };
}

/** The locale used for dates and times. */
export function localeFor(language: Language): string {
  return language === 'fil' ? 'fil-PH' : 'en-PH';
}

/**
 * Puts values into a text: fill('{n} km', { n: 5 }) gives "5 km".
 * `Record<string, string | number>` means "an object with text keys and
 * text or number values".
 */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}

/** Looks a word up in a table; an unknown key gives `fallback` (default: the key itself). */
export function lookup(table: Record<string, string>, key: string, fallback: string = key): string {
  return table[key] ?? fallback;
}
