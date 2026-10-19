/* ==========================================================================
 * TERRA LIFE SIM — 种族表
 * --------------------------------------------------------------------------
 * 泰拉的「种族」不是装饰：它决定你出生时的社会位置、被歧视的概率、
 * 源石技艺的天赋上限，以及你父母能给你什么。
 *
 * 字段：
 *   id     代号
 *   name   中文名
 *   en     英文名（界面语言为 en 时显示；官方译名优先，无官方译名的用音译并加注释）
 *   mod    { hl, h, sm, so, art } 出生时对四维与源石技艺适应的加成
 *   stand  社会地位基线 -3..+3  （-3 = 千年被追猎，+3 = 天生统治者）
 *   disc   基础歧视系数 0..1     （影响就学、就业、就医、婚配的通过率）
 *   ori    矿石病易感系数（身体对源石的亲和 = 更易感染也更擅长技艺）
 *   life   寿命修正（年）
 *   where  主要分布国家 id（用于「国家 × 种族」匹配度）
 *   desc   叙事描述
 * ========================================================================== */
(function (TL) {
  'use strict';

  TL.RACES = [
    /* ---- 常见种（「先民」与「神民」的后裔，遍布大陆） ---- */
    {
      id: 'feline', name: '菲林', en: 'Feline', mod: { hl: 0, h: 0, sm: 2, so: 2, art: 0 }, stand: 0, disc: 0.05, ori: 1.0, life: 0.4,
      where: ['VIC', 'CLB', 'KJR', 'YAN', 'LMN', 'SST', 'KAZ', 'SRG', 'MIN', 'SIR'],
      desc: '数量最多的种族之一，毛色与瞳色千差万别。没有人会因为你是菲林多看你一眼，这本身就是一种幸运。'
    },
    {
      id: 'perro', name: '佩洛', en: 'Perro', mod: { hl: 3, h: 2, sm: 0, so: 4, art: 0 }, stand: 0, disc: 0.05, ori: 0.9, life: 0,
      where: ['BLV', 'CLB', 'VIC', 'RMB', 'SST', 'KAZ'],
      desc: '嗅觉与听觉出众，群体感极强。玻利瓦尔的街头、哥伦比亚的矿区，到处都是佩洛。'
    },
    {
      id: 'lupo', name: '鲁珀', en: 'Lupo', mod: { hl: 5, h: -1, sm: 1, so: 2, art: 0 }, stand: 0, disc: 0.12, ori: 1.0, life: -0.3,
      where: ['SIR', 'URS', 'KDZ', 'YAN'],
      desc: '耐力与咬合力惊人，脾气通常比牙口更硬。叙拉古的家族很喜欢招鲁珀，也很喜欢处理鲁珀。'
    },
    {
      id: 'vulpo', name: '沃尔珀', en: 'Vulpo', mod: { hl: 1, h: 1, sm: 5, so: 2, art: 1 }, stand: 0.3, disc: 0.08, ori: 1.0, life: 0.5,
      where: ['SIR', 'LEI', 'HIG', 'KJR', 'CLB', 'VIC'],
      desc: '多尾，聪敏，擅长在别人的规则里找到裂缝。叙拉古十二家族里有六家的账房是沃尔珀。'
    },
    {
      id: 'kuranta', name: '库兰塔', en: 'Kuranta', mod: { hl: 8, h: 1, sm: 0, so: 1, art: 0 }, stand: 0.6, disc: 0.04, ori: 0.9, life: 0.2,
      where: ['KAZ', 'VIC', 'CLB', 'YAN'],
      desc: '四蹄生风，天生为冲刺而生。卡西米尔的骑士竞技场里，九成观众席上的欢呼是给库兰塔的。'
    },
    {
      id: 'cautus', name: '卡特斯', en: 'Cautus', mod: { hl: -3, h: 3, sm: 1, so: 3, art: 0 }, stand: -0.8, disc: 0.22, ori: 1.2, life: -0.5,
      where: ['RMB', 'CLB', 'YAN', 'LEI'],
      desc: '听觉与反射神经极佳，但身体单薄。雷姆必拓的矿道里，卡特斯的名字刻在最多的那一面墙上。'
    },
    {
      id: 'liberi', name: '黎博利', en: 'Liberi', mod: { hl: 1, h: 2, sm: 4, so: 1, art: 1 }, stand: 0.2, disc: 0.06, ori: 1.0, life: 0.6,
      where: ['LAT', 'IBE', 'YAN', 'KJR', 'LEI', 'KAZ', 'VIC', 'HIG'],
      desc: '有翼而不善久飞，视力极佳。黎博利做过骏鹰王国的主人，如今多数只是普通的邻人。'
    },
    {
      id: 'caprinae', name: '卡普里尼', en: 'Caprinae', mod: { hl: 2, h: 1, sm: 4, so: 0, art: 6 }, stand: 0.3, disc: 0.07, ori: 1.3, life: 0.2,
      where: ['LEI', 'VIC', 'KJR', 'MIN', 'YAN'],
      desc: '角形各异。莱塔尼亚的术师学院里，卡普里尼的比例高得不像巧合。'
    },
    {
      id: 'elafia', name: '埃拉菲亚', en: 'Elafia', mod: { hl: 4, h: 2, sm: 2, so: 1, art: 2 }, stand: 0.1, disc: 0.10, ori: 1.1, life: 0.8,
      where: ['SAMI', 'LEI', 'KJR', 'URS'],
      desc: '耐寒，耐走，耐沉默。萨米的雪祀大多出自埃拉菲亚，她们能听见雪底下的声音。'
    },
    {
      id: 'ursus', name: '乌萨斯', en: 'Ursus', mod: { hl: 10, h: -1, sm: -1, so: 0, art: 0 }, stand: 0.4, disc: 0.06, ori: 1.0, life: -0.6,
      where: ['URS', 'KJR', 'YAN'],
      desc: '高大，耐寒，酒量深不见底。乌萨斯的军人几乎清一色是乌萨斯族，这不是规定，是结果。'
    },
    {
      id: 'forte', name: '丰蹄', en: 'Forte', mod: { hl: 11, h: 1, sm: 0, so: 1, art: 0 }, stand: 0.5, disc: 0.05, ori: 0.9, life: 0.1,
      where: ['MIN', 'SRG', 'YAN'],
      desc: '力大而稳，角是荣耀的记号。米诺斯的十二英雄里有九个是丰蹄，剩下三个的雕像小一号。'
    },
    {
      id: 'oni', name: '鬼', en: 'Oni', mod: { hl: 9, h: -1, sm: 1, so: -2, art: 4 }, stand: -0.6, disc: 0.28, ori: 1.4, life: -0.4,
      where: ['HIG'],
      desc: '角与獠牙，天生带着让人后退的气场。东国八大家族的家徽上都有鬼的纹样，但家宴上没有鬼的席位。'
    },
    {
      id: 'aegir', name: '阿戈尔', en: 'Ægir', mod: { hl: 5, h: 0, sm: 9, so: -1, art: -2 }, stand: 0.8, disc: 0.30, ori: 0.3, life: 2.5,
      // 仅为本作的稀有个体特质；官方资料没有给出具备水下呼吸能力的比例。
      traits: { underwaterBreathingChance: 0.05 },
      where: ['AEG', 'IBE', 'HIG', 'SST'],
      desc: '阿戈尔分布于沿海与内陆水域附近，不同支系的体质各异；多数不具备水下呼吸能力。'
    },
    {
      id: 'durin', name: '杜林', en: 'Durin', mod: { hl: 3, h: 3, sm: 6, so: 1, art: 3 }, stand: 0.6, disc: 0.06, ori: 0.4, life: 1.8,
      where: ['DUR'],
      desc: '地下城邦的居民，个子不高，耐心极长。他们造的机械能连续运转四十年不用换一个零件。'
    },
    {
      id: 'savra', name: '萨弗拉', en: 'Savra', mod: { hl: 2, h: 2, sm: 3, so: 0, art: 2 }, stand: -0.1, disc: 0.11, ori: 1.1, life: 0.3,   // id 原为 zalak（札拉克，啮齿类），但 name 与 desc 都是萨弗拉，已改回 savra
      where: ['YAN', 'LMN', 'HIG', 'RMB', 'SRG', 'KDZ'],
      desc: '鳞与尾，冷血，耐饥。多出没于商路与港口——他们比谁都清楚哪里能藏东西。'
    },
    {
      id: 'anura', name: '安努拉', en: 'Anura', mod: { hl: -1, h: 4, sm: 2, so: 3, art: 1 }, stand: -0.2, disc: 0.13, ori: 1.1, life: 0.2,
      where: ['SRG', 'BLV', 'YAN'],
      desc: '皮肤需要湿气，体温随环境走。萨尔贡的绿洲边，安努拉的村落总是最先亮灯也最先熄灯。'
    },
    {
      id: 'petram', name: '匹特拉姆', en: 'Petram', mod: { hl: 7, h: 1, sm: 0, so: 0, art: 0 }, stand: 0, disc: 0.09, ori: 0.8, life: 1.4,
      where: ['SRG', 'MIN', 'RMB', 'CLB', 'DUR', 'IBE'],
      desc: '背甲，长寿，慢。匹特拉姆很少着急，因为他们见过太多着急的人先走一步。'
    },
    {
      id: 'rebbah', name: '瑞柏巴', en: 'Reproba', mod: { hl: 6, h: 0, sm: 1, so: -1, art: 0 }, stand: -0.5, disc: 0.20, ori: 1.0, life: -0.2,   // en: 现行为 Reproba（Rebbah 是旧版英文译名）
      where: ['SRG', 'BLV', 'KDZ'],
      desc: '颌骨能咬碎骨头，笑起来不太好看。萨尔贡的部族里，瑞柏巴是最常被雇来守夜的那种人。'
    },
    {
      id: 'phidia', name: '菲迪亚', en: 'Phidia', mod: { hl: 2, h: 1, sm: 4, so: -2, art: 3 }, stand: -0.4, disc: 0.26, ori: 1.2, life: 0.9,
      where: ['SRG', 'IBE', 'SIR', 'AEG', 'KDZ'],
      desc: '蛇类的瞳，冷得让人不自在。菲迪亚在谈判桌上从不先开口。'
    },
    {
      id: 'tiacauh', name: '提亚卡乌', en: 'Tiacauh', mod: { hl: 6, h: 2, sm: 0, so: 1, art: 1 }, stand: -0.3, disc: 0.18, ori: 1.1, life: 0.1,   // 原写作「提卡兹」，但 id 与 desc（阿卡胡拉）都指向提亚卡乌
      where: ['SRG', 'BLV'],
      desc: '雨林的猎手，阿卡胡拉的主人。他们管地上那些移动城市叫「会爬的铁棺材」。'
    },
    {
      id: 'vouivre', name: '瓦伊凡', en: 'Vouivre', mod: { hl: 7, h: 0, sm: 2, so: 0, art: 5 }, stand: 0.7, disc: 0.10, ori: 1.5, life: 0.3,
      where: ['YAN', 'LEI', 'VIC', 'RMB', 'LMN'],
      desc: '有翼的龙种，鳞坚而体温高。瓦伊凡的源石技艺亲和几乎是先天的，代价是感染后恶化得更快。'
    },

    /* ---- 王族与神话种 ---- */
    {
      id: 'draco', name: '德拉克', en: 'Draco', mod: { hl: 7, h: 1, sm: 4, so: 2, art: 8 }, stand: 2.6, disc: 0.02, ori: 1.6, life: 0.5,
      where: ['VIC'],
      desc: '维多利亚的旧日王血。如今王座上坐着的未必是德拉克，但每一场加冕礼都要请一位德拉克站在旁边。'
    },
    {
      id: 'aslan', name: '阿斯兰', en: 'Aslan', mod: { hl: 8, h: 2, sm: 2, so: 3, art: 2 }, stand: 2.4, disc: 0.02, ori: 1.0, life: 0.4,
      where: ['SRG', 'VIC'],
      desc: '万王之王的血裔。萨尔贡的沙阿与维多利亚的王室都宣称自己继承了这一脉，历史学家至今没吵完。'
    },
    {
      id: 'lung', name: '龙', en: 'Lung', mod: { hl: 6, h: 2, sm: 6, so: 3, art: 9 }, stand: 2.8, disc: 0.01, ori: 1.8, life: 1.2,
      where: ['YAN', 'LMN'],
      desc: '炎氏的血脉，百氏的源头。真龙把土地分封出去的那一天，也把麻烦一起分了出去。'
    },
    {
      id: 'sankta', name: '萨科塔', en: 'Sankta', mod: { hl: 4, h: 7, sm: 3, so: 1, art: 3 }, stand: 2.0, disc: 0.03, ori: 0.5, life: 2.0,
      where: ['LAT', 'SST'],
      desc: '光环与光翼，铳械天赋冠绝泰拉。数千年前他们还是一个萨卡兹部族，直到「天堂支点」被激活。'
    },

    /* ---- 萨卡兹 ---- */
    {
      id: 'sarkaz', name: '萨卡兹', en: 'Sarkaz', mod: { hl: 6, h: -3, sm: 1, so: -3, art: 7 }, stand: -2.2, disc: 0.55, ori: 1.7, life: -1.2,
      where: ['KDZ', 'VIC', 'URS', 'LEI', 'YAN', 'CLB', 'RMB'],
      desc: '泰拉的原生种族，也是失去家园最彻底的那一个。你走到哪里都会被多看一眼，而那一眼通常不是善意。'
    }
  ];

  /* ---------------------------------------------------------------------- */
  /* 萨卡兹十王庭：只有萨卡兹才会抽到的「支系」                              */
  /* 王庭血脉在萨卡兹内部是荣耀，在萨卡兹之外是罪名。                        */
  /* ---------------------------------------------------------------------- */
  TL.SARKAZ_COURTS = [
    { id: 'none', name: '无王庭', en: 'No Court', w: 62, stand: 0, mod: {}, desc: '不属于任何王庭的萨卡兹。十王庭的旗帜在头顶飘了几百年，与你无关。' },
    { id: 'gargoyle', name: '石翼魔', en: 'Gargoyle', w: 7, stand: 0.3, mod: { hl: 4 }, desc: '石翼魔。皮肤会随年龄钙化，老人像活着走下城墙的雕像。' },
    { id: 'vampire', name: '血魔', en: 'Vampire', w: 6, stand: 0.4, mod: { hl: 3, sm: 2 }, desc: '血魔。对血液的感知精确到能听出一场高烧，也因此永远找不到愿意输血给他们的医院。' },
    { id: 'shifter', name: '变形者', en: 'Damazti', w: 5, stand: 0.5, mod: { so: 3 }, desc: '变形者。脸是最廉价也最昂贵的东西，他们两样都懂。' },
    { id: 'nachzehrer', name: '食腐者', en: 'Nachzehrer', w: 4, stand: -0.4, mod: { hl: 5 }, desc: '食腐者。战场上最后离开的人，也是唯一不介意留下的人。' },
    { id: 'cyclops', name: '独眼巨人', en: 'Cyclops', w: 4, stand: 0.6, mod: { sm: 5, art: 3 }, desc: '独眼巨人。萨米的雪祀与他们合作抵御坍缩，那是萨卡兹为数不多被称作「盟友」的场合。' },
    { id: 'banshee', name: '女妖', en: 'Banshee', w: 4, stand: 0.5, mod: { art: 6, so: 1 }, desc: '女妖。她们的歌能穿过墙，也能穿过人。' },
    { id: 'lich', name: '巫妖', en: 'Lich', w: 3, stand: 0.7, mod: { sm: 6, art: 4 }, desc: '巫妖。知识的保管者，寿命长到足以把「历史」当作亲历而非学科。' },
    { id: 'wendigo', name: '温迪戈', en: 'Wendigo', w: 3, stand: -0.6, mod: { hl: 9, h: -3 }, desc: '温迪戈。饥饿是刻在骨血里的，越饿越强，越强越饿。' },
    // 原来的「死魂灵 / Soul Reaper」不在官方十王庭之列，属于本作早期的臆造，
    // 已换成官方名单里的炎魔（Diablo）。十王庭至此与 wiki 的十支一致。
    { id: 'diablo', name: '炎魔', en: 'Diablo', w: 1, stand: 0.3, mod: { art: 4, hl: 2, h: -2 }, desc: '炎魔。萨卡兹中最接近「火」的那一支，也是被自己的火追得最紧的那一支。' },
    { id: 'heartlash', name: '笞心魔', en: 'Djall', w: 1, stand: 0.9, mod: { sm: 4, so: -1 }, desc: '笞心魔。能看见别人心里最疼的那块地方，并且忍不住去碰。' }   // en: 官方英文为 Djall（非直译）
  ];

  /* ---------------------------------------------------------------------- */
  /* 生理极限寿命（《大地巡旅》生态记述）                                      */
  /* ---------------------------------------------------------------------- */
  /**
   * 这是本作寿命模型的基础：泰拉有**两套完全脱节的寿命**。
   *
   *   ① 生理极限寿命 —— 这个种族不老死能活多久。由种族决定。
   *   ② 社会预期寿命 —— 这个人实际上大概率活多久。由国家 × 阶层 × 身份决定。
   *
   * 荒野上的一个菲林和移动城市核心区的一个菲林，生理上限都是 ~90 岁；
   * 但前者大概率 40 岁就死于天灾或感染，后者能活到 78 岁。
   * 「上限」只在极少数躲过了所有外部风险的人身上才显现出来。
   *
   * 分类依据：
   *   ancient 先民（约占泰拉人口 85%+）：与现实人类一致，80~100 岁。
   *           埃里克森（菲林学者）90 余岁仍能长途考察；
   *           魏彦吾、林舸瑞、赫拉格 60~70 岁仍保有战力。
   *           萨弗拉（鼠类外征）与杜林同样遵循人类尺度，并非短命种族。
   *   elder   神民与古代种族（< 5%）：衰老更慢，120~180 岁。
   *           萨科塔为转化而来的长寿种，略低。
   *   court   萨卡兹王庭血脉：数百至上千年。
   *           注意：**普通萨卡兹的生理上限与先民无异**，
   *           且因生存环境恶劣往往死于青壮年 —— 王庭血脉是极少数。
   */
  const KIND = {
    feline: 'ancient', perro: 'ancient', lupo: 'ancient', vulpo: 'ancient',
    kuranta: 'ancient', cautus: 'ancient', liberi: 'ancient', caprinae: 'ancient',
    elafia: 'ancient', ursus: 'ancient', forte: 'ancient', oni: 'ancient',
    durin: 'ancient', savra: 'ancient', anura: 'ancient', petram: 'ancient',
    rebbah: 'ancient', phidia: 'ancient', tiacauh: 'ancient', vouivre: 'ancient',
    sarkaz: 'ancient',
    aegir: 'elder', draco: 'elder', aslan: 'elder', lung: 'elder', sankta: 'elder'
  };

  /** 生理极限寿命区间 [低, 高]（岁） */
  const LIFE_MAX = {
    feline: [80, 100], perro: [78, 98], lupo: [80, 100], vulpo: [82, 102],
    kuranta: [80, 100], cautus: [75, 95], liberi: [82, 104], caprinae: [80, 100],
    elafia: [82, 104], ursus: [78, 98], forte: [80, 102], oni: [78, 98],
    durin: [85, 105], savra: [78, 98], anura: [76, 96], petram: [88, 110],
    rebbah: [76, 96], phidia: [82, 104], tiacauh: [78, 98], vouivre: [85, 108],
    sarkaz: [80, 100],
    aegir: [120, 160], draco: [120, 180], aslan: [120, 180],
    lung: [130, 190], sankta: [110, 145]
  };

  for (const r of TL.RACES) {
    r.kind = KIND[r.id] || 'ancient';
    r.lifeMax = LIFE_MAX[r.id] || [80, 100];
  }

  /* 萨卡兹十王庭的生理极限 —— 只有王庭血脉才有的长寿 */
  const COURT_LIFE = {
    none: null,
    gargoyle: [180, 400], vampire: [400, 1200], shifter: [300, 900],
    nachzehrer: [150, 350], cyclops: [200, 500], banshee: [250, 700],
    lich: [400, 1500], wendigo: [200, 600], diablo: [300, 800],
    heartlash: [250, 650]
  };
  for (const c of TL.SARKAZ_COURTS) {
    c.lifeMax = Object.prototype.hasOwnProperty.call(COURT_LIFE, c.id) ? COURT_LIFE[c.id] : null;
  }

  /** 取这个人的生理极限寿命 [低, 高]。王庭血脉覆盖种族值。 */
  TL.lifeMaxOf = function (raceId, courtId) {
    if (courtId && courtId !== 'none') {
      for (const c of TL.SARKAZ_COURTS) {
        if (c.id === courtId && c.lifeMax) return c.lifeMax;
      }
    }
    const r = TL.RACE_BY_ID[raceId];
    return (r && r.lifeMax) || [80, 100];
  };

  /** 种族大类名 */
  TL.kindName = function (k) {
    return { ancient: '先民', elder: '神民', court: '王庭血脉' }[k] || '先民';
  };

  TL.RACE_BY_ID = {};
  for (const r of TL.RACES) TL.RACE_BY_ID[r.id] = r;

  /**
   * 抽种族：以「国家的主要种族」加权，但保留小概率的「异乡人」结果。
   * 原作里这叫 ethDraw —— 移民、流亡、混居让国家与种族从不一一对应。
   */
  TL.drawRace = function (nationId, rnd) {
    const n = TL.NATION_BY_ID[nationId];
    const pool = [];
    // 主要种族（列表顺序即权重顺序：第一个权重最高）
    const list = n.race;
    for (let i = 0; i < list.length; i++) {
      // 首个种族占主导，其后按 1/(i+1) 衰减
      pool.push({ id: list[i], w: Math.max(0.12, 1.0 / Math.pow(i + 1, 0.85)) });
    }
    // 全大陆漫游者：任何国家都可能出现少量其他种族
    for (const r of TL.RACES) {
      if (list.indexOf(r.id) >= 0) continue;
      let w = 0.012;
      if (r.id === 'sarkaz') w = 0.030;          // 萨卡兹千年流浪，遍布各国
      if (r.id === 'aegir') w = 0.008;
      if (r.stand >= 2) w = 0.002;               // 王族极少出现在非本族国家
      pool.push({ id: r.id, w: w });
    }
    let t = 0; for (const p of pool) t += p.w;
    let x = rnd() * t;
    for (const p of pool) { x -= p.w; if (x <= 0) return p.id; }
    return pool[0].id;
  };

  /** 抽萨卡兹王庭（仅萨卡兹调用） */
  TL.drawCourt = function (rnd) {
    const pool = TL.SARKAZ_COURTS;
    let t = 0; for (const p of pool) t += p.w;
    let x = rnd() * t;
    for (const p of pool) { x -= p.w; if (x <= 0) return p; }
    return pool[0];
  };

  /** 计算种族在特定国家的「适配度」：越不匹配，歧视越重 */
  TL.raceFit = function (raceId, nationId) {
    const n = TL.NATION_BY_ID[nationId];
    const r = TL.RACE_BY_ID[raceId];
    const idx = n.race.indexOf(raceId);
    if (idx === 0) return 1.0;
    if (idx > 0) return 0.55 + 0.45 * (1 - idx / n.race.length);
    return 0.30; // 外来种族
  };

  /**
   * 有效歧视系数：种族基线 × 国家适配度 × 王庭修正
   * 0 = 完全不被歧视，1 = 系统性迫害
   */
  TL.discrimination = function (S) {
    const r = TL.RACE_BY_ID[S.race];
    let d = r.disc;
    const fit = TL.raceFit(S.race, S.nation);
    d += (1 - fit) * 0.35;
    if (S.race === 'sarkaz') {
      const nat = TL.NATION_BY_ID[S.nation];
      // 卡兹戴尔是萨卡兹唯一不被系统性歧视的地方
      if (S.nation === 'KDZ') d -= 0.40;
      // 乌萨斯对感染者的镇压最烈，对萨卡兹尤甚
      if (S.nation === 'URS') d += 0.15;
      if (S.nation === 'VIC') d += 0.08;
      if (S.court && S.court !== 'none') d += 0.06;  // 王庭血脉更显眼
    }
    // 感染者身份的歧视在别处叠加（见 oripathy.js）
    return Math.max(0, Math.min(0.95, d));
  };

})(window.TL = window.TL || {});
