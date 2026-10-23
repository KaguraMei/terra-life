import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation, focusOutcome, focusShares, CURVED_EFFECTS } from '../dist-runtime/simulation.mjs';

test('attention weights normalise to shares that add up to one', () => {
  const {total, shares} = focusShares({health: 1, study: 3});
  assert.equal(total, 4);
  assert.equal(shares.health, 0.25);
  assert.equal(shares.study, 0.75);
  assert.equal(shares.health + shares.study, 1);
});

test('a single focus takes the whole year', () => {
  const {shares} = focusShares({study: 5});
  assert.equal(shares.study, 1);
});

test('an empty or non-positive total yields no shares at all', () => {
  assert.deepEqual(focusShares({}), {total: 0, shares: {}});
  assert.deepEqual(focusShares({health: 0}), {total: 0, shares: {}});
  assert.deepEqual(focusShares({health: 0, study: 0}), {total: 0, shares: {}},
    'no attention means no division by zero and no effects');
});

test('the share map keeps the caller\'s key order', () => {
  const {shares} = focusShares({study: 1, health: 2, bonds: 3});
  assert.deepEqual(Object.keys(shares), ['study', 'health', 'bonds']);
});

test('an effect table scales by its share', () => {
  const outcome = focusOutcome({hl: 4, h: 2, so: -2}, 0.5);
  assert.deepEqual(outcome.dimensions, [
    {dimension: 'hl', delta: 2},
    {dimension: 'h', delta: 1},
    {dimension: 'so', delta: -1}
  ]);
  assert.equal(outcome.knowledge, 0);
  assert.equal(outcome.arts, 0);
});

test('knowledge, arts and money are pulled out of the plain pass', () => {
  const outcome = focusOutcome({sm: 5, arts: -3, money: 100, hl: 2}, 1);
  assert.deepEqual(outcome.dimensions, [{dimension: 'hl', delta: 2}],
    'money and the two curved values never reach the additive pass');
  assert.equal(outcome.knowledge, 5);
  assert.equal(outcome.arts, -3);
  assert.deepEqual(CURVED_EFFECTS, ['sm', 'arts', 'money']);
});

test('the dimension list follows the effect table order', () => {
  const outcome = focusOutcome({so: 1, h: 1, hl: 1}, 1);
  assert.deepEqual(outcome.dimensions.map(entry => entry.dimension), ['so', 'h', 'hl']);
});

test('a zero share zeroes every effect', () => {
  const outcome = focusOutcome({hl: 10, sm: 10, arts: 10}, 0);
  assert.deepEqual(outcome.dimensions, [{dimension: 'hl', delta: 0}]);
  assert.equal(outcome.knowledge, 0);
  assert.equal(outcome.arts, 0);
});

test('the runtime applies a focus year and records the shares', () => {
  const TL = createSimulation();
  const S = TL.newLife({seed: 818001, nation: 'YAN', bornYear: 1060});
  S.st = {hl: 50, h: 50, so: 50, sm: 20};
  S.arts = 20;
  S.fT = {health: 1, study: 3};

  const healthEffect = TL.FOCUS.health.e;
  const studyEffect = TL.FOCUS.study.e;
  const shares = TL.focusYear(S);

  assert.equal(shares.health, 0.25);
  assert.equal(shares.study, 0.75);
  assert.deepEqual(S.focusW, shares, 'the shares are recorded on the life');

  const expectedHl = 50 + (healthEffect.hl ?? 0) * 0.25 + (studyEffect.hl ?? 0) * 0.75;
  assert.ok(Math.abs(S.st.hl - expectedHl) < 1e-9, 'health moved by the weighted sum');
});

test('a year without focus writes empty shares and changes nothing', () => {
  const TL = createSimulation();
  const S = TL.newLife({seed: 818002, nation: 'YAN', bornYear: 1060});
  const before = {...S.st};
  S.fT = {};
  assert.deepEqual(TL.focusYear(S), {});
  assert.deepEqual(S.st, before);
  assert.deepEqual(S.focusW, {});

  S.fT = {health: 0, study: 0};
  assert.deepEqual(TL.focusYear(S), {});
  assert.deepEqual(S.st, before);
});
