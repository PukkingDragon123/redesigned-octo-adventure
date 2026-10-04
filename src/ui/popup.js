// Pop-up messages: instead of toasts and banners, Hank (or whoever the message is
// really from) springs up from a bottom corner of the screen with a squash-and-
// stretch bounce, says it in a speech bubble with voice blips, then ducks back down.
//
//   ui.pop("Got *$12*! Plus a tip!", { expr: 'happy' })
//   ui.pop('WHEELIE!', { shout: true, key: 'trick' })      short, loud, merges with the next shout
//   ui.pop('Out of milk, dear!', { who: 'grandma' })        Nana pops up instead
//
// Options: who (character id, default hank), expr (face), key (a newer message with
// the same key replaces this one instead of queueing), shout (spiky bubble, no
// typing, short), ms (how long it stays after the text is out).
// Text markup: *bold*, ~wave~, ^shake^, _small_, and [W] for a key cap.
//
// Messages queue, never stack; they wait out cutscenes, dialogue and menus (shouts
// are simply dropped then). The portrait is the real voxel model, live in 3D
// (live3d.js): it blinks, talks and pulls faces while the message is up.
// Before each message the corner is chosen so nothing covers the touch controls or
// the HUD (Nana's list, the speedometer, the prompt).
import { sound } from '../game/sound.js';
import { LivePortrait } from './live3d.js';
import { frame, tail, tokenize, layoutText } from './bubbles.js';
import { BUBBLE_JOIN } from './kitart.js';
import { el, scale, snap } from './kit.js';

const ART = 56; // portrait size in art pixels
const HEAD = 14; // empty art rows above him for the stretch to grow into
const MAXQ = 6;
// things the pop-up must keep clear of
const OBSTACLES = '#touch.on .tbtn, #touch.on .twheel, #touch.on .t-talk.lit, .crank-hud.on, .hud-gauge, .hud-note, .hud-prompt.on, .hud-tl, .hud-compass';

// rise / duck keyframes: [t, y (fraction of the portrait, + is down), scaleX, scaleY]
const RISE = [[0, 1, 0.8, 1.25], [0.11, 0.3, 0.86, 1.18], [0.19, -0.1, 0.95, 1.07], [0.25, 0, 1.18, 0.82], [0.32, 0, 0.93, 1.07], [0.39, 0, 1.04, 0.96], [0.45, 0, 1, 1]];
const DUCK = [[0, 0, 1, 1], [0.07, 0, 1.12, 0.88], [0.13, -0.07, 0.93, 1.1], [0.3, 1.08, 0.88, 1.16]];
function keyAt(K, t) {
  if (t >= K[K.length - 1][0]) return K[K.length - 1];
  let i = 1;
  while (K[i][0] < t) i++;
  const a = K[i - 1], b = K[i], f = (t - a[0]) / (b[0] - a[0]);
  return [t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f, a[3] + (b[3] - a[3]) * f];
}

// strip the HTML that old toast() callers used down to bubble markup
export function htmlToMarkup(s) {
  return String(s)
    .replace(/<span class="key">([^<]*)<\/span>/g, '[$1]')
    .replace(/<\/?(b|strong)>/g, '*')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&middot;/g, '·').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

export class Popups {
  constructor(ui) {
    this.ui = ui;
    this.game = ui.game;
    this.layer = el('div', 'pop-layer');
    ui.root.appendChild(this.layer);
    this.queue = [];
    this.cur = null;
    this.t = 0;
    this.live = null;
    this.warmT = 1.5;
    addEventListener('resize', () => this.cur && (this.cur.placed = false));
  }

  // ---------------------------------------------------------------- queue
  push(text, opts = {}) {
    const m = {
      text: String(text), who: opts.who || 'hank', expr: opts.expr || (opts.shout ? 'shock' : 'happy'), key: opts.key || (opts.shout ? 'shout' : null),
      shout: !!opts.shout, ms: opts.ms, name: opts.name || '', voice: opts.voice || 'hank', born: this.t,
    };
    const c = this.cur;
    // same key (or any shout over a shout): replace what's up there right now
    if (c && c.state !== 'duck' && ((m.key && c.key === m.key) || (m.shout && c.shout)) && c.who === m.who) { this.swap(m); return; }
    if (c && c.state !== 'duck' && c.text === m.text) { c.hold = 0; return; }
    const q = this.queue.findIndex((x) => (m.key && x.key === m.key) || x.text === m.text);
    if (q >= 0) { m.born = Math.min(m.born, this.queue[q].born); this.queue[q] = m; return; }
    this.queue.push(m);
    while (this.queue.length > MAXQ) {
      const i = this.queue.findIndex((x) => x.shout);
      this.queue.splice(i >= 0 ? i : 0, 1);
    }
  }

  clear() {
    this.queue = [];
    if (this.cur) this.cur.wrap.remove();
    this.cur = null;
  }

  blocked() {
    const g = this.game, ui = this.ui;
    // menus are fine (Mo can grumble over the shop, Nana over the order book): the pop-up sits above them
    return (g.mode !== 'ride' && g.mode !== 'menu') || !!g.currentScene || !!ui.dialogueTick || ui.root.classList.contains('letterbox');
  }

  update(dt) {
    this.t += dt;
    const blocked = this.blocked();
    // stale shouts are worthless
    this.queue = this.queue.filter((m) => !(m.shout && (blocked || this.t - m.born > 1.6)) && this.t - m.born < 90);
    const c = this.cur;
    if (c) {
      if (blocked && c.state !== 'duck') {
        // a cutscene or a conversation started: duck now, and say it again later if it was cut short
        if (!c.shout && !c.typedAll) this.queue.unshift({ ...c, state: null, born: this.t });
        this.duck();
      }
      this.animate(dt);
      return;
    }
    if (blocked) return;
    if (this.queue.length) { this.show(this.queue.shift()); return; }
    // nothing to say: pre-render the common faces so the first pop-up doesn't hitch
    // (one face at a time, in idle time between frames where the browser offers it)
    if (this.warmT > 0 && (this.warmT -= dt) <= 0) {
      this.warmT = -1;
      const go = () => this.portrait('hank', 'happy') && this.live.warm();
      if (window.requestIdleCallback) requestIdleCallback(go, { timeout: 2000 });
      else go();
    }
  }

  // one live 3D portrait, reused for every message (the real model, never a flat picture)
  portrait(who, expr) {
    if (!this.live) {
      // rendered on the art grid (one render pixel per art pixel) and shown at the
      // kit's whole-number scale: a crisp pixel portrait, never a smoothed one
      this.live = new LivePortrait(this.game, { art: ART, headroom: HEAD, bust: true, yaw: 0.3, outline: true });
      this.live.canvas.classList.add('pop-char');
    }
    this.live.set(who, expr);
    return this.live.canvas;
  }

  // ---------------------------------------------------------------- one message
  show(m) {
    const wrap = el('div', 'pop');
    const img = this.portrait(m.who, m.expr);
    const bub = el('div', 'pop-bub');
    const anim = el('div', 'pop-anim');
    const b = el('div', 'bubble pop-bubble');
    const tl = el('div', 'b-tail pop-tail');
    anim.append(tl, b);
    bub.appendChild(anim);
    const clip = el('div', 'pop-clip');
    clip.appendChild(img);
    wrap.append(clip, bub);
    this.layer.appendChild(wrap);
    Object.assign(m, { wrap, clip, img, bub, anim, b, tl, state: 'rise', st: 0, hold: 0, placed: false });
    this.cur = m;
    this.fill(m);
    sound.play(m.who === 'hank' ? 'bone_rattle' : 'pop', { volume: m.shout ? 0.5 : 0.35, pitch: 1.1 + Math.random() * 0.15 });
    this.animate(0);
  }

  // (re)write the bubble for message m
  fill(m) {
    const style = m.shout ? 'shout' : m.expr === 'worried' || m.expr === 'scared' ? 'shaky' : 'round';
    m.b.className = `bubble pop-bubble b-${style}${m.shout ? ' pop-shout' : ''}`;
    m.b.style.borderImageSource = `url(${frame(style)})`;
    m.tl.style.backgroundImage = `url(${tail(style)})`;
    m.b.innerHTML = '';
    if (m.name) m.b.appendChild(el('div', 'k-plate k-dark k-bold b-name', '')).textContent = m.name;
    const txt = el('div', 'b-text');
    m.b.appendChild(txt);
    // split out [key] caps; everything else goes through the bubble tokenizer
    const units = [];
    for (const chunk of m.text.split(/(\[[^\]\s]{1,8}\])/)) {
      if (!chunk) continue;
      if (/^\[[^\]\s]{1,8}\]$/.test(chunk)) {
        const k = el('span', 'k-key pop-key hid', '');
        k.textContent = chunk.slice(1, -1);
        txt.appendChild(k);
        units.push({ e: k, ch: 'k' });
        continue;
      }
      const parts = tokenize(chunk);
      const letters = layoutText(txt, parts);
      parts.forEach((p, i) => units.push({ e: letters[i], ch: p.ch }));
    }
    m.units = units;
    m.i = 0;
    m.acc = 0;
    m.typedAll = false;
    if (m.shout) this.reveal(m, units.length);
    const n = m.text.length;
    m.holdFor = (m.ms ?? (m.shout ? 1100 : Math.min(5600, Math.max(1700, 1100 + n * 48)))) / 1000;
    m.placed = false;
    m.anim.classList.remove('anim-pop');
    void m.anim.offsetWidth;
    m.anim.classList.add('anim-pop');
  }

  reveal(m, upTo) {
    while (m.i < Math.min(upTo, m.units.length)) {
      const u = m.units[m.i++];
      u.e?.classList.remove('hid');
    }
    if (m.i >= m.units.length) m.typedAll = true;
  }

  // a merged message: new words (and maybe a new face) without leaving the screen
  swap(m) {
    const c = this.cur;
    const face = m.expr !== c.expr || m.who !== c.who;
    Object.assign(c, { text: m.text, expr: m.expr, key: m.key, shout: m.shout, ms: m.ms, name: m.name, voice: m.voice });
    if (face) this.portrait(c.who, c.expr);
    this.fill(c);
    c.hold = 0;
    if (c.state === 'hold') { c.state = 'bump'; c.st = 0; }
    if (m.shout) sound.blip(c.voice);
  }

  duck() {
    const c = this.cur;
    if (!c || c.state === 'duck') return;
    c.state = 'duck';
    c.st = 0;
    c.bub.style.visibility = 'hidden';
  }

  animate(dt) {
    const c = this.cur;
    if (!c) return;
    c.st += dt;
    if (!c.placed) this.place(c);
    let k = [0, 0, 1, 1];
    if (c.state === 'rise') {
      k = keyAt(RISE, c.st);
      if (c.st >= RISE[RISE.length - 1][0]) { c.state = 'hold'; c.st = 0; }
    } else if (c.state === 'bump') {
      // a little hop when the words change
      k = keyAt([[0, 0, 1.1, 0.9], [0.06, -0.05, 0.95, 1.06], [0.14, 0, 1, 1]], c.st);
      if (c.st > 0.14) { c.state = 'hold'; c.st = 0; }
    } else if (c.state === 'duck') {
      k = keyAt(DUCK, c.st);
      if (c.st >= DUCK[DUCK.length - 1][0]) { c.wrap.remove(); this.cur = null; return; }
    }
    // the bubble appears as he reaches the top
    const showBub = c.state !== 'duck' && (c.state !== 'rise' || c.st > 0.17);
    c.bub.style.visibility = showBub ? '' : 'hidden';
    if (showBub && c.state !== 'rise') {
      // type the words in, blipping in the speaker's voice
      if (!c.typedAll) {
        c.acc += dt * 55;
        let blip = false;
        while (c.acc >= 1 && !c.typedAll) {
          c.acc -= 1;
          const u = c.units[c.i];
          this.reveal(c, c.i + 1);
          if (u && u.ch !== ' ' && c.i % 2 === 0 && !blip) { sound.blip(c.voice); blip = true; }
          if (u && '.!?'.includes(u.ch)) c.acc -= 3;
        }
      } else if (c.state === 'hold') {
        c.hold += dt;
        const wait = this.queue.length ? Math.max(1.1, c.holdFor * 0.7) : c.holdFor;
        if (c.hold >= wait) this.duck();
      }
    }
    // talking bob / shouting shake, in whole art pixels
    this.live?.talk(c.state !== 'duck' && !c.typedAll);
    let jx = 0, jy = 0;
    if (c.state === 'hold' && !c.typedAll) jy = Math.floor(this.t * 9) % 2 ? -1 : 0;
    if (c.shout && c.state === 'hold' && c.hold < 0.35) jx = Math.floor(this.t * 30) % 2 ? 1 : -1;
    // the squash and stretch is drawn inside the portrait (the canvas never changes
    // size, so it is never resampled); only whole art pixels of movement out here
    const u = scale.u;
    this.live?.squash(k[2], k[3]);
    const x = Math.round(c.cx / u - ART / 2) + jx;
    const y = Math.round(c.base / u - ART - HEAD + Math.round(k[1] * ART)) + jy;
    c.img.style.transform = `translate(${snap(x * u)}px, ${snap(y * u)}px)${c.flip ? ' scaleX(-1)' : ''}`;
  }

  // pick a spot along the bottom of the screen (or just above whatever is there)
  place(c) {
    c.placed = true;
    const u = scale.u, W = innerWidth, H = innerHeight, P = ART * u, m = 4 * u;
    c.b.style.maxWidth = `${Math.floor(Math.min(150 * u, W - P - 4 * m) / u) * u}px`;
    const bw = c.b.offsetWidth, bh = c.b.offsetHeight;
    const tailH = (14 - BUBBLE_JOIN) * u;
    const nameH = c.name ? 18 * u : 0;
    const obs = [];
    for (const e of document.querySelectorAll(OBSTACLES)) {
      if (e.closest('.hidden, .off') || getComputedStyle(e).display === 'none') continue;
      const r = e.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H) obs.push(r);
    }
    // boxes for Hank at centre cx standing on base, bubble towards the middle of the screen
    const boxes = (cx, base) => {
      const right = cx > W / 2;
      const hx = cx - P / 2, hy = base - P * 0.98;
      let bx = right ? cx + P * 0.3 - bw : cx - P * 0.3;
      bx = Math.max(m, Math.min(W - bw - m, bx));
      const by = base - P * (1 - 0.04) + 3 * u - tailH - bh;
      return { right, bx, by, list: [[hx, hy, hx + P, base], [bx, by - nameH, bx + bw, by + bh + tailH]] };
    };
    const overlap = (B) => {
      let a = 0;
      for (const [x0, y0, x1, y1] of B.list) {
        if (x0 < 0 || x1 > W || y0 < 0) a += 1e6;
        for (const r of obs) a += Math.max(0, Math.min(x1, r.right) - Math.max(x0, r.left)) * Math.max(0, Math.min(y1, r.bottom) - Math.max(y0, r.top));
      }
      return a;
    };
    const R = W - m - P / 2 - 2 * u, Lx = m + P / 2 + 2 * u;
    const cands = [[R, H], [Lx, H]];
    for (let x = Lx; x <= R; x += 8 * u) cands.push([x, H]);
    // nothing free along the bottom: stand on top of whatever is in the way
    for (const cx of [Lx, R]) {
      let base = H;
      for (let i = 0; i < 4; i++) {
        const B = boxes(cx, base);
        let top = base;
        for (const r of obs) for (const [x0, y0, x1, y1] of B.list) if (Math.min(x1, r.right) > Math.max(x0, r.left) && Math.min(y1, r.bottom) > Math.max(y0, r.top)) top = Math.min(top, r.top);
        if (top >= base) break;
        base = top - 2 * u;
      }
      cands.push([cx, base, true]);
    }
    let best = null, bestA = Infinity;
    for (const [cx, base, raised] of cands) {
      const a = overlap(boxes(cx, base)) + (raised ? 1 : 0);
      if (a < bestA) { best = [cx, base, raised]; bestA = a; }
      if (a === 0) break;
    }
    const [cx, base, raised] = best;
    const B = boxes(cx, base);
    c.cx = Math.round(cx / u) * u;
    c.base = Math.round(base / u) * u;
    c.flip = !B.right; // look in towards the middle of the screen
    c.wrap.classList.toggle('raised', !!raised);
    c.clip.style.height = `${c.base}px`;
    // the bubble is anchored by its bottom corner nearest Hank, so it grows away from him
    const bs = c.bub.style;
    bs.bottom = `${snap(H - Math.round((B.by + bh) / u) * u)}px`;
    if (B.right) { bs.left = 'auto'; bs.right = `${snap(W - Math.round((B.bx + bw) / u) * u)}px`; } else { bs.right = 'auto'; bs.left = `${snap(Math.round(B.bx / u) * u)}px`; }
    // the tail hangs off the bubble's bottom edge, its tip just over Hank's hat
    const ts = c.tl.style;
    ts.top = `calc(100% - ${BUBBLE_JOIN * u}px)`;
    if (B.right) {
      const fromR = Math.max(8 * u, Math.min(bw - 24 * u, B.bx + bw - (c.cx - 5 * u)));
      ts.left = 'auto'; ts.right = `${snap(Math.round(fromR / u) * u)}px`; ts.transform = 'scaleX(-1)';
    } else {
      const fromL = Math.max(8 * u, Math.min(bw - 24 * u, c.cx + 5 * u - B.bx));
      ts.right = 'auto'; ts.left = `${snap(Math.round(fromL / u) * u)}px`; ts.transform = '';
    }
    if (raised) {
      // a little plank for him to lean on, so he isn't cut off in mid-air
      let sill = c.wrap.querySelector('.pop-sill');
      if (!sill) sill = c.wrap.appendChild(el('div', 'k-plate k-dark pop-sill'));
      sill.style.width = `${P + 8 * u}px`;
      sill.style.transform = `translate(${snap(c.cx - P / 2 - 4 * u)}px, ${snap(c.base - 3 * u)}px)`;
    }
  }
}
