import assert from 'node:assert/strict';
import test from 'node:test';
import {
  healthTarget, moodTarget, regressHealth, regressMood, regressSocial, regressionSubject, socialTarget,
  BOND_RATE, BOND_RATE_ADULT, HEALTH_RATE, MOOD_RATE
} from '../dist-runtime/simulation.mjs';

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

const subject = (extra = {}) => ({
  age: 30,
  health: 60,
  social: 50,
  happiness: 50,
  familyTier: 3,
  smoker: false,
  refugee: false,
  debt: false,
  oriStage: 0,
  oriKnown: false,
  balancedDiet: false,
  exercises: false,
  untreatedTb: false,
  healthFocus: 0,
  conditionsTreated: 0,
  conditionsUntreated: 0,
  kidsAlive: 0,
  partnerAlive: false,
  married: false,
  momAlive: false,
  migrated: false,
  hobbies: 0,
  incomePercentile: 0.5,
  productiveYears: 0,
  ...extra
});

test('the health target is the age baseline plus every lifestyle term', () => {
  assert.equal(healthTarget(subject(), 60), 60, 'an average life with a healthy baseline');

  assert.equal(healthTarget(subject({balancedDiet: true}), 58), 59.5);
  assert.equal(healthTarget(subject({exercises: true}), 58), 60);
  assert.equal(healthTarget(subject({smoker: true}), 58), 52);
  assert.equal(healthTarget(subject({refugee: true}), 58), 52);
  assert.equal(healthTarget(subject({debt: true}), 58), 56);
  assert.equal(healthTarget(subject({familyTier: 5}), 58), 61);
  assert.equal(healthTarget(subject({familyTier: 1}), 58), 55);
  assert.equal(healthTarget(subject({healthFocus: 0.5}), 58), 61);
});

test('chronic conditions cost the most, and treatment only halves the cost', () => {
  assert.equal(healthTarget(subject(), 60) - healthTarget(subject({conditionsUntreated: 1}), 60), 5);
  assert.equal(healthTarget(subject(), 60) - healthTarget(subject({conditionsTreated: 1}), 60), 2.5);
  assert.equal(
    healthTarget(subject({conditionsTreated: 2, conditionsUntreated: 1}), 60), 60 - 2.5 * 2 - 5
  );
});

test('oripathy stage and untreated tuberculosis stack on top', () => {
  assert.equal(healthTarget(subject(), 60) - healthTarget(subject({oriStage: 1}), 60), 7);
  assert.equal(healthTarget(subject(), 60) - healthTarget(subject({oriStage: 3}), 60), 21);
  assert.equal(healthTarget(subject(), 60) - healthTarget(subject({untreatedTb: true}), 60), 10);

  const terminal = subject({oriStage: 3, conditionsUntreated: 2, untreatedTb: true, smoker: true});
  assert.equal(healthTarget(terminal, 55), 55 - 21 - 10 - 10 - 6,
    'every penalty is additive: a terminal patient with tuberculosis has a target of 8');
});

test('health regresses a quarter of the way, then stays inside 1..100', () => {
  assert.equal(regressHealth(40, 80, clamp), 40 + (80 - 40) * HEALTH_RATE);
  assert.equal(regressHealth(40, 40, clamp), 40, 'no gap, no move');
  assert.equal(regressHealth(1, -10, clamp), 1, 'floored at one');
  assert.equal(regressHealth(99, 400, clamp), 100, 'capped at one hundred');
  assert.ok(regressHealth(40, 80, clamp) < 80, 'one year never closes the gap');
});

test('the bond target adds partner, children, mother and hobbies and subtracts stigma', () => {
  assert.equal(socialTarget(subject()), 45);
  assert.equal(socialTarget(subject({partnerAlive: true, married: true})), 57);
  assert.equal(socialTarget(subject({partnerAlive: true, married: false})), 45, 'an unmarried partner adds nothing');
  assert.equal(socialTarget(subject({kidsAlive: 2})), 53);
  assert.equal(socialTarget(subject({kidsAlive: 10})), 60, 'children are capped at +15');
  assert.equal(socialTarget(subject({momAlive: true})), 48);
  assert.equal(socialTarget(subject({migrated: true})), 39);
  assert.equal(socialTarget(subject({hobbies: 1})), 48);
  assert.equal(socialTarget(subject({oriKnown: true})), 39);
});

test('the bond rate is asymmetric: adults fall fast and climb back slowly', () => {
  const target = 45;

  // Falling: a child uses 0.12, an adult the full 0.30.
  assert.equal(regressSocial(80, target, 10, clamp), 80 + (target - 80) * BOND_RATE);
  assert.equal(regressSocial(80, target, 30, clamp), 80 + (target - 12 - 80) * BOND_RATE_ADULT);

  // Climbing: only ever 0.12, at any age.
  assert.equal(regressSocial(20, target, 10, clamp), 20 + (target - 20) * BOND_RATE);
  assert.equal(regressSocial(20, target, 30, clamp), 20 + (target - 12 - 20) * BOND_RATE);

  assert.equal(regressSocial(0, 0, 30, clamp), 0, 'floored at zero');
  assert.equal(regressSocial(100, 200, 30, clamp), 100);
});

test('the age factor ramps from fourteen to twenty and clamps outside', () => {
  // Above the (age-declined) target: the drop grows with age, then stops at twenty.
  const drop = age => regressSocial(90, 90, age, clamp) - 90;
  assert.ok(drop(14) === 0, 'fourteen has the full target, so there is nothing to drop');
  assert.ok(drop(17) < drop(14), 'the target declines from fourteen');
  assert.ok(Math.abs(drop(20) - drop(40)) < 1e-12, 'twenty and older share the adult target');
  assert.ok(Math.abs(drop(5) - drop(14)) < 1e-12, 'children keep the child target');
});

test('the mood target reads body, bonds, income and stigma', () => {
  const base = 50;
  assert.equal(moodTarget(subject(), base), 50);

  // Body: 0.16 per point above 60. Bonds: 0.18 per point above 50.
  assert.equal(moodTarget(subject({health: 80}), base), 50 + 20 * 0.16);
  assert.equal(moodTarget(subject({social: 70}), base), 50 + 20 * 0.18);
  assert.equal(moodTarget(subject({health: 40}), base), 50 - 20 * 0.16);

  // Relative income swings ±22 across the percentile.
  assert.equal(moodTarget(subject({incomePercentile: 1}), base), 50 + 11);
  assert.equal(moodTarget(subject({incomePercentile: 0}), base), 50 - 11);

  assert.equal(moodTarget(subject({oriStage: 2}), base), 38);
  assert.equal(moodTarget(subject({oriStage: 1}), base), 50, 'stage one is not yet visible');
  assert.equal(moodTarget(subject({oriKnown: true}), base), 44);
  assert.equal(moodTarget(subject({productiveYears: 30}), base), 53, 'a tenth of a point per year');
  assert.equal(moodTarget(subject({productiveYears: 300}), base), 56, 'capped at +6');
});

test('mood regresses a fifth of the way and stays inside 1..100', () => {
  assert.equal(regressMood(30, 60, clamp), 30 + (60 - 30) * MOOD_RATE);
  assert.equal(regressMood(30, 30, clamp), 30);
  assert.equal(regressMood(1, 0, clamp), 1);
  assert.equal(regressMood(99, 400, clamp), 100);
  assert.ok(MOOD_RATE < HEALTH_RATE, 'mood moves slower than the body');
});

test('the regression subject normalises a life once', () => {
  const view = regressionSubject({
    age: 44, q: 4, smoker: 1, refugee: 1, debt: 12, migrated: 1,
    st: {hl: 61, so: 47, h: 52, pY: 9},
    fam: {
      married: 1,
      mom: {alive: 1},
      partner: {alive: true},
      kids: [{alive: 1}, {alive: false}, {alive: true, age: 3}]
    },
    flags: {diet: 1, exercise: 0, tbUntreated: 1},
    focusW: {health: 0.25},
    conds: {asthma: {treated: 1}, gout: {treated: false}},
    ori: {stage: 2, known: 1},
    hobbies: [{id: 'reading'}],
    pct: 0.72
  });

  assert.equal(view.age, 44);
  assert.equal(view.health, 61);
  assert.equal(view.social, 47);
  assert.equal(view.happiness, 52);
  assert.equal(view.smoker, true, 'a stored 1 is still true');
  assert.equal(view.debt, true);
  assert.equal(view.migrated, true);
  assert.equal(view.balancedDiet, true);
  assert.equal(view.untreatedTb, true);
  assert.equal(view.healthFocus, 0.25);
  assert.equal(view.conditionsTreated, 1);
  assert.equal(view.conditionsUntreated, 1);
  assert.equal(view.kidsAlive, 2, 'dead children are not counted');
  assert.equal(view.partnerAlive, true);
  assert.equal(view.married, true);
  assert.equal(view.momAlive, true);
  assert.equal(view.hobbies, 1);
  assert.equal(view.oriStage, 2);
  assert.equal(view.oriKnown, true);
  assert.equal(view.incomePercentile, 0.72);
  assert.equal(view.productiveYears, 9);
});

test('the regression subject reads a partially built life without throwing', () => {
  const empty = regressionSubject(undefined);
  assert.equal(empty.age, 0);
  assert.equal(empty.health, 0);
  assert.equal(empty.kidsAlive, 0);
  assert.equal(empty.conditionsTreated, 0);
  assert.equal(empty.debt, false);
  assert.equal(empty.oriStage, 0);

  // A condition stored as a bare value still counts as untreated.
  assert.equal(regressionSubject({conds: {asthma: 1}}).conditionsUntreated, 1);
});
