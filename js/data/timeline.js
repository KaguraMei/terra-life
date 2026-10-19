/* ==========================================================================
 * TERRA LIFE SIM — 泰拉大事件年表
 * --------------------------------------------------------------------------
 * 数据来源与设计说明见 docs/泰拉大事件年表.md。这里只讲实现上的三条规矩：
 *
 * ① 大事件不取代人生，只改写人生的背景。
 *    事件带来的死亡永远是**条件性**的 —— 只有你确实在那座城里才可能死。
 *    一个生在汐斯塔的人不会死于伦蒂尼姆战役。
 *
 * ② 生命表是慢变量，事件是快变量。
 *    事件绝不重算 q(x)。四皇会战不改变维多利亚人的生理寿命，
 *    它只改变那几年谁死了、谁破产了、谁搬走了。把事件做进生命表，
 *    模型就再也解释不清自己了。
 *
 * ③ 远方也要留下痕迹。
 *    感知分三档：here（亲历）/ near（同大区，只听说）/ far（一句船期新闻）。
 *    三档都有旁白；能挂上经济或风险修正的，远方也挂一份小的。
 *
 * 记录结构：
 *   { id, year, title, book,
 *     scope: { nations: [...], regions: [...] },   // 谁能「亲历」
 *     here / near / far,                            // 三档旁白
 *     fx: { NAT: { war, warDur, cat, catDur, ori, oriDur, mort, mortDur,
 *                  money, tol, tolDur, h, hl, so, sm, arts } },
 *     globals: { money, h, tol, tolDur, ori, oriDur },   // 不分国籍
 *     at: [ { when, text, eff:{}, flag, money, die, dieCause, move } ] }
 * ========================================================================== */
(function (TL) {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* 出生年份                                                                */
  /* ---------------------------------------------------------------------- */
  /**
   * 抽一个泰拉历出生年份。
   * 不是固定值 —— 你没法选择自己生在哪个时代，这本来就是这游戏的第一条规则。
   * 三段分权：前两段让人生覆盖 1070–1090s 的密集期，第三段只能从长辈口中听说。
   */
  TL.drawBirthYear = function (rnd) {
    const r = rnd();
    if (r < 0.30) return 1042 + Math.floor(rnd() * 24);   // 1042–1065：1070s 时 5–35 岁
    if (r < 0.80) return 1066 + Math.floor(rnd() * 22);   // 1066–1087：1090s 时 7–33 岁
    return 1088 + Math.floor(rnd() * 8);                  // 1088–1095：主角是别人的父辈
  };

  /** 年表最早与最晚的年份，供界面提示「年表之外」 */
  TL.TL_SPAN = [1031, 1099];

  // 组织出场年由 organizations.js 的注册表维护。这里保留一个只读
  // 快照供年表/调试工具使用，避免旧代码继续依赖散落的 from 数字。
  TL.ORGANIZATION_ERAS = {};
  (TL.ORGANIZATION_LIST || []).forEach(id => {
    const o = TL.ORGANIZATIONS[id];
    TL.ORGANIZATION_ERAS[id] = {
      from: o.fromYear == null ? 0 : o.fromYear,
      recruitUntil: o.recruitUntil,
      sourceType: o.sourceType,
      confidence: o.confidence
    };
  });
  if (!TL.organizationAvailable) {
    TL.organizationAvailable = function (S, id) {
      const era = TL.ORGANIZATION_ERAS[id];
      return !!era && Number.isFinite(S.year) && S.year >= era.from;
    };
  }
  TL.contentAvailable = function (S, item) {
    if (!item || item.disabledReason) return false;
    let orgOK = true;
    if (item.organization) {
      const os = TL.organizationState ? TL.organizationState(S, item.organization) : null;
      orgOK = os ? os.available :
        TL.organizationAvailable(S, item.organization);
      if (item.recruitment && os && !os.recruitment) orgOK = false;
    }
    return orgOK && (item.fromYear == null || S.year >= item.fromYear) &&
      (item.untilYear == null || S.year <= item.untilYear);
  };

  /* ---------------------------------------------------------------------- */
  /* 年表                                                                    */
  /* ---------------------------------------------------------------------- */
  TL.TIMELINE = [

    /* ==================== 维多利亚 ==================== */
    {
      id: 'vic_four_emperors', year: 1031, title: '四皇会战与高卢覆灭', book: '大陆',
      scope: { nations: ['VIC', 'LEI', 'URS'], regions: [] },
      here: '三国联军凯旋。报纸上连登了四十天，每一版都是同一张地图，边界一次比一次往西。',
      near: '高卢没了。你们这边的码头一夜之间多出来很多说外语的人，行李很少，眼神很多。',
      far: '听说西边有个帝国被三个国家分了。写信回来的人说，那里的钟楼现在归别人管。',
      back: '西边那个叫高卢的帝国就已经没了。你出生的时候，地图早就是三个国家分的了。',
      fx: {
        VIC: { money: 3, war: -0.20, warDur: 20, tol: -2, tolDur: 20, h: 6 },
        LEI: { money: 2, h: 5, arts: 2 },
        URS: { money: 1, war: -0.10, warDur: 15 }
      },
      globals: { money: -0.5 }
    },
    {
      id: 'vic_tara', year: 1072, title: '塔拉大起义', book: '维多利亚',
      scope: { nations: ['VIC'], regions: [] },
      here: '塔拉那边打起来了。军队开过去的时候走的是你们这条线，天亮前过完，一整天路上没人说话。',
      near: '邻国的塔拉地区在打仗。逃过来的人说，他们那里现在不许讲塔拉话。',
      far: '维多利亚在镇压一个叫塔拉的地方。新闻只有三行。',
      fx: { VIC: { war: 0.35, warDur: 3, mort: 1.15, mortDur: 3, tol: -3, tolDur: 6 } },
      at: [
        {
          when: S => S.race === 'draco' && S.nation === 'VIC',
          flag: 'tara', text: '你家被查过两次。第二次他们翻走了祖父留下的一只箱子，没有说为什么。',
          eff: { h: -12, so: -4 }
        }
      ]
    },
    {
      id: 'vic_regicide', year: 1077, title: '二十一人公爵会议与弑君', book: '维多利亚',
      scope: { nations: ['VIC'], regions: [] },
      here: '国王在议会被绞死了。签判决书的是二十一个公爵。第二天街上很安静，安静得不正常。',
      near: '维多利亚的国王被自己的贵族处决了。听说王位要空很久。',
      far: '维多利亚没有国王了。',
      fx: {
        VIC: { war: 0.25, warDur: 22, money: -1.5, tol: -3, tolDur: 10, h: -8 }
      },
      globals: { h: -2 }
    },
    {
      id: 'vic_londinium', year: 1098, title: '伦蒂尼姆事变与萨卡兹进驻', book: '维多利亚',
      scope: { nations: ['VIC'], regions: [] },
      here: '萨卡兹的军队进了首都。城门口换了岗，通行证重新发，夜里不许开窗。',
      near: '伦蒂尼姆被萨卡兹接管了。据说是某位公爵请他们进去的。',
      far: '维多利亚的首都现在由萨卡兹驻防。',
      fx: {
        VIC: { war: 0.45, warDur: 2, tol: -10, tolDur: 2, money: -1, mort: 1.1, mortDur: 2 }
      },
      at: [
        {
          when: S => S.city && S.city.indexOf('伦蒂尼姆') >= 0 && S.ori && S.ori.stage > 0,
          flag: 'martial_law', text: '戒严第三天，有人来敲你的门。你没有开。他们也没有再敲。',
          eff: { h: -14 }
        },
        {
          when: S => S.race === 'sarkaz',
          text: '街上忽然多了很多和你一样的人。你分不清这是安心还是更不安心。',
          eff: { h: 6, so: -6 }
        }
      ]
    },
    {
      id: 'vic_shard', year: 1098, title: '碎片大厦启动与伦蒂尼姆战役', book: '维多利亚',
      scope: { nations: ['VIC'], regions: [] },
      here: '天灾武器启动了。整座城市在打，谁和谁打你到最后也没分清。',
      near: '伦蒂尼姆在烧。从这边能看见天边那一块颜色不对。',
      far: '维多利亚内战，首都工业区大面积损毁。',
      fx: {
        VIC: { war: 0.60, warDur: 2, cat: 0.70, catDur: 2, mort: 1.25, mortDur: 2, money: -3, tol: -4, tolDur: 3 }
      },
      at: [
        {
          when: S => S.city && S.city.indexOf('伦蒂尼姆') >= 0,
          die: 0.045, dieCause: 'war', flag: 'ruins',
          text: '你从地下的一段管廊里爬出来的时候，身后那半个城区已经不在了。',
          eff: { hl: -20, h: -16 }, money: -4
        },
        {
          when: S => S.opClass != null,
          text: '你认得其中一面旗。你曾经在那面旗下面站过队。',
          eff: { h: -8 }
        }
      ]
    },

    /* ==================== 乌萨斯 ==================== */
    {
      id: 'urs_bloodpeak', year: 1068, title: '血峰战役', book: '战争',
      scope: { nations: ['URS', 'KAZ'], regions: [] },
      here: '血峰那边打完了。回来的车厢是空的，装的是别的东西。',
      near: '乌萨斯和卡西米尔在边境打了一场大仗，两边都没赢。',
      far: '第十次乌萨斯-卡西米尔战争结束，双方停战。',
      fx: {
        URS: { war: 0.30, warDur: 2, mort: 1.12, mortDur: 2, money: -1 },
        KAZ: { war: 0.30, warDur: 2, mort: 1.12, mortDur: 2, money: -1 }
      }
    },
    {
      id: 'urs_purge', year: 1077, title: '大叛乱与旧贵族清洗', book: '乌萨斯',
      scope: { nations: ['URS'], regions: [] },
      here: '内卫和纠察队上街了。名单是夜里定的，人是白天带走的。',
      near: '乌萨斯在清洗自己的军官。逃过来的人里有一半穿着旧军装。',
      far: '乌萨斯内乱，皇帝下令清洗军方。',
      fx: {
        URS: { war: 0.50, warDur: 3, tol: -8, tolDur: 10, mort: 1.30, mortDur: 3, money: -2, h: -10 }
      },
      at: [
        {
          when: S => S.q >= 4 && !S.flags.exiled,
          flag: 'exiled', move: '北原', money: -4,
          text: '你家在名单上。列车往北开了六天，窗外的树越来越少，最后没有了。',
          eff: { h: -18, so: -8 }
        },
        {
          when: S => S.q < 4,
          text: '你们那条街上被带走三户。第三户的门到现在还开着。',
          eff: { h: -8 }
        }
      ]
    },
    {
      id: 'urs_koval', year: 1089, title: '柯瓦尔矿场暴动', book: '矿石病',
      scope: { nations: ['URS'], regions: [] },
      here: '北原的矿场反了。消息传过来的时候已经被压下去了，但传过来的东西比消息多。',
      near: '乌萨斯的感染者矿工暴动了。镇压得很厉害，据说死了很多人。',
      far: '乌萨斯北原矿区发生暴动。',
      fx: { URS: { ori: 0.50, oriDur: 5, tol: -4, tolDur: 6, war: 0.15, warDur: 2 } },
      at: [
        {
          when: S => S.nation === 'URS' && S.ori && S.ori.stage > 0,
          flag: 'reunion_seed',
          text: '有人在墙上写了一个词，第二天被刷掉了。你记住的是那个词，不是刷子。',
          eff: { h: 8, so: 6 }
        },
        {
          when: S => S.nation === 'URS' && ['oriminer', 'miner', 'slave'].indexOf(S.job) >= 0,
          die: 0.03, dieCause: 'slave',
          text: '你们这一棚被点了名。你不在最前面，也不在最后面。'
        }
      ]
    },
    {
      id: 'urs_cherobog', year: 1096, title: '切尔诺伯格停泊事变', book: '天灾',
      scope: { nations: ['URS', 'YAN'], regions: [] },
      here: '整合运动攻入切尔诺伯格，天灾随后袭来，城市最终陷落。针对平民的杀戮与失控的暴力蔓延。',
      near: '切尔诺伯格没了。核心城后来被设定去撞龙门，最后废弃在荒野上。',
      far: '乌萨斯一座移动城市被攻占，险些引发与炎国的战争。',
      fx: {
        URS: { war: 0.50, warDur: 3, cat: 1.20, catDur: 1, money: -2, mort: 1.15, mortDur: 2 },
        YAN:  { war: 0.40, warDur: 2, money: -1, tol: -6, tolDur: 3 }
      },
      globals: { ori: 0.10, oriDur: 2 },
      at: [
        {
          when: S => S.nation === 'URS' && !S.refugee && S.city && S.city.indexOf('切尔诺伯格') >= 0,
          die: 0.10, dieCause: 'cat', move: '流民', flag: 'cherobog', money: -4,
          // 保留原有总直接风险，区分灾害与袭击；比例是游戏规则，不是设定统计。
          fatalOutcomes: [
            { cause: 'cat', text: '逃离切尔诺伯格时，天灾摧毁了你所在的街区。' },
            { cause: 'hom', when: S => S.affiliation !== 'reunion',
              text: '你没能躲过切尔诺伯格街区的整合运动武装。针对平民的袭击夺走了你的生命；这与是否接受过营地邀请无关。' }
          ],
          text: '你身在切尔诺伯格。天灾、整合运动的袭击和崩溃的秩序封住了街道，感染者身份也不能保证安全。',
          eff: { hl: -20, h: -18, so: -8 }
        },
        {
          when: S => S.opClass != null && !S.flags.rhodes_cherobog,
          flag: 'rhodes_cherobog',
          text: '你随队进了城。抬出来的人比你预想的多，比你记得的少。',
          eff: { h: -10, so: 4 }
        }
      ]
    },

    /* ==================== 炎国 ==================== */
    {
      id: 'yan_sui', year: 1000, title: '大荒落之役（岁兽）', book: '传说',
      // 立国传说：不按年份触发，改成童年的一次旁白机会
      legend: true, scope: { nations: ['YAN'], regions: [] },
      here: '老人说，很久以前朝廷把一头叫「岁」的巨兽斩成了十二块。你说那是故事，他说那是账。',
      near: '炎国有十二块碎片的故事，据说每一块都还醒着。',
      far: '炎国古史里有一头被分尸的巨兽。',
      fx: {},
      at: [{ when: S => S.nation === 'YAN', eff: { sm: 2, so: 2 }, flag: 'sui_tale' }]
    },
    {
      id: 'yan_shangshu', year: 1097, title: '尚蜀器物活化事件', book: '炎国',
      scope: { nations: ['YAN'], regions: [] },
      here: '城里的机关自己动了起来，古卷摊开在街上。司岁台封了三条街，收了半个月的东西。',
      near: '炎国的尚蜀出了怪事，说是旧卷子活了。',
      far: '炎国尚蜀行政区一度封锁，现已解除。',
      fx: { YAN: { money: -0.8, h: -4, arts: 1 } },
      at: [
        {
          when: S => S.city && S.city.indexOf('尚蜀') >= 0,
          flag: 'artifact', text: '你捡到过一页。它在手里是热的，第二天就不见了。',
          eff: { arts: 6, h: 6 }
        },
        {
          when: S => ['witch', 'caster', 'artsmith'].indexOf(S.job) >= 0,
          text: '同行里有人被请去了司岁台，回来之后什么也不肯说。'
        }
      ]
    },
    {
      id: 'yan_yumen', year: 1098, title: '玉门关塞防卫战', book: '炎国',
      scope: { nations: ['YAN'], regions: [] },
      here: '玉门的动力核心被人从里面破坏了。关外的巨兽残余跟着动，守将和游侠一起顶了三天。',
      near: '炎国的边关城被破坏了动力核心，差点走不动。',
      far: '炎国边陲移动城邦遇袭。',
      fx: { YAN: { cat: 0.50, catDur: 1, war: 0.20, warDur: 1 } },
      at: [
        {
          when: S => S.city && S.city.indexOf('玉门') >= 0,
          die: 0.02, dieCause: 'beast',
          text: '三天里你没合过眼。第三天早上，关外安静了。'
        },
        {
          when: S => ['soldier', 'guard', 'mercenary', 'bounty'].indexOf(S.job) >= 0,
          text: '守将按功行赏。你的名字在第三页。', eff: { h: 8 }, money: 1
        }
      ]
    },
    {
      id: 'yan_dahuang', year: 1099, title: '大荒城司农寺农牧危机', book: '炎国',
      scope: { nations: ['YAN'], regions: [] },
      here: '地脉治理出了岔子，旱稻试验田废了大半。天师府和司农寺互相递了三个月的折子。',
      near: '炎国的农政出了大问题，粮价在涨。',
      far: '炎国大荒城农牧减产。',
      fx: { YAN: { money: -1, ori: 0.15, oriDur: 3, mort: 1.08, mortDur: 2 } }
    },

    /* ==================== 卡西米尔 ==================== */
    {
      id: 'kaz_union', year: 1050, title: '商业联合会建立与骑士阶层重构', book: '卡西米尔',
      scope: { nations: ['KAZ'], regions: [] },
      here: '联合会成立了。从这一年起，骑士的头衔开始按赛季卖。',
      near: '卡西米尔的骑士变成了生意。',
      far: '卡西米尔骑士竞技职业化。',
      fx: { KAZ: { money: 1.5, war: -0.20, warDur: 25, tol: -2, tolDur: 20 } },
      at: [{ when: S => S.nation === 'KAZ' && S.q <= 2, text: '你去看过一场。票价是你家半个月的开销。', eff: { h: 4 } }]
    },
    {
      id: 'kaz_nearl', year: 1072, title: '临光家族「黜落」风波', book: '卡西米尔',
      scope: { nations: ['KAZ'], regions: [] },
      here: '临光家的长子夫妇失踪了。联合会没有解释，报纸也没有追问。',
      near: '卡西米尔有个老牌骑士家族出了事。',
      far: '卡西米尔骑士名门发生失踪事件。',
      fx: { KAZ: { h: -3 } },
      at: [{ when: S => S.job === 'knight', text: '你认识他们家的小女儿。她那时候还很小。', eff: { h: -6 }, money: -0.5 }]
    },
    {
      id: 'kaz_radiant', year: 1094, title: '耀骑士流放', book: '矿石病',
      scope: { nations: ['KAZ'], regions: [] },
      here: '玛嘉烈·临光在竞技场上公开了自己的诊断。第二天她被剥夺称号，逐出国境。',
      near: '卡西米尔把一位冠军骑士赶走了，因为她感染了。',
      far: '卡西米尔耀骑士因感染矿石病被流放。',
      fx: { KAZ: { tol: -5, tolDur: 4, h: -4 } },
      at: [
        {
          when: S => S.nation === 'KAZ' && S.ori && S.ori.stage > 0,
          text: '你第一次觉得，站在灯光下面也许不是坏事。', eff: { h: 6, so: 4 }
        },
        {
          when: S => S.nation === 'KAZ' && S.job === 'knight' && S.ori && S.ori.stage > 0,
          flag: 'disgraced', text: '他们用同一条律条对你。你比她知道得早，也比她安静。', money: -2
        }
      ]
    },
    {
      id: 'kaz_major', year: 1097, title: '第二十四届特锦赛与感染者大起义', book: '矿石病',
      scope: { nations: ['KAZ'], regions: [] },
      here: '她回来拿了冠军。同一天晚上，地下断电了，红松骑士团从下面上来。',
      near: '卡西米尔大骑士领断电，感染者在城里暴动。',
      far: '卡西米尔爆发感染者起义，商业联合会妥协。',
      fx: { KAZ: { war: 0.40, warDur: 2, money: -2, tol: 8, tolDur: 15 } },
      globals: { tol: 2, tolDur: 6 },
      at: [
        {
          when: S => S.nation === 'KAZ' && S.city && S.city.indexOf('大骑士领') >= 0,
          die: 0.03, dieCause: 'war',
          text: '断电的第四个小时，你摸黑走回了家。路上有人递给你一根蜡烛。'
        },
        {
          when: S => S.nation === 'KAZ' && S.ori && S.ori.stage > 0,
          flag: 'redpine', text: '他们最后让了一步。你数了数，这一步走了多少年。', eff: { h: 14, so: 8 }
        },
        {
          when: S => S.ori && S.ori.stage > 0 && S.nation !== 'KAZ',
          text: '很远的地方有人在街上喊了一句和你有关的话。你听见了。', eff: { h: 4 }
        }
      ]
    },

    /* ==================== 哥伦比亚 ==================== */
    {
      id: 'clb_independence', year: 1019, title: '独立战争与拓荒宪章', book: '哥伦比亚',
      scope: { nations: ['CLB'], regions: [] },
      here: '独立了。《拓荒法案》贴到每个镇子上：往西去，地就是你的。',
      near: '哥伦比亚从维多利亚手底下独立了，正在往西边招人。',
      far: '哥伦比亚独立建国，颁布拓荒法案。',
      back: '哥伦比亚就已经不是维多利亚的殖民地了。《拓荒法案》贴了三十年，往西去的人还是没断过。',
      fx: { CLB: { money: 1, cat: 0.30, catDur: 20, ori: 0.20, oriDur: 15, h: 5 } }
    },
    {
      id: 'clb_goldrush', year: 1075, title: '工业淘金热与山地开拓潮', book: '哥伦比亚',
      scope: { nations: ['CLB'], regions: [] },
      here: '雷神工业和莱茵生命都是这几年起来的。西边的山被一寸一寸买走。',
      near: '哥伦比亚的源石精炼技术领先了，钱往那边流。',
      far: '哥伦比亚工业与科研大突破。',
      fx: {
        CLB: { money: 2, tol: -3, tolDur: 8, ori: 0.20, oriDur: 10, cat: 0.20, catDur: 8 }
      },
      globals: { money: 0.5 },
      at: [{
        when: S => S.nation === 'CLB' && S.stratum === 'wild',
        flag: 'displaced',
        text: '勘探队来了，说这片地下面有东西。你们搬了。没有人问你们愿不愿意。',
        eff: { h: -10, so: -6 }, money: -1
      }]
    },
    {
      id: 'clb_lonestar', year: 1099, title: '「孤星」计划与破天事件', book: '大陆',
      scope: { nations: ['CLB'], regions: [] },
      // 唯一一条所有人都抬头看见了的事件
      here: '天上裂开了一道。那不是天灾，天灾不长这样。',
      near: '特里蒙那边打上去一束光，然后天上有了一道缝。',
      far: '有人把天捅开了一个口子。那天晚上，所有人都在抬头。',
      fx: { CLB: { money: 2, tol: 2, tolDur: 6 } },
      // 不分国籍、不分阶层的一次集体震动
      globals: { h: 10, sm: 1 },
      at: [
        {
          when: S => ['scholar', 'teacher', 'journalist', 'caster', 'alchemist'].indexOf(S.job) >= 0,
          text: '你把手里的东西放下了。你那个晚上没有睡，而且你并不觉得困。',
          eff: { sm: 4, h: 6 }
        },
        {
          when: S => S.stratum === 'wild',
          text: '荒野上看得最清楚。你那天晚上是站着看的，一直站到腿麻。',
          eff: { h: 4 }
        }
      ]
    },

    /* ==================== 萨卡兹 / 卡兹戴尔 ==================== */
    {
      id: 'kdz_six', year: 900, title: '卡兹戴尔的六次毁灭', book: '传说',
      legend: true, scope: { nations: ['KDZ'], regions: [] },
      here: '长辈说，这座城市被烧过六次。他说这话的时候在数手指，数完还剩四根。',
      near: '卡兹戴尔被剿灭同盟烧过六次，每一次都重建了。',
      far: '卡兹戴尔有六次亡城记录。',
      fx: {},
      at: [{ when: S => S.race === 'sarkaz' || S.nation === 'KDZ', eff: { h: -6, so: 4 }, flag: 'six_burnings' }]
    },
    {
      id: 'kdz_babel', year: 1086, title: '巴别塔组织成立', book: '卡兹戴尔',
      scope: { nations: ['KDZ'], regions: [] },
      here: '有人在荒原上挖出一条船，然后竖了一面旗。旗上写着「巴别塔」。',
      near: '卡兹戴尔有个人挖出了一艘陆行舰，说是要做点不一样的事。',
      far: '卡兹戴尔出现名为「巴别塔」的组织。',
      fx: { KDZ: { tol: 5, tolDur: 12, h: 4, money: 0.5 } },
      at: [{
        when: S => S.race === 'sarkaz' && S.arts >= 70 && !S.opClass,
        text: '有人找过你。他们没说要你做什么，只问了你一个问题。',
        eff: { h: 5, so: 3 }, flag: 'babel_ask'
      }]
    },
    {
      id: 'kdz_decap', year: 1094, title: '卡兹戴尔斩首行动', book: '卡兹戴尔',
      scope: { nations: ['KDZ'], regions: [] },
      here: '旗舰遇袭，她死了。第二天军事委员会接管了一切，没有人反对。',
      near: '巴别塔的领袖被刺杀了，组织散了。',
      far: '卡兹戴尔巴别塔组织崩溃。',
      fx: { KDZ: { war: 0.50, warDur: 5, h: -14, mort: 1.20, mortDur: 3, tol: -6, tolDur: 8 } },
      at: [
        { when: S => S.race === 'sarkaz', text: '你认识的人里有三个去了那面旗下面。回来了一个。', eff: { h: -10, so: -4 } },
        { when: S => S.opClass != null, text: '你在名册上见过那个名字。你没想到会是以这种方式再见到。', eff: { h: -16 } },
        {
          when: S => S.flags.babel_ask && !S.opClass,
          die: 0.08, dieCause: 'war',
          text: '你最后还是去了。你没有告诉家里。'
        }
      ]
    },

    /* ==================== 莱塔尼亚 ==================== */
    {
      id: 'lei_four_emperors', year: 1031, title: '四皇会战获利', book: '莱塔尼亚',
      scope: { nations: ['LEI'], regions: [] },
      here: '高卢的乐谱和法术手稿运回来了，整整七十车。选帝侯们为怎么分吵了半年。',
      near: '莱塔尼亚从高卢那里分到了不少东西。',
      far: '莱塔尼亚获得高卢法术与乐律遗产。',
      fx: { LEI: { money: 2, arts: 2, h: 4 } }
    },
    {
      id: 'lei_september', year: 1077, title: '九月起义与夕照区之变', book: '莱塔尼亚',
      scope: { nations: ['LEI'], regions: [] },
      here: '双子女皇在高塔上结束了巫王。钟响了整整一夜，第二天开始，法律上不再有「巫王」这个词。',
      near: '莱塔尼亚的巫王被杀，现在由两位女皇共治。',
      far: '莱塔尼亚政权更迭，巫王身死。',
      fx: { LEI: { war: 0.40, warDur: 2, tol: 6, tolDur: 15, money: -1, h: 6 } },
      at: [
        { when: S => S.nation === 'LEI', die: 0.025, dieCause: 'war', text: '夕照区那晚在打。你躲在酒窖里，听见上面有东西碎了很久。' },
        {
          when: S => S.nation === 'LEI' && ['caster', 'witch', 'musician'].indexOf(S.job) >= 0,
          flag: 'witchking_remnant',
          text: '秋天有人来找你喝茶。他谈的全是乐理，走的时候留了一个地址。',
          eff: { h: -4 }
        }
      ]
    },
    {
      id: 'lei_twinight', year: 1099, title: '崔林特尔梅之夜', book: '莱塔尼亚',
      scope: { nations: ['LEI'], regions: [] },
      here: '「巫王之音」响了。全城的人都听见了，但没有人能说出那是什么调子。',
      near: '崔林特尔梅出了事，据说是几十年前那个巫王留下的东西。',
      far: '莱塔尼亚移动城邦崔林特尔梅发生异动，黑女皇牺牲。',
      fx: { LEI: { cat: 0.60, catDur: 1, h: -10, mort: 1.08, mortDur: 2, ori: 0.15, oriDur: 3 } },
      at: [
        {
          when: S => S.city && S.city.indexOf('崔林特尔梅') >= 0,
          die: 0.04, dieCause: 'art', flag: 'hollow',
          text: '你听见了。后来你花了很久才承认，你其实一直想再听一次。',
          eff: { h: -6 }
        },
        {
          when: S => S.arts >= 50,
          text: '那声音过去之后，你发现自己能做的事多了一点。这件事你谁也没告诉。',
          eff: { arts: 8, h: -4 }
        }
      ]
    },

    /* ==================== 伊比利亚 ==================== */
    {
      id: 'ibe_silence', year: 1038, title: '大静谧', book: '大海',
      scope: { nations: ['IBE'], regions: ['sea'] },
      here: '浪来的时候没有预兆。灯塔全灭了，黄金舰队一条都没有回来。',
      near: '伊比利亚沿海出了大事。海里的东西开始往岸上走。',
      far: '伊比利亚黄金舰队覆没，全国封闭国境。',
      back: '大静谧就来过了。灯塔到现在没修好，审判庭早就在那里，海里的东西也一直没有走。',
      fx: {
        IBE: { mort: 1.35, mortDur: 8, money: -3, tol: -12, tolDur: 40, war: 0.20, warDur: 5, h: -16, cat: 0.40, catDur: 5 }
      },
      globals: { money: -0.3 },
      at: [
        {
          when: S => S.nation === 'IBE',
          die: 0.05, dieCause: 'sea',
          text: '水退下去以后，你们在滩上找到的东西里有一半不认识。'
        }
      ]
    },
    {
      id: 'ibe_fool', year: 1097, title: '「愚人号」返航与盐风城危机', book: '大海',
      scope: { nations: ['IBE', 'AEG'], regions: [] },
      here: '六十年了，那面旗又出现了一次。审判庭、深海猎人和海嗣在盐风城外面撞上了。',
      near: '伊比利亚找到了一条失踪很久的旗舰，然后打了起来。',
      far: '伊比利亚失蹤旗舰「愚人号」被重新发现。',
      fx: {
        IBE: { war: 0.40, warDur: 2, cat: 0.50, catDur: 1, h: 6, mort: 1.10, mortDur: 2 },
        AEG: { war: 0.20, warDur: 2 }
      },
      at: [
        { when: S => S.city && S.city.indexOf('盐风') >= 0, die: 0.05, dieCause: 'sea', text: '盐风城的海面上那天不是水。' },
        {
          when: S => S.nation === 'AEG' || (S.nation === 'IBE' && S.stratum !== 'core'),
          flag: 'sea_hunt',
          text: '你认出了那艘船该有的样子。你决定不说。', eff: { h: -6, so: 4 }
        }
      ]
    },

    /* ==================== 叙拉古 ==================== */
    {
      id: 'sir_families', year: 1073, title: '十二家族法典确立', book: '叙拉古',
      scope: { nations: ['SIR'], regions: [] },
      here: '灰厅定下了规矩：十二个家族，一城一家，家法高于法庭。这规矩管了二十六年。',
      near: '叙拉古的黑帮把秩序立起来了。',
      far: '叙拉古确立家族分治秩序。',
      fx: { SIR: { war: -0.15, warDur: 26, tol: -3, tolDur: 26, h: -2 } }
    },
    {
      id: 'sir_newcourt', year: 1099, title: '新沃尔西尼建立与家族冲突', book: '叙拉古',
      scope: { nations: ['SIR'], regions: [] },
      here: '围绕新沃尔西尼的家族争夺终于落幕。西西里夫人承认新城的特殊地位，伺夜等人取得管理权，家族不得介入这里。',
      near: '新沃尔西尼开始尝试摆脱家族控制，但叙拉古其他城市的家族仍然存在。',
      far: '叙拉古的新沃尔西尼确立了禁止家族介入的新秩序。',
      fx: { SIR: { war: 0.45, warDur: 2, tol: 5, tolDur: 20, money: -2, mort: 1.12, mortDur: 2 } },
      at: [
        {
          when: S => S.nation === 'SIR' && S.city && S.city.indexOf('沃尔西尼') >= 0,
          die: 0.05, dieCause: 'hom', flag: 'witness',
          text: '家族争夺的枪声在街区间回荡。你躲在墙后，等待一条能够离开的路。'
        },
        {
          when: S => S.nation === 'SIR' && /新沃尔西尼/.test(S.city || '') && S.q >= 4,
          text: '在新沃尔西尼，你家过去依靠的家族关系不再是通行证。一些旧生意因此受损。', money: -3, eff: { h: -10 }
        }
      ]
    },

    /* ==================== 拉特兰 ==================== */
    {
      id: 'lat_council', year: 1099, title: '万国峰会与「原初律法」启示', book: '大陆',
      scope: { nations: ['LAT'], regions: [] },
      here: '教宗把各国各教的人都请来了。地下的启示中枢在同一时间有了反应，没有人说这是巧合。',
      near: '拉特兰开了个前所未有的大会，据说要改千年的规矩。',
      far: '拉特兰召开万国万教代表大会。',
      fx: { LAT: { tol: 12, tolDur: 20, h: 6, money: -1 } },
      globals: { tol: 2, tolDur: 8 },
      at: [
        { when: S => S.race === 'sarkaz', text: '千年的禁忌第一次松开了一条缝。你从那条缝里看过去，对面也是人。', eff: { h: 6, so: 4 } },
        { when: S => S.ori && S.ori.stage > 0, text: '有一条律法被重新读了一遍。读法不一样了。', eff: { h: 5 } },
        { when: S => S.nation === 'LAT' && S.race !== 'sankta', text: '你被允许站在里面了。这件事本身比会议内容更让你在意。', eff: { so: 6 } }
      ]
    },

    /* ==================== 谢拉格 ==================== */
    {
      id: 'kjr_opened', year: 1097, title: '雪山三族会议与喀兰贸易破局', book: '谢拉格',
      scope: { nations: ['KJR'], regions: [] },
      here: '银灰带着新式军队进了议会，也进了蔓珠院。曼珠院的门那天是被人推开的。',
      near: '谢拉格闭关几百年，一夜之间开了。',
      far: '谢拉格解除闭关，全面开放商路。',
      fx: { KJR: { war: 0.35, warDur: 1, money: 2, tol: 4, tolDur: 20, h: -2 } },
      at: [
        { when: S => S.nation === 'KJR', die: 0.02, dieCause: 'war', text: '议会那一天响了枪。你们家离得近，听得清楚。' },
        { when: S => S.nation === 'KJR' && S.q <= 2, text: '旧规矩没了。你父亲说，他这辈子第一次觉得自己可以往山下走。', eff: { h: 8 } },
        {
          when: S => S.nation === 'KJR' && ['herder', 'witch'].indexOf(S.job) >= 0,
          text: '你会的那些，现在没有人来问了。', eff: { h: -12 }, money: -1
        }
      ]
    },

    /* ==================== 边境地带 ==================== */
    {
      id: 'north_demons', year: 950, title: '北疆邪魔入侵', book: '传说',
      // 不是一次性事件，而是一条常年生效的风险底噪；这里只负责童年旁白
      legend: true, scope: { nations: ['SAMI', 'URS'], regions: [] },
      here: '防线在冰原上，撑防线的人一年换一批。林精不是树，是站在那里的东西。',
      near: '极北的防线一直在打，只是从来不上报纸。',
      far: '乌萨斯北疆常年有未明实体入侵。',
      fx: {},
      at: [
        { when: S => S.race === 'cyclops', eff: { h: -4, so: 4, hl: -3 }, flag: 'on_the_line' },
        { when: S => S.nation === 'SAMI' || (S.nation === 'URS' && S.stratum === 'wild'), eff: { h: -3, sm: 2 } }
      ]
    },
    {
      id: 'srg_south', year: 980, title: '沙阿南征绝地', book: '传说',
      legend: true, scope: { nations: ['SRG'], regions: [] },
      here: '路加萨尔古斯带着整支军队往南走，走进白色的地方，一个都没回来。',
      near: '萨尔贡的初代霸主南征，全军覆没在冰原上。',
      far: '萨尔贡古史里有一次全军覆没的南征。',
      fx: {},
      at: [{ when: S => S.nation === 'SRG', eff: { sm: 2 }, flag: 'south_march' }]
    }
  ];

  /* ---------------------------------------------------------------------- */
  /* 索引                                                                    */
  /* ---------------------------------------------------------------------- */
  const BY_YEAR = {};
  for (const e of TL.TIMELINE) {
    (BY_YEAR[e.year] = BY_YEAR[e.year] || []).push(e);
  }

  /** 非传说事件的最小/最大年份 */
  const dated = TL.TIMELINE.filter(e => !e.legend).map(e => e.year).sort((a, b) => a - b);
  TL.TL_FIRST = dated[0];
  TL.TL_LAST = dated[dated.length - 1];

  /**
   * 某国某年的修正合计。
   * 事件是按年一次性触发的，但效果要持续 dur 年，所以这里做一次窗口求和。
   * 结果缓存 —— 每局每年都会问好几次（deathProb / oriLifetimeP / tolOf）。
   */
  const MOD_CACHE = {};
  const FIELDS = ['war', 'cat', 'ori', 'tol', 'mort'];

  TL.tlMods = function (nationId, year) {
    const key = nationId + '@' + year;
    if (MOD_CACHE[key]) return MOD_CACHE[key];

    const m = { war: 0, cat: 0, ori: 0, tol: 0, mort: 1 };
    for (const e of TL.TIMELINE) {
      if (e.legend) continue;
      const f = e.fx && e.fx[nationId];
      const g = e.globals;
      const age = year - e.year;
      if (age < 0) continue;

      if (f) {
        for (const k of FIELDS) {
          if (f[k] == null) continue;
          const dur = f[k + 'Dur'] || 0;
          if (dur > 0) { if (age < dur) m[k] += f[k]; }
          else if (age === 0) m[k] += f[k];        // 无 dur = 只在当年
        }
      }
      if (g) {
        for (const k of FIELDS) {
          if (g[k] == null) continue;
          const dur = g[k + 'Dur'] || 0;
          if (dur > 0) { if (age < dur) m[k] += g[k]; }
          else if (age === 0) m[k] += g[k];
        }
      }
    }
    MOD_CACHE[key] = m;
    return m;
  };

  /** 某国某年是否有事件发生（供界面提示） */
  TL.tlAt = function (year) { return BY_YEAR[year] || null; };

  TL.TL_BY_ID = {};
  for (const e of TL.TIMELINE) TL.TL_BY_ID[e.id] = e;

  /* ---------------------------------------------------------------------- */
  /* 执行                                                                    */
  /* ---------------------------------------------------------------------- */
  /* modifier 类键交给 TL.tlMods 逐年生效，这里只负责**一次性**的部分
     （钱、四维、直接死亡、迁徙）。两者不能重复施加，否则一次大静谧会被扣两次钱。 */
  const MOD_KEYS = { war: 1, cat: 1, ori: 1, tol: 1, mort: 1 };
  const IMM_KEYS = ['money', 'h', 'hl', 'so', 'sm', 'arts'];

  function immEff(S, src) {
    if (!src) return false;
    const eff = {};
    let hit = false;
    for (const k of IMM_KEYS) {
      if (src[k] == null) continue;
      if (k === 'money') { S.money = Math.max(0, S.money + src.money * TL.NATION_BY_ID[S.nation].ppp); hit = true; }
      else if (k === 'arts') { TL.artsAdd(S, src.arts); hit = true; }
      else { eff[k] = (eff[k] || 0) + src[k]; hit = true; }
    }
    if (Object.keys(eff).length) TL.eff(S, eff);
    return hit;
  }

  /** 这一条对玩家来说是「亲历 / 邻国 / 远方」 */
  function levelOf(ev, S, n) {
    if (ev.scope.nations && ev.scope.nations.indexOf(S.nation) >= 0) return 'here';
    if (ev.scope.regions && ev.scope.regions.indexOf(n.reg) >= 0) return 'near';
    return 'far';
  }

  /**
   * 推进一年的大事件。由 TL.endYear 在每年末尾调用一次。
   * 一辈子只响一次：用 flags['tl_' + id] 记。读档重放时也不会重复。
   */
  TL.timelineYear = function (S) {
    const list = BY_YEAR[S.year];
    if (!list) return;
    const n = TL.NATION_BY_ID[S.nation];

    for (const ev of list) {
      if (ev.legend) continue;                       // 传说型在童年由 narrate 处理
      const key = 'tl_' + ev.id;
      if (S.flags[key]) continue;
      S.flags[key] = 1;
      TL.fireTimeline(S, ev, n);
      if (S.phase !== 'life') break;
    }
  };

  TL.fireTimeline = function (S, ev, n) {
    n = n || TL.NATION_BY_ID[S.nation];
    const lv = levelOf(ev, S, n);

    /* --- ① 全国 / 全球的一次性效果 --- */
    const f = ev.fx && ev.fx[S.nation];
    immEff(S, f);
    if (ev.globals) immEff(S, ev.globals);

    /* --- ② 旁白 --- */
    const text = ev[lv] || ev.far;
    if (text) TL.log(S, text, 'tl', { key: ev.id, tag: ev.title });

    /* --- ③ 条件性的个人后果 --- */
    let died = false;
    for (const at of (ev.at || [])) {
      if (at.when && !at.when(S)) continue;
      if (at.flag) S.flags[at.flag] = 1;
      if (at.money) S.money = Math.max(0, S.money + at.money * n.ppp);
      if (at.text) TL.log(S, at.text, 'tl', { key: ev.id + '_at', tag: ev.title });
      if (at.eff) TL.eff(S, at.eff);

      // 条件致死先于逃离；一次抽样，具体死因不额外增加死亡概率。
      if (at.die && !died && TL.chance(at.die)) {
        died = true;
        const outcomes = (at.fatalOutcomes || []).filter(o => !o.when || o.when(S));
        const outcome = outcomes.length ? TL.pick(outcomes) : null;
        if (outcome) TL.log(S, outcome.text, 'tl', { key: ev.id + '_fatal', tag: ev.title });
        TL.die(S, outcome ? outcome.cause : (at.dieCause || 'war'), 'timeline:' + ev.id);
        break;
      }

      // 迁徙：换一座城市，或直接沦为流民
      if (at.move) {
        S.flags.movedBy = ev.id;
        if (at.move === '流民') {
          S.refugee = true; S.stratum = 'wild'; S.urban = false;
          S.flags.displacedFrom = S.city; S.city = '荒野流民营地'; S.cityName = S.city;
          S.flags.atHome = false;
        }
        else {
          const c = TL.cityOf(S.nation);
          if (c) S.city = c;
          S.flags.atHome = false;
        }
        TL.log(S, TL.L`你搬走了。新地方的名字你念了三天才念顺。`, 'tl', { key: ev.id + '_move' });
      }

    }
    return !died;
  };

  /**
   * 传说型条目：不按年份触发，而是在童年给一次旁白机会。
   * 由 TL.newLife 在出生时调用一次。
   */
  TL.timelineLegend = function (S) {
    if (S.flags.tl_legend_done) return;
    S.flags.tl_legend_done = 1;
    for (const ev of TL.TIMELINE) {
      if (!ev.legend) continue;
      if (ev.scope.nations.indexOf(S.nation) < 0 && !(ev.at || []).some(a => !a.when || a.when(S))) continue;
      TL.log(S, ev.here, 'tl', { key: ev.id, tag: ev.title });
      for (const at of (ev.at || [])) {
        if (at.when && !at.when(S)) continue;
        if (at.flag) S.flags[at.flag] = 1;
        if (at.eff) TL.eff(S, at.eff);
      }
      return;
    }
  };

  /* ---------------------------------------------------------------------- */
  /* 前史                                                                    */
  /* ---------------------------------------------------------------------- */
  /**
   * 出生之前发生、但影响还在生效的事件。
   *
   * 这一块比它看起来重要。大静谧（1038）对一个 1050 年出生在伊比利亚的
   * 人来说不是新闻，而是**他整个国家的性格**：国境已经封了十二年，
   * 灯塔还没修好，审判庭已经在那里了。四皇会战同理 —— 你出生的时候
   * 地图就已经是那个样子了。
   *
   * 这些事件的持续型修正在 TL.tlMods 里本来就是逐年在算的，
   * 所以这里要补的只是「一句话」：让玩家知道自己继承了一个什么样的世界。
   */
  TL.timelineBackstory = function (S) {
    const n = TL.NATION_BY_ID[S.nation];
    const out = [];
    for (const ev of TL.TIMELINE) {
      if (ev.legend) continue;
      if (ev.year >= S.bornYear) continue;              // 出生之后的不算前史
      // 影响是否还盖着出生那年？
      let stillOn = false;
      const f = ev.fx && ev.fx[S.nation];
      const check = src => {
        if (!src) return;
        for (const k of ['war', 'cat', 'ori', 'tol', 'mort']) {
          const dur = src[k + 'Dur'] || 0;
          if (src[k] != null && dur > 0 && S.bornYear - ev.year < dur) stillOn = true;
        }
      };
      check(f); check(ev.globals);
      // 或者它对玩家有个人条件（比如萨卡兹对巴别塔）
      const personal = (ev.at || []).some(a => a.when && a.when(S));
      if (!stillOn && !personal) continue;

      const lv = levelOf(ev, S, n);
      if (lv === 'far' && !personal) continue;          // 远方的前史就不提了
      out.push({ ev: ev, gap: S.bornYear - ev.year, lv: lv, text: ev.back || ev[lv] || ev.far });
    }

    if (!out.length) return;
    // 最多讲两条，按离出生最近的优先 —— 再多会淹没开局旁白
    out.sort((a, b) => a.gap - b.gap);
    for (const o of out.slice(0, 2)) {
      TL.log(S, TL.L`你出生前 ${o.gap} 年，${o.text}`, 'tl', { key: 'back_' + o.ev.id, tag: o.ev.title });
    }
  };

})(window.TL = window.TL || {});
