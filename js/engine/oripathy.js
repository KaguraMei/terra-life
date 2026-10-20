/* ==========================================================================
 * TERRA LIFE SIM — 矿石病（Oripathy）系统
 * --------------------------------------------------------------------------
 * 这是泰拉人生模拟区别于现实人生的地方，也是本作的核心扩展。
 *
 * 【模型依据】《大地巡旅》：矿石病是「职业病、灾害病与贫困病」。
 * 能源（源石）即毒药，越靠近能源生产第一线的人，感染率越呈指数级上升。
 *
 *   安全核心区（移动城市核心区、特权阶级）        1% ~ 3%
 *   工业与蓝领区（工厂工人、搬运工）              8% ~ 15%
 *   城市边缘 / 地下（外环贫民窟、下水道）          20% ~ 35%
 *   荒野流民群落                                  30% ~ 50%
 *   高危职业暴露（矿工、天灾信使、前线源石术师）    50% ~ 70%
 *
 *   特例：拉特兰、谢拉格 < 1%；卡兹戴尔全境 60% ~ 80%
 *
 * 实现方式：这些数字是**终生感染概率**，不是年概率。
 * 每年按剩余暴露年数换算成年度风险，因此同一阶层在不同年龄的
 * 年风险不同，而终生累积恰好落在设定的区间里。
 *
 * 【感染之后的四段式】
 *   感染判定 → 分期推进 → 治疗干预 → 国家容忍度惩罚
 *   最后一段是泰拉最残酷的地方：确诊之后，你的死法主要由国籍决定。
 * ========================================================================== */
(function (TL) {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* 分期定义                                                               */
  /* ---------------------------------------------------------------------- */
  TL.ORI_STAGES = [
    { id: 0, name: '未感染', en: 'Uninfected', short: '—',  desc: '尚未确诊矿石病；接触史仍会影响风险。' },
    { id: 1, name: '轻度感染', en: 'Mild infection', short: '轻度', desc: '血液源石结晶密度低于 0.30u/L；症状和工作影响通常有限。' },
    { id: 2, name: '中度感染', en: 'Moderate infection', short: '中度', desc: '血液源石结晶密度处于 0.30–0.40u/L；需要持续管理。' },
    { id: 3, name: '重度感染', en: 'Severe infection', short: '重度', desc: '血液源石结晶密度高于 0.40u/L；器官负担和死亡风险显著上升。' }
  ];

  /**
   * 临床严重程度以血液源石结晶密度为准（NGA 档案整理的经验分档）：
   * 轻度 <0.30u/L，中度 0.30–0.40u/L（含），重度 >0.40u/L。
   * 体细胞融合率是独立的慢变量，不应代理临床严重程度。
   */
  const BLOOD_GATE = [0, 0.30, 0.40];
  /* OCR/NGA 案例中的体细胞融合率最高约 19%；它是慢变量的显示上限，
   * 不是临床分期。旧存档若超过该值，在迁移和下一次年度推进时压回。 */
  const FUSION_MAX = 19;
  TL.ORI_FUSION_MAX = FUSION_MAX;

  TL.oriStageOf = function (bloodDensity) {
    if (!(bloodDensity > 0)) return 0;
    if (bloodDensity > BLOOD_GATE[2]) return 3;
    if (bloodDensity >= BLOOD_GATE[1]) return 2;
    if (bloodDensity > 0) return 1;
    return 0;
  };
  /** 分期的显示名：按当前界面语言取（见 region.js 的 TL.nameOf） */
  TL.oriStageName = function (stage) {
    return TL.nameOf(TL.ORI_STAGES[stage] || TL.ORI_STAGES[0]);
  };

  /* ---------------------------------------------------------------------- */
  /* 暴露类型与防护                                                         */
  /* ---------------------------------------------------------------------- */
  /*
   * OCR 中的感染路径不是一条“职业倍率”：活性粉尘、碎片划伤、矿井接触、
   * 精炼泄漏与固化源石的风险不同。这里把它们保存为可追踪的暴露记录，
   * 方便事件、组织训练和 UI 解释同一套结果。
   */
  TL.ORI_EXPOSURES = {
    active_dust:       { name: '活性源石粉尘', en: 'Active Originium dust', factor: 5.8, blood: [0.19, 0.31], organ: { lung: 0.08, core: 0.02 } },
    fragment_wound:    { name: '源石碎片划伤', en: 'Originium fragment wound', factor: 3.2, blood: [0.16, 0.25], organ: { skin: 0.10, limb: 0.06 } },
    mine_contact:      { name: '矿井接触', en: 'Mine contact', factor: 4.4, blood: [0.17, 0.28], organ: { lung: 0.05, skin: 0.05 } },
    refinery_leak:    { name: '精炼炉泄漏', en: 'Refinery leak', factor: 6.6, blood: [0.20, 0.34], organ: { lung: 0.12, core: 0.03 } },
    stable_crystal:   { name: '固化源石加工', en: 'Stable crystal handling', factor: 0.28, blood: [0.14, 0.20], organ: { limb: 0.05 }, injury: true },
    protective_failure:{ name: '防护失效', en: 'Protective failure', factor: 2.1, blood: [0.17, 0.27], organ: { lung: 0.04, skin: 0.04 } }
  };
  TL.oriExposureName = function (id) {
    const e = TL.ORI_EXPOSURES[id] || TL.ORI_EXPOSURES.fragment_wound;
    return TL.nameOf(e);
  };

  TL.protectionScore = function (S) {
    let score = 0;
    score += TL.clamp(Number(S.flags && S.flags.protectionPractice) || 0, 0, 0.35);
    score += TL.clamp(Number(S.flags && S.flags.protectiveGear) || 0, 0, 0.25);
    if (S.affiliation === 'blacksteel' && TL.isWorking && TL.isWorking(S)) score += 0.22;
    if (S.affiliation === 'rhodes' && TL.isWorking && TL.isWorking(S)) score += 0.14;
    return TL.clamp(score, 0, 0.62);
  };

  TL.exposureModifier = function (S, type) {
    const e = TL.ORI_EXPOSURES[type] || TL.ORI_EXPOSURES.fragment_wound;
    const protection = TL.protectionScore(S);
    // 防护降低粉尘与泄漏概率，但不会把碎片伤口变成零风险。
    const floor = type === 'fragment_wound' || type === 'stable_crystal' ? 0.42 : 0.24;
    return Math.max(floor, 1 - protection);
  };

  TL.exposureTypeFor = function (S) {
    if (S.flags && S.flags.postCatastrophe) return 'active_dust';
    if (S.flags && S.flags.protectiveGear && TL.chance(0.18)) return 'protective_failure';
    if (S.job === 'refiner' || S.job === 'factory') return 'refinery_leak';
    if (S.job === 'oriminer' || S.job === 'miner' || S.job === 'stormcaller') return 'mine_contact';
    if (S.job === 'smith' || S.job === 'construct' || S.job === 'artsmith') {
      return TL.chance(0.22) ? 'stable_crystal' : 'fragment_wound';
    }
    return 'fragment_wound';
  };

  TL.recordExposure = function (S, type) {
    const id = TL.ORI_EXPOSURES[type] ? type : 'fragment_wound';
    S.flags.oriExposure = id;
    S.flags.oriExposureAt = S.age;
    if (!Array.isArray(S.flags.oriExposureHistory)) S.flags.oriExposureHistory = [];
    S.flags.oriExposureHistory.push({ age: S.age, year: S.year, type: id });
    if (S.flags.oriExposureHistory.length > 12) S.flags.oriExposureHistory.shift();
    return TL.ORI_EXPOSURES[id];
  };

  /* ---------------------------------------------------------------------- */
  /* 职业感染风险覆盖                                                        */
  /* ---------------------------------------------------------------------- */
  /**
   * 高危职业直接覆盖阶层区间 —— 一个矿工无论在哪个阶层，
   * 感染率都是 50~70%。这就是「职业病」三个字的含义。
   */
  const JOB_ORI = {
    oriminer:      [0.58, 0.70],
    refiner:       [0.50, 0.64],
    miner:         [0.34, 0.48],
    stormcaller:   [0.45, 0.60],   // 天灾信使：常年在灾区最前线
    alchemist:     [0.40, 0.55],
    caster:        [0.35, 0.50],
    artsmith:      [0.32, 0.45],
    op_caster:     [0.38, 0.52],
    oridoc:        [0.30, 0.45],
    op_supporter:  [0.30, 0.44],
    witch:         [0.28, 0.40],
    mercenary:     [0.18, 0.30],
    op_specialist: [0.17, 0.28],
    op_guard:      [0.16, 0.26],
    op_vanguard:   [0.15, 0.25],
    soldier:       [0.14, 0.24],
    factory:       [0.10, 0.18],
    construct:     [0.10, 0.18],
    smith:         [0.08, 0.14]
  };

  /** 国家感染特例：直接指定终生概率区间，覆盖一切 */
  const NATION_ORI = {
    KDZ: [0.60, 0.80],    // 卡兹戴尔：多代战争摧毁生态，源石粉尘弥漫
    LAT: [0.002, 0.010],  // 拉特兰：律法排查
    KJR: [0.003, 0.010],  // 谢拉格：长期封闭自守，传统工业极少接触源石
    AEG: [0.001, 0.006],  // 阿戈尔：几乎不依赖源石科技
    DUR: [0.003, 0.012]
  };

  /* ---------------------------------------------------------------------- */
  /* 终生感染概率                                                           */
  /* ---------------------------------------------------------------------- */
  /**
   * 这个人一生中感染矿石病的总概率（0..1）。
   * 第一次调用时抽定，之后固定不变 —— 「命运」是一次性的，
   * 每一年的风险分摊只是把它逐步兑现出来。
   */
  TL.oriLifetimeP = function (S) {
    if (S.flags.oriP != null) return S.flags.oriP;

    const nat = NATION_ORI[S.nation];
    const job = JOB_ORI[S.job];
    let lo, hi;

    if (nat) {
      lo = nat[0]; hi = nat[1];
      // 卡兹戴尔即使在高危职业也只是接近上限
      if (job && S.nation !== 'KDZ') {
        lo = Math.max(lo, job[0] * 0.8); hi = Math.max(hi, job[1] * 0.8);
      }
    } else if (job) {
      lo = job[0]; hi = job[1];
    } else {
      const st = TL.stratum(S.stratum);
      lo = st.ori[0]; hi = st.ori[1];
    }

    // 个体修正
    const r = TL.RACE_BY_ID[S.race];
    let k = 1;
    if (r) k *= 0.65 + (r.ori || 1) * 0.42;              // 源石亲和（瓦伊凡/萨卡兹/龙更易感）
    k *= 1 + (3 - S.q) * 0.14;                            // 贫困：住得近、买不起防护
    k *= 1.15 - (TL.NATION_BY_ID[S.nation].med || 0.5) * 0.30;  // 医疗与劳保
    // 大事件：柯瓦尔矿场暴动后的北原矿区、大静谧后的沿海、大荒城失败的治理
    if (TL.tlMods) {
      const tl = TL.tlMods(S.nation, S.year);
      if (tl.ori) k *= 1 + tl.ori;
    }

    const p = TL.clamp(((lo + hi) / 2) * k, 0.0005, 0.88);
    S.flags.oriP = p;
    return p;
  };

  /* ---------------------------------------------------------------------- */
  /* 年度感染风险                                                           */
  /* ---------------------------------------------------------------------- */
  const EXPOSE_FROM = 6;

  /**
   * 把终生概率换算成一个**固定的**年度风险。
   *
   * 【为什么不能用「剩余年数」摊派】
   * 早先的写法是 remain = endAge - age，每年重算一次。这在「活满预期寿命」
   * 的前提下数学上是对的，但只要有人活得比 endAge 久，remain 就会被
   * Math.max(1, ...) 夹到 1，年风险直接跳成整份终生概率 ——
   * 一个 e0=79 却活到 111 的人，后 26 年每年都在赌 2%，
   * 累积感染率凭空多出 40%。这正是终生感染率一直下不来的原因。
   *
   * 现在的写法：暴露窗口固定为 [EXPOSE_FROM, min(e0+6, 90)]，
   * 年风险 = 1-(1-L)^(1/窗口长度)，此后不再随年龄变化。
   * 活满窗口恰好等于设定的终生概率；活得更久则按固定年风险继续累积 ——
   * 多活的那些年本来就该多一份暴露，而不是多一份「整份」。
   */
  function annualFrom(life, lt) {
    const start = EXPOSE_FROM;
    const end = Math.max(start + 1, Math.min(lt.e0 + 6, 90));
    return 1 - Math.pow(1 - life, 1 / (end - start));
  }

  TL.oriRisk = function (S) {
    if (S.ori && S.ori.stage > 0) return 0;
    const life = TL.oriLifetimeP(S);
    if (life <= 0) return 0;

    let p = annualFrom(life, TL.LT(S));

    if (S.flags.postCatastrophe) p *= 2.6;   // 天灾后清理废墟
    if (S.flags.oriSurge) p *= 8;            // 急性暴露事件
    if (S.job === 'slave') p *= 3.2;         // 矿坑苦役
    if (S.age < EXPOSE_FROM) p *= 0.5;

    // 防护服、滤网、通风训练与组织安全规程只降低接触概率，不能抹除感染。
    p *= 1 - TL.protectionScore(S) * 0.72;

    return TL.clamp(p, 0, 0.55);
  };

  /**
   * 判定是否感染。所有感染路径都必须走这里 ——
   * 否则会出现绕过校准的旁路，让终生感染率远远偏离设定。
   */
  TL.tryInfect = function (S, k, options) {
    let p = TL.oriRisk(S);
    if (p <= 0) return false;
    if (k && k > 0) p = TL.clamp(p * k, 0, 0.65);
    if (!TL.chance(p)) return false;
    TL.infect(S, false, options);
    return true;
  };

  /* ---------------------------------------------------------------------- */
  /* 感染                                                                   */
  /* ---------------------------------------------------------------------- */
  TL.infect = function (S, silent, options) {
    options = options || {};
    const ar = TL.artRank(S);
    const exposure = TL.ORI_EXPOSURES[options.type || S.flags.oriExposure] || null;
    const bloodBand = exposure && exposure.blood ? exposure.blood : [0.16, 0.26];
    const infectionBlood = options.bloodDensity == null ? TL.range(bloodBand[0], bloodBand[1]) : options.bloodDensity;
    if (options.type && S.flags.oriExposure !== options.type) TL.recordExposure(S, options.type);
    S.ori = {
      at: S.age,
      stage: 1,
      crystal: TL.range(3, 11),
      // crystal 暂作为旧接口兼容，语义固定为体细胞融合率（%）。
      bloodDensity: infectionBlood,
      bloodSetPoint: infectionBlood,
      exposure: options.type || S.flags.oriExposure || 'unknown',
      organLoad: { skin: 0.12, limb: 0.04, lung: 0.02, nerve: 0.01, core: 0.01 },
      treated: false,
      known: false,
      art: ar >= 2,
      provider: null
    };
    S.ori.stage = TL.oriStageOf(S.ori.bloodDensity);

    // 感染者可借体内结晶施术；感染本身不代表瞬间获得大量适应性。

    TL.eff(S, { h: -18, hl: -6 });
    if (!silent) {
      TL.log(S, TL.L`你的手指上出现了一小块黑色的结晶。它不疼，但你盯着它看了很久。`, 'ori', { key: 'infect' });
    }
    S.flags.infectedAt = S.age;
    return S.ori;
  };

  /** 记录一次具体接触。未感染者按该路径独立掷骰，已感染者增加血液与器官负担。 */
  TL.expose = function (S, type, options) {
    options = options || {};
    const e = TL.recordExposure(S, type);
    const id = S.flags.oriExposure;
    const factor = (options.factor == null ? e.factor : options.factor) * TL.exposureModifier(S, id);
    if (e.injury) TL.eff(S, { hl: -3, h: -1 });
    if (!S.ori || S.ori.stage <= 0) {
      const infected = options.guaranteed ? (TL.infect(S, false, { type: id }), true) : TL.tryInfect(S, factor, { type: id });
      if (infected && S.ori) {
        for (const organ of Object.keys(e.organ || {})) S.ori.organLoad[organ] = TL.clamp((S.ori.organLoad[organ] || 0) + e.organ[organ], 0, 1);
        S.ori.bloodDensity = TL.clamp(Math.max(S.ori.bloodDensity, TL.range(e.blood[0], e.blood[1])), 0.08, 1.2);
        S.ori.bloodSetPoint = Math.max(S.ori.bloodSetPoint || 0, S.ori.bloodDensity);
        S.ori.stage = TL.oriStageOf(S.ori.bloodDensity);
      }
      return infected;
    }
    const o = S.ori;
    for (const organ of Object.keys(e.organ || {})) o.organLoad[organ] = TL.clamp((o.organLoad[organ] || 0) + e.organ[organ] * 0.35, 0, 1);
    o.bloodDensity = TL.clamp(o.bloodDensity + TL.range(0.015, 0.045) * factor, 0.08, 1.2);
    o.bloodSetPoint = Math.max(o.bloodSetPoint || 0, o.bloodDensity);
    o.stage = TL.oriStageOf(o.bloodDensity);
    S.flags.oriSurge = 1;
    return true;
  };

  /* ---------------------------------------------------------------------- */
  /* 年度推进                                                               */
  /* ---------------------------------------------------------------------- */
  TL.oriYear = function (S) {
    if (!S.ori || S.ori.stage <= 0) return;

    const ar = TL.artRank(S);
    const o = S.ori;
    const ti = TL.tolInfo(S.nation, S.year);
    o.organLoad = o.organLoad || { skin: 0.1, limb: 0.03, lung: 0.02, nerve: 0.01, core: 0.01 };

    // 迁移旧存档，并把融合率限制在考据可见的约 19% 内。
    o.crystal = TL.clamp(Number(o.crystal) || 0, 0, FUSION_MAX);
    const blood = TL.clamp(Number(o.bloodDensity) || 0.12, 0.08, 1.2);
    // 血液源石结晶密度是病程的快变量：低密度时融合推进很慢，
    // 进入中重度后才会明显加速。两者有关，但融合率不替代血液分期。
    const bloodPressure = TL.clamp((blood - 0.08) / 0.32, 0.05, 1.20);
    let grow = 1.15 * bloodPressure;
    grow *= [1, 0.72, 1.05, 1.45][o.stage];
    grow *= 1 + (3 - S.q) * 0.08;
    grow *= 1.35 - S.st.hl / 180;
    // 低容忍度国家：药物流入被禁，结晶推进更快
    grow *= 1 + (1 - ti.lifeK) * 0.55;

    if (o.treated) {
      // 轻/中度且得到抑制治疗时，进展压到近似可忽略；重度仍可能缓慢恶化。
      const controlled = blood < 0.40;
      grow *= o.provider === 'rhodes'
        ? (controlled ? 0.035 : 0.12)
        : (controlled ? 0.10 : 0.32);
      const cost = TL.NATION_BY_ID[S.nation].ppp * (o.provider === 'rhodes' ? 2.6 : 1.2);
      if (S.money >= cost) S.money -= cost;
      else { o.treated = false; o.provider = null; S.flags.oriLapsed = S.age; }
    }

    const previousFusion = o.crystal;
    o.crystal = TL.clamp(o.crystal + grow * TL.range(0.75, 1.3), 0, FUSION_MAX);
    // 原作描述融合率增加与技艺适应性提高相关；幅度保持温和，避免一次感染跳变。
    S.arts = TL.clamp(S.arts + Math.max(0, o.crystal - previousFusion) * 0.12, 0, 100);
    // 血液负担是快变量：暴露、贫困与治疗影响它，融合率不再代理它。
    const bloodNow = o.bloodDensity == null ? 0.12 + previousFusion / FUSION_MAX * 0.025 : blood;
    const fusionPressure = TL.clamp((o.crystal / FUSION_MAX) - 0.35, 0, 0.65) * 0.020;
    const bloodTarget = (o.bloodSetPoint == null ? bloodNow : o.bloodSetPoint)
      + (o.treated ? 0 : 0.010)
      + fusionPressure
      + ((o.organLoad.core || 0) + (o.organLoad.lung || 0)) * 0.08
      + (S.flags.oriSurge ? 0.10 : 0);
    const bloodControl = o.treated ? (o.provider === 'rhodes' ? 0.035 : 0.018) : 0;
    o.bloodDensity = TL.clamp(bloodNow + (bloodTarget - bloodNow) * 0.18 - bloodControl + TL.range(-0.008, 0.008), 0.08, 1.2);
    const delta = Math.max(0, o.crystal - previousFusion) / 100;
    for (const organ of Object.keys(o.organLoad)) o.organLoad[organ] = TL.clamp(o.organLoad[organ] + delta * (organ === 'skin' ? 0.55 : 0.12), 0, 1);

    const previousStage = o.stage;
    const ns = TL.oriStageOf(o.bloodDensity);
    // 分期始终反映当前血液检测值；治疗把数值压回阈值以下时也允许回落。
    o.stage = ns;
    if (ns > previousStage) {
      TL.eff(S, { hl: -12, h: -10 });
      const line = [
        null, null,
        TL.L`结晶已经蔓延到手肘。医生在病历上写下「Ⅱ期」，然后很快合上了本子。`,
        TL.L`「Ⅲ期。」他说完这两个字就没有再说话。你听见窗外有人在敲钟。`
      ][ns];
      if (line) TL.log(S, line, 'ori', { key: 'stage' + ns });
    }

    TL.eff(S, { hl: -0.9 * o.stage, h: -0.5 * o.stage });
  };

  /* ---------------------------------------------------------------------- */
  /* 国家容忍度对感染者的惩罚                                                  */
  /* ---------------------------------------------------------------------- */
  /**
   * 用《大地巡旅》的五梯队取代原先逐国硬编码的系数。
   * 容忍度越低，感染者越容易被抓、被判、被送去苦役，社会惩罚也越重。
   */
  TL.oriStigma = function (S) {
    if (!S.ori || S.ori.stage <= 0) return 0;
    const tol = TL.tolOf(S.nation, S.year);
    let v = (100 - tol) / 100;
    v *= 0.55 + 0.15 * S.ori.stage;
    if (!S.ori.known) v *= 0.45;
    if (S.ori.treated && S.ori.provider === 'rhodes') v *= 0.72;
    return TL.clamp(v, 0, 0.97);
  };

  /** 综合歧视：种族 + 感染者 */
  TL.totalDiscrimination = function (S) {
    return TL.clamp(TL.discrimination(S) + TL.oriStigma(S) * 0.9, 0, 0.97);
  };

  /* ---------------------------------------------------------------------- */
  /* 整合运动 / 罗德岛 两条路线                                              */
  /* ---------------------------------------------------------------------- */
  /**
   * 整合运动倾向：被系统性排斥得越狠的人越容易走向它。
   * 不是「善恶」，而是「你被推到了哪里」。
   * 乌萨斯（容忍度 8）的人几乎必然被推过去；卡兹戴尔（92）则不会。
   */
  TL.reunionLean = function (S) {
    if (!S.ori || S.ori.stage <= 0) return 0;
    let lean = TL.oriStigma(S) * 0.6 + TL.discrimination(S) * 0.35;
    lean += (3 - S.q) * 0.06;
    lean -= S.st.h * 0.004;
    if (S.ori.known) lean += 0.12;
    if (!S.ori.treated) lean += 0.10;
    lean += TL.tolInfo(S.nation, S.year).arrest * 0.5;
    return TL.clamp(lean, 0, 1);
  };

  /** 源石技艺战斗力 */
  TL.combatValue = function (S) {
    const ar = TL.artRank(S);
    let v = ar * 22 + S.st.hl * 0.35 + S.st.sm * 0.15;
    if (S.ori && S.ori.stage > 0) v += S.ori.stage * 9;
    if (S.opRank) v += TL.OP_RANKS[S.opRank].need * 1.2;
    return Math.round(v);
  };

  /**
   * 感染者的治疗可及性。
   * 低容忍度国家不仅抓人，还禁止药物流入 —— 这是设定里明写的。
   */
  TL.treatAccess = function (S) {
    const ti = TL.tolInfo(S.nation, S.year);
    let p = ti.treatP;
    p += TL.NATION_BY_ID[S.nation].med * 0.25;
    p += (S.q - 3) * 0.06;
    if (S.flags.reunion) p -= 0.10;
    return TL.clamp(p, 0, 0.85);
  };

})(window.TL = window.TL || {});
