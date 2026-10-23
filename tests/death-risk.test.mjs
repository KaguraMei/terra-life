import assert from 'node:assert/strict';
import test from 'node:test';
import {causeWeights, deathRisk, pickCause, subjectFromState} from '../dist-runtime/simulation.mjs';

const baseLife = overrides => ({
  age: 40, nation: 'KDZ', stratum: 'industrial', sex: 'M', race: 'feline', year: 1066,
  q: 3, pct: 0.5, flags: {}, st: {hl: 70}, fam: {}, conds: {}, arts: 0, job: 'worker',
  ...overrides
});

test('the subject contract treats legacy 1/0 flags as booleans', () => {
  // Real saves store these as 1 rather than true; comparing with === true silently
  // dropped them once, which changed 2% of the annual risk.
  const subject = subjectFromState(baseLife({
    smoker: 1,
    flags: {exSmoker: 1, careerPct: 0},
    drug: 0,
    alc: 1,
    refugee: 0,
    traits: {underwaterBreathing: 1},
    conds: {htn: {treated: 1}, dm: {treated: 0}}
  }));
  assert.equal(subject.smoker, true);
  assert.equal(subject.exSmoker, true);
  assert.equal(subject.drug, false);
  assert.equal(subject.alcohol, true);
  assert.equal(subject.refugee, false);
  assert.equal(subject.underwaterBreathing, true);
  assert.equal(subject.conditions.htn.treated, true);
  assert.equal(subject.conditions.dm.treated, false);
});

test('unknown input yields an inert subject rather than throwing', () => {
  const subject = subjectFromState(undefined);
  assert.equal(subject.age, 0);
  assert.equal(subject.ori, null);
  assert.deepEqual(subject.conditions, {});
  assert.equal(subjectFromState(null).familyTier, 0);
});

test('terminal crystallization is a certain death', () => {
  const state = baseLife({ori: {stage: 2, crystal: 100, at: 30, treated: false, art: false}});
  assert.equal(deathRisk({subject: subjectFromState(state), table: fakeTable(), ports: fakePorts(), state}), 1);
  assert.equal(pickCause(subjectFromState(state), 40, false, fakePorts()), 'ori');
});

test('the annual risk rises with worse health and falls with better health', () => {
  const weak = baseLife({st: {hl: 40}});
  const strong = baseLife({st: {hl: 90}});
  const riskOf = state => deathRisk({subject: subjectFromState(state), table: fakeTable(), ports: fakePorts(), state});
  assert.ok(riskOf(weak) > riskOf(baseLife()));
  assert.ok(riskOf(strong) < riskOf(baseLife()));
});

test('cause weights stay positive and expand the legacy residual bucket', () => {
  const state = baseLife();
  const weights = causeWeights(subjectFromState(state), 40, false, fakePorts());
  for (const [key, value] of Object.entries(weights)) {
    assert.ok(value > 0, `${key} must be positive after filtering`);
  }
  assert.equal(weights.ocd, undefined, 'the residual bucket never reaches the draw');
  assert.ok(Object.keys(weights).length >= 3);
});

test('coastal causes follow the nation, not the race', () => {
  const ports = fakePorts();
  const inland = causeWeights(subjectFromState(baseLife({nation: 'KDZ'})), 30, false, ports);
  assert.equal(inland.sea, undefined, 'a landlocked nation never drowns in 海嗣');
  assert.equal(inland.heat, undefined, 'heat is dropped outside the hot nations');
  assert.equal(inland.cold, undefined, 'cold is dropped outside the cold nations');

  const coast = causeWeights(subjectFromState(baseLife({nation: 'AEG'})), 30, false, ports);
  assert.ok((coast.sea || 0) > 0);
});

test('only the underwater-breathing trait exempts an Aegir from drowning', () => {
  const ports = fakePorts();
  const plain = subjectFromState(baseLife({nation: 'AEG', race: 'aegir', stratum: 'fringe'}));
  const adapted = subjectFromState(baseLife({
    nation: 'AEG', race: 'aegir', stratum: 'fringe', traits: {underwaterBreathing: true}
  }));
  assert.ok((causeWeights(plain, 30, false, ports).drown || 0) > 0, 'an Aegir without the trait can drown');
  assert.equal(causeWeights(adapted, 30, false, ports).drown, undefined, 'the trait removes the cause');
});

/* --- minimal ports: just enough content for the model to run -------------- */
function fakeTable() {
  const q = new Float64Array(101).fill(0.01);
  q[100] = 1;
  return {q, l: new Float64Array(102).fill(1), e0: 60, maxAge: 100, lifeMax: [80, 100],
    socialLE: 60, g: 0.1, A0: 1e-5, Aext: 0.01, stratum: 'industrial', race: 'feline', court: null};
}
function fakePorts() {
  const nation = id => ({
    id, reg: id === 'AEG' ? 'sea' : 'core', gap: 5, im: 20, u5: 25, ori: 1, cat: 1, hom: 3, road: 12,
    smk: 20, war: 0
  });
  return {
    nation,
    causeTable: () => ({ihd: 30, can: 20, inf: 10, ocd: 40}),
    timelineMods: () => ({war: 0, cat: 0, ori: 0, tol: 0, mort: 1}),
    tolerance: () => ({arrest: 0, lifeK: 1}),
    jobRisk: () => undefined,
    discrimination: () => 0.2,
    pickWeighted: weights => Object.keys(weights)[0],
    clamp: (value, low, high) => Math.min(high, Math.max(low, value)),
    causes: {},
    incomeGradient: () => 0.28
  };
}
