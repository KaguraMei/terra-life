import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateInterview, interviewSession, questionAvailable} from '../dist-runtime/simulation.mjs';

const LABELS = {grit: '意志', craft: '技艺', temper: '性情'};

const axes = [
  {id: 'grit', weight: 0.5, minimum: 40},
  {id: 'craft', weight: 0.3, minimum: 30},
  {id: 'temper', weight: 0.2, minimum: 40}
];

// Every option scores all three axes, so a single answer sheet can in principle
// max out each axis.  is the model answer,  is craft-heavy, c is grit-heavy.
const question = id => ({
  id,
  options: [
    {id: 'a', scores: {grit: 3, craft: 3, temper: 3}},
    {id: 'b', scores: {grit: 1, craft: 3, temper: 1}},
    {id: 'c', scores: {grit: 3, craft: 1, temper: 1}}
  ]
});

const session = (answers, overrides = {}) => ({
  axes,
  questions: [question('q1'), question('q2'), question('q3')],
  answers,
  passScore: 60,
  waitlistScore: 40,
  ...overrides
});

test('an unfinished session cannot be scored', () => {
  assert.equal(evaluateInterview(null, LABELS).status, 'incomplete');
  assert.equal(evaluateInterview(session([]), LABELS).status, 'incomplete');
  assert.equal(evaluateInterview(session([{question: 'q1', option: 'a'}]), LABELS).status, 'incomplete');
});

test('a perfect answer sheet scores 100 and passes', () => {
  const verdict = evaluateInterview(session([
    {question: 'q1', option: 'a'},
    {question: 'q2', option: 'a'},
    {question: 'q3', option: 'a'}
  ]), LABELS);
  assert.equal(verdict.status, 'passed');
  assert.equal(verdict.score, 100);
  assert.deepEqual(verdict.gaps, []);
  assert.equal(verdict.axes.length, 3);
  assert.equal(verdict.axes[0].label, '意志', 'labels come from the axis table');
  assert.equal(verdict.passScore, 60);
});

test('each axis is a share of the best possible answer on that axis', () => {
  // a=(3,3,3) b=(1,3,1) c=(3,1,1); the per-axis maximum is 3 per question, so 9.
  const mixed = evaluateInterview(session([
    {question: 'q1', option: 'a'},
    {question: 'q2', option: 'b'},
    {question: 'q3', option: 'c'}
  ]), LABELS);
  const value = id => mixed.axes.find(axis => axis.id === id).value;
  assert.ok(Math.abs(value('grit') - (7 / 9) * 100) < 1e-9);
  assert.ok(Math.abs(value('craft') - (7 / 9) * 100) < 1e-9);
  assert.ok(Math.abs(value('temper') - (5 / 9) * 100) < 1e-9);

  // The weighted total uses those shares, not the raw sums.
  const expected = (7 / 9) * 100 * 0.5 + (7 / 9) * 100 * 0.3 + (5 / 9) * 100 * 0.2;
  assert.ok(Math.abs(mixed.score - expected) < 1e-9);
});

test('one disqualified axis blocks a pass even with a high total', () => {
  // All grit-heavy answers: craft and temper land at 33.3. The total (66.7) clears
  // the pass score, but temper is under its minimum of 40, which blocks the pass.
  const verdict = evaluateInterview(session([
    {question: 'q1', option: 'c'},
    {question: 'q2', option: 'c'},
    {question: 'q3', option: 'c'}
  ]), LABELS);
  assert.ok(verdict.score >= 60, 'the total clears the pass score');
  assert.deepEqual([...verdict.gaps], ['temper']);
  assert.notEqual(verdict.status, 'passed', 'a gap must block the pass');
  assert.equal(verdict.status, 'waitlisted');
});

test('the waitlist threshold sits between rejection and a pass', () => {
  const weak = evaluateInterview(session([
    {question: 'q1', option: 'c'},
    {question: 'q2', option: 'c'},
    {question: 'q3', option: 'c'}
  ], {passScore: 90, waitlistScore: 80}), LABELS);
  assert.equal(weak.status, 'rejected', 'below the waitlist threshold is a rejection');

  const middling = evaluateInterview(session([
    {question: 'q1', option: 'a'},
    {question: 'q2', option: 'b'},
    {question: 'q3', option: 'c'}
  ], {passScore: 90, waitlistScore: 30}), LABELS);
  assert.equal(middling.status, 'waitlisted');
});

test('an answer that does not match its question is a hard error', () => {
  const mismatched = session([
    {question: 'q2', option: 'a'},
    {question: 'q2', option: 'a'},
    {question: 'q3', option: 'a'}
  ]);
  assert.throws(() => evaluateInterview(mismatched, LABELS), /Interview answer mismatch/);

  const unknownOption = session([
    {question: 'q1', option: 'zz'},
    {question: 'q2', option: 'a'},
    {question: 'q3', option: 'a'}
  ]);
  assert.throws(() => evaluateInterview(unknownOption, LABELS), /Interview answer mismatch/);
});

test('the stored session shape keeps its pool snapshot', () => {
  const stored = {
    version: 1,
    pool: {axes, passScore: 60, waitlistScore: 40, questionPool: 'blacksteel_ops'},
    questions: [question('q1')],
    answers: [{question: 'q1', option: 'a'}]
  };
  const normalised = interviewSession(stored);
  assert.equal(normalised.axes.length, 3, 'axes are read from the pool snapshot');
  assert.equal(normalised.passScore, 60);
  assert.equal(evaluateInterview(normalised, LABELS).status, 'passed');

  assert.equal(interviewSession(null), null);
  assert.equal(interviewSession({}), null, 'a session without questions is unusable');
});

test('question year windows are inclusive and open-ended', () => {
  assert.equal(questionAvailable({fromYear: 1080, untilYear: 1090}, 1080), true);
  assert.equal(questionAvailable({fromYear: 1080, untilYear: 1090}, 1090), true);
  assert.equal(questionAvailable({fromYear: 1080, untilYear: 1090}, 1079), false);
  assert.equal(questionAvailable({fromYear: 1080, untilYear: 1090}, 1091), false);
  assert.equal(questionAvailable({fromYear: 1080}, 2000), true, 'an open upper bound never expires');
  assert.equal(questionAvailable({}, 1000), true, 'no window means always available');
});
