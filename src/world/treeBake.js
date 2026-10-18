// Bakes one tree model for the forest renderer: paints it (trees.js) and meshes
// every LOD (greedy, baked AO, convex-edge flags for the pixel bevel) into compact
// vertex arrays. Runs in the tree worker, or on the main thread when workers are
// unavailable; everything it returns is plain typed arrays.
//
// bakeTree({ species, seed, lods }) -> {
//   key, species, seed, meta,
//   lods: [{ size, pos: Int16Array (voxel corners), nor: Int8Array, col: Uint8Array (sRGB + flags), sway: Uint8Array,
//            qbox: Int16Array (the quad's box in face coords), edge: Uint8Array (convex-edge flags), index, bounds }],
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

// convex-edge bit for (face axis a, in-plane axis k, side): in the face's detail axes U, V
// (as voxel/mesh.js: side faces U horizontal, V = y; top/bottom U = x, V = z), 1 = -U, 2 = +U, 4 = -V, 8 = +V
const EB = [0, 1, 2].map((a) => {
  const fu = a === 0 ? 2 : 0, fv = a === 1 ? 2 : 1;
  const r = [0, 0, 0, 0, 0, 0];
  for (let k = 0; k < 3; k++) {
    if (k === fu) { r[k * 2] = 1; r[k * 2 + 1] = 2; }
    if (k === fv) { r[k * 2] = 4; r[k * 2 + 1] = 8; }
  }
  return r;
});

// Greedy voxel mesher writing the forest's compact vertex format directly. Same
// faces, per-corner AO, merge rule and diagonal flip as mesh.js; positions are
// integer voxel corners relative to the (integer) origin.
function meshPacked(vox, size, origin, meta) {
  const W = vox.w, H = vox.h, D = vox.d, data = vox.data;
  const dims = [W, H, D], stride = [1, W, W * H];
  const [ox, oy, oz] = origin;
  const pos = new Buf(Int16Array, 1 << 14), nor = new Buf(Int8Array, 1 << 14), col = new Buf(Uint8Array, 1 << 15), sw = new Buf(Uint8Array, 1 << 12), idx = new Buf(Uint32Array, 1 << 14);
  // per vertex: the quad's box in face coords (relative to the origin) and its convex-edge flags
  const qbx = new Buf(Int16Array, 1 << 14), edg = new Buf(Uint8Array, 1 << 12);
  const org = origin;
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
    const maskC = new Uint32Array(du * dv), maskA = new Uint8Array(du * dv), maskE = new Uint8Array(du * dv);
    const EA = EB[a], bU0 = EA[u * 2], bU1 = EA[u * 2 + 1], VB = EA[v * 2] | EA[v * 2 + 1];
    const fu = a === 0 ? 2 : 0, fv = a === 1 ? 2 : 1;
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
            // convex edges: no voxel beside this one in the plane, and none in front of that
            let e = 0;
            const fr = hasFront ? s * sa : 0;
            if (!(i > 0 && (data[p - su] || (hasFront && data[p - su + fr])))) e |= EA[u * 2];
            if (!(i < du - 1 && (data[p + su] || (hasFront && data[p + su + fr])))) e |= EA[u * 2 + 1];
            if (!(j > 0 && (data[p - sv] || (hasFront && data[p - sv + fr])))) e |= EA[v * 2];
            if (!(j < dv - 1 && (data[p + sv] || (hasFront && data[p + sv + fr])))) e |= EA[v * 2 + 1];
            maskE[m] = e;
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
            // (edge bits: a row keeps one v-side status all along, rows keep the quad's u-side ends)
            const e0 = maskE[m];
            while (i + w < du && maskC[m + w] === c && maskA[m + w] === ao && (maskE[m + w] & VB) === (e0 & VB)) w++;
            const eR = maskE[m + w - 1] & bU1;
            outer: for (; j + h < dv; h++) {
              const row = i + (j + h) * du;
              const rv = maskE[row] & VB;
              if ((maskE[row] & bU0) !== (e0 & bU0) || (maskE[row + w - 1] & bU1) !== eR) break;
              for (let k = 0; k < w; k++) {
                const mm = row + k;
                if (maskC[mm] !== c || maskA[mm] !== ao || (maskE[mm] & VB) !== rv) break outer;
              }
            }
            const ef = (e0 & bU0) | eR | (e0 & EA[v * 2]) | (maskE[i + (j + h - 1) * du] & EA[v * 2 + 1]);
            for (let jj = 0; jj < h; jj++) maskC.fill(0, i + (j + jj) * du, i + w + (j + jj) * du);
            // emit the quad
            pos.need(12); nor.need(12); col.need(16); sw.need(4); idx.need(6); qbx.need(16); edg.need(4);
            let q0 = 1e9, q1 = 1e9, q2 = -1e9, q3 = -1e9;
            for (let k = 0; k < 4; k++) {
              pt[a] = plane; pt[u] = k === 1 || k === 2 ? i + w : i; pt[v] = k >= 2 ? j + h : j;
              const U = pt[fu] - org[fu], V = pt[fv] - org[fv];
              if (U < q0) q0 = U; if (U > q2) q2 = U; if (V < q1) q1 = V; if (V > q3) q3 = V;
            }
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
              const qo = qbx.n;
              qbx.a[qo] = q0; qbx.a[qo + 1] = q1; qbx.a[qo + 2] = q2; qbx.a[qo + 3] = q3; qbx.n += 4;
              edg.a[edg.n++] = ef;
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
  return { size, pos: pos.out, nor: nor.out, col: col.out, sway: sw.out, qbox: qbx.out, edge: edg.out, index, faces: idx.n / 6, bounds: [bx0, by0, bz0, bx1, by1, bz1] };
}

export function bakeTree({ species, seed, lods = 3 }) {
  const r = buildTreeLods(species, { seed, lods });
  const out = { key: `${species}:${seed}`, species, seed, meta: r.meta, lods: [] };
  for (const L of r.lods) {
    const c = crop(L.vox, L.origin);
    out.lods.push(meshPacked(c.vox, L.size, c.origin, r.meta));
  }
  return out;
}

// transferable buffers of a bake result
export function bakeTransfer(res) {
  const t = [];
  for (const l of res.lods) t.push(l.pos.buffer, l.nor.buffer, l.col.buffer, l.sway.buffer, l.qbox.buffer, l.edge.buffer, l.index.buffer);
  return t;
}
