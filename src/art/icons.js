// Pixel-art icons: Harold's keepsakes, HUD glyphs, skills, touch buttons and
// little UI glyphs. Drawn in code like the food sprites: every part is a shaded
// primitive (balls, tubes, puffy pillows, flat faces, rings) lit from the top
// left, quantised to 4 tones + a specular tone, then outlined dark.
//
//   icon('lantern')       -> Pix 32x32      iconURL('lantern') -> data URL
//   glyph('check')        -> Pix 16x16      glyphURL('check')
//   ICON_NAMES, GLYPH_NAMES, hasIcon(name)
import { Pix } from './pixel.js';
import { ramp, mixc } from './foodsprites.js';

const LV = (() => { const l = [-0.55, -0.5, 0.67], m = Math.hypot(...l); return l.map((v) => v / m); })();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const INK = 0x1e1418;

// ---------------------------------------------------------------- palettes (6 tones: outline, d2, d1, base, l1, hl)
const R = {
  wood: ramp(0xa8683a, { hl: 0xf0c890 }),
  darkwood: ramp(0x6e3c22, { l1: 0x8e5634, hl: 0xc89060 }),
  timber: ramp(0xc89058, { hl: 0xffe2b0 }),
  leather: ramp(0x9a5a2e, { hl: 0xe8b07a }),
  tan: ramp(0xc48a50, { hl: 0xffdcaa }),
  gold: ramp(0xf0b42a, { ol: 0x6e3a0e, d2: 0xa8640e, d1: 0xd08a18, l1: 0xffdc5a, hl: 0xfff8c8 }),
  brass: ramp(0xd8a038, { ol: 0x5e3410, hl: 0xfff0b0 }),
  copper: ramp(0xc8703a, { hl: 0xffd0a0 }),
  silver: ramp(0xb8c0cc, { ol: 0x3a4250, d2: 0x6e7684, d1: 0x949caa, l1: 0xe0e6ee, hl: 0xffffff }),
  iron: ramp(0x6a707c, { ol: 0x22242c, hl: 0xc8d0dc }),
  black: ramp(0x3a3640, { ol: 0x141218, d2: 0x221e26, d1: 0x2e2a34, l1: 0x5a5662, hl: 0x9a96a4 }),
  red: ramp(0xd03c30, { hl: 0xffc0a8 }),
  maroon: ramp(0x9a2a2a, { hl: 0xf09a8a }),
  orange: ramp(0xf07e2a, { hl: 0xffe0a0 }),
  pumpkin: ramp(0xf28a2a, { hl: 0xffe8a8 }),
  yellow: ramp(0xf8d040, { hl: 0xfffbe0 }),
  cream: ramp(0xfbf0da, { ol: 0x7e5a4a, d2: 0xd0b49a, d1: 0xe8d6be, l1: 0xfff8ea, hl: 0xffffff }),
  paper: ramp(0xf2e2bc, { ol: 0x6a5038, d2: 0xc8aa7a, d1: 0xe0c898, l1: 0xfaf0d8, hl: 0xffffff }),
  bone: ramp(0xf0e6cc, { ol: 0x5e4c3e, d2: 0xb8a684, d1: 0xd8caa8, l1: 0xfaf4e2, hl: 0xffffff }),
  blue: ramp(0x4a78c8, { hl: 0xd0e8ff }),
  navy: ramp(0x34508e, { hl: 0xa8c4f0 }),
  sky: ramp(0x8ac4f0, { hl: 0xffffff }),
  glass: ramp(0xa8d8ec, { ol: 0x2e4e6e, hl: 0xffffff }),
  green: ramp(0x5aa83a, { hl: 0xe0ffb0 }),
  moss: ramp(0x6a8a3a, { hl: 0xd8f0a0 }),
  olive: ramp(0x7a7440, { hl: 0xe0d8a0 }),
  lime: ramp(0x9ad040, { hl: 0xf4ffd0 }),
  teal: ramp(0x3a9a8a, { hl: 0xc8fff0 }),
  purple: ramp(0x7a4ab0, { hl: 0xe0c8ff }),
  pink: ramp(0xf08cb0, { hl: 0xffe8f0 }),
  cocoa: ramp(0x86492f, { l1: 0xa8664a, hl: 0xe0b08c }),
  ginger: ramp(0xe88a3a, { hl: 0xffe0b0 }),
  white: ramp(0xf6f2ea, { ol: 0x5a5470, d2: 0xc0bccc, d1: 0xdcd8e2, l1: 0xfcfaf6, hl: 0xffffff }),
  snow: ramp(0xe6f2fc, { ol: 0x40507a, d2: 0xa4b8d8, d1: 0xc8d8ee, hl: 0xffffff }),
  cloud: ramp(0xd8dce8, { ol: 0x4a4e66, d2: 0x9aa0b8, d1: 0xbcc2d4, l1: 0xeef0f6, hl: 0xffffff }),
  steam: ramp(0xf4f4f8, { ol: 0xa8a4b8, d2: 0xd0ccda, d1: 0xe4e2ea, l1: 0xffffff, hl: 0xffffff }),
  fire: ramp(0xff9a2a, { ol: 0x8a2a10, d2: 0xd0401a, d1: 0xf06a1e, l1: 0xffd050, hl: 0xfff8c0 }),
  steel: ramp(0x9aa4b4, { ol: 0x2e3440, hl: 0xffffff }),
  rubber: ramp(0x3a3438, { ol: 0x141012, d2: 0x221e20, d1: 0x2e2a2c, l1: 0x4e484c, hl: 0x7a7478 }),
};

// ---------------------------------------------------------------- shapes (coordinates in a 32px design grid)
const inEll = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const rrect = (x0, y0, x1, y1, r = 0) => (x, y) => {
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
  return dx * dx + dy * dy <= r * r + 1e-6;
};
const inPoly = (pts) => (x, y) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const or = (...fs) => (x, y) => { for (let i = 0; i < fs.length; i++) if (fs[i](x, y)) return true; return false; };
const and = (...fs) => (x, y) => { for (let i = 0; i < fs.length; i++) if (!fs[i](x, y)) return false; return true; };
const not = (f) => (x, y) => !f(x, y);
const star = (cx, cy, r0, r1, n = 5, a0 = -Math.PI / 2) => {
  const pts = [];
  for (let k = 0; k < n * 2; k++) { const a = a0 + (k / (n * 2)) * Math.PI * 2, r = k % 2 ? r1 : r0; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return inPoly(pts);
};
const segD = (x, y, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / l2, 0, 1);
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
};
const capsule = (ax, ay, bx, by, r) => (x, y) => segD(x, y, ax, ay, bx, by) <= r;
const annulus = (cx, cy, r0, r1) => (x, y) => { const d = Math.hypot(x - cx, y - cy); return d >= r0 && d <= r1; };
// a maple leaf silhouette centred at (cx, cy), radius r
// tips and notches of the flag's leaf as (degrees clockwise from up, radius); mirrored for the left half
const MAPLE = [[0, 1], [13, 0.5], [27, 0.68], [40, 0.3], [60, 1], [75, 0.66], [92, 0.84], [110, 0.4], [126, 0.64], [148, 0.3], [168, 0.2]];
const mapleLeaf = (cx, cy, r) => {
  const half = MAPLE.map(([a, k]) => [a, k]);
  const all = [...half, ...half.slice(1).reverse().map(([a, k]) => [360 - a, k])];
  const pts = all.map(([a, k]) => { const t = (a * Math.PI) / 180; return [cx + Math.sin(t) * r * k * 1.02, cy + 0.1 * r - Math.cos(t) * r * k]; });
  return or(inPoly(pts), capsule(cx, cy + r * 0.2, cx, cy + r * 1.0, Math.max(0.55, r * 0.07)));
};

// ---------------------------------------------------------------- the painter
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]], N4B = [[0, -1], [-1, 0], [1, 0], [0, 1]];
const SCRATCH = new Map();
function scratch(S) {
  let b = SCRATCH.get(S);
  if (!b) SCRATCH.set(S, (b = { M: new Uint8Array(S * S), N: new Float32Array(S * S * 3), UV: new Float32Array(S * S * 2), pre: new Uint8Array(S * S) }));
  return b;
}
class Ico {
  constructor(S = 32, design = 32) {
    this.S = S;
    this.k = S / design;
    this.p = new Pix(S, S);
    this.ol = new Int32Array(S * S).fill(-1);
    this.part = new Uint16Array(S * S);
    this.n = 0;
  }
  op(x, y) { const S = this.S; return x >= 0 && y >= 0 && x < S && y < S && this.p.data[(y * S + x) * 4 + 3] > 0; }
  px(x, y, c, ol) {
    const S = this.S;
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= S || y >= S || c == null || c < 0) return;
    this.p.set(x, y, c);
    const i = y * S + x;
    this.ol[i] = ol ?? mixc(c, INK, 0.7);
    this.part[i] = this.n;
  }
  // cover(add) emits pixels with a screen-space normal; tones are picked from the light
  paint(Rm, cover, o = {}) {
    const S = this.S, k = this.k;
    this.n++;
    const B = scratch(S), M = B.M, N = B.N, UV = B.UV, pre = B.pre;
    M.fill(0);
    cover((x, y, nx, ny, nz, u = 0, v = 0) => {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= S || y >= S) return;
      if (o.clip && !o.clip((x + 0.5) / k, (y + 0.5) / k)) return;
      if (o.under && !this.op(x, y)) return;
      const i = y * S + x;
      M[i] = 1;
      const m = Math.hypot(nx, ny, nz) || 1;
      N[i * 3] = nx / m; N[i * 3 + 1] = ny / m; N[i * 3 + 2] = nz / m;
      UV[i * 2] = u; UV[i * 2 + 1] = v;
    });
    const lo = o.lo ?? -0.35, hi = o.hi ?? 1.05, sp = o.spec ?? 0.95;
    for (let i = 0; i < S * S; i++) pre[i] = this.p.data[i * 4 + 3] > 0 ? 1 : 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (!M[i]) continue;
      const d = N[i * 3] * LV[0] + N[i * 3 + 1] * LV[1] + N[i * 3 + 2] * LV[2];
      let t;
      if (o.t !== undefined) t = o.t;
      else {
        let v = (d - lo) / (hi - lo) + (o.bias ?? 0);
        t = 1 + clamp(Math.floor(v * 4), 0, 3);
        if (d >= sp && o.spec !== false) t = 5;
      }
      // an inner line where this part sits on top of an earlier one
      if (o.line !== false && o.line !== undefined) {
        for (let q = 0; q < 4; q++) {
          const X = x + N4[q][0], Y = y + N4[q][1];
          if (X < 0 || Y < 0 || X >= S || Y >= S) continue;
          const j = Y * S + X;
          if (!M[j] && pre[j]) { t = o.line === true ? 0 : o.line; break; }
        }
      }
      let c = Rm[t];
      if (o.tex) {
        const r = o.tex((x + 0.5) / k, (y + 0.5) / k, t, UV[i * 2], UV[i * 2 + 1], d);
        if (r === -1) continue;
        if (r != null) c = r < 6 ? Rm[clamp(r | 0, 0, 5)] : r;
      }
      this.px(x, y, c, o.ol ?? Rm[0]);
    }
    return M;
  }
  // ellipsoid
  ball(cx, cy, rx, ry, Rm, o = {}) {
    const k = this.k, f = o.flat ?? 1;
    return this.paint(Rm, (add) => {
      for (let y = Math.floor((cy - ry) * k) - 1; y <= Math.ceil((cy + ry) * k); y++) for (let x = Math.floor((cx - rx) * k) - 1; x <= Math.ceil((cx + rx) * k); x++) {
        const u = ((x + 0.5) / k - cx) / rx, v = ((y + 0.5) / k - cy) / ry;
        const q = u * u + v * v;
        if (q > 1) continue;
        if (o.shape && !o.shape(u, v)) continue;
        add(x, y, u * f, v * f, Math.sqrt(1 - q), u, v);
      }
    }, o);
  }
  // puffy silhouette with a rounded bevel of radius rad (+ dome)
  pillow(inside, Rm, o = {}) {
    const S = this.S, k = this.k;
    const rad = (o.rad ?? 2.5) * k, dome = (o.dome ?? 0) * k;
    const M = new Uint8Array(S * S);
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside((x + 0.5) / k, (y + 0.5) / k)) {
      M[y * S + x] = 1;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    if (x1 < 0) return M;
    const D = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) D[i] = M[i] ? 1e9 : 0;
    const g = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : D[y * S + x]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = y * S + x; if (M[i]) D[i] = Math.min(D[i], g(x - 1, y) + 1, g(x, y - 1) + 1, g(x - 1, y - 1) + 1.414, g(x + 1, y - 1) + 1.414); }
    for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) { const i = y * S + x; if (M[i]) D[i] = Math.min(D[i], g(x + 1, y) + 1, g(x, y + 1) + 1, g(x + 1, y + 1) + 1.414, g(x - 1, y + 1) + 1.414); }
    const cxb = (x0 + x1 + 1) / 2, cyb = (y0 + y1 + 1) / 2, hw = (x1 - x0 + 1) / 2, hh = (y1 - y0 + 1) / 2;
    const H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (!M[i]) continue;
      const t = Math.min(1, (D[i] - 0.5) / rad);
      let h = rad * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
      if (dome) h += dome * Math.max(0, 1 - ((x + 0.5 - cxb) / hw) ** 2 - ((y + 0.5 - cyb) / hh) ** 2);
      H[i] = h;
    }
    const hg = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : H[y * S + x]);
    return this.paint(Rm, (add) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!M[y * S + x]) continue;
        add(x, y, -(hg(x + 1, y) - hg(x - 1, y)) / 2, -(hg(x, y + 1) - hg(x, y - 1)) / 2, 1, (x + 0.5 - x0) / (x1 - x0 + 1), (y + 0.5 - y0) / (y1 - y0 + 1));
      }
    }, o);
  }
  // flat face (constant normal or fixed tone)
  face(inside, Rm, o = {}) {
    const S = this.S, k = this.k;
    const n = o.n ?? [0, 0, 1];
    return this.paint(Rm, (add) => {
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside((x + 0.5) / k, (y + 0.5) / k)) add(x, y, n[0], n[1], n[2], (x + 0.5) / S, (y + 0.5) / S);
    }, o);
  }
  // capsule along a polyline (radius number or fn(t)), shaded as a round tube
  tube(pts, r, Rm, o = {}) {
    const k = this.k;
    const segs = [];
    let tot = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay) || 1e-6;
      segs.push({ ax, ay, dx: (bx - ax) / l, dy: (by - ay) / l, l, t0: tot });
      tot += l;
    }
    const rf = typeof r === 'function' ? r : () => r;
    let rmax = 0;
    for (let q = 0; q <= 20; q++) rmax = Math.max(rmax, rf(q / 20));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const ya = Math.floor((Math.min(...ys) - rmax) * k) - 1, yb = Math.ceil((Math.max(...ys) + rmax) * k);
    const xa = Math.floor((Math.min(...xs) - rmax) * k) - 1, xb = Math.ceil((Math.max(...xs) + rmax) * k);
    return this.paint(Rm, (add) => {
      for (let y = ya; y <= yb; y++)
        for (let x = xa; x <= xb; x++) {
          const X = (x + 0.5) / k, Y = (y + 0.5) / k;
          let bd = 1e9, bex = 0, bey = 0, bt = 0;
          for (let j = 0; j < segs.length; j++) {
            const s = segs[j];
            const tt = clamp((X - s.ax) * s.dx + (Y - s.ay) * s.dy, 0, s.l);
            const qx = s.ax + s.dx * tt, qy = s.ay + s.dy * tt, dd = Math.hypot(X - qx, Y - qy);
            if (dd < bd) { bd = dd; bex = X - qx; bey = Y - qy; bt = (s.t0 + tt) / tot; }
          }
          const rr = rf(bt);
          if (bd > rr) continue;
          const w = bd / rr;
          add(x, y, bex / rr, bey / rr, Math.sqrt(Math.max(0, 1 - w * w)), bt, w);
        }
    }, o);
  }
  // flat ring (wheels, key bows) shaded like a torus
  ring(cx, cy, r0, r1, Rm, o = {}) {
    const k = this.k;
    return this.paint(Rm, (add) => {
      for (let y = Math.floor((cy - r1) * k) - 1; y <= Math.ceil((cy + r1) * k); y++) for (let x = Math.floor((cx - r1) * k) - 1; x <= Math.ceil((cx + r1) * k); x++) {
        const dx = (x + 0.5) / k - cx, dy = (y + 0.5) / k - cy, r = Math.hypot(dx, dy) || 1e-6;
        if (r < r0 || r > r1) continue;
        const t = ((r - r0) / (r1 - r0)) * 2 - 1;
        add(x, y, (dx / r) * t, (dy / r) * t, Math.sqrt(Math.max(0, 1 - t * t)), Math.atan2(dy, dx), t);
      }
    }, o);
  }
  poly(pts, Rm, o = {}) { return o.rad ? this.pillow(inPoly(pts), Rm, o) : this.face(inPoly(pts), Rm, o); }
  // single pixels in design coordinates (snapped)
  dot(x, y, c) { this.px(x * this.k, y * this.k, c); }
  dots(list, c) { for (const [x, y] of list) this.dot(x, y, c); }
  // straight 1px line in design space
  line(x0, y0, x1, y1, c) {
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * this.k) || 1;
    for (let i = 0; i <= n; i++) this.px((x0 + ((x1 - x0) * i) / n) * this.k, (y0 + ((y1 - y0) * i) / n) * this.k, c);
  }
  tint(inside, amt, target = 0x2a1430) {
    const S = this.S, k = this.k, d = this.p.data;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (this.op(x, y) && inside((x + 0.5) / k, (y + 0.5) / k)) {
      const i = (y * S + x) * 4;
      const c = mixc((d[i] << 16) | (d[i + 1] << 8) | d[i + 2], target, amt);
      d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255;
    }
  }
  // dark outline around the silhouette, in each neighbour's own outline tone pushed towards ink
  finish(o = {}) {
    const S = this.S, src = new Uint8ClampedArray(this.p.data);
    const A = (x, y) => x >= 0 && y >= 0 && x < S && y < S && src[(y * S + x) * 4 + 3] > 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (A(x, y)) continue;
      let c = -1;
      for (let q = 0; q < 4; q++) { const dx = N4B[q][0], dy = N4B[q][1]; if (A(x + dx, y + dy)) { c = this.ol[(y + dy) * S + x + dx]; break; } }
      if (c < 0) continue;
      this.p.set(x, y, mixc(c, INK, o.ink ?? 0.55));
    }
    return this.p;
  }
}

// ---------------------------------------------------------------- shared bits
// a side-view bicycle for the skill icons, pivoting round the rear (wheelie) or front hub (stoppie)
function bike(c, { cx = 16, cy = 22, ang = 0, pivot = 'mid', wheel = 5.4, frame = R.red } = {}) {
  const half = 7.6;
  let ox = cx, oy = cy;
  const ca = Math.cos(ang), sa = Math.sin(ang);
  // hub positions before rotation (relative to centre)
  let rx = -half, fx = half, ry = 0, fy = 0;
  if (pivot === 'rear') { ox = cx - half; rx = 0; fx = half * 2; }
  if (pivot === 'front') { ox = cx + half; rx = -half * 2; fx = 0; }
  const T = (x, y) => [ox + x * ca - y * sa, oy + x * sa + y * ca];
  const [rhx, rhy] = T(rx, ry), [fhx, fhy] = T(fx, fy);
  for (const [hx, hy] of [[rhx, rhy], [fhx, fhy]]) {
    c.ring(hx, hy, wheel - 1.7, wheel, R.rubber);
    c.ring(hx, hy, wheel - 2.6, wheel - 1.7, R.silver, { spec: false });
    c.ball(hx, hy, 1.2, 1.2, R.silver);
  }
  // frame: rear hub -> seat -> bars, crank in the middle
  const mx = (rx + fx) / 2;
  const seat = T(mx - 2.2, -6.2), crank = T(mx - 0.6, 0.4), head = T(fx - 2.4, -6.8), bars = T(fx - 3.2, -9.2);
  c.tube([[rhx, rhy], seat, head, [fhx, fhy]], 1.05, frame, { lo: -0.6 });
  c.tube([[rhx, rhy], crank, head], 1.05, frame, { lo: -0.6 });
  c.tube([seat, crank], 1.0, frame, { lo: -0.6 });
  const s2 = T(mx - 3.8, -7.4), s3 = T(mx - 0.2, -7.6);
  c.tube([s2, s3], 1.15, R.black);
  c.tube([head, bars, T(fx - 5.2, -9.6)], 0.9, R.silver);
  c.ball(crank[0], crank[1], 1.6, 1.6, R.gold);
  return { T, rh: [rhx, rhy], fh: [fhx, fhy] };
}
// a curved motion arrow from angle a0 to a1 around (cx, cy)
function arcArrow(c, cx, cy, r, a0, a1, Rm = R.cream, w = 1.3) {
  const pts = [];
  for (let k = 0; k <= 14; k++) { const a = a0 + ((a1 - a0) * k) / 14; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  c.tube(pts, w, Rm, { spec: false });
  const a = a1, dir = Math.sign(a1 - a0);
  const tx = cx + Math.cos(a) * r, ty = cy + Math.sin(a) * r;
  const tanx = -Math.sin(a) * dir, tany = Math.cos(a) * dir;
  const nx = Math.cos(a), ny = Math.sin(a);
  c.poly([[tx + tanx * 3.6, ty + tany * 3.6], [tx + nx * 3, ty + ny * 3], [tx - nx * 3, ty - ny * 3]], Rm, { t: 4 });
}
// speed streaks
function streaks(c, list, col = 0xfff6e2) { for (const [x, y, l] of list) c.line(x, y, x + l, y, col); }
// a comic impact star
function boom(c, cx, cy, r0, r1, Rm = R.yellow, n = 8) { c.poly(starPts(cx, cy, r0, r1, n), Rm, { rad: 1.5 }); }
function starPts(cx, cy, r0, r1, n = 5, a0 = -Math.PI / 2) {
  const pts = [];
  for (let k = 0; k < n * 2; k++) { const a = a0 + (k / (n * 2)) * Math.PI * 2, r = k % 2 ? r1 : r0; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}
function puff(c, cx, cy, s = 1, Rm = R.cloud) {
  c.ball(cx - 3 * s, cy + 0.6 * s, 3 * s, 2.6 * s, Rm);
  c.ball(cx + 2.6 * s, cy + 0.4 * s, 3.4 * s, 2.8 * s, Rm);
  c.ball(cx, cy - 1.4 * s, 3.6 * s, 3.2 * s, Rm);
}

// ---------------------------------------------------------------- the icons (32x32 design grid)
const ICONS = {
  // ---- Harold's keepsakes (after the reference inventory)
  cane(c) {
    c.tube([[7, 29], [20.5, 8]], 1.25, R.darkwood, { lo: -0.5 });
    c.tube([[19.5, 10.5], [21.5, 7.5]], 1.6, R.gold);
    c.tube([[20.8, 8], [22, 5.6], [24.6, 4.2], [27, 5], [27.8, 7.4], [27, 9.6]], 1.55, R.darkwood, { lo: -0.5 });
    c.ball(27, 9.8, 1.6, 1.6, R.gold);
    c.tube([[6.4, 30], [7.6, 28]], 1.4, R.silver);
  },
  spyglass(c) {
    // eyepiece, leather-wrapped draw tube, brass barrel, flared objective with a lens
    const seg = (x0, x1, r, Rm, o = {}) => c.tube([[x0, 20 - (x0 - 3) * 0.28], [x1, 20 - (x1 - 3) * 0.28]], r, Rm, { line: true, ...o });
    seg(2.6, 7, 1.7, R.brass);
    seg(6.6, 14, 2.4, R.leather, { tex: (x, y, t) => (Math.floor(x) % 2 ? Math.max(1, t - 1) : t) });
    seg(13.6, 15.2, 2.9, R.gold);
    seg(15, 22, 3.1, R.brass);
    seg(21.6, 23.2, 3.7, R.gold);
    seg(23, 27.6, 4.1, R.copper);
    seg(27.2, 28.6, 4.5, R.gold);
    c.ball(29.4, 13.2, 1.2, 4, R.glass, { line: true });
    c.dots([[29, 11], [29, 12]], 0xffffff);
  },
  pack(c) {
    // bedroll on top, canvas body, flap, side pockets, buckles
    c.tube([[7.5, 7], [24.5, 7]], 3.2, R.red, { lo: -0.6 });
    c.tube([[7.5, 7], [24.5, 7]], 3.2, R.red, { lo: -0.6, tex: (x, y, t) => (Math.round(x) % 4 === 0 ? 1 : t) });
    c.pillow(rrect(7, 9.5, 25, 29, 3), R.olive, { rad: 3 });
    c.pillow(rrect(4.6, 17, 8.6, 27, 1.6), R.olive, { rad: 1.6, line: true });
    c.pillow(rrect(23.4, 17, 27.4, 27, 1.6), R.olive, { rad: 1.6, line: true });
    c.pillow(or(rrect(8.4, 9.5, 23.6, 17, 2), inEll(16, 17, 7.6, 3)), R.leather, { rad: 2, line: true });
    for (const x of [12, 20]) { c.face(rrect(x - 1, 16, x + 1, 25, 0), R.leather, { t: 2, line: true }); c.face(rrect(x - 1.6, 21, x + 1.6, 23.6, 0.4), R.brass, { t: 4, line: true }); }
    c.dots([[11, 22], [19, 22]], 0xfff6c8);
    c.tube([[6, 6.5], [6, 4], [8, 3.4]], 0.8, R.leather);
    c.tube([[26, 6.5], [26, 4], [24, 3.4]], 0.8, R.leather);
  },
  clock(c) {
    // a mantel clock: arched wooden case on little feet
    c.pillow(or(rrect(5, 14, 27, 26, 2), inEll(16, 14, 11, 10)), R.darkwood, { rad: 3 });
    c.pillow(rrect(3.6, 24.5, 28.4, 28, 1.2), R.wood, { rad: 1.2, line: true });
    c.face(rrect(6, 28, 9, 29.6, 0.5), R.darkwood, { t: 2 }); c.face(rrect(23, 28, 26, 29.6, 0.5), R.darkwood, { t: 2 });
    c.ball(16, 14.6, 8, 8, R.gold, { line: true });
    c.ball(16, 14.6, 6.4, 6.4, R.cream, { flat: 0.35, line: true });
    for (let h = 0; h < 12; h++) { const a = (h / 12) * Math.PI * 2; c.dot(16 + Math.cos(a) * 5, 14.6 + Math.sin(a) * 5, h % 3 ? 0x9a8a78 : 0x2a1a14); }
    c.line(16, 14.6, 16, 10.4, 0x2a1a14); c.line(16, 14.6, 19, 16.2, 0x2a1a14);
    c.dot(16, 14.6, 0xc8361f);
    c.face(rrect(11, 21.5, 21, 23, 0.4), R.brass, { t: 3 });
    c.dots([[12.5, 22], [16, 22], [19.5, 22]], 0x6e3a0e);
  },
  coat(c) {
    // Harold's red plaid lumberjack coat
    const plaid = (x, y, t) => { const gx = Math.floor(x) % 6, gy = Math.floor(y) % 6; if (gx === 0 || gy === 0) return Math.max(0, t - 2); if (gx === 3 && gy === 3) return Math.max(1, t - 1); return t; };
    c.tube([[9.5, 9.4], [5.6, 17], [4.6, 26.4]], 2.8, R.red, { tex: plaid });
    c.tube([[22.5, 9.4], [26.4, 17], [27.4, 26.4]], 2.8, R.red, { tex: plaid });
    c.pillow(inPoly([[9.6, 6.6], [22.4, 6.6], [25, 29.4], [7, 29.4]]), R.red, { rad: 2.4, tex: plaid });
    c.poly([[12.6, 6], [19.4, 6], [16, 15.6]], R.cream, { rad: 1, line: true });
    c.poly([[10.6, 6.2], [14.6, 6.2], [16.2, 16], [12.4, 11.4]], R.red, { rad: 1, line: true, bias: 0.15 });
    c.poly([[21.4, 6.2], [17.4, 6.2], [15.8, 16], [19.6, 11.4]], R.red, { rad: 1, line: true, bias: -0.05 });
    c.line(16, 16, 16, 29, 0x4a120e);
    for (const y of [18, 22, 26]) c.ball(17.6, y, 1, 1, R.bone);
    c.face(rrect(9.6, 20, 13.4, 22.4, 0.4), R.maroon, { t: 1, line: true });
  },
  medbag(c) {
    // the doctor's black bag, a green potion and a brass key poking out
    c.tube([[20.6, 13], [21.4, 4.6]], 2.1, R.lime, { tex: (x, y, t) => (y < 6.4 ? Math.max(t, 3) : t) });
    c.face(rrect(19.6, 1.8, 22.4, 4.2, 0.6), R.cork ?? R.tan, { t: 3 });
    c.tube([[11, 12.6], [8, 4]], 0.9, R.brass);
    c.ring(7.4, 3.4, 0.9, 2.4, R.brass);
    c.ring(16, 11.4, 3, 4.6, R.black, { clip: (x, y) => y < 12 });
    c.pillow(or(rrect(4, 13.4, 28, 28.6, 3), inEll(16, 14.4, 12, 3.6)), R.black, { rad: 3 });
    c.face(rrect(4.4, 16.6, 27.6, 17.6, 0), R.black, { t: 1 });
    c.pillow(rrect(13.4, 15.4, 18.6, 19.6, 1), R.gold, { rad: 1.2, line: true });
    c.dot(16, 17.4, 0x6e3a0e);
    c.face(rrect(14, 21.4, 18, 26.6, 0), R.red, { t: 3 }); c.face(rrect(12, 23, 20, 25, 0), R.red, { t: 3 });
    c.dots([[15, 22], [13, 24]], 0xffc0a8);
  },
  suitcase(c) {
    c.tube([[12.4, 9.6], [12.6, 6.4], [19.4, 6.4], [19.6, 9.6]], 1.4, R.darkwood);
    c.pillow(rrect(3.4, 9, 28.6, 27.6, 2.6), R.leather, { rad: 3 });
    c.face(rrect(3.6, 13.6, 28.4, 14.6, 0), R.leather, { t: 1 });
    for (const x of [8.6, 23.4]) c.pillow(rrect(x - 1.6, 9, x + 1.6, 27.6, 0.8), R.darkwood, { rad: 1, line: true });
    for (const x of [8.6, 23.4]) c.pillow(rrect(x - 2.2, 17.4, x + 2.2, 20.4, 0.6), R.brass, { rad: 0.8, line: true });
    c.pillow(rrect(14, 12.4, 18, 15.8, 0.6), R.gold, { rad: 0.8, line: true });
    c.dots([[5, 11], [6, 11], [5, 12]], 0xf0c890);
  },
  keys(c) {
    // an iron key and a brass key on a ring, crossed
    c.ring(10.4, 9.4, 3, 5.2, R.silver);
    c.tube([[13.4, 12.4], [26, 25]], 1.35, R.silver);
    c.pillow(inPoly([[22, 24], [24.6, 21.4], [27.4, 24.2], [26, 25.6], [27, 26.6], [25.6, 28], [24.6, 27]]), R.silver, { rad: 0.8 });
    c.ring(21.6, 9.4, 2.6, 4.6, R.gold);
    c.tube([[19, 12], [7, 25]], 1.3, R.gold);
    c.pillow(inPoly([[8.6, 21], [11, 23.6], [8.6, 26], [7.4, 24.8], [6, 26.2], [4.6, 24.8], [6, 23.4]]), R.gold, { rad: 0.8 });
    c.ring(16, 4.8, 1.6, 2.6, R.iron);
  },
  books(c) {
    // two books stacked, a pressed maple leaf poking out
    c.pillow(rrect(3.6, 18.6, 27.6, 27.6, 1.4), R.navy, { rad: 1.6 });
    c.face(rrect(24.6, 19.8, 27, 26.4, 0), R.paper, { t: 3, tex: (x, y, t) => (Math.floor(y) % 2 ? 2 : 4) });
    c.face(rrect(5, 21.6, 22, 22.6, 0), R.gold, { t: 3 }); c.face(rrect(5, 24, 22, 24.6, 0), R.gold, { t: 2 });
    c.pillow(mapleLeaf(21, 8.2, 4.6), R.orange, { rad: 1 });
    c.pillow(rrect(5.4, 10, 26.4, 18.8, 1.4), R.red, { rad: 1.6, line: true });
    c.face(rrect(23.6, 11.2, 25.8, 17.6, 0), R.paper, { t: 3, tex: (x, y, t) => (Math.floor(y) % 2 ? 2 : 4) });
    c.face(rrect(7, 13, 20, 14, 0), R.gold, { t: 4 }); c.face(rrect(7, 15.4, 20, 16, 0), R.gold, { t: 2 });
  },
  map(c) {
    c.tube([[5, 6.5], [5, 26.5]], 2.2, R.paper, { lo: -0.7 });
    c.face(rrect(5, 5.6, 27, 27.4, 0), R.paper, { t: 3, tex: (x, y, t) => (x > 12 && x < 13.2) || (x > 20 && x < 21.2) ? 2 : t });
    c.tube([[27, 6.5], [27, 26.5]], 2.2, R.paper, { lo: -0.7 });
    // dashed trail, mountains, a red X
    for (let k = 0; k < 9; k++) { const t = k / 8; c.dot(8.6 + t * 12, 22 - Math.sin(t * 3) * 6 - t * 3, 0x8a5a2a); }
    c.poly([[9, 14], [12, 9.6], [15, 14]], R.moss, { t: 2 });
    c.poly([[13, 14], [16, 10.6], [19, 14]], R.moss, { t: 3 });
    c.line(21, 12, 25, 16, 0xc8361f); c.line(25, 12, 21, 16, 0xc8361f);
    c.line(22, 12, 25, 15, 0xc8361f); c.line(24, 12, 21, 15, 0xc8361f);
  },
  lantern(c) {
    c.ring(16, 4.6, 2, 3.2, R.iron, { clip: (x, y) => y < 5 });
    c.pillow(rrect(11, 5.4, 21, 8.4, 1.2), R.copper, { rad: 1.2 });
    c.pillow(rrect(9.4, 7.8, 22.6, 10.4, 1), R.copper, { rad: 1, line: true });
    c.ball(16, 17, 6, 7.4, R.glass, { flat: 0.5, lo: -0.5 });
    // flame glow inside the glass
    c.ball(16, 18.4, 3.4, 4.4, R.fire, { flat: 0.6, under: true, spec: 0.6 });
    c.ball(16, 18.6, 1.4, 2.4, R.yellow, { under: true, t: 5 });
    c.dots([[13, 12], [13, 13], [14, 11]], 0xffffff);
    for (const x of [10.6, 21.4]) c.tube([[x, 9.6], [x, 24]], 0.75, R.copper);
    c.pillow(rrect(9.4, 23.6, 22.6, 26.6, 1), R.copper, { rad: 1, line: true });
    c.pillow(rrect(8, 26, 24, 29.4, 1.2), R.brass, { rad: 1.2, line: true });
  },
  bottles(c) {
    const bottle = (x, w, h, Rm, cap, label) => {
      c.pillow(or(rrect(x - w, 29 - h, x + w, 29, 2), rrect(x - 1.2, 29 - h - 5, x + 1.2, 29 - h + 1, 0.6)), Rm, { rad: 2, line: true });
      c.face(rrect(x - 1.4, 29 - h - 6.6, x + 1.4, 29 - h - 4.6, 0.4), cap, { t: 3, line: true });
      c.face(rrect(x - w + 1, 29 - h + 4, x + w - 1, 29 - h + 8, 0), label, { t: 4, line: true });
    };
    bottle(9, 4.4, 13, R.orange, R.red, R.paper);
    bottle(23, 4.6, 11, R.maroon, R.black, R.cream);
    bottle(16, 4, 16, R.lime, R.cork ?? R.tan, R.paper);
    c.dots([[6, 18], [6, 19], [14, 13], [14, 14], [20, 20]], 0xffffff);
  },

  // ---- HUD and world glyphs
  coin(c) {
    c.ball(16, 16, 12.4, 12.4, R.gold, { flat: 0.55 });
    c.ring(16, 16, 9, 10.4, R.gold, { line: 1, spec: false });
    c.pillow(mapleLeaf(16, 15.4, 6.4), R.gold, { rad: 1.2, bias: -0.15, line: 2 });
  },
  pouch(c) {
    c.ball(13, 6.8, 3, 2.2, R.gold); c.ball(18.4, 5.6, 3, 2.2, R.gold);
    c.pillow(or(inEll(16, 21.4, 11, 8.6), inPoly([[10, 10.6], [22, 10.6], [24, 16], [8, 16]])), R.leather, { rad: 3.4, dome: 1 });
    c.pillow(inPoly([[9.4, 7.6], [22.6, 7.6], [21, 11.4], [11, 11.4]]), R.leather, { rad: 1.2, line: true, bias: 0.15 });
    c.tube([[9.6, 11.6], [22.4, 11.6]], 1, R.red);
    c.tube([[21.6, 12], [24.4, 14.8], [24, 18]], 0.7, R.red);
    c.ball(24, 18.6, 1.3, 1.5, R.gold);
    c.pillow(mapleLeaf(16, 21.6, 3.8), R.tan, { rad: 0.8, line: 2, bias: -0.2 });
  },
  cocoa(c) {
    c.ring(23.4, 18.6, 2.4, 4.8, R.red);
    c.pillow(rrect(7, 11, 23, 28, 3), R.red, { rad: 3 });
    c.face(rrect(7.4, 17.6, 22.6, 20.4, 0), R.cream, { t: 4, line: 2, tex: (x, y, t) => (Math.floor(x) % 3 === 0 ? 3 : t) });
    c.ball(15, 11.6, 7.4, 2.4, R.cocoa, { flat: 0.2, t: 3 });
    c.ball(12.4, 10.8, 2.4, 1.8, R.white); c.ball(17.2, 10.6, 2.2, 1.7, R.white);
    for (const [x0, ph] of [[11.6, 0], [16.4, 1.6]]) for (let k = 0; k < 6; k++) c.dot(x0 + Math.round(Math.sin(k * 0.9 + ph)), 7.6 - k, k < 3 ? 0xffffff : 0xe8e0d8);
  },
  home(c) {
    // the log cabin with a glowing window and a smoking chimney
    c.pillow(rrect(20, 4.6, 24, 12, 0.6), R.iron, { rad: 1 });
    c.pillow(rrect(5.6, 15, 26.4, 28.6, 0.6), R.timber, { rad: 1.2, tex: (x, y, t) => (Math.floor(y) % 3 === 0 ? Math.max(1, t - 2) : t) });
    c.pillow(inPoly([[2.4, 16.6], [16, 5], [29.6, 16.6], [27, 18], [16, 9.2], [5, 18]]), R.red, { rad: 1.4, line: true });
    c.pillow(rrect(13.4, 20, 18.6, 28.6, 0.6), R.darkwood, { rad: 1, line: true });
    c.face(rrect(7.6, 19, 11.6, 23, 0), R.yellow, { t: 4, line: true }); c.face(rrect(20.4, 19, 24.4, 23, 0), R.yellow, { t: 4, line: true });
    c.dots([[9.5, 19], [9.5, 20], [9.5, 21], [9.5, 22], [22.5, 19], [22.5, 20], [22.5, 21], [22.5, 22]], 0x8a4a14);
    c.ball(17.4, 22, 0.6, 0.6, R.gold);
    c.ball(23, 2.4, 2, 1.6, R.cloud); c.ball(26, 1.6, 1.6, 1.3, R.cloud);
  },
  star(c) {
    c.pillow(inPoly(starPts(16, 16.6, 13.6, 6, 5)), R.gold, { rad: 3.4 });
    c.dots([[11, 12], [12, 11]], 0xffffff);
  },
  leaf(c) {
    c.pillow(mapleLeaf(16, 15, 13), R.orange, { rad: 2.2, tex: (x, y, t) => { const dx = x - 16, dy = y - 16.4; const a = Math.atan2(dy, dx); for (const b of [-Math.PI / 2, -Math.PI / 2 + 1.1, -Math.PI / 2 - 1.1, 0.5, Math.PI - 0.5]) { const da = Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (da < 0.09 && Math.hypot(dx, dy) > 1.5) return 1; } return t; } });
  },
  cat(c) {
    // Poutine: a ginger tabby face
    c.pillow(inPoly([[5, 15], [7, 3.6], [14, 9.6]]), R.ginger, { rad: 1.6 });
    c.pillow(inPoly([[27, 15], [25, 3.6], [18, 9.6]]), R.ginger, { rad: 1.6 });
    c.pillow(inPoly([[7.6, 12.6], [8.4, 7], [12, 10.6]]), R.pink, { rad: 0.8, t: 3 });
    c.pillow(inPoly([[24.4, 12.6], [23.6, 7], [20, 10.6]]), R.pink, { rad: 0.8, t: 3 });
    c.ball(16, 18, 12, 10.4, R.ginger, { flat: 0.7, tex: (x, y, t) => ((x > 13.6 && x < 18.4 && y < 13 && Math.floor(y) % 3 === 0) || ((x < 7.6 || x > 24.4) && Math.floor(y) % 3 === 1) ? Math.max(1, t - 2) : t) });
    c.ball(16, 22.6, 6, 4, R.cream, { flat: 0.4 });
    for (const x of [10.6, 21.4]) { c.ball(x, 17, 2.4, 2.6, R.lime, { flat: 0.3, t: 3 }); c.face(rrect(x - 0.5, 15, x + 0.5, 19, 0), R.black, { t: 0 }); c.dot(x - 1, 15.6, 0xffffff); }
    c.poly([[14.6, 20.4], [17.4, 20.4], [16, 22]], R.pink, { t: 3 });
    c.line(16, 22, 16, 23, 0x6e2a20);
    for (const s of [-1, 1]) { c.line(16 + s * 7, 21.6, 16 + s * 11.6, 20.6, 0xfff6e2); c.line(16 + s * 7, 23, 16 + s * 11.6, 23.6, 0xfff6e2); }
  },
  clockface(c) {
    c.ball(16, 16, 13, 13, R.gold, { flat: 0.5 });
    c.ball(16, 16, 10.6, 10.6, R.cream, { flat: 0.25, line: true });
    for (let h = 0; h < 12; h++) { const a = (h / 12) * Math.PI * 2; c.dot(16 + Math.cos(a) * 8.6, 16 + Math.sin(a) * 8.6, h % 3 ? 0x9a8a78 : 0x2a1a14); }
    c.line(16, 16, 16, 9.4, 0x2a1a14); c.line(16, 16, 20.4, 18, 0x2a1a14);
  },
  sun(c) {
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.poly([[16 + Math.cos(a - 0.22) * 9, 16 + Math.sin(a - 0.22) * 9], [16 + Math.cos(a) * 14.4, 16 + Math.sin(a) * 14.4], [16 + Math.cos(a + 0.22) * 9, 16 + Math.sin(a + 0.22) * 9]], R.orange, { rad: 1 }); }
    c.ball(16, 16, 8.6, 8.6, R.yellow);
  },
  moon(c) {
    c.ball(15, 16, 11.6, 11.6, R.cream, { clip: (x, y) => Math.hypot(x - 21.4, y - 11.4) > 9.4 });
    c.ball(11, 20, 1.6, 1.4, R.cream, { t: 2, under: true }); c.ball(8.6, 13, 1.2, 1.2, R.cream, { t: 2, under: true });
    c.pillow(inPoly(starPts(25, 21, 4, 1.6, 4)), R.yellow, { rad: 0.8 });
  },
  rain(c) {
    puff(c, 16, 11.6, 1.6, R.cloud);
    for (const [x, y] of [[9, 21], [15, 24], [21, 21], [12, 28], [19, 28]]) c.ball(x, y, 1.2, 2, R.sky);
  },
  snowflake(c) {
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI + Math.PI / 2; c.tube([[16 - Math.cos(a) * 12, 16 - Math.sin(a) * 12], [16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12]], 1.3, R.snow); }
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + Math.PI / 2; const x = 16 + Math.cos(a) * 8, y = 16 + Math.sin(a) * 8; for (const s of [-1, 1]) c.tube([[x, y], [x + Math.cos(a + s * 0.9) * 3.4, y + Math.sin(a + s * 0.9) * 3.4]], 0.9, R.snow); }
    c.ball(16, 16, 2.6, 2.6, R.white);
  },
  fog(c) {
    for (let k = 0; k < 4; k++) c.tube([[5 + (k % 2) * 3, 8 + k * 5.4], [25 + (k % 2) * 2, 8 + k * 5.4]], 1.8, R.cloud);
  },
  bell(c) {
    c.tube([[16, 26], [16, 29]], 1.2, R.iron);
    c.ball(16, 18, 11, 8.6, R.silver, { clip: (x, y) => y < 22.4 });
    c.pillow(rrect(4.4, 21.6, 27.6, 25, 1.4), R.silver, { rad: 1.4, line: true });
    c.ball(16, 9.4, 2, 1.8, R.silver);
    c.tube([[23, 13], [28.6, 9.6]], 1.4, R.red);
  },
  camera(c) {
    c.pillow(rrect(8, 6.6, 15, 11, 1), R.black, { rad: 1 });
    c.pillow(rrect(3, 9.4, 29, 26.4, 2.4), R.black, { rad: 2.4 });
    c.face(rrect(3.4, 13, 28.6, 23, 0), R.leather, { t: 2, tex: (x, y, t) => ((Math.floor(x) + Math.floor(y)) % 3 === 0 ? 1 : 2) });
    c.ball(16, 17.6, 7, 7, R.silver, { line: true });
    c.ball(16, 17.6, 4.6, 4.6, R.black, { flat: 0.4 });
    c.ball(16, 17.6, 3, 3, R.glass, { flat: 0.6 });
    c.dots([[14.6, 16], [15, 15.6]], 0xffffff);
    c.pillow(rrect(22, 10.6, 27, 13, 0.6), R.yellow, { rad: 0.6, line: true });
  },
  basket(c) {
    // the bike basket with two cocoa cups
    for (const x of [11.4, 20.6]) { c.pillow(rrect(x - 3.6, 5.6, x + 3.6, 15, 1), R.cream, { rad: 1.4 }); c.face(rrect(x - 3.2, 8, x + 3.2, 10, 0), R.red, { t: 3 }); c.ball(x, 5.8, 3.2, 1.2, R.cocoa, { t: 2 }); }
    c.pillow(inPoly([[3.4, 13], [28.6, 13], [25.6, 28.6], [6.4, 28.6]]), R.timber, { rad: 2, tex: (x, y, t) => ((Math.floor(y) + (Math.floor(x / 3) % 2)) % 3 === 0 ? Math.max(1, t - 2) : (Math.floor(x) % 3 === 0 ? Math.max(1, t - 1) : t)) });
    c.tube([[3, 13], [29, 13]], 1.5, R.wood);
  },
  gears(c) {
    const gear = (cx, cy, r, Rm, n) => {
      const teeth = (x, y) => { const a = Math.atan2(y - cy, x - cx), d = Math.hypot(x - cx, y - cy); return d <= r + (Math.cos(a * n) > 0.2 ? 2.2 : 0) && d >= r * 0.34; };
      c.pillow(teeth, Rm, { rad: 1.6, line: true });
    };
    gear(12, 12.6, 7.4, R.silver, 8);
    gear(22.4, 22.4, 5.4, R.gold, 7);
  },
  lamp(c) {
    for (const [x2, y2] of [[30, 6], [31, 15], [30, 24]]) c.line(22, 15, x2, y2, 0xffe080);
    c.pillow(rrect(5, 9, 18, 21, 3), R.brass, { rad: 2.6 });
    c.ball(19, 15, 4, 6.6, R.yellow, { flat: 0.5 });
    c.ball(19.4, 14, 2, 3.2, R.white, { t: 5 });
    c.tube([[8, 21], [8, 27], [14, 27]], 1.2, R.iron);
  },
  thermos(c) {
    c.pillow(rrect(9, 7, 23, 29, 3), R.green, { rad: 3 });
    c.pillow(rrect(8, 3, 24, 8.6, 1.4), R.silver, { rad: 1.4, line: true });
    c.face(rrect(9.4, 14, 22.6, 21, 0), R.cream, { t: 4, line: 2 });
    c.pillow(mapleLeaf(16, 17.4, 2.8), R.red, { rad: 0.8 });
    c.tube([[23, 12], [26.4, 12], [26.4, 22], [23, 22]], 1.2, R.green);
  },
  cola(c) {
    for (const x of [10.4, 21.6]) {
      c.pillow(or(rrect(x - 4, 12, x + 4, 29, 2.4), rrect(x - 1.6, 4, x + 1.6, 13, 1)), R.maroon, { rad: 2 });
      c.face(rrect(x - 2, 2.4, x + 2, 4.6, 0.6), R.red, { t: 3, line: true });
      c.face(rrect(x - 3.6, 17, x + 3.6, 23, 0), R.cream, { t: 4, line: true });
      c.pillow(mapleLeaf(x, 19.8, 2.2), R.red, { rad: 0.6 });
    }
  },
  tires(c) {
    c.ring(16, 16, 9, 14, R.rubber, { tex: (x, y, t) => { const a = Math.atan2(y - 16, x - 16); return Math.floor(((a + Math.PI) / (Math.PI * 2)) * 24) % 2 && Math.hypot(x - 16, y - 16) > 12.6 ? Math.max(1, t - 1) : t; } });
    c.ring(16, 16, 7.4, 9, R.silver);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI; c.line(16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 16 - Math.cos(a) * 7, 16 - Math.sin(a) * 7, 0xc4c6cc); }
    c.ball(16, 16, 2, 2, R.silver);
  },
  horn(c) {
    c.tube([[10, 10], [7, 4]], 1, R.bone); c.tube([[8.6, 7], [4.6, 5.6]], 0.9, R.bone); c.tube([[13, 9.6], [15, 3.4]], 1, R.bone);
    c.pillow(inPoly([[4, 13.6], [17, 9.4], [17, 22.6], [4, 18.4]]), R.brass, { rad: 1.6 });
    c.ball(20, 16, 5, 8.6, R.brass);
    c.ball(21, 16, 2.6, 6.4, R.darkwood, { t: 1 });
    c.ball(6, 16, 3.6, 3.6, R.rubber);
  },
  springs(c) {
    c.pillow(rrect(8, 2.6, 24, 6, 1), R.iron, { rad: 1 });
    for (let k = 0; k < 6; k++) c.tube([[9.4, 7.6 + k * 3.6], [22.6, 9.4 + k * 3.6]], 1.3, R.red);
    c.pillow(rrect(8, 27, 24, 30.4, 1), R.iron, { rad: 1, line: true });
  },
  glider(c) {
    const cols = [R.red, R.yellow, R.blue, R.cream, R.green, R.purple];
    for (let i = 0; i < 6; i++) c.pillow(rrect(2 + i * 4.8, 6 + Math.abs(i - 2.5) * 1.2, 6.6 + i * 4.8, 15 + Math.abs(i - 2.5) * 1.2, 0.6), cols[i], { rad: 1, line: true });
    c.line(4, 17, 16, 28, 0x3a2a1a); c.line(28, 17, 16, 28, 0x3a2a1a); c.line(16, 16, 16, 28, 0x3a2a1a);
  },
  motorbike(c) {
    for (const x of [8, 24.4]) { c.ring(x, 22.4, 3.4, 6.2, R.rubber); c.ball(x, 22.4, 2.4, 2.4, R.silver); }
    c.pillow(rrect(10, 12.6, 22, 19.4, 3), R.maroon, { rad: 2.4 });
    c.pillow(rrect(11.6, 10.4, 19, 13.6, 1.4), R.cream, { rad: 1.2, line: true });
    c.pillow(rrect(4.6, 11.6, 11, 14.4, 1), R.darkwood, { rad: 1, line: true });
    c.tube([[21, 13], [25, 7.4], [28.6, 7.4]], 1.1, R.silver);
    c.ball(26, 11, 1.8, 1.8, R.yellow);
    c.pillow(rrect(12.6, 18, 19, 22, 1), R.iron, { rad: 1, line: true });
  },
  rack(c) {
    c.pillow(rrect(4, 9, 28, 27, 1), R.timber, { rad: 1.4, tex: (x, y, t) => (Math.floor(x) % 6 === 0 || Math.floor(y) % 6 === 0 ? Math.max(1, t - 2) : t) });
    c.tube([[5, 10], [27, 26]], 1, R.wood);
    c.tube([[4, 9], [28, 9]], 1.3, R.iron);
  },
  pumpkin(c) {
    c.tube([[16, 9], [17.6, 3.6], [20, 3]], 1.4, R.moss);
    for (const [x, rx] of [[9.4, 6.4], [22.6, 6.4], [13, 7], [19, 7], [16, 7.4]]) c.ball(x, 18, rx, 10.4, R.pumpkin, { line: x !== 9.4 ? 2 : undefined });
    c.poly([[10, 14.6], [14, 14.6], [12, 11.6]], R.yellow, { t: 4 }); c.poly([[18, 14.6], [22, 14.6], [20, 11.6]], R.yellow, { t: 4 });
    c.poly([[9, 19.6], [23, 19.6], [21, 24], [11, 24]], R.yellow, { t: 4 });
    c.face(rrect(13.4, 19.6, 15, 21.4, 0), R.pumpkin, { t: 3 }); c.face(rrect(17, 22.4, 18.6, 24, 0), R.pumpkin, { t: 3 });
  },
  axe(c) {
    c.tube([[7, 29], [21, 6]], 1.4, R.timber);
    c.pillow(inPoly([[17.4, 4], [27.4, 6], [29, 14], [22.6, 13.4], [19.6, 10.6]]), R.steel, { rad: 1.6 });
    c.line(26.6, 6.6, 28.4, 13.4, 0xffffff);
  },
  skull(c) {
    c.ball(16, 13.6, 11, 10.4, R.bone);
    c.pillow(rrect(10, 19, 22, 27, 2), R.bone, { rad: 1.6 });
    for (const x of [11.4, 20.6]) c.ball(x, 14, 3, 3.4, R.black, { flat: 0.3, line: true });
    c.poly([[14.6, 20.6], [17.4, 20.6], [16, 18.4]], R.black, { t: 1 });
    for (const x of [12.6, 15, 17.4, 19.8]) c.line(x, 23.6, x, 26.6, 0x5e4c3e);
    c.dots([[9, 8], [10, 7]], 0xffffff);
  },
  candy(c) {
    c.poly([[2, 10], [9, 14], [9, 18], [2, 22], [4, 16]], R.yellow, { rad: 1 });
    c.poly([[30, 10], [23, 14], [23, 18], [30, 22], [28, 16]], R.yellow, { rad: 1 });
    c.ball(16, 16, 8.6, 6.4, R.orange, { tex: (x, y, t) => (Math.floor(x - y * 0.6) % 4 < 2 ? t : Math.min(5, t + 1)) });
  },

  // ---- skills (bike moves)
  wheelie(c) {
    arcArrow(c, 14.4, 22.4, 11.4, -Math.PI * 0.05, -Math.PI * 0.42, R.yellow);
    bike(c, { cx: 13, cy: 25, ang: -0.62, pivot: 'rear' });
    c.ball(6, 29.4, 3.2, 1.2, R.cloud, { t: 3 });
  },
  stoppie(c) {
    arcArrow(c, 17.6, 22.4, 11.4, -Math.PI * 0.95, -Math.PI * 0.58, R.yellow);
    bike(c, { cx: 19, cy: 25, ang: 0.62, pivot: 'front' });
    streaks(c, [[1, 26, 4], [2, 29, 5]]);
  },
  hop(c) {
    c.ball(16, 29, 9, 1.8, R.black, { t: 2 });
    bike(c, { cx: 16, cy: 17, ang: 0 });
    for (const x of [8, 16, 24]) c.poly([[x - 2.4, 30], [x, 26.6], [x + 2.4, 30]], R.yellow, { t: 4 });
  },
  flip(c) {
    arcArrow(c, 16, 16, 13.4, Math.PI * 0.75, Math.PI * 2.35, R.yellow, 1.2);
    bike(c, { cx: 16, cy: 18, ang: -0.9, wheel: 4.6 });
  },
  spin(c) {
    c.ball(16, 22, 13.4, 5, R.yellow, { clip: (x, y) => ((x - 16) / 13.4) ** 2 + ((y - 22) / 5) ** 2 > 0.62 && !(x > 22 && y < 22), t: 4 });
    c.poly([[24, 14.6], [29.4, 17.6], [24, 21]], R.yellow, { t: 4 });
    bike(c, { cx: 16, cy: 15.6, ang: 0, wheel: 4.8 });
  },
  drift(c) {
    puff(c, 7, 24, 1.2, R.cloud);
    puff(c, 4, 18, 0.8, R.cloud);
    bike(c, { cx: 18, cy: 21, ang: 0.18 });
    streaks(c, [[1, 28, 9]]);
  },
  skid(c) {
    c.face(rrect(1, 25, 22, 27, 0), R.rubber, { t: 1 });
    c.face(rrect(3, 28.4, 18, 29.4, 0), R.rubber, { t: 1 });
    bike(c, { cx: 19, cy: 20, ang: 0 });
    for (const [x, y] of [[26, 26], [28, 23], [29, 28]]) c.ball(x, y, 1.4, 1.4, R.tan);
  },
  landing(c) {
    boom(c, 16, 26, 7, 3.4, R.yellow, 7);
    bike(c, { cx: 16, cy: 18, ang: 0 });
    c.face(rrect(1, 29, 31, 30, 0), R.darkwood, { t: 2 });
  },
  air(c) {
    puff(c, 7, 26, 1.1, R.cloud); puff(c, 25, 27, 0.9, R.cloud);
    bike(c, { cx: 16, cy: 13, ang: -0.18 });
    for (const x of [9, 16, 23]) c.line(x, 21, x - 1, 25, 0xfff6e2);
  },
  pedal(c) {
    c.ring(14, 17, 6, 9.4, R.gold, { tex: (x, y, t) => { const a = Math.atan2(y - 17, x - 14); return Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16) % 2 && Math.hypot(x - 14, y - 17) > 8.4 ? 0 : t; } });
    c.tube([[14, 17], [23, 9.6]], 1.4, R.silver);
    c.pillow(rrect(20, 6, 29, 10, 1), R.black, { rad: 1, line: true });
    c.ball(14, 17, 2.6, 2.6, R.silver);
    arcArrow(c, 14, 17, 12.4, Math.PI * 0.55, Math.PI * 1.05, R.cream, 1.1);
  },
  balance(c) {
    c.face(rrect(1, 27, 31, 28, 0), R.darkwood, { t: 2 });
    bike(c, { cx: 16, cy: 20, ang: 0 });
    c.pillow(inPoly(starPts(5, 7, 3.6, 1.4, 4)), R.yellow, { rad: 0.6 });
    c.pillow(inPoly(starPts(27, 6, 3, 1.2, 4)), R.yellow, { rad: 0.6 });
  },
  speed(c) {
    c.pillow(inPoly([[18, 2], [7, 17.6], [14.6, 17.6], [11, 30], [25, 12.4], [17, 12.4], [21.6, 2]]), R.yellow, { rad: 1.6 });
    streaks(c, [[1, 10, 5], [2, 22, 6], [24, 24, 6]]);
  },
  trick(c) {
    boom(c, 16, 16, 14, 7, R.orange, 8);
    c.pillow(inPoly(starPts(16, 16.4, 8.6, 3.8, 5)), R.yellow, { rad: 1.4 });
  },
  combo(c) {
    c.pillow(inPoly(starPts(10, 19, 8, 3.4, 5)), R.gold, { rad: 1.4 });
    c.pillow(inPoly(starPts(22.6, 12, 7, 3, 5)), R.gold, { rad: 1.4, line: true });
    c.pillow(inPoly(starPts(24, 25, 4.4, 1.8, 5)), R.gold, { rad: 0.8, line: true });
  },
  bail(c) {
    for (const [ax, ay, bx, by] of [[4, 24, 12, 19], [20, 26, 28, 22], [14, 28, 19, 21]]) { c.tube([[ax, ay], [bx, by]], 1.2, R.bone); c.ball(ax, ay, 1.8, 1.8, R.bone); c.ball(bx, by, 1.8, 1.8, R.bone); }
    c.ball(17, 11, 7, 6.4, R.bone);
    for (const x of [14.4, 19.6]) c.ball(x, 11.4, 1.8, 2, R.black, { flat: 0.3 });
    c.dots([[16, 15], [18, 15]], 0x5e4c3e);
    boom(c, 26, 7, 4.6, 2, R.yellow, 6);
  },
  // the Skill Book's moves (names match game.skills)
  skill_wheelie(c) { ICONS.wheelie(c); },
  skill_manual(c) {
    streaks(c, [[1, 14, 5], [2, 18, 6], [1, 22, 4]]);
    bike(c, { cx: 14, cy: 25, ang: -0.5, pivot: 'rear' });
    c.ball(7, 29.4, 3.6, 1.2, R.cloud, { t: 3 });
  },
  skill_hop(c) { ICONS.hop(c); },
  skill_cadence(c) {
    ICONS.pedal(c);
    c.tube([[24, 30], [24, 22], [29.4, 20.6], [29.4, 28]], 0.7, R.black);
    c.ball(22.8, 30, 1.8, 1.4, R.black); c.ball(28.2, 28.2, 1.8, 1.4, R.black);
  },
  skill_drift(c) { ICONS.drift(c); },
  skill_stoppie(c) { ICONS.stoppie(c); },
  skill_nose(c) {
    bike(c, { cx: 19, cy: 25, ang: 0.5, pivot: 'front' });
    streaks(c, [[1, 16, 6], [2, 20, 7], [1, 24, 5]]);
    puff(c, 25, 29, 0.6, R.cloud);
  },
  skill_spin(c) { ICONS.spin(c); },
  skill_backflip(c) {
    arcArrow(c, 16, 16, 13.4, Math.PI * 0.25, -Math.PI * 1.35, R.yellow, 1.2);
    bike(c, { cx: 16, cy: 18, ang: -2.2, wheel: 4.6 });
  },
  skill_frontflip(c) {
    arcArrow(c, 16, 16, 13.4, Math.PI * 0.75, Math.PI * 2.35, R.yellow, 1.2);
    bike(c, { cx: 16, cy: 18, ang: 0.9, wheel: 4.6 });
  },
  skill_drop(c) {
    c.pillow(rrect(0, 15, 12, 31, 0.6), R.timber, { rad: 1, tex: (x, y, t) => (Math.floor(y) % 4 === 0 ? Math.max(1, t - 2) : t) });
    for (let k = 0; k < 5; k++) c.dot(11 + k * 2.4, 13 + k * k * 0.5, 0xfff6e2);
    bike(c, { cx: 23, cy: 24, ang: -0.45, pivot: 'rear', wheel: 4.6 });
    c.face(rrect(12, 30, 31, 31, 0), R.darkwood, { t: 2 });
  },
  skill_perfect(c) {
    ICONS.landing(c);
    c.pillow(inPoly(starPts(5, 6, 4, 1.6, 4)), R.yellow, { rad: 0.6 });
    c.pillow(inPoly(starPts(27, 5, 3.4, 1.4, 4)), R.yellow, { rad: 0.6 });
  },
  skill_longjump(c) {
    c.pillow(inPoly([[0, 31], [0, 24], [8, 27], [9, 31]]), R.moss, { rad: 1 });
    c.pillow(inPoly([[23, 31], [24, 27], [32, 25], [32, 31]]), R.moss, { rad: 1 });
    for (let x = 4; x < 29; x += 3) c.dot(x, 22, 0xffd84a);
    c.poly([[29, 20], [31.6, 22], [29, 24]], R.yellow, { t: 4 });
    bike(c, { cx: 16, cy: 12, ang: -0.1, wheel: 4.8 });
  },
  skill_combo(c) { ICONS.combo(c); },
  skill_tricks(c) { ICONS.trick(c); },
  medal(c) {
    c.poly([[9, 2], [15, 2], [18, 13], [12, 13]], R.red, { rad: 1 });
    c.poly([[23, 2], [17, 2], [14, 13], [20, 13]], R.blue, { rad: 1, line: true });
    c.ball(16, 20, 8.6, 8.6, R.gold, { flat: 0.6, line: true });
    c.pillow(inPoly(starPts(16, 20.4, 5.4, 2.4, 5)), R.gold, { rad: 1, bias: 0.15, line: 2 });
  },

  // ---- touch controls
  t_pedal(c) {
    c.tube([[16, 6], [16, 26]], 2, R.silver);
    c.pillow(rrect(5, 3, 20, 9, 1.4), R.black, { rad: 1.4, line: true, tex: (x, y, t) => (Math.floor(x) % 3 === 0 ? 1 : t) });
    c.pillow(rrect(12, 23, 27, 29, 1.4), R.black, { rad: 1.4, line: true, tex: (x, y, t) => (Math.floor(x) % 3 === 0 ? 1 : t) });
    c.ball(16, 16, 5, 5, R.gold, { line: true });
    c.ball(16, 16, 1.6, 1.6, R.silver);
  },
  t_brake(c) {
    c.ring(16, 16, 6, 12.6, R.red);
    c.pillow(rrect(5, 13.4, 27, 18.6, 1.2), R.cream, { rad: 1.2 });
  },
  t_hop(c) {
    c.pillow(inPoly([[16, 2.6], [28, 15], [21, 15], [21, 25.6], [11, 25.6], [11, 15], [4, 15]]), R.green, { rad: 2 });
    c.face(rrect(5, 27.6, 27, 29.6, 0), R.timber, { t: 3 });
  },
  t_trick(c) {
    c.pillow(inPoly(starPts(16, 16.6, 13.6, 6, 5)), R.yellow, { rad: 3 });
    c.ball(12.6, 14.6, 1.4, 2, R.black, { t: 1 }); c.ball(19.4, 14.6, 1.4, 2, R.black, { t: 1 });
    c.line(13, 19, 19, 19, 0x6e3a0e); c.dots([[12, 18], [20, 18]], 0x6e3a0e);
  },
  t_kick(c) {
    // a skeleton foot booting
    c.tube([[9, 3], [11.6, 15]], 2.2, R.bone);
    c.pillow(inPoly([[7, 14], [16, 13], [26, 17], [27, 22], [8, 22]]), R.black, { rad: 2 });
    c.face(rrect(7, 21, 27, 23, 0), R.tan, { t: 2 });
    streaks(c, [[27, 9, 3], [28, 13, 3]]);
    boom(c, 28, 20, 3.6, 1.6, R.yellow, 6);
  },
  t_run(c) {
    streaks(c, [[2, 9, 7], [1, 14, 8], [3, 19, 6]]);
    c.pillow(inPoly([[10, 12], [22, 10], [27, 16], [26, 21], [10, 21]]), R.red, { rad: 2 });
    c.face(rrect(10, 21, 27, 24, 0), R.cream, { t: 4, line: true });
  },
  t_journal(c) {
    c.pillow(rrect(5, 3, 25, 29, 2), R.maroon, { rad: 2 });
    c.face(rrect(24, 5, 26.6, 27.6, 0), R.paper, { t: 4, tex: (x, y, t) => (Math.floor(y) % 2 ? 3 : 4), line: true });
    c.face(rrect(7, 3.4, 9, 28.6, 0), R.gold, { t: 3, line: true });
    c.pillow(rrect(11.6, 9, 22, 15, 0.6), R.paper, { rad: 0.8, line: true });
    c.line(13, 11, 20, 11, 0x8a6a4a); c.line(13, 13, 18, 13, 0x8a6a4a);
  },
  t_map(c) { ICONS.map(c); },
  t_bell(c) { ICONS.bell(c); },
  t_photo(c) { ICONS.camera(c); },
  t_talk(c) {
    c.pillow(or(rrect(3, 4, 29, 22, 6), inPoly([[8, 20], [14, 20], [7, 29]])), R.cream, { rad: 2.4 });
    for (const x of [10, 16, 22]) c.ball(x, 13, 2, 2, R.black, { flat: 0.3 });
  },
  t_back(c) { ICONS.wheelie(c); },
  t_fwd(c) { ICONS.stoppie(c); },
};

// ---------------------------------------------------------------- 16px UI glyphs
const GLYPHS = {
  box(c) { c.face(rrect(2, 2, 14, 14, 1), R.paper, { t: 4, line: true }); c.face(rrect(3, 3, 13, 5, 0), R.paper, { t: 2 }); },
  check(c) { c.tube([[3, 8.6], [6.6, 12.4], [13.4, 3.4]], 1.6, R.green); },
  cross(c) { c.tube([[4, 4], [12, 12]], 1.6, R.red); c.tube([[12, 4], [4, 12]], 1.6, R.red); },
  boxOn(c) { GLYPHS.box(c); c.tube([[4, 8], [7, 11.6], [14.6, 1.6]], 1.4, R.green); },
  boxX(c) { GLYPHS.box(c); c.tube([[4.4, 4.4], [11.6, 11.6]], 1.2, R.red); c.tube([[11.6, 4.4], [4.4, 11.6]], 1.2, R.red); },
  hand(c) {
    c.pillow(or(rrect(1, 6, 9, 12, 1.6), rrect(7, 5, 15, 8, 1.2)), R.white, { rad: 1.2 });
    c.line(8, 9, 11, 9, 0xb8b0c0); c.line(8, 11, 10, 11, 0xb8b0c0);
    c.face(rrect(0, 6, 2, 12, 0), R.red, { t: 3 });
  },
  arrowR(c) { c.pillow(inPoly([[4, 2], [13, 8], [4, 14]]), R.gold, { rad: 1.2 }); },
  arrowL(c) { c.pillow(inPoly([[12, 2], [3, 8], [12, 14]]), R.gold, { rad: 1.2 }); },
  arrowU(c) { c.pillow(inPoly([[2, 12], [8, 3], [14, 12]]), R.gold, { rad: 1.2 }); },
  arrowD(c) { c.pillow(inPoly([[2, 4], [8, 13], [14, 4]]), R.gold, { rad: 1.2 }); },
  steam3(c) { c.inkAmt = 0.12; for (const [x, ph] of [[3.6, 0], [8, 1.6], [12.4, 3]]) c.tube(Array.from({ length: 6 }, (_, k) => [x + Math.sin(k * 1.2 + ph) * 1.4, 14.6 - k * 2.4]), (t) => 0.95 - t * 0.35, R.steam, { spec: false }); },
  steam2(c) { c.inkAmt = 0.12; for (const [x, ph] of [[5, 0], [11, 1.8]]) c.tube(Array.from({ length: 6 }, (_, k) => [x + Math.sin(k * 1.2 + ph) * 1.4, 14.6 - k * 2.4]), (t) => 0.95 - t * 0.35, R.steam, { spec: false }); },
  steam1(c) { c.inkAmt = 0.12; c.tube(Array.from({ length: 5 }, (_, k) => [8 + Math.sin(k * 1.2) * 1.4, 14.6 - k * 2.4]), (t) => 0.95 - t * 0.35, R.steam, { spec: false, bias: -0.25 }); },
  cold(c) {
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI + Math.PI / 2; c.tube([[8 - Math.cos(a) * 6, 8 - Math.sin(a) * 6], [8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6]], 0.9, R.sky); }
    c.ball(8, 8, 1.6, 1.6, R.white);
  },
  heart(c) { c.pillow(or(inEll(5.4, 6, 3.6, 3.6), inEll(10.6, 6, 3.6, 3.6), inPoly([[2, 7.4], [14, 7.4], [8, 14]])), R.red, { rad: 2 }); },
  lock(c) { c.ring(8, 7, 2.4, 4, R.silver, { clip: (x, y) => y < 8 }); c.pillow(rrect(2.6, 7, 13.4, 14.4, 1), R.gold, { rad: 1.4 }); c.face(rrect(7.4, 9.4, 8.6, 12, 0), R.black, { t: 1 }); },
  question(c) { c.tube([[4.6, 5.4], [5.6, 2.6], [10, 2], [11.6, 4.4], [10.4, 6.6], [8, 8], [8, 10]], 1.4, R.gold); c.ball(8, 13, 1.6, 1.6, R.gold); },
  bang(c) { c.tube([[8, 2], [8, 9.6]], 1.8, R.red); c.ball(8, 13.2, 1.7, 1.7, R.red); },
  pin(c) { c.tube([[8, 9], [8, 15]], 0.6, R.silver); c.ball(8, 6, 4.4, 4.4, R.red); },
  medalB(c) { c.ball(8, 8, 6.6, 6.6, R.copper, { flat: 0.6 }); c.pillow(inPoly(starPts(8, 8.2, 4, 1.8, 5)), R.copper, { rad: 0.8, line: 2, bias: 0.15 }); },
  medalS(c) { c.ball(8, 8, 6.6, 6.6, R.silver, { flat: 0.6 }); c.pillow(inPoly(starPts(8, 8.2, 4, 1.8, 5)), R.silver, { rad: 0.8, line: 2, bias: 0.15 }); },
  medalG(c) { c.ball(8, 8, 6.6, 6.6, R.gold, { flat: 0.6 }); c.pillow(inPoly(starPts(8, 8.2, 4, 1.8, 5)), R.gold, { rad: 0.8, line: 2, bias: 0.15 }); },
  medalNone(c) { c.ball(8, 8, 6.6, 6.6, R.darkwood, { flat: 0.3, t: 1 }); c.ball(8, 8, 4.6, 4.6, R.darkwood, { flat: 0.3, t: 2, line: 1 }); },
  coin(c) { c.ball(8, 8, 6.6, 6.6, R.gold, { flat: 0.55 }); c.pillow(mapleLeaf(8, 7.8, 3.6), R.gold, { rad: 0.8, line: 2, bias: -0.1 }); },
  star(c) { c.pillow(inPoly(starPts(8, 8.6, 7, 3, 5)), R.gold, { rad: 1.6 }); },
  gear(c) { const teeth = (x, y) => { const a = Math.atan2(y - 8, x - 8), d = Math.hypot(x - 8, y - 8); return d <= 4.8 + (Math.cos(a * 8) > 0.2 ? 1.8 : 0) && d >= 1.8; }; c.pillow(teeth, R.silver, { rad: 1.2 }); },
  speaker(c) { c.pillow(inPoly([[2, 6], [5, 6], [9, 2], [9, 14], [5, 10], [2, 10]]), R.gold, { rad: 1 }); c.ring(8, 8, 3.6, 4.6, R.gold, { clip: (x) => x > 10 }); c.ring(8, 8, 5.8, 6.8, R.gold, { clip: (x) => x > 11.6 }); },
  note(c) { c.tube([[6, 12], [6, 3], [13, 1.6], [13, 10]], 0.8, R.gold); c.ball(4.6, 12.4, 2.4, 1.8, R.gold); c.ball(11.6, 10.6, 2.4, 1.8, R.gold); },
  eye(c) { c.ball(8, 8, 7, 4.6, R.white); c.ball(8, 8, 3, 3, R.blue); c.ball(8, 8, 1.4, 1.4, R.black, { t: 1 }); },
  camera(c) { c.pillow(rrect(1, 4, 15, 13, 1.4), R.black, { rad: 1.2 }); c.ball(8, 8.6, 3.2, 3.2, R.glass); c.face(rrect(10.6, 5, 13.4, 6.4, 0), R.yellow, { t: 4 }); },
  pad(c) { c.pillow(or(rrect(2, 5, 14, 12, 3), inEll(4, 11, 2.6, 3), inEll(12, 11, 2.6, 3)), R.black, { rad: 1.4 }); c.face(rrect(3.6, 7.6, 6.4, 8.4, 0), R.white, { t: 4 }); c.face(rrect(4.6, 6.6, 5.4, 9.4, 0), R.white, { t: 4 }); c.ball(11, 7, 0.9, 0.9, R.red, { t: 4 }); c.ball(12.6, 8.6, 0.9, 0.9, R.green, { t: 4 }); },
  bones(c) { c.tube([[3, 13], [13, 3]], 1.2, R.bone); for (const [x, y] of [[2, 12], [4, 14], [12, 2], [14, 4]]) c.ball(x, y, 1.6, 1.6, R.bone); },
  leaf(c) { c.pillow(mapleLeaf(8, 7.6, 6.6), R.orange, { rad: 1 }); },
  dot(c) { c.ball(8, 8, 3, 3, R.gold); },
  home(c) { c.pillow(inPoly([[1, 8], [8, 1.6], [15, 8]]), R.red, { rad: 1 }); c.pillow(rrect(3, 7, 13, 14.6, 0.4), R.timber, { rad: 1, line: true }); c.face(rrect(6.6, 9.6, 9.4, 14.6, 0), R.darkwood, { t: 2, line: true }); },
  cocoa(c) { mug16(c, R.red, R.cream); },
  // the six recipes as little mugs (colours match the food sprites)
  mug_classic(c) { mug16(c, R.red, R.cream); },
  mug_maple(c) { mug16(c, R.cream, R.red, R.tan); },
  mug_mint(c) { mug16(c, R.teal, R.white, R.white); },
  mug_pumpkin(c) { mug16(c, R.pumpkin, R.black, R.white); },
  mug_cinnamon(c) { mug16(c, R.maroon, R.fire); },
  mug_mocha(c) { mug16(c, R.navy, R.yellow); },
  // weather
  sun(c) { for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; c.dot(8 + Math.cos(a) * 6.6 - 0.5, 8 + Math.sin(a) * 6.6 - 0.5, 0xf07e2a); } c.ball(8, 8, 4.4, 4.4, R.yellow); },
  moon(c) { c.ball(7.4, 8, 6, 6, R.cream, { clip: (x, y) => Math.hypot(x - 11, y - 5.4) > 4.8 }); c.dot(13, 12, 0xf8d040); },
  cloud(c) { c.ball(5.4, 9.6, 3.6, 3, R.cloud); c.ball(10.6, 9.4, 4, 3.4, R.cloud); c.ball(8, 6.6, 4, 3.6, R.cloud); },
  rain(c) { c.ball(5.4, 7, 3.4, 2.8, R.cloud); c.ball(10.6, 6.8, 3.8, 3, R.cloud); c.ball(8, 4.6, 3.6, 3, R.cloud); for (const [x, y] of [[4, 12.6], [8, 14], [12, 12.6]]) c.ball(x, y, 0.9, 1.4, R.sky); },
  snow(c) { for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI + Math.PI / 2; c.tube([[8 - Math.cos(a) * 6.4, 8 - Math.sin(a) * 6.4], [8 + Math.cos(a) * 6.4, 8 + Math.sin(a) * 6.4]], 0.85, R.snow); } c.ball(8, 8, 1.6, 1.6, R.white); },
  fog(c) { for (let k = 0; k < 3; k++) c.tube([[2 + (k % 2) * 2, 4.4 + k * 3.8], [13 + (k % 2), 4.4 + k * 3.8]], 1.2, R.cloud); },
  wind(c) { c.tube([[1.6, 6], [11, 6], [13, 4.4], [11.4, 2.6]], 0.8, R.cloud, { spec: false }); c.tube([[1.6, 10], [13, 10], [14.4, 12], [12.6, 13.6]], 0.8, R.cloud, { spec: false }); c.pillow(mapleLeaf(6, 13, 2.6), R.orange, { rad: 0.6 }); },
  rush(c) { c.pillow(inPoly([[9.6, 1], [3, 9], [7.4, 9], [5.6, 15], [13, 6.4], [8.4, 6.4], [11, 1]]), R.yellow, { rad: 1 }); },
  target(c) { c.ring(8, 8, 4.6, 6.8, R.red); c.ring(8, 8, 2.4, 4.6, R.white); c.ball(8, 8, 2.4, 2.4, R.red); },
  // mood marks that pop around speech bubbles
  mark_anger(c) { for (const [a, b] of [[[3, 3], [6.4, 6.4]], [[13, 3], [9.6, 6.4]], [[3, 13], [6.4, 9.6]], [[13, 13], [9.6, 9.6]]]) c.tube([a, [a[0] + (b[0] - a[0]) * 0.4, b[1]], b], 1.3, R.red); },
  mark_bang(c) { c.pillow(inPoly([[5, 1], [11, 1], [9.4, 10], [6.6, 10]]), R.red, { rad: 1.2 }); c.ball(8, 13, 2, 2, R.red); },
  mark_sweat(c) { c.pillow(or(inEll(8, 10.4, 4.6, 4.4), inPoly([[8, 1], [12, 9], [4, 9]])), R.sky, { rad: 1.8 }); c.dots([[6, 9], [6, 10]], 0xffffff); },
  mark_heart(c) { c.pillow(or(inEll(5.2, 6, 3.8, 3.8), inEll(10.8, 6, 3.8, 3.8), inPoly([[1.6, 7], [14.4, 7], [8, 14.6]])), R.pink, { rad: 2.2 }); c.dots([[4, 4], [4, 5]], 0xffffff); },
  mark_note(c) { c.tube([[6, 12], [6, 2.6], [13, 1.4], [13, 10]], 0.8, R.black); c.ball(4.4, 12.4, 2.6, 2, R.black); c.ball(11.4, 10.4, 2.6, 2, R.black); },
  mark_sparkle(c) { c.pillow(inPoly([[8, 0.6], [9.6, 6.4], [15.4, 8], [9.6, 9.6], [8, 15.4], [6.4, 9.6], [0.6, 8], [6.4, 6.4]]), R.yellow, { rad: 1.2 }); c.dot(8, 8, 0xffffff); },
  mark_question(c) { c.tube([[4.4, 5.6], [5.2, 2.4], [10, 1.6], [12, 4.2], [10.6, 6.8], [8, 8.2], [8, 10.4]], 1.5, R.blue); c.ball(8, 13.6, 1.7, 1.7, R.blue); },
  mark_zzz(c) {
    c.tube([[7, 2], [13, 2], [7, 8], [13, 8]], 0.9, R.blue);
    c.tube([[2, 9], [6, 9], [2, 13.6], [6, 13.6]], 0.8, R.blue);
  },
  mark_tear(c) { c.pillow(or(inEll(8, 10.6, 3.6, 3.6), inPoly([[8, 3], [11.2, 9.4], [4.8, 9.4]])), R.sky, { rad: 1.4 }); c.dot(7, 10, 0xffffff); },
  mark_shock(c) { for (const [a, b] of [[[2, 2], [5, 5]], [[14, 2], [11, 5]], [[8, 0.6], [8, 4.4]], [[1, 9], [4.6, 9]], [[15, 9], [11.4, 9]]]) c.tube([a, b], 0.9, R.black); },
  mark_ha(c) {
    c.tube([[1.6, 3], [1.6, 13]], 0.9, R.red); c.tube([[5.4, 3], [5.4, 13]], 0.9, R.red); c.tube([[1.6, 8], [5.4, 8]], 0.9, R.red);
    c.tube([[8, 13], [10.6, 3], [13.4, 13]], 0.9, R.red); c.tube([[9, 9.4], [12.4, 9.4]], 0.8, R.red);
  },
};
function mug16(c, body, band, top = R.cocoa) {
  c.ring(12.2, 9.4, 1.3, 2.9, body);
  c.pillow(rrect(2.6, 5, 12, 14.8, 1.6), body, { rad: 1.6 });
  c.face(rrect(3, 8.6, 11.6, 10.2, 0), band, { t: 4, line: 2 });
  c.ball(7.3, 5.4, 4.2, 1.5, top === R.cocoa ? R.cocoa : top, { t: 3 });
  if (top !== R.cocoa) c.ball(7.3, 4.6, 2.6, 1.6, top, { t: 4 });
}

// ---------------------------------------------------------------- API
const cache = new Map();
function render(fn, S, design = 32) {
  const c = new Ico(S, design);
  fn?.(c);
  return c.finish({ ink: c.inkAmt ?? 0.55 });
}
// an icon by name; unknown names fall back to a sensible sibling (skills often come with new ids)
const FALLBACK = [
  [/wheel|manual|lean_?back|nose_?up/, 'wheelie'], [/stop|nose|endo|lean_?f/, 'stoppie'], [/flip|loop/, 'flip'], [/spin|360|180|turn/, 'spin'],
  [/drift|slide/, 'drift'], [/skid|brake/, 'skid'], [/land|stick/, 'landing'], [/hop|jump|bunny|ollie/, 'hop'], [/air|fly|glide/, 'air'],
  [/pedal|cadence|stamina|power/, 'pedal'], [/balance|steady|carry|cup/, 'balance'], [/speed|fast|sprint|rush/, 'speed'],
  [/combo|chain/, 'combo'], [/trick|style|flair|superman|no_?hand/, 'trick'], [/bail|crash|bone/, 'bail'], [/cocoa|deliver/, 'cocoa'],
];
export function resolveIcon(name) {
  if (ICONS[name]) return name;
  const n = String(name || '').toLowerCase().replace(/^(skill|icon)_/, '');
  if (ICONS[n]) return n;
  for (const [re, to] of FALLBACK) if (re.test(n)) return to;
  return 'medal';
}
export function icon(name) {
  const key = `i:${name}`;
  if (cache.has(key)) return cache.get(key);
  const p = render(ICONS[resolveIcon(name)], 32);
  cache.set(key, p);
  return p;
}
export function iconURL(name) {
  const key = `u:${name}`;
  if (cache.has(key)) return cache.get(key);
  const url = icon(name).toDataURL();
  cache.set(key, url);
  return url;
}
// any icon redrawn at another size (e.g. 24px for touch buttons), as a Pix
export function iconAt(name, size) {
  const key = `a:${name}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const p = render(ICONS[resolveIcon(name)], size, 32);
  cache.set(key, p);
  return p;
}
// a 32px icon redrawn on a 16px grid (for inline use where no hand-made glyph exists)
export function iconSmallURL(name) {
  if (GLYPHS[name]) return glyphURL(name);
  const key = `s:${name}`;
  if (cache.has(key)) return cache.get(key);
  const url = render(ICONS[resolveIcon(name)], 16, 32).toDataURL();
  cache.set(key, url);
  return url;
}
export function glyph(name) {
  const key = `g:${name}`;
  if (cache.has(key)) return cache.get(key);
  const p = render(GLYPHS[name], 16, 16);
  cache.set(key, p);
  return p;
}
export function glyphURL(name) {
  const key = `gu:${name}`;
  if (cache.has(key)) return cache.get(key);
  const url = glyph(name).toDataURL();
  cache.set(key, url);
  return url;
}
export const hasIcon = (name) => !!ICONS[name] || /^skill_/.test(name);
// what the world atlas bakes in (keepsake billboards float around the map); the UI draws the rest on demand
export const ICON_NAMES = ['cane', 'spyglass', 'pack', 'clock', 'coat', 'medbag', 'suitcase', 'keys', 'books', 'map', 'lantern', 'bottles', 'coin', 'star'];
export const ALL_ICON_NAMES = Object.keys(ICONS);
export const GLYPH_NAMES = Object.keys(GLYPHS);
