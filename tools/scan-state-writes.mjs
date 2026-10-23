// Ratchet for direct life-state writes in the legacy content layer.
//
// The point of the effects contract and the transition guards is that content
// stops poking at `S` field by field. That only sticks if it cannot grow back, so
// this tool freezes the current per-file/per-field counts and fails when any of
// them increases.
//
//   node tools/scan-state-writes.mjs                 # print the ledger
//   node tools/scan-state-writes.mjs --check         # fail if a count grew
//   node tools/scan-state-writes.mjs --write         # re-record the baseline
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = path.join(root, 'docs/data/state-writes.json');
const args = process.argv.slice(2);
const check = args.includes('--check');
const write = args.includes('--write');

const SKIP = new Set(['js/generated']);
const WRITE = /\bS\.([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*)*)\s*(?:=(?!=)|\+=|-=|\*=|\/=|\+\+|--)/g;

function sourceFiles() {
  const out = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), {withFileTypes: true})) {
      const rel = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!SKIP.has(rel)) walk(rel);
      } else if (entry.name.endsWith('.js')) {
        out.push(rel);
      }
    }
  };
  walk('js');
  return out.sort();
}

const ledger = {};
for (const file of sourceFiles()) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of source.matchAll(WRITE)) {
    const field = match[1];
    ledger[file] ??= {};
    ledger[file][field] = (ledger[file][field] ?? 0) + 1;
  }
}

const sorted = {};
for (const file of Object.keys(ledger).sort()) {
  const fields = {};
  for (const field of Object.keys(ledger[file]).sort()) fields[field] = ledger[file][field];
  sorted[file] = fields;
}
const total = Object.values(sorted).reduce(
  (sum, fields) => sum + Object.values(fields).reduce((a, b) => a + b, 0), 0);

if (write) {
  fs.mkdirSync(path.dirname(baselineFile), {recursive: true});
  fs.writeFileSync(baselineFile,
    `${JSON.stringify({note: 'Direct writes to the life state in the legacy content layer. Counts may only go down; re-record with --write and say why.', total, files: sorted}, null, 2)}\n`,
    'utf8');
  console.log(`recorded ${total} direct writes -> ${path.relative(root, baselineFile)}`);
  process.exit(0);
}

if (!check) {
  for (const [file, fields] of Object.entries(sorted)) {
    const row = Object.entries(fields).map(([field, count]) => `${field}=${count}`).join(' ');
    console.log(`${file}: ${row}`);
  }
  console.log(`total direct writes: ${total}`);
  process.exit(0);
}

if (!fs.existsSync(baselineFile)) {
  console.error(`missing baseline ${path.relative(root, baselineFile)}; run with --write first`);
  process.exit(1);
}
const baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'));
const grown = [];
const shrunk = [];
for (const [file, fields] of Object.entries(sorted)) {
  for (const [field, count] of Object.entries(fields)) {
    const before = baseline.files?.[file]?.[field] ?? 0;
    if (count > before) grown.push(`${file}: S.${field} ${before} -> ${count}`);
    else if (count < before) shrunk.push(`${file}: S.${field} ${before} -> ${count}`);
  }
}
for (const [file, fields] of Object.entries(baseline.files ?? {})) {
  for (const [field, before] of Object.entries(fields)) {
    if (!sorted[file]?.[field]) shrunk.push(`${file}: S.${field} ${before} -> 0`);
  }
}

if (shrunk.length) {
  console.log(`migrated away (${shrunk.length}):`);
  for (const row of shrunk) console.log(`  ${row}`);
}
if (grown.length) {
  console.error(`\ndirect state writes increased (${grown.length}):`);
  for (const row of grown) console.error(`  ${row}`);
  console.error('\nRoute the change through TL.applyEffects (attributes/money/flag) or a guarded');
  console.error('transition (dismissFromJob / enterCoercedLabour / join / leave / retire) instead.');
  console.error('If the write is genuinely new engine work, re-record with --write and explain it.');
  process.exit(1);
}
console.log(`state-writes ratchet ok: ${total} direct writes, none above the recorded baseline`);
