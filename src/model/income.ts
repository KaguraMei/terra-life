/**
 * Income: the monthly figure the whole economy hangs on.
 *
 * `computeIncome` used to live in `state.js` and did four things at once — sync the
 * organisation, derive a base wage, apply the discrimination and family-inertia
 * factors, then map the result onto a continent-wide percentile. Only the arithmetic
 * belongs here. The organisation sync stays in the shim because `syncOrganization`
 * can itself change the job and the pay grade, and the three state writes stay there
 * too, so this module is a pure function of the life plus its ports.
 *
 * The percentile anchors are empirical, not theoretical: the first version used
 * `log(income/0.35)/log(8)`, which pinned every income above 2.8 to 100% and made the
 * top of the scale carry no information. The anchors below come from the simulated
 * distribution (P10≈0.17 / P50≈0.5 / P90≈4.9 / max≈9.3) with headroom on both ends,
 * which puts the median near 42%.
 */

export interface IncomeSubject {
  readonly nation: string;
  readonly job: string;
  readonly age: number;
  readonly eduLevel: number;
  readonly knowledge: number;
  readonly familyTier: number;
  readonly opRank: number;
  readonly oriStage: number;
  /** The locked pension of a retired life, already net of every factor. */
  readonly pensionAmount: number | null;
  /** True when the career is graded (`J.cls`) and the operator rank therefore pays. */
  readonly graded: boolean;
  /** True when the job id resolved to a registry entry at all. */
  readonly hasJob: boolean;
  /** Wages as multiples of the nation's output level, before any modifier. */
  readonly jobLo: number;
  readonly jobHi: number;
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

export interface JobPay {
  readonly lo: number;
  readonly hi: number;
  readonly graded: boolean;
}

export function incomeSubject(state: unknown, job: JobPay | null): IncomeSubject {
  const life = record(state) ?? {};
  const stats = record(life.st) ?? {};
  const ori = record(life.ori);
  const pension = record(life.retirementPension);
  const locked = life.job === 'retired' && pension ? num(pension.monthlyAmount, Number.NaN) : Number.NaN;

  return {
    nation: text(life.nation),
    job: text(life.job),
    age: num(life.age),
    eduLevel: num(life.eduLevel),
    knowledge: num(stats.sm),
    familyTier: num(life.q),
    opRank: num(life.opRank),
    oriStage: num(ori && ori.stage),
    pensionAmount: Number.isFinite(locked) ? Math.max(0, locked) : null,
    graded: Boolean(job && job.graded),
    hasJob: job !== null,
    jobLo: job ? job.lo : 0,
    jobHi: job ? job.hi : 0
  };
}

export interface IncomePorts {
  readonly nation: (id: string) => {readonly ppp: number};
  readonly opPay: (rank: number) => number;
  readonly jobPayMultiplier: (state: unknown) => number;
  readonly discrimination: (state: unknown) => number;
  readonly clamp: (value: number, low: number, high: number) => number;
}

/**
 * Monthly wage, mirroring the original branch order.
 *
 * A locked pension wins outright: it was computed when the life retired and already
 * contains the grade, the discrimination and the family factors, so applying them
 * twice would quietly cut a retiree's income. Everything else falls through to the
 * discrimination and family-inertia factors.
 */
export function monthlyIncome(state: unknown, subject: IncomeSubject, ports: IncomePorts): number {
  const nation = ports.nation(subject.nation);
  let base: number;

  if (subject.hasJob) {
    // The wage band is interpolated by schooling, experience and knowledge.
    const experience = ports.clamp((subject.age - 18) / 30, 0, 1);
    const schooling = ports.clamp(subject.eduLevel / 4, 0, 1);
    const t = ports.clamp(
      0.35 * schooling + 0.45 * experience + 0.20 * (subject.knowledge / 100), 0, 1
    );
    base = nation.ppp * (subject.jobLo + (subject.jobHi - subject.jobLo) * t);
    if (subject.graded && subject.opRank > 0) base *= ports.opPay(subject.opRank);
    base *= ports.jobPayMultiplier(state);
  } else if (subject.job === 'retired') {
    base = subject.pensionAmount == null ? nation.ppp * 0.45 : subject.pensionAmount;
  } else if (subject.job === 'child' || subject.job === 'student') {
    base = nation.ppp * 0.10;
  } else {
    base = nation.ppp * 0.25;
  }

  if (subject.pensionAmount == null) {
    const d = ports.discrimination(state) + (subject.oriStage > 0 ? 0.22 : 0);
    base *= 1 - ports.clamp(d, 0, 0.75) * 0.42;
    // Family inertia: a good start is worth a few percent for life.
    base *= 1 + (subject.familyTier - 3) * 0.06;
  }
  return Math.max(0, base);
}

/**
 * Map a monthly income onto the continent-wide percentile (0..1).
 *
 * Subsistence rations count as living support, never as cash, so they enter the anchor
 * at a twelfth of their value and never touch `income` or net worth.
 */
export function incomePercentile(
  income: number, subsistenceAnnual: number, clamp: IncomePorts['clamp']
): number {
  const x = Math.log(Math.max(0.05, income + subsistenceAnnual / 12) / 0.05) / Math.log(300);
  return clamp(x, 0, 1);
}
