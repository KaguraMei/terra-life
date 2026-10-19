/* ==========================================================================
 * TERRA LIFE SIM — 抉择系统
 * --------------------------------------------------------------------------
 * 对应原作的 openDecision / choose / pending 机制。
 *
 * 【原作设计要点】
 *   时间推进中，队列会弹出 type='dec' 的事件，调用 openDecision(id)。
 *   此时 S.pending 被置位，tick() 直接 return —— 时间停住，等玩家选。
 *   玩家选完后 choose(optIndex) 应用效果并清空 pending，时间继续。
 *   「自动模式」则是用一个策略函数替你回答，这也是原作 autoState 的原理。
 *
 * 【本作扩展】
 *   选项可以带 require（条件）、hidden（隐藏信息）、outcomes（概率分支），
 *   以及 ori 相关的特殊判定 —— 让「感染者身份」真正改变每一个选择的形状。
 * ========================================================================== */
(function (TL) {
  'use strict';

  /** 抉择库：id → 定义 */
  TL.DECISIONS = {};

  /**
   * 注册一个抉择。
   * @param {string} id
   * @param {object} d
   *   d.title   标题（一句话情境）
   *   d.text    详细描述
   *   d.when    (S)=>bool 是否可用
   *   d.options [ { label, hint, eff:{}, run(S)=>{}, require:(S)=>bool } ]
   *   d.weight  随机抽选时的权重
   *   d.once    是否只出现一次
   */
  TL.defDecision = function (id, d) {
    d.id = id;
    TL.DECISIONS[id] = d;
    return d;
  };

  /* ---------------------------------------------------------------------- */
  /* 打开抉择                                                               */
  /* ---------------------------------------------------------------------- */
  TL.openDecision = function (S, id, p) {
    const d = TL.DECISIONS[id];
    if (!TL.contentAvailable(S, d) || (d.when && !d.when(S))) return;
    // 过滤不可用选项
    const sourceOptions = typeof d.options === 'function' ? d.options(S) : (d.options || []);
    const opts = sourceOptions.filter(o => !o.require || o.require(S));
    if (!opts.length) return;

    S.pending = {
      id: id,
      title: typeof d.title === 'function' ? d.title(S) : d.title,
      text: typeof d.text === 'function' ? d.text(S) : d.text,
      options: opts.map((o, i) => ({
        index: i,
        label: typeof o.label === 'function' ? o.label(S) : o.label,
        hint: typeof o.hint === 'function' ? o.hint(S) : (o.hint || ''),
        // 若选项声明 hidden，则自动模式看不到真实收益
        hidden: !!o.hidden
      })),
      _def: d,
      _opts: opts,
      age: S.age
    };
    S.paused = true;
    // 记录「这个抉择在第几年被问过」——once / cd 都靠它判断
    S.flags['dec_' + id] = S.age;
    if (TL.onDecision) TL.onDecision(S.pending);
  };

  /* ---------------------------------------------------------------------- */
  /* 作出选择                                                               */
  /* ---------------------------------------------------------------------- */
  TL.choose = function (S, index) {
    const p = S.pending;
    if (!p) return null;
    const o = p._opts[index];
    if (!o) return null;

    // 应用四维效果
    if (o.eff) TL.eff(S, o.eff);

    // 执行自定义逻辑
    let result = null;
    if (o.run) result = o.run(S);

    // 记录
    TL.log(S, TL.L`【${p.title}】你选择了：${typeof o.label === 'string' ? o.label : p.options[index].label}`, 'dec', {
      key: p.id,
      choice: index,
      result: typeof result === 'string' ? result : null
    });

    S.pending = null;
    S.paused = false;
    if (TL.syncOrganization) TL.syncOrganization(S);
    // 面试等多轮流程可在旧题清空后排下一题，避免 run() 内打开的题被覆盖。
    if (TL.afterDecision) TL.afterDecision(S, p, index);
    if (TL.onDecided) TL.onDecided(S, p, index);
    return result;
  };

  /* ---------------------------------------------------------------------- */
  /* 自动模式（对应原作 autoState / autoItem）                                */
  /* ---------------------------------------------------------------------- */
  /**
   * 自动策略：按四维与当前处境挑一个「最不坏」的选项。
   * 这不是最优解 —— 正如原作，自动模式只是替你把时间走完。
   */
  TL.autoChoose = function (S) {
    const p = S.pending;
    if (!p) return;
    const st = S.st;
    let best = 0, bestScore = -1e9;
    for (let i = 0; i < p._opts.length; i++) {
      const o = p._opts[i];
      if (o.autoExclude) continue;
      const e = o.eff || {};
      // 打分：把四维变化按「当前短缺程度」加权
      let s = 0;
      s += (e.hl || 0) * (110 - st.hl) / 55;
      s += (e.h || 0) * (110 - st.h) / 55;
      s += (e.sm || 0) * (110 - st.sm) / 55;
      s += (e.so || 0) * (110 - st.so) / 55;
      // 缺钱时钱更值钱
      if (e.money && S.money < 0) s += e.money * 0.02;
      // 一点随机，避免每次自动都走同一条路
      s += TL.rnd() * 1.5;
      if (s > bestScore) { bestScore = s; best = i; }
    }
    TL.choose(S, best);
  };

  /* ---------------------------------------------------------------------- */
  /* 排程：哪些抉择会在哪一年出现                                             */
  /* ---------------------------------------------------------------------- */
  /**
   * 对应原作的 scheduledDecisions()。
   * 返回 [{id, at, p}] —— at 是年内的相对时刻（0..1）。
   */
  TL.scheduledDecisions = function (S) {
    const out = [];
    const a = S.age;
    const n = TL.NATION_BY_ID[S.nation];
    const infected = !!(S.ori && S.ori.stage > 0);

    const add = (id, at, p) => {
      const d = TL.DECISIONS[id];
      if (!TL.contentAvailable(S, d)) return;
      const last = S.flags['dec_' + id];
      // once：一生只问一次
      if (d.once && last != null) return;
      // cd：允许重复，但两次之间至少隔这么多年。
      // 没有 cd 时，「要不要孩子」会在 26~42 岁的每一年都弹一次，
      // 一生被问十几遍同样的问题。
      const cd = d.cd == null ? (d.once ? 0 : 5) : d.cd;
      if (cd > 0 && last != null && a - last < cd) return;
      if (d.when && !d.when(S)) return;
      out.push({ id: id, at: at == null ? TL.rnd() : at, p: p });
    };

    /* --- 人生节点的固定抉择 --- */
    if (a === 6)  add('first_school', 0.25);
    if (a === 12) add('middle_path', 0.3);
    if (a === 15) add('teen_fork', 0.35);
    if (a === 16 && S.race === 'sarkaz' && S.nation !== 'KDZ') add('hide_blood', 0.4);
    if (a === 17) add('arts_path', 0.4);
    if (a === 18) add('after_school', 0.3);
    if (a === 20 && S.serveLeft === 0 && n.war > 0.2) add('conscription', 0.35);
    if (a === 22) add('career_pick', 0.4);
    if (a >= 24 && a <= 34 && !S.fam.married && !S.fam.partner) add('marriage', 0.5);
    if (a >= 26 && a <= 42 && S.fam.married && S.fam.kids.length < 4) add('have_kid', 0.55);

    /* --- 感染者专属抉择（本作核心） --- */
    if (infected) {
      if (a === S.ori.at + 1) add('ori_disclose', 0.3);
      if (a === S.ori.at + 2) add('ori_treatment', 0.35);
      if (a >= 16 && S.ori.known) add('ori_job_loss', 0.6);
      if (a >= 15 && TL.reunionContactCurrent(S)) add('reunion_invite', 0.6);
      if (S.ori.stage >= 2) add('ori_despair', 0.6);
      if (S.ori.stage >= 3) add('ori_last', 0.7);
    }

    /* --- 天灾 --- */
    if (n.cat >= 0.8 && a >= 5 && TL.chance(n.cat * 0.045)) {
      add('catastrophe_warn', 0.15);
    }

    /* --- 事业与转折 --- */
    if (a >= 20 && a <= 60 && TL.isWorking(S)) add('job_offer', 0.5);
    if (a >= 25 && a <= 55 && S.money > n.ppp * 6 && !S.flags.homeValue) add('buy_home', 0.5);
    if (a >= 30 && a <= 58 && TL.isWorking(S)) add('burnout', 0.55);

    /* --- 迁徙 --- */
    if (a >= 16 && a <= 40 && TL.chance(0.18)) add('migrate_chance', 0.5);

    /* --- 老年 --- */
    if (a >= 62) add('elder_legacy', 0.6);

    return out;
  };

})(window.TL = window.TL || {});
