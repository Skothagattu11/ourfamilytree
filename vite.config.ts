import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    // the voice relay (npm run server) listens on 8787
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } },
  },
});
