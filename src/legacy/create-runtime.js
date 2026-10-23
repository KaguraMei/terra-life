// Transitional assembly: every initializer closes over this instance, never window.TL.
import { installKernel } from './kernel-adapter';
import { formatDiagnostics, validateRegistries } from '../content/registry-validation';
import { packLocks } from '../content/pack-lock';
import { loadInterviewPacks } from '../content/pack-loader';
import { createLifeGuards } from '../model/transitions';
import { applyEffects, validateEffects } from '../model/effects';
import { deriveLifeView } from '../model/life-view';
import { deriveSessionView } from '../model/session-view';
import { buildCohort, cohortAliveAt, drawDeathAge } from '../model/cohort';
import { createLifeTableBuilder, expHealth, playAge, playAgeDeriv } from '../model/life-table';
import {
  causeWeights, deathRisk, expandResidualWeights, pickCause, residualCauseWeights, subjectFromState
} from '../model/death-risk';
import { CAUSES } from '../content/causes';
import { ORI_STAGES } from '../content/oripathy';
import { evaluateInterview, interviewSession, questionAvailable } from '../model/interview';
import { mayFire, pickAutoOption } from '../model/decision';
import {
  contactEligible, isUnpaid, organizationAvailable, organizationStatus, organizationSubject,
  payMultiplier, promotionReady, subsistence
} from '../model/organization';
import { admissionSubject, admissionVerdict } from '../model/admission';
import { contactRecord, leaveTerms, promotionTerms } from '../model/employment';
import {
  coercedLabourGuard, dismissible, membershipSubject, retirementGuard, syncVerdict
} from '../model/membership';
import {
  drawArts, drawWealth, lifeStage, lifeStageName, netWorth, PACES, STAGE_NAME, STAGE_NAME_EN, yearlySeconds
} from '../model/lifecycle';
import {
  annualRisk as oriAnnualRisk, combatValue as oriCombatValue, lifetimeProbability,
  reunionLean as oriReunionLean, stageName as oriStageName, stageOf as oriStageOf,
  stigma as oriStigma, subjectFromState as subjectFromOripathyState,
  totalDiscrimination as oriTotalDiscrimination, treatmentAccess as oriTreatmentAccess,
  crystalGrowth, treatmentCost as oriTreatmentCost, treatmentSuppression as oriTreatmentSuppression
} from '../model/oripathy';
import {
  addArts, addKnowledge, annualBudget, happinessBase, knowledgeCap, yearSubject
} from '../model/yearly';
import {
  initialStats, parentAges, stratumCode
} from '../model/nativity';
import { applyEffectPatch, logEntry, logOverflows, logTrimStart } from '../model/narrative';
import {
  ageJob, npcJob, siblingCount, siblingOutOfRange, siblingShape, SIBLING_WEIGHTS
} from '../model/family';
import { focusOutcome, focusShares } from '../model/focus';
import { prepareSessionQuestions, selectInterviewQuestions } from '../model/interview-deck';
import { incomePercentile, incomeSubject, monthlyIncome } from '../model/income';
import {
  healthTarget, moodTarget, regressHealth, regressMood, regressSocial, regressionSubject, socialTarget
} from '../model/regression';
import {
  educationTier, schoolDuration, schoolGate, schoolSubject
} from '../model/schooling';
import {
  birthProbability, birthSubject, congenitalInfection, congenitalRisk, CONGENITAL_CHANCE, SON_RATIO
} from '../model/birth';
import {
  artsRank, artsRankName, band, causeName, oripathyMultiplier, povertyWeights, raceMultiplier, tiesMultiplier
} from '../model/mortality';
import { LANG, LOCALE_LIST, LOCALES } from '../content/locales';
import { descOf, detectLocaleId, moneyText, nameOf, pickString, priceNoteText, shortOf, toLocalMoney } from '../model/locale';
import {
  chance, clamp, invNorm, irange, lerp, normCdf, pick, piecewise, range, wpick, wpickArr
} from '../model/sampling';
import {
  barText, EDU_NAME, EDU_NAME_EN, educationName, formatMoney, formatNumber, formatPercent,
  missingEntries, statWord, STAT_DEF, template, ageWord
} from '../model/text';
import {
  CORE_VERSION, RULESET_VERSION, restoreLife, serializeLife
} from '../model/save-envelope';
import initialize3 from '../../js/data/nations.js?legacy';
import initialize4 from '../../js/data/races.js?legacy';
import initialize5 from '../../js/data/jobs.js?legacy';
import initialize6 from '../../js/data/names.js?legacy';
import initialize7 from '../../js/data/baseline.js?legacy';
import initialize8 from '../../js/data/focus.js?legacy';
import initialize9 from '../../js/data/organizations.js?legacy';
import initialize12 from '../../js/engine/oripathy.js?legacy';
import initialize13 from '../../js/engine/state.js?legacy';
import initialize14 from '../../js/engine/decision.js?legacy';
import initialize15 from '../../js/data/timeline.js?legacy';
import initialize16 from '../../js/data/events.js?legacy';
import initialize17 from '../../js/data/decisions.js?legacy';
import initialize18 from '../../js/engine/organization.js?legacy';
import initialize19 from '../../js/data/organization-events.js?legacy';
import initialize20 from '../../js/data/interviews.js?legacy';
import initialize21 from '../../js/engine/interview.js?legacy';
import initialize22 from '../../js/engine/year.js?legacy';
import initialize23 from '../../js/data/provenance.js?legacy';

/**
 * Life tables. Built in `src/model/life-table.ts`; the ports are content lookups.
 * The rest of `js/engine/lifetable.js` (mortality multipliers, cause weights) is
 * still legacy and installs right after this, which is why the manifest entry
 * chains both.
 */
function installLifeTable(TL) {
  const tables = createLifeTableBuilder({
    stratum: id => TL.stratum(id),
    stratumLE: (nationId, stratumId) => TL.stratumLE(nationId, stratumId),
    lifeMaxOf: (raceId, courtId) => TL.lifeMaxOf(raceId, courtId)
  });
  TL.lifeTable = (nation, sex, raceId, courtId, stratumId) =>
    tables.build(nation, sex === 'F' ? 'F' : 'M', raceId, courtId, stratumId);
  TL.LT = state => TL.lifeTable(TL.NATION_BY_ID[state.nation], state.sex, state.race, state.court, state.stratum);
  TL.playAge = age => playAge(age);
  TL.playAgeDeriv = age => playAgeDeriv(age);
  TL.expHealth = age => expHealth(age);

  // Cause vocabulary, naming and the three mortality factors are typed now; the
  // weighting pass itself still lives in the legacy file chained below.
  TL.band = age => band(age);
  TL.CAUSES = CAUSES;
  TL.causeName = (cause, age) => causeName(cause, age == null ? null : age);
  TL.povCause = (weights, familyTier) => povertyWeights(weights, familyTier, TL.clamp);
  TL.tiesK = state => tiesMultiplier(state);
  TL.raceMortK = state => raceMultiplier(state, TL.discrimination(state));
  TL.oriMortK = (state, age) => oripathyMultiplier(state, age, TL.tolInfo(state.nation, state.year));
  TL.artRank = state => artsRank((state && state.arts) || 0);
  TL.artRankName = rank => artsRankName(rank, TL.lang === 'en' ? 'en' : 'zh');
}

/**
 * Life-cycle rules. The two birth draws, pacing, life stage and net worth are typed
 * (`src/model/lifecycle.ts`); `newLife` and `computeIncome` stay in the legacy state
 * module, which this entry chains.
 */
function installLifecycle(TL) {
  TL.PACES = PACES;
  TL.drawWealth = (nationId, raceId, random) => drawWealth(nationId, raceId, random || TL.rnd, {
    nation: id => TL.NATION_BY_ID[id],
    race: id => TL.RACE_BY_ID[id]
  });
  TL.drawArts = (nationId, raceId, random) => drawArts(nationId, raceId, random || TL.rnd, {
    nation: id => TL.NATION_BY_ID[id],
    race: id => {
      const race = TL.RACE_BY_ID[id];
      return {artMod: (race && race.mod && race.mod.art) || 0};
    }
  });
  /**
   * Nativity (`src/model/nativity.ts`). The draws stay here in their original order —
   * one uniform each for health, mood, knowledge and bonds, then two for the parents'
   * ages — while the arithmetic around them moved to the model.
   */
  const nativityPorts = {
    range: (low, high) => TL.range(low, high),
    clamp: (value, low, high) => TL.clamp(value, low, high)
  };
  TL.initialStats = (nationId, raceId, court, familyTier) => initialStats({
    nationMedical: TL.NATION_BY_ID[nationId].med,
    nationEducation: TL.NATION_BY_ID[nationId].edu,
    familyTier,
    raceModifiers: TL.RACE_BY_ID[raceId].mod || {},
    courtModifiers: (court && court.mod) || null
  }, nativityPorts);
  TL.parentAges = (familyTier) => parentAges(familyTier, nativityPorts);
  TL.stratumCode = stratum => stratumCode(stratum);
  TL.yearSecFor = state => yearlySeconds(
    state.paceKey, state.lt.e0, state.age, PACES, TL.playAge, TL.playAgeDeriv
  );
  TL.stage = state => lifeStage({
    age: state.age,
    serveLeft: state.serveLeft,
    school: !!state.school,
    retired: !!state.flags.retired
  });
  TL.STAGE_NAME = STAGE_NAME;
  TL.STAGE_NAME_EN = STAGE_NAME_EN;
  TL.stageName = stage => lifeStageName(stage, TL.lang === 'en' ? 'en' : 'zh');
  TL.netWorth = state => netWorth({
    money: state.money,
    homeValue: state.flags.homeValue,
    carValue: state.flags.carValue,
    rentals: state.flags.rentals,
    rentalValue: state.flags.rentalValue,
    debt: state.debt
  });
  initialize13(TL);
  /**
   * Narrative and effects (`src/model/narrative.ts`). Defined after the legacy chain so
   * they replace the two loops there; every module writes through these, so the rules
   * they encode — the default kind, the log cap, "a falsy delta writes nothing", and
   * money being the one unclamped value — now live in one typed place.
   */
  TL.narrate = (state, text, kind, extra) => {
    const entry = logEntry({age: state.age, year: state.year}, text, kind, extra || null);
    state.log.push(entry);
    if (logOverflows(state.log.length)) state.log.splice(0, logTrimStart());
    return entry;
  };
  TL.eff = (state, patch) => {
    const next = applyEffectPatch({
      hl: state.st.hl, h: state.st.h, so: state.st.so, sm: state.st.sm,
      money: state.money, arts: state.arts
    }, patch, TL.clamp);
    state.st.hl = next.hl;
    state.st.h = next.h;
    state.st.so = next.so;
    state.st.sm = next.sm;
    state.money = next.money;
    state.arts = next.arts;
    return patch;
  };
  TL.log = (state, text, kind, extra) => TL.narrate(state, text, kind || 'ev', extra);
  /**
   * Family (`src/model/family.ts`). A relative's job, the sibling count and each
   * sibling's shape; the draws stay here so the stream order is unchanged.
   */
  const familyPorts = {
    random: () => TL.rnd(),
    job: id => {
      const job = TL.JOBS[id];
      return job ? {section: job.sec, sex: job.sex ?? null} : null;
    },
    jobAvailable: (id, nation, race) => TL.jobAvailable(id, nation, race),
    chance: p => TL.chance(p)
  };
  TL.npcJobOf = (nationId, sex, raceId) => npcJob({nation: nationId, race: raceId, sex}, familyPorts);
  TL.ageJob = (nationId, sex, age, raceId) =>
    ageJob(age, {nation: nationId, race: raceId, sex}, familyPorts);
  TL.siblingCount = () => siblingCount(SIBLING_WEIGHTS, familyPorts.random);
  TL.siblingShape = () => siblingShape(familyPorts.random);
  TL.siblingOutOfRange = (offset, motherAge) => siblingOutOfRange(offset, motherAge);
  /**
   * Focus (`src/model/focus.ts`). The share normalisation and the "knowledge and arts
   * are not plain dimensions" rule live there; the shim applies the deltas, because the
   * two curved ones have to go through `knowAdd`/`artsAdd`.
   */
  TL.focusYear = state => {
    const {total, shares} = focusShares(state.fT || {});
    state.focusW = total > 0 ? {...shares} : {};
    if (total <= 0) return state.focusW;

    for (const key of Object.keys(state.fT)) {
      const focus = TL.FOCUS[key];
      if (!focus) continue;
      const share = shares[key] ?? 0;
      const outcome = focusOutcome(focus.e || {}, share);
      for (const {dimension, delta} of outcome.dimensions) {
        state.st[dimension] = TL.clamp((state.st[dimension] ?? 0) + delta, 0, 100);
      }
      if (outcome.knowledge) TL.knowAdd(state, outcome.knowledge);
      if (outcome.arts) TL.artsAdd(state, outcome.arts);
    }
    return state.focusW;
  };
}

/**
 * Schooling (`src/model/schooling.ts`). Only the gate and the two lookup tables moved:
 * the ladder's thresholds and chance formulas are rules, while `startSchool` also
 * writes the life and logs a line, so it stays in the legacy settlement.
 */
function installSchooling(TL) {
  TL.schoolDuration = level => schoolDuration(level);
  TL.eduTier = level => educationTier(level);
  TL.schoolGate = state => schoolGate(
    schoolSubject(state, TL.NATION_BY_ID[state.nation]),
    {random: () => TL.rnd()}
  );
}

/**
 * Birth (`src/model/birth.ts`). Only the probability and the two constants moved: the
 * eligibility guards are part of the probability (returning null before any formula),
 * so the caller still rolls in the same order — conception, sex, transmission, crystal.
 */
function installBirth(TL) {
  const ports = {
    // The registry spells them `urb` / `edu`; the model names what it means.
    nation: id => {
      const nation = TL.NATION_BY_ID[id] || {};
      return {urbanisation: nation.urb ?? 0, education: nation.edu ?? 0};
    },
    clamp: (value, low, high) => TL.clamp(value, low, high)
  };
  TL.birthChance = state => birthProbability(birthSubject(state), state.nation, ports);
  TL.birthSubject = state => birthSubject(state);
  TL.congenitalRisk = state => congenitalRisk(birthSubject(state));
  TL.congenitalOri = crystal => congenitalInfection(crystal);
  TL.SON_RATIO = SON_RATIO;
  TL.CONGENITAL_CHANCE = CONGENITAL_CHANCE;
}

/**
 * The three regressions (`src/model/regression.ts`). Each shim builds one subject from
 * the life, derives the target and writes the dimension back, which keeps the model
 * side-effect free while `endYear` keeps its ⑤⑥⑦ ordering — mood reads the health and
 * bond values that ⑤ and ⑥ have already written, so the order is load-bearing.
 */
function installRegression(TL) {
  TL.regressHealth = state => {
    const subject = regressionSubject(state);
    const target = healthTarget(subject, TL.expHealth(subject.age + 1));
    state.st.hl = regressHealth(subject.health, target, TL.clamp);
    return target;
  };
  TL.regressSocial = state => {
    const subject = regressionSubject(state);
    const target = socialTarget(subject);
    state.st.so = regressSocial(subject.social, target, subject.age, TL.clamp);
    return target;
  };
  TL.regressMood = state => {
    const subject = regressionSubject(state);
    const target = moodTarget(subject, TL.happyBase(state));
    state.st.h = regressMood(subject.happiness, target, TL.clamp);
    return target;
  };
}

/**
 * Income. The wage arithmetic and the percentile mapping are typed in
 * `src/model/income.ts`. The organisation sync has to run before the wage is read —
 * it can change the job and the pay grade — and the three writes stay here, so the
 * model never touches the life.
 */
function installIncome(TL) {
  const ports = {
    nation: id => TL.NATION_BY_ID[id],
    opPay: rank => TL.OP_RANKS[rank].pay,
    jobPayMultiplier: state => (TL.organizationPayMultiplier ? TL.organizationPayMultiplier(state) : 1),
    discrimination: state => TL.discrimination(state),
    clamp: (value, low, high) => TL.clamp(value, low, high)
  };
  const jobPayOf = id => {
    const job = TL.JOBS[id];
    return job ? {lo: job.lo, hi: job.hi, graded: Boolean(job.cls)} : null;
  };

  TL.computeIncome = state => {
    if (TL.syncOrganization) TL.syncOrganization(state);
    const income = monthlyIncome(state, incomeSubject(state, jobPayOf(state.job)), ports);
    state.income = income;
    // Rations are living support, never cash: they stay out of income and assets.
    state.subsistenceAnnual = TL.organizationSubsistence ? TL.organizationSubsistence(state) : 0;
    state.pct = incomePercentile(income, state.subsistenceAnnual, TL.clamp);
    return income;
  };
}

/**
 * Organizations. Status, pay, subsistence and the promotion/contact gates are typed
 * (`src/model/organization.ts`); the eight guarded transitions stay in the legacy
 * engine, which this entry chains.
 */
function installOrganization(TL) {
  const ports = {
    def: id => (id ? TL.organizationDef(id) : null),
    route: (id, route) => (id ? TL.organizationRouteDef(id, route) : null),
    employmentModel: name => {
      const models = TL.EMPLOYMENT_MODELS || {};
      return models[name] || models.contract || null;
    },
    nationPpp: nation => (TL.NATION_BY_ID[nation] || {}).ppp || 0,
    isWorking: state => TL.isWorking(state)
  };
  const modelOf = subject => ports.employmentModel((ports.def(subject.affiliation) || {}).employmentModel);
  const availability = (state, id) => ({
    working: TL.isWorking(state),
    available: TL.organizationAvailable(state, id),
    recruitment: TL.organizationState(state, id).recruitment
  });

  // 其余 legacy 代码仍在调用这两个查询，因此这里一并接上（纯查询，无副作用）。
  TL.organizationState = (state, id) => organizationStatus(ports.def(id), state && state.year);
  TL.organizationAvailable = (state, id) =>
    organizationAvailable(ports.def(id), state && state.year, state);
  TL.organizationSubject = state => organizationSubject(state);
  TL.organizationStatus = (def, year) => organizationStatus(def, year);
  TL.organizationPayMultiplier = state => {
    const subject = organizationSubject(state);
    return payMultiplier(subject, modelOf(subject), ports.def(subject.affiliation), availability(state, subject.affiliation));
  };
  TL.organizationUnpaid = state => {
    const subject = organizationSubject(state);
    return isUnpaid(subject, ports.def(subject.affiliation), availability(state, subject.affiliation));
  };
  TL.organizationSubsistence = state => {
    const subject = organizationSubject(state);
    return subsistence(subject, ports.def(subject.affiliation), availability(state, subject.affiliation),
      ports.nationPpp(subject.nation));
  };
  TL.organizationPromotionReady = state => promotionReady(
    organizationSubject(state),
    ports.route(state.affiliation, state.orgRoute),
    availability(state, state.affiliation)
  );
  TL.organizationContactEligible = (state, id, contact) => contactEligible(
    organizationSubject(state),
    id,
    contact,
    (state.orgContacts || {})[contact.id] || null,
    availability(state, id)
  );
  /**
   * Admission. The fourteen checks live in `src/model/admission.ts`; this shim only
   * supplies the content lookups and adds the three fields the `ok` payload carries
   * (the organization, its route and the interview spec). Only the decisions moved —
   * joining still writes the life in the legacy transition.
   */
  const admissionPorts = {
    def: id => TL.organizationDef(id) || null,
    route: (id, routeId) => TL.organizationRouteDef(id, routeId) || null,
    recruiting: (id, year) => Boolean(organizationStatus(TL.organizationDef(id) || null, year).recruitment),
    job: id => TL.JOBS[id] || null
  };
  TL.organizationAdmission = (state, id, routeId, transfer) => {
    const verdict = admissionVerdict(
      state, admissionSubject(state, id), {organization: id, route: routeId, transfer: Boolean(transfer)},
      admissionPorts
    );
    if (!verdict.ok) return {ok: false, code: verdict.code, reason: verdict.reason};
    return {
      ok: true,
      organization: id,
      route: routeId,
      interview: TL.organizationInterviewSpec(id, routeId)
    };
  };
  /**
   * Effect terms (`src/model/employment.ts`). The transitions still write the life and
   * log; what moved is the arithmetic they would otherwise interleave with those
   * writes — the pension, the cooldown, the job/rank resets and the contact ledger.
   * Applying the returned terms in one place is what makes their order checkable.
   */
  TL.leaveTerms = (state, id, reason, options) => {
    const opts = options || {};
    const policy = (TL.organizationEmploymentModel(id) || {}).retirement || null;
    const nation = TL.NATION_BY_ID[state.nation] || {};
    return leaveTerms({
      organization: id,
      reason,
      keepJob: Boolean(opts.keepJob),
      retirement: Boolean(opts.retirement),
      preserveOperatorRank: Boolean(opts.preserveOperatorRank),
      job: state.job,
      orgJob: state.orgJob,
      serviceYears: state.orgService || 0,
      rank: state.orgRank || 0,
      age: state.age,
      year: state.year,
      finalMonthlyPay: state.income,
      nationPpp: nation.ppp || 0,
      hasPension: Boolean(state.retirementPension)
    }, policy);
  };
  TL.promotionTerms = (state, id) => promotionTerms(state.orgRank || 0, id || state.affiliation);
  TL.contactRecord = (previous, contact, id, year) => contactRecord(
    previous || null, contact.name, id, year
  );
  /**
   * Membership decisions (`src/model/membership.ts`): why a membership ends, who may be
   * dismissed, who may be sent to labour, and when retirement is legal. The legacy
   * transitions apply the answer; the one-time schema migration stays with them.
   */
  TL.syncVerdict = state => {
    const id = state.affiliation;
    const def = (id && TL.organizationDef(id)) || null;
    const route = (id && TL.organizationRouteDef(id, state.orgRoute)) || null;
    return syncVerdict(state, membershipSubject(state), Boolean(def), Boolean(route), {
      available: (current, organization) => TL.organizationAvailable(current, organization),
      locationAllowed: (def && def.locationAllowed) || null,
      routeJobs: (route && route.jobs) || null,
      nations: (def && def.nations) || null,
      isWorking: current => TL.isWorking(current)
    });
  };
  TL.membershipDismissible = state =>
    dismissible(membershipSubject(state), Boolean(TL.isWorking(state)));
  TL.coercedLabourGuard = (state, job) => coercedLabourGuard(membershipSubject(state), job);
  TL.retirementGuard = state => retirementGuard(membershipSubject(state), state.job === 'retired');
  initialize18(TL);
}

/**
 * Decisions. The engine (open, choose, schedule) is flow and stays legacy; the
 * auto-mode score and the once/cooldown gate are typed rules.
 */
function installDecision(TL) {
  TL.pickAutoOption = (options, stats, money, random) => pickAutoOption(options, stats, money, random);
  TL.decisionMayFire = (schedule, lastSeen, age) => mayFire(schedule, lastSeen, age);
  initialize14(TL);
}

/**
 * Interviews. Only the scoring rule is typed (`src/model/interview.ts`); opening the
 * decision, recording history and walking the session are flow, and stay legacy.
 */
function installInterview(TL) {
  TL.evaluateOrganizationInterview = application => evaluateInterview(
    interviewSession(application && application.session),
    TL.INTERVIEW_AXES
  );
  TL.interviewQuestionAvailable = (state, question) => questionAvailable(question, state.year);
  /**
   * Deck selection (`src/model/interview-deck.ts`): which questions a session draws and
   * in what order. A short pool cancels the interview instead of padding it, and the two
   * groups are drawn in a fixed order so the random stream stays comparable.
   */
  TL.selectInterviewQuestions = (available, draw) =>
    selectInterviewQuestions(available, draw, () => TL.rnd());
  TL.prepareSessionQuestions = questions => prepareSessionQuestions(questions, () => TL.rnd());
  initialize21(TL);
}

/**
 * Yearly rules. The two growth curves, the happiness baseline and the annual cash
 * flow are typed (`src/model/yearly.ts`); the settlement orchestrator — timeline,
 * events, decisions — stays in `js/engine/year.js`, which this entry chains.
 *
 * The five shims keep the legacy mutation contract: `knowAdd`/`artsAdd` write back
 * onto `S.st.sm`/`S.arts`, and `finances` applies the same money/debt order and
 * returns the net instead of the whole budget.
 */
function installYearly(TL) {
  const ports = {
    nation: id => TL.NATION_BY_ID[id],
    race: id => {
      const race = TL.RACE_BY_ID[id];
      const mod = (race && race.mod) || {};
      return {knowledgeMod: mod.sm || 0, artsMod: mod.art || 0};
    },
    clamp: (value, low, high) => TL.clamp(value, low, high)
  };
  TL.knowCap = state => knowledgeCap(yearSubject(state), ports);
  TL.knowAdd = (state, amount) => {
    state.st.sm = addKnowledge(state.st.sm, amount, TL.knowCap(state), TL.clamp);
  };
  TL.artsAdd = (state, amount) => {
    state.arts = addArts(state.arts, amount, ports.race(state.race).artsMod, TL.clamp);
  };
  TL.happyBase = state => happinessBase(yearSubject(state), ports);
  TL.finances = state => {
    const support = TL.organizationSubsistence ? TL.organizationSubsistence(state) : 0;
    const budget = annualBudget(yearSubject(state), ports, support);
    state.money = budget.money;
    state.debt = budget.debt;
    return budget.net;
  };
  initialize22(TL);
}

/**
 * Oripathy. Stage bookkeeping, lifetime/annual risk and the social consequences are
 * typed in `src/model/oripathy.ts`; the two mutating steps (`infect`, the yearly
 * progression) stay in the legacy engine, which this entry chains.
 */
function installOripathy(TL) {
  const ports = {
    nation: id => TL.NATION_BY_ID[id],
    stratumRisk: id => TL.stratum(id).ori,
    raceRisk: id => {
      const race = TL.RACE_BY_ID[id];
      return race ? 0.65 + (race.ori || 1) * 0.42 : 1;
    },
    timelineMods: (id, year) => (TL.tlMods ? TL.tlMods(id, year) : {war: 0, cat: 0, ori: 0, tol: 0, mort: 1}),
    tolerance: (id, year) => TL.tolInfo(id, year),
    toleranceValue: (id, year) => TL.tolOf(id, year),
    discrimination: state => TL.discrimination(state),
    opRankNeed: rank => TL.OP_RANKS[rank].need,
    clamp: (value, low, high) => TL.clamp(value, low, high)
  };
  TL.ORI_STAGES = ORI_STAGES;
  TL.oriStageOf = crystal => oriStageOf(crystal);
  TL.oriStageName = stage => oriStageName(stage, TL.lang === 'en' ? 'en' : 'zh');
  // The lifetime risk is drawn once and cached on the life, as before.
  TL.oriLifetimeP = state => {
    if (state.flags.oriP != null) return state.flags.oriP;
    const p = lifetimeProbability(subjectFromOripathyState(state), ports);
    state.flags.oriP = p;
    return p;
  };
  // The lifetime risk must be drawn (and cached on the life) even when only the
  // annual risk is asked for; the cache is part of the observable state.
  TL.oriRisk = state => {
    TL.oriLifetimeP(state);
    return oriAnnualRisk(subjectFromOripathyState(state), TL.LT(state), ports);
  };
  TL.oriStigma = state => oriStigma(subjectFromOripathyState(state), ports);
  TL.totalDiscrimination = state => oriTotalDiscrimination(state, subjectFromOripathyState(state), ports);
  TL.reunionLean = state => oriReunionLean(state, subjectFromOripathyState(state), ports);
  TL.combatValue = state => oriCombatValue(subjectFromOripathyState(state), ports);
  TL.treatAccess = state => oriTreatmentAccess(subjectFromOripathyState(state), ports);
  // 年度推进的算术：成长倍率、治疗抑制与治疗费；写状态的部分留在 oriYear。
  TL.crystalGrowth = state => crystalGrowth(subjectFromOripathyState(state), ports);
  TL.treatmentSuppression = provider => oriTreatmentSuppression(provider);
  TL.treatmentCost = (ppp, provider) => oriTreatmentCost(ppp, provider);
  initialize12(TL);
}

/**
 * Death risk and cause selection. Every entry point normalises the life once via
 * `subjectFromState`, so the untyped object is read in exactly one place; the ports
 * below are the content lookups the model is not allowed to own.
 */
function installMortality(TL) {
  const ports = {
    nation: id => TL.NATION_BY_ID[id],
    causeTable: (region, index) => ((TL.CT && TL.CT[region]) || [])[index] || {},
    timelineMods: (id, year) => (TL.tlMods ? TL.tlMods(id, year) : {war: 0, cat: 0, ori: 0, tol: 0, mort: 1}),
    tolerance: (id, year) => TL.tolInfo(id, year),
    jobRisk: job => (TL.JOBS[job] || {}).risk,
    discrimination: state => TL.discrimination(state),
    pickWeighted: weights => TL.wpick(weights),
    clamp: (value, low, high) => TL.clamp(value, low, high),
    causes: CAUSES,
    incomeGradient: region => TL.MORT_G[region]
  };
  TL.deathProb = state => deathRisk({
    subject: subjectFromState(state),
    table: TL.LT(state),
    ports,
    state
  });
  TL.causeWeights = (state, age, other) => causeWeights(subjectFromState(state), age, !!other, ports);
  TL.residualCauseWeights = (state, age) => residualCauseWeights(subjectFromState(state), age, ports);
  TL.expandResidualCauseWeights = (weights, state, age) =>
    expandResidualWeights(weights, subjectFromState(state), age, ports);
  TL.pickCause = (state, age, other) => pickCause(subjectFromState(state), age, !!other, ports);
  TL.lifeTableFor = TL.lifeTable;
}

/**
 * Locale installer. The tables live in `src/content/locales.ts` and the lookup
 * logic in `src/model/locale.ts`; neither touches the DOM or storage. Persisting
 * the choice and setting `<html lang>` belong to the application layer (js/main.js),
 * which is where the old region script did it.
 */
function installRegion(TL) {
  TL.LOCALES = LOCALES;
  TL.LOCALE_LIST = LOCALE_LIST;
  TL.LANG = LANG;
  TL.lang = 'zh';
  TL.locale = LOCALES.CN;
  TL.T = LANG.zh;

  TL.detectLocale = () => {
    let timeZone = '';
    try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (error) { timeZone = ''; }
    let languages = [];
    try {
      languages = navigator.languages && navigator.languages.length
        ? Array.prototype.slice.call(navigator.languages)
        : [navigator.language || ''];
    } catch (error) { languages = []; }
    return detectLocaleId({timeZone, languages, locales: LOCALES});
  };

  TL.initLocale = (urlRegion, savedRegion) => {
    let id = null;
    if (urlRegion && LOCALES[String(urlRegion).toUpperCase()]) id = String(urlRegion).toUpperCase();
    if (!id && savedRegion && LOCALES[savedRegion]) id = savedRegion;
    if (!id) id = TL.detectLocale();
    return TL.setLocale(id);
  };

  TL.setLocale = id => {
    const region = LOCALES[id] || LOCALES.CN;
    TL.locale = region;
    TL.lang = LANG[region.lang] ? region.lang : 'zh';
    TL.T = LANG[TL.lang] || LANG.zh;
    return region;
  };

  TL.t = (key, vars) => pickString(key, vars, TL.T, LANG.zh);
  TL.nameOf = record => nameOf(record, TL.lang === 'en' ? 'en' : 'zh');
  TL.shortOf = record => shortOf(record, TL.lang === 'en' ? 'en' : 'zh');
  TL.descOf = record => descOf(record, TL.lang === 'en' ? 'en' : 'zh');
  TL.money = value => toLocalMoney(value, TL.locale || LOCALES.CN);
  TL.moneyStr = value => moneyText(value, TL.locale || LOCALES.CN, TL.lang === 'en' ? 'en' : 'zh');
  TL.priceNote = () => priceNoteText(TL.locale || LOCALES.CN, TL.lang === 'en' ? 'en' : 'zh');
}

/**
 * Sampling installer. The math lives in `src/model/sampling.ts`; every draw helper
 * is bound to the runtime's seeded generator so the stream order is unchanged.
 */
function installSampling(TL) {
  TL.clamp = (value, low, high) => clamp(value, low, high);
  TL.lerp = (from, to, t) => lerp(from, to, t);
  TL.normCdf = z => normCdf(z);
  TL.invNorm = p => invNorm(p);
  TL.piecewise = (points, x) => piecewise(points, x);
  TL.chance = p => chance(p, () => TL.rnd());
  TL.range = (low, high) => range(low, high, () => TL.rnd());
  TL.irange = (low, high) => irange(low, high, () => TL.rnd());
  TL.pick = items => pick(items, () => TL.rnd());
  TL.wpick = weights => wpick(weights, () => TL.rnd());
  TL.wpickArr = (items, key) => wpickArr(items, key || 'w', () => TL.rnd());
}

/**
 * Text installer. Template resolution, formatting and the label tables live in
 * `src/model/text.ts`; this only binds them to the runtime's language and
 * dictionary, which stay mutable because a region switch swaps the dictionary.
 */
function installText(TL) {
  TL.I18N = null;
  TL.L = (strings, ...values) => template(strings, values, TL.I18N ?? null);
  TL.Lmissing = () => missingEntries();
  TL.fmt = TL.fmt || {};
  TL.fmt.num = (value, decimals) => formatNumber(value, decimals ?? 1);
  TL.fmt.pct = (value, decimals) => formatPercent(value, decimals ?? 1);
  TL.fmt.money = value => formatMoney(value);
  TL.EDU_NAME = EDU_NAME;
  TL.EDU_NAME_EN = EDU_NAME_EN;
  TL.eduName = level => educationName(level, TL.lang === 'en' ? 'en' : 'zh');
  TL.STAT_DEF = STAT_DEF;
  TL.statWord = (key, value) => statWord(key, value, TL.lang === 'en' ? 'en' : 'zh');
  TL.bar = (value, width) => barText(value, width || 10);
  TL.ageWord = age => ageWord(age);
}

/**
 * Cohort installer. The computation lives in `src/model/cohort.ts`; this adapter
 * only hands it the runtime's random source and content lookups, keeping the
 * manifest entry in the same shape as every other initializer.
 */
function installCohort(TL) {
  TL.drawDeathAge = (table, random) => drawDeathAge(table, random);
  TL.makeCohort = state => {
    state.cohort = buildCohort(state, state.lt, {
      random: () => TL.rnd(),
      peerRaces: life => TL.NATION_BY_ID[life.nation].race,
      makeName: (nation, sex, race) => TL.makeName(nation, sex, race)
    });
    return state.cohort;
  };
  TL.cohortAliveAt = (state, age) => (state.cohort ? cohortAliveAt(state.cohort.deaths, age) : 1);
  TL.peersAlive = (state, age) =>
    (state.cohort ? state.cohort.peers.filter(peer => peer.deathAt >= age) : []);
}

// Runtime assembly manifest. Keep this order explicit while the legacy
// initializers still share one mutable compatibility surface.
const INITIALIZERS = [
  { id: 'rng', requires: ['kernel'], install: installSampling },
  { id: 'text', requires: ['rng'], install: installText },
  { id: 'region', requires: ['text'], install: installRegion },
  { id: 'nations', requires: ['region'], install: initialize3 },
  { id: 'races', requires: ['nations'], install: initialize4 },
  { id: 'jobs', requires: ['races'], install: initialize5 },
  { id: 'names', requires: ['nations', 'races'], install: initialize6 },
  { id: 'baseline', requires: ['nations'], install: initialize7 },
  { id: 'focus', requires: ['jobs'], install: initialize8 },
  { id: 'organizations', requires: ['jobs', 'nations'], install: initialize9 },
  { id: 'lifetable', requires: ['nations', 'races'], install: installLifeTable },
  { id: 'mortality', requires: ['lifetable'], install: installMortality },
  // 同期群只用于展示，但它的抽样顺序会消耗随机流，所以由类型化模型模块实现，
  // 这里按原顺序装配：先 600 个曲线样本，再 6 个具名同伴。
  { id: 'cohort', requires: ['nations', 'races'], install: installCohort },
  { id: 'oripathy', requires: ['nations', 'races', 'lifetable'], install: installOripathy },
  { id: 'state', requires: ['organizations', 'lifetable', 'cohort'], install: installLifecycle },
  { id: 'income', requires: ['state'], install: installIncome },
  { id: 'regression', requires: ['income', 'lifetable'], install: installRegression },
  { id: 'decision', requires: ['state', 'focus'], install: installDecision },
  { id: 'timeline', requires: ['organizations', 'nations'], install: initialize15 },
  { id: 'events', requires: ['state', 'timeline', 'organizations'], install: initialize16 },
  { id: 'decisions', requires: ['decision', 'organizations'], install: initialize17 },
  { id: 'organization', requires: ['organizations', 'state', 'decision'], install: installOrganization },
  { id: 'organization-events', requires: ['organization', 'events'], install: initialize19 },
  { id: 'interviews', requires: ['organizations', 'decisions'], install: initialize20 },
  { id: 'interview', requires: ['interviews', 'organization'], install: installInterview },
  { id: 'year', requires: ['events', 'organization', 'interview'], install: installYearly },
  { id: 'schooling', requires: ['year', 'nations'], install: installSchooling },
  { id: 'birth', requires: ['year', 'nations'], install: installBirth },
  { id: 'provenance', requires: ['organizations', 'timeline', 'events'], install: initialize23 }
];

export default function createLegacyRuntime() {
  const runtime = {};
  installKernel(runtime);
  const installed = new Set(['kernel']);
  const names = new Set();
  for (const item of INITIALIZERS) {
    if (names.has(item.id)) throw new Error(`Duplicate runtime initializer: ${item.id}`);
    for (const dependency of item.requires) {
      if (!installed.has(dependency)) throw new Error(`Runtime initializer ${item.id} requires ${dependency} first`);
    }
    item.install(runtime);
    names.add(item.id);
    installed.add(item.id);
  }
  const errors = validateRegistries(runtime);
  if (errors.length) throw new Error(`Core registry validation failed:\n${formatDiagnostics(errors)}`);

  const guards = createLifeGuards({
    organizations: runtime.ORGANIZATIONS,
    jobs: runtime.JOBS,
    nonWork: runtime.NONWORK
  });
  runtime.lifeGuards = guards;
  runtime.stateInvariantViolations = state => guards.violations(state);
  runtime.assertStateInvariants = state => guards.assert(state);

  // Declared state changes for content. The legacy primitives behind the ports
  // are unchanged, so migrating an event to effects is behaviour-preserving;
  // what changes is that the change becomes data and is validated as a whole.
  runtime.validateEffects = effects => validateEffects(effects);
  runtime.applyEffects = (state, effects) => applyEffects(effects, {
    attributes: deltas => runtime.eff(state, deltas),
    money: amount => { state.money += amount; },
    flag: (name, delta) => { state.flags[name] = (state.flags[name] || 0) + delta; },
    setFlag: (name, value) => { state.flags[name] = value; }
  });

  // Read-only projection for the UI: screens read facts from here instead of
  // re-deriving them from scattered fields. Content-owned derivations (arts rank)
  // arrive as adapters so the model layer stays free of content rules.
  runtime.deriveLifeView = state => deriveLifeView(state, {
    artsRank: life => runtime.artRank(life),
    netWorth: life => runtime.netWorth(life),
    cohortAliveAt: (life, age) => runtime.cohortAliveAt(life, age),
    stage: life => runtime.stage(life),
    focusOptions: life => runtime.focusOptions(life)
  });

  // Where the run loop is (phase, pending decision, pacing). The flow layer still
  // writes pause/speed, so this is read-only like every other view.
  runtime.deriveSessionView = state => deriveSessionView(state);

  // Content identity of the registered question packs: what a save records and
  // what a restore is compared against.
  runtime.interviewPackLocks = () => packLocks(runtime.INTERVIEW_PACK_SOURCES);

  // DLC packs enter through the same validator as core content; a rejected pack
  // leaves the registry untouched instead of half-registered.
  runtime.loadInterviewPacks = document =>
    loadInterviewPacks(document, pack => runtime.registerInterviewPack(pack));

  // Every organization/retirement entry point commits through the same guard, so
  // identity, membership and salary cannot drift apart one transition at a time.
  // The annual pipeline defers the organization exit to syncOrganization, which
  // makes two relations transient inside that one year; they are declared here
  // instead of being skipped wholesale.
  const DEFERRED_RETIREMENT = ['career.retired-retains-affiliation', 'identity.affiliation-requires-job'];
  for (const method of ['joinOrganization', 'leaveOrganization', 'syncOrganization', 'retire']) {
    const transition = runtime[method];
    if (typeof transition !== 'function') continue;
    runtime[method] = function (state, ...args) {
      // The first syncOrganization performs the legacy identity migration, so it
      // is exempt from the invariants describing the state it is migrating.
      if (method === 'syncOrganization' && state.orgSchema !== 1) {
        return transition.call(runtime, state, ...args);
      }
      const options = method === 'retire' && args[0]?.deferOrganizationExit
        ? { deferred: DEFERRED_RETIREMENT } : undefined;
      return guards.commit(method, state, () => transition.call(runtime, state, ...args), options);
    };
  }
  // The remaining domain transitions get the same treatment: infection, death,
  // losing a job and coerced labour each move the identity in one step, so a
  // broken post-state must be reported here instead of surfacing a year later.
  for (const method of ['infect', 'die', 'dismissFromJob', 'enterCoercedLabour']) {
    const transition = runtime[method];
    if (typeof transition !== 'function') continue;
    runtime[method] = function (state, ...args) {
      return guards.commit(method, state, () => transition.call(runtime, state, ...args));
    };
  }
  // ---- resumable life: one slot, written after each settled year ----------
  // The envelope is only produced at a committed boundary (the year's
  // settlement has finished), and only when a storage port can actually reach
  // a backend; otherwise the whole path is a no-op with zero JSON cost.
  runtime.saveProgress = function (state) {
    if (!state || state.phase !== 'life') return { saved: false, reason: 'phase' };
    if (!runtime.lifeStore || !runtime.lifeStore.available()) return { saved: false, reason: 'unavailable' };
    try {
      const envelope = serializeLife(state, {
        rulesetVersion: RULESET_VERSION,
        contentLock: { coreVersion: CORE_VERSION, packages: runtime.interviewPackLocks() },
        createdAt: new Date().toISOString(),
        random: runtime.randomSnapshot()
      });
      return runtime.lifeStore.writeResumable(envelope);
    } catch (error) {
      // A state that cannot be serialized must not break the year: keep playing
      // and report it, rather than half-writing a slot.
      console.error('[save]', error);
      return { saved: false, reason: 'serialize' };
    }
  };
  runtime.loadProgress = function () {
    if (!runtime.lifeStore || !runtime.lifeStore.available()) return null;
    const stored = runtime.lifeStore.readResumable();
    if (!stored) return null;
    try {
      const state = restoreLife(runtime, stored, {
        expectedRulesetVersion: RULESET_VERSION,
        expectedCoreVersion: CORE_VERSION,
        packages: runtime.interviewPackLocks()
      });
      runtime.S = state;
      return state;
    } catch (error) {
      console.error('[resume]', error);
      return null;
    }
  };
  runtime.hasProgress = () =>
    !!(runtime.lifeStore && runtime.lifeStore.available() && runtime.lifeStore.readResumable());

  // Autosave hangs off the two places a life state stops being "in the middle of
  // a year": a completed year settlement, and death. Anything else is a
  // half-committed year and must not be written.
  const endYear = runtime.endYear;
  runtime.endYear = function (state) {
    const result = endYear.call(runtime, state);
    if (!runtime.lifeStore || !runtime.lifeStore.available()) return result;
    if (state.phase === 'life') runtime.saveProgress(state);
    else runtime.lifeStore.clearResumable();
    return result;
  };
  const die = runtime.die;
  if (typeof die === 'function') {
    runtime.die = function (state, ...args) {
      const result = die.call(runtime, state, ...args);
      if (runtime.lifeStore && runtime.lifeStore.available()) runtime.lifeStore.clearResumable();
      return result;
    };
  }
  const newLife = runtime.newLife;
  runtime.newLife = function (options) {
    // A life without a concrete seed cannot be reproduced, so it cannot be
    // resumed either. "Random" means "a seed was picked for you", not "no seed".
    const opts = options && typeof options === 'object' ? { ...options } : {};
    if (opts.seed == null) opts.seed = Math.floor(Math.random() * 0x100000000) >>> 0;
    // A new life replaces the slot instead of leaving a stale "continue" offer.
    if (runtime.lifeStore && runtime.lifeStore.available()) runtime.lifeStore.clearResumable();
    return newLife.call(runtime, opts);
  };

  return runtime;
}
