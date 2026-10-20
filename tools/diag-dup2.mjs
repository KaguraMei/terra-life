import {simulation} from './sim-context.mjs';
import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {TL} = simulation();
let dupRate=0, logLen=0, worst=0, worstTxt="", N=400;
for(let i=0;i<N;i++){
  const S=TL.newLife({}); let g=0;
  while(S.phase==="life"&&g++<4000){ if(!S.focus)S.focus=TL.autoFocus(S); TL.tick(S,S.yearSec/8); if(S.pending)TL.autoChoose(S); if(S.phase!=="life")break; }
  const t=S.log.map(e=>e.text);
  const c={}; for(const x of t) c[x]=(c[x]||0)+1;
  const dup=t.length-new Set(t).size;
  dupRate+=dup/t.length; logLen+=t.length;
  for(const k in c) if(c[k]>worst){worst=c[k];worstTxt=k;}
}
console.log(`平均每局日志 ${(logLen/N).toFixed(1)} 条`);
console.log(`单局内重复率  ${(dupRate/N*100).toFixed(1)}%   (越低越好)`);
console.log(`最严重单句在一局内出现 ${worst} 次: ${worstTxt.slice(0,50)}`);
