import assert from 'node:assert/strict';
import test from 'node:test';
import {createEventEngine, createRandom} from '../dist-runtime/simulation.mjs';
import {simulation} from '../tools/sim-context.mjs';

/** Minimal kernel harness: one event that mutates, draws and then throws. */
function harness({withRandom = true} = {}) {
  const random = createRandom(4242);
  const failures = [];
  const state = {
    age: 30, phase: 'life', t: 0.2, speed: 1, yearSec: 1, paused: false, pending: null,
    focus: 'work', fT: {}, queue: [], actEvent: null, flags: {}, evCount: {}, recent: [],
    money: 100, st: {hl: 50, h: 50, sm: 50, so: 50}, log: []
  };
  const definitions = {
    broken: {
      book: 'probe',
      run(target) {
        target.money += 999;
        target.st.h = 1;
        target.log.push({text: 'half applied'});
        random.next();
        random.next();
        throw new Error('boom');
      }
    },
    fine: {run(target) { target.money += 5; return 'ok'; }}
  };
  const engine = createEventEngine({
    random: () => random.next(),
    definition: id => definitions[id],
    blocked: () => false,
    available: (_s, definition) => Boolean(definition),
    netWorth: () => 0,
    book() {}, log() {}, milestone() {}, decision() {}, catastrophe() {},
    sync() {}, endYear() {}, error: failure => failures.push(failure),
    ...(withRandom ? {
      randomCheckpoint: () => random.snapshot(),
      randomRestore: checkpoint => random.restore(checkpoint)
    } : {})
  });
  return {engine, state, failures, random, definitions};
}

test('a throwing event leaves no partial state and no shifted random stream', () => {
  const x = harness();
  const before = JSON.parse(JSON.stringify(x.state));
  const beforeRandom = x.random.snapshot();
  const expectedTail = Array.from({length: 6}, () => x.random.next());
  x.random.restore(beforeRandom);

  assert.equal(x.engine.fire(x.state, {at: 0.2, type: 'ev', id: 'broken'}), 'failed');
  assert.deepEqual(JSON.parse(JSON.stringify(x.state)), before,
    'money, attributes, log and counters must all be restored');
  assert.equal(x.state.evCount.broken, undefined, 'a failed event is not counted');
  assert.equal(x.state.actEvent, null);
  assert.deepEqual(x.random.snapshot(), beforeRandom, 'the failed event must not consume randomness');
  assert.deepEqual(Array.from({length: 6}, () => x.random.next()), expectedTail);

  assert.equal(x.failures.length, 1);
  assert.equal(x.failures[0].eventId, 'broken');
  assert.equal(x.failures[0].rollback, 'full');
});

test('without random hooks the failure is reported as state-only', () => {
  const x = harness({withRandom: false});
  const before = JSON.parse(JSON.stringify(x.state));
  assert.equal(x.engine.fire(x.state, {at: 0.2, type: 'ev', id: 'broken'}), 'failed');
  assert.deepEqual(JSON.parse(JSON.stringify(x.state)), before);
  assert.equal(x.failures[0].rollback, 'state-only');
});

test('a pending interaction disables rollback instead of pretending', () => {
  const x = harness();
  x.state.pending = {id: 'something', _def: {}, _opts: []};
  assert.equal(x.engine.fire(x.state, {at: 0.2, type: 'ev', id: 'broken'}), 'failed');
  assert.equal(x.failures[0].rollback, 'none',
    'closures cannot be snapshotted, so the kernel must say so');
});

test('a successful event still commits and is counted', () => {
  const x = harness();
  assert.equal(x.engine.fire(x.state, {at: 0.2, type: 'ev', id: 'fine'}), 'executed');
  assert.equal(x.state.money, 105);
  assert.equal(x.state.evCount.fine, 1);
  assert.equal(x.failures.length, 0);
});

test('the assembled runtime rolls back a broken event for real', () => {
  const captured = [];
  const {TL} = simulation({log() {}, warn() {}, error(...args) { captured.push(args.map(String).join(' ')); }});
  TL.EVMAP.probe_rollback = {
    title: '探针', book: '探针', w: 1,
    run(state) {
      state.money += 999;
      state.st.h = 1;
      state.log.push({age: state.age, year: state.year, text: '半次写入', kind: 'ev'});
      TL.rnd();
      TL.rnd();
      throw new Error('probe failure');
    }
  };

  const state = TL.newLife({seed: 6060, nation: 'URS', race: 'ursus', bornYear: 1070});
  Object.assign(state, {age: 30, year: 1100, job: 'miner', flags: {}, evCount: {}});
  TL.seedRng(7373);
  const before = JSON.parse(JSON.stringify(state));
  const beforeRandom = TL.randomSnapshot();
  const expectedTail = Array.from({length: 6}, () => TL.rnd());
  TL.restoreRandom(beforeRandom);

  assert.equal(TL.fire(state, {type: 'ev', id: 'probe_rollback'}), 'failed');
  assert.deepEqual(JSON.parse(JSON.stringify(state)), before);
  assert.equal(state.evCount.probe_rollback, undefined);
  assert.deepEqual(TL.randomSnapshot(), beforeRandom);
  assert.deepEqual(Array.from({length: 6}, () => TL.rnd()), expectedTail);
  assert.ok(captured.some(line => line.includes('probe_rollback')),
    'the failure is reported through the error port');
});
