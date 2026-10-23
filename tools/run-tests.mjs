import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = fs.readdirSync(path.join(root, 'tests'))
  .filter(name => name.endsWith('.test.mjs'))
  .sort()
  .map(name => path.join('tests', name));
if (!tests.length) throw new Error('No test files found');
const result = spawnSync(process.execPath, ['--test', ...tests], {cwd: root, stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
