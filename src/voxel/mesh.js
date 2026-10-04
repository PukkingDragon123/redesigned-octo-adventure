// Voxel -> BufferGeometry: exposed faces only, per-vertex ambient occlusion,
// optional greedy merging of equal faces (big flat walls become a few quads).
//
// The volume is first packed into 32-voxel occupancy words along x, so finding exposed faces
// costs a few bit operations per 32 voxels; after that all the work is per exposed face (colour,
// AO, greedy merge), never per voxel. That keeps big high-resolution buildings cheap to mesh.
import * as THREE from 'three';
import { FLAGS, EMIT, GLASS, UNLIT, vhash } from './vox.js';

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
const AO = [0.48, 0.66, 0.83, 1.0];

// Surface detail id per colour (see DETAIL in render/voxelMaterial.js): the shader paints a small
// pixel-art pattern over each face. 0 none (glass, glow), 1 dither, 2 wood, 3 brick, 4 stone,
// 5 paint, 6 foliage, 7 fabric, 8 metal. Cached per colour.
const MAT_CACHE = new Map();
export function detailOf(c) {
  let id = MAT_CACHE.get(c);
  if (id !== undefined) return id;
  id = classify(c);
  if (MAT_CACHE.size < 8192) MAT_CACHE.set(c, id);
  return id;
}
function classify(c) {
  if (c & FLAGS) return 0;
  const r = ((c >> 16) & 255) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  const sat = mx > 0 ? d / mx : 0;
  let hue = 0;
  if (d > 0) {
    if (mx === r) hue = ((g - b) / d + 6) % 6;
    else if (mx === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
  }
  if (mx < 0.2) return 8; // near-black: iron, dark metal
  if (sat < 0.16) {
    if (mx > 0.82) return 5; // white paint, trim
    return mx < 0.36 ? 8 : 4; // greys: dark metal / stone
  }
  if (hue >= 14 && hue < 48 && sat > 0.25 && mx < 0.78) return 2; // browns: wood
  if ((hue < 14 || hue >= 340) && sat > 0.4 && mx < 0.8) return 3; // brick reds
  if (hue >= 48 && hue < 75 && sat > 0.3 && mx > 0.6) return 7; // straw, hay, cloth yellows
  if (hue >= 70 && hue < 165 && mx < 0.7) return 6; // greens: leaves, moss
  if (sat > 0.5) return 7; // saturated colour: cloth, paint
  if (mx > 0.75) return 5; // pale colours: painted wood
  return 1;
}
// face axes: a = normal axis; (u, v) = the in-plane axes the quads are laid out on. For y the
// pair is (x, z) so faces come out of the scan already sorted row by row (flip marks the swapped
// handedness, which reverses the winding).
const AX = [
  { a: 0, u: 1, v: 2, flip: 1 },
  { a: 1, u: 0, v: 2, flip: -1 },
  { a: 2, u: 0, v: 1, flip: 1 },
];

// opts: size (m per voxel), origin [x,y,z] in voxel units (the pivot), greedy, jitter, seed, aoStrength, compact,
// ao (false: no ambient occlusion at all, so thin things like fences merge into far fewer quads)
export function meshVox(vox, opts = {}) {
  const size = opts.size ?? 0.05;
  const [ox, oy, oz] = opts.origin ?? [vox.w / 2, 0, vox.d / 2];
  const jitter = opts.jitter ?? 0;
  const greedy = opts.greedy ?? jitter === 0;
  const seed = opts.seed ?? 0;
  const aoK = opts.aoStrength ?? 1;
  const aoOn = opts.ao !== false;
  // compact: small integer vertex formats (needs a whole-voxel origin); see the output below
  const compact = !!opts.compact && (opts.origin ?? [0, 0, 0]).every((v) => Number.isInteger(v));
  const W = vox.w, H = vox.h, D = vox.d;
  const dims = [W, H, D];
  const data = vox.data || null;

  // ---- occupancy bits: word (z, y, k) holds x = 32k .. 32k+31
  // (sparse volumes - see VB in models/buildings.js - provide get() and occRow() instead of data)
  const WW = (W + 31) >> 5;
  const rows = H * D;
  const occ = new Int32Array(rows * WW + WW); // + one zero row of slack
  if (data) {
    for (let r = 0, id = 0; r < rows; r++) {
      const ob = r * WW;
      for (let k = 0; k < WW; k++) {
        const xe = Math.min(32, W - (k << 5));
        let word = 0;
        for (let b = 0; b < xe; b++, id++) if (data[id] !== 0) word |= 1 << b;
        occ[ob + k] = word;
      }
    }
  } else {
    for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) vox.occRow(y, z, occ, (z * H + y) * WW);
  }
  // colours come from the volume; occupancy (for AO) from the bits
  const at = data ? (x, y, z) => data[x + W * (y + H * z)] : vox.colorAt ? vox.colorAt() : (x, y, z) => vox.get(x, y, z);
  const bit = (x, y, z) => (occ[(z * H + y) * WW + (x >> 5)] >>> (x & 31)) & 1;

  // ---- collect exposed faces per direction (packed x | y << BX | z << BXY, in scan order: z, y, x)
  const BX = 32 - Math.clz32(W), BY = 32 - Math.clz32(H), BXY = BX + BY;
  if (BXY + (32 - Math.clz32(D)) > 32) throw new Error(`meshVox: volume too big ${W}x${H}x${D}`);
  const MX = (1 << BX) - 1, MY = (1 << BY) - 1;
  // dir index = axis * 2 + (s > 0 ? 1 : 0)
  const lists = [], counts = [0, 0, 0, 0, 0, 0];
  for (let d = 0; d < 6; d++) lists.push(new Uint32Array(1024));
  const push = (d, id) => {
    let L = lists[d];
    const n = counts[d];
    if (n >= L.length) { const nl = new Uint32Array(L.length * 2); nl.set(L); lists[d] = L = nl; }
    L[n] = id;
    counts[d] = n + 1;
  };
  const zero = 0;
  function scan(d, bits, x0) {
    while (bits !== 0) {
      const t = bits & -bits;
      bits ^= t;
      push(d, x0 | (31 - Math.clz32(t)));
    }
  }
  for (let z = 0; z < D; z++) {
    for (let y = 0; y < H; y++) {
      const r = z * H + y, ob = r * WW;
      const obUp = y + 1 < H ? ob + WW : -1, obDn = y > 0 ? ob - WW : -1;
      const obFw = z + 1 < D ? ob + H * WW : -1, obBk = z > 0 ? ob - H * WW : -1;
      const rowId = (y << BX) | (z << BXY);
      for (let k = 0; k < WW; k++) {
        const o = occ[ob + k];
        if (o === 0) continue;
        const nxt = k + 1 < WW ? occ[ob + k + 1] : zero, prv = k > 0 ? occ[ob + k - 1] : zero;
        const x0 = rowId | (k << 5);
        scan(0, o & ~((o << 1) | (prv >>> 31)), x0); // -x
        scan(1, o & ~((o >>> 1) | (nxt << 31)), x0); // +x
        scan(2, o & ~(obDn >= 0 ? occ[obDn + k] : 0), x0); // -y
        scan(3, o & ~(obUp >= 0 ? occ[obUp + k] : 0), x0); // +y
        scan(4, o & ~(obBk >= 0 ? occ[obBk + k] : 0), x0); // -z
        scan(5, o & ~(obFw >= 0 ? occ[obFw + k] : 0), x0); // +z
      }
    }
  }

  // ---- output buffers grow by doubling (no per-face garbage)
  let cap = 4096;
  let pos = new Float32Array(cap * 3), nor = new Float32Array(cap * 3), col = new Float32Array(cap * 4), idx = new Uint32Array(cap * 1.5);
  // face-local detail coords: (u, v) in voxels on the face (v up on side faces) + detail id
  let fuv = new Int16Array(cap * 4);
  let nIdx = 0, vcount = 0;
  const grow = () => {
    cap *= 2;
    const g3 = (arr, k) => { const n = new Float32Array(cap * k); n.set(arr); return n; };
    pos = g3(pos, 3); nor = g3(nor, 3); col = g3(col, 4);
    const nf = new Int16Array(cap * 4); nf.set(fuv); fuv = nf;
    const ni = new Uint32Array(cap * 1.5); ni.set(idx); idx = ni;
  };
  const aos = [0, 0, 0, 0], cu = [0, 0, 0, 0], cv = [0, 0, 0, 0], pt = [0, 0, 0];
  const TRI_A = [0, 1, 2, 0, 2, 3], TRI_B = [1, 2, 3, 1, 3, 0];

  let maxMask = 0;
  for (const A of AX) maxMask = Math.max(maxMask, dims[A.u] * dims[A.v]);
  const maskC = new Uint32Array(maxMask);
  const maskA = new Uint8Array(maxMask);
  const maskJ = jitter ? new Float32Array(maxMask) : null;
  const ms = new Uint32Array(maxMask); // the current slice's mask cells, in order
  let sorted = new Uint32Array(1024);

  for (let d = 0; d < 6; d++) {
    const n = counts[d];
    if (!n) continue;
    const A = AX[d >> 1], a = A.a, u = A.u, v = A.v;
    const s = d & 1 ? 1 : -1;
    const da = dims[a], du = dims[u], dv = dims[v];
    let L = lists[d];
    // stable counting sort by slice (z faces already come out in slice order)
    if (a !== 2) {
      const cnt = new Uint32Array(da + 1);
      for (let q = 0; q < n; q++) cnt[sliceOf(L[q], a) + 1]++;
      for (let q = 0; q < da; q++) cnt[q + 1] += cnt[q];
      if (sorted.length < n) sorted = new Uint32Array(n);
      for (let q = 0; q < n; q++) sorted[cnt[sliceOf(L[q], a)]++] = L[q];
      L = sorted;
    }
    let q = 0;
    while (q < n) {
      const sl = sliceOf(L[q], a);
      let qe = q;
      while (qe < n && sliceOf(L[qe], a) === sl) qe++;
      const front = sl + s >= 0 && sl + s < da;
      // fill the mask for this slice
      let nm = 0;
      for (let e = q; e < qe; e++) {
        const id = L[e];
        const x = id & MX, y = (id >>> BX) & MY, z = id >>> BXY;
        const i = u === 0 ? x : y, j = v === 2 ? z : y;
        const m = i + j * du;
        maskC[m] = at(x, y, z);
        let ao = 0xff;
        if (front && aoOn) {
          ao = 0;
          // the 8 cells around the one in front of the face, in its (u, v) plane
          const fx = x + (a === 0 ? s : 0), fy = y + (a === 1 ? s : 0), fz = z + (a === 2 ? s : 0);
          const iL = i > 0, iR = i < du - 1, jD = j > 0, jU = j < dv - 1;
          let nL = 0, nR = 0, nD = 0, nU = 0, nLD = 0, nRD = 0, nLU = 0, nRU = 0;
          if (u === 0) { // u = x
            if (iL) nL = bit(fx - 1, fy, fz);
            if (iR) nR = bit(fx + 1, fy, fz);
          } else { // u = y
            if (iL) nL = bit(fx, fy - 1, fz);
            if (iR) nR = bit(fx, fy + 1, fz);
          }
          const ux = u === 0 ? 1 : 0, uy = 1 - ux, vy = v === 1 ? 1 : 0, vz = 1 - vy;
          if (jD) {
            nD = bit(fx, fy - vy, fz - vz);
            if (iL) nLD = bit(fx - ux, fy - uy - vy, fz - vz);
            if (iR) nRD = bit(fx + ux, fy + uy - vy, fz - vz);
          }
          if (jU) {
            nU = bit(fx, fy + vy, fz + vz);
            if (iL) nLU = bit(fx - ux, fy - uy + vy, fz + vz);
            if (iR) nRU = bit(fx + ux, fy + uy + vy, fz + vz);
          }
          // corners: 0 = (-u,-v), 1 = (+u,-v), 2 = (+u,+v), 3 = (-u,+v)
          const c0 = nL && nD ? 0 : 3 - (nL + nD + nLD), c1 = nR && nD ? 0 : 3 - (nR + nD + nRD);
          const c2 = nR && nU ? 0 : 3 - (nR + nU + nRU), c3 = nL && nU ? 0 : 3 - (nL + nU + nLU);
          ao = c0 | (c1 << 2) | (c2 << 4) | (c3 << 6);
        }
        maskA[m] = ao;
        if (maskJ) { pt[0] = x; pt[1] = y; pt[2] = z; maskJ[m] = (vhash(pt[0], pt[1], pt[2], seed) - 0.5) * 2 * jitter; }
        ms[nm++] = m;
      }
      // greedy merge, walking the faces row by row
      for (let e = 0; e < nm; e++) {
        const m = ms[e];
        const c = maskC[m];
        if (!c) continue;
        const ao = maskA[m];
        const i = m % du, j = (m - i) / du;
        let w = 1, h = 1;
        if (greedy) {
          while (i + w < du && maskC[m + w] === c && maskA[m + w] === ao) w++;
          outer: for (; j + h < dv; h++) {
            const row = m + h * du;
            for (let k = 0; k < w; k++) if (maskC[row + k] !== c || maskA[row + k] !== ao) break outer;
          }
        }
        emit(a, u, v, s * A.flip, s, sl, i, j, w, h, c, ao, maskJ ? maskJ[m] : 0);
        for (let jj = 0; jj < h; jj++) { const row = m + jj * du; for (let ii = 0; ii < w; ii++) maskC[row + ii] = 0; }
      }
      q = qe;
    }
  }

  function sliceOf(id, a) {
    if (a === 0) return id & MX;
    if (a === 1) return (id >>> BX) & MY;
    return id >>> BXY;
  }

  function emit(a, u, v, wind, s, sl, i, j, w, h, c, ao, jit) {
    if (vcount + 4 > cap) grow();
    const plane = s > 0 ? sl + 1 : sl;
    cu[0] = i; cv[0] = j; cu[1] = i + w; cv[1] = j; cu[2] = i + w; cv[2] = j + h; cu[3] = i; cv[3] = j + h;
    const n0 = a === 0 ? s : 0, n1 = a === 1 ? s : 0, n2 = a === 2 ? s : 0;
    const fl = c & FLAGS;
    const r = LIN[(c >> 16) & 255], g = LIN[(c >> 8) & 255], b = LIN[c & 255];
    const tint = 1 + jit;
    const em = fl & EMIT ? 1 : fl & GLASS ? (fl & UNLIT ? 0.375 : 0.5) : 0;
    const did = detailOf(c);
    // side faces: u = the horizontal in-plane axis, v = y; top/bottom: (x, z)
    const fu = a === 0 ? 2 : 0, fv = a === 1 ? 2 : 1;
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
      fuv[o4] = pt[fu]; fuv[o4 + 1] = pt[fv]; fuv[o4 + 2] = did; fuv[o4 + 3] = a;
      vcount++;
    }
    // flip the diagonal so AO gradients don't crease
    const tri = aos[0] + aos[2] < aos[1] + aos[3] ? TRI_B : TRI_A;
    if (wind < 0) for (let t = 5; t >= 0; t--) idx[nIdx++] = base + tri[t];
    else for (let t = 0; t < 6; t++) idx[nIdx++] = base + tri[t];
  }

  const g = new THREE.BufferGeometry();
  if (compact) {
    // 17 bytes a vertex instead of 40: grid positions as Int16 (the mesh gets scale = size),
    // axis normals as normalized Int8, colours as normalized Uint16
    const P16 = new Int16Array(vcount * 3), N8 = new Int8Array(vcount * 3), C16 = new Uint16Array(vcount * 4);
    for (let i = 0; i < vcount * 3; i++) { P16[i] = Math.round(pos[i] / size); N8[i] = nor[i] * 127; }
    for (let i = 0; i < vcount * 4; i++) C16[i] = Math.round(Math.min(1, col[i]) * 65535);
    g.setAttribute('position', new THREE.BufferAttribute(P16, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N8, 3, true));
    g.setAttribute('color4', new THREE.BufferAttribute(C16, 4, true));
    g.userData.scale = size;
  } else {
    g.setAttribute('position', new THREE.BufferAttribute(pos.slice(0, vcount * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor.slice(0, vcount * 3), 3));
    g.setAttribute('color4', new THREE.BufferAttribute(col.slice(0, vcount * 4), 4));
  }
  g.setAttribute('detail', new THREE.BufferAttribute(fuv.slice(0, vcount * 4), 4));
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
