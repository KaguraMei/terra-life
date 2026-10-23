import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createSimulation} from '../dist-runtime/simulation.mjs';
import {createUi} from '../tools/ui-render-harness.mjs';

// Frozen markup for the blocks being refactored. Regenerate with
//   RENDER_SNAPSHOT_WRITE=1 node --test tests/render-snapshots.test.mjs
// and read the diff: a snapshot change is a visible change for the player.
const FIXTURE = new URL('./fixtures/render-snapshots.json', import.meta.url);
const IDS = [
  // 顶栏 + 身份记录
  'brandSub', 'ageBig', 'ageUnit', 'metaL1', 'metaL2',
  'idTitle', 'idCode', 'idName', 'idSub', 'idTags', 'idTable', 'mrzText',
  // 状态：四维 / 结晶率
  'statTitle', 'statBody',
  // 财产
  'wealthTitle', 'nwLabel', 'incLabel', 'nwVal', 'incVal', 'factList',
  // 生存曲线（画布之外的可读文本）
  'survTitle', 'survHint', 'survStat',
  // 家庭与同龄人
  'famTitle', 'famList', 'peerTitle', 'peers', 'peerSum',
  // 人生地图
  'mapTitle', 'lifeMap', 'mapLegendTxt', 'mapHint',
  // 场景 / 焦点 / 日志 / 抉择弹层
  'sceneCap', 'stageHint', 'focusDesc', 'focusList', 'feed',
  'modalTitle', 'modalSub', 'modalText', 'modalOpts'
];

/**
 * Cases are chosen to cover the branches the panels draw, and each one asserts it
 * actually reached the requested age: a seed that dies early would silently
 * reduce coverage while the snapshot still passed.
 */
const CASES = [
  {name: 'birth', seed: 424242, age: 0},
  {name: 'worker', seed: 700100, age: 26},
  {name: 'infected-operator', seed: 700126, age: 34, infect: true, organization: 'rhine_life'},
  {name: 'retiree', seed: 700126, age: 70}
];

function lifeAt({seed, age, infect, organization}) {
  const runtime = createSimulation();
  const state = runtime.newLife({seed, nation: 'KDZ', race: 'sarkaz', bornYear: 1040, pace: 'short'});
  let guard = 0;
  while (state.age < age && state.phase === 'life' && guard++ < 40000) {
    if (!state.focus) state.focus = runtime.autoFocus(state);
    runtime.tick(state, state.yearSec / 8);
    if (state.pending) runtime.autoChoose(state);
  }
  assert.equal(state.phase, 'life', `seed ${seed} died before age ${age}; pick a surviving seed`);
  assert.ok(state.age >= age, `seed ${seed} stopped at ${state.age}, expected at least ${age}`);
  if (infect && !state.ori) runtime.infect(state, true);
  if (organization && !state.affiliation) {
    const joined = runtime.joinOrganization(state, organization,
      Object.keys(runtime.ORGANIZATIONS[organization].routes)[0]);
    assert.ok(joined, `seed ${seed} could not join ${organization}`);
  }
  return JSON.parse(JSON.stringify(state));
}

function render(state) {
  const ui = createUi({reads: ['js/ui/pixelart.js', 'js/ui/render.js']});
  state.__tl = undefined;
  delete state.__tl;
  ui.TL.renderTop(state);
  ui.TL.renderIdentity(state);
  ui.TL.renderStats(state);
  ui.TL.renderWealth(state);
  ui.TL.renderSurvival(state);
  ui.TL.renderFamily(state);
  ui.TL.renderPeers(state);
  ui.TL.renderLifeMap(state);
  ui.TL.renderScene(state);
  ui.TL.renderFocus(state);
  ui.TL.renderFeed(state, true);
  // A decision overlay is part of what the player sees; keep the sample stable.
  ui.TL.showDecision(state, {
    id: 'snapshot_probe',
    title: '【快照】这是个决定的标题',
    text: '一段用来固定弹层排版的正文。',
    options: [
      {label: '第一个选项', hint: '带提示的副行'},
      {label: '第二个选项', hint: ''}
    ]
  });
  return ui.snapshot(IDS);
}

const captured = new Map();
for (const item of CASES) captured.set(item.name, render(lifeAt(item)));

if (process.env.RENDER_SNAPSHOT_WRITE === '1') {
  const payload = {};
  for (const item of CASES) payload[item.name] = {seed: item.seed, age: item.age, markup: captured.get(item.name)};
  fs.writeFileSync(FIXTURE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

test('the identity, status, wealth and survival panels render exactly the frozen markup', () => {
  const frozen = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  for (const item of CASES) {
    const expected = frozen[item.name];
    assert.ok(expected, `missing frozen markup for ${item.name}`);
    const actual = captured.get(item.name);
    assert.equal(JSON.stringify(actual), JSON.stringify(expected.markup),
      `${item.name}: rendered markup changed\n` +
      IDS.filter(id => JSON.stringify(actual[id]) !== JSON.stringify(expected.markup[id]))
        .map(id => `  ${id}:\n    frozen: ${JSON.stringify(expected.markup[id])}\n    actual: ${JSON.stringify(actual[id])}`)
        .join('\n'));
  }
});
