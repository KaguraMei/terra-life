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
assert.ok(T.deathProb(terminalOripathy)<1,'100% fusion is not an automatic same-year death');
assert.ok(terminalOripathy.ori.bloodDensity>0 && terminalOripathy.ori.bloodDensity<1,
  'infection records a separate blood crystal density');
assert.equal(T.oriStageOf(0.24), 1, 'high fusion with 0.24u/L blood density remains mild');
assert.equal(T.oriStageOf(0.33), 2, '0.33u/L blood density enters the moderate blood-density band');
assert.equal(T.oriStageOf(0.40), 2, 'the 0.40u/L boundary remains moderate');
assert.equal(T.oriStageOf(0.41), 3, 'blood density above 0.40u/L is severe');
terminalOripathy.ori.crystal = 16; terminalOripathy.ori.bloodDensity = 0.24;
terminalOripathy.ori.stage = T.oriStageOf(terminalOripathy.ori.bloodDensity);
assert.equal(terminalOripathy.ori.stage, 1, 'fusion percentage does not override clinical blood staging');
terminalOripathy.ori.bloodDensity = 0.55;
terminalOripathy.ori.stage = T.oriStageOf(terminalOripathy.ori.bloodDensity);
terminalOripathy.st.hl=5;
assert.equal(T.pickCause(terminalOripathy,terminalOripathy.age,false),'ori',
  'advanced disease with critical health is attributed to oripathy');

// Source arts are offered by situation and profile, not by a universal annual
// cast button.  A constructed high-control infected profile must be able to
// survive a matched fall while paying the explicit last-stand costs.
const artsSaved = T.newLife({seed:41005,nation:'YAN',race:'feline'});
artsSaved.age = 32; artsSaved.year = artsSaved.bornYear + artsSaved.age;
artsSaved.arts = 96;
artsSaved.artsProfile = {
  primary:'gravity', secondary:null, affinity:0.98,
  training:{gravity:100}, control:100, fatigue:0, uses:0,
  lastType:null, lastAge:null
};
T.infect(artsSaved,true,{bloodDensity:0.24});
artsSaved.ori.stage = T.oriStageOf(artsSaved.ori.bloodDensity);
artsSaved.flags.artsRescueContext = {cause:'fall', trigger:'test', situation:'fall'};
const bloodBeforeStand = artsSaved.ori.bloodDensity;
const nerveBeforeStand = artsSaved.ori.organLoad.nerve;
const standText = T.resolveArtsRescue(artsSaved,true);
assert.equal(artsSaved.phase,'life','a successful last stand keeps the life active');
assert.equal(artsSaved.flags.artsLastStandAt,artsSaved.age,'last stand records its age');
assert.ok(artsSaved.ori.bloodDensity > bloodBeforeStand,'last stand raises blood density');
assert.ok(artsSaved.ori.organLoad.nerve > nerveBeforeStand,'last stand raises nerve burden');
assert.match(String(standText),/生路|活下来/,'successful last stand returns survival text');

// Exercise the real timeline death hook: the Urus Koval mine riot must offer
// the event-specific rescue scene, stop before finalizing death, then resume
// the event after the player survives.
const timelineRescue = T.newLife({seed:41008,nation:'URS',race:'ursus',bornYear:1059});
Object.assign(timelineRescue,{age:30,year:1089,job:'miner',city:'北原矿区'});
timelineRescue.arts=96;
timelineRescue.artsProfile={primary:'gravity',secondary:null,affinity:0.98,
  training:{gravity:100},control:100,fatigue:0,uses:0};
T.infect(timelineRescue,true,{bloodDensity:0.24});
const originalChance=T.chance; T.chance=()=>true;
try { T.fireTimeline(timelineRescue,T.TL_BY_ID.urs_koval); }
finally { T.chance=originalChance; }
assert.equal(timelineRescue.pending?.id,'arts_rescue','a fatal timeline event opens the rescue choice');
assert.equal(timelineRescue.flags.artsRescueContext.situation,'mine_riot',
  'the accident trigger selects a mine-riot-specific technique scene');
assert.equal(timelineRescue.phase,'life','timeline death pauses before finalization');
T.choose(timelineRescue,0);
assert.equal(timelineRescue.phase,'life','a successful event-scene rescue returns to the active life');
assert.equal(timelineRescue.pending,null,'the rescue choice is consumed exactly once');

// Cherobog's fatal condition also carries displacement. The deferred move must
// still occur exactly once after a successful rescue.
const cherobogRescue=T.newLife({seed:41010,nation:'URS',race:'ursus',bornYear:1066});
Object.assign(cherobogRescue,{age:30,year:1096,job:'miner',city:'切尔诺伯格'});
cherobogRescue.arts=96;
cherobogRescue.artsProfile={primary:'gravity',secondary:null,affinity:0.98,
  training:{gravity:100},control:100,fatigue:0,uses:0};
T.infect(cherobogRescue,true,{bloodDensity:0.24});
const cherobogChance=T.chance; T.chance=()=>true;
try { T.fireTimeline(cherobogRescue,T.TL_BY_ID.urs_cherobog); }
finally { T.chance=cherobogChance; }
assert.equal(cherobogRescue.pending?.id,'arts_rescue','a Cherobog fatal outcome offers an event-specific rescue');
T.choose(cherobogRescue,0);
assert.equal(cherobogRescue.refugee,true,'the interrupted Cherobog migration effect resumes after rescue');
assert.equal(cherobogRescue.city,'荒野流民营地','the survivor is displaced to the refugee camp');
assert.equal(cherobogRescue.pending,null,'the resumed Cherobog event leaves no stale choice');

// If resumed timeline processing reaches another fatal condition, its new
// rescue choice must survive completion of the first choice.
const kovalEvent=T.TL_BY_ID.urs_koval;
const originalKovalAt=kovalEvent.at;
kovalEvent.at=originalKovalAt.concat([{when:S=>!S.flags.testSecondFatal,
  die:1,dieCause:'inj',flag:'testSecondFatal'}]);
const chainedTimelineRescue=T.newLife({seed:41009,nation:'URS',race:'ursus',bornYear:1059});
Object.assign(chainedTimelineRescue,{age:30,year:1089,job:'miner',city:'北原矿区'});
chainedTimelineRescue.arts=96;
chainedTimelineRescue.artsProfile={primary:'gravity',secondary:null,affinity:0.98,
  training:{gravity:100},control:100,fatigue:0,uses:0};
T.infect(chainedTimelineRescue,true,{bloodDensity:0.24});
const chainedChance=T.chance; T.chance=()=>true;
try {
  T.fireTimeline(chainedTimelineRescue,kovalEvent);
  T.choose(chainedTimelineRescue,0);
  assert.equal(chainedTimelineRescue.pending?.id,'arts_rescue',
    'a second fatal timeline condition can open a follow-up rescue choice');
  assert.equal(chainedTimelineRescue.flags.artsRescueContext.continuation.atIndex,2,
    'the follow-up rescue resumes at its own timeline condition');
  T.choose(chainedTimelineRescue,0);
  assert.equal(chainedTimelineRescue.pending,null,'the follow-up rescue choice is consumed once');
  assert.equal(chainedTimelineRescue.phase,'life','both successful rescues preserve the active life');
} finally {
  T.chance=chainedChance;
  kovalEvent.at=originalKovalAt;
}

// A matched but untrained profile must still be able to fail, and failure
// consumes the infected branch's extra blood burden before death is finalized.
const artsFailed = T.newLife({seed:41006,nation:'YAN',race:'feline'});
artsFailed.age = 32; artsFailed.year = artsFailed.bornYear + artsFailed.age;
artsFailed.arts = 4;
artsFailed.artsProfile = {
  primary:'gravity', secondary:null, affinity:0.18,
  training:{gravity:0}, control:18, fatigue:0, uses:0,
  lastType:null, lastAge:null
};
T.infect(artsFailed,true,{bloodDensity:0.24});
artsFailed.ori.stage = T.oriStageOf(artsFailed.ori.bloodDensity);
artsFailed.flags.artsRescueContext = {cause:'fall', trigger:'test', situation:'fall'};
const bloodBeforeFailed = artsFailed.ori.bloodDensity;
// The failure branch is deterministic here: the score is far below the
// situation threshold, regardless of the seeded ±8 roll.
const failedText = T.resolveArtsRescue(artsFailed,true);
assert.equal(artsFailed.phase,'report','failed last stand finalizes the death report');
assert.ok(artsFailed.ori.bloodDensity > bloodBeforeFailed,'failed last stand still raises blood density');
assert.match(String(failedText),/施术|技艺/,'failed last stand returns failure text');

// The old 100% compatibility value is clamped on the next disease advance;
// no simulated living infected person can grow beyond the documented 19% cap.
const capped = T.newLife({seed:41007,nation:'YAN'});
T.infect(capped,true,{bloodDensity:0.24});
capped.ori.crystal = 100;
capped.ori.stage = T.oriStageOf(capped.ori.bloodDensity);
T.oriYear(capped);
assert.equal(capped.ori.crystal,T.ORI_FUSION_MAX,'legacy fusion values are migrated to the 19% cap');
assert.ok(capped.ori.crystal <= 19,'fusion cannot exceed the evidence-backed cap');

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
const app=simulation({log(){},warn(){},error(...args){errors.push(args);}});
const U=app.TL;
U.UI={auto:false}; U.$=element;
for(const name of ['renderAll','renderFocus','renderTop','renderLandingOdds','initLanding',
  'showDecision','drawLifeChart','drawWealthChart','renderFeed','renderLandingTitle',
  'renderNoticeBoard','initNotice']) U[name]=()=>{};
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
