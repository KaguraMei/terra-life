/* ==========================================================================
 * TERRA LIFE SIM — 界面渲染
 * --------------------------------------------------------------------------
 * 对应原作把 S 状态投影到 DOM 的那一层。
 * 原则：渲染函数只读状态、不改状态（除 UI 局部状态），便于自动模式与回放。
 *
 * 【版式】严格对齐原作《80億分之1》的三栏结构，不再自由发挥：
 *   左栏 = 身份记录 / 状态 / 财产
 *   中栏 = 像素场景 / 今年的重心 / 人生记录（最新在前）
 *   右栏 = 家人与生活 / 在同一秒出生的人们 / 人生地图 / 存活曲线
 * ========================================================================== */
(function (TL) {
  'use strict';

  const $ = id => document.getElementById(id);
  TL.$ = $;

  const UI = TL.UI = {
    focus: null,          // 当前选中的年度重心（未结算）
    lastLogLen: 0,
    lastAge: -1,
    auto: false,
    sceneSig: '',         // 像素场景的绘制签名，只有它变了才重画
    avatarSig: ''
  };

  /* ---------------------------------------------------------------------- */
  /* 小工具                                                                  */
  /* ---------------------------------------------------------------------- */
  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /** 生命阶段 → pixelart 的 stage 取值 */
  function pixStage(S) {
    const a = S.age;
    if (a < 3) return 'baby';
    if (a < 14) return 'child';
    if (a < 26) return 'youth';
    if (a < 58) return 'adult';
    return 'elder';
  }

  /**
   * 王庭 id → 当前语言下的显示名。
   * S.courtName 是开局时按中文写死的，界面语言可以中途切换，
   * 所以这里按 id 回表里取一次（无王庭 / 未知 id 返回 ''）。
   */
  function courtLabel(S) {
    if (!S.court || S.court === 'none') return '';
    for (let i = 0; i < TL.SARKAZ_COURTS.length; i++) {
      if (TL.SARKAZ_COURTS[i].id === S.court) return TL.nameOf(TL.SARKAZ_COURTS[i]);
    }
    return S.courtName || '';
  }

  /** 四维 → 颜色（用于人生地图 / 曲线） */
  const C = {
    hl: '#5f8a3c', h: '#c07a22', sm: '#3f6d94', so: '#b0566f', ori: '#7a4f8c'
  };

  /** 0..1 在两个 hex 之间插值 */
  function mixHex(a, b, t) {
    t = TL.clamp(t, 0, 1);
    const pa = [1, 3, 5].map(i => parseInt(a.substr(i, 2), 16));
    const pb = [1, 3, 5].map(i => parseInt(b.substr(i, 2), 16));
    let s = '#';
    for (let i = 0; i < 3; i++) {
      const v = Math.round(pa[i] + (pb[i] - pa[i]) * t);
      s += (v < 16 ? '0' : '') + v.toString(16);
    }
    return s;
  }

  /* ---------------------------------------------------------------------- */
  /* 顶栏                                                                    */
  /* ---------------------------------------------------------------------- */
  TL.renderTop = function (S) {
    if (!S) return;
    const n = TL.NATION_BY_ID[S.nation];

    $('brandSub').textContent = S.report ? TL.t('reportTitle') : TL.locale.name;

    $('ageBig').textContent = S.report ? Math.round(S.age) : Math.floor(S.age);
    $('ageUnit').textContent = TL.t('ageWord') || '岁';

    $('metaL1').textContent = TL.L`${S.year}${TL.t('yearWord')} · ${S.fullName} · ${TL.jobLabel(S.job)}`;
    const sec = Math.max(0.1, S.yearSec);
    $('metaL2').textContent = TL.L`${TL.nameOf(n)} · ${TL.nameOf(TL.stratum(S.stratum))} · ${TL.t('oneYear', { n: sec.toFixed(1) })}`;

    $('progBar').style.width = (TL.clamp(S.t, 0, 1) * 100).toFixed(1) + '%';

    // 速度按钮
    const sp = S.paused ? 0 : S.speed;
    Array.prototype.forEach.call(document.querySelectorAll('#speeds .spd'), el => {
      el.classList.toggle('on', +el.dataset.s === sp);
    });
    $('autoBtn').classList.toggle('on', UI.auto);
  };

  /* ---------------------------------------------------------------------- */
  /* 左栏 ①：身份记录                                                        */
  /* ---------------------------------------------------------------------- */
  TL.renderIdentity = function (S) {
    const n = TL.NATION_BY_ID[S.nation];
    const r = TL.RACE_BY_ID[S.race];
    const court = courtLabel(S);          // 王庭名（按当前语言），无王庭时为 ''

    $('idTitle').textContent = TL.t('identity');
    $('idCode').textContent = TL.L`${S.nation} · ${S.sex}${String(S.age).padStart(2, '0')} · ${TL.locale.curCode}`;

    $('idName').textContent = S.fullName;
    $('idSub').textContent = TL.L`${TL.nameOf(n)} · ${S.city}`;

    /* --- 标签 --- */
    const tags = [];
    tags.push(`<span class="tag amber">${esc(TL.nameOf(r))}</span>`);
    if (court) tags.push(`<span class="tag violet">${esc(court)}</span>`);
    tags.push(`<span class="tag">${TL.t(S.sex === 'M' ? 'male' : 'female')}</span>`);
    const ar = TL.artRank(S);
    if (ar >= 1) tags.push(`<span class="tag ${ar >= 3 ? 'amber' : ''}">${TL.t('arts')} ${esc(TL.artRankName(ar))}</span>`);
    if (S.ori && S.ori.stage > 0) {
      tags.push(`<span class="tag red">${TL.t('infected')} ${esc(TL.oriStageName(S.ori.stage))}</span>`);
      if (S.ori.treated) tags.push(`<span class="tag violet">治疗中</span>`);
      if (!S.ori.known) tags.push(`<span class="tag">身份未公开</span>`);
    }
    if (S.opClass) {
      tags.push(`<span class="tag green">${esc(TL.opRankName(S.opRank))} · ${esc(TL.opClassName(S.opClass))}</span>`);
    }
    if (S.refugee) tags.push(`<span class="tag red">流亡</span>`);
    if (S.job === 'slave') tags.push(`<span class="tag red">奴工</span>`);
    $('idTags').innerHTML = tags.join('');

    /* --- 属性表：对应原作的 性別/出生/居住地/宗教/出身家庭/學歷 --- */
    const fam = S.q;                       // 家境分位 0..5
    const famDots = dots(Math.round(TL.clamp(fam, 0, 5)), 5);
    const rows = [
      [TL.t('sex'), TL.t(S.sex === 'M' ? 'male' : 'female')],
      [TL.t('born'), TL.L`${S.bornYear || (S.year - Math.floor(S.age))}${TL.t('yearWord')}`],
      [TL.t('residence'), esc(S.city)],
      [TL.t('nation'), esc(TL.nameOf(n))],
      [TL.t('stratum'), esc(TL.nameOf(TL.stratum(S.stratum)))],
      [TL.t('race'), esc(TL.nameOf(r)) + (court ? ' · ' + esc(court) : '')],
      [TL.t('familyTier'), famDots + ' <span style="color:var(--fg3);font-size:10px">' + fam.toFixed(1) + '/5</span>'],
      [TL.t('edu'), esc(TL.eduName(S.eduLevel))],
      [TL.t('stage'), esc(TL.stageName(TL.stage(S)))]
    ];
    $('idTable').innerHTML = rows.map(
      r2 => `<tr><td class="k">${r2[0]}</td><td class="v">${r2[1]}</td></tr>`
    ).join('');

    /* --- MRZ 条码：把身份编码成一条可读的机读区 --- */
    const seedStr = TL.L`${S.nation}${S.sex}${S.race}${S.stratum}${S.name}`;
    let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = (h * 16777619) >>> 0; }
    const code = ('00000000' + h.toString(16).toUpperCase()).slice(-8);
    $('mrzText').textContent = TL.L`T<${S.nation}${S.stratumCode || ''}<${code}<${S.lifeMax[0]}-${S.lifeMax[1]}`;
    let bars = '';
    for (let i = 0; i < 34; i++) {
      h = (h * 1103515245 + 12345) >>> 0;
      bars += `<i style="height:${4 + (h >>> 24) % 11}px"></i>`;
    }
    $('mrzBars').innerHTML = bars;

    /* --- 头像：确定性像素肖像 --- */
    drawAvatar(S, r);
  };

  function dots(on, total) {
    let s = '<span class="dots">';
    for (let i = 0; i < total; i++) s += `<i class="${i < on ? 'on' : ''}"></i>`;
    return s + '</span>';
  }

  /**
   * 62×62 的头像。用与姓名绑定的确定性哈希当随机源，
   * 同一个人每次渲染长得一样；换人会换脸。
   */
  function drawAvatar(S, r) {
    const cv = $('avatar');
    if (!cv) return;
    const sig = [S.nation, S.race, S.court, S.sex, S.fullName, S.stratum, pixStage(S)].join('|');
    if (sig === UI.avatarSig) return;
    UI.avatarSig = sig;

    const ctx = cv.getContext('2d');
    if (!ctx) return;
    cv.width = 62; cv.height = 62;
    let h = 2166136261;
    for (let i = 0; i < sig.length; i++) { h ^= sig.charCodeAt(i); h = (h * 16777619) >>> 0; }
    const rnd = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };

    const P = t => { ctx.fillStyle = t; };
    const R = (x, y, w, hh, c) => { P(c); ctx.fillRect(x | 0, y | 0, w | 0, hh | 0); };

    const skin = ['#e8c9a4', '#dcb894', '#c9a077', '#a87c56', '#e3d0b8'][(rnd() * 5) | 0];
    const hairC = ['#3a2d21', '#5a4632', '#1f1a14', '#8a6a3a', '#6b4f3a', '#c9c4bd'][(rnd() * 6) | 0];
    const cloth = ['#5a6b7a', '#6b5a4a', '#4a5f52', '#7a5a5a', '#3f4a5a'][(rnd() * 5) | 0];
    // 种族微调：萨卡兹给角，阿戈尔给偏冷的肤色，龙/阿斯兰给更重的发色
    const horn = (S.race === 'sarkaz' || S.race === 'vouivre' || S.race === 'dracaena');
    const cold = (S.race === 'aegir' || S.race === 'anura' || S.race === 'savra');
    const ear = (S.race === 'cautus' || S.race === 'feline' || S.race === 'lupo' || S.race === 'kuranta');

    // 背景
    R(0, 0, 62, 62, '#f4efe4');
    R(0, 44, 62, 18, '#e6ddc9');

    // 肩
    R(9, 47, 44, 15, cloth);
    R(9, 47, 44, 3, mixHex(cloth, '#ffffff', 0.22));

    // 脖子
    R(26, 40, 10, 8, mixHex(skin, '#000000', 0.14));

    // 脸
    R(20, 14, 22, 28, skin);
    R(20, 14, 22, 4, mixHex(skin, '#ffffff', 0.16));
    // 下颌收窄
    R(20, 40, 22, 2, mixHex(skin, '#000000', 0.10));

    // 耳 / 兽耳
    if (ear) {
      R(16, 16, 4, 9, mixHex(hairC, skin, 0.35));
      R(42, 16, 4, 9, mixHex(hairC, skin, 0.35));
    } else {
      R(17, 26, 3, 7, mixHex(skin, '#000000', 0.12));
      R(42, 26, 3, 7, mixHex(skin, '#000000', 0.12));
    }

    // 头发
    const hs = ['#3a2d21', '#5a4632', '#1f1a14'][(rnd() * 3) | 0];
    R(18, 8, 26, 10, hairC);
    R(18, 8, 26, 3, mixHex(hairC, '#ffffff', 0.18));
    R(18, 8, 4, 24, hairC);
    R(40, 8, 4, 24, hairC);
    if (rnd() < 0.5) R(16, 20, 3, 16, hairC);       // 长发
    if (horn) {
      R(18, 2, 4, 7, '#8a6a4a');
      R(40, 2, 4, 7, '#8a6a4a');
      R(18, 1, 4, 2, '#c9b48a');
      R(40, 1, 4, 2, '#c9b48a');
    }

    // 眼睛（脸上唯一的细节，靠这一步决定「像不像人」）
    const eyeY = 26;
    if (S.age < 1 || (S.report && S.age < 3)) {
      // 婴儿：闭眼两条线
      R(23, eyeY + 1, 5, 1, '#3a2d21');
      R(34, eyeY + 1, 5, 1, '#3a2d21');
    } else {
      R(23, eyeY, 5, 3, '#fdfcf8');
      R(34, eyeY, 5, 3, '#fdfcf8');
      R(25, eyeY, 2, 3, '#2b2118');
      R(36, eyeY, 2, 3, '#2b2118');
      if (S.age >= 58) {                            // 老年：眉毛下垂 + 皱纹
        R(22, eyeY - 4, 7, 1, mixHex(hairC, '#ffffff', 0.4));
        R(33, eyeY - 4, 7, 1, mixHex(hairC, '#ffffff', 0.4));
        R(24, eyeY + 4, 6, 1, mixHex(skin, '#000000', 0.16));
        R(33, eyeY + 4, 6, 1, mixHex(skin, '#000000', 0.16));
      }
    }
    // 嘴
    R(27, 34, 8, 1, mixHex(skin, '#000000', 0.34));

    // 结晶：感染者脸侧有源石
    if (S.ori && S.ori.stage > 0) {
      const n = Math.min(4, S.ori.stage + 1);
      for (let i = 0; i < n; i++) {
        R(20 + ((rnd() * 22) | 0), 14 + ((rnd() * 26) | 0), 3, 3, '#a06ac0');
      }
    }
    // 冷色调种族
    if (cold) { ctx.fillStyle = 'rgba(120,160,190,.13)'; ctx.fillRect(0, 0, 62, 62); }

    // 边框
    ctx.fillStyle = '#c4b79b';
    ctx.fillRect(0, 0, 62, 1); ctx.fillRect(0, 61, 62, 1);
    ctx.fillRect(0, 0, 1, 62); ctx.fillRect(61, 0, 1, 62);
  }

  /* ---------------------------------------------------------------------- */
  /* 左栏 ②：状态（0-100 四维 + 技艺）                                        */
  /* ---------------------------------------------------------------------- */
  TL.renderStats = function (S) {
    $('statTitle').textContent = TL.t('status');
    const names = { hl: TL.t('health'), h: TL.t('happy'), sm: TL.t('knowledge'), so: TL.t('social') };
    let html = '';
    for (const k of ['hl', 'h', 'sm', 'so']) {
      const v = Math.round(S.st[k]);
      html += `<div class="statRow">
        <div class="statTop"><span class="k">${names[k]}</span>
          <span class="v ${k}">${v}</span><span class="w">${TL.statWord(k, v)}</span></div>
        <div class="track"><div class="fill ${k}" style="width:${v}%"></div></div>
      </div>`;
    }
    const ar = Math.round(S.arts);
    html += `<div class="statRow" style="margin-top:8px;padding-top:7px;border-top:1px dotted var(--line)">
      <div class="statTop"><span class="k">${TL.t('arts')}</span>
        <span class="v ar">${ar}</span><span class="w">${esc(TL.artRankName(TL.artRank(S)))}</span></div>
      <div class="track"><div class="fill ar" style="width:${ar}%"></div></div>
    </div>`;
    $('statBody').innerHTML = html;
  };

  /* ---------------------------------------------------------------------- */
  /* 左栏 ③：财产                                                            */
  /* ---------------------------------------------------------------------- */
  TL.renderWealth = function (S) {
    $('wealthTitle').textContent = TL.lang === 'zh' ? '财产' : 'Wealth';
    $('nwLabel').textContent = TL.t('netWorth');
    $('incLabel').textContent = TL.t('income');

    const nw = TL.netWorth(S);
    const nwEl = $('nwVal'), inEl = $('incVal');
    nwEl.textContent = TL.moneyStr(nw);
    nwEl.className = 'mv ' + (nw < 0 ? 'neg' : (nw > 0 ? 'pos' : ''));
    inEl.textContent = TL.moneyStr(S.income * 12);
    inEl.className = 'mv';

    const n = TL.NATION_BY_ID[S.nation];
    const rows = [];
    const add = (k, v, cls) => rows.push(
      `<div class="factLine"><span class="fk">${k}</span><span class="fv ${cls || ''}">${v}</span></div>`);

    add(TL.t('job'), esc(TL.jobLabel(S.job)));
    add(TL.lang === 'zh' ? '大陆收入分位' : 'Continental income pct',
        esc(TL.fmt.pct(S.pct, 0)));
    if (S.debt > 0) add(TL.lang === 'zh' ? '负债' : 'Debt', esc(TL.moneyStr(S.debt)), 'neg');
    add(TL.t('livingWithParents'),
        (S.age < 18 || S.flags.atHome) ? `<span style="color:var(--amber)">${TL.t('yes')}</span>` : TL.t('no'));
    if (S.school) add(TL.lang === 'zh' ? '在校' : 'In school', TL.L`还剩 ${S.schoolLeft} 年`);
    if (S.serveLeft > 0) add(TL.lang === 'zh' ? '服役' : 'In service', TL.L`还剩 ${S.serveLeft} 年`);
    if (S.ori && S.ori.stage > 0) {
      add(TL.t('crystalRate'), Math.round(S.ori.crystal) + '%', 'neg');
      add(TL.lang === 'zh' ? '感染年龄' : 'Infected at', S.ori.at + TL.t('ageWord'));
    }
    add(TL.lang === 'zh' ? '年度死亡风险' : 'Annual mortality',
        esc(TL.fmt.pct(S.lastQ || 0, 2)), (S.lastQ || 0) > 0.05 ? 'neg' : '');
    add(TL.lang === 'zh' ? '物价口径' : 'Price basis', esc(TL.priceNote()));

    $('factList').innerHTML = rows.join('');
  };

  /* ---------------------------------------------------------------------- */
  /* 中栏 ①：像素场景                                                        */
  /* ---------------------------------------------------------------------- */
  TL.renderScene = function (S) {
    const cv = $('sceneCanvas');
    if (!cv || !TL.drawScene) return;
    const stage = pixStage(S);
    // 场景随「国家 + 阶层 + 阶段 + 是否天灾 + 是否感染」变化，换年不重画
    const sig = [S.nation, S.stratum, stage, S.sex, S.flags.postCatastrophe ? 1 : 0,
                 S.ori ? Math.min(3, S.ori.stage) : 0, S.sceneSeed || 0].join('|');
    if (sig !== UI.sceneSig) {
      UI.sceneSig = sig;
      TL.drawScene(cv, {
        nation: S.nation, stratum: S.stratum, stage: stage, sex: S.sex,
        seed: S.sceneSeed || 0,
        cat: !!S.flags.postCatastrophe,
        ori: !!(S.ori && S.ori.stage > 0)
      });
    }
    const n = TL.NATION_BY_ID[S.nation];
    const st = TL.stratum(S.stratum);
    $('sceneCap').innerHTML = TL.L`<b>${esc(S.city)}</b> · ${esc(TL.nameOf(n))} · ${esc(TL.shortOf(st))} · ${TL.ageWord(S.age)}`;
  };

  /* ---------------------------------------------------------------------- */
  /* 中栏 ②：今年的重心                                                      */
  /* ---------------------------------------------------------------------- */
  TL.renderFocus = function (S) {
    $('focusTitle').textContent = TL.t('thisYear');
    const opts = TL.focusOptions(S);

    if (!opts.length) {
      $('stageHint').textContent = '';
      $('focusDesc').textContent = TL.lang === 'zh'
        ? '这个年纪还做不了选择。' : 'No choices at this age.';
      $('focusList').innerHTML = '';
      return;
    }

    const stg = TL.stage(S);
    $('stageHint').textContent = TL.stageName(stg);
    $('focusDesc').textContent = TL.t('focusHint');

    if (UI.focus && opts.indexOf(UI.focus) < 0) UI.focus = null;
    if (!UI.focus) UI.focus = TL.autoFocus(S);

    $('focusList').innerHTML = opts.map(id => {
      const F = TL.FOCUS[id];
      const w = S.focusW && S.focusW[id] ? Math.round(S.focusW[id] * 100) : null;
      return `<div class="fopt ${UI.focus === id ? 'sel' : ''}" data-f="${id}">
        <span class="fn">${esc(TL.nameOf(F))}</span><span class="fd">${esc(TL.descOf(F))}</span>
        ${w != null ? `<span class="fw">${w}%</span>` : ''}</div>`;
    }).join('');

    Array.prototype.forEach.call($('focusList').querySelectorAll('.fopt'), el => {
      el.addEventListener('click', () => {
        UI.focus = el.dataset.f;
        if (TL.S) TL.S.focus = UI.focus;
        TL.renderFocus(TL.S);
      });
    });

    if (S) S.focus = UI.focus;
  };

  /* ---------------------------------------------------------------------- */
  /* 中栏 ③：人生记录（最新的在前）                                          */
  /* ---------------------------------------------------------------------- */
  TL.renderFeed = function (S, force) {
    const feed = $('feed');
    const log = S.log;

    // 换了一条命 → 清空重来
    if (force || log.length < UI.lastLogLen) {
      feed.innerHTML = '';
      UI.lastLogLen = 0;
    }
    if (log.length === UI.lastLogLen) return;

    // 原作是「最新的在前」，所以新增的部分要插到最前面；
    // 同一年内的多条要保持阅读顺序，故整批倒序后逐条前插。
    const frag = document.createDocumentFragment();
    for (let i = log.length - 1; i >= UI.lastLogLen; i--) {
      const e = log[i];
      const d = document.createElement('div');
      d.className = 'entry ' + (e.kind || 'ev');
      const ageStr = (TL.lang === 'zh') ? `${Math.floor(e.age)}岁` : `${Math.floor(e.age)}`;
      d.innerHTML = `<span class="age">${ageStr}</span><span class="txt"></span>`;
      d.querySelector('.txt').textContent = e.text;
      if (e.tag) {
        const t = document.createElement('span');
        t.className = 'tagline';
        t.textContent = e.tag;
        d.appendChild(t);
      }
      frag.appendChild(d);
    }
    feed.insertBefore(frag, feed.firstChild);
    UI.lastLogLen = log.length;

    // 只保留最近 400 条 DOM
    while (feed.childElementCount > 400) feed.removeChild(feed.lastChild);
    feed.scrollTop = 0;   // 最新在最上面
  };

  /* ---------------------------------------------------------------------- */
  /* 右栏 ①：家人与生活                                                      */
  /* ---------------------------------------------------------------------- */
  TL.renderFamily = function (S) {
    $('famTitle').textContent = TL.t('familyAndLife');
    const rows = [];
    const add = (role, name, age, job, alive) => rows.push(
      `<div class="famRow ${alive ? '' : 'dead'}">
        <span class="fr">${role}</span>
        <span class="fnm">${esc(name)}${alive ? '' : ' †'}</span>
        <span class="fa">${alive ? age + TL.t('ageWord') + ' · ' + esc(job) : TL.t('deceased')}</span>
      </div>`);

    const f = S.fam;
    if (f.mom) add(TL.t('mother'), f.mom.name, f.mom.age, f.mom.job ? TL.jobLabel(f.mom.job) : '—', f.mom.alive);
    if (f.dad) add(TL.t('father'), f.dad.name, f.dad.age, f.dad.job ? TL.jobLabel(f.dad.job) : '—', f.dad.alive);
    (f.sibs || []).forEach(s => add(TL.t('siblings'), s.name, s.age, s.job ? TL.jobLabel(s.job) : '—', s.alive));
    if (f.partner) add(TL.t('partner'), f.partner.name, f.partner.age,
                       f.partner.job ? TL.jobLabel(f.partner.job) : '—', f.partner.alive !== false);
    (f.kids || []).forEach(k => add(TL.t('children'), k.name, k.age,
                                    k.job ? TL.jobLabel(k.job) : '—', k.alive !== false));

    $('famList').innerHTML = rows.length ? rows.join('')
      : `<div style="color:var(--fg3);font-size:11.5px">${TL.lang === 'zh' ? '独自一人。' : 'Alone.'}</div>`;
  };

  /* ---------------------------------------------------------------------- */
  /* 右栏 ②：在同一秒出生的人们                                              */
  /* ---------------------------------------------------------------------- */
  TL.renderPeers = function (S) {
    $('peerTitle').textContent = TL.t('bornSameSecond');
    if (!S.cohort) { $('peers').innerHTML = ''; $('peerSum').textContent = '—'; return; }

    const age = S.age;
    const unit = TL.t('ageWord');
    $('peers').innerHTML = S.cohort.peers.map(p => {
      const gone = p.deathAt < age;
      return `<div class="peer ${gone ? 'gone' : ''}">
        <span class="pn">${esc(p.fullName)}</span>
        <span class="pd">${gone ? (TL.lang === 'zh' ? '殁于 ' : 'died ') + p.deathAt + unit
                               : (TL.lang === 'zh' ? '在世 ' : 'alive ') + Math.floor(age) + unit}</span>
      </div>`;
    }).join('');

    const alive = TL.cohortAliveAt(S, age);
    const n = Math.round(alive * S.cohort.size);
    $('peerSum').innerHTML = TL.lang === 'zh'
      ? `还活着 <b>${n}</b> / ${S.cohort.size} 人 · <b>${(alive * 100).toFixed(1)}%</b>`
      : `<b>${n}</b> of ${S.cohort.size} still alive · <b>${(alive * 100).toFixed(1)}%</b>`;
  };

  /* ---------------------------------------------------------------------- */
  /* 右栏 ③：人生地图                                                        */
  /* ---------------------------------------------------------------------- */
  TL.renderLifeMap = function (S) {
    $('mapTitle').textContent = TL.t('lifeMap');
    const map = $('lifeMap');
    const ys = S.stats.years;
    const le = Math.round(S.lt.e0);
    const top = Math.max(le + 6, ys.length, 30);

    let html = '';
    for (let x = 0; x < top; x++) {
      const y = ys[x];
      if (!y) { html += '<i class="future"></i>'; continue; }
      // 越深越幸福：h=100 时接近深褐，h=0 时接近底色
      const t = TL.clamp(y.h / 100, 0, 1);
      const bg = mixHex('#f2ece0', '#6b4a1e', Math.pow(t, 0.85));
      const cls = ['ori' in y && y.stage > 0 ? 'ori' : '',
                   x === ys.length - 1 ? 'last' : '',
                   x === le ? 'le' : ''].filter(Boolean).join(' ');
      html += `<i class="${cls}" style="background:${bg}" title="${x}${TL.t('ageWord')} · ${y.h}"></i>`;
    }
    map.innerHTML = html;

    // 图例
    for (let i = 0; i < 5; i++) {
      $('sw' + i).style.background = mixHex('#f2ece0', '#6b4a1e', Math.pow(i / 4, 0.85));
    }
    $('mapLegendTxt').textContent = TL.t('lifeMapHint');
    $('mapHint').textContent = TL.lang === 'zh'
      ? `${ys.length}/${top} 格` : `${ys.length}/${top}`;
  };

  /* ---------------------------------------------------------------------- */
  /* 右栏 ④：存活曲线                                                        */
  /* ---------------------------------------------------------------------- */
  TL.renderSurvival = function (S) {
    $('survTitle').textContent = TL.t('survivalCurve');
    $('survHint').textContent = TL.t('survivalHint');

    const cv = $('survCanvas');
    if (!cv || !S.cohort) return;
    const ctx = cv.getContext('2d');

    /* 画布按 2 倍缓冲绘制，再交给 CSS 缩放 —— 直接在 1 倍尺寸上画，
       刻度字在与格子线同宽时糊成一团。 */
    const cssW = Math.max(220, cv.clientWidth || 260);
    const W = cv.width = Math.round(cssW * 2);
    const H = cv.height = 188;
    const padL = 46, padR = 12, padT = 20, padB = 28;
    const gw = W - padL - padR, gh = H - padT - padB;

    ctx.fillStyle = '#fbf8f1'; ctx.fillRect(0, 0, W, H);

    const curve = S.cohort.curve;
    const maxAge = curve[curve.length - 1].age;
    const X = a => padL + (a / maxAge) * gw;
    const Y = p => padT + (1 - p) * gh;

    /* 横轴步长：最多 5 个刻度，避免数字叠在一起 */
    const rawStep = maxAge / 4;
    const mag = Math.pow(10, Math.floor(Math.log(rawStep) / Math.LN10));
    const step = Math.max(5, Math.ceil(rawStep / mag) * mag);

    ctx.strokeStyle = '#e6ddc9'; ctx.lineWidth = 2;
    for (let p = 0; p <= 1.0001; p += 0.5) {
      const y = Math.round(Y(p)) + 1;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + gw, y); ctx.stroke();
    }
    for (let a = 0; a <= maxAge; a += step) {
      const x = Math.round(X(a)) + 1;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, padT + gh); ctx.stroke();
    }

    ctx.fillStyle = '#8d8371';
    ctx.font = '17px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('100%', padL - 7, Y(1) + 6);
    ctx.fillText('50%', padL - 7, Y(0.5) + 6);
    ctx.fillText('0%', padL - 7, Y(0) + 6);
    ctx.textAlign = 'center';
    for (let a = 0; a <= maxAge; a += step) ctx.fillText(a, X(a), H - 8);

    /* 曲线 */
    ctx.strokeStyle = '#b23a2a'; ctx.lineWidth = 3;
    ctx.beginPath();
    curve.forEach((pt, i) => {
      const x = X(pt.age), y = Y(pt.alive);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineTo(X(maxAge), Y(0)); ctx.lineTo(X(0), Y(0)); ctx.closePath();
    ctx.fillStyle = 'rgba(178,58,42,.10)'; ctx.fill();

    /* 你在这里 */
    const cur = TL.cohortAliveAt(S, S.age);
    const ca = Math.min(S.age, maxAge);
    ctx.strokeStyle = '#c07a22'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(Math.round(X(ca)) + 1, padT); ctx.lineTo(Math.round(X(ca)) + 1, padT + gh); ctx.stroke();
    ctx.fillStyle = '#c07a22';
    ctx.beginPath(); ctx.arc(X(ca), Y(cur), 6, 0, Math.PI * 2); ctx.fill();

    /* 预期寿命竖线 + 标注 */
    const ea = Math.min(S.lt.e0, maxAge);
    const lx = Math.round(X(ea)) + 1;
    ctx.strokeStyle = '#3f6d94'; ctx.lineWidth = 2; ctx.setLineDash([7, 7]);
    ctx.beginPath(); ctx.moveTo(lx, padT); ctx.lineTo(lx, padT + gh); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#3f6d94'; ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('e₀ ' + Math.round(S.lt.e0),
      TL.clamp(lx, padL + 26, W - padR - 26), padT - 5);

    $('survStat').innerHTML = TL.lang === 'zh'
      ? `<span>你 ${Math.floor(S.age)} 岁</span><span>同期群存活 ${(cur * 100).toFixed(1)}%</span><span>预期 ${Math.round(S.lt.e0)} 岁</span>`
      : `<span>you ${Math.floor(S.age)}</span><span>cohort ${(cur * 100).toFixed(1)}%</span><span>e0 ${Math.round(S.lt.e0)}</span>`;
  };

  /* ---------------------------------------------------------------------- */
  /* 抉择弹层                                                                */
  /* ---------------------------------------------------------------------- */
  TL.showDecision = function (S, p) {
    $('modalTitle').textContent = p.title;
    $('modalSub').textContent = TL.L`${Math.floor(S.age)} ${TL.t('ageWord')} · ${TL.nameOf(TL.NATION_BY_ID[S.nation])} · ${TL.jobLabel(S.job)}`;
    $('modalText').textContent = p.text || '';
    $('modalOpts').innerHTML = p.options.map((o, i) =>
      `<div class="opt" data-i="${i}"><span class="ol">${esc(o.label)}</span><span class="oh">${esc(o.hint || '')}</span></div>`
    ).join('');
    Array.prototype.forEach.call($('modalOpts').querySelectorAll('.opt'), el => {
      el.addEventListener('click', () => {
        const i = +el.dataset.i;
        $('modal').hidden = true;
        TL.choose(S, i);
        TL.renderAll(S, true);
      });
    });
    $('modal').hidden = false;
  };

  /* ---------------------------------------------------------------------- */
  /* 全量渲染                                                               */
  /* ---------------------------------------------------------------------- */
  TL.renderAll = function (S, forceFeed) {
    if (!S) return;
    TL.renderTop(S);
    TL.renderIdentity(S);
    TL.renderStats(S);
    TL.renderWealth(S);
    TL.renderScene(S);
    TL.renderFocus(S);
    TL.renderFamily(S);
    TL.renderPeers(S);
    TL.renderLifeMap(S);
    TL.renderSurvival(S);
    TL.renderFeed(S, forceFeed);
  };

  /* ---------------------------------------------------------------------- */
  /* 弧形图（人生曲线）                                                       */
  /* ---------------------------------------------------------------------- */
  function prepCanvas(cv, h) {
    const ctx = cv.getContext('2d');
    const w = Math.max(320, cv.clientWidth || 640);
    cv.width = w; cv.height = h;
    ctx.fillStyle = '#fbf8f1'; ctx.fillRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function lineChart(cv, ys, series, h) {
    const { ctx, w } = prepCanvas(cv, h);
    const padL = 36, padR = 12, padT = 12, padB = 22;
    const gw = w - padL - padR, gh = h - padT - padB;

    ctx.strokeStyle = '#e6ddc9'; ctx.lineWidth = 1;
    for (let p = 0; p <= 4; p++) {
      const y = Math.round(padT + gh * p / 4) + 0.5;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + gw, y); ctx.stroke();
    }
    ctx.fillStyle = '#8d8371'; ctx.font = '13px ui-monospace, monospace';
    ctx.textAlign = 'right';
    for (let p = 0; p <= 4; p++) ctx.fillText(Math.round(100 - p * 25), padL - 5, padT + gh * p / 4 + 4);

    if (!ys.length) return;
    const maxA = Math.max(1, ys[ys.length - 1].age);
    const X = a => padL + (a / maxA) * gw;
    const Y = v => padT + (1 - TL.clamp(v, 0, 100) / 100) * gh;

    ctx.textAlign = 'center';
    for (let a = 0; a <= maxA; a += Math.max(10, Math.round(maxA / 6 / 10) * 10)) {
      ctx.fillText(a, X(a), h - 6);
    }

    series.forEach(s => {
      ctx.strokeStyle = s.c; ctx.lineWidth = s.w || 1.8;
      if (s.dash) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      let started = false;
      ys.forEach(y => {
        const v = s.f(y);
        if (v == null) { started = false; return; }
        const x = X(y.age), yy = Y(v);
        if (!started) { ctx.moveTo(x, yy); started = true; } else ctx.lineTo(x, yy);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 图例
    let lx = padL + 4;
    ctx.textAlign = 'left'; ctx.font = '14px system-ui, sans-serif';
    series.forEach(s => {
      ctx.fillStyle = s.c; ctx.fillRect(lx, padT - 8, 14, 3);
      ctx.fillStyle = '#5a5142'; ctx.fillText(s.n, lx + 18, padT - 3);
      lx += 22 + ctx.measureText(s.n).width;
    });
  }

  TL.drawLifeChart = function (cv, ys) {
    const zh = TL.lang === 'zh';
    lineChart(cv, ys, [
      { n: TL.t('health'), c: C.hl, f: y => y.hl },
      { n: TL.t('happy'), c: C.h, f: y => y.h },
      { n: TL.t('knowledge'), c: C.sm, f: y => y.sm },
      { n: TL.t('social'), c: C.so, f: y => y.so },
      { n: zh ? '结晶率' : 'Crystal', c: C.ori, f: y => (y.stage > 0 ? Math.min(100, y.ori) : null), dash: true }
    ], 176);
  };

  TL.drawWealthChart = function (cv, ys) {
    if (!ys.length) { prepCanvas(cv, 130); return; }
    const { ctx, w } = prepCanvas(cv, 130);
    const padL = 36, padR = 12, padT = 12, padB = 22;
    const gw = w - padL - padR, gh = 130 - padT - padB;

    let lo = 0, hi = 0;
    ys.forEach(y => { lo = Math.min(lo, y.nw); hi = Math.max(hi, y.nw); });
    if (hi === lo) hi = lo + 1;

    const maxA = Math.max(1, ys[ys.length - 1].age);
    const X = a => padL + (a / maxA) * gw;
    const Y = v => padT + (1 - (v - lo) / (hi - lo)) * gh;

    ctx.strokeStyle = '#e6ddc9';
    const zy = Math.round(Y(0)) + 0.5;
    ctx.beginPath(); ctx.moveTo(padL, zy); ctx.lineTo(padL + gw, zy); ctx.stroke();

    ctx.beginPath();
    ys.forEach((y, i) => { const x = X(y.age), yy = Y(y.nw); if (!i) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); });
    ctx.strokeStyle = '#5f8a3c'; ctx.lineWidth = 2; ctx.stroke();
    ctx.lineTo(X(maxA), Y(lo)); ctx.lineTo(X(0), Y(lo)); ctx.closePath();
    ctx.fillStyle = 'rgba(95,138,60,.11)'; ctx.fill();

    ctx.fillStyle = '#8d8371'; ctx.font = '13px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(TL.moneyStr(hi), padL - 5, padT + 8);
    ctx.fillText(TL.moneyStr(lo), padL - 5, padT + gh);
  };

})(window.TL = window.TL || {});
