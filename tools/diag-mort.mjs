import {simulation} from './sim-context.mjs';
/* 诊断：拆解死亡率乘数，找出到底是哪一项在压低寿命。
   用法：node tools/diag-mort.mjs [局数] */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const {TL} = simulation();

/* 复刻 deathProb 的各因子，逐年累加对数贡献 */
const acc = { health: 0, income: 0, ties: 0, race: 0, ori: 0, habits: 0, conds: 0, other: 0, years: 0, cat: 0 };
const N = parseInt(process.argv[2] || '200', 10);
const lifeAges = [];
const infectedAges = [];
const noInfAges = [];
let infCount = 0, infYearsTotal = 0;

for (let i = 0; i < N; i++) {
  const S = TL.newLife({});
  let guard = 0;
  while (S.phase === 'life' && guard++ < 4000) {
    if (!S.focus) S.focus = TL.autoFocus(S);
    TL.tick(S, S.yearSec / 8);
    if (S.pending) TL.autoChoose(S);
    if (S.phase !== 'life') break;

    // 拆解当前年龄的乘数
    const a = S.age, st = S.st;
    const n = TL.NATION_BY_ID[S.nation];
    // 与 lifetable.js 的当前 deathProb 保持一致；旧脚本写成 6 会把健康
    // 惩罚高估，导致诊断结果与实际模拟不一致。
    const off = 13 + (a < 15 ? n.u5 / 20 : 0) + (a > 50 ? (a - 50) * 0.08 : 0);
    const fHealth = Math.max(0.5, Math.exp((TL.expHealth(a) - off - st.hl) * (a < 5 ? 0.02 : 0.03)));
    acc.health += Math.log(fHealth);
    acc.ties += Math.log(TL.tiesK(S));
    acc.race += Math.log(TL.raceMortK(S));
    acc.ori += Math.log(TL.oriMortK(S, a));
    const g = TL.MORT_G[n.reg];
    const qe = a < 18 ? S.q : TL.clamp(Math.max(S.pct, S.flags.careerPct || 0) * 5, 0, 5);
    let norm = 0;
    for (let kk = 0; kk <= 5; kk += 0.5) norm += Math.exp(-g * (kk - 2.5));
    norm /= 11;
    acc.income += Math.log(Math.exp(-g * (qe - 2.5)) / norm);
    if (S.smoker) acc.habits += Math.log(1.7);
    if (S.alc && a >= 18) acc.habits += Math.log(1.5);
    for (const k in S.conds) if (!S.conds[k].treated) acc.conds += Math.log(1.3);
    if (S.refugee) acc.other += Math.log(1.15);
    acc.cat += Math.log(1 + n.cat * 0.04);
    acc.years++;
  }
  const age = S.deathAge;
  lifeAges.push(age);
  if (S.ori && S.ori.stage > 0) { infCount++; infectedAges.push(age); infYearsTotal += age - S.ori.at; }
  else noInfAges.push(age);
}

const avg = a => a.length ? (a.reduce((x,y)=>x+y,0)/a.length).toFixed(1) : '—';
console.log(`\n跑 ${N} 局`);
console.log(`平均寿命 ${avg(lifeAges)} 岁`);
console.log(`  未感染者 ${noInfAges.length} 人，平均寿命 ${avg(noInfAges)} 岁`);
console.log(`  感染过   ${infCount} 人，平均寿命 ${avg(infectedAges)} 岁，感染后平均存活 ${(infYearsTotal/Math.max(1,infCount)).toFixed(1)} 年`);

console.log('\n--- 死亡率乘数的对数贡献（合计 = 平均 ln(m)）---');
const total = Object.values(acc).reduce((a,b)=>a+b,0) - acc.years;
const rows = Object.entries(acc).filter(([k])=>k!=='years').map(([k,v]) => [k, v/Math.max(1,acc.years)]);
rows.sort((a,b)=>Math.abs(b[1])-Math.abs(a[1]));
for (const [k,v] of rows) {
  const mult = Math.exp(v);
  console.log(`  ${k.padEnd(8)} 平均 ×${mult.toFixed(3)}   ${v>=0?'+':''}${v.toFixed(4)} ln`);
}
console.log(`  合计平均乘数 ≈ ×${Math.exp(acc.years? (Object.entries(acc).filter(([k])=>k!=='years').reduce((a,[,v])=>a+v,0)/acc.years):0).toFixed(2)}`);

/* 生命表本身的期望 */
console.log('\n--- 各国生命表 e0（模型给出的基准预期寿命）---');
for (const n of TL.NATIONS) {
  const m = TL.lifeTable(n, 'M'), f = TL.lifeTable(n, 'F');
  console.log(`  ${n.name.padEnd(8)} 男 ${m.e0.toFixed(1)}  女 ${f.e0.toFixed(1)}  (设定 le=${n.le} gap=${n.gap})`);
}
console.log('');
