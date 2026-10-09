// Terrain generation: heightmap + splat map, built from the handcrafted layout.
// Pure JS (no three.js) so it can also run in node for debug map rendering.
import { Simplex } from '../core/noise.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import * as L from './layout.js';

const sx = new Simplex(1337);
const sx2 = new Simplex(4242);

export const H_RES = 2; // metres per height cell
export const S_RES = 0.5; // metres per splat texel
export const R_RES = 1; // metres per road-frame texel (see Terrain.buildRoadInfo)
export const ROAD_SPAN = 6; // the road frame's signed distance runs +-6 m
const HALF = L.WORLD_HALF;

const gauss = (d, s) => Math.exp(-(d * d) / (2 * s * s));

function shapeSDF(s, x, z) {
  if (s.box) {
    const [x0, z0, x1, z1] = s.box;
    const r = s.round || 0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const hx = (x1 - x0) / 2 - r, hz = (z1 - z0) / 2 - r;
    const qx = Math.abs(x - cx) - hx, qz = Math.abs(z - cz) - hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - r;
  }
  const dx = (x - s.cx) / s.rx, dz = (z - s.cz) / s.rz;
  return (Math.sqrt(dx * dx + dz * dz) - 1) * Math.min(s.rx, s.rz);
}

export function villageMask(x, z) {
  const v = L.VILLAGE_FLAT;
  const sd = shapeSDF({ box: [v.x0, v.z0, v.x1, v.z1], round: 18 }, x, z);
  return 1 - smoothstep(-6, 14, sd);
}

// Beaches: local frame per beach (n = shore normal pointing out to sea, t = along the shore)
const beaches = (L.BEACHES || []).map((b) => ({ ...b, nx: Math.cos(b.angle || 0), nz: Math.sin(b.angle || 0) }));
// 0..1: how much (x,z) belongs to a beach (its smooth shoreline, sand and shallow sea)
export function beachMask(x, z) {
  let m = 0;
  for (const b of beaches) {
    const dx = x - b.x, dz = z - b.z;
    const along = -dx * b.nz + dz * b.nx, across = dx * b.nx + dz * b.nz;
    const ma = 1 - smoothstep(b.len * 0.4, b.len * 0.5 + 16, Math.abs(along));
    const mc = 1 - smoothstep(70, 130, Math.abs(across));
    m = Math.max(m, ma * mc);
  }
  return m;
}
export function beachWidth(x, z) {
  let w = 30, best = -1;
  for (const b of beaches) {
    const d = Math.hypot(x - b.x, z - b.z);
    if (best < 0 || d < best) { best = d; w = b.width ?? 30; }
  }
  return w;
}

export function seaSDF(x, z) {
  let d = 1e9;
  for (const s of L.SEA) d = Math.min(d, shapeSDF(s, x, z));
  const vm = villageMask(x, z);
  const bm = beachMask(x, z);
  d += (sx.noise(x / 40, z / 40) * 5 + sx.noise(x / 13, z / 13) * 1.5) * (1 - vm * 0.85) * (1 - bm * 0.85);
  // headlands that always stay dry (the lighthouse point)
  for (const s of L.LAND || []) d = Math.max(d, -shapeSDF(s, x, z) * 1.5);
  return d; // negative inside the sea
}

// River segments (precomputed)
const riverSegs = [];
for (let i = 0; i < L.RIVER.length - 1; i++) {
  const a = L.RIVER[i], b = L.RIVER[i + 1];
  riverSegs.push({ ax: a.x, az: a.z, bx: b.x, bz: b.z, wa: a.w, wb: b.w });
}

export function riverInfo(x, z) {
  let best = 1e9, bw = 10, bdx = 0, bdz = 1;
  for (const s of riverSegs) {
    const abx = s.bx - s.ax, abz = s.bz - s.az;
    const l2 = abx * abx + abz * abz;
    let t = ((x - s.ax) * abx + (z - s.az) * abz) / l2;
    t = clamp(t, 0, 1);
    const cx = s.ax + abx * t, cz = s.az + abz * t;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) {
      best = d;
      bw = lerp(s.wa, s.wb, t);
      const l = Math.sqrt(l2);
      bdx = abx / l;
      bdz = abz / l;
    }
  }
  // meander wobble
  best += sx2.noise(x / 30, z / 30) * 2.0;
  return { d: Math.max(0, best), w: bw, dirx: bdx, dirz: bdz };
}

// A road's centreline resampled every ~2 m: [{x, z, s (distance along), dx, dz (unit direction)}].
// Roads flagged `smooth` follow a centripetal Catmull-Rom curve through their points.
const _roadCache = new Map();
export function roadSamples(road, step = 2) {
  const key = road.id + ':' + step;
  if (_roadCache.has(key)) return _roadCache.get(key);
  const P = road.pts;
  let dense = [];
  if (road.smooth && P.length > 2) {
    const ext = [[2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]], ...P, [2 * P[P.length - 1][0] - P[P.length - 2][0], 2 * P[P.length - 1][1] - P[P.length - 2][1]]];
    for (let k = 1; k < ext.length - 2; k++) {
      const p0 = ext[k - 1], p1 = ext[k], p2 = ext[k + 1], p3 = ext[k + 2];
      const tj = (a, b) => Math.pow(Math.hypot(b[0] - a[0], b[1] - a[1]), 0.5) || 1e-4;
      const t0 = 0, t1 = t0 + tj(p0, p1), t2 = t1 + tj(p1, p2), t3 = t2 + tj(p2, p3);
      const len = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      const nSub = Math.max(2, Math.ceil(len / 0.5));
      for (let s = 0; s < nSub; s++) {
        const t = t1 + ((t2 - t1) * s) / nSub;
        const L1 = (a, b, ta, tb) => [((tb - t) * a[0] + (t - ta) * b[0]) / (tb - ta), ((tb - t) * a[1] + (t - ta) * b[1]) / (tb - ta)];
        const A1 = L1(p0, p1, t0, t1), A2 = L1(p1, p2, t1, t2), A3 = L1(p2, p3, t2, t3);
        const B1 = L1(A1, A2, t0, t2), B2 = L1(A2, A3, t1, t3);
        dense.push(L1(B1, B2, t1, t2));
      }
    }
    dense.push(P[P.length - 1]);
  } else dense = P;
  // even resampling
  const out = [];
  let acc = 0, next = 0;
  for (let k = 0; k < dense.length - 1; k++) {
    const [ax, az] = dense[k], [bx, bz] = dense[k + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-6) continue;
    while (next <= acc + len) {
      const t = (next - acc) / len;
      out.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s: next, dx: (bx - ax) / len, dz: (bz - az) / len });
      next += step;
    }
    acc += len;
  }
  const last = dense[dense.length - 1], pl = out[out.length - 1];
  if (!pl || Math.hypot(pl.x - last[0], pl.z - last[1]) > 0.3) out.push({ x: last[0], z: last[1], s: acc, dx: pl?.dx ?? 1, dz: pl?.dz ?? 0 });
  _roadCache.set(key, out);
  return out;
}

// Nearest point on any road (optionally only ids in `only`): { d, x, z, dx, dz, road, s }
export function nearestRoad(x, z, only = null) {
  let best = { d: 1e9 };
  for (const road of L.ROADS) {
    if (only && !only.includes(road.id)) continue;
    const S = roadSamples(road);
    for (let k = 0; k < S.length; k++) {
      const p = S[k];
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < best.d) best = { d, x: p.x, z: p.z, dx: p.dx, dz: p.dz, road, s: p.s };
    }
  }
  return best;
}

function rimHeight(x, z) {
  // mountains around the north, west and south edges keep the rider in
  const dn = z + HALF; // distance from north edge
  const dw = x + HALF;
  const ds = HALF - z;
  const de = HALF - x;
  let m = 0;
  m += 46 * Math.pow(1 - smoothstep(0, 95, dn), 1.6);
  m += 40 * Math.pow(1 - smoothstep(0, 85, dw), 1.6);
  m += 30 * Math.pow(1 - smoothstep(0, 70, ds), 1.6) * (1 - smoothstep(120, 220, x));
  m += 20 * Math.pow(1 - smoothstep(0, 40, de), 1.6);
  return m * (0.75 + 0.25 * sx.noise(x / 45, z / 45));
}

export function baseHeight(x, z) {
  let h = 9;
  h += 8 * sx.fbm(x / 170, z / 170, 4);
  h += 3.2 * sx.fbm(x / 55 + 10, z / 55 - 4, 3);
  h += 17 * gauss(Math.hypot(x - L.POI.lookout.x, z - L.POI.lookout.z), 36);
  h += 7 * gauss(Math.hypot(x - L.POI.graveyard.x, z - L.POI.graveyard.z), 34);
  // a rolling ridge behind the village (a backdrop for Main Street, views from the loop road)
  h += 6 * gauss(Math.hypot(x - 150, z + 44), 46);
  // the loop road rides along a gentle valley between the lookout and the ridge
  h -= 6 * gauss(Math.hypot(x - 100, z + 84), 40);
  h += 6 * gauss(Math.hypot(x + 120, z + 150), 60);
  h += rimHeight(x, z);
  return h;
}

// Forest density for trees & leaf litter (0..1), without clearings
export function forestNoise(x, z) {
  return clamp(0.58 + 0.55 * sx2.fbm(x / 85, z / 85, 3), 0, 1);
}

export class Terrain {
  constructor() {
    this.n = Math.round((HALF * 2) / H_RES) + 1; // vertices per side
    this.h = new Float32Array(this.n * this.n);
    this.roadW = new Float32Array(this.n * this.n); // road blend weight at height res
    this.sn = Math.round((HALF * 2) / S_RES); // splat texels per side
    this.splat = new Uint8Array(this.sn * this.sn * 4);
    this.roadMask = new Uint8Array(this.sn * this.sn); // crisp road (for physics surface)
    this.build();
  }

  idx(i, j) {
    return j * this.n + i;
  }

  build() {
    const n = this.n;
    const H = this.h;
    // 1-5: natural terrain
    for (let j = 0; j < n; j++) {
      const z = -HALF + j * H_RES;
      for (let i = 0; i < n; i++) {
        const x = -HALF + i * H_RES;
        H[j * n + i] = this.naturalHeight(x, z);
      }
    }
    // 6: roads (stamped)
    this.stampRoads();
    // 7: building pads (sloped lots get levelled under and around the house)
    this.stampBuildingPads();
    this.buildSplat();
  }

  naturalHeight(x, z) {
    let h = baseHeight(x, z);
    // river valley + channel
    const r = riverInfo(x, z);
    const hw = r.w * 0.5;
    const valley = 1 - smoothstep(hw, hw + 60, r.d);
    h = lerp(h, 2.3 + 0.7 * sx.noise(x / 20, z / 20), Math.pow(valley, 1.25));
    const chan = 1 - smoothstep(hw - 2.0, hw + 2.5, r.d);
    h = lerp(h, -1.25, chan);
    // coast
    const sd = seaSDF(x, z);
    const coast = smoothstep(0, 42, sd);
    if (sd >= 0) h = lerp(1.2, h, coast);
    else h = lerp(1.2, -7, smoothstep(0, 18, -sd));
    // sandy beaches: a long gentle slope into the sea, dry sand, then low dunes
    const bm = beachMask(x, z);
    if (bm > 0) {
      const W = beachWidth(x, z);
      let hb;
      if (sd < 0) hb = Math.max(-7, sd * 0.06 - 0.04 * sd * sd / 100);
      else if (sd < W) hb = 0.08 + 1.87 * Math.pow(sd / W, 0.95);
      else hb = 1.95 + (sd - W) * 0.1;
      // dune hummocks along the back of the beach
      const dune = smoothstep(W - 6, W + 2, sd) * (1 - smoothstep(W + 6, W + 20, sd));
      hb += dune * (0.5 + 0.7 * (0.5 + 0.5 * sx2.noise(x / 9, z / 9)));
      // gentle sand ripples
      if (sd > -6 && sd < W) hb += 0.04 * sx.noise(x / 3.5, z / 3.5);
      const back = 1 - smoothstep(W + 12, W + 54, sd);
      h = lerp(h, hb, bm * back);
    }
    // village shelf
    const vm = villageMask(x, z) * smoothstep(-1, 4, sd) * (1 - chan);
    if (vm > 0) {
      const vh = L.VILLAGE_FLAT.h + (60 - z) * 0.018 + 0.1 * sx.noise(x / 18, z / 18);
      h = lerp(h, vh, vm);
    }
    // the bike park bowl & pump-track rollers
    for (const bw of L.BOWLS || []) {
      const d = Math.hypot(x - bw.x, z - bw.z);
      if (d < bw.r * 1.35) {
        const t = Math.min(1, d / bw.r);
        h -= bw.depth * (0.5 + 0.5 * Math.cos(Math.PI * t));
        h += 0.35 * Math.max(0, 1 - Math.abs(d - bw.r * 1.08) / (bw.r * 0.2)); // a little lip
      }
    }
    for (const ro of L.ROLLERS || []) {
      const [ax, az] = ro.a, [bx, bz] = ro.b;
      const abx = bx - ax, abz = bz - az, len = Math.hypot(abx, abz);
      const t = ((x - ax) * abx + (z - az) * abz) / (len * len);
      if (t < 0 || t > 1) continue;
      const off = Math.abs((x - ax) * abz - (z - az) * abx) / len;
      if (off > 4) continue;
      const s = t * len;
      h += ro.h * 0.5 * (1 - Math.cos((2 * Math.PI * s) / ro.wave)) * (1 - smoothstep(2, 4, off)) * smoothstep(0, ro.wave * 0.5, Math.min(s, len - s));
    }
    // flats
    for (const f of L.FLATS) {
      const d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r) {
        const target = f.h ?? (f._h ??= baseHeight(f.x, f.z));
        const m = 1 - smoothstep(f.r * 0.55, f.r, d);
        h = lerp(h, target + 0.15 * sx.noise(x / 9, z / 9), m);
      }
    }
    return h;
  }

  stampRoads() {
    const n = this.n;
    const H = this.h;
    const best = new Float32Array(n * n); // weight
    const bestH = new Float32Array(n * n);
    this.roadProfiles = [];
    for (const road of L.ROADS) {
      const samples = roadSamples(road);
      // height profile from the natural terrain
      let prof = samples.map((p) => this.sampleGrid(H, p.x, p.z));
      const smooth = (arr, rad) => {
        const out = new Float32Array(arr.length);
        for (let i = 0; i < arr.length; i++) {
          let s = 0, c = 0;
          for (let k = -rad; k <= rad; k++) {
            const q = clamp(i + k, 0, arr.length - 1);
            s += arr[q];
            c++;
          }
          out[i] = s / c;
        }
        return out;
      };
      prof = smooth(prof, road.type === 'trail' ? 4 : 7);
      prof = smooth(prof, road.type === 'trail' ? 3 : 5);
      // keep above water, raise near the bridge
      for (let i = 0; i < prof.length; i++) {
        const p = samples[i];
        const db = Math.hypot(p.x - L.POI.bridge.x, p.z - L.POI.bridge.z);
        if (db < 30) prof[i] = Math.max(prof[i], lerp(2.7, prof[i], smoothstep(10, 30, db)));
        prof[i] = Math.max(prof[i], 1.6);
      }
      // ends that join an earlier road take that road's height (no steps at junctions)
      const pin = (idx, dir) => {
        const p = samples[idx];
        let target = null, bestD = 1e9;
        for (const o of this.roadProfiles) {
          const lim = (o.road.flat ?? o.road.w) * 0.5 + 1.5;
          for (let k = 0; k < o.samples.length; k++) {
            const d = Math.hypot(o.samples[k].x - p.x, o.samples[k].z - p.z);
            if (d < lim && d < bestD) { bestD = d; target = o.prof[k]; }
          }
        }
        if (target === null) return false;
        const delta = target - prof[idx];
        for (let k = 0; k < 12 && idx + dir * k >= 0 && idx + dir * k < prof.length; k++) prof[idx + dir * k] += delta * (1 - smoothstep(0, 12, k));
        return true;
      };
      const pinA = pin(0, 1), pinB = pin(prof.length - 1, -1);
      // limit the gradient so roads stay rideable (pinned junction ends stay put)
      if (road.grade) {
        const g = road.grade * 2.0;
        const last = prof.length - 1;
        for (let it = 0; it < 10; it++) {
          for (let i = 1; i <= last; i++) if (!(pinB && i === last)) prof[i] = clamp(prof[i], prof[i - 1] - g, prof[i - 1] + g);
          for (let i = last - 1; i >= 0; i--) if (!(pinA && i === 0)) prof[i] = clamp(prof[i], prof[i + 1] - g, prof[i + 1] + g);
        }
      }
      this.roadProfiles.push({ road, samples, prof });
      // stamp
      const blend = road.type === 'trail' ? 4 : 6;
      const hw = (road.flat ?? road.w) * 0.5;
      const s0 = samples[0], sN = samples[samples.length - 1];
      for (let k = 0; k < samples.length - 1; k++) {
        const a = samples[k], b = samples[k + 1];
        const minx = Math.min(a.x, b.x) - hw - blend, maxx = Math.max(a.x, b.x) + hw + blend;
        const minz = Math.min(a.z, b.z) - hw - blend, maxz = Math.max(a.z, b.z) + hw + blend;
        const i0 = Math.max(0, Math.floor((minx + HALF) / H_RES)), i1 = Math.min(n - 1, Math.ceil((maxx + HALF) / H_RES));
        const j0 = Math.max(0, Math.floor((minz + HALF) / H_RES)), j1 = Math.min(n - 1, Math.ceil((maxz + HALF) / H_RES));
        const abx = b.x - a.x, abz = b.z - a.z;
        const l2 = abx * abx + abz * abz || 1e-6;
        for (let j = j0; j <= j1; j++) {
          const z = -HALF + j * H_RES;
          for (let i = i0; i <= i1; i++) {
            const x = -HALF + i * H_RES;
            const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / l2, 0, 1);
            const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
            let w = 1 - smoothstep(hw, hw + blend, d);
            // square-ish road ends: a wide street doesn't spill a round flat past its ends
            const over = Math.max(-((x - s0.x) * s0.dx + (z - s0.z) * s0.dz), (x - sN.x) * sN.dx + (z - sN.z) * sN.dz);
            if (over > 0) w *= 1 - smoothstep(0, Math.min(blend, 3 + road.w * 0.3), over);
            const id = j * n + i;
            if (w > best[id] + 1e-4) {
              best[id] = w;
              bestH[id] = lerp(prof[k], prof[k + 1], t);
            }
          }
        }
      }
    }
    for (let id = 0; id < n * n; id++) {
      const w = best[id];
      if (w <= 0) continue;
      const i = id % n, j = (id / n) | 0;
      const x = -HALF + i * H_RES, z = -HALF + j * H_RES;
      // don't fill in the river under the bridge
      const r = riverInfo(x, z);
      const keep = smoothstep(r.w * 0.5 + 1, r.w * 0.5 + 6, r.d);
      const ww = w * keep;
      H[id] = lerp(H[id], bestH[id], ww);
      this.roadW[id] = ww;
    }
    // soften junctions & seams: a few blur passes over the road surface only
    const tmp = new Float32Array(n * n);
    for (let it = 0; it < 3; it++) {
      tmp.set(H);
      for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
        const id = j * n + i;
        const rw = this.roadW[id];
        if (rw < 0.3) continue;
        let s = 0, c = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const q = id + dj * n + di;
          if (this.roadW[q] < 0.3) continue;
          s += tmp[q];
          c++;
        }
        H[id] = lerp(tmp[id], s / c, 0.6 * rw);
      }
    }
  }

  // Level the ground under buildings that stand on a slope: the terrain inside the footprint
  // (plus a yard strip, wider at the front for porches and steps) is pulled to the footprint's
  // average height, fading out over a few metres. Road surfaces are left alone, gentle lots
  // (under ~0.4 m of fall) too; the voxel foundations take care of what is left.
  stampBuildingPads() {
    const n = this.n, H = this.h;
    for (const b of L.BUILDINGS) {
      if (b.stilts || b.kind === 'lighthouse') continue;
      const c = Math.cos(b.facing || 0), s = Math.sin(b.facing || 0);
      const toW = (lx, lz) => [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
      let mn = Infinity, mx = -Infinity, sum = 0, cnt = 0;
      for (let j = 0; j <= 8; j++) for (let i = 0; i <= 8; i++) {
        const [x, z] = toW(-b.w / 2 + (b.w * i) / 8, -b.d / 2 + (b.d * j) / 8);
        const h = this.sampleGrid(H, x, z);
        mn = Math.min(mn, h); mx = Math.max(mx, h); sum += h; cnt++;
      }
      if (mx - mn < 0.4) continue;
      const target = sum / cnt;
      const side = 1.2, back = 1.2, front = b.porch ? 4.5 : 3, blend = 6;
      const ax = b.w / 2 + side, z0 = -b.d / 2 - back, z1 = b.d / 2 + front;
      const R = Math.hypot(b.w / 2 + side + blend, Math.max(b.d / 2 + front, b.d / 2 + back) + blend);
      const i0 = Math.max(0, Math.floor((b.x - R + HALF) / H_RES)), i1 = Math.min(n - 1, Math.ceil((b.x + R + HALF) / H_RES));
      const j0 = Math.max(0, Math.floor((b.z - R + HALF) / H_RES)), j1 = Math.min(n - 1, Math.ceil((b.z + R + HALF) / H_RES));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -HALF + i * H_RES, z = -HALF + j * H_RES;
        const dx = x - b.x, dz = z - b.z;
        const lx = c * dx - s * dz, lz = s * dx + c * dz;
        const ox = Math.max(0, Math.abs(lx) - ax), oz = Math.max(0, z0 - lz, lz - z1);
        const w = (1 - smoothstep(0, blend, Math.hypot(ox, oz))) * (1 - Math.min(1, this.roadW[j * n + i] * 1.5));
        if (w <= 0) continue;
        H[j * n + i] = lerp(H[j * n + i], target, w);
      }
    }
  }

  sampleGrid(arr, x, z) {
    const n = this.n;
    const fx = clamp((x + HALF) / H_RES, 0, n - 1.001);
    const fz = clamp((z + HALF) / H_RES, 0, n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const a = arr[j * n + i], b = arr[j * n + i + 1];
    const c = arr[(j + 1) * n + i], d = arr[(j + 1) * n + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  heightAt(x, z) {
    return this.sampleGrid(this.h, x, z);
  }

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = 1.0;
    const hx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const hz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    const l = Math.hypot(hx, 2 * e, hz);
    out.x = -hx / l;
    out.y = (2 * e) / l;
    out.z = -hz / l;
    return out;
  }

  buildSplat() {
    const sn = this.sn;
    const S = this.splat;
    const R = this.roadMask;
    // crisp road mask at splat res
    for (const { road, samples } of this.roadProfiles) {
      const hw = road.w * 0.5;
      const edge = 1.2;
      for (let k = 0; k < samples.length - 1; k++) {
        const a = samples[k], b = samples[k + 1];
        const minx = Math.min(a.x, b.x) - hw - edge, maxx = Math.max(a.x, b.x) + hw + edge;
        const minz = Math.min(a.z, b.z) - hw - edge, maxz = Math.max(a.z, b.z) + hw + edge;
        const i0 = Math.max(0, Math.floor((minx + HALF) / S_RES)), i1 = Math.min(sn - 1, Math.ceil((maxx + HALF) / S_RES));
        const j0 = Math.max(0, Math.floor((minz + HALF) / S_RES)), j1 = Math.min(sn - 1, Math.ceil((maxz + HALF) / S_RES));
        const abx = b.x - a.x, abz = b.z - a.z;
        const l2 = abx * abx + abz * abz || 1e-6;
        for (let j = j0; j <= j1; j++) {
          const z = -HALF + (j + 0.5) * S_RES;
          for (let i = i0; i <= i1; i++) {
            const x = -HALF + (i + 0.5) * S_RES;
            let t = ((x - a.x) * abx + (z - a.z) * abz) / l2;
            t = clamp(t, 0, 1);
            const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
            const w = 1 - smoothstep(hw - edge, hw + edge * 0.5, d);
            const v = Math.round(w * 255);
            const id = j * sn + i;
            if (v > R[id]) R[id] = v;
          }
        }
      }
    }
    // dirt yards
    const yards = [
      { x: -162, z: 76, r: 10 }, { x: -214, z: -40, r: 9 }, { x: -250, z: 150, r: 6 },
      { x: 62, z: -118, r: 6 }, { x: 98, z: 128, r: 12 },
      { x: 60, z: 76, r: 13 }, // farmyard
      { x: 48, z: -38, r: 8 }, // sugar shack
      { x: -62, z: -128, r: 7 }, // campground
      { x: -8, z: 58, r: 5 }, // picnic area
      { x: 133, z: 12, r: 16 }, // bike park
      { x: 104, z: 37, r: 5 }, // Gus's yard
      { x: 179, z: -109, r: 6 }, // rest area pull-off
    ];
    for (const y of yards) {
      const i0 = Math.max(0, Math.floor((y.x - y.r + HALF) / S_RES)), i1 = Math.min(sn - 1, Math.ceil((y.x + y.r + HALF) / S_RES));
      const j0 = Math.max(0, Math.floor((y.z - y.r + HALF) / S_RES)), j1 = Math.min(sn - 1, Math.ceil((y.z + y.r + HALF) / S_RES));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = -HALF + (i + 0.5) * S_RES, z = -HALF + (j + 0.5) * S_RES;
          const d = Math.hypot(x - y.x, z - y.z) + sx.noise(x / 4, z / 4) * 2.5;
          const w = 1 - smoothstep(y.r * 0.6, y.r, d);
          const v = Math.round(w * 220);
          const id = j * sn + i;
          if (v > R[id]) R[id] = v;
        }
      }
    }
    for (let j = 0; j < sn; j++) {
      const z = -HALF + (j + 0.5) * S_RES;
      for (let i = 0; i < sn; i++) {
        const x = -HALF + (i + 0.5) * S_RES;
        const id = j * sn + i;
        const h = this.heightAt(x, z);
        // slope from grid
        const e = 1.0;
        const gx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
        const gz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
        const slope = Math.hypot(gx, gz);
        const road = R[id] / 255;
        const rock = smoothstep(0.62, 1.05, slope + sx.noise(x / 7, z / 7) * 0.15) * (1 - road);
        let sand = 1 - smoothstep(0.9, 1.7, h + sx.noise(x / 5, z / 5) * 0.4);
        const bm = beachMask(x, z);
        if (bm > 0.02) {
          const sd = seaSDF(x, z), bw = beachWidth(x, z);
          sand = Math.max(sand, bm * (1 - smoothstep(bw + 6, bw + 16, sd + sx.noise(x / 6, z / 6) * 3)));
        }
        sand *= 1 - road;
        const fd = forestNoise(x, z);
        const litter = smoothstep(0.42, 0.75, fd + sx.noise(x / 6, z / 6) * 0.18) * (1 - road) * (1 - sand);
        S[id * 4] = R[id];
        S[id * 4 + 1] = Math.round(rock * 255);
        S[id * 4 + 2] = Math.round(sand * 255);
        S[id * 4 + 3] = Math.round(litter * 255);
      }
    }
    this.buildRoadInfo();
  }

  // Road frame for the terrain shader, at R_RES metres a texel (two bytes each):
  // r = signed distance across the nearest road (centre 128, +-ROAD_SPAN m), g = its style
  // (0 footpath, 85 trail, 170 village lane, 255 country road; the shader draws worn centres,
  // wheel ruts and tyre grooves from these). Far from any road r saturates.
  buildRoadInfo() {
    const rn = (this.rn = Math.round((HALF * 2) / R_RES));
    const info = (this.roadInfo = new Uint8Array(rn * rn * 2));
    const best = new Float32Array(rn * rn).fill(1e9);
    for (let i = 0; i < rn * rn; i++) info[i * 2] = 255;
    const STYLE = { trail: 85, street: 170, road: 255 };
    for (const { road, samples } of this.roadProfiles) {
      const style = road.path ? 0 : STYLE[road.type] ?? 85;
      const reach = road.w * 0.5 + 2.5;
      for (let k = 0; k < samples.length - 1; k++) {
        const a = samples[k], b = samples[k + 1];
        const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach + HALF) / R_RES)), i1 = Math.min(rn - 1, Math.ceil((Math.max(a.x, b.x) + reach + HALF) / R_RES));
        const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - reach + HALF) / R_RES)), j1 = Math.min(rn - 1, Math.ceil((Math.max(a.z, b.z) + reach + HALF) / R_RES));
        const abx = b.x - a.x, abz = b.z - a.z;
        const l2 = abx * abx + abz * abz || 1e-6, l = Math.sqrt(l2);
        for (let j = j0; j <= j1; j++) {
          const z = -HALF + (j + 0.5) * R_RES;
          for (let i = i0; i <= i1; i++) {
            const x = -HALF + (i + 0.5) * R_RES;
            const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / l2, 0, 1);
            const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
            const id = j * rn + i;
            if (d >= best[id] || d > reach) continue;
            best[id] = d;
            // signed: + on the left of the road's direction (so it runs on smoothly through bends)
            const side = (abx * (z - a.z) - abz * (x - a.x)) / l;
            info[id * 2] = Math.round(clamp(128 + (side / ROAD_SPAN) * 127, 0, 255));
            info[id * 2 + 1] = style;
          }
        }
      }
    }
  }

  splatAt(x, z) {
    const sn = this.sn;
    const i = clamp(Math.floor((x + HALF) / S_RES), 0, sn - 1);
    const j = clamp(Math.floor((z + HALF) / S_RES), 0, sn - 1);
    const id = (j * sn + i) * 4;
    const S = this.splat;
    return { road: S[id] / 255, rock: S[id + 1] / 255, sand: S[id + 2] / 255, litter: S[id + 3] / 255 };
  }

  // Ground surface type for physics & audio
  surfaceAt(x, z) {
    const h = this.heightAt(x, z);
    if (h < -0.15) return 'water';
    const s = this.splatAt(x, z);
    if (s.road > 0.5) return 'road';
    if (s.sand > 0.5) return 'dirt';
    if (s.rock > 0.5) return 'dirt';
    return 'grass';
  }
}
