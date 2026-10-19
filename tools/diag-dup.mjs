import fs from "node:fs"; import path from "node:path"; import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES=["js/engine/rng.js","js/engine/text.js","js/engine/region.js","js/data/nations.js","js/data/races.js","js/data/jobs.js","js/data/names.js","js/data/baseline.js","js/data/focus.js", 'js/data/organizations.js',"js/engine/lifetable.js","js/engine/cohort.js","js/engine/oripathy.js","js/engine/state.js","js/engine/decision.js","js/data/timeline.js","js/data/events.js","js/data/decisions.js",'js/engine/organization.js', 'js/data/organization-events.js', 'js/data/interviews.js', 'js/engine/interview.js', "js/engine/year.js"];
const win={TL:{}}; win.window=win;
const ctx=vm.createContext({window:win,console,Math,JSON,Date,Float64Array,Object,Array,Number,String,Boolean,isFinite,parseFloat,parseInt});
for(const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT,f),"utf8"),ctx,{filename:f});
const TL=win.TL;
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
