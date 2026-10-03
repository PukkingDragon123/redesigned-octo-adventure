// Pixel-art trees and forest floor for the 2D forest. Every tree is sculpted in
// metres from tubes (trunks, limbs) and ellipsoid leaf clumps (sculpt2d.js) and
// pixelled once into an outlined, band-shaded sprite: scalloped leaf clusters
// with a dark crescent under each one and a bright lip on top, inner contours
// where a clump overlaps the one behind it, bark streaks, birch lenticels,
// sawn rings on stumps and logs.
//
// The shading is baked with the light straight above the viewer, so it carries
// the form only; the forest shader adds the real sun from the side using the
// per-pixel normal packed into the alpha channel (see packAlpha):
//   alpha 0         empty
//   alpha 128..255  128 + leaf * 64 + ny * 8 + nx   (nx, ny: 0..7 = -1..1)
//
// SPRITES[species] = { variants, ppm, kind, views } ; bakeSprite({ species, seed })
// returns { views: [{ w, h, ax, ay, data }], meta: { height, trunkR }, ppm }.
import { Sculpt, renderSculpt, mixHex } from './sculpt2d.js';

const TAU = Math.PI * 2;
const OUT = 0x150c12;

// ---------------------------------------------------------------- palettes
// leaves, five tones dark -> light (the last one is the sunlit sparkle)
const LEAF_P = {
  mapleRed: [0x6e1418, 0x9c1e1e, 0xc8301f, 0xe8532a, 0xff8a3c],
  mapleCrimson: [0x5a1020, 0x841a26, 0xae2626, 0xd6402a, 0xf26a36],
  mapleOrange: [0x9a3414, 0xc9521a, 0xec7a22, 0xffa23a, 0xffcc5e],
  mapleMix: [0x8e2a16, 0xbe4418, 0xe2661e, 0xf6902c, 0xffbe50],
  mapleGreen: [0x4a5420, 0x6a7024, 0x908c2a, 0xb8a032, 0xdcbc48],
  sugarOrange: [0xa04a16, 0xcc6a1a, 0xec8e24, 0xfab23a, 0xffd462],
  sugarGold: [0xa4661a, 0xcc8a22, 0xeaaa2e, 0xf8c844, 0xffe27a],
  scarlet: [0x8a1a1c, 0xb82a1e, 0xe04a22, 0xf6782c, 0xffaa46],
  oakRusset: [0x5a2814, 0x7e3c18, 0xa4561e, 0xc87628, 0xe49a3a],
  oakBronze: [0x664818, 0x8c6420, 0xb4842a, 0xd4a436, 0xeec454],
  oakOlive: [0x504c1e, 0x706a24, 0x92882c, 0xb4a43a, 0xd2c052],
  oakRed: [0x561618, 0x7c241a, 0xa23a1e, 0xc45626, 0xe07a34],
  birch: [0x8e6a14, 0xb88c1c, 0xdcb026, 0xf0cc3c, 0xfce666],
  birchGold: [0x9c5e14, 0xc8801c, 0xe6a42a, 0xf6c440, 0xffe070],
  birchLime: [0x6a721e, 0x909826, 0xb6b432, 0xd6ce46, 0xeee870],
  aspen: [0x9a7414, 0xc49a1e, 0xe2bc2c, 0xf4d644, 0xfff07c],
  aspenGold: [0xa8601a, 0xd08222, 0xeca630, 0xf8c848, 0xffe480],
  spruce: [0x10221a, 0x1a3424, 0x284c2c, 0x3c6638, 0x5a8848],
  spruceBlue: [0x12221f, 0x1c362b, 0x2a4c38, 0x3e6648, 0x5e865e],
  spruceWarm: [0x18281a, 0x243e22, 0x36582a, 0x4c7436, 0x689444],
  pine: [0x1a2e18, 0x284220, 0x3a5c28, 0x507832, 0x6c9642],
  pineDeep: [0x142a1e, 0x203e28, 0x305832, 0x46743c, 0x62924a],
  tamarack: [0x8a4a12, 0xb46c18, 0xd89224, 0xeeb636, 0xfad65a],
  tamarackOrange: [0x8c3e14, 0xb4601a, 0xd88424, 0xf0a834, 0xfccc54],
  tamarackGreen: [0x5a581a, 0x7c7822, 0xa0982e, 0xc2b43e, 0xe0ce5a],
  bushRed: [0x5c1016, 0x841a1c, 0xb02a22, 0xd6442a, 0xf26c3a],
  bushScarlet: [0x6c1418, 0x9a221e, 0xc63624, 0xea5a2e, 0xff8a44],
  bushPlum: [0x40101e, 0x601a28, 0x84262e, 0xa83a34, 0xc85a3e],
  bushOrange: [0x8a3614, 0xb45218, 0xdc7420, 0xf49a32, 0xffc254],
  bushAmber: [0x8e4c14, 0xba6c1c, 0xe0922a, 0xf6b63e, 0xffd662],
  bracken: [0x683414, 0x8e501c, 0xb47028, 0xd29238, 0xeab452],
  brackenGold: [0x76561a, 0x9c7622, 0xc2982e, 0xdeb83e, 0xf2d45a],
  fernGreen: [0x3a4a1c, 0x566822, 0x76882c, 0x98a63a, 0xb8c252],
  moss: [0x2e3e18, 0x44561e, 0x5e7228, 0x7a8e34, 0x98aa46],
};
// bark: [fissure, dark, main, light, highlight]
const BARK = {
  maple: [0x2e221e, 0x4e3c32, 0x6a5444, 0x86705a, 0xa08a70],
  oak: [0x261e18, 0x42362a, 0x5c4a3a, 0x78644e, 0x927e64],
  birch: [0x2a2422, 0xbcb6a8, 0xd8d2c4, 0xeae4d6, 0xf8f2e4],
  aspen: [0x34322a, 0xaab298, 0xc8ceb4, 0xdce0ca, 0xeceedc],
  spruce: [0x2a1a14, 0x46301e, 0x60422c, 0x7a583c, 0x926c4a],
  pine: [0x3a2218, 0x5c3622, 0x7a4a30, 0x96603e, 0xae744c],
  tamarack: [0x3c261a, 0x563828, 0x704c36, 0x886044, 0x9e7452],
  dead: [0x2a2224, 0x443a3a, 0x5c524e, 0x746862, 0x8a7e76],
  stem: [0x3a2618, 0x523822, 0x6a4a2e, 0x82603c, 0x98744a],
  birchBase: [0x221c1a, 0x3e3430, 0x564a42, 0x6e6056, 0x84766a],
};
const WOOD = [0x6a4422, 0x9a6c3e, 0xc8945a, 0xe2b276, 0xf2ce96]; // sawn wood: ring .. light

// ---------------------------------------------------------------- helpers
function hash2(a, b, s = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function makeRng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), pick: (arr) => arr[Math.floor(next() * arr.length)], chance: (p) => next() < p };
}
const outl = (c) => mixHex(c, OUT, 0.6);

// leaf materials: lf_<name> (body), lf_<name>Sh (one tone darker), lf_<name>Lt (one lighter)
function addLeaf(mats, name) {
  const P = LEAF_P[name];
  mats[`lf_${name}`] = { ramp: [outl(P[0]), P[1], P[2], P[3], P[4]], hi: true, line: P[0] };
  mats[`lf_${name}Sh`] = { ramp: [outl(P[0]), P[0], P[1], P[2], P[3]], line: mixHex(P[0], OUT, 0.3) };
  mats[`lf_${name}Lt`] = { ramp: [outl(P[0]), P[2], P[3], P[4], P[4]], hi: true, line: P[0] };
  return `lf_${name}`;
}
function addBark(mats, name, B = BARK[name]) {
  mats[name] = { ramp: [outl(B[0]), B[1], B[2], B[3], B[4]], line: B[0] };
  mats[`${name}Dk`] = { ramp: [outl(B[0]), B[0], B[1], B[2], B[3]], line: B[0] };
  return name;
}
function addFlat(mats, name, hex, o = {}) {
  mats[name] = { ramp: [outl(hex), hex, hex, hex, hex], flat: true, ...o };
  return name;
}

// view-space position of an ellipsoid hit (h is the unit-sphere hit point)
function ellPos(h, p) {
  const B = p.B, r = p.r;
  const lx = h[0] * r[0], ly = h[1] * r[1], lz = h[2] * r[2];
  return [p.c[0] + B[0] * lx + B[1] * ly + B[2] * lz, p.c[1] + B[3] * lx + B[4] * ly + B[5] * lz];
}

// Leaf clusters: a jittered cellular pattern in screen space (cell size s
// metres, offset per clump). Each cell is one lump of leaves: a darker crescent
// along its lower edge, a lighter lip along its upper edge, and near the
// clump's silhouette the lower edges are cut away so the outline is made of
// lumps rather than a smooth ellipse. Lumps pick the second palette in
// irregular patches (mix); holes > 0 opens some gaps to show what is behind.
function smoothNoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function leafFn(A, B, s, { mix = 0.3, holes = 0, ragged = 0.42 } = {}) {
  return (h, p) => {
    const [X, Y] = ellPos(h, p);
    const g = p.group;
    const off = hash2(g, 11) * 7;
    const gx = X / s + off, gy = Y / s + off * 1.37;
    const cx = Math.floor(gx), cy = Math.floor(gy);
    let d1 = 9, d2 = 9, bx = 0, by = 0, px = 0, py = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const qx = cx + i, qy = cy + j;
      const ox = qx + 0.15 + hash2(qx, qy, g) * 0.7 - gx, oy = qy + 0.15 + hash2(qy, qx, g + 3) * 0.7 - gy;
      const d = ox * ox + oy * oy * 1.25;
      if (d < d1) { d2 = d1; d1 = d; bx = qx; by = qy; px = ox; py = oy; } else if (d < d2) d2 = d;
    }
    const edge = Math.sqrt(d2) - Math.sqrt(d1); // 0 on a lump border
    const below = py > 0; // the lump's centre is above this pixel
    // facing: near the silhouette, cut the lower rims of the lumps away
    const B9 = p.B, r = p.r;
    const nzv = (B9[6] * h[0]) / r[0] + (B9[7] * h[1]) / r[1] + (B9[8] * h[2]) / r[2];
    const nl = Math.hypot((B9[0] * h[0]) / r[0] + (B9[1] * h[1]) / r[1] + (B9[2] * h[2]) / r[2], (B9[3] * h[0]) / r[0] + (B9[4] * h[1]) / r[1] + (B9[5] * h[2]) / r[2], nzv);
    const nz = nzv / nl;
    if (nz < ragged && below && edge < 0.28 + (ragged - nz) * 0.9) return null;
    if (holes && below && edge < 0.22 && hash2(bx, by, g + 977) < holes) return null;
    const pal = smoothNoise(bx * 0.45, by * 0.45, g % 7) + hash2(bx, by, g + 5) * 0.35 < 0.35 + mix * 0.75 ? B : A;
    if (below && py > 0.14 && edge < 0.36) return `${pal}Sh`;
    if (!below && py < -0.22 && edge < 0.13) return `${pal}Lt`;
    return pal;
  };
}

// bark with vertical fissures that shift every 35 cm (cones: h is the normal, t along the tube)
function barkFn(name, len, seed, { stripe = 0.2, k = 5, capOff = false } = {}) {
  return (n, p, t) => {
    if (capOff && t >= 0.999) return null;
    const u = Math.atan2(n[0], n[2]) / Math.PI;
    const row = Math.floor((t * len) / 0.35);
    const q = u * k + hash2(row, 7, seed) * 0.7;
    return q - Math.floor(q) < stripe ? `${name}Dk` : name;
  };
}

// birch / aspen: chalky bark with black lenticel dashes (or aspen's dark "eyes")
function birchFn(name, len, seed, { base = 0.07, aspen = false } = {}) {
  return (n, p, t) => {
    const y = t * len;
    if (t < base) return 'birchBase';
    const u = Math.atan2(n[0], n[2]) / Math.PI;
    const step = aspen ? 0.45 : 0.17;
    const row = Math.floor(y / step), fy = y / step - row;
    const h = hash2(row, 3, seed);
    if (aspen) {
      const c = (hash2(row, 9, seed) - 0.5) * 0.6;
      if (h < 0.55 && fy > 0.3 && fy < 0.62 && Math.abs(u - c) < 0.14 - Math.abs(fy - 0.46) * 0.5) return 'birchMark';
      return u > 0.35 || hash2(row, Math.floor(u * 6), seed) < 0.08 ? `${name}Dk` : name;
    }
    if (h < 0.45 && fy < 0.34) {
      const c = (hash2(row, 9, seed) - 0.5) * 0.9, w = 0.07 + h * 0.4;
      if (Math.abs(u - c) < w) return 'birchMark';
    }
    return name;
  };
}

// sawn face rings (flattened ellipsoid; h is the unit-sphere hit)
function ringsFn(seed, { hollow = false } = {}) {
  return (h) => {
    const r = Math.hypot(h[0], h[2]);
    if (hollow && r < 0.42) return r < 0.34 ? 'hole' : 'woodRing';
    if (r > 0.9) return 'barkDk';
    const q = r * 4.2 + hash2(Math.floor(Math.atan2(h[2], h[0]) * 2), 1, seed) * 0.25;
    return q - Math.floor(q) < 0.22 ? 'woodRing' : 'wood';
  };
}

// a point on a quadratic curve
const quad3 = (a, b, c, t) => [0, 1, 2].map((k) => (1 - t) * (1 - t) * a[k] + 2 * (1 - t) * t * b[k] + t * t * c[k]);

// ---------------------------------------------------------------- broadleaf (maple, oak)
function broad(R, o) {
  const mats = {};
  const bark = addBark(mats, o.bark);
  const A = addLeaf(mats, o.leaf), B = addLeaf(mats, o.alt);
  const S = new Sculpt(mats);
  const H = o.H, tr = o.trunkR;
  const forkY = H * o.fork, cy = H * o.crownY, rx = H * o.crown[0], ry = H * o.crown[1];
  const lean = R.range(-0.3, 0.3);
  const trunkG = S.group();
  const top = [lean, forkY, R.range(-0.1, 0.1)];
  S.tube([[0, -0.2, 0], [lean * 0.25, forkY * 0.45, 0], top], [tr * 1.3, tr * 1.02, tr * 0.86], barkFn(bark, forkY, R.int(0, 99)), { group: trunkG });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + R.range(-0.4, 0.4);
    S.ell([Math.cos(a) * tr * 0.9, 0.06, Math.sin(a) * tr * 0.9], [tr * 0.75, tr * 0.42, tr * 0.5], bark, { rot: [-a, 0, 0], group: trunkG });
  }
  // the crown: clumps spread over a dome
  const clumps = [];
  for (let i = 0; i < o.clumps; i++) {
    const th = R.range(0, TAU), cph = R.range(-0.5, 1);
    const sph = Math.sqrt(1 - cph * cph), sh = R.range(0.5, 0.86);
    clumps.push({ c: [Math.cos(th) * sph * rx * sh + lean, cy + cph * ry * sh, Math.sin(th) * sph * rx * sh * 0.8], r: R.range(o.clumpR[0], o.clumpR[1]) });
  }
  // limbs from the fork out to the bigger clumps
  const limbTo = [...clumps].sort((a, b) => b.c[1] - a.c[1]).slice(0, o.limbs);
  for (const cl of limbTo) {
    const end = [cl.c[0] * 0.8 + lean * 0.2, cl.c[1] - cl.r * 0.3, cl.c[2] * 0.7];
    const mid = [(top[0] + end[0]) / 2 + R.range(-0.3, 0.3), (top[1] + end[1]) / 2 - 0.2, (top[2] + end[2]) / 2];
    S.tube([top, mid, end], [tr * 0.72, tr * 0.45, tr * 0.22], barkFn(bark, 3, R.int(0, 99)), { group: trunkG });
  }
  // dark heart of the canopy, set back so limbs in front still show between clumps
  S.ell([lean, cy + ry * 0.15, -rx * 0.35], [rx * 0.55, ry * 0.5, rx * 0.4], `${A}Sh`, { line: false });
  const fn = leafFn(A, B, o.leafS, { mix: o.mix ?? 0.32 });
  for (const cl of clumps) {
    const g = S.group(), r = cl.r;
    S.ell(cl.c, [r, r * o.squash, r * 0.9], fn, { group: g });
    const nb = R.int(3, 5);
    for (let k = 0; k < nb; k++) {
      const a = R.range(0, TAU), up = R.range(-0.2, 0.9);
      const d = [Math.cos(a) * Math.sqrt(1 - up * up), up, Math.sin(a) * Math.sqrt(1 - up * up)];
      const rr = r * R.range(0.42, 0.58);
      S.ell([cl.c[0] + d[0] * r * 0.72, cl.c[1] + d[1] * r * o.squash * 0.72, cl.c[2] + d[2] * r * 0.6], [rr, rr * 0.86, rr], fn, { group: g });
    }
  }
  return { S, meta: { height: H, trunkR: tr } };
}

// ---------------------------------------------------------------- slim (birch, aspen)
function slim(R, o) {
  const mats = {};
  const bark = addBark(mats, o.bark);
  addBark(mats, 'birchBase');
  addFlat(mats, 'birchMark', 0x2a2422);
  const A = addLeaf(mats, o.leaf), B = addLeaf(mats, o.alt);
  const S = new Sculpt(mats);
  const H = o.H, tr = o.trunkR;
  const fn = leafFn(A, B, o.leafS, { mix: 0.3 });
  const stems = o.stems;
  for (let s = 0; s < stems; s++) {
    const a = stems === 1 ? 0 : (s / stems) * TAU + R.range(-0.5, 0.5);
    const sp = stems === 1 ? R.range(0.1, 0.4) : R.range(0.5, 1.0);
    const hS = H * (s === 0 ? 1 : R.range(0.78, 0.92));
    const base = stems === 1 ? [0, -0.2, 0] : [Math.cos(a) * 0.14, -0.2, Math.sin(a) * 0.1];
    const tip = [base[0] + Math.cos(a) * sp, hS, base[2] + Math.sin(a) * sp * 0.6];
    const mid = [base[0] + Math.cos(a) * sp * 0.35 + R.range(-0.15, 0.15), hS * 0.5, base[2] + Math.sin(a) * sp * 0.2];
    const r0 = tr * (s === 0 ? 1 : 0.8);
    S.tube([base, mid, tip], [r0 * 1.15, r0 * 0.85, r0 * 0.3], birchFn(bark, hS, R.int(0, 99), { aspen: o.aspen }));
    // twiggy side branches
    for (let k = 0; k < 4; k++) {
      const t = R.range(0.42, 0.8), p = quad3(base, mid, tip, t), b = R.range(0, TAU);
      S.tube([p, [p[0] + Math.cos(b) * 1.1, p[1] + R.range(0.3, 0.9), p[2] + Math.sin(b) * 0.6]], [r0 * 0.32, r0 * 0.12], bark);
    }
    // crown clumps along the upper stem, hanging a little
    const n = o.clumps;
    for (let i = 0; i < n; i++) {
      const t = R.range(o.crownFrom, 1.0);
      const p = quad3(base, mid, tip, t);
      const w = H * o.crownW * Math.sin(Math.PI * Math.min(1, (t - o.crownFrom + 0.15) / (1.08 - o.crownFrom))) + 0.3;
      const ang = R.range(0, TAU), d = R.range(0.25, 1) * w;
      const r = R.range(o.clumpR[0], o.clumpR[1]) * (1.1 - (t - o.crownFrom) * 0.4);
      const c = [p[0] + Math.cos(ang) * d, p[1] - d * o.droop * 0.5, p[2] + Math.sin(ang) * d * 0.7];
      const g = S.group();
      S.ell(c, [r * 0.9, r, r * 0.85], fn, { group: g });
      for (let k = 0; k < 3; k++) {
        const a2 = R.range(0, TAU), rr = r * R.range(0.45, 0.6);
        S.ell([c[0] + Math.cos(a2) * r * 0.7, c[1] + R.range(-0.7, 0.5) * r, c[2] + Math.sin(a2) * r * 0.5], [rr, rr, rr], fn, { group: g });
      }
    }
  }
  return { S, meta: { height: H, trunkR: tr } };
}

// ---------------------------------------------------------------- conifers (spruce, tamarack)
function conifer(R, o) {
  const mats = {};
  const bark = addBark(mats, o.bark);
  const A = addLeaf(mats, o.leaf), B = addLeaf(mats, o.alt);
  const S = new Sculpt(mats);
  const H = o.H, tr = o.trunkR;
  S.tube([[0, -0.2, 0], [R.range(-0.08, 0.08), H * 0.98, 0]], [tr * 1.25, tr * 0.25], barkFn(bark, H, R.int(0, 99), { k: 3 }));
  const fn = leafFn(A, B, o.leafS, { mix: o.mix ?? 0.22, holes: o.holes ?? 0 });
  const base = o.base, n = o.tiers;
  for (let k = 0; k < n; k++) {
    const f = k / (n - 1);
    const y = base + (H - 0.9 - base) * Math.pow(f, 0.92);
    const Rt = o.R0 * H * Math.pow(1 - f, o.shape ?? 0.95) + 0.32;
    const g = S.group();
    const fans = Math.max(3, Math.round(o.fans * (0.6 + 0.4 * (1 - f))));
    const a0 = R.range(0, TAU);
    for (let i = 0; i < fans; i++) {
      const a = a0 + (i / fans) * TAU + R.range(-0.25, 0.25);
      const len = Rt * R.range(0.85, 1.08);
      const c = [Math.cos(a) * len * 0.5, y - len * 0.16, Math.sin(a) * len * 0.5];
      S.ell(c, [len * 0.55, Math.max(0.22, len * (o.thick ?? 0.17)), len * 0.3], fn, { rot: [-a, -(o.droop ?? 0.32), 0], group: g });
    }
    // a little mound in the middle of each tier so it reads as solid
    S.ell([0, y - 0.05, 0], [Rt * 0.42, Math.max(0.3, Rt * 0.24), Rt * 0.42], fn, { group: g });
  }
  // the leader
  const g = S.group();
  S.ell([0, H - 0.55, 0], [0.32, 0.7, 0.32], fn, { group: g });
  S.tube([[0, H - 0.6, 0], [0, H + 0.15, 0]], [0.08, 0.03], `${A}`, { group: g });
  if (o.cones) {
    addBark(mats, 'cone', [0x3a2014, 0x5a3420, 0x7a4a2a, 0x96603a, 0xa8744a]);
    for (let i = 0; i < 4; i++) {
      const y = H * R.range(0.75, 0.92), a = R.range(-1.2, 1.2);
      const r = (o.R0 * H * (1 - (y - base) / (H - base)) + 0.3) * 0.6;
      S.ell([Math.sin(a) * r, y - 0.25, Math.cos(a) * r], [0.07, 0.13, 0.07], 'cone');
    }
  }
  return { S, meta: { height: H, trunkR: tr } };
}

// ---------------------------------------------------------------- pine (tall bare trunk, flat crown pads)
function pine(R, o) {
  const mats = {};
  const bark = addBark(mats, 'pine');
  const A = addLeaf(mats, o.leaf), B = addLeaf(mats, 'pineDeep');
  const S = new Sculpt(mats);
  const H = o.H, tr = o.trunkR;
  const bend = R.range(-0.5, 0.5);
  const top = [bend, H * 0.94, 0];
  const mid = [bend * 0.2 + R.range(-0.2, 0.2), H * 0.5, 0];
  S.tube([[0, -0.2, 0], mid, top], [tr * 1.25, tr * 0.85, tr * 0.35], barkFn(bark, H, R.int(0, 99), { k: 3.5, stripe: 0.26 }));
  // dead stubs low on the trunk
  for (let k = 0; k < 4; k++) {
    const y = H * R.range(0.25, 0.5), a = R.range(0, TAU);
    const p = quad3([0, -0.2, 0], mid, top, y / H);
    S.tube([p, [p[0] + Math.cos(a) * 0.6, p[1] + 0.15, p[2] + Math.sin(a) * 0.4]], [tr * 0.22, tr * 0.08], bark);
  }
  const fn = leafFn(A, B, 0.34, { mix: 0.3 });
  const pads = o.levels;
  for (let i = 0; i < pads; i++) {
    const f = i / (pads - 1);
    const y = H * (0.5 + 0.44 * f);
    const side = i === pads - 1 ? 0 : (i % 2 ? 1 : -1) * R.range(0.6, 1.0);
    const p = quad3([0, -0.2, 0], mid, top, y / H);
    const w = (1 - f * 0.5) * H * 0.13 + 0.7;
    const c = [p[0] + side * w * 0.8, y, p[2] + R.range(-0.4, 0.4)];
    S.tube([p, [c[0], c[1] - 0.2, c[2]]], [tr * 0.4, tr * 0.18], bark);
    const g = S.group();
    const blobs = R.int(3, 5);
    for (let k = 0; k < blobs; k++) {
      const dx = (k / (blobs - 1) - 0.5) * w * 1.4 + R.range(-0.2, 0.2);
      const r = w * R.range(0.42, 0.56) * (1 - Math.abs(dx) / (w * 1.6));
      S.ell([c[0] + dx, c[1] + R.range(-0.1, 0.35) * r, c[2] + R.range(-0.3, 0.3)], [r * 1.1, r * 0.78, r * 0.9], fn, { group: g });
    }
  }
  return { S, meta: { height: H, trunkR: tr } };
}

// ---------------------------------------------------------------- dead trees
function dead(R, o) {
  const mats = {};
  const bark = addBark(mats, 'dead');
  addFlat(mats, 'hole', 0x1a1014);
  const S = new Sculpt(mats);
  const H = o.H, tr = o.trunkR;
  const lean = R.range(-0.5, 0.5);
  const top = [lean, H * 0.62, 0];
  const mid = [lean * 0.3 + R.range(-0.25, 0.25), H * 0.32, 0];
  const g = S.group();
  S.tube([[0, -0.2, 0], mid, top], [tr * 1.35, tr * 1.0, tr * 0.7], barkFn(bark, H, R.int(0, 99), { k: 4, stripe: 0.3 }), { group: g });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + R.range(-0.4, 0.4);
    S.ell([Math.cos(a) * tr, 0.06, Math.sin(a) * tr], [tr * 0.8, tr * 0.4, tr * 0.5], bark, { rot: [-a, 0, 0], group: g });
  }
  const branch = (p, dir, len, r, depth) => {
    const kink = [p[0] + dir[0] * len * 0.5 + R.range(-0.25, 0.25), p[1] + dir[1] * len * 0.5 + R.range(-0.2, 0.2), p[2] + dir[2] * len * 0.5];
    const end = [p[0] + dir[0] * len, p[1] + dir[1] * len, p[2] + dir[2] * len];
    S.tube([p, kink, end], [r, r * 0.7, r * 0.35], bark);
    if (depth <= 0) return;
    const nk = depth > 1 ? 2 : R.int(1, 2);
    for (let k = 0; k < nk; k++) {
      const s = k === 0 ? -1 : 1;
      const d = [dir[0] + s * R.range(0.4, 0.8), dir[1] + R.range(-0.1, 0.4), dir[2] + R.range(-0.4, 0.4)];
      const l = Math.hypot(...d);
      branch(end, d.map((v) => v / l), len * R.range(0.5, 0.68), r * 0.6, depth - 1);
    }
  };
  const nb = R.int(3, 4);
  for (let k = 0; k < nb; k++) {
    const s = k % 2 ? 1 : -1;
    const y = k === nb - 1 ? 1 : R.range(0.5, 0.95);
    const p = quad3([0, -0.2, 0], mid, top, y);
    const d = [s * R.range(0.5, 1), R.range(0.5, 1.1), R.range(-0.4, 0.4)];
    const l = Math.hypot(...d);
    branch(p, d.map((v) => v / l), H * R.range(0.22, 0.32), tr * 0.55, 2);
  }
  if (o.hollow) {
    const p = quad3([0, -0.2, 0], mid, top, 0.42);
    S.ell([p[0], p[1], tr * 0.82], [tr * 0.32, tr * 0.5, 0.06], 'hole', { group: S.group() });
  }
  return { S, meta: { height: H, trunkR: tr } };
}

// ---------------------------------------------------------------- bushes, ferns, saplings
function bush(R, o) {
  const mats = {};
  addBark(mats, 'stem');
  const A = addLeaf(mats, o.leaf), B = addLeaf(mats, o.alt);
  if (o.berries) addFlat(mats, 'berry', o.berries);
  const S = new Sculpt(mats);
  const H = o.H, W = H * R.range(1.2, 1.6);
  const fn = leafFn(A, B, 0.2, { mix: 0.35 });
  S.ell([0, H * 0.35, -0.15], [W * 0.42, H * 0.35, W * 0.3], `${A}Sh`, { line: false });
  const n = R.int(6, 9);
  for (let i = 0; i < n; i++) {
    const a = R.range(0, TAU), d = R.range(0.2, 0.62);
    const r = H * R.range(0.28, 0.4);
    const c = [Math.cos(a) * d * W * 0.5, r * 0.75 + R.range(0, H - r * 1.6), Math.sin(a) * d * W * 0.35];
    const g = S.group();
    S.ell(c, [r, r * 0.86, r * 0.9], fn, { group: g });
    for (let k = 0; k < 2; k++) {
      const b = R.range(0, TAU), rr = r * 0.52;
      S.ell([c[0] + Math.cos(b) * r * 0.7, c[1] + R.range(-0.2, 0.7) * r, c[2] + Math.sin(b) * r * 0.5], [rr, rr * 0.9, rr], fn, { group: g });
    }
    if (o.berries && R.chance(0.7)) {
      for (let k = 0; k < 3; k++) {
        const b = R.range(-1.2, 1.2), up = R.range(-0.3, 0.6);
        S.ell([c[0] + Math.sin(b) * r * 0.8, c[1] + up * r, c[2] + Math.cos(b) * r * 0.85], [0.045, 0.045, 0.045], 'berry', { group: S.group() });
      }
    }
  }
  return { S, meta: { height: H, trunkR: 0.3 } };
}

function fern(R, o) {
  const mats = {};
  const A = addLeaf(mats, o.leaf), B = addLeaf(mats, o.alt || o.leaf);
  addBark(mats, 'stem');
  const S = new Sculpt(mats);
  const H = o.H;
  const n = R.int(8, 11);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R.range(-0.25, 0.25);
    const len = H * R.range(0.8, 1.15);
    const dir = [Math.cos(a), 0, Math.sin(a) * 0.8];
    const lift = R.range(0.55, 0.95);
    const p0 = [0, 0.02, 0], p1 = [dir[0] * len * 0.25, H * lift * 1.35, dir[2] * len * 0.25], p2 = [dir[0] * len * 0.7, H * lift * 0.5, dir[2] * len * 0.7];
    const g = S.group();
    const leaf = R.chance(0.3) ? B : A;
    const steps = 9;
    for (let k = 1; k <= steps; k++) {
      const t = k / (steps + 0.5);
      const p = quad3(p0, p1, p2, t);
      const w = 0.14 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.03;
      S.ell(p, [w * 0.6, 0.07, w * 1.4], k % 3 === 0 ? `${leaf}Lt` : leaf, { rot: [-a, 0, 0.5], group: g });
    }
    S.tube([p0, quad3(p0, p1, p2, 0.5), quad3(p0, p1, p2, 0.95)], [0.025, 0.018, 0.01], 'stem', { group: g, line: false });
  }
  return { S, meta: { height: H, trunkR: 0.2 } };
}

function sapling(R, o) {
  if (o.type === 'spruce') {
    const r = conifer(R, { H: o.H, trunkR: 0.035, bark: 'spruce', leaf: o.leaf, alt: o.leaf, base: 0.25, tiers: 6, R0: 0.24, fans: 5, leafS: 0.16, thick: 0.22 });
    return r;
  }
  const mats = {};
  const bark = addBark(mats, o.type === 'birch' ? 'birch' : 'stem');
  const A = addLeaf(mats, o.leaf), B = addLeaf(mats, o.leaf === 'mapleRed' ? 'mapleOrange' : 'birchGold');
  const S = new Sculpt(mats);
  const H = o.H;
  const tip = [R.range(-0.15, 0.15), H * 0.9, 0];
  S.tube([[0, -0.05, 0], [0.04, H * 0.45, 0], tip], [0.045, 0.035, 0.015], bark);
  const fn = leafFn(A, B, 0.16, { mix: 0.3 });
  const n = R.int(5, 7);
  for (let i = 0; i < n; i++) {
    const t = R.range(0.45, 1), a = R.range(0, TAU);
    const p = [tip[0] * t + Math.cos(a) * 0.22, H * (0.4 + t * 0.55), Math.sin(a) * 0.15];
    const r = R.range(0.14, 0.24);
    if (i < 3) S.tube([[tip[0] * t * 0.8, p[1] - 0.15, 0], p], [0.015, 0.01], bark);
    S.ell(p, [r, r * 0.8, r], fn, { group: S.group() });
  }
  return { S, meta: { height: H, trunkR: 0.05 } };
}

// ---------------------------------------------------------------- stumps, logs, mushrooms
function stump(R, o) {
  const mats = {};
  addBark(mats, 'barkSt', BARK.maple);
  mats.barkDk = mats.barkStDk;
  mats.wood = { ramp: [outl(WOOD[0]), WOOD[2], WOOD[3], WOOD[4], WOOD[4]], hi: false };
  mats.woodRing = { ramp: [outl(WOOD[0]), WOOD[1], WOOD[1], WOOD[2], WOOD[2]] };
  addFlat(mats, 'hole', 0x1a1014);
  addLeaf(mats, 'moss');
  const S = new Sculpt(mats);
  const H = o.H, r = R.range(0.3, 0.42);
  const g = S.group();
  S.tube([[0, -0.3, 0], [0, H, 0]], [r * 1.12, r], barkFn('barkSt', H, R.int(0, 99), { capOff: true, k: 4 }), { group: g });
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * TAU + R.range(-0.3, 0.3);
    S.ell([Math.cos(a) * r, 0.04, Math.sin(a) * r * 0.9], [r * 0.6, r * 0.32, r * 0.42], 'barkSt', { rot: [-a, 0, 0], group: g });
  }
  S.ell([0, H, 0], [r, 0.035, r], ringsFn(R.int(0, 99), { hollow: o.hollow }), { group: g });
  if (R.chance(0.5)) {
    const a = R.range(-1, 1);
    S.ell([Math.sin(a) * r * 0.7, H * 0.4, Math.cos(a) * r * 0.75], [0.16, 0.1, 0.12], 'lf_moss', { group: S.group() });
  }
  if (o.axe) {
    mats.steel = { ramp: [0x1a1c24, 0x5a6270, 0x8e98a6, 0xc2cad4, 0xeef2f6], hi: true };
    addBark(mats, 'handle', [0x3a2414, 0x6a4424, 0x9a6a3a, 0xb8884e, 0xcca064]);
    const ag = S.group();
    S.ell([0.06, H + 0.1, 0.06], [0.24, 0.13, 0.04], 'steel', { rot: [0.2, 0.3, 0], group: ag });
    S.tube([[0.02, H + 0.06, 0.02], [-0.25, H + 0.45, 0.12], [-0.42, H + 0.72, 0.2]], [0.028, 0.025, 0.026], 'handle', { group: ag });
  }
  return { S, meta: { height: H, trunkR: r } };
}

function log(R, o) {
  const mats = {};
  addBark(mats, 'barkLog', BARK.oak);
  mats.barkDk = mats.barkLogDk;
  mats.wood = { ramp: [outl(WOOD[0]), WOOD[2], WOOD[3], WOOD[4], WOOD[4]] };
  mats.woodRing = { ramp: [outl(WOOD[0]), WOOD[1], WOOD[1], WOOD[2], WOOD[2]] };
  addFlat(mats, 'hole', 0x1a1014);
  const M = addLeaf(mats, 'moss');
  const F = addLeaf(mats, 'bracken');
  const S = new Sculpt(mats);
  const L = o.L, r = R.range(0.3, 0.36);
  const g = S.group();
  const seed = R.int(0, 99);
  // bark furrows run along the log; moss creeps over the top
  const fn = (n, p, t) => {
    if (t <= 0.001 || t >= 0.999) return null;
    const a = Math.atan2(n[1], n[2]) / Math.PI;
    if (n[1] > 0.5 + smoothNoise(t * 9, 0.5, seed) * 0.4) return n[1] > 0.85 ? `${M}Lt` : M;
    const q = a * 6 + hash2(Math.floor(t * 7), 5, seed) * 0.7;
    return q - Math.floor(q) < 0.22 ? 'barkLogDk' : 'barkLog';
  };
  S.tube([[-L / 2, r * 0.9, 0], [L / 2, r * 0.9, 0]], [r * 1.05, o.broken ? r * 0.8 : r], fn, { group: g });
  S.ell([-L / 2, r * 0.9, 0], [0.035, r * 1.05, r * 1.05], ringsFn(seed), { group: g });
  if (!o.broken) S.ell([L / 2, r * 0.9, 0], [0.035, r, r], ringsFn(seed + 1), { group: g });
  else S.ell([L / 2 + 0.05, r * 0.9, 0], [0.12, r * 0.7, r * 0.7], 'barkLogDk', { group: g });
  // a stub branch
  S.tube([[L * 0.12, r * 1.4, 0.1], [L * 0.2, r * 2.4, 0.25]], [0.07, 0.035], 'barkLog', { group: g });
  if (o.ferns) {
    for (let k = 0; k < 3; k++) {
      const x = R.range(-L * 0.35, L * 0.35);
      const gg = S.group();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + R.range(-0.3, 0.3);
        S.ell([x + Math.cos(a) * 0.14, r * 1.95 + 0.1, Math.sin(a) * 0.12], [0.18, 0.05, 0.06], F, { rot: [-a, 0.5, 0], group: gg });
      }
    }
  }
  return { S, meta: { height: r * 2, trunkR: r } };
}

function mushroom(R, o) {
  const mats = {};
  mats.stalk = { ramp: [0x3a2e2a, 0xb8aa94, 0xe4d8c2, 0xf4ecda, 0xfffaf0] };
  mats.capRed = { ramp: [0x3a0c10, 0x9a1a1c, 0xd0302a, 0xec5a3a, 0xff8a5a], hi: true };
  mats.capBrown = { ramp: [0x2a160c, 0x6a3c1e, 0x96582e, 0xb8783e, 0xd49a5a], hi: true };
  mats.capTan = { ramp: [0x2e2014, 0x8a6a40, 0xb8945a, 0xd4b072, 0xe8cc90], hi: true };
  mats.gills = { ramp: [0x2e2420, 0x8e7e6a, 0xb4a48c, 0xc8b8a0, 0xd8cab4] };
  addFlat(mats, 'spot', 0xfaf2e2);
  const S = new Sculpt(mats);
  const n = o.type === 'tiny' ? R.int(5, 7) : o.type === 'mixed' ? R.int(3, 5) : R.int(2, 3);
  const seed = R.int(0, 99);
  for (let i = 0; i < n; i++) {
    const kind = o.type === 'mixed' ? R.pick(['agaric', 'bolete', 'tan']) : o.type === 'tiny' ? 'tan' : o.type;
    const s = (o.type === 'tiny' ? R.range(0.35, 0.6) : R.range(0.6, 1.05)) * (i === 0 ? 1.15 : 1);
    const a = R.range(0, TAU), d = i === 0 ? 0 : R.range(0.06, 0.2);
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.8;
    const h = 0.26 * s, cr = (kind === 'bolete' ? 0.13 : 0.12) * s;
    const tilt = R.range(-0.2, 0.2);
    const g = S.group();
    S.tube([[x, -0.02, z], [x + tilt * h, h, z]], [cr * (kind === 'bolete' ? 0.55 : 0.32), cr * 0.28], 'stalk', { group: g });
    const cap = kind === 'agaric' ? 'capRed' : kind === 'bolete' ? 'capBrown' : 'capTan';
    const sd = seed + i;
    const capFn = (hh) => {
      if (hh[1] < -0.15) return 'gills';
      if (kind === 'agaric' && hh[1] > 0.1 && hash2(Math.floor(hh[0] * 3.2 + 9), Math.floor(hh[2] * 3.2 + 9), sd) < 0.22) return 'spot';
      return cap;
    };
    S.ell([x + tilt * h, h, z], [cr, cr * (kind === 'tan' ? 0.5 : 0.62), cr], capFn, { group: g });
  }
  return { S, meta: { height: 0.4, trunkR: 0.1 } };
}

// ---------------------------------------------------------------- species table
// H: sculpted height (m); each forest tree is scaled to its own height
const T = (o) => ({ ppm: 32, pitch: 0.06, views: 1, ...o });
export const SPRITES = {
  maple: T({ kind: 'tree', H: 9.5, build: broad, base: { bark: 'maple', trunkR: 0.36, fork: 0.3, crownY: 0.57, crown: [0.35, 0.38], limbs: 4, clumps: 18, clumpR: [1.0, 1.5], squash: 0.85, leafS: 0.36 }, variants: [
    { leaf: 'mapleRed', alt: 'mapleCrimson' }, { leaf: 'mapleOrange', alt: 'mapleRed' }, { leaf: 'mapleMix', alt: 'mapleOrange' }, { leaf: 'scarlet', alt: 'mapleOrange' },
  ] }),
  maple2: T({ kind: 'tree', H: 8.5, build: broad, base: { bark: 'maple', trunkR: 0.34, fork: 0.3, crownY: 0.56, crown: [0.4, 0.36], limbs: 4, clumps: 18, clumpR: [1.0, 1.45], squash: 0.8, leafS: 0.36 }, variants: [
    { leaf: 'sugarOrange', alt: 'sugarGold' }, { leaf: 'sugarGold', alt: 'mapleGreen' }, { leaf: 'scarlet', alt: 'sugarOrange' },
  ] }),
  oak: T({ kind: 'tree', H: 8.5, build: broad, base: { bark: 'oak', trunkR: 0.46, fork: 0.26, crownY: 0.57, crown: [0.46, 0.33], limbs: 5, clumps: 19, clumpR: [1.0, 1.4], squash: 0.72, leafS: 0.32 }, variants: [
    { leaf: 'oakRusset', alt: 'oakBronze' }, { leaf: 'oakBronze', alt: 'oakOlive' }, { leaf: 'oakRed', alt: 'oakRusset' },
  ] }),
  birch: T({ kind: 'tree', H: 10.5, build: slim, base: { bark: 'birch', trunkR: 0.16, crownFrom: 0.42, crownW: 0.17, droop: 0.5, clumps: 15, clumpR: [0.55, 0.85], leafS: 0.3 }, variants: [
    { leaf: 'birch', alt: 'birchGold', stems: 1 }, { leaf: 'birchGold', alt: 'birch', stems: 2 }, { leaf: 'birch', alt: 'birchLime', stems: 3 }, { leaf: 'birchGold', alt: 'birchLime', stems: 1 },
  ] }),
  aspen: T({ kind: 'tree', H: 10, build: slim, base: { bark: 'aspen', aspen: true, trunkR: 0.15, crownFrom: 0.5, crownW: 0.13, droop: 0.15, clumps: 16, clumpR: [0.5, 0.75], leafS: 0.28 }, variants: [
    { leaf: 'aspen', alt: 'aspenGold', stems: 1 }, { leaf: 'aspenGold', alt: 'aspen', stems: 1 }, { leaf: 'aspen', alt: 'birchLime', stems: 2 },
  ] }),
  spruce: T({ kind: 'tree', H: 13, build: conifer, base: { bark: 'spruce', trunkR: 0.2, base: 0.8, tiers: 13, R0: 0.19, fans: 7, leafS: 0.3 }, variants: [
    { leaf: 'spruce', alt: 'spruceBlue' }, { leaf: 'spruceBlue', alt: 'spruce', cones: true }, { leaf: 'spruceWarm', alt: 'spruce', R0: 0.21 }, { leaf: 'spruce', alt: 'spruceWarm', R0: 0.17, tiers: 14, cones: true },
  ] }),
  pine: T({ kind: 'tree', H: 13, build: pine, base: { trunkR: 0.22 }, variants: [{ leaf: 'pine', levels: 6 }, { leaf: 'pineDeep', levels: 5 }, { leaf: 'pine', levels: 7 }] }),
  tamarack: T({ kind: 'tree', H: 11, build: conifer, base: { bark: 'tamarack', trunkR: 0.17, base: 1.1, tiers: 14, R0: 0.2, fans: 6, leafS: 0.24, holes: 0.4, thick: 0.24, droop: 0.28, mix: 0.3 }, variants: [
    { leaf: 'tamarack', alt: 'tamarackOrange' }, { leaf: 'tamarackOrange', alt: 'tamarack' }, { leaf: 'tamarack', alt: 'tamarackGreen' },
  ] }),
  dead: T({ kind: 'tree', H: 7, build: dead, base: { trunkR: 0.3 }, variants: [{}, { hollow: true }, {}] }),
  bushRed: T({ kind: 'bush', ppm: 40, pitch: 0.15, H: 1.3, build: bush, variants: [
    { leaf: 'bushRed', alt: 'bushScarlet', berries: 0xe8323a }, { leaf: 'bushScarlet', alt: 'bushOrange' }, { leaf: 'bushPlum', alt: 'bushRed', berries: 0x3a3a8a }, { leaf: 'bushRed', alt: 'bushPlum' },
  ] }),
  bushOrange: T({ kind: 'bush', ppm: 40, pitch: 0.15, H: 1.3, build: bush, variants: [
    { leaf: 'bushOrange', alt: 'bushAmber' }, { leaf: 'bushAmber', alt: 'bushOrange', berries: 0xd02a2a }, { leaf: 'bushOrange', alt: 'bushRed' }, { leaf: 'bushAmber', alt: 'bracken' },
  ] }),
  fern: T({ kind: 'fern', ppm: 40, pitch: 0.3, H: 0.9, build: fern, variants: [{ leaf: 'bracken' }, { leaf: 'brackenGold', alt: 'bracken' }, { leaf: 'bracken', alt: 'fernGreen' }, { leaf: 'fernGreen', alt: 'brackenGold' }] }),
  sapling: T({ kind: 'sapling', ppm: 40, pitch: 0.12, H: 1.7, build: sapling, variants: [
    { type: 'maple', leaf: 'mapleRed' }, { type: 'birch', leaf: 'birch' }, { type: 'spruce', leaf: 'spruce' }, { type: 'maple', leaf: 'sugarOrange' }, { type: 'birch', leaf: 'birchGold' }, { type: 'spruce', leaf: 'spruceWarm' },
  ] }),
  // variant 1 (the axe) is placed by hand, a couple of times in the whole forest
  stump: T({ kind: 'stump', ppm: 44, pitch: 0.38, H: 0.55, build: stump, variants: [{}, { axe: true }, { hollow: true }, {}, { hollow: true }] }),
  // logs lie along +x and are pixelled from four angles (side .. end-on)
  log: T({ kind: 'log', ppm: 40, pitch: 0.35, H: 0.8, views: 4, build: log, base: { L: 3.1 }, variants: [{}, { ferns: true }, { broken: true }, {}] }),
  mushroom: T({ kind: 'mushroom', ppm: 56, pitch: 0.3, H: 0.4, build: mushroom, variants: [{ type: 'agaric' }, { type: 'bolete' }, { type: 'mixed' }, { type: 'tiny' }] }),
};
export const SPRITE_SPECIES = Object.keys(SPRITES);

// ---------------------------------------------------------------- baking
// light straight above and in front of the viewer: the scene adds the side light
const BAKE_LIGHT = (() => { const v = [0, 0.8, 0.6]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
const LOG_VIEWS = [0, Math.PI / 6, Math.PI / 3, Math.PI / 2];

export function packAlpha(leaf, nx, ny) {
  const q = (v) => Math.max(0, Math.min(7, Math.round((v + 1) * 3.5)));
  return 128 + (leaf ? 64 : 0) + q(ny) * 8 + q(nx);
}

function packView(r) {
  const n = r.w * r.h;
  const data = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    if (!r.rgba[i * 4 + 3]) continue;
    data[i * 4] = r.rgba[i * 4]; data[i * 4 + 1] = r.rgba[i * 4 + 1]; data[i * 4 + 2] = r.rgba[i * 4 + 2];
    const m = r.mats[i];
    data[i * 4 + 3] = m ? packAlpha(m.startsWith('lf_'), r.nrm[i * 2], r.nrm[i * 2 + 1]) : packAlpha(false, 0, 0);
  }
  return { w: r.w, h: r.h, ax: r.ax, ay: r.ay, data };
}

// job: { species, seed } -> { views: [{ w, h, ax, ay, data }], meta, ppm }
export function bakeSprite({ species, seed = 0 }) {
  const spec = SPRITES[species];
  const v = spec.variants[seed % spec.variants.length];
  const R = makeRng(seed * 7919 + species.length * 131 + species.charCodeAt(0));
  const o = { H: spec.H, ...spec.base, ...v };
  const { S, meta } = spec.build(R, o);
  const views = (spec.views > 1 ? LOG_VIEWS : [0]).map((yaw) => packView(renderSculpt(S, { yaw, pitch: spec.pitch }, spec.ppm, { normals: true, light: BAKE_LIGHT, contour: 2.2 })));
  return { views, meta, ppm: spec.ppm };
}
