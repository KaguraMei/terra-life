import assert from 'node:assert/strict';
import test from 'node:test';
import {
  annualFrom, annualRisk, combatValue, crystalGrowth, lifetimeProbability, reunionLean, stageName,
  stageOf, stigma, subjectFromOripathyState as subjectFromState, totalDiscrimination, treatmentAccess,
  treatmentCost, treatmentSuppression
} from '../dist-runtime/simulation.mjs';

const ports = {
  nation: () => ({med: 0.5, ppp: 100}),
  stratumRisk: id => (id === 'core' ? [0.01, 0.03] : [0.20, 0.35]),
  raceRisk: () => 1,
  timelineMods: () => ({ori: 0}),
  tolerance: () => ({lifeK: 1, arrest: 0, treatP: 0.5, tier: 3}),
  toleranceValue: () => 60,
  discrimination: () => 0.2,
  opRankNeed: rank => (rank === 'elite' ? 40 : 10),
  clamp: (value, low, high) => Math.min(high, Math.max(low, value))
};

const life = overrides => ({
  age: 30, nation: 'YAN', stratum: 'industrial', race: 'feline', year: 1090, q: 3, arts: 0,
  job: 'worker', money: 100, st: {hl: 70, sm: 50, h: 60}, opRank: null, flags: {}, ori: null,
  ...overrides
});
const table = e0 => ({e0, maxAge: 100});

test('crystal rate maps to the four stages at the documented gates', () => {
  assert.equal(stageOf(0), 0);
  assert.equal(stageOf(0.1), 1);
  assert.equal(stageOf(24.9), 1);
  assert.equal(stageOf(25), 2);
  assert.equal(stageOf(59.9), 2);
  assert.equal(stageOf(60), 3);
  assert.equal(stageOf(100), 3);

  assert.equal(stageName(0), '未感染');
  assert.equal(stageName(2), 'Ⅱ期');
  assert.equal(stageName(2, 'en'), 'Stage II');
  assert.equal(stageName(9), '未感染', 'an unknown stage falls back to the first entry');
});

test('the lifetime risk is fixed once drawn', () => {
  const drawn = subjectFromState(life({flags: {oriP: 0.3}}));
  assert.equal(lifetimeProbability(drawn, ports), 0.3, 'a cached draw is returned as-is');

  const fresh = subjectFromState(life());
  const first = lifetimeProbability(fresh, ports);
  const second = lifetimeProbability(fresh, ports);
  assert.equal(first, second);
  assert.ok(first > 0 && first < 1);
  assert.equal(fresh.lifetimeRisk, null, 'the pure function never writes the cache');
});

test('hazardous jobs and national special cases override the stratum band', () => {
  const miner = lifetimeProbability(subjectFromState(life({job: 'oriminer'})), ports);
  const clerk = lifetimeProbability(subjectFromState(life({job: 'clerk'})), ports);
  assert.ok(miner > clerk, 'a miner is at much higher risk than a clerk');

  const kazdel = lifetimeProbability(subjectFromState(life({nation: 'KDZ', job: 'clerk'})), ports);
  assert.ok(kazdel > 0.5, 'Kazdel is at 60–80% regardless of job');

  const laterano = lifetimeProbability(subjectFromState(life({nation: 'LAT', job: 'clerk'})), ports);
  assert.ok(laterano < 0.05, 'Laterano stays under a few percent');
});

test('the annual risk is spent over a fixed window, so age alone never inflates it', () => {
  // A lifetime risk of 0.5 over [6, 66] is a flat 1.15%/yr; spreading it over
  // "years remaining" is the bug this replaced.
  const annual = annualFrom(0.5, table(60));
  assert.ok(Math.abs(annual - (1 - Math.pow(0.5, 1 / 60))) < 1e-12);

  const at30 = annualRisk(subjectFromState(life({age: 30, flags: {oriP: 0.5}})), table(60), ports);
  const at80 = annualRisk(subjectFromState(life({age: 80, flags: {oriP: 0.5}})), table(60), ports);
  assert.equal(at30, at80, 'past the exposure window the annual risk is unchanged');

  const child = annualRisk(subjectFromState(life({age: 3, flags: {oriP: 0.5}})), table(60), ports);
  assert.ok(child < at30, 'before the exposure window the risk is halved');

  assert.equal(annualRisk(subjectFromState(life({ori: {stage: 2, crystal: 40, at: 20}})), table(60), ports), 0,
    'an infected life no longer rolls for infection');
});

test('exposure events multiply the annual risk and stay clamped', () => {
  const base = annualRisk(subjectFromState(life({flags: {oriP: 0.5}})), table(60), ports);
  const surge = annualRisk(subjectFromState(life({flags: {oriP: 0.5, oriSurge: true}})), table(60), ports);
  assert.ok(Math.abs(surge - Math.min(0.55, base * 8)) < 1e-12);

  const slave = annualRisk(subjectFromState(life({flags: {oriP: 0.5}, job: 'slave'})), table(60), ports);
  assert.ok(Math.abs(slave - Math.min(0.55, base * 3.2)) < 1e-12);
});

test('stigma, discrimination and Reunion lean all scale with tolerance', () => {
  const infected = {ori: {stage: 2, crystal: 40, at: 20, known: true, treated: false, provider: null}};
  const lowTolerance = {...ports, toleranceValue: () => 10};
  const highTolerance = {...ports, toleranceValue: () => 95};

  const harsh = stigma(subjectFromState(life(infected)), lowTolerance);
  const lenient = stigma(subjectFromState(life(infected)), highTolerance);
  assert.ok(harsh > lenient, 'a low-tolerance nation stigmatizes more');
  assert.ok(harsh <= 0.97, 'stigma is capped');

  const hidden = stigma(subjectFromState(life({ori: {...infected.ori, known: false}})), lowTolerance);
  assert.ok(hidden < harsh, 'an unknown infection costs less socially');

  assert.ok(totalDiscrimination(life(infected), subjectFromState(life(infected)), lowTolerance)
    >= ports.discrimination(life(infected)), 'total discrimination includes the race term');

  assert.ok(reunionLean(life(infected), subjectFromState(life(infected)), lowTolerance)
    > reunionLean(life(infected), subjectFromState(life(infected)), highTolerance));
  assert.equal(reunionLean(life(), subjectFromState(life()), ports), 0, 'uninfected people do not lean');
});

test('combat value and treatment access follow their inputs', () => {
  const plain = combatValue(subjectFromState(life()), ports);
  const operator = combatValue(subjectFromState(life({opRank: 'elite', arts: 70})), ports);
  assert.ok(operator > plain, 'rank and arts raise combat value');
  assert.equal(Number.isInteger(plain), true, 'combat value is rounded');

  const rich = treatmentAccess(subjectFromState(life({q: 5})), ports);
  const poor = treatmentAccess(subjectFromState(life({q: 1})), ports);
  assert.ok(rich > poor, 'wealth buys access');
  assert.ok(treatmentAccess(subjectFromState(life({flags: {reunion: true}})), ports) < treatmentAccess(subjectFromState(life()), ports),
    'Reunion membership closes doors');
  assert.ok(treatmentAccess(subjectFromState(life()), ports) <= 0.85, 'access is capped');
});

test('crystal growth multiplies every documented factor', () => {
  const infected = extra => subjectFromState(life({
    ori: {at: 18, crystal: 30, stage: 2, treated: false, known: true, provider: null},
    ...extra
  }));

  const base = crystalGrowth(infected(), ports);
  assert.ok(base > 0);

  // 2.4 × (1 + 0×0.22) × 1.35 × (1 + (3−3)×0.10) × (1.6 − 70/140) × 1
  assert.ok(Math.abs(base - 2.4 * 1.35 * 1.1) < 1e-12);

  assert.ok(crystalGrowth(infected({arts: 90}), ports) > base, 'stronger arts feed the crystals');
  assert.ok(crystalGrowth(infected({q: 1}), ports) > base, 'poverty means less protection');
  assert.ok(crystalGrowth(infected({st: {hl: 30}}), ports) > base, 'a worn body tolerates less');
  assert.equal(crystalGrowth(subjectFromState(life()), ports), 0, 'an uninfected life grows nothing');
  assert.equal(
    crystalGrowth(subjectFromState(life({ori: {at: 18, crystal: 0, stage: 0, treated: false, known: false, provider: null}})), ports),
    0, 'stage zero is uninfected'
  );
});

test('crystal growth accelerates with stage and slows under tolerance', () => {
  const stage = n => subjectFromState(life({
    ori: {at: 18, crystal: 30, stage: n, treated: false, known: true, provider: null}
  }));
  assert.ok(crystalGrowth(stage(2), ports) > crystalGrowth(stage(1), ports));
  assert.ok(crystalGrowth(stage(3), ports) > crystalGrowth(stage(2), ports));

  // A nation that bans the medicine (lifeK < 1) speeds the crystals up.
  const hostile = {...ports, tolerance: () => ({lifeK: 0.4, arrest: 0, treatP: 0.5, tier: 3})};
  assert.ok(crystalGrowth(stage(1), hostile) > crystalGrowth(stage(1), ports));
});

test('treatment suppression and cost follow the provider', () => {
  assert.equal(treatmentSuppression('rhodes'), 0.26);
  assert.equal(treatmentSuppression(null), 0.50);
  assert.equal(treatmentSuppression('local'), 0.50);

  assert.equal(treatmentCost(100, 'rhodes'), 260);
  assert.equal(treatmentCost(100, 'local'), 120);
  assert.equal(treatmentCost(100, null), 120, 'unpaid treatment bills like a local clinic');

  // Rhodes Island costs more than double and suppresses growth to about half.
  assert.ok(treatmentCost(100, 'rhodes') > treatmentCost(100, 'local') * 2);
  assert.ok(treatmentSuppression('rhodes') < treatmentSuppression('local'));
});
