/**
 * Life-cycle rules: the two birth draws, pacing, life stage and net worth.
 *
 * These are the parts of the state module that only *compute*. `newLife` itself
 * assembles a whole life (and touches a dozen content tables), and `computeIncome`
 * starts by syncing the organization, so both stay in the engine for now.
 *
 * The draw counts here are load-bearing: `drawWealth` always consumes two values and
 * `drawArts` four or five. Change either and every downstream life drifts.
 */

export interface WealthPorts {
  readonly nation: (id: string) => {readonly gi: number};
  readonly race: (id: string) => {readonly stand: number};
}

/**
 * Family wealth tier, 1 (destitute) to 5 (wealthy).
 *
 * A high-Gini nation thickens both tails and thins the middle; race standing then
 * nudges the result up or down by at most one tier.
 */
export function drawWealth(nationId: string, raceId: string, random: () => number, ports: WealthPorts): number {
  const nation = ports.nation(nationId);
  const race = ports.race(raceId);

  const roll = random();
  const middle = 1 - nation.gi;
  let tier: number;
  if (roll < (1 - middle) / 2) tier = 1;
  else if (roll > 1 - (1 - middle) / 2) tier = 5;
  else {
    const u = (roll - (1 - middle) / 2) / middle;
    tier = u < 0.42 ? 2 : u < 0.78 ? 3 : 4;
  }

  const bump = race.stand * 0.42 + (random() - 0.5);
  if (bump > 0.9 && tier < 5) tier += 1;
  else if (bump < -0.9 && tier > 1) tier -= 1;
  return Math.min(5, Math.max(1, tier));
}

export interface ArtsPorts {
  readonly nation: (id: string) => {readonly art: number};
  readonly race: (id: string) => {readonly artMod: number};
}

/** Innate originium-arts aptitude, 0..99. */
export function drawArts(nationId: string, raceId: string, random: () => number, ports: ArtsPorts): number {
  const nation = ports.nation(nationId);
  const race = ports.race(raceId);

  let base = nation.art * 34 + race.artMod * 3.0;
  // Three uniforms approximate a normal; the spread is deliberately wide.
  base += (random() + random() + random() - 1.5) * 22;
  if (random() < 0.012) base += 28 + random() * 20;
  return Math.round(Math.min(99, Math.max(2, base)));
}

export interface Pace {
  readonly name: string;
  readonly min: number;
}

/** Playback lengths: the whole life is meant to take roughly this long. */
export const PACES: Readonly<Record<string, Pace>> = {
  short: {name: '约 30 分钟', min: 30},
  normal: {name: '约 1 小时', min: 60},
  long: {name: '约 1.5 小时', min: 90}
};

/**
 * Real seconds one simulated year takes.
 *
 * The pace maps *expected lifespan* onto wall-clock time, so a shorter life packs
 * more seconds into each year. Years past 60 are compressed (see `playAgeDeriv`),
 * which is what keeps an 800-year lich playable.
 */
export function yearlySeconds(
  paceKey: string,
  expectedAge: number,
  age: number,
  paces: Readonly<Record<string, Pace>>,
  playAge: (age: number) => number,
  playAgeDeriv: (age: number) => number
): number {
  const pace = paces[paceKey] ?? paces.normal ?? {name: '', min: 60};
  const span = Math.max(20, playAge(Math.max(30, expectedAge)));
  return (pace.min * 60) / span * playAgeDeriv(age);
}

export type LifeStage = 'baby' | 'service' | 'school' | 'kidwork' | 'elder' | 'adult';

export const STAGE_NAME: Readonly<Record<LifeStage, string>> = {
  baby: '幼年', service: '服役', school: '求学',
  kidwork: '童工', elder: '晚年', adult: '成年'
};

export const STAGE_NAME_EN: Readonly<Record<LifeStage, string>> = {
  baby: 'Childhood', service: 'Service', school: 'Schooling',
  kidwork: 'Child Labour', elder: 'Old Age', adult: 'Adulthood'
};

export interface StageInput {
  readonly age: number;
  readonly serveLeft: number;
  readonly school: boolean;
  readonly retired: boolean;
}

/** Which stage of life this is; service and schooling outrank age after six. */
export function lifeStage(subject: StageInput): LifeStage {
  if (subject.age < 6) return 'baby';
  if (subject.serveLeft > 0) return 'service';
  if (subject.school) return 'school';
  if (subject.age < 15) return 'kidwork';
  if (subject.age >= 65 || subject.retired) return 'elder';
  return 'adult';
}

/** Display name of a stage; an unknown key reads as adulthood, never mixed. */
export function lifeStageName(stage: string, language: 'zh' | 'en' = 'zh'): string {
  const key = (STAGE_NAME as Record<string, string>)[stage] ? stage as LifeStage : 'adult';
  return language === 'en' ? STAGE_NAME_EN[key] : STAGE_NAME[key];
}

export interface WorthInput {
  readonly money: number;
  readonly homeValue?: number;
  readonly carValue?: number;
  readonly rentals?: number;
  readonly rentalValue?: number;
  readonly debt: number;
}

/** Cash plus property minus debt. */
export function netWorth(subject: WorthInput): number {
  let worth = subject.money;
  if (subject.homeValue) worth += subject.homeValue;
  if (subject.carValue) worth += subject.carValue;
  if (subject.rentals) worth += subject.rentals * (subject.rentalValue || 0);
  worth -= subject.debt;
  return worth;
}
