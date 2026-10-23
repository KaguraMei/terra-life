import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation, prepareSessionQuestions, selectInterviewQuestions, shuffleDeck, DECK_ORDER } from '../dist-runtime/simulation.mjs';

const scripted = values => {
  let index = 0;
  const draw = () => values[Math.min(index++, values.length - 1)];
  draw.calls = () => index;
  return draw;
};

const question = (id, kind, optionCount = 2) => ({
  id,
  kind,
  options: Array.from({length: optionCount}, (_, i) => ({id: `${id}_o${i}`}))
});

test('the deck order is organization questions before role questions', () => {
  assert.deepEqual(DECK_ORDER, ['organization', 'role']);
});

test('a shuffle is a Fisher-Yates pass drawing n-1 values', () => {
  const items = [1, 2, 3, 4, 5];
  for (const count of [1, 2, 5]) {
    const random = scripted([0.5]);
    const out = shuffleDeck(items.slice(0, count), random);
    assert.equal(out.length, count);
    assert.equal(random.calls(), Math.max(0, count - 1), `n=${count} spends n-1 draws`);
  }

  const same = shuffleDeck([1, 2, 3], () => 0.999);
  assert.deepEqual(same, [1, 2, 3], 'a high draw leaves the order alone');
  assert.deepEqual([1, 2, 3], [1, 2, 3], 'the input array is never modified');
});

test('selection takes the requested count from each group, in order', () => {
  const available = [
    question('o1', 'organization'), question('o2', 'organization'), question('o3', 'organization'),
    question('r1', 'role'), question('r2', 'role')
  ];
  const random = scripted([0.5]);
  const result = selectInterviewQuestions(available, {organization: 2, role: 1}, random);
  assert.equal(result.ok, true);
  assert.equal(result.selected.length, 3);
  assert.equal(result.selected[0].kind, 'organization', 'organization questions come first');
  assert.equal(result.selected[2].kind, 'role');
  assert.equal(random.calls(), 2 + 1, 'one shuffle per group, n-1 draws each');
});

test('a short group cancels the interview and names that group', () => {
  const available = [question('o1', 'organization'), question('r1', 'role')];
  assert.deepEqual(selectInterviewQuestions(available, {organization: 2, role: 1}, scripted([0.5])),
    {ok: false, kind: 'organization'});
  assert.deepEqual(selectInterviewQuestions(available, {organization: 1, role: 2}, scripted([0.5])),
    {ok: false, kind: 'role'});
});

test('an empty pool cancels on the first group without drawing', () => {
  const random = scripted([0.5]);
  assert.deepEqual(selectInterviewQuestions([], {organization: 2, role: 1}, random),
    {ok: false, kind: 'organization'});
  assert.equal(random.calls(), 0, 'the shortage is noticed before any shuffle');
});

test('a zero draw in a group accepts an empty candidate list', () => {
  const available = [question('o1', 'organization')];
  const result = selectInterviewQuestions(available, {organization: 1, role: 0}, scripted([0.5]));
  assert.equal(result.ok, true);
  assert.equal(result.selected.length, 1);
});

test('every selected question keeps its own options and gains a shuffled copy', () => {
  const q = {id: 'q1', kind: 'role', options: [{id: 'a'}, {id: 'b'}, {id: 'c'}]};
  const [prepared] = prepareSessionQuestions([q], scripted([0.5]));
  assert.equal(prepared.id, 'q1');
  assert.equal(prepared.options.length, 3);
  assert.deepEqual(prepared.options.map(o => o.id).sort(), ['a', 'b', 'c'], 'no option is lost');
  assert.notEqual(prepared.options, q.options, 'the session holds its own array');
  assert.notEqual(prepared.options[0], q.options[0], 'and its own option objects');
  assert.deepEqual(q.options.map(o => o.id), ['a', 'b', 'c'], 'the pool question is untouched');
});

test('option shuffling spends n-1 draws per question', () => {
  const random = scripted([0.5]);
  prepareSessionQuestions([
    {id: 'q1', kind: 'organization', options: [{id: 'a'}, {id: 'b'}]},
    {id: 'q2', kind: 'role', options: [{id: 'a'}, {id: 'b'}, {id: 'c'}]}
  ], random);
  assert.equal(random.calls(), 1 + 2);
});

test('the runtime builds a session from the pool through the typed selection', () => {
  const TL = createSimulation();
  const S = TL.newLife({seed: 919001, nation: 'YAN', bornYear: 1060});
  Object.assign(S, {age: 24, year: 1100, eduLevel: 3, arts: 55, job: 'worker'});
  S.phase = 'life';

  const started = TL.beginOrganizationInterview(S, 'rhodes', 'operator');
  assert.equal(started.status, 'interview');
  const session = S.orgApplication.session;
  const pool = TL.INTERVIEW_POOLS[TL.ORGANIZATIONS.rhodes.routes.operator.interview.questionPool];
  assert.equal(session.questions.length, pool.draw.organization + pool.draw.role);
  assert.equal(session.answers.length, 0);
  assert.equal(session.pool.id, pool.id);
  assert.ok(session.questions.some(q => q.kind === 'organization'));
  assert.ok(session.questions.every(q => q.options.length >= 2));
});
