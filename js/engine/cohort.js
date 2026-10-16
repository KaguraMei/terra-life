/* ==========================================================================
 * TERRA LIFE SIM — 同秒出生的人（同期群 cohort）
 * --------------------------------------------------------------------------
 * 对应原作右栏的「在同一秒出生的人們」与「存活曲線」。
 *
 * 做法：出生时用同一张生命表 l(x) 反解出 N 个虚拟同伴的死亡年龄，
 *       于是「你的同期群」天然与你自己共享同一套死亡率参数 ——
 *       国家、性别、种族、阶层任何一项变了，同伴的存活曲线也跟着变。
 *
 * 这些同伴只用于展示，不参与任何事件判定，所以可以放心用低精度：
 * 600 人的曲线 + 6 个具名同伴，一次算完缓存进 S.cohort。
 * ========================================================================== */
(function (TL) {
  'use strict';

  const CURVE_N = 600;   // 存活曲线的样本量
  const PEER_N = 6;      // 具名同伴数量

  /** 由生命表的存活函数 l(x) 反解一个死亡年龄 */
  TL.drawDeathAge = function (lt, rnd) {
    const u = rnd();
    for (let x = 0; x <= lt.maxAge; x++) {
      if (lt.l[x + 1] <= u) return x;
    }
    return lt.maxAge;
  };

  /**
   * 出生时调用一次。
   * 结果：
   *   S.cohort.deaths  600 个死亡年龄（升序）
   *   S.cohort.curve   l(x) 采样：curve[i] = 活到 i 岁的比例（每 5 岁一个点）
   *   S.cohort.peers   具名同伴 [{name, sex, deathAt, jobHint}]
   */
  TL.makeCohort = function (S) {
    const rnd = TL.rnd;

    /* --- ① 曲线样本 --- */
    const deaths = new Array(CURVE_N);
    for (let i = 0; i < CURVE_N; i++) deaths[i] = TL.drawDeathAge(S.lt, rnd);
    deaths.sort((a, b) => a - b);

    /* --- ② 采样成 5 岁一格的曲线 --- */
    const top = Math.max(5, Math.min(120, Math.ceil(deaths[CURVE_N - 1] / 5) * 5));
    const curve = [];
    let idx = 0;
    for (let x = 0; x <= top; x += 5) {
      while (idx < CURVE_N && deaths[idx] < x) idx++;
      curve.push({ age: x, alive: (CURVE_N - idx) / CURVE_N });
    }

    /* --- ③ 具名同伴 --- */
    const pool = TL.NATION_BY_ID[S.nation].race;
    const peers = [];
    for (let i = 0; i < PEER_N; i++) {
      const sex = rnd() < 0.5 ? 'M' : 'F';
      const race = (rnd() < 0.55) ? S.race : pool[Math.floor(rnd() * pool.length)];
      const nm = TL.makeName(S.nation, sex, race);
      peers.push({
        name: nm.given, fullName: nm.full, sex: sex, race: race,
        deathAt: TL.drawDeathAge(S.lt, rnd)
      });
    }
    peers.sort((a, b) => a.deathAt - b.deathAt);

    S.cohort = { size: CURVE_N, deaths: deaths, curve: curve, peers: peers };
    return S.cohort;
  };

  /** 活到 age 岁的同伴比例（0..1） */
  TL.cohortAliveAt = function (S, age) {
    if (!S.cohort) return 1;
    const d = S.cohort.deaths;
    let lo = 0, hi = d.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (d[m] < age) lo = m + 1; else hi = m; }
    return (d.length - lo) / d.length;
  };

  /** 还剩几个具名同伴活着 */
  TL.peersAlive = function (S, age) {
    if (!S.cohort) return [];
    return S.cohort.peers.filter(p => p.deathAt >= age);
  };

})(window.TL = window.TL || {});
