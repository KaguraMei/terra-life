import assert from 'node:assert/strict';
import test from 'node:test';
import { createRandom, createEventEngine } from '../dist-runtime/simulation.mjs';

test('RNG restores a saved position and instances do not share state', () => {
  const a = createRandom(7), b = createRandom(7);
  assert.deepEqual(Array.from({length:100},()=>a.next()), Array.from({length:100},()=>b.next()));
  const checkpoint = a.snapshot();
  const tail = Array.from({length:200},()=>a.next());
  a.restore(checkpoint);
  assert.deepEqual(Array.from({length:200},()=>a.next()),tail);
  b.reseed(123);
  assert.notDeepEqual(a.snapshot(),b.snapshot());
  const before = a.snapshot();
  assert.throws(()=>a.restore({...before,state:-1}),/Invalid/);
  assert.deepEqual(a.snapshot(),before,'invalid restore must not mutate random state');
  const native = createRandom(null,()=>0.125);
  assert.equal(native.next(),0.125);
  assert.equal(native.snapshot(),null,'native entropy cannot be advertised as resumable');
});

function setup(overrides = {}) {
  const state={age:20,phase:'life',t:0,speed:1,yearSec:1,paused:false,pending:null,
    focus:'work',fT:{},queue:[],actEvent:null,flags:{},evCount:{},recent:[]};
  const seen=[],failures=[];
  let years=0;
  const definitions={
    first:{run(){seen.push('first');return 'first';}},
    second:{run(){seen.push('second');}},
    death:{run(s){s.phase='report';}},
    error:{run(){throw Error('broken content');}}
  };
  const engine=createEventEngine({
    random:()=>0.5,definition:id=>definitions[id],blocked:()=>false,available:(_s,d)=>!!d,
    netWorth:()=>0,book(){},log(){},milestone(){},
    decision(s,id){s.pending={id};s.paused=true;},catastrophe(){},sync(){},
    endYear(){years++;},error:f=>failures.push(f),...overrides
  });
  return {state,engine,seen,failures,get years(){return years;}};
}

test('tied events stay ordered; pending choice stops time and focus accrual', () => {
  const x=setup();
  x.engine.queue(x.state,0.2,'ev','first');
  x.engine.queue(x.state,0.2,'ev','second');
  x.engine.queue(x.state,0.4,'dec','choice');
  x.engine.queue(x.state,0.8,'ev','death');
  x.engine.tick(x.state,1);
  assert.deepEqual(x.seen,['first','second']);
  assert.equal(x.state.t,0.4);
  assert.equal(x.state.fT.work,0.4);
  assert.equal(x.state.queue.length,1);
  assert.equal(x.years,0);
  x.state.pending=null;x.state.paused=false;
  x.engine.tick(x.state,1);
  assert.equal(x.state.phase,'report');
  assert.equal(x.state.t,0.8);
  assert.equal(x.years,0,'death prevents year settlement');
});

test('dispatch enforces limits, cooldown and policy even for directly queued events', () => {
  const x=setup();
  const event={at:0,type:'ev',id:'first'};
  assert.equal(x.engine.fire(x.state,event),'executed');
  assert.equal(x.engine.fire(x.state,event),'skipped');
  x.state.age+=4;
  assert.equal(x.engine.fire(x.state,event),'executed');
  x.state.age+=4;
  assert.equal(x.engine.fire(x.state,event),'skipped');
  const blocked=setup({blocked:()=>true});
  assert.equal(blocked.engine.fire(blocked.state,event),'skipped');
  assert.deepEqual(blocked.seen,[]);
});

test('bounded advance restores speed, pauses and reports incomplete search', () => {
  const x=setup({endYear(s){s.age++;s.t=0;}});
  x.state.speed=8;
  assert.equal(x.engine.advance(x.state,2),'searching');
  assert.equal(x.state.age,22);
  assert.equal(x.state.speed,8);
  assert.equal(x.state.paused,true);
  assert.throws(()=>x.engine.queue(x.state,NaN,'ev','first'),/finite/);
  assert.throws(()=>x.engine.advance(x.state,0),/positive/);
});

test('legacy dispatch reports structured failures without counting a completed event', () => {
  const x=setup();
  assert.equal(x.engine.fire(x.state,{at:0,type:'ev',id:'error'}),'failed');
  assert.equal(x.failures.length,1);
  assert.equal(x.failures[0].eventId,'error');
  assert.equal(x.failures[0].age,20);
  assert.equal(x.state.evCount.error,undefined);
});
