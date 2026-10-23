/**
 * The four-dimension regression: health, bonds and mood drift toward a target.
 *
 * This is the single most important mechanic in the game, and the one the original
 * file's header calls out: the dimensions are not added and subtracted, they move a
 * quarter of the way toward a target every year. A bad year therefore leaves a mark
 * that fades slowly, and a chronic condition keeps pulling the target down.
 *
 * Each block is two functions — a target and a one-year regression — because they are
 * tested separately: the target is where a life would settle if nothing changed, the
 * regression is how fast it gets there (0.25 for the body, 0.20 for mood). Bonds are
 * the odd one out: the target declines with age, and the *decline* rate rises from
 * 0.12 to 0.30 as the life grows, while climbing back is always the slow 0.12. So an
 * adult loses friends quickly and makes them slowly, which is what makes the middle
 * years feel different from childhood.
 *
 * The targets read the life but never write it, and every threshold here is
 * load-bearing: 60 with five chronic conditions should be visibly worse than 40 with
 * none, and the tests pin the arithmetic rather than the outcome.
 */

export interface RegressionSubject {
  readonly age: number;
  readonly health: number;
  readonly social: number;
  readonly happiness: number;
  readonly familyTier: number;
  readonly smoker: boolean;
  readonly refugee: boolean;
  readonly debt: boolean;
  readonly oriStage: number;
  readonly oriKnown: boolean;
  /** Lifestyle flags that push the health target up or down. */
  readonly balancedDiet: boolean;
  readonly exercises: boolean;
  readonly untreatedTb: boolean;
  /** Share of this year's focus spent on health (`S.focusW.health`). */
  readonly healthFocus: number;
  readonly conditionsTreated: number;
  readonly conditionsUntreated: number;
  readonly kidsAlive: number;
  readonly partnerAlive: boolean;
  readonly married: boolean;
  readonly momAlive: boolean;
  readonly migrated: boolean;
  readonly hobbies: number;
  /** Income percentile, where 0.5 is the continent's median. */
  readonly incomePercentile: number;
  /** Years with above-average output, capped when it feeds mood. */
  readonly productiveYears: number;
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const rows = (value: unknown): UnknownRecord[] =>
  Array.isArray(value) ? value.map(record).filter((row): row is UnknownRecord => row !== null) : [];
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

export function regressionSubject(state: unknown): RegressionSubject {
  const life = record(state) ?? {};
  const stats = record(life.st) ?? {};
  const family = record(life.fam) ?? {};
  const ori = record(life.ori);
  const flags = record(life.flags) ?? {};
  const focus = record(life.focusW) ?? {};
  const conditions = Object.values(record(life.conds) ?? {});
  const treated = conditions.filter(condition => Boolean(record(condition)?.treated)).length;
  const partner = record(family.partner);

  return {
    age: num(life.age),
    health: num(stats.hl),
    social: num(stats.so),
    happiness: num(stats.h),
    familyTier: num(life.q),
    smoker: Boolean(life.smoker),
    refugee: Boolean(life.refugee),
    debt: num(life.debt) > 0,
    oriStage: num(ori && ori.stage),
    oriKnown: Boolean(ori && ori.known),
    balancedDiet: Boolean(flags.diet),
    exercises: Boolean(flags.exercise),
    untreatedTb: Boolean(flags.tbUntreated),
    healthFocus: num(focus.health),
    conditionsTreated: treated,
    conditionsUntreated: conditions.length - treated,
    kidsAlive: rows(family.kids).filter(kid => kid.alive === true || kid.alive === 1).length,
    partnerAlive: Boolean(partner && partner.alive),
    married: Boolean(family.married),
    momAlive: Boolean(record(family.mom)?.alive),
    migrated: Boolean(life.migrated),
    hobbies: rows(life.hobbies).length,
    incomePercentile: num(life.pct),
    productiveYears: num(stats.pY)
  };
}

/** One-year moves. They differ per dimension and are part of the game's feel. */
export const HEALTH_RATE = 0.25;
export const MOOD_RATE = 0.20;
/** Bonds: the baseline recovery rate, and the higher rate once the life is grown. */
export const BOND_RATE = 0.12;
export const BOND_RATE_ADULT = 0.30;
/** Senescence of the social baseline starts around fourteen and is full by twenty. */
export const BOND_DECLINE = 12;

/**
 * Health target. Chronic conditions are the heaviest term (5 each, 2.5 once treated),
 * and each oripathy stage takes another 7 points off — the disease is why a treated
 * patient still never gets back to a healthy target.
 */
export function healthTarget(subject: RegressionSubject, expectedHealth: number): number {
  const conditionLoad = subject.conditionsTreated * 2.5 + subject.conditionsUntreated * 5;
  return expectedHealth
    + (subject.balancedDiet ? 1.5 : 0)
    + (subject.exercises ? 2 : 0)
    + (subject.familyTier - 3) * 1.5
    - (subject.smoker ? 6 : 0)
    - conditionLoad
    - (subject.refugee ? 6 : 0)
    + subject.healthFocus * 6
    - (subject.debt ? 2 : 0)
    - (subject.oriStage > 0 ? subject.oriStage * 7 : 0)
    - (subject.untreatedTb ? 10 : 0);
}

export function regressHealth(
  current: number, target: number, clamp: (value: number, low: number, high: number) => number
): number {
  return clamp(current + (target - current) * HEALTH_RATE, 1, 100);
}

/**
 * Bond target: a partner, children, a living mother and hobbies all add, migration
 * and a public infection subtract. The target itself declines with age (the original's
 * `SO_K`), so an adult is pulled toward a lower baseline than a child.
 */
export function socialTarget(subject: RegressionSubject): number {
  return 45
    + (subject.partnerAlive && subject.married ? 12 : 0)
    + Math.min(15, subject.kidsAlive * 4)
    + (subject.momAlive ? 3 : 0)
    + (subject.migrated ? -6 : 0)
    + (subject.hobbies > 0 ? 3 : 0)
    - (subject.oriKnown ? 6 : 0);
}

/**
 * One year of bond drift.
 *
 * The rate is asymmetric: losing bonds uses `0.12 + 0.18 × adult`, gaining them only
 * ever uses `0.12`. An adult therefore drops fast and recovers slowly, while a child
 * does both slowly — and the target itself is 12 points lower for adults.
 */
export function regressSocial(
  current: number, target: number, age: number,
  clamp: (value: number, low: number, high: number) => number
): number {
  const adult = clamp((age - 14) / 6, 0, 1);
  const declined = target - BOND_DECLINE * adult;
  const rate = current > declined ? BOND_RATE + (BOND_RATE_ADULT - BOND_RATE) * adult : BOND_RATE;
  return clamp(current + (declined - current) * rate, 0, 100);
}

/**
 * Mood target: the nation's baseline, then the body (0.16 per health point above 60),
 * bonds (0.18 per point above 50), relative income (±22 points across the percentile),
 * and a capped credit for productive years. Stage 2+ oripathy is a flat −12, and being
 * openly infected another −6 on top.
 */
export function moodTarget(subject: RegressionSubject, baseline: number): number {
  return baseline
    + (subject.health - 60) * 0.16
    + (subject.social - 50) * 0.18
    + (subject.incomePercentile - 0.5) * 22
    + (subject.oriStage >= 2 ? -12 : 0)
    - (subject.oriKnown ? 6 : 0)
    + Math.min(6, subject.productiveYears * 0.1);
}

export function regressMood(
  current: number, target: number, clamp: (value: number, low: number, high: number) => number
): number {
  return clamp(current + (target - current) * MOOD_RATE, 1, 100);
}
