import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
  build: {
    // Route-level lazy loading means each page is its own chunk now, so the
    // default 500KB warning fires on library-heavy chunks (xlsx, html2canvas)
    // that only load when their feature is actually used — raised so the
    // build stays quiet about chunks that were split out on purpose.
    chunkSizeWarningLimit: 600,
  },
});
