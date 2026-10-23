/**
 * Yearly rules: knowledge and arts growth, the happiness baseline and the budget.
 *
 * `year.js` itself is the settlement *orchestrator* — it walks the timeline, fires
 * events, opens decisions and calls into a dozen modules — and stays in the engine.
 * What lives here is what only needs arithmetic: two diminishing-returns curves with
 * a ceiling, one baseline, and the annual cash flow.
 *
 * The knowledge ceiling exists because the first version let `knowAdd` approach 100
 * without ever reaching it: marginal returns slowed growth but never capped it, so a
 * 26-year-old could become a polymath.
 */

export interface YearSubject {
  readonly nation: string;
  readonly race: string;
  readonly eduLevel: number;
  readonly familyTier: number;
  readonly school: boolean;
  readonly knowledge: number;
  readonly income: number;
  readonly money: number;
  readonly debt: number;
  readonly oripathyTreated: boolean;
  readonly oripathyProvider: string | null;
  readonly conditions: number;
  readonly minorChildren: number;
  readonly partnerAlive: boolean;
  /** True when the partner also works (and therefore adds cost, not income here). */
  readonly secondWorker: boolean;
}

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const text = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const rows = (value: unknown): UnknownRecord[] =>
  Array.isArray(value) ? value.map(record).filter((row): row is UnknownRecord => row !== null) : [];

export function yearSubject(state: unknown): YearSubject {
  const life = record(state) ?? {};
  const stats = record(life.st) ?? {};
  const family = record(life.fam) ?? {};
  const ori = record(life.ori);
  const partner = record(family.partner);

  return {
    nation: text(life.nation),
    race: text(life.race),
    eduLevel: num(life.eduLevel),
    familyTier: num(life.q),
    school: Boolean(life.school),
    knowledge: num(stats.sm),
    income: num(life.income),
    money: num(life.money),
    debt: num(life.debt),
    oripathyTreated: Boolean(ori && ori.treated),
    oripathyProvider: ori && typeof ori.provider === 'string' ? ori.provider : null,
    conditions: Object.keys(record(life.conds) ?? {}).length,
    minorChildren: rows(family.kids)
      .filter(kid => kid.alive === true || kid.alive === 1)
      .filter(kid => num(kid.age) < 18).length,
    partnerAlive: Boolean(partner && partner.alive),
    secondWorker: Boolean(life.working2)
  };
}

export interface YearPorts {
  readonly nation: (id: string) => {
    readonly edu: number;
    readonly le: number;
    readonly gi: number;
    readonly war: number;
    readonly ppp: number;
  };
  readonly race: (id: string) => {readonly knowledgeMod: number; readonly artsMod: number};
  readonly clamp: (value: number, low: number, high: number) => number;
}

/** Ceiling on knowledge: schooling is the main step, then nation, race and means. */
export function knowledgeCap(subject: YearSubject, ports: YearPorts): number {
  const nation = ports.nation(subject.nation);
  const race = ports.race(subject.race);
  let cap = 34
    + subject.eduLevel * 11
    + Math.min(14, (nation.edu - 8) * 1.6)
    + race.knowledgeMod * 0.9
    + (subject.familyTier - 3) * 1.6;
  if (subject.school) cap += 6;
  return ports.clamp(cap, 25, 97);
}

/**
 * Add knowledge with diminishing returns: gains scale by `(1 - sm/cap)^0.7`, and
 * losses ignore the curve entirely.
 */
export function addKnowledge(current: number, amount: number, cap: number, clamp: YearPorts['clamp']): number {
  if (amount <= 0) return clamp(current + amount, 0, cap);
  const k = Math.pow(Math.max(0, 1 - current / cap), 0.70);
  return clamp(current + amount * (0.30 + 0.70 * k), 0, cap);
}

/** Arts aptitude grows slower and is scaled by race talent. */
export function addArts(current: number, amount: number, artsMod: number, clamp: YearPorts['clamp']): number {
  if (amount <= 0) return clamp(current + amount, 0, 100);
  const talent = 1 + artsMod * 0.04;
  const k = Math.pow(1 - current / 100, 0.85);
  return clamp(current + amount * (0.25 + 0.75 * k) * talent, 0, 100);
}

/** Baseline mood from the nation's lifespan, equality and peace. */
export function happinessBase(subject: YearSubject, ports: YearPorts): number {
  const nation = ports.nation(subject.nation);
  const base = 30 + (nation.le - 60) * 0.85 + (1 - nation.gi) * 14 + (1 - nation.war) * 6;
  return ports.clamp(base, 18, 78);
}

export interface Budget {
  readonly income: number;
  readonly cost: number;
  readonly support: number;
  readonly net: number;
  readonly money: number;
  readonly debt: number;
}

/**
 * One year's cash flow.
 *
 * Cost scales with the nation's price level, the household size and any medical
 * need. A shortfall becomes debt at 6% interest; a surplus first pays down 40% of
 * the debt. Both orders matter, so they are pinned by tests.
 */
export function annualBudget(subject: YearSubject, ports: YearPorts, subsistence: number): Budget {
  const nation = ports.nation(subject.nation);
  const income = subject.income * 12;

  let cost = nation.ppp * 0.52 * (1 + (subject.familyTier - 3) * 0.10);
  cost *= 1 + subject.minorChildren * 0.22;
  if (subject.partnerAlive && !subject.secondWorker) cost *= 1.35;
  if (subject.oripathyTreated) {
    cost += nation.ppp * (subject.oripathyProvider === 'rhodes' ? 2.2 : 1.0);
  }
  cost += subject.conditions * nation.ppp * 0.28;

  const net = income - Math.max(0, cost - subsistence);
  let money = subject.money + net;
  let debt = subject.debt;

  if (money < 0) {
    debt += -money * 0.06;
    money = 0;
  }
  if (money > 0 && debt > 0) {
    const pay = Math.min(money * 0.4, debt);
    debt -= pay;
    money -= pay;
  }
  return {income, cost, support: subsistence, net, money, debt};
}
