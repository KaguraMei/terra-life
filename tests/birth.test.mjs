import assert from 'node:assert/strict';
import test from 'node:test';
import {
  birthProbability, birthSubject, congenitalInfection, congenitalRisk, fertilityRate,
  BIRTH_CAP, CONGENITAL_CHANCE, IDEAL_MOTHER_AGE, SON_RATIO, SPACING_WEIGHT
} from '../dist-runtime/simulation.mjs';

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

const ports = ({urb = 40, edu = 12} = {}) => ({
  nation: () => ({urbanisation: urb, education: edu}),
  clamp
});

const subject = (extra = {}) => ({
  sex: 'F',
  age: 27,
  familyTier: 3,
  oriStage: 0,
  married: true,
  partnerAlive: true,
  partnerAge: 28,
  children: 0,
  partnerOriStage: 0,
  ...extra
});

const odds = (extra = {}, nation = {}) => birthProbability(subject(extra), 'X', ports(nation));

test('the fertility rate is reconstructed from urbanisation and education', () => {
  assert.equal(fertilityRate('X', ports({urb: 40, edu: 12})), 6.2 - 40 / 22 - 12 / 6);
  assert.ok(fertilityRate('X', ports({urb: 80, edu: 20})) < fertilityRate('X', ports({urb: 20, edu: 4})));
  assert.equal(fertilityRate('X', ports({urb: 400, edu: 100})), 1.0, 'floored at one child');
  assert.equal(fertilityRate('X', ports({urb: 0, edu: 0})), 6.0, 'capped at six');
});

test('a couple that cannot conceive returns null instead of a probability', () => {
  assert.equal(odds({married: false}), null);
  assert.equal(odds({partnerAlive: false}), null);
  assert.equal(odds({age: 15}), null, 'too young');
  assert.equal(odds({age: 47}), null, 'too old');
  assert.equal(odds({age: 46}), 0.32 * (1 - Math.abs(46 - IDEAL_MOTHER_AGE) / 30),
    'the upper bound is still allowed, with a reduced chance');
  assert.equal(odds({sex: 'M', age: 61, partnerAge: 30}), null, 'a father over sixty is rejected');
  assert.equal(odds({sex: 'M', age: 60, partnerAge: 30}), odds({sex: 'M', age: 30, partnerAge: 30}),
    'sixty is still allowed');
});

test('for a male player the mother is the partner, and her age is what counts', () => {
  assert.equal(odds({sex: 'M', age: 40, partnerAge: 15}), null);
  assert.equal(odds({sex: 'M', age: 40, partnerAge: 47}), null);
  assert.equal(odds({sex: 'M', age: 40, partnerAge: 27}), odds({sex: 'F', age: 27}));
});

test('the chance peaks at the ideal maternal age and falls away from it', () => {
  const peak = odds({age: IDEAL_MOTHER_AGE});
  assert.ok(peak > odds({age: 16}));
  assert.ok(peak > odds({age: 40}));
  assert.equal(odds({age: 16}), odds({age: 38}), 'thirty is symmetric around twenty-seven');

  const expected = 0.32 * (1 - Math.abs(IDEAL_MOTHER_AGE - IDEAL_MOTHER_AGE) / 30);
  assert.ok(Math.abs(peak - expected) < 1e-12);
});

test('family size controls the weight, and a reached target only spaces children out', () => {
  const trying = odds({children: 0});
  const reached = odds({children: 5});
  assert.equal(reached, odds({age: 27, children: 5}));
  assert.ok(reached < trying, 'a couple past its target tries far less often');
  assert.ok(Math.abs(reached / trying - SPACING_WEIGHT) < 1e-12, 'the spacing weight is 0.15');
});

test('means lower the target family size while infection leaves it alone', () => {
  assert.ok(odds({children: 3, familyTier: 4}, {urb: 20, edu: 6})
    < odds({children: 3, familyTier: 3}, {urb: 20, edu: 6}), 'wealthy households aim smaller');

  // Oripathy carries no fertility penalty: the old -45% read the player's stage even
  // when the player was the father, so it shrank an infected father's household and
  // left an infected mother's untouched. It was removed rather than rebalanced.
  for (const stage of [1, 2, 3]) {
    assert.equal(odds({children: 2, oriStage: stage}, {urb: 20, edu: 6}),
      odds({children: 2, oriStage: 0}, {urb: 20, edu: 6}), `stage ${stage} must not change fertility`);
  }
});

test('the probability is capped so no nation becomes a maternity ward', () => {
  const sure = odds({children: 0}, {urb: 0, edu: 0});
  assert.ok(sure <= BIRTH_CAP);
  assert.equal(BIRTH_CAP, 0.6);
});

test('congenital transmission depends on the infected parent', () => {
  assert.equal(congenitalRisk(subject({oriStage: 1})), true, 'an infected mother transmits');
  assert.equal(congenitalRisk(subject({oriStage: 0})), false);
  assert.equal(congenitalRisk(subject({sex: 'M', oriStage: 3})), false, "a father's own stage is not the risk");
  assert.equal(congenitalRisk(subject({sex: 'M', partnerOriStage: 2})), true, 'an infected partner does');
  assert.equal(congenitalRisk(subject({sex: 'X', oriStage: 3, partnerOriStage: 3})), false,
    'only M and F transmit — an unknown sex is left alone');

  assert.equal(CONGENITAL_CHANCE, 0.12);
  assert.equal(SON_RATIO, 0.512);
});

test('a congenitally infected newborn carries the documented fields', () => {
  const ori = congenitalInfection(6.5);
  assert.deepEqual(ori, {
    at: 0, stage: 1, crystal: 6.5, treated: false, known: false, art: false, congenital: true
  });
});

test('the birth subject normalises a life once', () => {
  const view = birthSubject({
    sex: 'M', age: 34, q: 2, ori: {stage: 2},
    fam: {
      married: 1,
      partner: {alive: true, age: 31, ori: {stage: 1}},
      kids: [{alive: true}, {alive: false}]
    }
  });

  assert.equal(view.sex, 'M');
  assert.equal(view.age, 34);
  assert.equal(view.familyTier, 2);
  assert.equal(view.oriStage, 2);
  assert.equal(view.married, true);
  assert.equal(view.partnerAlive, true);
  assert.equal(view.partnerAge, 31);
  assert.equal(view.children, 2, 'a deceased child still counts toward family size');
  assert.equal(view.partnerOriStage, 1);
});

test('the birth subject survives a missing life', () => {
  const empty = birthSubject(undefined);
  assert.equal(empty.sex, '');
  assert.equal(empty.age, 0);
  assert.equal(empty.children, 0);
  assert.equal(empty.married, false);
  assert.equal(empty.partnerOriStage, 0);
  assert.equal(birthProbability(empty, 'X', ports()), null);
});
