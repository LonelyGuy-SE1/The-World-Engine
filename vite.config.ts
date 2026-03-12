import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@renderer': path.resolve(__dirname, 'src/renderer'),
    },
  },
  worker: {
    format: 'es',
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
