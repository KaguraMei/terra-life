/* ==========================================================================
 * 诊断：矿石病感染是从哪条路来的
 * --------------------------------------------------------------------------
 * 终生感染率一直偏高，而阶层区间的加权结果只有 15% 左右。
 * 说明多出来的部分来自事件里的 TL.tryInfect(S, k) —— 那些 k 会把年度风险
 * 放大 2~8 倍。这个脚本把「年度独立判定」与「事件触发」分开统计。
 *
 *   node tools/diag-ori2.mjs 400
 * ========================================================================== */
import fs from 'node:fs';
import vm from 'node:vm';

const FILES = ['js/engine/rng.js', 'js/engine/text.js', 'js/engine/region.js',
  'js/data/nations.js', 'js/data/races.js', 'js/data/jobs.js', 'js/data/names.js',
  'js/data/baseline.js', 'js/data/focus.js',
  'js/engine/lifetable.js', 'js/engine/cohort.js', 'js/engine/oripathy.js', 'js/engine/state.js',
  'js/engine/decision.js', 'js/data/timeline.js','js/data/events.js', 'js/data/decisions.js', 'js/engine/year.js'];

const ctx = { console, window: {}, Math, Date, JSON, Intl, parseFloat, parseInt, isFinite, isNaN };
ctx.globalThis = ctx;
vm.createContext(ctx);
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
}
const TL = ctx.window.TL;

const N = parseInt(process.argv[2] || '400', 10);

/* 包装 infect，记录来源标签 */
const bySource = {};
const origInfect = TL.infect;
let currentTag = 'annual';
TL.infect = function (S, silent) {
  bySource[currentTag] = (bySource[currentTag] || 0) + 1;
  return origInfect.call(TL, S, silent);
};

/* 包装 tryInfect，把调用点标出来 */
const origTry = TL.tryInfect;
TL.tryInfect = function (S, k) {
  const prev = currentTag;
  currentTag = 'event:k=' + (k == null ? '-' : k);
  const r = origTry.call(TL, S, k);
  currentTag = prev;
  return r;
};

/* 年度独立判定在 year.js / events.js 里直接调用 TL.chance(TL.oriRisk(S))，
   所以单独再包一层 oriRisk，用调用栈区分。这里用一个更省事的办法：
   连续记录 currentTag，年度判定发生在 tryInfect 之外，标签保持 'annual'。 */

let infected = 0, byStratum = {}, byNation = {}, ages = [];
const lifeSum = {}, riskSum = {}, nPer = {};
for (let i = 0; i < N; i++) {
  const S = TL.newLife({ mode: 'birth', pace: 'short' });
  /* 出生时先量一次设定值 */
  const L = TL.oriLifetimeP(S), strat = S.stratum;
  lifeSum[strat] = (lifeSum[strat] || 0) + L;
  nPer[strat] = (nPer[strat] || 0) + 1;
  let guard = 0, rs = 0, yrs = 0;
  while (S.phase === 'life' && guard++ < 40000) {
    if (!S.focus) S.focus = TL.autoFocus(S);
    /* 每年把当时的年度风险累加起来 —— 这就是"如果活满"的期望感染率 */
    if (!S.ori && S.age >= 3) { rs += TL.oriRisk(S); yrs++; }
    TL.tick(S, S.yearSec / 4);
    if (S.pending) TL.autoChoose(S);
  }
  riskSum[strat] = (riskSum[strat] || 0) + rs;
  if (S.ori) {
    infected++;
    byStratum[S.stratum] = (byStratum[S.stratum] || 0) + 1;
    byNation[S.nation] = (byNation[S.nation] || 0) + 1;
    ages.push(S.ori.at);
  }
}

console.log('\n样本', N, '· 终生感染', infected, '(' + (infected / N * 100).toFixed(1) + '%)');
console.log('\n--- 各阶层：设定终生概率 vs 实际年风险累加 ---');
for (const k in nPer) {
  console.log(`  ${k.padEnd(12)} n=${String(nPer[k]).padStart(4)}  设定=${(lifeSum[k] / nPer[k] * 100).toFixed(1)}%  累加年风险=${(riskSum[k] / nPer[k] * 100).toFixed(1)}%`);
}
console.log('\n--- 感染发生在哪个阶层 ---');
const tot = {};
for (const S of []) { /* noop */ }
for (const k in byStratum) tot[k] = byStratum[k];
console.log(Object.entries(byStratum).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `  ${k.padEnd(12)} ${String(v).padStart(4)}  ${(v / infected * 100).toFixed(1)}%`).join('\n'));

console.log('\n--- 感染来源（调用路径）---');
console.log(Object.entries(bySource).sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `  ${k.padEnd(22)} ${String(v).padStart(5)}  ${(v / infected * 100).toFixed(1)}%`).join('\n'));

ages.sort((a, b) => a - b);
if (ages.length) {
  console.log('\n--- 感染年龄 ---');
  const q = p => ages[Math.min(ages.length - 1, Math.floor(ages.length * p))];
  console.log(`  P10=${q(0.1)}  P25=${q(0.25)}  P50=${q(0.5)}  P75=${q(0.75)}  P90=${q(0.9)}`);
}

console.log('\n--- 感染最多的国家 ---');
console.log(Object.entries(byNation).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .map(([k, v]) => `  ${k.padEnd(6)} ${String(v).padStart(4)}`).join('\n'));
