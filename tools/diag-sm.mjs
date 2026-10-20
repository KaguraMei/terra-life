import {simulation} from './sim-context.mjs';
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {TL} = simulation();
const peak=[],edu={},quats=[];
for(let i=0;i<400;i++){
  const S=TL.newLife({}); let g=0; let mx=0;
  while(S.phase==="life"&&g++<4000){ if(!S.focus)S.focus=TL.autoFocus(S); TL.tick(S,S.yearSec/8); if(S.pending)TL.autoChoose(S); if(S.phase!=="life")break; if(S.st.sm>mx)mx=S.st.sm; }
  peak.push(Math.round(mx)); edu[S.eduLevel]=(edu[S.eduLevel]||0)+1;
  // 统计同一句话重复
  const texts=S.log.map(e=>e.text); const dup=texts.length-new Set(texts).size;
  quats.push(dup/texts.length);
}
peak.sort((a,b)=>a-b);
console.log("学识峰值分位: P25="+peak[100]+" P50="+peak[200]+" P75="+peak[300]+" 最大="+peak[399]);
console.log("学历分布:", JSON.stringify(edu));
const avg=quats.reduce((a,b)=>a+b,0)/quats.length;
console.log("日志重复率均值: "+(avg*100).toFixed(1)+"%");
