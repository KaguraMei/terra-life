import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {createSimulation, deriveLifeView, validateRegistries} from '../dist-runtime/simulation.mjs';
import {runPopulation} from '../tools/model-regression.mjs';

const baseline = JSON.parse(fs.readFileSync(
  new URL('../docs/data/model-baseline.json', import.meta.url), 'utf8'));

const infectedWorker = (TL, seed) => {
  const state = TL.newLife({seed, nation: 'URS', race: 'ursus', bornYear: 1060});
  Object.assign(state, {
    age: 30, year: 1090, job: 'miner', eduLevel: 2, flags: {}, orgHistory: [],
    ori: {at: 18, crystal: 24, stage: 2, treated: false, known: true, provider: null}
  });
  return state;
};

test('a complete-life run reports broad behaviour distributions through the derived view', () => {
  const report = runPopulation({samples: 250, seed: 292000});
  assert.equal(report.reproducibility.completeLives, 250);
  assert.deepEqual(report.runtimeErrors, []);
  assert.ok(report.longevity.mean > 15 && report.longevity.mean < 150);
  assert.ok(report.longevity.p10 < report.longevity.p90);
  assert.ok(Object.keys(report.population.nations).length > 3);
  assert.ok(Object.keys(report.causes).length > 2);
  assert.ok(report.oripathy.incidence > 0 && report.oripathy.incidence < 1);
  assert.ok(report.oripathy.finalCrystalRate.count > 0);
  assert.ok(report.salary.count > report.reproducibility.samples);
  assert.ok(report.salary.p90 > report.salary.p10);
  assert.ok(report.salary.p50 > 0);
  assert.equal(report.careers.organizationMemberships,
    Object.values(report.careers.membershipsByOrganization).reduce((sum, value) => sum + value, 0));
  assert.ok(report.careers.completedMemberships <= report.careers.organizationMemberships);
});

test('the same seed range produces the same complete-life report', () => {
  assert.deepEqual(runPopulation({samples: 16, seed: 733100}), runPopulation({samples: 16, seed: 733100}));
});

test('fixed-seed distributions stay inside the archived guard-rail bands', () => {
  assert.equal(baseline.format, 'terra-life-model-baseline');
  const samples = baseline.writtenFor.samples;
  const report = runPopulation({samples, seed: baseline.seed});
  const infected = report.oripathy.infected;
  const memberships = report.careers.organizationMemberships;
  const causeShares = Object.values(report.causes).map(entry => entry.share);

  const metrics = {
    'runtime.errors': report.runtimeErrors.length,
    'longevity.mean': report.longevity.mean,
    'longevity.p10': report.longevity.p10,
    'longevity.p50': report.longevity.p50,
    'longevity.p90': report.longevity.p90,
    'population.nations': Object.keys(report.population.nations).length,
    'population.races': Object.keys(report.population.races).length,
    'causes.distinct': Object.keys(report.causes).length,
    'causes.topShare': Math.max(...causeShares),
    'causes.oripathyShare': report.causes.ori ? report.causes.ori.share : 0,
    'oripathy.incidence': report.oripathy.incidence,
    'oripathy.treatedShare': infected ? report.oripathy.treated / infected : 0,
    'oripathy.knownShare': infected ? report.oripathy.known / infected : 0,
    'oripathy.stage3Share': (report.oripathy.stageByFinalState['3'] || 0) / samples,
    'salary.p50': report.salary.p50,
    'salary.p90': report.salary.p90,
    'pension.p50': report.pension.p50,
    'crystal.final.p50': report.oripathy.finalCrystalRate.p50,
    'crystal.annual.p50': report.oripathy.annualCrystalRate.p50,
    'careers.membershipRate': memberships / samples,
    'careers.serviceYears.p50': report.careers.serviceYearsPerMembership.p50,
    'careers.promotionsPerMembership': memberships ? report.careers.promotions / memberships : 0,
    'careers.closedShare': memberships ? report.careers.completedMemberships / memberships : 1
  };

  const failures = [];
  for (const band of baseline.bands) {
    const value = metrics[band.key];
    assert.equal(typeof value, 'number', `band ${band.key} has no measured value`);
    if (value < band.min || value > band.max) {
      failures.push(`${band.key}=${value} outside [${band.min}, ${band.max}] (${band.note})`);
    }
  }
  assert.deepEqual(failures, [],
    'model distributions moved outside their documented guard rails; inspect the report, '
    + 'then update the baseline together with a rules-change note');
});

test('foreign purge consequences, Aegir water adaptation and retirement are behaviourally bounded', () => {
  const TL = createSimulation();
  const local = TL.newLife({seed: 41003, nation: 'URS', race: 'ursus', bornYear: 1052});
  Object.assign(local, {age: 25, year: 1077, city: '切尔诺伯格', job: 'scholar'});
  TL.timelineYear(local);
  assert.ok(local.log.some(entry => entry.key === 'urs_purge_at'));

  const foreign = TL.newLife({seed: 41004, nation: 'YAN', race: 'feline', bornYear: 1052});
  Object.assign(foreign, {age: 25, year: 1077, city: '切尔诺伯格', job: 'scholar'});
  TL.timelineYear(foreign);
  assert.ok(foreign.log.some(entry => entry.key === 'urs_purge'));
  assert.equal(foreign.log.some(entry => entry.key === 'urs_purge_at'), false);

  const aegir = TL.newLife({seed: 41001, nation: 'AEG', race: 'aegir', traits: {underwaterBreathing: true}});
  const ordinaryAegir = TL.newLife({seed: 41002, nation: 'AEG', race: 'aegir', traits: {underwaterBreathing: false}});
  Object.assign(aegir, {job: 'fisher', age: 25});
  Object.assign(ordinaryAegir, {job: 'fisher', age: 25});
  assert.equal(TL.causeWeights(aegir, 25, false).drown, undefined);
  assert.ok(TL.causeWeights(ordinaryAegir, 25, false).drown > 0);

  const retired = TL.newLife({seed: 9911, nation: 'CLB', bornYear: 1035});
  Object.assign(retired, {age: 65, year: 1100, job: 'scholar', eduLevel: 4, flags: {}, orgHistory: []});
  assert.equal(TL.retire(retired), true);
  assert.equal(retired.job, 'retired');
  const income = retired.income;
  assert.equal(TL.fire(retired, {type: 'ev', id: 'job_lost'}), 'skipped');
  assert.equal(retired.job, 'retired');
  assert.equal(retired.income, income);
  assert.equal(retired.evCount.job_lost, undefined);
  TL.assertStateInvariants(retired);

  const member = TL.newLife({seed: 91231, nation: 'CLB', bornYear: 1070});
  Object.assign(member, {age: 30, year: 1100, job: 'scholar', eduLevel: 4, flags: {}, orgHistory: []});
  assert.equal(TL.joinOrganization(member, 'rhine_life', 'research'), true);
  TL.assertStateInvariants(member);
  member.job = 'seeking';
  TL.syncOrganization(member);
  assert.equal(member.affiliation, null);
  assert.equal(member.orgHistory[0].leftYear, 1100);
  assert.equal(member.orgHistory[0].reason, '结束任职');
  TL.assertStateInvariants(member);
});

test('a retired life cannot be dismissed by ordinary events or decisions', () => {
  const TL = createSimulation();
  const retired = TL.newLife({seed: 7711, nation: 'URS', race: 'ursus', bornYear: 1060});
  Object.assign(retired, {age: 68, year: 1098, job: 'miner', eduLevel: 2, flags: {}, orgHistory: []});
  assert.equal(TL.retire(retired), true);

  // The shared eligibility predicate is the single gate for losing a job.
  assert.equal(TL.canBeDismissed(retired), false);
  assert.equal(TL.dismissFromJob(retired), false, 'dismissal must be a no-op for a retired life');
  assert.equal(retired.job, 'retired');
  assert.equal(retired.flags.lastJob, 'miner', 'the pre-retirement job stays available for reports');

  // The job-loss decision is not even offered, so it cannot change the answer later.
  retired.ori = {at: 20, crystal: 30, stage: 2, treated: false, known: true, provider: null};
  TL.openDecision(retired, 'ori_job_loss');
  assert.equal(retired.pending, null, 'retired lives must not be asked about losing a job');
  TL.assertStateInvariants(retired);

  // Positive control: the same decision is offered to an employed infected worker.
  const worker = infectedWorker(TL, 7712);
  TL.openDecision(worker, 'ori_job_loss');
  assert.ok(worker.pending, 'an employed infected worker is still asked');
  assert.equal(worker.pending.id, 'ori_job_loss');
});

test('coerced labour ends the retirement identity instead of stacking on it', () => {
  const TL = createSimulation();
  const state = TL.newLife({seed: 6611, nation: 'URS', race: 'ursus', bornYear: 1060});
  Object.assign(state, {age: 70, year: 1100, job: 'miner', eduLevel: 2, flags: {}, orgHistory: []});
  assert.equal(TL.retire(state), true);

  assert.equal(TL.enterCoercedLabour(state, 'slave'), true);
  assert.equal(state.job, 'slave');
  assert.equal(state.flags.retired, false, 'coerced labour replaces the retirement status');
  assert.equal(state.flags.lastJob, 'miner', 'release goes back to the pre-retirement job');
  TL.assertStateInvariants(state);

  assert.equal(TL.enterCoercedLabour(state, 'slave'), false, 're-entering the same labour is a no-op');
  assert.equal(TL.enterCoercedLabour(state, 'soldier'), false, 'only coercive states flow through this entry');
});

test('the derived view is pure data and survives a JSON round trip', () => {
  const TL = createSimulation();
  const state = infectedWorker(TL, 9001);
  const view = deriveLifeView(state);
  assert.deepEqual(deriveLifeView(state), view, 'the view must not depend on call order');
  assert.deepEqual(JSON.parse(JSON.stringify(view)), view, 'the view must be plain data');
  assert.equal(view.health.infected, true);
  assert.equal(view.career.currentJob, 'miner');
  assert.equal(view.mortality.ended, false);
  assert.deepEqual(deriveLifeView(null).career.memberships, []);
});

test('registry validator reports structured diagnostics, including cross-references', () => {
  const TL = createSimulation();
  assert.deepEqual(validateRegistries(TL), []);

  const event = TL.EVMAP.quiet_year;
  const job = TL.JOBS.farm;
  const source = TL.ORGANIZATIONS.rhodes.provenance;
  const organization = TL.ORGANIZATIONS.rhodes;
  event.w = -1;
  job.hi = -1;
  TL.ORGANIZATIONS.rhodes = {...organization, provenance: null};
  try {
    const diagnostics = validateRegistries(TL);
    const has = (code, path) => diagnostics.some(item => item.code === code && item.path === path);
    assert.ok(has('event.invalid-weight', 'events.quiet_year.w'));
    assert.ok(has('job.invalid-salary-interval', 'jobs.farm'));
    assert.ok(has('provenance.missing-setting', 'organization rhodes.provenance.setting'));
  } finally {
    event.w = 3;
    job.hi = 0.95;
    TL.ORGANIZATIONS.rhodes = organization;
    TL.ORGANIZATIONS.rhodes.provenance = source;
  }
  assert.deepEqual(validateRegistries(TL), []);

  // Unknown references and stale indexes are reported, not thrown.
  const broken = {
    ...TL,
    NATIONS: [...TL.NATIONS, {
      id: 'nowhere', name: 'x', race: ['no_such_race'],
      provenance: {
        setting: {kind: 'canon-fact', confidence: 'documented', sources: ['x']},
        gameModel: {kind: 'project-rule', sources: ['y']}
      }
    }]
  };
  const diagnostics = validateRegistries(broken);
  assert.ok(diagnostics.some(item => item.code === 'reference.unknown-race'));
  assert.ok(diagnostics.some(item => item.code === 'index.size-mismatch' && item.path === 'NATION_BY_ID'));
});
