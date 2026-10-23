import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const read = f => fs.readFileSync(path.join(root, f), 'utf8');
/**
 * Build one legacy-compatible runtime inside a minimal VM.
 * `storage` mirrors what the browser bootstrap injects: a lazily-resolved
 * StorageLike, so a harness can exercise the real application storage port.
 */
export function simulation(log = console, options = {}) {
  const window = {};
  const context = vm.createContext({window, console:log, Math, JSON, Date, Intl, Float64Array});
  const file = 'js/generated/simulation.js';
  if (!fs.existsSync(path.join(root,file))) throw new Error('Run npm ci or npm run build:runtime first.');
  vm.runInContext(read(file), context, {filename:file});
  window.TL = options.storage
    ? context.TerraSimulation.createSimulation({storage: options.storage})
    : context.TerraSimulation.createSimulation();
  return {TL:window.TL, context, window};
}
