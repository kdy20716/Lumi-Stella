import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: 'client',
  base: './',
  envDir: '..',   // .env (VITE_SERVER_URL) 은 프로젝트 맨 위 폴더에 · Vercel 은 프로젝트 환경 변수
  plugins: [tailwindcss()],
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  server: { port: 5173, open: true, fs: { allow: ['..'] } },
  build: { outDir: '../dist', emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 2000 },
});
