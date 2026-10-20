import {simulation} from './sim-context.mjs';
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {TL} = simulation();
const cnt={}; let total=0, uniqAll=new Set();
for(let i=0;i<300;i++){
  const S=TL.newLife({}); let g=0;
  while(S.phase==="life"&&g++<4000){ if(!S.focus)S.focus=TL.autoFocus(S); TL.tick(S,S.yearSec/8); if(S.pending)TL.autoChoose(S); if(S.phase!=="life")break; }
  for(const e of S.log){ cnt[e.text]=(cnt[e.text]||0)+1; total++; uniqAll.add(e.text); }
}
console.log(`总计 ${total} 条日志，去重后 ${uniqAll.size} 条，全局重复率 ${((1-uniqAll.size/total)*100).toFixed(1)}%`);
console.log(`平均每局 ${(total/300).toFixed(1)} 条日志\n`);
console.log("最高频的 22 句：");
Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,22).forEach(([t,c])=>console.log(`  ${String(c).padStart(5)}  ${t.slice(0,58)}`));
