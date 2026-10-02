// 48x48 hand-pixelled food icons, painted in code.
// Every icon is built from a few shaded primitives (balls, lathe-turned vessels, puffy
// "pillow" shapes, tubes, flat faces) lit from the top-left with 4 fill tones + a
// specular tone, ordered dithering on the band edges, and a coloured outline taken
// from the darkest tone of whatever it surrounds.
//
//   import { FOOD_ICONS, foodIcon, foodIconURL, FOOD_INFO } from './foodsprites.js';
//   img.src = foodIconURL('cocoa_maple');
import { Pix } from './pixel.js';

const S = 48;
const EL = 0.36; // ellipse squash of round things seen from the 3/4 view
const SA = EL, CA = Math.sqrt(1 - EL * EL);
const LV = (() => { const l = [-0.55, -0.5, 0.67], m = Math.hypot(...l); return l.map((v) => v / m); })();
const BAY = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bay = (x, y) => (BAY[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function hsh(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// ------------------------------------------------------------------ colour ramps
function toHSV(c) {
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, mx ? d / mx : 0, mx];
}
function fromHSV(h, s, v) {
  h = ((h % 360) + 360) % 360; s = clamp(s, 0, 1); v = clamp(v, 0, 1);
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255);
}
const hueTo = (h, t, k) => h + (((((t - h) % 360) + 540) % 360) - 180) * k;
export function mixc(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  return (Math.round(ar + (((b >> 16) & 255) - ar) * t) << 16) | (Math.round(ag + (((b >> 8) & 255) - ag) * t) << 8) | Math.round(ab + ((b & 255) - ab) * t);
}
// 6-tone ramp: [outline, deep shadow, shadow, base, light, specular]. Shadows drift
// towards purple and gain saturation, lights drift towards warm yellow.
export function ramp(base, o = {}) {
  let [h, s, v] = toHSV(base);
  const sh = o.shadowHue ?? 262, lh = o.lightHue ?? 50, ha = o.hueAmt ?? 1;
  if (s < 0.06) h = o.hue ?? sh;
  const dk = (k) => fromHSV(hueTo(h, sh, [0, 0.07, 0.15, 0.24][k] * ha), Math.min(1, s + (1 - s) * [0, 0.07, 0.15, 0.26][k] * (o.satAmt ?? 1) + s * 0.05 * k), v * [1, 0.8, 0.62, 0.42][k]);
  const lt = (k) => fromHSV(hueTo(h, lh, [0, 0.08, 0.16][k] * ha), s * [1, 0.8, 0.4][k], Math.min(1, v + (1 - v) * [0, 0.5, 0.9][k] + [0, 0.05, 0.1][k]));
  return [o.ol ?? dk(3), o.d2 ?? dk(2), o.d1 ?? dk(1), base, o.l1 ?? lt(1), o.hl ?? lt(2)];
}

const PAL = {
  cocoa: ramp(0x86492f, { l1: 0xa8664a, hl: 0xe0b08c }),
  mocha: ramp(0x5e3424, { l1: 0x80503a, hl: 0xc89878 }),
  choc: ramp(0x5c3020, { l1: 0x7e4630, hl: 0xc08a6a }),
  milkChoc: ramp(0x8a5232),
  cream: ramp(0xfbf0da, { ol: 0x8e5e50, d2: 0xd8b8a2, d1: 0xecd8c0, l1: 0xfff8ea, hl: 0xffffff }),
  marsh: ramp(0xfff6ea, { ol: 0x9a6658, d2: 0xe0c4b8, d1: 0xf2e0d4, l1: 0xfffcf6, hl: 0xffffff }),
  porcelain: ramp(0xf0eeea, { ol: 0x50486e, d2: 0xb8b4c8, d1: 0xd8d6e0, l1: 0xfaf8f4, hl: 0xffffff }),
  milk: ramp(0xf2f4f6, { ol: 0x46557c, d2: 0xb6c0d6, d1: 0xd8dfea, l1: 0xfafcfc, hl: 0xffffff }),
  glass: ramp(0xb8dcea, { ol: 0x3a5a7c, hl: 0xffffff }),
  paper: ramp(0xf4eee2, { ol: 0x6a5048, d2: 0xc4b4a6, d1: 0xe0d4c4 }),
  kraft: ramp(0xc8965a),
  red: ramp(0xd03c30),
  mugRed: ramp(0xc8382e),
  blue: ramp(0x4a78c8),
  navy: ramp(0x34558e),
  teal: ramp(0x3a9a9a),
  sky: ramp(0x9ac4ec),
  mint: ramp(0x62c49c),
  mintLeaf: ramp(0x4cb04c),
  leaf: ramp(0x62a838),
  green: ramp(0x5a9a3a),
  maple: ramp(0xd0601c, { hl: 0xffe0a0 }),
  syrup: ramp(0xc05a14, { l1: 0xe08a2a, hl: 0xffe0a0 }),
  honey: ramp(0xf0a020, { hl: 0xfff4c0 }),
  butter: ramp(0xf8da70, { ol: 0x8a5a24 }),
  pancake: ramp(0xd28a40),
  pancakeTop: ramp(0xe6ac58),
  crust: ramp(0xdca058),
  crustDark: ramp(0xb8743a),
  pumpkin: ramp(0xf07e2a),
  pumpkinPie: ramp(0xd8701e),
  appleR: ramp(0xd8342c, { hl: 0xffd8c0 }),
  appleG: ramp(0x9cc84a, { hl: 0xf4ffd0 }),
  stem: ramp(0x7a5a30),
  wood: ramp(0xb07840),
  woodLight: ramp(0xd8b07a),
  cinn: ramp(0xa45a2c),
  nutmeg: ramp(0x9a6238),
  vanilla: ramp(0x4c2c1e, { hl: 0xc8a080 }),
  gold: ramp(0xe8b440, { hl: 0xfff4c8 }),
  silver: ramp(0xc4c8d6, { hl: 0xffffff }),
  cheese: ramp(0xf6c848),
  rind: ramp(0xe09a30),
  potato: ramp(0xc8965a),
  curd: ramp(0xf4dc98, { ol: 0x8a6030 }),
  gravy: ramp(0x7a4224, { l1: 0x9c5c34, hl: 0xe0a878 }),
  oat: ramp(0xe6d096),
  bread: ramp(0xc87a34),
  crumb: ramp(0xf0d498),
  cranb: ramp(0xc0203a, { hl: 0xffc0c8 }),
  blueb: ramp(0x5464b4),
  caramel: ramp(0xd08428, { hl: 0xfff0c0 }),
  candyRed: ramp(0xe0202c, { hl: 0xffffff, l1: 0xff5a50 }),
  orange: ramp(0xf28a2a),
  yellow: ramp(0xf8d040),
  white: ramp(0xfaf4ec, { ol: 0x6e5a7a, d2: 0xc8bccc, d1: 0xe4dce2, hl: 0xffffff }),
  ghost: ramp(0xfaf6f2, { ol: 0x6a5a8a, d2: 0xc0b8d4, d1: 0xe2dcea, l1: 0xfffcfa, hl: 0xffffff }),
  pink: ramp(0xf08cb0),
  purple: ramp(0x7a4ab0),
  plum: ramp(0x6a2a5a),
  lime: ramp(0x9ad040),
  brownie: ramp(0x5a3022, { l1: 0x7a4632, hl: 0xb8846a }),
  coffee: ramp(0x5a3220),
  charcoal: ramp(0x4a3a4a),
  maroon: ramp(0x8a2a34),
  lavender: ramp(0xb4b0c8),
  salt: ramp(0xf4f6fa, { ol: 0x4e5a7e, d2: 0xb0bcd2, d1: 0xd6dde8 }),
  cork: ramp(0xc89c68),
  egg: ramp(0xdc9e6a),
  eggW: ramp(0xf6eee2, { ol: 0x7a5a50 }),
  yolk: ramp(0xf8a820, { hl: 0xfff4c0 }),
  toast: ramp(0xe8b45e),
  meat: ramp(0x8a4a2e),
  snow: ramp(0xeef4fc, { ol: 0x50608a, d2: 0xb4c4e0, d1: 0xd4e0f2 }),
  peanut: ramp(0xe8c890),
  seed: ramp(0xd8d0a0),
};

// ------------------------------------------------------------------ shape helpers
const inEll = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
function rrect(x0, y0, x1, y1, r = 0) {
  return (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const dx = Math.max(x0 + r - x, 0, x - (x1 - r)), dy = Math.max(y0 + r - y, 0, y - (y1 - r));
    return dx * dx + dy * dy <= r * r + 1e-6;
  };
}
function inPoly(pts) {
  return (x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
}
// rotated ellipse
function rell(cx, cy, rx, ry, a) {
  const ca = Math.cos(a), sa = Math.sin(a);
  return (x, y) => { const dx = x - cx, dy = y - cy, u = (dx * ca + dy * sa) / rx, v = (-dx * sa + dy * ca) / ry; return u * u + v * v <= 1; };
}
// leaf: from base (x0,y0) pointing at angle a, length len, half-width w
function leafShape(x0, y0, a, len, w) {
  const ca = Math.cos(a), sa = Math.sin(a);
  return (x, y) => {
    const dx = x - x0, dy = y - y0, u = (dx * ca + dy * sa) / len, v = -dx * sa + dy * ca;
    if (u < 0 || u > 1) return false;
    return Math.abs(v) <= w * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.8)), 0.9) + 0.15;
  };
}
const or = (...fs) => (x, y) => fs.some((f) => f(x, y));
const and = (...fs) => (x, y) => fs.every((f) => f(x, y));
const not = (f) => (x, y) => !f(x, y);
const rot = (pts, cx, cy, a) => pts.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
function bmHit(rows, x0, y0, x, y) {
  const r = rows[y - y0];
  return !!r && x - x0 >= 0 && r[x - x0] === 'X';
}
const BM = {
  maple: ['....X....', '...XXX...', 'X..XXX..X', 'XX.XXX.XX', '.XXXXXXX.', 'XXXXXXXXX', '.XXXXXXX.', '...XXX...', '....X....', '....X....'],
  mapleS: ['..X..', 'X.X.X', 'XXXXX', '.XXX.', '..X..'],
  skull: ['.XXXXX.', 'XXXXXXX', 'X..X..X', 'X..X..X', 'XXX.XXX', '.XXXXX.', '.X.X.X.'],
  drop: ['..X..', '.XXX.', '.XXX.', 'XXXXX', 'XXXXX', '.XXX.'],
  heart: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
  wheat: ['..X..', '.XXX.', 'X.X.X', '.XXX.', 'X.X.X', '.XXX.', 'X.X.X', '..X..', '..X..', '..X..'],
  bean: ['.XXX.', 'XX.XX', 'X.XXX', 'XX.XX', 'XXX.X', 'XX.XX', '.XXX.'],
  star: ['..X..', '.XXX.', 'XXXXX', '.XXX.', '.X.X.'],
  wave: ['.XX...XX.', 'X..X.X..X', '....X....'],
  hex: ['.XXX.', 'X...X', 'X...X', 'X...X', '.XXX.'],
  bee: ['.XX.XX.', '.XXXXX.', 'X.X.X.X', 'XX.X.XX', '.X.X.X.'],
};

// ------------------------------------------------------------------ the painter
class Canvas {
  constructor() {
    this.p = new Pix(S, S);
    this.ol = new Int32Array(S * S).fill(-1);
  }
  op(x, y) {
    return x >= 0 && y >= 0 && x < S && y < S && this.p.data[(y * S + x) * 4 + 3] > 0;
  }
  col(x, y) {
    const i = (y * S + x) * 4, d = this.p.data;
    return (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
  }
  px(x, y, c, ol) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || y < 0 || x >= S || y >= S || c == null || c < 0) return;
    this.p.set(x, y, c);
    const i = y * S + x;
    if (ol !== undefined) this.ol[i] = ol;
    else if (this.ol[i] < 0) this.ol[i] = mixc(c, 0x1e1028, 0.65);
  }
  // fill a shape: cover(add) calls add(x, y, nx, ny, nz, u, v, z) for each pixel (screen-space normal).
  paint(R, cover, o = {}) {
    const M = new Uint8Array(S * S), N = new Float32Array(S * S * 3), UV = new Float32Array(S * S * 2), Z = new Float32Array(S * S).fill(-1e9);
    cover((x, y, nx, ny, nz, u = 0, v = 0, z = 0) => {
      x = Math.floor(x); y = Math.floor(y);
      if (x < 0 || y < 0 || x >= S || y >= S) return;
      if (o.clip && !o.clip(x + 0.5, y + 0.5)) return;
      if (o.under && !this.op(x, y)) return;
      const i = y * S + x;
      if (z < Z[i]) return;
      Z[i] = z;
      M[i] = 1;
      const m = Math.hypot(nx, ny, nz) || 1;
      N[i * 3] = nx / m; N[i * 3 + 1] = ny / m; N[i * 3 + 2] = nz / m;
      UV[i * 2] = u; UV[i * 2 + 1] = v;
    });
    const lo = o.lo ?? -0.35, hi = o.hi ?? 1.1, sp = o.spec ?? 0.965, dith = o.dith ?? 0.5;
    const pre = new Uint8Array(S * S);
    for (let i = 0; i < S * S; i++) pre[i] = this.p.data[i * 4 + 3] > 0 ? 1 : 0;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (!M[i]) continue;
      const d = N[i * 3] * LV[0] + N[i * 3 + 1] * LV[1] + N[i * 3 + 2] * LV[2];
      let t;
      if (o.t !== undefined) t = o.t;
      else {
        let v = (d - lo) / (hi - lo);
        if (o.bias) v += typeof o.bias === 'function' ? o.bias(x, y, UV[i * 2], UV[i * 2 + 1]) : o.bias;
        t = 1 + clamp(Math.floor(v * 4 + (bay(x, y) - 0.5) * dith), 0, 3);
        if (d >= sp) t = 5;
      }
      if (o.edge !== undefined) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= S || Y >= S) continue;
          const j = Y * S + X;
          if (!M[j] && pre[j]) { t = o.edge; break; }
        }
      }
      let c = R[t];
      if (o.tex) {
        const r = o.tex(x, y, t, UV[i * 2], UV[i * 2 + 1], d);
        if (r === -1) continue;
        if (r != null) c = r < 6 ? R[clamp(r | 0, 0, 5)] : r;
      }
      this.px(x, y, c, o.ol ?? R[0]);
    }
    return M;
  }
  // ellipsoid
  ball(cx, cy, rx, ry, R, o = {}) {
    const k = o.flat ?? 1;
    return this.paint(R, (add) => {
      for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        const q = u * u + v * v;
        if (q > 1) continue;
        if (o.shape && !o.shape(u, v)) continue;
        add(x, y, u * k, v * k, Math.sqrt(1 - q), u, v);
      }
    }, o);
  }
  // solid of revolution around a vertical axis; rf(Y) = radius at section Y. tex gets (x, y, t, u, Y)
  lathe(cx, y0, y1, rf, R, o = {}) {
    const e = o.el ?? EL, step = 0.2;
    return this.paint(R, (add) => {
      for (let Y = y0; Y <= y1 + 1e-6; Y += step) {
        const r = rf(Y);
        if (r <= 0.25) continue;
        const sl = (rf(Math.min(y1, Y + 0.5)) - rf(Math.max(y0, Y - 0.5)));
        for (let x = Math.floor(cx - r) - 1; x <= Math.ceil(cx + r); x++) {
          const dx = x + 0.5 - cx;
          if (Math.abs(dx) > r) continue;
          const u = dx / r, s = Math.sqrt(1 - u * u);
          for (const sg of [-1, 1]) {
            const yy = Y + sg * e * r * s;
            const wy = -sl * (o.slopeK ?? 1), wz = sg * s;
            add(x, yy, u, wy * CA + wz * SA, -wy * SA + wz * CA, u, Y, sg * r * s - Y * 0.001);
          }
        }
      }
    }, { lo: -0.45, hi: 0.85, spec: 0.7, ...o });
  }
  // flat ellipse facing up (lid, plate, pie top)
  ell(cx, cy, rx, ry, R, o = {}) {
    return this.paint(R, (add) => {
      for (let y = Math.floor(cy - ry) - 1; y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx) - 1; x <= Math.ceil(cx + rx); x++) {
        const u = (x + 0.5 - cx) / rx, v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1) continue;
        add(x, y, 0, -CA, SA, u, v);
      }
    }, { t: 4, ...o });
  }
  // puffy shape: any silhouette gets a rounded bevel of radius `rad` (+ optional dome)
  pillow(inside, R, o = {}) {
    const rad = o.rad ?? 3, dome = o.dome ?? 0;
    const M = new Uint8Array(S * S);
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside(x + 0.5, y + 0.5)) {
      M[y * S + x] = 1;
      if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
    }
    if (x1 < 0) return M;
    const D = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) D[i] = M[i] ? 1e9 : 0;
    const g = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : D[y * S + x]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (!M[i]) continue;
      D[i] = Math.min(D[i], g(x - 1, y) + 1, g(x, y - 1) + 1, g(x - 1, y - 1) + 1.414, g(x + 1, y - 1) + 1.414);
    }
    for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
      const i = y * S + x;
      if (!M[i]) continue;
      D[i] = Math.min(D[i], g(x + 1, y) + 1, g(x, y + 1) + 1, g(x + 1, y + 1) + 1.414, g(x - 1, y + 1) + 1.414);
    }
    const cxb = (x0 + x1 + 1) / 2, cyb = (y0 + y1 + 1) / 2, hw = (x1 - x0 + 1) / 2, hh = (y1 - y0 + 1) / 2;
    const H = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      if (!M[i]) continue;
      const t = Math.min(1, (D[i] - 0.5) / rad);
      let h = rad * Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
      if (dome) h += dome * Math.max(0, 1 - ((x + 0.5 - cxb) / hw) ** 2 - ((y + 0.5 - cyb) / hh) ** 2);
      if (o.height) h += o.height(x, y, h);
      H[i] = h;
    }
    const hg = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : H[y * S + x]);
    return this.paint(R, (add) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        if (!M[y * S + x]) continue;
        const nx = -(hg(x + 1, y) - hg(x - 1, y)) / 2, ny = -(hg(x, y + 1) - hg(x, y - 1)) / 2;
        add(x, y, nx, ny, 1, (x + 0.5 - x0) / (x1 - x0 + 1), (y + 0.5 - y0) / (y1 - y0 + 1));
      }
    }, o);
  }
  // flat face with a constant normal (or fixed tone)
  face(inside, R, o = {}) {
    const n = o.n ?? [0, 0, 1];
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (inside(x + 0.5, y + 0.5)) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    return this.paint(R, (add) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inside(x + 0.5, y + 0.5)) add(x, y, n[0], n[1], n[2], (x + 0.5 - x0) / (x1 - x0 + 1), (y + 0.5 - y0) / (y1 - y0 + 1));
    }, o);
  }
  poly(pts, R, o = {}) {
    return o.rad ? this.pillow(inPoly(pts), R, o) : this.face(inPoly(pts), R, o);
  }
  // capsule along a polyline, radius r (number or fn(t))
  tube(pts, r, R, o = {}) {
    const segs = [];
    let tot = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1], l = Math.hypot(bx - ax, by - ay) || 1e-6;
      segs.push({ ax, ay, dx: (bx - ax) / l, dy: (by - ay) / l, l, t0: tot });
      tot += l;
    }
    const rf = typeof r === 'function' ? r : () => r;
    let rmax = 0;
    for (let k = 0; k <= 20; k++) rmax = Math.max(rmax, rf(k / 20));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return this.paint(R, (add) => {
      for (let y = Math.floor(Math.min(...ys) - rmax) - 1; y <= Math.ceil(Math.max(...ys) + rmax); y++)
        for (let x = Math.floor(Math.min(...xs) - rmax) - 1; x <= Math.ceil(Math.max(...xs) + rmax); x++) {
          const X = x + 0.5, Y = y + 0.5;
          let best = null;
          for (const s of segs) {
            const tt = clamp((X - s.ax) * s.dx + (Y - s.ay) * s.dy, 0, s.l);
            const qx = s.ax + s.dx * tt, qy = s.ay + s.dy * tt, dd = Math.hypot(X - qx, Y - qy);
            if (!best || dd < best.dd) best = { dd, ex: X - qx, ey: Y - qy, t: (s.t0 + tt) / tot, side: (X - s.ax) * -s.dy + (Y - s.ay) * s.dx };
          }
          const rr = rf(best.t);
          if (best.dd > rr) continue;
          const w = best.dd / rr;
          add(x, y, best.ex / rr, best.ey / rr, Math.sqrt(Math.max(0, 1 - w * w)), best.t, best.side / rr);
        }
    }, o);
  }
  // torus-ish ring (mug handles): outer radii ax, ay, inner radii bx, by
  ring(cx, cy, ax, ay, bx, by, R, o = {}) {
    return this.paint(R, (add) => {
      for (let y = Math.floor(cy - ay) - 1; y <= Math.ceil(cy + ay); y++) for (let x = Math.floor(cx - ax) - 1; x <= Math.ceil(cx + ax); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if ((dx / ax) ** 2 + (dy / ay) ** 2 > 1 || (dx / bx) ** 2 + (dy / by) ** 2 < 1) continue;
        const r = Math.hypot(dx, dy) || 1e-6, ca = dx / r, sa = dy / r;
        const ro = 1 / Math.hypot(ca / ax, sa / ay), ri = 1 / Math.hypot(ca / bx, sa / by);
        const t = clamp(((r - ri) / (ro - ri)) * 2 - 1, -1, 1);
        add(x, y, ca * t, sa * t, Math.sqrt(1 - t * t), Math.atan2(sa, ca), t);
      }
    }, o);
  }
  // rim + inside wall + contents of an open vessel whose top ellipse is at (cx, cy)
  opening(cx, cy, ro, rim, depth, WR, LR, o = {}) {
    const ryo = ro * EL, ri = ro - rim, ryi = Math.max(0.6, ryo - Math.max(1, rim * EL));
    const inO = inEll(cx, cy, ro, ryo), inI = inEll(cx, cy, ri, ryi), inL = inEll(cx, cy + depth, ri, ryi);
    const M = new Uint8Array(S * S);
    for (let y = Math.floor(cy - ryo) - 1; y <= Math.ceil(cy + ryo) + 1; y++) for (let x = Math.floor(cx - ro) - 1; x <= Math.ceil(cx + ro) + 1; x++) {
      const X = x + 0.5, Y = y + 0.5;
      if (!inO(X, Y)) continue;
      if (!inI(X, Y)) {
        let t = o.rimT ?? 4;
        if (X > cx + ro * 0.5 && Y > cy - 0.5) t -= 1;
        if (Y < cy && X < cx - ro * 0.25 && X > cx - ro * 0.8) t = 5;
        this.px(x, y, WR[t], WR[0]);
        continue;
      }
      if (o.empty || !inL(X, Y)) {
        this.px(x, y, WR[X < cx + ri * 0.15 ? 1 : 2], WR[0]);
        continue;
      }
      if (y >= 0 && x >= 0 && y < S && x < S) M[y * S + x] = 1;
      const u = (X - cx) / ri, v = (Y - cy - depth) / ryi;
      let t = 3;
      if (!inL(X, Y - 1) || !inI(X, Y - 1)) t = 2;
      const g = ((u + 0.34) / 0.42) ** 2 + ((v + 0.1) / 0.32) ** 2;
      if (t === 3 && g < 1) t = g < 0.18 ? 5 : 4;
      let c = LR[t];
      if (o.ltex) { const r = o.ltex(x, y, t, u, v); if (r != null) c = r < 6 ? LR[r] : r; }
      this.px(x, y, c, LR[0]);
    }
    return M;
  }
  // rounded box in oblique 3/4 view: front w x h at (x, y), depth offset (dx, dy)
  box(x, y, w, h, dx, dy, R, o = {}) {
    const front = inPoly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
    const top = inPoly([[x, y], [x + w, y], [x + w + dx, y + dy], [x + dx, y + dy]]);
    const side = inPoly([[x + w, y], [x + w + dx, y + dy], [x + w + dx, y + h + dy], [x + w, y + h]]);
    const faceOf = (X, Y) => (front(X, Y) ? 'front' : top(X, Y) ? 'top' : 'side');
    return this.pillow(or(front, top, side), R, {
      rad: o.rad ?? 1.5,
      ...o,
      tex: (X, Y, t, u, v, d) => {
        const px = X + 0.5, py = Y + 0.5, f = faceOf(px, py);
        let k = t;
        if (f === 'top') k = Math.min(o.topMax ?? 4, t + 1);
        else if (f === 'side') k = Math.max(1, t - 1);
        else k = Math.min(t, o.frontMax ?? 4);
        if (f === 'top' && front(px, py + 1) && o.hiEdge !== false) k = 5;
        if (o.tex) return o.tex(X, Y, k, f, px, py);
        return k;
      },
    });
  }
  spec(x, y, c = 0xfffcf0) { this.px(x, y, c); }
  dots(list, c) { for (const [x, y] of list) this.px(x, y, c); }
  // darken/lighten already painted pixels inside a shape
  tint(inside, k, target = 0x2a1430) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (this.op(x, y) && inside(x + 0.5, y + 0.5)) {
      const i = (y * S + x) * 4, d = this.p.data;
      const c = mixc((d[i] << 16) | (d[i + 1] << 8) | d[i + 2], target, k);
      d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255;
    }
  }
  // 1px outline in each neighbour's own darkest tone; bottom/right side a touch darker
  finish() {
    const d = this.p.data, src = new Uint8ClampedArray(d);
    const a = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : src[(y * S + x) * 4 + 3]);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      if (a(x, y)) continue;
      for (const [dx, dy, dark] of [[0, -1, 1], [-1, 0, 1], [1, 0, 0], [0, 1, 0]]) {
        if (!a(x + dx, y + dy)) continue;
        const j = (y + dy) * S + (x + dx);
        let c = this.ol[j] >= 0 ? this.ol[j] : mixc((src[j * 4] << 16) | (src[j * 4 + 1] << 8) | src[j * 4 + 2], 0x1e1028, 0.65);
        if (dark) c = mixc(c, 0x1a0c1c, 0.28);
        this.p.set(x, y, c);
        break;
      }
    }
    return this.p;
  }
}

// ------------------------------------------------------------------ composites
function marsh(c, x, y, w, h, R = PAL.marsh, o = {}) {
  return c.pillow(rrect(x, y, x + w, y + h, Math.min(w, h) * 0.35), R, { rad: 1.6, edge: 0, ...o });
}
// whipped cream: tiers getting smaller upwards from base y
function swirl(c, cx, by, w, R = PAL.cream, o = {}) {
  const tiers = o.tiers ?? [[1, 3.6], [0.8, 3.2], [0.58, 2.8], [0.36, 2.3]];
  let y = by;
  tiers.forEach(([k, ry], i) => {
    c.ball(cx + (i % 2 ? 0.7 : -0.5) * (o.wob ?? 1), y, w * k, ry, R, { edge: i ? 1 : o.baseEdge, flat: 0.75, spec: 0.93 });
    y -= ry * 1.15;
  });
  c.ball(cx + 1.6, y + 1.2, 1.7, 1.8, R, { edge: 1, spec: 0.9 });
  return y;
}
const darkOf = (c) => mixc(c, 0x1e1028, 0.6);
// triangle with rounded corners (shrunk towards the incentre, then grown by r)
function roundTri(pts, r) {
  const [A, B, C] = pts, d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const a = d(B, C), b = d(A, C), cc = d(A, B), per = a + b + cc;
  const I = [(a * A[0] + b * B[0] + cc * C[0]) / per, (a * A[1] + b * B[1] + cc * C[1]) / per];
  const area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1])) / 2, ir = (2 * area) / per;
  const k = Math.max(0.05, (ir - r) / ir);
  const sh = pts.map((p) => [I[0] + (p[0] - I[0]) * k, I[1] + (p[1] - I[1]) * k]);
  const inside = inPoly(sh);
  const segd = (x, y, p, q) => { const dx = q[0] - p[0], dy = q[1] - p[1], t = clamp(((x - p[0]) * dx + (y - p[1]) * dy) / (dx * dx + dy * dy), 0, 1); return Math.hypot(x - p[0] - dx * t, y - p[1] - dy * t); };
  return (x, y) => inside(x, y) || Math.min(segd(x, y, sh[0], sh[1]), segd(x, y, sh[1], sh[2]), segd(x, y, sh[2], sh[0])) <= r;
}

// cocoa mug: body lathe + handle + rim + liquid
function mug(c, o) {
  const cx = o.cx ?? 21, y0 = o.y0 ?? 17, y1 = o.y1 ?? 37, r = o.r ?? 12.5;
  const B = o.body;
  c.ring(cx + r + 0.5, (y0 + y1) / 2 + 3, 7, 7.6, 3.4, 4.1, o.handle ?? B, { spec: 0.95 });
  const rf = o.rf ?? ((Y) => r - Math.max(0, Y - (y1 - 2.5)) ** 2 * 0.45);
  c.lathe(cx, y0, y1, rf, B, { tex: o.tex });
  c.opening(cx, y0, r, 1.7, o.depth ?? 1.6, B, o.liquid ?? PAL.cocoa, { ltex: o.ltex });
  return { cx, y0, r };
}

// ------------------------------------------------------------------ icons
const DRAW = {
  // ======================================================== drinks
  cocoa_classic(c) {
    const D = PAL.cream;
    mug(c, {
      body: PAL.mugRed,
      tex: (x, y, t, u, Y) => {
        if (Math.abs(u) > 0.9 || Y < 19 || Y > 35) return;
        const row = Math.floor((Y - 19) / 5.3), th = Math.asin(u) * 2.6 + (row % 2) * 0.5;
        const fx = th - Math.round(th), fy = ((Y - 19) % 5.3) - 2.3;
        if (fx * fx * 22 + fy * fy * 0.55 < 1.25) return D[clamp(t + 1, 2, 5)];
      },
    });
    for (const [x, y] of [[11, 14], [16, 12], [22, 12], [27, 14], [14, 16], [20, 15], [26, 17], [17, 9.5]]) marsh(c, x, y, 4, 3);
    c.dots([[12, 15], [17, 13], [23, 13], [21, 16]], 0xffffff);
  },
  cocoa_maple(c) {
    mug(c, {
      body: ramp(0xf0dfbe, { ol: 0x7a4a34 }),
      tex: (x, y, t, u, Y) => {
        if (bmHit(BM.maple, 17, 22, x, y)) return PAL.red[clamp(t, 2, 4)];
        if (Y > 18.2 && Y < 19.6) return PAL.red[clamp(t - 1, 1, 3)];
      },
    });
    const mm = (x, y) => {
      c.lathe(x, y, y + 3.6, () => 3.6, PAL.marsh, { edge: 0, tex: (X, Y, t, u, Yy) => (Yy < y + 0.9 ? PAL.caramel[clamp(t, 2, 4)] : null) });
      c.ell(x, y, 3.6, 1.4, PAL.caramel, { t: 3, tex: (X, Y, t, u, v) => (u < -0.2 && v < 0.2 ? 4 : u > 0.4 ? 2 : hsh(X, Y, 3) < 0.25 ? 5 : null) });
    };
    mm(14.5, 12);
    mm(27, 11.5);
    mm(21, 14);
    // maple drizzle
    c.tube([[10.5, 13], [14, 11.6], [17.5, 14.5], [21, 13.4], [24.5, 15], [27.5, 11.2], [31, 13.4]], 0.7, PAL.maple, { spec: 0.9 });
    c.tube([[17.6, 14.5], [17.8, 17.4]], (t) => 0.7 + t * 0.4, PAL.maple, {});
  },
  cocoa_mint(c) {
    mug(c, {
      body: PAL.mint,
      tex: (x, y, t, u, Y) => {
        const th = Math.asin(clamp(u, -1, 1)) * 2.2;
        if (Y > 20 && Y < 34 && Math.abs(th - Math.round(th)) < 0.15) return PAL.white[clamp(t + 1, 2, 5)];
      },
    });
    swirl(c, 21, 15, 10.5);
    // mint leaves
    c.pillow(leafShape(22, 8, -0.9, 9, 2.6), PAL.mintLeaf, { rad: 1.6, edge: 0, tex: (x, y, t, u, v) => (Math.abs(u - (1 - v)) < 0.08 ? 2 : null) });
    c.pillow(leafShape(21, 9, -2.3, 8, 2.4), PAL.mintLeaf, { rad: 1.6, edge: 0 });
    c.dots([[14, 13], [27, 14], [18, 9], [25, 9], [16, 14]], PAL.candyRed[3]);
    c.dots([[15, 13], [26, 14]], PAL.candyRed[1]);
  },
  cocoa_pumpkin(c) {
    const O = PAL.pumpkin, F = ramp(0x5a2412);
    mug(c, {
      body: O,
      handle: PAL.green,
      tex: (x, y, t, u, Y) => {
        const th = Math.asin(clamp(u, -1, 1));
        if (Math.abs(Math.sin(th * 3.4)) < 0.12) return O[clamp(t - 1, 1, 4)];
        // jack-o-lantern face
        const fx = x - 21;
        if (Y > 21 && Y < 27 && (inPoly([[-8, 26], [-2.5, 26], [-5.2, 21]])(fx + 0.5, Y) || inPoly([[2.5, 26], [8, 26], [5.2, 21]])(fx + 0.5, Y))) return F[y < 24 ? 2 : 3];
        if (Y > 28.5 && Y < 33.5) {
          const top = 29 + (fx * fx) * 0.012, bot = 30.6 + 2.6 * Math.cos(fx * 0.17);
          if (Math.abs(fx) < 8.5 && Y > top && Y < bot && !(Math.abs(fx % 4) < 0.8 && Y < top + 1.4)) return F[2];
        }
      },
    });
    swirl(c, 21, 15, 10.5);
    c.dots([[14, 13], [18, 11], [24, 10], [26, 13], [20, 8], [22, 12], [16, 14], [28, 15]], PAL.cinn[2]);
    c.dots([[23, 6], [19, 12]], PAL.cinn[3]);
  },
  cocoa_cinnamon(c) {
    const B = PAL.maroon;
    mug(c, {
      body: B,
      handle: PAL.charcoal,
      liquid: ramp(0x8e3e28, { l1: 0xb05a3a, hl: 0xf0b090 }),
      tex: (x, y, t, u, Y) => {
        const f1 = 36 - 5.5 * Math.abs(Math.sin((x + 1) * 0.55)) - 2 * Math.abs(Math.sin(x * 1.3));
        const f2 = 37 - 3 * Math.abs(Math.sin((x + 1) * 0.55 + 0.4));
        if (y > f2) return PAL.yellow[clamp(t + 1, 2, 5)];
        if (y > f1) return PAL.orange[clamp(t, 2, 5)];
      },
    });
    // cinnamon stick poking out
    c.tube([[15, 18], [29, 3]], 2.4, PAL.cinn, { edge: 0, tex: (x, y, t, u, v) => (Math.abs(v - 0.35) < 0.18 ? 2 : u > 0.94 ? 4 : null) });
    c.ball(29, 3.5, 2.2, 2.2, PAL.cinn, { t: 4, tex: (x, y) => ((x + y) % 2 ? 2 : null) });
    // red-hot candies
    for (const [x, y] of [[12, 15], [25, 16.5], [29, 15], [18, 16.5]]) c.ball(x, y, 1.9, 1.6, PAL.candyRed, { edge: 0, spec: 0.85 });
  },
  cocoa_mocha(c) {
    const Fo = ramp(0xecd2ac, { ol: 0x6a3a28, hl: 0xfffaf0 });
    mug(c, {
      body: PAL.navy,
      liquid: Fo,
      depth: 1.1,
      tex: (x, y, t, u, Y) => {
        if (Y > 19.5 && Y < 22) return PAL.cream[clamp(t, 1, 4)];
        if (bmHit(BM.star, 19, 26, x, y)) return PAL.yellow[clamp(t + 1, 3, 5)];
        if (Y > 34 && Y < 35.6) return PAL.cream[clamp(t - 1, 1, 3)];
      },
      ltex: (x, y, t, u, v) => {
        if (bmHit(['.XX.XX.', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'], 18, 15, x, y)) return PAL.mocha[x < 20 ? 4 : 3];
        if (u * u + v * v > 0.62) return PAL.mocha[u < 0 ? 4 : 3];
        return null;
      },
    });
    for (const [x, y, a] of [[29.5, 12.5, 0.6], [25.5, 11, -0.3]]) {
      c.pillow(rell(x, y, 3, 2.2, a), PAL.coffee, { rad: 1.4, edge: 0, spec: 0.9, tex: (X, Y) => (Math.abs(-(X + 0.5 - x) * Math.sin(a) + (Y + 0.5 - y) * Math.cos(a)) < 0.45 ? 1 : null) });
    }
    c.dots([[14, 16], [16, 15], [26, 17], [23, 15]], PAL.cinn[2]);
  },
  cocoa_takeaway(c) {
    const cx = 24, CUP = PAL.paper, K = PAL.kraft, LID = ramp(0x6a3e2c);
    const rf = (Y) => 11.2 - (Y - 13) * 0.11;
    c.lathe(cx, 13, 40, rf, CUP, {
      tex: (x, y, t, u, Y) => {
        if (Y > 21 && Y < 32.5) {
          if (bmHit(BM.skull, cx - 3, 23, x, y)) return CUP[clamp(t + 1, 3, 5)];
          if (Y < 22.2 || Y > 31.3) return K[clamp(t - 1, 1, 3)];
          return K[clamp(t, 1, 4)];
        }
        if (Y > 37.8) return CUP[clamp(t - 1, 1, 4)];
        if (Y > 14.5 && Y < 16.5) return PAL.orange[clamp(t, 2, 4)];
      },
    });
    // lid: rim band + recessed top + raised sip spout
    c.lathe(cx, 10.5, 13.8, (Y) => 12.3 - Math.max(0, 11.3 - Y) * 0.6, LID, {});
    c.ell(cx, 10.5, 11.7, 4.2, LID, { t: 4, tex: (x, y, t, u, v) => { const q = u * u + v * v; return q > 0.8 ? (u < 0 ? 5 : 4) : q > 0.62 ? 2 : 3; } });
    c.pillow(inEll(cx - 3, 11.6, 4.6, 2), LID, { rad: 1.2, edge: 2 });
    c.dots([[cx - 5, 11], [cx - 4, 11], [cx - 3, 11]], LID[0]);
    c.dots([[cx - 8, 9], [cx - 7, 9]], LID[5]);
  },

  // ======================================================== ingredients
  milk_bottle(c) {
    const cx = 24, M = PAL.milk, G = PAL.glass, Bl = PAL.blue;
    const rf = (Y) => (Y < 15 ? 5 : Y < 22 ? 5 + 5.5 * sstep((Y - 15) / 7) : Y < 37 ? 10.5 : 10.5 - (Y - 37) ** 2 * 0.7);
    c.lathe(cx, 10, 40, rf, M, {
      tex: (x, y, t, u, Y) => {
        const shine = u > -0.68 && u < -0.46;
        if (Y < 13.6) return shine ? G[5] : G[clamp(t, 1, 4)];
        if (Y < 14.4) return M[2];
        if (Y > 25 && Y < 34) {
          if (bmHit(BM.drop, cx - 2, 27, x, y)) return M[clamp(t + 1, 3, 5)];
          if (Y < 25.9 || Y > 33.1) return Bl[clamp(t - 1, 1, 3)];
          return Bl[clamp(t, 1, 4)];
        }
        if (shine && t >= 2) return M[5];
      },
    });
    c.lathe(cx, 7, 10.4, (Y) => (Y > 9 ? 6 : 5.6), PAL.red, { tex: (x, y, t, u) => (Math.sin(Math.asin(clamp(u, -1, 1)) * 9) > 0.5 ? clamp(t - 1, 1, 4) : null) });
    c.ell(cx, 7, 5.6, 2, PAL.red, { t: 4, tex: (x, y, t, u) => (u < -0.3 ? 5 : null) });
  },
  milk_carton(c) {
    const W = PAL.paper, B = PAL.blue;
    const front = [[10, 21], [29, 21], [29, 42], [10, 42]];
    c.face(inPoly(front), W, {
      t: 3, tex: (x, y, t) => {
        if (y >= 36) return B[y === 36 ? 4 : 3];
        const e = ((x + 0.5 - 19.5) / 5.2) ** 2 + ((y + 0.5 - 28.5) / 5.2) ** 2;
        if (e < 1) return bmHit(BM.drop, 17, 26, x, y) ? W[4] : B[e > 0.7 ? 2 : 3];
        if (x === 10) return 4;
      },
    });
    c.face(inPoly([[29, 21], [37, 17], [37, 38], [29, 42]]), W, { t: 2, tex: (x, y) => (y >= 36 - (x - 29) * 0.5 ? B[2] : x === 29 ? W[3] : null) });
    c.face(inPoly([[10, 21], [29, 21], [33, 12], [14, 12]]), B, { t: 4, tex: (x, y) => (y === 20 ? B[3] : (x + y) % 9 === 0 ? B[5] : null) });
    c.face(inPoly([[29, 21], [37, 17], [33, 12]]), B, { t: 2, tex: (x, y) => (Math.abs(x - 33) < 0.6 ? B[1] : null) });
    c.face(inPoly([[14, 12], [33, 12], [33, 9], [14, 9]]), B, { t: 3, tex: (x, y) => (y === 9 ? B[4] : null) });
    c.dots([[11, 22], [12, 22], [11, 23]], 0xffffff);
  },
  cream(c) {
    const cx = 22, J = PAL.sky;
    c.ring(cx + 11.5, 27, 6.6, 7.4, 3.2, 3.8, J, {});
    const rf = (Y) => 8.6 + 3.8 * Math.sin(Math.PI * clamp((Y - 15) / 27, 0, 1)) - Math.max(0, Y - 39) ** 2 * 0.5;
    c.lathe(cx, 15, 41, rf, J, {
      tex: (x, y, t, u, Y) => {
        if (Y > 18 && Y < 19.4) return PAL.white[clamp(t, 1, 4)];
        const th = Math.asin(clamp(u, -1, 1)) * 3;
        const fx = th - Math.round(th), fy = ((Y - 22) % 6) - 3;
        if (Y > 21 && Y < 38 && Math.abs(u) < 0.9 && fx * fx * 14 + fy * fy * 0.6 < 1) return PAL.white[clamp(t, 2, 5)];
      },
    });
    c.pillow(inPoly([[cx - 7, 12.5], [cx - 15, 9.5], [cx - 13, 14], [cx - 7, 18.5]]), J, { rad: 1.4 });
    c.opening(cx, 15, 8.8, 1.4, 1.2, J, PAL.cream);
    c.tube([[cx - 13, 11.3], [cx - 8, 14.5]], 0.8, PAL.cream, { t: 3 });
    c.dots([[cx - 13, 10]], 0xffffff);
  },
  butter(c) {
    const W = PAL.paper, B = PAL.blue;
    c.poly([[3, 36], [33, 36], [44, 27], [15, 27]], W, { rad: 1.2, tex: (x, y, t) => ((x - y * 1.1) % 6 === 0 ? B[3] : t >= 4 ? 4 : null) });
    c.poly([[3, 36], [33, 36], [33, 39], [3, 39]], W, { t: 2, tex: (x) => ((x % 6) === 0 ? B[2] : null) });
    c.box(9, 22, 22, 10, 8, -6, PAL.butter, { rad: 2 });
    // a curl of butter
    c.pillow(inEll(37, 34.5, 4.5, 2.6), PAL.butter, { rad: 1.5, edge: 0, tex: (x, y, t, u, v) => (Math.abs(v - 0.5) < 0.12 && u > 0.2 ? 2 : null) });
    c.dots([[12, 23], [13, 23], [17, 17]], 0xfffcf0);
  },
  eggs(c) {
    const K = ramp(0xbab6cc, { ol: 0x4a4466 });
    // lid (open, behind)
    c.poly([[7, 19], [41, 19], [43, 8], [9, 8]], K, { rad: 2, bias: 0.1, tex: (x, y, t) => (y > 16 ? Math.max(1, t - 1) : null) });
    c.face(inPoly([[6, 18], [42, 18], [42, 31], [6, 31]]), K, { t: 1 });
    const eggs = [[13, 21, PAL.egg], [24, 20.5, PAL.eggW], [35, 21, PAL.egg], [12.5, 27, PAL.eggW], [24, 27, PAL.egg], [35.5, 27, PAL.egg]];
    for (const [x, y, R] of eggs) {
      c.ball(x, y, 5.2, 6.4, R, { edge: 0, spec: 0.94, shape: (u, v) => u * u * (1 + v * 0.25) + v * v <= 1 });
      if (R === PAL.egg) c.dots([[x + 2, y + 2], [x - 1, y + 3], [x + 1, y - 2]], R[2]);
    }
    c.pillow((x, y) => x > 5 && x < 43 && y < 42.5 && y > 32 + 1.6 * Math.cos(((x - 7) / 11) * Math.PI * 2) + 0.6, K, {
      rad: 2.5, tex: (x, y, t) => (Math.abs(((x - 7) % 11.33) - 5.6) > 5 && y > 34 ? Math.max(1, t - 1) : null),
    });
    c.dots([[8, 9], [9, 9]], K[5]);
  },
  flour(c) {
    const F = ramp(0xece0c4, { ol: 0x6a5038 }), Bl = PAL.blue, Rd = PAL.red;
    const hw = (y) => {
      if (y < 7) return 0;
      if (y < 13) return 4.5 + (y - 7) * 0.55 + (Math.floor(y) === 7 ? -1 : 0);
      if (y < 16.5) return 5;
      if (y < 21) return 5 + sstep((y - 16.5) / 4.5) * 8.5;
      if (y < 38) return 13.5 + Math.sin((y - 21) / 17 * Math.PI) * 1.2;
      return Math.sqrt(Math.max(0, 1 - ((y - 38) / 4.6) ** 2)) * 13.5;
    };
    const ins = (x, y) => Math.abs(x - 24) <= hw(y) + (y < 9 ? (Math.sin(x * 1.7) > 0 ? 0 : -1.5) : 0);
    c.pillow(ins, F, {
      rad: 5, dome: 2.5,
      tex: (x, y, t) => {
        if (y > 26 && y < 30 && Math.abs(x - 24) < 12) return Bl[clamp(t, 1, 4)];
        if (y === 31 && Math.abs(x - 24) < 12) return Rd[clamp(t, 1, 4)];
        if (bmHit(BM.wheat, 22, 31, x, y)) return PAL.crust[clamp(t, 2, 4)];
        if ((x * 5 + y * 3) % 11 === 0 && t >= 3 && y > 18) return F[t - 1];
        if (y < 14 && (x % 3 === 0)) return Math.max(1, t - 1);
      },
    });
    const Tw = ramp(0xb07a48);
    c.tube([[18.5, 15], [21, 16.6], [27, 16.6], [29.5, 15]], 1.2, Tw, { tex: (x, y, t, u) => ((x + y) % 2 ? Math.max(1, t - 1) : null) });
    c.pillow(rell(22.5, 15, 3, 1.8, 0.5), Tw, { rad: 1, edge: 0 });
    c.pillow(rell(28.5, 15, 3, 1.8, -0.5), Tw, { rad: 1, edge: 0 });
    c.tube([[25, 16.5], [23.5, 21], [24, 23]], 0.8, Tw, {});
    c.tube([[26, 16.5], [28, 20.5], [27.5, 22.5]], 0.8, Tw, {});
    c.ball(25.5, 16.2, 1.7, 1.5, Tw, { edge: 0 });
    c.dots([[14, 7], [33, 6], [36, 9], [12, 10], [31, 4]], 0xfffcf4);
  },
  sugar(c) {
    const W = PAL.white, B = ramp(0xe8608a);
    c.pillow(or(rrect(11, 15, 35, 42, 3), inPoly([[12, 16], [34, 16], [32, 9], [14, 9]])), W, {
      rad: 3.5, dome: 1.5,
      tex: (x, y, t) => {
        if (y < 16) return y === 12 || y === 15 ? Math.max(1, t - 1) : Math.max(2, t);
        if (y > 22 && y < 33) {
          if (bmHit(BM.heart, 21, 25, x, y)) return W[clamp(t + 1, 3, 5)];
          return B[clamp(t, 1, 4)];
        }
        if (y === 34) return B[clamp(t - 1, 1, 3)];
      },
    });
    // two sugar cubes
    c.box(25, 35, 7, 6, 3, -2.5, PAL.salt, { rad: 1, tex: (x, y, k) => (hsh(x, y, 3) < 0.15 ? Math.min(5, k + 1) : k) });
    c.box(33, 37, 7, 5, 3, -2.5, PAL.salt, { rad: 1, tex: (x, y, k) => (hsh(x, y, 4) < 0.15 ? Math.min(5, k + 1) : k) });
    c.dots([[22, 43], [24, 42], [20, 42]], PAL.salt[2]);
  },
  cocoa_powder(c) {
    const cx = 24, T = PAL.red, G = PAL.gold, L = PAL.cream;
    c.lathe(cx, 12, 40, () => 11, T, {
      tex: (x, y, t, u, Y) => {
        if (Y < 14.2 || Y > 38) return G[clamp(t, 1, 5)];
        if (Y > 19 && Y < 33) {
          if (Y < 19.8 || Y > 32.2) return G[clamp(t, 2, 4)];
          if (bmHit(BM.bean, cx - 2, 22, x, y)) return PAL.choc[clamp(t, 2, 4)];
          return L[clamp(t, 1, 4)];
        }
      },
    });
    c.lathe(cx, 9.5, 12.6, () => 11.6, G, {});
    c.ell(cx, 9.5, 11.6, 4.2, G, { t: 4, tex: (x, y, t, u, v) => (u * u + v * v > 0.62 && u * u + v * v < 0.85 ? 3 : v < -0.3 && u < -0.2 ? 5 : null) });
    c.dots([[16, 18], [16, 19], [16, 20]], 0xffd8c8);
    c.tube([[33, 41], [44, 36]], 1.1, PAL.woodLight, { edge: 0 });
    c.ball(31, 41.5, 4.2, 2.4, PAL.woodLight, { edge: 0 });
    c.ball(31, 40.6, 3.4, 2, PAL.milkChoc, { edge: 1 });
    c.dots([[37, 43], [26, 43]], PAL.milkChoc[2]);
  },
  dark_chocolate(c) {
    const Ch = PAL.choc, Wr = PAL.plum, G = PAL.gold, Fo = PAL.silver;
    const bite = (x, y) => (x - 33) ** 2 + (y - 7) ** 2 < 30 || (x - 28) ** 2 + (y - 4.5) ** 2 < 10;
    // side face
    c.poly([[33, 7], [36, 4.5], [36, 40], [33, 42]], Ch, { t: 1, clip: not(bite) });
    // chocolate squares
    for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) {
      const x0 = 13 + k * 10, y0 = 7 + r * 6;
      c.pillow(and(rrect(x0, y0, x0 + 10, y0 + 6, 1), not(bite)), Ch, { rad: 2, spec: 0.9 });
    }
    c.poly([[33, 7], [36, 4.5], [36, 12], [33, 14]], Ch, { t: 2, clip: not(bite) });
    // foil, torn
    c.pillow((x, y) => x > 12.5 && x < 33.5 && y > 23 + Math.abs(((x * 1.7) % 3) - 1.5) && y < 27, Fo, { rad: 1, dith: 1 });
    c.poly([[33, 24], [36, 22], [36, 26], [33, 28]], Fo, { t: 2 });
    // wrapper
    c.box(13, 26, 20, 16, 3, -2.2, Wr, {
      rad: 1.5, hiEdge: false,
      tex: (x, y, k, f) => {
        if (y >= 31 && y <= 34 && f !== 'top') return G[clamp(k, 1, 5)];
        if (f === 'front' && bmHit(BM.bean, 20, 35, x, y)) return Wr[4];
        if (f === 'front' && bmHit(BM.bean, 24, 35, x, y)) return Wr[4];
        return k;
      },
    });
    c.dots([[15, 9], [16, 9], [15, 10], [25, 9]], Ch[5]);
  },
  marshmallows(c) {
    const Bag = ramp(0xd8ecf6, { ol: 0x3e5a84 }), Hd = PAL.pink;
    const bag = c.pillow(or(rrect(10, 14, 38, 42, 4)), Bag, { rad: 4, dome: 1 });
    // marshmallows seen through the bag
    const tinted = PAL.marsh.map((v) => mixc(v, 0xb8d8f0, 0.28)), tintedP = ramp(0xf8c0d4).map((v) => mixc(v, 0xb8d8f0, 0.25));
    const inBag = rrect(11.5, 15.5, 36.5, 41, 3);
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) {
      const x = 10 + k * 7.4 + (r % 2) * 3.6, y = 15.5 + r * 6.4;
      marsh(c, x, y, 7, 5.6, (r + k) % 3 === 1 ? tintedP : tinted, { rad: 2, clip: inBag });
    }
    // film shine
    c.tube([[13, 38], [17, 18]], 0.8, Bag, { t: 5 });
    c.tube([[34, 39], [35, 33]], 0.6, Bag, { t: 5 });
    // header strip
    c.pillow((x, y) => x > 9 && x < 39 && y < 16 && y > 7 + (x % 3 === 0 ? 0 : 1), Hd, { rad: 1.5, tex: (x, y, t) => (y === 13 ? 2 : bmHit(BM.heart, 22, 9, x, y) ? 5 : null) });
    marsh(c, 30, 36, 7, 6, PAL.marsh, { rad: 2.2 });
    marsh(c, 37, 38, 6, 5, ramp(0xf8c0d4), { rad: 2 });
  },
  cinnamon(c) {
    const Ci = PAL.cinn;
    const stick = (x0, y0, x1, y1) => {
      c.tube([[x0, y0], [x1, y1]], 3, Ci, { edge: 0, tex: (x, y, t, u, v) => (Math.abs(v + 0.25) < 0.16 ? 2 : (Math.floor(u * 30) % 7 === 0 && t > 2) ? t - 1 : null) });
      c.ball(x1, y1, 3, 3, Ci, { edge: 0, t: 4, tex: (x, y, t, u, v) => { const r = Math.hypot(u, v); const a = Math.atan2(v, u); return Math.abs(((r * 3 + a / Math.PI) % 1)) < 0.35 ? 2 : r > 0.75 ? 3 : null; } });
    };
    stick(9, 36, 33, 9);
    stick(13, 41, 38, 15);
    stick(6, 30, 27, 6);
    c.tube([[14, 19], [24, 33]], 1.4, PAL.wood, { edge: 0, tex: (x, y, t, u) => (Math.floor(u * 12) % 2 ? 2 : null) });
    c.tube([[23, 28], [27, 33], [22, 37]], 0.9, PAL.wood, {});
    c.tube([[23, 28], [18, 34], [21, 38]], 0.9, PAL.wood, {});
  },
  nutmeg(c) {
    const N = PAL.nutmeg;
    const net = (x, y, t) => {
      const a = Math.sin(x * 0.9 + Math.sin(y * 0.7) * 2) + Math.sin(y * 1.1 + Math.cos(x * 0.6) * 2);
      return Math.abs(a) < 0.28 ? Math.max(1, t - 1) : null;
    };
    c.ball(17, 22, 11, 9.5, N, { tex: net });
    c.ball(13, 35, 8, 6.5, N, { edge: 0, tex: net });
    // half nutmeg showing the marbled inside
    c.ball(32, 33, 11, 9, N, { edge: 0, shape: (u, v) => v > -0.2 });
    c.ell(32, 29.5, 10.2, 5.6, ramp(0xe0b880), {
      edge: 1, tex: (x, y, t, u, v) => {
        const r = Math.hypot(u, v);
        if (r > 0.86) return PAL.nutmeg[2];
        const m = Math.sin(Math.atan2(v, u) * 7 + r * 9);
        return m > 0.55 ? PAL.nutmeg[3] : m > 0.2 ? PAL.nutmeg[4] : r < 0.25 ? 3 : 4;
      },
    });
    c.dots([[11, 16], [12, 16], [11, 17]], N[5]);
  },
  mint(c) {
    const L = PAL.mintLeaf;
    c.tube([[24, 44], [24, 30], [23, 18], [24, 9]], 1.2, PAL.green, {});
    const leaf = (x, y, a, len, w) => c.pillow(leafShape(x, y, a, len, w), L, {
      rad: 2, edge: 0,
      tex: (X, Y, t) => {
        const dx = X + 0.5 - x, dy = Y + 0.5 - y, u = dx * Math.cos(a) + dy * Math.sin(a), v = -dx * Math.sin(a) + dy * Math.cos(a);
        if (Math.abs(v) < 0.55 && u > 1 && u < len - 2) return 2;
        if (Math.abs(Math.abs(v) - (u % 4) * 0.8) < 0.45 && u > 2 && u < len - 3) return Math.max(2, t - 1);
        return null;
      },
    });
    leaf(23, 34, -2.6, 16, 5.2);
    leaf(25, 33, -0.5, 16, 5.2);
    leaf(23, 23, -2.3, 13, 4.4);
    leaf(24, 22, -0.8, 13, 4.4);
    leaf(24, 13, -1.9, 9, 3.4);
    leaf(24, 12, -1.1, 9, 3.4);
  },
  maple_syrup(c) {
    const cx = 22, Sy = PAL.syrup;
    c.ring(31.5, 15.5, 4.4, 4.8, 2, 2.4, Sy, {});
    const rf = (Y) => (Y < 12 ? 3.6 : Y < 19 ? 3.6 + 7.6 * sstep((Y - 12) / 7) : Y < 38 ? 11.2 : 11.2 - (Y - 38) ** 2 * 0.8);
    c.lathe(cx, 8.5, 41, rf, Sy, {
      lo: -0.6, hi: 0.8,
      tex: (x, y, t, u, Y) => {
        if (Y > 23 && Y < 34 && Math.abs(u) < 0.8) {
          if (bmHit(BM.maple, cx - 4, 24, x, y)) return PAL.red[clamp(t, 2, 4)];
          return PAL.cream[clamp(t, 1, 4)];
        }
        if (u > 0.25 && u < 0.7 && Y > 34 && t <= 2) return Sy[t + 1];
        if (u > -0.7 && u < -0.5 && Y > 14) return Sy[5];
      },
    });
    c.lathe(cx, 5, 9, () => 4.2, PAL.red, { tex: (x, y, t, u) => (Math.sin(Math.asin(clamp(u, -1, 1)) * 7) > 0.6 ? clamp(t - 1, 1, 4) : null) });
    c.ell(cx, 5, 4.2, 1.6, PAL.red, { t: 4 });
    c.dots([[14, 37], [15, 38]], Sy[4]);
  },
  honey(c) {
    const cx = 24, H = PAL.honey, Gi = PAL.red;
    const rf = (Y) => (Y < 17 ? 9.5 : Y < 19 ? 9.5 + (Y - 17) * 0.8 : Y < 38 ? 11.2 : 11.2 - (Y - 38) ** 2 * 0.8);
    c.lathe(cx, 15, 41, rf, H, {
      lo: -0.6, hi: 0.8,
      tex: (x, y, t, u, Y) => {
        if (Y > 24 && Y < 34 && Math.abs(u) < 0.75) {
          if (bmHit(BM.bee, cx - 3, 27, x, y)) return (y - 27) % 2 ? PAL.charcoal[3] : PAL.yellow[4];
          return PAL.kraft[clamp(t, 1, 4)];
        }
        if (u > 0.2 && u < 0.7 && Y > 33 && t <= 2) return H[t + 1];
        if (u > -0.72 && u < -0.52 && Y > 19) return H[5];
      },
    });
    // gingham cloth top
    c.pillow((x, y) => {
      const dx = x - 24;
      if (y < 7 || y > 20) return false;
      const w = y < 11 ? 8 + (y - 7) * 0.9 : y < 15 ? 11.6 : 13.5 - Math.abs(Math.sin(dx * 0.75)) * 1.6;
      return Math.abs(dx) < w && y < 18 + Math.abs(Math.sin(dx * 0.6)) * 2.5;
    }, ramp(0xf4eee8, { ol: 0x7a2a2a }), {
      rad: 3, dome: 2,
      tex: (x, y, t) => {
        const a = Math.floor(x / 2.5) % 2, b = Math.floor(y / 2.5) % 2;
        return a && b ? Gi[clamp(t - 1, 1, 4)] : a || b ? mixc(Gi[clamp(t, 1, 5)], 0xffffff, 0.45) : null;
      },
    });
    c.tube([[13, 15.5], [24, 16.5], [35, 15.5]], 1, PAL.stem, {});
    // drip
    c.tube([[16, 18], [15.5, 23], [16, 26]], (t) => 1 + t * 0.7, H, { t: 4, edge: 1 });
    c.px(15, 22, H[5]);
  },
  coffee_beans(c) {
    const K = PAL.kraft, Co = PAL.coffee;
    c.pillow(or(rrect(12, 13, 36, 39, 2.5), inPoly([[13, 14], [35, 14], [33, 7], [15, 7]])), K, {
      rad: 3.5, dome: 1.5,
      tex: (x, y, t) => {
        if (y < 14) return y === 10 ? Math.max(1, t - 1) : null;
        if (y === 14) return 2;
        const e = ((x + 0.5 - 24) / 7) ** 2 + ((y + 0.5 - 25) / 7) ** 2;
        if (e < 1) return bmHit(BM.bean, 22, 22, x, y) ? K[4] : Co[e > 0.75 ? 2 : 3];
      },
    });
    c.tube([[12, 11], [36, 11]], 1, PAL.silver, {});
    const bean = (x, y, a) => {
      c.pillow(rell(x, y, 4.4, 3.1, a), Co, { rad: 2, edge: 0, spec: 0.9, tex: (X, Y) => { const w = -(X + 0.5 - x) * Math.sin(a) + (Y + 0.5 - y) * Math.cos(a) - Math.sin(((X + 0.5 - x) * Math.cos(a) + (Y + 0.5 - y) * Math.sin(a)) * 0.8) * 0.6; return Math.abs(w) < 0.5 ? 1 : w < -0.5 && w > -1.5 ? 4 : null; } });
    };
    bean(10, 38, 0.5);
    bean(36.5, 41, -0.35);
    bean(41, 35, 1.1);
  },
  vanilla(c) {
    const V = PAL.vanilla;
    const pod = (pts) => c.tube(pts, (t) => 1.9 * Math.min(1, Math.min(t, 1 - t) * 8 + 0.35), V, { edge: 0, spec: 0.9, tex: (x, y, t, u, v) => (Math.floor(u * 26) % 3 === 0 && t > 1 ? t - 1 : null) });
    pod([[7, 40], [16, 31], [27, 19], [40, 9]]);
    pod([[10, 43], [20, 33], [30, 23], [43, 15]]);
    pod([[5, 34], [15, 26], [26, 15], [35, 5]]);
    c.tube([[16, 26], [23, 35]], 1.3, PAL.cream, { edge: 0 });
    // vanilla orchid
    const P = ramp(0xf6eab0);
    for (let k = 0; k < 5; k++) {
      const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
      c.pillow(leafShape(13, 13, a, 7.5, 2.6), P, { rad: 1.6, edge: 1 });
    }
    c.ball(13, 13, 2.4, 2.2, PAL.yellow, { edge: 0 });
    c.px(12, 12, 0xfffce0);
  },
  pumpkin(c) {
    const O = PAL.pumpkin;
    c.ball(24, 29, 19, 13.5, O, {
      shape: (u, v) => u * u + v * v * (1 + 0.15 * (v < 0 ? 1 : 0)) <= 1,
      tex: (x, y, t, u, v) => {
        const th = Math.asin(clamp(u / Math.sqrt(Math.max(0.05, 1 - v * v)), -1, 1));
        const rb = Math.cos(th * 5.2);
        if (rb > 0.93) return Math.max(1, t - 2);
        if (rb > 0.7) return Math.max(1, t - 1);
        if (rb < -0.75 && t >= 3) return Math.min(5, t + 1);
        return null;
      },
    });
    c.ball(24, 17.5, 6, 2.2, O, { t: 1 });
    c.tube([[24, 18], [25, 13], [28, 8]], (t) => 2.6 - t * 0.6, ramp(0x7a8a38), { edge: 0, tex: (x, y, t, u, v) => (Math.abs(v) < 0.25 ? 2 : null) });
    c.ell(28, 8.2, 2, 1.2, ramp(0x9aa848), { t: 4 });
    c.pillow(leafShape(29, 13, -0.2, 10, 3.6), PAL.leaf, { rad: 1.6, edge: 0, tex: (x, y, t, u, v) => (Math.abs(v - 0.5) < 0.07 && u > 0.1 ? 2 : null) });
    c.tube([[22, 15], [18, 13], [17, 9.5], [19.5, 8.5], [20, 11]], 0.6, PAL.green, {});
    c.dots([[12, 22], [13, 21], [12, 23]], O[5]);
  },
  apple_red(c) { apple(c, PAL.appleR, 0xf8d040); },
  apple_green(c) { apple(c, PAL.appleG, 0xe8e070); },
  cranberries(c) {
    const Cr = PAL.cranb, B = PAL.porcelain, cx = 24, cy = 28;
    c.lathe(cx, cy, 40, (Y) => 17 - 7 * ((Y - cy) / 12) ** 2, B, { tex: (x, y, t, u, Y) => (Y > 31 && Y < 33 ? PAL.red[clamp(t, 1, 4)] : null) });
    c.opening(cx, cy, 17, 1.6, 0.6, B, ramp(0x8a1028));
    const lip = (x, y) => y < cy + EL * 15.4 * Math.sqrt(Math.max(0, 1 - ((x - cx) / 15.4) ** 2)) - 0.2;
    const pos = [[17, 22], [25, 20], [32, 23], [12, 26.5], [20, 26], [28, 25.5], [36, 27], [16, 30], [24, 30], [32, 30], [21, 17], [29, 17.5]];
    for (const [x, y] of pos) {
      c.ball(x, y, 4.4, 4, Cr, { edge: 0, spec: 0.92, clip: lip });
      if (lip(x + 1.5, y + 2.5)) c.px(x + 1, y + 2, Cr[1]);
    }
    c.pillow(leafShape(24, 15, -2.5, 10, 3.2), PAL.leaf, { rad: 1.5, edge: 0 });
    c.pillow(leafShape(26, 15, -0.5, 10, 3), PAL.leaf, { rad: 1.5, edge: 0 });
    c.tube([[25, 16], [25.5, 10]], 0.7, PAL.stem, {});
  },
  blueberries(c) {
    const Bb = PAL.blueb, K = ramp(0x8ab060);
    const pos = [[17, 20], [26, 18], [33, 21], [13, 25], [22, 24], [30, 25], [37, 26], [18, 28], [27, 29]];
    for (const [x, y] of pos) {
      c.ball(x, y, 4.6, 4.3, Bb, { edge: 0, spec: 0.98, bias: 0.05, tex: (X, Y, t) => (t === 4 && hsh(X, Y) < 0.4 ? mixc(Bb[4], 0xc8d0ee, 0.5) : null) });
      c.dots([[x - 1, y - 2], [x + 1, y - 2], [x, y - 3]], Bb[1]);
      c.px(x, y - 2, Bb[0]);
    }
    // green pulp basket
    c.pillow((x, y) => y > 28 && y < 43 && Math.abs(x - 24) < 16 - (y - 28) * 0.22, K, {
      rad: 2.2,
      tex: (x, y, t) => (y < 31 ? Math.min(5, t + 1) : ((x - 24 + (y - 28) * 0.22 * Math.sign(x - 24)) % 4 === 0 ? Math.max(1, t - 1) : null)),
    });
  },
  caramels(c) {
    const Ca = PAL.caramel, Wr = PAL.gold;
    // wrapped candy at the back
    c.pillow(or(inPoly([[9, 10], [15, 14], [9, 19]]), inPoly([[39, 10], [33, 14], [39, 19]])), Wr, { rad: 1.2, dith: 1, tex: (x, y, t) => ((x + y) % 3 === 0 ? Math.min(5, t + 1) : null) });
    c.pillow(rrect(14, 9, 34, 20, 4), Wr, { rad: 3, spec: 0.9, tex: (x, y, t) => (x === 20 || x === 28 ? Math.max(1, t - 1) : null) });
    c.box(8, 26, 13, 12, 5, -4, Ca, { rad: 2.5 });
    c.box(25, 29, 12, 11, 5, -4, Ca, { rad: 2.5 });
    c.dots([[29, 7], [30, 7], [41, 32]], 0xffffff);
    c.dots([[44, 40], [43, 41]], PAL.salt[3]);
  },
  sea_salt(c) {
    const cx = 23, G = PAL.glass, Sa = PAL.salt, Bl = PAL.blue;
    c.lathe(cx, 14, 41, (Y) => (Y < 38 ? 10.5 : 10.5 - (Y - 38) ** 2 * 0.8), Sa, {
      tex: (x, y, t, u, Y) => {
        if (Y < 18) return u > -0.65 && u < -0.45 ? G[5] : G[clamp(t, 1, 4)];
        if (Y > 25 && Y < 33) {
          if (bmHit(BM.wave, cx - 4, 28, x, y)) return Sa[4];
          return Bl[clamp(t, 1, 4)];
        }
        const h = hsh(x >> 1, y >> 1, 9);
        return h < 0.2 ? Sa[clamp(t - 1, 1, 4)] : h > 0.85 ? Sa[5] : null;
      },
    });
    c.lathe(cx, 9, 14.5, (Y) => 8.4 - (14.5 - Y) * 0.1, PAL.cork, { tex: (x, y, t) => (hsh(x, y, 2) < 0.2 ? Math.max(1, t - 1) : null) });
    c.ell(cx, 9, 7.9, 2.8, PAL.cork, { t: 4, tex: (x, y) => (hsh(x, y, 5) < 0.2 ? 3 : null) });
    // flakes in front
    c.pillow(and(inEll(38.5, 42, 6.5, 5), (x, y) => y < 43), Sa, { rad: 2, tex: (x, y, t) => (hsh(x, y, 7) < 0.25 ? 5 : hsh(x, y, 8) < 0.15 ? 2 : null) });
  },
  oats(c) {
    const W = PAL.wood, O = PAL.oat;
    const rf = (Y) => 16 - 6.5 * ((Y - 23) / 16) ** 2;
    c.lathe(24, 23, 39, rf, W, { tex: (x, y, t, u, Y) => (Math.abs(Y - 28) < 0.6 || Math.abs(Y - 34) < 0.6 ? Math.max(1, t - 1) : null) });
    c.opening(24, 23, 16, 1.6, 0.5, W, O, { ltex: (x, y) => oatTex(x, y) });
    c.pillow(and(inEll(24, 22, 14, 7.5), (x, y) => y < 24.5 + Math.sqrt(Math.max(0, 1 - ((x - 24) / 14.4) ** 2)) * 4.6), O, { rad: 3, dome: 2, tex: (x, y, t) => oatTex(x, y, t) });
    // scoop
    c.tube([[33, 21], [42, 9]], 1.4, PAL.woodLight, { edge: 0 });
    c.ball(31, 22, 4, 2.6, PAL.woodLight, { edge: 0 });
    c.ball(31, 21.6, 3, 1.5, O, { t: 4 });
  },
  bread(c) {
    const B = PAL.bread, Cr = PAL.crumb;
    c.pillow(inEll(24, 28, 20, 12), B, { rad: 6, dome: 3, spec: 0.92 });
    const slash = (x0, y0, x1, y1) => {
      c.tube([[x0, y0], [x1, y1]], (t) => 0.6 + Math.sin(t * Math.PI) * 1.6, Cr, { edge: 1, t: 4 });
    };
    slash(10, 24, 16, 18);
    slash(17, 28, 25, 19);
    slash(25, 31, 33, 21);
    slash(33, 33, 38, 26);
    c.dots([[12, 20], [20, 18], [26, 17], [30, 19], [15, 22], [22, 16]], 0xfaf0dc);
    c.dots([[9, 27], [10, 26]], B[5]);
  },
  cheese(c) {
    const Ch = PAL.cheese, Rn = PAL.rind;
    const hole = (cx, cy, rx, ry) => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    const topHoles = [hole(22, 22, 2.6, 1.3), hole(30, 20, 1.8, 1), hole(15, 26, 1.5, 0.9)];
    const frHoles = [hole(14, 35, 2.2, 2.2), hole(24, 31, 2.8, 2.8), hole(34, 31, 1.7, 1.7), hole(30, 36, 1.4, 1.4), hole(19, 39, 1.3, 1.3)];
    c.face(inPoly([[43, 22], [34, 14], [34, 26], [43, 34]]), Rn, { t: 2 });
    c.face(inPoly([[5, 30], [34, 14], [43, 22]]), Ch, {
      t: 4, tex: (x, y) => {
        for (const h of topHoles) if (h(x + 0.5, y + 0.5)) return h(x + 0.5, y - 0.5) ? Ch[2] : Ch[3];
        if (y + 0.5 > 30 - (x - 5) * 0.21 - 1) return Ch[5];
      },
    });
    c.face(inPoly([[5, 30], [43, 22], [43, 34], [5, 42]]), Ch, {
      t: 3, tex: (x, y) => {
        for (const h of frHoles) if (h(x + 0.5, y + 0.5)) return h(x + 0.5, y - 0.5) ? (h(x + 1.5, y + 0.5) ? Ch[1] : Ch[2]) : Ch[4];
        if (x > 40) return Rn[3];
      },
    });
    c.dots([[7, 29], [8, 29], [9, 28]], 0xfffce8);
  },
  potatoes(c) {
    const P = PAL.potato;
    const lump = (cx, cy, rx, ry, s) => (x, y) => {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, a = Math.atan2(dy, dx);
      return dx * dx + dy * dy <= (1 + 0.07 * Math.sin(a * 3 + s) + 0.05 * Math.sin(a * 5 + s * 2)) ** 2;
    };
    const tex = (x, y, t) => {
      const h = hsh(x, y, 11);
      if (h < 0.05) return P[1];
      if (h > 0.97) return P[4];
      return null;
    };
    c.pillow(lump(18, 22, 13, 9.5, 1), P, { rad: 5, dome: 2, tex });
    c.pillow(lump(29, 33, 14, 9.5, 4), P, { rad: 5, dome: 2, edge: 0, tex });
    for (const [x, y] of [[13, 19], [22, 25], [24, 32], [33, 30], [30, 37], [17, 17]]) { c.px(x, y, P[1]); c.px(x + 1, y, P[2]); c.px(x, y + 1, P[4]); }
  },
  cheese_curds(c) {
    const Cu = PAL.curd, K = PAL.kraft;
    c.poly([[10, 24], [38, 24], [36, 20], [12, 20]], K, { t: 1 });
    const curd = (x, y, s, o = {}) => {
      const pts = [];
      for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + s; const r = 5 + hsh(k, s * 10, 3) * 1.2; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.9]); }
      c.poly(pts, Cu, { rad: 2, edge: 0, spec: 0.93, tex: (X, Y, t) => (hsh(X, Y, s) < 0.06 ? Math.max(1, t - 1) : null), ...o });
    };
    for (const [x, y, s] of [[15, 19, 0.3], [23, 17, 1.2], [31, 19, 2], [19, 12, 3], [27, 11.5, 4], [12, 24, 5], [21, 22, 6], [29, 23, 7], [36, 24, 8], [23, 6.5, 9]]) curd(x, y, s);
    // paper bag front with a folded, zigzag rim
    c.pillow((x, y) => y < 43 && Math.abs(x - 24) < 14.5 - Math.max(0, y - 36) * 0.3 && y > 25 + (Math.floor(x / 2.5) % 2 ? 0 : 1.2), K, {
      rad: 2.5, dome: 1, tex: (x, y, t) => (y < 29 ? Math.min(5, t + 1) : y === 29 ? 2 : (x * 7 + y * 3) % 13 === 0 ? Math.max(1, t - 1) : null),
    });
    c.pillow(inEll(24, 35, 5.5, 4), PAL.red, { rad: 1.5, tex: (x, y, t) => (bmHit(BM.mapleS, 22, 33, x, y) ? PAL.white[3] : null) });
    curd(38, 39, 10);
  },
  gravy(c) {
    const W = PAL.porcelain, G = PAL.gravy, Bl = PAL.blue;
    c.ell(24, 39, 19, 5, W, { t: 3, tex: (x, y, t, u, v) => (u * u + v * v > 0.75 ? 4 : u * u + v * v > 0.55 ? Bl[3] : null) });
    c.ring(39, 27, 5.5, 6, 2.6, 3, W, {});
    c.ball(24, 28, 15, 10, W, { shape: (u, v) => v > -0.1, tex: (x, y, t, u, v) => (v > -0.05 && v < 0.12 ? Bl[clamp(t, 2, 4)] : null) });
    // spout + rim
    c.pillow(inPoly([[11, 23], [4, 19], [5, 22.5], [10, 29.5]]), W, { rad: 1.4 });
    c.ell(24, 27, 15, 5.4, W, { t: 4 });
    c.ell(24, 27.6, 13.4, 4.4, G, {
      t: 3, edge: 2,
      tex: (x, y, t, u, v) => (Math.abs(u + 0.35) < 0.25 && Math.abs(v + 0.2) < 0.3 ? 4 : u > -0.5 && u < -0.3 && v > -0.5 && v < -0.2 ? 5 : null),
    });
    c.tube([[6, 20.5], [11, 25]], 0.9, G, { t: 3 });
    c.tube([[5, 21.5], [5, 25.5]], (t) => 0.7 + t * 0.5, G, { t: 3, edge: 1 });
    c.px(5, 24, G[5]);
  },
  candy_corn(c) {
    // tip, base-left, base-right, corner radius
    const kern = (tip, bl, br, r) => {
      const ins = roundTri([tip, bl, br], r);
      const mx = (bl[0] + br[0]) / 2, my = (bl[1] + br[1]) / 2, ax = tip[0] - mx, ay = tip[1] - my, al = ax * ax + ay * ay;
      const f = (x, y) => ((x - mx) * ax + (y - my) * ay) / al; // 0 at base -> 1 at tip
      c.pillow(ins, PAL.white, {
        rad: 3.5, edge: 0, spec: 0.9, dome: 1,
        tex: (x, y, t) => { const k = f(x + 0.5, y + 0.5); return (k > 0.64 ? PAL.white : k > 0.32 ? PAL.orange : PAL.yellow)[t]; },
      });
    };
    kern([25, 3], [10, 33], [38, 33], 2.6);
    kern([3, 27], [13, 46], [24, 35], 2.2);
    kern([45, 26], [26, 35], [36, 46], 2.2);
  },

  // ======================================================== dishes & treats
  pancakes(c) {
    const cx = 24;
    plate(c, cx, 37, 21);
    const k0 = 33.5;
    for (let k = 0; k < 5; k++) {
      const y0 = k0 - k * 3.4, ox = [0, 0.8, -0.6, 0.5, -0.3][k];
      c.lathe(cx + ox, y0, y0 + 2.8, (Y) => 14.5 - (Y - y0 - 1.4) ** 2 * 0.25 - (k % 2) * 0.4, PAL.pancake, {
        tex: (x, y, t, u, Y) => (Y - y0 < 0.6 || Y - y0 > 2.2 ? Math.max(1, t - 1) : hsh(x, y, k) < 0.1 ? Math.min(4, t + 1) : null),
      });
      c.ell(cx + ox, y0, 14.2, 5.1, PAL.pancakeTop, { t: 4, tex: (x, y, t, u, v) => (u * u + v * v > 0.8 ? 3 : null) });
    }
    const top = k0 - 4 * 3.4;
    // syrup pool + drips
    const pool = (x, y) => ((x - cx - 0.5) / 11) ** 2 + ((y - top - 0.3) / 3.8) ** 2 <= 1 + 0.15 * Math.sin(Math.atan2(y - top, x - cx) * 5);
    const Am = ramp(0xd27a1e, { l1: 0xeea040, hl: 0xfff2c8 });
    c.pillow(pool, Am, { rad: 1.4, spec: 0.88, edge: 1 });
    for (const [x, len, w] of [[14, 8, 1.3], [26.5, 12, 1.5], [34, 5, 1.2]]) {
      const yS = top + 3.6 * Math.sqrt(Math.max(0, 1 - ((x - cx) / 11.5) ** 2));
      c.tube([[x, yS], [x + 0.2, yS + len]], (t) => w * (t > 0.85 ? 1.35 : 0.85 + t * 0.15), Am, { edge: 1, spec: 0.8, lo: -0.6, hi: 0.9 });
    }
    // butter pat
    c.box(cx - 4, top - 4, 7, 3, 3, -2.5, PAL.butter, { rad: 1 });
    c.dots([[cx - 7, top - 1], [cx - 6, top - 1], [cx + 5, top + 1]], 0xfff4d8);
  },
  pumpkin_pie_slice(c) {
    const F = PAL.pumpkinPie, Cr = PAL.crust;
    // front cut face
    c.face(inPoly([[6, 33], [40, 29], [40, 38], [6, 41]]), F, {
      t: 2, tex: (x, y) => {
        const yt = 33 - (x - 6) * 0.118;
        if (y > yt + 5.2) return Cr[y > yt + 6.5 ? 2 : 3];
        if (y < yt + 0.8) return F[3];
        if (x > 37) return Cr[3];
      },
    });
    // top face
    c.face(inPoly([[6, 33], [40, 29], [41.5, 22], [38, 16], [32, 12], [25, 11]]), F, { t: 3, tex: (x, y) => (hsh(x, y, 3) < 0.06 ? F[2] : null) });
    // crust rim
    c.tube([[24, 11.5], [32, 12.5], [38, 16.5], [41, 22], [40.5, 29.5]], 3, Cr, { edge: 1, tex: (x, y, t, u) => (Math.sin(u * 40) > 0.7 ? Math.max(1, t - 1) : null) });
    swirl(c, 22, 23, 7.5, PAL.cream, { tiers: [[1, 3], [0.75, 2.7], [0.5, 2.4]] });
    c.dots([[19, 17], [24, 16], [22, 20], [26, 20]], PAL.cinn[2]);
    c.dots([[10, 31], [11, 31], [12, 30]], F[5]);
  },
  apple_pie(c) {
    const cx = 24, cy = 23, D = PAL.blue, Cr = PAL.crust, Fi = ramp(0xe0a03a, { hl: 0xfff0b0 });
    c.lathe(cx, cy, cy + 9, (Y) => 21.5 - (Y - cy) * 0.35, D, { tex: (x, y, t, u, Y) => (Y > cy + 7.5 ? Math.max(1, t - 1) : null) });
    c.ell(cx, cy, 21.5, 7.9, D, { t: 4 });
    // crimped crust ring
    c.pillow(and(inEll(cx, cy, 20.4, 7.6), not(inEll(cx, cy + 0.3, 16.2, 5.4))), Cr, {
      rad: 1.6, tex: (x, y, t) => { const a = Math.atan2((y - cy) / 7.6, (x - cx) / 20.4); return Math.cos(a * 14) > 0.55 ? Math.max(1, t - 1) : null; },
    });
    // filling + lattice
    c.ell(cx, cy + 0.3, 16.2, 5.4, Fi, { t: 3, tex: (x, y) => (hsh(x, y, 4) < 0.15 ? Fi[2] : hsh(x, y, 5) < 0.06 ? Fi[5] : null) });
    const inF = inEll(cx, cy + 0.3, 16.2, 5.4);
    const vx = (x, y) => { const k = (x - cx + (y - cy) * 0.6) / 5.4; return Math.abs(k - Math.round(k)) < 0.24 ? Math.round(k) : null; };
    const hy = (y) => { const k = (y - cy) / 2.6; return Math.abs(k - Math.round(k)) < 0.3 ? Math.round(k) : null; };
    c.face(and(inF, (x, y) => vx(x, y) !== null || hy(y) !== null), Cr, {
      t: 4, tex: (x, y) => {
        const X = x + 0.5, Y = y + 0.5, a = vx(X, Y), b = hy(Y);
        if (a !== null && b !== null) return (a + b) % 2 ? (hy(Y - 1) === null ? Cr[5] : Cr[4]) : Cr[3];
        if (a !== null) return vx(X - 1, Y) === null ? Cr[5] : vx(X + 1, Y) === null ? Cr[2] : Cr[3];
        return hy(Y - 1) === null ? Cr[5] : hy(Y + 1) === null ? Cr[2] : Cr[4];
      },
    });
    c.dots([[12, 18], [30, 16], [38, 22]], 0xfffbe8);
  },
  butter_tarts(c) {
    const tart = (cx, cy, r) => {
      c.lathe(cx, cy, cy + 5.5, (Y) => r - (Y - cy) * 0.4, PAL.crust, { tex: (x, y, t, u) => (Math.cos(Math.asin(clamp(u, -1, 1)) * 9) > 0.4 ? Math.min(4, t + 1) : Math.max(1, t - 1)) });
      c.pillow(and(inEll(cx, cy, r + 0.4, (r + 0.4) * EL), not(inEll(cx, cy + 0.3, r - 2.2, (r - 2.2) * EL))), PAL.crust, { rad: 1.2, tex: (x, y, t) => (Math.cos(Math.atan2((y - cy) / EL, x - cx) * 11) > 0.5 ? Math.min(5, t + 1) : null) });
      c.ell(cx, cy + 0.3, r - 2.2, (r - 2.2) * EL + 0.2, PAL.syrup, {
        t: 3, tex: (x, y, t, u, v) => {
          if (((u + 0.35) / 0.35) ** 2 + ((v + 0.3) / 0.35) ** 2 < 1) return 5;
          if (((u - 0.3) / 0.3) ** 2 + ((v - 0.1) / 0.45) ** 2 < 1) return ramp(0x4a1e1e)[3];
          if (hsh(x, y, cx) < 0.12) return 4;
          return v > 0.55 ? 2 : null;
        },
      });
    };
    tart(24, 14, 10);
    tart(13, 27, 10);
    tart(35, 28, 10);
    c.tube([[18, 28.5], [18.5, 33]], 0.9, PAL.syrup, { t: 4, edge: 1 });
  },
  nanaimo_bar(c) {
    const Ch = PAL.choc, Cu = ramp(0xf6d670), Ba = ramp(0x6a3e28);
    c.box(6, 20, 26, 21, 10, -8, Ch, {
      rad: 1.2, hiEdge: true,
      tex: (x, y, k, f, px, py) => {
        const yy = f === 'side' ? py + (px - 32) * 0.8 : py;
        if (f === 'top') return Ch[k];
        if (yy < 24.5) return Ch[k];
        if (yy < 25.5) return Ch[1];
        if (yy < 33.5) return Cu[clamp(k + (yy < 26.5 ? 1 : 0), 1, 5)];
        return hsh(x, y, 2) < 0.25 ? (f === 'front' ? PAL.cream[2] : PAL.cream[1]) : Ba[k];
      },
    });
    c.dots([[10, 18], [11, 18], [15, 15], [12, 17]], Ch[5]);
    c.dots([[22, 14], [23, 14]], Ch[4]);
  },
  beaver_tail(c) {
    const P = ramp(0xc8823e), Sug = PAL.cinn;
    const tail = rell(26, 22, 19.5, 10.5, -0.62);
    c.pillow(tail, P, {
      rad: 4.5, dome: 2,
      tex: (x, y, t) => {
        const h = hsh(x, y, 21);
        if (h < 0.18) return Sug[clamp(t, 2, 4)];
        if (h > 0.93) return 0xfff8e8;
        return null;
      },
    });
    // paper sleeve
    c.pillow(and(inPoly([[3, 30], [15, 22], [23, 37], [12, 45]]), not(tail)), PAL.paper, { rad: 1.5 });
    c.poly([[5, 32], [16, 25], [23, 38], [12, 45]], PAL.paper, { rad: 1.5, edge: 0, tex: (x, y, t) => ((x + y) % 7 < 2 ? PAL.red[clamp(t, 2, 4)] : null) });
    // lemon wedge
    c.dots([[30, 12], [31, 12], [30, 13]], 0xfff8e8);
  },
  poutine(c) {
    const Bt = ramp(0xf2ece4, { ol: 0x7a3a2a }), Rd = PAL.red, Fr = ramp(0xf0c050), Cu = PAL.curd, G = PAL.gravy;
    c.poly([[7, 22], [41, 22], [43, 29], [5, 29]], Bt, { t: 1 });
    // fries poking up
    const fries = [[10, 27, 13, 12], [16, 27, 15, 9], [22, 27, 25, 8], [29, 27, 31, 10], [35, 27, 38, 13], [19, 27, 18, 11], [32, 27, 34, 15], [26, 27, 27, 13], [13, 27, 9, 16]];
    for (const [x0, y0, x1, y1] of fries) c.tube([[x0, y0], [x1, y1]], 1.8, Fr, { edge: 0, tex: (x, y, t, u) => (u > 0.92 ? Math.min(5, t + 1) : null) });
    // gravy & curds
    c.pillow((x, y) => ((x - 24) / 13) ** 2 + ((y - 23) / 6) ** 2 < 1 + 0.25 * Math.sin(x * 0.9), G, { rad: 1.5, edge: 1, spec: 0.88 });
    for (const [x, y] of [[16, 21], [24, 18], [31, 21], [21, 24], [29, 25]]) c.pillow(rrect(x - 2.5, y - 2, x + 2.5, y + 2, 1.5), Cu, { rad: 1.4, edge: 0 });
    c.pillow(rrect(9, 20.5, 13.5, 24, 1.2), Cu, { rad: 1.3, edge: 0 });
    c.tube([[20, 25], [20.5, 29]], 1, G, { edge: 1 });
    // paper boat front
    c.poly([[5, 28], [43, 28], [39, 42], [9, 42]], Bt, {
      rad: 2, tex: (x, y, t) => {
        if (y < 30) return Math.min(5, t + 1);
        return (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? Rd[clamp(t, 1, 4)] : null;
      },
    });
    c.dots([[22, 20], [23, 20], [26, 18]], G[5]);
  },
  tourtiere(c) {
    const Cr = PAL.crust, M = ramp(0x84402a), Po = ramp(0xe8c890);
    const top = (x) => 26 + (x - 7) * 0.143;
    c.face(inPoly([[42, 31], [7, 26], [7, 41], [42, 42]]), M, {
      t: 3, tex: (x, y) => {
        const yt = top(x + 0.5), yb = 41 + (x - 7) * 0.03;
        if (y < yt + 1) return Cr[4];
        if (y < yt + 2.6) return Cr[3];
        if (y > yb - 2) return Cr[y > yb - 1 ? 2 : 3];
        if (x > 39.5) return Cr[3];
        const h = hsh(x, y, 8);
        if (h < 0.22) return M[2];
        if (h > 0.9) return Po[3];
        if (h > 0.8) return M[4];
        return y < yt + 3.6 ? M[2] : null;
      },
    });
    c.face(inPoly([[42, 31], [7, 26], [6, 19], [10, 13], [17, 10], [25, 9]]), Cr, {
      t: 4, tex: (x, y) => {
        const v = hsh(x, y, 9);
        return v < 0.07 ? Cr[3] : v > 0.95 ? Cr[5] : null;
      },
    });
    for (const [x0, y0, x1, y1] of [[18, 16, 23, 15], [20, 21, 26, 20], [27, 25, 32, 24.5]]) { c.tube([[x0, y0], [x1, y1]], 0.6, Cr, { t: 1 }); c.tube([[x0, y0 + 1], [x1, y1 + 1]], 0.5, Cr, { t: 5 }); }
    c.tube([[25, 9.5], [17, 10.5], [10.5, 14], [6.5, 20], [7.5, 26.5]], 3, Cr, { edge: 1, tex: (x, y, t, u) => (Math.sin(u * 42) > 0.6 ? Math.max(1, t - 1) : null) });
    c.pillow(leafShape(29, 19, -0.4, 9, 2.8), Cr, { rad: 1.4, edge: 2 });
    c.dots([[12, 18], [13, 17], [10, 22]], Cr[5]);
  },
  maple_taffy(c) {
    const Sn = PAL.snow, T = PAL.maple;
    c.pillow(inEll(24, 39, 20, 6), Sn, { rad: 3, dome: 1, tex: (x, y, t) => (hsh(x, y, 1) < 0.08 ? 5 : null) });
    c.tube([[8, 39], [13, 37.5], [18, 40], [24, 38], [29, 40.5], [36, 38.5]], 1.4, T, { spec: 0.9 });
    c.tube([[22, 41], [27, 18]], 1.5, PAL.woodLight, { edge: 0 });
    for (const [x, y, rx, ry] of [[27.5, 21, 7.5, 4], [27, 16.5, 7, 3.6], [27.5, 12, 6, 3.4], [27.5, 8, 4.4, 3]]) c.ball(x, y, rx, ry, T, { edge: 1, spec: 0.85 });
    c.dots([[23, 15], [24, 15], [23, 11]], 0xfff4d0);
  },
  cinnamon_roll(c) {
    const cx = 24, cy = 21, D = ramp(0xdc9c52), Ci = ramp(0x8a4420), e = 0.5;
    plate(c, cx, 36, 21);
    c.lathe(cx, cy, cy + 8.5, (Y) => 16 - Math.max(0, Y - (cy + 6.5)) ** 2 * 0.5, D, {
      el: e, tex: (x, y, t, u, Y) => { const th = Math.asin(clamp(u, -1, 1)); return Math.abs(th - 0.55 + (Y - cy) * 0.02) < 0.08 ? Ci[1] : null; },
    });
    c.ell(cx, cy, 16, 16 * e, D, {
      t: 4, tex: (x, y, t, u, v) => {
        const r = Math.hypot(u, v), a = Math.atan2(v, u);
        const s = (r * 2.1 - a / (Math.PI * 2) + 10) % 1;
        if (s < 0.13) return Ci[1];
        if (s < 0.24) return Ci[3];
        if (s < 0.42) return D[5];
        if (s > 0.86) return D[3];
        return r > 0.9 ? D[3] : null;
      },
    });
    // glaze: a pool in the middle, a thin drizzle and two drips
    const I2 = ramp(0xfaf6f0, { ol: 0x8a5a48, d2: 0xd8c8c0, d1: 0xeee6e0 });
    c.pillow((x, y) => ((x - cx) / 5.6) ** 2 + ((y - cy) / 3) ** 2 < 1 + 0.3 * Math.sin(Math.atan2(y - cy, x - cx) * 4), I2, { rad: 1.6, edge: 1, spec: 0.9 });
    c.tube([[11, 22], [17, 18], [23, 26], [30, 16.5], [37, 23]], 0.75, I2, { edge: 1, spec: 0.9 });
    c.tube([[23, 26], [23.3, 31]], (t) => 0.9 + t * 0.5, I2, { edge: 1 });
    c.tube([[35, 24.5], [35.2, 28.5]], (t) => 0.8 + t * 0.5, I2, { edge: 1 });
  },
  oatmeal_cookies(c) {
    const Co = ramp(0xd29a52);
    const tex = (x, y, t) => {
      const h = hsh(x, y, 31);
      if (h < 0.2) return PAL.oat[clamp(t + 1, 3, 5)];
      if (h > 0.92) return Math.max(1, t - 1);
      return null;
    };
    for (let k = 0; k < 3; k++) {
      const y0 = 28 - k * 4;
      c.lathe(29, y0, y0 + 3, (Y) => 13 - (k % 2) * 0.5, Co, { tex: (x, y, t, u, Y) => (hsh(x, y, k) < 0.2 ? Math.max(1, t - 1) : null) });
      c.ell(29, y0, 13, 4.7, Co, { t: 3, tex });
    }
    const Rs = ramp(0x5a2438);
    for (const [x, y] of [[23, 19], [32, 18], [35, 22]]) c.pillow(rell(x, y, 1.8, 1.2, 0.3), Rs, { rad: 1, edge: 0 });
    // cookie leaning in front
    c.pillow((x, y) => { const a = Math.atan2(y - 31, x - 15); return Math.hypot(x - 15, y - 31) < 11 + Math.sin(a * 7) * 0.6; }, Co, { rad: 3, dome: 1.5, edge: 0, tex });
    for (const [x, y, a] of [[11, 28, 0.4], [18, 33, -0.5], [14, 37, 0.2], [19, 26, 1]]) c.pillow(rell(x, y, 1.9, 1.3, a), Rs, { rad: 1, edge: 0 });
    c.dots([[9, 25], [10, 24]], Co[5]);
  },
  pumpkin_muffin(c) {
    const cx = 24, Li = ramp(0xe0742c), M = ramp(0xd08a3c);
    c.lathe(cx, 25, 41, (Y) => 12 - (Y - 25) * 0.15, Li, { tex: (x, y, t, u) => (Math.sin(Math.asin(clamp(u, -1, 1)) * 9) > 0 ? Math.min(4, t + 1) : Math.max(1, t - 1)) });
    c.ball(cx, 22, 16, 11.5, M, {
      shape: (u, v) => v < 0.42,
      tex: (x, y, t, u, v) => {
        const h = hsh(x >> 1, y >> 1, 41);
        if (h < 0.18) return Math.min(5, t + 1);
        if (h > 0.86) return Math.max(1, t - 1);
        return v > 0.32 ? Math.max(1, t - 1) : null;
      },
    });
    for (const [x, y, a] of [[19, 15, -0.5], [27, 13, 0.4], [24, 19, 0], [31, 19, 0.9]]) c.pillow(rell(x, y, 2.8, 1.6, a), PAL.seed, { rad: 1, edge: 0 });
    c.dots([[14, 16], [15, 15]], M[5]);
  },
  soup(c) {
    const cx = 24, B = PAL.red, Sp = PAL.pumpkin;
    c.tube([[30, 18], [42, 7]], 1.4, PAL.silver, { edge: 0 });
    c.lathe(cx, 39, 41, () => 8, B, {});
    c.lathe(cx, 22, 39, (Y) => 17.5 - 8 * ((Y - 22) / 17) ** 2, B, { tex: (x, y, t, u, Y) => (Y > 24 && Y < 26 ? PAL.cream[clamp(t, 1, 4)] : null) });
    c.opening(cx, 22, 17.5, 1.8, 1.3, B, Sp, {
      ltex: (x, y, t, u, v) => {
        const r = Math.hypot(u * 1.1, v), a = Math.atan2(v, u);
        if (r < 0.6 && Math.abs(((r * 2.2 + a / (Math.PI * 2) + 5) % 1) - 0.5) < 0.12) return PAL.cream[4];
        if (hsh(x, y, 3) < 0.05) return PAL.leaf[3];
        return null;
      },
    });
    c.tube([[28.5, 21], [32, 17.5]], 1.4, PAL.silver, { edge: 0 });
    c.box(13, 21, 4, 3, 2, -1.5, PAL.toast, { rad: 0.8 });
    c.box(19, 24, 4, 3, 2, -1.5, PAL.toast, { rad: 0.8 });
  },
  egg_toast(c) {
    const T = PAL.toast, Cr = ramp(0xa8642a);
    const slice = (dy) => or(rrect(8, 22 + dy, 40, 40 + dy, 3), inEll(15, 21 + dy, 9, 8), inEll(33, 21 + dy, 9, 8), rrect(10, 16 + dy, 38, 26 + dy, 2));
    c.pillow(slice(3), Cr, { rad: 2, bias: -0.15 });
    c.pillow(slice(0), Cr, { rad: 2.5 });
    c.pillow((x, y) => slice(0)(x, y) && !slice(0)(x - 2, y) === false && !slice(0)(x + 2, y) === false && !slice(0)(x, y - 2) === false && !slice(0)(x, y + 2) === false, T, {
      rad: 2, tex: (x, y, t) => (hsh(x, y, 17) < 0.12 ? Math.max(1, t - 1) : hsh(x, y, 18) < 0.05 ? T[5] : null),
    });
    c.pillow((x, y) => { const a = Math.atan2(y - 27, x - 24); return Math.hypot((x - 24) / 13, (y - 27) / 9) < 1 + 0.12 * Math.sin(a * 4 + 1); }, PAL.eggW, { rad: 3, edge: 0 });
    c.ball(25, 26, 5.5, 4.6, PAL.yolk, { edge: 0, spec: 0.93 });
    c.dots([[17, 30], [30, 31], [20, 23], [32, 24]], PAL.charcoal[2]);
  },
  caramel_apple(c) {
    const A = PAL.appleG, Ca = PAL.caramel;
    c.pillow(inEll(24, 41, 13, 3.4), Ca, { rad: 1.5 });
    c.tube([[24, 22], [23, 3]], 1.6, PAL.woodLight, { edge: 0 });
    c.ball(24, 28, 15, 13.5, A, {
      shape: (u, v) => u * u + (v + 0.16 * Math.exp(-u * u * 10) * (v < 0 ? 1 : 0)) ** 2 <= 1,
      tex: (x, y, t, u, v) => {
        const line = 21 + 1.4 * Math.sin(x * 0.75) + (Math.abs(x - 24) > 10 ? -1 : 0);
        if (y >= line) {
          if (y > 30 && hsh(x, y, 6) < 0.13) return PAL.peanut[clamp(t, 2, 4)];
          return Ca[t];
        }
        return null;
      },
    });
    c.dots([[14, 23], [14, 24], [15, 22]], 0xfffbe0);
  },
  candy_apple(c) {
    const A = PAL.candyRed;
    c.pillow(inEll(24, 41, 12, 3.2), A, { rad: 1.5, spec: 0.8 });
    c.tube([[24, 22], [25, 3]], 1.6, PAL.woodLight, { edge: 0 });
    c.ball(24, 28, 15, 13.5, A, {
      spec: 0.9,
      shape: (u, v) => u * u + (v + 0.16 * Math.exp(-u * u * 10) * (v < 0 ? 1 : 0)) ** 2 <= 1,
      tex: (x, y, t, u, v) => {
        if (((u + 0.42) / 0.12) ** 2 + ((v + 0.38) / 0.22) ** 2 < 1) return 0xffffff;
        if (((u - 0.45) / 0.22) ** 2 + ((v - 0.5) / 0.14) ** 2 < 1) return A[4];
        return null;
      },
    });
    c.dots([[17, 33], [18, 34]], 0xffe0e0);
  },
  ghost_meringue(c) {
    const G = PAL.ghost, E = PAL.choc;
    c.ball(24, 37, 15, 6, G, { flat: 0.8 });
    c.ball(24.5, 30.5, 12.5, 5.6, G, { edge: 1, flat: 0.8 });
    c.ball(25, 24, 10, 5.2, G, { edge: 1, flat: 0.8 });
    c.ball(26, 18, 7.5, 4.4, G, { edge: 1, flat: 0.8 });
    c.ball(27.5, 13, 5, 3.6, G, { edge: 1 });
    c.tube([[28, 11], [31, 7], [35, 6]], (t) => 2.6 - t * 1.8, G, { edge: 1 });
    c.ball(20.5, 28.5, 1.6, 2.3, E, {});
    c.ball(28.5, 28.5, 1.6, 2.3, E, {});
    c.ball(24.5, 33.5, 1.6, 1.4, E, {});
    c.dots([[20, 27], [28, 27]], 0xffffff);
    c.dots([[17, 31], [18, 31], [31, 31], [32, 31]], PAL.pink[4]);
  },
  skull_cookie(c) {
    const Co = PAL.crust, I = PAL.white, E = ramp(0x3a2a4a);
    const sk = (k) => or(inEll(24, 20, 16 - k, 14 - k), rrect(13 + k, 26, 35 - k, 40 - k, 3));
    c.pillow(sk(0), Co, { rad: 2.5 });
    c.pillow(sk(2), I, {
      rad: 2, edge: 1,
      tex: (x, y, t) => {
        if (y > 35 && y < 39 && x > 15 && x < 33 && (x % 3 === 0)) return E[2];
        if (y === 35 && x > 15 && x < 33) return E[2];
        return null;
      },
    });
    c.pillow(inEll(17, 23, 4.6, 5), E, { rad: 2, edge: 0 });
    c.pillow(inEll(31, 23, 4.6, 5), E, { rad: 2, edge: 0 });
    c.pillow(inPoly([[24, 28], [21.5, 32], [26.5, 32]]), E, { rad: 1 });
    c.dots([[16, 21], [30, 21]], 0xffffff);
    // sugar-skull flowers
    for (const [x, y, R] of [[24, 12, PAL.pink], [15, 13, PAL.orange], [33, 13, PAL.mint]]) {
      c.dots([[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]], R[3]);
      c.px(x, y, PAL.yellow[4]);
    }
  },
  bat_brownie(c) {
    const B = PAL.brownie;
    const bat = (dy) => {
      const wingL = inPoly([[22, 20 + dy], [4, 14 + dy], [6, 22 + dy], [5, 30 + dy], [10, 27 + dy], [14, 32 + dy], [18, 28 + dy], [22, 33 + dy]]);
      const wingR = inPoly([[26, 20 + dy], [44, 14 + dy], [42, 22 + dy], [43, 30 + dy], [38, 27 + dy], [34, 32 + dy], [30, 28 + dy], [26, 33 + dy]]);
      const body = or(inEll(24, 27 + dy, 7, 9), inEll(24, 17 + dy, 6.5, 5.8), inPoly([[18, 15 + dy], [19, 7 + dy], [22, 13 + dy]]), inPoly([[30, 15 + dy], [29, 7 + dy], [26, 13 + dy]]));
      return or(wingL, wingR, body);
    };
    c.pillow(bat(3), B, { rad: 1.5, bias: -0.25 });
    c.pillow(bat(0), B, {
      rad: 2.5,
      tex: (x, y, t) => {
        const h = Math.sin(x * 1.3 + y * 0.4) + Math.sin(y * 1.7 - x * 0.5);
        if (Math.abs(h) < 0.12 && t >= 3) return 2;
        if (h > 1.5 && t >= 3) return 4;
        return null;
      },
    });
    for (const x of [21, 27]) { c.ball(x, 17, 2.4, 2.4, PAL.white, { edge: 0 }); c.px(x, 17, PAL.charcoal[1]); c.px(x, 18, PAL.charcoal[1]); }
    c.dots([[22, 22], [26, 22]], 0xffffff);
    c.dots([[12, 18], [13, 18], [35, 18]], B[5]);
  },
  candy_bucket(c) {
    const cx = 24, O = PAL.pumpkin, F = ramp(0x3a1e2a);
    c.tube([[9, 22], [10, 10], [17, 4], [24, 3], [31, 4], [38, 10], [39, 22]], 0.9, PAL.charcoal, {});
    // candy inside
    c.tube([[30, 16], [33, 5]], 0.9, PAL.white, {});
    c.ball(33.5, 5, 4, 4, PAL.pink, { edge: 0, tex: (x, y, t, u, v) => (Math.abs(((Math.hypot(u, v) * 2 + Math.atan2(v, u) / 6.28 + 3) % 1) - 0.5) < 0.18 ? PAL.white[3] : null) });
    const wrapped = (x, y, R) => {
      c.pillow(or(inPoly([[x - 6, y - 3], [x - 3, y], [x - 6, y + 3]]), inPoly([[x + 6, y - 3], [x + 3, y], [x + 6, y + 3]])), R, { rad: 1, edge: 0 });
      c.pillow(inEll(x, y, 3.6, 3), R, { rad: 1.8, edge: 0 });
    };
    wrapped(16, 16, PAL.purple);
    wrapped(25, 14, PAL.lime);
    c.lathe(cx, 20, 42, (Y) => 14 + 3 * Math.sin(Math.PI * clamp((Y - 20) / 22, 0, 1)) - Math.max(0, Y - 40) ** 2 * 1.2, O, {
      tex: (x, y, t, u, Y) => {
        const th = Math.asin(clamp(u, -1, 1));
        if (Math.abs(Math.sin(th * 3.2)) < 0.1) return Math.max(1, t - 1);
        const fx = x + 0.5 - cx;
        if (Y > 25 && Y < 31 && (inPoly([[-9, 30.5], [-3, 30.5], [-6, 25]])(fx, Y) || inPoly([[3, 30.5], [9, 30.5], [6, 25]])(fx, Y))) return F[Y < 27 ? 2 : 3];
        if (Y > 33 && Y < 38.5) {
          const top = 33.5 + fx * fx * 0.012, bot = 35 + 3.2 * Math.cos(fx * 0.16);
          if (Math.abs(fx) < 10 && Y > top && Y < bot && !(Math.abs(fx % 5) < 0.9 && Y < top + 1.6)) return F[3];
        }
      },
    });
    c.opening(cx, 20, 14, 1.4, 1, O, PAL.charcoal, { empty: true });
    // candy poking over the rim
    c.pillow(rrect(26, 15.5, 32, 21, 2), PAL.candyRed, { rad: 1.5, edge: 0 });
    c.pillow(rrect(15, 17, 21, 21.5, 2), PAL.yellow, { rad: 1.5, edge: 0 });
    c.ball(22.5, 19, 2.6, 2.2, PAL.mint, { edge: 0 });
    c.dots([[12, 24], [12, 25], [13, 23]], O[5]);
  },
};

function apple(c, A, fleck) {
  c.ball(24, 28, 17, 15, A, {
    spec: 0.96,
    shape: (u, v) => u * u + (v + 0.17 * Math.exp(-u * u * 10) * (v < 0 ? 1 : 0)) ** 2 <= 1 && !(v > 0.9 && Math.abs(u) < 0.12),
    tex: (x, y, t, u, v) => {
      if (hsh(x, y, 5) < 0.035 && t >= 2 && t <= 4) return fleck;
      if (Math.abs(Math.sin(u * 9 + v * 2)) < 0.12 && v < 0 && t >= 3) return Math.min(5, t + 1);
      return null;
    },
  });
  c.ball(24, 15.5, 5, 2, A, { t: 1 });
  c.tube([[24, 16], [24.5, 11], [26.5, 6.5]], 1.3, PAL.stem, { edge: 0 });
  c.pillow(leafShape(26, 10, -0.35, 13, 4.2), PAL.leaf, { rad: 1.8, edge: 0, tex: (x, y, t, u, v) => (Math.abs(v - 0.5 + (u - 0.5) * 0.25) < 0.06 && u > 0.1 ? 2 : null) });
}
function plate(c, cx, cy, r) {
  const P = PAL.porcelain;
  c.lathe(cx, cy, cy + 2.2, (Y) => r - (Y - cy) * 1.2, P, {});
  c.ell(cx, cy, r, r * EL, P, { t: 4, tex: (x, y, t, u, v) => { const q = u * u + v * v; return q < 0.55 ? 3 : q < 0.66 ? 2 : null; } });
}
function oatTex(x, y, t) {
  const h = hsh(x >> 1, (y + (x & 1)) >> 1, 13), k = hsh(x, y, 14);
  if (k < 0.15) return PAL.oat[2];
  if (h < 0.3) return PAL.oat[t === undefined ? 4 : clamp(t + 1, 2, 5)];
  if (h > 0.8) return PAL.oat[t === undefined ? 2 : clamp(t - 1, 1, 4)];
  return t === undefined ? PAL.oat[3] : null;
}

// ------------------------------------------------------------------ public API
export const FOOD_ICONS = Object.keys(DRAW);

const cache = new Map();
export function foodIcon(name) {
  if (cache.has(name)) return cache.get(name);
  const c = new Canvas();
  const fn = DRAW[name];
  if (fn) fn(c);
  const p = c.finish();
  cache.set(name, p);
  return p;
}
const urls = new Map();
export function foodIconURL(name) {
  if (urls.has(name)) return urls.get(name);
  const u = foodIcon(name).toDataURL();
  if (u) urls.set(name, u);
  return u;
}

const I = (label, price) => ({ label, kind: 'ingredient', price });
const Dh = (label, price) => ({ label, kind: 'dish', price });
const T = (label, price) => ({ label, kind: 'treat', price });
const Dr = (label, price) => ({ label, kind: 'drink', price });
export const FOOD_INFO = {
  cocoa_classic: Dr('Classic Hot Cocoa', 4),
  cocoa_maple: Dr('Maple Marshmallow Cocoa', 6),
  cocoa_mint: Dr('Peppermint Cocoa', 5),
  cocoa_pumpkin: Dr('Pumpkin Spice Cocoa', 6),
  cocoa_cinnamon: Dr('Cinnamon Fire Cocoa', 6),
  cocoa_mocha: Dr('Midnight Mocha', 6),
  cocoa_takeaway: Dr('Cocoa To Go', 5),
  milk_bottle: I('Milk Bottle', 3),
  milk_carton: I('Milk Carton', 2),
  cream: I('Cream', 3),
  butter: I('Butter', 4),
  eggs: I('Eggs', 4),
  flour: I('Flour', 3),
  sugar: I('Sugar', 2),
  cocoa_powder: I('Cocoa Powder', 6),
  dark_chocolate: I('Dark Chocolate', 5),
  marshmallows: I('Marshmallows', 3),
  cinnamon: I('Cinnamon Sticks', 4),
  nutmeg: I('Nutmeg', 5),
  mint: I('Fresh Mint', 2),
  maple_syrup: I('Maple Syrup', 8),
  honey: I('Honey', 6),
  coffee_beans: I('Coffee Beans', 7),
  vanilla: I('Vanilla Pods', 8),
  pumpkin: I('Pumpkin', 5),
  apple_red: I('Red Apple', 1),
  apple_green: I('Green Apple', 1),
  cranberries: I('Cranberries', 3),
  blueberries: I('Blueberries', 4),
  caramels: I('Caramels', 3),
  sea_salt: I('Sea Salt', 2),
  oats: I('Rolled Oats', 2),
  bread: I('Bread Loaf', 3),
  cheese: I('Cheese', 6),
  potatoes: I('Potatoes', 2),
  cheese_curds: I('Cheese Curds', 5),
  gravy: I('Gravy', 3),
  candy_corn: I('Candy Corn', 2),
  pancakes: Dh('Buttermilk Pancakes', 9),
  pumpkin_pie_slice: Dh('Pumpkin Pie Slice', 5),
  apple_pie: Dh('Apple Pie', 14),
  butter_tarts: T('Butter Tarts', 6),
  nanaimo_bar: T('Nanaimo Bar', 4),
  beaver_tail: T('Beaver Tail', 7),
  poutine: Dh('Poutine', 10),
  tourtiere: Dh('Tourtière', 9),
  maple_taffy: T('Maple Taffy', 3),
  cinnamon_roll: T('Cinnamon Roll', 4),
  oatmeal_cookies: T('Oatmeal Cookies', 4),
  pumpkin_muffin: T('Pumpkin Muffin', 4),
  soup: Dh('Pumpkin Soup', 7),
  egg_toast: Dh('Egg on Toast', 6),
  caramel_apple: T('Caramel Apple', 4),
  candy_apple: T('Candy Apple', 4),
  ghost_meringue: T('Ghost Meringue', 3),
  skull_cookie: T('Sugar Skull Cookie', 3),
  bat_brownie: T('Bat Brownie', 4),
  candy_bucket: T('Candy Bucket', 8),
};
export const FOOD_SIZE = S;
