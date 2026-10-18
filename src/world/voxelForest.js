// The whole forest as voxel trees (models: voxel/models/trees.js). Each species has
// several seeded models, baked once in workers (treeBake.js) at up to five
// resolutions and drawn instanced, one draw per model and LOD:
//   lod 0  0.125 m voxels (finer for stumps and mushrooms), casts shadows
//   lod 1  0.25 m, casts shadows
//   lod 2  0.5 m
//   lod 3  1 m      (trees only: the far hills)
//   lod 4  2 m      (trees only: out to the horizon, deep in the haze)
// Every tree is a real voxel model at every distance: no cards, no impostors. Far LODs
// share a few models per species. Trees outside the view are skipped, but those near
// enough to throw a shadow into it go into the shadow map as shadow-only proxies. LOD
// switches have hysteresis, and the instance lists are refilled only when the camera
// moves or turns enough.
//
// The look is the shared pixel-voxel one (shaderlib VOXEL_LOOK_GLSL): banded, hue-shifted
// light, per-voxel jitter and a bevel on every convex edge the baker flags; leaves flutter,
// crowns sway with the wind, sun shines through them from behind, and shake(tree) wobbles
// one tree like a spring and shakes leaves out of it.
//
// Per instance, the matrix's spare bottom row carries (tree id, height, leaf tint): the
// shaders read and clear it before using the matrix.
import * as THREE from 'three';
import TreeWorker from './treeWorker.js?worker&inline';
import { TREE_INFO } from '../voxel/models/trees.js';
import { bakeTree, SWAY_MAX } from './treeBake.js';
import { G, worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, SEE_GLSL, VOXEL_LOOK_GLSL } from '../render/shaderlib.js';

export const SHAKES = 16;
// distance (m, times lodScale) where each LOD ends; past the last one the thing is gone.
// Roughly where a voxel shrinks to ~5 px on a 1080p screen.
const POLICY = {
  tree: { d: [24, 55, 130, 320, 900], cast: [1, 1, 0, 0, 0], far: 3 },
  dead: { d: [24, 55, 130, 320, 900], cast: [1, 1, 0, 0, 0], far: 3 },
  bush: { d: [16, 34, 80], cast: [1, 1, 0], far: 6 },
  sapling: { d: [12, 28, 60], cast: [1, 0, 0], far: 6 },
  fern: { d: [12, 26, 50], cast: [1, 0, 0], far: 6 },
  stump: { d: [12, 30, 70], cast: [1, 1, 0], far: 6 },
  log: { d: [15, 34, 80], cast: [1, 1, 0], far: 6 },
  mushroom: { d: [7, 16, 32], cast: [1, 0, 0], far: 6 },
};
const KIND_POLICY = { broad: 'tree', slim: 'tree', conifer: 'tree', tamarack: 'tree', pine: 'tree', dead: 'dead', bush: 'bush', sapling: 'sapling', fern: 'fern', stump: 'stump', log: 'log', mushroom: 'mushroom' };
const LEAFY = /^(maple|maple2|oak|birch|aspen|tamarack|bush|sapling)/;
const HYST = 0.07;
const SHADOW_R = 58; // out-of-view trees this close still cast shadows (proxies)
const CELL = 32;
const PROXY_LAYER = 3; // only the sun's shadow camera sees this layer

// ---------------------------------------------------------------- shaders
const SRGB_GLSL = /* glsl */ `
vec3 srgbToLin(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
`;
// instance row 3 -> (tree id, height, tint); the matrix itself with that row cleared
const INST_GLSL = /* glsl */ `
uniform vec4 uShake[${SHAKES}];
uniform float uHeight;
float iId, iH, iTint;
mat4 instanceM() {
  mat4 IM = mat4(1.0);
  iId = -1.0; iH = uHeight; iTint = 0.0;
  #ifdef USE_INSTANCING
  IM = instanceMatrix;
  iId = IM[0][3]; iH = IM[1][3]; iTint = IM[2][3];
  IM[0][3] = 0.0; IM[1][3] = 0.0; IM[2][3] = 0.0;
  #endif
  return modelMatrix * IM;
}
attribute vec4 aColor;
attribute float aSway;
// wind sway of the whole tree plus a flutter of the leaves; continuous in
// world space, so neighbouring faces stay joined
vec3 treeSway(vec3 wp, vec3 base, float leaf, float fall) {
  float ph = dot(base.xz, vec2(0.37, 0.61));
  float t = uTime * 1.3 + ph;
  float k = aSway * ${SWAY_MAX.toFixed(3)} * uWindStrength;
  wp.x += (sin(t) * 0.6 + sin(t * 2.3 + 1.7) * 0.25) * k * (0.6 + uWind.x * 0.4);
  wp.z += (cos(t * 0.8) * 0.5 + sin(t * 1.9) * 0.2) * k * (0.6 + uWind.y * 0.4);
  float fl = leaf * (0.018 + fall * 0.16) * (0.4 + uWindStrength * 0.8);
  wp += fl * vec3(sin(uTime * 5.3 + dot(wp, vec3(2.1, 1.7, 1.3))), 0.7 * sin(uTime * 4.1 + dot(wp, vec3(1.3, 2.9, 0.7))), cos(uTime * 4.7 + dot(wp, vec3(1.9, 0.9, 2.3))));
  return wp;
}
// a springy wobble for shaken trees: a push away from the hit plus squash and stretch
vec3 treeShake(vec3 wp, vec3 base) {
  if (iId < 0.0) return wp;
  for (int i = 0; i < ${SHAKES}; i++) {
    vec4 S = uShake[i];
    if (abs(S.x - iId) < 0.5) {
      float a = max(uTime - S.y, 0.0);
      float e = S.z * exp(-a * 2.6);
      float sh = sin(a * 15.0) * e;
      float sq = sin(a * 22.0 + 0.8) * e * exp(-a * 2.0);
      float bend = clamp((wp.y - base.y) / max(iH, 0.3), 0.0, 1.2);
      bend *= bend;
      vec3 d = wp - base;
      d.xz *= 1.0 + sq * 0.07 * bend;
      d.y *= 1.0 - sq * 0.045;
      wp = base + d + vec3(cos(S.w), 0.0, sin(S.w)) * sh * bend * iH * 0.075;
    }
  }
  return wp;
}
`;

const TREE_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${INST_GLSL}
${SRGB_GLSL}
attribute vec4 aQBox;
attribute float aEdgeF;
varying vec3 vColor;
varying float vLeaf;
varying float vEmit;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vG;
varying vec4 vQ;
varying vec2 vEdge;
void main() {
  mat4 M = instanceM();
  vec4 worldPosition = M * vec4(position, 1.0);
  float leaf = step(0.5, aColor.a);
  float fall = leaf * (1.0 - step(0.8, aColor.a));
  vec3 base = M[3].xyz;
  worldPosition.xyz = treeSway(worldPosition.xyz, base, leaf, fall);
  worldPosition.xyz = treeShake(worldPosition.xyz, base);
  vLeaf = leaf;
  vEmit = step(0.15, aColor.a) * (1.0 - leaf);
  vColor = srgbToLin(aColor.rgb);
  vColor *= mix(vec3(1.0), vec3(1.0 + iTint * 0.08, 1.0 + iTint * 0.02, 1.0 - iTint * 0.07), leaf);
  // face coords in voxels (as voxel/mesh.js lays them out) for the bevel and the jitter
  vec3 an = abs(normal);
  float ax = an.x > 0.5 ? 0.0 : an.y > 0.5 ? 1.0 : 2.0;
  vG = ax < 0.5 ? position.zy : ax < 1.5 ? position.xz : position.xy;
  vQ = aQBox;
  vEdge = vec2(ax, aEdgeF);
  vWorldPos = worldPosition.xyz;
  vNormal = normalize(mat3(M) * normal);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = (viewMatrix * vec4(vNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  ${SHADOW_VERT}
}
`;

const TREE_FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
${SEE_GLSL}
${VOXEL_LOOK_GLSL}
varying vec3 vColor;
varying float vLeaf;
varying float vEmit;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vG;
varying vec4 vQ;
varying vec2 vEdge;
void main() {
  if (vWorldPos.y < uClipY) discard;
  float seeR = seeThrough(vWorldPos);
  vec3 albedo = vColor;
  vec3 n = normalize(vNormal);
  if (vEmit < 0.5) {
    albedo *= voxJitter(vG, vEdge.x + vLeaf * 3.0);
    albedo = bevelTone(albedo, voxBevel(vG, vQ, vEdge.y, n));
  }
  if (uSnow > 0.0 && n.y > 0.6) {
    float h = hash12(floor(vWorldPos.xz * 8.0));
    if (h < uSnow * 1.1 - 0.05) albedo = mix(albedo, h > uSnow * 0.9 ? vec3(0.72, 0.78, 0.92) : vec3(0.92, 0.94, 0.99), 0.92);
  }
  albedo *= mix(1.0, 0.75, uWet * step(0.5, n.y));
  float shadow = getShadowMask();
  // leaves wrap the light a little further round (soft crowns), wood a little less
  vec3 col = voxLight(albedo, n, vWorldPos, shadow, mix(0.25, 0.36, vLeaf));
  vec3 v = normalize(uCamPos - vWorldPos);
  float back = max(dot(-v, uSunDir), 0.0);
  // sun shining through the leaves when riding into it
  col += albedo * uSunColor * vLeaf * pow(back, 3.0) * (0.15 + 0.5 * shadow) * 0.8;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * back * shadow;
  col += albedo * uSunColor * rim * 0.25;
  if (vEmit > 0.5) col = albedo * (1.6 + uNight * 1.6);
  gl_FragColor = vec4(seeRim(col, seeR), 1.0);
}
`;

const TREE_DEPTH_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${INST_GLSL}
void main() {
  mat4 M = instanceM();
  vec4 wp = M * vec4(position, 1.0);
  float leaf = step(0.5, aColor.a);
  vec3 base = M[3].xyz;
  wp.xyz = treeSway(wp.xyz, base, leaf, leaf * (1.0 - step(0.8, aColor.a)));
  wp.xyz = treeShake(wp.xyz, base);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const DEPTH_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`;

function createTreeMaterial() {
  const uniforms = worldUniforms({
    uShake: { value: Array.from({ length: SHAKES }, () => new THREE.Vector4(-1, 0, 0, 0)) },
    uHeight: { value: 8 },
  });
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: TREE_VERT, fragmentShader: TREE_FRAG, lights: true });
  const depth = new THREE.ShaderMaterial({ uniforms, vertexShader: TREE_DEPTH_VERT, fragmentShader: DEPTH_FRAG, defines: { DEPTH_PASS: '' } });
  mat.userData.depth = depth;
  return mat;
}

// ---------------------------------------------------------------- baking
function bakeAll(jobs, onProgress) {
  const results = new Map();
  let done = 0;
  const finish = (job, res) => {
    results.set(job.key, res);
    onProgress?.(++done / jobs.length);
  };
  const mainThread = async (list) => {
    for (const job of list) {
      finish(job, bakeTree(job));
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  let workers = [];
  const n = Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency || 4) - 1));
  try {
    for (let i = 0; i < n; i++) workers.push(new TreeWorker());
  } catch {
    workers.forEach((w) => w.terminate());
    workers = [];
  }
  if (!workers.length) return mainThread(jobs).then(() => results);
  // Each worker takes the next job until none are left, then retires. Jobs of a
  // failed worker (or all of them, if workers cannot start) bake on the main thread
  // once every worker has retired.
  return new Promise((resolve) => {
    let next = 0, alive = workers.length, settled = false;
    const leftovers = [];
    const retire = (w) => {
      w.terminate();
      if (--alive > 0 || settled) return;
      settled = true;
      while (next < jobs.length) leftovers.push(jobs[next++]);
      mainThread(leftovers).then(() => resolve(results));
    };
    const give = (w) => {
      if (next >= jobs.length) return retire(w);
      w.busy = next++;
      w.postMessage({ id: w.busy, job: jobs[w.busy] });
    };
    for (const w of workers) {
      w.onmessage = (e) => {
        const { id, res, error } = e.data;
        if (error) { console.warn('tree bake failed in worker', error); leftovers.push(jobs[id]); } else finish(jobs[id], res);
        w.busy = -1;
        give(w);
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        console.warn('tree worker unavailable, baking on the main thread');
        if (w.busy >= 0) leftovers.push(jobs[w.busy]);
        w.busy = -1;
        w.onmessage = w.onerror = null;
        retire(w);
      };
      give(w);
    }
  });
}

// static model buffers live on the GPU only (bounds are set by hand below)
function releaseArray() {
  this.array = null;
}
function makeGeometry(L) {
  const g = new THREE.BufferGeometry();
  const attr = (a, n, norm) => new THREE.BufferAttribute(a, n, norm).onUpload(releaseArray);
  g.setAttribute('position', attr(L.pos, 3, false));
  g.setAttribute('normal', attr(L.nor, 3, true));
  g.setAttribute('aColor', attr(L.col, 4, true));
  g.setAttribute('aSway', attr(L.sway, 1, true));
  g.setAttribute('aQBox', attr(L.qbox, 4, false));
  g.setAttribute('aEdgeF', attr(L.edge, 1, false));
  g.setIndex(attr(L.index, 1, false));
  const [x0, y0, z0, x1, y1, z1] = L.bounds;
  g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  g.userData.faces = L.faces;
  return g;
}

// ---------------------------------------------------------------- the forest
const _f = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

export class VoxelForest {
  constructor(forest) {
    this.forest = forest;
    if (forest) forest.renderer = this;
    this.group = new THREE.Group();
    this.group.name = 'voxel-forest';
    this.lodScale = 1;
    this.last = new THREE.Vector3(1e9, 0, 1e9);
    this._dir = new THREE.Vector3();
    this._key = '';
    this.models = [];
    this.shakes = [];
    this.stats = {};
  }

  async build(onProgress) {
    const trees = this.forest.trees;
    const species = [...new Set(trees.map((t) => t.species))].filter((sp) => TREE_INFO[sp]);
    // the lumber camp maple is always needed by the prologue
    if (!species.includes('maple')) species.push('maple');
    // one job per model; tree variants >= `far` only need their two near LODs
    const jobs = [];
    for (const sp of species) {
      const info = TREE_INFO[sp], pol = POLICY[KIND_POLICY[info.kind]];
      for (let seed = 0; seed < info.variants; seed++) {
        const farOwn = seed < pol.far;
        jobs.push({ key: `${sp}:${seed}`, species: sp, seed, lods: farOwn ? pol.d.length : 2, big: info.kind !== 'mushroom' && info.size >= 0.125 });
      }
    }
    jobs.sort((a, b) => b.big - a.big);
    const t0 = performance.now();
    const baked = await bakeAll(jobs, onProgress);
    this.stats.bakeMs = Math.round(performance.now() - t0);

    // ---- models
    this.material = createTreeMaterial();
    const byKey = new Map();
    for (const job of jobs) {
      const r = baked.get(job.key);
      const info = TREE_INFO[job.species];
      const pk = KIND_POLICY[info.kind];
      const M = { key: job.key, species: job.species, seed: job.seed, index: this.models.length, meta: r.meta, policy: POLICY[pk], pk, kind: info.kind };
      M.lodData = r.lods;
      M.geos = r.lods.map(makeGeometry);
      // bounding sphere in metres (from the finest LOD)
      const L = r.lods[0], b = L.bounds, s = L.size;
      M.cy = ((b[1] + b[4]) / 2) * s;
      M.rad = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) * 0.5 * s;
      M.sizes = r.lods.map((l) => l.size);
      this.models.push(M);
      byKey.set(M.key, M);
    }
    this.byKey = byKey;
    for (const M of this.models) {
      const farSeed = M.seed % M.policy.far;
      M.far = byKey.get(`${M.species}:${farSeed}`);
    }

    // ---- per-tree records
    const n = trees.length;
    this.n = n;
    this.X = new Float32Array(n); this.Y = new Float32Array(n); this.Z = new Float32Array(n);
    this.R = new Float32Array(n);
    this.MOD = new Int16Array(n).fill(-1);
    this.LOD = new Int8Array(n).fill(-1);
    this.MAT = new Float32Array(n * 16);
    this.TINT = new Float32Array(n);
    this.HGT = new Float32Array(n);
    this.HID = new Uint8Array(n);
    const half = this.forest.half ?? 320;
    for (let i = 0; i < n; i++) {
      const t = trees[i];
      t.fi = i;
      const info = TREE_INFO[t.species];
      if (!info) continue;
      const nv = info.variants;
      const h = hash(t.x, t.z);
      // (the stump with the axe in it is placed by hand: forest.js sets its vseed)
      t.vseed = t.vseed ?? (t.species === 'stump' ? [0, 2, 3, 4][Math.floor(h * 4) % 4] : Math.floor(h * nv) % nv);
      const M = byKey.get(`${t.species}:${t.vseed}`);
      if (!M) continue;
      t.vkey = t.vkeyBaked = M.key;
      const H = t.bush || !t.H ? M.meta.height * (0.85 + hash(t.z, t.x) * 0.3) : t.H;
      t.vscale = t.vscale ?? Math.max(0.6, Math.min(1.45, H / Math.max(0.3, M.meta.height)));
      t.vyaw = t.vyaw ?? hash(t.x * 1.7, t.z * 0.3) * Math.PI * 2;
      t.chunk = t.chunk ?? `${Math.floor((t.x + half) / 64)},${Math.floor((t.z + half) / 64)}`;
      _q.setFromAxisAngle(UP, t.vyaw);
      if (t.tilt) _q.multiply(_q2.setFromAxisAngle(FWD, t.tilt));
      _m.compose(_p.set(t.x, t.y, t.z), _q, _s.setScalar(t.vscale));
      _m.toArray(this.MAT, i * 16);
      this.MOD[i] = M.index;
      this.X[i] = t.x; this.Z[i] = t.z;
      this.Y[i] = t.y + M.cy * t.vscale;
      this.R[i] = M.rad * t.vscale;
      this.HGT[i] = M.meta.height * t.vscale;
      this.TINT[i] = hash(t.x * 0.37, t.z * 1.9) * 2 - 1;
    }

    // ---- spatial cells
    const cells = new Map();
    for (let i = 0; i < n; i++) {
      if (this.MOD[i] < 0) continue;
      const k = `${Math.floor(this.X[i] / CELL)},${Math.floor(this.Z[i] / CELL)}`;
      let c = cells.get(k);
      if (!c) cells.set(k, (c = { list: [], x: (Math.floor(this.X[i] / CELL) + 0.5) * CELL, z: (Math.floor(this.Z[i] / CELL) + 0.5) * CELL, rmax: 0, ymin: 1e9, ymax: -1e9, dmax: 0 }));
      c.list.push(i);
      c.rmax = Math.max(c.rmax, this.R[i]);
      c.ymin = Math.min(c.ymin, this.Y[i]);
      c.ymax = Math.max(c.ymax, this.Y[i]);
      const P = this.models[this.MOD[i]].policy;
      c.dmax = Math.max(c.dmax, P.d[P.d.length - 1]);
    }
    this.cells = [...cells.values()].map((c) => ({ ...c, list: Int32Array.from(c.list), y: (c.ymin + c.ymax) / 2, r: CELL * 0.7072 + c.rmax + (c.ymax - c.ymin) / 2 }));

    // ---- instance pools: [model][lod]; far lods (2+) come from the shared far models
    const NL = 5;
    const counts = this.models.map(() => new Array(NL).fill(0));
    for (let i = 0; i < n; i++) {
      const m = this.MOD[i];
      if (m < 0) continue;
      const M = this.models[m];
      counts[m][0]++;
      counts[m][1]++;
      for (let l = 2; l < NL; l++) if (M.far.geos[l]) counts[M.far.index][l]++;
    }
    this.pools = [];
    this.proxies = [];
    for (const M of this.models) {
      const row = [];
      for (let l = 0; l < NL; l++) {
        const cap = counts[M.index][l];
        if (!cap || !M.geos[l]) { row.push(null); continue; }
        const im = new THREE.InstancedMesh(M.geos[l], this.material, cap);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.castShadow = !!M.policy.cast[l];
        im.receiveShadow = true;
        im.customDepthMaterial = this.material.userData.depth;
        im.frustumCulled = false;
        im.count = 0;
        im.visible = false;
        im.matrixAutoUpdate = false;
        im.name = `${M.key}/lod${l}`;
        const p = { im, n: 0, size: M.sizes[l] };
        if (l === 2) p.nMain = 0;
        // The water reflection skips the detailed LODs and shows those trees
        // through the LOD 2 pool instead (appended after its own instances).
        if (l < 2) {
          im.onBeforeRender = (r, sc, cam) => { im.count = this.isReflection(cam) ? 0 : p.n; };
          im.onAfterRender = () => { im.count = p.n; };
        } else if (l === 2) {
          im.onBeforeRender = (r, sc, cam) => { im.count = this.isReflection(cam) ? p.n : p.nMain; };
          im.onAfterRender = () => { im.count = p.nMain; };
        }
        this.group.add(im);
        row.push(p);
      }
      this.pools.push(row);
      // shadow-only proxy (LOD 2 of the far model) on a layer only the sun's camera sees
      if (M.geos[2] && M.policy.cast[1] && counts[M.index][2]) {
        const cap = counts[M.index][2];
        const im = new THREE.InstancedMesh(M.geos[2], this.material, cap);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.castShadow = true;
        im.receiveShadow = false;
        im.customDepthMaterial = this.material.userData.depth;
        im.frustumCulled = false;
        im.layers.set(PROXY_LAYER);
        im.count = 0;
        im.visible = false;
        im.matrixAutoUpdate = false;
        im.name = `${M.key}/proxy`;
        this.group.add(im);
        this.proxies[M.index] = { im, n: 0, size: M.sizes[2] };
      }
    }
    this.stats.models = this.models.length;
    this.stats.faces = this.models.filter((M) => M.seed === 0).map((M) => `${M.key} ${M.geos.map((g) => g.userData.faces).join('/')}`);
    return this.group;
  }

  // the sun's shadow camera has to see the proxies' layer (world.js calls this)
  attachShadowCamera(cam) {
    cam.layers.enable(PROXY_LAYER);
  }

  // A standalone copy of one forest model (for cutscenes and set dressing): pivot
  // at the trunk base, metres, same material and wind as the forest.
  // makeTree('maple', 2) ; makeTree('stump', 1) is the stump with the axe in it.
  // userData.meta = { height, trunkR, canopyY, canopyR, ... }
  makeTree(species, seed = 0, { lod = 0 } = {}) {
    const M = this.models.find((m) => m.species === species && m.seed === seed) || this.models.find((m) => m.species === species);
    if (!M) return null;
    const l = Math.min(lod, M.geos.length - 1);
    const mat = this.singleMat ||= (() => {
      const m = createTreeMaterial();
      m.uniforms.uHeight.value = 8;
      return m;
    })();
    const mesh = new THREE.Mesh(M.geos[l], mat);
    mesh.scale.setScalar(M.sizes[l]);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.customDepthMaterial = mat.userData.depth;
    mesh.name = `${M.key}/single`;
    mesh.userData.meta = M.meta;
    return mesh;
  }

  isReflection(cam) {
    return this.mainCam ? cam !== this.mainCam : !cam.layers.isEnabled(1);
  }

  // Hide trees (cutscene stages): either call this, or set tree.vkey = null on
  // world.forest.trees entries and force a refill with last.set(1e9, 0, 1e9).
  setHidden(trees, hidden = true) {
    for (const t of trees) t.vkey = hidden ? null : t.vkeyBaked ?? t.vkey;
    this.last.set(1e9, 0, 1e9);
  }

  syncHidden() {
    const trees = this.forest.trees, H = this.HID;
    for (let i = 0; i < this.n; i++) H[i] = this.MOD[i] >= 0 && !trees[i].vkey ? 1 : 0;
  }

  // A springy wobble of one tree (power 0..1+), with leaves shaken out of it.
  // Safe to call every frame: a weaker shake never cuts a stronger one short.
  // dir: the way it gets pushed (radians, x toward z); by default away from Hank.
  // quiet: no leaves (brushing through a bush).
  shake(tree, power = 1, dir, quiet = false) {
    const i = tree?.fi ?? this.forest.trees.indexOf(tree);
    if (i == null || i < 0 || !(this.MOD?.[i] >= 0)) return;
    const now = G.uTime.value;
    const p = Math.min(1.6, Math.max(0.05, power));
    let s = this.shakes.find((e) => e.id === i);
    if (s) {
      const left = s.p * Math.exp(-(now - s.t0) * 2.6);
      if (left > p * 0.8) return;
    } else {
      if (this.shakes.length >= SHAKES) this.shakes.sort((a, b) => a.t0 - b.t0).shift();
      s = { id: i };
      this.shakes.push(s);
    }
    if (dir == null) {
      const P = G.uPlayer.value, dx = tree.x - P.x, dz = tree.z - P.z;
      dir = dx * dx + dz * dz < 64 && dx * dx + dz * dz > 1e-4 ? Math.atan2(dz, dx) : Math.random() * Math.PI * 2;
    }
    s.t0 = now; s.p = p; s.dir = dir;
    this.syncShakes();
    // leaves
    const fx = this.effects || globalThis.__game?.game?.effects;
    if (quiet || !fx?.spawnLeaf || !LEAFY.test(tree.species)) return;
    const M = this.models[this.MOD[i]], sc = tree.vscale || 1;
    const big = M.policy === POLICY.tree;
    const H = M.meta.height * sc;
    const crown = (M.meta.canopyR ?? (big ? H * 0.3 : 0.5)) * sc * 0.9;
    const cy = tree.y + (M.meta.canopyY ?? H * 0.65) * (M.meta.canopyY ? sc : 1);
    const nl = Math.round(big ? 6 + 20 * p : 2 + 5 * p);
    for (let k = 0; k < nl; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * crown;
      const y = cy + (Math.random() - 0.5) * crown * 0.9;
      fx.spawnLeaf(tree.x + Math.cos(a) * d, y, tree.z + Math.sin(a) * d, { vx: Math.cos(a) * p + Math.cos(dir) * p, vy: (Math.random() - 0.3) * p * 1.5, vz: Math.sin(a) * p + Math.sin(dir) * p });
    }
  }

  // Hank kicked: the nearest trunk in front of him gets a shake. True if one did.
  kick(pos, yaw, power = 0.55) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let best = null, bd = 1e9;
    this.forest.colliders.query(pos.x, pos.z, 2.2, (o) => {
      if (!o.tree) return;
      const dx = o.x - pos.x, dz = o.z - pos.z;
      const d = Math.hypot(dx, dz) - o.r;
      if (d > 1.1 || dx * fx + dz * fz < -0.2) return;
      if (d < bd) { bd = d; best = o.tree; }
    });
    if (best) this.shake(best, power);
    return !!best;
  }

  syncShakes() {
    for (const mat of [this.material, this.singleMat]) {
      if (!mat) continue;
      const U = mat.uniforms.uShake.value;
      for (let k = 0; k < SHAKES; k++) {
        const s = this.shakes[k];
        if (s) U[k].set(s.id, s.t0, s.p, s.dir || 0);
        else U[k].set(-1, 0, 0, 0);
      }
    }
  }

  // Refill the instance lists for this camera (only when it moved or turned enough).
  update(pos, camera) {
    if (!this.pools) return;
    if (camera) this.mainCam = camera;
    // retire finished shakes
    if (this.shakes.length) {
      const now = G.uTime.value, n0 = this.shakes.length;
      this.shakes = this.shakes.filter((s) => now - s.t0 < 3.5 && now >= s.t0 - 1);
      if (this.shakes.length !== n0) this.syncShakes();
    }
    if (this.last.x === 1e9) this.syncHidden();
    const fwd = this._dir;
    if (camera) camera.getWorldDirection(fwd);
    else fwd.set(0, 0, -1);
    const key = camera ? `${camera.fov.toFixed(1)},${camera.aspect.toFixed(2)},${this.lodScale}` : `${this.lodScale}`;
    const dx = pos.x - this.last.x, dy = pos.y - this.last.y, dz = pos.z - this.last.z;
    const turned = this._lastDir ? fwd.dot(this._lastDir) < 0.9992 : true;
    if (dx * dx + dy * dy + dz * dz < 2.25 && !turned && key === this._key) return;
    this.last.copy(pos);
    (this._lastDir ||= new THREE.Vector3()).copy(fwd);
    this._key = key;
    // horizontal half-angle of the view wedge (everything without a camera)
    this.refill(pos, fwd, camera ? this.viewHalfAngle(camera, fwd) : Math.PI);
  }

  // half-angle (radians, about the vertical axis) that the camera frustum covers, plus a margin
  viewHalfAngle(camera, fwd) {
    const fl = Math.hypot(fwd.x, fwd.z);
    if (fl < 0.25) return Math.PI;
    const ty = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), tx = ty * camera.aspect;
    const fx = fwd.x / fl, fz = fwd.z / fl;
    let best = 0;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      _f.set(sx * tx, sy * ty, -1).applyQuaternion(camera.quaternion);
      const l = Math.hypot(_f.x, _f.z);
      if (l < 1e-3) return Math.PI;
      const c = (_f.x * fx + _f.z * fz) / l;
      if (c <= 0.05) return Math.PI;
      best = Math.max(best, Math.acos(Math.min(1, c)));
    }
    return Math.min(Math.PI, best + THREE.MathUtils.degToRad(7));
  }

  refill(pos, fwd, half) {
    const S = this.lodScale;
    const cx = pos.x, cy = pos.y, cz = pos.z;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fl, fz = fwd.z / fl;
    const all = half >= Math.PI - 1e-3;
    // inward normals of the wedge's two edges: fwd rotated by +-(half - 90 deg).
    // A narrow wedge is the inside of both edges, a wide one of either.
    const a1 = half - Math.PI / 2, ca = Math.cos(a1), sa = Math.sin(a1);
    const N1x = fx * ca - fz * sa, N1z = fx * sa + fz * ca;
    const N2x = fx * ca + fz * sa, N2z = -fx * sa + fz * ca;
    const wide = half > Math.PI / 2;
    const inView = (x, z, r) => {
      if (all) return true;
      const px = x - cx, pz = z - cz;
      const a = px * N1x + pz * N1z, b = px * N2x + pz * N2z;
      if (wide) return a > -r || b > -r;
      return a > -r && b > -r && px * fx + pz * fz > -r;
    };
    for (const row of this.pools) for (const p of row) if (p) p.n = 0;
    for (const p of this.proxies) if (p) p.n = 0;
    // shadows fall away from the sun: out-of-view trees only matter when theirs can reach the view
    const sd = G.uSunDir.value, shl = Math.hypot(sd.x, sd.z) || 1;
    const shx = -sd.x / shl, shz = -sd.z / shl, shk = Math.min(4, shl / Math.max(0.12, sd.y));
    const refl = this._refl || (this._refl = []);
    refl.length = 0;
    const { X, Y, Z, R, MOD, LOD, MAT, TINT, HID } = this;
    const models = this.models;
    const tris = [0, 0, 0, 0, 0], inst = [0, 0, 0, 0, 0];
    for (const c of this.cells) {
      const ddx = c.x - cx, ddz = c.z - cz;
      const cd = Math.hypot(ddx, ddz, c.y - cy);
      if (cd - c.r > c.dmax * S * (1 + HYST)) continue;
      const cellIn = inView(c.x, c.z, c.r);
      if (!cellIn && cd - c.r > SHADOW_R) continue;
      const list = c.list;
      for (let q = 0; q < list.length; q++) {
        const i = list[q];
        if (HID[i]) continue;
        const M = models[MOD[i]];
        const P = M.policy;
        const x = X[i], y = Y[i], z = Z[i], r = R[i];
        const ex = x - cx, ey = y - cy, ez = z - cz;
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        const vis = d < r + 3 || (cellIn && inView(x, z, r));
        // lod with hysteresis around the current one
        const cur = LOD[i];
        const D = P.d, nd = D.length;
        let lod = 0;
        for (let k = 0; k < nd; k++) {
          const T = D[k] * S * (cur > k ? 1 - HYST : cur >= 0 && cur <= k ? 1 + HYST : 1);
          if (d > T) lod = k + 1;
        }
        LOD[i] = lod;
        if (!vis) {
          // only shadows from out-of-view trees
          if (d < SHADOW_R && P.cast[1]) {
            const L = Math.min(60, (y - MAT[i * 16 + 13] + r) * shk) * 0.5;
            if (inView(x + shx * L, z + shz * L, r + L)) {
              const px = this.proxies[M.far.index];
              if (px) this.put(px, i);
            }
          }
          continue;
        }
        if (lod >= nd) continue; // too far: gone
        const pm = lod >= 2 ? M.far : M;
        const pool = this.pools[pm.index][lod];
        if (pool) { this.put(pool, i); tris[lod] += pm.geos[lod].userData.faces * 2; inst[lod]++; }
        if (lod < 2) refl.push(i);
      }
    }
    for (const row of this.pools) if (row[2]) row[2].nMain = row[2].n;
    for (const i of refl) {
      const pool = this.pools[models[MOD[i]].far.index][2];
      if (pool) this.put(pool, i);
    }
    for (const row of this.pools) for (const p of row) if (p) this.flush(p);
    for (const p of this.proxies) if (p) this.flush(p);
    this.stats.tris = tris;
    this.stats.inst = inst;
    this.stats.proxies = this.proxies.reduce((a, p) => a + (p ? p.n : 0), 0);
  }

  put(p, i) {
    const k = p.n++;
    const A = p.im.instanceMatrix.array, M = this.MAT, s = p.size, o = k * 16, j = i * 16;
    // (bottom row: tree id, height, leaf tint; see INST_GLSL)
    A[o] = M[j] * s; A[o + 1] = M[j + 1] * s; A[o + 2] = M[j + 2] * s; A[o + 3] = i;
    A[o + 4] = M[j + 4] * s; A[o + 5] = M[j + 5] * s; A[o + 6] = M[j + 6] * s; A[o + 7] = this.HGT[i];
    A[o + 8] = M[j + 8] * s; A[o + 9] = M[j + 9] * s; A[o + 10] = M[j + 10] * s; A[o + 11] = this.TINT[i];
    A[o + 12] = M[j + 12]; A[o + 13] = M[j + 13]; A[o + 14] = M[j + 14]; A[o + 15] = 1;
  }

  flush(p) {
    const im = p.im;
    im.count = p.nMain ?? p.n;
    im.visible = p.n > 0;
    if (!p.n) return;
    im.instanceMatrix.clearUpdateRanges();
    im.instanceMatrix.addUpdateRange(0, p.n * 16);
    im.instanceMatrix.needsUpdate = true;
  }
}

function hash(x, z) {
  let h = Math.imul(Math.floor(x * 73.1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(z * 41.7), 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// A tree that needs no forest (the loading scene, tools, cutscenes): the voxel model
// baked on the spot, pivot at the trunk base, metres. userData.meta = { height, trunkR, ... }
export function makeVoxelTree(species, seed = 0) {
  if (!TREE_INFO[species]) return null;
  const r = bakeTree({ species, seed, lods: 1 });
  const g = makeGeometry(r.lods[0]);
  const mat = createTreeMaterial();
  mat.uniforms.uHeight.value = r.meta.height;
  const mesh = new THREE.Mesh(g, mat);
  mesh.scale.setScalar(r.lods[0].size);
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.customDepthMaterial = mat.userData.depth;
  mesh.frustumCulled = false;
  mesh.name = `${species}:${seed}/single`;
  mesh.userData.meta = r.meta;
  return mesh;
}
