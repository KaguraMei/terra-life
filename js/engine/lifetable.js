/* ==========================================================================
 * TERRA LIFE SIM — 生命表与死亡模型
 * --------------------------------------------------------------------------
 * 泰拉的寿命有两套，必须分开建模：
 *
 *   ① 生理极限寿命（lifeMax）—— 由**种族**决定，写在血脉里。
 *      先民 80~100 岁；神民 120~180；萨卡兹王庭血脉数百至上千年。
 *      荒野上的菲林和核心区的菲林，这个数字完全一样。
 *
 *   ② 社会预期寿命（socialLE）—— 由**国家 × 阶层 × 身份**决定。
 *      移动城市核心区 70~80；工业蓝领 50~65；荒野聚落 35~45。
 *      一个荒野菲林大概率活到 40 岁就死于天灾或感染。
 *
 * 所以死亡风险拆成两项相加：
 *
 *      hazard(x) = external(x)  +  senescence(x)
 *                  └ 外部风险      └ 衰老
 *                    由阶层反解       由种族生理极限决定
 *
 * 外部风险用二分法反解，使总生存人年等于 socialLE。
 * 衰老项的斜率 g 由 lifeMax 决定 —— 生理上限 100 岁的人和 1000 岁的人，
 * 衰老曲线完全不同，而这一点只会在极少数躲过了所有外部风险的人身上显现：
 * 一个荒野血魔的生存曲线接近指数衰减（几乎全是外部死亡）；
 * 一个核心区血魔则要活过 200 岁才真正开始「老」。
 *
 * 移植自原作 80億分之1 的 lifeTable / deathProb，
 * 但原作是单一 e0 反解 Gompertz 的 B，本作拆成两个独立 hazard。
 * ========================================================================== */
(function (TL) {
  'use strict';

  const LT_CACHE = {};
  const HARD_CAP = 1500;          // 生理极限的硬上限（巫妖）
  const AGE0 = 15;                // 衰老从青春期后开始累积

  /* ---------------------------------------------------------------------- */
  /* 时间压缩：几百年的生命在主观上会被压缩                                    */
  /* ---------------------------------------------------------------------- */
  /**
   * 模拟年龄 → 「主观年数」。60 岁之前一一对应，之后按对数压缩。
   * 既解决了「巫妖活 800 年要玩 8 小时」的问题，
   * 也正好对应设定里长生种对漫长岁月的模糊感受。
   */
  TL.playAge = function (a) {
    if (a <= 60) return a;
    return 60 + 40 * Math.log(1 + (a - 60) / 40);
  };
  /** 第 a 年这一年的「主观长度」倍率 */
  TL.playAgeDeriv = function (a) {
    if (a <= 60) return 1;
    return 40 / (40 + (a - 60));
  };

  /* ---------------------------------------------------------------------- */
  /* 衰老项：由生理极限寿命决定                                                */
  /* ---------------------------------------------------------------------- */
  function senescSlope(lifeHi) {
    const span = Math.max(20, lifeHi - AGE0);
    return Math.log(1 / 1e-5) / span;   // 在生理上限处风险达到 ~1
  }
  function senescence(x, g, A0) {
    if (x <= AGE0) return 0;
    return A0 * Math.exp(g * (x - AGE0));
  }

  /** 外部风险的年龄形状：意外、暴力、感染、天灾 */
  function extShape(x) {
    if (x < 15) return 1.00;
    if (x < 30) return 1.28;   // 冒险、斗殴、从军、高危劳动
    if (x < 50) return 0.85;
    if (x < 65) return 0.95;
    if (x < 80) return 1.30;   // 跌倒、并发症
    return 1.90;
  }

  /**
   * 构造生命表。
   * @param {object} n         国家对象
   * @param {'M'|'F'} sex
   * @param {string} raceId    种族
   * @param {string} courtId   萨卡兹王庭（可为 null）
   * @param {string} stratumId 阶层
   */
  TL.lifeTable = function (n, sex, raceId, courtId, stratumId) {
    raceId = raceId || 'feline';
    stratumId = stratumId || 'industrial';
    const key = [n.id, sex, raceId, courtId || '-', stratumId].join('|');
    if (LT_CACHE[key]) return LT_CACHE[key];

    const st = TL.stratum(stratumId);
    const socialLE0 = TL.stratumLE(n.id, stratumId);
    const e0 = sex === 'F' ? socialLE0 + n.gap * 0.49 : socialLE0 - n.gap * 0.51;

    const lifeMax = TL.lifeMaxOf(raceId, courtId);
    const g = senescSlope(lifeMax[1]);
    const A0 = 1e-5;
    const maxAge = Math.min(HARD_CAP, Math.ceil(lifeMax[1] * 1.05) + 5);

    // 婴幼儿段（阶层系数直接乘在死亡率上）
    const k = sex === 'F' ? 0.92 : 1.08;
    const q0 = Math.min(0.30, n.im * st.imK / 1000 * k);
    const u5 = Math.min(0.42, Math.max(q0 + 0.0005, n.u5 * st.u5K / 1000 * k));
    const H = -Math.log((1 - u5) / (1 - q0));
    const qc = [0.4, 0.27, 0.19, 0.14].map(w => 1 - Math.exp(-H * w));
    const q514 = 1 - Math.pow(1 - Math.min(0.25, u5 * 0.9), 0.28);

    /** 给定外部风险水平 A，构建死亡曲线并回传 e0 */
    const build = (A) => {
      const q = new Float64Array(maxAge + 1);
      q[0] = q0;
      for (let i = 1; i <= 4; i++) q[i] = qc[i - 1];
      for (let x = 5; x <= maxAge; x++) {
        if (x === maxAge) { q[x] = 1; continue; }
        if (x < 15) { q[x] = Math.min(0.4, q514); continue; }
        const h = A * extShape(x) + senescence(x, g, A0);
        q[x] = Math.min(1, 1 - Math.exp(-h));
      }
      let l = 1, e = 0;
      for (let x = 0; x <= maxAge; x++) {
        const d = l * q[x];
        e += (x === 0 ? l - 0.85 * d : l - 0.5 * d);
        l -= d;
      }
      return { q, e };
    };

    // 二分反解外部风险水平 A（A 越大 → e 越小）
    let lo = 1e-7, hi = 1.5, r = null;
    for (let i = 0; i < 60; i++) {
      const m = (lo + hi) / 2;
      r = build(m);
      if (r.e > e0) lo = m; else hi = m;
    }
    const Aext = (lo + hi) / 2;
    r = build(Aext);

    const l = new Float64Array(maxAge + 2);
    l[0] = 1;
    for (let x = 0; x <= maxAge; x++) l[x + 1] = l[x] * (1 - r.q[x]);

    const out = {
      q: r.q, l, e0, maxAge, lifeMax, socialLE: socialLE0,
      g, A0, Aext, stratum: stratumId, race: raceId, court: courtId || null
    };
    LT_CACHE[key] = out;
    return out;
  };

  /** 取当前角色的生命表 */
  TL.LT = function (S) {
    return TL.lifeTable(TL.NATION_BY_ID[S.nation], S.sex, S.race, S.court, S.stratum);
  };

  /* ---------------------------------------------------------------------- */
  /* 健康期望值                                                              */
  /* ---------------------------------------------------------------------- */
  TL.expHealth = function (a) {
    if (a < 1) return 72;
    if (a < 5) return 80;
    if (a < 30) return 90;
    if (a < 60) return 90 - (a - 30) * 0.6;
    return Math.max(15, 72 - (a - 60) * 0.95);
  };

  /* ---------------------------------------------------------------------- */
  /* 死亡率                                                                  */
  /* ---------------------------------------------------------------------- */
  TL.deathProb = function (S) {
    // 100% 结晶率是本模拟的终末阈值：抵达时在当年结算中必然死亡。
    if (S.ori && S.ori.stage > 0 && S.ori.crystal >= 100) return 1;
    const n = TL.NATION_BY_ID[S.nation];
    const lt = TL.LT(S);
    const a = S.age;
    const q = a >= lt.maxAge ? 1 : lt.q[a];

    let m = 1;

    /* ⓪ 大事件的整体死亡率乘数（大静谧、清洗、围城……）
       这是「快变量」的入口：不改 q(x)，只乘当年。 */
    if (TL.tlMods) {
      const tl = TL.tlMods(n.id, S.year);
      if (tl.mort !== 1) m *= tl.mort;
      if (tl.war) m *= 1 + tl.war * 0.35;
    }

    // ① 体质（hl）相对同龄基准的偏差。
    //    off 是「随机不幸消耗的健康余量」：意外、工伤、慢病每年把 hl 压低若干分，
    //    而年度回归只有 25%，因此 hl 的均衡点天然低于 expHealth 约 4×年损耗。
    //    把 off 设成这个均衡差，平均人才会得到 m = 1。
    const off = 13
      + (a < 15 ? n.u5 / 20 : 0)
      + (a > 50 ? (a - 50) * 0.08 : 0);
    m *= Math.max(0.5, Math.exp((TL.expHealth(a) - off - S.st.hl) * (a < 5 ? 0.02 : 0.03)));

    // ② 贫富梯度（中心取中位数分位，而非 0.5）
    const g2 = TL.MORT_G[n.reg];
    const qe = a < 18 ? S.q : TL.clamp(Math.max(S.pct, S.flags.careerPct || 0) * 5, 0, 5);
    const qC = 2.5;
    let norm = 0;
    for (let kk = 0; kk <= 5; kk += 0.5) norm += Math.exp(-g2 * (kk - qC));
    norm /= 11;
    m *= Math.exp(-g2 * (qe - qC)) / norm;

    // ③ 生活习惯
    if (a >= 25) {
      const sp = (S.sex === 'F' ? n.smk * 0.6 : n.smk) / 100;
      const smk = S.smoker ? 1.7 : (S.flags.exSmoker ? 1.25 : 1);
      m *= smk / (1 + 0.7 * sp);
    }
    if (S.alc && a >= 18) m *= 1.30;
    if (S.drug && a >= 16) m *= 2;

    // ④ 疾病
    for (const kk in S.conds) m *= S.conds[kk].treated ? 1.0 : 1.3;

    // ⑤ 身份与处境
    if (S.refugee) m *= 1.15;
    if (S.job === 'prison' || S.job === 'slave') m *= 1.6;
    if (S.serveLeft > 0 && n.war > 0) m *= 1 + n.war * 0.45;

    // ⑥ 羁绊、歧视、矿石病
    m *= TL.tiesK(S);
    m *= TL.raceMortK(S);
    m *= TL.oriMortK(S, a);

    // ⑦ 高龄脆性收敛
    if (a >= 85) m = Math.pow(m, TL.clamp(1 - (a - 85) / 20, 0.3, 1));

    return 1 - Math.pow(1 - q, TL.clamp(m, 0.25, 9));
  };

  /* ---------------------------------------------------------------------- */
  /* 死因权重                                                                */
  /* ---------------------------------------------------------------------- */
  const BANDS = [[0, 1], [1, 5], [5, 15], [15, 50], [50, 70], [70, 2000]];
  TL.band = function (a) {
    for (let i = 0; i < BANDS.length; i++) if (a >= BANDS[i][0] && a < BANDS[i][1]) return i;
    return BANDS.length - 1;
  };

  TL.CAUSES = {
    neo:   { name: '新生儿疾病', short: '新生儿' },
    con:   { name: '先天疾病', short: '先天' },
    inf:   { name: '感染性疾病', short: '感染' },
    lri:   { name: '下呼吸道感染', short: '肺炎' },
    diar:  { name: '腹泻与脱水', short: '腹泻' },
    nut:   { name: '营养不良', short: '营养' },
    tb:    { name: '结核病', short: '结核' },
    mal:   { name: '寄生虫与热病', short: '寄生虫' },
    hiv:   { name: '免疫缺陷综合征', short: '免疫' },
    oinf:  { name: '机会性感染', short: '机会感染' },
    can:   { name: '恶性肿瘤', short: '肿瘤' },
    ihd:   { name: '心血管疾病', short: '心血管' },
    str:   { name: '脑血管疾病', short: '脑卒中' },
    dia:   { name: '代谢疾病', short: '代谢' },
    copd:  { name: '慢性肺病', short: '肺病' },
    kid:   { name: '肾脏疾病', short: '肾病' },
    cir:   { name: '肝病', short: '肝病' },
    dem:   { name: '衰老与失能', short: '衰老' },
    road:  { name: '交通事故', short: '车祸' },
    drown: { name: '溺水', short: '溺水' },
    fall:  { name: '坠落', short: '坠落' },
    fire:  { name: '火灾与烧伤', short: '火灾' },
    inj:   { name: '意外伤害', short: '意外' },
    hom:   { name: '凶杀', short: '凶杀' },
    war:   { name: '战争', short: '战争' },
    cold:  { name: '失温与冻伤', short: '失温' },
    heat:  { name: '热射病', short: '中暑' },
    sea:   { name: '海嗣侵袭', short: '海嗣' },
    cat:   { name: '天灾', short: '天灾' },
    ori:   { name: '矿石病', short: '矿石病' },
    art:   { name: '源石技艺反噬', short: '技艺反噬' },
    alc:   { name: '酒精相关疾病', short: '酒精' },
    /* 阶层特异的死因 */
    slave: { name: '矿坑苦役', short: '苦役' },
    exec:  { name: '纠察队处决', short: '处决' },
    starv: { name: '饥荒', short: '饥荒' },
    beast: { name: '野兽与荒原盗匪', short: '荒原' },
    /*
     * `ocd` 是旧版区域表留下的“其余死因”桶，不应直接展示给玩家。
     * causeWeights() 会在抽取前把它拆到下面的具体疾病/意外类别；保留
     * 这个键只是为了兼容旧存档和旧版统计数据。
     */
    ocd:   { name: '未分类疾病', short: '未分类' }
  };

  /**
   * 旧存档可能仍然保存 `ocd`。新的人生不会再抽到它，但这里保留一个
   * 有年龄语义的兼容名称，避免历史报告继续显示“其他原因”。
   */
  TL.causeName = function (cause, age) {
    if (cause === 'ocd') {
      if (age != null && age < 1) return '新生儿并发症';
      if (age != null && age < 5) return '儿童感染与营养疾病';
      if (age != null && age < 15) return '儿童疾病或意外';
      if (age != null && age < 50) return '未分类疾病';
      return '多器官衰竭';
    }
    const c = TL.CAUSES[cause];
    return c ? c.name : '未知';
  };

  /*
   * 区域表里的 ocd 原本只是为了让每个年龄段的权重加总为 100 的残差项。
   * 它在 5–14 岁和 15–49 岁仍占很大比重，直接抽取就会造成“突然死亡 ·
   * 其他原因”。这里把残差按年龄段拆到模型已经支持的具体死因上，再叠加
   * 国家/阶层的环境修正。这样死亡仍由年度风险判定，但报告能说明死于
   * 哪一类疾病或事故。
   */
  const RESIDUAL_CAUSE_BASE = [
    { neo: 42, con: 24, inf: 12, lri: 10, nut: 7, diar: 5 },
    { inf: 28, lri: 20, diar: 16, nut: 12, con: 12, inj: 12 },
    { inj: 28, inf: 20, con: 14, can: 12, lri: 10, mal: 8, nut: 8 },
    { can: 24, ihd: 18, inf: 14, inj: 14, copd: 10, cir: 7, dia: 6, kid: 4, str: 3 },
    { ihd: 28, can: 22, str: 16, copd: 10, cir: 8, kid: 7, dia: 5, dem: 4 },
    { ihd: 30, str: 23, dem: 20, can: 12, copd: 8, kid: 4, cir: 3 }
  ];

  TL.residualCauseWeights = function (S, a) {
    const n = TL.NATION_BY_ID[S.nation];
    const out = {};
    const base = RESIDUAL_CAUSE_BASE[TL.band(a)] || RESIDUAL_CAUSE_BASE[5];
    for (const k in base) out[k] = base[k];

    /* 环境只改变“残差里具体是什么”，不额外创造一份死亡风险。 */
    if (n.reg === 'south' && a < 70) {
      out.inf = (out.inf || 0) * 1.45;
      out.heat = (out.heat || 0) + 7;
    }
    if (n.reg === 'north' && a >= 1 && a < 70) {
      out.cold = (out.cold || 0) + 7;
    }
    if (n.reg === 'waste') {
      out.inj = (out.inj || 0) * 1.25;
      out.cat = (out.cat || 0) + 7;
    }
    if (n.reg === 'sea') {
      out.drown = (out.drown || 0) + 6;
      if (a >= 15 && a < 70) out.sea = (out.sea || 0) + 4;
    }
    if (S.stratum === 'wild') {
      out.inj = (out.inj || 0) * 1.25;
      out.inf = (out.inf || 0) * 1.20;
    } else if (S.stratum === 'core') {
      out.ihd = (out.ihd || 0) * 1.20;
      out.can = (out.can || 0) * 1.10;
    }
    return out;
  };

  TL.expandResidualCauseWeights = function (w, S, a) {
    const residual = w.ocd;
    if (!(residual > 0)) return;
    delete w.ocd;
    const parts = TL.residualCauseWeights(S, a);
    let total = 0;
    for (const k in parts) total += Math.max(0, parts[k]);
    if (!(total > 0)) {
      w.inj = (w.inj || 0) + residual;
      return;
    }
    for (const k in parts) {
      const share = Math.max(0, parts[k]) / total;
      if (share > 0) w[k] = (w[k] || 0) + residual * share;
    }
  };

  TL.causeWeights = function (S, a, other) {
    const n = TL.NATION_BY_ID[S.nation];
    const b = TL.band(a);
    const t = TL.CT[n.reg][b];
    const w = {};
    for (const k in t) w[k] = t[k];

    /* --- 阶层修正：泰拉死因结构的主轴 --- */
    if (S.stratum === 'wild') {
      // 荒野：不能移动的地方。天灾、野兽、饥荒、感染、外伤占主导；
      // 慢病几乎没有被诊断的机会，所以权重压下去。
      ['cat', 'inj', 'inf', 'cold', 'heat', 'drown', 'fall'].forEach(x => {
        if (w[x]) w[x] *= 2.6; else if (a >= 1) w[x] = 6;
      });
      if (a >= 1) { w.beast = 5; w.starv = a < 12 ? 5 : 2; }
      ['ihd', 'str', 'can', 'dem', 'copd'].forEach(x => { if (w[x]) w[x] *= 0.45; });
      if (w.ocd) w.ocd *= 0.6;
    } else if (S.stratum === 'fringe') {
      ['inj', 'inf', 'cat'].forEach(x => { if (w[x]) w[x] *= 1.6; });
      if (a >= 15) w.hom = (w.hom || 1) * 1.5;
    } else if (S.stratum === 'core') {
      ['ihd', 'str', 'can', 'dem', 'dia'].forEach(x => { if (w[x]) w[x] *= 1.35; });
      ['inj', 'cat', 'inf'].forEach(x => { if (w[x]) w[x] *= 0.45; });
    }

    /* --- 国家特异修正 --- */
    /* 大事件在这里进入模型：某国某年的 war / cat / ori 会被时间轴改写。
       注意改的是**当年的风险权重**，不是生命表 q(x) —— 生命表是慢变量，
       事件是快变量，把事件做进 q(x) 模型就再也解释不清自己了。 */
    const tl = TL.tlMods ? TL.tlMods(n.id, S.year) : { war: 0, cat: 0, ori: 0, tol: 0, mort: 1 };

    if (w.ori != null || n.ori > 1.0) {
      w.ori = (w.ori || 1) * Math.pow(Math.max(0.05, n.ori) / 1.5, 0.85);
      if (tl.ori) w.ori *= 1 + tl.ori;
    }
    if (w.cat != null || n.cat > 0.8) {
      w.cat = (w.cat || 1) * Math.pow(Math.max(0.05, n.cat) / 1.0, 0.9);
      if (tl.cat) w.cat *= 1 + tl.cat;
    }
    if (w.sea != null && ['IBE', 'AEG', 'SST', 'HIG', 'LMN'].indexOf(n.id) < 0) delete w.sea;
    const warK = Math.max(0, n.war + tl.war);
    const hom = warK > 0 ? Math.min(n.hom, 6) : n.hom;
    if (w.hom != null) w.hom = w.hom * Math.pow(hom / 3, 0.85);
    else if (a >= 15) w.hom = hom * (a < 50 ? 0.33 : a < 70 ? 0.06 : 0.0075);
    if (w.road != null) w.road = w.road * n.road / 12;
    if (warK > 0 && a >= 1) {
      w.war = (w.war || 0) + (a >= 15 && a < 50 ? (S.sex === 'M' ? 8 : 3) : 2) * warK;
    } else if (!warK) delete w.war;

    /* --- 感染者 + 低容忍度国家：处决与苦役 --- */
    if (S.ori && S.ori.stage > 0) {
      const ti = TL.tolInfo(S.nation, S.year);
      if (ti.arrest > 0 && a >= 12) {
        let tot = 0; for (const x in w) tot += w[x];
        w.exec = tot * ti.arrest * 0.55;
        w.slave = tot * ti.arrest * 0.40;
      }
    }

    if (['LAT', 'AEG', 'DUR'].indexOf(n.id) >= 0) {
      if (w.ihd) w.ihd *= 0.6; if (w.can) w.can *= 1.2;
      if (a >= 70) w.lri = (w.lri || 2) * 2.0;
    }
    if (['URS', 'SAMI', 'KJR'].indexOf(n.id) >= 0) {
      if (a >= 1 && a < 70) w.cold = (w.cold || 2) * (2.2 - a / 60);
    } else delete w.cold;
    if (['SRG', 'BLV', 'MIN'].indexOf(n.id) >= 0) {
      if (a >= 1 && a < 70) w.heat = (w.heat || 1.5) * 1.6;
    } else delete w.heat;

    if (S.sex === 'F' && a >= 15 && a < 30 && w.hom) w.hom *= 0.25;
    if (S.sex === 'F' && a >= 15 && a < 50 && w.road) w.road *= 0.4;
    if (S.sex === 'F' && w.inj) w.inj *= 0.4;

    /* --- 个人特异修正 --- */
    if (!other) {
      if (S.smoker || S.flags.exSmoker) {
        const k2 = S.smoker ? 1 : 0.5;
        ['can', 'copd', 'ihd', 'str'].forEach(x => {
          if (w[x]) w[x] *= 1 + k2 * (x === 'copd' ? 2 : x === 'can' ? 0.8 : 0.4);
        });
      }
      if (S.conds.htn) ['ihd', 'str', 'kid'].forEach(x => { if (w[x]) w[x] *= 1.35; });
      if (S.conds.dm) { if (w.dia) w.dia *= 2.2; ['ihd', 'kid'].forEach(x => { if (w[x]) w[x] *= 1.25; }); }
      if (S.conds.heart && w.ihd) w.ihd *= 1.8;
      if (S.drug) w.oinf = (w.oinf || 0.5) * 12;
      const jr = (TL.JOBS[S.job] || {}).risk;
      if (jr) for (const x in jr) w[x] = (w[x] || 1) * jr[x];
      if (S.alc) {
        w.cir = (w.cir || 0.5) * 6;
        ['road', 'inj', 'fall', 'hom'].forEach(x => { if (w[x]) w[x] *= 2; });
        w.alc = (w.alc || 1) * 3;
      }
      if (S.ori && S.ori.stage > 0) {
        let tot = 0; for (const x in w) if (x !== 'ori') tot += w[x];
        const share = [0, 0.18, 0.42, 0.78][S.ori.stage] * (S.ori.treated ? 0.55 : 1);
        w.ori = tot * share / Math.max(0.05, 1 - share);
      } else {
        delete w.ori;
      }
      if (TL.artRank(S) >= 2 && a >= 15) {
        let tot = 0; for (const x in w) if (x !== 'art') tot += w[x];
        const share = 0.03 * TL.artRank(S) * (S.ori ? 1.6 : 1);
        w.art = tot * share / Math.max(0.2, 1 - share);
      } else delete w.art;
      if (a < 15) TL.povCause(w, S.q, S);
    }

    /* 旧 CT 表的残差桶必须在最终抽取前展开，避免“其他原因”。 */
    TL.expandResidualCauseWeights(w, S, a);

    // 只有具备水下呼吸这一稀有个体特质的阿戈尔免于溺水死因；
    // 不能把水生适应性推广为全族豁免。
    if (S.race === 'aegir' && S.traits?.underwaterBreathing) delete w.drown;

    for (const k in w) if (!(w[k] > 0)) delete w[k];
    return w;
  };

  /** 贫困对儿童死因结构的放大（原作 povCause） */
  TL.povCause = function (w, q, S) {
    const k = TL.clamp(3 - q, 0, 2);
    if (k <= 0) return;
    ['neo', 'con', 'inf', 'lri', 'diar', 'nut', 'mal', 'tb'].forEach(x => {
      if (w[x]) w[x] *= 1 + 0.35 * k;
    });
  };

  TL.pickCause = function (S, a, other) {
    if (!other && S.ori && S.ori.stage > 0 && S.ori.crystal >= 100) return 'ori';
    return TL.wpick(TL.causeWeights(S, a, other));
  };

  /* ---------------------------------------------------------------------- */
  /* 各修正因子                                                              */
  /* ---------------------------------------------------------------------- */

  /** 羁绊对死亡的保护 */
  TL.tiesK = function (S) {
    const a = S.age;
    let k = 1;
    const f = S.fam || {};
    const hasPartner = f.partner && f.partner.alive && f.married;
    const kids = (f.kids || []).filter(x => x.alive).length;
    if (a >= 20) {
      if (hasPartner) k *= 0.90;
      else if (a >= 30) k *= 1.12;
      if (kids > 0) k *= 1 - Math.min(0.10, kids * 0.035);
      if (S.st.so >= 70) k *= 0.93;
      else if (S.st.so <= 25) k *= 1.18;
    }
    if (f.mom && !f.mom.alive && a < 18) k *= 1.10;
    return k;
  };

  /** 种族歧视带来的结构性风险 */
  TL.raceMortK = function (S) {
    const d = TL.discrimination(S);
    let k = 1;
    if (S.age >= 1) k *= 1 + d * 0.30;
    if (S.race === 'sarkaz' && S.nation !== 'KDZ') k *= 1.10;
    if (S.race === 'aegir' && S.nation !== 'AEG') k *= 1.06;
    return k;
  };

  /** 矿石病对死亡率的乘数 */
  TL.oriMortK = function (S, a) {
    if (!S.ori || S.ori.stage <= 0) return 1;
    const since = a - S.ori.at;
    const stage = S.ori.stage;
    let k = [1, 1.7, 3.2, 7.5][stage];
    if (since > 10 && stage < 3) k *= 1 + (since - 10) * 0.02;
    if (S.ori.treated) k *= 0.50;
    if (S.ori.art) k *= 0.85;
    // 国家容忍度直接改写感染者的存活：Tier 0 的乌萨斯相当于 -80%
    const ti = TL.tolInfo(S.nation, S.year);
    if (ti.lifeK < 1) k *= 1 / Math.max(0.15, ti.lifeK);
    return k;
  };

  /** 源石技艺适应性等级 */
  TL.artRank = function (S) {
    const v = S.arts || 0;
    if (v >= 88) return 4;
    if (v >= 68) return 3;
    if (v >= 45) return 2;
    if (v >= 22) return 1;
    return 0;
  };

  TL.artRankName = function (r) {
    const zh = ['无适应性', '微弱', '中等', '优秀', '极强'];
    const en = ['None', 'Faint', 'Moderate', 'Strong', 'Exceptional'];
    const t = TL.lang === 'en' ? en : zh;
    return t[r] || t[0];
  };

  TL.lifeTableFor = TL.lifeTable;

})(window.TL = window.TL || {});
