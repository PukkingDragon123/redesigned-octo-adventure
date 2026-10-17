// The book every screen lives in. Opening a menu (Esc, the little journal in the corner,
// Nana's order book, Mo's shop list, the settings...) takes the camera into Hank's skull
// (view3d.js FirstPerson) while his bony hands lift a leather-bound journal into view
// (book3d.js). The front cover swings open and the menu's two pages are written onto
// the paper: they are ordinary pixel-kit DOM (menus.js builds them), laid out at
// exactly the size of the book's flat writing areas and pinned on them each frame with
// a projective transform (matrix3d), which comes down to a plain whole-pixel translate
// once the book is held still and square, so the pixel fonts stay crisp. Bookmark tabs
// down the fore-edge switch sections (Tab / [ ] / PgUp PgDn / LB RB too) with a page
// turning over; clicks and touches land on the pages themselves; Esc or the X closes it.
import * as THREE from 'three';
import './book.css';
import { el, scale, onScale, snap, kitReady } from './kit.js';
import { Book3D } from './book3d.js';
import { iconSmallURL } from '../art/icons.js';
import { input } from '../core/input.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// a CSS matrix3d taking a w x h box onto a quad (tl, tr, br, bl), transform-origin 0 0
function homography(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  let g = 0, hh = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-9) return null;
    g = (sx * dy2 - dx2 * sy) / den;
    hh = (dx1 * sy - sx * dy1) / den;
  }
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  // unit square -> box
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  if (m.some((v) => !Number.isFinite(v))) return null;
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`;
}

export class BookUI {
  constructor(game, view) {
    this.g = game;
    this.ui = game.ui;
    this.view = view;
    this.b3 = new Book3D(view);
    this.sections = {};
    this.order = [];
    this.isOpen = false;
    this.cur = null;
    this.m = null;
    this.opts = {};
    const layer = (this.layer = el('div', 'bk-layer'));
    const page = (side) => {
      const p = el('div', `bk-page bk-${side} k-text`);
      const c = el('div', 'bk-c');
      p.appendChild(c);
      layer.appendChild(p);
      return { p, c };
    };
    this.pl = page('l');
    this.pr = page('r');
    this.tabsEl = el('div', 'bk-tabs');
    this.pr.p.appendChild(this.tabsEl);
    this.xBtn = el('button', 'k-close bk-x');
    this.xBtn.setAttribute('aria-label', 'Close the book');
    this.xBtn.addEventListener('click', (e) => { e.stopPropagation(); this.close(); });
    this.pr.p.appendChild(this.xBtn);
    // a click or tap off the book closes it (on the book's margins it doesn't)
    layer.addEventListener('pointerdown', (e) => {
      if (e.target !== layer || !this.isOpen || !this.b3.settled) return;
      const b = this.bounds;
      if (b && e.clientX > b.l && e.clientX < b.r && e.clientY > b.t && e.clientY < b.b) return;
      this.close();
    });
    this.ui.root.appendChild(layer);
    this.layoutDirty = true;
    onScale(() => { this.layoutDirty = true; this._iconBox = null; });
    window.addEventListener('resize', () => { this.layoutDirty = true; this._iconBox = null; });
    this.makeIcon();
  }

  // ---------------------------------------------------------------- the little journal in the corner
  // (top left: tap it for the journal, the same as Esc)
  makeIcon() {
    const b = this.b3, g = this.g;
    const root = new THREE.Group();
    const W = 0.1, H = 0.136, D = 0.03;
    const board = new THREE.BoxGeometry(W, H, 0.004);
    const edge = b.leatherEdge;
    const front = new THREE.Mesh(board, [edge, edge, edge, edge, b.front, b.endpaper]);
    front.position.z = D / 2 - 0.002;
    const back = new THREE.Mesh(board, [edge, edge, edge, edge, b.endpaper, b.leather]);
    back.position.z = -D / 2 + 0.002;
    const pages = new THREE.Mesh(new THREE.BoxGeometry(W - 0.007, H - 0.008, D - 0.007), [b.edgeMat, edge, b.edgeMat, b.edgeMat, b.paperMat, b.paperMat]);
    pages.position.x = 0.002;
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.006, H, D), edge);
    spine.position.x = -W / 2 + 0.001;
    const rib = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.05), b.ribbonMat);
    rib.position.set(-0.02, -H / 2 - 0.018, 0.004);
    const inner = new THREE.Group();
    inner.add(front, back, pages, spine, rib);
    root.add(inner);
    root.visible = false;
    this.view.corner.add(root);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 3);
    cam.position.set(0, 0.0, 0.33);
    cam.lookAt(0, -0.006, 0);
    const hit = (this.iconEl = el('button', 'jr-hit hide'));
    hit.setAttribute('aria-label', "Hank's journal");
    hit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.iconOn()) { g.sound?.play('ui_click'); g.openMenu(() => g.menus.pause()); }
    });
    hit.addEventListener('pointerenter', () => (this.iconHover = 1));
    hit.addEventListener('pointerleave', () => (this.iconHover = 0));
    this.ui.root.appendChild(hit);
    let t = 0, hv = 0;
    this.view.widgets.push({
      root, cam,
      box: () => {
        if (!this._iconBox) { const r = hit.getBoundingClientRect(); this._iconBox = { left: r.left, top: r.top, width: r.width, height: r.height }; }
        return this._iconBox;
      },
      visible: () => this.iconOn(),
      update: (dt) => {
        t += dt;
        hv += ((this.iconHover || 0) - hv) * (1 - Math.exp(-dt * 10));
        // a slow turn on its corner, and it leans out when the pointer is over it
        inner.rotation.set(-0.18 + Math.sin(t * 0.9) * 0.04 - hv * 0.2, 0.42 + Math.sin(t * 0.55) * 0.14 - hv * 0.3, 0.06);
        inner.position.y = Math.sin(t * 1.3) * 0.003;
      },
    });
  }
  iconOn() {
    const g = this.g, ui = this.ui;
    return g.mode === 'ride' && !ui.menuStack.length && !ui.dialogueTick && !ui.hud?.classList.contains('hidden') && !this.isOpen && !this.b3.visible() && !g.compass3d?.fpOpen && !(g.compass3d?.fpK > 0.05);
  }

  // a section: { title, icon, build(L, R, ctx) -> { items, grid, onBack } }
  register(id, def) {
    this.sections[id] = def;
    if (!this.order.includes(id)) this.order.push(id);
  }

  // ---------------------------------------------------------------- open / turn / close
  // opts: onClose (once the book is shut), tabs (section ids along the fore-edge, or
  // false), fp (go first person: default true), noClose (no X: a page that must be answered)
  open(id, opts = {}) {
    if (this.isOpen) {
      // already in the book: just turn to it (the first opener's onClose still stands,
      // a later one runs too)
      if (opts.onClose) {
        const prev = this.opts.onClose;
        this.opts.onClose = () => { prev?.(); opts.onClose(); };
      }
      this.go(id);
      return this.m;
    }
    this.isOpen = true;
    kitReady(); // (the rest of the kit's art: buttons, levers...)
    this.opts = { fp: true, tabs: null, ...opts };
    this.tabs = this.opts.tabs === false ? [] : this.opts.tabs || this.order.filter((k) => !this.sections[k].hidden);
    if (!this.tabs.includes(id) && this.tabs.length) this.tabs = [...this.tabs];
    this.layoutDirty = true;
    this.layout();
    const ui = this.ui;
    this.m = { ov: this.layer, items: [], sel: 0, onBack: () => this.close(), grid: 0, book: true };
    ui.menuStack.push(this.m);
    this.layer.classList.add('on');
    // whatever Hank was saying out on the road ducks out of the way of the pages
    this.ui.popups?.layer?.querySelectorAll('.pop').forEach((e) => e.classList.add('bk-hide'));
    this.xBtn.style.display = this.opts.noClose ? 'none' : '';
    this.fill(id);
    this.b3.show();
    // into his skull when the camera is following him; over a cutscene's shot (the
    // breakfast table, the receipt at bedtime) the book just comes up in front of it
    if (this.opts.fp && this.g.chase?.mode === 'chase') this.view.fp.enter({ pitch: -0.14, fov: 56 });
    this.title = document.getElementById('title3d');
    if (this.title) this.title.style.visibility = 'hidden';
    this.g.sound?.play('book_open');
    return this.m;
  }
  // turn to another section (dir: +1 forward, -1 back; worked out from the tabs if left out)
  go(id, dir = 0) {
    if (!this.isOpen || id === this.cur || !this.sections[id]) return;
    if (!dir) {
      const a = this.tabs.indexOf(this.cur), b = this.tabs.indexOf(id);
      dir = a < 0 || b < 0 ? 1 : b > a ? 1 : -1;
    }
    this.g.sound?.play('page_flip');
    this.flipT = 0;
    this.flipDir = dir;
    this.b3.turn(dir, () => this.fill(id));
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    const ui = this.ui;
    this.cur && this.sections[this.cur]?.leave?.();
    ui.menuStack = ui.menuStack.filter((x) => x !== this.m);
    ui.swallowInput();
    this.layer.classList.remove('on');
    this.b3.hide();
    this.view.fp.exit();
    if (this.title) this.title.style.visibility = '';
    this.g.sound?.play('book_close');
    const done = this.opts.onClose;
    this.opts = {};
    this.cur = null;
    done?.();
  }

  // write a section onto the pages
  fill(id) {
    const def = this.sections[id];
    if (!def) return;
    if (this.cur && this.cur !== id) this.sections[this.cur]?.leave?.();
    this.cur = id;
    const L = el('div', 'bk-in bk-inl'), R = el('div', 'bk-in bk-inr');
    const single = this.lay?.single;
    this.pl.c.innerHTML = '';
    this.pr.c.innerHTML = '';
    if (single) this.pr.c.append(L, R);
    else {
      this.pl.c.appendChild(L);
      this.pr.c.appendChild(R);
    }
    this.pl.p.dataset.s = this.pr.p.dataset.s = id;
    const res = def.build(L, R, { book: this, go: (k) => this.go(k), close: () => this.close(), single }) || {};
    const m = this.m;
    if (m) {
      m.items = res.items || [];
      m.grid = res.grid || 0;
      m.sel = clamp(res.sel || 0, 0, Math.max(0, m.items.length - 1));
      m.onBack = res.onBack || (() => this.close());
      this.ui.highlight(m);
    }
    this.pl.c.scrollTop = this.pr.c.scrollTop = 0;
    this.buildTabs();
  }
  buildTabs() {
    const T = this.tabsEl;
    T.innerHTML = '';
    this.b3.setTabs(this.tabs.length, this.tabs.indexOf(this.cur));
    this.tabBtns = this.tabs.map((k) => {
      const d = this.sections[k];
      const b = el('button', `bk-tab${k === this.cur ? ' on' : ''}`, `<img src="${iconSmallURL(d.icon || 'star')}" alt="">`);
      b.title = d.title;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.go(k); });
      T.appendChild(b);
      return b;
    });
  }

  // ---------------------------------------------------------------- layout
  // the page boxes in art pixels: two pages side by side on a wide screen, one page (the
  // book slid over so the right-hand page is in front of him) on a tall one
  layout() {
    if (!this.layoutDirty) return;
    this.layoutDirty = false;
    const R = this.view.rect(), u = scale.u;
    const cols = Math.floor(R.width / u), rows = Math.floor(R.height / u);
    const portrait = R.height > R.width * 1.05;
    let single = portrait, pageH, pageW;
    const tabsW = (h) => Math.round(h * 0.135); // the tabs past the board, in art px
    if (!single) {
      pageH = Math.min(rows - 40, 320);
      pageW = Math.round(pageH * 0.8);
      const need = (w, h) => w * 2 * 1.075 + tabsW(h) + h * 0.12;
      if (need(pageW, pageH) > cols - 6) pageW = Math.floor((cols - 6 - tabsW(pageH) - pageH * 0.12) / 2.15);
      if (pageW < 130) single = true;
    }
    if (single) {
      pageW = Math.min(cols - 12, 260);
      pageW = Math.floor(pageW - tabsW(pageW * 1.4) - 4);
      pageH = Math.min(rows - 40, Math.round(pageW * 1.75));
    }
    pageW = Math.max(60, pageW);
    pageH = Math.max(80, pageH);
    // centre the book with its tabs on the screen
    const cx = R.width / 2 - (tabsW(pageH) * u) / 2, cy = R.height / 2 + (single ? 4 * u : 2 * u);
    this.lay = { pageW: pageW * u, pageH: pageH * u, cx, cy, single, W: R.width, H: R.height, aw: pageW, ah: pageH };
    for (const P of [this.pl, this.pr]) {
      P.p.style.width = `${pageW * u}px`;
      P.p.style.height = `${pageH * u}px`;
    }
    this.layer.classList.toggle('single', single);
    this.b3.layout(this.lay);
    // re-write the pages for the new shape
    if (this.isOpen && this.cur) {
      const c = this.cur;
      this.cur = null;
      this.fill(c);
    }
  }

  // ---------------------------------------------------------------- per frame
  update() {
    if (this.isOpen) this.layout();
    const ic = this.iconOn();
    if (this.iconEl.classList.contains('hide') === ic) this.iconEl.classList.toggle('hide', !ic);
    // keyboard / pad: the bookmarks
    if (this.isOpen && this.ui.menuStack[this.ui.menuStack.length - 1] === this.m && this.tabs.length > 1 && !this.b3.flipping) {
      const i = this.tabs.indexOf(this.cur);
      if (input.pressed('tabNext')) this.go(this.tabs[(i + 1) % this.tabs.length], 1);
      else if (input.pressed('tabPrev')) this.go(this.tabs[(i - 1 + this.tabs.length) % this.tabs.length], -1);
    }
  }
  // after the book moved this frame: pin the pages on the paper
  place() {
    const b = this.b3;
    if (!b.visible() || !this.lay) {
      this.pl.p.style.visibility = this.pr.p.style.visibility = 'hidden';
      return;
    }
    const R = this.view.rect();
    const shut = 1 - b.open;
    const f = b.flip;
    // a turning page hides the writing until it has passed (forward: the right page is
    // uncovered half way, the left once it lands; back: the other way round)
    let showL = shut < 0.45 && b.lift > 0.9, showR = shut < 0.5 && b.lift > 0.9;
    if (f) {
      const early = f.t > 0.55, done = f.t >= 0.98;
      if (f.dir > 0) { showR = showR && early; showL = showL && done; }
      else { showL = showL && early; showR = showR && done; }
    }
    if (this.lay.single) showL = false;
    this.pin(this.pl.p, showL ? b.quad('l') : null, R);
    this.pin(this.pr.p, showR ? b.quad('r') : null, R);
    this.layer.classList.toggle('live', b.settled && !f);
    // the tabs follow their 3D slabs
    if (showR && this.tabBtns) {
      const boxes = b.tabBoxes();
      this.tabBtns.forEach((t, i) => {
        const x = boxes[i];
        if (!x) return;
        t.style.left = `${snap(x.left)}px`;
        t.style.top = `${snap(x.top)}px`;
        t.style.width = `${snap(x.width)}px`;
        t.style.height = `${snap(x.height)}px`;
        t.classList.toggle('on', this.tabs[i] === this.cur);
      });
    }
    // the book's outline on screen (clicks inside it don't close it)
    const ql = b.quad('l'), qr = b.quad('r');
    if (ql && qr) {
      const xs = [...ql, ...qr].map((p) => p[0]), ys = [...ql, ...qr].map((p) => p[1]);
      const pad = this.lay.pageW * 0.12;
      this.bounds = { l: R.left + Math.min(...xs) - pad, r: R.left + Math.max(...xs) + pad * 1.6, t: R.top + Math.min(...ys) - pad, b: R.top + Math.max(...ys) + pad };
    }
  }
  pin(e, q, R) {
    if (!q) {
      if (e.style.visibility !== 'hidden') e.style.visibility = 'hidden';
      e.classList.remove('shown');
      return;
    }
    const w = this.lay.pageW, h = this.lay.pageH;
    const ox = R.left, oy = R.top;
    const Q = q.map(([x, y]) => [x + ox, y + oy]);
    // held still and square: a whole-device-pixel translate (crisp pixel fonts)
    const square = Math.abs(Q[1][1] - Q[0][1]) < 0.35 && Math.abs(Q[3][0] - Q[0][0]) < 0.35 &&
      Math.abs(Q[1][0] - Q[0][0] - w) < 0.6 && Math.abs(Q[3][1] - Q[0][1] - h) < 0.6 && Math.abs(Q[2][0] - Q[1][0]) < 0.35;
    let tf;
    if (square) tf = `translate(${snap(Q[0][0])}px, ${snap(Q[0][1])}px)`;
    else tf = homography(w, h, Q);
    if (!tf) { e.style.visibility = 'hidden'; return; }
    if (e._tf !== tf) {
      e._tf = tf;
      e.style.transform = tf;
    }
    if (e.style.visibility !== 'visible') e.style.visibility = 'visible';
    if (!e.classList.contains('shown')) requestAnimationFrame(() => e.classList.add('shown'));
  }
}
