// Voxel trees for the autumn forest: broadleaf crowns built from a few chunky,
// lumpy leaf blobs, conifers built from stacked bough tiers, bushes, fern clumps
// and a crooked dead graveyard tree.
//
// Every tree is planned once in metres from (species, seed) and then rasterised
// at the requested LOD, so both LODs share the same silhouette and colours:
//   lod 0: 0.25 m voxels (close range; leaf masses step on a 0.5 m lattice)
//   lod 1: 0.75 m voxels (beyond ~80 m)
//
//   buildTree(species, { seed, lod, height }) -> { vox, size, origin, jitter: 0, meta }
//   meta (metres, relative to the pivot): { height, trunkR, canopyY, canopyR, swayY0, variant }
//
// The pivot (origin) is the trunk base centre at ground level; roots/trunk extend
// a little below it (0.5 m at lod 0, 0.75 m at lod 1) so trees sit on slopes.
import { Vox, vhash } from '../vox.js';

// ---------------------------------------------------------------- seeded helpers
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function makeRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (lo, hi) => lo + (hi - lo) * next(),
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length) % arr.length],
    chance: (p) => next() < p,
  };
}
// smooth value noise in [0,1)
function vnoise(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => vhash(xi + a, yi + b, zi + c, seed);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(0, 0, 0), h(1, 0, 0), u), l(h(0, 1, 0), h(1, 1, 0), u), v),
    l(l(h(0, 0, 1), h(1, 0, 1), u), l(h(0, 1, 1), h(1, 1, 1), u), v),
    w,
  );
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- palettes
// leaf tones per variant, dark -> light (4 tones; `alt` swaps in for some blobs)
const LEAF = {
  mapleRed: [0x8a1c1c, 0xb42a20, 0xd84424, 0xf2742e],
  mapleOrange: [0xb4401a, 0xda641e, 0xf28e2a, 0xffbc48],
  mapleMix: [0xc04a1c, 0xe0721e, 0xf09a2c, 0xf6bc44],
  mapleCrimson: [0x781424, 0xa41e26, 0xcc3226, 0xec5a2c],
  sugarOrange: [0xbc541c, 0xdc7a20, 0xf0a030, 0xf6c04e],
  sugarGold: [0xc4781a, 0xe0962a, 0xeeb438, 0xf4cc54],
  scarletGold: [0xa82220, 0xd44422, 0xee7c2a, 0xf6b244],
  oakRusset: [0x7a3418, 0xa04c1e, 0xc46c28, 0xe2923c],
  oakBronze: [0x846020, 0xaa7a26, 0xcc9832, 0xeabc4a],
  oakOlive: [0x7a6a22, 0x9a8628, 0xb8a234, 0xd4bc4a],
  oakRed: [0x701c18, 0x96301c, 0xbc4822, 0xda6a2c],
  birch: [0xb08418, 0xd2a628, 0xe6bc38, 0xf2d050],
  birchGold: [0xbc7a1a, 0xdc9c26, 0xeeba36, 0xf6d258],
  birchLime: [0x98982a, 0xb8b432, 0xd4c840, 0xe8dc5a],
  aspen: [0xbc9418, 0xdcb22a, 0xecc83c, 0xf6dc58],
  aspenGold: [0xc8801c, 0xe6a02a, 0xf2c03c, 0xf8d860],
  spruce: [0x1e3a2a, 0x2c5236, 0x447648, 0x62965a],
  spruceBlue: [0x1c3a38, 0x2a5046, 0x40705e, 0x5e9078],
  spruceWarm: [0x283e22, 0x3a582c, 0x527c3a, 0x709a48],
  pine: [0x2c4220, 0x3e5a28, 0x567a32, 0x749a42],
  pineDeep: [0x243c24, 0x34522c, 0x4a7036, 0x669044],
  tamarack: [0xa45c16, 0xc8801e, 0xe4a430, 0xf2c454],
  tamarackOrange: [0xa8501a, 0xcc721e, 0xe6962c, 0xf2b84c],
  tamarackGreen: [0x7a7020, 0x9c8c28, 0xbca436, 0xd6be52],
  bushRed: [0x7e1618, 0xa82020, 0xd03626, 0xf05c36],
  bushScarlet: [0x921c1c, 0xbe2c22, 0xe24a28, 0xfc7a3a],
  bushPlum: [0x5e1424, 0x82202a, 0xa8302e, 0xcc4a34],
  bushOrange: [0xac461a, 0xd0661e, 0xee8e2e, 0xffb650],
  bushAmber: [0xb0601a, 0xd68422, 0xf2a834, 0xffcc5c],
  bracken: [0x84481a, 0xaa6824, 0xd08a34, 0xeeae4c],
  brackenGold: [0x907020, 0xb6922a, 0xd8b03c, 0xf2cc5c],
  fernGreen: [0x5e6a26, 0x7c882e, 0x9ca63c, 0xbcc256],
};
// bark: [main, dark fissure, light, accent]
const BARK = {
  maple: [0x7e6450, 0x664e40, 0x94785e, 0x4a3a30],
  oak: [0x6e5c4a, 0x58483a, 0x847058, 0x3e3228],
  birch: [0xece6d8, 0xdad4c6, 0xf6f0e2, 0x2c2622],
  aspen: [0xdee2cc, 0xccd0b6, 0xecefdc, 0x3c3a2e],
  spruce: [0x7a5038, 0x60402e, 0x8e5e42, 0x452a20],
  pine: [0x9a5e3a, 0x7e4a30, 0xae6e44, 0x5e3624],
  tamarack: [0x8a5a3e, 0x70462e, 0x9e6a48, 0x4a2e22],
  dead: [0x6a5e5a, 0x574c4a, 0x80726a, 0x2c2426],
  stem: [0x6a4830, 0x5a3a26, 0x7a5638, 0x4a2e1e],
};
const MOSS = 0x6a7432;
const TWIG = 0x4a3c36;
const HOLE = 0x1e1418;

// ---------------------------------------------------------------- voxel grid in metres
class Grid {
  constructor(s, R, H, lod) {
    this.s = s;
    this.lod = lod;
    this.bury = lod ? 1 : 2;
    const n = Math.ceil(R / s) + 1;
    this.n = n;
    this.vox = new Vox(2 * n + 1, Math.ceil(H / s) + this.bury + 2, 2 * n + 1);
  }
  get q() { return this.lod ? 1 : 2; } // leaf lattice in voxels
  X(i) { return (i - this.n) * this.s; }
  Y(j) { return (j - this.bury + 0.5) * this.s; }
  I(x) { return Math.round(x / this.s) + this.n; }
  J(y) { return Math.floor(y / this.s) + this.bury; }
  get origin() { return [this.n + 0.5, this.bury, this.n + 0.5]; }
  // Visit voxel centres inside a metric box; fn(x,y,z) returns a colour (0 = skip).
  // With q > 1 the shape is sampled on a q-voxel lattice so leaf masses step in
  // chunky blocks: stepped silhouettes, big flat colour patches, few faces.
  each(x0, y0, z0, x1, y1, z1, fn, q = 1, qv = q) {
    const v = this.vox, s = this.s;
    const i0 = Math.max(0, this.I(x0) - q), i1 = Math.min(v.w - 1, this.I(x1) + q);
    const j0 = Math.max(0, this.J(y0) - qv), j1 = Math.min(v.h - 1, this.J(y1) + qv);
    const k0 = Math.max(0, this.I(z0) - q), k1 = Math.min(v.d - 1, this.I(z1) + q);
    const Q = q * s;
    const qx = (x) => (q === 1 ? x : (Math.floor((x + 0.5 * s) / Q) + 0.5) * Q - 0.5 * s);
    const QV = qv * s;
    const qy = (y) => (qv === 1 ? y : (Math.floor(y / QV) + 0.5) * QV);
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = fn(qx(this.X(i)), qy(this.Y(j)), qx(this.X(k)));
      if (c) v.data[v.idx(i, j, k)] = c >>> 0;
    }
  }
  setAt(x, y, z, c, onlyEmpty = false) {
    const i = this.I(x), j = this.J(y), k = this.I(z);
    if (!this.vox.inb(i, j, k) || !c) return;
    if (onlyEmpty && this.vox.get(i, j, k)) return;
    this.vox.set(i, j, k, c);
  }
}

// ---------------------------------------------------------------- primitives
// tapered limb from a to b (radii r0 -> r1); col(x,y,z,t,ang) -> colour
function limb(g, a, b, r0, r1, col) {
  const s = g.s;
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L2 = dx * dx + dy * dy + dz * dz || 1e-6;
  const rm = Math.max(r0, r1) + s;
  g.each(Math.min(a[0], b[0]) - rm, Math.min(a[1], b[1]) - rm, Math.min(a[2], b[2]) - rm,
    Math.max(a[0], b[0]) + rm, Math.max(a[1], b[1]) + rm, Math.max(a[2], b[2]) + rm, (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      const t = clamp((px * dx + py * dy + pz * dz) / L2, 0, 1);
      const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t;
      const r = r0 + (r1 - r0) * t;
      if (qx * qx + qy * qy + qz * qz > r * r) return 0;
      return col(x, y, z, t, Math.atan2(qz, qx));
    });
  // thin limbs: walk the centreline so they stay connected
  if (Math.min(r0, r1) < s * 0.75) {
    const L = Math.sqrt(L2), n = Math.ceil(L / (s * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a[0] + dx * t, y = a[1] + dy * t, z = a[2] + dz * t;
      g.setAt(x, y, z, col(x, y, z, t, 0), true);
    }
  }
}
// polyline limb through points with radii
function bough(g, pts, radii, col) {
  for (let i = 0; i < pts.length - 1; i++) limb(g, pts[i], pts[i + 1], radii[i], radii[i + 1], col);
}

// lumpy ellipsoid on the leaf lattice; col(x,y,z) -> colour
// o: { lump, lseed, lfreq, flat (cut below cy - flat*ry), p (superellipse exponent) }
function blob(g, c, r, col, o = {}) {
  const [cx, cy, cz] = c, [rx, ry, rz] = r;
  const lump = g.lod ? 0 : o.lump ?? 0, lf = o.lfreq ?? 0.8, ls = o.lseed ?? 0;
  const p = g.lod ? o.p1 ?? 2.4 : o.p ?? 2;
  const flat = o.flat ?? 2;
  const q = o.q ?? g.q;
  const k = 1 + lump;
  g.each(cx - rx * k, cy - ry * k, cz - rz * k, cx + rx * k, cy + ry * k, cz + rz * k, (x, y, z) => {
    if (y < cy - flat * ry) return 0;
    const dx = Math.abs(x - cx) / rx, dy = Math.abs(y - cy) / ry, dz = Math.abs(z - cz) / rz;
    const e = p === 2 ? dx * dx + dy * dy + dz * dz : dx ** p + dy ** p + dz ** p;
    const thr = lump ? 1 + lump * (vnoise(x * lf, y * lf, z * lf, ls) * 2 - 1) : 1;
    if (e > thr * thr) return 0;
    return col(x, y, z);
  }, q);
  // make sure small blobs survive coarse voxels
  if (Math.min(rx, ry, rz) > g.s * 0.45) g.setAt(cx, cy, cz, col(cx, cy, cz), true);
}

// Flat stacked slabs (conifer tiers, pine pads). Vertical walls merge for free in the
// greedy mesher, so a stepped "wedding cake" profile is far cheaper than a smooth cone.
// rows: [[yFrom, yTo, radiusFraction, lobed], ...] relative to y0 (metres).
// The footprint is scalloped by `lobes` bumps of `lobeAmp` metres on lobed rows.
// col(x,y,z,u,row): u = radial 0..1 within the row.
function slabs(g, o, rows, col) {
  const { cx = 0, cz = 0, y0, R, lobes = 6, lobeAmp = 0, phase = 0, sx = 1, sz = 1, rot = 0 } = o;
  const fp = (g.lod ? o.fp1 : o.fp) ?? 2;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  rows.forEach((row, ri) => {
    const yb = y0 + row[0], yt = y0 + row[1], rr = R * row[2], la = row[3] ? lobeAmp : 0;
    const Rm = (rr + la) * Math.max(sx, sz) + g.s;
    g.each(cx - Rm, yb, cz - Rm, cx + Rm, yt, cz + Rm, (x, y, z) => {
      if (y < yb || y >= yt) return 0;
      const px = x - cx, pz = z - cz;
      const ax = Math.abs((px * cr + pz * sr) / sx), az = Math.abs((pz * cr - px * sr) / sz);
      const d = fp === 2 ? Math.sqrt(ax * ax + az * az) : Math.pow(ax ** fp + az ** fp, 1 / fp);
      const Rt = rr + la * Math.cos(lobes * Math.atan2(az, ax) + phase);
      if (d > Rt) return 0;
      return col(x, y, z, d / Rt, ri);
    }, g.q, 1);
  });
}

// ---------------------------------------------------------------- colour helpers
// Deliberate leaf patches: a per-blob base tone, a lighter cap and darker belly,
// nudged by one very low-frequency noise field. Rounded => big flat patches.
// farCap: false => at lod 1 the blob is one tone (half a step lighter) instead of cap + body
function leafTone(T, b, seed, lod, { cap = 0.3, belly = -9, patch = 1.0, freq = 0.42, farCap = true } = {}) {
  if (lod && !farCap) { const c = T[clamp(Math.round(b.base + 0.5), 0, T.length - 1)]; return () => c; }
  return (x, y, z) => {
    let k = b.base;
    const ny = (y - b.c[1]) / b.ry;
    if (ny > cap) k += 1;
    else if (ny < belly) k -= 1;
    if (!lod) k += (vnoise(x * freq + 7.1, y * freq, z * freq, seed) - 0.5) * patch;
    return T[clamp(Math.round(k), 0, T.length - 1)];
  };
}
// vertical bark stripes (merge well vertically), shifting every ~1.6 m
function barkCol(B, seed, lod) {
  return (x, y, z, t, ang) => {
    if (lod) return B[0];
    const band = Math.floor(y / 1.6);
    const st = Math.floor((ang / (Math.PI * 2) + 0.5) * 7 + band * 3);
    const h = vhash(st, band, 3, seed);
    return h < 0.55 ? B[0] : h < 0.82 ? B[1] : B[2];
  };
}
// birch / aspen: pale bark with dark horizontal lenticels and a dark rough base
function birchCol(B, marks, seed, lod) {
  return (x, y, z, t, ang) => {
    if (y < 0.3) return B[3];
    for (const m of marks) {
      if (y >= m.y && y < m.y + m.h) {
        if (lod) { if (m.big) return B[3]; continue; }
        const da = Math.abs(((ang - m.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (da < m.span) return B[3];
      }
    }
    if (lod) return B[0];
    const st = Math.floor((ang / (Math.PI * 2) + 0.5) * 5);
    return vhash(st, Math.floor(y / 2.2), 5, seed) < 0.72 ? B[0] : B[1];
  };
}

// ---------------------------------------------------------------- species definitions
const SPECS = {
  maple: { h: [7, 11], kind: 'broad', bark: 'maple', trunkK: 0.022, fork: 0.46, crownY: 0.7, crown: [0.34, 0.3], ring: [3, 4], variants: [
    { leaf: 'mapleRed', alt: 'mapleCrimson', altN: 1 },
    { leaf: 'mapleOrange', alt: 'mapleRed', altN: 1 },
    { leaf: 'mapleMix', alt: 'mapleOrange', altN: 2 },
  ] },
  maple2: { h: [6.5, 10], kind: 'broad', bark: 'maple', trunkK: 0.022, fork: 0.42, crownY: 0.68, crown: [0.38, 0.28], ring: [3, 4], variants: [
    { leaf: 'sugarOrange', alt: 'sugarGold', altN: 1 },
    { leaf: 'sugarGold', alt: 'sugarOrange', altN: 2 },
    { leaf: 'scarletGold', alt: 'mapleCrimson', altN: 1 },
  ] },
  oak: { h: [7, 10], kind: 'broad', bark: 'oak', trunkK: 0.03, fork: 0.36, crownY: 0.66, crown: [0.44, 0.27], ring: [4, 4], oak: true, variants: [
    { leaf: 'oakRusset', alt: 'oakBronze', altN: 1 },
    { leaf: 'oakBronze', alt: 'oakOlive', altN: 2 },
    { leaf: 'oakRed', alt: 'oakRusset', altN: 1 },
  ] },
  birch: { h: [8, 12], kind: 'slim', bark: 'birch', trunkK: 0.016, crownY: 0.7, crown: [0.2, 0.26], variants: [
    { leaf: 'birch', stems: 1 },
    { leaf: 'birch', alt: 'birchLime', altN: 2, stems: 2 },
    { leaf: 'birchGold', alt: 'birch', altN: 2, stems: 1 },
  ] },
  aspen: { h: [8, 12], kind: 'slim', bark: 'aspen', trunkK: 0.014, crownY: 0.72, crown: [0.17, 0.25], variants: [
    { leaf: 'aspen', stems: 1 },
    { leaf: 'aspenGold', alt: 'aspen', altN: 2, stems: 1 },
    { leaf: 'aspen', alt: 'birchLime', altN: 1, stems: 2 },
  ] },
  spruce: { h: [10, 16], kind: 'conifer', bark: 'spruce', trunkK: 0.018, variants: [
    { leaf: 'spruce', base: 0.6, tiers: 6, R0: 0.2, lobes: 6 },
    { leaf: 'spruceBlue', base: 0.8, tiers: 5, R0: 0.18, lobes: 5 },
    { leaf: 'spruceWarm', base: 0.5, tiers: 5, R0: 0.21, lobes: 6 },
  ] },
  pine: { h: [10, 16], kind: 'pine', bark: 'pine', trunkK: 0.02, variants: [
    { leaf: 'pine', levels: 4 }, { leaf: 'pineDeep', levels: 4 }, { leaf: 'pine', levels: 3 },
  ] },
  tamarack: { h: [9, 13], kind: 'conifer', bark: 'tamarack', trunkK: 0.016, variants: [
    { leaf: 'tamarack', base: 1.5, tiers: 5, R0: 0.19, lobes: 6, airy: true },
    { leaf: 'tamarackOrange', base: 1.8, tiers: 5, R0: 0.18, lobes: 5, airy: true },
    { leaf: 'tamarack', alt: 'tamarackGreen', base: 1.4, tiers: 5, R0: 0.2, lobes: 6, airy: true },
  ] },
  dead: { h: [5.5, 8], kind: 'dead', far: false, bark: 'dead', trunkK: 0.04, variants: [{}, {}, {}] },
  bushRed: { h: [1, 1.8], kind: 'bush', far: false, variants: [
    { leaf: 'bushRed', alt: 'bushScarlet' }, { leaf: 'bushScarlet', alt: 'bushOrange' }, { leaf: 'bushPlum', alt: 'bushRed' },
  ] },
  bushOrange: { h: [1, 1.8], kind: 'bush', far: false, variants: [
    { leaf: 'bushOrange', alt: 'bushAmber' }, { leaf: 'bushAmber', alt: 'bushOrange' }, { leaf: 'bushOrange', alt: 'bushRed' },
  ] },
  fern: { h: [0.5, 0.8], kind: 'fern', far: false, variants: [
    { leaf: 'bracken' }, { leaf: 'brackenGold' }, { leaf: 'bracken', alt: 'fernGreen' },
  ] },
};
export const TREE_SPECIES = Object.keys(SPECS);
export const TREE_VARIANTS = 3;

// ---------------------------------------------------------------- planners
// A plan is { R, H, draw(g), meta }. Planners consume the rng; draw() never does,
// so both LODs of the same seed are the same tree.

// trunk base flare plus a few stubby, axis-aligned surface roots (cheap to mesh)
function rootFlare(g, r, col, n = 4, seed = 0) {
  limb(g, [0, -0.6, 0], [0, 0.5, 0], r * 1.4, r, col);
  if (g.lod) return;
  const s = g.s;
  const skip = Math.floor(vhash(n, 2, 3, seed) * 4);
  for (let k = 0; k < 4; k++) {
    if (n < 4 && k === skip) continue;
    const a = (k / 4) * Math.PI * 2;
    const dx = Math.round(Math.cos(a)), dz = Math.round(Math.sin(a));
    const L = r * 1.4 + s * (1 + Math.floor(vhash(k, n, 1, seed) * 2.5));
    for (let t = r * 0.8; t <= L; t += s) {
      const hgt = 0.35 * (1 - (t - r * 0.8) / (L - r * 0.8 + s)) + s * 0.5;
      for (let y = 0; y < hgt; y += s) g.setAt(dx * t, y + s * 0.5, dz * t, col(dx * t, y, dz * t, 0, Math.atan2(dz, dx)));
    }
  }
}

function planBroad(spec, v, rng, H) {
  const crownY = H * spec.crownY;
  const crx = H * spec.crown[0] * rng.range(0.92, 1.08), cry = H * spec.crown[1] * rng.range(0.92, 1.08);
  const cr = Math.min(crx, cry);
  const trunkR = 0.16 + H * spec.trunkK;
  const forkY = H * spec.fork * rng.range(0.92, 1.08);
  const T = LEAF[v.leaf], A = v.alt ? LEAF[v.alt] : T;
  const blobs = [];
  // big top blob
  blobs.push({ c: [rng.range(-0.25, 0.25), crownY + cry * 0.32, rng.range(-0.25, 0.25)], r: cr * rng.range(0.66, 0.74), base: 1.6 });
  // ring blobs around the middle
  const nr = rng.int(spec.ring[0], spec.ring[1]);
  const a0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < nr; i++) {
    const a = a0 + (i / nr) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = crx * rng.range(0.56, 0.68);
    blobs.push({ c: [Math.cos(a) * d, crownY + cry * rng.range(-0.18, 0.12), Math.sin(a) * d], r: cr * rng.range(0.5, 0.58), base: rng.range(1.0, 1.6), a });
  }
  // one or two low blobs between ring blobs
  const nl = rng.int(1, 2);
  for (let i = 0; i < nl; i++) {
    const a = a0 + ((i * 2 + 1) / (nl * 2)) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const d = crx * rng.range(0.38, 0.5);
    blobs.push({ c: [Math.cos(a) * d, crownY - cry * rng.range(0.42, 0.52), Math.sin(a) * d], r: cr * rng.range(0.42, 0.5), base: rng.range(0.8, 1.2), a, low: true });
  }
  const squash = spec.oak ? 0.72 : 0.84;
  for (const b of blobs) {
    b.ry = b.r * squash;
    b.T = T;
  }
  // a few blobs in the alternate colour
  for (let i = 0; i < (v.altN || 0); i++) blobs[1 + ((rng.int(0, 99) + i * 2) % (blobs.length - 1))].T = A;
  // limbs from the fork into each ring blob
  const limbs = blobs.slice(1).map((b) => {
    const s = [rng.range(-0.1, 0.1), forkY + rng.range(-0.2, 0.5), rng.range(-0.1, 0.1)];
    const m = [b.c[0] * 0.45, (s[1] + b.c[1]) * 0.5 + rng.range(-0.2, 0.3), b.c[2] * 0.45];
    const e = [b.c[0] * 0.85, b.c[1] - b.ry * 0.2, b.c[2] * 0.85];
    return { pts: [s, m, e], r: trunkR * rng.range(0.42, 0.52) };
  });
  // an oak's low, long horizontal limb, or a maple's little side shoot with a leaf tuft
  const side = [];
  if (spec.oak || rng.chance(0.7)) {
    const a = a0 + rng.range(2.2, 4.0), y = forkY * rng.range(0.75, 0.9), L = crx * rng.range(0.72, 0.88);
    const ye = crownY - cry * 0.48;
    side.push({ pts: [[0, y, 0], [Math.cos(a) * L * 0.55, y + (ye - y) * 0.35, Math.sin(a) * L * 0.55], [Math.cos(a) * L, ye, Math.sin(a) * L]], r: trunkR * 0.38, tuft: cr * 0.42, T: blobs[1].T, base: 1.3 });
  }
  const lseed = rng.int(0, 1e6), cseed = rng.int(0, 1e6), bseed = rng.int(0, 1e6);
  rng.next();
  return {
    R: crx * 1.4 + 1.5, H: crownY + cry * 1.5 + 1,
    draw(g) {
      const bark = barkCol(BARK[spec.bark], bseed, g.lod);
      rootFlare(g, trunkR, bark, 4, bseed);
      limb(g, [0, 0, 0], [0, forkY + 0.5, 0], trunkR, trunkR * 0.82, bark);
      limb(g, [0, forkY, 0], [blobs[0].c[0] * 0.5, crownY, blobs[0].c[2] * 0.5], trunkR * 0.7, trunkR * 0.45, bark);
      if (!g.lod) {
        for (const l of limbs) bough(g, l.pts, [l.r, l.r * 0.8, l.r * 0.55], bark);
        for (const sb of side) bough(g, sb.pts, [sb.r, sb.r * 0.8, sb.r * 0.6], bark);
      }
      blobs.forEach((b, i) => (g.lod && b.low) || blob(g, b.c, [b.r, b.ry, b.r], leafTone(b.T, b, cseed, g.lod, { farCap: i === 0 }), { lump: 0.08, lseed: lseed + i, flat: 0.62, p: spec.oak ? 3.8 : 2.8, p1: 6 }));
      if (!g.lod) for (const sb of side) {
        const e = sb.pts[2];
        const b = { c: e, ry: sb.tuft * 0.8, base: sb.base };
        blob(g, e, [sb.tuft * 1.15, sb.tuft * 0.8, sb.tuft * 1.15], leafTone(sb.T, b, cseed, g.lod), { lump: 0.1, lseed: lseed + 40, flat: 0.6 });
      }
    },
    meta: { height: crownY + cry * 0.32 + cr * 0.7 * squash, trunkR, canopyY: crownY, canopyR: crx * 1.15, swayY0: forkY },
  };
}

function planSlim(spec, v, rng, H) {
  const crownY = H * spec.crownY;
  const crx = H * spec.crown[0] * rng.range(0.9, 1.1), cry = H * spec.crown[1];
  const trunkR = 0.1 + H * spec.trunkK;
  const T = LEAF[v.leaf], A = v.alt ? LEAF[v.alt] : T;
  const stems = [];
  for (let s = 0; s < v.stems; s++) {
    const a = rng.range(0, Math.PI * 2);
    const lean = v.stems > 1 ? rng.range(0.07, 0.12) : rng.range(0, 0.04);
    const top = Math.min(H * 0.97, crownY + cry * 0.62) * (s === 0 ? 1 : rng.range(0.84, 0.9));
    const off = v.stems > 1 ? 0.2 : 0;
    stems.push({ dx: Math.cos(a) * lean, dz: Math.sin(a) * lean, top, base: [Math.cos(a) * off, Math.sin(a) * off] });
  }
  const at = (st, y) => [st.base[0] + st.dx * y, y, st.base[1] + st.dz * y];
  // lenticel marks along the trunk
  const marks = [];
  for (let y = 0.6; y < H * 0.92; y += rng.range(0.4, 0.85)) {
    marks.push({ y, h: rng.chance(0.3) ? 0.5 : 0.25, a: rng.range(-Math.PI, Math.PI), span: rng.range(0.5, 1.5), big: rng.chance(0.4) });
  }
  // canopy: a vertical stack of blobs hugging the upper trunk(s)
  const blobs = [];
  const n = rng.int(5, 6) + (v.stems > 1 ? 1 : 0);
  const za = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const st = stems[i % stems.length];
    const y = Math.min(st.top - 0.4, crownY - cry * 0.8 + t * cry * 1.55);
    const w = crx * (0.82 - Math.abs(t - 0.4) * 0.6) * rng.range(0.85, 1.1);
    // zig-zag up the trunk so the crown stays lumpy and airy, with the trunk peeking through
    const a = za + i * 2.4 + rng.range(-0.4, 0.4), off = crx * rng.range(0.35, 0.55) * (1 - t * 0.5);
    const p = at(st, y);
    blobs.push({ c: [p[0] + Math.cos(a) * off, y, p[2] + Math.sin(a) * off], r: Math.max(0.65, w), base: rng.range(1.0, 1.7), T });
  }
  for (const b of blobs) b.ry = b.r * 1.0;
  for (let i = 0; i < (v.altN || 0); i++) blobs[(rng.int(0, 99) + i * 2) % blobs.length].T = A;
  const twigs = [];
  for (let i = 0; i < 3; i++) {
    const st = stems[i % stems.length];
    const y = crownY - cry * rng.range(0.45, 0.85), a = rng.range(0, Math.PI * 2), L = crx * rng.range(0.6, 0.85);
    const p = at(st, y);
    twigs.push({ s: p, e: [p[0] + Math.cos(a) * L, y + L * 0.8, p[2] + Math.sin(a) * L] });
  }
  const lseed = rng.int(0, 1e6), cseed = rng.int(0, 1e6), bseed = rng.int(0, 1e6);
  return {
    R: crx * 1.6 + 1.2, H: H + 1,
    draw(g) {
      const bark = birchCol(BARK[spec.bark], marks, bseed, g.lod);
      for (const st of stems) {
        limb(g, [st.base[0], -0.6, st.base[1]], [st.base[0], 0.35, st.base[1]], trunkR * 1.35, trunkR, bark);
        limb(g, [st.base[0], 0, st.base[1]], at(st, st.top), trunkR, trunkR * 0.45, bark);
      }
      if (!g.lod) for (const tw of twigs) limb(g, tw.s, tw.e, trunkR * 0.4, trunkR * 0.3, () => TWIG);
      blobs.forEach((b, i) => blob(g, b.c, [b.r, b.ry, b.r], leafTone(b.T, b, cseed, g.lod, { cap: 0.35, farCap: i === blobs.length - 1 }), { lump: 0.12, lseed: lseed + i, lfreq: 1.0, p: 2.5, p1: 5, flat: 0.7 }));
    },
    meta: { height: H, trunkR, canopyY: crownY, canopyR: crx * 1.25, swayY0: crownY - cry * 0.9 },
  };
}

function planConifer(spec, v, rng, H) {
  const trunkR = 0.12 + H * spec.trunkK;
  const R0 = H * v.R0 * rng.range(0.92, 1.08);
  const T = LEAF[v.leaf], A = v.alt ? LEAF[v.alt] : null;
  const top = H - 1.3;
  const n = v.tiers;
  const step = (top - v.base) / n;
  const rim = v.airy ? 0.5 : clamp(step * 0.4, 0.75, 1.0);
  const phase0 = rng.range(0, 6);
  const env = (y) => R0 * Math.pow(clamp(1 - (y - v.base) / (top - v.base), 0, 1), v.curve ?? 0.9);
  const tiers = [];
  for (let i = 0; i < n; i++) {
    const y0 = v.base + rim + i * step;
    const R = env(y0 - rim) * rng.range(0.95, 1.05) + 0.6;
    tiers.push({
      cx: rng.range(-0.12, 0.12), cz: rng.range(-0.12, 0.12), y0, R,
      lobes: v.lobes + rng.int(0, 1), lobeAmp: 0.2, phase: phase0 + i * 1.9, fp: 4,
      P: A && i % 3 === 1 ? A : T, hi: i >= n * 0.5,
    });
  }
  const bseed = rng.int(0, 1e6);
  rng.next();
  // lod 0 tier: a wide scalloped rim slab, then a recessed collar up to the next rim
  // (airy tamarack: a thin rim and a short collar, so the trunk shows between tiers)
  const up = v.airy ? 0.5 : step - rim;
  const rows0 = [[-rim, 0, 1, 1], [0, up, v.airy ? 0.4 : 0.56, 0]];
  return {
    R: R0 + 1.6, H: H + 1,
    draw(g) {
      const bark = barkCol(BARK[spec.bark], bseed, g.lod);
      rootFlare(g, trunkR, bark, 3, bseed);
      limb(g, [0, 0, 0], [0, H - 0.8, 0], trunkR, trunkR * 0.3, bark);
      if (g.lod) {
        // lod 1: one rounded-square block per tier, a single tone each so the walls
        // merge into a few quads; airy tiers are single plates on the trunk
        tiers.forEach((ti, i) => {
          const o = { y0: ti.y0, R: Math.max(0.4, ti.R * 0.95 - 0.15), fp1: 8 };
          const hgt = v.airy ? 0.75 : i < n - 1 ? tiers[i + 1].y0 - ti.y0 : step - 0.75;
          slabs(g, o, [[-0.75, hgt, 1, 0]], () => ti.P[ti.hi ? 3 : 2]);
        });
        slabs(g, { y0: top + 0.3, R: 0.45 }, [[-0.75, 0.75, 1, 0]], () => T[3]);
        return;
      }
      for (const ti of tiers) {
        slabs(g, ti, rows0, (x, y, z, u, ri) => {
          // sunlit rims (brighter towards the top), recessed shadowed collar
          return ti.P[ri ? 1 : ti.hi ? 3 : 2];
        });
      }
      // pointed top
      slabs(g, { y0: top + 0.3, R: 0.8 }, [[-0.5, 0, 1, 0], [0, 0.5, 0.55, 0], [0.5, 1.0, 0.25, 0]], (x, y, z, u, ri) => T[ri ? 3 : 2]);
    },
    meta: { height: H, trunkR, canopyY: v.base + (H - v.base) * 0.38, canopyR: R0 + 0.6, swayY0: v.base + 0.5 },
  };
}

function planPine(spec, v, rng, H) {
  // eastern white pine: tall bare trunk, flat layered shelves of needles in whorls
  const trunkR = 0.14 + H * spec.trunkK;
  const crownBase = H * rng.range(0.42, 0.5);
  const T = LEAF[v.leaf];
  const levels = [];
  const nl = v.levels;
  let a0 = rng.range(0, Math.PI * 2);
  for (let l = 0; l < nl; l++) {
    const t = l / Math.max(1, nl - 1);
    const y = crownBase + t * (H - crownBase - 2.4);
    const reach = H * 0.23 * (1 - t * 0.45) * rng.range(0.9, 1.1);
    const pads = [];
    for (let k = 0; k < 2; k++) {
      const a = a0 + k * Math.PI + rng.range(-0.5, 0.5);
      const L = reach * rng.range(0.75, 1.0);
      const e = [Math.cos(a) * L, y + L * 0.16, Math.sin(a) * L];
      pads.push({ s: [0, y - 0.3, 0], e, o: { cx: e[0] * 0.7, cz: e[2] * 0.7, y0: e[1], R: Math.max(1.0, L * 0.58), lobes: rng.int(3, 5), lobeAmp: 0.25, phase: rng.range(0, 6), fp: 4 } });
    }
    a0 += Math.PI / 2 + rng.range(-0.4, 0.4);
    // lod 1: the whorl as one wide plate
    const cx = (pads[0].o.cx + pads[1].o.cx) / 2, cz = (pads[0].o.cz + pads[1].o.cz) / 2;
    const dx = pads[0].o.cx - pads[1].o.cx, dz = pads[0].o.cz - pads[1].o.cz;
    const span = Math.hypot(dx, dz) / 2 + pads[0].o.R * 0.8;
    const alongX = Math.abs(dx) > Math.abs(dz);
    levels.push({ pads, far: { cx, cz, y0: (pads[0].o.y0 + pads[1].o.y0) / 2, R: span, sx: alongX ? 1 : 0.6, sz: alongX ? 0.6 : 1, fp1: 6 } });
  }
  const crownTop = { cx: 0, cz: 0, y0: H - 1.4, R: 1.3, lobes: 4, lobeAmp: 0.25, phase: rng.range(0, 6), fp: 3.5, fp1: 6 };
  const bseed = rng.int(0, 1e6);
  const rows0 = [[-0.5, 0, 1, 1], [0, 0.5, 0.55, 0]];
  return {
    R: H * 0.3 + 2, H: H + 1,
    draw(g) {
      const bark = barkCol(BARK[spec.bark], bseed, g.lod);
      rootFlare(g, trunkR, bark, 4, bseed);
      limb(g, [0, 0, 0], [0, H - 0.8, 0], trunkR, trunkR * 0.4, bark);
      for (const lv of levels) {
        if (g.lod) { slabs(g, lv.far, [[-0.75, 0, 1, 0]], () => T[3]); continue; }
        for (const pd of lv.pads) limb(g, pd.s, pd.e, trunkR * 0.42, trunkR * 0.25, bark);
        for (const pd of lv.pads) slabs(g, pd.o, rows0, (x, y, z, u, ri) => T[ri ? 3 : 2]);
      }
      slabs(g, crownTop, g.lod ? [[-0.75, 0, 1, 0], [0, 0.75, 0.5, 0]] : [[-0.5, 0, 1, 1], [0, 0.5, 0.66, 1], [0.5, 1.0, 0.33, 0]], (x, y, z, u, ri) => T[ri ? 3 : 2]);
    },
    meta: { height: H, trunkR, canopyY: (crownBase + H) * 0.5, canopyR: H * 0.22, swayY0: crownBase - 0.5 },
  };
}

function planDead(spec, v, rng, H) {
  const trunkR = 0.18 + H * spec.trunkK;
  const pts = [[0, 0, 0]];
  let x = 0, z = 0;
  const segs = 4;
  const lx = rng.range(-1, 1), lz = rng.range(-1, 1); // overall lean
  for (let i = 1; i <= segs; i++) {
    x += rng.range(-0.4, 0.4) + lx * 0.18;
    z += rng.range(-0.4, 0.4) + lz * 0.18;
    pts.push([x, (H * 0.78 * i) / segs, z]);
  }
  const radii = pts.map((p, i) => trunkR * (1 - (i / segs) * 0.62));
  const branches = [];
  const nb = rng.int(4, 5);
  const a0 = rng.range(0, Math.PI * 2);
  for (let b = 0; b < nb; b++) {
    const t = 0.4 + (b / nb) * 0.52;
    const si = Math.min(segs - 1, Math.floor(t * segs));
    const f = t * segs - si;
    const p0 = pts[si], p1 = pts[si + 1];
    const s = [p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, p0[2] + (p1[2] - p0[2]) * f];
    const a = a0 + b * 2.4 + rng.range(-0.3, 0.3);
    const L = H * rng.range(0.24, 0.34) * (1 - t * 0.25);
    const up = rng.range(0.15, 0.7);
    const k1 = [s[0] + Math.cos(a) * L * 0.55, s[1] + L * up * 0.55, s[2] + Math.sin(a) * L * 0.55];
    const a2 = a + rng.range(-0.7, 0.7);
    const k2 = [k1[0] + Math.cos(a2) * L * 0.5, k1[1] + L * (up - 0.25) * 0.5, k1[2] + Math.sin(a2) * L * 0.5];
    const br = { pts: [s, k1, k2], r: trunkR * (0.46 - t * 0.14), hang: null, twig: null };
    // a crooked twig hanging from the elbow, and a claw reaching up
    if (rng.chance(0.6)) br.hang = [k2, [k2[0] + Math.cos(a2) * 0.35, k2[1] - rng.range(0.6, 1.1), k2[2] + Math.sin(a2) * 0.35]];
    if (rng.chance(0.65)) {
      const a3 = a - rng.range(0.8, 1.4);
      br.twig = [k1, [k1[0] + Math.cos(a3) * L * 0.38, k1[1] + L * 0.42, k1[2] + Math.sin(a3) * L * 0.38]];
    }
    branches.push(br);
  }
  const crown = [pts[segs], [pts[segs][0] + rng.range(-0.6, 0.6) + lx * 0.3, H, pts[segs][2] + rng.range(-0.6, 0.6) + lz * 0.3]];
  const bseed = rng.int(0, 1e6), moss = rng.int(0, 1e6);
  const hole = { y: H * rng.range(0.22, 0.3), a: rng.range(0, Math.PI * 2) };
  return {
    R: H * 0.5 + 1.5, H: H + 1,
    draw(g) {
      const B = BARK.dead;
      const bark = (x, y, z, t, ang) => {
        if (y < 0.6 && vnoise(x * 1.5, y * 1.5, z * 1.5, moss) > 0.5) return MOSS;
        if (g.lod) return B[0];
        const band = Math.floor(y / 1.2);
        const h = vhash(Math.floor((ang / (Math.PI * 2) + 0.5) * 6 + band * 2), band, 9, bseed);
        return h < 0.5 ? B[0] : h < 0.82 ? B[1] : B[2];
      };
      rootFlare(g, trunkR, bark, 4, bseed);
      bough(g, pts, radii, bark);
      limb(g, crown[0], crown[1], radii[segs], trunkR * 0.18, bark);
      for (const br of branches) {
        bough(g, br.pts, [br.r, br.r * 0.72, br.r * 0.45], bark);
        if (g.lod) continue;
        if (br.hang) limb(g, br.hang[0], br.hang[1], br.r * 0.45, br.r * 0.4, bark);
        if (br.twig) limb(g, br.twig[0], br.twig[1], br.r * 0.5, br.r * 0.4, bark);
      }
      // a dark knot hole
      if (!g.lod) {
        const p = pts[1], f = hole.y / pts[1][1];
        const hx = p[0] * f + Math.cos(hole.a) * trunkR * 0.95, hz = p[2] * f + Math.sin(hole.a) * trunkR * 0.95;
        limb(g, [hx, hole.y - 0.12, hz], [hx, hole.y + 0.2, hz], 0.16, 0.16, () => HOLE);
      }
    },
    meta: { height: H, trunkR, canopyY: H * 0.7, canopyR: H * 0.35, swayY0: H * 0.45 },
  };
}

function planBush(spec, v, rng, H) {
  const T = LEAF[v.leaf], A = LEAF[v.alt];
  const blobs = [];
  const n = rng.int(3, 4);
  const W = H * rng.range(0.7, 0.9);
  const a0 = rng.range(0, 6);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + rng.range(-0.4, 0.4);
    const d = i === 0 ? 0 : W * rng.range(0.4, 0.55);
    const r = i === 0 ? H * 0.52 : H * rng.range(0.34, 0.42);
    blobs.push({ c: [Math.cos(a) * d, r * 0.8, Math.sin(a) * d], r, ry: r * 0.88, base: i === 0 ? 1.6 : rng.range(1.0, 1.5), T: i === n - 1 ? A : T });
  }
  const cseed = rng.int(0, 1e6), lseed = rng.int(0, 1e6);
  return {
    R: W + H * 0.7 + 0.5, H: H * 1.3 + 0.5,
    draw(g) {
      blobs.forEach((b, i) => blob(g, b.c, [b.r * 1.1, b.ry, b.r * 1.1], leafTone(b.T, b, cseed, g.lod, { cap: 0.25, belly: -0.4, freq: 0.9 }), { lump: 0.14, lseed: lseed + i, lfreq: 1.6, flat: 0.75, q: 1, p: 2.4, p1: 3 }));
    },
    meta: { height: H, trunkR: 0, canopyY: H * 0.5, canopyR: W + H * 0.4, swayY0: 0.2 },
  };
}

function planFern(spec, v, rng, H) {
  const T = LEAF[v.leaf], A = v.alt ? LEAF[v.alt] : T;
  const fronds = [];
  const n = rng.int(6, 8);
  const a0 = rng.range(0, Math.PI * 2);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * Math.PI * 2 + rng.range(-0.25, 0.25);
    const L = H * rng.range(1.05, 1.4);
    const lift = H * rng.range(0.8, 1.0);
    fronds.push({ a, L, lift, T: i % 3 === 0 ? A : T });
  }
  return {
    R: H * 1.6 + 0.5, H: H + 0.5,
    draw(g) {
      if (g.lod) {
        // far away a fern clump is just a low rusty tuft
        blob(g, [0, H * 0.3, 0], [H * 1.1, H * 0.45, H * 1.1], (x, y) => T[y > 0.5 ? 2 : 1], { q: 1 });
        return;
      }
      blob(g, [0, 0.1, 0], [0.2, 0.15, 0.2], () => T[0], { q: 1 });
      for (const f of fronds) {
        // an arching blade: rises from the crown, curls out and droops; leaflets
        // widen the middle of the frond
        const c = Math.cos(f.a), s = Math.sin(f.a);
        const N = 10;
        for (let k = 0; k <= N; k++) {
          const t = k / N;
          const r = 0.08 + f.L * t;
          const y = 0.12 + f.lift * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) * (1 - t * 0.45);
          const col = f.T[t < 0.3 ? 1 : t < 0.75 ? 2 : 3];
          g.setAt(c * r, y, s * r, col);
          if (t > 0.3 && t < 0.8) for (const sd of [-1, 1]) g.setAt(c * r - s * sd * 0.22, y - 0.06, s * r + c * sd * 0.22, f.T[2], true);
        }
      }
    },
    meta: { height: H, trunkR: 0, canopyY: H * 0.5, canopyR: H * 1.3, swayY0: 0.1 },
  };
}

const PLANNERS = { broad: planBroad, slim: planSlim, conifer: planConifer, pine: planPine, dead: planDead, bush: planBush, fern: planFern };

// Fill enclosed air pockets (they are invisible but would still cost faces).
function fillCavities(vox) {
  const { w, h, d, data } = vox;
  const seen = new Uint8Array(w * h * d);
  const stack = [];
  const push = (x, y, z) => {
    if (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d) return;
    const i = x + w * (y + h * z);
    if (seen[i] || data[i]) return;
    seen[i] = 1;
    stack.push(i);
  };
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) { push(0, y, z); push(w - 1, y, z); }
  for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) { push(x, 0, z); push(x, h - 1, z); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { push(x, y, 0); push(x, y, d - 1); }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = ((i / w) | 0) % h, z = (i / (w * h)) | 0;
    push(x + 1, y, z); push(x - 1, y, z); push(x, y + 1, z); push(x, y - 1, z); push(x, y, z + 1); push(x, y, z - 1);
  }
  const nb = [1, -1, w, -w, w * h, -w * h];
  for (let i = 0; i < data.length; i++) {
    if (data[i] || seen[i]) continue;
    for (const o of nb) if (data[i + o]) { data[i] = data[i + o]; break; }
  }
}

// Far-LOD cleanup: fill notches (empty cells with >= 5 solid neighbours), drop
// specks (solid cells with <= 1 neighbour) and recolour single-voxel colour specks
// to their neighbours' majority. Keeps the silhouette, removes costly little steps.
function simplifyFar(vox, passes = 2) {
  const { w, h, d } = vox;
  const nb = (x, y, z) => [vox.get(x + 1, y, z), vox.get(x - 1, y, z), vox.get(x, y + 1, z), vox.get(x, y - 1, z), vox.get(x, y, z + 1), vox.get(x, y, z - 1)];
  const major = (cs) => {
    const m = new Map();
    let best = 0, bc = 0;
    for (const c of cs) if (c) { const n = (m.get(c) || 0) + 1; m.set(c, n); if (n > best) { best = n; bc = c; } }
    return [bc, best];
  };
  for (let p = 0; p < passes; p++) {
    const out = vox.data.slice();
    for (let z = 0; z < d; z++) for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
      const i = vox.idx(x, y, z), c = vox.data[i];
      const cs = nb(x, y, z);
      const solid = cs.filter(Boolean).length;
      if (!c && solid >= 5) out[i] = major(cs)[0];
      else if (c && solid <= 1 && y > vox.h * 0.15) out[i] = 0;
      else if (c) {
        const [bc, n] = major(cs);
        if (bc !== c && n >= 4 && !cs.includes(c)) out[i] = bc;
      }
    }
    vox.data.set(out);
  }
}

// ---------------------------------------------------------------- public API
export function buildTree(species, { seed = 0, lod = 0, height } = {}) {
  const spec = SPECS[species];
  if (!spec) throw new Error(`buildTree: unknown species "${species}"`);
  const nv = spec.variants.length;
  const variant = ((seed % nv) + nv) % nv;
  const v = spec.variants[variant];
  const rng = makeRng(strHash(species) ^ Math.imul(seed + 1, 2654435761));
  const H = height ?? rng.range(spec.h[0], spec.h[1]);
  const plan = PLANNERS[spec.kind](spec, v, rng, H);
  const s = lod ? 0.75 : 0.25;
  const g = new Grid(s, plan.R, plan.H, lod);
  plan.draw(g);
  fillCavities(g.vox);
  if (lod && spec.far !== false) simplifyFar(g.vox);
  const b = g.vox.bounds();
  const meta = { ...plan.meta, height: (b.y1 + 1 - g.bury) * s, variant };
  return { vox: g.vox, size: s, origin: g.origin, jitter: 0, meta };
}

export const PREVIEW = {};
for (const sp of TREE_SPECIES) {
  for (let v = 0; v < TREE_VARIANTS; v++) {
    for (const lod of [0, 1]) PREVIEW[`${sp}_${v}_lod${lod}`] = () => buildTree(sp, { seed: v, lod });
  }
}
