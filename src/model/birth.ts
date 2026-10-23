/**
 * Birth: whether a married couple has another child this year.
 *
 * The probability is derived backwards from the nation's fertility: there is no TFR
 * column in the registry, so it is reconstructed from urbanisation and education
 * (`6.2 - urb/22 - edu/6`), which reproduces the original's spread closely enough.
 * A couple below their target family size tries hard (weight 1); once they reach it
 * they still conceive occasionally (0.15), which is what produces the large families
 * in poor nations without making them mechanically inevitable.
 *
 * Two quirks are preserved on purpose:
 *
 * 1. Oripathy does **not** reduce fertility. The original multiplied the target family
 *    size by 0.55 once the player reached stage 2 — reading the *player's* stage even
 *    when the player was the father, so an infected father's household shrank while an
 *    infected mother's did not, which is both backwards and unexplained by the source
 *    material. The penalty was removed outright rather than rebalanced; infection
 *    already costs health, income and mood, and a disabled parent's family size is not
 *    something the model should decide for the player.
 * 2. The mother's age window (16–46) is checked on the partner's age when the player
 *    is male, but a male player over 60 is rejected outright before that.
 *
 * Nothing here draws: the caller rolls, so the random stream stays in one place.
 */

export const SON_RATIO = 0.512;
/** Congenital transmission rate for a child of an infected parent. */
export const CONGENITAL_CHANCE = 0.12;
/** Ceiling on the yearly probability, so no nation becomes a maternity ward. */
export const BIRTH_CAP = 0.6;
/** Base yearly chance at the ideal maternal age, before the family-size weight. */
export const BIRTH_BASE = 0.32;
/** The age that maximises fertility, and the span over which it falls off. */
export const IDEAL_MOTHER_AGE = 27;
export const FERTILITY_SPAN = 30;
/** Childlessness weight once the couple has reached its target family size. */
export const SPACING_WEIGHT = 0.15;

export interface BirthSubject {
  readonly sex: string;
  readonly age: number;
  readonly familyTier: number;
  readonly oriStage: number;
  readonly married: boolean;
  readonly partnerAlive: boolean;
  readonly partnerAge: number;
  /**
   * Every child ever born, alive or not — the original compares the raw array length
   * against the target family size, so a lost child still counts toward the goal while
   * the couple keeps trying.
   */
  readonly children: number;
  /** The partner's infection stage, used for congenital transmission. */
  readonly partnerOriStage: number;
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

export function birthSubject(state: unknown): BirthSubject {
  const life = record(state) ?? {};
  const family = record(life.fam) ?? {};
  const ori = record(life.ori);
  const partner = record(family.partner);
  const partnerOri = record(partner && partner.ori);
  const kids = Array.isArray(family.kids) ? family.kids : [];

  return {
    sex: text(life.sex),
    age: num(life.age),
    familyTier: num(life.q),
    oriStage: num(ori && ori.stage),
    married: Boolean(family.married),
    partnerAlive: Boolean(partner && partner.alive),
    partnerAge: num(partner && partner.age),
    children: kids.length,
    partnerOriStage: num(partnerOri && partnerOri.stage)
  };
}

export interface BirthPorts {
  readonly nation: (id: string) => {readonly urbanisation: number; readonly education: number};
  readonly clamp: (value: number, low: number, high: number) => number;
}

/** The reconstructed total fertility rate for a nation, before any personal modifier. */
export function fertilityRate(nationId: string, ports: BirthPorts): number {
  const nation = ports.nation(nationId);
  return ports.clamp(6.2 - nation.urbanisation / 22 - nation.education / 6, 1.0, 6.0);
}

/**
 * Yearly probability of another child, or null when the couple cannot conceive at all.
 *
 * Returns null before touching any formula, which is what keeps the eligibility
 * guards free of draws.
 */
export function birthProbability(subject: BirthSubject, nationId: string, ports: BirthPorts): number | null {
  if (!subject.partnerAlive || !subject.married) return null;
  if (subject.sex !== 'F' && subject.age > 60) return null;
  const motherAge = subject.sex === 'F' ? subject.age : subject.partnerAge;
  if (motherAge < 16 || motherAge > 46) return null;

  // Oripathy deliberately carries no fertility penalty here; see the file header.
  let tfr = fertilityRate(nationId, ports);
  if (subject.familyTier >= 4) tfr *= 0.8;

  const want = subject.children < Math.round(tfr) ? 1 : SPACING_WEIGHT;
  const p = want * BIRTH_BASE * (1 - Math.abs(motherAge - IDEAL_MOTHER_AGE) / FERTILITY_SPAN);
  return ports.clamp(p, 0, BIRTH_CAP);
}

/** The shape of a congenitally infected newborn, so the field list lives in one place. */
export interface CongenitalInfection {
  readonly at: 0;
  readonly stage: 1;
  readonly crystal: number;
  readonly treated: false;
  readonly known: false;
  readonly art: false;
  readonly congenital: true;
}

export function congenitalInfection(crystal: number): CongenitalInfection {
  return {at: 0, stage: 1, crystal, treated: false, known: false, art: false, congenital: true};
}

/**
 * True when the parent who could transmit carries the disease.
 *
 * The original only checks the mother when the player is female, and only the partner
 * when the player is male — a sex other than `M`/`F` transmits nothing, which is
 * preserved rather than "fixed".
 */
export function congenitalRisk(subject: BirthSubject): boolean {
  if (subject.sex === 'F') return subject.oriStage > 0;
  if (subject.sex === 'M') return subject.partnerOriStage > 0;
  return false;
}
