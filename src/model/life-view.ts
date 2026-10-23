/**
 * Pure projections of a life state.
 *
 * Reports, CLI summaries and future UI panels need the same handful of facts:
 * who this person was, how they died, what the disease did, where they worked
 * and what they were paid. Reading those directly from the mutable life object
 * couples every consumer to the internal field layout and makes a field rename
 * a silent behavioural change.
 *
 * A view is therefore:
 *  - computed from state and nothing else (no globals, no DOM, no RNG),
 *  - plain JSON data (safe to serialize, diff and snapshot),
 *  - free of formatting and localization decisions.
 */

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

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** One recorded year of adult life. */
export interface AnnualObservation {
  readonly age: number;
  /** Job identity held while the year settled (may be a non-work state). */
  readonly job: string;
  readonly income: number;
  /** Clinical stage recorded that year; 0 means "not infected yet". */
  readonly stage: number;
  /** Crystal load recorded that year; 0 means "not infected yet". */
  readonly crystal: number;
  /** Mood recorded that year, 0..100; the life map colours rows by it. */
  readonly happiness: number;
}

/** A family member as the family panel shows them. */
export interface FamilyMemberObservation {
  readonly name: string;
  readonly age: number;
  /** Job id, or null for someone without one (children, the unemployed). */
  readonly job: string | null;
  /** `false` means deceased; relatives default to alive unless stated. */
  readonly alive: boolean;
}

/** One of the people born in the same second. */
export interface PeerObservation {
  readonly name: string;
  /** Race id and sex: the birth certificate lists both next to the name. */
  readonly race: string;
  readonly sex: string;
  /** Age at death, or null while alive. */
  readonly deathAt: number | null;
}

/** One organization membership, open or closed. */
export interface MembershipObservation {
  readonly organization: string;
  readonly route: string | null;
  readonly rank: number;
  readonly joinedYear: number | null;
  readonly serviceYears: number;
  readonly promotions: number;
  readonly leftYear: number | null;
  readonly closed: boolean;
}

export interface LifeView {
  readonly identity: {
    readonly seed: number | null;
    readonly nation: string;
    readonly race: string;
    readonly sex: string;
    readonly bornYear: number;
    readonly finalAge: number;
    /** Display name and the short form the machine-readable strip uses. */
    readonly name: string;
    readonly shortName: string;
    readonly city: string;
    /** Sarkaz court id, or empty when the life belongs to no court. */
    readonly court: string;
    readonly courtName: string;
    readonly stratum: string;
    readonly stratumCode: string;
    /** Stratum label as written at birth (already localized by the data layer). */
    readonly stratumName: string;
    readonly familyTier: number;
    readonly education: number;
    readonly refugee: boolean;
    /** Whether the family lives inside a city (a birth fact the intro narrates). */
    readonly urban: boolean;
    readonly arts: number;
    readonly artsRank: number;
    readonly lifeRange: { readonly min: number; readonly max: number };
    /** Still living with parents (age or an explicit flag). */
    readonly atHome: boolean;
  };
  /** The four core attributes, raw and unrounded: rounding is display policy. */
  readonly attributes: {
    readonly hl: number;
    readonly h: number;
    readonly sm: number;
    readonly so: number;
  };
  /** Cohort survival used by the life-expectancy panel. */
  readonly survival: {
    readonly expectedAge: number;
    readonly aliveAtCurrentAge: number;
    readonly cohortCurve: ReadonlyArray<{readonly age: number; readonly alive: number}>;
  };
  /** Schooling and service obligations, both optional in a life. */
  readonly schooling: {
    readonly school: string | null;
    readonly yearsLeft: number;
  };
  readonly service: {
    readonly yearsLeft: number;
  };
  /** Relatives, in the order the family panel lists them. */
  readonly family: {
    readonly mother: FamilyMemberObservation | null;
    readonly father: FamilyMemberObservation | null;
    readonly partner: FamilyMemberObservation | null;
    readonly siblings: readonly FamilyMemberObservation[];
    readonly children: readonly FamilyMemberObservation[];
  };
  /** The cohort born in the same second. */
  readonly peers: {
    readonly size: number;
    readonly people: readonly PeerObservation[];
  };
  /** World facts the pixel scene is drawn from. */
  readonly scene: {
    readonly seed: number;
    /** Whether a catastrophe is still shaping the current year's backdrop. */
    readonly postCatastrophe: boolean;
  };
  /** This year's focus choices and how much each one is already practised. */
  readonly focus: {
    /** Life-stage id owned by the content layer (e.g. "service"), not a number. */
    readonly stage: string;
    readonly options: readonly string[];
    readonly weights: Readonly<Record<string, number>>;
  };
  /** The life log, newest last, projected for rendering. */
  readonly feed: {
    readonly entries: ReadonlyArray<{
      readonly kind: string;
      readonly age: number;
      readonly text: string;
      readonly tag: string | null;
    }>;
  };
  readonly mortality: {
    readonly ended: boolean;
    readonly deathAge: number;
    readonly deathCause: string;
    /** The annual hazard the last settlement used, 0..1. */
    readonly annualRisk: number;
  };
  readonly health: {
    readonly infected: boolean;
    readonly stage: number;
    readonly crystal: number;
    readonly treated: boolean;
    readonly known: boolean;
    /** Age at infection, or null when never infected. */
    readonly infectedAt: number | null;
  };
  readonly career: {
    readonly finalJob: string;
    readonly currentJob: string;
    readonly retired: boolean;
    readonly organization: string | null;
    readonly organizationRoute: string | null;
    readonly organizationRank: number;
    readonly operatorClass: string | null;
    readonly operatorRank: number;
    readonly memberships: readonly MembershipObservation[];
  };
  readonly economy: {
    readonly monthlyIncome: number;
    readonly money: number;
    readonly hasPension: boolean;
    readonly pensionMonthlyAmount: number;
    /** Assets minus debt, as the content layer defines net worth. */
    readonly netWorth: number;
    readonly debt: number;
    /** Continental income percentile the life sits in, 0..1. */
    readonly percentile: number;
    /** Yearly in-kind support that replaces a wage (camp supplies). */
    readonly subsistenceAnnual: number;
  };
  readonly annual: readonly AnnualObservation[];
  /** Calendar position; pacing (t / yearSec / paused / speed) is UI, not model. */
  readonly calendar: {
    readonly year: number;
  };
}

/**
 * Project a life state into a read-only view. Unknown or mid-flight states
 * produce an empty but well-formed view instead of throwing, so diagnostics can
 * still render something useful.
 */
/** Content-provided pure functions the view needs but the model does not own. */
export interface LifeViewAdapters {
  /** Arts proficiency rank, derived from state by the content layer. */
  readonly artsRank?: (state: unknown) => number;
  /** Net worth (assets minus debt) as the content layer defines it. */
  readonly netWorth?: (state: unknown) => number;
  /** Share of the birth cohort still alive at an age. */
  readonly cohortAliveAt?: (state: unknown, age: number) => number;
  /** Life stage id for the given state (content owns the thresholds). */
  readonly stage?: (state: unknown) => string;
  /** Focus options available this year. */
  readonly focusOptions?: (state: unknown) => readonly string[];
}

export function deriveLifeView(state: unknown, adapters: LifeViewAdapters = {}): LifeView {
  const life = record(state) ?? {};
  const flags = record(life.flags) ?? {};
  const health = record(life.ori);
  const pension = record(life.retirementPension);
  const range = record(life.lifeMax);
  const lifeMax: [number, number] = Array.isArray(life.lifeMax)
    ? [num(life.lifeMax[0]), num(life.lifeMax[1])]
    : range ? [num(range.min), num(range.max)] : [0, 0];
  const annual = rows(record(life.stats)?.years).map((year): AnnualObservation => ({
    age: num(year.age),
    job: text(year.job),
    income: num(year.income),
    stage: num(year.stage),
    crystal: num(year.ori),
    happiness: num(year.h)
  }));
  const family = record(life.fam) ?? {};
  const relative = (value: unknown): FamilyMemberObservation | null => {
    const person = record(value);
    if (!person) return null;
    return {
      name: text(person.name),
      age: num(person.age),
      job: typeof person.job === 'string' && person.job.length > 0 ? person.job : null,
      alive: person.alive !== false
    };
  };
  const memberships = rows(life.orgHistory).map((row): MembershipObservation => ({
    organization: text(row.organization),
    route: typeof row.route === 'string' ? row.route : null,
    rank: num(row.rank),
    joinedYear: typeof row.joinedYear === 'number' ? row.joinedYear : null,
    serviceYears: num(row.serviceYears),
    promotions: Array.isArray(row.promotions) ? row.promotions.length : 0,
    leftYear: typeof row.leftYear === 'number' ? row.leftYear : null,
    closed: row.leftYear != null || row.leftAt != null
  }));
  const cohort = record(life.cohort);
  const attributes = record(life.st) ?? {};
  const expectedAge = num(record(life.lt)?.e0);

  return {
    identity: {
      seed: typeof flags.seed === 'number' ? flags.seed : null,
      nation: text(life.nation),
      race: text(life.race),
      sex: text(life.sex),
      bornYear: num(life.bornYear),
      finalAge: num(life.age),
      name: text(life.fullName),
      shortName: text(life.name, text(life.fullName)),
      city: text(life.city),
      court: typeof life.court === 'string' && life.court !== 'none' ? life.court : '',
      courtName: text(life.courtName),
      stratum: text(life.stratum),
      stratumCode: text(life.stratumCode),
      stratumName: text(life.stratumName),
      familyTier: num(life.q),
      education: num(life.eduLevel),
      refugee: life.refugee === true,
      urban: life.urban === true,
      arts: num(life.arts),
      artsRank: adapters.artsRank ? num(adapters.artsRank(life)) : 0,
      lifeRange: {min: lifeMax[0] ?? 0, max: lifeMax[1] ?? 0},
      atHome: num(life.age) < 18 || flags.atHome === true
    },
    attributes: {
      hl: num(attributes.hl),
      h: num(attributes.h),
      sm: num(attributes.sm),
      so: num(attributes.so)
    },
    survival: {
      expectedAge,
      aliveAtCurrentAge: adapters.cohortAliveAt ? num(adapters.cohortAliveAt(life, num(life.age))) : 0,
      cohortCurve: rows(cohort?.curve).map(point => ({age: num(point.age), alive: num(point.alive)}))
    },
    schooling: {
      school: typeof life.school === 'string' ? life.school : null,
      yearsLeft: num(life.schoolLeft)
    },
    service: {
      yearsLeft: num(life.serveLeft)
    },
    family: {
      mother: relative(family.mom),
      father: relative(family.dad),
      partner: relative(family.partner),
      siblings: rows(family.sibs).map(relative).filter((person): person is FamilyMemberObservation => person !== null),
      children: rows(family.kids).map(relative).filter((person): person is FamilyMemberObservation => person !== null)
    },
    peers: {
      size: num(cohort?.size),
      people: rows(cohort?.peers).map(peer => ({
        name: text(peer.fullName, text(peer.name)),
        race: text(peer.race),
        sex: text(peer.sex),
        deathAt: typeof peer.deathAt === 'number' ? peer.deathAt : null
      }))
    },
    scene: {
      seed: num(life.sceneSeed),
      postCatastrophe: flags.postCatastrophe === true
    },
    focus: {
      stage: adapters.stage ? text(adapters.stage(life)) : '',
      options: adapters.focusOptions ? [...adapters.focusOptions(life)] : [],
      weights: Object.fromEntries(Object.entries(record(life.focusW) ?? {})
        .filter(([, value]) => typeof value === 'number')
        .map(([key, value]) => [key, value as number]))
    },
    feed: {
      entries: rows(life.log).map(entry => ({
        kind: text(entry.kind, 'ev'),
        age: num(entry.age),
        text: text(entry.text),
        tag: typeof entry.tag === 'string' && entry.tag.length > 0 ? entry.tag : null
      }))
    },
    mortality: {
      ended: life.phase === 'report',
      deathAge: num(life.deathAge, num(life.age)),
      deathCause: text(life.deathCause, '(alive)'),
      annualRisk: num(life.lastQ)
    },
    health: {
      infected: health !== null,
      stage: health ? num(health.stage) : 0,
      crystal: health ? num(health.crystal) : 0,
      treated: health ? health.treated === true : false,
      known: health ? health.known === true : false,
      infectedAt: health && typeof health.at === 'number' ? health.at : null
    },
    career: {
      finalJob: text(flags.lastJob, text(life.job)),
      currentJob: text(life.job),
      retired: flags.retired === true,
      organization: typeof life.affiliation === 'string' ? life.affiliation : null,
      organizationRoute: typeof life.orgRoute === 'string' ? life.orgRoute : null,
      organizationRank: num(life.orgRank),
      operatorClass: typeof life.opClass === 'string' ? life.opClass : null,
      operatorRank: num(life.opRank),
      memberships
    },
    economy: {
      monthlyIncome: num(life.income),
      money: num(life.money),
      hasPension: pension !== null,
      pensionMonthlyAmount: pension ? num(pension.monthlyAmount) : 0,
      netWorth: adapters.netWorth ? num(adapters.netWorth(life)) : num(life.money),
      debt: num(life.debt),
      percentile: num(life.pct),
      subsistenceAnnual: num(life.subsistenceAnnual)
    },
    annual,
    calendar: {
      year: num(life.year)
    }
  };
}
