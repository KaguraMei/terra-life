/**
 * Cross-domain life-state invariants.
 *
 * These are *relations*, not formulas: they state how identity, organization
 * membership, retirement, salary and health must stay consistent with each
 * other. Nothing here recomputes model numbers, so content tuning never has to
 * be mirrored into the checker.
 *
 * Every violation carries a stable `code`, so regression asserts behaviour
 * ("a retired life cannot be dismissed") instead of matching prose.
 */

export type ViolationCode =
  | 'state.not-object'
  | 'identity.affiliation-requires-job'
  | 'identity.unknown-job'
  | 'identity.affiliation-unknown-organization'
  | 'identity.affiliation-unknown-route'
  | 'career.history-partial-close'
  | 'career.open-history-count'
  | 'career.open-history-mismatch'
  | 'career.departure-history-open'
  | 'career.retired-retains-affiliation'
  | 'career.retired-flag-job-mismatch'
  | 'career.retired-job-flag-mismatch'
  | 'career.retired-marked-seeking'
  | 'career.rank-invalid'
  | 'career.service-invalid'
  | 'economy.field-not-finite'
  | 'health.stage-out-of-range'
  | 'health.crystal-out-of-range'
  | 'health.treated-without-infection'
  | 'pension.amount-invalid'
  | 'pension.without-retirement'
  | 'pension.suspended-while-retired'
  | 'pension.suspension-invalid'
  | 'pension.organization-unresolved';

export interface Violation {
  readonly code: ViolationCode;
  /** Dotted path into the life state, e.g. `orgHistory[0].leftYear`. */
  readonly path: string;
  readonly message: string;
}

/** Minimal shape of a core organization entry needed by the checks. */
export interface OrganizationLike {
  readonly routes?: Record<string, unknown> | null;
}

/**
 * Read-only registries the checker needs. Kept structural so both the legacy
 * assembly and a future typed registry can supply it.
 */
export interface LifeStateRegistry {
  readonly organizations?: Record<string, OrganizationLike> | null;
  readonly jobs?: Record<string, unknown> | null;
  readonly nonWork?: readonly string[] | null;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function rows(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(record).filter((row): row is UnknownRecord => row !== null)
    : [];
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isRetiredFlag(life: UnknownRecord): boolean {
  return record(life.flags)?.retired === true;
}

/**
 * Inspect a committed life state and return every violated relation. An empty
 * array means "internally consistent", never "the model values are correct".
 */
export function stateInvariantViolations(
  state: unknown,
  registry: LifeStateRegistry = {}
): Violation[] {
  const life = record(state);
  if (!life) {
    return [{ code: 'state.not-object', path: '', message: 'life state is not an object' }];
  }
  const violations: Violation[] = [];
  const add = (code: ViolationCode, path: string, message: string) => {
    violations.push({ code, path, message });
  };

  const organizations = record(registry.organizations);
  const jobs = record(registry.jobs);
  const nonWork = new Set((registry.nonWork ?? []).filter((id): id is string => typeof id === 'string'));

  const affiliation = text(life.affiliation);
  const routeId = text(life.orgRoute);
  const job = text(life.job);
  const orgJob = text(life.orgJob);
  const retired = isRetiredFlag(life);
  const history = rows(life.orgHistory);
  const openHistory = history.filter(row => row.leftAt == null && row.leftYear == null);

  /* --- organization history closure ------------------------------------- */

  history.forEach((row, index) => {
    if ((row.leftAt == null) !== (row.leftYear == null)) {
      add('career.history-partial-close', `orgHistory[${index}]`,
        'an organization membership must close age and year together');
    }
  });

  /* --- active membership identity --------------------------------------- */

  if (affiliation) {
    const organization = organizations ? record(organizations[affiliation]) : null;
    const routes = organization ? record(organization.routes) : null;
    if (organizations && !organization) {
      add('identity.affiliation-unknown-organization', 'affiliation',
        `active affiliation ${affiliation} is not a registered organization`);
    }
    if (!routeId || (routes && !routes[routeId])) {
      add('identity.affiliation-unknown-route', 'orgRoute',
        `active route ${routeId ?? '(none)'} does not exist on ${affiliation}`);
    }
    if (!job || job !== orgJob) {
      add('identity.affiliation-requires-job', 'job',
        'an employed life must hold the job registered for its organization');
    }
    if (openHistory.length !== 1 ||
        openHistory[0]?.organization !== affiliation ||
        openHistory[0]?.route !== routeId) {
      add('career.open-history-mismatch', 'orgHistory',
        'active membership must match exactly one open history entry');
    }
    if (retired) {
      add('career.retired-retains-affiliation', 'affiliation',
        'a retired life cannot retain an active organization affiliation');
    }
  } else {
    if (openHistory.length > 0) {
      add('career.departure-history-open', 'orgHistory',
        'leaving an organization must close its history entry');
    }
  }

  /* --- retirement identity ---------------------------------------------- */

  if (retired && job !== 'retired') {
    add('career.retired-flag-job-mismatch', 'job',
      `retirement flag and job identity must move together (job=${job ?? '(none)'})`);
  }
  if (job === 'retired' && !retired) {
    add('career.retired-job-flag-mismatch', 'flags.retired',
      'the retired job identity requires the retirement flag');
  }
  if (retired && job === 'seeking') {
    add('career.retired-marked-seeking', 'job',
      'a retired life cannot be turned into a job seeker');
  }

  /* --- organization grade and tenure ------------------------------------ */

  if (life.orgRank != null &&
      (!Number.isInteger(life.orgRank) || (life.orgRank as number) < 0)) {
    add('career.rank-invalid', 'orgRank', 'organization rank must be a nonnegative integer');
  }
  if (life.orgService != null) {
    const service = finite(life.orgService);
    if (service === null || service < 0) {
      add('career.service-invalid', 'orgService', 'organization service years must be finite and nonnegative');
    }
  }

  /* --- economy ----------------------------------------------------------- */

  for (const field of ['money', 'debt', 'income'] as const) {
    if (life[field] != null && finite(life[field]) === null) {
      add('economy.field-not-finite', field, `${field} must remain finite`);
    }
  }

  /* --- health ------------------------------------------------------------ */

  const health = record(life.ori);
  if (health) {
    const stage = finite(health.stage);
    if (!Number.isInteger(stage) || (stage as number) < 1 || (stage as number) > 3) {
      add('health.stage-out-of-range', 'ori.stage', 'oripathy stage must be an integer from 1 to 3');
    }
    const crystal = finite(health.crystal);
    if (crystal === null || crystal < 0 || crystal > 100) {
      add('health.crystal-out-of-range', 'ori.crystal', 'crystal rate must stay within 0 to 100');
    }
  }

  /* --- retirement pension ------------------------------------------------ */

  const pension = record(life.retirementPension);
  if (pension) {
    const amount = finite(pension.monthlyAmount);
    if (amount === null || amount < 0) {
      add('pension.amount-invalid', 'retirementPension.monthlyAmount',
        'retirement pension must be a finite nonnegative monthly amount');
    }
    if (!retired) {
      // A pension can outlive the retirement identity only when it is explicitly
      // suspended (coerced labour). An unsuspended, unpaid entitlement means the
      // identity and the record drifted apart.
      const suspendedAt = pension.suspendedAt;
      if (suspendedAt == null) {
        add('pension.without-retirement', 'retirementPension',
          'a pension entitlement requires the retirement identity, or an explicit suspension');
      } else if (!Number.isFinite(suspendedAt) || (suspendedAt as number) < 0) {
        add('pension.suspension-invalid', 'retirementPension.suspendedAt',
          'a pension suspension must record a finite, nonnegative age');
      }
    } else if (pension.suspendedAt != null) {
      add('pension.suspended-while-retired', 'retirementPension.suspendedAt',
        'a pension cannot be suspended while the life holds the retirement identity');
    }
    const source = text(pension.organization);
    if (!source) {
      add('pension.organization-unresolved', 'retirementPension.organization',
        'a pension must reference the organization that granted it');
    } else if (organizations && !record(organizations[source])) {
      add('pension.organization-unresolved', 'retirementPension.organization',
        `pension organization ${source} is not registered`);
    }
  }

  /* --- job vocabulary ---------------------------------------------------- */

  if (job && jobs && !record(jobs[job]) && !nonWork.has(job)) {
    add('identity.unknown-job', 'job', `job ${job} is neither a registered job nor a known non-work state`);
  }

  return violations;
}

export function formatViolations(violations: readonly Violation[]): string {
  return violations.map(item => `- [${item.code}] ${item.path || '(root)'}: ${item.message}`).join('\n');
}

export class StateInvariantError extends Error {
  readonly violations: readonly Violation[];
  constructor(context: string, violations: readonly Violation[]) {
    super(`${context}\n${formatViolations(violations)}`);
    this.name = 'StateInvariantError';
    this.violations = violations;
  }
}

/** Throw when any relation is broken. Used at commit points and in regression. */
export function assertStateInvariants(
  state: unknown,
  registry: LifeStateRegistry = {},
  context = 'Life state invariant failed'
): void {
  const violations = stateInvariantViolations(state, registry);
  if (violations.length) throw new StateInvariantError(context, violations);
}
