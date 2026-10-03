// Voxel models for the inside of Nana's log cabin: the room shell (log walls, plank floor,
// a vaulted plank ceiling with log trusses), the stone fireplace, sofa, Harold's armchair,
// Nana's rocker, braided rugs, bookshelf, kitchen corner, dining set, grandfather clock,
// photos, quilts, plants, lamps and window dressing.
//
// Every builder returns { vox, size, origin, jitter: 0, meta } like props.js:
//   size    metres per voxel (0.1 for the shell, 0.05 furniture, 0.025 small detailed bits)
//   origin  pivot in voxel units: bottom-centre, or back-centre (wall pieces, origin z = 0)
//   meta    model specific points in metres relative to the origin
// Furniture faces +z (where you sit / look from); x is its width.
import { Vox, EMIT, tone, mixc, vhash } from '../vox.js';

const STD = 0.05;
const FINE = 0.025;

// ------------------------------------------------------------------ palette
const LOG = 0x8e5c34, CHINK = 0xa8916c;
const PLANKS = [0x9a6a3e, 0x8c5e36, 0xa67446];
const CEIL = [0xb88a58, 0xae8050, 0xc29462];
const BEAM = 0x6e4628;
const STONES = [0x8e8a84, 0x7e7a74, 0xa29e96, 0x726e6a, 0x988c80];
const MORTAR = 0xbcb2a0, SOOT = 0x2a2220, SOOT2 = 0x3a2c26;
const IRON = 0x2e2a2e, IRON_L = 0x4a4650, NICKEL = 0xb8bcc4, NICKEL_D = 0x8a8e96;
const BRASS = 0xd8a840, BRASS_D = 0xa87a28, BRASS_L = 0xf4d27a;
const WOOD = 0x8a5a32, WOOD_D = 0x5e3a1e, WOOD_L = 0xab7642, WOOD_DD = 0x40261a;
const OAK = 0x9a6a38, OAK_L = 0xb88448, CHERRY = 0x6e3424, CHERRY_L = 0x8a4630;
const CREAM = 0xf2e6c8, CREAM_D = 0xd8c8a4, WHITE = 0xf6f2ea;
const RED = 0xb8322a, RED_D = 0x84221e, RED_L = 0xd8503a;
const RUST = 0xa4462c, RUST_D = 0x7e3220, RUST_L = 0xc0603c;
const GREEN = 0x3e5e3a, GREEN_D = 0x2c4428, GREEN_L = 0x5a7a4a;
const SAGE = 0x7e9a78, SAGE_D = 0x627e5e;
const MUSTARD = 0xd4a03a, NAVY = 0x2e3e62, TEAL = 0x2f7f7a, PLUM = 0x6a3a5a, LAVENDER = 0x9a86b8;
const LEAF = 0x4e8a32, LEAF_D = 0x356424, LEAF_L = 0x74aa46;
const TERRA = 0xb8643a, TERRA_D = 0x8e4a2a;
const STRAW = 0xd2ae5c, STRAW_D = 0xa8843a;
const FIRE = [0xff5a1e | EMIT, 0xff8a24 | EMIT, 0xffb83c | EMIT, 0xffe08a | EMIT];
const GLOWSHADE = 0xf4cc8a | EMIT;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const cf = (c, ...a) => (typeof c === 'function' ? c(...a) : c);
const out = (v, size, origin, meta = {}) => ({ vox: v, size, origin: origin || [v.w / 2, 0, v.d / 2], jitter: 0, meta });
// wood grain running along an axis ('x' | 'y' | 'z')
function grain(c, axis = 'x', amt = 0.07, seed = 0) {
  return (x, y, z) => {
    const a = axis === 'x' ? vhash(0, y, z, seed) : axis === 'y' ? vhash(x, 0, z, seed) : vhash(x, y, 0, seed);
    const along = axis === 'x' ? x : axis === 'y' ? y : z;
    return tone(c, (a - 0.5) * amt * 2 + (vhash(along >> 2, a * 97 | 0, 1, seed + 1) - 0.5) * 0.04);
  };
}
const spk = (c, amt = 0.06, seed = 0) => (x, y, z) => tone(c, (vhash(x, y, z, seed) - 0.5) * 2 * amt);
// rounded box (horizontal corner radius r, vertical ry)
function rbox(v, x0, y0, z0, x1, y1, z1, r, c, ry = r) {
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const qx = Math.max(x0 + r - x, 0, x - (x1 - r)), qy = Math.max(y0 + ry - y, 0, y - (y1 - ry)), qz = Math.max(z0 + r - z, 0, z - (z1 - r));
    const nx = r > 0 ? qx / r : 0, ny = ry > 0 ? qy / ry : 0, nz = r > 0 ? qz / r : 0;
    if (nx * nx + ny * ny + nz * nz > 1.001) continue;
    const col = cf(c, x, y, z);
    if (col) v.set(x, y, z, col);
  }
}
// cylinders along an axis
function cylX(v, cy, cz, r, x0, x1, c) {
  for (let x = x0; x <= x1; x++) for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
    const d = Math.hypot(y - cy, z - cz);
    if (d <= r + 0.2) v.set(x, y, z, cf(c, x, y, z, d / Math.max(r, 0.5)));
  }
}
function cylY(v, cx, cz, r, y0, y1, c) {
  for (let y = y0; y <= y1; y++) {
    const rr = cf(r, y);
    for (let x = Math.floor(cx - rr - 1); x <= Math.ceil(cx + rr + 1); x++) for (let z = Math.floor(cz - rr - 1); z <= Math.ceil(cz + rr + 1); z++) {
      const d = Math.hypot(x - cx, z - cz);
      if (d <= rr + 0.2) v.set(x, y, z, cf(c, x, y, z, d / Math.max(rr, 0.5)));
    }
  }
}
function cylZ(v, cx, cy, r, z0, z1, c) {
  for (let z = z0; z <= z1; z++) for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d <= r + 0.2) v.set(x, y, z, cf(c, x, y, z, d / Math.max(r, 0.5)));
  }
}
// stone masonry on any face: stones ~5x3 voxels with mortar joints
function stoneFn(seed = 0) {
  return (x, y, z) => {
    const row = Math.floor(y / 4);
    const u = x + z + (row % 2) * 3 + Math.floor(vhash(row, 0, 0, seed) * 4);
    if (y % 4 === 3 || u % 6 === 5) return tone(MORTAR, (vhash(x, y, z, seed) - 0.5) * 0.1);
    const id = Math.floor(u / 6);
    const base = STONES[Math.floor(vhash(id, row, 3, seed) * STONES.length)];
    return tone(base, (vhash(x, y, z, seed + 7) - 0.5) * 0.12 + (y % 4 === 0 ? -0.05 : 0.03));
  };
}
// patchwork quilt colour at (u, v) voxel coords along its surface
const PATCH = [RED, CREAM, MUSTARD, SAGE, NAVY, RUST_L, 0xc87a8a, TEAL];
function quiltFn(seed = 0, cell = 4) {
  return (u, w) => {
    const pu = Math.floor(u / cell), pw = Math.floor(w / cell);
    if (u % cell === 0 || w % cell === 0) return 0xe8dcc0; // stitched seams
    const base = PATCH[Math.floor(vhash(pu, pw, 0, seed) * PATCH.length)];
    // gingham on some patches, little flowers on others
    const kind = vhash(pu, pw, 1, seed);
    if (kind < 0.3 && ((u + w) % 2 === 0)) return tone(base, 0.25);
    if (kind > 0.8 && u % cell === 2 && w % cell === 2) return CREAM;
    return base;
  };
}

// ------------------------------------------------------------------ the room shell (0.1 m voxels)
// Room-local metres: x across (fireplace wall at +x), z front (+z, the door), y up from the floor.
// The inner faces of the walls are at |x| = 5.2 and |z| = 4.2; the ceiling follows the roof pitch.
export const ROOM = {
  x0: -5.2, x1: 5.2, z0: -4.2, z1: 4.2, wallH: 3.25, pitch: 0.9,
  ceilAt: (z) => 3.25 + (4.2 - Math.min(4.2, Math.abs(z))) * 0.9,
  beams: [-3.9, -1.3, 1.3, 3.9],
  beamY: 3.0,
  // window openings: wall, centre along the wall, width, sill height, height
  windows: [
    { wall: 'back', c: -3.15, w: 0.9, y: 0.9, h: 1.1 },
    { wall: 'back', c: -0.05, w: 0.9, y: 0.9, h: 1.1 },
    { wall: 'left', c: 0.05, w: 0.9, y: 0.9, h: 1.1 },
    { wall: 'left', c: -0.05, w: 0.7, y: 4.0, h: 0.8, gable: true },
    { wall: 'front', c: -3.95, w: 0.9, y: 0.9, h: 1.1 },
    { wall: 'front', c: -1.95, w: 0.9, y: 0.9, h: 1.1 },
    { wall: 'front', c: 1.95, w: 0.9, y: 0.9, h: 1.1 },
    { wall: 'front', c: 3.95, w: 0.9, y: 0.9, h: 1.1 },
  ],
  door: { c: 0, w: 1.0, h: 2.1 },
};

export function cabinShell() {
  const S = 0.1;
  const OX = 54, OY = 1, OZ = 44;
  const W = 108, H = 76, D = 88;
  const v = new Vox(W, H, D);
  const gx = (m) => Math.round(m / S) + OX, gy = (m) => Math.round(m / S) + OY, gz = (m) => Math.round(m / S) + OZ;
  const mx = (i) => (i - OX + 0.5) * S, mz = (k) => (k - OZ + 0.5) * S;
  const ceilJ = (k) => gy(ROOM.ceilAt(mz(k)));
  // logs: courses of 4 voxels (shadowed underside, body, sunlit top, recessed chinking)
  const logC = (along, j, inner, seed) => {
    const jj = j - OY;
    const course = Math.floor(jj / 4), r = jj % 4;
    if (r === 3) return inner ? 0 : tone(CHINK, (vhash(along >> 2, j, 0, seed) - 0.5) * 0.08);
    const seg = Math.floor((along + course * 13) / 31);
    const base = tone(LOG, (vhash(course, seg, 2, seed) - 0.5) * 0.18);
    // knots and checks here and there; otherwise long runs so the mesher can merge them
    const knot = vhash(along, course, 3, seed) < 0.02 ? -0.12 : 0;
    return tone(base, (r === 0 ? -0.09 : r === 2 ? 0.06 : 0) + knot);
  };
  // floor: wide pine planks along x, staggered joints, nail heads
  for (let k = 2; k < D - 2; k++) for (let i = 2; i < W - 2; i++) {
    const b = Math.floor((k - 2) / 3);
    const base = PLANKS[Math.floor(vhash(b, 0, 0, 5) * 3)];
    const off = Math.floor(vhash(b, 1, 0, 5) * 24);
    const joint = (i + off) % 24 === 0;
    const segI = Math.floor((i + off) / 24);
    let c = tone(base, (vhash(segI, b, 1, 6) - 0.5) * 0.1 + ((k - 2) % 3 === 2 ? -0.07 : 0));
    if (joint) c = tone(base, -0.16);
    v.set(i, 0, k, c);
  }
  // walls
  const topFB = gy(ROOM.wallH);
  for (let k = 0; k < D; k++) for (let j = 1; j <= topFB + 1; j++) {
    // front / back walls run along x
    for (const kk of [0, 1, D - 2, D - 1]) {
      if (k !== kk) continue;
      const inner = kk === 1 || kk === D - 2;
      for (let i = 0; i < W; i++) {
        const c = logC(i, j, inner, kk < 2 ? 1 : 2);
        if (c) v.set(i, j, kk, c);
      }
    }
  }
  for (let k = 0; k < D; k++) {
    const top = Math.max(topFB + 1, ceilJ(k) + 2);
    for (let j = 1; j <= top; j++) for (const ii of [0, 1, W - 2, W - 1]) {
      const inner = ii === 1 || ii === W - 2;
      const c = logC(k, j, inner, ii < 2 ? 3 : 4);
      if (c) v.set(ii, j, k, c);
    }
  }
  // vaulted ceiling: planks running down the slope
  for (let k = 2; k < D - 2; k++) {
    const j0 = ceilJ(k);
    for (let i = 2; i < W - 2; i++) {
      const b = Math.floor((i - 2) / 3);
      const c = CEIL[(b + (b >> 2)) % 3];
      v.fill(i, j0, k, i, j0 + 1, k, c);
    }
    // the wall plates where the ceiling meets the front/back walls
  }
  for (const k of [2, D - 3]) v.fill(2, topFB - 1, k, W - 3, topFB + 1, k, grain(BEAM, 'x', 0.06, 3));
  // trusses: tie beam, rafters following the ceiling, king post; ridge beam along x
  const beamC = (x, y, z) => tone(BEAM, (vhash(0, y, z, 4) - 0.5) * 0.1);
  for (const bx of ROOM.beams) {
    const i0 = gx(bx) - 1, i1 = gx(bx);
    const jb = gy(ROOM.beamY);
    v.fill(i0, jb, 2, i1, jb + 2, D - 3, (x, y, z) => (y === jb ? tone(BEAM, -0.12) : beamC(x, y, z)));
    for (let k = 2; k < D - 2; k++) {
      const jc = ceilJ(k);
      v.fill(i0, jc - 2, k, i1, jc - 1, k, (x, y, z) => tone(beamC(x, y, z), -0.05));
    }
    v.fill(i0, jb + 3, OZ - 1, i1, ceilJ(OZ) - 1, OZ, beamC);
    // iron strap where the king post meets the tie beam
    v.fill(i0, jb + 3, OZ - 2, i1, jb + 4, OZ + 1, IRON_L);
  }
  const jr = ceilJ(OZ);
  v.fill(2, jr - 3, OZ - 2, W - 3, jr - 1, OZ + 1, (x, y, z) => tone(beamC(x, y, z), y === jr - 3 ? -0.1 : 0));
  // window and door openings
  for (const w of ROOM.windows) {
    const y0 = gy(w.y), y1 = gy(w.y + w.h) - 1;
    const a0 = Math.round((w.c - w.w / 2) / S), a1 = Math.round((w.c + w.w / 2) / S) - 1;
    if (w.wall === 'back') v.clear(a0 + OX, y0, 0, a1 + OX, y1, 1);
    if (w.wall === 'front') v.clear(a0 + OX, y0, D - 2, a1 + OX, y1, D - 1);
    if (w.wall === 'left') v.clear(0, y0, a0 + OZ, 1, y1, a1 + OZ);
  }
  const d = ROOM.door;
  v.clear(Math.round((d.c - d.w / 2) / S) + OX, 1, D - 2, Math.round((d.c + d.w / 2) / S) + OX - 1, gy(d.h) - 1, D - 1);
  return out(v, S, [OX, OY, OZ], { room: ROOM });
}

// ------------------------------------------------------------------ fireplace (back-centre origin)
// Stone surround with an arched firebox, a log mantel, the chimney breast up to `top` metres.
export function fireplace({ top = 6.6, seed = 3 } = {}) {
  const W = 44, D = 18, H = Math.round(top / STD);
  const v = new Vox(W, H, D);
  const st = stoneFn(seed);
  // hearth slab (flagstones)
  v.fill(0, 0, 0, W - 1, 1, D - 1, (x, y, z) => ((x % 7 === 0 || z % 6 === 0) && y === 1 ? tone(MORTAR, -0.15) : tone(STONES[Math.floor(vhash(x / 7 | 0, z / 6 | 0, 0, seed) * 5)], (vhash(x, y, z, 2) - 0.5) * 0.1)));
  // surround
  v.fill(2, 2, 0, W - 3, 29, 9, st);
  // firebox opening with an arched top, sooty inside
  for (let x = 12; x <= 31; x++) {
    const t = (x - 21.5) / 10;
    const top2 = Math.round(17 - t * t * 3);
    for (let y = 2; y <= top2; y++) for (let z = 3; z <= 9; z++) v.set(x, y, z, 0);
    for (let y = 2; y <= top2 + 1; y++) v.set(x, y, 2, y > top2 - 3 ? SOOT : (x + y) % 5 === 0 ? SOOT2 : tone(SOOT2, -0.2));
  }
  for (const x of [11, 32]) for (let y = 2; y <= 15; y++) for (let z = 3; z <= 9; z++) v.set(x, y, z, z < 7 ? SOOT2 : st(x, y, z));
  // arch voussoirs + keystone
  for (let x = 11; x <= 32; x++) {
    const t = (x - 21.5) / 10.5;
    const y = Math.round(18 - t * t * 3);
    v.fill(x, y, 8, x, y + 1, 10, tone(STONES[2], (x % 3 === 0 ? -0.1 : 0.04)));
  }
  v.fill(20, 18, 8, 23, 21, 10, tone(STONES[4], 0.06));
  // ember bed, logs on andirons, flames (glowing voxels; particles add the motion)
  for (let x = 13; x <= 30; x++) for (let z = 3; z <= 8; z++) v.set(x, 2, z, FIRE[Math.floor(vhash(x, 2, z, 4) * 2)]);
  for (const ax of [14, 29]) {
    v.fill(ax, 2, 4, ax, 5, 4, IRON);
    v.fill(ax, 3, 4, ax, 3, 10, IRON);
    v.fill(ax, 3, 10, ax, 6, 10, IRON);
    v.set(ax, 7, 10, BRASS);
  }
  const bark = (x, y, z, d) => (d > 0.8 ? (vhash(x, y, z, 6) < 0.3 ? FIRE[0] : 0x2c2018) : vhash(x, y, z, 7) < 0.25 ? FIRE[1] : 0x4a3020);
  cylX(v, 5, 6, 1.6, 13, 30, bark);
  cylX(v, 7.5, 4.5, 1.4, 15, 28, bark);
  for (const [fx, fz, fh] of [[17, 6, 6], [21, 5, 8], [25, 6, 7], [19, 7, 4], [28, 5, 4]]) {
    for (let k = 0; k < fh; k++) {
      const yy = 8 + k, rr = Math.max(0, 1.4 - k * 0.25);
      for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) <= rr) v.set(fx + dx + (k > fh / 2 ? (vhash(fx, k, 0) < 0.5 ? 1 : 0) : 0), yy, fz, FIRE[Math.min(3, 1 + Math.floor(k / 2.5))]);
    }
  }
  // log mantel with a carved edge
  v.fill(0, 30, 0, W - 1, 33, 11, (x, y, z) => (z === 11 && y === 31 ? tone(WOOD_D, -0.1) : grain(WOOD, 'x', 0.08, 11)(x, y, z)));
  v.fill(1, 29, 9, W - 2, 29, 11, tone(WOOD_D, -0.05));
  // chimney breast
  v.fill(8, 34, 0, W - 9, H - 1, 7, st);
  // brass candlesticks, a little pumpkin and a stack of letters on the mantel
  for (const cx of [4, 39]) {
    v.fill(cx - 1, 34, 6, cx + 1, 34, 8, BRASS_D);
    v.fill(cx, 35, 7, cx, 38, 7, BRASS);
    v.fill(cx, 39, 7, cx, 41, 7, CREAM);
    v.set(cx, 42, 7, 0xffd870 | EMIT);
  }
  v.ellipsoid(9, 36, 7, 2.2, 1.8, 2.2, (x, y, z) => ((x + z) % 3 === 0 ? 0xc85c16 : 0xe8741e));
  v.set(9, 38, 7, 0x6a6a2c);
  v.fill(33, 34, 5, 36, 34, 8, CREAM_D);
  v.fill(33, 35, 6, 36, 35, 8, WHITE);
  return out(v, STD, [W / 2, 0, 0], {
    fire: { x: 0, y: 0.35, z: 0.3 },
    flames: [[-0.2, 0.42, 0.3], [0, 0.45, 0.28], [0.2, 0.42, 0.3]],
    mantelY: 1.7,
  });
}

// ------------------------------------------------------------------ seating
// a deep, squashy sofa in rust corduroy with a quilt over the back
export function sofa({ seed = 1 } = {}) {
  const W = 42, D = 18, H = 19;
  const v = new Vox(W, H, D);
  const fab = (x, y, z) => tone(RUST, ((x + y) % 2 ? 0.03 : -0.02) + (vhash(x, y, z, seed) - 0.5) * 0.06);
  const fabD = (x, y, z) => tone(RUST_D, (vhash(x, y, z, seed) - 0.5) * 0.06);
  for (const [x, z] of [[2, 2], [W - 3, 2], [2, D - 3], [W - 3, D - 3]]) v.fill(x - 1, 0, z - 1, x, 0, z, WOOD_D);
  // base and skirt
  v.fill(1, 1, 1, W - 2, 5, D - 2, fabD);
  v.fill(1, 1, D - 2, W - 2, 1, D - 2, tone(RUST_D, -0.15));
  // seat cushions (three, puffy with a seam)
  for (const [a, b] of [[4, 15], [16, 27], [28, 37]]) rbox(v, a, 6, 4, b, 8, D - 1, 2, (x, y, z) => (x === a || x === b ? tone(RUST_D, 0.05) : fab(x, y, z)), 1);
  // back and back cushions
  rbox(v, 2, 6, 0, W - 3, 17, 4, 1, fabD, 1);
  for (const [a, b] of [[4, 15], [16, 27], [28, 37]]) rbox(v, a, 9, 3, b, 16, 6, 2, fab, 2);
  // rolled arms
  for (const [a, b] of [[0, 3], [W - 4, W - 1]]) {
    v.fill(a, 1, 1, b, 10, D - 2, fabD);
    cylZ(v, (a + b) / 2, 11, 2.3, 1, D - 1, (x, y, z, d) => (z === D - 1 && d < 0.5 ? tone(RUST_D, -0.1) : fab(x, y, z)));
  }
  // throw pillows: cream cable knit and a red plaid
  rbox(v, 5, 9, 6, 10, 14, 8, 1, (x, y) => ((x + y) % 3 === 0 ? CREAM_D : CREAM), 1);
  rbox(v, 31, 9, 6, 36, 14, 8, 1, (x, y) => (x % 3 === 0 || y % 3 === 0 ? RED_D : (x + y) % 2 ? RED : RED_L), 1);
  // folded quilt over the back right
  const q = quiltFn(seed + 5, 3);
  for (let x = 24; x <= 37; x++) {
    for (let y = 12; y <= 18; y++) v.set(x, y, 0, q(x, y));
    for (let z = 0; z <= 4; z++) v.set(x, 18, z, q(x, z + 20));
    for (let y = 14; y <= 18; y++) if (y >= 15 - (x % 2)) v.set(x, y, 5, q(x, y + 7));
  }
  return out(v, STD, null, { seat: { y: 0.45, z: 0.12 }, width: 2.1, depth: 0.9 });
}

// Harold's wingback armchair in green tartan, with a doily on the headrest
export function armchair({ seed = 2 } = {}) {
  const W = 19, D = 18, H = 24;
  const v = new Vox(W, H, D);
  const tart = (x, y, z) => {
    const u = x + z;
    if (u % 8 === 0 || y % 8 === 0) return RED_D;
    if (u % 8 === 4 && y % 8 === 4) return MUSTARD;
    return ((u >> 1) + (y >> 1)) % 2 ? GREEN : GREEN_D;
  };
  for (const [x, z] of [[2, 2], [W - 3, 2], [2, D - 3], [W - 3, D - 3]]) v.fill(x - 1, 0, z - 1, x, 1, z, WOOD_DD);
  v.fill(1, 2, 1, W - 2, 5, D - 2, tart);
  rbox(v, 3, 6, 3, W - 4, 8, D - 1, 2, tart, 1);
  rbox(v, 2, 6, 0, W - 3, 23, 4, 2, tart, 2);
  // wings
  for (const [a, b] of [[0, 2], [W - 3, W - 1]]) {
    v.fill(a, 2, 1, b, 11, D - 2, tart);
    cylZ(v, (a + b) / 2, 12, 1.7, 1, D - 1, tart);
    for (let y = 12; y <= 22; y++) for (let z = 1; z <= 8 - Math.max(0, y - 18); z++) v.set(a + (b - a) / 2 | 0, y, z, tart(a, y, z));
    v.fill(a, 12, 1, b, 20, 6, tart);
  }
  // crocheted doily
  for (let x = 6; x <= 12; x++) for (let y = 19; y <= 22; y++) if ((x + y) % 2 === 0 || y === 19) v.set(x, y, 5, y === 19 && x % 2 ? 0 : WHITE);
  return out(v, STD, null, { seat: { y: 0.45, z: 0.1 } });
}

// Nana's rocking chair: spindle back, red check cushion, lavender shawl
export function rocker({ seed = 3 } = {}) {
  const W = 13, D = 20, H = 23;
  const v = new Vox(W, H, D);
  const wd = grain(OAK, 'y', 0.06, seed);
  for (const x of [1, W - 2]) for (let z = 0; z < D; z++) {
    const y = Math.round(((z - D / 2) * (z - D / 2)) / 26);
    v.set(x, y, z, tone(OAK, -0.08));
    v.set(x, y + 1, z, OAK);
  }
  for (const x of [1, W - 2]) for (const z of [5, 14]) v.fill(x, 1, z, x, 8, z, wd);
  v.fill(1, 8, 4, W - 2, 9, 15, grain(OAK, 'x', 0.06, seed));
  v.fill(2, 10, 5, W - 3, 10, 14, (x, y, z) => ((x >> 1) + (z >> 1)) % 2 ? RED : CREAM);
  for (const x of [1, W - 2]) v.fill(x, 9, 4, x, 21, 4, wd);
  for (let x = 3; x <= W - 4; x += 2) v.fill(x, 11, 4, x, 19, 4, wd);
  v.fill(1, 20, 4, W - 2, 21, 4, wd);
  v.fill(2, 22, 4, W - 3, 22, 4, tone(OAK, 0.06));
  for (const x of [0, W - 1]) {
    v.fill(x, 14, 4, x, 14, 15, wd);
    v.fill(x, 9, 14, x, 13, 14, wd);
  }
  // shawl over the back
  for (let x = 2; x <= W - 3; x++) for (let y = 15; y <= 21; y++) if (y > 16 + ((x * 3) % 3) - 1) v.set(x, y, 3, (x + y) % 3 === 0 ? tone(LAVENDER, -0.15) : LAVENDER);
  return out(v, STD);
}

// ladder-back dining chair with a woven rush seat
export function chair({ seed = 4 } = {}) {
  const W = 10, D = 10, H = 21;
  const v = new Vox(W, H, D);
  const wd = grain(OAK, 'y', 0.06, seed);
  for (const [x, z] of [[1, 1], [W - 2, 1], [1, D - 2], [W - 2, D - 2]]) v.fill(x, 0, z, x, 7, z, wd);
  v.fill(1, 3, 1, W - 2, 3, 1, OAK);
  v.fill(1, 3, D - 2, W - 2, 3, D - 2, OAK);
  v.fill(1, 8, 1, W - 2, 8, D - 2, (x, y, z) => ((x + z) % 2 ? STRAW : STRAW_D));
  for (const x of [1, W - 2]) v.fill(x, 8, 1, x, 19, 1, wd);
  for (const y of [11, 14, 17]) v.fill(2, y, 1, W - 3, y, 1, tone(OAK, 0.05));
  for (const x of [1, W - 2]) v.set(x, 20, 1, OAK_L);
  return out(v, STD, null, { seat: { y: 0.45 } });
}

// ------------------------------------------------------------------ rugs (0.025 m, flat)
// braided rag rug, oval or rectangular
export function braidedRug({ w = 2.4, d = 1.7, oval = true, palette = [RUST, MUSTARD, SAGE, CREAM, WOOD_L, NAVY, RED], seed = 1 } = {}) {
  const W = Math.round(w / FINE), D = Math.round(d / FINE);
  const v = new Vox(W, 1, D);
  const rx = W / 2, rz = D / 2;
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const dx = (x + 0.5 - rx) / rx, dz = (z + 0.5 - rz) / rz;
    const e = oval ? Math.sqrt(dx * dx + dz * dz) : Math.max(Math.abs(dx), Math.abs(dz));
    if (e > 1) continue;
    const dist = oval ? (1 - e) * Math.min(rx, rz) : Math.min(rx - Math.abs(x + 0.5 - rx), rz - Math.abs(z + 0.5 - rz));
    const ring = Math.floor(dist / 2.2);
    const ang = Math.atan2(dz, dx);
    const twist = Math.floor(ang * 12 + ring * 1.7 + (oval ? 0 : (x + z) * 0.5)) % 2;
    let c = ring === 0 ? WOOD_D : palette[Math.floor(vhash(ring, 0, 0, seed) * palette.length)];
    c = tone(c, twist ? 0.08 : -0.1);
    v.set(x, 0, z, c);
  }
  return out(v, FINE);
}

// ------------------------------------------------------------------ tables, lamps, shelves
export function sideTable({ seed = 5 } = {}) {
  const v = new Vox(11, 12, 11);
  const wd = grain(CHERRY, 'y', 0.05, seed);
  rbox(v, 0, 11, 0, 10, 11, 10, 1, grain(CHERRY_L, 'x', 0.05, seed));
  for (const [x, z] of [[1, 1], [9, 1], [1, 9], [9, 9]]) v.fill(x, 0, z, x, 10, z, wd);
  v.fill(1, 3, 1, 9, 3, 9, CHERRY);
  v.fill(2, 4, 2, 8, 4, 7, NAVY);
  v.fill(2, 5, 3, 7, 5, 8, tone(RED, -0.1));
  v.fill(3, 6, 2, 7, 6, 7, tone(GREEN, 0.1));
  return out(v, STD, null, { top: 0.6 });
}

export function tableLamp() {
  const v = new Vox(10, 12, 10);
  cylY(v, 4.5, 4.5, (y) => (y < 4 ? 2.4 - Math.abs(y - 2) * 0.4 : 0.8), 0, 5, (x, y) => (y === 2 ? CREAM : 0x4a6a9a));
  cylY(v, 4.5, 4.5, (y) => 4.4 - (y - 6) * 0.25, 6, 11, (x, y, z, d) => (y === 6 || y === 11 ? 0xc89a5a : d > 0.8 ? GLOWSHADE : 0));
  v.set(4, 6, 4, 0xfff0c0 | EMIT);
  return out(v, STD, null, { light: { x: 0, y: 0.42, z: 0 } });
}

export function floorLamp() {
  const v = new Vox(11, 35, 11);
  cylY(v, 5, 5, (y) => (y < 2 ? 3 : 0.6), 0, 25, (x, y) => (y < 2 ? BRASS_D : BRASS));
  cylY(v, 5, 5, (y) => 5 - (y - 25) * 0.3, 25, 33, (x, y, z, d) => (y === 25 ? (x + z) % 2 ? 0xb8742a : 0 : y === 33 || y === 26 ? 0x8a3a2a : d > 0.8 ? 0xf0c080 | EMIT : 0));
  return out(v, STD, null, { light: { x: 0, y: 1.5, z: 0 } });
}

// tall bookshelf packed with books and keepsakes (back-centre origin)
export function bookshelf({ seed = 6 } = {}) {
  const W = 28, D = 8, H = 43;
  const v = new Vox(W, H, D);
  const wd = grain(WOOD, 'y', 0.06, seed);
  v.fill(0, 0, 0, 0, H - 1, D - 1, wd);
  v.fill(W - 1, 0, 0, W - 1, H - 1, D - 1, wd);
  v.fill(0, 0, 0, W - 1, H - 1, 0, tone(WOOD_D, -0.05));
  const shelves = [0, 10, 21, 32, H - 2];
  for (const y of shelves) v.fill(0, y, 0, W - 1, y + 1, D - 1, grain(WOOD_L, 'x', 0.06, seed));
  v.fill(-1 + 1, H - 1, 0, W - 1, H - 1, D - 1, WOOD_D);
  const spines = [RED_D, GREEN_D, NAVY, 0x6a4a2a, MUSTARD, TEAL, PLUM, 0x8a7a5a, RUST];
  let s = seed * 31;
  const rnd = () => vhash(s++, 3, 7, seed);
  for (let si = 0; si < shelves.length - 1; si++) {
    const y0 = shelves[si] + 2, room = shelves[si + 1] - y0;
    let x = 1;
    while (x < W - 2) {
      const r = rnd();
      if (r < 0.08 && x < W - 6) {
        // a keepsake: a jar of buttons, a little frame or a fern
        const kind = Math.floor(rnd() * 3);
        if (kind === 0) { cylY(v, x + 1.5, 4, 1.3, y0, y0 + 3, (xx, yy) => (yy === y0 + 3 ? BRASS : (xx + yy) % 2 ? 0xd8e4e8 : 0xc87a8a)); }
        else if (kind === 1) { v.fill(x, y0, 3, x + 3, y0 + 4, 3, BRASS_D); v.fill(x + 1, y0 + 1, 3, x + 2, y0 + 3, 3, 0xc8b490); }
        else { cylY(v, x + 1.5, 4, 1.4, y0, y0 + 1, TERRA); v.ellipsoid(x + 1.5, y0 + 3, 4, 2, 1.6, 2, (xx, yy, zz) => (vhash(xx, yy, zz) < 0.5 ? LEAF : LEAF_D)); }
        x += 5;
        continue;
      }
      if (r < 0.16 && x < W - 7) {
        // a stack lying flat
        const n = 2 + Math.floor(rnd() * 3);
        for (let k = 0; k < n; k++) v.fill(x, y0 + k, 1, x + 5, y0 + k, 6, spines[Math.floor(rnd() * spines.length)]);
        x += 7;
        continue;
      }
      const bw = 1 + (rnd() < 0.4 ? 1 : 0), bh = Math.min(room - 1, 5 + Math.floor(rnd() * 4));
      const c = spines[Math.floor(rnd() * spines.length)];
      v.fill(x, y0, 1, x + bw - 1, y0 + bh - 1, 6, (xx, yy) => (yy === y0 + bh - 2 || yy === y0 + 1 ? BRASS_L : tone(c, (vhash(xx, yy, 0, seed) - 0.5) * 0.1)));
      x += bw;
      if (rnd() < 0.12) x += 1;
    }
  }
  return out(v, STD, [W / 2, 0, 0]);
}

// a sideboard with a lace runner, a crock of dried wheat and standing photos (back-centre origin)
export function sideboard({ seed = 7 } = {}) {
  const W = 30, D = 10, H = 24;
  const v = new Vox(W, H, D);
  const wd = grain(CHERRY, 'x', 0.05, seed);
  v.fill(0, 2, 0, W - 1, 15, D - 2, wd);
  for (const [x, z] of [[1, 1], [W - 2, 1], [1, D - 3], [W - 2, D - 3]]) v.fill(x, 0, z, x, 1, z, CHERRY);
  v.fill(0, 16, 0, W - 1, 16, D - 1, grain(CHERRY_L, 'x', 0.05, seed));
  // drawers and doors
  for (const [a, b] of [[1, 9], [10, 19], [20, 28]]) {
    v.fill(a, 12, D - 1, b, 14, D - 1, tone(CHERRY_L, -0.05));
    v.set((a + b) >> 1, 13, D - 1, BRASS);
  }
  for (const [a, b] of [[1, 14], [15, 28]]) {
    v.fill(a, 3, D - 1, b, 10, D - 1, tone(CHERRY, 0.06));
    v.fill(a + 1, 4, D - 1, b - 1, 9, D - 1, tone(CHERRY, -0.06));
    v.set(a === 1 ? b - 1 : a + 1, 7, D, BRASS);
  }
  // lace runner
  for (let x = 4; x <= W - 5; x++) for (let z = 1; z <= D - 2; z++) if ((x + z) % 2 === 0 || z === 1 || z === D - 2) v.set(x, 17, z, WHITE);
  // crock with dried wheat
  cylY(v, 6, 5, 2, 17, 21, (x, y) => (y === 19 ? 0x4a6a9a : 0xd8c8a8));
  for (let k = 0; k < 7; k++) {
    const x = 5 + (k % 3), z = 4 + ((k * 2) % 3);
    v.fill(x, 21, z, x, 23 - (k % 2), z, STRAW_D);
    v.set(x, 23 - (k % 2) + 1 > H - 1 ? H - 1 : 23 - (k % 2) + 1, z, STRAW);
  }
  // two standing frames
  v.fill(13, 17, 5, 17, 22, 5, BRASS_D);
  v.fill(14, 18, 5, 16, 21, 5, 0xc8a878);
  v.fill(20, 17, 4, 23, 21, 4, WOOD_D);
  v.fill(21, 18, 4, 22, 20, 4, 0x9ab0c0);
  return out(v, STD, [W / 2, 0, 0]);
}

// framed pictures (0.025 m), painted as tiny pixel scenes; back-centre origin (hang on a wall)
export function photo({ kind = 'wedding', w = 0.4, h = 0.5, frame = 'gold' } = {}) {
  const W = Math.round(w / FINE), H = Math.round(h / FINE);
  const v = new Vox(W, H, 3);
  const fc = frame === 'gold' ? [BRASS, BRASS_D, BRASS_L] : [WOOD_D, WOOD_DD, WOOD];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const edge = x < 2 || y < 2 || x >= W - 2 || y >= H - 2;
    if (edge) {
      v.set(x, y, 0, fc[1]);
      v.set(x, y, 1, x === 0 || y === H - 1 ? fc[2] : x === W - 1 || y === 0 ? fc[1] : fc[0]);
      continue;
    }
    v.set(x, y, 0, picture(kind, (x - 2) / (W - 4), (y - 2) / (H - 4), x, y));
  }
  return out(v, FINE, [W / 2, 0, 0]);
}
function picture(kind, u, t, x, y) {
  const sep = (c) => mixc(c, 0xc8a070, 0.55);
  if (kind === 'wedding') {
    let c = sep(0xe8dcc0);
    if (t < 0.18) c = sep(0x8a7a5a);
    // groom (left) and bride (right)
    const g = Math.abs(u - 0.36), b = Math.abs(u - 0.64);
    if (t > 0.18 && t < 0.62 && g < 0.1) c = sep(0x2a2a30);
    if (t >= 0.62 && t < 0.78 && g < 0.06) c = sep(0xe8b896);
    if (t >= 0.76 && t < 0.82 && g < 0.07) c = sep(0x4a3020);
    if (t > 0.1 && t < 0.62 && b < 0.08 + (0.62 - t) * 0.3) c = sep(0xffffff);
    if (t >= 0.62 && t < 0.78 && b < 0.06) c = sep(0xe8b896);
    if (t >= 0.74 && t < 0.86 && b < 0.08 && !(t < 0.78 && b < 0.05)) c = sep(0xd8a050);
    if (t > 0.3 && t < 0.42 && Math.abs(u - 0.52) < 0.06) c = sep(0xd84a5a);
    return c;
  }
  if (kind === 'fishing') {
    let c = t > 0.55 ? 0x9ac8e8 : t > 0.35 ? 0x4a8a5a : 0x3a6a9a;
    if (t > 0.55 && t < 0.7 && (u * 7 + t * 3) % 1 < 0.5) c = 0x6a9a5a;
    const hx = Math.abs(u - 0.4);
    if (t > 0.15 && t < 0.55 && hx < 0.08) c = 0x8a3a2a;
    if (t >= 0.55 && t < 0.68 && hx < 0.06) c = 0xe8b896;
    if (t >= 0.66 && t < 0.74 && hx < 0.08) c = 0x3e5e3a;
    if (Math.abs(u - 0.62) < 0.1 && Math.abs(t - 0.4) < 0.05) c = 0xc0c8d0;
    if (Math.abs(u - 0.75 + t * 0.4) < 0.015 && t > 0.4) c = 0x3a2a1e;
    return c;
  }
  if (kind === 'bike') {
    let c = t > 0.3 ? 0xf0d8a8 : 0x8a9a6a;
    for (const wx of [0.3, 0.7]) {
      const d = Math.hypot(u - wx, (t - 0.3) * 0.8);
      if (d > 0.11 && d < 0.15) c = 0x2a2a2a;
    }
    if (Math.abs(t - 0.42) < 0.03 && u > 0.3 && u < 0.7) c = 0x7a2a22;
    if (Math.abs(u - 0.45 - (t - 0.3) * 0.3) < 0.03 && t > 0.3 && t < 0.55) c = 0x7a2a22;
    const hx = Math.abs(u - 0.5);
    if (t > 0.5 && t < 0.8 && hx < 0.07) c = 0x8a3a2a;
    if (t >= 0.8 && t < 0.92 && hx < 0.05) c = 0xe8b896;
    if (t >= 0.9 && hx < 0.07) c = 0xb8322a;
    return c;
  }
  if (kind === 'cove') {
    let c = t > 0.5 ? mixc(0xf8c890, 0x9ac0e0, (t - 0.5) * 2) : t > 0.3 ? 0x3a6a9a : 0xb89a6a;
    if (t > 0.3 && t < 0.5 && (x + y * 3) % 7 === 0) c = 0x6a9ac8;
    if (Math.abs(u - 0.72) < 0.04 && t > 0.3 && t < 0.78) c = (Math.floor(t * 12) % 2) ? 0xd8322a : 0xf6f2ea;
    if (Math.abs(u - 0.72) < 0.06 && t >= 0.78 && t < 0.84) c = 0xffe08a;
    if (u < 0.35 && t > 0.3 && t < 0.3 + (0.35 - u) * 1.2) c = 0x3e6a3a;
    if (Math.hypot(u - 0.25, t - 0.78) < 0.06) c = 0xfff0c0;
    return c;
  }
  // 'baby' and anything else: a soft portrait
  let c = sep(0xd8c8b0);
  const d = Math.hypot(u - 0.5, (t - 0.5) * 1.2);
  if (d < 0.25) c = sep(0xf0c8a8);
  if (t > 0.6 && d < 0.3 && d > 0.2) c = sep(0x6a4a3a);
  if (t < 0.25) c = sep(0x9ab0c8);
  return c;
}

// the dining table with a red gingham runner and a jar of maple leaves
export function diningTable({ seed = 8 } = {}) {
  const W = 28, D = 18, H = 20;
  const v = new Vox(W, H, D);
  v.fill(0, 13, 0, W - 1, 14, D - 1, grain(OAK, 'x', 0.07, seed));
  v.fill(2, 11, 2, W - 3, 12, D - 3, tone(OAK, -0.1));
  for (const [x, z] of [[2, 2], [W - 3, 2], [2, D - 3], [W - 3, D - 3]]) cylY(v, x, z, (y) => (y % 4 === 1 ? 1.4 : 0.9), 0, 12, grain(OAK, 'y', 0.06, seed));
  for (let x = 0; x < W; x++) for (let z = 5; z <= 12; z++) v.set(x, 15, z, ((x >> 1) + (z >> 1)) % 2 ? RED : (x + z) % 2 ? CREAM : RED_L);
  for (let z = 5; z <= 12; z++) for (const x of [0, W - 1]) v.set(x, 14, z, RED);
  cylY(v, 14, 9, 1.2, 16, 18, 0xd8e4e8);
  for (const [dx, dz, c] of [[0, 0, 0xd84a1e], [1, 1, 0xe8a030], [-1, 0, 0xb8322a]]) v.set(14 + dx, 19, 9 + dz, c);
  return out(v, STD, null, { top: 0.8 });
}

// cast-iron wood cookstove with nickel trim, warming shelf and stovepipe (back-centre origin)
export function cookstove({ pipe = 4.6, seed = 9 } = {}) {
  const W = 18, D = 13, H = Math.round(pipe / STD) + 1;
  const v = new Vox(W, H, D);
  for (const [x, z] of [[1, 2], [W - 2, 2], [1, D - 2], [W - 2, D - 2]]) v.fill(x, 0, z, x, 2, z, IRON);
  v.fill(0, 3, 1, W - 1, 15, D - 1, spk(IRON, 0.05, seed));
  v.fill(0, 16, 0, W - 1, 16, D - 1, IRON_L);
  v.fill(0, 15, D - 1, W - 1, 15, D - 1, NICKEL);
  v.fill(0, 3, D - 1, W - 1, 3, D - 1, NICKEL);
  for (const [cx, cz] of [[4, 5], [4, 9], [10, 5], [10, 9]]) for (let x = cx - 2; x <= cx + 2; x++) for (let z = cz - 2; z <= cz + 2; z++) {
    const d = Math.hypot(x - cx, z - cz);
    if (d < 2.3) v.set(x, 16, z, d > 1.5 ? NICKEL_D : IRON);
  }
  // firebox door (left) with a glowing slit, oven door (right) with a nickel bar
  v.fill(1, 6, D, 6, 13, D, IRON_L);
  v.fill(2, 9, D, 5, 9, D, FIRE[1]);
  v.fill(2, 8, D, 5, 8, D, FIRE[0]);
  v.set(6, 11, D, NICKEL);
  v.fill(8, 5, D, 16, 13, D, IRON_L);
  v.fill(9, 11, D, 15, 11, D, NICKEL);
  v.fill(11, 7, D, 13, 8, D, BRASS);
  // warming shelf on two posts
  for (const x of [1, W - 2]) v.fill(x, 17, 1, x, 23, 1, NICKEL_D);
  v.fill(0, 23, 0, W - 1, 25, 4, IRON_L);
  v.fill(0, 25, 4, W - 1, 25, 4, NICKEL);
  // stovepipe with a damper
  cylY(v, 13, 2, 1.6, 26, H - 1, (x, y) => (y === 34 ? IRON_L : y % 20 === 0 ? NICKEL_D : IRON));
  v.fill(15, 34, 2, 15, 34, 2, BRASS);
  return out(v, STD, [W / 2, 0, 0], { top: 0.85, fire: { x: -0.25, y: 0.45, z: 0.66 } });
}

// sage-green kitchen counter with a butcher-block top, an enamel sink and a hand pump (back-centre)
export function counter({ w = 2.6, sinkAt = 0.75, seed = 10 } = {}) {
  const W = Math.round(w / STD), D = 12, H = 26;
  const v = new Vox(W, H, D);
  v.fill(0, 0, 0, W - 1, 1, D - 2, WOOD_D);
  v.fill(0, 2, 0, W - 1, 15, D - 2, (x, y, z) => tone(SAGE, (vhash(x, y, z, seed) - 0.5) * 0.05));
  for (let a = 1; a < W - 4; a += 10) {
    const b = Math.min(W - 2, a + 8);
    v.fill(a, 3, D - 1, b, 14, D - 1, SAGE_D);
    v.fill(a + 1, 4, D - 1, b - 1, 13, D - 1, SAGE);
    v.set(a + 1, 11, D, BRASS);
  }
  v.fill(0, 16, 0, W - 1, 17, D - 1, (x, y, z) => tone(x % 4 === 0 ? OAK_L : OAK, (vhash(x, y, z, seed) - 0.5) * 0.06));
  // sink
  const sx = Math.round(W / 2 + sinkAt / STD);
  v.fill(sx - 5, 13, 2, sx + 5, 17, 9, WHITE);
  v.fill(sx - 4, 14, 3, sx + 4, 17, 8, 0);
  v.fill(sx - 4, 14, 3, sx + 4, 14, 8, 0xd8dee4);
  // hand pump
  v.fill(sx + 7, 18, 3, sx + 8, 24, 4, RED_D);
  v.fill(sx + 4, 23, 3, sx + 6, 23, 4, RED_D);
  v.fill(sx + 9, 24, 3, sx + 11, 25, 3, IRON);
  // bread board, a loaf and a mixing bowl
  v.fill(5, 18, 3, 12, 18, 8, OAK_L);
  rbox(v, 6, 19, 4, 11, 21, 7, 1, (x, y) => (y === 21 && x % 2 ? 0xe8b870 : 0xc88a40), 1);
  cylY(v, 17, 6, (y) => 2.2 + (y - 18) * 0.5, 18, 21, (x, y, z, d) => (y === 21 && d < 0.75 ? 0xf0e6d0 : 0x4a7aaa));
  // crock of wooden spoons
  cylY(v, W - 6, 4, 1.4, 18, 21, 0xd8c8a8);
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1]]) v.fill(W - 6 + dx, 22, 4 + dz, W - 6 + dx, 24 + dx, 4 + dz, OAK_L);
  return out(v, STD, [W / 2, 0, 0], { top: 0.9 });
}

// a wall shelf of cocoa tins and jars, with mugs on hooks underneath (back-centre origin)
export function wallShelf({ w = 1.3, seed = 11 } = {}) {
  const W = Math.round(w / STD), D = 6, H = 12;
  const v = new Vox(W, H, D);
  v.fill(0, 4, 0, W - 1, 4, D - 1, grain(WOOD_L, 'x', 0.06, seed));
  for (const x of [2, W - 3]) for (let k = 0; k < 3; k++) v.fill(x, 1 + k, 0, x, 3, 2 - k + 1, WOOD_D);
  const tins = [[RED, BRASS], [GREEN_D, BRASS_L], [NAVY, CREAM], [RED_D, CREAM]];
  let x = 2;
  for (let k = 0; k < 4; k++) {
    const [c, band] = tins[k];
    const hh = 4 + (k % 2) * 2;
    v.fill(x, 5, 1, x + 3, 4 + hh, 4, (xx, yy) => (yy === 4 + hh ? BRASS_D : yy === 6 || yy === 7 ? band : c));
    x += 5;
  }
  for (let k = 0; k < 2 && x < W - 4; k++) {
    v.fill(x, 5, 1, x + 2, 9, 4, (xx, yy, zz) => (yy === 9 ? WOOD : (xx + yy + zz) % 2 && k === 0 ? WHITE : k === 0 ? 0xe8e8f0 : 0xf0e0b0));
    x += 4;
  }
  // mugs on hooks
  for (let k = 0; k < 4; k++) {
    const mx2 = 3 + k * Math.floor((W - 6) / 4);
    v.set(mx2, 3, 2, IRON);
    v.fill(mx2 - 1, 0, 2, mx2 + 1, 2, 4, [RED, CREAM, 0x4a7aaa, MUSTARD][k]);
  }
  return out(v, STD, [W / 2, 0, 0]);
}

// small things for the stove top: an enamel kettle and a copper pot of cocoa (0.025 m)
export function kettle() {
  const v = new Vox(14, 14, 10);
  cylY(v, 6, 5, (y) => (y < 7 ? 3.6 + Math.min(y, 3) * 0.3 : 4.5 - (y - 7) * 0.7), 0, 10, (x, y, z) => (vhash(x, y, z) < 0.12 ? WHITE : 0x3a6aaa));
  v.fill(5, 11, 4, 7, 11, 6, IRON);
  for (let k = 0; k < 5; k++) v.set(10 + k * 0.8, 4 + k, 5, 0x3a6aaa);
  for (let k = -3; k <= 3; k++) v.set(6 + k, 13 - Math.abs(k) * 0.5, 5, IRON);
  return out(v, FINE, null, { steam: { x: 0.1, y: 0.24, z: 0 } });
}
export function cocoaPot() {
  const v = new Vox(16, 8, 10);
  cylY(v, 6, 5, 4.2, 0, 5, (x, y, z, d) => (y >= 4 && d < 0.8 ? 0x5a3018 : y === 0 ? 0x8a4a28 : 0xc87040));
  v.fill(10, 4, 4, 15, 4, 5, WOOD_D);
  return out(v, FINE, null, { steam: { x: -0.025, y: 0.14, z: 0 } });
}

// grandfather clock; the pendulum is a separate piece (back-centre origin)
export function grandfatherClock({ seed = 12 } = {}) {
  const W = 12, D = 8, H = 45;
  const v = new Vox(W, H, D);
  const wd = grain(CHERRY, 'y', 0.05, seed);
  v.fill(0, 0, 0, W - 1, 9, D - 1, wd);
  v.fill(0, 9, 0, W - 1, 9, D, CHERRY_L);
  v.fill(1, 10, 0, W - 2, 29, D - 2, wd);
  v.fill(3, 12, D - 1, W - 4, 27, D - 1, 0);
  v.fill(3, 12, D - 2, W - 4, 27, D - 2, 0x2a1a14);
  v.fill(2, 11, D - 1, 2, 28, D - 1, CHERRY_L);
  v.fill(W - 3, 11, D - 1, W - 3, 28, D - 1, CHERRY_L);
  v.fill(0, 30, 0, W - 1, 41, D - 1, wd);
  cylZ(v, 5.5, 35.5, 4, D, D, (x, y, z, d) => (d > 0.85 ? BRASS : CREAM));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    v.set(5.5 + Math.cos(a) * 3, 35.5 + Math.sin(a) * 3, D, 0x2a2a2a);
  }
  v.fill(5, 35, D + 1, 5, 38, D + 1, 0x1a1a1a);
  v.fill(5, 35, D + 1, 7, 35, D + 1, 0x1a1a1a);
  // bonnet with finials
  v.fill(0, 42, 0, W - 1, 42, D, CHERRY_L);
  for (let x = 1; x < W - 1; x++) v.set(x, 43 + (Math.abs(x - 5.5) < 2 ? 1 : 0), D - 2, CHERRY);
  for (const x of [0, W - 1]) v.set(x, 43, D - 1, BRASS);
  v.set(5, 44, D - 2, BRASS);
  return out(v, STD, [W / 2, 0, 0], { pendulum: { x: 0, y: 1.38, z: 0.33 } });
}
export function pendulum() {
  const v = new Vox(6, 26, 2);
  v.fill(2, 4, 0, 3, 25, 0, BRASS_D);
  cylZ(v, 2.5, 2.5, 2.4, 0, 1, (x, y, z, d) => (d > 0.7 ? BRASS_D : BRASS_L));
  return out(v, FINE, [3, 25, 1]);
}

// potted plants: a fern on a stand, a snake plant, a geranium for a sill
export function plant({ kind = 'fern', seed = 13 } = {}) {
  if (kind === 'geranium') {
    const v = new Vox(10, 10, 8);
    cylY(v, 5, 4, (y) => 2 + y * 0.25, 0, 3, (x, y) => (y === 3 ? TERRA_D : TERRA));
    v.ellipsoid(5, 6, 4, 3.5, 2.5, 3, (x, y, z) => (vhash(x, y, z, seed) < 0.3 ? RED_L : vhash(x, y, z, seed + 1) < 0.5 ? LEAF : LEAF_D));
    return out(v, STD);
  }
  if (kind === 'snake') {
    const v = new Vox(10, 24, 10);
    cylY(v, 5, 5, (y) => 3 + y * 0.12, 0, 6, (x, y) => (y === 6 ? TERRA_D : y % 3 === 0 ? 0xd8c8a8 : 0x5a7aa8));
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, r = 1.2 + (k % 2);
      const hh = 14 + Math.floor(vhash(k, 0, 0, seed) * 8);
      for (let y = 7; y < 7 + hh; y++) v.set(5 + Math.cos(a) * r * (1 + (y - 7) * 0.02), y, 5 + Math.sin(a) * r * (1 + (y - 7) * 0.02), y % 3 === 0 ? 0xc8c86a : (k + y) % 2 ? LEAF_D : 0x5a8a3a);
    }
    return out(v, STD);
  }
  const v = new Vox(20, 26, 20);
  // stand
  cylY(v, 10, 10, (y) => (y > 12 ? 3.5 : 1), 0, 13, (x, y) => (y > 12 ? OAK_L : OAK));
  v.fill(7, 0, 9, 13, 0, 11, OAK);
  v.fill(9, 0, 7, 11, 0, 13, OAK);
  cylY(v, 10, 10, (y) => 3 + (y - 14) * 0.3, 14, 18, (x, y) => (y === 18 ? TERRA_D : TERRA));
  // fronds arcing out and down
  for (let k = 0; k < 11; k++) {
    const a = (k / 11) * Math.PI * 2 + vhash(k, 1, 0, seed);
    const len = 7 + vhash(k, 2, 0, seed) * 3;
    for (let s = 0; s <= len; s += 0.5) {
      const r = s, y = 19 + s * 0.9 - (s * s) / 7;
      const x = 10 + Math.cos(a) * r, z = 10 + Math.sin(a) * r;
      const c = s > len - 2 ? LEAF_L : (s | 0) % 2 ? LEAF : LEAF_D;
      v.set(x, y, z, c);
      if (s > 1.5 && s < len - 1) {
        v.set(x - Math.sin(a), y, z + Math.cos(a), LEAF);
        v.set(x + Math.sin(a), y, z - Math.cos(a), LEAF_D);
      }
    }
  }
  return out(v, STD);
}

// a cedar blanket chest with folded quilts on top (back-centre origin)
export function blanketChest({ seed = 14 } = {}) {
  const W = 20, D = 10, H = 15;
  const v = new Vox(W, H, D);
  v.fill(0, 0, 0, W - 1, 8, D - 1, grain(0xa0583a, 'x', 0.08, seed));
  v.fill(0, 9, 0, W - 1, 9, D - 1, tone(0xa0583a, 0.08));
  for (const x of [2, W - 3]) v.fill(x, 0, D - 1, x, 9, D - 1, IRON);
  v.fill(9, 6, D, 10, 7, D, BRASS);
  const q = quiltFn(seed, 3);
  for (let k = 0; k < 3; k++) for (let x = 2 + k; x <= W - 3 - k; x++) for (let z = 1; z <= D - 2; z++) v.set(x, 10 + k * 1.5, z, q(x + k * 9, z + k * 5));
  for (let x = 3; x <= W - 4; x++) for (let z = 1; z <= D - 2; z++) v.set(x, 11, z, q(x + 30, z));
  return out(v, STD, [W / 2, 0, 0]);
}

// a ladder quilt rack with two quilts draped over (back-centre origin)
export function quiltRack({ seed = 15 } = {}) {
  const W = 18, D = 8, H = 27;
  const v = new Vox(W, H, D);
  for (const x of [0, W - 1]) for (let y = 0; y < H; y++) v.set(x, y, Math.round(1 + (y / H) * 4), OAK);
  for (const y of [9, 17, 25]) v.fill(0, y, Math.round(1 + (y / H) * 4), W - 1, y, Math.round(1 + (y / H) * 4), OAK_L);
  const q1 = quiltFn(seed, 3), q2 = quiltFn(seed + 3, 3);
  for (let x = 2; x <= W - 3; x++) {
    for (let y = 8; y <= 25; y++) v.set(x, y, Math.round(2 + (y / H) * 4) + (y < 17 ? 1 : 0), q1(x, y));
    for (let y = 3; y <= 16; y++) v.set(x, y, Math.round(1 + (16 / H) * 4) + 2, q2(x, y));
  }
  return out(v, STD, [W / 2, 0, 0]);
}

// pegs by the door with a felt hat, a plaid scarf and a lantern (back-centre origin)
export function coatPegs() {
  const W = 16, D = 6, H = 14;
  const v = new Vox(W, H, D);
  v.fill(0, 9, 0, W - 1, 11, 0, grain(WOOD, 'x', 0.06, 2));
  for (const x of [2, 7, 12]) v.fill(x, 10, 1, x, 10, 2, WOOD_D);
  // hat
  cylY(v, 2, 3, (y) => (y === 6 ? 2.6 : 1.6), 6, 9, (x, y) => (y === 7 ? 0x2a1a14 : 0x5a4a3a));
  // scarf hanging in a loop
  for (let y = 0; y <= 9; y++) for (const dx of [0, 1]) v.set(6 + dx + (y < 3 ? 1 : 0), y, 2, (y + dx) % 3 === 0 ? CREAM : y % 2 ? RED : RED_D);
  for (let y = 2; y <= 9; y++) v.set(9, y, 2, y % 2 ? RED : RED_D);
  // lantern
  v.fill(11, 2, 2, 13, 7, 4, (x, y) => (y === 2 || y === 7 ? IRON : x === 12 ? 0xffd27a | EMIT : 0xf8e8b8));
  v.set(12, 8, 3, IRON);
  v.set(12, 9, 2, IRON);
  return out(v, STD, [W / 2, 0, 0]);
}

// a bench by the door with a pair of boots beside it (back-centre origin)
export function bootBench() {
  const W = 16, D = 8, H = 10;
  const v = new Vox(W, H, D);
  v.fill(0, 8, 0, W - 1, 9, D - 1, grain(OAK, 'x', 0.06, 1));
  for (const x of [1, W - 2]) v.fill(x, 0, 1, x, 7, D - 2, OAK);
  v.fill(2, 3, 1, W - 3, 3, D - 2, tone(OAK, -0.1));
  // boots under the bench
  for (const bx of [4, 8]) {
    v.fill(bx, 4, 2, bx + 2, 7, 4, 0x5a3a24);
    v.fill(bx, 4, 5, bx + 2, 5, 6, 0x5a3a24);
    v.fill(bx, 7, 2, bx + 2, 7, 4, RED);
  }
  return out(v, STD, [W / 2, 0, 0]);
}

// crossed snowshoes for the wall above the door (back-centre origin)
export function snowshoes() {
  const W = 26, H = 16;
  const v = new Vox(W, H, 3);
  for (const s of [-1, 1]) {
    for (let k = -12; k <= 12; k += 0.25) {
      const along = k / 12;
      const half = 3.2 * Math.sqrt(Math.max(0, 1 - Math.pow((along + 0.15) / 1.05, 2))) + (along > 0.6 ? 0.4 : 0);
      for (let w = -half; w <= half; w += 0.5) {
        const lx = k, ly = w;
        const ang = s * 0.55;
        const x = 13 + lx * Math.cos(ang) - ly * Math.sin(ang);
        const y = 8 + lx * Math.sin(ang) + ly * Math.cos(ang);
        const rim = Math.abs(Math.abs(w) - half) < 0.6 || Math.abs(k) > 11.4;
        if (rim) v.set(x, y, s > 0 ? 1 : 2, OAK_L);
        else if ((Math.round(k) + Math.round(w)) % 2 === 0) v.set(x, y, s > 0 ? 0 : 1, 0xc8a878);
      }
    }
  }
  return out(v, STD, [W / 2, 0, 0]);
}

// firewood box and a fire-tool stand (bottom-centre)
export function woodBox({ seed = 16 } = {}) {
  const W = 13, D = 10, H = 16;
  const v = new Vox(W, H, D);
  v.fill(0, 0, 0, W - 1, 6, D - 1, grain(WOOD_D, 'x', 0.06, seed));
  v.fill(1, 1, 1, W - 2, 6, D - 2, 0);
  for (let k = 0; k < 7; k++) {
    const y = 2 + (k % 3) * 2 + (k > 4 ? 2 : 0), z = 2 + ((k * 3) % 6);
    cylX(v, y, z, 1.3, 1, W - 2, (x, yy, zz, d) => (x === 1 || x === W - 2 ? (d < 0.5 ? 0xd2aa78 : 0xbe9464) : d > 0.7 ? 0x5a4030 : 0x7a5a3a));
  }
  return out(v, STD);
}
export function fireTools() {
  const v = new Vox(6, 20, 6);
  v.fill(1, 0, 1, 4, 0, 4, IRON);
  v.fill(2, 1, 2, 3, 17, 3, IRON);
  v.fill(1, 17, 2, 4, 17, 3, IRON);
  for (const x of [1, 4]) v.fill(x, 9, 2, x, 16, 2, IRON_L);
  v.fill(1, 6, 2, 1, 9, 3, 0x6a4a2a);
  v.set(4, 8, 3, BRASS);
  v.fill(2, 18, 2, 3, 19, 3, BRASS);
  return out(v, STD);
}

// knitting basket with yarn balls, needles and a scarf in progress
export function knittingBasket() {
  const v = new Vox(9, 9, 9);
  cylY(v, 4, 4, (y) => 3.4 + y * 0.12, 0, 4, (x, y, z) => ((x + z + y) % 2 ? STRAW : STRAW_D));
  cylY(v, 4, 4, 3, 1, 4, 0);
  for (const [x, z, c] of [[3, 3, RED], [5.5, 4, 0x4a7aaa], [3.5, 5.5, MUSTARD]]) v.ellipsoid(x, 4.5, z, 1.6, 1.4, 1.6, (xx, yy, zz) => tone(c, (xx + yy + zz) % 2 ? 0.08 : -0.08));
  v.fill(6, 4, 3, 7, 8, 3, OAK_L);
  v.fill(6, 4, 5, 8, 8, 5, OAK_L);
  for (let y = 1; y <= 4; y++) v.set(8, y, 4, y % 2 ? RED : CREAM);
  return out(v, STD);
}

// the inside of the front door: vertical planks, a Z brace, strap hinges and a latch.
// Origin at the hinge (x = 0), bottom, middle of the thickness.
export function doorLeaf({ w = 1.0, h = 2.1 } = {}) {
  const W = Math.round(w / STD), H = Math.round(h / STD);
  const v = new Vox(W, H, 3);
  for (let x = 0; x < W; x++) {
    const p = Math.floor(x / 4);
    for (let y = 0; y < H; y++) v.set(x, y, 1, x % 4 === 3 ? tone(0x7a4e2c, -0.18) : tone(0x7a4e2c, (vhash(p, y >> 3, 0, 4) - 0.5) * 0.14));
  }
  // Z brace on the room side (-z)
  for (const y of [5, H - 7]) v.fill(1, y, 0, W - 2, y + 2, 0, tone(0x6a4224, 0.04));
  for (let k = 0; k <= H - 15; k++) {
    const x = Math.round(2 + (k / (H - 15)) * (W - 5)), y = 8 + k;
    v.fill(x, y, 0, x + 1, y, 0, tone(0x6a4224, 0.04));
  }
  for (const y of [6, H - 6]) v.fill(0, y, 0, 7, y, 0, IRON);
  v.fill(W - 3, 19, 0, W - 2, 22, 0, IRON);
  v.set(W - 4, 21, 0, BRASS);
  return out(v, STD, [0, 0, 1.5]);
}

// window dressing for an opening of w x h metres: casing, mullions, sill and tied-back curtains.
// Origin: bottom-centre of the opening on the wall's inner face (z < 0 is inside the wall).
export function windowDressing({ w = 0.9, h = 1.1, curtains = true, sillPlant = false, seed = 17 } = {}) {
  const OW = Math.round(w / STD), OH = Math.round(h / STD);
  const side = curtains ? 6 : 2;
  const W = OW + side * 2, H = OH + 6, D = 8;
  const v = new Vox(W, H, D);
  const ox = side, oy = 2, oz = 4;
  const trim = (x, y, z) => tone(CREAM, (vhash(x, y, z, seed) - 0.5) * 0.06);
  // casing
  v.fill(ox - 2, oy - 1, oz, ox - 1, oy + OH + 1, oz, trim);
  v.fill(ox + OW, oy - 1, oz, ox + OW + 1, oy + OH + 1, oz, trim);
  v.fill(ox - 2, oy + OH, oz, ox + OW + 1, oy + OH + 1, oz, trim);
  // sill and apron
  v.fill(ox - 3, oy - 1, oz, ox + OW + 2, oy - 1, oz + 3, tone(CREAM, -0.04));
  v.fill(ox - 1, oy - 2, oz, ox + OW, oy - 2, oz, trim);
  // mullions in the opening
  const mc = tone(CREAM, -0.08);
  v.fill(ox + (OW >> 1), oy, oz - 3, ox + (OW >> 1), oy + OH - 1, oz - 3, mc);
  v.fill(ox, oy + Math.round(OH * 0.55), oz - 3, ox + OW - 1, oy + Math.round(OH * 0.55), oz - 3, mc);
  v.fill(ox, oy, oz - 3, ox + OW - 1, oy, oz - 2, mc);
  if (curtains) {
    // rod, valance and two gingham panels tied back
    v.fill(0, oy + OH + 3, oz + 2, W - 1, oy + OH + 3, oz + 2, BRASS_D);
    const gin = (x, y) => ((x >> 1) + (y >> 1)) % 2 ? RED : (x + y) % 2 ? CREAM : RED_L;
    for (let x = ox - 2; x <= ox + OW + 1; x++) for (let y = oy + OH; y <= oy + OH + 3; y++) if (y > oy + OH + (x % 3 === 0 ? 0 : 0) || x % 2) v.set(x, y, oz + 1, gin(x, y));
    for (const s of [-1, 1]) {
      for (let y = oy - 2; y <= oy + OH + 2; y++) {
        const t = (y - (oy + OH * 0.45)) / OH;
        const wid = Math.round(2 + Math.abs(t) * 6);
        for (let k = 0; k < wid; k++) {
          const x = s < 0 ? ox - 4 + k : ox + OW + 3 - k;
          v.set(x, y, oz + 1 + ((x + y) % 3 === 0 ? 1 : 0), gin(x, y));
        }
        if (Math.abs(y - Math.round(oy + OH * 0.45)) === 0) for (let k = 0; k < wid + 1; k++) v.set(s < 0 ? ox - 4 + k : ox + OW + 3 - k, y, oz + 2, BRASS);
      }
    }
  }
  if (sillPlant) {
    const px = ox + 4;
    for (let y = oy; y <= oy + 2; y++) for (let x = px - 1; x <= px + 1; x++) for (let z = oz + 1; z <= oz + 3; z++) v.set(x, y, z, TERRA);
    v.ellipsoid(px, oy + 4, oz + 2, 2.2, 1.8, 1.6, (x, y, z) => (vhash(x, y, z, 3) < 0.35 ? RED_L : LEAF));
  }
  return out(v, STD, [ox + OW / 2, oy, oz]);
}

// Harold's patchwork quilt draped over someone sitting: profile in metres (forward, up) from the
// sitter's feet position. Origin: the sitter's position on the floor.
export function lapQuilt({ seed = 21, width = 1.05 } = {}) {
  const prof = [[0.08, 0.98], [0.14, 0.66], [0.46, 0.64], [0.56, 0.56], [0.6, 0.12]];
  const W = Math.round(width / STD), H = 22, D = 16;
  const v = new Vox(W, H, D);
  const q = quiltFn(seed, 4);
  // walk the profile in small steps; the sides drape lower than the middle
  let s = 0;
  for (let p = 0; p < prof.length - 1; p++) {
    const [f0, y0] = prof[p], [f1, y1] = prof[p + 1];
    const len = Math.hypot(f1 - f0, y1 - y0);
    const n = Math.ceil(len / (STD * 0.5));
    for (let k = 0; k < n; k++, s += 0.5) {
      const t = k / n;
      const f = f0 + (f1 - f0) * t, y = y0 + (y1 - y0) * t;
      for (let i = 0; i < W; i++) {
        const xm = (i + 0.5 - W / 2) * STD;
        const sag = Math.max(0, Math.abs(xm) - 0.22) * (y > 0.5 ? 0.9 : 0.15);
        const zz = Math.round(f / STD), yy = Math.round((y - sag) / STD);
        const c = q(i, Math.round(s));
        v.set(i, yy, zz, c);
        if (y > 0.5) v.set(i, yy - 1, zz, tone(c, -0.15));
      }
    }
  }
  // a binding along the lower edge
  for (let i = 0; i < W; i++) for (let y = 0; y < 4; y++) if (v.get(i, y, Math.round(0.6 / STD))) v.set(i, y, Math.round(0.6 / STD), y === 2 ? RED_D : v.get(i, y, Math.round(0.6 / STD)));
  return out(v, STD, [W / 2, 0, 0]);
}
// the same quilt folded in Nana's arms
export function foldedQuilt({ seed = 21 } = {}) {
  const v = new Vox(10, 5, 7);
  const q = quiltFn(seed, 3);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 10; x++) for (let z = 0; z < 7; z++) v.set(x, y, z, z === 6 && y % 2 ? tone(q(x, y), -0.2) : q(x + y * 5, z + y * 3));
  return out(v, STD, [5, 2.5, 3.5]);
}
