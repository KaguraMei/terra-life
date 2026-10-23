import { createEventEngine } from '../kernel/events';
import type { EventDefinition, EventState, EventText } from '../kernel/events';
import { createRandom } from '../kernel/random';
import type { RandomSnapshot } from '../kernel/random';

/** Temporary legacy surface. This is not the final domain GameState or plugin API. */
interface LegacyServices {
  EVMAP: Record<string, EventDefinition<EventState>>;
  rnd(): number;
  contentAvailable(state: EventState, definition: EventDefinition<EventState> | undefined): boolean;
  organizationBlocksEvent?: (state: EventState, id: string) => boolean;
  netWorth(state: EventState): number;
  bookSince(state: EventState, before: number, label: string): void;
  log(state: EventState, text: string, kind: string, extra: { key: string; f?: unknown }): void;
  milestone(state: EventState): void;
  openDecision(state: EventState, id: string, payload: unknown): void;
  catastrophe(state: EventState, payload: unknown): EventText;
  syncOrganization?: (state: EventState) => void;
  endYear(state: EventState): void;
}

export function installKernel(target: object) {
  // The only assertion across the legacy JS boundary. New kernel code has no TL access.
  const legacy = target as LegacyServices;
  const random = createRandom();
  const engine = createEventEngine<EventState>({
    random: () => legacy.rnd(),
    definition: id => legacy.EVMAP[id],
    blocked: (state, id) => legacy.organizationBlocksEvent?.(state, id) ?? false,
    available: (state, definition) => legacy.contentAvailable(state, definition),
    netWorth: state => legacy.netWorth(state),
    book: (state, before, label) => legacy.bookSince(state, before, label),
    log: (state, text, kind, extra) => legacy.log(state, text, kind, extra),
    milestone: state => legacy.milestone(state),
    decision: (state, id, payload) => legacy.openDecision(state, id, payload),
    catastrophe: (state, payload) => { legacy.catastrophe(state, payload); },
    sync: state => { legacy.syncOrganization?.(state); },
    endYear: state => legacy.endYear(state),
    error: failure => console.error('[ev]', failure.eventId, failure.rollback, failure.cause),
    // A failed dispatch rewinds the stream too, so a throwing event cannot shift
    // every later draw. An unseeded generator has no checkpoint to return.
    randomCheckpoint: () => random.snapshot(),
    randomRestore: checkpoint => random.restore(checkpoint as RandomSnapshot)
  });
  Object.assign(target, {
    kernel: { random, events: engine },
    seedRng: (seed: number) => random.reseed(seed),
    unseedRng: () => random.unseed(),
    rnd: () => random.next(),
    seed: () => random.seed(),
    randomSnapshot: () => random.snapshot(),
    restoreRandom: (snapshot: RandomSnapshot) => random.restore(snapshot)
  });
}
