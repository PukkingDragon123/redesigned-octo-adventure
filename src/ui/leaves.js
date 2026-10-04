// Autumn leaves in the interface: little pixel-art leaves (leafart.js) that flutter
// off menus as they open, burst out of big buttons and finished deliveries, drift
// across the title and pause screens and now and then get caught on Nana's list,
// plus the leaf-wipe screen transitions: a gust of leaves sweeps across and covers
// the screen, the scene changes underneath, then the leaves blow away to reveal it.
//
// Two pooled canvases drawn on the kit's art-pixel grid (one canvas pixel = one art
// pixel, shown at a whole number of device pixels per pixel, never smoothed):
//   back  - under the interface, like the 3D fade (scene transitions)
//   front - over everything (flourishes, the loading screen's exit, title -> game)
// They sleep (hidden, no animation frames) whenever there is nothing to draw.
//
//   leafTransition(async () => { /* swap */ }, { layer: 'front' })   cover, swap, reveal
//   await leafCover(opts); ... ; leafReveal(opts)                    the two halves
//   screenFade(game, to, dur)       the cutscene / cabin fade: short fades are leaf
//                                   wipes, long (emotional) ones stay soft with a few leaves
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
// paint the leaf sprites ahead of time (the loading screen does, so its exit doesn't hitch)
export function warmLeaves() {
  leafAtlas('m');
  leafAtlas('b');
}

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (k) => k * k * (3 - 2 * k);
const ALL = LEAF_KINDS.map((_, i) => i);
const BODY = '#000000'; // the colour under a wipe: the same black the 3D fade goes to
const MAXP = 240; // particles per layer (phones too)
const EDGE = 52; // how far past the screen a wipe's front runs, in art pixels

// ---------------------------------------------------------------- a layer
class Layer {
  constructor(z) {
    this.z = z;
    this.canvas = null;
    this.parts = [];
    this.hooks = new Set();
    this.wipe = null;
    this.raf = 0;
    this.W = this.H = 0;
    this.vw = this.vh = 0;
  }
  mount() {
    if (this.canvas) return;
    const c = document.createElement('canvas');
    c.className = 'leaf-layer';
    c.setAttribute('aria-hidden', 'true');
    c.style.cssText = `position:fixed;left:0;top:0;z-index:${this.z};pointer-events:none;image-rendering:pixelated;display:none;`;
    document.body.appendChild(c);
    this.canvas = c;
    this.ctx = c.getContext('2d');
  }
  // one canvas pixel per art pixel, the canvas a whole number of art pixels big
  fit() {
    if (!scale.cols || innerWidth !== this.vw || innerHeight !== this.vh) {
      this.vw = innerWidth;
      this.vh = innerHeight;
      applyScale();
    }
    const S = scale.S, dpr = scale.dpr;
    const W = Math.max(1, Math.ceil((innerWidth * dpr) / S)), H = Math.max(1, Math.ceil((innerHeight * dpr) / S));
    if (W !== this.W || H !== this.H || S !== this.S || dpr !== this.dpr) {
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
    this.draw();
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
const back = new Layer(4); // #ui is 5: scene transitions sit under the interface, like the 3D fade
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
    } else if (!AMB.size) L.hooks.delete(ambientHook);
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
      home: { el, fx: (tx - R.x) / Math.max(1, R.w), dy: -3, t: 0, dur: rnd(1.6, 2.4), sx: fromRight ? L.W + 12 : -12, sy: R.y - rnd(30, 60), stay, face: pick([0, 1, 5]) },
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
  const R = h.el.isConnected ? artRect(L, h.el) : null;
  const gone = !R || !R.w || h.el.closest?.('.hidden, .empty, .off');
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
      p.rot = Math.round(p.rot);
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

// ---------------------------------------------------------------- the leaf wipe
// A black body sweeps across behind a ragged front of big tumbling leaves (cover),
// holds, then slides on with its trailing edge shedding leaves that flutter down
// over the revealed scene (reveal). dir: 1 left to right, -1 right to left.
class Wipe {
  constructor(L, mode, dur, dir) {
    this.L = L;
    this.mode = mode;
    this.t = 0;
    this.dur = dur;
    this.dir = dir;
    this.seed = rnd(0, 100);
    this.band = [];
    this.res = null;
    this.makeBand();
  }
  makeBand() {
    const H = this.L.H, rev = this.mode === 'reveal';
    for (let y = -10; y < H + 10; y += rnd(3.5, 6.5)) {
      const big = Math.random() < 0.55;
      this.band.push({
        y: Math.round(y), big, k: big ? pick(BIG_KINDS) : pick(ALL),
        dx: rev ? rnd(-6, big ? 26 : 34) : -rnd(-6, big ? 26 : 34),
        rot: rnd(0, TURNS), rs: rnd(-9, 9), fl: rnd(0, 6.3), fs: rnd(4, 9) * (Math.random() < 0.5 ? -1 : 1), bob: rnd(0, 6.3),
      });
    }
  }
  jag(y) {
    const s = this.seed, t = this.t * 2;
    return Math.round(7 * Math.sin(y * 0.19 + s + t) + 5 * Math.sin(y * 0.071 + s * 1.7 - t) + 3 * Math.sin(y * 0.53 + s * 0.3));
  }
  // the edge position (art px along the wind) for this moment
  edge() {
    const W = this.L.W;
    if (this.mode === 'hold') return W + EDGE;
    return -EDGE + (W + 2 * EDGE) * smooth(clamp(this.t / this.dur, 0, 1));
  }
  speed() {
    return (this.L.W + 2 * EDGE) / this.dur;
  }
  step(dt) {
    this.t += dt;
    for (const b of this.band) { b.rot += b.rs * dt; b.fl += b.fs * dt; }
    if (this.mode === 'reveal' && !reduced) {
      // the trailing edge sheds leaves that are left behind fluttering over the scene
      const L = this.L, e = this.edge(), sp = this.speed();
      const n = Math.random() < dt * L.H * 0.35 ? 1 + ((L.H / 120) | 0) : 0;
      for (let i = 0; i < n; i++) {
        const y = rnd(0, L.H), s = e + this.jag(y) + rnd(-2, 8);
        if (s < -10 || s > L.W + 10) continue;
        const big = Math.random() < 0.3;
        L.add(leaf({ x: this.dir > 0 ? s : L.W - s, y, vx: this.dir * sp * rnd(0.12, 0.45), wind: this.dir * rnd(20, 60), vy: rnd(-60, -10), drag: 1.8, g: 44, term: 36, life: 3.5, big, k: big ? pick(BIG_KINDS) : pick(ALL) }));
      }
    }
    if (this.mode !== 'hold' && this.t >= this.dur) {
      if (this.mode === 'reveal') { this.L.wipe = null; this.res?.(); return; }
      this.mode = 'hold';
      this.res?.();
    }
    if (this.mode === 'hold' && this.dropIn != null && (this.dropIn -= 1) < 0) this.L.wipe = null;
  }
  draw(ctx) {
    const L = this.L, W = L.W, H = L.H;
    ctx.fillStyle = BODY;
    if (reduced) {
      // no sweeping: a plain quick fade
      const k = this.mode === 'hold' ? 1 : clamp(this.t / this.dur, 0, 1);
      ctx.globalAlpha = Math.round((this.mode === 'reveal' ? 1 - k : k) * 4) / 4;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
      return;
    }
    if (this.mode === 'hold') { ctx.fillRect(0, 0, W, H); return; }
    const e = this.edge(), rev = this.mode === 'reveal', d = this.dir;
    for (let y = 0; y < H; y++) {
      const s = clamp(e + this.jag(y), 0, W);
      // cover: the body is behind the front (s < edge); reveal: ahead of the trailing edge
      const a = rev ? s : 0, b = rev ? W : s;
      if (b > a) ctx.fillRect(d > 0 ? a : W - b, y, b - a, 1);
    }
  }
  // the ragged front of leaves rides on the edge, over the body
  drawTop(ctx) {
    if (reduced || this.mode === 'hold') return;
    const L = this.L, e = this.edge(), W = L.W;
    for (const b of this.band) {
      const At = leafAtlas(b.big ? 'b' : 'm'), c = At.cell;
      const s = e + this.jag(b.y) + b.dx + Math.sin(this.t * 9 + b.bob) * 2;
      const x = this.dir > 0 ? s : W - s;
      if (x < -c || x > W + c) continue;
      ctx.drawImage(At.canvas, At.sx(Math.floor(b.rot), tumbleOf(b.fl)), At.sy(b.k), c, c, Math.round(x - c / 2), Math.round(b.y + Math.sin(this.t * 6 + b.bob) * 2 - c / 2), c, c);
    }
  }
}
let lastDir = 1;
// sweep the leaves in; resolves when the screen is covered (it stays covered until leafReveal)
export function leafCover({ layer = 'front', dur = 0.6, dir = Math.random() < 0.5 ? 1 : -1, sound: snd = true } = {}) {
  const L = layerOf(layer);
  L.wake();
  lastDir = dir;
  const w = new Wipe(L, 'cover', reduced ? Math.min(dur, 0.3) : dur, dir);
  L.wipe?.res?.();
  L.wipe = w;
  if (snd) sound.play('leaf_gust', { volume: 0.55, pitch: rnd(0.9, 1.1) });
  if (!reduced) {
    // a scatter of leaves racing ahead of the front
    const sp = w.speed();
    for (let i = 0; i < 10 + L.H / 14; i++) {
      const s = rnd(-EDGE - 30, -6), big = Math.random() < 0.25;
      L.add(leaf({ x: dir > 0 ? s : L.W - s, y: rnd(-0.05, 1.02) * L.H, vx: dir * sp * rnd(1.05, 1.45), wind: dir * sp * rnd(0.9, 1.2), vy: rnd(-30, 20), drag: 0.4, g: 10, term: 50, life: 3, big, k: big ? pick(BIG_KINDS) : pick(ALL) }));
    }
  }
  return new Promise((res) => (w.res = res));
}
// blow the cover away (draws the full cover at once first, so whatever was swapped
// underneath never flashes); resolves when the scene is uncovered
export function leafReveal({ layer = 'front', dur = 0.75, dir = lastDir, sound: snd = false } = {}) {
  const L = layerOf(layer);
  L.wake();
  const w = new Wipe(L, 'reveal', reduced ? Math.min(dur, 0.3) : dur, dir);
  L.wipe?.res?.();
  L.wipe = w;
  L.draw();
  if (snd) sound.play('leaf_gust', { volume: 0.35, pitch: rnd(1.05, 1.2) });
  return new Promise((res) => (w.res = res));
}
// let go of a held cover (the layer goes quiet a couple of frames later, once whatever
// replaced it - the 3D fade - has been drawn)
export function leafRelease({ layer = 'front' } = {}) {
  const w = layerOf(layer).wipe;
  if (w && w.mode === 'hold') w.dropIn = 2;
}
// cover the screen with leaves, run swap() underneath, then blow them away
export async function leafTransition(swap, { layer = 'front', dur = 0.6, revealDur = 0.75, dir } = {}) {
  await leafCover({ layer, dur, dir });
  try {
    await swap?.();
  } finally {
    // let the new scene draw once before the leaves blow off it
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await leafReveal({ layer, dur: revealDur });
  }
}

// ---------------------------------------------------------------- the 3D fade
// Scene fades (cutscenes, Nana's cabin, the end of the day) go through here. Short
// fades (up to 1.25 s) are leaf wipes on the layer under the interface: the leaves cover the
// screen, the 3D fade goes black underneath, and fading back in blows the cover
// away. Longer fades are the slow, emotional ones (a funeral, falling
// asleep): they stay soft, with a few leaves drifting down.
export async function screenFade(game, to, dur = 0.6) {
  const U = game.pipeline.post.uFade;
  // an older fade still running would fight this one: let it finish on a dummy
  for (const tw of game.tweens || []) if (tw.obj === U) tw.obj = { value: 0 };
  if (dur <= 0.05 || typeof document === 'undefined' || document.hidden) {
    back.wipe = null;
    U.value = to;
    return;
  }
  const wipe = !reduced && dur <= 1.25 && (to > 0.99 || to < 0.01);
  // nothing to sweep: already black (a cover) or already clear (a reveal)
  if (wipe && to > 0.5 && U.value > 0.99) return;
  if (wipe && to < 0.5 && U.value < 0.01 && back.wipe?.mode !== 'hold') return;
  if (!wipe) {
    if (to > U.value && usable()) {
      // a few leaves see the light out
      back.wake();
      for (let i = 0; i < 7; i++) back.add(leaf({ x: rnd(0, back.W), y: rnd(-30, -6), vx: rnd(-10, 10), wind: rnd(8, 22), g: 12, term: rnd(14, 24), life: dur + 4, k: pick(ALL) }));
    }
    return game.tween(U, 'value', to, dur);
  }
  if (to > 0.5) {
    await leafCover({ layer: 'back', dur: clamp(dur * 1.2, 0.45, 0.8) });
    U.value = to;
    leafRelease({ layer: 'back' });
  } else {
    const p = leafReveal({ layer: 'back', dur: clamp(dur * 1.3, 0.5, 0.9), sound: true });
    U.value = to;
    await p;
  }
}
