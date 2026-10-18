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
for (const [id,ev] of Object.entries(T.EVMAP).filter(([,e])=>e.organization)) {
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
assert.equal(T.organizationAvailable(S,'rhodes'),true);
assert.ok(T.EVMAP.rhodes_scholar.when(S));
T.openDecision(S,'reunion_invite'); T.choose(S,0);
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
const app=simulation({log(){},warn(){},error(...args){errors.push(args);}});
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
assert.equal(storage.has('terra-life-saves-v1'),false,'unfinished life is not saved');
// Old malformed summaries are hidden without deleting valid browser records.
storage.set('terra-life-saves-v1',JSON.stringify([{name:'unfinished'},{name:'complete',age:50,cause:'test'}]));
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
assert.equal(JSON.parse(storage.get('terra-life-saves-v1')).length,2,'completed life saves once');

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
