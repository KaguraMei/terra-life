/* ==========================================================================
 * TERRA LIFE SIM — 状态与角色创建
 * 对应原作的 newLife / chooseCountry / clusterFor / makeName / lifeTable 调用链
 * ========================================================================== */
(function (TL) {
  'use strict';

  /** 全局状态：对应原作的 S */
  TL.S = null;

  /* ---------------------------------------------------------------------- */
  /* 家庭财富分位 q（1=赤贫 2=贫困 3=温饱 4=小康 5=富裕）                     */
  /* 原作里 q 由「种族地位 + 王庭 + 种姓」共同决定，本作加上「矿石病身份」    */

  /* ---------------------------------------------------------------------- */
  /* 源石技艺适应性 arts（0-100）                                            */
  /* 泰拉特有的天赋维度：决定你能不能成为术师/医疗/辅助，也决定感染后       */
  /* 恶化得更快还是更慢。原作没有这一维，是本作的核心扩展。                  */

  /* ---------------------------------------------------------------------- */
  /* 创建一生                                                               */
  /* ---------------------------------------------------------------------- */
  /**
   * @param {object} o
   *   o.mode   'birth'（此刻出生的婴儿）| 'pop'（此刻生活的人）
   *   o.nation 指定国家 id（可选）
   *   o.sex    指定性别（可选）
   *   o.race   指定种族（可选）
   *   o.seed   随机种子（可选）
   *   o.pace   播放节奏：'short'=30min 'normal'=60min 'long'=90min
   */
  /* 家人职业与年龄映射（npcJob / ageJob / siblingCount）已迁入 src/model/family.ts： */
  /* 军队与艺术职业的降权、24 次尝试与兜底都在那里，装配层只负责注入随机源。         */


  TL.newLife = function (o) {
    o = o || {};
    if (o.seed != null) TL.seedRng(o.seed); else TL.unseedRng();

    const mode = o.mode || 'birth';

    /* --- ① 国家抽签（加权） --- */
    const nationId = o.nation && TL.NATION_BY_ID[o.nation]
      ? o.nation
      : TL.wpick(TL.buildLottery(mode));
    const n = TL.NATION_BY_ID[nationId];

    /* --- ② 性别 --- */
    const sex = (o.sex === 'M' || o.sex === 'F')
      ? o.sex
      : (TL.chance(TL.sexRatio(nationId)) ? 'M' : 'F');

    /* --- ③ 种族 --- */
    const raceId = o.race && TL.RACE_BY_ID[o.race] ? o.race : TL.drawRace(nationId, TL.rnd);
    const r = TL.RACE_BY_ID[raceId];
    const traits = Object.assign({}, o.traits || {});
    if (raceId === 'aegir') {
      const chance = r.traits?.underwaterBreathingChance ?? 0;
      if (typeof traits.underwaterBreathing !== 'boolean') {
        traits.underwaterBreathing = TL.chance(chance);
      }
    } else {
      delete traits.underwaterBreathing;
    }

    /* --- ④ 萨卡兹王庭 --- */
    const court = raceId === 'sarkaz' ? TL.drawCourt(TL.rnd) : null;

    /* --- ⑤ 阶层 / 居住区域 --- */
    // 这是泰拉最残酷的分野：在城墙的哪一侧，比你生在哪个国家更决定命运。
    // 宏观上约 45% 的人住在移动城市里，55% 在荒野。
    const q0 = TL.drawWealth(nationId, raceId, TL.rnd);
    const stratum = TL.drawStratum(nationId, q0, TL.rnd);
    const urban = TL.stratum(stratum).urban;

    /* --- ⑥ 家庭财富分位 --- */
    const q = q0;

    /* --- ⑦ 姓名与城市 --- */
    const nm = TL.makeName(nationId, sex, raceId);
    const city = TL.cityOf(nationId);

    /* --- ⑧ 天赋 --- */
    const arts = TL.drawArts(nationId, raceId, TL.rnd);

    /* --- ⑨ 父母 --- */
    // 家境让生育年龄后移；顺序是 range(19,38) → range(1,6)，见 src/model/nativity.ts。
    const { momAge, dadAge } = TL.parentAges(q);

    /* --- ⑨b 兄弟姐妹 ---
       原作右栏有「家人與生活」一栏，列出母亲 / 父亲 / 兄弟姊妹的年龄与职业。
       兄弟姐妹在出生时就已存在（年长的会比自己大），往后逐年共同衰老。 */
    const sibs = [];
    const nSib = TL.siblingCount();
    for (let i = 0; i < nSib; i++) {
      // 性别 → 年长/年幼 → 年龄差：顺序在 src/model/family.ts 里，抽取在这里。
      const shape = TL.siblingShape();
      if (TL.siblingOutOfRange(shape.offset, momAge)) continue;
      sibs.push({
        name: TL.givenName(nationId, shape.sex, raceId),
        sex: shape.sex, rel: shape.elder ? 'elder' : 'younger',
        age: shape.offset, alive: true,
        job: shape.offset >= 16 ? TL.npcJobOf(nationId, shape.sex, raceId)
          : (shape.offset >= 6 ? 'student' : 'child')
      });
    }
    sibs.sort((x, y) => y.age - x.age);

    /* --- ⑩ 生命表 --- */
    // 生理极限由种族（或王庭血脉）决定，社会预期寿命由阶层决定，两者分开算。
    const lt = TL.lifeTable(n, sex, raceId, court ? court.id : null, stratum);
    const lifeMax = TL.lifeMaxOf(raceId, court ? court.id : null);

    /* --- ⑪ 初始四维 --- */
    // 关键：家境与国别决定起点，但「起点不等于终点」。抽取顺序与公式在
    // src/model/nativity.ts：hl → h → sm → so，之后叠加王庭加成。
    const st = TL.initialStats(nationId, raceId, court, q);

    /* --- ⑫ 组装状态 --- */
    const S = {
      /* 身份 */
      nation: nationId,
      race: raceId,
      court: court ? court.id : null,
      courtName: court ? court.name : null,
      sex: sex,
      name: nm.given,
      surname: nm.surname,
      fullName: nm.full,
      nameOrder: nm.order,
      city: city,
      urban: urban,
      q: q,
      stratum: stratum,               // 阶层 / 居住区域
      lifeMax: lifeMax,               // 生理极限寿命区间（种族决定）

      /* 时间 */
      age: 0,
      t: 0,
      year: 0,
      speed: 1,
      yearSec: 60,        // 每模拟年的真实秒数（60 分钟跑完一生）
      paceKey: 'normal',
      paused: false,
      phase: 'life',
      pending: null,      // 待决策
      queue: [],          // 年内事件队列

      /* 四维 + 天赋 */
      st: st,
      arts: arts,
      ori: null,          // 矿石病 {at, stage, crystal, treated, known, art}

      /* 经济 */
      money: 0,
      pct: 0,             // 收入分位 0..1
      debt: 0,
      income: 0,
      retirementPension: null,

      /* 家庭 */
      fam: {
        mom: { alive: true, age: momAge, name: TL.givenName(nationId, 'F', raceId), job: TL.npcJobOf(nationId, 'F', raceId) },
        dad: { alive: true, age: dadAge, name: TL.givenName(nationId, 'M', raceId), job: TL.npcJobOf(nationId, 'M', raceId) },
        partner: null,
        married: false,
        kids: [],
        sibs: sibs
      },

      /* 教育 / 职业 */
      school: null,
      eduLevel: 0,
      job: 'child',
      opClass: null,
      opRank: 0,
      serveLeft: 0,

      /* 组织归属独立于谋生职业；orgApplication 保存多轮面试会话。 */
      affiliation: null,
      orgSchema: 1,
      orgRoute: null,
      orgRank: 0,
      orgService: 0,
      orgJoinedAt: null,
      orgHistory: [],
      orgContacts: {},
      orgCooldowns: {},
      orgApplication: null,
      orgInterviewHistory: [],
      orgInterviewResult: null,

      /* 年度重心（对应原作 focus / fT） */
      focus: null,
      fT: {},

      /* 行为 */
      smoker: false,
      alc: false,
      drug: false,
      refugee: false,
      hobbies: [],
      conds: {},          // 慢性病
      traits: traits,

      /* 记录 */
      log: [],
      flags: {},
      evCount: {},        // 每个事件在一生中已发生的次数（配合 events.js 的 max 上限）
      recent: [],
      stats: { years: [] },
      milestones: [],
      focusW: {},

      /* 生命表 */
      lt: lt
    };

    /* --- ⑫b 界面需要的派生字段（渲染层只读，不再自己算） --- */
    const _st = TL.stratum(stratum);
    S.stratumName = _st.name;
    S.stratumCode = TL.stratumCode(stratum);
    S.cityName = city;                     // 兼容旧字段名
    /* 泰拉历：出生年份从年表区间里抽，不是固定值。
       你没法选择自己生在哪个时代 —— 这本来就是这游戏的第一条规则。 */
    S.bornYear = (o.bornYear && o.bornYear > 900) ? (o.bornYear | 0)
      : (TL.drawBirthYear ? TL.drawBirthYear(TL.rnd) : 1085);
    S.year = S.bornYear;
    if (TL.timelineBackstory) TL.timelineBackstory(S);
    if (TL.timelineLegend) TL.timelineLegend(S);
    // 像素场景的种子：同一个人的场景在一生中保持同一套构图，
    // 只有国家 / 阶层 / 阶段 / 天灾 / 感染变化时才会换画面。
    S.sceneSeed = (Math.floor(TL.rnd() * 0xffffffff)) >>> 0;
    if (TL.makeCohort) TL.makeCohort(S);

    TL.S = S;
    TL.applyPace(S, o.pace || 'normal');

    /* --- ⑬ 开局旁白 --- */
    TL.narrate(S, TL.L`你出生在${n.name}的${city}。`, 'birth');
    /* --- ⑭ 为出生这一年排程事件 --- */
    if (typeof TL.scheduleEvents === 'function') TL.scheduleEvents(S);
    return S;
  };

  /* ---------------------------------------------------------------------- */
  /* 播放节奏：原作 30 / 60 / 90 分钟                          */
  /* ---------------------------------------------------------------------- */
  TL.PACES = {
    short:  { name: '约 30 分钟', min: 30 },
    normal: { name: '约 1 小时',  min: 60 },
    long:   { name: '约 1.5 小时', min: 90 }
  };


  TL.applyPace = function (S, paceKey) {
    if (paceKey) S.paceKey = paceKey;
    S.yearSec = TL.yearSecFor(S);
    return S;
  };

  /* 记录与四维变化（narrate / log / eff）已迁入 src/model/narrative.ts：      */
  /* 默认 kind、日志上限与"0 不生效"的语义由类型化模块负责，装配层负责写入。  */

})(window.TL = window.TL || {});
