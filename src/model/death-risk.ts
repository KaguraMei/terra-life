/**
 * Death risk and cause selection: the last legacy piece of the mortality model.
 *
 * This module starts with an explicit **subject contract** (`MortalitySubject`)
 * instead of reading `S.x` ad hoc: the fields the model consumes are listed once,
 * optional ones are marked, and `subjectFromState` is the only place that touches
 * an untyped life object. Everything below it works on the contract.
 *
 * Two rules from the original are preserved verbatim because they are easy to break:
 *   - the *fast* variables (timeline events, tolerance) multiply this year's risk,
 *     they never rewrite the slow life table;
 *   - cause weights do not add risk, they only decide *what* the risk looks like.
 */
import {BANDS, CAUSES, RESIDUAL_CAUSE_BASE, COLD_NATIONS, HEAT_NATIONS, ISLAND_NATIONS, SEA_NATIONS} from '../content/causes';
import type {CauseEntry} from '../content/causes';
import {artsRank, causeName, oripathyMultiplier, povertyWeights, raceMultiplier, tiesMultiplier} from './mortality';
import type {ToleranceLike} from './mortality';
import {expHealth} from './life-table';
import type {LifeTable, NationHazard} from './life-table';

export interface MortalCondition {
  readonly treated: boolean;
}

export interface OripathyState {
  readonly stage: number;
  readonly crystal: number;
  /** Age at infection. */
  readonly at: number;
  readonly treated: boolean;
  readonly art: boolean;
}

/** Everything the death model reads from a life. Unknown input yields inert defaults. */
export interface MortalitySubject {
  readonly age: number;
  readonly nation: string;
  readonly stratum: string;
  readonly sex: string;
  readonly race: string;
  readonly year: number;
  readonly familyTier: number;
  /** Continental income percentile, 0..1. */
  readonly percentile: number;
  readonly careerPercentile: number;
  readonly smoker: boolean;
  readonly exSmoker: boolean;
  readonly drug: boolean;
  readonly alcohol: boolean;
  readonly refugee: boolean;
  readonly serveLeft: number;
  readonly arts: number;
  readonly job: string;
  /** Health attribute, the frailty term's input. */
  readonly health: number;
  readonly ori: OripathyState | null;
  readonly conditions: Readonly<Record<string, MortalCondition>>;
  readonly underwaterBreathing: boolean;
}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
// Legacy code tested these with truthiness (`S.smoker ? …`), and some flags are
// stored as 1 rather than true; comparing with `=== true` would silently drop them.
const flag = (value: unknown): boolean => Boolean(value);

/** The single place that reads an untyped life object. */
export function subjectFromState(state: unknown): MortalitySubject {
  const life = record(state) ?? {};
  const flags = record(life.flags) ?? {};
  const health = record(life.st);
  const ori = record(life.ori);
  const traits = record(life.traits) ?? {};
  const conditions: Record<string, MortalCondition> = {};
  for (const [key, value] of Object.entries(record(life.conds) ?? {})) {
    const condition = record(value);
    if (condition) conditions[key] = {treated: Boolean(condition.treated)};
  }

  return {
    age: num(life.age),
    nation: text(life.nation),
    stratum: text(life.stratum),
    sex: text(life.sex),
    race: text(life.race),
    year: num(life.year),
    familyTier: num(life.q),
    percentile: num(life.pct),
    careerPercentile: num(flags.careerPct),
    smoker: flag(life.smoker),
    exSmoker: flag(flags.exSmoker),
    drug: flag(life.drug),
    alcohol: flag(life.alc),
    refugee: flag(life.refugee),
    serveLeft: num(life.serveLeft),
    arts: num(life.arts),
    job: text(life.job),
    health: num(health?.hl),
    ori: ori ? {
      stage: num(ori.stage),
      crystal: num(ori.crystal),
      at: num(ori.at),
      treated: flag(ori.treated),
      art: flag(ori.art)
    } : null,
    conditions,
    underwaterBreathing: flag(traits.underwaterBreathing)
  };
}

/** Content lookups the model needs but does not own. */
export interface MortalityPorts {
  readonly nation: (id: string) => NationHazard & {
    readonly reg: string;
    /** Oripathy pressure multiplier. */
    readonly ori: number;
    /** Catastrophe pressure multiplier. */
    readonly cat: number;
    /** Baseline homicide pressure. */
    readonly hom: number;
    /** Road-traffic pressure. */
    readonly road: number;
    /** Smoking prevalence, percent. */
    readonly smk: number;
    /** War pressure. */
    readonly war: number;
  };
  readonly causeTable: (region: string, band: number) => Record<string, number>;
  readonly timelineMods: (nationId: string, year: number) => {
    readonly war: number;
    readonly cat: number;
    readonly ori: number;
    readonly tol: number;
    readonly mort: number;
  };
  readonly tolerance: (nationId: string, year: number) => ToleranceLike;
  readonly jobRisk: (job: string) => Record<string, number> | undefined;
  readonly discrimination: (state: unknown) => number;
  readonly pickWeighted: (weights: Record<string, number>) => string;
  readonly clamp: (value: number, low: number, high: number) => number;
  readonly causes: Record<string, CauseEntry>;
  /** Income-gradient coefficient per region. */
  readonly incomeGradient: (region: string) => number;
}

export interface DeathRiskInput {
  readonly subject: MortalitySubject;
  readonly table: LifeTable;
  readonly ports: MortalityPorts;
  /** The raw life object, needed only by the social-ties multiplier. */
  readonly state: unknown;
}

/**
 * One year's death probability, 0..1.
 *
 * Multipliers are clamped (0.25..9) and the frailty term has a floor so a single
 * terrible year cannot produce a certainty out of nothing.
 */
export function deathRisk({subject, table, ports, state}: DeathRiskInput): number {
  if (subject.ori && subject.ori.stage > 0 && subject.ori.crystal >= 100) return 1;
  const nation = ports.nation(subject.nation);
  const age = subject.age;
  const base = age >= table.maxAge ? 1 : (table.q[age] ?? 1);

  let m = 1;

  // Fast variables: this year only, never the life table.
  const timeline = ports.timelineMods(nation.id, subject.year);
  if (timeline.mort !== 1) m *= timeline.mort;
  if (timeline.war) m *= 1 + timeline.war * 0.35;

  // Frailty: the equilibrium offset is why an average life ends up at m = 1.
  const offset = 13
    + (age < 15 ? nation.u5 / 20 : 0)
    + (age > 50 ? (age - 50) * 0.08 : 0);
  m *= Math.max(0.5, Math.exp((expHealth(age) - offset - subject.health) * (age < 5 ? 0.02 : 0.03)));

  // Income gradient, centred on the median tier rather than 0.5.
  const gradient = ports.incomeGradient(nation.reg);
  const tier = age < 18
    ? subject.familyTier
    : ports.clamp(Math.max(subject.percentile, subject.careerPercentile) * 5, 0, 5);
  const centre = 2.5;
  let norm = 0;
  for (let t = 0; t <= 5; t += 0.5) norm += Math.exp(-gradient * (t - centre));
  norm /= 11;
  m *= Math.exp(-gradient * (tier - centre)) / norm;

  // Habits.
  if (age >= 25) {
    const prevalence = (subject.sex === 'F' ? nation.smk * 0.6 : nation.smk) / 100;
    const smoking = subject.smoker ? 1.7 : (subject.exSmoker ? 1.25 : 1);
    m *= smoking / (1 + 0.7 * prevalence);
  }
  if (subject.alcohol && age >= 18) m *= 1.30;
  if (subject.drug && age >= 16) m *= 2;

  // Diagnosed conditions: untreated ones cost 30%.
  for (const condition of Object.values(subject.conditions)) {
    m *= condition.treated ? 1.0 : 1.3;
  }

  // Standing in the world.
  if (subject.refugee) m *= 1.15;
  if (subject.job === 'prison' || subject.job === 'slave') m *= 1.6;
  if (subject.serveLeft > 0 && nation.war > 0) m *= 1 + nation.war * 0.45;

  // Ties, discrimination, oripathy. `discrimination` reads court, year and traits,
  // so it needs the full life rather than the normalised subject.
  m *= tiesMultiplier(state);
  m *= raceMultiplier({age, race: subject.race, nation: subject.nation}, ports.discrimination(state));
  m *= oripathyMultiplier({ori: subject.ori}, age, ports.tolerance(subject.nation, subject.year));

  // Late-life convergence keeps the very old from being immortal or doomed.
  if (age >= 85) m = Math.pow(m, ports.clamp(1 - (age - 85) / 20, 0.3, 1));

  return 1 - Math.pow(1 - base, ports.clamp(m, 0.25, 9));
}

/* --- cause weights ------------------------------------------------------- */

/** Residual split shared by the weights pass and the expansion step. */
export function residualCauseWeights(subject: MortalitySubject, age: number, ports: MortalityPorts): Record<string, number> {
  const nation = ports.nation(subject.nation);
  const out: Record<string, number> = {};
  const base = RESIDUAL_CAUSE_BASE[bandIndex(age)] ?? RESIDUAL_CAUSE_BASE[5] ?? {};
  for (const [key, weight] of Object.entries(base)) out[key] = weight;

  // Environment changes *what* the residual is, not how much of it there is.
  if (nation.reg === 'south' && age < 70) {
    out.inf = (out.inf || 0) * 1.45;
    out.heat = (out.heat || 0) + 7;
  }
  if (nation.reg === 'north' && age >= 1 && age < 70) {
    out.cold = (out.cold || 0) + 7;
  }
  if (nation.reg === 'waste') {
    out.inj = (out.inj || 0) * 1.25;
    out.cat = (out.cat || 0) + 7;
  }
  if (nation.reg === 'sea') {
    out.drown = (out.drown || 0) + 6;
    if (age >= 15 && age < 70) out.sea = (out.sea || 0) + 4;
  }
  if (subject.stratum === 'wild') {
    out.inj = (out.inj || 0) * 1.25;
    out.inf = (out.inf || 0) * 1.20;
  } else if (subject.stratum === 'core') {
    out.ihd = (out.ihd || 0) * 1.20;
    out.can = (out.can || 0) * 1.10;
  }
  return out;
}

function bandIndex(age: number): number {
  for (let index = 0; index < BANDS.length; index++) {
    const [low, high] = BANDS[index] as readonly [number, number];
    if (age >= low && age < high) return index;
  }
  return BANDS.length - 1;
}

/** Replace the legacy `ocd` bucket with concrete causes before the draw. */
export function expandResidualWeights(weights: Record<string, number>, subject: MortalitySubject, age: number, ports: MortalityPorts): void {
  const residual = weights.ocd;
  if (!(typeof residual === 'number' && residual > 0)) return;
  delete weights.ocd;

  const parts = residualCauseWeights(subject, age, ports);
  let total = 0;
  for (const value of Object.values(parts)) total += Math.max(0, value);
  if (!(total > 0)) {
    weights.inj = (weights.inj || 0) + residual;
    return;
  }
  for (const [key, value] of Object.entries(parts)) {
    const share = Math.max(0, value) / total;
    if (share > 0) weights[key] = (weights[key] || 0) + residual * share;
  }
}

/**
 * The cause distribution for one death.
 *
 * `other` suppresses personal modifiers — it is used when the death is caused by
 * something the simulation already picked (a catastrophe, an execution).
 */
export function causeWeights(subject: MortalitySubject, age: number, other: boolean, ports: MortalityPorts): Record<string, number> {
  const nation = ports.nation(subject.nation);
  const band = bandIndex(age);
  const base = ports.causeTable(nation.reg, band) ?? {};
  const weights: Record<string, number> = {};
  for (const [key, value] of Object.entries(base)) weights[key] = value;

  /* Stratum: the main axis of Terra's cause structure. */
  if (subject.stratum === 'wild') {
    for (const key of ['cat', 'inj', 'inf', 'cold', 'heat', 'drown', 'fall']) {
      if (weights[key]) weights[key] *= 2.6;
      else if (age >= 1) weights[key] = 6;
    }
    if (age >= 1) {
      weights.beast = 5;
      weights.starv = age < 12 ? 5 : 2;
    }
    for (const key of ['ihd', 'str', 'can', 'dem', 'copd']) {
      if (weights[key]) weights[key] *= 0.45;
    }
    if (weights.ocd) weights.ocd *= 0.6;
  } else if (subject.stratum === 'fringe') {
    for (const key of ['inj', 'inf', 'cat']) {
      if (weights[key]) weights[key] *= 1.6;
    }
    if (age >= 15) weights.hom = (weights.hom || 1) * 1.5;
  } else if (subject.stratum === 'core') {
    for (const key of ['ihd', 'str', 'can', 'dem', 'dia']) {
      if (weights[key]) weights[key] *= 1.35;
    }
    for (const key of ['inj', 'cat', 'inf']) {
      if (weights[key]) weights[key] *= 0.45;
    }
  }

  /* Nation: the fast variables enter here, not in the life table. */
  const timeline = ports.timelineMods(nation.id, subject.year);

  if (weights.ori != null || nation.ori > 1.0) {
    weights.ori = (weights.ori || 1) * Math.pow(Math.max(0.05, nation.ori) / 1.5, 0.85);
    if (timeline.ori) weights.ori *= 1 + timeline.ori;
  }
  if (weights.cat != null || nation.cat > 0.8) {
    weights.cat = (weights.cat || 1) * Math.pow(Math.max(0.05, nation.cat) / 1.0, 0.9);
    if (timeline.cat) weights.cat *= 1 + timeline.cat;
  }
  if (weights.sea != null && SEA_NATIONS.indexOf(nation.id) < 0) delete weights.sea;

  const warFactor = Math.max(0, nation.war + timeline.war);
  const homicide = warFactor > 0 ? Math.min(nation.hom, 6) : nation.hom;
  if (weights.hom != null) weights.hom = weights.hom * Math.pow(homicide / 3, 0.85);
  else if (age >= 15) weights.hom = homicide * (age < 50 ? 0.33 : age < 70 ? 0.06 : 0.0075);
  if (weights.road != null) weights.road = weights.road * nation.road / 12;

  if (warFactor > 0 && age >= 1) {
    weights.war = (weights.war || 0)
      + (age >= 15 && age < 50 ? (subject.sex === 'M' ? 8 : 3) : 2) * warFactor;
  } else if (!warFactor) {
    delete weights.war;
  }

  /* Known infected people in a low-tolerance nation: execution and forced labour. */
  if (subject.ori && subject.ori.stage > 0) {
    const tolerance = ports.tolerance(subject.nation, subject.year);
    if (tolerance.arrest > 0 && age >= 12) {
      let total = 0;
      for (const value of Object.values(weights)) total += value;
      weights.exec = total * tolerance.arrest * 0.55;
      weights.slave = total * tolerance.arrest * 0.40;
    }
  }

  if (ISLAND_NATIONS.indexOf(nation.id) >= 0) {
    if (weights.ihd) weights.ihd *= 0.6;
    if (weights.can) weights.can *= 1.2;
    if (age >= 70) weights.lri = (weights.lri || 2) * 2.0;
  }
  if (COLD_NATIONS.indexOf(nation.id) >= 0) {
    if (age >= 1 && age < 70) weights.cold = (weights.cold || 2) * (2.2 - age / 60);
  } else {
    delete weights.cold;
  }
  if (HEAT_NATIONS.indexOf(nation.id) >= 0) {
    if (age >= 1 && age < 70) weights.heat = (weights.heat || 1.5) * 1.6;
  } else {
    delete weights.heat;
  }

  if (subject.sex === 'F' && age >= 15 && age < 30 && weights.hom) weights.hom *= 0.25;
  if (subject.sex === 'F' && age >= 15 && age < 50 && weights.road) weights.road *= 0.4;
  if (subject.sex === 'F' && weights.inj) weights.inj *= 0.4;

  /* Personal modifiers. */
  if (!other) {
    if (subject.smoker || subject.exSmoker) {
      const k = subject.smoker ? 1 : 0.5;
      for (const key of ['can', 'copd', 'ihd', 'str']) {
        if (weights[key]) {
          weights[key] *= 1 + k * (key === 'copd' ? 2 : key === 'can' ? 0.8 : 0.4);
        }
      }
    }
    if (subject.conditions.htn) for (const key of ['ihd', 'str', 'kid']) if (weights[key]) weights[key] *= 1.35;
    if (subject.conditions.dm) {
      if (weights.dia) weights.dia *= 2.2;
      for (const key of ['ihd', 'kid']) if (weights[key]) weights[key] *= 1.25;
    }
    if (subject.conditions.heart && weights.ihd) weights.ihd *= 1.8;
    if (subject.drug) weights.oinf = (weights.oinf || 0.5) * 12;

    const jobRisk = ports.jobRisk(subject.job);
    if (jobRisk) for (const [key, factor] of Object.entries(jobRisk)) weights[key] = (weights[key] || 1) * factor;

    if (subject.alcohol) {
      weights.cir = (weights.cir || 0.5) * 6;
      for (const key of ['road', 'inj', 'fall', 'hom']) if (weights[key]) weights[key] *= 2;
      weights.alc = (weights.alc || 1) * 3;
    }

    if (subject.ori && subject.ori.stage > 0) {
      let total = 0;
      for (const [key, value] of Object.entries(weights)) if (key !== 'ori') total += value;
      const share = ([0, 0.18, 0.42, 0.78][subject.ori.stage] ?? 0.78) * (subject.ori.treated ? 0.55 : 1);
      weights.ori = total * share / Math.max(0.05, 1 - share);
    } else {
      delete weights.ori;
    }

    const rank = artsRank(subject.arts);
    if (rank >= 2 && age >= 15) {
      let total = 0;
      for (const [key, value] of Object.entries(weights)) if (key !== 'art') total += value;
      const share = 0.03 * rank * (subject.ori ? 1.6 : 1);
      weights.art = total * share / Math.max(0.2, 1 - share);
    } else {
      delete weights.art;
    }

    if (age < 15) povertyWeights(weights, subject.familyTier, ports.clamp);
  }

  // The legacy residual bucket must be expanded before the draw.
  expandResidualWeights(weights, subject, age, ports);

  // Only the rare individual trait exempts an Aegir from drowning; "aquatic race"
  // is not enough.
  if (subject.race === 'aegir' && subject.underwaterBreathing) delete weights.drown;

  for (const [key, value] of Object.entries(weights)) if (!(value > 0)) delete weights[key];
  return weights;
}

/** Pick one cause, honouring the terminal 100% crystal threshold. */
export function pickCause(subject: MortalitySubject, age: number, other: boolean, ports: MortalityPorts): string {
  if (!other && subject.ori && subject.ori.stage > 0 && subject.ori.crystal >= 100) return 'ori';
  return ports.pickWeighted(causeWeights(subject, age, other, ports));
}

/** Label for a cause id, age-aware for the legacy bucket. */
export function causeLabel(cause: string, age: number | null | undefined, ports: MortalityPorts): string {
  return causeName(cause, age, ports.causes ?? CAUSES);
}
