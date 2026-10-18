import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const read = f => fs.readFileSync(path.join(root, f), 'utf8');
export function simulation(log = console) {
  const window = {};
  const context = vm.createContext({window, console:log, Math, JSON, Date, Intl, Float64Array});
  for (const [,file] of read('index.html').matchAll(/<script src="([^"]+)"/g)) {
    if (file.includes('/ui/') || file === 'js/main.js') continue;
    vm.runInContext(read(file), context, {filename:file});
  }
  return {TL:window.TL, context, window};
}
