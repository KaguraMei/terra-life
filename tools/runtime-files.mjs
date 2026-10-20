import fs from 'node:fs';
const assembly = fs.readFileSync(new URL('../src/legacy/create-runtime.js', import.meta.url), 'utf8');
export const runtimeFiles = [...assembly.matchAll(/from '\.\.\/\.\.\/(js\/[^']+)\?legacy'/g)].map(match => match[1]);
