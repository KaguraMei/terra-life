import assert from 'node:assert/strict';
import test from 'node:test';
import {createSimulation} from '../dist-runtime/simulation.mjs';
import {simulation} from '../tools/sim-context.mjs';

/** A working, employed life at an organization, so identity transitions have a subject. */
function employed(seed = 700001) {
  const {TL} = simulation({log() {}, warn() {}, error(...args) { throw new Error(args.map(String).join(' ')); }});
  const organization = TL.organizationDef('rhine_life');
  const routeId = Object.keys(organization.routes)[0];
  const route = organization.routes[routeId];
  const year = Math.max(organization.fromYear, route.fromYear || 0, 1094);
  const state = TL.newLife({seed, nation: organization.nations?.[0] || 'KDZ', race: 'sarkaz', bornYear: year - 30});
  Object.assign(state, {
    age: 30, year, school: null, eduLevel: 4, q: 4, arts: 95, serveLeft: 0,
    job: route.jobs?.[0] || 'op_guard', queue: [], t: 0, pending: null, affiliation: null,
    orgHistory: [], orgContacts: {}, orgCooldowns: {}, flags: {},
    st: {hl: 95, h: 70, sm: 95, so: 95}, evCount: {}, recent: []
  });
  assert.ok(TL.joinOrganization(state, 'rhine_life', routeId), 'fixture joins the organization');
  assert.equal(state.affiliation, 'rhine_life');
  return {TL, state};
}

test('being dismissed from an organization post ends the membership too', () => {
  const {TL, state} = employed();
  assert.ok(TL.dismissFromJob(state, '被辞退'));

  assert.equal(state.affiliation, null, 'no organization identity is left behind');
  assert.equal(state.job, 'seeking');
  assert.equal(state.orgJob, null);
  assert.equal(state.orgRank, 0);
  assert.deepEqual(Array.from(TL.stateInvariantViolations(state)), [],
    'the post-state satisfies every invariant');

  const closed = state.orgHistory.at(-1);
  assert.equal(closed.reason, '被辞退', 'the history row records why it ended');
  assert.equal(closed.leftYear, state.year);
  assert.equal(state.orgCooldowns.rhine_life, state.year + 3, 'a cooldown is set like any other departure');
});

test('dismissal without an organization only rewrites the job', () => {
  const {TL} = simulation({log() {}, warn() {}, error() {}});
  const state = TL.newLife({seed: 700002, pace: 'short'});
  Object.assign(state, {age: 40, job: 'miner', affiliation: null, flags: {}, orgHistory: []});

  assert.ok(TL.dismissFromJob(state));
  assert.equal(state.job, 'seeking');
  assert.equal(state.flags.lastJob, 'miner', 'the previous job stays recorded for later events');
  assert.deepEqual(Array.from(TL.stateInvariantViolations(state)), []);
});

test('retirement is not dismissible, and coerced labour suspends the pension instead of orphaning it', () => {
  const {TL, state} = employed(700003);

  state.age = 65;
  state.orgService = 20; // long enough to qualify for the organization's pension
  assert.ok(TL.retire(state, {}), 'retirement needs the retirement age');
  assert.equal(state.job, 'retired');
  assert.ok(state.retirementPension, 'retiring from an organization grants a pension');
  assert.equal(TL.canBeDismissed(state), false, 'a retiree is not an ordinary dismissal target');
  assert.equal(TL.dismissFromJob(state), false);
  assert.equal(state.job, 'retired', 'the refusal leaves the identity untouched');

  // Coerced labour replaces the retirement identity; the entitlement survives as suspended.
  assert.ok(TL.enterCoercedLabour(state, 'slave'));
  assert.equal(state.job, 'slave');
  assert.equal(state.flags.retired, false);
  assert.equal(state.retirementPension.suspendedAt, state.age, 'the pension records when it stopped');
  assert.deepEqual(Array.from(TL.stateInvariantViolations(state)), [],
    'a suspended pension without the retirement identity is consistent');

  // Regaining the retirement identity resumes the same entitlement.
  state.age = 66;
  assert.ok(TL.retire(state, {}));
  assert.equal(state.retirementPension.suspendedAt, undefined, 'the suspension is lifted');
  assert.equal(state.retirementPension.resumedAt, 66);
  assert.deepEqual(Array.from(TL.stateInvariantViolations(state)), []);
});

test('coerced labour on an employed member ends the organization identity', () => {
  const {TL, state} = employed(700004);
  assert.ok(TL.enterCoercedLabour(state, 'prison'));
  assert.equal(state.job, 'prison');
  assert.equal(state.affiliation, null);
  assert.equal(state.flags.slaveAt, state.age);
  assert.deepEqual(Array.from(TL.stateInvariantViolations(state)), []);
});

test('the lives that exposed the old inconsistencies now run clean', () => {
  const runtime = createSimulation();
  const errors = [];
  const realError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(' '));
  const finish = state => {
    let guard = 0;
    while (state.phase === 'life' && guard++ < 40000) {
      if (!state.focus) state.focus = runtime.autoFocus(state);
      runtime.tick(state, state.yearSec / 8);
      if (state.pending) runtime.autoChoose(state);
    }
  };
  try {
    // 970888 lost a pension to coerced labour and then retired again; 810012 was
    // dismissed from an organization post and kept the affiliation.
    for (let i = 0; i < 60; i++) finish(runtime.newLife({seed: 970840 + i, pace: 'short'}));
    for (const seed of [810012, 970888]) finish(runtime.newLife({seed, pace: 'short'}));
  } finally {
    console.error = realError;
  }
  assert.deepEqual(errors, [], 'no transition or dispatch reported an inconsistent state');
});
