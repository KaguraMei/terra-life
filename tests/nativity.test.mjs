import assert from 'node:assert/strict';
import test from 'node:test';
import { initialStats, parentAges, stratumCode } from '../dist-runtime/simulation.mjs';

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

const scripted = values => {
  let index = 0;
  const draw = (low, high) => {
    const value = values[Math.min(index++, values.length - 1)];
    return low + value * (high - low);
  };
  draw.calls = () => index;
  return draw;
};

const subject = (extra = {}) => ({
  nationMedical: 0.6,
  nationEducation: 10,
  familyTier: 3,
  raceModifiers: {},
  courtModifiers: null,
  ...extra
});

test('the starting dimensions follow the documented formulas', () => {
  // A neutral roll is 0.5 of each range: -8..8 → 0, -6..10 → 2.
  const stats = initialStats(subject(), {range: scripted([0.5, 0.5, 0.5, 0.5]), clamp});
  assert.equal(stats.hl, 62, '62 + race 0 + wealth 0 + medical 0 + roll 0');
  assert.equal(stats.h, 56 + 6, '56 + race 0 + (3 − |3−3|) × 2 + roll 0');
  assert.equal(stats.sm, 18 + 2 * 7 + 10 * 0.9 + 2, 'knowledge starts from wealth and schooling');
  assert.equal(stats.so, 52);
});

test('the four dimensions draw exactly four uniforms, in order', () => {
  const random = scripted([0.5, 0.5, 0.5, 0.5]);
  initialStats(subject(), {range: random, clamp});
  assert.equal(random.calls(), 4, 'hl, h, sm, so — one each');
});

test('wealth and nationality move the starting point', () => {
  const roll = () => scripted([0.5, 0.5, 0.5, 0.5]);
  const poor = initialStats(subject({familyTier: 1}), {range: roll(), clamp});
  const rich = initialStats(subject({familyTier: 5}), {range: roll(), clamp});
  assert.ok(rich.hl > poor.hl, 'richer households start healthier');
  assert.ok(rich.sm > poor.sm, 'and better schooled');
  assert.ok(initialStats(subject({familyTier: 3}), {range: roll(), clamp}).h > poor.h,
    'mood peaks at the middle tier, not at the top');
  assert.equal(rich.h, poor.h, 'both tails lose the same two points of mood');

  const sickly = initialStats(subject({nationMedical: 0.2}), {range: roll(), clamp});
  const healthy = initialStats(subject({nationMedical: 0.9}), {range: roll(), clamp});
  assert.ok(healthy.hl > sickly.hl, 'medicine raises starting health');

  const uneducated = initialStats(subject({nationEducation: 4}), {range: roll(), clamp});
  assert.ok(uneducated.sm < initialStats(subject({nationEducation: 14}), {range: roll(), clamp}).sm);
});

test('race modifiers apply to the matching dimension', () => {
  const base = initialStats(subject(), {range: scripted([0.5, 0.5, 0.5, 0.5]), clamp});
  const tough = initialStats(subject({raceModifiers: {hl: 5, sm: 2}}),
    {range: scripted([0.5, 0.5, 0.5, 0.5]), clamp});
  assert.equal(tough.hl, base.hl + 5 * 1.4);
  assert.equal(tough.sm, base.sm + 2 * 1.2);
  assert.equal(tough.h, base.h, 'an untouched dimension does not move');
});

test('a court bonus is applied after the rolls, with its own clamp', () => {
  const random = scripted([0.5, 0.5, 0.5, 0.5]);
  const stats = initialStats(subject({courtModifiers: {hl: 10, so: -100}}), {range: random, clamp});
  assert.equal(random.calls(), 4, 'the court bonus costs no draw');
  assert.equal(stats.hl, 62 + 10 * 1.2);
  assert.equal(stats.so, 0, 'the court clamp is 0..100, not the birth clamp');
});

test('the birth clamps differ per dimension', () => {
  const low = initialStats(subject({familyTier: 1, nationMedical: 0, raceModifiers: {hl: -30}}),
    {range: (low, high) => low, clamp});
  assert.equal(low.hl, 15, 'health never starts below 15');
  assert.ok(low.sm >= 2, 'knowledge can start as low as 2');

  const high = initialStats(subject({familyTier: 5, nationMedical: 1, raceModifiers: {hl: 40}}),
    {range: (low, high) => high, clamp});
  assert.equal(high.hl, 96, 'and never above 96');
  assert.ok(high.sm <= 92, 'and knowledge stays inside its own ceiling');
});

test('the parents are anchored to household wealth', () => {
  const young = parentAges(1, {range: (low) => low, clamp});
  const old = parentAges(5, {range: (low) => low, clamp});
  assert.equal(young.momAge, 16, 'a poor household is clamped to sixteen');
  assert.equal(old.momAge, Math.round(19 + 2 * 1.6), 'a rich one starts later');

  // The father is the rounded mother's age plus the second draw.
  const both = parentAges(3, {range: scripted([0.5, 0.5]), clamp});
  assert.equal(both.momAge, Math.round(19 + 0.5 * 19));
  assert.equal(both.dadAge, Math.round(both.momAge + (1 + 0.5 * 5)));
});

test('the parents draw exactly twice, mother first', () => {
  const random = scripted([0.5, 0.5]);
  parentAges(3, {range: random, clamp});
  assert.equal(random.calls(), 2);
});

test('the mother is never older than the clamp even with an extreme draw', () => {
  assert.equal(parentAges(20, {range: (low, high) => high, clamp}).momAge, 45,
    'an absurd household tier still clamps the mother at forty-five');
  assert.ok(parentAges(20, {range: (low, high) => high, clamp}).dadAge >= 45,
    'the father is never younger than the mother');
});

test('the stratum code is the first three letters, upper-cased', () => {
  assert.equal(stratumCode('industrial'), 'IND');
  assert.equal(stratumCode('core'), 'COR');
  assert.equal(stratumCode(''), '');
  assert.equal(stratumCode('ab'), 'AB');
});
