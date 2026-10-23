/**
 * Cause-of-death content: the vocabulary and the residual split.
 *
 * `ocd` ("unclassified") is a legacy bucket that used to make each age band sum to
 * 100. It is still accepted when reading old saves, but new lives never draw it:
 * the weights are expanded into concrete causes before the draw.
 */

export interface CauseEntry {
  readonly name: string;
  readonly short: string;
}

export const CAUSES: Record<string, CauseEntry> = {
  neo: {name: '新生儿疾病', short: '新生儿'},
  con: {name: '先天疾病', short: '先天'},
  inf: {name: '感染性疾病', short: '感染'},
  lri: {name: '下呼吸道感染', short: '肺炎'},
  diar: {name: '腹泻与脱水', short: '腹泻'},
  nut: {name: '营养不良', short: '营养'},
  tb: {name: '结核病', short: '结核'},
  mal: {name: '寄生虫与热病', short: '寄生虫'},
  hiv: {name: '免疫缺陷综合征', short: '免疫'},
  oinf: {name: '机会性感染', short: '机会感染'},
  can: {name: '恶性肿瘤', short: '肿瘤'},
  ihd: {name: '心血管疾病', short: '心血管'},
  str: {name: '脑血管疾病', short: '脑卒中'},
  dia: {name: '代谢疾病', short: '代谢'},
  copd: {name: '慢性肺病', short: '肺病'},
  kid: {name: '肾脏疾病', short: '肾病'},
  cir: {name: '肝病', short: '肝病'},
  dem: {name: '衰老与失能', short: '衰老'},
  road: {name: '交通事故', short: '车祸'},
  drown: {name: '溺水', short: '溺水'},
  fall: {name: '坠落', short: '坠落'},
  fire: {name: '火灾与烧伤', short: '火灾'},
  inj: {name: '意外伤害', short: '意外'},
  hom: {name: '凶杀', short: '凶杀'},
  war: {name: '战争', short: '战争'},
  cold: {name: '失温与冻伤', short: '失温'},
  heat: {name: '热射病', short: '中暑'},
  sea: {name: '海嗣侵袭', short: '海嗣'},
  cat: {name: '天灾', short: '天灾'},
  ori: {name: '矿石病', short: '矿石病'},
  art: {name: '源石技艺反噬', short: '技艺反噬'},
  alc: {name: '酒精相关疾病', short: '酒精'},
  /* 阶层特异的死因 */
  slave: {name: '矿坑苦役', short: '苦役'},
  exec: {name: '纠察队处决', short: '处决'},
  starv: {name: '饥荒', short: '饥荒'},
  beast: {name: '野兽与荒原盗匪', short: '荒原'},
  /* Legacy "everything else" bucket; never drawn by new lives. */
  ocd: {name: '未分类疾病', short: '未分类'}
};

/** Age bands used by the cause tables: infant, child, teen, adult, late, old. */
export const BANDS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 5], [5, 15], [15, 50], [50, 70], [70, 2000]
];
/** How the residual bucket is split per band before the draw. */
export const RESIDUAL_CAUSE_BASE: ReadonlyArray<Record<string, number>> = [
  {neo: 42, con: 24, inf: 12, lri: 10, nut: 7, diar: 5},
  {inf: 28, lri: 20, diar: 16, nut: 12, con: 12, inj: 12},
  {inj: 28, inf: 20, con: 14, can: 12, lri: 10, mal: 8, nut: 8},
  {can: 24, ihd: 18, inf: 14, inj: 14, copd: 10, cir: 7, dia: 6, kid: 4, str: 3},
  {ihd: 28, can: 22, str: 16, copd: 10, cir: 8, kid: 7, dia: 5, dem: 4},
  {ihd: 30, str: 23, dem: 20, can: 12, copd: 8, kid: 4, cir: 3}
];

/** Nations whose coasts have 海嗣; elsewhere the sea cause is dropped. */
export const SEA_NATIONS: readonly string[] = ['IBE', 'AEG', 'SST', 'HIG', 'LMN'];
/** Cold-adapted nations; others lose the cold cause entirely. */
export const COLD_NATIONS: readonly string[] = ['URS', 'SAMI', 'KJR'];
/** Heat-exposed nations; others lose the heat cause entirely. */
export const HEAT_NATIONS: readonly string[] = ['SRG', 'BLV', 'MIN'];
/** Island nations with under-diagnosed heart disease. */
export const ISLAND_NATIONS: readonly string[] = ['LAT', 'AEG', 'DUR'];