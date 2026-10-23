import assert from 'node:assert/strict';
import {simulation} from './sim-context.mjs';

const errors = [];
const {TL:T} = simulation({log(){},warn(){},error(...args){errors.push(args.map(String).join(' '));}});
const samples = Number(process.argv[2] || 600);
assert.ok(Number.isInteger(samples) && samples > 0 && samples <= 10000);

const tally = {
  lives: 0, infected: 0, maxFusion: 0, over19: 0, ori15lowBlood: 0,
  stagesAtDeath: [0, 0, 0, 0], treated: 0, treatedLowBlood: 0,
  meanTreatedFusionGrowth: 0, lowBloodTreatedTrials: 0
};
const firstHighFusionMild = [];
for (let i = 0; i < samples; i++) {
  const S = T.newLife({seed: 960000 + i, pace:'normal'});
  let guard = 0;
  while (S.phase === 'life' && guard++ < 20000) {
    if (!S.focus) S.focus = T.autoFocus(S);
    T.tick(S, S.yearSec / 8);
    if (S.pending) T.autoChoose(S);
  }
  assert.equal(S.phase,'report','seeded life terminates: ' + (960000 + i));
  tally.lives++;
  if (S.ori && S.ori.stage > 0) {
    tally.infected++;
    tally.stagesAtDeath[S.ori.stage]++;
    if (S.ori.treated) tally.treated++;
    if (S.ori.treated && S.ori.bloodDensity < 0.30) tally.treatedLowBlood++;
    if (S.ori.crystal >= 15 && S.ori.bloodDensity < 0.30) {
      tally.ori15lowBlood++;
      if (firstHighFusionMild.length < 5) firstHighFusionMild.push({
        seed:960000+i, fusion:Number(S.ori.crystal.toFixed(2)),
        blood:Number(S.ori.bloodDensity.toFixed(3)), treated:S.ori.treated
      });
    }
    tally.maxFusion = Math.max(tally.maxFusion, S.ori.crystal);
    if (S.ori.crystal > 19) tally.over19++;
    for (const year of S.stats.years) {
      if (year.stage > 0) tally.maxFusion = Math.max(tally.maxFusion, year.ori);
      if (year.stage > 0 && year.ori > 19) tally.over19++;
    }
  }
}

// A controlled Rhodian suppression fixture checks the intended low-density
// rule directly, independent of how frequently a natural life joins Rhodes.
for (let i = 0; i < 40; i++) {
  const S = T.newLife({seed:970000+i,nation:'YAN'});
  T.infect(S,true,{bloodDensity:0.24});
  S.ori.crystal = 8;
  S.ori.bloodSetPoint = 0.24;
  S.ori.stage = T.oriStageOf(S.ori.bloodDensity);
  S.ori.treated = true; S.ori.provider = 'rhodes'; S.money = 100000;
  for (let year = 0; year < 30; year++) T.oriYear(S);
  tally.meanTreatedFusionGrowth += S.ori.crystal - 8;
  tally.lowBloodTreatedTrials++;
  assert.ok(S.ori.bloodDensity < 0.30,'long-term suppression retains low clinical stage');
  assert.ok(S.ori.crystal <= 19,'treated fusion remains capped');
}
tally.meanTreatedFusionGrowth /= tally.lowBloodTreatedTrials;

// The concrete dossier example must remain mild regardless of fusion.
const huangCase = T.newLife({seed:970100,nation:'YAN'});
T.infect(huangCase,true,{bloodDensity:0.24});
huangCase.ori.crystal=16;
huangCase.ori.stage=T.oriStageOf(huangCase.ori.bloodDensity);
assert.equal(huangCase.ori.stage,1,'16% fusion with 0.24u/L remains mild');

// Exercise all prototype/situation pairs through the data-driven tag matcher.
const scenes = Object.keys(T.ARTS_SCENES);
const typeIds = Object.keys(T.ARTS_TYPES);
for (const sceneId of scenes) {
  const scene=T.ARTS_SCENES[sceneId];
  assert.ok(scene.title && scene.prompt && scene.tags.length,sceneId+' scene metadata');
  assert.ok(typeIds.every(id=>Array.isArray(T.ARTS_TYPES[id].tags)),sceneId+' type tags');
}
const tested = T.newLife({seed:970101,nation:'YAN'});
tested.arts=65;
for (const type of typeIds) {
  tested.artsProfile={primary:type,secondary:null,affinity:0.7,training:{[type]:45},control:70};
  const compatible=scenes.filter(scene=>T.artsCandidates(tested,scene).some(x=>x.id===type));
  assert.ok(compatible.length>0,type+' must map to at least one rescue situation');
}

assert.equal(tally.over19,0,'no simulated annual state or terminal state exceeds 19%');
assert.equal(errors.length,0,errors.join('\n'));
console.log(JSON.stringify({
  lives:tally.lives, infected:tally.infected,
  maxFusion:Number(tally.maxFusion.toFixed(3)), over19:tally.over19,
  fusion15PlusAndBloodBelow030:tally.ori15lowBlood,
  clinicalStageAtDeath:tally.stagesAtDeath,
  treated:tally.treated, treatedBelow030:tally.treatedLowBlood,
  controlledLowBlood30YearMeanFusionGrowth:Number(tally.meanTreatedFusionGrowth.toFixed(4)),
  controlledTrials:tally.lowBloodTreatedTrials,
  sampleCases:firstHighFusionMild,
  artsTypes:typeIds.length, sceneTypes:scenes.length
},null,2));
