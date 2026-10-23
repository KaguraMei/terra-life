/**
 * Declared state changes.
 *
 * Event handlers used to mutate the shared life object field by field, which
 * meant a typo (or a new author) could write anything, anywhere. This module is
 * the first step away from that: a handler submits a **finite, validated list of
 * effects**, and one function applies them.
 *
 * Scope is deliberately small. Only operations that are safe as data are here:
 * attribute deltas, money, and flags. Anything that must pass through a domain
 * transition - getting or losing a job, joining or leaving an organization,
 * retirement, infection - is *not* expressible as an effect, so content cannot
 * bypass those transitions.
 *
 * The list is validated as a whole before anything is applied: a malformed
 * effect aborts the call instead of leaving half the changes in place.
 */

export type AttributeKey = 'hl' | 'h' | 'sm' | 'so' | 'arts';
export const ATTRIBUTE_KEYS: readonly AttributeKey[] = ['hl', 'h', 'sm', 'so', 'arts'];

export interface AttributesEffect {
  readonly kind: 'attributes';
  readonly hl?: number;
  readonly h?: number;
  readonly sm?: number;
  readonly so?: number;
  readonly arts?: number;
}

export interface MoneyEffect {
  readonly kind: 'money';
  readonly amount: number;
}

/** Increment a numeric flag; missing flags start at zero. */
export interface FlagIncrementEffect {
  readonly kind: 'flag';
  readonly name: string;
  readonly delta?: number;
}

/** Store a JSON primitive under a flag name. */
export interface FlagSetEffect {
  readonly kind: 'setFlag';
  readonly name: string;
  readonly value: string | number | boolean | null;
}

export type Effect = AttributesEffect | MoneyEffect | FlagIncrementEffect | FlagSetEffect;

export interface EffectDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export class EffectError extends Error {
  readonly diagnostics: readonly EffectDiagnostic[];
  constructor(diagnostics: readonly EffectDiagnostic[]) {
    super(`Invalid effect list:\n${formatEffectDiagnostics(diagnostics)}`);
    this.name = 'EffectError';
    this.diagnostics = diagnostics;
  }
}

export function formatEffectDiagnostics(diagnostics: readonly EffectDiagnostic[]): string {
  return diagnostics.map(item => `- [${item.code}] ${item.path || '(root)'}: ${item.message}`).join('\n');
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord : null;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const ATTRIBUTE_SET = new Set<string>(ATTRIBUTE_KEYS);
const ALLOWED_PROPERTIES: Record<string, readonly string[]> = {
  attributes: ['kind', ...ATTRIBUTE_KEYS],
  money: ['kind', 'amount'],
  flag: ['kind', 'name', 'delta'],
  setFlag: ['kind', 'name', 'value']
};

/**
 * Validate an effect list without touching state. Unknown kinds, unknown
 * properties and non-finite numbers are reported instead of ignored, so a typo
 * in content fails loudly.
 */
export function validateEffects(input: unknown): EffectDiagnostic[] {
  const diagnostics: EffectDiagnostic[] = [];
  const fail = (code: string, path: string, message: string) =>
    diagnostics.push({ code, path, message });

  if (!Array.isArray(input)) {
    fail('effects.not-array', '', 'an effect list must be an array');
    return diagnostics;
  }
  if (input.length === 0) fail('effects.empty', '', 'an effect list cannot be empty');

  input.forEach((raw, index) => {
    const path = `effects[${index}]`;
    const effect = record(raw);
    if (!effect) {
      fail('effect.not-object', path, 'an effect must be an object');
      return;
    }
    const kind = effect.kind;
    if (typeof kind !== 'string' || !(kind in ALLOWED_PROPERTIES)) {
      fail('effect.unknown-kind', `${path}.kind`, `unsupported effect kind ${String(kind)}`);
      return;
    }
    const allowed = new Set(ALLOWED_PROPERTIES[kind]);
    for (const key of Object.keys(effect)) {
      if (!allowed.has(key)) fail('effect.unknown-property', `${path}.${key}`, `unknown property ${key} on ${kind} effect`);
    }

    if (kind === 'attributes') {
      const keys = Object.keys(effect).filter(key => key !== 'kind');
      if (!keys.length) fail('effect.empty-attributes', path, 'an attributes effect needs at least one delta');
      for (const key of keys) {
        if (!ATTRIBUTE_SET.has(key)) {
          fail('effect.unknown-attribute', `${path}.${key}`, `unknown attribute ${key}`);
          continue;
        }
        if (!isFiniteNumber(effect[key])) {
          fail('effect.non-finite', `${path}.${key}`, 'attribute deltas must be finite numbers');
        }
      }
      return;
    }

    if (kind === 'money') {
      if (!isFiniteNumber(effect.amount)) {
        fail('effect.non-finite', `${path}.amount`, 'money amount must be a finite number');
      }
      return;
    }

    if (typeof effect.name !== 'string' || effect.name.length === 0) {
      fail('effect.empty-flag-name', `${path}.name`, 'flag effects need a non-empty name');
      return;
    }
    if (kind === 'flag') {
      if (effect.delta != null && !isFiniteNumber(effect.delta)) {
        fail('effect.non-finite', `${path}.delta`, 'flag deltas must be finite numbers');
      }
      return;
    }
    const value = effect.value;
    const primitive = value === null || ['string', 'number', 'boolean'].includes(typeof value);
    if (!primitive || (typeof value === 'number' && !isFiniteNumber(value))) {
      fail('effect.invalid-flag-value', `${path}.value`, 'flag values must be JSON primitives');
    }
  });

  return diagnostics;
}

/** The state surface effects are allowed to touch, supplied by the caller. */
export interface EffectPorts {
  /** Apply clamped attribute deltas through the model's own attribute rules. */
  attributes(deltas: AttributesEffect): void;
  money(amount: number): void;
  flag(name: string, delta: number): void;
  setFlag(name: string, value: unknown): void;
}

/**
 * Apply a validated effect list in order and return how many effects ran.
 * Throws `EffectError` without applying anything when the list is invalid.
 */
export function applyEffects(input: unknown, ports: EffectPorts): number {
  const diagnostics = validateEffects(input);
  if (diagnostics.length) throw new EffectError(diagnostics);
  const effects = input as Effect[];
  for (const effect of effects) {
    if (effect.kind === 'attributes') ports.attributes(effect);
    else if (effect.kind === 'money') ports.money(effect.amount);
    else if (effect.kind === 'flag') ports.flag(effect.name, effect.delta ?? 1);
    else ports.setFlag(effect.name, effect.value);
  }
  return effects.length;
}
