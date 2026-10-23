/**
 * Focus: how the year's attention is split, and what each share does.
 *
 * Every year the life distributes attention over a few focuses (health, study, bonds,
 * work, …). The distribution is normalised to shares, then each focus's effect table is
 * applied *scaled by its share* — so putting everything into one focus gives it weight 1
 * and the others nothing.
 *
 * Two rules here are easy to break and were only implicit before:
 *
 *   1. A year with **no** focus does nothing at all — the total is zero, so there are no
 *      shares and no effects; the loop is skipped rather than dividing by zero.
 *   2. `sm` (knowledge), `arts` and `money` are **excluded** from the plain additive pass
 *      because knowledge and arts go through the diminishing-returns curves and money is
 *      not a dimension. Applying them here as well would double-count the strongest
 *      focuses.
 *
 * The model returns deltas; the caller applies them, because knowledge and arts have to
 * go through `knowAdd`/`artsAdd`, which read the current ceiling.
 */

/** The effect table of one focus, as the content registry stores it. */
export interface FocusEffects {
  readonly hl?: number;
  readonly h?: number;
  readonly so?: number;
  readonly sm?: number;
  readonly arts?: number;
  readonly money?: number;
}

/** Effect keys that must not be applied by the plain additive pass. */
export const CURVED_EFFECTS: readonly string[] = ['sm', 'arts', 'money'];
/** The clamp every plain dimension uses. */
export const DIMENSION_BOUNDS = [0, 100] as const;

export interface FocusShares {
  readonly total: number;
  readonly shares: Readonly<Record<string, number>>;
}

/**
 * Normalise the raw attention weights into shares.
 *
 * A non-positive or empty total yields no shares, which is what makes "no focus" a
 * no-op rather than a division by zero. Negative weights are kept as-is: the caller
 * never produces them, and silently clamping would hide a scheduling bug.
 */
export function focusShares(weights: Readonly<Record<string, number>>): FocusShares {
  let total = 0;
  for (const key of Object.keys(weights)) total += weights[key] ?? 0;
  if (!(total > 0)) return {total: 0, shares: {}};

  const shares: Record<string, number> = {};
  for (const key of Object.keys(weights)) shares[key] = (weights[key] ?? 0) / total;
  return {total, shares};
}

export interface FocusDelta {
  readonly dimension: string;
  readonly delta: number;
}

export interface FocusOutcome {
  /** Plain dimension deltas, in the order the effect table lists them. */
  readonly dimensions: readonly FocusDelta[];
  /** Knowledge delta, which the caller routes through the growth curve. */
  readonly knowledge: number;
  /** Arts delta, likewise. */
  readonly arts: number;
}

/**
 * Scale one focus's effects by its share.
 *
 * The dimension list keeps the effect table's own key order, so a state that clamps one
 * dimension and not another cannot depend on the model's iteration order.
 */
export function focusOutcome(effects: FocusEffects, share: number): FocusOutcome {
  const dimensions: FocusDelta[] = [];
  let knowledge = 0;
  let arts = 0;

  for (const key of Object.keys(effects)) {
    if (key === 'sm') {
      knowledge = (effects.sm ?? 0) * share;
      continue;
    }
    if (key === 'arts') {
      arts = (effects.arts ?? 0) * share;
      continue;
    }
    if (key === 'money') continue;
    dimensions.push({dimension: key, delta: (effects[key as keyof FocusEffects] ?? 0) * share});
  }

  return {dimensions, knowledge, arts};
}
