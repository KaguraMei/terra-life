import { build } from 'esbuild';
import { esbuildLegacyPlugin } from './legacy-plugin.mjs';

await build({
  entryPoints: ['src/bootstrap/simulation.ts'],
  outfile: 'js/generated/simulation.js',
  bundle: true, format: 'iife', globalName: 'TerraSimulation', platform: 'browser',
  target: 'es2022', charset: 'utf8', sourcemap: true,
  plugins: [esbuildLegacyPlugin()]
});
// Native ESM entry for Node and tests: the same initializer graph as the browser.
await build({
  entryPoints: ['src/bootstrap/simulation.ts'],
  outfile: 'dist-runtime/simulation.mjs',
  bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', charset: 'utf8',
  plugins: [esbuildLegacyPlugin()]
});
