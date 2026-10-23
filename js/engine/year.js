/* ==========================================================================
 * TERRA LIFE SIM — 时间推进与年度结算
 * --------------------------------------------------------------------------
 * 忠实移植原作的 tick / fire / endYear / die 四段式结构：
 *
 *   tick(dt)   每帧推进：S.t 在 [0,1] 内走，到点触发 S.queue 里的事件
 *   fire(e)    派发单个事件（ev 剧情 / ms 里程碑 / dec 决策）
 *   endYear()  年末结算：重心效果 → 健康回归 → 社交回归 → 经济 → 矿石病
 *              → 死亡判定
 *   die()      死亡与人生报告
 *
 * 【原作最精妙的一点】四维不是「加加减减」，而是每年向一个「目标值」回归：
 *      st.hl += (hTarget - st.hl) * 0.25
 *   hTarget 由年龄基准、生活习惯、疾病、家境、重心共同算出。
 *   这意味着：一次重病会留下永久痕迹，而持续调养会缓慢拉回来 —— 像真的身体。
 * ========================================================================== */
(function (TL) {
  'use strict';

  /* ---------------------------------------------------------------------- */
  /* tick：每帧推进                                                          */
  /* ---------------------------------------------------------------------- */
  // The typed kernel owns time, queue ordering and dispatch.
  // Annual domain settlement below is intentionally unchanged in this phase.
  TL.tick = (S, dtSec) => TL.kernel.events.tick(S, dtSec);
  TL.advanceToDecision = (S, budget) => TL.kernel.events.advance(S, budget);
  TL.queueEvent = (S, at, type, id, p) => TL.kernel.events.queue(S, at, type, id, p);
  TL.queueRandom = (S, n, type, picker) => TL.kernel.events.queueRandom(S, n, type, picker);
  TL.fire = (S, e) => TL.kernel.events.fire(S, e);

  /* ---------------------------------------------------------------------- */
  /* 记账（对应原作 bookSince / book）                                        */
  /* ---------------------------------------------------------------------- */
  TL.bookSince = function (S, before, label) {
    const after = TL.netWorth(S);
    const d = after - before;
    if (Math.abs(d) < 0.5) return;
    if (!S.stats.book) S.stats.book = [];
    S.stats.book.push({ age: S.age, label: label, delta: Math.round(d) });
    if (S.stats.book.length > 500) S.stats.book.shift();
  };

  /* ---------------------------------------------------------------------- */
  /* 年末结算                                                               */
  /* ---------------------------------------------------------------------- */
  TL.endYear = function (S) {
    S.actEvent = null;
    S.actDec = null;
    if (TL.syncOrganization) TL.syncOrganization(S);
    const n = TL.NATION_BY_ID[S.nation];
    const a = S.age;
    const st = S.st;

    /* ---------- ① 重心效果加权结算 ---------- */
    // 份额归一化与"学识/技艺不走加法"的规则在 src/model/focus.ts：总权重为 0 时整段跳过。
    TL.focusYear(S);

    /* ---------- ② 爱好成长 ---------- */
    for (const hb of S.hobbies) hb.lv += 0.35;

    /* ---------- ③ 教育 ---------- */
    TL.schoolYear(S);

    /* ---------- ④ 收入与资产 ---------- */
    TL.computeIncome(S);
    // 月收入在这里代表刚结算的年度合同工资。后续年末晋升会更新 S.income
    // 为下一年度薪资，但本年度快照必须记录 finances 实际使用的数值。
    const settledMonthlyIncome = S.income;
    TL.finances(S);

    /* ---------- ⑤ 体质回归 ---------- */
    // 目标体质 = 年龄基准 + 各种生活方式修正；公式与速率在 src/model/regression.ts。
    TL.regressHealth(S);

    /* ---------- ⑥ 羁绊回归 ---------- */
    // 伴侣/子女/母亲/爱好加分，迁徙与公开感染减分；基线随年龄下滑，恢复速率也随年龄上升。
    TL.regressSocial(S);

    /* ---------- ⑦ 心境回归 ---------- */
    // 国家基线 + 身体（0.16）+ 羁绊（0.18）+ 相对收入（±22）+ 产出年份（封顶 6）。
    TL.regressMood(S);

    /* ---------- ⑧ 学识自然增长/衰退 ---------- */
    TL.knowYear(S);

    /* ---------- ⑨ 泰拉特有：矿石病推进 ---------- */
    TL.oriYear(S);

    /* ---------- ⑨b 组织服役与晋升 ---------- */
    /* 组织是职业之外的长期归属。先记满一年的服务，再按路线门槛
       处理一次晋升；面试系统将来只负责入职前的多轮答题。 */
    if (TL.organizationYear) {
      TL.organizationYear(S);
      if (TL.promoteOrganization) TL.promoteOrganization(S, { annualSettlement: true });
    }

    /* ---------- ⑩ 记录本年快照 ---------- */
    S.stats.years.push({
      age: a,
      hl: Math.round(st.hl), h: Math.round(st.h),
      sm: Math.round(st.sm), so: Math.round(st.so),
      pct: S.pct, income: Math.round(settledMonthlyIncome),
      nw: Math.round(TL.netWorth(S)),
      ori: S.ori ? S.ori.crystal : 0,
      stage: S.ori ? S.ori.stage : 0,
      job: S.job
    });

    /* ---------- ⑫ 家庭年度推进 ---------- */
    TL.familyYear(S);

    /* ---------- ⑬ 死亡判定 ---------- */
    const q = TL.deathProb(S);
    S.lastQ = q;
    if (TL.chance(q)) {
      const cause = TL.pickCause(S, a, false);
      TL.die(S, cause, 'annual');
      return;
    }

    /* ---------- ⑭ 进入下一年 ---------- */
    S.age = a + 1;
    S.year = S.bornYear + S.age;      // 泰拉历
    S.t = 0;
    S.queue = [];
    S.fT = {};
    S.focus = null;
    S.flags.postCatastrophe = false;
    // 节奏随年龄重算：长生种进入对数压缩区间后，一年会走得越来越快
    TL.applyPace(S);

    // 成年后没工作就要找工作
    if (S.age >= 16 && !S.school && !TL.isWorking(S) &&
        ['child', 'student', 'childwork', 'seeking'].indexOf(S.job) >= 0) {
      S.job = 'seeking';
    }
    // 65 岁退休
    if (S.age >= 65 && !S.flags.retired) {
      TL.retire(S, { deferOrganizationExit: true });
    }

    /* ---------- ⑭b 泰拉大事件 ---------- */
    /* 放在排程之前：大事件会改 S.money / 四维 / 甚至直接致死，
       先跑它，这一年的常规事件才是「在这件事的背景下」发生的。 */
    if (TL.timelineYear) TL.timelineYear(S);
    if (S.phase !== 'life') return;
    if (TL.syncOrganization) TL.syncOrganization(S);

    /* ---------- ⑮ 为「新的一年」排程事件 ---------- */
    // 注意：必须在 S.queue = [] 之后，否则刚排的事件会被清掉。
    TL.scheduleEvents(S);
  };

  /* ---------------------------------------------------------------------- */
  /* 学习推进（对应原作 knowYear；曲线与上限已移入 src/model/yearly.ts）      */
  /* ---------------------------------------------------------------------- */

  /** 学识的年度自然变化：在校期间增长，长期不用则衰退 */
  TL.knowYear = function (S) {
    const a = S.age;
    if (a < 6) return;
    if (S.school) {
      const gain = { 1: 2.2, 2: 1.9, 3: 1.6, 4: 1.3 }[S.eduLevel] || 1.2;
      TL.knowAdd(S, gain);
    } else {
      // 成年后不使用则缓慢衰退；从事知识型工作减缓
      const J = TL.JOBS[S.job];
      const keep = J && (J.sec === 'know' || J.sec === 'art' || J.sec === 'op') ? 0.35 : 1;
      if (a > 25) TL.knowAdd(S, -0.55 * keep * (1 + (a - 25) / 60));
    }
    // 阅读习惯（爱好）
    if (S.hobbies.some(h => h.id === 'reading')) TL.knowAdd(S, 0.9);
  };

  /* ---------------------------------------------------------------------- */
  /* 就学年限（对应原作 schoolYear）                                          */
  /* ---------------------------------------------------------------------- */
  TL.schoolYear = function (S) {
    const a = S.age;
    if (S.school) {
      S.schoolLeft = (S.schoolLeft || 0) - 1;
      if (S.schoolLeft <= 0) {
        const finished = S.school;
        S.school = null;
        // 学历台阶：初等1 / 中等2 / 高等3 / 大学4 / 研究院5
        S.eduLevel = Math.max(S.eduLevel, TL.eduTier(finished));
        S.flags['grad_' + finished] = a;
        TL.log(S, TL.L`你结束了${({ primary: '初等', middle: '中等', high: '高等', uni: '大学', grad: '研究院' })[finished]}学业。`, 'mil', { key: 'grad' });
      }
      return;
    }
    // 自动入学：门槛与概率在 src/model/schooling.ts，这一层只负责执行入学。
    const level = TL.schoolGate(S);
    if (level) TL.startSchool(S, level);
  };

  TL.startSchool = function (S, level) {
    S.school = level;
    S.schoolLeft = TL.schoolDuration(level);
    S.job = 'student';
    TL.log(S, TL.L`你进入${({ primary: '初等学堂', middle: '中等学堂', high: '高等学堂', uni: '大学', grad: '研究院' })[level]}。`, 'mil', { key: 'school' });
  };

  /* 心境基线（happyBase）与年度财务（finances）已迁入 src/model/yearly.ts：      */
  /* 两者只做算术，装配层把它们接回 TL.happyBase / TL.finances。               */

  /* ---------------------------------------------------------------------- */
  /* 家庭年度推进（对应原作 familyYear）                                      */
  /* ---------------------------------------------------------------------- */
  TL.familyYear = function (S) {
    const F = S.fam;
    // 父母衰老与去世
    for (const key of ['mom', 'dad']) {
      const p = F[key];
      if (!p || !p.alive) continue;
      p.age++;
      // 用该国生命表估算父母死亡率
      const lt = TL.lifeTable(TL.NATION_BY_ID[S.nation], key === 'mom' ? 'F' : 'M');
      const q = p.age >= lt.maxAge ? 1 : lt.q[Math.floor(p.age)];
      if (TL.chance(q)) {
        p.alive = false;
        p.diedAt = S.age;
        TL.eff(S, { h: -14, so: -10 });
        TL.log(S, TL.L`你的${key === 'mom' ? '母亲' : '父亲'}去世了，享年 ${p.age} 岁。`, 'fam', { key: 'parentDeath' });
      }
    }
    // 伴侣
    if (F.partner && F.partner.alive) {
      F.partner.age++;
      const lt = TL.lifeTable(TL.NATION_BY_ID[S.nation], F.partner.sex);
      const q = F.partner.age >= lt.maxAge ? 1 : lt.q[Math.floor(F.partner.age)] * (F.partner.ori ? 2.4 : 1);
      if (TL.chance(q)) {
        F.partner.alive = false;
        F.partner.diedAt = S.age;
        TL.eff(S, { h: -26, so: -18 });
        TL.log(S, TL.L`${F.partner.name}走了。你们一起过了 ${S.age - (F.marriedAt || S.age)} 年。`, 'fam', { key: 'partnerDeath' });
      }
    }
    // 子女成长
    for (const k of F.kids) {
      if (!k.alive) continue;
      k.age++;
      // 与兄弟姐妹同一套规则：职业随年龄自动更新
      if (k.age === 7 || k.age === 16 || k.age === 67) k.job = TL.ageJob(S.nation, k.sex, k.age, S.race);
      if (k.age < 18) {
        const lt = TL.lifeTable(TL.NATION_BY_ID[S.nation], k.sex);
        const q = k.age >= lt.maxAge ? 1 : lt.q[k.age] * (k.ori ? 2.2 : 1);
        if (TL.chance(q)) {
          k.alive = false;
          TL.eff(S, { h: -30, so: -12 });
          TL.log(S, TL.L`${k.name}没能长大。他/她只活了 ${k.age} 岁。`, 'fam', { key: 'kidDeath' });
        }
      }
    }
    // 兄弟姐妹
    for (const s of F.sibs) {
      if (!s.alive) continue;
      s.age++;
      // 职业随年龄自然变化（7 岁前幼儿 / 16 岁前在学 / 之后就业 / 老年退休）
      if (s.age === 7 || s.age === 16 || s.age === 67) s.job = TL.ageJob(S.nation, s.sex, s.age, S.race);
      const lt = TL.lifeTable(TL.NATION_BY_ID[S.nation], s.sex);
      const q = s.age >= lt.maxAge ? 1 : lt.q[Math.floor(s.age)];
      if (TL.chance(q)) { s.alive = false; TL.eff(S, { h: -5, so: -4 }); }
    }
    // 伴侣的职业同样会变（换工作 / 退休）
    if (F.partner && F.partner.alive && !F.partner.job) {
      F.partner.job = TL.ageJob(S.nation, F.partner.sex, F.partner.age, S.race);
    }
    if (F.partner && F.partner.alive && F.partner.age === 67) {
      F.partner.job = TL.ageJob(S.nation, F.partner.sex, F.partner.age, S.race);
    }
    // 子女出生（婚内）
    TL.tryBirth(S);
  };

  /** 生育判定 */
  TL.tryBirth = function (S) {
    const F = S.fam;
    // 资格门槛与概率都在 src/model/birth.ts：返回 null 表示这一对不能生育（不消耗随机数）。
    const p = TL.birthChance(S);
    if (p == null) return;
    if (!TL.chance(p)) return;

    const sex = TL.chance(TL.SON_RATIO) ? 'M' : 'F';
    const nm = TL.makeName(S.nation, sex, S.race);
    const kid = {
      name: nm.given, sex: sex, age: 0, alive: true,
      ori: null, race: S.race, born: S.year,
      job: 'child'
    };
    // 母婴传播（泰拉特有）：感染方所生的孩子有概率先天感染
    if (TL.congenitalRisk(S)) {
      if (TL.chance(TL.CONGENITAL_CHANCE)) {
        kid.ori = TL.congenitalOri(TL.range(3, 9));
      }
    }
    F.kids.push(kid);
    TL.eff(S, { h: 12, so: 6 });
    TL.log(S, TL.L`${S.sex === 'F' ? '你' : F.partner.name}生下了一个${sex === 'M' ? '男孩' : '女孩'}，取名${nm.given}。`, 'fam', { key: 'birth' });
  };

  /* ---------------------------------------------------------------------- */
  /* 祝福 / 打击：通用生活事件（对应原作 milestone）                           */
  /* ---------------------------------------------------------------------- */
  TL.milestone = function (S) { /* 由 events.js 覆盖扩展 */ };

  /* ---------------------------------------------------------------------- */
  /* 死亡（对应原作 die）                                                     */
  /* ---------------------------------------------------------------------- */
  TL.die = function (S, cause, trigger) {
    if (TL.syncOrganization) TL.syncOrganization(S);
    S.phase = 'dead';
    if (S.orgApplication && S.orgApplication.session && TL.finishOrganizationInterview) {
      TL.finishOrganizationInterview(S);
      S.orgInterviewResult = null;
    }
    S.pending = null;
    S.deathAge = S.age;
    S.deathCause = cause;
    S.deathTrigger = trigger || 'event';

    const info = { name: TL.causeName(cause, S.age) };
    const n = TL.NATION_BY_ID[S.nation];

    // 死亡叙事：按死因与年龄给不同的收束
    let line;
    if (S.age < 1) line = TL.L`你没能活过第一个年头。`;
    else if (S.age < 5) line = TL.L`你只活了 ${S.age} 岁。`;
    else if (cause === 'ori') line = TL.L`结晶终于走到了心脏。${S.ori && S.ori.treated ? '抑制药剂让它慢了一些，但没有停下来。' : '没有人给你开过药。'}`;
    else if (cause === 'cat') line = TL.L`天灾来的时候没有预警。整座街区从地图上被抹掉了。`;
    else if (cause === 'war') line = TL.L`战争结束时你还躺在原地。有人在你身上盖了一件外套，然后就走了。`;
    else if (cause === 'art') line = TL.L`施术的最后一次反噬来得很快。你甚至没来得及收手。`;
    else if (cause === 'dem') line = TL.L`你老了很久，然后有一天不再醒来。`;
    else if (S.age >= 80) line = TL.L`你在睡眠中离开了。活了 ${S.age} 年，比这个国家大多数人都长。`;
    else line = TL.L`${info.name}带走了你。那年你 ${S.age} 岁。`;

    TL.log(S, line, 'death', { cause: cause, trigger: S.deathTrigger, risk: S.lastQ || null });
    TL.finalizeLife(S);
  };

  /* ---------------------------------------------------------------------- */
  /* 结算人生：生成报告数据（对应原作的人生报告）                              */
  /* ---------------------------------------------------------------------- */
  TL.finalizeLife = function (S) {
    const ys = S.stats.years;
    const st = S.st;
    const n = TL.NATION_BY_ID[S.nation];
    const r = TL.RACE_BY_ID[S.race];

    // 与本国国民的寿命对比
    const lt = S.lt;
    let pctLife = 0;
    for (let x = 0; x <= lt.maxAge; x++) {
      if (S.age >= x) pctLife = 1 - lt.l[x + 1]; else break;
    }

    // 一生四维均值
    let avg = { hl: 0, h: 0, sm: 0, so: 0 }, cnt = 0;
    for (const y of ys) { avg.hl += y.hl; avg.h += y.h; avg.sm += y.sm; avg.so += y.so; cnt++; }
    if (cnt) for (const k in avg) avg[k] = Math.round(avg[k] / cnt);

    // 峰值净资产
    let peak = 0;
    for (const y of ys) if (y.nw > peak) peak = y.nw;

    // 与「模拟基线」对比：国家的 le 在本作里是「移动城市的社会预期寿命」，
    // 荒野走绝对区间，两者不同源，直接比会显得每个人都在亏。
    // 拿模拟对模拟，报告里的「多活/少活」才有意义。
    const bl = (TL.BASELINE_LE || {})[S.nation + S.sex] || null;
    const baseLE = bl ? bl.m : Math.round(lt.e0 * 10) / 10;

    S.report = {
      name: S.fullName,
      nation: n.name,
      nationId: n.id,
      city: S.city,
      race: r.name,
      raceId: r.id,
      court: S.courtName,
      sex: S.sex,
      age: S.age,
      cause: S.deathCause,
      causeName: TL.causeName(S.deathCause, S.age),
      deathTrigger: S.deathTrigger || 'event',
      deathRisk: Number.isFinite(S.lastQ) ? S.lastQ : null,
      lifeExp: baseLE,
      statLE: Math.round(lt.e0 * 10) / 10,
      delta: Math.round((S.age - baseLE) * 10) / 10,
      pctLife: pctLife,
      baseP25: bl ? bl.p25 : null,
      baseP50: bl ? bl.p50 : null,
      baseP75: bl ? bl.p75 : null,
      apex: {
        job: S.flags.lastJob || S.job,
        jobName: (TL.JOBS[S.flags.lastJob || S.job] || {}).name || '无',
        opClass: S.opClass,
        opRank: S.opRank,
        eduLevel: S.eduLevel
      },
      orgHistory: (S.orgHistory || []).map(h => JSON.parse(JSON.stringify(h))),
      orgContacts: JSON.parse(JSON.stringify(S.orgContacts || {})),
      orgInterviewHistory: JSON.parse(JSON.stringify(S.orgInterviewHistory || [])),
      organization: S.affiliation ? {
        id: S.affiliation,
        name: TL.organizationName ? TL.organizationName(S.affiliation) : S.affiliation,
        route: S.orgRoute,
        routeName: TL.organizationRouteName ? TL.organizationRouteName(S.affiliation, S.orgRoute) : S.orgRoute,
        rank: S.orgRank || 0,
        rankName: TL.organizationRankName ? TL.organizationRankName(S.affiliation, S.orgRoute, S.orgRank) : '',
        history: (S.orgHistory || []).map(h => Object.assign({}, h)),
        contacts: Object.assign({}, S.orgContacts || {})
      } : null,
      ori: S.ori ? {
        at: S.ori.at, stage: S.ori.stage, crystal: Math.round(S.ori.crystal),
        treated: S.ori.treated, known: S.ori.known, provider: S.ori.provider
      } : null,
      arts: S.arts,
      artsRank: TL.artRank(S),
      artsRankName: TL.artRankName(TL.artRank(S)),
      avg: avg,
      final: { hl: Math.round(st.hl), h: Math.round(st.h), sm: Math.round(st.sm), so: Math.round(st.so) },
      peakNetWorth: peak,
      partners: S.stats.partnerCount || 0,
      kids: S.fam.kids.length,
      kidsAlive: S.fam.kids.filter(k => k.alive).length,
      years: ys,
      log: S.log,
      book: S.stats.book || [],
      migration: S.flags.migrations || 0,
      tag: n.tag
    };
    S.phase = 'report';
    return S.report;
  };

})(window.TL = window.TL || {});
