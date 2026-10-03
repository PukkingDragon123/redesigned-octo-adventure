// The autumn forest: where every tree, bush and fern stands, their trunk
// colliders, and the extra undergrowth (stumps, fallen logs, mushrooms,
// saplings). All of it is drawn as voxel models by voxelForest.js.
import * as THREE from 'three';
import { RNG, Simplex } from '../core/noise.js';
import { smoothstep } from '../core/math.js';
import { SpatialHash } from '../core/spatial.js';
import * as L from './layout.js';
import { forestNoise, villageMask, riverInfo } from './terrain.js';

const CHUNK = 64;
const sxA = new Simplex(5150);
const sxB = new Simplex(6160);

// placement heights (m) and trunk shape per species
const TREE_SPECS = {
  spruce: { h: [9, 17], trunk: 'straight' },
  pine: { h: [10, 16], trunk: 'straight' },
  tamarack: { h: [8, 14], trunk: 'straight' },
  maple: { h: [7, 11.5], trunk: 'forked' },
  maple2: { h: [6.5, 10], trunk: 'forked' },
  oak: { h: [7, 10], trunk: 'forked' },
  birch: { h: [8, 13], trunk: 'straight' },
  aspen: { h: [8, 12.5], trunk: 'straight' },
  dead: { h: [5.5, 8], trunk: 'forked' },
};

// ---------------------------------------------------------------- placement
function buildingBlocked(x, z, margin) {
  for (const b of L.BUILDINGS) {
    const dx = x - b.x, dz = z - b.z;
    const c = Math.cos(b.facing || 0), s = Math.sin(b.facing || 0);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < b.w / 2 + margin && Math.abs(lz) < b.d / 2 + margin + (b.porch ? 3 : 0)) return true;
  }
  return false;
}

function clearingFactor(x, z) {
  let f = 1;
  const clear = (px, pz, r, soft = 10) => {
    const d = Math.hypot(x - px, z - pz);
    f = Math.min(f, smoothstep(r, r + soft, d));
  };
  const list = L['CLEARINGS'];
  if (list) {
    for (const c of list) clear(c.x, c.z, c.r, c.soft ?? 10);
    return f;
  }
  clear(L.POI.cabin.x, L.POI.cabin.z, 24, 14);
  clear(L.POI.garage.x + 6, L.POI.garage.z, 9, 6); // room in front of Harold's garage
  clear(L.POI.graveyard.x, L.POI.graveyard.z, 18, 8);
  clear(L.POI.lookout.x, L.POI.lookout.z, 11, 8);
  clear(L.POI.trapper.x, L.POI.trapper.z, 7, 6);
  clear(L.POI.meadow1.x, L.POI.meadow1.z, L.POI.meadow1.r * 0.6, 14);
  clear(L.POI.meadow2.x, L.POI.meadow2.z, L.POI.meadow2.r * 0.6, 12);
  clear(L.POI.sawmill.x, L.POI.sawmill.z, 14, 6);
  clear(L.POI.lighthouse.x, L.POI.lighthouse.z, 14, 6);
  return f;
}

// The lookout's vista: a wedge of open hillside falling away toward Maple Cove,
// so the bench actually looks out over something.
const VISTA_DIR = 1.0; // radians from +x toward +z
function vistaFactor(x, z) {
  const dx = x - L.POI.lookout.x, dz = z - L.POI.lookout.z;
  const d = Math.hypot(dx, dz);
  if (d < 4 || d > 125) return 1;
  let da = Math.atan2(dz, dx) - VISTA_DIR;
  da = Math.atan2(Math.sin(da), Math.cos(da));
  const inWedge = 1 - smoothstep(0.42, 0.62, Math.abs(da));
  const fall = d < 75 ? 1 : 1 - (d - 75) / 50;
  return 1 - inWedge * fall * 0.96;
}

function pickSpecies(x, z, h, river, rng) {
  const a = sxA.noise(x / 75, z / 75);
  const b = sxB.noise(x / 52 + 9, z / 52 - 3);
  const elev = smoothstep(18, 45, h);
  const wet = 1 - smoothstep(4, 30, river);
  const nearHome = 1 - smoothstep(30, 90, Math.hypot(x - L.POI.cabin.x, z - L.POI.cabin.z));
  const nearVillage = 1 - smoothstep(20, 80, Math.hypot(x - L.POI.village.x, z - L.POI.village.z));
  const w = {
    spruce: 0.22 + elev * 0.9 + (a < -0.25 ? 0.35 : 0),
    pine: 0.06 + elev * 0.3,
    tamarack: 0.1 + wet * 0.5 + (b < -0.3 ? 0.35 : 0),
    maple: 0.24 + (a > 0.12 ? 0.4 : 0) + nearHome * 0.5 + nearVillage * 0.4,
    maple2: 0.12 + (a > 0.3 ? 0.3 : 0) + nearHome * 0.2,
    birch: 0.14 + (b > 0.22 ? 0.42 : 0) + wet * 0.15,
    aspen: 0.06 + (b > 0.4 ? 0.35 : 0),
    oak: 0.08 + (a < 0 && b > 0 ? 0.2 : 0),
  };
  let sum = 0;
  for (const k in w) sum += w[k];
  let r = rng.next() * sum;
  for (const k in w) {
    r -= w[k];
    if (r <= 0) return k;
  }
  return 'spruce';
}

export class Forest {
  constructor(terrain, { density = 1 } = {}) {
    this.terrain = terrain;
    this.density = density;
    this.colliders = new SpatialHash(8);
    this.trees = [];
    this.group = new THREE.Group();
    this.group.name = 'forest';
    this.chunks = [];
    this.lodScale = 1;
  }

  roadNear(x, z, r) {
    const T = this.terrain;
    if (T.splatAt(x, z).road > 0.02) return true;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      if (T.splatAt(x + Math.cos(a) * r, z + Math.sin(a) * r).road > 0.02) return true;
    }
    return false;
  }

  place(riverInfo) {
    const T = this.terrain;
    const rng = new RNG(2024);
    const cell = 3.7 / Math.sqrt(this.density);
    const half = L.WORLD_HALF - 4;
    for (let z = -half; z < half; z += cell) {
      for (let x = -half; x < half; x += cell) {
        const px = x + rng.range(0, cell), pz = z + rng.range(0, cell);
        const h = T.heightAt(px, pz);
        if (h < 1.6) continue;
        const sp = T.splatAt(px, pz);
        if (sp.rock > 0.55 && rng.chance(0.8)) continue;
        const vm = villageMask(px, pz);
        let p = smoothstep(0.22, 0.72, forestNoise(px, pz)) * 0.8 + 0.1;
        p *= clearingFactor(px, pz) * vistaFactor(px, pz);
        p *= 1 - smoothstep(52, 75, h); // treeline on the rim mountains
        // the unreachable rim needs fewer trees (it is mostly seen from afar)
        const edge = Math.min(px + L.WORLD_HALF, L.WORLD_HALF - pz, pz + L.WORLD_HALF);
        p *= 0.45 + 0.55 * smoothstep(25, 70, edge);
        if (vm > 0.3) p *= 0.06;
        if (rng.next() > p) continue;
        if (this.roadNear(px, pz, 2.6)) continue;
        if (buildingBlocked(px, pz, 3)) continue;
        const river = riverInfo(px, pz);
        if (river.d < river.w * 0.5 + 2.5) continue;
        const species = pickSpecies(px, pz, h, river.d - river.w * 0.5, rng);
        const spec = TREE_SPECS[species];
        let H = rng.range(spec.h[0], spec.h[1]);
        // smaller trees at forest edges
        H *= 0.75 + 0.25 * clearingFactor(px, pz);
        this.addTree(species, px, h - 0.15, pz, H, rng);
      }
    }
    // undergrowth: bushes & ferns
    const ucell = 3.0 / Math.sqrt(this.density);
    for (let z = -half; z < half; z += ucell) {
      for (let x = -half; x < half; x += ucell) {
        const px = x + rng.range(0, ucell), pz = z + rng.range(0, ucell);
        const h = T.heightAt(px, pz);
        if (h < 1.5 || h > 60) continue;
        const fd = forestNoise(px, pz);
        let p = 0.08 + smoothstep(0.3, 0.8, fd) * 0.3;
        if (villageMask(px, pz) > 0.3) p *= 0.15;
        p *= (0.4 + 0.6 * clearingFactor(px, pz)) * (0.3 + 0.7 * vistaFactor(px, pz));
        if (rng.next() > p) continue;
        if (this.roadNear(px, pz, 1.2)) continue;
        if (buildingBlocked(px, pz, 1.5)) continue;
        const river = riverInfo(px, pz);
        if (river.d < river.w * 0.5 + 1) continue;
        const kind = rng.next();
        const species = kind < 0.42 ? 'bushRed' : kind < 0.7 ? 'bushOrange' : 'fern';
        this.addBush(species, px, h, pz, rng);
      }
    }
  }

  addTree(species, x, y, z, H, rng) {
    const spec = TREE_SPECS[species];
    const trunkH = spec.trunk === 'forked' ? H * 0.72 : H * 0.97;
    const trunkR = (spec.trunk === 'forked' ? 0.2 : 0.14) + H * 0.014;
    const tree = {
      species, x, y, z, H,
      trunk: { type: spec.trunk, h: trunkH, r: trunkR, yaw: rng.range(0, Math.PI * 2), lean: rng.range(-1, 1) },
    };
    this.trees.push(tree);
    this.colliders.insert({ type: 'circle', x, z, r: trunkR * 1.25 + 0.15, tree }, x, z, 1);
  }

  addBush(species, x, y, z) {
    this.trees.push({ species, x, y, z, H: 1.2, trunk: null, bush: true });
  }

  // Extra forest floor between the trees: mushroom clusters, saplings, cut stumps
  // (one of them still holds an axe) and mossy fallen logs, plus a few dead trees
  // around the graveyard. Uses its own random stream so placement elsewhere is
  // unaffected.
  scatterUndergrowth() {
    const T = this.terrain;
    const rng = new RNG(7331);
    const cell = 5.2 / Math.sqrt(this.density);
    const half = L.WORLD_HALF - 8;
    const trunkNear = (x, z, r) => {
      let hit = false;
      this.colliders.query(x, z, r + 1, (o) => {
        if (!hit && Math.hypot(o.x - x, o.z - z) < o.r + r) hit = true;
      });
      return hit;
    };
    const ok = (x, z, road, r) => !this.roadNear(x, z, road) && !buildingBlocked(x, z, 2) && !trunkNear(x, z, r) && (() => {
      const rv = riverInfo(x, z);
      return rv.d > rv.w * 0.5 + 2;
    })();
    let axes = 0;
    for (let z = -half; z < half; z += cell) {
      for (let x = -half; x < half; x += cell) {
        const px = x + rng.range(0, cell), pz = z + rng.range(0, cell);
        const kind = rng.next(), roll = rng.next(), yaw = rng.range(0, Math.PI * 2);
        const h = T.heightAt(px, pz);
        if (h < 1.8 || h > 56) continue;
        let p = smoothstep(0.28, 0.72, forestNoise(px, pz)) * 0.62;
        if (villageMask(px, pz) > 0.3) p *= 0.04;
        p *= clearingFactor(px, pz) * (0.35 + 0.65 * vistaFactor(px, pz));
        if (roll > p) continue;
        const species = kind < 0.34 ? 'mushroom' : kind < 0.6 ? 'sapling' : kind < 0.82 ? 'stump' : 'log';
        if (species === 'log') {
          // lay the log along the slope it rests on
          const Lh = 1.6, ux = Math.cos(yaw), uz = -Math.sin(yaw);
          const h0 = T.heightAt(px - ux * Lh, pz - uz * Lh), h1 = T.heightAt(px + ux * Lh, pz + uz * Lh);
          if (Math.abs(h1 - h0) > Lh * 0.9 || !ok(px, pz, 3.4, 1.8)) continue;
          const t = { species, x: px, y: (h0 + h1) / 2 - 0.08, z: pz, H: 0.8, trunk: null, bush: true, vyaw: yaw, tilt: Math.atan2(h1 - h0, Lh * 2), vscale: 1 };
          this.trees.push(t);
          // the logs are 2.8-3.4 m long: a chain of circles end to end
          for (let k = -3; k <= 3; k++) this.colliders.insert({ type: 'circle', x: px + ux * k * 0.5, z: pz + uz * k * 0.5, r: 0.36 }, px + ux * k * 0.5, pz + uz * k * 0.5, 0.4);
          continue;
        }
        const r = species === 'stump' ? 0.5 : 0.3;
        if (!ok(px, pz, species === 'mushroom' ? 1.2 : 1.8, r)) continue;
        const t = { species, x: px, y: h - (species === 'stump' ? 0.05 : 0), z: pz, H: 1, trunk: null, bush: true, vyaw: yaw };
        if (species === 'stump') {
          // the axe stump (variant 1) only a couple of times in the whole forest
          t.vseed = rng.chance(0.06) && axes < 3 ? (axes++, 1) : rng.pick([0, 2, 3, 4]);
          this.colliders.insert({ type: 'circle', x: px, z: pz, r: 0.42 }, px, pz, 0.5);
        }
        this.trees.push(t);
      }
    }
    // crooked dead trees standing watch around the graveyard
    const G = L.POI.graveyard;
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + rng.range(-0.15, 0.15), d = rng.range(24, 36);
      const px = G.x + Math.cos(a) * d, pz = G.z + Math.sin(a) * d;
      const h = T.heightAt(px, pz);
      if (h < 1.8 || !ok(px, pz, 2.6, 1)) continue;
      this.addTree('dead', px, h - 0.1, pz, rng.range(5.5, 8), rng);
      this.trees[this.trees.length - 1].vseed = k % 3; // every third one has eyes in its hollow
    }
  }

  // The forest's render data now lives in voxelForest.js; this keeps the chunk
  // descriptors (key + centre) and stats other systems read.
  buildMeshes() {
    this.scatterUndergrowth();
    const buckets = new Map();
    for (const t of this.trees) {
      const ci = Math.floor((t.x + L.WORLD_HALF) / CHUNK), cj = Math.floor((t.z + L.WORLD_HALF) / CHUNK);
      t.chunk = `${ci},${cj}`;
      if (!buckets.has(t.chunk)) buckets.set(t.chunk, { ci, cj, n: 0, y0: 1e9, y1: -1e9 });
      const b = buckets.get(t.chunk);
      b.n++;
      b.y0 = Math.min(b.y0, t.y);
      b.y1 = Math.max(b.y1, t.y + (t.H || 1));
    }
    this.chunks = [];
    for (const [key, b] of buckets) {
      const c = new THREE.Group();
      c.userData.key = key;
      c.userData.center = new THREE.Vector3(-L.WORLD_HALF + (b.ci + 0.5) * CHUNK, (b.y0 + b.y1) / 2, -L.WORLD_HALF + (b.cj + 0.5) * CHUNK);
      c.userData.count = b.n;
      this.chunks.push(c);
    }
    const count = (f) => this.trees.filter(f).length;
    this.stats = {
      trees: count((t) => !t.bush), bushes: count((t) => t.bush && /^bush|fern/.test(t.species)),
      floor: count((t) => t.bush && !/^bush|fern/.test(t.species)), chunks: this.chunks.length,
    };
    this.half = L.WORLD_HALF;
    return this.group;
  }

  // kept for callers; voxelForest.update() does the culling and LOD now
  updateVisibility() {}
}
