/**
 * Membership: staying in an organization, and the three ways out that events can force.
 *
 * These are the decisions the legacy transitions ask before they touch a life. Each one
 * is a small predicate or a reason, but they are the ones that go wrong quietly:
 *
 *   - `syncVerdict` decides *why* a membership ends, and the reason is player-facing
 *     text that also lands in the report. The precedence between "the archive is gone",
 *     "the old Reunion collapsed", "the city banned the family", "retired", "called up",
 *     "changed trade" and "moved away" is a rule, not an implementation detail.
 *   - `dismissible` is the single entry point for "an event may take this job away",
 *     and it must never rewrite a student, a prisoner or a retiree into unemployment.
 *   - `coercedLabourGuard` keeps the retirement identity and the prison identity from
 *     coexisting.
 *
 * Everything here is a decision. The writes, the log lines and the income recompute stay
 * in `js/engine/organization.js`, which is also where the one-time schema migration runs.
 */

export interface MembershipSubject {
  readonly phase: string;
  readonly affiliation: string | null;
  readonly route: string | null;
  readonly job: string;
  readonly orgJob: string | null;
  readonly orgRank: number;
  readonly opRank: number;
  readonly age: number;
  readonly school: boolean;
  readonly serveLeft: number;
  readonly retired: boolean;
  readonly nation: string;
  readonly city: string;
  readonly year: number;
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

export function membershipSubject(state: unknown): MembershipSubject {
  const life = record(state) ?? {};
  const flags = record(life.flags) ?? {};
  return {
    phase: text(life.phase),
    affiliation: typeof life.affiliation === 'string' && life.affiliation ? life.affiliation : null,
    route: typeof life.orgRoute === 'string' && life.orgRoute ? life.orgRoute : null,
    job: text(life.job),
    orgJob: typeof life.orgJob === 'string' ? life.orgJob : null,
    orgRank: num(life.orgRank),
    opRank: num(life.opRank),
    age: num(life.age),
    school: Boolean(life.school),
    serveLeft: num(life.serveLeft),
    retired: Boolean(flags.retired),
    nation: text(life.nation),
    city: text(life.city),
    year: num(life.year)
  };
}

export type LeaveOptions = {
  readonly keepJob?: boolean;
  readonly retirement?: boolean;
  readonly preserveOperatorRank?: boolean;
};

export type SyncVerdict =
  | {readonly kind: 'none'}
  | {readonly kind: 'update'; readonly orgJob: string; readonly orgRank: number | null}
  | {readonly kind: 'leave'; readonly reason: string; readonly options: LeaveOptions};

export interface MembershipPorts {
  /** True while the organization still exists this year (status window, not recruiting). */
  readonly available: (state: unknown, id: string) => boolean;
  readonly locationAllowed: ((state: unknown) => boolean) | null;
  /** Job ids the route accepts without treating the change as a trade change. */
  readonly routeJobs: readonly string[] | null;
  readonly nations: readonly string[] | null;
  readonly isWorking: (state: unknown) => boolean;
}

export const RETIREMENT_AGE = 65;
export const COERCED_LABOUR_JOBS: readonly string[] = ['slave', 'prison'];
const LONGMEN_GUARD = 'lungmen_guard';
const REUNION_COLLAPSE = '切城—龙门事件后旧编制瓦解，幸存者离散；九后来重组的整合运动另属一条路线';

/**
 * Why a membership ends this year, or what it should record instead.
 *
 * Precedence, highest first — the order is the contract:
 *
 *   1. the organization or route no longer resolves      → 档案失效
 *   2. Reunion's old structure dissolved                 → the collapse reason
 *   3. the city forbids the organization                 → the location reason
 *   4. retirement / called up / post ended               → 退休 · 应征服役 · 结束任职
 *   5. changed trade                                     → 转行或应征服役
 *   6. moved outside the organization's nations          → 迁往组织辖区以外
 *   7. otherwise                                         → update the recorded post
 *
 * Rules 1–3 and 6 are decided by content and the world; rule 4 is the only one that can
 * hand a pension to the departure, which is why it carries `retirement` explicitly
 * rather than letting the reason string be parsed.
 */
export function syncVerdict(
  state: unknown, subject: MembershipSubject, defExists: boolean, routeExists: boolean, ports: MembershipPorts
): SyncVerdict {
  if (!subject.affiliation || subject.phase !== 'life') return {kind: 'none'};
  const id = subject.affiliation;

  if (!defExists || !routeExists) return {kind: 'leave', reason: '档案失效', options: {keepJob: true}};
  if (id === 'reunion' && !ports.available(state, id)) {
    return {kind: 'leave', reason: REUNION_COLLAPSE, options: {}};
  }
  if (ports.locationAllowed && !ports.locationAllowed(state)) {
    return {kind: 'leave', reason: '新沃尔西尼禁止家族入驻及介入', options: {}};
  }

  if (subject.retired || subject.age >= 65 || !ports.isWorking(state) || subject.school || subject.serveLeft > 0) {
    const retirement = subject.retired || subject.age >= 65;
    const reason = retirement ? '退休' : subject.serveLeft > 0 ? '应征服役' : '结束任职';
    return {
      kind: 'leave',
      reason,
      options: {keepJob: true, retirement, preserveOperatorRank: retirement}
    };
  }

  const routeJobs = ports.routeJobs ?? [];
  if (subject.job !== subject.orgJob && !routeJobs.includes(subject.job)) {
    return {kind: 'leave', reason: '转行或应征服役', options: {keepJob: true}};
  }

  const longmenException = id === LONGMEN_GUARD && subject.nation === 'YAN' && subject.city.includes('龙门');
  if (ports.nations && !ports.nations.includes(subject.nation) && !longmenException) {
    return {kind: 'leave', reason: '迁往组织辖区以外', options: {keepJob: false}};
  }

  return {kind: 'update', orgJob: subject.job, orgRank: id === 'rhodes' ? subject.opRank : null};
}

/**
 * Whether an event may take this life's job away.
 *
 * A student, a prisoner, a retiree or anyone already outside work must never be
 * rewritten into "seeking" by an event — the dismissal path is for the employed only.
 */
export function dismissible(subject: MembershipSubject, isWorking: boolean): boolean {
  if (subject.phase !== 'life') return false;
  if (subject.retired || subject.job === 'retired') return false;
  return isWorking;
}

export type CoercedLabourVerdict =
  | {readonly ok: true}
  | {readonly ok: false; readonly reason: 'ended' | 'invalid-job' | 'already-there'};

/** Coerced labour: a live life, a labour job, and not already doing it. */
export function coercedLabourGuard(subject: MembershipSubject, job: string): CoercedLabourVerdict {
  if (subject.phase !== 'life') return {ok: false, reason: 'ended'};
  if (!COERCED_LABOUR_JOBS.includes(job)) return {ok: false, reason: 'invalid-job'};
  if (subject.job === job) return {ok: false, reason: 'already-there'};
  return {ok: true};
}

export type RetirementVerdict =
  | {readonly ok: true}
  | {readonly ok: false; readonly reason: 'ended' | 'too-young' | 'already-retired'};

/** Retirement: the life must be sixty-five and not already retired in the same way. */
export function retirementGuard(subject: MembershipSubject, jobRetired: boolean): RetirementVerdict {
  if (subject.phase !== 'life') return {ok: false, reason: 'ended'};
  if (subject.age < RETIREMENT_AGE) return {ok: false, reason: 'too-young'};
  if (subject.retired && jobRetired) return {ok: false, reason: 'already-retired'};
  return {ok: true};
}

