import assert from 'node:assert/strict';
import test from 'node:test';
import {createLifeTableBuilder, expHealth, playAge, playAgeDeriv} from '../dist-runtime/simulation.mjs';

const ports = {
  stratum: id => ({imK: id === 'core' ? 0.7 : 1.3, u5K: id === 'core' ? 0.7 : 1.3}),
  stratumLE: (nationId, stratumId) => (nationId === 'KDZ' ? 62 : 70) + (stratumId === 'core' ? 10 : 0),
  lifeMaxOf: (raceId, courtId) => (raceId === 'sarkaz' ? [80, 180] : [70, 95])
};
const nation = {id: 'KDZ', gap: 5, im: 24, u5: 33.5};

test('time compression is linear to 60 and logarithmic afterwards', () => {
  assert.equal(playAge(0), 0);
  assert.equal(playAge(60), 60);
  const felt = playAge(200);
  assert.ok(felt > 60 && felt < 200, 'long lives feel shorter');
  assert.ok(playAge(201) > felt, 'still monotonic');
  assert.equal(playAgeDeriv(59), 1);
  assert.ok(playAgeDeriv(200) < playAgeDeriv(100), 'the compression deepens with age');
  assert.ok(playAgeDeriv(100) < 1);
});

test('expected health has the documented bands and floor', () => {
  assert.equal(expHealth(0), 72);
  assert.equal(expHealth(3), 80);
  assert.equal(expHealth(20), 90);
  assert.equal(expHealth(30), 90);
  assert.equal(expHealth(45), 90 - 15 * 0.6);
  assert.equal(expHealth(60), 72);
  assert.equal(expHealth(200), 15, 'the floor stops it from going negative');
});

test('a life table reproduces the social life expectancy', () => {
  const builder = createLifeTableBuilder(ports);
  const table = builder.build(nation, 'M', 'sarkaz', null, 'core');

  // Male e0 is socialLE minus 0.51 of the sex gap; the bisection should hit it.
  const expectedE0 = ports.stratumLE('KDZ', 'core') - nation.gap * 0.51;
  assert.equal(table.e0, expectedE0, 'e0 is the target, not the achieved value');
  assert.equal(table.l[0], 1);
  assert.ok(table.l[1] < 1, 'the first year already has deaths');
  for (let age = 1; age <= table.maxAge; age++) {
    assert.ok(table.l[age + 1] <= table.l[age], `survivors never increase (age ${age})`);
  }
  assert.ok(table.q[table.maxAge] === 1, 'the last age is certain');
  assert.equal(table.maxAge, Math.min(1500, Math.ceil(180 * 1.05) + 5));
  assert.deepEqual([...table.lifeMax], [80, 180]);
  assert.equal(table.stratum, 'core');
  assert.equal(table.race, 'sarkaz');
  assert.equal(table.court, null);
});

test('the external hazard bisection moves the right way', () => {
  const builder = createLifeTableBuilder(ports);
  const low = builder.build(nation, 'M', 'sarkaz', null, 'core');
  const high = builder.build({...nation, id: 'YAN'}, 'M', 'sarkaz', null, 'core');
  assert.ok(high.e0 > low.e0, 'the richer nation targets a longer life');
  assert.ok(high.Aext < low.Aext, 'so it needs less external risk to get there');

  const female = builder.build(nation, 'F', 'sarkaz', null, 'core');
  assert.ok(female.e0 > low.e0, 'the female side of the gap lives longer');
});

test('tables are cached per identity, not by build order', () => {
  const builder = createLifeTableBuilder(ports);
  const first = builder.build(nation, 'M', 'sarkaz', null, 'core');
  const again = builder.build(nation, 'M', 'sarkaz', null, 'core');
  assert.equal(first, again, 'the same key returns the same object');
  assert.equal(builder.size(), 1);

  const other = builder.build(nation, 'M', 'sarkaz', 'court', 'core');
  assert.notEqual(first, other, 'a court is a different table');
  assert.equal(builder.size(), 2);
  builder.clear();
  assert.equal(builder.size(), 0);
});
