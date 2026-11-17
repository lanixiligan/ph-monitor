// The web app's starting point: puts <App /> into the page.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { APP_NAME } from '@ph-monitor/shared';
import 'maplibre-gl/dist/maplibre-gl.css';
// The two typefaces, packaged with the app (nothing is loaded from a font site).
// Barlow Condensed: titles and numbers. Atkinson Hyperlegible: everything else.
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import './styles.css';
import { App } from './App.tsx';
import { CreditsPage } from './components/CreditsPage.tsx';
import { LanguageProvider } from './i18n/index.ts';
import { ThemeProvider } from './theme/index.ts';

document.title = APP_NAME;

const root = document.getElementById('root');
if (!root) {
  throw new Error('index.html is missing <div id="root">');
}

// StrictMode is a development helper that warns about common React mistakes.
// LanguageProvider sits OUTSIDE <App />, so that App itself can call useStrings().
createRoot(root).render(
  <StrictMode>
    <LanguageProvider>
      <ThemeProvider>
        {/* Only two pages, so a plain address check is enough (no router needed). */}
        {window.location.pathname === '/credits' ? <CreditsPage /> : <App />}
      </ThemeProvider>
    </LanguageProvider>
  </StrictMode>,
);
