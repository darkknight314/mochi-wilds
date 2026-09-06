import { defineConfig } from 'vite';
export default defineConfig({
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:3001',
      '/socket': { target: 'ws://127.0.0.1:3001', ws: true },
    },
  },
  build: {
    chunkSizeWarningLimit: 650,
    rollupOptions: { input: { app: 'index.html', creatures: 'creatures.html' } },
  },
});
