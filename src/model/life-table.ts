/**
 * Life table construction: the hazard curve a life is drawn from.
 *
 * Two independent hazards, unlike the original single-e0 Gompertz fit:
 *   - senescence, whose slope comes from the race's physiological lifespan ceiling;
 *   - external risk, a flat level whose *shape* varies with age.
 *
 * The external level is solved by bisection so the table reproduces the social
 * life expectancy of the nation/stratum. Everything is pure: the nation record,
 * the stratum coefficients and the lifespan range arrive from the content layer.
 */

/** The fields of a nation record this module needs. */
export interface NationHazard {
  readonly id: string;
  /** Female–male life-expectancy gap in years. */
  readonly gap: number;
  /** Infant mortality per 1000. */
  readonly im: number;
  /** Under-five mortality per 1000. */
  readonly u5: number;
}

/** Stratum multipliers on infant / under-five mortality. */
export interface StratumHazard {
  readonly imK: number;
  readonly u5K: number;
}

export interface LifeTablePorts {
  /** Stratum record by id; the caller guarantees it exists. */
  readonly stratum: (id: string) => StratumHazard;
  /** Social life expectancy for this nation/stratum pair. */
  readonly stratumLE: (nationId: string, stratumId: string) => number;
  /** `[low, high]` physiological lifespan for the race (and court). */
  readonly lifeMaxOf: (raceId: string, courtId: string | null) => readonly [number, number];
}

/** A constructed life table. `q[x]` is the hazard, `l[x]` the survivors' share. */
export interface LifeTable {
  readonly q: Float64Array;
  readonly l: Float64Array;
  readonly e0: number;
  readonly maxAge: number;
  readonly lifeMax: readonly [number, number];
  readonly socialLE: number;
  readonly g: number;
  readonly A0: number;
  readonly Aext: number;
  readonly stratum: string;
  readonly race: string;
  readonly court: string | null;
}

const HARD_CAP = 1500; // physiological ceiling (liches)
const AGE0 = 15; // senescence starts after puberty

export type Sex = 'M' | 'F';

/** Simulated age → "felt" years: linear to 60, logarithmic afterwards. */
export function playAge(age: number): number {
  if (age <= 60) return age;
  return 60 + 40 * Math.log(1 + (age - 60) / 40);
}

/** How long one year feels at this age, as a multiplier. */
export function playAgeDeriv(age: number): number {
  if (age <= 60) return 1;
  return 40 / (40 + (age - 60));
}

/** Expected health for an age, used as the baseline for the frailty term. */
export function expHealth(age: number): number {
  if (age < 1) return 72;
  if (age < 5) return 80;
  if (age < 30) return 90;
  if (age < 60) return 90 - (age - 30) * 0.6;
  return Math.max(15, 72 - (age - 60) * 0.95);
}

function senescSlope(lifeHigh: number): number {
  const span = Math.max(20, lifeHigh - AGE0);
  return Math.log(1 / 1e-5) / span; // hazard reaches ~1 at the ceiling
}

function senescence(age: number, g: number, a0: number): number {
  if (age <= AGE0) return 0;
  return a0 * Math.exp(g * (age - AGE0));
}

/** Age shape of external risk: accidents, violence, infection, catastrophe. */
function extShape(age: number): number {
  if (age < 15) return 1.00;
  if (age < 30) return 1.28;
  if (age < 50) return 0.85;
  if (age < 65) return 0.95;
  if (age < 80) return 1.30;
  return 1.90;
}

/**
 * Build a life table, caching per (nation, sex, race, court, stratum).
 *
 * The cache lives on the builder instance rather than at module scope so two
 * runtimes in one realm cannot share tables built from different content.
 */
export function createLifeTableBuilder(ports: LifeTablePorts) {
  const cache = new Map<string, LifeTable>();

  function build(nation: NationHazard, sex: Sex, raceId: string, courtId: string | null, stratumId: string): LifeTable {
    const race = raceId || 'feline';
    const stratum = stratumId || 'industrial';
    const key = [nation.id, sex, race, courtId || '-', stratum].join('|');
    const cached = cache.get(key);
    if (cached) return cached;

    const stratumRecord = ports.stratum(stratum);
    const socialLE = ports.stratumLE(nation.id, stratum);
    const e0 = sex === 'F' ? socialLE + nation.gap * 0.49 : socialLE - nation.gap * 0.51;

    const lifeMax = ports.lifeMaxOf(race, courtId);
    const g = senescSlope(lifeMax[1]);
    const A0 = 1e-5;
    const maxAge = Math.min(HARD_CAP, Math.ceil(lifeMax[1] * 1.05) + 5);

    // Infant block: the stratum coefficient multiplies the rate directly.
    const k = sex === 'F' ? 0.92 : 1.08;
    const q0 = Math.min(0.30, (nation.im * stratumRecord.imK / 1000) * k);
    const u5 = Math.min(0.42, Math.max(q0 + 0.0005, (nation.u5 * stratumRecord.u5K / 1000) * k));
    const h = -Math.log((1 - u5) / (1 - q0));
    const qc = [0.4, 0.27, 0.19, 0.14].map(weight => 1 - Math.exp(-h * weight));
    const q514 = 1 - Math.pow(1 - Math.min(0.25, u5 * 0.9), 0.28);

    /** Build the death curve for one external-risk level and report back e0. */
    const attempt = (A: number): {q: Float64Array; e: number} => {
      const q = new Float64Array(maxAge + 1);
      q[0] = q0;
      for (let i = 1; i <= 4; i++) q[i] = qc[i - 1] as number;
      for (let x = 5; x <= maxAge; x++) {
        if (x === maxAge) { q[x] = 1; continue; }
        if (x < 15) { q[x] = Math.min(0.4, q514); continue; }
        const hazard = A * extShape(x) + senescence(x, g, A0);
        q[x] = Math.min(1, 1 - Math.exp(-hazard));
      }
      let survivors = 1;
      let e = 0;
      for (let x = 0; x <= maxAge; x++) {
        const deaths = survivors * (q[x] as number);
        e += x === 0 ? survivors - 0.85 * deaths : survivors - 0.5 * deaths;
        survivors -= deaths;
      }
      return {q, e};
    };

    // Bisect the external level: a higher A means a shorter e0.
    let low = 1e-7;
    let high = 1.5;
    let result = attempt(high);
    for (let i = 0; i < 60; i++) {
      const mid = (low + high) / 2;
      result = attempt(mid);
      if (result.e > e0) low = mid;
      else high = mid;
    }
    const Aext = (low + high) / 2;
    result = attempt(Aext);

    const l = new Float64Array(maxAge + 2);
    l[0] = 1;
    for (let x = 0; x <= maxAge; x++) l[x + 1] = (l[x] as number) * (1 - (result.q[x] as number));

    const table: LifeTable = {
      q: result.q,
      l,
      e0,
      maxAge,
      lifeMax: [lifeMax[0], lifeMax[1]],
      socialLE,
      g,
      A0,
      Aext,
      stratum,
      race,
      court: courtId || null
    };
    cache.set(key, table);
    return table;
  }

  return {build, clear: () => cache.clear(), size: () => cache.size};
}
