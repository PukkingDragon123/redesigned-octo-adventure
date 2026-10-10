// A fast mesher for the pumpkin being carved (src/game/carve3d.js): the volume is cut
// into 12-voxel chunks and only the chunks a cut touched are rebuilt, each in a fraction
// of a millisecond (a visit per voxel, then work per exposed face: colour, ambient
// occlusion from the whole volume, so there are no seams between chunks). No greedy
// merging: the chunks are small and a carving changes every frame. The vertices are the
// same as mesh.js makes (position in voxel units, normal, colour x AO + glow in alpha,
// pixel detail coords), so the world's voxel material draws them.
//
// With air (carve3d.insideAir) given, the faces that look into the hollow or into a cut
// right through go into a second geometry, all glowing (the candle's light in the finale).
import * as THREE from 'three';
import { EMIT } from '../voxel/vox.js';
import { detailOf } from '../voxel/mesh.js';
import { W, H, D, KIND, K } from './carve3d.js';

export const CH = 12;
export const CW = Math.ceil(W / CH), CHH = Math.ceil(H / CH), CD = Math.ceil(D / CH);
export const CHUNKS = CW * CHH * CD;
export const chunkOf = (x, y, z) => Math.floor(x / CH) + CW * (Math.floor(y / CH) + CHH * Math.floor(z / CH));

const LIN = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const AO = [0.48, 0.66, 0.83, 1.0];
const GLOW = { [K.SKIN]: 0xe8862a, [K.FLESH]: 0xffb43c, [K.STEM]: 0x8a7a3a, [K.GOO]: 0xf0a040, [K.SEED]: 0xfff0c8 };

// a growable set of output arrays (reused between chunks: no garbage per rebuild)
class Out {
  constructor() { this.cap = 0; this.grow(2048); this.n = 0; }
  grow(cap) {
    const g = (A, k, old) => { const a = new A(cap * k); if (old) a.set(old); return a; };
    this.pos = g(Float32Array, 3, this.pos); this.nor = g(Int8Array, 3, this.nor);
    this.col = g(Float32Array, 4, this.col); this.det = g(Int16Array, 4, this.det);
    this.cap = cap;
  }
  geometry(box) {
    const n = this.n;
    if (!n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nor.slice(0, n * 3), 3, true));
    g.setAttribute('color4', new THREE.BufferAttribute(this.col.slice(0, n * 4), 4));
    g.setAttribute('detail', new THREE.BufferAttribute(this.det.slice(0, n * 4), 4));
    const q = n / 4, idx = new Uint16Array(q * 6), fl = this.flip;
    for (let f = 0; f < q; f++) {
      const b = f * 4, o = f * 6;
      if (fl[f]) { idx[o] = b + 1; idx[o + 1] = b + 2; idx[o + 2] = b + 3; idx[o + 3] = b + 1; idx[o + 4] = b + 3; idx[o + 5] = b; }
      else { idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3; }
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.boundingBox = box.clone();
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    g.userData.faces = q;
    return g;
  }
}
const OUT = [new Out(), new Out()];
for (const o of OUT) o.flip = new Uint8Array(4096);

// the six faces: normal axis a, sign s; in-plane axes u = a+1, v = a+2 (so u x v = +a)
const FACES = [];
for (let a = 0; a < 3; a++) for (const s of [-1, 1]) FACES.push({ a, s, u: (a + 1) % 3, v: (a + 2) % 3 });
const STRIDE = [1, W, W * H];
const DIM = [W, H, D];

// rebuild chunk c of pumpkin p: { geo, glow } (either may be null when it has no faces)
export function meshChunk(p, c, air = null) {
  const cx = c % CW, cy = Math.floor(c / CW) % CHH, cz = Math.floor(c / (CW * CHH));
  const x0 = cx * CH, y0 = cy * CH, z0 = cz * CH;
  const x1 = Math.min(W, x0 + CH), y1 = Math.min(H, y0 + CH), z1 = Math.min(D, z0 + CH);
  const col = p.col, kind = p.kind;
  OUT[0].n = OUT[1].n = 0;
  const P = [0, 0, 0];
  for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = x + W * (y + H * z);
    const k = kind[i];
    if (!k) continue;
    P[0] = x; P[1] = y; P[2] = z;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], a = F.a, s = F.s;
      const na = P[a] + s;
      let j = -1;
      if (na >= 0 && na < DIM[a]) { j = i + s * STRIDE[a]; if (kind[j]) continue; }
      const glow = air !== null && j >= 0 && air[j] === 1;
      emit(OUT[glow ? 1 : 0], P, F, glow ? GLOW[k & KIND] || GLOW[K.FLESH] : col[i], glow, kind, j);
    }
  }
  const box = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  return { geo: OUT[0].geometry(box), glow: air ? OUT[1].geometry(box) : null };
}

const Q = [0, 0, 0], AOS = [0, 0, 0, 0], NB = new Uint8Array(9);
const CU = [0, 1, 1, 0], CV = [0, 0, 1, 1];
// fi: the cell in front of the face (-1: outside the volume)
function emit(o, P, F, c, glow, kind, fi) {
  if ((o.n + 4) > o.cap) o.grow(o.cap * 2);
  const q = o.n >> 2;
  if (q >= o.flip.length) { const nf = new Uint8Array(o.flip.length * 2); nf.set(o.flip); o.flip = nf; }
  const { a, s, u, v } = F;
  // the front cell's eight neighbours in the face's plane (for AO): NB[(du+1) + 3 (dv+1)]
  NB.fill(0);
  if (fi >= 0) {
    const pu = P[u], pv = P[v], su = STRIDE[u], sv = STRIDE[v], mu = DIM[u] - 1, mv = DIM[v] - 1;
    for (let dv = -1; dv <= 1; dv++) {
      if (pv + dv < 0 || pv + dv > mv) continue;
      for (let du = -1; du <= 1; du++) {
        if ((du | dv) === 0 || pu + du < 0 || pu + du > mu) continue;
        NB[du + 1 + (dv + 1) * 3] = kind[fi + du * su + dv * sv] !== 0 ? 1 : 0;
      }
    }
  }
  const em = glow || c & EMIT ? 1 : 0;
  const r = LIN[(c >> 16) & 255], g = LIN[(c >> 8) & 255], b = LIN[c & 255];
  const did = glow ? 0 : detailOf(c);
  const fu = a === 0 ? 2 : 0, fv = a === 1 ? 2 : 1;
  const plane = s > 0 ? P[a] + 1 : P[a];
  // corners counter-clockwise seen from outside: (0,0) (1,0) (1,1) (0,1) for +a, reversed for -a
  for (let k = 0; k < 4; k++) {
    const kk = s > 0 ? k : (4 - k) & 3;
    const du = CU[kk], dv = CV[kk];
    const xu = du ? 2 : 0, xv = dv ? 6 : 0;
    const s1 = NB[xu + 3], s2 = NB[1 + xv], cc = NB[xu + xv];
    const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + cc);
    AOS[k] = ao;
    Q[a] = plane; Q[u] = P[u] + du; Q[v] = P[v] + dv;
    const vi = o.n + k, o3 = vi * 3, o4 = vi * 4;
    o.pos[o3] = Q[0]; o.pos[o3 + 1] = Q[1]; o.pos[o3 + 2] = Q[2];
    o.nor[o3] = a === 0 ? s * 127 : 0; o.nor[o3 + 1] = a === 1 ? s * 127 : 0; o.nor[o3 + 2] = a === 2 ? s * 127 : 0;
    const lit = em ? 1 : AO[ao];
    o.col[o4] = r * lit; o.col[o4 + 1] = g * lit; o.col[o4 + 2] = b * lit; o.col[o4 + 3] = em;
    o.det[o4] = Q[fu]; o.det[o4 + 1] = Q[fv]; o.det[o4 + 2] = did; o.det[o4 + 3] = a;
  }
  // flip the diagonal so the AO doesn't crease
  o.flip[q] = AOS[0] + AOS[2] < AOS[1] + AOS[3] ? 1 : 0;
  o.n += 4;
}

// count the exposed faces of the whole volume (a check for the chunked meshes)
export function countFaces(p) {
  let n = 0;
  const kind = p.kind;
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = x + W * (y + H * z);
    if (!kind[i]) continue;
    if (x === 0 || !kind[i - 1]) n++;
    if (x === W - 1 || !kind[i + 1]) n++;
    if (y === 0 || !kind[i - W]) n++;
    if (y === H - 1 || !kind[i + W]) n++;
    if (z === 0 || !kind[i - W * H]) n++;
    if (z === D - 1 || !kind[i + W * H]) n++;
  }
  return n;
}
// the chunks a change at (x, y, z) dirties (its own, and any it touches: faces and AO)
export function dirtyAround(x, y, z, set) {
  const ax = Math.max(0, Math.floor((x - 1) / CH)), bx = Math.min(CW - 1, Math.floor((x + 1) / CH));
  const ay = Math.max(0, Math.floor((y - 1) / CH)), by = Math.min(CHH - 1, Math.floor((y + 1) / CH));
  const az = Math.max(0, Math.floor((z - 1) / CH)), bz = Math.min(CD - 1, Math.floor((z + 1) / CH));
  for (let cz = az; cz <= bz; cz++) for (let cy = ay; cy <= by; cy++) for (let cx = ax; cx <= bx; cx++) set.add(cx + CW * (cy + CHH * cz));
}
