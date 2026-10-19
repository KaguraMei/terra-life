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
  TL.tick = function (S, dtSec) {
    if (!S || S.phase !== 'life' || S.pending || S.paused) return;
    // dt = 真实秒 × 倍速 ÷ 每年所需秒数
    const dt = dtSec * S.speed / S.yearSec;
    const nt = Math.min(S.t + dt, 1);
    const accrue = to => {
      if (S.focus) S.fT[S.focus] = (S.fT[S.focus] || 0) + Math.max(0, to - S.t);
      S.t = to;
    };

    // 触发队列中所有已到期的事件
    while (S.queue.length && S.queue[0].at <= nt) {
      const e = S.queue.shift();
      accrue(e.at);
      TL.fire(S, e);
      if (S.pending || S.phase !== 'life') return;
    }

    accrue(nt);
    if (S.t >= 1) TL.endYear(S);
  };

  // 小步跨年快转，不跳过中间事件，也不提前结算抉择之后的重心时间。
  // 有限步数让 UI 可以分帧执行；不替玩家选重心或回答抉择。
  TL.advanceToDecision = function (S, budget = 256) {
    if (!S || S.phase !== 'life') return 'ended';
    const speed = S.speed;
    S.speed = 1;
    try {
      for (let i = 0; i < budget && S.phase === 'life' && !S.pending; i++) {
        S.paused = false;
        const at = S.queue.length ? S.queue[0].at : 1;
        TL.tick(S, (Math.max(0, at - S.t) + 1e-10) * S.yearSec);
      }
    } finally {
      S.speed = speed;
      S.paused = true;
    }
    return S.pending ? 'decision' : S.phase === 'life' ? 'searching' : 'ended';
  };

  /* ---------------------------------------------------------------------- */
  /* 事件队列                                                               */
  /* ---------------------------------------------------------------------- */
  /** 排入一个事件 */
  TL.queueEvent = function (S, at, type, id, p) {
    S.queue.push({ at: TL.clamp(at, 0, 1), type: type, id: id, p: p });
    S.queue.sort((a, b) => a.at - b.at);
  };

  /** 在年内随机位置排入若干事件 */
  TL.queueRandom = function (S, n, type, picker) {
    for (let i = 0; i < n; i++) {
      const id = picker();
      if (id) TL.queueEvent(S, TL.rnd(), type, id);
    }
  };

  /* ---------------------------------------------------------------------- */
  /* fire：派发事件                                                          */
  /* ---------------------------------------------------------------------- */
  TL.fire = function (S, e) {
    S.actEvent = null;
    try {
      if (e.type === 'ev') {
        const ev = TL.EVMAP[e.id];
        if (!TL.contentAvailable(S, ev)) return;
        if (ev.when && !ev.when(S)) return;
        /* 一生次数上限必须在这里拦 —— 这里是所有事件的唯一入口。
           只在 pickFrom 里拦是不够的：scheduleEvents 里那些「强制排入」的
           事件（阶层天灾、纠察队、矿坑）根本不走选池，于是 cat_city
           能在一条命里刷二十几次，同一句话重复到读者出戏。 */
        if ((S.evCount[e.id] || 0) >= (ev.max == null ? 2 : ev.max)) return;
        const last = S.flags['ev_' + e.id];
        const cooldown = ev.cd == null ? 4 : ev.cd;
        if (last != null && S.age - last < cooldown) return;
        S.actEvent = e.id;
        const before = TL.netWorth(S);
        const r = ev.run(S, e.p);
        TL.bookSince(S, before, ev.book || ev.title || '其他');
        if (r) {
          if (typeof r === 'string') TL.log(S, r, 'ev', { key: e.id });
          else TL.log(S, r.t, r.k || 'ev', { key: e.id, f: r.f });
        }
        S.actEvent = null;
        S.flags['ev_' + e.id] = S.age;
        if (!S.evCount) S.evCount = {};
        S.evCount[e.id] = (S.evCount[e.id] || 0) + 1;
        S.recent.push(e.id);
        if (S.recent.length > 14) S.recent.shift();
      } else if (e.type === 'ms') {
        TL.milestone(S);
      } else if (e.type === 'dec') {
        TL.openDecision(S, e.id, e.p);
      } else if (e.type === 'cat') {
        TL.catastrophe(S, e.p);
      }
    } catch (err) {
      // 单个事件出错不应毁掉整局
      if (typeof console !== 'undefined') console.error('[ev]', e.id, err);
    } finally {
      if (S.phase === 'life' && TL.syncOrganization) TL.syncOrganization(S);
    }
  };

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
    let tot = 0;
    for (const k in S.fT) tot += S.fT[k];
    if (tot > 0) {
      for (const k in S.fT) {
        const F = TL.FOCUS[k];
        if (!F) continue;
        const w = S.fT[k] / tot;
        for (const s in F.e) {
          if (s === 'sm' || s === 'arts' || s === 'money') continue;
          st[s] = TL.clamp(st[s] + F.e[s] * w, 0, 100);
        }
        // 学识与技艺走独立成长曲线（边际递减）
        if (F.e.sm) TL.knowAdd(S, F.e.sm * w);
        if (F.e.arts) TL.artsAdd(S, F.e.arts * w);
      }
      S.focusW = {};
      for (const k in S.fT) S.focusW[k] = S.fT[k] / tot;
    } else {
      S.focusW = {};
    }

    /* ---------- ② 爱好成长 ---------- */
    for (const hb of S.hobbies) hb.lv += 0.35;

    /* ---------- ③ 教育 ---------- */
    TL.schoolYear(S);

    /* ---------- ④ 收入与资产 ---------- */
    TL.computeIncome(S);
    TL.finances(S);

    /* ---------- ⑤ 体质回归 ---------- */
    // 目标体质 = 年龄基准 + 各种生活方式修正
    const eh = TL.expHealth(a + 1);
    // 慢性病的拖累：已控制的病只算一半
    let condLoad = 0;
    for (const k in S.conds) condLoad += S.conds[k].treated ? 2.5 : 5;
    const hTarget =
      eh
      + (S.flags.diet ? 1.5 : 0)
      + (S.flags.exercise ? 2 : 0)
      + (S.q - 3) * 1.5
      - (S.smoker ? 6 : 0)
      - condLoad
      - (S.refugee ? 6 : 0)
      + (S.focusW.health || 0) * 6
      - (S.debt > 0 ? 2 : 0)
      - (S.ori && S.ori.stage > 0 ? S.ori.stage * 7 : 0)     // 矿石病直接压低目标
      - (S.flags.tbUntreated ? 10 : 0);
    st.hl = TL.clamp(st.hl + (hTarget - st.hl) * 0.25, 1, 100);

    /* ---------- ⑥ 羁绊回归 ---------- */
    const kidsAlive = S.fam.kids.filter(k => k.alive).length;
    const soTarget =
      45
      + (S.fam.partner && S.fam.partner.alive && S.fam.married ? 12 : 0)
      + Math.min(15, kidsAlive * 4)
      + (S.fam.mom && S.fam.mom.alive ? 3 : 0)
      + (S.migrated ? -6 : 0)
      + (S.hobbies.length ? 3 : 0)
      - (S.ori && S.ori.known ? 6 : 0);                        // 公开身份会被孤立
    // 成年后社交基线会随年龄下滑（原作 SO_K）
    const SO_K = 12, SO_UP = 0.30;
    const ak = TL.clamp((a - 14) / 6, 0, 1);
    const t2 = soTarget - SO_K * ak;
    st.so = TL.clamp(st.so + (t2 - st.so) * (st.so > t2 ? 0.12 + (SO_UP - 0.12) * ak : 0.12), 0, 100);

    /* ---------- ⑦ 心境回归 ---------- */
    let hTarget2 = TL.happyBase(S);
    hTarget2 += (st.hl - 60) * 0.16;                          // 身体好心情也好
    hTarget2 += (st.so - 50) * 0.18;
    hTarget2 += (S.pct - 0.5) * 22;                           // 相对收入
    hTarget2 += (S.ori && S.ori.stage >= 2 ? -12 : 0);
    hTarget2 -= (S.ori && S.ori.known ? 6 : 0);
    hTarget2 += (S.stats && S.stats.pY ? Math.min(6, S.stats.pY * 0.1) : 0);
    st.h = TL.clamp(st.h + (hTarget2 - st.h) * 0.20, 1, 100);

    /* ---------- ⑧ 学识自然增长/衰退 ---------- */
    TL.knowYear(S);

    /* ---------- ⑨ 泰拉特有：矿石病推进 ---------- */
    TL.oriYear(S);

    /* ---------- ⑨b 组织服役与晋升 ---------- */
    /* 组织是职业之外的长期归属。先记满一年的服务，再按路线门槛
       处理一次晋升；面试系统将来只负责入职前的多轮答题。 */
    if (TL.organizationYear) {
      TL.organizationYear(S);
      if (TL.promoteOrganization) TL.promoteOrganization(S);
    }

    /* ---------- ⑩ 记录本年快照 ---------- */
    S.stats.years.push({
      age: a,
      hl: Math.round(st.hl), h: Math.round(st.h),
      sm: Math.round(st.sm), so: Math.round(st.so),
      pct: S.pct, income: Math.round(S.income),
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
      S.flags.retired = true;
      if (TL.isWorking(S)) S.flags.lastJob = S.job;
      S.job = 'retired';
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
  /* 学习曲线：边际递减（对应原作 knowAdd / knowYear）                        */
  /* ---------------------------------------------------------------------- */
  /**
   * 学识的天花板。
   * 早期版本让 knowAdd 无限逼近 100，结果一个 26 岁的青年就能「通才」——
   * 因为边际递减只让增长变慢，并没有真正的上限。
   * 现在给出一个由「学历 + 国家教育水平 + 天赋」决定的上限：
   * 没上过学的人自学也能很强，但很难到顶。
   */
  TL.knowCap = function (S) {
    const n = TL.NATION_BY_ID[S.nation];
    const r = TL.RACE_BY_ID[S.race];
    let cap = 34
      + S.eduLevel * 11                    // 学历是最主要的台阶
      + Math.min(14, (n.edu - 8) * 1.6)    // 国家教育水平
      + (r.mod.sm || 0) * 0.9              // 种族天赋
      + (S.q - 3) * 1.6;                   // 家境提供的资源
    // 在学期间上限再放宽一点（正在读书的人成长空间更大）
    if (S.school) cap += 6;
    return TL.clamp(cap, 25, 97);
  };

  TL.knowAdd = function (S, amt) {
    const cap = TL.knowCap(S);
    if (amt <= 0) { S.st.sm = TL.clamp(S.st.sm + amt, 0, cap); return; }
    // 越高越难涨：收益 × (1 - sm/cap)^0.7
    const k = Math.pow(Math.max(0, 1 - S.st.sm / cap), 0.70);
    S.st.sm = TL.clamp(S.st.sm + amt * (0.30 + 0.70 * k), 0, cap);
  };

  /** 技艺适应性成长（比学识更慢，且受种族天赋影响） */
  TL.artsAdd = function (S, amt) {
    if (amt <= 0) { S.arts = TL.clamp(S.arts + amt, 0, 100); return; }
    const r = TL.RACE_BY_ID[S.race];
    const talent = 1 + (r.mod.art || 0) * 0.04;
    const k = Math.pow(1 - S.arts / 100, 0.85);
    S.arts = TL.clamp(S.arts + amt * (0.25 + 0.75 * k) * talent, 0, 100);
  };

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
    const n = TL.NATION_BY_ID[S.nation];
    if (S.school) {
      S.schoolLeft = (S.schoolLeft || 0) - 1;
      if (S.schoolLeft <= 0) {
        const finished = S.school;
        S.school = null;
        // 学历台阶：初等1 / 中等2 / 高等3 / 大学4 / 研究院5
        S.eduLevel = Math.max(S.eduLevel, { primary: 1, middle: 2, high: 3, uni: 4, grad: 5 }[finished] || 1);
        S.flags['grad_' + finished] = a;
        TL.log(S, TL.L`你结束了${({ primary: '初等', middle: '中等', high: '高等', uni: '大学', grad: '研究院' })[finished]}学业。`, 'mil', { key: 'grad' });
      }
      return;
    }
    // 自动入学：只要国家教育水平够、家境撑得住
    if (a === 6 && n.edu >= 6 && !S.flags.noSchool) {
      TL.startSchool(S, 'primary');
    } else if (a === 12 && n.edu >= 9 && S.q >= 2 && TL.chance(0.55 + n.ter / 200)) {
      TL.startSchool(S, 'middle');
    } else if (a === 15 && n.edu >= 11 && S.q >= 3 && TL.chance(0.35 + n.ter / 160)) {
      TL.startSchool(S, 'high');
    } else if (a === 18 && n.ter >= 30 && S.q >= 3 && S.st.sm >= 55 && TL.chance(n.ter / 130)) {
      TL.startSchool(S, 'uni');
    } else if (a === 22 && n.ter >= 50 && S.q >= 4 && S.st.sm >= 75 && TL.chance(n.ter / 220)) {
      TL.startSchool(S, 'grad');
    }
  };

  TL.startSchool = function (S, level) {
    const dur = { primary: 6, middle: 3, high: 3, uni: 4, grad: 3 }[level] || 3;
    S.school = level;
    S.schoolLeft = dur;
    S.job = 'student';
    TL.log(S, TL.L`你进入${({ primary: '初等学堂', middle: '中等学堂', high: '高等学堂', uni: '大学', grad: '研究院' })[level]}。`, 'mil', { key: 'school' });
  };

  /* ---------------------------------------------------------------------- */
  /* 心境基线（对应原作 happyBase）                                           */
  /* ---------------------------------------------------------------------- */
  TL.happyBase = function (S) {
    const n = TL.NATION_BY_ID[S.nation];
    // 用「预期寿命 + 社会安全」粗略代表国民幸福感基线
    const base = 30 + (n.le - 60) * 0.85 + (1 - n.gi) * 14 + (1 - n.war) * 6;
    return TL.clamp(base, 18, 78);
  };

  /* ---------------------------------------------------------------------- */
  /* 年度财务（对应原作 finances）                                            */
  /* ---------------------------------------------------------------------- */
  TL.finances = function (S) {
    const inc = S.income * 12;                 // 年收入
    const n = TL.NATION_BY_ID[S.nation];
    // 生活成本：与产出水平挂钩
    let cost = n.ppp * 0.52 * (1 + (S.q - 3) * 0.10);
    // 家庭成员增加开销
    const kids = S.fam.kids.filter(k => k.alive && k.age < 18).length;
    cost *= 1 + kids * 0.22;
    if (S.fam.partner && S.fam.partner.alive && !S.working2) cost *= 1.35;
    // 感染者治疗费
    if (S.ori && S.ori.treated) cost += n.ppp * (S.ori.provider === 'rhodes' ? 2.2 : 1.0);
    // 慢性病
    cost += Object.keys(S.conds).length * n.ppp * 0.28;

    const support = TL.organizationSubsistence ? TL.organizationSubsistence(S) : 0;
    const net = inc - Math.max(0, cost - support);
    S.money += net;
    if (S.money < 0) {
      // 负债：借款有利息
      S.debt += -S.money * 0.06;
      S.money = 0;
    }
    // 有余钱则还债
    if (S.money > 0 && S.debt > 0) {
      const pay = Math.min(S.money * 0.4, S.debt);
      S.debt -= pay; S.money -= pay;
    }
    return net;
  };

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
      if (k.age === 7 || k.age === 16 || k.age === 67) k.job = TL.ageJob(S.nation, k.sex, k.age);
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
      if (s.age === 7 || s.age === 16 || s.age === 67) s.job = TL.ageJob(S.nation, s.sex, s.age);
      const lt = TL.lifeTable(TL.NATION_BY_ID[S.nation], s.sex);
      const q = s.age >= lt.maxAge ? 1 : lt.q[Math.floor(s.age)];
      if (TL.chance(q)) { s.alive = false; TL.eff(S, { h: -5, so: -4 }); }
    }
    // 伴侣的职业同样会变（换工作 / 退休）
    if (F.partner && F.partner.alive && !F.partner.job) {
      F.partner.job = TL.ageJob(S.nation, F.partner.sex, F.partner.age);
    }
    if (F.partner && F.partner.alive && F.partner.age === 67) {
      F.partner.job = TL.ageJob(S.nation, F.partner.sex, F.partner.age);
    }
    // 子女出生（婚内）
    TL.tryBirth(S);
  };

  /** 生育判定 */
  TL.tryBirth = function (S) {
    const F = S.fam;
    if (!F.partner || !F.partner.alive || !F.married) return;
    if (S.sex !== 'F' && S.age > 60) return;
    const moAge = S.sex === 'F' ? S.age : F.partner.age;
    if (moAge < 16 || moAge > 46) return;
    const n = TL.NATION_BY_ID[S.nation];
    // 生育率：国家 TFR 的近似（用 le 与 urb 反推）
    let tfr = TL.clamp(6.2 - n.urb / 22 - n.edu / 6, 1.0, 6.0);
    if (S.ori && S.ori.stage >= 2) tfr *= 0.55;
    if (S.q >= 4) tfr *= 0.8;
    const want = (F.kids.length < Math.round(tfr)) ? 1 : 0.15;
    const p = want * 0.32 * (1 - Math.abs(moAge - 27) / 30);
    if (!TL.chance(TL.clamp(p, 0, 0.6))) return;

    const sex = TL.chance(0.512) ? 'M' : 'F';
    const nm = TL.makeName(S.nation, sex, S.race);
    const kid = {
      name: nm.given, sex: sex, age: 0, alive: true,
      ori: null, race: S.race, born: S.year,
      job: 'child'
    };
    // 母婴传播（泰拉特有）：感染母亲的孩子有概率先天感染
    if ((S.sex === 'F' && S.ori && S.ori.stage > 0) ||
        (S.sex === 'M' && F.partner.ori && F.partner.ori.stage > 0)) {
      if (TL.chance(0.12)) {
        kid.ori = { at: 0, stage: 1, crystal: TL.range(3, 9), treated: false, known: false, art: false, congenital: true };
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
