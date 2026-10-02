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

  // output buffers grow by doubling (no per-face garbage)
  let cap = 4096;
  let pos = new Float32Array(cap * 3), nor = new Float32Array(cap * 3), col = new Float32Array(cap * 4), idx = new Uint32Array(cap * 1.5);
  let nIdx = 0;
  const grow = () => {
    cap *= 2;
    const g3 = (arr, k) => { const n = new Float32Array(cap * k); n.set(arr); return n; };
    pos = g3(pos, 3); nor = g3(nor, 3); col = g3(col, 4);
    const ni = new Uint32Array(cap * 1.5); ni.set(idx); idx = ni;
  };
  let vcount = 0;
  const aos = [0, 0, 0, 0], cu = [0, 0, 0, 0], cv = [0, 0, 0, 0], pt = [0, 0, 0];
  const TRI_A = [0, 1, 2, 0, 2, 3], TRI_B = [1, 2, 3, 1, 3, 0];
  const p = [0, 0, 0], q = [0, 0, 0];

  // flat-index strides: the slice / mask loops below walk the volume with plain index arithmetic
  const st = [1, W, W * H];
  // how many solid voxels each x / y / z slice holds (empty slices are skipped outright)
  const occ = [new Uint32Array(W), new Uint32Array(H), new Uint32Array(vox.d)];
  for (let z = 0, id = 0; z < vox.d; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++, id++) if (data[id] !== 0) { occ[0][x]++; occ[1][y]++; occ[2][z]++; }
  for (let a = 0; a < 3; a++) {
    const u = (a + 1) % 3, v = (a + 2) % 3;
    const du = dims[u], dv = dims[v], da = dims[a];
    const sa = st[a], su_ = st[u], sv_ = st[v];
    const maskC = new Uint32Array(du * dv);
    const maskA = new Uint8Array(du * dv);
    const maskJ = new Float32Array(du * dv);
    for (let s = -1; s <= 1; s += 2) {
      for (let sl = 0; sl < da; sl++) {
        if (occ[a][sl] === 0) continue;
        // build the face mask for this slice
        let any = false;
        const front = sl + s >= 0 && sl + s < da; // is there a layer in front of these faces?
        const fo = s * sa;
        for (let j = 0; j < dv; j++) {
          const rowBase = sl * sa + j * sv_;
          for (let i = 0; i < du; i++) {
            const id = rowBase + i * su_;
            const c = data[id];
            const m = i + j * du;
            maskC[m] = 0;
            if (!c) continue;
            if (front && data[id + fo] !== 0) continue;
            // ambient occlusion at the four corners, sampled in the layer in front of the face
            let ao = 0;
            if (!front) ao = 0xff; // nothing in front: no occlusion anywhere
            else {
              const f = id + fo;
              const iL = i > 0, iR = i < du - 1, jD = j > 0, jU = j < dv - 1;
              for (let k = 0; k < 4; k++) {
                const ok1 = k === 1 || k === 2 ? iR : iL, ok2 = k >= 2 ? jU : jD;
                const ou = (k === 1 || k === 2 ? 1 : -1) * su_, ov = (k >= 2 ? 1 : -1) * sv_;
                const s1 = ok1 && data[f + ou] !== 0 ? 1 : 0;
                const s2 = ok2 && data[f + ov] !== 0 ? 1 : 0;
                const cc = ok1 && ok2 && data[f + ou + ov] !== 0 ? 1 : 0;
                const val = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
                ao |= val << (k * 2);
              }
            }
            maskC[m] = c;
            maskA[m] = ao;
            if (jitter) { p[a] = sl; p[u] = i; p[v] = j; maskJ[m] = (vhash(p[0], p[1], p[2], seed) - 0.5) * 2 * jitter; } else maskJ[m] = 0;
            any = true;
          }
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
  void solid; void q;

  function emit(a, u, v, s, sl, i, j, w, h, c, ao, jit) {
    if (vcount + 4 > cap) grow();
    const plane = s > 0 ? sl + 1 : sl;
    cu[0] = i; cv[0] = j; cu[1] = i + w; cv[1] = j; cu[2] = i + w; cv[2] = j + h; cu[3] = i; cv[3] = j + h;
    const n0 = a === 0 ? s : 0, n1 = a === 1 ? s : 0, n2 = a === 2 ? s : 0;
    const fl = c & FLAGS;
    const r = LIN[(c >> 16) & 255], g = LIN[(c >> 8) & 255], b = LIN[c & 255];
    const tint = 1 + jit;
    const em = fl & EMIT ? 1 : fl & GLASS ? 0.5 : 0;
    const base = vcount;
    for (let k = 0; k < 4; k++) {
      pt[a] = plane;
      pt[u] = cu[k];
      pt[v] = cv[k];
      const o3 = vcount * 3, o4 = vcount * 4;
      pos[o3] = (pt[0] - ox) * size; pos[o3 + 1] = (pt[1] - oy) * size; pos[o3 + 2] = (pt[2] - oz) * size;
      nor[o3] = n0; nor[o3 + 1] = n1; nor[o3 + 2] = n2;
      const aov = (ao >> (k * 2)) & 3;
      aos[k] = aov;
      const lit = em ? 1 : 1 - (1 - AO[aov]) * aoK;
      col[o4] = r * lit * tint; col[o4 + 1] = g * lit * tint; col[o4 + 2] = b * lit * tint; col[o4 + 3] = em;
      vcount++;
    }
    // flip the diagonal so AO gradients don't crease
    const tri = aos[0] + aos[2] < aos[1] + aos[3] ? TRI_B : TRI_A;
    if (s < 0) for (let t = 5; t >= 0; t--) idx[nIdx++] = base + tri[t];
    else for (let t = 0; t < 6; t++) idx[nIdx++] = base + tri[t];
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, vcount * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor.slice(0, vcount * 3), 3));
  g.setAttribute('color4', new THREE.BufferAttribute(col.slice(0, vcount * 4), 4));
  g.setIndex(vcount > 65535 ? new THREE.BufferAttribute(idx.slice(0, nIdx), 1) : new THREE.BufferAttribute(Uint16Array.from(idx.subarray(0, nIdx)), 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  g.userData.faces = nIdx / 6;
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
