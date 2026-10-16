/* ==========================================================================
 * TERRA LIFE SIM — 文本层
 * 对应原作的 L / L0 / lJoin 标签模板系统。
 *
 * 原作把每一句叙事文本写成 tagged template：
 *      log(L`你出生在 ${country} 的 ${city}。`)
 * 好处是：① 插值天然安全 ② 可以整体替换词条实现多语言
 * 本作保留同样的写法，TL.L`...` 直接返回拼接好的字符串；
 * 若注册了词条表则优先取词条（为将来做多语言留口子）。
 * ========================================================================== */
(function (TL) {
  'use strict';

  /** 词条表：key = 模板原文（用 \u0001 连接各静态段），value = 替换文本 */
  TL.I18N = null;

  function join(strings, vals) {
    let s = strings[0];
    for (let i = 0; i < vals.length; i++) s += String(vals[i]) + strings[i + 1];
    return s;
  }

  const _cache = new WeakMap();
  const _miss = [];

  /**
   * 标签模板：TL.L`文本 ${插值} 文本`
   * 若 TL.I18N 命中该模板，则用词条替换（支持 {@name} 形式的具名插值）。
   */
  TL.L = function (strings) {
    const vals = Array.prototype.slice.call(arguments, 1);
    if (!TL.I18N) return join(strings, vals);
    let t = _cache.get(strings);
    if (t === undefined) {
      const k = strings.join('\u0001');
      t = Object.prototype.hasOwnProperty.call(TL.I18N, k) ? TL.I18N[k] : null;
      if (t === null && _miss.indexOf(k) < 0) _miss.push(k);
      _cache.set(strings, t);
    }
    if (t === null || t === undefined) return join(strings, vals);
    if (t.indexOf('{@') >= 0) {
      // 具名插值回退：按顺序填
      let i = 0;
      t = t.replace(/\{@\w+\}/g, function () { return String(vals[i++]); });
    }
    return t;
  };

  /** 缺少的词条（开发期自检用） */
  TL.Lmissing = function () { return _miss.slice(); };

  /* ---------------------------------------------------------------------- */
  /* 数字与文案格式                                                          */
  /* ---------------------------------------------------------------------- */
  TL.fmt = {};

  /** 数字千分位 */
  TL.fmt.num = function (v, d) {
    if (v == null || !isFinite(v)) return '—';
    const x = Number(v).toFixed(d == null ? 1 : d);
    const p = x.split('.');
    p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return p.join('.');
  };

  /** 百分比 */
  TL.fmt.pct = function (v, d) { return (v * 100).toFixed(d == null ? 1 : d) + '%'; };

  /** 钱：以铸币为单位。1 个内部单位 = 1000 铸币。 */
  const MONEY_UNIT = 1000;
  TL.fmt.money = function (v) {
    if (v == null || !isFinite(v)) return '—';
    const a0 = Math.abs(v);
    const sign = v < 0 ? '-' : '';
    // 小额时显示到千位，大额时换算成万 / 亿
    if (a0 < 10) return sign + Math.round(a0 * MONEY_UNIT).toLocaleString('en-US');
    const a = a0 * MONEY_UNIT;
    if (a >= 1e8) return sign + (a / 1e8).toFixed(2) + ' 亿';
    if (a >= 1e4) return sign + (a / 1e4).toFixed(1) + ' 万';
    return sign + Math.round(a).toLocaleString('en-US');
  };

  /** 学历名（0..5） */
  TL.EDU_NAME = ['未就学', '初等', '中等', '高等', '大学', '研究院'];
  TL.EDU_NAME_EN = ['None', 'Primary', 'Middle', 'High school', 'University', 'Graduate'];
  TL.eduName = function (lv) {
    const i = TL.clamp(lv | 0, 0, 5);
    return (TL.lang === 'en' ? TL.EDU_NAME_EN : TL.EDU_NAME)[i];
  };

  /** 四维名称 */
  TL.STAT_DEF = {
    hl: { name: '体质', icon: '◆', desc: '身体状态。低于同龄基准会显著抬高死亡风险。' },
    h:  { name: '心境', icon: '✦', desc: '精神与快乐。影响你做的每一个决定的质量。' },
    sm: { name: '学识', icon: '❖', desc: '知识与技能。决定你能拿到什么工作、走向哪个阶层。' },
    so: { name: '羁绊', icon: '❈', desc: '与他人的联结。孤独本身就是一种死因。' }
  };

  /** 四维的定性描述 */
  const STAT_WORD = {
    hl: [[20, '油尽灯枯'], [38, '病弱'], [52, '尚可'], [68, '硬朗'], [85, '壮健'], [101, '铁打一般']],
    h:  [[20, '心如死灰'], [38, '消沉'], [52, '平淡'], [68, '安稳'], [85, '舒展'], [101, '由衷快活']],
    sm: [[20, '目不识丁'], [38, '粗通文墨'], [52, '略有所知'], [68, '学有所长'], [85, '博学'], [101, '通才']],
    so: [[20, '孤身一人'], [38, '往来稀疏'], [52, '泛泛之交'], [68, '亲友在侧'], [85, '交游广阔'], [101, '众望所归']]
  };
  const STAT_WORD_EN = {
    hl: [[20, 'Failing'], [38, 'Frail'], [52, 'Fair'], [68, 'Hardy'], [85, 'Robust'], [101, 'Ironclad']],
    h:  [[20, 'Despairing'], [38, 'Low'], [52, 'Even'], [68, 'Settled'], [85, 'Buoyant'], [101, 'Elated']],
    sm: [[20, 'Illiterate'], [38, 'Barely literate'], [52, 'Some schooling'], [68, 'Well read'], [85, 'Erudite'], [101, 'Polymath']],
    so: [[20, 'Utterly alone'], [38, 'Few ties'], [52, 'Casual ties'], [68, 'Close kin'], [85, 'Wide circle'], [101, 'Widely loved']]
  };
  TL.statWord = function (k, v) {
    const w = (TL.lang === 'en' ? STAT_WORD_EN : STAT_WORD)[k] || [];
    for (const [t, s] of w) if (v < t) return s;
    return '—';
  };

  /** 用渐变条渲染一个 0-100 的值（终端/文本场景用） */
  TL.bar = function (v, width) {
    width = width || 10;
    const n = Math.round(TL.clamp(v, 0, 100) / 100 * width);
    return '█'.repeat(n) + '░'.repeat(width - n);
  };

  /** 年龄 → 人生阶段词 */
  TL.ageWord = function (a) {
    if (a < 1) return '婴儿';
    if (a < 3) return '幼儿';
    if (a < 6) return '学龄前';
    if (a < 13) return '少年';
    if (a < 18) return '青少年';
    if (a < 30) return '青年';
    if (a < 45) return '壮年';
    if (a < 60) return '中年';
    if (a < 75) return '老年';
    return '高龄';
  };

})(window.TL = window.TL || {});
