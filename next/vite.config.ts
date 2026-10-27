import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'node:fs';

// emits the web-app worker (src/sw.js) with this build's id, so each release gets its own cache and the old one is dropped
const worker = { name: 'waraq-sw', generateBundle() { this.emitFile({ type: 'asset', fileName: 'sw.js', source: readFileSync('src/sw.js', 'utf8').replace('__BUILD__', JSON.parse(readFileSync('package.json', 'utf8')).version + '-' + Date.now().toString(36)) }); } };

export default defineConfig({
  plugins: [svelte(), worker],
  define: { __WARAQ_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) }, // shown in crash reports
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['harfbuzzjs'] }, // it finds harfbuzz.wasm next to itself
  server: { port: 5188, strictPort: true },
  build: { target: 'es2023' },
});
