// Pixel art for the UI kit, painted in code on a native pixel grid (no DOM, so it
// also runs in node for tools/kitsheet.mjs). Everything is lit from the top left:
// a shape is a mask, every pixel knows how far it is from the edge and which way
// the edge faces, and the palette bands are picked from that.
import { Pix } from '../art/pixel.js';

// ---------------------------------------------------------------- palette
export const C = {
  ink: 0x1e1418, ink2: 0x35211c, shadow: 0x120a0c,
  goldHi: 0xfff7c2, goldL: 0xffdc52, gold: 0xf0ae26, goldD: 0xb86e12, goldDD: 0x6e3a0e,
  leaHi: 0xc98a4c, leaL: 0xae6c36, lea: 0x91562a, leaD: 0x73401e, leaDD: 0x552d14, leaX: 0x3e1f0e,
  parHi: 0xfffbea, parL: 0xfaecc8, par: 0xf2dcaa, parD: 0xdcbc80, parDD: 0xb08a52, parX: 0x7e5a34,
  woodHi: 0x8e5a34, woodL: 0x6e4226, wood: 0x573320, woodD: 0x40241a, woodDD: 0x2c1812,
  creamHi: 0xffffff, cream: 0xfff6e2, creamD: 0xe8dcc6, creamDD: 0xc4b49c,
  redHi: 0xff9a7a, redL: 0xf2603e, red: 0xd23a24, redD: 0x962018, redDD: 0x5e1210,
  greenHi: 0xc8f08a, greenL: 0x8ed056, green: 0x58a63a, greenD: 0x2f6e2c, greenDD: 0x1b4220,
  blueHi: 0xc4ecff, blueL: 0x7cc4f2, blue: 0x3f86d0, blueD: 0x24508e, blueDD: 0x152c56,
  greyHi: 0xe6e2da, greyL: 0xb8b2a8, grey: 0x8c857c, greyD: 0x5e5852, greyDD: 0x3a3532,
  purpleL: 0xb88ae8, purple: 0x7c4ab8, purpleD: 0x4a2a78,
  orangeL: 0xffb04a, orange: 0xf07a1e, orangeD: 0xb04a10,
};

// a ramp for shading by "light" in -1..1 (5 tones: hi, light, mid, dark, darkest)
export const RAMP = {
  gold: [C.goldHi, C.goldL, C.gold, C.goldD, C.goldDD],
  leather: [C.leaHi, C.leaL, C.lea, C.leaD, C.leaDD],
  parchment: [C.parHi, C.parL, C.par, C.parD, C.parDD],
  wood: [C.woodHi, C.woodL, C.wood, C.woodD, C.woodDD],
  cream: [C.creamHi, C.cream, C.creamD, C.creamDD, C.greyD],
  red: [C.redHi, C.redL, C.red, C.redD, C.redDD],
  green: [C.greenHi, C.greenL, C.green, C.greenD, C.greenDD],
  blue: [C.blueHi, C.blueL, C.blue, C.blueD, C.blueDD],
  grey: [C.greyHi, C.greyL, C.grey, C.greyD, C.greyDD],
  silver: [0xffffff, 0xdfe4ea, 0xaab2bc, 0x6e7680, 0x3e444c],
};
export function tone(ramp, lit) {
  // lit: +1 faces the light, -1 faces away
  return ramp[lit > 0.62 ? 0 : lit > 0.18 ? 1 : lit > -0.3 ? 2 : lit > -0.72 ? 3 : 4];
}

const LX = -0.55, LY = -0.835; // light comes from the top left (y down)

// ---------------------------------------------------------------- distance field
const RMAX = 12;
const OFF = [];
for (let dy = -RMAX; dy <= RMAX; dy++) for (let dx = -RMAX; dx <= RMAX; dx++) {
  const d = Math.hypot(dx, dy);
  if (d > 0 && d <= RMAX + 0.01) OFF.push([dx, dy, d]);
}
OFF.sort((a, b) => a[2] - b[2]);
const OX = Int8Array.from(OFF, (o) => o[0]), OY = Int8Array.from(OFF, (o) => o[1]), OD = Float32Array.from(OFF, (o) => o[2]);

// For each pixel of a mask: distance to the nearest outside pixel and the
// light term of the outward normal there. Outside pixels get d = 0.
// maxR caps the search (interior pixels further in than that get d = maxR + 1).
export function field(w, h, inside, maxR = 8) {
  const P = RMAX + 1, W = w + P * 2, H = h + P * 2;
  const pad = new Uint8Array(W * H);
  const ins = new Uint8Array(w * h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (inside(x, y)) {
    ins[y * w + x] = 1;
    pad[(y + P) * W + x + P] = 1;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  let nOff = 0;
  while (nOff < OD.length && OD[nOff] <= maxR + 0.01) nOff++;
  const lin = new Int32Array(nOff);
  for (let k = 0; k < nOff; k++) lin[k] = OY[k] * W + OX[k];
  const D = new Float32Array(w * h), L = new Float32Array(w * h);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = y * w + x;
    if (!ins[i]) continue;
    const j = (y + P) * W + x + P;
    let d = maxR + 1, nx = 0, ny = 0, n = 0;
    for (let k = 0; k < nOff; k++) {
      const dd = OD[k];
      if (n && dd > d + 0.5) break;
      if (!pad[j + lin[k]]) {
        if (n === 0) d = dd;
        // average the directions of all equally-near outside pixels (smooth normals on curves)
        nx += OX[k] / dd; ny += OY[k] / dd; n++;
      }
    }
    D[i] = d;
    const l = Math.hypot(nx, ny) || 1;
    L[i] = n ? (nx / l) * LX + (ny / l) * LY : 0;
  }
  return { w, h, D, L, ins, at: (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : D[y * w + x]), lit: (x, y) => L[y * w + x] };
}
// band index of a distance: 0 = the outline row, 1 = next row in...
export const band = (d) => Math.round(d) - 1;

// ---------------------------------------------------------------- shapes
export function roundRect(x0, y0, w, h, r) {
  return (x, y) => {
    if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
    const cx = Math.min(Math.max(x + 0.5, x0 + r), x0 + w - r);
    const cy = Math.min(Math.max(y + 0.5, y0 + r), y0 + h - r);
    return Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r + 0.15;
  };
}
// a chunky pixel corner: rounded by cutting steps (looks better than a circle at small radii)
export function stepRect(x0, y0, w, h, steps = [2, 1]) {
  return (x, y) => {
    if (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h) return false;
    const ix = Math.min(x - x0, x0 + w - 1 - x), iy = Math.min(y - y0, y0 + h - 1 - y);
    return !(iy < steps.length && ix < steps[iy]);
  };
}
export const union = (...fs) => (x, y) => fs.some((f) => f(x, y));
export const minus = (a, b) => (x, y) => a(x, y) && !b(x, y);

// ---------------------------------------------------------------- textures (tile seamlessly at 16)
function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export const TEX = {
  leather: (x, y) => {
    const X = ((x % 16) + 16) % 16, Y = ((y % 16) + 16) % 16;
    const n = hash(X, Y, 3);
    if (n < 0.05) return C.leaD;
    if (n > 0.965) return C.leaL;
    // soft pebbled grain: little diagonal pairs
    if (hash(X >> 1, Y >> 1, 9) < 0.12 && (X + Y) % 2 === 0) return 0x87502a;
    return C.lea;
  },
  leatherDark: (x, y) => {
    const X = ((x % 16) + 16) % 16, Y = ((y % 16) + 16) % 16;
    const n = hash(X, Y, 5);
    if (n < 0.05) return C.leaDD;
    if (n > 0.965) return C.lea;
    return C.leaD;
  },
  parchment: (x, y) => {
    const X = ((x % 16) + 16) % 16, Y = ((y % 16) + 16) % 16;
    const n = hash(X, Y, 7);
    if (n < 0.04) return C.parD;
    if (n > 0.95) return C.parL;
    // a few horizontal fibres
    if (hash(X >> 2, Y, 11) < 0.07) return 0xeed49c;
    return C.par;
  },
  paperLight: (x, y) => {
    const X = ((x % 16) + 16) % 16, Y = ((y % 16) + 16) % 16;
    const n = hash(X, Y, 13);
    if (n < 0.035) return C.par;
    if (hash(X >> 2, Y, 17) < 0.06) return 0xf6e6c0;
    return C.parL;
  },
  wood: (x, y) => {
    const X = ((x % 16) + 16) % 16, Y = ((y % 16) + 16) % 16;
    // planks 8 rows tall with a dark seam, grain streaks along x
    if (Y % 8 === 7) return C.woodDD;
    if (Y % 8 === 0) return C.woodL;
    const g = hash(X >> 2, Y, 19 + ((Y >> 3) * 7));
    if (g < 0.16) return C.woodD;
    if (g > 0.93) return C.woodHi;
    return C.wood;
  },
  dark: (x, y) => {
    const X = ((x % 16) + 16) % 16, Y = ((y % 16) + 16) % 16;
    const n = hash(X, Y, 23);
    if (n < 0.04) return 0x24140e;
    if (n > 0.97) return 0x4a2c1e;
    return 0x34201a;
  },
  cream: () => C.cream,
  cork: (x, y) => {
    const X = ((x % 16) + 16) % 16, Y = ((y % 16) + 16) % 16;
    const n = hash(X, Y, 29);
    if (n < 0.16) return 0x9a6436;
    if (n < 0.3) return 0xc08a50;
    if (n > 0.93) return 0xd8a868;
    return 0xb27a44;
  },
};

// ---------------------------------------------------------------- wood
// 6-tone wood ramps: hi, light, mid, dark, darkest, deepest
export const WOOD = {
  oak: [0xf4c07a, 0xd8914e, 0xb87036, 0x8e4e24, 0x643418, 0x42210e],
  walnut: [0xb47a4a, 0x8e5632, 0x6e4024, 0x522e1a, 0x3a1e12, 0x26140c],
  dark: [0x7a5238, 0x5e3c28, 0x4a2e1e, 0x382216, 0x28180f, 0x1a0e09],
  grey: [0xc8bca4, 0xb0a48c, 0x968a74, 0x746a5a, 0x564e44, 0x3e3830],
};
export const BRASS = [0xfff0b0, 0xf2cc6a, 0xd8a038, 0xb87e26, 0x8e5a1a, 0x5e3410];
const pick6 = (r, t) => r[t < 0 ? 0 : t > 5 ? 5 : t];
// Wood grain: a tone offset (-1 lighter, 0, +1 darker) for a pixel `u` along the board
// (repeats every P, P a multiple of 4) on grain row `v`. Rows drift against each
// other so the streaks read as long fibres, not a grid.
export function grain(u, v, P = 32, seed = 0) {
  const o = Math.floor(hash(v, 7, seed) * P);
  const s = ((((u + o) % P) + P) % P) >> 2;
  const h = hash(s, v, seed + 1);
  return h < 0.2 ? 1 : h > 0.9 ? -1 : 0;
}
// a tileable wood-plank texture (period px across, py down; planks `ph` rows tall)
export function plankTex(ramp, px = 32, py = 16, ph = 8, seed = 31, base = 2) {
  return (x, y) => {
    const X = ((x % px) + px) % px, Y = ((y % py) + py) % py;
    const row = Y % ph, plank = Math.floor(Y / ph);
    if (row === ph - 1) return ramp[base + 2];
    if (row === 0) return ramp[base - 1];
    // a knot on every other plank, grain bending around it
    // one knot per tile, the grain rings around it
    const kx = (plank * 13 + 9) % px, kd = Math.hypot((X - kx) * 0.55, row + 0.5 - ph / 2);
    if (plank === 1 && ph >= 6 && kd < 3) return kd < 1 ? ramp[base + 2] : kd < 1.9 ? ramp[base + 1] : (X + row) % 2 ? ramp[base - 1] : ramp[base];
    return pick6(ramp, base + grain(X, Y + plank * 5, px, seed));
  };
}
// grain only, no plank seams (for small plates and buttons)
export function grainTex(ramp, px = 24, py = 8, seed = 47, base = 2) {
  return (x, y) => pick6(ramp, base + grain(((x % px) + px) % px, ((y % py) + py) % py, px, seed));
}
// a 2x2 nail head (+ its shadow) at x, y
export function nail(p, x, y, r = BRASS, shadow = 0x1e1418) {
  p.set(x, y, r[0]); p.set(x + 1, y, r[2]); p.set(x, y + 1, r[2]); p.set(x + 1, y + 1, r[4]);
  if (shadow != null) { p.set(x + 2, y + 1, shadow, 110); p.set(x + 1, y + 2, shadow, 110); }
}

// ---------------------------------------------------------------- painters
// paint a mask with a band recipe: bands = [fn(lit, x, y) => colour | null, ...], last band repeats
export function paintBands(p, f, bands, ox = 0, oy = 0) {
  for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) {
    const d = f.D[y * f.w + x];
    if (!d) continue;
    const b = Math.min(bands.length - 1, band(d));
    const c = bands[b](f.L[y * f.w + x], x, y, d);
    if (c != null) p.set(ox + x, oy + y, c);
  }
}

// draw a mask shaded as polished gold (or any ramp): ink outline, bevelled body, specular glints
export function paintMetal(p, w, h, inside, ramp = RAMP.gold, ox = 0, oy = 0, outline = C.ink) {
  const f = field(w, h, inside);
  paintBands(p, f, [
    () => outline,
    (l) => (l > 0.55 ? ramp[0] : tone(ramp, l * 0.9 + 0.15)),
    (l) => tone(ramp, l * 0.6),
    (l) => tone(ramp, l * 0.35 - 0.05),
    () => ramp[2],
  ], ox, oy);
  return f;
}

// outline any opaque pixels with ink (4-neighbour), optionally only inside a region
export function inkOutline(p, col = C.ink, x0 = 0, y0 = 0, w = p.w, h = p.h) {
  const src = new Uint8ClampedArray(p.data);
  const A = (x, y) => (x < x0 || y < y0 || x >= x0 + w || y >= y0 + h ? 0 : src[(y * p.w + x) * 4 + 3]);
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    if (A(x, y)) continue;
    if (A(x + 1, y) > 127 || A(x - 1, y) > 127 || A(x, y + 1) > 127 || A(x, y - 1) > 127) p.set(x, y, col);
  }
}

// ---------------------------------------------------------------- filigree
// Ornate engraved gold corner plates like the reference inventory slots.
// explicitly shaded corner art (k ink, H L M D X = gold ramp hi..darkest); mirrored for the other corners
const ORN_BIG = [
  'kkkkkkkkkkkkk...',
  'kHHHHHHHHHHLMk..',
  'kHLLLLLLLLLMMDk.',
  'kHLkkkkLLkkkMDk.',
  'kHLkHHLkLkMkDDk.',
  'kHLkLkkLkLkMDk..',
  'kHLkLkMDkLkDDk..',
  'kHLLkDDkLMkDk...',
  'kHLkkkkLMkDDk...',
  'kHLLLLMMkDDk....',
  'kHLkLMkkDDXk....',
  'kHLMkkDDDXk.....',
  'kLMMDDDXXk......',
  'kMDkkkkkk.......',
  'kDDk............',
  '.kk.............',
];
const ORN_SMALL = [
  'kkkkkkkkk..',
  'kHHHHHHLMk.',
  'kHLLLLLMDk.',
  'kHLkkkLMk..',
  'kHLkHkMDk..',
  'kHLLkMDk...',
  'kHLMMDk....',
  'kLMDDk.....',
  'kMDkk......',
  'kkk........',
  '...........',
];
function fromMap(rows, ramp, fx, fy) {
  const S = rows.length;
  const p = new Pix(S, S);
  const col = { k: C.ink, H: ramp[0], L: ramp[1], M: ramp[2], D: ramp[3], X: ramp[4] };
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (col[ch] != null) p.set(fx ? S - 1 - x : x, fy ? S - 1 - y : y, col[ch]); }));
  return p;
}
const ORN = new Map();
export function filigree(big = true, fx = false, fy = false, ramp = RAMP.gold) {
  const key = `${big}${fx}${fy}${ramp[0]}`;
  if (ORN.has(key)) return ORN.get(key);
  const q = fromMap(big ? ORN_BIG : ORN_SMALL, ramp, fx, fy);
  ORN.set(key, q);
  return q;
}
// stamp the bracket into all four corners of p, inset by o
export function corners(p, big = true, o = 0, ramp = RAMP.gold) {
  const a = filigree(big, false, false, ramp), S = a.w;
  p.blit(a, o, o);
  p.blit(filigree(big, true, false, ramp), p.w - S - o, o);
  p.blit(filigree(big, false, true, ramp), o, p.h - S - o);
  p.blit(filigree(big, true, true, ramp), p.w - S - o, p.h - S - o);
}

export function mixC(a, b, t) {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

// ---------------------------------------------------------------- 9-slice panels
// A carved wooden picture frame: ink outline, a moulded oak frame with grain
// that follows each side (mitred at the corners), a carved bead, brass corner
// plates and nails, an inner bevel and a tiling fill. 64x64, slice 16 (so the
// edges and the fill repeat every 32 px).
export const FILLS = {
  leather: { tex: TEX.leather, r: RAMP.leather },
  dark: { tex: plankTex(WOOD.dark, 32, 32, 8, 37), r: [0x5a3828, 0x462a1e, 0x34201a, 0x24140e, 0x170c09] },
  parchment: { tex: TEX.parchment, r: RAMP.parchment },
  paper: { tex: TEX.paperLight, r: RAMP.parchment },
  wood: { tex: plankTex(WOOD.walnut, 32, 32, 8, 41), r: [0x8e5632, 0x6e4024, 0x522e1a, 0x3a1e12, 0x26140c] },
  cork: { tex: TEX.cork, r: [0xd8a868, 0xc08a50, 0xb27a44, 0x8a5a30, 0x5e3a1e] },
  cream: { tex: TEX.cream, r: RAMP.cream },
};
// which side of an S x S frame a pixel belongs to (0 top, 1 left, 2 bottom, 3 right) and whether it sits on a mitre
function side(x, y, W, H) {
  const e = [y, x, H - 1 - y, W - 1 - x];
  let k = 0;
  for (let j = 1; j < 4; j++) if (e[j] < e[k]) k = j;
  return { k, mitre: Math.min(e[0], e[2]) === Math.min(e[1], e[3]) };
}
// brass corner plates: L-shaped, following the frame's own outline
function cornerPlates(p, W, H, outer, arm = 16, w = 7) {
  for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const m = (x, y) => {
      const cx = fx ? W - 1 - x : x, cy = fy ? H - 1 - y : y;
      return outer(x, y) && ((cx < arm && cy < w) || (cx < w && cy < arm)) && !(cx >= w && cy >= w);
    };
    paintMetal(p, W, H, m, RAMP.gold);
    const at = (cx, cy) => [fx ? W - 2 - cx : cx, fy ? H - 2 - cy : cy];
    for (const [cx, cy] of [[3, 3], [arm - 5, 3], [3, arm - 5]]) {
      const [x, y] = at(cx, cy);
      nail(p, x, y, [0xe0e6ee, 0xaab2bc, 0x6e7680, 0x6e7680, 0x2e3440], null);
    }
  }
}
export function panelArt(fill = 'leather', { ornate = true, rim = WOOD.oak } = {}) {
  const S = 64;
  const F = FILLS[fill] || FILLS.leather;
  const R = F.r;
  const p = new Pix(S, S);
  const outer = stepRect(0, 0, S, S, [3, 2, 1]);
  const f = field(S, S, outer, 12);
  // the moulding profile across the frame (tone when lit / in shade, grain?):
  // lip, broad face, carved groove, round bead, inner face, a shadowed step down
  const PROFILE = [null, [0, 3], [1, 2, 1], [1, 2, 1], [4, 4], [0, 2], [1, 2, 1], [2, 3, 1], [4, 1]];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, d = f.D[i];
    if (!d) continue;
    const b = band(d), l = f.L[i], lit = l > 0.1;
    let c;
    if (b === 0 || b === 9) c = C.ink;
    else if (b < 9) {
      const { k, mitre } = side(x, y, S, S);
      const u = k === 0 || k === 2 ? x : y;
      const P = PROFILE[b];
      let t = P[lit ? 0 : 1] + (P[2] ? grain(u, b + k * 9, 32, 61) : 0);
      if (mitre && b > 1 && b < 8) t++;
      // a knot every 32 px on the broad face, the grain rings round it
      const ku = ((u % 32) + 32) % 32, kc = k % 2 ? 21 : 10, kd = Math.hypot((ku - kc) * 0.5, b - 2.5);
      if (!mitre && b >= 2 && b <= 3 && kd < 1.2) t = 4 + (kd < 0.6 ? 1 : 0);
      else if (!mitre && b >= 1 && b <= 4 && kd < 2.2 && b !== 4) t = (lit ? 1 : 2) + ((ku + b) % 2);
      c = pick6(rim, t);
    } else if (b === 10) c = l > 0.15 ? R[4] : l < -0.45 ? R[1] : R[3];
    else if (b === 11) c = l > 0.15 ? R[3] : F.tex(x, y);
    else c = F.tex(x, y);
    p.set(x, y, c);
  }
  // brass nails holding the frame together, one per 32 px along each side
  for (const [x, y] of [[31, 2], [31, S - 5], [2, 31], [S - 5, 31]]) nail(p, x, y, BRASS, pick6(rim, 4));
  if (ornate) cornerPlates(p, S, S, outer);
  return p;
}

// a small frame for plates, toasts, prompts and labels: a wooden rim with brass
// nails. 40x24, slice 8 (edges repeat every 24 px across, 8 down).
export function plateArt(fill = 'leather', { rim = WOOD.oak, rivets = true } = {}) {
  const W = 40, H = 24;
  const F = fill === 'dark' ? { tex: grainTex(WOOD.dark, 24, 8, 43), r: FILLS.dark.r } : FILLS[fill] || FILLS.leather;
  const R = F.r;
  const p = new Pix(W, H);
  const f = field(W, H, stepRect(0, 0, W, H, [2, 1]));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = f.D[i];
    if (!d) continue;
    const b = band(d), l = f.L[i], lit = l > 0.1;
    let c;
    if (b === 0 || b === 3) c = C.ink;
    else if (b < 3) {
      const { k } = side(x, y, W, H);
      const u = k === 0 || k === 2 ? x : y;
      c = b === 1 ? pick6(rim, lit ? 0 : 3) : pick6(rim, (lit ? 1 : 2) + grain(u, k, k % 2 ? 8 : 24, 67));
    } else if (b === 4) c = l > 0.15 ? R[4] : l < -0.45 ? R[1] : F.tex(x, y);
    else c = F.tex(x, y);
    p.set(x, y, c);
  }
  if (rivets) for (const [x, y] of [[4, 4], [W - 6, 4], [4, H - 6], [W - 6, H - 6]]) nail(p, x, y, BRASS, null);
  return p;
}

// a deckled sheet of paper (notes, receipts, the Gazette): 32x32, slice 10; edges tile at 8px
export function paperArt(kind = 'note') {
  const S = 32;
  const p = new Pix(S, S);
  const jag = (t) => (hash(((t % 8) + 8) % 8, 3, kind === 'news' ? 41 : 43) < 0.3 ? 1 : 0);
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x >= S || y >= S - 1) return false;
    const ex = Math.min(x, S - 1 - x), ey = Math.min(y, S - 2 - y);
    if (ex < 2 && ey < 2) return ex + ey >= 2;
    if (ey === 0) return !jag(x);
    if (ex === 0) return !jag(y + 3);
    return true;
  };
  const f = field(S, S, inside);
  const news = kind === 'news';
  const base = news ? [0xfffdf4, 0xf6f0de, 0xece2c8, 0xd2c4a4, 0x9a8a70] : RAMP.parchment;
  paintBands(p, f, [
    () => (news ? 0x4a3e38 : C.parX),
    (l) => (l > 0.2 ? base[0] : l < -0.3 ? base[3] : base[1]),
    (l, x, y) => (news ? (hash(x & 15, y & 15, 47) < 0.04 ? base[2] : base[1]) : TEX.paperLight(x, y)),
  ]);
  // hard drop shadow on the last row
  for (let x = 2; x < S; x++) if (f.at(x - 1, S - 2)) p.set(x, S - 1, C.shadow, 110);
  return p;
}

// ---------------------------------------------------------------- buttons
// 40x30 9-slice (slice 11 top, 10 right, 12 bottom, 10 left): an oak plank face
// with grain, a walnut rim (brass when hot), brass nails and a 4px lip; pressed sinks 3px.
export const BTN_SLICE = [11, 10, 12, 10];
const FACES = {
  leather: WOOD.oak,
  red: [C.redHi, C.redL, C.red, C.redD, C.redDD, 0x3e0a08],
  green: [C.greenHi, C.greenL, C.green, C.greenD, C.greenDD, 0x0e2a12],
  gold: [...RAMP.gold, C.goldDD],
  cream: [...RAMP.cream, C.greyDD],
};
export function buttonArt(state = 'normal', face = 'leather') {
  const W = 40, H = 30;
  const p = new Pix(W, H);
  const pressed = state === 'pressed';
  const lip = pressed ? 1 : 4;
  const top = pressed ? 3 : 0;
  let Fr = FACES[face] || FACES.leather;
  let rim = WOOD.walnut;
  if (state === 'hover') {
    Fr = Fr.map((c, i) => (i < 3 ? mixC(c, 0xfff4d0, 0.22 - i * 0.04) : c));
    rim = BRASS;
  }
  if (state === 'disabled') { Fr = WOOD.grey; rim = [0xb0a48c, 0x968a74, 0x7c705e, 0x625848, 0x4a4238, 0x342e28]; }
  if (pressed) Fr = [Fr[1], Fr[2], Fr[3], Fr[3], Fr[4], Fr[5]];
  const faceM = stepRect(0, top, W, H - lip - top, [3, 1]);
  const all = stepRect(0, top, W, H - top, [3, 1]);
  const f = field(W, H, faceM);
  const fa = field(W, H, all);
  // the lip (the plank's edge): end grain going darker, ink outline
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = fa.D[y * W + x];
    if (!d || f.D[y * W + x]) continue;
    p.set(x, y, band(d) === 0 ? C.ink : y >= H - 2 ? rim[4] : x % 3 === 0 ? rim[4] : rim[3]);
  }
  // grain repeats with the 9-slice middle (20 px across, 7 down)
  const gx = (x) => (((x - 10) % 20) + 20) % 20, gy = (y) => (((y - 11) % 7) + 7) % 7;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = f.D[i];
    if (!d) continue;
    const b = band(d), l = f.L[i], lit = l > 0.1;
    let c;
    if (b === 0 || b === 3) c = C.ink;
    else if (b === 1) c = l > 0.45 ? rim[0] : l > -0.15 ? rim[1] : l > -0.6 ? rim[2] : rim[3];
    else if (b === 2) c = lit ? rim[3] : rim[2];
    else if (b === 4) c = l > 0.15 ? Fr[0] : l < -0.45 ? Fr[3] : Fr[1];
    else c = pick6(Fr, (y < 11 ? 1 : 2) + grain(gx(x), gy(y) + (y < 11 ? 0 : 9), 20, face === 'leather' ? 71 : 73));
    p.set(x, y, c);
  }
  // brass nails in the face corners
  if (state !== 'disabled') for (const [x, y] of [[5, top + 5], [W - 7, top + 5]]) nail(p, x, y, BRASS, Fr[4]);
  return p;
}

// ---------------------------------------------------------------- item slot (single image)
// The inventory slot from the reference: gold ring, leather well, corner brackets.
export function slotArt(state = 'filled', size = 46) {
  const S = size;
  const p = new Pix(S, S);
  const hot = state === 'selected';
  const rim = hot ? [C.goldHi, C.goldHi, C.goldL, C.gold, C.goldD] : state === 'locked' ? [0xd8c8a0, 0xb8a47a, 0x96825e, 0x6e5e44, 0x4a3e2e] : RAMP.gold;
  const dim = state === 'empty' || state === 'locked';
  const well = dim ? [0x6e3e1e, 0x5e341a, 0x4e2a14, 0x3e2010, 0x2e170a] : RAMP.leather;
  const f = field(S, S, stepRect(0, 0, S, S, [4, 2, 1, 1]));
  paintBands(p, f, [
    () => C.ink,
    (l) => (l > 0.5 ? rim[0] : l > -0.1 ? rim[1] : l > -0.6 ? rim[2] : rim[3]),
    (l) => (l > 0.3 ? rim[1] : l > -0.45 ? rim[2] : rim[3]),
    (l) => (l > 0.25 ? rim[3] : l > -0.4 ? rim[2] : rim[1]),
    () => C.ink,
    (l) => (l > 0.15 ? well[4] : l < -0.45 ? well[1] : well[3]),
    (l) => (l > 0.15 ? well[3] : well[2]),
    (l, x, y) => (dim ? (hash(x, y, 51) < 0.05 ? well[3] : well[2]) : TEX.leather(x, y)),
  ]);
  corners(p, S >= 40, 0, rim);
  if (hot) {
    for (const [x, y] of [[S - 7, 4], [5, S - 8]]) {
      for (let k = -2; k <= 2; k++) { p.set(x + k, y, 0xffffff); p.set(x, y + k, 0xffffff); }
    }
  }
  return p;
}

// ---------------------------------------------------------------- tabs (9-slice 24x20, slice 8 8 2 8; open bottom)
export function tabArt(on = false) {
  const W = 24, H = 20;
  const p = new Pix(W, H);
  const fillR = on ? RAMP.leather : [0x8a5a34, 0x6e4224, 0x5a341c, 0x46281a, 0x341c10];
  const rim = on ? WOOD.oak : WOOD.walnut;
  const shape = stepRect(0, 0, W, H + 8, [3, 2, 1]);
  const f = field(W, H + 8, shape);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = f.D[y * W + x];
    if (!d) continue;
    const l = f.L[y * W + x];
    const b = band(d);
    let c;
    if (b === 0) c = C.ink;
    else if (b === 1) c = l > 0.4 ? rim[0] : l > -0.3 ? rim[1] : rim[3];
    else if (b === 2) c = l > 0.3 ? rim[2] : rim[3];
    else if (b === 3) c = C.ink;
    else c = b === 4 && l > 0.2 ? fillR[4] : on ? TEX.leather(x, y) : TEX.leatherDark(x, y);
    p.set(x, y, c);
  }
  return p;
}

// ---------------------------------------------------------------- inset wells (lists, tracks): 24x24 slice 8
export function wellArt(fill = 'dark') {
  const S = 24;
  const p = new Pix(S, S);
  const F = fill === 'dark' ? { tex: TEX.dark, r: FILLS.dark.r } : FILLS[fill] || FILLS.leather;
  const R = F.r;
  const f = field(S, S, stepRect(0, 0, S, S, [2, 1]));
  paintBands(p, f, [
    (l) => (l < -0.3 ? R[1] : C.ink),
    () => C.ink,
    (l, x, y) => (l > 0.1 ? R[4] : l < -0.4 ? R[2] : F.tex(x, y)),
    (l, x, y) => (l > 0.1 ? R[3] : F.tex(x, y)),
    (l, x, y) => F.tex(x, y),
  ]);
  return p;
}

// a gold scroll thumb (vertical 9-slice 10x24, slice 6)
export function thumbArt() {
  const W = 10, H = 24;
  const p = new Pix(W, H);
  paintMetal(p, W, H, stepRect(0, 0, W, H, [2, 1]));
  for (const y of [9, 11, 13]) for (let x = 3; x < 7; x++) { p.set(x, y, C.goldD); p.set(x, y + 1, C.goldHi); }
  return p;
}

// ---------------------------------------------------------------- progress bar frame: 16x12 slice 5
export function barArt() {
  const W = 16, H = 12;
  const p = new Pix(W, H);
  const f = field(W, H, stepRect(0, 0, W, H, [1]));
  paintBands(p, f, [
    () => C.ink,
    (l) => (l > 0.4 ? C.goldHi : l > -0.3 ? C.goldL : C.goldD),
    () => C.ink,
    (l) => (l > 0.1 ? 0x120a08 : 0x2a1810),
    () => 0x2a1810,
  ]);
  return p;
}

// ---------------------------------------------------------------- ribbon title (9-slice 64x22, slice 6 18 7 18)
export const RIBBON_SLICE = [6, 18, 7, 18];
export function ribbonArt(ramp = RAMP.red) {
  const W = 64, H = 22;
  const p = new Pix(W, H);
  // tails: behind, darker, with a V notch
  const tail = (x, y) => {
    if (y < 5 || y > 20) return false;
    const e = Math.min(x, W - 1 - x);
    if (e > 10) return false;
    return !(Math.abs(y + 0.5 - 13) < 4.2 - e * 1.1);
  };
  const tf = field(W, H, tail);
  paintBands(p, tf, [() => C.ink, (l) => (l > 0.3 ? ramp[2] : ramp[3]), () => ramp[3]]);
  for (let k = 0; k < 4; k++) for (let j = 0; j <= k; j++) { p.set(10 + j, 15 + k, ramp[4]); p.set(W - 11 - j, 15 + k, ramp[4]); }
  // the main band
  const bandM = (x, y) => x >= 7 && x < W - 7 && y >= 1 && y < 17 && !((x === 7 || x === W - 8) && (y === 1 || y === 16));
  const f = field(W, H, bandM);
  paintBands(p, f, [
    () => C.ink,
    (l) => (l > 0.4 ? ramp[0] : l < -0.4 ? ramp[3] : ramp[1]),
    (l, x, y) => (y < 7 ? ramp[1] : ramp[2]),
  ]);
  for (let x = 10; x < W - 10; x++) if (x % 4 !== 3) { p.set(x, 3, C.goldL); p.set(x, 14, C.goldD); }
  return p;
}

// ---------------------------------------------------------------- key cap (9-slice 16x16, slice 5 5 7 5)
export function keyArt(hot = false) {
  const S = 16;
  const p = new Pix(S, S);
  const R = hot ? RAMP.gold : RAMP.cream;
  const f = field(S, S, stepRect(0, 0, S, S - 3, [2, 1]));
  const fa = field(S, S, stepRect(0, 0, S, S, [2, 1]));
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (fa.D[y * S + x] && !f.D[y * S + x]) p.set(x, y, band(fa.D[y * S + x]) === 0 ? C.ink : R[3]);
  paintBands(p, f, [() => C.ink, (l) => (l > 0.3 ? R[0] : l < -0.4 ? R[2] : R[1]), () => R[1]]);
  return p;
}

// ---------------------------------------------------------------- toggle (lever) 26x14
export function toggleArt(on) {
  const W = 26, H = 14;
  const p = new Pix(W, H);
  const T = on ? RAMP.green : RAMP.red;
  const f = field(W, H, stepRect(0, 1, W, H - 2, [3, 1]));
  paintBands(p, f, [() => C.ink, (l) => (l > 0.1 ? T[4] : T[2]), (l) => (l > 0.1 ? T[3] : T[2]), () => T[2]]);
  const lx = on ? 6 : W - 8;
  p.rect(lx, 5, 2, 3, on ? C.greenHi : C.redHi);
  p.set(lx, 5, 0xffffff);
  const kx = on ? W - 13 : 0;
  paintMetal(p, 13, H, stepRect(0, 0, 13, H, [3, 1]), RAMP.gold, kx, 0);
  for (const y of [5, 8]) for (let x = 4; x < 9; x++) { p.set(kx + x, y, C.goldD); p.set(kx + x, y + 1, C.goldHi); }
  return p;
}

// ---------------------------------------------------------------- slider knob 12x16
export function knobArt(hot = false) {
  const W = 12, H = 16;
  const p = new Pix(W, H);
  const r = hot ? [C.goldHi, C.goldHi, C.goldL, C.gold, C.goldD] : RAMP.gold;
  const shape = (x, y) => (y < 11 ? stepRect(0, 0, W, 11, [2, 1])(x, y) : Math.abs(x + 0.5 - W / 2) <= 6 - (y - 10) * 1.25);
  paintMetal(p, W, H, shape, r);
  for (let y = 3; y < 8; y++) { p.set(5, y, C.goldD); p.set(6, y, C.goldHi); }
  return p;
}

// ---------------------------------------------------------------- close button 18x18
export function closeArt(hot = false) {
  const S = 18;
  const p = new Pix(S, S);
  const f = field(S, S, (x, y) => Math.hypot(x + 0.5 - 9, y + 0.5 - 9) <= 8.7);
  const R = hot ? [C.redHi, C.redHi, C.redL, C.red, C.redD] : RAMP.red;
  paintBands(p, f, [
    () => C.ink,
    (l) => (l > 0.4 ? C.goldHi : l > -0.3 ? C.goldL : C.goldD),
    (l) => (l > 0.2 ? C.goldD : C.gold),
    () => C.ink,
    (l) => (l > 0.2 ? R[3] : l < -0.4 ? R[1] : R[2]),
    () => R[2],
  ]);
  for (let k = -3; k <= 3; k++) for (const [x, y] of [[9 + k, 9 + k], [9 + k, 8 - k]]) p.set(x - 1, y + 1, R[4]);
  for (let k = -3; k <= 3; k++) for (const [x, y] of [[9 + k, 9 + k], [9 + k, 8 - k]]) { p.set(x, y, C.cream); p.set(x - 1, y, C.cream); }
  return p;
}

// ---------------------------------------------------------------- tooltip (9-slice 16x16, slice 5) + tail 9x6
export function tipArt() {
  const S = 16;
  const p = new Pix(S, S);
  const f = field(S, S, stepRect(0, 0, S, S, [2, 1]));
  paintBands(p, f, [() => C.ink, (l) => (l > 0.3 ? 0x7a5640 : l < -0.4 ? 0x24140e : 0x4a2e20), () => 0x34201a]);
  return p;
}
export function tipTailArt() {
  const W = 9, H = 6;
  const p = new Pix(W, H);
  for (let y = 0; y < 5; y++) for (let x = 0; x < W; x++) {
    const dx = Math.abs(x - 4), w = 4 - y;
    if (dx <= w) p.set(x, y, dx === w || y === 4 ? C.ink : 0x34201a);
  }
  return p;
}

// ---------------------------------------------------------------- speech bubbles (9-slice 32x32, slice 10)
// Comic bubbles: cream fill, ink outline, a lit inner rim and a hard shadow.
// Edge patterns repeat every 4 or 6 px so the 12 px middle segments tile cleanly.
export const BUBBLE_SLICE = 10;
const BUB = {
  round: { fill: [0xffffff, 0xfffaf0, 0xf2e8d8, 0xd8ccb8], out: C.ink },
  shout: { fill: [0xffffff, 0xfff8dc, 0xf4e4b4, 0xd8c08a], out: C.ink },
  shaky: { fill: [0xffffff, 0xf8f6f2, 0xe4e0e8, 0xc4c0d0], out: 0x2a2440 },
  think: { fill: [0xffffff, 0xf8fafe, 0xe2e8f2, 0xc2cada], out: 0x2a3250 },
  whisper: { fill: [0xffffff, 0xf4f2ee, 0xe2ded8, 0xc8c2b8], out: 0x5a5260 },
  sel: { fill: [0xffffff, 0xfff0b8, 0xf6d878, 0xd8a840], out: C.ink },
  dark: { fill: [0x5a3e34, 0x3a2622, 0x2a1a18, 0x1e1210], out: C.ink },
};
export function bubbleArt(style = 'round') {
  const S = 32;
  const P = BUB[style] || BUB.round;
  const p = new Pix(S, S);
  const e = 3; // room for spikes and the shadow
  const per = (t, n) => ((t % n) + n) % n;
  const bot = S - 3; // last row of the silhouette's box (the 2 rows below are shadow)
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x >= S || y > bot) return false;
    const ex = Math.min(x - e, S - 1 - e - x), ey = Math.min(y - e, bot - e - y);
    if (style === 'shout') {
      // triangular spikes every 6px, 3px tall
      const tx = per(x, 6), ty = per(y, 6);
      const sx = 3 - Math.abs(tx - 3), sy = 3 - Math.abs(ty - 3);
      return ex >= -sy && ey >= -sx && ex + ey >= -1;
    }
    if (style === 'think') {
      // scalloped cloud edge: half-discs every 6px
      const bx = per(x, 6) + 0.5 - 3, by = per(y, 6) + 0.5 - 3;
      const hx = Math.sqrt(Math.max(0, 9 - bx * bx)), hy = Math.sqrt(Math.max(0, 9 - by * by));
      return ex >= 2 - hy && ey >= 2 - hx && ex + ey >= 0;
    }
    if (style === 'shaky') {
      const wy = per(x, 6) < 3 ? 0 : 1, wx = per(y, 6) < 3 ? 0 : 1;
      return ex >= wx - 1 && ey >= wy - 1 && ex + ey >= 1;
    }
    return ex >= -1 && ey >= -1 && ex + ey >= 1 && !(ex === -1 && ey < 2) && !(ey === -1 && ex < 2);
  };
  const f = field(S, S, inside, 4);
  // hard shadow one pixel right, two down
  for (let y = 2; y < S; y++) for (let x = 1; x < S; x++) if (!f.ins[y * S + x] && f.ins[(y - 2) * S + x - 1]) p.set(x, y, C.shadow, 96);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = f.D[y * S + x];
    if (!d) continue;
    const b = band(d), l = f.L[y * S + x];
    let c;
    if (b === 0) c = style === 'whisper' && per(x + y, 4) === 0 ? P.fill[2] : P.out;
    else if (b === 1) c = l > 0.3 ? P.fill[0] : l < -0.35 ? P.fill[2] : P.fill[1];
    else c = P.fill[1];
    p.set(x, y, c);
  }
  return p;
}
// a tail goes this many px above the bottom of the bubble frame (its top rows cover the outline)
export const BUBBLE_JOIN = 7;
// tails that point down at the speaker (16x14); the first 3 rows sit over the
// bubble's bottom edge and erase its outline so the two join up
export function bubbleTailArt(style = 'round') {
  const W = 16, H = 14;
  const P = BUB[style] || BUB.round;
  const p = new Pix(W, H);
  if (style === 'think') {
    for (const [cx, cy, r] of [[8, 6.5, 2.9], [5.5, 11.2, 1.9]]) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r) p.set(x, y, d > r - 1 ? P.out : x + y < cx + cy - 1.5 ? P.fill[0] : P.fill[1]);
        else if (Math.hypot(x - 0.5 - cx, y - 1.5 - cy) <= r && !p.alpha(x, y)) p.set(x, y, C.shadow, 96);
      }
    }
    return p;
  }
  const pts = style === 'shout'
    ? [[3, 0], [13, 0], [10, 4], [12, 4], [7, 9], [9, 9], [2, 14], [5, 8], [3, 8], [5, 4], [3, 4]]
    : style === 'shaky'
      ? [[3, 0], [12, 0], [10, 3], [10.5, 5], [8, 7], [8, 9], [5, 11], [1.5, 13.6], [3, 10], [3.5, 7], [3, 4]]
      : [[3, 0], [12.5, 0], [9.5, 4.5], [6, 8.5], [1.5, 13.6], [3, 8], [3.4, 4]];
  const inPolyF = (x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const inside = (x, y) => y >= 0 && x >= 0 && x < W && y < H && inPolyF(x + 0.5, y + 0.5);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!inside(x, y)) { if (inside(x - 1, y - 2) && y > 3) p.set(x, y, C.shadow, 96); continue; }
    const side = !inside(x - 1, y) || !inside(x + 1, y);
    const under = !inside(x, y + 1);
    let c = P.fill[1];
    if (y < 3) c = side ? P.out : P.fill[1];
    else if (side || under) c = style === 'whisper' && (x + y) % 3 === 0 ? P.fill[2] : P.out;
    else if (!inside(x - 1, y - 1) || !inside(x - 2, y)) c = P.fill[0];
    p.set(x, y, c);
  }
  return p;
}

// ---------------------------------------------------------------- book pages (9-slice 32x32, slice 10)
export function pageArt(side = 'l') {
  const S = 32;
  const p = new Pix(S, S);
  const f = field(S, S, stepRect(0, 0, S, S, [1]));
  paintBands(p, f, [() => C.parX, (l) => (l > 0.3 ? C.parHi : C.parL), (l, x, y) => TEX.paperLight(x, y)]);
  // deepen towards the spine (the gutter)
  for (let y = 1; y < S - 1; y++) for (let k = 0; k < 5; k++) {
    const x = side === 'l' ? S - 2 - k : 1 + k;
    p.set(x, y, [C.parDD, C.parD, C.par, 0xf4e2b4, 0xf6e8c4][k]);
  }
  // the edges of the page stack on the outer side
  for (let y = 2; y < S - 2; y++) p.set(side === 'l' ? 1 : S - 2, y, y % 2 ? C.parD : C.par);
  return p;
}

// ---------------------------------------------------------------- wood-burned sign (titles): 64x24, slice 6 18 8 18
// An oak plank nailed on with two brass nails, edges scorched dark like a
// pyrography sign; the middle repeats every 28 px.
export const SIGN_SLICE = [6, 18, 8, 18];
export function signArt(ramp = WOOD.oak) {
  const W = 64, H = 24;
  const p = new Pix(W, H);
  const body = stepRect(2, 1, W - 4, 20, [2, 1]);
  const f = field(W, H, body);
  // hard drop shadow under the plank
  for (let y = 2; y < H; y++) for (let x = 3; x < W - 1; x++) if (!body(x, y) && body(x - 1, y - 2)) p.set(x, y, C.shadow, 110);
  const u = (x) => (((x - 18) % 28) + 28) % 28;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = f.D[i];
    if (!d) continue;
    const b = band(d), l = f.L[i], lit = l > 0.1;
    let c;
    if (b === 0) c = C.ink;
    else if (b === 1) c = lit ? ramp[1] : ramp[4];
    else if (b === 2) c = ramp[3]; // the scorched rim
    else c = pick6(ramp, (b === 3 && lit ? 1 : 2) + grain(u(x), y, 28, 79));
    // end grain darkens towards the plank's ends
    if (b > 0 && (x < 6 || x > W - 7)) c = mixC(c, ramp[4], 0.35);
    p.set(x, y, c);
  }
  for (const x of [7, W - 9]) nail(p, x, 9, BRASS, ramp[5]);
  return p;
}

// ---------------------------------------------------------------- book straps: a 14x16 tile (repeats down) + a brass buckle 22x18
export function strapArt() {
  const W = 14, H = 16;
  const p = new Pix(W, H);
  const R = [0x8e5634, 0x6e3e22, 0x5a3018, 0x42220f, 0x2e1709];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = x === 0 || x === W - 1 ? C.ink : x === 1 ? R[0] : x === W - 2 ? R[3] : hash(x, y, 83) < 0.08 ? R[3] : R[1 + (x > W / 2 ? 1 : 0)];
    if ((x === 3 || x === W - 4) && y % 4 < 2) c = 0xe8d4a8; // saddle stitching
    if ((x === 3 || x === W - 4) && y % 4 === 2) c = R[3];
    p.set(x, y, c);
  }
  return p;
}
export function buckleArt() {
  const W = 22, H = 18;
  const p = new Pix(W, H);
  // the strap passing under
  for (let y = 0; y < H; y++) for (let x = 4; x < 18; x++) p.set(x, y, x === 4 || x === 17 ? C.ink : x === 5 ? 0x8e5634 : 0x6e3e22);
  const frame = minus(stepRect(0, 2, W, 14, [2, 1]), stepRect(4, 5, W - 8, 8, [1]));
  paintMetal(p, W, H, frame, RAMP.gold);
  // the prong
  for (let x = 6; x < 15; x++) { p.set(x, 8, C.goldHi); p.set(x, 9, C.goldD); p.set(x, 10, C.ink); }
  p.set(5, 8, C.ink); p.set(5, 9, C.ink);
  return p;
}

// ---------------------------------------------------------------- the spiral notebook
export const NB_INK = { pencil: 0x5e5a66, pencilL: 0x9a96a2, blue: 0x2e4c9e, red: 0xc8302a, redL: 0xe88070 };
// cream notebook paper, 32x32 tile with a few fibres
export function nbPaperArt() {
  const S = 32;
  const p = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = hash(x, y, 89);
    p.set(x, y, n < 0.03 ? 0xefe4c8 : n > 0.985 ? 0xffffff : hash(x >> 3, y, 97) < 0.05 ? 0xf6eed8 : 0xfbf5e4);
  }
  return p;
}
// metal coils: the binding down the gutter of an open notebook (24x10 tile, repeats
// down) or one coil over the top edge of a notepad (10x14 tile, repeats across)
export function spiralArt(kind = 'v') {
  const top = kind === 'top';
  const W = top ? 10 : 24, H = top ? 14 : 10;
  const p = new Pix(W, H);
  const hole = (cx, cy) => {
    for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) {
      const d = Math.hypot(x * 0.9, y);
      if (d < 1.9) p.set(cx + x, cy + y, y < 0 ? 0x2a1c16 : 0x4a382c);
      else if (d < 2.6 && y > 0) p.set(cx + x, cy + y, 0xd8ccb0);
    }
  };
  const silver = [0xffffff, 0xdfe4ea, 0xaab2bc, 0x6e7680, 0x3e444c];
  if (top) {
    hole(4, 10);
    paintMetal(p, W, H, roundRect(2, 0, 5, 12, 2.4), silver);
  } else {
    hole(4, 5);
    hole(19, 5);
    paintMetal(p, W, H, roundRect(3, 2, 18, 5, 2.4), silver);
  }
  return p;
}
// a yellow pencil lying on the page, 62x10 (tip on the left)
export function pencilArt() {
  const W = 62, H = 10;
  const p = new Pix(W, H);
  const Y = [0xfff4b0, 0xf8d048, 0xe8b030, 0xc88a1a, 0x9a6410];
  const rows = [0, 1, 1, 2, 3, 4];
  for (let x = 1; x < 58; x++) {
    for (let r = 0; r < 6; r++) {
      const y = 1 + r;
      const half = x < 10 ? (x - 1) * 0.36 + 0.3 : 3;
      if (Math.abs(y + 0.5 - 4) > half + 0.01) continue;
      let c;
      if (x < 4) c = r < 3 ? 0x6a6a78 : 0x3a3a44; // graphite
      else if (x < 10) c = r < 2 ? 0xf6d8a8 : r < 4 ? 0xe0b47a : 0xb88650; // shaved wood
      else if (x < 46) c = Y[rows[r]];
      else if (x < 52) c = (x - 46) % 2 ? (r < 2 ? 0xdfe4ea : r < 4 ? 0xaab2bc : 0x6e7680) : r < 3 ? 0x8a929e : 0x5e6674; // ferrule
      else c = r < 2 ? 0xffc8d0 : r < 4 ? 0xf08a98 : 0xc85a6a; // eraser
      p.set(x, y, c);
    }
  }
  // a printed stripe and the tip's glint
  for (let x = 14; x < 44; x += 2) p.set(x, 4, Y[3]);
  p.set(2, 3, 0xa8a8b4);
  inkOutline(p);
  for (let x = 2; x < W; x++) if (p.alpha(x - 1, H - 2) > 200 && !p.alpha(x, H - 1)) p.set(x, H - 1, C.shadow, 70);
  return p;
}
// a coffee-mug ring someone left on the page, 30x30
export function stainArt() {
  const S = 30;
  const p = new Pix(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x + 0.5 - 15, dy = y + 0.5 - 15, d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    const gap = hash(Math.floor((a + Math.PI) * 4), 1, 101) < 0.14;
    const r = 11.6 + Math.sin(a * 3) * 0.4;
    // raw writes: these pixels are see-through on purpose
    if (d > r - 3 && d <= r && !gap) p.put(x, y, d > r - 1 ? 0x7a3e18 : d > r - 2 ? 0x9a5a28 : 0xb07a46, d > r - 1 ? 200 : d > r - 2 ? 140 : 90);
    else if (d < r - 3) p.put(x, y, 0xb07a46, 34);
  }
  p.put(27, 9, 0x7a4422, 110); p.put(28, 10, 0x9a6232, 80); p.put(4, 25, 0x7a4422, 100);
  return p;
}
// a strip of masking tape, 22x9
export function tapeArt() {
  const W = 22, H = 9;
  const p = new Pix(W, H);
  for (let y = 0; y < H - 1; y++) for (let x = 0; x < W; x++) {
    const e = Math.min(x, W - 1 - x);
    if (e < (y % 3 === 1 ? 0 : 1)) continue;
    p.put(x, y, y === 0 ? 0xfff8dc : hash(x, y, 103) < 0.12 ? 0xe2d4a0 : 0xf0e4b4, 215);
  }
  for (let x = 1; x < W; x++) p.put(x, H - 1, C.shadow, 50);
  return p;
}
// pencil tick boxes (12x12): empty, pencil check (packed), red-ink tick (done)
export function nbBoxArt(state = 'box') {
  const S = 12;
  const p = new Pix(S, S);
  const g = NB_INK.pencil, gl = NB_INK.pencilL;
  // a hand-drawn square: a little wobbly, corners overshooting
  for (let x = 1; x < 10; x++) { p.set(x, 3, g); p.set(x, 11, x === 9 ? gl : g); }
  for (let y = 3; y < 12; y++) { p.set(1, y, y === 7 ? gl : g); p.set(10, y, g); }
  p.set(0, 3, gl); p.set(11, 11, gl); p.set(10, 2, gl);
  if (state === 'check') for (const [x, y] of [[3, 7], [4, 8], [5, 9], [6, 8], [7, 7], [8, 6], [9, 5]]) p.set(x, y, g);
  if (state === 'tick') {
    const R = NB_INK.red;
    for (const [x, y] of [[2, 6], [3, 7], [4, 8], [5, 9], [6, 8], [7, 7], [8, 6], [9, 5], [10, 4], [11, 3], [11, 2]]) { p.set(x, y, R); p.set(x, y + 1, R); }
    p.set(11, 1, NB_INK.redL);
  }
  return p;
}
// little pen doodles for the margins (24x16)
function pen(p, pts, c) {
  for (let i = 1; i < pts.length; i++) p.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], c);
}
function penRing(p, cx, cy, r, c, a0 = 0, a1 = Math.PI * 2) {
  const n = Math.ceil(r * 8);
  let last = null;
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    const q = [Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r)];
    if (last) p.line(last[0], last[1], q[0], q[1], c);
    last = q;
  }
}
export const DOODLES = ['bike', 'mug', 'leaf', 'heart', 'star', 'swirl'];
export function doodleArt(kind) {
  const b = NB_INK.blue, g = NB_INK.pencil;
  const p = new Pix(24, 16);
  switch (kind) {
    case 'bike':
      penRing(p, 5, 10, 4, b); penRing(p, 18, 10, 4, b);
      pen(p, [[5, 10], [9, 5], [16, 5], [18, 10]], b); pen(p, [[9, 5], [11, 10], [16, 5]], b);
      pen(p, [[8, 3], [11, 3]], b); pen(p, [[16, 5], [16, 2], [18, 2]], b);
      break;
    case 'mug':
      pen(p, [[6, 6], [6, 14], [14, 14], [14, 6], [6, 6]], g); penRing(p, 15, 10, 2.5, g, -Math.PI / 2, Math.PI / 2);
      pen(p, [[8, 4], [9, 3], [8, 2], [9, 1]], g); pen(p, [[11, 4], [12, 3], [11, 2], [12, 1]], g);
      break;
    case 'leaf':
      pen(p, [[12, 15], [12, 6]], b);
      pen(p, [[12, 2], [14, 5], [17, 4], [16, 7], [20, 8], [16, 10], [12, 9], [8, 10], [4, 8], [8, 7], [7, 4], [10, 5], [12, 2]], b);
      break;
    case 'heart':
      pen(p, [[11, 14], [6, 9], [5, 6], [6, 4], [8, 3], [10, 4], [11, 6], [12, 4], [14, 3], [16, 4], [17, 6], [16, 9], [11, 14]], NB_INK.red);
      break;
    case 'star':
      pen(p, [[11, 1], [13, 6], [19, 6], [14, 9], [16, 15], [11, 11], [6, 15], [8, 9], [3, 6], [9, 6], [11, 1]], g);
      break;
    default: // a curly pen swirl
      penRing(p, 12, 8, 6, b, 0, Math.PI * 1.5); penRing(p, 12, 8, 3.5, b, Math.PI * 1.5, Math.PI * 3); penRing(p, 12, 8, 1.4, b, 0, Math.PI * 1.6);
  }
  return p;
}
// the HUD clipboard: an oak 9-slice board (32x32, slice 10) and its steel clip (34x14)
export function clipboardArt() {
  const S = 32;
  const p = new Pix(S, S);
  const f = field(S, S, stepRect(0, 0, S, S, [3, 2, 1]));
  const R = WOOD.oak;
  const t = (v) => (((v - 10) % 12) + 12) % 12;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, d = f.D[i];
    if (!d) continue;
    const b = band(d), lit = f.L[i] > 0.1;
    const c = b === 0 ? C.ink : b === 1 ? R[lit ? 0 : 4] : b === 2 ? R[lit ? 1 : 3] : pick6(R, 2 + grain(t(x), t(y), 12, 107));
    p.set(x, y, c);
  }
  return p;
}
export function clipArt() {
  const W = 34, H = 14;
  const p = new Pix(W, H);
  const steel = [0xffffff, 0xdfe4ea, 0xaab2bc, 0x6e7680, 0x3e444c];
  // the lever (a rolled wire loop) behind, then the jaw plate
  paintMetal(p, W, H, minus(roundRect(9, 0, 16, 7, 3), roundRect(12, 2, 10, 3, 1)), steel);
  paintMetal(p, W, H, stepRect(2, 4, W - 4, 9, [3, 2, 1]), steel);
  for (let x = 6; x < W - 6; x++) { p.set(x, 7, steel[3]); p.set(x, 8, steel[1]); }
  for (const x of [5, W - 7]) nail(p, x, 9, [0xfff0b0, 0xdfe4ea, 0x6e7680, 0x6e7680, 0x2e3440], null);
  for (let x = 3; x < W - 2; x++) p.set(x, H - 1, C.shadow, 90);
  return p;
}
