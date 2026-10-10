// Dense pixel-art grass tufts on a grid that follows the camera.
// Placement, height and density come from textures so it costs nothing on the CPU.
import * as THREE from 'three';
import { Pix, RNG } from '../art/pixel.js';
import { pixTexture, dataTexture } from '../render/textures.js';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, WIND_GLSL, HEIGHT_GLSL } from '../render/shaderlib.js';
import { smoothstep } from '../core/math.js';
import { Simplex } from '../core/noise.js';
import * as L from './layout.js';
import { beachMask, beachWidth, seaSDF } from './terrain.js';

const CELL = 32;

function setV(p, x, y, v) {
  v = Math.max(0, Math.min(1, v));
  const c = Math.round(v * 255);
  p.set(x, y, (c << 16) | (c << 8) | c, 255);
}

// 4 tuft variants (value-coded like foliage)
export function buildGrassAtlas() {
  const p = new Pix(CELL * 4, CELL);
  const rng = new RNG(31337);
  for (let k = 0; k < 4; k++) {
    const ox = k * CELL;
    const blades = k === 3 ? 9 : 14 + rng.int(0, 6);
    for (let b = 0; b < blades; b++) {
      let x = ox + CELL / 2 + rng.range(-7, 7);
      let y = CELL - 1;
      const len = rng.range(10, k === 1 ? 20 : 29);
      const lean = rng.range(-0.55, 0.55) + (x - ox - CELL / 2) * 0.05;
      const curve = rng.range(-0.02, 0.02);
      let dx = lean;
      for (let s = 0; s < len; s++) {
        const t = s / len;
        setV(p, x, y, 0.28 + t * 0.62 + rng.range(-0.05, 0.05));
        if (t < 0.25 && rng.chance(0.5)) setV(p, x + 1, y, 0.22 + t * 0.4);
        y -= 1;
        dx += curve;
        x += dx * 0.5;
        if (y < 1) break;
      }
      // seed heads on variant 2
      if (k === 2 && rng.chance(0.55)) {
        setV(p, x, y, 0.95);
        setV(p, x + 1, y + 1, 0.85);
        setV(p, x - 1, y + 1, 0.8);
        setV(p, x, y + 2, 0.75);
      }
    }
    // variant 3: little wildflower / clover tuft with a fallen leaf
    if (k === 3) {
      for (let f = 0; f < 2; f++) {
        const fx = ox + rng.int(10, 22), fy = rng.int(10, 16);
        const petal = f === 0 ? 0xe8c8e8 : 0xf0e0b0; // asters & yellow goldenrod
        p.set(fx, fy, 0xe8b040, 254); // flowers are flagged with alpha 254 (not ramp coloured)
        p.set(fx + 1, fy, petal, 254);
        p.set(fx - 1, fy, petal, 254);
        p.set(fx, fy - 1, petal, 254);
      }
    }
  }
  return p;
}

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${WIND_GLSL}
${NOISE_GLSL}
${HEIGHT_GLSL}
attribute vec2 iGrid;
uniform vec2 uGridOrigin;
uniform float uSpacing;
uniform float uGridN;
uniform sampler2D tMask;
uniform vec3 uPlayer;
uniform vec3 uCamPos;
varying vec2 vUv;
varying vec3 vWorldPos;
varying float vH;
varying float vRamp;
varying float vTint;
void main() {
  vec2 wc = floor(uGridOrigin / uSpacing) + iGrid - floor(uGridN * 0.5);
  float h1 = hash12(wc), h2 = hash12(wc + 17.31), h3 = hash12(wc * 1.73 + 3.1), h4 = hash12(wc * 0.37 + 9.7);
  vec2 xz = (wc + vec2(h1, h2)) * uSpacing;
  vec2 muv = (xz - uWorldMin) / uWorldSize;
  vec4 mask = texture2D(tMask, muv);
  float dist = distance(xz, uCamPos.xz);
  float R = uGridN * uSpacing * 0.5;
  float fade = 1.0 - smoothstep(R * 0.55, R * 0.97, dist);
  float keep = step(h3, mask.r);
  float sc = keep * fade * (0.65 + 0.6 * h4) * (0.45 + 0.6 * mask.g);
  if (sc < 0.04) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float y = terrainHeight(xz);
  vec3 base = vec3(xz.x, y - 0.03, xz.y);
  // cylindrical billboard
  vec3 toCam = uCamPos - base;
  toCam.y = 0.0;
  toCam = normalize(toCam + vec3(1e-4, 0.0, 0.0));
  vec3 right = vec3(toCam.z, 0.0, -toCam.x);
  vec2 c = position.xy; // x -0.5..0.5, y 0..1
  float w = 0.9 * sc, hgt = 0.8 * sc;
  vec3 wp = base + right * c.x * w + vec3(0.0, c.y * hgt, 0.0);
  // wind + push away from the rider
  float hf = c.y;
  wp += windOffset(base, hf * 0.55, h1 * 6.28);
  vec3 away = base - uPlayer;
  float pd = length(away.xz);
  float push = (1.0 - smoothstep(0.3, 1.8, pd)) * step(abs(away.y), 2.5);
  wp.xz += normalize(away.xz + 1e-4) * push * hf * 0.55;
  wp.y -= push * hf * 0.25;
  vWorldPos = wp;
  float variant = h4 > 0.93 ? 3.0 : floor(h4 * 3.2);
  vUv = vec2((variant + (h1 > 0.5 ? 1.0 - (c.x + 0.5) : c.x + 0.5)) / 4.0, 1.0 - c.y);
  vH = hf;
  // ramp choice: golden / green / russet patches
  float pn = vnoise(xz / 23.0) * 0.7 + vnoise(xz / 7.0) * 0.3;
  vRamp = pn < 0.42 ? 1.0 : (pn > 0.62 ? 2.0 : 0.0);
  vTint = mask.b;
  vec4 worldPosition = vec4(wp, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = vec3(0.0, 1.0, 0.0);
  gl_Position = projectionMatrix * mvPosition;
  worldPosition.xyz += uSunDir * 0.25;
  ${SHADOW_VERT}
}
`;

const FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
uniform sampler2D tGrass;
uniform sampler2D tRamp;
varying vec2 vUv;
varying vec3 vWorldPos;
varying float vH;
varying float vRamp;
varying float vTint;
void main() {
  vec4 tx = texture2D(tGrass, vUv);
  if (tx.a < 0.5) discard;
  float shadow = getShadowMask();
  vec3 v = normalize(uCamPos - vWorldPos);
  float back = pow(max(dot(-v, uSunDir), 0.0), 2.0);
  float lit = shadow * (0.55 + 0.45 * clamp(uSunDir.y * 2.0, 0.0, 1.0));
  float val = tx.r;
  vec3 albedo;
  if (tx.a < 0.999) {
    albedo = tx.rgb; // flowers keep their own colour
  } else {
    float idx = 0.1 + val * 0.58 + lit * 0.32 + back * shadow * 0.22;
    idx += (bayer4(gl_FragCoord.xy) - 0.5) * 0.16;
    float k = clamp(floor(idx * 6.0), 0.0, 5.0);
    albedo = texture2D(tRamp, vec2((k + 0.5) / 6.0, (vRamp + 0.5) / 3.0)).rgb;
  }
  if (uSnow > 0.3 && vH > 0.6) albedo = mix(albedo, vec3(0.9, 0.92, 0.98), uSnow * 0.7);
  vec3 light = hemiAmbient(vec3(0.0, 1.0, 0.0)) * (0.7 + 0.5 * vH) + uSunColor * (0.08 + 0.5 * lit);
  vec3 col = albedo * light;
  col += albedo * uSunColor * back * shadow * vH * 0.75;
  col += albedo * pointLightsAt(vWorldPos, vec3(0.0, 1.0, 0.0), 0.8);
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
          if (b.short) data[o + 1] = Math.min(data[o + 1], 90);
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
    const quad = new THREE.PlaneGeometry(1, 1);
    quad.translate(0, 0.5, 0);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.attributes.position);
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
      tGrass: { value: pixTexture(buildGrassAtlas(), { repeat: false, mips: false }) },
      tRamp: { value: rampTex },
      tMask: { value: maskTex },
      uGridOrigin: { value: new THREE.Vector2() },
      uSpacing: { value: spacing },
      uGridN: { value: gridN },
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
