// One door into the language code: import from './i18n' (or '../i18n').

export { LanguageProvider, useStrings } from './LanguageContext.tsx';
export { LanguageSwitch } from './LanguageSwitch.tsx';
export { fill, getI18n, localeFor, lookup } from './state.ts';
// `export type` re-exports types, which vanish when the code runs.
export type { I18n, Language } from './state.ts';
export type { Strings } from './en.ts';
