// One door into the theme code: import from './theme' (or '../theme').

export { ThemeProvider, useTheme } from './ThemeContext.tsx';
export { ThemeSwitch } from './ThemeSwitch.tsx';
export { getTheme } from './state.ts';
// `export type` re-exports types, which vanish when the code runs.
export type { Theme } from './state.ts';
