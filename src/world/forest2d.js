// The whole forest as 2D pixel-art sprites (art/trees2d.js): every tree, bush,
// fern, sapling, stump, log and mushroom is one upright, camera-facing card in
// a single instanced draw call, out to the horizon.
//  - Sprites are pixelled in workers into one atlas with coverage-keeping mips,
//    so far trees neither shimmer nor thin out.
//  - The baked shading carries the form; the shader adds the real sun from the
//    side using the normal packed into each texel's alpha (sun side a tone
//    brighter, shadow side cooler), sun through the leaves, snow, point lights.
//  - Cards cast alpha-tested shadows (in the shadow pass they turn to face the
//    sun) and look their own shadow up in front of themselves.
//  - The tops sway in the wind; shake(tree, power) wobbles one tree like a
//    spring and shakes leaves out of it.
//  - The instance list is refilled front to back from 32 m cells in (or casting
//    shadows into) the view, only when the camera moved or turned enough; the
//    small stuff is dropped (with a dithered fade) beyond its own distance.
import * as THREE from 'three';
import TreeWorker from './treeWorker.js?worker&inline';
import { SPRITES, bakeSprite } from '../art/trees2d.js';
import { G, worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL } from '../render/shaderlib.js';

const CELL = 32;
const SHADOW_R = 60; // out-of-view cells this close still go in (their shadows)
// per kind: wind sway, draw distance (m, times lodScale)
const KIND = {
  tree: { sway: 1, far: 1e5 },
  bush: { sway: 0.35, far: 170 },
  sapling: { sway: 0.7, far: 110 },
  fern: { sway: 0.45, far: 70 },
  stump: { sway: 0, far: 80 },
  log: { sway: 0, far: 95 },
  mushroom: { sway: 0, far: 42 },
};
const LEAFY = /^(maple|maple2|oak|birch|aspen|tamarack|bush|sapling)/;

// ---------------------------------------------------------------- shaders
const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
uniform vec4 uShake[8];
uniform float uLod;
uniform vec3 uCamPos;
#ifdef SINGLE
uniform vec4 uRect;
uniform vec4 uSize;
uniform vec4 uParams;
#else
uniform sampler2D tFrames;
attribute vec4 iPos;  // base x, y, z, scale (negative: mirrored)
attribute vec4 iInfo; // frame, tree id, yaw, tint
#endif
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vRight;
varying vec3 vUpv;
varying vec3 vFwd;
varying float vFlip;
varying float vTint;
varying float vFade;
void main() {
#ifdef SINGLE
  vec3 base = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 upW = modelMatrix[1].xyz;
  float sc = length(upW);
  vec3 up = upW / sc;
  vec4 rect = uRect, size = uSize, prm = uParams;
  float flip = 1.0, id = -9.0, tint = 0.0;
#else
  vec3 base = iPos.xyz;
  float sc = abs(iPos.w);
  float flip = iPos.w < 0.0 ? -1.0 : 1.0;
  vec3 up = vec3(0.0, 1.0, 0.0);
  int f = int(iInfo.x + 0.5);
  vec4 prm = texelFetch(tFrames, ivec2(2, f), 0);
  float id = iInfo.y, tint = iInfo.w;
#endif
  bool ortho = projectionMatrix[3][3] == 1.0;
  vec3 toCam = ortho ? vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]) : cameraPosition - base;
  vec3 f2 = toCam - up * dot(toCam, up);
  f2 = normalize(f2 + (abs(up.y) > 0.5 ? vec3(1e-5, 0.0, 0.0) : vec3(0.0, 1e-5, 0.0)));
  vec3 right = cross(up, f2);
  vFade = 0.0;
#ifndef SINGLE
  float dist = length(uCamPos - base);
  float maxD = prm.y * uLod;
  if (dist > maxD) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vFade = smoothstep(maxD * 0.8, maxD, dist);
  // sprites pixelled from several angles (logs): pick one by the angle to the axis
  if (prm.z > 1.5) {
    vec3 ax = vec3(cos(iInfo.z), 0.0, -sin(iInfo.z));
    ax *= dot(ax, right) < 0.0 ? -1.0 : 1.0;
    float c = dot(ax, f2);
    f += int(min(floor(asin(clamp(abs(c), 0.0, 1.0)) / 0.5235988 + 0.5), prm.z - 1.0));
    flip = c > 0.0 ? -1.0 : 1.0;
  }
  vec4 rect = texelFetch(tFrames, ivec2(0, f), 0);
  vec4 size = texelFetch(tFrames, ivec2(1, f), 0);
#endif
  float lx = position.x + 0.5, ly = position.y + 0.5;
  float ax0 = flip > 0.0 ? size.z : 1.0 - size.z;
  vec2 q = vec2((lx - ax0) * size.x, (ly - (1.0 - size.w)) * size.y) * sc;
  float hgt = max(size.y * size.w * sc, 0.1); // height above the base
  float bend = clamp(q.y / hgt, 0.0, 1.0);
  bend *= bend;
  // a springy wobble for shaken trees: sideways sway plus squash and stretch
  float sh = 0.0, sq = 0.0;
  for (int i = 0; i < 8; i++) {
    vec4 S = uShake[i];
    if (abs(S.x - id) < 0.5) {
      float a = max(uTime - S.y, 0.0);
      float e = S.z * exp(-a * 2.6);
      sh += sin(a * 15.0) * e;
      sq += sin(a * 22.0 + 0.8) * e * exp(-a * 2.0);
    }
  }
  q.x *= 1.0 + sq * 0.07 * bend;
  q.y *= 1.0 - sq * 0.045;
  vec3 wp = base + right * q.x + up * q.y;
  wp += right * sh * bend * hgt * 0.075;
  // wind in the tops
  float k = prm.x * uWindStrength * bend * hgt * 0.03;
  float t = uTime * 1.3 + dot(base.xz, vec2(0.37, 0.61));
  wp.x += (sin(t) * 0.6 + sin(t * 2.3 + 1.7) * 0.25) * k * (0.6 + uWind.x * 0.4);
  wp.z += (cos(t * 0.8) * 0.5 + sin(t * 1.9) * 0.2) * k * (0.6 + uWind.y * 0.4);
  float u = flip > 0.0 ? lx : 1.0 - lx;
  vUv = vec2(mix(rect.x, rect.z, u), mix(rect.y, rect.w, 1.0 - ly));
  vRight = right;
  vUpv = up;
  vFwd = f2;
  vFlip = flip;
  vTint = tint;
  vWorldPos = wp;
  vec4 worldPosition = vec4(wp, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
#ifndef DEPTH_PASS
  vec3 transformedNormal = (viewMatrix * vec4(f2, 0.0)).xyz;
  // look the shadow up in front of this tree's own (sun-facing) shadow card
  vec3 sun2 = vec3(uSunDir.x, 0.0, uSunDir.z);
  float hl = max(length(sun2), 0.25);
  float behind = max(0.0, -dot(wp - base, sun2) / hl);
  worldPosition.xyz += uSunDir * ((behind + 0.3) / hl);
#endif
  ${SHADOW_VERT}
}
`;

const FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
uniform sampler2D tAtlas;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vRight;
varying vec3 vUpv;
varying vec3 vFwd;
varying float vFlip;
varying float vTint;
varying float vFade;
vec3 srgbToLin(vec3 c) { return c * (c * (c * 0.305306011 + 0.682171111) + 0.012522878); }
void main() {
  vec4 tx = texture2D(tAtlas, vUv);
  if (tx.a < 0.5) discard;
  if (vWorldPos.y < uClipY) discard;
  if (vFade > 0.0 && bayer4(gl_FragCoord.xy) < vFade) discard;
  // alpha = 128 + leaf * 64 + ny * 8 + nx
  float code = floor(tx.a * 255.0 + 0.5) - 128.0;
  float leaf = step(63.5, code);
  code -= leaf * 64.0;
  float nyq = floor(code / 8.0 + 0.01);
  vec2 nn = vec2(code - nyq * 8.0, nyq) / 3.5 - 1.0;
  nn.x *= vFlip;
  vec3 n = normalize(vRight * nn.x + vUpv * nn.y + vFwd * sqrt(max(0.05, 1.0 - dot(nn, nn))));
  vec3 albedo = srgbToLin(tx.rgb);
  albedo *= mix(vec3(1.0), vec3(1.0 + vTint * 0.08, 1.0 + vTint * 0.03, 1.0 - vTint * 0.07), leaf);
  if (uSnow > 0.0 && nn.y > 0.25) {
    float h = hash12(floor(vWorldPos.xz * 6.0) + floor(vWorldPos.y * 6.0) * 7.0);
    if (h < uSnow * 1.2 - 0.1) albedo = mix(albedo, h > uSnow * 0.9 ? vec3(0.72, 0.78, 0.92) : vec3(0.92, 0.94, 0.99), 0.9);
  }
  albedo *= 1.0 - uWet * 0.2;
  float shadow = getShadowMask();
  float ndl = dot(n, uSunDir);
  // crisp side light in three steps: the sun side of every lump steps up a tone
  float band = ndl > 0.36 ? 1.0 : ndl > -0.06 ? 0.68 : 0.36;
  vec3 light = hemiAmbient(n) * 1.08 + uSunColor * shadow * band * 0.9 + pointLightsAt(vWorldPos, n, 0.4);
  vec3 col = albedo * light;
  vec3 v = normalize(uCamPos - vWorldPos);
  float back = max(dot(-v, uSunDir), 0.0);
  // sun shining through the leaves when riding into it
  col += albedo * uSunColor * leaf * pow(back, 3.0) * (0.15 + 0.5 * shadow) * 0.75;
  gl_FragColor = vec4(col, 1.0);
}
`;

const DEPTH_FRAG = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D tAtlas;
varying vec2 vUv;
varying float vFade;
void main() {
  if (texture2D(tAtlas, vUv).a < 0.5) discard;
  if (vFade > 0.0 && bayer4(gl_FragCoord.xy) < vFade) discard;
  gl_FragColor = vec4(1.0);
}
`;

function createMaterials(extra, defines = {}) {
  const uniforms = worldUniforms({
    uShake: { value: Array.from({ length: 8 }, () => new THREE.Vector4(-1, 0, 0, 0)) },
    uLod: { value: 1 },
    ...extra,
  });
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true, side: THREE.DoubleSide, defines });
  const depth = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide, defines: { ...defines, DEPTH_PASS: '' } });
  mat.userData.depth = depth;
  return mat;
}

// a card split into four rows, so the wind and shakes bend it rather than shear it
const CARD = new THREE.PlaneGeometry(1, 1, 1, 4);

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
      finish(job, bakeSprite(job));
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
  // each worker takes the next job until none are left; jobs of a failed worker
  // bake on the main thread once every worker has retired
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
        if (error) { console.warn('sprite bake failed in worker', error); leftovers.push(jobs[id]); } else finish(jobs[id], res);
        w.busy = -1;
        give(w);
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        console.warn('sprite worker unavailable, baking on the main thread');
        if (w.busy >= 0) leftovers.push(jobs[w.busy]);
        w.busy = -1;
        w.onmessage = w.onerror = null;
        retire(w);
      };
      give(w);
    }
  });
}

// Shelf-pack every view into one atlas. Rects sit on a 16 px grid with a 16 px
// gutter so the first four mips never bleed between sprites.
function packAtlas(views) {
  const AW = 2048, AL = 16;
  const order = [...views].sort((a, b) => b.h - a.h);
  let x = 0, y = 0, shelf = 0;
  for (const v of order) {
    const w = Math.ceil((v.w + AL) / AL) * AL, h = Math.ceil((v.h + AL) / AL) * AL;
    if (x + w > AW) { x = 0; y += shelf; shelf = 0; }
    v.x = x + AL / 2; v.y = y + AL / 2;
    x += w;
    shelf = Math.max(shelf, h);
  }
  let AH = 256;
  while (AH < y + shelf) AH *= 2;
  const data = new Uint8Array(AW * AH * 4);
  for (const v of views) {
    for (let j = 0; j < v.h; j++) data.set(v.data.subarray(j * v.w * 4, (j + 1) * v.w * 4), ((v.y + j) * AW + v.x) * 4);
  }
  return { data, w: AW, h: AH };
}

// Coverage-keeping mips: a texel is solid when 2 of its 4 children are; its
// colour is their mean and its alpha (the packed normal) the first one's.
function mipChain(data, w, h) {
  const out = [{ data, width: w, height: h }];
  let src = data, sw = w, sh = h;
  while (sw > 1 || sh > 1) {
    const dw = Math.max(1, sw >> 1), dh = Math.max(1, sh >> 1);
    const dst = new Uint8Array(dw * dh * 4);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let n = 0, r = 0, g = 0, b = 0, a = 0;
      for (let q = 0; q < 4; q++) {
        const o = (Math.min(sh - 1, 2 * y + (q >> 1)) * sw + Math.min(sw - 1, 2 * x + (q & 1))) * 4;
        if (src[o + 3] < 128) continue;
        if (!n) a = src[o + 3];
        n++; r += src[o]; g += src[o + 1]; b += src[o + 2];
      }
      if (n < 2) continue;
      const o = (y * dw + x) * 4;
      dst[o] = r / n; dst[o + 1] = g / n; dst[o + 2] = b / n; dst[o + 3] = a;
    }
    out.push({ data: dst, width: dw, height: dh });
    src = dst; sw = dw; sh = dh;
  }
  return out;
}

function atlasTexture(data, w, h) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.mipmaps = mipChain(data, w, h);
  t.generateMipmaps = false;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapNearestFilter;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function hash(x, z) {
  let h = Math.imul(Math.floor(x * 73.1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(z * 41.7), 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- the forest
const _f = new THREE.Vector3();

export class Forest2D {
  constructor(forest) {
    this.forest = forest;
    forest.renderer = this;
    this.group = new THREE.Group();
    this.group.name = 'forest-2d';
    this.lodScale = 1;
    this.last = new THREE.Vector3(1e9, 0, 1e9);
    this._dir = new THREE.Vector3();
    this._key = '';
    this.models = new Map();
    this.shakes = [];
    this.stats = {};
  }

  async build(onProgress) {
    const trees = this.forest.trees;
    const species = [...new Set(trees.map((t) => t.species))].filter((sp) => SPRITES[sp]);
    // the lumber camp maple is always needed by the prologue
    if (!species.includes('maple')) species.push('maple');
    const jobs = [];
    for (const sp of species) for (let seed = 0; seed < SPRITES[sp].variants.length; seed++) jobs.push({ key: `${sp}:${seed}`, species: sp, seed, big: SPRITES[sp].kind === 'tree' });
    jobs.sort((a, b) => b.big - a.big);
    const t0 = performance.now();
    const baked = await bakeAll(jobs, onProgress);
    this.stats.bakeMs = Math.round(performance.now() - t0);

    // ---- atlas + frame table (per view: uv rect; size m + anchor; sway, far, views)
    const views = [];
    for (const job of jobs) {
      const r = baked.get(job.key);
      const spec = SPRITES[job.species];
      const M = { key: job.key, species: job.species, seed: job.seed, kind: spec.kind, H: spec.H, meta: r.meta, frame: views.length, views: r.views.length, ppm: r.ppm };
      for (const v of r.views) { v.ppm = r.ppm; v.M = M; views.push(v); }
      this.models.set(job.key, M);
    }
    const t1 = performance.now();
    const A = packAtlas(views);
    this.atlas = { w: A.w, h: A.h, texture: atlasTexture(A.data, A.w, A.h) };
    this.stats.atlas = `${A.w}x${A.h}`;
    this.stats.packMs = Math.round(performance.now() - t1);
    const ft = new Float32Array(views.length * 4 * 4);
    views.forEach((v, i) => {
      const K = KIND[v.M.kind] || KIND.tree;
      const o = i * 16;
      ft.set([v.x / A.w, v.y / A.h, (v.x + v.w) / A.w, (v.y + v.h) / A.h], o);
      ft.set([v.w / v.ppm, v.h / v.ppm, v.ax / v.w, v.ay / v.h], o + 4);
      ft.set([K.sway, K.far, v.M.views, 0], o + 8);
    });
    this.frameData = ft;
    this.views = views.map(({ x, y, w, h, ax, ay, ppm, M }) => ({ x, y, w, h, ax, ay, ppm, M })); // pixels go with the atlas
    this.frames = new THREE.DataTexture(ft, 4, views.length, THREE.RGBAFormat, THREE.FloatType);
    this.frames.magFilter = this.frames.minFilter = THREE.NearestFilter;
    this.frames.needsUpdate = true;

    // ---- per-tree instance data
    const n = trees.length;
    this.n = n;
    this.P = new Float32Array(n * 4); // x, y, z, +-scale
    this.I = new Float32Array(n * 4); // frame, id, yaw, tint
    this.FAR = new Float32Array(n);
    this.MOD = new Array(n).fill(null);
    this.HID = new Uint8Array(n);
    const half = this.forest.half ?? 320;
    for (let i = 0; i < n; i++) {
      const t = trees[i];
      t.fi = i;
      const spec = SPRITES[t.species];
      if (!spec) continue;
      const nv = spec.variants.length;
      t.vseed = (t.vseed ?? Math.floor(hash(t.x, t.z) * nv)) % nv;
      const M = this.models.get(`${t.species}:${t.vseed}`);
      if (!M) continue;
      t.vkey = t.vkeyBaked = M.key;
      t.chunk = t.chunk ?? `${Math.floor((t.x + half) / 64)},${Math.floor((t.z + half) / 64)}`;
      const h2 = hash(t.z, t.x);
      let sc = M.kind === 'tree' ? Math.max(0.6, Math.min(1.5, (t.H || M.H) / M.H)) : 0.85 + h2 * 0.3;
      if (M.kind === 'log') sc = 1;
      t.vscale = t.vscale ?? sc;
      t.vyaw = t.vyaw ?? hash(t.x * 1.7, t.z * 0.3) * Math.PI * 2;
      const flip = M.views === 1 && hash(t.x * 0.61, t.z * 2.3) < 0.5 ? -1 : 1;
      this.P.set([t.x, t.y, t.z, t.vscale * flip], i * 4);
      this.I.set([M.frame, i, t.vyaw, hash(t.x * 0.37, t.z * 1.9) * 2 - 1], i * 4);
      this.FAR[i] = (KIND[M.kind] || KIND.tree).far;
      this.MOD[i] = M;
    }

    // ---- spatial cells
    const cells = new Map();
    for (let i = 0; i < n; i++) {
      const M = this.MOD[i];
      if (!M) continue;
      const t = trees[i];
      const cx = Math.floor(t.x / CELL), cz = Math.floor(t.z / CELL);
      const k = `${cx},${cz}`;
      let c = cells.get(k);
      if (!c) cells.set(k, (c = { list: [], x: (cx + 0.5) * CELL, z: (cz + 0.5) * CELL, rmax: 0, far: 0 }));
      c.list.push(i);
      c.rmax = Math.max(c.rmax, (M.H * t.vscale) * 0.5);
      c.far = Math.max(c.far, this.FAR[i]);
    }
    this.cells = [...cells.values()].map((c) => ({ ...c, list: Int32Array.from(c.list), r: CELL * 0.7072 + c.rmax }));
    this.cellOf = new Int32Array(n).fill(-1);
    this.cells.forEach((c, k) => { for (const i of c.list) this.cellOf[i] = k; });

    // ---- the instanced mesh
    const g = new THREE.InstancedBufferGeometry();
    g.index = CARD.index;
    g.setAttribute('position', CARD.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aInfo = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos);
    g.setAttribute('iInfo', this.aInfo);
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = createMaterials({ tAtlas: { value: this.atlas.texture }, tFrames: { value: this.frames } });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.customDepthMaterial = this.material.userData.depth;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.name = 'forest-sprites';
    this.group.add(this.mesh);
    this.stats.models = this.models.size;
    this.stats.views = views.length;
    return this.group;
  }

  // ---------------------------------------------------------------- contract API
  // A standalone tree (cutscenes): pivot at the trunk base, upright, metres; the
  // card turns about the tree's own axis to face the camera, so it still reads
  // while it falls. makeTree('maple', 1); userData.meta = { height, trunkR }.
  makeTree(species, seed = 0) {
    const M = this.models.get(`${species}:${seed}`) || [...this.models.values()].find((m) => m.species === species);
    if (!M) return null;
    const ft = this.frameData.subarray(M.frame * 16, M.frame * 16 + 16);
    return singleCard(this.atlas.texture, ft, M);
  }

  // hide trees (cutscene stages) or bring them back
  setHidden(trees, hidden = true) {
    for (const t of trees) t.vkey = hidden ? null : t.vkeyBaked ?? t.vkey;
    this.last.set(1e9, 0, 1e9);
  }

  // A springy wobble of one tree (power 0..1+), with leaves shaken out of it.
  // Safe to call every frame: a weaker shake never cuts a stronger one short.
  shake(tree, power = 1) {
    const i = tree?.fi ?? this.forest.trees.indexOf(tree);
    if (i == null || i < 0 || !this.MOD?.[i]) return;
    const now = G.uTime.value;
    const p = Math.min(1.6, Math.max(0.05, power));
    let s = this.shakes.find((e) => e.id === i);
    if (s) {
      const left = s.p * Math.exp(-(now - s.t0) * 2.6);
      if (left > p * 0.8) return;
    } else {
      if (this.shakes.length >= 8) this.shakes.sort((a, b) => a.t0 - b.t0).shift();
      s = { id: i };
      this.shakes.push(s);
    }
    s.t0 = now; s.p = p;
    this.syncShakes();
    // leaves
    const fx = this.effects || globalThis.__game?.game?.effects;
    if (!fx?.spawnLeaf || !LEAFY.test(tree.species)) return;
    const M = this.MOD[i], H = M.H * (tree.vscale || 1);
    const crown = M.kind === 'tree' ? H * 0.32 : 0.5;
    const nl = Math.round((M.kind === 'tree' ? 5 + 16 * p : 2 + 5 * p));
    for (let k = 0; k < nl; k++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * crown;
      fx.spawnLeaf(tree.x + Math.cos(a) * d, tree.y + H * (M.kind === 'tree' ? 0.45 + Math.random() * 0.45 : 0.6), tree.z + Math.sin(a) * d, { vx: Math.cos(a) * p, vy: (Math.random() - 0.3) * p * 1.5, vz: Math.sin(a) * p });
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
    const U = this.material.uniforms.uShake.value;
    for (let k = 0; k < 8; k++) {
      const s = this.shakes[k];
      if (s) U[k].set(s.id, s.t0, s.p, 0);
      else U[k].set(-1, 0, 0, 0);
    }
  }

  syncHidden() {
    const trees = this.forest.trees;
    for (let i = 0; i < this.n; i++) this.HID[i] = this.MOD[i] && !trees[i].vkey ? 1 : 0;
  }

  // ---------------------------------------------------------------- per frame
  update(pos, camera) {
    if (!this.mesh) return;
    // retire finished shakes
    if (this.shakes.length) {
      const now = G.uTime.value, n0 = this.shakes.length;
      this.shakes = this.shakes.filter((s) => now - s.t0 < 3.5 && now >= s.t0 - 1);
      if (this.shakes.length !== n0) this.syncShakes();
    }
    this.material.uniforms.uLod.value = this.lodScale;
    if (this.last.x === 1e9) this.syncHidden();
    const fwd = this._dir;
    if (camera) camera.getWorldDirection(fwd);
    else fwd.set(0, 0, -1);
    const key = camera ? `${camera.fov.toFixed(1)},${camera.aspect.toFixed(2)},${this.lodScale}` : `${this.lodScale}`;
    const dx = pos.x - this.last.x, dz = pos.z - this.last.z;
    const turned = this._lastDir ? fwd.dot(this._lastDir) < 0.985 : true;
    if (dx * dx + dz * dz < 9 && !turned && key === this._key) return;
    this.last.copy(pos);
    (this._lastDir ||= new THREE.Vector3()).copy(fwd);
    this._key = key;
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
    return Math.min(Math.PI, best + THREE.MathUtils.degToRad(12));
  }

  // cells in the view wedge (or near enough to shadow it), nearest first
  refill(pos, fwd, half) {
    const S = this.lodScale;
    const cx = pos.x, cz = pos.z;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    const fx = fwd.x / fl, fz = fwd.z / fl;
    const all = half >= Math.PI - 1e-3;
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
    const list = this._cells || (this._cells = []);
    list.length = 0;
    for (const c of this.cells) {
      const d = Math.hypot(c.x - cx, c.z - cz);
      if (d - c.r > c.far * S) continue;
      if (d - c.r > SHADOW_R && !inView(c.x, c.z, c.r)) continue;
      c.d = d;
      list.push(c);
    }
    list.sort((a, b) => a.d - b.d);
    const P = this.aPos.array, I = this.aInfo.array, SP = this.P, SI = this.I, FAR = this.FAR, HID = this.HID;
    let ni = 0;
    for (const c of list) {
      const cut = c.d - c.r;
      const ids = c.list;
      for (let q = 0; q < ids.length; q++) {
        const i = ids[q];
        if (HID[i] || cut > FAR[i] * S) continue;
        const o = ni * 4, j = i * 4;
        P[o] = SP[j]; P[o + 1] = SP[j + 1]; P[o + 2] = SP[j + 2]; P[o + 3] = SP[j + 3];
        I[o] = SI[j]; I[o + 1] = SI[j + 1]; I[o + 2] = SI[j + 2]; I[o + 3] = SI[j + 3];
        ni++;
      }
    }
    const g = this.mesh.geometry;
    g.instanceCount = ni;
    this.mesh.visible = ni > 0;
    for (const a of [this.aPos, this.aInfo]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, ni * 4);
      a.needsUpdate = true;
    }
    this.stats.drawn = ni;
    this.stats.cells = list.length;
  }
}

// one card with its own uniforms (shared atlas texture and shader)
function singleCard(texture, ft, M) {
  const mat = createMaterials({
    tAtlas: { value: texture },
    uRect: { value: new THREE.Vector4(ft[0], ft[1], ft[2], ft[3]) },
    uSize: { value: new THREE.Vector4(ft[4], ft[5], ft[6], ft[7]) },
    uParams: { value: new THREE.Vector4(ft[8], ft[9], 1, 0) },
  }, { SINGLE: '' });
  const mesh = new THREE.Mesh(CARD, mat);
  mesh.customDepthMaterial = mat.userData.depth;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = `${M.key}/single`;
  mesh.userData.meta = M.meta;
  return mesh;
}

// A tree card that needs no forest (the loading scene, tools): pixels one
// sprite on the spot into its own little texture. Same object as makeTree().
export function makeTreeSprite(species, seed = 0) {
  const spec = SPRITES[species];
  if (!spec) return null;
  const r = bakeSprite({ species, seed });
  const v = r.views[0];
  const tex = atlasTexture(v.data, v.w, v.h);
  const ft = [0, 0, 1, 1, v.w / r.ppm, v.h / r.ppm, v.ax / v.w, v.ay / v.h, (KIND[spec.kind] || KIND.tree).sway, 1e5, 1, 0];
  return singleCard(tex, ft, { key: `${species}:${seed}`, meta: r.meta });
}
