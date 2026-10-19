import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {simulation, root} from './sim-context.mjs';

const errors = [];
const {TL} = simulation({log(){},warn(){},error(...args){errors.push(args.map(String).join(' '));}});
const samples = Number(process.argv[2] || 1000);
assert.ok(Number.isInteger(samples) && samples > 0 && samples <= 10000);
const hits = Object.fromEntries(Object.keys(TL.EVMAP).map(id => [id, {count:0, seed:null}]));
const originalLog = TL.log;
let activeSeed;
TL.log = function(S, text, kind, info) {
  if (info?.key && hits[info.key]) {
    const h = hits[info.key]; h.count++; if (h.seed == null) h.seed = activeSeed;
  }
  return originalLog(S, text, kind, info);
};
for (let i = 0; i < samples; i++) {
  activeSeed = 810000 + i;
  const S = TL.newLife({seed:activeSeed});
  let guard = 0;
  while (S.phase === 'life' && guard++ < 20000) {
    if (!S.focus) S.focus = TL.autoFocus(S);
    TL.tick(S, S.yearSec / 8);
    if (S.pending) TL.autoChoose(S);
  }
  assert.equal(S.phase, 'report', 'simulation must terminate: ' + activeSeed);
}
TL.log = originalLog;

// Controlled fixtures prove each repaired supplemental route through scheduleEvents -> fire,
// rather than calling event.run directly. The setup is a constructed state, not a natural save.
const controlled = {};
const controlledIds = [...TL.SUPPLEMENTAL_EVENTS, 'cat_aftermath'];
const prefixNation = {yan:'YAN',urs:'URS',vic:'VIC',srg:'SRG',kaz:'KAZ',clb:'CLB',lei:'LEI'};
for (const id of controlledIds) {
  for (let trial = 1; trial <= 600 && !controlled[id]; trial++) {
    const nation = prefixNation[id.split('_')[0]] || 'URS';
    const seed = 920000 + trial;
    const S = TL.newLife({seed, nation, sex:'M', race:'sarkaz', bornYear:1075});
    Object.assign(S, {age:25, year:1100, t:0, queue:[], urban:true, stratum:'industrial',
      q:4, money:100, eduLevel:4, school:null, job:'mercenary', opClass:null, arts:90});
    Object.assign(S.st, {sm:90, hl:85, h:55, so:55});
    S.evCount = {}; S.recent = []; S.flags = {};
    TL.infect(S, true); S.ori.stage = 2; S.ori.crystal = 40;
    if (['ori_drug_sideeffect','ori_treatment_cost'].includes(id)) {
      S.ori.treated = true; S.ori.provider = 'rhodes';
    }
    if (id === 'vic_factory') S.job = 'factory';
    if (id === 'clb_frontier') { S.urban = false; S.stratum = 'wild'; }
    if (id === 'war_reunion') { S.serveLeft = 2; S.ori.known = true; }
    else S.serveLeft = 0;
    if (['reunion_choice','reunion_life','reunion_conflict'].includes(id)) {
      S.year=1095; S.bornYear=S.year-S.age;
      S.flags.reunionTouched=24; S.flags.reunionContactYear=1095;
    }
    if (['reunion_life','reunion_conflict'].includes(id)) {
      assert.ok(TL.joinOrganization(S,'reunion','infected'));
      S.flags.reunionJoined = 23;
    }
    if (['ori_hiding_stress','ori_identity_exposed'].includes(id)) S.flags.oriHiding = true;
    if (id === 'cat_aftermath') {
      S.ori = null; S.flags.postCatastrophe = 1; S.urban = false; S.stratum = 'wild';
    }
    if (id === 'organization_offer') { S.nation = 'CLB'; S.job = 'scholar'; }
    if (id === 'organization_contact' || id.startsWith('org_')) {
      const org = id === 'organization_contact' ? 'lungmen_guard' : TL.EVMAP[id].organization;
      const def = TL.ORGANIZATIONS[org];
      const route = Object.keys(def.routes)[0];
      const rd = def.routes[route];
      S.nation = def.nations ? def.nations[0] : 'KDZ';
      S.year = Math.max(1094, def.fromYear, rd.fromYear || 0);
      if (org === 'babel') S.year = 1090;
      S.bornYear = S.year - S.age;
      S.race = org === 'laterano_gunknights' ? 'sankta' : 'sarkaz';
      S.job = org === 'rhodes' ? 'op_guard' : (rd.jobs || ['guard'])[0];
      if (org === 'rhodes') { S.opClass = 'guard'; S.opRank = 1; }
      if (org === 'babel') S.flags.babel_ask = 1;
      if (org === 'reunion') S.flags.reunionContactYear = S.year;
      if (org === 'sir_family') S.flags.sirFamilyIntroducedYear = S.year;
      assert.ok(TL.joinOrganization(S, org, route), id + ' fixture join');
      S.orgRank = 1;
      // 服役事件的构造场景已经处理历史去留；转折链另有专门测试。
      for (const change of TL.organizationTransitions) S.flags['org_transition_' + change.id] = 1;
    }
    TL.scheduleEvents(S);
    const queued = S.queue.find(e => e.type === 'ev' && e.id === id);
    if (!queued) continue;
    TL.fire(S, queued);
    if (S.evCount[id] === 1) controlled[id] = seed;
  }
}
assert.equal(errors.length, 0, errors.join('\n'));
const failures = controlledIds.filter(id => !controlled[id]);
const rows = Object.keys(TL.EVMAP).map(id => {
  const h = hits[id];
  const status = TL.EVMAP[id].disabledReason ? '独立慢病入口' : controlled[id] ? '构造状态排程并执行通过' : h.count ? '完整人生已触发' : '有调度入口，本批样本未命中';
  return '| ' + [id,status,h.count,h.seed ?? '—',controlled[id] ?? '—'].join(' | ') + ' |';
});
const report = [
  '# 事件可达性报告', '',
  '命令：\`node tools/verify-events.mjs ' + samples + '\`。固定种子从 810000 开始，默认出生口径、自动重心与自动抉择。',
  '', '事件定义 ' + rows.length + '；完整人生样本覆盖 ' + Object.values(hits).filter(h=>h.count).length +
  '；补充事件及灾后事件构造状态验证 ' + Object.keys(controlled).length + '/' + controlledIds.length + '；异常 ' + errors.length + '。',
  '', '“本批样本未命中”不等于不可达。构造状态检查使用真实排程器抽取，再通过 fire 执行；它证明接线及执行路径，不能代表自然人生触发概率。重现构造状态请运行本脚本，见脚本中的完整状态配方。',
  '', '静态入口、废弃字段、职业引用和人口快照另由 verify.mjs 检查。慢病 illness 保留 ncdYear 独立入口，不重新放入常规池。',
  '', '表中种子为 newLife 接口的数值种子；网址 seed 参数会先进行字符串哈希，不能将表中数值原样贴入网址并期待同一局。',
  '', '| 事件 | 验证状态 | 日志次数 | 首个自然样本种子 | 构造状态种子 |', '| --- | --- | ---: | --- | --- |', ...rows, ''
].join('\n');
fs.writeFileSync(path.join(root, 'docs/事件可达性报告.md'), report);
console.log(report.split('\n').slice(0,8).join('\n'));
assert.equal(failures.length, 0, 'supplemental route not witnessed: ' + failures.join(', '));

