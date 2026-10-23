import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import {createSimulation, RESUMABLE_LIFE_KEY} from '../dist-runtime/simulation.mjs';

const canonical = value => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key]);
    return out;
  }
  return value;
};
const hash = state => crypto.createHash('sha256').update(JSON.stringify(canonical(state))).digest('hex');

function fakeStorage() {
  const data = new Map();
  return {
    data,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); }
  };
}

/** Advance to the first moment after a settled year boundary (age bumped, t reset). */
function runToYearBoundary(runtime, state, years) {
  let lastAge = state.age;
  let boundaries = 0;
  let guard = 0;
  while (state.phase === 'life' && guard++ < 40000) {
    if (!state.focus) state.focus = runtime.autoFocus(state);
    runtime.tick(state, state.yearSec / 8);
    if (state.pending) runtime.autoChoose(state);
    if (state.age !== lastAge && state.t === 0) {
      lastAge = state.age;
      if (++boundaries >= years) return true;
    }
  }
  return false;
}

function finish(runtime, state) {
  let guard = 0;
  while (state.phase === 'life' && guard++ < 40000) {
    if (!state.focus) state.focus = runtime.autoFocus(state);
    runtime.tick(state, state.yearSec / 8);
    if (state.pending) runtime.autoChoose(state);
  }
  assert.equal(state.phase, 'report');
}

test('a life saved at a year boundary resumes into the same future', () => {
  const storage = fakeStorage();
  const first = createSimulation({storage: () => storage});
  const options = {seed: 700001, pace: 'short'};
  const state = first.newLife(options);
  assert.equal(storage.data.has(RESUMABLE_LIFE_KEY), false, 'a fresh life does not create a slot yet');

  assert.ok(runToYearBoundary(first, state, 5), 'expected to settle five years');
  assert.equal(storage.data.has(RESUMABLE_LIFE_KEY), true, 'each settled year autosaves');
  const savedAtBoundary = hash(state);
  const boundaryRandom = first.randomSnapshot();
  const firstTail = Array.from({length: 6}, () => first.rnd());
  first.restoreRandom(boundaryRandom);
  // Keep the bytes: finishing the life clears the slot on death, and the point
  // here is that the *boundary snapshot* resumes into the same future.
  const savedBytes = storage.data.get(RESUMABLE_LIFE_KEY);

  finish(first, state);
  const expectedEnd = hash(state);
  storage.setItem(RESUMABLE_LIFE_KEY, savedBytes);

  const second = createSimulation({storage: () => storage});
  assert.equal(second.hasProgress(), true);
  const resumed = second.loadProgress();
  assert.ok(resumed, 'the slot must be readable');
  assert.equal(hash(resumed), savedAtBoundary, 'resuming continues from the settled boundary');
  const resumedRandom = second.randomSnapshot();
  assert.deepEqual(Array.from({length: 6}, () => second.rnd()), firstTail,
    'the random stream resumes at the same position');
  // Consuming those draws was only a comparison; put the stream back before playing on.
  second.restoreRandom(resumedRandom);

  finish(second, resumed);
  assert.equal(hash(resumed), expectedEnd, 'continued life matches the uninterrupted one');
});

test('death and a new life both clear the resumable slot', () => {
  const storage = fakeStorage();
  const runtime = createSimulation({storage: () => storage});
  const state = runtime.newLife({seed: 700002, pace: 'short'});
  assert.ok(runToYearBoundary(runtime, state, 3));
  assert.equal(storage.data.has(RESUMABLE_LIFE_KEY), true);

  finish(runtime, state);
  assert.equal(storage.data.has(RESUMABLE_LIFE_KEY), false, 'a finished life leaves no continue offer');

  const again = runtime.newLife({seed: 700003, pace: 'short'});
  assert.ok(runToYearBoundary(runtime, again, 2));
  assert.equal(storage.data.has(RESUMABLE_LIFE_KEY), true);
  runtime.newLife({seed: 700004, pace: 'short'});
  assert.equal(storage.data.has(RESUMABLE_LIFE_KEY), false, 'starting a new life replaces the old offer');
});

test('a corrupted or foreign slot is refused instead of resuming something else', () => {
  const storage = fakeStorage();
  const runtime = createSimulation({storage: () => storage});

  storage.setItem(RESUMABLE_LIFE_KEY, 'not json');
  assert.equal(runtime.hasProgress(), false);
  assert.equal(runtime.loadProgress(), null);

  storage.setItem(RESUMABLE_LIFE_KEY, JSON.stringify({format: 'somebody-else', state: {}}));
  assert.equal(runtime.hasProgress(), true, 'the slot exists, so the UI may offer it');
  assert.equal(runtime.loadProgress(), null, 'but an unrecognised envelope is refused');
});

test('without a storage port the whole autosave path stays inert', () => {
  const runtime = createSimulation();
  assert.equal(runtime.hasProgress(), false);
  assert.equal(runtime.loadProgress(), null);
  const state = runtime.newLife({seed: 700005, pace: 'short'});
  assert.deepEqual(runtime.saveProgress(state), {saved: false, reason: 'unavailable'});
  assert.ok(runToYearBoundary(runtime, state, 2), 'missing storage must not disturb the simulation');
});

test('an unseeded life still gets a concrete seed, so it stays reproducible', () => {
  const runtime = createSimulation();
  runtime.newLife({pace: 'short'});
  const first = runtime.seed();
  assert.equal(typeof first, 'number', '"random" must mean a chosen seed, not a missing one');
  runtime.newLife({pace: 'short'});
  const second = runtime.seed();
  assert.equal(typeof second, 'number');
  assert.notEqual(second, first, 'two unseeded lives do not share a seed');
});
