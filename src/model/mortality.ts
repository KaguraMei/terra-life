/**
 * Mortality modifiers: the pure factors that turn a base hazard into a number.
 *
 * `causeWeights` (the big weighting pass) is still legacy; this module holds the
 * pieces that carry the *rules* and can be stated without a mutable context:
 * the age band, the cause label, the poverty, ties, discrimination and oripathy
 * multipliers, and the arts rank.
 */
import {BANDS, CAUSES} from '../content/causes';
import type {CauseEntry} from '../content/causes';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord : null;
}

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function rows(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.map(record).filter((row): row is UnknownRecord => row !== null)
    : [];
}

/** Index of the age band an age falls into; the last band is open-ended. */
export function band(age: number): number {
  for (let index = 0; index < BANDS.length; index++) {
    const [low, high] = BANDS[index] as readonly [number, number];
    if (age >= low && age < high) return index;
  }
  return BANDS.length - 1;
}

/**
 * Display name for a cause. The legacy `ocd` bucket keeps an age-dependent label so
 * old reports read as something concrete instead of "other".
 */
export function causeName(cause: string, age: number | null | undefined, table: Record<string, CauseEntry> = CAUSES): string {
  if (cause === 'ocd') {
    if (age != null && age < 1) return '新生儿并发症';
    if (age != null && age < 5) return '儿童感染与营养疾病';
    if (age != null && age < 15) return '儿童疾病或意外';
    if (age != null && age < 50) return '未分类疾病';
    return '多器官衰竭';
  }
  const entry = table[cause];
  return entry ? entry.name : '未知';
}

/** Poverty amplifies the child-causes when the family tier is low. */
export function povertyWeights(weights: Record<string, number>, familyTier: number, clamp: (value: number, low: number, high: number) => number): void {
  const k = clamp(3 - familyTier, 0, 2);
  if (k <= 0) return;
  for (const key of ['neo', 'con', 'inf', 'lri', 'diar', 'nut', 'mal', 'tb']) {
    if (weights[key]) weights[key] = (weights[key] as number) * (1 + 0.35 * k);
  }
}

/** Ties to other people: a partner and surviving children both protect. */
export function tiesMultiplier(state: unknown): number {
  const life = record(state) ?? {};
  const age = num(life.age);
  const family = record(life.fam) ?? {};
  const partner = record(family.partner);
  const hasPartner = partner !== null && partner.alive === true && family.married === true;
  const kids = rows(family.kids).filter(kid => kid.alive === true).length;
  const social = record(life.st);

  let k = 1;
  if (age >= 20) {
    if (hasPartner) k *= 0.90;
    else if (age >= 30) k *= 1.12;
    if (kids > 0) k *= 1 - Math.min(0.10, kids * 0.035);
    const so = num(social?.so);
    if (so >= 70) k *= 0.93;
    else if (so <= 25) k *= 1.18;
  }
  const mom = record(family.mom);
  if (mom && mom.alive === false && age < 18) k *= 1.10;
  return k;
}

/** Structural risk of discrimination, plus being a minority abroad. */
export function raceMultiplier(state: unknown, discrimination: number): number {
  const life = record(state) ?? {};
  const age = num(life.age);
  let k = 1;
  if (age >= 1) k *= 1 + discrimination * 0.30;
  if (life.race === 'sarkaz' && life.nation !== 'KDZ') k *= 1.10;
  if (life.race === 'aegir' && life.nation !== 'AEG') k *= 1.06;
  return k;
}

export interface ToleranceLike {
  /** > 0 when the nation arrests known infected people. */
  readonly arrest: number;
  /** < 1 lowers an infected life's survival. */
  readonly lifeK: number;
}

/** Oripathy multiplier: stage, time since infection, treatment, arts, tolerance. */
export function oripathyMultiplier(state: unknown, age: number, tolerance: ToleranceLike): number {
  const life = record(state) ?? {};
  const ori = record(life.ori);
  if (!ori) return 1;
  const stage = num(ori.stage);
  if (stage <= 0) return 1;

  const since = age - num(ori.at);
  const base = [1, 1.7, 3.2, 7.5][stage] ?? 7.5;
  let k = base;
  if (since > 10 && stage < 3) k *= 1 + (since - 10) * 0.02;
  if (ori.treated === true) k *= 0.50;
  if (ori.art === true) k *= 0.85;
  if (tolerance.lifeK < 1) k *= 1 / Math.max(0.15, tolerance.lifeK);
  return k;
}

/** Arts proficiency rank from the raw value. */
export function artsRank(arts: number): number {
  const value = arts || 0;
  if (value >= 88) return 4;
  if (value >= 68) return 3;
  if (value >= 45) return 2;
  if (value >= 22) return 1;
  return 0;
}

const ART_RANK_ZH = ['无适应性', '微弱', '中等', '优秀', '极强'] as const;
const ART_RANK_EN = ['None', 'Faint', 'Moderate', 'Strong', 'Exceptional'] as const;

export function artsRankName(rank: number, language: 'zh' | 'en' = 'zh'): string {
  const table = language === 'en' ? ART_RANK_EN : ART_RANK_ZH;
  return table[rank] ?? table[0];
}
