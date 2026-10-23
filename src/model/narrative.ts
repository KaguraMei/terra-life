/**
 * Narrative and effects: the two primitives every other module writes through.
 *
 * `narrate` appends a timeline entry; `eff` applies a delta patch to the four dimensions,
 * money and arts. Both are small, and both are called from everywhere, which is exactly
 * why they belong here: a change to their semantics is a change to the whole game, and
 * right now that semantics is only implied by the shape of two loops.
 *
 * The rules that were implicit and are now explicit:
 *
 *   - a log entry always carries `age`, `year`, `text` and a `kind` that defaults to
 *     `'ev'`; extra fields are copied on top, so a caller can override them;
 *   - the log is capped: past 4000 entries the oldest 500 are dropped in one go, which
 *     keeps a long life from growing without bound without trimming on every write;
 *   - a *falsy* delta is skipped, so `{hl: 0}` writes nothing at all — that is what
 *     keeps "no effect" from silently rounding a value;
 *   - health, mood, bonds, knowledge and arts are clamped to 0..100, while **money is
 *     not**: a debt or a windfall can take the balance past either end.
 */

export type LogKind = 'birth' | 'ev' | 'dec' | 'mil' | 'death' | 'sys' | 'org' | 'fam' | 'ori';

export interface LogEntry {
  readonly age: number;
  readonly year: number;
  readonly text: string;
  readonly kind: string;
  readonly [extra: string]: unknown;
}

/** The log grows to this many entries before the oldest are dropped. */
export const LOG_CAP = 4000;
/** How many entries a trim drops at once. */
export const LOG_TRIM = 500;

export interface LogContext {
  readonly age: number;
  readonly year: number;
}

/**
 * Build one timeline entry.
 *
 * `kind` defaults to `'ev'` — the generic event kind — because most callers are events
 * and passing the kind explicitly at every call site would invite typos that only show
 * up in the rendered report.
 */
export function logEntry(
  context: LogContext, text: string, kind?: string | null, extra?: Record<string, unknown> | null
): LogEntry {
  const entry: Record<string, unknown> = {
    age: context.age,
    year: context.year,
    text,
    kind: kind || 'ev'
  };
  if (extra) {
    for (const key of Object.keys(extra)) entry[key] = extra[key];
  }
  return entry as unknown as LogEntry;
}

/** True when the log has outgrown its cap and the oldest entries should go. */
export function logOverflows(length: number): boolean {
  return length > LOG_CAP;
}

/** The slice to keep after a trim: everything from `LOG_TRIM` onward. */
export function logTrimStart(): number {
  return LOG_TRIM;
}

/** A delta patch. Any field may be omitted; a falsy value means "leave it alone". */
export interface EffectPatch {
  readonly hl?: number;
  readonly h?: number;
  readonly so?: number;
  readonly sm?: number;
  readonly money?: number;
  readonly arts?: number;
}

export interface EffectValues {
  readonly hl: number;
  readonly h: number;
  readonly so: number;
  readonly sm: number;
  readonly money: number;
  readonly arts: number;
}

/** The dimension order the original loop used; kept so tests can pin it. */
export const DIMENSION_ORDER = ['hl', 'h', 'so'] as const;
export const DIMENSION_CLAMP = [0, 100] as const;

/**
 * Apply a patch and return the new values.
 *
 * Pure: the caller writes the result back onto the life. Money is deliberately outside
 * the clamp — `finances` and the debt machinery rely on being able to take it negative
 * before the next year settles it.
 */
export function applyEffectPatch(
  values: EffectValues, patch: EffectPatch, clamp: (value: number, low: number, high: number) => number
): EffectValues {
  const next: Record<string, number> = {
    hl: values.hl, h: values.h, so: values.so, sm: values.sm, money: values.money, arts: values.arts
  };

  const bump = (key: 'hl' | 'h' | 'so' | 'sm' | 'arts', delta: number | undefined) => {
    if (!delta) return;
    next[key] = clamp((next[key] ?? 0) + delta, 0, 100);
  };

  for (const key of DIMENSION_ORDER) bump(key, patch[key]);
  bump('sm', patch.sm);
  bump('arts', patch.arts);

  // Money is the one value the patch may push past either end.
  if (patch.money) next.money = (next.money ?? 0) + patch.money;

  return next as unknown as EffectValues;
}
