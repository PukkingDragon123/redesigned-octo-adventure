// Terrain generation: heightmap + splat map, built from the handcrafted layout.
// Pure JS (no three.js) so it can also run in node for debug map rendering.
import { Simplex } from '../core/noise.js';
import { clamp, lerp, smoothstep } from '../core/math.js';
import * as L from './layout.js';

const sx = new Simplex(1337);
const sx2 = new Simplex(4242);

export const H_RES = 2; // metres per height cell
export const S_RES = 0.5; // metres per splat texel
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

export function seaSDF(x, z) {
  let d = 1e9;
  for (const s of L.SEA) d = Math.min(d, shapeSDF(s, x, z));
  const vm = villageMask(x, z);
  d += (sx.noise(x / 40, z / 40) * 5 + sx.noise(x / 13, z / 13) * 1.5) * (1 - vm * 0.85);
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
  h += 24 * gauss(Math.hypot(x - L.POI.lookout.x, z - L.POI.lookout.z), 40);
  h += 7 * gauss(Math.hypot(x - L.POI.graveyard.x, z - L.POI.graveyard.z), 34);
  // a big rolling ridge north of the main road for jumps & views
  h += 9 * gauss(Math.hypot(x - 120, z + 60), 55);
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
    // village shelf
    const vm = villageMask(x, z) * smoothstep(-1, 4, sd) * (1 - chan);
    if (vm > 0) {
      const vh = L.VILLAGE_FLAT.h + (60 - z) * 0.018 + 0.25 * sx.noise(x / 18, z / 18);
      h = lerp(h, vh, vm);
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
      // resample polyline every 2m
      const pts = road.pts;
      const samples = [];
      let acc = 0;
      for (let k = 0; k < pts.length - 1; k++) {
        const [ax, az] = pts[k], [bx, bz] = pts[k + 1];
        const len = Math.hypot(bx - ax, bz - az);
        const steps = Math.max(1, Math.ceil(len / 2));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          samples.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, s: acc + len * t });
        }
        acc += len;
      }
      const last = pts[pts.length - 1];
      samples.push({ x: last[0], z: last[1], s: acc });
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
      this.roadProfiles.push({ road, samples, prof });
      // stamp
      const blend = road.type === 'trail' ? 4 : 6;
      const hw = road.w * 0.5;
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
            let t = ((x - a.x) * abx + (z - a.z) * abz) / l2;
            t = clamp(t, 0, 1);
            const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
            const w = 1 - smoothstep(hw, hw + blend, d);
            const id = j * n + i;
            if (w > best[id]) {
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
      { x: -162, z: 78, r: 16 }, { x: -214, z: -40, r: 9 }, { x: -250, z: 150, r: 6 },
      { x: 62, z: -118, r: 6 }, { x: 176, z: 52, r: 11 }, { x: 98, z: 128, r: 12 },
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
        const sand = (1 - smoothstep(0.9, 1.7, h + sx.noise(x / 5, z / 5) * 0.4)) * (1 - road);
        const fd = forestNoise(x, z);
        const litter = smoothstep(0.42, 0.75, fd + sx.noise(x / 6, z / 6) * 0.18) * (1 - road) * (1 - sand);
        S[id * 4] = R[id];
        S[id * 4 + 1] = Math.round(rock * 255);
        S[id * 4 + 2] = Math.round(sand * 255);
        S[id * 4 + 3] = Math.round(litter * 255);
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
