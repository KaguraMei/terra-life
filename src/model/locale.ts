/**
 * Locale logic: string lookup, world-name selection and money formatting.
 *
 * Everything here is pure — the platform inputs (`Intl`, `navigator.languages`,
 * `localStorage`, the `<html lang>` attribute) are read by the adapter that calls
 * these functions. That is what makes "which region am I" testable without a DOM.
 */
import type {LanguageCode, LanguageTable, Locale} from '../content/locales';

export interface DetectInput {
  readonly timeZone?: string | null;
  readonly languages?: readonly string[] | null;
  readonly locales: Readonly<Record<string, Locale>>;
}

/**
 * Guess a region id. Precedence: timezone, then the primary language, then a
 * Chinese-preferring scan, then US. Always returns an id present in `locales`.
 */
export function detectLocaleId(input: DetectInput): string {
  const timeZone = (input.timeZone ?? '').trim();
  if (timeZone) {
    for (const id of Object.keys(input.locales)) {
      if (input.locales[id]?.tz.includes(timeZone)) return id;
    }
  }

  const languages = (input.languages ?? ['']).map(value => String(value ?? ''));
  const first = (languages[0] ?? '').toLowerCase();
  if (first.startsWith('zh')) return 'CN';
  if (first.startsWith('ja')) return 'JP';
  if (first.startsWith('ko')) return 'KR';
  if (first.startsWith('en')) return 'US';

  for (const code of languages) {
    if (code.toLowerCase().startsWith('zh')) return 'CN';
  }
  return 'US';
}

/**
 * One UI string. Falls back to Chinese, then to the key itself, so a missing
 * translation never throws mid-render.
 */
export function pickString(
  key: string,
  vars: Readonly<Record<string, unknown>> | undefined,
  table: LanguageTable | null | undefined,
  fallback: LanguageTable | null | undefined
): string {
  let text = table?.[key] ?? fallback?.[key];
  if (text == null) return key;
  if (vars) {
    text = text.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = vars[name];
      return value != null ? String(value) : match;
    });
  }
  return text;
}

/** World-data proper noun (nation, race, court, stratum). */
export function nameOf(record: {readonly name?: string; readonly en?: string} | null | undefined, lang: LanguageCode): string {
  if (!record) return '';
  if (lang === 'en' && record.en) return record.en;
  return record.name ?? '';
}

export function shortOf(record: {readonly short?: string; readonly enShort?: string} | null | undefined, lang: LanguageCode): string {
  if (!record) return '';
  if (lang === 'en' && record.enShort) return record.enShort;
  return record.short ?? '';
}

/** One-line effect summary used by the yearly focus panel. */
export function descOf(record: {readonly d?: string; readonly enD?: string} | null | undefined, lang: LanguageCode): string {
  if (!record) return '';
  if (lang === 'en' && record.enD) return record.enD;
  return record.d ?? '';
}

/** Convert an internal amount into the local price level (display only). */
export function toLocalMoney(value: number, locale: Locale): number {
  return value * locale.priceK;
}

/**
 * Money with the region's symbol, switching to 万/亿 (zh) or K/M/B (en) by
 * magnitude. The thresholds and the decimal places are part of what players see,
 * so they are pinned by tests.
 */
export function moneyText(value: number, locale: Locale, lang: LanguageCode): string {
  const local = toLocalMoney(value, locale);
  const negative = local < 0;
  const abs = Math.abs(local);
  let body: string;
  if (lang === 'zh') {
    if (abs >= 1e8) body = `${(abs / 1e8).toFixed(2)} 亿`;
    else if (abs >= 1e4) body = `${(abs / 1e4).toFixed(abs >= 1e5 ? 0 : 1)} 万`;
    else body = String(Math.round(abs));
  } else {
    if (abs >= 1e9) body = `${(abs / 1e9).toFixed(2)}B`;
    else if (abs >= 1e6) body = `${(abs / 1e6).toFixed(2)}M`;
    else if (abs >= 1e3) body = `${(abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}K`;
    else body = String(Math.round(abs));
  }
  return `${negative ? '-' : ''}${locale.cur}${body}`;
}

/** The "priced in …" note the report prints. */
export function priceNoteText(locale: Locale, lang: LanguageCode): string {
  return lang === 'zh' ? locale.priceNote : locale.priceNoteEn;
}
