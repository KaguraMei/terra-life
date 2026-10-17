/* ==========================================================================
 * TERRA LIFE SIM — 地区 / 语言 / 货币维度
 * --------------------------------------------------------------------------
 * 【为什么有这个文件】
 * 原作（80億分之1）是台湾团队做的，整个界面是繁体中文，净资产一律
 * 「以台灣物價計」。本作不再把任何一个地区写成固定维度，而是：
 *
 *   1. 读取浏览器实际地区（navigator.languages + Intl 时区）判定 region；
 *   2. 默认回落到「中国」或「美国」——语言以 zh 开头 → 中国，其余 → 美国；
 *   3. 允许 URL 参数 ?region=CN|US|... 或设置面板手动覆盖，覆盖写入
 *      localStorage，下次进来自动生效。
 *
 * 【这个维度影响什么】
 *   - 界面语言（中文 / English）
 *   - 货币符号与购买力标签（元 / $ / ¥ / €）
 *   - 物价基准：同一笔泰拉收入在不同地区折算成的「本地体感金额」
 *   - 人生报告里的一句比较口径（"以中国物价计"）
 *
 * 【这个维度不影响什么】
 *   游戏世界的数值模型（寿命、死亡率、矿石病、天灾）一律与地区无关。
 *   地区只是「你怎么看这些数字」的镜头，不是「世界怎么运转」的参数。
 * ========================================================================== */
(function (TL) {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* 地区表                                                                  */
  /* ---------------------------------------------------------------------- */
  /**
   * priceK：本地物价相对「国际基准」的倍数，只用于文案换算的展示，
   *         不参与模拟运算，避免把现实经济混进泰拉模型。
   */
  TL.LOCALES = {
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
  /* 注意：这里没有「台湾」条目 —— 本作不把任何一个华语地区写成固定维度。
     繁体中文用户会落到 CN 的简体界面，可以在设置面板里改成 US 或 EU。 */

  TL.LOCALE_LIST = ['CN', 'US', 'JP', 'KR', 'EU'];

  /* ---------------------------------------------------------------------- */
  /* 语言表                                                                  */
  /* ---------------------------------------------------------------------- */
  TL.LANG = {
    zh: {
      /* 顶栏 */
      brand: '泰拉人生', brandEn: 'TERRA LIFE',
      yearWord: '年', ageWord: '岁', oneYear: '1 年 ≈ {n} 秒',
      pause: '暂停', resume: '继续', nextChoice: '快转到下一个抉择 »',
      auto: '自动快转', music: '音乐', write: '写下想法', settings: '设置',
      feedback: '提供意见', close: '关闭', menu: '菜单',
      /* 左栏 */
      identity: '身份记录', status: '状态', statRange: '0-100',
      health: '健康', happy: '幸福', knowledge: '知识', social: '人际关系',
      arts: '技艺', netWorth: '净资产', income: '年收入', livingWithParents: '还住在父母家',
      familyTier: '家境分位', yes: '是', no: '否',
      sex: '性别', born: '出生', residence: '居住地', nation: '国家', stratum: '出身阶层',
      race: '种族', edu: '学历', stage: '人生阶段', male: '男', female: '女',
      infected: '感染者', crystalRate: '结晶率', job: '职业',
      /* 中栏 */
      thisYear: '今年的重心', lifeLog: '人生记录', newestFirst: '最新的在前',
      scene: '此刻', focusHint: '一年只能认真做一件事。年末按你花的时间结算。',
      /* 右栏 */
      familyAndLife: '家人与生活', mother: '母亲', father: '父亲',
      siblings: '兄弟姐妹', partner: '伴侣', children: '子女', deceased: '已故',
      bornSameSecond: '在同一秒出生的人们', aliveOf: '还活着 {a} / {b}',
      lifeMap: '人生地图', lifeMapHint: '一格一年 · 越深越幸福 · 外框为预期寿命',
      survivalCurve: '存活曲线', survivalHint: '同一批出生的人还剩多少',
      /* 报告 */
      reportTitle: '人生报告', livedTo: '享年', causeOfDeath: '死因',
      vsNational: '与国民平均相比', yearsMore: '{n} 年', yearsLess: '{n} 年',
      again: '再随机一次', sameSeed: '同种子再来', backToStart: '回到开局设置',
      /* 开局 */
      startTitle: '泰拉人生模拟', startBtn: '开 始 出 生',
      /* 其他 */
      dead: '已故', unknown: '未知'
    },
    en: {
      brand: 'TERRA LIFE', brandEn: 'TERRA LIFE',
      yearWord: '', ageWord: '', oneYear: '1 year ≈ {n}s',
      pause: 'Pause', resume: 'Resume', nextChoice: 'Skip to next choice »',
      auto: 'Auto', music: 'Music', write: 'Write', settings: 'Settings',
      feedback: 'Feedback', close: 'Close', menu: 'Menu',
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
      startTitle: 'Terra Life Simulator', startBtn: 'B E G I N',
      dead: 'Deceased', unknown: 'Unknown'
    },
    ja: null,   // 暂未翻译 → 回落 zh
    ko: null
  };

  /* ---------------------------------------------------------------------- */
  /* 判定                                                                    */
  /* ---------------------------------------------------------------------- */
  const LS_KEY = 'terra.region';

  /** 从浏览器环境猜一个地区 id（永远返回表内存在的键） */
  TL.detectLocale = function () {
    let tz = '', langs = [];
    try {
      tz = (Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    } catch (e) { tz = ''; }
    try {
      langs = (navigator.languages && navigator.languages.length)
        ? Array.prototype.slice.call(navigator.languages)
        : [navigator.language || ''];
    } catch (e) { langs = []; }

    // ① 时区最可靠
    if (tz) {
      for (const id in TL.LOCALES) {
        if (TL.LOCALES[id].tz.indexOf(tz) >= 0) return id;
      }
    }
    // ② 语言
    const l0 = (langs[0] || '').toLowerCase();
    if (l0.indexOf('zh') === 0) return 'CN';
    if (l0.indexOf('ja') === 0) return 'JP';
    if (l0.indexOf('ko') === 0) return 'KR';
    if (l0.indexOf('en') === 0) return 'US';
    // ③ 兜底：中文优先，其余美国
    for (let i = 0; i < langs.length; i++) {
      if ((langs[i] || '').toLowerCase().indexOf('zh') === 0) return 'CN';
    }
    return 'US';
  };

  /** 初始化：URL 参数 > localStorage > 浏览器判定 */
  TL.initLocale = function (urlRegion) {
    let id = null;
    if (urlRegion && TL.LOCALES[String(urlRegion).toUpperCase()]) {
      id = String(urlRegion).toUpperCase();
    }
    if (!id) {
      try {
        const saved = localStorage.getItem(LS_KEY);
        if (saved && TL.LOCALES[saved]) id = saved;
      } catch (e) { /* 隐私模式 / file:// 下可能抛 */ }
    }
    if (!id) id = TL.detectLocale();
    return TL.setLocale(id, !!urlRegion);
  };

  /** 切地区；persist=true 时写 localStorage */
  TL.setLocale = function (id, persist) {
    const R = TL.LOCALES[id] || TL.LOCALES.CN;
    TL.locale = R;
    TL.lang = TL.LANG[R.lang] ? R.lang : 'zh';
    TL.T = TL.LANG[TL.lang] || TL.LANG.zh;
    // 让 <html lang> 跟着走，方便字体与断行
    try {
      document.documentElement.lang = TL.lang === 'zh' ? 'zh-CN' : TL.lang;
      document.documentElement.setAttribute('data-region', R.id);
    } catch (e) { /* 无 document（无头测试）时忽略 */ }

    if (persist) {
      try { localStorage.setItem(LS_KEY, R.id); } catch (e) { /* 忽略 */ }
    }
    return R;
  };

  /**
   * 取一条界面文案。
   *   TL.t('pause')                  → "暂停"
   *   TL.t('oneYear', {n: 53})       → "1 年 ≈ 53 秒"
   * 找不到时回落中文，再找不到返回 key 本身（不抛异常）。
   */
  TL.t = function (key, vars) {
    const T = TL.T || TL.LANG.zh;
    let s = T[key];
    if (s == null) s = TL.LANG.zh[key];
    if (s == null) return key;
    if (vars) {
      s = String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    }
    return s;
  };

  /* ---------------------------------------------------------------------- */
  /* 世界数据专名：中文 / 英文二选一                                          */
  /* ---------------------------------------------------------------------- */
  /**
   * 界面文案（TL.t）解决的是「按钮、栏目标题」，这两个帮手解决的是
   * 「世界数据里的专名」——国家、种族、王庭、阶层、分期。
   *
   * 数据表里每一条都带一个可选的 en（短名是 enShort）字段，例如：
   *   TL.NATION_BY_ID.YAN   →  { name: '炎国', en: 'Yan', ... }
   *   TL.STRATA.fringe      →  { name: '城市边缘与地下', en: 'City Fringe & Undercity',
   *                              short: '边缘区', enShort: 'Fringe' }
   *
   *   TL.nameOf(TL.NATION_BY_ID[S.nation])   → "炎国" / "Yan"
   *   TL.shortOf(TL.stratum(S.stratum))      → "核心区" / "Core"
   *
   * 规则：TL.lang === 'en' 且该条有英文名时返回英文，否则一律回落中文；
   * 传入 null / undefined / 缺字段的记录返回 ''，不抛异常。
   * 【为什么放在 region.js】它只依赖 TL.lang（本文件定义），
   * 数据表是调用时传进来的，所以不必等 nations.js / races.js 加载完。
   */
  TL.nameOf = function (obj) {
    if (!obj) return '';
    if (TL.lang === 'en' && obj.en) return obj.en;
    return obj.name || '';
  };

  TL.shortOf = function (obj) {
    if (!obj) return '';
    if (TL.lang === 'en' && obj.enShort) return obj.enShort;
    return obj.short || '';
  };

  /** 一行效果摘要（年度重心用），英文侧读 enD */
  TL.descOf = function (obj) {
    if (!obj) return '';
    if (TL.lang === 'en' && obj.enD) return obj.enD;
    return obj.d || '';
  };

  /* ---------------------------------------------------------------------- */
  /* 货币                                                                    */
  /* ---------------------------------------------------------------------- */
  /**
   * 泰拉的货币叫「龙骨」，但在人生模拟里我们只关心「购买力」。
   * 这里把模型内部的抽象单位折算成用户所在地区的体感金额。
   *
   * 内部单位：1 = 国际基准元的千分之一（沿用原作的 MONEY_UNIT = 1000）。
   * 展示时：本地金额 = 内部金额 × priceK。
   */
  TL.money = function (v) {
    const R = TL.locale || TL.LOCALES.CN;
    return v * R.priceK;
  };

  /** 带符号的金额字符串，按数量级自动切 万 / 亿（英文用 K / M / B） */
  TL.moneyStr = function (v) {
    const R = TL.locale || TL.LOCALES.CN;
    const x = TL.money(v);
    const neg = x < 0, a = Math.abs(x);
    const zh = (TL.lang === 'zh');
    let s;
    if (zh) {
      if (a >= 1e8) s = (a / 1e8).toFixed(2) + ' 亿';
      else if (a >= 1e4) s = (a / 1e4).toFixed(a >= 1e5 ? 0 : 1) + ' 万';
      else s = Math.round(a);
    } else {
      if (a >= 1e9) s = (a / 1e9).toFixed(2) + 'B';
      else if (a >= 1e6) s = (a / 1e6).toFixed(2) + 'M';
      else if (a >= 1e3) s = (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'K';
      else s = Math.round(a);
    }
    return (neg ? '-' : '') + R.cur + s;
  };

  /** 报告里那句口径说明 */
  TL.priceNote = function () {
    const R = TL.locale || TL.LOCALES.CN;
    return TL.lang === 'zh' ? R.priceNote : R.priceNoteEn;
  };

})(window.TL = window.TL || {});
