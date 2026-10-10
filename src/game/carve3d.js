// The 3D pumpkin of the carving mini-game, with no DOM and no three.js (so node can check
// it): a real voxel volume, 36 x 38 x 36 voxels of 1.8 cm, built the same every time. A
// thick shell (orange skin with ribs, pale flesh under it, paler flesh inside), hollow,
// with a stem on top, a ring drawn round the stem in marker (where the lid gets cut) and a
// heap of guts and seeds on the floor of the hollow.
//
// Seen from the front (+z) one voxel is one cell of the judges' 32 x 32 face grid
// (src/game/carveScore.js): mask column c is voxel x = c + P0, mask row r is y = TOP - r,
// and the pumpkin's outline from the front is exactly carveScore's BODY. It is as wide as
// it is deep, so every side looks the same from straight on.
//
// Carving: raycast() finds the voxel under the pointer (a DDA walk through the grid),
// cut() takes a capsule of voxels from there straight in along the pumpkin's inward
// normal, right through the wall (a thin one for the knife, a fat one for the gouge),
// scoop() takes guts and seeds only. Every removal goes into an undo record. looseParts()
// finds whatever no longer hangs on (a bit ringed by a cut, the lid once it's cut round),
// takeLid()/putLid() lift the lid off and set it back.
//
// Judging: insideAir() floods the hollow and every cut through to it; projectMask() looks
// straight at one side and marks the face cells whose wall is cut right through (the
// surface voxel gone and open to the inside), the same 32 x 32 mask the judges always
// scored; judge() scores all four sides and keeps the best one.
//
// Saving: encodeCarve() is a run-length list of every voxel removed from the fresh
// pumpkin (varints, base64; a carving is usually a kilobyte or two), decodeCarve() gets
// the exact pumpkin back, displayVox() turns it into the glowing jack-o'-lantern that
// stands on Hank's table.
import { N, CX, CY, RX, RY, BODY, CARVABLE } from './carveScore.js';
import * as CS from './carveScore.js';
import { Vox, EMIT, tone } from '../voxel/vox.js';

export const VER = 1; // (the fresh pumpkin's layout: saves name it, so it can change later)
export const P0 = 2; // front: mask column c -> voxel x = c + P0
export const TOP = Math.ceil(CY + RY) - 1; // mask row r -> voxel y = TOP - r
export const W = N + P0 * 2, D = W, H = TOP + 8; // 36 x 38 x 36
export const X0 = CX + P0, Y0 = TOP + 1 - CY, Z0 = D / 2; // the centre (voxel-edge units)
export { RX, RY };
export const RZ = RX; // round in plan
export const WALL = 3.2; // how thick the wall is
export const SIZE = 0.018; // metres a voxel
export const N3 = W * H * D;
export const LID_R = 6.2; // the marker ring round the stem
export const DEPTH = 5.4; // how far a cut goes in (through the wall, not on into the far one)
export const idx = (x, y, z) => x + W * (y + H * z);
export const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;

// what each voxel is (low bits) and whether it belongs to the lid (once that's cut free)
export const K = { NONE: 0, SKIN: 1, FLESH: 2, STEM: 3, GOO: 4, SEED: 5 };
export const LID = 0x80;
export const KIND = 0x7f;
const table = (f) => { const t = new Uint8Array(256); for (let k = 1; k < 256; k++) t[k] = f(k & KIND) ? 1 : 0; return t; };
export const STRUCT = table((k) => k === K.SKIN || k === K.FLESH || k === K.STEM); // holds the pumpkin up
export const CUTS = table((k) => k === K.SKIN || k === K.FLESH || k === K.GOO || k === K.SEED); // a knife goes through
export const GUTS = table((k) => k === K.GOO || k === K.SEED); // the scoop takes

// ---------------------------------------------------------------- colours
export const COL = {
  base: 0xe8781e, base2: 0xdc6c1a, groove: 0xb4501a, light: 0xf6993a, deep: 0x8a3a12,
  flesh: 0xf2a646, fleshIn: 0xf8c878, marker: 0x3a2418,
  stem: [0x7a6a34, 0x6a5a2a, 0x5f8a30],
  goo: [0xe8862a, 0xd8701e, 0xf0a040, 0xf6b860], seed: [0xf6ecd0, 0xe8dcb8],
  glow: 0xffb43c, glow2: 0xffd070, glowSkin: 0xe8862a, candle: 0xf6ecd0, flame: 0xfff4c0, flame2: 0xffd060,
};
const RIBS = 10, PH = 7 * 0.37;
const hash = (x, y, z, s = 0) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 1274126177) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

// the outer skin (ribbed): q <= 1 inside
function shape(x, y, z) {
  const dx = (x + 0.5 - X0) / RX, dy = (y + 0.5 - Y0) / RY, dz = (z + 0.5 - Z0) / RZ;
  const th = Math.atan2(dz, dx);
  const rib = Math.abs(Math.cos((th * RIBS) / 2 + PH));
  const s = 1 - 0.05 * (1 - Math.sqrt(rib));
  return { q: (dx * dx + dz * dz) / (s * s) + dy * dy, rib, dy, k: Math.floor(((th + Math.PI) / (2 * Math.PI)) * RIBS) };
}
export function inCavity(x, y, z) {
  const a = (x + 0.5 - X0) / (RX - WALL), b = (y + 0.5 - Y0) / (RY - WALL), c = (z + 0.5 - Z0) / (RZ - WALL);
  return a * a + b * b + c * c <= 1;
}
// the floor of the hollow at a distance r from the middle (voxel-edge y)
const floorAt = (r) => Y0 - (RY - WALL) * Math.sqrt(Math.max(0, 1 - (r / (RX - WALL)) ** 2));

// ---------------------------------------------------------------- the fresh pumpkin (built once)
// SHAPE: 1 inside the outer skin (the wall and the hollow), CAV: the hollow,
// ORIG: 1 where the wall was (skin and flesh), 2 the stem
let BASE = null;
function base() {
  if (BASE) return BASE;
  const col = new Uint32Array(N3), kind = new Uint8Array(N3);
  const SHAPE = new Uint8Array(N3), CAV = new Uint8Array(N3), ORIG = new Uint8Array(N3);
  const info = [];
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y, z);
    const S = shape(x, y, z);
    if (S.q > 1) continue;
    SHAPE[i] = 1;
    if (inCavity(x, y, z)) { CAV[i] = 1; continue; }
    kind[i] = K.FLESH;
    info[i] = S;
  }
  const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const shp = (x, y, z) => inb(x, y, z) && SHAPE[idx(x, y, z)];
  const cav = (x, y, z) => inb(x, y, z) && CAV[idx(x, y, z)];
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y, z);
    if (!kind[i]) continue;
    ORIG[i] = 1;
    const S = info[i];
    if (NB.some(([a, b, c]) => !shp(x + a, y + b, z + c))) {
      kind[i] = K.SKIN;
      let c = S.rib < 0.22 ? COL.groove : S.k % 2 ? COL.base : COL.base2;
      if (S.dy > 0.55 && S.rib >= 0.22) c = COL.light;
      if (S.dy < -0.55) c = S.rib < 0.22 ? COL.deep : tone(c, -0.12);
      col[i] = c;
    } else col[i] = NB.some(([a, b, c]) => cav(x + a, y + b, z + c)) ? COL.fleshIn : COL.flesh;
  }
  // the lid's marker ring on top: the topmost skin voxel of each column on the ring
  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const r = Math.hypot(x + 0.5 - X0, z + 0.5 - Z0);
    if (Math.abs(r - LID_R) > 0.5) continue;
    for (let y = H - 1; y >= 0; y--) {
      const i = idx(x, y, z);
      if (!kind[i]) continue;
      if (kind[i] === K.SKIN && y > Y0 + RY * 0.6) col[i] = COL.marker;
      break;
    }
  }
  // the stem, leaning a little (its foot set into the top)
  const sx = Math.floor(X0) - 1, sz = Math.floor(Z0) - 1;
  let sy = H - 1;
  while (sy > 0 && !kind[idx(sx, sy, sz)]) sy--;
  for (let k = 0; k < 6; k++) {
    const o = k > 3 ? 1 : 0;
    for (let z = sz; z <= sz + 1; z++) for (let x = sx + o; x <= sx + 1 + o; x++) {
      const i = idx(x, sy + k, z);
      kind[i] = K.STEM;
      col[i] = k > 4 ? COL.stem[2] : COL.stem[k % 2];
      ORIG[i] = 2;
    }
  }
  // the guts: a heap on the floor of the hollow, right under the lid, seeds all through it
  let guts = 0;
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y, z);
    if (!CAV[i]) continue;
    const r = Math.hypot(x + 0.5 - X0, z + 0.5 - Z0);
    if (r > 8.5) continue;
    const hh = 5.4 - r * 0.45 + (hash(x, 0, z, 3) - 0.5) * 1.6;
    if (y + 0.5 - floorAt(r) > hh) continue;
    const h = hash(x, y, z, 5);
    if (h < 0.11) { kind[i] = K.SEED; col[i] = COL.seed[h < 0.05 ? 1 : 0]; } else { kind[i] = K.GOO; col[i] = COL.goo[Math.floor(hash(x, y, z, 9) * 4)]; }
    guts++;
  }
  BASE = { col, kind, SHAPE, CAV, ORIG, guts, stem: [sx, sy, sz] };
  return BASE;
}
export const shapeOf = () => base();

// ---------------------------------------------------------------- the pumpkin being carved
export class Pumpkin {
  constructor(src = null) {
    const B = base();
    this.col = (src || B).col.slice();
    this.kind = (src || B).kind.slice();
    this.onChange = null; // (x, y, z) after a voxel changes (the remesher marks chunks dirty)
  }
  clone() {
    return new Pumpkin(this);
  }
  at(x, y, z) {
    return inb(x, y, z) ? this.kind[idx(x, y, z)] : 0;
  }
  // set voxel i (rec: an undo record, [i, col, kind] triples)
  put(i, c, k, rec = null) {
    if (rec) rec.push(i, this.col[i], this.kind[i]);
    this.col[i] = c;
    this.kind[i] = k;
    if (this.onChange) { const x = i % W, r = (i - x) / W, y = r % H; this.onChange(x, y, (r - y) / H); }
  }
  remove(i, rec = null) {
    this.put(i, 0, 0, rec);
  }
  undo(rec) {
    for (let k = rec.length - 3; k >= 0; k -= 3) this.put(rec[k], rec[k + 1], rec[k + 2]);
  }
  count(t = STRUCT) {
    let n = 0;
    for (let i = 0; i < N3; i++) if (t[this.kind[i]]) n++;
    return n;
  }
  guts() {
    return this.count(GUTS);
  }
}
export const freshPumpkin = () => new Pumpkin();
export const gutsTotal = () => base().guts;

// ---------------------------------------------------------------- rays
// the first voxel along a ray (voxel units, d normalised): { x, y, z, i, t, n: [nx, ny, nz] }
export function raycast(p, ox, oy, oz, dx, dy, dz, maxT = 200) {
  let t0 = 0, t1 = maxT, ax = -1;
  const o = [ox, oy, oz], d = [dx, dy, dz], dim = [W, H, D];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < 0 || o[a] > dim[a]) return null; continue; }
    let ta = (0 - o[a]) / d[a], tb = (dim[a] - o[a]) / d[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) { t0 = ta; ax = a; }
    if (tb < t1) t1 = tb;
    if (t0 > t1) return null;
  }
  const px = ox + dx * (t0 + 1e-6), py = oy + dy * (t0 + 1e-6), pz = oz + dz * (t0 + 1e-6);
  let x = Math.min(W - 1, Math.max(0, Math.floor(px))), y = Math.min(H - 1, Math.max(0, Math.floor(py))), z = Math.min(D - 1, Math.max(0, Math.floor(pz)));
  const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
  const ddx = Math.abs(1 / (dx || 1e-12)), ddy = Math.abs(1 / (dy || 1e-12)), ddz = Math.abs(1 / (dz || 1e-12));
  let tx = Math.abs(dx) < 1e-9 ? Infinity : ((x + (sx > 0 ? 1 : 0)) - ox) / dx;
  let ty = Math.abs(dy) < 1e-9 ? Infinity : ((y + (sy > 0 ? 1 : 0)) - oy) / dy;
  let tz = Math.abs(dz) < 1e-9 ? Infinity : ((z + (sz > 0 ? 1 : 0)) - oz) / dz;
  let t = t0, nx = ax === 0 ? -sx : 0, ny = ax === 1 ? -sy : 0, nz = ax === 2 ? -sz : 0;
  const K8 = p.kind;
  while (t <= t1) {
    const i = idx(x, y, z);
    if (K8[i]) return { x, y, z, i, t, n: [nx, ny, nz], k: K8[i] };
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += ddx; nx = -sx; ny = nz = 0; if (x < 0 || x >= W) break; }
    else if (ty < tz) { y += sy; t = ty; ty += ddy; ny = -sy; nx = nz = 0; if (y < 0 || y >= H) break; }
    else { z += sz; t = tz; tz += ddz; nz = -sz; nx = ny = 0; if (z < 0 || z >= D) break; }
  }
  return null;
}
// where a ray first meets the (smooth) outer skin, or null
export function enterShell(ox, oy, oz, dx, dy, dz) {
  const ux = (ox - X0) / RX, uy = (oy - Y0) / RY, uz = (oz - Z0) / RZ;
  const vx = dx / RX, vy = dy / RY, vz = dz / RZ;
  const a = vx * vx + vy * vy + vz * vz, b = 2 * (ux * vx + uy * vy + uz * vz), c = ux * ux + uy * uy + uz * uz - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  return (-b - Math.sqrt(disc)) / (2 * a);
}
// the way straight in, at a point (voxel units): against the smooth skin's normal
export function inward(x, y, z, out = [0, 0, 0]) {
  let nx = (x - X0) / (RX * RX), ny = (y - Y0) / (RY * RY), nz = (z - Z0) / (RZ * RZ);
  const l = Math.hypot(nx, ny, nz) || 1;
  out[0] = -nx / l; out[1] = -ny / l; out[2] = -nz / l;
  return out;
}
// a hit worth cutting: on the wall itself, not seen through a hole on the far side
export function onWall(hit, ox, oy, oz, dx, dy, dz) {
  if (!hit || !CUTS[hit.k]) return false;
  const te = enterShell(ox, oy, oz, dx, dy, dz);
  return te !== null && hit.t - te < 8;
}

// ---------------------------------------------------------------- cutting
// remove the voxels (of table t) within r of the segment a-b; their [i, col, kind] go into
// rec, the ones taken into out (indices). Returns how many.
export function capsule(p, ax, ay, az, bx, by, bz, r, t, rec = null, out = null) {
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r)), x1 = Math.min(W - 1, Math.floor(Math.max(ax, bx) + r));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r)), y1 = Math.min(H - 1, Math.floor(Math.max(ay, by) + r));
  const z0 = Math.max(0, Math.floor(Math.min(az, bz) - r)), z1 = Math.min(D - 1, Math.floor(Math.max(az, bz) + r));
  const ex = bx - ax, ey = by - ay, ez = bz - az, ee = ex * ex + ey * ey + ez * ez || 1e-9, rr = r * r;
  let n = 0;
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const i = idx(x, y, z);
    if (!t[p.kind[i]]) continue;
    const qx = x + 0.5 - ax, qy = y + 0.5 - ay, qz = z + 0.5 - az;
    const s = Math.max(0, Math.min(1, (qx * ex + qy * ey + qz * ez) / ee));
    const fx = qx - ex * s, fy = qy - ey * s, fz = qz - ez * s;
    if (fx * fx + fy * fy + fz * fz > rr) continue;
    if (out) out.push(i);
    p.remove(i, rec);
    n++;
  }
  return n;
}
export const TOOLS = { knife: 0.75, gouge: 1.65 };
const _n = [0, 0, 0];
// a cut at point (x, y, z) on the surface (voxel units): straight in, through the wall
export function cut(p, x, y, z, tool = 'knife', rec = null, out = null) {
  const n = inward(x, y, z, _n);
  return capsule(p, x - n[0] * 0.8, y - n[1] * 0.8, z - n[2] * 0.8, x + n[0] * DEPTH, y + n[1] * DEPTH, z + n[2] * DEPTH, TOOLS[tool] || TOOLS.knife, CUTS, rec, out);
}
// a scoop of guts round a point
export function scoop(p, x, y, z, r = 2.6, rec = null, out = null) {
  return capsule(p, x, y, z, x, y, z, r, GUTS, rec, out);
}

// ---------------------------------------------------------------- what still holds
const NB6 = [1, -1, W, -W, W * H, -W * H];
// flood from seeds through voxels where ok(i); marks seen
function flood(seeds, n, ok, seen, q) {
  let head = 0, tail = 0;
  for (let s = 0; s < n; s++) { const i = seeds[s]; if (!seen[i] && ok(i)) { seen[i] = 1; q[tail++] = i; } }
  while (head < tail) {
    const i = q[head++];
    const x = i % W, r = (i - x) / W, y = r % H, z = (r - y) / H;
    for (let k = 0; k < 6; k++) {
      if ((k === 0 && x === W - 1) || (k === 1 && x === 0) || (k === 2 && y === H - 1) || (k === 3 && y === 0) || (k === 4 && z === D - 1) || (k === 5 && z === 0)) continue;
      const j = i + NB6[k];
      if (!seen[j] && ok(j)) { seen[j] = 1; q[tail++] = j; }
    }
  }
  return tail;
}
// the pieces that no longer hang on: [{ cells: Int32Array, n, stem }]. The body holds from
// its bottom up; the lid (once cut free) from its stem. Guts don't hold anything up.
export function looseParts(p) {
  const K8 = p.kind, seen = new Uint8Array(N3), q = new Int32Array(N3);
  const seeds = [];
  for (let z = 0; z < D; z++) for (let y = 0; y < 3; y++) for (let x = 0; x < W; x++) { const i = idx(x, y, z); if (STRUCT[K8[i]] && !(K8[i] & LID)) seeds.push(i); }
  flood(seeds, seeds.length, (i) => STRUCT[K8[i]] && !(K8[i] & LID), seen, q);
  const lidSeeds = [];
  for (let i = 0; i < N3; i++) if ((K8[i] & KIND) === K.STEM && K8[i] & LID) lidSeeds.push(i);
  flood(lidSeeds, lidSeeds.length, (i) => STRUCT[K8[i]] && !!(K8[i] & LID), seen, q);
  const out = [];
  for (let i = 0; i < N3; i++) {
    if (seen[i] || !STRUCT[K8[i]]) continue;
    const n = flood([i], 1, (j) => STRUCT[K8[j]], seen, q);
    const cells = q.slice(0, n);
    let stem = false;
    for (let k = 0; k < n; k++) if ((K8[cells[k]] & KIND) === K.STEM) { stem = true; break; }
    out.push({ cells, n, stem });
  }
  return out;
}
// a quick look while the ring is being cut: has the bit round the stem come free yet? (a
// flood from the stem that gives up as soon as it gets well outside the marker ring)
let LSEEN = null, LQ = null;
export function lidFree(p) {
  const K8 = p.kind, B = base();
  const seen = LSEEN || (LSEEN = new Uint8Array(N3)), q = LQ || (LQ = new Int32Array(4096));
  const s0 = idx(B.stem[0], B.stem[1], B.stem[2]);
  if (!STRUCT[K8[s0]]) return false;
  let head = 0, tail = 0, free = true;
  seen[s0] = 1;
  q[tail++] = s0;
  const far = (LID_R + 2.5) ** 2, low = Y0 + RY * 0.3;
  flood: while (head < tail) {
    const i = q[head++];
    const x = i % W, r = (i - x) / W, y = r % H, z = (r - y) / H;
    if ((x + 0.5 - X0) ** 2 + (z + 0.5 - Z0) ** 2 > far || y < low) { free = false; break; }
    for (let k = 0; k < 6; k++) {
      if ((k === 0 && x === W - 1) || (k === 1 && x === 0) || (k === 2 && y === H - 1) || (k === 3 && y === 0) || (k === 4 && z === D - 1) || (k === 5 && z === 0)) continue;
      const j = i + NB6[k];
      if (seen[j] || !STRUCT[K8[j]]) continue;
      if (tail >= q.length) { free = false; break flood; }
      seen[j] = 1;
      q[tail++] = j;
    }
  }
  for (let k = 0; k < tail; k++) seen[q[k]] = 0;
  return free;
}
// the lid: cut free (a loose piece with the stem on it), lifted off. Returns
// { cells, col, kind, c: [cx, cy, cz] (its middle) }; its voxels leave the grid
export function takeLid(p, part, rec = null) {
  const n = part.cells.length;
  const col = new Uint32Array(n), kind = new Uint8Array(n);
  let sx = 0, sy = 0, sz = 0;
  for (let k = 0; k < n; k++) {
    const i = part.cells[k];
    col[k] = p.col[i];
    kind[k] = p.kind[i] | LID;
    const x = i % W, r = (i - x) / W, y = r % H;
    sx += x + 0.5; sy += y + 0.5; sz += (r - y) / H + 0.5;
    p.remove(i, rec);
  }
  return { cells: part.cells.slice(), col, kind, c: [sx / n, sy / n, sz / n] };
}
// the lid as it sits (put back on): every voxel that came off with it
export function lidPart(p) {
  const cells = [];
  for (let i = 0; i < N3; i++) if (p.kind[i] & LID) cells.push(i);
  return cells.length ? { cells: Int32Array.from(cells), n: cells.length, stem: true } : null;
}
export function putLid(p, lid) {
  for (let k = 0; k < lid.cells.length; k++) {
    const i = lid.cells[k];
    if (!p.kind[i]) p.put(i, lid.col[k], lid.kind[k]);
  }
}
// a cut right round the marker ring (when Hank skips the warm-up)
export function cutLidRing(p, rec = null) {
  let n = 0;
  for (let a = 0; a < 96; a++) {
    const th = (a / 96) * Math.PI * 2;
    const x = X0 + Math.cos(th) * LID_R, z = Z0 + Math.sin(th) * LID_R;
    const hit = raycast(p, x, H - 0.01, z, 0, -1, 0);
    if (hit) n += cut(p, x, hit.y + 1, z, 'knife', rec);
  }
  return n;
}

// ---------------------------------------------------------------- the judges' view
// the hollow and every cut through to it (1), as far as the light gets from the candle
export function insideAir(p) {
  const B = base(), K8 = p.kind, air = new Uint8Array(N3), q = new Int32Array(N3);
  const seeds = [];
  for (let i = 0; i < N3; i++) if (B.CAV[i]) seeds.push(i);
  flood(seeds, seeds.length, (i) => B.CAV[i] || (B.SHAPE[i] && !K8[i]), air, q);
  return air;
}
// the four sides: f, the way the side faces; r, the viewer's right (in x, z)
export const SIDES = [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]];
// side s seen straight on as the judges' 32 x 32 mask: a cell is cut when the first wall
// voxel along its line of sight is gone and open to the hollow
export function projectMask(p, side = 0, air = insideAir(p)) {
  const B = base(), m = new Uint8Array(N * N);
  const [fx, fz, rx, rz] = SIDES[side & 3];
  for (let row = 0; row < N; row++) for (let c = 0; c < N; c++) {
    if (!BODY[row * N + c]) continue;
    const u = c + 0.5 - CX, y = TOP - row;
    if (y < 0 || y >= H) continue;
    for (let k = Math.ceil(RX) + 1; k >= 0; k--) {
      const x = Math.floor(X0 + rx * u + fx * (k + 0.5)), z = Math.floor(Z0 + rz * u + fz * (k + 0.5));
      if (!inb(x, y, z)) continue;
      const i = idx(x, y, z);
      if (B.ORIG[i] !== 1) continue;
      if (!p.kind[i] && air[i]) m[row * N + c] = 1;
      break;
    }
  }
  return m;
}
// score every side and keep the best (opts as scoreCarving's); a side over-cut or cut
// clean across brings the whole pumpkin down
export function judge(p, opts = {}) {
  const air = insideAir(p);
  let best = null, down = null;
  for (let s = 0; s < 4; s++) {
    const mask = projectMask(p, s, air);
    const res = CS.scoreCarving(mask, opts);
    const e = { side: s, mask, res };
    if (res.collapse && (!down || res.carved > down.res.carved)) down = e;
    if (!best || res.score > best.res.score || (res.score === best.res.score && res.carved > best.res.carved)) best = e;
  }
  return down || best;
}

// ---------------------------------------------------------------- saving
const b64 = {
  enc: (bytes) => {
    if (typeof btoa !== 'function') return Buffer.from(bytes).toString('base64');
    let s = '';
    for (let k = 0; k < bytes.length; k += 4096) s += String.fromCharCode(...bytes.slice(k, k + 4096));
    return btoa(s);
  },
  dec: (s) => (typeof atob === 'function' ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, 'base64'))),
};
// the removed voxels as alternating runs (kept, removed, kept, ...) of LEB128 varints
export function encodeCarve(p) {
  const B = base(), bytes = [];
  const vint = (n) => { while (n >= 0x80) { bytes.push((n & 0x7f) | 0x80); n >>>= 7; } bytes.push(n); };
  let gone = false, run = 0;
  for (let i = 0; i < N3; i++) {
    const g = B.kind[i] !== 0 && p.kind[i] === 0;
    if (g !== gone) { vint(run); run = 0; gone = g; }
    run++;
  }
  vint(run);
  return `${VER}:${b64.enc(bytes)}`;
}
export function decodeCarve(s) {
  if (typeof s !== 'string') return null;
  const [v, data] = s.split(':');
  if (+v !== VER || data === undefined) return null;
  try {
    const bytes = b64.dec(data), p = freshPumpkin();
    let at = 0, i = 0, gone = false;
    while (at < bytes.length) {
      let n = 0, sh = 0, b;
      do { b = bytes[at++]; n += (b & 0x7f) * 2 ** sh; sh += 7; } while (b & 0x80 && at < bytes.length);
      if (i + n > N3) return null;
      if (gone) for (let k = i; k < i + n; k++) { p.col[k] = 0; p.kind[k] = 0; }
      i += n;
      gone = !gone;
    }
    return i === N3 ? p : null;
  } catch {
    return null;
  }
}
// an old save's face (just the 32 x 32 mask): cut straight through the front, lid cut
export function fromMask(mask) {
  const p = freshPumpkin(), B = base();
  cutLidRing(p);
  for (const part of looseParts(p)) if (part.stem) putLid(p, takeLid(p, part));
  for (let row = 0; row < N; row++) for (let c = 0; c < N; c++) {
    if (!mask[row * N + c] || !CARVABLE[row * N + c]) continue;
    const x = c + P0, y = TOP - row;
    for (let z = D - 1; z >= Z0; z--) {
      const i = idx(x, y, z);
      if (B.CAV[i]) break;
      if (CUTS[p.kind[i]]) p.remove(i);
    }
  }
  for (const part of looseParts(p)) for (const i of part.cells) p.remove(i);
  return p;
}

// the carved pumpkin as a jack-o'-lantern for Hank's table ({ vox, size, origin } like the
// voxel models): the walls of every cut through, and the inside, glowing (lit), a candle on
// the floor of the hollow, a scorched rim round the holes on the skin
export function displayVox(p, { lit = true, candle = true } = {}) {
  const B = base(), v = new Vox(W, H, D), air = lit ? insideAir(p) : null;
  v.data.set(p.col);
  if (air) {
    for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y, z), k = p.kind[i] & KIND;
      if (!k || k === K.STEM) continue;
      if (k === K.GOO || k === K.SEED) { v.data[i] = tone(p.col[i], 0.08) | EMIT; continue; } // (any guts left in, lit up too)
      let tin = false, tout = false;
      for (let n = 0; n < 6; n++) {
        const xx = x + (n === 0 ? 1 : n === 1 ? -1 : 0), yy = y + (n === 2 ? 1 : n === 3 ? -1 : 0), zz = z + (n === 4 ? 1 : n === 5 ? -1 : 0);
        if (!inb(xx, yy, zz)) { tout = true; continue; }
        const j = idx(xx, yy, zz);
        if (p.kind[j]) continue;
        if (air[j]) tin = true;
        else tout = true;
      }
      if (!tin) continue;
      if (tout) { if (k === K.SKIN) v.data[i] = tone(p.col[i], -0.22); } else v.data[i] = (y + 0.5 > Y0 + RY * 0.2 ? COL.glow2 : COL.glow) | EMIT;
    }
  }
  if (candle) {
    const fx = Math.floor(X0) - 1, fz = Math.floor(Z0) - 1;
    let fy = 0;
    while (fy < H && !B.CAV[idx(fx, fy, fz)]) fy++;
    for (let y = fy; y < fy + 4; y++) for (let z = fz; z <= fz + 1; z++) for (let x = fx; x <= fx + 1; x++) v.data[idx(x, y, z)] = lit ? COL.candle | EMIT : COL.candle;
    if (lit) { v.data[idx(fx + 1, fy + 4, fz + 1)] = COL.flame | EMIT; v.data[idx(fx + 1, fy + 5, fz + 1)] = COL.flame2 | EMIT; }
  }
  return { vox: v, size: SIZE, origin: [X0, 0, Z0], jitter: 0, meta: { radius: RX * SIZE } };
}
