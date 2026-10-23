import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chance, clamp, invNorm, irange, lerp, normCdf, pick, piecewise, range, wpick, wpickArr
} from '../dist-runtime/simulation.mjs';

/** A deterministic generator so draw order and counts are observable. */
const scripted = values => {
  let index = 0;
  const draw = () => values[Math.min(index++, values.length - 1)];
  draw.calls = () => index;
  return draw;
};

test('deterministic math matches the documented shapes', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(lerp(10, 20, 0.25), 12.5);

  assert.ok(Math.abs(normCdf(0) - 0.5) < 1e-6);
  assert.ok(Math.abs(normCdf(1.96) - 0.975) < 5e-4);
  assert.ok(Math.abs(normCdf(-1.96) - 0.025) < 5e-4, 'the CDF is symmetric');

  // Round-tripping the quantile is the strongest cheap check on the approximation.
  for (const p of [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99]) {
    assert.ok(Math.abs(normCdf(invNorm(p)) - p) < 1e-3, `invNorm(${p}) round-trips`);
  }
  assert.equal(invNorm(0), -8);
  assert.equal(invNorm(1), 8);

  const points = [[0, 0], [10, 100], [20, 100]];
  assert.equal(piecewise(points, -5), 0, 'flat before the first point');
  assert.equal(piecewise(points, 5), 50, 'linear between points');
  assert.equal(piecewise(points, 15), 100);
  assert.equal(piecewise(points, 99), 100, 'flat after the last point');
});

test('each draw helper consumes exactly one random value', () => {
  const random = scripted([0.5]);
  assert.equal(chance(0.6, random), true);
  assert.equal(random.calls(), 1);

  const rangeRandom = scripted([0.5]);
  assert.equal(range(10, 20, rangeRandom), 15);
  assert.equal(rangeRandom.calls(), 1);

  const intRandom = scripted([0.5]);
  assert.equal(irange(1, 4, intRandom), 3);
  assert.equal(intRandom.calls(), 1);

  const pickRandom = scripted([0.5]);
  assert.equal(pick(['a', 'b', 'c'], pickRandom), 'b');
  assert.equal(pickRandom.calls(), 1);
});

test('weighted picks follow the original walk and its edge cases', () => {
  const weights = {a: 1, b: 3};
  // total 4; 0.0 -> stays inside a (1), 0.3 -> 1.2 - 1 = 0.2 -> b
  assert.equal(wpick(weights, scripted([0])), 'a');
  assert.equal(wpick(weights, scripted([0.5])), 'b');
  assert.equal(wpick({a: 0, b: 0}, scripted([0.9])), 'a', 'no positive weight yields the first key');
  assert.equal(wpick({a: -5, b: 2}, scripted([0.1])), 'b', 'negative weights count as zero');

  const items = [{w: 1, id: 'x'}, {w: 1, id: 'y'}];
  assert.equal(wpickArr(items, 'w', scripted([0.1])).id, 'x');
  assert.equal(wpickArr(items, 'w', scripted([0.9])).id, 'y');
  assert.equal(wpickArr([], 'w', scripted([0.5])), undefined);
  assert.equal(wpickArr([{w: 0, id: 'only'}], 'w', scripted([0.5])).id, 'only');
});
