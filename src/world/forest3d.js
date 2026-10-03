// The near and middle forest in real 3D (models from art/trees3d.js): trunks and
// limbs carrying hundreds of pixel-art leaf cards per tree.
//  - Three instanced draw calls (near trees, middle trees, near bushes/ferns/
//    saplings); each instance pulls its own model's vertices out of a float
//    texture by gl_VertexID, so every species shares one call.
//  - Wind: the whole tree leans and sways (gusts roll across the forest along
//    the wind), limbs bend on their own phase and every leaf flutters.
//  - Hank: leaves, twigs and bushes near him bend away and rustle harder the
//    faster he goes; riding through bushes and saplings gives each one a springy
//    shake. shake(tree, power) wobbles a whole tree away from him and shakes
//    its leaves loose.
//  - Lighting: the crown is shaded as one soft volume (crown + clump normals,
//    baked depth), quantised into the palette's five tones, with the real
//    shadow map (dappled light through the cards) and sun shining through the
//    leaves when riding into it.
//  - LOD: near (full), middle (fewer, bigger cards), then the 2D sprites of
//    forest2d.js; neighbours cross-fade with a complementary dither.
import * as THREE from 'three';
import { G, worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL } from '../render/shaderlib.js';
import { CLASSES, ROW_W, TREE3D, SMALL3D, LEAFY3D, ATLAS_N, LEAF_TILE_MAX, buildAtlas, rampData, buildModel, classIndex } from '../art/trees3d.js';
import { SPRITES } from '../art/trees2d.js';

export const SHAKES = 16;
// LOD radii (m, times lodScale) and dither bands
export const LOD3 = { near: 40, mid: 125, small: 30, band: 7, bandFar: 14 };

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${NOISE_GLSL}
uniform sampler2D tVerts;
uniform vec4 uShake[${SHAKES}];
uniform vec4 uLodR; // near, mid, band, band far (m)
uniform vec4 uPlayerVel; // xyz, speed
uniform vec3 uCamPos;
uniform vec3 uPlayer;
#ifdef SINGLE
uniform float uModel;
uniform float uHeight;
#else
attribute vec4 iPos;  // x y z scale
attribute vec4 iInfo; // model, tree id, yaw, height (m)
#endif
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorldPos;
varying vec2 vKeep;
varying float vTile;
varying float vPal;
varying float vAo;
varying float vLeaf;
varying float vTint;

vec4 fetchV(int k, int model) {
  int i = gl_VertexID * 4 + k;
  return texelFetch(tVerts, ivec2(i % ${ROW_W}, model * ROWS + i / ${ROW_W}), 0);
}
void main() {
#ifdef SINGLE
  int model = int(uModel + 0.5);
  float id = -9.0;
  vec3 base = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float sc = length(modelMatrix[1].xyz);
  float Hs = uHeight * sc;
#else
  int model = int(iInfo.x + 0.5);
  float id = iInfo.y;
  vec3 base = iPos.xyz;
  float sc = iPos.w;
  float Hs = iInfo.w;
#endif
  // ---- LOD: which share of the dither this instance keeps
  float dist = length(uCamPos - base);
  vec2 keep = vec2(0.0, 1.0);
#ifndef SINGLE
#if defined(CLASS_NEAR)
  keep.y = 1.0 - smoothstep(uLodR.x - uLodR.z, uLodR.x, dist);
#elif defined(CLASS_MID)
  keep.x = 1.0 - smoothstep(uLodR.x - uLodR.z, uLodR.x, dist);
  keep.y = 1.0 - smoothstep(uLodR.y - uLodR.w, uLodR.y, dist);
#ifdef DEPTH_PASS
  if (dist > 95.0) keep.y = 0.0; // no shadows beyond the shadow map
#endif
#else
  keep.y = 1.0 - smoothstep(uLodR.x - uLodR.z, uLodR.x, dist);
#endif
#endif
  if (keep.y <= keep.x + 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vKeep = keep;

  vec4 T0 = fetchV(0, model), T1 = fetchV(1, model), T2 = fetchV(2, model), T3 = fetchV(3, model);
  vec3 p = T0.xyz;
  float flex = T0.w;
  float leaf = step(T2.z, ${LEAF_TILE_MAX}.5);
#ifdef SINGLE
  vec3 lp = (modelMatrix * vec4(p, 1.0)).xyz - base;
  vec3 nrm = normalize(mat3(modelMatrix) * T1.xyz);
  vec3 anc = (modelMatrix * vec4(T3.xyz, 1.0)).xyz - base;
  vec3 upv = modelMatrix[1].xyz / sc;
  float hfr = clamp(dot(lp, upv) / max(Hs, 0.1), 0.0, 1.2);
#else
  float c = cos(iInfo.z), s = sin(iInfo.z);
  mat3 rot = mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c);
  vec3 lp = rot * p * sc;
  vec3 nrm = rot * T1.xyz;
  vec3 anc = rot * T3.xyz * sc;
  float hfr = clamp(lp.y / max(Hs, 0.1), 0.0, 1.2);
#endif
  float t = uTime;
  vec2 wd = normalize(uWind + vec2(1e-4, 0.0));
  vec3 W = vec3(wd.x, 0.0, wd.y);
  vec3 Pp = vec3(-wd.y, 0.0, wd.x);
  float ws = uWindStrength;
  float treePh = hash12(floor(base.xz * 3.1)) * 6.2832;
  // gusts rolling across the forest with the wind
  float g1 = dot(base.xz, wd) * 0.05 - t * 1.1;
  float gust = 0.5 + 0.5 * sin(g1) * (0.55 + 0.45 * sin(g1 * 0.43 + 1.3));
  gust = gust * (0.65 + 0.7 * vnoise(base.xz * 0.025 - wd * t * 0.45));
  float wsg = ws * (0.35 + gust);

  // ---- whole tree: lean with the wind and sway around it
  float swayA = wsg * 0.75 + (sin(t * 0.8 + treePh) * 0.35 + sin(t * 1.9 + treePh * 1.7) * 0.12) * (0.25 + ws);
  float k2 = hfr * hfr;
  vec3 off = (W * swayA + Pp * sin(t * 0.63 + treePh * 2.1) * 0.25 * (0.2 + ws)) * k2 * (Hs * 0.028 + 0.05);

  // ---- limbs and twigs on their own phase
  float bph = T3.w;
  float fb = flex * flex;
  off += (W * (wsg * 0.5 + sin(t * 2.1 + bph) * 0.3 * (0.25 + ws)) + Pp * sin(t * 1.55 + bph * 1.7) * 0.22 * (0.25 + ws)
        + vec3(0.0, sin(t * 2.7 + bph) * 0.14 * (0.25 + ws), 0.0)) * fb * (0.06 + Hs * 0.022);

  // ---- shakes: a springy wobble away from the hit, leaves thrashing
  float shk = 0.0;
  for (int i = 0; i < ${SHAKES}; i++) {
    vec4 S = uShake[i];
    if (abs(S.x - id) < 0.5) {
      float a = max(t - S.y, 0.0);
      float e = S.z * exp(-a * 2.4);
      float w = 7.0 + 13.0 / sqrt(max(Hs, 0.5));
      vec3 sd = vec3(cos(S.w), 0.0, sin(S.w));
      off += sd * sin(a * w) * e * pow(hfr, 1.5) * (Hs * 0.055 + 0.22);
      off += (sd * sin(a * w * 1.7 + bph) + vec3(0.0, cos(a * w * 2.1 + bph), 0.0) * 0.5) * e * fb * 0.12;
      shk += e;
    }
  }

  // ---- Hank: everything near him bends away, harder the faster he rides
  vec3 wp0 = base + lp + off;
  vec3 away = wp0 - uPlayer;
  float pd = length(away.xz);
  float spd = uPlayerVel.w;
  float reach = 1.1 + min(spd, 8.0) * 0.06;
  float push = (1.0 - smoothstep(0.25, reach, pd)) * smoothstep(-0.7, 0.1, away.y) * (1.0 - smoothstep(2.0, 3.0, away.y));
  vec2 pdir = normalize(away.xz + uPlayerVel.xz * 0.06 + vec2(1e-4, 0.0));
  float pf = push * flex;
  off.xz += pdir * pf * (0.55 + min(spd, 8.0) * 0.04);
  off.y -= pf * 0.12;
  float rustle = push * min(spd * 0.2, 1.0);

  // ---- leaves flutter about their own centre
  if (leaf > 0.5) {
    vec3 co = lp - anc;
    float lph = hash13(floor(anc * 13.0)) * 6.2832;
    float fl = sin(t * (6.0 + lph * 0.5) + lph) * (0.1 + 0.45 * wsg * (0.4 + flex));
    fl += (shk * 0.7 + rustle * 0.8) * sin(t * 23.0 + lph * 3.0);
    vec3 ax = normalize(vec3(sin(lph * 3.0), 0.7, cos(lph * 2.0)));
    off += cross(ax, co) * fl * 0.55;
  }
  vec3 wp = base + lp + off;

  vUv = T2.xy;
  vTile = T2.z;
  vPal = T2.w;
  vN = nrm;
  vAo = T1.w;
  vLeaf = leaf;
  vTint = hash12(base.xz * 0.37) * 2.0 - 1.0;
  vWorldPos = wp;
  vec4 worldPosition = vec4(wp, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
#ifndef DEPTH_PASS
  vec3 transformedNormal = (viewMatrix * vec4(nrm, 0.0)).xyz;
  worldPosition.xyz += uSunDir * 0.12 + nrm * 0.05;
#endif
  ${SHADOW_VERT}
}
`;

const SAMPLE = /* glsl */ `
vec4 sampleTile() {
  float tile = floor(vTile + 0.5);
  vec2 local = vLeaf > 0.5 ? clamp(vUv, 0.0, 1.0) : fract(vUv);
  local = (0.5 + local * ${(32 - 1).toFixed(1)}) / 32.0;
  vec2 o = vec2(mod(tile, ${ATLAS_N}.0), floor(tile / ${ATLAS_N}.0));
  vec2 g = vUv / ${ATLAS_N}.0;
  return textureGrad(tAtlas, (o + local) / ${ATLAS_N}.0, dFdx(g), dFdy(g));
}
`;

const FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
uniform sampler2D tAtlas;
uniform sampler2D tRamp;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vWorldPos;
varying vec2 vKeep;
varying float vTile;
varying float vPal;
varying float vAo;
varying float vLeaf;
varying float vTint;
${SAMPLE}
void main() {
  float b = bayer4(gl_FragCoord.xy);
  if (b < vKeep.x || b >= vKeep.y) discard;
  if (vWorldPos.y < uClipY) discard;
  vec4 tx = sampleTile();
  if (tx.a < 0.5) discard;
  vec3 n = normalize(vN);
  if (vLeaf < 0.5 && !gl_FrontFacing) n = -n;
  float shadow = getShadowMask();
  float ndl = dot(n, uSunDir);
  float wrapD = clamp(ndl * 0.55 + 0.45, 0.0, 1.0);
  float lit = wrapD * shadow;
  vec3 v = normalize(uCamPos - vWorldPos);
  float back = pow(max(dot(-v, uSunDir), 0.0), 3.0) * vLeaf;
  // shade + light -> one of the palette's five tones (crisp bands, a little dither)
  float idx = tx.r * 0.62 + lit * 0.42 + vAo * 0.22 - 0.2 + back * shadow * 0.25 + vTint * 0.03;
  idx += (b - 0.5) * 0.1;
  int k = int(clamp(floor(idx * 5.0), 0.0, 4.0));
  float pal = floor(vPal + 0.5);
  float row = tx.g > 0.5 ? floor(pal / 64.0) : mod(pal, 64.0);
  vec3 albedo = texelFetch(tRamp, ivec2(k, int(row)), 0).rgb;
  albedo *= mix(vec3(1.0), vec3(1.0 + vTint * 0.06, 1.0 + vTint * 0.02, 1.0 - vTint * 0.05), vLeaf);
  if (uSnow > 0.0 && n.y > 0.3) {
    float h = hash12(floor(vWorldPos.xz * 6.0) + floor(vWorldPos.y * 6.0) * 7.0);
    if (h < uSnow * 1.2 - 0.1) albedo = mix(albedo, h > uSnow * 0.9 ? vec3(0.72, 0.78, 0.92) : vec3(0.92, 0.94, 0.99), 0.9);
  }
  albedo *= 1.0 - uWet * 0.2;
  float ao = 0.55 + 0.45 * vAo;
  vec3 light = hemiAmbient(n) * ao * 1.05 + uSunColor * (0.12 + 0.62 * lit) + pointLightsAt(vWorldPos, n, 0.5);
  vec3 col = albedo * light;
  // sun shining through the leaves when riding into it
  col += albedo * uSunColor * back * (0.2 + 0.6 * shadow) * 0.8;
  gl_FragColor = vec4(col, 1.0);
}
`;

const DEPTH_FRAG = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D tAtlas;
varying vec2 vUv;
varying vec2 vKeep;
varying float vTile;
varying float vLeaf;
${SAMPLE}
void main() {
  float b = bayer4(gl_FragCoord.xy);
  if (b < vKeep.x || b >= vKeep.y) discard;
  if (sampleTile().a < 0.5) discard;
  gl_FragColor = vec4(1.0);
}
`;

// ---------------------------------------------------------------- shared textures
let kit = null;
function getKit() {
  if (kit) return kit;
  const A = buildAtlas();
  const atlas = new THREE.DataTexture(A.data, A.w, A.h, THREE.RGBAFormat);
  atlas.mipmaps = tileMips(A.data, A.w, A.h);
  atlas.generateMipmaps = false;
  atlas.magFilter = THREE.NearestFilter;
  atlas.minFilter = THREE.NearestMipmapNearestFilter;
  atlas.colorSpace = THREE.NoColorSpace;
  atlas.needsUpdate = true;
  const Rm = rampData();
  const ramp = new THREE.DataTexture(Rm.data, Rm.w, Rm.h, THREE.RGBAFormat);
  ramp.colorSpace = THREE.SRGBColorSpace;
  ramp.magFilter = ramp.minFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  kit = { atlas, ramp, shake: { value: Array.from({ length: SHAKES }, () => new THREE.Vector4(-1, 0, 0, 0)) }, lod: { value: new THREE.Vector4(LOD3.near, LOD3.mid, LOD3.band, LOD3.bandFar) }, vel: { value: new THREE.Vector4() } };
  return kit;
}

// the shake slots, shared with the 2D sprites: (tree id, start time, power, direction)
export const shakeUniform = () => getKit().shake;

// coverage-keeping mips (a texel is solid when 2 of its 4 children are), down to 1 px per tile
function tileMips(data, w, h) {
  const out = [{ data, width: w, height: h }];
  let src = data, sw = w, sh = h;
  while (sw > 1 || sh > 1) {
    const dw = Math.max(1, sw >> 1), dh = Math.max(1, sh >> 1);
    const dst = new Uint8Array(dw * dh * 4);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let n = 0, r = 0, g = 0;
      for (let q = 0; q < 4; q++) {
        const o = ((2 * y + (q >> 1)) * sw + 2 * x + (q & 1)) * 4;
        if (src[o + 3] < 128) continue;
        n++; r += src[o]; g += src[o + 1];
      }
      if (n < 2) continue;
      const o = (y * dw + x) * 4;
      dst[o] = r / n; dst[o + 1] = g / n > 127 ? 255 : 0; dst[o + 3] = 255;
    }
    out.push({ data: dst, width: dw, height: dh });
    src = dst; sw = dw; sh = dh;
  }
  return out;
}

function vertTexture(models, rows) {
  const data = new Float32Array(Math.max(1, models.length) * rows * ROW_W * 4);
  models.forEach((m, i) => data.set(m.data, i * rows * ROW_W * 4));
  const t = new THREE.DataTexture(data, ROW_W, Math.max(1, models.length) * rows, THREE.RGBAFormat, THREE.FloatType);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

function materials(cls, tVerts, extra = {}, defines = {}) {
  const K = getKit();
  const uniforms = worldUniforms({
    tVerts: { value: tVerts },
    tAtlas: { value: K.atlas },
    tRamp: { value: K.ramp },
    uShake: K.shake,
    uLodR: K.lod,
    uPlayerVel: K.vel,
    ...extra,
  });
  if (cls === 'small') uniforms.uLodR = { value: new THREE.Vector4(LOD3.small, LOD3.small, LOD3.band * 0.7, LOD3.band) };
  const def = { ROWS: CLASSES[cls].rows, [`CLASS_${cls.toUpperCase()}`]: '', ...defines };
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true, side: THREE.DoubleSide, defines: def });
  const depth = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide, defines: { ...def, DEPTH_PASS: '' } });
  mat.userData.depth = depth;
  return mat;
}

const indexCache = {};
function geometryFor(cls, instanced) {
  const C = CLASSES[cls];
  if (!indexCache[cls]) {
    const idx = classIndex(cls);
    indexCache[cls] = { index: new THREE.Uint16BufferAttribute(idx, 1), pos: new THREE.BufferAttribute(new Float32Array(C.verts * 3), 3) };
  }
  const g = instanced ? new THREE.InstancedBufferGeometry() : new THREE.BufferGeometry();
  g.setIndex(indexCache[cls].index);
  g.setAttribute('position', indexCache[cls].pos);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

function hash(x, z) {
  let h = Math.imul(Math.floor(x * 73.1) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.floor(z * 41.7), 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- standalone tree
const singles = new Map();
// One 3D tree (cutscenes, the loading scene): pivot at the trunk base, upright,
// metres, real geometry so it reads from any angle while it rotates or falls.
// userData.meta = { height, trunkR }.
export function makeTree3D(species, seed = 0) {
  if (!TREE3D.has(species) && !SMALL3D.has(species)) return null;
  const nv = SPRITES[species].variants.length;
  const key = `${species}:${seed % nv}`;
  let S = singles.get(key);
  if (!S) {
    const cls = TREE3D.has(species) ? 'near' : 'small';
    const m = buildModel(species, seed % nv, cls);
    S = { cls, m, tex: vertTexture([m], CLASSES[cls].rows) };
    singles.set(key, S);
  }
  const mat = materials(S.cls, S.tex, { uModel: { value: 0 }, uHeight: { value: S.m.meta.height } }, { SINGLE: '' });
  const mesh = new THREE.Mesh(geometryFor(S.cls, false), mat);
  mesh.customDepthMaterial = mat.userData.depth;
  mesh.castShadow = mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.name = `${key}/tree3d`;
  mesh.userData.meta = { height: S.m.meta.height, trunkR: S.m.meta.trunkR };
  return mesh;
}

// ---------------------------------------------------------------- the forest
export class Forest3D {
  constructor(forest) {
    this.forest = forest;
    this.group = new THREE.Group();
    this.group.name = 'forest-3d';
    this.stats = {};
    this.kit = getKit();
    this.lastP = new THREE.Vector3(1e9, 0, 0);
    this.vel = new THREE.Vector3();
    this.touched = new Map();
    this.leafAcc = 0;
  }

  // per tree: class + model; instance data
  build(trees) {
    const t0 = performance.now();
    const keys = { near: new Map(), small: new Map() };
    const n = trees.length;
    this.CLS = new Uint8Array(n); // 0 none, 1 tree, 2 small
    this.P = new Float32Array(n * 4);
    this.I = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const t = trees[i];
      const big = TREE3D.has(t.species), small = SMALL3D.has(t.species);
      if (!big && !small) continue;
      const spec = SPRITES[t.species];
      const nv = spec.variants.length;
      const seed = (t.vseed ?? Math.floor(hash(t.x, t.z) * nv)) % nv;
      const key = `${t.species}:${seed}`;
      const map = big ? keys.near : keys.small;
      if (!map.has(key)) map.set(key, map.size);
      this.CLS[i] = big ? 1 : 2;
      const sc = t.vscale ?? 1;
      const H = big ? spec.H * sc : (t.species === 'fern' ? 0.9 : 1.3) * sc;
      this.P.set([t.x, t.y, t.z, sc], i * 4);
      this.I.set([map.get(key), i, t.vyaw ?? hash(t.x * 1.7, t.z * 0.3) * Math.PI * 2, H], i * 4);
    }
    // models
    const build = (map, cls) => [...map.keys()].map((k) => { const [sp, s] = k.split(':'); return buildModel(sp, +s, cls); });
    const nearM = build(keys.near, 'near'), midM = build(keys.near, 'mid'), smallM = build(keys.small, 'small');
    this.meta = nearM.map((m) => m.meta);
    this.modelKeys = [...keys.near.keys()];
    this.stats.models = `${nearM.length} trees, ${smallM.length} small`;
    this.stats.genMs = Math.round(performance.now() - t0);
    const mk = (cls, models, name) => {
      const tex = vertTexture(models, CLASSES[cls].rows);
      const g = geometryFor(cls, true);
      const aPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
      const aInfo = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('iPos', aPos);
      g.setAttribute('iInfo', aInfo);
      g.instanceCount = 0;
      const mat = materials(cls, tex);
      const mesh = new THREE.Mesh(g, mat);
      mesh.customDepthMaterial = mat.userData.depth;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.name = name;
      mesh.visible = false;
      this.group.add(mesh);
      return { mesh, aPos, aInfo, n: 0, tris: CLASSES[cls].seg * CLASSES[cls].sides * 2 + CLASSES[cls].cards * 2 };
    };
    this.L = { near: mk('near', nearM, 'trees3d-near'), mid: mk('mid', midM, 'trees3d-mid'), small: mk('small', smallM, 'plants3d') };
    // small plants on a 4 m grid for Hank to brush through
    this.plantGrid = new Map();
    for (let i = 0; i < n; i++) {
      if (!this.CLS[i]) continue;
      const t = trees[i];
      const k = `${Math.floor(t.x / 4)},${Math.floor(t.z / 4)}`;
      let a = this.plantGrid.get(k);
      if (!a) this.plantGrid.set(k, (a = []));
      a.push(i);
    }
    return this.group;
  }

  // the radii this frame (m)
  radii(S) {
    return { near: LOD3.near * S, mid: LOD3.mid * S, small: LOD3.small * S, band: LOD3.band, bandFar: LOD3.bandFar };
  }

  setLod(S) {
    const r = this.radii(S);
    this.kit.lod.value.set(r.near, r.mid, r.band, r.bandFar);
    this.L.small.mesh.material.uniforms.uLodR.value.set(r.small, r.small, r.band * 0.7, r.band);
    return r;
  }

  begin() {
    for (const k in this.L) this.L[k].n = 0;
  }

  // forest2d's refill hands every candidate tree here; returns true when the
  // sprite is still needed too (beyond / cross-fading with the 3D model)
  push(i, d, r) {
    const c = this.CLS[i];
    if (!c) return true;
    const m = 5; // the camera moves up to 3 m between refills
    if (c === 1) {
      if (d < r.near + m) this.add(this.L.near, i);
      if (d > r.near - r.band - m && d < r.mid + m) this.add(this.L.mid, i);
      return d > r.mid - r.bandFar - m;
    }
    if (d < r.small + m) this.add(this.L.small, i);
    return d > r.small - r.band - m;
  }

  add(L, i) {
    const o = L.n * 4, j = i * 4;
    const P = L.aPos.array, I = L.aInfo.array;
    P[o] = this.P[j]; P[o + 1] = this.P[j + 1]; P[o + 2] = this.P[j + 2]; P[o + 3] = this.P[j + 3];
    I[o] = this.I[j]; I[o + 1] = this.I[j + 1]; I[o + 2] = this.I[j + 2]; I[o + 3] = this.I[j + 3];
    L.n++;
  }

  end() {
    let tris = 0;
    for (const k in this.L) {
      const L = this.L[k];
      L.mesh.geometry.instanceCount = L.n;
      L.mesh.visible = L.n > 0;
      for (const a of [L.aPos, L.aInfo]) {
        a.clearUpdateRanges();
        a.addUpdateRange(0, L.n * 4);
        a.needsUpdate = true;
      }
      this.stats[k] = L.n;
      tris += L.n * L.tris;
    }
    this.stats.tris = tris;
  }

  // the crown of tree i in world space (for leaves falling out of it)
  crownOf(i) {
    if (this.CLS[i] !== 1) return null;
    const M = this.meta[this.I[i * 4]];
    const sc = this.P[i * 4 + 3], yaw = this.I[i * 4 + 2];
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const C = M.crown.c;
    return { x: this.P[i * 4] + (c * C[0] + s * C[2]) * sc, y: this.P[i * 4 + 1] + C[1] * sc, z: this.P[i * 4 + 2] + (-s * C[0] + c * C[2]) * sc, rx: M.crown.r[0] * sc, ry: M.crown.r[1] * sc };
  }

  // per frame: Hank's speed, brushing through plants, leaves drifting from crowns
  update(dt, owner) {
    const P = G.uPlayer.value;
    if (this.lastP.x === 1e9 || dt <= 0) this.lastP.copy(P);
    const k = Math.min(1, dt * 10);
    if (dt > 0) {
      const vx = (P.x - this.lastP.x) / dt, vy = (P.y - this.lastP.y) / dt, vz = (P.z - this.lastP.z) / dt;
      // a teleport is not a speed
      if (vx * vx + vz * vz < 900) this.vel.set(this.vel.x + (vx - this.vel.x) * k, this.vel.y + (vy - this.vel.y) * k, this.vel.z + (vz - this.vel.z) * k);
    }
    this.lastP.copy(P);
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.kit.vel.value.set(this.vel.x, this.vel.y, this.vel.z, spd);
    const now = G.uTime.value;
    const trees = this.forest.trees;
    const fx = owner.effects || globalThis.__game?.game?.effects;
    // brushing through bushes, saplings and ferns: each one springs aside and back
    if (spd > 0.8) {
      const gx = Math.floor(P.x / 4), gz = Math.floor(P.z / 4);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
        const list = this.plantGrid.get(`${gx + a},${gz + b}`);
        if (!list) continue;
        for (const i of list) {
          const t = trees[i];
          if (owner.HID?.[i]) continue;
          const dx = t.x - P.x, dz = t.z - P.z;
          const d = Math.hypot(dx, dz);
          const small = this.CLS[i] === 2;
          const r = small ? 0.95 : (t.trunk?.r ?? 0.3) + 1.6;
          if (d > r || Math.abs(t.y - P.y) > 2.5) continue;
          const last = this.touched.get(i) ?? -9;
          if (now - last < (small ? 0.6 : 1.5)) continue;
          this.touched.set(i, now);
          // conifers' low boughs only rustle; broadleaf crowns are out of reach
          if (!small && !/^(spruce|tamarack)/.test(t.species)) continue;
          const p = small ? Math.min(0.95, 0.25 + spd * 0.08) : Math.min(0.25, 0.05 + spd * 0.02);
          owner.shake(t, p, Math.atan2(this.vel.z, this.vel.x), true);
          if (small && fx?.spawnLeaf && LEAFY3D.test(t.species) && spd > 2.5) {
            const nL = 1 + Math.floor(Math.random() * Math.min(4, spd * 0.4));
            for (let q = 0; q < nL; q++) fx.spawnLeaf(t.x + (Math.random() - 0.5) * 0.8, t.y + 0.6 + Math.random() * 0.5, t.z + (Math.random() - 0.5) * 0.8, { vx: this.vel.x * 0.25 + (Math.random() - 0.5), vy: 0.8 + Math.random() * 1.5, vz: this.vel.z * 0.25 + (Math.random() - 0.5), gravity: 1.2, life: 6, rest: 3 });
          }
        }
      }
      if (this.touched.size > 400) for (const [i, tt] of this.touched) if (now - tt > 3) this.touched.delete(i);
    }
    // leaves let go of the near crowns, more in a gust
    const L = this.L.near;
    if (fx?.spawnLeaf && L.n > 0 && dt > 0) {
      this.leafAcc += dt * (1.2 + G.uWindStrength.value * 5);
      while (this.leafAcc > 1) {
        this.leafAcc -= 1;
        const i = L.aInfo.array[Math.floor(Math.random() * L.n) * 4 + 1];
        const t = trees[i];
        if (!t || !LEAFY3D.test(t.species)) continue;
        const C = this.crownOf(i);
        if (!C) continue;
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 0.9;
        const W = G.uWind.value, ws = G.uWindStrength.value;
        fx.spawnLeaf(C.x + Math.cos(a) * C.rx * rr, C.y + (Math.random() - 0.6) * C.ry, C.z + Math.sin(a) * C.rx * rr, { vx: W.x * ws * 1.5, vy: -0.2, vz: W.y * ws * 1.5 });
      }
    }
  }
}
