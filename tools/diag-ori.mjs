import {simulation} from './sim-context.mjs';
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {TL} = simulation();
// 按国家统计平均年风险 p 与暴露年数
const per={};
const jobKOf=S=>{const J=TL.JOBS[S.job]; if(!J)return S.age<15?0.8:1;
  if(S.job==="oriminer")return 14; if(S.job==="refiner")return 12; if(S.job==="miner")return 5;
  if(S.job==="artsmith"||S.job==="alchemist")return 5; if(J.sec==="art"||J.cls==="caster")return 3.2;
  if(J.sec==="mil")return 1.8; if(J.sec==="ind")return 2.0; if(J.sec==="agr")return 1.2; return 0.55;};
for(const n of TL.NATIONS) per[n.id]={yrs:0,psum:0,k:0,n:0,surge:0,cat:0};
for(let i=0;i<1200;i++){
  const S=TL.newLife({}); let g=0;
  while(S.phase==="life"&&g++<4000){
    if(!S.focus)S.focus=TL.autoFocus(S);
    TL.tick(S,S.yearSec/8);
    if(S.pending)TL.autoChoose(S);
    if(S.phase!=="life")break;
    if(!S.ori&&S.age>=3){
      const p=TL.oriRisk(S); const q=per[S.nation];
      q.yrs++; q.psum+=p; q.k+=jobKOf(S);
      if(S.flags.oriSurge)q.surge++; if(S.flags.postCatastrophe)q.cat++;
    }
    per[S.nation].n=Math.max(per[S.nation].n,1);
  }
}
console.log("国家      平均年风险   暴露年数  隐含终生   平均jobK  acute%  cat%  设定感染率");
const rows=Object.entries(per).filter(([,v])=>v.yrs>50);
rows.sort((a,b)=>b[1].psum/b[1].yrs-a[1].psum/a[1].yrs);
for(const [k,v] of rows){
  const mp=v.psum/v.yrs; const life=1-Math.pow(1-mp,v.yrs/v.n);
  console.log(`  ${TL.NATION_BY_ID[k].name.padEnd(8)} ${(mp*1000).toFixed(2).padStart(8)}‰  ${(v.yrs/v.n).toFixed(1).padStart(7)}  ${(life*100).toFixed(1).padStart(7)}%  ${(v.k/v.yrs).toFixed(2).padStart(7)}  ${(v.surge/v.yrs*100).toFixed(1).padStart(5)}  ${(v.cat/v.yrs*100).toFixed(1).padStart(4)}  ${String(TL.NATION_BY_ID[k].ori).padStart(6)}%`);
}
