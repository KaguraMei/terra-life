/**
 * Effect terms: what a transition *would* do, as data.
 *
 * The organization transitions (`join`, `leave`, `retire`, `promote`) are guarded
 * mutations that stay in the legacy engine, and that is correct — they write a dozen
 * fields, log to the timeline and recompute income. But most of their arithmetic is
 * answerable up front, and today that arithmetic is interleaved with the writes:
 *
 *   - the pension is built from the last monthly pay, a replacement rate and a floor
 *     tied to the nation's price level;
 *   - leaving resets some fields, keeps others, and sets a three-year cooldown;
 *   - a promotion moves one rank and mirrors the operator grade for Rhodes Island.
 *
 * Keeping the *order* inside a function body is what makes those transitions hard to
 * touch: swap two lines and an unwritten field silently changes the result (pension
 * computed after the job was cleared uses the unemployment wage). So each term is
 * returned as a record here, and the legacy transition applies the fields in one place.
 *
 * Ordering is part of the contract and is spelled out per function.
 */

/** A retirement policy, taken from the employment model. */
export interface RetirementPolicy {
  readonly minServiceYears?: number;
  readonly replacementRate?: number;
  readonly minimumMonthlyRate?: number;
}

export interface PensionTerms {
  readonly serviceYears: number;
  readonly rank: number;
  readonly retiredAt: number;
  readonly finalMonthlyPay: number;
  readonly replacementRate: number;
  readonly minimumMonthlyAmount: number;
  readonly monthlyAmount: number;
}

/** The cooldown after leaving: three years, in every path that ends a contract. */
export const LEAVE_COOLDOWN_YEARS = 3;
/** Waiting list answers are cheaper than a rejection: one year instead of three. */
export const WAITLIST_COOLDOWN_YEARS = 1;
export const REJECTION_COOLDOWN_YEARS = 3;

/**
 * The pension a departure earns, or null when it earns none.
 *
 * **Order matters**: `finalMonthlyPay` is the pay *before* the departure clears the
 * job, and the floor is a national price-level amount, not a fraction of the pay. A
 * household can therefore retire on more than it earned last month (when the floor
 * binds) but never on less than the floor.
 */
export function pensionTerms(
  finalMonthlyPay: number,
  serviceYears: number,
  rank: number,
  retiredAt: number,
  policy: RetirementPolicy | null,
  nationPpp: number
): PensionTerms | null {
  if (!policy) return null;
  // The original compares against the policy's minimum directly, so a model without
  // one earns nothing; the registry validator rejects such content, and mirroring the
  // comparison keeps a malformed model from quietly granting a pension.
  if (policy.minServiceYears == null || !(serviceYears >= policy.minServiceYears)) return null;

  const pay = Math.max(0, Number.isFinite(finalMonthlyPay) ? finalMonthlyPay : 0);
  const replacementRate = policy.replacementRate ?? 0;
  const minimumMonthlyRate = policy.minimumMonthlyRate ?? 0;
  const minimumMonthlyAmount = nationPpp * minimumMonthlyRate;

  return {
    serviceYears,
    rank,
    retiredAt,
    finalMonthlyPay: pay,
    replacementRate,
    minimumMonthlyAmount,
    monthlyAmount: Math.max(pay * replacementRate, minimumMonthlyAmount)
  };
}

export type LeaveReasonKind = 'plain' | 'retirement';

export interface LeaveSubject {
  readonly organization: string;
  readonly reason: string;
  readonly keepJob: boolean;
  /** True for a retirement departure; unrelated to the free-text reason. */
  readonly retirement: boolean;
  /** Rhodes Island keeps the operator grade when the departure is a retirement. */
  readonly preserveOperatorRank: boolean;
  /** The life's job at the moment of departure, before anything is cleared. */
  readonly job: string;
  /** The job the organization had on record. */
  readonly orgJob: string;
  readonly serviceYears: number;
  readonly rank: number;
  readonly age: number;
  readonly year: number;
  readonly finalMonthlyPay: number;
  readonly nationPpp: number;
  readonly hasPension: boolean;
}

export interface LeaveTerms {
  /** A pension to create, or null when none is due. */
  readonly pension: PensionTerms | null;
  /** `orgCooldowns[organization] = cooldownYear`. */
  readonly cooldownYear: number;
  /** True when the departure restores the job to `seeking` (only when it matches). */
  readonly resetsJob: boolean;
  /** True when the operator class/rank must be cleared (Rhodes Island only). */
  readonly clearsOperatorRank: boolean;
  readonly keepsJob: boolean;
}

/**
 * Everything a departure needs, decided before a single field is written.
 *
 * The pension is only built when the departure *is* a retirement and the life has no
 * pension yet — otherwise a second departure would overwrite a pension that may since
 * have been suspended and resumed, and the amount must stay the one fixed on retirement.
 */
export function leaveTerms(subject: LeaveSubject, policy: RetirementPolicy | null): LeaveTerms {
  const isRetirement = subject.retirement || subject.reason === '退休';
  const pension = isRetirement && !subject.hasPension
    ? pensionTerms(subject.finalMonthlyPay, subject.serviceYears, subject.rank, subject.age, policy, subject.nationPpp)
    : null;

  return {
    pension,
    cooldownYear: subject.year + LEAVE_COOLDOWN_YEARS,
    resetsJob: !subject.keepJob && subject.job === subject.orgJob,
    clearsOperatorRank: subject.organization === 'rhodes' && !subject.preserveOperatorRank,
    keepsJob: subject.keepJob
  };
}

export interface PromotionTerms {
  readonly rank: number;
  /** Rhodes Island mirrors the organization rank into the operator grade. */
  readonly mirrorsOperatorRank: boolean;
}

/** A promotion moves exactly one rank, and only pays the operator grade at Rhodes. */
export function promotionTerms(currentRank: number, organization: string): PromotionTerms {
  const rank = currentRank + 1;
  return {rank, mirrorsOperatorRank: organization === 'rhodes'};
}

export interface ContactRecord {
  readonly name: string;
  readonly organization: string;
  readonly firstYear: number;
  readonly lastYear: number;
  readonly count: number;
}

/** A contact ledger entry: the first year is preserved, the rest advance. */
export function contactRecord(
  previous: ContactRecord | null, name: string, organization: string, year: number
): ContactRecord {
  return {
    name,
    organization,
    firstYear: previous ? previous.firstYear : year,
    lastYear: year,
    count: (previous ? previous.count : 0) + 1
  };
}
