import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { createSimulation } from '../dist-runtime/simulation.mjs';
import { simulation } from '../tools/sim-context.mjs';
import { runtimeFiles } from '../tools/runtime-files.mjs';

const baseline=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-89055db.json',import.meta.url),'utf8'));
// Lives whose behaviour changed on purpose: the archived end hash is replaced by a
// frozen one and the reason is written down, so the remaining cases stay exact.
const changes=JSON.parse(fs.readFileSync(new URL('./fixtures/legacy-89055db-changes.json',import.meta.url),'utf8')).changes;
const changedBySeed=new Map(changes.map(entry=>[entry.seed,entry]));
/** The end-state hash this build must produce for an archived case. */
const expectedEnd=(row)=>changedBySeed.get(row.config.seed)?.endHash ?? row.checks[1].hash;
const hash=state=>crypto.createHash('sha256').update(JSON.stringify(state)).digest('hex');
function step(runtime,state) {
  if(!state.focus)state.focus=runtime.autoFocus(state);
  runtime.tick(state,state.yearSec/8);
  if(state.pending)runtime.autoChoose(state);
}
function finish(runtime,state) {
  let guard=0;
  while(state.phase==='life'&&guard++<30000)step(runtime,state);
  assert.equal(state.phase,'report');
}

test('42 pre-refactor complete lives preserve state, event logs and subsequent RNG sequence', () => {
  for(const row of baseline.cases) {
    const runtime=createSimulation();
    const state=runtime.newLife(row.config);
    const documented=changedBySeed.get(row.config.seed);
    assert.equal(hash(state),row.checks[0].hash,`birth ${row.config.seed}`);
    finish(runtime,state);
    assert.equal(hash(state),documented?documented.endHash:row.checks[1].hash,
      documented?`end ${row.config.seed} (documented change: ${documented.reason})`:`end ${row.config.seed}`);
    assert.deepEqual(Array.from({length:8},()=>runtime.rnd()),row.randomTail);
  }
});

test('two simulations in the same JS realm can advance interleaved without interference', () => {
  const rows=[baseline.cases[7],baseline.cases[23]];
  const engines=rows.map(()=>createSimulation());
  const states=engines.map((runtime,i)=>runtime.newLife(rows[i].config));
  let guard=0;
  while(states.some(s=>s.phase==='life')&&guard++<30000) {
    for(let i=0;i<2;i++)if(states[i].phase==='life')step(engines[i],states[i]);
  }
  states.forEach((s,i)=>assert.equal(hash(s),expectedEnd(rows[i])));
  assert.notEqual(engines[0].EVMAP,engines[1].EVMAP);
  assert.notEqual(engines[0].INTERVIEW_QUESTIONS,engines[1].INTERVIEW_QUESTIONS);
  engines[0].EVMAP.probe={title:'only one instance'};
  assert.equal(engines[1].EVMAP.probe,undefined);
});

test('classic offline bundle and native ESM use equivalent assembly', () => {
  const {TL}=simulation();
  const row=baseline.cases[15];
  const state=TL.newLife(row.config);
  finish(TL,state);
  assert.equal(hash(state),expectedEnd(row));
  assert.equal(runtimeFiles.length,19);
  assert.equal(new Set(runtimeFiles).size,runtimeFiles.length);
  const kernelFiles=['random.ts','events.ts'];
  for(const file of kernelFiles) {
    const source=fs.readFileSync(new URL('../src/kernel/'+file,import.meta.url),'utf8');
    assert.doesNotMatch(source,/\b(?:window|document|localStorage)\b/);
  }
});
