// The crank: Bessie's chainring, crank arm and pedal, the chain and the rear cogs, as a
// pixel-art widget in the bottom right corner. It is how Hank pedals:
//
//   touch / mouse  drag round the chainring (it turns with your finger; clockwise is forwards,
//                  backwards back-pedals into the coaster brake)
//   keyboard       W and S (or Up and Down) are the two feet: each time the other one goes
//                  down the crank winds on half a turn. Holding a key does nothing.
//   gamepad        turn the right stick in circles, or alternate RT and LT
//
// Nothing turns it but you (see core/pedal.js): stop spinning and Bessie coasts. It also shows
// what the drivetrain is doing: the chain hops across three rear cogs as the gears change, the
// spokes behind them run with the real back wheel (so you can see the pedals catch it, or
// freewheel), and how winded Hank is: the brass heats up red, the chain sags, sweat flicks off.
//
// Drawn on a small canvas at art resolution and shown at the kit's whole-number scale. The
// pixels are painted straight into one reused buffer, and only when something visible moved.
import { input } from '../core/input.js';
import { el } from './kit.js';
import './crank.css';

const W = 88, H = 68;
const RC = [60, 33]; // chainring centre
const CC = [16, 38]; // rear hub
const TEETH = 24, R_TIP = 23.2, R_ROOT = 20.5, R_BODY = 15, R_HUB = 5.5, R_PITCH = 21.6;
const ARM = 16; // crank arm length
const COGS = [{ r: 10, n: 14 }, { r: 7.5, n: 11 }, { r: 5.2, n: 8 }]; // gears 1..3 (big to small)
const RIM0 = 14.5, RIM1 = 16.2;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrap = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);

// 6-tone ramps: outline-ish dark .. highlight
const BRASS = [0x5e3410, 0x8e5a1a, 0xb87e26, 0xd8a038, 0xf2cc6a, 0xfff0b0];
const HOT = [0x5e1210, 0x962018, 0xd23a24, 0xf2603e, 0xff9a7a, 0xffd8c0];
const STEEL = [0x2e3440, 0x5e6674, 0x8a929e, 0xb4bcc8, 0xdfe4ea, 0xffffff];
const DARKSTEEL = [0x1e2028, 0x2e3440, 0x4a505c, 0x5e6674, 0x8a929e, 0xb4bcc8];
const WOOD = [0x42210e, 0x643418, 0x8e4e24, 0xb87036, 0xd8914e, 0xf4c07a];
const INK = 0x1e1418;
const LV = (() => { const l = [-0.55, -0.5, 0.67], m = Math.hypot(...l); return l.map((v) => v / m); })();
const toneIdx = (d) => (d > 0.93 ? 5 : 1 + clamp(Math.floor(((d + 0.35) / 1.4) * 4), 0, 3));
// 0xRRGGBB -> a pixel in the canvas's (little-endian RGBA) buffer
const px = (c) => (0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff)) >>> 0;
const mixC = (a, b, t) => {
  const ch = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

// polar lookup for a disc of pixels around a centre (precomputed once)
function polarTable(cx, cy, R) {
  const list = [];
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy, r = Math.hypot(dx, dy);
    if (r <= R) list.push([y * W + x, r, Math.atan2(dy, dx), dx / (r || 1), dy / (r || 1)]);
  }
  const n = list.length;
  const T = { n, idx: new Int32Array(n), r: new Float32Array(n), th: new Float32Array(n), cx: new Float32Array(n), cy: new Float32Array(n) };
  list.forEach(([i, r, th, ux, uy], k) => { T.idx[k] = i; T.r[k] = r; T.th[k] = th; T.cx[k] = ux; T.cy[k] = uy; });
  return T;
}
// torus shading across a ring band r0..r1 (top-left light), as a tone index
const torusTone = (ux, uy, r, r0, r1) => {
  const t = clamp(((r - r0) / (r1 - r0)) * 2 - 1, -1, 1), z = Math.sqrt(Math.max(0, 1 - t * t));
  return toneIdx(ux * t * LV[0] + uy * t * LV[1] + z * LV[2]);
};

export class CrankHUD {
  constructor(game) {
    this.game = game;
    this.root = el('div', 'crank-hud');
    this.canvas = el('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(W, H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.tmp = new Uint32Array(W * H);
    this.hit = el('div', 'crank-hit');
    this.keys = el('div', 'ck', '<span class="k-key">W</span><span class="k-key">S</span>');
    this.keyA = this.keys.children[0];
    this.keyB = this.keys.children[1];
    this.keyMode = 'kb';
    this.root.append(this.canvas, this.keys, this.hit);
    document.getElementById('ui')?.appendChild(this.root);
    this.on = false;
    // ---- palettes (packed once): the chainring heats from brass to red as Hank tires
    this.ringPal = [0, 0.25, 0.5, 0.75, 1].map((h) => Uint32Array.from(BRASS.map((c, i) => px(mixC(c, HOT[i], h * 0.8)))));
    this.steel = Uint32Array.from(STEEL.map(px));
    this.dsteel = Uint32Array.from(DARKSTEEL.map(px));
    this.wood = Uint32Array.from(WOOD.map(px));
    this.gold = Uint32Array.from([0x6e3a0e, 0xa8640e, 0xd08a18, 0xf0b42a, 0xffdc5a, 0xfff8c8].map(px));
    this.C = {
      ink: px(INK), tyre: px(0x221e20), tyreHi: px(0x4a4448), spoke: px(0x9aa2ae), blur: px(0x5e6674),
      cream: px(0xfff6e2), creamD: px(0xc4b49c), drop: px(0x9ad8ff), dropHi: px(0xffffff),
      pin: px(0x2a2630), plate: px(0x8a8890), plateHi: px(0xc4c2ca), inner: px(0x4a4650),
    };
    // ---- geometry tables
    this.ring = polarTable(RC[0], RC[1], R_TIP + 0.5);
    const Tr = this.ring;
    this.ringTone = new Uint8Array(Tr.n);
    this.flatTone = new Uint8Array(Tr.n);
    for (let k = 0; k < Tr.n; k++) {
      this.ringTone[k] = torusTone(Tr.cx[k], Tr.cy[k], Tr.r[k], R_BODY, R_ROOT);
      this.flatTone[k] = toneIdx(Tr.cx[k] * 0.45 * LV[0] + Tr.cy[k] * 0.45 * LV[1] + 0.89 * LV[2]);
    }
    this.hub = polarTable(CC[0], CC[1], RIM1 + 0.5);
    const Th = this.hub;
    this.hubTone = new Uint8Array(Th.n);
    this.rimTone = new Uint8Array(Th.n);
    for (let k = 0; k < Th.n; k++) {
      this.hubTone[k] = toneIdx(Th.cx[k] * 0.5 * LV[0] + Th.cy[k] * 0.5 * LV[1] + 0.87 * LV[2]);
      this.rimTone[k] = torusTone(Th.cx[k], Th.cy[k], Th.r[k], RIM0, RIM1);
    }
    // the chain's path (rebuilt when the gear or the sag changes)
    this.path = new Float32Array(2 * 640);
    this.pathO = new Int8Array(2 * 640);
    this.pathN = 0;
    this.pathKey = -1;
    // sweat drops
    this.drops = Array.from({ length: 6 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, t: 0 }));
    this.dropT = 0;
    // what was drawn last (redraw only on change)
    this.last = { a: 1e9, w: 1e9, heat: -1, gear: -1, sag: -1, hint: -1, held: -1 };
    this.t = 0;
    this.idleT = 0;
    this.wheelPrev = 0;
    this.wheelRate = 0;
    // ---- touch and mouse: drag round the chainring
    this.ptr = null;
    this.centre = { x: 0, y: 0, u: 1 };
    this.hit.addEventListener('pointerdown', (e) => this.grab(e));
    window.addEventListener('pointermove', (e) => e.pointerId === this.ptr && this.drag(e), { passive: true });
    const end = (e) => e.pointerId === this.ptr && this.letGo();
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // safety nets: no fingers left on the glass, or the page went away, means nothing is held
    window.addEventListener('touchend', (e) => e.touches.length === 0 && this.letGo(), { passive: true });
    window.addEventListener('touchcancel', (e) => e.touches.length === 0 && this.letGo(), { passive: true });
    window.addEventListener('blur', () => this.letGo());
    window.addEventListener('pagehide', () => this.letGo());
    document.addEventListener('visibilitychange', () => document.hidden && this.letGo());
    window.addEventListener('orientationchange', () => this.letGo());
  }

  // ---------------------------------------------------------------- dragging
  grab(e) {
    // a first finger on the glass while we think another is still down: that one is long gone
    if (this.ptr != null && !(e.pointerType === 'touch' && e.isPrimary)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    this.ptr = e.pointerId;
    this.ptrType = e.pointerType;
    try { this.hit.setPointerCapture(e.pointerId); } catch { /* synthetic, or already gone */ }
    const r = this.canvas.getBoundingClientRect();
    const u = r.width / W || 1;
    this.centre.x = r.left + RC[0] * u;
    this.centre.y = r.top + RC[1] * u;
    this.centre.u = u;
    this.lastA = Math.atan2(e.clientY - this.centre.y, e.clientX - this.centre.x);
    this.root.classList.add('held');
  }
  drag(e) {
    const dx = e.clientX - this.centre.x, dy = e.clientY - this.centre.y;
    // too close to the axle to tell which way it's going
    if (Math.hypot(dx, dy) < 4 * this.centre.u) return;
    const a = Math.atan2(dy, dx);
    const d = wrap(a - this.lastA);
    this.lastA = a;
    if (Math.abs(d) < 1.4) input.pedal.turn(d); // (y is down: clockwise on screen is forwards)
  }
  letGo() {
    if (this.ptr == null) return;
    try { if (this.hit.hasPointerCapture?.(this.ptr)) this.hit.releasePointerCapture(this.ptr); } catch { /* gone */ }
    this.ptr = null;
    this.root.classList.remove('held');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.game, b = g.bike;
    const show = !!b && g.mode === 'ride' && !g.onFoot && !g.ui.dialogueTick && !g.ui.menuStack.length && !g.ui.hud?.classList.contains('hidden');
    if (show !== this.on) {
      this.on = show;
      this.root.classList.toggle('on', show);
      if (!show) this.letGo();
      this.last.a = 1e9;
    }
    if (!show || dt <= 0) return;
    this.t += dt;
    const a = input.pedal.angle;
    // the key hints: which foot goes down next (hidden on touch screens, and once you've got it)
    const tm = input.lastDevice === 'touch';
    const mode = tm ? 'touch' : input.lastDevice === 'gamepad' ? 'pad' : 'kb';
    if (mode !== this.keyMode) {
      this.keyMode = mode;
      this.keyA.textContent = mode === 'pad' ? 'RT' : 'W';
      this.keyB.textContent = mode === 'pad' ? 'LT' : 'S';
    }
    const spinning = Math.abs(b.spinRate || 0) > 1.5 || this.ptr != null;
    this.idleT = spinning ? 0 : this.idleT + dt;
    const learning = Math.abs(a) < 200 || (this.idleT > 2.5 && b.speed < 1); // (the first ~30 turns)
    const showKeys = !tm && learning;
    if (this.keys.classList.contains('on') !== showKeys) this.keys.classList.toggle('on', showKeys);
    if (showKeys) {
      const next = input.pedal.nextFoot;
      const hotA = next >= 0, hotB = next < 0;
      if (this.keyA.classList.contains('hot') !== hotA) this.keyA.classList.toggle('hot', hotA);
      if (this.keyB.classList.contains('hot') !== hotB) this.keyB.classList.toggle('hot', hotB);
    }
    // buzz a little each half turn under a thumb (phones that can)
    if (this.ptr != null && this.ptrType === 'touch') {
      const half = Math.floor(a / Math.PI);
      if (half !== this.half) { this.half = half; g.touch?.buzz?.(4); }
    }
    // the back wheel's speed (fast: the spokes smear)
    const wa = b.view?.wheelAngle ?? b.wheelAngle ?? 0;
    const wr = (wa - this.wheelPrev) / dt;
    this.wheelPrev = wa;
    this.wheelRate += (wr - this.wheelRate) * Math.min(1, dt * 10);
    const tired = clamp(b.tired || 0, 0, 1);
    const heat = b.exhausted ? 4 : clamp(Math.round(tired * 4), 0, 4);
    const sag = Math.round((0.5 + tired * 4.5) * 2) / 2;
    const gear = clamp(b.gear || 1, 1, 3);
    const hint = tm && this.idleT > 1.5 && b.speed < 1 && this.ptr == null ? (this.t % 1.2 < 0.85 ? 1 : 0) : 0;
    const held = this.ptr != null ? 1 : 0;
    // sweat flicks off the chainring once he's spent
    let drops = false;
    if (tired > 0.8) {
      this.dropT -= dt;
      if (this.dropT <= 0) {
        this.dropT = 0.28 + Math.random() * 0.3;
        for (const d of this.drops) {
          if (d.t > 0) continue;
          d.x = RC[0] + (Math.random() - 0.5) * 22; d.y = RC[1] - 18; d.vx = (Math.random() - 0.5) * 50; d.vy = -30 - Math.random() * 25; d.t = 0.7;
          break;
        }
      }
    }
    for (const d of this.drops) {
      if (d.t <= 0) continue;
      drops = true;
      d.t -= dt;
      d.vy += 160 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
    }
    const qa = Math.round((a * 96) / TAU), qw = Math.round((wa * 64) / TAU);
    const L = this.last;
    if (!drops && qa === L.a && (qw === L.w || Math.abs(this.wheelRate) > 12) && heat === L.heat && gear === L.gear && sag === L.sag && hint === L.hint && held === L.held) return;
    L.a = qa; L.w = qw; L.heat = heat; L.gear = gear; L.sag = sag; L.hint = hint; L.held = held;
    this.draw((qa * TAU) / 96, (qw * TAU) / 64, heat, gear, sag, hint, held, tired);
  }

  // ---------------------------------------------------------------- painting
  draw(a, wheel, heat, gear, sag, hint, held, tired) {
    const B = this.buf, C = this.C;
    B.fill(0);
    // ---- the back wheel: tyre and rim, and spokes that run with the real wheel
    const Th = this.hub;
    const fast = Math.abs(this.wheelRate) > 12;
    for (let k = 0; k < Th.n; k++) {
      const r = Th.r[k], i = Th.idx[k];
      if (r > RIM1) continue;
      if (r >= RIM0) { B[i] = r > RIM1 - 0.9 ? (Th.cy[k] < -0.5 ? C.tyreHi : C.tyre) : this.steel[this.rimTone[k]]; continue; }
      if (r < 2.4) continue;
      if (fast) { if (Math.abs(r - 8) < 0.5 || Math.abs(r - 12) < 0.5) B[i] = C.blur; continue; }
      const ph = Th.th[k] - wheel, s = (TAU / 8);
      const dd = ph - s * Math.round(ph / s);
      if (Math.abs(Math.sin(dd)) * r < 0.55) B[i] = C.spoke;
    }
    // ---- the cassette: three cogs on the hub, the chain on the one in use
    const act = COGS[gear - 1];
    const ac = (a * R_PITCH) / act.r;
    for (let k = 0; k < Th.n; k++) {
      const r = Th.r[k], i = Th.idx[k];
      if (r > COGS[0].r + 1.4) continue;
      if (r < 2.3) { B[i] = r < 1.2 ? this.steel[5] : this.dsteel[1]; continue; }
      // front (smallest) cog first; a gap between its teeth shows the bigger one behind
      for (let c = 2; c >= 0; c--) {
        const G = COGS[c], body = G.r - 0.9, tip = G.r + 1.4;
        if (r > tip) continue;
        let on = r <= body;
        if (!on) {
          const u = ((Th.th[k] - ac) * G.n) / TAU;
          const f = u - Math.floor(u);
          on = Math.abs(f - 0.5) < 0.3 - (r - body) * 0.06;
        }
        if (!on) continue;
        const pal = c === gear - 1 ? this.steel : this.dsteel;
        B[i] = pal[r > G.r - 2.2 ? this.hubTone[k] : Math.max(0, this.hubTone[k] - 1)];
        break;
      }
    }
    // ---- the chainring: teeth, the ring, five spider arms and their bolts, the axle
    const Tr = this.ring, pal = this.ringPal[heat];
    const arm5 = TAU / 5;
    for (let k = 0; k < Tr.n; k++) {
      const r = Tr.r[k], i = Tr.idx[k];
      if (r > R_TIP) continue;
      const ph = Tr.th[k] - a;
      if (r > R_ROOT) {
        const u = (ph * TEETH) / TAU, f = u - Math.floor(u);
        if (Math.abs(f - 0.5) < 0.33 - (r - R_ROOT) * 0.075) B[i] = pal[Math.max(1, this.flatTone[k] - 1)];
        continue;
      }
      const dd = ph - arm5 * Math.round(ph / arm5);
      if (r >= R_BODY) {
        // chainring bolts where the arms meet the ring
        B[i] = Math.abs(r - 17.4) < 1.3 && Math.abs(dd) * r < 1.3 ? this.steel[r < 17.2 ? 4 : 2] : pal[this.ringTone[k]];
        continue;
      }
      if (r >= R_HUB) {
        if (Math.abs(Math.sin(dd)) * r < 1.6 + (r - R_HUB) * 0.09 && Math.cos(dd) > 0) B[i] = pal[Math.max(1, this.flatTone[k] - (Math.sin(dd) > 0 ? 1 : 0))];
        continue;
      }
      B[i] = r < 1.6 ? this.steel[5] : this.steel[Math.max(1, this.flatTone[k])];
    }
    // ---- the chain: over the ring's teeth, along the top, round the cog, back along the bottom
    this.buildPath(act.r + 0.3, sag);
    const P = this.path, O = this.pathO, off = a * R_PITCH;
    for (let n = 0; n < this.pathN; n++) {
      let ph = (n * 0.5 - off) % 6;
      if (ph < 0) ph += 6;
      const col = ph < 1 ? C.pin : ph < 3.5 ? C.plateHi : C.inner;
      const x = P[2 * n], y = P[2 * n + 1];
      this.put(x, y, col);
      this.put(x + O[2 * n], y + O[2 * n + 1], ph < 1 ? C.pin : ph < 3.5 ? C.plate : C.pin);
    }
    // ---- the crank arm and its pedal (the pedal stays level)
    const fa = a - Math.PI / 2;
    const ux = Math.cos(fa), uy = Math.sin(fa);
    for (let s = 0; s <= ARM; s += 0.5) {
      const x = RC[0] + ux * s, y = RC[1] + uy * s;
      this.put(x - uy, y + ux, this.dsteel[3]);
      this.put(x + uy, y - ux, this.dsteel[2]);
      this.put(x, y, this.dsteel[4]);
    }
    const ex = Math.round(RC[0] + ux * ARM), ey = Math.round(RC[1] + uy * ARM);
    const top = held ? this.gold : this.wood;
    for (let dx = -4; dx <= 4; dx++) {
      for (let dy = -2; dy <= 1; dy++) {
        const end = dx === -4 || dx === 4;
        this.put(ex + dx, ey + dy, end ? this.gold[dy < 0 ? 4 : 2] : top[dy === -2 ? 5 : dy === -1 ? 4 : dy === 0 ? 3 : 1]);
      }
    }
    this.put(ex, ey - 1, this.steel[5]);
    // ---- "spin me": a dotted arrow round the ring while nothing is happening (touch screens)
    if (hint) {
      for (let s = -2.6; s < 1.9; s += 0.07) {
        if (Math.floor(s / 0.07) % 3 === 0) continue;
        this.put(RC[0] + Math.cos(s) * 26.5, RC[1] + Math.sin(s) * 26.5, C.cream);
      }
      const hx = RC[0] + Math.cos(1.95) * 26.5, hy = RC[1] + Math.sin(1.95) * 26.5;
      for (const [dx, dy] of [[0, 0], [1, 0], [2, 0], [0, -1], [1, -1], [0, -2], [0, 1], [-1, 0]]) this.put(hx + dx - 1, hy + dy, C.cream);
    }
    // ---- sweat
    for (const d of this.drops) {
      if (d.t <= 0) continue;
      this.put(d.x, d.y, C.dropHi);
      this.put(d.x, d.y + 1, C.drop);
    }
    // ---- ink outline round everything, then out to the canvas
    this.outline(this.C.ink);
    this.ctx.putImageData(this.img, 0, 0);
  }
  put(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < W && y < H) this.buf[y * W + x] = c;
  }
  outline(ink) {
    const B = this.buf, S = this.tmp;
    S.set(B);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (S[i]) continue;
        if ((x > 0 && S[i - 1]) || (x < W - 1 && S[i + 1]) || (y > 0 && S[i - W]) || (y < H - 1 && S[i + W])) B[i] = ink;
      }
    }
  }
  // the chain's centre line, sampled every half pixel, with which way it's thick
  buildPath(rc, sag) {
    const key = Math.round(rc * 10) * 100 + Math.round(sag * 2);
    if (key === this.pathKey) return;
    this.pathKey = key;
    const P = this.path, O = this.pathO;
    let n = 0;
    const add = (x, y, ox, oy) => {
      if (n >= 640) return;
      P[2 * n] = x; P[2 * n + 1] = y; O[2 * n] = ox; O[2 * n + 1] = oy;
      n++;
    };
    const R = R_PITCH;
    // top run: cog top -> ring top
    const x0 = CC[0], y0 = CC[1] - rc, x1 = RC[0], y1 = RC[1] - R;
    let len = Math.hypot(x1 - x0, y1 - y0);
    for (let s = 0; s < len; s += 0.5) add(x0 + ((x1 - x0) * s) / len, y0 + ((y1 - y0) * s) / len, 0, 1);
    // round the front of the ring
    for (let s = 0; s < Math.PI * R; s += 0.5) {
      const t = -Math.PI / 2 + s / R;
      add(RC[0] + Math.cos(t) * R, RC[1] + Math.sin(t) * R, -Math.sign(Math.cos(t)) || 0, -Math.round(Math.sin(t)));
    }
    // bottom run: ring bottom -> cog bottom, sagging in the middle
    const x2 = RC[0], y2 = RC[1] + R, x3 = CC[0], y3 = CC[1] + rc;
    len = Math.hypot(x3 - x2, y3 - y2);
    for (let s = 0; s < len; s += 0.5) {
      const u = s / len;
      add(x2 + (x3 - x2) * u, y2 + (y3 - y2) * u + 4 * sag * u * (1 - u), 0, -1);
    }
    // round the back of the cog
    for (let s = 0; s < Math.PI * rc; s += 0.5) {
      const t = Math.PI / 2 + s / rc;
      add(CC[0] + Math.cos(t) * rc, CC[1] + Math.sin(t) * rc, Math.sign(-Math.cos(t)) > 0 ? 1 : 0, -Math.round(Math.sin(t)));
    }
    this.pathN = n;
  }
}
