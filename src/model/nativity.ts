/**
 * Nativity: the circumstances a life is born into.
 *
 * `newLife` is one long assembly function and stays that way — it *is* the random
 * stream, and every draw in it decides where a life starts. What can be lifted out
 * without touching that order is the arithmetic around each draw:
 *
 *   - the four starting dimensions, which turn nationality, race, household wealth and
 *     a court's bloodline bonus into the numbers a life begins with;
 *   - the parents' ages, which are anchored to the household's wealth so a rich family
 *     does not produce a mother younger than her children;
 *   - the stratum code shown in the UI.
 *
 * Each function below draws in exactly the documented order, and the caller injects the
 * random source — so the migration cannot change how many values are consumed, only who
 * computes the result.
 */

/** The race bonus table as the content registry stores it. */
export interface RaceModifiers {
  readonly hl?: number;
  readonly h?: number;
  readonly sm?: number;
  readonly so?: number;
  readonly art?: number;
}

export interface StartingStats {
  readonly hl: number;
  readonly h: number;
  readonly sm: number;
  readonly so: number;
}

export interface NativitySubject {
  readonly nationMedical: number;
  readonly nationEducation: number;
  readonly familyTier: number;
  readonly raceModifiers: RaceModifiers;
  /** A Sarkaz court's bloodline bonus, applied after the base rolls. */
  readonly courtModifiers: Readonly<Record<string, number>> | null;
}

export interface NativityPorts {
  readonly range: (low: number, high: number) => number;
  readonly clamp: (value: number, low: number, high: number) => number;
}

/**
 * The four dimensions a life starts with.
 *
 * Draw order is `hl, h, sm, so` — one uniform each — and then the court bonus is applied
 * on top with its own wider clamp. The base clamps differ per dimension on purpose: a
 * newborn's knowledge can be as low as 2, while health never starts below 15.
 */
export function initialStats(subject: NativitySubject, ports: NativityPorts): StartingStats {
  const mod = subject.raceModifiers;
  const q = subject.familyTier;
  const stats: Record<string, number> = {
    hl: ports.clamp(
      62 + (mod.hl ?? 0) * 1.4 + (q - 3) * 4 + (subject.nationMedical - 0.6) * 12 + ports.range(-8, 8),
      15, 96
    ),
    h: ports.clamp(
      56 + (mod.h ?? 0) * 1.2 + (3 - Math.abs(q - 3)) * 2 + ports.range(-8, 8),
      15, 96
    ),
    sm: ports.clamp(
      18 + (q - 1) * 7 + subject.nationEducation * 0.9 + (mod.sm ?? 0) * 1.2 + ports.range(-6, 10),
      2, 92
    ),
    so: ports.clamp(52 + (mod.so ?? 0) * 1.2 + ports.range(-8, 8), 15, 96)
  };

  if (subject.courtModifiers) {
    for (const key of Object.keys(subject.courtModifiers)) {
      const bonus = subject.courtModifiers[key] ?? 0;
      stats[key] = ports.clamp((stats[key] ?? 0) + bonus * 1.2, 0, 100);
    }
  }

  return stats as unknown as StartingStats;
}

export interface ParentAges {
  readonly momAge: number;
  readonly dadAge: number;
}

/**
 * The parents' ages at birth.
 *
 * The mother is drawn from 19–38 and then nudged by household wealth (richer families
 * have children later), clamped to 16–45 and rounded. The father is the *rounded*
 * mother's age plus 1–6 years, so the two draws are not interchangeable.
 */
export function parentAges(familyTier: number, ports: NativityPorts): ParentAges {
  const momAge = Math.round(ports.clamp(ports.range(19, 38) + (familyTier - 3) * 1.6, 16, 45));
  const dadAge = Math.round(momAge + ports.range(1, 6));
  return {momAge, dadAge};
}

/** The three-letter code the UI shows for a stratum, e.g. `ind` for `industrial`. */
export function stratumCode(stratum: string): string {
  return stratum.slice(0, 3).toUpperCase();
}
