/**
 * Interview decks: which questions a session draws, and in what order.
 *
 * A pool declares how many organization-level and role-level questions an interview
 * needs (`draw`). Selection shreds both candidate lists, takes the requested count from
 * each, and shuffles every question's answer options. Two things here are load-bearing:
 *
 *   1. **A short candidate list cancels the whole interview** — the session is not
 *      padded with whichever questions happen to be available. The player is told the
 *      interview cannot be scheduled and keeps their old job.
 *   2. **The draws are ordered**: organization questions first, then role questions, and
 *      the shuffle is a Fisher–Yates over each list. Reordering the two groups, or
 *      shuffling a merged list, changes the random stream even when the chosen ids end
 *      up the same.
 *
 * The shuffle is deliberately spelled out rather than using `sort(() => rnd() - 0.5)`:
 * that idiom is biased, and the number of draws it consumes depends on the engine.
 */

export type DeckKind = 'organization' | 'role';
/** Selection order: organization questions before role questions. */
export const DECK_ORDER: readonly DeckKind[] = ['organization', 'role'];

export interface DeckDraw {
  readonly organization: number;
  readonly role: number;
}

export interface DeckQuestion {
  readonly id: string;
  readonly kind: string;
  readonly options: readonly unknown[];
}

export type DeckSelection<T extends DeckQuestion> =
  | {readonly ok: true; readonly selected: readonly T[]}
  | {readonly ok: false; readonly kind: DeckKind};

/**
 * Fisher–Yates shuffle, drawing one uniform per swap.
 *
 * Returns a new array. For `n` items it consumes exactly `n - 1` random values, which is
 * what the session tests pin — an off-by-one here shifts every later draw in the life.
 */
export function shuffleDeck<T>(items: readonly T[], random: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = out[i] as T;
    out[i] = out[j] as T;
    out[j] = swap;
  }
  return out;
}

/**
 * Take the questions an interview needs.
 *
 * When either group is short the whole selection fails, and the failing kind is reported
 * so the caller can log which half of the pool ran out.
 */
export function selectInterviewQuestions<T extends DeckQuestion>(
  available: readonly T[], draw: DeckDraw, random: () => number
): DeckSelection<T> {
  const selected: T[] = [];

  for (const kind of DECK_ORDER) {
    const candidates = available.filter(question => question.kind === kind);
    const need = draw[kind];
    if (candidates.length < need) return {ok: false, kind};
    selected.push(...shuffleDeck(candidates, random).slice(0, need));
  }

  return {ok: true, selected};
}

/** A question with its answer options reordered (and shallow-copied, so a session never aliases the registry). */
export function shuffleOptions<T extends DeckQuestion>(question: T, random: () => number): T {
  const options = shuffleDeck(question.options, random).map(option =>
    option !== null && typeof option === 'object' ? {...option} : option
  );
  return {...question, options};
}

/**
 * Reorder every selected question's options, in question order.
 *
 * Option order is per-question so a player cannot infer anything from the position of
 * the "correct" answer, and each question spends its own `n - 1` draws.
 */
export function prepareSessionQuestions<T extends DeckQuestion>(
  questions: readonly T[], random: () => number
): T[] {
  return questions.map(question => shuffleOptions(question, random));
}
