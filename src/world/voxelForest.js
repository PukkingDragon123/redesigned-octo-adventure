// The forest as chunky voxel trees: a handful of seeded models per species,
// instanced. Trees near the player use the detailed models (with wind sway and
// shadows); further out the cheap LOD1 models; beyond that fog takes over.
// Instance pools are refilled as the player moves, so draw calls stay at
// (species x variants x 2).
import * as THREE from 'three';
import { buildTree } from '../voxel/models/trees.js';
import { meshVox } from '../voxel/mesh.js';
import { createVoxelMaterial } from '../render/voxelMaterial.js';
import { WORLD_HALF as HALF } from './layout.js';

const SEEDS = { bushRed: 3, bushOrange: 3, fern: 3, dead: 3 };
const DEFAULT_SEEDS = 4;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class VoxelForest {
  constructor(forest, { near = 52, chunkDist = 100 } = {}) {
    this.forest = forest;
    this.near = near;
    this.chunkDist = chunkDist;
    this.hidden = new Set();
    this.group = new THREE.Group();
    this.group.name = 'voxel-forest';
    this.models = new Map(); // `${species}:${seed}` -> { lod0, lod1, meta }
    this.pools = [];
    this.last = new THREE.Vector3(1e9, 0, 1e9);
    this.lodScale = 1;
  }

  // build models lazily per species; returns a promise that yields between species
  async build(onProgress) {
    const trees = this.forest.trees;
    const species = [...new Set(trees.map((t) => t.species))];
    let i = 0;
    for (const sp of species) {
      const n = SEEDS[sp] ?? DEFAULT_SEEDS;
      const mat0 = createVoxelMaterial({ sway: sp.startsWith('bush') || sp === 'fern' ? 0.05 : 0.016 });
      const mat1 = createVoxelMaterial();
      for (let seed = 0; seed < n; seed++) {
        const r0 = buildTree(sp, { seed, lod: 0 });
        const r1 = buildTree(sp, { seed, lod: 1 });
        const g0 = meshVox(r0.vox, { size: r0.size, origin: r0.origin, greedy: true });
        const g1 = meshVox(r1.vox, { size: r1.size, origin: r1.origin, greedy: true });
        mat0.uniforms.uSwayY0.value = r0.meta.swayY0 ?? 1;
        this.models.set(`${sp}:${seed}`, { sp, seed, g0, g1, meta: r0.meta, mat0, mat1 });
      }
      i++;
      onProgress?.(i / species.length);
      await new Promise((r) => setTimeout(r, 0));
    }
    // assign every tree a model + transform
    const counts = new Map();
    for (const t of trees) {
      const n = SEEDS[t.species] ?? DEFAULT_SEEDS;
      const h = hash(t.x, t.z);
      t.vseed = Math.floor(h * n) % n;
      const key = `${t.species}:${t.vseed}`;
      const M = this.models.get(key);
      if (!M) continue;
      t.vkey = key;
      const H = t.bush ? M.meta.height * (0.85 + hash(t.z, t.x) * 0.3) : t.H;
      t.vscale = Math.max(0.6, Math.min(1.45, H / Math.max(0.5, M.meta.height)));
      t.vyaw = hash(t.x * 1.7, t.z * 0.3) * Math.PI * 2;
      t.chunk = `${Math.floor((t.x + HALF) / 64)},${Math.floor((t.z + HALF) / 64)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    // instance pools (capacity = all trees of that model; we only draw a subset)
    for (const [key, M] of this.models) {
      const cap = counts.get(key) || 0;
      if (!cap) continue;
      const near = new THREE.InstancedMesh(M.g0, M.mat0, Math.min(cap, 900));
      near.castShadow = true;
      near.receiveShadow = true;
      near.customDepthMaterial = M.mat0.userData.depth;
      near.frustumCulled = false;
      near.count = 0;
      const far = new THREE.InstancedMesh(M.g1, M.mat1, cap);
      far.castShadow = false;
      far.receiveShadow = true;
      far.frustumCulled = false;
      far.count = 0;
      this.group.add(near, far);
      this.pools.push({ key, near, far });
    }
    this.byKey = new Map(this.pools.map((p) => [p.key, p]));
    return this.group;
  }

  // Chunks near the player swap their pixel-foliage trees for voxel trees
  // (detailed close up, LOD1 further out); far chunks keep the old forest.
  update(focus) {
    if (!this.byKey) return;
    const dx = focus.x - this.last.x, dz = focus.z - this.last.z;
    if (dx * dx + dz * dz < 36) return;
    this.last.set(focus.x, 0, focus.z);
    const cd = this.chunkDist * this.lodScale;
    this.hidden.clear();
    for (const c of this.forest.chunks) {
      const cc = c.userData.center;
      if (Math.hypot(cc.x - focus.x, cc.z - focus.z) < cd) this.hidden.add(c.userData.key);
    }
    this.forest.hiddenChunks = this.hidden;
    const n2 = (this.near * this.lodScale) ** 2;
    for (const p of this.pools) { p.near.count = 0; p.far.count = 0; }
    for (const t of this.forest.trees) {
      if (!t.vkey || !this.hidden.has(t.chunk)) continue;
      const ex = t.x - focus.x, ez = t.z - focus.z;
      const P = this.byKey.get(t.vkey);
      let im = ex * ex + ez * ez < n2 ? P.near : P.far;
      if (im.count >= im.instanceMatrix.count) im = P.far;
      if (im.count >= im.instanceMatrix.count) continue;
      _q.setFromAxisAngle(UP, t.vyaw);
      _s.setScalar(t.vscale);
      _m.compose(_p.set(t.x, t.y, t.z), _q, _s);
      im.setMatrixAt(im.count++, _m);
    }
    for (const p of this.pools) {
      p.near.instanceMatrix.needsUpdate = true;
      p.far.instanceMatrix.needsUpdate = true;
      p.near.visible = p.near.count > 0;
      p.far.visible = p.far.count > 0;
    }
  }
}

function hash(x, z) {
  let h = Math.imul(Math.floor(x * 73.1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(z * 41.7), 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
