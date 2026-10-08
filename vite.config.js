import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  root: 'src/admin/frontend',
  base: './',
  build: {
    outDir: '../../../dist/admin',
    emptyOutDir: true
  },
  plugins: [svelte()]
});
