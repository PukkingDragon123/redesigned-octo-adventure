// Voxel -> BufferGeometry: exposed faces only, per-vertex ambient occlusion,
// optional greedy merging of equal faces (big flat walls become a few quads).
import * as THREE from 'three';
import { FLAGS, EMIT, GLASS, vhash } from './vox.js';

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const AO = [0.48, 0.66, 0.83, 1.0];

// opts: size (m per voxel), origin [x,y,z] in voxel units (the pivot), greedy, jitter, seed, aoStrength
export function meshVox(vox, opts = {}) {
  const size = opts.size ?? 0.05;
  const [ox, oy, oz] = opts.origin ?? [vox.w / 2, 0, vox.d / 2];
  const jitter = opts.jitter ?? 0;
  const greedy = opts.greedy ?? jitter === 0;
  const seed = opts.seed ?? 0;
  const aoK = opts.aoStrength ?? 1;
  const dims = [vox.w, vox.h, vox.d];
  const data = vox.data;
  const W = vox.w, H = vox.h;
  const solid = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < vox.d && data[x + W * (y + H * z)] !== 0;

  const pos = [], nor = [], col = [], idx = [];
  let vcount = 0;
  const p = [0, 0, 0], q = [0, 0, 0];

  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const du = dims[u], dv = dims[v];
    const maskC = new Uint32Array(du * dv);
    const maskA = new Uint8Array(du * dv);
    const maskJ = new Float32Array(du * dv);
    for (let s = -1; s <= 1; s += 2) {
      for (let sl = 0; sl < dims[a]; sl++) {
        // build the face mask for this slice
        let any = false;
        for (let j = 0; j < dv; j++) for (let i = 0; i < du; i++) {
          p[a] = sl; p[u] = i; p[v] = j;
          const c = data[p[0] + W * (p[1] + H * p[2])];
          const m = i + j * du;
          maskC[m] = 0;
          if (!c) continue;
          q[a] = sl + s; q[u] = i; q[v] = j;
          if (solid(q[0], q[1], q[2])) continue;
          // ambient occlusion at the four corners, sampled in the layer in front of the face
          let ao = 0;
          for (let k = 0; k < 4; k++) {
            const su = k === 1 || k === 2 ? 1 : -1;
            const sv = k >= 2 ? 1 : -1;
            q[u] = i + su; q[v] = j;
            const s1 = solid(q[0], q[1], q[2]) ? 1 : 0;
            q[u] = i; q[v] = j + sv;
            const s2 = solid(q[0], q[1], q[2]) ? 1 : 0;
            q[u] = i + su; q[v] = j + sv;
            const cc = solid(q[0], q[1], q[2]) ? 1 : 0;
            const val = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
            ao |= val << (k * 2);
          }
          maskC[m] = c;
          maskA[m] = ao;
          maskJ[m] = jitter ? (vhash(p[0], p[1], p[2], seed) - 0.5) * 2 * jitter : 0;
          any = true;
        }
        if (!any) continue;
        // greedy merge
        for (let j = 0; j < dv; j++) {
          for (let i = 0; i < du; ) {
            const m = i + j * du;
            const c = maskC[m];
            if (!c) { i++; continue; }
            const ao = maskA[m];
            let w = 1, h = 1;
            if (greedy) {
              while (i + w < du && maskC[m + w] === c && maskA[m + w] === ao) w++;
              outer: for (; j + h < dv; h++) {
                for (let k = 0; k < w; k++) {
                  const mm = i + k + (j + h) * du;
                  if (maskC[mm] !== c || maskA[mm] !== ao) break outer;
                }
              }
            }
            emit(a, u, v, s, sl, i, j, w, h, c, ao, maskJ[m]);
            for (let jj = 0; jj < h; jj++) for (let ii = 0; ii < w; ii++) maskC[i + ii + (j + jj) * du] = 0;
            i += w;
          }
        }
      }
    }
  }

  function emit(a, u, v, s, sl, i, j, w, h, c, ao, jit) {
    const plane = s > 0 ? sl + 1 : sl;
    const corners = [[i, j], [i + w, j], [i + w, j + h], [i, j + h]];
    const n = [0, 0, 0];
    n[a] = s;
    const fl = c & FLAGS;
    const r = LIN[(c >> 16) & 255], g = LIN[(c >> 8) & 255], b = LIN[c & 255];
    const tint = 1 + jit;
    const em = fl & EMIT ? 1 : fl & GLASS ? 0.5 : 0;
    const base = vcount;
    const aos = [];
    for (let k = 0; k < 4; k++) {
      const pt = [0, 0, 0];
      pt[a] = plane;
      pt[u] = corners[k][0];
      pt[v] = corners[k][1];
      pos.push((pt[0] - ox) * size, (pt[1] - oy) * size, (pt[2] - oz) * size);
      nor.push(n[0], n[1], n[2]);
      const aov = (ao >> (k * 2)) & 3;
      aos.push(aov);
      const lit = em ? 1 : 1 - (1 - AO[aov]) * aoK;
      col.push(r * lit * tint, g * lit * tint, b * lit * tint, em);
      vcount++;
    }
    // flip the diagonal so AO gradients don't crease
    const flip = aos[0] + aos[2] < aos[1] + aos[3];
    const tri = flip ? [1, 2, 3, 1, 3, 0] : [0, 1, 2, 0, 2, 3];
    if (s < 0) tri.reverse();
    for (const t of tri) idx.push(base + t);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color4', new THREE.Float32BufferAttribute(col, 4));
  g.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData.faces = idx.length / 6;
  return g;
}

// Split a model into chunky fragments (for smashing). Returns [{ vox, ox, oy, oz }]
// where (ox,oy,oz) is the fragment's offset inside the original.
export function fragmentVox(vox, cell = 4, Ctor) {
  const out = new Map();
  for (let z = 0; z < vox.d; z++) for (let y = 0; y < vox.h; y++) for (let x = 0; x < vox.w; x++) {
    const c = vox.data[vox.idx(x, y, z)];
    if (!c) continue;
    // jitter the cell borders a little so fragments aren't perfect cubes
    const jx = Math.floor((x + vhash(y, z, 1, 7) * 2) / cell), jy = Math.floor((y + vhash(x, z, 2, 7) * 2) / cell), jz = Math.floor((z + vhash(x, y, 3, 7) * 2) / cell);
    const key = `${jx},${jy},${jz}`;
    let f = out.get(key);
    if (!f) out.set(key, (f = { pts: [], min: [1e9, 1e9, 1e9], max: [-1, -1, -1] }));
    f.pts.push(x, y, z, c);
    f.min[0] = Math.min(f.min[0], x); f.min[1] = Math.min(f.min[1], y); f.min[2] = Math.min(f.min[2], z);
    f.max[0] = Math.max(f.max[0], x); f.max[1] = Math.max(f.max[1], y); f.max[2] = Math.max(f.max[2], z);
  }
  const res = [];
  for (const f of out.values()) {
    const v = new Ctor(f.max[0] - f.min[0] + 1, f.max[1] - f.min[1] + 1, f.max[2] - f.min[2] + 1);
    for (let k = 0; k < f.pts.length; k += 4) v.set(f.pts[k] - f.min[0], f.pts[k + 1] - f.min[1], f.pts[k + 2] - f.min[2], f.pts[k + 3]);
    res.push({ vox: v, ox: f.min[0], oy: f.min[1], oz: f.min[2], n: f.pts.length / 4 });
  }
  return res;
}
