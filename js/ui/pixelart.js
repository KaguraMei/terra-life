/* ==========================================================================
 * TERRA LIFE SIM — 程序化像素场景（canvas 160×64，纯 fillRect）
 * --------------------------------------------------------------------------
 * 图层自后向前 7 层，全部按整数像素落点：
 *   天空（2-3 段纯色带 + 天际特效）→ 远景剪影（逐列折线，前后两层做空气透视）
 *   → 远景平原带 → 中景标志物剪影 → 地面（亮面 / 主色 / 暗面 + 纹理行）
 *   → 前景（小屋 + 小人 + 杂物）→ 叠加层（天灾霾 / 矿石病晶簇）
 * 调色板：每个国家 pal 固定 6 槽 —— pal[0] 最暗轮廓 / pal[1] 暗面·远景剪影 /
 *   pal[2] 中间色·地面亮面 / pal[3] 灯火亮部 / pal[4] 强调色 / pal[5] 高光；
 *   sky[0..2] 由高到低三段天光，sky[2] 必亮于剪影色，保证轮廓可读。
 * 随机：只用本文件内的 mulberry32(opts.seed)，同种子逐像素可复现；不用内置随机源，
 *   也不依赖时间、设备像素比与任何外部资源。
 * ========================================================================== */
(function (TL) {
  'use strict';
  var W = 160, H = 64;            // 内部低分辨率（CSS 放大 + pixelated）
  var HZ = 34;                    // 地平线：远景剪影基线
  var GY = 41;                    // 中景标志物基线
  var GL = 47;                    // 地表线：地面带顶部
  var FEET = 52;                  // 小人落脚线

  function mkb(a) {   /* 可复现随机 */
    a = a >>> 0;
    return function () { a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hash(s) { var h = 2166136261, i; for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  var PROF = {   /* 国家档案：sky 天光 / feat 天际特效 / far 远景 / mid 中景 / fg 前景小屋 / gnd 地面 */
    YAN: { sky: ['#1d1420', '#3d2230', '#6d3a2c'], feat: 'dusk', far: 'terrace', mid: 'pagoda', fg: 'hut', gnd: '#4a2f22', pal: ['#1a1014', '#43241f', '#8a4a2e', '#d89a52', '#c8402a', '#e8c07a'] },
    LMN: { sky: ['#0d0f18', '#1a1c2a', '#33253a'], feat: 'neon', far: 'skyline', mid: 'megacity', fg: 'block', gnd: '#22202c', pal: ['#0a0a12', '#1e1e2e', '#3a3a54', '#f0a832', '#e0456a', '#ffd27a'] },
    SRG: { sky: ['#3a2a14', '#7a5a24', '#c89a48'], feat: 'dust', far: 'dunes', mid: 'dome', fg: 'hut', gnd: '#b08a4a', pal: ['#2a1e10', '#6a4e24', '#c8a460', '#f0dca0', '#8a5a20', '#e8b84a'] },
    URS: { sky: ['#141a24', '#243040', '#3c4c5e'], feat: 'smoke', far: 'skyline', mid: 'factory', fg: 'shack', gnd: '#7e8894', pal: ['#0e131a', '#26313e', '#4a5866', '#8a99a8', '#c8402a', '#d8e2ec'] },
    SAMI: { sky: ['#0a1c28', '#124054', '#2a7a86'], feat: 'aurora', far: 'floes', mid: 'tent', fg: 'tent', gnd: '#cfe2ea', pal: ['#0d1a22', '#1e3a44', '#3e6a72', '#a8d8dc', '#e8f4f8', '#7ad0a0'] },
    KJR: { sky: ['#101a2a', '#1e3450', '#3a5a7a'], feat: 'stars', far: 'ridge', mid: 'derrick', fg: 'shack', gnd: '#a8bccc', pal: ['#0b1220', '#1e2c44', '#3e5670', '#8ea8c0', '#c8783a', '#e0ecf8'] },
    VIC: { sky: ['#1a1a1c', '#2e2c2c', '#4a4038'], feat: 'soot', far: 'skyline', mid: 'bricks', fg: 'block', gnd: '#3a332c', pal: ['#141214', '#332a26', '#6a4a3a', '#a05a3a', '#c8a060', '#d8452a'] },
    LEI: { sky: ['#1a1030', '#33204a', '#5a3a6a'], feat: 'dusk', far: 'skyline', mid: 'spires', fg: 'block', gnd: '#332a3a', pal: ['#120c1e', '#2a1c3e', '#5a3a6a', '#c8a05a', '#9a5ac8', '#f0d890'] },
    KAZ: { sky: ['#241820', '#3e2a2c', '#6a4a3a'], feat: 'none', far: 'skyline', mid: 'arena', fg: 'block', gnd: '#4a3a30', pal: ['#160e12', '#33222a', '#6a4a44', '#c8c0b8', '#d8302a', '#f0e8dc'] },
    HIG: { sky: ['#241436', '#4a2450', '#9a4a6a'], feat: 'dusk', far: 'mountain', mid: 'torii', fg: 'hut', gnd: '#2a2434', pal: ['#140c1c', '#2e1c38', '#5a3450', '#d8688a', '#c8402a', '#f0a8b8'] },
    CLB: { sky: ['#1a2028', '#3a4a4a', '#a06a3a'], feat: 'dust', far: 'mesa', mid: 'mast', fg: 'shack', gnd: '#8a6a44', pal: ['#141210', '#3a2c22', '#6a4a30', '#c08a4a', '#2a8a8a', '#e8c088'] },
    BLV: { sky: ['#16261c', '#26402c', '#4a6a3a'], feat: 'smoke', far: 'jungle', mid: 'watchtower', fg: 'shack', gnd: '#2e3a22', pal: ['#101810', '#22301c', '#3e5228', '#6a7a3a', '#c8a040', '#8a4a2a'] },
    IBE: { sky: ['#2a2438', '#5a4a52', '#c89a6a'], feat: 'dusk', far: 'ocean', mid: 'cathedral', fg: 'hut', gnd: '#c8b088', pal: ['#1a1620', '#3a3444', '#7a7280', '#e0d4b8', '#c8a04a', '#5a7a9a'] },
    LAT: { sky: ['#2a3550', '#5a6a8a', '#a8b8d0'], feat: 'none', far: 'skyline', mid: 'clocktower', fg: 'block', gnd: '#8a8a90', pal: ['#1a2030', '#3a4458', '#7a8698', '#f0ead8', '#e8c85a', '#ffffff'] },
    MIN: { sky: ['#1e3550', '#3a6a8a', '#8ab8c8'], feat: 'none', far: 'mountain', mid: 'colonnade', fg: 'block', gnd: '#c8c0a8', pal: ['#141c28', '#2a3a4e', '#5a6a7a', '#e8e4d8', '#3a6a9a', '#e8c060'] },
    SIR: { sky: ['#2a1a16', '#4a2a22', '#7a4a2c'], feat: 'dust', far: 'skyline', mid: 'estate', fg: 'block', gnd: '#4a3828', pal: ['#160e0c', '#33201a', '#6a4028', '#c08a4a', '#8a2a24', '#e8d0a0'] },
    RMB: { sky: ['#2e1a14', '#6a3020', '#a85a2a'], feat: 'dust', far: 'terrace', mid: 'headframe', fg: 'shack', gnd: '#8a4428', pal: ['#1c0e0a', '#3e1e14', '#7a3a20', '#c8703a', '#e8a85a', '#4a4a4a'] },
    KDZ: { sky: ['#1a1614', '#2e2824', '#4a3c34'], feat: 'ash', far: 'ruin', mid: 'ruintower', fg: 'wreck', gnd: '#33302c', pal: ['#100e0c', '#262220', '#423c38', '#6a625a', '#c8382a', '#e8703a'] },
    SST: { sky: ['#2a1840', '#7a2a54', '#e07a6a'], feat: 'festival', far: 'ocean', mid: 'palm', fg: 'hut', gnd: '#c8a878', pal: ['#1a1024', '#3a1c3a', '#6a3450', '#20b0c0', '#f0a0a0', '#f0e070'] },
    AEG: { sky: ['#02080f', '#04202f', '#06414f'], feat: 'shafts', far: 'coralwall', mid: 'coral', fg: 'shack', gnd: '#0a2a30', pal: ['#03121a', '#06283a', '#0a4657', '#2a9aa0', '#7ad8d0', '#c8f0ea'] },
    DUR: { sky: ['#080503', '#140c06', '#2a1a0c'], feat: 'lamp', far: 'stalactite', mid: 'machine', fg: 'block', gnd: '#2a1c10', pal: ['#0a0704', '#1c1208', '#4a2c10', '#a86a20', '#e8b040', '#f0d890'] }
  };
  var NEUTRAL = { sky: ['#1a1a1a', '#2e2c2a', '#4a443e'], feat: 'none', far: 'ridge', mid: 'block', fg: 'hut', gnd: '#3a352e', pal: ['#121110', '#2a2724', '#4a443c', '#7a7064', '#a89880', '#c8c0b0'] };  // 未知国家回落

  /* ---------------------------------------------------------------------- */
  /* 日光提亮                                                                */
  /* ---------------------------------------------------------------------- */
  /* 上面这套调色是按「夜戏」定的。放在本作奶油色的浅底界面里，整块画面像
     一台没开灯的显示器 —— 天空近黑、地面近黑、小人只剩剪影。
     这里做一次性的、色相不变的提亮：每个颜色朝暖白混合。
     各槽位的力度不同，因为它们的职责不同：
       天空 / 地面 = 环境，提得最多（否则整幅画没有"白天"的感觉）
       pal[0]     = 最暗轮廓，几乎不动（剪影一旦被提亮，画面立刻散掉）
       pal[3..5]  = 已经是亮部，只轻微提（否则会过曝成一片白）
     只有深海（AEG）与地下（DUR）刻意保留低照度 —— 它们本来就该暗。 */
  var DIM = { AEG: 0.34, DUR: 0.34, KDZ: 0.42, LMN: 0.44, SAMI: 0.46 };
  var LIFT_SKY = [0.62, 0.52, 0.44];      // 天空：由下而上（远→近），越靠地平线越亮
  var LIFT_PAL = [0.34, 0.42, 0.42, 0.26, 0.20, 0.06];

  function lift(hex, k) {
    if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return hex;
    var r = parseInt(hex.substr(1, 2), 16),
        g = parseInt(hex.substr(3, 2), 16),
        b = parseInt(hex.substr(5, 2), 16);
    // 朝暖白偏：红提满，绿次之，蓝最少 —— 这样提完仍然是同一族色相，不会发灰
    r = r + (255 - r) * k;
    g = g + (252 - g) * (k * 0.94);
    b = b + (240 - b) * (k * 0.80);
    var s = '#' + [r, g, b].map(function (v) {
      var t = Math.round(v).toString(16);
      return t.length < 2 ? '0' + t : t;
    }).join('');
    return s;
  }

  (function daylight() {
    var id, p, k, i;
    for (id in PROF) {
      p = PROF[id];
      k = DIM[id] != null ? DIM[id] : 0.50;
      for (i = 0; i < p.sky.length; i++) p.sky[i] = lift(p.sky[i], k * LIFT_SKY[i % 3]);
      for (i = 0; i < p.pal.length; i++) p.pal[i] = lift(p.pal[i], k * LIFT_PAL[i % 6] * 1.7);
      p.gnd = lift(p.gnd, k * 0.70);
    }
    NEUTRAL.sky = NEUTRAL.sky.map(function (c, i) { return lift(c, 0.5 * LIFT_SKY[i % 3]); });
    NEUTRAL.pal = NEUTRAL.pal.map(function (c, i) { return lift(c, 0.5 * LIFT_PAL[i % 6] * 1.7); });
    NEUTRAL.gnd = lift(NEUTRAL.gnd, 0.35);
  })();

  var C = null;   /* 绘制原语：唯一出口是 px()，保证整数与画布内；C = 本次绘制的 2d 上下文 */
  var RIM = '#ffffff', LIT = false;                                  // 小人配色：按地面明度切亮/暗两套
  function lum(h) { return (parseInt(h.slice(1, 3), 16) * 299 + parseInt(h.slice(3, 5), 16) * 587 + parseInt(h.slice(5, 7), 16) * 114) / 1000; }
  function px(x, y, w, h, c) {
    x = Math.floor(x) | 0; y = Math.floor(y) | 0; w = Math.floor(w) | 0; h = Math.floor(h) | 0;
    if (x < 0) { w += x; x = 0; }
    if (y < 0) { h += y; y = 0; }
    if (x + w > W) w = W - x; if (y + h > H) h = H - y;
    if (w > 0 && h > 0) { C.fillStyle = c; C.fillRect(x, y, w, h); }
  }
  function hl(x0, x1, y, c) { var t; if (x1 < x0) { t = x0; x0 = x1; x1 = t; } px(x0, y, x1 - x0 + 1, 1, c); }
  function vl(x, y0, y1, c) { var t; if (y1 < y0) { t = y0; y0 = y1; y1 = t; } px(x, y0, 1, y1 - y0 + 1, c); }
  function disc(cx, cy, r, c) { for (var dy = -r; dy <= r; dy++) { var dx = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy))); hl(cx - dx, cx + dx, cy + dy, c); } }
  function ell(cx, cy, rx, ry, c) { for (var dy = -ry; dy <= ry; dy++) { var dx = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry)))); hl(cx - dx, cx + dx, cy + dy, c); } }
  function roof(x, yb, w, h, c) { for (var i = 0; i < h && i * 2 < w; i++) hl(x + i, x + w - 1 - i, yb - i, c); }   // 阶梯式坡屋顶
  function smoke(x, y0, n, c) { for (var i = 0; i < n; i++) px(x + Math.round(i * 0.7) + (i % 2), y0 - i * 2, 2 + (i % 3), 1, c); }
  function dither(y0, y1, c, step, ph) { for (var y = y0; y < y1; y++) for (var x = ((y + ph) % step); x < W; x += step) px(x, y, 1, 1, c); }
  function ring(cx, cy, r, t, c) {                                   // 像素圆环（齿轮 / 光环）
    for (var dy = -r; dy <= r; dy++) {
      var dx = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      var ix = r - t > 0 ? Math.floor(Math.sqrt(Math.max(0, (r - t) * (r - t) - dy * dy))) : 0;
      if (dy <= -(r - t) || dy >= r - t || ix === 0) hl(cx - dx, cx + dx, cy + dy, c);
      else { hl(cx - dx, cx - ix, cy + dy, c); hl(cx + ix, cx + dx, cy + dy, c); }
    }
  }

  function line(rng, step, lo, hi) {   /* 高度场：粗控制点 + 整数线性插值 */
    var n = Math.ceil(W / step) + 2, p = [], o = new Array(W), i, x, k, t;
    for (i = 0; i < n; i++) p.push(lo + Math.floor(rng() * (hi - lo + 1)));
    for (x = 0; x < W; x++) { k = Math.floor(x / step); t = x - k * step; o[x] = p[k] + Math.round((p[k + 1] - p[k]) * t / step); }
    return o;
  }
  function farField(type, rng, k) {
    var o = new Array(W), a, b, x, v, hi = function (n) { return Math.max(2, Math.round(n * k)); };
    switch (type) {
      case 'ridge': a = line(rng, 34, 4, hi(24)); b = line(rng, 13, 2, hi(12));      // 谢拉格：尖锐雪峰
        for (x = 0; x < W; x++) o[x] = Math.max(a[x], b[x]);
        return { h: o, cap: true };
      case 'mountain': a = line(rng, 26, 3, hi(20)); b = line(rng, 11, 1, hi(11));
        for (x = 0; x < W; x++) o[x] = Math.max(a[x], b[x]);
        return { h: o };
      case 'skyline': case 'ruin': case 'block':
        a = line(rng, 7, 2, hi(18));
        for (x = 0; x < W; x++) { v = Math.round(a[x] / 3) * 3; if (type === 'ruin' && rng() < 0.22) v = Math.round(v * 0.3); o[x] = v; }
        return { h: o, win: type !== 'ruin' };
      case 'terrace': case 'mesa': a = line(rng, 18, 2, hi(16));                     // 梯田 / 方山台地
        for (x = 0; x < W; x++) o[x] = Math.floor(a[x] / 4) * 4;
        return { h: o };
      case 'dunes': a = line(rng, 40, 1, hi(7)); b = line(rng, 17, 0, hi(4));
        for (x = 0; x < W; x++) o[x] = a[x] + b[x];
        return { h: o };
      case 'floes': a = line(rng, 23, 1, hi(5));
        for (x = 0; x < W; x++) o[x] = (x * 7 + Math.floor(a[x] * 3)) % 11 < 2 ? a[x] + 3 : a[x];
        return { h: o };
      case 'jungle': a = line(rng, 9, 3, hi(11)); b = line(rng, 4, 0, hi(4));
        for (x = 0; x < W; x++) o[x] = a[x] + b[x];
        return { h: o };
      case 'coralwall': a = line(rng, 14, 3, hi(16));
        for (x = 0; x < W; x++) o[x] = a[x] + ((x % 6 < 2) ? 2 : 0);
        return { h: o };
      case 'ocean': for (x = 0; x < W; x++) o[x] = 0;
        return { h: o, wave: true };
      case 'stalactite': a = line(rng, 19, 2, hi(14));                               // 杜林：倒挂洞顶
        for (x = 0; x < W; x++) o[x] = a[x];
        return { h: o, hang: true };
      default: a = line(rng, 12, 2, hi(10));
        for (x = 0; x < W; x++) o[x] = a[x];
        return { h: o };
    }
  }

  function sky(pr, rng, str) {   /* 1 天空 + 天际特效 */
    var s = pr.sky;
    px(0, 0, W, 12, s[0]); px(0, 12, W, 11, s[1]); px(0, 23, W, HZ - 22, s[2]);
    if (str === 'industrial') dither(0, 16, s[0], 4, 0);             // 工业带：天更脏
    if (str === 'fringe') dither(0, 12, s[0], 5, 2);
  }
  function feat(pr, rng) {
    var p = pr.pal, i, x, y, yy, t;
    switch (pr.feat) {
      case 'aurora':                                                 // 萨米：极光带
        for (i = 0; i < 3; i++) for (x = 0; x < W; x++) {
          yy = 5 + i * 6 + Math.round(Math.sin((x + i * 23) / 16) * 2);
          px(x, yy, 1, 1, i === 1 ? '#8af0c0' : '#5fc8dc');
          if (x % 4 === 0) px(x, yy + 1, 1, 1, '#2f7f88');
        } break;
      case 'stars': for (i = 0; i < 46; i++) px(Math.floor(rng() * W), Math.floor(rng() * 22), 1, 1, i % 5 ? p[3] : p[5]); break;
      case 'neon':                                                   // 龙门：竖向霓虹
        for (i = 0; i < 9; i++) { x = 6 + Math.floor(rng() * 148); vl(x, 4 + Math.floor(rng() * 10), 22 + Math.floor(rng() * 10), i % 3 ? p[3] : p[4]); }
        for (i = 0; i < 20; i++) px(Math.floor(rng() * W), 2 + Math.floor(rng() * 26), 1, 1, p[5]); break;
      case 'dusk':                                                   // 黄昏地平辉光
        px(0, HZ - 6, W, 7, p[3]); px(0, HZ - 9, W, 3, p[4]);
        for (i = 0; i < 12; i++) { x = Math.floor(rng() * W); hl(x, x + 6 + Math.floor(rng() * 14), 4 + Math.floor(rng() * 14), p[4]); } break;
      case 'soot': case 'smoke': case 'ash': case 'dust':            // 烟尘 / 灰烬 / 沙尘
        dither(14, HZ, p[0], 4, 1);
        if (pr.feat === 'dust') dither(22, HZ, p[2], 5, 0); break;
      case 'shafts':                                                 // 阿戈尔：自上而下的光柱
        for (i = 0; i < 5; i++) { x = 12 + i * 32 + Math.floor(rng() * 8); for (y = 0; y < 32; y++) px(x + Math.round(y * 0.35), y, 2 - (y % 2), 1, i % 2 ? p[3] : p[2]); } break;
      case 'festival':                                               // 汐斯塔：节庆灯串
        for (i = 0; i < 2; i++) for (x = 8; x < 152; x++) {
          yy = 12 + i * 9 + Math.round(Math.sin(x / 21 + i) * 3);
          if (x % 5 === 0) px(x, yy, 2, 2, x % 10 ? p[5] : p[3]); else if (x % 2 === 0) px(x, yy, 1, 1, p[4]);
        } break;
      case 'lamp':                                                   // 杜林：洞顶琥珀灯
        for (i = 0; i < 7; i++) {
          x = 10 + i * 22 + Math.floor(rng() * 6); y = 5 + Math.floor(rng() * 8);
          disc(x, y, 2, p[3]); px(x, y - 1, 1, 1, p[5]);
          for (t = 0; t < 6; t++) px(x - 1 + (t % 3), y + 2 + t, 1, 1, p[2]);
        } break;
      default: break;
    }
  }

  function far(pr, rng, k) {   /* 2 远景剪影（后浅前深两层）+ 3 远景平原带 */
    var p = pr.pal, pass, f, h, x;
    for (pass = 0; pass < 2; pass++) {
      f = farField(pr.far, rng, pass ? k * 0.62 : k * 1.15); h = f.h;
      for (x = 0; x < W; x++) { if (f.hang) px(x, 0, 1, h[x] + 1, pass ? p[0] : p[1]); else px(x, HZ - h[x], 1, h[x] + 1, pass ? p[0] : p[1]); }
      if (f.cap && !pass) for (x = 0; x < W; x++) if (h[x] > 16) px(x, HZ - h[x], 1, h[x] > 22 ? 3 : 2, p[5]);   // 雪线：峰顶覆白
      if (f.win && !pass) for (x = 0; x < W; x += 3) if (h[x] > 3 && (x * 5) % 7 < 4) px(x, HZ - h[x] + 2 + ((x * 3) % 5), 1, 1, p[3]);      // 楼群灯火
      if (f.wave && !pass) for (x = 2; x < W; x += 7) hl(x, x + 2 + (x % 3), HZ + 1 + (x % 4), p[2]);                                      // 碎浪
    }
  }
  function plain(pr, rng, k) {
    var p = pr.pal, sea = (pr.far === 'ocean' || pr.far === 'coralwall'), i, x;
    px(0, HZ, W, GL - HZ, sea ? p[0] : p[1]);
    if (sea) for (i = 0; i < 22; i++) { x = Math.floor(rng() * W); hl(x, x + 3 + Math.floor(rng() * 9), HZ + 2 + Math.floor(rng() * 9), p[2]); }
    for (i = 0, x = 34 + Math.round(k * 22); i < x; i++) px(Math.floor(rng() * W), HZ + 2 + Math.floor(rng() * (GL - HZ - 3)), 1 + Math.floor(rng() * 4), 1, rng() < 0.55 ? p[2] : p[0]);
  }

  function mid(pr, rng, k) {   /* 4 中景标志物剪影（基线 GY） */
    var p = pr.pal, m = pr.mid, i, x, y, w, h, b = GY, t;
    switch (m) {
      case 'pagoda': px(68, b - 28, 5, 28, p[0]);                    // 炎：三重檐宝塔
        for (i = 0; i < 4; i++) { y = b - 4 - i * 7; px(64 - i, y, 13 + i * 2, 2, p[2]); px(65 - i, y - 1, 3 + i, 1, p[4]); }
        px(70, b - 34, 2, 6, p[3]); disc(70, b - 36, 2, p[4]); break;
      case 'megacity':                                               // 龙门：高密度巨构 + 支撑柱
        for (i = 0; i < 6; i++) {
          x = 40 + i * 15; h = 16 + ((i * 7) % 13) + Math.round(k * 6) % 9;
          px(x, b - h, 9, h, p[0]); px(x, b - h, 9, 1, p[3]);
          for (y = b - h + 3; y < b - 2; y += 4) px(x + 2 + (y % 3), y, 2, 1, p[3]);
          vl(x + 4, b - h - 6, b - h, p[1]);
        }
        px(0, b - 3, W, 1, p[1]); for (i = 0; i < 5; i++) vl(30 + i * 22, b - 3, b + 3, p[1]); break;
      case 'dome':                                                   // 萨尔贡：穹顶宫殿
        disc(62, b - 13, 6, p[1]); disc(98, b - 13, 6, p[1]); px(52, b - 13, 56, 13, p[0]);
        disc(80, b - 15, 14, p[2]); disc(77, b - 18, 10, p[3]); disc(80, b - 15, 12, p[2]);
        vl(80, b - 33, b - 28, p[3]); disc(80, b - 34, 2, p[4]);
        px(72, b - 9, 5, 9, p[0]); px(84, b - 9, 5, 9, p[0]); break;
      case 'factory':                                                // 乌萨斯：重工厂房 + 烟囱
        px(34, b - 12, 46, 12, p[0]); px(38, b - 18, 16, 6, p[1]);
        for (i = 0; i < 5; i++) roof(36 + i * 9, b - 12, 8, 3, p[1]);
        for (i = 0; i < 3; i++) { x = 86 + i * 11; h = 20 + ((i * 5) % 6); px(x, b - h, 4, h, p[0]); px(x - 1, b - h - 2, 6, 2, p[4]); smoke(x + 1, b - h - 4, 6 + i, p[1]); }
        for (y = b - 10; y < b - 2; y += 4) for (i = 0; i < 7; i++) px(37 + i * 6, y, 3, 2, p[3]); break;
      case 'tent':                                                   // 萨米：部落帐篷
        for (i = 0; i < 3; i++) {
          x = 46 + i * 26; h = 13 - i * 2;
          for (y = 0; y < h; y++) px(x + Math.floor(y * 0.6), b - y, 17 - Math.floor(y * 1.2), 1, y > h - 3 ? p[2] : p[0]);
          vl(x + 8, b - h - 5, b - h, p[1]); px(x + 7, b - h - 6, 3, 1, i % 2 ? p[4] : p[5]);
        } break;
      case 'derrick': px(60, b - 5, 20, 5, p[1]);                    // 谢拉格：矿井井架
        for (i = 0; i < 28; i++) {
          w = 14 - Math.floor(i * 0.45);
          px(70 - Math.floor(w / 2), b - 5 - i, 1, 1, p[0]); px(70 + Math.floor(w / 2), b - 5 - i, 1, 1, p[0]);
          if (i % 4 === 0) px(70 - Math.floor(w / 2), b - 6 - i, w, 1, p[1]);
        }
        disc(70, b - 30, 4, p[1]); disc(70, b - 30, 1, p[3]); vl(70, b - 36, b - 34, p[3]); break;
      case 'bricks':                                                 // 维多利亚：联排砖房 + 齿轮塔
        for (i = 0; i < 5; i++) {
          x = 26 + i * 13; h = 10 + (i % 3) * 4;
          px(x, b - h, 12, h, p[1]); roof(x, b - h, 12, 3, p[4]);
          for (y = b - h + 3; y < b - 2; y += 4) { px(x + 2, y, 2, 2, p[3]); px(x + 8, y, 2, 2, p[3]); }
        }
        px(104, b - 26, 6, 26, p[0]); ring(107, b - 30, 8, 2, p[1]); ring(107, b - 30, 3, 1, p[2]); smoke(110, b - 28, 7, p[1]); break;
      case 'spires':                                                 // 莱塔尼亚：尖塔与拱廊
        for (i = 0; i < 4; i++) {
          x = 42 + i * 21; h = 22 - (i % 2) * 7;
          px(x, b - h, 6, h, p[1]); roof(x, b - h, 6, 6, p[1]);
          vl(x + 2, b - h - 12, b - h - 7, p[3]); disc(x + 2, b - h - 13, 2, p[4]);
          for (y = b - h + 4; y < b; y += 5) px(x + 2, y, 2, 3, p[3]);
        } break;
      case 'arena':                                                  // 卡西米尔：大竞技场环
        ell(80, b - 9, 42, 11, p[1]); ell(80, b - 9, 35, 8, p[0]);
        for (i = 0; i < 9; i++) { px(40 + i * 10, b - 22, 3, 9, p[1]); px(40 + i * 10, b - 22, 3, 2, i % 2 ? p[4] : p[5]); }
        vl(30, b - 30, b, p[1]); vl(130, b - 30, b, p[1]); px(26, b - 30, 8, 5, p[4]); px(126, b - 30, 8, 5, p[4]); break;
      case 'torii':                                                  // 东国：鸟居
        px(56, b - 24, 3, 24, p[4]); px(101, b - 24, 3, 24, p[4]);
        px(48, b - 27, 64, 3, p[0]); px(50, b - 26, 60, 1, p[4]); px(52, b - 20, 56, 2, p[4]);
        px(44, b - 24, 4, 24, p[0]); px(112, b - 24, 4, 24, p[0]); break;
      case 'mast': px(70, b - 3, 16, 3, p[1]);                       // 哥伦比亚：无线电桅杆
        for (i = 0; i < 32; i++) {
          w = 11 - Math.floor(i * 0.24);
          px(78 - Math.floor(w / 2), b - 3 - i, 1, 1, p[0]); px(78 + Math.floor(w / 2), b - 3 - i, 1, 1, p[0]);
          if (i % 5 === 0) px(78 - Math.floor(w / 2), b - 4 - i, w, 1, p[1]);
        }
        vl(78, b - 40, b - 35, p[0]); px(76, b - 41, 5, 2, p[4]);
        hl(56, 70, b - 1, p[1]); hl(86, 100, b - 1, p[1]);
        px(24, b - 9, 18, 9, p[0]); roof(24, b - 9, 18, 4, p[1]); px(30, b - 6, 3, 3, p[3]); break;
      case 'watchtower':                                             // 玻利瓦尔：木质瞭望塔
        px(64, b - 30, 15, 6, p[0]); px(66, b - 32, 11, 2, p[1]);
        vl(67, b - 24, b, p[0]); vl(76, b - 24, b, p[0]);
        for (i = 0; i < 5; i++) px(67, b - 24 + i * 5, 10, 1, p[1]);
        px(68, b - 29, 2, 2, p[3]); px(74, b - 29, 2, 2, p[3]);
        vl(72, b - 39, b - 32, p[0]); px(71, b - 40, 3, 1, p[4]); break;
      case 'cathedral':                                              // 伊比利亚：主教座堂
        px(64, b - 22, 32, 22, p[1]); roof(64, b - 22, 32, 7, p[0]);
        px(56, b - 34, 8, 34, p[0]); px(96, b - 34, 8, 34, p[0]); roof(56, b - 34, 8, 4, p[0]); roof(96, b - 34, 8, 4, p[0]);
        disc(80, b - 27, 5, p[3]); disc(80, b - 27, 2, p[4]); px(77, b - 11, 6, 11, p[0]);
        vl(60, b - 42, b - 34, p[3]); vl(100, b - 42, b - 34, p[3]); hl(57, 63, b - 39, p[3]); hl(97, 103, b - 39, p[3]); break;
      case 'clocktower':                                             // 拉特兰：钟塔 + 光环
        px(72, b - 34, 16, 34, p[2]); px(72, b - 34, 3, 34, p[3]); roof(70, b - 34, 20, 9, p[1]);
        disc(80, b - 27, 5, p[5]); disc(80, b - 27, 4, p[3]); vl(80, b - 30, b - 27, p[0]); hl(80, 83, b - 27, p[0]);
        ring(80, b - 37, 4, 1, p[4]); px(76, b - 9, 8, 9, p[1]); px(75, b - 6, 10, 6, p[3]); break;
      case 'colonnade':                                              // 米诺斯：柱廊与雕像
        px(40, b - 4, 80, 4, p[3]); roof(38, b - 20, 84, 5, p[3]); px(40, b - 20, 80, 5, p[2]);
        for (i = 0; i < 8; i++) { px(46 + i * 10, b - 16, 4, 12, p[3]); vl(46 + i * 10, b - 16, b - 5, p[1]); }
        px(74, b - 30, 12, 6, p[3]); person(79, b - 30, 'adult', 'M', p, rng); break;
      case 'estate':                                                 // 叙拉古：家族宅邸 + 晾衣绳
        px(42, b - 24, 76, 24, p[0]); px(42, b - 24, 76, 2, p[4]);
        for (i = 0; i < 5; i++) for (y = 0; y < 3; y++) px(48 + i * 14, b - 19 + y * 6, 5, 3, p[3]);
        px(74, b - 9, 12, 9, p[1]); px(76, b - 6, 8, 6, p[3]);
        hl(46, 78, b - 27, p[1]); hl(86, 114, b - 30, p[1]);
        for (i = 0; i < 4; i++) px(50 + i * 8, b - 26, 2, 3, p[2]);
        for (i = 0; i < 3; i++) px(90 + i * 8, b - 29, 2, 3, p[4]); break;
      case 'headframe':                                              // 雷姆必拓：矿井井架 + 矿车
        for (i = 0; i < 30; i++) {
          px(72 - Math.floor(i * 0.32), b - i, 2, 1, p[0]); px(88 + Math.floor(i * 0.32), b - i, 2, 1, p[0]);
          if (i % 5 === 0) px(72 - Math.floor(i * 0.32), b - i, 16 + Math.floor(i * 0.64), 1, p[1]);
        }
        disc(80, b - 32, 6, p[1]); disc(80, b - 32, 2, p[3]); hl(52, 108, b - 1, p[1]);
        px(24, b - 9, 18, 9, p[0]); px(26, b - 11, 14, 3, p[5]); px(28, b - 12, 10, 2, p[0]); break;
      case 'ruintower':                                              // 卡兹戴尔：折断的高塔
        for (i = 0; i < 4; i++) {
          x = 40 + i * 22; h = 14 + ((i * 11) % 18);
          px(x, b - h, 12, h, p[1]);
          for (y = 0; y < h; y += 3) px(x, b - 1 - y, 12, 1, p[0]);
          for (w = x; w < x + 12; w++) if ((w * 7 + i) % 5 < 2) px(w, b - h - 1 - ((w * 3) % 3), 1, 3, p[1]);
          if (i % 2 === 0) px(x + 4, b - h - 7, 4, 7, p[0]);
        }
        for (i = 0; i < 13; i++) px(16 + i * 10, b - 3 - ((i * 3) % 5), 3, 1 + (i % 3), p[0]); break;
      case 'palm':                                                   // 汐斯塔：棕榈剪影
        for (i = 0; i < 3; i++) {
          x = 34 + i * 42; h = 18 + (i % 2) * 7; t = i - 1;
          for (y = 0; y < h; y++) px(x + Math.round(t * y * 0.12), b - y, 2, 1, p[0]);
          w = x + Math.round(t * h * 0.12);
          px(w - 4, b - h - 3, 9, 4, p[0]);                          // 树冠
          px(w - 8, b - h, 4, 1, p[0]); px(w + 5, b - h, 4, 1, p[0]);
          px(w - 7, b - h + 1, 3, 1, p[0]); px(w + 5, b - h + 1, 3, 1, p[0]);
          px(w - 2, b - h - 4, 5, 2, p[0]);
        } break;
      case 'coral':                                                  // 阿戈尔：珊瑚尖塔
        for (i = 0; i < 7; i++) {
          x = 26 + i * 17; h = 12 + ((i * 9) % 20);
          for (y = 0; y < h; y++) px(x + Math.round(Math.sin(y / 6) * 2), b - y, 2 + (y % 2), 1, i % 2 ? p[2] : p[1]);
          disc(x, b - h, 2, i % 2 ? p[3] : p[2]);
          if (i % 3 === 0) { hl(x - 7, x - 1, b - h + 4, p[2]); hl(x + 1, x + 7, b - h + 7, p[2]); }
        } break;
      case 'machine':                                                // 杜林：黄铜机械 + 灯
        px(44, b - 20, 72, 20, p[1]); px(44, b - 20, 72, 3, p[3]);
        for (i = 0; i < 4; i++) { ring(56 + i * 18, b - 12, 7, 2, p[2]); disc(56 + i * 18, b - 12, 1, p[3]); }
        for (i = 0; i < 3; i++) { px(50 + i * 26, b - 27, 4, 7, p[0]); smoke(51 + i * 26, b - 29, 4, p[2]); }
        hl(38, 122, b - 3, p[2]); for (i = 0; i < 8; i++) px(42 + i * 11, b - 6, 4, 3, p[4]); break;
      default:                                                       // 未知国家：中性低层建筑
        for (i = 0; i < 5; i++) {
          x = 30 + i * 19; h = 10 + ((i * 7) % 12);
          px(x, b - h, 14, h, p[1]); px(x - 1, b - h - 2, 16, 2, p[0]);
          for (y = b - h + 3; y < b - 2; y += 4) px(x + 3, y, 2, 2, p[3]);
        }
    }
  }
  function midExtra(pr, rng, str) {   /* 地层调制：核心圈灯火更密、工业带加烟囱、荒原只剩碎石 */
    var p = pr.pal, i, x, h;
    if (str === 'core') { for (i = 0; i < 24; i++) px(16 + Math.floor(rng() * 128), 12 + Math.floor(rng() * 26), 1, 1, p[3]); for (i = 0; i < 8; i++) { x = 20 + Math.floor(rng() * 120); vl(x, GY - 6, GY - 2, p[3]); } }
    else if (str === 'industrial') {
      for (i = 0; i < 2; i++) { x = 116 + i * 13; h = 17 + i * 5; px(x, GY - h, 5, h, p[0]); px(x - 1, GY - h - 2, 7, 2, p[4]); smoke(x + 1, GY - h - 4, 7 + i, p[1]); }
      dither(GY - 12, GY, p[0], 5, 3);
    } else if (str === 'wild') { for (i = 0; i < 20; i++) px(4 + Math.floor(rng() * 152), GY + 1 + Math.floor(rng() * 5), 1 + (i % 2), 1, p[0]); }
  }

  function ground(pr, rng, k, str) {   /* 5 地面（亮面 / 主色 / 暗面 + 纹理行） */
    var p = pr.pal, i, x, y;
    px(0, GL, W, 2, p[2]); px(0, GL + 2, W, 4, pr.gnd); px(0, GL + 6, W, H - GL - 6, p[0]);
    for (i = 0; i < 34 + Math.round(k * 22); i++) {
      x = Math.floor(rng() * W); y = GL + 1 + Math.floor(rng() * 5);
      px(x, y, 1 + Math.floor(rng() * 4), 1, rng() < 0.6 ? p[1] : (str === 'core' ? p[3] : p[2])); }
  }

  function dwell(t, x, b, p, rng) {   /* 6 前景：小屋 / 小人 / 杂物 */
    var w = 13 + Math.floor(rng() * 5), h = 7 + Math.floor(rng() * 4), i;
    if (t === 'tent') { for (i = 0; i < 10; i++) px(x + Math.floor(i * 0.55), b - i, 14 - Math.floor(i * 1.1), 1, i > 7 ? p[2] : p[0]); px(x + 5, b - 3, 3, 3, p[1]); px(x + 6, b - 11, 2, 2, p[4]); return; }
    if (t === 'wreck') { px(x, b - 9, 18, 1, p[1]); for (i = 0; i < 5; i++) vl(x + 1 + i * 4, b - 9, b - 1, p[0]); px(x + 2, b - 7, 6, 7, p[1]); px(x + 11, b - 5, 5, 5, p[0]); px(x + 3, b - 6, 2, 2, p[3]); return; }
    px(x, b - h, w, h, p[0]); px(x + 1, b - h + 1, w - 2, 1, p[1]);
    if (t === 'shack') {                                             // 铁皮棚：波纹顶 + 烟囱
      px(x - 1, b - h - 1, w + 2, 2, p[1]);
      for (i = 0; i < 5; i++) px(x + 1 + i * 3, b - h - 1, 1, 2, p[3]);
      if (rng() < 0.5) { px(x + w, b - h - 7, 3, 7, p[1]); smoke(x + w + 1, b - h - 9, 5, p[1]); }
    } else { roof(x - 1, b - h, w + 2, 4, p[2]); px(x + Math.floor(w / 2) - 1, b - h - 5, 2, 2, p[4]); }
    px(x + 2, b - h + 3, 3, 3, p[3]); px(x + w - 6, b - h + 3, 3, 3, p[1]); px(x + Math.floor(w / 2), b - 5, 3, 5, p[1]);
  }
  function person(x, f, stage, sex, p, rng) {                        // 5-8px 小人：头（带描边）/ 躯干 / 腿
    var hh = ({ baby: 3, child: 5, youth: 6, adult: 8, elder: 7 })[stage] || 8;
    var hair = sex === 'F' ? p[4] : p[1];
    var cloth = LIT ? (sex === 'F' ? p[1] : p[0]) : (sex === 'F' ? p[4] : p[3]);
    var leg = LIT ? p[0] : p[2];
    var up = stage === 'elder' ? 1 : 0, top = f - hh;
    px(x - 1, top - 1, 4, 4, RIM);                                   // 头部 1px 描边：远看先认头
    px(x - 1, f, 4, 1, LIT ? p[1] : p[0]);                           // 脚下阴影：钉在地面上
    px(x + up, top, 2, 2, hair); px(x + up, top, 1, 1, p[5]);
    px(x, top + 2, 2, Math.max(1, hh - 4), cloth);
    if (hh >= 5) { px(x, f - 2, 1, 2, leg); px(x + 1, f - 2, 1, 2, leg); } else px(x, f - 1, 2, 1, leg);
    if (hh >= 6) { px(x - 1, top + 3, 1, 2, cloth); px(x + 2, top + 3, 1, 2, cloth); }   // 手臂：避免头宽身窄的瓶形
    if (sex === 'F' && hh >= 5) px(x - 1, f - 3, 4, 1, cloth);       // 女：1px 衣摆
    else if (hh >= 5) px(x - 1, top + 2, 1, 2, cloth);               // 男：1px 肩线
    if (stage === 'elder') vl(x + 2, f - 4, f - 1, p[3]);            // 长者：微驼 + 手杖
  }
  function junk(x, b, n, p, rng) {
    for (var i = 0; i < n; i++) {
      var w = 3 + Math.floor(rng() * 4), h = 2 + Math.floor(rng() * 4);
      px(x + Math.floor(rng() * 24), b - h, w, h, rng() < 0.5 ? p[1] : p[0]);
      if (rng() < 0.3) px(x + Math.floor(rng() * 24), b - h - 1, 1, 1, p[3]); }
  }
  function fg(pr, rng, k, o) {
    var p = pr.pal, i, x, y, n, mainX = 92 + Math.floor(rng() * 8);
    dwell(pr.fg, 10 + Math.floor(rng() * 8), FEET, p, rng);
    if (o.str === 'core' || o.str === 'industrial') dwell(o.str === 'industrial' ? 'shack' : 'block', 118 + Math.floor(rng() * 12), FEET, p, rng);
    else if (o.str === 'fringe') junk(114, FEET, 9, p, rng);
    else if (o.raw) junk(120, FEET, 4, p, rng);
    if (o.stage === 'baby') {                                        // 婴儿：被抱着的一小团
      person(mainX - 2, FEET, 'adult', 'F', p, rng);
      px(mainX + 1, FEET - 8, 3, 4, p[2]); px(mainX + 2, FEET - 9, 2, 1, p[5]);
    } else person(mainX, FEET, o.stage, o.sex, p, rng);
    n = o.str === 'wild' ? 0 : (o.str === 'fringe' ? 1 : 2);         // 同伴
    for (i = 0; i < n; i++) {
      x = 24 + Math.floor(rng() * 116);
      if (x > mainX - 12 && x < mainX + 8) x = mainX - 20 - i * 8;
      person(x, FEET + (rng() < 0.5 ? 1 : 0), rng() < 0.3 ? 'child' : (rng() < 0.2 ? 'elder' : 'adult'), rng() < 0.5 ? 'M' : 'F', p, rng);
    }
    n = 14 + Math.round((o.str === 'wild' ? 26 : o.str === 'fringe' ? 20 : 10) + k * 8);
    for (i = 0; i < n; i++) {                                        // 草簇 / 碎石 / 雪堆 / 木箱
      x = Math.floor(rng() * W); y = GL + 1 + Math.floor(rng() * (H - GL - 2));
      px(x, y, 1 + Math.floor(rng() * 3), 1, rng() < 0.5 ? p[1] : p[2]);
      if (rng() < 0.25) px(x, y - 1 - (i % 2), 1, 1 + (i % 2), p[0]);
      if (rng() < 0.12) px(x, y - 3, 3, 3, p[1]);
    }
    return mainX;
  }

  function cat(rng) {   /* 7 叠加层：天灾霾 / 矿石病晶簇 */
    var i, t, len, sx, sy;
    dither(22, 42, '#5f6a22', 5, 1); dither(26, 40, '#9aa83c', 4, 0);
    for (i = 0; i < 7; i++) {                                        // 斜向风纹
      sx = Math.floor(rng() * W); sy = 16 + Math.floor(rng() * 22); len = 8 + Math.floor(rng() * 14);
      for (t = 0; t < len; t++) px(sx + t, sy + Math.floor(t * 0.6), 2, 1, i % 2 ? '#8a9a34' : '#c0cc5a');
    }
  }
  function ori(rng, mx) {
    var n = 3 + Math.floor(rng() * 3), i, x, y, s;
    for (i = 0; i < n; i++) {
      x = mx - 26 + Math.floor(rng() * 52); y = FEET - Math.floor(rng() * 3); s = 2 + Math.floor(rng() * 2);
      px(x, y - s - 1, 1, 1, '#3a2450'); px(x - 1, y - s, 3, s + 1, '#1a0f22');
      px(x, y - s, 1, 1, '#8a5ac8'); px(x - 2, y, 5, 1, '#120a18');
    }
  }

  TL.PIXEL_W = W; TL.PIXEL_H = H;   /* 入口 */
  TL.drawScene = function (canvas, opts) {
    if (!canvas || typeof canvas.getContext !== 'function') return;
    opts = opts || {};
    var nation = typeof opts.nation === 'string' ? opts.nation.toUpperCase() : '';
    var pr = PROF[nation] || NEUTRAL;
    var str = ['core', 'industrial', 'fringe', 'wild'].indexOf(opts.stratum) >= 0 ? opts.stratum : 'core';
    var stage = ['baby', 'child', 'youth', 'adult', 'elder'].indexOf(opts.stage) >= 0 ? opts.stage : 'adult';
    var sex = opts.sex === 'F' ? 'F' : 'M';
    var seed = (typeof opts.seed === 'number' && isFinite(opts.seed)) ? (opts.seed >>> 0) : hash(nation + '|' + str + '|' + stage + '|' + sex);
    var rng = mkb(seed), g, mx;
    var k = str === 'core' ? 1.28 : str === 'industrial' ? 1.1 : str === 'fringe' ? 0.86 : 0.72;

    canvas.width = W; canvas.height = H;
    if (canvas.style) canvas.style.imageRendering = 'pixelated';
    try { g = canvas.getContext('2d'); } catch (e) { g = null; }
    if (!g) return;
    C = g; g.imageSmoothingEnabled = false;
    LIT = lum(pr.gnd) > 130; RIM = LIT ? pr.pal[0] : pr.pal[3];     // 亮地面用暗剪影，暗地面用亮描边

    sky(pr, rng, str);                                               // 天空 + 天际特效
    far(pr, rng, k);                                                 // 远景剪影
    plain(pr, rng, k);                                               // 远景平原带
    mid(pr, rng, k); midExtra(pr, rng, str);                         // 中景标志物 + 地层调制
    ground(pr, rng, k, str);                                         // 地面
    mx = fg(pr, rng, k, { str: str, stage: stage, sex: sex, raw: nation === 'KDZ' || nation === 'SRG' || nation === 'RMB' });
    if (opts.cat) cat(rng);                                          // 天灾霾
    if (opts.ori) ori(rng, mx);                                      // 矿石病晶簇
    C = null;
  };
})(window.TL = window.TL || {});
