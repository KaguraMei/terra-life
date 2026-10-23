/**
 * Family: the people a life is born next to, and the jobs they hold.
 *
 * None of these are player-facing rules, and that is exactly why they drifted: a
 * relative's job is one line in the "family and life" panel, so nobody noticed that
 * military and artistic careers were drawn as often as farming. The damping is
 * deliberate — a civilian's sibling is far more likely to be a farmhand than a
 * mercenary — and it is now written down and tested instead of living in a loop.
 *
 * **Draw order is the contract.** Each attempt at a job costs one uniform for the pool
 * pick, plus one more *only* when the candidate is military or artistic, because those
 * two branches roll their own damping. Skipping that second roll for other sectors
 * would shift every later draw in the life.
 */

/** The civilian job vocabulary a relative may hold, before nationality filters. */
export const NPC_POOL: readonly string[] = [
  'farm', 'farmhand', 'herder', 'fisher', 'hunter', 'agbiz',
  'miner', 'oriminer', 'refiner', 'factory', 'construct', 'smith', 'mechanic', 'engineer',
  'vendor', 'shop', 'cook', 'driver', 'courier', 'inn', 'tailor', 'barber',
  'domestic', 'performer', 'teacher', 'clerk', 'nurse', 'doctor',
  'scholar', 'journalist', 'lawyer', 'banker', 'official',
  'soldier', 'guard', 'police', 'mercenary', 'bounty',
  'artsmith', 'caster', 'alchemist', 'witch', 'merchant', 'shopowner', 'noble'
];

/** How many attempts a relative's job gets before falling back to a vendor. */
export const NPC_JOB_ATTEMPTS = 24;
/** Military careers are damped: 82% of candidates are rejected outright. */
export const MILITARY_REJECT = 0.82;
/** Arts careers are damped harder: 70% rejected. */
export const ARTS_REJECT = 0.7;
/** Where a relative lands when no attempt succeeds. */
export const NPC_FALLBACK_JOB = 'vendor';
/** Where a relative lands when even the fallback is unavailable in their nation. */
export const NPC_NO_JOB = 'seeking';

/** Sibling count distribution: most lives have one or two, few have four. */
export const SIBLING_WEIGHTS: Readonly<Record<string, number>> = {'0': 22, '1': 34, '2': 26, '3': 13, '4': 5};

export interface NpcJobSubject {
  readonly nation: string;
  readonly race: string;
  readonly sex: string;
}

export interface NpcJobPorts {
  readonly random: () => number;
  /** The registry entry, or null when the id is unknown. */
  readonly job: (id: string) => {readonly section: string; readonly sex?: string | null} | null;
  readonly jobAvailable: (id: string, nation: string, race: string) => boolean;
}

/**
 * Draw a civilian job for a relative.
 *
 * Up to 24 attempts: pick from the pool, reject unknown ids, reject jobs the nation or
 * race does not allow, reject sex-restricted jobs for the wrong sex, then damp military
 * and arts careers. The first survivor wins; otherwise the relative becomes a vendor,
 * or jobless if even that is unavailable.
 */
export function npcJob(subject: NpcJobSubject, ports: NpcJobPorts): string {
  for (let attempt = 0; attempt < NPC_JOB_ATTEMPTS; attempt++) {
    const id = NPC_POOL[Math.floor(ports.random() * NPC_POOL.length)] ?? '';
    const job = ports.job(id);
    if (!job) continue;
    if (!ports.jobAvailable(id, subject.nation, subject.race)) continue;
    if (job.sex && job.sex !== subject.sex) continue;
    if (job.section === 'mil' && ports.random() < MILITARY_REJECT) continue;
    if (job.section === 'art' && ports.random() < ARTS_REJECT) continue;
    return id;
  }
  return ports.jobAvailable(NPC_FALLBACK_JOB, subject.nation, subject.race)
    ? NPC_FALLBACK_JOB : NPC_NO_JOB;
}

/** The age at which a relative stops being a child, starts school, and may retire. */
export const CHILD_UNTIL = 7;
export const SCHOOL_UNTIL = 16;
export const RETIRE_FROM = 67;
/** The chance that a relative past retirement age actually stopped working. */
export const RETIRE_CHANCE = 0.7;

export interface AgeJobPorts extends NpcJobPorts {
  readonly chance: (p: number) => boolean;
}

/**
 * The job a relative of a given age would hold.
 *
 * Ages are checked in order: a child below seven, a student below sixteen, then a
 * retirement roll past sixty-six, and only then a real career. The roll happens *before*
 * the career draw, so an older relative can consume one extra uniform.
 */
export function ageJob(age: number, subject: NpcJobSubject, ports: AgeJobPorts): string {
  if (age < CHILD_UNTIL) return 'child';
  if (age < SCHOOL_UNTIL) return 'student';
  if (age > RETIRE_FROM - 1 && ports.chance(RETIRE_CHANCE)) return 'retired';
  return npcJob(subject, ports);
}

/** How many siblings a newborn has, drawn from the documented weights. */
export function siblingCount(weights: Readonly<Record<string, number>>, random: () => number): number {
  const keys = Object.keys(weights);
  let total = 0;
  for (const key of keys) total += Math.max(0, weights[key] ?? 0);
  if (total <= 0) return 0;

  let remaining = random() * total;
  for (const key of keys) {
    remaining -= Math.max(0, weights[key] ?? 0);
    if (remaining <= 0) return Number(key);
  }
  return Number(keys[keys.length - 1]);
}

/** A sibling's age offset, anchored to the mother so an elder sibling cannot out-age her. */
export const SIBLING_GAP_MAX = 7;
export const MOTHER_MAX_CHILD_AGE = 46;
export const MOTHER_MIN_CHILD_AGE = 15;

export interface SiblingShape {
  readonly sex: string;
  /** Positive for an elder sibling, negative for a younger one. */
  readonly offset: number;
  readonly elder: boolean;
}

/** One sibling's sex and age offset. Draw order: sex, elder flag, gap. */
export function siblingShape(random: () => number): SiblingShape {
  const sex = random() < 0.5 ? 'M' : 'F';
  const elder = random() < 0.5;
  const gap = 1 + Math.floor(random() * SIBLING_GAP_MAX);
  return {sex, offset: elder ? gap : -gap, elder};
}

/** True when this sibling's offset would put the mother outside childbearing range. */
export function siblingOutOfRange(offset: number, motherAge: number): boolean {
  const atBirth = motherAge + offset;
  return atBirth > MOTHER_MAX_CHILD_AGE || atBirth < MOTHER_MIN_CHILD_AGE;
}
