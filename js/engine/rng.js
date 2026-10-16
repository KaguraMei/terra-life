/* ==========================================================================
 * TERRA LIFE SIM — 随机数与基础数学
 * 移植自原作：setRng / seedRng / wpick / invNorm / normCdf / clamp / chance
 * ========================================================================== */
(function (TL) {
  'use strict';

  /* ---------------- 基础工具 ---------------- */
  TL.clamp = function (v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; };
  TL.lerp = function (a, b, t) { return a + (b - a) * t; };

  /* ---------------- 可复现随机数（mulberry32） ---------------- */
  let _rnd = Math.random;
  let _seed = null;

  /** 用种子重置随机源，使同一局可复现 */
  TL.seedRng = function (seed) {
    _seed = seed >>> 0;
    let a = _seed;
    _rnd = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  /** 回到真随机 */
  TL.unseedRng = function () { _rnd = Math.random; _seed = null; };

  TL.rnd = function () { return _rnd(); };
  TL.seed = function () { return _seed; };

  /** 概率命中 */
  TL.chance = function (p) { return _rnd() < p; };

  /** 区间均匀 */
  TL.range = function (lo, hi) { return lo + _rnd() * (hi - lo); };

  /** 整数区间 [lo, hi] */
  TL.irange = function (lo, hi) { return lo + Math.floor(_rnd() * (hi - lo + 1)); };

  /** 数组取一 */
  TL.pick = function (arr) { return arr[Math.floor(_rnd() * arr.length)]; };

  /** 加权取一（原作 wpick：遍历对象，权重取 max(0, w)） */
  TL.wpick = function (o) {
    let t = 0;
    for (const k in o) t += Math.max(0, o[k]);
    if (t <= 0) return Object.keys(o)[0];
    let r = _rnd() * t;
    for (const k in o) { r -= Math.max(0, o[k]); if (r <= 0) return k; }
    const ks = Object.keys(o);
    return ks[ks.length - 1];
  };

  /** 数组加权取一：[{w:..}, ...] */
  TL.wpickArr = function (arr, key) {
    key = key || 'w';
    let t = 0; for (const a of arr) t += Math.max(0, a[key]);
    if (t <= 0) return arr[0];
    let r = _rnd() * t;
    for (const a of arr) { r -= Math.max(0, a[key]); if (r <= 0) return a; }
    return arr[arr.length - 1];
  };

  /* ---------------- 统计函数（原作 invNorm / normCdf） ---------------- */
  /** 标准正态分布 CDF，用 Abramowitz-Stegun 7.1.26 的有理逼近 */
  TL.normCdf = function (z) {
    if (z < 0) return 1 - TL.normCdf(-z);
    const b1 = 0.319381530, b2 = -0.356563782, b3 = 1.781477937,
          b4 = -1.821255978, b5 = 1.330274429, p = 0.2316419;
    const t = 1 / (1 + p * z);
    const poly = t * (b1 + t * (b2 + t * (b3 + t * (b4 + t * b5))));
    return 1 - Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI) * poly;
  };

  /** 标准正态分布反函数（Acklam 逼近），用于「你在同龄人中的分位」 */
  TL.invNorm = function (p) {
    if (p <= 0) return -8; if (p >= 1) return 8;
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
               1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
               6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
               -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425;
    let q, r;
    if (p < pl) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
             ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p <= 1 - pl) {
      q = p - 0.5; r = q * q;
      return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
             (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
    }
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  };

  /* ---------------- 平滑插值：折线表 ---------------- */
  /** 给一组 [x, y] 断点，做线性插值 */
  TL.piecewise = function (pts, x) {
    if (x <= pts[0][0]) return pts[0][1];
    const n = pts.length;
    if (x >= pts[n - 1][0]) return pts[n - 1][1];
    for (let i = 0; i < n - 1; i++) {
      if (x >= pts[i][0] && x <= pts[i + 1][0]) {
        const t = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
        return TL.lerp(pts[i][1], pts[i + 1][1], t);
      }
    }
    return pts[n - 1][1];
  };

})(window.TL = window.TL || {});
