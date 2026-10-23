import assert from 'node:assert/strict';
import test from 'node:test';
import {
  drawArts, drawWealth, lifeStage, lifeStageName, netWorth, yearlySeconds, PACES
} from '../dist-runtime/simulation.mjs';

const scripted = values => {
  let index = 0;
  const draw = () => values[Math.min(index++, values.length - 1)];
  draw.calls = () => index;
  return draw;
};

const wealthPorts = (gi, stand) => ({
  nation: () => ({gi}),
  race: () => ({stand})
});

test('wealth draws both tails and always stays on the 1..5 scale', () => {
  const flat = wealthPorts(0.3, 0.5);
  // roll 0.1 is under (1-mid)/2 = 0.35 → the bottom tier; the bump draw keeps it there.
  assert.equal(drawWealth('X', 'Y', scripted([0.1, 0.5]), flat), 1);
  assert.equal(drawWealth('X', 'Y', scripted([0.95, 0.5]), flat), 5);

  for (const gi of [0.1, 0.5, 0.9]) {
    for (const roll of [0, 0.2, 0.5, 0.8, 0.999]) {
      const tier = drawWealth('X', 'Y', scripted([roll, 0.5]), wealthPorts(gi, 0.4));
      assert.ok(Number.isInteger(tier) && tier >= 1 && tier <= 5, `tier ${tier} out of range`);
    }
  }
});

test('a wealth draw consumes exactly two random values', () => {
  const random = scripted([0.5, 0.5]);
  drawWealth('X', 'Y', random, wealthPorts(0.4, 0.5));
  assert.equal(random.calls(), 2);
});

test('standing can move the tier by at most one step', () => {
  const mid = scripted([0.5, 0.5]);   // middle band, neutral bump
  const base = drawWealth('X', 'Y', mid, wealthPorts(0.4, 0.5));

  const lucky = drawWealth('X', 'Y', scripted([0.5, 1]), wealthPorts(0.4, 1));
  const unlucky = drawWealth('X', 'Y', scripted([0.5, 0]), wealthPorts(0.4, -3));
  assert.ok(lucky >= base && lucky - base <= 1, 'a lucky bump raises at most one tier');
  assert.ok(unlucky <= base && base - unlucky <= 1, 'an unlucky bump lowers at most one tier');
});

test('arts draws three uniforms plus the rare talent roll', () => {
  const ports = (art, artMod) => ({nation: () => ({art}), race: () => ({artMod})});

  const ordinary = scripted([0.5, 0.5, 0.5, 0.5]);
  assert.equal(drawArts('X', 'Y', ordinary, ports(0.5, 0)), Math.round(0.5 * 34));
  assert.equal(ordinary.calls(), 4, 'the talent check is the fourth draw');

  // A talent roll under 1.2% spends a fifth draw and adds 28..48.
  const talented = scripted([0.5, 0.5, 0.5, 0.001, 0.5]);
  const boosted = drawArts('X', 'Y', talented, ports(0.5, 0));
  assert.equal(talented.calls(), 5);
  assert.ok(boosted > Math.round(0.5 * 34), 'the talent bonus is applied');

  assert.ok(drawArts('X', 'Y', scripted([1, 1, 1, 1]), ports(1, 1)) <= 99, 'clamped at 99');
  assert.ok(drawArts('X', 'Y', scripted([0, 0, 0, 0.5]), ports(0, -5)) >= 2, 'clamped at 2');
});

test('pacing scales with the chosen length and compresses late life', () => {
  const playAge = age => (age <= 60 ? age : 60 + 40 * Math.log(1 + (age - 60) / 40));
  const deriv = age => (age <= 60 ? 1 : 40 / (40 + (age - 60)));
  const seconds = (pace, e0, age) => yearlySeconds(pace, e0, age, PACES, playAge, deriv);

  assert.ok(seconds('short', 60, 30) < seconds('normal', 60, 30));
  assert.ok(seconds('normal', 60, 30) < seconds('long', 60, 30));

  const young = seconds('normal', 60, 30);
  const atSixty = seconds('normal', 60, 60);
  const old = seconds('normal', 60, 100);
  assert.ok(Math.abs(young - atSixty) < 1e-12, 'years are uniform up to 60');
  assert.ok(old < atSixty, 'late years are shorter in feeling (and in seconds)');

  // A short expected lifespan packs more seconds into each year.
  assert.ok(seconds('normal', 40, 30) > seconds('normal', 90, 30));
  assert.ok(Number.isFinite(seconds('nope', 60, 30)), 'an unknown pace falls back to normal');
});

test('life stage follows the documented precedence', () => {
  const stage = (age, extra = {}) => lifeStage({age, serveLeft: 0, school: false, retired: false, ...extra});
  assert.equal(stage(3), 'baby');
  assert.equal(stage(7, {serveLeft: 2}), 'service', 'service outranks school and age');
  assert.equal(stage(7, {school: true}), 'school');
  assert.equal(stage(10), 'kidwork');
  assert.equal(stage(30), 'adult');
  assert.equal(stage(64, {retired: true}), 'elder');
  assert.equal(stage(70), 'elder');
  assert.equal(stage(60), 'adult', 'sixty is still adult without the retired flag');
});

test('stage names never mix languages and an unknown key reads as adult', () => {
  assert.equal(lifeStageName('baby'), '幼年');
  assert.equal(lifeStageName('baby', 'en'), 'Childhood');
  assert.equal(lifeStageName('nope'), '成年');
  assert.equal(lifeStageName('nope', 'en'), 'Adulthood');
});

test('net worth adds property and subtracts debt', () => {
  assert.equal(netWorth({money: 100, debt: 0}), 100);
  assert.equal(netWorth({money: 100, homeValue: 500, debt: 200}), 400);
  assert.equal(netWorth({money: 0, rentals: 3, rentalValue: 50, debt: 0}), 150);
  assert.equal(netWorth({money: 10, debt: 40}), -30);
});
