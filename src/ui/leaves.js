// Autumn leaves in the interface: little pixel-art leaves (leafart.js) that flutter
// off menus as they open, burst out of big buttons and finished deliveries, drift
// across the title and pause screens and now and then get caught on Nana's list,
// plus the screen transitions: a warm lantern glow closes in as a dithered pixel
// iris with a golden rim (never black), glints twinkle and a few leaves drift by,
// the scene changes underneath, then the glow opens out again to reveal it.
//
// Two pooled canvases drawn on the kit's art-pixel grid (one canvas pixel = one art
// pixel, shown at a whole number of device pixels per pixel, never smoothed):
//   back  - over the 3D view and the cutscene letterbox, under the dialogue and the
//           touch controls (scene transitions)
//   front - over everything (flourishes, the loading screen's exit, title -> game)
// They sleep (hidden, no animation frames) whenever there is nothing to draw.
//
//   leafTransition(async () => { /* swap */ }, { layer: 'front' })   cover, swap, reveal
//   await leafCover(opts); ... ; leafReveal(opts)                    the two halves
//   screenFade(game, to, dur)       the cutscene / cabin fade: short fades are glow
//                                   dissolves, long (emotional) ones stay soft (warm plum,
//                                   never black) with a few leaves
//   leaves.burst(x, y, n) / leaves.burstFrom(el, n) / leaves.flutter(el, n)
//   leaves.gust(n) / leaves.ambient('title', true) / leaves.catchOn(el)
//
// Respects prefers-reduced-motion and setLeafMotion(false): no particles, and the
// wipes become plain quick fades.
import { leafAtlas, LEAF_KINDS, BIG_KINDS, TURNS, tumbleOf } from './leafart.js';
import { scale, applyScale } from './kit.js';
import { sound } from '../game/sound.js';

let reduced = false;
try { reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; } catch { /* old browsers */ }
export function setLeafMotion(on) {
  reduced = !on;
  if (reduced) for (const L of [back, front]) L.parts.length = 0;
}
export const leafMotion = () => !reduced;
// paint the leaf sprites and the transition's glow ahead of time (the loading screen does,
// so its exit doesn't hitch)
export function warmLeaves() {
  leafAtlas('m');
  leafAtlas('b');
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 50));
  idle(() => {
    const { W, H } = gridSize();
    glowOf(W, H);
  });
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => k * k * (3 - 2 * k);
const ALL = LEAF_KINDS.map((_, i) => i);
const MAXP = 240; // particles per layer (phones too)

// the screen in art pixels (whole art pixels, rounded up)
function gridSize() {
  if (!scale.cols) applyScale();
  const S = scale.S, dpr = scale.dpr;
  return { W: Math.max(1, Math.ceil((innerWidth * dpr) / S)), H: Math.max(1, Math.ceil((innerHeight * dpr) / S)) };
}

// ---------------------------------------------------------------- a layer
class Layer {
  constructor(z, inUI = false) {
    this.z = z;
    this.inUI = inUI;
    this.dirty = true;
    this.canvas = null;
    this.parts = [];
    this.hooks = new Set();
    this.wipe = null;
    this.raf = 0;
    this.W = this.H = 0;
    this.vw = this.vh = 0;
  }
  mount() {
    if (!this.canvas) {
      const c = document.createElement('canvas');
      c.className = 'leaf-layer';
      c.setAttribute('aria-hidden', 'true');
      c.style.cssText = `position:fixed;left:0;top:0;z-index:${this.z};pointer-events:none;image-rendering:pixelated;display:none;`;
      this.canvas = c;
      this.ctx = c.getContext('2d');
    }
    if (this.canvas.isConnected) return;
    // the back layer lives inside the interface (first in it, so whatever shares its
    // z-index - the skip hint, the touch controls - stays on top)
    const ui = this.inUI && document.getElementById('ui');
    if (ui) ui.insertBefore(this.canvas, ui.firstChild);
    else document.body.appendChild(this.canvas);
  }
  // one canvas pixel per art pixel, the canvas a whole number of art pixels big
  fit() {
    if (!scale.cols || innerWidth !== this.vw || innerHeight !== this.vh) {
      this.vw = innerWidth;
      this.vh = innerHeight;
      applyScale();
    }
    const S = scale.S, dpr = scale.dpr;
    const { W, H } = gridSize();
    if (W !== this.W || H !== this.H || S !== this.S || dpr !== this.dpr) {
      this.dirty = true;
      this.W = W;
      this.H = H;
      this.S = S;
      this.dpr = dpr;
      this.canvas.width = W;
      this.canvas.height = H;
      this.canvas.style.width = `${(W * S) / dpr}px`;
      this.canvas.style.height = `${(H * S) / dpr}px`;
      this.ctx.imageSmoothingEnabled = false;
    }
  }
  get u() {
    return scale.S / scale.dpr;
  }
  wake() {
    this.mount();
    this.fit();
    this.canvas.style.display = '';
    if (!this.raf) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
  }
  loop = (now) => {
    this.raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.fit();
    for (const h of this.hooks) h(dt, this);
    if (this.wipe) this.wipe.step(dt);
    this.step(dt);
    // a glow just sitting there (nothing flying over it) is drawn once, not every frame
    const still = !!this.wipe?.still() && !this.parts.length && !this.hooks.size;
    if (!still || this.dirty) this.draw();
    this.dirty = !still;
    if (this.parts.length || this.wipe || this.hooks.size) this.raf = requestAnimationFrame(this.loop);
    else {
      this.ctx.clearRect(0, 0, this.W, this.H);
      this.canvas.style.display = 'none';
    }
  };
  add(p) {
    if (this.parts.length >= MAXP) this.parts.shift();
    this.parts.push(p);
    return p;
  }
  step(dt) {
    const P = this.parts, W = this.W, H = this.H;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.home) homing(p, dt, this);
      else {
        p.vx += (p.wind - p.vx) * Math.min(1, p.drag * dt);
        p.vy = Math.min(p.term, p.vy + p.g * dt);
        p.x += (p.vx + Math.sin(p.t * p.swf + p.sw) * p.sway) * dt;
        p.y += p.vy * dt;
        p.rot += p.rs * dt;
        p.fl += p.fs * dt;
      }
      const m = p.big ? 30 : 16;
      if (p.t > p.life || p.y > H + m || p.x < -m * 3 || p.x > W + m * 3 || p.y < -H) P.splice(i, 1);
    }
  }
  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.W, this.H);
    if (this.wipe) this.wipe.draw(ctx);
    const A = leafAtlas('m');
    for (const p of this.parts) {
      const At = p.big ? leafAtlas('b') : A;
      const c = At.cell;
      ctx.drawImage(At.canvas, At.sx(Math.floor(p.rot), p.face ?? tumbleOf(p.fl)), At.sy(p.k), c, c, Math.round(p.x - c / 2), Math.round(p.y - c / 2), c, c);
    }
    if (this.wipe) this.wipe.drawTop?.(ctx);
  }
}
// scene transitions: inside #ui at 2, over the HUD and the cutscene letterbox (1), under
// the dialogue (3), menus (4), pop-ups and bubbles
const back = new Layer(2, true);
const front = new Layer(160); // over the loading screen (150), the title (40) and the interface
const layerOf = (l) => (l === 'back' ? back : front);

// a leaf with sensible defaults (art pixels, art pixels per second)
function leaf(o) {
  return {
    t: 0, life: 6, x: 0, y: 0, vx: 0, vy: 0, wind: 0, drag: 1.4, g: 34, term: 30,
    sway: rnd(5, 14), swf: rnd(1.6, 3.2), sw: rnd(0, 6.3), rot: rnd(0, TURNS), rs: rnd(-7, 7),
    fl: rnd(0, 6.3), fs: rnd(2.5, 7) * (Math.random() < 0.5 ? -1 : 1), big: false, k: pick(ALL), ...o,
  };
}
const usable = () => !reduced && typeof document !== 'undefined' && !document.hidden;
// a screen rect (CSS px) in a layer's art pixels
function artRect(L, el) {
  const r = el?.getBoundingClientRect ? el.getBoundingClientRect() : el;
  if (!r) return null;
  const u = L.u;
  return { x: r.left / u, y: r.top / u, w: r.width / u, h: r.height / u };
}

// ---------------------------------------------------------------- flourishes
export const leaves = {
  // a little burst of leaves from a point on screen (CSS px)
  burst(x, y, n = 10, { layer = 'front', up = 1 } = {}) {
    if (!usable()) return;
    const L = layerOf(layer);
    L.wake();
    const ax = x / L.u, ay = y / L.u;
    for (let i = 0; i < n; i++) {
      const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
      const s = rnd(40, 110);
      L.add(leaf({ x: ax + rnd(-3, 3), y: ay + rnd(-3, 3), vx: Math.cos(a) * s, vy: Math.sin(a) * s * up, wind: rnd(-14, 14), drag: 2.2, life: rnd(2.2, 3.6) }));
    }
  },
  // burst out of an element (a big button, a delivered order)
  burstFrom(el, n = 8, opts = {}) {
    if (!usable() || !el) return;
    const r = el.getBoundingClientRect?.() || el;
    if (!r.width) return;
    for (let i = 0; i < n; i++) this.burst(r.left + rnd(0.1, 0.9) * r.width, r.top + rnd(0.1, 0.7) * r.height, 1, opts);
  },
  // leaves shaken loose off the edges of a panel (menus opening and closing)
  flutter(el, n = 10, { layer = 'front' } = {}) {
    if (!usable() || !el) return;
    const L = layerOf(layer);
    L.wake();
    const R = artRect(L, el);
    if (!R || !R.w) return;
    const wind = rnd(-18, 18);
    for (let i = 0; i < n; i++) {
      const side = i % 3; // top edge twice as often as the sides
      const x = side === 0 ? R.x + rnd(0, R.w) : side === 1 ? R.x + rnd(-2, 6) : R.x + R.w - rnd(-2, 6);
      const y = side === 0 ? R.y + rnd(-4, 4) : R.y + rnd(0, R.h * 0.8);
      const out = side === 1 ? -1 : side === 2 ? 1 : rnd(-1, 1);
      L.add(leaf({ x, y, vx: out * rnd(20, 60), vy: rnd(-50, -10), wind, drag: 1.6, g: 40, life: rnd(2.6, 4.2), k: pick(ALL) }));
    }
  },
  // a gust: n leaves blown across the whole screen
  gust(n = 14, { layer = 'front', dir = Math.random() < 0.5 ? 1 : -1, speed = 1 } = {}) {
    if (!usable()) return;
    const L = layerOf(layer);
    L.wake();
    for (let i = 0; i < n; i++) {
      const v = rnd(150, 260) * speed, big = Math.random() < 0.18;
      L.add(leaf({
        x: dir > 0 ? rnd(-60, -8) : L.W + rnd(8, 60), y: rnd(-0.05, 0.85) * L.H, vx: v * dir, wind: v * dir * 0.8, vy: rnd(-20, 10),
        g: 16, term: 40, drag: 0.6, life: 4, big, k: big ? pick(BIG_KINDS) : pick(ALL),
      }));
    }
  },
  // keep a few leaves drifting (title, pause): ambient(key, on, count)
  ambient(key, on = true, n = 5, { layer = 'front' } = {}) {
    const L = layerOf(layer);
    AMB.set(key, on ? n : 0);
    if (!on) AMB.delete(key);
    if (AMB.size && !L.hooks.has(ambientHook)) {
      if (!usable()) return;
      L.hooks.add(ambientHook);
      L.wake();
    } else if (!AMB.size) {
      L.hooks.delete(ambientHook);
      // the menu closed: whatever was drifting blows away
      for (const p of L.parts) if (p.amb) {
        p.amb = false;
        p.wind = (p.vx < 0 ? -1 : 1) * rnd(120, 200);
        p.drag = 1.5;
        p.life = p.t + 4;
      }
    }
  },
  // a leaf blows in and gets caught on an element's top edge for a while (the HUD clipboard)
  catchOn(el, { stay = rnd(7, 13) } = {}) {
    if (!usable() || !el?.isConnected) return;
    const L = front;
    L.wake();
    const R = artRect(L, el);
    if (!R || !R.w || R.y < -4 || R.y > L.H) return;
    const fromRight = R.x + R.w / 2 > L.W / 2;
    const tx = R.x + rnd(0.15, 0.85) * R.w;
    L.add(leaf({
      x: fromRight ? L.W + 12 : -12, y: R.y - rnd(30, 60), k: pick([0, 1, 2, 3, 4]), life: 99,
      home: { el, fx: (tx - R.x) / Math.max(1, R.w), dy: -3, t: 0, dur: rnd(1.6, 2.4), sx: fromRight ? L.W + 12 : -12, sy: R.y - rnd(30, 60), stay, face: pick([0, 0, 5]) },
    }));
  },
  // how many are flying right now (tests)
  count: () => back.parts.length + front.parts.length,
};
const AMB = new Map();
function ambientHook(dt, L) {
  let want = 0;
  for (const n of AMB.values()) want += n;
  if (reduced) return;
  const have = L.parts.filter((p) => p.amb).length;
  if (have < want && Math.random() < dt * 2.5) {
    const dir = Math.random() < 0.7 ? 1 : -1;
    const top = Math.random() < 0.6;
    L.add(leaf({
      amb: true, x: top ? rnd(0, L.W) : dir > 0 ? -10 : L.W + 10, y: top ? -10 : rnd(0, L.H * 0.5),
      vx: dir * rnd(10, 30), wind: dir * rnd(14, 34), vy: rnd(0, 10), g: 10, term: rnd(12, 22), life: 30, k: pick(ALL),
    }));
  }
}
// a caught leaf: flies in on a curve, sits on the edge (a twitch now and then), then blows off
function homing(p, dt, L) {
  const h = p.home;
  h.t += dt;
  // where it sits (re-measured a few times a second, not every frame)
  if ((h.rt = (h.rt || 0) - dt) <= 0 || !h.R) {
    h.rt = 0.25;
    h.R = h.el.isConnected ? artRect(L, h.el) : null;
    h.gone = !h.R || !h.R.w || !!h.el.closest?.('.hidden, .empty, .off');
  }
  const R = h.R, gone = h.gone;
  const tx = R ? R.x + h.fx * R.w : p.x, ty = R ? R.y + h.dy : p.y;
  if (!h.sat) {
    const k = Math.min(1, h.t / h.dur), e = smooth(k);
    p.x = h.sx + (tx - h.sx) * e + Math.sin(k * Math.PI) * 10;
    p.y = h.sy + (ty - h.sy) * e - Math.sin(k * Math.PI * 2) * 6;
    p.rot += p.rs * dt;
    p.fl += p.fs * dt;
    if (k >= 1) {
      h.sat = true;
      h.t = 0;
      p.face = h.face;
      p.rot = pick([1, 2, 6, 7]); // lying across the edge, not stood on its stem
    }
    if (gone && h.t > 0.3) release(p);
    return;
  }
  p.x = tx;
  p.y = ty;
  // a twitch in the breeze now and then
  p.face = Math.sin(h.t * 1.3) > 0.97 ? 1 : h.face;
  if (gone || h.t > h.stay) {
    release(p);
    if (!gone) sound.play('leaf_rustle', { volume: 0.25 });
  }
}
function release(p) {
  p.home = null;
  p.face = undefined;
  p.t = 0;
  p.life = 5;
  const d = Math.random() < 0.5 ? -1 : 1;
  p.vx = d * rnd(30, 70);
  p.vy = rnd(-40, -15);
  p.wind = d * rnd(20, 40);
}

// ---------------------------------------------------------------- the glow a transition is made of
// A warm lantern glow painted on the art-pixel grid: honey gold in the middle,
// amber, then a dusky rose at the corners (never black), in a handful of flat
// tones blended by an ordered (Bayer) dither so it reads as pixel art. Each pixel
// also gets a threshold - its distance from the middle plus a Bayer offset - which
// the dissolve compares against its progress, so the glow closes in (and later
// opens out) as a dithered iris with hard pixel edges. Built once per screen size.
const GLOW_STOPS = [[0, 0xffe7ad], [0.3, 0xffcb7c], [0.6, 0xf2a25e], [0.85, 0xd9784f], [1.08, 0xb5574e]];
const GLOW_TONES = 7;
const RIM = 0.075; // how wide the bright rim on the dissolving edge is (threshold units)
const RIM_COL = [0xfff3cf, 0xffe08a];
const BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
const bayer = (x, y) => (BAYER[(y & 7) * 8 + (x & 7)] + 0.5) / 64;
// 0xRRGGBB -> the canvas's little-endian 0xAABBGGRR
const abgr = (c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
const mixHex = (a, b, k) => {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
function glowTone(d) {
  for (let i = 1; i < GLOW_STOPS.length; i++) {
    const [d1, c1] = GLOW_STOPS[i], [d0, c0] = GLOW_STOPS[i - 1];
    if (d <= d1) return mixHex(c0, c1, clamp((d - d0) / (d1 - d0), 0, 1));
  }
  return GLOW_STOPS[GLOW_STOPS.length - 1][1];
}
// the middle of the glow (a touch above centre, where the eye sits) and its reach
const glowCentre = (W, H) => {
  const cx = W / 2, cy = H * 0.46;
  return { cx, cy, R: Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) };
};
const GLOWS = new Map();
function glowOf(W, H) {
  const key = `${W}x${H}`;
  let G = GLOWS.get(key);
  if (G) return G;
  if (GLOWS.size > 2) GLOWS.clear();
  const tones = [];
  for (let i = 0; i < GLOW_TONES; i++) tones.push(abgr(glowTone((i / (GLOW_TONES - 1)) * 1.08)));
  const n = W * H, col = new Uint32Array(n), thr = new Float32Array(n);
  const { cx, cy, R } = glowCentre(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, b = bayer(x, y), d = clamp(Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) * 1.15) / R, 0, 1);
    const f = d * (GLOW_TONES - 1), t = Math.floor(f);
    col[i] = tones[Math.min(GLOW_TONES - 1, t + (f - t > b ? 1 : 0))];
    thr[i] = d * 0.78 + b * 0.22;
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  new Uint32Array(img.data.buffer).set(col);
  g.putImageData(img, 0, 0);
  G = { col, thr, canvas, img: g.createImageData(W, H), rim: RIM_COL.map(abgr) };
  GLOWS.set(key, G);
  return G;
}

// ---------------------------------------------------------------- the glow dissolve
// cover: the warm glow closes in from the edges of the screen to its middle in a
// dithered iris with a bright golden rim; hold: it glows there while the scene
// changes underneath, a few glints twinkling; reveal: it opens out again from the
// middle. A few leaves drift through and little glints of light rise and twinkle -
// a gentle, short bit of magic rather than a wall of anything.
const MOTE_MAX = 26;
class Wipe {
  constructor(L, mode, dur) {
    this.L = L;
    this.mode = mode;
    this.t = 0;
    this.dur = dur;
    this.res = null;
    this.watch = null;
    this.motes = [];
    this.spawn = 0;
  }
  // the threshold the iris edge sits at right now: covered pixels have thr >= edge
  edgeThr() {
    const k = smooth(clamp(this.t / this.dur, 0, 1));
    return this.mode === 'cover' ? 1 + RIM - k * (1 + 2 * RIM) : k * (1 + RIM) - RIM * 0.5;
  }
  // jump to fully covered (an instant cut while the glow was still closing in)
  finish() {
    if (this.mode !== 'cover') return;
    this.mode = 'hold';
    this.L.dirty = true;
    this.res?.();
  }
  covering() {
    return this.mode === 'cover' || this.mode === 'hold';
  }
  addMote(x, y) {
    if (this.motes.length >= MOTE_MAX) return;
    this.motes.push({ x, y, vx: rnd(-4, 4), vy: rnd(-16, -5), t: 0, life: rnd(0.7, 1.5), ph: rnd(0, 6.3), sp: rnd(7, 13), big: Math.random() < 0.35 });
  }
  step(dt) {
    this.t += dt;
    const L = this.L;
    if (!reduced) {
      // glints: along the dissolving rim while it moves, drifting over the glow while it holds
      this.spawn += dt * (this.mode === 'hold' ? 5 : this.mode === 'tail' ? 0 : 26);
      const { cx, cy, R } = glowCentre(L.W, L.H);
      while (this.spawn >= 1) {
        this.spawn--;
        const a = rnd(0, Math.PI * 2);
        const r = this.mode === 'hold' ? rnd(0, 0.8) : clamp((this.edgeThr() - 0.11 + rnd(-0.05, 0.05)) / 0.78, 0.02, 1);
        this.addMote(cx + Math.cos(a) * r * R, cy + (Math.sin(a) * r * R) / 1.15);
      }
      for (let i = this.motes.length - 1; i >= 0; i--) {
        const m = this.motes[i];
        m.t += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        if (m.t > m.life) this.motes.splice(i, 1);
      }
    }
    if ((this.mode === 'cover' || this.mode === 'reveal') && this.t >= this.dur) {
      // revealed: the glints left over twinkle out on their own a moment longer
      this.mode = this.mode === 'reveal' ? 'tail' : 'hold';
      L.dirty = true;
      this.res?.();
    }
    if (this.mode === 'tail' && (reduced || !this.motes.length || this.t > this.dur + 1.6) && L.wipe === this) L.wipe = null;
    // a held cover stands in for the 3D fade: whatever brings the scene back (a direct
    // reset of the fade, a slow fade in) opens the glow up again
    if (this.mode === 'hold' && this.watch && this.watch.value < 0.5 && L.wipe === this) {
      leafReveal({ layer: L === back ? 'back' : 'front', sound: true });
    }
  }
  still() {
    return this.mode === 'hold' && (reduced || !this.motes.length);
  }
  draw(ctx) {
    if (this.mode === 'tail') return;
    const L = this.L, W = L.W, H = L.H, G = glowOf(W, H);
    if (this.mode === 'hold') {
      ctx.drawImage(G.canvas, 0, 0);
      return;
    }
    const img = G.img, out = new Uint32Array(img.data.buffer), col = G.col, thr = G.thr;
    const e = this.edgeThr(), n = W * H, rimA = G.rim[0], rimB = G.rim[1];
    for (let i = 0; i < n; i++) {
      const r = thr[i] - e;
      out[i] = r < 0 ? 0 : r < RIM * 0.45 ? rimA : r < RIM ? rimB : col[i];
    }
    ctx.putImageData(img, 0, 0);
  }
  // the twinkling glints, over the glow and the drifting leaves
  drawTop(ctx) {
    if (reduced) return;
    for (const m of this.motes) {
      const life = 1 - m.t / m.life;
      const tw = Math.sin(m.t * m.sp + m.ph);
      if (life <= 0 || tw < -0.55) continue;
      const x = Math.round(m.x), y = Math.round(m.y);
      ctx.fillStyle = tw > 0.4 ? '#fffbe8' : '#ffd86e';
      ctx.fillRect(x, y, 1, 1);
      if (m.big && tw > 0.25 && life > 0.25) {
        // a little four-pointed sparkle
        ctx.fillStyle = tw > 0.75 ? '#fff1b8' : '#f5b84e';
        ctx.fillRect(x - 1, y, 3, 1);
        ctx.fillRect(x, y - 1, 1, 3);
        ctx.fillStyle = '#fffbe8';
        ctx.fillRect(x, y, 1, 1);
        if (tw > 0.8) {
          ctx.fillStyle = '#f5b84e';
          ctx.fillRect(x - 2, y, 1, 1);
          ctx.fillRect(x + 2, y, 1, 1);
          ctx.fillRect(x, y - 2, 1, 1);
          ctx.fillRect(x, y + 2, 1, 1);
        }
      }
    }
  }
}
// a few leaves drift through a transition (never a pile of them)
function driftLeaves(L, n, dir) {
  if (reduced) return;
  for (let i = 0; i < n; i++) {
    const big = Math.random() < 0.3;
    const x = dir > 0 ? rnd(-30, L.W * 0.3) : L.W - rnd(-30, L.W * 0.3);
    L.add(leaf({ x, y: rnd(-24, -6) + (i % 2 ? rnd(0, L.H * 0.35) : 0), vx: dir * rnd(18, 40), wind: dir * rnd(22, 46), vy: rnd(0, 12), g: 16, term: rnd(20, 32), drag: 1, life: 4.5, big, k: big ? pick(BIG_KINDS) : pick(ALL) }));
  }
}
let lastDir = 1;
// close the glow in; resolves when the screen is covered (it stays covered until leafReveal)
export function leafCover({ layer = 'front', dur = 0.6, dir = Math.random() < 0.5 ? 1 : -1, sound: snd = true } = {}) {
  const L = layerOf(layer);
  L.wake();
  lastDir = dir;
  const w = new Wipe(L, 'cover', reduced ? Math.min(dur, 0.35) : dur);
  L.wipe?.res?.();
  L.wipe = w;
  if (snd) sound.play('leaf_rustle', { volume: 0.3, pitch: rnd(1.1, 1.3) });
  driftLeaves(L, 3 + ((L.W / 260) | 0), dir);
  return new Promise((res) => (w.res = res));
}
// open the glow out again (it is drawn whole at once first, so whatever was swapped
// underneath never flashes); resolves when the scene is uncovered
export function leafReveal({ layer = 'front', dur = 0.75, dir = lastDir, sound: snd = false } = {}) {
  const L = layerOf(layer);
  L.wake();
  const w = new Wipe(L, 'reveal', reduced ? Math.min(dur, 0.35) : dur);
  L.wipe?.res?.();
  L.wipe = w;
  L.draw();
  if (snd) sound.play('leaf_rustle', { volume: 0.22, pitch: rnd(1.2, 1.4) });
  driftLeaves(L, 2, dir);
  return new Promise((res) => (w.res = res));
}
// let go of a held cover: the glow opens up
export function leafRelease({ layer = 'front' } = {}) {
  const w = layerOf(layer).wipe;
  if (w && w.mode === 'hold') leafReveal({ layer });
}
// close the glow over the screen, run swap() underneath, then open it again
export async function leafTransition(swap, { layer = 'front', dur = 0.55, revealDur = 0.7, dir } = {}) {
  await leafCover({ layer, dur, dir });
  try {
    await swap?.();
  } finally {
    // let the new scene draw once before the glow opens on it
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await leafReveal({ layer, dur: revealDur });
  }
}

// ---------------------------------------------------------------- the 3D fade
// Scene fades (cutscenes, Nana's cabin, the end of the day) go through here. Short
// fades (up to 1.25 s) are glow dissolves on the layer just above the 3D view (over
// the cutscene letterbox, under the dialogue): the glow covers the screen and STAYS -
// it is the cover, nothing goes dark - and fading back in opens it out again.
// The 3D fade is set underneath (code reads it) but never shows. Longer fades are
// the slow, emotional ones (a funeral, falling asleep): they stay soft, into the
// pipeline's warm dark plum (never black), with a few leaves drifting down.
let fadeToken = 0;
const coverDone = (w) => new Promise((r) => {
  const o = w.res;
  w.res = () => { o?.(); r(); };
});
export async function screenFade(game, to, dur = 0.6) {
  const U = game.pipeline.post.uFade;
  const me = ++fadeToken;
  // an older fade still running would fight this one: let it finish on a dummy
  for (const tw of game.tweens || []) if (tw.obj === U) tw.obj = { value: 0 };
  const hidden = typeof document === 'undefined' || document.hidden;
  const w = back.wipe;
  const covered = !!w && w.covering(); // the glow closing in or sitting there
  if (dur <= 0.05 || hidden) {
    // an instant cut (a skipped cutscene): leaves already coming in settle at once,
    // leaves sitting there blow off quickly
    if (to > 0.5) {
      if (w?.mode === 'cover') w.finish();
      U.value = to;
      if (back.wipe?.mode === 'hold') back.wipe.watch = U;
      return;
    }
    U.value = to;
    if (covered && !hidden) leafReveal({ layer: 'back', dur: 0.4 });
    else if (w) { back.wipe = null; w.res?.(); }
    return;
  }
  const wipe = !reduced && dur <= 1.25 && (to > 0.99 || to < 0.01);
  if (wipe && to > 0.5) {
    if (covered) {
      // already on its way in, or already there
      if (w.mode === 'cover') await coverDone(w);
    } else {
      // dark already (a slow fade): stay as it is
      if (U.value > 0.99) return;
      await leafCover({ layer: 'back', dur: clamp(dur * 1.2, 0.45, 0.8) });
    }
    // a newer fade took over meanwhile (a skip, another cut): it owns the 3D fade now
    if (me !== fadeToken) return;
    U.value = to;
    if (back.wipe?.mode === 'hold') back.wipe.watch = U;
    return;
  }
  if (wipe && to < 0.5) {
    if (covered) {
      const p = leafReveal({ layer: 'back', dur: clamp(dur * 1.3, 0.5, 0.9), sound: true });
      U.value = to;
      return p;
    }
    if (U.value < 0.01) return;
    // dark without leaves (after a slow fade): come back softly on a little gust
    leaves.gust(3, { layer: 'back', speed: 0.6 });
    return game.tween(U, 'value', to, dur);
  }
  if (to < U.value && covered) leafReveal({ layer: 'back', dur: 0.9, sound: true });
  if (to > U.value && usable()) {
    // a few leaves see the light out
    back.wake();
    for (let i = 0; i < 7; i++) back.add(leaf({ x: rnd(0, back.W), y: rnd(-30, -6), vx: rnd(-10, 10), wind: rnd(8, 22), g: 12, term: rnd(14, 24), life: dur + 4, k: pick(ALL) }));
  }
  return game.tween(U, 'value', to, dur);
}
