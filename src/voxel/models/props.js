// Voxel props for Deli-very-dead: pumpkins & jack-o'-lanterns, harvest decor,
// graveyard pieces, Halloween decorations, village furniture and small
// carry-able items.
//
// Every builder returns { vox, size, origin, jitter, meta }:
//   size    metres per voxel (0.025 for small detailed props, 0.05 for big ones)
//   origin  pivot in voxel units (bottom-centre unless noted in meta.mount)
//   jitter  suggested meshVox jitter (0 keeps greedy meshing cheap)
//   meta    { radius, height, box, boxCenter, lights:[{x,y,z,color,radius}],
//             breakable?, ...model specific } (all lengths in metres)
// Builders are deterministic for a given options object (seed, variant...).
import { Vox, EMIT, GLASS, FLAGS, tone, mixc, vhash } from '../vox.js';

const TAU = Math.PI * 2;
const FINE = 0.025; // small detailed props (≲ 0.7 m)
const STD = 0.05; // regular props

// ------------------------------------------------------------------ palette
const INK = 0x1e1418;
const BONE = 0xf0e6cc, BONE_D = 0xcbbd9c, BONE_L = 0xfff4e0;
const CREAM = 0xf2e6c8;
const WOOD = 0x8a5a32, WOOD_D = 0x5e3a1e, WOOD_L = 0xab7642, WOOD_DD = 0x40261a;
const GREYWOOD = 0x8a7a68, GREYWOOD_D = 0x655848, GREYWOOD_L = 0xa89884;
const STONE = 0x8f8d98, STONE_D = 0x696770, STONE_L = 0xb2b0ba;
const MOSS = 0x667f36, MOSS_D = 0x4a6028, MOSS_L = 0x84a046;
const IRON = 0x2e2a32, IRON_L = 0x4c4854, RUST = 0x7e4a30;
const STRAW = 0xd9b558, STRAW_D = 0xb08a38, STRAW_L = 0xecd27e;
const DIRT = 0x6a4a30, DIRT_D = 0x4e3422, DIRT_L = 0x86603e;
const LEAF = 0x5a8a32, LEAF_D = 0x3e6424, LEAF_L = 0x7eaa46;
const RED = 0xb8322a, RED_D = 0x84221e, RED_L = 0xd8503a;
const GOLD = 0xe0b040, GOLD_D = 0xa87822, GOLD_L = 0xf8dc78;
const PURPLE = 0x6a3a8a, PURPLE_D = 0x46265e, PURPLE_L = 0x9262b6;
const ORANGE = 0xe8781e;
const TEAL = 0x2f7f7a, TEAL_D = 0x215a58, TEAL_L = 0x4aa09a;
const DENIM = 0x3e5a8a, DENIM_D = 0x2c4064;
const PINK = 0xf08aa8, PINK_D = 0xc8607e;
const METAL = 0x9aa0aa, METAL_D = 0x6e747e, METAL_L = 0xc4cad2;
const BLACKCAT = 0x2a2232, BLACKCAT_L = 0x3e344a;
const FIRE = [0xff5a1e | EMIT, 0xff8a24 | EMIT, 0xffb83c | EMIT, 0xffe08a | EMIT];
const L_CANDLE = [1.0, 0.62, 0.28], L_JACK = [1.0, 0.55, 0.18], L_BREW = [0.45, 1.0, 0.3], L_LAMP = [1.0, 0.76, 0.45];

// ------------------------------------------------------------------ helpers
export function rng(seed = 1) {
  let a = (Math.imul((seed | 0) ^ 0x5bd1e995, 2654435761) + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r3 = (x) => Math.round(x * 1000) / 1000;
const cf = (c, ...a) => (typeof c === 'function' ? c(...a) : c);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// crop to filled bounds, compute collider meta, convert lights to metres
function finish(v, size, o = {}) {
  const b = v.bounds();
  if (b.x1 < 0) throw new Error('empty model');
  const nv = new Vox(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, b.z1 - b.z0 + 1);
  for (let z = b.z0; z <= b.z1; z++) for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    const c = v.data[v.idx(x, y, z)];
    if (c) nv.data[nv.idx(x - b.x0, y - b.y0, z - b.z0)] = c;
  }
  // origin given in pre-crop voxel units; default bottom-centre of the cropped box
  const pre = o.origin || [b.x0 + nv.w / 2, b.y0, b.z0 + nv.d / 2];
  const origin = [pre[0] - b.x0, pre[1] - b.y0, pre[2] - b.z0];
  const [ox, oy, oz] = origin;
  const hx = Math.max(ox, nv.w - ox) * size, hz = Math.max(oz, nv.d - oz) * size;
  const meta = {
    radius: r3(o.radius ?? ((hx + hz) / 2) * 0.9),
    height: r3(o.height ?? (nv.h - oy) * size),
    box: [r3(nv.w * size), r3(nv.h * size), r3(nv.d * size)],
    boxCenter: [r3((nv.w / 2 - ox) * size), r3((nv.h / 2 - oy) * size), r3((nv.d / 2 - oz) * size)],
    lights: (o.lights || []).map((l) => ({
      x: r3((l.at[0] + 0.5 - pre[0]) * size),
      y: r3((l.at[1] + 0.5 - pre[1]) * size),
      z: r3((l.at[2] + 0.5 - pre[2]) * size),
      color: l.color,
      radius: l.radius,
    })),
    ...(o.meta || {}),
  };
  if (o.breakable) meta.breakable = true;
  return { vox: nv, size, origin, jitter: o.jitter ?? 0, meta };
}
// convert a voxel-space point (pre-crop, index coords) to metres relative to the origin of a finished model
function toMetres(res, p, pre) {
  return p.map((q, i) => r3((q + 0.5 - pre[i]) * res.size));
}

// solid of revolution around a vertical axis; rf(y,t) -> radius; cx/cz may be fn(y,t)
// c: color or fn(x,y,z,angle,dist,radius,t)
function lathe(v, cx, cz, y0, y1, rf, c, o = {}) {
  for (let y = y0; y <= y1; y++) {
    const t = y1 > y0 ? (y - y0) / (y1 - y0) : 0;
    const r = cf(rf, y, t);
    if (!(r > 0)) continue;
    const ccx = cf(cx, y, t), ccz = cf(cz, y, t);
    const wall = o.wall ? cf(o.wall, y, t) : 0;
    const solid = o.floor !== undefined && y <= o.floor;
    for (let z = Math.floor(ccz - r - 1); z <= Math.ceil(ccz + r + 1); z++)
      for (let x = Math.floor(ccx - r - 1); x <= Math.ceil(ccx + r + 1); x++) {
        const dx = x - ccx, dz = z - ccz, d = Math.sqrt(dx * dx + dz * dz);
        if (d > r + 0.25) continue;
        if (wall && !solid && d <= r - wall) continue;
        const col = cf(c, x, y, z, Math.atan2(dz, dx), d, r, t);
        if (col) v.set(x, y, z, col);
      }
  }
}
// rounded box; r = horizontal corner radius, ry = vertical
function rbox(v, x0, y0, z0, x1, y1, z1, r, c, ry = r) {
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const qx = Math.max(x0 + r - x, 0, x - (x1 - r)), qy = Math.max(y0 + ry - y, 0, y - (y1 - ry)), qz = Math.max(z0 + r - z, 0, z - (z1 - r));
    const nx = r > 0 ? qx / r : 0, ny = ry > 0 ? qy / ry : 0, nz = r > 0 ? qz / r : 0;
    if (nx * nx + ny * ny + nz * nz > 1.001) continue;
    const col = cf(c, x, y, z);
    if (col) v.set(x, y, z, col);
  }
}
// torus. axis 'y': ring lies flat; 'z': ring stands facing +z; 'x': facing +x
function torus(v, cx, cy, cz, R, r, c, axis = 'y') {
  const e = Math.ceil(R + r + 1);
  for (let z = Math.floor(cz - e); z <= cz + e; z++) for (let y = Math.floor(cy - e); y <= cy + e; y++) for (let x = Math.floor(cx - e); x <= cx + e; x++) {
    let a, b, h;
    if (axis === 'y') { a = x - cx; b = z - cz; h = y - cy; }
    else if (axis === 'z') { a = x - cx; b = y - cy; h = z - cz; }
    else { a = z - cz; b = y - cy; h = x - cx; }
    const q = Math.sqrt(a * a + b * b) - R;
    if (q * q + h * h > r * r + 0.15) continue;
    const col = cf(c, x, y, z, Math.atan2(b, a));
    if (col) v.set(x, y, z, col);
  }
}
function polyline(v, pts, c, r = 0) {
  for (let i = 0; i + 1 < pts.length; i++) v.line(...pts[i], ...pts[i + 1], c, r);
}
function topY(v, x, z, from = v.h - 1) {
  for (let y = from; y >= 0; y--) if (v.get(x, y, z)) return y;
  return -1;
}
function frontZ(v, x, y) {
  for (let z = v.d - 1; z >= 0; z--) if (v.get(x, y, z)) return z;
  return -1;
}
// lighten voxels open to the sky, darken undersides, darken silhouette edges
function bevel(v, { top = 0.1, bottom = -0.1, edge = 0, test } = {}) {
  const W = v.w, H = v.h, D = v.d, d = v.data, out = d.slice();
  const s = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D && d[x + W * (y + H * z)] !== 0;
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + W * (y + H * z), c = d[i];
    if (!c || c & FLAGS) continue;
    if (test && !test(x, y, z, c)) continue;
    if (!s(x, y + 1, z)) { if (top) out[i] = tone(c, top); continue; }
    if (edge) {
      const ex = !s(x - 1, y, z) || !s(x + 1, y, z), ez = !s(x, y, z - 1) || !s(x, y, z + 1);
      const ed = y > 0 && !s(x, y - 1, z);
      if (ex + ez + ed >= 2) { out[i] = tone(c, edge); continue; }
    }
    if (bottom && y > 0 && !s(x, y - 1, z)) out[i] = tone(c, bottom);
  }
  d.set(out);
}
// shear a model: each layer y shifts by (kx*(y-y0), kz*(y-y0)) voxels
function shear(v, kx, kz = 0, y0 = 0) {
  let mnx = 0, mxx = 0, mnz = 0, mxz = 0;
  for (let y = 0; y < v.h; y++) {
    const sx = Math.round(kx * (y - y0)), sz = Math.round(kz * (y - y0));
    mnx = Math.min(mnx, sx); mxx = Math.max(mxx, sx); mnz = Math.min(mnz, sz); mxz = Math.max(mxz, sz);
  }
  const nv = new Vox(v.w + mxx - mnx, v.h, v.d + mxz - mnz);
  for (let z = 0; z < v.d; z++) for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) {
    const c = v.data[v.idx(x, y, z)];
    if (c) nv.set(x + Math.round(kx * (y - y0)) - mnx, y, z + Math.round(kz * (y - y0)) - mnz, c);
  }
  nv.shift = [-mnx, 0, -mnz];
  return nv;
}
// rotate a model a quarter turn n times around y (counter-clockwise seen from above)
function rotY(v, n = 1) {
  n = ((n % 4) + 4) % 4;
  let cur = v;
  for (let k = 0; k < n; k++) {
    const nv = new Vox(cur.d, cur.h, cur.w);
    for (let z = 0; z < cur.d; z++) for (let y = 0; y < cur.h; y++) for (let x = 0; x < cur.w; x++) {
      const c = cur.data[cur.idx(x, y, z)];
      if (c) nv.set(z, y, cur.w - 1 - x, c);
    }
    cur = nv;
  }
  return cur;
}
// tiny 3x5 font for engravings
const FONT = {
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  I: ['#', '#', '#', '#', '#'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  '+': ['.#.', '###', '.#.', '.#.', '.#.'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#', '##', '.#', '.#', '.#'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '##.'],
};
function glyphRows(text) {
  const rows = ['', '', '', '', ''];
  [...text].forEach((ch, i) => {
    const g = FONT[ch] || FONT.I;
    for (let r = 0; r < 5; r++) rows[r] += (i ? '.' : '') + g[r];
  });
  return rows;
}
// carve a pattern (rows of '#') into the front (+z) surface: depth voxels removed, the next one recoloured
function engrave(v, rows, cx, yTop, col, depth = 1) {
  const w = Math.max(...rows.map((r) => r.length));
  const x0 = Math.round(cx - (w - 1) / 2);
  rows.forEach((row, ry) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] !== '#') continue;
      const x = x0 + i, y = yTop - ry, z = frontZ(v, x, y);
      if (z < depth) continue;
      for (let k = 0; k < depth; k++) v.set(x, y, z - k, 0);
      v.set(x, y, z - depth, cf(col, x, y, z - depth));
    }
  });
}
// paint a pattern flat onto the front surface
function decal(v, rows, cx, yTop, colMap, dz = 0) {
  const w = Math.max(...rows.map((r) => r.length));
  const x0 = Math.round(cx - (w - 1) / 2);
  rows.forEach((row, ry) => {
    for (let i = 0; i < row.length; i++) {
      const col = colMap[row[i]];
      if (!col) continue;
      const x = x0 + i, y = yTop - ry, z = frontZ(v, x, y);
      if (z < 0) continue;
      v.set(x, y, z + dz, col);
    }
  });
}
// multi-colour relief on the front surface: map[ch] = [colour, depth] (depth 0 recolours, >0 carves, -1 raises)
function relief(v, rows, cx, yTop, map) {
  const w = Math.max(...rows.map((r) => r.length));
  const x0 = Math.round(cx - (w - 1) / 2);
  rows.forEach((row, ry) => {
    for (let i = 0; i < row.length; i++) {
      const m = map[row[i]];
      if (!m) continue;
      const [col, depth] = m, x = x0 + i, y = yTop - ry, z = frontZ(v, x, y);
      if (z < 0) continue;
      if (depth < 0) { v.set(x, y, z + 1, col); continue; }
      for (let k = 0; k < depth; k++) v.set(x, y, z - k, 0);
      v.set(x, y, z - depth, col);
    }
  });
}
// a teardrop flame standing at (x,y,z); h voxels tall, w = base radius
function flame(v, x, y, z, h = 4, w = 1.2, lean = 0) {
  lathe(v, (yy, t) => x + lean * t * t * h, z, y, y + h - 1, (yy, t) => Math.max(0.35, w * Math.sin(Math.PI * Math.min(1, 0.35 + t * 0.75)) * (1 - t * 0.55)),
    (xx, yy, zz, a, d, r, t) => (t > 0.66 ? FIRE[3] : d > r - 0.6 && t < 0.5 ? FIRE[1] : FIRE[2]));
}
function candleFlame(v, x, y, z) {
  v.set(x, y, z, FIRE[1]);
  v.set(x, y + 1, z, FIRE[2]);
  v.set(x, y + 2, z, FIRE[3]);
}

// =================================================================== PUMPKINS
const PUMPKIN_PALS = {
  orange: { base: 0xe8781e, dark: 0xb4501a, light: 0xf6993a, deep: 0x8a3614, flesh: 0xf6c062 },
  amber: { base: 0xec9022, dark: 0xbc6618, light: 0xf8b24c, deep: 0x91461a, flesh: 0xf8cc70 },
  red: { base: 0xd85a1c, dark: 0xa23c16, light: 0xec7c34, deep: 0x7a2a12, flesh: 0xf2b05a },
  white: { base: 0xebe4d4, dark: 0xbab4b2, light: 0xfff4e0, deep: 0x928e90, flesh: 0xf2dca6 },
  green: { base: 0x5c8636, dark: 0x3c5e24, light: 0x82aa4e, deep: 0x2c4418, flesh: 0xe0d48a },
  stripe: { base: 0xe8d27e, dark: 0x3f6a2c, light: 0xf6e6a2, deep: 0x2f5020, flesh: 0xf0e0a0 },
  warty: { base: 0x9aa63c, dark: 0x6e7c2a, light: 0xc0c45a, deep: 0x4c5a1e, flesh: 0xe8dc8a },
};
const STEM = { base: 0x7a6a34, dark: 0x54461e, light: 0x9c8c48 };
const VINE = 0x5f8a30;

// paint a ribbed, lumpy pumpkin whose bottom sits at y = by. Returns { cx, cy, cz, stemTop, info }
function paintPumpkin(v, cx, by, cz, o = {}) {
  const rx = o.rx, ry = o.ry, rz = o.rz ?? o.rx;
  const pal = typeof o.pal === 'string' ? PUMPKIN_PALS[o.pal] : o.pal || PUMPKIN_PALS.orange;
  const R = rng(o.seed ?? 1);
  const ribs = o.ribs ?? 10;
  const depth = o.ribDepth ?? 0.12;
  const gw = o.grooveW ?? 0.75;
  const ph = R() * TAU;
  const la = o.lump ?? 0.05;
  const l1 = (R() * 2 - 1) * la, p1 = R() * TAU, l2 = (R() * 2 - 1) * la, p2 = R() * TAU;
  const tones = Array.from({ length: ribs }, () => (R() * 2 - 1) * 0.045);
  const dimT = o.dimple ?? 0.24, dimB = o.dimpleB ?? 0.08;
  const cy = by + ry;
  const ex = Math.ceil(rx * (1 + la * 2) + 1), ez = Math.ceil(rz * (1 + la * 2) + 1);
  for (let z = Math.floor(cz - ez); z <= cz + ez; z++)
    for (let y = by; y < by + 2 * ry + 1; y++)
      for (let x = Math.floor(cx - ex); x <= cx + ex; x++) {
        const dx = (x - cx) / rx, dz = (z - cz) / rz, dy = (y + 0.5 - cy) / ry;
        const rh = Math.sqrt(dx * dx + dz * dz);
        const th = Math.atan2(dz, dx);
        const a = (th * ribs) / 2 + ph;
        const rib = Math.abs(Math.cos(a));
        const s = 1 - depth * (1 - Math.sqrt(rib)) + l1 * Math.cos(th + p1) + l2 * Math.cos(2 * th + p2);
        const q = rh / s;
        if (q > 1) continue;
        const h = Math.sqrt(1 - q * q);
        const f = Math.max(0, 1 - q / 0.5);
        if (dy > h - dimT * f * f || dy < -h + dimB * f * f) continue;
        // distance to the nearest groove line, in voxels of arc length
        const u = a - Math.PI / 2, fr = u / Math.PI - Math.round(u / Math.PI);
        const arc = ((Math.abs(fr) * Math.PI * 2) / ribs) * Math.sqrt((x - cx) ** 2 + (z - cz) ** 2);
        const k = ((Math.floor(u / Math.PI) % ribs) + ribs) % ribs;
        const groove = arc < gw && q > 0.18;
        let c;
        if (o.stripes) {
          // gourd: wide stripes follow the grooves, bottom part two-tone
          c = arc < gw * 2.2 && q > 0.15 ? pal.dark : dy > 0.5 ? pal.light : pal.base;
          if (o.bicolor !== undefined && dy < o.bicolor) c = c === pal.dark ? pal.deep : pal.dark;
        } else {
          const seg = tone(k % 2 ? pal.base : tone(pal.base, -0.05), tones[k] * 0.5);
          c = groove ? pal.dark : dy > 0.52 ? mixc(seg, pal.light, 0.7) : seg;
          if (dy < -0.5) c = groove ? pal.deep : tone(c, -0.12);
        }
        v.set(x, y, z, c);
      }
  const out = { cx, cy, cz, rx, ry, rz, pal, stemTop: by + 2 * ry };
  const ycx = Math.round(cx), ycz = Math.round(cz);
  const yb = topY(v, ycx, ycz, Math.min(v.h - 1, by + 2 * ry + 1));
  const sr = o.stemR ?? Math.max(0.6, rx * 0.13);
  const dir = R() * TAU;
  // leaf lying on the shoulder, conforming to the surface
  if (o.leaf) {
    const lang = dir + Math.PI * (0.55 + R() * 0.9);
    const Lf = o.leafLen ?? rx * 0.62, Wf = Lf * 0.42;
    for (let z = Math.floor(cz - Lf - 2); z <= cz + Lf + 2; z++)
      for (let x = Math.floor(cx - Lf - 2); x <= cx + Lf + 2; x++) {
        const ux = x - cx, uz = z - cz;
        const u = ux * Math.cos(lang) + uz * Math.sin(lang), w = -ux * Math.sin(lang) + uz * Math.cos(lang);
        if (u < sr + 0.6 || u > Lf) continue;
        const tt = (u - sr) / (Lf - sr);
        const wm = Wf * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + tt * 0.95)), 0.7) * (1 + 0.28 * Math.cos(tt * 2.5 * TAU));
        if (Math.abs(w) > wm) continue;
        const yt = topY(v, x, z, Math.min(v.h - 1, by + 2 * ry + 1));
        if (yt < by) continue;
        const col = Math.abs(w) < 0.55 ? LEAF_D : w > 0 ? LEAF : LEAF_L;
        v.set(x, yt + 1, z, col);
        if (tt > 0.85) v.set(x, yt + 2, z, col); // tip curls up a little
      }
  }
  if (o.stem !== false && yb >= 0) {
    const sh = o.stemH ?? Math.max(2, Math.round(ry * 0.5));
    const lx = Math.cos(dir) * (o.stemLean ?? 0.9), lz = Math.sin(dir) * (o.stemLean ?? 0.9);
    let tx = cx, tz = cz;
    for (let t = 0; t <= sh; t++) {
      const k = t / sh;
      tx = cx + lx * k * k * sh * 0.5;
      tz = cz + lz * k * k * sh * 0.5;
      const rr = t === sh ? sr * 1.1 + 0.2 : t === 0 ? sr * 1.35 : sr * (1 - 0.15 * k);
      lathe(v, tx, tz, yb + t, yb + t, rr, (x, y, z, ang) => (t === sh ? STEM.light : Math.floor(((ang + Math.PI) / TAU) * 6) % 2 ? STEM.base : STEM.dark));
    }
    out.stemTop = yb + sh;
    out.stemTip = [tx, yb + sh, tz];
    // curly tendril
    if (o.vine) {
      const vd = dir + Math.PI * 0.5 + R() * 0.6;
      const bx = cx + Math.cos(vd) * (sr + 0.5), bz = cz + Math.sin(vd) * (sr + 0.5), byy = yb + 1;
      const L = rx * 0.75, A = Math.max(1.1, rx * 0.14), turns = 2.1;
      const pts = [];
      for (let i = 0; i <= 48; i++) {
        const t = i / 48, ang = t * turns * TAU;
        const al = t * L, amp = A * (1 - t * 0.35);
        pts.push([
          bx + Math.cos(vd) * al - Math.sin(vd) * amp * Math.sin(ang),
          byy + amp * (1 - Math.cos(ang)) * 0.9 + t * 1.5,
          bz + Math.sin(vd) * al + Math.cos(vd) * amp * Math.sin(ang),
        ]);
      }
      polyline(v, pts, VINE);
    }
  }
  return out;
}

const PUMPKIN_KINDS = {
  small: { rx: 6, ry: 5, ribs: 8 },
  medium: { rx: 9.5, ry: 7.5, ribs: 10 },
  big: { rx: 13, ry: 10, ribs: 12 },
  tall: { rx: 8, ry: 10, ribs: 10, dimple: 0.16 },
  squat: { rx: 12, ry: 6, ribs: 12, dimple: 0.3 },
};

// pumpkin({ kind: small|medium|big|tall|squat, seed, color: orange|amber|red|white|green, vine, leaf })
export function pumpkin({ kind = 'medium', seed = 1, color, vine, leaf, ribs } = {}) {
  const K = PUMPKIN_KINDS[kind] || PUMPKIN_KINDS.medium;
  const R = rng(seed * 31 + 7);
  const pal = color || ['orange', 'orange', 'amber', 'red'][Math.floor(R() * 4)];
  const sx = 1 + (R() - 0.5) * 0.12, sz = 1 + (R() - 0.5) * 0.12;
  const rx = K.rx * sx, rz = K.rx * sz, ry = K.ry * (1 + (R() - 0.5) * 0.1);
  const W = Math.ceil(Math.max(rx, rz) * 1.6) * 2 + 3;
  const v = new Vox(W, Math.ceil(ry * 2.9) + 4, W);
  const c = (W - 1) / 2;
  paintPumpkin(v, c, 0, c, {
    rx, ry, rz, ribs: ribs ?? K.ribs + (R() < 0.5 ? 0 : 2), pal, seed, dimple: K.dimple,
    lump: 0.02 + R() * 0.03, ribDepth: 0.06 + R() * 0.03,
    vine: vine ?? R() < 0.7, leaf: leaf ?? R() < 0.75,
    stemH: Math.max(2, Math.round(ry * (0.4 + R() * 0.25))), stemLean: 0.5 + R() * 0.9,
  });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: Math.max(rx, rz) * FINE, breakable: true, meta: { kind, color: pal } });
}
export const ghostPumpkin = (o = {}) => pumpkin({ kind: 'medium', ...o, color: 'white' });

// gourd({ variant: 'round'|'pear'|'warty', seed })
export function gourd({ variant = 'pear', seed = 1 } = {}) {
  const R = rng(seed * 13 + 5);
  const v = new Vox(24, 30, 24);
  const c = 11.5;
  if (variant === 'round') {
    paintPumpkin(v, 12, 0, 12, { rx: 5.5, ry: 4.6, ribs: 8, pal: 'stripe', stripes: true, grooveW: 0.6, bicolor: -0.15, seed, ribDepth: 0.08, stemH: 3, stemR: 0.7, leaf: false, vine: R() < 0.6 });
  } else if (variant === 'warty') {
    paintPumpkin(v, 12, 0, 12, { rx: 6, ry: 5, ribs: 10, pal: 'warty', seed, ribDepth: 0.14, stemH: 3, stemR: 0.8, leaf: false, vine: false });
    // warts
    for (let i = 0; i < 26; i++) {
      const a = R() * TAU, e = (R() - 0.3) * 1.2;
      const x = Math.round(12 + Math.cos(a) * 6.1 * Math.cos(e)), z = Math.round(12 + Math.sin(a) * 6.1 * Math.cos(e)), y = Math.round(5 + Math.sin(e) * 4.6);
      if (!v.get(x, y, z)) v.set(x, y, z, R() < 0.5 ? 0xd8d070 : 0xb8c04e);
    }
  } else {
    // bottle / pear gourd: fat bulb, curved neck, stripes along meridians, two-tone
    const ns = (R() - 0.5) * 2;
    lathe(v, (y, t) => 12 + (y > 8 ? ns * Math.pow((y - 8) / 12, 2) * 3 : 0), 12, 0, 20, (y) => {
      if (y <= 8) return 5.6 * Math.sqrt(Math.max(0, 1 - Math.pow((y - 4.6) / 5.1, 2)));
      const t = (y - 8) / 12;
      return 3.4 - t * 1.5 + Math.sin(t * Math.PI) * 0.4;
    }, (x, y, z, a) => {
      const st = Math.abs(Math.cos(a * 4)) < 0.3;
      if (y < 7) return st ? 0x3c6426 : 0x5c8a36;
      return st ? 0x7e9a3a : y > 17 ? 0xf2dc8a : 0xe8cc6a;
    });
    bevel(v, { top: 0.08, bottom: -0.1 });
    const tx = Math.round(12 + ns * 3);
    v.fill(tx, 21, 12, tx, 22, 12, STEM.base);
    v.set(tx + (ns > 0 ? 1 : -1), 23, 12, STEM.light);
  }
  return finish(v, FINE, { breakable: true, meta: { variant } });
}

// ============================================================ JACK-O'-LANTERNS
const FACES = {
  classic: [
    '...#......#...',
    '..###....###..',
    '.#####..#####.',
    '..............',
    '......##......',
    '.....####.....',
    '..............',
    '#............#',
    '###.######.###',
    '.############.',
    '...###..###...',
  ],
  happy: [
    '..............',
    '..##......##..',
    '.####....####.',
    '.####....####.',
    '..##......##..',
    '..............',
    '##..........##',
    '###........###',
    '.############.',
    '..##########..',
    '....######....',
  ],
  scared: [
    '.##........##.',
    '...##....##...',
    '..............',
    '..###....###..',
    '.#####..#####.',
    '.#####..#####.',
    '..###....###..',
    '..............',
    '...##.##.##...',
    '..#..#..#..#..',
    '..............',
  ],
  toothy: [
    '#............#',
    '.##........##.',
    '.####....####.',
    '..###....###..',
    '..............',
    '......##......',
    '##.#.#..#.#.##',
    '##############',
    '.##.#.##.#.##.',
    '..............',
    '..............',
  ],
  cat: [
    '..............',
    '.##........##.',
    '.####....####.',
    '..####..####..',
    '...##....##...',
    '..............',
    '#....####....#',
    '.##...##...##.',
    '......##......',
    '.#..##..##..#.',
    '....#....#....',
  ],
  skull: [
    '.####....####.',
    '######..######',
    '######..######',
    '######..######',
    '.####....####.',
    '......##......',
    '.....####.....',
    '..............',
    '.############.',
    '.#.#.#..#.#.#.',
    '..............',
  ],
};
export const JACK_FACES = Object.keys(FACES);

function parseFace(face) {
  const rows = typeof face === 'string' ? FACES[face] || FACES.classic : face;
  return rows.map((row) => (typeof row === 'string' ? [...row].map((ch) => ch === '#' || ch === 'X' || ch === 'x' || ch === '1' || ch === '*' || ch === 'O' || ch === 'o') : row.map((b) => !!b)));
}
// map a boolean grid into a maxW x maxH voxel box: integer upscale when it fits, else nearest sampling
function fitGrid(grid, maxW, maxH) {
  const R = grid.length, C = Math.max(...grid.map((r) => r.length));
  const s = Math.min(Math.floor(maxW / C), Math.floor(maxH / R));
  if (s >= 1) return { w: C * s, h: R * s, at: (x, y) => !!(grid[Math.floor(y / s)] || [])[Math.floor(x / s)] };
  const f = Math.min(maxW / C, maxH / R), w = Math.max(1, Math.round(C * f)), h = Math.max(1, Math.round(R * f));
  return { w, h, at: (x, y) => !!(grid[Math.floor((y * R) / h)] || [])[Math.floor((x * C) / w)] };
}

// carve a face grid into the front (+z) of a hollow pumpkin at voxel centre (cx, fy, cz)
function carveFace(v, grid, cx, fy, maxW, maxH, rimTone = -0.2, coreDepth = 2) {
  const g = fitGrid(grid, maxW, maxH);
  const x0 = Math.round(cx - g.w / 2 + 0.5), yTop = Math.round(fy + g.h / 2 - 0.5);
  const cut = new Set();
  for (let gy = 0; gy < g.h; gy++) for (let gx = 0; gx < g.w; gx++) {
    if (!g.at(gx, gy)) continue;
    const x = x0 + gx, y = yTop - gy;
    let z = frontZ(v, x, y), n = 0, ne = 0;
    while (z >= 0 && v.get(x, y, z) && n < 12 && ne < coreDepth) {
      if (v.get(x, y, z) & EMIT) ne++;
      v.set(x, y, z, 0); z--; n++;
    }
    if (n === 12 && z >= 0) v.set(x, y, z, 0xffb43c | EMIT);
    if (n) cut.add(x + ',' + y);
  }
  // darker burnt rim around the cuts
  const done = new Set();
  for (const k of cut) {
    const [x, y] = k.split(',').map(Number);
    for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + ddx, ny = y + ddy, kk = nx + ',' + ny;
      if (cut.has(kk) || done.has(kk)) continue;
      done.add(kk);
      const z = frontZ(v, nx, ny);
      if (z < 0) continue;
      const c = v.get(nx, ny, z);
      if (!(c & FLAGS)) v.set(nx, ny, z, tone(c, rimTone));
    }
  }
}

const JACK_KINDS = { small: [8, 7, 7.5], medium: [11, 9.8, 10.2], big: [13.5, 11.5, 12.5] };
// jackOLantern({ face: name | grid (rows top->bottom of strings '#.' or boolean arrays), kind, seed, color, lit })
// hollow: true keeps a real cavity (nicer when smashed, ~2x faces); false fills it with glow (cheap LOD)
export function jackOLantern({ face = 'classic', kind = 'medium', seed = 3, color = 'orange', lit = true, hollow = true } = {}) {
  const [rx, ry, rz] = JACK_KINDS[kind] || JACK_KINDS.medium;
  const R = rng(seed * 17 + 1);
  const W = Math.ceil(rx * 1.3) * 2 + 5, D = Math.ceil(rz * 1.3) * 2 + 5;
  const v = new Vox(W, Math.ceil(ry * 2.8) + 4, D);
  const cx = (W - 1) / 2, cz = (D - 1) / 2;
  const P = paintPumpkin(v, cx, 0, cz, { rx, ry, rz, ribs: 10, pal: color, seed, lump: 0.025, ribDepth: 0.06, leaf: false, vine: R() < 0.6, stemH: Math.round(ry * 0.5), stemR: rx * 0.12 });
  const pal = PUMPKIN_PALS[color] || PUMPKIN_PALS.orange;
  const cy = ry;
  const inCav = (x, y, z) => {
    const a = (x - cx) / (rx - 2.4), b = (y + 0.5 - cy) / (ry - 2.4), c = (z - cz) / (rz - 2.4);
    return a * a + b * b + c * c <= 1;
  };
  const glow = lit ? 0xffb43c | EMIT : 0x7a4a1e, glow2 = lit ? 0xffd070 | EMIT : 0x8a5a28;
  const flesh = lit ? mixc(pal.flesh, 0xffa030, 0.5) | EMIT : pal.flesh;
  // hollow out, then colour the inner layers (outer skin keeps the rind colour)
  for (let z = 0; z < v.d; z++) for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) if (v.get(x, y, z) && inCav(x, y, z)) v.set(x, y, z, 0);
  const outside = (x, y, z) => !v.get(x, y, z) && !inCav(x, y, z);
  const recol = [];
  for (let z = 0; z < v.d; z++) for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) {
    if (!v.get(x, y, z) || y > P.cy + ry) continue;
    const nb = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    if (nb.some(([a, b, c]) => outside(x + a, y + b, z + c))) continue;
    const g = nb.some(([a, b, c]) => !v.get(x + a, y + b, z + c));
    recol.push([x, y, z, g ? (y < cy - ry * 0.3 ? glow2 : glow) : flesh]);
  }
  for (const [x, y, z, c] of recol) v.set(x, y, z, c);
  if (!hollow) for (let z = 0; z < v.d; z++) for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) if (!v.get(x, y, z) && inCav(x, y, z)) v.set(x, y, z, y < cy - ry * 0.3 ? glow2 : glow);
  // zig-zag lid cut around the stem
  for (let z = 0; z < v.d; z++) for (let x = 0; x < v.w; x++) {
    const dx = (x - cx) / rx, dz = (z - cz) / rz, q = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    const lr = 0.4 + (Math.floor(((a + Math.PI) / TAU) * 14) % 2 ? 0.05 : -0.03);
    if (Math.abs(q - lr) > 0.045) continue;
    const y = topY(v, x, z, Math.round(cy + ry));
    if (y > cy) v.set(x, y, z, pal.deep);
  }
  const grid = parseFace(face);
  carveFace(v, grid, cx, cy + ry * 0.06, Math.floor(rx * 1.4), Math.floor(ry * 1.25), -0.12, hollow ? 99 : 3);
  const lights = lit ? [{ at: [cx, cy - 1, cz], color: L_JACK, radius: kind === 'big' ? 4 : 3 }] : [];
  return finish(v, FINE, { origin: [cx + 0.5, 0, cz + 0.5], radius: rx * FINE, lights, breakable: true, meta: { face: typeof face === 'string' ? face : 'custom', kind } });
}

// place a finished model (same voxel size) so its origin lands at index (cx, by, cz)
function place(v, res, cx, by, cz) {
  const ox = Math.round(cx + 0.5 - res.origin[0]), oy = Math.round(by - res.origin[1]), oz = Math.round(cz + 0.5 - res.origin[2]);
  v.blit(res.vox, ox, oy, oz);
  return [ox, oy, oz];
}

// ============================================================ HARVEST DECOR
// pumpkinStack({ seed, jack }) — three nested pumpkins, optionally a little jack-o'-lantern on top
export function pumpkinStack({ seed = 1, jack = false } = {}) {
  const R = rng(seed * 5 + 11);
  const v = new Vox(41, 72, 41);
  const c = 20;
  const pals = [['orange', 'white', 'amber'], ['red', 'orange', 'white'], ['amber', 'green', 'orange']][seed % 3];
  const tiers = [{ rx: 12.5, ry: 8.5 }, { rx: 9.5, ry: 7 }, { rx: 6.5, ry: 5.5 }];
  let by = 0, px = c, pz = c;
  const lights = [];
  tiers.forEach((t, i) => {
    const last = i === tiers.length - 1;
    if (last && jack) {
      const j = jackOLantern({ kind: 'small', face: ['classic', 'happy', 'cat'][seed % 3], seed: seed + 4 });
      place(v, j, px, by, pz);
      lights.push({ at: [px, by + 6, pz], color: L_JACK, radius: 2.5 });
      return;
    }
    paintPumpkin(v, px, by, pz, { rx: t.rx, ry: t.ry, ribs: 12 - i * 2, pal: pals[i], seed: seed * 3 + i, stem: last, leaf: last, vine: last, lump: 0.03, ribDepth: 0.07, stemH: 4 });
    by = topY(v, Math.round(px), Math.round(pz)) - 1;
    px += Math.round((R() - 0.5) * 3);
    pz += Math.round((R() - 0.5) * 3);
  });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 12.5 * FINE, lights, breakable: true, meta: { jack } });
}

// hayBale({ seed, long }) — square bale, straw streaks along its length, two twisted twine bands
export function hayBale({ seed = 1, long = 18 } = {}) {
  const W = long, H = 9, D = 10;
  const v = new Vox(W + 2, H + 2, D + 2);
  const R = rng(seed * 3 + 1);
  const HAY = [0xc9ad62, 0xd9c077, 0xe8d595, 0xb89a52];
  // straw streaks run along the bale in short segments of a few tones
  const row = (x, y, z) => { const h = vhash(Math.floor((x + vhash(y, z, 1, seed) * 5) / 5), y, z, seed); return HAY[h < 0.25 ? 0 : h < 0.6 ? 1 : h < 0.85 ? 2 : 3]; };
  const end = (y, z) => { const h = vhash(y, z, 3, seed); return h < 0.4 ? 0xb4964e : h < 0.8 ? 0xc6a85e : 0xdcc480; };
  rbox(v, 1, 0, 1, W, H - 1, D, 1.5, (x, y, z) => (x === 1 || x === W ? end(y, z) : y === H - 1 ? tone(row(x, y, z), 0.06) : row(x, y, z)), 1);
  // twine: press a groove into the bale, twisted two-tone cord inside
  for (const tx of [4, W - 3]) {
    const cut = [];
    for (let z = 0; z < v.d; z++) for (let y = 1; y < v.h; y++) {
      if (!v.get(tx, y, z)) continue;
      if (!v.get(tx, y + 1, z) || !v.get(tx, y, z + 1) || !v.get(tx, y, z - 1)) cut.push([y, z]);
    }
    for (const [y, z] of cut) v.set(tx, y, z, 0);
    for (let z = 0; z < v.d; z++) for (let y = 0; y < v.h; y++) {
      if (!v.get(tx, y, z)) continue;
      if (!v.get(tx, y + 1, z) || !v.get(tx, y, z + 1) || !v.get(tx, y, z - 1)) v.set(tx, y, z, (y + z) % 2 ? 0x8a5a30 : 0x6a4224);
    }
  }
  // stray straws
  for (let i = 0; i < 7; i++) {
    const x = 2 + Math.floor(R() * (W - 2)), z = 2 + Math.floor(R() * (D - 2));
    if (x === 4 || x === W - 3) continue;
    v.set(x, H, z, 0xe8d595);
    if (R() < 0.5) v.set(x + (R() < 0.5 ? 1 : -1), H, z, 0xd9c077);
  }
  for (let i = 0; i < 6; i++) v.set(R() < 0.5 ? 0 : W + 1, 2 + Math.floor(R() * (H - 4)), 3 + Math.floor(R() * (D - 4)), 0xe8d595);
  return finish(v, STD, { origin: [(W + 2) / 2, 0, (D + 2) / 2], breakable: true, meta: { stackHeight: H * STD } });
}

// cornBundle({ seed }) — dried corn stalks tied at the waist with a twine bow
export function cornBundle({ seed = 1 } = {}) {
  const v = new Vox(31, 44, 31);
  const c = 15, R = rng(seed * 7 + 2);
  const N = 18;
  const tops = Array.from({ length: N }, () => 30 + Math.floor(R() * 6));
  const cols = [0xd2b060, 0xc09a4c, 0xdcc47c, 0xb08a44, 0xe2cc88];
  const sc = Array.from({ length: N }, () => cols[Math.floor(R() * cols.length)]);
  const rf = (y) => (y <= 10 ? 4.6 - y * 0.18 : y <= 13 ? 2.8 : 2.8 + (y - 13) * 0.17);
  lathe(v, c, c, 0, 36, rf, (x, y, z, a, d, r) => {
    const k = Math.floor(((a + Math.PI) / TAU) * N) % N;
    if (y > tops[k]) return d < r - 1.4 && y <= 28 ? 0x7a5a30 : 0;
    if (d < r - 1.4) return y > 26 ? 0x7a5a30 : 0x8a6a38;
    return y === tops[k] ? tone(sc[k], 0.12) : sc[k];
  });
  // twine band + bow
  lathe(v, c, c, 11, 12, (y) => rf(y) + 0.7, (x, y, z, a, d, r) => (d > r - 1 ? ((x + z) % 2 ? 0x9a4428 : 0x7a321e) : 0));
  const fz = c + 4;
  v.set(c, 11, fz, 0x7a321e); v.set(c, 12, fz, 0x7a321e);
  v.set(c - 1, 12, fz, 0x9a4428); v.set(c - 2, 13, fz - 1, 0x9a4428); v.set(c - 2, 12, fz, 0x9a4428);
  v.set(c + 1, 12, fz, 0x9a4428); v.set(c + 2, 13, fz - 1, 0x9a4428); v.set(c + 2, 12, fz, 0x9a4428);
  v.set(c - 1, 10, fz, 0x7a321e); v.set(c + 1, 9, fz, 0x7a321e);
  // drooping dry leaves
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + R() * 0.4, y0 = 18 + Math.floor(R() * 12);
    const r0 = rf(y0), L = 2 + R() * 2.5, drop = 6 + R() * 6, ca = Math.cos(a), sa = Math.sin(a);
    const col = [0xc8a860, 0xb8985a, 0xd8be78, 0xa88a4a][i % 4];
    const pts = [];
    for (let k = 0; k <= 12; k++) {
      const t = k / 12, out = r0 + Math.sin((t * Math.PI) / 2) * L, up = Math.sin(t * Math.PI) * 1.5 - t * t * drop;
      pts.push([c + ca * out, y0 + up, c + sa * out]);
    }
    polyline(v, pts, col);
    polyline(v, pts.slice(0, 9).map(([x, y, z]) => [x - sa, y, z + ca]), tone(col, -0.12));
  }
  // tassels
  for (let i = 0; i < 9; i++) {
    const a = R() * TAU, rr = R() * 3, x = c + Math.cos(a) * rr, z = c + Math.sin(a) * rr;
    const y0 = topY(v, Math.round(x), Math.round(z));
    if (y0 < 0) continue;
    polyline(v, [[x, y0, z], [x + Math.cos(a) * 1.5, y0 + 3 + R() * 2, z + Math.sin(a) * 1.5]], 0xe8d490);
  }
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.25 });
}

// scarecrow({ seed, crow }) — pumpkin head, plaid shirt, patched jeans, straw hands, floppy hat
export function scarecrow({ seed = 1, crow = true } = {}) {
  const v = new Vox(40, 48, 18);
  const cx = 19.5, cz = 8.5;
  const R = rng(seed * 11 + 3);
  const shirtA = [RED, 0x3a6a8a, 0x5a7a2e][seed % 3], shirtD = tone(shirtA, -0.4);
  const plaid = (x, y, z) => {
    const a = x % 4 === 0, b = (y + z) % 4 === 0;
    return a && b ? tone(shirtD, -0.2) : a || b ? shirtD : shirtA;
  };
  // post
  v.fill(19, 0, 8, 20, 30, 9, (x, y, z) => (y < 2 ? WOOD_D : WOOD));
  // legs with straw tufts at the cuffs
  for (const lx of [15, 21]) {
    rbox(v, lx, 7, 7, lx + 3, 16, 10, 1, (x, y, z) => (y === 7 ? DENIM_D : DENIM), 0);
    for (let x = lx; x <= lx + 3; x++) for (let z = 7; z <= 10; z++) if ((x + z) % 2 === 0 || R() < 0.4) v.set(x, 6 - (R() < 0.4 ? 1 : 0), z, R() < 0.5 ? STRAW : STRAW_L), v.set(x, 6, z, STRAW);
  }
  // patch on the left knee
  v.fill(16, 10, 11, 17, 11, 11, (x, y) => ((x + y) % 2 ? 0xe8781e : 0xc85a1a));
  rbox(v, 15, 15, 7, 24, 18, 10, 1, DENIM, 0);
  // rope belt
  v.fill(15, 18, 6, 24, 18, 11, (x, y, z) => (v.get(x, y, z) || z === 6 || z === 11 || x === 15 || x === 24 ? ((x + z) % 2 ? STRAW_D : 0xa07a3a) : 0));
  // shirt
  rbox(v, 14, 19, 6, 25, 28, 11, 1, plaid, 1);
  for (const y of [21, 24, 27]) v.set(19, y, 12, CREAM), v.set(20, y, 12, CREAM);
  // sleeves (drooping slightly) + straw hands
  for (const s of [-1, 1]) {
    for (let i = 0; i < 11; i++) {
      const x = s < 0 ? 13 - i : 26 + i, yo = i > 6 ? -1 : 0;
      v.fill(x, 23 + yo, 7, x, 26 + yo, 10, i === 10 ? shirtD : plaid);
    }
    const hx = s < 0 ? 2 : 37;
    for (let k = 0; k < 9; k++) {
      const yy = 21 + Math.floor(R() * 6), zz = 7 + Math.floor(R() * 4);
      polyline(v, [[hx + (s < 0 ? 1 : -1), 23.5, 8.5], [hx - s * (R() * 1.5), yy, zz]], k % 2 ? STRAW_L : STRAW);
    }
  }
  // straw ruff at the neck
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * TAU, r = 3.5 + (a % 2);
    v.set(Math.round(cx + Math.cos(t) * r), 29, Math.round(cz + Math.sin(t) * r * 0.8), a % 3 ? STRAW : STRAW_L);
  }
  lathe(v, cx, cz, 29, 29, 3.2, STRAW_D);
  // pumpkin head with a painted face
  paintPumpkin(v, cx, 29, cz, { rx: 5.6, ry: 4.6, rz: 5.2, ribs: 8, pal: 'orange', seed: seed + 2, stem: false, lump: 0.03, ribDepth: 0.08 });
  engrave(v, [
    '.#...#.',
    '###.###',
    '.......',
    '#.....#',
    '.#####.',
  ], cx, 36, 0xffa63a | EMIT);
  // floppy hat
  const hatC = [0x7a5a3a, 0x5a4a6a, 0x6a5a2e][seed % 3];
  lathe(v, cx, cz, 38, 38, 7.5, (x, y, z, a, d) => (d > 6.6 ? tone(hatC, -0.15) : hatC));
  v.set(Math.round(cx + 7), 37, Math.round(cz), tone(hatC, -0.15));
  v.set(Math.round(cx - 6), 37, Math.round(cz + 3), tone(hatC, -0.15));
  lathe(v, (y) => cx + (y > 41 ? 0.6 : 0), cz, 39, 43, (y, t) => 4.2 - t * 1.2, (x, y, z, a, d, r, t) => (y <= 40 ? 0xb8322a : y === 43 ? tone(hatC, 0.12) : hatC));
  // crow buddy on the right arm
  if (crow) {
    const bx = 33, by = 27, bz = 8.5;
    v.ellipsoid(bx, by + 1.5, bz, 1.6, 1.3, 1.2, 0x2a2430);
    v.ellipsoid(bx + 1.2, by + 3, bz, 1, 1, 1, 0x2a2430);
    v.set(bx + 2.4, by + 3, bz, 0xe8a030);
    v.set(bx + 1.4, by + 3.6, bz + 1, 0xfff0c0);
    v.set(bx - 1.8, by + 2, bz, 0x3a3440);
    v.set(bx - 2.6, by + 2.4, bz, 0x3a3440);
  }
  bevel(v, { top: 0.08, bottom: -0.1 });
  return finish(v, STD, { origin: [cx + 0.5, 0, cz + 0.5], radius: 0.3, lights: [{ at: [cx, 34, cz + 6], color: L_JACK, radius: 2 }], meta: { armSpan: 1.95 } });
}

function paintApple(v, x, y, z, r, col, R) {
  v.ellipsoid(x, y, z, r, r * 0.9, r, (xx, yy, zz) => {
    const dy = (yy - y) / r;
    if (dy > 0.75 && Math.hypot(xx - x, zz - z) < 0.8) return 0;
    return dy > 0.35 ? tone(col, 0.14) : dy < -0.45 ? tone(col, -0.16) : col;
  });
  const ty = topY(v, Math.round(x), Math.round(z));
  v.set(Math.round(x), ty + 1, Math.round(z), WOOD_D);
  if (R() < 0.35) v.set(Math.round(x) + 1, ty + 1, Math.round(z), LEAF);
}
const APPLE_COLS = [0xc8302a, 0xb82628, 0xd84a2a, 0xc8302a, 0x8ab83a, 0xe8b830];

function appleHeap(v, x0, x1, z0, z1, yBase, R, layers = 2, r = 2.6) {
  for (let L = 0; L < layers; L++) {
    const yy = yBase + L * r * 1.4;
    const ins = L * r * 0.9;
    for (let z = z0 + r + ins; z <= z1 - r - ins + 0.01; z += r * 1.8)
      for (let x = x0 + r + ins; x <= x1 - r - ins + 0.01; x += r * 1.8) {
        if (L > 0 && R() < 0.3) continue;
        paintApple(v, x + (R() - 0.5) * 1.2, yy + R(), z + (R() - 0.5) * 1.2, r, APPLE_COLS[Math.floor(R() * APPLE_COLS.length)], R);
      }
  }
}

// appleCrate({ seed }) — slatted wooden crate heaped with apples, apple stencil on the front
export function appleCrate({ seed = 1 } = {}) {
  const W = 26, H = 14, D = 18;
  const v = new Vox(W, H + 10, D);
  const R = rng(seed * 9 + 4);
  const plank = (x, y, z) => {
    const corner = (x <= 1 || x >= W - 2) && (z <= 1 || z >= D - 2);
    if (corner) return WOOD_D;
    if (y % 5 === 4) return 0; // gap between slats
    const k = Math.floor(y / 5) + (x <= 1 || x >= W - 2 ? 7 : 0);
    return y % 5 === 3 ? tone(WOOD_L, -0.08) : k % 2 ? WOOD_L : tone(WOOD_L, 0.07);
  };
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const shell = x <= 0 || x >= W - 1 || z <= 0 || z >= D - 1 || y === 0;
    const corner = (x <= 1 || x >= W - 2) && (z <= 1 || z >= D - 2);
    if (!shell && !corner) continue;
    let c = plank(x, y, z);
    if (!c) { if (corner) c = WOOD_D; else if (y > 0) { v.set(x, y, z, 0); continue; } }
    v.set(x, y, z, c);
  }
  // dark inside behind the slat gaps
  v.fill(1, 1, 1, W - 2, H - 4, D - 2, 0x4a3020);
  // stencilled apple
  decal(v, [
    '...#...',
    '.##.##.',
    '#######',
    '#######',
    '.#####.',
    '..#.#..',
  ], W / 2 - 0.5, 10, { '#': 0xa8302a });
  appleHeap(v, 1, W - 2, 1, D - 2, H - 3, R, 2);
  bevel(v, { top: 0.06, bottom: 0, test: (x, y, z, c) => y < H });
  return finish(v, FINE, { breakable: true });
}

// appleBasket({ seed }) — woven basket with a handle, full of apples
export function appleBasket({ seed = 1 } = {}) {
  const v = new Vox(25, 30, 25);
  const c = 12, R = rng(seed * 5 + 9);
  const weaveA = 0xc0904e, weaveB = 0x9a7038;
  lathe(v, c, c, 0, 10, (y, t) => 7 + t * 2.5, (x, y, z, a, d, r) => {
    if (y >= 9) return y === 10 ? 0x8a6232 : 0x7a5630;
    const seg = Math.floor(((a + Math.PI) / TAU) * 18);
    return (seg + (y >> 1)) % 2 ? weaveA : weaveB;
  }, { wall: 1.3, floor: 1 });
  lathe(v, c, c, 9, 10, (y) => 10.2, (x, y, z, a, d, r) => (d > r - 1.2 ? (y === 10 ? 0x8a6232 : 0x7a5630) : 0));
  // handle with wraps
  const pts = [];
  for (let i = 0; i <= 20; i++) { const t = (i / 20) * Math.PI; pts.push([c - Math.cos(t) * 9.6, 10 + Math.sin(t) * 12, c]); }
  pts.forEach((p, i) => { if (i < pts.length - 1) v.line(...p, ...pts[i + 1], i % 3 ? 0x8a6232 : 0x6a4626, 0.75); });
  appleHeap(v, c - 8, c + 8, c - 8, c + 8, 8, R, 2, 2.5);
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], breakable: true });
}

// ================================================================= GRAVEYARD
const GRAVE_STONES = {
  grey: { base: STONE, dark: STONE_D, light: STONE_L, deep: 0x4e4c56 },
  slate: { base: 0x7a8494, dark: 0x5a6272, light: 0x9aa4b2, deep: 0x3e4452 },
  sand: { base: 0xa89a86, dark: 0x847866, light: 0xc4b8a4, deep: 0x5e5446 },
  marble: { base: 0xc8c4cc, dark: 0xa09ca8, light: 0xe4e0e6, deep: 0x7a7684 },
};
// 2D silhouette mask (x,y) -> slab with a 1-voxel bevel; colours: rim dark, face base, top light
function slab(v, x0, y0, z0, z1, mask, pal, w, h) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && mask(x, y);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y + 1);
    const zs = edge ? z0 + 1 : z0, ze = edge ? z1 - 1 : z1;
    for (let z = zs; z <= ze; z++) v.set(x0 + x, y0 + y, z, edge ? pal.dark : pal.base);
  }
}
function mossify(v, seed, amount = 0.5, test) {
  v.paint((x, y, z, c) => {
    if (c & FLAGS) return undefined;
    if (test && !test(x, y, z)) return undefined;
    const up = !v.get(x, y + 1, z);
    const n = vhash(x >> 1, y >> 1, z >> 1, seed);
    if (up && n < amount) return n < amount * 0.25 ? MOSS_L : MOSS;
    if (!up && y < 3 && n < amount * 0.6) return MOSS_D;
    if (!up && vhash(x >> 1, (y + 1) >> 1, z, seed + 1) < amount * 0.18) return MOSS;
    return undefined;
  });
}
function plinth(v, x0, x1, z0, z1, h, pal) {
  rbox(v, x0, 0, z0, x1, h - 1, z1, 1, (x, y, z) => (y === h - 1 ? pal.light : pal.dark), 0);
}

// tombstone({ variant: rounded|cross|obelisk|cracked|leaning|mossy|cute, seed, stone: grey|slate|sand|marble })
export function tombstone({ variant = 'rounded', seed = 1, stone } = {}) {
  const R = rng(seed * 19 + variant.length);
  const pal = GRAVE_STONES[stone || (variant === 'obelisk' ? 'marble' : variant === 'cute' || variant === 'cross' ? ['slate', 'grey'][seed % 2] : ['grey', 'slate', 'sand'][seed % 3])];
  let v = new Vox(26, 34, 12);
  let cxo = 13; // centre x
  if (variant === 'cross') {
    plinth(v, 6, 19, 2, 9, 3, pal);
    const w = 16, h = 22;
    // latin cross with flared ends
    slab(v, 5, 3, 3, 8, (x, y) => (x >= 6 && x <= 9 && y <= 20) || (y === 21 && x >= 5 && x <= 10) || (y >= 13 && y <= 16 && x >= 1 && x <= 14) || ((x === 0 || x === 15) && y >= 12 && y <= 17), pal, w, h);
    relief(v, ['.##.', '#..#', '#..#', '.##.'], 12.5, 19, { '#': [pal.deep, 1] });
  } else if (variant === 'obelisk') {
    plinth(v, 4, 21, 0, 11, 2, pal);
    rbox(v, 6, 2, 2, 19, 4, 9, 1, (x, y) => (y === 4 ? pal.light : pal.base), 0);
    // tapered shaft
    for (let y = 5; y <= 25; y++) {
      const hw = 3.5 - ((y - 5) / 20) * 1.5, cz = 5.5;
      for (let z = Math.round(cz - hw); z <= Math.round(cz + hw); z++) for (let x = Math.round(12.5 - hw); x <= Math.round(12.5 + hw); x++) {
        const e = Math.abs(x - 12.5) >= hw - 0.5 && Math.abs(z - cz) >= hw - 0.5;
        v.set(x, y, z, e ? pal.dark : y === 12 || y === 13 ? pal.dark : pal.base);
      }
    }
    // pyramidion
    for (let y = 26; y <= 29; y++) { const hw = 2 - (y - 26) * 0.6; v.fill(Math.round(12.5 - hw), y, Math.round(5.5 - hw), Math.round(12.5 + hw), y, Math.round(5.5 + hw), pal.light); }
    engrave(v, ['.#.', '###', '.#.'], 12, 20, pal.deep);
  } else {
    // arched headstones (rounded / cracked / leaning / mossy / cute)
    const cute = variant === 'cute';
    const w = cute ? 14 : 16, h = cute ? 16 : 20, ar = w / 2;
    const xo = Math.round(13 - w / 2);
    plinth(v, xo - 1, xo + w, 1, 10, 2, pal);
    const lump = Array.from({ length: w }, () => (R() < 0.25 ? -1 : 0));
    slab(v, xo, 2, 3, cute ? 8 : 7, (x, y) => {
      if (y < h - ar) return true;
      const dx = x - (w - 1) / 2, dy = y - (h - ar);
      return dx * dx + dy * dy <= (ar - 0.3) * (ar - 0.3) + lump[x] * 2;
    }, pal, w, h);
    if (cute) {
      // big-eyed skull + RIP
      relief(v, [
        '.#####.',
        '#######',
        '#oo#oo#',
        '#oo#oo#',
        '###n###',
        '.#####.',
        '.#t#t#.',
      ], 13, 2 + h - 3, { '#': [BONE, 0], o: [0x2e2a38, 1], n: [0x2e2a38, 1], t: [0x4a4656, 0] });
      engrave(v, glyphRows('RIP'), 13, 7, pal.deep);
    } else {
      engrave(v, glyphRows('RIP'), 13, 2 + h - 6, pal.deep);
      // a few lines of "writing"
      for (const [y, a, b] of [[9, 9, 17], [7, 10, 16]]) for (let x = a; x <= b; x++) if (vhash(x, y, 1, seed) < 0.75) { const z = frontZ(v, x, y); v.set(x, y, z, pal.dark); }
    }
    if (variant === 'cracked') {
      // zig-zag crack through the front, a chipped shoulder and a fallen chunk
      let x = xo + 4, y = 2 + h - 1;
      while (y > 4) {
        for (let z = 3; z <= 8; z++) if (z >= 6) v.set(x, y, z, 0); else if (v.get(x, y, z)) v.set(x, y, z, pal.deep);
        y--; if (R() < 0.6) x += R() < 0.55 ? 1 : -1;
      }
      v.carve((x, y, z) => x > xo + w - 5 && y > 2 + h - 5 && x - (xo + w - 5) + (y - (2 + h - 5)) > 3);
      rbox(v, xo + w + 2, 0, 9, xo + w + 4, 1, 11, 0, pal.dark);
      v.set(xo + w + 3, 2, 10, pal.base);
    }
    if (variant === 'mossy' || variant === 'leaning') mossify(v, seed, variant === 'mossy' ? 0.55 : 0.25);
  }
  bevel(v, { top: 0.12, bottom: 0 });
  if (variant === 'leaning') {
    const tilt = R() < 0.5 ? 1 : -1;
    v = shear(v, 0.22 * tilt, -0.12, 2);
    cxo += v.shift[0];
    // soft dirt mound where it has sunk in
    rbox(v, 2, 0, 0, v.w - 3, 0, v.d - 1, 2, (x, y, z) => (v.get(x, y, z) ? undefined : vhash(x, y, z, 3) < 0.5 ? DIRT : DIRT_L));
  }
  if (variant === 'mossy') {
    // grass tufts at the base
    for (let i = 0; i < 8; i++) { const x = 4 + Math.floor(R() * 18), z = R() < 0.5 ? 1 : 10; v.set(x, 0, z, MOSS); v.set(x, 1, z, MOSS_L); }
  }
  return finish(v, STD, { origin: [cxo, 0, 6], meta: { variant } });
}

// coffin({ open, seed }) — classic six-sided coffin; open: lid slid aside, glowing eyes peek out
export function coffin({ open = false, seed = 1 } = {}) {
  const L = 38, H = 7;
  const v = new Vox(24, 14, 44);
  const cx = 11.5;
  const hw = (z) => (z < 27 ? 3.6 + (z / 27) * 2.6 : 6.2 - ((z - 27) / 10) * 2.2);
  const wood = 0x5a3424, woodD = 0x3e2218, woodL = 0x7a4a30, lid = 0x6a3e2a;
  const z0 = 2;
  for (let z = 0; z < L; z++) {
    const w = hw(z);
    for (let y = 0; y < H; y++) for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
      const rim = y === 0 || Math.abs(x - cx) > w - 1 || z === 0 || z === L - 1;
      const inner = !rim && y > 1;
      if (open && inner) continue;
      v.set(x, y, z + z0, y === 0 ? woodD : y === H - 1 ? woodL : y % 3 === 0 ? woodD : wood);
    }
  }
  if (open) {
    // satin lining and a peeking little ghoul
    for (let z = 1; z < L - 1; z++) { const w = hw(z) - 1; for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) v.set(x, 1, z + z0, 0x6a3a8a); }
    for (let z = 1; z < L - 1; z++) { const w = hw(z) - 1; for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) if (Math.abs(x - cx) >= w - 0.5) v.fill(x, 2, z + z0, x, H - 2, z + z0, PURPLE_L); }
    v.fill(Math.round(cx - 3), 2, 31 + z0, Math.round(cx + 3), 4, 35 + z0, 0x2a2232);
    v.set(Math.round(cx - 2), 4, 33 + z0, 0xb8ff6a | EMIT);
    v.set(Math.round(cx + 2), 4, 33 + z0, 0xb8ff6a | EMIT);
    // bony fingers on the rim
    for (let i = 0; i < 4; i++) v.fill(Math.round(cx + 4 - i * 0 ), H - 1, 18 + z0 + i * 2, Math.round(cx + 6), H - 1, 18 + z0 + i * 2, BONE);
  }
  // lid
  const lx = open ? 4 : 0, lz = open ? -3 : 0, ly = H;
  for (let z = 0; z < L; z++) {
    const w = hw(z) + 0.3;
    for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
      const edge = Math.abs(x - cx) > w - 1.2 || z === 0 || z === L - 1;
      const yy = ly + (open ? Math.floor((z / L) * 2) : 0);
      v.set(x + lx, yy, z + z0 + lz, edge ? woodL : lid);
      if (!edge) v.set(x + lx, yy + 1, z + z0 + lz, Math.abs(x - cx) < w - 2.2 && z > 1 && z < L - 2 ? lid : 0);
    }
  }
  // brass cross on the lid
  const ly2 = ly + 2 + (open ? 1 : 0);
  for (let z = 14; z <= 30; z++) v.set(Math.round(cx) + lx, ly2, z + z0 + lz, GOLD);
  for (let x = -3; x <= 3; x++) v.set(Math.round(cx) + x + lx, ly2, 25 + z0 + lz, GOLD);
  // handles
  for (const z of [10, 20, 30]) for (const s of [-1, 1]) { const x = Math.round(cx + s * (hw(z) + 1)); v.set(x, 3, z + z0, GOLD_D); v.set(x, 3, z + z0 + 1, GOLD_D); }
  bevel(v, { top: 0.06, bottom: 0 });
  const lights = open ? [{ at: [cx, 4, 33 + z0], color: [0.6, 1.0, 0.4], radius: 1.5 }] : [];
  return finish(v, STD, { origin: [cx + 0.5, 0, z0 + L / 2], radius: 0.45, lights, meta: { open } });
}

// ironFence({ seed, endPost }) — 2 m segment along x, post on the left end so segments tile
export function ironFence({ seed = 1, endPost = false, length = 40 } = {}) {
  const v = new Vox(length + 3, 26, 5);
  const z = 2, R = rng(seed);
  const iron = (x, y) => (vhash(x, y, 0, seed) < 0.04 ? RUST : IRON);
  const post = (x0) => {
    v.fill(x0, 0, z - 1, x0 + 2, 21, z + 1, (x, y) => (y === 0 ? IRON_L : iron(x, y)));
    v.fill(x0, 22, z - 1, x0 + 2, 22, z + 1, IRON_L);
    v.ellipsoid(x0 + 1, 24, z, 1.4, 1.4, 1.4, IRON_L);
  };
  post(0);
  if (endPost) post(length);
  // rails
  v.fill(2, 3, z, length - (endPost ? 0 : 1), 3, z, IRON_L);
  v.fill(2, 16, z, length - (endPost ? 0 : 1), 16, z, IRON_L);
  v.fill(2, 4, z, length - (endPost ? 0 : 1), 4, z, IRON);
  // bars with spear tips, curls between the bars near the top
  for (let x = 4; x < length - (endPost ? 0 : 1); x += 3) {
    const tip = 19 + ((x / 3) % 2 === 0 ? 1 : 0);
    v.fill(x, 1, z, x, tip, z, iron);
    v.fill(x - 1, tip - 1, z, x + 1, tip - 1, z, IRON_L);
    v.set(x, tip + 1, z, IRON_L);
    if (((x - 4) / 3) % 2 === 0 && x + 3 < length) {
      v.set(x + 1, 13, z, IRON); v.set(x + 2, 13, z, IRON); v.set(x + 1, 12, z, IRON); v.set(x + 2, 14, z, IRON);
    }
  }
  return finish(v, STD, { origin: [0, 0, z + 0.5], radius: 0.1, meta: { length: length * STD, mount: 'left-end', tile: length * STD } });
}

// woodenCross({ seed }) — crooked grave marker made of two weathered planks
export function woodenCross({ seed = 1 } = {}) {
  let v = new Vox(16, 26, 8);
  const R = rng(seed * 3 + 7);
  const plank = (x, y, z) => (vhash(x, y >> 2, z, seed) < 0.3 ? GREYWOOD_D : (x + (y >> 3)) % 3 === 0 ? GREYWOOD_L : GREYWOOD);
  rbox(v, 6, 0, 3, 8, 21, 4, 0, plank);
  rbox(v, 1, 14, 3, 13, 16, 4, 0, plank, 0);
  v.set(13, 16, 3, 0); v.set(13, 16, 4, 0); v.set(1, 14, 4, 0); // broken plank ends
  v.set(7, 15, 5, IRON_L); v.set(7, 21, 2, 0);
  // little wreath of autumn leaves hung on the cross
  torus(v, 7, 15, 5.3, 1.5, 0.6, (x, y, z, a) => [0xc8401e, 0xe8781e, 0xd8a032, 0x7a8a2e][Math.floor(((a + Math.PI) / TAU) * 8) % 4], 'z');
  bevel(v, { top: 0.12, bottom: 0 });
  v = shear(v, R() < 0.5 ? 0.16 : -0.16, 0.06, 0);
  // dirt mound
  const mx = (v.w - 1) / 2;
  v.ellipsoid(mx, -0.5, (v.d - 1) / 2, 5.5, 2.2, 3.5, (x, y, z) => (v.get(x, y, z) ? undefined : vhash(x, y, z, 5) < 0.3 ? DIRT_D : y >= 1 ? DIRT_L : DIRT));
  for (let i = 0; i < 4; i++) { const x = Math.round(mx - 4 + R() * 8), z = Math.round(R() * (v.d - 1)); const y = topY(v, x, z); if (y >= 0 && y < 3) v.set(x, y + 1, z, MOSS); }
  return finish(v, STD, { radius: 0.15 });
}

// ghostPost({ seed }) — friendly sheet ghost on a garden stake
export function ghostPost({ seed = 1 } = {}) {
  const v = new Vox(20, 34, 18);
  const cx = 9.5, cz = 8.5;
  const R = rng(seed * 7 + 1);
  const sheet = 0xf2ece0, fold = 0xe0dee8, foldD = 0xcacbd8;
  v.fill(9, 0, 8, 10, 14, 9, (x, y) => (y < 2 ? WOOD_D : WOOD));
  // draped body: lathe with a wavy hem; folds as vertical colour bands
  lathe(v, cx, cz, 12, 26, (y, t) => 6.4 - t * 2.2, (x, y, z, a, d, r, t) => {
    const hem = 12 + (Math.sin(a * 5 + seed) > 0.3 ? 1 : 0) + (Math.sin(a * 3) > 0.6 ? 1 : 0);
    if (y < hem) return 0;
    if (d < r - 1.3 && y < 22) return 0;
    const f = Math.cos(a * 4 + seed);
    return f > 0.88 ? fold : f < -0.93 ? foldD : sheet;
  });
  // head
  v.ellipsoid(cx, 27, cz, 5, 5, 4.6, (x, y, z) => (y < 25 ? undefined : sheet));
  v.ellipsoid(cx, 26.5, cz, 5, 4.6, 4.8, sheet);
  // little arms
  v.ellipsoid(cx - 6, 21, cz + 1, 1.6, 1.1, 1.1, sheet);
  v.ellipsoid(cx + 6, 22, cz + 1, 1.6, 1.1, 1.1, sheet);
  // face
  const fz = (x, y) => frontZ(v, x, y);
  for (const [x, y] of [[8, 26], [8, 27], [11, 26], [11, 27]]) v.set(x, y, fz(x, y), INK);
  for (const [x, y] of [[9, 24], [10, 24]]) { const z = fz(x, y); v.set(x, y, z, 0); v.set(x, y, z - 1, 0x3a2a3a); }
  for (const [x, y] of [[6, 25], [13, 25]]) v.set(x, y, fz(x, y), 0xf4a8b8);
  bevel(v, { top: 0.04, bottom: -0.1 });
  return finish(v, STD, { origin: [cx + 0.5, 0, cz + 0.5], radius: 0.25 });
}

// gargoyle({ seed, mossy }) — chubby, big-headed stone gargoyle hugging its knees on a plinth
export function gargoyle({ seed = 1, mossy = true } = {}) {
  const v = new Vox(44, 44, 36);
  const cx = 21.5, cz = 16.5;
  const pal = { base: 0x9a98a2, dark: 0x6e6c78, light: 0xbab8c2, deep: 0x4a4854 };
  const st = pal.base;
  const R = rng(seed * 3 + 2);
  // plinth with a moulded top
  rbox(v, 7, 0, 3, 36, 5, 30, 1, (x, y) => (y === 0 ? pal.deep : pal.dark), 0);
  rbox(v, 6, 6, 2, 37, 7, 31, 1, (x, y) => (y === 7 ? tone(pal.dark, 0.1) : pal.dark), 0);
  // body, belly, haunches
  v.ellipsoid(cx, 16, cz - 1, 8, 8.5, 7.5, st);
  v.ellipsoid(cx, 14, cz + 3.5, 5.5, 5.5, 4, mixc(st, pal.light, 0.5));
  for (const s of [-1, 1]) {
    v.ellipsoid(cx + s * 5.5, 12, cz + 3, 3.6, 4, 5, st); // knees
    v.ellipsoid(cx + s * 5, 9.5, cz + 8, 3, 2, 3.5, st); // feet
    for (let k = -1; k <= 1; k++) v.set(Math.round(cx + s * 5 + k * 1.4), 8, Math.round(cz + 11.3), pal.deep);
    v.ellipsoid(cx + s * 4, 15, cz + 6.5, 1.8, 3.2, 1.8, pal.base); // little arms hugging knees
  }
  // big round head
  v.ellipsoid(cx, 30, cz + 1, 9.5, 8.5, 8.5, st);
  // brow ridge
  for (let x = -6; x <= 6; x++) { const y = 33 + (Math.abs(x) > 3 ? 1 : 0); const z = frontZ(v, Math.round(cx + x), y); if (z > 0) v.set(Math.round(cx + x), y, z + 1, pal.dark); }
  // eyes: deep sockets with glowing pupils
  for (const s of [-1, 1]) {
    const ex = cx + s * 3.6;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (Math.abs(dx) + Math.abs(dy) === 2 && !(dy === 1)) continue;
      const x = Math.round(ex + dx), y = 31 + dy, z = frontZ(v, x, y);
      v.set(x, y, z, 0); v.set(x, y, z - 1, dx === 0 && dy === 0 ? 0xffd070 | EMIT : 0x3a3844);
    }
  }
  // snout with nostrils and a toothy grin
  v.ellipsoid(cx, 27, cz + 8.5, 4.6, 3, 2.6, pal.light);
  v.set(Math.round(cx - 1.5), 28, frontZ(v, Math.round(cx - 1.5), 28), pal.deep);
  v.set(Math.round(cx + 1.5), 28, frontZ(v, Math.round(cx + 1.5), 28), pal.deep);
  for (let x = -4; x <= 4; x++) { const y = 24 + (Math.abs(x) >= 3 ? 1 : 0), xx = Math.round(cx + x); v.set(xx, y, frontZ(v, xx, y), pal.deep); }
  for (const s of [-1, 1]) { const xx = Math.round(cx + s * 2); v.set(xx, 23, frontZ(v, xx, 24), BONE_D); }
  // horns and pointed ears
  for (const s of [-1, 1]) {
    polyline(v, [[cx + s * 4, 37, cz], [cx + s * 6, 40, cz - 1], [cx + s * 6.5, 42, cz - 3]], pal.light, 1);
    v.set(Math.round(cx + s * 6.5), 43, Math.round(cz - 3.5), pal.light);
    polyline(v, [[cx + s * 8.5, 31, cz], [cx + s * 12, 34, cz - 1], [cx + s * 13.5, 36, cz - 1.5]], st, 1.1);
  }
  // folded bat wings behind the shoulders, scalloped edges with finger bones
  for (const s of [-1, 1]) for (let i = 0; i <= 12; i++) {
    const y = 12 + i, reach = 3 + i * 0.75;
    for (let k = 0; k <= reach; k++) {
      const x = Math.round(cx + s * (6 + k)), z = Math.round(cz - 6 - k * 0.15);
      if (i < 3 && k > reach - 2 - (k % 3)) continue;
      const bone = k % 3 === 0 && i > 2;
      v.set(x, y, z, bone ? pal.dark : st);
      v.set(x, y, z - 1, pal.dark);
    }
  }
  // curly tail with an arrow tip draped over the plinth
  polyline(v, [[cx + 3, 9, cz - 7], [cx + 9, 9, cz - 9], [cx + 13, 9, cz - 5], [cx + 13, 9, cz + 1], [cx + 11, 9, cz + 4]], st, 1);
  v.fill(Math.round(cx + 10), 9, Math.round(cz + 5), Math.round(cx + 12), 9, Math.round(cz + 6), pal.dark);
  if (mossy) mossify(v, seed + 4, 0.12, (x, y, z) => y > 7);
  bevel(v, { top: 0.06, bottom: -0.08 });
  return finish(v, FINE, { origin: [cx + 0.5, 0, cz + 0.5], lights: [{ at: [cx, 31, cz + 7], color: [1.0, 0.8, 0.4], radius: 1.2 }] });
}

// ============================================================ HALLOWEEN DECOR
// piecewise-linear radius profile: pts = [[y, r], ...]
const profile = (pts) => (y) => {
  if (y <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (y <= pts[i][0]) { const [y0, r0] = pts[i - 1], [y1, r1] = pts[i]; return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0); }
  return pts[pts.length - 1][1];
};
function logPiece(v, x0, y, z0, len, r, axis, R) {
  const bark = 0x5a3a24, barkD = 0x40281a, endc = 0xc89a62;
  v.cylinder(x0, y, z0, r, len, (x, yy, z) => {
    const t = axis === 'x' ? x - x0 : axis === 'z' ? z - z0 : yy - y;
    if (t === 0 || t === len - 1) return Math.hypot(axis === 'x' ? yy - y : x - x0, axis === 'z' ? yy - y : z - z0) < r - 0.9 ? endc : 0x9a6a3e;
    return vhash(t >> 1, yy, 0, 3) < 0.3 ? barkD : bark;
  }, axis);
}

// cauldron({ fire, seed }) — iron pot on stubby legs, glowing green brew with bubbles and drips
export function cauldron({ fire = true, seed = 1 } = {}) {
  const v = new Vox(37, 34, 37);
  const c = 18, cy = 15, R = rng(seed * 3 + 1);
  const rim = 22;
  const brew = 0x5ed844 | EMIT, brewL = 0x9cf06a | EMIT, bub = 0xd0ff9a | EMIT;
  v.ellipsoid(c, cy, c, 12, 10.5, 12, (x, y, z) => (y > rim ? 0 : IRON));
  // hollow, then fill with brew up to just below the rim
  v.carve((x, y, z) => y > cy - 6 && ((x - c) / 10) ** 2 + ((y - cy) / 8.6) ** 2 + ((z - c) / 10) ** 2 <= 1 && y > 20);
  v.ellipsoid(c, cy, c, 10, 8.6, 10, (x, y, z) => (y > 20 ? 0 : y === 20 ? brewL : brew));
  torus(v, c, rim, c, 9.8, 1.5, (x, y, z) => (y >= rim ? IRON_L : IRON), 'y');
  // band around the belly
  lathe(v, c, c, 15, 15, 12.4, (x, y, z, a, d, r) => (d > r - 1 ? IRON_L : 0));
  // bubbles on the surface
  for (let i = 0; i < 7; i++) {
    const a = R() * TAU, rr = R() * 7, x = c + Math.cos(a) * rr, z = c + Math.sin(a) * rr, br = 0.9 + R() * 1.3;
    v.ellipsoid(x, 20.5, z, br, br, br, (xx, yy, zz) => (yy > 20 ? (yy > 20 + br * 0.6 ? bub : brewL) : undefined));
  }
  // drips over the lip
  for (let i = 0; i < 4; i++) {
    const a = R() * TAU, len = 2 + Math.floor(R() * 5);
    for (let k = 0; k <= len; k++) {
      const y = rim - k, r = 12 * Math.sqrt(Math.max(0, 1 - ((y - cy) / 10.5) ** 2)) + 0.6 + (k === 0 ? 0.6 : 0);
      v.set(Math.round(c + Math.cos(a) * r), y, Math.round(c + Math.sin(a) * r), k === len ? bub : brew);
    }
  }
  // handles
  for (const s of [-1, 1]) torus(v, c + s * 12.4, 18.5, c, 2, 0.6, IRON_L, 'x');
  // legs
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU + Math.PI / 2; lathe(v, Math.round(c + Math.cos(a) * 8), Math.round(c + Math.sin(a) * 8), 0, 6, (y, t) => 1.8 - t * 0.5, (x, y) => (y === 0 ? IRON_L : IRON)); }
  const lights = [{ at: [c, 23, c], color: L_BREW, radius: 3.5 }];
  if (fire) {
    logPiece(v, c - 9, 1, c - 2, 19, 1.5, 'x', R);
    logPiece(v, c + 2, 2.5, c - 9, 19, 1.4, 'z', R);
    for (const [dx, dz, h] of [[-3, 1, 4], [3, -2, 5], [0, 3, 3], [-2, -4, 3], [4, 3, 3]]) flame(v, c + dx, 3, c + dz, h, 1.4, 0.2);
    lights.push({ at: [c, 3, c], color: [1.0, 0.55, 0.2], radius: 3 });
  }
  bevel(v, { top: 0.1, bottom: 0 });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.32, lights, breakable: false, meta: { fire } });
}

// paints a witch hat whose brim centre sits at (cx, by, cz); s scales it
function paintWitchHat(v, cx, by, cz, s = 1, { hat = 0x3e2c52, band = ORANGE, buckle = GOLD } = {}) {
  const brimR = 11 * s, h = Math.round(22 * s), r0 = 5.8 * s;
  lathe(v, cx, cz, by, by, brimR, (x, y, z, a, d) => (d > brimR - 1 ? tone(hat, -0.2) : hat));
  lathe(v, cx, cz, by + 1, by + 1, brimR, (x, y, z, a, d) => (d > brimR - 1.6 && Math.sin(a * 2 + 0.7) > 0.35 ? tone(hat, -0.12) : 0));
  const off = (y, t) => cx + (t > 0.45 ? ((t - 0.45) / 0.55) ** 2 * 5 * s : 0);
  lathe(v, off, cz, by + 1, by + h, (y, t) => Math.max(0.5, r0 * (1 - t) ** 0.9), (x, y, z, a, d, r, t) => (t > 0.8 ? tone(hat, 0.1) : hat));
  // curled tip
  const tx = cx + 5 * s, ty = by + h;
  polyline(v, [[tx, ty, cz], [tx + 1.5 * s, ty - 0.5, cz], [tx + 2.2 * s, ty - 2 * s, cz]], tone(hat, 0.1), s > 0.6 ? 0.5 : 0);
  // band and buckle
  const bh = Math.max(1, Math.round(2 * s));
  lathe(v, cx, cz, by + 1, by + bh, r0 + 0.5, (x, y, z, a, d, r) => (d > r - 1.2 ? band : 0));
  if (s >= 0.6) {
    const bz = Math.round(cz + r0 + 0.6), bw = Math.round(1.6 * s);
    for (let x = -bw; x <= bw; x++) for (let y = 0; y <= bh + 1; y++) {
      const edge = Math.abs(x) === bw || y === 0 || y === bh + 1;
      if (edge) v.set(Math.round(cx) + x, by + y, bz, buckle);
    }
  }
  return { top: [tx + 2.2 * s, ty, cz] };
}
// witchHat({ band, seed }) — tall bent purple-black hat with an orange band and gold buckle
export function witchHat({ band = ORANGE, seed = 1 } = {}) {
  const v = new Vox(30, 26, 26);
  paintWitchHat(v, 12, 0, 12, 1, { band });
  // a little stitched patch
  v.fill(10, 9, frontZ(v, 10, 9), 11, 10, frontZ(v, 10, 9), PURPLE_L);
  bevel(v, { top: 0.08, bottom: -0.05 });
  return finish(v, FINE, { origin: [12.5, 0, 12.5], radius: 0.27 });
}

// broom({ seed }) — crooked handle with a tied straw bristle bundle (stands upright)
export function broom({ seed = 1 } = {}) {
  const v = new Vox(16, 56, 16);
  const c = 7.5, R = rng(seed);
  const pts = [[c, 10, c], [c + 0.5, 22, c], [c - 0.3, 34, c + 0.5], [c + 0.6, 46, c], [c + 1.5, 54, c - 0.5]];
  polyline(v, pts, (x, y, z) => (vhash(0, y >> 1, 0, seed) < 0.15 ? WOOD_D : WOOD), 0.75);
  lathe(v, c, c, 0, 15, (y, t) => 1.6 + 5 * (1 - t) ** 0.7, (x, y, z, a, d, r) => {
    const k = Math.floor(((a + Math.PI) / TAU) * 20);
    if (y === 0 && k % 3 === 0) return 0;
    return [STRAW, STRAW_D, STRAW_L, 0xc8a050][k % 4];
  });
  for (const y of [11, 14]) lathe(v, c, c, y, y, (yy) => 1.6 + 5 * (1 - yy / 15) ** 0.7 + 0.6, (x, yy, z, a, d, r) => (d > r - 1.2 ? 0x8a3c22 : 0));
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.15 });
}

// candleCluster({ seed, count }) — candles of different heights with drips on a pewter dish
export function candleCluster({ seed = 1, count = 4 } = {}) {
  const v = new Vox(22, 26, 22);
  const c = 10.5, R = rng(seed * 7 + 3);
  lathe(v, c, c, 0, 0, 9.5, (x, y, z, a, d) => (d > 8.6 ? 0x7a7680 : 0x5a5662));
  lathe(v, c, c, 1, 1, 9.5, (x, y, z, a, d) => (d > 8.6 ? 0x8a8690 : 0));
  const waxes = [0xf2e6c8, 0xe8d8b0, 0x9a6ab8, 0xe8883a, 0xf2e6c8];
  const spots = [[-3.5, -2], [3, -3], [0, 3.5], [-4, 3], [4.5, 2.5]];
  const flames = [];
  for (let i = 0; i < Math.min(count, 5); i++) {
    const [dx, dz] = spots[i];
    const x = c + dx, z = c + dz, rr = 1.4 + R() * 1, h = 5 + Math.floor(R() * 11) + (i === 0 ? 4 : 0);
    const wax = waxes[(i + seed) % waxes.length];
    v.ellipsoid(x, 1, z, rr + 1.4, 0.6, rr + 1.4, wax); // puddle
    lathe(v, x, z, 1, h, rr, (xx, yy, zz) => (yy === h ? tone(wax, 0.08) : wax));
    // drips running down from the lip
    for (let k = 0; k < 3; k++) {
      const a = R() * TAU, len = 1 + Math.floor(R() * Math.min(5, h - 2));
      for (let j = 0; j <= len; j++) v.set(Math.round(x + Math.cos(a) * (rr + 0.7)), h - j, Math.round(z + Math.sin(a) * (rr + 0.7)), tone(wax, 0.05));
    }
    const wx = Math.round(x), wz = Math.round(z);
    v.set(wx, h + 1, wz, INK);
    candleFlame(v, wx, h + 2, wz);
    flames.push([wx, h + 3, wz]);
  }
  bevel(v, { top: 0.06, bottom: 0 });
  const avg = flames.reduce((a, p) => [a[0] + p[0] / flames.length, a[1] + p[1] / flames.length, a[2] + p[2] / flames.length], [0, 0, 0]);
  const res = finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.22, lights: [{ at: avg, color: L_CANDLE, radius: 2.5 }] });
  res.meta.flames = flames.map((p) => toMetres(res, p, [c + 0.5, 0, c + 0.5]));
  return res;
}

function paintSkull(v, cx, by, cz, r = 5.5) {
  const cy = by + r;
  v.ellipsoid(cx, cy, cz, r * 1.08, r, r, (x, y, z) => (y < cy - r * 0.45 && Math.abs(x - cx) > r * 0.6 ? 0 : y > cy + r * 0.5 ? BONE_L : BONE));
  // jaw
  rbox(v, Math.round(cx - r * 0.55), by - 1, Math.round(cz - r * 0.2), Math.round(cx + r * 0.55), Math.round(by + 1), Math.round(cz + r * 0.8), 1, BONE_D, 0);
  // eye sockets
  for (const s of [-1, 1]) {
    const ex = cx + s * r * 0.42, ey = cy - r * 0.05;
    for (let dy = -1.5; dy <= 1.5; dy++) for (let dx = -1.5; dx <= 1.5; dx++) {
      if (dx * dx + dy * dy > 2.6) continue;
      const x = Math.round(ex + dx), y = Math.round(ey + dy), z = frontZ(v, x, y);
      if (z < 0) continue;
      v.set(x, y, z, 0); v.set(x, y, z - 1, 0x2e2430);
    }
    v.set(Math.round(ex + 0.5), Math.round(ey + 1), frontZ(v, Math.round(ex + 0.5), Math.round(ey + 1)) - 1 + 1 - 0, undefined);
  }
  // nose
  for (const [dx, dy] of [[0, 0], [-1, 1], [0, 1]]) { const x = Math.round(cx + dx + 0.5) - 1 + (dx === 0 ? 1 : 0), y = Math.round(cy - r * 0.45 + dy), z = frontZ(v, x, y); if (z >= 0) v.set(x, y, z, 0x5a4a40); }
  // teeth
  for (let x = Math.round(cx - r * 0.45); x <= Math.round(cx + r * 0.45); x++) { const y = by + 1, z = frontZ(v, x, y); if (z >= 0) v.set(x, y, z, x % 2 ? BONE_L : 0x8a7c66); }
  return { top: by + 2 * r };
}

// skeletonBobblehead({ part: 'all'|'head'|'body', seed }) — big wobbly skull on a spring over a tiny skeleton
export function skeletonBobblehead({ part = 'all', seed = 1 } = {}) {
  const v = new Vox(20, 30, 20);
  const c = 9.5;
  const springTop = 12;
  if (part !== 'head') {
    lathe(v, c, c, 0, 1, 5.5, (x, y, z, a, d) => (y === 1 && d < 4.8 ? 0x4a2e5a : 0x2e1e3a));
    v.fill(8, 1, 15, 11, 1, 15, GOLD);
    // tiny skeleton: legs, pelvis, ribcage, arms
    for (const s of [-1, 1]) { v.fill(Math.round(c + s * 1.5), 2, 10, Math.round(c + s * 1.5), 4, 10, BONE); v.set(Math.round(c + s * 1.5), 2, 11, BONE); }
    v.fill(8, 5, 9, 11, 5, 10, BONE_D);
    v.fill(9, 6, 9, 10, 6, 9, BONE);
    v.ellipsoid(c, 8.5, c, 2.6, 2, 1.8, (x, y, z) => (y === 8 && z > c ? 0x3a2e3a : BONE));
    v.set(9, 7, 11, 0x3a2e3a); v.set(10, 7, 11, 0x3a2e3a);
    polyline(v, [[c - 2.6, 9.5, c], [c - 4, 7.5, c + 1], [c - 4.5, 6, c + 1.5]], BONE);
    polyline(v, [[c + 2.6, 9.5, c], [c + 4, 11, c + 1], [c + 4.5, 12.5, c + 1]], BONE); // waving
    v.set(Math.round(c + 4.5), 13, Math.round(c + 1), BONE_L);
    // spring
    const pts = [];
    for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * 3 * TAU; pts.push([c + Math.cos(a) * 1.2, 10.5 + t * (springTop - 10.5), c + Math.sin(a) * 1.2]); }
    polyline(v, pts, METAL_L);
  }
  if (part !== 'body') {
    paintSkull(v, c, springTop + 2, c, 5.6);
    // rosy cheeks for extra cuteness
    for (const s of [-1, 1]) { const x = Math.round(c + s * 3.6), y = springTop + 5, z = frontZ(v, x, y); if (z >= 0) v.set(x, y, z, 0xf2a4a8); }
  }
  bevel(v, { top: 0.04, bottom: -0.06 });
  const pre = part === 'head' ? [c + 0.5, springTop + 1, c + 0.5] : [c + 0.5, 0, c + 0.5];
  const res = finish(v, FINE, { origin: pre, radius: 0.15, meta: { part } });
  res.meta.headPivot = [0, r3((springTop + 1) * FINE), 0];
  return res;
}

// hangingBat({ wings: 'folded'|'spread', seed }) — upside-down bat clinging to a twig; origin at the twig (hang point)
export function hangingBat({ wings = 'folded', seed = 1 } = {}) {
  const v = new Vox(30, 20, 14);
  const c = 14.5, cz = 6.5, top = 17;
  const fur = 0x3a2e46, furL = 0x4c3e5a, mem = 0x55406a, memD = 0x3a2a4a;
  v.fill(8, top + 1, 6, 21, top + 1, 7, WOOD_D);
  v.set(8, top + 2, 6, WOOD); v.set(20, top, 7, LEAF_D);
  for (const s of [-1, 1]) { v.set(Math.round(c + s), top, Math.round(cz), 0x2a2030); v.set(Math.round(c + s), top - 1, Math.round(cz), 0x2a2030); }
  v.ellipsoid(c, top - 6, cz, 3, 4.2, 2.8, (x, y) => (y > top - 4 ? furL : fur));
  if (wings === 'folded') {
    v.ellipsoid(c, top - 5.5, cz + 0.5, 4, 4.8, 3.4, (x, y, z) => (v.get(x, y, z) ? undefined : z < cz - 1 ? undefined : Math.round(x - c) % 2 === 0 ? memD : mem));
  } else {
    for (const s of [-1, 1]) for (let k = 0; k <= 11; k++) {
      const span = 7 - Math.abs(k - 4) * 0.6 - (k % 3 === 2 ? 1.5 : 0);
      for (let j = 0; j <= span; j++) v.set(Math.round(c + s * (3 + k)), Math.round(top - 2 - j), Math.round(cz), k % 3 === 0 ? memD : mem);
    }
  }
  // head at the bottom (upside down)
  const hy = top - 12;
  v.ellipsoid(c, hy, cz + 0.5, 2.8, 2.5, 2.5, fur);
  for (const s of [-1, 1]) { v.set(Math.round(c + s * 1.8), hy - 3, Math.round(cz), fur); v.set(Math.round(c + s * 2), hy - 4, Math.round(cz), furL); v.set(Math.round(c + s * 1.4), hy - 3, Math.round(cz + 1), PINK_D); }
  const fz = Math.round(cz + 3);
  v.set(Math.round(c - 1), hy, fz, 0xffd060 | EMIT); v.set(Math.round(c + 1), hy, fz, 0xffd060 | EMIT);
  v.set(Math.round(c - 1), hy + 1, fz - 1 + 0, undefined);
  v.set(Math.round(c), hy + 1, fz, BONE_L);
  v.set(Math.round(c), hy - 1, fz - 1, PINK_D);
  bevel(v, { top: 0.06, bottom: -0.06 });
  const res = finish(v, FINE, { origin: [c + 0.5, top + 2, cz + 0.5], radius: 0.1, meta: { mount: 'hang', wings } });
  res.meta.height = res.meta.box[1];
  return res;
}

// blackCatStatue({ seed }) — sitting black cat with glowing eyes, collar and bell, on a plinth
export function blackCatStatue({ seed = 1, collar = ORANGE } = {}) {
  const v = new Vox(22, 30, 20);
  const c = 10.5, cz = 9.5;
  const fur = BLACKCAT, furL = BLACKCAT_L;
  rbox(v, 2, 0, 1, 19, 3, 18, 1, (x, y) => (y === 3 ? 0x6e6a78 : 0x4e4a58), 0);
  v.ellipsoid(c, 9.5, cz - 1, 4.6, 6, 4.6, fur);
  for (const s of [-1, 1]) v.ellipsoid(c + s * 3.2, 7, cz - 1.5, 2.4, 3.4, 3.6, fur);
  for (const s of [-1, 1]) v.ellipsoid(c + s * 1.6, 4.6, cz + 3.4, 1.4, 1.2, 2, furL);
  // tail curling round the front
  polyline(v, [[c + 3, 5, cz - 5], [c + 6.5, 4.5, cz - 2], [c + 6, 4.5, cz + 3], [c + 3.5, 4.5, cz + 5.5], [c + 1, 5, cz + 6]], fur, 0.9);
  // head and ears
  v.ellipsoid(c, 18.5, cz + 0.5, 4.8, 4.2, 4.2, (x, y) => (y > 21 ? furL : fur));
  for (const s of [-1, 1]) {
    lathe(v, c + s * 2.6, cz, 21, 25, (y, t) => 1.9 * (1 - t) + 0.2, (x, y, z) => (z > cz + 0.6 && y >= 22 && y <= 23 && Math.abs(x - (c + s * 2.6)) < 0.8 ? PINK_D : fur));
  }
  // collar + bell
  lathe(v, c, cz - 0.5, 14, 14, 4.2, (x, y, z, a, d, r) => (d > r - 1.1 ? collar : 0));
  v.fill(10, 12, 15, 11, 13, 15, GOLD);
  // face
  const eye = 0xc8f04a | EMIT;
  for (const s of [-1, 1]) {
    const ex = Math.round(c + s * 1.9 + (s > 0 ? 0 : 0));
    for (const [dx, dy] of [[0, 0], [0, 1], [s, 0], [s, 1]]) { const x = ex + dx, y = 18 + dy; v.set(x, y, frontZ(v, x, y), eye); }
    const px = ex + (s > 0 ? 0 : 0); v.set(px, 18, frontZ(v, px, 18), 0x1e1418); v.set(px, 19, frontZ(v, px, 19), 0x1e1418);
    for (let k = 1; k <= 3; k++) v.set(Math.round(c + s * (4 + k)), 16 + (k === 3 ? 1 : 0), Math.round(cz + 3), 0x8a8494);
  }
  v.set(10, 17, frontZ(v, 10, 17) + 1, PINK); v.set(11, 17, frontZ(v, 11, 17) + 1, PINK);
  bevel(v, { top: 0.06, bottom: -0.04 });
  return finish(v, FINE, { origin: [c + 0.5, 0, cz + 0.5], radius: 0.22, lights: [{ at: [c, 18.5, cz + 5], color: [0.75, 1.0, 0.35], radius: 1 }] });
}

const CANDY_COLS = [[0xd83a3a, 0xfff0e0], [0x8a4ab8, 0xf2d24a], [0x3aa85a, 0xfff0e0], [0xf08a24, 0x2e2232], [0x3a7ad8, 0xfff0e0], [0xf2c23a, 0xd83a3a]];
// one wrapped candy along axis 'x' or 'z', centred at (x,y,z)
function paintCandy(v, x, y, z, axis, [a, b], big = false) {
  const L = big ? 2 : 1;
  for (let i = -L; i <= L; i++) for (let j = 0; j <= 1; j++) for (let k = -1; k <= 0; k++) {
    const px = axis === 'x' ? x + i : x + k, pz = axis === 'x' ? z + k : z + i;
    v.set(px, y + j, pz, (i + j) % 2 === 0 ? a : b);
  }
  for (const s of [-1, 1]) {
    const e = L + 1;
    for (let j = -1; j <= 2; j++) for (let k = -1; k <= 0; k++) {
      if (j === -1 || j === 2) { if (k === -1) continue; }
      const px = axis === 'x' ? x + s * (e + (j === -1 || j === 2 ? 1 : 0)) : x + k, pz = axis === 'x' ? z + k : z + s * (e + (j === -1 || j === 2 ? 1 : 0));
      if (j >= 0 && j <= 1) v.set(axis === 'x' ? x + s * e : px, y + j, axis === 'x' ? pz : z + s * e, tone(a, 0.15));
      else v.set(px, y + j, pz, tone(a, 0.15));
    }
  }
}
// candyBowl({ seed }) — pumpkin-orange bowl heaped with wrapped candies and lollipops
export function candyBowl({ seed = 1 } = {}) {
  const v = new Vox(28, 22, 28);
  const c = 13.5, R = rng(seed * 13 + 7);
  lathe(v, c, c, 0, 1, (y) => 4.5, (x, y) => (y === 0 ? 0x2e1e3a : 0x4a2e5a));
  lathe(v, c, c, 2, 9, (y, t) => 5 + 6 * Math.sin((t * Math.PI) / 2), (x, y, z, a, d, r) => {
    const rib = Math.abs(Math.cos(a * 4)) < 0.22;
    return y === 9 ? 0xf6a040 : rib ? 0xb4501a : 0xe8781e;
  }, { wall: 1.5, floor: 3 });
  // candies: dome heap
  for (let i = 0; i < 30; i++) {
    const a = R() * TAU, rr = Math.sqrt(R()) * 9;
    const x = Math.round(c + Math.cos(a) * rr), z = Math.round(c + Math.sin(a) * rr);
    const y = Math.round(4 + (1 - (rr / 10) ** 2) * 7 + R() * 1.5);
    paintCandy(v, x, y, z, R() < 0.5 ? 'x' : 'z', CANDY_COLS[Math.floor(R() * CANDY_COLS.length)]);
  }
  // a couple of lollipops sticking out
  for (let i = 0; i < 2; i++) {
    const x = Math.round(c - 4 + i * 8), z = Math.round(c + (i ? -3 : 2));
    v.fill(x, 10, z, x, 16, z, BONE_L);
    v.ellipsoid(x, 18, z, 2.2, 2.2, 0.6, (xx, yy) => ((xx + yy) % 3 === 0 ? 0xfff0e0 : i ? 0x8a4ab8 : 0xd83a3a));
  }
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.28, breakable: true });
}

// candyCorn({ scale }) — giant candy corn (decor or pickup)
export function candyCorn({ scale = 1 } = {}) {
  const H = Math.round(11 * scale), Wd = 5 * scale, Dp = 2.6 * scale;
  const v = new Vox(Math.ceil(Wd * 2) + 3, H + 1, Math.ceil(Dp * 2) + 3);
  const c = (v.w - 1) / 2, cz = (v.d - 1) / 2;
  for (let y = 0; y < H; y++) {
    const t = y / H, hw = Wd * (1 - t) ** 0.85 + 0.4 - (y === 0 ? 0.8 : 0), hd = Dp * (1 - t * 0.55) - (y === 0 ? 0.5 : 0);
    const col = t < 0.36 ? 0xf6c02a : t < 0.72 ? 0xf07a1e : 0xfff0d8;
    for (let z = Math.round(cz - hd); z <= Math.round(cz + hd); z++) for (let x = Math.round(c - hw); x <= Math.round(c + hw); x++) {
      const ex = Math.abs(x - c) / (hw + 0.01), ez = Math.abs(z - cz) / (hd + 0.01);
      if (ex * ex + ez * ez * 0.6 > 1.15) continue;
      v.set(x, y, z, col);
    }
  }
  bevel(v, { top: 0.1, bottom: -0.08 });
  return finish(v, FINE, { radius: Wd * FINE * 0.8, meta: { pickup: true } });
}

// spider({ seed }) — round fuzzy cute spider with big eyes and striped legs
export function spider({ seed = 1, stripe = ORANGE } = {}) {
  const v = new Vox(30, 16, 30);
  const c = 14.5, R = rng(seed * 7 + 5);
  const fur = 0x2e2436, furL = 0x3e3248;
  const fuzzy = (x, y, z) => (vhash(x, y, z, seed) < 0.35 ? furL : fur);
  v.ellipsoid(c, 8, c - 3, 5.2, 4.8, 5.6, fuzzy);
  // stripe / marking on the abdomen
  v.paint((x, y, z, col) => (y >= 11 && Math.abs(z - (c - 4)) < 1 ? stripe : y >= 11 && Math.abs(z - (c - 1)) < 0.6 ? tone(stripe, -0.2) : undefined));
  v.ellipsoid(c, 6.5, c + 3, 3.6, 3.2, 3.2, fuzzy);
  // eyes
  const fz = (x, y) => frontZ(v, x, y);
  for (const s of [-1, 1]) {
    const ex = Math.round(c + s * 1.5);
    for (const [dx, dy] of [[0, 0], [0, 1], [s, 0], [s, 1]]) v.set(ex + dx, 7 + dy, fz(ex + dx, 7 + dy) + 1, BONE_L);
    v.set(ex, 7, fz(ex, 7), 0x1e1418);
    v.set(Math.round(c + s * 0.6), 9, fz(Math.round(c + s * 0.6), 9), 0xd84a6a);
  }
  v.set(Math.round(c - 0.5), 5, fz(Math.round(c - 0.5), 5), BONE_D); v.set(Math.round(c + 0.5), 5, fz(Math.round(c + 0.5), 5), BONE_D);
  // legs: 4 per side, knee up, foot down
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const z0 = c + 3.5 - i * 2.4, spread = (i - 1.5) * 2.6;
    const p0 = [c + s * 3, 6, z0], p1 = [c + s * 7.5, 10, z0 + spread * 0.6], p2 = [c + s * 11.5, 4, z0 + spread], p3 = [c + s * 12.5, 0, z0 + spread * 1.2];
    polyline(v, [p0, p1], fur);
    polyline(v, [p1, p2], (x, y, z) => (y % 3 === 0 ? stripe : furL));
    polyline(v, [p2, p3], fur);
  }
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.25, breakable: true });
}

const LANTERN_COLS = { red: [0xa83228, 0x7a2018, 0xc84a3a], black: [IRON, 0x1e1a22, IRON_L], green: [0x3e6a3a, 0x2a4a28, 0x5a8a50], brass: [GOLD_D, 0x7a5418, GOLD] };
// lantern({ color: red|black|green|brass, lit }) — hurricane lantern with glowing globe and wire guard
export function lantern({ color = 'red', lit = true } = {}) {
  const v = new Vox(14, 26, 14);
  const c = 6.5;
  const [m, mD, mL] = LANTERN_COLS[color] || LANTERN_COLS.red;
  const glass = lit ? 0xffd27a | EMIT : 0xc8c0a8 | GLASS, glassC = lit ? 0xfff0b0 | EMIT : glass;
  lathe(v, c, c, 0, 1, 5, (x, y) => (y === 0 ? mD : m));
  lathe(v, c, c, 2, 4, (y, t) => 4.6 - t * 0.6, (x, y) => (y === 4 ? mL : m));
  lathe(v, c, c, 5, 13, (y, t) => 2.6 + 1.3 * Math.sin(t * Math.PI), (x, y, z, a, d, r, t) => (t > 0.3 && t < 0.6 && d < 1.2 ? glassC : glass));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; for (let y = 5; y <= 14; y++) { const r = 2.6 + 1.3 * Math.sin(((y - 5) / 8) * Math.PI) + 0.9; v.set(Math.round(c + Math.cos(a) * r), y, Math.round(c + Math.sin(a) * r), mD); } }
  lathe(v, c, c, 14, 17, (y, t) => 4.4 - t * 3, (x, y, z, a, d, r, t) => (t === 0 ? mD : t > 0.9 ? mL : m));
  v.set(Math.round(c), 18, Math.round(c), mL);
  const pts = []; for (let i = 0; i <= 14; i++) { const t = (i / 14) * Math.PI; pts.push([c - Math.cos(t) * 4.5, 15 + Math.sin(t) * 7, c]); }
  polyline(v, pts, IRON);
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.1, lights: lit ? [{ at: [c, 9, c], color: L_LAMP, radius: 4 }] : [], meta: { handleTop: r3(22 * FINE) } });
}

const BULB_COLS = { orange: 0xffa040, purple: 0xb070ff, green: 0x8aff5a, yellow: 0xffe070, red: 0xff5a4a };
// stringBulb({ color }) — C9 holiday bulb; origin at the socket top (hang it from the string)
export function stringBulb({ color = 'orange' } = {}) {
  const v = new Vox(7, 11, 7);
  const c = 3, col = (BULB_COLS[color] || BULB_COLS.orange) | EMIT;
  lathe(v, c, c, 0, 5, (y, t) => 0.4 + 2.1 * Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.62), (x, y, z, a, d, r, t) => (t > 0.5 && d < 0.8 ? tone(col, 0.35) : col));
  lathe(v, c, c, 6, 8, 1.2, (x, y) => (y === 8 ? 0x3a4a38 : 0x2a3428));
  v.set(c, 9, c, 0x2a3428);
  const rgb = [((col >> 16) & 255) / 255, ((col >> 8) & 255) / 255, (col & 255) / 255];
  const res = finish(v, FINE, { origin: [c + 0.5, 10, c + 0.5], radius: 0.06, lights: [{ at: [c, 3, c], color: rgb, radius: 1.2 }], meta: { mount: 'hang', color } });
  res.meta.height = res.meta.box[1];
  return res;
}

// bowlingPin({ seed, skull }) — stubby ~0.5 m pin for lawn bowling on the green (skull: the old skeleton pin); knockable
export function bowlingPin({ seed = 1, stripe = RED, skull = false } = {}) {
  const v = new Vox(14, 24, 14);
  const c = 6.5;
  const rf = profile([[0, 3.2], [2, 3.9], [5, 4.5], [8, 3.9], [10, 2.7], [12, 2.4], [14, 3.1], [17, 3.6], [19, 3.3], [21, 2.2], [22, 1.1]]);
  const PIN = 0xf4eee2, PIN_D = 0xd8cfbe, PIN_L = 0xfffaf0;
  lathe(v, c, c, 0, 22, rf, (x, y, z, a) => {
    if (skull) {
      if (y === 10 || y === 11) return stripe;
      if (y === 0) return BONE_D;
      const front = Math.cos(a - Math.PI / 2) > 0.45;
      if (front && (y === 3 || y === 5 || y === 7)) return 0x9a8c74; // ribs
      if (front && Math.abs(x - c) < 0.6 && y >= 3 && y <= 8) return BONE_L; // sternum
      return y > 18 ? BONE_L : BONE;
    }
    // plain white maple with two red neck stripes
    if (y === 11 || y === 13) return stripe;
    if (y === 0) return PIN_D;
    return y > 17 || Math.cos(a + 0.8) > 0.3 ? PIN_L : y < 3 ? PIN_D : PIN;
  });
  if (skull) {
    for (const s of [-1, 1]) {
      const ex = Math.round(c + s * 1.4);
      for (const [dx, dy] of [[0, 0], [0, 1], [s, 0], [s, 1]]) { const x = ex + dx, y = 16 + dy, z = frontZ(v, x, y); v.set(x, y, z, 0); v.set(x, y, z - 1, 0x2e2430); }
    }
    { const z = frontZ(v, 6, 15); v.set(6, 15, z, 0x5a4a40); v.set(7, 15, frontZ(v, 7, 15), 0x5a4a40); }
    for (let x = 4; x <= 9; x++) { const z = frontZ(v, x, 13); v.set(x, 13, z, x % 2 ? 0x8a7c66 : BONE_L); }
    for (const s of [-1, 1]) { polyline(v, [[c + s * 4.2, 7, c], [c + s * 5.6, 5, c + 0.5]], BONE); v.set(Math.round(c + s * 5.8), 4, Math.round(c + 0.5), BONE_L); }
  }
  bevel(v, { top: 0.06, bottom: -0.06 });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.11, breakable: true, meta: { knockable: true, mass: 1.5 } });
}

// bowlingBall({ color }) — a big glossy bowling ball with three finger holes (kick it at the pins)
export function bowlingBall({ color = 0x2e5a8a } = {}) {
  const v = new Vox(14, 14, 14);
  const c = 6.5, R = 6.4;
  const D = tone(color, -0.2), Lc = tone(color, 0.16), H = tone(color, 0.32);
  v.ellipsoid(c, c, c, R, R, R, (x, y, z) => {
    const l = (-0.5 * (x - c) + 0.7 * (y - c) + 0.5 * (z - c)) / R;
    if (l > 0.8) return H;
    if (l > 0.35) return Lc;
    if (l < -0.45) return D;
    return Math.floor((x + y * 2 + z) / 3) % 5 === 0 ? tone(color, 0.05) : color;
  });
  for (const [x, y] of [[5, 9], [8, 9], [6, 6]]) { const z = frontZ(v, x, y); if (z > 0) { v.set(x, y, z, INK); v.set(x, y, z - 1, INK); } }
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.16, meta: { knockable: true, mass: 1 } });
}

// trickHoop({ flames, harvest, seed }) — ~3 m wooden hoop between two posts; ride through it. harvest: dressed with
// little gourds, maple leaves, corn sheaves and ribbon (the fall-fair kind); otherwise a ring of jack-o'-lanterns
export function trickHoop({ flames = true, harvest = false, seed = 1, count = 16 } = {}) {
  if (harvest) return harvestHoop({ seed, count });
  const W = 70, H = 70, D = 13;
  const v = new Vox(W, H, D);
  const cx = 34.5, cy = 36, cz = 6, Rr = 26;
  const R = rng(seed * 5 + 3);
  torus(v, cx, cy, cz, Rr, 1.4, (x, y, z, a) => (Math.floor(((a + Math.PI) / TAU) * 32) % 4 === 0 ? WOOD_D : WOOD), 'z');
  // posts with A-frame feet, braced to the hoop
  for (const s of [-1, 1]) {
    const px = Math.round(cx + s * (Rr + 4));
    v.fill(px, 0, cz - 1, px + 1, cy + 2, cz, WOOD);
    v.fill(px, cy + 3, cz - 1, px + 1, cy + 3, cz, WOOD_L);
    polyline(v, [[px + 0.5, 12, cz], [px + 0.5, 0, cz - 5]], WOOD_D, 0.6);
    polyline(v, [[px + 0.5, 12, cz], [px + 0.5, 0, cz + 5]], WOOD_D, 0.6);
    v.fill(px - 1, 0, cz - 6, px + 2, 0, cz + 6, WOOD_DD);
    v.fill(Math.round(cx + s * (Rr + 1)), cy - 1, cz - 1, px, cy, cz, WOOD_D);
  }
  // little jack-o'-lanterns around the ring, faces on both sides
  const lights = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + Math.PI / count;
    const x = Math.round(cx + Math.cos(a) * Rr), y = Math.round(cy + Math.sin(a) * Rr);
    paintPumpkin(v, x, y - 3, cz, { rx: 3.4, ry: 2.9, rz: 3.2, ribs: 6, pal: ['orange', 'amber', 'red'][i % 3], seed: seed * 50 + i, stemH: 1, stemR: 0.6, lump: 0.02, ribDepth: 0.06 });
    for (const sz of [1, -1]) {
      const fz = (xx, yy) => (sz > 0 ? frontZ(v, xx, yy) : (() => { for (let z = 0; z < v.d; z++) if (v.get(xx, yy, z)) return z; return -1; })());
      for (const [dx, dy] of [[-1, 1], [1, 1], [-1, -1], [0, -1], [1, -1]]) { const xx = x + dx, yy = y + dy - 0; const z = fz(xx, yy); if (z >= 0) v.set(xx, yy, z, 0xffc44a | EMIT); }
    }
    if (i % 4 === 0) lights.push({ at: [x, y, cz], color: L_JACK, radius: 2.5 });
  }
  if (flames) {
    for (let i = 0; i < count; i++) {
      const a = ((i + 0.5) / count) * TAU + Math.PI / count;
      if (Math.sin(a) < -0.35) continue;
      const x = Math.round(cx + Math.cos(a) * (Rr + 1.5)), y = Math.round(cy + Math.sin(a) * (Rr + 1.5));
      flame(v, x, y, cz, 4 + (i % 2), 1.3, Math.cos(a) * 0.4);
    }
    lights.push({ at: [cx, cy + Rr, cz], color: [1.0, 0.55, 0.2], radius: 5 });
  }
  bevel(v, { top: 0.08, bottom: 0 });
  const res = finish(v, STD, { origin: [cx + 0.5, 0, cz + 0.5], radius: 0.15, lights, meta: { flames } });
  res.meta.ring = { center: [0, r3((cy + 0.5) * STD), 0], inner: r3((Rr - 4.5) * STD), outer: r3((Rr + 4) * STD), axis: 'z' };
  res.meta.colliders = [-1, 1].map((s) => ({ x: r3(s * (Rr + 4.5) * STD), z: 0, r: 0.08 }));
  return res;
}

function harvestHoop({ seed = 1, count = 16 } = {}) {
  const v = new Vox(70, 70, 13);
  const cx = 34.5, cy = 36, cz = 6, Rr = 26;
  // the hoop wrapped in a red & cream ribbon spiral
  torus(v, cx, cy, cz, Rr, 1.4, (x, y, z, a) => {
    const k = Math.floor(((a + Math.PI) / TAU) * 48) % 6;
    return k < 2 ? RED : k === 2 ? RED_D : k < 5 ? CREAM : 0xd8ccb0;
  }, 'z');
  for (const s of [-1, 1]) {
    const px = Math.round(cx + s * (Rr + 4));
    v.fill(px, 0, cz - 1, px + 1, cy + 2, cz, WOOD);
    v.fill(px, cy + 3, cz - 1, px + 1, cy + 3, cz, WOOD_L);
    polyline(v, [[px + 0.5, 12, cz], [px + 0.5, 0, cz - 5]], WOOD_D, 0.6);
    polyline(v, [[px + 0.5, 12, cz], [px + 0.5, 0, cz + 5]], WOOD_D, 0.6);
    v.fill(px - 1, 0, cz - 6, px + 2, 0, cz + 6, WOOD_DD);
    v.fill(Math.round(cx + s * (Rr + 1)), cy - 1, cz - 1, px, cy, cz, WOOD_D);
    // a sheaf of corn stalks tied to each post with a red ribbon
    for (let k = -1; k <= 1; k++) polyline(v, [[px + 0.5 + k, 0, cz + 2], [px + 0.5 + k * 2, 16, cz + 2]], k ? STRAW_D : STRAW, 0.6);
    v.fill(px - 1, 6, cz + 1, px + 2, 6, cz + 3, RED);
  }
  // little pumpkins and squash in harvest colours, with maple leaves between them
  const R = rng(seed * 5 + 3);
  const pals = ['orange', 'amber', 'red'];
  const leafC = [RED_L, GOLD, ORANGE, RED];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU + Math.PI / count;
    const x = Math.round(cx + Math.cos(a) * Rr), y = Math.round(cy + Math.sin(a) * Rr);
    if (i % 2 === 0) paintPumpkin(v, x, y - 3, cz, { rx: 3.0, ry: 2.6, rz: 3.0, ribs: 6, pal: pals[(i / 2) % 3], seed: seed * 50 + i, stemH: 1, stemR: 0.6, lump: 0.02, ribDepth: 0.06 });
    else {
      const c = leafC[Math.floor(R() * leafC.length)];
      for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, 1], [0, 2], [-2, 1], [2, 1], [-1, -1], [1, -1], [0, -2]]) for (const dz of [-1, 0, 1]) v.set(x + dx, y + dy + 1, cz + dz, dz ? tone(c, -0.08) : c);
    }
  }
  bevel(v, { top: 0.08, bottom: 0 });
  const res = finish(v, STD, { origin: [cx + 0.5, 0, cz + 0.5], radius: 0.15, meta: { flames: false, harvest: true } });
  res.meta.ring = { center: [0, r3((cy + 0.5) * STD), 0], inner: r3((Rr - 4.5) * STD), outer: r3((Rr + 4) * STD), axis: 'z' };
  res.meta.colliders = [-1, 1].map((s) => ({ x: r3(s * (Rr + 4.5) * STD), z: 0, r: 0.08 }));
  return res;
}

// preview helper: hanging models have their origin at the hang point; lift them onto the ground
const onGround = (r) => ({ ...r, origin: [r.origin[0], 0, r.origin[2]] });

// ======================================================== FURNITURE & VILLAGE
const plankTone = (base, k) => (k % 3 === 0 ? tone(base, 0.07) : k % 3 === 1 ? base : tone(base, -0.06));

// rockingChair({ seed, blanket }) — slatted rocker with curved runners, cushion and plaid throw
export function rockingChair({ seed = 1, blanket = true } = {}) {
  const v = new Vox(18, 26, 24);
  const wood = [WOOD, 0x9a6a3c, GREYWOOD][seed % 3], woodD = tone(wood, -0.25), woodL = tone(wood, 0.12);
  const rockY = (z) => Math.round(((z - 11.5) / 11.5) ** 2 * 3);
  for (const x of [3, 14]) for (let z = 0; z < 24; z++) { const y = rockY(z); v.set(x, y, z, woodD); v.set(x, y + 1, z, wood); }
  for (const x of [3, 14]) for (const z of [7, 16]) v.fill(x, rockY(z) + 2, z, x, 8, z, wood);
  // seat planks
  for (let z = 6; z <= 17; z++) v.fill(3, 9, z, 14, 9, z, (z - 6) % 3 === 2 ? woodD : woodL);
  v.fill(3, 8, 6, 14, 8, 17, wood);
  // back posts (leaning back) with spindles and a curved top rail
  for (let y = 10; y <= 24; y++) {
    const z = Math.round(6 - (y - 10) * 0.25);
    v.set(3, y, z, wood); v.set(14, y, z, wood);
    if (y <= 20) for (const x of [5, 7, 10, 12]) v.set(x, y, z, woodL);
    if (y >= 21) for (let x = 4; x <= 13; x++) if (y <= 21 + (x > 5 && x < 12 ? 2 : x > 4 && x < 13 ? 1 : 0)) v.set(x, y, z, y === 21 ? woodD : wood);
  }
  // arms
  for (const x of [2, 15]) { v.fill(x, 14, 5, x, 14, 17, woodL); v.fill(x, 10, 16, x, 13, 16, wood); }
  v.fill(3, 10, 16, 3, 13, 16, wood); v.fill(14, 10, 16, 14, 13, 16, wood);
  // cushion
  rbox(v, 4, 10, 8, 13, 10, 16, 1, (x, y, z) => ((x + z) % 7 === 0 ? 0xc85a1a : 0xe8901e), 0);
  if (blanket) {
    const plaid = (x, y, z) => { const a = x % 3 === 0, b = (y + z) % 3 === 0; return a && b ? 0x3a4a6a : a || b ? 0x5a7aa8 : 0xe8d8b8; };
    for (let y = 13; y <= 23; y++) {
      const z = Math.round(6 - (y - 10) * 0.25) + 1;
      for (let x = 6; x <= 13; x++) if (y > 14 + ((x * 7) % 3 === 0 ? 1 : 0) - (x > 9 ? 2 : 0)) v.set(x, y, z, plaid(x, y, z));
    }
    for (let x = 6; x <= 13; x++) { v.set(x, 24, 2, plaid(x, 24, 2)); v.set(x, 23, 1, plaid(x, 23, 1)); v.fill(x, 17, 0, x, 22, 0, plaid(x, 0, 0)); }
  }
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, STD, { origin: [9, 0, 12], radius: 0.38 });
}

// parkBench({ color: wood|green|red, leaves }) — 1.6 m slatted bench with cast-iron ends
export function parkBench({ color = 'wood', leaves = true, seed = 1 } = {}) {
  const L = 32, v = new Vox(L, 20, 12);
  const slat = { wood: WOOD_L, green: 0x3e6a42, red: 0x9e2f26, teal: TEAL }[color] || WOOD_L;
  const iron = IRON, ironL = IRON_L;
  for (const x0 of [1, 15, 29]) {
    const ends = x0 !== 15;
    for (const x of [x0, x0 + 1]) {
      v.fill(x, 0, 9, x, 8, 9, iron); // front leg
      for (let y = 0; y <= 18; y++) v.set(x, y, Math.max(0, 2 - Math.floor(Math.max(0, y - 9) / 4)), iron); // back leg / back support
      v.fill(x, 8, 2, x, 8, 9, iron); // seat rail
      if (ends) { for (let z = 2; z <= 10; z++) v.set(x, 12 + (z > 8 ? -1 : 0), z, ironL); v.fill(x, 9, 10, x, 11, 10, iron); v.set(x, 9, 10, ironL); }
    }
    v.set(x0, 0, 10, ironL); v.set(x0 + 1, 0, 10, ironL); v.set(x0, 0, 1, ironL); v.set(x0 + 1, 0, 1, ironL);
  }
  // seat + back slats
  const sl = (k) => (x, y, z) => (x === 0 || x === L - 1 ? tone(slat, -0.2) : plankTone(slat, k));
  [[2, 3], [5, 6], [8, 9]].forEach(([a, b], k) => v.fill(0, 9, a, L - 1, 9, b, sl(k)));
  [[11, 12], [14, 15], [17, 18]].forEach(([a, b], k) => v.fill(0, a, Math.max(0, 1 - Math.floor((a - 9) / 5)), L - 1, b, Math.max(0, 1 - Math.floor((a - 9) / 5)), sl(k + 1)));
  // brass plaque
  v.fill(14, 14, 2, 17, 15, 2, GOLD);
  if (leaves) { const R = rng(seed); for (let i = 0; i < 4; i++) v.set(3 + Math.floor(R() * 26), 10, 3 + Math.floor(R() * 6), [0xc8401e, 0xe8781e, 0xd8a032][i % 3]); }
  bevel(v, { top: 0.08, bottom: 0, test: (x, y, z, c) => c !== GOLD });
  return finish(v, STD, { origin: [L / 2, 0, 6], radius: 0.5, meta: { seatHeight: 0.5 } });
}

// picnicTable({ cloth }) — plank table with attached benches; cloth adds gingham, a pie and a cocoa mug
export function picnicTable({ cloth = false, seed = 1 } = {}) {
  const L = 36, v = new Vox(L, 18, 34);
  const wood = 0x9a6a3c;
  for (let z = 10; z <= 23; z++) v.fill(0, 14, z, L - 1, 15, z, (x, y) => ((z - 10) % 3 === 2 ? tone(wood, -0.25) : y === 15 ? plankTone(tone(wood, 0.1), Math.floor((z - 10) / 3)) : wood));
  for (const [a, b] of [[2, 6], [27, 31]]) for (let z = a; z <= b; z++) v.fill(0, 8, z, L - 1, 9, z, (x, y) => ((z - a) % 3 === 2 ? tone(wood, -0.25) : y === 9 ? tone(wood, 0.1) : wood));
  for (const x0 of [5, 29]) for (const x of [x0, x0 + 1]) {
    polyline(v, [[x, 13, 13], [x, 0, 4]], tone(wood, -0.15));
    polyline(v, [[x, 13, 20], [x, 0, 29]], tone(wood, -0.15));
    v.fill(x, 7, 2, x, 7, 31, tone(wood, -0.15));
    v.fill(x, 13, 10, x, 13, 23, tone(wood, -0.15));
  }
  if (cloth) {
    const ging = (x, z) => { const a = x % 2 === 0, b = z % 2 === 0; return a && b ? 0xb8322a : a || b ? 0xe07a6a : 0xfff0e0; };
    for (let x = 7; x <= 28; x++) {
      for (let z = 10; z <= 23; z++) v.set(x, 16, z, ging(x, z));
      for (const [z, d] of [[9, -1], [24, 1]]) { v.set(x, 16, z, ging(x, z)); v.set(x, 15, z, ging(x, z + d)); v.set(x, 14, z, (x % 2) ? 0xb8322a : 0xfff0e0); }
    }
    // pie with lattice
    lathe(v, 14, 16, 17, 17, 3.2, (x, y, z, a, d) => (d > 2.4 ? 0xc89050 : (x + z) % 2 ? 0xe0b070 : 0x8a2a3a));
    // cocoa mug
    lathe(v, 22, 15, 17, 19, 1.3, (x, y, z, a, d) => (y === 19 && d < 0.9 ? 0x5a3420 : 0xe8f0f8));
    v.set(24, 18, 15, 0xe8f0f8);
  }
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [L / 2, 0, 17], radius: 0.85, meta: { tableHeight: 0.8, cloth } });
}

// cafeTable({ color }) — round bistro table on a pedestal
export function cafeTable({ color = 'green' } = {}) {
  const v = new Vox(16, 17, 16);
  const c = 7.5, m = { green: 0x2e4a34, black: IRON, white: 0xe8e4dc, teal: TEAL_D }[color] || 0x2e4a34;
  lathe(v, c, c, 0, 0, 4.5, tone(m, -0.1));
  for (let k = 0; k < 4; k++) { const a = (k / 4) * TAU + Math.PI / 4; v.set(Math.round(c + Math.cos(a) * 5), 0, Math.round(c + Math.sin(a) * 5), m); }
  lathe(v, c, c, 1, 13, (y, t) => (y < 3 ? 1.6 : 1.0), m);
  lathe(v, c, c, 14, 15, 7.4, (x, y, z, a, d) => (d > 6.5 ? tone(m, y === 15 ? 0.1 : -0.1) : y === 15 ? (Math.floor(x) % 4 === 0 ? 0x9a6a3c : 0xb07a46) : 0x8a5a32));
  bevel(v, { top: 0.04, bottom: 0 });
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.35, meta: { tableHeight: 0.8 } });
}
// cafeChair({ color }) — bistro chair, faces +z
export function cafeChair({ color = 'green' } = {}) {
  const v = new Vox(12, 20, 12);
  const c = 5.5, m = { green: 0x2e4a34, black: IRON, white: 0xe8e4dc, teal: TEAL_D }[color] || 0x2e4a34;
  for (const [x, z] of [[2, 2], [9, 2], [2, 9], [9, 9]]) polyline(v, [[x + (x < 5 ? -1 : 1) * 0.6, 0, z + (z < 5 ? -1 : 1) * 0.6], [x, 8, z]], m);
  lathe(v, c, c, 9, 9, 4.6, (x, y, z, a, d) => (d > 3.8 ? tone(m, 0.12) : (x % 2 ? 0xb07a46 : 0x9a6a3c)));
  lathe(v, c, c, 7, 7, 4, (x, y, z, a, d) => (d > 3.2 ? m : 0));
  // hooped back with spindles
  for (let i = 0; i <= 16; i++) { const t = (i / 16) * Math.PI; v.set(Math.round(c - Math.cos(t) * 4.4), Math.round(10 + Math.sin(t) * 8), 1, m); }
  for (const x of [1, 10]) v.fill(x, 10, 1, x, 12, 1, m);
  for (const x of [4, 7]) v.fill(x, 10, 1, x, 16, 1, m);
  v.fill(3, 15, 1, 8, 15, 1, tone(m, 0.1));
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.25, meta: { seatHeight: 0.5 } });
}

// barrel({ contents: lid|apples|water, seed }) — staved oak barrel with iron hoops
export function barrel({ contents = 'lid', seed = 1 } = {}) {
  const v = new Vox(17, 21, 17);
  const c = 8, R = rng(seed);
  const rf = (y) => 6 + Math.sin((y / 17) * Math.PI) * 1.2;
  const staves = [WOOD, WOOD_L, 0x7a4e2c, WOOD];
  lathe(v, c, c, 0, 17, rf, (x, y, z, a, d, r) => {
    if ([2, 6, 11, 15].includes(y)) return d > r - 1 ? IRON_L : WOOD_D;
    const k = Math.floor(((a + Math.PI) / TAU) * 14);
    return d < r - 1.2 ? WOOD_D : staves[(k + seed) % 4];
  });
  for (const y of [2, 6, 11, 15]) lathe(v, c, c, y, y, rf(y) + 0.6, (x, yy, z, a, d, r) => (d > r - 1 ? IRON : 0));
  if (contents === 'water') {
    v.carve((x, y, z) => y >= 15 && Math.hypot(x - c, z - c) < rf(y) - 1.2);
    lathe(v, c, c, 15, 15, rf(15) - 1, 0x2e5a7a);
  } else {
    lathe(v, c, c, 17, 17, rf(17) - 1, (x, y, z, a, d) => (d > rf(17) - 2.2 ? WOOD_D : Math.abs(x - c) < 0.6 ? WOOD_D : (x - c) % 3 === 0 ? tone(WOOD_L, -0.05) : WOOD_L));
    if (contents === 'apples') { v.carve((x, y, z) => y === 17 && Math.hypot(x - c, z - c) < 5); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; v.ellipsoid(c + Math.cos(a) * 2.6, 17.5, c + Math.sin(a) * 2.6, 1.4, 1.2, 1.4, APPLE_COLS[i % APPLE_COLS.length]); } v.ellipsoid(c, 18.5, c, 1.4, 1.2, 1.4, RED); }
  }
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], breakable: true, meta: { contents } });
}

// crate({ stamp: mug|pumpkin|none, seed }) — framed plank crate with a diagonal brace and a stencil
export function crate({ stamp = 'mug', seed = 1, size = 12 } = {}) {
  const N = size, v = new Vox(N, N, N);
  const base = [0xb07a46, 0x9a6a3c, GREYWOOD_L][seed % 3], dark = tone(base, -0.3);
  v.fill(0, 0, 0, N - 1, N - 1, N - 1, (x, y, z) => {
    const ex = x === 0 || x === N - 1, ey = y === 0 || y === N - 1, ez = z === 0 || z === N - 1;
    if (ex + ey + ez >= 2) return dark;
    if (ez && (Math.abs(x - y) <= 0 || Math.abs(x - y - 1) <= 0)) return tone(base, -0.12);
    if (ex && (Math.abs(z - y) <= 0 || Math.abs(z - y - 1) <= 0)) return tone(base, -0.12);
    const k = Math.floor(y / 3);
    return y % 3 === 2 && !ey ? tone(base, -0.18) : plankTone(base, k);
  });
  const ink = 0x5a2e1e;
  if (stamp === 'mug') decal(v, ['.#.#..', '......', '####..', '#####.', '####.#', '#####.', '####..', '.##...'], N / 2 - 0.5, 9, { '#': ink });
  if (stamp === 'pumpkin') decal(v, ['..#...', '.####.', '######', '#.##.#', '######', '.####.'], N / 2 - 0.5, 8, { '#': ink });
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, STD, { breakable: true, meta: { stamp } });
}

// wheelbarrow({ contents: pumpkins|leaves|logs|empty }) — red tub, rubber wheel at +z, wooden handles
export function wheelbarrow({ contents = 'pumpkins', seed = 1 } = {}) {
  const v = new Vox(22, 20, 32);
  const cx = 10.5, R = rng(seed * 3 + 1);
  const red = 0xb8322a, redD = 0x84221e, redL = 0xd8503a;
  // tub: tapered, sloped front
  for (let y = 6; y <= 13; y++) {
    const t = (y - 6) / 7, hw = 4.5 + t * 2.5, z0 = 7 - Math.round(t * 2), z1 = 20 + Math.round(t * 4);
    for (let z = z0; z <= z1; z++) for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
      const wall = y === 6 || Math.abs(x - cx) > hw - 1 || z === z0 || z === z1;
      if (!wall) continue;
      v.set(x, y, z, y === 13 ? redL : y === 6 ? redD : red);
    }
  }
  // wheel, fork, legs, handles
  for (let z = 22; z <= 29; z++) for (let y = 0; y <= 7; y++) { const d = Math.hypot(z - 25.5, y - 3.5); if (d <= 3.9) v.set(Math.round(cx), y, z, d < 1.5 ? METAL_L : d < 2.6 ? METAL : 0x2a2628); if (d <= 3.9 && d > 2.6) v.set(Math.round(cx) + 1, y, z, 0x2a2628); }
  for (const s of [-1, 1]) {
    const x = Math.round(cx + s * 3.5);
    polyline(v, [[x, 10, 0], [x, 7, 14], [x - s * 2.4, 4, 25.5]], WOOD, 0);
    v.fill(x, 10, 0, x, 10, 1, WOOD_D);
    v.fill(x, 0, 8, x, 6, 8, IRON);
    v.set(x, 0, 9, IRON);
  }
  v.fill(Math.round(cx - 1), 4, 25, Math.round(cx + 2), 4, 26, IRON);
  if (contents === 'pumpkins') {
    paintPumpkin(v, cx - 2, 9, 12, { rx: 3.4, ry: 3, ribs: 6, pal: 'orange', seed: seed + 1, stemH: 1, stemR: 0.6, ribDepth: 0.06 });
    paintPumpkin(v, cx + 2, 9, 17, { rx: 3, ry: 2.6, ribs: 6, pal: 'amber', seed: seed + 2, stemH: 1, stemR: 0.6, ribDepth: 0.06 });
    paintPumpkin(v, cx + 1, 12, 13, { rx: 2.6, ry: 2.2, ribs: 6, pal: 'white', seed: seed + 3, stemH: 1, stemR: 0.6, ribDepth: 0.06 });
  } else if (contents === 'leaves') {
    v.ellipsoid(cx, 12, 15, 6, 3, 8, (x, y, z) => (y < 7 ? undefined : [0xc8401e, 0xe8781e, 0xd8a032, 0xa83018][Math.floor(vhash(x >> 1, y, z >> 1, seed) * 4)]));
  } else if (contents === 'logs') {
    for (let i = 0; i < 4; i++) logPiece(v, Math.round(cx - 4 + (i % 2) * 6 - 2), 9 + Math.floor(i / 2) * 3, 9, 9, 1.4, 'x', R);
  }
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [cx + 0.5, 0, 14], radius: 0.4, breakable: contents === 'pumpkins', meta: { contents } });
}

const MAILBOX_VARIANTS = {
  classic: { body: METAL, dark: METAL_D, light: METAL_L, post: WOOD },
  black: { body: 0x2e2a32, dark: 0x1e1a22, light: 0x4a4652, post: WOOD_D, trim: GOLD },
  red: { body: 0xa83228, dark: 0x7a2018, light: 0xc84a3a, post: 0xf0e6d6, trim: 0xfff4e0 },
  teal: { body: TEAL, dark: TEAL_D, light: TEAL_L, post: WOOD, trim: 0xfff4e0 },
  house: { body: 0xf2d27a, dark: 0xc8a050, light: 0xfff0b0, post: WOOD, roof: 0x9e2f26 },
};
// mailbox({ variant: classic|black|red|teal|house, flag: up|down, dent, number, seed }) — door faces +z
export function mailbox({ variant = 'classic', flag = 'up', dent = true, number, seed = 1 } = {}) {
  const P = MAILBOX_VARIANTS[variant] || MAILBOX_VARIANTS.classic;
  const v = new Vox(26, 52, 28);
  const cx = 12.5;
  // post with a little cross brace
  v.fill(11, 0, 11, 14, 31, 14, (x, y, z) => ((x === 11 || x === 14) && (z === 11 || z === 14) ? tone(P.post, -0.2) : P.post));
  v.fill(10, 30, 6, 15, 31, 20, tone(P.post, -0.1));
  polyline(v, [[12.5, 22, 15], [12.5, 30, 19]], tone(P.post, -0.15), 0.6);
  // tunnel-shaped box
  const z0 = 4, z1 = 25, y0 = 32, hw = 6;
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y0 + 12; y++) for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) {
    const dx = x - cx, dy = y - (y0 + 6);
    if (dy > 0 && dx * dx + dy * dy > hw * hw + 1) continue;
    const front = z === z1, rim = z === z1 && (Math.abs(dx) > hw - 1.2 || y === y0 || (dy > 0 && dx * dx + dy * dy > (hw - 1) ** 2));
    v.set(x, y, z, rim ? P.dark : front ? P.body : z === z0 ? P.dark : (z - z0) % 7 === 0 ? P.dark : P.body);
  }
  v.set(Math.round(cx), y0 + 6, z1 + 1, P.trim || P.light); v.set(Math.round(cx), y0 + 5, z1 + 1, P.trim || P.light);
  if (variant === 'house') {
    for (let k = 0; k <= 4; k++) for (let z = z0 - 1; z <= z1 + 1; z++) { const y = y0 + 12 + k, w = hw + 1.5 - k * 1.6; for (const s of [-1, 1]) for (let q = 0; q < 2; q++) v.set(Math.round(cx + s * (w - q)), y, z, (z + k) % 2 ? P.roof : tone(P.roof, -0.15)); }
    v.fill(Math.round(cx) - 1, y0 + 16, z0 - 1, Math.round(cx), y0 + 16, z1 + 1, tone(P.roof, -0.3));
    decal(v, ['##', '##'], cx, y0 + 9, { '#': 0xffd27a | GLASS });
  }
  if (dent) { v.set(Math.round(cx + 3), y0 + 11, 12, 0); v.set(Math.round(cx + 2), y0 + 11, 13, 0); v.set(Math.round(cx + 3), y0 + 10, 12, P.dark); v.set(Math.round(cx + 2), y0 + 10, 13, P.dark); }
  // house number on the side
  const num = String(number ?? 10 + (seed * 7) % 90);
  const rows = glyphRows(num);
  rows.forEach((row, ry) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') v.set(Math.round(cx - hw) - 1, y0 + 8 - ry, 10 + i, P.trim || 0xfff4e0); });
  // red flag on the +x side
  const fx = Math.round(cx + hw) + 1;
  if (flag === 'up') { v.fill(fx, y0 + 2, 12, fx, y0 + 13, 12, IRON); v.fill(fx, y0 + 10, 13, fx, y0 + 13, 16, 0xd8302a); }
  else { v.fill(fx, y0 + 3, 12, fx, y0 + 3, 22, IRON); v.fill(fx, y0 + 3, 19, fx, y0 + 6, 22, 0xd8302a); }
  v.set(fx, y0 + 3, 12, METAL_L);
  bevel(v, { top: 0.08, bottom: -0.06 });
  return finish(v, FINE, { origin: [cx + 0.5, 0, 12.5], radius: 0.12, breakable: true, meta: { variant, flag, number: num, slot: [0, r3((y0 + 6) * FINE), r3((z1 + 1 - 12.5) * FINE)] } });
}

// birdhouse({ seed }) — painted birdhouse with a shingled roof on a tall pole
export function birdhouse({ seed = 1 } = {}) {
  const v = new Vox(22, 74, 22);
  const c = 10.5, cz = 10.5;
  const body = [0xf2d27a, TEAL_L, 0xe8a0b0, 0x8ab0d8][seed % 4], trim = 0xfff4e0, roof = [0x9e2f26, 0x4a5a7a, 0x3e6a3a][seed % 3];
  v.fill(10, 0, 10, 11, 50, 11, (x, y) => (y < 2 ? WOOD_D : WOOD));
  rbox(v, 4, 50, 4, 17, 50, 17, 1, WOOD_D, 0);
  v.fill(5, 51, 5, 16, 62, 16, (x, y, z) => ((x === 5 || x === 16) && (z === 5 || z === 16) ? trim : y === 51 ? tone(body, -0.15) : body));
  // gable front/back
  for (let k = 0; k < 6; k++) v.fill(5 + k, 63 + k, 5, 16 - k, 63 + k, 16, body);
  // roof slopes with shingle rows
  for (let k = 0; k < 7; k++) for (let z = 3; z <= 18; z++) for (const s of [-1, 1]) {
    const x = Math.round(c + s * (7 - k)), y = 62 + k;
    v.set(x, y, z, (z + k) % 2 ? roof : tone(roof, -0.15)); v.set(x - s, y, z, tone(roof, -0.25));
  }
  v.fill(10, 69, 3, 11, 69, 18, tone(roof, 0.1));
  // entrance hole + perch
  for (const [x, y] of [[10, 58], [11, 58], [10, 59], [11, 59], [10, 57], [11, 57], [9, 58], [12, 58]]) { v.set(x, y, 16, 0); v.set(x, y, 15, 0x2a1e1a); }
  v.fill(10, 54, 17, 11, 54, 19, WOOD_D);
  decal(v, ['#.#', '###', '.#.'], c, 66, { '#': 0xd84a6a });
  bevel(v, { top: 0.08, bottom: -0.05 });
  return finish(v, FINE, { origin: [c + 0.5, 0, cz + 0.5], radius: 0.1 });
}

// well({ seed }) — stone well with water, posts, crank, bucket on a rope and a shingled roof
export function well({ seed = 1 } = {}) {
  const v = new Vox(34, 46, 30);
  const c = 16.5, cz = 14.5;
  const stones = [STONE, STONE_L, 0x7e7c88, 0xa09eaa];
  lathe(v, c, cz, 0, 11, 11, (x, y, z, a, d, r) => {
    const row = Math.floor(y / 3), seg = Math.floor(((a + Math.PI) / TAU) * 18 + (row % 2) * 0.5);
    if (y % 3 === 2 || (((a + Math.PI) / TAU) * 18 + (row % 2) * 0.5) % 1 < 0.08) return 0x5a5862;
    return stones[Math.floor(vhash(seg, row, 0, seed) * 4)];
  }, { wall: 3 });
  lathe(v, c, cz, 12, 12, 11.6, (x, y, z, a, d, r) => (d > 7.6 ? (Math.floor(((a + Math.PI) / TAU) * 14) % 2 ? STONE_L : 0xc4c2cc) : 0));
  lathe(v, c, cz, 5, 5, 8.4, (x, y, z, a, d) => (d < 3 && (x + z) % 3 === 0 ? 0x4a7aa0 : 0x2e4a6a));
  mossify(v, seed + 2, 0.12, (x, y, z) => y < 4);
  // posts, axle and crank
  for (const s of [-1, 1]) v.fill(Math.round(c + s * 10) - (s > 0 ? 0 : 1), 13, Math.round(cz), Math.round(c + s * 10) + (s > 0 ? 1 : 0), 34, Math.round(cz) + 1, WOOD);
  v.fill(Math.round(c - 9), 27, Math.round(cz), Math.round(c + 9), 27, Math.round(cz), WOOD_L);
  v.fill(Math.round(c - 3), 26, Math.round(cz) - 1, Math.round(c + 3), 28, Math.round(cz) + 1, (x, y, z) => ((x + y) % 2 ? 0xc8a868 : 0xa88850));
  v.fill(Math.round(c + 12), 27, Math.round(cz), Math.round(c + 12), 24, Math.round(cz), IRON);
  v.fill(Math.round(c + 12), 24, Math.round(cz), Math.round(c + 12), 24, Math.round(cz) + 3, IRON);
  v.set(Math.round(c + 11), 27, Math.round(cz), IRON);
  // rope + bucket
  v.fill(Math.round(c), 18, Math.round(cz), Math.round(c), 25, Math.round(cz), 0xc8a868);
  lathe(v, c, cz, 14, 17, (y, t) => 2 + t * 0.5, (x, y) => (y === 15 ? IRON : WOOD_L), { wall: 1, floor: 14 });
  polyline(v, [[c - 2.3, 17, cz], [c, 19, cz], [c + 2.3, 17, cz]], IRON);
  // gable roof along x
  const roof = 0x8a3a2a;
  for (let k = 0; k <= 8; k++) {
    const y = 34 + k, hw = 13 - k * 1.55;
    for (let x = Math.round(c - 14); x <= Math.round(c + 14); x++) for (const s of [-1, 1]) for (let q = 0; q < 2; q++) {
      const z = Math.round(cz + s * (hw - q));
      v.set(x, y, z, q ? tone(roof, -0.3) : (x + k) % 3 === 0 ? tone(roof, -0.12) : (x + k) % 3 === 1 ? roof : tone(roof, 0.06));
    }
  }
  v.fill(Math.round(c - 14), 43, Math.round(cz) - 1, Math.round(c + 14), 43, Math.round(cz) + 1, tone(roof, 0.15));
  for (const s of [-1, 1]) for (let k = 0; k <= 7; k++) { const hw = 12 - k * 1.55; v.fill(Math.round(c + s * 13), 35 + k, Math.round(cz - hw), Math.round(c + s * 13), 35 + k, Math.round(cz + hw), WOOD_D); }
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [c + 0.5, 0, cz + 0.5], radius: 0.6 });
}

// signpost({ arrows: [{ dir: left|right|front|back, color, y }], seed }) — wooden post with arrow boards
export function signpost({ arrows, seed = 1 } = {}) {
  const v = new Vox(32, 40, 32);
  const c = 15.5;
  const list = arrows || [{ dir: 'right', color: 0xf2e6c8, y: 30 }, { dir: 'left', color: TEAL_L, y: 25 }, { dir: 'front', color: 0xd8503a, y: 20 }];
  v.fill(15, 0, 15, 16, 34, 16, (x, y, z) => (y < 2 ? WOOD_D : (x + z + (y >> 2)) % 5 === 0 ? WOOD_D : WOOD));
  v.fill(15, 35, 15, 16, 35, 16, WOOD_L);
  list.forEach((a, i) => {
    const s = a.dir === 'left' || a.dir === 'back' ? -1 : 1, alongX = a.dir === 'left' || a.dir === 'right';
    const y0 = a.y ?? 30 - i * 5, col = a.color ?? 0xf2e6c8, len = a.len ?? 12;
    const depth = i % 2 ? 17 : 14; // alternate in front of / behind the post
    for (let k = 0; k <= len; k++) for (let dy = 0; dy <= 4; dy++) {
      if (k > len - 3 && Math.abs(dy - 2) > len - k) continue; // pointed tip
      if (k === 0 && dy === 2) continue; // notched tail
      const edge = dy === 0 || dy === 4 || k === 0 || (k > len - 3 && Math.abs(dy - 2) === len - k);
      const text = dy === 2 && k >= 2 && k <= len - 4 && vhash(k >> 1, i, 0, seed) < 0.7;
      const colr = edge ? tone(col, -0.22) : text ? tone(col, -0.45) : col;
      const p = Math.round(c + s * (k - 2) + (s > 0 ? 0.5 : -0.5));
      if (alongX) v.set(p, y0 + dy, depth, colr); else v.set(depth, y0 + dy, p, colr);
    }
    // nail
    if (alongX) v.set(Math.round(c + 0.5 * s), y0 + 2, depth + (depth > 15 ? 1 : -1), IRON_L); else v.set(depth + (depth > 15 ? 1 : -1), y0 + 2, Math.round(c + 0.5 * s), IRON_L);
  });
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.1 });
}

const MUM_COLS = { orange: [0xe8781e, 0xf6a040, 0xb8501a], burgundy: [0x8a2238, 0xb04058, 0x5e1426], yellow: [0xf2c23a, 0xfadc70, 0xc8961e], purple: [0x7a4aa8, 0xa070cc, 0x52307a], white: [0xf2ece0, 0xfff8ee, 0xc8c4d0] };
// flowerPot({ color: orange|burgundy|yellow|purple|white, seed }) — terracotta pot of autumn mums
export function flowerPot({ color = 'orange', seed = 1 } = {}) {
  const v = new Vox(22, 22, 22);
  const c = 10.5, [m, mL, mD] = MUM_COLS[color] || MUM_COLS.orange;
  const terra = 0xc0643a, terraD = 0x94482a, terraL = 0xd88050;
  lathe(v, c, c, 0, 9, (y, t) => 5.2 + t * 1.6, (x, y) => (y === 0 ? terraD : y === 4 ? terraD : terra));
  lathe(v, c, c, 9, 11, 7.8, (x, y) => (y === 11 ? terraL : terra));
  lathe(v, c, c, 11, 11, 6.6, 0x4a3022);
  v.ellipsoid(c, 12, c, 8.4, 7, 8.4, (x, y, z) => {
    if (y < 11) return undefined;
    const n = vhash(x >> 1, y >> 1, z >> 1, seed);
    if (y < 13 && n < 0.5) return n < 0.25 ? LEAF_D : LEAF;
    const fl = vhash(x, y, z, seed + 1);
    if (fl < 0.06) return 0xf2d24a; // flower centres
    return n < 0.3 ? mD : n < 0.75 ? m : mL;
  });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.2, breakable: true, meta: { color } });
}

// bucket({ contents: water|apples|empty }) — galvanised bucket with a wire handle
export function bucket({ contents = 'water', seed = 1 } = {}) {
  const v = new Vox(14, 20, 14);
  const c = 6.5;
  lathe(v, c, c, 0, 11, (y, t) => 4.6 + t * 1.3, (x, y) => (y === 3 || y === 8 ? METAL_D : y === 11 ? METAL_L : METAL), { wall: 1, floor: 0 });
  if (contents === 'water') lathe(v, c, c, 9, 9, 5, (x, y, z) => ((x + z) % 4 === 0 ? 0x5a8ab0 : 0x3a6a90));
  if (contents === 'apples') { const R = rng(seed); for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; paintApple(v, c + Math.cos(a) * 2.6, 10, c + Math.sin(a) * 2.6, 2.2, APPLE_COLS[i], R); } }
  for (const s of [-1, 1]) v.set(Math.round(c + s * 6), 10, Math.round(c), METAL_D);
  const pts = []; for (let i = 0; i <= 14; i++) { const t = (i / 14) * Math.PI; pts.push([c - Math.cos(t) * 6, 10 + Math.sin(t) * 7, c]); }
  polyline(v, pts, METAL_D);
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.14, meta: { contents } });
}

// milkChurn({ stripe }) — tall dairy churn with shoulder, lid and side handles
export function milkChurn({ stripe = 0xa83228 } = {}) {
  const v = new Vox(16, 30, 16);
  const c = 7.5;
  const rf = profile([[0, 6.2], [1, 6.2], [2, 5.8], [16, 5.8], [21, 3.4], [25, 3.4], [26, 4.2], [27, 4.2], [28, 1.5]]);
  lathe(v, c, c, 0, 28, rf, (x, y) => (y <= 1 || y === 4 || y === 15 ? METAL_D : y === 9 || y === 10 ? stripe : y >= 26 ? METAL_L : METAL));
  for (const s of [-1, 1]) torus(v, c + s * 5, 19, c, 1.6, 0.5, METAL_D, 'x');
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.15 });
}

// firewoodPile({ seed }) — stacked split logs with end grain facing +z, on two sleepers
export function firewoodPile({ seed = 1, rows = 4 } = {}) {
  const v = new Vox(28, 22, 12);
  const R = rng(seed * 3 + 5);
  v.fill(1, 0, 1, 26, 0, 2, WOOD_DD); v.fill(1, 0, 9, 26, 0, 10, WOOD_DD);
  const bark = [0x5a3a24, 0x6a4a2e, 0x4e3220], grain = [0xd0a062, 0xc0904e, 0xdcb478];
  for (let row = 0; row < rows; row++) {
    const n = 5 - row, x0 = 3 + row * 2.5;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 5, y = 3 + row * 4.3, r = 2.2 + R() * 0.3, len = 9 + Math.floor(R() * 2), z0 = 1 + Math.floor(R() * 2);
      const b = bark[Math.floor(R() * 3)], g = grain[Math.floor(R() * 3)];
      v.cylinder(x, y, z0, r, len, (xx, yy, zz) => {
        const d = Math.hypot(xx - x, yy - y);
        if (zz === z0 + len - 1 || zz === z0) return d > r - 0.8 ? b : d < 0.8 ? tone(g, -0.25) : Math.round(d) === 2 ? tone(g, -0.1) : g;
        return d > r - 0.8 ? b : g;
      }, 'z');
    }
  }
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { radius: 0.5, breakable: true });
}

// stumpWithAxe({ seed, axe }) — tree stump with rings, roots, mushrooms and an axe stuck in the top
export function stumpWithAxe({ seed = 1, axe = true } = {}) {
  const v = new Vox(22, 24, 22);
  const c = 10.5, R = rng(seed);
  const top = 8;
  lathe(v, c, c, 0, top, (y) => 5.6 + (y < 3 ? (3 - y) * 0.7 : 0), (x, y, z, a, d, r) => {
    if (y === top) { const ring = Math.round(d) % 2 === 0; return d > r - 1 ? 0x5a3a24 : ring ? 0xb8864e : 0xd0a062; }
    return Math.floor(((a + Math.PI) / TAU) * 16) % 3 === 0 ? 0x4a2e1c : 0x6a4a2e;
  });
  // roots
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + R(); polyline(v, [[c + Math.cos(a) * 5, 2, c + Math.sin(a) * 5], [c + Math.cos(a) * 9, 0, c + Math.sin(a) * 9]], 0x5a3a24, 1); }
  // mushrooms
  for (const [dx, dz] of [[-5, 4], [-6.5, 2]]) { const x = Math.round(c + dx), z = Math.round(c + dz); v.fill(x, 0, z, x, 1, z, CREAM); v.ellipsoid(x, 2.3, z, 1.5, 0.8, 1.5, (xx, yy, zz) => ((xx + zz) % 3 === 0 ? 0xfff4e0 : 0xc8302a)); }
  mossify(v, seed, 0.15, (x, y, z) => y < top);
  if (axe) {
    // blade buried in the top, handle angled up and back
    const bx = Math.round(c + 1);
    for (let k = -2; k <= 2; k++) for (let y = top - 1; y <= top + 2; y++) v.set(bx + k, y, Math.round(c), y === top + 2 ? METAL_D : Math.abs(k) === 2 ? METAL_D : METAL);
    v.fill(bx - 1, top + 3, Math.round(c), bx + 1, top + 3, Math.round(c), METAL_D);
    polyline(v, [[bx, top + 3, c], [bx, top + 8, c - 4], [bx, top + 13, c - 8]], (x, y, z) => (y > top + 11 ? WOOD_D : WOOD_L));
  }
  bevel(v, { top: 0.06, bottom: 0, test: (x, y) => y !== top });
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.32 });
}

// canoe({ flip, paddle, color }) — 3.6 m cedar-strip canoe along z; flip = upside down on the shore
export function canoe({ flip = false, paddle = true, color = 0xb83a2a } = {}) {
  const L = 72, W = 18, v = new Vox(W, 12, L);
  const cx = 8.5;
  const inner = 0xb07a46, innerD = 0x8a5a32, gun = WOOD_L;
  for (let z = 0; z < L; z++) {
    const t = z / (L - 1), e = Math.abs(2 * t - 1);
    const hw = 7.6 * Math.pow(Math.sin(Math.PI * t), 0.55) + 0.4;
    const gh = 6 + Math.round(3.5 * Math.pow(e, 3.5));
    const deck = t < 0.07 || t > 0.93;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const dx = Math.abs(x - cx) / hw;
      if (dx > 1) continue;
      const yb = Math.round(dx * dx * 3 + 3.5 * Math.pow(e, 4));
      for (let y = yb; y <= gh; y++) {
        const shell = dx > 1 - 1.3 / hw || y <= yb + 0 || deck;
        if (!shell) continue;
        let col = y >= gh ? gun : y <= yb + 1 && dx < 0.8 ? tone(color, -0.25) : color;
        if (y === gh - 1 && dx > 0.8) col = tone(color, 0.1);
        v.set(x, y, z, col);
      }
      // inside skin (visible when upright)
      if (!deck && dx <= 1 - 1.3 / hw) { const y = yb + 1; v.set(x, y, z, z % 5 === 0 ? innerD : inner); }
    }
  }
  // inner wall colour, thwarts and seats
  v.paint((x, y, z, c) => {
    if (c !== color && c !== tone(color, 0.1)) return undefined;
    const t = z / (L - 1), hw = 7.6 * Math.pow(Math.sin(Math.PI * t), 0.55) + 0.4;
    return x > cx - hw + 1.3 && x < cx + hw - 1.3 && (x < cx ? !v.get(x - 1, y, z) || v.get(x + 1, y, z) === 0 : !v.get(x + 1, y, z) || !v.get(x - 1, y, z)) && Math.abs(x - cx) < hw - 0.5 ? (z % 5 === 0 ? innerD : inner) : undefined;
  });
  for (const z of [16, 36, 56]) { const t = z / (L - 1), hw = 7.6 * Math.pow(Math.sin(Math.PI * t), 0.55); v.fill(Math.round(cx - hw + 1), z === 36 ? 6 : 4, z, Math.round(cx + hw - 1), z === 36 ? 6 : 4, z + 1, gun); }
  if (paddle && !flip) {
    polyline(v, [[cx - 2, 3, 22], [cx + 2, 3, 46]], WOOD_L);
    v.ellipsoid(cx + 2.4, 3, 50, 1.6, 0.4, 3.5, WOOD);
  }
  let out = v;
  if (flip) { out = new Vox(W, v.h, L); for (let z = 0; z < L; z++) for (let y = 0; y < v.h; y++) for (let x = 0; x < W; x++) { const c = v.get(x, y, z); if (c) out.set(x, v.h - 1 - y, z, c); } const b = out.bounds(); const sh = new Vox(W, v.h, L); sh.blit(out, 0, -b.y0, 0); out = sh; }
  bevel(out, { top: 0.06, bottom: 0 });
  return finish(out, STD, { origin: [cx + 0.5, 0, L / 2], radius: 0.4, meta: { flip, length: L * STD } });
}

// lifeRing({ seed }) — red & white life buoy standing on edge, with rope grab-lines
export function lifeRing() {
  const v = new Vox(26, 26, 9);
  const c = 12.5, cy = 11.5, cz = 4;
  torus(v, c, cy, cz, 8, 3.1, (x, y, z, a) => {
    const u = ((a + Math.PI) / TAU) * 8;
    if (Math.abs(u - Math.round(u)) < 0.07 && Math.round(u) % 2 === 1) return 0xc8a868;
    return Math.floor(u) % 2 ? 0xd8302a : 0xf6f0e6;
  }, 'z');
  torus(v, c, cy, cz, 11.4, 0.6, (x, y, z, a) => ((Math.floor(((a + Math.PI) / TAU) * 40) % 2) ? 0xc8a868 : 0xa88850), 'z');
  bevel(v, { top: 0.06, bottom: -0.05 });
  return finish(v, FINE, { origin: [c + 0.5, 0, cz + 0.5], radius: 0.15, meta: { mount: 'stand-or-wall', ringCenterY: r3((cy + 0.5) * FINE) } });
}

// lobsterTrap({ seed, buoy }) — traditional arched wooden-slat trap with net inside and a buoy on top
export function lobsterTrap({ seed = 1, buoy: withBuoy = true } = {}) {
  const v = new Vox(20, 20, 14);
  const cz = 6.5, R = rng(seed);
  v.fill(1, 0, 1, 18, 0, 12, (x, y, z) => (z % 3 === 0 ? WOOD_D : GREYWOOD));
  v.fill(1, 0, 1, 18, 0, 1, WOOD_D); v.fill(1, 0, 12, 18, 0, 12, WOOD_D);
  for (let x = 1; x <= 18; x++) for (let z = 1; z <= 12; z++) for (let y = 1; y <= 7; y++) {
    const d = Math.hypot(z - cz, y - 1);
    if (d > 6.4 || d < 5.4) { if (d < 5.4 && d > 4.6 && x > 1 && x < 18) v.set(x, y, z, 0x2e4848); continue; }
    const hoop = x === 1 || x === 9 || x === 18;
    const ang = Math.atan2(y - 1, z - cz), slat = Math.floor((ang / Math.PI) * 9) % 2 === 0;
    if (hoop) v.set(x, y, z, WOOD_D);
    else if (slat) v.set(x, y, z, (x + Math.floor((ang / Math.PI) * 9)) % 5 === 0 ? GREYWOOD_D : GREYWOOD_L);
  }
  // end panels are net
  for (const x of [1, 18]) for (let z = 1; z <= 12; z++) for (let y = 1; y <= 6; y++) if (Math.hypot(z - cz, y - 1) < 5.4) v.set(x, y, z, (y + z) % 2 ? 0x2e4848 : 0x3e5a5a);
  if (withBuoy) {
    lathe(v, 13, cz, 8, 13, profile([[8, 1.2], [9, 2], [12, 2], [13, 1]]), (x, y) => (y < 10 ? 0xf2c23a : y < 12 ? 0xd8302a : 0xf6f0e6));
    v.fill(13, 14, Math.round(cz), 13, 15, Math.round(cz), WOOD);
    polyline(v, [[13, 8, cz], [10, 7.5, cz + 1], [6, 7.5, cz]], 0xc8a868);
  }
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { radius: 0.4, breakable: true });
}

const BUOY_SCHEMES = [[0xd8302a, 0xf6f0e6, 0xf2c23a], [0x3a7ad8, 0xf2c23a, 0x3a7ad8], [0x3aa85a, 0xf6f0e6, 0xd8302a], [0xf08a24, 0x2e2a32, 0xf08a24]];
// buoy({ seed }) — painted lobster float on a wooden spindle; stripes vary by seed
export function buoy({ seed = 1 } = {}) {
  const v = new Vox(12, 26, 12);
  const c = 5.5, [a, b, d] = BUOY_SCHEMES[seed % BUOY_SCHEMES.length];
  v.fill(5, 0, 5, 6, 23, 6, (x, y) => (y > 21 ? WOOD_D : WOOD));
  lathe(v, c, c, 3, 18, profile([[3, 2], [5, 4.2], [12, 4.6], [16, 3.6], [18, 2]]), (x, y) => (y < 8 ? a : y < 12 ? b : d));
  bevel(v, { top: 0.1, bottom: -0.08 });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.11 });
}

// streetLamp({ variant: post|hook, lit }) — ~3.2 m cast-iron lamp with a glowing lantern head
export function streetLamp({ variant = 'post', lit = true } = {}) {
  const v = new Vox(24, 68, 14);
  const c = 6.5, cz = 6.5;
  const glass = lit ? 0xffd890 | EMIT : 0xb8b0a0 | GLASS;
  rbox(v, 3, 0, 3, 10, 3, 10, 1, (x, y) => (y === 3 ? IRON_L : IRON), 0);
  rbox(v, 4, 4, 4, 9, 6, 9, 1, (x, y) => (y === 6 ? IRON_L : IRON), 0);
  const topY = variant === 'hook' ? 60 : 50;
  lathe(v, c, cz, 7, topY, (y) => ([20, 21, 46].includes(y) ? 2 : y < 12 ? 1.6 : 1.1), (x, y) => ([20, 21, 46].includes(y) ? IRON_L : IRON));
  let head, lights;
  const lanternAt = (hx, by) => {
    lathe(v, hx, cz, by, by + 1, (y) => (y === by ? 2 : 3), IRON);
    for (let y = by + 2; y <= by + 8; y++) for (let z = Math.round(cz - 2); z <= Math.round(cz + 2); z++) for (let x = Math.round(hx - 2); x <= Math.round(hx + 2); x++) {
      const corner = (Math.abs(x - hx) > 1.6) && (Math.abs(z - cz) > 1.6);
      v.set(x, y, z, corner ? IRON : y === by + 5 ? tone(glass, 0.1) : glass);
    }
    for (let k = 0; k <= 3; k++) lathe(v, hx, cz, by + 9 + k, by + 9 + k, 3.6 - k * 1.1, k === 0 ? IRON_L : IRON);
    v.set(Math.round(hx), by + 13, Math.round(cz), IRON_L);
    return [hx, by + 5, cz];
  };
  if (variant === 'hook') {
    polyline(v, [[c, 60, cz], [c + 3, 63, cz], [c + 8, 64, cz], [c + 12, 62, cz]], IRON, 0.6);
    v.fill(Math.round(c + 12), 59, Math.round(cz), Math.round(c + 12), 61, Math.round(cz), IRON);
    head = lanternAt(c + 12, 46);
  } else head = lanternAt(c, 51);
  lights = lit ? [{ at: head, color: L_LAMP, radius: 10 }] : [];
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, STD, { origin: [c + 0.5, 0, cz + 0.5], radius: 0.15, lights, meta: { variant } });
}

// porchLantern({ lit }) — wall-mounted lantern; origin = back-bottom centre (place against a wall, +z faces out)
export function porchLantern({ lit = true, color = 'black' } = {}) {
  const v = new Vox(12, 26, 12);
  const c = 5.5;
  const [m, mD, mL] = LANTERN_COLS[color] || LANTERN_COLS.black;
  const glass = lit ? 0xffd27a | EMIT : 0xb8b0a0 | GLASS;
  rbox(v, 3, 4, 0, 8, 22, 1, 1, (x, y) => (y === 22 ? mL : m), 1);
  v.fill(5, 19, 2, 6, 19, 6, mD); v.fill(5, 18, 6, 6, 19, 6, mD);
  // lantern box hanging under the arm
  v.fill(3, 4, 4, 8, 5, 9, m);
  for (let y = 6; y <= 13; y++) for (let z = 4; z <= 9; z++) for (let x = 3; x <= 8; x++) {
    const corner = (x === 3 || x === 8) && (z === 4 || z === 9);
    const bar = y === 10 && (x === 3 || x === 8 || z === 4 || z === 9);
    v.set(x, y, z, corner || bar ? mD : glass);
  }
  for (let k = 0; k < 3; k++) v.fill(3 + k, 14 + k, 4 + k, 8 - k, 14 + k, 9 - k, k ? m : mL);
  v.fill(5, 17, 6, 6, 17, 7, mL);
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, FINE, { origin: [c + 0.5, 0, 0], radius: 0.08, lights: lit ? [{ at: [c, 9, 6.5], color: L_LAMP, radius: 5 }] : [], meta: { mount: 'wall' } });
}

// firePit({ lit, seed }) — ring of stones around a log teepee with embers and flames
export function firePit({ lit = true, seed = 1 } = {}) {
  const v = new Vox(24, 18, 24);
  const c = 11.5, R = rng(seed * 5 + 2);
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + R() * 0.15, col = [STONE, STONE_L, 0x7e7c88][i % 3];
    v.ellipsoid(c + Math.cos(a) * 8, 1.2, c + Math.sin(a) * 8, 2.3, 1.6 + R() * 0.6, 2, (x, y) => (y >= 2 ? tone(col, 0.1) : col));
  }
  lathe(v, c, c, 0, 0, 6, (x, y, z) => (lit && vhash(x, 0, z, seed) < 0.35 ? 0xff5a1e | EMIT : vhash(x, 1, z, seed) < 0.5 ? 0x3a3438 : 0x5a545a));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + 0.4; polyline(v, [[c + Math.cos(a) * 4.8, 1, c + Math.sin(a) * 4.8], [c + Math.cos(a) * 0.8, 9, c + Math.sin(a) * 0.8]], (x, y) => (y > 7 ? 0x2e221c : y % 3 === 0 ? 0x4a2e1c : 0x6a4a2e), 0.8); }
  const lights = [];
  if (lit) {
    flame(v, c, 1, c, 9, 2.6, 0.2);
    flame(v, c - 2, 1, c + 1, 6, 1.6, -0.3);
    flame(v, c + 2, 1, c - 1, 7, 1.6, 0.3);
    lights.push({ at: [c, 5, c], color: [1.0, 0.55, 0.22], radius: 7 });
  }
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.55, lights, meta: { lit } });
}

const SAPLING_LEAVES = { maple: [0xc8401e, 0xe06428, 0xa83018], gold: [0xe8b830, 0xd89a28, 0xf2d060], orange: [0xe8781e, 0xf6a040, 0xc85a1a], green: [LEAF, LEAF_L, LEAF_D] };
// paint a young tree whose base sits at (cx, by, cz)
function paintSapling(v, cx, by, cz, { seed = 1, leaves = 'maple', stake = true, height = 40 } = {}) {
  const R = rng(seed * 7 + 3), pal = SAPLING_LEAVES[leaves] || SAPLING_LEAVES.maple;
  const pts = [[cx, by, cz]];
  for (let i = 1; i <= 4; i++) pts.push([cx + (R() - 0.5) * 2, by + (height * i) / 4, cz + (R() - 0.5) * 2]);
  polyline(v, pts.slice(0, 3), 0x6a4a2e, 0.8);
  polyline(v, pts.slice(2), 0x7a5634, 0);
  const tips = [pts[4]];
  for (let i = 0; i < 4; i++) {
    const base = pts[2 + (i % 2)], a = (i / 4) * TAU + R(), L = 5 + R() * 4;
    const tip = [base[0] + Math.cos(a) * L, base[1] + 4 + R() * 4, base[2] + Math.sin(a) * L];
    polyline(v, [base, tip], 0x7a5634);
    tips.push(tip);
  }
  // fill the crown: clusters at the branch tips plus a few between them so it reads as one canopy
  const top = pts[4];
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + 0.8; tips.push([top[0] + Math.cos(a) * 3.5, top[1] - 5, top[2] + Math.sin(a) * 3.5]); }
  for (const [x, y, z] of tips) v.ellipsoid(x, y + 1, z, 4.4, 3.4, 4.4, (xx, yy, zz) => { const n = vhash(xx >> 1, yy >> 1, zz >> 1, seed); return n < 0.3 ? pal[2] : n < 0.75 ? pal[0] : pal[1]; });
  if (stake) {
    v.fill(Math.round(cx) + 3, by, Math.round(cz), Math.round(cx) + 3, by + Math.round(height * 0.6), Math.round(cz), GREYWOOD);
    v.fill(Math.round(cx), by + Math.round(height * 0.5), Math.round(cz), Math.round(cx) + 3, by + Math.round(height * 0.5), Math.round(cz), 0x9a4428);
  }
}
// youngSapling({ seed, leaves: maple|gold|orange|green, stake }) — ~1.2 m young tree with a support stake
export function youngSapling({ seed = 1, leaves = 'maple', stake = true } = {}) {
  const v = new Vox(30, 52, 30);
  const c = 14.5;
  lathe(v, c, c, 0, 1, (y) => (y === 0 ? 4.5 : 3.2), (x, y) => (y === 1 ? DIRT_L : DIRT));
  paintSapling(v, c, 2, c, { seed, leaves, stake });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.12, meta: { leaves } });
}
// dirtMound({ stage: hole|mound|sprout|sapling, seed }) — tree-planting quest stages
export function dirtMound({ stage = 'mound', seed = 1, leaves = 'maple' } = {}) {
  const v = new Vox(30, 56, 30);
  const c = 14.5, R = rng(seed * 3 + 9);
  const soil = (x, y, z) => { const n = vhash(x >> 1, y, z >> 1, seed); return n < 0.25 ? DIRT_D : n < 0.8 ? DIRT : DIRT_L; };
  v.ellipsoid(c, -2, c, 12, 6.5, 11, soil);
  for (let i = 0; i < 10; i++) { const a = R() * TAU, x = Math.round(c + Math.cos(a) * 11), z = Math.round(c + Math.sin(a) * 10.5); const y = topY(v, x, z); v.set(x, y + 1, z, MOSS); if (i % 2) v.set(x, y + 2, z, MOSS_L); }
  if (stage === 'hole') {
    v.carve((x, y, z) => ((x - c) / 4.5) ** 2 + ((y - 4.5) / 3.5) ** 2 + ((z - c) / 4.5) ** 2 <= 1);
    v.paint((x, y, z, col) => (Math.hypot(x - c, z - c) < 5.6 && y < 5 && !v.get(x, y + 1, z) ? 0x3a2618 : undefined));
    v.ellipsoid(c + 8, 3, c - 5, 4, 3, 3.5, soil);
    // little shovel stuck in the dirt pile
    v.fill(Math.round(c + 8), 5, Math.round(c - 5), Math.round(c + 8), 18, Math.round(c - 5), WOOD_L);
    v.fill(Math.round(c + 7), 18, Math.round(c - 5), Math.round(c + 9), 18, Math.round(c - 5), WOOD_D);
    v.fill(Math.round(c + 7), 3, Math.round(c - 5), Math.round(c + 9), 5, Math.round(c - 5), METAL);
  } else {
    v.ellipsoid(c, 3, c, 5, 2.4, 5, (x, y, z) => (y < 3 ? undefined : vhash(x, y, z, seed) < 0.5 ? 0x4a3022 : 0x5a3a26));
    const ty = topY(v, Math.round(c), Math.round(c));
    if (stage === 'sprout') {
      v.fill(Math.round(c), ty + 1, Math.round(c), Math.round(c), ty + 3, Math.round(c), LEAF_D);
      v.set(Math.round(c) - 1, ty + 4, Math.round(c), LEAF_L); v.set(Math.round(c) - 2, ty + 4, Math.round(c), LEAF);
      v.set(Math.round(c) + 1, ty + 4, Math.round(c), LEAF_L); v.set(Math.round(c) + 2, ty + 5, Math.round(c), LEAF);
    } else if (stage === 'sapling') paintSapling(v, c, ty + 1, c, { seed, leaves });
    else if (stage === 'mound') v.set(Math.round(c), ty + 1, Math.round(c), 0x8a6a3a);
  }
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.28, meta: { stage, plantPoint: [0, r3(5 * FINE), 0] } });
}

// gardenGnome({ seed, hat }) — red-capped gnome with a white beard holding a tiny jack-o'-lantern
export function gardenGnome({ seed = 1, hat = 0xc8302a } = {}) {
  const v = new Vox(16, 30, 16);
  const c = 7.5;
  const tunic = [DENIM, 0x3e6a42, PURPLE][seed % 3];
  for (const s of [-1, 1]) v.ellipsoid(c + s * 1.8, 1, c + 1, 1.6, 1.2, 2.2, 0x4a2e1c);
  v.ellipsoid(c, 7, c, 4.6, 5.2, 4.2, (x, y) => (y === 5 ? 0x3a2418 : tunic));
  v.fill(7, 5, 12, 8, 5, 12, GOLD);
  for (const s of [-1, 1]) v.ellipsoid(c + s * 3.2, 7.5, c + 2.5, 1.3, 1.8, 1.3, tunic);
  // tiny jack-o'-lantern in its hands
  v.ellipsoid(c, 6, c + 4.6, 1.8, 1.6, 1.4, ORANGE);
  v.set(7, 6, 14, 0xffc44a | EMIT); v.set(9, 6, 14, 0xffc44a | EMIT); v.set(8, 5, 14, 0xffc44a | EMIT);
  v.set(8, 8, 13, LEAF_D);
  v.ellipsoid(c, 13.5, c + 0.5, 3.3, 3, 3, 0xf2c0a0);
  v.ellipsoid(c, 10.5, c + 2.2, 3.6, 3.4, 2, BONE_L);
  for (const s of [-1, 1]) v.ellipsoid(c + s * 2.8, 12.8, c + 2, 1.2, 1.6, 1.2, BONE_L);
  v.ellipsoid(c, 13, c + 3.6, 1, 0.9, 0.9, 0xf28a8a);
  v.set(6, 14, frontZ(v, 6, 14), INK); v.set(9, 14, frontZ(v, 9, 14), INK);
  lathe(v, (y, t) => c + t * t * 2.5, c, 15, 26, (y, t) => 3.8 * (1 - t) + 0.4, (x, y, z, a, d, r, t) => (t > 0.85 ? tone(hat, 0.15) : hat));
  lathe(v, c, c, 15, 15, 4, tone(hat, -0.15));
  bevel(v, { top: 0.06, bottom: -0.05 });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.12, breakable: true, lights: [{ at: [c, 6, c + 5], color: L_JACK, radius: 1 }] });
}

// lawnFlamingo({ hat }) — pink lawn flamingo on wire legs, optionally wearing a tiny witch hat
export function lawnFlamingo({ hat = true } = {}) {
  const v = new Vox(18, 42, 22);
  const c = 8.5, cz = 9.5;
  const pink = 0xf08aa8, pinkD = 0xc8607e, pinkL = 0xf8b0c4;
  v.fill(8, 0, 9, 8, 14, 9, pinkD);
  polyline(v, [[10, 4, 10], [10, 10, 9], [9, 14, 9]], pinkD);
  polyline(v, [[10, 10, 9], [11, 8, 11]], pinkD);
  v.ellipsoid(c, 17, cz - 1, 3.6, 3.2, 6, (x, y, z) => (y > 18 ? pinkL : pink));
  for (const s of [-1, 1]) v.ellipsoid(c + s * 2.6, 17.5, cz - 2, 1.2, 2.2, 4.4, pinkD);
  v.ellipsoid(c, 18.5, cz - 7.2, 1.6, 1.2, 1.8, pinkD);
  polyline(v, [[c, 19, cz + 4], [c, 23, cz + 6], [c, 27, cz + 4], [c, 31, cz + 3], [c, 33, cz + 5]], pink, 0.9);
  v.ellipsoid(c, 34, cz + 6, 1.8, 1.7, 2.2, pink);
  polyline(v, [[c, 34, cz + 8], [c, 33, cz + 10], [c, 31.5, cz + 10.5]], (x, y) => (y < 32.5 ? INK : 0xfff0e0));
  v.set(Math.round(c) - 1, 35, Math.round(cz + 6), INK); v.set(Math.round(c) + 1, 35, Math.round(cz + 6), INK);
  if (hat) paintWitchHat(v, c, 36, cz + 6, 0.32, { band: PURPLE_L });
  bevel(v, { top: 0.06, bottom: -0.05 });
  return finish(v, FINE, { origin: [c + 0.5, 0, cz + 0.5], radius: 0.1, meta: { hat } });
}

// ===================================================== SMALL ITEMS (pickups)
// (oversized ~1.5-2x for readability at gameplay distance; all at 0.025 m voxels)

// wrappedCandy({ color: red|purple|green|orange|blue|yellow }) — striped sweet with twisted wrapper ends
export function wrappedCandy({ color = 'red' } = {}) {
  const C = { red: [0xd83a3a, 0xfff0e0], purple: [0x8a4ab8, 0xf2d24a], green: [0x3aa85a, 0xfff0e0], orange: [0xf08a24, 0x2e2232], blue: [0x3a7ad8, 0xfff0e0], yellow: [0xf2c23a, 0xd83a3a] }[color] || [0xd83a3a, 0xfff0e0];
  const v = new Vox(16, 7, 7);
  const c = 3;
  v.ellipsoid(7.5, c, c, 3.6, 2.6, 2.6, (x, y, z) => ((x + y + z) % 4 < 2 ? C[0] : C[1]));
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? 3 : 12;
    v.set(x0, c, c, tone(C[0], -0.2));
    for (let k = 1; k <= 3; k++) { const x = x0 + s * k, r = k * 0.9; for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) for (let z = -1; z <= 1; z++) if (Math.abs(y) <= r && (Math.abs(z) < 1 || k < 3)) v.set(x, c + y, c + z, k === 3 ? tone(C[0], 0.25) : tone(C[0], 0.12)); }
  }
  bevel(v, { top: 0.08, bottom: -0.08 });
  return finish(v, FINE, { radius: 0.08, meta: { pickup: true, color } });
}

// letter({ seal, stamp }) — envelope lying flat with a red wax seal and a stamp
export function letter({ seal = 0xc8302a, stamp = TEAL } = {}) {
  const W = 14, D = 10, v = new Vox(W, 3, D);
  const paper = 0xf4ead4, fold = 0xd8ccb0;
  v.fill(0, 0, 0, W - 1, 1, D - 1, (x, y, z) => (y === 0 ? fold : paper));
  // flap V lines
  for (let x = 0; x < W; x++) { const z = Math.round(D - 1 - Math.min(x, W - 1 - x) * (D * 0.55 / (W / 2))); if (z >= 0) v.set(x, 1, z, fold); }
  // seal + stamp + address lines
  v.fill(6, 2, 4, 7, 2, 5, seal); v.set(6, 2, 4, tone(seal, 0.2));
  v.fill(10, 2, 1, 12, 2, 2, stamp); v.set(10, 2, 1, 0xfff4e0);
  for (const [z, a, b] of [[1, 2, 7], [2, 2, 6]]) for (let x = a; x <= b; x++) if (x % 3) v.set(x, 1, z, 0x8a8070);
  return finish(v, FINE, { radius: 0.12, meta: { pickup: true } });
}

// parcel({ seed }) — kraft-paper box tied with string, a bow and an address tag
export function parcel({ seed = 1 } = {}) {
  const v = new Vox(14, 13, 12);
  const kraft = [0xb8895a, 0xa87a4a, 0xc89a68][seed % 3], string = 0xf0e0c0;
  rbox(v, 0, 0, 0, 13, 8, 11, 0, (x, y, z) => (x === 6 || x === 7 || z === 5 || z === 6 ? string : y === 8 ? tone(kraft, 0.08) : kraft));
  // bow
  for (const s of [-1, 1]) torus(v, 6.5 + s * 2, 10, 5.5, 1.4, 0.55, string, 'z');
  v.fill(6, 9, 5, 7, 9, 6, tone(string, -0.1));
  // tag
  v.fill(1, 3, 12, 5, 6, 12, 0xfff4e0);
  for (let x = 2; x <= 4; x++) { v.set(x, 5, 12, 0x6a6a7a); if (x < 4) v.set(x, 4, 12, 0x6a6a7a); }
  v.fill(9, 2, 12, 12, 3, 12, 0xc8302a);
  bevel(v, { top: 0, bottom: -0.06 });
  return finish(v, FINE, { radius: 0.15, breakable: true, meta: { pickup: true } });
}

// camera() — old leather box camera with a big lens, viewfinder and carry strap
export function camera() {
  const v = new Vox(14, 14, 14);
  const leather = 0x3a2a24, trim = METAL_L;
  rbox(v, 1, 0, 2, 12, 9, 10, 1, (x, y, z) => (y === 9 ? 0x4a3a32 : (x === 1 || x === 12) && (y === 0 || y === 9) ? trim : leather));
  v.fill(2, 9, 2, 11, 9, 2, trim); v.fill(2, 0, 10, 11, 0, 10, trim);
  // lens barrel
  v.cylinder(6.5, 4.5, 11, 3, 2, (x, y, z) => (Math.hypot(x - 6.5, y - 4.5) > 2.2 ? METAL_D : METAL), 'z');
  v.cylinder(6.5, 4.5, 13, 2.2, 1, (x, y) => (Math.hypot(x - 6.5, y - 4.5) < 1.2 ? 0x3a5a8a | GLASS : 0x1e1a22), 'z');
  // viewfinder windows, shutter button, winding knob, strap
  v.fill(2, 7, 11, 3, 8, 11, 0x5a7aa0 | GLASS); v.fill(10, 7, 11, 11, 8, 11, 0x5a7aa0 | GLASS);
  v.set(10, 10, 4, 0xc8302a);
  v.cylinder(13, 6, 6, 1.5, 1, METAL, 'x');
  polyline(v, [[4, 10, 6], [5, 12, 6], [8, 12, 6], [9, 10, 6]], 0x5a3a2a, 0);
  bevel(v, { top: 0.06, bottom: -0.06 });
  return finish(v, FINE, { radius: 0.15, meta: { pickup: true } });
}

// wateringCan({ color }) — painted can with a long spout and a sprinkler rose
export function wateringCan({ color = 0x3e8a6a } = {}) {
  const v = new Vox(16, 18, 24);
  const c = 7.5, cz = 8;
  const m = color, mD = tone(color, -0.25), mL = tone(color, 0.18);
  lathe(v, c, cz, 0, 9, (y, t) => 5 - (y > 7 ? (y - 7) * 0.8 : 0), (x, y) => (y === 0 || y === 4 ? mD : y === 9 ? mL : m));
  lathe(v, c, cz, 10, 10, 2.4, (x, y, z, a, d) => (d > 1.4 ? mL : 0x2e3a3a));
  polyline(v, [[c, 2, cz + 4], [c, 8, cz + 10], [c, 12, cz + 13]], m, 0.9);
  v.ellipsoid(c, 13, cz + 14, 2.2, 2.2, 1, (x, y, z) => (z > cz + 14 ? ((x + y) % 2 ? mD : METAL_L) : mL));
  const pts = []; for (let i = 0; i <= 12; i++) { const t = (i / 12) * Math.PI; pts.push([c, 8 + Math.sin(t) * 6.5, cz - 4 + Math.cos(t) * -1 + (i / 12) * 6 - 2]); }
  polyline(v, [[c, 9, cz - 3], [c, 14, cz - 3], [c, 15, cz + 1], [c, 11, cz + 2]], mD, 0.6);
  polyline(v, [[c, 3, cz - 5], [c, 6, cz - 7], [c, 9, cz - 5]], mD, 0.6);
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, FINE, { origin: [c + 0.5, 0, cz + 0.5], radius: 0.15, meta: { pickup: true } });
}

// compass() — brass pocket compass, lid open, red needle pointing north (-z)
export function compass() {
  const v = new Vox(14, 13, 14);
  const c = 6.5;
  lathe(v, c, 7, 0, 1, 5.4, (x, y, z, a, d) => (y === 1 && d > 4.4 ? GOLD_L : GOLD_D));
  lathe(v, c, 7, 2, 2, 5.4, (x, y, z, a, d) => (d > 4.4 ? GOLD : 0));
  lathe(v, c, 7, 1, 1, 4.4, (x, y, z, a, d) => (d > 3.6 && Math.floor(((a + Math.PI) / TAU) * 16) % 4 === 0 ? 0x3a3440 : 0xfff4e0));
  for (const [z, col] of [[3, 0xd8302a], [4, 0xd8302a], [5, 0xd8302a], [6, 0xd8302a], [8, 0x3a5a9a], [9, 0x3a5a9a], [10, 0x3a5a9a]]) v.set(Math.round(c), 2, z, col);
  v.set(Math.round(c), 2, 7, GOLD_L);
  // open lid standing at the back with a mirror
  for (let y = 2; y <= 12; y++) for (let x = 1; x <= 12; x++) { const d = Math.hypot(x - c, y - 7.5); if (d <= 5.4) { v.set(x, y, 1, d > 4.4 ? GOLD : 0xc8d0dc); v.set(x, y, 0, GOLD_D); } }
  torus(v, 13, 1.5, 7, 1.2, 0.5, GOLD, 'z');
  return finish(v, FINE, { radius: 0.14, meta: { pickup: true } });
}

// hockeyPuck() — rubber puck with a red maple leaf on top
export function hockeyPuck() {
  const v = new Vox(9, 3, 9);
  const c = 4;
  lathe(v, c, c, 0, 1, 3.8, (x, y, z, a, d) => (y === 1 && d > 3 ? 0x3e3a44 : 0x26222a));
  decal(v, ['..#..', '#.#.#', '#####', '.###.', '..#..'], c, 0, {});
  const leaf = ['..#..', '#.#.#', '#####', '.###.', '..#..'];
  leaf.forEach((row, rz) => { for (let i = 0; i < 5; i++) if (row[i] === '#') v.set(c - 2 + i, 2, c - 2 + rz, 0xd8302a); });
  return finish(v, FINE, { radius: 0.09, meta: { pickup: true } });
}

// stethoscope() — lying flat: chest piece, tubing loop and metal ear tubes
export function stethoscope() {
  const v = new Vox(18, 4, 22);
  const tube = 0x2e4a6a;
  lathe(v, 9, 18, 0, 1, 2.6, (x, y, z, a, d) => (y === 1 && d < 1.6 ? METAL_D : METAL_L));
  polyline(v, [[9, 1, 15.5], [11, 1, 12], [12, 1, 8], [10, 1, 5], [9, 1, 4]], tube, 0.6);
  for (const s of [-1, 1]) {
    polyline(v, [[9, 1, 4], [9 + s * 3, 1, 2], [9 + s * 5, 1, 4], [9 + s * 6, 1, 8]], METAL_L);
    v.ellipsoid(9 + s * 6, 1, 9, 1.1, 1, 1.1, 0x3a3440);
  }
  return finish(v, FINE, { radius: 0.2, meta: { pickup: true } });
}

// mountieHat() — RCMP-style campaign hat with the four-dent "Montana pinch"
export function mountieHat() {
  const v = new Vox(22, 12, 22);
  const c = 10.5, felt = 0x7a5a36, feltD = 0x5a4026, feltL = 0x94704a;
  lathe(v, c, c, 0, 0, 9.6, (x, y, z, a, d) => (d > 8.8 ? feltD : felt));
  for (let z = 0; z < 22; z++) for (let x = 0; x < 22; x++) {
    const dx = x - c, dz = z - c, m = Math.max(Math.abs(dx), Math.abs(dz)), d = Math.hypot(dx, dz);
    if (d > 4.8) continue;
    const pinch = Math.min(Math.abs(dx), Math.abs(dz)) < 0.8 && d > 1.5 ? 1 : 0;
    const top = Math.round(6 + 2.5 * (1 - m / 4.8)) - pinch;
    for (let y = 1; y <= top; y++) v.set(x, y, z, y <= 2 ? 0x3a2418 : y === top ? feltL : felt);
  }
  v.set(Math.round(c), 2, Math.round(c + 5), GOLD);
  bevel(v, { top: 0, bottom: -0.08 });
  return finish(v, FINE, { origin: [c + 0.5, 0, c + 0.5], radius: 0.24, meta: { pickup: true, wearable: true } });
}

// trophyCup({ seed }) — gold two-handled cup on a wooden plinth with an engraved maple leaf
export function trophyCup() {
  const v = new Vox(20, 22, 14);
  const c = 9.5, cz = 6.5;
  rbox(v, 4, 0, 1, 15, 3, 12, 1, (x, y) => (y === 3 ? 0x5e3a24 : 0x4a2e1c), 0);
  v.fill(7, 1, 13, 12, 2, 13, GOLD_L);
  lathe(v, c, cz, 4, 4, 3, GOLD_D);
  lathe(v, c, cz, 5, 8, (y) => (y === 6 ? 1.8 : 1.1), GOLD);
  lathe(v, c, cz, 9, 18, (y, t) => 2 + 4.2 * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5), (x, y, z, a, d, r, t) => (t > 0.9 ? GOLD_L : t > 0.5 && Math.cos(a - 0.6) > 0.7 ? GOLD_L : GOLD), { wall: 1.2, floor: 10 });
  lathe(v, c, cz, 17, 17, 4.6, (x, y, z, a, d, r) => (d > r - 1.2 ? 0 : 0x8a6418));
  for (const s of [-1, 1]) torus(v, c + s * 6.4, 14, cz, 2, 0.6, GOLD_D, 'z');
  relief(v, ['..#..', '#.#.#', '#####', '.###.', '..#..'], c, 14, { '#': [GOLD_D, 0] });
  bevel(v, { top: 0.08, bottom: 0, test: (x, y) => y > 3 });
  return finish(v, FINE, { origin: [c + 0.5, 0, cz + 0.5], radius: 0.16, meta: { pickup: true } });
}

// ================================================================== the remade map: town, coast & countryside
const MID = 0.1; // chunky large props (sidewalks, ramps, corn rows, boats)
const CONCRETE = 0xb8b2a6, CONCRETE_D = 0x9e988c, CONCRETE_L = 0xccc6ba, GRANITE = 0x8e8c94, GRANITE_L = 0xa8a6ae;
const POST_RED = 0xc8282a, POST_RED_D = 0x961e20;
const pmk = (v, x, y, z, r, seed = 1) => paintPumpkin(v, x, y, z, { rx: r, ry: r * 0.78, seed });
// a sign plane description for voxelWorld (metres relative to the finished model's origin)
function signPlane(pre, size, at, w, h, text, o = {}) {
  return { x: r3((at[0] - pre[0]) * size), y: r3((at[1] - pre[1]) * size), z: r3((at[2] - pre[2]) * size), w: r3(w * size), h: r3(h * size), text, normal: o.normal || [0, 0, 1], bg: o.bg || '#f2e6c8', fg: o.fg || '#3a2418', kind: o.kind || 'board' };
}

// sidewalk({ len, w, seed }) — a length of concrete paving with a granite curb along its +z (road) edge.
// 0.1 m voxels, 0.4 m tall (bury ~0.2 m); origin at the centre of the base.
export function sidewalk({ len = 4, w = 2.6, seed = 1 } = {}) {
  const L = Math.round(len / MID), Wd = Math.round(w / MID), H = 4;
  const v = new Vox(L, H, Wd);
  const R = rng(seed * 13 + 1);
  const slabT = [];
  for (let i = 0; i < 8; i++) slabT.push([CONCRETE, CONCRETE_L, tone(CONCRETE, -0.04), tone(CONCRETE, 0.03)][Math.floor(R() * 4)]);
  // granite curb stones of uneven lengths, each a shade of its own, joints between
  const curbJ = new Set();
  for (let x = Math.floor(R() * 6); x < L; x += 9 + Math.floor(R() * 7)) curbJ.add(x);
  let stone = 0;
  const half = Math.floor((Wd - 2) / 2);
  for (let x = 0; x < L; x++) {
    if (curbJ.has(x)) stone++;
    const gT = stone % 3 === 1 ? tone(GRANITE, 0.04) : stone % 3 === 2 ? tone(GRANITE, -0.03) : GRANITE;
    for (let z = 0; z < Wd; z++) {
      const curb = z >= Wd - 2;
      for (let y = 0; y < H; y++) {
        let c;
        if (curb) {
          if (curbJ.has(x) && y >= H - 2) c = tone(GRANITE, -0.18);
          else if (y === H - 1) c = z === Wd - 1 ? gT : (x + stone) % 7 === 0 ? tone(GRANITE_L, 0.05) : GRANITE_L; // a worn, lighter top
          else c = y === H - 2 && z === Wd - 1 ? tone(gT, -0.05) : gT;
        } else if (y < H - 1) c = CONCRETE_D;
        else {
          // flagstones a metre long, two across, the odd one weathered or patched darker
          const sx = Math.floor(x / 10), sz = z < half ? 0 : 1;
          const seam = x % 10 === 0 || z === half;
          c = seam ? CONCRETE_D : slabT[(sx * 2 + sz) % slabT.length];
          // the gutter edge of each slab and the shop-front edge collect grime
          if (!seam && (z === 0 || z === Wd - 3) && (x + z * 3) % 4 === 0) c = tone(c, -0.06);
        }
        v.set(x, y, z, c);
      }
    }
  }
  // hairline cracks wandering across a slab or two
  for (let i = 0; i < 2 + Math.floor(R() * 2); i++) {
    let x = 2 + Math.floor(R() * (L - 6)), z = 1 + Math.floor(R() * (Wd - 5));
    const dx = R() < 0.5 ? 1 : -1;
    for (let k = 0; k < 3 + Math.floor(R() * 4); k++) {
      if (z >= Wd - 2 || z < 0) break;
      v.set(x, H - 1, z, tone(CONCRETE_D, -0.08));
      if (R() < 0.6) x += dx; else z += 1;
    }
  }
  // a dark spot or two (spilt cocoa, old gum)
  for (let i = 0; i < 2; i++) v.set(1 + Math.floor(R() * (L - 2)), H - 1, 1 + Math.floor(R() * (Wd - 4)), tone(CONCRETE, -0.16));
  // moss and grass tufts in the seams at the shop-front edge, fallen leaves drifted against the curb
  for (let x = 0; x < L; x += 10) if (R() < 0.6) { v.set(x, H, 0, 0x6a7a34); if (R() < 0.5) v.set(x, H, 1, 0x7e8c3c); }
  for (let i = 0; i < 7; i++) {
    const z = i < 4 ? Wd - 3 - Math.floor(R() * 2) : Math.floor(R() * (Wd - 3));
    v.set(Math.floor(R() * L), H, z, [0xc8401e, 0xe8781e, 0xd8a032, 0x9e3b1b][i % 4]);
  }
  return finish(v, MID, { origin: [L / 2, 0, Wd / 2], radius: 0.1, meta: { top: H * MID } });
}

// townLamp({ banner }) — Main Street lamp: fluted iron post, twin acorn globes, a maple-leaf banner
export function townLamp({ banner = true, flip = false } = {}) {
  const v = new Vox(30, 90, 12);
  const c = 14.5, cz = 5.5;
  const glass = 0xffd890 | EMIT;
  lathe(v, c, cz, 0, 5, (y) => (y < 2 ? 3.4 : 2.6), (x, y) => (y === 5 || y === 1 ? IRON_L : IRON));
  lathe(v, c, cz, 6, 70, (y) => (y < 14 ? 1.9 : 1.3), (x, y, z, a) => (y < 14 && Math.floor((a + Math.PI) * 2) % 2 ? IRON_L : IRON));
  lathe(v, c, cz, 70, 72, 2, IRON_L);
  // crossarm with scrolls
  v.fill(c - 11, 72, cz, c + 11, 73, cz, IRON);
  for (const s of [-1, 1]) {
    polyline(v, [[c + s * 2, 66, cz], [c + s * 6, 70, cz], [c + s * 10, 71, cz]], IRON, 0.5);
    const gx = c + s * 11;
    v.fill(Math.round(gx) - 1, 74, cz - 1, Math.round(gx) + 1, 74, cz + 1, IRON);
    lathe(v, gx, cz, 75, 83, (y) => [2.2, 2.8, 3.1, 3.2, 3.1, 2.9, 2.4, 1.8, 1.0][y - 75], (x, y) => (y === 79 ? tone(glass, 0.1) : glass));
    lathe(v, gx, cz, 84, 85, (y) => (y === 84 ? 2.4 : 1.2), IRON);
    v.set(Math.round(gx), 86, Math.round(cz), IRON_L);
  }
  // banner: red maple leaf on white with red bars, hung from a little bracket
  if (banner) {
    const bx = flip ? c - 2 : c + 2, s = flip ? -1 : 1;
    v.fill(bx, 60, cz, bx + s * 9, 60, cz, IRON);
    for (let y = 40; y <= 59; y++) for (let k = 0; k < 9; k++) {
      const x = bx + s * (k + 1);
      let col = y < 44 || y > 55 ? RED : 0xf2ece0;
      const dx = Math.abs(k - 4), dy = y - 49.5;
      if (y >= 44 && y <= 55 && ((dx <= 1 && Math.abs(dy) <= 4.5) || (Math.abs(dy) <= 1.5 && dx <= 3.5) || (dy > -4 && dy < 2 && dx < 2.6 - dy * 0.2))) col = RED;
      v.set(x, y, cz, col);
    }
    v.fill(bx + s * 9, 40, cz, bx + s * 9, 59, cz, IRON);
  }
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [c + 0.5, 0, cz + 0.5], radius: 0.18, lights: [{ at: [c - 11, 79, cz], color: L_LAMP, radius: 11 }, { at: [c + 11, 79, cz], color: L_LAMP, radius: 9 }] });
}

// planter({ seed }) — a wooden half-barrel of autumn mums with a little pumpkin tucked in
export function planter({ seed = 1 } = {}) {
  const v = new Vox(22, 20, 22);
  const c = 10.5, R = rng(seed * 3 + 7);
  lathe(v, c, c, 0, 9, (y) => 8.2 + Math.sin((y / 9) * Math.PI) * 0.8, (x, y, z, a) => (y === 2 || y === 7 ? IRON : Math.floor((a + Math.PI) * 4) % 2 ? WOOD : WOOD_L), { wall: 1.2, floor: 1 });
  lathe(v, c, c, 8, 8, 7.2, DIRT_D);
  const fam = [[0xe8781e, 0xf6a040], [0x8a2238, 0xb04058], [0xf2c23a, 0xfadc70], [0x7a4aa8, 0xa070cc]];
  for (let i = 0; i < 14; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * 5.6, [m, l] = fam[Math.floor(R() * fam.length)];
    const x = c + Math.cos(a) * d, z = c + Math.sin(a) * d, h = 10 + R() * 4;
    v.ellipsoid(x, h, z, 2.1, 1.5, 2.1, (xx, y) => (y > h ? l : m));
    v.set(Math.round(x), Math.round(h) - 2, Math.round(z), LEAF_D);
  }
  for (let i = 0; i < 6; i++) { const a = R() * TAU; v.ellipsoid(c + Math.cos(a) * 6.5, 9.5, c + Math.sin(a) * 6.5, 1.6, 0.8, 1.6, LEAF); }
  pmk(v, c + 3.5, 9, c + 4, 2.6, seed);
  bevel(v, { top: 0.05, bottom: 0 });
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.45 });
}

// postBox() — a red Canada Post street mailbox: rounded hood, a slot, a white band
export function postBox() {
  const v = new Vox(16, 30, 16);
  rbox(v, 2, 0, 2, 13, 2, 13, 1, POST_RED_D, 0);
  for (let y = 3; y <= 22; y++) rbox(v, 3, y, 3, 12, y, 12, 1.5, (x, yy, z) => (yy === 15 || yy === 16 ? 0xf2ece0 : POST_RED), 0);
  for (let y = 23; y <= 27; y++) { const r = Math.sqrt(Math.max(0, 25 - (y - 22) * (y - 22))); rbox(v, Math.round(7.5 - r), y, 3, Math.round(7.5 + r), y, 12, 1, POST_RED, 0); }
  v.fill(5, 19, 13, 10, 20, 13, 0x2a1e1e); v.fill(5, 21, 13, 10, 21, 13, POST_RED_D); // slot & lip
  v.fill(6, 16, 13, 9, 16, 13, RED); v.fill(7, 15, 13, 8, 17, 13, RED); // little leaf on the band
  v.fill(6, 6, 13, 9, 10, 13, POST_RED_D); v.set(10, 8, 13, METAL_L);
  bevel(v, { top: 0.08, bottom: -0.06 });
  return finish(v, STD, { origin: [8, 0, 8], radius: 0.32 });
}

// hydrant() — a squat red fire hydrant with yellow caps
export function hydrant() {
  const v = new Vox(14, 18, 14);
  const c = 6.5;
  lathe(v, c, c, 0, 1, 4.2, RED_D);
  lathe(v, c, c, 2, 11, 3, (x, y) => (y === 9 ? RED_L : RED));
  lathe(v, c, c, 12, 14, (y) => [3.6, 3, 2][y - 12], (x, y) => (y === 12 ? RED_D : RED));
  lathe(v, c, c, 15, 16, 1.2, GOLD);
  for (const [dx, dz] of [[-4, 0], [4, 0], [0, 4]]) v.fill(Math.round(c + dx * 0.8) - 1, 6, Math.round(c + dz * 0.8) - 1, Math.round(c + dx) + (dx > 0 ? 1 : 0), 8, Math.round(c + dz) + (dz > 0 ? 1 : 0), GOLD);
  bevel(v, { top: 0.1, bottom: -0.08 });
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.2 });
}

// litterBin() — a green slatted bin with a domed lid
export function litterBin() {
  const v = new Vox(16, 22, 16);
  const c = 7.5, G = 0x2e5a3a, GL = 0x3e7a4a;
  lathe(v, c, c, 0, 15, 6, (x, y, z, a) => (y === 0 || y === 15 ? IRON : Math.floor((a + Math.PI) * 3) % 2 ? G : GL), { wall: 1, floor: 0 });
  lathe(v, c, c, 16, 19, (y) => [6.4, 5.6, 4.2, 2.2][y - 16], (x, y) => (y === 16 ? IRON : G));
  v.fill(Math.round(c) - 1, 20, Math.round(c), Math.round(c), 20, Math.round(c), IRON_L);
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.32 });
}

// bikeRack() — three iron hoops on a rail
export function bikeRack() {
  const v = new Vox(40, 18, 6);
  v.fill(0, 0, 2, 39, 0, 3, IRON);
  for (const x0 of [4, 17, 30]) for (let a = 0; a <= 20; a++) {
    const t = (a / 20) * Math.PI, x = x0 + 3 - Math.cos(t) * 3, y = Math.sin(t) * 4 + 12;
    v.set(Math.round(x), Math.round(y), 2, METAL_L); v.set(Math.round(x), Math.round(y), 3, METAL);
  }
  for (const x of [4, 10, 17, 23, 30, 36]) v.fill(x, 1, 2, x, 12, 3, METAL);
  return finish(v, STD, { origin: [20, 0, 3], radius: 0.2 });
}

// stopSign() — bilingual STOP / ARRÊT on a red octagon; lettering is a sign plane
export function stopSign() {
  const v = new Vox(20, 56, 6);
  const c = 9.5;
  v.fill(9, 0, 2, 10, 40, 3, METAL);
  for (let y = 0; y < 18; y++) for (let x = 0; x < 18; x++) {
    const dx = Math.abs(x - 8.5), dy = Math.abs(y - 8.5);
    if (dx > 8.6 || dy > 8.6 || dx + dy > 12.5) continue;
    const rim = dx > 7.4 || dy > 7.4 || dx + dy > 11.2;
    v.set(x + 1, 37 + y, 4, rim ? 0xf2ece0 : 0xc8282a);
    v.set(x + 1, 37 + y, 3, 0x9a9aa2);
  }
  const pre = [c + 0.5, 0, 3];
  const res = finish(v, STD, { origin: pre, radius: 0.1 });
  res.meta.signs = [signPlane(pre, STD, [c + 0.5, 46, 5], 12, 9, 'STOP ARRÊT', { bg: '#c8282a', fg: '#f6f0e4' })];
  return res;
}

// mooseSign() — yellow diamond, black moose: watch out on the road home
export function mooseSign() {
  const v = new Vox(26, 64, 6);
  v.fill(12, 0, 2, 13, 44, 3, METAL);
  const M = ['.AA..........AA..', 'AAAA........AAAA', '.AA.AA....AA.AA.', '....AAAAAAAA.....', '...........BBBB..', '..BBBBBBBBBBBBBB.', '.BBBBBBBBBBBBBB..', '.BBBBBBBBBBBBB...', '.BB.BB.....B..B..', '.B...B.....B..B..', '.B...B.....B..B..'];
  for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) {
    const d = Math.abs(x - 11.5) + Math.abs(y - 11.5);
    if (d > 12.2) continue;
    v.set(x + 1, 38 + y, 4, d > 10.8 ? 0x1e1418 : 0xf2c23a);
    v.set(x + 1, 38 + y, 3, 0x9a9aa2);
  }
  M.forEach((row, i) => { for (let k = 0; k < row.length; k++) if (row[k] !== '.') v.set(5 + k, 55 - i, 5, 0x1e1418); });
  return finish(v, STD, { origin: [13, 0, 3], radius: 0.1 });
}

// flagPole({ h }) — a tall white pole with a gold ball (the flag itself is cloth, see world.flags)
export function flagPole({ h = 8 } = {}) {
  const H = Math.round(h / STD);
  const v = new Vox(12, H + 3, 12);
  const c = 5.5;
  rbox(v, 1, 0, 1, 10, 2, 10, 1, STONE, 0);
  lathe(v, c, c, 3, H, (y) => (y < 8 ? 1.4 : 0.9), (x, y) => (y % 24 === 0 ? 0xe8e4dc : 0xf6f2ea));
  v.ellipsoid(c, H + 1, c, 1.6, 1.6, 1.6, GOLD);
  v.fill(Math.round(c) + 1, H - 6, Math.round(c), Math.round(c) + 2, H - 6, Math.round(c), METAL);
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.12, meta: { flagAt: r3((H - 7) * STD) } });
}

// signPost() — the wooden post of a junction signpost, with a little peaked cap
export function signPost() {
  const v = new Vox(8, 62, 8);
  v.fill(2, 0, 2, 5, 56, 5, (x, y, z) => ((x + z + (y >> 3)) % 4 === 0 ? WOOD_D : WOOD));
  v.fill(1, 0, 1, 6, 1, 6, WOOD_DD);
  for (let k = 0; k < 4; k++) v.fill(1 + k, 57 + k, 1 + k, 6 - k, 57 + k, 6 - k, k ? RED_D : RED);
  bevel(v, { top: 0.08, bottom: 0 });
  return finish(v, STD, { origin: [4, 0, 4], radius: 0.12 });
}
// signArrow({ text, color, len }) — an arrow board that points along +x from the post; lettering both sides
export function signArrow({ text = '', color = 0xf2e6c8, len } = {}) {
  const L = len ?? Math.max(18, Math.min(40, 8 + text.length * 2.4));
  const v = new Vox(Math.ceil(L) + 2, 8, 3);
  for (let x = 0; x <= L; x++) for (let y = 0; y < 7; y++) {
    const tip = x > L - 4 && Math.abs(y - 3) > L - x;
    if (tip) continue;
    const edge = y === 0 || y === 6 || x === 0 || (x > L - 4 && Math.abs(y - 3) === Math.round(L - x));
    v.set(x, y, 1, edge ? tone(color, -0.3) : color);
    v.set(x, y, 0, tone(color, -0.12)); v.set(x, y, 2, tone(color, -0.12));
  }
  v.set(1, 3, 3 - 3, IRON_L);
  const res = finish(v, STD, { origin: [0, 3.5, 1.5], radius: 0.1 });
  const w = (L - 6) * STD, h = 4.6 * STD, cx = (L / 2 - 1.5) * STD;
  const bg = '#' + (color & 0xffffff).toString(16).padStart(6, '0');
  res.meta.signs = [
    { x: r3(cx), y: 0, z: r3(1.5 * STD + 0.012), w: r3(w), h: r3(h), text, normal: [0, 0, 1], bg, fg: '#3a2418' },
    { x: r3(cx), y: 0, z: r3(-1.5 * STD - 0.012), w: r3(w), h: r3(h), text, normal: [0, 0, -1], bg, fg: '#3a2418' },
  ];
  return res;
}

// welcomeSign({ text }) — a big painted board on two posts with a maple leaf
export function welcomeSign({ text = 'MAPLE COVE' } = {}) {
  const v = new Vox(64, 44, 8);
  for (const x of [6, 55]) v.fill(x, 0, 3, x + 2, 36, 5, WOOD_D);
  v.fill(2, 18, 4, 61, 40, 5, (x, y) => (x <= 3 || x >= 60 || y <= 19 || y >= 39 ? WOOD_D : 0x2e5a40));
  // leaf on top
  const leaf = ['....#....', '.#.###.#.', '.#######.', '#########', '.#######.', '..#####..', '....#....'];
  leaf.forEach((row, i) => { for (let k = 0; k < row.length; k++) if (row[k] === '#') { v.set(28 + k, 43 - i, 4, RED); v.set(28 + k, 43 - i, 5, RED_D); } });
  bevel(v, { top: 0.06, bottom: 0 });
  const pre = [32, 0, 4];
  const res = finish(v, STD, { origin: pre, radius: 0.3 });
  res.meta.signs = [signPlane(pre, STD, [32, 29, 6], 54, 18, text, { bg: '#2e5a40', fg: '#f6ecd2' })];
  return res;
}

// muskokaChair({ color }) — the slatted, slanted-back cottage chair
export function muskokaChair({ color = 0xc8382e } = {}) {
  const v = new Vox(20, 24, 26);
  const c = color, d = tone(c, -0.2), l = tone(c, 0.12);
  // runners & legs
  for (const x of [1, 18]) { polyline(v, [[x, 0, 2], [x, 7, 20]], d, 0.5); v.fill(x, 0, 19, x, 9, 20, d); }
  // seat slats sloping back
  for (let z = 6; z <= 20; z += 2) { const y = 6 + Math.round((20 - z) * 0.12); v.fill(1, y, z, 18, y, z, z % 4 ? c : l); }
  // fan back of tall slats, raked back
  for (let x = 2; x <= 17; x += 2) { const top = 22 - Math.round(Math.abs(x - 9.5) * 0.4); polyline(v, [[x, 7, 6], [x, top, 0]], x % 4 ? c : l); }
  v.fill(2, 12, 3, 17, 12, 3, d);
  // wide flat armrests
  for (const x of [0, 1, 18, 19]) v.fill(x, 11, 8, x, 11, 22, l);
  for (const x of [0, 19]) v.fill(x, 0, 21, x, 10, 21, d);
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [10, 0, 13], radius: 0.45, meta: { seatHeight: 0.38 } });
}

// tent({ color }) — a ridge tent with guy lines and an open door flap
export function tent({ color = 0xd8702a, seed = 1 } = {}) {
  const v = new Vox(44, 30, 50);
  const c = color, d = tone(c, -0.18), l = tone(c, 0.1);
  for (let z = 4; z <= 44; z++) for (let x = 2; x <= 41; x++) {
    const h = 27 - Math.abs(x - 21.5) * 1.25;
    if (h < 1) continue;
    const y = Math.round(h);
    v.set(x, y, z, z === 4 || z === 44 ? d : (z % 8 === 0 ? d : x < 22 ? l : c));
    if (z === 4 || z === 44) for (let yy = 0; yy < y; yy++) { const door = z === 44 && Math.abs(x - 21.5) < 6 - yy * 0.15; v.set(x, yy, z, door ? 0 : d); }
  }
  // door flaps tied back, ridge pole ends, pegs and lines
  v.fill(13, 0, 45, 15, 18, 46, l); v.fill(28, 0, 45, 30, 18, 46, l);
  v.fill(21, 0, 46, 22, 30, 47, WOOD); v.fill(21, 0, 2, 22, 30, 3, WOOD);
  for (const [x, z] of [[0, 2], [43, 2], [0, 47], [43, 47]]) { polyline(v, [[x, 0, z], [x < 20 ? 6 : 37, 18, z < 20 ? 6 : 42]], 0xe8e0d0); v.fill(x, 0, z, x, 1, z, WOOD_D); }
  v.fill(16, 0, 30, 27, 0, 43, DENIM_D); // sleeping bag peeking out
  bevel(v, { top: 0.05, bottom: 0 });
  return finish(v, STD, { origin: [22, 0, 25], radius: 1.1 });
}

// sapBucket() — a tin sap bucket with a peaked lid, hung on a spile (origin: back of the hook, against a trunk)
export function sapBucket() {
  const v = new Vox(12, 16, 12);
  lathe(v, 5.5, 6, 1, 10, (y) => 3.6 + y * 0.12, (x, y, z, a) => (y === 1 || y === 10 ? METAL_D : Math.floor((a + Math.PI) * 3) % 2 ? METAL_L : METAL), { wall: 1, floor: 1 });
  for (let k = 0; k < 3; k++) lathe(v, 5.5, 6, 11 + k, 11 + k, 5.4 - k * 1.8, k ? METAL : METAL_L);
  v.fill(5, 12, 0, 6, 12, 3, METAL_D); // spile into the tree
  v.fill(5, 4, 9, 6, 4, 9, 0xc87a1e); // a drip of sap
  return finish(v, FINE, { origin: [6, 0, 0], radius: 0.08 });
}

// sandCastle({ seed }) — towers, a wall, a moat and a little flag
export function sandCastle({ seed = 1 } = {}) {
  const v = new Vox(30, 22, 30);
  const R = rng(seed * 11 + 5);
  const S = 0xc8b08a, SD = 0xa89068, SL = 0xdcc8a0, WET = 0x8e7a5a;
  lathe(v, 14.5, 14.5, 0, 0, 14, (x, y, z) => (Math.hypot(x - 14.5, z - 14.5) > 11 ? WET : S));
  lathe(v, 14.5, 14.5, 1, 4, 9, (x, y, z, a) => (y === 4 && Math.floor((a + Math.PI) * 4) % 2 ? 0 : y === 4 ? SL : S));
  const towers = [[8, 8], [21, 8], [8, 21], [21, 21]];
  towers.forEach(([x, z], i) => {
    const h = 9 + Math.floor(R() * 4) + (i === 0 ? 4 : 0);
    lathe(v, x, z, 1, h, (y) => 3.4 - y * 0.08, (xx, y, zz, a) => (y === h && Math.floor((a + Math.PI) * 2) % 2 ? 0 : y % 3 === 0 ? SD : y === h ? SL : S));
  });
  lathe(v, 14.5, 14.5, 5, 13, (y) => 3.6 - (y - 5) * 0.25, (x, y) => (y === 13 ? SL : S));
  v.fill(14, 14, 14, 14, 19, 14, WOOD_L); v.fill(15, 17, 14, 17, 19, 14, RED);
  v.set(3, 1, 24, 0xf2ece0); v.set(4, 1, 25, 0xe8b8c0); // shells
  bevel(v, { top: 0.04, bottom: 0 });
  return finish(v, STD, { origin: [14.5, 0, 14.5], radius: 0.7 });
}

// beachUmbrella({ color }) — a striped umbrella leaning in the sand
export function beachUmbrella({ color = RED } = {}) {
  const v = new Vox(44, 46, 44);
  const c = 21.5;
  polyline(v, [[c, 0, c], [c + 2, 40, c]], 0xe8e0d0, 0.5);
  for (let k = 0; k < 9; k++) {
    const y = 42 - k, r = 2 + k * 2.3;
    lathe(v, c + 2, c, y, y, r, (x, yy, z, a) => (Math.floor(((a + Math.PI) / TAU) * 12) % 2 ? color : 0xf2ece0), { wall: 1.6 });
  }
  v.fill(Math.round(c) + 1, 43, Math.round(c), Math.round(c) + 2, 44, Math.round(c), 0xe8e0d0);
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.1 });
}

// driftwood({ seed }) — a silvery sun-bleached log with a broken branch
export function driftwood({ seed = 1 } = {}) {
  const v = new Vox(70, 12, 14);
  const R = rng(seed * 17 + 3);
  const DW = 0xb8ae9c, DWD = 0x988e7c, DWL = 0xcfc6b4;
  for (let x = 2; x < 66; x++) {
    const r = 3.6 + Math.sin(x * 0.17 + seed) * 0.6 - Math.max(0, (x - 52) * 0.12);
    for (let z = -5; z <= 5; z++) for (let y = -5; y <= 5; y++) if (y * y + z * z <= r * r) v.set(x, Math.round(4 + y), Math.round(7 + z), y > r * 0.5 ? DWL : (x + y * 3) % 7 === 0 ? DWD : DW);
  }
  polyline(v, [[40, 6, 7], [52, 11, 12]], DW, 1);
  for (let i = 0; i < 4; i++) v.set(10 + Math.floor(R() * 50), 8, 5 + Math.floor(R() * 4), DWD);
  return finish(v, STD, { origin: [35, 0, 7], radius: 0.4 });
}

// inukshuk({ seed }) — a stone figure on the lookout, arms wide
export function inukshuk({ seed = 1 } = {}) {
  const v = new Vox(34, 38, 12);
  const R = rng(seed * 7 + 1);
  const st = (x0, y0, x1, y1) => rbox(v, x0, y0, 2 + Math.floor(R() * 2), x1, y1, 9 - Math.floor(R() * 2), 1.2, (x, y, z) => [STONE, STONE_L, STONE_D, 0x9a988e][Math.floor(vhash(x0, y0, 1, seed) * 4)], 1);
  st(6, 0, 12, 12); st(21, 0, 27, 12); // legs
  st(4, 13, 29, 18); // hips
  st(9, 19, 24, 25); // body
  st(0, 26, 33, 30); // arms
  st(11, 31, 22, 37); // head
  mossify(v, seed, 0.25);
  return finish(v, STD, { origin: [17, 0, 6], radius: 0.6 });
}

// jumpRamp({ len, h, w }) — a plank kicker on timber trestles with yellow arrows and red rails (0.1 m voxels)
export function jumpRamp({ len = 5, h = 1.3, w = 2.8 } = {}) {
  const L = Math.round(len / MID), Hh = Math.round(h / MID), Wd = Math.round(w / MID);
  const v = new Vox(Wd + 2, Hh + 3, L + 1);
  const prof = (z) => { const t = z / (L - 1); return (t * t * 0.4 + t * 0.6) * Hh; };
  for (let z = 0; z < L; z++) {
    const top = Math.round(prof(z));
    for (let x = 1; x <= Wd; x++) {
      const plank = (z >> 1) % 3;
      v.set(x, top, z, x === 1 || x === Wd ? 0xc8382e : [WOOD_L, WOOD, tone(WOOD_L, -0.05)][plank]);
      if (top > 0) v.set(x, top - 1, z, WOOD_D);
      // arrows
      const ax = Math.abs(x - (Wd + 1) / 2), az = (z % 12) - 4;
      if (az >= 0 && az <= 4 && ax <= 4 - az * 0.9 && ax >= 2.4 - az * 0.9 - 1.4) v.set(x, top, z, 0xf2c23a);
    }
    // side skirts & trestle posts
    if (z % 6 === 3 || z === L - 1) for (const x of [1, 2, Wd - 1, Wd]) v.fill(x, 0, z, x, Math.max(0, top - 1), z, WOOD_D);
  }
  for (const x of [1, Wd]) for (let z = 1; z < L; z += 6) polyline(v, [[x, 0, z], [x, Math.round(prof(Math.min(L - 1, z + 5))) - 1, Math.min(L - 1, z + 5)]], WOOD_DD);
  return finish(v, MID, { origin: [(Wd + 2) / 2, 0, L / 2], radius: w / 2 });
}

// railFence({ len }) — a split-rail fence section (two posts, three rails)
export function railFence({ len = 3, seed = 1 } = {}) {
  const L = Math.round(len / STD);
  const v = new Vox(L + 3, 26, 6);
  const R = rng(seed * 5 + 9);
  for (const x of [1, L]) v.fill(x, 0, 1, x + 2, 24, 4, (xx, y) => (y === 24 ? GREYWOOD_L : GREYWOOD_D));
  for (const y of [7, 14, 21]) {
    const off = Math.floor(R() * 2);
    for (let x = 1; x <= L + 2; x++) { const yy = y + Math.round(Math.sin(x * 0.11 + y) * 0.6); v.set(x, yy, 2 + off, GREYWOOD); v.set(x, yy + 1, 2 + off, (x + y) % 9 === 0 ? GREYWOOD_D : GREYWOOD_L); }
  }
  return finish(v, STD, { origin: [(L + 3) / 2, 0, 3], radius: 0.1 });
}
// picketFence({ len, color, coarse }) — white pickets with pointed tops (coarse: 0.1 m voxels, for long runs)
export function picketFence({ len = 3, color = 0xf2ece0, coarse = false } = {}) {
  if (coarse) {
    const L = Math.round(len / MID);
    const v = new Vox(L + 1, 11, 2);
    for (let x = 0; x <= L; x += 2) { v.fill(x, 0, 1, x, 8, 1, color); v.set(x, 9, 1, tone(color, -0.06)); }
    for (const y of [2, 7]) v.fill(0, y, 0, L, y, 0, tone(color, -0.1));
    return finish(v, MID, { origin: [(L + 1) / 2, 0, 1], radius: 0.1 });
  }
  const L = Math.round(len / STD);
  const v = new Vox(L + 2, 22, 4);
  for (let x = 0; x <= L + 1; x += 3) { v.fill(x, 0, 2, x + 1, 17, 2, color); v.set(x, 18, 2, color); v.set(x + 1, 18, 2, tone(color, -0.1)); }
  for (const y of [5, 14]) v.fill(0, y, 1, L + 1, y + 1, 1, tone(color, -0.08));
  for (const x of [0, L]) v.fill(x, 0, 1, x + 1, 20, 3, tone(color, -0.05));
  return finish(v, STD, { origin: [(L + 2) / 2, 0, 2], radius: 0.1 });
}

// cornRow({ len }) — a 2.2 m wall of dry corn stalks for the corn maze (0.1 m voxels, kept cheap:
// vertical stalk stripes merge into long quads, leaves and ears are a sprinkle of single voxels)
export function cornRow({ len = 4, seed = 1 } = {}) {
  const L = Math.round(len / MID);
  const v = new Vox(L, 25, 8);
  const R = rng(seed * 19 + 4);
  const tops = [];
  for (let x = 0; x < L; x++) tops.push(19 + Math.floor(R() * 4));
  for (let x = 0; x < L; x++) {
    const c = x % 3 === 0 ? STRAW_D : x % 3 === 1 ? STRAW : STRAW_L;
    v.fill(x, 0, 2, x, tops[x], 5, c);
    v.set(x, tops[x] + 1, 3 + (x % 2), 0xe2d29a); // tassels
  }
  for (let i = 0; i < L * 0.9; i++) {
    const x = Math.floor(R() * L), y = 5 + Math.floor(R() * 13), side = R() < 0.5 ? 1 : 6;
    v.set(x, y, side, R() < 0.25 ? 0xe8b23a : side === 1 ? STRAW_D : STRAW_L);
    if (R() < 0.4) v.set(x, y - 1, side === 1 ? 0 : 7, side === 1 ? STRAW_D : STRAW_L);
  }
  return finish(v, MID, { origin: [L / 2, 0, 4], radius: 0.3 });
}

// pumpkinVines({ seed }) — a 2 x 2 m patch of sprawling vines and big leaves (pumpkins are placed on top)
export function pumpkinVines({ seed = 1 } = {}) {
  const v = new Vox(40, 6, 40);
  const R = rng(seed * 23 + 7);
  for (let i = 0; i < 10; i++) {
    let x = R() * 40, z = R() * 40, a = R() * TAU;
    for (let k = 0; k < 18; k++) { v.set(Math.round(x), 0, Math.round(z), LEAF_D); x += Math.cos(a); z += Math.sin(a); a += (R() - 0.5) * 0.8; }
  }
  for (let i = 0; i < 22; i++) {
    const x = R() * 38 + 1, z = R() * 38 + 1, r = 1.6 + R() * 1.6;
    v.ellipsoid(x, 1.2, z, r, 1, r, (xx, y) => (y >= 2 ? LEAF_L : vhash(xx, y, 3, seed) < 0.2 ? 0x8a8a3a : LEAF));
  }
  return finish(v, STD, { origin: [20, 0, 20], radius: 0.1 });
}

// tractor({ color }) — an old farm tractor with big rear wheels
export function tractor({ color = 0xc8302a } = {}) {
  const v = new Vox(34, 40, 64);
  const c = color, d = tone(c, -0.2), TY = 0x2a2626, TYL = 0x3e3a3a, HUB = 0xe8c040;
  const wheel = (cx, cy, cz, r, w) => { for (let x = cx - w; x <= cx + w; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) { const d2 = y * y + z * z; if (d2 > r * r + 0.5) continue; v.set(x, cy + y, cz + z, d2 < (r * 0.45) ** 2 ? HUB : d2 > (r - 1.4) ** 2 && ((Math.atan2(y, z) * 6) | 0) % 2 ? TYL : TY); } };
  wheel(4, 13, 16, 13, 3); wheel(29, 13, 16, 13, 3);
  wheel(7, 7, 52, 7, 2); wheel(26, 7, 52, 7, 2);
  rbox(v, 11, 10, 22, 22, 22, 60, 2, (x, y, z) => (y === 22 ? tone(c, 0.1) : z % 6 === 0 && z > 40 ? d : c)); // hood
  v.fill(12, 12, 61, 21, 20, 61, (x, y) => (y % 2 ? 0x8a8a90 : 0x5a5a60)); // grille
  rbox(v, 9, 10, 6, 24, 18, 22, 1, c); // body
  v.fill(13, 19, 8, 20, 22, 14, 0x2a2a2a); // seat
  v.fill(13, 22, 6, 20, 28, 7, 0x2a2a2a);
  polyline(v, [[16.5, 22, 20], [16.5, 28, 17]], IRON, 0.6); v.fill(13, 28, 16, 20, 28, 18, IRON); // steering wheel
  v.fill(16, 22, 50, 17, 34, 51, IRON); v.fill(16, 35, 50, 17, 35, 51, 0x5a5a60); // exhaust
  for (const x of [1, 32]) v.fill(x, 24, 6, x + 1, 25, 28, d); // fenders
  bevel(v, { top: 0.06, bottom: -0.05 });
  return finish(v, STD, { origin: [17, 0, 32], radius: 1.4 });
}

// farmStand({ seed }) — a roadside stand heaped with pumpkins and an honour box; the sign is lettered
export function farmStand({ text = 'PUMPKINS 3$', seed = 1 } = {}) {
  const v = new Vox(48, 44, 26);
  for (const [x, z] of [[2, 4], [44, 4], [2, 21], [44, 21]]) v.fill(x, 0, z, x + 1, z > 10 ? 30 : 36, z + 1, WOOD_D);
  v.fill(1, 14, 3, 46, 15, 23, (x) => plankTone(WOOD, x >> 2));
  for (let z = 1; z <= 25; z++) { const y = 36 - Math.round((z - 1) * 0.28); v.fill(0, y, z, 47, y, z, (x) => (((x >> 2) + (z >> 3)) % 2 ? RED : 0xf2ece0)); }
  const R = rng(seed * 3 + 1);
  for (let i = 0; i < 9; i++) pmk(v, 6 + (i % 5) * 9 + R() * 2, 16, 8 + Math.floor(i / 5) * 9 + R() * 2, 3 + R() * 1.5, i);
  v.fill(40, 16, 18, 45, 21, 23, WOOD_L); v.fill(42, 21, 20, 43, 21, 21, IRON); // honour box
  for (let i = 0; i < 4; i++) pmk(v, 8 + i * 9, 0, 14 + (i % 2) * 4, 3.2, i + 20);
  bevel(v, { top: 0.05, bottom: 0 });
  const pre = [24, 0, 13];
  const res = finish(v, STD, { origin: pre, radius: 1.0 });
  res.meta.signs = [signPlane(pre, STD, [24, 28, 24.2], 34, 6, text, { bg: '#f2e6c8', fg: '#a83228' })];
  v.fill(7, 25, 23, 41, 31, 23, (x, y) => (x === 7 || x === 41 || y === 25 || y === 31 ? WOOD_D : 0xf2e6c8)); // backing board for the lettering
  return res;
}

// bbqGrill() — a kettle grill on legs
export function bbqGrill() {
  const v = new Vox(16, 22, 16);
  const c = 7.5;
  for (const a of [0.4, 2.5, 4.6]) polyline(v, [[c + Math.cos(a) * 5, 0, c + Math.sin(a) * 5], [c + Math.cos(a) * 3, 11, c + Math.sin(a) * 3]], IRON, 0.4);
  for (let y = 11; y <= 19; y++) { const r = Math.sqrt(Math.max(0, 30 - (y - 15) ** 2)); lathe(v, c, c, y, y, r, y === 15 ? METAL_D : 0x2a2a2e); }
  v.fill(Math.round(c) - 1, 20, Math.round(c), Math.round(c), 20, Math.round(c), METAL_L);
  return finish(v, STD, { origin: [c + 0.5, 0, c + 0.5], radius: 0.35 });
}

// cenotaph() — the village war memorial: a granite obelisk on steps, poppy wreaths at its foot
export function cenotaph() {
  const v = new Vox(30, 66, 30);
  for (let k = 0; k < 3; k++) rbox(v, 1 + k * 3, k * 3, 1 + k * 3, 28 - k * 3, k * 3 + 2, 28 - k * 3, 1, k % 2 ? GRANITE : GRANITE_L, 0);
  rbox(v, 10, 9, 10, 19, 22, 19, 1, GRANITE, 0);
  for (let y = 23; y <= 58; y++) { const r = 4 - (y - 23) * 0.06; rbox(v, Math.round(14.5 - r), y, Math.round(14.5 - r), Math.round(14.5 + r), y, Math.round(14.5 + r), 0, y % 12 === 0 ? GRANITE_L : GRANITE, 0); }
  for (let k = 0; k < 4; k++) rbox(v, 12 + k, 59 + k, 12 + k, 17 - k, 59 + k, 17 - k, 0, GRANITE_L, 0);
  v.fill(11, 13, 20, 18, 18, 20, GOLD); // bronze plaque
  for (const [x, z] of [[8, 25], [21, 25], [25, 14]]) torus(v, x, 3, z, 3, 1, (xx, y, zz, a) => (Math.floor(a * 3) % 2 ? 0xc8202a : LEAF_D), 'y');
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [15, 0, 15], radius: 0.8 });
}

// rowboat({ color }) — a little wooden dinghy with oars (sits on the water)
export function rowboat({ color = 0x3a7ab0 } = {}) {
  const L = 64, W = 26, v = new Vox(W, 14, L);
  const cx = 12.5;
  for (let z = 0; z < L; z++) {
    const t = z / (L - 1), hw = 11 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.12)), 0.6) + 0.5;
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const dx = Math.abs(x - cx) / hw;
      if (dx > 1) continue;
      const yb = Math.round(dx * dx * 4);
      for (let y = yb; y <= 9; y++) {
        const shell = dx > 1 - 1.4 / hw || y === yb || t > 0.96;
        if (!shell) continue;
        v.set(x, y, z, y === 9 ? WOOD_L : y < 4 ? 0xe8e0d0 : (y >> 1) % 2 ? color : tone(color, -0.12));
      }
      if (dx <= 1 - 1.4 / hw) v.set(x, yb + 1, z, z % 6 === 0 ? WOOD_D : WOOD);
    }
  }
  for (const z of [18, 40]) v.fill(3, 7, z, 22, 7, z + 2, WOOD_L);
  polyline(v, [[4, 8, 26], [-1 + 2, 8, 50]], WOOD_L); polyline(v, [[21, 8, 26], [24, 8, 50]], WOOD_L);
  bevel(v, { top: 0.05, bottom: 0 });
  return finish(v, STD, { origin: [cx + 0.5, 0, L / 2], radius: 1.0, meta: { length: L * STD } });
}

// fishingBoat({ hull }) — a Cape Islander lobster boat: high bow, wheelhouse forward, a mast and a flag (0.1 m)
export function fishingBoat({ hull = 0x2e5a8a, seed = 1 } = {}) {
  const L = 76, W = 28, v = new Vox(W, 42, L);
  const cx = 13.5, top = (t) => 12 + Math.round(5 * Math.pow(Math.max(0, t - 0.55) / 0.45, 1.8));
  for (let z = 0; z < L; z++) {
    const t = z / (L - 1);
    const hw = 13 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.32 + t * 0.7)), 0.5) * (t < 0.06 ? 0.85 : 1);
    const gt = top(t);
    for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
      const dx = Math.abs(x - cx) / Math.max(1, hw);
      if (dx > 1) continue;
      const yb = Math.round(dx * dx * 5 + Math.pow(t, 6) * 6);
      for (let y = yb; y <= gt; y++) {
        const shell = dx > 1 - 1.5 / hw || y === yb || z === 0;
        if (!shell) continue;
        v.set(x, y, z, y >= gt - 1 ? 0xf2ece0 : y < 5 ? 0x9e2a24 : y === 5 ? 0xf2ece0 : hull);
      }
      if (dx <= 1 - 1.5 / hw && yb + 1 < gt) v.set(x, Math.min(gt - 3, 9), z, z % 4 ? 0x9a8a72 : 0x86765e); // deck
    }
  }
  // wheelhouse forward of midships
  rbox(v, 6, 9, 40, 21, 26, 56, 1, (x, y, z) => (y >= 18 && y <= 22 && z === 56 && x > 7 && x < 20 ? 0x27354e | GLASS : y >= 18 && y <= 22 && (x === 6 || x === 21) && z > 42 && z < 54 ? 0x27354e | GLASS : 0xf2ece0));
  v.fill(5, 27, 39, 22, 28, 57, 0x2c3c64);
  // mast, boom, flag, a stack of traps at the stern
  v.fill(13, 29, 47, 14, 40, 48, 0xe8e4dc);
  v.fill(15, 37, 47, 21, 40, 47, (x, y) => (x < 17 || x > 19 ? RED : 0xf2ece0));
  for (let i = 0; i < 4; i++) v.fill(5 + (i % 2) * 9, 10 + Math.floor(i / 2) * 4, 6 + (i % 2) * 2, 11 + (i % 2) * 9, 13 + Math.floor(i / 2) * 4, 13 + (i % 2) * 2, (x, y, z) => ((x + y + z) % 2 ? 0x6a8a7a : 0xb08a5a));
  v.ellipsoid(23, 12, 30, 1.5, 2.2, 1.5, (x, y) => ((y >> 1) % 2 ? 0xf2c23a : RED)); // fender buoy
  bevel(v, { top: 0.04, bottom: 0 });
  return finish(v, MID, { origin: [cx + 0.5, 6, L / 2], radius: 1.4, meta: { length: L * MID, beam: W * MID } });
}

// giantGoose() — a roadside giant: a 5 m Canada goose on a stone plinth, wings half open
export function giantGoose() {
  const v = new Vox(30, 54, 44);
  const BLK = 0x262224, WHT = 0xf2ece0, BR = 0x8a7a64, BRD = 0x6e604e, BRL = 0xa8987e, BEAK = 0x2e2a2a;
  rbox(v, 4, 0, 6, 25, 6, 37, 1, (x, y, z) => (y === 6 ? STONE_L : (x + z + y) % 7 === 0 ? STONE_D : STONE), 0);
  // legs & feet
  for (const x of [11, 18]) { v.fill(x, 7, 20, x + 1, 14, 21, BLK); v.fill(x - 1, 7, 22, x + 2, 7, 25, BLK); }
  // body: a fat teardrop, pale belly, darker back, white tail band
  v.ellipsoid(15, 22, 20, 8.5, 8, 13, (x, y, z) => (y < 18 ? (z < 10 ? WHT : BRL) : z < 9 ? WHT : y > 26 ? BRD : (x + y) % 5 === 0 ? BRD : BR));
  // wings: raised a little, with feather rows
  for (const s2 of [-1, 1]) for (let k = 0; k < 12; k++) {
    const x = 15 + s2 * (7 + k * 0.5), y0 = 22 + Math.round(k * 0.6);
    v.fill(Math.round(x), y0, 10 + k, Math.round(x) + s2, y0 + 6 - Math.round(k * 0.3), 30 - Math.round(k * 0.4), (xx, y, z) => ((z + y) % 4 === 0 ? BRD : BR));
  }
  // neck, head, white chinstrap, beak
  for (let k = 0; k <= 14; k++) { const z = 30 + Math.round(k * 0.35), y = 26 + k; v.ellipsoid(15, y, z, 2.6, 1.2, 2.6, BLK); }
  v.ellipsoid(15, 42, 35, 3.6, 3, 4.6, BLK);
  for (const s2 of [-1, 1]) v.fill(15 + s2 * 3, 39, 32, 15 + s2 * 3, 42, 36, WHT);
  v.fill(13, 39, 33, 17, 39, 36, WHT);
  v.ellipsoid(15, 41.5, 40, 1.8, 1.2, 2.6, BEAK);
  for (const s2 of [-1, 1]) v.set(15 + s2 * 3, 43, 37, 0xf2e8c0 | EMIT);
  bevel(v, { top: 0.05, bottom: -0.05 });
  return finish(v, MID, { origin: [15, 0, 22], radius: 1.4 });
}

// clothesline({ seed }) — two T-posts and a line of laundry (plaid shirts, a toque, socks)
export function clothesline({ seed = 1 } = {}) {
  const L = 80, v = new Vox(L, 46, 8);
  const R = rng(seed * 29 + 3);
  for (const x of [1, L - 3]) { v.fill(x, 0, 3, x + 1, 42, 4, GREYWOOD); v.fill(x - 3, 41, 3, x + 4, 42, 4, GREYWOOD_D); }
  for (let x = 2; x < L - 2; x++) v.set(x, 41 - Math.round(Math.sin((x / L) * Math.PI) * 2), 3, 0xe8e0d0);
  const cloth = [[0xc8382e, 0x2a2420], [0x2e5a8a, 0x1e3a5a], [0xe8b830, 0xc89020], [0x3a7a5a, 0x2a5a40], [0xf2ece0, 0xc8c0b0]];
  let x = 6;
  while (x < L - 14) {
    const [a, b2] = cloth[Math.floor(R() * cloth.length)];
    const w = 8 + Math.floor(R() * 5), h = 10 + Math.floor(R() * 6), top = 39 - Math.round(Math.sin((x / L) * Math.PI) * 2);
    const plaid = R() < 0.6;
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
      const sleeve = j < 4 || (i > 1 && i < w - 2);
      if (!sleeve) continue;
      v.set(x + i, top - j, 3, plaid && ((i >> 1) + (j >> 1)) % 2 ? b2 : a);
    }
    v.set(x + 1, top + 1, 3, WOOD_L); v.set(x + w - 2, top + 1, 3, WOOD_L);
    x += w + 3 + Math.floor(R() * 3);
  }
  return finish(v, STD, { origin: [L / 2, 0, 4], radius: 0.2 });
}

// hockeyNet() — red pipe frame, white mesh
export function hockeyNet() {
  const v = new Vox(38, 26, 22);
  for (const x of [1, 36]) v.fill(x, 0, 18, x, 24, 19, RED);
  v.fill(1, 24, 18, 36, 24, 19, RED);
  for (let z = 2; z <= 18; z++) for (let x = 1; x <= 36; x++) {
    const h = 24 - Math.round((18 - z) * 0.9);
    if (h < 1) continue;
    if ((x + z) % 3 === 0 || x === 1 || x === 36) v.set(x, h, z, 0xf2f0ea);
    if (x === 1 || x === 36) for (let y = 0; y < h; y += 3) v.set(x, y, z, 0xf2f0ea);
  }
  for (let x = 1; x <= 36; x += 3) for (let y = 0; y < 24; y += 3) v.set(x, y, 2 + Math.round((24 - y) * 0), 0xe8e6e0);
  v.fill(1, 0, 2, 36, 0, 3, RED);
  return finish(v, STD, { origin: [19, 0, 11], radius: 0.9 });
}

// ------------------------------------------------------------------ the backcountry
const RAIL = 0x5a4038, RAIL_TOP = 0xa8a4a0, TIE = 0x4a3a2c, TIE_L = 0x5e4a36;
// railTrack({ len }) — a length of standard-gauge track: creosoted ties on a ballast bed, two rails
// with shiny worn tops. Origin bottom-centre, the rails run along z.
export function railTrack({ len = 4, seed = 1 } = {}) {
  const L = Math.round(len / STD), Wd = 54, c = Wd / 2;
  const v = new Vox(Wd, 6, L);
  const R = rng(seed * 7 + 3);
  // (the ballast is the trail's own gravel)
  for (let z = 4; z < L; z += 15) v.fill(2, 1, z, Wd - 3, 2, z + 3, R() < 0.3 ? TIE_L : TIE);
  for (const x of [c - 15, c + 14]) {
    v.fill(x, 3, 0, x + 1, 3, L - 1, RAIL);
    v.fill(x, 4, 0, x + 1, 4, L - 1, RAIL_TOP);
  }
  return finish(v, STD, { origin: [c, 0, L / 2], radius: 1.3 });
}

// tunnelPortal() — a dressed-stone portal with a round-topped bore into the ridge, a keystone and a
// date stone, wing walls either side. Faces +z (the track comes out towards +z); 0.1 m voxels.
export function tunnelPortal() {
  const W = 92, H = 80, D = 16, c = W / 2;
  const v = new Vox(W, H, D);
  const R = rng(91);
  const ow = 23, oh = 50; // the bore's half width and the spring line + arch height
  const inBore = (x, y) => { const dx = Math.abs(x + 0.5 - c); if (dx > ow) return false; return y < oh - ow || Math.hypot(dx, y - (oh - ow)) <= ow; };
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const wing = Math.abs(x + 0.5 - c) > 34;
    const top = wing ? 56 - Math.round((Math.abs(x + 0.5 - c) - 34) * 1.2) : H - 4;
    if (y > top) continue;
    if (inBore(x, y)) { if (z <= 2) v.set(x, y, z, 0x0c0b0e); continue; } // the dark bore
    if (z < 6 && !wing) continue;
    // dressed blocks in courses: one shade per block, recessed joints
    const course = Math.floor(y / 6), blk = Math.floor((x + course * 5) / 13), joint = y % 6 === 0 || (x + course * 5) % 13 === 0;
    if (joint && z === D - 1) continue;
    v.set(x, y, z, joint ? STONE_D : [STONE, STONE_L, tone(STONE, -0.06)][Math.floor(vhash(blk, course, 3) * 3)]);
  }
  // voussoirs round the arch, a keystone, the cornice and a date stone
  for (let a = 0; a <= 40; a++) {
    const t = Math.PI * (a / 40), r = ow + 2.5;
    const x = c + Math.cos(t) * r, y = oh - ow + Math.sin(t) * r;
    v.fill(x - 1, y - 1, D - 2, x + 1, y + 1, D - 1, a % 4 === 0 ? STONE_D : STONE_L);
  }
  v.fill(c - 3, oh + 1, D - 3, c + 2, oh + 7, D - 1, STONE_L);
  v.fill(2, H - 6, D - 3, W - 3, H - 4, D - 1, (x) => (Math.abs(x + 0.5 - c) > 34 ? 0 : STONE_L));
  v.fill(c - 8, H - 15, D - 2, c + 7, H - 9, D - 1, (x, y) => ((x === c - 8 || x === c + 7 || y === H - 15 || y === H - 9) ? STONE_D : (y === H - 12 && (x - c + 8) % 4 < 3 ? 0x5a5860 : STONE_L)));
  // moss along the top, a lamp over the bore
  for (let x = 0; x < W; x += 2) { const y = topY(v, x, D - 1); if (y > 0 && R() < 0.5) v.fill(x, y + 1, D - 5, x + 1, y + 1, D - 1, MOSS); }
  v.fill(c - 1, oh + 9, D, c, oh + 11, D, 0xffd27a | EMIT);
  return finish(v, MID, { origin: [c, 0, D / 2], radius: 4, lights: [{ at: [c, oh + 10, D], color: [1.0, 0.72, 0.42], radius: 7 }] });
}

// handcar() — a railway pump trolley: plank deck on four flanged wheels, a walking-beam pump handle
// on an A-frame. Wheels sit on the rails (gauge as railTrack); 0.05 m voxels, rails along z.
export function handcar({ seed = 1 } = {}) {
  const v = new Vox(40, 36, 48), c = 20;
  const red = 0xb8322a, redD = 0x84221e;
  for (const x of [c - 15, c + 14]) for (const z of [9, 38]) {
    for (let a = -5; a <= 5; a++) for (let b = -5; b <= 5; b++) {
      const d = Math.hypot(a, b);
      if (d > 5.3) continue;
      v.set(x, 6 + b, z + a, d > 4.2 ? IRON : d < 1.5 ? IRON_L : (a + b) % 3 === 0 ? IRON_L : IRON);
      v.set(x + (x < c ? 1 : -1), 6 + b, z + a, d > 4.5 ? IRON_L : 0);
    }
  }
  v.fill(c - 18, 11, 4, c + 17, 12, 43, (x, y, z) => (y === 12 ? ((z >> 2) % 2 ? WOOD : WOOD_L) : WOOD_D));
  v.fill(c - 18, 9, 4, c + 17, 10, 6, red); v.fill(c - 18, 9, 41, c + 17, 10, 43, red);
  // the A-frame and the walking beam with its two handles
  polyline(v, [[c - 6, 13, 22], [c, 27, 24], [c + 6, 13, 22]], redD, 0.6);
  polyline(v, [[c - 6, 13, 26], [c, 27, 24], [c + 6, 13, 26]], redD, 0.6);
  polyline(v, [[c, 29, 8], [c, 26, 40]], WOOD_D, 0.8);
  for (const z of [8, 40]) v.fill(c - 9, z < 20 ? 29 : 26, z, c + 8, z < 20 ? 29 : 26, z + 1, WOOD_L);
  v.fill(c - 1, 26, 23, c + 1, 28, 25, IRON);
  v.fill(c - 3, 13, 18, c + 2, 18, 30, IRON_L); // gearbox
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [c, 0, 24], radius: 1.1 });
}

// woodDeck({ len, w, posts, rail }) — a plank deck on posts (lake docks, the marsh boardwalk): the deck
// top is `posts` metres above the model's base, so the posts reach down into the water or mud.
// Runs along z; 0.1 m voxels.
export function woodDeck({ len = 6, w = 2, posts = 2.2, rail = 0, seed = 1 } = {}) {
  const L = Math.round(len / MID), Wd = Math.round(w / MID), P = Math.round(posts / MID);
  const v = new Vox(Wd + 2, P + 12, L);
  const R = rng(seed * 11 + 5);
  for (let z = 0; z < L; z++) v.fill(1, P - 1, z, Wd, P - 1, z, z % 3 === 0 ? GREYWOOD_L : (z * 7) % 5 === 0 ? tone(GREYWOOD, -0.06) : GREYWOOD);
  for (const x of [1, Wd]) v.fill(x, P - 2, 0, x, P - 2, L - 1, GREYWOOD_D);
  for (let z = 1; z < L; z += 15) for (const x of [1, Wd]) v.fill(x, 0, z, x, P - 2, z, (xx, y) => (y < P * 0.6 ? 0x3e3a2c : GREYWOOD_D));
  if (rail) for (const x of rail > 1 ? [0, Wd + 1] : [Wd + 1]) {
    for (let z = 1; z < L; z += 15) v.fill(x, P - 1, z, x, P + 8, z, GREYWOOD_D);
    v.fill(x, P + 8, 0, x, P + 8, L - 1, GREYWOOD_L);
  }
  return finish(v, MID, { origin: [(Wd + 2) / 2, 0, L / 2], radius: w / 2 });
}

const APPLE_LEAF = [0x6a8a2e, 0x80983a, 0x9aa23e, 0xb8a03a];
// appleTree({ seed, fruit }) — a pruned orchard apple tree: a short crooked trunk under a round crown
// in late-season green and gold (shaded in big patches so it meshes cheaply), red apples dotted over
// its outside and a few in the grass. 0.125 m voxels.
export function appleTree({ seed = 1, fruit = true } = {}) {
  const S = 0.125, v = new Vox(34, 38, 34), c = 17;
  const R = rng(seed * 31 + 7);
  const lean = (R() - 0.5) * 3;
  polyline(v, [[c, 0, c], [c + lean * 0.4, 7, c - 1], [c + lean, 12, c]], 0x5a4030, 1.2);
  const lobes = [[c + lean, 22, c, 10.5, 8.5], [c + lean - 5 + R() * 2, 19, c + 4 - R() * 2, 7, 6], [c + lean + 5 - R() * 2, 20, c - 4 + R() * 2, 7, 6], [c + lean, 27, c + 1, 7, 5]];
  for (const [x, y, z, r, ry] of lobes) v.ellipsoid(x, y, z, r, ry, r, (xx, yy, zz) => APPLE_LEAF[Math.min(3, Math.floor(vhash(xx >> 2, yy >> 2, zz >> 2, seed) * 3.2) + (yy > 25 ? 1 : 0))]);
  // apples on the outside of the crown
  if (fruit) {
    for (let k = 0; k < 26; k++) {
      const a = R() * 6.28, e = (R() - 0.3) * 1.2, x = Math.round(c + Math.cos(a) * Math.cos(e) * 12), z = Math.round(c + Math.sin(a) * Math.cos(e) * 12);
      for (let y = 34; y > 10; y--) {
        if (!v.get(x, y, z)) continue;
        // walk in from the outside along the ray until the crown
        v.set(x, y, z, k % 3 ? 0xb8221e : 0xd8402a);
        break;
      }
    }
    for (let k = 0; k < 5; k++) { const a = R() * 6.28, r = 4 + R() * 8; v.set(c + Math.cos(a) * r, 0, c + Math.sin(a) * r, 0xb8221e); }
  }
  bevel(v, { top: 0.1, bottom: -0.12 });
  return finish(v, S, { origin: [c, 0, c], radius: 0.4 });
}

// ciderPress() — a cider press: oak frame, the big iron screw and handle, a slatted basket of crushed
// apples over a tray dripping into a tub, a crate of apples beside it. 0.05 m voxels.
export function ciderPress() {
  const v = new Vox(44, 44, 32), c = 16;
  for (const x of [c - 12, c + 11]) v.fill(x - 1, 0, 12, x + 1, 36, 15, WOOD_D);
  v.fill(c - 14, 34, 11, c + 13, 38, 16, WOOD);
  v.fill(c - 14, 6, 10, c + 13, 8, 17, WOOD_D); // the tray bed
  lathe(v, c, 13.5, 9, 19, 8, (x, y, z, a) => (Math.floor((a + Math.PI) * 6) % 2 ? WOOD_L : 0x3a2a1e), { wall: 1 });
  v.fill(c - 6, 18, 8, c + 6, 18, 19, 0x9a6a2a); // crushed pulp on top
  v.fill(c - 7, 19, 7, c + 7, 21, 20, WOOD_D); // the follower block
  v.fill(c - 1, 22, 12, c + 1, 40, 15, IRON); // the screw
  polyline(v, [[c - 12, 41, 13], [c + 12, 41, 14]], IRON_L, 0.7); // the handle bar
  lathe(v, c, 26, 0, 6, 5, (x, y, z, a, d, r) => (y === 6 && d < r - 1 ? 0xd8a040 : WOOD), { wall: 1, floor: 0 }); // the tub of juice
  // a crate of apples
  v.fill(c + 17, 0, 4, c + 27, 6, 14, (x, y, z) => (y === 6 && x > c + 17 && x < c + 27 && z > 4 && z < 14 ? ((x + z) % 3 ? 0xb8221e : 0xd8402a) : (y % 3 === 0 ? WOOD_D : WOOD_L)));
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [c, 0, 16], radius: 0.9 });
}

// cattails({ seed }) — a clump of marsh reeds and cattails with their brown sausage heads. 0.05 m voxels.
export function cattails({ seed = 1 } = {}) {
  const v = new Vox(24, 40, 24), R = rng(seed * 17 + 1);
  for (let k = 0; k < 10; k++) {
    const x = 12 + (R() - 0.5) * 16, z = 12 + (R() - 0.5) * 16, h = 18 + R() * 18, bx = (R() - 0.5) * 4, bz = (R() - 0.5) * 4;
    const col = R() < 0.4 ? 0xb89a4a : R() < 0.5 ? 0x7a8a3a : 0x9a9a46;
    polyline(v, [[x, 0, z], [x + bx, h, z + bz]], col);
    if (k % 3 === 0) v.fill(x + bx, h - 6, z + bz, x + bx, h - 2, z + bz, 0x5a3a22);
  }
  return finish(v, STD, { origin: [12, 0, 12], radius: 0.4 });
}

// wildlifeBlind() — a little plank hide for watching the moose: shed roof, a long viewing slot. 0.1 m voxels.
export function wildlifeBlind() {
  const v = new Vox(26, 28, 22);
  v.fill(1, 0, 1, 24, 19, 20, (x, y, z) => {
    const wall = x === 1 || x === 24 || z === 1 || z === 20;
    if (!wall) return y === 0 ? GREYWOOD_D : 0;
    if (z === 20 && y >= 11 && y <= 13 && x > 3 && x < 22) return 0; // the slot, facing +z
    if (z === 1 && x >= 10 && x <= 15 && y < 16) return 0; // the way in
    return (x + z) % 3 === 0 ? GREYWOOD_D : GREYWOOD;
  });
  for (let z = 0; z <= 21; z++) { const y = 20 + Math.round((21 - z) * 0.2); v.fill(0, y, z, 25, y, z, z % 2 ? 0x4a6040 : 0x3e5236); }
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, MID, { origin: [13, 0, 11], radius: 1.3 });
}

// coinViewer() — a coin-op viewer on a post at a lookout (green paint, chrome eyepieces). 0.05 m voxels.
export function coinViewer() {
  const v = new Vox(16, 32, 20), g = 0x2e6a4a, gd = 0x1e4a34;
  v.fill(6, 0, 8, 9, 2, 11, gd);
  v.fill(7, 3, 9, 8, 18, 10, g);
  v.ellipsoid(7.5, 22, 9.5, 4.5, 4, 6, (x, y, z) => (z >= 15 ? METAL_L : y > 24 ? tone(g, 0.1) : g));
  v.fill(5, 22, 2, 10, 24, 4, METAL); // eyepieces
  v.fill(6, 26, 8, 9, 27, 11, gd);
  bevel(v, { top: 0.06, bottom: 0 });
  return finish(v, STD, { origin: [7.5, 0, 9.5], radius: 0.3 });
}

// paddle() — a canoe paddle (lost at the lake). 0.025 m voxels, lying flat along z.
export function paddle() {
  const v = new Vox(12, 3, 64);
  v.fill(5, 1, 0, 6, 1, 3, WOOD_D); // grip
  v.fill(5, 1, 4, 6, 1, 38, WOOD_L);
  v.ellipsoid(5.5, 1, 50, 4.5, 0.6, 12, (x, y, z) => (z > 58 ? RED : WOOD));
  return finish(v, FINE, { origin: [6, 0, 32], radius: 0.4 });
}

// thermos() — a tall plaid thermos of cocoa with a red cup lid. 0.025 m voxels.
export function thermos() {
  const v = new Vox(12, 22, 12);
  lathe(v, 5.5, 5.5, 0, 16, 4.5, (x, y) => ((y >> 1) % 3 === 0 ? 0x2e5a40 : (x + y) % 4 === 0 ? 0x1e1418 : 0xc8361f));
  lathe(v, 5.5, 5.5, 17, 20, 3.5, RED_L);
  return finish(v, FINE, { origin: [5.5, 0, 5.5], radius: 0.15 });
}

// apple() — one shiny red apple with a leaf (the orchard's windfalls). 0.025 m voxels.
export function apple({ seed = 1 } = {}) {
  const v = new Vox(10, 11, 10);
  v.ellipsoid(4.5, 4, 4.5, 4, 3.8, 4, (x, y) => (y > 6 ? 0xd8402a : seed % 2 && y < 3 ? 0xb8a030 : 0xb8221e));
  v.fill(4, 8, 4, 4, 9, 4, WOOD_D);
  v.fill(5, 9, 4, 6, 9, 4, LEAF);
  return finish(v, FINE, { origin: [4.5, 0, 4.5], radius: 0.1 });
}

export const PREVIEW = {
  pumpkin_small: () => pumpkin({ kind: 'small', seed: 1 }),
  pumpkin_medium: () => pumpkin({ kind: 'medium', seed: 2 }),
  pumpkin_big: () => pumpkin({ kind: 'big', seed: 3 }),
  pumpkin_tall: () => pumpkin({ kind: 'tall', seed: 4 }),
  pumpkin_squat: () => pumpkin({ kind: 'squat', seed: 5 }),
  pumpkin_ghost: () => ghostPumpkin({ seed: 6 }),
  gourd_pear: () => gourd({ variant: 'pear', seed: 1 }),
  gourd_round: () => gourd({ variant: 'round', seed: 2 }),
  gourd_warty: () => gourd({ variant: 'warty', seed: 3 }),
  jack_classic: () => jackOLantern({ face: 'classic' }),
  jack_happy: () => jackOLantern({ face: 'happy', seed: 4 }),
  jack_scared: () => jackOLantern({ face: 'scared', seed: 5 }),
  jack_toothy: () => jackOLantern({ face: 'toothy', seed: 6 }),
  jack_cat: () => jackOLantern({ face: 'cat', seed: 7 }),
  jack_skull: () => jackOLantern({ face: 'skull', seed: 8, color: 'white' }),
  jack_classic_solid: () => jackOLantern({ face: 'classic', hollow: false }),
  jack_custom_grid: () => jackOLantern({ face: [
    '##........##', '###......###', '.##......##.', '............', '.....#......',
    '....###.....', '............', '#.########.#', '.##.####.##.', '...######...',
  ], seed: 9, color: 'amber' }),
  stack_pumpkins: () => pumpkinStack({ seed: 1 }),
  stack_pumpkins_jack: () => pumpkinStack({ seed: 2, jack: true }),
  hay_bale: () => hayBale({ seed: 1 }),
  corn_bundle: () => cornBundle({ seed: 1 }),
  scarecrow: () => scarecrow({ seed: 0 }),
  scarecrow_blue: () => scarecrow({ seed: 1, crow: false }),
  apple_crate: () => appleCrate({ seed: 1 }),
  apple_basket: () => appleBasket({ seed: 2 }),
  tomb_rounded: () => tombstone({ variant: 'rounded', seed: 1 }),
  tomb_cross: () => tombstone({ variant: 'cross', seed: 2 }),
  tomb_obelisk: () => tombstone({ variant: 'obelisk', seed: 3 }),
  tomb_cracked: () => tombstone({ variant: 'cracked', seed: 4 }),
  tomb_leaning: () => tombstone({ variant: 'leaning', seed: 5 }),
  tomb_mossy: () => tombstone({ variant: 'mossy', seed: 6 }),
  tomb_cute: () => tombstone({ variant: 'cute', seed: 7 }),
  coffin_closed: () => coffin({ open: false }),
  coffin_open: () => coffin({ open: true }),
  iron_fence: () => ironFence({ endPost: true }),
  wooden_cross: () => woodenCross({ seed: 1 }),
  ghost_post: () => ghostPost({ seed: 1 }),
  gargoyle: () => gargoyle({ seed: 1 }),
  cauldron: () => cauldron({ fire: true }),
  witch_hat: () => witchHat(),
  broom: () => broom(),
  candle_cluster: () => candleCluster({ seed: 1 }),
  candle_cluster_b: () => candleCluster({ seed: 4, count: 3 }),
  bobblehead_skeleton: () => skeletonBobblehead(),
  bobblehead_head_only: () => skeletonBobblehead({ part: 'head' }),
  bat_hanging: () => onGround(hangingBat()),
  bat_hanging_spread: () => onGround(hangingBat({ wings: 'spread' })),
  black_cat_statue: () => blackCatStatue(),
  candy_bowl: () => candyBowl(),
  candy_corn: () => candyCorn(),
  spider: () => spider(),
  lantern_red: () => lantern({ color: 'red' }),
  lantern_black: () => lantern({ color: 'black' }),
  bulb_orange: () => onGround(stringBulb({ color: 'orange' })),
  bulb_purple: () => onGround(stringBulb({ color: 'purple' })),
  bulb_green: () => onGround(stringBulb({ color: 'green' })),
  bowling_pin: () => bowlingPin(),
  trick_hoop: () => trickHoop({ flames: true }),
  trick_hoop_plain: () => trickHoop({ flames: false }),
  rocking_chair: () => rockingChair(),
  park_bench: () => parkBench(),
  park_bench_green: () => parkBench({ color: 'green', seed: 2 }),
  picnic_table: () => picnicTable(),
  picnic_table_cloth: () => picnicTable({ cloth: true }),
  cafe_table: () => cafeTable(),
  cafe_chair: () => cafeChair(),
  barrel: () => barrel(),
  barrel_apples: () => barrel({ contents: 'apples', seed: 2 }),
  crate: () => crate(),
  crate_pumpkin: () => crate({ stamp: 'pumpkin', seed: 2 }),
  wheelbarrow: () => wheelbarrow(),
  wheelbarrow_leaves: () => wheelbarrow({ contents: 'leaves' }),
  mailbox_classic: () => mailbox({ variant: 'classic' }),
  mailbox_red_flag_down: () => mailbox({ variant: 'red', flag: 'down', seed: 2 }),
  mailbox_black: () => mailbox({ variant: 'black', seed: 3, dent: false }),
  mailbox_teal: () => mailbox({ variant: 'teal', seed: 4 }),
  mailbox_house: () => mailbox({ variant: 'house', seed: 5 }),
  birdhouse: () => birdhouse(),
  well: () => well(),
  signpost: () => signpost(),
  flower_pot_orange: () => flowerPot({ color: 'orange' }),
  flower_pot_burgundy: () => flowerPot({ color: 'burgundy', seed: 2 }),
  bucket: () => bucket(),
  milk_churn: () => milkChurn(),
  firewood_pile: () => firewoodPile(),
  stump_axe: () => stumpWithAxe(),
  canoe: () => canoe(),
  canoe_flipped: () => canoe({ flip: true, color: 0x2f7f7a }),
  life_ring: () => lifeRing(),
  lobster_trap: () => lobsterTrap(),
  buoy: () => buoy({ seed: 0 }),
  buoy_b: () => buoy({ seed: 1 }),
  street_lamp: () => streetLamp(),
  street_lamp_hook: () => streetLamp({ variant: 'hook' }),
  porch_lantern: () => porchLantern(),
  fire_pit: () => firePit(),
  mound_hole: () => dirtMound({ stage: 'hole' }),
  mound_filled: () => dirtMound({ stage: 'mound' }),
  mound_sprout: () => dirtMound({ stage: 'sprout' }),
  mound_sapling: () => dirtMound({ stage: 'sapling' }),
  young_sapling: () => youngSapling({ leaves: 'gold', seed: 2 }),
  garden_gnome: () => gardenGnome(),
  lawn_flamingo: () => lawnFlamingo(),
  item_candy_red: () => wrappedCandy({ color: 'red' }),
  item_candy_purple: () => wrappedCandy({ color: 'purple' }),
  item_candy_green: () => wrappedCandy({ color: 'green' }),
  item_letter: () => letter(),
  item_parcel: () => parcel(),
  item_camera: () => camera(),
  item_watering_can: () => wateringCan(),
  item_compass: () => compass(),
  item_hockey_puck: () => hockeyPuck(),
  item_stethoscope: () => stethoscope(),
  item_mountie_hat: () => mountieHat(),
  item_trophy: () => trophyCup(),
  item_candy_corn: () => candyCorn(),
  // the remade map
  sidewalk: () => sidewalk({ len: 4 }),
  town_lamp: () => townLamp({}),
  planter: () => planter({ seed: 2 }),
  post_box: () => postBox(),
  hydrant: () => hydrant(),
  litter_bin: () => litterBin(),
  bike_rack: () => bikeRack(),
  stop_sign: () => stopSign(),
  moose_sign: () => mooseSign(),
  flag_pole: () => flagPole({ h: 4 }),
  sign_post: () => signPost(),
  sign_arrow: () => signArrow({ text: 'MAPLE COVE' }),
  welcome_sign: () => welcomeSign({}),
  muskoka_red: () => muskokaChair({ color: 0xc8382e }),
  muskoka_teal: () => muskokaChair({ color: 0x2f8a86 }),
  tent: () => tent({}),
  sap_bucket: () => sapBucket(),
  sand_castle: () => sandCastle({ seed: 2 }),
  beach_umbrella: () => beachUmbrella({}),
  driftwood: () => driftwood({}),
  inukshuk: () => inukshuk({}),
  jump_ramp: () => jumpRamp({ len: 5, h: 1.3 }),
  rail_fence: () => railFence({}),
  picket_fence: () => picketFence({}),
  corn_row: () => cornRow({}),
  pumpkin_vines: () => pumpkinVines({}),
  tractor: () => tractor({}),
  farm_stand: () => farmStand({}),
  bbq_grill: () => bbqGrill(),
  cenotaph: () => cenotaph(),
  rowboat: () => rowboat({}),
  fishing_boat: () => fishingBoat({}),
  hockey_net: () => hockeyNet(),
  giant_goose: () => giantGoose(),
  clothesline: () => clothesline({}),
  picket_coarse: () => picketFence({ coarse: true }),
  rail_track: () => railTrack({}),
  tunnel_portal: () => tunnelPortal(),
  handcar: () => handcar({}),
  wood_deck: () => woodDeck({ len: 6, w: 2, rail: 1 }),
  apple_tree: () => appleTree({ seed: 2 }),
  cider_press: () => ciderPress(),
  cattails: () => cattails({}),
  wildlife_blind: () => wildlifeBlind(),
  coin_viewer: () => coinViewer(),
  paddle: () => paddle(),
  thermos: () => thermos(),
  apple: () => apple({}),
};
