// Settings for Vite, the tool that serves the web app while you develop
// (npm run dev) and bundles it for release (npm run build).

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The web app asks for "/api/...". Vite passes those requests on to our
// server, so the browser only ever talks to one address.
// The port must match SERVER_PORT in .env.
const apiProxy = { '/api': 'http://localhost:3001' };

export default defineConfig({
  plugins: [react()],
  // MapLibre loads a helper file (a "worker") that sits next to its main file.
  // Vite's dev-mode pre-bundling would move the main file and break that
  // link, so we tell Vite to leave MapLibre as it is.
  optimizeDeps: {
    exclude: ['maplibre-gl'],
  },
  // `npm run dev`: the live development site.
  server: { port: 5173, proxy: apiProxy },
  // `npm run preview`: serves the built files from dist/ to try them out.
  preview: { port: 4173, proxy: apiProxy },
});
