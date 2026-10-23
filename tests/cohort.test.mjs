import assert from 'node:assert/strict';
import test from 'node:test';
import {drawDeathAge, cohortAliveAt, buildCohort} from '../dist-runtime/simulation.mjs';

// l(x) for a synthetic table: 90% reach 1, 60% reach 2, 30% reach 3, 10% reach 4.
const table = {maxAge: 4, l: [1, 0.9, 0.6, 0.3, 0.1, 0]};

test('drawDeathAge inverts the survival function', () => {
  assert.equal(drawDeathAge(table, () => 0.7), 1, 'first age whose l(x+1) <= 0.7');
  assert.equal(drawDeathAge(table, () => 0.4), 2);
  assert.equal(drawDeathAge(table, () => 0.05), 4, 'surviving past every bucket ends at maxAge');
  assert.equal(drawDeathAge(table, () => 0.95), 0);
  // A draw below every l(x+1) still terminates instead of looping forever.
  assert.equal(drawDeathAge({maxAge: 0, l: [1, 0.5]}, () => 0.9), 0);
});

test('cohortAliveAt counts the share still alive', () => {
  const deaths = [10, 20, 30, 40];
  assert.equal(cohortAliveAt(deaths, 0), 1);
  assert.equal(cohortAliveAt(deaths, 25), 0.5);
  // Death at exactly `age` still counts as alive at that age (a birthday), which is
  // the legacy semantics the save fixture pins.
  assert.equal(cohortAliveAt(deaths, 10), 1);
  assert.equal(cohortAliveAt(deaths, 11), 0.75);
  assert.equal(cohortAliveAt(deaths, 41), 0);
  assert.equal(cohortAliveAt([], 30), 1, 'an empty cohort is trivially alive');
});

test('buildCohort samples the curve and sorts the peers', () => {
  let seed = 1;
  const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const cohort = buildCohort(
    {nation: 'KDZ', race: 'sarkaz'},
    table,
    {
      random,
      peerRaces: () => ['sarkaz', 'lung'],
      makeName: (nation, sex, race) => ({given: `g-${nation}-${sex}`, full: `f-${race}`})
    },
    {curveSamples: 100, peerCount: 3, curveStep: 1}
  );

  assert.equal(cohort.size, 100);
  assert.equal(cohort.deaths.length, 100);
  assert.deepEqual([...cohort.deaths], [...cohort.deaths].sort((a, b) => a - b), 'deaths are sorted');
  assert.equal(cohort.peers.length, 3);
  assert.deepEqual(cohort.peers.map(peer => peer.deathAt), cohort.peers.map(p => p.deathAt).sort((a, b) => a - b));
  for (const peer of cohort.peers) {
    assert.match(peer.name, /^g-KDZ-[MF]$/);
    assert.match(peer.fullName, /^f-(sarkaz|lung)$/);
    assert.ok(peer.sex === 'M' || peer.sex === 'F');
  }
  assert.equal(cohort.curve[0].age, 0);
  assert.equal(cohort.curve[0].alive, 1, 'everyone is alive at age 0');
  assert.ok(cohort.curve.at(-1).alive <= 0.2, 'the last bucket is nearly empty');
});

test('buildCohort consumes the random stream in a fixed order', () => {
  const make = () => {
    let seed = 7;
    const random = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    return buildCohort({nation: 'KDZ', race: 'sarkaz'}, table, {
      random,
      peerRaces: () => ['sarkaz'],
      makeName: () => ({given: 'g', full: 'f'})
    }, {curveSamples: 20, peerCount: 2, curveStep: 5});
  };
  assert.deepEqual(JSON.parse(JSON.stringify(make())), JSON.parse(JSON.stringify(make())),
    'the same generator state yields the same cohort');
});
