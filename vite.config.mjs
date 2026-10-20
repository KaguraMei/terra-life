import { defineConfig } from 'vite';
import { viteLegacyPlugin } from './tools/legacy-plugin.mjs';

export default defineConfig({
  base: './',
  plugins: [viteLegacyPlugin()],
  build: { target: 'es2022' }
});
