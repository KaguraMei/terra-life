/**
 * Oripathy: the disease model behind everything that makes Terra not-Earth.
 *
 * The lifetime risk is drawn once and then *spent* over a fixed exposure window, so
 * the annual risk never changes with age. That is a deliberate fix of an older
 * design (see `annualFrom`): spreading the lifetime risk over "years remaining"
 * made anyone outliving their life expectancy gamble the whole lifetime risk every
 * year, inflating the measured infection rate by tens of percent.
 *
 * Everything here is pure; the mutating steps (`infect`, the yearly progression)
 * stay in the legacy engine for now and call back into these helpers.
 */
import {
  EXPOSE_FROM, JOB_LIFETIME_RISK, NATION_LIFETIME_RISK, ORI_STAGES, STAGE_GATE
} from '../content/oripathy';
import type {LanguageCode} from '../content/locales';
import type {LifeTable} from './life-table';
import {artsRank} from './mortality';

export type {OripathyStage} from '../content/oripathy';
export {ORI_STAGES} from '../content/oripathy';

export interface OripathyState {
  readonly stage: number;
  readonly crystal: number;
  /** Age at infection. */
  readonly at: number;
  readonly known: boolean;
  readonly treated: boolean;
  readonly provider: string | null;
}

/** What the oripathy model reads from a life. */
export interface OripathySubject {
  readonly age: number;
  readonly nation: string;
  readonly stratum: string;
  readonly race: string;
  readonly year: number;
  readonly familyTier: number;
  readonly arts: number;
  readonly job: string;
  readonly money: number;
  readonly health: number;
  readonly knowledge: number;
  readonly happiness: number;
  readonly opRank: string | null;
  readonly ori: OripathyState | null;
  /** Cached lifetime probability, once drawn. */
  readonly lifetimeRisk: number | null;
  readonly postCatastrophe: boolean;
  readonly surge: boolean;
  readonly reunion: boolean;
}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const flag = (value: unknown): boolean => Boolean(value);

export function subjectFromState(state: unknown): OripathySubject {
  const life = record(state) ?? {};
  const flags = record(life.flags) ?? {};
  const stats = record(life.st) ?? {};
  const ori = record(life.ori);
  const cachedRisk = flags.oriP;

  return {
    age: num(life.age),
    nation: text(life.nation),
    stratum: text(life.stratum),
    race: text(life.race),
    year: num(life.year),
    familyTier: num(life.q),
    arts: num(life.arts),
    job: text(life.job),
    money: num(life.money),
    health: num(stats.hl),
    knowledge: num(stats.sm),
    happiness: num(stats.h),
    opRank: typeof life.opRank === 'string' ? life.opRank : null,
    ori: ori ? {
      stage: num(ori.stage),
      crystal: num(ori.crystal),
      at: num(ori.at),
      known: flag(ori.known),
      treated: flag(ori.treated),
      provider: typeof ori.provider === 'string' ? ori.provider : null
    } : null,
    lifetimeRisk: typeof cachedRisk === 'number' ? cachedRisk : null,
    postCatastrophe: flag(flags.postCatastrophe),
    surge: flag(flags.oriSurge),
    reunion: flag(flags.reunion)
  };
}

export interface OripathyPorts {
  readonly nation: (id: string) => {readonly med: number; readonly ppp: number};
  readonly stratumRisk: (id: string) => readonly [number, number];
  /** Race susceptibility multiplier, 1 being neutral. */
  readonly raceRisk: (id: string) => number;
  readonly timelineMods: (nationId: string, year: number) => {readonly ori: number};
  readonly tolerance: (nationId: string, year: number) => {
    readonly lifeK: number;
    readonly arrest: number;
    readonly treatP: number;
    readonly tier: number;
  };
  readonly toleranceValue: (nationId: string, year: number) => number;
  readonly discrimination: (state: unknown) => number;
  readonly opRankNeed: (rank: string) => number;
  readonly clamp: (value: number, low: number, high: number) => number;
}

/* --- stage bookkeeping --------------------------------------------------- */

export function stageOf(crystal: number): number {
  if (crystal >= (STAGE_GATE[2] as number)) return 3;
  if (crystal >= (STAGE_GATE[1] as number)) return 2;
  if (crystal > 0) return 1;
  return 0;
}

export function stageName(stage: number, language: LanguageCode = 'zh'): string {
  const entry = ORI_STAGES[stage] ?? ORI_STAGES[0];
  if (!entry) return '';
  return language === 'en' && entry.en ? entry.en : entry.name;
}

/* --- lifetime and annual risk -------------------------------------------- */

/**
 * Lifetime infection probability (0..1), fixed once per life.
 *
 * Precedence: a national special case wins; then a hazardous job's band; then the
 * stratum's band. Individual factors then scale the midpoint.
 */
export function lifetimeProbability(subject: OripathySubject, ports: OripathyPorts): number {
  if (subject.lifetimeRisk != null) return subject.lifetimeRisk;

  const national = NATION_LIFETIME_RISK[subject.nation];
  const job = JOB_LIFETIME_RISK[subject.job];
  let low: number;
  let high: number;

  if (national) {
    [low, high] = national as readonly [number, number];
    // Even a hazardous job only approaches the ceiling in Kazdel.
    if (job && subject.nation !== 'KDZ') {
      low = Math.max(low, job[0] * 0.8);
      high = Math.max(high, job[1] * 0.8);
    }
  } else if (job) {
    [low, high] = job as readonly [number, number];
  } else {
    [low, high] = ports.stratumRisk(subject.stratum);
  }

  let k = 1;
  k *= ports.raceRisk(subject.race);
  k *= 1 + (3 - subject.familyTier) * 0.14;                 // poverty: closer, less protection
  k *= 1.15 - ports.nation(subject.nation).med * 0.30;      // medicine and labour protection
  k *= 1 + artsRank(subject.arts) * 0.07;                   // higher arts = more sensitive

  const timeline = ports.timelineMods(subject.nation, subject.year);
  if (timeline.ori) k *= 1 + timeline.ori;

  return ports.clamp(((low + high) / 2) * k, 0.0005, 0.88);
}

/**
 * Convert a lifetime risk into a fixed annual risk over the exposure window
 * `[EXPOSE_FROM, min(e0 + 6, 90)]`.
 *
 * Do not spread it over "years remaining": anyone who outlives e0 would then gamble
 * the whole lifetime risk every year, which is exactly the bug this replaced.
 */
export function annualFrom(lifetime: number, table: Pick<LifeTable, 'e0'>): number {
  const start = EXPOSE_FROM;
  const end = Math.max(start + 1, Math.min(table.e0 + 6, 90));
  return 1 - Math.pow(1 - lifetime, 1 / (end - start));
}

/** This year's infection risk, 0 when already infected. */
export function annualRisk(subject: OripathySubject, table: Pick<LifeTable, 'e0'>, ports: OripathyPorts): number {
  if (subject.ori && subject.ori.stage > 0) return 0;
  const lifetime = lifetimeProbability(subject, ports);
  if (lifetime <= 0) return 0;

  let p = annualFrom(lifetime, table);
  if (subject.postCatastrophe) p *= 2.6;   // clearing rubble after a catastrophe
  if (subject.surge) p *= 8;               // acute exposure event
  if (subject.job === 'slave') p *= 3.2;   // mine labour
  if (subject.age < EXPOSE_FROM) p *= 0.5;

  return ports.clamp(p, 0, 0.55);
}

/* --- social consequences ------------------------------------------------- */

/** Social penalty of being a known infected person in this nation. */
export function stigma(subject: OripathySubject, ports: OripathyPorts): number {
  if (!subject.ori || subject.ori.stage <= 0) return 0;
  const tolerance = ports.toleranceValue(subject.nation, subject.year);
  let value = (100 - tolerance) / 100;
  value *= 0.55 + 0.15 * subject.ori.stage;
  if (!subject.ori.known) value *= 0.45;
  if (subject.ori.treated && subject.ori.provider === 'rhodes') value *= 0.72;
  return ports.clamp(value, 0, 0.97);
}

/** Race discrimination plus the infection penalty. */
export function totalDiscrimination(state: unknown, subject: OripathySubject, ports: OripathyPorts): number {
  return ports.clamp(ports.discrimination(state) + stigma(subject, ports) * 0.9, 0, 0.97);
}

/** How far systemic exclusion pushes someone toward Reunion (0..1). */
export function reunionLean(state: unknown, subject: OripathySubject, ports: OripathyPorts): number {
  if (!subject.ori || subject.ori.stage <= 0) return 0;
  let lean = stigma(subject, ports) * 0.6 + ports.discrimination(state) * 0.35;
  lean += (3 - subject.familyTier) * 0.06;
  lean -= subject.happiness * 0.004;
  if (subject.ori.known) lean += 0.12;
  if (!subject.ori.treated) lean += 0.10;
  lean += ports.tolerance(subject.nation, subject.year).arrest * 0.5;
  return ports.clamp(lean, 0, 1);
}

/** Arts combat value; operators get a bonus from their rank requirement. */
export function combatValue(subject: OripathySubject, ports: OripathyPorts): number {
  let value = artsRank(subject.arts) * 22 + subject.health * 0.35 + subject.knowledge * 0.15;
  if (subject.ori && subject.ori.stage > 0) value += subject.ori.stage * 9;
  if (subject.opRank) value += ports.opRankNeed(subject.opRank) * 1.2;
  return Math.round(value);
}

/** Chance an infected person can actually get treatment. */
export function treatmentAccess(subject: OripathySubject, ports: OripathyPorts): number {
  const tolerance = ports.tolerance(subject.nation, subject.year);
  let p = tolerance.treatP;
  p += ports.nation(subject.nation).med * 0.25;
  p += (subject.familyTier - 3) * 0.06;
  if (subject.reunion) p -= 0.10;
  return ports.clamp(p, 0, 0.85);
}

/* --- annual progression -------------------------------------------------- */

/** How much a year's treatment slows the crystals, by provider. */
export const TREATMENT_SUPPRESSION: Readonly<Record<string, number>> = {
  rhodes: 0.26,
  default: 0.50
};

export function treatmentSuppression(provider: string | null): number {
  return TREATMENT_SUPPRESSION[provider ?? ''] ?? TREATMENT_SUPPRESSION.default as number;
}

/** The yearly bill for treatment, as a multiple of the nation's price level. */
export function treatmentCost(nationPpp: number, provider: string | null): number {
  return nationPpp * (provider === 'rhodes' ? 2.6 : 1.2);
}

/** Crystal growth per year before the random multiplier, and before treatment. */
export function crystalGrowth(subject: OripathySubject, ports: OripathyPorts): number {
  if (!subject.ori || subject.ori.stage <= 0) return 0;
  let grow = 2.4;
  grow *= 1 + artsRank(subject.arts) * 0.22;               // stronger arts, livelier crystals
  grow *= [1, 1.0, 1.35, 1.6][subject.ori.stage] ?? 1;     // late stages accelerate
  grow *= 1 + (3 - subject.familyTier) * 0.10;             // poverty means no protection
  grow *= 1.6 - subject.health / 140;                      // a worn body tolerates less
  // Low-tolerance nations ban the medicine that would slow it down.
  grow *= 1 + (1 - ports.tolerance(subject.nation, subject.year).lifeK) * 0.55;
  return grow;
}
