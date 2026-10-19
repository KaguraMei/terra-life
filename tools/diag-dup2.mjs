import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES=["js/engine/rng.js","js/engine/text.js","js/engine/region.js","js/data/nations.js","js/data/races.js","js/data/jobs.js","js/data/names.js","js/data/baseline.js","js/data/focus.js", 'js/data/organizations.js',"js/engine/lifetable.js","js/engine/cohort.js","js/engine/oripathy.js","js/engine/state.js","js/engine/decision.js","js/data/timeline.js","js/data/events.js","js/data/decisions.js",'js/engine/organization.js', 'js/data/organization-events.js', 'js/data/interviews.js', 'js/engine/interview.js', "js/engine/year.js"];
const win={TL:{}}; win.window=win;
const ctx=vm.createContext({window:win,console,Math,JSON,Date,Float64Array,Object,Array,Number,String,Boolean,isFinite,parseFloat,parseInt});
for(const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT,f),"utf8"),ctx,{filename:f});
const TL=win.TL;
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
