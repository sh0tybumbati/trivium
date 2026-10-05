import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API = process.env.TRIVIUM_API ?? 'http://127.0.0.1:3001';

// In dev the Vite server serves the app and forwards the API and socket to the Node server.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    proxy: {
      '/api': API,
      '/ws': { target: API, ws: true },
    },
  },
});
