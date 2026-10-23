import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createSimulation, validateEffects, EffectError} from '../dist-runtime/simulation.mjs';

const baseline = JSON.parse(fs.readFileSync(
  new URL('./fixtures/event-effects-baseline.json', import.meta.url), 'utf8'));

/** Same construction as tools/capture-event-baseline.mjs, so the comparison is meaningful. */
function replay(TL, index, caseId) {
  const state = TL.newLife({seed: 5150 + index, nation: 'URS', race: 'ursus', bornYear: 1070});
  Object.assign(state, {
    age: 10, year: 1080, job: 'child', eduLevel: 0,
    flags: {}, evCount: {}, log: [], recent: []
  });
  TL.seedRng(900 + index);
  const definition = TL.EVMAP[caseId];
  assert.ok(definition, `event ${caseId} still exists`);
  const text = definition.run(state, undefined);
  return {text: typeof text === 'string' ? {t: text} : text, state, tail: Array.from({length: 8}, () => TL.rnd())};
}

test('events rewritten as declared effects keep their exact behaviour', () => {
  assert.ok(baseline.cases.length >= 3);
  const TL = createSimulation();
  baseline.cases.forEach((row, index) => {
    const actual = replay(TL, index, row.id);
    assert.deepEqual(actual.text, row.text, `${row.id}: narrative text changed`);
    assert.equal(JSON.stringify(actual.state), JSON.stringify(row.state),
      `${row.id}: state after the event changed`);
    assert.deepEqual(actual.tail, row.rngTail, `${row.id}: random stream changed`);
  });
});

test('effect lists are validated as a whole before anything is applied', () => {
  const TL = createSimulation();
  const state = TL.newLife({seed: 4242, nation: 'URS', race: 'ursus'});
  Object.assign(state, {age: 30, flags: {}, money: 100});
  const before = JSON.stringify(state);

  const invalid = [
    ['effects.not-array', 'not a list'],
    ['effects.empty', []],
    ['effect.unknown-kind', [{kind: 'job', job: 'scholar'}]],
    ['effect.unknown-property', [{kind: 'attributes', helth: 3}]],
    ['effect.unknown-attribute', [{kind: 'attributes', luck: 3}]],
    ['effect.non-finite', [{kind: 'money', amount: Number.NaN}]],
    ['effect.non-finite', [{kind: 'attributes', h: Number.POSITIVE_INFINITY}]],
    ['effect.empty-attributes', [{kind: 'attributes'}]],
    ['effect.empty-flag-name', [{kind: 'flag', name: ''}]],
    ['effect.invalid-flag-value', [{kind: 'setFlag', name: 'x', value: {nested: true}}]]
  ];
  for (const [code, effects] of invalid) {
    assert.ok(validateEffects(effects).some(item => item.code === code),
      `expected diagnostic ${code} for ${JSON.stringify(effects)}`);
    assert.throws(() => TL.applyEffects(state, effects), EffectError,
      'an invalid list must not be applied');
    assert.equal(JSON.stringify(state), before, 'a rejected list must leave state untouched');
  }

  // A mixed list with one bad entry is rejected entirely: no partial writes.
  const mixed = [{kind: 'attributes', h: -5}, {kind: 'job', job: 'scholar'}];
  assert.throws(() => TL.applyEffects(state, mixed), EffectError);
  assert.equal(JSON.stringify(state), before);

  assert.deepEqual(validateEffects([{kind: 'attributes', h: -1, arts: 2}, {kind: 'money', amount: 3},
    {kind: 'flag', name: 'seen'}, {kind: 'setFlag', name: 'mood', value: 'tired'}]), []);
});

test('the effect ports apply attributes, money and flags once each', () => {
  const TL = createSimulation();
  const state = TL.newLife({seed: 4343, nation: 'URS', race: 'ursus'});
  Object.assign(state, {age: 30, flags: {}, money: 100, arts: 10});
  state.st = {hl: 50, h: 50, sm: 50, so: 50};

  const applied = TL.applyEffects(state, [
    {kind: 'attributes', h: -10, sm: 3},
    {kind: 'money', amount: 25},
    {kind: 'flag', name: 'strikes'},
    {kind: 'flag', name: 'strikes', delta: 2},
    {kind: 'setFlag', name: 'mood', value: 'tired'}
  ]);
  assert.equal(applied, 5);
  assert.equal(state.st.h, 40);
  assert.equal(state.st.sm, 53);
  assert.equal(state.st.hl, 50, 'untouched attributes stay put');
  assert.equal(state.money, 125);
  assert.equal(state.flags.strikes, 3);
  assert.equal(state.flags.mood, 'tired');
});
