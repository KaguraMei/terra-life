import assert from 'node:assert/strict';
import test from 'node:test';
import {
  educationTier, schoolChance, schoolDuration, schoolGate, schoolSubject
} from '../dist-runtime/simulation.mjs';

const scripted = values => {
  let index = 0;
  const draw = () => values[Math.min(index++, values.length - 1)];
  draw.calls = () => index;
  return {random: draw, draws: () => index, calls: () => index};
};

const subject = (extra = {}) => ({
  age: 6,
  familyTier: 3,
  knowledge: 0,
  nationEducation: 12,
  nationTertiary: 40,
  noSchool: false,
  enrolled: null,
  ...extra
});

test('the duration and tier tables match the ladder', () => {
  assert.equal(schoolDuration('primary'), 6);
  assert.equal(schoolDuration('middle'), 3);
  assert.equal(schoolDuration('high'), 3);
  assert.equal(schoolDuration('uni'), 4);
  assert.equal(schoolDuration('grad'), 3);
  assert.equal(schoolDuration('nope'), 3, 'an unknown stage falls back to three years');

  assert.equal(educationTier('primary'), 1);
  assert.equal(educationTier('grad'), 5);
  assert.equal(educationTier('nope'), 1);
});

test('primary school is open to everyone a nation educates, and costs no draw', () => {
  const random = scripted([0]);
  assert.equal(schoolGate(subject(), random), 'primary');
  assert.equal(random.calls(), 0, 'the first rung never rolls');

  assert.equal(schoolGate(subject({nationEducation: 5}), scripted([0])), null);
  assert.equal(schoolGate(subject({age: 7}), scripted([0])), null, 'the rung is age-exact');
  assert.equal(schoolGate(subject({noSchool: true}), scripted([0])), null);
});

test('an enrolled life never re-enters a gate', () => {
  for (const age of [6, 12, 15, 18, 22]) {
    const random = scripted([0]);
    assert.equal(schoolGate(subject({age, enrolled: 'middle'}), random), null);
    assert.equal(random.calls(), 0, 'no draw is spent while already at school');
  }
});

test('the four higher rungs each ask for one draw and honour their guards', () => {
  // middle: nation edu ≥ 9, tier ≥ 2
  assert.equal(schoolGate(subject({age: 12}), scripted([0])), 'middle');
  assert.equal(schoolGate(subject({age: 12, familyTier: 1}), scripted([0])), null);
  assert.equal(schoolGate(subject({age: 12, nationEducation: 8}), scripted([0])), null);

  // high: nation edu ≥ 11, tier ≥ 3
  assert.equal(schoolGate(subject({age: 15}), scripted([0])), 'high');
  assert.equal(schoolGate(subject({age: 15, familyTier: 2}), scripted([0])), null);

  // uni: tertiary ≥ 30, tier ≥ 3, knowledge ≥ 55
  assert.equal(schoolGate(subject({age: 18, knowledge: 60}), scripted([0])), 'uni');
  assert.equal(schoolGate(subject({age: 18, knowledge: 54}), scripted([0])), null);
  assert.equal(schoolGate(subject({age: 18, nationTertiary: 29}), scripted([0])), null);

  // grad: tertiary ≥ 50, tier ≥ 4, knowledge ≥ 75
  assert.equal(
    schoolGate(subject({age: 22, knowledge: 80, familyTier: 4, nationTertiary: 55}), scripted([0])), 'grad'
  );
  assert.equal(
    schoolGate(subject({age: 22, knowledge: 74, familyTier: 4, nationTertiary: 55}), scripted([0])), null
  );
  assert.equal(
    schoolGate(subject({age: 22, knowledge: 80, familyTier: 3, nationTertiary: 55}), scripted([0])), null
  );
});

test('a failed roll spends the draw and grants nothing', () => {
  const random = scripted([0.999]);
  assert.equal(schoolGate(subject({age: 12}), random), null);
  assert.equal(random.calls(), 1, 'the roll still happened');

  const skipped = scripted([0.999]);
  assert.equal(schoolGate(subject({age: 12, familyTier: 1}), skipped), null);
  assert.equal(skipped.calls(), 0, 'a failed guard short-circuits before the draw');
});

test('the chance formulas rise with a nation\'s tertiary enrolment', () => {
  assert.equal(schoolChance('middle', 40), 0.55 + 40 / 200);
  assert.equal(schoolChance('high', 40), 0.35 + 40 / 160);
  assert.equal(schoolChance('uni', 40), 40 / 130);
  assert.equal(schoolChance('grad', 40), 40 / 220);
  assert.equal(schoolChance('primary', 40), 1, 'the free rung is certain');

  for (const level of ['middle', 'high', 'uni', 'grad']) {
    assert.ok(schoolChance(level, 60) > schoolChance(level, 20), `${level} improves with enrolment`);
  }
});

test('a gate uses the same threshold the chance formula reports', () => {
  // At the exact threshold the roll succeeds; just below it fails.
  const level = 'middle';
  const ter = 40;
  const p = schoolChance(level, ter);
  assert.equal(schoolGate(subject({age: 12, nationTertiary: ter}), scripted([p - 1e-9])), level);
  assert.equal(schoolGate(subject({age: 12, nationTertiary: ter}), scripted([p])), null);
});

test('the school subject reads a life without touching anything else', () => {
  const view = schoolSubject({
    age: 15, q: 4, school: 'high', st: {sm: 61}, flags: {noSchool: 1}
  }, {edu: 13, ter: 55});

  assert.equal(view.age, 15);
  assert.equal(view.familyTier, 4);
  assert.equal(view.knowledge, 61);
  assert.equal(view.nationEducation, 13);
  assert.equal(view.nationTertiary, 55);
  assert.equal(view.enrolled, 'high');
  assert.equal(view.noSchool, true, 'a stored 1 is still true');
});

test('the school subject survives a missing life or a missing nation', () => {
  const empty = schoolSubject(undefined, null);
  assert.equal(empty.age, 0);
  assert.equal(empty.enrolled, null);
  assert.equal(empty.nationEducation, 0);
  assert.equal(empty.noSchool, false);
  assert.equal(schoolGate(empty, scripted([0])), null);

  assert.equal(schoolSubject({school: null}, {edu: 9, ter: 30}).enrolled, null);
  assert.equal(schoolSubject({school: 7}, {edu: 9, ter: 30}).enrolled, null, 'a non-string stage is ignored');
});
