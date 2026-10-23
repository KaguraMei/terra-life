/**
 * Oripathy content: stages, exposure tables and the two national special cases.
 *
 * The numbers come from 《大地巡旅》's framing — oripathy is an occupational,
 * disaster and poverty disease — and are stated as **lifetime** risks, not annual
 * ones. The model converts them once; keeping them here means a balance change is
 * a data edit rather than a code edit.
 */

export interface OripathyStage {
  readonly id: number;
  readonly name: string;
  readonly en: string;
  readonly short: string;
  readonly desc: string;
}

export const ORI_STAGES: readonly OripathyStage[] = [
  {id: 0, name: '未感染', en: 'Uninfected', short: '—', desc: '体内未检出源石结晶。'},
  {id: 1, name: 'Ⅰ期', en: 'Stage I', short: 'Ⅰ期', desc: '体表出现零星结晶，体检可检出。日常活动不受限。'},
  {id: 2, name: 'Ⅱ期', en: 'Stage II', short: 'Ⅱ期', desc: '结晶扩散至肢体与内脏周边，间歇性剧痛，体力明显下降。'},
  {id: 3, name: 'Ⅲ期', en: 'Stage III', short: 'Ⅲ期', desc: '结晶侵入主要脏器，器官功能持续衰竭，预期生存以年计。'}
];

/** Crystal-rate gates: stage I from >0, II from 25, III from 60. */
export const STAGE_GATE = [0, 25, 60, 100] as const;

/**
 * Jobs whose exposure overrides the stratum band entirely — "occupational disease"
 * in the literal sense: a miner is at 50–70% wherever they live.
 */
export const JOB_LIFETIME_RISK: Readonly<Record<string, readonly [number, number]>> = {
  oriminer: [0.58, 0.70],
  refiner: [0.50, 0.64],
  miner: [0.34, 0.48],
  stormcaller: [0.45, 0.60],
  alchemist: [0.40, 0.55],
  caster: [0.35, 0.50],
  artsmith: [0.32, 0.45],
  op_caster: [0.38, 0.52],
  oridoc: [0.30, 0.45],
  op_supporter: [0.30, 0.44],
  witch: [0.28, 0.40],
  mercenary: [0.18, 0.30],
  op_specialist: [0.17, 0.28],
  op_guard: [0.16, 0.26],
  op_vanguard: [0.15, 0.25],
  soldier: [0.14, 0.24],
  factory: [0.10, 0.18],
  construct: [0.10, 0.18],
  smith: [0.08, 0.14]
};

/** Nations that override everything with a fixed lifetime band. */
export const NATION_LIFETIME_RISK: Readonly<Record<string, readonly [number, number]>> = {
  KDZ: [0.60, 0.80],   // Kazdel: generations of war poisoned the land
  LAT: [0.002, 0.010], // Laterano: legal screening
  KJR: [0.003, 0.010], // Kjerag: closed, little crystal industry
  AEG: [0.001, 0.006], // Aegir: barely uses originium technology
  DUR: [0.003, 0.012]
};

/** Exposure starts here; before it the annual risk is halved. */
export const EXPOSE_FROM = 6;
