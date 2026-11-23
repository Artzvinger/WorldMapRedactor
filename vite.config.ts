import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // относительные пути: сборка работает и в корне домена, и в подпапке
  // вроде /WorldMapRedactor/ на GitHub Pages
  base: './',
  server: {
    port: 5178,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
