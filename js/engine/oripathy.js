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
    { id: 0, name: '未感染', en: 'Uninfected', short: '—',  desc: '体内未检出源石结晶。' },
    { id: 1, name: 'Ⅰ期',   en: 'Stage I',   short: 'Ⅰ期', desc: '体表出现零星结晶，体检可检出。日常活动不受限。' },
    { id: 2, name: 'Ⅱ期',   en: 'Stage II',  short: 'Ⅱ期', desc: '结晶扩散至肢体与内脏周边，间歇性剧痛，体力明显下降。' },
    { id: 3, name: 'Ⅲ期',   en: 'Stage III', short: 'Ⅲ期', desc: '结晶侵入主要脏器，器官功能持续衰竭，预期生存以年计。' }
  ];

  /** 结晶率 0..100 的分期门槛：Ⅰ期 0-25，Ⅱ期 25-60，Ⅲ期 60-100 */
  const STAGE_GATE = [0, 25, 60, 100];

  TL.oriStageOf = function (crystal) {
    if (crystal >= STAGE_GATE[2]) return 3;
    if (crystal >= STAGE_GATE[1]) return 2;
    if (crystal > 0) return 1;
    return 0;
  };
  /** 分期的显示名：按当前界面语言取（见 region.js 的 TL.nameOf） */
  TL.oriStageName = function (stage) {
    return TL.nameOf(TL.ORI_STAGES[stage] || TL.ORI_STAGES[0]);
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
    k *= 1 + TL.artRank(S) * 0.07;                        // 技艺适应性高 = 对源石更「敏感」
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

    return TL.clamp(p, 0, 0.55);
  };

  /**
   * 判定是否感染。所有感染路径都必须走这里 ——
   * 否则会出现绕过校准的旁路，让终生感染率远远偏离设定。
   */
  TL.tryInfect = function (S, k) {
    let p = TL.oriRisk(S);
    if (p <= 0) return false;
    if (k && k > 0) p = TL.clamp(p * k, 0, 0.65);
    if (!TL.chance(p)) return false;
    TL.infect(S);
    return true;
  };

  /* ---------------------------------------------------------------------- */
  /* 感染                                                                   */
  /* ---------------------------------------------------------------------- */
  TL.infect = function (S, silent) {
    const ar = TL.artRank(S);
    S.ori = {
      at: S.age,
      stage: 1,
      crystal: TL.range(4, 14),
      treated: false,
      known: false,
      art: ar >= 2,
      provider: null
    };
    S.ori.stage = TL.oriStageOf(S.ori.crystal);

    // 感染后源石技艺适应性上升 —— 代价与馈赠同时到来
    S.arts = TL.clamp(S.arts + (6 + ar * 4 + TL.range(0, 8)), 0, 100);

    TL.eff(S, { h: -18, hl: -6 });
    if (!silent) {
      TL.log(S, TL.L`你的手指上出现了一小块黑色的结晶。它不疼，但你盯着它看了很久。`, 'ori', { key: 'infect' });
    }
    S.flags.infectedAt = S.age;
    return S.ori;
  };

  /* ---------------------------------------------------------------------- */
  /* 年度推进                                                               */
  /* ---------------------------------------------------------------------- */
  TL.oriYear = function (S) {
    if (!S.ori || S.ori.stage <= 0) return;

    const ar = TL.artRank(S);
    const o = S.ori;
    const ti = TL.tolInfo(S.nation, S.year);

    let grow = 2.4;
    grow *= 1 + ar * 0.22;                    // 技艺越强，源石越活跃
    grow *= [1, 1.0, 1.35, 1.6][o.stage];     // 晚期加速
    grow *= 1 + (3 - S.q) * 0.10;
    grow *= 1.6 - S.st.hl / 140;
    // 低容忍度国家：药物流入被禁，结晶推进更快
    grow *= 1 + (1 - ti.lifeK) * 0.55;

    if (o.treated) {
      grow *= (o.provider === 'rhodes' ? 0.26 : 0.50);
      const cost = TL.NATION_BY_ID[S.nation].ppp * (o.provider === 'rhodes' ? 2.6 : 1.2);
      if (S.money >= cost) S.money -= cost;
      else { o.treated = false; o.provider = null; S.flags.oriLapsed = S.age; }
    }

    o.crystal = TL.clamp(o.crystal + grow * TL.range(0.75, 1.3), 0, 100);

    const ns = TL.oriStageOf(o.crystal);
    if (ns > o.stage) {
      o.stage = ns;
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
