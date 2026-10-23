/* ==========================================================================
 * TERRA LIFE SIM — 国家 / 地区表
 * --------------------------------------------------------------------------
 * 移植自「80億分之1」的 COUNTRIES 结构，改写为泰拉世界。
 *
 * 字段说明（与原作一一对应，便于对照）：
 *   id    三字母代号
 *   name  中文名
 *   en    英文名（界面语言为 en 时显示；官方英文译名优先）
 *   reg   区域（决定死因基线 CT、收入弹性 MORT_G）
 *   pop   人口（万人），来自《大地巡旅》页码或明确标注的推断值
 *   b     年出生权重（万人/年）—— 抽签用「此刻出生的婴儿」
 *   le    预期寿命（岁，两性均值）
 *   gap   性别寿命差（女 - 男）
 *   im    婴儿死亡率（‰）
 *   u5    五岁以下死亡率（‰）
 *   med   医疗可及性 0-1（影响治病成功率、就医事件）
 *   ppp   人均产出指数（泰拉内部相对值，1.0 = 大陆中位）
 *   gi    基尼系数
 *   urb   城市化率 %
 *   edu   期望受教育年数
 *   ter   高等教育入学率 %
 *   ori   矿石病感染率 %（对应原作的 hiv，本作核心机制）
 *   cat   天灾频率指数 0-3（0 = 几乎无天灾，3 = 移动城市必须常态迁徙）
 *   war   战争强度 0-1
 *   hom   每十万人谋杀率
 *   road  每十万人交通事故死亡率
 *   mat   孕产妇死亡率（每十万活产）
 *   alc   人均酒精消费指数
 *   smk   成人吸烟率 %
 *   net   信息流通率 %（原作 net，本作=通讯/情报覆盖）
 *   art   源石技艺普及度 0-1（越高越容易走术师路线）
 *   race  主要种族 id 列表（抽签权重用）
 *   gov   政体（叙事用）
 *   tag   一句话印象
 * ========================================================================== */
(function (TL) {
  'use strict';

  /** 区域代号：影响死因基线表 CT 与收入-死亡弹性 MORT_G */
  TL.REGIONS = {
    core:  '泰拉核心圈',   // 维多利亚、莱塔尼亚、卡西米尔 —— 工业化、老龄、慢病
    east:  '大陆东方',     // 炎、东、龙门 —— 长寿、慢病为主
    north: '大陆北方',     // 乌萨斯、萨米、谢拉格 —— 严寒、外伤、酗酒
    south: '大陆南方',     // 萨尔贡、米诺斯、阿卡胡拉 —— 酷热、传染病
    west:  '大陆西方',     // 哥伦比亚、玻利瓦尔 —— 新大陆、暴力、事故
    sea:   '海洋与深海',   // 阿戈尔、伊比利亚 —— 海嗣、溺水、大静谧后遗症
    waste: '荒原与废土',   // 卡兹戴尔、雷姆必拓矿带 —— 天灾、源石、外伤
    under: '地下城邦'      // 杜林 —— 密闭、矿尘、长寿
  };

  /* ---------------------------------------------------------------------- */
  /* 国家表                                                                  */
  /* ---------------------------------------------------------------------- */
  TL.NATIONS = [
    {
      id: 'YAN', name: '炎国', en: 'Yan', reg: 'east', pop: 30000, b: 268, le: 78.4, gap: 3.4,
      im: 6.0, u5: 8.2, med: 0.72, ppp: 1.00, gi: 0.44, urb: 52, edu: 13.2, ter: 42,
      ori: 1.2, cat: 0.7, war: 0, hom: 1.0, road: 11, mat: 30, alc: 0.5, smk: 26,
      net: 80, art: 0.62,
      race: ['lung', 'feline', 'liberi', 'vouivre', 'caprinae', 'kuranta', 'savra', 'sarkaz'],
      gov: '中央内阁 · 六部 · 百氏诸侯遗制',
      tag: '泰拉最古老的文明，也是最庞大的人口池。天师与岁兽的传说仍在边地流传。'
    },
    {
      id: 'SRG', name: '萨尔贡', en: 'Sargon', reg: 'south', pop: 10000, b: 178, le: 66.2, gap: 3.0,
      im: 24.0, u5: 33.5, med: 0.34, ppp: 0.46, gi: 0.52, urb: 38, edu: 8.4, ter: 14,
      ori: 2.5, cat: 1.6, war: 0.2, hom: 4.5, road: 19, mat: 180, alc: 0.2, smk: 20,
      net: 34, art: 0.44,
      race: ['aslan', 'forte', 'anura', 'petram', 'rebbah', 'phidia', 'feline', 'sarkaz', 'tiacauh'],
      gov: '万王之王 · 沙阿 · 部族共主',
      tag: '第一个定义君权的国度。焚风热土至今仍在时间坍缩，没人敢在日落之后靠近。'
    },
    {
      id: 'URS', name: '乌萨斯', en: 'Ursus', reg: 'north', pop: 8000, b: 102, le: 68.0, gap: 5.6,
      im: 12.0, u5: 16.0, med: 0.48, ppp: 0.58, gi: 0.46, urb: 62, edu: 11.0, ter: 30,
      ori: 4.5, cat: 1.1, war: 0.6, hom: 8.0, road: 18, mat: 90, alc: 1.6, smk: 38,
      net: 56, art: 0.48,
      race: ['ursus', 'feline', 'lupo', 'liberi', 'sarkaz', 'caprinae'],
      gov: '皇帝 · 元老院 · 九大集团军',
      tag: '唯一带「帝国」后缀的势力。北方的苦寒让它永远盯着南方的土地，也让它永远需要敌人。'
    },
    {
      id: 'VIC', name: '维多利亚', en: 'Victoria', reg: 'core', pop: 4000, b: 44, le: 79.2, gap: 4.4,
      im: 5.0, u5: 6.8, med: 0.80, ppp: 1.28, gi: 0.50, urb: 78, edu: 14.0, ter: 52,
      ori: 2.0, cat: 0.5, war: 0.3, hom: 2.0, road: 8, mat: 22, alc: 1.4, smk: 24,
      net: 84, art: 0.58,
      race: ['draco', 'aslan', 'feline', 'vulpo', 'liberi', 'kuranta', 'sarkaz', 'perro'],
      gov: '君主制 · 议会 · 蒸汽骑士团',
      tag: '最早实现工业化的国家。它曾把旗帜插遍大陆，如今旗帜下的裂缝比旗帜更大。'
    },
    {
      id: 'LEI', name: '莱塔尼亚', en: 'Leithanien', reg: 'core', pop: 3200, b: 34, le: 80.1, gap: 4.0,
      im: 4.2, u5: 5.6, med: 0.82, ppp: 1.22, gi: 0.42, urb: 74, edu: 14.6, ter: 58,
      ori: 1.8, cat: 0.5, war: 0.1, hom: 1.4, road: 9, mat: 20, alc: 1.3, smk: 25,
      net: 82, art: 0.88,
      race: ['caprinae', 'elafia', 'feline', 'liberi', 'vulpo', 'sarkaz', 'vouivre'],
      gov: '二帝共治 · 九大选帝侯 · 瓦瑟领',
      tag: '严谨与浪漫在这里是同义词。术师的咒文写在乐谱上，选帝侯的野心写在五线谱之间。'
    },
    {
      id: 'RMB', name: '雷姆必拓', en: 'Rim Billiton', reg: 'waste', pop: 2800, b: 46, le: 70.4, gap: 4.8,
      im: 13.0, u5: 17.5, med: 0.50, ppp: 0.92, gi: 0.48, urb: 66, edu: 11.8, ter: 32,
      ori: 6.5, cat: 1.3, war: 0.1, hom: 3.2, road: 17, mat: 70, alc: 1.5, smk: 32,
      net: 64, art: 0.50,
      race: ['cautus', 'feline', 'perro', 'petram', 'savra', 'sarkaz', 'vouivre'],
      gov: '大家庭与厂区／矿区自治 · 自治区与自治州',
      tag: '矿业塑造生活，也有非血缘的大家庭、厂区运动会和联防组织。防护与照护都需要社群共同承担。'
    },
    {
      id: 'KAZ', name: '卡西米尔', en: 'Kazimierz', reg: 'core', pop: 1800, b: 21, le: 78.0, gap: 4.2,
      im: 5.4, u5: 7.0, med: 0.78, ppp: 1.16, gi: 0.54, urb: 76, edu: 13.6, ter: 48,
      ori: 1.5, cat: 0.6, war: 0.1, hom: 2.2, road: 10, mat: 26, alc: 1.5, smk: 28,
      net: 80, art: 0.54,
      race: ['kuranta', 'feline', 'perro', 'lupo', 'liberi', 'caprinae', 'sarkaz'],
      gov: '监正会 · 商业联合会 · 骑士贵族共和',
      tag: '骑士称号曾经意味着荣耀，现在意味着赞助商。竞技场上的血是真的，掌声是买的。'
    },
    {
      id: 'HIG', name: '东国', en: 'Higashi', reg: 'east', pop: 1600, b: 15, le: 79.0, gap: 4.6,
      im: 4.8, u5: 6.4, med: 0.80, ppp: 1.10, gi: 0.44, urb: 70, edu: 13.8, ter: 50,
      ori: 1.2, cat: 1.2, war: 0.2, hom: 1.2, road: 8, mat: 24, alc: 1.5, smk: 28,
      net: 78, art: 0.66,
      race: ['oni', 'aegir', 'feline', 'vulpo', 'liberi', 'savra', 'sarkaz'],
      gov: '八大家族 · 南北两派 · 幕府遗风',
      tag: '八大家族分了南北，也分了这个国家的骨与血。血峰战役的雪至今没化。'
    },
    {
      id: 'CLB', name: '哥伦比亚', en: 'Columbia', reg: 'west', pop: 1600, b: 24, le: 77.4, gap: 4.2,
      im: 6.2, u5: 8.0, med: 0.74, ppp: 1.42, gi: 0.56, urb: 72, edu: 13.4, ter: 54,
      ori: 2.2, cat: 1.0, war: 0.1, hom: 5.0, road: 14, mat: 28, alc: 1.3, smk: 26,
      net: 86, art: 0.60,
      race: ['feline', 'perro', 'vulpo', 'liberi', 'kuranta', 'sarkaz', 'cautus', 'petram'],
      gov: '联邦制 · 拓荒议会 · 企业游说团',
      tag: '最年轻的国家，也最没有耐心。它相信一切都能被开发，包括人。'
    },
    {
      id: 'BLV', name: '玻利瓦尔', en: 'Bolívar', reg: 'west', pop: 1600, b: 32, le: 65.0, gap: 4.0,
      im: 18.0, u5: 26.0, med: 0.38, ppp: 0.52, gi: 0.58, urb: 64, edu: 9.6, ter: 18,
      ori: 3.0, cat: 1.2, war: 0.9, hom: 22.0, road: 22, mat: 120, alc: 0.8, smk: 22,
      net: 46, art: 0.42,
      race: ['perro', 'feline', 'rebbah', 'anura', 'tiacauh', 'sarkaz', 'liberi'],
      gov: '辛嘉斯 · 联合政府 · 真正玻利瓦尔人；多索雷斯另有城市治理',
      tag: '控制区的制度与生活条件各异；农业、歌谣、多语言生活和城市旅游，也构成孩子的成长环境。'
    },
    {
      id: 'IBE', name: '伊比利亚', en: 'Iberia', reg: 'sea', pop: 1417, b: 13, le: 72.0, gap: 4.2,
      im: 7.0, u5: 9.2, med: 0.62, ppp: 0.86, gi: 0.46, urb: 68, edu: 11.6, ter: 34,
      ori: 3.5, cat: 0.9, war: 0.2, hom: 2.6, road: 12, mat: 40, alc: 1.1, smk: 27,
      net: 70, art: 0.52,
      race: ['aegir', 'liberi', 'feline', 'perro', 'phidia', 'sarkaz', 'petram'],
      gov: '审判庭 · 大主教区 · 海岸封锁线',
      tag: '黄金时代被一场「大静谧」吞掉了大半。如今海岸线上没有渔火，只有审判庭的灯。'
    },
    {
      id: 'LAT', name: '拉特兰', en: 'Laterano', reg: 'core', pop: 600, b: 6, le: 84.2, gap: 3.2,
      im: 2.4, u5: 3.0, med: 0.94, ppp: 1.55, gi: 0.34, urb: 84, edu: 15.4, ter: 66,
      ori: 0.4, cat: 0.1, war: 0, hom: 0.6, road: 5, mat: 12, alc: 0.9, smk: 16,
      net: 90, art: 0.74,
      race: ['sankta', 'liberi', 'feline', 'perro', 'caprinae'],
      gov: '教宗 · 教皇厅 · 律法（天堂支点）',
      tag: '萨科塔与黎博利共同生活、学习和接受武器训练。守护铳资格与训练成绩分别办理，城外村镇也有修道院提供服务。'
    },
    {
      id: 'MIN', name: '米诺斯', en: 'Minos', reg: 'south', pop: 600, b: 8, le: 80.0, gap: 3.8,
      im: 4.6, u5: 6.0, med: 0.78, ppp: 1.06, gi: 0.40, urb: 74, edu: 13.8, ter: 48,
      ori: 1.0, cat: 0.8, war: 0, hom: 1.4, road: 9, mat: 24, alc: 1.2, smk: 24,
      net: 78, art: 0.56,
      race: ['forte', 'feline', 'petram', 'caprinae', 'liberi', 'sarkaz'],
      gov: '十二英雄后裔 · 雅赛努斯 / 科林尼亚 / 拉刻代蒙三盟',
      tag: '英雄信仰在这里比法律更管用。三个城邦联盟彼此客气，也彼此提防。'
    },
    {
      id: 'SIR', name: '叙拉古', en: 'Siracusa', reg: 'core', pop: 323, b: 4, le: 76.0, gap: 4.0,
      im: 5.6, u5: 7.4, med: 0.72, ppp: 1.04, gi: 0.60, urb: 78, edu: 12.8, ter: 40,
      ori: 1.8, cat: 0.4, war: 0.4, hom: 14.0, road: 11, mat: 28, alc: 1.6, smk: 30,
      net: 76, art: 0.46,
      race: ['vulpo', 'lupo', 'feline', 'perro', 'sarkaz', 'phidia'],
      gov: '灰厅 · 十二家族 · 西西里夫人',
      tag: '在这里，姓氏比名字重要。你属于哪个家族，决定你活到几岁、死在谁手上。'
    },
    {
      id: 'KJR', name: '谢拉格', en: 'Kjerag', reg: 'north', pop: 300, b: 4, le: 75.0, gap: 4.0,
      im: 6.0, u5: 8.0, med: 0.60, ppp: 0.78, gi: 0.42, urb: 52, edu: 11.6, ter: 30,
      ori: 1.2, cat: 0.9, war: 0, hom: 1.0, road: 10, mat: 34, alc: 1.4, smk: 28,
      net: 68, art: 0.40,
      race: ['feline', 'liberi', 'vulpo', 'ursus', 'elafia', 'caprinae'],
      gov: '三族议会 → 谢拉格议会 · 喀兰贸易',
      tag: '圣山上的雪不会为任何人停。喀兰贸易是这里唯一的窗，窗开多大由坐在窗边的人说了算。'
    },
    {
      id: 'SAMI', name: '萨米', en: 'Sami', reg: 'north', pop: 250, b: 5, le: 72.0, gap: 3.6,
      im: 8.0, u5: 11.0, med: 0.44, ppp: 0.62, gi: 0.36, urb: 30, edu: 9.4, ter: 16,
      ori: 1.4, cat: 2.2, war: 0.1, hom: 1.6, road: 12, mat: 60, alc: 1.7, smk: 30,
      net: 44, art: 0.70,
      race: ['elafia', 'ursus', 'feline', 'liberi', 'sarkaz'],
      gov: '诸部落 · 族树 · 雪祀密语',
      tag: '没有中央政府，只有族树和雪祀之间的低语。北原的坍缩每年都在往前挪一点，雪祀们用命去堵。'
    },
    {
      id: 'KDZ', name: '卡兹戴尔', en: 'Kazdel', reg: 'waste', pop: 300, b: 6, le: 60.0, gap: 3.0,
      im: 26.0, u5: 38.0, med: 0.22, ppp: 0.34, gi: 0.62, urb: 44, edu: 7.2, ter: 10,
      ori: 8.0, cat: 2.6, war: 1.0, hom: 18.0, road: 16, mat: 210, alc: 1.0, smk: 26,
      net: 30, art: 0.78,
      race: ['sarkaz', 'feline', 'lupo', 'phidia', 'savra'],
      gov: '魔王 · 十王庭 · 议会与军政府的循环',
      tag: '被称作「哀愁之地」，只是大地上一个模糊的小圆圈。它被毁灭过很多次，也重建过很多次。'
    },
    {
      id: 'SST', name: '汐斯塔', en: 'Siesta', reg: 'sea', pop: 30, b: 1, le: 78.0, gap: 3.8,
      im: 4.4, u5: 5.8, med: 0.84, ppp: 1.34, gi: 0.38, urb: 88, edu: 14.0, ter: 56,
      ori: 1.0, cat: 0.2, war: 0, hom: 2.4, road: 9, mat: 20, alc: 1.5, smk: 25,
      net: 88, art: 0.50,
      race: ['feline', 'perro', 'liberi', 'aegir', 'vulpo', 'sankta'],
      gov: '市议会 · 商会 · 黑曜石节筹备委员会',
      tag: '音乐、旅游与生态教育塑造城市生活。1098 年迁入新城后的体验，不能继续沿用旧城海滩。'
    },
    {
      id: 'AEG', name: '阿戈尔', en: 'Ægir', reg: 'sea', pop: 9000, b: 60, le: 88.0, gap: 3.0,
      im: 2.0, u5: 2.6, med: 0.96, ppp: 1.90, gi: 0.30, urb: 96, edu: 16.8, ter: 78,
      ori: 0.2, cat: 0.3, war: 0.1, hom: 0.8, road: 4, mat: 10, alc: 0.8, smk: 14,
      net: 92, art: 0.30,
      race: ['aegir', 'phidia', 'petram'],
      gov: '科学执政官 · 技术执政官 · 双院制',
      tag: '海底城市拥有发达技术和公共设施。公共养育、创作与工程构成日常生活；不同城市的能源与设施并不完全相同。'
    },
    {
      id: 'DUR', name: '杜林', en: 'Durin', reg: 'under', pop: 900, b: 10, le: 82.0, gap: 3.4,
      im: 5.0, u5: 6.6, med: 0.86, ppp: 1.30, gi: 0.36, urb: 92, edu: 15.0, ter: 60,
      ori: 0.8, cat: 0.4, war: 0, hom: 0.8, road: 6, mat: 18, alc: 1.3, smk: 22,
      net: 74, art: 0.68,
      race: ['durin', 'petram', 'feline', 'savra'],
      gov: '诸城邦自治 · 工程师行会',
      tag: '地下分布着多个杜林城邦，技术发达，各城邦又有各自的社会与生活习惯。并非全部位于阿卡胡拉地下。'
    },
    {
      id: 'LMN', name: '龙门', en: 'Lungmen', reg: 'east', pop: 500, b: 5, le: 80.0, gap: 4.0,
      im: 4.6, u5: 6.0, med: 0.82, ppp: 1.36, gi: 0.48, urb: 94, edu: 14.2, ter: 58,
      ori: 2.5, cat: 1.4, war: 0.1, hom: 3.4, road: 10, mat: 24, alc: 1.2, smk: 26,
      net: 88, art: 0.58,
      race: ['lung', 'feline', 'savra', 'liberi', 'vouivre', 'sarkaz', 'perro'],
      gov: '龙门总督府 · 近卫局 · 商业联合会',
      tag: '一座会走的城市，走在天灾的缝隙里。这里什么都能买到，包括不被登记的活着。'
    }
  ];

  /* ---------------------------------------------------------------------- */
  /* 人口快照                                                               */
  /* ---------------------------------------------------------------------- */
  /*
   * 单位统一为“万人”。带页码的值来自用户核对的《大地巡旅》设定集；
   * 书中未给出明确数字的国家保留可复现的推断值，并把来源类型写进状态，
   * 避免把推断误当成官方统计。高卢虽然有“3000 万遗民”的记载，但已灭国，
   * 不进入当前可出生国家和人口抽签。
   */
  TL.POPULATION_SNAPSHOT = 'terra-population-2026-10-19-v1';
  TL.POPULATION_REFERENCE = 'docs/data/population-2026-10-19.json';
  TL.POPULATION_DATA = {
    VIC:  { pop: 4000, sourceType: 'official-setting', sourcePages: ['p118'], confidence: 'reported', note: '《大地巡旅》p118' },
    LEI:  { pop: 3200, sourceType: 'official-setting', sourcePages: ['p137'], confidence: 'reported', note: '《大地巡旅》p137' },
    URS:  { pop: 8000, sourceType: 'official-setting', sourcePages: ['p147'], confidence: 'reported', note: '《大地巡旅》p147' },
    LAT:  { pop: 600,  sourceType: 'official-setting', sourcePages: ['p175'], confidence: 'reported', note: '《大地巡旅》p175' },
    CLB:  { pop: 1600, sourceType: 'official-setting', sourcePages: ['p238'], confidence: 'reported', note: '《大地巡旅》p238' },
    SST:  { pop: 30,   sourceType: 'official-setting', sourcePages: ['p248'], confidence: 'reported', note: '《大地巡旅》p248' },
    BLV:  { pop: 1600, sourceType: 'official-setting', sourcePages: ['p255'], confidence: 'reported', note: '《大地巡旅》p255' },
    SRG:  { pop: 10000, sourceType: 'official-setting', sourcePages: ['p279注'], confidence: 'reported', note: '《大地巡旅》p279 注' },
    RMB:  { pop: 2800, sourceType: 'official-setting', sourcePages: ['p312'], confidence: 'reported', note: '《大地巡旅》p312' },
    YAN:  { pop: 30000, sourceType: 'official-setting', sourcePages: ['p315'], confidence: 'reported', note: '《大地巡旅》p315' },

    /* 章节已查阅但未找到人口数字：保留既有模型值，明确标为推断。 */
    IBE:  { pop: 1417, sourceType: 'inferred', sourcePages: ['p182-p197'], analogue: '大静谧后沿海国家规模；沿用旧模型', confidence: 'inferred', note: '章节未见可核对人口数字' },
    AEG:  { pop: 9000, sourceType: 'inferred', sourcePages: ['p198-p207'], analogue: '深海文明的大型聚居网络；沿用旧模型', confidence: 'inferred', note: '章节未见可核对人口数字' },
    KJR:  { pop: 300, sourceType: 'inferred', sourcePages: ['p208-p216'], analogue: '高山小国；沿用旧模型', confidence: 'inferred', note: '章节未见可核对人口数字' },
    KAZ:  { pop: 1800, sourceType: 'inferred', sourcePages: ['p217-p227'], analogue: '核心圈工业国家；沿用旧模型', confidence: 'inferred', note: '章节未见可核对人口数字' },
    SIR:  { pop: 323, sourceType: 'inferred', sourcePages: ['p261-p271'], analogue: '家族城邦；沿用旧模型', confidence: 'inferred', note: '章节未见可核对人口数字' },
    MIN:  { pop: 600, sourceType: 'inferred', sourcePages: ['p284-p292'], analogue: '多城邦农业/文化区；沿用旧模型', confidence: 'inferred', note: '章节未见可核对人口数字' },
    SAMI: { pop: 250, sourceType: 'inferred', sourcePages: ['p293-p304'], analogue: '北境部落人口；沿用旧模型', confidence: 'inferred', note: '章节未见可核对人口数字' },

    /* 本轮没有提供页码的既有地区，继续作为推断值参与抽签。 */
    HIG:  { pop: 1600, sourceType: 'inferred', sourcePages: ['p325-p332'], analogue: '东方大型国家；沿用旧模型', confidence: 'inferred', note: '本轮未核对人口数字' },
    KDZ:  { pop: 300, sourceType: 'inferred', sourcePages: ['p333-p345'], analogue: '长期战争与流离人口；沿用旧模型', confidence: 'inferred', note: '本轮未核对人口数字' },
    DUR:  { pop: 900, sourceType: 'inferred', sourcePages: [], analogue: '地下城邦总和；沿用旧模型', confidence: 'inferred', note: '本轮未核对人口数字' },
    LMN:  { pop: 500, sourceType: 'inferred', sourcePages: ['p322-p324'], analogue: '龙门单城；沿用旧模型', confidence: 'inferred', note: '本轮未核对人口数字' }
  };

  TL.EXCLUDED_POPULATIONS = [
    { id: 'GAU', name: '高卢', pop: 3000, unit: '万人', sourcePages: ['p159'], counted: false, note: '高卢已灭国；遗民不作为当前国家人口计入抽签' }
  ];

  // sourceYear 表示统计/设定对应年份，未知必须为 null；不是下载年份。
  for (const n of TL.NATIONS) {
    const p = TL.POPULATION_DATA[n.id] || {};
    if (Number.isFinite(p.pop)) n.pop = p.pop;
    n.sourceYear = p.sourceYear == null ? null : p.sourceYear;
    n.sourceType = p.sourceType || 'inferred';
    n.analogue = p.analogue || null;
    n.confidence = p.confidence || 'inferred';
    n.sourcePages = p.sourcePages || [];
    n.populationSource = {
      snapshot: TL.POPULATION_SNAPSHOT,
      reference: TL.POPULATION_REFERENCE,
      birthWeightType: 'model-weight',
      pages: n.sourcePages,
      note: p.note || '本轮未核对人口数字'
    };
  }

  /** id → 国家对象 */
  TL.NATION_BY_ID = {};
  for (const n of TL.NATIONS) TL.NATION_BY_ID[n.id] = n;

  /* ---------------------------------------------------------------------- */
  /* 抽签权重                                                                */
  /* ---------------------------------------------------------------------- */
  /**
   * 原作的两种抽签口径：
   *   mode='birth' → 用年出生数 b（「此刻出生的婴儿」）
   *   mode='pop'   → 用人口 pop（「此刻生活的所有人」）
   * 结果差异很大：炎国人口占大陆的 ~38%，但因为生育率低，出生占比只有 ~28%；
   * 卡兹戴尔人口只占 0.4%，出生占比却有 0.6% —— 高生育率+高死亡率。
   */
  TL.buildLottery = function (mode) {
    const w = {};
    for (const n of TL.NATIONS) {
      w[n.id] = mode === 'pop' ? n.pop : n.b;
    }
    return w;
  };

  /** 计算某国在某种口径下的抽中概率（供「查询抽中概率」页面用） */
  TL.lotteryOdds = function (mode) {
    const w = TL.buildLottery(mode);
    let t = 0;
    for (const k in w) t += w[k];
    const out = [];
    for (const n of TL.NATIONS) out.push({ id: n.id, name: n.name, p: w[n.id] / t, weight: w[n.id] });
    out.sort((a, b) => b.p - a.p);
    return out;
  };

  /* ---------------------------------------------------------------------- */
  /* 区域死因基线（对应原作 CT[region][band]）                                */
  /* band: 0=<1岁 1=1-4岁 2=5-14岁 3=15-49岁 4=50-69岁 5=70+                     */
  /* 本作加入泰拉特有死因：ori(矿石病) / cat(天灾) / art(源石技艺反噬)         */
  /* ---------------------------------------------------------------------- */
  TL.CT = {
    core: [
      { neo: 46, con: 22, inf: 8, ocd: 24 },
      { con: 18, inj: 20, inf: 12, can: 8, ocd: 42 },
      { can: 24, inj: 20, con: 6, ocd: 50 },
      { can: 26, inj: 16, ori: 12, hom: 4, ocd: 30 },
      { can: 30, ihd: 18, str: 8, ori: 10, copd: 6, ocd: 20 },
      { ihd: 24, can: 22, dem: 14, str: 9, copd: 6, ocd: 18 }
    ],
    east: [
      { neo: 44, con: 26, inf: 6, ocd: 24 },
      { con: 20, inj: 18, inf: 10, ocd: 42 },
      { inj: 22, can: 14, con: 6, ocd: 52 },
      { can: 28, inj: 14, ori: 14, ocd: 36 },
      { can: 32, str: 16, ihd: 14, ori: 12, copd: 6, ocd: 18 },
      { str: 22, ihd: 20, can: 18, dem: 12, copd: 8, ocd: 16 }
    ],
    north: [
      { neo: 52, con: 20, inf: 10, ocd: 18 },
      { con: 16, inf: 14, inj: 16, cold: 10, ocd: 40 },
      { inj: 22, cold: 14, inf: 8, ocd: 52 },
      { inj: 22, alc: 18, ori: 14, hom: 8, can: 6, ocd: 28 },
      { ihd: 26, alc: 16, can: 14, ori: 12, copd: 8, str: 6, ocd: 16 },
      { ihd: 26, str: 18, can: 16, copd: 10, dem: 8, ocd: 18 }
    ],
    south: [
      { neo: 58, inf: 14, con: 12, ocd: 16 },
      { inf: 30, con: 12, inj: 12, heat: 8, ocd: 36 },
      { inj: 20, inf: 22, heat: 10, ocd: 46 },
      { inf: 24, inj: 18, heat: 12, ori: 14, hom: 8, ocd: 22 },
      { inf: 16, ihd: 18, can: 14, ori: 14, dia: 8, str: 6, ocd: 22 },
      { ihd: 24, str: 16, can: 14, inf: 12, copd: 10, dem: 6, ocd: 16 }
    ],
    west: [
      { neo: 54, con: 24, inf: 8, ocd: 14 },
      { con: 16, inj: 24, inf: 12, ocd: 46 },
      { inj: 30, hom: 10, can: 8, ocd: 50 },
      { hom: 30, inj: 22, ori: 14, can: 8, ocd: 24 },
      { can: 28, ihd: 18, hom: 8, ori: 12, cir: 8, ocd: 24 },
      { ihd: 26, can: 22, str: 12, copd: 8, dem: 8, ocd: 22 }
    ],
    sea: [
      { neo: 46, con: 26, inf: 8, ocd: 20 },
      { con: 16, drown: 24, inf: 14, ocd: 44 },
      { drown: 30, inj: 18, inf: 10, ocd: 40 },
      { drown: 20, inj: 20, ori: 16, sea: 14, ocd: 28 },
      { can: 24, ihd: 18, drown: 12, ori: 14, sea: 12, ocd: 18 },
      { ihd: 24, can: 20, dem: 14, str: 10, ocd: 20 }
    ],
    waste: [
      { neo: 62, con: 14, inf: 12, ocd: 10 },
      { inf: 26, cat: 16, inj: 14, con: 8, ocd: 34 },
      { cat: 30, inj: 22, inf: 12, ocd: 34 },
      { cat: 26, inj: 24, ori: 22, hom: 10, ocd: 16 },
      { ori: 30, can: 20, inj: 14, ihd: 12, copd: 8, ocd: 14 },
      { ori: 24, ihd: 20, can: 18, copd: 12, str: 10, ocd: 14 }
    ],
    under: [
      { neo: 44, con: 28, inf: 6, ocd: 22 },
      { con: 20, inj: 20, inf: 10, ocd: 48 },
      { inj: 26, can: 14, inf: 8, ocd: 50 },
      { inj: 24, can: 22, ori: 14, ocd: 38 },
      { can: 30, ihd: 18, copd: 14, ori: 12, str: 8, ocd: 16 },
      { ihd: 24, can: 22, copd: 16, dem: 12, str: 10, ocd: 14 }
    ]
  };

  /** 区域收入-死亡弹性（原作 MORT_G）：越大代表「穷」对死亡率的惩罚越重 */
  TL.MORT_G = { core: 0.15, east: 0.18, north: 0.22, south: 0.26, west: 0.22, sea: 0.20, waste: 0.28, under: 0.16 };

  /** 出生性别比（男 / 总数） */
  TL.SEX_RATIO = { YAN: 0.522, SRG: 0.514, URS: 0.516, LMN: 0.518, DUR: 0.512 };
  TL.sexRatio = function (id) { return TL.SEX_RATIO[id] || 0.512; };

  /* ---------------------------------------------------------------------- */
  /* 阶层 / 居住区域                                                          */
  /* ---------------------------------------------------------------------- */
  /**
   * 泰拉最残酷的事实不是「你在哪个国家」，而是「你在城墙的哪一侧」。
   *
   * 移动城市核心区、工业蓝领区、城市边缘与地下、荒野聚落 ——
   * 这四层之间的差距，比炎国与卡兹戴尔之间的差距还大。
   * 荒野上的一个菲林和核心区的菲林，生理极限完全一样（~90 岁），
   * 但前者大概率 40 岁就死于天灾或感染。
   *
   * 宏观人口分布（《大地巡旅》口径）：移动城市公民 ~45%，荒野流民 ~55%。
   */
  /**
   * 出身阶层：生理极限之外的第二个「寿命维度」。
   *
   * 泰拉的寿命不平等主要是**空间性**的：能不能移动，决定了天灾来的时候
   * 你有没有引擎可以点火。核心区与荒野的差距不是收入差距，是物种存续差距。
   *
   *   leK / leAbs  社会预期寿命（城市用国家 le 的形状，归一化后城市均值 = 国家 le；
   *                荒野用绝对区间，因为不能移动的地方不可能有 70 岁的社会预期寿命）
   *   imK / u5K    婴幼儿死亡率系数（干净水与过滤系统 vs 露天水井）
   *   ori          该阶层的**终生**矿石病感染概率区间
   *
   * 【ori 区间为什么比《大地巡旅》给的数字低】
   * 原稿给的是「荒野流民 30~50%、城市边缘 20~35%」。但那几个数字是
   * 「一辈子没离开过这里的人」的条件概率，不是人口加权后的患病率。
   * 直接照抄，再乘上本作约 1/3 的荒野人口占比，全大陆终生感染率会到 47% ——
   * 那等于说半个泰拉都是感染者，与「感染者是被迫害的少数群体」这一
   * 基本设定直接矛盾。所以这里按「加权后全大陆落在 15~20%」反推区间：
   * 城市受保护，荒野确实惨烈，但惨烈的是那三分之一，不是全部。
   */
  TL.STRATA = {
    core: {
      id: 'core', name: '移动城市核心区', en: 'Mobile City Core', short: '核心区', enShort: 'Core',
      desc: '过滤系统、稳定的供水、每次预警都能及时撤离。城墙以内的人不太想城墙以外的事。',
      city: 0.18, leK: 1.00, leAbs: null, imK: 1.0, u5K: 1.0, medK: 1.00,
      ori: [0.008, 0.025], catWarn: [3, 6], catHit: 0.22, urban: true
    },
    industrial: {
      id: 'industrial', name: '工业与蓝领区', en: 'Industrial & Blue-Collar Belt', short: '工业区', enShort: 'Industry',
      desc: '源石动力机械没有完全封闭，劳保用品按季度发。这里的人均寿命比核心区少十年。',
      city: 0.49, leK: 0.86, leAbs: null, imK: 1.4, u5K: 1.5, medK: 0.85,
      ori: [0.05, 0.10], catWarn: [3, 6], catHit: 0.34, urban: true
    },
    fringe: {
      id: 'fringe', name: '城市边缘与地下', en: 'City Fringe & Undercity', short: '边缘区', enShort: 'Fringe',
      desc: '工业废渣排到这里，下水道住着人。黑市什么都卖，包括让你看起来不像你自己。',
      city: 0.33, leK: 0.76, leAbs: null, imK: 2.0, u5K: 2.1, medK: 0.55,
      ori: [0.12, 0.24], catWarn: [3, 6], catHit: 0.52, urban: true
    },
    wild: {
      id: 'wild', name: '荒野聚落', en: 'Wilderness Settlement', short: '荒野', enShort: 'Wild',
      desc: '不能移动的地方。天灾来的时候没有引擎可以点火，只能跑，或者不跑。',
      city: 0, leK: null, leAbs: [35, 45], imK: 2.7, u5K: 2.9, medK: 0.30,
      ori: [0.20, 0.34], catWarn: [0, 1], catHit: 0.95, urban: false
    }
  };
  TL.STRATUM_LIST = ['core', 'industrial', 'fringe', 'wild'];

  /** 国家的亲都市程度：越富裕、越工业化的国家，城市人口占比越高 */
  TL.cityShare = function (nationId) {
    if (nationId === 'AEG' || nationId === 'DUR') return 1;
    const n = TL.NATION_BY_ID[nationId];
    return TL.clamp(n.urb / 100 * (0.85 + n.ppp * 0.45), 0.34, 0.92);
  };

  /**
   * 抽阶层。
   * 先按国家的城市人口占比决定「城里 / 荒野」，
   * 再在城市内部按 core / industrial / fringe 的配比细分；家境好的人更靠内。
   */
  TL.drawStratum = function (nationId, q, rnd) {
    if (nationId === 'AEG') return 'marine';
    if (nationId === 'DUR') return 'subterranean';
    const cs = TL.cityShare(nationId);
    if (rnd() >= cs) return 'wild';
    const w = {
      core: 0.18 * Math.pow(1.55, q - 3),
      industrial: 0.49,
      fringe: 0.33 * Math.pow(0.72, q - 3)
    };
    let t = 0; for (const k in w) t += w[k];
    let x = rnd() * t;
    for (const k in w) { x -= w[k]; if (x <= 0) return k; }
    return 'industrial';
  };

  TL.stratum = function (id) { return TL.STRATA[id] || TL.STRATA.industrial; };

  /**
   * 阶层决定的社会预期寿命。
   *
   * 城市内部：core / industrial / fringe 的 leK 只是「形状」，最后要归一化，
   * 使城内的加权平均正好等于国家的社会预期寿命 n.le —— 否则国家的 le
   * 就失去意义了（早期版本直接用 n.le * leK，结果全国平均寿命被整体拉高）。
   *
   * 荒野：用绝对区间。不能移动的地方不可能有 70 岁的社会预期寿命，
   * 区间内位置由国家的发展水平决定。
   */
  TL.CITY_W = { core: 0.18, industrial: 0.49, fringe: 0.33 };

  TL.stratumLE = function (nationId, stratumId) {
    const n = TL.NATION_BY_ID[nationId];
    const s = TL.stratum(stratumId);
    if (s.directLE) return n.le * s.leK;
    if (s.leAbs) {
      const t = TL.clamp((n.ppp - 0.3) / 1.3, 0, 1);
      return s.leAbs[0] + (s.leAbs[1] - s.leAbs[0]) * t;
    }
    // 城内形状的加权平均（只算城市三项）
    let avg = 0, tot = 0;
    for (const k in TL.CITY_W) {
      const st = TL.STRATA[k];
      if (st.leK == null) continue;
      avg += TL.CITY_W[k] * st.leK;
      tot += TL.CITY_W[k];
    }
    avg /= tot;
    return n.le * s.leK / avg;
  };

  /* ---------------------------------------------------------------------- */
  /* 各国对感染者的容忍度（Tolerance Index 0~100，越高越宽容）                 */
  /* ---------------------------------------------------------------------- */
  /**
   * 依据《大地巡旅》中各国的政治体制与法典量化。数字决定一个感染者
   * 会被「抓捕、奴役、驱逐，还是可以合法生存」。
   *
   *   Tier 0 (0-15)  极度迫害与苦役
   *   Tier 1 (15-35) 体制化隔离与排斥
   *   Tier 2 (35-55) 资本盘剥与工具化
   *   Tier 3 (55-75) 行政收容与有限庇护
   *   Tier 4 (75-100) 平权 / 感染者自治
   */
  TL.TOLERANCE = {
    URS: 8,    // Tier 0  感染即丧失全部人权，纠察队可就地扑杀或押送北原矿区为奴工
    IBE: 22,   // Tier 1  审判庭视之为异端印记，海岸封锁线
    LAT: 26,   // Tier 1  萨科塔感染者冲击信仰，外邦感染者不可居留
    KJR: 28,   // Tier 1  传统时期视为「神罚与不洁」，直接驱逐流放
    VIC: 33,   // Tier 1  丧失公民权，沦为蒸汽工厂底层或驱入下水道
    BLV: 40,   //         三方割据，谁都顾不上
    CLB: 44,   // Tier 2  表面人人平等，实际用作开拓耗材与活体受试者
    SRG: 46,
    KAZ: 50,   // Tier 2  剥夺公民身份驱逐至贫民窟，却设「感染者骑士」作残酷竞技秀
    HIG: 52,
    LEI: 56,
    MIN: 58,
    LMN: 60,
    YAN: 64,   // Tier 3  设安居司与善堂，有官方抑制药；城内物理隔离但禁止虐杀
    RMB: 66,   // Tier 3  采矿立国感染普遍，矿工工会互助，医疗水平有限
    SIR: 68,   // Tier 3  家族只讲利益与忠诚，感染者多但全无公共保障
    SAMI: 70,
    SST: 72,
    DUR: 82,   // Tier 4  地下城邦几乎不感染，缺乏恐惧的对象
    AEG: 86,
    KDZ: 92    // Tier 4  萨卡兹群体中矿石病是常态，社会不以它为歧视指标
  };

  /** 感染者容忍度。给 year 时会叠加时间轴上的位移（大静谧收紧、特锦赛后放宽）。 */
  TL.tolOf = function (id, year) {
    const base = TL.TOLERANCE[id] != null ? TL.TOLERANCE[id] : 50;
    if (year == null || !TL.tlMods) return base;
    return TL.clamp(base + TL.tlMods(id, year).tol, 0, 100);
  };

  TL.tolTier = function (id, year) {
    const v = TL.tolOf(id, year);
    if (v < 15) return 0;
    if (v < 35) return 1;
    if (v < 55) return 2;
    if (v < 75) return 3;
    return 4;
  };

  /** 各梯队的具体后果。lifeK 直接乘在感染者的预期剩余寿命上。 */
  TL.TOL_INFO = [
    {
      name: '极度迫害与苦役',
      desc: '感染即丧失全部人权。纠察队有权就地扑杀或秘密抓捕，绝大多数感染者被押运至北原矿区作为奴工，严禁任何药物流入。',
      lifeK: 0.20, arrest: 0.42, treatP: 0.02
    },
    {
      name: '体制化隔离与排斥',
      desc: '感染者丧失公民权或被视为不洁，被逐出主城、驱入底层。外邦感染者通常不可居留。',
      lifeK: 0.40, arrest: 0.20, treatP: 0.10
    },
    {
      name: '资本盘剥与工具化',
      desc: '表面人人平等。只要还有利用价值或财富，就能苟延残喘；一旦失去价值便被无情抛弃。',
      lifeK: 0.62, arrest: 0.08, treatP: 0.26
    },
    {
      name: '行政收容与有限庇护',
      desc: '设有收容机构与官方抑制药，实行物理隔离并限制户籍，但禁止肆意虐杀。有基本生存空间，社会天花板极低。',
      lifeK: 0.85, arrest: 0.02, treatP: 0.45
    },
    {
      name: '平权与感染者自治',
      desc: '社会不以矿石病为歧视指标，可获得医学尊重与药物支持。死因主要由战争或疾病自然进展决定。',
      lifeK: 1.00, arrest: 0.00, treatP: 0.60
    }
  ];

  TL.tolInfo = function (id, year) { return TL.TOL_INFO[TL.tolTier(id, year)]; };

})(window.TL = window.TL || {});
