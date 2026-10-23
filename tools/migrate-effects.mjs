// Rewrites TL.eff calls into declared effects for the given event ids.
// Mechanical by design: the baseline fixture in tests/fixtures proves the
// rewrite preserved behaviour, so this tool stays dumb and reviewable.
//
//   node tools/migrate-effects.mjs <eventId...>          # dry run, prints a diff
//   node tools/migrate-effects.mjs --write <eventId...>  # applies to js/data/events.js
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'js/data/events.js');
const argv = process.argv.slice(2);
const write = argv.includes('--write');
const repair = argv.includes('--repair');
const ids = argv.filter(arg => arg !== '--write' && arg !== '--repair');
if (!ids.length && !repair) throw new Error('usage: node tools/migrate-effects.mjs [--write] [--repair] <eventId...>');

const EFF = /TL\.eff\(S,\s*\{([^{}]*)\}\)/g;
// A generated attributes list that still carries a cash delta has to become two
// effects: attributes are clamped by the model, money is added as-is.
const MIXED = /TL\.applyEffects\(S, \[\{ kind: 'attributes', ([^{}]*\bmoney\s*:[^{}]*)\}\]\)/g;

export function effectList(body) {
  const pairs = body.split(',').map(part => part.trim()).filter(Boolean);
  const attrs = pairs.filter(pair => !/^money\s*:/.test(pair));
  const money = pairs.filter(pair => /^money\s*:/.test(pair))
    .map(pair => pair.replace(/^money\s*:\s*/, ''));
  const effects = [];
  if (attrs.length) effects.push(`{ kind: 'attributes', ${attrs.join(', ')} }`);
  for (const amount of money) effects.push(`{ kind: 'money', amount: ${amount} }`);
  return `TL.applyEffects(S, [${effects.join(', ')}])`;
}

function splitMixed(source) {
  let count = 0;
  const next = source.replace(MIXED, (_match, body) => {
    count++;
    return effectList(body);
  });
  return {next, count};
}

function rewriteBlock(block) {
  let count = 0;
  const next = block.replace(EFF, (_match, inner) => {
    count++;
    const body = inner.trim().replace(/,$/, '');
    return effectList(body);
  });
  return {next, count};
}

let source = fs.readFileSync(file, 'utf8');
if (repair) {
  const {next, count} = splitMixed(source);
  console.log(`split ${count} attribute list(s) carrying cash`);
  if (write) { fs.writeFileSync(file, next, 'utf8'); console.log(`wrote ${path.relative(root, file)}`); }
  else console.log('(dry run: pass --write to apply)');
  process.exit(0);
}
const changed = [];
for (const id of ids) {
  const start = source.indexOf(`def('${id}',`);
  if (start < 0) throw new Error(`event ${id} not found in js/data/events.js`);
  const end = source.indexOf('\n  });\n', start);
  if (end < 0) throw new Error(`cannot find the end of event ${id}`);
  const block = source.slice(start, end);
  const {next, count} = rewriteBlock(block);
  if (!count) { console.log(`${id}: no TL.eff call left`); continue; }
  source = source.slice(0, start) + next + source.slice(end);
  changed.push({id, count});
}

console.log(`rewritten events: ${changed.length}`);
for (const row of changed) console.log(`  ${row.id}: ${row.count} effect call(s)`);

if (write) {
  fs.writeFileSync(file, source, 'utf8');
  console.log(`wrote ${path.relative(root, file)}`);
} else {
  const sample = changed[0];
  if (sample) {
    const start = source.indexOf(`def('${sample.id}',`);
    console.log('\n--- preview ---');
    console.log(source.slice(start, source.indexOf('\n  });\n', start) + 5));
    console.log('\n(dry run: pass --write to apply)');
  }
}
