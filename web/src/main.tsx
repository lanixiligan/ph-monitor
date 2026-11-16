// The web app's starting point: puts <App /> into the page.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { APP_NAME } from '@ph-monitor/shared';
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { App } from './App.tsx';
import { LanguageProvider } from './i18n/index.ts';

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
      <App />
    </LanguageProvider>
  </StrictMode>,
);
