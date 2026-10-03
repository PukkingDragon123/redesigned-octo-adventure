// Voxel buildings for Maple Cove & the homestead (0.125 m voxels).
//
// buildVoxelBuilding(spec) turns a layout.js BUILDINGS entry into a voxel model:
//   spec: { id, kind, w, d, floors, color, roof, porch, chimney, stilts, sign,
//           stilt?: metres of stilt below the floor, halloween?: bool (default true), seed? }
//   returns { vox, size: 0.125, origin, jitter: 0, meta }
//
// Local frame: +z is the front (door side), y is up, the origin is the bottom-centre
// of the footprint at FLOOR level (y = 0 is the floor / porch deck the door opens onto).
// Everything in meta is in metres in that frame:
//   door {x,y,z}         centre of the main doorway threshold, just outside
//   footprint {w,d}      the house body (porches, steps, yards stick out beyond it)
//   height               top of the model above the floor; depth: lowest point (<= 0)
//   ground               assumed yard level below the floor (0 for stilt houses)
//   lights [{x,y,z,color:[r,g,b],radius,kind}]   kind: porch|window|string|lantern|beacon
//   smoke [{x,y,z}]      chimney tops
//   signs [{x,y,z,w,h,text,normal,bg,fg}]  plain boards; draw text on a plane at (x,y,z)
//   porch [{x0,z0,x1,z1,y}]  walkable decks
//   solids [{x0,y0,z0,x1,y1,z1}]  coarse collision boxes (body, tower, ...)
import { Vox, EMIT, GLASS, tone, mixc, vhash } from '../vox.js';
import { BUILDINGS } from '../../world/layout.js';

const K = 2; // fine voxels per coarse layout voxel
export const VOXEL_SIZE = 0.125 / K; // the models are stored at 1/16 m
const VPM = 8; // coarse (layout) voxels per metre
const FH = 22; // floor-to-floor height (voxels)

// ------------------------------------------------------------------ palette
const P = {
  trim: 0xf2e8d4, trimShade: 0xdcd0b8,
  glass: 0x27354e, glassHi: 0x46597c,
  iron: 0x2c282e, metal: 0x5c6068, metalL: 0x8a9098, brass: 0xdcae44,
  lamp: 0xffd27a | EMIT, lampHot: 0xfff0c0 | EMIT,
  wood: 0x8a5a34, woodDark: 0x5c3c26, woodDD: 0x40281a, woodLight: 0xb4834e,
  plank: 0x9c6e44, plankB: 0x8c6240, plankC: 0xa87a4c,
  grey: 0x8c8478, greyD: 0x6c665e, greyL: 0xa69e90,
  stone: 0x8e8c88, stoneB: 0x7a7874, stoneC: 0xa4a098, stoneD: 0x64625e,
  brick: 0xa4483a, brickB: 0x8e3c30, brickC: 0xb65a44, mortar: 0xc4b6a0,
  pumpkin: 0xe8741e, pumpkinB: 0xc85c16, pumpkinL: 0xf4903a, stem: 0x6a6a2c,
  glow: 0xffb43c | EMIT, glowHot: 0xffd870 | EMIT,
  bulbO: 0xff8a24 | EMIT, bulbP: 0xb05cff | EMIT, bulbW: 0xfff0c4 | EMIT, bulbG: 0x9cff5a | EMIT, wire: 0x2a2630,
  bat: 0x2c2034, web: 0xdedad4, ghost: 0xf4efe6, ghostB: 0xdcd6cc, eye: 0x2a1e26,
  hay: 0xd9b558, hayB: 0xc09c40, hayC: 0xeacf7e, twine: 0x8a6a3c,
  corn: 0xcab474, cornB: 0xa88e54, cornC: 0xe2d29a, cornEar: 0xe8b23a,
  tomb: 0x9c9ca4, tombB: 0x80808a, tombC: 0xb6b6bc, tombD: 0x5e5e68, moss: 0x5f8236, mossB: 0x7c9c40, mossC: 0x4a6a2c,
  leaf: 0x4c7c34, leafB: 0x3c6428, mums: [0xe8782a, 0xcc4a2a, 0xeab432, 0xa83848, 0xf09a3a],
  hat: 0x2e2238, hatB: 0x3e2e4c, hatBand: 0x9a5ac8,
  soil: 0x4c3424, cream: 0xf0e4c8, chalk: 0x2e3c36, chalkLine: 0xe4e6dc,
  red: 0xc0392b, redD: 0x8e2a22, white: 0xf2ece0, navy: 0x2c3c64,
  steel: 0xc6cad2, steelD: 0x8e949e,
  apple: 0xc8302a, appleG: 0x8cb43c, squash: 0xe8c040, squashG: 0x4c7a3a,
  cauldron: 0x2e2c34, brew: 0x7aff4a | EMIT,
};
// The town is dressed for the harvest, not for Halloween: carved jack-o'-lanterns, bats, cobwebs,
// ghosts, witches' hats, spiders, cauldrons and lawn tombstones stay off unless this is flipped.
const SPOOKY = false;
const SIDING = { red: 0xa63a30, teal: 0x3a9690, blue: 0x5080b6, white: 0xe8dfca, yellow: 0xe4ba50, green: 0x5f9a58, log: 0x8a5a34, weathered: 0x8c8478, pink: 0xe6a0ae, brick: 0xa4483a };
const DOORC = { red: 0x2e5a40, teal: 0xb03e2a, blue: 0xe8b84a, yellow: 0x34528a, white: 0x2e5a7a, green: 0xc89a48, log: 0x3a6a4a, weathered: 0x6a4a2a, pink: 0x6a3a2a, brick: 0x2e5a40 };
const SHUTC = { red: 0x2e4a3a, teal: 0xf0e6d0, blue: 0x283a5c, yellow: 0x3a6a4a, white: 0x2e5a7a, green: 0xf0e6d0, log: 0x3a6a4a, weathered: 0x5c4a3a, pink: 0xf2e8d4, brick: 0x2e4a3a };
const ROOFC = { dark: 0x4c4856, red: 0x9c3c32, green: 0x4a6e4a, moss: 0x5a6640, rust: 0x9a5832 };
const CURTAINS = [0xe8d8b0, 0xc8504a, 0xe8c070, 0x8a6aa8, 0xf0e8dc, 0x6a9a7a];

// ------------------------------------------------------------------ small utils
const r3 = (v) => Math.round(v * 1000) / 1000;
const M3 = (x, y, z) => ({ x: r3(x / VPM), y: r3(y / VPM), z: r3(z / VPM) });
const evenV = (m) => Math.max(2, Math.round(m * VPM / 2) * 2);
const hexs = (c) => '#' + (c & 0xffffff).toString(16).padStart(6, '0');
function strHash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mkRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// smooth 2D value noise in [0,1)
function vnoise(x, y, s, seed = 0) {
  const fx = x / s, fy = y / s, ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy, sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = vhash(ix, iy, 0, seed), b = vhash(ix + 1, iy, 0, seed), c = vhash(ix, iy + 1, 0, seed), d = vhash(ix + 1, iy + 1, 0, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
const pick = (arr, h) => arr[Math.min(arr.length - 1, Math.floor(h * arr.length))];
function addLight(ctx, p, color, radius, kind) {
  ctx.lights.push({ ...M3(p[0], p[1], p[2]), color, radius, kind });
}

// ------------------------------------------------------------------ builder (local voxel coords, may be negative)
// Layout coordinates are "coarse" voxels (1/8 m, VPM per metre): every builder below places walls,
// doors and windows in them. The model itself is stored at K x that resolution (1/16 m "fine"
// voxels): a coarse set() paints a 2x2x2 block, and the f*() calls paint single fine voxels for
// the small stuff (lap siding, mullions, shingle butts, knobs...). Storage is a sparse grid of
// 16^3 bricks, so the generous bounds given to the constructor cost nothing until painted.
class VB {
  constructor(x0, y0, z0, x1, y1, z1) {
    this.x0 = Math.floor(x0); this.y0 = Math.floor(y0); this.z0 = Math.floor(z0);
    this.fx0 = this.x0 * K; this.fy0 = this.y0 * K; this.fz0 = this.z0 * K;
    this.FW = (Math.ceil(x1) - this.x0 + 1) * K; this.FH = (Math.ceil(y1) - this.y0 + 1) * K; this.FD = (Math.ceil(z1) - this.z0 + 1) * K;
    this.bw = (this.FW + 15) >> 4; this.bh = (this.FH + 15) >> 4; this.bd = (this.FD + 15) >> 4;
    this.bricks = new Array(this.bw * this.bh * this.bd).fill(null);
    this.bb = null; // painted bounds (fine, local)
  }
  _grow(lx, ly, lz, ex) {
    const bb = this.bb || (this.bb = [lx, ly, lz, lx + ex, ly + ex, lz + ex]);
    if (lx < bb[0]) bb[0] = lx; if (ly < bb[1]) bb[1] = ly; if (lz < bb[2]) bb[2] = lz;
    if (lx + ex > bb[3]) bb[3] = lx + ex; if (ly + ex > bb[4]) bb[4] = ly + ex; if (lz + ex > bb[5]) bb[5] = lz + ex;
  }
  // ---- fine voxels
  fset(X, Y, Z, c) {
    const lx = Math.round(X) - this.fx0, ly = Math.round(Y) - this.fy0, lz = Math.round(Z) - this.fz0;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= this.FW || ly >= this.FH || lz >= this.FD) return;
    const bi = (lx >> 4) + this.bw * ((ly >> 4) + this.bh * (lz >> 4));
    let br = this.bricks[bi];
    if (!br) { if (!c) return; br = this.bricks[bi] = new Uint32Array(4096); }
    br[(lx & 15) | ((ly & 15) << 4) | ((lz & 15) << 8)] = c >>> 0;
    if (c) this._grow(lx, ly, lz, 0);
  }
  fget(X, Y, Z) {
    const lx = Math.round(X) - this.fx0, ly = Math.round(Y) - this.fy0, lz = Math.round(Z) - this.fz0;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= this.FW || ly >= this.FH || lz >= this.FD) return 0;
    const br = this.bricks[(lx >> 4) + this.bw * ((ly >> 4) + this.bh * (lz >> 4))];
    return br ? br[(lx & 15) | ((ly & 15) << 4) | ((lz & 15) << 8)] : 0;
  }
  ffill(X0, Y0, Z0, X1, Y1, Z1, c) {
    const ax = Math.round(Math.min(X0, X1)), bx = Math.round(Math.max(X0, X1));
    const ay = Math.round(Math.min(Y0, Y1)), by = Math.round(Math.max(Y0, Y1));
    const az = Math.round(Math.min(Z0, Z1)), bz = Math.round(Math.max(Z0, Z1));
    const fn = typeof c === 'function';
    for (let z = az; z <= bz; z++) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
      const v = fn ? c(x, y, z) : c;
      if (v) this.fset(x, y, z, v);
    }
  }
  fclear(X0, Y0, Z0, X1, Y1, Z1) {
    for (let z = Math.min(Z0, Z1); z <= Math.max(Z0, Z1); z++) for (let y = Math.min(Y0, Y1); y <= Math.max(Y0, Y1); y++) for (let x = Math.min(X0, X1); x <= Math.max(X0, X1); x++) this.fset(x, y, z, 0);
  }
  // ---- coarse voxels (2x2x2 fine blocks)
  set(x, y, z, c) {
    const lx = Math.round(x) * K - this.fx0, ly = Math.round(y) * K - this.fy0, lz = Math.round(z) * K - this.fz0;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= this.FW || ly >= this.FH || lz >= this.FD) return;
    const bi = (lx >> 4) + this.bw * ((ly >> 4) + this.bh * (lz >> 4));
    let br = this.bricks[bi];
    if (!br) { if (!c) return; br = this.bricks[bi] = new Uint32Array(4096); }
    const i = (lx & 15) | ((ly & 15) << 4) | ((lz & 15) << 8), v = c >>> 0;
    br[i] = v; br[i + 1] = v; br[i + 16] = v; br[i + 17] = v;
    br[i + 256] = v; br[i + 257] = v; br[i + 272] = v; br[i + 273] = v;
    if (c) this._grow(lx, ly, lz, 1);
  }
  // any fine voxel of the coarse cell (0 when the whole cell is empty)
  get(x, y, z) {
    const lx = Math.round(x) * K - this.fx0, ly = Math.round(y) * K - this.fy0, lz = Math.round(z) * K - this.fz0;
    if (lx < 0 || ly < 0 || lz < 0 || lx >= this.FW || ly >= this.FH || lz >= this.FD) return 0;
    const br = this.bricks[(lx >> 4) + this.bw * ((ly >> 4) + this.bh * (lz >> 4))];
    if (!br) return 0;
    const i = (lx & 15) | ((ly & 15) << 4) | ((lz & 15) << 8);
    return br[i] || br[i + 1] || br[i + 16] || br[i + 17] || br[i + 256] || br[i + 257] || br[i + 272] || br[i + 273];
  }
  fill(x0, y0, z0, x1, y1, z1, c) {
    const ax = Math.round(Math.min(x0, x1)), bx = Math.round(Math.max(x0, x1));
    const ay = Math.round(Math.min(y0, y1)), by = Math.round(Math.max(y0, y1));
    const az = Math.round(Math.min(z0, z1)), bz = Math.round(Math.max(z0, z1));
    const fn = typeof c === 'function';
    for (let z = az; z <= bz; z++) for (let y = ay; y <= by; y++) for (let x = ax; x <= bx; x++) {
      const v = fn ? c(x, y, z) : c;
      if (v) this.set(x, y, z, v);
    }
  }
  clear(x0, y0, z0, x1, y1, z1) {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, 0);
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, c) {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
      if (dx * dx + dy * dy + dz * dz <= 1) { const v = typeof c === 'function' ? c(x, y, z) : c; if (v) this.set(x, y, z, v); }
    }
  }
  // horizontal disc (y fixed), radius r around (cx, cz)
  disc(cx, y, cz, r, c, ring = 0) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
      if (d2 <= r * r + 0.25 && (!ring || d2 >= (r - ring) * (r - ring) - 0.25)) { const v = typeof c === 'function' ? c(x, y, z) : c; if (v) this.set(x, y, z, v); }
    }
  }
  // fine horizontal disc: centre/radius in fine voxels
  fdisc(cx, Y, cz, r, c, ring = 0) {
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d2 = (x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2;
      if (d2 <= r * r && (!ring || d2 >= (r - ring) * (r - ring))) { const v = typeof c === 'function' ? c(x, Y, z) : c; if (v) this.fset(x, Y, z, v); }
    }
  }
  // 3D line with integer steps; thick = extra voxels below each point (keeps diagonals face-connected)
  line(x0, y0, z0, x1, y1, z1, c, thick = 0) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t), z = Math.round(z0 + (z1 - z0) * t);
      const v = typeof c === 'function' ? c(x, y, z, t) : c;
      for (let k = 0; k <= thick; k++) this.set(x, y - k, z, v);
    }
  }
  // fine 3D line
  fline(x0, y0, z0, x1, y1, z1, c, thick = 0) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = Math.round(x0 + (x1 - x0) * t), y = Math.round(y0 + (y1 - y0) * t), z = Math.round(z0 + (z1 - z0) * t);
      const v = typeof c === 'function' ? c(x, y, z, t) : c;
      for (let k = 0; k <= thick; k++) this.fset(x, y - k, z, v);
    }
  }
  // the painted part as a sparse volume (meshVox reads it without a dense copy)
  finish() {
    const bb = this.bb || [0, 0, 0, 0, 0, 0];
    const v = new BrickVol(this, bb);
    const [x0, y0, z0, x1, y1, z1] = bb;
    const origin = [-(x0 + this.fx0), -(y0 + this.fy0), -(z0 + this.fz0)];
    // lo / hi in coarse units (what the meta's metres are computed from)
    return { vox: v, origin, lo: [(x0 + this.fx0) / K, (y0 + this.fy0) / K, (z0 + this.fz0) / K], hi: [(x1 + this.fx0 + 1) / K, (y1 + this.fy0 + 1) / K, (z1 + this.fz0 + 1) / K] };
  }
}

// A window onto a VB's bricks: w x h x d fine voxels starting at the VB-local voxel (x0, y0, z0).
// Read-only Vox look-alike: get(), occRow() for the mesher, count(), and dense() when needed.
class BrickVol {
  constructor(vb, bb) {
    this.bricks = vb.bricks; this.bw = vb.bw; this.bh = vb.bh;
    this.x0 = bb[0]; this.y0 = bb[1]; this.z0 = bb[2];
    this.w = bb[3] - bb[0] + 1; this.h = bb[4] - bb[1] + 1; this.d = bb[5] - bb[2] + 1;
  }
  get(x, y, z) {
    if (x < 0 || y < 0 || z < 0 || x >= this.w || y >= this.h || z >= this.d) return 0;
    const lx = x + this.x0, ly = y + this.y0, lz = z + this.z0;
    const br = this.bricks[(lx >> 4) + this.bw * ((ly >> 4) + this.bh * (lz >> 4))];
    return br ? br[(lx & 15) | ((ly & 15) << 4) | ((lz & 15) << 8)] : 0;
  }
  // occupancy bits of row (y, z) into words[o..], bit b of word k = voxel x = 32k + b
  occRow(y, z, words, o) {
    const ly = y + this.y0, lz = z + this.z0, W = this.w;
    const rowB = this.bw * ((ly >> 4) + this.bh * (lz >> 4)), cell = ((ly & 15) << 4) | ((lz & 15) << 8);
    for (let x = 0; x < W;) {
      const lx = x + this.x0;
      const br = this.bricks[(lx >> 4) + rowB];
      const run = Math.min(16 - (lx & 15), W - x);
      if (br) {
        let c = cell | (lx & 15);
        for (let k = 0; k < run; k++, c++) if (br[c] !== 0) words[o + ((x + k) >> 5)] |= 1 << ((x + k) & 31);
      }
      x += run;
    }
  }
  count() {
    let n = 0;
    for (let z = 0; z < this.d; z++) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.get(x, y, z)) n++;
    return n;
  }
  dense() {
    const v = new Vox(this.w, this.h, this.d);
    for (let z = 0; z < this.d; z++) for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) v.data[x + this.w * (y + this.h * z)] = this.get(x, y, z);
    return v;
  }
}

// ------------------------------------------------------------------ wall face frames
// A frame addresses a wall face as (u, y, n): u runs left->right seen from outside,
// n is the offset outward from the outermost body layer (n = 0 base, 1 = lips/trim, <0 inside).
// Fine voxels on a frame: (U, Y, N) with U = 2u..2u+1 inside coarse column u, Y = 2y..2y+1, and
// N = 0 the outermost fine layer of the body (coarse layer n covers N = 2n-1 and 2n).
function mkFrame(vb, b, f, off = 0) {
  let P2, FP, umin, umax, nx = 0, nz = 0;
  if (f === 'front') { P2 = (u, n) => [u, b.z1 + n + off]; FP = (U, N) => [U, K * (b.z1 + off) + 1 + N]; umin = b.x0; umax = b.x1; nz = 1; }
  else if (f === 'back') { P2 = (u, n) => [b.x0 + b.x1 - u, b.z0 - n - off]; FP = (U, N) => [K * (b.x0 + b.x1) + 1 - U, K * (b.z0 - off) - N]; umin = b.x0; umax = b.x1; nz = -1; }
  else if (f === 'right') { P2 = (u, n) => [b.x1 + n + off, b.z0 + b.z1 - u]; FP = (U, N) => [K * (b.x1 + off) + 1 + N, K * (b.z0 + b.z1) + 1 - U]; umin = b.z0; umax = b.z1; nx = 1; }
  else { P2 = (u, n) => [b.x0 - n - off, u]; FP = (U, N) => [K * (b.x0 - off) - N, U]; umin = b.z0; umax = b.z1; nx = -1; }
  const F = {
    f, b, umin, umax, nx, nz, off, P: P2, FP, occ: [],
    fs(U, Y, N, c) { const p = FP(U, N); vb.fset(p[0], Y, p[1], c); },
    fg(U, Y, N) { const p = FP(U, N); return vb.fget(p[0], Y, p[1]); },
    ff(U0, Y0, N0, U1, Y1, N1, c) {
      const fn = typeof c === 'function';
      for (let n = Math.min(N0, N1); n <= Math.max(N0, N1); n++) for (let y = Math.min(Y0, Y1); y <= Math.max(Y0, Y1); y++) for (let u = Math.min(U0, U1); u <= Math.max(U0, U1); u++) {
        const cc = fn ? c(u, y, n) : c;
        if (cc) { const p = FP(u, n); vb.fset(p[0], y, p[1], cc); }
      }
    },
    fc(U0, Y0, N0, U1, Y1, N1) {
      for (let n = Math.min(N0, N1); n <= Math.max(N0, N1); n++) for (let y = Math.min(Y0, Y1); y <= Math.max(Y0, Y1); y++) for (let u = Math.min(U0, U1); u <= Math.max(U0, U1); u++) { const p = FP(u, n); vb.fset(p[0], y, p[1], 0); }
    },
    // centre of fine voxel (U,Y,N) in local coarse coordinates
    fpt(U, Y, N) { const p = FP(U, N); return [(p[0] + 0.5) / K, (Y + 0.5) / K, (p[1] + 0.5) / K]; },
    set(u, y, n, c) { const p = P2(u, n); vb.set(p[0], y, p[1], c); },
    get(u, y, n) { const p = P2(u, n); return vb.get(p[0], y, p[1]); },
    fill(u0, y0, n0, u1, y1, n1, c) {
      const fn = typeof c === 'function';
      for (let n = Math.min(n0, n1); n <= Math.max(n0, n1); n++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u++) {
        const cc = fn ? c(u, y, n) : c;
        if (cc) { const p = P2(u, n); vb.set(p[0], y, p[1], cc); }
      }
    },
    clear(u0, y0, n0, u1, y1, n1) {
      for (let n = Math.min(n0, n1); n <= Math.max(n0, n1); n++) for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let u = Math.min(u0, u1); u <= Math.max(u0, u1); u++) { const p = P2(u, n); vb.set(p[0], y, p[1], 0); }
    },
    // centre of voxel (u,y,n) in local voxel coordinates (u may be fractional)
    pt(u, y, n) { const p = P2(u, n); return [p[0] + 0.5, y + 0.5, p[1] + 0.5]; },
    sub(o2) { return mkFrame(vb, b, f, off + o2); },
    free(u0, y0, u1, y1, pad = 1) {
      for (const r of F.occ) if (u0 - pad <= r[2] && u1 + pad >= r[0] && y0 - pad <= r[3] && y1 + pad >= r[1]) return false;
      return true;
    },
  };
  return F;
}
const frames = (vb, b) => ({ front: mkFrame(vb, b, 'front'), back: mkFrame(vb, b, 'back'), left: mkFrame(vb, b, 'left'), right: mkFrame(vb, b, 'right') });

// ------------------------------------------------------------------ surface patterns
const BOARD_T = [0, 0.05, -0.04, 0.025, -0.02, 0.035];
function boardTone(base, k, seed = 0) { return tone(base, BOARD_T[Math.floor(vhash(k, 11, 3, seed) * BOARD_T.length)]); }
// clapboard: 2-voxel boards, the bottom row of each board sticks out (n = 1)
function clapboard(F, base, y0, y1, seed = 0) {
  for (let y = y0; y <= y1; y++) {
    const c = boardTone(base, y >> 1, seed);
    const lip = (y & 1) === 0;
    for (let u = F.umin + 2; u <= F.umax - 2; u++) {
      if (!F.get(u, y, 0)) continue;
      F.set(u, y, 0, c);
      if (lip && !F.get(u, y, 1)) F.set(u, y, 1, c);
    }
  }
}
// board & batten: vertical boards, a batten every `step` columns
function battens(F, base, y0, y1, step = 4, seed = 0, edge = 2) {
  for (let u = F.umin + edge; u <= F.umax - edge; u++) {
    const k = Math.floor((u - F.umin) / step);
    const c = tone(base, BOARD_T[Math.floor(vhash(k, 5, F.f.length, seed) * BOARD_T.length)] * 1.4);
    const bat = ((u - F.umin) % step) === 0;
    for (let y = y0; y <= y1; y++) {
      if (!F.get(u, y, 0)) continue;
      F.set(u, y, 0, c);
      if (bat && !F.get(u, y, 1)) F.set(u, y, 1, tone(base, 0.08));
    }
  }
}
// log courses: 3 rows per log, the two upper rows bulge out, the bottom row is chinking
function logSkin(F, base, y0, y1, seed = 0) {
  for (let y = y0; y <= y1; y++) {
    const k = Math.floor(y / 3), r = ((y % 3) + 3) % 3;
    const lt = tone(base, [0.04, -0.05, 0.0, 0.08, -0.03][Math.floor(vhash(k, 7, F.f.length, seed) * 5)]);
    for (let u = F.umin + 2; u <= F.umax - 2; u++) {
      if (!F.get(u, y, 0)) continue;
      if (r === 0) F.set(u, y, 0, 0xb8a888);
      else {
        F.set(u, y, 0, lt);
        if (!F.get(u, y, 1)) F.set(u, y, 1, r === 2 ? tone(lt, 0.07) : lt);
      }
    }
  }
}
function plankTone(k, seed = 0, base = P.plank) {
  return tone(base, [0, -0.07, 0.06, -0.03, 0.03][Math.floor(vhash(k, 3, 9, seed) * 5)]);
}
function stoneFn(seed = 0, pal = [P.stone, P.stoneB, P.stoneC, P.stoneD]) {
  return (x, y, z) => {
    const c = Math.floor(y / 2);
    const k = Math.floor((x + z + (c & 1) * 2) / 4);
    const h = vhash(k, c, 5, seed);
    return pal[Math.floor(h * (h < 0.92 ? 3 : 4))];
  };
}
function brickFn(seed = 0) {
  return (x, y, z) => {
    const off = (y & 1) * 2;
    if (((x + z + off) % 4 + 4) % 4 === 0) return P.mortar;
    return [P.brick, P.brickB, P.brickC][Math.floor(vhash(Math.floor((x + z + off) / 4), y, 2, seed) * 3)];
  };
}

function cornerTrims(vb, b, y0, y1, c) {
  for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) vb.fill(x - 1, y0, z - 1, x + 1, y1, z + 1, c);
}
function band(F, y0, y1, c) {
  for (let u = F.umin; u <= F.umax; u++) for (let y = y0; y <= y1; y++) if (F.get(u, y, 0)) F.set(u, y, 1, c);
}

// ------------------------------------------------------------------ roofs
// Gable roof. axis 'z': ridge runs along z (gables front/back). axis 'x': ridge along x (eaves front/back).
function roofGeom(o) {
  const { axis, b, H } = o;
  const p = o.pitch;
  const oh = o.oh ?? 4;
  const t = o.t ?? (p > 1 ? 3 : 2);
  const s0 = axis === 'z' ? b.x0 : b.z0, s1 = axis === 'z' ? b.x1 : b.z1;
  const r0 = axis === 'z' ? b.z0 : b.x0, r1 = axis === 'z' ? b.z1 : b.x1;
  const S0 = s0 - oh, S1 = s1 + oh, R0 = r0 - (o.ohR0 ?? 3), R1 = r1 + (o.ohR1 ?? 3);
  const base = H - Math.floor(oh * p);
  const top = (s) => base + Math.floor(Math.min(s - S0, S1 - s) * p + 1e-6);
  const sr = (x, z) => (axis === 'z' ? [x, z] : [z, x]);
  const xz = (s, r) => (axis === 'z' ? [s, r] : [r, s]);
  const topAt = (x, z) => {
    const [s, r] = sr(x, z);
    if (s < S0 || s > S1 || r < R0 || r > R1) return -1e9;
    return top(s);
  };
  const ridge = top(Math.floor((S0 + S1) / 2));
  return { axis, b, H, p, oh, t, s0, s1, r0, r1, S0, S1, R0, R1, base, top, sr, xz, topAt, ridge };
}
function fillBody(vb, b, H, R, c, y0 = 0) {
  for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) {
    let yt = H - 1;
    if (R) yt = Math.max(yt, R.topAt(x, z) - R.t);
    for (let y = y0; y <= yt; y++) vb.set(x, y, z, c);
  }
}
function roofStyle(kind, seed, extra = {}) {
  const col = ROOFC[kind] ?? ROOFC.dark;
  const st = { kind: kind === 'moss' ? 'moss' : kind === 'rust' ? 'tin' : 'shingle', col, seed, soffit: P.trimShade, barge: P.trim, fascia: P.trim, ridge: tone(col, -0.3), gutter: true };
  return Object.assign(st, extra);
}
function shingle(st, s, r, yt) {
  const col = st.col;
  if (st.kind === 'tin') {
    if ((((r % 6) + 6) % 6) === 0) return tone(col, -0.16);
    const n = vnoise(s, r, 7, st.seed);
    return n > 0.68 ? mixc(col, 0x7a3a1c, 0.45) : n < 0.28 ? tone(col, 0.1) : col;
  }
  if (st.kind === 'moss') {
    const n = vnoise(s, r, 7, st.seed) * 0.75 + vnoise(s, r, 3, st.seed + 1) * 0.25;
    if (n > 0.62) return n > 0.74 ? P.mossB : P.moss;
    return [col, tone(col, -0.08), tone(col, 0.06)][((yt % 3) + 3) % 3];
  }
  const course = ((yt % 3) + 3) % 3;
  const sp = st.seam ?? 12;
  const seam = (yt & 1) === 0 && (((r + ((yt >> 1) & 1) * 4) % sp) + sp) % sp === 0;
  if (seam) return tone(col, -0.16);
  return [col, tone(col, -0.07), tone(col, 0.07)][course];
}
function drawRoof(vb, R, st) {
  const cap = Math.max(1, Math.ceil(R.p));
  const mid = Math.floor((R.S0 + R.S1) / 2);
  const dmax = Math.min(mid - R.S0, R.S1 - mid);
  for (let s = R.S0; s <= R.S1; s++) {
    const yt = R.top(s);
    const de = Math.min(s - R.S0, R.S1 - s);
    for (let r = R.R0; r <= R.R1; r++) {
      const [x, z] = R.xz(s, r);
      const edge = (r === R.R0 && !st.noBargeR0) || (r === R.R1 && !st.noBargeR1);
      for (let k = 0; k < R.t; k++) {
        let c;
        if (edge && st.barge) c = st.barge;
        else if (k < cap) c = shingle(st, s, r, yt);
        else c = de === 0 && st.fascia ? st.fascia : st.soffit;
        vb.set(x, yt - k, z, c);
      }
      if (edge && st.barge) vb.set(x, yt - R.t, z, st.barge);
      if (de === dmax && st.ridge) vb.set(x, yt + 1, z, st.ridge);
      if (st.kind === 'moss' && !edge && de > 0 && de < dmax) {
        const n = vnoise(s, r, 7, st.seed) * 0.75 + vnoise(s, r, 3, st.seed + 1) * 0.25;
        if (n > 0.7 && vhash(s, r, 4, st.seed) < 0.14) vb.set(x, yt + 1, z, n > 0.76 ? P.mossB : P.moss);
      }
    }
  }
  if (st.gutter) {
    for (const side of [-1, 1]) {
      const sg = side < 0 ? R.S0 - 1 : R.S1 + 1;
      for (let r = R.R0 + 1; r <= R.R1 - 1; r++) {
        const [x, z] = R.xz(sg, r);
        vb.set(x, R.base, z, P.metal);
        vb.set(x, R.base - 1, z, P.metal);
      }
      // downspout near the front end of the eave
      if (st.spouts !== false) {
        const sw = side < 0 ? R.s0 - 2 : R.s1 + 2;
        const rs = R.axis === 'z' ? R.r1 - 3 : R.r0 + 3;
        for (let s = Math.min(sg, sw); s <= Math.max(sg, sw); s++) { const [x, z] = R.xz(s, rs); vb.set(x, R.base - 2, z, P.metal); }
        for (let y = 1; y <= R.base - 2; y++) { const [x, z] = R.xz(sw, rs); vb.set(x, y, z, P.metal); }
        const [x, z] = R.xz(sw + side, rs);
        vb.set(x, 0, z, P.metal);
        vb.set(R.xz(sw, rs)[0], 0, R.xz(sw, rs)[1], P.metal);
      }
    }
  }
}
// the roof's lower edge as a list of points (for string lights): front gable (axis z) or front eave (axis x)
function frontEdgePts(R) {
  const pts = [];
  if (R.axis === 'z') {
    for (let s = R.S0; s <= R.S1; s++) pts.push([s, R.top(s) - R.t - 1, R.R1]);
  } else {
    for (let r = R.R0; r <= R.R1; r++) pts.push([r, R.base - R.t, R.S1]);
  }
  return pts;
}
// single-slope roof in a frame: from (n=nA, y=yA) down to (n=nB, y=yB), across u0..u1
function shedRoof(vb, F, u0, u1, nA, nB, yA, yB, st) {
  const nN = Math.max(1, nB - nA);
  for (let n = nA; n <= nB; n++) {
    const y = Math.round(yA + ((yB - yA) * (n - nA)) / nN);
    for (let u = u0; u <= u1; u++) {
      const edge = u === u0 || u === u1;
      const front = n === nB;
      F.set(u, y, n, edge || front ? (st.barge ?? P.trim) : shingle(st, n, u, y));
      F.set(u, y - 1, n, edge || front ? (st.barge ?? P.trim) : st.soffit);
    }
  }
}
// dormer on a roof slope (window facing the frame's direction). nf < 0: dormer face behind the wall line.
function dormer(ctx, F, R, uc, o = {}) {
  const vb = ctx.vb;
  const w = o.w ?? 16, nf = o.nf ?? -Math.round(3 / R.p);
  const ua = uc - (w >> 1), ub = ua + w - 1;
  const pc = F.P(uc, nf);
  const yb = R.topAt(pc[0], pc[1]);
  // keep the dormer's ridge below the main ridge
  const wallH = Math.max(8, Math.min(o.h ?? 14, R.ridge - 3 - (w >> 1) - yb));
  const yE = yb + wallH;
  let prevC = -1e9;
  const sid = o.siding, st = o.style;
  for (let n = nf + 1; n >= nf - 80; n--) {
    const pcn = F.P(uc, n), mtC = R.topAt(pcn[0], pcn[1]);
    if (mtC < prevC) break; // crossed the main ridge
    prevC = mtC;
    let any = false;
    for (let u = ua - 1; u <= ub + 1; u++) {
      const p = F.P(u, n);
      const mt = R.topAt(p[0], p[1]);
      const de = Math.min(u - (ua - 1), ub + 1 - u);
      const yt = yE + de; // pitch 1 mini roof
      if (yt <= mt) continue;
      any = true;
      const front = n === nf + 1;
      // mini roof slab (2 thick)
      vb.set(p[0], yt, p[1], front || de === 0 ? P.trim : shingle(st, u, n, yt));
      vb.set(p[0], yt - 1, p[1], front || de === 0 ? P.trim : st.soffit);
      if (de === Math.min(uc - 1 - (ua - 1), ub + 1 - uc)) vb.set(p[0], yt + 1, p[1], st.ridge);
      // walls under it
      if (u >= ua && u <= ub && n <= nf) for (let y = Math.max(mt - 1, yb - 2); y <= yt - 2; y++) vb.set(p[0], y, p[1], sid);
    }
    if (!any) break;
  }
  const Fd = F.sub(nf);
  // board tones on the dormer face
  for (let y = yb - 2; y <= yE + w; y++) for (let u = ua; u <= ub; u++) if (Fd.get(u, y, 0) === sid) Fd.set(u, y, 0, boardTone(sid, y >> 1, 1));
  Fd.fill(ua, yb - 1, 1, ub, yE - 1, 1, (u, y) => (u === ua || u === ub ? P.trim : 0));
  const ww = Math.min(7, w - 6);
  windowOn(ctx, Fd, uc - (ww >> 1) - (ww & 1 ? 0 : 0), yb + 2, { w: ww, h: Math.min(9, wallH - 4), curtain: o.curtain, lit: o.lit, cat: o.cat, jack: o.jack });
  return { yb, yE, Fd, ua, ub };
}

// ------------------------------------------------------------------ openings
const glassFn = (u0, y1) => (u, y) => {
  const k = (u - u0) + (y1 - y);
  return k === 2 || k === 3 ? P.glassHi | GLASS : P.glass | GLASS;
};
function windowOn(ctx, F, u0, y0, o = {}) {
  const ww = o.w ?? 7, wh = o.h ?? 10;
  const u1 = u0 + ww - 1, y1 = y0 + wh - 1;
  const fr = o.frame ?? P.trim;
  F.clear(u0 - 1, y0 - 1, 1, u1 + 1, y1 + 2, 1);
  F.fill(u0, y0, 0, u1, y1, 0, o.glassFn ?? glassFn(u0, y1));
  if (o.mull !== false) {
    const mu = o.mullU ?? (ww >= 5 ? [u0 + (ww >> 1)] : []);
    const my = o.mullY ?? (wh >= 6 ? [y0 + (wh >> 1)] : []);
    for (const m of mu) F.fill(m, y0, 0, m, y1, 0, fr);
    for (const m of my) F.fill(u0, m, 0, u1, m, 0, fr);
  }
  if (o.curtain) {
    const cc = o.curtain;
    F.fill(u0, y0 + 2, 0, u0, y1, 0, cc);
    F.fill(u1, y0 + 2, 0, u1, y1, 0, cc);
    F.fill(u0, y1, 0, u1, y1, 0, tone(cc, -0.08));
  }
  // frame + sill + drip cap
  F.fill(u0 - 1, y1 + 1, 1, u1 + 1, y1 + 1, 1, fr);
  F.fill(u0 - 1, y0, 1, u0 - 1, y1, 1, fr);
  F.fill(u1 + 1, y0, 1, u1 + 1, y1, 1, fr);
  F.fill(u0 - 2, y0 - 1, 1, u1 + 2, y0 - 1, 2, fr);
  F.fill(u0 - 2, y1 + 2, 1, u1 + 2, y1 + 2, 2, fr);
  if (SPOOKY && o.jack && ww >= 5) {
    const cu = u0 + (ww >> 1);
    const rows = [['.SS.', 0], ['OOOOO', -2], ['OEOEO', -2], ['OOMOO', -2], ['.OOO.', -2]];
    rows.forEach(([row, du], i) => {
      const y = y0 + 4 - i;
      for (let k = 0; k < row.length; k++) {
        const ch = row[k];
        if (ch === '.') continue;
        F.set(cu + du + k + (ch === 'S' ? 1 : 0), y, 0, ch === 'S' ? P.stem : ch === 'O' ? P.pumpkin : P.glowHot);
      }
    });
  }
  if (SPOOKY && o.cat) {
    const cu = u1 - 4;
    const rows = ['X.X..', 'XEXE.', '.XX..', 'XXXX.', 'XXXXX'];
    rows.forEach((row, i) => {
      for (let k = 0; k < row.length; k++) if (row[k] !== '.') F.set(cu + k, y0 + 4 - i, 0, row[k] === 'E' ? 0xd8ff6a | EMIT : P.bat);
    });
  }
  let uL = u0 - 2, uR = u1 + 2, yB = y0 - 1;
  if (o.shutter) {
    const sc = o.shutter;
    const louv = (u, y) => ((y - y0) % 4 < 2 ? tone(sc, -0.14) : sc);
    F.fill(u0 - 4, y0, 1, u0 - 2, y1, 1, louv);
    F.fill(u1 + 2, y0, 1, u1 + 4, y1, 1, louv);
    uL = u0 - 4; uR = u1 + 4;
  }
  if (o.box) {
    const bc = o.boxCol ?? P.woodDark;
    F.fill(u0 - 1, y0 - 4, 1, u1 + 1, y0 - 2, 3, (u, y, n) => (y === y0 - 2 && n < 3 ? P.soil : bc));
    for (let u = u0 - 1; u <= u1 + 1; u++) {
      const h = vhash(u, y0, F.f.length, 7);
      F.set(u, y0 - 1, 3, P.leaf);
      if ((u - u0) % 2 === 0 || h < 0.3) F.set(u, y0, 3, pick(P.mums, h));
      else F.set(u, y0, 3, P.leafB);
      if (h > 0.75) F.set(u, y0 + 1, 3, pick(P.mums, 1 - h));
    }
    yB = y0 - 4;
  }
  F.occ.push([uL, yB, uR, y1 + 2]);
  if (o.lit) addLight(ctx, F.pt(u0 + (ww - 1) / 2, y0 + wh / 2, 3), [1.0, 0.72, 0.42], 4.5, 'window');
  return { u0, u1, y0, y1 };
}
// evenly spread `count` windows across [ua, ub]
function windowRow(ctx, F, ua, ub, y0, count, o = {}, perWin = null) {
  const ww = o.w ?? 7;
  const out = [];
  if (count <= 0) return out;
  const span = (ub - ua + 1) / count;
  for (let i = 0; i < count; i++) {
    const c = ua + span * (i + 0.5);
    const oo = perWin ? { ...o, ...perWin(i) } : o;
    out.push(windowOn(ctx, F, Math.round(c - ww / 2), y0, oo));
  }
  return out;
}
function lanternOn(ctx, F, u, y, o = {}) {
  F.fill(u, y, 1, u + 1, y, 2, P.iron);
  F.fill(u, y + 1, 1, u + 1, y + 2, 2, o.col ?? P.lamp);
  F.fill(u, y + 3, 1, u + 1, y + 3, 2, P.iron);
  F.set(u, y + 4, 1, P.iron);
  F.set(u + 1, y + 4, 1, P.iron);
  addLight(ctx, F.pt(u + 0.5, y + 2, 3.5), o.light ?? [1.0, 0.72, 0.38], o.radius ?? 6, o.kind ?? 'porch');
  F.occ.push([u - 1, y, u + 2, y + 4]);
}
function doorOn(ctx, F, uc, o = {}) {
  const w = o.w ?? 8, h = o.h ?? 17, y0 = o.y ?? 0;
  const u0 = uc - (w >> 1), u1 = u0 + w - 1;
  const dc = o.color ?? 0x3a6a4a, fr = o.frame ?? P.trim;
  F.clear(u0 - 1, y0, 1, u1 + 1, y0 + h + 1, 1);
  F.fill(u0, y0, 0, u1, y0 + h - 1, 0, dc);
  const leaves = o.double ? [[u0, u0 + (w >> 1) - 1], [u0 + (w >> 1), u1]] : [[u0, u1]];
  for (const [a, bq] of leaves) {
    const lw = bq - a + 1;
    const cols = lw >= 7 ? [[a + 1, a + (lw >> 1) - 2], [a + (lw >> 1) + 1, bq - 1]] : [[a + 1, bq - 1]];
    const rows = [[y0 + 2, y0 + 6], [y0 + 9, y0 + h - 3]];
    for (const [px0, px1] of cols) for (let ri = 0; ri < rows.length; ri++) {
      const [py0, py1] = rows[ri];
      if (px1 < px0 || py1 < py0) continue;
      F.clear(px0, py0, 0, px1, py1, 0);
      const glass = o.glass && ri === 1;
      F.fill(px0, py0, -1, px1, py1, -1, glass ? glassFn(px0, py1) : tone(dc, -0.2));
    }
    if (o.plank) for (let u = a; u <= bq; u++) if ((u - a) % 2 === 1) for (let y = y0; y < y0 + h; y++) if (F.get(u, y, 0) === dc) F.set(u, y, 0, tone(dc, -0.08));
  }
  if (o.double) { F.set(u0 + (w >> 1) - 2, y0 + 8, 1, P.brass); F.set(u0 + (w >> 1) + 1, y0 + 8, 1, P.brass); }
  else F.set(o.knobLeft ? u0 + 1 : u1 - 1, y0 + 8, 1, P.brass);
  F.fill(u0 - 1, y0, 1, u0 - 1, y0 + h, 1, fr);
  F.fill(u1 + 1, y0, 1, u1 + 1, y0 + h, 1, fr);
  F.fill(u0 - 2, y0 + h, 1, u1 + 2, y0 + h, 1, fr);
  F.fill(u0 - 2, y0 + h + 1, 1, u1 + 2, y0 + h + 1, 2, fr);
  F.occ.push([u0 - 2, y0, u1 + 2, y0 + h + 1]);
  if (o.lantern !== false) lanternOn(ctx, F, o.lanternLeft ? u0 - 5 : u1 + 4, y0 + 10, o.lanternOpts);
  if (o.main !== false) {
    const p = F.pt(uc - 0.5, y0, 3);
    ctx.door = { ...M3(p[0], y0, p[2]), face: F.f };
  }
  return { u0, u1, uc, h, y0 };
}
function signOn(ctx, F, uc, y0, wv, hv, text, o = {}) {
  const u0 = uc - (wv >> 1), u1 = u0 + wv - 1, y1 = y0 + hv - 1;
  const bg = o.bg ?? P.cream, edge = o.edge ?? P.woodDark, n0 = o.n ?? 1;
  F.fill(u0 - 1, y0 - 1, n0, u1 + 1, y1 + 1, n0 + 1, edge);
  F.fill(u0, y0, n0 + 1, u1, y1, n0 + 1, bg);
  F.fill(u0 - 1, y0 - 1, n0 + 2, u1 + 1, y0 - 1, n0 + 2, edge);
  F.fill(u0 - 1, y1 + 1, n0 + 2, u1 + 1, y1 + 1, n0 + 2, edge);
  F.fill(u0 - 1, y0, n0 + 2, u0 - 1, y1, n0 + 2, edge);
  F.fill(u1 + 1, y0, n0 + 2, u1 + 1, y1, n0 + 2, edge);
  F.occ.push([u0 - 1, y0 - 1, u1 + 1, y1 + 1]);
  const c = F.pt(uc - 0.5, y0 + hv / 2 - 0.5, n0 + 1);
  const nrm = [F.nx, 0, F.nz];
  const pos = M3(c[0] + nrm[0] * 0.5, c[1], c[2] + nrm[2] * 0.5);
  ctx.signs.push({ x: r3(pos.x + nrm[0] * 0.012), y: pos.y, z: r3(pos.z + nrm[2] * 0.012), w: wv / VPM, h: hv / VPM, text, normal: nrm, bg: hexs(bg), fg: o.fg ?? '#3a2418', kind: o.kind ?? 'board' });
}
// a free-standing / hanging board facing +z with its plain face at z = zf (voxel layer)
function signFree(ctx, x0, y0, zf, wv, hv, text, o = {}) {
  const vb = ctx.vb, bg = o.bg ?? P.cream, edge = o.edge ?? P.woodDark;
  vb.fill(x0 - 1, y0 - 1, zf - 1, x0 + wv, y0 + hv, zf - 1, edge);
  vb.fill(x0, y0, zf, x0 + wv - 1, y0 + hv - 1, zf, bg);
  vb.fill(x0 - 1, y0 - 1, zf, x0 + wv, y0 - 1, zf + 1, edge);
  vb.fill(x0 - 1, y0 + hv, zf, x0 + wv, y0 + hv, zf + 1, edge);
  vb.fill(x0 - 1, y0, zf, x0 - 1, y0 + hv - 1, zf + 1, edge);
  vb.fill(x0 + wv, y0, zf, x0 + wv, y0 + hv - 1, zf + 1, edge);
  const p = M3(x0 + wv / 2, y0 + hv / 2, zf + 1);
  ctx.signs.push({ x: p.x, y: p.y, z: r3(p.z + 0.012), w: wv / VPM, h: hv / VPM, text, normal: [0, 0, 1], bg: hexs(bg), fg: o.fg ?? '#3a2418', kind: o.kind ?? 'board' });
}
// striped awning on a frame, from the wall (y = yTop) out to n = depth
function awningOn(F, u0, u1, yTop, depth, cols, o = {}) {
  const drop = o.drop ?? Math.round(depth * 0.45);
  const sw = o.stripe ?? 3;
  const col = (u) => cols[Math.floor((((u - u0) % (sw * cols.length)) + sw * cols.length) % (sw * cols.length) / sw)];
  for (let n = 1; n <= depth; n++) {
    const y = Math.round(yTop - ((n - 1) * drop) / Math.max(1, depth - 1));
    for (let u = u0; u <= u1; u++) { F.set(u, y, n, col(u)); F.set(u, y - 1, n, tone(col(u), -0.1)); }
  }
  // scalloped valance
  const yv = yTop - drop - 1;
  for (let u = u0; u <= u1; u++) {
    F.set(u, yv - 1, depth, col(u));
    if (((u - u0) % sw) === 1) F.set(u, yv - 2, depth, col(u));
  }
  // iron brackets
  for (const u of [u0, u1]) for (let k = 0; k < depth - 1; k++) F.set(u, yTop - 2 - Math.round(k * 0.6), 1 + k, P.iron);
  F.occ.push([u0, yv - 2, u1, yTop]);
}

// ------------------------------------------------------------------ foundations, stilts, decks, porches, steps
function foundation(ctx, b, G, extra = 6) {
  ctx.vb.fill(b.x0 - 1, -G - extra, b.z0 - 1, b.x1 + 1, -1, b.z1 + 1, stoneFn(ctx.seed));
  ctx.vb.fill(b.x0 - 1, -1, b.z0 - 1, b.x1 + 1, -1, b.z1 + 1, P.woodDark);
}
function stilts(ctx, x0, x1, z0, z1, S, o = {}) {
  const vb = ctx.vb;
  const sp = o.spacing ?? 18;
  const nx = Math.max(2, Math.round((x1 - x0) / sp) + 1), nz = Math.max(2, Math.round((z1 - z0) / sp) + 1);
  const xs = [], zs = [];
  for (let i = 0; i < nx; i++) xs.push(Math.round(x0 + ((x1 - 1 - x0) * i) / (nx - 1)));
  for (let j = 0; j < nz; j++) zs.push(Math.round(z0 + ((z1 - 1 - z0) * j) / (nz - 1)));
  const wet = -S + Math.min(10, Math.round(S * 0.3));
  const postC = (k) => (x, y, z) => (y < wet - 1 ? (y < -S + 3 ? 0x3a3a2c : 0x4a4434) : y === wet - 1 || y === wet ? 0x8a9a7a : tone(P.woodDark, (vhash(k, 1, 1) - 0.5) * 0.12));
  let k = 0;
  for (const x of xs) for (const z of zs) vb.fill(x, -S, z, x + 1, -3, z + 1, postC(k++));
  // beams under the floor along x on each post row
  for (const z of zs) vb.fill(x0, -4, z, x1, -3, z + 1, P.woodDark);
  for (const x of [xs[0], xs[xs.length - 1]]) vb.fill(x, -4, z0, x + 1, -3, z1, P.woodDark);
  // cross bracing on the outer rows
  const yA = -5, yB = Math.max(-S + 4, -5 - 16);
  // zig-zag single diagonals on the back (water side) and the two ends, a horizontal girt on every outer row
  const diag = (ax, az, bx, bz, flip) => (flip ? vb.line(ax, yB, az, bx, yA, bz, P.wood, 1) : vb.line(ax, yA, az, bx, yB, bz, P.wood, 1));
  if (S > 8) {
    for (const z of [zs[0], zs[zs.length - 1]]) {
      const zz = z === zs[0] ? z - 1 : z + 2;
      vb.fill(xs[0], yB - 1, zz, xs[xs.length - 1] + 1, yB - 1, zz, P.wood);
      if (z === zs[0]) for (let i = 0; i < xs.length - 1; i++) diag(xs[i] + 1, zz, xs[i + 1], zz, i & 1);
    }
    for (const x of [xs[0], xs[xs.length - 1]]) {
      const xx = x === xs[0] ? x - 1 : x + 2;
      vb.fill(xx, yB - 1, zs[0], xx, yB - 1, zs[zs.length - 1] + 1, P.wood);
      for (let j = 0; j < zs.length - 1; j++) diag(xx, zs[j] + 1, xx, zs[j + 1], j & 1);
    }
  }
  return { xs, zs };
}
// planked deck in front of a frame: n from 1..depth, u from ua..ub, top voxel at y=-1
function deckOn(ctx, F, ua, ub, depth, o = {}) {
  F.fill(ua, -1, 1, ub, -1, depth, (u, y, n) => plankTone(n, ctx.seed, o.col ?? P.plank));
  F.fill(ua, -2, 1, ub, -2, depth, P.woodDark);
  F.fill(ua, -3, depth, ub, -3, depth, P.woodDark);
  const a = F.pt(ua, 0, 1), c = F.pt(ub, 0, depth);
  ctx.porch.push({ x0: r3(Math.min(a[0], c[0]) / VPM - 0.0625), z0: r3(Math.min(a[2], c[2]) / VPM - 0.0625), x1: r3(Math.max(a[0], c[0]) / VPM + 0.0625), z1: r3(Math.max(a[2], c[2]) / VPM + 0.0625), y: 0 });
}
// railing along a frame line at depth n from ua..ub (skipping gaps), posts at the ends
function railU(F, ua, ub, n, o = {}) {
  const col = o.col ?? P.trim, top = o.top ?? 8;
  const gaps = o.gaps ?? [];
  const inGap = (u) => gaps.some(([a, b]) => u >= a && u <= b);
  for (let u = ua; u <= ub; u++) {
    if (inGap(u)) continue;
    F.set(u, top, n, col);
    F.set(u, 1, n, col);
    if ((u - ua) % 2 === 0) F.fill(u, 2, n, u, top - 1, n, o.bal ?? col);
  }
}
// railing perpendicular to a frame (along n) at column u
function railN(F, u, na, nb, o = {}) {
  const col = o.col ?? P.trim, top = o.top ?? 8;
  for (let n = na; n <= nb; n++) {
    F.set(u, top, n, col);
    F.set(u, 1, n, col);
    if ((n - na) % 2 === 0) F.fill(u, 2, n, u, top - 1, n, o.bal ?? col);
  }
}
function postAt(F, u, n, y0, y1, col) { F.fill(u, y0, n, u + 1, y1, n + 1, col); }
// steps down from the floor (y=0) to the yard (y=-G), starting at n0
function stepsOn(ctx, F, ua, ub, n0, G, col = null) {
  const spots = [];
  const ns = Math.max(0, Math.ceil(G / 2) - 1);
  for (let k = 1; k <= ns; k++) {
    const yt = -2 * k - 1;
    F.fill(ua, -G - 3, n0 + 3 * (k - 1), ub, yt, n0 + 3 * k - 1, (u, y, n) => (y === yt ? (col ?? plankTone(n, 3)) : P.stoneB));
    spots.push({ u: ua, y: yt + 1, n: n0 + 3 * (k - 1) + 1 }, { u: ub, y: yt + 1, n: n0 + 3 * (k - 1) + 1 });
  }
  return spots;
}
// porch with posts, railing and a shed roof, along a frame
function porchOn(ctx, F, o) {
  const { ua, ub, depth } = o;
  const G = ctx.G;
  deckOn(ctx, F, ua, ub, depth, { col: o.deckCol });
  if (G > 0) F.fill(ua, -G - 3, depth, ub, -3, depth, (u) => (((u % 3) + 3) % 3 === 0 ? tone(o.postCol ?? P.trim, -0.12) : P.woodDD));
  if (G > 0) F.fill(ua, -G - 3, 1, ua, -3, depth, P.woodDark), F.fill(ub, -G - 3, 1, ub, -3, depth, P.woodDark);
  const yPost = o.yPost ?? 19;
  const posts = o.posts;
  for (const pu of posts) postAt(F, pu, depth - 1, 0, yPost, o.postCol ?? P.trim);
  F.fill(ua, yPost - 1, depth - 1, ub, yPost, depth, o.beamCol ?? o.postCol ?? P.trim);
  if (o.roof !== false) shedRoof(ctx.vb, F, ua - 2, ub + 2, 1, depth + 2, o.yRoofA, yPost + 1, o.roofStyle);
  const gaps = o.gap ? [o.gap] : [];
  for (let i = 0; i < posts.length - 1; i++) railU(F, posts[i] + 2, posts[i + 1] - 1, depth, { gaps, col: o.railCol ?? o.postCol ?? P.trim });
  if (o.sideRails !== false) { railN(F, ua, 1, depth - 2, { col: o.railCol ?? o.postCol ?? P.trim }); railN(F, ub, 1, depth - 2, { col: o.railCol ?? o.postCol ?? P.trim }); }
  let spots = [];
  if (G > 0 && o.gap) spots = stepsOn(ctx, F, o.gap[0], o.gap[1], depth + 1, G);
  return { yPost, spots };
}

// ------------------------------------------------------------------ harvest props (and the old Halloween ones, see SPOOKY)
function jack(ctx, x, y, z, o = {}) {
  const vb = ctx.vb, size = o.size ?? 2, face = o.face ?? 'front', carved = SPOOKY && (o.carved ?? true);
  const map = {
    front: (a, c) => [x + a, z + c], back: (a, c) => [x - a, z - c],
    right: (a, c) => [x + c, z - a], left: (a, c) => [x - c, z + a],
  }[face];
  const put = (a, bq, c, col) => { const [px, pz] = map(a, c); vb.set(px, y + bq, pz, col); };
  const pal = o.pal ?? [P.pumpkin, P.pumpkinB];
  if (size === 1) {
    for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (let bq = 0; bq <= 2; bq++) {
      const corner = Math.abs(a) === 1 && Math.abs(c) === 1;
      if (corner && bq !== 1) continue;
      put(a, bq, c, a === 0 || c === 0 ? pal[0] : pal[1]);
    }
    put(0, 3, 0, P.stem);
    if (carved) { put(-1, 1, 1, P.glowHot); put(1, 1, 1, P.glowHot); put(0, 0, 1, P.glow); }
  } else {
    const R = size === 2 ? 2 : 3, Hh = size === 2 ? 4 : 6;
    for (let a = -R; a <= R; a++) for (let c = -R; c <= R; c++) for (let bq = 0; bq < Hh; bq++) {
      const rr = Math.abs(a) + Math.abs(c);
      const edge = bq === 0 || bq === Hh - 1;
      if (Math.abs(a) === R && Math.abs(c) === R) continue;
      if (edge && rr > R + (size === 3 ? 1 : 0)) continue;
      const groove = (Math.abs(a) === 1 && Math.abs(c) === R) || (Math.abs(c) === 1 && Math.abs(a) === R) || (size === 3 && ((Math.abs(a) === 2 && Math.abs(c) === R) || (Math.abs(c) === 2 && Math.abs(a) === R)) && false);
      put(a, bq, c, groove ? pal[1] : pal[0]);
    }
    put(0, Hh, 0, P.stem);
    put(0, Hh + 1, 0, P.stem);
    if (size === 3) put(1, Hh + 1, 0, P.stem);
    if (carved) {
      if (size === 2) {
        put(-1, 2, R, P.glowHot); put(1, 2, R, P.glowHot);
        put(-1, 1, R, P.glow); put(0, 1, R, P.glow); put(1, 1, R, P.glow);
      } else {
        put(-2, 4, R, P.glowHot); put(-1, 4, R, P.glowHot); put(1, 4, R, P.glowHot); put(2, 4, R, P.glowHot);
        put(-1, 3, R, P.glowHot); put(1, 3, R, P.glowHot);
        for (let a = -2; a <= 2; a++) put(a, 2, R, a === 0 ? pal[0] : P.glow);
        for (let a = -1; a <= 1; a++) put(a, 1, R, a === 0 ? P.glow : P.glow);
      }
    }
  }
  if (carved && o.light !== false && ctx.jackLights < (ctx.maxJackLights ?? 4)) {
    ctx.jackLights++;
    const [px, pz] = map(0, size + 1);
    addLight(ctx, [px + 0.5, y + size + 0.5, pz + 0.5], [1.0, 0.55, 0.18], 2.2 + size * 0.6, 'lantern');
  }
}
// plain autumn pumpkin (squat, random size)
function pumpkinPlain(ctx, x, y, z, s = 2, pal) { jack(ctx, x, y, z, { size: s, carved: false, pal }); }
function hayBale(ctx, x, y, z, along = 'x') {
  const vb = ctx.vb;
  const L = 7, Hh = 4, D = 4;
  for (let a = 0; a < L; a++) for (let bq = 0; bq < Hh; bq++) for (let c = 0; c < D; c++) {
    const [px, pz] = along === 'x' ? [x + a, z + c] : [x + c, z + a];
    let col = [P.hay, P.hayB, P.hay, P.hayC][bq];
    if (a === 2 || a === L - 3) col = P.twine;
    vb.set(px, y + bq, pz, col);
  }
  // loose straw tufts
  const [tx, tz] = along === 'x' ? [x + 1, z + 1] : [x + 1, z + 1];
  vb.set(tx, y + Hh, tz, P.hayC);
}
function cornStalks(ctx, x, y, z, o = {}) {
  const vb = ctx.vb, h = o.h ?? 13;
  for (let yy = 0; yy < h - 3; yy++) for (let dx = 0; dx <= 1; dx++) for (let dz = 0; dz <= 1; dz++) vb.set(x + dx, y + yy, z + dz, (dx + dz + (yy > 6 ? 1 : 0)) % 2 ? P.cornB : P.corn);
  vb.fill(x - 1, y + 4, z - 1, x + 2, y + 4, z + 2, P.twine);
  vb.fill(x - 1, y + h - 3, z - 1, x + 2, y + h - 3, z + 2, P.corn);
  for (const [dx, dz] of [[-1, -1], [2, 2], [-1, 2], [2, -1]]) { vb.set(x + dx, y + h - 2, z + dz, P.cornC); }
  for (const [dx, dz] of [[-2, 0], [3, 1], [0, 3], [1, -2]]) vb.set(x + dx, y + h - 1, z + dz, P.cornC);
  vb.set(x + 2, y + 7, z, P.cornEar); vb.set(x + 2, y + 8, z, P.cornEar);
  vb.set(x - 1, y + 6, z + 1, P.cornEar);
}
function tombstone(ctx, x, y, z, v = 0) {
  const vb = ctx.vb;
  if (v === 1) { // cross
    vb.fill(x, y - 3, z, x + 1, y + 7, z + 1, P.tomb);
    vb.fill(x - 2, y + 4, z, x + 3, y + 5, z + 1, P.tomb);
    vb.fill(x, y, z + 1, x + 1, y, z + 1, P.moss);
    return;
  }
  const w = v === 2 ? 6 : 5, h = v === 2 ? 7 : 6;
  for (let a = 0; a < w; a++) for (let bq = -3; bq < h; bq++) {
    if (bq === h - 1 && (a === 0 || a === w - 1)) continue;
    const lean = bq >= h - 2 ? -1 : 0;
    const col = bq <= 0 && vhash(a, bq, x, z) < 0.5 ? P.tombMoss ?? P.moss : bq >= h - 2 ? P.tombC : P.tomb;
    vb.set(x + a, y + bq, z + lean, col);
    vb.set(x + a, y + bq, z + 1 + lean, col);
  }
  // engraving: little cross or RIP lines on the front face
  const cx = x + (w >> 1) - (w % 2 ? 0 : 1);
  vb.set(cx, y + 2, z + 1, P.tombD); vb.set(cx, y + 3, z + 1, P.tombD); vb.set(cx, y + 4, z, P.tombD);
  vb.set(cx - 1, y + 3, z + 1, P.tombD); vb.set(cx + 1, y + 3, z + 1, P.tombD);
  vb.set(x + 1, y, z + 2, P.moss);
}
const BATS = [
  ['X.......X', 'XX.X.X.XX', 'XXXXXXXXX', '.X..X..X.'],
  ['X.....X', 'XXX.XXX', '.XXXXX.', '..X.X..'],
  ['X.........X', 'XX..X.X..XX', 'XXXXXXXXXXX', '.XXX.X.XXX.', '..X.....X..'],
];
function batOn(F, u, y, shape, n = 2) {
  shape.forEach((row, i) => {
    const yy = y + shape.length - 1 - i;
    for (let k = 0; k < row.length; k++) if (row[k] === 'X') F.set(u + k, yy, n, P.bat);
  });
}
function placeBats(ctx, F, count, yMin, yMax, n = 2) {
  if (!SPOOKY) return;
  const R = ctx.R;
  let placed = 0;
  for (let tries = 0; tries < 60 && placed < count; tries++) {
    const shape = BATS[Math.floor(R() * BATS.length)];
    const w = shape[0].length, h = shape.length;
    const u = Math.round(F.umin + 4 + R() * (F.umax - F.umin - 8 - w));
    const y = Math.round(yMin + R() * (yMax - yMin - h));
    if (!F.free(u, y, u + w - 1, y + h - 1, 2)) continue;
    let ok = true;
    for (let k = 0; k < w && ok; k++) for (let j = 0; j < h && ok; j++) if (!F.get(u + k, y + j, 0) || F.get(u + k, y + j, n)) ok = false;
    if (!ok) continue;
    batOn(F, u, y, shape, n);
    F.occ.push([u, y, u + w - 1, y + h - 1]);
    placed++;
  }
}
// quarter cobweb in a plane: corner p, arms along du and dv (unit vectors)
function cobweb(ctx, p, du, dv, size = 6) {
  if (!SPOOKY) return;
  const vb = ctx.vb;
  const at = (i, j) => vb.set(p[0] + du[0] * i + dv[0] * j, p[1] + du[1] * i + dv[1] * j, p[2] + du[2] * i + dv[2] * j, P.web);
  for (let i = 0; i < size; i++) { at(i, 0); at(0, i); }
  for (let i = 1; i < size - 2; i++) at(i, i);
  for (const r of [2, 4, 6]) if (r < size + 1) for (let k = 0; k <= r; k++) at(k, r - k);
}
function ghostSheet(ctx, x, yTop, z) {
  if (!SPOOKY) return;
  const vb = ctx.vb;
  vb.set(x, yTop, z, P.web); vb.set(x, yTop - 1, z, P.web);
  vb.ellipsoid(x, yTop - 4, z, 2.4, 2.4, 2.4, P.ghost);
  for (let k = 0; k < 7; k++) {
    const y = yTop - 6 - k, r = 2.4 + k * 0.28;
    vb.disc(x, y, z, r, (xx, yy, zz) => {
      if (k === 6 && (((xx + zz) % 2) + 2) % 2 === 0) return 0;
      return k > 3 ? P.ghostB : P.ghost;
    });
  }
  // arms
  vb.set(x - 3, yTop - 7, z, P.ghost); vb.set(x - 4, yTop - 8, z, P.ghostB);
  vb.set(x + 3, yTop - 7, z, P.ghost); vb.set(x + 4, yTop - 6, z, P.ghost);
  vb.set(x - 1, yTop - 4, z + 2, P.eye); vb.set(x + 1, yTop - 4, z + 2, P.eye);
  vb.set(x, yTop - 6, z + 3, P.eye);
}
function witchHat(ctx, x, y, z, o = {}) {
  if (!SPOOKY) return;
  const vb = ctx.vb;
  vb.disc(x, y, z, 3.2, P.hat);
  vb.disc(x, y + 1, z, 2.1, o.band ?? P.hatBand);
  vb.disc(x, y + 2, z, 1.9, P.hatB);
  vb.disc(x, y + 3, z, 1.5, P.hat);
  vb.disc(x, y + 4, z, 1.1, P.hatB);
  vb.set(x, y + 5, z, P.hat); vb.set(x + 1, y + 5, z, P.hat);
  vb.set(x + 1, y + 6, z, P.hatB); vb.set(x + 2, y + 6, z, P.hat);
  vb.set(x + 3, y + 6, z, P.hat);
  vb.set(x, y + 1, z + 2, P.brass);
}
function spider(ctx, x, y, z, s = 1) {
  if (!SPOOKY) return;
  const vb = ctx.vb;
  vb.ellipsoid(x, y, z, 1.6 * s, 1.2 * s, 1.8 * s, P.bat);
  vb.ellipsoid(x, y, z + 2 * s, 1.1 * s, 0.9 * s, 1 * s, P.bat);
  vb.set(x - 1, y, z + 3 * s, 0xff4a3a | EMIT); vb.set(x + 1, y, z + 3 * s, 0xff4a3a | EMIT);
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) {
    const zz = z - 2 + k * 1.4 * s;
    vb.line(x + sx * 1.5 * s, y, zz, x + sx * 3.5 * s, y + 1.5 * s, zz + (k - 1.5), P.bat);
    vb.line(x + sx * 3.5 * s, y + 1.5 * s, zz + (k - 1.5), x + sx * 4.5 * s, y - 1.5 * s, zz + (k - 1.5) * 1.3, P.bat);
  }
}
function cauldron(ctx, x, y, z) {
  if (!SPOOKY) return;
  const vb = ctx.vb;
  for (let k = 0; k < 5; k++) vb.disc(x, y + 1 + k, z, [2.2, 3, 3.3, 3.2, 3.0][k], P.cauldron);
  vb.disc(x, y + 6, z, 3.2, P.cauldron, 1);
  vb.disc(x, y + 6, z, 2.3, P.brew);
  vb.set(x, y + 7, z, P.brew); vb.set(x + 1, y + 8, z - 1, P.bulbG);
  for (const [dx, dz] of [[-2, -2], [2, -2], [0, 2]]) vb.set(x + dx, y, z + dz, P.cauldron);
  addLight(ctx, [x + 0.5, y + 8, z + 0.5], [0.45, 1.0, 0.3], 3.5, 'lantern');
}
function broom(ctx, x, y, z, dx = 1) {
  if (!SPOOKY) return;
  const vb = ctx.vb;
  vb.line(x, y + 3, z, x + dx * 3, y + 16, z, P.woodLight);
  vb.fill(x - 1, y, z - 1, x + 1, y + 3, z + 1, (xx, yy, zz) => (yy === 3 ? P.twine : (xx + zz) % 2 ? P.hayB : P.hay));
}
function rockingChair(ctx, F, u, n, o = {}) {
  const c = o.col ?? P.woodDark;
  F.fill(u, 0, n, u, 1, n + 4, (uu, y, nn) => (y === 0 ? (nn === n || nn === n + 4 ? 0 : c) : (nn === n || nn === n + 4 ? c : 0)));
  F.fill(u + 4, 0, n, u + 4, 1, n + 4, (uu, y, nn) => (y === 0 ? (nn === n || nn === n + 4 ? 0 : c) : (nn === n || nn === n + 4 ? c : 0)));
  F.fill(u, 2, n + 1, u + 4, 3, n + 1, c); F.fill(u, 2, n + 3, u + 4, 3, n + 3, c);
  F.fill(u, 4, n + 1, u + 4, 4, n + 3, o.seat ?? P.wood);
  F.fill(u, 5, n, u + 4, 10, n, (uu, y) => (y === 10 || uu === u || uu === u + 4 || (uu - u) % 2 === 0 ? c : 0));
  F.fill(u, 6, n + 1, u, 6, n + 3, c); F.fill(u + 4, 6, n + 1, u + 4, 6, n + 3, c);
  if (o.quilt) F.fill(u + 1, 5, n + 1, u + 3, 5, n + 2, (uu, y, nn) => ((uu + nn) % 2 ? 0xc84a3a : 0xe8c070));
}
function bench(ctx, F, u, n, len = 10, o = {}) {
  const c = o.col ?? P.wood;
  F.fill(u, 3, n, u + len - 1, 3, n + 2, c);
  F.fill(u, 4, n, u + len - 1, 7, n, (uu, y) => (y === 5 ? 0 : c));
  for (const uu of [u, u + len - 1]) F.fill(uu, 0, n, uu, 2, n + 2, (a, y, nn) => (nn === n + 1 ? 0 : P.woodDark));
}
function crate(ctx, x, y, z, w, h, d, fruit) {
  const vb = ctx.vb;
  vb.fill(x, y, z, x + w - 1, y + h - 1, z + d - 1, (xx, yy, zz) => (yy === y + h - 1 || xx === x || xx === x + w - 1 || zz === z || zz === z + d - 1) && (yy - y) % 2 === 1 ? P.woodLight : P.wood);
  // produce heap on top
  const ty = y + h;
  for (let xx = x; xx < x + w; xx++) for (let zz = z; zz < z + d; zz++) {
    const hsh = vhash(xx, ty, zz, 21);
    let c;
    if (fruit === 'apple') c = hsh < 0.75 ? P.apple : P.appleG;
    else if (fruit === 'squash') c = hsh < 0.5 ? P.squash : hsh < 0.8 ? P.squashG : P.pumpkinL;
    else if (fruit === 'potato') c = hsh < 0.5 ? 0xb08a5a : 0x9a7448;
    else c = hsh < 0.6 ? P.pumpkin : P.pumpkinB;
    vb.set(xx, ty, zz, c);
    if (fruit === 'pumpkin' && (xx - x) % 2 === 0 && (zz - z) % 2 === 0) { vb.set(xx, ty + 1, zz, P.pumpkin); }
    if (fruit === 'apple' && hsh > 0.5 && xx > x && zz > z && xx < x + w - 1 && zz < z + d - 1) vb.set(xx, ty + 1, zz, P.apple);
  }
}
// A-frame chalkboard facing +z, front face at z
function chalkboard(ctx, x, y, z, text, o = {}) {
  const vb = ctx.vb, w = o.w ?? 6, h = o.h ?? 7;
  vb.fill(x - 1, y, z - 1, x - 1, y + h + 1, z - 1, P.wood);
  vb.fill(x + w, y, z - 1, x + w, y + h + 1, z - 1, P.wood);
  vb.fill(x - 1, y + h + 1, z - 1, x + w, y + h + 1, z - 1, P.wood);
  vb.fill(x, y + 2, z - 1, x + w - 1, y + h, z - 1, P.chalk);
  vb.fill(x - 1, y, z - 4, x - 1, y + h - 1, z - 3, (xx, yy, zz) => (zz === z - 4 && yy < 3) || (zz === z - 3 && yy >= y + 3) ? P.woodDark : 0);
  vb.fill(x + w, y, z - 4, x + w, y + h - 1, z - 3, (xx, yy, zz) => (zz === z - 4 && yy < 3) || (zz === z - 3 && yy >= y + 3) ? P.woodDark : 0);
  const p = M3(x + w / 2, y + 2 + (h - 1) / 2, z);
  ctx.signs.push({ x: p.x, y: p.y, z: r3(p.z + 0.012), w: w / VPM, h: (h - 1) / VPM, text, normal: [0, 0, 1], bg: hexs(P.chalk), fg: '#f0f0e4', kind: 'chalk' });
}
function bistroTable(ctx, x, y, z) {
  const vb = ctx.vb;
  vb.disc(x, y + 6, z, 2.2, P.iron);
  vb.fill(x, y, z, x, y + 5, z, P.iron);
  vb.fill(x - 1, y, z, x + 1, y, z, P.iron);
  vb.set(x, y + 7, z, 0xf2ece0); vb.set(x + 1, y + 7, z + 1, 0x8a5a3a);
  for (const sx of [-4, 4]) {
    vb.fill(x + sx - 1, y + 3, z - 1, x + sx + 1, y + 3, z + 1, P.iron);
    vb.fill(x + sx + (sx > 0 ? 1 : -1), y + 4, z - 1, x + sx + (sx > 0 ? 1 : -1), y + 7, z + 1, P.iron);
    vb.fill(x + sx, y, z, x + sx, y + 2, z, P.iron);
  }
}
function lobsterTrap(ctx, x, y, z) {
  const vb = ctx.vb;
  vb.fill(x, y, z, x + 5, y + 3, z + 3, (xx, yy, zz) => {
    const edge = (xx === x || xx === x + 5) + (yy === y || yy === y + 3) + (zz === z || zz === z + 3);
    if (edge >= 2) return P.woodLight;
    return (xx + yy + zz) % 2 ? 0x6a8a7a : 0;
  });
  vb.set(x + 2, y + 1, z + 1, 0xc0402a);
}
function buoy(ctx, x, y, z, cols) {
  const vb = ctx.vb;
  vb.ellipsoid(x, y, z, 1.2, 2.2, 1.2, (xx, yy) => cols[((yy - y + 3) >> 1) % cols.length]);
  vb.set(x, y + 3, z, P.wire);
}
function lifeRing(F, u, y, n = 2) {
  for (let a = -3; a <= 3; a++) for (let b2 = -3; b2 <= 3; b2++) {
    const d2 = a * a + b2 * b2;
    if (d2 > 11 || d2 < 3) continue;
    const ang = Math.atan2(b2, a);
    const q = Math.floor(((ang + Math.PI) / (Math.PI / 2)) + 0.5) % 4;
    F.set(u + a, y + b2, n, q % 2 ? P.white : P.red);
    F.set(u + a, y + b2, n - 1, q % 2 ? P.white : P.red);
  }
  F.occ.push([u - 3, y - 3, u + 3, y + 3]);
}
function woodpile(ctx, F, ua, ub, n0, rows = 6) {
  for (let y = 0; y < rows; y++) for (let u = ua; u <= ub; u++) {
    const h = vhash(u, y, n0, 5);
    F.set(u, y, n0, h < 0.5 ? 0xc8a070 : h < 0.8 ? 0xb08a5a : 0x8a6a44);
    F.set(u, y, n0 + 1, P.woodDark);
    F.set(u, y, n0 + 2, h < 0.4 ? 0xc8a070 : 0xa47c50);
  }
  F.fill(ua, rows, n0, ub, rows, n0 + 2, 0x7a6a5a);
}
function flagOn(ctx, F, u, y, n0 = 2) {
  // pole sticking out of the wall at 45°, a little Canadian flag
  for (let k = 0; k < 8; k++) F.set(u, y + k, n0 + k, P.metalL);
  const fy = y + 7, fn = n0 + 7;
  for (let a = 0; a < 12; a++) for (let b2 = 0; b2 < 7; b2++) {
    let c = a < 3 || a > 8 ? P.red : P.white;
    if (a >= 4 && a <= 7 && b2 >= 1 && b2 <= 5 && (Math.abs(a - 5.5) + Math.abs(b2 - 3) < 2.6)) c = P.red;
    F.set(u + 1 + a, fy - b2, fn, c);
  }
}

// ------------------------------------------------------------------ HOUSES
// per-id styling (anything missing is chosen from the seed)
const HOUSE_CFG = {
  cafe: { axis: 'z', pitch: 0.7, shop: 'cafe', chimney: { x: 0.28, z: -0.3 }, gableSign: true, awning: [0x2e6a4a, 0xf2e8d4], door: 0 },
  birdie: { axis: 'z', pitch: 0.9, porthole: true, chimney: { x: 0.25, z: -0.25, pipe: true }, door: -1, nautical: true },
  store: { axis: 'z', pitch: 0.55, shop: 'store', falseFront: true, door: 0, chimney: { x: -0.3, z: -0.25 } },
  agnes: { axis: 'x', pitch: 0.95, dormers: 1, witch: true, chimney: { x: -0.3, z: -0.2 }, door: 1 },
  boathouse: { axis: 'z', pitch: 0.72, boat: true, H: 26, door: 1 },
  doug: { axis: 'z', pitch: 0.8, police: true, gableSign: true, porch: true, door: 0 },
  clinic: { axis: 'z', pitch: 0.75, clinic: true, gableSign: true, sideDormers: true, chimney: { x: -0.25, z: -0.3 }, door: -1 },
  kids: { axis: 'x', pitch: 0.9, dormers: 2, porch: true, spooky: true, chimney: { x: 0.3, z: -0.2 }, door: -1 },
  house5: { axis: 'z', pitch: 1.0, porch: true, rocker: true, chimney: { x: -0.25, z: -0.2 }, door: 1 },
  lighthouseHut: { axis: 'x', pitch: 0.85, small: true, chimney: { x: 0.3, z: -0.2, pipe: true }, door: 0, nautical: true },
};
function houseCfg(spec, R) {
  const base = HOUSE_CFG[spec.id] || {};
  const cfg = {
    axis: R() < 0.6 ? 'z' : 'x',
    pitch: [0.7, 0.8, 0.9, 1.0][Math.floor(R() * 4)],
    door: R() < 0.5 ? -1 : 1,
    porch: !!spec.porch || R() < 0.3,
    chimney: spec.chimney || R() < 0.7 ? { x: R() < 0.5 ? -0.28 : 0.28, z: -0.25 } : null,
    dormers: (spec.floors || 1) > 1 ? 1 : 0,
    ...base,
  };
  if (spec.chimney && !cfg.chimney) cfg.chimney = { x: 0.28, z: -0.25 };
  if (spec.porch) cfg.porch = true;
  return cfg;
}

function buildHouse(spec, ctx) {
  const R = ctx.R;
  const cfg = houseCfg(spec, R);
  const W = evenV(spec.w ?? 8), D = evenV(spec.d ?? 7);
  const floors = Math.max(1, spec.floors || 1);
  const H = cfg.H ?? floors * FH + 2;
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const S = ctx.stiltV;
  const G = (ctx.G = S > 0 ? 0 : 4);
  const deckD = S > 0 ? 17 : 0;
  const vb = (ctx.vb = new VB(b.x0 - 26, -(S + 12), b.z0 - 22, b.x1 + 26, H + Math.max(W, D) * 0.62 + 40, b.z1 + 46));
  const sid = SIDING[spec.color] ?? SIDING.white;
  const shut = SHUTC[spec.color] ?? P.navy;
  const doorC = DOORC[spec.color] ?? 0x3a6a4a;
  const hw = ctx.hw;
  const ff = !!cfg.falseFront;

  const Rf = roofGeom({ axis: cfg.axis, b, H, pitch: cfg.pitch, oh: 4, ohR0: 3, ohR1: ff ? -3 : 3 });
  const st = roofStyle(spec.roof, ctx.seed);

  // ---- base
  if (S > 0) {
    vb.fill(b.x0 - 1, -2, b.z0 - 1, b.x1 + 1, -1, b.z1, (x, y, z) => (y === -1 ? plankTone(z, ctx.seed) : P.woodDark));
    stilts(ctx, b.x0 - 1, b.x1 + 2, b.z0 - 1, b.z1 + deckD + 1, S);
  } else foundation(ctx, b, G);

  // ---- body
  fillBody(vb, b, H, Rf, sid);
  const pf = H + (cfg.small ? 6 : 12), pc = H + 20; // false-front parapet heights
  if (ff) {
    for (let x = b.x0; x <= b.x1; x++) {
      const top = Math.abs(x + 0.5) < W * 0.33 ? pc : pf;
      vb.fill(x, H, b.z1 - 2, x, top, b.z1, sid);
    }
  }
  const F = frames(vb, b);
  for (const f of Object.values(F)) clapboard(f, sid, 0, H + 80, ctx.seed);
  cornerTrims(vb, b, 0, H - 1, P.trim);
  for (const f of Object.values(F)) {
    band(f, 0, 1, tone(sid, -0.25));
    if (floors > 1) band(f, FH, FH + 1, P.trim);
    band(f, H - 2, H - 1, P.trim);
  }
  if (ff) {
    // parapet trim + cornice
    for (const x of [b.x0, b.x1]) vb.fill(x - 1, H, b.z1 - 3, x + 1, pf, b.z1 + 1, P.trim);
    for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
      const top = Math.abs(x + 0.5) < W * 0.33 ? pc : pf;
      vb.fill(x, top + 1, b.z1 - 3, x, top + 2, b.z1 + 2, P.trim);
      vb.set(x, top, b.z1 + 2, (x & 1) ? P.trim : 0);
      vb.set(x, top, b.z1 + 1, P.trim);
    }
    for (const sx of [-1, 1]) {
      const xe = sx < 0 ? Math.ceil(-W * 0.33) - 1 : Math.floor(W * 0.33);
      vb.fill(xe, pf, b.z1 - 3, xe, pc + 2, b.z1 + 1, P.trim);
    }
  }

  // ---- roof
  drawRoof(vb, Rf, ff ? { ...st, noBargeR1: false } : st);
  if (ff) for (let s = Rf.S0; s <= Rf.S1; s++) for (let y = Rf.top(s) - Rf.t; y <= Rf.top(s); y++) if (vb.get(s, y, b.z1 - 3) === 0 && y >= H) vb.set(s, y, b.z1 - 3, P.trim);

  // ---- chimney
  if (cfg.chimney) {
    const cx = Math.round(cfg.chimney.x * W), cz = Math.round(cfg.chimney.z * D);
    const rt = Math.max(Rf.topAt(cx, cz), Rf.topAt(cx + 4, cz), Rf.topAt(cx, cz + 4));
    const top = Math.max(rt + 8, Rf.ridge + 3);
    if (cfg.chimney.pipe) {
      vb.fill(cx, H - 2, cz, cx + 1, top, cz + 1, P.metal);
      vb.fill(cx - 1, top + 1, cz - 1, cx + 2, top + 1, cz + 2, P.iron);
      vb.fill(cx, top + 2, cz, cx + 1, top + 2, cz + 1, P.iron);
      ctx.smoke.push(M3(cx + 1, top + 3, cz + 1));
    } else chimneyBrick(ctx, cx - 2, cz - 2, H - 2, top);
  }

  // ---- dormers
  const dormerOpts = { siding: sid, style: st, curtain: pick(CURTAINS, R()), lit: true };
  if (cfg.axis === 'x' && cfg.dormers) {
    const n = cfg.dormers;
    for (let i = 0; i < n; i++) {
      const uc = n === 1 ? (cfg.door > 0 ? -Math.round(W * 0.12) : Math.round(W * 0.12)) : Math.round((-0.25 + 0.5 * i) * W);
      dormer(ctx, F.front, Rf, uc, { ...dormerOpts, cat: hw && cfg.witch && i === 0, jack: hw && cfg.spooky && i === 1, w: 16 });
    }
  }
  if (cfg.axis === 'z' && (cfg.sideDormers || (floors > 1 && !cfg.shop && !cfg.gableSign && cfg.dormers))) {
    for (const f of ['left', 'right']) dormer(ctx, F[f], Rf, 0, { ...dormerOpts, w: 14, nf: -Math.round(5 / Rf.p) });
  }

  // ---- front: door & windows
  const Ff = F.front;
  const doorU = cfg.door === 0 ? 0 : cfg.door < 0 ? Math.round(-W * 0.25) : Math.round(W * 0.25);
  const cur = pick(CURTAINS, R());
  const winO = { shutter: cfg.shop ? null : shut, box: true, curtain: R() < 0.6 ? cur : null };
  let dr;
  if (cfg.shop === 'store') dr = doorOn(ctx, Ff, 0, { w: 12, h: 18, double: true, glass: true, color: 0x2e5a40, lantern: false });
  else if (cfg.boat) {
    dr = doorOn(ctx, Ff, doorU, { color: doorC, lanternLeft: true });
    boatDoors(ctx, Ff, -Math.round(W * 0.12), 26, 20);
  } else dr = doorOn(ctx, Ff, doorU, { color: doorC, glass: cfg.shop === 'cafe' || cfg.clinic, lanternLeft: cfg.door > 0 });
  if (cfg.shop === 'cafe') lanternOn(ctx, Ff, dr.u0 - 5, 10);
  // ground floor windows
  const y1 = 7;
  if (cfg.shop === 'store') {
    for (const sx of [-1, 1]) {
      const ww = 30, u0 = sx < 0 ? -W / 2 + 7 : W / 2 - 7 - ww;
      windowOn(ctx, Ff, u0, 4, {
        w: ww, h: 13, mullU: [u0 + 10, u0 + 20], mullY: [4 + 9], lit: true,
        glassFn: (u, y) => (y === 4 ? [P.pumpkin, P.apple, P.squash, P.pumpkinB][Math.floor(vhash(u, 1, 2) * 4)] : y === 5 && (u % 3 === 0) ? P.pumpkin : glassFn(u0, 16)(u, y)),
      });
      Ff.fill(u0 - 1, 0, 1, u0 + ww, 2, 1, (u, y) => (y === 1 && u > u0 && u < u0 + ww - 1 ? tone(0x2e5a40, -0.1) : 0x2e5a40));
    }
  } else if (cfg.shop === 'cafe') {
    for (const sx of [-1, 1]) {
      const ww = 15, u0 = sx < 0 ? -W / 2 + 7 : W / 2 - 7 - ww;
      windowOn(ctx, Ff, u0, 6, { w: ww, h: 11, mullU: [u0 + 5, u0 + 10], mullY: [6 + 7], lit: true, curtain: null, box: true, boxCol: 0x2e5a40 });
    }
  } else if (!cfg.boat) {
    const segL = [b.x0 + 6, dr.u0 - 6], segR = [dr.u1 + 6, b.x1 - 6];
    let lit = 0;
    for (const [ua, ub] of [segL, segR]) {
      const len = ub - ua + 1;
      const cnt = Math.min(2, Math.floor(len / 17));
      windowRow(ctx, Ff, ua, ub, y1, cnt, winO, () => ({ lit: lit++ < 2, jack: hw && lit === 1 && R() < 0.7 }));
    }
  } else {
    windowOn(ctx, Ff, b.x1 - 14, y1, { ...winO, lit: true });
  }
  // upper floors
  for (let f = 1; f < floors; f++) {
    const cnt = Math.max(2, Math.min(4, Math.floor((W - 10) / 19)));
    windowRow(ctx, Ff, b.x0 + 4, b.x1 - 4, f * FH + y1, cnt, { shutter: cfg.shop === 'store' ? null : shut, box: false, curtain: cur }, (i) => ({ lit: i === 1, cat: hw && cfg.witch && i === 0 && cfg.axis !== 'x' }));
  }
  // gable: sign or attic window
  if (cfg.axis === 'z' && !ff) {
    const gy = H + Math.round((Rf.ridge - H) * 0.3);
    if (cfg.gableSign && spec.sign) {
      const sh = 8, sy = cfg.porch ? H + 4 : H + 1;
      // widest board whose top corners stay below the bargeboard + hanging string lights
      let hwS = 4;
      while (hwS < 23 && Rf.top(hwS + 2) - Rf.t - 5 > sy + sh + 1 && Rf.top(-hwS - 3) - Rf.t - 5 > sy + sh + 1) hwS++;
      const sw = hwS * 2;
      signOn(ctx, Ff, 0, sy, sw, sh, spec.sign, { bg: cfg.police ? 0x2c3c64 : cfg.clinic ? P.white : 0x2e5a40, fg: cfg.police || !cfg.clinic ? '#f2e8d4' : '#b02a24', edge: cfg.clinic ? 0xb02a24 : P.trim });
      if (Rf.ridge - (sy + sh + 4) > 12) windowOn(ctx, Ff, -2, sy + sh + 4, { w: 4, h: 4, mull: false });
    } else if (cfg.porthole) portholeOn(ctx, Ff, 0, gy + 4, 4);
    else windowOn(ctx, Ff, -3, gy, { w: 6, h: 7, curtain: R() < 0.5 ? pick(CURTAINS, R()) : null, lit: false, jack: hw && cfg.spooky });
    const Fb = F.back;
    windowOn(ctx, Fb, -3, gy, { w: 6, h: 7 });
  }
  if (cfg.axis === 'x') {
    const gy = H + Math.round((Rf.ridge - H) * 0.25);
    for (const f of ['left', 'right']) windowOn(ctx, F[f], -3, gy, { w: 6, h: 7, curtain: pick(CURTAINS, R()) });
  }
  if (ff && spec.sign) signOn(ctx, Ff, 0, H + 3, Math.round(W * 0.6), 13, spec.sign, { bg: P.cream, fg: '#8a2a22', edge: P.trim, n: 1 });

  // ---- sides & back
  for (const f of ['left', 'right']) {
    const Fs = F[f];
    for (let fl = 0; fl < floors; fl++) {
      const cnt = Math.max(1, Math.min(3, Math.floor((D - 10) / 22)));
      windowRow(ctx, Fs, Fs.umin + 5, Fs.umax - 5, fl * FH + y1, cnt, { shutter: cfg.shop === 'store' || cfg.boat ? null : shut, box: fl === 0 && R() < 0.5 && !S, curtain: R() < 0.5 ? pick(CURTAINS, R()) : null }, (i) => ({ lit: fl === 0 && i === 0 && f === 'right' }));
    }
  }
  for (let fl = 0; fl < floors; fl++) {
    const cnt = Math.max(1, Math.min(3, Math.floor((W - 10) / 24)));
    windowRow(ctx, F.back, F.back.umin + 6, F.back.umax - 6, fl * FH + y1, cnt, { shutter: S ? null : shut, curtain: pick(CURTAINS, R()) });
  }
  if (S > 0 && W >= 64) doorOn(ctx, F.back, Math.round(W * 0.28), { color: tone(doorC, -0.1), main: false, lantern: false });

  // ---- front deck (stilt houses) / porch / stoop
  const jackSpots = [];
  if (S > 0) {
    deckOn(ctx, Ff, b.x0 - 1, b.x1 + 1, deckD);
    postAt(Ff, b.x0 - 1, deckD - 1, 0, 8, P.trim);
    postAt(Ff, b.x1, deckD - 1, 0, 8, P.trim);
    railN(Ff, b.x0 - 1, 2, deckD - 2);
    railN(Ff, b.x1 + 1, 2, deckD - 2);
    if (!cfg.witch) jackSpots.push({ x: b.x0, y: 9, z: b.z1 + deckD - 1, s: 1 });
    jackSpots.push({ x: b.x1, y: 9, z: b.z1 + deckD - 1, s: 1 });
  } else if (cfg.porch) {
    const pd = 16;
    const ua = b.x0 + 2, ub = b.x1 - 2;
    const posts = [ua, ...(W > 60 ? [Math.round((ua + dr.u0) / 2) - 1] : []), dr.u0 - 4, dr.u1 + 3, ...(W > 60 ? [Math.round((ub + dr.u1) / 2)] : []), ub - 1].filter((v, i, a) => a.indexOf(v) === i).sort((a2, b2) => a2 - b2);
    const yRoofA = floors > 1 ? FH + 4 : cfg.axis === 'z' ? H + 1 : H - 3;
    const pr = porchOn(ctx, Ff, { ua, ub, depth: pd, posts, gap: [dr.u0 - 1, dr.u1 + 1], yPost: Math.min(19, yRoofA - 5), yRoofA, roofStyle: st });
    for (const sp of pr.spots) jackSpots.push({ fp: true, u: sp.u, y: sp.y, n: sp.n, s: 1 });
    for (const pu of [posts[0], posts[posts.length - 1]]) jackSpots.push({ fp: true, u: pu + (pu === posts[0] ? 0 : 1), y: 9, n: pd - 1, s: 1, onRail: true });
    ctx.porchFront = { pd, yPost: pr.yPost, ua, ub, posts };
    if (cfg.rocker) rockingChair(ctx, Ff, ub - 14, 4, { quilt: true });
    if (cfg.police) bench(ctx, Ff, ua + 3, 4, 12);
  } else {
    // stoop + canopy
    Ff.fill(dr.u0 - 3, -G, 1, dr.u1 + 3, -1, 5, (u, y, n) => (y === -1 ? plankTone(n, 1) : P.stoneB));
    const sp = stepsOn(ctx, Ff, dr.u0 - 2, dr.u1 + 2, 6, G);
    for (const s of sp) jackSpots.push({ fp: true, u: s.u, y: s.y, n: s.n, s: 1 });
    canopyOn(ctx, Ff, dr.u0 - 3, dr.u1 + 3, 20, st);
    const a = Ff.pt(dr.u0 - 3, 0, 1), c = Ff.pt(dr.u1 + 3, 0, 5);
    ctx.porch.push({ x0: r3(Math.min(a[0], c[0]) / VPM - 0.06), z0: r3(a[2] / VPM - 0.06), x1: r3(Math.max(a[0], c[0]) / VPM + 0.06), z1: r3(c[2] / VPM + 0.06), y: 0 });
  }

  // ---- awnings & shop dressing
  if (cfg.shop === 'store') {
    awningOn(Ff, b.x0 + 2, b.x1 - 2, 22, 10, [0xc8382e, 0xf2e8d4], { drop: 4 });
    // produce stands on the deck
    crate(ctx, b.x0 + 8, 0, b.z1 + 4, 8, 4, 5, 'pumpkin');
    crate(ctx, b.x0 + 17, 0, b.z1 + 4, 7, 3, 5, 'squash');
    crate(ctx, b.x0 + 12, 4, b.z1 + 2, 8, 3, 3, 'apple');
    crate(ctx, b.x1 - 15, 0, b.z1 + 4, 8, 4, 5, 'apple');
    crate(ctx, b.x1 - 24, 0, b.z1 + 4, 7, 3, 5, 'potato');
    crate(ctx, b.x1 - 20, 4, b.z1 + 2, 8, 3, 3, 'pumpkin');
    chalkboard(ctx, dr.u1 + 6, 0, b.z1 + 12, 'PUMPKINS 3$');
    bench(ctx, Ff, b.x0 + 30, 2, 9);
    lanternOn(ctx, Ff, dr.u0 - 4, 12);
    lanternOn(ctx, Ff, dr.u1 + 3, 12);
  }
  if (cfg.shop === 'cafe') {
    awningOn(Ff, b.x0 + 3, b.x1 - 3, 21, 9, cfg.awning, { drop: 4 });
    chalkboard(ctx, dr.u1 + 5, 0, b.z1 + 13, 'SOUPE DU JOUR');
    bistroTable(ctx, b.x0 + 14, 0, b.z1 + 10);
    bistroTable(ctx, b.x1 - 13, 0, b.z1 + 10);
  }
  if (cfg.nautical) {
    lifeRing(Ff, dr.uc + (cfg.door < 0 ? 12 : -12), 12);
    if (S > 0) {
      lobsterTrap(ctx, b.x1 - 9, 0, b.z1 + 4);
      lobsterTrap(ctx, b.x1 - 9, 4, b.z1 + 4);
      lobsterTrap(ctx, b.x1 - 16, 0, b.z1 + 5);
    } else {
      lobsterTrap(ctx, b.x1 + 3, -G, b.z1 - 10);
      lobsterTrap(ctx, b.x1 + 3, -G + 4, b.z1 - 10);
    }
    const Fs = F.right;
    let nbuoy = 0;
    for (let u = Fs.umin + 4; u <= Fs.umax - 4 && nbuoy < 3; u++) {
      const y = 13 - (nbuoy % 2) * 2;
      if (!Fs.free(u - 2, y - 3, u + 2, y + 3, 0)) continue;
      const pz = Fs.P(u, 0)[1];
      buoy(ctx, b.x1 + 3, y, pz, [[P.red, P.white], [0xe8c040, P.red], [P.white, 0x3a7ab0]][nbuoy++]);
      Fs.occ.push([u - 2, y - 3, u + 2, y + 3]);
      u += 4;
    }
  }
  if (cfg.police) {
    lanternOn(ctx, Ff, dr.uc - 1, 19, { col: 0x6a9cff | EMIT, light: [0.45, 0.6, 1.0], kind: 'lantern', radius: 5 });
    flagOn(ctx, Ff, b.x1 - 4, 14);
  }
  if (cfg.clinic) {
    // red cross plaque beside the door
    const u = dr.u1 + 5;
    Ff.fill(u, 9, 1, u + 6, 15, 1, P.white);
    Ff.fill(u + 2, 10, 2, u + 4, 14, 2, P.red);
    Ff.fill(u + 1, 11, 2, u + 5, 13, 2, P.red);
    Ff.occ.push([u, 9, u + 6, 15]);
    bench(ctx, Ff, dr.u1 + 4, 6, 10);
  }
  if (cfg.witch && hw) {
    cauldron(ctx, b.x0 + 10, 0, b.z1 + 9);
    broom(ctx, dr.u0 - 3, 0, b.z1 + 2, -1);
    witchHat(ctx, b.x0, 9, b.z1 + deckD - 1);
  }

  // ---- Halloween
  if (hw) {
    const ffr = (s) => (s.fp ? Ff.pt(s.u, s.y, s.n).map(Math.floor) : [s.x, s.y, s.z]);
    for (const s of jackSpots) { const [x, y, z] = ffr(s); jack(ctx, x, y, z, { size: s.s }); }
    // by the door: hay bale + corn stalks + pumpkins
    const dz = S > 0 ? b.z1 + 2 : cfg.porch ? b.z1 + 2 : b.z1 + 7;
    const dyy = S > 0 || cfg.porch ? 0 : -G;
    const side = cfg.door <= 0 ? 1 : -1;
    const hx = side > 0 ? dr.u1 + 3 : dr.u0 - 10;
    if (!cfg.shop) {
      hayBale(ctx, hx, dyy, dz, 'x');
      jack(ctx, hx + 3, dyy + 4, dz + 2, { size: 2 });
      cornStalks(ctx, side > 0 ? dr.u1 + 11 : dr.u0 - 13, dyy, dz);
      pumpkinPlain(ctx, side > 0 ? dr.u1 + 1 : dr.u0 - 2, dyy, dz + 7, 1);
    } else {
      cornStalks(ctx, dr.u0 - 4, 0, b.z1 + 2);
      cornStalks(ctx, dr.u1 + 2, 0, b.z1 + 2);
      jack(ctx, dr.u0 - 3, 0, b.z1 + 7, { size: 2 });
      jack(ctx, dr.u1 + 3, 0, b.z1 + 7, { size: 2 });
    }
    // string lights
    const pts = frontEdgePts(Rf);
    if (!ff) stringLights(ctx, pts, { span: 14 });
    else stringLights(ctx, Array.from({ length: W + 2 }, (_, i) => [b.x0 - 1 + i, H + 1, b.z1 + 2]), { span: 13, sag: 1 });
    if (ctx.porchFront) {
      const pfm = ctx.porchFront;
      stringLights(ctx, Array.from({ length: pfm.ub - pfm.ua + 1 }, (_, i) => { const p = Ff.pt(pfm.ua + i, pfm.yPost - 2, pfm.pd + 1); return [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])]; }), { span: 10, sag: 1 });
    }
    // bats
    placeBats(ctx, Ff, cfg.spooky ? 3 : 2, 8, Math.min(Rf.ridge - 6, H + 20));
    placeBats(ctx, F[R() < 0.5 ? 'left' : 'right'], 2, 8, H + 6);
    placeBats(ctx, F.back, 1, 8, H + 4);
    // cobwebs at the top front corners
    cobweb(ctx, [b.x0 + 2, H - 3, b.z1 + 2], [1, 0, 0], [0, -1, 0], 6);
    if (ctx.porchFront) {
      const pfm = ctx.porchFront;
      const pA = Ff.pt(pfm.posts[0] + 2, pfm.yPost - 2, pfm.pd).map(Math.floor);
      cobweb(ctx, pA, [1, 0, 0], [0, -1, 0], 6);
      const pB = Ff.pt(pfm.posts[pfm.posts.length - 1] - 1, pfm.yPost - 2, pfm.pd).map(Math.floor);
      cobweb(ctx, pB, [-1, 0, 0], [0, -1, 0], 5);
      if (cfg.spooky || R() < 0.5) {
        const gu = Math.round((pfm.posts[0] + dr.u0) / 2);
        const gp = Ff.pt(gu, pfm.yPost - 2, pfm.pd - 2).map(Math.floor);
        ghostSheet(ctx, gp[0], gp[1], gp[2]);
      }
    } else {
      cobweb(ctx, [b.x1 - 2, H - 3, b.z1 + 2], [-1, 0, 0], [0, -1, 0], 5);
    }
    // yard: tombstones (ground houses)
    if (S === 0) {
      const n = cfg.spooky ? 4 : 2 + Math.floor(R() * 2);
      const ys = -G;
      const zs = b.z1 + (cfg.porch ? 24 : 12);
      const cands = [b.x0 + 4, b.x0 + 13, b.x1 - 9, b.x1 - 18, b.x0 + 22];
      for (let i = 0; i < n; i++) {
        const x = cands[i % cands.length];
        if (Math.abs(x - dr.uc) < 10) continue;
        if (SPOOKY) tombstone(ctx, x, ys, zs + Math.floor(R() * 5), i % 3 === 1 ? 1 : (i % 3 === 2 ? 2 : 0));
      }
      if (cfg.spooky) { spider(ctx, Math.round(W * 0.2), Rf.topAt(Math.round(W * 0.2), b.z1 - 6) + 3, b.z1 - 6, 1.4); }
    }
    if (cfg.spooky && S === 0) witchHat(ctx, b.x0 + 6, -G, b.z1 + 33);
  }
  if (!hw && !cfg.shop) {
    // autumn only: a couple of pumpkins & a hay bale
    pumpkinPlain(ctx, dr.u1 + 3, S > 0 || cfg.porch ? 0 : -G, b.z1 + (S > 0 || cfg.porch ? 3 : 8), 2);
  }

  ctx.solids.push({ x0: b.x0 / VPM, y0: -G / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, y1: H / VPM, z1: (b.z1 + 1) / VPM });
  ctx.solids.push({ roof: true, x0: (Rf.axis === 'z' ? Rf.S0 : Rf.R0) / VPM, y0: H / VPM, z0: (Rf.axis === 'z' ? Rf.R0 : Rf.S0) / VPM, x1: ((Rf.axis === 'z' ? Rf.S1 : Rf.R1) + 1) / VPM, y1: (Rf.ridge + 1) / VPM, z1: ((Rf.axis === 'z' ? Rf.R1 : Rf.S1) + 1) / VPM });
  return ctx;
}
function chimneyBrick(ctx, x0, z0, y0, y1, w = 5) {
  const vb = ctx.vb;
  vb.fill(x0, y0, z0, x0 + w - 1, y1, z0 + w - 1, brickFn(ctx.seed));
  vb.fill(x0 - 1, y1 - 1, z0 - 1, x0 + w, y1, z0 + w, P.stoneB);
  vb.fill(x0 + 1, y1, z0 + 1, x0 + w - 2, y1, z0 + w - 2, P.woodDD);
  vb.clear(x0 + 1, y1, z0 + 1, x0 + w - 2, y1, z0 + w - 2);
  vb.fill(x0 + 1, y1 - 1, z0 + 1, x0 + w - 2, y1 - 1, z0 + w - 2, P.woodDD);
  ctx.smoke.push(M3(x0 + w / 2, y1 + 1, z0 + w / 2));
}
function stoneChimney(ctx, x0, z0, y0, y1, w = 6, d = 7) {
  const vb = ctx.vb;
  const fn = stoneFn(ctx.seed + 3);
  for (let y = y0; y <= y1; y++) {
    const shrink = y > y1 - 14 ? 1 : 0;
    vb.fill(x0 + shrink, y, z0 + shrink, x0 + w - 1 - shrink, y, z0 + d - 1 - shrink, fn);
  }
  vb.fill(x0, y1 + 1, z0, x0 + w - 1, y1 + 1, z0 + d - 1, P.stoneD);
  vb.fill(x0 + 2, y1 + 1, z0 + 2, x0 + w - 3, y1 + 1, z0 + d - 3, P.woodDD);
  ctx.smoke.push(M3(x0 + w / 2, y1 + 2.5, z0 + d / 2));
}
function canopyOn(ctx, F, ua, ub, y, st) {
  const sty = { ...st, kind: st.kind };
  for (let n = 1; n <= 5; n++) {
    const yy = y + 3 - Math.round(n * 0.6);
    F.fill(ua, yy, n, ub, yy, n, (u) => (u === ua || u === ub || n === 5 ? P.trim : shingle(sty, n, u, yy)));
    F.fill(ua, yy - 1, n, ub, yy - 1, n, P.trimShade);
  }
  for (const u of [ua + 1, ub - 1]) { F.set(u, y - 2, 1, P.trim); F.set(u, y - 1, 2, P.trim); F.set(u, y - 3, 1, P.trim); }
  F.occ.push([ua, y - 3, ub, y + 3]);
}
function portholeOn(ctx, F, uc, yc, r) {
  for (let a = -r - 1; a <= r; a++) for (let b2 = -r - 1; b2 <= r; b2++) {
    const dx = a + 0.5, dy = b2 + 0.5, d2 = dx * dx + dy * dy;
    if (d2 <= (r + 0.6) * (r + 0.6) && d2 > (r - 0.6) * (r - 0.6)) { F.set(uc + a, yc + b2, 1, P.brass); }
    else if (d2 <= (r - 0.6) * (r - 0.6)) { F.set(uc + a, yc + b2, 0, P.glass | GLASS); F.set(uc + a, yc + b2, 1, 0); }
  }
  F.occ.push([uc - r - 1, yc - r - 1, uc + r, yc + r]);
}
function boatDoors(ctx, F, uc, w, h) {
  const u0 = uc - (w >> 1), u1 = u0 + w - 1;
  const dc = 0x3a5a44;
  F.clear(u0 - 1, 0, 1, u1 + 1, h + 1, 1);
  F.fill(u0, 0, 0, u1, h - 1, 0, (u) => ((u - u0) % 3 === 0 ? tone(dc, -0.12) : dc));
  for (const [a, bq] of [[u0, u0 + (w >> 1) - 1], [u0 + (w >> 1), u1]]) {
    F.fill(a, 0, 1, bq, 0, 1, P.trim); F.fill(a, h - 1, 1, bq, h - 1, 1, P.trim);
    F.fill(a, 0, 1, a, h - 1, 1, P.trim); F.fill(bq, 0, 1, bq, h - 1, 1, P.trim);
    const lw = bq - a;
    for (let k = 1; k < h - 1; k++) {
      const t = k / (h - 1);
      F.set(Math.round(a + t * lw), k, 1, P.trim);
      F.set(Math.round(bq - t * lw), k, 1, P.trim);
    }
  }
  F.fill(u0 - 2, h, 1, u1 + 2, h, 2, P.iron);
  // crossed oars above the doors
  for (let k = 0; k < 12; k++) { F.set(uc - 6 + k, h + 2 + Math.round(k * 0.5), 2, P.woodLight); F.set(uc + 5 - k, h + 2 + Math.round(k * 0.5), 2, P.woodLight); }
  F.fill(uc - 8, h + 1, 2, uc - 6, h + 2, 2, P.red); F.fill(uc + 5, h + 1, 2, uc + 7, h + 2, 2, P.red);
  F.occ.push([u0 - 2, 0, u1 + 2, h + 9]);
}
function stringLights(ctx, pts, o = {}) {
  const vb = ctx.vb, span = o.span ?? 12, sag = o.sag ?? 2;
  const cols = o.cols ?? (SPOOKY ? [P.bulbO, P.bulbP] : [P.bulbW, P.bulbO]);
  let prev = null, nb = 0;
  const skip = o.skip ?? (() => false);
  for (let i = 0; i < pts.length; i++) {
    if (skip(pts[i])) { prev = null; continue; }
    const t = (i % span) / span;
    const d = Math.round(Math.sin(t * Math.PI) * sag);
    const [x, y, z] = pts[i];
    const wy = y - d;
    vb.set(x, wy, z, P.wire);
    if (prev !== null && Math.abs(prev - wy) > 1) for (let yy = Math.min(prev, wy) + 1; yy < Math.max(prev, wy); yy++) vb.set(x, yy, z, P.wire);
    prev = wy;
    if (i % 3 === 1) {
      const c = cols[nb++ % cols.length];
      vb.set(x, wy - 1, z, c);
      if (nb % 6 === 3) addLight(ctx, [x + 0.5, wy - 2.2, z + 0.5], c === P.bulbP ? [0.7, 0.4, 1.0] : c === P.bulbW ? [1.0, 0.82, 0.55] : [1.0, 0.55, 0.2], 3.2, 'string');
    }
  }
}

// ------------------------------------------------------------------ CABINS (log)
const CABIN_CFG = {
  nana: { pitch: 0.9, porch: true, sign: "NANA'S COCOA", chimney: 'stone', rocker: true, woodpile: true },
  gus: { pitch: 0.85, chimney: 'stone', woodpile: true, canopy: true, paddle: true },
  trapperHut: { pitch: 0.95, chimney: 'pipe', pelts: true, canopy: true },
};
function buildCabin(spec, ctx) {
  const R = ctx.R;
  const cfg = { pitch: 0.9, chimney: spec.chimney ? 'stone' : null, porch: !!spec.porch, ...(CABIN_CFG[spec.id] || {}) };
  if (spec.porch) cfg.porch = true;
  const W = evenV(spec.w ?? 8), D = evenV(spec.d ?? 7);
  const H = 26;
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const G = (ctx.G = 4);
  const vb = (ctx.vb = new VB(b.x0 - 24, -16, b.z0 - 20, b.x1 + 26, H + D * 0.6 + 34, b.z1 + 48));
  const logC = SIDING.log;
  const hw = ctx.hw;
  const Rf = roofGeom({ axis: 'x', b, H, pitch: cfg.pitch, oh: 5, ohR0: 4, ohR1: 4, t: 3 });
  const st = roofStyle(spec.roof ?? 'moss', ctx.seed, { soffit: P.woodDark, barge: P.woodDark, fascia: P.woodDark, gutter: false });
  foundation(ctx, b, G, 6);
  fillBody(vb, b, H, Rf, logC);
  const F = frames(vb, b);
  for (const f of ['front', 'back']) logSkin(F[f], logC, 0, H - 1, ctx.seed);
  for (const f of ['left', 'right']) {
    logSkin(F[f], logC, 0, H - 1, ctx.seed);
    // gable: vertical planks
    const Fs = F[f];
    for (let u = Fs.umin; u <= Fs.umax; u++) for (let y = H; y < Rf.ridge; y++) if (Fs.get(u, y, 0)) {
      Fs.set(u, y, 0, ((u - Fs.umin) >> 1) % 2 ? 0x7a5232 : 0x6c482c);
      if (((u - Fs.umin) % 4) === 0 && !Fs.get(u, y, 1)) Fs.set(u, y, 1, 0x5c3c26);
    }
  }
  // corner log ends: alternate courses
  for (let k = 0; k * 3 < H; k++) {
    const y0 = k * 3 + 1, y1 = k * 3 + 2;
    const endC = (x, y, z) => (y === y1 ? 0xd2aa78 : 0xbe9464);
    if (k % 2 === 0) {
      for (const z of [b.z0, b.z1]) {
        const zz = z === b.z0 ? [z - 1, z] : [z, z + 1];
        vb.fill(b.x0 - 3, y0, zz[0], b.x0 - 1, y1, zz[1], (x, y) => (x === b.x0 - 3 ? endC(x, y) : logC));
        vb.fill(b.x1 + 1, y0, zz[0], b.x1 + 3, y1, zz[1], (x, y) => (x === b.x1 + 3 ? endC(x, y) : logC));
      }
    } else {
      for (const x of [b.x0, b.x1]) {
        const xx = x === b.x0 ? [x - 1, x] : [x, x + 1];
        vb.fill(xx[0], y0, b.z0 - 3, xx[1], y1, b.z0 - 1, (x2, y, z) => (z === b.z0 - 3 ? endC(x2, y) : logC));
        vb.fill(xx[0], y0, b.z1 + 1, xx[1], y1, b.z1 + 3, (x2, y, z) => (z === b.z1 + 3 ? endC(x2, y) : logC));
      }
    }
  }
  drawRoof(vb, Rf, st);
  // chimney
  if (cfg.chimney === 'stone') {
    const cz = -Math.round(D * 0.15) - 3;
    stoneChimney(ctx, b.x1 + 2, cz, -G - 2, Rf.ridge + 6, 7, 7);
    // chimney base shoulders
  } else if (cfg.chimney === 'pipe') {
    const cx = Math.round(W * 0.25), cz = -Math.round(D * 0.2);
    const top = Rf.ridge + 6;
    vb.fill(cx, H, cz, cx + 1, top, cz + 1, P.metal);
    vb.fill(cx - 1, top + 1, cz - 1, cx + 2, top + 1, cz + 2, P.iron);
    vb.fill(cx, top + 2, cz, cx + 1, top + 2, cz + 1, P.iron);
    ctx.smoke.push(M3(cx + 1, top + 3, cz + 1));
  }
  const Ff = F.front;
  const dr = doorOn(ctx, Ff, 0, { color: DOORC.log, plank: true, lantern: !cfg.porch, frame: 0x5c3c26 });
  const shutC = spec.id === 'nana' ? 0x3a6a4a : spec.id === 'gus' ? 0x8e2a22 : 0x5c3c26;
  const winO = { shutter: shutC, box: spec.id !== 'trapperHut', frame: 0xe8dcc0, curtain: spec.id === 'nana' ? 0xc84a3a : 0xe8c070 };
  const nW = W >= 80 ? 2 : 1;
  windowRow(ctx, Ff, b.x0 + 5, dr.u0 - 5, 7, nW, winO, (i) => ({ lit: true, jack: hw && i === 0 }));
  windowRow(ctx, Ff, dr.u1 + 5, b.x1 - 5, 7, nW, winO, (i) => ({ lit: i === 0 }));
  windowOn(ctx, F.left, -3, 7, { ...winO, box: false, lit: true });
  windowOn(ctx, F.back, -3, 7, { ...winO, box: false });
  if (W >= 64) windowOn(ctx, F.back, Math.round(W * 0.25), 7, { ...winO, box: false });
  windowOn(ctx, F.left, -3, H + 6, { w: 5, h: 6, frame: 0xe8dcc0 });
  if (cfg.chimney !== 'stone') windowOn(ctx, F.right, -3, 7, { ...winO, box: false });

  const jackSpots = [];
  if (cfg.porch) {
    const pd = 22;
    const ua = b.x0 - 3, ub = b.x1 + 3;
    const posts = [ua, Math.round(ua + (dr.u0 - 4 - ua) / 2), dr.u0 - 5, dr.u1 + 4, Math.round(ub - (ub - dr.u1 - 4) / 2), ub - 1];
    const pr = porchOn(ctx, Ff, { ua, ub, depth: pd, posts, gap: [dr.u0 - 3, dr.u1 + 3], yPost: 20, yRoofA: H - 1, roofStyle: { ...st, barge: P.woodDark }, postCol: 0x7a5232, railCol: 0x8a5a34, deckCol: P.plank });
    for (const sp of pr.spots) jackSpots.push({ u: sp.u, y: sp.y, n: sp.n, s: 1 });
    jackSpots.push({ u: posts[0], y: 9, n: pd - 1, s: 1 }, { u: posts[posts.length - 1] + 1, y: 9, n: pd - 1, s: 1 });
    // hanging sign under the porch beam
    if (cfg.sign) {
      const sw = 26, sh = 5;
      const p = Ff.pt(-sw / 2, 0, pd).map(Math.floor);
      signFree(ctx, p[0], 13, p[2] + 1, sw, sh, cfg.sign, { bg: 0xf0e0c0, edge: 0x5c3c26, fg: '#6a2a1a' });
      for (const sx of [p[0] + 1, p[0] + sw - 2]) vb.fill(sx, 19, p[2], sx, 19, p[2], P.iron);
    }
    if (cfg.rocker) rockingChair(ctx, Ff, b.x0 + 10, 5, { quilt: true });
    bench(ctx, Ff, b.x1 - 22, 2, 14, { col: 0x8a5a30 });
    Ff.fill(b.x1 - 21, 4, 3, b.x1 - 10, 4, 4, (u, y, n) => ((u + n) % 2 ? 0xc84a3a : 0xf0d890));
    lanternOn(ctx, Ff, dr.u1 + 3, 11, { radius: 9 });
    ctx.porchFront = { pd, yPost: pr.yPost, ua, ub, posts };
  } else {
    Ff.fill(dr.u0 - 3, -G, 1, dr.u1 + 3, -1, 6, (u, y, n) => (y === -1 ? plankTone(n, 2) : P.stoneB));
    const sp = stepsOn(ctx, Ff, dr.u0 - 2, dr.u1 + 2, 7, G);
    for (const s of sp) jackSpots.push({ ...s, s: 1 });
    canopyOn(ctx, Ff, dr.u0 - 4, dr.u1 + 4, 20, { ...st, barge: P.woodDark });
    const a = Ff.pt(dr.u0 - 3, 0, 1), c = Ff.pt(dr.u1 + 3, 0, 6);
    ctx.porch.push({ x0: r3(a[0] / VPM - 0.06), z0: r3(a[2] / VPM - 0.06), x1: r3(c[0] / VPM + 0.06), z1: r3(c[2] / VPM + 0.06), y: 0 });
  }
  if (cfg.woodpile) woodpile(ctx, F.left, F.left.umin + 6, F.left.umin + 22, 2, 7);
  if (cfg.pelts) {
    for (const [u, y] of [[dr.u1 + 6, 9], [b.x0 + 8, 10]]) {
      Ff.fill(u, y, 1, u + 5, y + 7, 1, (uu, yy) => (uu === u || uu === u + 5 || yy === y || yy === y + 7 ? P.woodLight : 0));
      Ff.fill(u + 1, y + 1, 2, u + 4, y + 6, 2, (uu, yy) => ((uu === u + 1 || uu === u + 4) && (yy === y + 1 || yy === y + 6) ? 0 : 0x8a5a3a));
      Ff.occ.push([u, y, u + 5, y + 7]);
    }
    // antlers over the door
    const ay = dr.h + 3;
    Ff.fill(dr.uc - 1, ay, 1, dr.uc, ay + 1, 2, 0xe8dcc0);
    for (const sx of [-1, 1]) {
      const bu = sx < 0 ? dr.uc - 2 : dr.uc + 1;
      for (let k = 0; k < 5; k++) Ff.set(bu + sx * k, ay + 1 + (k >> 1), 2, 0xe8dcc0);
      Ff.set(bu + sx * 2, ay + 3, 2, 0xe8dcc0); Ff.set(bu + sx * 4, ay + 4, 2, 0xe8dcc0);
    }
  }
  if (cfg.paddle) {
    const Fs = F.left;
    for (let k = 0; k < 14; k++) Fs.set(Fs.umax - 8, 4 + k, 2, P.woodLight);
    Fs.fill(Fs.umax - 9, 2, 2, Fs.umax - 7, 6, 2, 0xc89a5a);
  }

  if (hw) {
    for (const s of jackSpots) { const p = Ff.pt(s.u, s.y, s.n).map(Math.floor); jack(ctx, p[0], p[1], p[2], { size: s.s }); }
    const dz = cfg.porch ? b.z1 + 3 : b.z1 + 9, dyy = cfg.porch ? 0 : -G;
    hayBale(ctx, dr.u1 + 4, dyy, dz, 'x');
    jack(ctx, dr.u1 + 7, dyy + 4, dz + 2, { size: 2 });
    cornStalks(ctx, dr.u0 - 5, dyy, dz);
    if (cfg.porch) {
      jack(ctx, dr.u0 - 9, 0, b.z1 + 5, { size: 2 });
      pumpkinPlain(ctx, dr.u0 - 13, 0, b.z1 + 4, 1);
      jack(ctx, dr.u1 + 14, 0, b.z1 + 12, { size: 1 });
      witchHat(ctx, b.x0 + 12, 11, b.z1 + 7, { band: P.pumpkin });
    }
    const edge = frontEdgePts(Rf);
    if (!cfg.porch) stringLights(ctx, edge, { span: 14 });
    if (ctx.porchFront) {
      const pfm = ctx.porchFront;
      stringLights(ctx, Array.from({ length: pfm.ub - pfm.ua + 1 }, (_, i) => Ff.pt(pfm.ua + i, pfm.yPost - 2, pfm.pd + 1).map(Math.floor)), { span: 12, sag: 1, skip: cfg.sign ? (pt) => Math.abs(pt[0] + 0.5) < 15 : null });
      const pA = Ff.pt(pfm.posts[0] + 2, pfm.yPost - 2, pfm.pd).map(Math.floor);
      cobweb(ctx, pA, [1, 0, 0], [0, -1, 0], 6);
      const pB = Ff.pt(pfm.posts[pfm.posts.length - 1] - 1, pfm.yPost - 2, pfm.pd).map(Math.floor);
      cobweb(ctx, pB, [-1, 0, 0], [0, -1, 0], 6);
      const gp = Ff.pt(pfm.posts[4] + 2, pfm.yPost - 2, pfm.pd - 3).map(Math.floor);
      ghostSheet(ctx, gp[0], gp[1], gp[2]);
    } else {
      cobweb(ctx, [b.x0 + 2, H - 4, b.z1 + 2], [1, 0, 0], [0, -1, 0], 5);
    }
    placeBats(ctx, F.left, 2, 6, H + 8, 2);
    placeBats(ctx, Ff, 1, 6, H - 4, 2);
    const zs = b.z1 + (cfg.porch ? 30 : 16);
    if (SPOOKY) {
      tombstone(ctx, b.x0 + 4, -G, zs, 0);
      tombstone(ctx, b.x0 + 12, -G, zs + 3, 1);
      if (W > 60) tombstone(ctx, b.x1 - 8, -G, zs + 1, 2);
    }
  }
  ctx.solids.push({ x0: (b.x0 - 3) / VPM, y0: -G / VPM, z0: (b.z0 - 3) / VPM, x1: (b.x1 + 4) / VPM, y1: H / VPM, z1: (b.z1 + 4) / VPM });
  return ctx;
}

// ------------------------------------------------------------------ GARAGE (barn) & OUTHOUSE
function buildGarage(spec, ctx) {
  const W = evenV(spec.w ?? 7), D = evenV(spec.d ?? 8);
  const H = 26;
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const G = (ctx.G = 2);
  const vb = (ctx.vb = new VB(b.x0 - 22, -12, b.z0 - 18, b.x1 + 22, H + W * 0.6 + 30, b.z1 + 40));
  const red = SIDING.red;
  const hw = ctx.hw;
  const Rf = roofGeom({ axis: 'z', b, H, pitch: 0.8, oh: 4, ohR0: 3, ohR1: 4 });
  const st = roofStyle(spec.roof ?? 'rust', ctx.seed, { gutter: false });
  foundation(ctx, b, G, 6);
  fillBody(vb, b, H, Rf, red);
  const F = frames(vb, b);
  for (const f of Object.values(F)) battens(F[f.f], red, 0, H + 60, 4, ctx.seed);
  cornerTrims(vb, b, 0, H - 1, P.trim);
  for (const f of Object.values(F)) band(f, H - 2, H - 1, P.trim);
  drawRoof(vb, Rf, st);
  const Ff = F.front;
  // big double barn doors with X braces
  const dw = 26, dh = 20, u0 = -dw / 2, u1 = dw / 2 - 1;
  Ff.clear(u0 - 1, 0, 1, u1 + 1, dh + 1, 1);
  Ff.fill(u0, 0, 0, u1, dh - 1, 0, (u) => ((u - u0) % 3 === 0 ? tone(red, -0.12) : tone(red, -0.04)));
  for (const [a, bq] of [[u0, -1], [0, u1]]) {
    Ff.fill(a, 0, 1, bq, 1, 1, P.trim); Ff.fill(a, dh - 2, 1, bq, dh - 1, 1, P.trim);
    Ff.fill(a, 0, 1, a, dh - 1, 1, P.trim); Ff.fill(bq, 0, 1, bq, dh - 1, 1, P.trim);
    Ff.fill(a, 9, 1, bq, 10, 1, P.trim);
    const lw = bq - a;
    for (let k = 1; k < 9; k++) { const t = k / 9; Ff.set(Math.round(a + t * lw), k, 1, P.trim); Ff.set(Math.round(bq - t * lw), k, 1, P.trim); }
    for (let k = 11; k < dh - 2; k++) { const t = (k - 10) / (dh - 12); Ff.set(Math.round(a + t * lw), k, 1, P.trim); Ff.set(Math.round(bq - t * lw), k, 1, P.trim); }
  }
  Ff.set(-2, 9, 2, P.iron); Ff.set(1, 9, 2, P.iron);
  Ff.fill(u0 - 3, dh, 1, u1 + 3, dh, 2, P.iron);
  Ff.occ.push([u0 - 3, 0, u1 + 3, dh]);
  ctx.door = { ...M3(0, 0, b.z1 + 3), face: 'front', w: dw / VPM };
  // apron
  Ff.fill(u0 - 2, -G, 1, u1 + 2, -1, 6, (u, y) => (y === -1 ? 0x9a948a : P.stoneB));
  // sign board + barn lamp
  signOn(ctx, Ff, 0, dh + 2, 18, 4, 'GARAGE', { bg: P.cream, fg: '#8e2a22', edge: P.trim });
  Ff.fill(-1, dh + 8, 1, 0, dh + 8, 3, P.iron);
  Ff.fill(-1, dh + 7, 3, 0, dh + 7, 3, P.lamp);
  addLight(ctx, Ff.pt(-0.5, dh + 6, 4), [1.0, 0.72, 0.4], 8, 'porch');
  // hay loft door with hay
  const ly = H + 2, lw = 12, lh = 10;
  Ff.clear(-lw / 2 - 1, ly - 1, 1, lw / 2, ly + lh, 1);
  Ff.fill(-lw / 2, ly, 0, lw / 2 - 1, ly + lh - 1, 0, (u, y) => (u < 0 ? (y < ly + 3 ? P.hay : y < ly + 5 && u > -4 ? P.hayC : 0x3a2a24) : tone(red, -0.05)));
  Ff.fill(-lw / 2, ly, 1, -lw / 2 + 1, ly + 3, 1, P.hayC);
  Ff.fill(-lw / 2 - 1, ly - 1, 1, lw / 2, ly - 1, 1, P.trim);
  Ff.fill(-lw / 2 - 1, ly + lh, 1, lw / 2, ly + lh, 1, P.trim);
  Ff.fill(-lw / 2 - 1, ly, 1, -lw / 2 - 1, ly + lh - 1, 1, P.trim);
  Ff.fill(lw / 2, ly, 1, lw / 2, ly + lh - 1, 1, P.trim);
  for (let k = 0; k < lh; k++) Ff.set(Math.round((k / (lh - 1)) * (lw / 2 - 1)), ly + k, 1, P.trim);
  // open left leaf swung out
  Ff.fill(-lw / 2 - 2, ly, 2, -lw / 2 - 2, ly + lh - 1, 6, (u, y, n) => (n === 2 || n === 6 || y === ly || y === ly + lh - 1 ? P.trim : tone(red, -0.06)));
  // hoist beam + pulley + rope
  const hy = Rf.ridge - 4;
  Ff.fill(-1, hy, -2, 0, hy + 1, 9, P.woodDark);
  Ff.fill(-1, hy - 2, 7, 0, hy - 1, 8, P.iron);
  Ff.fill(0, ly + 2, 8, 0, hy - 3, 8, P.twine);
  Ff.set(0, ly + 1, 8, P.iron); Ff.set(1, ly + 1, 8, P.iron);
  // side windows + tools
  for (const f of ['left', 'right']) windowRow(ctx, F[f], F[f].umin + 8, F[f].umax - 8, 9, 2, { w: 6, h: 6, mullU: undefined, box: false }, (i) => ({ lit: f === 'right' && i === 0 }));
  windowOn(ctx, F.back, -3, H + 2, { w: 6, h: 6 });
  const Fl = F.left;
  for (let k = 0; k < 14; k++) Fl.set(Fl.umax - 10, 3 + k, 2, P.woodLight);
  Fl.fill(Fl.umax - 11, 17, 2, Fl.umax - 9, 18, 2, P.steelD);
  for (let k = 0; k < 10; k++) Fl.set(Fl.umax - 14, 6 + k, 2, P.woodLight);
  Fl.fill(Fl.umax - 16, 3, 2, Fl.umax - 12, 5, 2, P.steelD);
  if (hw) {
    hayBale(ctx, u0 - 10, -G, b.z1 + 4, 'x');
    hayBale(ctx, u0 - 9, -G + 4, b.z1 + 4, 'x');
    hayBale(ctx, u1 + 4, -G, b.z1 + 4, 'x');
    jack(ctx, u0 - 6, -G + 8, b.z1 + 6, { size: 2 });
    jack(ctx, u1 + 7, -G + 4, b.z1 + 6, { size: 2 });
    witchHat(ctx, u1 + 7, -G + 9, b.z1 + 6);
    cornStalks(ctx, u0 - 4, -G, b.z1 + 2);
    cornStalks(ctx, u1 + 2, -G, b.z1 + 2);
    jack(ctx, u1 + 13, -G, b.z1 + 10, { size: 1 });
    pumpkinPlain(ctx, u0 - 13, -G, b.z1 + 11, 2);
    stringLights(ctx, frontEdgePts(Rf), { span: 12 });
    placeBats(ctx, F.left, 2, 6, H + 8);
    placeBats(ctx, F.right, 1, 6, H + 4);
    cobweb(ctx, [u0 + 1, dh - 3, b.z1 + 2], [1, 0, 0], [0, -1, 0], 5);
    cobweb(ctx, [lw / 2 - 1, ly + lh - 2, b.z1 + 1], [-1, 0, 0], [0, -1, 0], 4);
  }
  ctx.solids.push({ x0: b.x0 / VPM, y0: -G / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, y1: H / VPM, z1: (b.z1 + 1) / VPM });
  return ctx;
}
function buildOuthouse(spec, ctx) {
  const W = Math.max(14, evenV(spec.w ?? 1.6)), D = Math.max(14, evenV(spec.d ?? 1.6));
  const H = 18;
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const G = (ctx.G = 2);
  const vb = (ctx.vb = new VB(b.x0 - 14, -10, b.z0 - 12, b.x1 + 14, H + 14, b.z1 + 18));
  const g = SIDING.weathered;
  foundation(ctx, b, G, 3);
  vb.fill(b.x0, 0, b.z0, b.x1, H - 1, b.z1, g);
  // shed roof sloping to the back
  for (let z = b.z0 - 2; z <= b.z1 + 3; z++) {
    const y = H + 2 - Math.round((b.z1 + 3 - z) * 0.3);
    for (let x = b.x0 - 2; x <= b.x1 + 2; x++) {
      vb.set(x, y, z, x === b.x0 - 2 || x === b.x1 + 2 ? tone(ROOFC.rust, -0.2) : shingle({ kind: 'tin', col: ROOFC.rust, seed: ctx.seed }, z, x, y));
      vb.set(x, y - 1, z, P.woodDark);
    }
    for (let x = b.x0; x <= b.x1; x++) for (let yy = H; yy < y - 1; yy++) if (z >= b.z0 && z <= b.z1) vb.set(x, yy, z, g);
  }
  const F = frames(vb, b);
  for (const f of Object.values(F)) battens(f, g, 0, H + 4, 3, ctx.seed, 0);
  const Ff = F.front;
  // door with crescent moon
  const dc = tone(g, 0.06);
  Ff.clear(-4, 0, 1, 3, 16, 1);
  Ff.fill(-4, 0, 0, 3, 15, 0, (u) => ((u + 4) % 2 ? dc : tone(dc, -0.08)));
  for (let k = 0; k < 12; k++) Ff.set(-3 + Math.round((k / 11) * 6), 2 + k, 1, tone(dc, -0.2));
  Ff.fill(-4, 2, 1, 3, 2, 1, tone(dc, -0.2)); Ff.fill(-4, 13, 1, 3, 13, 1, tone(dc, -0.2));
  for (const [u, y] of [[-1, 11], [-2, 10], [-2, 9], [-2, 8], [-1, 7], [0, 7], [0, 11]]) Ff.set(u, y, 0, 0x1e1418);
  if (SPOOKY && ctx.hw) { Ff.set(-1, 9, 0, 0xc8ff5a | EMIT); Ff.set(0, 9, 0, 0xc8ff5a | EMIT); }
  Ff.set(2, 8, 1, P.iron);
  ctx.door = { ...M3(0, 0, b.z1 + 3), face: 'front' };
  Ff.fill(-5, -G, 1, 4, -1, 4, (u, y) => (y === -1 ? plankTone(u, 4) : P.stoneB));
  if (ctx.hw) {
    jack(ctx, b.x1 + 3, -G, b.z1 + 3, { size: 1 });
    cobweb(ctx, [b.x0 + 1, H - 2, b.z1 + 1], [1, 0, 0], [0, -1, 0], 5);
    lanternOn(ctx, Ff, 4, 11, { radius: 4, kind: 'lantern' });
  }
  ctx.solids.push({ x0: b.x0 / VPM, y0: -G / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, y1: H / VPM, z1: (b.z1 + 1) / VPM });
  return ctx;
}

// ------------------------------------------------------------------ CHAPEL
const STAINED = [0x9a2a3a | EMIT, 0x2a4aa0 | EMIT, 0xd8a030 | EMIT, 0x3a8a4a | EMIT, 0x7a3a9a | EMIT];
function stainedFn(u0, y0, w, h, seed = 0) {
  return (u, y) => {
    const a = u - u0, bq = y - y0;
    if (a === Math.floor(w / 2) && bq > 1 && bq < h - 1) return 0x3a3036; // lead
    if (bq % 4 === 0) return 0x3a3036;
    const k = Math.floor(bq / 4) + (a < w / 2 ? 0 : 1);
    return STAINED[(k + seed) % STAINED.length];
  };
}
// pointed lancet window in a frame
function lancetOn(ctx, F, u0, y0, w, h, o = {}) {
  const u1 = u0 + w - 1, y1 = y0 + h - 1;
  const fn = stainedFn(u0, y0, w, h, o.seed ?? 0);
  const inArch = (u, y) => {
    const fromTop = y1 - y;
    const k = Math.max(0, 3 - fromTop);
    const half = Math.ceil(w / 2);
    return u - u0 >= Math.min(k, half - 1) && u1 - u >= Math.min(k, half - 1);
  };
  F.clear(u0 - 1, y0 - 1, 1, u1 + 1, y1 + 2, 1);
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let u = u0 - 1; u <= u1 + 1; u++) {
    const inside = u >= u0 && u <= u1 && y >= y0 && y <= y1 && inArch(u, y);
    if (inside) F.set(u, y, 0, fn(u, y));
    else if ((u >= u0 - 1 && u <= u1 + 1 && y >= y0 - 1 && y <= y1 + 1) && (inArch(Math.max(u0, Math.min(u1, u)), Math.max(y0, Math.min(y1, y))) || y === y1 + 1)) {
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([du, dy]) => { const uu = u + du, yy = y + dy; return uu >= u0 && uu <= u1 && yy >= y0 && yy <= y1 && inArch(uu, yy); });
      if (nb) F.set(u, y, 1, P.trim);
    }
  }
  F.fill(u0 - 2, y0 - 1, 1, u1 + 2, y0 - 1, 2, P.trim);
  F.occ.push([u0 - 2, y0 - 1, u1 + 2, y1 + 2]);
  if (o.lit) addLight(ctx, F.pt(u0 + (w - 1) / 2, y0 + h / 2, 3), [0.85, 0.6, 1.0], 4, 'window');
}
function roseOn(F, uc, yc, r) {
  for (let a = -r - 1; a <= r; a++) for (let b2 = -r - 1; b2 <= r; b2++) {
    const dx = a + 0.5, dy = b2 + 0.5, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= r - 0.4) {
      const ang = Math.atan2(dy, dx);
      const seg = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 8 + 0.5) % 8;
      const c = d < 1.3 ? 0xd8a030 | EMIT : d > r - 1.4 ? 0x3a3036 : STAINED[seg % 2 ? 0 : 1];
      F.set(uc + a, yc + b2, 0, c);
      F.set(uc + a, yc + b2, 1, 0);
    } else if (d <= r + 0.6) F.set(uc + a, yc + b2, 1, P.trim);
  }
  F.occ.push([uc - r - 1, yc - r - 1, uc + r, yc + r]);
}
function buildChapel(spec, ctx) {
  const W = evenV(spec.w ?? 8), D = evenV(spec.d ?? 13);
  const H = 34;
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const G = (ctx.G = 4);
  const TW = 20, tz0 = b.z1 - 2, tz1 = b.z1 + 17, TH = 72;
  const vb = (ctx.vb = new VB(b.x0 - 24, -14, b.z0 - 16, b.x1 + 26, 140, tz1 + 40));
  const wht = SIDING.white;
  const hw = ctx.hw;
  const Rf = roofGeom({ axis: 'z', b, H, pitch: 1.25, oh: 4, ohR0: 3, ohR1: 3, t: 3 });
  const st = roofStyle(spec.roof ?? 'dark', ctx.seed);
  foundation(ctx, b, G, 6);
  fillBody(vb, b, H, Rf, wht);
  const F = frames(vb, b);
  for (const f of Object.values(F)) clapboard(f, wht, 0, 140, ctx.seed);
  cornerTrims(vb, b, 0, H - 1, P.trim);
  for (const f of Object.values(F)) { band(f, 0, 1, P.stoneB); band(f, H - 2, H - 1, P.trimShade); }
  drawRoof(vb, Rf, { ...st, spouts: false });
  // side lancets
  for (const f of ['left', 'right']) {
    const Fs = F[f];
    for (let i = 0; i < 3; i++) {
      const uc = Math.round(Fs.umin + 22 + i * ((Fs.umax - Fs.umin - 44) / 2));
      lancetOn(ctx, Fs, uc - 3, 8, 6, 18, { seed: i + (f === 'left' ? 0 : 2), lit: i === 1 });
    }
  }
  roseOn(F.back, 0, H + 12, 5);
  // tower
  const tb = { x0: -TW / 2, x1: TW / 2 - 1, z0: tz0, z1: tz1 };
  foundation(ctx, tb, G, 6);
  vb.fill(tb.x0, 0, tb.z0, tb.x1, TH - 1, tb.z1, wht);
  const T = frames(vb, tb);
  for (const f of Object.values(T)) clapboard(f, wht, 0, TH, ctx.seed + 1);
  cornerTrims(vb, tb, 0, TH - 1, P.trim);
  for (const f of Object.values(T)) { band(f, 0, 1, P.stoneB); band(f, 50, 51, P.trim); band(f, TH - 2, TH - 1, P.trim); }
  // belfry: arched openings on all sides, hollow inside, bell
  vb.clear(tb.x0 + 2, 54, tb.z0 + 2, tb.x1 - 2, TH - 3, tb.z1 - 2);
  for (const f of Object.values(T)) {
    for (let y = 54; y <= 66; y++) for (let u = -5; u <= 4; u++) {
      const fromTop = 66 - y, k = Math.max(0, 3 - fromTop);
      if (u + 5 < Math.min(k, 4) || 4 - u < Math.min(k, 4)) continue;
      for (let n = -2; n <= 1; n++) f.set(u, y, n, 0);
    }
    f.fill(-6, 53, 1, 5, 53, 2, P.trim);
    // louvre rail
    f.fill(-5, 54, -1, 4, 56, -1, P.woodDark);
  }
  vb.fill(-1, 66, tb.z0 + 9, 0, 67, tb.z0 + 10, P.woodDark);
  for (let k = 0; k < 7; k++) vb.disc(-0.5, 65 - k, tb.z0 + 9.5, [1, 1.6, 2.1, 2.4, 2.7, 3.1, 3.4][k], k === 6 ? 0xa87822 : 0xd8a838);
  vb.set(-1, 57, tb.z0 + 9, 0x8a6a2a);
  // spire: stepped pyramid
  const sTop = TH + 44;
  for (let y = TH; y <= sTop; y++) {
    const t = (y - TH) / (sTop - TH);
    const hw2 = Math.max(0, Math.round((TW / 2 + 2) * (1 - t)));
    if (hw2 <= 0) break;
    for (let x = -hw2; x < hw2; x++) for (let z = -hw2; z < hw2; z++) {
      const edge = x === -hw2 || x === hw2 - 1 || z === -hw2 || z === hw2 - 1;
      if (!edge && y < sTop - 1 && vb.get(x, y + 1, z + (tz0 + tz1 + 1) / 2) !== 0) continue;
      vb.set(x, y, z + Math.round((tz0 + tz1 + 1) / 2), edge && ((y - TH) % 3 === 0) ? tone(st.col, -0.12) : (y - TH) % 3 === 1 ? tone(st.col, 0.06) : st.col);
    }
  }
  const tcz = Math.round((tz0 + tz1 + 1) / 2);
  vb.fill(-1, TH - 1, tcz - TW / 2 - 2, 0, TH - 1, tcz + TW / 2 + 1, P.trim);
  vb.fill(-TW / 2 - 2, TH - 1, tcz - 1, TW / 2 + 1, TH - 1, tcz, P.trim);
  let sy = sTop;
  while (vb.get(-1, sy, tcz - 1) === 0 && sy > TH) sy--;
  vb.fill(-1, sy + 1, tcz - 1, 0, sy + 10, tcz, P.brass);
  vb.fill(-4, sy + 6, tcz - 1, 3, sy + 7, tcz, P.brass);
  // front: double door with a pointed head, rose window, lantern
  const Tf = T.front;
  const dr = doorOn(ctx, Tf, 0, { w: 12, h: 20, double: true, color: 0x8a2a24, lantern: false });
  for (let k = 0; k < 4; k++) Tf.fill(-6 + k, 20 + k, 1, 5 - k, 20 + k, 2, P.trim);
  roseOn(Tf, 0, 35, 5);
  lancetOn(ctx, T.left, -2, 30, 4, 12, { seed: 1 });
  lancetOn(ctx, T.right, -2, 30, 4, 12, { seed: 3 });
  lanternOn(ctx, Tf, -10, 11);
  lanternOn(ctx, Tf, 8, 11);
  // steps
  Tf.fill(-10, -G, 1, 9, -1, 4, (u, y) => (y === -1 ? P.stoneC : P.stoneB));
  const sp = stepsOn(ctx, Tf, -9, 8, 5, G, P.stoneC);
  if (hw) {
    for (const s of sp) { const p = Tf.pt(s.u, s.y, s.n).map(Math.floor); jack(ctx, p[0], p[1], p[2], { size: 1 }); }
    jack(ctx, -9, 0, tz1 + 3, { size: 2 });
    jack(ctx, 8, 0, tz1 + 3, { size: 2 });
    // little churchyard on the left side
    for (let i = 0; i < 6; i++) tombstone(ctx, b.x0 - 14 + (i % 2) * 7, -G, b.z0 + 14 + i * 12, i % 3);
    placeBats(ctx, T.front, 2, 40, 50);
    placeBats(ctx, T.left, 1, 30, 50);
    placeBats(ctx, F.right, 2, 24, H + 14);
    placeBats(ctx, F.left, 1, 26, H + 10);
    // webs in the belfry openings
    for (const f of [T.front, T.left]) {
      const p = f.pt(-5, 65, 1).map(Math.floor);
      const du = f.f === 'front' ? [1, 0, 0] : [0, 0, 1];
      cobweb(ctx, p, du, [0, -1, 0], 5);
    }
    cobweb(ctx, Tf.pt(-6, 19, 1).map(Math.floor), [1, 0, 0], [0, -1, 0], 4);
    stringLights(ctx, frontEdgePts(Rf).filter((p) => Math.abs(p[0] + 0.5) > TW / 2 + 1), { span: 10 });
  }
  ctx.solids.push({ x0: b.x0 / VPM, y0: -G / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, y1: H / VPM, z1: (b.z1 + 1) / VPM });
  ctx.solids.push({ x0: tb.x0 / VPM, y0: -G / VPM, z0: tb.z0 / VPM, x1: (tb.x1 + 1) / VPM, y1: sTop / VPM, z1: (tb.z1 + 1) / VPM });
  return ctx;
}

// ------------------------------------------------------------------ LIGHTHOUSE
function buildLighthouse(spec, ctx) {
  const G = (ctx.G = 0);
  const TH = 104, r0 = 17.5, r1 = 12;
  const vb = (ctx.vb = new VB(-30, -12, -30, 30, TH + 50, 34));
  const hw = ctx.hw;
  const RED = 0xb8352c, WHT = 0xeee6d4;
  // plinth (octagonal stone)
  for (let y = -10; y <= -1; y++) {
    const r = y < -8 ? 23 : 22;
    for (let z = -r; z <= r; z++) for (let x = -r; x <= r; x++) {
      if (Math.abs(x + 0.5) + Math.abs(z + 0.5) > r * 1.32) continue;
      vb.set(x, y, z, y === -1 ? (((x + z) & 3) === 0 ? P.stoneB : P.stoneC) : stoneFn(ctx.seed)(x, y, z));
    }
  }
  // tapered tower with bands
  const rad = (y) => r0 + (r1 - r0) * (y / TH);
  const bandOf = (y) => Math.floor(y / (TH / 5));
  for (let y = 0; y < TH; y++) {
    const r = rad(y);
    const bnd = bandOf(y);
    const c = bnd % 2 ? RED : WHT;
    const seam = y % (TH / 5 | 0) === 0 && y > 0;
    vb.disc(-0.5, y, -0.5, r, seam ? tone(c, -0.12) : (y >> 1) % 2 ? tone(c, 0.03) : c);
  }
  // door + porch hood at the base (front)
  const fr = (y, x) => { let z = 30; while (z > 0 && !vb.get(x, y, z)) z--; return z; };
  const zf = fr(5, 0);
  for (let y = 0; y < 18; y++) for (let x = -4; x <= 3; x++) { const z = fr(y, x); for (let k = 0; k <= 1; k++) vb.set(x, y, z - k, 0); vb.set(x, y, z - 2, y < 17 ? ((x + 4) % 2 ? 0x8a2a24 : 0x7a2420) : P.trim); }
  vb.set(2, 8, fr(8, 2) + 0, P.brass);
  for (let x = -6; x <= 5; x++) { vb.fill(x, 18, zf - 2, x, 18, zf + 5, x === -6 || x === 5 ? P.trim : RED); vb.fill(x, 19, zf - 2, x, 19, zf + 4, Math.abs(x + 0.5) < 4 ? RED : 0); }
  vb.fill(-6, 0, zf + 4, -5, 17, zf + 5, P.trim); vb.fill(4, 0, zf + 4, 5, 17, zf + 5, P.trim);
  ctx.door = { ...M3(0, 0, zf + 2), face: 'front' };
  lanternOn(ctx, mkFrame(vb, { x0: -20, x1: 19, z0: -20, z1: zf - 1 }, 'front'), 6, 12);
  // small windows spiralling up
  const wins = [[0, 36, 'front'], [1, 58, 'left'], [2, 80, 'back'], [3, 46, 'right'], [0, 72, 'front']];
  for (const [, y, f] of wins) {
    for (let yy = y; yy < y + 6; yy++) for (let a = -2; a <= 1; a++) {
      const [x, z] = f === 'front' ? [a, null] : f === 'back' ? [a, null] : [null, a];
      let px, pz;
      if (f === 'front' || f === 'back') { px = x; pz = 30 * (f === 'front' ? 1 : -1); const s = f === 'front' ? -1 : 1; while (!vb.get(px, yy, pz) && Math.abs(pz) > 0) pz += s; vb.set(px, yy, pz, P.glass | GLASS); vb.set(px, yy - 1 + (yy === y ? 0 : 1), pz - s, 0); }
      else { pz = z; px = 30 * (f === 'right' ? 1 : -1); const s = f === 'right' ? -1 : 1; while (!vb.get(px, yy, pz) && Math.abs(px) > 0) px += s; vb.set(px, yy, pz, P.glass | GLASS); }
    }
  }
  // gallery
  const gy = TH;
  vb.disc(-0.5, gy, -0.5, 18.5, P.iron);
  vb.disc(-0.5, gy - 1, -0.5, 15, P.metal);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const x = Math.round(Math.cos(a) * 16 - 0.5), z = Math.round(Math.sin(a) * 16 - 0.5);
    vb.set(x, gy - 2, z, P.iron); vb.set(Math.round(Math.cos(a) * 14 - 0.5), gy - 3, Math.round(Math.sin(a) * 14 - 0.5), P.iron);
  }
  for (let k = 0; k < 28; k++) {
    const a = (k / 28) * Math.PI * 2;
    const x = Math.round(Math.cos(a) * 17.6 - 0.5), z = Math.round(Math.sin(a) * 17.6 - 0.5);
    vb.fill(x, gy + 1, z, x, gy + 6, z, P.iron);
  }
  vb.disc(-0.5, gy + 7, -0.5, 18.2, P.iron, 1.2);
  vb.disc(-0.5, gy + 4, -0.5, 18.2, P.iron, 1);
  // lamp room
  const ly0 = gy + 1, ly1 = gy + 15;
  for (let y = ly0; y <= ly1; y++) {
    vb.disc(-0.5, y, -0.5, 9.5, (x, yy, z) => {
      if (y <= ly0 + 2) return RED;
      if (y === ly1) return P.iron;
      const a = Math.atan2(z + 0.5, x + 0.5);
      const seg = Math.floor(((a + Math.PI) / (Math.PI * 2)) * 10);
      const m = Math.abs(((a + Math.PI) / (Math.PI * 2)) * 10 - Math.round(((a + Math.PI) / (Math.PI * 2)) * 10)) < 0.08;
      if (m) return P.iron;
      return seg % 3 === 0 ? 0xffe6a0 | EMIT : 0xfff4c8 | EMIT;
    });
  }
  vb.disc(-0.5, ly0 + 7, -0.5, 4, P.lampHot);
  // cap: red dome + vent ball + rod
  for (let k = 0; k < 10; k++) vb.disc(-0.5, ly1 + 1 + k, -0.5, Math.max(0.6, 11 - k * 1.1), (x, y, z) => (k === 0 ? tone(RED, -0.2) : k % 3 === 1 ? tone(RED, 0.06) : RED));
  vb.ellipsoid(-0.5, ly1 + 12, -0.5, 1.6, 1.6, 1.6, P.iron);
  vb.fill(-1, ly1 + 13, -1, -1, ly1 + 20, -1, P.iron);
  vb.fill(-1, ly1 + 18, -4, -1, ly1 + 18, 2, P.iron);
  vb.fill(-1, ly1 + 19, 2, -1, ly1 + 19, 3, P.iron);
  addLight(ctx, [0, ly0 + 7, 0], [1.0, 0.86, 0.5], 30, 'beacon');
  if (hw) {
    jack(ctx, -9, 0, zf + 4, { size: 3 });
    jack(ctx, 9, 0, zf + 2, { size: 2 });
    jack(ctx, 14, 0, zf - 4, { size: 1 });
    pumpkinPlain(ctx, -14, 0, zf - 3, 2);
    // ghost on the gallery + bats on the tower
    ghostSheet(ctx, 8, gy + 6, 13);
    stringLights(ctx, Array.from({ length: 60 }, (_, i) => { const a = (i / 60) * Math.PI * 2; return [Math.round(Math.cos(a) * 17.6 - 0.5), gy + 6, Math.round(Math.sin(a) * 17.6 - 0.5)]; }), { span: 10, sag: 1 });
    if (SPOOKY) for (const [x, y, z, sh] of [[-6, 62, 0, 0], [4, 88, 0, 1], [-4, 28, 0, 2]]) {
      const shape = BATS[sh];
      let zz = 30; while (zz > 0 && !vb.get(x, y, zz)) zz--;
      shape.forEach((row, i) => { for (let k = 0; k < row.length; k++) if (row[k] === 'X') vb.set(x + k, y + shape.length - 1 - i, zz + 1, P.bat); });
    }
    cobweb(ctx, [-6, 17, zf + 1], [1, 0, 0], [0, -1, 0], 5);
  }
  ctx.solids.push({ x0: -2.25, y0: 0, z0: -2.25, x1: 2.25, y1: (ly1 + 12) / VPM, z1: 2.25, round: true });
  return ctx;
}

// ------------------------------------------------------------------ SAWMILL
function buildSawmill(spec, ctx) {
  const W = evenV(spec.w ?? 16), D = evenV(spec.d ?? 10);
  const H = 35;
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const G = (ctx.G = 2);
  const vb = (ctx.vb = new VB(b.x0 - 22, -12, b.z0 - 14, b.x1 + 30, H + D * 0.4 + 30, b.z1 + 50));
  const g = SIDING.weathered;
  const hw = ctx.hw;
  const Rf = roofGeom({ axis: 'x', b, H, pitch: 0.55, oh: 6, ohR0: 5, ohR1: 5 });
  const st = roofStyle(spec.roof ?? 'rust', ctx.seed, { soffit: P.woodDark, barge: P.woodDark, fascia: P.woodDark, gutter: false });
  // floor
  vb.fill(b.x0, -G - 6, b.z0, b.x1, -1, b.z1, (x, y, z) => (y === -1 ? plankTone(z >> 1, 2, P.plankB) : y >= -3 ? P.woodDark : stoneFn(ctx.seed)(x, y, z)));
  // back wall (full) + gable ends
  for (let z = b.z0; z <= b.z0 + 1; z++) for (let x = b.x0; x <= b.x1; x++) for (let y = 0; y < H; y++) vb.set(x, y, z, g);
  for (const x of [b.x0, b.x0 + 1, b.x1 - 1, b.x1]) for (let z = b.z0; z <= b.z1; z++) {
    const yt = Rf.topAt(x, z) - Rf.t;
    for (let y = 0; y <= yt; y++) if (y < 16 || y >= H - 1) vb.set(x, y, z, g);
  }
  const F = frames(vb, b);
  battens(F.back, g, 0, H + 40, 4, ctx.seed);
  battens(F.left, g, 0, H + 40, 4, ctx.seed);
  battens(F.right, g, 0, H + 40, 4, ctx.seed);
  for (const f of [F.left, F.right]) for (let u = f.umin; u <= f.umax; u++) f.set(u, 15, 1, P.woodDark);
  // posts + tie beams
  const px = [];
  for (let i = 0; i <= 4; i++) px.push(Math.round(b.x0 + (i * (W - 3)) / 4));
  for (const x of px) {
    vb.fill(x, 0, b.z1 - 2, x + 2, H - 1, b.z1, P.woodDark);
    vb.fill(x, 0, b.z0, x + 2, H - 1, b.z0 + 2, P.woodDark);
    vb.fill(x, H - 3, b.z0, x + 2, H - 2, b.z1, P.wood);
    // knee braces
    for (let k = 0; k < 5; k++) { vb.set(x + 1, H - 4 - k, b.z1 - 3 - k, P.wood); vb.set(x + 1, H - 4 - k, b.z0 + 3 + k, P.wood); }
  }
  vb.fill(b.x0, H - 3, b.z1 - 2, b.x1, H - 1, b.z1, P.wood);
  drawRoof(vb, Rf, st);
  // saw table + blade + log
  const tz = Math.round(D * 0.18);
  vb.fill(-24, 0, tz - 4, 23, 5, tz + 4, (x, y, z) => (y === 5 ? P.woodLight : (x === -24 || x === 23 || x % 12 === 0) ? P.woodDark : y < 2 ? 0 : P.wood));
  vb.fill(-23, 0, tz - 3, 22, 1, tz + 3, 0);
  for (const x of [-24, -12, 0, 11, 23]) vb.fill(x, 0, tz - 4, x, 1, tz + 4, P.woodDark);
  vb.clear(-9, 2, tz, 8, 5, tz);
  const br = 9;
  for (let a = -br - 1; a <= br; a++) for (let y = -br - 1; y <= br; y++) {
    const dx = a + 0.5, dy = y + 0.5, d = Math.sqrt(dx * dx + dy * dy);
    const ang = Math.atan2(dy, dx);
    const tooth = Math.floor(((ang + Math.PI) / (Math.PI * 2)) * 24) % 2 === 0;
    if (d <= br - 0.5 || (tooth && d <= br + 0.6)) {
      const c = d < 1.6 ? P.iron : d < 2.8 ? P.steelD : d > br - 1.2 ? (tooth ? P.steelD : P.steel) : P.steel;
      vb.set(a, 6 + y + 1, tz, c);
    }
  }
  vb.fill(-2, 4, tz - 2, 1, 7, tz - 1, P.iron);
  // log on the table
  for (let x = -22; x <= -9; x++) vb.disc(0, 0, 0, 0, 0);
  for (let x = -22; x <= -10; x++) for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) {
    if (a * a + c * c > 9.5) continue;
    const end = x === -22 || x === -10;
    vb.set(x, 9 + a, tz + c, end ? (a * a + c * c < 2 ? 0xa87c4c : 0xd2aa78) : ((a + 3) % 3 === 0 ? 0x5c3c26 : 0x6c4a2e));
  }
  // sawdust
  for (let k = 0; k < 9; k++) vb.fill(-3 + (k % 4), 0, tz + 5 + (k >> 2), -1 + (k % 3), Math.max(0, 1 - (k >> 2)), tz + 5 + (k >> 2), 0xe2c890);
  // hanging lamp inside
  vb.fill(0, H - 4, b.z0 + 26, 0, H - 2, b.z0 + 26, P.iron);
  vb.fill(-1, H - 7, b.z0 + 25, 0, H - 5, b.z0 + 26, P.lamp);
  addLight(ctx, [0, H - 6, b.z0 + 26], [1.0, 0.75, 0.45], 9, 'lantern');
  // sign under the front eave
  const Ff = F.front;
  const sw = 34, sh = 7;
  signFree(ctx, -sw / 2, H - 12, b.z1 + 1, sw, sh, spec.sign || 'SAWMILL', { bg: 0xe8d4a8, edge: P.woodDark, fg: '#5c2a1a' });
  vb.fill(-sw / 2 + 1, H - 4, b.z1, -sw / 2 + 1, H - 4, b.z1, P.iron);
  vb.fill(sw / 2 - 2, H - 4, b.z1, sw / 2 - 2, H - 4, b.z1, P.iron);
  ctx.door = { ...M3((px[2] + 3 + px[3]) / 2, 0, b.z1 + 0.5), face: 'front', w: 3.5 };
  // stacked logs out front-left (along z), with end grain rings
  const lr = 2.6;
  const logEnd = (d2) => (d2 < 1.2 ? 0xa87c4c : d2 < 3.2 ? 0xd6b07e : d2 < 5 ? 0xc49a68 : 0x5c3c26);
  for (let row = 0; row < 3; row++) for (let k = 0; k < 4 - row; k++) {
    const cx = b.x0 + 6 + k * 6 + row * 3, cy = 3 + row * 5;
    for (let z = b.z1 + 6; z <= b.z1 + 38; z++) for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) {
      const d2 = a * a + c * c;
      if (d2 > lr * lr + 0.5) continue;
      const end = z === b.z1 + 6 || z === b.z1 + 38;
      vb.set(cx + a, cy + c - G, z, end ? logEnd(d2) : ((a + c + 6) % 4 === 0 ? 0x5c3c26 : 0x6e4c30));
    }
  }
  // stacked boards (lumber) on the right
  for (let layer = 0; layer < 5; layer++) {
    const y = -G + 1 + layer * 2;
    if (layer % 2 === 0) for (let i = 0; i < 5; i++) vb.fill(b.x1 - 30 + i * 6, y, b.z1 + 8, b.x1 - 26 + i * 6, y, b.z1 + 30, plankTone(i + layer, 5, P.woodLight));
    else for (const z of [b.z1 + 9, b.z1 + 19, b.z1 + 29]) vb.fill(b.x1 - 30, y, z, b.x1 - 2, y, z, P.woodDark);
  }
  // stump with axe
  vb.disc(b.x1 - 8, -G, b.z1 + 40, 2.5, 0x6e4c30);
  for (let y = -G + 1; y <= -G + 3; y++) vb.disc(b.x1 - 8, y, b.z1 + 40, 2.5, y === -G + 3 ? 0xd2aa78 : 0x6e4c30);
  vb.fill(b.x1 - 8, -G + 4, b.z1 + 40, b.x1 - 8, -G + 10, b.z1 + 40, P.woodLight);
  vb.fill(b.x1 - 9, -G + 4, b.z1 + 39, b.x1 - 7, -G + 5, b.z1 + 39, P.steelD);
  ctx.porch.push({ x0: b.x0 / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, z1: (b.z1 + 1) / VPM, y: 0 });
  if (hw) {
    jack(ctx, px[1] + 1, 0, b.z1 + 3, { size: 2 });
    jack(ctx, px[3] + 1, 0, b.z1 + 3, { size: 2 });
    jack(ctx, b.x0 + 12, 14 - G, b.z1 + 36, { size: 1 });
    jack(ctx, b.x1 - 8, -G + 4, b.z1 + 38, { size: 1, light: false });
    hayBale(ctx, px[1] + 4, 0, b.z1 - 6, 'x');
    hayBale(ctx, px[1] + 5, 4, b.z1 - 6, 'x');
    cornStalks(ctx, px[2] - 3, 0, b.z1 + 1);
    cornStalks(ctx, px[2] + 5, 0, b.z1 + 1);
    witchHat(ctx, px[1] + 8, 8, b.z1 - 4);
    stringLights(ctx, frontEdgePts(Rf), { span: 16 });
    for (let i = 0; i < 4; i++) {
      cobweb(ctx, [px[i] + 3, H - 4, b.z1], [1, 0, 0], [0, -1, 0], 6);
      if (i % 2) cobweb(ctx, [px[i + 1] - 1, H - 4, b.z1], [-1, 0, 0], [0, -1, 0], 5);
    }
    placeBats(ctx, F.left, 2, 18, H + 10);
    placeBats(ctx, F.right, 1, 18, H + 6);
    placeBats(ctx, F.back, 2, 6, H - 6);
  }
  ctx.solids.push({ x0: b.x0 / VPM, y0: -G / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, y1: 2 / VPM, z1: (b.z1 + 1) / VPM, floor: true });
  return ctx;
}

// ------------------------------------------------------------------ MAIN STREET SHOPS
// Storefronts: kick panels, big display windows with goods behind the glass, transoms, a fascia
// board with the shop's name, a bracketed cornice, striped awnings, a hanging blade sign, upper
// floor sash windows, and a false-front parapet (or a gable) on top. Per-shop dressing below.
const SHOP_CFG = {
  post: { brick: true, parapet: 'flat', fascia: 0x24346a, fg: '#f2e8d4', door: 0, accent: 0x24346a, flag: true, clock: true, blade: 'mail', goods: 'parcels' },
  donuts: { parapet: 'round', fascia: 0x5a2e22, fg: '#ffe6c4', door: 1, accent: 0x8a3a4a, awning: [0xe8708e, 0xf6e8d6], donut: true, blade: 'cup', goods: 'donuts' },
  cafe: { roof: 'gable', pitch: 0.8, fascia: 0x2e5a40, fg: '#f2e8d4', door: -1, accent: 0x2e5a40, awning: [0x2e6a4a, 0xf2e8d4], blade: 'leaf', boxes: true, goods: 'cakes' },
  store: { parapet: 'stepped', fascia: 0x7a2a22, fg: '#f6e6c8', door: 0, accent: 0x2e5a40, recess: 24, moose: true, goods: 'jars' },
  poutine: { small: true, fascia: 0xc8382e, fg: '#fff4dc', accent: 0xc8382e, awning: [0xc8382e, 0xf2e8d4], hatch: true, topper: 'fries' },
  fishchips: { small: true, fascia: 0x1e4a6a, fg: '#fff4dc', accent: 0x1e4a6a, awning: [0x2a6a8a, 0xf2e8d4], hatch: true, topper: 'fish' },
  hardware: { parapet: 'flat', fascia: 0x2e2e34, fg: '#f2c23a', door: 1, accent: 0x3a5a8a, awning: [0x3a5a8a, 0xf2e8d4], blade: 'hammer', goods: 'tools' },
  bakery: { roof: 'gable', pitch: 0.9, fascia: 0x7a3e22, fg: '#fff0d8', door: -1, accent: 0x7a3e22, awning: [0xe8a03a, 0xf6e8d6], blade: 'bread', boxes: true, goods: 'bread' },
};
const SF = { kick: 3, win0: 4, win1: 15, tr0: 17, tr1: 18, fas0: 20, fas1: 24, cor: 25, top: 26 }; // storefront rows

// what's displayed behind the shop glass (u, y on the glass plane)
function goodsFn(kind, u0, ww, y0, y1) {
  const base = glassFn(u0, y1);
  const shelf = (y) => y === y0 + 1 || y === y0 + 6;
  return (u, y) => {
    const k = u - u0;
    if (kind === 'donuts') {
      if (shelf(y)) return P.woodLight;
      if ((y === y0 + 2 || y === y0 + 7) && k % 3 !== 2) return [0xf0a0b8, 0xc8803a, 0x7a4a2a, 0xf2e2c4][Math.floor(vhash(u, y, 3) * 4)];
    } else if (kind === 'cakes') {
      if (shelf(y)) return P.woodLight;
      if (y === y0 + 2 && k % 4 !== 3) return k % 8 < 4 ? 0xf2e8d4 : 0x8a4a2a;
      if (y === y0 + 3 && k % 4 === 1) return 0xd8302a;
      if (y === y0 + 7 && k % 3 === 0) return 0xe8dcc8;
    } else if (kind === 'parcels') {
      if (y === y0 + 1) return P.woodLight;
      if (y >= y0 + 2 && y <= y0 + 4 && k % 6 < 4) return (y === y0 + 3 || k % 6 === 1) ? 0xc8302a : 0xc49a64;
    } else if (kind === 'tools') {
      if (shelf(y)) return P.woodLight;
      if (y >= y0 + 2 && y <= y0 + 4 && k % 5 === 1) return y === y0 + 4 ? P.steelD : P.woodLight; // hammers
      if (y === y0 + 7 && k % 4 < 3) return [P.red, 0xf2c23a, P.steel][Math.floor(k / 4) % 3]; // paint cans
    } else if (kind === 'bread') {
      if (shelf(y)) return P.woodLight;
      if ((y === y0 + 2 || y === y0 + 7) && k % 4 !== 3) return k % 8 < 4 ? 0xc8883e : 0xe0a858;
      if (y === y0 + 3 && k % 4 === 1) return 0xa86a2e;
    } else if (kind === 'jars') {
      if (shelf(y)) return P.woodLight;
      if ((y === y0 + 2 || y === y0 + 3 || y === y0 + 7) && k % 2 === 0) return y === y0 + 3 ? 0xf2e8d4 : [0xc87a1e, 0xa83228, 0xd8a838][Math.floor(vhash(u, y, 5) * 3)];
    }
    return base(u, y);
  };
}
// a hanging blade sign: iron arm out from the wall, a board with a little painted icon on it
const BLADE = {
  cup: ['.......', '..w.w..', '...w...', 'ccccc..', 'cCCCcc.', 'cCCCc.c', 'cCCCcc.', '.ccc...'],
  leaf: ['...r...', '.r.r.r.', '.rrrrr.', 'rrrrrrr', '.rrrrr.', '..rrr..', '...b...', '...b...'],
  mail: ['.......', 'eeeeeee', 'eEeeeEe', 'eeEeEee', 'eeeEeee', 'eeeeeee', '...s...', '.......'],
  hammer: ['.......', '.EEEE..', '.EEEEE.', '...b...', '...b...', '...b...', '...b...', '.......'],
  bread: ['.......', '..ccc..', '.cCcCc.', 'cCcCcCc', 'ccccccc', '.......', '.......', '.......'],
};
function bladeSign(ctx, F, u, y, icon, o = {}) {
  const pat = BLADE[icon];
  if (!pat) return;
  const bg = o.bg ?? P.cream, edge = o.edge ?? P.woodDark;
  // arm
  for (let n = 1; n <= 9; n++) F.set(u, y + 9, n, P.iron);
  F.set(u, y + 8, 1, P.iron); F.set(u, y + 7, 1, P.iron);
  F.set(u, y + 8, 2, P.iron);
  // board (in the plane across the wall), with chains
  const n0 = 2;
  F.set(u, y + 8, n0 + 1, P.iron); F.set(u, y + 8, n0 + 7, P.iron);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 9; i++) {
    const edgeV = j === 0 || j === 7 || i === 0 || i === 8;
    let c = edgeV ? edge : bg;
    if (!edgeV) {
      const ch = pat[7 - j]?.[i - 1] ?? '.';
      if (ch === 'w') c = 0xe8e4dc; else if (ch === 'c') c = icon === 'bread' ? 0xd89a4a : 0xf2ece0; else if (ch === 'C') c = icon === 'bread' ? 0xf2d8a8 : 0x6a3a22;
      else if (ch === 'r') c = P.red; else if (ch === 'b') c = P.woodDark; else if (ch === 'e') c = 0xf2ece0;
      else if (ch === 'E') c = 0x9a8a78; else if (ch === 's') c = P.red;
    }
    F.set(u, y + j, n0 + i, c);
  }
  F.occ.push([u - 1, y, u + 1, y + 9]);
}
// a round clock (hands at 4:12, when Harold proposed)
function clockFace(F, uc, yc, n = 2) {
  for (let a = -5; a <= 5; a++) for (let b2 = -5; b2 <= 5; b2++) {
    const d = Math.hypot(a, b2);
    if (d > 5.2) continue;
    F.set(uc + a, yc + b2, n, d > 4.2 ? P.brass : P.cream);
  }
  F.set(uc, yc, n + 1, P.iron);
  for (let k = 1; k <= 3; k++) F.set(uc + Math.round(Math.cos(-0.5) * k), yc + Math.round(Math.sin(-0.5) * k), n + 1, P.iron); // hour hand ~4
  for (let k = 1; k <= 4; k++) F.set(uc + Math.round(Math.cos(1.2) * k * 0.3), yc + Math.round(Math.sin(1.25) * k), n + 1, P.iron); // minute ~12
  for (const [a, b2] of [[0, 4], [4, 0], [0, -4], [-4, 0]]) F.set(uc + a, yc + b2, n + 1, P.navy);
  F.occ.push([uc - 6, yc - 6, uc + 6, yc + 6]);
}
// the giant donut that sits on the donut shop
function giantDonut(ctx, cx, cy, cz) {
  const vb = ctx.vb, R = 8, r = 3.6;
  const sprinkles = [0xf2d23a, 0x5ab4e8, 0xf2f0e8, 0x7ac84a, 0xb05cd8];
  for (let z = -5; z <= 5; z++) for (let y = -13; y <= 13; y++) for (let x = -13; x <= 13; x++) {
    const q = Math.hypot(x, y) - R;
    if (q * q + z * z > r * r + 0.3) continue;
    const icing = z >= 1 || (z === 0 && vhash(x, y, 1) < 0.5);
    const wav = q < -r * 0.55 + Math.sin(Math.atan2(y, x) * 7) * 0.6;
    let c = icing && !wav ? (vhash(x, y, z + 9) < 0.08 ? pick(sprinkles, vhash(x, y, 4)) : 0xf08aa6) : (vhash(x, y, z) < 0.5 ? 0xd8934a : 0xc8823e);
    if (!icing && z <= -3) c = 0xa86a30;
    vb.set(cx + x, cy + y, cz + z, c);
  }
}
// a moose head & a goose in relief on the store's parapet
function mooseAndGoose(F, ucM, ucG, y) {
  const br = 0x6a4428, brD = 0x4a2e1c, ant = 0xe0cfa8, wh = 0xf2ece0, gy = 0x8a8478, blk = 0x2a2420;
  // moose: long face, droopy nose, big palmate antlers
  const M = [
    'AA.......AA', 'AAA.....AAA', '.AAAA.AAAA.', '..AAbbbAA..', '....bbb....', '...bbbbb...', '...bebeb...', '...bbbbb...', '....bbb....', '....bdb....', '....ddd....',
  ];
  const put2 = (u, yy, c) => { for (const [a, b2] of [[0, 0], [1, 0], [0, 1], [1, 1]]) F.set(u + a, yy + b2, 2, c); };
  M.forEach((row, i) => { for (let k = 0; k < row.length; k++) { const ch = row[k]; if (ch === '.') continue; put2(ucM - 11 + k * 2, y + (M.length - 1 - i) * 2, ch === 'A' ? ant : ch === 'e' ? blk : ch === 'd' ? brD : br); } });
  // goose: black neck & head, white chin strap, grey-brown body
  const Gs = ['..kk.......', '.kkwk......', '..kk.......', '..kk.......', '..kk.......', '..kkgggg...', '.ggggggggg.', '..ggggggg..', '...y...y...'];
  Gs.forEach((row, i) => { for (let k = 0; k < row.length; k++) { const ch = row[k]; if (ch === '.') continue; put2(ucG - 11 + k * 2, y + (Gs.length - 1 - i) * 2, ch === 'k' ? blk : ch === 'w' ? wh : ch === 'y' ? 0xe8a43a : gy); } });
  F.occ.push([ucM - 12, y - 1, ucM + 12, y + 23], [ucG - 12, y - 1, ucG + 12, y + 19]);
}

function buildShop(spec, ctx) {
  const cfg = { ...(SHOP_CFG[spec.shop] || SHOP_CFG.cafe) };
  const R = ctx.R, hw = ctx.hw;
  const W = evenV(spec.w ?? 10), D = evenV(spec.d ?? 8);
  const floors = cfg.small ? 1 : Math.max(1, spec.floors || 1);
  const H = cfg.small ? 24 : SF.top + (floors - 1) * FH + 2;
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const G = (ctx.G = 3);
  const vb = (ctx.vb = new VB(b.x0 - 26, -14, b.z0 - 22, b.x1 + 26, H + 76, b.z1 + 44));
  const sid = cfg.brick ? SIDING.brick : (SIDING[spec.color] ?? SIDING.white);
  const trim = cfg.brick ? P.stoneC : P.trim;
  const acc = cfg.accent;
  const parapet = !cfg.roof && !cfg.small;
  foundation(ctx, b, G, 4);

  // ---- body & roof
  let Rf = null, st = roofStyle(spec.roof ?? 'dark', ctx.seed);
  if (cfg.roof === 'gable') Rf = roofGeom({ axis: 'z', b, H, pitch: cfg.pitch ?? 0.8, oh: 4, ohR0: 3, ohR1: 3 });
  else if (cfg.small) Rf = roofGeom({ axis: 'x', b, H, pitch: 0.55, oh: 5, ohR0: 3, ohR1: 3 });
  fillBody(vb, b, H, Rf, sid);
  const brick = brickFn(ctx.seed);
  if (cfg.brick) vb.fill(b.x0, 0, b.z0, b.x1, H + 30, b.z1, (x, y, z) => (vb.get(x, y, z) ? brick(x, y, z) : 0));
  let pTop = H;
  if (parapet) {
    // a low shed roof hidden behind the false front
    for (let z = b.z0 - 2; z <= b.z1 - 3; z++) {
      const y = H + Math.round(((z - b.z0 + 2) / (D - 1)) * 4);
      for (let x = b.x0 - 1; x <= b.x1 + 1; x++) {
        vb.set(x, y, z, shingle({ ...st, kind: 'tin' }, z, x, y));
        if (x >= b.x0 && x <= b.x1 && z >= b.z0) for (let yy = H; yy < y; yy++) vb.set(x, yy, z, cfg.brick ? brick(x, yy, z) : sid);
      }
    }
    const base = H + 8;
    for (let x = b.x0; x <= b.x1; x++) {
      const t = Math.abs(x + 0.5) / (W / 2);
      let top = base;
      if (cfg.parapet === 'stepped') top = base + (t < 0.28 ? 8 : t < 0.56 ? 4 : 0);
      if (cfg.parapet === 'round') top = base + Math.round(8 * Math.sqrt(Math.max(0, 1 - (t / 0.6) ** 2)));
      vb.fill(x, H, b.z1 - 2, x, top, b.z1, cfg.brick ? brick : sid);
      vb.fill(x, top + 1, b.z1 - 3, x, top + 1, b.z1 + 1, trim);
      vb.set(x, top, b.z1 + 1, trim);
      pTop = Math.max(pTop, top + 1);
    }
    for (const x of [b.x0, b.x1]) vb.fill(x - 1, H, b.z1 - 3, x + 1, base + 1, b.z1 + 1, trim);
  }
  const F = frames(vb, b);
  if (!cfg.brick) {
    if (cfg.small) for (const f of Object.values(F)) battens(f, sid, 0, H + 40, 4, ctx.seed);
    else for (const f of Object.values(F)) clapboard(f, sid, 0, pTop + 2, ctx.seed);
  }
  cornerTrims(vb, b, 0, H - 1, trim);
  for (const f of Object.values(F)) {
    band(f, 0, 1, cfg.brick ? P.stoneB : tone(sid, -0.25));
    if (!cfg.small && floors > 1) band(f, SF.top, SF.top + 1, trim);
  }
  if (cfg.brick) for (const f of Object.values(F)) band(f, H - 2, H - 1, P.stoneC);
  if (Rf) drawRoof(vb, Rf, { ...st, spouts: !cfg.small });

  // ---- storefront
  const Ff = F.front;
  const recess = cfg.recess ?? 0;
  const porchH = 19;
  let Fs = Ff;
  if (recess) {
    // the ground floor steps back behind a deep porch; the upper floor rides over it on posts
    vb.clear(b.x0 + 2, 0, b.z1 - recess + 1, b.x1 - 2, porchH, b.z1 + 2);
    Fs = mkFrame(vb, { ...b, z1: b.z1 - recess }, 'front');
    deckOn(ctx, Fs, b.x0 + 2, b.x1 - 2, recess + 1, { col: P.plank });
    for (const u of [b.x0 + 2, Math.round(-W * 0.18), Math.round(W * 0.18) - 1, b.x1 - 3]) {
      postAt(Ff, u, -2, 0, porchH, P.trim);
      const p = Ff.pt(u + 0.5, 0, -1.5);
      (ctx.posts ||= []).push({ x: r3(p[0] / VPM), z: r3(p[2] / VPM), r: 0.14 });
    }
    Ff.fill(b.x0 + 2, porchH - 1, -2, b.x1 - 2, porchH, 0, P.trim);
    // ceiling boards
    vb.fill(b.x0 + 2, porchH, b.z1 - recess + 1, b.x1 - 2, porchH, b.z1, (x) => (x % 3 ? P.woodLight : P.wood));
  }
  const doorW = 8;
  const doorU = cfg.door === 0 ? 0 : cfg.door > 0 ? Math.round(W * 0.27) : -Math.round(W * 0.27);
  if (cfg.hatch) {
    // a serving hatch with a counter shelf and a menu board; the door is round the side
    const ha = b.x0 + 8, hb = b.x1 - 8;
    Ff.clear(ha, 8, -3, hb, 15, 1);
    Ff.fill(ha, 8, -3, hb, 15, -3, (u, y) => (y === 12 && u % 4 === 0 ? 0xc8c8c0 : y < 10 ? 0x8a8a90 : 0x3a2e2a));
    Ff.fill(ha - 1, 7, -2, hb + 1, 7, 3, P.woodLight);
    Ff.fill(ha - 1, 16, 1, hb + 1, 16, 1, trim);
    for (const u of [ha - 1, hb + 1]) Ff.fill(u, 8, 1, u, 15, 1, trim);
    // fry baskets & a ketchup bottle on the counter
    Ff.fill(ha + 2, 8, 1, ha + 4, 8, 2, P.red); Ff.set(ha + 3, 9, 1, 0xf2d23a);
    Ff.fill(hb - 3, 8, 1, hb - 3, 10, 1, 0xc8302a);
    awningOn(Ff, ha - 2, hb + 2, 20, 8, cfg.awning, { drop: 2, stripe: 3 });
    Ff.occ.push([ha - 2, 6, hb + 2, 21]);
    signOn(ctx, Ff, 0, 1, W - 16, 4, 'MENU', { bg: P.chalk, fg: '#f0f0e4', edge: P.woodDark, kind: 'chalk' });
    doorOn(ctx, F.left, 0, { color: acc, h: 17, lanternOpts: { radius: 5 } });
    windowOn(ctx, F.right, -3, 8, { w: 6, h: 6, lit: true, box: false });
  } else {
    const segL = [b.x0 + 4, doorU - doorW / 2 - 4], segR = [doorU + doorW / 2 + 3, b.x1 - 4];
    for (const [ua, ub] of [segL, segR]) {
      const ww = ub - ua + 1;
      if (ww < 6) continue;
      Fs.fill(ua - 1, 0, 1, ub + 1, SF.kick, 1, (u, y) => (y === 0 || y === SF.kick || u === ua - 1 || u === ub + 1 ? tone(acc, 0.18) : tone(acc, -0.12)));
      const mull = ww > 14 ? [ua + Math.round(ww / 3), ua + Math.round((2 * ww) / 3)] : [ua + (ww >> 1)];
      windowOn(ctx, Fs, ua, SF.win0, { w: ww, h: SF.win1 - SF.win0 + 1, mullU: mull, mullY: [], lit: true, frame: tone(acc, 0.12), box: false, glassFn: goodsFn(cfg.goods, ua, ww, SF.win0, SF.win1) });
      const tm = []; for (let u = ua + 3; u < ub - 1; u += 4) tm.push(u);
      windowOn(ctx, Fs, ua, SF.tr0, { w: ww, h: SF.tr1 - SF.tr0 + 1, mullU: tm, mullY: [], frame: tone(acc, 0.12), box: false });
    }
    doorOn(ctx, Fs, doorU, { w: doorW, h: 18, glass: true, color: acc, lantern: false, frame: tone(acc, 0.12) });
    if (!recess) {
      lanternOn(ctx, Ff, doorU - doorW / 2 - 4, 11, { radius: 6 });
      lanternOn(ctx, Ff, doorU + doorW / 2 + 2, 11, { radius: 6 });
    }
    // fascia board with the name, and a bracketed cornice
    signOn(ctx, Ff, 0, SF.fas0, W - 10, SF.fas1 - SF.fas0 + 1, spec.sign || '', { bg: cfg.fascia, fg: cfg.fg, edge: trim, n: recess ? 1 : 1 });
    Ff.fill(b.x0 - 1, SF.cor, 1, b.x1 + 1, SF.cor + 1, 2, trim);
    for (let u = b.x0 + 1; u <= b.x1 - 1; u += 6) Ff.fill(u, SF.cor - 2, 1, u, SF.cor - 1, 1, trim);
    if (cfg.awning) awningOn(Ff, b.x0 + 3, b.x1 - 3, SF.fas0 - 1, 9, cfg.awning, { drop: 4 });
  }

  // ---- upper floors
  const shut = cfg.brick ? null : SHUTC[spec.color] ?? P.navy;
  const cur = pick(CURTAINS, R());
  for (let f = 1; f < floors; f++) {
    const y0 = SF.top + (f - 1) * FH + 6;
    const cnt = Math.max(2, Math.min(4, Math.floor((W - 8) / 18)));
    windowRow(ctx, Ff, b.x0 + 5, b.x1 - 5, y0, cnt, { w: 6, h: 10, shutter: shut, box: !!cfg.boxes, curtain: cur, frame: cfg.brick ? P.stoneC : P.trim }, (i) => ({ lit: i === 1 }));
    if (cfg.brick) for (let i = 0; i < cnt; i++) { /* stone lintels come from the window frame colour */ }
  }
  // sides & back
  for (const fn of ['left', 'right']) {
    if (cfg.hatch && fn === 'left') continue;
    const Fx = F[fn];
    if (!cfg.small) windowRow(ctx, Fx, Fx.umin + 5, Fx.umax - 5, 7, Math.max(1, Math.floor((D - 10) / 24)), { w: 6, h: 8, box: false, frame: trim });
    for (let f = 1; f < floors; f++) windowRow(ctx, Fx, Fx.umin + 5, Fx.umax - 5, SF.top + (f - 1) * FH + 6, Math.max(1, Math.floor((D - 10) / 22)), { w: 6, h: 10, shutter: shut, curtain: pick(CURTAINS, R()), frame: trim }, (i) => ({ lit: fn === 'right' && i === 0 }));
  }
  doorOn(ctx, F.back, Math.round(W * 0.25), { color: tone(acc, -0.1), main: false, lantern: false });

  // ---- per-shop dressing
  if (cfg.blade) bladeSign(ctx, Ff, cfg.door > 0 ? b.x0 + 3 : b.x1 - 3, SF.top + 6, cfg.blade, { bg: P.cream });
  if (cfg.flag) flagOn(ctx, Ff, b.x1 - 4, SF.top + 4);
  if (cfg.clock && parapet) clockFace(Ff, 0, H + 4, 2);
  if (cfg.donut) giantDonut(ctx, 0, pTop + 10, b.z1 - 2);
  if (cfg.moose && parapet) mooseAndGoose(Ff, Math.round(-W * 0.31), Math.round(W * 0.31), SF.top + 4);
  if (recess) {
    // the counter Mo minds, with the till, a scale and a jar of maple candy
    const cz = b.z1 - recess + 12;
    vb.fill(-Math.round(W * 0.16), 0, cz, Math.round(W * 0.16), 7, cz + 2, (x, y, z) => (y === 7 ? P.woodLight : (x % 4 === 0 ? P.woodDark : P.wood)));
    vb.fill(-3, 8, cz, 0, 10, cz + 1, 0x8a8a90); vb.fill(-2, 10, cz, -1, 11, cz, 0x5a8a6a);
    vb.fill(4, 8, cz + 1, 5, 9, cz + 1, P.brass);
    vb.fill(-8, 8, cz + 1, -7, 10, cz + 1, 0xd8e8e0 | GLASS); vb.set(-8, 8, cz + 1, 0xc87a1e);
    ctx.solids.push({ collide: true, x0: -Math.round(W * 0.16) / VPM, y0: 0, z0: cz / VPM, x1: (Math.round(W * 0.16) + 1) / VPM, y1: 1, z1: (cz + 3) / VPM });
    // produce on the porch
    crate(ctx, b.x0 + 4, 0, b.z1 - 8, 7, 3, 5, 'apple');
    crate(ctx, b.x0 + 12, 0, b.z1 - 8, 7, 3, 5, 'pumpkin');
    crate(ctx, b.x1 - 10, 0, b.z1 - 8, 7, 3, 5, 'squash');
    crate(ctx, b.x1 - 18, 0, b.z1 - 8, 7, 3, 5, 'potato');
    for (const u of [Math.round(-W * 0.18), Math.round(W * 0.18) - 1]) { const p = Ff.pt(u, porchH - 4, -2).map(Math.floor); vb.fill(p[0], p[1], p[2] - 1, p[0] + 1, p[1] + 2, p[2], P.lamp); addLight(ctx, [p[0] + 1, p[1], p[2]], [1.0, 0.72, 0.4], 6, 'porch'); }
    signOn(ctx, Ff, 0, porchH + 2, W - 12, 5, spec.sign || '', { bg: cfg.fascia, fg: cfg.fg, edge: trim, n: 1 });
    chalkboard(ctx, b.x1 - 12, 0, b.z1 + 4, 'PUMPKINS 3$');
    ctx.mo = M3(0, 0, cz - 6);
  }
  if (cfg.topper === 'fries') {
    // a giant carton of fries on the roof
    const cy = Rf ? Rf.ridge - 2 : H, cz = 0;
    vb.fill(-6, cy, cz - 4, 5, cy + 8, cz + 3, (x, y) => (((x + 6) >> 1) % 2 ? P.red : P.white));
    for (let x = -5; x <= 4; x++) for (let z = cz - 3; z <= cz + 2; z++) { const h = 2 + Math.floor(vhash(x, z, 8) * 5); for (let k = 0; k < h; k++) vb.set(x, cy + 9 + k, z, k === h - 1 ? 0xf6d26a : 0xe8b440); }
  }
  if (cfg.topper === 'fish') {
    const cy = Rf ? Rf.ridge + 1 : H, cz = 0;
    for (let x = -10; x <= 10; x++) for (let y = -4; y <= 4; y++) {
      const body = (x / 9) ** 2 + (y / 3.6) ** 2 <= 1 && x < 7;
      const tail = x >= 6 && Math.abs(y) <= (x - 5) * 0.9;
      if (!body && !tail) continue;
      const c = x === -6 && y === 1 ? 0x1e1418 : y < -1 ? 0xe8e4dc : tail ? 0x2a6a8a : (x + y) % 3 === 0 ? 0x5ab4d0 : 0x3a8ab0;
      for (let z = -1; z <= 0; z++) vb.set(x, cy + 6 + y, cz + z, c);
    }
    vb.fill(-1, cy, -1, 0, cy + 2, 0, P.iron);
  }
  if (cfg.small) {
    // fryer chimney
    const top = (Rf ? Rf.ridge : H) + 5;
    vb.fill(b.x1 - 8, H - 2, b.z0 + 4, b.x1 - 7, top, b.z0 + 5, P.metal);
    vb.fill(b.x1 - 9, top + 1, b.z0 + 3, b.x1 - 6, top + 1, b.z0 + 6, P.iron);
    ctx.smoke.push(M3(b.x1 - 7, top + 2, b.z0 + 5));
  } else if (!cfg.brick) chimneyBrick(ctx, Math.round(W * 0.25), b.z0 + 4, H - 2, (Rf ? Rf.ridge : pTop) + 4);

  // ---- Halloween
  if (hw) {
    const dz = b.z1 + 2;
    if (!cfg.hatch && !recess) {
      cornStalks(ctx, doorU - doorW / 2 - 3, 0, b.z1 + 1);
      cornStalks(ctx, doorU + doorW / 2 + 1, 0, b.z1 + 1);
      jack(ctx, doorU - doorW / 2 - 2, 0, dz + 3, { size: 2 });
      pumpkinPlain(ctx, doorU + doorW / 2 + 3, 0, dz + 3, 2);
    } else if (cfg.hatch) {
      jack(ctx, b.x0 + 3, 0, dz + 1, { size: 2 });
      pumpkinPlain(ctx, b.x1 - 3, 0, dz + 1, 1);
    } else {
      jack(ctx, b.x0 + 6, 3, b.z1 - 7, { size: 1 });
      jack(ctx, b.x1 - 6, 3, b.z1 - 7, { size: 2 });
    }
    if (!cfg.hatch) stringLights(ctx, Array.from({ length: W + 2 }, (_, i) => [b.x0 - 1 + i, SF.cor + 3, b.z1 + 2]), { span: 12, sag: 1 });
    placeBats(ctx, Ff, 2, SF.top + 2, (parapet ? pTop : H) - 4);
    placeBats(ctx, F[R() < 0.5 ? 'left' : 'right'], 1, 8, H - 2);
    cobweb(ctx, [b.x0 + 2, SF.cor - 3, b.z1 + 2], [1, 0, 0], [0, -1, 0], 5);
  }
  ctx.solids.push({ x0: b.x0 / VPM, y0: -G / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, y1: H / VPM, z1: (b.z1 + 1 - recess) / VPM });
  return ctx;
}

// ------------------------------------------------------------------ FIRE HALL
function buildFirehall(spec, ctx) {
  const R = ctx.R, hw = ctx.hw;
  const W = evenV(spec.w ?? 12), D = evenV(spec.d ?? 12);
  const H = SF.top + FH + 4;
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const G = (ctx.G = 2);
  const TW = 24; // hose tower
  const tb = { x0: b.x1 - TW + 1, x1: b.x1, z0: b.z0, z1: b.z0 + TW - 1 };
  const TH = H + 34;
  const vb = (ctx.vb = new VB(b.x0 - 24, -14, b.z0 - 20, b.x1 + 24, TH + 34, b.z1 + 44));
  const brick = brickFn(ctx.seed);
  foundation(ctx, b, G, 4);
  vb.fill(b.x0, 0, b.z0, b.x1, H - 1, b.z1, brick);
  // flat roof behind a parapet with a stepped centre & a stone plaque
  vb.fill(b.x0, H, b.z0, b.x1, H, b.z1, 0x5a5654);
  for (let x = b.x0; x <= b.x1; x++) {
    const t = Math.abs(x + 0.5) / (W / 2);
    const top = H + 5 + (t < 0.3 ? 7 : t < 0.5 ? 3 : 0);
    vb.fill(x, H, b.z1 - 2, x, top, b.z1, brick);
    vb.fill(x, top + 1, b.z1 - 3, x, top + 1, b.z1 + 1, P.stoneC);
    for (const z of [b.z0]) vb.fill(x, H, z, x, H + 3, z, brick);
  }
  for (const x of [b.x0, b.x1]) vb.fill(x, H, b.z0, x, H + 3, b.z1, brick);
  // hose-drying tower at the back corner with an open belfry and a pyramid cap
  vb.fill(tb.x0, H, tb.z0, tb.x1, TH, tb.z1, brick);
  vb.clear(tb.x0 + 2, TH - 12, tb.z0 + 2, tb.x1 - 2, TH - 2, tb.z1 - 2);
  const T = frames(vb, tb);
  for (const f of Object.values(T)) {
    f.clear(f.umin + 4, TH - 11, -1, f.umax - 4, TH - 3, 0);
    f.fill(f.umin + 3, TH - 12, 1, f.umax - 3, TH - 12, 2, P.stoneC);
    f.fill(f.umin, TH - 1, 1, f.umax, TH, 2, P.stoneC);
  }
  for (let k = 0; k < 6; k++) vb.disc(tb.x0 + TW / 2 - 0.5, TH - 4 - k, tb.z0 + TW / 2 - 0.5, [1, 1.6, 2.1, 2.5, 2.8, 3.1][k], k === 5 ? 0xa87822 : 0xd8a838);
  for (let k = 0; k < 13; k++) {
    const y = TH + 1 + k, inset = Math.round(k * 0.95);
    vb.fill(tb.x0 - 1 + inset, y, tb.z0 - 1 + inset, tb.x1 + 1 - inset, y, tb.z1 + 1 - inset, (x, yy, z) => (x === tb.x0 - 1 + inset || x === tb.x1 + 1 - inset || z === tb.z0 - 1 + inset || z === tb.z1 + 1 - inset ? shingle({ kind: 'shingle', col: ROOFC.red, seed: ctx.seed }, x, z, yy) : 0x3a2e2a));
  }
  vb.fill(tb.x0 + TW / 2 - 1, TH + 14, tb.z0 + TW / 2 - 1, tb.x0 + TW / 2, TH + 18, tb.z0 + TW / 2, P.iron);
  const F = frames(vb, b);
  cornerTrims(vb, b, 0, H - 1, P.stoneC);
  for (const f of Object.values(F)) { band(f, 0, 1, P.stoneB); band(f, SF.top, SF.top + 1, P.stoneC); band(f, H - 2, H - 1, P.stoneC); }
  const Ff = F.front;
  // two big engine bay doors: red panels, a row of small windows, stone arches
  const bays = [Math.round(-W * 0.22), Math.round(W * 0.22)];
  for (const uc of bays) {
    const w = 28, h = 22, u0 = uc - w / 2, u1 = u0 + w - 1;
    Ff.clear(u0 - 1, 0, 1, u1 + 1, h + 1, 1);
    Ff.fill(u0, 0, 0, u1, h - 1, 0, (u, y) => {
      if (y >= 14 && y <= 17 && (u - u0) % 5 !== 0) return glassFn(u0, 17)(u, y);
      return (u - u0) % 7 === 0 || y % 7 === 0 ? 0x8e2420 : 0xb83228;
    });
    Ff.fill(u0 - 1, 0, 1, u0 - 1, h, 1, P.stoneC);
    Ff.fill(u1 + 1, 0, 1, u1 + 1, h, 1, P.stoneC);
    for (let u = u0 - 2; u <= u1 + 2; u++) {
      const arch = Math.round(3 * Math.sqrt(Math.max(0, 1 - ((u - uc + 0.5) / (w / 2 + 2)) ** 2)));
      Ff.fill(u, h, 1, u, h + arch, 2, P.stoneC);
    }
    Ff.fill(uc - 1, h + 4, 1, uc, h + 4, 3, P.iron);
    Ff.fill(uc - 1, h + 3, 3, uc, h + 3, 3, 0xff6a3a | EMIT);
    addLight(ctx, Ff.pt(uc - 0.5, h + 2, 4), [1.0, 0.45, 0.3], 7, 'porch');
    Ff.occ.push([u0 - 2, 0, u1 + 2, h + 5]);
  }
  ctx.door = { ...M3(-0.5, 0, b.z1 + 3), face: 'front' };
  signOn(ctx, Ff, 0, 26, W - 20, 5, spec.sign || 'FIRE HALL', { bg: P.stoneC, fg: '#8e2420', edge: P.stoneD, n: 1 });
  // a gold Maltese cross on the parapet
  const my = H + 6;
  for (let a = -4; a <= 4; a++) for (let c = -4; c <= 4; c++) {
    const arm = (Math.abs(a) <= 1 + Math.abs(c) * 0.6 && Math.abs(c) <= 4) || (Math.abs(c) <= 1 + Math.abs(a) * 0.6 && Math.abs(a) <= 4);
    if (arm && Math.abs(a) + Math.abs(c) <= 6) Ff.set(a, my + c, 2, Math.abs(a) <= 1 && Math.abs(c) <= 1 ? P.red : 0xe0b040);
  }
  windowRow(ctx, Ff, b.x0 + 6, b.x1 - 6, SF.top + 6, 4, { w: 6, h: 10, frame: P.stoneC, curtain: 0xe8d8b0 }, (i) => ({ lit: i === 1 }));
  for (const fn of ['left', 'right']) {
    windowRow(ctx, F[fn], F[fn].umin + 6, F[fn].umax - 6, 8, 2, { w: 6, h: 9, frame: P.stoneC, box: false });
    windowRow(ctx, F[fn], F[fn].umin + 6, F[fn].umax - 6, SF.top + 6, 2, { w: 6, h: 10, frame: P.stoneC }, (i) => ({ lit: i === 0 && fn === 'left' }));
  }
  doorOn(ctx, F.left, F.left.umax - 10, { color: 0x8e2420, main: false });
  flagOn(ctx, Ff, b.x0 + 4, SF.top + 3);
  // apron in front of the bays
  Ff.fill(b.x0 + 1, -G, 1, b.x1 - 1, -1, 5, (u, y) => (y === -1 ? (u % 8 === 0 ? 0x8a8478 : 0x9e988c) : P.stoneB));
  if (hw) {
    jack(ctx, bays[0] - 17, -G, b.z1 + 3, { size: 2 });
    jack(ctx, bays[1] + 16, -G, b.z1 + 3, { size: 2 });
    hayBale(ctx, -3, -G, b.z1 + 8, 'x');
    jack(ctx, 0, -G + 4, b.z1 + 10, { size: 2 });
    stringLights(ctx, Array.from({ length: W + 2 }, (_, i) => [b.x0 - 1 + i, 33, b.z1 + 2]), { span: 12, sag: 1 });
    placeBats(ctx, Ff, 2, SF.top + 2, H - 2);
    cobweb(ctx, [b.x0 + 2, SF.top - 2, b.z1 + 2], [1, 0, 0], [0, -1, 0], 5);
  }
  ctx.solids.push({ x0: b.x0 / VPM, y0: -G / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, y1: H / VPM, z1: (b.z1 + 1) / VPM });
  return ctx;
}

// ------------------------------------------------------------------ RED BARN & SILO
function buildBarn(spec, ctx) {
  const hw = ctx.hw;
  const W = evenV(spec.w ?? 14), D = evenV(spec.d ?? 12);
  const H = 30; // wall height
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const G = (ctx.G = 2);
  const SR = 18, sx = b.x1 + SR + 6, sz = b.z0 + SR + 4, SH = 104; // silo
  const vb = (ctx.vb = new VB(b.x0 - 22, -12, b.z0 - 18, sx + SR + 4, SH + 30, b.z1 + 44));
  const red = 0xa8382c;
  foundation(ctx, b, G, 6);
  // gambrel profile across x: steep lower slope to the knuckle, shallow upper slope to the ridge
  const half = W / 2 + 3;
  const prof = (x) => {
    const t = Math.abs(x + 0.5) / half; // 0 centre .. 1 eave
    return t > 0.55 ? H + Math.round(((1 - t) / 0.45) * 22) : H + 22 + Math.round(((0.55 - t) / 0.55) * 11);
  };
  for (let z = b.z0; z <= b.z1; z++) for (let x = b.x0; x <= b.x1; x++) vb.fill(x, 0, z, x, prof(x) - 2, z, red);
  const F = frames(vb, b);
  for (const f of Object.values(F)) battens(f, red, 0, H + 40, 4, ctx.seed);
  cornerTrims(vb, b, 0, H - 1, P.trim);
  // roof slabs (2 thick), overhanging the gables
  const st = roofStyle(spec.roof ?? 'dark', ctx.seed, { gutter: false });
  for (let x = -half; x <= half - 1; x++) {
    const y = prof(x);
    for (let z = b.z0 - 3; z <= b.z1 + 3; z++) {
      const edge = z === b.z0 - 3 || z === b.z1 + 3;
      vb.set(x, y, z, edge ? P.trim : shingle(st, x, z, y));
      vb.set(x, y - 1, z, edge ? P.trim : P.trimShade);
      if (Math.abs(x + 0.5) < 1) vb.set(x, y + 1, z, st.ridge);
    }
  }
  // white trim along the gable edges
  for (const z of [b.z1 + 1, b.z0 - 1]) for (let x = -half; x <= half - 1; x++) { vb.set(x, prof(x) - 1, z, P.trim); vb.set(x, prof(x) - 2, z, P.trim); }
  const Ff = F.front;
  // big sliding doors with white X braces, hung on a track
  const dw = 34, dh = 26, u0 = -dw / 2, u1 = dw / 2 - 1;
  Ff.clear(u0 - 1, 0, 1, u1 + 1, dh + 2, 1);
  Ff.fill(u0, 0, 0, u1, dh - 1, 0, (u) => ((u - u0) % 3 === 0 ? tone(red, -0.14) : tone(red, -0.04)));
  for (const [a, bq] of [[u0, -1], [0, u1]]) {
    Ff.fill(a, 0, 1, bq, 1, 1, P.trim); Ff.fill(a, dh - 2, 1, bq, dh - 1, 1, P.trim);
    Ff.fill(a, 0, 1, a, dh - 1, 1, P.trim); Ff.fill(bq, 0, 1, bq, dh - 1, 1, P.trim);
    const lw = bq - a;
    for (let k = 1; k < dh - 2; k++) { const t = k / (dh - 2); Ff.set(Math.round(a + t * lw), k, 1, P.trim); Ff.set(Math.round(bq - t * lw), k, 1, P.trim); }
  }
  Ff.fill(u0 - 4, dh, 1, u1 + 4, dh + 1, 2, P.iron);
  Ff.occ.push([u0 - 4, 0, u1 + 4, dh + 1]);
  ctx.door = { ...M3(0, 0, b.z1 + 3), face: 'front', w: dw / VPM };
  // hay loft door, hay spilling out, and the hoist beam
  const ly = H + 4, lw = 14, lh = 13;
  Ff.clear(-lw / 2, ly, 0, lw / 2 - 1, ly + lh - 1, 1);
  Ff.fill(-lw / 2, ly, -1, lw / 2 - 1, ly + lh - 1, -1, (u, y) => (y < ly + 4 ? P.hay : y < ly + 6 && u < 2 ? P.hayC : 0x3a2a24));
  Ff.fill(-lw / 2 - 1, ly - 1, 1, lw / 2, ly - 1, 1, P.trim); Ff.fill(-lw / 2 - 1, ly + lh, 1, lw / 2, ly + lh, 1, P.trim);
  Ff.fill(-lw / 2 - 1, ly, 1, -lw / 2 - 1, ly + lh - 1, 1, P.trim); Ff.fill(lw / 2, ly, 1, lw / 2, ly + lh - 1, 1, P.trim);
  Ff.fill(-lw / 2, ly, 1, -lw / 2 + 2, ly + 2, 2, P.hayC);
  const hy = prof(0) - 3;
  Ff.fill(-1, hy, -2, 0, hy + 1, 8, P.woodDark);
  Ff.fill(0, ly + 3, 7, 0, hy - 1, 7, P.twine);
  Ff.fill(-1, ly + 2, 6, 1, ly + 3, 8, P.iron);
  // cupola with a rooster weathervane
  const cy = prof(0) + 1;
  vb.fill(-5, cy, -5, 4, cy + 7, 4, (x, y, z) => (y < cy + 2 || x === -5 || x === 4 || z === -5 || z === 4 ? (y > cy + 1 && y < cy + 6 && (x + z) % 2 === 0 ? 0x3a2a24 : P.trim) : 0));
  for (let k = 0; k < 5; k++) vb.fill(-6 + k, cy + 8 + k, -6 + k, 5 - k, cy + 8 + k, 5 - k, shingle(st, k, 0, cy + 8 + k));
  vb.fill(-1, cy + 13, -1, 0, cy + 17, 0, P.iron);
  for (const [x, y, c] of [[-3, 18, P.iron], [-2, 18, P.iron], [-1, 18, P.iron], [0, 18, P.iron], [1, 19, P.iron], [2, 19, P.iron], [2, 20, P.red], [-3, 19, P.iron], [-4, 20, P.iron]]) vb.set(x, cy + y, 0, c);
  // windows on the sides & the back
  for (const fn of ['left', 'right']) windowRow(ctx, F[fn], F[fn].umin + 8, F[fn].umax - 8, 10, 3, { w: 6, h: 6, box: false }, (i) => ({ lit: fn === 'right' && i === 1 }));
  windowOn(ctx, F.back, -3, H + 6, { w: 6, h: 6 });
  lanternOn(ctx, Ff, u1 + 6, 14, { radius: 8 });
  // the silo: stone base, banded staves, a domed cap and a little ladder
  for (let y = -G - 4; y < SH; y++) {
    const r = SR - (y > SH - 6 ? 1 : 0);
    const c = y < 8 ? stoneFn(ctx.seed + 4)(sx, y, sz) : (y % 16 === 0 ? P.metal : (y >> 3) % 2 ? 0xc8c0b0 : 0xd6cebe);
    vb.disc(sx - 0.5, y, sz - 0.5, r, (x, yy, z) => (y < 8 ? stoneFn(ctx.seed + 4)(x, yy, z) : c), 3);
  }
  for (let k = 0; k <= 12; k++) vb.disc(sx - 0.5, SH + k, sz - 0.5, Math.sqrt(Math.max(0, SR * SR - (k * 1.55) ** 2)), k < 2 ? P.metal : 0xa0a6ae, 2);
  for (let y = 4; y < SH - 2; y++) { if (y % 3 === 0) vb.fill(sx - 2, y, sz + SR, sx + 1, y, sz + SR, P.iron); }
  vb.fill(sx - 2, 4, sz + SR, sx - 2, SH - 2, sz + SR, P.iron); vb.fill(sx + 1, 4, sz + SR, sx + 1, SH - 2, sz + SR, P.iron);
  ctx.solids.push({ collide: true, x0: (sx - SR) / VPM, y0: 0, z0: (sz - SR) / VPM, x1: (sx + SR) / VPM, y1: SH / VPM, z1: (sz + SR) / VPM });
  if (hw) {
    hayBale(ctx, u0 - 12, -G, b.z1 + 4, 'x');
    hayBale(ctx, u0 - 11, -G + 4, b.z1 + 4, 'x');
    hayBale(ctx, u1 + 5, -G, b.z1 + 5, 'x');
    jack(ctx, u0 - 7, -G + 8, b.z1 + 6, { size: 3 });
    jack(ctx, u1 + 9, -G + 4, b.z1 + 7, { size: 2 });
    pumpkinPlain(ctx, u1 + 15, -G, b.z1 + 9, 3);
    pumpkinPlain(ctx, u0 - 17, -G, b.z1 + 10, 2);
    cornStalks(ctx, u0 - 3, -G, b.z1 + 2, { h: 15 });
    cornStalks(ctx, u1 + 2, -G, b.z1 + 2, { h: 15 });
    witchHat(ctx, u1 + 9, -G + 10, b.z1 + 7);
    placeBats(ctx, F.left, 2, 8, H + 8);
    cobweb(ctx, [u0 + 1, dh - 3, b.z1 + 2], [1, 0, 0], [0, -1, 0], 6);
  }
  ctx.solids.push({ x0: b.x0 / VPM, y0: -G / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, y1: H / VPM, z1: (b.z1 + 1) / VPM });
  return ctx;
}

// ------------------------------------------------------------------ SUGAR SHACK (cabane à sucre)
function buildSugarShack(spec, ctx) {
  const hw = ctx.hw;
  const W = evenV(spec.w ?? 9), D = evenV(spec.d ?? 7);
  const H = 32;
  const b = { x0: -W / 2, x1: W / 2 - 1, z0: -D / 2, z1: D / 2 - 1 };
  const G = (ctx.G = 3);
  const vb = (ctx.vb = new VB(b.x0 - 24, -12, b.z0 - 20, b.x1 + 24, H + 64, b.z1 + 44));
  const wood = SIDING.weathered;
  const Rf = roofGeom({ axis: 'x', b, H, pitch: 1.05, oh: 5, ohR0: 4, ohR1: 4, t: 2 });
  const st = roofStyle('rust', ctx.seed, { gutter: false, barge: P.woodDark, fascia: P.woodDark, soffit: P.woodDark });
  foundation(ctx, b, G, 4);
  fillBody(vb, b, H, Rf, wood);
  const F = frames(vb, b);
  for (const f of Object.values(F)) battens(f, wood, 0, H + 60, 3, ctx.seed, 0);
  drawRoof(vb, Rf, st);
  // the steam vent (lanterneau) along the ridge, steam pouring out of its louvres
  const vy = Rf.ridge + 1, vl = Math.round(W * 0.3);
  vb.fill(-vl, vy, -4, vl - 1, vy + 6, 3, (x, y, z) => (y === vy + 6 ? 0 : x === -vl || x === vl - 1 || z === -4 || z === 3 ? (y % 2 ? 0x3a2e28 : wood) : 0x2a201c));
  for (let k = 0; k < 4; k++) vb.fill(-vl - 1 + k, vy + 6 + k, -5 + k, vl - k, vy + 6 + k, 4 - k, shingle(st, k, 0, vy + 6 + k));
  for (const x of [-vl + 3, 0, vl - 4]) ctx.smoke.push(M3(x, vy + 6, -0.5));
  // evaporator stack
  const cx = Math.round(W * 0.3), cz = Math.round(-D * 0.2);
  vb.fill(cx, H - 2, cz, cx + 2, Rf.ridge + 14, cz + 2, P.metal);
  vb.fill(cx - 1, Rf.ridge + 15, cz - 1, cx + 3, Rf.ridge + 15, cz + 3, P.iron);
  ctx.smoke.push(M3(cx + 1.5, Rf.ridge + 17, cz + 1.5));
  const Ff = F.front;
  const dr = doorOn(ctx, Ff, -Math.round(W * 0.15), { color: 0x6a3a22, plank: true, frame: P.woodDark, lanternOpts: { radius: 7 } });
  windowOn(ctx, Ff, dr.u1 + 8, 8, { w: 7, h: 7, lit: true, frame: P.woodDark, curtain: 0xc84a3a, box: false });
  windowOn(ctx, F.left, -3, 8, { w: 6, h: 6, lit: true, frame: P.woodDark });
  signOn(ctx, Ff, Math.round(W * 0.12), 20, Math.min(W - 26, 40), 5, spec.sign || 'CABANE A SUCRE', { bg: 0xf0e0c0, fg: '#7a3a1a', edge: P.woodDark });
  // firewood stacked along the side, and a taffy trough (snow & syrup) out front
  woodpile(ctx, F.right, F.right.umin + 3, F.right.umax - 3, 1, 9);
  const tz = b.z1 + 10;
  vb.fill(dr.u1 + 2, 0, tz, dr.u1 + 16, 4, tz + 4, (x, y, z) => (y === 4 ? (x % 3 === 0 && z === tz + 2 ? 0xc87a1e : 0xf2f4f8) : (y === 0 || x === dr.u1 + 2 || x === dr.u1 + 16 ? P.woodDark : P.wood)));
  for (const x of [dr.u1 + 3, dr.u1 + 15]) vb.fill(x, -G, tz + 1, x, -1, tz + 3, P.woodDark);
  // sap buckets hung on the walls (more hang on the maples outside)
  for (const u of [b.x0 + 4, b.x1 - 8]) { Ff.fill(u, 9, 1, u + 2, 12, 2, P.metalL); Ff.fill(u, 13, 1, u + 2, 13, 2, P.metal); Ff.set(u + 1, 14, 1, P.metal); }
  if (hw) {
    jack(ctx, dr.u0 - 4, 0, b.z1 + 4, { size: 2 });
    pumpkinPlain(ctx, dr.u0 - 9, 0, b.z1 + 3, 1);
    cobweb(ctx, [b.x0 + 2, H - 3, b.z1 + 2], [1, 0, 0], [0, -1, 0], 5);
    placeBats(ctx, F.left, 1, 6, H);
  }
  ctx.solids.push({ x0: b.x0 / VPM, y0: -G / VPM, z0: b.z0 / VPM, x1: (b.x1 + 1) / VPM, y1: H / VPM, z1: (b.z1 + 1) / VPM });
  return ctx;
}

// ------------------------------------------------------------------ GAZEBO (bandstand on the green)
function buildGazebo(spec, ctx) {
  const hw = ctx.hw;
  const Rr = Math.round((spec.w ?? 7) * VPM / 2); // radius in voxels
  const G = (ctx.G = 4);
  const deck = 4; // deck top (voxels above the yard)
  const vb = (ctx.vb = new VB(-Rr - 8, -12, -Rr - 8, Rr + 8, 64, Rr + 20));
  const oct = (x, z, r) => Math.abs(x + 0.5) <= r && Math.abs(z + 0.5) <= r && Math.abs(x + 0.5) + Math.abs(z + 0.5) <= r * 1.38;
  const wht = P.trim;
  // base: stone plinth, lattice skirt, plank deck
  for (let y = -G - 3; y < deck; y++) for (let z = -Rr; z <= Rr; z++) for (let x = -Rr; x <= Rr; x++) {
    if (!oct(x, z, Rr)) continue;
    const rim = !oct(x, z, Rr - 1);
    let c;
    if (y === deck - 1) c = rim ? wht : plankTone(z, 3);
    else if (y < -G + 1) c = stoneFn(ctx.seed)(x, y, z);
    else c = rim ? (((x + y + z) & 1) ? wht : 0x3a2e2a) : P.woodDark;
    vb.set(x, y, z, c);
  }
  // front steps
  for (let k = 0; k < 3; k++) vb.fill(-6, -G + k, Rr + 1 + (2 - k) * 2, 5, -G + k + 1, Rr + 2 + (2 - k) * 2, (x, y) => (y === -G + k + 1 ? plankTone(x, 5) : P.stoneB));
  // posts at the octagon corners, railings between them (open at the front)
  const PH = 26;
  const corners = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    corners.push([Math.round(Math.cos(a) * (Rr - 1.5)), Math.round(Math.sin(a) * (Rr - 1.5))]);
  }
  for (const [x, z] of corners) {
    vb.fill(x - 1, deck, z - 1, x, deck + PH, z, wht);
    // gingerbread brackets
    vb.set(x - 1, deck + PH - 2, z + Math.sign(-z || 1), wht); vb.set(x + Math.sign(-x || 1), deck + PH - 2, z, wht);
  }
  for (let i = 0; i < 8; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 8];
    const front = (az + bz) / 2 > Rr * 0.6 && Math.abs(ax + bx) < Rr;
    vb.line(ax, deck + PH - 3, az, bx, deck + PH - 3, bz, wht);
    if (front) continue;
    vb.line(ax, deck + 8, az, bx, deck + 8, bz, wht);
    vb.line(ax, deck + 1, az, bx, deck + 1, bz, wht);
    const n = Math.max(Math.abs(bx - ax), Math.abs(bz - az));
    for (let k = 1; k < n; k += 2) vb.fill(Math.round(ax + ((bx - ax) * k) / n), deck + 2, Math.round(az + ((bz - az) * k) / n), Math.round(ax + ((bx - ax) * k) / n), deck + 7, Math.round(az + ((bz - az) * k) / n), wht);
  }
  // octagonal roof: green shingles in courses, white fascia, gold finial
  const rb = deck + PH + 1, RH = 16;
  const st = roofStyle(spec.roof ?? 'green', ctx.seed);
  for (let k = 0; k <= RH; k++) {
    const r = (Rr + 3) * (1 - k / (RH + 2));
    for (let z = -Rr - 3; z <= Rr + 3; z++) for (let x = -Rr - 3; x <= Rr + 3; x++) {
      if (!oct(x, z, r) || oct(x, z, r - 1.6)) continue;
      vb.set(x, rb + k, z, k === 0 ? wht : shingle(st, x + z, x - z, rb + k));
    }
  }
  vb.fill(-1, rb + RH, -1, 0, rb + RH + 3, 0, 0xe0b040);
  vb.fill(-2, rb + RH + 1, -2, 1, rb + RH + 1, 1, 0xe0b040);
  vb.set(0, rb + RH + 4, 0, 0xf8dc78);
  // inside: a ceiling lamp and a music stand
  vb.fill(-1, rb - 2, -1, 0, rb - 1, 0, P.iron);
  vb.fill(-1, rb - 4, -1, 0, rb - 3, 0, P.lamp);
  addLight(ctx, [0, rb - 4, 0], [1.0, 0.75, 0.45], 10, 'lamp');
  vb.fill(-4, deck, -6, -4, deck + 8, -6, P.iron);
  vb.fill(-6, deck + 8, -6, -2, deck + 10, -6, P.iron);
  if (hw) {
    // maple-red & cream bunting under the eaves, string lights, pumpkins on the deck
    for (let i = 0; i < 8; i++) {
      const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 8];
      for (let k = 0; k <= 6; k++) {
        const t = k / 6, x = Math.round(ax + (bx - ax) * t), z = Math.round(az + (bz - az) * t);
        const sag = Math.round(Math.sin(t * Math.PI) * 2);
        vb.set(x, rb - 2 - sag, z, k % 2 ? P.cream : P.red);
        vb.set(x, rb - 3 - sag, z, k % 2 ? P.cream : P.red);
      }
    }
    stringLights(ctx, corners.flatMap(([x, z], i) => { const [bx, bz] = corners[(i + 1) % 8]; return Array.from({ length: 8 }, (_, k) => [Math.round(x + ((bx - x) * k) / 8), rb - 1, Math.round(z + ((bz - z) * k) / 8)]); }), { span: 8, sag: 1 });
    for (const [x, z] of [corners[1], corners[2]]) jack(ctx, Math.round(x * 0.8), deck, Math.round(z * 0.8), { size: 2 });
    pumpkinPlain(ctx, Math.round(corners[5][0] * 0.75), deck, Math.round(corners[5][1] * 0.75), 2);
  }
  ctx.door = { ...M3(0, deck, Rr + 6), face: 'front' };
  // walkable deck (an inscribed square) + the steps; posts collide
  const s = (Rr - 1) * 0.84 / VPM;
  ctx.porch.push({ x0: r3(-s), z0: r3(-s), x1: r3(s), z1: r3(s), y: r3(deck / VPM) });
  ctx.posts = corners.map(([x, z]) => ({ x: r3((x - 0.5) / VPM), z: r3((z - 0.5) / VPM), r: 0.14 }));
  ctx.solids.push({ x0: -Rr / VPM, y0: -G / VPM, z0: -Rr / VPM, x1: Rr / VPM, y1: deck / VPM, z1: Rr / VPM, floor: true });
  return ctx;
}

// ------------------------------------------------------------------ LIFEGUARD TOWER
function buildLifeguard(spec, ctx) {
  const hw = ctx.hw;
  const G = (ctx.G = 0);
  const vb = (ctx.vb = new VB(-16, -6, -16, 16, 52, 18));
  const wht = 0xf2ece0, red = 0xc8302a, wd = 0xc8a070;
  // four splayed legs sunk into the sand, cross-braced
  const legs = [[-8, -8], [7, -8], [-8, 7], [7, 7]];
  for (const [x, z] of legs) vb.line(x * 1.25, -4, z * 1.25, x, 22, z, wht, 1);
  vb.line(-10, 6, 9, 9, 16, 9, wht); vb.line(9, 6, 9, -10, 16, 9, wht);
  vb.line(-10, 6, -10, 9, 16, -10, wht);
  vb.line(-10, 8, -10, -10, 8, 9, wht); vb.line(9, 8, -10, 9, 8, 9, wht);
  // platform with a little railing and the chair
  vb.fill(-10, 22, -10, 9, 23, 9, (x, y, z) => (y === 23 ? plankTone(x, 7, wd) : 0x8a6440));
  for (const z of [-10]) vb.fill(-10, 24, z, 9, 30, z, (x, y) => (y === 30 || y === 24 || x % 4 === 0 ? wht : 0));
  for (const x of [-10, 9]) vb.fill(x, 24, -10, x, 30, 9, (xx, y, z) => (y === 30 || y === 24 || z % 4 === 0 ? wht : 0));
  vb.fill(-4, 24, -4, 3, 27, 2, (x, y) => (y === 27 ? red : wht));
  vb.fill(-4, 28, -5, 3, 36, -4, (x, y) => (y % 3 === 0 ? red : wht));
  // a striped peaked sun roof on four poles
  for (const [x, z] of [[-9, -9], [8, -9], [-9, 8], [8, 8]]) vb.fill(x, 24, z, x, 40, z, wht);
  for (let k = 0; k < 7; k++) vb.fill(-11 + k, 41 + k, -11 + k, 10 - k, 41 + k, 10 - k, (x, y, z) => (((x + z + 40) >> 2) % 2 ? red : wht));
  vb.set(0, 48, 0, red); vb.set(-1, 48, 0, red);
  // ladder at the back (the sea is in front)
  for (const x of [-3, 2]) vb.line(x, 0, -16, x, 22, -11, wd);
  for (let k = 1; k < 11; k++) vb.fill(-3, k * 2, -16 + Math.round(k * 0.45), 2, k * 2, -16 + Math.round(k * 0.45), wd);
  // red cross board & a rescue ring on the rail
  vb.fill(-4, 31, 10, 3, 38, 10, wht);
  vb.fill(-1, 32, 11, 0, 37, 11, red); vb.fill(-3, 34, 11, 2, 35, 11, red);
  for (let a = -3; a <= 3; a++) for (let c = -3; c <= 3; c++) { const d2 = a * a + c * c; if (d2 > 11 || d2 < 3) continue; vb.set(9 + 1, 27 + c, a, ((Math.atan2(c, a) + 4) * 2 | 0) % 2 ? wht : red); }
  if (hw) jack(ctx, 0, 24, 5, { size: 1 });
  ctx.door = { ...M3(0, 0, -16), face: 'back' };
  ctx.posts = legs.map(([x, z]) => ({ x: r3((x * 1.25) / VPM), z: r3((z * 1.25) / VPM), r: 0.12 }));
  ctx.solids.push({ x0: -10 / VPM, y0: 22 / VPM, z0: -10 / VPM, x1: 10 / VPM, y1: 30 / VPM, z1: 10 / VPM });
  return ctx;
}

// ------------------------------------------------------------------ OUTDOOR HOCKEY RINK
function buildRink(spec, ctx) {
  const hw = ctx.hw;
  const W = evenV(spec.w ?? 26), D = evenV(spec.d ?? 13);
  const G = (ctx.G = 2);
  const x0 = -W / 2, x1 = W / 2 - 1, z0 = -D / 2, z1 = D / 2 - 1;
  const vb = (ctx.vb = new VB(x0 - 34, -10, z0 - 40, x1 + 34, 70, z1 + 12));
  const CR = 22; // corner radius
  const inside = (x, z, inset = 0) => {
    const cx = Math.max(x0 + CR, Math.min(x1 - CR, x)), cz = Math.max(z0 + CR, Math.min(z1 - CR, z));
    return Math.hypot(x - cx, z - cz) <= CR - inset;
  };
  const ICE = 0xe6eef2, ICE_D = 0xd2dce4, LRED = 0xc8383a, LBLUE = 0x3a5aa8;
  // ice + its markings
  for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
    if (!inside(x, z)) continue;
    let c = (vhash(x >> 2, z >> 2, 7) < 0.25 ? ICE_D : ICE);
    const ax = Math.abs(x + 0.5);
    if (ax < 1.5) c = LRED;
    if (Math.abs(ax - W / 6) < 1.5) c = LBLUE;
    if (Math.abs(ax - (W / 2 - 14)) < 0.8) c = LRED;
    for (const fx of [0, -(W / 2 - 34), W / 2 - 34]) { const d = Math.hypot(x + 0.5 - fx, z + 0.5); if (Math.abs(d - (fx ? 12 : 14)) < 0.8) c = LRED; if (d < 1.2) c = fx ? LRED : LBLUE; }
    // goal creases
    for (const sx of [-1, 1]) { const gx = sx * (W / 2 - 14); const d = Math.hypot(x + 0.5 - gx, z + 0.5); if (d < 7 && Math.sign(x + 0.5 - gx) === -sx) c = 0x9ab8e8; }
    vb.set(x, -1, z, c);
    vb.fill(x, -G - 2, z, x, -2, z, P.stoneB);
  }
  // boards: white, yellow kick plate, red cap; a gate on the front side
  const gate = [Math.round(-W * 0.3) - 6, Math.round(-W * 0.3) + 6];
  for (let z = z0 - 2; z <= z1 + 2; z++) for (let x = x0 - 2; x <= x1 + 2; x++) {
    if (inside(x, z) || !inside(x, z, -2)) continue;
    if (z > 0 && x >= gate[0] && x <= gate[1]) continue;
    for (let y = -G - 2; y <= 8; y++) vb.set(x, y, z, y < 0 ? P.stoneB : y <= 1 ? 0xe8c040 : y === 8 ? LRED : y === 7 ? LBLUE : 0xf2f0ea);
  }
  // plexiglass panels at the ends
  for (const sx of [-1, 1]) for (let z = z0 + 6; z <= z1 - 6; z++) for (let y = 9; y <= 16; y++) { const x = sx < 0 ? x0 - 1 : x1 + 1; vb.set(x, y, z, z % 12 === 0 || y === 16 ? 0xd8dce0 : 0xb8d8e8 | GLASS); }
  // bleachers along the back
  for (let r = 0; r < 4; r++) vb.fill(-44, r * 3, z0 - 6 - r * 4, 43, r * 3 + 2, z0 - 3 - r * 4, (x, y) => (y === r * 3 + 2 ? plankTone(x >> 2, 9, 0x4a7ab0) : P.woodDark));
  vb.fill(-44, -G, z0 - 22, 43, 11, z0 - 22, (x, y) => (x % 8 === 0 || y === 11 ? P.iron : 0));
  signFree(ctx, -24, 14, z0 - 21, 48, 8, 'PATINOIRE MAPLE COVE RINK', { bg: 0x2c3c64, fg: '#f2e8d4', edge: P.trim });
  vb.fill(-26, 0, z0 - 22, -25, 22, z0 - 22, P.iron); vb.fill(24, 0, z0 - 22, 25, 22, z0 - 22, P.iron);
  // light poles at the corners
  for (const [x, z] of [[x0 - 6, z0 - 6], [x1 + 6, z0 - 6], [x0 - 6, z1 + 6], [x1 + 6, z1 + 6]]) {
    vb.fill(x, -G, z, x + 1, 52, z + 1, P.iron);
    vb.fill(x - 3, 52, z - 1, x + 4, 54, z + 2, P.iron);
    vb.fill(x - 2, 51, z, x + 3, 51, z + 1, P.lampHot);
    addLight(ctx, [x + 0.5, 48, z + 0.5], [1.0, 0.92, 0.78], 18, 'lamp');
  }
  if (hw) {
    for (const [x, z] of [[x0 + 30, z1 + 3], [x1 - 30, z1 + 3], [x0 - 3, 0]]) jack(ctx, x, 9, z, { size: 1 });
    jack(ctx, -30, 12, z0 - 16, { size: 2 });
    jack(ctx, 22, 12, z0 - 16, { size: 2 });
  }
  ctx.door = { ...M3(gate[0] + 6, 0, z1 + 6), face: 'front' };
  // walkable ice, and the boards collide (four straight runs; the gate stays open)
  ctx.porch.push({ x0: r3(x0 / VPM), z0: r3(z0 / VPM), x1: r3((x1 + 1) / VPM), z1: r3((z1 + 1) / VPM), y: 0 });
  const bt = 2 / VPM, by1 = 1.1;
  ctx.solids.push({ collide: true, x0: r3((x0 + CR) / VPM), y0: 0, z0: r3((z0 - 2) / VPM), x1: r3((x1 - CR) / VPM), y1: by1, z1: r3(z0 / VPM) });
  ctx.solids.push({ collide: true, x0: r3((x0 + CR) / VPM), y0: 0, z0: r3((z1 + 1) / VPM), x1: r3(gate[0] / VPM), y1: by1, z1: r3((z1 + 3) / VPM) });
  ctx.solids.push({ collide: true, x0: r3((gate[1] + 1) / VPM), y0: 0, z0: r3((z1 + 1) / VPM), x1: r3((x1 - CR) / VPM), y1: by1, z1: r3((z1 + 3) / VPM) });
  ctx.solids.push({ collide: true, x0: r3((x0 - 2) / VPM), y0: 0, z0: r3((z0 + CR) / VPM), x1: r3(x0 / VPM), y1: by1, z1: r3((z1 - CR) / VPM) });
  ctx.solids.push({ collide: true, x0: r3((x1 + 1) / VPM), y0: 0, z0: r3((z0 + CR) / VPM), x1: r3((x1 + 3) / VPM), y1: by1, z1: r3((z1 - CR) / VPM) });
  void bt;
  return ctx;
}

// ------------------------------------------------------------------ COVERED BRIDGE (Beaver Creek)
// Local frame: the bridge runs along z (the road), the deck top is y = 0, walls at x = +-w/2.
function buildCoveredBridge(spec, ctx) {
  const hw = ctx.hw;
  const Wd = evenV(spec.w ?? 5.2), Ln = evenV(spec.d ?? 24);
  const x0 = -Wd / 2, x1 = Wd / 2 - 1, z0 = -Ln / 2, z1 = Ln / 2 - 1;
  const H = 30; // wall height above the deck
  const G = (ctx.G = 0);
  const vb = (ctx.vb = new VB(x0 - 10, -46, z0 - 6, x1 + 10, H + 34, z1 + 6));
  const red = 0xa83a2c, redD = 0x8a2e24;
  // deck planks (across the bridge) on heavy stringers
  vb.fill(x0, -2, z0, x1, -1, z1, (x, y, z) => (y === -1 ? plankTone(z >> 1, ctx.seed, P.plank) : P.woodDark));
  for (const x of [x0 + 2, -1, x1 - 2]) vb.fill(x - 1, -6, z0, x + 1, -3, z1, P.woodDD);
  // stone piers into the creek: at the banks and two in the water
  for (const z of [z0 + 4, Math.round(z0 / 3), Math.round(z1 / 3), z1 - 4]) vb.fill(x0 + 1, -46, z - 3, x1 - 1, -7, z + 3, stoneFn(ctx.seed + 2));
  // board & batten walls with a long window band, white trim
  for (const x of [x0, x1]) {
    for (let z = z0; z <= z1; z++) for (let y = 0; y <= H; y++) {
      const win = y >= 10 && y <= 19 && ((z - z0) % 16) > 2 && ((z - z0) % 16) < 14;
      if (win) continue;
      const bat = (z - z0) % 4 === 0;
      vb.set(x, y, z, bat ? redD : red);
      if (bat && y < H) vb.set(x + (x < 0 ? -1 : 1), y, z, redD);
    }
    vb.fill(x + (x < 0 ? -1 : 1), 9, z0, x + (x < 0 ? -1 : 1), 9, z1, P.trim);
    vb.fill(x + (x < 0 ? -1 : 1), 20, z0, x + (x < 0 ? -1 : 1), 20, z1, P.trim);
    vb.fill(x, 0, z0, x, 1, z1, P.woodDark);
  }
  // trusses showing inside the window band
  for (const x of [x0 + 1, x1 - 1]) for (let z = z0; z <= z1 - 16; z += 16) { vb.line(x, 10, z + 2, x, 19, z + 14, P.woodDark); vb.line(x, 19, z + 2, x, 10, z + 14, P.woodDark); }
  // roof: a steep gable along the bridge, overhanging the portals
  const Rf = roofGeom({ axis: 'z', b: { x0, x1, z0, z1 }, H: H + 1, pitch: 0.75, oh: 4, ohR0: 4, ohR1: 4 });
  const st = roofStyle(spec.roof ?? 'dark', ctx.seed, { gutter: false });
  for (let z = z0; z <= z1; z++) for (let x = x0 + 1; x <= x1 - 1; x++) for (let y = H + 1; y < Rf.topAt(x, z) - Rf.t; y++) if (z === z0 || z === z1) vb.set(x, y, z, red);
  drawRoof(vb, Rf, st);
  // portals: gable boards with the name, white posts, a lantern inside each end
  for (const [z, face] of [[z1, 1], [z0, -1]]) {
    for (let x = x0 - 1; x <= x1 + 1; x++) for (let y = H - 3; y <= H; y++) vb.set(x, y, z + face, P.trim);
    for (const x of [x0 - 1, x1 + 1]) vb.fill(x, 0, z + face, x, H, z + face, P.trim);
    const sw = Math.min(Wd - 8, 34), sh = 6;
    vb.fill(-sw / 2 - 1, H + 2, z + face, sw / 2, H + 3 + sh, z + face, P.woodDark);
    const p = M3(-0.5, H + 3 + sh / 2, z + face + (face > 0 ? 1 : 0));
    ctx.signs.push({ x: p.x, y: p.y, z: r3(p.z + face * 0.012), w: sw / VPM, h: sh / VPM, text: 'BEAVER CREEK', normal: [0, 0, face], bg: '#5a3a22', fg: '#f6e7c8' });
    vb.fill(-1, H - 5, z - face * 10, 0, H - 3, z - face * 10, P.lamp);
    addLight(ctx, [-0.5, H - 6, z - face * 10], [1.0, 0.7, 0.35], 8, 'lamp');
  }
  if (hw) {
    jack(ctx, x0 + 3, 0, z1 - 3, { size: 1 });
    jack(ctx, x1 - 3, 0, z0 + 3, { size: 1 });
    cobweb(ctx, [x0 + 1, H - 1, z1 - 1], [1, 0, 0], [0, -1, 0], 6);
    cobweb(ctx, [x1 - 1, H - 1, z0 + 1], [-1, 0, 0], [0, -1, 0], 6);
    placeBats(ctx, frames(vb, { x0, x1, z0, z1 }).left, 2, 22, H - 2);
  }
  return ctx;
}

// ------------------------------------------------------------------ API
const KINDS = {
  house: buildHouse, cabin: buildCabin, shed: buildGarage, garage: buildGarage, outhouse: buildOuthouse, chapel: buildChapel, lighthouse: buildLighthouse, sawmill: buildSawmill,
  shop: buildShop, firehall: buildFirehall, barn: buildBarn, sugarshack: buildSugarShack, gazebo: buildGazebo, lifeguard: buildLifeguard, rink: buildRink, coveredBridge: buildCoveredBridge,
};

export function buildVoxelBuilding(spec = {}) {
  const hw = spec.halloween !== false;
  const seed = ((spec.seed ?? 0) ^ strHash(String(spec.id ?? spec.kind ?? 'building'))) >>> 0;
  const stilt = spec.stilt ?? (spec.stilts ? 3.6 : 0);
  const ctx = {
    spec, hw, seed, R: mkRng(seed), stiltV: Math.max(0, Math.round(stilt * VPM)),
    lights: [], smoke: [], signs: [], porch: [], solids: [], door: null, G: 0, jackLights: 0, maxJackLights: 4,
  };
  const fn = KINDS[spec.kind] || buildHouse;
  fn(spec, ctx);
  const { vox, origin, lo, hi } = ctx.vb.finish();
  const meta = {
    id: spec.id, kind: spec.kind,
    door: ctx.door ?? { x: 0, y: 0, z: r3((spec.d ?? 4) / 2 + 0.3), face: 'front' },
    footprint: { w: spec.w, d: spec.d },
    height: r3(hi[1] / VPM), depth: r3(lo[1] / VPM), ground: r3(-ctx.G / VPM),
    bounds: { x0: r3(lo[0] / VPM), y0: r3(lo[1] / VPM), z0: r3(lo[2] / VPM), x1: r3(hi[0] / VPM), y1: r3(hi[1] / VPM), z1: r3(hi[2] / VPM) },
    lights: ctx.lights, smoke: ctx.smoke, signs: ctx.signs, porch: ctx.porch, solids: ctx.solids.map((s) => ({ ...s, x0: r3(s.x0), y0: r3(s.y0), z0: r3(s.z0), x1: r3(s.x1), y1: r3(s.y1), z1: r3(s.z1) })),
    posts: ctx.posts || [], mo: ctx.mo || null,
    halloween: hw,
  };
  return { vox, size: VOXEL_SIZE, origin, jitter: 0, meta };
}
// The far-away version of a building model: the 1/16 m voxels merged back into 1/8 m ones (a cell
// is kept when at least half of it is filled, in its most common colour). Thin trim, lap lines and
// muntins melt away, which is fine past a few dozen metres and roughly halves the triangles.
export function lowDetail(r) {
  const v = r.vox, [ox, oy, oz] = r.origin;
  const at = v.data ? (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= v.w || y >= v.h || z >= v.d ? 0 : v.data[x + v.w * (y + v.h * z)]) : (x, y, z) => v.get(x, y, z);
  const c0 = [Math.floor(-ox / 2), Math.floor(-oy / 2), Math.floor(-oz / 2)];
  const c1 = [Math.floor((v.w - 1 - ox) / 2), Math.floor((v.h - 1 - oy) / 2), Math.floor((v.d - 1 - oz) / 2)];
  const out = new Vox(c1[0] - c0[0] + 1, c1[1] - c0[1] + 1, c1[2] - c0[2] + 1);
  const cs = new Array(8);
  for (let z = 0; z < out.d; z++) for (let y = 0; y < out.h; y++) for (let x = 0; x < out.w; x++) {
    const fx = (x + c0[0]) * 2 + ox, fy = (y + c0[1]) * 2 + oy, fz = (z + c0[2]) * 2 + oz;
    let n = 0;
    for (let k = 0; k < 8; k++) { const c = at(fx + (k & 1), fy + ((k >> 1) & 1), fz + (k >> 2)); if (c) cs[n++] = c; }
    if (n < 4) continue;
    let best = cs[0], bc = 0;
    for (let a = 0; a < n; a++) {
      let m = 0;
      for (let b = 0; b < n; b++) if (cs[b] === cs[a]) m++;
      if (m > bc) { bc = m; best = cs[a]; }
    }
    out.data[x + out.w * (y + out.h * z)] = best;
  }
  return { ...r, vox: out, size: r.size * 2, origin: [-c0[0], -c0[1], -c0[2]] };
}

export const buildHouseVox = (spec) => buildVoxelBuilding({ kind: 'house', ...spec });
export const buildCabinVox = (spec) => buildVoxelBuilding({ kind: 'cabin', ...spec });
export const buildGarageVox = (spec) => buildVoxelBuilding({ kind: 'shed', ...spec });
export const buildOuthouseVox = (spec) => buildVoxelBuilding({ kind: 'outhouse', ...spec });
export const buildChapelVox = (spec) => buildVoxelBuilding({ kind: 'chapel', ...spec });
export const buildLighthouseVox = (spec) => buildVoxelBuilding({ kind: 'lighthouse', ...spec });
export const buildSawmillVox = (spec) => buildVoxelBuilding({ kind: 'sawmill', ...spec });

// one preview per layout building (stilt houses get 3.6 m stilts), plus a non-Halloween house
export const PREVIEW = {};
// (preview only: the pivot is moved to the lowest voxel so stilts and foundations stand on the preview ground)
const lifted = (r) => ({ ...r, origin: [r.origin[0], 0, r.origin[2]] });
for (const b of BUILDINGS) PREVIEW[b.id] = () => lifted(buildVoxelBuilding({ ...b, stilt: b.stilts ? 3.6 : 0 }));
PREVIEW.house5_plain = () => lifted(buildVoxelBuilding({ ...BUILDINGS.find((b) => b.id === 'house5'), halloween: false }));
PREVIEW.covered_bridge = () => lifted(buildVoxelBuilding({ id: 'bridge', kind: 'coveredBridge', w: 5.2, d: 24 }));
PREVIEW.cafe_plain = () => lifted(buildVoxelBuilding({ ...BUILDINGS.find((b) => b.id === 'cafe'), stilt: 3.6, halloween: false }));
