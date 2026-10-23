import assert from 'node:assert/strict';
import test from 'node:test';
import { incomePercentile, incomeSubject, monthlyIncome } from '../dist-runtime/simulation.mjs';

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

const ports = ({ppp = 1, opPay = 2, payMultiplier = 1, discrimination = 0} = {}) => ({
  nation: () => ({ppp}),
  opPay: () => opPay,
  jobPayMultiplier: () => payMultiplier,
  discrimination: () => discrimination,
  clamp
});

const subject = (extra = {}) => ({
  nation: 'X',
  job: 'miner',
  age: 18,
  eduLevel: 0,
  knowledge: 0,
  familyTier: 3,
  opRank: 0,
  oriStage: 0,
  pensionAmount: null,
  graded: false,
  hasJob: true,
  jobLo: 0.2,
  jobHi: 1.0,
  ...extra
});

test('a wage band is interpolated by schooling, experience and knowledge', () => {
  const fresh = monthlyIncome({}, subject(), ports());
  assert.equal(fresh, 0.2, 'a school-leaver sits at the bottom of the band');

  const veteran = monthlyIncome({}, subject({age: 48, eduLevel: 4, knowledge: 100}), ports());
  assert.equal(veteran, 1.0, 'experience plus schooling plus knowledge reaches the top');

  // Each input moves the interpolation independently.
  const older = monthlyIncome({}, subject({age: 33}), ports());
  const schooled = monthlyIncome({}, subject({eduLevel: 2}), ports());
  const learned = monthlyIncome({}, subject({knowledge: 50}), ports());
  assert.ok(older > fresh && schooled > fresh && learned > fresh);
  assert.ok(veteran > older && veteran > schooled && veteran > learned);
});

test('operator grade and organisation pay multiply the band', () => {
  const plain = monthlyIncome({}, subject(), ports({opPay: 2}));
  assert.equal(monthlyIncome({}, subject({graded: true, opRank: 2}), ports({opPay: 2})), plain * 2);
  assert.equal(
    monthlyIncome({}, subject({graded: false, opRank: 2}), ports({opPay: 2})), plain,
    'an ungraded career ignores the operator rank'
  );
  assert.equal(
    monthlyIncome({}, subject({graded: true, opRank: 0}), ports({opPay: 2})), plain,
    'rank zero pays no grade multiplier'
  );
  assert.equal(monthlyIncome({}, subject(), ports({payMultiplier: 1.5})), plain * 1.5);
});

test('a locked pension is paid as-is and never re-discounted', () => {
  const retired = subject({
    job: 'retired', hasJob: false, pensionAmount: 3, familyTier: 1, oriStage: 3
  });
  const hostile = ports({discrimination: 0.9});
  assert.equal(monthlyIncome(hostile, retired, ports()), 3, 'the pension already paid every factor');

  const unsupported = subject({job: 'retired', hasJob: false});
  assert.equal(monthlyIncome({}, unsupported, ports()), 0.45, 'no pension falls back to 0.45 of output');
  assert.ok(
    monthlyIncome({}, unsupported, ports({discrimination: 0.5})) < 0.45,
    'the fallback still suffers discrimination'
  );
});

test('child, student and unknown careers fall back to fixed shares of output', () => {
  assert.equal(monthlyIncome({}, subject({job: 'child', hasJob: false}), ports()), 0.10);
  assert.equal(monthlyIncome({}, subject({job: 'student', hasJob: false}), ports()), 0.10);
  assert.equal(monthlyIncome({}, subject({job: 'idle', hasJob: false}), ports()), 0.25);
});

test('discrimination and family inertia apply only to non-pension income', () => {
  const base = monthlyIncome({}, subject(), ports());

  const biased = monthlyIncome({}, subject(), ports({discrimination: 0.5}));
  assert.equal(biased, base * (1 - 0.5 * 0.42));

  const infected = monthlyIncome({}, subject({oriStage: 2}), ports());
  assert.equal(infected, base * (1 - 0.22 * 0.42), 'infection adds a flat 22 points of discrimination');

  const capped = monthlyIncome({}, subject({oriStage: 3}), ports({discrimination: 0.9}));
  assert.equal(capped, base * (1 - 0.75 * 0.42), 'the penalty is capped at 0.75');

  const poor = monthlyIncome({}, subject({familyTier: 1}), ports());
  const rich = monthlyIncome({}, subject({familyTier: 5}), ports());
  assert.equal(poor, base * (1 - 2 * 0.06));
  assert.equal(rich, base * (1 + 2 * 0.06));
});

test('income never goes negative', () => {
  assert.equal(
    monthlyIncome({}, subject({pensionAmount: 0, job: 'retired', hasJob: false}), ports()), 0,
    'a zeroed pension pays nothing'
  );
  assert.equal(
    monthlyIncome({}, subject({pensionAmount: 0, job: 'retired', hasJob: false}),
      ports({discrimination: 1})), 0
  );
});

test('the percentile improves with income and ignores the direction of rations', () => {
  assert.equal(incomePercentile(0.05, 0, clamp), 0, 'the low anchor is exactly zero');
  assert.ok(Math.abs(incomePercentile(15, 0, clamp) - 1) < 1e-12, 'the high anchor is exactly one');
  assert.ok(Math.abs(incomePercentile(0.5, 0, clamp) - 0.4039) < 0.001, 'the median lands near 40%');

  assert.ok(incomePercentile(1, 0, clamp) > incomePercentile(0.5, 0, clamp));
  assert.ok(incomePercentile(0.5, 120, clamp) > incomePercentile(0.5, 0, clamp), 'rations lift the percentile');
  assert.equal(incomePercentile(0, 0, clamp), 0, 'the floor is the anchor, not a negative');
  assert.equal(incomePercentile(100, 0, clamp), 1);
});

test('the income subject normalises a life without reading anything else', () => {
  const job = {lo: 0.3, hi: 0.9, graded: true};
  const view = incomeSubject({
    nation: 'Yan', job: 'retired', age: 61, eduLevel: 3, q: 4, opRank: 2,
    st: {sm: 55}, ori: {stage: 2}, retirementPension: {monthlyAmount: 2.5}
  }, job);

  assert.equal(view.knowledge, 55);
  assert.equal(view.oriStage, 2);
  assert.equal(view.familyTier, 4);
  assert.equal(view.pensionAmount, 2.5);
  assert.equal(view.hasJob, true);
  assert.equal(view.graded, true);
  assert.equal(view.jobLo, 0.3);
});

test('only a retired life with a finite pension gets a locked amount', () => {
  assert.equal(incomeSubject({job: 'miner', retirementPension: {monthlyAmount: 2}}, null).pensionAmount, null);
  assert.equal(incomeSubject({job: 'retired'}, null).pensionAmount, null);
  assert.equal(incomeSubject({job: 'retired', retirementPension: {}}, null).pensionAmount, null);
  assert.equal(
    incomeSubject({job: 'retired', retirementPension: {monthlyAmount: -4}}, null).pensionAmount, 0,
    'a negative pension is floored at zero'
  );
  assert.equal(incomeSubject({job: 'retired', retirementPension: {monthlyAmount: 1.5}}, null).pensionAmount, 1.5);
});

test('the income subject reads a partially built life without throwing', () => {
  const empty = incomeSubject(undefined, null);
  assert.equal(empty.nation, '');
  assert.equal(empty.hasJob, false);
  assert.equal(empty.jobLo, 0);
  assert.equal(empty.pensionAmount, null);
  assert.equal(empty.oriStage, 0);
});
