import {simulation} from './sim-context.mjs';
/* 生成「模拟基线寿命表」：对每个国家跑若干局标准人生，取平均死亡年龄。
   这张表用于人生报告里的对比 —— 因为国家的 le 在本作里应当读作
   「这个国家移动城市里的社会预期寿命」，一个荒野人口占多数的国家
   （萨米、卡兹戴尔）国民平均寿命会远低于 le，直接比较会显得每个人都在「亏」。
   拿模拟对模拟，比较才有意义。
   用法：node tools/gen-baseline.mjs [每国每性别局数]（直接写入 baseline.js） */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {TL} = simulation();

const PER = parseInt(process.argv[2] || '320', 10);
if (!Number.isInteger(PER) || PER < 1 || PER > 100000) throw new Error('invalid sample count');
const out = {};

for (const n of TL.NATIONS) {
  for (const sex of ['M', 'F']) {
    const ages = [];
    for (let i = 0; i < PER; i++) {
      const seed = 1000000 + TL.NATIONS.indexOf(n) * 200000 + (sex === 'F' ? 100000 : 0) + i;
      const S = TL.newLife({ nation: n.id, sex: sex, seed });
      let g = 0;
      while (S.phase === 'life' && g++ < 4000) {
        if (!S.focus) S.focus = TL.autoFocus(S);
        TL.tick(S, S.yearSec / 8);
        if (S.pending) TL.autoChoose(S);
        if (S.phase !== 'life') break;
      }
      if (S.phase !== 'report' || !Number.isFinite(S.deathAge)) throw new Error('unfinished life: ' + seed);
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
 * 固定种子：1000000 + 国家序号 × 200000 + 女性偏移 100000 + 样本序号。
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
