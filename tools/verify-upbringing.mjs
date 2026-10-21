import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import {simulation, read, root} from './sim-context.mjs';

const errors = [];
const {TL:T, context} = simulation({log(){},warn(){},error(...xs){errors.push(xs.join(' '));}});
const make = (nation, extra = {}) => T.newLife({seed:21001, nation, bornYear:1080, ...extra});
const age = (s, a) => { s.age = a; s.year = s.bornYear + a; T.syncResidence(s); };
const backgrounds = { AEG: 0, RMB: 0 };
for (const nation of ['AEG','RMB']) {
  for (let seed = 10000; seed < 11000; seed++) {
    const s = make(nation, {seed});
    if (s.upbringing.background) backgrounds[nation]++;
    if (nation === 'AEG') {
      assert.equal(s.q,4); assert.equal(s.stratum,'marine'); assert.equal(s.urban,true);
      assert.ok(s.lt.e0 > 70); assert.equal(T.drawStratum('AEG',1,T.rnd),'marine');
      for (const id of ['cat_city','cat_migrate','child_work','school_fee','wage_theft'])
        assert.equal(T.contentAvailable(s,T.EVMAP[id]),false,id);
      if (s.upbringing.background) {
        assert.equal(s.fam.mom.alive,true); assert.equal(s.fam.dad.alive,true);
        assert.equal(s.fam.care.mode,'nursery');
        assert.equal(s.fam.care.peers[0].bloodRelative,false);
        assert.ok(!s.fam.sibs.includes(s.fam.care.peers[0]));
      }
    }
  }
}
assert.ok(backgrounds.AEG > 150 && backgrounds.AEG < 350, 'nursery neither forced nor unreachable');
assert.ok(backgrounds.RMB > 300 && backgrounds.RMB < 500);
const landAegir = make('IBE',{race:'aegir'});
assert.equal(landAegir.materialProvision,undefined);

// 每条内容通过真实打开/选择入口执行；资格不符时不弹题。
const controlled = [];
for (const g of T.GROWTH) {
  const suitable = Object.values(T.PLACES).find(p => p.nation === g.nation &&
    (!g.tags || g.tags.every(x => p.tags.includes(x))) &&
    (!g.placeIds || g.placeIds.includes(p.id)) && (!g.regimes || g.regimes.includes(p.regime)) &&
    (!g.urban || p.kind !== 'rural'));
  assert.ok(suitable,g.id + ' has a location');
  const s = make(g.nation,{placeId:suitable.id,race:g.races?.[0] || 'liberi',bornYear:1090});
  age(s,Math.max(g.ages[0],g.id === 'LAT-02' ? 16 : 0));
  s.school = 'middle'; s.eduLevel = 1;
  if (g.requiresFlag) s.upbringing[g.requiresFlag] = true;
  if (g.requiresBackground) s.upbringing.background = g.requiresBackground;
  if (g.familyJobs) s.fam.mom.job = g.familyJobs[0];
  if (g.needsTension) s.flags.localTensionUntil = s.year + 1;
  const id = 'growth_' + g.id;
  assert.ok(T.growthEligible(s,g),g.id + ' eligible');
  T.openDecision(s,id);
  assert.equal(s.pending?.id,id);
  T.choose(s,0);
  assert.ok(s.upbringing.history.some(h => h.id === g.id && h.accepted));
  controlled.push(g.id);
  if (g.id === 'LAT-02') assert.equal(s.equipment.guardianGun.received,true);
  if (g.id === 'LAT-03') {
    assert.equal(s.equipment.guardianGun,null);
    assert.equal(s.equipment.launcher.type,'grenadeLauncher');
    assert.equal(s.equipment.launcher.owned,false);
    assert.equal(s.traits.empathy,undefined);
  }
  s.pending = null; s.nation = g.nation === 'YAN' ? 'LAT' : 'YAN'; T.syncResidence(s);
  T.openDecision(s,id); assert.equal(s.pending,null,g.id + ' blocked after migration');
}
assert.equal(controlled.length,33); // 16 decisions + 2 birth backgrounds = 18 pilots, plus 17 regions.
for (const race of ['sankta','liberi']) {
  const s = make('LAT',{race,placeId:'lat_city'}); age(s,16); s.school='high'; s.eduLevel=2;
  T.openDecision(s,'growth_LAT-01'); assert.ok(s.pending); T.choose(s,0);
  T.openDecision(s,'growth_LAT-02');
  assert.equal(!!s.pending,race === 'sankta');
  if (s.pending) T.choose(s,0);
  assert.equal(!!s.equipment.guardianGun,race === 'sankta');
}
const migrant = make('CLB',{race:'sankta'}); age(migrant,16); migrant.school='high';
T.moveResidence(migrant,'LAT','lat_city');
assert.equal(T.guardianGunEligible(migrant),false,'moving alone does not award citizenship');

// 迁居、同一地点原型中的再次迁居、放弃在校资格，都要使已打开的旧题失效。
for (const change of ['country','same-prototype','school']) {
  const s = make('LAT',{race:'liberi',placeId:'lat_city'}); age(s,14); s.school='middle';
  T.openDecision(s,'growth_LAT-01'); assert.ok(s.pending);
  if (change === 'school') s.school=null;
  else T.moveResidence(s,change === 'country' ? 'YAN' : 'LAT',change === 'country' ? 'YAN_city' : 'lat_city');
  T.choose(s,0);
  assert.equal(T.growthSkill(s,'shooting'),0,change);
  assert.equal(s.pending,null);
}
const stale = make('LAT',{race:'sankta',placeId:'lat_city'}); age(stale,16); stale.school='high';
const queued = T.scheduledGrowthDecisions(stale)[0]; assert.equal(queued.id,'growth_LAT-02');
T.moveResidence(stale,'LAT','lat_village'); T.fire(stale,{...queued,type:'dec'});
assert.equal(stale.pending,null,'queued local event cannot follow player elsewhere');

// 年代改名不改写出生地，也不创建新的地点身份。
const oldCity = make('BLV',{placeId:'blv_dossoles',bornYear:1080});
assert.equal(oldCity.city,'索雷城'); age(oldCity,6); assert.equal(oldCity.city,'多索雷斯');
assert.equal(oldCity.birthPlace.name,'索雷城');
const siesta = make('SST',{bornYear:1090}); age(siesta,8); assert.equal(siesta.city,'新汐斯塔');
assert.equal(siesta.birthPlace.name,'汐斯塔市');
const legacy = make('AEG'); delete legacy.upbringing; delete legacy.localStatus; delete legacy.equipment;
delete legacy.birthPlace; delete legacy.residence;
T.ensureUpbringing(legacy); T.syncResidence(legacy);
assert.equal(legacy.upbringing.background,null); assert.equal(legacy.equipment,undefined);

// 防护依赖装备；学习不能替代学历或授予岗位。军事训练两族同一评分公式。
const protectedS = make('RMB'); protectedS.upbringing.skills.protection=7;
assert.equal(T.protectionScore(protectedS),0); protectedS.flags.protectiveGear=.1;
assert.ok(T.protectionScore(protectedS)>.1);
assert.ok(T.growthJobWeight(protectedS,'engineer')===1);
protectedS.upbringing.skills.engineering=6;
assert.ok(T.growthJobWeight(protectedS,'engineer')>1);
const fault = make('AEG'); age(fault,12);
const health=fault.st.hl; T.EVMAP.aeg_equipment_fault.run(fault); const untrainedLoss=health-fault.st.hl;
fault.upbringing.skills.emergency=7; const health2=fault.st.hl; T.EVMAP.aeg_equipment_fault.run(fault);
assert.ok(health2-fault.st.hl<untrainedLoss);

for (const regime of ['singas','coalition','true','dossoles']) {
  const s=make('BLV',{placeId:'blv_'+regime,sex:'F'}); age(s,20);
  for (const id of ['conscription','war_draft']) assert.equal(T.contentAvailable(s,T.DECISIONS[id] || T.EVMAP[id]),regime==='singas');
  if (regime==='singas') {
    T.openDecision(s,'conscription'); T.choose(s,0);
    assert.ok(s.serveLeft>=3); assert.equal(T.contentAvailable(s,T.EVMAP.war_end),false);
  }
}

// 同种子确定性；序列化保留关系与装备事实。
const fixture=JSON.stringify(make('AEG',{seed:9901}));
assert.equal(JSON.stringify(make('AEG',{seed:9901})),fixture);
const saved=JSON.parse(fixture); T.ensureUpbringing(saved); T.syncResidence(saved);
assert.equal(JSON.stringify(saved),fixture);

// 真正跑完各国人生；不强制刷经历、不关闭死亡，也不把条件样本当自然发生率。
const stats={};
for (const n of T.NATIONS) {
  const row=stats[n.id]={lives:0,backgrounds:0,offered:0,accepted:0,survived18:0};
  const count=['AEG','LAT','RMB','BLV'].includes(n.id)?100:15;
  for(let i=0;i<count;i++) {
    const s=make(n.id,{seed:700000+T.NATIONS.indexOf(n)*1000+i});
    let guard=0;
    while(s.phase==='life' && guard++<20000) {
      if(!s.focus) s.focus=T.autoFocus(s);
      T.tick(s,s.yearSec/8);
      if(s.pending) T.autoChoose(s);
    }
    assert.equal(s.phase,'report',n.id+' life terminates');
    assert.ok(s.report.upbringing);
    assert.ok(Object.keys(s.upbringing.offers).filter(id=>id!=='LAT-02').length<=4);
    const years=Object.values(s.upbringing.offers).map(o=>o.year);
    assert.equal(new Set(years).size,years.length,'one local offer per year');
    if(s.race!=='sankta') assert.equal(s.equipment.guardianGun,null);
    row.lives++; row.backgrounds+=!!s.upbringing.background;
    row.offered+=Object.keys(s.upbringing.offers).length;
    row.accepted+=s.upbringing.history.filter(h=>h.accepted).length;
    row.survived18+=s.age>=18;
  }
}
assert.deepEqual(errors,[],'no swallowed event errors');

// 家庭面板真实渲染入口，无 RNG 副作用；确保非血缘关系不会显示成手足。
const els=new Map(); context.document={getElementById:id=>{if(!els.has(id))els.set(id,{});return els.get(id);}};
vm.runInContext(read('js/ui/render.js'),context);
let nursery;
for(let seed=10000;seed<11000;seed++){const s=make('AEG',{seed});if(s.fam.care.mode==='nursery'){nursery=s;break;}}
T.renderFamily(nursery);
assert.ok(els.get('famList').innerHTML.includes('养育者'));
assert.ok(els.get('famList').innerHTML.includes('同所伙伴'));
assert.ok(!els.get('famList').innerHTML.includes('undefined'));

const result={birthSamples:2000,backgrounds,controlled:controlled.length,naturalLives:Object.values(stats).reduce((a,b)=>a+b.lives,0),stats,errors};
if(process.argv.includes('--write-report')) fs.writeFileSync(root+'/docs/data/upbringing-verification-2026-10-21.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
console.log('PASS: geography, eras, custody, weapons, stale decisions, equipment-dependent protection, all 33 routes, deterministic state, full-life simulation and family UI.');
