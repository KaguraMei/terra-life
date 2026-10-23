/**
 * Organization rules: status, pay, subsistence and the promotion/contact gates.
 *
 * The lifecycle itself (join, leave, retire, sync, promote) is a state machine that
 * mutates the life and logs to the timeline, and it stays in the legacy engine —
 * those are the eight guarded transitions. What lives here is everything that only
 * *decides*: whether an organization exists this year, what multiplier its payroll
 * applies, whether it pays at all, and whether a contact is still available.
 */

export interface OrganizationDef {
  readonly id?: string;
  readonly fromYear?: number;
  readonly untilYear?: number | null;
  readonly recruitUntil?: number | null;
  readonly employmentModel?: string;
  readonly unpaid?: boolean;
  readonly subsistence?: number;
  readonly locationAllowed?: ((state: unknown) => boolean) | null;
  readonly nations?: readonly string[];
}

export interface EmploymentModel {
  readonly payroll?: {
    readonly scale?: string;
    readonly rankStep?: number;
    readonly maxRankSteps?: number;
  } | null;
}

export interface RouteRank {
  readonly needYears?: number;
  readonly name?: string;
}

export interface OrganizationRoute {
  readonly ranks?: readonly RouteRank[];
}

export interface ContactDef {
  readonly id: string;
  readonly minRank?: number;
  readonly fromYear: number;
  readonly untilYear: number;
}

export interface ContactRecord {
  readonly count: number;
  readonly lastYear: number;
}

/** The fields these rules read from a life. */
export interface OrganizationSubject {
  readonly phase: string;
  readonly affiliation: string | null;
  readonly organizationJob: string | null;
  readonly job: string;
  readonly rank: number;
  readonly service: number;
  readonly lastPromotionYear: number | null;
  readonly year: number;
  readonly age: number;
  readonly school: boolean;
  readonly serveLeft: number;
  readonly retired: boolean;
  readonly transition: string | null;
  readonly nation: string;
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

export function organizationSubject(state: unknown): OrganizationSubject {
  const life = record(state) ?? {};
  const flags = record(life.flags) ?? {};
  return {
    phase: text(life.phase),
    affiliation: typeof life.affiliation === 'string' ? life.affiliation : null,
    organizationJob: typeof life.orgJob === 'string' ? life.orgJob : null,
    job: text(life.job),
    rank: num(life.orgRank),
    service: num(life.orgService),
    lastPromotionYear: typeof life.orgLastPromotionYear === 'number' ? life.orgLastPromotionYear : null,
    year: num(life.year),
    age: num(life.age),
    school: Boolean(life.school),
    serveLeft: num(life.serveLeft),
    retired: Boolean(flags.retired),
    transition: typeof life.orgTransition === 'string' ? life.orgTransition : null,
    nation: text(life.nation)
  };
}

export interface OrganizationPorts {
  readonly def: (id: string | null) => OrganizationDef | null;
  readonly route: (id: string | null, route: string | null) => OrganizationRoute | null;
  readonly employmentModel: (name: string | undefined) => EmploymentModel | null;
  readonly nationPpp: (nation: string) => number;
  readonly isWorking: (state: unknown) => boolean;
}

export interface OrganizationStatus {
  readonly status: 'unknown' | 'not_yet' | 'dissolved' | 'reorganized' | 'active';
  readonly available: boolean;
  readonly recruitment: boolean;
}

/** Where an organization sits in its own timeline this year. */
export function organizationStatus(def: OrganizationDef | null, year: number): OrganizationStatus {
  const status: OrganizationStatus['status'] = !def || !Number.isFinite(year) ? 'unknown'
    : def.fromYear != null && year < def.fromYear ? 'not_yet'
      : def.untilYear != null && year > def.untilYear ? 'dissolved'
        : def.recruitUntil != null && year > def.recruitUntil ? 'reorganized'
          : 'active';
  return {
    status,
    available: status === 'active' || status === 'reorganized',
    recruitment: status === 'active'
  };
}

/** Available = still exists, and the locale allows it to operate. */
export function organizationAvailable(def: OrganizationDef | null, year: number, state: unknown): boolean {
  const status = organizationStatus(def, year);
  if (!status.available) return false;
  return !def || !def.locationAllowed || def.locationAllowed(state);
}

/** Unpaid organizations still expect the work; only subsistence keeps you alive. */
export function isUnpaid(
  subject: OrganizationSubject,
  def: OrganizationDef | null,
  availability: {readonly working: boolean; readonly available: boolean}
): boolean {
  if (!subject.affiliation || !def || !def.unpaid) return false;
  if (!availability.available || !availability.working) return false;
  return subject.job === subject.organizationJob
    && !subject.school
    && !subject.retired
    && !subject.serveLeft;
}

/** Payroll multiplier: only `service-rank` models scale with rank. */
export function payMultiplier(
  subject: OrganizationSubject,
  model: EmploymentModel | null,
  def: OrganizationDef | null,
  availability: {readonly working: boolean; readonly available: boolean}
): number {
  if (isUnpaid(subject, def, availability)) return 0;
  if (!subject.affiliation || !availability.working || subject.retired ||
      subject.job !== subject.organizationJob) return 1;
  const payroll = model?.payroll;
  if (!payroll || payroll.scale !== 'service-rank') return 1;
  const steps = Math.min(payroll.maxRankSteps || 0, Math.max(0, subject.rank));
  return 1 + steps * (payroll.rankStep || 0);
}

export function subsistence(
  subject: OrganizationSubject,
  def: OrganizationDef | null,
  availability: {readonly working: boolean; readonly available: boolean},
  nationPpp: number
): number {
  if (!isUnpaid(subject, def, availability)) return 0;
  return nationPpp * ((def && def.subsistence) || 0);
}

/** The organization's own state this year, precomputed by the caller. */
export interface OrganizationAvailability {
  readonly working: boolean;
  /** Still exists and the locale allows it (the engine's organizationAvailable). */
  readonly available: boolean;
  /** Still recruiting, not merely existing. */
  readonly recruitment: boolean;
}

/** Whether the next rank is reachable this year. */
export function promotionReady(
  subject: OrganizationSubject,
  route: OrganizationRoute | null,
  availability: OrganizationAvailability
): boolean {
  if (!route || subject.phase !== 'life' || subject.school || subject.age >= 65 || subject.serveLeft > 0) return false;
  if (!availability.working || subject.retired || subject.transition) return false;
  if (!availability.recruitment || !availability.available) return false;

  const next = route.ranks?.[subject.rank + 1];
  if (!next) return false;
  return subject.service >= (next.needYears ?? 0) && subject.lastPromotionYear !== subject.year;
}

/**
 * Whether a contact is still reachable.
 *
 * A contact can be used at most three times, and never twice within four years; the
 * year window and rank gate come from the contact definition itself.
 */
export function contactEligible(
  subject: OrganizationSubject,
  organizationId: string,
  contact: ContactDef,
  previous: ContactRecord | null,
  availability: OrganizationAvailability
): boolean {
  if (subject.phase !== 'life' || subject.school || subject.age >= 65 || subject.retired) return false;
  if (subject.serveLeft > 0 || subject.transition) return false;
  if (subject.affiliation !== organizationId || !availability.working) return false;
  if (!availability.available) return false;
  if (subject.rank < (contact.minRank || 0)) return false;
  if (subject.year < contact.fromYear || subject.year > contact.untilYear) return false;
  if (!previous) return true;
  return previous.count < 3 && subject.year - previous.lastYear >= 4;
}
