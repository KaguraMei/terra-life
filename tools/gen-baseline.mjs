/* 生成「模拟基线寿命表」：对每个国家跑若干局标准人生，取平均死亡年龄。
   这张表用于人生报告里的对比 —— 因为国家的 le 在本作里应当读作
   「这个国家移动城市里的社会预期寿命」，一个荒野人口占多数的国家
   （萨米、卡兹戴尔）国民平均寿命会远低于 le，直接比较会显得每个人都在「亏」。
   拿模拟对模拟，比较才有意义。
   用法：node tools/gen-baseline.mjs [每国局数] > js/data/baseline.js      */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['js/engine/rng.js','js/engine/text.js','js/engine/region.js','js/data/nations.js','js/data/races.js',
  'js/data/jobs.js','js/data/names.js','js/data/focus.js','js/engine/lifetable.js','js/engine/cohort.js',
  'js/engine/oripathy.js','js/engine/state.js','js/engine/decision.js','js/data/timeline.js','js/data/events.js',
  'js/data/decisions.js','js/engine/year.js'];

const win = { TL: {} }; win.window = win;
const ctx = vm.createContext({ window: win, console, Math, JSON, Date, Float64Array, Object,
  Array, Number, String, Boolean, isFinite, parseFloat, parseInt });
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const TL = win.TL;

const PER = parseInt(process.argv[2] || '260', 10);
const out = {};

for (const n of TL.NATIONS) {
  for (const sex of ['M', 'F']) {
    const ages = [];
    for (let i = 0; i < PER; i++) {
      const S = TL.newLife({ nation: n.id, sex: sex });
      let g = 0;
      while (S.phase === 'life' && g++ < 4000) {
        if (!S.focus) S.focus = TL.autoFocus(S);
        TL.tick(S, S.yearSec / 8);
        if (S.pending) TL.autoChoose(S);
        if (S.phase !== 'life') break;
      }
      ages.push(S.deathAge);
    }
    ages.sort((a, b) => a - b);
    const mean = ages.reduce((a, b) => a + b, 0) / ages.length;
    out[n.id + sex] = {
      m: Math.round(mean * 10) / 10,                    // 模拟平均寿命
      p25: ages[Math.floor(ages.length * 0.25)],
      p50: ages[Math.floor(ages.length * 0.50)],
      p75: ages[Math.floor(ages.length * 0.75)],
      le: n.le                                          // 设定/统计寿命
    };
  }
  const a = out[n.id + 'M'], b = out[n.id + 'F'];
  console.error(`${n.name.padEnd(8)} 模拟 男${a.m} 女${b.m}  |  设定 ${n.le}  |  差 ${(a.m - n.le).toFixed(1)} / ${(b.m - n.le).toFixed(1)}`);
}

const js = `/* ==========================================================================
 * TERRA LIFE SIM — 模拟基线寿命表（自动生成，请勿手改）
 * --------------------------------------------------------------------------
 * 生成方式：tools/gen-baseline.mjs，每个国家 × 性别各 ${PER} 局标准人生
 * （自动重心 + 自动抉择），取死亡年龄的均值与四分位。
 *
 * 用途：人生报告里的「你比国民平均多活/少活几年」。
 * 为什么不直接用国家的 le：本作的 le 应当读作「这个国家移动城市里的
 * 社会预期寿命」。荒野用绝对区间（35~45 岁），所以一个荒野人口占多数的
 * 国家（萨米、卡兹戴尔）国民平均寿命会远低于 le。拿模拟对模拟才有意义。
 * ========================================================================== */
(function (TL) {
  'use strict';
  TL.BASELINE_LE = ${JSON.stringify(out, null, 2).replace(/\n/g, '\n  ')};
})(window.TL = window.TL || {});
`;

fs.writeFileSync(path.join(ROOT, 'js/data/baseline.js'), js, 'utf8');
console.error('\n已写入 js/data/baseline.js');
