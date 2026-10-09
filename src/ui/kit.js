// The pixel UI kit: carved oak frames with brass corner plates around leather,
// parchment and plank panels, wooden buttons and signs,
// item slots, tabs, scroll lists, bars, toggles, sliders, close buttons,
// tooltips, counters, ribbons, key caps and book pages.
//
// All art is painted in code (src/ui/kitart.js) on a native pixel grid and shown
// at an integer number of DEVICE pixels per art pixel, so pixels stay square and
// crisp on any screen. installKit() publishes the art as CSS variables
// (--k-panel-leather, --k-btn, ... see KIT_IMAGES) and keeps --u (CSS px per art
// pixel) up to date; after that plain classes from kit.css work anywhere:
//
//   <div class="k-panel">...</div>              gold-framed leather panel
//   <div class="k-panel k-parchment">           ...with a parchment page inside
//   <button class="k-btn">Ride</button>         chunky button (hover/.sel, :active/.down, :disabled)
//   <div class="k-slot"><img src=icon></div>    inventory slot (.sel, .empty, .locked)
//   <div class="k-ribbon">Title</div>           red ribbon banner
//   <div class="k-sign">Title</div>             wood-burned plank sign (menu titles)
//   <span class="k-key">E</span>                key cap
//
// Text uses the bundled pixel fonts at 16 * --u (their native size), with
// line-heights in even art pixels so baselines land on whole pixels.
import * as A from './kitart.js';
import { glyphURL } from '../art/icons.js';

// ---------------------------------------------------------------- scale
export const scale = { S: 2, u: 2, dpr: 1, offset: 0, cols: 0, rows: 0, compact: false, listeners: new Set() };

// device pixels per art pixel: big, chunky art pixels like a classic 2D pixel game.
// The short side of the screen is about 200-216 art pixels on phones (5 device
// pixels per art pixel on a 1080-wide phone, 6 on the big ones) and about 260-300
// on desktops (4 at 1080p, 5 at 1440p, 8 at 4K)
function computeScale() {
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth, H = window.innerHeight;
  const small = Math.min(W, H) < 520;
  const short = Math.min(W, H) * dpr;
  let S = small ? Math.floor(short / 204) : Math.floor(short / 260 + 0.3);
  S = Math.max(2, S + scale.offset);
  // never let the UI grid get smaller than 200 art pixels across the short side
  // (or 300 along a desktop's long side)
  while (S > 1 && (short / S < 200 || (!small && Math.max(W, H) * dpr / S < 300))) S--;
  S = Math.max(1, S);
  return { S, dpr, u: S / dpr, cols: Math.floor((W * dpr) / S), rows: Math.floor((H * dpr) / S), compact: small };
}

export function applyScale() {
  const s = computeScale();
  const changed = s.S !== scale.S || s.dpr !== scale.dpr || s.cols !== scale.cols || s.rows !== scale.rows;
  Object.assign(scale, s);
  const r = document.documentElement.style;
  r.setProperty('--u', `${s.u}px`);
  r.setProperty('--S', `${s.S}`);
  // the 48px food sprites sit in 24-art-pixel spots: show them at the biggest WHOLE
  // multiple of their own pixels that fits (24u is only a whole multiple when S is even)
  r.setProperty('--food', `${(s.S >= 2 ? Math.floor(s.S / 2) * 48 : 24) / s.dpr}px`);
  document.documentElement.classList.toggle('k-compact', s.compact);
  document.documentElement.classList.toggle('k-portrait', window.innerHeight > window.innerWidth * 1.15);
  if (changed) for (const f of scale.listeners) f(scale);
  queueSnap();
}
export function onScale(f) {
  scale.listeners.add(f);
  return () => scale.listeners.delete(f);
}
// player preference: -1 smaller, 0 auto, +1 / +2 bigger
export function setUIScaleOffset(k) {
  scale.offset = k | 0;
  applyScale();
}

// round a CSS length to whole device pixels
export const snap = (v) => Math.round(v * scale.dpr) / scale.dpr;
// keep an element's box (or, for a positioned one, the boxes inside it) on whole device pixels
export function snapBox(e) {
  if (!e?.isConnected) return;
  keepSnapped(e);
}

// ---------------------------------------------------------------- whole-device-pixel placement
// Anything centred by layout (flex/grid/margin centring, 50% offsets) lands on a
// half pixel whenever the free space is odd, which happens all the time when an art
// pixel is an odd number of device pixels (S = 3 on a 1080p monitor, S = 5 on many
// phones). Text there is drawn between pixels (soft, smeared glyphs).
// Registered elements are nudged with a relative left/top offset - a LAYOUT offset,
// never a transform: the browser snaps painted boxes to device pixels, but a
// fractional translate is applied after that snapping and smears every 9-slice
// frame (seams between the pieces, soft edges). The nudge is redone whenever they or
// their parent change size, the window resizes or the UI scale changes. Absolutely
// positioned elements keep their place (their boxes are snapped when painted); the
// text inside them is what gets nudged. Every centred piece of the kit registers
// itself (SNAP_SEL); anything else can add the class .k-snap or call keepSnapped().
const SNAP_SEL = '.overlay > *, .k-btn, .k-btn > .k-lbl, .k-btn > small, .k-sign > span, .k-ribbon > span, .k-tab > span, .hud-prompt > *, .t-talk > *, .title-menu, .logo, .k-snap';
const snapped = new Map(); // element -> the parent observed with it
const watchedParents = new Map(); // parent -> how many registered children
let snapRO = null, snapMO = null, snapRaf = 0;
function queueSnap() {
  if (!snapRaf && snapped.size) snapRaf = requestAnimationFrame(snapAll);
}
function snapAll() {
  snapRaf = 0;
  const list = [];
  for (const [e, p] of snapped) {
    if (e.isConnected) { list.push(e); continue; }
    // gone (a closed menu): stop watching it
    snapped.delete(e);
    snapRO.unobserve(e);
    const n = (watchedParents.get(p) || 1) - 1;
    if (n > 0) watchedParents.set(p, n);
    else if (p) { watchedParents.delete(p); if (!snapped.has(p)) snapRO.unobserve(p); }
  }
  if (!list.length) return;
  // one style write, one layout read, one write: ancestors are corrected first and
  // their shift carried down to the elements inside them
  for (const e of list) if (e._snap) { e.style.left = e.style.top = ''; e._snap = 0; }
  list.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const pos = list.map((e) => getComputedStyle(e).position);
  const rects = list.map((e) => e.getBoundingClientRect());
  const shift = new Map();
  list.forEach((e, i) => {
    let ax = 0, ay = 0;
    for (let p = e.parentElement; p; p = p.parentElement) {
      const s = shift.get(p);
      if (s) { [ax, ay] = s; break; }
    }
    const r = rects[i];
    if ((!r.width && !r.height) || (pos[i] !== 'static' && pos[i] !== 'relative')) return;
    const x = r.left + ax, y = r.top + ay;
    let fx = snap(x) - x, fy = snap(y) - y;
    if (Math.abs(fx) < 0.01) fx = 0;
    if (Math.abs(fy) < 0.01) fy = 0;
    shift.set(e, [ax + fx, ay + fy]);
    if (fx || fy) {
      if (pos[i] === 'static') e.style.position = 'relative';
      e.style.left = `${fx}px`;
      e.style.top = `${fy}px`;
      e._snap = 1;
    }
  });
}
export function keepSnapped(e) {
  if (!e) return e;
  // a positioned box keeps its place; snap what is inside it
  const cs = e.isConnected ? getComputedStyle(e).position : '';
  if (cs === 'absolute' || cs === 'fixed') {
    for (const c of e.children) keepSnapped(c);
    return e;
  }
  if (!snapRO) snapRO = new ResizeObserver(queueSnap);
  if (!snapped.has(e)) {
    const p = e.parentElement;
    snapped.set(e, p);
    snapRO.observe(e);
    if (p) {
      watchedParents.set(p, (watchedParents.get(p) || 0) + 1);
      snapRO.observe(p);
    }
  }
  queueSnap();
  return e;
}
// watch the page for kit pieces that need it (menus, signs, buttons, the HUD)
function watchSnaps() {
  if (snapMO || typeof MutationObserver === 'undefined') return;
  const add = (n) => {
    if (n.nodeType !== 1) return;
    if (n.matches(SNAP_SEL)) keepSnapped(n);
    if (n.firstElementChild) for (const e of n.querySelectorAll(SNAP_SEL)) keepSnapped(e);
  };
  snapMO = new MutationObserver((recs) => {
    for (const r of recs) for (const n of r.addedNodes) add(n);
  });
  snapMO.observe(document.body, { childList: true, subtree: true });
  add(document.body);
}

// ---------------------------------------------------------------- art -> CSS variables
function url(p) {
  const c = document.createElement('canvas');
  c.width = p.w;
  c.height = p.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  return c.toDataURL();
}
export const KIT_IMAGES = {
  'panel-leather': () => A.panelArt('leather'),
  'panel-parchment': () => A.panelArt('parchment'),
  'panel-dark': () => A.panelArt('dark'),
  'panel-wood': () => A.panelArt('wood'),
  'panel-cork': () => A.panelArt('cork', { ornate: false }),
  'plate-leather': () => A.plateArt('leather'),
  'plate-parchment': () => A.plateArt('parchment'),
  'plate-dark': () => A.plateArt('dark'),
  'plate-paper': () => A.plateArt('paper', { rivets: false }),
  'plate-cream': () => A.plateArt('cream', { rivets: false }),
  'paper-note': () => A.paperArt('note'),
  'paper-news': () => A.paperArt('news'),
  btn: () => A.buttonArt('normal'),
  'btn-hover': () => A.buttonArt('hover'),
  'btn-down': () => A.buttonArt('pressed'),
  'btn-off': () => A.buttonArt('disabled'),
  'btn-red': () => A.buttonArt('normal', 'red'),
  'btn-red-hover': () => A.buttonArt('hover', 'red'),
  'btn-green': () => A.buttonArt('normal', 'green'),
  'btn-green-hover': () => A.buttonArt('hover', 'green'),
  slot: () => A.slotArt('filled'),
  'slot-sel': () => A.slotArt('selected'),
  'slot-empty': () => A.slotArt('empty'),
  'slot-lock': () => A.slotArt('locked'),
  'slot-s': () => A.slotArt('filled', 30),
  'slot-s-sel': () => A.slotArt('selected', 30),
  tab: () => A.tabArt(false),
  'tab-on': () => A.tabArt(true),
  'well-dark': () => A.wellArt('dark'),
  'well-parchment': () => A.wellArt('parchment'),
  'well-leather': () => A.wellArt('leather'),
  thumb: () => A.thumbArt(),
  bar: () => A.barArt(),
  ribbon: () => A.ribbonArt(),
  'ribbon-green': () => A.ribbonArt(A.RAMP.green),
  'ribbon-blue': () => A.ribbonArt(A.RAMP.blue),
  key: () => A.keyArt(false),
  'key-hot': () => A.keyArt(true),
  tip: () => A.tipArt(),
  'tip-tail': () => A.tipTailArt(),
  'page-l': () => A.pageArt('l'),
  'page-r': () => A.pageArt('r'),
  'toggle-off': () => A.toggleArt(false),
  'toggle-on': () => A.toggleArt(true),
  knob: () => A.knobArt(false),
  'knob-hot': () => A.knobArt(true),
  close: () => A.closeArt(false),
  'close-hot': () => A.closeArt(true),
  sign: () => A.signArt(),
  'sign-green': () => A.signArt([0xc8f08a, 0x8ed056, 0x58a63a, 0x2f6e2c, 0x1b4220, 0x0e2a12]),
  strap: () => A.strapArt(),
  buckle: () => A.buckleArt(),
  // the spiral notebook and the HUD clipboard
  'nb-paper': () => A.nbPaperArt(),
  'nb-spiral': () => A.spiralArt('v'),
  'nb-coil': () => A.spiralArt('top'),
  'nb-pencil': () => A.pencilArt(),
  'nb-stain': () => A.stainArt(),
  'nb-tape': () => A.tapeArt(),
  'nb-box': () => A.nbBoxArt('box'),
  'nb-check': () => A.nbBoxArt('check'),
  'nb-tick': () => A.nbBoxArt('tick'),
  ...Object.fromEntries(A.DOODLES.map((d) => [`dd-${d}`, () => A.doodleArt(d)])),
  clipboard: () => A.clipboardArt(),
  clip: () => A.clipArt(),
};
const KIT_GLYPHS = ['box', 'boxOn', 'boxX', 'check', 'cross', 'hand', 'arrowR', 'arrowL', 'arrowU', 'arrowD', 'heart', 'lock', 'star', 'coin', 'pin', 'medalB', 'medalS', 'medalG', 'medalNone', 'dot'];
const URLS = {};
export const kitURL = (name) => URLS[name] || (URLS[name] = url(KIT_IMAGES[name]()));

// what the HUD needs on the first frame; everything else is painted in idle time
// (or at once, the moment a menu opens: see kitReady)
const FIRST = ['plate-leather', 'plate-dark', 'plate-parchment', 'paper-note', 'paper-news', 'key', 'tip', 'tip-tail', 'panel-dark', 'panel-leather', 'bar', 'btn', 'btn-hover', 'ribbon', 'clipboard', 'clip', 'nb-paper', 'nb-coil', 'nb-box', 'nb-check', 'nb-tick'];
let installed = false, pending = [];
const put = (name) => document.documentElement.style.setProperty(`--k-${name}`, `url(${kitURL(name)})`);
export function kitReady() {
  while (pending.length) put(pending.shift());
}
export function installKit({ offset } = {}) {
  if (offset !== undefined) scale.offset = offset | 0;
  applyScale();
  if (installed) return;
  installed = true;
  watchSnaps();
  const r = document.documentElement.style;
  for (const name of FIRST) put(name);
  for (const g of KIT_GLYPHS) r.setProperty(`--g-${g}`, `url(${glyphURL(g)})`);
  pending = Object.keys(KIT_IMAGES).filter((n) => !FIRST.includes(n));
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 16));
  const work = (dl) => {
    while (pending.length && dl.timeRemaining() > 2) put(pending.shift());
    if (pending.length) idle(work);
  };
  idle(work);
  let raf = 0;
  const re = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(applyScale); };
  window.addEventListener('resize', re);
  window.matchMedia?.('(resolution: 1dppx)')?.addEventListener?.('change', re);
}

// ---------------------------------------------------------------- DOM helpers
export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// framed panel: kind = leather | parchment | dark | wood
export function kPanel(kind = 'leather', cls = '') {
  return el('div', `k-panel${kind !== 'leather' ? ` k-${kind}` : ''}${cls ? ` ${cls}` : ''}`);
}
// small plate: kind = leather | parchment | dark | paper | cream
export function kPlate(html = '', kind = 'leather', cls = '') {
  return el('div', `k-plate${kind !== 'leather' ? ` k-${kind}` : ''}${cls ? ` ${cls}` : ''}`, html);
}
// a wood-burned plank sign (menu titles); kind = oak | green
export function kSign(text, kind = '', cls = '') {
  return el('div', `k-sign k-bold${kind && kind !== 'oak' ? ` k-${kind}` : ''}${cls ? ` ${cls}` : ''}`, `<span>${text}</span>`);
}
export function kRibbon(text, color = 'red', cls = '') {
  return el('div', `k-ribbon${color !== 'red' ? ` k-${color}` : ''}${cls ? ` ${cls}` : ''}`, `<span>${text}</span>`);
}
export function kKey(label) {
  return `<span class="k-key">${esc(label)}</span>`;
}
// a button; face = leather | red | green. Returns the element (click handled by the caller or onClick)
export function kButton(label, onClick, { small = '', face = '', disabled = false, icon = '', cls = '' } = {}) {
  const b = el('button', `k-btn${face ? ` k-${face}` : ''}${cls ? ` ${cls}` : ''}`, `${icon ? `<img class="k-ico" src="${icon}">` : ''}<span class="k-lbl">${label}</span>${small ? `<small>${small}</small>` : ''}`);
  b.disabled = disabled;
  pressable(b);
  if (onClick) b.addEventListener('click', () => !b.disabled && onClick(b));
  return b;
}
// pointer press feedback that also works for touch (adds .down while held)
export function pressable(e) {
  const up = () => e.classList.remove('down');
  e.addEventListener('pointerdown', () => e.classList.add('down'));
  e.addEventListener('pointerup', up);
  e.addEventListener('pointerleave', up);
  e.addEventListener('pointercancel', up);
  return e;
}
export function kSlot(src, { state = '', title = '', badge = '', cls = '' } = {}) {
  const s = el('div', `k-slot${state ? ` ${state}` : ''}${cls ? ` ${cls}` : ''}`, `${src ? `<img src="${src}">` : ''}${badge ? `<span class="k-badge">${badge}</span>` : ''}`);
  if (title) s.title = title;
  return s;
}
export function kCount(n, cls = '') {
  return el('span', `k-count${cls ? ` ${cls}` : ''}`, esc(n));
}
// tabs: names -> buttons; onPick(i)
export function kTabs(names, onPick, active = 0) {
  const w = el('div', 'k-tabs');
  const tabs = names.map((n, i) => {
    const t = el('button', `k-tab${i === active ? ' on' : ''}`, `<span>${n}</span>`);
    t.addEventListener('click', () => set(i));
    w.appendChild(t);
    return t;
  });
  const set = (i) => {
    tabs.forEach((t, k) => t.classList.toggle('on', k === i));
    onPick?.(i);
  };
  w.set = set;
  w.tabs = tabs;
  return w;
}
// a length in % snapped down to whole art pixels (CSS round(); a plain % where unsupported)
export function setRounded(e, prop, pct) {
  e.style[prop] = pct;
  e.style[prop] = `round(down, ${pct}, var(--u))`;
}
// progress bar: kind = heat | grow | gold | blue ; set(v 0..1)
export function kBar(v = 0, kind = 'gold', cls = '') {
  const b = el('div', `k-bar k-${kind}${cls ? ` ${cls}` : ''}`, '<i></i>');
  const fill = b.firstChild;
  b.set = (x) => {
    const k = Math.max(0, Math.min(1, x));
    if (b._v === k) return;
    b._v = k;
    // whole art pixels only (round() where the browser has it)
    setRounded(fill, 'width', `${Math.round(k * 1000) / 10}%`);
  };
  b.set(v);
  return b;
}
// on/off lever
export function kToggle(on, onChange) {
  const t = el('button', `k-toggle${on ? ' on' : ''}`);
  t.setAttribute('aria-pressed', on ? 'true' : 'false');
  t.value = on;
  t.addEventListener('click', () => {
    t.value = !t.value;
    t.classList.toggle('on', t.value);
    t.setAttribute('aria-pressed', t.value ? 'true' : 'false');
    onChange?.(t.value);
  });
  t.nudge = () => t.click();
  return t;
}
// slider; nudge(dir) steps it (menus use left/right on the selected row)
export function kSlider(value, min, max, step, onChange) {
  const s = el('div', 'k-slider', '<div class="k-track"><i></i></div><div class="k-knob"></div>');
  const track = s.firstChild, fill = track.firstChild, knob = s.lastChild;
  let v = value;
  const draw = () => {
    const k = (v - min) / (max - min);
    setRounded(fill, 'width', `${k * 100}%`);
    setRounded(knob, 'left', `${k * 100}%`);
  };
  const set = (x, fire = true) => {
    x = Math.round((Math.max(min, Math.min(max, x)) - min) / step) * step + min;
    x = +x.toFixed(4);
    if (x === v) return;
    v = x;
    draw();
    if (fire) onChange?.(v);
  };
  const fromPointer = (e) => {
    const r = track.getBoundingClientRect();
    set(min + ((e.clientX - r.left) / r.width) * (max - min));
  };
  let id = null;
  s.addEventListener('pointerdown', (e) => { id = e.pointerId; s.setPointerCapture(id); s.classList.add('held'); fromPointer(e); e.preventDefault(); });
  s.addEventListener('pointermove', (e) => e.pointerId === id && fromPointer(e));
  const end = () => { id = null; s.classList.remove('held'); };
  s.addEventListener('pointerup', end);
  s.addEventListener('pointercancel', end);
  s.nudge = (d) => set(v + d * step);
  s.get = () => v;
  s.set = (x) => set(x, false);
  draw();
  return s;
}
export function kClose(onClick) {
  const b = el('button', 'k-close');
  b.setAttribute('aria-label', 'Close');
  pressable(b);
  b.addEventListener('click', () => onClick?.());
  return b;
}
export function kTip(html, cls = '') {
  return el('div', `k-tip${cls ? ` ${cls}` : ''}`, html);
}
// open book: returns { book, left, right }
export function kBook(cls = '') {
  const book = el('div', `k-book${cls ? ` ${cls}` : ''}`, '<div class="k-page k-l"></div><div class="k-spine"></div><div class="k-page k-r"></div>');
  return { book, left: book.children[0], right: book.children[2] };
}
// a list frame (scrolls inside a recessed well)
export function kList(kind = 'dark', cls = '') {
  return el('div', `k-list${kind !== 'dark' ? ` k-${kind}` : ''}${cls ? ` ${cls}` : ''}`);
}
