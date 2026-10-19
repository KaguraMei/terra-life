import assert from 'node:assert/strict';
import {simulation} from './sim-context.mjs';
import {completeInterview} from './interview-test-helpers.mjs';
const errors=[];
const {TL}=simulation({log(){},warn(){},error(...a){errors.push(a.join(' '));}});
function fixture(nation='URS',year=1095) {
  const S=TL.newLife({seed:501991,nation,race:'liberi',bornYear:year-25});
  Object.assign(S,{age:25,year,job:'factory',school:null,eduLevel:3,arts:70,q:1,
    city:'切尔诺伯格',refugee:false,serveLeft:0,flags:{},queue:[],pending:null,
    st:{hl:90,sm:80,so:80,h:0},orgSchema:1});
  TL.infect(S,true);S.ori.known=true;S.ori.treated=false;
  return S;
}
function contact(S) {
  TL.fire(S,{type:'ev',id:'reunion_recruit'});
  assert.equal(S.flags.reunionContactYear,S.year);
}
for(const year of [1093,1094,1095,1096,1097,1100]) {
  for(const nation of ['URS','YAN','LMN','VIC','SIR']) {
    const S=fixture(nation,year), allowed=nation==='URS' && [1094,1095].includes(year);
    assert.equal(TL.reunionCanContact(S),allowed,`${nation}/${year}`);
    assert.equal(TL.canJoinOrganization(S,'reunion','infected'),false,'contact required');
    assert.ok(!TL.scheduledDecisions(S).some(e=>e.id==='reunion_invite'),'no contact bypass');
    S.flags.reunionContactYear=year;
    assert.equal(TL.canJoinOrganization(S,'reunion','infected'),allowed);
    if(!allowed) {
      TL.fire(S,{type:'ev',id:'reunion_recruit'});
      TL.openDecision(S,'reunion_invite');
      assert.equal(S.pending,null);
      assert.equal(S.evCount.reunion_recruit,undefined);
    }
  }
}
for(const mutate of [S=>S.ori=null,S=>S.age=14,S=>S.school='university',S=>S.job='prison',
  S=>S.serveLeft=1,S=>S.flags.retired=true,S=>S.age=65]) {
  const S=fixture();mutate(S);assert.equal(TL.reunionCanContact(S),false);
  S.flags.reunionContactYear=S.year;assert.equal(TL.canJoinOrganization(S,'reunion','infected'),false);
}
{
  const S=fixture();S.st.h=100;S.q=5;S.ori.treated=true;S.ori.known=false;
  // Eligibility needs actual contact, never an arbitrary high/low lean roll alone.
  assert.equal(TL.canJoinOrganization(S,'reunion','infected'),false);
}
{
  const S=fixture();S.age=15;S.job='childwork';contact(S);
  assert.ok(TL.scheduledDecisions(S).some(e=>e.id==='reunion_invite'));
  TL.openDecision(S,'reunion_invite');
  TL.choose(S,S.pending.options.findIndex(o=>o.label==='拒绝'));
  assert.equal(S.phase,'life');assert.equal(S.affiliation,null,'refusal is not an execution');
}
{
  const S=fixture('URS',1094);contact(S);
  TL.openDecision(S,'reunion_invite');TL.choose(S,0);
  assert.match(S.pending.title,/营地接纳/);
  assert.equal(completeInterview(TL,S).status,'passed');
  assert.equal(S.income,0,'factory worker can join without professional guard qualifications');
  S.orgService=20;S.year=1095;TL.promoteOrganization(S);TL.computeIncome(S);
  assert.equal(S.income,0,'promotion does not create wages');
  S.q=3;S.fam.kids=[];S.fam.partner=null;S.conds={};S.money=10;S.debt=0;
  assert.ok(S.subsistenceAnnual>0);
  assert.equal(TL.finances(S),0,'basic rations cover one person only');
  assert.equal(S.money,10,'supplies cannot become cash');
  S.ori.treated=true;assert.ok(TL.finances(S)<0,'medicine is not covered');
  S.year=1096;TL.computeIncome(S);
  assert.equal(S.affiliation,null);assert.equal(S.job,'seeking');
  assert.equal(S.flags.reunion,false);assert.equal(S.subsistenceAnnual,0);
  assert.equal(S.orgHistory[0].leftYear,1096);
  assert.match(S.orgHistory[0].reason,/九/);
  S.year=1105;TL.syncOrganization(S);assert.equal(S.affiliation,null);
}
{
  const S=fixture();contact(S);TL.tryJoinOrganization(S,'reunion','infected');
  const a=S.orgApplication,q=a.session.questions[0];S.year=1096;
  assert.equal(TL.answerOrganizationInterview(S,a.token,q.id,q.options[0].id),false);
  assert.equal(S.orgApplication,null);assert.equal(S.affiliation,null);
}
{
  const S=fixture('URS',1100);S.orgSchema=0;S.flags.reunion=true;
  TL.syncOrganization(S);assert.equal(S.flags.reunion,false);assert.equal(S.affiliation,null);
}
for(const year of [1098,1099,1105]) {
  for(const city of ['旧沃尔西尼','新沃尔西尼','其他家族城市']) {
    const S=fixture('SIR',year);S.city=city;S.job='guard';S.q=3;
    assert.equal(TL.canJoinOrganization(S,'sir_family','outsider'),false,'no introduction');
    const allowed=year<1099 || city!=='新沃尔西尼';
    assert.equal(TL.organizationOpportunities(S).some(o=>o.organization==='sir_family'),allowed);
    S.flags.sirFamilyIntroducedYear=year;
    assert.equal(TL.canJoinOrganization(S,'sir_family','outsider'),allowed);
    if(allowed) {assert.ok(TL.joinOrganization(S,'sir_family','outsider'));S.year=Math.max(year,1099);
      S.city='新沃尔西尼';TL.syncOrganization(S);assert.equal(S.affiliation,null);}
  }
}
{
  const S=fixture('SIR',1100);S.city='其他家族城市';S.job='guard';S.q=3;
  const pick=TL.wpickArr;
  TL.wpickArr=(arr,...rest)=>arr.find(x=>x.organization==='sir_family') || pick(arr,...rest);
  try {TL.fire(S,{type:'ev',id:'organization_offer'});} finally {TL.wpickArr=pick;}
  assert.equal(S.flags.sirFamilyIntroducedYear,1100);
  assert.match(S.pending.text,/中间人/);assert.equal(S.pending.options[0].label,'随引荐人赴约');
  TL.choose(S,0);assert.match(S.pending.title,/家族试探/);
  assert.equal(completeInterview(TL,S).status,'passed');
}
const ev=TL.TIMELINE.find(e=>e.id==='urs_cherobog');
{
  const S=fixture();contact(S);assert.ok(TL.joinOrganization(S,'reunion','infected'));
  const chance=TL.chance;TL.chance=()=>false;
  try {TL.endYear(S);} finally {TL.chance=chance;}
  assert.equal(S.year,1096);assert.equal(S.affiliation,null,'real yearly advance dissolves old membership');
  assert.ok(!S.queue.some(e=>e.id.startsWith('reunion_') || e.id.startsWith('org_reunion_')));
}
assert.equal(ev.at[0].die,0.10,'do not stack a new fatal roll');
for(const cause of ['cat','hom']) {
  const S=fixture('URS',1096);S.ori=null;
  const chance=TL.chance,pick=TL.pick;
  TL.chance=()=>true;TL.pick=arr=>arr.find(x=>x.cause===cause) || pick(arr);
  try {TL.timelineYear(S);} finally {TL.chance=chance;TL.pick=pick;}
  assert.equal(S.deathCause,cause);assert.equal(S.deathTrigger,'timeline:urs_cherobog');
  assert.equal(S.phase,'report');assert.equal(S.refugee,false,'death cannot follow successful escape');
  assert.ok(S.log.some(e=>/切尔诺伯格/.test(e.text) && (cause==='cat'?/天灾/.test(e.text):/夺走了你的生命/.test(e.text))));
}
{
  const S=fixture('URS',1096),chance=TL.chance;TL.chance=()=>false;
  try {TL.timelineYear(S);} finally {TL.chance=chance;}
  assert.equal(S.phase,'life');assert.equal(S.refugee,true);assert.equal(S.city,'荒野流民营地');
  assert.equal(TL.reunionCanContact(S),false);
  const hp=S.st.hl;TL.timelineYear(S);assert.equal(S.st.hl,hp,'no repeated historical damage');
}
for(const [nation,city,refugee] of [['URS','彼得海姆',false],['YAN','切尔诺伯格',false],['URS','切尔诺伯格',true]]) {
  const S=fixture(nation,1096);S.city=city;S.refugee=refugee;
  assert.equal(!!ev.at[0].when(S),false,'only residents physically present');
}
assert.equal(errors.length,0,errors.join('\n'));
console.log('PASS: faction contact/year/location gates, non-corporate admission, zero wages/rations, old Reunion closure, stale applications, local family reform, Chernobog death causes and escape.');
