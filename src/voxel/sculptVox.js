// Sculpts (art/sculpt2d.js: posed boxes, ellipsoids and round cones with materials and painted
// details) turned into real voxel models, so the street clutter and furniture that were drawn
// as 2D sprites stand in the world as voxels, true to their design:
//  - a voxel is solid when its centre lies inside a primitive whose material there is not
//    empty (open ends of `cyl` tubes, cut-outs); parts thinner than a voxel are thickened to
//    one voxel so strings, rods and rims survive;
//  - every voxel that shows takes its colour the way the sprite painter does it: a ray from
//    outside along each of its open faces, and the first primitive surface it meets (so thin
//    painted discs, bands and lids layered over a body win, as they did in the sprites);
//  - the painted details (eyes, lettering, emblems) are stamped onto the surface from the view
//    that faces them best, one sprite pixel to one voxel (so lettering stays crisp);
//  - colours are the mid tone of each material's ramp, glowing materials glow.
//
// Axes: the sculpt's +x is its front, y up; the voxel model's front is +z (the convention of
// every voxel model), so sculpt (x, y, z) -> model (-z, y, x). The pivot is the sculpt origin.
//
//   sculptToVox(S, { size, views, pitch, ppm }) -> { vox, size, origin }
import { Vox, EMIT } from './vox.js';
import { rotX, rotY } from '../art/sculpt2d.js';

const mul3 = (A, B) => {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
};
// local = B^T v (B row-major, columns are the primitive's axes)
const tmul = (B, v, o) => {
  o[0] = B[0] * v[0] + B[3] * v[1] + B[6] * v[2];
  o[1] = B[1] * v[0] + B[4] * v[1] + B[7] * v[2];
  o[2] = B[2] * v[0] + B[5] * v[1] + B[8] * v[2];
  return o;
};
const VIEW_YAW = { side: 0, front3: -Math.PI / 4, front: -Math.PI / 2, back3: Math.PI / 4, back: Math.PI / 2 };

// ---------------------------------------------------------------- primitive tests
const L = [0, 0, 0], E = [0, 0, 0], H3 = [0, 0, 0], D3 = [0, 0, 0];

// inside test at sculpt point P (thick: minimum half-thickness); returns the material name or null
function insideMat(p, P, thick) {
  if (p.cone) {
    const ax = p.b[0] - p.a[0], ay = p.b[1] - p.a[1], az = p.b[2] - p.a[2];
    const m0 = ax * ax + ay * ay + az * az || 1e-9;
    const u = ((P[0] - p.a[0]) * ax + (P[1] - p.a[1]) * ay + (P[2] - p.a[2]) * az) / m0;
    const uc = u < 0 ? 0 : u > 1 ? 1 : u;
    const cx = p.a[0] + ax * uc, cy = p.a[1] + ay * uc, cz = p.a[2] + az * uc;
    const dx = P[0] - cx, dy = P[1] - cy, dz = P[2] - cz;
    const d = Math.hypot(dx, dy, dz);
    const r = Math.max(p.ra + (p.rb - p.ra) * uc, thick);
    if (d > r) return null;
    if (typeof p.mat !== 'function') return p.mat;
    // the surface point it would show: radial out from the axis, or the end cap
    const nl = d || 1;
    H3[0] = d ? dx / nl : 0; H3[1] = d ? dy / nl : 1; H3[2] = d ? dz / nl : 0;
    const ue = u <= 0 ? 0 : u >= 1 ? 1 : uc;
    return p.mat(H3, p, p.t0 + (p.t1 - p.t0) * ue) || null;
  }
  E[0] = P[0] - p.c[0]; E[1] = P[1] - p.c[1]; E[2] = P[2] - p.c[2];
  tmul(p.B, E, L);
  if (p.box) {
    const r0 = Math.max(p.r[0], thick), r1 = Math.max(p.r[1], thick), r2 = Math.max(p.r[2], thick);
    if (Math.abs(L[0]) > r0 || Math.abs(L[1]) > r1 || Math.abs(L[2]) > r2) return null;
    if (typeof p.mat !== 'function') return p.mat;
    H3[0] = L[0] / r0; H3[1] = L[1] / r1; H3[2] = L[2] / r2;
    // the face it is nearest to
    let ax = 0, best = -1;
    for (let k = 0; k < 3; k++) { const a = Math.abs(H3[k]); if (a > best) { best = a; ax = k; } }
    const sg = H3[ax] >= 0 ? 1 : -1;
    H3[ax] = sg;
    return p.mat(H3, p, ax * 2 + (sg > 0 ? 1 : 0)) || null;
  }
  const r0 = Math.max(p.r[0], thick), r1 = Math.max(p.r[1], thick), r2 = Math.max(p.r[2], thick);
  const qx = L[0] / r0, qy = L[1] / r1, qz = L[2] / r2;
  const q = qx * qx + qy * qy + qz * qz;
  if (q > 1) return null;
  if (typeof p.mat !== 'function') return p.mat;
  const ql = Math.sqrt(q) || 1;
  H3[0] = q ? qx / ql : 0; H3[1] = q ? qy / ql : 1; H3[2] = q ? qz / ql : 0;
  return p.mat(H3, p, p.t) || null;
}

// first hit of a ray (origin o, unit direction d) with a primitive: { t, mat } or null
function rayHit(p, o, d) {
  if (p.cone) {
    const pa = p.a, pb = p.b, ra = p.ra, rb = p.rb;
    const bax = pb[0] - pa[0], bay = pb[1] - pa[1], baz = pb[2] - pa[2];
    const oax = o[0] - pa[0], oay = o[1] - pa[1], oaz = o[2] - pa[2];
    const obx = o[0] - pb[0], oby = o[1] - pb[1], obz = o[2] - pb[2];
    const rr = ra - rb;
    const m0 = bax * bax + bay * bay + baz * baz;
    const m1 = bax * oax + bay * oay + baz * oaz;
    const m2 = bax * d[0] + bay * d[1] + baz * d[2];
    const m3 = d[0] * oax + d[1] * oay + d[2] * oaz;
    const m5 = oax * oax + oay * oay + oaz * oaz;
    const m6 = obx * d[0] + oby * d[1] + obz * d[2];
    const m7 = obx * obx + oby * oby + obz * obz;
    const d2 = m0 - rr * rr;
    const k2 = d2 - m2 * m2;
    const k1 = d2 * m3 - m1 * m2 + m2 * rr * ra;
    const k0 = d2 * m5 - m1 * m1 + m1 * rr * ra * 2 - m0 * ra * ra;
    let t = -1, nx = 0, ny = 0, nz = 0, u = 0;
    const h = k1 * k1 - k0 * k2;
    if (h >= 0 && Math.abs(k2) > 1e-12) {
      const tb = (-Math.sqrt(h) - k1) / k2;
      const y = m1 - ra * rr + tb * m2;
      if (y > 0 && y < d2) {
        t = tb;
        nx = d2 * (oax + tb * d[0]) - bax * y; ny = d2 * (oay + tb * d[1]) - bay * y; nz = d2 * (oaz + tb * d[2]) - baz * y;
        u = y / d2;
      }
    }
    if (t < 0) {
      const h1 = m3 * m3 - m5 + ra * ra, h2 = m6 * m6 - m7 + rb * rb;
      if (h1 > 0) { const t1 = -m3 - Math.sqrt(h1); if (t1 > 0) { t = t1; nx = oax + t1 * d[0]; ny = oay + t1 * d[1]; nz = oaz + t1 * d[2]; u = 0; } }
      if (h2 > 0) {
        const t2 = -m6 - Math.sqrt(h2);
        if (t2 > 0 && (t < 0 || t2 < t)) { t = t2; nx = obx + t2 * d[0]; ny = oby + t2 * d[1]; nz = obz + t2 * d[2]; u = 1; }
      }
    }
    if (t < 0) return null;
    if (typeof p.mat !== 'function') return { t, mat: p.mat };
    const nl = Math.hypot(nx, ny, nz) || 1;
    H3[0] = nx / nl; H3[1] = ny / nl; H3[2] = nz / nl;
    const m = p.mat(H3, p, p.t0 + (p.t1 - p.t0) * u);
    return m ? { t, mat: m } : null;
  }
  E[0] = o[0] - p.c[0]; E[1] = o[1] - p.c[1]; E[2] = o[2] - p.c[2];
  tmul(p.B, E, L);
  tmul(p.B, d, D3);
  if (p.box) {
    let t0 = -1e9, t1 = 1e9, ax = -1, sg = 0;
    for (let k = 0; k < 3; k++) {
      const ok = L[k], dk = D3[k], h = p.r[k];
      if (Math.abs(dk) < 1e-9) { if (Math.abs(ok) > h) return null; continue; }
      let a = (-h - ok) / dk, b = (h - ok) / dk, s = -1;
      if (a > b) { const tmp = a; a = b; b = tmp; s = 1; }
      if (a > t0) { t0 = a; ax = k; sg = s; }
      if (b < t1) t1 = b;
      if (t1 < t0) return null;
    }
    if (ax < 0 || t0 < 0) return null;
    if (typeof p.mat !== 'function') return { t: t0, mat: p.mat };
    for (let k = 0; k < 3; k++) H3[k] = (L[k] + D3[k] * t0) / p.r[k];
    H3[ax] = sg;
    const m = p.mat(H3, p, ax * 2 + (sg > 0 ? 1 : 0));
    return m ? { t: t0, mat: m } : null;
  }
  const qx = L[0] / p.r[0], qy = L[1] / p.r[1], qz = L[2] / p.r[2];
  const dx = D3[0] / p.r[0], dy = D3[1] / p.r[1], dz = D3[2] / p.r[2];
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (qx * dx + qy * dy + qz * dz);
  const c = qx * qx + qy * qy + qz * qz - 1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  if (typeof p.mat !== 'function') return { t, mat: p.mat };
  H3[0] = qx + t * dx; H3[1] = qy + t * dy; H3[2] = qz + t * dz;
  const m = p.mat(H3, p, p.t);
  return m ? { t, mat: m } : null;
}

// a primitive's bounding box in sculpt space
function bounds(p) {
  if (p.cone) {
    return [Math.min(p.a[0] - p.ra, p.b[0] - p.rb), Math.min(p.a[1] - p.ra, p.b[1] - p.rb), Math.min(p.a[2] - p.ra, p.b[2] - p.rb),
      Math.max(p.a[0] + p.ra, p.b[0] + p.rb), Math.max(p.a[1] + p.ra, p.b[1] + p.rb), Math.max(p.a[2] + p.ra, p.b[2] + p.rb)];
  }
  const B = p.B, r = p.r;
  const out = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 3; k++) {
    // extent along world axis k of the oriented box / ellipsoid (|B row| . r)
    const e = Math.abs(B[k * 3]) * r[0] + Math.abs(B[k * 3 + 1]) * r[1] + Math.abs(B[k * 3 + 2]) * r[2];
    out[k] = p.c[k] - e; out[k + 3] = p.c[k] + e;
  }
  return out;
}

// ---------------------------------------------------------------- the voxeliser
export function sculptToVox(S, { size = 0.025, views = ['front'], pitch = 0.32, ppm = 1 / size } = {}) {
  const s = size;
  const prims = S.prims;
  const pb = prims.map(bounds);
  const half = s * 0.5;
  // the model grid: sculpt x -> model z, sculpt z -> model -x
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
  for (const b of pb) {
    mnx = Math.min(mnx, -b[5]); mxx = Math.max(mxx, -b[2]);
    mny = Math.min(mny, b[1]); mxy = Math.max(mxy, b[4]);
    mnz = Math.min(mnz, b[0]); mxz = Math.max(mxz, b[3]);
  }
  const i0 = Math.floor(mnx / s) - 1, j0 = Math.floor(mny / s) - 1, k0 = Math.floor(mnz / s) - 1;
  const W = Math.ceil(mxx / s) - i0 + 2, Hh = Math.ceil(mxy / s) - j0 + 2, D = Math.ceil(mxz / s) - k0 + 2;
  const vox = new Vox(W, Hh, D);
  const N = W * Hh * D;
  const owner = new Int16Array(N).fill(-1); // which primitive filled it (colour fallback)
  const omat = new Array(prims.length);
  const P = [0, 0, 0];
  const centre = (i, j, k) => { P[0] = (k + k0 + 0.5) * s; P[1] = (j + j0 + 0.5) * s; P[2] = -(i + i0 + 0.5) * s; return P; };
  const MAT = S.mats;
  const colOf = (name) => {
    const m = MAT[name];
    if (!m) return 0;
    const c = m.ramp[2] >>> 0;
    return (m.glow ? c | EMIT : c) >>> 0;
  };
  // ---- occupancy
  const matAt = new Array(N);
  prims.forEach((p, pi) => {
    const b = pb[pi];
    const thick = half * 0.95;
    const ia = Math.max(0, Math.floor(-b[5] / s) - i0 - 1), ib = Math.min(W - 1, Math.ceil(-b[2] / s) - i0 + 1);
    const ja = Math.max(0, Math.floor(b[1] / s) - j0 - 1), jb = Math.min(Hh - 1, Math.ceil(b[4] / s) - j0 + 1);
    const ka = Math.max(0, Math.floor(b[0] / s) - k0 - 1), kb = Math.min(D - 1, Math.ceil(b[3] / s) - k0 + 1);
    for (let k = ka; k <= kb; k++) for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
      const m = insideMat(p, centre(i, j, k), thick);
      if (!m) continue;
      const id = i + W * (j + Hh * k);
      owner[id] = pi;
      matAt[id] = m;
    }
  });
  for (let id = 0; id < N; id++) if (owner[id] >= 0) vox.data[id] = colOf(matAt[id]) || 0x808080;
  void omat;
  // ---- colour every showing voxel by the first surface a ray from outside meets
  const O = [0, 0, 0], Dd = [0, 0, 0];
  const DIRS = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]];
  const far = (Math.max(W, Hh, D) + 4) * s;
  const filled = (i, j, k) => i >= 0 && j >= 0 && k >= 0 && i < W && j < Hh && k < D && owner[i + W * (j + Hh * k)] >= 0;
  for (let k = 0; k < D; k++) for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const id = i + W * (j + Hh * k);
    if (owner[id] < 0) continue;
    let best = null, bestDot = -1;
    for (const dm of DIRS) {
      if (filled(i + dm[0], j + dm[1], k + dm[2])) continue;
      // model direction -> sculpt direction: model (X, Y, Z) = (-z, y, x)
      Dd[0] = -dm[2]; Dd[1] = -dm[1]; Dd[2] = dm[0];
      centre(i, j, k);
      O[0] = P[0] - Dd[0] * far; O[1] = P[1] - Dd[1] * far; O[2] = P[2] - Dd[2] * far;
      let hit = null;
      for (let q = 0; q < prims.length; q++) {
        const b = pb[q];
        // cheap reject: the ray's line (axis-aligned) must pass the primitive's box
        if (Dd[0] === 0 && (P[0] < b[0] - half || P[0] > b[3] + half)) continue;
        if (Dd[1] === 0 && (P[1] < b[1] - half || P[1] > b[4] + half)) continue;
        if (Dd[2] === 0 && (P[2] < b[2] - half || P[2] > b[5] + half)) continue;
        const h = rayHit(prims[q], O, Dd);
        if (h && (!hit || h.t < hit.t)) hit = { t: h.t, mat: h.mat };
      }
      // only a hit near this voxel's own face counts (not a part floating further out)
      if (hit && Math.abs(hit.t - far) < s * 1.6) {
        // prefer the upward face's colour (the lid, the seat), then the rest
        const pr = dm[1] > 0 ? 2 : 1;
        if (pr > bestDot) { bestDot = pr; best = hit.mat; }
      }
    }
    if (best) vox.data[id] = colOf(best) || vox.data[id];
  }
  // ---- painted details, each from the view that faces it best
  if (S.decals.length) stampDecals(S, vox, { s, i0, j0, k0, views, pitch, ppm, colOf, filled });
  return { vox, size: s, origin: [-i0, -j0, -k0] };
}

// Stamp the sculpt's decals onto the voxel surface. Each decal's anchor is projected into the
// views the sprite was drawn from; the one whose ray reaches it most squarely paints it, one
// sprite pixel per voxel (a pixel lands on the first solid voxel along its view ray).
function stampDecals(S, vox, { s, i0, j0, k0, views, pitch, ppm, filled }) {
  const W = vox.w, Hh = vox.h, D = vox.d;
  const V = views.map((v) => {
    const yaw = typeof v === 'string' ? VIEW_YAW[v] ?? 0 : v.yaw ?? 0;
    const pt = typeof v === 'string' ? pitch : v.pitch ?? pitch;
    const M = mul3(rotX(pt), rotY(yaw)); // sculpt -> view (row-major), as renderSculpt
    return { yaw, pitch: pt, M, view: typeof v === 'string' ? { yaw } : v };
  });
  // march from a sculpt point backwards along -dir (towards the viewer) then forwards to the surface
  const toVox = (x, y, z) => [Math.floor(-z / s) - i0, Math.floor(y / s) - j0, Math.floor(x / s) - k0];
  for (const dc of S.decals) {
    // the view looking at the anchor most head-on: score by how deep the anchor sits (visible) and facing
    let bestV = null, bestScore = -1e9;
    for (const v of V) {
      const M = v.M;
      // view direction in sculpt space: the camera looks along view -z; sculpt dir = M^T (0, 0, -1)
      const dir = [-M[6], -M[7], -M[8]];
      // find the first surface voxel along the ray through the anchor
      const res = march(dc.p, dir);
      if (!res) continue;
      const dist = Math.hypot(res.p[0] - dc.p[0], res.p[1] - dc.p[1], res.p[2] - dc.p[2]);
      const score = -dist + (v.yaw === VIEW_YAW.front ? 0.004 : 0);
      if (dist < (dc.tol ?? 0.04) + s * 1.5 || dc.always) { if (score > bestScore) { bestScore = score; bestV = v; } }
    }
    if (!bestV) continue;
    const M = bestV.M, dir = [-M[6], -M[7], -M[8]];
    // view-space axes in sculpt space: right = M row 0, up = M row 1
    const R = [M[0], M[1], M[2]], U = [M[3], M[4], M[5]];
    // anchor in view pixels
    const vx = M[0] * dc.p[0] + M[1] * dc.p[1] + M[2] * dc.p[2], vy = M[3] * dc.p[0] + M[4] * dc.p[1] + M[5] * dc.p[2];
    const ix = Math.floor(vx * ppm), iy = Math.floor(-vy * ppm);
    const put = (x, y, c, glow = false) => {
      x = Math.round(x); y = Math.round(y);
      // pixel centre in view space -> sculpt point on the view plane through the anchor
      const X = (x + 0.5) / ppm - vx, Y = -(y + 0.5) / ppm - vy;
      const p = [dc.p[0] + R[0] * X + U[0] * Y, dc.p[1] + R[1] * X + U[1] * Y, dc.p[2] + R[2] * X + U[2] * Y];
      const res = march(p, dir);
      if (!res) return;
      const [i, j, k] = res.v;
      vox.set(i, j, k, glow ? (c | EMIT) >>> 0 : c >>> 0);
    };
    try { dc.fn(put, ix, iy, bestV.view, { ppm, z: 0 }); } catch { /* a painter that wants the sprite buffers: skip */ }
  }
  function march(p0, dir) {
    // start well in front (towards the viewer) and walk along dir
    const back = (Math.max(W, Hh, D) + 2) * s;
    let x = p0[0] - dir[0] * back, y = p0[1] - dir[1] * back, z = p0[2] - dir[2] * back;
    const st = s * 0.34, n = Math.ceil((back * 2) / st);
    for (let q = 0; q < n; q++) {
      const v = toVox(x, y, z);
      if (filled(v[0], v[1], v[2])) return { v, p: [x, y, z] };
      x += dir[0] * st; y += dir[1] * st; z += dir[2] * st;
    }
    return null;
  }
}
