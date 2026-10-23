// Minimal DOM + runtime harness for rendering assertions.
//
// verify-reliability stubs every renderer out because it only exercises callbacks.
// Here the point is the opposite: load the *real* js/ui/render.js (and main.js) on
// a fake DOM, render a prepared life, and hand back the produced markup so a test
// can freeze it and prove that a refactor did not change what the player sees.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {simulation} from './sim-context.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

export function createUi({language = 'zh', reads = [], calls = null, boot = false, stub = [], search = ''} = {}) {
  const elements = new Map();
  const handlers = {};
  const events = {};
  const storage = new Map();
  const frames = [];
  // The birth screen drives its roll animation through setTimeout, so timers are a
  // queue the test can drain instead of waiting on real time.
  const timers = new Map();
  let timerSeq = 0;

  // Any 2D drawing call succeeds and returns a number: the harness asserts markup,
  // not pixels, and a canvas that threw would hide the DOM work behind it.
  const context2d = () => new Proxy({}, {
    get: (_target, key) => (typeof key === 'symbol' ? undefined : () => 0),
    set: () => true
  });

  const escapeHtml = text => String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  /**
   * Parse the (well-formed) markup the renderers generate into child nodes.
   *
   * `renderFeed` assigns `innerHTML` and then reaches into `.txt` to set the log
   * text, so storing the string alone would make `querySelector` blind. The
   * parser only has to understand what this codebase emits: elements with plain
   * attributes, text, and no void tags beyond `<br>`.
   */
  const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);
  const TOKEN = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>|([^<]+)/g;
  function parseHtml(html, parent) {
    const stack = [parent];
    let match;
    TOKEN.lastIndex = 0;
    while ((match = TOKEN.exec(html)) !== null) {
      const [, closing, tag, rawAttrs, selfClosing, text] = match;
      if (text !== undefined) {
        const target = stack[stack.length - 1];
        const piece = node('#text');
        piece.tagName = '#TEXT';
        piece.textContent = text;
        piece.parentNode = target;
        target.childNodes.push(piece);
        continue;
      }
      if (closing) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      const created = node(tag);
      created.rawAttrs = rawAttrs || '';
      const cls = /\bclass\s*=\s*"([^"]*)"/.exec(created.rawAttrs);
      if (cls) created.className = cls[1];
      const idAttr = /\bid\s*=\s*"([^"]*)"/.exec(created.rawAttrs);
      if (idAttr) created.id = idAttr[1];
      const target = stack[stack.length - 1];
      created.parentNode = target;
      target.childNodes.push(created);
      if (!selfClosing && !VOID.has(tag.toLowerCase())) stack.push(created);
    }
    return parent;
  }

  /**
   * A node with real children.
   *
   * The renderers are a mix of "assign innerHTML" and "append children"
   * (`renderFeed` builds the log incrementally). Both have to be observable, so a
   * node keeps a child list, serialises it when innerHTML was never assigned, and
   * supports the handful of tree operations the renderers actually use.
   */
  function node(tag = 'div', id = '') {
    const listeners = {};
    const classes = new Set();
    const attrs = {};
    const self = {
      tagName: tag.toUpperCase(), id, className: '', hidden: false, value: '',
      textContent: '', style: {}, dataset: {}, width: 0, height: 0, scrollTop: 0,
      childNodes: [], parentNode: null,
      getContext: context2d,
      getBoundingClientRect: () => ({width: 300, height: 150, top: 0, left: 0}),
      get children() { return self.childNodes.filter(child => child.tagName !== '#TEXT'); },
      get childElementCount() { return self.children.length; },
      get firstChild() {
        // `$('brand').firstChild.nodeValue = ...` writes into the static text node
        // that ships in index.html, so an empty element hands back a writable text
        // stand-in instead of null.
        if (self.childNodes.length === 0) {
          const placeholder = {tagName: '#TEXT', textContent: '', parentNode: self};
          Object.defineProperty(placeholder, 'nodeValue', {
            get: () => placeholder.textContent,
            set: value => { placeholder.textContent = String(value); }
          });
          self.childNodes.push(placeholder);
        }
        return self.childNodes[0] ?? null;
      },
      get lastChild() { return self.childNodes[self.childNodes.length - 1] ?? null; },
      get innerHTML() { return self.childNodes.map(render).join(''); },
      set innerHTML(value) {
        self.childNodes = [];
        const html = String(value);
        if (html) parseHtml(html, self);
      },
      get classList() {
        const sync = () => { self.className = [...classes].join(' '); };
        return {
          add: name => { classes.add(name); sync(); },
          remove: name => { classes.delete(name); sync(); },
          contains: name => classes.has(name),
          toggle(name, on) { if (on ?? !classes.has(name)) classes.add(name); else classes.delete(name); sync(); }
        };
      },
      addEventListener(name, fn) { listeners[name] = fn; },
      setAttribute(name, value) { attrs[name] = String(value); if (name === 'class') { self.className = String(value); } },
      removeAttribute(name) { delete attrs[name]; },
      focus() {},
      click() { listeners.click?.({target: self}); },
      appendChild(child) {
        if (child && child._fragment) {
          for (const inner of child.childNodes) { inner.parentNode = self; self.childNodes.push(inner); }
          child.childNodes = [];
          return child;
        }
        child.parentNode = self;
        self.childNodes.push(child);
        if (child.id) elements.set(child.id, child);
        return child;
      },
      insertBefore(child, reference) {
        const index = reference ? self.childNodes.indexOf(reference) : -1;
        child.parentNode = self;
        if (index < 0) self.childNodes.push(child);
        else self.childNodes.splice(index, 0, child);
        return child;
      },
      removeChild(child) {
        const index = self.childNodes.indexOf(child);
        if (index >= 0) self.childNodes.splice(index, 1);
        return child;
      },
      querySelectorAll(selector) {
        const match = matches(selector);
        const out = [];
        const walk = item => {
          for (const child of item.childNodes) {
            if (child.tagName !== '#TEXT' && match(child)) out.push(child);
            walk(child);
          }
        };
        walk(self);
        return out;
      },
      querySelector(selector) { return self.querySelectorAll(selector)[0] ?? null; }
    };
    return self;
  }

  const matches = selector => {
    if (!selector) return () => false;
    if (selector.startsWith('.')) {
      const name = selector.slice(1);
      return item => String(item.className).split(/\s+/).includes(name);
    }
    if (selector.startsWith('#')) {
      const target = selector.slice(1);
      return item => item.id === target;
    }
    const tag = selector.toUpperCase();
    return item => item.tagName === tag;
  };

  function render(item) {
    if (item.tagName === '#TEXT') return escapeHtml(item.textContent);
    const attrs = item.rawAttrs != null && item.rawAttrs !== ''
      ? ` ${item.rawAttrs}`
      : (item.className ? ` class="${item.className}"` : '');
    const inner = item.childNodes.map(render).join('')
      + (item.childNodes.length === 0 ? escapeHtml(item.textContent) : '');
    return `<${item.tagName.toLowerCase()}${attrs}>${inner}</${item.tagName.toLowerCase()}>`;
  }

  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const created = node('div', id);
    elements.set(id, created);
    return created;
  }

  const app = simulation(
    {log() {}, warn() {}, error(...args) { throw new Error(args.map(String).join(' ')); }},
    {storage: () => ({
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: key => storage.delete(key)
    })});

  const TL = app.TL;
  TL.UI = {auto: false};
  TL.$ = element;

  const document = {
    readyState: 'loading', title: 'Test', body: element('body'),
    getElementById: element,
    createElement: tag => node(tag),
    createDocumentFragment() {
      const fragment = node('#fragment');
      fragment._fragment = true;
      return fragment;
    },
    createTextNode: text => {
      const created = node('#text');
      created.tagName = '#TEXT';
      created.textContent = String(text);
      return created;
    },
    querySelectorAll: () => [],
    querySelector: element,
    addEventListener: (name, fn) => { events[name] = fn; },
    documentElement: element('html')
  };
  app.window.addEventListener = (name, fn) => { handlers[name] = fn; };
  app.window.location = {search};
  app.window.navigator = {language: 'zh-CN'};
  Object.assign(app.context, {
    document,
    location: app.window.location,
    navigator: app.window.navigator,
    URLSearchParams,
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value)
    },
    requestAnimationFrame: fn => { frames.push(fn); return frames.length; },
    cancelAnimationFrame() {},
    setTimeout: (fn, ms) => { timerSeq += 1; timers.set(timerSeq, {fn, ms}); return timerSeq; },
    clearTimeout: id => { timers.delete(id); }
  });

  // The renderers read TL.locale / TL.lang, which main.js normally initialises.
  TL.setLocale(language === 'en' ? 'US' : 'CN', false);

  // Rendering is what this harness is for, so the renderers stay real; only the
  // screens we do not render here are neutralised.
  for (const name of reads) {
    vm.runInContext(read(name), app.context, {filename: name});
  }
  for (const name of stub) { if (TL[name]) TL[name] = () => {}; }
  if (boot) {
    // main.js owns the app wiring (start, loop, report screen); DOMContentLoaded is
    // what the browser would fire after all classic scripts are in place.
    events.DOMContentLoaded?.();
    if (frames.length) frames[frames.length - 1](0);
  }
  if (calls) calls({TL, app, element});

  return {
    TL,
    app,
    element,
    storage,
    frames,
    /** Advance one animation frame; main.js re-registers itself each frame. */
    tickFrame(ms = 650) {
      const next = frames[frames.length - 1];
      if (next) next(ms);
    },
    /** Drain pending timers, earliest first, at most `limit` of them. */
    runTimers(limit = 200) {
      let ran = 0;
      while (timers.size && ran < limit) {
        const [id, entry] = [...timers.entries()].sort((a, b) => a[1].ms - b[1].ms)[0];
        timers.delete(id);
        entry.fn();
        ran += 1;
      }
      return ran;
    },
    /** Render whatever the caller asks for and read back the produced markup. */
    snapshot(ids) {
      const out = {};
      for (const id of ids) {
        const node = element(id);
        out[id] = {
          html: node.innerHTML,
          text: node.textContent,
          class: typeof node.className === 'string' ? node.className : ''
        };
      }
      return out;
    }
  };
}
