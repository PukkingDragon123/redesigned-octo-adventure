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
const RMAX = 9;
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
// The big framed panel from the reference inventory: ink outline, a polished gold
// band, an ink groove, a shaded inner bevel and a tiling fill. 48x48, slice 16.
export const FILLS = {
  leather: { tex: TEX.leather, r: RAMP.leather },
  dark: { tex: TEX.dark, r: [0x5a3828, 0x462a1e, 0x34201a, 0x24140e, 0x170c09] },
  parchment: { tex: TEX.parchment, r: RAMP.parchment },
  paper: { tex: TEX.paperLight, r: RAMP.parchment },
  wood: { tex: TEX.wood, r: RAMP.wood },
  cork: { tex: TEX.cork, r: [0xd8a868, 0xc08a50, 0xb27a44, 0x8a5a30, 0x5e3a1e] },
  cream: { tex: TEX.cream, r: RAMP.cream },
};
export function panelArt(fill = 'leather', { ornate = true, rim = RAMP.gold } = {}) {
  const S = 48;
  const F = FILLS[fill] || FILLS.leather;
  const p = new Pix(S, S);
  const f = field(S, S, stepRect(0, 0, S, S, [3, 2, 1]));
  const R = F.r;
  paintBands(p, f, [
    () => C.ink,
    (l) => (l > 0.5 ? rim[0] : l > 0 ? rim[1] : l > -0.55 ? rim[2] : rim[3]),
    (l) => (l > 0.3 ? rim[1] : l > -0.45 ? rim[2] : rim[3]),
    (l) => (l > 0.25 ? rim[3] : l > -0.4 ? rim[2] : rim[1]),
    () => C.ink,
    (l) => (l > 0.15 ? R[4] : l < -0.45 ? R[1] : R[3]),
    (l, x, y) => (l > 0.15 ? R[3] : F.tex(x, y)),
    (l, x, y) => F.tex(x, y),
  ]);
  if (ornate) corners(p, true, 0, rim);
  return p;
}

// a small frame for plates, toasts, prompts and labels: 24x24, slice 8
export function plateArt(fill = 'leather', { rim = RAMP.gold, rivets = true } = {}) {
  const S = 24;
  const F = FILLS[fill] || FILLS.leather;
  const R = F.r;
  const p = new Pix(S, S);
  const f = field(S, S, stepRect(0, 0, S, S, [2, 1]));
  paintBands(p, f, [
    () => C.ink,
    (l) => (l > 0.5 ? rim[0] : l > -0.2 ? rim[1] : rim[3]),
    (l) => (l > 0.25 ? rim[3] : rim[2]),
    () => C.ink,
    (l, x, y) => (l > 0.15 ? R[4] : l < -0.45 ? R[1] : F.tex(x, y)),
    (l, x, y) => F.tex(x, y),
  ]);
  if (rivets) {
    for (const [x, y] of [[4, 4], [S - 6, 4], [4, S - 6], [S - 6, S - 6]]) {
      p.set(x, y, rim[0]); p.set(x + 1, y, rim[2]); p.set(x, y + 1, rim[2]); p.set(x + 1, y + 1, rim[4]);
    }
  }
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
// 40x30 9-slice (slice 10 top, 10 right, 12 bottom, 10 left): face + a 4px lip; pressed sinks 3px.
export const BTN_SLICE = [11, 10, 12, 10];
const FACES = {
  leather: [C.leaHi, C.leaL, C.lea, C.leaD, C.leaDD],
  red: RAMP.red,
  green: RAMP.green,
  gold: RAMP.gold,
  cream: RAMP.cream,
};
export function buttonArt(state = 'normal', face = 'leather') {
  const W = 40, H = 30;
  const p = new Pix(W, H);
  const pressed = state === 'pressed';
  const lip = pressed ? 1 : 4;
  const top = pressed ? 3 : 0;
  let Fr = FACES[face] || FACES.leather;
  let rim = RAMP.gold;
  if (state === 'hover') {
    Fr = [mixC(Fr[0], 0xffffff, 0.35), mixC(Fr[1], 0xfff0c0, 0.28), mixC(Fr[2], 0xffd890, 0.22), Fr[2], Fr[3]];
    rim = [C.goldHi, C.goldHi, C.goldL, C.gold, C.goldD];
  }
  if (state === 'disabled') { Fr = [0xb0a494, 0x968a7a, 0x7c7266, 0x625a52, 0x4a443e]; rim = [0xc8bca4, 0xb0a48c, 0x968a74, 0x746a5a, 0x564e44]; }
  if (pressed) Fr = [Fr[1], Fr[2], Fr[3], Fr[3], Fr[4]];
  const faceM = stepRect(0, top, W, H - lip - top, [3, 1]);
  const all = stepRect(0, top, W, H - top, [3, 1]);
  const f = field(W, H, faceM);
  const fa = field(W, H, all);
  // the lip (the button's side): rim colour going darker, ink outline
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = fa.D[y * W + x];
    if (!d || f.D[y * W + x]) continue;
    p.set(x, y, band(d) === 0 ? C.ink : y >= H - 2 ? rim[4] : rim[3]);
  }
  paintBands(p, f, [
    () => C.ink,
    (l) => (l > 0.45 ? rim[0] : l > -0.15 ? rim[1] : l > -0.6 ? rim[2] : rim[3]),
    (l) => (l > 0.2 ? rim[3] : rim[2]),
    () => C.ink,
    (l) => (l > 0.15 ? Fr[0] : l < -0.45 ? Fr[3] : Fr[1]),
    (l, x, y) => (y < 11 ? Fr[1] : Fr[2]),
  ]);
  if (state !== 'disabled') { p.set(5, top + 5, 0xffffff); p.set(6, top + 5, Fr[0]); p.set(5, top + 6, Fr[0]); }
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
  const rim = on ? RAMP.gold : [0xd8b46a, 0xc0964a, 0x9a7036, 0x6e4c22, 0x4a3016];
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
  const F = FILLS[fill] || FILLS.dark;
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
