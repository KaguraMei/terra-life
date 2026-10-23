import assert from 'node:assert/strict';
import test from 'node:test';
import {autoScore, mayFire, pickAutoOption} from '../dist-runtime/simulation.mjs';

const stats = {hl: 50, h: 50, sm: 50, so: 50};

test('scarcity weighting makes the same gain worth more on a low stat', () => {
  const low = {hl: 5, h: 50, sm: 50, so: 50};
  const high = {hl: 95, h: 50, sm: 50, so: 50};
  const effects = {hl: 10};
  assert.ok(autoScore(effects, low, 100) > autoScore(effects, high, 100),
    'a +10 at 5 health counts more than at 95');
  assert.equal(autoScore({}, stats, 100), 0, 'no effects means no score');
  assert.equal(autoScore(null, stats, 100), 0);
});

test('money only scores when the life is in debt', () => {
  assert.equal(autoScore({money: 500}, stats, 1000), 0, 'cash on hand adds nothing');
  assert.ok(autoScore({money: 500}, stats, -100) > 0, 'in debt, income helps');
  assert.ok(autoScore({money: -500}, stats, -100) < 0, 'in debt, spending hurts');
});

test('auto-mode draws exactly one random value per eligible option', () => {
  const options = [{eff: {hl: 10}}, {autoExclude: true, eff: {hl: 99}}, {eff: {h: 10}}];
  let calls = 0;
  const random = () => { calls += 1; return 0.5; };

  const picked = pickAutoOption(options, stats, 100, random);
  assert.equal(calls, 2, 'the excluded option is skipped without consuming a draw');
  assert.ok(picked === 0 || picked === 2, 'the excluded option is never chosen');
});

test('the highest score wins and ties go to the earlier option', () => {
  const random = () => 0;   // no jitter, so the deterministic score decides
  assert.equal(pickAutoOption([{eff: {hl: 1}}, {eff: {hl: 20}}], stats, 100, random), 1);
  assert.equal(pickAutoOption([{eff: {hl: 20}}, {eff: {hl: 20}}], stats, 100, random), 0);

  // An all-excluded list still yields index 0, matching the engine.
  assert.equal(pickAutoOption([{autoExclude: true}], stats, 100, random), 0);
  assert.equal(pickAutoOption([], stats, 100, random), 0);
});

test('once decisions never repeat and the default cooldown is five years', () => {
  assert.equal(mayFire({once: true}, null, 30), true, 'the first time is always allowed');
  assert.equal(mayFire({once: true}, 30, 30), false, 'a seen once-only decision is closed');
  assert.equal(mayFire({once: true}, 30, 99), false, 'and stays closed');

  assert.equal(mayFire({}, null, 30), true);
  assert.equal(mayFire({}, 30, 32), false, 'default cooldown blocks a repeat after two years');
  assert.equal(mayFire({}, 30, 35), true, 'five years later it may fire again');

  assert.equal(mayFire({cd: 0}, 30, 30), true, 'an explicit zero cooldown allows every year');
  assert.equal(mayFire({cd: 10}, 30, 39), false);
  assert.equal(mayFire({cd: 10}, 30, 40), true);

  // `once` with an explicit cd still never repeats.
  assert.equal(mayFire({once: true, cd: 1}, 30, 60), false);
});
