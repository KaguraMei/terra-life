import assert from 'node:assert/strict';
import test from 'node:test';
import {createSimulation, deriveSessionView} from '../dist-runtime/simulation.mjs';

function advance(runtime, state, steps) {
  for (let i = 0; i < steps && state.phase === 'life'; i++) {
    if (!state.focus) state.focus = runtime.autoFocus(state);
    runtime.tick(state, state.yearSec / 4);
    if (state.pending) runtime.autoChoose(state);
  }
  return state;
}

test('the session view agrees with the run loop state it projects', () => {
  const runtime = createSimulation();
  for (const seed of [701001, 701002, 701003]) {
    const state = advance(runtime, runtime.newLife({seed, pace: 'short'}), 40);
    const session = deriveSessionView(state);

    assert.equal(session.phase, state.phase === 'life' ? 'life' : 'report');
    assert.equal(session.age, state.age);
    assert.equal(session.pacing.progress, Math.min(1, Math.max(0, state.t)));
    assert.equal(session.pacing.yearSeconds, state.yearSec);
    assert.equal(session.pacing.paused, state.paused === true);
    assert.equal(session.pacing.speed, state.speed);
    assert.equal(session.decision.open, state.pending !== null);
    assert.equal(session.decision.id, state.pending ? state.pending.id : null);
    assert.equal(session.seed, state.flags.seed ?? null);
  }
});

test('the session view is inert on unknown input and never mutates state', () => {
  const empty = deriveSessionView({});
  assert.equal(empty.phase, 'other');
  assert.equal(empty.decision.open, false);
  assert.equal(empty.seed, null);
  assert.equal(deriveSessionView(null).phase, 'other');

  const runtime = createSimulation();
  const state = advance(runtime, runtime.newLife({seed: 701010, pace: 'short'}), 12);
  const before = JSON.stringify(state);
  const first = deriveSessionView(state);
  const second = deriveSessionView(state);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), JSON.parse(JSON.stringify(second)));
  assert.equal(JSON.stringify(state), before, 'deriving never touches the life');

  // An open decision is reported as open, and closing it is visible immediately.
  const paused = runtime.newLife({seed: 701011, pace: 'short'});
  runtime.openDecision ? runtime.openDecision(paused, null) : null;
  paused.pending = {id: 'probe', title: 't', options: []};
  assert.equal(deriveSessionView(paused).decision.open, true);
  assert.equal(deriveSessionView(paused).decision.id, 'probe');
  paused.pending = null;
  assert.equal(deriveSessionView(paused).decision.open, false);
});
