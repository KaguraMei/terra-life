import fs from 'node:fs'; import path from 'node:path'; import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILES=['js/engine/rng.js','js/engine/text.js','js/engine/region.js','js/data/nations.js','js/data/races.js','js/data/jobs.js','js/data/names.js','js/data/baseline.js','js/data/focus.js','js/engine/lifetable.js','js/engine/cohort.js','js/engine/oripathy.js','js/engine/state.js','js/engine/decision.js','js/data/timeline.js','js/data/events.js','js/data/decisions.js','js/engine/year.js'];
const win={TL:{}}; win.window=win;
const ctx=vm.createContext({window:win,console,Math,JSON,Date,Float64Array,Object,Array,Number,String,Boolean,isFinite,parseFloat,parseInt});
for(const f of FILES) vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),ctx,{filename:f});
const TL=win.TL;
const buckets={};
const condCount={}; const evCount={};
for(let i=0;i<200;i++){
  const S=TL.newLife({}); let g=0;
  while(S.phase==='life'&&g++<4000){
    if(!S.focus) S.focus=TL.autoFocus(S);
    TL.tick(S,S.yearSec/8);
    if(S.pending) TL.autoChoose(S);
    if(S.phase!=='life') break;
    const a=S.age; const n=TL.NATION_BY_ID[S.nation];
    const off=6+(a<15?n.u5/20:0)+(a>50?(a-50)*0.08:0);
    const exp=TL.expHealth(a)-off;
    const b=Math.min(80,Math.floor(a/10)*10);
    if(!buckets[b]) buckets[b]={gap:0,n:0,hl:0,exp:0};
    buckets[b].gap+=S.st.hl-exp; buckets[b].n++; buckets[b].hl+=S.st.hl; buckets[b].exp+=exp;
  }
  const nc=Object.keys(S.conds).length;
  condCount[nc]=(condCount[nc]||0)+1;
  for(const e in S.flags) if(e.startsWith('ev_')) evCount[e]=(evCount[e]||0)+1;
}
console.log('\n年龄段  hl均值  hl基准  平均差(hl-exp)   样本');
for(const k of Object.keys(buckets).sort((a,b)=>a-b)){
  const b=buckets[k];
  console.log(`  ${String(k).padStart(3)}-${String(+k+9).padStart(3)}  ${(b.hl/b.n).toFixed(1).padStart(6)}  ${(b.exp/b.n).toFixed(1).padStart(6)}  ${(b.gap/b.n>=0?'+':'')}${(b.gap/b.n).toFixed(1).padStart(6)}   ${b.n}`);
}
console.log('\n慢性病数量分布:', JSON.stringify(condCount));
console.log('\n事件触发次数 top20:');
Object.entries(evCount).sort((a,b)=>b[1]-a[1]).slice(0,20).forEach(([k,v])=>console.log('  '+k.replace('ev_','').padEnd(22)+v));
