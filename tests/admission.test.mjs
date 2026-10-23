import assert from 'node:assert/strict';
import test from 'node:test';
import { admissionSubject, admissionVerdict } from '../dist-runtime/simulation.mjs';

const subject = (extra = {}) => ({
  phase: 'life',
  school: false,
  retired: false,
  age: 25,
  serveLeft: 0,
  job: 'worker',
  affiliation: null,
  nation: 'YAN',
  city: '',
  eduLevel: 2,
  arts: 40,
  year: 1090,
  cooldownYear: 0,
  ...extra
});

/** A permissive world: every check passes unless the test overrides it. */
const ports = (extra = {}) => ({
  def: id => (id === 'missing' ? null : {nations: null, locationAllowed: null, require: null}),
  route: (id, routeId) => (routeId === 'missing'
    ? null
    : {minAge: 18, maxAge: 60, fromYear: null, edu: 2, jobs: null, entryJob: null, require: null}),
  recruiting: () => true,
  job: () => ({edu: 2, art: 0.4}),
  ...extra
});

const verdict = (extra = {}, target = {}, world = {}) =>
  admissionVerdict({}, subject(extra), {organization: 'org', route: 'route', ...target}, ports(world));

test('a fully qualified life is admitted', () => {
  assert.deepEqual(verdict(), {ok: true});
});

test('unknown targets are refused before anything else', () => {
  assert.equal(verdict({}, {organization: 'missing'}).code, 'unknown');
  assert.equal(verdict({}, {route: 'missing'}).code, 'unknown');
  // Even an ended life and a closed door report `unknown` first.
  assert.equal(verdict({phase: 'report'}, {organization: 'missing'}).code, 'unknown');
});

test('the checks run in their documented order', () => {
  // ended beats closed
  assert.equal(verdict({phase: 'report'}, {}, {recruiting: () => false}).code, 'ended');
  // closed beats location
  assert.equal(verdict({}, {}, {recruiting: () => false, def: () => ({
    nations: null, locationAllowed: () => false, require: null
  })}).code, 'closed');
  // location beats unavailable
  assert.equal(verdict({school: 'middle'}, {}, {def: () => ({
    nations: null, locationAllowed: () => false, require: null
  })}).code, 'location');
  // unavailable beats affiliated
  assert.equal(verdict({school: 'middle', affiliation: 'other'}).code, 'unavailable');
  // affiliated beats cooldown
  assert.equal(verdict({affiliation: 'other', cooldownYear: 1200}).code, 'affiliated');
  // cooldown beats nation
  assert.equal(verdict({cooldownYear: 1200}, {}, {def: () => ({
    nations: ['URS'], locationAllowed: null, require: null
  })}).code, 'cooldown');
  // nation beats age
  assert.equal(verdict({age: 10}, {}, {def: () => ({
    nations: ['URS'], locationAllowed: null, require: null
  })}).code, 'nation');
  // age beats route_year
  assert.equal(verdict({age: 10}, {}, {route: () => ({
    minAge: 18, maxAge: 60, fromYear: 1200, edu: 2, jobs: null, entryJob: null, require: null
  })}).code, 'age');
  // route_year beats education
  assert.equal(verdict({eduLevel: 0}, {}, {route: () => ({
    minAge: 18, maxAge: 60, fromYear: 1200, edu: 4, jobs: null, entryJob: null, require: null
  })}).code, 'route_year');
  // education beats profession
  assert.equal(verdict({eduLevel: 0, job: 'nobody'}, {}, {route: () => ({
    minAge: 18, maxAge: 60, fromYear: null, edu: 4, jobs: ['miner'], entryJob: null, require: null
  })}).code, 'education');
  // requirements beat organization requirements
  assert.equal(verdict({}, {}, {
    route: () => ({
      minAge: 18, maxAge: 60, fromYear: null, edu: 2, jobs: null, entryJob: null,
      require: () => false
    }),
    def: () => ({nations: null, locationAllowed: null, require: () => false})
  }).code, 'requirements');
  assert.equal(verdict({}, {}, {def: () => ({
    nations: null, locationAllowed: null, require: () => false
  })}).code, 'organization_requirements');
});

test('every "unavailable" status is refused by the same check', () => {
  for (const extra of [
    {school: 'high'}, {retired: true}, {age: 65}, {serveLeft: 1},
    {job: 'slave'}, {job: 'prison'}, {job: 'retired'}
  ]) {
    assert.equal(verdict(extra).code, 'unavailable', JSON.stringify(extra));
  }
  assert.equal(verdict({retired: false, age: 64}, {}, {route: () => ({
    minAge: 18, maxAge: null, fromYear: null, edu: 0, jobs: null, entryJob: null, require: null
  })}).ok, true, 'sixty-four is still young enough when the route has no upper bound');
});

test('a transfer may keep the current contract, a plain application may not', () => {
  assert.equal(verdict({affiliation: 'other'}).code, 'affiliated');
  assert.equal(verdict({affiliation: 'other'}, {transfer: true}).ok, true);
});

test('the cooldown year is exclusive of the current year', () => {
  assert.equal(verdict({year: 1090, cooldownYear: 1091}).code, 'cooldown');
  assert.equal(verdict({year: 1090, cooldownYear: 1090}).ok, true, 'the current year is free again');
});

test('the nation check honours the Longmen exception', () => {
  const onlyUrsus = {def: () => ({nations: ['URS'], locationAllowed: null, require: null})};
  assert.equal(verdict({nation: 'YAN', city: ''}, {}, onlyUrsus).code, 'nation');
  assert.equal(
    verdict({nation: 'YAN', city: '龙门'}, {organization: 'lungmen_guard'}, onlyUrsus).ok, true,
    'Longmen guards may be recruited inside Longmen'
  );
  assert.equal(
    verdict({nation: 'YAN', city: '龙门'}, {organization: 'other'}, onlyUrsus).code, 'nation',
    'the exception is specific to that organization'
  );
});

test('an unemployed applicant must clear the entry job bar', () => {
  const route = {route: () => ({
    minAge: 18, maxAge: 60, fromYear: null, edu: 0, jobs: ['miner'], entryJob: 'miner', require: null
  })};
  assert.equal(verdict({job: 'seeking', eduLevel: 2, arts: 50}, {}, route).ok, true);
  assert.equal(verdict({job: 'seeking', eduLevel: 0, arts: 50}, {}, route).code, 'profession',
    'education below the entry job');
  assert.equal(verdict({job: 'seeking', eduLevel: 2, arts: 10}, {}, route).code, 'profession',
    'arts below the entry job');
  assert.equal(verdict({job: 'farmer', eduLevel: 2, arts: 50}, {}, route).code, 'profession',
    'a different profession cannot rely on the fallback');
  assert.equal(verdict({job: 'seeking', eduLevel: 2, arts: 50}, {}, {...route, job: () => null}).code,
    'profession', 'an unknown entry job cannot qualify');
});

test('a route that accepts the current job skips the profession fallback', () => {
  const route = {route: () => ({
    minAge: 18, maxAge: 60, fromYear: null, edu: 0, jobs: ['miner', 'worker'], entryJob: null, require: null
  })};
  assert.equal(verdict({job: 'worker', eduLevel: 0, arts: 0}, {}, route).ok, true);
});

test('content predicates receive the raw state', () => {
  let seen = null;
  const world = {
    route: () => ({
      minAge: 18, maxAge: 60, fromYear: null, edu: 0, jobs: null, entryJob: null,
      require: state => { seen = state; return true; }
    })
  };
  admissionVerdict({name: 'probe'}, subject(), {organization: 'org', route: 'route'}, ports(world));
  assert.deepEqual(seen, {name: 'probe'}, 'the predicate sees the state, not the subject');
});

test('the admission subject normalises a life once', () => {
  const view = admissionSubject({
    phase: 'life', age: 31, year: 1102, school: null, serveLeft: 0, job: 'miner',
    affiliation: '', nation: 'URS', city: '乌萨斯城', eduLevel: 3, arts: 55,
    flags: {retired: 1}, orgCooldowns: {rhine_life: 1110}
  }, 'rhine_life');

  assert.equal(view.age, 31);
  assert.equal(view.retired, true, 'a stored 1 is still true');
  assert.equal(view.school, false);
  assert.equal(view.affiliation, null, 'an empty affiliation reads as none');
  assert.equal(view.cooldownYear, 1110);
  assert.equal(admissionSubject({}, 'other').cooldownYear, 0, 'a missing cooldown reads as zero');
});
