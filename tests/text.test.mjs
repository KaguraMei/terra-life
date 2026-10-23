import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ageWord, barText, educationName, formatMoney, formatNumber, formatPercent,
  joinTemplate, missingEntries, statWord, template
} from '../dist-runtime/simulation.mjs';

test('the template tag interpolates, and a dictionary replaces whole templates', () => {
  const strings = ['你出生在 ', ' 的 ', '。'];
  assert.equal(joinTemplate(strings, ['沃伦', '街区']), '你出生在 沃伦 的 街区。');
  assert.equal(template(strings, ['沃伦', '街区'], null), '你出生在 沃伦 的 街区。');

  const key = strings.join('\u0001');
  const dictionary = {[key]: 'You were born in {@city}, {@district}.'};
  assert.equal(template(strings, ['Voron', 'block'], dictionary),
    'You were born in Voron, block.');
  // Missing keys are remembered once, in first-seen order.
  const before = missingEntries().length;
  template(['untranslated ', ' tail'], ['x'], dictionary);
  template(['untranslated ', ' tail'], ['x'], dictionary);
  assert.equal(missingEntries().length, before + 1);
});

test('number and money formatting keep the documented shapes', () => {
  assert.equal(formatNumber(1234.56), '1,234.6');
  assert.equal(formatNumber(1234.56, 2), '1,234.56');
  assert.equal(formatNumber(null), '—');
  assert.equal(formatNumber(Number.NaN), '—');

  assert.equal(formatPercent(0.165, 1), '16.5%');
  assert.equal(formatPercent(0, 2), '0.00%');

  // 1 internal unit = 1000 coins; below 10 units shows the raw amount.
  assert.equal(formatMoney(1.5), '1,500');
  assert.equal(formatMoney(-1.5), '-1,500');
  assert.equal(formatMoney(20), '2.0 万');
  assert.equal(formatMoney(200000), '2.00 亿');
  assert.equal(formatMoney(null), '—');
});

test('label tables clamp and bucket as the UI expects', () => {
  assert.equal(educationName(0), '未就学');
  assert.equal(educationName(3), '高等');
  assert.equal(educationName(9), '研究院', 'out-of-range clamps to the top');
  assert.equal(educationName(-2), '未就学');
  assert.equal(educationName(3, 'en'), 'High school');

  assert.equal(statWord('hl', 10), '油尽灯枯');
  assert.equal(statWord('hl', 60), '硬朗');
  assert.equal(statWord('so', 100), '众望所归');
  assert.equal(statWord('so', 100, 'en'), 'Widely loved');
  assert.equal(statWord('nope', 50), '—');

  assert.equal(barText(50, 10), '█████░░░░░');
  assert.equal(barText(0, 4), '░░░░');
  assert.equal(barText(100, 4), '████');
  assert.equal(barText(150, 10), '██████████', 'over-range clamps');

  assert.equal(ageWord(0), '婴儿');
  assert.equal(ageWord(2), '幼儿');
  assert.equal(ageWord(12), '少年');
  assert.equal(ageWord(29), '青年');
  assert.equal(ageWord(44), '壮年');
  assert.equal(ageWord(74), '老年');
  assert.equal(ageWord(90), '高龄');
});
