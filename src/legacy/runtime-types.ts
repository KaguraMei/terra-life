import type { EventState, ScheduledEvent, EventKind, AdvanceResult, DispatchResult } from '../kernel/events';
import type { RandomSnapshot } from '../kernel/random';
import type { Violation } from '../model/state-invariants';
import type { LifeGuards } from '../model/transitions';
import type { EffectDiagnostic } from '../model/effects';
import type { LifeView } from '../model/life-view';
import type { SessionView } from '../model/session-view';
import type { PackLock } from '../content/pack-lock';
import type { StoragePort } from '../platform/storage';

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
  retire(state: LegacyLife, options?: {deferOrganizationExit?: boolean}): boolean;
  /** Single gate for losing a job; false for students, retirees and coerced labour. */
  canBeDismissed(state: LegacyLife): boolean;
  dismissFromJob(state: LegacyLife): boolean;
  enterCoercedLabour(state: LegacyLife, job: 'slave' | 'prison'): boolean;
  /** Single commit point for declared content effects. */
  applyEffects(state: LegacyLife, effects: unknown): number;
  validateEffects(effects: unknown): EffectDiagnostic[];
  /** Read-only projection the UI may render instead of poking at state. */
  deriveLifeView(state: LegacyLife): LifeView;
  /** Where the run loop is: phase, pending decision, pacing. */
  deriveSessionView(state: LegacyLife): SessionView;
  /** Content identity of the registered question packs. */
  interviewPackLocks(): PackLock[];
  /** Register DLC packs from a document; rejected packs change nothing. */
  loadInterviewPacks(document: unknown): {registered: string[]; diagnostics: unknown[]};
  lifeGuards: LifeGuards;
  /** Application storage port; the UI never touches localStorage directly. */
  lifeStore: StoragePort;
  /** Write the single resumable slot; only valid on a committed year boundary. */
  saveProgress(state: LegacyLife): {saved: boolean; reason?: string};
  /** Rebuild a life from the resumable slot, or null when unusable/absent. */
  loadProgress(): LegacyLife | null;
  hasProgress(): boolean;
  assertStateInvariants(state: LegacyLife): void;
  stateInvariantViolations(state: LegacyLife): Violation[];
}
