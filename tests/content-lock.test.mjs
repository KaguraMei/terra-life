import assert from 'node:assert/strict';
import test from 'node:test';
import {packLock, packLocks, packProjection, serializeLife, restoreLife, SaveEnvelopeError} from '../dist-runtime/simulation.mjs';
import {simulation} from '../tools/sim-context.mjs';

const pack = () => ({
  id: 'demo_pack', version: 3, schemaVersion: 1, sourceType: 'project-rule',
  questions: [
    {id: 'q_one', kind: 'organization', text: 'a', options: [
      {id: 'o_a', label: 'A', scores: {resolve: 2, method: 1}},
      {id: 'o_b', label: 'B', scores: {resolve: -1, method: 3}}
    ]},
    {id: 'q_two', kind: 'role', text: 'b', options: [
      {id: 'o_c', label: 'C', scores: {resolve: 1, method: 2}}
    ]}
  ],
  pools: [{id: 'pool_demo', axes: [{id: 'resolve', minimum: 0.4, weight: 0.5},
    {id: 'method', minimum: 0.3, weight: 0.5}], draw: {organization: 1, role: 1},
    questionIds: ['q_one', 'q_two'], passScore: 60, waitlistScore: 45}]
});

const harness = () => {
  const storage = new Map();
  const errors = [];
  const make = () => simulation(
    {log() {}, warn() {}, error(...args) { errors.push(args.map(String).join(' ')); }},
    {storage: () => ({getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key)})}).TL;
  return {TL: make(), make, storage, errors};
};

test('a pack lock is stable, order independent and sensitive to real changes', () => {
  const base = packLock(pack());
  assert.deepEqual(base, packLock(pack()), 'the same pack yields the same lock');
  assert.equal(base.id, 'demo_pack');
  assert.equal(base.version, '3');
  assert.match(base.hash, /^fnv1a-[0-9a-f]{8}-\d+$/);

  const reordered = pack();
  reordered.questions.reverse();
  reordered.pools[0].questionIds.reverse();
  reordered.questions.forEach(question => question.options.reverse());
  assert.equal(packLock(reordered).hash, base.hash, 'declaration order is not content');

  const rescored = pack();
  rescored.questions[0].options[0].scores.resolve = 9;
  assert.notEqual(packLock(rescored).hash, base.hash, 'a changed score is a content change');

  const reworded = pack();
  reworded.questions[0].text = 'totally different wording';
  assert.equal(packLock(reworded).hash, base.hash, 'display copy does not invalidate saves');

  const bumped = pack();
  bumped.version = 4;
  assert.notEqual(packLock(bumped).hash, base.hash, 'a version bump changes identity');

  assert.equal(packLock(null), null);
  assert.equal(packLock({version: 1}), null, 'a pack without an id has no identity');
  const alpha = {...pack(), id: 'alpha_pack'};
  const beta = {...pack(), id: 'beta_pack'};
  assert.deepEqual(packLocks({beta, alpha}).map(lock => lock.id), ['alpha_pack', 'beta_pack'],
    'locks are sorted by id');
  assert.ok(packProjection(pack()).includes('q_one'));
});

test('a save records the registered pack and resumes on the same content', () => {
  const {TL, storage} = harness();
  const locks = TL.interviewPackLocks();
  assert.equal(locks.length, 1);
  assert.equal(locks[0].id, 'core_interviews');

  const state = TL.newLife({seed: 910001, pace: 'short'});
  const saved = TL.saveProgress(state);
  assert.equal(saved.saved, true);
  assert.equal(saved.total, 1);
  const stored = JSON.parse(storage.get('terra-life:v1:resumable-life'));
  assert.equal(JSON.stringify(stored.contentLock.packages), JSON.stringify(locks),
    'the envelope carries the pack identity');

  const resumed = TL.loadProgress();
  assert.ok(resumed, 'the same build resumes it');
  assert.equal(resumed.age, state.age);
});

test('a save from another pack set is refused with a precise reason', () => {
  const {TL, storage, errors} = harness();
  TL.saveProgress(TL.newLife({seed: 910002, pace: 'short'}));
  const original = JSON.parse(storage.get('terra-life:v1:resumable-life'));
  const current = original.contentLock.packages[0];
  const put = packages => {
    storage.set('terra-life:v1:resumable-life',
      JSON.stringify({...original, contentLock: {...original.contentLock, packages}}));
    errors.length = 0;
    return {state: TL.loadProgress(), error: errors.join('\n')};
  };

  const missing = put([{id: 'ghost_pack', version: '1', hash: 'fnv1a-00000000-0'}]);
  assert.equal(missing.state, null, 'an unknown pack refuses the restore');
  assert.match(missing.error, /content\.package-missing/);

  const versionChanged = put([{...current, version: '0'}]);
  assert.equal(versionChanged.state, null);
  assert.match(versionChanged.error, /content\.package-version-changed/);

  const contentChanged = put([{...current, hash: 'fnv1a-deadbeef-1'}]);
  assert.equal(contentChanged.state, null, 'same version, different content is still a mismatch');
  assert.match(contentChanged.error, /content\.package-content-changed/);

  const nothingRecorded = put([]);
  assert.ok(nothingRecorded.state, 'a save that depends on no pack has nothing to compare');

  const duplicated = put([current, current]);
  assert.equal(duplicated.state, null);
  assert.match(duplicated.error, /envelope\.package-duplicate/);
});

test('an interview session names the pack its questions came from', () => {
  const harnessRuntime = harness();
  const TL = harnessRuntime.TL;
  const organization = TL.organizationDef('rhine_life');
  const routeId = Object.keys(organization.routes)[0];
  const route = organization.routes[routeId];
  const year = Math.max(organization.fromYear, route.fromYear || 0, 1094);
  const state = TL.newLife({seed: 700001, nation: organization.nations?.[0] || 'KDZ',
    race: 'sarkaz', bornYear: year - 30});
  Object.assign(state, {age: 30, year, school: null, eduLevel: 4, q: 4, arts: 95,
    serveLeft: 0, job: route.jobs?.[0] || 'op_guard', queue: [], t: 0, pending: null,
    affiliation: null, orgHistory: [], orgContacts: {}, orgCooldowns: {},
    flags: {}, st: {hl: 95, h: 70, sm: 95, so: 95}, evCount: {}, recent: []});

  const started = TL.beginOrganizationInterview(state, 'rhine_life', routeId);
  assert.equal(started.status, 'interview');
  const sessionPack = state.orgApplication.session.pack;
  assert.equal(sessionPack.id, 'core_interviews', 'the session records its pack');
  assert.equal(sessionPack.version, 1, 'and the pack version it was taken from');

  // The snapshot is self-contained: the questions are copied, not referenced.
  const questions = state.orgApplication.session.questions;
  assert.ok(questions.length >= 2);
  assert.notEqual(questions[0], TL.INTERVIEW_QUESTIONS[questions[0].id]);
  assert.equal(state.pending && state.pending.id, 'organization_interview');

  // Answer the first question through the real decision path (never by poking
  // the session), then save: the pending decision and the answers must survive.
  TL.choose(state, 0);
  assert.equal(state.orgApplication.session.answers.length, 1);
  assert.equal(TL.saveProgress(state).saved, true);

  const resumedTL = harnessRuntime.make();
  const resumed = resumedTL.loadProgress();
  assert.ok(resumed, 'a mid-interview save resumes');
  const resumedSession = resumed.orgApplication.session;
  assert.equal(resumedSession.pack.id, 'core_interviews', 'the resumed session still names its pack');
  assert.equal(resumedSession.pack.version, 1);
  assert.equal(JSON.stringify(resumedSession.questions.map(question => question.id)),
    JSON.stringify(questions.map(question => question.id)), 'the question snapshot survives the round trip');
  assert.equal(resumedSession.answers.length, 1, 'answers given before the save stay given');

  // Finishing both paths yields the same verdict: the pack identity is not cosmetic.
  const answerAll = (runtime, life) => {
    let guard = 0;
    while (life.pending && life.pending.id === 'organization_interview' && guard++ < 20) {
      runtime.choose(life, 0);
    }
    return life.orgInterviewResult;
  };
  const straight = answerAll(TL, state);
  const viaSave = answerAll(resumedTL, resumed);
  assert.ok(straight && viaSave);
  assert.equal(viaSave.status, straight.status);
  assert.equal(viaSave.score, straight.score);
  assert.equal(viaSave.pool, straight.pool);
});
