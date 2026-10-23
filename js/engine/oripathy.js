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
  /* 只保留会改状态的部分                                                     */
  /* ---------------------------------------------------------------------- */
  // 分期、终生/年度风险、污名、倾向、战力、治疗可及性都已迁到               
  // src/model/oripathy.ts；这一层只留下真正写状态的 infect / oriYear，       
  // 它们通过 TL.* 调用已迁的函数。                                          

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

    const o = S.ori;
    // 成长倍率（技艺/分期/家境/体质/国家容忍）在 src/model/oripathy.ts。
    let grow = TL.crystalGrowth(S);

    if (o.treated) {
      grow *= TL.treatmentSuppression(o.provider);
      const cost = TL.treatmentCost(TL.NATION_BY_ID[S.nation].ppp, o.provider);
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

})(window.TL = window.TL || {});
