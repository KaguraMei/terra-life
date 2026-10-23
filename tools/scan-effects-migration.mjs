// Lists events whose run() body can be expressed as declared effects.
// Read-only: introspects the built runtime, never edits content.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A state write that is not the TL.eff call we are about to replace. Subscripts
// count as writes too: `S.conds[k] = ...` and `S.flags.x++` must both be caught.
const MUTATE = /\bS((\.[A-Za-z_$][\w$]*)|(\[[^\]]*\]))+(\s*[-+*/]?=|\s*\+\+|\s*--|\s*\.push|\s*\.splice|\s*\.shift|\s*\.sort)/;
// Calls into the model that are pure readers or RNG (order preserved by migration).
const PURE = new Set(['eff', 'L', 'pick', 'chance', 'rnd', 'range', 'clamp', 'isWorking',
  'jobLabel', 'organizationName', 'organizationRouteName', 'netWorth', 'discrimination',
  'oriStigma', 'tolOf', 'totalDiscrimination', 'stage', 'artRank', 'artRankName']);
const CALL = /\bTL\.([A-Za-z_$][\w$]*)\s*\(/g;

function runtime() {
  const file = 'js/generated/simulation.js';
  if (!fs.existsSync(path.join(root, file))) throw new Error('run npm run build:runtime first');
  const window = {};
  const context = vm.createContext({window, console: {log() {}, warn() {}, error() {}},
    Math, JSON, Date, Intl, Float64Array});
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
  return context.TerraSimulation.createSimulation();
}

/** The TL.eff calls that this migration can rewrite in place. */
export function effCalls(source) {
  return source.match(/TL\.eff\(S,\s*\{[^{}]*\}\)/g) ?? [];
}

export function classify(definition) {
  const source = String(definition.run);
  const effs = effCalls(source);
  if (!effs.length) return {ok: false, reason: 'no TL.eff call'};
  let rest = source;
  for (const call of effs) rest = rest.replace(call, '');
  if (MUTATE.test(rest)) return {ok: false, reason: 'writes state outside effects'};
  if (/\bS\.(queue|pending)\b/.test(source)) return {ok: false, reason: 'touches queue or pending'};
  for (const [, name] of rest.matchAll(CALL)) {
    if (!PURE.has(name)) return {ok: false, reason: `calls TL.${name}`};
  }
  return {ok: true, effs: effs.length};
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const TL = runtime();
  const rows = [];
  const already = new Set();
  for (const [id, definition] of Object.entries(TL.EVMAP)) {
    if (String(definition.run).includes('TL.applyEffects')) already.add(id);
    const verdict = classify(definition);
    if (verdict.ok) rows.push({id, effCalls: verdict.effs});
  }
  const pending = rows.filter(row => !already.has(row.id));
  if (process.argv.includes('--json')) console.log(JSON.stringify(pending, null, 2));
  else {
    console.log(`migratable: ${rows.length}, already migrated: ${already.size}, pending: ${pending.length}`);
    for (const row of pending) console.log(`${row.id}\t${row.effCalls}`);
  }
}
