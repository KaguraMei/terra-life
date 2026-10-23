import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createUi} from '../tools/ui-render-harness.mjs';

// The birth screen (roll + certificate) is rendered by js/ui/landing.js. It drives
// its roll through setTimeout, so the harness drains a timer queue instead of
// waiting; `specified` picks the single-frame path.
//
// Regenerate with:
//   LANDING_SNAPSHOT_WRITE=1 node --test tests/landing-snapshot.test.mjs
const FIXTURE = new URL('./fixtures/landing-snapshots.json', import.meta.url);

const IDS = [
  'startTitle', 'startBtn', 'oddsTable', 'oddsAll',
  'rollName', 'rollMeta',
  'certNumber', 'certName', 'certStory', 'certPace', 'certFields', 'certOdds', 'certPeers'
];

const READS = ['js/ui/pixelart.js', 'js/ui/render.js', 'js/ui/landing.js', 'js/main.js'];

const CASES = [
  {name: 'specified-nation', seed: 1234567, nation: 'KDZ', race: 'sarkaz', specified: true, mode: 'birth'},
  {name: 'random-draw', seed: 7654321, nation: null, race: null, specified: false, mode: 'birth'},
  {name: 'population-mode', seed: 1234567, nation: 'YAN', race: 'lung', specified: true, mode: 'pop'}
];

function certificate(cs) {
  const ui = createUi({boot: true, search: '?hold=1', reads: READS});
  const TL = ui.TL;
  const config = {seed: cs.seed, bornYear: 1040, pace: 'normal'};
  if (cs.nation) config.nation = cs.nation;
  if (cs.race) config.race = cs.race;
  const state = TL.newLife(config);
  let begun = false;
  TL.birthIntro(state, {mode: cs.mode, specified: cs.specified}, () => { begun = true; });
  const ran = ui.runTimers(400);
  assert.ok(ran > 0, `${cs.name}: the roll never ran`);
  assert.equal(begun, false, 'the certificate waits for the player');
  return {age: state.age, nation: state.nation, race: state.race, markup: ui.snapshot(IDS)};
}

const captured = new Map();
for (const item of CASES) captured.set(item.name, certificate(item));

if (process.env.LANDING_SNAPSHOT_WRITE === '1') {
  const payload = {};
  for (const item of CASES) payload[item.name] = {config: item, ...captured.get(item.name)};
  fs.writeFileSync(FIXTURE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

test('the birth certificate renders exactly the frozen markup', () => {
  const frozen = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const item of CASES) {
    const expected = frozen[item.name];
    assert.ok(expected, `missing frozen certificate for ${item.name}`);
    const actual = captured.get(item.name);
    assert.equal(actual.nation, expected.nation, `${item.name}: drawn nation drifted`);
    assert.equal(actual.race, expected.race, `${item.name}: drawn race drifted`);
    assert.equal(JSON.stringify(actual.markup), JSON.stringify(expected.markup),
      `${item.name}: certificate markup changed\n` +
      IDS.filter(id => JSON.stringify(actual.markup[id]) !== JSON.stringify(expected.markup[id]))
        .map(id => `  ${id}:\n    frozen: ${JSON.stringify(expected.markup[id])}\n    actual: ${JSON.stringify(actual.markup[id])}`)
        .join('\n'));
  }
});
