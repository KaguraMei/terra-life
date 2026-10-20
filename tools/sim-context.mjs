import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const read = f => fs.readFileSync(path.join(root, f), 'utf8');
export function simulation(log = console) {
  const window = {};
  const context = vm.createContext({window, console:log, Math, JSON, Date, Intl, Float64Array});
  const file = 'js/generated/simulation.js';
  if (!fs.existsSync(path.join(root,file))) throw new Error('Run npm ci or npm run build:runtime first.');
  vm.runInContext(read(file), context, {filename:file});
  window.TL = context.TerraSimulation.createSimulation();
  return {TL:window.TL, context, window};
}
