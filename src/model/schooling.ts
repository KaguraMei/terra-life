/**
 * Schooling: the five gates that decide whether a life keeps studying.
 *
 * The gates are a fixed ladder — six, twelve, fifteen, eighteen, twenty-two — and each
 * rung asks three things: is the nation educated enough, can the household afford it,
 * and does the pupil qualify. Only then is a chance drawn, so the random stream is
 * touched **at most once per year**, and only on a rung whose age matches. That
 * ordering is load-bearing: the compatibility fixture pins every draw, so a gate that
 * rolled before checking its guards would shift every later life.
 *
 * The two lookup tables live here as well (`duration`, `tier`). They used to be inline
 * object literals in `year.js`, which meant the ruling "primary school is six years and
 * worth one education level" was buried inside a settlement function.
 */

export const SCHOOL_DURATION: Readonly<Record<string, number>> = {
  primary: 6,
  middle: 3,
  high: 3,
  uni: 4,
  grad: 3
};

/** The education level a finished stage grants: primary 1 … grad 5. */
export const SCHOOL_TIER: Readonly<Record<string, number>> = {
  primary: 1,
  middle: 2,
  high: 3,
  uni: 4,
  grad: 5
};

export function schoolDuration(level: string): number {
  return SCHOOL_DURATION[level] ?? 3;
}

export function educationTier(level: string): number {
  return SCHOOL_TIER[level] ?? 1;
}

export interface SchoolSubject {
  readonly age: number;
  readonly familyTier: number;
  readonly knowledge: number;
  readonly nationEducation: number;
  readonly nationTertiary: number;
  readonly noSchool: boolean;
  /** The stage the life is currently in, or null when not enrolled. */
  readonly enrolled: string | null;
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

export function schoolSubject(
  state: unknown, nation: {readonly edu: number; readonly ter: number} | null
): SchoolSubject {
  const life = record(state) ?? {};
  const stats = record(life.st) ?? {};
  const flags = record(life.flags) ?? {};
  return {
    age: num(life.age),
    familyTier: num(life.q),
    knowledge: num(stats.sm),
    nationEducation: nation ? nation.edu : 0,
    nationTertiary: nation ? nation.ter : 0,
    noSchool: Boolean(flags.noSchool),
    enrolled: typeof life.school === 'string' && life.school ? life.school : null
  };
}

export interface SchoolPorts {
  readonly random: () => number;
}

/**
 * The rung a life would enter this year, or null.
 *
 * Mirrors the original `else if` chain exactly, including which rungs draw and which
 * do not: primary school is free (no draw at all), while the other four roll. Because
 * the age can only equal one rung, at most one draw happens.
 */
export function schoolGate(subject: SchoolSubject, ports: SchoolPorts): string | null {
  if (subject.enrolled) return null;
  const {age, familyTier: tier, knowledge} = subject;
  const edu = subject.nationEducation;
  const ter = subject.nationTertiary;

  if (age === 6 && edu >= 6 && !subject.noSchool) return 'primary';
  if (age === 12 && edu >= 9 && tier >= 2 && ports.random() < schoolChance('middle', ter)) return 'middle';
  if (age === 15 && edu >= 11 && tier >= 3 && ports.random() < schoolChance('high', ter)) return 'high';
  if (age === 18 && ter >= 30 && tier >= 3 && knowledge >= 55
    && ports.random() < schoolChance('uni', ter)) return 'uni';
  if (age === 22 && ter >= 50 && tier >= 4 && knowledge >= 75
    && ports.random() < schoolChance('grad', ter)) return 'grad';
  return null;
}

/** The chance each rung asks for, exposed so a test can pin the formula separately. */
export function schoolChance(level: string, nationTertiary: number): number {
  switch (level) {
    case 'middle': return 0.55 + nationTertiary / 200;
    case 'high': return 0.35 + nationTertiary / 160;
    case 'uni': return nationTertiary / 130;
    case 'grad': return nationTertiary / 220;
    default: return 1;
  }
}
