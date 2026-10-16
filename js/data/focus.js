/* ==========================================================================
 * TERRA LIFE SIM — 年度重心（对应原作的 FOCUS）
 * --------------------------------------------------------------------------
 * 原作机制：一年之内你可以在若干「重心」之间分配时间（S.fT 累计），
 * 年末按时间占比加权结算四维变化。
 * 本作保留该机制，并把词条改写为泰拉语境。
 *
 * e: {hl 体质, h 心境, sm 学识, so 羁绊, arts 技艺}
 * ========================================================================== */
(function (TL) {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* 年度重心                                                                */
  /* ---------------------------------------------------------------------- */
  /* 每条都有 en / enD 两个英文字段，供 region.js 的 TL.nameOf / TL.descOf 取用。
     d 是「效果摘要」而不是句子，所以英文侧也只是把四维名与箭头翻过来，
     保留同样的紧凑感 —— 它是列表里的一行小字，不是描述。 */
  TL.FOCUS = {
    /* ---- 幼年 / 学龄 ---- */
    study: {
      name: '读书', en: 'Reading', d: '学识↑ 心境↓', enD: 'Knowledge↑ Happiness↓',
      e: { sm: 5, h: -1, so: -1 }
    },
    play: {
      name: '玩耍', en: 'Play', d: '羁绊↑ 心境↑', enD: 'Bonds↑ Happiness↑',
      e: { so: 4, h: 4 }
    },
    help: {
      name: '帮家里干活', en: 'Help at home', d: '羁绊↑ 学识略↓', enD: 'Bonds↑ Knowledge slightly↓',
      e: { so: 2, sm: -1, hl: 1 }
    },
    train: {
      name: '习武', en: 'Martial training', d: '体质↑ 心境↑', enD: 'Health↑ Happiness↑',
      e: { hl: 4, h: 1, so: 1 }
    },
    craft: {
      name: '摆弄机械', en: 'Tinker', d: '学识↑ 技艺↑', enD: 'Knowledge↑ Arts↑',
      e: { sm: 3, arts: 2, h: 1 }
    },
    /* ---- 通用 ---- */
    sport: {
      name: '锻炼', en: 'Exercise', d: '体质↑ 心境↑', enD: 'Health↑ Happiness↑',
      e: { hl: 5, h: 2, so: 1 }
    },
    hobby: {
      name: '爱好', en: 'A hobby', d: '心境↑ 专精↑', enD: 'Happiness↑ Mastery↑',
      e: { h: 4 }
    },
    work: {
      name: '埋头工作', en: 'Work hard', d: '收入↑ 体质·羁绊↓', enD: 'Income↑ Health·Bonds↓',
      e: { hl: -3, h: -2, so: -2, money: 1 }
    },
    balance: {
      name: '均衡度日', en: 'A balanced year', d: '各项略升', enD: 'Everything slightly↑',
      e: { h: 1, hl: 1, so: 1, sm: 1 }
    },
    family: {
      name: '陪伴家人', en: 'Time with family', d: '羁绊↑ 心境↑', enD: 'Bonds↑ Happiness↑',
      e: { so: 5, h: 3 }
    },
    health: {
      name: '调养身体', en: 'Recuperate', d: '体质↑', enD: 'Health↑',
      e: { hl: 5, h: 1 }
    },
    learn: {
      name: '进修', en: 'Further study', d: '学识↑ 晋升机会↑', enD: 'Knowledge↑ Promotion odds↑',
      e: { sm: 4, h: -1 }
    },
    faith: {
      name: '信仰与祭祀', en: 'Faith and rites', d: '羁绊↑ 心境↑', enD: 'Bonds↑ Happiness↑',
      e: { so: 4, h: 3 }
    },
    rest: {
      name: '休息', en: 'Rest', d: '体质↑ 心境↑', enD: 'Health↑ Happiness↑',
      e: { hl: 2, h: 2, sm: -1 }
    },
    mind: {
      name: '静思', en: 'Reflection', d: '学识↑ 稳住心境', enD: 'Knowledge↑ Steadies the mind',
      e: { sm: 3, h: 2, so: 1 }
    },
    parttime: {
      name: '打零工', en: 'Odd jobs', d: '钱少许 学识↓', enD: 'A little money Knowledge↓',
      e: { sm: -1, h: -1, so: 1, money: 1 }
    },
    career: {
      name: '谋出路', en: 'Build a career', d: '就业机会↑ 心境↓', enD: 'Job prospects↑ Happiness↓',
      e: { sm: 2, h: -2 }
    },
    /* ---- 泰拉特有 ---- */
    arts_training: {
      name: '修习源石技艺', en: 'Study Originium Arts', d: '技艺↑↑ 体质↓（有感染风险）', enD: 'Arts↑↑ Health↓ (infection risk)',
      e: { arts: 7, sm: 2, hl: -2, h: -1 }
    },
    ori_care: {
      name: '矿石病治疗', en: 'Suppressant therapy', d: '延缓结晶 体质↓ 花钱', enD: 'Slows crystallization Health↓ Costs money',
      e: { hl: 1, h: -1, so: -1 },
      special: 'oriCare'
    },
    hiding: {
      name: '隐藏身份', en: 'Hide your status', d: '降低被发现风险 心境↓', enD: 'Lower exposure risk Happiness↓',
      e: { h: -3, so: -2, sm: 1 },
      special: 'hide'
    },
    fellowship: {
      name: '感染者互助', en: 'Infected mutual aid', d: '羁绊↑ 心境↑ 暴露风险↑', enD: 'Bonds↑ Happiness↑ Exposure risk↑',
      e: { so: 4, h: 2, hl: -1 },
      special: 'reunion'
    },
    disaster_drill: {
      name: '天灾避难演练', en: 'Catastrophe drill', d: '天灾存活率↑ 心境↓', enD: 'Catastrophe survival↑ Happiness↓',
      e: { sm: 2, hl: 1, h: -2 },
      special: 'drill'
    }
  };

  /**
   * 该阶段可选的年度重心。严格对应原作的 focusOptions() 逻辑。
   */
  TL.focusOptions = function (S) {
    const stage = TL.stage(S);
    const infected = !!(S.ori && S.ori.stage > 0);

    let base;
    switch (stage) {
      case 'baby':
        return [];                       // 婴儿没有选择
      case 'service':
        base = ['balance', 'sport', 'family', 'train'];
        break;
      case 'school':
        base = S.eduLevel >= 3
          ? ['study', 'play', 'parttime', 'career', 'sport', 'hobby', 'craft']
          : (S.flags.retake ? ['study', 'play', 'parttime', 'sport', 'hobby']
                            : ['study', 'play', 'help', 'sport', 'hobby', 'craft']);
        break;
      case 'kidwork':
        base = ['help', 'play', 'sport', 'hobby', 'craft'];
        break;
      case 'elder': {
        const working = S.job && TL.JOBS[S.job] && TL.JOBS[S.job].sec !== 'none' && S.job !== 'homemaker';
        base = working
          ? ['work', 'family', 'health', 'mind', 'hobby', 'faith', 'rest']
          : ['family', 'health', 'mind', 'hobby', 'faith', 'rest'];
        break;
      }
      default: {
        const working = TL.isWorking(S);
        base = working
          ? ['work', 'balance', 'family', 'health', 'learn', 'hobby', 'rest']
          : ['family', 'health', 'learn', 'hobby', 'rest', 'parttime', 'career'];
      }
    }

    // 泰拉特有选项：只在条件满足时出现，这样它就有了叙事重量
    if (S.arts >= 22 && S.age >= 8) base.push('arts_training');
    if (infected) {
      base.push('ori_care');
      if (S.ori.known) base.push('hiding');
      base.push('fellowship');
    }
    if (S.age >= 10 && TL.NATION_BY_ID[S.nation].cat >= 0.8) base.push('disaster_drill');

    return base;
  };

  /** 是否在职（对应原作 isWorking） */
  TL.isWorking = function (S) {
    const J = TL.JOBS[S.job];
    if (!J) return false;
    if (TL.NONWORK.indexOf(S.job) >= 0) return false;
    return J.sec !== 'none';
  };

  /** 年度重心被选中的默认逻辑（自动模式用） */
  TL.autoFocus = function (S) {
    const opts = TL.focusOptions(S);
    if (!opts.length) return null;
    // 简单启发：先保命，再补短板，最后推长处
    const st = S.st;
    if (S.ori && S.ori.stage >= 2 && opts.indexOf('ori_care') >= 0) return 'ori_care';
    if (st.hl < 30 && opts.indexOf('health') >= 0) return 'health';
    if (st.h < 25 && opts.indexOf('rest') >= 0) return 'rest';
    if (st.so < 30 && opts.indexOf('family') >= 0) return 'family';
    if (S.age < 22 && opts.indexOf('study') >= 0 && st.sm < 70) return 'study';
    if (S.arts >= 60 && opts.indexOf('arts_training') >= 0 && S.age < 40) return 'arts_training';
    if (opts.indexOf('work') >= 0 && S.money < 0) return 'work';
    if (opts.indexOf('learn') >= 0) return 'learn';
    return opts[0];
  };

})(window.TL = window.TL || {});
