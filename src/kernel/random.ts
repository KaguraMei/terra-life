/** Compatible with the original mulberry32 sequence; each owner gets its own state. */
export interface RandomSnapshot {
  readonly algorithm: 'mulberry32';
  readonly version: 1;
  readonly seed: number;
  readonly state: number;
  readonly draws: number;
}

export interface RandomSource {
  next(): number;
  seed(): number | null;
  reseed(seed: number): void;
  unseed(): void;
  snapshot(): RandomSnapshot | null;
  restore(snapshot: RandomSnapshot): void;
}

export function createRandom(seed: number | null = null, entropy = Math.random): RandomSource {
  let initial = seed === null ? null : seed >>> 0;
  let state = initial ?? 0;
  let draws = 0;
  return {
    next() {
      draws++;
      if (initial === null) return entropy();
      state = (state + 0x6D2B79F5) >>> 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    seed: () => initial,
    reseed(value) { initial = value >>> 0; state = initial; draws = 0; },
    unseed() { initial = null; state = 0; draws = 0; },
    snapshot() {
      return initial === null ? null :
        { algorithm: 'mulberry32', version: 1, seed: initial, state, draws };
    },
    restore(snapshot) {
      const uint32 = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
      if (!snapshot || snapshot.algorithm !== 'mulberry32' || snapshot.version !== 1 ||
          !uint32(snapshot.seed) || !uint32(snapshot.state) ||
          !Number.isSafeInteger(snapshot.draws) || snapshot.draws < 0) {
        throw new TypeError('Invalid mulberry32 snapshot');
      }
      initial = snapshot.seed; state = snapshot.state; draws = snapshot.draws;
    }
  };
}
