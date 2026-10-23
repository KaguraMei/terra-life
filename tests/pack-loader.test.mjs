import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {loadInterviewPacks, packDocumentEntries} from '../dist-runtime/simulation.mjs';
import {simulation} from '../tools/sim-context.mjs';

const exampleText = fs.readFileSync('docs/examples/dlc-blacksteel-interviews.json', 'utf8');
const examplePack = JSON.parse(exampleText);

const harness = () => {
  const storage = new Map();
  const errors = [];
  const make = () => simulation(
    {log() {}, warn() {}, error(...args) { errors.push(args.map(String).join(' ')); }},
    {storage: () => ({getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)})}).TL;
  return {make, storage, errors};
};

test('a DLC pack document registers and joins the content lock', () => {
  const {make} = harness();
  const TL = make();
  const before = TL.interviewPackLocks();
  assert.equal(before.length, 1, 'core pack only');

  const result = TL.loadInterviewPacks(exampleText);
  assert.equal(JSON.stringify(Array.from(result.registered)), JSON.stringify([examplePack.id]));
  assert.equal(result.diagnostics.length, 0);

  const after = TL.interviewPackLocks();
  assert.equal(after.length, 2, 'the DLC pack is now part of the content identity');
  assert.equal(JSON.stringify(Array.from(after, lock => lock.id).sort()),
    JSON.stringify(['core_interviews', examplePack.id].sort()));
  assert.ok(Array.from(after).every(lock => /^fnv1a-[0-9a-f]{8}-\d+$/.test(lock.hash)));
});

test('a rejected pack leaves the registry and the lock untouched', () => {
  const {make} = harness();
  const TL = make();
  const before = JSON.stringify(TL.interviewPackLocks());

  const broken = structuredClone(examplePack);
  broken.version = 0; // the pack schema requires a positive integer version
  const result = TL.loadInterviewPacks({packs: [broken]});
  assert.equal(result.registered.length, 0);
  assert.equal(result.diagnostics[0].code, 'pack.invalid');
  assert.match(result.diagnostics[0].message, new RegExp(examplePack.id));
  assert.equal(JSON.stringify(TL.interviewPackLocks()), before, 'nothing was half-registered');

  const duplicate = TL.loadInterviewPacks(exampleText);
  assert.equal(duplicate.registered.length, 1);
  const twice = TL.loadInterviewPacks(exampleText);
  assert.equal(twice.registered.length, 0, 'the same pack id cannot be registered twice');
  assert.equal(twice.diagnostics[0].code, 'pack.invalid');
});

test('a save made with a DLC pack refuses to resume without it', () => {
  const {make, storage} = harness();
  const withPack = make();
  withPack.loadInterviewPacks(exampleText);
  const state = withPack.newLife({seed: 940001, pace: 'short'});
  assert.equal(withPack.saveProgress(state).saved, true);

  const stored = JSON.parse(storage.get('terra-life:v1:resumable-life'));
  assert.equal(stored.contentLock.packages.length, 2, 'the envelope names both packs');

  // Same build, same packs: resumes.
  assert.ok(withPack.loadProgress(), 'the same content set resumes the save');

  // A build without the DLC pack must refuse rather than guess the questions.
  const coreOnly = make();
  assert.equal(coreOnly.loadProgress(), null);
});

test('document shapes are reported, not guessed', () => {
  assert.deepEqual(packDocumentEntries('not json').diagnostics[0].code, 'pack.json-invalid');
  assert.equal(packDocumentEntries([]).packs.length, 0);
  assert.equal(packDocumentEntries({packs: [examplePack]}).packs.length, 1, 'a bundle is accepted');
  assert.equal(packDocumentEntries(examplePack).packs.length, 1, 'a bare pack is accepted');
  assert.equal(packDocumentEntries({version: 1}).diagnostics[0].code, 'pack.not-object');
  assert.equal(packDocumentEntries(42).diagnostics[0].code, 'pack.not-object');

  // The loader reports per-pack failures without stopping the batch.
  const registered = [];
  const broken = {...examplePack, id: 'broken_pack', pools: []};
  const result = loadInterviewPacks({packs: [broken, examplePack]}, pack => {
    if (pack.id === 'broken_pack') throw new Error('empty pack');
    registered.push(pack.id);
  });
  assert.deepEqual(registered, [examplePack.id]);
  assert.equal(result.diagnostics[0].code, 'pack.invalid');
  assert.equal(result.diagnostics[0].path, 'packs[0]');
});
