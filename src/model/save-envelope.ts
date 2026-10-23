/**
 * Versioned save envelope for a resumable life.
 *
 * The current application only persists finished-life summaries. This module
 * implements the protocol those summaries will sit next to, and is exercised by
 * the resume regression (continuous run vs. save → restore → continue).
 *
 * Design constraints, in order of importance:
 *  1. Only JSON data is written. Functions, closures, DOM nodes, prototypes and
 *     runtime caches are rejected with the offending path, never silently
 *     dropped, because a half-written state is worse than no save at all.
 *  2. Pending decisions are stored as stable IDs plus a display snapshot. The
 *     definition and options are re-resolved on load and checked against the
 *     snapshot, so a definition change cannot silently pick a different option.
 *  3. Randomness is stored as algorithm + version + internal position + draw
 *     count. A seed alone cannot restore a mid-life random stream.
 *  4. Reading an unknown or broken envelope never mutates the caller's data;
 *     the caller decides whether to keep the original bytes.
 */
import type { ScheduledEvent } from '../kernel/events';
import type { RandomSnapshot } from '../kernel/random';

export const SAVE_FORMAT = 'terra-life-save';
export const SAVE_ENVELOPE_VERSION = 1;
/**
 * Version identities travel with every save. They answer different questions
 * and must not be merged into one number: the ruleset changes simulation
 * behaviour, the core version identifies shipped content.
 */
export const RULESET_VERSION = 1;
export const CORE_VERSION = '0.1.0';

export interface SaveDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ContentLock {
  readonly coreVersion: string;
  /**
   * Identity of every content pack the save depends on. Empty is valid (a build
   * without packs); a package that the restoring build does not have, or has in
   * a different version or with different content, refuses the restore.
   */
  readonly packages: ReadonlyArray<{
    readonly id: string;
    readonly version: string;
    readonly hash: string;
  }>;
}

export interface PendingDecisionSnapshot {
  readonly decisionId: string;
  readonly age: number;
  readonly options: ReadonlyArray<{
    readonly index: number;
    readonly label: string;
    readonly hint: string;
    readonly hidden: boolean;
  }>;
  readonly title: unknown;
  readonly text: unknown;
}

export interface LifeSaveEnvelope {
  readonly format: typeof SAVE_FORMAT;
  readonly envelopeVersion: number;
  readonly rulesetVersion: number;
  readonly contentLock: ContentLock;
  readonly createdAt: string;
  /** Versioned domain-state DTO; never contains functions or prototypes. */
  readonly state: Record<string, unknown>;
  readonly random: RandomSnapshot;
  readonly interactions: {
    readonly queue: readonly ScheduledEvent[];
    readonly pendingDecision: PendingDecisionSnapshot | null;
  };
}

export interface SaveContext {
  readonly rulesetVersion: number;
  readonly contentLock: ContentLock;
  readonly createdAt: string;
  readonly random: RandomSnapshot | null;
}

/** Raised when state cannot be represented as JSON at all. */
export class SaveSerializationError extends Error {
  readonly diagnostics: readonly SaveDiagnostic[];
  constructor(diagnostics: readonly SaveDiagnostic[]) {
    super(`Life state cannot be saved:\n${formatSaveDiagnostics(diagnostics)}`);
    this.name = 'SaveSerializationError';
    this.diagnostics = diagnostics;
  }
}

export class SaveEnvelopeError extends Error {
  readonly diagnostics: readonly SaveDiagnostic[];
  constructor(context: string, diagnostics: readonly SaveDiagnostic[]) {
    super(`${context}\n${formatSaveDiagnostics(diagnostics)}`);
    this.name = 'SaveEnvelopeError';
    this.diagnostics = diagnostics;
  }
}

export function formatSaveDiagnostics(diagnostics: readonly SaveDiagnostic[]): string {
  return diagnostics.map(item => `- [${item.code}] ${item.path || '(root)'}: ${item.message}`).join('\n');
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord : null;
}

/**
 * Deep-copy a value into JSON data, reporting anything that cannot survive the
 * round trip. Keys starting with `_` are treated as runtime-only handles (the
 * pending decision keeps its closures there) and are reported, not kept.
 */
function toJsonData(
  value: unknown,
  path: string,
  problems: SaveDiagnostic[],
  stack: Set<object>
): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) {
        problems.push({ code: 'value.not-finite', path, message: 'non-finite numbers cannot be stored' });
        return null;
      }
      return value;
    case 'function':
      problems.push({ code: 'value.function', path, message: 'functions cannot be stored' });
      return undefined;
    case 'undefined':
      problems.push({ code: 'value.undefined', path, message: 'undefined cannot be stored' });
      return undefined;
    default:
      break;
  }
  const container = value as object;
  if (stack.has(container)) {
    problems.push({ code: 'value.cycle', path, message: 'circular references cannot be stored' });
    return undefined;
  }
  stack.add(container);
  try {
    if (Array.isArray(container)) {
      const output: unknown[] = [];
      for (const [index, item] of container.entries()) {
        if (item === undefined) {
          // JSON would turn a hole into null, which is a silent value change.
          problems.push({ code: 'value.undefined', path: `${path}[${index}]`,
            message: 'undefined array entries cannot be stored faithfully' });
          output.push(null);
          continue;
        }
        const converted = toJsonData(item, `${path}[${index}]`, problems, stack);
        output.push(converted === undefined ? null : converted);
      }
      return output;
    }
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(container)) {
      // An absent optional property is the same thing as `undefined` for JSON.
      if (item === undefined) continue;
      const childPath = path ? `${path}.${key}` : key;
      const converted = toJsonData(item, childPath, problems, stack);
      if (converted === undefined) continue;
      output[key] = converted;
    }
    return output;
  } finally {
    stack.delete(container);
  }
}

function snapshotPendingDecision(pending: UnknownRecord): PendingDecisionSnapshot {
  const decisionId = typeof pending.id === 'string' ? pending.id : '';
  const options = Array.isArray(pending.options)
    ? pending.options.map((item) => {
      const option = record(item) ?? {};
      return {
        index: typeof option.index === 'number' ? option.index : 0,
        label: typeof option.label === 'string' ? option.label : '',
        hint: typeof option.hint === 'string' ? option.hint : '',
        hidden: option.hidden === true
      };
    })
    : [];
  return {
    decisionId,
    age: typeof pending.age === 'number' ? pending.age : 0,
    options,
    title: pending.title ?? null,
    text: pending.text ?? null
  };
}

/**
 * Serialize one life into a resumable envelope. Throws when the state contains
 * anything that cannot be restored faithfully.
 */
export function serializeLife(state: unknown, context: SaveContext): LifeSaveEnvelope {
  const life = record(state);
  if (!life) throw new SaveSerializationError([{ code: 'state.not-object', path: '', message: 'life state is not an object' }]);
  if (life.phase === 'report') {
    throw new SaveSerializationError([{
      code: 'state.completed', path: 'phase',
      message: 'a completed life is stored as a summary, not as a resumable envelope'
    }]);
  }
  if (!context.random) {
    throw new SaveSerializationError([{
      code: 'random.missing', path: 'random',
      message: 'a resumable save requires an explicit random snapshot'
    }]);
  }

  const problems: SaveDiagnostic[] = [];
  const pending = record(life.pending);
  const { pending: _pending, queue, ...rest } = life;
  const stateCopy = toJsonData(rest, '', problems, new Set());
  const queueCopy = toJsonData(Array.isArray(queue) ? queue : [], 'queue', problems, new Set());
  if (problems.length) throw new SaveSerializationError(problems);

  return {
    format: SAVE_FORMAT,
    envelopeVersion: SAVE_ENVELOPE_VERSION,
    rulesetVersion: context.rulesetVersion,
    contentLock: context.contentLock,
    createdAt: context.createdAt,
    state: stateCopy as Record<string, unknown>,
    random: context.random,
    interactions: {
      queue: queueCopy as ScheduledEvent[],
      pendingDecision: pending ? snapshotPendingDecision(pending) : null
    }
  };
}

const EVENT_KINDS = new Set(['ev', 'ms', 'dec', 'cat']);

/** Structural validation of an untrusted envelope. Never mutates the input. */
export function validateLifeEnvelope(input: unknown): SaveDiagnostic[] {
  const diagnostics: SaveDiagnostic[] = [];
  const fail = (code: string, path: string, message: string) =>
    diagnostics.push({ code, path, message });
  const envelope = record(input);
  if (!envelope) {
    fail('envelope.not-object', '', 'save envelope is not an object');
    return diagnostics;
  }
  if (envelope.format !== SAVE_FORMAT) {
    fail('envelope.format', 'format', `expected format ${SAVE_FORMAT}`);
  }
  if (envelope.envelopeVersion !== SAVE_ENVELOPE_VERSION) {
    fail('envelope.version', 'envelopeVersion', `unsupported envelope version ${String(envelope.envelopeVersion)}`);
  }
  if (!Number.isInteger(envelope.rulesetVersion)) {
    fail('envelope.ruleset', 'rulesetVersion', 'ruleset version must be an integer');
  }
  const lock = record(envelope.contentLock);
  if (!lock || typeof lock.coreVersion !== 'string' || !Array.isArray(lock.packages)) {
    fail('envelope.content-lock', 'contentLock', 'content lock with core version and packages is required');
  } else {
    const seen = new Set<string>();
    (lock.packages as unknown[]).forEach((entry, index) => {
      const path = `contentLock.packages[${index}]`;
      const pack = record(entry);
      if (!pack) { fail('envelope.package', path, 'a content package lock must be an object'); return; }
      for (const field of ['id', 'version', 'hash']) {
        if (typeof pack[field] !== 'string' || (pack[field] as string).length === 0) {
          fail('envelope.package', `${path}.${field}`, `a content package lock needs a non-empty ${field}`);
        }
      }
      const id = pack.id as string;
      if (typeof id === 'string') {
        if (seen.has(id)) fail('envelope.package-duplicate', `${path}.id`, `content package ${id} is listed twice`);
        seen.add(id);
      }
    });
  }
  if (typeof envelope.createdAt !== 'string' || Number.isNaN(Date.parse(envelope.createdAt))) {
    fail('envelope.created-at', 'createdAt', 'createdAt must be an ISO timestamp');
  }
  const state = record(envelope.state);
  if (!state) fail('envelope.state', 'state', 'state must be an object');
  else if (state.phase === 'report') {
    fail('envelope.state-phase', 'state.phase', 'a completed life belongs to the summary store');
  }

  const random = record(envelope.random);
  if (!random || random.algorithm !== 'mulberry32' || random.version !== 1 ||
      !Number.isInteger(random.seed) || !Number.isInteger(random.state) ||
      !Number.isInteger(random.draws) || (random.draws as number) < 0) {
    fail('envelope.random', 'random', 'random snapshot must carry algorithm, version, seed, position and draws');
  }

  const interactions = record(envelope.interactions);
  if (!interactions || !Array.isArray(interactions.queue)) {
    fail('envelope.interactions', 'interactions', 'interactions.queue must be an array');
  } else {
    interactions.queue.forEach((item: unknown, index: number) => {
      const event = record(item);
      if (!event || typeof event.at !== 'number' || !Number.isFinite(event.at) ||
          typeof event.id !== 'string' || !EVENT_KINDS.has(event.type as string)) {
        fail('envelope.queue-entry', `interactions.queue[${index}]`, 'scheduled events need a finite time, a known kind and an ID');
      }
    });
  }
  const pending = interactions ? interactions.pendingDecision : null;
  if (pending != null) {
    const snapshot = record(pending);
    if (!snapshot || typeof snapshot.decisionId !== 'string' || snapshot.decisionId.length === 0 ||
        !Array.isArray(snapshot.options)) {
      fail('envelope.pending-decision', 'interactions.pendingDecision',
        'a pending decision needs a stable definition ID and its option snapshot');
    }
  }
  return diagnostics;
}

/**
 * Migration chain. Each entry upgrades an envelope from `version` to
 * `version + 1`. Empty today: version 1 is the only format, and an unknown
 * version must fail loudly rather than be guessed at.
 */
/** Chain of version upgrades. Register a step here when the envelope shape changes. */
export const ENVELOPE_MIGRATIONS: Partial<Record<number, (raw: UnknownRecord) => UnknownRecord>> = {};
/** Upper bound on chain length, so a non-advancing step fails instead of hanging. */
const MAX_MIGRATION_STEPS = 32;

/**
 * Upgrade an untrusted envelope to the current version, or report why it cannot be.
 * `migrations` is injectable so the chain itself can be exercised before a real
 * historical version exists; production callers use the registered chain.
 */
export function migrateLifeEnvelope(
  input: unknown,
  migrations: Partial<Record<number, (raw: UnknownRecord) => UnknownRecord>> = ENVELOPE_MIGRATIONS
): LifeSaveEnvelope {
  let current = record(input);
  if (!current) throw new SaveEnvelopeError('Cannot read save envelope', [
    { code: 'envelope.not-object', path: '', message: 'save envelope is not an object' }
  ]);
  let version = current.envelopeVersion;
  let steps = 0;
  for (;;) {
    if (version === SAVE_ENVELOPE_VERSION) break;
    if (typeof version !== 'number' || !migrations[version]) {
      throw new SaveEnvelopeError('Cannot read save envelope', [{
        code: 'envelope.version-unsupported', path: 'envelopeVersion',
        message: `no migration from envelope version ${String(version)}`
      }]);
    }
    if (++steps > MAX_MIGRATION_STEPS) {
      // A migration that forgets to bump the version would otherwise spin forever.
      throw new SaveEnvelopeError('Cannot read save envelope', [{
        code: 'envelope.migration-loop', path: 'envelopeVersion',
        message: `migration chain did not reach version ${SAVE_ENVELOPE_VERSION} after ${MAX_MIGRATION_STEPS} steps`
      }]);
    }
    current = migrations[version]!(current);
    version = current.envelopeVersion;
  }
  const diagnostics = validateLifeEnvelope(current);
  if (diagnostics.length) throw new SaveEnvelopeError('Save envelope is invalid', diagnostics);
  return current as unknown as LifeSaveEnvelope;
}

export interface RestoreOptions {
  readonly expectedRulesetVersion?: number;
  readonly expectedCoreVersion?: string;
  /**
   * Content packs the restoring build actually has. When provided, every package
   * recorded in the save must be present with the same version and content hash;
   * the restore refuses otherwise instead of guessing which questions were meant.
   */
  readonly packages?: ReadonlyArray<{readonly id: string; readonly version: string; readonly hash: string}>;
}

/** Minimal runtime surface the restore path needs. */
interface RestoreRuntime {
  readonly DECISIONS?: Record<string, unknown>;
  restoreRandom(snapshot: RandomSnapshot): void;
  assertStateInvariants?(state: unknown): void;
}

/**
 * Rebuild a life from an envelope. Definition and option resolution happens
 * against the *current* content; a mismatch with the stored snapshot aborts the
 * restore instead of silently changing what the player is being asked.
 */
export function restoreLife(runtime: RestoreRuntime, input: unknown, options: RestoreOptions = {}): UnknownRecord {
  const envelope = migrateLifeEnvelope(input);
  const diagnostics: SaveDiagnostic[] = [];
  if (options.expectedRulesetVersion != null && envelope.rulesetVersion !== options.expectedRulesetVersion) {
    diagnostics.push({
      code: 'ruleset.mismatch', path: 'rulesetVersion',
      message: `save was written with ruleset ${envelope.rulesetVersion}, runtime is ${options.expectedRulesetVersion}`
    });
  }
  if (options.expectedCoreVersion != null && envelope.contentLock.coreVersion !== options.expectedCoreVersion) {
    diagnostics.push({
      code: 'content.mismatch', path: 'contentLock.coreVersion',
      message: `save was written with core ${envelope.contentLock.coreVersion}, runtime is ${options.expectedCoreVersion}`
    });
  }
  if (options.packages) {
    const current = new Map(options.packages.map(pack => [pack.id, pack]));
    envelope.contentLock.packages.forEach((recorded, index) => {
      const path = `contentLock.packages[${index}]`;
      const found = current.get(recorded.id);
      if (!found) {
        diagnostics.push({
          code: 'content.package-missing', path: `${path}.id`,
          message: `content package ${recorded.id} is not present in this build`
        });
        return;
      }
      if (found.version !== recorded.version) {
        diagnostics.push({
          code: 'content.package-version-changed', path: `${path}.version`,
          message: `content package ${recorded.id} is version ${found.version}, the save was written with ${recorded.version}`
        });
        return;
      }
      if (found.hash !== recorded.hash) {
        diagnostics.push({
          code: 'content.package-content-changed', path: `${path}.hash`,
          message: `content package ${recorded.id} changed without a version bump`
        });
      }
    });
  }
  if (diagnostics.length) throw new SaveEnvelopeError('Save cannot be resumed on this build', diagnostics);

  const state: UnknownRecord = { ...envelope.state };
  state.queue = envelope.interactions.queue.map(item => ({ ...item }));

  const pending = envelope.interactions.pendingDecision;
  if (pending) {
    const decisions = runtime.DECISIONS ?? {};
    const definition = record(decisions[pending.decisionId]);
    if (!definition) {
      throw new SaveEnvelopeError('Save cannot be resumed', [{
        code: 'pending.unknown-decision', path: 'interactions.pendingDecision.decisionId',
        message: `decision ${pending.decisionId} is not registered in this build`
      }]);
    }
    const sourceOptions = typeof definition.options === 'function'
      ? (definition.options as (state: unknown) => unknown[])(state)
      : (definition.options as unknown[] | undefined) ?? [];
    const available = sourceOptions
      .map(record)
      .filter((option): option is UnknownRecord => option !== null)
      .filter(option => typeof option.require !== 'function' ||
        (option.require as (state: unknown) => boolean)(state));
    if (available.length !== pending.options.length) {
      throw new SaveEnvelopeError('Save cannot be resumed', [{
        code: 'pending.option-count', path: 'interactions.pendingDecision.options',
        message: `stored ${pending.options.length} options, current content offers ${available.length}`
      }]);
    }
    const labelOf = (option: UnknownRecord): string => {
      const label = option.label;
      return typeof label === 'function' ? String((label as (state: unknown) => unknown)(state)) : String(label ?? '');
    };
    available.forEach((option, index) => {
      const expected = pending.options[index]?.label ?? '';
      if (labelOf(option) !== expected) {
        diagnostics.push({
          code: 'pending.option-mismatch', path: `interactions.pendingDecision.options[${index}]`,
          message: `option ${index} is "${labelOf(option)}" but the save expects "${expected}"`
        });
      }
    });
    if (diagnostics.length) throw new SaveEnvelopeError('Save cannot be resumed', diagnostics);

    state.pending = {
      id: pending.decisionId,
      title: pending.title,
      text: pending.text,
      options: pending.options.map(item => ({ ...item })),
      _def: definition,
      _opts: available,
      age: pending.age
    };
    state.paused = true;
  } else {
    state.pending = null;
  }

  runtime.restoreRandom(envelope.random);
  runtime.assertStateInvariants?.(state);
  return state;
}

/* ------------------------------------------------------------------------- */
/* Completed-life summaries (the only thing the application stores today)     */
/* ------------------------------------------------------------------------- */

export interface CompletedLifeSummary {
  readonly recordedAt: number;
  readonly name: string;
  readonly nation: string;
  readonly race: string;
  readonly age: number;
  readonly cause: string;
  readonly seed: number | null;
  readonly setup: Record<string, unknown>;
  /** Summaries written before the store was namespaced are still readable. */
  readonly legacy: boolean;
}

function summarize(entry: UnknownRecord, legacy: boolean): CompletedLifeSummary | null {
  if (!Number.isFinite(entry.age) || typeof entry.cause !== 'string') return null;
  return {
    recordedAt: Number.isFinite(entry.t) ? entry.t as number : 0,
    name: typeof entry.name === 'string' ? entry.name : '',
    nation: typeof entry.nation === 'string' ? entry.nation : '',
    race: typeof entry.race === 'string' ? entry.race : '',
    age: entry.age as number,
    cause: entry.cause,
    seed: Number.isFinite(entry.seed) ? entry.seed as number : null,
    setup: record(entry.setup) ?? {},
    legacy
  };
}

/**
 * Parse a stored summary list. Accepts both the current namespaced store and the
 * pre-namespace layout, marking the latter instead of pretending the two are the
 * same format. Invalid rows are dropped; the array itself is never rewritten.
 */
export function parseCompletedLifeRecords(raw: string | null | undefined): CompletedLifeSummary[] {
  if (typeof raw !== 'string' || raw.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const result: CompletedLifeSummary[] = [];
  for (const item of parsed) {
    const entry = record(item);
    if (!entry) continue;
    const summary = summarize(entry, entry.v == null);
    if (summary) result.push(summary);
  }
  return result;
}
