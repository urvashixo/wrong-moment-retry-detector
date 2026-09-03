import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  appType: 'spa',
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8000',
      '/webhooks': 'http://localhost:8000'
    }
  },
  preview: {
    port: 4173,
    host: true,
  }
});
