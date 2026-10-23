import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createUi} from '../tools/ui-render-harness.mjs';

// The report screen is rendered by main.js itself (it is a screen, not a panel),
// so this test boots the real application and lets it finish a life through the
// documented `?go=1&auto=1&seed=...&ff=...` path. That keeps the whole chain —
// start, fast-forward, death, report — reproducible from the URL alone.
//
// Regenerate with:
//   REPORT_SNAPSHOT_WRITE=1 node --test tests/report-snapshot.test.mjs
const FIXTURE = new URL('./fixtures/report-snapshots.json', import.meta.url);

/** Ids inside #report that carry text or markup (charts are canvas, not markup). */
const IDS = ['rTitle', 'rDead', 'rGrid', 'rChartLbl', 'rWealthLbl', 'rLogLbl', 'reportLog'];

const READS = ['js/ui/pixelart.js', 'js/ui/render.js', 'js/ui/landing.js', 'js/main.js'];
const STUB = ['initLanding', 'renderLandingOdds', 'renderLandingTitle'];

const CASES = [
  {name: 'long-life', seed: 'rep-5', expect: {age: 92, organization: null, infected: false}},
  {name: 'organization', seed: 'life-16', expect: {age: 30, organization: 'raythean', infected: false}},
  {name: 'infected', seed: 'life-4', expect: {age: 18, organization: null, infected: true}}
];

function finishLife(cs) {
  const ui = createUi({
    boot: true,
    search: `?go=1&auto=1&seed=${cs.seed}&by=1040&ff=95`,
    reads: READS,
    stub: STUB
  });
  const state = ui.TL.S;
  assert.ok(state, `seed ${cs.seed} did not start a life`);
  assert.equal(state.phase, 'report', `seed ${cs.seed} did not reach the report screen`);
  assert.equal(Math.floor(state.age), cs.expect.age, `seed ${cs.seed} age drifted`);
  assert.equal(state.affiliation ?? null, cs.expect.organization,
    `seed ${cs.seed} organization drifted`);
  assert.equal(Boolean(state.ori && state.ori.stage > 0), cs.expect.infected,
    `seed ${cs.seed} infection drifted`);
  assert.equal(ui.element('report').hidden, false, 'the report screen is shown');
  return ui.snapshot(IDS);
}

const captured = new Map();
for (const item of CASES) captured.set(item.name, finishLife(item));

if (process.env.REPORT_SNAPSHOT_WRITE === '1') {
  const payload = {};
  for (const item of CASES) payload[item.name] = {seed: item.seed, expected: item.expect, markup: captured.get(item.name)};
  fs.writeFileSync(FIXTURE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

test('the report screen renders exactly the frozen markup', () => {
  const frozen = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const item of CASES) {
    const expected = frozen[item.name];
    assert.ok(expected, `missing frozen report for ${item.name}`);
    const actual = captured.get(item.name);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected.markup),
      `${item.name}: report markup changed\n` +
      IDS.filter(id => JSON.stringify(actual[id]) !== JSON.stringify(expected.markup[id]))
        .map(id => `  ${id}:\n    frozen: ${JSON.stringify(expected.markup[id])}\n    actual: ${JSON.stringify(actual[id])}`)
        .join('\n'));
  }
});
