/* ==========================================================================
 * TERRA LIFE SIM — 主循环
 * --------------------------------------------------------------------------
 * 对应原作的启动、requestAnimationFrame 驱动、暂停/倍速、自动模式、
 * 以及「过去的人生」本地存档。
 * ========================================================================== */
(function (TL) {
  'use strict';

  const $ = TL.$;
  const UI = TL.UI;

  let raf = null, lastTs = 0;
  const STORE_KEY = 'terra-life-saves-v1';

  /* ---------------------------------------------------------------------- */
  /* 开局设置                                                                */
  /* ---------------------------------------------------------------------- */
  const SETUP = {
    bornYear: null,          // ?by=1070 强制出生年份（默认从年表区间抽）
    mode: 'birth',
    nation: '',
    sex: '',
    race: '',
    pace: 'normal',
    seed: null
  };

  function bindChips(containerId, key, allowEmpty) {
    const box = $(containerId);
    box.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const v = chip.dataset.v;
      SETUP[key] = (allowEmpty && SETUP[key] === v) ? '' : v;
      Array.prototype.forEach.call(box.querySelectorAll('.chip'), c =>
        c.classList.toggle('on', c.dataset.v === SETUP[key]));
      if (key === 'mode') { renderOdds(); renderNationChips(); }
      box.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.classList.contains('on'))));
    });
  }

  function renderNationChips() {
    const box = $('nationChips');
    const odds = TL.lotteryOdds(SETUP.mode);
    const pOf = {};
    for (const o of odds) pOf[o.id] = o.p;
    // 按抽中概率排序，让「常见出生地」排在前面
    const sorted = TL.NATIONS.slice().sort((a, b) => (pOf[b.id] || 0) - (pOf[a.id] || 0));
    let html = `<button type="button" class="chip ${SETUP.nation === '' ? 'on' : ''}" aria-pressed="${SETUP.nation === ''}" data-v="">随机<small class="sub">按模型权重抽签</small></button>`;
    for (const n of sorted) {
      if (!pOf[n.id]) continue;
      html += `<button type="button" class="chip ${SETUP.nation === n.id ? 'on' : ''}" aria-pressed="${SETUP.nation === n.id}" data-v="${n.id}">${n.name}<small class="sub">${(pOf[n.id] * 100).toFixed(2)}%</small></button>`;
    }
    box.innerHTML = html;
  }

  function renderRaceChips() {
    const box = $('raceChips');
    let html = `<button type="button" class="chip ${SETUP.race === '' ? 'on' : ''}" aria-pressed="${SETUP.race === ''}" data-v="">随出生地<small class="sub">按当地种族构成</small></button>`;
    // 标签显示「社会处境」与「技艺天赋」——这两样才是泰拉里真正决定命运的东西。
    // 早期只显示技艺等级，结果十几个种族都是同一句「无适应性」，毫无信息量。
    const standWord = r => {
      if (r.stand >= 2) return '统治阶层';
      if (r.stand >= 0.5) return '地位优越';
      if (r.stand >= -0.3) return '不受歧视';
      if (r.stand >= -0.8) return '边缘';
      if (r.stand >= -1.5) return '受排斥';
      return '系统性迫害';
    };
    const sorted = TL.RACES.slice().sort((a, b) => b.stand - a.stand);
    for (const r of sorted) {
      const sub = (r.mod.art || 0) >= 4 ? '技艺天赋高' : standWord(r);
      html += `<button type="button" class="chip ${SETUP.race === r.id ? 'on' : ''}" aria-pressed="${SETUP.race === r.id}" data-v="${r.id}" title="${r.desc.replace(/"/g, '')}">${r.name}<small class="sub">${sub}</small></button>`;
    }
    box.innerHTML = html;
  }

  function renderOdds() {
    TL.renderLandingOdds(SETUP.mode);
  }

  /* ---------------------------------------------------------------------- */
  /* 启动                                                                    */
  /* ---------------------------------------------------------------------- */
  function startGame(withBirth) {
    if (withBirth === true && !$('birth').hidden) return;
    if (SETUP.nation) { /* 指定国家 */ }
    const S = TL.newLife({
      mode: SETUP.mode,
      nation: SETUP.nation || undefined,
      sex: SETUP.sex || undefined,
      race: SETUP.race || undefined,
      pace: SETUP.pace,
      bornYear: SETUP.bornYear,
      seed: SETUP.seed
    });
    const begin = () => {
      S.paused = false;
      UI.focus = null;
      UI.lastLogLen = 0;
      UI.lastAge = -1;
      UI.auto = false;
      UI.seekingDecision = false;
      $('feed').innerHTML = '';
      $('start').hidden = true;
      $('report').hidden = true;
      $('game').hidden = false;
      $('autoBtn').classList.remove('on');

      // 开局先给一次身份旁白
      announceOrigin(S);
      TL.renderAll(S, true);
      TL.renderFocus(S);

      lastTs = 0;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
      toast('按「下一个决定」或等待时间推进');
    };
    if (withBirth === true) {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      TL.birthIntro(S, {mode: SETUP.mode, specified: !!SETUP.nation}, begin);
    } else begin();
  }

  /** 开局旁白：把抽签结果讲成一个故事（出生那一句已由 newLife 写入，此处不重复） */
  function announceOrigin(S) {
    const n = TL.NATION_BY_ID[S.nation];
    const r = TL.RACE_BY_ID[S.race];
    const qw = ['一贫如洗', '勉强度日', '尚能温饱', '过得去', '殷实'][S.q - 1];
    TL.log(S, TL.L`你是${r.name}${S.courtName && S.court !== 'none' ? '（' + S.courtName + '）' : ''}，${S.sex === 'M' ? '男' : '女'}孩。家里${qw}。`, 'birth');
    if (S.urban) TL.log(S, TL.L`你家住在城里。`, 'ev');
    else TL.log(S, TL.L`你家在城外，最近的邻居要走一刻钟。`, 'ev');
    if (TL.artRank(S) >= 2) TL.log(S, TL.L`还很小的时候，家里人就发现你对源石有反应——杯子会随着你的情绪轻轻晃动。`, 'ev');
    if (r.disc > 0.2) TL.log(S, TL.L`在${n.name}，${r.name}这个身份意味着一些东西。你还没懂，但你的父母懂。`, 'ev');
    TL.log(S, TL.L`${n.tag}`, 'ev');
  }

  /* ---------------------------------------------------------------------- */
  /* 主循环                                                                  */
  /* ---------------------------------------------------------------------- */
  function loop(ts) {
    raf = requestAnimationFrame(loop);
    const S = TL.S;
    if (!S) return;
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.4) dt = 0.4;              // 切标签页回来不要一次性跳很多年

    if (S.phase === 'life') {
      if (UI.seekingDecision) {
        const result = TL.advanceToDecision(S);
        if (result !== 'searching') UI.seekingDecision = false;
      } else if (UI.auto && S.pending) {
        TL.autoChoose(S);
        $('modal').hidden = true;
        $('modal')._pendingDecision = null;
      }
      // 自动模式下，无抉择时自动选重心
      if (UI.auto && !S.focus) { S.focus = TL.autoFocus(S); UI.focus = S.focus; }
      if (!UI.seekingDecision) TL.tick(S, dt);
      if (UI.auto && S.pending) TL.autoChoose(S);

      if (S.pending) {
        TL.renderAll(S, true);
        TL.showDecision(S, S.pending);
        return;
      }
      if (S.phase === 'report') { finishLife(S); return; }

      // 年龄变化时才做完整重绘，其余只更新进度条
      if (S.age !== UI.lastAge) {
        UI.lastAge = S.age;
        TL.renderAll(S, false);
      } else {
        $('progBar').style.width = (S.t * 100).toFixed(1) + '%';
        TL.renderFeed(S, false);
      }
    } else if (S.phase === 'report') {
      finishLife(S);
    }
  }

  /* ---------------------------------------------------------------------- */
  /* 死亡 → 报告                                                            */
  /* ---------------------------------------------------------------------- */
  function finishLife(S) {
    if (raf) { cancelAnimationFrame(raf); raf = null; }
    const rep = S.report || TL.finalizeLife(S);
    renderReport(S, rep);
    saveLife(S);
    $('game').hidden = true;
    $('report').hidden = false;
  }

  function renderReport(S, rep) {
    const lt = S.lt;
    $('rTitle').textContent = TL.L`${rep.name}的一生`;
    const rel = rep.delta >= 0 ? '多活了' : '少活了';
    const deathMode = rep.deathTrigger === 'annual'
      ? TL.L`年度风险判定 ${TL.fmt.pct(rep.deathRisk || 0, 2)}`
      : TL.L`事件直接致死`;
    $('rDead').innerHTML = TL.L`卒于 ${rep.age} 岁 · ${rep.causeName} · ${deathMode} · ${rep.nation} ${rep.city}
      <br><span style="color:var(--fg3);font-size:12px">同为${rep.nation}${rep.sex === 'M' ? '男' : '女'}性的模拟人生，平均活到 ${rep.lifeExp} 岁（四分位 ${rep.baseP25}–${rep.baseP75}）——你${rel} ${Math.abs(rep.delta).toFixed(1)} 年</span>
      <br><span style="color:var(--fg3);font-size:12px">该国的统计预期寿命为 ${rep.statLE} 岁</span>`;

    const cells = [
      ['享年', rep.age + ' 岁', 'amber'],
      ['死因', rep.causeName, 'red'],
      ['种族', rep.race + (rep.court && rep.court !== '无王庭' ? '·' + rep.court : ''), ''],
      ['源石技艺', rep.artsRankName + ' (' + Math.round(rep.arts) + ')', ''],
      ['最高职业', rep.apex.opClass ? (TL.opRankName(rep.apex.opRank) + '·' + TL.opClassName(rep.apex.opClass)) : TL.jobLabel(rep.apex.job), 'teal'],
      ['学历', TL.eduName(rep.apex.eduLevel), ''],
      ['终生平均·体质', rep.avg.hl, ''],
      ['终生平均·心境', rep.avg.h, ''],
      ['终生平均·学识', rep.avg.sm, ''],
      ['终生平均·羁绊', rep.avg.so, ''],
      ['峰值净资产', TL.fmt.money(rep.peakNetWorth), 'amber'],
      ['子女', rep.kidsAlive + ' / ' + rep.kids + ' 在世', '']
    ];
    if (rep.organization) {
      cells.push(['组织', rep.organization.name, 'green']);
      cells.push(['组织路线', rep.organization.routeName + ' · ' + rep.organization.rankName, 'teal']);
    }
    if (rep.orgHistory && rep.orgHistory.length) {
      cells.push(['组织履历', rep.orgHistory.map(h =>
        h.joinedYear + '–' + (h.leftYear == null ? '至终年' : h.leftYear) + ' ' +
        TL.organizationName(h.organization) + ' · ' +
        TL.organizationRouteName(h.organization, h.route) + ' · ' +
        TL.organizationRankName(h.organization, h.route, Math.max(...h.ranks)) +
        (h.reason ? '（' + h.reason + '）' : '')).join('<br>'), 'teal']);
    }
    const contacts = Object.values(rep.orgContacts || {});
    if (contacts.length) cells.push(['人物往来', contacts.map(c => c.name + ' · ' + c.count + ' 次').join('、'), '']);
    if (rep.orgInterviewHistory && rep.orgInterviewHistory.length) {
      const statuses = {passed:'录用',waitlisted:'候补',rejected:'未通过',withdrawn:'撤回',ineligible:'资格变化',unavailable:'暂缓'};
      cells.push(['面试记录', rep.orgInterviewHistory.map(r => escapeHtml(r.year + ' · ' +
        TL.organizationName(r.organization) + ' · ' + TL.organizationRouteName(r.organization,r.route) + ' · ' +
        TL.organizationAdmissionName(r.organization) + '：' +
        (r.status === 'passed' && TL.organizationDef(r.organization)?.admission ? '接纳' : (statuses[r.status] || r.status)) +
        (r.score == null ? '' : '（' + r.score.toFixed(1) + '）'))).join('<br>'), '']);
    }
    if (rep.ori) {
      cells.push(['感染年龄', rep.ori.at + ' 岁', 'red']);
      cells.push(['离世时结晶率', Math.round(rep.ori.crystal) + '%', 'red']);
      cells.push(['是否接受治疗', rep.ori.treated ? (rep.ori.provider === 'rhodes' ? '罗德岛方案' : '民间诊所') : '从未治疗', rep.ori.treated ? 'teal' : 'red']);
    }
    $('rGrid').innerHTML = cells.map(c =>
      `<div class="rcell ${c[2]}"><div class="k">${c[0]}</div><div class="v">${c[1]}</div></div>`).join('');

    // 曲线
    requestAnimationFrame(() => {
      TL.drawLifeChart($('chartLife'), rep.years);
      TL.drawWealthChart($('chartWealth'), rep.years);
    });

    // 生平摘要（只挑关键节点，不是全部日志）
    const key = rep.log.filter(e => ['birth', 'mil', 'dec', 'death', 'ori', 'fam', 'org'].indexOf(e.kind) >= 0);
    const show = key.length > 80 ? key.filter((e, i) => i % Math.ceil(key.length / 80) === 0) : key;
    $('reportLog').innerHTML = show.map(e =>
      `<div class="entry ${e.kind}"><span class="age">${e.age}岁</span><span class="txt">${escapeHtml(e.text)}</span></div>`
    ).join('');
  }

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ---------------------------------------------------------------------- */
  /* 本地存档（对应原作的「过去的人生」）                                      */
  /* ---------------------------------------------------------------------- */
  function loadSaves() {
    try {
      const records = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      return Array.isArray(records) ? records.filter(s => s && Number.isFinite(s.age) && typeof s.cause === 'string') : [];
    } catch (e) { return []; }
  }
  function saveLife(S) {
    if (!S || S.phase !== 'report' || !Number.isFinite(S.deathAge) || !S.deathCause) return;
    try {
      const all = loadSaves();
      all.unshift({
        t: Date.now(),
        name: S.fullName,
        nation: TL.NATION_BY_ID[S.nation].name,
        race: TL.RACE_BY_ID[S.race].name,
        age: S.deathAge,
        cause: TL.causeName(S.deathCause, S.deathAge),
        seed: TL.seed(),
        setup: Object.assign({}, SETUP)
      });
      localStorage.setItem(STORE_KEY, JSON.stringify(all.slice(0, 60)));
    } catch (e) { /* 隐私模式下写不了，忽略 */ }
  }
  function renderSaves() {
    const all = loadSaves();
    const box = $('saves');
    if (!all.length) { box.innerHTML = '<div style="color:var(--fg3);font-size:12px">还没有记录。这一局会是第一次。</div>'; return; }
    box.innerHTML = all.slice(0, 12).map(s =>
      `<div class="svrow"><span>${escapeHtml(s.name)}<small> · ${s.nation} · ${s.race}</small></span>
       <span class="svr">${s.age}岁 · ${s.cause}</span></div>`).join('');
  }

  /* ---------------------------------------------------------------------- */
  /* 提示                                                                    */
  /* ---------------------------------------------------------------------- */
  let toastTimer = null;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  TL.toast = toast;

  /* ---------------------------------------------------------------------- */
  /* 事件绑定                                                                */
  /* ---------------------------------------------------------------------- */
  function bind() {
    bindChips('modeChips', 'mode', false);
    bindChips('nationChips', 'nation', true);
    bindChips('sexChips', 'sex', true);
    bindChips('raceChips', 'race', true);
    bindChips('paceChips', 'pace', false);

    $('startBtn').addEventListener('click', () => startGame(true));
    TL.initLanding(() => startGame(true));

    $('seedBtn').addEventListener('click', () => {
      const v = $('seedInput').value.trim();
      if (!v) { SETUP.seed = null; toast('已切回真随机'); return; }
      let h = 0;
      for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0;
      SETUP.seed = h >>> 0;
      toast('种子：' + SETUP.seed);
    });

    // 播放控制：原作是一排速度按钮，暂停也是其中一档（0）
    Array.prototype.forEach.call(document.querySelectorAll('#speeds .spd'), el => {
      el.addEventListener('click', () => {
        const S = TL.S; if (!S) return;
        const v = +el.dataset.s;
        UI.seekingDecision = false;
        if (v === 0) { S.paused = !S.paused; }
        else { S.paused = false; S.speed = v; }
        lastTs = 0;
        TL.renderTop(S);
        toast(S.paused ? '已暂停' : TL.L`${S.speed} 倍速`);
      });
    });

    $('autoBtn').addEventListener('click', () => {
      UI.auto = !UI.auto;
      UI.seekingDecision = false;
      $('autoBtn').classList.toggle('on', UI.auto);
      toast(UI.auto ? '自动模式：自动选择重心和抉择' : '自动模式：关');
    });

    // 跨年逐个处理事件，分帧搜索；手动快转始终停在抉择前。
    $('nextBtn').addEventListener('click', () => {
      const S = TL.S; if (!S) return;
      if (S.pending) { TL.showDecision(S, S.pending); return; }
      UI.auto = false;
      $('autoBtn').classList.remove('on');
      UI.seekingDecision = true;
      toast('正在快转，遇到下一个抉择或人生结束时停止');
    });

    $('restartBtn').addEventListener('click', () => {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      TL.S = null;
      $('report').hidden = true;
      $('game').hidden = true;
      $('start').hidden = false;
      renderSaves();
      renderOdds();
    });

    $('againBtn').addEventListener('click', () => {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      TL.S = null;
      $('report').hidden = true;
      $('start').hidden = false;
      renderSaves(); renderOdds();
    });

    $('sameSeedBtn').addEventListener('click', () => {
      const S = TL.S;
      if (!S) return;
      SETUP.seed = S.lt && TL.seed() != null ? TL.seed() : null;
      if (SETUP.seed == null) { toast('这一局没有固定种子'); return; }
      $('report').hidden = true;
      startGame(true);
    });

    /* --- 工具浮层：设置 / 写下想法 / 提供意见 ------------------------------ */
    $('setBtn').addEventListener('click', openSettings);
    $('noteBtn').addEventListener('click', openNote);
    $('fbBtn').addEventListener('click', openFeedback);
    $('sheetClose').addEventListener('click', closeSheet);
    $('sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

    /* --- 音乐：用 WebAudio 现场合成一段极简环境音，不依赖任何音频文件 ---------
       这样 file:// 双击打开也能有声音，且不增加任何体积。默认关闭。 */
    $('musicBtn').addEventListener('click', () => {
      let on = false;
      try { on = toggleMusic(); } catch (err) { toast('这台机器放不出声音'); return; }
      $('musicBtn').classList.toggle('on', on);
      toast(on ? '音乐：开（合成的环境音）' : '音乐：关');
    });

    /* --- 返回首页：进行中的人生不保存，历史记录仅收录已结束人生 --- */
    $('closeBtn').addEventListener('click', () => {
      UI.seekingDecision = false;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      TL.S = null;
      $('game').hidden = true;
      $('report').hidden = true;
      $('start').hidden = false;
      renderSaves(); renderOdds();
      toast('已返回首页；未结束的人生不保留进度');
    });

    // 键盘：空格暂停，1-9 选择抉择选项，回车下一个决定
    document.addEventListener('keydown', e => {
      if (!$('birth').hidden) return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const S = TL.S;
      if (e.key === 'Escape') { closeSheet(); if (S) $('modal').hidden = true; return; }
      if (!S) return;
      if (e.code === 'Space') {
        e.preventDefault();
        UI.seekingDecision = false;
        S.paused = !S.paused; lastTs = 0; TL.renderTop(S);
      } else if (e.code === 'Enter') { $('nextBtn').click(); }
      else if (S.pending && /^Digit[1-9]$/.test(e.code)) {
        const i = +e.code.slice(5) - 1;
        const el = $('modalOpts').querySelector(`.opt[data-i="${i}"]`);
        if (el) el.click();
      }
    });
  }

  /* ---------------------------------------------------------------------- */
  /* 浮层                                                                    */
  /* ---------------------------------------------------------------------- */
  function closeSheet() { $('sheet').hidden = true; }

  function openSheet(title, bodyHtml, footHtml) {
    $('sheetTitle').textContent = title;
    $('sheetBody').innerHTML = bodyHtml;
    $('sheetFoot').innerHTML = footHtml || '';
    $('sheet').hidden = false;
    return $('sheetBody');
  }

  /**
   * 设置面板。
   * 最重要的一项是「地区」—— 原作把台湾物价写成固定维度，本作改成
   * 跟随浏览器地区，并允许在这里手动覆盖（写进 localStorage）。
   */
  function openSettings() {
    const cur = TL.locale.id;
    const rows = TL.LOCALE_LIST.map(id => {
      const R = TL.LOCALES[id];
      const on = id === cur;
      return `<div class="row" data-region="${id}" style="cursor:pointer">
        <span class="rk">${on ? '● ' : '○ '}${esc(R.name)} <span style="color:var(--fg3)">/ ${esc(R.nameEn)}</span></span>
        <span class="rv">${R.curCode} · ${esc(R.priceNote)}</span>
      </div>`;
    }).join('');

    const S = TL.S;
    const info = S ? `
      <div class="row"><span class="rk">出生地</span><span class="rv">${esc(TL.NATION_BY_ID[S.nation].name)} · ${esc(S.stratumName)}</span></div>
      <div class="row"><span class="rk">社会预期寿命</span><span class="rv">${S.lt.e0.toFixed(1)} 岁</span></div>
      <div class="row"><span class="rk">生理极限</span><span class="rv">${S.lifeMax[0]}–${S.lifeMax[1]} 岁</span></div>
      <div class="row"><span class="rk">种子</span><span class="rv">${TL.seed() == null ? '真随机' : TL.seed()}</span></div>
      <div class="row"><span class="rk">倍速 / 节奏</span><span class="rv">${S.speed}× · 1 年 ≈ ${S.yearSec.toFixed(1)} 秒</span></div>
    ` : `<div style="color:var(--fg3)">还没有开始一局。</div>`;

    const body = openSheet('设置',
      `<div style="color:var(--fg3);margin-bottom:8px">
         地区决定界面语言与货币口径，不影响世界模型本身。默认跟随浏览器，
         也可以在这里固定下来。
       </div>${rows}
       <div style="margin-top:14px;font-family:var(--serif);font-weight:700;
                   border-bottom:1px solid var(--line2);padding-bottom:3px;margin-bottom:6px">当前这一局</div>
       ${info}`,
      `<button class="tbtn" id="setClose">关闭</button>`);
    $('setClose').addEventListener('click', closeSheet);

    Array.prototype.forEach.call(body.querySelectorAll('[data-region]'), el => {
      el.addEventListener('click', () => {
        TL.setLocale(el.dataset.region, true);
        applyStaticText();
        if (TL.S) TL.renderAll(TL.S, true);
        toast('地区已切换为 ' + TL.locale.name);
        closeSheet();
      });
    });
  }

  function openNote() {
    const S = TL.S;
    const key = 'terra.notes';
    let notes = [];
    try { notes = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { notes = []; }
    const mine = notes.filter(n => !S || n.seed === String(TL.seed()));

    const body = openSheet('写下想法',
      `<textarea id="noteTa" placeholder="此刻你想说点什么？存在这个浏览器里，不会上传。"></textarea>
       <div style="color:var(--fg3);font-size:11px;margin-top:6px">
         这一局已有的想法：${mine.length} 条
       </div>
       <div id="noteList" style="max-height:150px;overflow-y:auto;margin-top:6px">
         ${mine.map(n => `<div class="row"><span class="rk">${esc(n.age)} 岁</span>
            <span class="rv">${esc(n.text)}</span></div>`).join('') || '<div style="color:var(--fg3);font-size:11.5px">还没有。</div>'}
       </div>`,
      `<button class="tbtn primary" id="noteSave">保存</button>
       <button class="tbtn" id="noteClose">关闭</button>`);
    $('noteTa').focus();
    $('noteClose').addEventListener('click', closeSheet);
    $('noteSave').addEventListener('click', () => {
      const v = $('noteTa').value.trim();
      if (!v) { closeSheet(); return; }
      notes.push({ seed: String(TL.seed()), age: S ? Math.floor(S.age) : 0, text: v, at: Date.now() });
      try { localStorage.setItem(key, JSON.stringify(notes.slice(-500))); } catch (e) { /* 忽略 */ }
      if (S) TL.log(S, TL.L`【想法】${v}`, 'dec');
      toast('已记下');
      closeSheet();
      if (S) TL.renderFeed(S, false);
    });
  }

  function openFeedback() {
    openSheet('提供意见',
      `<div style="line-height:1.8">
        这是一个本地运行的同人作品，没有任何服务器，所以这里没有可以提交的表单。<br><br>
         如果你发现了逻辑上的问题，下面这些线索比一句「有问题」有用得多：
         <ul style="margin:8px 0 0 18px;padding:0">
           <li>种子（设置面板里能看到）</li>
           <li>死亡年龄与死因</li>
           <li>你觉得不合理的那一年、那一句记录</li>
         </ul>
         <div style="margin-top:12px;color:var(--fg3);font-size:11.5px">
           数值模型的来龙去脉写在 README.md 与 docs/ 里，改数值之前建议先读一遍。
         </div>
       </div>`,
      `<button class="tbtn" id="fbClose">关闭</button>`);
    $('fbClose').addEventListener('click', closeSheet);
  }

  /* ---------------------------------------------------------------------- */
  /* 合成环境音（不依赖音频文件）                                             */
  /* ---------------------------------------------------------------------- */
  let audioCtx = null, audioNodes = null;
  function toggleMusic() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) throw new Error('no webaudio');
    if (audioNodes) {
      audioNodes.osc.forEach(o => { try { o.stop(); } catch (e) {} });
      try { audioCtx.close(); } catch (e) {}
      audioCtx = null; audioNodes = null;
      return false;
    }
    audioCtx = new AC();
    const master = audioCtx.createGain();
    master.gain.value = 0.055;
    master.connect(audioCtx.destination);

    // 一个很轻的低频嗡鸣 + 两个五度泛音，模拟移动城市引擎的底噪
    const freqs = [55, 82.5, 110, 164.8];
    const osc = freqs.map((f, i) => {
      const o = audioCtx.createOscillator();
      o.type = i === 0 ? 'sine' : 'triangle';
      o.frequency.value = f;
      const g = audioCtx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.16 / (i + 1);
      // 极慢的振幅起伏，避免听起来像测试音
      const lfo = audioCtx.createOscillator();
      lfo.frequency.value = 0.03 + i * 0.017;
      const lg = audioCtx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg); lg.connect(g.gain);
      lfo.start();
      o.connect(g); g.connect(master);
      o.start();
      return o;
    });
    audioNodes = { osc: osc, master: master };
    return true;
  }


  /* ---------------------------------------------------------------------- */
  /* 快进：瞬间把人生推进到指定年龄（不做动画）                                */
  /* ---------------------------------------------------------------------- */
  /**
   * 用于 ?ff=N 调试/分享参数，也用于「自动跑一段」。
   * 与主循环共用同一套 tick/choose，所以结果与正常播放完全一致 ——
   * 区别只是不等待真实时间。
   */
  function fastForward(S, targetAge) {
    let guard = 0;
    while (S.phase === 'life' && S.age < targetAge && guard++ < 20000) {
      if (!S.focus) S.focus = TL.autoFocus(S);
      // 每次推进 1/4 年，保证年内排程的抉择都能被触发
      TL.tick(S, S.yearSec / 4);
      if (S.pending) {
        // ?hold=1：停在第一个未决抉择上，用来截图 / 验证弹层
        if (SETUP.hold) break;
        TL.autoChoose(S);
      }
      if (S.phase !== 'life') break;
    }
    S.paused = false;
    if (S.pending && SETUP.hold) {
      UI.focus = null;
      TL.showDecision(S, S.pending);
      return S;
    }
    S.pending = null;
    UI.focus = null;
    UI.auto = true;
    $('autoBtn').classList.add('on');
    return S;
  }

  /* ---------------------------------------------------------------------- */
  /* 初始化                                                                  */
  /* ---------------------------------------------------------------------- */
  /**
   * URL 参数（用于调试与分享特定一局）：
   *   ?auto=1              开局后自动进入自动模式
   *   ?go=1                跳过开局界面直接出生
   *   ?nation=YAN&race=sarkaz&sex=F&pace=short&mode=pop&seed=1234
   *   ?speed=4             初始倍速
   */
  function applyQuery() {
    const q = new URLSearchParams(location.search);
    for (const k of ['mode', 'nation', 'sex', 'race', 'pace']) {
      const v = q.get(k);
      if (v && (k !== 'nation' || TL.NATION_BY_ID[v]) && (k !== 'race' || TL.RACE_BY_ID[v])) SETUP[k] = v;
    }
    if (q.get('hold') === '1') SETUP.hold = true;
    if (q.get('by')) SETUP.bornYear = parseInt(q.get('by'), 10) || null;
    if (q.get('seed')) {
      const v = q.get('seed');
      let h = 0;
      for (let i = 0; i < v.length; i++) h = (h * 31 + v.charCodeAt(i)) | 0;
      SETUP.seed = h >>> 0;
    }
    return q;
  }

  /* ---------------------------------------------------------------------- */
  /* 地区与静态文案                                                          */
  /* ---------------------------------------------------------------------- */
  /**
   * 把界面上的固定文案按当前地区语言写一遍。
   * 动态文案（事件、抉择、记录）在数据层，不在这里处理。
   */
  function applyStaticText() {
    const S = TL.S;
    document.title = TL.lang === 'zh'
      ? '泰拉人生模拟 · 明日方舟'
      : 'Terra Life Simulator · Arknights';

    $('brand').firstChild.nodeValue = TL.t('brand');
    $('nextBtn').textContent = TL.t('nextChoice');
    $('autoBtn').textContent = TL.t('auto');
    $('musicBtn').textContent = TL.t('music');
    $('noteBtn').textContent = TL.t('write');
    $('setBtn').textContent = TL.t('settings');
    $('fbBtn').textContent = TL.t('feedback');
    $('closeBtn').textContent = TL.t('home');
    $('sheetClose').textContent = TL.t('close');
    document.querySelector('#speeds .spd[data-s="0"]').textContent = TL.t('pause');

    $('startTitle').textContent = TL.lang === 'zh' ? '泰拉人生模拟' : 'Terra Life Simulator';
    TL.renderLandingTitle();
    $('rChartLbl').textContent = TL.lang === 'zh'
      ? '一生曲线 · 体质 / 心境 / 学识 / 羁绊 / 结晶率'
      : 'Life curve · health / happiness / knowledge / bonds / crystallization';
    $('rWealthLbl').textContent = TL.t('netWorth');
    $('rLogLbl').textContent = TL.lang === 'zh' ? '一生纪要' : 'Life in brief';
    $('againBtn').textContent = TL.t('again');
    $('sameSeedBtn').textContent = TL.t('sameSeed');
    $('restartBtn').textContent = TL.t('backToStart');

    renderRegionChips();
  }

  function renderRegionChips() {
    const box = $('regionChips');
    if (!box) return;
    box.innerHTML = TL.LOCALE_LIST.map(id => {
      const R = TL.LOCALES[id];
      const on = id === TL.locale.id;
      return `<button type="button" class="chip ${on ? 'on' : ''}" aria-pressed="${on}" data-v="${id}">${esc(R.name)}
        <small class="sub">${R.curCode} · ${esc(R.priceNote)}</small></button>`;
    }).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.chip'), el => {
      el.addEventListener('click', () => {
        TL.setLocale(el.dataset.v, true);
        applyStaticText();
        renderOdds();
        if (TL.S) TL.renderAll(TL.S, true);
      });
    });
    const detected = TL.detectLocale();
    $('regionNote').textContent = TL.lang === 'zh'
      ? `自动判定结果：${TL.LOCALES[detected].name}。地区只影响语言与货币口径，不影响寿命、死亡率、矿石病等世界模型。`
      : `Detected: ${TL.LOCALES[detected].nameEn}. Region affects language and currency only — never the world model.`;
  }

  /* ---------------------------------------------------------------------- */
  /* 兜底：任何未捕获的异常都摆到台面上                                        */
  /* ---------------------------------------------------------------------- */
  /* 静默失败是这类纯前端项目最难查的 bug。宁可难看，也不要让人对着一个
     空白页面猜。错误同时写进 <title>，这样无头截图 / dump-dom 也能看到。 */
  const originalConsoleError = console.error.bind(console);
  function reportFatal(where, err, log = true) {
    const msg = (err && (err.stack || err.message)) || String(err);
    if (log) try { originalConsoleError('[' + where + ']', err); } catch (e) { /* 忽略 */ }
    try {
      document.title = 'ERR[' + where + '] ' + msg.split('\n')[0];
      // 把完整栈写进一个隐藏节点：无头 dump-dom 时能直接读到，不用开 devtools
      let box = document.getElementById('errbox');
      if (!box) {
        box = document.createElement('pre');
        box.id = 'errbox';
        box.style.cssText = 'position:fixed;left:0;bottom:0;max-height:40vh;overflow:auto;'
          + 'background:#fff;color:#b23a2a;font-size:11px;z-index:999;margin:0;padding:4px;display:none';
        document.body.appendChild(box);
      }
      box.textContent = '[' + where + '] ' + msg;
      const el = document.getElementById('toast');
      if (el) { el.hidden = false; el.textContent = where + '：' + msg.split('\n')[0]; }
    } catch (e) { /* 忽略 */ }
  }
  window.addEventListener('error', e => reportFatal('error', e.error || e.message));
  window.addEventListener('unhandledrejection', e => reportFatal('promise', e.reason));

  /* 事件执行器（TL.fire）会吞掉单个事件的异常，只往 console 里写一行。
     那条日志在无头截图 / dump-dom 里看不到，于是「某个事件一直报错」
     会表现为「这个事件永远不发生」，极难发现。这里把 console.error
     抄一份进 errbox。 */
  (function tapConsole() {
    console.error = function () {
      try { reportFatal('console', Array.prototype.join.call(arguments, ' '), false); } catch (e) { /* 忽略 */ }
      return originalConsoleError(...arguments);
    };
  })();

  function init() {
    try {
      initInner();
    } catch (err) {
      reportFatal('init', err);
    }
  }

  function initInner() {
    const q = applyQuery();
    TL.initLocale(q.get('region'));       // URL ?region=CN|US|JP|KR|EU 优先
    applyStaticText();
    renderNationChips();
    renderRaceChips();
    renderOdds();
    renderSaves();
    bind();

    // 同步 chip 的选中态
    const mark = (boxId, val) => {
      const box = $(boxId);
      if (!box) return;
      Array.prototype.forEach.call(box.querySelectorAll('.chip'), c => {
        c.classList.toggle('on', c.dataset.v === val);
        c.setAttribute('aria-pressed', String(c.dataset.v === val));
      });
    };
    mark('modeChips', SETUP.mode);
    mark('nationChips', SETUP.nation);
    mark('raceChips', SETUP.race);
    mark('sexChips', SETUP.sex);
    mark('paceChips', SETUP.pace);

    if (q.get('go') === '1') {
      startGame();
      if (q.get('speed')) TL.S.speed = parseInt(q.get('speed'), 10) || 1;
      const ff = parseInt(q.get('ff') || '0', 10);
      if (ff > 0) {
        fastForward(TL.S, ff);
        if (TL.S.phase === 'report') { finishLife(TL.S); return; }
        TL.renderAll(TL.S, true);
      }
      if (q.get('auto') === '1') {
        UI.auto = true;
        $('autoBtn').classList.add('on');
      }
      TL.renderTop(TL.S);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(window.TL = window.TL || {});
