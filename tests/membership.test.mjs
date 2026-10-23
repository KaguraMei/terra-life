import assert from 'node:assert/strict';
import test from 'node:test';
import {
  coercedLabourGuard, createSimulation, dismissible, membershipSubject, retirementGuard, syncVerdict,
  COERCED_LABOUR_JOBS, RETIREMENT_AGE
} from '../dist-runtime/simulation.mjs';

const subject = (extra = {}) => ({
  phase: 'life',
  affiliation: 'rhine_life',
  route: 'research',
  job: 'researcher',
  orgJob: 'researcher',
  orgRank: 1,
  opRank: 0,
  age: 30,
  school: false,
  serveLeft: 0,
  retired: false,
  nation: 'YAN',
  city: '',
  year: 1090,
  ...extra
});

/** A world where nothing forces a departure unless the test says so. */
const ports = (extra = {}) => ({
  available: () => true,
  locationAllowed: null,
  routeJobs: ['researcher'],
  nations: null,
  isWorking: () => true,
  ...extra
});

const verdict = (extra = {}, world = {}) =>
  syncVerdict({}, subject(extra), true, true, ports(world));

test('a settled membership only records the current post', () => {
  assert.deepEqual(verdict(), {kind: 'update', orgJob: 'researcher', orgRank: null});
  assert.deepEqual(verdict({affiliation: 'rhodes', opRank: 3}),
    {kind: 'update', orgJob: 'researcher', orgRank: 3}, 'Rhodes mirrors the operator grade');
});

test('no membership or a finished life decides nothing', () => {
  assert.deepEqual(verdict({affiliation: null}), {kind: 'none'});
  assert.deepEqual(verdict({phase: 'report'}), {kind: 'none'});
});

test('the departure reasons follow the documented precedence', () => {
  // 1. the archive no longer resolves
  assert.deepEqual(syncVerdict({}, subject(), false, true, ports()),
    {kind: 'leave', reason: '档案失效', options: {keepJob: true}});
  assert.deepEqual(syncVerdict({}, subject(), true, false, ports()),
    {kind: 'leave', reason: '档案失效', options: {keepJob: true}});

  // 2. Reunion's old structure dissolved — ahead of the location ban
  const collapsed = syncVerdict({}, subject({affiliation: 'reunion'}), true, true, ports({
    available: () => false, locationAllowed: () => false
  }));
  assert.equal(collapsed.kind, 'leave');
  assert.match(collapsed.reason, /旧编制瓦解/);

  // 3. the city forbids the organization — ahead of retirement
  const banned = syncVerdict({}, subject(), true, true, ports({locationAllowed: () => false}));
  assert.equal(banned.reason, '新沃尔西尼禁止家族入驻及介入');

  // 4. retirement / called up / post ended — ahead of the trade change
  assert.deepEqual(verdict({retired: true, job: 'farmer'}), {
    kind: 'leave', reason: '退休', options: {keepJob: true, retirement: true, preserveOperatorRank: true}
  });
  assert.equal(verdict({age: 65, job: 'farmer'}).reason, '退休', 'age alone counts as retirement');
  assert.equal(verdict({serveLeft: 2, job: 'farmer'}).reason, '应征服役');
  assert.equal(verdict({job: 'seeking'}, {isWorking: () => false}).reason, '结束任职',
    'unemployed but not retired or called up');
  assert.equal(verdict({job: 'farmer'}).reason, '转行或应征服役',
    'a working life in another trade is a trade change, not an ended post');

  // 5. changed trade — ahead of the nation check
  const traded = syncVerdict({}, subject({job: 'miner'}), true, true, ports({nations: ['URS']}));
  assert.equal(traded.reason, '转行或应征服役');
  assert.deepEqual(traded.options, {keepJob: true});

  // 6. moved outside the organization's nations
  const moved = syncVerdict({}, subject(), true, true, ports({nations: ['URS']}));
  assert.equal(moved.reason, '迁往组织辖区以外');
  assert.deepEqual(moved.options, {keepJob: false}, 'the job is released when the post is out of reach');
});

test('a retirement departure carries the pension options, a dismissal does not', () => {
  const retired = verdict({retired: true});
  assert.equal(retired.options.retirement, true);
  assert.equal(retired.options.preserveOperatorRank, true);
  assert.equal(retired.options.keepJob, true);

  const ended = verdict({job: 'seeking'}, {isWorking: () => false});
  assert.equal(ended.reason, '结束任职');
  assert.equal(ended.options.retirement, false);
  assert.equal(ended.options.preserveOperatorRank, false);
  assert.equal(ended.options.keepJob, true);
});

test('the route job list decides whether a job change is a departure', () => {
  assert.equal(verdict({job: 'researcher'}).kind, 'update');
  assert.equal(verdict({job: 'senior_researcher'}, {routeJobs: ['researcher', 'senior_researcher']}).kind, 'update');
  assert.equal(verdict({job: 'senior_researcher'}, {routeJobs: null}).kind, 'leave',
    'a route without a job list accepts only the recorded post');
});

test('the Longmen exception applies only to that organization, in Longmen', () => {
  const onlyUrsus = {nations: ['URS']};
  assert.equal(verdict({nation: 'YAN', city: '龙门'}, onlyUrsus).reason, '迁往组织辖区以外');
  assert.equal(
    syncVerdict({}, subject({affiliation: 'lungmen_guard', nation: 'YAN', city: '龙门'}),
      true, true, ports(onlyUrsus)).kind, 'update'
  );
});

test('only an employed, non-retired life may be dismissed', () => {
  assert.equal(dismissible(subject(), true), true);
  assert.equal(dismissible(subject(), false), false, 'no work, no dismissal');
  assert.equal(dismissible(subject({retired: true}), true), false);
  assert.equal(dismissible(subject({job: 'retired'}), true), false);
  assert.equal(dismissible(subject({phase: 'report'}), true), false);
  assert.equal(dismissible(subject({job: 'student'}), false), false, 'a student is never made jobless');
});

test('coerced labour needs a live life, a labour job and a change of post', () => {
  assert.deepEqual(coercedLabourGuard(subject(), 'slave'), {ok: true});
  assert.deepEqual(coercedLabourGuard(subject(), 'prison'), {ok: true});
  assert.deepEqual(coercedLabourGuard(subject({phase: 'report'}), 'slave'), {ok: false, reason: 'ended'});
  assert.deepEqual(coercedLabourGuard(subject(), 'miner'), {ok: false, reason: 'invalid-job'});
  assert.deepEqual(coercedLabourGuard(subject({job: 'slave'}), 'slave'), {ok: false, reason: 'already-there'});
  assert.deepEqual(COERCED_LABOUR_JOBS, ['slave', 'prison']);
});

test('retirement needs sixty-five and a retirement that is not already done', () => {
  assert.deepEqual(retirementGuard(subject({age: 64}), false), {ok: false, reason: 'too-young'});
  assert.deepEqual(retirementGuard(subject({age: 65}), false), {ok: true});
  assert.deepEqual(retirementGuard(subject({age: 70, retired: true}), true), {ok: false, reason: 'already-retired'});
  assert.deepEqual(retirementGuard(subject({age: 70, retired: true}), false), {ok: true},
    'a retired flag with a working job still needs the exit');
  assert.deepEqual(retirementGuard(subject({phase: 'report', age: 70}), false), {ok: false, reason: 'ended'});
  assert.equal(RETIREMENT_AGE, 65);
});

test('the membership subject normalises a life once', () => {
  const view = membershipSubject({
    phase: 'life', affiliation: '', orgRoute: null, job: 'miner', orgJob: 'miner',
    orgRank: 2, opRank: 1, age: 41, school: 'high', serveLeft: 1, nation: 'URS',
    city: '乌萨斯城', year: 1095, flags: {retired: 1}
  });
  assert.equal(view.affiliation, null, 'an empty affiliation reads as none');
  assert.equal(view.route, null);
  assert.equal(view.school, true);
  assert.equal(view.serveLeft, 1);
  assert.equal(view.retired, true, 'a stored 1 is still true');
  assert.equal(membershipSubject({}).orgRank, 0);
});

test('the runtime leaves a membership for the documented reason', () => {
  const TL = createSimulation();
  const S = TL.newLife({seed: 616001, nation: 'YAN', bornYear: 1025});
  Object.assign(S, {age: 30, year: 1100, eduLevel: 3, arts: 60});
  assert.ok(TL.joinOrganization(S, 'rhodes', 'operator'), 'joined');

  // A settled membership records the post and stays.
  TL.syncOrganization(S);
  assert.equal(S.affiliation, 'rhodes');

  // Retirement ends it with the pension options.
  S.orgService = 8;
  S.age = 66;
  assert.ok(TL.retire(S));
  assert.equal(S.affiliation, null);
  assert.ok(S.retirementPension, 'the pension came from the retirement departure');
});
