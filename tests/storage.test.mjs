import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createStoragePort, COMPLETED_LIVES_KEY, RESUMABLE_LIFE_KEY
} from '../dist-runtime/simulation.mjs';

function fakeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
    failWrites: false
  };
}

const entry = (overrides = {}) => ({
  name: 'A', nation: '乌萨斯', race: '乌萨斯', age: 61, cause: '疾病', seed: 12,
  setup: {bornYear: 1050}, ...overrides
});

test('the port writes namespaced, versioned summaries newest first', () => {
  const storage = fakeStorage();
  const port = createStoragePort(() => storage);
  assert.equal(port.key, COMPLETED_LIVES_KEY);
  assert.equal(port.key, 'terra-life:v1:completed-lives');

  assert.deepEqual(port.readCompletedLives(), []);
  assert.deepEqual(port.recordCompletedLife(entry({name: 'first'})), {saved: true, total: 1});
  assert.deepEqual(port.recordCompletedLife(entry({name: 'second', age: 30})), {saved: true, total: 2});

  const stored = JSON.parse(storage.data.get(COMPLETED_LIVES_KEY));
  assert.equal(stored.length, 2);
  assert.equal(stored[0].v, 1, 'each record carries its own structure version');
  assert.equal(stored[0].name, 'second', 'newest first');
  assert.equal(typeof stored[0].t, 'number');

  const read = port.readCompletedLives();
  assert.deepEqual(read.map(row => row.name), ['second', 'first']);
  assert.equal(read[0].legacy, false);
  assert.equal(read[0].age, 30);
});

test('the list is capped and stays readable with corrupt neighbours', () => {
  const storage = fakeStorage();
  const port = createStoragePort(() => storage);
  for (let i = 0; i < 65; i++) port.recordCompletedLife(entry({name: `n${i}`, age: 20 + i}));
  assert.equal(port.readCompletedLives().length, 60);
  assert.equal(port.readCompletedLives()[0].name, 'n64');

  storage.setItem(COMPLETED_LIVES_KEY, '[{"name":"broken"},{"name":"ok","age":40,"cause":"x"}]');
  const read = port.readCompletedLives();
  assert.equal(read.length, 1, 'rows without a finite age and cause are dropped');
  assert.equal(read[0].name, 'ok');

  storage.setItem(COMPLETED_LIVES_KEY, 'not json');
  assert.deepEqual(port.readCompletedLives(), []);
});

test('storage failures degrade to no persistence instead of throwing', () => {
  const throwing = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); }
  };
  const guarded = createStoragePort(() => throwing);
  assert.deepEqual(guarded.readCompletedLives(), []);
  assert.deepEqual(guarded.recordCompletedLife(entry()), {saved: false, reason: 'quota'});
  guarded.clearCompletedLives();

  const unavailable = createStoragePort(() => undefined);
  assert.deepEqual(unavailable.recordCompletedLife(entry()), {saved: false, reason: 'unavailable'});

  const privacyMode = createStoragePort(() => { throw new Error('blocked by the browser'); });
  assert.deepEqual(privacyMode.readCompletedLives(), []);
  assert.deepEqual(privacyMode.recordCompletedLife(entry()), {saved: false, reason: 'unavailable'});
});

test('invalid summaries are rejected before they reach storage', () => {
  const storage = fakeStorage();
  const port = createStoragePort(() => storage);
  assert.deepEqual(port.recordCompletedLife(entry({age: Number.NaN})), {saved: false, reason: 'rejected'});
  assert.deepEqual(port.recordCompletedLife(entry({cause: ''})), {saved: false, reason: 'rejected'});
  assert.equal(storage.data.has(COMPLETED_LIVES_KEY), false, 'nothing is written for a rejected row');
});

test('legacy rows are readable but only on explicit request', () => {
  const storage = fakeStorage({
    'terra-life-saves-v1': JSON.stringify([{t: 5, name: 'old', nation: '炎', race: '菲林', age: 44, cause: '事故'}])
  });
  const port = createStoragePort(() => storage);
  assert.deepEqual(port.readCompletedLives(), []);
  const withLegacy = port.readCompletedLives({includeLegacy: true});
  assert.equal(withLegacy.length, 1);
  assert.equal(withLegacy[0].legacy, true);
});

test('a runtime without storage still exposes an empty port', async () => {
  const {createSimulation} = await import('../dist-runtime/simulation.mjs');
  const runtime = createSimulation();
  assert.equal(runtime.lifeStore.key, COMPLETED_LIVES_KEY);
  assert.deepEqual(runtime.lifeStore.readCompletedLives(), []);
  assert.deepEqual(runtime.lifeStore.recordCompletedLife(entry()), {saved: false, reason: 'unavailable'});
});

test('the resumable slot stores one opaque envelope and clears cleanly', () => {
  const storage = fakeStorage();
  const port = createStoragePort(() => storage);
  assert.equal(port.available(), true);
  assert.equal(port.readResumable(), null);

  const envelope = {format: 'terra-life-save', envelopeVersion: 1, state: {age: 7}};
  assert.deepEqual(port.writeResumable(envelope), {saved: true, total: 1});
  assert.equal(storage.data.has(RESUMABLE_LIFE_KEY), true);
  assert.deepEqual(port.readResumable(), envelope, 'the slot round-trips as plain JSON');

  storage.setItem(RESUMABLE_LIFE_KEY, 'not json');
  assert.equal(port.readResumable(), null, 'a corrupt slot reads as absent');
  storage.setItem(RESUMABLE_LIFE_KEY, '"a string"');
  assert.equal(port.readResumable(), null, 'non-object slots are not envelopes');

  assert.deepEqual(port.writeResumable('nope'), {saved: false, reason: 'rejected'});
  assert.deepEqual(port.writeResumable([1, 2]), {saved: false, reason: 'rejected'});

  port.clearResumable();
  assert.equal(storage.data.has(RESUMABLE_LIFE_KEY), false);
  assert.equal(port.readResumable(), null);
});

test('the resumable slot degrades like the rest of the port', () => {
  const throwing = {
    getItem() { return null; },
    setItem() { throw new Error('quota'); },
    removeItem() { throw new Error('denied'); }
  };
  const guarded = createStoragePort(() => throwing);
  assert.deepEqual(guarded.writeResumable({format: 'x'}), {saved: false, reason: 'quota'});
  guarded.clearResumable();

  const unavailable = createStoragePort(() => null);
  assert.equal(unavailable.available(), false);
  assert.deepEqual(unavailable.writeResumable({format: 'x'}), {saved: false, reason: 'unavailable'});
  assert.equal(unavailable.readResumable(), null);
});
