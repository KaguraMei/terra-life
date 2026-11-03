/* ==========================================================================
 * 首页通讯板：更新记录的列表与详情弹窗
 * --------------------------------------------------------------------------
 * 数据在 js/data/changelog.js，这里只做三件事：
 *   ① 把最近几条渲染到首页的通讯板
 *   ② 点开任意一条时，用同一个弹窗显示详情或全部记录
 *   ③ 记住「哪些看过」，让没看过的条目带一个「新」字
 *
 * 「看过」只写 localStorage；隐私模式下写不进去，就每次都提示一次，
 * 不影响阅读，也不上报任何东西。
 * ========================================================================== */
(function (TL) {
  'use strict';
  const $ = id => document.getElementById(id);
  const SEEN_KEY = 'terra-life-notice-seen-v1';
  const escape = v => String(v == null ? '' : v)
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const entries = () => (Array.isArray(TL.CHANGELOG) ? TL.CHANGELOG : []);

  /* --- 「新」标记 ------------------------------------------------------- */
  /** 第一次来（没有记录）时只把最新一条标成新，免得一屏全是红字 */
  function readSeen() {
    try {
      const raw = localStorage.getItem(SEEN_KEY);
      if (raw == null) return null;
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : null;
    } catch (e) { return null; }
  }

  function writeSeen(ids) {
    try {
      const seen = readSeen() || [];
      localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(new Set(seen.concat(ids)))));
    } catch (e) { /* 隐私模式：忽略，下次再提示一遍 */ }
  }

  /* --- 列表 ------------------------------------------------------------- */
  function rowHtml(entry, index, seen) {
    const isNew = seen === null ? index === 0 : seen.indexOf(entry.id) < 0;
    return `<button type="button" class="notice-row" data-notice-id="${escape(entry.id)}">
      <span class="notice-when">
        <span class="notice-date">${escape(entry.date)}${isNew ? `<span class="notice-new">${escape(TL.t('noticeNew'))}</span>` : ''}</span>
        <span class="notice-version${index === 0 ? ' is-latest' : ''}">v${escape(entry.version)}</span>
      </span>
      <span class="notice-main"><b>${escape(entry.title)}</b><small>${escape(entry.summary)}</small></span>
      <span class="notice-arrow" aria-hidden="true">→</span>
    </button>`;
  }

  /** 首页那块通讯板。可重复调用（切换语言、关闭弹窗后刷新「新」标记）。 */
  TL.renderNoticeBoard = function () {
    const list = $('noticeList'), allBtn = $('noticeAllBtn');
    if (!list || !allBtn) return;

    const all = entries();
    $('noticeBoardTitle').textContent = TL.t('noticeTitle');
    $('noticeBoardLead').textContent = TL.t('noticeLead');
    $('noticeAllBtn').textContent = TL.t('noticeAll', { n: all.length });
    $('noticeClose').setAttribute('aria-label', TL.t('close'));

    if (!all.length) { list.innerHTML = ''; allBtn.hidden = true; return; }
    allBtn.hidden = false;
    const seen = readSeen();
    list.innerHTML = all.slice(0, 3).map((e, i) => rowHtml(e, i, seen)).join('');
  };

  /* --- 弹窗 ------------------------------------------------------------- */
  let open = false, returnFocus = null;

  function fillDetail(entry) {
    const all = entries();
    const index = all.indexOf(entry);
    $('noticeKicker').textContent = TL.t('noticeTitle');
    $('noticeTitle').textContent = entry.title;
    $('noticeMeta').innerHTML = ['<span>' + escape(entry.date) + '</span>',
      '<span>v' + escape(entry.version) + '</span>',
      '<span>' + escape(TL.t('noticePosition', { i: index + 1, n: all.length })) + '</span>'].join('');

    const items = (entry.items || []).map(t => `<li>${escape(t)}</li>`).join('');
    $('noticeBody').innerHTML =
      `<p class="notice-summary">${escape(entry.summary)}</p>` +
      (items ? `<ul class="notice-items">${items}</ul>` : '') +
      (entry.note ? `<p class="notice-note">${escape(entry.note)}</p>` : '');
    $('noticeFoot').innerHTML =
      `<button type="button" class="notice-btn" data-notice-back>${escape(TL.t('noticeBack'))}</button>` +
      `<button type="button" class="notice-btn primary" data-notice-close>${escape(TL.t('close'))}</button>`;
    $('noticeBody').scrollTop = 0;
    writeSeen([entry.id]);
  }

  function fillAll() {
    const all = entries();
    const seenAll = all.map(e => e.id);
    $('noticeKicker').textContent = TL.t('noticeTitle');
    $('noticeTitle').textContent = TL.t('noticeAllTitle');
    $('noticeMeta').innerHTML = `<span>${escape(TL.t('noticeCount', { n: all.length }))}</span>` +
      `<span>${escape(TL.t('noticeHint'))}</span>`;
    $('noticeBody').innerHTML = `<div class="notice-list flat">${all.map((e, i) => rowHtml(e, i, seenAll)).join('')}</div>` +
      `<p class="notice-footnote">${escape(TL.t('noticeScope'))}</p>`;
    $('noticeFoot').innerHTML = `<button type="button" class="notice-btn primary" data-notice-close>${escape(TL.t('close'))}</button>`;
    $('noticeBody').scrollTop = 0;
    writeSeen(seenAll);
  }

  function showDetail(id) {
    const entry = entries().filter(e => e.id === id)[0];
    if (!entry) { fillAll(); return; }
    fillDetail(entry);
    $('noticeClose').focus({ preventScroll: true });
  }

  function openNotice(id) {
    const el = $('notice');
    if (!el) return;
    if (!open) returnFocus = document.activeElement;
    open = true;
    if (id) showDetail(id); else fillAll();
    el.hidden = false;
    // 弹窗开着的时候，背后的首页对键盘和读屏都不可达
    if ($('start')) $('start').inert = true;
    $('noticeClose').focus({ preventScroll: true });
  }

  function closeNotice() {
    const el = $('notice');
    if (!el || !open) return;
    open = false;
    el.hidden = true;
    if ($('start')) $('start').inert = false;

    // 通讯板要重画（「新」标记已经消掉），所以先把焦点目标记下来再重画
    const backId = returnFocus && returnFocus.dataset ? returnFocus.dataset.noticeId : '';
    returnFocus = null;
    TL.renderNoticeBoard();

    let target = null;
    if (backId) {
      const rows = $('noticeList').querySelectorAll('[data-notice-id]');
      for (const row of rows) if (row.dataset.noticeId === backId) { target = row; break; }
    }
    (target || $('noticeAllBtn')).focus({ preventScroll: true });
  }

  TL.openNotice = openNotice;
  TL.closeNotice = closeNotice;

  /* --- 绑定 ------------------------------------------------------------- */
  TL.initNotice = function () {
    const board = $('noticeList'), allBtn = $('noticeAllBtn'), el = $('notice');
    const body = $('noticeBody'), foot = $('noticeFoot');
    if (!board || !allBtn || !el || !body || !foot) return;

    board.addEventListener('click', e => {
      const row = e.target.closest('[data-notice-id]');
      if (row) openNotice(row.dataset.noticeId);
    });
    allBtn.addEventListener('click', () => openNotice(null));
    $('noticeClose').addEventListener('click', closeNotice);

    // 弹窗内部的点击统一走事件委托：内容会被整段替换
    el.addEventListener('click', e => {
      if (e.target === el) { closeNotice(); return; }
      if (e.target.closest('[data-notice-close]')) { closeNotice(); return; }
      if (e.target.closest('[data-notice-back]')) { fillAll(); $('noticeClose').focus({ preventScroll: true }); return; }
      const row = e.target.closest('[data-notice-id]');
      if (row) showDetail(row.dataset.noticeId);
    });

    document.addEventListener('keydown', e => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); closeNotice(); return; }
      if (e.key !== 'Tab') return;
      // 弹窗打开时，Tab 只在弹窗里转，不回到底下的页面
      const box = $('noticeBox');
      const focusable = box.querySelectorAll('button');
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      const inside = box.contains(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    });
  };
})(window.TL = window.TL || {});
