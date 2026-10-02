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
import { meshVox } from '../voxel/mesh.js';
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

function pack(vox, size, origin, meta) {
  const geo = meshVox(vox, { size, origin, greedy: true });
  const P = geo.attributes.position.array, N = geo.attributes.normal.array, C = geo.attributes.color4.array;
  const I = geo.index.array;
  const nv = P.length / 3;
  const pos = new Int16Array(nv * 3), nor = new Int8Array(nv * 3), col = new Uint8Array(nv * 4), sway = new Uint8Array(nv);
  const inv = 1 / size;
  const y0 = meta.swayY0 ?? 0, top = Math.max(y0 + 0.5, meta.height ?? 1);
  const amp = (meta.sway ?? 0) / SWAY_MAX;
  const [ox, oy, oz] = origin;
  const D = vox.data, W = vox.w, H = vox.h;
  let bx0 = 1e9, by0 = 1e9, bz0 = 1e9, bx1 = -1e9, by1 = -1e9, bz1 = -1e9;
  for (let q = 0; q < nv; q += 4) {
    // the voxel behind this quad (its flags decide leaf / glow)
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 4; k++) { cx += P[(q + k) * 3]; cy += P[(q + k) * 3 + 1]; cz += P[(q + k) * 3 + 2]; }
    const nx = N[q * 3], ny = N[q * 3 + 1], nz = N[q * 3 + 2];
    const vx = Math.floor(cx * 0.25 * inv + ox - nx * 0.5), vy = Math.floor(cy * 0.25 * inv + oy - ny * 0.5), vz = Math.floor(cz * 0.25 * inv + oz - nz * 0.5);
    const c = D[vx + W * (vy + H * vz)] | 0;
    const flag = c & FALL ? 160 : c & LEAF ? 255 : c & EMIT ? 64 : 0;
    for (let k = q; k < q + 4; k++) {
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
      const ix = Math.round(x * inv), iy = Math.round(y * inv), iz = Math.round(z * inv);
      pos[k * 3] = ix; pos[k * 3 + 1] = iy; pos[k * 3 + 2] = iz;
      if (ix < bx0) bx0 = ix; if (ix > bx1) bx1 = ix;
      if (iy < by0) by0 = iy; if (iy > by1) by1 = iy;
      if (iz < bz0) bz0 = iz; if (iz > bz1) bz1 = iz;
      nor[k * 3] = nx * 127; nor[k * 3 + 1] = ny * 127; nor[k * 3 + 2] = nz * 127;
      col[k * 4] = toSrgb(C[k * 4]); col[k * 4 + 1] = toSrgb(C[k * 4 + 1]); col[k * 4 + 2] = toSrgb(C[k * 4 + 2]);
      col[k * 4 + 3] = flag;
      const t = Math.max(0, Math.min(1, (y - y0) / (top - y0)));
      sway[k] = Math.round(Math.min(1, Math.pow(t, 1.4) * amp) * 255);
    }
  }
  const index = nv > 65535 ? new Uint32Array(I) : new Uint16Array(I);
  return { size, pos, nor, col, sway, index, faces: I.length / 6, bounds: [bx0, by0, bz0, bx1, by1, bz1] };
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
    out.lods.push(pack(c.vox, L.size, c.origin, r.meta));
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
