/* ==========================================================================
 * 诊断：大事件到底有没有触发、触发在哪一年、对寿命有没有影响
 * --------------------------------------------------------------------------
 *   node tools/diag-timeline.mjs 800
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['js/engine/rng.js', 'js/engine/text.js', 'js/engine/region.js',
  'js/data/nations.js', 'js/data/races.js', 'js/data/jobs.js', 'js/data/names.js',
  'js/data/baseline.js', 'js/data/focus.js',
  'js/engine/lifetable.js', 'js/engine/cohort.js', 'js/engine/oripathy.js', 'js/engine/state.js',
  'js/engine/decision.js', 'js/data/timeline.js', 'js/data/events.js', 'js/data/decisions.js',
  'js/engine/year.js'];

const ctx = vm.createContext({ window: {}, console, Math, JSON, Date, Intl,
  parseFloat, parseInt, isFinite, isNaN, Object, Array, String, Number, Boolean, Float64Array });
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const TL = ctx.window.TL;

const N = parseInt(process.argv[2] || '600', 10);
const fired = {};            // 事件 id → 触发次数
const byYear = {};           // 年份 → 触发次数
const bornYears = [];
let deaths = 0, deathByEvent = 0;
const perLife = [];

for (let i = 0; i < N; i++) {
  const S = TL.newLife({ mode: 'birth', pace: 'short' });
  bornYears.push(S.bornYear);
  const seen = new Set();
  let g = 0, n = 0;
  while (S.phase === 'life' && g++ < 40000) {
    if (!S.focus) S.focus = TL.autoFocus(S);
    const before = S.age;
    TL.tick(S, S.yearSec / 4);
    if (S.pending) TL.autoChoose(S);
    if (S.age !== before) {
      // 这一年有没有大事件标记
      for (const e of TL.TIMELINE) {
        if (e.legend) continue;
        if (S.flags['tl_' + e.id] && !seen.has(e.id)) {
          seen.add(e.id);
          fired[e.id] = (fired[e.id] || 0) + 1;
          byYear[e.year] = (byYear[e.year] || 0) + 1;
          n++;
        }
      }
    }
  }
  perLife.push(n);
  if (S.phase === 'report') {
    deaths++;
    if (S.flags.tl_ && /战役|事变|静谧|清洗/.test(S.flags.tl_)) deathByEvent++;
  }
}

bornYears.sort((a, b) => a - b);
const by = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];

console.log('\n样本', N);
console.log('出生年份：P10=' + by(bornYears, .1) + ' P50=' + by(bornYears, .5) +
  ' P90=' + by(bornYears, .9) + '  范围 ' + bornYears[0] + '–' + bornYears[bornYears.length - 1]);

const avg = perLife.reduce((a, b) => a + b, 0) / N;
console.log('平均每局亲历到的大事件：' + avg.toFixed(2) + ' 条');
console.log('一条都没碰到的局：' + (perLife.filter(x => x === 0).length / N * 100).toFixed(1) + '%');
console.log('碰到 5 条以上的局：' + (perLife.filter(x => x >= 5).length / N * 100).toFixed(1) + '%');

console.log('\n--- 触发率（按事件） ---');
const all = TL.TIMELINE.filter(e => !e.legend);
all.sort((a, b) => (fired[b.id] || 0) - (fired[a.id] || 0));
for (const e of all) {
  const c = fired[e.id] || 0;
  const bar = '█'.repeat(Math.round(c / N * 60));
  console.log(`  ${String(e.year).padStart(4)}  ${e.title.padEnd(24)} ${(c / N * 100).toFixed(1).padStart(5)}%  ${bar}`);
}
const never = all.filter(e => !fired[e.id]);
/* 出生年份最早是 1042，所以这之前的条目本来就无法「触发」——
   它们是**前史**：修正照常生效，只是以「你出生前 N 年……」的形式播报。
   把它们和真正死掉的条目分开报，否则这个警告会年年响、年年被忽略。 */
const earliestBirth = bornYears[0];
const prehistory = never.filter(e => e.year < earliestBirth);
const dead = never.filter(e => e.year >= earliestBirth);

if (prehistory.length) {
  console.log('\n· 前史条目（出生年份最早为 ' + earliestBirth + '，这些按前史播报，不算异常）：');
  prehistory.forEach(e => console.log(`    ${e.year}  ${e.title}`));
}
if (dead.length) {
  console.log('\n⚠ 在可出生区间内却从未触发：' + dead.map(e => `${e.year} ${e.title}`).join('、'));
}

/* 前史覆盖：有多少局在开局时会讲一条前史 */
let backCount = 0;
for (let i = 0; i < Math.min(N, 300); i++) {
  const S = TL.newLife({ mode: 'birth', pace: 'short' });
  if (S.log.some(l => l.key && String(l.key).indexOf('back_') === 0)) backCount++;
}
console.log('\n开局会播报前史的局：' + (backCount / Math.min(N, 300) * 100).toFixed(1) + '%');

console.log('\n--- 触发最密集的年份 ---');
Object.entries(byYear).sort((a, b) => b[1] - a[1]).slice(0, 8)
  .forEach(([y, c]) => console.log(`  ${y}  ${c} 次`));
