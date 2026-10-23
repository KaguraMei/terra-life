/**
 * Storage port.
 *
 * The application stores finished-life summaries. That is the only persistence
 * this build performs, and the UI must not talk to `localStorage` directly:
 * privacy mode, quota exhaustion, another tab's schema and a corrupted blob are
 * all ordinary conditions that would otherwise surface as a broken screen.
 *
 * The adapter is injected (a getter, not the object) so the typed layers never
 * touch a browser global and a test can supply a fake.
 */
import {parseCompletedLifeRecords} from '../model/save-envelope';
import type {CompletedLifeSummary} from '../model/save-envelope';

/** Namespaced store. The `v1` segment is the storage format version. */
export const COMPLETED_LIVES_KEY = 'terra-life:v1:completed-lives';
/** Single resumable-life slot, written after every settled year. */
export const RESUMABLE_LIFE_KEY = 'terra-life:v1:resumable-life';
/** Pre-namespace key; only read when explicitly asked, never written. */
export const LEGACY_COMPLETED_LIVES_KEY = 'terra-life-saves-v1';
/** How many finished lives the summary list keeps. */
export const COMPLETED_LIVES_LIMIT = 60;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface CompletedLifeInput {
  readonly name: string;
  readonly nation: string;
  readonly race: string;
  readonly age: number;
  readonly cause: string;
  readonly seed: number | null;
  readonly setup: Record<string, unknown>;
}

export type WriteOutcome =
  | {readonly saved: true; readonly total: number}
  | {readonly saved: false; readonly reason: 'unavailable' | 'quota' | 'rejected'};

export interface StoragePort {
  readonly key: string;
  /** True when a backing store can actually be reached. */
  available(): boolean;
  /** Finished lives, newest first. Never throws; unreadable data reads as empty. */
  readCompletedLives(options?: {includeLegacy?: boolean}): CompletedLifeSummary[];
  recordCompletedLife(entry: CompletedLifeInput): WriteOutcome;
  clearCompletedLives(): void;
  /**
   * The single resumable slot. Values are opaque JSON here: interpreting and
   * validating a saved life belongs to the save-envelope codec.
   */
  readResumable(): unknown | null;
  writeResumable(envelope: unknown): WriteOutcome;
  clearResumable(): void;
}

function isSummaryWritable(entry: CompletedLifeInput): boolean {
  return typeof entry.name === 'string' &&
    typeof entry.nation === 'string' &&
    typeof entry.race === 'string' &&
    Number.isFinite(entry.age) &&
    typeof entry.cause === 'string' && entry.cause.length > 0;
}

/**
 * Build the port over a lazily-resolved storage object. Every access is guarded:
 * a throwing getter (privacy mode), a throwing read and a throwing write all
 * degrade to "no persistence" instead of breaking the caller.
 */
export function createStoragePort(getStorage: () => StorageLike | null | undefined): StoragePort {
  const resolve = (): StorageLike | null => {
    try {
      return getStorage() ?? null;
    } catch {
      return null;
    }
  };
  const readRaw = (key: string): string | null => {
    const storage = resolve();
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  };

  return {
    key: COMPLETED_LIVES_KEY,

    readCompletedLives(options = {}) {
      const primary = parseCompletedLifeRecords(readRaw(COMPLETED_LIVES_KEY));
      if (!options.includeLegacy) return primary;
      // Legacy rows are appended after the current ones and stay marked.
      return [...primary, ...parseCompletedLifeRecords(readRaw(LEGACY_COMPLETED_LIVES_KEY))];
    },

    recordCompletedLife(entry) {
      const storage = resolve();
      if (!storage) return {saved: false, reason: 'unavailable'};
      if (!isSummaryWritable(entry)) return {saved: false, reason: 'rejected'};
      const existing = parseCompletedLifeRecords(readRaw(COMPLETED_LIVES_KEY));
      const record = {
        // `v` is the per-record structure version, independent of the store key.
        v: 1,
        t: Date.now(),
        name: entry.name,
        nation: entry.nation,
        race: entry.race,
        age: entry.age,
        cause: entry.cause,
        seed: entry.seed,
        setup: entry.setup
      };
      const next = [record, ...existing.map(row => ({
        v: 1, t: row.recordedAt, name: row.name, nation: row.nation, race: row.race,
        age: row.age, cause: row.cause, seed: row.seed, setup: row.setup
      }))].slice(0, COMPLETED_LIVES_LIMIT);
      try {
        storage.setItem(COMPLETED_LIVES_KEY, JSON.stringify(next));
        return {saved: true, total: next.length};
      } catch {
        return {saved: false, reason: 'quota'};
      }
    },

    clearCompletedLives() {
      const storage = resolve();
      if (!storage || typeof storage.removeItem !== 'function') return;
      try {
        storage.removeItem(COMPLETED_LIVES_KEY);
      } catch {
        /* nothing to recover from: the caller asked to forget, and we cannot */
      }
    },

    available() {
      return resolve() !== null;
    },

    readResumable() {
      const raw = readRaw(RESUMABLE_LIFE_KEY);
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        return parsed === null || typeof parsed !== 'object' ? null : parsed;
      } catch {
        return null;
      }
    },

    writeResumable(envelope) {
      const storage = resolve();
      if (!storage) return {saved: false, reason: 'unavailable'};
      if (envelope === null || typeof envelope !== 'object' || Array.isArray(envelope)) {
        return {saved: false, reason: 'rejected'};
      }
      try {
        storage.setItem(RESUMABLE_LIFE_KEY, JSON.stringify(envelope));
        return {saved: true, total: 1};
      } catch {
        return {saved: false, reason: 'quota'};
      }
    },

    clearResumable() {
      const storage = resolve();
      if (!storage || typeof storage.removeItem !== 'function') return;
      try {
        storage.removeItem(RESUMABLE_LIFE_KEY);
      } catch {
        /* the slot simply stays; the codec rejects anything it cannot read */
      }
    }
  };
}
