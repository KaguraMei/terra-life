import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createLifeGuards, stateInvariantViolations, formatViolations,
  StateInvariantError
} from '../dist-runtime/simulation.mjs';

const registry = {
  organizations: {
    rhine: {routes: {research: {}}},
    rhodes: {routes: {operator: {}}}
  },
  jobs: {scholar: {}, miner: {}},
  nonWork: ['retired', 'seeking', 'child', 'student', 'slave']
};

const consistent = () => ({
  phase: 'life', age: 30, year: 1090, nation: 'CLB', job: 'scholar',
  affiliation: null, orgJob: null, orgRoute: null, orgRank: 0, orgService: 0,
  flags: {}, orgHistory: [], money: 100, debt: 0, income: 2
});

const employed = () => {
  const state = consistent();
  Object.assign(state, {
    affiliation: 'rhine', orgRoute: 'research', orgJob: 'scholar', orgRank: 1, orgService: 4,
    orgHistory: [{
      organization: 'rhine', route: 'research', rank: 1, serviceYears: 4,
      promotions: [], leftAt: null, leftYear: null, reason: null
    }]
  });
  return state;
};

const codes = state => stateInvariantViolations(state, registry).map(item => item.code);

test('a consistent life state has no violations', () => {
  assert.deepEqual(stateInvariantViolations(consistent(), registry), []);
  assert.deepEqual(stateInvariantViolations(employed(), registry), []);
});

test('employment, retirement and pension relations are reported by code and path', () => {
  const noJob = employed();
  noJob.job = 'seeking';
  assert.ok(codes(noJob).includes('identity.affiliation-requires-job'));

  const retiredWithJob = consistent();
  retiredWithJob.flags = {retired: true};
  assert.deepEqual(codes(retiredWithJob), ['career.retired-flag-job-mismatch']);

  const retiredAndSeeking = consistent();
  Object.assign(retiredAndSeeking, {job: 'seeking', flags: {retired: true}});
  assert.ok(codes(retiredAndSeeking).includes('career.retired-marked-seeking'));

  const jobWithoutFlag = consistent();
  jobWithoutFlag.job = 'retired';
  assert.deepEqual(codes(jobWithoutFlag), ['career.retired-job-flag-mismatch']);

  const retained = employed();
  Object.assign(retained, {job: 'retired', flags: {retired: true}});
  assert.ok(codes(retained).includes('career.retired-retains-affiliation'));

  const orphanPension = consistent();
  orphanPension.retirementPension = {organization: 'rhine', monthlyAmount: 3};
  assert.ok(codes(orphanPension).includes('pension.without-retirement'));

  const badPension = consistent();
  Object.assign(badPension, {job: 'retired', flags: {retired: true},
    retirementPension: {organization: 'gone', monthlyAmount: -1}});
  assert.ok(codes(badPension).includes('pension.amount-invalid'));
  assert.ok(codes(badPension).includes('pension.organization-unresolved'));
});

test('history closure, unknown references and vocabulary are checked', () => {
  const halfClosed = employed();
  halfClosed.orgHistory[0].leftYear = 1092;
  // Half-closing also drops the entry out of the open set, so the active
  // membership no longer has a matching open history row.
  assert.deepEqual(codes(halfClosed).sort(),
    ['career.history-partial-close', 'career.open-history-mismatch']);

  const dangling = employed();
  dangling.affiliation = 'ghost';
  // The route still exists under the recorded membership, so only the unknown
  // organization and the membership mismatch are reported.
  assert.deepEqual(codes(dangling).sort(),
    ['career.open-history-mismatch', 'identity.affiliation-unknown-organization']);

  const unknownJob = consistent();
  unknownJob.job = 'wizard';
  assert.deepEqual(codes(unknownJob), ['identity.unknown-job']);

  const openAfterLeaving = employed();
  openAfterLeaving.affiliation = null;
  openAfterLeaving.orgJob = null;
  openAfterLeaving.orgRoute = null;
  assert.deepEqual(codes(openAfterLeaving), ['career.departure-history-open']);
});

test('health ranges and finite economy fields are enforced', () => {
  const sick = consistent();
  sick.ori = {stage: 4, crystal: 120};
  assert.deepEqual(new Set(codes(sick)), new Set(['health.stage-out-of-range', 'health.crystal-out-of-range']));

  const broke = consistent();
  broke.money = Number.POSITIVE_INFINITY;
  assert.deepEqual(codes(broke), ['economy.field-not-finite']);
});

test('the transition guard names the transition and honours declared deferrals', () => {
  const guards = createLifeGuards(registry);
  const state = employed();
  state.job = 'retired';
  state.flags.retired = true;

  assert.throws(() => guards.commit('retire', state, () => 'ok'), error => {
    assert.ok(error instanceof StateInvariantError);
    assert.match(error.message, /Transition "retire"/);
    assert.ok(error.violations.some(item => item.code === 'career.retired-retains-affiliation'));
    return true;
  });

  // The annual pipeline legitimately leaves these relations transient for one
  // commit; unrelated violations would still fail the same transition.
  const value = guards.commit('retire', state, () => 'deferred', {
    deferred: ['career.retired-retains-affiliation', 'identity.affiliation-requires-job']
  });
  assert.equal(value, 'deferred');

  const healthy = employed();
  assert.equal(guards.commit('joinOrganization', healthy, () => true), true);
  assert.deepEqual(guards.violations(healthy), []);
});

test('violation rendering keeps codes and paths for diagnostics', () => {
  const state = consistent();
  state.job = 'wizard';
  const rendered = formatViolations(stateInvariantViolations(state, registry));
  assert.match(rendered, /\[identity\.unknown-job\] job:/);
});
