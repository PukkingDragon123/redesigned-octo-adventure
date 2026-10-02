import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, hmr: process.env.NOHMR ? false : undefined },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
