/**
 * Session state: where a life currently sits in the run loop.
 *
 * `LifeView` answers "who is this person"; this answers "what is the player doing
 * with them right now" — which phase the life is in, whether a decision is
 * waiting, and the pacing the player chose. The distinction matters because the
 * *writes* (pause, speed, focus) are player actions, while everything here is a
 * read-only projection for the flow layer.
 *
 * Pacing lives on the life state today for historical reasons; keeping it in a
 * dedicated section means the flow layer can ask one question instead of poking
 * at four fields, and moving it elsewhere later touches one file.
 */

export interface SessionView {
  /** `report` means the life has ended and the report screen owns it. */
  readonly phase: 'life' | 'report' | 'other';
  readonly age: number;
  readonly pacing: {
    /** Progress through the current year, 0..1. */
    readonly progress: number;
    /** Real seconds one simulated year takes. */
    readonly yearSeconds: number;
    readonly paused: boolean;
    readonly speed: number;
  };
  readonly decision: {
    /** A decision is open and the flow layer must not advance time. */
    readonly open: boolean;
    readonly id: string | null;
  };
  readonly seed: number | null;
}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord : null;

const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Project the run-loop state. Unknown input yields a well-formed, inert view. */
export function deriveSessionView(state: unknown): SessionView {
  const life = record(state) ?? {};
  const flags = record(life.flags) ?? {};
  const pending = record(life.pending);

  const phase: SessionView['phase'] = life.phase === 'life' ? 'life'
    : life.phase === 'report' ? 'report' : 'other';

  return {
    phase,
    age: num(life.age),
    pacing: {
      progress: clamp01(num(life.t)),
      yearSeconds: num(life.yearSec),
      paused: life.paused === true,
      speed: num(life.speed, 1)
    },
    decision: {
      open: pending !== null,
      id: pending && typeof pending.id === 'string' ? pending.id : null
    },
    seed: typeof flags.seed === 'number' ? flags.seed : null
  };
}
