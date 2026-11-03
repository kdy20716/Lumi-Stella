import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'client',
  base: './',
  plugins: [tailwindcss()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  server: { port: 5173, open: true, fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
