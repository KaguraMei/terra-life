// Assembly-boundary checks for the transitional legacy runtime.
//
// The core content is still plain scripts loaded in a fixed order. Those scripts
// share one mutable compatibility surface, so the load order, the initializer
// manifest and the "no browser globals" rule are the real module boundary until
// the code is split into typed modules. This tool keeps that boundary honest
// without building the bundle.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const assembly = read('src/legacy/create-runtime.js');

/* --- 1. the manifest is explicit, ordered and dependency-closed ---------- */

const manifestEntries = [...assembly.matchAll(
  /\{ id: '([^']+)', requires: \[([^\]]*)\], install: ([A-Za-z_$][\w$]*) \}/g
)].map(match => ({
  id: match[1],
  requires: [...match[2].matchAll(/'([^']+)'/g)].map(item => item[1]),
  install: match[3]
}));
assert.ok(manifestEntries.length >= 20, 'runtime manifest should list every legacy initializer');

const installed = new Set(['kernel']);
const manifestIds = new Set();
for (const entry of manifestEntries) {
  assert.ok(!manifestIds.has(entry.id), `duplicate runtime initializer: ${entry.id}`);
  for (const dependency of entry.requires) {
    assert.ok(installed.has(dependency),
      `runtime initializer ${entry.id} declares ${dependency}, which is not installed before it`);
  }
  manifestIds.add(entry.id);
  installed.add(entry.id);
}

/* --- 2. the manifest and the imports cannot drift ------------------------ */

const importPattern = /import (initialize\d+) from '\.\.\/\.\.\/(js\/[^']+)\?legacy';/g;
const imports = [...assembly.matchAll(importPattern)].map(match => ({
  local: match[1],
  file: match[2]
}));

const filesByBinding = new Map(imports.map(item => [item.local, item.file]));

// An installer may be a typed module (`cohort`), or a composite that installs the
// typed part and then chains the legacy initializer it still needs (`lifetable`
// keeps its cause weights in the legacy file for now). Both count as "this legacy
// file is wired in exactly once", so parse the installer bodies to see which legacy
// initializer each entry ends up calling.
const installerBodies = new Map();
for (const match of assembly.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g)) {
  installerBodies.set(match[1], match[2]);
}
const legacyInstallerOf = entry => {
  if (filesByBinding.has(entry.install)) return entry.install;
  const body = installerBodies.get(entry.install) ?? '';
  const called = [...body.matchAll(/\b(initialize\d+)\s*\(/g)].map(match => match[1]);
  return called.length === 1 ? called[0] : null;
};

const legacyEntries = manifestEntries
  .map(entry => ({entry, binding: legacyInstallerOf(entry)}))
  .filter(item => item.binding !== null);
assert.equal(legacyEntries.length, imports.length,
  'every imported legacy initializer must appear exactly once in the manifest');
const filesInManifest = new Set();
for (const {binding} of legacyEntries) {
  const file = filesByBinding.get(binding);
  assert.ok(file, `manifest chains ${binding}, which is not imported`);
  assert.ok(!filesInManifest.has(file), `two manifest entries install the same file: ${file}`);
  filesInManifest.add(file);
}

const files = [...new Set(imports.map(item => item.file))];
assert.equal(files.length, imports.length, 'a legacy file must not be imported twice');
assert.equal(new Set(files).size, files.length);

/* --- 3. every legacy file keeps the wrapper the build hook rewrites ------ */

const SUFFIX = '})(window.TL = window.TL || {});';
for (const file of files) {
  const source = read(file);
  assert.ok(source.includes('(function (TL) {'), `${file}: missing the IIFE entry the legacy loader rewrites`);
  assert.ok(source.trimEnd().endsWith(SUFFIX), `${file}: must end with the documented legacy wrapper`);
  const windowLines = source.split('\n').filter(line => /\bwindow\./.test(line));
  assert.equal(windowLines.length, 1,
    `${file}: only the trailing wrapper line may touch window; a second line would leak the global surface`);
  assert.ok(/\bwindow\.TL\s*=\s*window\.TL/.test(windowLines[0]),
    `${file}: the wrapper line must be the documented window.TL bootstrap`);
}

// Platform coupling still living in legacy scripts is registered explicitly, so
// a new engine file cannot quietly acquire DOM or storage access. Shrinking the
// ledger is the migration goal; growing it means the boundary regressed.
// Empty on purpose: the last coupled script (js/engine/region.js, which set
// <html lang> and remembered the region in localStorage) moved into the typed
// layers plus js/main.js. The ledger stays so a new legacy file cannot quietly
// acquire DOM or storage access.
const PLATFORM_COUPLING = new Map([]);
const coupled = files.filter(file => /\bdocument\.|\blocalStorage\b|\bindexedDB\b/.test(read(file)));
assert.deepEqual(coupled.sort(), [...PLATFORM_COUPLING.keys()].sort(),
  'platform coupling must match the registered ledger; move the new usage into the application/platform port instead');

/* --- 4. the new layers stay free of platform and legacy imports ---------- */

const walk = dir => fs.readdirSync(path.join(root, dir), {withFileTypes: true}).flatMap(entry => {
  const rel = path.posix.join(dir, entry.name);
  return entry.isDirectory() ? walk(rel) : [rel];
});
const REQUIRED_TYPED_MODULES = [
  'src/kernel/random.ts',
  'src/kernel/events.ts',
  'src/model/state-invariants.ts',
  'src/model/transitions.ts',
  'src/model/life-view.ts',
  'src/model/save-envelope.ts',
  'src/model/effects.ts',
  'src/model/cohort.ts',
  'src/model/text.ts',
  'src/model/sampling.ts',
  'src/model/locale.ts',
  'src/content/locales.ts',
  'src/content/registry-validation.ts',
  'src/content/pack-lock.ts',
  'src/platform/storage.ts'
];
for (const file of REQUIRED_TYPED_MODULES) {
  assert.ok(fs.existsSync(path.join(root, file)), `${file}: required typed module is missing`);
}
// `src/bootstrap` is excluded on purpose: it is the only layer allowed to touch
// browser globals and to wire the platform adapters together.
const typedSources = [...walk('src/kernel'), ...walk('src/model'), ...walk('src/content'), ...walk('src/platform')]
  .filter(file => file.endsWith('.ts') || file.endsWith('.js'));
assert.ok(typedSources.length >= REQUIRED_TYPED_MODULES.length,
  'every typed module must live in kernel/model/content/platform');

// Member access only: a prose sentence such as "the save envelope." must not be
// mistaken for a DOM read, so the dot has to be followed by an identifier.
const GLOBAL_ACCESS = {
  window: /\bwindow\s*(\.\s*[A-Za-z_$][\w$]*|\[)/,
  document: /\bdocument\s*(\.\s*[A-Za-z_$][\w$]*|\[)/,
  localStorage: /\blocalStorage\s*(\.\s*[A-Za-z_$][\w$]*|\[)/,
  indexedDB: /\bindexedDB\s*(\.\s*[A-Za-z_$][\w$]*|\[)/
};
for (const file of typedSources) {
  const source = read(file);
  assert.doesNotMatch(source, GLOBAL_ACCESS.window, `${file}: typed layers must not read window`);
  assert.doesNotMatch(source, GLOBAL_ACCESS.document, `${file}: typed layers must not read the DOM`);
  assert.doesNotMatch(source, GLOBAL_ACCESS.localStorage, `${file}: typed layers must not read localStorage`);
  assert.doesNotMatch(source, GLOBAL_ACCESS.indexedDB, `${file}: typed layers must not read indexedDB`);
  assert.doesNotMatch(source, /from '\.\.\/\.\.\/js\//, `${file}: typed layers must not import legacy scripts`);
  // The random kernel is the single place allowed to sample native entropy, and
  // only as the deliberate unseeded default that cannot be resumed.
  if (file !== 'src/kernel/random.ts') {
    assert.doesNotMatch(source, /\bMath\.random\b/, `${file}: randomness must be injected, not sampled globally`);
  }
}

/* --- 5. only the browser bootstrap exposes a global --------------------- */

// Detect real global writes, not mentions in prose comments.
const publishesGlobal = source => /window\.TL\s*=/.test(source) || /Object\.assign\(\s*window\b/.test(source);
const bootstrapCallers = [...walk('src')].filter(file => /\.(ts|js)$/.test(file) && publishesGlobal(read(file)));
assert.deepEqual(bootstrapCallers.sort(), ['src/bootstrap/browser.ts'],
  'the browser bootstrap is the only compatibility boundary allowed to publish a global');

console.log(`runtime boundaries ok: ${manifestEntries.length} initializers, ${files.length} legacy files, `
  + `${typedSources.length} typed sources, 1 global boundary`);
