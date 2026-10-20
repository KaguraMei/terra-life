import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {simulation,root} from './sim-context.mjs';
import {completeInterview} from './interview-test-helpers.mjs';
const errors=[];
const {TL}=simulation({log(){},warn(){},error(...args){errors.push(args.join(' '));}});
const copy=x=>JSON.parse(JSON.stringify(x));
function fixture(poolId='rhine_research',seed=84001) {
  const p=TL.INTERVIEW_POOLS[poolId], o=TL.ORGANIZATIONS[p.organization],r=o.routes[p.route];
  const year=Math.max(o.fromYear,r.fromYear||0,p.organization==='babel'?1090:1094);
  const S=TL.newLife({seed,nation:o.nations?.[0]||'KDZ',race:'sarkaz',bornYear:year-30});
  Object.assign(S,{age:30,year,school:null,eduLevel:4,arts:95,q:4,serveLeft:0,
    job:r.jobs?.[0]||'guard',queue:[],pending:null,flags:{babel_ask:1},
    st:{hl:95,sm:95,so:85,h:65}});
  if(p.organization==='laterano_gunknights') S.race='sankta';
  if(p.organization==='reunion' || p.route==='infected') {TL.infect(S,true);S.ori.known=true;}
  if(p.organization==='reunion') S.flags.reunionContactYear=S.year;
  if(p.organization==='sir_family') S.flags.sirFamilyIntroducedYear=S.year;
  return S;
}
function begin(S,poolId='rhine_research',context) {
  const p=TL.INTERVIEW_POOLS[poolId];
  const result=TL.tryJoinOrganization(S,p.organization,p.route,context);
  assert.equal(result.status,'interview',poolId); return S.orgApplication;
}
function bestOption(a) {
  const q=a.session.questions[a.session.answers.length];
  const values=q.options.map(o=>a.session.pool.axes.reduce((s,x)=>s+o.scores[x.id]*x.weight,0));
  return values.indexOf(Math.max(...values));
}
assert.equal(Object.keys(TL.INTERVIEW_QUESTIONS).length,107);
assert.equal(Object.keys(TL.INTERVIEW_POOLS).length,35);
let evaluated=0;
for(const [id,p] of Object.entries(TL.INTERVIEW_POOLS)) {
  for(const style of ['best','worst']) {
    const S=fixture(id), before=copy({job:S.job,age:S.age,year:S.year,t:S.t,st:S.st});
    const a=begin(S,id);
    assert.equal(S.affiliation,null,'not employed while answering');
    assert.equal(S.job,before.job);
    assert.equal(a.session.questions.length,4);
    assert.equal(new Set(a.session.questions.map(q=>q.id)).size,4,'no duplicate question');
    assert.equal(a.session.questions.filter(q=>q.kind==='role').length,1);
    TL.tick(S,100000);
    assert.equal(S.year,before.year);assert.equal(S.t,before.t,'interview pauses time');
    const result=completeInterview(TL,S,style);
    assert.equal(result.status,style==='best'?'passed':'rejected',id+' '+style);
    assert.deepEqual(copy(S.st),before.st,'answers do not damage life attributes');
    assert.equal(S.orgInterviewHistory.length,1);
    if(style==='best') assert.equal(S.affiliation,p.organization);
    else {assert.equal(S.job,before.job);assert.equal(S.orgCooldowns[p.organization],S.year+3);}
    assert.equal(S.orgApplication,null);assert.equal(S.pending,null);
  }
  // Enumerate every base-paper draw (4 choose 3) and every answer combination.
  // All three outcomes must remain reachable on every possible paper.
  const common=p.questionIds.map(x=>TL.INTERVIEW_QUESTIONS[x]).filter(q=>q.kind==='organization');
  const role=p.questionIds.map(x=>TL.INTERVIEW_QUESTIONS[x]).find(q=>q.kind==='role');
  for(let omitted=0;omitted<common.length;omitted++) {
    const qs=common.filter((_,i)=>i!==omitted).concat(role), outcomes=new Set();
    for(let code=0;code<81;code++) {
      let n=code;
      const answers=qs.map(q=>{const o=q.options[n%3];n=Math.floor(n/3);return {question:q.id,option:o.id};});
      const result=TL.evaluateOrganizationInterview({session:{pool:p,questions:qs,answers}});
      outcomes.add(result.status);evaluated++;
      assert.ok(result.score>=0 && result.score<=100.000001);
      if(result.status==='passed') assert.ok(result.axes.every(a=>a.value>=a.minimum));
    }
    assert.deepEqual([...outcomes].sort(),['passed','rejected','waitlisted'],id+' reachable outcomes');
  }
}
// Reproducible paper and answer order; two seeds need not generate the same paper.
function paper(seed){const S=fixture('rhine_research',seed);return copy(begin(S).session.questions);}
assert.deepEqual(paper(100),paper(100));assert.notDeepEqual(paper(100),paper(101));
{
  // An independently known arithmetic case: high aggregate cannot bypass an axis floor.
  const pool=copy(TL.INTERVIEW_POOLS.rhine_research), [x,y,z]=pool.axes.map(a=>a.id);
  const q={id:'arithmetic',options:[{id:'uneven',scores:{[x]:3,[y]:3,[z]:0}},
    {id:'maximum',scores:{[x]:3,[y]:3,[z]:3}}]};
  const result=TL.evaluateOrganizationInterview({session:{pool,questions:[q],answers:[{question:q.id,option:'uneven'}]}});
  assert.equal(result.score,75);assert.equal(result.status,'waitlisted');assert.equal(result.gaps[0],z);
}
{
  const S=fixture(),a=begin(S),qs=a.session.questions;let sequence;
  for(let code=0;code<81&&!sequence;code++) {
    let n=code;const answers=qs.map(q=>{const o=q.options[n%3];n=Math.floor(n/3);return {question:q.id,option:o.id};});
    if(TL.evaluateOrganizationInterview({session:{pool:a.session.pool,questions:qs,answers}}).status==='waitlisted') sequence=answers;
  }
  assert.ok(sequence);
  for(let i=0;i<sequence.length;i++) TL.choose(S,qs[i].options.findIndex(o=>o.id===sequence[i].option));
  assert.equal(S.orgInterviewResult.status,'waitlisted');assert.equal(S.affiliation,null);
  assert.equal(S.orgCooldowns.rhine_life,S.year+1);assert.equal(S.orgInterviewHistory.length,1);
}
{
  const S=fixture();const a=begin(S),q=a.session.questions[0],oldJob=S.job;
  assert.equal(TL.beginOrganizationInterview(S,'rhine_life','research').status,'busy');
  assert.equal(TL.completeOrganizationInterview(S,{token:a.token,status:'passed'}),false,'cannot bypass unfinished interview');
  assert.equal(TL.answerOrganizationInterview(S,a.token+1,q.id,q.options[0].id),false);
  assert.equal(TL.answerOrganizationInterview(S,a.token,q.id,'unknown'),false);
  assert.ok(TL.answerOrganizationInterview(S,a.token,q.id,q.options[0].id));
  assert.equal(TL.answerOrganizationInterview(S,a.token,q.id,q.options[0].id),false,'double submit rejected');
  assert.equal(a.session.answers.length,1);assert.equal(S.job,oldJob);
}
{
  const S=fixture();const a=begin(S);
  TL.choose(S,S.pending.options.length-1);
  assert.equal(S.orgInterviewResult.status,'withdrawn');
  assert.equal(S.affiliation,null);assert.equal(S.orgCooldowns.rhine_life,S.year+3);
  assert.equal(TL.completeOrganizationInterview(S,{token:a.token,status:'passed'}),false);
  TL.choose(S,0);assert.equal(S.pending,null);assert.equal(S.orgApplication,null);
}
for(const mutate of [S=>S.year++,S=>S.flags.retired=true,S=>S.nation='YAN',S=>S.school='university',
  S=>TL.joinOrganization(S,'melander','investigation')]) {
  const S=fixture();begin(S);mutate(S);TL.choose(S,0);
  assert.equal(S.orgInterviewResult.status,'ineligible');assert.notEqual(S.affiliation,'rhine_life');
  assert.equal(S.orgApplication,null);assert.equal(S.orgInterviewHistory.length,1);
}
{
  const S=fixture();begin(S);TL.die(S,'dem','test');
  assert.equal(S.pending,null);assert.equal(S.orgApplication,null);
  assert.equal(S.report.orgInterviewHistory[0].status,'ineligible');
  S.orgInterviewHistory[0].reason='modified';
  assert.notEqual(S.report.orgInterviewHistory[0].reason,'modified','report snapshot');
}
// Real historical transfer preserves current employment until success, including failure/withdrawal.
for(const style of ['best','worst','withdraw']) {
  const S=fixture('sir_family_executor');S.year=1098;S.flags.sirFamilyIntroducedYear=1098;
  assert.ok(TL.joinOrganization(S,'sir_family','executor'));const oldJob=S.job;
  S.year=1099;S.age++;TL.scheduleEvents(S);TL.fire(S,S.queue.find(e=>e.id==='organization_transition'));
  TL.choose(S,S.pending.options.findIndex(o=>o.label.startsWith('转入')));
  assert.equal(S.affiliation,'sir_family');assert.equal(S.job,oldJob);
  if(style==='withdraw') TL.choose(S,S.pending.options.length-1);
  else completeInterview(TL,S,style);
  assert.equal(S.affiliation,style==='best'?'sir_newcourt':'sir_family');
  assert.equal(S.orgHistory.length,style==='best'?2:1);
}
// Old Rhodes event and decision paths now defer employment to the same interview.
for(const entry of ['move_destiny','rhodes_scholar','rhodes_rescued','rhodes_specialist_recruit','rhodes_cooperation','after_school']) {
  const S=fixture('rhodes_operator');S.flags.postCatastrophe=1;S.job='mercenary';
  if(entry==='after_school') {
    TL.openDecision(S,entry);TL.choose(S,S.pending.options.findIndex(o=>o.label==='试着进罗德岛'));
  } else TL.fire(S,{type:'ev',id:entry});
  assert.equal(S.pending?.id,'organization_interview',entry);
  assert.equal(S.opClass,null);assert.equal(S.job,'mercenary');
  assert.equal(completeInterview(TL,S).status,'passed');assert.equal(S.affiliation,'rhodes');
  assert.ok(S.opClass && S.job==='op_'+S.opClass);
}
{
  const S=fixture('reunion_infected'),arts=S.arts;TL.openDecision(S,'reunion_invite');TL.choose(S,0);
  assert.equal(S.flags.reunion,undefined);assert.equal(S.arts,arts);
  assert.equal(completeInterview(TL,S).status,'passed');assert.equal(S.flags.reunion,true);
}
// Auto mode answers without peeking at score data, never randomly withdraws, and terminates.
for(let seed=1;seed<=100;seed++) {
  const S=fixture('rhine_research',seed);begin(S);let steps=0;
  while(S.pending && steps++<10) TL.autoChoose(S);
  assert.equal(steps,5);assert.ok(['passed','rejected','waitlisted'].includes(S.orgInterviewHistory[0].status));
}
// Malformed DLC registration is atomic. The documented example must be runnable.
const example=JSON.parse(fs.readFileSync(path.join(root,'docs/examples/dlc-blacksteel-interviews.json'),'utf8'));
for(const mutate of [
  p=>p.schemaVersion=2,p=>p.extra=true,p=>p.questions[0].prompt='',
  p=>p.questions[0].options[0].scores.discipline=99,
  p=>p.questions[0].options[1].id=p.questions[0].options[0].id,
  p=>p.questions[0].options[0].scores.unknown=1,
  p=>p.questions[0].organization='rhine_life',p=>p.extensions[0].pool='missing',
  p=>p.extensions[0].questionIds.push(p.extensions[0].questionIds[0]),
  p=>p.questions[0].id='core_blacksteel_1',
  p=>{p.questions[0].fromYear=1100;p.questions[0].untilYear=1099;}
]) {
  const data=copy(example);mutate(data);
  const before=JSON.stringify([TL.INTERVIEW_PACKS,TL.INTERVIEW_QUESTIONS,TL.INTERVIEW_POOLS]);
  assert.throws(()=>TL.registerInterviewPack(data),/Interview format/);
  assert.equal(JSON.stringify([TL.INTERVIEW_PACKS,TL.INTERVIEW_QUESTIONS,TL.INTERVIEW_POOLS]),before);
}
{
  const S=fixture('blacksteel_security');const a=begin(S,'blacksteel_security');const before=JSON.stringify(a.session);
  TL.registerInterviewPack(example);
  assert.equal(JSON.stringify(a.session),before,'DLC load does not change an active interview');
  assert.ok(TL.INTERVIEW_POOLS.blacksteel_security.questionIds.includes(example.questions[0].id));
  assert.throws(()=>TL.registerInterviewPack(example),/duplicate pack/);
  assert.equal(completeInterview(TL,S).status,'passed');
}
{
  const p=TL.INTERVIEW_POOLS.rhine_research, ids=p.questionIds.slice(0,2),before=ids.map(id=>copy(TL.INTERVIEW_QUESTIONS[id]));
  ids.forEach(id=>{TL.INTERVIEW_QUESTIONS[id].fromYear=1200;});
  const S=fixture();const result=TL.tryJoinOrganization(S,'rhine_life','research');
  assert.equal(result.status,'unavailable');assert.equal(S.orgApplication,null);assert.equal(S.orgCooldowns.rhine_life,undefined);
  assert.equal(S.pending.id,'organization_interview_result');TL.choose(S,0);assert.equal(S.pending,null);
  ids.forEach((id,i)=>{TL.INTERVIEW_QUESTIONS[id]=before[i];});
}
assert.equal(errors.length,0,errors.join('\n'));
console.log(`PASS: 107 questions / 35 pools; ${evaluated} paper-answer combinations; all-route pass/fail, transfer, legacy entry, cooldown, stale/duplicate result, auto mode and DLC validation.`);
