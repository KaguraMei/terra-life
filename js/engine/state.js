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
  TL.drawWealth = function (nationId, raceId, rnd) {
    // 用户约定：正常阿戈尔海底城均富。种族不会把公共保障挤回贫富两端。
    if (nationId === 'AEG') return 4;
    const n = TL.NATION_BY_ID[nationId];
    const r = TL.RACE_BY_ID[raceId];
    // 国家基尼越高，两极越厚、中间越薄
    const gi = n.gi;
    let roll = rnd();
    // 用 Beta 形状近似：基尼高 → U 形
    const mid = 1 - gi;                        // 中间层的相对厚度
    let q;
    if (roll < (1 - mid) / 2) q = 1;            // 底层
    else if (roll > 1 - (1 - mid) / 2) q = 5;   // 顶层
    else {
      // 中间三层按正态分布划
      const u = (roll - (1 - mid) / 2) / mid;
      q = u < 0.42 ? 2 : u < 0.78 ? 3 : 4;
    }
    // 种族地位修正：+1 地位 ≈ 向上抬半档
    const bump = r.stand * 0.42 + (rnd() - 0.5);
    if (bump > 0.9 && q < 5) q++;
    else if (bump < -0.9 && q > 1) q--;
    return TL.clamp(q, 1, 5);
  };

  /* ---------------------------------------------------------------------- */
  /* 源石技艺适应性 arts（0-100）                                            */
  /* 泰拉特有的天赋维度：决定技艺的广度、学习速度与使用上限；先天适应性     */
  /* 不等同于病情，感染后进展另由血液负担、治疗和健康状态共同决定。          */
  /* ---------------------------------------------------------------------- */
  TL.drawArts = function (nationId, raceId, rnd) {
    const n = TL.NATION_BY_ID[nationId];
    const r = TL.RACE_BY_ID[raceId];
    // 国别影响教育机会；先天适应性不因国籍直接增加。
    let base = 20 + (r.mod.art || 0) * 3.0;
    // 个体差异：三均匀分布近似正态
    base += (rnd() + rnd() + rnd() - 1.5) * 22;
    // 极小概率的「天生异禀」
    if (rnd() < 0.012) base += 28 + rnd() * 20;
    return Math.round(TL.clamp(base, 2, 99));
  };

  /* ---------------------------------------------------------------------- */
  /* 源石技艺原型                                                            */
  /* ---------------------------------------------------------------------- */
  /*
   * PRTS 的干员技艺名称极多，但在人生模拟里不需要为每位干员复制一套
   * 规则。这里保存“能量/作用原型”：具体技艺只需映射到一个或两个原型，
   * 事件再用场景标签寻找可用的原型。这样既保留点火、反重力、电、铝热
   * 剑等差异，也不会把事件表膨胀成干员名单。
   */
  TL.ARTS_TYPES = {
    // school 对应《源石技艺》列出的宽泛理论派系；type 是可以继续扩充的
    // 实际能力原型。新增干员技艺时，优先复用 tags，而不是新增专属规则。
    ignition:       { name: '点火与热能', en: 'Ignition / heat', school: 'conversion', tags: ['heat', 'burn', 'area'] },
    gravity:        { name: '重力与反重力', en: 'Gravity / anti-gravity', school: 'conjuration', tags: ['force', 'mobility', 'control'] },
    electricity:    { name: '电与电磁', en: 'Electricity / electromagnetic', school: 'conversion', tags: ['electric', 'stun', 'power'] },
    thermite_blade: { name: '铝热切割', en: 'Thermite cutting', school: 'conversion', tags: ['heat', 'cut', 'armor'] },
    barrier:        { name: '屏障与防护', en: 'Barrier / protection', school: 'conjuration', tags: ['defense', 'barrier'] },
    perception:     { name: '感知与侦测', en: 'Perception / detection', school: 'telepathy', tags: ['detect', 'scouting'] },
    kinetic:        { name: '动能与冲击', en: 'Kinetic force', school: 'conjuration', tags: ['force', 'impact', 'repel'] },
    restoration:    { name: '恢复与疗愈', en: 'Restoration / healing', school: 'healing', tags: ['heal', 'stabilize'] },
    frost:          { name: '冷却与冻结', en: 'Cooling / frost', school: 'conversion', tags: ['cold', 'slow', 'control'] },
    transmutation:  { name: '塑形与重构', en: 'Shaping / transmutation', school: 'shaping', tags: ['shape', 'repair', 'material'] },
    physiology:     { name: '生理强化与调节', en: 'Physiology / enhancement', school: 'physiology', tags: ['body', 'reflex', 'stabilize'] }
  };
  TL.ARTS_TYPE_IDS = Object.keys(TL.ARTS_TYPES);

  function pickArtsType(rnd, nationId, raceId) {
    const n = TL.NATION_BY_ID[nationId] || {};
    const r = TL.RACE_BY_ID[raceId] || {};
    const bias = [];
    for (const id of TL.ARTS_TYPE_IDS) {
      let w = 1;
      if (id === 'perception' || id === 'transmutation') w += (n.edu || 0) / 20;
      if (id === 'ignition' || id === 'frost') w += (n.cat || 0) * 0.8;
      if (id === 'gravity' || id === 'kinetic') w += Math.max(0, (r.mod && r.mod.hl) || 0) / 30;
      if (id === 'electricity') w += (n.art || 0) * 0.25;
      bias.push({ id, w });
    }
    const total = bias.reduce((s, x) => s + x.w, 0);
    let x = rnd() * total;
    for (const item of bias) { x -= item.w; if (x <= 0) return item.id; }
    return bias[bias.length - 1].id;
  }

  TL.drawArtsProfile = function (nationId, raceId, arts, rnd) {
    rnd = rnd || TL.rnd;
    const primary = pickArtsType(rnd, nationId, raceId);
    let secondary = null;
    if (rnd() < 0.30) {
      secondary = pickArtsType(rnd, nationId, raceId);
      if (secondary === primary) secondary = TL.ARTS_TYPE_IDS[(TL.ARTS_TYPE_IDS.indexOf(primary) + 1) % TL.ARTS_TYPE_IDS.length];
    }
    const affinity = TL.clamp(0.18 + (arts || 0) / 125, 0.18, 0.98);
    const training = {};
    for (const id of TL.ARTS_TYPE_IDS) training[id] = 0;
    training[primary] = Math.round(6 + affinity * 18);
    if (secondary) training[secondary] = Math.round(3 + affinity * 10);
    return {
      primary, secondary, affinity,
      training,
      control: Math.round(TL.clamp(28 + affinity * 22 + rnd() * 18, 18, 82)),
      fatigue: 0,
      uses: 0,
      lastType: null,
      lastAge: null
    };
  };

  TL.ensureArtsProfile = function (S) {
    if (S.artsProfile && S.artsProfile.primary && S.artsProfile.training) return S.artsProfile;
    S.artsProfile = TL.drawArtsProfile(S.nation, S.race, S.arts || 0, TL.rnd);
    return S.artsProfile;
  };

  TL.trainArts = function (S, type, amount) {
    const p = TL.ensureArtsProfile(S);
    const id = TL.ARTS_TYPES[type] ? type : p.primary;
    p.training[id] = TL.clamp((p.training[id] || 0) + (amount || 0), 0, 100);
    p.control = TL.clamp((p.control || 0) + Math.max(0, amount || 0) * 0.12, 0, 100);
    return p.training[id];
  };

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
  /**
   * 给 NPC（父母 / 兄弟姐妹 / 伴侣）抽一个符合国别与性别的成年职业。
   * 只用 TL.JOBS 里的 only / sex 限制做过滤，不参与玩家的收入模型，
   * 所以不必精确 —— 它只是「家人与生活」那一栏里的一行字。
   */
  const NPC_POOL = [
    'farm', 'farmhand', 'herder', 'fisher', 'hunter', 'agbiz',
    'miner', 'oriminer', 'refiner', 'factory', 'construct', 'smith', 'mechanic', 'engineer',
    'vendor', 'shop', 'cook', 'driver', 'courier', 'inn', 'tailor', 'barber',
    'domestic', 'performer', 'teacher', 'clerk', 'nurse', 'doctor',
    'scholar', 'journalist', 'lawyer', 'banker', 'official',
    'soldier', 'guard', 'police', 'mercenary', 'bounty',
    'artsmith', 'caster', 'alchemist', 'witch', 'merchant', 'shopowner', 'noble'
  ];
  function npcJob(nationId, sex, raceId) {
    for (let i = 0; i < 24; i++) {
      const id = NPC_POOL[Math.floor(TL.rnd() * NPC_POOL.length)];
      const J = TL.JOBS[id];
      if (!J) continue;
      if (!TL.jobAvailable(id, nationId, raceId)) continue;
      if (J.sex && J.sex !== sex) continue;
      // 重装 / 战斗类职业对平民来说太少见了，降权
      if (J.sec === 'mil' && TL.rnd() < 0.82) continue;
      if (J.sec === 'art' && TL.rnd() < 0.7) continue;
      return id;
    }
    return TL.jobAvailable('vendor', nationId, raceId) ? 'vendor' : 'seeking';
  }

  /**
   * 年龄 → 家人那一栏该显示的「职业」。
   * 家人与生活是常驻面板，职业必须随年龄自己变，
   * 否则会出现「兄弟姐妹 32 岁 · 幼儿」这种一眼假的条目。
   */
  TL.ageJob = function (nationId, sex, age, raceId) {
    if (age < 7) return 'child';
    if (age < 16) return 'student';
    if (age > 66 && TL.chance(0.7)) return 'retired';
    return npcJob(nationId, sex, raceId);
  };
  TL.npcJobOf = function (nationId, sex, raceId) { return npcJob(nationId, sex, raceId); };

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
    const bornYear = (o.bornYear && o.bornYear > 900) ? (o.bornYear | 0)
      : (TL.drawBirthYear ? TL.drawBirthYear(TL.rnd) : 1085);
    const place = TL.drawPlace(nationId, bornYear, TL.rnd, o.placeId);
    const q0 = TL.drawWealth(nationId, raceId, TL.rnd);
    const stratum = TL.placeStratum(place, q0, TL.rnd);
    const urban = TL.stratum(stratum).urban;

    /* --- ⑥ 家庭财富分位 --- */
    const q = q0;

    /* --- ⑦ 姓名与城市 --- */
    const nm = TL.makeName(nationId, sex, raceId);
    const city = TL.placeName(place, bornYear);

    /* --- ⑧ 天赋 --- */
    const arts = TL.drawArts(nationId, raceId, TL.rnd);
    const artsProfile = TL.drawArtsProfile(nationId, raceId, arts, TL.rnd);

    /* --- ⑨ 父母 --- */
    const momAge = Math.round(TL.clamp(
      TL.range(19, 38) + (q - 3) * 1.6, 16, 45));
    const dadAge = Math.round(momAge + TL.range(1, 6));

    /* --- ⑨b 兄弟姐妹 ---
       原作右栏有「家人與生活」一栏，列出母亲 / 父亲 / 兄弟姊妹的年龄与职业。
       兄弟姐妹在出生时就已存在（年长的会比自己大），往后逐年共同衰老。 */
    const sibs = [];
    const nSib = TL.wpick({ 0: 22, 1: 34, 2: 26, 3: 13, 4: 5 });
    for (let i = 0; i < nSib; i++) {
      const ssex = TL.rnd() < 0.5 ? 'M' : 'F';
      // 年长或年幼：以母亲生育年龄为锚，避免出现"姐姐比妈还大"
      const older = TL.rnd() < 0.5;
      const gap = 1 + Math.floor(TL.rnd() * 7);
      const a = older ? gap : -gap;
      if (momAge + a > 46 || momAge + a < 15) continue;
      sibs.push({
        name: TL.givenName(nationId, ssex, raceId),
        sex: ssex, rel: older ? 'elder' : 'younger',
        age: a, alive: true,
        job: a >= 16 ? npcJob(nationId, ssex, raceId) : (a >= 6 ? 'student' : 'child')
      });
    }
    sibs.sort((x, y) => y.age - x.age);

    /* --- ⑩ 生命表 --- */
    // 生理极限由种族（或王庭血脉）决定，社会预期寿命由阶层决定，两者分开算。
    const lt = TL.lifeTable(n, sex, raceId, court ? court.id : null, stratum);
    const lifeMax = TL.lifeMaxOf(raceId, court ? court.id : null);

    /* --- ⑪ 初始四维 --- */
    // 关键：家境与国别决定起点，但「起点不等于终点」
    const st = {
      hl: TL.clamp(62 + r.mod.hl * 1.4 + (q - 3) * 4 + (n.med - 0.6) * 12 + TL.range(-8, 8), 15, 96),
      h:  TL.clamp(56 + r.mod.h * 1.2 + (3 - Math.abs(q - 3)) * 2 + TL.range(-8, 8), 15, 96),
      sm: TL.clamp(18 + (q - 1) * 7 + n.edu * 0.9 + r.mod.sm * 1.2 + TL.range(-6, 10), 2, 92),
      so: TL.clamp(52 + r.mod.so * 1.2 + TL.range(-8, 8), 15, 96)
    };
    // 王庭加成
    if (court && court.mod) {
      for (const k in court.mod) st[k] = TL.clamp(st[k] + court.mod[k] * 1.2, 0, 100);
    }

    /* --- ⑫ 组装状态 --- */
    const S = {
      /* 身份 */
      nation: nationId,
      birthNation: nationId,
      birthPlace: TL.placeSnapshot(place, bornYear),
      residence: TL.placeSnapshot(place, bornYear),
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
      // arts 是历史兼容的总体技艺值；affinity 是出生时抽定的先天亲和度，
      // training/control 则记录具体方向的后天训练与操控能力。
      artsProfile: artsProfile,
      ori: null,          // 矿石病 {at, stage(按血液密度), crystal(融合率), bloodDensity, exposure, organLoad, treated, known, art}

      /* 经济 */
      money: 0,
      pct: 0,             // 收入分位 0..1
      debt: 0,
      income: 0,
      retirementPension: null,

      /* 家庭 */
      fam: {
        mom: { alive: true, age: momAge, name: TL.givenName(nationId, 'F', raceId), job: npcJob(nationId, 'F', raceId) },
        dad: { alive: true, age: dadAge, name: TL.givenName(nationId, 'M', raceId), job: npcJob(nationId, 'M', raceId) },
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
    S.stratumCode = stratum.substr(0, 3).toUpperCase();
    S.cityName = city;                     // 兼容旧字段名
    /* 泰拉历：出生年份从年表区间里抽，不是固定值。
       你没法选择自己生在哪个时代 —— 这本来就是这游戏的第一条规则。 */
    S.bornYear = bornYear;
    S.year = S.bornYear;
    if (TL.initUpbringing) TL.initUpbringing(S);
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

  /**
   * 原作的做法：把「预期寿命」映射到播放时长，所以 yearSec 是因人而异的。
   * 一个预期活到 60 岁的人和一个活到 85 岁的人，同样的 1 小时里
   * 前者每年分到的时间更多。
   *
   * 【本作扩展：时间压缩】
   * 萨卡兹王庭血脉的生理极限可达数百年。如果线性播放，
   * 一个巫妖活 800 年就要玩 8 小时。所以把「模拟年龄」映射到「主观年数」：
   * 60 岁之前一一对应，之后按对数压缩。
   * 这既解决了时长问题，也正好对应设定里长生种对漫长岁月的模糊感受 ——
   * 活到第三百年的那一年，和第七岁那一年，在记忆里本来就不一样长。
   */
  TL.yearSecFor = function (S) {
    const p = TL.PACES[S.paceKey] || TL.PACES.normal;
    const span = Math.max(20, TL.playAge(Math.max(30, S.lt.e0)));
    return (p.min * 60) / span * TL.playAgeDeriv(S.age);
  };

  TL.applyPace = function (S, paceKey) {
    if (paceKey) S.paceKey = paceKey;
    S.yearSec = TL.yearSecFor(S);
    return S;
  };

  /* ---------------------------------------------------------------------- */
  /* 记录与旁白                                                             */
  /* ---------------------------------------------------------------------- */
  /**
   * 写入一条人生记录。
   * 对应原作的 log / logA / logD。
   *   kind: 'birth' 'ev' 'dec' 'mil' 'death' 'sys'
   */
  TL.narrate = function (S, text, kind, extra) {
    const e = {
      age: S.age,
      year: S.year,
      text: text,
      kind: kind || 'ev'
    };
    if (extra) for (const k in extra) e[k] = extra[k];
    S.log.push(e);
    if (S.log.length > 4000) S.log.splice(0, 500);
    return e;
  };

  /** 简写：剧情旁白 */
  TL.log = function (S, text, kind, extra) { return TL.narrate(S, text, kind || 'ev', extra); };

  /* ---------------------------------------------------------------------- */
  /* 四维变化：对应原作的 eff()                                              */
  /* ---------------------------------------------------------------------- */
  TL.eff = function (S, d) {
    for (const k of ['hl', 'h', 'so']) {
      if (d[k]) S.st[k] = TL.clamp(S.st[k] + d[k], 0, 100);
    }
    if (d.sm) S.st.sm = TL.clamp(S.st.sm + d.sm, 0, 100);
    if (d.money) S.money += d.money;
    if (d.arts) S.arts = TL.clamp(S.arts + d.arts, 0, 100);
    return d;
  };

  /* ---------------------------------------------------------------------- */
  /* 人生阶段：对应原作的 stage()                                            */
  /* ---------------------------------------------------------------------- */
  TL.stage = function (S) {
    const a = S.age;
    if (a < 6) return 'baby';
    if (S.serveLeft > 0) return 'service';
    if (S.school) return 'school';
    if (a < 15) return 'kidwork';
    if (a >= 65 || S.flags.retired) return 'elder';
    return 'adult';
  };

  /** 人生阶段的中文名（键与 TL.stage() 的返回值一致） */
  TL.STAGE_NAME = {
    baby: '幼年', service: '服役', school: '求学',
    kidwork: '童工', elder: '晚年', adult: '成年'
  };

  /** 人生阶段的英文名，与上表一一对应 */
  TL.STAGE_NAME_EN = {
    baby: 'Childhood', service: 'Service', school: 'Schooling',
    kidwork: 'Child Labour', elder: 'Old Age', adult: 'Adulthood'
  };

  /**
   * 人生阶段的显示名：TL.lang === 'en' 时返回英文，否则中文。
   * 原来这里是 TL.stageName[...] 一张对象表，改成函数是为了让
   * 「按语言取名字」只发生在一处，调用点不必各自判断。
   * 未知的 stage 键一律按「成年」处理，不会中英混着回。
   */
  TL.stageName = function (stg) {
    const k = TL.STAGE_NAME[stg] ? stg : 'adult';
    return TL.lang === 'en' ? TL.STAGE_NAME_EN[k] : TL.STAGE_NAME[k];
  };

  /* ---------------------------------------------------------------------- */
  /* 收入分位：本作经济模型的核心                                            */
  /* ---------------------------------------------------------------------- */
  /**
   * 收入 = 国家产出 × 职业倍数 × 学历/经验/技艺加成 × 歧视折损
   * pct = 该收入在大陆全体人口中的分位（0..1），用于死亡率的贫富梯度
   */
  TL.computeIncome = function (S) {
    if (TL.syncOrganization) TL.syncOrganization(S);
    const n = TL.NATION_BY_ID[S.nation];
    const J = TL.JOBS[S.job];
    // 组织退休待遇是离职时锁定的税后月额，来源于最后一份合同薪资；
    // 已含当时的职级、歧视和家境修正，因此不能再叠乘这些修正。
    const pensionAmount = S.job === 'retired' && S.retirementPension &&
      Number.isFinite(S.retirementPension.monthlyAmount)
      ? Math.max(0, S.retirementPension.monthlyAmount) : null;
    let base;
    if (J) {
      // 职业收入区间：按学历与经验在 lo..hi 之间插值
      const exp = TL.clamp((S.age - 18) / 30, 0, 1);
      const eduK = TL.clamp(S.eduLevel / 4, 0, 1);
      const t = TL.clamp(0.35 * eduK + 0.45 * exp + 0.20 * (S.st.sm / 100), 0, 1);
      base = n.ppp * (J.lo + (J.hi - J.lo) * t);
      // 干员阶级加成
      if (J.cls && S.opRank > 0) base *= TL.OP_RANKS[S.opRank].pay;
      if (TL.organizationPayMultiplier) base *= TL.organizationPayMultiplier(S);
    } else if (S.job === 'retired') {
      base = pensionAmount == null ? n.ppp * 0.45 : pensionAmount;
    } else if (S.job === 'child' || S.job === 'student') {
      base = n.ppp * 0.10;
    } else {
      base = n.ppp * 0.25;
    }
    // 歧视折损：同样的工作，异族/感染者拿得更少
    if (pensionAmount == null) {
      const d = TL.discrimination(S) + (S.ori && S.ori.stage > 0 ? 0.22 : 0);
      base *= 1 - TL.clamp(d, 0, 0.75) * 0.42;
      // 家境惯性：出身好的人起点高
      base *= 1 + (S.q - 3) * 0.06;
    }
    // 均富城市：公共供给之外仍有个人资源差异，但不沿用贫富悬殊的工资倍率。
    if (TL.placeHas?.(S, 'materialGuarantee') && !S.affiliation && pensionAmount == null) {
      base = n.ppp * (S.age < 18 ? 0.1 : TL.clamp(base / n.ppp, 0.45, 0.65));
    }
    S.income = Math.max(0, base);
    S.subsistenceAnnual = TL.organizationSubsistence ? TL.organizationSubsistence(S) : 0;
    /* 分位：把月收入映射到 0..1。
       对数尺度是对的（收入本来就是对数分布），但**锚点必须覆盖真实区间**：
       早先的写法是 log(income/0.35)/log(8)，也就是月收入 ≥ 2.8 一律算 100%。
       实测月收入能到 9 以上，于是 17% 的人全部钉在 100% ——
       这个数字在高端完全失去信息量，「大陆收入分位 100%」既可能是
       一个干员，也可能是整个大陆最富的人。
       现在的锚点取自模拟出来的实际分布（P10≈0.17 / P50≈0.5 / P90≈4.9 / max≈9.3），
       低端 0.05、高端 15，两端各留余量，中位数落在 42% 附近。 */
    // 实物口粮只计入生活保障，不进入现金收入或资产。
    const x = Math.log(Math.max(0.05, S.income + S.subsistenceAnnual / 12) / 0.05) / Math.log(300);
    S.pct = TL.clamp(x, 0, 1);
    return S.income;
  };

  /* ---------------------------------------------------------------------- */
  /* 净资产（原作 netWorth）                                                 */
  /* ---------------------------------------------------------------------- */
  TL.netWorth = function (S) {
    let w = S.money;
    if (S.flags.homeValue) w += S.flags.homeValue;
    if (S.flags.carValue) w += S.flags.carValue;
    if (S.flags.rentals) w += S.flags.rentals * (S.flags.rentalValue || 0);
    w -= S.debt;
    return w;
  };

})(window.TL = window.TL || {});
