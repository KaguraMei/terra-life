import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyEffectPatch, createSimulation, logEntry, logOverflows, logTrimStart,
  DIMENSION_ORDER, LOG_CAP, LOG_TRIM
} from '../dist-runtime/simulation.mjs';

const clamp = (value, low, high) => (value < low ? low : value > high ? high : value);

const values = (extra = {}) => ({
  hl: 60, h: 50, so: 40, sm: 30, money: 100, arts: 20, ...extra
});

test('a log entry always carries age, year, text and a kind', () => {
  const entry = logEntry({age: 7, year: 1092}, '你上学了。');
  assert.equal(entry.age, 7);
  assert.equal(entry.year, 1092);
  assert.equal(entry.text, '你上学了。');
  assert.equal(entry.kind, 'ev', 'the default kind is the generic event');
});

test('an explicit kind wins, and extra fields are copied on top', () => {
  const entry = logEntry({age: 1, year: 1}, 'x', 'mil', {key: 'school', organization: 'rhine_life'});
  assert.equal(entry.kind, 'mil');
  assert.equal(entry.key, 'school');
  assert.equal(entry.organization, 'rhine_life');

  const overridden = logEntry({age: 1, year: 1}, 'x', 'mil', {kind: 'death'});
  assert.equal(overridden.kind, 'death', 'extra may override a base field');
});

test('an empty kind falls back to the default', () => {
  assert.equal(logEntry({age: 0, year: 0}, 'x', '').kind, 'ev');
  assert.equal(logEntry({age: 0, year: 0}, 'x', null).kind, 'ev');
});

test('the log cap and the trim size are the documented numbers', () => {
  assert.equal(LOG_CAP, 4000);
  assert.equal(LOG_TRIM, 500);
  assert.equal(logOverflows(LOG_CAP), false, 'exactly at the cap is fine');
  assert.equal(logOverflows(LOG_CAP + 1), true);
  assert.equal(logTrimStart(), LOG_TRIM);
});

test('a patch moves every dimension it names, in the documented order', () => {
  assert.deepEqual(DIMENSION_ORDER, ['hl', 'h', 'so']);
  const next = applyEffectPatch(values(), {hl: -5, h: 5, so: 10, sm: 2, arts: 3}, clamp);
  assert.equal(next.hl, 55);
  assert.equal(next.h, 55);
  assert.equal(next.so, 50);
  assert.equal(next.sm, 32);
  assert.equal(next.arts, 23);
  assert.equal(next.money, 100, 'money is untouched when the patch has none');
});

test('a falsy delta writes nothing at all', () => {
  const before = values();
  const next = applyEffectPatch(before, {hl: 0, money: 0, arts: 0}, clamp);
  assert.deepEqual(next, before);
  assert.notEqual(next, before, 'the result is a new record, never the same object');
});

test('dimensions clamp to 0..100 while money does not', () => {
  const high = applyEffectPatch(values({hl: 99, arts: 99}), {hl: 50, arts: 50}, clamp);
  assert.equal(high.hl, 100);
  assert.equal(high.arts, 100);

  const low = applyEffectPatch(values({hl: 2, so: 3}), {hl: -50, so: -50}, clamp);
  assert.equal(low.hl, 0);
  assert.equal(low.so, 0);

  const rich = applyEffectPatch(values({money: 100}), {money: 1e9}, clamp);
  assert.equal(rich.money, 100 + 1e9);
  const broke = applyEffectPatch(values({money: 100}), {money: -1e9}, clamp);
  assert.equal(broke.money, 100 - 1e9, 'debt may take the balance negative');
});

test('the patch never mutates the input', () => {
  const before = values();
  applyEffectPatch(before, {hl: -5, money: -50}, clamp);
  assert.equal(before.hl, 60);
  assert.equal(before.money, 100);
});

test('the runtime writes an effect patch back onto the life', () => {
  const TL = createSimulation();
  const S = TL.newLife({seed: 717001, nation: 'YAN', bornYear: 1060});
  Object.assign(S.st, {hl: 60, h: 50, so: 40, sm: 30});
  S.money = 100;
  S.arts = 20;

  const patch = {hl: -5, h: 5, so: 10, sm: 2, money: -30, arts: 3};
  const returned = TL.eff(S, patch);
  assert.equal(returned, patch, 'eff returns the patch it was given');
  assert.equal(S.st.hl, 55);
  assert.equal(S.st.h, 55);
  assert.equal(S.st.so, 50);
  assert.equal(S.st.sm, 32);
  assert.equal(S.money, 70);
  assert.equal(S.arts, 23);
});

test('the runtime logs through the typed entry builder', () => {
  const TL = createSimulation();
  const S = TL.newLife({seed: 717002, nation: 'YAN', bornYear: 1060});
  const before = S.log.length;
  const entry = TL.log(S, 'probe entry', 'mil', {key: 'probe'});
  assert.equal(S.log.length, before + 1);
  assert.equal(entry.kind, 'mil');
  assert.equal(entry.key, 'probe');
  assert.equal(entry.age, S.age);
  assert.equal(entry.year, S.year);

  const narrated = TL.narrate(S, 'narration', null, null);
  assert.equal(narrated.kind, 'ev');
});
