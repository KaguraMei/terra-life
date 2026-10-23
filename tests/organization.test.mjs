import assert from 'node:assert/strict';
import test from 'node:test';
import {
  contactEligible, createSimulation, isUnpaid, organizationAvailable, organizationStatus,
  organizationSubject, payMultiplier, promotionReady, subsistence
} from '../dist-runtime/simulation.mjs';

const life = overrides => ({
  phase: 'life', affiliation: 'rhine', orgJob: 'researcher', job: 'researcher',
  orgRank: 0, orgService: 0, orgLastPromotionYear: null, year: 1090, age: 30,
  school: false, serveLeft: 0, flags: {}, orgTransition: null, nation: 'YAN',
  ...overrides
});
const available = (overrides = {}) => ({working: true, available: true, recruitment: true, ...overrides});

const contractModel = {payroll: {scale: 'flat'}};
const rankModel = {payroll: {scale: 'service-rank', rankStep: 0.08, maxRankSteps: 3}};

test('an organization moves through its own timeline', () => {
  const def = {fromYear: 1080, untilYear: 1120, recruitUntil: 1110};
  assert.equal(organizationStatus(null, 1090).status, 'unknown');
  assert.equal(organizationStatus(def, 1079).status, 'not_yet');
  assert.equal(organizationStatus(def, 1090).status, 'active');
  assert.equal(organizationStatus(def, 1115).status, 'reorganized');
  assert.equal(organizationStatus(def, 1130).status, 'dissolved');

  assert.equal(organizationStatus(def, 1090).recruitment, true);
  assert.equal(organizationStatus(def, 1115).recruitment, false, 'a reorganized org stops recruiting');
  assert.equal(organizationStatus(def, 1115).available, true, 'but still exists');
  assert.equal(organizationStatus(def, 1130).available, false);
  assert.equal(organizationStatus(def, Number.NaN).status, 'unknown');
});

test('a locale can forbid an organization that still exists', () => {
  assert.equal(organizationAvailable({fromYear: 1080}, 1090, {}), true);
  assert.equal(organizationAvailable({fromYear: 1080, locationAllowed: () => false}, 1090, {}), false);
  assert.equal(organizationAvailable({fromYear: 1080, untilYear: 1085}, 1090, {}), false);
});

test('pay scales with rank only under a service-rank payroll', () => {
  const subject = organizationSubject(life({orgRank: 2}));
  assert.equal(payMultiplier(subject, contractModel, {fromYear: 1080}, available()), 1,
    'a flat payroll ignores rank');
  assert.ok(Math.abs(payMultiplier(subject, rankModel, {fromYear: 1080}, available()) - 1.16) < 1e-9);

  const capped = organizationSubject(life({orgRank: 9}));
  assert.ok(Math.abs(payMultiplier(capped, rankModel, {fromYear: 1080}, available()) - 1.24) < 1e-9,
    'rank steps are capped');

  const away = organizationSubject(life({job: 'seeking', orgRank: 2}));
  assert.equal(payMultiplier(away, rankModel, {fromYear: 1080}, available()), 1,
    'a different job is not on the organization payroll');
});

test('unpaid organizations pay nothing but still provide subsistence', () => {
  const unpaidDef = {fromYear: 1080, unpaid: true, subsistence: 0.6};
  const subject = organizationSubject(life());
  assert.equal(isUnpaid(subject, unpaidDef, available()), true);
  assert.equal(payMultiplier(subject, rankModel, unpaidDef, available()), 0, 'no payroll at all');
  assert.ok(Math.abs(subsistence(subject, unpaidDef, available(), 120) - 72) < 1e-9);

  const student = organizationSubject(life({school: true}));
  assert.equal(isUnpaid(student, unpaidDef, available()), false, 'a student is not doing the work');
  const paid = organizationSubject(life());
  assert.equal(isUnpaid(paid, {fromYear: 1080}, available()), false);
});

test('promotion needs the next rank, the service years and a fresh year', () => {
  const route = {ranks: [{}, {needYears: 3}, {needYears: 6}]};
  const subject = organizationSubject(life({orgService: 3, orgRank: 0}));
  assert.equal(promotionReady(subject, route, available()), true);
  assert.equal(promotionReady(organizationSubject(life({orgService: 2})), route, available()), false,
    'not enough service yet');
  assert.equal(promotionReady(subject, {ranks: [{}]}, available()), false, 'no next rank');
  assert.equal(promotionReady(subject, route, available({recruitment: false})), false);
  assert.equal(promotionReady(subject, route, available({working: false})), false);

  const alreadyPromoted = organizationSubject(life({orgService: 3, orgLastPromotionYear: 1090}));
  assert.equal(promotionReady(alreadyPromoted, route, available()), false,
    'one promotion per year');
  const retired = organizationSubject(life({orgService: 3, flags: {retired: true}}));
  assert.equal(promotionReady(retired, route, available()), false);
});

test('a contact is usable three times, four years apart', () => {
  const contact = {id: 'liaison', fromYear: 1080, untilYear: 1110, minRank: 1};
  const subject = organizationSubject(life({orgRank: 1, year: 1090}));
  assert.equal(contactEligible(subject, 'rhine', contact, null, available()), true);
  assert.equal(contactEligible(subject, 'rhine', contact, {count: 1, lastYear: 1087}, available()), false,
    'four years have not passed');
  assert.equal(contactEligible(subject, 'rhine', contact, {count: 1, lastYear: 1086}, available()), true);
  assert.equal(contactEligible(subject, 'rhine', contact, {count: 3, lastYear: 1080}, available()), false,
    'three uses exhaust the contact');

  const lowRank = organizationSubject(life({orgRank: 0, year: 1090}));
  assert.equal(contactEligible(lowRank, 'rhine', contact, null, available()), false, 'rank gate');

  const outsider = organizationSubject(life({affiliation: 'other', orgRank: 1, year: 1090}));
  assert.equal(contactEligible(outsider, 'rhine', contact, null, available()), false,
    'only members of that organization');

  const late = organizationSubject(life({orgRank: 1, year: 1120}));
  assert.equal(contactEligible(late, 'rhine', contact, null, available()), false, 'past the window');
});

test('the subject contract reads the legacy field names', () => {
  const subject = organizationSubject({
    phase: 'life', affiliation: 'rhine', orgJob: 'researcher', job: 'researcher',
    orgRank: 2, orgService: 5, orgLastPromotionYear: 1088, year: 1090, age: 40,
    school: 0, serveLeft: 0, flags: {retired: 1}, orgTransition: null, nation: 'YAN'
  });
  assert.equal(subject.rank, 2, 'orgRank maps to rank');
  assert.equal(subject.service, 5);
  assert.equal(subject.retired, true, 'a 1/0 flag is truthiness, not identity');
  assert.equal(subject.school, false);
  assert.equal(organizationSubject({}).affiliation, null);
});

test('the wired admission guard returns the interview payload the flow expects', () => {
  const TL = createSimulation();
  const S = TL.newLife({seed: 424242, nation: 'YAN', bornYear: 1060});
  Object.assign(S, {age: 22, eduLevel: 3, arts: 40, job: 'worker', year: 1090, phase: 'life'});

  const refused = TL.organizationEligibility(S, 'no_such_org', 'no_such_route');
  assert.equal(refused.ok, false);
  assert.equal(refused.code, 'unknown');
  assert.equal(typeof refused.reason, 'string', 'a refusal carries a player-facing reason');

  // A route the recruit gate accepts returns the three fields the interview flow reads.
  const orgId = 'rhine_life';
  const routeId = Object.keys(TL.ORGANIZATIONS[orgId].routes)[0];
  const admitted = TL.organizationEligibility(S, orgId, routeId);
  if (admitted.ok) {
    assert.equal(admitted.organization, orgId);
    assert.equal(admitted.route, routeId);
    assert.equal(typeof admitted.interview, 'object', 'the interview spec travels with the ok verdict');
  }

  // Transfer is the one option the shim translates; everything else stays default.
  S.affiliation = 'reunion';
  assert.equal(TL.organizationEligibility(S, orgId, routeId).code, 'affiliated');
  const transferred = TL.organizationEligibility(S, orgId, routeId, {transfer: true});
  assert.notEqual(transferred.code, 'affiliated', 'a transfer may keep the current contract');
});
