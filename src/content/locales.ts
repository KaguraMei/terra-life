/**
 * Regional content: currency, price basis and the two UI dictionaries.
 *
 * This is data, not logic — it sits next to the other registries so it can be
 * validated and (later) translated without touching the model. The rule the
 * original file documents still holds: the region only changes how numbers are
 * *shown*, never how the world behaves (no lifespan, mortality or oripathy value
 * depends on it).
 */

export type LanguageCode = 'zh' | 'en' | 'ja' | 'ko';

export interface Locale {
  readonly id: string;
  readonly lang: LanguageCode;
  readonly name: string;
  readonly nameEn: string;
  readonly cur: string;
  readonly curCode: string;
  readonly unit: string;
  readonly unitEn: string;
  /** Local price level relative to the international baseline (display only). */
  readonly priceK: number;
  readonly priceNote: string;
  readonly priceNoteEn: string;
  readonly tz: readonly string[];
}

export interface LanguageTable {
  readonly [key: string]: string | undefined;
}

export const LOCALES: Record<string, Locale> = {
  CN: {
    id: 'CN', lang: 'zh', name: '中国', nameEn: 'China',
    cur: '¥', curCode: 'CNY', unit: '元', unitEn: 'yuan',
    priceK: 1.00, priceNote: '以中国物价计', priceNoteEn: 'in China prices',
    tz: ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Chungking']
  },
  US: {
    id: 'US', lang: 'en', name: '美国', nameEn: 'United States',
    cur: '$', curCode: 'USD', unit: '美元', unitEn: 'USD',
    priceK: 3.20, priceNote: '以美国物价计', priceNoteEn: 'in US prices',
    tz: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
      'America/Phoenix', 'America/Anchorage', 'Pacific/Honolulu']
  },
  JP: {
    id: 'JP', lang: 'ja', name: '日本', nameEn: 'Japan',
    cur: '¥', curCode: 'JPY', unit: '日元', unitEn: 'yen',
    priceK: 0.95, priceNote: '以日本物价计', priceNoteEn: 'in Japanese prices',
    tz: ['Asia/Tokyo']
  },
  KR: {
    id: 'KR', lang: 'ko', name: '韩国', nameEn: 'South Korea',
    cur: '₩', curCode: 'KRW', unit: '韩元', unitEn: 'won',
    priceK: 0.88, priceNote: '以韩国物价计', priceNoteEn: 'in Korean prices',
    tz: ['Asia/Seoul']
  },
  EU: {
    id: 'EU', lang: 'en', name: '欧洲', nameEn: 'Europe',
    cur: '€', curCode: 'EUR', unit: '欧元', unitEn: 'EUR',
    priceK: 1.35, priceNote: '以欧元区物价计', priceNoteEn: 'in eurozone prices',
    tz: ['Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
      'Europe/Rome', 'Europe/Amsterdam', 'Europe/Warsaw', 'Europe/Moscow']
  }
};

// No Taiwan entry on purpose: the project does not hard-code any Chinese-speaking
// region as a fixed dimension. Traditional-Chinese users fall back to CN and can
// switch in the settings panel.
export const LOCALE_LIST: readonly string[] = ['CN', 'US', 'JP', 'KR', 'EU'];

/** UI strings. `ja` / `ko` are declared but untranslated, so they fall back to zh. */
export const LANG: Record<LanguageCode, LanguageTable | null> = {
  zh: {
    brand: '泰拉人生', brandEn: 'TERRA LIFE',
    yearWord: '年', ageWord: '岁', oneYear: '1 年 ≈ {n} 秒',
    pause: '暂停', resume: '继续', nextChoice: '快转到下一个抉择 »',
    auto: '自动选择', music: '音乐', write: '写下想法', settings: '设置',
    feedback: '提供意见', close: '关闭', home: '返回首页', menu: '菜单',
    identity: '身份记录', status: '状态', statRange: '0-100',
    health: '健康', happy: '幸福', knowledge: '知识', social: '人际关系',
    arts: '技艺', netWorth: '净资产', income: '年收入', livingWithParents: '还住在父母家',
    familyTier: '家境分位', yes: '是', no: '否',
    sex: '性别', born: '出生', residence: '居住地', nation: '国家', stratum: '出身阶层',
    race: '种族', edu: '学历', stage: '人生阶段', male: '男', female: '女',
    infected: '感染者', crystalRate: '结晶率', job: '职业',
    thisYear: '今年的重心', lifeLog: '人生记录', newestFirst: '最新的在前',
    scene: '此刻', focusHint: '一年只能认真做一件事。年末按你花的时间结算。',
    familyAndLife: '家人与生活', mother: '母亲', father: '父亲',
    siblings: '兄弟姐妹', partner: '伴侣', children: '子女', deceased: '已故',
    bornSameSecond: '在同一秒出生的人们', aliveOf: '还活着 {a} / {b}',
    lifeMap: '人生地图', lifeMapHint: '一格一年 · 越深越幸福 · 外框为预期寿命',
    survivalCurve: '存活曲线', survivalHint: '同一批出生的人还剩多少',
    reportTitle: '人生报告', livedTo: '享年', causeOfDeath: '死因',
    vsNational: '与国民平均相比', yearsMore: '{n} 年', yearsLess: '{n} 年',
    again: '再随机一次', sameSeed: '同种子再来', backToStart: '回到开局设置',
    resumeLife: '继续上次人生', resumeHint: '从上次年度结算处接着走',
    startTitle: '泰拉人生模拟', startBtn: '开 始 出 生',
    dead: '已故', unknown: '未知'
  },
  en: {
    brand: 'TERRA LIFE', brandEn: 'TERRA LIFE',
    yearWord: '', ageWord: '', oneYear: '1 year ≈ {n}s',
    pause: 'Pause', resume: 'Resume', nextChoice: 'Skip to next choice »',
    auto: 'Auto', music: 'Music', write: 'Write', settings: 'Settings',
    feedback: 'Feedback', close: 'Close', home: 'Home', menu: 'Menu',
    identity: 'Identity Record', status: 'Status', statRange: '0-100',
    health: 'Health', happy: 'Happiness', knowledge: 'Knowledge', social: 'Relationships',
    arts: 'Arts', netWorth: 'Net worth', income: 'Annual income', livingWithParents: 'Living with parents',
    familyTier: 'Family wealth tier', yes: 'Yes', no: 'No',
    sex: 'Sex', born: 'Born', residence: 'Residence', nation: 'Nation', stratum: 'Stratum',
    race: 'Race', edu: 'Education', stage: 'Stage', male: 'Male', female: 'Female',
    infected: 'Infected', crystalRate: 'Crystallization', job: 'Occupation',
    thisYear: 'This year\u2019s focus', lifeLog: 'Life log', newestFirst: 'newest first',
    scene: 'Now', focusHint: 'You can only truly commit to one thing a year.',
    familyAndLife: 'Family & Life', mother: 'Mother', father: 'Father',
    siblings: 'Siblings', partner: 'Partner', children: 'Children', deceased: 'deceased',
    bornSameSecond: 'Born in the same second', aliveOf: '{a} of {b} still alive',
    lifeMap: 'Life map', lifeMapHint: 'one cell per year · darker = happier · border = life expectancy',
    survivalCurve: 'Survival curve', survivalHint: 'how many of the cohort remain',
    reportTitle: 'Life Report', livedTo: 'Lived to', causeOfDeath: 'Cause of death',
    vsNational: 'vs. national average', yearsMore: '{n} yr', yearsLess: '{n} yr',
    again: 'Random again', sameSeed: 'Same seed', backToStart: 'Back to setup',
    resumeLife: 'Continue last life', resumeHint: 'Resume from the last settled year',
    startTitle: 'Terra Life Simulator', startBtn: 'B E G I N',
    dead: 'Deceased', unknown: 'Unknown'
  },
  ja: null,
  ko: null
};
