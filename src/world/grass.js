// Voxel grass: dense tufts of little voxel blades on a grid that follows the camera.
// Each tuft is a handful of one-voxel-wide columns standing on a world-aligned voxel lattice
// (so neighbouring blades line up like the rest of the voxel world). A column only ever
// shows two of its sides and its top to the camera, so each blade is drawn as exactly those
// three quads: the vertex shader turns the side quads to whichever faces look at the lens.
// Every voxel of a blade takes its own step of a hand-picked ramp (dark at the root, light
// at the tip, lit sides a step up), a few tufts carry asters and goldenrod on top, and the
// blades lean in the wind and bend away from Hank. Fewer blades per tuft further out.
// Placement, height and density come from textures so it costs nothing on the CPU.
import * as THREE from 'three';
import { dataTexture } from '../render/textures.js';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, WIND_GLSL, HEIGHT_GLSL } from '../render/shaderlib.js';
import { smoothstep } from '../core/math.js';
import { Simplex } from '../core/noise.js';
import * as L from './layout.js';
import { beachMask, beachWidth, seaSDF } from './terrain.js';

const BLADES = 5; // blades per tuft (the nearest tufts draw them all)
const VOX = 0.055; // metres per grass voxel

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${WIND_GLSL}
${NOISE_GLSL}
${HEIGHT_GLSL}
attribute vec2 iGrid;
attribute vec4 aQuad; // blade, face (0 x side, 1 z side, 2 top), corner u, corner v
uniform vec2 uGridOrigin;
uniform float uSpacing;
uniform float uGridN;
uniform float uVox;
uniform sampler2D tMask;
uniform vec3 uPlayer;
uniform vec3 uCamPos;
varying vec3 vWorldPos;
varying vec3 vN;
varying float vLevel;  // voxel row of the blade (0 at the root)
varying float vTop;    // rows in the blade
varying float vRamp;
varying float vFlower;
varying float vFace;
varying float vShade;
void main() {
  vec2 wc = floor(uGridOrigin / uSpacing) + iGrid - floor(uGridN * 0.5);
  float h1 = hash12(wc), h2 = hash12(wc + 17.31), h3 = hash12(wc * 1.73 + 3.1), h4 = hash12(wc * 0.37 + 9.7);
  vec2 txz = (wc + vec2(h1, h2)) * uSpacing;
  vec2 muv = (txz - uWorldMin) / uWorldSize;
  vec4 mask = texture2D(tMask, muv);
  float dist = distance(txz, uCamPos.xz);
  float R = uGridN * uSpacing * 0.5;
  float fade = 1.0 - smoothstep(R * 0.55, R * 0.97, dist);
  float keep = step(h3, mask.r);
  float sc = keep * fade * (0.65 + 0.6 * h4) * (0.45 + 0.6 * mask.g);
  float blade = aQuad.x;
  // fewer blades further out (they are a pixel or two there)
  float nb = dist < 9.0 ? ${BLADES}.0 : dist < 18.0 ? 4.0 : dist < 28.0 ? 3.0 : 2.0;
  if (sc < 0.04 || blade >= nb) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  // the blade: a column on the world voxel lattice, near the tuft centre
  float b1 = hash12(wc * 3.17 + blade * 7.31), b2 = hash12(wc * 5.31 + blade * 3.77), b3 = hash12(wc * 1.37 + blade * 11.1);
  vec2 off = (vec2(b1, b2) - 0.5) * uSpacing * 0.62;
  vec2 cell = floor((txz + off) / uVox);
  vec2 p0 = cell * uVox;
  float rows = max(2.0, floor((0.6 * sc) / uVox * (0.35 + 0.65 * b3) + 0.5));
  float hgt = rows * uVox;
  float gy = terrainHeight(p0 + uVox * 0.5) - 0.02;
  // which faces look at the lens
  vec2 toCam = uCamPos.xz - (p0 + uVox * 0.5);
  float sx = toCam.x >= 0.0 ? 1.0 : 0.0, sz = toCam.y >= 0.0 ? 1.0 : 0.0;
  float face = aQuad.y, u = aQuad.z, v = aQuad.w;
  vec3 lp;  // local position in voxels from the column's corner
  vec3 nrm;
  if (face < 0.5) { lp = vec3(sx, v * rows, u); nrm = vec3(sx * 2.0 - 1.0, 0.0, 0.0); }
  else if (face < 1.5) { lp = vec3(u, v * rows, sz); nrm = vec3(0.0, 0.0, sz * 2.0 - 1.0); }
  else { lp = vec3(u, rows, v); nrm = vec3(0.0, 1.0, 0.0); }
  vec3 base = vec3(p0.x, gy, p0.y);
  vec3 wp = base + lp * uVox;
  // wind + push away from the rider: the column leans (shears) from its root
  float hf = lp.y / max(rows, 1.0);
  wp += windOffset(base, hf * hgt * 0.7, h1 * 6.28 + blade);
  vec3 away = base - uPlayer;
  float pd = length(away.xz);
  float push = (1.0 - smoothstep(0.3, 1.8, pd)) * step(abs(away.y), 2.5);
  wp.xz += normalize(away.xz + 1e-4) * push * hf * hgt * 0.7;
  wp.y -= push * hf * hgt * 0.3;
  vWorldPos = wp;
  vN = nrm;
  vLevel = lp.y;
  vTop = rows;
  vFace = face;
  vShade = (b1 - 0.5) * 0.14 + (b2 - 0.5) * 0.06;
  // ramp choice: golden / green / russet patches
  float pn = vnoise(txz / 23.0) * 0.7 + vnoise(txz / 7.0) * 0.3;
  vRamp = pn < 0.42 ? 1.0 : (pn > 0.62 ? 2.0 : 0.0);
  // a few tufts flower: asters or goldenrod on the tallest blade
  vFlower = h4 > 0.93 && blade < 1.5 ? (blade < 0.5 ? 1.0 : 2.0) : 0.0;
  vec4 worldPosition = vec4(wp, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = nrm;
  gl_Position = projectionMatrix * mvPosition;
  worldPosition.xyz += uSunDir * 0.25;
  ${SHADOW_VERT}
}
`;

const FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
uniform sampler2D tRamp;
varying vec3 vWorldPos;
varying vec3 vN;
varying float vLevel;
varying float vTop;
varying float vRamp;
varying float vFlower;
varying float vFace;
varying float vShade;
void main() {
  float shadow = getShadowMask();
  vec3 n = normalize(vN);
  vec3 v = normalize(uCamPos - vWorldPos);
  float back = pow(max(dot(-v, uSunDir), 0.0), 2.0);
  float ndl = dot(n, uSunDir);
  // this voxel's row: the ramp climbs from the root to the tip, one step per voxel
  float row = vFace > 1.5 ? vTop - 0.5 : min(floor(vLevel), vTop - 1.0);
  float t = (row + 0.5) / vTop;
  float lit = shadow * (0.55 + 0.45 * clamp(uSunDir.y * 2.0, 0.0, 1.0));
  float side = vFace > 1.5 ? 0.12 : (ndl > 0.1 ? 0.05 : -0.06);
  float idx = 0.02 + t * 0.66 + lit * 0.24 + side + back * shadow * 0.16 + vShade;
  float k = clamp(floor(idx * 6.0), 0.0, 5.0);
  vec3 albedo = texture2D(tRamp, vec2((k + 0.5) / 6.0, (vRamp + 0.5) / 3.0)).rgb;
  // the flower sits on the top voxel of its blade
  if (vFlower > 0.5 && row > vTop - 1.5) albedo = vFlower < 1.5 ? vec3(0.78, 0.6, 0.86) : vec3(0.98, 0.78, 0.22);
  if (uSnow > 0.3 && t > 0.6) albedo = mix(albedo, vec3(0.9, 0.92, 0.98), uSnow * 0.7);
  vec3 light = hemiAmbient(n) * (0.7 + 0.5 * t) + uSunColor * (0.08 + 0.5 * lit) * (0.75 + 0.25 * clamp(ndl * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = albedo * light;
  col += albedo * uSunColor * back * shadow * t * 0.75;
  col += albedo * pointLightsAt(vWorldPos, n, 0.8);
  col *= mix(1.0, 0.75, uWet);
  gl_FragColor = vec4(col, 1.0);
}
`;

// Build the density mask: R = density, G = height factor, B = spare
export function buildGrassMask(terrain, blockers = []) {
  const N = L.WORLD_HALF * 2; // 1 texel per metre
  const data = new Uint8Array(N * N * 4);
  const sx = new Simplex(808);
  for (let j = 0; j < N; j++) {
    const z = L.WORLD_Z0 + j + 0.5;
    for (let i = 0; i < N; i++) {
      const x = L.WORLD_X0 + i + 0.5;
      const h = terrain.heightAt(x, z);
      const s = terrain.splatAt(x, z);
      let d = 1;
      d *= 1 - smoothstep(0.05, 0.4, s.road);
      d *= 1 - smoothstep(0.3, 0.7, s.rock);
      d *= 1 - 0.85 * smoothstep(0.2, 0.6, s.sand);
      d *= 1 - 0.7 * smoothstep(0.3, 0.8, s.litter);
      d *= smoothstep(0.9, 1.6, h);
      d *= 1 - smoothstep(50, 70, h);
      // natural clumping
      d *= 0.55 + 0.45 * smoothstep(-0.4, 0.4, sx.noise(x / 9, z / 9));
      let hf = 0.55 + 0.45 * smoothstep(-0.3, 0.6, sx.noise(x / 30 + 5, z / 30));
      // beaches: bare sand down to the water, tall marram grass tufts on the dunes behind
      const bm = beachMask(x, z);
      if (bm > 0.05) {
        const sd = seaSDF(x, z), bw = beachWidth(x, z);
        const dune = smoothstep(bw - 4, bw + 2, sd);
        d *= 1 - bm * (1 - dune * 0.75);
        if (dune > 0.2) hf = Math.max(hf, 0.85 * dune);
      }
      // meadows are lush
      for (const m of [L.POI.meadow1, L.POI.meadow2]) {
        const md = Math.hypot(x - m.x, z - m.z);
        if (md < m.r * 1.3) {
          const k = 1 - smoothstep(m.r * 0.6, m.r * 1.3, md);
          d = Math.max(d, 0.95 * k * (1 - s.road));
          hf = Math.max(hf, k);
        }
      }
      const o = (j * N + i) * 4;
      data[o] = Math.round(d * 255);
      data[o + 1] = Math.round(hf * 255);
      data[o + 2] = 0;
      data[o + 3] = 255;
    }
  }
  // carve out building footprints / platforms
  for (const b of blockers) {
    const c = Math.cos(b.yaw || 0), sn = Math.sin(b.yaw || 0);
    const r = Math.hypot(b.w, b.d) / 2 + 1;
    for (let z = Math.floor(b.z - r); z <= Math.ceil(b.z + r); z++) {
      for (let x = Math.floor(b.x - r); x <= Math.ceil(b.x + r); x++) {
        const dx = x + 0.5 - b.x, dz = z + 0.5 - b.z;
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (Math.abs(lx) <= b.w / 2 + 0.5 && Math.abs(lz) <= b.d / 2 + 0.5) {
          const i = x - L.WORLD_X0, j = z - L.WORLD_Z0;
          if (i < 0 || j < 0 || i >= N || j >= N) continue;
          const o = (j * N + i) * 4;
          data[o] = Math.round(data[o] * (b.keep ?? 0));
          if (b.short) data[o + 1] = Math.min(data[o + 1], b.short === true ? 90 : b.short); // (a number: how short)
        }
      }
    }
  }
  return dataTexture(data, N, N, { linear: false });
}

export class Grass {
  constructor(maskTex, { gridN = 150, spacing = 0.42 } = {}) {
    this.gridN = gridN;
    this.spacing = spacing;
    // per blade: three quads (an x side, a z side, the top), corners as (blade, face, u, v)
    const quad = [];
    const index = [];
    for (let b = 0; b < BLADES; b++) {
      for (let f = 0; f < 3; f++) {
        const v0 = quad.length / 4;
        for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) quad.push(b, f, u, v);
        index.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
      }
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(index);
    g.setAttribute('aQuad', new THREE.Float32BufferAttribute(quad, 4));
    // (three wants a position attribute to count vertices)
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((quad.length / 4) * 3), 3));
    const n = gridN * gridN;
    const grid = new Float32Array(n * 2);
    for (let j = 0; j < gridN; j++) for (let i = 0; i < gridN; i++) {
      grid[(j * gridN + i) * 2] = i;
      grid[(j * gridN + i) * 2 + 1] = j;
    }
    g.setAttribute('iGrid', new THREE.InstancedBufferAttribute(grid, 2));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    const ramps = [
      [0x2a2610, 0x4a4216, 0x6e6220, 0x9a862c, 0xc8aa40, 0xf0d470],
      [0x1c2610, 0x30401a, 0x4a5c22, 0x68782e, 0x8e9a3c, 0xbcc25c],
      [0x2a180c, 0x4a2a12, 0x6e4018, 0x9a5c22, 0xc68032, 0xe8aa5a],
    ];
    const rd = new Uint8Array(6 * 3 * 4);
    ramps.forEach((r, row) => r.forEach((c, k) => {
      const o = (row * 6 + k) * 4;
      rd[o] = (c >> 16) & 255; rd[o + 1] = (c >> 8) & 255; rd[o + 2] = c & 255; rd[o + 3] = 255;
    }));
    const rampTex = new THREE.DataTexture(rd, 6, 3, THREE.RGBAFormat);
    rampTex.colorSpace = THREE.SRGBColorSpace;
    rampTex.magFilter = rampTex.minFilter = THREE.NearestFilter;
    rampTex.needsUpdate = true;
    this.uniforms = worldUniforms({
      tRamp: { value: rampTex },
      tMask: { value: maskTex },
      uGridOrigin: { value: new THREE.Vector2() },
      uSpacing: { value: spacing },
      uGridN: { value: gridN },
      uVox: { value: VOX },
    });
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.layers.set(1);
    this.mesh.name = 'grass';
  }

  update(camPos) {
    this.uniforms.uGridOrigin.value.set(camPos.x, camPos.z);
  }
}
