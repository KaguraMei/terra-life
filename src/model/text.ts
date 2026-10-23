/**
 * Text layer: template tags, number formatting and the small label tables.
 *
 * The original keeps a `L` tagged template so narrative text can be swapped by a
 * dictionary later: `L`你出生在 ${country}``. Everything here is pure — the
 * dictionary and the language arrive as arguments — so it can be tested without a
 * runtime, and the legacy script that used to own it is gone.
 */

export type Language = 'zh' | 'en';

/** A dictionary maps the template's static parts (joined by U+0001) to text. */
export type Dictionary = Readonly<Record<string, string>>;

/**
 * Translation cache. Keyed by dictionary identity first so two runtimes in one
 * realm never see each other's translations, then by the template's string array
 * (stable per call site, which is what makes this a cache at all).
 */
const caches = new WeakMap<object, WeakMap<readonly string[], string | null>>();
let cacheless: WeakMap<readonly string[], string | null> | null = null;
const misses: string[] = [];

const cacheFor = (dictionary: Dictionary | null): WeakMap<readonly string[], string | null> => {
  if (dictionary === null) {
    cacheless ??= new WeakMap();
    return cacheless;
  }
  let cache = caches.get(dictionary);
  if (!cache) {
    cache = new WeakMap();
    caches.set(dictionary, cache);
  }
  return cache;
};

/** Join the template's static parts with the interpolated values. */
export function joinTemplate(strings: readonly string[], values: readonly unknown[]): string {
  let text = strings[0] ?? '';
  for (let i = 0; i < values.length; i++) text += String(values[i]) + (strings[i + 1] ?? '');
  return text;
}

/**
 * Resolve one tagged template against a dictionary.
 *
 * A dictionary hit replaces the whole template; `{@name}` placeholders are filled
 * from the values in order. Unresolved keys are remembered for `missingEntries()`.
 */
export function template(
  strings: readonly string[],
  values: readonly unknown[],
  dictionary: Dictionary | null = null
): string {
  if (!dictionary) return joinTemplate(strings, values);

  const cache = cacheFor(dictionary);
  let translated = cache.get(strings);
  if (translated === undefined) {
    const key = strings.join('\u0001');
    translated = Object.prototype.hasOwnProperty.call(dictionary, key) ? dictionary[key]! : null;
    if (translated === null && misses.indexOf(key) < 0) misses.push(key);
    cache.set(strings, translated);
  }
  if (translated === null) return joinTemplate(strings, values);
  if (translated.indexOf('{@') >= 0) {
    let index = 0;
    return translated.replace(/\{@\w+\}/g, () => String(values[index++]));
  }
  return translated;
}

/** Keys requested but missing from the dictionary, in first-seen order. */
export function missingEntries(): string[] {
  return misses.slice();
}

/* --- number and money formatting ---------------------------------------- */

/** Thousands separator with a fixed number of decimals. */
export function formatNumber(value: unknown, decimals = 1): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const fixed = Number(value).toFixed(decimals);
  const parts = fixed.split('.');
  parts[0] = (parts[0] as string).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/** `0.165` → `16.5%`. */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

/** One internal money unit is 1000 coins; large amounts use 万 / 亿. */
export const MONEY_UNIT = 1000;

export function formatMoney(value: unknown): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  const amount = Number(value);
  const abs = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  if (abs < 10) return sign + Math.round(abs * MONEY_UNIT).toLocaleString('en-US');
  const coins = abs * MONEY_UNIT;
  if (coins >= 1e8) return `${sign}${(coins / 1e8).toFixed(2)} 亿`;
  if (coins >= 1e4) return `${sign}${(coins / 1e4).toFixed(1)} 万`;
  return sign + Math.round(coins).toLocaleString('en-US');
}

/* --- label tables ------------------------------------------------------- */

export const EDU_NAME = ['未就学', '初等', '中等', '高等', '大学', '研究院'] as const;
export const EDU_NAME_EN = ['None', 'Primary', 'Middle', 'High school', 'University', 'Graduate'] as const;

export function educationName(level: number, language: Language = 'zh'): string {
  const index = Math.min(5, Math.max(0, Math.trunc(level) || 0));
  return (language === 'en' ? EDU_NAME_EN : EDU_NAME)[index] as string;
}

export const STAT_DEF = {
  hl: {name: '体质', icon: '◆', desc: '身体状态。低于同龄基准会显著抬高死亡风险。'},
  h: {name: '心境', icon: '✦', desc: '精神与快乐。影响你做的每一个决定的质量。'},
  sm: {name: '学识', icon: '❖', desc: '知识与技能。决定你能拿到什么工作、走向哪个阶层。'},
  so: {name: '羁绊', icon: '❈', desc: '与他人的联结。孤独本身就是一种死因。'}
} as const;

type StatKey = keyof typeof STAT_DEF;

const STAT_WORD: Record<StatKey, ReadonlyArray<readonly [number, string]>> = {
  hl: [[20, '油尽灯枯'], [38, '病弱'], [52, '尚可'], [68, '硬朗'], [85, '壮健'], [101, '铁打一般']],
  h: [[20, '心如死灰'], [38, '消沉'], [52, '平淡'], [68, '安稳'], [85, '舒展'], [101, '由衷快活']],
  sm: [[20, '目不识丁'], [38, '粗通文墨'], [52, '略有所知'], [68, '学有所长'], [85, '博学'], [101, '通才']],
  so: [[20, '孤身一人'], [38, '往来稀疏'], [52, '泛泛之交'], [68, '亲友在侧'], [85, '交游广阔'], [101, '众望所归']]
};

const STAT_WORD_EN: Record<StatKey, ReadonlyArray<readonly [number, string]>> = {
  hl: [[20, 'Failing'], [38, 'Frail'], [52, 'Fair'], [68, 'Hardy'], [85, 'Robust'], [101, 'Ironclad']],
  h: [[20, 'Despairing'], [38, 'Low'], [52, 'Even'], [68, 'Settled'], [85, 'Buoyant'], [101, 'Elated']],
  sm: [[20, 'Illiterate'], [38, 'Barely literate'], [52, 'Some schooling'], [68, 'Well read'], [85, 'Erudite'], [101, 'Polymath']],
  so: [[20, 'Utterly alone'], [38, 'Few ties'], [52, 'Casual ties'], [68, 'Close kin'], [85, 'Wide circle'], [101, 'Widely loved']]
};

/** Qualitative description of a 0..100 attribute. */
export function statWord(key: string, value: number, language: Language = 'zh'): string {
  const words = (language === 'en' ? STAT_WORD_EN : STAT_WORD)[key as StatKey];
  if (!words) return '—';
  for (const [threshold, word] of words) if (value < threshold) return word;
  return '—';
}

/** A 0..100 value as a gradient bar (text surfaces only). */
export function barText(value: number, width = 10): string {
  const clamped = value < 0 ? 0 : value > 100 ? 100 : value;
  const filled = Math.round((clamped / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

/** Age → life stage word. */
export function ageWord(age: number): string {
  if (age < 1) return '婴儿';
  if (age < 3) return '幼儿';
  if (age < 6) return '学龄前';
  if (age < 13) return '少年';
  if (age < 18) return '青少年';
  if (age < 30) return '青年';
  if (age < 45) return '壮年';
  if (age < 60) return '中年';
  if (age < 75) return '老年';
  return '高龄';
}
