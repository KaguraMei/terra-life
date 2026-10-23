import assert from 'node:assert/strict';
import test from 'node:test';
import {
  artsRank, artsRankName, band, causeName, oripathyMultiplier, povertyWeights, raceMultiplier, tiesMultiplier
} from '../dist-runtime/simulation.mjs';

const life = overrides => ({
  age: 40, race: 'feline', nation: 'KDZ', fam: {}, st: {so: 50}, ...overrides
});

test('age bands cover every age and stay open-ended at the top', () => {
  assert.equal(band(0), 0);
  assert.equal(band(1), 1);
  assert.equal(band(4.9), 1);
  assert.equal(band(5), 2);
  assert.equal(band(15), 3);
  assert.equal(band(50), 4);
  assert.equal(band(70), 5);
  assert.equal(band(500), 5, 'past the last band stays in the last band');
});

test('cause names keep the legacy bucket readable and unknown keys honest', () => {
  assert.equal(causeName('ori', 30), '矿石病');
  assert.equal(causeName('nope', 30), '未知');
  assert.equal(causeName('ocd', 0.5), '新生儿并发症');
  assert.equal(causeName('ocd', 3), '儿童感染与营养疾病');
  assert.equal(causeName('ocd', 9), '儿童疾病或意外');
  assert.equal(causeName('ocd', 30), '未分类疾病');
  assert.equal(causeName('ocd', 80), '多器官衰竭');
  assert.equal(causeName('ocd', null), '多器官衰竭', 'an unknown age falls to the last label');
});

test('age bands drive the arts rank thresholds', () => {
  assert.equal(artsRank(0), 0);
  assert.equal(artsRank(21.9), 0);
  assert.equal(artsRank(22), 1);
  assert.equal(artsRank(45), 2);
  assert.equal(artsRank(68), 3);
  assert.equal(artsRank(88), 4);
  assert.equal(artsRankName(4), '极强');
  assert.equal(artsRankName(4, 'en'), 'Exceptional');
  assert.equal(artsRankName(99), '无适应性', 'out-of-range falls back to the first rank');
});

test('ties protect, isolation hurts, and the effect starts at 20', () => {
  assert.equal(tiesMultiplier(life({age: 19, fam: {}})), 1, 'no effect before 20');
  const alone = tiesMultiplier(life({age: 40, fam: {}, st: {so: 10}}));
  assert.ok(alone > 1, 'a lonely 40-year-old carries extra risk');

  const married = tiesMultiplier(life({age: 40, fam: {married: true, partner: {alive: true}}, st: {so: 80}}));
  assert.ok(married < 1, 'a partner and high social contact both protect');
  assert.ok(married < alone);

  // Children protect relative to the same person without them. (A lone 40-year-old
  // already carries the +12% "no partner" penalty, so the absolute value can stay
  // above 1 even with children.)
  const noKids = tiesMultiplier(life({age: 40, fam: {}, st: {so: 50}}));
  const withKids = tiesMultiplier(life({age: 40, fam: {kids: [{alive: true}, {alive: true}]}, st: {so: 50}}));
  assert.ok(withKids < noKids, 'living children protect');
  assert.ok(withKids > tiesMultiplier(life({age: 40, fam: {kids: [{alive: true}, {alive: true}, {alive: true}]}, st: {so: 50}})),
    'more children protect a little more, up to the cap');

  const deadMother = tiesMultiplier(life({age: 10, fam: {mom: {alive: false}}}));
  const aliveMother = tiesMultiplier(life({age: 10, fam: {mom: {alive: true}}}));
  assert.ok(deadMother > aliveMother, 'losing the mother before 18 is a risk');

  const deadMotherAdult = tiesMultiplier(life({age: 30, fam: {mom: {alive: false}}}));
  const aliveMotherAdult = tiesMultiplier(life({age: 30, fam: {mom: {alive: true}}}));
  assert.equal(deadMotherAdult, aliveMotherAdult, 'past 18 the mother no longer enters the multiplier');
});

test('the oripathy multiplier follows stage, treatment and tolerance', () => {
  const base = {ori: {stage: 2, at: 20, treated: false, art: false}};
  const tolerant = {arrest: 0, lifeK: 1};
  const stage2 = oripathyMultiplier(life({...base, age: 30}), 30, tolerant);
  assert.equal(stage2, 3.2);

  const stage3 = oripathyMultiplier(life({ori: {stage: 3, at: 20}}), 30, tolerant);
  assert.equal(stage3, 7.5);

  const treated = oripathyMultiplier(life({ori: {stage: 2, at: 20, treated: true}}), 30, tolerant);
  assert.equal(treated, 3.2 * 0.5);

  const arts = oripathyMultiplier(life({ori: {stage: 2, at: 20, art: true}}), 30, tolerant);
  assert.equal(arts, 3.2 * 0.85);

  // Ten years past infection the long tail starts compounding (only below stage 3).
  const late = oripathyMultiplier(life({ori: {stage: 1, at: 10}}), 30, tolerant);
  assert.ok(Math.abs(late - 1.7 * 1.2) < 1e-9);
  const lateStage3 = oripathyMultiplier(life({ori: {stage: 3, at: 10}}), 30, tolerant);
  assert.equal(lateStage3, 7.5, 'stage 3 does not compound further');

  // Tier 0 tolerance (lifeK 0.2) multiplies risk fivefold.
  const oppressed = oripathyMultiplier(life({...base, age: 30}), 30, {arrest: 1, lifeK: 0.2});
  assert.ok(Math.abs(oppressed - 3.2 * 5) < 1e-9);

  assert.equal(oripathyMultiplier(life({ori: {stage: 0}}), 30, tolerant), 1);
  assert.equal(oripathyMultiplier(life({}), 30, tolerant), 1);
});

test('discrimination and being a minority abroad both raise the risk', () => {
  assert.equal(raceMultiplier(life({age: 0}), 0.5), 1, 'infants are not exposed yet');
  assert.ok(raceMultiplier(life({age: 10}), 0.5) > 1);
  assert.ok(raceMultiplier(life({age: 30}), 0.5) > raceMultiplier(life({age: 30}), 0.1));

  assert.ok(Math.abs(raceMultiplier(life({age: 30, race: 'sarkaz', nation: 'YAN'}), 0) - 1.1) < 1e-9);
  assert.equal(raceMultiplier(life({age: 30, race: 'sarkaz', nation: 'KDZ'}), 0), 1);
  assert.ok(Math.abs(raceMultiplier(life({age: 30, race: 'aegir', nation: 'US'}), 0) - 1.06) < 1e-9);
});

test('poverty only amplifies child causes, and only below tier 3', () => {
  const weights = {neo: 10, inf: 10, can: 10};
  povertyWeights(weights, 3, (v, lo, hi) => Math.min(hi, Math.max(lo, v)));
  assert.equal(weights.neo, 10, 'tier 3 and above are untouched');

  povertyWeights(weights, 1, (v, lo, hi) => Math.min(hi, Math.max(lo, v)));
  assert.ok(Math.abs(weights.neo - 10 * 1.7) < 1e-9, 'two tiers below the middle get +70%');
  assert.equal(weights.can, 10, 'adult causes are not poverty-driven');
});
