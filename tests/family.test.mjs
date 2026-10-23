import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ageJob, npcJob, siblingCount, siblingOutOfRange, siblingShape,
  ARTS_REJECT, MILITARY_REJECT, NPC_JOB_ATTEMPTS, NPC_POOL, SIBLING_WEIGHTS
} from '../dist-runtime/simulation.mjs';

const scripted = values => {
  let index = 0;
  const draw = () => values[Math.min(index++, values.length - 1)];
  draw.calls = () => index;
  return draw;
};

/** A world where every job id exists and every job is allowed. */
const ports = (overrides = {}) => ({
  random: scripted([0.5]),
  job: () => ({section: 'agri', sex: null}),
  jobAvailable: () => true,
  ...overrides
});

const subject = (extra = {}) => ({nation: 'YAN', race: 'feline', sex: 'F', ...extra});

test('a relative gets the first job that survives every filter', () => {
  // 0.5 → the middle of the pool, which exists.
  const random = scripted([0.5]);
  const id = npcJob(subject(), ports({random}));
  assert.equal(id, NPC_POOL[Math.floor(0.5 * NPC_POOL.length)]);
  assert.equal(random.calls(), 1, 'one draw for the pick');
});

test('unknown and unavailable jobs are skipped without spending an extra draw', () => {
  const random = scripted([0.1, 0.9]);
  const id = npcJob(subject(), ports({
    random,
    job: value => (value === NPC_POOL[Math.floor(0.1 * NPC_POOL.length)] ? null : {section: 'agri', sex: null})
  }));
  assert.equal(random.calls(), 2, 'the second attempt found a job');
  assert.ok(id);
});

test('a sex-restricted job is skipped for the wrong sex', () => {
  const random = scripted([0.5]);
  const id = npcJob(subject({sex: 'F'}), ports({
    random,
    job: () => ({section: 'agri', sex: 'M'})
  }));
  assert.equal(id, 'vendor', 'every attempt was rejected, so the fallback ran');
  assert.equal(random.calls(), NPC_JOB_ATTEMPTS, 'twenty-four attempts, one draw each');
});

test('military and arts careers cost one extra draw each and are damped', () => {
  // First candidate is military: pick, then the damping roll.
  const military = scripted([0.5, 0.5, 0.5]);
  npcJob(subject(), ports({random: military, job: () => ({section: 'mil', sex: null})}));
  assert.equal(military.calls(), NPC_JOB_ATTEMPTS * 2, 'every attempt spent a pick and a damping roll');

  // A draw below the threshold rejects; above it accepts.
  const accepted = npcJob(subject(), ports({
    random: scripted([0.5, MILITARY_REJECT + 0.01]),
    job: () => ({section: 'mil', sex: null})
  }));
  assert.equal(accepted, NPC_POOL[Math.floor(0.5 * NPC_POOL.length)]);

  const arts = scripted([0.5, ARTS_REJECT + 0.01]);
  const artsJob = npcJob(subject(), ports({random: arts, job: () => ({section: 'art', sex: null})}));
  assert.ok(artsJob);
  assert.equal(arts.calls(), 2, 'the arts branch rolled once');
});

test('the fallback is a vendor, or jobless when even that is unavailable', () => {
  assert.equal(npcJob(subject(), ports({job: () => ({section: 'mil', sex: null}), random: () => 0})),
    'vendor', '0 always rejects the military branch, so the fallback is used');
  assert.equal(
    npcJob(subject(), ports({
      job: () => ({section: 'mil', sex: null}),
      random: () => 0,
      jobAvailable: (id) => id !== 'vendor'
    })),
    'seeking'
  );
});

test('the relative age ladder maps ages to child, student, retired and career', () => {
  const world = ports();
  assert.equal(ageJob(3, subject(), world), 'child');
  assert.equal(ageJob(6, subject(), world), 'child');
  assert.equal(ageJob(7, subject(), world), 'student');
  assert.equal(ageJob(15, subject(), world), 'student');
  assert.equal(ageJob(16, subject(), world), NPC_POOL[Math.floor(0.5 * NPC_POOL.length)], 'sixteen starts work');
  assert.equal(ageJob(66, subject(), world), NPC_POOL[Math.floor(0.5 * NPC_POOL.length)], 'sixty-six still works');
  assert.equal(
    ageJob(67, subject(), ports({chance: () => true})), 'retired', 'past sixty-six a retirement roll decides'
  );
  assert.equal(
    ageJob(70, subject(), ports({chance: () => false})), NPC_POOL[Math.floor(0.5 * NPC_POOL.length)],
    'a failed retirement roll leaves them working'
  );
});

test('the sibling count follows the documented weights', () => {
  assert.deepEqual(SIBLING_WEIGHTS, {'0': 22, '1': 34, '2': 26, '3': 13, '4': 5});
  const total = 22 + 34 + 26 + 13 + 5;

  // The weights are cumulative, so each quarter of the range lands on a known count.
  assert.equal(siblingCount(SIBLING_WEIGHTS, () => 0), 0);
  assert.equal(siblingCount(SIBLING_WEIGHTS, () => 0.21), 0, 'just inside the first bucket');
  assert.equal(siblingCount(SIBLING_WEIGHTS, () => 0.23), 1);
  assert.equal(siblingCount(SIBLING_WEIGHTS, () => 0.99), 4);
  assert.equal(siblingCount(SIBLING_WEIGHTS, () => (22 + 34) / total + 0.001), 2);
});

test('a sibling shape spends three draws: sex, elder flag, gap', () => {
  const random = scripted([0.1, 0.9, 0.5]);
  const shape = siblingShape(random);
  assert.equal(random.calls(), 3);
  assert.equal(shape.sex, 'M', 'a low draw is male');
  assert.equal(shape.elder, false, 'a high draw is younger');
  assert.equal(shape.offset, -(1 + Math.floor(0.5 * 7)), 'the gap is one to seven years');

  const female = siblingShape(scripted([0.9, 0.1, 0.1]));
  assert.equal(female.sex, 'F');
  assert.equal(female.elder, true);
  assert.equal(female.offset, 1);
});

test('a sibling offset is rejected when it puts the mother out of range', () => {
  assert.equal(siblingOutOfRange(10, 40), true, 'forty plus ten is past forty-six');
  assert.equal(siblingOutOfRange(-30, 40), true, 'forty minus thirty is below fifteen');
  assert.equal(siblingOutOfRange(5, 40), false);
  assert.equal(siblingOutOfRange(-20, 40), false);
  assert.equal(siblingOutOfRange(1, 45), false, 'forty-six is still allowed');
  assert.equal(siblingOutOfRange(2, 45), true);
});
