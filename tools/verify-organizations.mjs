import assert from 'node:assert/strict';
import {simulation} from './sim-context.mjs';
import {completeInterview} from './interview-test-helpers.mjs';

const errors = [];
const {TL} = simulation({log(){}, warn(){}, error(...args){errors.push(args.join(' '));}});
function fixture(id = 'rhine_life', routeId, seed = 700001) {
  const o = TL.organizationDef(id);
  routeId ||= Object.keys(o.routes)[0];
  const r = o.routes[routeId];
  const year = Math.max(o.fromYear, r.fromYear || 0, id === 'babel' ? 1090 : 1094);
  const S = TL.newLife({seed, nation:o.nations?.[0] || 'KDZ', race:'sarkaz', bornYear:year-30});
  Object.assign(S, {age:30, year, school:null, eduLevel:4, q:4, arts:95,
    serveLeft:0, job:r.jobs?.[0] || 'op_guard', queue:[], t:0, pending:null,
    affiliation:null, orgHistory:[], orgContacts:{}, orgCooldowns:{}, flags:{babel_ask:1},
    st:{hl:95,h:70,sm:95,so:95}, evCount:{}, recent:[]});
  if (id === 'laterano_gunknights') S.race = 'sankta';
  if (id === 'rhodes') {S.opClass = 'guard'; S.opRank = 1;}
  if (id === 'reunion' || routeId === 'infected') {TL.infect(S, true); S.ori.known = true;}
  if (id === 'reunion') S.flags.reunionContactYear = S.year;
  if (id === 'sir_family') S.flags.sirFamilyIntroducedYear = S.year;
  return S;
}
function join(id = 'rhine_life', route) {
  const S = fixture(id, route);
  assert.ok(TL.joinOrganization(S, id, route || Object.keys(TL.ORGANIZATIONS[id].routes)[0]));
  return S;
}
function chooseLabel(S, text) {
  const index = S.pending.options.findIndex(o => o.label.includes(text));
  assert.ok(index >= 0, 'choice available: ' + text);
  TL.choose(S, index);
}
let routeCount = 0, scheduledRoutes = 0;
for (const [id, o] of Object.entries(TL.ORGANIZATIONS)) {
  for (const contact of o.contacts || []) {
    assert.ok(contact.interaction && contact.interaction.trim(),
      `contact has specific interaction: ${id}/${contact.id}`);
  }
  for (const [route, r] of Object.entries(o.routes)) {
    routeCount++;
    assert.ok(TL.organizationInterviewSpec(id, route)?.questionPool);
    const S = fixture(id, route);
    assert.ok(TL.canJoinOrganization(S, id, route), id + '/' + route);
    assert.ok(TL.joinOrganization(S, id, route));
    assert.equal(S.orgHistory.length, 1);
    assert.equal(TL.joinOrganization(S, id, route), false, 'duplicate join');
    assert.ok(TL.isWorking(S), 'joined route has employment');
    // Legacy Rhodes/Reunion entry points have their own event/decision tests below.
    if (['rhodes','reunion'].includes(id)) continue;
    let witnessed = false;
    for (let trial = 0; trial < 1400 && !witnessed; trial++) {
      const T = fixture(id, route, 730000 + trial);
      TL.scheduleEvents(T);
      const event = T.queue.find(e => e.id === 'organization_offer');
      if (!event) continue;
      TL.fire(T, event);
      if (T.orgApplication?.organization !== id || T.orgApplication.route !== route) continue;
      assert.equal(T.pending?.id, 'organization_offer');
      const chance = TL.chance;
      TL.chance = () => true; // deterministic acceptance; scheduling remains seeded.
      try {TL.choose(T, 0);} finally {TL.chance = chance;}
      assert.equal(completeInterview(TL,T).status,'passed');
      assert.equal(T.affiliation, id);
      assert.equal(T.orgRoute, route);
      witnessed = true;
    }
    assert.ok(witnessed, 'schedule -> fire -> choice -> join: ' + id + '/' + route);
    scheduledRoutes++;
  }
}

{
  const S = join('rhodes');
  const before = { job: S.job, income: S.income, rank: S.opRank, affiliation: S.affiliation };
  const chance = TL.chance; TL.chance = () => true;
  try {
    for (const id of ['job_lost', 'wage_theft']) {
      TL.fire(S, { type: 'ev', id });
      assert.equal(S.job, before.job, `${id} cannot silently remove a protected operator`);
      assert.equal(S.affiliation, before.affiliation);
      assert.equal(S.opRank, before.rank);
      assert.equal(S.income, before.income);
    }
  } finally { TL.chance = chance; }
  assert.equal(S.evCount.job_lost || 0, 0, 'blocked layoff is not counted as an event');
  assert.equal(S.evCount.wage_theft || 0, 0, 'blocked payroll event is not counted');
  TL.infect(S,true); S.ori.known=true;
  const chanceForAccommodation=TL.chance; TL.chance=()=>true;
  try { TL.fire(S,{type:'ev',id:'ori_work_ban'}); } finally { TL.chance=chanceForAccommodation; }
  assert.equal(S.job,before.job,'medical accommodation preserves the stable role');
  assert.ok(S.log.some(entry=>entry.text.includes('医疗安置')),
    'stable employer responds to infection with accommodation');
  TL.openDecision(S,'ori_job_loss');
  assert.equal(S.pending,null,'protected employment does not offer the dismissal decision');

  // The same generic layoff remains available for a precarious contract.
  const T = join('sarkaz_mercs', 'contract');
  TL.chance = () => true;
  try { TL.fire(T, { type: 'ev', id: 'job_lost' }); } finally { TL.chance = chance; }
  assert.equal(T.affiliation, null, 'contract model retains ordinary layoff risk');
  assert.equal(T.job, 'seeking');
}
{
  const S = join('rhodes');
  S.age = 64; S.year = 1100; S.bornYear = S.year - S.age;
  S.orgService = 6; S.orgLastServiceYear = S.year; S.orgRank = 3; S.opRank = 3;
  S.orgLastPromotionYear = S.year;
  TL.computeIncome(S);
  const finalMonthlyPay = S.income;
  const chance = TL.chance; TL.chance = () => false;
  try { TL.endYear(S); } finally { TL.chance = chance; }
  assert.equal(S.age, 65);
  assert.equal(S.job, 'retired');
  assert.equal(S.affiliation, null);
  assert.equal(S.opClass, 'guard', 'retirement preserves earned operator class');
  assert.equal(S.opRank, 3, 'retirement preserves earned operator rank');
  assert.equal(S.retirementPension.organization, 'rhodes');
  assert.equal(S.retirementPension.serviceYears, 6);
  const expectedPension = Math.max(finalMonthlyPay * 0.65, TL.NATION_BY_ID[S.nation].ppp * 0.50);
  assert.ok(Math.abs(S.income - expectedPension) < 1e-9,
    'retirement income is one monthly benefit, without duplicate modifiers');
  const pension = S.income;
  TL.computeIncome(S);
  assert.equal(S.income, pension, 'recomputing income does not overwrite or add to pension');
  assert.equal(S.stats.years.at(-1).income, Math.round(finalMonthlyPay),
    'annual snapshot records income used for that year’s cash settlement');
}
{
  const S = join('rhodes');
  S.orgService = 5; S.orgLastServiceYear = S.year; S.orgRank = 1; S.opRank = 1;
  const oldRank = S.orgRank, oldPay = S.income;
  const chance = TL.chance; TL.chance = () => true;
  try { TL.fire(S, { type: 'ev', id: 'job_promote' }); } finally { TL.chance = chance; }
  assert.equal(S.orgRank, oldRank, 'random performance event does not promote outside annual review');
  assert.equal(S.opRank, oldRank);
  assert.equal(S.income, oldPay);
  assert.ok(S.log.at(-1).text.includes('年度评审'));
}
assert.equal(TL.organizationDef('penguin_logistics').fromYear, 1093);
assert.ok(TL.organizationDef('penguin_logistics').nations.includes('LMN'));
assert.ok(TL.organizationDef('penguin_logistics').nations.includes('CLB'));
assert.equal(TL.organizationEmploymentModel('karlan_trade').retirement.replacementRate, 0.60);

for (const mutate of [S=>S.nation='YAN', S=>S.year=1084, S=>S.age=15,
  S=>S.school='university', S=>S.flags.retired=true, S=>S.serveLeft=1,
  S=>S.job='prison', S=>S.eduLevel=0, S=>S.orgCooldowns.rhine_life=S.year+1]) {
  const S = fixture(); mutate(S);
  assert.equal(TL.joinOrganization(S, 'rhine_life', 'research'), false);
}
{
  const S = fixture('laterano_gunknights'); S.race='liberi';
  assert.equal(TL.canJoinOrganization(S, 'laterano_gunknights','gunknight'), false);
  const T = fixture('sarkaz_mercs'); T.race='liberi'; T.nation='CLB';
  assert.equal(TL.canJoinOrganization(T, 'sarkaz_mercs','contract'), false);
}
{
  const S = join();
  S.year++; S.age++; TL.organizationYear(S); TL.organizationYear(S);
  assert.equal(S.orgService, 1, 'year counted once');
  S.orgService = 99;
  assert.ok(TL.promoteOrganization(S));
  assert.equal(S.orgRank, 1);
  assert.equal(TL.promoteOrganization(S), false, 'one promotion per year');
  const pay = S.income; TL.computeIncome(S);
  assert.equal(S.income, pay, 'pay multiplier does not compound');
  TL.leaveOrganization(S, 'test');
  assert.equal(S.job, 'seeking'); assert.ok(S.income < pay);
  assert.ok(S.orgHistory[0].leftYear);
  TL.syncOrganization(S); assert.equal(S.affiliation, null);
  TL.die(S, 'old', 'test');
  assert.equal(S.report.orgHistory.length, 1);
  assert.equal(S.report.orgHistory[0].reason, 'test');
  S.orgHistory[0].reason = 'changed';
  assert.equal(S.report.orgHistory[0].reason, 'test', 'report is a snapshot');
}
{
  const S=join('blacksteel','biosecurity');
  S.artsProfile={primary:'gravity',secondary:null,affinity:0.7,
    training:{gravity:20},control:55,fatigue:0,uses:0};
  const training=S.artsProfile.training.gravity;
  const control=S.artsProfile.control;
  const chance=TL.chance; TL.chance=()=>false;
  try {
    S.year++; S.age++; TL.organizationYear(S);
    TL.organizationYear(S);
  } finally { TL.chance=chance; }
  assert.equal(S.orgService,1,'blacksteel biosecurity service counts once per year');
  assert.ok(S.flags.protectionPractice>0,'biosecurity route trains contamination procedures');
  assert.ok(S.flags.protectiveGear>0,'biosecurity route supplies protective equipment');
  assert.ok(S.artsProfile.training.gravity>training,'field response improves the character’s own arts direction');
  assert.ok(S.artsProfile.control>control,'field response improves casting control');
}
for (const mutate of [S=>S.job='seeking', S=>S.flags.retired=true, S=>S.age=65, S=>S.school='university', S=>S.serveLeft=1]) {
  const S = join(); mutate(S); TL.syncOrganization(S); assert.equal(S.affiliation, null);
}
// Historical fork: no new old-family contracts; incumbents can remain, transfer, or leave.
for (const action of ['继续留任','转入','退出']) {
  const S = fixture('sir_family', 'executor'); S.year=1098; S.flags.sirFamilyIntroducedYear=1098;
  assert.ok(TL.joinOrganization(S, 'sir_family','executor'));
  S.year=1099; S.age++; TL.scheduleEvents(S);
  const e = S.queue.find(e=>e.id==='organization_transition'); assert.ok(e);
  TL.fire(S,e); chooseLabel(S,action);
  if(action==='转入') assert.equal(completeInterview(TL,S).status,'passed');
  if (action==='转入') {
    assert.equal(S.affiliation,'sir_newcourt'); assert.equal(S.city,'新沃尔西尼');
    assert.equal(S.orgHistory.length,2); assert.equal(S.orgHistory[0].leftYear,1099);
  } else assert.equal(S.affiliation, action==='退出' ? null : 'sir_family');
}
{
  const S = fixture('sir_family'); S.year=1099; S.flags.sirFamilyIntroducedYear=1098;
  S.city = '旧城区';
  assert.equal(TL.canJoinOrganization(S,'sir_family','outsider'), true);
  S.city = '新沃尔西尼';
  assert.equal(TL.canJoinOrganization(S,'sir_family','outsider'), false);
  const T = join('babel'); T.year=1094; TL.scheduleEvents(T);
  assert.equal(TL.promoteOrganization(T), false);
  assert.equal(TL.pickOrganizationEvent(T), null);
  TL.fire(T,T.queue.find(e=>e.id==='organization_transition'));
  assert.ok(T.pending.options.every(o=>o.label!=='继续留任'));
  chooseLabel(T,'退出'); assert.equal(T.affiliation,null);
}
for (const [id, person, lastYear] of [['rhine_life','saria',1094],['rhine_life','kristen',1098],['lungmen_guard','chen',1096]]) {
  const S = join(id); S.orgRank=2; S.year=lastYear;
  const c = TL.organizationDef(id).contacts.find(c=>c.id===person);
  assert.ok(TL.organizationContactEligible(S,id,c));
  S.year++; assert.equal(TL.organizationContactEligible(S,id,c),false);
}
{
  const S = join('lungmen_guard'); S.orgRank=2; S.year=1094;
  for (let i=0;i<3;i++) {
    assert.ok(TL.organizationContact(S,'lungmen_guard','hoshi'));
    assert.equal(TL.organizationContact(S,'lungmen_guard','hoshi'),null);
    S.year+=4;
  }
  assert.equal(TL.organizationContact(S,'lungmen_guard','hoshi'),null);
}
// Interface contract: deterministic settlement, stale results, revalidation, retry cooldown.
// Test the base lifecycle protocol independently of the installed question adapter.
TL.setOrganizationInterviewAdapter(null);
{
  const S=fixture(); const a=TL.beginOrganizationInterview(S,'rhine_life','research');
  assert.equal(TL.beginOrganizationInterview(S,'rhine_life','research').status,'busy');
  assert.ok(TL.completeOrganizationInterview(S,{token:a.token,status:'passed'}));
  assert.equal(TL.completeOrganizationInterview(S,{token:a.token,status:'passed'}),false);
  assert.equal(S.orgHistory.length,1);
}
for (const mutate of [S=>S.year++, S=>S.school='university', S=>S.flags.retired=true,
  S=>S.nation='YAN', S=>TL.joinOrganization(S,'melander','investigation')]) {
  const S=fixture(); const a=TL.beginOrganizationInterview(S,'rhine_life','research');
  mutate(S); assert.equal(TL.completeOrganizationInterview(S,{token:a.token,status:'passed'}),false);
  assert.notEqual(S.affiliation,'rhine_life');
}
for (const [status,years] of [['rejected',3],['withdrawn',3],['waitlisted',1]]) {
  const S=fixture(); const a=TL.beginOrganizationInterview(S,'rhine_life','research');
  TL.completeOrganizationInterview(S,{token:a.token,status});
  assert.equal(S.orgCooldowns.rhine_life,S.year+years);
}
{
  const S=fixture(); let captured;
  TL.setOrganizationInterviewAdapter((_,a)=>{captured=a; return {status:'interview',token:a.token};});
  assert.equal(TL.tryJoinOrganization(S,'rhine_life','research').status,'interview');
  assert.equal(S.affiliation,null); assert.ok(captured.spec.axes.length);
  TL.setOrganizationInterviewAdapter(null);
  TL.defDecision('test_question_1',{options:[{label:'继续'}]});
  TL.defDecision('test_question_2',{options:[{label:'完成'}]});
  TL.afterDecision=(state,p)=>{if(p.id==='test_question_1') TL.openDecision(state,'test_question_2');};
  TL.openDecision(S,'test_question_1'); TL.choose(S,0);
  assert.equal(S.pending.id,'test_question_2'); assert.equal(S.paused,true);
  delete TL.afterDecision;
}
{
  const S=fixture('rhodes'); S.job='guard'; S.opClass=null;
  const chance=TL.chance; TL.chance=()=>true;
  try {assert.ok(TL.tryJoinRhodes(S));} finally {TL.chance=chance;}
  TL.infect(S,true);
  assert.equal(TL.joinOrganization(S,'reunion','infected'),false);
  TL.leaveOrganization(S,'test'); TL.syncOrganization(S);
  assert.equal(S.affiliation,null); assert.equal(S.opClass,null);
  S.job='guard'; S.flags.lastJob='guard';
  TL.chance=()=>true;
  try {assert.equal(TL.tryJoinRhodes(S),false,'reapplication cooldown');} finally {TL.chance=chance;}
  assert.equal(S.job,'guard'); assert.equal(S.flags.lastJob,'guard','failed application leaves no false career record');
  const T=join('reunion'); TL.leaveOrganization(T,'test'); TL.syncOrganization(T);
  assert.equal(T.affiliation,null); assert.equal(T.flags.reunion,false);
}
assert.equal(errors.length,0,errors.join('\n'));
console.log(`Organization checks passed: ${Object.keys(TL.ORGANIZATIONS).length} organizations, ${routeCount} routes, ${scheduledRoutes} scheduled recruitment routes; lifecycle/history/contact/interview boundaries passed.`);
