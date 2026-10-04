// Posed voxel creatures, drawn instanced. A species is a handful of voxel parts
// (body, head, legs, wings, tail...) merged into one geometry where every vertex
// knows its part ("bone"). The game poses each creature's bones on the CPU
// (game/critterAnim.js) and writes one 3x4 world matrix per bone into a small
// float texture, a row per creature; one draw then renders every creature of
// the species, whatever their poses (plus one more for the shadow map).
import * as THREE from 'three';
import { meshVox } from '../voxel/mesh.js';
import { createVoxelMaterial } from './voxelMaterial.js';

// Pose buffer (per bone, 9 floats): offset from the rest pivot (tx, ty, tz, metres),
// rotation (rx, ry, rz; applied as Ry * Rx * Rz) and scale (sx, sy, sz).
export const PS = 9;
// Matrix buffer (per bone, 12 floats): a row-major 3x4 affine matrix in "animal space"
// (origin on the ground under the creature, +z its front).
export const MS = 12;

export class RigSpecies {
  // def: { size, bones: [{ name, parent (index | -1), at: [x, y, z] voxels, part: { vox, origin } | null }] }
  // (greedy-meshed by default: the models paint their own colour variation, and half the triangles matter on phones)
  constructor(name, def, { max = 16, shadow = true, jitter = 0 } = {}) {
    this.name = name;
    this.def = def;
    const B = def.bones;
    const nb = (this.nb = B.length);
    this.parent = new Int8Array(nb);
    this.rest = new Float32Array(nb * 3);
    this.slot = new Int16Array(nb).fill(-1);
    this.index = {};
    let ns = 0;
    B.forEach((b, i) => {
      this.parent[i] = b.parent;
      this.rest[i * 3] = b.at[0] * def.size;
      this.rest[i * 3 + 1] = b.at[1] * def.size;
      this.rest[i * 3 + 2] = b.at[2] * def.size;
      this.index[b.name] = i;
      if (b.part) this.slot[i] = ns++;
    });
    this.ns = ns;
    this.max = max;
    this.geometry = mergeParts(B, def.size, jitter, name.length);
    this.faces = this.geometry.userData.faces;
    // texel 0: per-creature params (x = fade), then three texels per posed part
    this.stride = (1 + ns * 3) * 4;
    this.data = new Float32Array(this.stride * max);
    this.tex = new THREE.DataTexture(this.data, 1 + ns * 3, max, THREE.RGBAFormat, THREE.FloatType);
    this.tex.magFilter = this.tex.minFilter = THREE.NearestFilter;
    this.tex.generateMipmaps = false;
    this.tex.needsUpdate = true;
    this.material = createVoxelMaterial({ rig: this.tex });
    const ig = new THREE.InstancedBufferGeometry();
    for (const k in this.geometry.attributes) ig.setAttribute(k, this.geometry.attributes[k]);
    ig.setIndex(this.geometry.index);
    ig.instanceCount = 0;
    this.mesh = new THREE.Mesh(ig, this.material);
    this.mesh.frustumCulled = false; // creatures are culled one by one before they get a row
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = this.material.userData.depth;
    this.mesh.visible = false;
    this.mesh.name = `critters:${name}`;
    this.n = 0;
  }
  begin() {
    this.n = 0;
  }
  // add one creature: animal-space bone matrices M, placed at (x, y, z) facing yaw, scaled
  push(M, x, y, z, yaw, scale, fade) {
    if (this.n >= this.max) return;
    const D = this.data, slot = this.slot;
    let o = this.n++ * this.stride;
    D[o] = fade;
    D[o + 1] = D[o + 2] = D[o + 3] = 0;
    const c = Math.cos(yaw) * scale, s = Math.sin(yaw) * scale;
    for (let b = 0; b < this.nb; b++) {
      if (slot[b] < 0) continue;
      const m = b * MS, q = o + 4 + slot[b] * 12;
      // Root (T * Ry * S) times the animal-space matrix
      for (let k = 0; k < 4; k++) {
        const a0 = M[m + k], a1 = M[m + 4 + k], a2 = M[m + 8 + k];
        D[q + k] = c * a0 + s * a2;
        D[q + 4 + k] = scale * a1;
        D[q + 8 + k] = -s * a0 + c * a2;
      }
      D[q + 3] += x;
      D[q + 7] += y;
      D[q + 11] += z;
    }
  }
  end() {
    const g = this.mesh.geometry;
    g.instanceCount = this.n;
    this.mesh.visible = this.n > 0;
    if (this.n) this.tex.needsUpdate = true;
  }
  dispose() {
    this.mesh.geometry.dispose();
    this.geometry.dispose();
    this.tex.dispose();
    this.material.dispose();
  }
}

// one geometry for all parts, each vertex tagged with its bone
function mergeParts(bones, size, jitter, seed) {
  const geos = [];
  bones.forEach((b, i) => {
    if (!b.part) return;
    const g = meshVox(b.part.vox, { size, origin: b.part.origin, jitter, seed: seed + i });
    geos.push({ g, bone: i });
  });
  let nv = 0, ni = 0, faces = 0;
  for (const { g } of geos) { nv += g.attributes.position.count; ni += g.index.count; faces += g.userData.faces; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 4), det = new Float32Array(nv * 4);
  const bone = new Uint8Array(nv);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let v0 = 0, i0 = 0;
  for (const { g, bone: b } of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, v0 * 3);
    nor.set(g.attributes.normal.array, v0 * 3);
    col.set(g.attributes.color4.array, v0 * 4);
    det.set(g.attributes.detail.array, v0 * 4);
    bone.fill(b, v0, v0 + n);
    const src = g.index.array;
    for (let k = 0; k < src.length; k++) idx[i0 + k] = src[k] + v0;
    v0 += n;
    i0 += src.length;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color4', new THREE.BufferAttribute(col, 4));
  geo.setAttribute('detail', new THREE.BufferAttribute(det, 4));
  geo.setAttribute('bone', new THREE.BufferAttribute(bone, 1));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.userData.faces = faces;
  return geo;
}

// ---------------------------------------------------------------- posing
// reset a pose buffer to the rest pose
export function restPose(P) {
  for (let o = 0; o < P.length; o += PS) {
    P[o] = P[o + 1] = P[o + 2] = P[o + 3] = P[o + 4] = P[o + 5] = 0;
    P[o + 6] = P[o + 7] = P[o + 8] = 1;
  }
}

// pose (local offsets, rotations, scales) -> animal-space matrices, parents first
export function composePose(sp, P, M) {
  const nb = sp.nb, par = sp.parent, R = sp.rest;
  for (let b = 0; b < nb; b++) {
    const o = b * PS;
    const rx = P[o + 3], ry = P[o + 4], rz = P[o + 5];
    const cx = Math.cos(rx), sx = Math.sin(rx), cy = Math.cos(ry), sy = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    const kx = P[o + 6], ky = P[o + 7], kz = P[o + 8];
    // R = Ry * Rx * Rz, columns scaled
    const l00 = (cy * cz + sy * sx * sz) * kx, l01 = (-cy * sz + sy * sx * cz) * ky, l02 = sy * cx * kz;
    const l10 = cx * sz * kx, l11 = cx * cz * ky, l12 = -sx * kz;
    const l20 = (-sy * cz + cy * sx * sz) * kx, l21 = (sy * sz + cy * sx * cz) * ky, l22 = cy * cx * kz;
    const t0 = R[b * 3] + P[o], t1 = R[b * 3 + 1] + P[o + 1], t2 = R[b * 3 + 2] + P[o + 2];
    const m = b * MS;
    const p = par[b];
    if (p < 0) {
      M[m] = l00; M[m + 1] = l01; M[m + 2] = l02; M[m + 3] = t0;
      M[m + 4] = l10; M[m + 5] = l11; M[m + 6] = l12; M[m + 7] = t1;
      M[m + 8] = l20; M[m + 9] = l21; M[m + 10] = l22; M[m + 11] = t2;
      continue;
    }
    const q = p * MS;
    for (let r = 0; r < 3; r++) {
      const a0 = M[q + r * 4], a1 = M[q + r * 4 + 1], a2 = M[q + r * 4 + 2], a3 = M[q + r * 4 + 3];
      M[m + r * 4] = a0 * l00 + a1 * l10 + a2 * l20;
      M[m + r * 4 + 1] = a0 * l01 + a1 * l11 + a2 * l21;
      M[m + r * 4 + 2] = a0 * l02 + a1 * l12 + a2 * l22;
      M[m + r * 4 + 3] = a0 * t0 + a1 * t1 + a2 * t2 + a3;
    }
  }
}
