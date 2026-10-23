/**
 * Differential probe for organization admission.
 *
 * The typed guard (`src/model/admission.ts`) is now wired: `TL.organizationEligibility`
 * runs the model and the shim only adds the `ok` payload. That means the two sides of
 * this probe are:
 *
 *   1. the wired path — legacy entry point → typed guard → ports,
 *   2. a **reference transcription** of the fourteen checks as they read before the
 *      wire, kept here as an independent oracle.
 *
 * The authoritative comparison against the real pre-wiring implementation was made
 * before the switch and is recorded in the roadmap: 28,800 decisions over 400 states ×
 * 36 targets × 2 transfer flags, all fourteen codes exercised, zero mismatches.
 *
 * Keep this probe as a standing oracle: if somebody reorders a check or drops a guard,
 * the `code` changes and this fails immediately — long before a hash mismatch would
 * tell you that some life, somewhere, took a different branch.
 *
 *   node tools/diff-admission.mjs [--states 400]
 */
import { createSimulation } from '../dist-runtime/simulation.mjs';

const argOf = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
};
const STATES = argOf('--states', 400);

const TL = createSimulation();
const organizations = Object.keys(TL.ORGANIZATIONS);
const routes = [];
for (const id of organizations) {
  for (const routeId of Object.keys(TL.ORGANIZATIONS[id].routes || {})) {
    routes.push({id, routeId});
  }
}
// Two impossible targets, so the `unknown` rung is covered too.
routes.push({id: 'no_such_org', routeId: 'x'});
routes.push({id: organizations[0], routeId: 'no_such_route'});

const jobs = Object.keys(TL.JOBS).filter(id => !id.startsWith('op_'));
const nations = TL.NATIONS.map(nation => nation.id);
const cities = ['龙门', '新沃尔西尼', '乌萨斯城', ''];

/** A deliberately wide spread: every guard should trip for some state. */
const makeState = index => {
  const S = TL.newLife({
    seed: 880000 + index,
    nation: nations[index % nations.length],
    bornYear: 1030 + (index % 60)
  });
  return Object.assign(S, {
    phase: index % 37 === 0 ? 'report' : 'life',
    age: 14 + (index % 52),
    school: index % 5 === 0 ? 'middle' : null,
    serveLeft: index % 7 === 0 ? 1 : 0,
    job: jobs[index % jobs.length],
    eduLevel: index % 5,
    arts: (index * 13) % 100,
    affiliation: index % 3 === 0 ? organizations[index % organizations.length] : null,
    city: cities[index % cities.length],
    year: 1080 + (index % 40),
    flags: Object.assign({}, S.flags, {retired: index % 11 === 0}),
    orgCooldowns: index % 4 === 0 ? {[organizations[index % organizations.length]]: 1085 + (index % 20)} : {}
  });
};

/**
 * The fourteen checks transcribed from the pre-wiring legacy guard. Same order, same
 * codes, same exception for the Longmen guard; only the reporting differs.
 */
const reference = (S, id, routeId, transfer) => {
  const o = TL.organizationDef(id);
  const r = TL.organizationRouteDef(id, routeId);
  const fail = code => ({ok: false, code});
  if (!o || !r) return fail('unknown');
  if (S.phase !== 'life') return fail('ended');
  if (!TL.organizationState(S, id).recruitment) return fail('closed');
  if (o.locationAllowed && !o.locationAllowed(S)) return fail('location');
  if (S.school || S.flags.retired || S.age >= 65 || S.serveLeft > 0
    || ['slave', 'prison', 'retired'].includes(S.job)) return fail('unavailable');
  if (S.affiliation && !transfer) return fail('affiliated');
  if ((S.orgCooldowns || {})[id] > S.year) return fail('cooldown');
  if (o.nations && !o.nations.includes(S.nation)
    && !(id === 'lungmen_guard' && S.nation === 'YAN' && /龙门/.test(S.city))) return fail('nation');
  if (S.age < r.minAge || (r.maxAge != null && S.age > r.maxAge)) return fail('age');
  if (r.fromYear != null && S.year < r.fromYear) return fail('route_year');
  if (S.eduLevel < (r.edu || 0)) return fail('education');
  if (r.jobs && !r.jobs.includes(S.job)) {
    const j = TL.JOBS[r.entryJob || r.jobs[0]];
    if (S.job !== 'seeking' || !j || S.eduLevel < j.edu || S.arts < j.art * 100) return fail('profession');
  }
  if (r.require && !r.require(S)) return fail('requirements');
  if (o.require && !o.require(S)) return fail('organization_requirements');
  return {ok: true};
};

const wired = (S, id, routeId, transfer) => {
  const result = TL.organizationEligibility(S, id, routeId, transfer ? {transfer: true} : {});
  return result.ok ? {ok: true} : {ok: false, code: result.code};
};

const mismatches = [];
let compared = 0;
const codeCounts = new Map();

for (let i = 0; i < STATES; i++) {
  const S = makeState(i);
  for (const {id, routeId} of routes) {
    for (const transfer of [false, true]) {
      const expected = reference(S, id, routeId, transfer);
      const actual = wired(S, id, routeId, transfer);
      compared++;
      const key = expected.ok ? 'ok' : (expected.code || '?');
      codeCounts.set(key, (codeCounts.get(key) || 0) + 1);
      const same = actual.ok === expected.ok && (actual.ok || actual.code === expected.code);
      if (!same && mismatches.length < 30) {
        mismatches.push({
          state: i,
          target: `${id}/${routeId}`,
          transfer,
          age: S.age,
          job: S.job,
          edu: S.eduLevel,
          arts: S.arts,
          nation: S.nation,
          city: S.city,
          affiliation: S.affiliation,
          retired: S.flags.retired,
          expected,
          actual
        });
      }
    }
  }
}

const summary = [...codeCounts.entries()].sort((a, b) => b[1] - a[1])
  .map(([code, count]) => `${code}=${count}`).join(' ');
console.log(`compared ${compared} decisions over ${STATES} states x ${routes.length} routes x 2 transfer flags`);
console.log(`reference verdicts: ${summary}`);

if (mismatches.length) {
  console.log(`\nMISMATCHES (showing ${mismatches.length}):`);
  for (const row of mismatches) console.log(JSON.stringify(row));
  process.exitCode = 1;
} else {
  console.log('no mismatches: the wired guard matches the reference transcription on every decision');
}
