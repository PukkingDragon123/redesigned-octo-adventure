// Sky dome with pixel-banded clouds, sun, moon and stars + layered misty mountains.
import * as THREE from 'three';
import { G, NOISE_GLSL } from './shaderlib.js';
import { Simplex } from '../core/noise.js';

export const SKY = {
  uZenith: { value: new THREE.Color() },
  uHorizon: { value: new THREE.Color() },
  uSunGlow: { value: new THREE.Color() },
  uCloudLit: { value: new THREE.Color() },
  uCloudShade: { value: new THREE.Color() },
  uCloudCover: { value: 0.45 },
  uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
  uStars: { value: 0 },
};

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // at far plane
}
`;

const SKY_FRAG = /* glsl */ `
${NOISE_GLSL}
uniform vec3 uZenith, uHorizon, uSunGlow, uCloudLit, uCloudShade, uSunDir, uMoonDir;
uniform float uCloudCover, uStars, uTime, uNight;
uniform vec2 uWind;
varying vec3 vDir;

float cloudDensity(vec2 p) {
  float d = fbm2(p) * 0.75 + vnoise(p * 3.1) * 0.25;
  return d;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float up = clamp(h, 0.0, 1.0);
  vec3 col = mix(uHorizon, uZenith, pow(up, 0.5));
  // warm band right at the horizon
  col = mix(col, uHorizon * 1.08, (1.0 - smoothstep(0.0, 0.08, abs(h))) * 0.5);
  if (h < 0.0) col = mix(uHorizon, uHorizon * vec3(0.7, 0.68, 0.75), smoothstep(0.0, -0.3, h));

  float sd = dot(d, uSunDir);
  float sunGlow = pow(max(sd, 0.0), 6.0) * 0.45 + pow(max(sd, 0.0), 48.0) * 0.9;
  col += uSunGlow * sunGlow;
  // pixel sun disk
  float disk = smoothstep(0.9988, 0.9992, sd);
  col = mix(col, vec3(1.0, 0.97, 0.88) * 4.0, disk * (1.0 - uNight));

  // moon
  float md = dot(d, uMoonDir);
  float moon = smoothstep(0.99935, 0.9995, md);
  float crescent = smoothstep(0.99935, 0.9995, dot(d, normalize(uMoonDir + vec3(0.012, 0.004, 0.0))));
  col = mix(col, vec3(0.95, 0.93, 0.8) * 2.2, moon * (1.0 - crescent * 0.85) * uNight);
  col += vec3(0.4, 0.45, 0.6) * pow(max(md, 0.0), 200.0) * uNight * 0.6;

  // stars
  if (uStars > 0.01 && h > 0.0) {
    vec3 sp = floor(d * 380.0);
    float s = hash13(sp);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + s * 50.0);
    col += vec3(0.9, 0.9, 1.0) * step(0.9975, s) * uStars * tw * smoothstep(0.0, 0.25, h) * 1.4;
  }

  // banded clouds on a virtual plane
  if (h > 0.0) {
    vec2 cp = d.xz / (h + 0.12) * 1.6 + uWind * uTime * 0.004 + vec2(uTime * 0.003, 0.0);
    float dens = cloudDensity(cp);
    float cover = 1.0 - uCloudCover;
    float c = smoothstep(cover, cover + 0.12, dens);
    // lighting: sample towards the sun
    vec2 sdir = normalize(uSunDir.xz + 1e-4) * 0.08;
    float dl = cloudDensity(cp + sdir);
    float lit = clamp((dens - dl) * 6.0 + 0.5, 0.0, 1.0);
    // band the lighting for pixel-art clouds
    lit = floor(lit * 3.0 + 0.5) / 3.0;
    vec3 cc = mix(uCloudShade, uCloudLit, lit);
    // silver lining near the sun
    cc += uSunGlow * pow(max(sd, 0.0), 10.0) * (1.0 - c * 0.6) * 0.9;
    float fade = smoothstep(0.0, 0.18, h);
    float edge = step(cover + 0.02, dens) * 0.5 + c * 0.5;
    col = mix(col, cc, clamp(edge, 0.0, 1.0) * fade * 0.95);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createSky() {
  const geo = new THREE.SphereGeometry(1800, 48, 24);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...SKY, uSunDir: G.uSunDir, uTime: G.uTime, uNight: G.uNight, uWind: G.uWind },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  mesh.name = 'sky';
  return mesh;
}

// ---------------------------------------------------------------------------
// Mountains: three rings of silhouettes with hazy colours (like the BC coast).
const MTN_VERT = /* glsl */ `
attribute float aTop;
varying float vT;
varying vec3 vWorldPos;
void main() {
  vT = aTop;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const MTN_FRAG = /* glsl */ `
${NOISE_GLSL}
uniform vec3 uCol;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec3 uSunDir;
uniform float uHaze;
uniform float uSnowLine;
uniform float uForest;
uniform float uClipY;
varying float vT;
varying vec3 vWorldPos;
void main() {
  if (vWorldPos.y < uClipY) discard;
  vec3 d = normalize(vWorldPos - cameraPosition);
  vec3 col = uCol;
  // mist pools at the bottom of each layer
  float mist = 1.0 - smoothstep(0.0, 0.55, vT);
  col = mix(col, uHorizon, mist * 0.75);
  // tree texture speckle
  vec2 px = floor(vWorldPos.xz * 0.35 + vWorldPos.y * 0.6);
  col *= 1.0 - uForest * 0.12 * step(0.5, hash12(px));
  // snowy peaks
  float snow = step(uSnowLine, vWorldPos.y + hash12(floor(vWorldPos.xz * 0.2)) * 18.0);
  col = mix(col, mix(uHorizon, vec3(0.95, 0.92, 0.95), 0.6), snow * 0.8);
  // sun facing rim
  float sf = pow(max(dot(d, uSunDir), 0.0), 4.0);
  col += uSunGlow * sf * 0.25;
  col = mix(col, uHorizon, uHaze);
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createMountains() {
  const group = new THREE.Group();
  group.name = 'mountains';
  const sx = new Simplex(99);
  const layers = [
    { r: 1500, base: 120, amp: 230, col: 0x7d7aa0, haze: 0.55, snow: 210, forest: 0, freq: 2.2 },
    { r: 1050, base: 60, amp: 150, col: 0x4c5070, haze: 0.38, snow: 9999, forest: 0.6, freq: 3.5 },
    { r: 720, base: 30, amp: 80, col: 0x2c3a3a, haze: 0.22, snow: 9999, forest: 1, freq: 6.0 },
  ];
  for (const L of layers) {
    const seg = 720;
    const pos = [], top = [], idx = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const cx = Math.cos(a), cz = Math.sin(a);
      // lower towards the east (open sea), taller in the north-west
      const dirWeight = 0.35 + 0.65 * Math.max(0, -(cx * 0.6) + -cz * 0.5 + 0.55);
      let hgt = 0;
      hgt += sx.noise(cx * L.freq, cz * L.freq) * 0.6;
      hgt += Math.abs(sx.noise(cx * L.freq * 2.3 + 4, cz * L.freq * 2.3)) * 0.5;
      hgt += sx.noise(cx * L.freq * 7, cz * L.freq * 7) * 0.12;
      let y = L.base * dirWeight + Math.max(0, hgt + 0.4) * L.amp * dirWeight;
      if (L.forest) y += (i % 2 === 0 ? 4 : 0) * L.forest; // spiky treeline
      pos.push(cx * L.r, -60, cz * L.r, cx * L.r, y, cz * L.r);
      top.push(0, 1);
    }
    for (let i = 0; i < seg; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
    geo.setIndex(idx);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uCol: { value: new THREE.Color(L.col) },
        uHorizon: SKY.uHorizon,
        uSunGlow: SKY.uSunGlow,
        uSunDir: G.uSunDir,
        uHaze: { value: L.haze },
        uSnowLine: { value: L.snow },
        uForest: { value: L.forest },
        uClipY: G.uClipY,
        uBaseHaze: { value: L.haze },
      },
      vertexShader: MTN_VERT,
      fragmentShader: MTN_FRAG,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.userData.layer = L;
    m.renderOrder = -50;
    group.add(m);
  }
  return group;
}
