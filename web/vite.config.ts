import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Cloud IDEs serve the dev server through a generated hostname. Vite
    // rejects unknown Host headers by default, which would show "Blocked
    // request" instead of the app. localhost and LAN addresses are always
    // allowed; these entries cover the hosted editors.
    allowedHosts: ['.app.github.dev', '.githubpreview.dev', '.gitpod.io', '.csb.app'],
    proxy: {
      // The API is same-origin in dev, so no CORS juggling in the browser.
      '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: true },
    },
  },
});
