import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contactRecord, createSimulation, leaveTerms, pensionTerms, promotionTerms,
  LEAVE_COOLDOWN_YEARS, REJECTION_COOLDOWN_YEARS, WAITLIST_COOLDOWN_YEARS
} from '../dist-runtime/simulation.mjs';

const policy = (extra = {}) => ({
  minServiceYears: 5, replacementRate: 0.6, minimumMonthlyRate: 0.45, ...extra
});

const leaveSubject = (extra = {}) => ({
  organization: 'rhine_life',
  reason: '离职',
  keepJob: false,
  retirement: false,
  preserveOperatorRank: false,
  job: 'researcher',
  orgJob: 'researcher',
  serviceYears: 8,
  rank: 2,
  age: 65,
  year: 1100,
  finalMonthlyPay: 4,
  nationPpp: 1,
  hasPension: false,
  ...extra
});

test('a pension pays the replacement rate or the national floor, whichever is higher', () => {
  const generous = pensionTerms(10, 8, 2, 65, policy(), 1);
  assert.equal(generous.monthlyAmount, 6, 'ten a month at 60% replacement');
  assert.equal(generous.minimumMonthlyAmount, 0.45);

  const floorBinds = pensionTerms(0.5, 8, 2, 65, policy(), 1);
  assert.equal(floorBinds.monthlyAmount, 0.45, 'a tiny pay still lands on the floor');
  assert.ok(floorBinds.monthlyAmount > floorBinds.finalMonthlyPay * 0.6);
});

test('a pension needs the policy and the minimum service', () => {
  assert.equal(pensionTerms(10, 8, 2, 65, null, 1), null, 'no policy, no pension');
  assert.equal(pensionTerms(10, 4, 2, 65, policy(), 1), null, 'four years is below the five-year floor');
  assert.notEqual(pensionTerms(10, 5, 2, 65, policy(), 1), null, 'five years is enough');
  assert.equal(pensionTerms(10, 8, 2, 65, policy({minServiceYears: undefined}), 1), null,
    'a policy without a minimum grants nothing, matching the original comparison');
});

test('the pension records what it was computed from', () => {
  const terms = pensionTerms(10, 8, 2, 65, policy(), 2);
  assert.deepEqual(terms, {
    serviceYears: 8,
    rank: 2,
    retiredAt: 65,
    finalMonthlyPay: 10,
    replacementRate: 0.6,
    minimumMonthlyAmount: 0.9,
    monthlyAmount: 6
  });
});

test('a negative or non-finite pay is treated as zero', () => {
  assert.equal(pensionTerms(-5, 8, 2, 65, policy(), 1).finalMonthlyPay, 0);
  assert.equal(pensionTerms(Number.NaN, 8, 2, 65, policy(), 1).finalMonthlyPay, 0);
  assert.equal(pensionTerms(Number.NaN, 8, 2, 65, policy(), 1).monthlyAmount, 0.45, 'the floor still applies');
});

test('only a retirement departure builds a pension, and only the first one', () => {
  assert.equal(leaveTerms(leaveSubject(), policy()).pension, null, 'a plain departure earns nothing');
  assert.notEqual(leaveTerms(leaveSubject({retirement: true}), policy()).pension, null);
  assert.notEqual(leaveTerms(leaveSubject({reason: '退休'}), policy()).pension, null,
    'the reason alone is enough');

  assert.equal(leaveTerms(leaveSubject({retirement: true, hasPension: true}), policy()).pension, null,
    'an existing pension is never overwritten — it may have been suspended and resumed since');
});

test('leaving always sets a three-year cooldown on that organization', () => {
  const terms = leaveTerms(leaveSubject({year: 1100}), policy());
  assert.equal(terms.cooldownYear, 1100 + LEAVE_COOLDOWN_YEARS);
  assert.equal(LEAVE_COOLDOWN_YEARS, 3);
  assert.equal(REJECTION_COOLDOWN_YEARS, 3);
  assert.equal(WAITLIST_COOLDOWN_YEARS, 1);
});

test('the job is reset only when it still matches the organization post', () => {
  assert.equal(leaveTerms(leaveSubject(), policy()).resetsJob, true);
  assert.equal(leaveTerms(leaveSubject({keepJob: true}), policy()).resetsJob, false,
    'keeping the job survives the departure');
  assert.equal(leaveTerms(leaveSubject({job: 'miner'}), policy()).resetsJob, false,
    'a different job is left alone');
  assert.equal(leaveTerms(leaveSubject({job: 'miner'}), policy()).keepsJob, false);
});

test('the operator grade is cleared at Rhodes Island unless preserved', () => {
  assert.equal(leaveTerms(leaveSubject({organization: 'rhodes'}), policy()).clearsOperatorRank, true);
  assert.equal(
    leaveTerms(leaveSubject({organization: 'rhodes', preserveOperatorRank: true}), policy()).clearsOperatorRank,
    false, 'a retirement keeps the operator grade'
  );
  assert.equal(leaveTerms(leaveSubject({organization: 'rhine_life'}), policy()).clearsOperatorRank, false,
    'other organizations have no operator grade to clear');
});

test('a promotion moves exactly one rank and mirrors it only at Rhodes Island', () => {
  assert.deepEqual(promotionTerms(0, 'rhine_life'), {rank: 1, mirrorsOperatorRank: false});
  assert.deepEqual(promotionTerms(3, 'rhodes'), {rank: 4, mirrorsOperatorRank: true});
});

test('a contact record keeps the first year and advances the rest', () => {
  const first = contactRecord(null, 'A', 'rhine_life', 1090);
  assert.deepEqual(first, {name: 'A', organization: 'rhine_life', firstYear: 1090, lastYear: 1090, count: 1});

  const again = contactRecord(first, 'A', 'rhine_life', 1094);
  assert.equal(again.firstYear, 1090, 'the first meeting never moves');
  assert.equal(again.lastYear, 1094);
  assert.equal(again.count, 2);
  assert.equal(first.count, 1, 'the previous record is not mutated');
});

test('the runtime applies the terms in the documented order', () => {
  // A retirement from Rhodes Island: the pension is built from the pay *before* the
  // post is cleared, the operator grade is preserved, and the cooldown is written.
  const TL = createSimulation();
  const S = TL.newLife({seed: 555001, nation: 'YAN', bornYear: 1025});
  Object.assign(S, {age: 40, year: 1100, eduLevel: 3, arts: 60});
  assert.ok(TL.joinOrganization(S, 'rhodes', 'operator'), 'joined');
  const operatorClass = S.opClass;
  assert.ok(operatorClass, 'the operator class was assigned on joining');

  S.orgService = 8;
  S.orgRank = 2;
  S.opRank = 2;
  TL.computeIncome(S);
  const pay = S.income;
  // Retirement age is reached after the pay is settled: `retire()` sets the identity
  // before the organization exit, which is what lets the pension be created legally.
  S.age = 66;

  assert.ok(TL.retire(S), 'retired');
  assert.equal(S.job, 'retired');
  assert.equal(S.affiliation, null, 'retirement ends the organization post');
  assert.ok(S.retirementPension, 'a pension was created');
  assert.equal(S.retirementPension.organization, 'rhodes');
  assert.equal(S.retirementPension.serviceYears, 8);
  assert.equal(S.retirementPension.rank, 2);
  assert.equal(S.retirementPension.finalMonthlyPay, Math.max(0, pay));
  assert.ok(S.retirementPension.monthlyAmount >= S.retirementPension.minimumMonthlyAmount,
    'the replacement rate never pays below the floor');
  assert.equal(S.opClass, operatorClass, 'a retirement departure preserves the operator grade');
  assert.equal(S.orgCooldowns.rhodes, S.year + LEAVE_COOLDOWN_YEARS);
});
