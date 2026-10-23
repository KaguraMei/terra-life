export type EventKind = 'ev' | 'ms' | 'dec' | 'cat';
export interface ScheduledEvent {
  at: number;
  type: EventKind;
  id: string;
  p?: unknown;
}

/** The small state surface owned by the scheduler. Domain fields remain outside it. */
export interface EventState {
  age: number;
  phase: string;
  t: number;
  speed: number;
  yearSec: number;
  paused: boolean;
  pending: unknown;
  focus: string | null;
  fT: Record<string, number>;
  queue: ScheduledEvent[];
  actEvent: string | null;
  flags: Record<string, unknown>;
  evCount: Record<string, number>;
  recent: string[];
}

export type EventText = string | { t: string; k?: string; f?: unknown } | void | null | false;
export interface EventDefinition<S> {
  title?: string;
  book?: string;
  max?: number;
  cd?: number;
  when?: (state: S) => boolean;
  run(state: S, payload: unknown): EventText;
}

/** How completely a failed dispatch was undone. */
export type Rollback = 'full' | 'state-only' | 'none';

export interface EventFailure {
  readonly eventId: string;
  readonly eventType: EventKind;
  readonly age: number;
  readonly at: number;
  readonly cause: unknown;
  /** `full` = state and random stream restored, `none` = nothing could be restored. */
  readonly rollback: Rollback;
}

export interface EventPorts<S extends EventState> {
  random(): number;
  definition(id: string): EventDefinition<S> | undefined;
  blocked(state: S, id: string): boolean;
  available(state: S, definition: EventDefinition<S> | undefined): boolean;
  netWorth(state: S): number;
  book(state: S, before: number, label: string): void;
  log(state: S, text: string, kind: string, extra: { key: string; f?: unknown }): void;
  milestone(state: S): void;
  decision(state: S, id: string, payload: unknown): void;
  catastrophe(state: S, payload: unknown): void;
  sync(state: S): void;
  endYear(state: S): void;
  error(failure: EventFailure): void;
  /**
   * Optional random checkpoint. When both hooks are supplied, a failed
   * dispatch also rewinds the random stream, so content that threw cannot
   * shift every later draw.
   */
  randomCheckpoint?(): unknown;
  randomRestore?(checkpoint: unknown): void;
}

export type DispatchResult = 'executed' | 'skipped' | 'failed';
export type AdvanceResult = 'ended' | 'decision' | 'searching';

/**
 * Legacy-compatible dispatch semantics. The ports are explicit and every
 * dispatch runs as a draft: if content throws, the state is restored from a
 * JSON snapshot and the random stream is rewound, so a broken event cannot
 * leave half a change behind or shift every later draw.
 *
 * The snapshot is a whole-state JSON round trip, which is cheap enough at this
 * state size and easy to reason about. It is *not* a general transaction: state
 * that cannot be serialized (a pending decision's closures) disables rollback
 * and is reported as such instead of being silently invented.
 */
export function createEventEngine<S extends EventState>(ports: EventPorts<S>) {
  function captureState(state: S): string | null {
    // A pending interaction holds closures; snapshotting it would silently drop
    // the definition, so such a dispatch is not rolled back.
    if (state.pending) return null;
    try {
      return JSON.stringify(state);
    } catch {
      return null;
    }
  }

  function restoreState(state: S, snapshot: string): boolean {
    let parsed: unknown;
    try {
      parsed = JSON.parse(snapshot);
    } catch {
      return false;
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const target = state as unknown as Record<string, unknown>;
    for (const key of Object.keys(target)) delete target[key];
    Object.assign(target, parsed as Record<string, unknown>);
    return true;
  }

  function fire(state: S, event: ScheduledEvent): DispatchResult {
    // Capture before touching anything, so a rollback restores exactly the
    // pre-dispatch object (including absent marker fields).
    const snapshot = captureState(state);
    const checkpoint = snapshot === null ? undefined : ports.randomCheckpoint?.();
    state.actEvent = null;
    let failed = false;
    try {
      if (event.type === 'ev') {
        const definition = ports.definition(event.id);
        if (ports.blocked(state, event.id)) return 'skipped';
        if (!ports.available(state, definition) || !definition) return 'skipped';
        // Keep this order: old predicates may consume RNG before the limit checks.
        if (definition.when && !definition.when(state)) return 'skipped';
        if ((state.evCount[event.id] || 0) >= (definition.max ?? 2)) return 'skipped';
        const last = state.flags['ev_' + event.id];
        if (typeof last === 'number' && state.age - last < (definition.cd ?? 4)) return 'skipped';
        state.actEvent = event.id;
        const before = ports.netWorth(state);
        const result = definition.run(state, event.p);
        ports.book(state, before, definition.book || definition.title || '其他');
        if (result) {
          if (typeof result === 'string') ports.log(state, result, 'ev', { key: event.id });
          else ports.log(state, result.t, result.k || 'ev', { key: event.id, f: result.f });
        }
        state.actEvent = null;
        state.flags['ev_' + event.id] = state.age;
        state.evCount[event.id] = (state.evCount[event.id] || 0) + 1;
        state.recent.push(event.id);
        if (state.recent.length > 14) state.recent.shift();
      } else if (event.type === 'ms') ports.milestone(state);
      else if (event.type === 'dec') ports.decision(state, event.id, event.p);
      else if (event.type === 'cat') ports.catastrophe(state, event.p);
      return 'executed';
    } catch (cause) {
      failed = true;
      let rollback: Rollback = 'none';
      if (snapshot !== null && restoreState(state, snapshot)) {
        rollback = 'state-only';
        if (checkpoint != null && ports.randomRestore) {
          ports.randomRestore(checkpoint);
          rollback = 'full';
        }
      }
      ports.error({ eventId: event.id, eventType: event.type, age: state.age, at: state.t, cause, rollback });
      return 'failed';
    } finally {
      // A rolled-back dispatch already equals its pre-event state; running the
      // organization sync again would apply it twice.
      if (!failed && state.phase === 'life') ports.sync(state);
    }
  }

  function queue(state: S, at: number, type: EventKind, id: string, p?: unknown): void {
    if (!Number.isFinite(at)) throw new RangeError('Event time must be finite');
    state.queue.push({ at: Math.max(0, Math.min(1, at)), type, id, p });
    // Stable sort preserves insertion order for ties, including legacy queue entries.
    state.queue.sort((a, b) => a.at - b.at);
  }

  function tick(state: S | null, dtSec: number): void {
    if (!state || state.phase !== 'life' || state.pending || state.paused) return;
    if (!Number.isFinite(dtSec) || dtSec < 0) throw new RangeError('Elapsed time must be finite and nonnegative');
    const nt = Math.min(state.t + dtSec * state.speed / state.yearSec, 1);
    const accrue = (to: number) => {
      if (state.focus) state.fT[state.focus] = (state.fT[state.focus] || 0) + Math.max(0, to - state.t);
      state.t = to;
    };
    while (state.queue.length && state.queue[0]!.at <= nt) {
      const event = state.queue.shift()!;
      accrue(event.at);
      fire(state, event);
      if (state.pending || state.phase !== 'life') return;
    }
    accrue(nt);
    if (state.t >= 1) ports.endYear(state);
  }

  function advance(state: S | null, budget = 256): AdvanceResult {
    if (!state || state.phase !== 'life') return 'ended';
    if (!Number.isSafeInteger(budget) || budget < 1) throw new RangeError('Step budget must be a positive integer');
    const speed = state.speed;
    state.speed = 1;
    try {
      for (let i = 0; i < budget && state.phase === 'life' && !state.pending; i++) {
        state.paused = false;
        const at = state.queue[0]?.at ?? 1;
        tick(state, (Math.max(0, at - state.t) + 1e-10) * state.yearSec);
      }
    } finally {
      state.speed = speed;
      state.paused = true;
    }
    return state.pending ? 'decision' : state.phase === 'life' ? 'searching' : 'ended';
  }

  function queueRandom(state: S, count: number, type: EventKind, pick: () => string | null | undefined): void {
    for (let i = 0; i < count; i++) {
      const id = pick();
      if (id) queue(state, ports.random(), type, id);
    }
  }

  return { fire, queue, queueRandom, tick, advance };
}
