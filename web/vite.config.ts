import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // The API is same-origin in dev, so no CORS juggling in the browser.
      '/api': { target: process.env.API_URL ?? 'http://localhost:4000', changeOrigin: true },
    },
  },
});
