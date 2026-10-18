// The voxel versions of the waterfront and countryside structures that props.js used to
// build from smooth boxes, tubes and spheres (props.js still lays down their physics):
//  - the boardwalk (plank by plank, pilings green and crusted at the waterline, the white
//    railing on the water side, life rings), the gangways down from Wharf Street, the
//    floating docks with their ramps, floats and cleats;
//  - the cemetery's iron fence ring, Hank's own stone and the dirt beside it, the gnarled
//    dead tree the crows sit in, the gate sign;
//  - Nana's homestead: the woodpile and chopping stump, the garden fence, the clothesline
//    with its sweaters, the fire pit and its stump seats;
//  - the fall-fair banner on the green, the lookout's telescope, sign and log fence,
//    Harold's tree stand, the beaver dam and the trapper's canoe.
// Everything is merged into the voxel town's static chunks (VoxelWorld.addStatic).
import * as THREE from 'three';
import * as L from './layout.js';
import { Vox, vhash, tone } from '../voxel/vox.js';
import * as PR from '../voxel/models/props.js';
import * as LORE from '../voxel/models/lore.js';
import { buildingMatrix, toWorld } from './buildings.js';
import { RNG } from '../core/noise.js';
import { nearestRoad } from './terrain.js';

const S16 = 1 / 16;
// weathered, sun-greyed boards (a groove a couple of shades down between them: dark enough to
// read up close, soft enough not to shimmer far off)
const PLANK = [0xb0906a, 0xaa8a64, 0xb6966e, 0xac8c66];
const GROOVE = 0x9a7c5a;
const PILE = [0x4e3828, 0x5a4230, 0x46301f];
const BEAM = 0x5e4028;
const TRIM = 0xf2ece0, TRIM_D = 0xd6cec0;
const ALGAE = [0x3e5a3a, 0x4a6a40, 0x2e4a34], BARNACLE = 0xcfc6b2;

// a voxel canvas in metres: x across, y up, z along; boxes fill the voxels whose centres they hold
class Canvas {
  constructor(s, x0, y0, z0, x1, y1, z1) {
    this.s = s;
    this.i0 = Math.floor(x0 / s) - 1; this.j0 = Math.floor(y0 / s) - 1; this.k0 = Math.floor(z0 / s) - 1;
    this.v = new Vox(Math.ceil(x1 / s) - this.i0 + 2, Math.ceil(y1 / s) - this.j0 + 2, Math.ceil(z1 / s) - this.k0 + 2);
  }
  // inclusive voxel range for a metric interval [a, b)
  r(a, b, o) { const s = this.s; return [Math.round(a / s) - o, Math.round(b / s) - o - 1]; }
  box(x0, y0, z0, x1, y1, z1, c) {
    const [ia, ib] = this.r(Math.min(x0, x1), Math.max(x0, x1), this.i0);
    const [ja, jb] = this.r(Math.min(y0, y1), Math.max(y0, y1), this.j0);
    const [ka, kb] = this.r(Math.min(z0, z1), Math.max(z0, z1), this.k0);
    this.v.fill(ia, ja, ka, Math.max(ia, ib), Math.max(ja, jb), Math.max(ka, kb), typeof c === 'function' ? (i, j, k) => c(i, j, k, (j + this.j0 + 0.5) * this.s) : c);
  }
  // a sloped slab: top at y(z) (metres), `th` thick, across [x0, x1], along [z0, z1]
  slope(x0, x1, z0, z1, yAt, th, c) {
    const s = this.s;
    const [ka, kb] = this.r(z0, z1, this.k0);
    const [ia, ib] = this.r(x0, x1, this.i0);
    for (let k = ka; k <= kb; k++) {
      const z = (k + this.k0 + 0.5) * s;
      const top = Math.round(yAt(z) / s) - this.j0 - 1;
      for (let j = top - Math.max(1, Math.round(th / s)) + 1; j <= top; j++) for (let i = ia; i <= ib; i++) {
        const col = typeof c === 'function' ? c(i, j, k, top - j) : c;
        if (col) this.v.set(i, j, k, col);
      }
    }
  }
  result() { return { vox: this.v, size: this.s, origin: [-this.i0, -this.j0, -this.k0] }; }
}

// plank deck colours: planks across z (each `pw` metres), a dark groove between them, a
// nail head here and there, the odd board a shade off
function plankFn(C, pw, seed, { grooveTop = 0, dark = false } = {}) {
  const s = C.s, n = Math.max(2, Math.round(pw / s));
  return (i, j, k) => {
    const kk = k + C.k0, p = Math.floor(kk / n);
    const top = j >= grooveTop;
    // (the seam between boards: only a voxel a shade down at each board's end, never a dark line
    // every fourth voxel - that period shimmered into moire rings across the far docks)
    if (top && ((kk % n) + n) % n === n - 1 && vhash(i + C.i0, 5, p, seed) < 0.35) return GROOVE;
    let c = PLANK[Math.floor(vhash(p, 7, 3, seed) * PLANK.length)];
    if (dark) c = tone(c, -0.22);
    const h = vhash(i + C.i0, j, kk, seed);
    if (h < 0.05) c = tone(c, -0.08); else if (h > 0.96) c = tone(c, 0.07);
    return c;
  };
}
function pileFn(C, seed, waterY) {
  return (i, j, k, y) => {
    const h = vhash(i, j >> 1, k, seed);
    if (y < waterY + 0.25 && y > waterY - 0.9) return h < 0.18 ? BARNACLE : ALGAE[Math.floor(h * 3) % 3];
    return PILE[Math.floor(vhash(i, j >> 2, k, seed + 1) * 3)];
  };
}

// ---------------------------------------------------------------- the boardwalk
function boardwalk(vw, terrain) {
  for (const [si, s] of L.BOARDWALK.entries()) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const cx = (s.a[0] + s.b[0]) / 2, cz = (s.a[1] + s.b[1]) / 2;
    const M = buildingMatrix(cx, s.h, cz, yaw);
    const CH = 5.2;
    for (let z0 = -len / 2, ci = 0; z0 < len / 2 - 0.01; z0 += CH, ci++) {
      const z1 = Math.min(len / 2, z0 + CH);
      const zc = (z0 + z1) / 2, hl = (z1 - z0) / 2;
      // pilings at 2.6 m from the segment start (both sides), with their own depths
      const piles = [];
      const lastChunk = z1 >= len / 2 - 1e-6;
      for (let k = Math.ceil((z0 + len / 2) / 2.6 - 1e-6); ; k++) {
        const z = -len / 2 + k * 2.6;
        if (lastChunk ? z > len / 2 + 0.01 : z >= z1 - 1e-6) break;
        for (const sx of [-s.w / 2 + 0.15, s.w / 2 - 0.15]) {
          const wp = toWorld(M, sx, 0, z);
          piles.push({ x: sx, z: z - zc, bottom: Math.min(terrain.heightAt(wp.x, wp.z), -0.3) - 1.2 - s.h });
        }
      }
      const bot = Math.min(-0.5, ...piles.map((p) => p.bottom));
      const C = new Canvas(S16, -s.w / 2 - 0.1, bot, -hl - 0.2, s.w / 2 + 0.1, 1.12, hl + 0.2);
      // deck: three voxels of planks across the walk, grooves between
      C.box(-s.w / 2, -0.19, -hl, s.w / 2, 0, hl, plankFn(C, 0.25, si * 31 + ci, { grooveTop: -C.j0 - 1 }));
      for (const p of piles) {
        C.box(p.x - 0.16, p.bottom, p.z - 0.16, p.x + 0.16, -0.19, p.z + 0.16, pileFn(C, si * 7 + ci, -s.h));
        C.box(-s.w / 2, -0.44, p.z - 0.13, s.w / 2, -0.19, p.z + 0.13, BEAM);
      }
      // the white railing on the water side (local -x): posts every 2 m, two rails
      const rx = -(s.w / 2 - 0.08);
      for (let k = Math.ceil((z0 + len / 2) / 2.0 - 1e-6); ; k++) {
        const z = -len / 2 + k * 2.0;
        if (z > z1 + 0.001 || z > len / 2 + 0.001) break;
        const zl = Math.max(-hl + 0.07, Math.min(hl - 0.07, z - zc));
        C.box(rx - 0.07, 0, zl - 0.07, rx + 0.07, 1.06, zl + 0.07, (i, j) => (j % 9 === 0 ? TRIM_D : TRIM));
      }
      C.box(rx - 0.05, 0.5, -hl, rx + 0.05, 0.6, hl, TRIM);
      C.box(rx - 0.06, 0.94, -hl, rx + 0.06, 1.06, hl, (i, j) => (j === C.v.h ? TRIM_D : TRIM));
      const w = toWorld(M, 0, 0, zc);
      vw.addStatic(vw.model(`bw:${si}:${ci}`, () => C.result()), w.x, s.h, w.z, yaw);
    }
    // life rings on the railing
    for (let z = -len / 2 + 6; z < len / 2 - 3; z += 13) {
      const rp = toWorld(M, -(s.w / 2 + 0.06), 0, z + 2);
      vw.addStatic(vw.model('lifering', () => PR.lifeRing()), rp.x, s.h + 0.45, rp.z, yaw - Math.PI / 2);
    }
  }
}

// gangways from the street: a sloped plank walk on posts with a handrail each side
function gangways(vw, terrain) {
  L.BOARDWALK_RAMPS.forEach((r, ri) => {
    const dx = r.b[0] - r.a[0], dz = r.b[1] - r.a[1], len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const cx = (r.a[0] + r.b[0]) / 2, cz = (r.a[1] + r.b[1]) / 2;
    const M = buildingMatrix(cx, 0, cz, yaw);
    const y0 = terrain.heightAt(r.a[0], r.a[1]) - 0.02, y1 = L.BOARDWALK[0].h;
    const yAt = (z) => y0 + (y1 - y0) * Math.min(1, Math.max(0, (z + len / 2) / len));
    const posts = [];
    for (let z = -len / 2; z <= len / 2; z += 2.4) for (const sx of [-r.w / 2, r.w / 2]) {
      const wp = toWorld(M, sx, 0, z);
      posts.push({ x: sx, z, y: yAt(z), bottom: Math.min(terrain.heightAt(wp.x, wp.z), yAt(z)) - 1 });
    }
    const bot = Math.min(...posts.map((p) => p.bottom), y0 - 0.3);
    const C = new Canvas(S16, -r.w / 2 - 0.15, bot, -len / 2, r.w / 2 + 0.15, Math.max(y0, y1) + 1.15, len / 2);
    const pf = plankFn(C, 0.25, 40 + ri, { grooveTop: 1 });
    C.slope(-r.w / 2, r.w / 2, -len / 2, len / 2, yAt, 0.19, (i, j, k, depth) => (depth === 0 ? pf(i, 99, k) : pf(i, 0, k)));
    for (const p of posts) {
      C.box(p.x - 0.11, p.bottom, p.z - 0.11, p.x + 0.11, p.y - 0.15, p.z + 0.11, pileFn(C, ri, 0));
      C.box(p.x - 0.05, p.y, p.z - 0.05, p.x + 0.05, p.y + 1.0, p.z + 0.05, TRIM);
    }
    for (const sx of [-r.w / 2, r.w / 2]) C.slope(sx - 0.05, sx + 0.05, -len / 2, len / 2, (z) => yAt(z) + 1.04, 0.1, TRIM);
    vw.addStatic(vw.model(`gangway:${ri}`, () => C.result()), cx, 0, cz, yaw);
  });
}

// floating docks: a hinged ramp down from the boardwalk, the deck on its floats, cleats
function docks(vw) {
  L.DOCKS.forEach((d, di) => {
    const dx = d.b[0] - d.a[0], dz = d.b[1] - d.a[1], len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rampLen = 6, restLen = len - rampLen;
    const y0 = L.BOARDWALK[0].h, y1 = d.h;
    // the ramp
    {
      const C = new Canvas(S16, -d.w / 2, Math.min(y0, y1) - 0.4, 0, d.w / 2, Math.max(y0, y1) + 0.1, rampLen);
      const pf = plankFn(C, 0.25, 70 + di, { dark: true, grooveTop: 1 });
      C.slope(-d.w / 2 + 0.3, d.w / 2 - 0.3, 0, rampLen, (z) => y0 + (y1 - y0) * (z / rampLen), 0.16, (i, j, k, depth) => (depth === 0 ? pf(i, 99, k) : pf(i, 0, k)));
      // a stringer down each side
      for (const sx of [-d.w / 2 + 0.3, d.w / 2 - 0.4]) C.slope(sx, sx + 0.1, 0, rampLen, (z) => y0 + (y1 - y0) * (z / rampLen) - 0.1, 0.18, BEAM);
      vw.addStatic(vw.model(`dockramp:${di}`, () => C.result()), d.a[0], 0, d.a[1], yaw);
    }
    // the deck on its floats
    {
      const hl = restLen / 2;
      const C = new Canvas(S16, -d.w / 2 - 0.12, -0.7, -hl, d.w / 2 + 0.12, 0.3, hl);
      C.box(-d.w / 2, -0.19, -hl, d.w / 2, 0, hl, plankFn(C, 0.25, 90 + di, { grooveTop: -C.j0 - 1 }));
      C.box(-d.w / 2 + 0.15, -0.64, -hl + 0.15, d.w / 2 - 0.15, -0.19, hl - 0.15, (i, j, k) => (vhash(i >> 2, j, k >> 2, di) < 0.12 ? 0x2e3c3c : j % 4 === 0 ? 0x34444a : 0x3a4a4a));
      // an edge board all round and cleats
      C.box(-d.w / 2 - 0.06, -0.3, -hl, -d.w / 2, 0.02, hl, BEAM);
      C.box(d.w / 2, -0.3, -hl, d.w / 2 + 0.06, 0.02, hl, BEAM);
      for (let z = -hl + 1; z < hl; z += 3) for (const sx of [-d.w / 2 + 0.12, d.w / 2 - 0.12]) {
        C.box(sx - 0.06, 0, z - 0.16, sx + 0.06, 0.06, z + 0.16, 0x2a2a2e);
        C.box(sx - 0.05, 0.06, z - 0.22, sx + 0.05, 0.12, z + 0.22, 0x3a3a40);
      }
      const ax = d.a[0] + fx * (rampLen + hl), az = d.a[1] + fz * (rampLen + hl);
      vw.addStatic(vw.model(`dock:${di}`, () => C.result()), ax, d.h, az, yaw);
    }
  });
}

// ---------------------------------------------------------------- the cemetery
function cemetery(vw, terrain) {
  const g = L.POI.graveyard, R = 15;
  const pts = [];
  for (let i = 1; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2 + 1.25;
    pts.push([g.x + Math.cos(a) * R, g.z + Math.sin(a) * R]);
  }
  ironFence(vw, terrain, pts, 2.4);
  // Hank's own stone (where the prologue stands it) and the dug earth beside the grave
  const hg = L.POI.grave, yaw = Math.PI * 0.75;
  const Mg = buildingMatrix(hg.x, 0, hg.z, yaw);
  const st = toWorld(Mg, 0, 0, -1.12);
  vw.addStatic(vw.model('hankStone', () => LORE.hankStone()), st.x, terrain.heightAt(st.x, st.z), st.z, yaw, 1.05);
  const mp = toWorld(Mg, 1.4, 0, 0.1);
  vw.addStatic(vw.model('graveDirt', () => PR.dirtMound({ stage: 'mound', seed: 2 })), mp.x, terrain.heightAt(mp.x, mp.z) - 0.04, mp.z, yaw + 0.3, 1.3);
  // the gnarled dead tree the crows sit in (the same limbs as its perches in props.js)
  const tx = g.x - 9, tz = g.z - 7.5;
  vw.addStatic(vw.model('crowTree', crowTree), tx, terrain.heightAt(tx, tz), tz, 0.4);
  // the gate sign
  const ga = 1.25 - 0.08;
  const gx = g.x + Math.cos(ga) * (R + 1.5), gz = g.z + Math.sin(ga) * (R + 1.5);
  signBoard(vw, 'OLD PINE CEMETERY', gx, terrain.heightAt(gx, gz), gz, ga + Math.PI / 2 + 0.6, 1.1, 1.7);
}

// an iron fence along a polyline: spear-topped panels between the points, `spacing` apart
function ironFence(vw, terrain, pts, spacing) {
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / spacing));
    for (let i = 0; i < n; i++) {
      const x0 = ax + (bx - ax) * (i / n), z0 = az + (bz - az) * (i / n);
      const x1 = ax + (bx - ax) * ((i + 1) / n), z1 = az + (bz - az) * ((i + 1) / n);
      const L2 = Math.hypot(x1 - x0, z1 - z0), len = Math.max(6, Math.round(L2 / 0.05));
      const last = k === pts.length - 2 && i === n - 1;
      const r = vw.model(`iron:${len}:${last}`, () => PR.ironFence({ length: len, endPost: last, seed: (len % 5) + 1 }));
      const y = Math.min(terrain.heightAt(x0, z0), terrain.heightAt(x1, z1));
      vw.addStatic(r, x0, y, z0, Math.atan2(-(z1 - z0), x1 - x0));
    }
  }
}

// the old dead tree by the cemetery: trunk and limbs as in the props.js perches (0.1 m voxels)
function crowTree() {
  const s = 0.1;
  const C = new Canvas(s, -3.2, -0.2, -1.4, 3.2, 6.6, 1.8);
  const bark = (i, j, k) => { const h = vhash(i, j >> 1, k, 9); return h < 0.15 ? 0x3a2e28 : h < 0.55 ? 0x5a4a40 : 0x6a5a50; };
  const limb = (a, b, r0, r1) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (s * 0.5));
    for (let q = 0; q <= n; q++) {
      const t = q / n, r = r0 + (r1 - r0) * t;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      C.v.ellipsoid(x / s - C.i0 - 0.5, y / s - C.j0 - 0.5, z / s - C.k0 - 0.5, r / s + 0.35, r / s + 0.35, r / s + 0.35, bark);
    }
  };
  // (props.js tubes, with x and z in the tree's frame)
  limb([0, -0.2, 0], [0.3, 3.2, 0.1], 0.45, 0.28);
  limb([-0.6, 0, 0.1], [0, 0.5, 0], 0.18, 0.2); limb([0.5, 0, -0.4], [0, 0.6, 0], 0.16, 0.2); // roots
  limb([0.3, 3.0, 0.1], [1.8, 4.6, 0.4], 0.18, 0.11);
  limb([1.8, 4.6, 0.4], [2.6, 4.9, 1.2], 0.1, 0.06);
  limb([0.25, 2.6, 0.1], [-1.5, 3.9, -0.6], 0.16, 0.1);
  limb([-1.5, 3.9, -0.6], [-2.2, 4.8, -0.4], 0.08, 0.05);
  limb([0.3, 3.2, 0.1], [0.2, 5.4, 0.3], 0.14, 0.08);
  limb([0.2, 5.4, 0.3], [-0.6, 6.1, 0.2], 0.07, 0.05);
  // a hollow in the trunk
  C.v.ellipsoid(0.15 / s - C.i0, 1.6 / s - C.j0, 0.5 / s - C.k0, 1.2, 2.2, 1.2, 0x1e1418);
  return C.result();
}

// a painted sign board on two posts, lettered (VoxelWorld.sign paints the words)
function signBoard(vw, text, x, y, z, yaw, scale = 1.2, h = 1.6, { posts = true } = {}) {
  const w = Math.min(3.2, (0.32 + text.length * 0.17) * scale), bh = 0.42 * scale;
  const r = vw.model(`board:${text}:${posts}:${h}`, () => {
    const C = new Canvas(S16, -w / 2 - 0.1, posts ? 0 : h - bh, -0.1, w / 2 + 0.1, h + bh / 2 + 0.7, 0.1);
    if (posts) for (const sx of [-w / 2 + 0.15, w / 2 - 0.15]) C.box(sx - 0.06, 0, -0.08, sx + 0.06, h + bh / 2 + 0.06, 0.04, (i, j, k) => (vhash(i, j >> 2, k, 3) < 0.3 ? 0x5a3a22 : 0x6e4a2c));
    else for (const sx of [-w / 2 + 0.2, w / 2 - 0.2]) C.box(sx - 0.02, h + bh / 2, -0.02, sx + 0.02, h + bh / 2 + 0.62, 0.02, 0xd8c8a0); // ropes up to the bunting
    C.box(-w / 2 - 0.06, h - bh / 2 - 0.06, -0.02, w / 2 + 0.06, h + bh / 2 + 0.06, 0.06, 0x3a2414);
    C.box(-w / 2, h - bh / 2, 0.06, w / 2, h + bh / 2, 0.08, 0xf2e6c8);
    return C.result();
  });
  vw.addStatic(r, x, y, z, yaw);
  const M = buildingMatrix(x, y, z, yaw);
  vw.sign({ text, x: 0, y: h, z: 0.1, w: w - 0.08, h: bh - 0.06, normal: [0, 0, 1] }, M, {});
}

// ---------------------------------------------------------------- Nana's homestead
function homestead(vw, terrain) {
  const gy = (x, z) => terrain.heightAt(x, z);
  // woodpile, chopping stump with the axe in it
  const Mw = buildingMatrix(-186, 0, 78, 0.3);
  let p = toWorld(Mw, -0.1, 0, 0);
  vw.addStatic(vw.model('wood:home', () => PR.firewoodPile({ seed: 3, rows: 4 })), p.x, gy(p.x, p.z), p.z, 0.3, 1.25);
  p = toWorld(Mw, 1.6, 0, 0.6);
  vw.addStatic(vw.model('stumpAxe', () => PR.stumpWithAxe({ axe: true })), p.x, gy(p.x, p.z), p.z, 0.3);
  // the garden fence (white pickets, the same as round the yards)
  const gx = -160, gz = 52;
  const run = [[gx - 4, gz - 3.2], [gx + 4, gz - 3.2], [gx + 4, gz + 3.2], [gx - 4, gz + 3.2], [gx - 4, gz - 1]];
  for (let i = 0; i < run.length - 1; i++) vw.fenceRun('picket', run[i][0], run[i][1], run[i + 1][0], run[i + 1][1]);
  // the clothesline: two T posts, the line, five sweaters
  vw.addStatic(vw.model('clothesline:home', () => clothesline(12)), -191, gy(-191, 64), 64, 0);
  // fire pit and three stump seats
  const px = -164, pz = 84;
  vw.addStatic(vw.model('firepit:home', () => PR.firePit({ lit: false, seed: 4 })), px, gy(px, pz) - 0.02, pz, 0.2, 1.4);
  [0.5, 2.4, 4.2].forEach((a, i) => {
    const x = px + Math.cos(a) * 2.0, z = pz + Math.sin(a) * 2.0;
    vw.addStatic(vw.model(`seat:${i}`, () => LORE.stump({ seed: 5 + i, r: 6, h: 9 })), x, gy(x, z) - 0.03, z, a);
  });
}

// a clothesline `len` metres long along z with T posts and sweaters drying
function clothesline(len) {
  const C = new Canvas(S16, -0.5, 0, -len / 2 - 0.1, 0.5, 2.3, len / 2 + 0.1);
  const wood = (i, j, k) => (vhash(i, j >> 2, k, 2) < 0.3 ? 0x6a4428 : 0x7a5232);
  for (const z of [-len / 2, len / 2]) {
    C.box(-0.06, 0, z - 0.06, 0.06, 2.2, z + 0.06, wood);
    C.box(-0.06, 2.1, z - 0.4, 0.06, 2.2, z + 0.4, wood);
  }
  C.box(-0.02, 2.05, -len / 2, 0.02, 2.1, len / 2, 0xe8e4dc);
  const clothes = [0xc8361f, 0x2f6e6a, 0xe2d4b4, 0x8a3a5a, 0xf2c443];
  for (let i = 0; i < 5; i++) {
    const z = -len / 2 + 1.5 + i * 2.2, c = clothes[i];
    const sw = (ii, j, k) => (j % 4 === 0 ? tone(c, -0.18) : vhash(ii, j, k, i) < 0.08 ? tone(c, 0.12) : c);
    C.box(-0.04, 1.33, z - 0.4, 0.04, 2.06, z + 0.4, sw); // body
    C.box(-0.04, 1.6, z - 0.62, 0.04, 2.06, z + 0.62, sw); // sleeves
    C.box(-0.05, 2.02, z - 0.2, 0.05, 2.1, z - 0.16, 0xd8c8a0); C.box(-0.05, 2.02, z + 0.16, 0.05, 2.1, z + 0.2, 0xd8c8a0); // pegs
  }
  return C.result();
}

// ---------------------------------------------------------------- the green, the lookout, the wilds
function greenBanner(vw, terrain) {
  const p = L.POI.plaza, py = terrain.heightAt(p.x, p.z);
  const r = vw.model('fairBanner', () => {
    const C = new Canvas(S16, -6.2, 0, -0.2, 6.2, 4.5, 0.2);
    for (const sx of [-6, 6]) C.box(sx - 0.09, 0, -0.09, sx + 0.09, 4.4, 0.09, (i, j, k) => (vhash(i, j >> 2, k, 6) < 0.3 ? 0x6a4428 : 0x7a5232));
    // bunting between the posts and the board in the middle
    for (let x = -5.9; x < 5.9; x += 0.5) {
      const sag = -0.35 * (1 - (x / 6) ** 2);
      const c = [0xc8302a, 0xf2c443, 0x2f8a86, 0xe0701e][Math.floor((x + 6) * 2) % 4];
      C.box(x - 0.02, 4.25 + sag, -0.02, x + 0.02, 4.3 + sag, 0.02, 0xe8e4dc);
      C.box(x - 0.12, 4.05 + sag, -0.02, x + 0.12, 4.25 + sag, 0.02, c);
      C.box(x - 0.05, 3.95 + sag, -0.02, x + 0.05, 4.05 + sag, 0.02, c);
    }
    return C.result();
  });
  vw.addStatic(r, p.x, py, p.z + 12, 0);
  signBoard(vw, 'FALL FAIR!', p.x, py, p.z + 12.05, 0, 1.6, 3.4, { posts: false });
  signBoard(vw, 'FALL FAIR!', p.x, py, p.z + 11.95, Math.PI, 1.6, 3.4, { posts: false });
}

function lookout(vw, terrain) {
  const p = L.POI.lookout, y = terrain.heightAt(p.x, p.z);
  vw.addStatic(vw.model('coinViewer', () => PR.coinViewer()), p.x - 2, y, p.z + 3, 0.6 + Math.PI);
  const sx = p.x + 5, sz = p.z - 4;
  signBoard(vw, 'SUNSET LOOKOUT', sx, terrain.heightAt(sx, sz), sz, 2.2, 1.0, 1.6);
  const pts = [];
  for (let i = 0; i <= 6; i++) { const a = 0.2 + (i / 6) * 1.6; pts.push([p.x + Math.cos(a) * 9, p.z + Math.sin(a) * 9]); }
  for (let i = 0; i < pts.length - 1; i++) vw.fenceRun('rail', pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
}

function wilds(vw, terrain) {
  // Harold's tree stand: four leaning log legs, a plank floor, a back wall and a ladder
  const s = L.POI.treestand;
  vw.addStatic(vw.model('treestand', treeStand), s.x, terrain.heightAt(s.x, s.z), s.z, 0.5);
  // the beaver dam across the pond outlet
  const pd = L.POI.pond;
  vw.addStatic(vw.model('beaverDam', () => beaverDam(terrain, pd)), pd.x, 0, pd.z + 9, 0);
  // the trapper's canoe, upside down by the hut
  const t = L.POI.trapper;
  const M = buildingMatrix(t.x + 3, 0, t.z + 2, 1.1);
  const c = toWorld(M, 0, 0, 0);
  vw.addStatic(vw.model('canoe:trapper', () => PR.canoe({ flip: true, paddle: false, color: 0x2f6e6a })), c.x, terrain.heightAt(c.x, c.z), c.z, 1.1);
}

function treeStand() {
  const s = 0.0625;
  const C = new Canvas(s, -1.5, 0, -1.5, 1.5, 5.4, 1.6);
  const log = (i, j, k) => { const h = vhash(i, j >> 2, k, 4); return h < 0.2 ? 0x4a3020 : h < 0.6 ? 0x6a4a30 : 0x7a5a3a; };
  const line = (a, b, r, col) => {
    const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / (s * 0.5));
    for (let q = 0; q <= n; q++) {
      const t = q / n;
      const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t, z = a[2] + (b[2] - a[2]) * t;
      C.v.ellipsoid(x / s - C.i0 - 0.5, y / s - C.j0 - 0.5, z / s - C.k0 - 0.5, r / s, r / s, r / s, col);
    }
  };
  for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) line([x * 1.2, 0, z * 1.2], [x * 0.9, 4.2, z * 0.9], 0.1, log);
  C.box(-1.1, 4.12, -1.1, 1.1, 4.27, 1.1, (i, j, k) => (k % 4 === 0 ? GROOVE : PLANK[(k >> 2) % 4]));
  C.box(-1.1, 4.27, -1.12, 1.1, 5.3, -1.0, (i, j, k) => (i % 4 === 0 ? tone(0x6a4a30, -0.2) : 0x6a4a30));
  for (const sx of [-0.35, 0.35]) line([sx, 0, 1.4], [sx, 4.3, 1.3], 0.04, 0x7a5232);
  for (let k = 0; k < 8; k++) C.box(-0.35, 0.37 + k * 0.5, 1.32, 0.35, 0.43 + k * 0.5, 1.4, 0x8a6240);
  return C.result();
}

function beaverDam(terrain, pd) {
  const s = 0.1;
  const C = new Canvas(s, -11, -1.4, -3.5, 11, 1.6, 3.5);
  const rng = new RNG(8);
  const cols = [0x5a4030, 0x6a4a34, 0x4a3426, 0x8a6a4a];
  // mud bank under the sticks
  for (let i = 0; i < 60; i++) {
    const t = rng.range(-1, 1), x = t * 9 + rng.range(-0.6, 0.6), z = t * 1.5 + rng.range(-1, 1);
    const y = Math.max(terrain.heightAt(pd.x + x, pd.z + 9 + z), -0.4);
    C.v.ellipsoid(x / s - C.i0, (y - 0.15) / s - C.j0, z / s - C.k0, 5, 2.5, 5, 0x4a3a2a);
  }
  const rng2 = new RNG(8);
  for (let i = 0; i < 70; i++) {
    const t = rng2.range(-1, 1);
    const x = t * 9 + rng2.range(-0.6, 0.6), z = t * 1.5 + rng2.range(-1, 1);
    const yy = Math.max(terrain.heightAt(pd.x + x, pd.z + 9 + z), -0.4) + rng2.range(-0.1, 0.5);
    const a = rng2.range(0, Math.PI), dy = rng2.range(-0.2, 0.3), col = rng2.pick(cols);
    const n = 24;
    for (let q = 0; q <= n; q++) {
      const u = q / n - 0.5;
      C.v.ellipsoid((x + Math.cos(a) * 2.4 * u) / s - C.i0 - 0.5, (yy + dy * (u + 0.5)) / s - C.j0 - 0.5, (z + Math.sin(a) * 2.4 * u) / s - C.k0 - 0.5, 0.7, 0.7, 0.7, col);
    }
  }
  return C.result();
}

// everything above, once the voxel town is being dressed
export function voxelStructures(vw) {
  const T = vw.terrain;
  boardwalk(vw, T);
  gangways(vw, T);
  docks(vw);
  cemetery(vw, T);
  homestead(vw, T);
  greenBanner(vw, T);
  lookout(vw, T);
  wilds(vw, T);
}
void THREE; void nearestRoad;
