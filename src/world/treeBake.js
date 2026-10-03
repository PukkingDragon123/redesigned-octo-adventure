// Bakes one tree model for the forest renderer: paints it (trees.js), meshes
// every LOD (greedy, baked AO) into compact vertex arrays, and renders the
// far impostor views. Runs in the tree worker, or on the main thread when
// workers are unavailable; everything it returns is plain typed arrays.
//
// bakeTree({ species, seed, lods, impostor }) -> {
//   key, species, seed, meta,
//   lods: [{ size, pos: Int16Array (voxel corners), nor: Int8Array, col: Uint8Array (sRGB + flags), sway: Uint8Array, index, bounds }],
//   views: [{ w, h, x0, y0, s, rgba: Uint8Array, nrm: Uint8Array }] (4 views, impostor only)
// }
// col alpha: 255 leaf, 160 loose falling leaf, 64 glowing, 0 wood.
import { buildTreeLods, LEAF, FALL } from '../voxel/models/trees.js';
import { EMIT } from '../voxel/vox.js';

export const SWAY_MAX = 0.4; // metres of sway at aSway = 1

const SRGB = new Uint8Array(4096);
for (let i = 0; i < 4096; i++) {
  const c = i / 4095;
  SRGB[i] = Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
}
const toSrgb = (v) => SRGB[Math.max(0, Math.min(4095, Math.round(v * 4095)))];

// crop a grid to its filled bounds (cheaper meshing); returns { vox, origin }
function crop(vox, origin) {
  const b = vox.bounds();
  if (b.x1 < 0) return { vox, origin };
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1, d = b.z1 - b.z0 + 1;
  if (w === vox.w && h === vox.h && d === vox.d) return { vox, origin };
  const out = new vox.constructor(w, h, d);
  for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) {
    const so = vox.idx(b.x0, b.y0 + y, b.z0 + z), dO = out.idx(0, y, z);
    out.data.set(vox.data.subarray(so, so + w), dO);
  }
  return { vox: out, origin: [origin[0] - b.x0, origin[1] - b.y0, origin[2] - b.z0] };
}

// AO levels as in mesh.js, folded into sRGB lookup tables per channel value
const AO = [0.48, 0.66, 0.83, 1.0];
const SR = [];
for (let k = 0; k < 4; k++) {
  const t = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = toSrgb((c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)) * AO[k]);
  }
  SR.push(t);
}

const TRI = [[0, 1, 2, 0, 2, 3], [1, 2, 3, 1, 3, 0], [3, 2, 0, 2, 1, 0], [0, 3, 1, 3, 2, 1]];

// growable typed buffer
class Buf {
  constructor(T, n) { this.T = T; this.a = new T(n); this.n = 0; }
  need(k) { if (this.n + k > this.a.length) { const b = new this.T(Math.max(this.a.length * 2, this.n + k)); b.set(this.a); this.a = b; } }
  get out() { return this.a.slice(0, this.n); }
}

// Greedy voxel mesher writing the forest's compact vertex format directly. Same
// faces, per-corner AO, merge rule and diagonal flip as mesh.js; positions are
// integer voxel corners relative to the (integer) origin.
function meshPacked(vox, size, origin, meta) {
  const W = vox.w, H = vox.h, D = vox.d, data = vox.data;
  const dims = [W, H, D], stride = [1, W, W * H];
  const [ox, oy, oz] = origin;
  const pos = new Buf(Int16Array, 1 << 14), nor = new Buf(Int8Array, 1 << 14), col = new Buf(Uint8Array, 1 << 15), sw = new Buf(Uint8Array, 1 << 12), idx = new Buf(Uint32Array, 1 << 14);
  const y0 = meta.swayY0 ?? 0, top = Math.max(y0 + 0.5, meta.height ?? 1);
  const amp = Math.min(1, (meta.sway ?? 0) / SWAY_MAX);
  const swayT = new Uint8Array(H + 1);
  for (let iy = 0; iy <= H; iy++) {
    const t = Math.max(0, Math.min(1, ((iy - oy) * size - y0) / (top - y0)));
    swayT[iy] = Math.round(Math.min(1, Math.pow(t, 1.4) * amp) * 255);
  }
  let nv = 0;
  let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
  const pt = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const du = dims[u], dv = dims[v], da = dims[a];
    const sa = stride[a], su = stride[u], sv = stride[v];
    const maskC = new Uint32Array(du * dv), maskA = new Uint8Array(du * dv);
    for (let s = -1; s <= 1; s += 2) {
      for (let sl = 0; sl < da; sl++) {
        const front = sl + s;
        const hasFront = front >= 0 && front < da;
        let any = false;
        for (let j = 0; j < dv; j++) {
          for (let i = 0; i < du; i++) {
            const m = i + j * du;
            const p = sl * sa + i * su + j * sv;
            const c = data[p];
            maskC[m] = 0;
            if (!c) continue;
            if (hasFront && data[p + s * sa]) continue;
            let ao = 0;
            if (hasFront && !(c & EMIT)) {
              const f = p + s * sa;
              const um = i > 0, up = i < du - 1, vm = j > 0, vp = j < dv - 1;
              const s1m = um && data[f - su] ? 1 : 0, s1p = up && data[f + su] ? 1 : 0;
              const s2m = vm && data[f - sv] ? 1 : 0, s2p = vp && data[f + sv] ? 1 : 0;
              const cmm = um && vm && data[f - su - sv] ? 1 : 0, cpm = up && vm && data[f + su - sv] ? 1 : 0;
              const cpp = up && vp && data[f + su + sv] ? 1 : 0, cmp = um && vp && data[f - su + sv] ? 1 : 0;
              const v0 = s1m && s2m ? 0 : 3 - (s1m + s2m + cmm);
              const v1 = s1p && s2m ? 0 : 3 - (s1p + s2m + cpm);
              const v2 = s1p && s2p ? 0 : 3 - (s1p + s2p + cpp);
              const v3 = s1m && s2p ? 0 : 3 - (s1m + s2p + cmp);
              ao = v0 | (v1 << 2) | (v2 << 4) | (v3 << 6);
            } else ao = 255;
            maskC[m] = c;
            maskA[m] = ao;
            any = true;
          }
        }
        if (!any) continue;
        const plane = s > 0 ? sl + 1 : sl;
        for (let j = 0; j < dv; j++) {
          for (let i = 0; i < du;) {
            const m = i + j * du, c = maskC[m];
            if (!c) { i++; continue; }
            const ao = maskA[m];
            let w = 1, h = 1;
            while (i + w < du && maskC[m + w] === c && maskA[m + w] === ao) w++;
            outer: for (; j + h < dv; h++) {
              for (let k = 0; k < w; k++) {
                const mm = i + k + (j + h) * du;
                if (maskC[mm] !== c || maskA[mm] !== ao) break outer;
              }
            }
            for (let jj = 0; jj < h; jj++) maskC.fill(0, i + (j + jj) * du, i + w + (j + jj) * du);
            // emit the quad
            pos.need(12); nor.need(12); col.need(16); sw.need(4); idx.need(6);
            const flag = c & FALL ? 160 : c & LEAF ? 255 : c & EMIT ? 64 : 0;
            const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
            for (let k = 0; k < 4; k++) {
              pt[a] = plane;
              pt[u] = k === 1 || k === 2 ? i + w : i;
              pt[v] = k >= 2 ? j + h : j;
              const x = pt[0] - ox, y = pt[1] - oy, z = pt[2] - oz;
              const po = pos.n;
              pos.a[po] = x; pos.a[po + 1] = y; pos.a[po + 2] = z; pos.n += 3;
              if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
              if (y < by0) by0 = y; if (y > by1) by1 = y;
              if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
              const no = nor.n;
              nor.a[no] = a === 0 ? s * 127 : 0; nor.a[no + 1] = a === 1 ? s * 127 : 0; nor.a[no + 2] = a === 2 ? s * 127 : 0; nor.n += 3;
              const lv = ao === 255 ? 3 : (ao >> (k * 2)) & 3;
              const T = SR[lv], co = col.n;
              col.a[co] = T[r]; col.a[co + 1] = T[g]; col.a[co + 2] = T[b]; col.a[co + 3] = flag; col.n += 4;
              sw.a[sw.n++] = swayT[pt[1]];
            }
            // flip the diagonal so AO gradients don't crease
            const a0 = (ao >> 0) & 3, a1 = (ao >> 2) & 3, a2 = (ao >> 4) & 3, a3 = (ao >> 6) & 3;
            const flip = ao !== 255 && a0 + a2 < a1 + a3;
            const t = TRI[(flip ? 1 : 0) + (s < 0 ? 2 : 0)];
            for (let q = 0; q < 6; q++) idx.a[idx.n++] = nv + t[q];
            nv += 4;
            i += w;
          }
        }
      }
    }
  }
  const index = nv > 65535 ? idx.out : Uint16Array.from(idx.a.subarray(0, idx.n));
  return { size, pos: pos.out, nor: nor.out, col: col.out, sway: sw.out, index, faces: idx.n / 6, bounds: [bx0, by0, bz0, bx1, by1, bz1] };
}

// Impostor views of a grid, looking at the model from +z, +x, -z and -x.
// Each texel holds the first voxel hit (sRGB colour, darkened in recesses) and a
// view-space normal estimated from the depth map, blended with a crown sphere.
function renderViews(vox, size, origin, meta) {
  const b = vox.bounds();
  const views = [];
  const cyv = (meta.canopyY ?? meta.height * 0.6) / size + origin[1];
  for (let v = 0; v < 4; v++) {
    // image axis u runs along the view's right-hand side; depth runs away from the viewer
    const alongX = v % 2 === 0;
    const u0 = alongX ? b.x0 : b.z0, u1 = alongX ? b.x1 : b.z1;
    const d0 = alongX ? b.z0 : b.x0, d1 = alongX ? b.z1 : b.x1;
    const w = u1 - u0 + 1, h = b.y1 - b.y0 + 1;
    const depth = new Float32Array(w * h).fill(-1);
    const colr = new Uint32Array(w * h);
    for (let j = 0; j < h; j++) {
      const y = b.y0 + j;
      for (let i = 0; i < w; i++) {
        // view 0 (from +z): right = +x; view 1 (from +x): right = -z; view 2 (from -z): right = -x; view 3 (from -x): right = +z
        const u = v === 0 || v === 3 ? u0 + i : u1 - i;
        for (let dd = 0; dd <= d1 - d0; dd++) {
          const dep = v === 0 || v === 1 ? d1 - dd : d0 + dd;
          const c = alongX ? vox.data[vox.idx(u, y, dep)] : vox.data[vox.idx(dep, y, u)];
          if (c) { depth[i + j * w] = dd; colr[i + j * w] = c; break; }
        }
      }
    }
    const rgba = new Uint8Array(w * h * 4), nrm = new Uint8Array(w * h * 4);
    const cu = (w - 1) / 2, ru = Math.max(2, w / 2), rv = Math.max(2, h / 2);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const o = i + j * w, dz = depth[o];
      if (dz < 0) continue;
      const D = (x, y) => (x < 0 || y < 0 || x >= w || y >= h || depth[x + y * w] < 0 ? dz + 2.5 : depth[x + y * w]);
      // depth gradient -> normal (image y runs up)
      let nx = (D(i - 1, j) - D(i + 1, j)) * -0.5, ny = (D(i, j - 1) - D(i, j + 1)) * -0.5, nz = 1;
      // crown sphere
      const sx = (i - cu) / ru, sy = (j + b.y0 - cyv) / rv;
      nx = nx * 0.55 + sx * 0.9; ny = ny * 0.55 + sy * 0.7; nz = nz * 0.7 + 0.5;
      const nl = Math.hypot(nx, ny, nz);
      // recess darkening
      let mn = dz;
      for (let q = -2; q <= 2; q++) for (let p = -2; p <= 2; p++) { const dd = D(i + p, j + q); if (dd < mn) mn = dd; }
      const ao = 1 - Math.min(1, (dz - mn) / 4) * 0.45;
      const c = colr[o];
      const lin = (k) => { const s = ((c >> k) & 255) / 255; return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
      const oo = o * 4;
      rgba[oo] = toSrgb(lin(16) * ao); rgba[oo + 1] = toSrgb(lin(8) * ao); rgba[oo + 2] = toSrgb(lin(0) * ao); rgba[oo + 3] = 255;
      nrm[oo] = Math.round((nx / nl * 0.5 + 0.5) * 255); nrm[oo + 1] = Math.round((ny / nl * 0.5 + 0.5) * 255); nrm[oo + 2] = Math.round((nz / nl * 0.5 + 0.5) * 255);
      nrm[oo + 3] = c & LEAF ? 255 : 0;
    }
    // metres, relative to the pivot: left edge (along the image's right axis) and bottom
    const x0 = v === 0 || v === 3 ? (u0 - (alongX ? origin[0] : origin[2])) * size : -((u1 + 1) - (alongX ? origin[0] : origin[2])) * size;
    views.push({ w, h, x0, y0: (b.y0 - origin[1]) * size, s: size, rgba, nrm });
  }
  return views;
}

export function bakeTree({ species, seed, lods = 3, impostor = false }) {
  const r = buildTreeLods(species, { seed, lods });
  const out = { key: `${species}:${seed}`, species, seed, meta: r.meta, lods: [], views: null };
  for (const L of r.lods) {
    const c = crop(L.vox, L.origin);
    out.lods.push(meshPacked(c.vox, L.size, c.origin, r.meta));
  }
  if (impostor) {
    const L = r.lods[Math.min(1, r.lods.length - 1)];
    out.views = renderViews(L.vox, L.size, L.origin, r.meta);
  }
  return out;
}

// transferable buffers of a bake result
export function bakeTransfer(res) {
  const t = [];
  for (const l of res.lods) t.push(l.pos.buffer, l.nor.buffer, l.col.buffer, l.sway.buffer, l.index.buffer);
  if (res.views) for (const v of res.views) t.push(v.rgba.buffer, v.nrm.buffer);
  return t;
}
