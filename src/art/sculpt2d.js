// A tiny sprite sculptor for the 2D wildlife. Creatures are posed from 3D
// ellipsoids and tubes (in metres), then "pixelled" orthographically from a
// chosen view: every pixel gets a material and a true normal, which is banded
// into 3-4 flat tones (light from the top left), parts in front of other parts
// get a dark inner contour, painted details (eyes, glints, stripes) are stamped
// on in screen pixels, and a thick dark outline wraps the silhouette. The
// result reads like hand-pixelled art but stays consistent across views and
// animation frames.

// ---------------------------------------------------------------- colour ramps
function toHsl(hex) {
  const r = ((hex >> 16) & 255) / 255, g = ((hex >> 8) & 255) / 255, b = (hex & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return (Math.round((r + m) * 255) << 16) | (Math.round((g + m) * 255) << 8) | Math.round((b + m) * 255);
}
// hue-shifted ramp: shadows cooler and richer, lights warmer
function shiftHue(h, toward, k) {
  let d = toward - h;
  d = ((d + 540) % 360) - 180;
  return h + d * k;
}
// [outline, dark, mid, light, highlight]
export function ramp(hex, { sat = 0, contrast = 1 } = {}) {
  const [h, s, l] = toHsl(hex);
  const s0 = Math.min(1, s + sat);
  const grey = s0 < 0.06;
  const hd = grey ? h : shiftHue(h, 255, 0.12), hl = grey ? h : shiftHue(h, 48, 0.1);
  return [
    fromHsl(grey ? 270 : shiftHue(h, 270, 0.3), grey ? 0.22 : Math.min(1, s0 + 0.1) * 0.7, Math.max(0.05, l * 0.2)),
    fromHsl(hd, Math.min(1, s0 + 0.08), Math.max(0.07, l - 0.17 * contrast)),
    hex,
    fromHsl(hl, s0 * 0.95, Math.min(0.96, l + 0.11 * contrast)),
    fromHsl(hl, s0 * 0.8, Math.min(0.98, l + 0.22 * contrast)),
  ];
}

// ---------------------------------------------------------------- 3x3 matrices (row-major)
const mul = (A, B) => {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
  return o;
};
const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
export const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }; // +a turns +x towards -z
export const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }; // +a raises +x (nose up)
export const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }; // +a tips +y towards +z
const I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
export function basis(rot) {
  if (!rot) return I3;
  const [yaw = 0, pitch = 0, roll = 0] = rot;
  return mul(mul(rotY(yaw), rotZ(pitch)), rotX(roll));
}
export const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export { mul as mat3mul, mv as mat3vec };

// two-bone IK in the x/y plane at depth z: returns the joint. bend +1 bends the joint towards +x
export function ik2(a, b, l1, l2, bend) {
  let dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy);
  const maxd = (l1 + l2) * 0.999;
  if (d > maxd) { dx *= maxd / d; dy *= maxd / d; d = maxd; }
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * (d || 1e-6))));
  const base = Math.atan2(dy, dx);
  const ang = base - Math.acos(cosA) * bend;
  return [a[0] + Math.cos(ang) * l1, a[1] + Math.sin(ang) * l1, (a[2] + b[2]) / 2];
}

// ---------------------------------------------------------------- the sculpt
export class Sculpt {
  constructor(mats) {
    this.mats = mats; // name -> { ramp, hi, flat, glow }
    this.prims = [];
    this.decals = [];
    this.g = 0;
  }
  group() { return ++this.g; }
  // ellipsoid: centre, radii, material (name or fn(h, prim) -> name), { rot:[yaw,pitch,roll], group }
  ell(c, r, mat, o = {}) {
    if (typeof r === 'number') r = [r, r, r];
    this.prims.push({ c, r, B: o.B || basis(o.rot), mat, group: o.group ?? this.group(), t: o.t ?? 0, line: o.line ?? true });
    return this;
  }
  // a tube through points with radii, built from overlapping ellipsoids (one contour group)
  tube(pts, radii, mat, o = {}) {
    const group = o.group ?? this.group();
    let total = 0;
    const segs = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const l = Math.hypot(...sub3(pts[i + 1], pts[i]));
      segs.push(l);
      total += l;
    }
    let acc = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const l = segs[i];
      // round cone from pts[i] (radius ra) to pts[i+1] (radius rb)
      this.prims.push({ cone: true, a: pts[i], b: pts[i + 1], ra: radii[i], rb: radii[i + 1], mat, group, t0: total ? acc / total : 0, t1: total ? (acc + l) / total : 1, line: o.line ?? true });
      acc += l;
    }
    return this;
  }
  // decal: a 3D point and a pixel painter fn(put, x, y, view) stamped if the point is visible
  decal(p, fn, o = {}) {
    this.decals.push({ p, fn, tol: o.tol ?? 0.04, always: o.always ?? false });
    return this;
  }
}

// ---------------------------------------------------------------- rendering
const LIGHT = (() => { const v = [-0.5, 0.78, 0.62]; const l = Math.hypot(...v); return v.map((x) => x / l); })();

// Render a sculpt from a view ({ yaw, pitch }) at ppm pixels per metre.
// Returns { w, h, ax, ay, rgba: Uint8ClampedArray } cropped to the drawn pixels.
export function renderSculpt(S, view, ppm, opts = {}) {
  const V = mul(rotX(view.pitch || 0), rotY(view.yaw || 0));
  const P = S.prims.map((p) => {
    if (p.cone) {
      const a = mv(V, p.a), b = mv(V, p.b);
      const R = Math.max(p.ra, p.rb);
      return { ...p, a, b, bx0: Math.min(a[0] - p.ra, b[0] - p.rb), bx1: Math.max(a[0] + p.ra, b[0] + p.rb), by0: Math.min(a[1] - p.ra, b[1] - p.rb), by1: Math.max(a[1] + p.ra, b[1] + p.rb), R };
    }
    const c = mv(V, p.c);
    const B = mul(V, p.B);
    const R = Math.max(p.r[0], p.r[1], p.r[2]);
    // ray direction (0,0,-1) in unit-sphere local space
    const d = [-B[6] / p.r[0], -B[7] / p.r[1], -B[8] / p.r[2]];
    return { ...p, c, B, R, d, a: d[0] * d[0] + d[1] * d[1] + d[2] * d[2], bx0: c[0] - R, bx1: c[0] + R, by0: c[1] - R, by1: c[1] + R };
  });
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const p of P) {
    x0 = Math.min(x0, p.bx0); x1 = Math.max(x1, p.bx1);
    y0 = Math.min(y0, p.by0); y1 = Math.max(y1, p.by1);
  }
  // pixel grid aligned so the origin (the feet / anchor) sits on a pixel corner
  const pad = 2;
  const gx0 = Math.floor(x0 * ppm) - pad, gx1 = Math.ceil(x1 * ppm) + pad;
  const gy0 = Math.floor(-y1 * ppm) - pad, gy1 = Math.ceil(-y0 * ppm) + pad;
  const W = gx1 - gx0, H = gy1 - gy0;
  const N = W * H;
  const SC = scratch(N);
  const depth = SC.depth.subarray(0, N).fill(-1e9);
  const MI = matIndex(S.mats);
  const mat = SC.mat.subarray(0, N).fill(-1);
  const nrm = SC.nrm.subarray(0, N * 3);
  const grp = SC.grp.subarray(0, N).fill(-1);
  const lineOk = SC.lineOk.subarray(0, N).fill(0);
  const RC = { depth, mat, nrm, grp, lineOk, W, H, gx0, gy0, ppm, V, clip: opts.clipY !== undefined, clipY: opts.clipY ?? 0, MI };
  for (const p of P) {
    p.mi = typeof p.mat === 'function' ? -1 : MI.get(p.mat) ?? badMat(p.mat);
    if (p.cone) rasterCone(p, RC);
    else rasterEll(p, RC);
  }
  // clean up lone pixels and pinholes
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const n = (mat[i - 1] >= 0) + (mat[i + 1] >= 0) + (mat[i - W] >= 0) + (mat[i + W] >= 0);
    if (mat[i] >= 0 && n === 0) mat[i] = -1;
    else if (mat[i] < 0 && n === 4) {
      const j = i - 1;
      mat[i] = mat[j]; depth[i] = depth[j]; grp[i] = grp[j]; lineOk[i] = lineOk[j];
      nrm[i * 3] = nrm[j * 3]; nrm[i * 3 + 1] = nrm[j * 3 + 1]; nrm[i * 3 + 2] = nrm[j * 3 + 2];
    }
  }
  // banded shading
  const col = SC.col.subarray(0, N).fill(-1);
  const band = SC.band.subarray(0, N).fill(0);
  const SP = MI.specs;
  const L = opts.light || LIGHT;
  for (let i = 0; i < N; i++) {
    const m = mat[i];
    if (m < 0) continue;
    const spec = SP[m];
    if (spec.flat) { col[i] = spec.ramp[2]; band[i] = 2; continue; }
    const nx = nrm[i * 3], ny = nrm[i * 3 + 1], nz = nrm[i * 3 + 2];
    const ndl = nx * L[0] + ny * L[1] + nz * L[2];
    let k = ndl > 0.9 && spec.hi ? 4 : ndl > 0.6 ? 3 : ndl > 0.02 ? 2 : 1;
    if (nz < 0.22 && k > 1 && ndl < 0.5) k--; // the far rim turns into shadow
    if (spec.soft && k === 1) k = 2;
    band[i] = k;
    col[i] = spec.ramp[k];
  }
  // inner contours: a pixel just behind a nearer part (of another group) darkens
  const thr = (opts.contour ?? 2.6) / ppm;
  const near = (i, j) => mat[j] >= 0 && grp[j] !== grp[i] && lineOk[j] && depth[j] - depth[i] > thr;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (mat[i] < 0) continue;
    if (near(i, i + 1) || near(i, i - 1) || near(i, i + W) || near(i, i - W)) {
      const spec = SP[mat[i]];
      col[i] = spec.inner;
    }
  }
  // painted details
  const glowMask = SC.glowMask.subarray(0, N).fill(0);
  const DEC = MI.decal;
  const put = (x, y, c, glow = false) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    col[i] = c;
    if (glow) glowMask[i] = 1;
    if (mat[i] < 0) { mat[i] = DEC; depth[i] = 1e9; }
  };
  for (const dc of S.decals) {
    const p = mv(V, dc.p);
    const ix = Math.floor(p[0] * ppm - gx0), iy = Math.floor(-p[1] * ppm - gy0);
    if (!dc.always) {
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const i = iy * W + ix;
      if (mat[i] < 0 || p[2] < depth[i] - dc.tol) continue;
    }
    dc.fn(put, ix, iy, view, { W, H, mat, depth, band, col, ppm, z: p[2] });
  }
  // outer outline (colour of the nearest neighbouring part)
  const out = SC.out.subarray(0, N);
  out.set(col);
  const outGlow = SC.outGlow.subarray(0, N).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (mat[i] >= 0) continue;
    let best = -1, bz = -1e10;
    if (x + 1 < W && mat[i + 1] >= 0 && depth[i + 1] > bz) { bz = depth[i + 1]; best = i + 1; }
    if (x > 0 && mat[i - 1] >= 0 && depth[i - 1] > bz) { bz = depth[i - 1]; best = i - 1; }
    if (y + 1 < H && mat[i + W] >= 0 && depth[i + W] > bz) { bz = depth[i + W]; best = i + W; }
    if (y > 0 && mat[i - W] >= 0 && depth[i - W] > bz) { bz = depth[i - W]; best = i - W; }
    if (best < 0) continue;
    const m = mat[best];
    out[i] = m === DEC ? opts.decalOutline ?? 0x1e1418 : SP[m].ramp[0];
    if (m !== DEC && SP[m].glowLine) outGlow[i] = 1;
  }
  // crop
  let cx0 = W, cx1 = -1, cy0 = H, cy1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (out[y * W + x] >= 0) { if (x < cx0) cx0 = x; if (x > cx1) cx1 = x; if (y < cy0) cy0 = y; if (y > cy1) cy1 = y; }
  if (cx1 < 0) return { w: 1, h: 1, ax: 0, ay: 0, rgba: new Uint8ClampedArray(4), glow: new Uint8Array(1), ppm };
  const w = cx1 - cx0 + 1, h = cy1 - cy0 + 1;
  const rgba = new Uint8ClampedArray(w * h * 4);
  const glow = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y + cy0) * W + (x + cx0);
    const c = out[i];
    if (c < 0) continue;
    const k = (y * w + x) * 4;
    rgba[k] = (c >> 16) & 255; rgba[k + 1] = (c >> 8) & 255; rgba[k + 2] = c & 255; rgba[k + 3] = 255;
    const m = mat[i];
    if (glowMask[i] || outGlow[i] || (m >= 0 && m !== DEC && SP[m].glow)) glow[y * w + x] = 1;
  }
  return { w, h, ax: -gx0 - cx0, ay: -gy0 - cy0, rgba, glow, ppm };
}

// rasterise one primitive into the frame buffers (kept small so it optimises early)
const HH = [0, 0, 0];
const ZF = 50; // rays start this far in front
function rasterCone(p, RC) {
  const { depth, mat, nrm, grp, lineOk, W, H, gx0, gy0, ppm, V, clip, clipY, MI } = RC;
  const hh = HH;
  const px0 = Math.max(0, Math.floor(p.bx0 * ppm) - gx0), px1 = Math.min(W - 1, Math.ceil(p.bx1 * ppm) - gx0);
  const py0 = Math.max(0, Math.floor(-p.by1 * ppm) - gy0), py1 = Math.min(H - 1, Math.ceil(-p.by0 * ppm) - gy0);
  const fn = typeof p.mat === 'function' ? p.mat : null, mi = p.mi, line = p.line ? 1 : 0, group = p.group;
  // round cone (iq): ro = (X, Y, ZF), rd = (0, 0, -1)
  const pa = p.a, pb = p.b, ra = p.ra, rb = p.rb;
  const bax = pb[0] - pa[0], bay = pb[1] - pa[1], baz = pb[2] - pa[2];
  const rr = ra - rb;
  const m0 = bax * bax + bay * bay + baz * baz;
  const m2 = -baz;
  const d2 = m0 - rr * rr;
  const k2 = d2 - m2 * m2;
  for (let py = py0; py <= py1; py++) {
    const Y = -(py + gy0 + 0.5) / ppm;
    for (let px = px0; px <= px1; px++) {
      const X = (px + gx0 + 0.5) / ppm;
      const oax = X - pa[0], oay = Y - pa[1], oaz = ZF - pa[2];
      const obx = X - pb[0], oby = Y - pb[1], obz = ZF - pb[2];
      const m1 = bax * oax + bay * oay + baz * oaz;
      const m3 = -oaz;
      const m5 = oax * oax + oay * oay + oaz * oaz;
      const m6 = -obz;
      const m7 = obx * obx + oby * oby + obz * obz;
      const k1 = d2 * m3 - m1 * m2 + m2 * rr * ra;
      const k0 = d2 * m5 - m1 * m1 + m1 * rr * ra * 2 - m0 * ra * ra;
      let t = -1, nx = 0, ny = 0, nz = 0, u = 0;
      const h = k1 * k1 - k0 * k2;
      if (h >= 0 && k2 > 1e-12) {
        const tb = (-Math.sqrt(h) - k1) / k2;
        const y = m1 - ra * rr + tb * m2;
        if (y > 0 && y < d2) {
          t = tb;
          nx = d2 * oax - bax * y; ny = d2 * oay - bay * y; nz = d2 * (oaz - tb) - baz * y;
          u = y / d2;
        }
      }
      if (t < 0) {
        const h1 = m3 * m3 - m5 + ra * ra, h2 = m6 * m6 - m7 + rb * rb;
        if (h1 > 0) { t = -m3 - Math.sqrt(h1); nx = oax; ny = oay; nz = oaz - t; u = 0; }
        if (h2 > 0) {
          const t2 = -m6 - Math.sqrt(h2);
          if (t < 0 || t2 < t) { t = t2; nx = obx; ny = oby; nz = obz - t2; u = 1; }
        }
      }
      if (t < 0) continue;
      const z = ZF - t;
      const i = py * W + px;
      if (z <= depth[i]) continue;
      if (clip && V[1] * X + V[4] * Y + V[7] * z < clipY) continue;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      hh[0] = nx; hh[1] = ny; hh[2] = nz;
      let k = mi;
      if (fn) { const m = fn(hh, p, p.t0 + (p.t1 - p.t0) * u); if (!m) continue; k = MI.get(m) ?? badMat(m); }
      depth[i] = z; mat[i] = k; grp[i] = group; lineOk[i] = line;
      nrm[i * 3] = nx; nrm[i * 3 + 1] = ny; nrm[i * 3 + 2] = nz;
    }
  }
}
function rasterEll(p, RC) {
  const { depth, mat, nrm, grp, lineOk, W, H, gx0, gy0, ppm, V, clip, clipY, MI } = RC;
  const hh = HH;
  const px0 = Math.max(0, Math.floor(p.bx0 * ppm) - gx0), px1 = Math.min(W - 1, Math.ceil(p.bx1 * ppm) - gx0);
  const py0 = Math.max(0, Math.floor(-p.by1 * ppm) - gy0), py1 = Math.min(H - 1, Math.ceil(-p.by0 * ppm) - gy0);
  const fn = typeof p.mat === 'function' ? p.mat : null, mi = p.mi, line = p.line ? 1 : 0, group = p.group;
  const B = p.B, r = p.r, d = p.d, a = p.a;
  for (let py = py0; py <= py1; py++) {
    const Y = -(py + gy0 + 0.5) / ppm;
    for (let px = px0; px <= px1; px++) {
      const X = (px + gx0 + 0.5) / ppm;
      const ex = X - p.c[0], ey = Y - p.c[1], ez = -p.c[2];
      // local unit-sphere coords of the ray origin (z = 0 plane)
      const qx = (B[0] * ex + B[3] * ey + B[6] * ez) / r[0];
      const qy = (B[1] * ex + B[4] * ey + B[7] * ez) / r[1];
      const qz = (B[2] * ex + B[5] * ey + B[8] * ez) / r[2];
      const b = 2 * (qx * d[0] + qy * d[1] + qz * d[2]);
      const cc = qx * qx + qy * qy + qz * qz - 1;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      const z = -t;
      const i = py * W + px;
      if (z <= depth[i]) continue;
      if (clip && V[1] * X + V[4] * Y + V[7] * z < clipY) continue;
      const hx = qx + t * d[0], hy = qy + t * d[1], hz = qz + t * d[2];
      hh[0] = hx; hh[1] = hy; hh[2] = hz;
      let k = mi;
      if (fn) { const m = fn(hh, p, p.t); if (!m) continue; k = MI.get(m) ?? badMat(m); }
      depth[i] = z; mat[i] = k; grp[i] = group; lineOk[i] = line;
      // normal = B * (h / r)
      const lx = hx / r[0], ly = hy / r[1], lz = hz / r[2];
      let nx = B[0] * lx + B[1] * ly + B[2] * lz, ny = B[3] * lx + B[4] * ly + B[5] * lz, nz = B[6] * lx + B[7] * ly + B[8] * lz;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nrm[i * 3] = nx / nl; nrm[i * 3 + 1] = ny / nl; nrm[i * 3 + 2] = nz / nl;
    }
  }
}

// scratch buffers reused across frames (painting hundreds of frames would
// otherwise churn the garbage collector)
let SCR = { n: 0 };
function scratch(N) {
  if (SCR.n < N) {
    const n = Math.max(N, SCR.n * 2, 4096);
    SCR = { n, depth: new Float32Array(n), mat: new Int16Array(n), nrm: new Float32Array(n * 3), grp: new Int32Array(n), lineOk: new Uint8Array(n), col: new Int32Array(n), band: new Int8Array(n), glowMask: new Uint8Array(n), out: new Int32Array(n), outGlow: new Uint8Array(n) };
  }
  return SCR;
}

// material table -> index map (cached per table)
const MAT_CACHE = new WeakMap();
function matIndex(mats) {
  let m = MAT_CACHE.get(mats);
  if (m) return m;
  const names = Object.keys(mats);
  const map = new Map(names.map((n, i) => [n, i]));
  map.specs = names.map((n) => {
    const s = mats[n];
    return { ...s, inner: s.line ?? mixHex(s.ramp[0], s.ramp[1], 0.35) };
  });
  map.decal = names.length;
  MAT_CACHE.set(mats, map);
  return map;
}
function badMat(m) {
  throw new Error(`sculpt: unknown material ${m}`);
}

export function mixHex(a, b, t) {
  const r = Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t);
  const g = Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t);
  const bl = Math.round((a & 255) * (1 - t) + (b & 255) * t);
  return (r << 16) | (g << 8) | bl;
}

// common painted details ------------------------------------------------------
// a glossy eye: s = 1 (single pixel + glint nearby), 2 (2x2), 3 (2x3 tall)
export function eye(s = 2, { iris = 0x1a1014, glint = 0xfff6e8, ring = null } = {}) {
  return (put, x, y) => {
    if (ring) for (const [dx, dy] of [[-1, 0], [s, 0], [0, -1], [0, s], [-1, s - 1], [s, s - 1]]) put(x + dx, y + dy, ring);
    for (let j = 0; j < (s === 3 ? 3 : s); j++) for (let i = 0; i < Math.min(s, 2); i++) put(x + i, y + j, iris);
    if (s > 1) put(x, y, glint);
    else put(x, y - 1, glint);
  };
}
export function dot(c, w = 1, h = 1) {
  return (put, x, y) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, c); };
}
