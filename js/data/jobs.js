/* ==========================================================================
 * TERRA LIFE SIM — 职业表
 * --------------------------------------------------------------------------
 * 对齐原作的 JOBS 结构，但加入了泰拉特有的东西：
 *   · 源石相关职业（采掘、精炼、技艺）—— 收入高，感染率也高
 *   · 干员体系（罗德岛/各国特殊部队的八大职业分支）
 *   · 天灾信使 —— 大陆上最受尊敬也最危险的职业之一
 *
 * 字段：
 *   id    代号
 *   name  名称
 *   sec   部门 agr|ind|ser|know|mil|art|biz|op
 *   edu   学历门槛 0=无 1=初等 2=中等 3=高等 4=研究院
 *   lo/hi 收入区间（相对该国人均产出的倍数）
 *   art   源石技艺门槛 0-100（不达标则无法胜任）
 *   ori   矿石病感染风险乘数（1.0 = 基准）
 *   risk  {死因: 倍数} 职业性死亡风险
 *   sex   'M'/'F' 性别倾向倍数（>1 表示该性别更容易被雇佣）
 *   only  [国家id] 限定
 *   cls   干员职业分支（有值即为「干员」）
 *   disc  受歧视敏感度：感染者/异族在这个职位上被挡的概率
 * ========================================================================== */
(function (TL) {
  'use strict';

  TL.JOBS = {
    /* ---------------- 农林牧渔 ---------------- */
    farm:      { name: '自耕农', en: 'Farmer', sec: 'agr', edu: 0, lo: 0.35, hi: 0.95, art: 0, ori: 1.0, risk: {}, disc: 0.6 },
    farmhand:  { name: '农庄雇工', en: 'Farmhand', sec: 'agr', edu: 0, lo: 0.28, hi: 0.70, art: 0, ori: 1.0, risk: {}, disc: 0.5 },
    herder:    { name: '牧民', en: 'Herder', sec: 'agr', edu: 0, lo: 0.30, hi: 0.80, art: 0, ori: 1.0, risk: { cold: 2, inj: 1.3 }, disc: 0.5, only: ['SAMI', 'SRG', 'URS', 'KJR', 'MIN', 'YAN'] },
    fisher:    { name: '渔民', en: 'Fisher', sec: 'agr', edu: 0, lo: 0.34, hi: 0.88, art: 0, ori: 1.0, risk: { drown: 3.5, sea: 2 }, disc: 0.5, only: ['IBE', 'AEG', 'SST', 'LMN', 'HIG', 'YAN'] },
    hunter:    { name: '猎人', en: 'Hunter', sec: 'agr', edu: 0, lo: 0.30, hi: 0.85, art: 0.15, ori: 1.3, risk: { inj: 2.2, cold: 1.5 }, disc: 0.4, only: ['SAMI', 'SRG', 'KDZ', 'URS', 'KJR'] },
    agbiz:     { name: '农庄经营', en: 'Farm owner', sec: 'agr', edu: 2, lo: 0.90, hi: 2.20, art: 0, ori: 1.0, risk: {}, disc: 0.3 },

    /* ---------------- 工业与矿业 ---------------- */
    miner:     { name: '矿工', en: 'Miner', sec: 'ind', edu: 0, lo: 0.55, hi: 1.30, art: 0, ori: 1.7, risk: { inj: 3, copd: 2, cat: 1.3 }, disc: 0.55, sex: 'M' },
    oriminer:  { name: '源石采掘工', en: 'Originium miner', sec: 'ind', edu: 0, lo: 1.10, hi: 2.60, art: 0.1, ori: 4.5, risk: { inj: 3, ori: 2.2, cat: 1.6 }, disc: 0.7, sex: 'M', only: ['RMB', 'URS', 'KDZ', 'SRG', 'YAN', 'BLV'] },
    refiner:   { name: '源石精炼工', en: 'Originium refiner', sec: 'ind', edu: 1, lo: 1.40, hi: 3.00, art: 0.2, ori: 3.8, risk: { ori: 1.8, can: 1.5, copd: 1.6 }, disc: 0.65, only: ['VIC', 'LEI', 'CLB', 'YAN', 'RMB', 'URS'] },
    factory:   { name: '工厂工人', en: 'Factory worker', sec: 'ind', edu: 1, lo: 0.60, hi: 1.35, art: 0, ori: 1.1, risk: { inj: 1.6, copd: 1.4 }, disc: 0.5 },
    construct: { name: '建筑工', en: 'Construction worker', sec: 'ind', edu: 0, lo: 0.55, hi: 1.25, art: 0, ori: 1.2, risk: { fall: 3.2, inj: 2.2 }, disc: 0.5, sex: 'M' },
    smith:     { name: '工匠', en: 'Smith', sec: 'ind', edu: 1, lo: 0.70, hi: 1.60, art: 0.15, ori: 1.1, risk: { inj: 1.8, copd: 1.3 }, disc: 0.45 },
    mechanic:  { name: '机械师', en: 'Mechanic', sec: 'ind', edu: 2, lo: 0.95, hi: 2.10, art: 0.1, ori: 1.0, risk: { inj: 1.7 }, disc: 0.3 },
    engineer:  { name: '工程师', en: 'Engineer', sec: 'ind', edu: 4, lo: 1.90, hi: 4.00, art: 0.25, ori: 0.9, risk: {}, disc: 0.2 },
    steamknight: { name: '蒸汽骑士', en: 'Steam Knight', sec: 'ind', edu: 3, lo: 2.20, hi: 4.50, art: 0.4, ori: 1.4, risk: { inj: 2.5, ori: 1.3 }, disc: 0.15, only: ['VIC'] },

    /* ---------------- 服务业 ---------------- */
    vendor:    { name: '摊贩', en: 'Street vendor', sec: 'ser', edu: 0, lo: 0.35, hi: 1.10, art: 0, ori: 1.0, risk: { hom: 1.3 }, disc: 0.5 },
    shop:      { name: '店员', en: 'Shop clerk', sec: 'ser', edu: 2, lo: 0.60, hi: 1.35, art: 0, ori: 1.0, risk: {}, disc: 0.35 },
    cook:      { name: '厨师', en: 'Cook', sec: 'ser', edu: 1, lo: 0.55, hi: 1.40, art: 0, ori: 1.0, risk: { inj: 1.4 }, disc: 0.4 },
    driver:    { name: '车夫', en: 'Carter', sec: 'ser', edu: 1, lo: 0.60, hi: 1.45, art: 0, ori: 1.0, risk: { road: 2.6 }, disc: 0.4, sex: 'M' },
    courier:   { name: '信使', en: 'Courier', sec: 'ser', edu: 1, lo: 0.85, hi: 2.00, art: 0.15, ori: 1.6, risk: { road: 2.4, cat: 2.2, inj: 2.0 }, disc: 0.35 },
    stormcaller: { name: '天灾信使', en: 'Catastrophe messenger', sec: 'ser', edu: 3, lo: 2.40, hi: 5.20, art: 0.65, ori: 2.4, risk: { cat: 4.5, road: 2, inj: 2.5 }, disc: 0.1, desc: '在天灾抵达之前跑到城里敲钟的人。' },
    inn:       { name: '旅店伙计', en: 'Innkeeper', sec: 'ser', edu: 0, lo: 0.45, hi: 1.10, art: 0, ori: 1.0, risk: {}, disc: 0.45 },
    tailor:    { name: '裁缝', en: 'Tailor', sec: 'ser', edu: 1, lo: 0.55, hi: 1.30, art: 0, ori: 1.0, risk: {}, disc: 0.4 },
    barber:    { name: '理发师', en: 'Barber', sec: 'ser', edu: 1, lo: 0.55, hi: 1.35, art: 0, ori: 1.0, risk: {}, disc: 0.4 },
    domestic:  { name: '佣人', en: 'Domestic servant', sec: 'ser', edu: 0, lo: 0.30, hi: 0.75, art: 0, ori: 0.9, risk: {}, disc: 0.55, sex: 'F' },
    performer: { name: '艺人', en: 'Performer', sec: 'ser', edu: 2, lo: 0.50, hi: 2.60, art: 0.3, ori: 1.0, risk: { alc: 1.5 }, disc: 0.3 },
    musician:  { name: '乐师', en: 'Musician', sec: 'ser', edu: 3, lo: 0.80, hi: 2.80, art: 0.55, ori: 1.2, risk: {}, disc: 0.25, only: ['LEI', 'SST', 'VIC', 'LAT', 'YAN', 'HIG'] },

    /* ---------------- 知识与专业 ---------------- */
    teacher:   { name: '教师', en: 'Teacher', sec: 'know', edu: 3, lo: 1.00, hi: 2.10, art: 0.1, ori: 0.9, risk: {}, disc: 0.3 },
    clerk:     { name: '文书', en: 'Clerk', sec: 'know', edu: 2, lo: 0.80, hi: 1.80, art: 0, ori: 0.9, risk: {}, disc: 0.3 },
    nurse:     { name: '护士', en: 'Nurse', sec: 'know', edu: 2, lo: 0.85, hi: 1.80, art: 0.2, ori: 1.6, risk: { inf: 1.8 }, disc: 0.3, sex: 'F' },
    doctor:    { name: '医师', en: 'Physician', sec: 'know', edu: 4, lo: 1.80, hi: 3.80, art: 0.3, ori: 1.4, risk: { inf: 1.5 }, disc: 0.2 },
    oridoc:    { name: '矿石病医师', en: 'Oripathy physician', sec: 'know', edu: 4, lo: 1.70, hi: 3.60, art: 0.5, ori: 2.6, risk: { ori: 2.0, inf: 1.4 }, disc: 0.45, desc: '专门处理感染者。愿意做这行的人不多，愿意付钱的人更少。' },
    scholar:   { name: '学者', en: 'Scholar', sec: 'know', edu: 4, lo: 1.30, hi: 3.20, art: 0.35, ori: 1.0, risk: {}, disc: 0.25 },
    journalist: { name: '记者', en: 'Journalist', sec: 'know', edu: 3, lo: 0.90, hi: 2.40, art: 0.1, ori: 1.1, risk: { hom: 2.2 }, disc: 0.3 },
    lawyer:    { name: '律政', en: 'Lawyer', sec: 'know', edu: 4, lo: 1.80, hi: 4.20, art: 0.1, ori: 0.9, risk: { hom: 1.5 }, disc: 0.25 },
    banker:    { name: '账房金融', en: 'Banker', sec: 'know', edu: 3, lo: 1.40, hi: 3.60, art: 0, ori: 0.9, risk: {}, disc: 0.3 },
    official:  { name: '官吏', en: 'Official', sec: 'know', edu: 3, lo: 1.20, hi: 2.80, art: 0.15, ori: 0.9, risk: { hom: 1.4 }, disc: 0.5 },

    /* ---------------- 军事与治安 ---------------- */
    soldier:   { name: '士兵', en: 'Soldier', sec: 'mil', edu: 1, lo: 0.70, hi: 1.60, art: 0.1, ori: 1.3, risk: { inj: 2.2, war: 3 }, disc: 0.35, sex: 'M' },
    guard:     { name: '警卫', en: 'Guard', sec: 'mil', edu: 1, lo: 0.60, hi: 1.30, art: 0.05, ori: 1.0, risk: { inj: 1.6, hom: 1.4 }, disc: 0.4, sex: 'M' },
    police:    { name: '治安官', en: 'Constable', sec: 'mil', edu: 2, lo: 0.95, hi: 2.00, art: 0.15, ori: 1.1, risk: { inj: 2.0, hom: 2.2 }, disc: 0.35 },
    mercenary: { name: '佣兵', en: 'Mercenary', sec: 'mil', edu: 1, lo: 1.00, hi: 3.40, art: 0.3, ori: 1.8, risk: { inj: 3.5, war: 4, hom: 2 }, disc: 0.25, desc: '签合同的时候没人问你的种族。' },
    bounty:    { name: '赏金猎人', en: 'Bounty hunter', sec: 'mil', edu: 2, lo: 1.20, hi: 3.80, art: 0.35, ori: 1.7, risk: { inj: 3, hom: 2.4 }, disc: 0.25 },
    knight:    { name: '竞技骑士', en: 'Competitive knight', sec: 'mil', edu: 2, lo: 1.60, hi: 5.00, art: 0.4, ori: 1.3, risk: { inj: 4 }, disc: 0.2, only: ['KAZ'] },

    /* ---------------- 源石技艺 ---------------- */
    artsmith:  { name: '源石工匠', en: 'Originium artisan', sec: 'art', edu: 2, lo: 1.10, hi: 2.60, art: 0.5, ori: 2.4, risk: { ori: 1.8 }, disc: 0.5 },
    caster:    { name: '术师', en: 'Caster', sec: 'art', edu: 3, lo: 1.60, hi: 3.80, art: 0.75, ori: 2.6, risk: { ori: 2.0, art: 1.8 }, disc: 0.3 },
    alchemist: { name: '源石技师', en: 'Originium technician', sec: 'art', edu: 4, lo: 1.80, hi: 4.00, art: 0.7, ori: 2.8, risk: { ori: 2.2 }, disc: 0.3 },
    witch:     { name: '巫祝', en: 'Shaman', sec: 'art', edu: 2, lo: 0.90, hi: 2.40, art: 0.8, ori: 2.2, risk: { ori: 1.8, cold: 1.6 }, disc: 0.15, only: ['SAMI', 'KDZ', 'YAN', 'SRG'] },

    /* ---------------- 商业 ---------------- */
    merchant:  { name: '商人', en: 'Merchant', sec: 'biz', edu: 2, lo: 1.10, hi: 3.60, art: 0.05, ori: 1.0, risk: { road: 1.5, hom: 1.3 }, disc: 0.35 },
    shopowner: { name: '店主', en: 'Shop owner', sec: 'biz', edu: 2, lo: 1.00, hi: 2.60, art: 0, ori: 1.0, risk: {}, disc: 0.35 },
    noble:     { name: '贵族', en: 'Noble', sec: 'biz', edu: 3, lo: 2.60, hi: 7.00, art: 0.2, ori: 0.9, risk: { hom: 1.8 }, disc: 0.05 },

    /* ---------------- 干员体系（八大职业分支） ---------------- */
    op_vanguard:  { name: '先锋', en: 'Vanguard', sec: 'op', cls: 'vanguard', edu: 2, lo: 1.30, hi: 2.80, art: 0.35, ori: 1.5, risk: { inj: 3.2, war: 3 }, disc: 0.2, desc: '第一个进场的人，也是第一个被记住或第一个被忘掉的人。' },
    op_guard:     { name: '近卫', en: 'Guard', sec: 'op', cls: 'guard', edu: 2, lo: 1.40, hi: 3.00, art: 0.30, ori: 1.5, risk: { inj: 3.6, war: 3.4 }, disc: 0.2, desc: '把敌人挡在身前，把队友挡在身后。' },
    op_defender:  { name: '重装', en: 'Defender', sec: 'op', cls: 'defender', edu: 2, lo: 1.35, hi: 2.90, art: 0.20, ori: 1.6, risk: { inj: 3.4, war: 3 }, disc: 0.2 },
    op_sniper:    { name: '狙击', en: 'Sniper', sec: 'op', cls: 'sniper', edu: 3, lo: 1.50, hi: 3.20, art: 0.40, ori: 1.3, risk: { inj: 2.4, war: 2.6 }, disc: 0.2, desc: '拉特兰的铳械工艺让这个职业在别处也带着一点神圣感。' },
    op_caster:    { name: '术师干员', en: 'Caster (Operator)', sec: 'op', cls: 'caster', edu: 3, lo: 1.70, hi: 3.80, art: 0.85, ori: 2.8, risk: { ori: 2.2, art: 2.0, inj: 2 }, disc: 0.3 },
    op_medic:     { name: '医疗干员', en: 'Medic', sec: 'op', cls: 'medic', edu: 4, lo: 1.60, hi: 3.40, art: 0.55, ori: 2.0, risk: { inf: 1.8, ori: 1.6 }, disc: 0.25 },
    op_supporter: { name: '辅助', en: 'Supporter', sec: 'op', cls: 'supporter', edu: 3, lo: 1.40, hi: 3.10, art: 0.70, ori: 2.2, risk: { art: 1.6, inj: 1.8 }, disc: 0.25 },
    op_specialist:{ name: '特种', en: 'Specialist', sec: 'op', cls: 'specialist', edu: 2, lo: 1.45, hi: 3.30, art: 0.45, ori: 1.9, risk: { inj: 4.0, fall: 2.5, war: 3 }, disc: 0.3 }
  };

  /** 出身门槛：每个部门对「社会地位 + 学识」的最低要求 */
  TL.CLASSES = {
    civilian: { name: '平民', en: 'Civilian', desc: '普通人的一生。绝大多数泰拉人都在这一栏里。' },
    operator: { name: '干员', en: 'Operator', desc: '被编入名册的人。有代号，有档案，也有阵亡通知。' }
  };

  /* 非工作状态（对应原作的 NONWORK）
     注意 slave 必须在这里：year.js 每年会做 `if (TL.isWorking(S)) S.flags.lastJob = S.job`，
     如果奴隶算「在职」，lastJob 会被 'slave' 覆盖，出矿之后永远回不到原来的职业。
     同时 jobLabel() 也靠这张表把 'slave' 翻译成中文，否则界面上会直接印出英文单词。 */
  TL.NONWORK = ['child', 'student', 'childwork', 'seeking', 'retired', 'homemaker',
                'service', 'prison', 'daycare', 'slave'];

  /* 非工作状态的显示名（对应原作的 NONWORK，用于 UI 与报告） */
  TL.NONWORK_LABEL = {
    child: '幼儿', student: '在学', childwork: '童工',
    seeking: '待业', retired: '已退休', homemaker: '持家',
    service: '服役', prison: '服刑', daycare: '托育',
    slave: '矿坑苦役'
  };

  /* 非工作状态的英文名（英文界面用；键与上表一一对应） */
  TL.NONWORK_LABEL_EN = {
    child: 'Infant', student: 'In school', childwork: 'Child labour',
    seeking: 'Unemployed', retired: 'Retired', homemaker: 'Homemaker',
    service: 'In service', prison: 'Imprisoned', daycare: 'Daycare',
    slave: 'Mine labourer'
  };

  /** 职业显示名：优先查 JOBS，其次查非工作状态 */
  TL.jobLabel = function (job) {
    if (!job) return '—';
    const en = TL.lang === 'en';
    const J = TL.JOBS[job];
    if (J) return (en && J.en) ? J.en : J.name;
    if (en && TL.NONWORK_LABEL_EN[job]) return TL.NONWORK_LABEL_EN[job];
    return TL.NONWORK_LABEL[job] || job;
  };

  /** 干员阶级显示名 */
  TL.opRankName = function (rank) {
    const r = TL.OP_RANKS[rank] || TL.OP_RANKS[0];
    return (TL.lang === 'en' && r.en) ? r.en : r.name;
  };

  /** 干员分支显示名 */
  TL.opClassName = function (id) {
    const c = TL.OP_CLASSES.find(x => x.id === id);
    if (!c) return id || '—';
    return (TL.lang === 'en' && c.en) ? c.en : c.name;
  };

  /* 干员八大分支（用于 UI 展示与升阶） */
  TL.OP_CLASSES = [
    { id: 'vanguard',   name: '先锋', en: 'Vanguard', tag: '回费 · 拦截' },
    { id: 'guard',      name: '近卫', en: 'Guard', tag: '输出 · 近战' },
    { id: 'defender',   name: '重装', en: 'Defender', tag: '承伤 · 阻挡' },
    { id: 'sniper',     name: '狙击', en: 'Sniper', tag: '远程 · 单体' },
    { id: 'caster',     name: '术师', en: 'Caster', tag: '法术 · 群伤' },
    { id: 'medic',      name: '医疗', tag: '治疗 · 恢复' },
    { id: 'supporter',  name: '辅助', en: 'Supporter', tag: '增益 · 削弱' },
    { id: 'specialist', name: '特种', en: 'Specialist', tag: '位移 · 控制' }
  ];

  /** 干员阶级（干员路线的晋升台阶） */
  TL.OP_RANKS = [
    { id: 0, name: '实习干员', en: 'Trainee Operator', pay: 1.0, need: 0 },
    { id: 1, name: '正式干员', en: 'Official Operator', pay: 1.25, need: 6 },
    { id: 2, name: '资深干员', en: 'Senior Operator', pay: 1.6, need: 16 },
    { id: 3, name: '精英干员', en: 'Elite Operator', pay: 2.1, need: 30 },
    { id: 4, name: '王牌干员', en: 'Ace Operator', pay: 2.8, need: 48 }
  ];

})(window.TL = window.TL || {});
