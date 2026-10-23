import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {simulation} from './sim-context.mjs';
import {deriveLifeView} from '../dist-runtime/simulation.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)];
};
const summarize = values => ({
  count: values.length,
  mean: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
  p10: percentile(values, 0.10), p50: percentile(values, 0.50), p90: percentile(values, 0.90),
  min: values.length ? values.reduce((min, value) => Math.min(min, value), Infinity) : null,
  max: values.length ? values.reduce((max, value) => Math.max(max, value), -Infinity) : null
});
const compareIds = (a, b) => String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
const tally = values => Object.fromEntries([...values].sort(([a], [b]) => compareIds(a, b)));

function finishLife(TL, options) {
  const state = TL.newLife(options);
  let steps = 0;
  while (state.phase === 'life' && steps++ < 30000) {
    if (!state.focus) state.focus = TL.autoFocus(state);
    TL.tick(state, state.yearSec / 8);
    if (state.pending) TL.autoChoose(state);
    if (state.phase === 'life' && state.t >= 1) TL.endYear(state);
  }
  if (state.phase !== 'report') throw new Error(`Life did not complete (seed ${options.seed}, phase ${state.phase}, steps ${steps})`);
  return state;
}

/** Run a fixed, consecutive seed range and return behavior/distribution summaries. */
export function runPopulation({samples = 500, seed = 292000} = {}) {
  if (!Number.isInteger(samples) || samples < 1 || samples > 5000) throw new RangeError('samples must be an integer from 1 to 5000');
  if (!Number.isSafeInteger(seed) || seed < 0) throw new RangeError('seed must be a nonnegative safe integer');
  const runtimeErrors = [];
  const {TL} = simulation({log(){}, warn(){}, error(...args){runtimeErrors.push(args.map(String).join(' '));}});
  const lives = [];
  const ages = [], salaries = [], pensions = [], crystals = [], annualCrystals = [], memberships = [];
  const causes = new Map(), nations = new Map(), races = new Map(), sexes = new Map();
  const stages = new Map([[0, 0], [1, 0], [2, 0], [3, 0]]);
  const jobs = new Map(), organizations = new Map();
  let infected = 0, treated = 0, known = 0, peopleWithOrganizations = 0;
  let promotionCount = 0, closedMemberships = 0;

  for (let index = 0; index < samples; index++) {
    const lifeSeed = seed + index;
    const S = finishLife(TL, {seed: lifeSeed, pace: 'short'});
    TL.assertStateInvariants(S);
    // Read the life through its derived view: the report never inspects internals.
    const view = deriveLifeView(S);
    lives.push({seed: lifeSeed, age: view.mortality.deathAge, cause: view.mortality.deathCause});
    ages.push(view.mortality.deathAge);
    causes.set(view.mortality.deathCause, (causes.get(view.mortality.deathCause) || 0) + 1);
    nations.set(view.identity.nation, (nations.get(view.identity.nation) || 0) + 1);
    races.set(view.identity.race, (races.get(view.identity.race) || 0) + 1);
    sexes.set(view.identity.sex, (sexes.get(view.identity.sex) || 0) + 1);
    for (const year of view.annual) {
      if (!Number.isFinite(year.income)) continue;
      if (TL.JOBS[year.job]) salaries.push(year.income);
      else if (year.job === 'retired') pensions.push(year.income);
      if (year.stage > 0) annualCrystals.push(year.crystal);
    }
    if (view.career.finalJob) jobs.set(view.career.finalJob, (jobs.get(view.career.finalJob) || 0) + 1);
    if (view.health.infected) {
      infected++;
      stages.set(view.health.stage, (stages.get(view.health.stage) || 0) + 1);
      if (view.health.treated) treated++;
      if (view.health.known) known++;
      crystals.push(view.health.crystal);
    } else stages.set(0, (stages.get(0) || 0) + 1);
    if (view.career.memberships.length) peopleWithOrganizations++;
    for (const membership of view.career.memberships) {
      memberships.push(membership.serviceYears);
      if (membership.closed) closedMemberships++;
      promotionCount += membership.promotions;
      organizations.set(membership.organization, (organizations.get(membership.organization) || 0) + 1);
    }
  }

  return {
    reproducibility: {seed, samples, seedStep: 1, rules: 'current core rules', completeLives: lives.length},
    population: {nations: tally(nations), races: tally(races), sexes: tally(sexes)},
    longevity: summarize(ages),
    causes: Object.fromEntries([...causes].sort(([a], [b]) => compareIds(a, b)).map(([id, count]) => [id, {count, share: count / samples}])),
    oripathy: {
      infected, incidence: infected / samples, treated, known,
      stageByFinalState: tally(stages), finalCrystalRate: summarize(crystals), annualCrystalRate: summarize(annualCrystals)
    },
    salary: {unit: 'monthly amount in job-coded person-years', ...summarize(salaries)},
    pension: {unit: 'monthly amount in retired person-years', ...summarize(pensions)},
    careers: {
      finalJob: tally(jobs), organizationMemberships: memberships.length,
      peopleWithOrganizations, membershipsByOrganization: tally(organizations),
      completedMemberships: closedMemberships, promotions: promotionCount,
      serviceYearsPerMembership: summarize(memberships)
    },
    runtimeErrors,
    sampleLives: lives.slice(0, Math.min(5, lives.length))
  };
}

function parseArgs(args) {
  const result = {samples: 500, seed: 292000, out: null};
  for (let i = 0; i < args.length; i++) {
    const [key, inline] = args[i].split('=', 2);
    const value = inline ?? args[++i];
    if (key === '--samples') result.samples = Number(value);
    else if (key === '--seed') result.seed = Number(value);
    else if (key === '--out') result.out = value;
    else throw new Error(`Unknown argument: ${key}`);
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const options = parseArgs(process.argv.slice(2));
  const report = runPopulation(options);
  if (report.runtimeErrors.length) throw new Error(report.runtimeErrors.join('\n'));
  const json = JSON.stringify(report, null, 2) + '\n';
  if (options.out) await fs.writeFile(path.resolve(root, options.out), json, 'utf8');
  process.stdout.write(json);
}

