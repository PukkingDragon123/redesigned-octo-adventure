// The menu screen: Hank's journal, opened flat in front of the game as a piece of pixel
// art (src/ui/bookart.js paints it on its own art-pixel grid; it is shown at a whole
// number of device pixels per art pixel, nearest-neighbour, never smoothed). The menu's
// pages are ordinary pixel-kit DOM (src/game/menus.js writes them) placed on whole art
// pixels over the painted paper. One page on a phone held upright, two side by side
// otherwise. Esc / Start / the X / a tap off the book closes it.
import './book.css';
import { el, scale, onScale, kitReady, kClose } from './kit.js';
import { bookGeom, bookArt, iconArt, toCanvas, BOOK } from './bookart.js';

export class BookUI {
  constructor(game) {
    this.g = game;
    this.ui = game.ui;
    this.sections = {};
    this.isOpen = false;
    this.cur = null;
    this.m = null;
    this.opts = {};
    const layer = (this.layer = el('div', 'bk-layer'));
    const book = (this.bookEl = el('div', 'bk'));
    this.art = el('canvas', 'bk-art');
    book.appendChild(this.art);
    this.pl = el('div', 'bk-page bk-l k-text');
    this.pr = el('div', 'bk-page bk-r k-text');
    book.append(this.pl, this.pr);
    this.xBtn = kClose(() => this.close());
    this.xBtn.classList.add('bk-x');
    this.xBtn.setAttribute('aria-label', 'Close the journal');
    book.appendChild(this.xBtn);
    layer.appendChild(book);
    // a click or tap off the book closes it
    layer.addEventListener('pointerdown', (e) => {
      if (e.target === layer && this.isOpen && !this.opts.noClose) this.close();
    });
    this.ui.root.appendChild(layer);
    this.layoutDirty = true;
    onScale(() => (this.layoutDirty = true));
    window.addEventListener('resize', () => (this.layoutDirty = true));
    this.makeIcon();
  }

  // ---------------------------------------------------------------- the little journal in the corner
  // (top left while riding: tap it for the menu, the same as Esc)
  makeIcon() {
    const g = this.g;
    const hit = (this.iconEl = el('button', 'jr-hit hide'));
    hit.setAttribute('aria-label', 'Menu');
    hit.appendChild(toCanvas(iconArt()));
    hit.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (this.iconOn()) { g.sound?.play('ui_click'); g.openMenu(() => g.menus.pause()); }
    });
    this.ui.root.appendChild(hit);
  }
  iconOn() {
    const g = this.g, ui = this.ui;
    return g.mode === 'ride' && !ui.menuStack.length && !ui.dialogueTick && !ui.hud?.classList.contains('hidden') && !this.isOpen && !g.compass3d?.fpOpen && !(g.compass3d?.fpK > 0.05);
  }

  // a section: { build(L, R, ctx) -> { items, onBack } }
  register(id, def) {
    this.sections[id] = def;
  }

  // ---------------------------------------------------------------- open / turn / close
  // opts: onClose (once the book is shut), home (the section Back returns to), noClose
  open(id, opts = {}) {
    if (this.isOpen) {
      if (opts.onClose) {
        const prev = this.opts.onClose;
        this.opts.onClose = () => { prev?.(); opts.onClose(); };
      }
      this.go(id);
      return this.m;
    }
    this.isOpen = true;
    kitReady();
    this.opts = { ...opts };
    this.layoutDirty = true;
    this.m = { ov: this.layer, items: [], sel: 0, onBack: () => this.close(), book: true };
    this.ui.menuStack.push(this.m);
    this.layer.classList.add('on');
    this.layout();
    // whatever Hank was saying out on the road ducks out of the way
    this.ui.popups?.layer?.querySelectorAll('.pop').forEach((e) => e.classList.add('bk-hide'));
    this.xBtn.style.display = this.opts.noClose ? 'none' : '';
    this.fill(id);
    this.title = document.getElementById('title3d');
    if (this.title) this.title.style.visibility = 'hidden';
    this.g.sound?.play('book_open');
    return this.m;
  }
  // turn to another section
  go(id) {
    if (!this.isOpen || id === this.cur || !this.sections[id]) return;
    this.g.sound?.play('page_flip');
    this.fill(id);
    // a one-frame page turn: the paper blinks over in whole steps
    this.bookEl.classList.remove('turn');
    void this.bookEl.offsetWidth;
    this.bookEl.classList.add('turn');
  }
  // Back from a section: to the contents if the book was opened there, else shut it
  back() {
    if (this.opts.home && this.cur !== this.opts.home) this.go(this.opts.home);
    else this.close();
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    const ui = this.ui;
    ui.menuStack = ui.menuStack.filter((x) => x !== this.m);
    ui.swallowInput();
    this.layer.classList.remove('on');
    if (this.title) this.title.style.visibility = '';
    this.g.sound?.play('book_close');
    const done = this.opts.onClose;
    this.opts = {};
    this.cur = null;
    this.pl.innerHTML = this.pr.innerHTML = '';
    done?.();
  }

  // write a section onto the pages
  fill(id) {
    const def = this.sections[id];
    if (!def) return;
    this.cur = id;
    const single = this.lay?.single;
    const L = el('div', 'bk-in'), R = el('div', 'bk-in');
    this.pl.innerHTML = this.pr.innerHTML = '';
    if (single) this.pr.append(L, R);
    else {
      this.pl.appendChild(L);
      this.pr.appendChild(R);
    }
    this.bookEl.dataset.s = id;
    const res = def.build(L, R, { book: this, go: (k) => this.go(k), back: () => this.back(), close: () => this.close(), single }) || {};
    const m = this.m;
    if (m) {
      m.items = res.items || [];
      m.sel = Math.max(0, Math.min(res.sel || 0, m.items.length - 1));
      m.onBack = res.onBack || (() => this.back());
      this.ui.highlight(m);
    }
    this.pl.scrollTop = this.pr.scrollTop = 0;
  }

  // ---------------------------------------------------------------- layout
  // everything in whole art pixels: the screen is scale.cols x scale.rows of them
  layout() {
    if (!this.layoutDirty) return;
    this.layoutDirty = false;
    const u = scale.u, cols = scale.cols, rows = scale.rows;
    const { b, s, rib } = BOOK;
    const room = rows - 2 * b - s - rib - 8; // the most page height there is
    let single = rows > cols * 1.05, pw, ph;
    if (!single) {
      ph = Math.min(room, 196);
      pw = Math.min(Math.round(ph * 0.82), Math.floor((cols - 8 - 2 * (b + s)) / 2), 172);
      if (pw < 132) single = true;
    }
    if (single) {
      pw = Math.min(cols - 2 * b - s - 3 - 10, 214);
      ph = Math.min(room - 14, Math.round(pw * 1.3));
    }
    const G = (this.geom = bookGeom(pw, ph, single));
    this.lay = { single };
    // the art, at exactly u CSS px (a whole number of device pixels) per art pixel
    toCanvas(bookArt(G), this.art);
    const px = (n) => `${n * u}px`;
    this.art.style.width = px(G.W);
    this.art.style.height = px(G.H);
    const ax = Math.floor((cols - G.cw) / 2), ay = Math.max(2, Math.floor((rows - G.H) / 2));
    Object.assign(this.bookEl.style, { left: px(ax), top: px(ay), width: px(G.W), height: px(G.H) });
    // the writing areas, inside each page's margins
    const put = (e, P) => {
      if (!P) { e.style.display = 'none'; return; }
      e.style.display = '';
      const inL = P.gut > 0 ? 9 : 10, inR = P.gut > 0 ? 10 : 9;
      Object.assign(e.style, { left: px(P.x + inL), top: px(P.y + 8), width: px(P.w - inL - inR), height: px(P.h - 15) });
    };
    put(this.pl, single ? null : G.pages[0]);
    put(this.pr, G.pages[G.pages.length - 1]);
    this.layer.classList.toggle('single', single);
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
  }
}
