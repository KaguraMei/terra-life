import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import {
  createSimulation, serializeLife, restoreLife, validateLifeEnvelope, migrateLifeEnvelope,
  parseCompletedLifeRecords, SaveEnvelopeError, SaveSerializationError,
  SAVE_ENVELOPE_VERSION
} from '../dist-runtime/simulation.mjs';

/** Key-order independent digest: restoring must not depend on property insertion order. */
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
const CONTENT = { coreVersion: '0.1.0', packages: [] };
const RULESET = 1;

function step(runtime, state) {
  if (!state.focus) state.focus = runtime.autoFocus(state);
  runtime.tick(state, state.yearSec / 8);
  if (state.pending) runtime.autoChoose(state);
}

function finish(runtime, state) {
  let guard = 0;
  while (state.phase === 'life' && guard++ < 30000) step(runtime, state);
  assert.equal(state.phase, 'report', 'life should reach the report phase');
}

function advanceToAge(runtime, state, age) {
  let guard = 0;
  while (state.phase === 'life' && state.age < age && guard++ < 30000) step(runtime, state);
  assert.equal(state.phase, 'life', `life must still be running at age ${age}`);
  assert.equal(state.age, age, 'expected to reach the requested age');
}

function envelopeFor(runtime, state) {
  return serializeLife(state, {
    rulesetVersion: RULESET,
    contentLock: CONTENT,
    createdAt: new Date(0).toISOString(),
    random: runtime.randomSnapshot()
  });
}

test('a mid-life save resumed in a fresh runtime reproduces the same life and random stream', () => {
  const options = {seed: 700001, pace: 'short'};
  const reference = createSimulation();
  const referenceState = reference.newLife(options);
  advanceToAge(reference, referenceState, 40);
  finish(reference, referenceState);
  const expectedState = hash(referenceState);
  const expectedTail = Array.from({length: 8}, () => reference.rnd());

  const first = createSimulation();
  const paused = first.newLife(options);
  advanceToAge(first, paused, 40);
  // Force a real serialization round trip; the envelope must survive JSON.
  const bytes = JSON.stringify(envelopeFor(first, paused));
  assert.doesNotMatch(bytes, /"_def"|"_opts"/, 'closures must not reach the stored envelope');

  const second = createSimulation();
  const restored = restoreLife(second, JSON.parse(bytes), {
    expectedRulesetVersion: RULESET, expectedCoreVersion: CONTENT.coreVersion
  });
  assert.equal(hash(restored), hash(paused), 'restored state must equal the saved state');
  finish(second, restored);
  assert.equal(hash(restored), expectedState, 'continuing from a save must match an uninterrupted run');
  assert.deepEqual(Array.from({length: 8}, () => second.rnd()), expectedTail);
});

test('a save taken while a decision is pending restores the same options and the same future', () => {
  const options = {seed: 606021, pace: 'short'};
  const reference = createSimulation();
  const referenceState = reference.newLife(options);
  let guard = 0;
  // Tick without answering, so the paused decision is what gets captured.
  while (referenceState.phase === 'life' && !referenceState.pending && guard++ < 5000) {
    if (!referenceState.focus) referenceState.focus = reference.autoFocus(referenceState);
    reference.tick(referenceState, referenceState.yearSec / 8);
  }
  assert.ok(referenceState.pending, 'seed should produce a pending decision');

  const stored = JSON.parse(JSON.stringify(envelopeFor(reference, referenceState)));
  assert.equal(stored.interactions.pendingDecision.decisionId, referenceState.pending.id);

  const resumedRuntime = createSimulation();
  const resumed = restoreLife(resumedRuntime, stored, {expectedRulesetVersion: RULESET});
  assert.equal(resumed.pending.id, referenceState.pending.id, 'pending decision must identify the same definition');
  assert.equal(resumed.pending.options.length, referenceState.pending.options.length);
  assert.deepEqual(resumed.pending.options.map(item => item.label),
    referenceState.pending.options.map(item => item.label));

  reference.choose(referenceState, 0);
  resumedRuntime.choose(resumed, 0);
  assert.equal(hash(resumed), hash(referenceState), 'choosing the restored option must be equivalent');
  finish(reference, referenceState);
  finish(resumedRuntime, resumed);
  assert.equal(hash(resumed), hash(referenceState));
});

test('envelopes refuse non-JSON state instead of dropping it silently', () => {
  const runtime = createSimulation();
  // A resumable envelope needs a seeded random stream; native entropy has no position.
  assert.equal(runtime.randomSnapshot(), null);
  runtime.seedRng(20261021);
  const random = runtime.randomSnapshot();
  const context = {rulesetVersion: RULESET, contentLock: CONTENT, createdAt: new Date(0).toISOString(), random};

  assert.throws(() => serializeLife({phase: 'life', broken() {}}, context), error => {
    assert.ok(error instanceof SaveSerializationError);
    assert.ok(error.diagnostics.some(item => item.code === 'value.function' && item.path === 'broken'));
    return true;
  });
  assert.throws(() => serializeLife({phase: 'report', age: 70}, context), /completed life is stored as a summary/);

  const circular = {phase: 'life', self: null};
  circular.self = circular;
  assert.throws(() => serializeLife(circular, context), error =>
    error.diagnostics.some(item => item.code === 'value.cycle'));

  assert.throws(() => serializeLife({phase: 'life', money: Number.NaN}, context), error =>
    error.diagnostics.some(item => item.code === 'value.not-finite' && item.path === 'money'));

  assert.throws(() => serializeLife({phase: 'life'}, {...context, random: null}), /random snapshot/);
});

test('broken or foreign envelopes are rejected with diagnostics, never repaired', () => {
  const invalid = [
    null,
    {},
    {format: 'terra-life-save', envelopeVersion: 99, rulesetVersion: 1, contentLock: CONTENT,
      createdAt: new Date(0).toISOString(), state: {}, random: {}, interactions: {}}
  ];
  assert.ok(validateLifeEnvelope(invalid[0]).some(item => item.code === 'envelope.not-object'));
  assert.ok(validateLifeEnvelope(invalid[1]).some(item => item.code === 'envelope.format'));
  assert.ok(validateLifeEnvelope(invalid[2]).some(item => item.code === 'envelope.version'));

  const runtime = createSimulation();
  assert.throws(() => restoreLife(runtime, {format: 'terra-life-save', envelopeVersion: 99}), SaveEnvelopeError);

  const options = {seed: 707001, pace: 'short'};
  const source = createSimulation();
  const life = source.newLife(options);
  advanceToAge(source, life, 30);
  const stored = JSON.parse(JSON.stringify(envelopeFor(source, life)));
  assert.throws(() => restoreLife(createSimulation(), stored, {expectedRulesetVersion: RULESET + 1}),
    error => error instanceof SaveEnvelopeError && error.diagnostics.some(item => item.code === 'ruleset.mismatch'));
  assert.throws(() => restoreLife(createSimulation(), stored, {expectedCoreVersion: '9.9.9'}),
    error => error instanceof SaveEnvelopeError && error.diagnostics.some(item => item.code === 'content.mismatch'));
});

test('the migration chain upgrades a document instead of only checking its version', () => {
  const source = createSimulation();
  const life = source.newLife({seed: 700001, pace: 'short'});
  advanceToAge(source, life, 20);
  const current = JSON.parse(JSON.stringify(envelopeFor(source, life)));

  // Pretend an older build wrote this: version 0, before content packs existed.
  const legacy = {...current, envelopeVersion: 0, contentLock: {coreVersion: current.contentLock.coreVersion}};
  assert.throws(() => migrateLifeEnvelope(legacy),
    error => error instanceof SaveEnvelopeError &&
      error.diagnostics.some(item => item.code === 'envelope.version-unsupported'),
    'without a registered step the chain refuses');

  const step = raw => ({...raw, envelopeVersion: SAVE_ENVELOPE_VERSION,
    contentLock: {...raw.contentLock, packages: []}});
  const migrated = migrateLifeEnvelope(legacy, {0: step});
  assert.equal(migrated.envelopeVersion, SAVE_ENVELOPE_VERSION);
  assert.equal(JSON.stringify(migrated.contentLock.packages), '[]');
  assert.deepEqual(validateLifeEnvelope(migrated), [], 'the migrated envelope is valid');
  assert.ok(restoreLife(createSimulation(), migrated, {expectedRulesetVersion: RULESET}),
    'and it can actually be restored');

  // A step that forgets to bump the version must fail, not spin forever.
  assert.throws(() => migrateLifeEnvelope(legacy, {0: raw => ({...raw, envelopeVersion: 0})}),
    error => error instanceof SaveEnvelopeError &&
      error.diagnostics.some(item => item.code === 'envelope.migration-loop'));
});

test('completed-life summaries keep reading both store layouts and drop corrupt rows', () => {
  const current = JSON.stringify([
    {v: 1, t: 1, name: 'A', nation: '乌萨斯', race: '乌萨斯', age: 61, cause: '疾病', seed: 12, setup: {bornYear: 1050}},
    {v: 1, t: 2, name: 'broken'}
  ]);
  const legacy = JSON.stringify([{t: 3, name: 'B', nation: '炎', race: '菲林', age: 44, cause: '事故', seed: 7}]);
  assert.equal(parseCompletedLifeRecords(current).length, 1, 'invalid rows are dropped');
  assert.equal(parseCompletedLifeRecords(current)[0].legacy, false);
  const migrated = parseCompletedLifeRecords(legacy);
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].legacy, true, 'pre-namespace summaries stay marked');
  assert.equal(migrated[0].age, 44);
  assert.deepEqual(parseCompletedLifeRecords('not json'), []);
  assert.deepEqual(parseCompletedLifeRecords(null), []);
});
