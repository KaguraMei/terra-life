/* Entrance presentation only. Animation randomness never consumes TL.rnd(). */
(function (TL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const escape = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pct = p => (p * 100).toFixed(p < .01 ? 2 : 1) + '%';
  // Schematic positions, deliberately not presented as canonical geography.
  const places = { CLB:[95,104], BLV:[107,159], IBE:[167,187], VIC:[207,119],
    LEI:[269,116], KAZ:[272,76], SAMI:[292,39], URS:[390,64], KJR:[355,104],
    KDZ:[333,141], LAT:[263,154], SIR:[222,167], MIN:[290,193], SRG:[359,208],
    YAN:[454,135], HIG:[544,127], LMN:[479,169], RMB:[479,215], SST:[408,247],
    AEG:[127,241], DUR:[214,228] };

  function drawMap(id, odds, selected) {
    const svg = $(id);
    const prefix = id + '-';
    // A dotted Terra-like landmass drawn locally; no remote assets or map claims.
    let out = `<defs><pattern id="${prefix}dots" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.15" fill="#c7d2ce"/></pattern></defs>`;
    out += `<path fill="url(#${prefix}dots)" d="M46 93L72 70 105 73 120 48 158 62 184 49 220 59 245 35 276 45 300 23 337 37 357 28 403 44 433 37 460 57 484 60 490 88 523 103 516 132 536 149 509 172 512 196 481 224 458 232 444 207 416 213 400 238 375 230 357 245 332 220 305 218 287 195 253 203 230 187 199 197 176 189 166 213 139 204 128 176 102 183 87 158 67 149 76 121 48 117Z"/>`;
    out += `<path fill="url(#${prefix}dots)" d="M70 216L105 208 147 228 168 249 132 263 93 253Z M535 86L553 99 557 130 545 151 534 132Z M396 244L416 240 427 254 411 266Z"/>`;
    for (const o of odds) {
      const p = places[o.id]; if (!p) continue;
      const active = o.id === selected;
      const r = 3 + Math.sqrt(o.p) * 31;
      out += `<g><title>${escape(o.name)} · ${pct(o.p)}</title><circle cx="${p[0]}" cy="${p[1]}" r="${r}" fill="${active ? '#0f6e68' : '#8c1d3c'}" opacity="${selected && !active ? .2 : .82}"/>`;
      if (active) out += `<circle cx="${p[0]}" cy="${p[1]}" r="${r + 6}" fill="none" stroke="#0f6e68" stroke-width="1.5"/><text x="${p[0]}" y="${p[1] - r - 13}" text-anchor="middle" font-size="13" fill="#0f6e68">${escape(o.name)}</text>`;
      out += '</g>';
    }
    svg.innerHTML = out;
  }

  TL.renderLandingOdds = function (mode) {
    const odds = TL.lotteryOdds(mode);
    const top = odds.slice(0, 9);
    const rest = odds.slice(9).reduce((s, o) => s + o.p, 0);
    const max = Math.max(top[0].p, rest);
    const row = (o, other) => `<div class="odds-row${other ? ' other' : ''}"><span>${escape(o.name)}</span><div class="odds-track"><div class="odds-fill" style="width:${(o.p / max * 100).toFixed(2)}%"></div></div><span class="odds-pct">${pct(o.p)}</span></div>`;
    $('oddsTable').innerHTML = top.map(o => row(o, false)).join('') + row({name:`其余 ${odds.length - 9} 个地区`, p:rest},true);
    $('oddsAll').innerHTML = odds.map(o => row(o,false)).join('');
    $('landingOddsTitle').textContent = mode === 'birth' ? '如果你是此刻出生的婴儿' : '如果你是此刻活着的人';
    $('oddsNote').textContent = mode === 'birth' ? '泰拉人口模型 · 按各国年出生人数加权' : '泰拉人口模型 · 按各国人口比例加权';
    drawMap('terraMap', odds);
  };

  TL.renderLandingTitle = function () {
    $('startTitle').innerHTML = TL.lang === 'en' ? '<span>Terra</span><span>Li<em>fe</em></span>' : '<span>泰拉</span><span>人<em>生</em></span>';
    $('startBtn').textContent = TL.lang === 'en' ? 'Be born' : '出生';
    $('quickBirth').textContent = $('startBtn').textContent;
  };

  let active = false, timer = null;
  TL.birthIntro = function (S, settings, begin) {
    if (active) return;
    active = true;
    clearTimeout(timer);
    const odds = TL.lotteryOdds(settings.mode);
    const target = odds.find(o => o.id === S.nation);
    S.paused = true;
    $('start').hidden = true;
    $('game').hidden = true;
    $('report').hidden = true;
    $('modal').hidden = true;
    $('birth').hidden = false;
    $('birth').scrollTop = 0;
    $('birthRoller').hidden = false;
    $('birthCertificate').hidden = true;
    $('rollLabel').textContent = settings.specified ? '你选择的出生地' : '正在决定出生地';
    $('rollName').removeAttribute('aria-live');

    function certificate() {
      if (!active) return;
      const n = TL.NATION_BY_ID[S.nation], r = TL.RACE_BY_ID[S.race];
      const family = ['一贫如洗','勉强度日','尚能温饱','生活宽裕','家境殷实'][S.q - 1];
      $('certNumber').textContent = `No. ${S.nation}-${S.bornYear}-${S.sceneSeed.toString(16).toUpperCase().padStart(8,'0')}`;
      $('certName').textContent = S.fullName;
      $('certStory').textContent = `泰拉历 ${S.bornYear} 年，你出生在${n.name}的${S.city}，一个${family}的家庭。你是${r.name}${S.sex === 'M' ? '男孩' : '女孩'}，家住${S.stratumName}。`;
      $('certPace').textContent = `走到预期寿命约需 ${TL.PACES[S.paceKey].min} 分钟（1 年 ≈ ${S.yearSec.toFixed(0)} 秒）。准备好之后，开始这一生。`;
      const fields = [['性别', S.sex === 'M' ? '男性' : '女性'], ['出生国家 / 地区',n.name], ['出生地',S.city],
        ['种族',r.name + (S.courtName && S.court !== 'none' ? ' · ' + S.courtName : '')], ['出身阶层',S.stratumName], ['家境','●'.repeat(S.q) + '○'.repeat(5-S.q) + ' 第' + S.q + '分位'],
        ['父母年龄',`母亲 ${S.fam.mom.age} 岁 · 父亲 ${S.fam.dad.age} 岁`], ['父母的工作',`母亲：${TL.jobLabel(S.fam.mom.job)}；父亲：${TL.jobLabel(S.fam.dad.job)}`], ['源石技艺适应性',TL.artRankName(TL.artRank(S))],
        ['社会预期寿命',S.lt.e0.toFixed(1) + ' 岁'], ['种族生理寿命区间',S.lifeMax.join('–') + ' 岁'], ['矿石病','未感染']];
      $('certFields').innerHTML = fields.map(([k,v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('');
      $('certOdds').innerHTML = `${settings.specified ? '这是你指定的出生地。' : ''}在${settings.mode === 'birth' ? '按年出生人数' : '按人口'}抽签的模型中，有 <b>${pct(target.p)}</b> 的人会在${escape(n.name)}开始人生。<br><span class="landing-small">抽签权重、预期寿命与生理寿命为本项目的设定模型。</span>`;
      $('certPeers').innerHTML = S.cohort.peers.slice(0,4).map(p => `<li>${escape(p.fullName)} · ${escape(TL.RACE_BY_ID[p.race].name)} · ${p.sex === 'M' ? '男' : '女'}</li>`).join('');
      drawMap('certMap', odds, S.nation);
      $('birthRoller').hidden = true;
      $('birthCertificate').hidden = false;
      $('certName').focus({preventScroll:true});
    }

    // Independently sampled display frames cannot change the seeded simulation.
    function displayPick() {
      let p = Math.random();
      for (const o of odds) { p -= o.p; if (p <= 0) return o; }
      return odds[odds.length - 1];
    }
    let frame = 0;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frames = reduced || settings.specified ? 1 : 26;
    function step() {
      if (!active) return;
      frame++;
      const o = frame === frames ? target : displayPick();
      if (frame === frames) $('rollName').setAttribute('aria-live','polite');
      $('rollName').textContent = o.name;
      $('rollMeta').textContent = `概率：${pct(o.p)}`;
      timer = setTimeout(frame === frames ? certificate : step,
        frame === frames ? 650 : 40 + Math.pow(frame / 26, 3) * 380);
    }
    $('beginLife').onclick = () => {
      if (!active || $('birthCertificate').hidden) return;
      active = false; clearTimeout(timer);
      $('birth').hidden = true; S.paused = false;
      begin();
      $('nextBtn').focus({preventScroll:true});
    };
    $('birthBack').onclick = () => {
      if (!active) return;
      active = false; clearTimeout(timer);
      TL.S = null;
      $('birth').hidden = true; $('start').hidden = false;
      $('startBtn').focus({preventScroll:true});
    };
    step();
  };

  TL.initLanding = function (start) {
    $('quickBirth').addEventListener('click', start);
    // The floating CTA is useful only while the in-flow button is out of view.
    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(entries => {
        $('birthDock').hidden = entries[0].isIntersecting;
      }, {root:$('start'), threshold:0.1});
      observer.observe($('startBtn'));
    }
  };
})(window.TL = window.TL || {});
