// Voxel trees and forest undergrowth for the autumn forest: maples, oaks,
// birches, aspens, spruces, pines, tamaracks, a crooked dead tree, bushes,
// bracken, mushrooms, stumps, fallen logs and saplings.
//
// Each model is planned once in metres from (species, seed), painted at its
// finest resolution and then box-filtered down, so all LODs share one
// silhouette and one palette:
//   trees, bushes, logs        lod0 0.125 m    lod1 0.25 m    lod2 0.5 m
//   ferns, saplings, stumps    lod0 0.0625 m   lod1 0.125 m   lod2 0.25 m
//   mushrooms                  lod0 0.03125 m  lod1 0.0625 m  lod2 0.125 m
//
//   buildTreeLods(species, { seed, height, lods = 3 }) -> { lods: [{ vox, size, origin }], meta }
//   buildTree(species, { seed, lod, height })          -> { vox, size, origin, jitter: 0, meta }
//   meta (metres, from the pivot): { height, trunkR, canopyY, canopyR, swayY0, sway, variant, kind }
//
// Leaf voxels carry the LEAF flag (wind flutter, backlit glow, per-tree tint) and
// the loose leaves drifting under a crown carry FALL as well. The pivot is the
// trunk base centre at ground level (a voxel corner at every LOD); roots and the
// trunk foot reach below it so trees sit on slopes.
import { Vox, vhash, EMIT } from '../vox.js';

export const LEAF = 1 << 26;
export const FALL = 1 << 27;
const TAU = Math.PI * 2;
const CLEAR = -1;

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
const ci = (k, n = 5) => (k < 0 ? 0 : k > n - 1 ? n - 1 : Math.round(k));
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
function along(pts, t) {
  const n = pts.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(n - 1, Math.floor(f));
  return lerp3(pts[i], pts[i + 1], f - i);
}

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
  spruce: [0x14261c, 0x1e3a26, 0x2c522e, 0x406c3a, 0x5e8c4a],
  spruceBlue: [0x16261f, 0x203a2b, 0x2f5236, 0x436c45, 0x62895a],
  spruceWarm: [0x1a2c1a, 0x284222, 0x3a5c2a, 0x507a36, 0x6c9844],
  pine: [0x1c3018, 0x2a4420, 0x3c5e28, 0x527a32, 0x6e9842],
  pineDeep: [0x162e1e, 0x224228, 0x325c32, 0x48783c, 0x64964a],
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
};
// bark: [fissure, dark, main, light, highlight]
const BARK = {
  maple: [0x2e221e, 0x4e3c32, 0x6a5444, 0x86705a, 0xa08a70],
  oak: [0x261e18, 0x42362a, 0x5c4a3a, 0x78644e, 0x927e64],
  birch: [0x2a2422, 0xc6c0b2, 0xdcd6c8, 0xece6d8, 0xf8f2e4],
  aspen: [0x34322a, 0xb8bea6, 0xd0d4bc, 0xe0e4ce, 0xeef0de],
  spruce: [0x2e1c16, 0x4a301e, 0x64422e, 0x7e583e, 0x946c4c],
  pine: [0x3a2218, 0x5c3622, 0x7a4a30, 0x96603e, 0xae744c],
  tamarack: [0x3c261a, 0x563828, 0x704c36, 0x886044, 0x9e7452],
  dead: [0x2a2224, 0x443a3a, 0x5c524e, 0x746862, 0x8a7e76],
  stem: [0x3a2618, 0x523822, 0x6a4a2e, 0x82603c, 0x98744a],
};
const MOSS = [0x3e4c1e, 0x566a24, 0x70862e, 0x8ca23c];
const LICHEN = [0x7a8a62, 0x9aa87c];
const TWIG = 0x4a3a32;
const HOLE = 0x1e1418;
const WOOD = [0x9a6c3e, 0xb88650, 0xd6a468, 0xe8bc80]; // cut wood: ring, dark, main, light
const CONE = [0x5a3420, 0x7a4a2a, 0x96603a];
const FUNGUS = [0x8a5a30, 0xc0884a, 0xe2b474, 0xf4d49a];

// ---------------------------------------------------------------- voxel grid in metres
// The pivot sits on a voxel corner (n, b, n) and every dimension is a multiple of
// four voxels, so two 2:1 box filters keep it on a corner.
class Grid {
  constructor(s, R, H, bury) {
    this.s = s;
    this.n = Math.max(4, Math.ceil(R / s / 4) * 4);
    this.b = Math.max(4, Math.ceil(bury / s / 4) * 4);
    const h = Math.ceil(H / s / 4) * 4 + this.b + 4;
    this.vox = new Vox(this.n * 2, h, this.n * 2);
  }
  I(x) { return Math.floor(x / this.s) + this.n; }
  J(y) { return Math.floor(y / this.s) + this.b; }
  get origin() { return [this.n, this.b, this.n]; }
  // fn(x, y, z, i, j, k) at voxel centres inside a metric box -> colour, 0 = keep, CLEAR = empty
  each(x0, y0, z0, x1, y1, z1, fn) {
    const v = this.vox, s = this.s, D = v.data, W = v.w, HH = v.h, n = this.n, b = this.b;
    const i0 = Math.max(0, this.I(x0)), i1 = Math.min(v.w - 1, this.I(x1));
    const j0 = Math.max(0, this.J(y0)), j1 = Math.min(v.h - 1, this.J(y1));
    const k0 = Math.max(0, this.I(z0)), k1 = Math.min(v.d - 1, this.I(z1));
    for (let k = k0; k <= k1; k++) {
      const z = (k - n + 0.5) * s;
      for (let j = j0; j <= j1; j++) {
        const y = (j - b + 0.5) * s;
        let o = W * (j + HH * k) + i0;
        for (let i = i0; i <= i1; i++, o++) {
          const c = fn((i - n + 0.5) * s, y, z, i, j, k);
          if (c === CLEAR) D[o] = 0;
          else if (c) D[o] = c >>> 0;
        }
      }
    }
  }
  put(x, y, z, c, onlyEmpty = false) {
    const i = this.I(x), j = this.J(y), k = this.I(z), v = this.vox;
    if (!c || !v.inb(i, j, k)) return;
    const o = v.idx(i, j, k);
    if (onlyEmpty && v.data[o]) return;
    v.data[o] = c >>> 0;
  }
  get(x, y, z) {
    return this.vox.get(this.I(x), this.J(y), this.I(z));
  }
}

// ---------------------------------------------------------------- primitives
// Tapered limb from a to b. col(x, y, z, t, ang, rr) -> colour, with t along the
// limb, ang around it and rr the radial fraction; relief(x, y, z, t, ang) carves
// bark fissures (metres to shave off the radius).
function limb(g, a, b, r0, r1, col, relief = null) {
  const s = g.s;
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const L2 = dx * dx + dy * dy + dz * dz || 1e-9, L = Math.sqrt(L2);
  const tx = dx / L, ty = dy / L, tz = dz / L;
  // a frame around the axis for the bark angle
  const rx = Math.abs(ty) > 0.9 ? 1 : 0, ry = 1 - rx;
  let ux = ty * 0 - tz * ry, uy = tz * rx - tx * 0, uz = tx * ry - ty * rx;
  const ul = Math.hypot(ux, uy, uz) || 1;
  ux /= ul; uy /= ul; uz /= ul;
  const wx = ty * uz - tz * uy, wy = tz * ux - tx * uz, wz = tx * uy - ty * ux;
  const rm = Math.max(r0, r1) + s;
  g.each(Math.min(a[0], b[0]) - rm, Math.min(a[1], b[1]) - rm, Math.min(a[2], b[2]) - rm,
    Math.max(a[0], b[0]) + rm, Math.max(a[1], b[1]) + rm, Math.max(a[2], b[2]) + rm, (x, y, z) => {
      const px = x - a[0], py = y - a[1], pz = z - a[2];
      let t = (px * dx + py * dy + pz * dz) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t;
      const d2 = qx * qx + qy * qy + qz * qz;
      let r = r0 + (r1 - r0) * t;
      if (d2 > r * r) return 0;
      const ang = Math.atan2(qx * wx + qy * wy + qz * wz, qx * ux + qy * uy + qz * uz);
      if (relief) {
        const rr = r - relief(x, y, z, t, ang);
        if (d2 > rr * rr) return 0;
      }
      return col(x, y, z, t, ang, Math.sqrt(d2) / r);
    });
  // thin limbs: walk the centreline so they stay connected
  if (Math.min(r0, r1) < s * 0.7) {
    const n = Math.ceil(L / (s * 0.5));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = a[0] + dx * t, y = a[1] + dy * t, z = a[2] + dz * t;
      g.put(x, y, z, col(x, y, z, t, 0, 0), true);
    }
  }
}
function bough(g, pts, radii, col, relief) {
  for (let i = 0; i < pts.length - 1; i++) limb(g, pts[i], pts[i + 1], radii[i], radii[i + 1], col, relief);
}
function ball(g, c, r, col) {
  const r2 = r * r;
  g.each(c[0] - r, c[1] - r, c[2] - r, c[0] + r, c[1] + r, c[2] + r, (x, y, z) => {
    const dx = x - c[0], dy = y - c[1], dz = z - c[2];
    return dx * dx + dy * dy + dz * dz <= r2 ? col(x, y, z, dy / r) : 0;
  });
  if (r < g.s * 0.6) g.put(c[0], c[1], c[2], col(c[0], c[1], c[2], 0), true);
}

// A clump of leaves: a lumpy ellipsoid broken into leaf-sized bumps. Bumps
// catch the light, crevices between them go dark, the belly is shaded, a few
// see-through holes open in the outer shell and stray leaves stick out.
// b: { c, rx, ry, rz?, base (tone 0..4), P (palette), seed }
function leafClump(g, b, o = {}) {
  const { c, rx, ry, P, seed } = b;
  const rz = b.rz ?? rx;
  const lump = o.lump ?? 0.2, lf = (o.lf ?? 1.3) / Math.max(0.5, Math.min(rx, 1.4));
  const bump = o.bump ?? 0.16, bf = o.bf ?? 2.9;
  const holes = o.holes ?? 0.3, hf = o.hf ?? 1.7;
  const rag = o.rag ?? 0.012, belly = o.belly ?? 1.1, patch = o.patch ?? 1.0, spark = o.spark ?? 0.03;
  const hthr = 1 - holes * 0.42;
  const k = 1 + lump + bump + 0.16;
  const s = g.s;
  g.each(c[0] - rx * k, c[1] - ry * k, c[2] - rz * k, c[0] + rx * k, c[1] + ry * k, c[2] + rz * k, (x, y, z, i, j, kk) => {
    const dx = (x - c[0]) / rx, dy = (y - c[1]) / ry, dz = (z - c[2]) / rz;
    const e = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (e > k) return 0;
    const n1 = vnoise(x * lf, y * lf, z * lf, seed);
    const n2 = bump ? vnoise(x * bf + 17.3, y * bf, z * bf, seed + 11) : 0.5;
    const thr = 1 + lump * (n1 * 2 - 1) + bump * (n2 * 2 - 1);
    if (e > thr) {
      if (e < thr + 0.14 && dy > -0.5 && vhash(i, j, kk, seed) < rag) return P[ci(b.base + dy + 0.5)] | LEAF;
      return 0;
    }
    if (holes && e > 0.5 && vnoise(x * hf + 31.7, y * hf, z * hf, seed + 7) > hthr) return 0;
    // shade: belly dark, bumps lit, crevices dark
    let t = b.base + dy * belly + (n1 - 0.5) * patch + (n2 - 0.5) * 2.2;
    if (dy > 0.15 && vhash(i, j, kk, seed + 3) < spark) t += 1;
    return P[ci(t)] | LEAF;
  });
  if (Math.min(rx, ry) < s * 0.7) g.put(c[0], c[1], c[2], P[ci(b.base)] | LEAF, true);
}

// ---------------------------------------------------------------- bark
// Ridged bark: vertical plates split by dark fissures, each plate its own tone,
// with moss creeping up one side near the ground.
function barkFn(B, seed, o = {}) {
  const nr = o.ridges ?? 7, twist = o.twist ?? 0.05, mossH = o.moss ?? 0.9, mossA = o.mossA ?? 0.6;
  return (x, y, z, t, ang) => {
    if (mossH > 0 && y < mossH && Math.cos(ang - mossA) > 0.15) {
      const m = vnoise(x * 3, y * 3, z * 3, seed + 5);
      if (m > 0.4 + (y / mossH) * 0.35) return MOSS[m > 0.62 ? 2 : 1];
    }
    const u = (ang / TAU + 0.5) * nr + y * twist + (vnoise(y * 0.7, 0.5, 0.5, seed) - 0.5) * 0.8;
    const plate = Math.floor(u), f = u - plate;
    if (f < 0.2) return B[0];
    const h = vhash(plate, Math.floor(y / 0.8 + vhash(plate, 1, 1, seed) * 4), 1, seed);
    return h < 0.46 ? B[2] : h < 0.74 ? B[1] : h < 0.94 ? B[3] : B[4];
  };
}
// recess the fissures one voxel so the plates stand proud
function barkRelief(s, seed, o = {}) {
  const nr = o.ridges ?? 7, twist = o.twist ?? 0.05;
  return (x, y, z, t, ang) => {
    const u = (ang / TAU + 0.5) * nr + y * twist + (vnoise(y * 0.7, 0.5, 0.5, seed) - 0.5) * 0.8;
    return u - Math.floor(u) < 0.2 ? s * 0.9 : 0;
  };
}
// birch / aspen: pale bark, dark lenticel dashes, chevrons under the branches,
// a rough dark foot
function paleBarkFn(B, marks, scars, seed, foot) {
  return (x, y, z, t, ang) => {
    if (y < foot + vnoise(ang * 2, 0, 0, seed) * 0.5) {
      const h = vhash(Math.floor(ang * 3), Math.floor(y * 3), 2, seed);
      return h < 0.45 ? B[0] : h < 0.8 ? 0x4a4440 : 0x6a625a;
    }
    for (const m of marks) {
      if (y >= m.y && y < m.y + m.h && angDiff(ang, m.a) < m.span) return B[0];
    }
    for (const c of scars) {
      const dy = c.y - y;
      if (dy > 0 && dy < c.len && angDiff(ang, c.a) < dy * c.k + 0.12) return B[0];
    }
    const st = Math.floor((ang / TAU + 0.5) * 5);
    const h = vhash(st, Math.floor(y / 1.7), 5, seed);
    return h < 0.55 ? B[2] : h < 0.8 ? B[3] : h < 0.95 ? B[1] : B[4];
  };
}

// knot: a dark bark ring with a hole in it, bulging out of the trunk
function knot(g, p, nrm, r, B) {
  const c = [p[0] + nrm[0] * r * 0.35, p[1], p[2] + nrm[2] * r * 0.35];
  ball(g, c, r, (x, y, z) => {
    const ox = x - c[0], oy = y - c[1], oz = z - c[2];
    // distance in the plane facing out of the trunk
    const fd = Math.abs(ox * nrm[0] + oz * nrm[2]);
    const pd = Math.sqrt(Math.max(0, ox * ox + oy * oy + oz * oz - fd * fd));
    return pd < r * 0.42 ? HOLE : pd < r * 0.7 ? B[0] : B[1];
  });
}

// surface roots snaking out from the trunk foot
function rootPlan(rng, trunkR, n, reach = 1) {
  const out = [];
  const a0 = rng.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + rng.range(-0.35, 0.35);
    const L = (trunkR * 1.5 + rng.range(0.25, 0.7)) * reach;
    const b = rng.range(-0.45, 0.45);
    const r0 = trunkR * rng.range(0.5, 0.62);
    out.push({
      pts: [
        [Math.cos(a) * trunkR * 0.3, trunkR * 1.1, Math.sin(a) * trunkR * 0.3],
        [Math.cos(a) * (trunkR + L * 0.3), r0 * 0.75, Math.sin(a) * (trunkR + L * 0.3)],
        [Math.cos(a + b * 0.5) * (trunkR + L * 0.65), r0 * 0.25, Math.sin(a + b * 0.5) * (trunkR + L * 0.65)],
        [Math.cos(a + b) * (trunkR + L), -r0 * 0.7, Math.sin(a + b) * (trunkR + L)],
      ],
      r: [r0, r0 * 0.8, r0 * 0.62, r0 * 0.48],
    });
  }
  return out;
}
function drawRoots(g, roots, col) {
  for (const rt of roots) bough(g, rt.pts, rt.r, col);
}

// loose leaves drifting under a crown
function fallingLeaves(g, list, P) {
  for (const f of list) g.put(f[0], f[1], f[2], P[f[3]] | LEAF | FALL, true);
}
function fallPlan(rng, n, R, y0, y1) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rng.range(0, TAU), r = Math.sqrt(rng.next()) * R;
    out.push([Math.cos(a) * r, rng.range(y0, y1), Math.sin(a) * r, rng.int(2, 4)]);
  }
  return out;
}

// ---------------------------------------------------------------- species
// Variants i and i + 3 share a palette (the far LODs only keep variants 0-2).
const SPECS = {
  maple: { h: [7, 10.5], kind: 'broad', bark: 'maple', trunkK: 0.022, fork: 0.42, crownY: 0.66, crown: [0.36, 0.3], limbs: [3, 4], clumps: 20, clumpR: [0.27, 0.35], squash: 0.82, variants: [
    { leaf: 'mapleRed', alt: 'mapleCrimson' },
    { leaf: 'mapleOrange', alt: 'mapleRed' },
    { leaf: 'mapleMix', alt: 'mapleGreen' },
    { leaf: 'mapleRed', alt: 'mapleOrange' },
    { leaf: 'mapleOrange', alt: 'mapleMix' },
    { leaf: 'mapleMix', alt: 'mapleCrimson' },
  ] },
  maple2: { h: [6.5, 9.5], kind: 'broad', bark: 'maple', trunkK: 0.022, fork: 0.38, crownY: 0.64, crown: [0.4, 0.28], limbs: [3, 5], clumps: 19, clumpR: [0.28, 0.36], squash: 0.8, variants: [
    { leaf: 'sugarOrange', alt: 'sugarGold' },
    { leaf: 'sugarGold', alt: 'sugarOrange' },
    { leaf: 'scarlet', alt: 'mapleCrimson' },
    { leaf: 'sugarOrange', alt: 'scarlet' },
    { leaf: 'sugarGold', alt: 'mapleGreen' },
    { leaf: 'scarlet', alt: 'sugarOrange' },
  ] },
  oak: { h: [7, 9], kind: 'broad', bark: 'oak', trunkK: 0.032, fork: 0.32, crownY: 0.64, crown: [0.42, 0.27], limbs: [4, 5], clumps: 18, clumpR: [0.26, 0.34], squash: 0.72, oak: true, variants: [
    { leaf: 'oakRusset', alt: 'oakBronze' },
    { leaf: 'oakBronze', alt: 'oakOlive' },
    { leaf: 'oakRed', alt: 'oakRusset' },
    { leaf: 'oakRusset', alt: 'oakRed' },
    { leaf: 'oakBronze', alt: 'oakRusset' },
    { leaf: 'oakRed', alt: 'oakBronze' },
  ] },
  birch: { h: [8, 12], kind: 'slim', bark: 'birch', trunkK: 0.016, crownY: 0.7, crown: [0.22, 0.27], droop: 0.5, clumpR: [0.42, 0.7], variants: [
    { leaf: 'birch', alt: 'birchGold', stems: 1 },
    { leaf: 'birchGold', alt: 'birch', stems: 2 },
    { leaf: 'birch', alt: 'birchLime', stems: 3 },
    { leaf: 'birch', alt: 'birchLime', stems: 2 },
    { leaf: 'birchGold', alt: 'birchLime', stems: 1 },
    { leaf: 'birch', alt: 'birchGold', stems: 1 },
  ] },
  aspen: { h: [8, 12], kind: 'slim', bark: 'aspen', trunkK: 0.014, crownY: 0.72, crown: [0.18, 0.26], droop: 0.15, clumpR: [0.38, 0.6], aspen: true, variants: [
    { leaf: 'aspen', alt: 'aspenGold', stems: 1 },
    { leaf: 'aspenGold', alt: 'aspen', stems: 1 },
    { leaf: 'aspen', alt: 'birchLime', stems: 2 },
    { leaf: 'aspen', alt: 'aspenGold', stems: 1 },
    { leaf: 'aspenGold', alt: 'birchLime', stems: 1 },
    { leaf: 'aspen', alt: 'aspen', stems: 2 },
  ] },
  spruce: { h: [10, 16], kind: 'conifer', bark: 'spruce', trunkK: 0.018, variants: [
    { leaf: 'spruce', base: 0.7, R0: 0.2, lobes: 7 },
    { leaf: 'spruceBlue', base: 0.9, R0: 0.18, lobes: 6 },
    { leaf: 'spruceWarm', base: 0.6, R0: 0.21, lobes: 7 },
    { leaf: 'spruce', base: 1.1, R0: 0.19, lobes: 6, cones: true },
    { leaf: 'spruceBlue', base: 0.6, R0: 0.2, lobes: 7, cones: true },
    { leaf: 'spruceWarm', base: 0.8, R0: 0.2, lobes: 6 },
  ] },
  pine: { h: [10, 16], kind: 'pine', bark: 'pine', trunkK: 0.02, variants: [
    { leaf: 'pine', levels: 5 }, { leaf: 'pineDeep', levels: 4 }, { leaf: 'pine', levels: 4 },
    { leaf: 'pine', levels: 4 }, { leaf: 'pineDeep', levels: 5 }, { leaf: 'pine', levels: 5 },
  ] },
  tamarack: { h: [9, 13], kind: 'tamarack', bark: 'tamarack', trunkK: 0.016, variants: [
    { leaf: 'tamarack', alt: 'tamarackOrange' },
    { leaf: 'tamarackOrange', alt: 'tamarack' },
    { leaf: 'tamarack', alt: 'tamarackGreen' },
    { leaf: 'tamarack', alt: 'tamarackOrange' },
    { leaf: 'tamarackOrange', alt: 'tamarackGreen' },
    { leaf: 'tamarack', alt: 'tamarack' },
  ] },
  dead: { h: [5.5, 8], kind: 'dead', bark: 'dead', trunkK: 0.04, variants: [{}, { eyes: true }, {}] },
  bushRed: { h: [1, 1.7], kind: 'bush', variants: [
    { leaf: 'bushRed', alt: 'bushScarlet', berries: 0xe8323a },
    { leaf: 'bushScarlet', alt: 'bushOrange' },
    { leaf: 'bushPlum', alt: 'bushRed', berries: 0x3a3a8a },
    { leaf: 'bushRed', alt: 'bushPlum' },
    { leaf: 'bushScarlet', alt: 'bushPlum', berries: 0xe8323a },
    { leaf: 'bushPlum', alt: 'bushScarlet' },
  ] },
  bushOrange: { h: [1, 1.7], kind: 'bush', variants: [
    { leaf: 'bushOrange', alt: 'bushAmber' },
    { leaf: 'bushAmber', alt: 'bushOrange', berries: 0xd02a2a },
    { leaf: 'bushOrange', alt: 'bushRed' },
    { leaf: 'bushAmber', alt: 'bracken' },
    { leaf: 'bushOrange', alt: 'bushAmber', berries: 0x3a3a8a },
    { leaf: 'bushAmber', alt: 'bushRed' },
  ] },
  fern: { h: [0.7, 1.1], kind: 'fern', variants: [
    { leaf: 'bracken' }, { leaf: 'brackenGold' }, { leaf: 'bracken', alt: 'fernGreen' }, { leaf: 'fernGreen', alt: 'brackenGold' },
    { leaf: 'brackenGold', alt: 'bracken' }, { leaf: 'fernGreen' },
  ] },
  mushroom: { h: [0.3, 0.48], kind: 'mushroom', variants: [
    { type: 'agaric' }, { type: 'bolete' }, { type: 'mixed' }, { type: 'tiny' }, { type: 'agaric' }, { type: 'mixed' },
  ] },
  // variant 1 (the axe) is placed by hand, a couple of times in the whole forest
  stump: { h: [0.4, 0.7], kind: 'stump', variants: [{}, { axe: true }, { hollow: true }, {}, { hollow: true }] },
  log: { h: [2.6, 3.8], kind: 'log', variants: [{}, { ferns: true }, { broken: true }, { ferns: true, broken: true }, {}] },
  sapling: { h: [1.2, 2.2], kind: 'sapling', variants: [
    { type: 'maple', leaf: 'mapleRed' }, { type: 'birch', leaf: 'birch' }, { type: 'spruce', leaf: 'spruce' }, { type: 'maple', leaf: 'sugarOrange' },
    { type: 'birch', leaf: 'birchGold' }, { type: 'spruce', leaf: 'spruceWarm' },
  ] },
};
export const TREE_SPECIES = Object.keys(SPECS);
// per species: variant count, finest voxel size, kind
const SIZE0 = { fern: 0.0625, sapling: 0.0625, stump: 0.0625, mushroom: 0.03125 };
export const TREE_INFO = Object.fromEntries(TREE_SPECIES.map((sp) => [sp, { variants: SPECS[sp].variants.length, size: SIZE0[sp] ?? 0.125, kind: SPECS[sp].kind }]));

// ---------------------------------------------------------------- planners
// A plan is { R, H, bury, draw(g), meta }. Planners consume the rng; draw() never does.

function planBroad(spec, v, rng, H) {
  const trunkR = 0.16 + H * spec.trunkK;
  const crx = H * spec.crown[0] * rng.range(0.9, 1.1), cry = H * spec.crown[1] * rng.range(0.9, 1.1);
  const crownY = H * spec.crownY;
  const forkY = H * spec.fork * rng.range(0.9, 1.08);
  const T = LEAF_P[v.leaf], A = LEAF_P[v.alt ?? v.leaf];
  const lx = rng.range(-0.3, 0.3), lz = rng.range(-0.3, 0.3);
  const top = [lx, forkY, lz];
  const cc = [lx * 1.4, crownY, lz * 1.4];
  const cr = (crx + cry) * 0.5;
  // primary limbs fan out from the fork and end inside the crown
  const nP = rng.int(spec.limbs[0], spec.limbs[1]);
  const a0 = rng.range(0, TAU);
  const prims = [];
  for (let i = 0; i < nP; i++) {
    const a = a0 + (i / nP) * TAU + rng.range(-0.3, 0.3);
    const reach = crx * rng.range(0.5, 0.68) * (spec.oak ? 1.15 : 1);
    const sy = forkY + rng.range(-0.3, 0.35);
    const ey = crownY + cry * (spec.oak ? rng.range(-0.35, 0.05) : rng.range(-0.15, 0.3));
    const s = [lx, sy, lz];
    const e = [cc[0] + Math.cos(a) * reach, ey, cc[2] + Math.sin(a) * reach];
    const m = lerp3(s, e, 0.45);
    m[1] += spec.oak ? -rng.range(0.1, 0.5) : rng.range(0.1, 0.5);
    m[0] += Math.cos(a + 1.3) * rng.range(-0.3, 0.3);
    m[2] += Math.sin(a + 1.3) * rng.range(-0.3, 0.3);
    prims.push({ a, pts: [s, m, e], r: trunkR * rng.range(0.52, 0.64) });
  }
  // leaf clumps on a spiral through the crown shell
  const N = spec.clumps + rng.int(-2, 2);
  const golden = Math.PI * (3 - Math.sqrt(5));
  const altLimb = rng.int(0, nP - 1);
  const clumps = [];
  for (let i = 0; i < N; i++) {
    const yy = 1 - ((i + 0.5) / N) * 1.72;
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const th = a0 + i * golden + rng.range(-0.25, 0.25);
    const d = rng.range(0.56, 0.84);
    const c = [cc[0] + Math.cos(th) * rr * crx * d, crownY + yy * cry * d, cc[2] + Math.sin(th) * rr * crx * d];
    const r = cr * rng.range(spec.clumpR[0], spec.clumpR[1]);
    let best = 0, bd = 9;
    prims.forEach((p, k) => { const dd = angDiff(th, p.a); if (dd < bd) { bd = dd; best = k; } });
    const P = (best === altLimb && rng.chance(0.75)) || rng.chance(0.07) ? A : T;
    clumps.push({ c, rx: r * rng.range(0.95, 1.1), ry: r * spec.squash, rz: r * rng.range(0.95, 1.1), base: 1.75 + yy * 0.7 + rng.range(-0.3, 0.3), P, prim: best, seed: rng.int(0, 1e6), yy });
  }
  // dark masses in the core keep the crown from reading see-through
  const core = [];
  for (let i = 0; i < 3; i++) {
    const a = a0 + i * 2.1;
    core.push({ c: [cc[0] + Math.cos(a) * crx * 0.22, crownY + cry * 0.05 + i * 0.2, cc[2] + Math.sin(a) * crx * 0.22], rx: cr * 0.32, ry: cr * 0.28, base: 0.7, P: T, seed: rng.int(0, 1e6) });
  }
  // secondary branches from each clump's limb into the clump
  const secs = clumps.map((b) => {
    const p = prims[b.prim];
    const s = along(p.pts, rng.range(0.4, 0.85));
    const e = lerp3(s, b.c, 0.92);
    const m = lerp3(s, e, 0.5);
    m[1] += rng.range(0, 0.3);
    return { pts: [s, m, e], r: Math.max(0.05, p.r * rng.range(0.34, 0.46)) };
  });
  // twigs poking out of the lower clumps
  const twigs = [];
  for (const b of clumps) {
    if (b.yy > 0.1 || !rng.chance(0.55)) continue;
    const a = rng.range(0, TAU), L = b.rx * rng.range(1.0, 1.35);
    const s = b.c;
    twigs.push({ s, e: [s[0] + Math.cos(a) * L, s[1] - b.ry * rng.range(0.3, 0.8), s[2] + Math.sin(a) * L] });
  }
  const roots = rootPlan(rng, trunkR, rng.int(4, 6), spec.oak ? 1.3 : 1);
  const knots = [];
  for (let i = 0; i < rng.int(1, 3); i++) {
    const a = rng.range(0, TAU), y = rng.range(1.0, forkY * 0.85), f = y / forkY;
    knots.push({ p: [lx * f + Math.cos(a) * trunkR * 0.9, y, lz * f + Math.sin(a) * trunkR * 0.9], n: [Math.cos(a), 0, Math.sin(a)], r: rng.range(0.12, 0.2) });
  }
  const falls = fallPlan(rng, rng.int(6, 11), crx * 0.95, 0.7, crownY - cry * 0.8);
  const bseed = rng.int(0, 1e6);
  const mossA = rng.range(0, TAU);
  return {
    R: crx * 1.45 + 1.2, H: crownY + cry * 1.5 + 0.6, bury: 0.6,
    draw(g) {
      const bo = { ridges: spec.oak ? 9 : 7, twist: spec.oak ? 0.09 : 0.04, moss: 1.1, mossA };
      const bark = barkFn(BARK[spec.bark], bseed, bo);
      const relief = barkRelief(g.s, bseed, bo);
      drawRoots(g, roots, bark);
      limb(g, [0, -0.6, 0], [lx * 0.15, 0.7, lz * 0.15], trunkR * 1.4, trunkR * 1.02, bark, relief);
      limb(g, [lx * 0.15, 0.6, lz * 0.15], top, trunkR * 1.02, trunkR * 0.86, bark, relief);
      // leader up into the crown
      limb(g, top, [cc[0], crownY + cry * 0.4, cc[2]], trunkR * 0.62, trunkR * 0.32, bark);
      for (const p of prims) bough(g, p.pts, [p.r, p.r * 0.82, p.r * 0.58], bark, p.r > g.s * 2.5 ? relief : null);
      for (const k of knots) knot(g, k.p, k.n, k.r, BARK[spec.bark]);
      for (const sc of secs) bough(g, sc.pts, [sc.r, sc.r * 0.8, sc.r * 0.6], bark);
      for (const b of core) leafClump(g, b, { holes: 0, lump: 0.15, bump: 0.1 });
      for (const b of clumps) leafClump(g, b, { lump: 0.2, bump: 0.17, holes: 0.34 });
      for (const tw of twigs) limb(g, tw.s, tw.e, 0.045, 0.03, () => TWIG);
      fallingLeaves(g, falls, T);
    },
    meta: { height: crownY + cry, trunkR, canopyY: crownY, canopyR: crx * 1.15, swayY0: forkY * 0.6, sway: spec.oak ? 0.1 : 0.14 },
  };
}

function planSlim(spec, v, rng, H) {
  const crownY = H * spec.crownY;
  const crx = H * spec.crown[0] * rng.range(0.9, 1.1), cry = H * spec.crown[1];
  const trunkR = 0.1 + H * spec.trunkK;
  const T = LEAF_P[v.leaf], A = LEAF_P[v.alt ?? v.leaf];
  const nS = v.stems || 1;
  const stems = [];
  const sa0 = rng.range(0, TAU);
  for (let s = 0; s < nS; s++) {
    const a = sa0 + (s / nS) * TAU + rng.range(-0.4, 0.4);
    const lean = nS > 1 ? rng.range(0.08, 0.14) : rng.range(0, 0.05);
    const top = H * (s === 0 ? rng.range(0.95, 1.0) : rng.range(0.8, 0.9));
    const off = nS > 1 ? 0.18 : 0;
    const b = [Math.cos(a) * off, 0, Math.sin(a) * off];
    const bend = rng.range(-0.25, 0.25);
    const pts = [b, [b[0] + Math.cos(a) * lean * top * 0.35 + bend, top * 0.4, b[2] + Math.sin(a) * lean * top * 0.35], [b[0] + Math.cos(a) * lean * top, top, b[2] + Math.sin(a) * lean * top]];
    stems.push({ pts, top, r: trunkR * (s === 0 ? 1 : 0.82), a });
  }
  const at = (st, y) => along(st.pts, y / st.top);
  // branches: upswept, tips drooping (birch) or short and upright (aspen)
  const branches = [];
  const clumps = [];
  for (const st of stems) {
    for (let y = st.top * 0.48; y < st.top - 0.6; y += rng.range(0.38, 0.62)) {
      const p = at(st, y);
      const a = rng.range(0, TAU);
      const t = (y - st.top * 0.48) / (st.top * 0.52);
      const L = crx * (0.55 + 0.55 * Math.sin(Math.PI * Math.min(1, t * 1.15))) * rng.range(0.75, 1.1);
      const up = spec.aspen ? rng.range(0.7, 1.1) : rng.range(0.45, 0.85);
      const m = [p[0] + Math.cos(a) * L * 0.55, y + L * up * 0.55, p[2] + Math.sin(a) * L * 0.55];
      const e = [p[0] + Math.cos(a) * L, y + L * up * 0.55 + L * (0.25 - spec.droop * 0.6), p[2] + Math.sin(a) * L];
      branches.push({ pts: [p, m, e], r: st.r * 0.34 });
      const r = rng.range(spec.clumpR[0], spec.clumpR[1]) * (0.75 + 0.35 * (1 - Math.abs(t - 0.45)));
      const P = rng.chance(0.22) ? A : T;
      clumps.push({ c: e, rx: r * 1.1, ry: r * 0.9, base: 1.6 + t * 0.6 + rng.range(-0.3, 0.3), P, seed: rng.int(0, 1e6) });
      if (L > 0.9) clumps.push({ c: lerp3(m, e, 0.35), rx: r * 0.8, ry: r * 0.7, base: 1.3 + rng.range(-0.3, 0.3), P, seed: rng.int(0, 1e6) });
      // birch: a curtain of drooping twigs under the tip
      if (spec.droop > 0.3 && rng.chance(0.5)) branches.push({ pts: [e, [e[0] + Math.cos(a) * 0.25, e[1] - rng.range(0.5, 0.9), e[2] + Math.sin(a) * 0.25]], r: 0.03, twig: true });
    }
    clumps.push({ c: at(st, st.top - 0.2), rx: crx * 0.4, ry: crx * 0.5, base: 2.4, P: T, seed: rng.int(0, 1e6) });
  }
  const marks = [];
  for (let y = 0.7; y < H * 0.95; y += rng.range(0.22, 0.5)) {
    marks.push({ y, h: rng.chance(0.25) ? 0.22 : 0.11, a: rng.range(-Math.PI, Math.PI), span: rng.range(0.25, spec.aspen ? 0.5 : 1.1) });
  }
  const scars = branches.filter((b) => !b.twig).slice(0, 10).map((b) => ({ y: b.pts[0][1], a: Math.atan2(b.pts[1][2] - b.pts[0][2], b.pts[1][0] - b.pts[0][0]), len: spec.aspen ? 0.25 : 0.42, k: spec.aspen ? 1.6 : 2.4 }));
  const roots = rootPlan(rng, trunkR, 3, 0.7);
  const falls = fallPlan(rng, rng.int(4, 8), crx * 1.1, 0.6, crownY - cry * 0.7);
  const bseed = rng.int(0, 1e6);
  return {
    R: crx * 1.9 + 1.2, H: H + 1, bury: 0.6,
    draw(g) {
      const B = BARK[spec.bark];
      const bark = paleBarkFn(B, marks, scars, bseed, spec.aspen ? 0.35 : 0.55);
      const twig = () => (spec.aspen ? 0x6a6a5a : TWIG);
      drawRoots(g, roots, () => 0x4a4440);
      for (const st of stems) {
        limb(g, [st.pts[0][0], -0.6, st.pts[0][2]], [st.pts[0][0], 0.4, st.pts[0][2]], st.r * 1.35, st.r, bark);
        bough(g, st.pts, [st.r, st.r * 0.75, st.r * 0.38], bark);
      }
      for (const b of branches) {
        if (b.twig) continue;
        bough(g, b.pts, [b.r, b.r * 0.75, b.r * 0.5], b.r > 0.07 ? bark : twig);
      }
      for (const b of clumps) leafClump(g, b, { lump: 0.26, holes: 0.42, hf: 3.0, lf: 1.5, belly: 0.9, rag: 0.02 });
      for (const b of branches) if (b.twig) limb(g, b.pts[0], b.pts[1], 0.035, 0.03, twig);
      fallingLeaves(g, falls, T);
    },
    meta: { height: H, trunkR, canopyY: crownY, canopyR: crx * 1.3, swayY0: H * 0.3, sway: 0.16 },
  };
}

// Spruce: layered whorls of drooping boughs, sunlit needle tips, dark hollows
// between the tiers, a spire on top and cones near it.
function planConifer(spec, v, rng, H) {
  const trunkR = 0.12 + H * spec.trunkK;
  const R0 = H * v.R0 * rng.range(0.92, 1.08);
  const T = LEAF_P[v.leaf];
  const top = H - 1.0;
  const base = v.base + rng.range(-0.1, 0.2);
  const env = (y) => R0 * Math.pow(clamp(1 - (y - base) / (top - base), 0, 1), 0.92);
  const tiers = [];
  let y = top - 0.15;
  let phase = rng.range(0, 6);
  const bend = [rng.range(-0.25, 0.25), rng.range(-0.25, 0.25)];
  while (y > base + 0.2) {
    const R = env(y) * rng.range(0.84, 1.12) + 0.45;
    const lean = 1 - (y - base) / (top - base);
    const spacing = clamp(0.62 + R * 0.12, 0.62, 0.95) * rng.range(0.9, 1.1);
    const sparse = rng.chance(0.22);
    tiers.push({ cx: bend[0] * (1 - lean) + rng.range(-0.1, 0.1), cz: bend[1] * (1 - lean) + rng.range(-0.1, 0.1), y0: y, R, lobes: v.lobes + rng.int(-1, 1), phase, droop: Math.min(0.42, R * 0.16) * rng.range(0.85, 1.2), thick: clamp(R * 0.17, 0.25, 0.4), seed: rng.int(0, 1e6), wob: sparse ? rng.range(0.18, 0.26) : rng.range(0.08, 0.16), gap: sparse ? -0.35 : -0.62 });
    phase += rng.range(1.2, 2.6);
    y -= spacing;
  }
  // dead twig stubs on the bare foot of the trunk
  const stubs = [];
  for (let k = 0; k < rng.int(3, 6); k++) {
    const a = rng.range(0, TAU), sy = rng.range(0.6, Math.max(0.8, base)), L = rng.range(0.3, 0.7);
    stubs.push([[Math.cos(a) * trunkR, sy, Math.sin(a) * trunkR], [Math.cos(a) * (trunkR + L), sy - L * 0.35, Math.sin(a) * (trunkR + L)]]);
  }
  const cones = [];
  if (v.cones) {
    for (let k = 0; k < rng.int(5, 9); k++) {
      const ti = tiers[rng.int(1, Math.min(4, tiers.length - 1))];
      const a = rng.range(0, TAU), r = ti.R * rng.range(0.55, 0.85);
      cones.push([ti.cx + Math.cos(a) * r, ti.y0 - ti.droop * 0.6 - ti.thick - 0.08, ti.cz + Math.sin(a) * r]);
    }
  }
  const roots = rootPlan(rng, trunkR, rng.int(3, 4), 0.8);
  const bseed = rng.int(0, 1e6);
  return {
    R: R0 + 1.4, H: H + 0.6, bury: 0.6,
    draw(g) {
      const s = g.s;
      const bark = barkFn(BARK[spec.bark], bseed, { ridges: 6, twist: 0.02, moss: 0.6 });
      drawRoots(g, roots, bark);
      limb(g, [0, -0.6, 0], [0, 0.5, 0], trunkR * 1.35, trunkR, bark);
      limb(g, [0, 0.4, 0], [0, H - 0.5, 0], trunkR, trunkR * 0.2, bark);
      for (const st of stubs) limb(g, st[0], st[1], 0.05, 0.03, () => TWIG);
      for (const ti of tiers) {
        const { cx, cz, y0, R, droop, thick } = ti;
        const Rm = R * 1.2 + s;
        g.each(cx - Rm, y0 - droop - thick - 0.3, cz - Rm, cx + Rm, y0 + 0.3, cz + Rm, (x, y, z, i, j, k) => {
          const px = x - cx, pz = z - cz;
          const d = Math.sqrt(px * px + pz * pz);
          if (d > Rm) return 0;
          const th = Math.atan2(pz, px);
          const lob = Math.cos(ti.lobes * th + ti.phase);
          const Rt = R * (1 + ti.wob * lob + 0.14 * (vnoise(th * 1.6 + 9, y0, 0.5, ti.seed) - 0.5));
          if (d > Rt) return 0;
          const u = d / Rt;
          // gaps between the boughs out towards the tips
          if (u > 0.5 && lob < ti.gap + (1 - u) * 0.5) return 0;
          const lift = u > 0.82 ? (u - 0.82) * 0.5 : 0; // tips turn up a little
          const yt = y0 - droop * u * u + lift;
          const yb = yt - thick * (u > 0.7 ? 0.75 : 1) - s * 0.5;
          if (y > yt || y < yb) return 0;
          const fromTop = yt - y, fromBot = y - yb;
          let t = 2 + (u - 0.55) * 1.4;
          if (fromTop < s) t += 0.7; else if (fromBot < s * 1.2) t -= 1.4; else t -= 0.6;
          if (u > 0.85 && fromTop < s && vhash(i, j, k, ti.seed) < 0.35) t += 1;
          return T[ci(t)] | LEAF;
        });
      }
      // spire
      for (let k = 0; k < 3; k++) {
        const yy = top + 0.1 + k * 0.3, rr = 0.42 - k * 0.12;
        g.each(-rr, yy - 0.22, -rr, rr, yy, rr, (x, y, z) => (x * x + z * z <= rr * rr ? T[ci(3 - (k === 0 ? 1 : 0))] | LEAF : 0));
      }
      limb(g, [0, top + 0.6, 0], [0, H + 0.35, 0], 0.07, 0.04, () => T[3] | LEAF);
      for (const c of cones) {
        g.each(c[0] - 0.07, c[1] - 0.24, c[2] - 0.07, c[0] + 0.07, c[1], c[2] + 0.07, (x, y) => CONE[y < c[1] - 0.15 ? 0 : y < c[1] - 0.06 ? 1 : 2]);
      }
    },
    meta: { height: H, trunkR, canopyY: base + (H - base) * 0.38, canopyR: R0 + 0.5, swayY0: base * 0.5, sway: 0.12 },
  };
}

// Tamarack: a narrow, airy cone of thin upswept branches carrying golden needle tufts.
function planTamarack(spec, v, rng, H) {
  const trunkR = 0.11 + H * spec.trunkK;
  const R0 = H * rng.range(0.18, 0.22);
  const T = LEAF_P[v.leaf], A = LEAF_P[v.alt ?? v.leaf];
  const base = rng.range(1.3, 2.0), top = H - 0.8;
  const env = (y) => R0 * Math.pow(clamp(1 - (y - base) / (top - base), 0, 1), 0.85) + 0.3;
  const branches = [], tufts = [];
  let phase = rng.range(0, TAU);
  for (let y = base; y < top - 0.3; y += rng.range(0.62, 0.85)) {
    const n = rng.int(3, 5), R = env(y);
    for (let k = 0; k < n; k++) {
      const a = phase + (k / n) * TAU + rng.range(-0.3, 0.3);
      const L = R * rng.range(0.8, 1.05), up = rng.range(0.15, 0.4);
      const e = [Math.cos(a) * L, y + L * up, Math.sin(a) * L];
      branches.push({ s: [0, y, 0], e, r: Math.max(0.04, trunkR * 0.28) });
      const P = rng.chance(0.2) ? A : T;
      for (let f = 0.4; f <= 1.0; f += rng.range(0.28, 0.4)) {
        const c = lerp3([0, y, 0], e, f);
        const r = (0.18 + 0.2 * (1 - f * 0.5)) * Math.min(1.2, 0.6 + R * 0.25);
        tufts.push({ c: [c[0], c[1] + 0.04, c[2]], rx: r, ry: r * 0.62, base: 1.8 + f * 0.5 + (y / H) * 0.6, P, seed: rng.int(0, 1e6) });
      }
    }
    phase += rng.range(0.8, 1.6);
  }
  tufts.push({ c: [0, top + 0.1, 0], rx: 0.35, ry: 0.6, base: 2.8, P: T, seed: rng.int(0, 1e6) });
  const roots = rootPlan(rng, trunkR, 3, 0.8);
  const falls = fallPlan(rng, rng.int(5, 9), R0 * 1.1, 0.5, base);
  const bseed = rng.int(0, 1e6);
  return {
    R: R0 + 1.6, H: H + 0.8, bury: 0.6,
    draw(g) {
      const bark = barkFn(BARK[spec.bark], bseed, { ridges: 6, twist: 0.03, moss: 0.5 });
      drawRoots(g, roots, bark);
      limb(g, [0, -0.6, 0], [0, 0.5, 0], trunkR * 1.35, trunkR, bark);
      limb(g, [0, 0.4, 0], [0, H, 0], trunkR, 0.04, bark);
      for (const b of branches) limb(g, b.s, b.e, b.r, b.r * 0.6, () => TWIG);
      for (const t of tufts) leafClump(g, t, { lump: 0.3, bump: 0.08, bf: 4.5, holes: 0.15, lf: 2.0, belly: 0.9, rag: 0.02, spark: 0.06 });
      fallingLeaves(g, falls, T);
    },
    meta: { height: H, trunkR, canopyY: base + (H - base) * 0.4, canopyR: R0 + 0.4, swayY0: base * 0.6, sway: 0.13 },
  };
}

// Eastern white pine: a tall bare trunk and flat, windswept shelves of needles.
function planPine(spec, v, rng, H) {
  const trunkR = 0.14 + H * spec.trunkK;
  const crownBase = H * rng.range(0.42, 0.5);
  const T = LEAF_P[v.leaf];
  const wind = rng.range(0, TAU);
  const nl = v.levels;
  const pads = [], limbs = [];
  let a0 = rng.range(0, TAU);
  for (let l = 0; l < nl; l++) {
    const t = l / Math.max(1, nl - 1);
    const y = crownBase + t * (H - crownBase - 2.0);
    const nb = rng.int(2, 3);
    for (let k = 0; k < nb; k++) {
      const a = a0 + (k / nb) * TAU + rng.range(-0.5, 0.5);
      const ws = 1 + 0.3 * Math.cos(a - wind);
      const L = H * 0.24 * (1 - t * 0.45) * rng.range(0.8, 1.05) * ws;
      const e = [Math.cos(a) * L, y + L * 0.12, Math.sin(a) * L];
      const m = [Math.cos(a) * L * 0.5, y + L * 0.02, Math.sin(a) * L * 0.5];
      limbs.push({ pts: [[0, y - 0.2, 0], m, e], r: trunkR * 0.4 });
      const R = Math.max(0.9, L * 0.42);
      pads.push({ c: [e[0] * 0.92, e[1] + 0.12, e[2] * 0.92], rx: R, ry: R * 0.32, rz: R * 0.9, base: 2.0 + t * 0.5, P: T, seed: rng.int(0, 1e6) });
      pads.push({ c: [e[0] * 0.6, e[1] + 0.05, e[2] * 0.6], rx: R * 0.75, ry: R * 0.3, base: 1.8 + t * 0.4, P: T, seed: rng.int(0, 1e6) });
      if (rng.chance(0.6)) pads.push({ c: [e[0] * 1.08 + rng.range(-0.3, 0.3), e[1] + 0.3, e[2] * 1.08 + rng.range(-0.3, 0.3)], rx: R * 0.55, ry: R * 0.3, base: 2.4, P: T, seed: rng.int(0, 1e6) });
    }
    a0 += Math.PI / 2 + rng.range(-0.4, 0.4);
  }
  // a flat-topped, slightly lopsided crown
  pads.push({ c: [Math.cos(wind) * 0.5, H - 1.3, Math.sin(wind) * 0.5], rx: 1.5, ry: 0.55, base: 2.6, P: T, seed: rng.int(0, 1e6) });
  pads.push({ c: [Math.cos(wind + 2) * 0.6, H - 0.8, Math.sin(wind + 2) * 0.6], rx: 0.9, ry: 0.45, base: 2.9, P: T, seed: rng.int(0, 1e6) });
  const stubs = [];
  for (let k = 0; k < rng.int(3, 6); k++) {
    const a = rng.range(0, TAU), sy = rng.range(1.2, crownBase - 0.5), L = rng.range(0.3, 0.8);
    stubs.push([[Math.cos(a) * trunkR, sy, Math.sin(a) * trunkR], [Math.cos(a) * (trunkR + L), sy - L * 0.2, Math.sin(a) * (trunkR + L)]]);
  }
  const roots = rootPlan(rng, trunkR, rng.int(4, 5), 1);
  const bseed = rng.int(0, 1e6);
  return {
    R: H * 0.36 + 2, H: H + 0.8, bury: 0.6,
    draw(g) {
      const bo = { ridges: 6, twist: 0.02, moss: 0.7 };
      const bark = barkFn(BARK[spec.bark], bseed, bo);
      drawRoots(g, roots, bark);
      limb(g, [0, -0.6, 0], [0, 0.6, 0], trunkR * 1.4, trunkR, bark, barkRelief(g.s, bseed, bo));
      limb(g, [0, 0.5, 0], [0, H - 0.6, 0], trunkR, trunkR * 0.35, bark, barkRelief(g.s, bseed, bo));
      for (const st of stubs) limb(g, st[0], st[1], 0.05, 0.035, () => TWIG);
      for (const l of limbs) bough(g, l.pts, [l.r, l.r * 0.7, l.r * 0.45], bark);
      for (const p of pads) leafClump(g, p, { lump: 0.3, holes: 0.22, lf: 1.6, belly: 1.4, rag: 0.025, patch: 1.0 });
    },
    meta: { height: H, trunkR, canopyY: (crownBase + H) * 0.5, canopyR: H * 0.24, swayY0: crownBase * 0.7, sway: 0.12 },
  };
}

function planDead(spec, v, rng, H) {
  const trunkR = 0.18 + H * spec.trunkK;
  const pts = [[0, 0, 0]];
  let x = 0, z = 0;
  const segs = 5;
  const lx = rng.range(-1, 1), lz = rng.range(-1, 1);
  for (let i = 1; i <= segs; i++) {
    x += rng.range(-0.35, 0.35) + lx * 0.15;
    z += rng.range(-0.35, 0.35) + lz * 0.15;
    pts.push([x, (H * 0.8 * i) / segs, z]);
  }
  const radii = pts.map((p, i) => trunkR * (1 - (i / segs) * 0.65));
  const branches = [];
  const a0 = rng.range(0, TAU);
  const nb = rng.int(5, 6);
  for (let b = 0; b < nb; b++) {
    const t = 0.38 + (b / nb) * 0.55;
    const s = along(pts, t);
    const a = a0 + b * 2.4 + rng.range(-0.3, 0.3);
    const L = H * rng.range(0.24, 0.34) * (1 - t * 0.25);
    const up = rng.range(0.15, 0.7);
    const k1 = [s[0] + Math.cos(a) * L * 0.55, s[1] + L * up * 0.55, s[2] + Math.sin(a) * L * 0.55];
    const a2 = a + rng.range(-0.7, 0.7);
    const k2 = [k1[0] + Math.cos(a2) * L * 0.5, k1[1] + L * (up - 0.25) * 0.5, k1[2] + Math.sin(a2) * L * 0.5];
    const br = { pts: [s, k1, k2], r: trunkR * (0.46 - t * 0.14), twigs: [] };
    // claws: crooked twigs reaching up and hanging down from the elbows
    for (let k = 0; k < rng.int(1, 3); k++) {
      const from = rng.chance(0.5) ? k1 : k2, a3 = a + rng.range(-1.5, 1.5), Lt = L * rng.range(0.22, 0.38);
      const dn = rng.chance(0.3) ? -1 : 1;
      br.twigs.push([from, [from[0] + Math.cos(a3) * Lt, from[1] + dn * Lt * rng.range(0.5, 1.0), from[2] + Math.sin(a3) * Lt]]);
    }
    branches.push(br);
  }
  const crown = [pts[segs], [pts[segs][0] + rng.range(-0.6, 0.6) + lx * 0.3, H, pts[segs][2] + rng.range(-0.6, 0.6) + lz * 0.3]];
  const roots = rootPlan(rng, trunkR, rng.int(4, 6), 1.2);
  const bseed = rng.int(0, 1e6), moss = rng.int(0, 1e6);
  const hole = { y: H * rng.range(0.22, 0.3), a: rng.range(0, TAU) };
  return {
    R: H * 0.5 + 1.5, H: H + 1, bury: 0.6,
    draw(g) {
      const B = BARK.dead;
      const bark = (x, y, z, t, ang) => {
        const m = vnoise(x * 1.8, y * 1.8, z * 1.8, moss);
        if (y < 0.7 && m > 0.52) return MOSS[1];
        if (m > 0.74) return LICHEN[m > 0.8 ? 1 : 0];
        const band = Math.floor(y / 1.1);
        const h = vhash(Math.floor((ang / TAU + 0.5) * 7 + band * 2), band, 9, bseed);
        return h < 0.45 ? B[2] : h < 0.75 ? B[1] : h < 0.92 ? B[3] : B[0];
      };
      drawRoots(g, roots, bark);
      limb(g, [0, -0.6, 0], [0, 0.6, 0], trunkR * 1.45, trunkR, bark);
      bough(g, pts, radii, bark);
      limb(g, crown[0], crown[1], radii[segs], 0.04, bark);
      for (const br of branches) {
        bough(g, br.pts, [br.r, br.r * 0.72, br.r * 0.42], bark);
        for (const tw of br.twigs) limb(g, tw[0], tw[1], br.r * 0.4, 0.035, bark);
      }
      // a dark knot hole (with something peering out of it on some trees)
      const p = along(pts, hole.y / (H * 0.8));
      const hx = p[0] + Math.cos(hole.a) * trunkR * 0.75, hz = p[2] + Math.sin(hole.a) * trunkR * 0.75;
      g.each(hx - 0.25, hole.y - 0.2, hz - 0.25, hx + 0.25, hole.y + 0.3, hz + 0.25, (x, y, z) => {
        const dx = x - hx, dz = z - hz, dy = (y - hole.y - 0.05) / 1.4;
        return dx * dx + dy * dy + dz * dz < 0.045 ? HOLE : 0;
      });
      if (v.eyes) {
        const ox = -Math.sin(hole.a) * 0.08, oz = Math.cos(hole.a) * 0.08;
        const ex = p[0] + Math.cos(hole.a) * trunkR * 0.82, ez = p[2] + Math.sin(hole.a) * trunkR * 0.82;
        g.put(ex + ox, hole.y + 0.06, ez + oz, 0xf0e070 | EMIT);
        g.put(ex - ox, hole.y + 0.06, ez - oz, 0xf0e070 | EMIT);
      }
    },
    meta: { height: H, trunkR, canopyY: H * 0.7, canopyR: H * 0.35, swayY0: H * 0.45, sway: 0.05 },
  };
}

function planBush(spec, v, rng, H) {
  const T = LEAF_P[v.leaf], A = LEAF_P[v.alt];
  const clumps = [];
  const n = rng.int(4, 6);
  const W = H * rng.range(0.75, 0.95);
  const a0 = rng.range(0, 6);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + rng.range(-0.4, 0.4);
    const d = i === 0 ? 0 : W * rng.range(0.38, 0.58);
    const r = i === 0 ? H * 0.46 : H * rng.range(0.3, 0.4);
    const cy = i === 0 ? H * 0.5 : r * rng.range(0.85, 1.25);
    clumps.push({ c: [Math.cos(a) * d, cy, Math.sin(a) * d], rx: r * 1.1, ry: r * 0.9, base: i === 0 ? 2.0 : rng.range(1.3, 1.9), P: i === n - 1 || rng.chance(0.2) ? A : T, seed: rng.int(0, 1e6) });
  }
  const stems = clumps.map((b) => ({ s: [b.c[0] * 0.2, -0.1, b.c[2] * 0.2], e: [b.c[0], b.c[1] - b.ry * 0.3, b.c[2]] }));
  const berries = [];
  if (v.berries) {
    for (let k = 0; k < rng.int(10, 18); k++) {
      const b = rng.pick(clumps), a = rng.range(0, TAU), el = rng.range(-0.2, 0.9);
      const rr = Math.sqrt(1 - el * el);
      berries.push([b.c[0] + Math.cos(a) * rr * b.rx * 0.95, b.c[1] + el * b.ry * 0.95, b.c[2] + Math.sin(a) * rr * b.rx * 0.95]);
    }
  }
  return {
    R: W + H * 0.7 + 0.4, H: H * 1.3 + 0.4, bury: 0.3,
    draw(g) {
      for (const st of stems) limb(g, st.s, st.e, 0.05, 0.035, () => BARK.stem[1]);
      for (const b of clumps) leafClump(g, b, { lump: 0.22, bump: 0.2, bf: 4.2, holes: 0.3, lf: 2.0, hf: 2.6, belly: 1.2, rag: 0.02, spark: 0.05 });
      for (const p of berries) {
        g.put(p[0], p[1], p[2], v.berries);
        g.put(p[0], p[1] + g.s, p[2], v.berries === 0x3a3a8a ? 0x6a6ab4 : 0xff7a6a, true);
      }
    },
    meta: { height: H, trunkR: 0, canopyY: H * 0.5, canopyR: W + H * 0.4, swayY0: 0.15, sway: 0.06 },
  };
}

// Bracken and ostrich ferns: a vase of arching blades, each a midrib lined with
// leaflets that are longest a third of the way out, rusty towards the tips.
function planFern(spec, v, rng, H) {
  const T = LEAF_P[v.leaf], A = LEAF_P[v.alt ?? v.leaf];
  const fronds = [];
  const n = rng.int(8, 11);
  const a0 = rng.range(0, TAU);
  for (let i = 0; i < n; i++) {
    const a = a0 + (i / n) * TAU + rng.range(-0.2, 0.2);
    const L = H * rng.range(1.05, 1.35);
    fronds.push({ a, L, rise: rng.range(1.55, 1.9), P: i % 3 === 0 ? A : T, w: L * rng.range(0.2, 0.26), tw: rng.range(-0.25, 0.25) });
  }
  return {
    R: H * 1.2 + 0.3, H: H * 0.9 + 0.3, bury: 0.15,
    draw(g) {
      const s = g.s;
      ball(g, [0, 0.02, 0], 0.08, () => T[0] | LEAF);
      for (const f of fronds) {
        const N = Math.ceil(f.L / (s * 0.5));
        let px = 0, py = 0.04, pz = 0;
        for (let k = 0; k <= N; k++) {
          const t = k / N;
          // the midrib leaves the crown steeply and arches over
          const ang = f.a + f.tw * t;
          const c = Math.cos(ang), sn = Math.sin(ang);
          const r = 0.03 + f.L * t * 0.66;
          const y = 0.04 + f.L * (f.rise * t - 1.2 * t * t);
          px = c * r; py = y; pz = sn * r;
          const tone = t < 0.2 ? 1 : t < 0.65 ? 2 : 3;
          g.put(px, py, pz, f.P[tone - 1] | LEAF);
          const wl = f.w * Math.sin(Math.min(1, t * 1.5) * Math.PI) * (t > 0.08 ? 1 : 0);
          if (wl < s * 0.5) continue;
          const m = Math.ceil(wl / (s * 0.8));
          for (const sd of [-1, 1]) {
            for (let q = 1; q <= m; q++) {
              const u = (q / m) * wl;
              const lx = px + c * u * 0.3 - sn * sd * u, lz = pz + sn * u * 0.3 + c * sd * u;
              const tq = tone + (q === m ? 1 : 0) + (sd > 0 ? 0 : -0.4);
              g.put(lx, py - u * 0.3, lz, f.P[ci(tq)] | LEAF, true);
            }
          }
        }
      }
    },
    meta: { height: H * 0.62, trunkR: 0, canopyY: H * 0.4, canopyR: H * 1.1, swayY0: 0.05, sway: 0.08 },
  };
}

// A cluster of mushrooms: fly agarics, fat boletes or a crowd of tiny caps.
function planMushroom(spec, v, rng, H) {
  const shrooms = [];
  const n = v.type === 'tiny' ? rng.int(6, 9) : rng.int(2, 4);
  for (let i = 0; i < n; i++) {
    const kind = v.type === 'mixed' ? (i === 0 ? 'agaric' : rng.chance(0.5) ? 'bolete' : 'tiny') : v.type;
    const k = kind === 'tiny' ? rng.range(0.25, 0.45) : i === 0 ? 1 : rng.range(0.5, 0.85);
    const a = rng.range(0, TAU), d = i === 0 ? 0 : rng.range(0.08, 0.3) * (kind === 'tiny' ? 1.2 : 1);
    shrooms.push({ kind, x: Math.cos(a) * d, z: Math.sin(a) * d, h: H * k, cap: H * k * (kind === 'bolete' ? 0.62 : kind === 'tiny' ? 0.7 : 0.55), tilt: rng.range(-0.06, 0.06), seed: rng.int(0, 1e6) });
  }
  return {
    R: 0.6, H: H * 1.2 + 0.15, bury: 0.1,
    draw(g) {
      for (const m of shrooms) {
        const capCol = m.kind === 'agaric' ? [0x9a1a16, 0xc8261c, 0xe4402a] : m.kind === 'bolete' ? [0x5e3a1e, 0x80522a, 0x9e6a36] : [0xa8885a, 0xc8a878, 0xe0c898];
        const stemR = m.kind === 'bolete' ? m.cap * 0.42 : m.cap * 0.22;
        const sx = m.x + m.tilt * m.h, sz = m.z;
        limb(g, [m.x, -0.05, m.z], [sx, m.h * 0.9, sz], stemR * (m.kind === 'bolete' ? 1.25 : 1.1), stemR * 0.85, (x, y) => (y < m.h * 0.12 ? 0xb8a888 : 0xeee2c6));
        if (m.kind === 'agaric') {
          // the white skirt under the cap
          g.each(sx - stemR * 1.6, m.h * 0.62, sz - stemR * 1.6, sx + stemR * 1.6, m.h * 0.68, sz + stemR * 1.6, (x, y, z) => ((x - sx) ** 2 + (z - sz) ** 2 < (stemR * 1.6) ** 2 ? 0xf6eedc : 0));
        }
        const cy = m.h * 0.86, cr = m.cap, ch = cr * (m.kind === 'tiny' ? 0.75 : 0.62);
        g.each(sx - cr, cy - ch * 0.25, sz - cr, sx + cr, cy + ch, sz + cr, (x, y, z, i, j, k) => {
          const dx = (x - sx) / cr, dz = (z - sz) / cr, dy = (y - cy) / ch;
          if (dy < -0.25) return 0;
          const e = dx * dx + dz * dz + Math.max(0, dy) * Math.max(0, dy);
          if (e > 1) return 0;
          if (dy < 0.05 && e > 0.25) return 0xd8c8a0; // gills under the rim
          if (m.kind === 'agaric' && dy > 0.15 && vhash(Math.floor(x * 9), Math.floor(y * 9), Math.floor(z * 9), m.seed) < 0.12) return 0xfff2dc;
          return capCol[dy > 0.55 ? 2 : dy > 0.15 ? 1 : 0];
        });
      }
    },
    meta: { height: H, trunkR: 0, canopyY: H * 0.6, canopyR: 0.3, swayY0: 0, sway: 0 },
  };
}

// A cut stump: growth rings and cracks on top, bark plates and moss on the side,
// a shelf fungus, sometimes a hollow or a forgotten axe.
function planStump(spec, v, rng, H) {
  const r = rng.range(0.28, 0.42);
  const slant = v.axe ? 0 : rng.range(-0.08, 0.08);
  const roots = rootPlan(rng, r * 0.8, rng.int(3, 5), 0.55);
  const shelf = { a: rng.range(0, TAU), y: H * rng.range(0.35, 0.6) };
  const bseed = rng.int(0, 1e6), wseed = rng.int(0, 1e6);
  const axeA = rng.range(0, TAU);
  return {
    R: r * 3.4 + 0.5, H: H + (v.axe ? 0.9 : 0.3), bury: 0.3,
    draw(g) {
      const s = g.s;
      const bark = barkFn(BARK.oak, bseed, { ridges: 9, twist: 0.1, moss: 0.35, mossA: shelf.a + 2 });
      drawRoots(g, roots, bark);
      const topY = (x) => H + slant * (x / r);
      g.each(-r * 1.3, -0.3, -r * 1.3, r * 1.3, H + 0.2, r * 1.3, (x, y, z) => {
        const d = Math.sqrt(x * x + z * z);
        const rr = r * (1 + 0.28 * Math.max(0, 1 - (y + 0.3) / 0.6));
        if (d > rr || y > topY(x)) return 0;
        const ang = Math.atan2(z, x);
        if (v.hollow && d < r * 0.55 && y > H * 0.3) return CLEAR;
        if (d > rr - s * 1.3) return bark(x, y, z, 0, ang);
        if (y > topY(x) - s * 1.2) {
          // the cut face
          if (vnoise(ang * 1.2, 0.5, 0.5, wseed) > 0.82 && d > r * 0.15) return WOOD[0]; // radial crack
          const ring = Math.floor((d / r) * 7 + vnoise(x * 4, z * 4, 0.5, wseed) * 0.8);
          if (d < r * 0.1) return WOOD[1];
          return ring % 2 ? WOOD[2] : WOOD[3];
        }
        return WOOD[1];
      });
      // shelf fungus
      const fx = Math.cos(shelf.a) * r, fz = Math.sin(shelf.a) * r;
      for (let k = 0; k < 2; k++) {
        const yy = shelf.y - k * 0.12, rr = 0.16 - k * 0.04;
        g.each(fx - rr, yy, fz - rr, fx + rr, yy + s, fz + rr, (x, y, z) => {
          const dx = x - fx, dz = z - fz;
          if (dx * dx + dz * dz > rr * rr || dx * Math.cos(shelf.a) + dz * Math.sin(shelf.a) < -0.02) return 0;
          return FUNGUS[Math.hypot(dx, dz) > rr * 0.7 ? 3 : 2];
        });
      }
      if (v.axe) {
        // Hank's old axe, buried in the stump where he left it
        const ux = Math.cos(axeA), uz = Math.sin(axeA);
        limb(g, [ux * 0.06, H - 0.02, uz * 0.06], [ux * 0.5, H + 0.72, uz * 0.5], 0.045, 0.04, (x, y) => (y > H + 0.6 ? 0x4a3020 : 0xa8743e));
        g.each(-0.3, H - 0.16, -0.3, 0.3, H + 0.16, 0.3, (x, y, z) => {
          const along = x * ux + z * uz, side = -x * uz + z * ux;
          if (Math.abs(side) > 0.045 || along < -0.24 || along > 0.12 || Math.abs(y - H) > 0.13 - (along < -0.1 ? 0 : 0.05)) return 0;
          return along < -0.18 ? 0xe8eef0 : along < -0.1 ? 0xa8b2b8 : 0x6a747c;
        });
      }
    },
    meta: { height: H, trunkR: r, canopyY: H * 0.5, canopyR: r * 1.2, swayY0: 0, sway: 0 },
  };
}

// A fallen log lying along x: mossy bark on top, cut rings on one end, a broken
// end on the other, branch stubs, shelf fungus and things growing on it.
function planLog(spec, v, rng, H) {
  const L = H, r = rng.range(0.24, 0.36);
  const stubs = [];
  for (let k = 0; k < rng.int(2, 4); k++) {
    const x = rng.range(-L * 0.35, L * 0.35), a = rng.range(-0.4, Math.PI + 0.4);
    stubs.push({ x, a, len: rng.range(0.25, 0.55) });
  }
  const shelves = [];
  for (let k = 0; k < rng.int(2, 4); k++) shelves.push({ x: rng.range(-L * 0.4, L * 0.4), a: rng.range(-1.2, 1.2) + (rng.chance(0.5) ? Math.PI : 0) });
  const sprouts = [];
  if (v.ferns) for (let k = 0; k < 3; k++) sprouts.push({ x: rng.range(-L * 0.35, L * 0.35), a: rng.range(0, TAU) });
  const bseed = rng.int(0, 1e6), mseed = rng.int(0, 1e6), wseed = rng.int(0, 1e6);
  const cy = r * 0.82;
  return {
    R: L * 0.5 + 0.8, H: r * 2 + 0.8, bury: 0.3,
    draw(g) {
      const s = g.s;
      const B = BARK.oak;
      g.each(-L / 2, cy - r, -r, L / 2, cy + r, r, (x, y, z) => {
        const dy = y - cy, d = Math.sqrt(dy * dy + z * z);
        // broken end: jagged splinters
        let x1 = L / 2;
        if (v.broken) x1 -= vnoise(dy * 6, z * 6, 0.5, wseed) * 0.5;
        if (d > r || x > x1) return 0;
        if (x < -L / 2 + s * 1.2) {
          // cut end: rings
          if (d < r - s) return Math.floor((d / r) * 6) % 2 ? WOOD[2] : WOOD[1];
          return B[1];
        }
        const ang = Math.atan2(dy, z);
        if (d > r - s * 1.3) {
          const m = vnoise(x * 2, y * 2, z * 2, mseed);
          if (dy > r * 0.3 && m > 0.6 - (dy / r) * 0.22) return MOSS[m > 0.72 ? 2 : m > 0.64 ? 1 : 0];
          const u = (ang / TAU + 0.5) * 11 + vnoise(x * 0.8, 0.5, 0.5, bseed) * 0.8;
          if (u - Math.floor(u) < 0.2) return B[0];
          const h = vhash(Math.floor(u), Math.floor(x / 0.7), 3, bseed);
          return h < 0.5 ? B[2] : h < 0.8 ? B[1] : B[3];
        }
        return x > x1 - s * 2 ? WOOD[2] : WOOD[1];
      });
      for (const st of stubs) {
        const ux = Math.cos(st.a), uy = Math.sin(st.a);
        limb(g, [st.x, cy + uy * r * 0.5, ux * r * 0.5], [st.x + 0.1, cy + uy * (r + st.len), ux * (r + st.len)], 0.07, 0.05, (x, y, z, t) => (t > 0.85 ? WOOD[2] : B[1]));
      }
      for (const sh of shelves) {
        const zz = Math.cos(sh.a) * r, yy = cy + Math.sin(sh.a) * r * 0.4;
        g.each(sh.x - 0.16, yy, zz - 0.16, sh.x + 0.16, yy + s * 0.9, zz + 0.16, (x, y, z) => {
          const dx = x - sh.x, dz = z - zz;
          if (dx * dx + dz * dz > 0.025 || dz * Math.sign(Math.cos(sh.a)) < 0) return 0;
          return FUNGUS[Math.hypot(dx, dz) > 0.11 ? 3 : 1];
        });
      }
      for (const sp of sprouts) {
        const base = [sp.x, cy + r - 0.02, 0];
        for (let k = 0; k < 4; k++) {
          const a = sp.a + k * 1.6;
          limb(g, base, [base[0] + Math.cos(a) * 0.35, base[1] + 0.3, Math.sin(a) * 0.35], 0.05, 0.04, () => LEAF_P.bracken[2 + (k & 1)] | LEAF);
        }
      }
    },
    meta: { height: cy + r, trunkR: r, canopyY: cy, canopyR: L * 0.5, swayY0: 0, sway: 0, length: L, radius: r },
  };
}

// Young trees: a whippy maple or birch with a few leaf tufts, or a tiny spruce.
function planSapling(spec, v, rng, H) {
  const T = LEAF_P[v.leaf];
  const stemR = 0.035 + H * 0.01;
  const lean = [rng.range(-0.12, 0.12), rng.range(-0.12, 0.12)];
  const tufts = [], twigs = [];
  if (v.type === 'spruce') {
    const tiers = [];
    for (let y = H - 0.15, k = 0; y > 0.25; y -= rng.range(0.16, 0.22), k++) {
      const R = 0.12 + (H - y) * 0.36;
      tiers.push({ y, R, phase: rng.range(0, TAU) });
    }
    return {
      R: H * 0.5 + 0.4, H: H + 0.3, bury: 0.15,
      draw(g) {
        const s = g.s;
        limb(g, [0, -0.1, 0], [0, H, 0], stemR, 0.02, () => BARK.spruce[2]);
        for (const ti of tiers) {
          g.each(-ti.R, ti.y - 0.2, -ti.R, ti.R, ti.y, ti.R, (x, y, z) => {
            const d = Math.hypot(x, z), th = Math.atan2(z, x);
            const Rt = ti.R * (1 + 0.15 * Math.cos(6 * th + ti.phase));
            if (d > Rt) return 0;
            const u = d / Rt, yt = ti.y - u * u * 0.08, yb = yt - 0.1 * (1 - 0.5 * u) - s * 0.5;
            if (y > yt || y < yb) return 0;
            return T[ci(yt - y < s ? 3 : 1.5)] | LEAF;
          });
        }
      },
      meta: { height: H, trunkR: stemR, canopyY: H * 0.5, canopyR: H * 0.4, swayY0: 0.2, sway: 0.08 },
    };
  }
  const top = [lean[0] * H, H * 0.92, lean[1] * H];
  for (let k = 0; k < rng.int(3, 5); k++) {
    const t = rng.range(0.45, 0.9), a = rng.range(0, TAU), L = H * rng.range(0.18, 0.3);
    const s = [top[0] * t, top[1] * t, top[2] * t];
    const e = [s[0] + Math.cos(a) * L, s[1] + L * 0.6, s[2] + Math.sin(a) * L];
    twigs.push({ s, e });
    tufts.push({ c: e, rx: H * rng.range(0.1, 0.15), ry: H * 0.09, base: rng.range(1.6, 2.4), P: T, seed: rng.int(0, 1e6) });
  }
  tufts.push({ c: top, rx: H * 0.14, ry: H * 0.12, base: 2.4, P: T, seed: rng.int(0, 1e6) });
  const birch = v.type === 'birch';
  return {
    R: H * 0.5 + 0.4, H: H + 0.4, bury: 0.15,
    draw(g) {
      const stem = birch ? (x, y) => (vhash(0, Math.floor(y * 14), 0, 7) < 0.2 ? 0x2a2422 : 0xe6e0d2) : () => BARK.stem[2];
      limb(g, [0, -0.1, 0], top, stemR, stemR * 0.5, stem);
      for (const tw of twigs) limb(g, tw.s, tw.e, 0.02, 0.016, birch ? () => TWIG : () => BARK.stem[1]);
      for (const t of tufts) leafClump(g, t, { lump: 0.25, holes: 0.2, lf: 4, hf: 7, belly: 1.0, rag: 0.03 });
    },
    meta: { height: H, trunkR: stemR, canopyY: H * 0.7, canopyR: H * 0.35, swayY0: 0.1, sway: 0.1 },
  };
}

const PLANNERS = { broad: planBroad, slim: planSlim, conifer: planConifer, tamarack: planTamarack, pine: planPine, dead: planDead, bush: planBush, fern: planFern, mushroom: planMushroom, stump: planStump, log: planLog, sapling: planSapling };

// ---------------------------------------------------------------- grid passes
// Fill enclosed air pockets (they are invisible but would still cost faces).
function fillCavities(vox) {
  const { w, h, d, data } = vox;
  const N = w * h * d;
  const seen = new Uint8Array(N);
  const stack = new Int32Array(N);
  let sp = 0;
  const push = (i) => { if (!seen[i] && !data[i]) { seen[i] = 1; stack[sp++] = i; } };
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) { push(w * (y + h * z)); push(w - 1 + w * (y + h * z)); }
  for (let z = 0; z < d; z++) for (let x = 0; x < w; x++) { push(x + w * h * z); push(x + w * (h - 1 + h * z)); }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { push(x + w * y); push(x + w * (y + h * (d - 1))); }
  const wh = w * h;
  while (sp) {
    const i = stack[--sp];
    const x = i % w, y = ((i / w) | 0) % h, z = (i / wh) | 0;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (y > 0) push(i - w);
    if (y < h - 1) push(i + w);
    if (z > 0) push(i - wh);
    if (z < d - 1) push(i + wh);
  }
  for (let i = 0; i < N; i++) {
    if (data[i] || seen[i]) continue;
    const x = i % w, y = ((i / w) | 0) % h, z = (i / wh) | 0;
    data[i] = (x > 0 && data[i - 1]) || (x < w - 1 && data[i + 1]) || (y > 0 && data[i - w]) || (y < h - 1 && data[i + w]) || (z > 0 && data[i - wh]) || (z < d - 1 && data[i + wh]) || data[i];
  }
}

// 2:1 box filter. A coarse voxel is solid when `need` of its 8 children are (or
// when 2 are wood and keepWood is set, so branches survive one step); it takes
// the most common child colour, wood winning over leaves when wood dominates.
function downsample(src, need, keepWood) {
  const w = src.w >> 1, h = src.h >> 1, d = src.d >> 1;
  const out = new Vox(w, h, d);
  const S = src.data, W = src.w, WH = src.w * src.h;
  const cols = new Uint32Array(8), cnt = new Uint8Array(8);
  const O = out.data;
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0, wood = 0, m = 0;
    const base = 2 * x + W * 2 * y + WH * 2 * z;
    for (let q = 0; q < 8; q++) {
      const c = S[base + (q & 1) + (q & 2 ? W : 0) + (q & 4 ? WH : 0)];
      if (!c) continue;
      n++;
      if (!(c & LEAF)) wood++;
      let f = -1;
      for (let k = 0; k < m; k++) if (cols[k] === c) { f = k; break; }
      if (f < 0) { cols[m] = c; cnt[m++] = 1; } else cnt[f]++;
    }
    if (n < need && !(keepWood && wood >= 2)) continue;
    const preferWood = wood * 2 >= n;
    let best = -1, bc = 0;
    for (let k = 0; k < m; k++) {
      const isWood = !(cols[k] & LEAF);
      const score = cnt[k] * 4 + (isWood === preferWood ? 2 : 0) + (cols[k] & FALL ? -8 : 0);
      if (score > best) { best = score; bc = cols[k]; }
    }
    O[x + w * (y + h * z)] = (bc & ~FALL) >>> 0;
  }
  return out;
}

// Far-LOD cleanup: fill notches, drop specks and recolour single-voxel colour
// specks to their neighbours' majority. Keeps the silhouette, removes little steps.
function simplifyFar(vox, passes = 1) {
  const { w, h, d } = vox;
  const nbs = new Uint32Array(6);
  for (let p = 0; p < passes; p++) {
    const out = vox.data.slice();
    for (let z = 0; z < d; z++) for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) {
      const i = vox.idx(x, y, z), c = vox.data[i];
      nbs[0] = vox.get(x + 1, y, z); nbs[1] = vox.get(x - 1, y, z); nbs[2] = vox.get(x, y + 1, z);
      nbs[3] = vox.get(x, y - 1, z); nbs[4] = vox.get(x, y, z + 1); nbs[5] = vox.get(x, y, z - 1);
      let solid = 0, same = 0, best = 0, bc = 0;
      for (let k = 0; k < 6; k++) {
        const nc = nbs[k];
        if (!nc) continue;
        solid++;
        if (nc === c) same++;
        let m = 0;
        for (let q = 0; q < 6; q++) if (nbs[q] === nc) m++;
        if (m > best) { best = m; bc = nc; }
      }
      if (!c && solid >= 5) out[i] = bc;
      else if (c && solid <= 1 && y > h * 0.12) out[i] = 0;
      else if (c && !same && best >= 3) out[i] = bc;
    }
    vox.data.set(out);
  }
}

// Crop to the filled bounds on a 4-voxel lattice (so the pivot stays on a voxel
// corner through two 2:1 box filters); the pivot moves to (g.ox, g.oy, g.oz).
function crop4(g) {
  const v = g.vox, b = v.bounds();
  if (b.x1 < 0) return;
  const lo = (a) => Math.max(0, Math.floor(a / 4) * 4), hi = (a, n) => Math.min(n, Math.ceil((a + 1) / 4) * 4);
  const x0 = lo(b.x0), y0 = lo(b.y0), z0 = lo(b.z0), x1 = hi(b.x1, v.w), y1 = hi(b.y1, v.h), z1 = hi(b.z1, v.d);
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  if (w === v.w && h === v.h && d === v.d) return;
  const out = new Vox(w, h, d);
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) {
    const so = v.idx(x0, y0 + y, z0 + z);
    out.data.set(v.data.subarray(so, so + w), out.idx(0, y, z));
  }
  g.vox = out;
  g.ox = g.n - x0; g.oy = g.b - y0; g.oz = g.n - z0;
}

// ---------------------------------------------------------------- public API
function plan(species, seed, height) {
  const spec = SPECS[species];
  if (!spec) throw new Error(`buildTree: unknown species "${species}"`);
  const nv = spec.variants.length;
  const variant = ((seed % nv) + nv) % nv;
  const v = spec.variants[variant];
  const rng = makeRng(strHash(species) ^ Math.imul(seed + 1, 2654435761));
  const H = height ?? rng.range(spec.h[0], spec.h[1]);
  return { spec, variant, p: PLANNERS[spec.kind](spec, v, rng, H) };
}

// all LODs of one model; lods = how many (1..3)
export function buildTreeLods(species, { seed = 0, height, lods = 3 } = {}) {
  const { spec, variant, p } = plan(species, seed, height);
  const s = TREE_INFO[species].size;
  const g = new Grid(s, p.R, p.H, p.bury);
  p.draw(g);
  g.ox = g.n; g.oy = g.b; g.oz = g.n;
  crop4(g);
  fillCavities(g.vox);
  const fine = spec.kind === 'fern' || spec.kind === 'sapling' || spec.kind === 'mushroom';
  let o = [g.ox, g.oy, g.oz];
  const out = [{ vox: g.vox, size: s, origin: o }];
  let src = g.vox, size = s;
  for (let l = 1; l < lods; l++) {
    src = downsample(src, fine ? (l === 1 ? 2 : 3) : 3, l === 1);
    size *= 2;
    o = [o[0] / 2, o[1] / 2, o[2] / 2];
    simplifyFar(src, l);
    fillCavities(src);
    out.push({ vox: src, size, origin: o });
  }
  const b = g.vox.bounds();
  const meta = { ...p.meta, height: (b.y1 + 1 - g.oy) * s, variant, kind: spec.kind };
  return { lods: out, meta };
}

// one LOD (previews, props): lod 0 = finest
export function buildTree(species, { seed = 0, lod = 0, height } = {}) {
  const r = buildTreeLods(species, { seed, height, lods: lod + 1 });
  const L = r.lods[lod];
  return { vox: L.vox, size: L.size, origin: L.origin, jitter: 0, meta: r.meta };
}

export const PREVIEW = {};
for (const sp of TREE_SPECIES) {
  for (let v = 0; v < TREE_INFO[sp].variants; v++) PREVIEW[`${sp}_${v}`] = () => buildTree(sp, { seed: v });
}
