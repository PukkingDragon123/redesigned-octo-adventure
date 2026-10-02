// The autumn forest: thousands of trees built from billboard leaf clumps with
// pixel-art ramps, backlit translucency and wind; plus bushes, ferns, trunk colliders.
import * as THREE from 'three';
import { SPECIES, SPECIES_LIST, CLUMP, ATLAS_N, buildFoliageAtlas, buildBarkAtlas } from '../art/foliage.js';
import { pixTexture } from '../render/textures.js';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, WIND_GLSL } from '../render/shaderlib.js';
import { RNG, Simplex } from '../core/noise.js';
import { clamp, smoothstep } from '../core/math.js';
import { SpatialHash } from '../core/spatial.js';
import * as L from './layout.js';
import { forestNoise, villageMask } from './terrain.js';

const CHUNK = 64;
const sxA = new Simplex(5150);
const sxB = new Simplex(6160);

// ---------------------------------------------------------------- shaders
const BILLBOARD_GLSL = /* glsl */ `
// Billboard basis that only depends on camera position (so reflections & shadows stay consistent)
void billboardBasis(vec3 center, float upright, out vec3 right, out vec3 up) {
  vec3 fwd;
  if (projectionMatrix[3][3] == 1.0) {
    // orthographic (shadow camera): face along the view axis
    fwd = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
  } else {
    fwd = normalize(cameraPosition - center);
  }
  vec3 wup = vec3(0.0, 1.0, 0.0);
  right = normalize(cross(wup, fwd) + vec3(1e-5, 0.0, 0.0));
  vec3 sup = normalize(cross(fwd, right));
  up = normalize(mix(sup, wup, upright));
}
`;

const FOL_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${WIND_GLSL}
${BILLBOARD_GLSL}
attribute vec3 iPos;
attribute vec2 iSize;
attribute vec4 iInfo;   // species row, atlas cell, random, height factor
attribute vec4 iNorm;   // pseudo normal xyz, upright
uniform float uAtlasN;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vSpecies;
varying float vRand;
varying float vHF;
varying vec2 vQuad;
varying vec3 vViewPos;
varying float vBulge;
void main() {
  float rnd = iInfo.z;
  vec3 center = iPos + windOffset(iPos, iInfo.w, rnd * 6.283) * (0.35 + iInfo.w * 0.9);
  vec3 right, up;
  billboardBasis(center, iNorm.w, right, up);
  vec2 c = position.xy;
  float flip = rnd > 0.5 ? -1.0 : 1.0;
  // slight per-clump rotation for round clumps
  float ang = (fract(rnd * 7.31) - 0.5) * 0.7 * (1.0 - iNorm.w);
  vec2 rc = vec2(c.x * cos(ang) - c.y * sin(ang), c.x * sin(ang) + c.y * cos(ang));
  vec3 wp = center + right * rc.x * iSize.x + up * rc.y * iSize.y;
  vec4 worldPosition = vec4(wp, 1.0);
  vWorldPos = wp;
  // sphere-impostor normal: clump direction + position within the quad
  vec3 toCam = normalize(cross(right, up));
  vNormal = normalize(iNorm.xyz * 0.8 + right * c.x * 1.3 + up * c.y * 1.1 + toCam * 0.25);
  float cell = iInfo.y;
  vec2 cellUV = vec2(mod(cell, uAtlasN), floor(cell / uAtlasN));
  vec2 luv = vec2(c.x * flip + 0.5, 0.5 - c.y);
  vUv = (cellUV + luv) / uAtlasN;
  vSpecies = iInfo.x;
  vRand = rnd;
  vHF = iInfo.w;
  vQuad = c;
  vBulge = min(iSize.x, iSize.y) * 0.5;
  vec4 mvPosition = viewMatrix * worldPosition;
  vViewPos = mvPosition.xyz;
  vec3 transformedNormal = (viewMatrix * vec4(vNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  // look up shadows from a point nudged towards the sun by the clump radius, so a
  // clump never shadows itself (camera-facing vs light-facing quads intersect)
  worldPosition = vec4(wp + uSunDir * vBulge * 1.25, 1.0);
  ${SHADOW_VERT}
}
`;

const FOL_FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
uniform sampler2D tAtlas;
uniform sampler2D tRamp;
uniform float uRampRows;
uniform mat4 projectionMatrix;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying float vSpecies;
varying float vRand;
varying float vHF;
varying vec2 vQuad;
varying vec3 vViewPos;
varying float vBulge;
void main() {
  vec4 tx = texture2D(tAtlas, vUv);
  if (tx.a < 0.5) discard;
  if (vWorldPos.y < uClipY) discard;
  // sphere-impostor depth: clumps bulge towards the camera so overlapping
  // billboards intersect in soft curves instead of straight lines
  float rr = clamp(dot(vQuad, vQuad) * 4.0, 0.0, 1.0);
  vec3 vp = vViewPos + normalize(-vViewPos) * vBulge * sqrt(1.0 - rr) * 0.9;
  vec4 clip = projectionMatrix * vec4(vp, 1.0);
  gl_FragDepth = clamp((clip.z / clip.w) * 0.5 + 0.5, 0.0, 1.0);
  float val = tx.r;
  vec3 n = normalize(vNormal);
  float ndl = dot(n, uSunDir);
  float shadow = getShadowMask();
  vec3 v = normalize(uCamPos - vWorldPos);
  // backlit translucency - the glowing autumn canopy when riding into the sun
  float back = pow(max(dot(-v, uSunDir), 0.0), 2.5);
  float trans = back * (0.35 + 0.65 * smoothstep(0.2, 0.9, val)) * (0.4 + 0.6 * shadow);
  float lit = shadow * clamp(ndl * 0.65 + 0.35, 0.0, 1.0);
  // the ramp index carries most of the shading (pixel-art style)
  float idx = 0.1 + val * 0.62 + lit * 0.42 + trans * 0.4 + vHF * 0.05;
  idx += (bayer4(gl_FragCoord.xy) - 0.5) * 0.14;
  float k = clamp(floor(idx * 6.0), 0.0, 5.0);
  vec3 albedo = texture2D(tRamp, vec2((k + 0.5) / 6.0, (vSpecies + 0.5) / uRampRows)).rgb;
  // snow dusting on top-facing clumps
  if (uSnow > 0.0 && n.y > 0.35 && hash12(floor(vWorldPos.xz * 12.0) + floor(vWorldPos.y * 12.0)) < uSnow * (n.y - 0.2)) albedo = vec3(0.86, 0.9, 0.98);
  // compressed light range so shadowed canopy keeps its colour
  vec3 light = hemiAmbient(n) * 1.25 + uSunColor * (0.08 + 0.5 * lit);
  vec3 col = albedo * light;
  col += albedo * uSunColor * trans * 1.2;
  col += albedo * pointLightsAt(vWorldPos, n, 0.6);
  gl_FragColor = vec4(col, 1.0);
}
`;

const FOL_DEPTH_FRAG = /* glsl */ `
uniform sampler2D tAtlas;
varying vec2 vUv;
void main() {
  if (texture2D(tAtlas, vUv).a < 0.5) discard;
  gl_FragColor = vec4(1.0);
}
`;

const TRUNK_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${WIND_GLSL}
attribute vec4 iT0; // x y z height
attribute vec4 iT1; // radius yaw bark lean
attribute vec3 aRing;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying float vBark;
void main() {
  float hgt = iT0.w, rad = iT1.x, yaw = iT1.y;
  float cy = cos(yaw), sy = sin(yaw);
  vec3 p = position;
  vec3 lp = p * hgt + aRing * rad;
  // lean & wind sway near the top
  lp.x += iT1.w * p.y * p.y * hgt * 0.08;
  vec3 wp = vec3(cy * lp.x + sy * lp.z, lp.y, -sy * lp.x + cy * lp.z) + iT0.xyz;
  wp += windOffset(iT0.xyz, p.y * p.y * 0.25, yaw);
  vec3 nn = normal;
  vNormal = normalize(vec3(cy * nn.x + sy * nn.z, nn.y, -sy * nn.x + cy * nn.z));
  vWorldPos = wp;
  float ang = atan(aRing.z, aRing.x);
  vUv = vec2(ang / 6.2831 * max(1.0, rad * 6.0), p.y * hgt / 4.0);
  vBark = iT1.z;
  vec4 worldPosition = vec4(wp, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = (viewMatrix * vec4(vNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  ${SHADOW_VERT}
}
`;

const TRUNK_FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
uniform sampler2D tBark;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec2 vUv;
varying float vBark;
void main() {
  if (vWorldPos.y < uClipY) discard;
  vec2 uv = vec2((vBark + fract(vUv.x)) / 4.0, fract(vUv.y));
  vec3 albedo = texture2D(tBark, uv).rgb;
  vec3 n = normalize(vNormal);
  float shadow = getShadowMask();
  // canopy occlusion darkens the upper trunk a little
  vec3 col = shadeWorld(albedo, n, vWorldPos, shadow, 0.85);
  // rim light from the low sun
  vec3 v = normalize(uCamPos - vWorldPos);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * max(dot(-v, uSunDir), 0.0);
  col += albedo * uSunColor * rim * shadow * 1.2;
  gl_FragColor = vec4(col, 1.0);
}
`;

const TRUNK_DEPTH_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`;

// ---------------------------------------------------------------- tree shapes
function addClump(list, x, y, z, w, h, cell, nx, ny, nz, upright) {
  list.push({ x, y, z, w, h, cell, nx, ny, nz, upright });
}

function coniferClumps(H, rng, airy) {
  const out = [];
  const base = airy ? 2.2 : 1.6;
  const step = airy ? 1.35 : 1.05;
  const count = Math.max(4, Math.round((H - base) / step));
  const R0 = H * (airy ? 0.23 : 0.21);
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const y = base + t * (H - base);
    const r = R0 * Math.pow(1 - t, 0.9) + 0.45;
    const w = r * 2.25;
    const h = w * 0.75;
    const cells = airy ? CLUMP.tier.slice(2) : CLUMP.tier.slice(0, 2);
    // quad centre sits below the apex so tiers overlap like real boughs
    addClump(out, rng.range(-0.15, 0.15), y + h * 0.18, rng.range(-0.15, 0.15), w, h, rng.pick(cells), 0, 0.4, 0, 0.85);
    if (r > 1.6 && rng.chance(airy ? 0.3 : 0.55)) {
      const a = rng.range(0, Math.PI * 2);
      addClump(out, Math.cos(a) * r * 0.25, y + h * 0.05, Math.sin(a) * r * 0.25, w * 0.8, h * 0.8, rng.pick(cells), Math.cos(a) * 0.5, 0.3, Math.sin(a) * 0.5, 0.85);
    }
  }
  // leader tip
  addClump(out, 0, H + 0.1, 0, 0.9, 0.9, airy ? CLUMP.tier[2] : CLUMP.tier[0], 0, 0.8, 0, 0.9);
  return out;
}

function crownClumps(H, rng, { cy, rx, ry, count, cells, sizeK, inner = true }) {
  const out = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    // fibonacci sphere, biased to the upper half
    const yy = 1 - (i / (count - 1)) * 1.7;
    const rr = Math.sqrt(Math.max(0, 1 - yy * yy));
    const th = i * golden + rng.range(-0.3, 0.3);
    const d = rng.range(0.55, 0.95);
    const nx = Math.cos(th) * rr, ny = yy, nz = Math.sin(th) * rr;
    const s = (rx + ry) * sizeK * rng.range(0.85, 1.15) * (ny > 0.6 ? 0.82 : 1);
    addClump(out, nx * rx * d, cy + ny * ry * d, nz * rx * d, s, s, rng.pick(cells), nx, ny, nz, 0.1);
  }
  if (inner) {
    addClump(out, 0, cy - ry * 0.05, 0, rx * 1.5, ry * 1.5, rng.pick(cells), 0, -0.2, 0, 0.1);
  }
  return out;
}

const TREE_SPECS = {
  spruce: { h: [9, 17], trunk: 'straight', make: (H, rng) => coniferClumps(H, rng, false) },
  pine: { h: [10, 16], trunk: 'straight', make: (H, rng) => coniferClumps(H, rng, false) },
  tamarack: { h: [8, 14], trunk: 'straight', make: (H, rng) => coniferClumps(H, rng, true) },
  maple: { h: [7, 11.5], trunk: 'forked', make: (H, rng) => crownClumps(H, rng, { cy: H * 0.64, rx: H * 0.34, ry: H * 0.3, count: rng.int(11, 15), cells: CLUMP.broad, sizeK: 0.55 }) },
  maple2: { h: [6.5, 10], trunk: 'forked', make: (H, rng) => crownClumps(H, rng, { cy: H * 0.64, rx: H * 0.36, ry: H * 0.28, count: rng.int(10, 14), cells: CLUMP.broad, sizeK: 0.55 }) },
  oak: { h: [7, 10], trunk: 'forked', make: (H, rng) => crownClumps(H, rng, { cy: H * 0.62, rx: H * 0.42, ry: H * 0.28, count: rng.int(12, 15), cells: CLUMP.broad, sizeK: 0.5 }) },
  birch: { h: [8, 13], trunk: 'straight', make: (H, rng) => crownClumps(H, rng, { cy: H * 0.68, rx: H * 0.17, ry: H * 0.3, count: rng.int(8, 11), cells: CLUMP.small, sizeK: 0.62, inner: true }) },
  aspen: { h: [8, 12.5], trunk: 'straight', make: (H, rng) => crownClumps(H, rng, { cy: H * 0.7, rx: H * 0.16, ry: H * 0.27, count: rng.int(7, 10), cells: CLUMP.small, sizeK: 0.66, inner: true }) },
};

// ---------------------------------------------------------------- geometry helpers
// Trunk geometry: 'position' holds the limb centreline in units of tree height,
// 'aRing' the ring offset in units of trunk radius, so branches reach into the crown
// while staying thin.
function trunkGeometry(forked) {
  const pos = [], ring = [], nor = [], idx = [];
  const limb = (S, E, radii, seg, rings) => {
    const base = pos.length / 3;
    const T = new THREE.Vector3(E[0] - S[0], E[1] - S[1], E[2] - S[2]).normalize();
    const ref = Math.abs(T.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const U = new THREE.Vector3().crossVectors(T, ref).normalize();
    const V = new THREE.Vector3().crossVectors(T, U).normalize();
    for (let r = 0; r <= rings; r++) {
      const t = r / rings;
      const rad = radii(t);
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2;
        const ox = U.x * Math.cos(a) + V.x * Math.sin(a);
        const oy = U.y * Math.cos(a) + V.y * Math.sin(a);
        const oz = U.z * Math.cos(a) + V.z * Math.sin(a);
        pos.push(S[0] + (E[0] - S[0]) * t, S[1] + (E[1] - S[1]) * t, S[2] + (E[2] - S[2]) * t);
        ring.push(ox * rad, oy * rad, oz * rad);
        nor.push(ox, oy, oz);
      }
    }
    for (let r = 0; r < rings; r++) {
      for (let k = 0; k < seg; k++) {
        const a = base + r * seg + k, b = base + r * seg + ((k + 1) % seg);
        const c = a + seg, d = b + seg;
        idx.push(a, b, c, b, d, c);
      }
    }
  };
  limb([0, 0, 0], [0, 1, 0], (t) => (t < 0.06 ? 1.5 - t * 7 : 1.08 - t * 0.55), 6, 5);
  if (forked) {
    const br = (ang, y0, y1, out, r0) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      limb([0, y0, 0], [c * out, y1, s * out], (t) => r0 * (1 - t * 0.7), 4, 2);
    };
    br(0.3, 0.52, 0.86, 0.26, 0.5);
    br(2.4, 0.6, 0.9, 0.22, 0.42);
    br(4.3, 0.68, 0.98, 0.18, 0.36);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRing', new THREE.Float32BufferAttribute(ring, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

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
    const clumps = spec.make(H, rng);
    const ramp = SPECIES[species];
    const trunkH = spec.trunk === 'forked' ? H * 0.72 : H * 0.97;
    const trunkR = (spec.trunk === 'forked' ? 0.2 : 0.14) + H * 0.014;
    const tree = {
      species, x, y, z, H, clumps, rampRow: SPECIES_LIST.indexOf(species),
      trunk: { type: spec.trunk, h: trunkH, r: trunkR, yaw: rng.range(0, Math.PI * 2), bark: ramp.bark, lean: rng.range(-1, 1) },
    };
    this.trees.push(tree);
    this.colliders.insert({ type: 'circle', x, z, r: trunkR * 1.25 + 0.15, tree }, x, z, 1);
  }

  addBush(species, x, y, z, rng) {
    const clumps = [];
    if (species === 'fern') {
      const s = rng.range(1.1, 1.8);
      addClump(clumps, 0, s * 0.42, 0, s * 1.2, s, rng.pick(CLUMP.fern), 0, 0.6, 0, 0.9);
    } else {
      const n = rng.int(1, 3);
      for (let i = 0; i < n; i++) {
        const s = rng.range(0.9, 1.7);
        addClump(clumps, rng.range(-0.6, 0.6), s * 0.38, rng.range(-0.6, 0.6), s * 1.25, s, rng.pick(CLUMP.bush), rng.range(-0.3, 0.3), 0.7, rng.range(-0.3, 0.3), 0.9);
      }
    }
    this.trees.push({ species, x, y, z, H: 1.2, clumps, rampRow: SPECIES_LIST.indexOf(species), trunk: null, bush: true });
  }

  buildMeshes() {
    const atlas = pixTexture(buildFoliageAtlas(), { repeat: false, mips: false });
    const bark = pixTexture(buildBarkAtlas(), { repeat: true, mips: false });
    // ramp texture: 6 x species
    const rows = SPECIES_LIST.length;
    const rampData = new Uint8Array(6 * rows * 4);
    SPECIES_LIST.forEach((name, r) => {
      SPECIES[name].ramp.forEach((c, k) => {
        const o = (r * 6 + k) * 4;
        rampData[o] = (c >> 16) & 255;
        rampData[o + 1] = (c >> 8) & 255;
        rampData[o + 2] = c & 255;
        rampData[o + 3] = 255;
      });
    });
    const rampTex = new THREE.DataTexture(rampData, 6, rows, THREE.RGBAFormat);
    rampTex.colorSpace = THREE.SRGBColorSpace;
    rampTex.magFilter = rampTex.minFilter = THREE.NearestFilter;
    rampTex.needsUpdate = true;

    const folUniforms = worldUniforms({
      tAtlas: { value: atlas },
      tRamp: { value: rampTex },
      uRampRows: { value: rows },
      uAtlasN: { value: ATLAS_N },
    });
    this.folMat = new THREE.ShaderMaterial({
      uniforms: folUniforms, vertexShader: FOL_VERT, fragmentShader: FOL_FRAG, lights: true, side: THREE.DoubleSide,
    });
    this.folDepth = new THREE.ShaderMaterial({
      uniforms: folUniforms, vertexShader: FOL_VERT, fragmentShader: FOL_DEPTH_FRAG, side: THREE.DoubleSide, defines: { DEPTH_PASS: '' },
    });
    const trunkUniforms = worldUniforms({ tBark: { value: bark } });
    this.trunkMat = new THREE.ShaderMaterial({ uniforms: trunkUniforms, vertexShader: TRUNK_VERT, fragmentShader: TRUNK_FRAG, lights: true });
    this.trunkDepth = new THREE.ShaderMaterial({ uniforms: trunkUniforms, vertexShader: TRUNK_VERT, fragmentShader: TRUNK_DEPTH_FRAG, defines: { DEPTH_PASS: '' } });

    const quad = new THREE.PlaneGeometry(1, 1);
    const trunkGeos = { straight: trunkGeometry(false), forked: trunkGeometry(true) };

    // bucket into chunks
    const buckets = new Map();
    for (const t of this.trees) {
      const ci = Math.floor((t.x + L.WORLD_HALF) / CHUNK), cj = Math.floor((t.z + L.WORLD_HALF) / CHUNK);
      const key = ci * 100 + cj;
      if (!buckets.has(key)) buckets.set(key, { ci, cj, trees: [] });
      buckets.get(key).trees.push(t);
    }
    let totalClumps = 0;
    for (const b of buckets.values()) {
      const clumps = [];
      const trunks = { straight: [], forked: [] };
      for (const t of b.trees) {
        for (const c of t.clumps) clumps.push({ t, c });
        if (t.trunk) trunks[t.trunk.type].push(t);
      }
      // importance ordering: big silhouette clumps first, undergrowth last.
      // Distant chunks draw only a prefix of the instance list (cheap LOD).
      for (const e of clumps) e.imp = e.c.w * e.c.h * (e.t.bush ? 0.15 : 1) + (e.t.bush ? 0 : 2);
      clumps.sort((a, b) => b.imp - a.imp);
      totalClumps += clumps.length;
      const chunkGroup = new THREE.Group();
      const cx = -L.WORLD_HALF + (b.ci + 0.5) * CHUNK, cz = -L.WORLD_HALF + (b.cj + 0.5) * CHUNK;
      let maxY = 0, minY = 1e9;
      // foliage
      if (clumps.length) {
        const g = new THREE.InstancedBufferGeometry();
        g.index = quad.index;
        g.setAttribute('position', quad.attributes.position);
        const n = clumps.length;
        const iPos = new Float32Array(n * 3), iSize = new Float32Array(n * 2), iInfo = new Float32Array(n * 4), iNorm = new Float32Array(n * 4);
        clumps.forEach(({ t, c }, i) => {
          iPos[i * 3] = t.x + c.x;
          iPos[i * 3 + 1] = t.y + c.y;
          iPos[i * 3 + 2] = t.z + c.z;
          maxY = Math.max(maxY, t.y + c.y + c.h);
          minY = Math.min(minY, t.y);
          iSize[i * 2] = c.w;
          iSize[i * 2 + 1] = c.h;
          iInfo[i * 4] = t.rampRow;
          iInfo[i * 4 + 1] = c.cell;
          iInfo[i * 4 + 2] = Math.random();
          iInfo[i * 4 + 3] = clamp(c.y / Math.max(1, t.H), 0, 1);
          iNorm[i * 4] = c.nx;
          iNorm[i * 4 + 1] = c.ny;
          iNorm[i * 4 + 2] = c.nz;
          iNorm[i * 4 + 3] = c.upright;
        });
        g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
        g.setAttribute('iSize', new THREE.InstancedBufferAttribute(iSize, 2));
        g.setAttribute('iInfo', new THREE.InstancedBufferAttribute(iInfo, 4));
        g.setAttribute('iNorm', new THREE.InstancedBufferAttribute(iNorm, 4));
        g.instanceCount = n;
        const m = new THREE.Mesh(g, this.folMat);
        m.customDepthMaterial = this.folDepth;
        m.castShadow = true;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        m.userData.kind = 'foliage';
        m.userData.full = n;
        // index of the first undergrowth clump (dropped first at distance)
        m.userData.lod1 = Math.max(1, Math.round(n * 0.55));
        m.userData.lod2 = Math.max(1, Math.round(n * 0.3));
        chunkGroup.add(m);
      }
      for (const type of ['straight', 'forked']) {
        const list = trunks[type];
        if (!list.length) continue;
        const base = trunkGeos[type];
        const g = new THREE.InstancedBufferGeometry();
        g.index = base.index;
        g.setAttribute('position', base.attributes.position);
        g.setAttribute('normal', base.attributes.normal);
        g.setAttribute('aRing', base.attributes.aRing);
        const n = list.length;
        const t0 = new Float32Array(n * 4), t1 = new Float32Array(n * 4);
        list.forEach((t, i) => {
          t0[i * 4] = t.x;
          t0[i * 4 + 1] = t.y;
          t0[i * 4 + 2] = t.z;
          t0[i * 4 + 3] = t.trunk.h;
          t1[i * 4] = t.trunk.r;
          t1[i * 4 + 1] = t.trunk.yaw;
          t1[i * 4 + 2] = t.trunk.bark;
          t1[i * 4 + 3] = t.trunk.lean;
        });
        g.setAttribute('iT0', new THREE.InstancedBufferAttribute(t0, 4));
        g.setAttribute('iT1', new THREE.InstancedBufferAttribute(t1, 4));
        g.instanceCount = n;
        const m = new THREE.Mesh(g, this.trunkMat);
        m.customDepthMaterial = this.trunkDepth;
        m.castShadow = true;
        m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        chunkGroup.add(m);
      }
      // bounding spheres for frustum culling
      const center = new THREE.Vector3(cx, (maxY + minY) / 2, cz);
      const radius = Math.hypot(CHUNK * 0.75, (maxY - minY) / 2 + 12);
      for (const m of chunkGroup.children) {
        m.geometry.boundingSphere = new THREE.Sphere(center.clone(), radius);
      }
      chunkGroup.userData.center = center;
      this.chunks.push(chunkGroup);
      this.group.add(chunkGroup);
    }
    this.stats = { trees: this.trees.filter((t) => !t.bush).length, bushes: this.trees.filter((t) => t.bush).length, clumps: totalClumps, chunks: this.chunks.length };
    return this.group;
  }

  // Distance LOD + culling of far chunks (fog hides them anyway)
  updateVisibility(camPos, maxDist = 430) {
    for (const c of this.chunks) {
      const d = Math.hypot(c.userData.center.x - camPos.x, c.userData.center.z - camPos.z);
      c.visible = d < maxDist;
      if (!c.visible) continue;
      for (const m of c.children) {
        if (m.userData.kind !== 'foliage') continue;
        const ud = m.userData;
        m.geometry.instanceCount = d < 110 * this.lodScale ? ud.full : d < 220 * this.lodScale ? ud.lod1 : ud.lod2;
      }
    }
  }
}
