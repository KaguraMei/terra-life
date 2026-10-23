/**
 * Content pack identity.
 *
 * A save records which question packs produced the content it refers to. That
 * only works if a pack can be identified *stably*: an id and a version are not
 * enough when a pack is edited in place without a bump, so each pack also gets a
 * content digest.
 *
 * The digest is an identity checksum, not a security hash: it is a 32-bit FNV-1a
 * over a canonical projection of the pack, computed with plain arithmetic so it
 * works identically in Node and in the browser without `crypto`.
 */

export interface PackLock {
  readonly id: string;
  readonly version: string;
  readonly hash: string;
}

type UnknownRecord = Record<string, unknown>;

const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord : null;

const rows = (value: unknown): UnknownRecord[] =>
  Array.isArray(value) ? value.map(record).filter((row): row is UnknownRecord => row !== null) : [];

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Stable string ordering so the digest does not depend on declaration order. */
const byKey = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Only the parts that can change what a player is asked or how it is scored:
 * question ids, their option ids, the score vectors, and the pool wiring.
 * Cosmetic or structural extras are deliberately excluded so reformatting a
 * pack does not invalidate existing saves.
 */
export function packProjection(pack: unknown): string {
  const source = record(pack) ?? {};
  const questions = rows(source.questions).map(question => {
    const options = rows(question.options).map(option => {
      const scores = record(option.scores) ?? {};
      const vector = Object.keys(scores).sort(byKey)
        .map(key => `${key}:${typeof scores[key] === 'number' ? scores[key] : 0}`);
      return `${text(option.id)}(${vector.join(',')})`;
    }).sort(byKey);
    return `${text(question.id)}[${text(question.kind)}]{${options.join(';')}}`;
  }).sort(byKey);

  const pools = rows(source.pools).map(pool => {
    const axes = rows(pool.axes).map(axis =>
      `${text(axis.id)}:${typeof axis.minimum === 'number' ? axis.minimum : 0}` +
      `x${typeof axis.weight === 'number' ? axis.weight : 0}`).sort(byKey);
    const draw = record(pool.draw) ?? {};
    const drawKeys = Object.keys(draw).sort(byKey).map(key => `${key}=${String(draw[key])}`);
    const ids = Array.isArray(pool.questionIds) ? pool.questionIds.map(text).sort(byKey) : [];
    return `${text(pool.id)}<${ids.join('|')}>({${drawKeys.join(',')})` +
      `[${axes.join(';')}]pass=${String(pool.passScore)}wait=${String(pool.waitlistScore)}`;
  }).sort(byKey);

  return `${text(source.id)}@${String(source.version)}|q{${questions.join(';')}}|p{${pools.join(';')}}`;
}

/** 32-bit FNV-1a over UTF-16 code units; deterministic across runs and hosts. */
export function digest(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= (value.charCodeAt(index) >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a-${hash.toString(16).padStart(8, '0')}-${value.length}`;
}

/** Identity of one pack, or null when it does not look like a pack at all. */
export function packLock(pack: unknown): PackLock | null {
  const source = record(pack);
  if (!source) return null;
  const id = text(source.id);
  if (!id) return null;
  return { id, version: String(source.version), hash: digest(packProjection(source)) };
}

/** Locks for a registry, sorted by id so the envelope stays stable. */
export function packLocks(sources: unknown): PackLock[] {
  const registry = record(sources);
  if (!registry) return [];
  return Object.keys(registry).sort(byKey)
    .map(key => packLock(registry[key]))
    .filter((lock): lock is PackLock => lock !== null);
}

/** Find one pack lock by id in a list. */
export function findPackLock(locks: readonly PackLock[] | undefined, id: string): PackLock | undefined {
  return (locks ?? []).find(lock => lock.id === id);
}
