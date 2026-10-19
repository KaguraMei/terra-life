/* ==========================================================================
 * 结构自检：把「只有在特定路径上才会炸」的错误提前抓出来
 * --------------------------------------------------------------------------
 * 界面重排之后，最容易出的一类 bug 是 id 写错：
 *   $('statBody') 打成 $('statbody') → 返回 null → 那一段渲染整个不执行。
 * 它不会报错，只会让某个面板永远空着，而你可能几十局都碰不到那条路径。
 *
 * 这个脚本做四件事（全部静态，不需要浏览器）：
 *   ① 抽出 render.js / main.js 里所有 $('...') 的 id，对照 index.html 检查
 *   ② 抽出所有 TL.t('...') 的键，对照 region.js 的 TL.LANG 检查
 *   ③ 抽出 TL.scheduleEvents 里所有池子的字符串，对照 TL.EVMAP 检查
 *   ④ 抽出所有 querySelector('#x ...') 的根 id 一并检查
 *
 *   node tools/verify.mjs
 * ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

let fail = 0;
const bad = (what, list) => {
  if (!list.length) return;
  fail += list.length;
  console.log(`\n✗ ${what}（${list.length}）`);
  list.forEach(x => console.log('    ' + x));
};
const ok = s => console.log('✓ ' + s);

/* ---------------------------------------------------------------------- */
/* ① / ④ DOM id                                                           */
/* ---------------------------------------------------------------------- */
const html = read('index.html');
const htmlIds = new Set();
for (const m of html.matchAll(/\sid="([^"]+)"/g)) htmlIds.add(m[1]);

const jsFiles = ['js/ui/render.js', 'js/ui/pixelart.js', 'js/ui/landing.js', 'js/main.js'];

/* 运行期才建出来的 id 也算「有定义」：
   浮层内容是用 innerHTML 拼的，errbox 是出错时才 append 的。
   不把它们算进去，自检会把每一处动态节点都报成错误。 */
const dynIds = new Set();
for (const f of jsFiles) {
  const src = read(f);
  for (const m of src.matchAll(/\bid\s*=\s*["']([A-Za-z][\w-]*)["']/g)) dynIds.add(m[1]);
  for (const m of src.matchAll(/\.id\s*=\s*'([A-Za-z][\w-]*)'/g)) dynIds.add(m[1]);
}

const usedIds = new Map();
for (const f of jsFiles) {
  const src = read(f);
  // $('x') 与 TL.$('x') 与 getElementById('x')
  for (const m of src.matchAll(/(?:\$|getElementById)\(\s*'([A-Za-z][\w-]*)'\s*\)/g)) {
    if (!usedIds.has(m[1])) usedIds.set(m[1], f);
  }
  // querySelector('#x ...') / querySelectorAll('#x ...')
  for (const m of src.matchAll(/querySelector(?:All)?\(\s*'#([A-Za-z][\w-]*)/g)) {
    if (!usedIds.has(m[1])) usedIds.set(m[1], f);
  }
}
const missingIds = [];
for (const [id, f] of usedIds) {
  if (!htmlIds.has(id) && !dynIds.has(id)) missingIds.push(`${id}  ← ${f}（index.html 里没有，也不是动态创建的）`);
}
bad('DOM id 对不上', missingIds);

/* 反向：index.html 里定义了但没人用的 id —— 只提示，不算失败 */
const usedSet = new Set(usedIds.keys());
const orphan = [...htmlIds].filter(id => !usedSet.has(id) && !id.startsWith('sw'));
if (orphan.length) console.log(`\n· index.html 中未被 JS 直接引用的 id（${orphan.length}）：${orphan.join(', ')}`);
if (!missingIds.length) {
  ok(`DOM id 全部对得上（引用 ${usedIds.size} 个，其中 ${[...usedIds.keys()].filter(i => dynIds.has(i)).length} 个为动态创建）`);
}

/* ---------------------------------------------------------------------- */
/* ② TL.t() 的键                                                          */
/* ---------------------------------------------------------------------- */
const ctx0 = vm.createContext({ window: {}, console, Math, JSON, Date, Intl,
  parseFloat, parseInt, isFinite, isNaN, Object, Array, String, Number, Boolean });
vm.runInContext(read('js/engine/region.js'), ctx0, { filename: 'region.js' });
const LANG = ctx0.window.TL.LANG;
const zhKeys = new Set(Object.keys(LANG.zh));
const enKeys = new Set(Object.keys(LANG.en));

const usedKeys = new Map();
for (const f of jsFiles) {
  for (const m of read(f).matchAll(/TL\.t\(\s*'([\w.]+)'/g)) {
    if (!usedKeys.has(m[1])) usedKeys.set(m[1], f);
  }
}
const missZh = [], missEn = [];
for (const [k, f] of usedKeys) {
  if (!zhKeys.has(k)) missZh.push(`${k}  ← ${f}`);
  if (!enKeys.has(k)) missEn.push(`${k}  ← ${f}`);
}
bad('TL.t() 在 zh 表中缺失', missZh);
bad('TL.t() 在 en 表中缺失', missEn);
const onlyZh = [...zhKeys].filter(k => !usedKeys.has(k));
const onlyEn = [...enKeys].filter(k => !usedKeys.has(k));
if (!missZh.length && !missEn.length) {
  ok(`TL.t() 键中英两表齐全（用到 ${usedKeys.size} 个）`);
}
console.log(`· 定义了但未被 TL.t() 引用：zh ${onlyZh.length} 个、en ${onlyEn.length} 个`);

/* ---------------------------------------------------------------------- */
/* ③ 事件池里的 id                                                         */
/* ---------------------------------------------------------------------- */
const FILES = ['js/engine/rng.js', 'js/engine/text.js', 'js/engine/region.js',
  'js/data/nations.js', 'js/data/races.js', 'js/data/jobs.js', 'js/data/names.js',
  'js/data/baseline.js', 'js/data/focus.js',
  'js/engine/lifetable.js', 'js/engine/cohort.js', 'js/engine/oripathy.js', 'js/engine/state.js',
  'js/engine/decision.js', 'js/data/timeline.js','js/data/events.js', 'js/data/decisions.js', 'js/engine/year.js'];
const ctx = vm.createContext({ window: {}, console, Math, JSON, Date, Intl,
  parseFloat, parseInt, isFinite, isNaN, Object, Array, String, Number, Boolean, Float64Array });
for (const f of FILES) vm.runInContext(read(f), ctx, { filename: f });
const TL = ctx.window.TL;

/* 事件 id：只看两处真正会「指名道姓」的地方 ——
   pool = [...] 的数组字面量，以及 TL.queueEvent(..., 'ev', 'x') 的第四个参数。
   早先的写法是把这一段里所有单引号字符串都当候选，结果把 'biz' / 'art'
   这类职业分类也报成未定义事件。 */
const evSrc = read('js/data/events.js');
const poolBlock = evSrc.slice(evSrc.indexOf('TL.scheduleEvents'));
const poolIds = new Set();
for (const id of TL.SUPPLEMENTAL_EVENTS || []) poolIds.add(id);
for (const m of poolBlock.matchAll(/pool\s*=\s*\[([\s\S]*?)\]/g)) {
  for (const s of m[1].matchAll(/'([a-z][a-z0-9_]+)'/g)) poolIds.add(s[1]);
}
for (const m of poolBlock.matchAll(/pool\.concat\(\s*\[([\s\S]*?)\]/g)) {
  for (const s of m[1].matchAll(/'([a-z][a-z0-9_]+)'/g)) poolIds.add(s[1]);
}
for (const m of poolBlock.matchAll(/queueEvent\([^;\n]*?'ev'\s*,\s*'([a-z][a-z0-9_]+)'/g)) poolIds.add(m[1]);
const badEv = [...poolIds].filter(id => !TL.EVMAP[id]);
bad('scheduleEvents 里出现了未定义的事件 id', badEv.map(id => `${id}（EVMAP 里没有）`));
if (!badEv.length) ok(`事件池里的 id 全部有定义（检查了 ${poolIds.size} 个）`);

const unlinked = Object.keys(TL.EVMAP).filter(id => !poolIds.has(id) && !TL.EVMAP[id].disabledReason);
bad('事件没有调度入口或明确停用理由', unlinked);
if (!unlinked.length) ok('所有事件都有调度入口或明确独立处理理由');

const obsolete = [];
for (const f of FILES) {
  for (const [i, line] of read(f).split('\n').entries()) {
    if (/\bS\.(edu|courtId)\b/.test(line)) obsolete.push(f + ':' + (i + 1) + ' 使用已废弃状态字段');
    for (const m of line.matchAll(/S\.job\s*=\s*'([^']+)'(?=\s*[;}])/g)) {
      if (!TL.JOBS[m[1]] && !TL.NONWORK.includes(m[1])) obsolete.push(f + ':' + (i + 1) + ' 未登记职业 ' + m[1]);
    }
  }
}
bad('状态字段或职业引用错误', obsolete);
if (!obsolete.length) ok('教育/王庭字段与直接赋值职业引用正确');

const snapshot = JSON.parse(read('docs/data/population-2026-10-19.json'));
const populationErrors = [];
if (snapshot.id !== TL.POPULATION_SNAPSHOT || snapshot.nations.length !== TL.NATIONS.length)
  populationErrors.push('快照版本或国家数量不同');
for (const n of TL.NATIONS) {
  const saved = snapshot.nations.find(v => v.id === n.id);
  for (const key of ['pop', 'b', 'sourceYear', 'sourceType', 'analogue', 'confidence']) {
    if (!saved || saved[key] !== n[key]) populationErrors.push(n.id + '.' + key);
  }
  if (JSON.stringify(saved && saved.sourcePages || []) !== JSON.stringify(n.sourcePages || [])) {
    populationErrors.push(n.id + '.sourcePages');
  }
}
bad('人口快照与运行时不一致', populationErrors);
if (!populationErrors.length) ok('21 国人口/出生权重及来源字段与冻结快照一致');

const excludedGaul = (snapshot.excluded || []).find(v => v.id === 'GAU');
if (!excludedGaul || excludedGaul.counted !== false || excludedGaul.pop !== 3000) {
  bad('已灭国人口未正确排除', ['GAU']);
} else {
  ok('高卢 3000 万遗民已记录但不进入当前抽签');
}

/* 每个事件都必须能返回一句文本（或 {t}），否则 fire() 会静默什么都不记 */
const noRun = [], noTitle = [];
for (const id in TL.EVMAP) {
  const ev = TL.EVMAP[id];
  if (typeof ev.run !== 'function') noRun.push(id);
  if (!ev.title) noTitle.push(id);
}
bad('事件缺少 run()', noRun);
bad('事件缺少 title', noTitle);
if (!noRun.length && !noTitle.length) ok(`事件表结构完整（${Object.keys(TL.EVMAP).length} 个事件）`);

/* 抉择必须有选项 */
const badDec = [];
for (const id in TL.DECISIONS) {
  const d = TL.DECISIONS[id];
  if (!d.options || !d.options.length) badDec.push(id + '（没有 options）');
  else if (d.options.some(o => !o.label)) badDec.push(id + '（有选项缺 label）');
}
bad('抉择结构不完整', badDec);
if (!badDec.length) ok(`抉择表结构完整（${Object.keys(TL.DECISIONS).length} 个抉择）`);

/* ---------------------------------------------------------------------- */
/* ⑤ 泰拉大事件年表                                                        */
/* ---------------------------------------------------------------------- */
/* 年表里最容易写错的是国家 id：fx / scope.nations 里任何一个拼错，
   那一条就永远不会对任何人产生全国性效果，而且**不会报错**。
   所以这里把它当外键来查。 */
const nationIds = new Set(TL.NATIONS.map(n => n.id));
const regionIds = new Set(Object.keys(TL.REGIONS));

const badTlNat = [], badTlReg = [], badTlRec = [], badTlWhen = [];
const tlIds = new Set();

for (const ev of TL.TIMELINE) {
  const at = ev.title || ev.id;
  if (!ev.id || !ev.year || !ev.title) { badTlRec.push(at + '（缺 id / year / title）'); continue; }
  if (tlIds.has(ev.id)) badTlRec.push(ev.id + '（id 重复）');
  tlIds.add(ev.id);

  for (const id of (ev.scope && ev.scope.nations) || []) {
    if (!nationIds.has(id)) badTlNat.push(`${at} · scope.nations 里的 ${id} 不是国家 id`);
  }
  for (const r of (ev.scope && ev.scope.regions) || []) {
    if (!regionIds.has(r)) badTlReg.push(`${at} · scope.regions 里的 ${r} 不是大区 id`);
  }
  for (const id in (ev.fx || {})) {
    if (!nationIds.has(id)) badTlNat.push(`${at} · fx 里的 ${id} 不是国家 id`);
  }
  // at[].when 必须是函数：写成对象或字符串的话，过滤会静默失效
  for (const a of (ev.at || [])) {
    if (a.when != null && typeof a.when !== 'function') badTlWhen.push(`${at} · at[].when 不是函数`);
    if (typeof a.die === 'number' && !a.dieCause) badTlWhen.push(`${at} · at[] 有 die 却没有 dieCause`);
  }
  if (!ev.here && !ev.near && !ev.far) badTlRec.push(at + '（三档旁白全空）');
}

bad('年表 · 国家 id 拼错', badTlNat);
bad('年表 · 大区 id 拼错', badTlReg);
bad('年表 · 记录结构有问题', badTlRec);
bad('年表 · 条件写法有问题', badTlWhen);
if (!badTlNat.length && !badTlReg.length && !badTlRec.length && !badTlWhen.length) {
  const dated = TL.TIMELINE.filter(e => !e.legend).length;
  ok(`大事件年表结构完整（${TL.TIMELINE.length} 条，其中可触发 ${dated} 条）`);
}

/* 修正合计不能把容忍度推出 0..100，也不能让死亡率乘数跑到荒谬的区间 */
const badRange = [];
for (const n of TL.NATIONS) {
  for (let y = TL.TL_SPAN[0]; y <= TL.TL_SPAN[1]; y += 7) {
    const m = TL.tlMods(n.id, y);
    const tol = TL.tolOf(n.id, y);
    if (tol < 0 || tol > 100) badRange.push(`${n.id} ${y} 年容忍度越界：${tol.toFixed(1)}`);
    if (m.mort < 0.2 || m.mort > 3) badRange.push(`${n.id} ${y} 年死亡率乘数异常：${m.mort.toFixed(2)}`);
  }
}
bad('年表 · 修正越界', badRange);
if (!badRange.length) ok('年表修正全程落在合理区间（容忍度 0–100、死亡率乘数 0.2–3）');

/* ---------------------------------------------------------------------- */
/* 收尾                                                                    */
/* ---------------------------------------------------------------------- */
console.log('\n' + '='.repeat(60));
if (fail) {
  console.log(`结构自检失败：${fail} 处问题`);
  process.exit(1);
}
console.log('结构自检通过');
