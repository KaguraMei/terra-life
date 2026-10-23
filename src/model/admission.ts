/**
 * Admission: the fourteen checks that stand between a life and an organization post.
 *
 * This is the heaviest rule in the organization module and the one every other
 * transition leans on — recruitment events, story transitions, debug calls and the
 * interview flow all end up here. It used to be a long `if` chain inside
 * `js/engine/organization.js`, which made it impossible to test a single rung without
 * constructing a whole life.
 *
 * **Order is part of the contract.** Each check returns a distinct `code`, and callers
 * branch on that code (the verification gate asserts specific ones), so a check moved
 * one line up changes observable behaviour. The order below is the original order and
 * must stay.
 *
 * Two of the checks are content predicates (`require` on a route and on an
 * organization). They read the raw state and cannot be expressed as data, so the port
 * receives `state` and hands it straight through — the same treatment as the
 * discrimination port in `oripathy.ts`. Pretending otherwise would mean either
 * duplicating the predicates here or evaluating them with the wrong context.
 */

export type AdmissionCode =
  | 'unknown'
  | 'ended'
  | 'closed'
  | 'location'
  | 'unavailable'
  | 'affiliated'
  | 'cooldown'
  | 'nation'
  | 'age'
  | 'route_year'
  | 'education'
  | 'profession'
  | 'requirements'
  | 'organization_requirements';

export interface AdmissionVerdict {
  readonly ok: boolean;
  readonly code?: AdmissionCode;
  readonly reason?: string;
}

/** What admission reads from a life. */
export interface AdmissionSubject {
  /** Only `'life'` may apply; a finished life cannot be recruited. */
  readonly phase: string;
  readonly school: boolean;
  readonly retired: boolean;
  readonly age: number;
  readonly serveLeft: number;
  readonly job: string;
  readonly affiliation: string | null;
  readonly nation: string;
  readonly city: string;
  readonly eduLevel: number;
  readonly arts: number;
  readonly year: number;
  /** `orgCooldowns[organization]`, 0 when never applied. */
  readonly cooldownYear: number;
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

export function admissionSubject(state: unknown, organization: string): AdmissionSubject {
  const life = record(state) ?? {};
  const flags = record(life.flags) ?? {};
  const cooldowns = record(life.orgCooldowns) ?? {};
  return {
    phase: text(life.phase),
    school: Boolean(life.school),
    retired: Boolean(flags.retired),
    age: num(life.age),
    serveLeft: num(life.serveLeft),
    job: text(life.job),
    affiliation: typeof life.affiliation === 'string' && life.affiliation ? life.affiliation : null,
    nation: text(life.nation),
    city: text(life.city),
    eduLevel: num(life.eduLevel),
    arts: num(life.arts),
    year: num(life.year),
    cooldownYear: num(cooldowns[organization])
  };
}

export interface AdmissionRoute {
  readonly minAge: number;
  readonly maxAge?: number | null;
  readonly fromYear?: number | null;
  readonly edu?: number;
  readonly jobs?: readonly string[] | null;
  readonly entryJob?: string | null;
  /** Content predicate; receives the raw state. */
  readonly require?: ((state: unknown) => boolean) | null;
}

export interface AdmissionDef {
  readonly nations?: readonly string[] | null;
  /** Content predicate; receives the raw state. */
  readonly locationAllowed?: ((state: unknown) => boolean) | null;
  /** Content predicate; receives the raw state. */
  readonly require?: ((state: unknown) => boolean) | null;
}

export interface AdmissionPorts {
  readonly def: (id: string) => AdmissionDef | null;
  readonly route: (id: string, routeId: string) => AdmissionRoute | null;
  /** True while the organization still recruits in the given year. */
  readonly recruiting: (id: string, year: number) => boolean;
  /** Registry entry for a job, used for the profession fallback. */
  readonly job: (id: string) => {readonly edu: number; readonly art: number} | null;
}

/** The one documented exception to the nation check; kept here so it is visible. */
const LONGMEN_GUARD = 'lungmen_guard';

export interface AdmissionTarget {
  readonly organization: string;
  readonly route: string;
  /** A transfer is allowed to keep the current contract until the new one is signed. */
  readonly transfer?: boolean;
}

/**
 * Run the fourteen checks in their original order and return the first failure.
 *
 * Returning a verdict instead of throwing keeps the recruit/refuse decision legible:
 * the caller logs the reason it was refused without guessing which check tripped.
 */
export function admissionVerdict(
  state: unknown, subject: AdmissionSubject, target: AdmissionTarget, ports: AdmissionPorts
): AdmissionVerdict {
  const {organization, route, transfer = false} = target;
  const def = ports.def(organization);
  const routeDef = ports.route(organization, route);
  const fail = (code: AdmissionCode, reason: string): AdmissionVerdict => ({ok: false, code, reason});

  if (!def || !routeDef) return fail('unknown', '组织或岗位不存在');
  if (subject.phase !== 'life') return fail('ended', '人生已经结束');
  if (!ports.recruiting(organization, subject.year)) return fail('closed', '该组织当前不接受新成员');
  if (def.locationAllowed && !def.locationAllowed(state)) {
    return fail('location', '当地不允许该组织活动');
  }
  if (subject.school || subject.retired || subject.age >= 65 || subject.serveLeft > 0
    || subject.job === 'slave' || subject.job === 'prison' || subject.job === 'retired') {
    return fail('unavailable', '当前不能参加招募');
  }
  if (subject.affiliation && !transfer) return fail('affiliated', '需要先结束当前组织合同');
  if (subject.cooldownYear > subject.year) return fail('cooldown', '尚未到再次申请的时间');

  const longmenException = organization === LONGMEN_GUARD && subject.nation === 'YAN'
    && subject.city.includes('龙门');
  if (def.nations && !def.nations.includes(subject.nation) && !longmenException) {
    return fail('nation', '所在地不符合');
  }

  if (subject.age < routeDef.minAge
    || (routeDef.maxAge != null && subject.age > routeDef.maxAge)) {
    return fail('age', '年龄不符合');
  }
  if (routeDef.fromYear != null && subject.year < routeDef.fromYear) {
    return fail('route_year', '该部门尚未开放');
  }
  if (subject.eduLevel < (routeDef.edu ?? 0)) return fail('education', '学历不足');

  // The unemployed may still apply, but must hold the target profession's entry bar.
  if (routeDef.jobs && !routeDef.jobs.includes(subject.job)) {
    const entryId = routeDef.entryJob || routeDef.jobs[0] || '';
    const entryJob = ports.job(entryId);
    const qualifies = subject.job === 'seeking' && entryJob !== null
      && subject.eduLevel >= entryJob.edu
      && subject.arts >= entryJob.art * 100;
    if (!qualifies) return fail('profession', '需要相关职业经验或专业资格');
  }

  if (routeDef.require && !routeDef.require(state)) {
    return fail('requirements', '尚未达到岗位要求');
  }
  if (def.require && !def.require(state)) {
    return fail('organization_requirements', '尚未达到组织要求');
  }
  return {ok: true};
}
