// The whole forest as voxel trees. Each species has several seeded models,
// baked once (in workers) at three resolutions and drawn instanced:
//   lod 0  0.125 m voxels (finer for ferns, mushrooms, saplings, stumps), shadows
//   lod 1  0.25 m, shadows
//   lod 2  0.5 m
//   beyond that, every tree is an impostor card rendered from its voxel model
//   (four views, lit with baked normals), all in one draw call, out to the horizon.
// Trees outside the view are skipped, but those near enough to throw a shadow
// into it are drawn as shadow-only proxies. LOD switches have hysteresis, and the
// instance lists are refilled only when the camera moves or turns enough.
import * as THREE from 'three';
import TreeWorker from './treeWorker.js?worker&inline';
import { TREE_INFO } from '../voxel/models/trees.js';
import { bakeTree, SWAY_MAX } from './treeBake.js';
import { G, worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL } from '../render/shaderlib.js';

// distances (m) where lod 0 -> 1 -> 2 -> impostor (or gone), times lodScale
// (game settings: 0.7 low, 0.85 medium, 1.15 high). Roughly where a voxel
// shrinks to ~5 px on a 1080p screen.
const POLICY = {
  tree: { d: [18, 40, 80], imp: Infinity, cast: [1, 1, 0], far: 3 },
  dead: { d: [18, 40, 80], imp: Infinity, cast: [1, 1, 0], far: 3 },
  bush: { d: [16, 34, 70], imp: 200, cast: [1, 1, 0], far: 6 },
  sapling: { d: [12, 28, 56], imp: 130, cast: [1, 0, 0], far: 6 },
  fern: { d: [12, 26, 50], imp: 0, cast: [1, 0, 0], far: 6 },
  stump: { d: [12, 28, 56], imp: 0, cast: [1, 1, 0], far: 6 },
  log: { d: [15, 34, 70], imp: 0, cast: [1, 1, 0], far: 6 },
  mushroom: { d: [7, 15, 28], imp: 0, cast: [1, 0, 0], far: 6 },
};
const KIND_POLICY = { broad: 'tree', slim: 'tree', conifer: 'tree', tamarack: 'tree', pine: 'tree', dead: 'dead', bush: 'bush', sapling: 'sapling', fern: 'fern', stump: 'stump', log: 'log', mushroom: 'mushroom' };
const HYST = 0.07;
const SHADOW_R = 58; // out-of-view trees this close still cast shadows (proxies)
const CELL = 32;

// ---------------------------------------------------------------- shaders
const SRGB_GLSL = /* glsl */ `
vec3 srgbToLin(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
`;
const SWAY_GLSL = /* glsl */ `
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
`;

const TREE_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${SWAY_GLSL}
${SRGB_GLSL}
varying vec3 vColor;
varying float vLeaf;
varying float vEmit;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  mat4 M = modelMatrix * instanceMatrix;
  vec4 worldPosition = M * vec4(position, 1.0);
  float leaf = step(0.5, aColor.a);
  float fall = leaf * (1.0 - step(0.8, aColor.a));
  worldPosition.xyz = treeSway(worldPosition.xyz, M[3].xyz, leaf, fall);
  vLeaf = leaf;
  vEmit = step(0.15, aColor.a) * (1.0 - leaf);
  vColor = srgbToLin(aColor.rgb);
  #ifdef USE_INSTANCING_COLOR
  vColor *= mix(vec3(1.0), instanceColor, leaf);
  #endif
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
varying vec3 vColor;
varying float vLeaf;
varying float vEmit;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  if (vWorldPos.y < uClipY) discard;
  vec3 albedo = vColor;
  vec3 n = normalize(vNormal);
  if (uSnow > 0.0 && n.y > 0.6) {
    float h = hash12(floor(vWorldPos.xz * 8.0));
    if (h < uSnow * 1.1 - 0.05) albedo = mix(albedo, h > uSnow * 0.9 ? vec3(0.72, 0.78, 0.92) : vec3(0.92, 0.94, 0.99), 0.92);
  }
  albedo *= mix(1.0, 0.75, uWet * step(0.5, n.y));
  float shadow = getShadowMask();
  float ndl = dot(n, uSunDir);
  // soft clay light, a little softer on leaves
  float diff = clamp(ndl * mix(0.75, 0.6, vLeaf) + mix(0.25, 0.36, vLeaf), 0.0, 1.0);
  diff = mix(diff, smoothstep(0.15, 0.85, diff), 0.35) * shadow;
  vec3 light = hemiAmbient(n) * 1.05 + uSunColor * diff * 0.95 + pointLightsAt(vWorldPos, n, 0.35);
  vec3 col = albedo * light;
  vec3 v = normalize(uCamPos - vWorldPos);
  float back = max(dot(-v, uSunDir), 0.0);
  // sun shining through the leaves when riding into it
  col += albedo * uSunColor * vLeaf * pow(back, 3.0) * (0.15 + 0.5 * shadow) * 0.8;
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * back * shadow;
  col += albedo * uSunColor * rim * 0.25;
  if (vEmit > 0.5) col = albedo * (1.6 + uNight * 1.6);
  gl_FragColor = vec4(col, 1.0);
}
`;

const TREE_DEPTH_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${SWAY_GLSL}
void main() {
  mat4 M = modelMatrix * instanceMatrix;
  vec4 wp = M * vec4(position, 1.0);
  float leaf = step(0.5, aColor.a);
  wp.xyz = treeSway(wp.xyz, M[3].xyz, leaf, leaf * (1.0 - step(0.8, aColor.a)));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const DEPTH_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`;

// impostor cards: one quad per far tree, facing the camera, showing whichever
// of the four baked views is closest to the real view direction
const IMP_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
attribute vec3 iPos;
attribute vec4 iInfo; // model, yaw, scale, tint
uniform sampler2D tRects;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vRight;
varying vec3 vFwd;
varying float vTint;
void main() {
  int m = int(iInfo.x + 0.5);
  vec3 toCam = cameraPosition - iPos;
  float phi = atan(toCam.x, toCam.z) - iInfo.y;
  int view = int(mod(floor(phi / 1.5707963 + 0.5), 4.0));
  vec4 uvr = texelFetch(tRects, ivec2(view * 2, m), 0);
  vec4 quad = texelFetch(tRects, ivec2(view * 2 + 1, m), 0);
  vec3 f = normalize(vec3(toCam.x, 0.0, toCam.z) + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(f.z, 0.0, -f.x);
  float sc = iInfo.z;
  vec3 wp = iPos + right * (quad.x + position.x * quad.z) * sc + vec3(0.0, (quad.y + position.y * quad.w) * sc, 0.0);
  vWorldPos = wp;
  vRight = right;
  vFwd = f;
  vTint = iInfo.w;
  vUv = uvr.xy + position.xy * uvr.zw;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const IMP_FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${SRGB_GLSL}
uniform sampler2D tAlbedo;
uniform sampler2D tNormal;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vRight;
varying vec3 vFwd;
varying float vTint;
void main() {
  vec4 a = texture2D(tAlbedo, vUv);
  if (a.a < 0.5) discard;
  if (vWorldPos.y < uClipY) discard;
  vec4 nn = texture2D(tNormal, vUv);
  vec3 nv = nn.xyz * 2.0 - 1.0;
  vec3 n = normalize(vRight * nv.x + vec3(0.0, nv.y, 0.0) + vFwd * nv.z);
  float leaf = step(0.5, nn.a);
  vec3 albedo = srgbToLin(a.rgb);
  albedo *= mix(vec3(1.0), vec3(1.0 + vTint * 0.08, 1.0 + vTint * 0.02, 1.0 - vTint * 0.07), leaf);
  float ndl = dot(n, uSunDir);
  float diff = clamp(ndl * 0.65 + 0.32, 0.0, 1.0);
  diff = mix(diff, smoothstep(0.15, 0.85, diff), 0.35) * 0.8; // average self-shadowing
  vec3 col = albedo * (hemiAmbient(n) * 1.05 + uSunColor * diff * 0.95);
  vec3 v = normalize(uCamPos - vWorldPos);
  col += albedo * uSunColor * leaf * pow(max(dot(-v, uSunDir), 0.0), 3.0) * 0.4;
  gl_FragColor = vec4(col, 1.0);
}
`;

function createTreeMaterial() {
  const uniforms = worldUniforms({});
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
  g.setIndex(attr(L.index, 1, false));
  const [x0, y0, z0, x1, y1, z1] = L.bounds;
  g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, y0, z0), new THREE.Vector3(x1, y1, z1));
  g.boundingSphere = g.boundingBox.getBoundingSphere(new THREE.Sphere());
  g.userData.faces = L.faces;
  return g;
}

// Pack all impostor views into one atlas (albedo + normal), with mipmaps that
// keep the cut-out coverage, and a float texture of per-(model, view) rects.
function buildAtlas(models) {
  const views = [];
  for (const M of models) if (M.views) M.views.forEach((v, i) => views.push({ M, i, v }));
  const PAD = 2, AW = 512;
  views.sort((a, b) => b.v.h - a.v.h);
  let x = 0, y = 0, shelf = 0;
  for (const e of views) {
    const w = e.v.w + PAD * 2, h = e.v.h + PAD * 2;
    if (x + w > AW) { x = 0; y += shelf; shelf = 0; }
    e.x = x + PAD; e.y = y + PAD;
    x += w;
    shelf = Math.max(shelf, h);
  }
  let AH = 64;
  while (AH < y + shelf) AH *= 2;
  const alb = new Uint8Array(AW * AH * 4), nrm = new Uint8Array(AW * AH * 4);
  for (const e of views) {
    const { w, h, rgba, nrm: nr } = e.v;
    for (let j = 0; j < h; j++) {
      alb.set(rgba.subarray(j * w * 4, (j + 1) * w * 4), ((e.y + j) * AW + e.x) * 4);
      nrm.set(nr.subarray(j * w * 4, (j + 1) * w * 4), ((e.y + j) * AW + e.x) * 4);
    }
  }
  const rects = new Float32Array(8 * 4 * models.length);
  for (const e of views) {
    const o = (e.M.index * 8 + e.i * 2) * 4;
    rects.set([e.x / AW, e.y / AH, e.v.w / AW, e.v.h / AH, e.v.x0, e.v.y0, e.v.w * e.v.s, e.v.h * e.v.s], o);
  }
  const tex = (data, normal) => {
    const t = new THREE.DataTexture(data, AW, AH, THREE.RGBAFormat);
    t.mipmaps = mipChain(data, AW, AH, normal);
    t.generateMipmaps = false;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    if (!normal) t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const rt = new THREE.DataTexture(rects, 8, models.length, THREE.RGBAFormat, THREE.FloatType);
  rt.magFilter = rt.minFilter = THREE.NearestFilter;
  rt.needsUpdate = true;
  return { albedo: tex(alb, false), normal: tex(nrm, true), rects: rt, w: AW, h: AH };
}

// coverage-keeping mips: a texel is solid when 2 of its 4 children are; colour is
// the mean of the solid children
function mipChain(data, w, h, isNormal) {
  const out = [{ data, width: w, height: h }];
  let src = data, sw = w, sh = h;
  while (sw > 1 || sh > 1) {
    const dw = Math.max(1, sw >> 1), dh = Math.max(1, sh >> 1);
    const dst = new Uint8Array(dw * dh * 4);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let n = 0, r = 0, g = 0, b = 0, a = 0;
      for (let q = 0; q < 4; q++) {
        const o = (Math.min(sh - 1, 2 * y + (q >> 1)) * sw + Math.min(sw - 1, 2 * x + (q & 1))) * 4;
        const solid = isNormal ? src[o] + src[o + 1] + src[o + 2] > 0 : src[o + 3] > 127;
        if (!solid) continue;
        n++; r += src[o]; g += src[o + 1]; b += src[o + 2]; a += src[o + 3];
      }
      const o = (y * dw + x) * 4;
      if (n >= 2) { dst[o] = r / n; dst[o + 1] = g / n; dst[o + 2] = b / n; dst[o + 3] = isNormal ? (a / n > 127 ? 255 : 0) : 255; }
    }
    out.push({ data: dst, width: dw, height: dh });
    src = dst; sw = dw; sh = dh;
  }
  return out;
}

// ---------------------------------------------------------------- the forest
const _f = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), FWD = new THREE.Vector3(0, 0, 1);

export class VoxelForest {
  constructor(forest) {
    this.forest = forest;
    this.group = new THREE.Group();
    this.group.name = 'voxel-forest';
    this.lodScale = 1;
    this.last = new THREE.Vector3(1e9, 0, 1e9);
    this._dir = new THREE.Vector3();
    this._key = '';
    this.models = [];
    this.stats = {};
  }

  async build(onProgress) {
    const trees = this.forest.trees;
    const species = [...new Set(trees.map((t) => t.species))].filter((sp) => TREE_INFO[sp]);
    // one job per model; tree variants >= `far` only need their two near LODs
    const jobs = [];
    for (const sp of species) {
      const info = TREE_INFO[sp], pol = POLICY[KIND_POLICY[info.kind]];
      for (let seed = 0; seed < info.variants; seed++) {
        const farOwn = seed < pol.far;
        jobs.push({ key: `${sp}:${seed}`, species: sp, seed, lods: farOwn ? 3 : 2, impostor: farOwn && pol.imp > 0, big: info.kind !== 'mushroom' && info.size >= 0.125 });
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
      const M = { key: job.key, species: job.species, seed: job.seed, index: this.models.length, meta: r.meta, policy: POLICY[pk], pk, views: r.views };
      M.geos = r.lods.map(makeGeometry);
      // bounding sphere in metres (from the finest LOD)
      const L = r.lods[0], b = L.bounds, s = L.size;
      M.cy = ((b[1] + b[4]) / 2) * s;
      M.rad = Math.hypot(b[3] - b[0], b[4] - b[1], b[5] - b[2]) * 0.5 * s;
      M.sizes = r.lods.map((l) => l.size);
      this.models.push(M);
      byKey.set(M.key, M);
    }
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
    this.YAW = new Float32Array(n);
    this.SC = new Float32Array(n);
    const half = this.forest.half ?? 320;
    for (let i = 0; i < n; i++) {
      const t = trees[i];
      const info = TREE_INFO[t.species];
      if (!info) continue;
      const nv = info.variants;
      const h = hash(t.x, t.z);
      t.vseed = t.vseed ?? Math.floor(h * nv) % nv;
      const M = byKey.get(`${t.species}:${t.vseed}`);
      if (!M) continue;
      t.vkey = M.key;
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
      this.YAW[i] = t.vyaw;
      this.SC[i] = t.vscale;
      this.TINT[i] = hash(t.x * 0.37, t.z * 1.9) * 2 - 1;
    }

    // ---- spatial cells
    const cells = new Map();
    for (let i = 0; i < n; i++) {
      if (this.MOD[i] < 0) continue;
      const k = `${Math.floor(this.X[i] / CELL)},${Math.floor(this.Z[i] / CELL)}`;
      let c = cells.get(k);
      if (!c) cells.set(k, (c = { list: [], x: (Math.floor(this.X[i] / CELL) + 0.5) * CELL, z: (Math.floor(this.Z[i] / CELL) + 0.5) * CELL, rmax: 0, ymin: 1e9, ymax: -1e9 }));
      c.list.push(i);
      c.rmax = Math.max(c.rmax, this.R[i]);
      c.ymin = Math.min(c.ymin, this.Y[i]);
      c.ymax = Math.max(c.ymax, this.Y[i]);
    }
    this.cells = [...cells.values()].map((c) => ({ ...c, list: Int32Array.from(c.list), y: (c.ymin + c.ymax) / 2, r: CELL * 0.7072 + c.rmax + (c.ymax - c.ymin) / 2 }));
    // far cells copy ready-made impostor lists: every tree (impT), or every
    // tree, bush and sapling while closer than the nearest such cut-off (impA)
    for (const c of this.cells) {
      const pick = (f) => {
        const ids = [...c.list].filter(f);
        const pos = new Float32Array(ids.length * 3), info = new Float32Array(ids.length * 4);
        ids.forEach((i, k) => {
          const M = this.models[this.MOD[i]];
          pos.set([this.X[i], this.MAT[i * 16 + 13], this.Z[i]], k * 3);
          info.set([M.far.index, this.YAW[i], this.SC[i], this.TINT[i]], k * 4);
        });
        return { pos, info, n: ids.length };
      };
      const imps = [...c.list].map((i) => this.models[this.MOD[i]].policy.imp);
      c.impT = pick((i) => this.models[this.MOD[i]].policy.imp === Infinity);
      c.impA = pick((i) => this.models[this.MOD[i]].policy.imp > 0);
      const finite = imps.filter((v) => v > 0 && v < Infinity);
      c.impMin = finite.length ? Math.min(...finite) : Infinity;
      c.impMax = finite.length ? Math.max(...finite) : 0;
    }
    this.farD = Math.max(...Object.values(POLICY).map((P) => P.d[2]));

    // ---- instance pools: [model][lod]
    const counts = this.models.map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const m = this.MOD[i];
      if (m < 0) continue;
      const M = this.models[m];
      counts[m][0]++;
      counts[m][1]++;
      if (M.far.geos[2]) counts[M.far.index][2]++;
    }
    this.pools = [];
    this.proxies = [];
    const isOrtho = (fr) => {
      const p = fr.planes;
      return p[0].normal.dot(p[1].normal) < -0.999 && p[2].normal.dot(p[3].normal) < -0.999;
    };
    for (const M of this.models) {
      const row = [];
      for (let l = 0; l < 3; l++) {
        const cap = counts[M.index][l];
        if (!cap || !M.geos[l]) { row.push(null); continue; }
        const im = new THREE.InstancedMesh(M.geos[l], this.material, cap);
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.instanceColor.setUsage(THREE.DynamicDrawUsage);
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
        } else {
          im.onBeforeRender = (r, sc, cam) => { im.count = this.isReflection(cam) ? p.n : p.nMain; };
          im.onAfterRender = () => { im.count = p.nMain; };
        }
        this.group.add(im);
        row.push(p);
      }
      this.pools.push(row);
      // shadow-only proxy (coarsest LOD of the far model): skipped by every
      // perspective camera, drawn by the sun's orthographic shadow camera
      if (M.geos[2] && M.policy.cast[1] && counts[M.index][2]) {
        const cap = counts[M.index][2];
        const im = new THREE.InstancedMesh(M.geos[2], this.material, cap);
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        im.castShadow = true;
        im.receiveShadow = false;
        im.customDepthMaterial = this.material.userData.depth;
        im.frustumCulled = true;
        im.intersectsFrustum = isOrtho;
        im.count = 0;
        im.visible = false;
        im.matrixAutoUpdate = false;
        im.name = `${M.key}/proxy`;
        this.group.add(im);
        this.proxies[M.index] = { im, n: 0, size: M.sizes[2] };
      }
    }

    // ---- impostors
    const withViews = this.models.filter((M) => M.views);
    if (withViews.length) {
      this.atlas = buildAtlas(this.models);
      const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
      const g = new THREE.InstancedBufferGeometry();
      g.index = quad.index;
      g.setAttribute('position', quad.attributes.position);
      const cap = n;
      this.impPos = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
      this.impInfo = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPos', this.impPos);
      g.setAttribute('iInfo', this.impInfo);
      g.instanceCount = 0;
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      const uniforms = worldUniforms({ tAlbedo: { value: this.atlas.albedo }, tNormal: { value: this.atlas.normal }, tRects: { value: this.atlas.rects } });
      this.impMat = new THREE.ShaderMaterial({ uniforms, vertexShader: IMP_VERT, fragmentShader: IMP_FRAG, side: THREE.DoubleSide });
      this.imp = new THREE.Mesh(g, this.impMat);
      this.imp.frustumCulled = false;
      this.imp.matrixAutoUpdate = false;
      this.imp.name = 'tree-impostors';
      this.group.add(this.imp);
    }
    this.stats.models = this.models.length;
    this.stats.faces = this.models.map((M) => `${M.key} ${M.geos.map((g) => g.userData.faces).join('/')}`);
    return this.group;
  }

  isReflection(cam) {
    return this.mainCam ? cam !== this.mainCam : !cam.layers.isEnabled(1);
  }

  // Refill the instance lists for this camera (only when it moved or turned enough).
  update(pos, camera) {
    if (!this.pools) return;
    if (camera) this.mainCam = camera;
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
    // the whole sphere inside the view wedge
    const inside = (x, z, r) => {
      if (all) return true;
      const px = x - cx, pz = z - cz;
      const a = px * N1x + pz * N1z, b = px * N2x + pz * N2z;
      if (wide) return a > r || b > r;
      return a > r && b > r;
    };
    const farD = this.farD * S * (1 + HYST);
    for (const row of this.pools) for (const p of row) if (p) p.n = 0;
    for (const p of this.proxies) if (p) p.n = 0;
    // shadows fall away from the sun: out-of-view trees only matter when theirs can reach the view
    const sd = G.uSunDir.value, shl = Math.hypot(sd.x, sd.z) || 1;
    const shx = -sd.x / shl, shz = -sd.z / shl, shk = Math.min(4, shl / Math.max(0.12, sd.y));
    const refl = this._refl || (this._refl = []);
    refl.length = 0;
    let ni = 0;
    const iPos = this.impPos?.array, iInfo = this.impInfo?.array;
    const { X, Y, Z, R, MOD, LOD, MAT, TINT } = this;
    const models = this.models;
    const tris = [0, 0, 0], inst = [0, 0, 0, 0];
    for (const c of this.cells) {
      const ddx = c.x - cx, ddz = c.z - cz;
      const cd = Math.hypot(ddx, ddz, c.y - cy);
      const cellIn = inView(c.x, c.z, c.r);
      if (!cellIn && cd - c.r > SHADOW_R) continue;
      if (cellIn && iPos && cd - c.r > farD && inside(c.x, c.z, c.r)) {
        const src = cd + c.r < c.impMin * S ? c.impA : cd - c.r > c.impMax * S ? c.impT : null;
        if (src) {
          iPos.set(src.pos, ni * 3);
          iInfo.set(src.info, ni * 4);
          ni += src.n;
          c.bulk = true;
          continue;
        }
      }
      const wasBulk = c.bulk;
      c.bulk = false;
      const list = c.list;
      for (let q = 0; q < list.length; q++) {
        const i = list[q];
        const M = models[MOD[i]];
        const P = M.policy;
        const x = X[i], y = Y[i], z = Z[i], r = R[i];
        const ex = x - cx, ey = y - cy, ez = z - cz;
        const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
        const vis = d < r + 3 || (cellIn && inView(x, z, r));
        // lod with hysteresis around the current one
        const cur = wasBulk ? 3 : LOD[i];
        let lod = 0;
        const D = P.d;
        for (let k = 0; k < 3; k++) {
          const T = D[k] * S * (cur > k ? 1 - HYST : cur >= 0 && cur <= k ? 1 + HYST : 1);
          if (d > T) lod = k + 1;
        }
        if (lod === 3 && d > P.imp * S) lod = 4; // gone
        if (!vis) {
          // only shadows from out-of-view trees
          if (d < SHADOW_R && P.cast[1]) {
            const L = Math.min(60, (y - MAT[i * 16 + 13] + r) * shk) * 0.5;
            if (inView(x + shx * L, z + shz * L, r + L)) {
              const px = this.proxies[M.far.index];
              if (px) this.put(px, i, 0);
            }
          }
          LOD[i] = lod;
          continue;
        }
        LOD[i] = lod;
        if (lod <= 2) {
          const pm = lod === 2 ? M.far : M;
          const pool = this.pools[pm.index][lod];
          if (pool) { this.put(pool, i, TINT[i]); tris[lod] += pm.geos[lod].userData.faces * 2; inst[lod]++; }
          if (lod < 2) refl.push(i);
        } else if (lod === 3 && iPos) {
          const F = M.far;
          iPos[ni * 3] = x; iPos[ni * 3 + 1] = MAT[i * 16 + 13]; iPos[ni * 3 + 2] = z;
          iInfo[ni * 4] = F.index; iInfo[ni * 4 + 1] = this.YAW[i]; iInfo[ni * 4 + 2] = this.SC[i]; iInfo[ni * 4 + 3] = TINT[i];
          ni++;
        }
      }
    }
    for (const row of this.pools) if (row[2]) row[2].nMain = row[2].n;
    for (const i of refl) {
      const pool = this.pools[models[MOD[i]].far.index][2];
      if (pool) this.put(pool, i, TINT[i]);
    }
    for (const row of this.pools) for (const p of row) if (p) this.flush(p);
    for (const p of this.proxies) if (p) this.flush(p);
    if (this.imp) {
      this.imp.geometry.instanceCount = ni;
      this.imp.visible = ni > 0;
      if (ni) {
        this.impPos.clearUpdateRanges(); this.impPos.addUpdateRange(0, ni * 3); this.impPos.needsUpdate = true;
        this.impInfo.clearUpdateRanges(); this.impInfo.addUpdateRange(0, ni * 4); this.impInfo.needsUpdate = true;
      }
    }
    this.stats.impostors = ni;
    this.stats.tris = tris;
    this.stats.inst = inst;
    this.stats.proxies = this.proxies.reduce((a, p) => a + (p ? p.n : 0), 0);
  }

  put(p, i, tint) {
    const k = p.n++;
    const A = p.im.instanceMatrix.array, M = this.MAT, s = p.size, o = k * 16, j = i * 16;
    A[o] = M[j] * s; A[o + 1] = M[j + 1] * s; A[o + 2] = M[j + 2] * s; A[o + 3] = 0;
    A[o + 4] = M[j + 4] * s; A[o + 5] = M[j + 5] * s; A[o + 6] = M[j + 6] * s; A[o + 7] = 0;
    A[o + 8] = M[j + 8] * s; A[o + 9] = M[j + 9] * s; A[o + 10] = M[j + 10] * s; A[o + 11] = 0;
    A[o + 12] = M[j + 12]; A[o + 13] = M[j + 13]; A[o + 14] = M[j + 14]; A[o + 15] = 1;
    if (p.im.instanceColor) {
      const C = p.im.instanceColor.array;
      C[k * 3] = 1 + tint * 0.08; C[k * 3 + 1] = 1 + tint * 0.02; C[k * 3 + 2] = 1 - tint * 0.07;
    }
  }

  flush(p) {
    const im = p.im;
    im.count = p.nMain ?? p.n;
    im.visible = p.n > 0;
    if (!p.n) return;
    im.instanceMatrix.clearUpdateRanges();
    im.instanceMatrix.addUpdateRange(0, p.n * 16);
    im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) {
      im.instanceColor.clearUpdateRanges();
      im.instanceColor.addUpdateRange(0, p.n * 3);
      im.instanceColor.needsUpdate = true;
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
