// Cutscene furniture: the letterbox bars, the narrator's parchment scroll and the little
// wooden skip tag (art: cineart.js, styles: cine.css).
//
// Everything sits on the kit's art-pixel grid (--u): the bars are a whole number of art
// pixels tall, the scroll is sized and placed in whole art pixels, every image is a
// pixel-art 9-slice drawn at a whole number of device pixels per art pixel with nearest
// filtering, and every motion is a steps() hop of whole art pixels. No blur, no soft
// shadows, no transforms.
//
// Skip: hold Esc (or Start, or a finger / the mouse on the tag) and the groove along the
// tag fills with gold; let go early and it drains (a quick tap only reminds you to hold).
import './cine.css';
import { plateArt, leafArt, arrowArt, tagArt, ffArt, PLATE, TAG } from './cineart.js';
import { el, scale, snap } from './kit.js';
import { artWidth } from './type.js';
import { input } from '../core/input.js';
import { sound } from '../game/sound.js';

const HOLD = 0.6; // seconds of holding to skip

let art = false;
function installArt() {
  if (art || typeof document === 'undefined') return;
  art = true;
  const url = (p) => {
    const c = document.createElement('canvas');
    c.width = p.w;
    c.height = p.h;
    c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
    return `url(${c.toDataURL()})`;
  };
  const r = document.documentElement.style;
  r.setProperty('--cn-plate', url(plateArt()));
  r.setProperty('--cn-leaf', url(leafArt()));
  r.setProperty('--cn-arrow', url(arrowArt()));
  r.setProperty('--cn-tag', url(tagArt(false)));
  r.setProperty('--cn-tag-hot', url(tagArt(true)));
  r.setProperty('--cn-ff', url(ffArt()));
}

// the letterbox bars' height in CSS px: about 9% of the screen, in whole art pixels, and
// never too thin for the skip tag
export function barH() {
  const u = scale.u;
  return Math.max(TAG.h + 6, Math.round((innerHeight * 0.09) / u)) * u;
}

// ---------------------------------------------------------------- the narrator's scroll
// how wide the typed words are in art px (bold runs are wider, and spaced a pixel a letter)
function wordsWidth(parts) {
  let w = 0, run = '', bold = false;
  const flush = () => { if (run) w += artWidth(run, bold) + (bold ? run.length : 0); run = ''; };
  for (const q of parts) {
    if (!!q.b !== bold) { flush(); bold = !!q.b; }
    run += q.ch === '\n' ? ' ' : q.ch;
  }
  flush();
  return w;
}
// A parchment scroll in the bottom bar (rising out of it when the words need more room):
// { root, text, next, fit } - bubbles.js types the words in and calls fit() each frame.
export function narratorPlate(ui, parts) {
  installArt();
  const root = el('div', 'cn-narr k-text');
  const text = el('div', 'cn-ntext');
  const next = el('i', 'cn-next');
  root.append(el('i', 'cn-seal'), text, next);
  let key = '';
  const fit = () => {
    const u = scale.u, W = innerWidth, H = innerHeight;
    const k = `${W}x${H}:${u}:${ui.root.classList.contains('letterbox')}`;
    if (k === key) return;
    key = k;
    // the width the words want (art px), balanced over as few lines as fit the screen
    const side = PLATE.l + PLATE.r + 6;
    const maxIn = Math.max(60, Math.min(330, scale.cols - 10 - side));
    // (measured as laid out once the words are in; the font's own metrics before that)
    let need = wordsWidth(parts) + 4;
    if (text.firstChild) {
      root.style.width = 'max-content';
      text.style.whiteSpace = 'nowrap';
      need = Math.ceil(text.getBoundingClientRect().width / u) + 2;
      text.style.whiteSpace = '';
    }
    const lines = Math.ceil(need / maxIn);
    const inner = Math.min(maxIn, Math.ceil(need / lines) + (lines > 1 ? 24 : 0));
    const w = inner + side;
    root.style.width = `${w * u}px`;
    root.style.setProperty('--cn-seal-x', `${(Math.floor(w / 2) - 6 - PLATE.l) * u}px`);
    root.style.left = `${snap(Math.round((W / u - w) / 2) * u)}px`;
    const h = Math.round(root.offsetHeight / u);
    const box = ui.root.classList.contains('letterbox') ? barH() / u : 0;
    const safeB = Math.ceil((parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--safe-b')) || 0) / u);
    // centred in the bottom bar when it fits there, else sitting low and reaching up out of it
    let y = box && h <= box - 2 - safeB ? H / u - box + Math.floor((box - safeB - h) / 2) : H / u - h - Math.max(4, safeB + 3);
    root.style.top = `${snap(Math.floor(y) * u)}px`;
  };
  return { root, text, next, fit, refit: () => { key = ''; fit(); } };
}

// ---------------------------------------------------------------- the skip tag + bars
export class CineUI {
  constructor(ui) {
    installArt();
    this.ui = ui;
    this.k = 0; // how far the hold has got (0..1)
    this.ptr = false;
    this.bar = 0;
    const t = (this.tag = el('button', 'cn-skip k-bold'));
    t.type = 'button';
    t.setAttribute('aria-label', 'Hold to skip the cutscene');
    t.innerHTML = '<span class="cn-lbl">skip</span><i class="cn-ff"></i><i class="cn-fill"></i>';
    this.fill = t.querySelector('.cn-fill');
    this.hint = el('div', 'cn-hint k-text');
    this.hint.innerHTML = '<span class="cn-hk">hold</span> <b>Esc</b>';
    const wrap = (this.wrap = el('div', 'cn-skipwrap'));
    wrap.append(this.hint, t);
    ui.root.appendChild(wrap);
    const down = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.ptr = true;
      this.pressT = performance.now();
      try { t.setPointerCapture(e.pointerId); } catch { /* (gone already) */ }
      sound.play('ui_hover');
    };
    const up = (e) => {
      e?.stopPropagation?.();
      if (!this.ptr) return;
      this.ptr = false;
      if (this.k < 1) this.nudge();
    };
    t.addEventListener('pointerdown', down);
    t.addEventListener('pointerup', up);
    t.addEventListener('pointercancel', up);
    t.addEventListener('lostpointercapture', () => { this.ptr = false; });
    t.addEventListener('click', (e) => e.stopPropagation());
    t.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  // a tap that let go too soon: the tag wiggles and the hint lights up
  nudge() {
    const w = this.wrap;
    w.classList.remove('nudge');
    void w.offsetWidth;
    w.classList.add('nudge');
    clearTimeout(this._nt);
    this._nt = setTimeout(() => w.classList.remove('nudge'), 1400);
  }
  update(dt) {
    const ui = this.ui, g = ui.game, root = ui.root;
    const box = root.classList.contains('letterbox');
    // keep the bars on the art grid
    const bh = box ? barH() : 0;
    if (bh !== this.bar) {
      this.bar = bh;
      const r = document.documentElement.style, u = scale.u;
      r.setProperty('--cn-bar', `${bh}px`);
      r.setProperty('--cn-skip-y', `${Math.floor((bh / u - TAG.h) / 2) * u}px`);
      ui.bubbles?.active?.fit && ui.bubbles.active.refit?.();
    }
    const sc = g.currentScene;
    const live = box && !!sc && !sc.skip;
    this.wrap.classList.toggle('on', live);
    if (this.touch !== root.classList.contains('touchmode')) {
      this.touch = root.classList.contains('touchmode');
      this.hint.innerHTML = this.touch ? '<span class="cn-hk">hold</span>' : '<span class="cn-hk">hold</span> <b>Esc</b>';
    }
    if (!live) {
      if (this.k || this._n) { this.k = 0; this.draw(); }
      this.ptr = false;
      return;
    }
    const key = input.down('pause');
    if (input.pressed('pause')) sound.play('ui_hover');
    if (this._key && !key && this.k < 1) this.nudge();
    this._key = key;
    const held = this.ptr || key;
    this.tag.classList.toggle('hot', held);
    this.k = held ? Math.min(1, this.k + dt / HOLD) : Math.max(0, this.k - dt * 3);
    if (this.k >= 1) {
      this.k = 0;
      this.ptr = this._key = false;
      sc.skip = true;
      ui.hideDialogue();
      sound.play('ui_click');
    }
    this.draw();
  }
  // the gold in the groove, in whole art pixels
  draw() {
    const groove = this.k > 0 ? Math.round(this.tag.offsetWidth / scale.u) - (TAG.w - (TAG.grooveX1 - TAG.grooveX0 + 1)) : 0;
    const n = Math.max(0, Math.round(this.k * groove));
    if (n === this._n) return;
    this._n = n;
    this.fill.style.width = `${n * scale.u}px`;
  }
}
