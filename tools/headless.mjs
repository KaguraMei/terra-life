/* 无头测试台：在 Node 里加载全部游戏脚本，批量跑人生，统计分布。
   用法：node tools/headless.mjs [局数] [--verbose]                    */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const FILES = [
  'js/engine/rng.js', 'js/engine/text.js','js/engine/region.js', 'js/engine/region.js',
  'js/data/nations.js', 'js/data/races.js', 'js/data/jobs.js', 'js/data/names.js','js/data/baseline.js',
  'js/data/focus.js',
  'js/engine/lifetable.js','js/engine/cohort.js', 'js/engine/cohort.js', 'js/engine/oripathy.js', 'js/engine/state.js',
  'js/engine/decision.js',
  'js/data/timeline.js','js/data/events.js', 'js/data/decisions.js',
  'js/engine/year.js'
];

// 构造一个最小的浏览器环境
const win = { TL: {} };
win.window = win;
const ctx = vm.createContext({
  window: win, console, Math, JSON, Date, Float64Array, Object, Array, Number, String, Boolean, isFinite, parseFloat, parseInt
});

for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  try {
    vm.runInContext(src, ctx, { filename: f });
  } catch (e) {
    console.error('!! 加载失败', f, e.message);
    process.exit(1);
  }
}
const TL = win.TL;

/* ---------------------------------------------------------------------- */
/* 跑一局：自动替你选抉择，目标是把人生活完                                */
/* ---------------------------------------------------------------------- */
function runLife(opts) {
  const S = TL.newLife(opts || {});
  let guard = 0;
  const decisionsSeen = [];

  while (S.phase === 'life' && guard++ < 5000) {
    // 选重心
    if (!S.focus) S.focus = TL.autoFocus(S);

    // 步进：一次推进一整年的 1/8，直到年内有事件弹抉择
    TL.tick(S, S.yearSec / 8);

    if (S.pending) {
      decisionsSeen.push(S.pending.id);
      TL.autoChoose(S);
    }
    if (S.t >= 1 && S.phase === 'life') { /* endYear 已在 tick 内触发 */ }
    // 保险：如果一年走完但没换年（不该发生），手动推
    if (S.phase === 'life' && S.t >= 1) TL.endYear(S);
  }
  return { S, guard, decisionsSeen };
}

/* ---------------------------------------------------------------------- */
const N = parseInt(process.argv[2] || '400', 10);
const VERBOSE = process.argv.includes('--verbose');

const agg = {
  n: 0, ageSum: 0, ages: [], causes: {}, nations: {}, races: {}, infected: 0,
  stages: { 0: 0, 1: 0, 2: 0, 3: 0 }, treated: 0, known: 0,
  err: 0, guardHit: 0, jobs: {}, arts: [], kidSum: 0
};

const t0 = Date.now();
for (let i = 0; i < N; i++) {
  try {
    const { S, guard, decisionsSeen } = runLife({ pace: 'normal' });
    if (guard >= 5000) agg.guardHit++;
    agg.n++;
    agg.ageSum += S.deathAge;
    agg.ages.push(S.deathAge);
    agg.causes[S.deathCause] = (agg.causes[S.deathCause] || 0) + 1;
    agg.nations[S.nation] = (agg.nations[S.nation] || 0) + 1;
    agg.races[S.race] = (agg.races[S.race] || 0) + 1;
    agg.arts.push(S.arts);
    agg.kidSum += S.fam.kids.length;
    if (S.ori && S.ori.stage > 0) { agg.infected++; agg.stages[S.ori.stage]++; if (S.ori.treated) agg.treated++; if (S.ori.known) agg.known++; }
    else agg.stages[0]++;
    const j = S.flags.lastJob || S.job;
    if (j) agg.jobs[j] = (agg.jobs[j] || 0) + 1;

    if (VERBOSE && i < 3) {
      console.log('\n================ 第 ' + (i + 1) + ' 局 ================');
      console.log(`${S.fullName} · ${TL.NATION_BY_ID[S.nation].name} ${S.city} · ${TL.RACE_BY_ID[S.race].name}${S.courtName ? '/' + S.courtName : ''} · ${S.sex === 'M' ? '男' : '女'}`);
      console.log(`家境分位 q=${S.q} 城乡=${S.urban ? '城' : '乡'} 技艺=${S.arts}(${TL.artRankName(TL.artRank(S))})`);
      console.log(`卒于 ${S.deathAge} 岁 · ${(TL.CAUSES[S.deathCause] || {}).name} · 该国预期寿命 ${S.lt.e0.toFixed(1)}`);
      if (S.ori) console.log(`矿石病：${S.ori.at} 岁感染 · ${TL.oriStageName(S.ori.stage)} · 结晶率 ${S.ori.crystal.toFixed(1)}% · ${S.ori.treated ? '治疗中(' + S.ori.provider + ')' : '未治疗'} · ${S.ori.known ? '已登记' : '未公开'}`);
      console.log(`抉择 ${decisionsSeen.length} 次：${[...new Set(decisionsSeen)].join(', ')}`);
      console.log('--- 大事记 ---');
      for (const e of S.log.filter(x => ['birth', 'mil', 'dec', 'death', 'ori'].indexOf(x.kind) >= 0)) {
        console.log(`  ${String(e.age).padStart(3)}岁 [${e.kind}] ${e.text}`);
      }
      console.log(`--- 年度快照（抽样）---`);
      const ys = S.stats.years;
      for (let k = 0; k < ys.length; k += Math.max(1, Math.floor(ys.length / 12))) {
        const y = ys[k];
        console.log(`  ${String(y.age).padStart(3)}岁 体${String(y.hl).padStart(3)} 心${String(y.h).padStart(3)} 学${String(y.sm).padStart(3)} 羁${String(y.so).padStart(3)} | 收入分位 ${(y.pct * 100).toFixed(0)}% | ${TL.JOBS[y.job] ? TL.JOBS[y.job].name : y.job}${y.ori ? ' | 结晶 ' + y.ori.toFixed(0) + '%' : ''}`);
      }
    }
  } catch (e) {
    agg.err++;
    if (agg.err <= 3) { console.error('!! 局内异常：', e.message); console.error(e.stack.split('\n').slice(0, 6).join('\n')); }
  }
}
const dt = Date.now() - t0;

/* ---------------------------------------------------------------------- */
function pct(v, n) { return (v / n * 100).toFixed(2) + '%'; }
function sorted(o) { return Object.entries(o).sort((a, b) => b[1] - a[1]); }

console.log('\n============================================================');
console.log(`跑了 ${agg.n} 局，异常 ${agg.err} 局，死循环保护触发 ${agg.guardHit} 局，耗时 ${dt}ms`);
console.log(`平均寿命 ${(agg.ageSum / Math.max(1, agg.n)).toFixed(1)} 岁`);
const ages = agg.ages.slice().sort((a, b) => a - b);
const q = p => ages[Math.floor(ages.length * p)] ?? 0;
console.log(`寿命分位：P10=${q(.1)} P25=${q(.25)} P50=${q(.5)} P75=${q(.75)} P90=${q(.9)} 最大=${ages[ages.length - 1]} 最小=${ages[0]}`);
console.log(`平均子女数 ${(agg.kidSum / Math.max(1, agg.n)).toFixed(2)}`);
console.log(`平均技艺适应性 ${(agg.arts.reduce((a, b) => a + b, 0) / Math.max(1, agg.arts.length)).toFixed(1)}`);

console.log('\n--- 死因分布 ---');
for (const [k, v] of sorted(agg.causes)) {
  console.log(`  ${(TL.causeName(k, 70)).padEnd(12)} ${String(v).padStart(4)}  ${pct(v, agg.n)}`);
}

console.log('\n--- 感染情况 ---');
console.log(`  一生中感染过矿石病：${agg.infected} 人 (${pct(agg.infected, agg.n)})`);
console.log(`  分期分布：未感染 ${agg.stages[0]} / Ⅰ期 ${agg.stages[1]} / Ⅱ期 ${agg.stages[2]} / Ⅲ期 ${agg.stages[3]}`);
console.log(`  接受过治疗 ${agg.treated} (${pct(agg.treated, Math.max(1, agg.infected))}) · 身份已公开 ${agg.known} (${pct(agg.known, Math.max(1, agg.infected))})`);

console.log('\n--- 出生地分布（前 12）---');
for (const [k, v] of sorted(agg.nations).slice(0, 12)) {
  console.log(`  ${TL.NATION_BY_ID[k].name.padEnd(8)} ${String(v).padStart(4)}  ${pct(v, agg.n)}`);
}
console.log('\n--- 种族分布（前 12）---');
for (const [k, v] of sorted(agg.races).slice(0, 12)) {
  console.log(`  ${TL.RACE_BY_ID[k].name.padEnd(8)} ${String(v).padStart(4)}  ${pct(v, agg.n)}`);
}
console.log('\n--- 终生职业分布（前 15）---');
for (const [k, v] of sorted(agg.jobs).slice(0, 15)) {
  console.log(`  ${((TL.JOBS[k] || {}).name || k).padEnd(14)} ${String(v).padStart(4)}  ${pct(v, agg.n)}`);
}
console.log('');
