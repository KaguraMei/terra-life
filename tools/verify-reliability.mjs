import assert from 'node:assert/strict';
import vm from 'node:vm';
import {simulation, read} from './sim-context.mjs';

const {TL:T} = simulation();
// Time after a pending choice must not be credited before the player chooses.
let S = T.newLife({seed:1,nation:'YAN'});
S.queue = [{at:0.25,type:'dec',id:'first_school'}]; S.focus = 'play'; S.fT = {};
T.tick(S,S.yearSec);
assert.equal(S.t,0.25);
assert.equal(S.fT.play,0.25);
assert.ok(S.pending);

// Cross-year fast-forward and fine-grained normal playback encounter the same first choice.
function firstChoice(fast) {
  const s = T.newLife({seed:89,nation:'LAT',bornYear:1080});
  let count = 0;
  while (s.phase === 'life' && !s.pending && count++ < 20000) {
    if (fast) T.advanceToDecision(s,32);
    else T.tick(s,s.yearSec/128);
  }
  assert.ok(s.pending);
  return JSON.stringify({age:s.age,id:s.pending.id,st:s.st,log:s.log,flags:s.flags});
}
assert.equal(firstChoice(true),firstChoice(false));

// The old residual `ocd` bucket used to be shown as “其他原因” for deaths
// below age 50. It is now expanded into concrete age/environment causes
// before the annual death draw, so reports must never receive `ocd`.
S = T.newLife({seed:12345,nation:'YAN'});
for (const age of [0, 2, 8, 24, 55, 83]) {
  S.age = age; S.year = S.bornYear + age;
  const weights = T.causeWeights(S, age, false);
  assert.equal(weights.ocd, undefined, 'residual cause bucket is expanded at age ' + age);
  assert.notEqual(T.pickCause(S, age, false), 'ocd', 'residual cause is not reported at age ' + age);
}
assert.notEqual(T.causeName('ocd', 24), '其他原因', 'legacy reports have a meaningful fallback label');

// Aegir share a strong relationship with water, but underwater breathing is an
// individual rare trait; ordinary Aegir retain drowning risk. This is not a
// dehydration or hydration mechanic.
const aegirNonBreather = T.newLife({seed:41001,nation:'AEG',race:'aegir',traits:{underwaterBreathing:false}});
const aegirBreather = T.newLife({seed:41001,nation:'AEG',race:'aegir',traits:{underwaterBreathing:true}});
for (const person of [aegirNonBreather,aegirBreather]) {
  person.job='fisher'; person.stratum='wild'; person.age=25;
}
assert.ok(T.causeWeights(aegirNonBreather,25,false).drown > 0,
  'most Aegir can still die by drowning');
assert.equal(T.causeWeights(aegirBreather,25,false).drown, undefined,
  'underwater-breathing individuals are excluded from drowning deaths');
assert.equal(T.newLife({seed:41001,nation:'AEG',race:'aegir'}).traits.underwaterBreathing,
  T.newLife({seed:41001,nation:'AEG',race:'aegir'}).traits.underwaterBreathing,
  'individual water adaptation is reproducible from a seed');
const ordinaryRace = T.newLife({seed:41001,nation:'AEG',race:'feline',traits:{underwaterBreathing:true}});
assert.equal(ordinaryRace.traits.underwaterBreathing, undefined,
  'Aegir-specific water adaptation is not assigned to other races');
for (const job of ['farm','farmhand','agbiz']) {
  assert.equal(T.jobAvailable(job,'AEG','aegir'),false,job+' is unavailable in the Aegir homeland');
  assert.equal(T.jobAvailable(job,'CLB','aegir'),true,job+' remains possible for Aegir living in a land region');
}

// Ursus' internal purge must be lived in Ursus; other nations only hear about it.
const ursusPurge = T.TL_BY_ID.urs_purge;
const localWitness = T.newLife({seed:41003,nation:'URS',race:'ursus',bornYear:1052});
Object.assign(localWitness,{age:25,year:1077,city:'切尔诺伯格',job:'scholar'});
T.timelineYear(localWitness);
assert.ok(localWitness.log.some(entry=>entry.key==='urs_purge_at'),
  'an eligible local researcher can experience the purge investigation');
const foreignWitness = T.newLife({seed:41004,nation:'YAN',race:'feline',bornYear:1052});
Object.assign(foreignWitness,{age:25,year:1077,city:'切尔诺伯格',job:'scholar'});
T.timelineYear(foreignWitness);
assert.ok(foreignWitness.log.some(entry=>entry.key==='urs_purge' && /听说|被指/.test(entry.text)),
  'foreign characters receive rumor text for the Ursus event');
assert.equal(foreignWitness.log.some(entry=>entry.key==='urs_purge_at'),false,
  'foreign characters do not receive a local personal consequence');

const terminalOripathy = T.newLife({seed:41002,nation:'YAN'});
T.infect(terminalOripathy,true);
terminalOripathy.ori.crystal=100; terminalOripathy.ori.stage=3;
assert.equal(T.deathProb(terminalOripathy),1,'100% crystal rate is terminal');
assert.equal(T.pickCause(terminalOripathy,terminalOripathy.age,false),'ori',
  'terminal crystal death is attributed to oripathy');

// Fast-forward stops at death even if no choice remains.
S = T.newLife({seed:5});
const death = T.deathProb, schedule = T.scheduleEvents;
T.deathProb = () => 1; T.scheduleEvents = () => {};
S.queue = [];
assert.equal(T.advanceToDecision(S),'ended');
assert.equal(S.phase,'report');
T.deathProb = death; T.scheduleEvents = schedule;

// The organization gate applies to scheduling, direct firing, choices and recruitment.
S = T.newLife({seed:7,nation:'URS',bornYear:1042});
S.age=25; S.year=1067; S.st.sm=90; S.eduLevel=4; S.arts=95; S.q=4; S.money=100;
T.infect(S,true);
for (const [id,ev] of Object.entries(T.EVMAP).filter(([,e])=>['rhodes','reunion'].includes(e.organization))) {
  assert.equal(T.contentAvailable(S,ev),false,id);
  T.fire(S,{type:'ev',id}); assert.equal(S.evCount[id],undefined);
}
T.openDecision(S,'reunion_invite'); assert.equal(S.pending,null);
assert.equal(T.tryJoinRhodes(S),false);
T.openDecision(S,'ori_treatment');
assert.ok(S.pending.options.every(o=>!o.label.includes('罗德岛')));
T.choose(S,0);
T.openDecision(S,'teen_fork');
assert.ok(S.pending.options.every(o=>!o.label.includes('考干员')));
T.choose(S,0);
S.year=1100;
S.school=null; S.job='guard'; S.serveLeft=0;
assert.equal(T.organizationAvailable(S,'rhodes'),true);
assert.ok(T.EVMAP.rhodes_scholar.when(S));
assert.equal(T.canJoinOrganization(S,'reunion','infected'),false);
S.year=1095;S.flags.reunionContactYear=1095;
T.openDecision(S,'reunion_invite'); T.choose(S,0);
while (S.pending?.id === 'organization_interview') {
  const a=S.orgApplication, q=a.session.questions[a.session.answers.length];
  const scores=q.options.map(o=>a.session.pool.axes.reduce((sum,x)=>sum+o.scores[x.id]*x.weight,0));
  T.choose(S,scores.indexOf(Math.max(...scores)));
}
if(S.pending?.id === 'organization_interview_result') T.choose(S,0);
assert.ok(S.flags.reunion);
assert.equal(S.flags.reunionJoined,S.age);
assert.ok(T.EVMAP.reunion_life.when(S));

// Exercise the real main.js callbacks with a minimal DOM; rendering itself is browser-tested.
const errors=[], frames=[], windowEvents={}, documentEvents={}, elements=new Map(), storage=new Map();
function element(id) {
  if (elements.has(id)) return elements.get(id);
  const handlers={}, classes=new Set();
  const e={id,hidden:false,value:'',innerHTML:'',textContent:'',firstChild:{nodeValue:''},style:{},dataset:{},
    classList:{add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),
      toggle(c,on){if(on ?? !classes.has(c)) classes.add(c); else classes.delete(c);}},
    addEventListener(name,fn){handlers[name]=fn;},setAttribute(){},removeAttribute(){},focus(){},
    querySelectorAll(){return [];},querySelector(){return null;},
    appendChild(child){elements.set(child.id,child);},
    click(){handlers.click?.({target:e});}
  }; elements.set(id,e); return e;
}
// Wire the application storage port the way the browser bootstrap does, so the
// archive assertions exercise the real port instead of a raw localStorage read.
const app=simulation({log(){},warn(){},error(...args){errors.push(args);}},
  {storage:()=>({getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)})});
const U=app.TL;
U.UI={auto:false}; U.$=element;
for(const name of ['renderAll','renderFocus','renderTop','renderLandingOdds','initLanding',
  'showDecision','drawLifeChart','drawWealthChart','renderFeed','renderLandingTitle']) U[name]=()=>{};
U.birthIntro=(_s,_o,begin)=>begin();
const doc={readyState:'loading',title:'Test',body:element('body'),
  getElementById:element,createElement:()=>({style:{}}),querySelectorAll:()=>[],querySelector:element,
  addEventListener:(name,fn)=>{documentEvents[name]=fn;}};
Object.assign(app.window,{addEventListener:(name,fn)=>{windowEvents[name]=fn;},
  location:{search:''},navigator:{language:'zh-CN'}});
Object.assign(app.context,{document:doc,location:app.window.location,navigator:app.window.navigator,
  URLSearchParams,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},
  setTimeout:()=>1,clearTimeout(){}});
vm.runInContext(read('js/main.js'),app.context,{filename:'js/main.js'});
documentEvents.DOMContentLoaded();
assert.equal(errors.length,0,'main initializes: ' + errors.map(row=>row.map(String).join(' ')).join('\n'));
element('birth').hidden=true;
element('startBtn').click();
assert.equal(U.S.phase,'life');
element('closeBtn').click();
assert.equal(storage.has('terra-life:v1:completed-lives'),false,'unfinished life is not saved');
// Old malformed summaries are hidden without deleting valid browser records.
storage.set('terra-life:v1:completed-lives',JSON.stringify([{name:'unfinished'},{name:'complete',age:50,cause:'test'}]));
element('closeBtn').click();
assert.ok(!element('saves').innerHTML.includes('unfinished'));
assert.ok(element('saves').innerHTML.includes('complete'));

element('startBtn').click();
U.openDecision(U.S,'first_school');
element('modal').hidden=false;
element('autoBtn').click();
frames.at(-1)(1000);
assert.equal(U.S.pending,null,'auto resolves an already open decision');
assert.equal(element('modal').hidden,true);
U.S.queue=[{at:U.S.t+0.0001,type:'dec',id:'middle_path'}];
frames.at(-1)(1100);
assert.equal(U.S.pending,null,'auto resolves a newly opened decision');
assert.ok(U.S.log.some(e=>e.key==='middle_path'));
U.die(U.S,'old');
frames.at(-1)(1200);
assert.equal(JSON.parse(storage.get('terra-life:v1:completed-lives')).length,2,'completed life saves once');
// 报告头部与「死因」格子改读派生视图，仍必须与快照一致。
assert.match(element('rDead').innerHTML,/卒于 \d+ 岁/,'报告头部含年龄');
assert.ok(element('rDead').innerHTML.includes(U.S.report.causeName),'报告头部死因与快照一致');
assert.ok(element('rGrid').innerHTML.includes(U.S.report.causeName),'死因格子与快照一致');

// 续玩：年度结算自动存档，开局页出现「继续上次人生」，点击后回到同一个结算点。
// 固定种子：这里验的是接线，不是随机分布；不播种会让断言随局外随机结果飘。
element('restartBtn').click();
const seededLife = U.newLife({seed: 700021, pace: 'short'});
U.endYear(seededLife);
assert.equal(seededLife.phase,'life','第一年结算后仍在世（固定种子）');
assert.ok(storage.has('terra-life:v1:resumable-life'),'年度结算后写入可续存档');
const boundaryAge = seededLife.age;
element('restartBtn').click();
assert.equal(element('resumeBtn').hidden,false,'有存档时显示继续入口');
element('resumeBtn').click();
assert.equal(element('game').hidden,false,'续玩直接进入游戏界面');
assert.notEqual(U.S,seededLife,'续玩重建状态而不是复用对象');
assert.equal(U.S.age,boundaryAge,'恢复到同一个年度结算点');
U.die(U.S,'old');
assert.equal(storage.has('terra-life:v1:resumable-life'),false,'死亡后不再提供续玩');

for (const [name,event] of [['error',{error:new Error('test error')}],
  ['unhandledrejection',{reason:new Error('test rejection')}]]) {
  const before=errors.length; windowEvents[name](event);
  assert.equal(errors.length,before+1);
  assert.match(element('errbox').textContent,/test/);
}
const before=errors.length;
app.context.console.error('event failure');
assert.equal(errors.length,before+1,'console.error must not recurse or log twice');
console.log('PASS: time accounting, cross-year skip/death, organization boundaries, recruitment fields, main auto decisions, archive boundary, error/rejection/console reporting.');
