/**
 * Sampling math: the small numeric toolkit the simulation draws on.
 *
 * Two groups, both pure:
 *   - deterministic math (`clamp`, `lerp`, `normCdf`, `invNorm`, `piecewise`);
 *   - draws that consume exactly one value from an injected random source
 *     (`chance`, `range`, `irange`, `pick`, `wpick`, `wpickArr`).
 *
 * The second group is where behaviour is easy to break: every helper must consume
 * the stream in exactly the same order and count as before, or every downstream
 * life diverges. The 42-life compatibility fixture is the proof.
 */

export type Random = () => number;

export interface WeightedRecord {
  readonly [key: string]: number;
}

/* --- deterministic math -------------------------------------------------- */

export function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Standard normal CDF (Abramowitz–Stegun 7.1.26 rational approximation). */
export function normCdf(z: number): number {
  if (z < 0) return 1 - normCdf(-z);
  const b1 = 0.319381530;
  const b2 = -0.356563782;
  const b3 = 1.781477937;
  const b4 = -1.821255978;
  const b5 = 1.330274429;
  const p = 0.2316419;
  const t = 1 / (1 + p * z);
  const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
  return 1 - (Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI)) * poly;
}

/** Standard normal quantile (Acklam's approximation), clamped at ±8. */
export function invNorm(p: number): number {
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
    1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
    6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
    -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const tail = 0.02425;
  let q: number;
  let r: number;
  if (p < tail) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
      ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
  }
  if (p <= 1 - tail) {
    q = p - 0.5;
    r = q * q;
    return (((((a[0]! * r + a[1]!) * r + a[2]!) * r + a[3]!) * r + a[4]!) * r + a[5]!) * q /
      (((((b[0]! * r + b[1]!) * r + b[2]!) * r + b[3]!) * r + b[4]!) * r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]! * q + c[1]!) * q + c[2]!) * q + c[3]!) * q + c[4]!) * q + c[5]!) /
    ((((d[0]! * q + d[1]!) * q + d[2]!) * q + d[3]!) * q + 1);
}

/** Linear interpolation over `[x, y]` breakpoints, flat outside the range. */
export function piecewise(points: ReadonlyArray<readonly [number, number]>, x: number): number {
  if (points.length === 0) return 0;
  const first = points[0]!;
  if (x <= first[0]) return first[1];
  const last = points[points.length - 1]!;
  if (x >= last[0]) return last[1];
  for (let i = 0; i < points.length - 1; i++) {
    const left = points[i]!;
    const right = points[i + 1]!;
    if (x >= left[0] && x <= right[0]) {
      const t = (x - left[0]) / (right[0] - left[0]);
      return lerp(left[1], right[1], t);
    }
  }
  return last[1];
}

/* --- draws (each consumes exactly one random value) ---------------------- */

export function chance(p: number, random: Random): boolean {
  return random() < p;
}

export function range(low: number, high: number, random: Random): number {
  return low + random() * (high - low);
}

/** Integer in `[low, high]`. */
export function irange(low: number, high: number, random: Random): number {
  return low + Math.floor(random() * (high - low + 1));
}

export function pick<T>(items: readonly T[], random: Random): T {
  return items[Math.floor(random() * items.length)] as T;
}

/**
 * Weighted key pick. Negative weights count as zero; a table with no positive
 * weight yields its first key.
 */
export function wpick(weights: WeightedRecord, random: Random): string {
  const keys = Object.keys(weights);
  let total = 0;
  for (const key of keys) total += Math.max(0, weights[key] as number);
  if (total <= 0) return keys[0] as string;

  let remaining = random() * total;
  for (const key of keys) {
    remaining -= Math.max(0, weights[key] as number);
    if (remaining <= 0) return key;
  }
  return keys[keys.length - 1] as string;
}

/** Weighted item pick over an array of `{[key]: weight}` records. */
export function wpickArr<T extends {readonly [key: string]: unknown}>(
  items: readonly T[],
  key: string,
  random: Random
): T {
  let total = 0;
  for (const item of items) total += Math.max(0, Number(item[key]) || 0);
  if (total <= 0) return items[0] as T;

  let remaining = random() * total;
  for (const item of items) {
    remaining -= Math.max(0, Number(item[key]) || 0);
    if (remaining <= 0) return item;
  }
  return items[items.length - 1] as T;
}
