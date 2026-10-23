/**
 * Cohort survival: the people born in the same second.
 *
 * The cohort is display-only — peers never take part in any event — so it can be
 * low precision: a 600-sample survival curve plus six named peers. What matters is
 * that it shares the life's own life table, so the curve moves with nation, sex,
 * race and stratum.
 *
 * Pure by construction: the random source, the name generator and the race pool
 * arrive as ports, which is what makes this testable without a running simulation
 * and lets the model layer stop being a legacy script.
 */

/** A life table: `l[i]` is the share of births still alive at age `i`. */
export interface SurvivalTable {
  readonly maxAge: number;
  readonly l: readonly number[];
}

/** One named peer, as the peer list shows them. */
export interface CohortPeer {
  readonly name: string;
  readonly fullName: string;
  readonly sex: string;
  readonly race: string;
  readonly deathAt: number;
}

export interface CohortPoint {
  readonly age: number;
  readonly alive: number;
}

export interface Cohort {
  readonly size: number;
  readonly deaths: readonly number[];
  readonly curve: readonly CohortPoint[];
  readonly peers: readonly CohortPeer[];
}

export interface CohortPorts {
  /** Uniform random in [0,1) from the life's seeded generator. */
  readonly random: () => number;
  /** Race ids that can appear among peers of this life. */
  readonly peerRaces: (state: unknown) => readonly string[];
  /** Generate one name for a given nation/sex/race. */
  readonly makeName: (nation: string, sex: string, race: string) => {given: string; full: string};
}

export interface CohortOptions {
  readonly curveSamples?: number;
  readonly peerCount?: number;
  /** Age bucket of the survival curve, in years. */
  readonly curveStep?: number;
}

const CURVE_SAMPLES = 600;
const PEER_COUNT = 6;
const CURVE_STEP = 5;

/** Invert the survival function: the age at which a uniformly drawn life dies. */
export function drawDeathAge(table: SurvivalTable, random: () => number): number {
  const u = random();
  for (let age = 0; age <= table.maxAge; age++) {
    const next = table.l[age + 1];
    if (next === undefined) break;
    if (next <= u) return age;
  }
  return table.maxAge;
}

/** Share of the cohort still alive at `age` (0..1). */
export function cohortAliveAt(deaths: readonly number[], age: number): number {
  let low = 0;
  let high = deaths.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((deaths[mid] as number) < age) low = mid + 1;
    else high = mid;
  }
  return deaths.length === 0 ? 1 : (deaths.length - low) / deaths.length;
}

/**
 * Build the cohort for one life.
 *
 * Sampling order is part of the contract: the same seeded generator must consume
 * draws in this order or every downstream life diverges.
 */
export function buildCohort(
  state: {readonly nation: string; readonly race: string},
  table: SurvivalTable,
  ports: CohortPorts,
  options: CohortOptions = {}
): Cohort {
  const samples = options.curveSamples ?? CURVE_SAMPLES;
  const peerCount = options.peerCount ?? PEER_COUNT;
  const step = options.curveStep ?? CURVE_STEP;
  const {random} = ports;

  const deaths = new Array<number>(samples);
  for (let i = 0; i < samples; i++) deaths[i] = drawDeathAge(table, random);
  deaths.sort((a, b) => a - b);

  const last = deaths[samples - 1] ?? 0;
  const top = Math.max(step, Math.min(120, Math.ceil(last / step) * step));
  const curve: CohortPoint[] = [];
  let index = 0;
  for (let age = 0; age <= top; age += step) {
    while (index < samples && (deaths[index] as number) < age) index++;
    curve.push({age, alive: (samples - index) / samples});
  }

  const pool = ports.peerRaces(state);
  const peers: CohortPeer[] = [];
  for (let i = 0; i < peerCount; i++) {
    const sex = random() < 0.5 ? 'M' : 'F';
    const race = random() < 0.55
      ? state.race
      : (pool[Math.floor(random() * pool.length)] ?? state.race);
    const name = ports.makeName(state.nation, sex, race);
    peers.push({
      name: name.given,
      fullName: name.full,
      sex,
      race,
      deathAt: drawDeathAge(table, random)
    });
  }
  peers.sort((a, b) => a.deathAt - b.deathAt);

  return {size: samples, deaths, curve, peers};
}
