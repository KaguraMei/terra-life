import assert from 'node:assert/strict';
import test from 'node:test';
import {LOCALES, LANG, detectLocaleId, moneyText, nameOf, pickString, priceNoteText, shortOf} from '../dist-runtime/simulation.mjs';

const detect = input => detectLocaleId({locales: LOCALES, ...input});

test('region detection prefers timezone, then language, then falls back to US', () => {
  assert.equal(detect({timeZone: 'Asia/Tokyo', languages: ['en-US']}), 'JP',
    'the timezone wins over the browser language');
  assert.equal(detect({timeZone: 'America/Chicago'}), 'US');
  assert.equal(detect({timeZone: 'Europe/Berlin', languages: ['en']}), 'EU');
  assert.equal(detect({timeZone: 'Mars/Olympus', languages: ['zh-CN']}), 'CN');
  assert.equal(detect({timeZone: '', languages: ['ja-JP']}), 'JP');
  assert.equal(detect({timeZone: '', languages: ['ko-KR']}), 'KR');
  assert.equal(detect({timeZone: '', languages: ['en-GB']}), 'US');
  assert.equal(detect({timeZone: '', languages: ['fr-FR', 'zh-TW']}), 'CN',
    'an unsupported primary language still prefers a Chinese fallback over US');
  assert.equal(detect({timeZone: '', languages: ['fr-FR']}), 'US');
  assert.equal(detect({timeZone: null, languages: null}), 'US');
});

test('UI strings fall back to Chinese, then to the key', () => {
  assert.equal(pickString('pause', undefined, LANG.zh, LANG.zh), '暂停');
  assert.equal(pickString('pause', undefined, LANG.en, LANG.zh), 'Pause');
  assert.equal(pickString('oneYear', {n: 53}, LANG.zh, LANG.zh), '1 年 ≈ 53 秒');
  assert.equal(pickString('oneYear', {n: 53}, LANG.en, LANG.zh), '1 year ≈ 53s');
  assert.equal(pickString('missingKey', undefined, LANG.en, LANG.zh), 'missingKey');
  assert.equal(pickString('oneYear', {}, LANG.zh, LANG.zh), '1 年 ≈ {n} 秒',
    'an absent variable keeps the placeholder');
  // ja / ko are declared but untranslated, so the adapter falls back to zh.
  assert.equal(pickString('pause', undefined, LANG.ja, LANG.zh), '暂停');
});

test('world names switch language only when a translation exists', () => {
  const nation = {name: '炎国', en: 'Yan'};
  assert.equal(nameOf(nation, 'zh'), '炎国');
  assert.equal(nameOf(nation, 'en'), 'Yan');
  assert.equal(nameOf({name: '无名'}, 'en'), '无名', 'no translation keeps the Chinese name');
  assert.equal(nameOf(null, 'en'), '');
  assert.equal(shortOf({short: '核心区', enShort: 'Core'}, 'en'), 'Core');
  assert.equal(shortOf({short: '核心区'}, 'en'), '核心区');
});

test('money text keeps the documented thresholds and symbols', () => {
  const cn = LOCALES.CN;
  // Thresholds apply to the *local* amount (internal units × priceK), not to the
  // internal unit itself; 万/亿 switch at 1e4 / 1e8.
  assert.equal(moneyText(1.5, cn, 'zh'), '¥2');
  assert.equal(moneyText(20, cn, 'zh'), '¥20');
  assert.equal(moneyText(30000, cn, 'zh'), '¥3.0 万');
  assert.equal(moneyText(300000, cn, 'zh'), '¥30 万', 'above 1e5 drops the decimal');
  assert.equal(moneyText(2e8, cn, 'zh'), '¥2.00 亿');
  assert.equal(moneyText(-30000, cn, 'zh'), '-¥3.0 万');

  const us = LOCALES.US;
  // priceK 3.2: 1 internal unit becomes 3.2 local dollars, printed in K.
  assert.equal(moneyText(1000, us, 'en'), '$3.2K');
  assert.equal(moneyText(10000, us, 'en'), '$32K', 'above 1e4 drops the decimal');
  assert.equal(moneyText(1e6, us, 'en'), '$3.20M');
  assert.equal(moneyText(1e9, us, 'en'), '$3.20B');

  assert.equal(priceNoteText(LOCALES.CN, 'zh'), '以中国物价计');
  assert.equal(priceNoteText(LOCALES.CN, 'en'), 'in China prices');
});
