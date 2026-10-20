import type { EventState, ScheduledEvent, EventKind, AdvanceResult, DispatchResult } from '../kernel/events';
import type { RandomSnapshot } from '../kernel/random';

export interface LifeOptions {
  seed?: number;
  nation?: string;
  race?: string;
  sex?: 'M' | 'F';
  bornYear?: number;
  mode?: 'birth' | 'pop';
  pace?: 'short' | 'normal' | 'long';
  traits?: Record<string, boolean>;
}

/** Only migrated/public fields are described here; legacy domain state is not fully typed yet. */
export interface LegacyLife extends EventState {
  year: number;
  bornYear: number;
  nation: string;
  race: string;
  job: string;
  money: number;
  log: Array<{ age: number; year: number; text: string; kind: string }>;
}

/** Compatibility API, not the future restricted plugin SDK. */
export interface LegacySimulation {
  S: LegacyLife | null;
  newLife(options?: LifeOptions): LegacyLife;
  tick(state: LegacyLife, seconds: number): void;
  advanceToDecision(state: LegacyLife, budget?: number): AdvanceResult;
  queueEvent(state: LegacyLife, at: number, type: EventKind, id: string, payload?: unknown): void;
  fire(state: LegacyLife, event: ScheduledEvent): DispatchResult;
  choose(state: LegacyLife, index: number): unknown;
  autoChoose(state: LegacyLife): void;
  autoFocus(state: LegacyLife): string;
  seedRng(seed: number): void;
  unseedRng(): void;
  rnd(): number;
  seed(): number | null;
  randomSnapshot(): RandomSnapshot | null;
  restoreRandom(snapshot: RandomSnapshot): void;
}
