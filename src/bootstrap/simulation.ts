import createLegacyRuntime from '../legacy/create-runtime';
import type { LegacySimulation } from '../legacy/runtime-types';
import { createStoragePort } from '../platform/storage';
import type { StorageLike } from '../platform/storage';

export interface SimulationOptions {
  /** Lazily resolved storage; omit for a runtime without persistence. */
  readonly storage?: () => StorageLike | null | undefined;
}

export { createStoragePort, COMPLETED_LIVES_KEY, RESUMABLE_LIFE_KEY } from '../platform/storage';
export type { StoragePort, StorageLike, CompletedLifeInput, WriteOutcome } from '../platform/storage';
export { createRandom } from '../kernel/random';
export { createEventEngine } from '../kernel/events';
export {
  assertStateInvariants, stateInvariantViolations, formatViolations, StateInvariantError
} from '../model/state-invariants';
export { createLifeGuards } from '../model/transitions';
export { applyEffects, validateEffects, formatEffectDiagnostics, EffectError } from '../model/effects';
export { validateRegistries, formatDiagnostics } from '../content/registry-validation';
export { packLock, packLocks, packProjection, digest } from '../content/pack-lock';
export type { PackLock } from '../content/pack-lock';
  export { deriveSessionView } from '../model/session-view';
  export { LANG, LOCALE_LIST, LOCALES } from '../content/locales';
  export {
    descOf, detectLocaleId, moneyText, nameOf, pickString, priceNoteText, shortOf, toLocalMoney
  } from '../model/locale';
  export { buildCohort, cohortAliveAt, drawDeathAge } from '../model/cohort';
  export { createLifeTableBuilder, expHealth, playAge, playAgeDeriv } from '../model/life-table';
  export { CAUSES } from '../content/causes';
  export {
    artsRank, artsRankName, band, causeName, oripathyMultiplier, povertyWeights, raceMultiplier, tiesMultiplier
  } from '../model/mortality';
  export { causeWeights, deathRisk, pickCause, subjectFromState } from '../model/death-risk';
  export { evaluateInterview, interviewSession, questionAvailable } from '../model/interview';
  export { autoScore, mayFire, pickAutoOption } from '../model/decision';
  export {
    drawArts, drawWealth, lifeStage, lifeStageName, netWorth, PACES, STAGE_NAME, STAGE_NAME_EN, yearlySeconds
  } from '../model/lifecycle';
  export {
    addArts, addKnowledge, annualBudget, happinessBase, knowledgeCap, yearSubject
  } from '../model/yearly';
  export type { Budget, YearPorts, YearSubject } from '../model/yearly';
  export { applyEffectPatch, logEntry, logOverflows, logTrimStart } from '../model/narrative';
  export type { EffectPatch, EffectValues, LogContext, LogEntry, LogKind } from '../model/narrative';
  export { DIMENSION_ORDER, LOG_CAP, LOG_TRIM } from '../model/narrative';
  export {
    ageJob, npcJob, siblingCount, siblingOutOfRange, siblingShape,
    NPC_POOL, SIBLING_WEIGHTS, MILITARY_REJECT, ARTS_REJECT, NPC_JOB_ATTEMPTS
  } from '../model/family';
  export type { AgeJobPorts, NpcJobPorts, NpcJobSubject, SiblingShape } from '../model/family';
  export {
    focusOutcome, focusShares, CURVED_EFFECTS
  } from '../model/focus';
  export type { FocusEffects, FocusOutcome, FocusShares, FocusDelta } from '../model/focus';
  export {
    prepareSessionQuestions, selectInterviewQuestions, shuffleDeck, shuffleOptions, DECK_ORDER
  } from '../model/interview-deck';
  export type { DeckDraw, DeckKind, DeckQuestion, DeckSelection } from '../model/interview-deck';
  export {
    initialStats, parentAges, stratumCode
  } from '../model/nativity';
  export type { NativityPorts, NativitySubject, ParentAges, RaceModifiers, StartingStats } from '../model/nativity';
  export { incomePercentile, incomeSubject, monthlyIncome } from '../model/income';
  export type { IncomePorts, IncomeSubject, JobPay } from '../model/income';
  export {
    healthTarget, moodTarget, regressHealth, regressMood, regressSocial, regressionSubject, socialTarget,
    BOND_RATE, BOND_RATE_ADULT, BOND_DECLINE, HEALTH_RATE, MOOD_RATE
  } from '../model/regression';
  export type { RegressionSubject } from '../model/regression';
  export {
    educationTier, schoolChance, schoolDuration, schoolGate, schoolSubject,
    SCHOOL_DURATION, SCHOOL_TIER
  } from '../model/schooling';
  export type { SchoolPorts, SchoolSubject } from '../model/schooling';
  export {
    birthProbability, birthSubject, congenitalInfection, congenitalRisk, fertilityRate,
    BIRTH_BASE, BIRTH_CAP, CONGENITAL_CHANCE, FERTILITY_SPAN, IDEAL_MOTHER_AGE, SON_RATIO, SPACING_WEIGHT
  } from '../model/birth';
  export type { BirthPorts, BirthSubject, CongenitalInfection } from '../model/birth';
  export { admissionSubject, admissionVerdict } from '../model/admission';
  export type {
    AdmissionCode, AdmissionDef, AdmissionPorts, AdmissionRoute, AdmissionSubject, AdmissionTarget, AdmissionVerdict
  } from '../model/admission';
  export { contactRecord, leaveTerms, pensionTerms, promotionTerms } from '../model/employment';
  export type {
    ContactRecord, LeaveSubject, LeaveTerms, PensionTerms, PromotionTerms, RetirementPolicy
  } from '../model/employment';
  export {
    LEAVE_COOLDOWN_YEARS, REJECTION_COOLDOWN_YEARS, WAITLIST_COOLDOWN_YEARS
  } from '../model/employment';
  export {
    coercedLabourGuard, dismissible, membershipSubject, retirementGuard, syncVerdict,
    COERCED_LABOUR_JOBS, RETIREMENT_AGE
  } from '../model/membership';
  export type {
    CoercedLabourVerdict, LeaveOptions, MembershipPorts, MembershipSubject, RetirementVerdict, SyncVerdict
  } from '../model/membership';
  export {
    contactEligible, isUnpaid, organizationAvailable, organizationStatus, organizationSubject,
    payMultiplier, promotionReady, subsistence
  } from '../model/organization';
  export { ORI_STAGES } from '../content/oripathy';
  export {
    annualFrom, annualRisk, combatValue, crystalGrowth, lifetimeProbability, reunionLean, stageName, stageOf,
    stigma, totalDiscrimination, treatmentAccess, treatmentCost, treatmentSuppression,
    TREATMENT_SUPPRESSION
  } from '../model/oripathy';
  export { subjectFromState as subjectFromOripathyState } from '../model/oripathy';
  export {
    chance, clamp, invNorm, irange, lerp, normCdf, pick, piecewise, range, wpick, wpickArr
  } from '../model/sampling';
  export {
    ageWord, barText, educationName, formatMoney, formatNumber, formatPercent,
    joinTemplate, missingEntries, statWord, template
  } from '../model/text';
  export type { Cohort, CohortPeer, SurvivalTable } from '../model/cohort';
  export type { SessionView } from '../model/session-view';
export { loadInterviewPacks, packDocumentEntries } from '../content/pack-loader';
export type { PackLoadResult } from '../content/pack-loader';
export { deriveLifeView } from '../model/life-view';
export {
  SAVE_FORMAT, SAVE_ENVELOPE_VERSION, SaveEnvelopeError, SaveSerializationError,
  serializeLife, migrateLifeEnvelope, validateLifeEnvelope, restoreLife,
  parseCompletedLifeRecords, ENVELOPE_MIGRATIONS, RULESET_VERSION, CORE_VERSION
} from '../model/save-envelope';
export type { LifeView, AnnualObservation, MembershipObservation } from '../model/life-view';
export type {
  LifeSaveEnvelope, SaveContext, SaveDiagnostic, ContentLock, CompletedLifeSummary
} from '../model/save-envelope';
export type { Violation, ViolationCode } from '../model/state-invariants';
export type { Effect, EffectPorts, EffectDiagnostic, AttributeKey } from '../model/effects';
export type { ContentDiagnostic } from '../content/registry-validation';
export type { LegacySimulation, LegacyLife, LifeOptions } from '../legacy/runtime-types';

const REQUIRED_METHODS = [
  'newLife', 'tick', 'endYear', 'autoFocus', 'autoChoose', 'computeIncome',
  'joinOrganization', 'leaveOrganization', 'syncOrganization', 'retire',
  'infect', 'oriYear', 'deathProb', 'causeWeights',
  'applyEffects', 'validateEffects', 'canBeDismissed', 'enterCoercedLabour'
] as const;

function assertRuntimeReady(runtime: LegacySimulation): void {
  const surface = runtime as unknown as Record<string, unknown>;
  const missing: string[] = [...REQUIRED_METHODS.filter(name => typeof surface[name] !== 'function')];
  for (const name of ['NATIONS', 'RACES', 'JOBS', 'ORGANIZATIONS', 'TIMELINE', 'EVMAP', 'CONTENT_PROVENANCE']) {
    if (!surface[name]) missing.push(name);
  }
  if (missing.length) throw new Error(`Simulation startup check failed; missing: ${missing.join(', ')}`);
}

/**
 * One runtime per life/session. The returned TL compatibility surface is temporary;
 * each call owns its content maps, mutable state and random generator.
 *
 * `storage` is a getter rather than a storage object so the read happens at call
 * time: touching `window.localStorage` eagerly throws in privacy-mode frames.
 */
export function createSimulation(options: SimulationOptions = {}): LegacySimulation {
  // The legacy assembly is untyped JS whose shape is verified at runtime below.
  const runtime = createLegacyRuntime() as unknown as LegacySimulation;
  assertRuntimeReady(runtime);
  runtime.lifeStore = createStoragePort(options.storage ?? (() => null));
  return runtime;
}
