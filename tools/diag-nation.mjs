import {simulation} from './sim-context.mjs';
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {TL} = simulation();
const per={};
for(const n of TL.NATIONS) per[n.id]={n:0,inf:0,age:0};
for(let i=0;i<1500;i++){
  const S=TL.newLife({}); let g=0;
  while(S.phase==="life"&&g++<4000){ if(!S.focus)S.focus=TL.autoFocus(S); TL.tick(S,S.yearSec/8); if(S.pending)TL.autoChoose(S); if(S.phase!=="life")break; }
  const p=per[S.nation]; p.n++; p.age+=S.deathAge; if(S.ori&&S.ori.stage>0)p.inf++;
}
const rows=Object.entries(per).filter(([,v])=>v.n>0).map(([k,v])=>[TL.NATION_BY_ID[k].name,v.n,v.inf/v.n,v.age/v.n,TL.NATION_BY_ID[k].ori,TL.NATION_BY_ID[k].le]);
rows.sort((a,b)=>b[2]-a[2]);
console.log("国家      样本  感染率   平均寿命  设定感染率  设定寿命");
for(const r of rows) console.log(`  ${r[0].padEnd(8)}${String(r[1]).padStart(5)}  ${(r[2]*100).toFixed(1).padStart(5)}%  ${r[3].toFixed(1).padStart(7)}  ${String(r[4]).padStart(9)}%  ${String(r[5]).padStart(7)}`);
