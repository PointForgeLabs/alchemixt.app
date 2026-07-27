import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built bundle works from any subpath (GitHub Pages,
  // a static host, or file:// preview) without rewriting asset URLs.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
  },
  server: {
    port: 5173,
    open: true,
  },
});
