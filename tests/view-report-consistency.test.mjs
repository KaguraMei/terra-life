import assert from 'node:assert/strict';
import test from 'node:test';
import {createSimulation, deriveLifeView} from '../dist-runtime/simulation.mjs';

const SAMPLES = 40;

function finish(runtime, state) {
  let guard = 0;
  while (state.phase === 'life' && guard++ < 40000) {
    if (!state.focus) state.focus = runtime.autoFocus(state);
    runtime.tick(state, state.yearSec / 8);
    if (state.pending) runtime.autoChoose(state);
  }
  assert.equal(state.phase, 'report', 'the sampled life must reach its end');
  return state;
}

test('the derived view agrees with the finished-life report on every shared fact', () => {
  const runtime = createSimulation();
  let checked = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const state = finish(runtime, runtime.newLife({seed: 820000 + i, pace: 'short'}));
    const report = state.report;
    const view = deriveLifeView(state);
    const where = `seed ${820000 + i}`;

    assert.equal(view.mortality.ended, true, `${where}: a finished life is ended`);
    assert.equal(view.mortality.deathAge, report.age, `${where}: death age`);
    assert.equal(view.mortality.deathCause, report.cause, `${where}: death cause id`);
    assert.equal(view.identity.finalAge, state.age, `${where}: final age`);

    // Memberships are the same list, projected rather than re-derived.
    assert.equal(view.career.memberships.length, report.orgHistory.length,
      `${where}: membership count`);
    view.career.memberships.forEach((membership, index) => {
      const row = report.orgHistory[index];
      assert.equal(membership.organization, row.organization, `${where}: membership ${index} organization`);
      assert.equal(membership.route, typeof row.route === 'string' ? row.route : null,
        `${where}: membership ${index} route`);
      assert.equal(membership.joinedYear, typeof row.joinedYear === 'number' ? row.joinedYear : null,
        `${where}: membership ${index} joined year`);
      assert.equal(membership.leftYear, typeof row.leftYear === 'number' ? row.leftYear : null,
        `${where}: membership ${index} left year`);
      assert.equal(membership.closed, row.leftYear != null || row.leftAt != null,
        `${where}: membership ${index} closure`);
    });

    // The annual series is the same length as the recorded years, one row per age.
    assert.equal(view.annual.length, (state.stats.years || []).length, `${where}: annual length`);
    if (view.annual.length) {
      assert.equal(view.annual[0].age, 0, `${where}: annual starts at birth`);
      assert.equal(view.annual.at(-1).age, view.annual.length - 1, `${where}: one row per age`);
    }

    // Economy and health stay finite in the projection.
    assert.ok(Number.isFinite(view.economy.monthlyIncome), `${where}: income is finite`);
    assert.ok(Number.isFinite(view.health.crystal), `${where}: crystal is finite`);
    assert.equal(view.career.retired, state.flags.retired === true, `${where}: retirement flag`);
    checked++;
  }
  assert.equal(checked, SAMPLES);
});

test('the view is a projection, not a second source of truth', () => {
  const runtime = createSimulation();
  const state = finish(runtime, runtime.newLife({seed: 830001, pace: 'short'}));
  const before = JSON.stringify(state);

  const view = deriveLifeView(state);
  const again = deriveLifeView(state);
  assert.deepEqual(view, again, 'deriving twice yields the same view');
  assert.equal(JSON.stringify(state), before, 'deriving never mutates the life state');

  const roundTripped = JSON.parse(JSON.stringify(view));
  assert.deepEqual(roundTripped, view, 'the view survives a JSON round trip');

  // A malformed state yields an empty but well-formed view instead of throwing.
  const empty = deriveLifeView({});
  assert.equal(empty.mortality.ended, false);
  assert.deepEqual(empty.career.memberships, []);
  assert.deepEqual(empty.annual, []);
});
