/**
 * Decision rules: how auto-mode picks, and when a decision may fire again.
 *
 * The decision engine itself (opening, choosing, the schedule table) is flow and
 * stays in the legacy script. These two pieces are rules with edge cases worth
 * pinning: auto-mode's scoring, and the once/cooldown gate that stops the same
 * question from firing every year.
 */

export interface DecisionStats {
  readonly hl: number;
  readonly h: number;
  readonly sm: number;
  readonly so: number;
}

export interface DecisionEffects {
  readonly hl?: number;
  readonly h?: number;
  readonly sm?: number;
  readonly so?: number;
  readonly money?: number;
}

export interface AutoOption {
  readonly eff?: DecisionEffects | null;
  readonly autoExclude?: boolean;
}

/**
 * Deterministic part of the auto-mode score.
 *
 * Each attribute change is weighted by how *scarce* that attribute currently is
 * (`(110 - value) / 55`), so a +10 to a stat at 20 counts far more than at 90.
 * Money only matters when the life is actually in debt.
 */
export function autoScore(effects: DecisionEffects | null | undefined, stats: DecisionStats, money: number): number {
  const eff = effects ?? {};
  let score = 0;
  score += (eff.hl || 0) * (110 - stats.hl) / 55;
  score += (eff.h || 0) * (110 - stats.h) / 55;
  score += (eff.sm || 0) * (110 - stats.sm) / 55;
  score += (eff.so || 0) * (110 - stats.so) / 55;
  if (eff.money && money < 0) score += eff.money * 0.02;
  return score;
}

/**
 * Pick the option auto-mode takes.
 *
 * Consumes exactly one random value per *eligible* option — that count is part of
 * the RNG contract, so skipping an excluded option must not skip its draw. Ties go
 * to the earlier option, and an all-excluded list still yields index 0, matching the
 * engine's behaviour of always choosing something.
 */
export function pickAutoOption(
  options: readonly AutoOption[],
  stats: DecisionStats,
  money: number,
  random: () => number
): number {
  let best = 0;
  let bestScore = -1e9;
  for (let index = 0; index < options.length; index++) {
    const option = options[index];
    if (!option || option.autoExclude) continue;
    const score = autoScore(option.eff, stats, money) + random() * 1.5;
    if (score > bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

export interface DecisionSchedule {
  readonly once?: boolean;
  readonly cd?: number | null;
}

/**
 * Whether a decision may fire at this age.
 *
 * A `once` decision never fires twice; otherwise the cooldown applies, defaulting to
 * five years — without it "have another child" would be asked every year for
 * sixteen years running.
 */
export function mayFire(schedule: DecisionSchedule, lastSeen: number | null | undefined, age: number): boolean {
  if (schedule.once && lastSeen != null) return false;
  const cooldown = schedule.cd == null ? (schedule.once ? 0 : 5) : schedule.cd;
  if (cooldown > 0 && lastSeen != null && age - lastSeen < cooldown) return false;
  return true;
}
