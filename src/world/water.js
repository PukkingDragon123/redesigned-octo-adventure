// The sea, the cove, the river and the pond (all at sea level y = 0).
//
// A camera-following grid (dense near the camera, sparse towards the horizon) is displaced in the
// vertex shader: offshore Gerstner swell, plus shore waves whose crests always run parallel to the
// nearest shoreline (they travel down a baked shore-distance field), steepen as the water shoals,
// break, and run up the beach as swash. Amplitude scales with how exposed the water is: the open
// sea and the beach get real surf, the harbour a gentle slop, the river and the pond lie mirror-calm.
// Foam: whitecaps on breaking crests, bores rolling in through the surf zone, lacy swash edges.
// Reflections still come from pipeline.renderReflection (a mirror at y = 0).
import * as THREE from 'three';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, HEIGHT_GLSL } from '../render/shaderlib.js';
import { SKY } from '../render/sky.js';
import { seaSDF, beachMask } from './terrain.js';
import * as L from './layout.js';

// Shared by the water and the terrain (wet sand follows the same swash)
export const SEA = {
  uSeaTex: { value: null }, // r: wave exposure 0..1, g: signed distance to the shoreline (m, + at sea), ba: direction to shore
};

// Wave constants & helpers shared with the terrain shader
export const SEA_GLSL = /* glsl */ `
uniform sampler2D uSeaTex;
const float SHORE_L = 9.0;      // shore wave wavelength (m)
const float SHORE_SPD = 0.62;   // phase speed factor
vec4 seaInfo(vec2 xz) { return texture2D(uSeaTex, heightUV(xz)); }
// phase of the shore waves at signed shore distance d (crests travel towards d = 0)
float shorePhase(float d, float t) {
  float k = 6.2831853 / SHORE_L;
  return k * (-d) - sqrt(9.8 * k) * SHORE_SPD * t;
}
`;

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
${HEIGHT_GLSL}
${SEA_GLSL}
uniform mat4 uReflMatrix;
uniform vec3 uCamPos;
uniform vec2 uGridCenter;
uniform float uWaveAmp;
varying vec3 vWorldPos;
varying vec4 vRefl;
varying vec3 vN;
varying float vCrest;   // 0..1 how close to a breaking crest
varying float vBreak;   // 0..1 surf zone (where waves break)
varying float vExpo;
varying float vShoreD;
varying float vPhase;

// one Gerstner wave travelling along dir; x = dot(dir, p) (or -shoreDist for shore waves)
void gerstner(float x, vec2 dir, float L, float A, float Q, float spd, float ph, inout vec3 disp, inout vec3 nrm, inout float crest, float ck) {
  float k = 6.2831853 / L;
  float f = k * x - sqrt(9.8 * k) * spd * uTime + ph;
  float S = sin(f), C = cos(f);
  disp.x += Q * A * dir.x * C;
  disp.z += Q * A * dir.y * C;
  disp.y += A * S;
  float WA = k * A;
  nrm.x -= dir.x * WA * C;
  nrm.z -= dir.y * WA * C;
  nrm.y -= Q * WA * S;
  crest = max(crest, S * ck * step(0.015, A));
}

void main() {
  vec3 p = position;
  p.xz += uGridCenter;
  vec4 si = seaInfo(p.xz);
  float expo = si.r;
  float d = si.g;
  vec2 toShore = si.ba;
  float lt = length(toShore);
  toShore = lt > 1e-3 ? toShore / lt : vec2(-1.0, 0.0);
  float terr = terrainHeight(p.xz);
  float depth = max(0.0, -terr);
  float camD = length(p.xz - uCamPos.xz);
  float fade = (1.0 - smoothstep(110.0, 230.0, camD)) * uWaveAmp;

  vec3 disp = vec3(0.0);
  vec3 nrm = vec3(0.0, 1.0, 0.0);
  float crest = -1.0;
  // offshore swell from the open sea (east), only in deep, exposed water away from the shore
  float shoreW = 1.0 - smoothstep(26.0, 72.0, d);
  float swell = expo * smoothstep(1.5, 7.0, depth) * (1.0 - shoreW * 0.85) * fade;
  if (swell > 0.001) {
    gerstner(dot(vec2(-0.96, 0.28), p.xz), vec2(-0.96, 0.28), 21.0, 0.42 * swell, 0.55, 0.9, 0.0, disp, nrm, crest, 1.0);
    gerstner(dot(vec2(-0.8, -0.6), p.xz), vec2(-0.8, -0.6), 12.5, 0.2 * swell, 0.6, 1.0, 1.7, disp, nrm, crest, 0.8);
    gerstner(dot(vec2(-0.6, 0.8), p.xz), vec2(-0.6, 0.8), 7.3, 0.07 * swell, 0.7, 1.1, 4.1, disp, nrm, crest, 0.0);
  }
  // shore waves: shoal, steepen, break and run up the sand
  float brk = 0.0;
  if (expo > 0.01 && d < 80.0 && d > -12.0) {
    float shoal = depth > 1.1 ? mix(1.0, 0.5, smoothstep(1.1, 7.0, depth)) : mix(0.32, 1.0, depth / 1.1);
    float land = smoothstep(-9.0, -0.5, d);
    float A = 0.38 * expo * shoal * land * shoreW * fade;
    brk = (1.0 - smoothstep(0.35, 1.25, depth)) * smoothstep(-2.0, 0.5, d) * expo;
    float Q = mix(0.4, 0.95, smoothstep(3.0, 0.9, depth));
    float ph = sin(dot(p.xz, vec2(0.013, 0.021))) * 1.2; // crests wander a little along the shore
    gerstner(-d, toShore, SHORE_L, A, Q, SHORE_SPD, ph, disp, nrm, crest, 1.0);
    // a second, longer set so the surf comes in sets rather than a metronome
    gerstner(-d, toShore, SHORE_L * 2.3, A * 0.4, Q * 0.5, SHORE_SPD * 0.8, ph * 1.7 + 2.0, disp, nrm, crest, 0.0);
  }
  p += disp;
  vWorldPos = p;
  vN = normalize(nrm);
  vCrest = clamp(crest, 0.0, 1.0);
  vBreak = brk;
  vExpo = expo;
  vShoreD = d;
  vPhase = shorePhase(d, uTime);
  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  vRefl = uReflMatrix * worldPosition;
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = normalMatrix * vN;
  gl_Position = projectionMatrix * mvPosition;
  ${SHADOW_VERT}
}
`;

const FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
${HEIGHT_GLSL}
uniform sampler2D tRefl;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSandy;
uniform vec3 uWetSand;
uniform vec3 uCalm;
uniform float uDbg;
uniform vec3 uFoam;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform float uReflOn;
uniform vec2 uWind;
uniform float uRain;
uniform float uWindStrength;
varying vec3 vWorldPos;
varying vec4 vRefl;
varying vec3 vN;
varying float vCrest;
varying float vBreak;
varying float vExpo;
varying float vShoreD;
varying float vPhase;

void main() {
  vec2 wp = vWorldPos.xz;
  vec2 q = floor(wp * 16.0) / 16.0; // crisp 16 px / m detail
  float t = uTime;
  float terrH = terrainHeight(wp);
  float thick = vWorldPos.y - terrH; // water thickness over the ground
  float depth = max(0.0, -terrH);

  // small ripples on top of the big waves (calm water keeps mirror reflections)
  vec2 flow = uWind * 0.25;
  float r1 = vnoise(q * vec2(0.55, 1.6) + vec2(t * 0.35, t * 0.1) + flow * t);
  float r2 = vnoise(q * vec2(1.4, 0.5) - vec2(t * 0.22, t * 0.31));
  vec2 rip = vec2(r1 - 0.5, r2 - 0.5) * (0.25 + vExpo * 0.25);
  if (uRain > 0.0) {
    vec2 cell = floor(q * 1.2);
    float rh = hash12(cell + floor(t * 2.0));
    vec2 c = (cell + 0.5) / 1.2;
    float dd = length(q - c);
    float ph = fract(t * 2.0 + rh);
    rip += smoothstep(0.06, 0.0, abs(dd - ph * 0.35)) * (1.0 - ph) * step(0.6, rh) * uRain * 0.8;
  }
  vec3 n = normalize(vN + vec3(rip.x, 0.0, rip.y) * 0.35);
  vec3 v = normalize(uCamPos - vWorldPos);
  float fres = 0.1 + 0.9 * pow(1.0 - max(dot(v, n), 0.0), 4.0);

  // body colour by depth; shallows over sand look clear and turquoise
  float dk = smoothstep(0.0, 6.0, depth);
  vec3 body = mix(uShallow, uDeep, dk);
  // the river & the pond: deep green-brown and still
  body = mix(uCalm, body, smoothstep(0.0, 0.35, vExpo));
  body = mix(uSandy, body, smoothstep(0.05, 1.6, thick + depth * 0.4) * (0.35 + 0.65 * vExpo) + (1.0 - vExpo) * 0.65);
  // a thin sheet of swash over the sand shows the dark wet sand through it
  body = mix(uWetSand, body, smoothstep(0.0, 0.22, thick) * 0.85 + 0.15 * (1.0 - vExpo));
  float shadow = getShadowMask();
  float ndl = max(dot(n, uSunDir), 0.0);
  body *= hemiAmbient(vec3(0.0, 1.0, 0.0)) * 1.1 + uSunColor * (0.18 + 0.2 * ndl) * shadow;
  // light glowing through thin wave crests
  float sss = pow(max(dot(-v, uSunDir), 0.0), 3.0) * smoothstep(0.3, 1.0, vCrest) * vExpo;
  body += uShallow * uSunColor * sss * 0.9;

  // reflection
  vec3 refl;
  vec4 rc = vRefl;
  float r3 = vnoise(q * vec2(0.9, 3.2) + vec2(t * 0.5, 0.0)) - 0.5;
  vec2 rdist = vec2(n.x * 0.6 + r3 * 0.35, n.z * 0.4) * 0.03;
  rc.xy += rdist * rc.w;
  if (uReflOn > 0.5) refl = texture2DProj(tRefl, rc).rgb;
  else refl = mix(uHorizon, uZenith, 0.4);
  refl *= mix(mix(vec3(0.5, 0.62, 0.56), vec3(0.5, 0.66, 0.72), vExpo), vec3(0.8, 0.86, 0.9), fres);
  vec3 col = mix(body, refl, clamp(fres * 0.8 + 0.12, 0.0, 0.7));

  // sun glitter
  vec3 h = normalize(v + uSunDir);
  float spec = pow(max(dot(n, h), 0.0), 240.0);
  float distFade = 1.0 - smoothstep(40.0, 180.0, length(uCamPos - vWorldPos));
  float spark = step(0.5, spec) * step(0.6, hash12(q * 4.0 + floor(t * 6.0))) * distFade;
  col += uSunColor * (spec * 0.9 + spark * 1.6) * shadow * (1.0 - 0.6 * (1.0 - distFade));

  // ---- foam
  float fn = vnoise(q * 1.6 + vec2(t * 0.5, -t * 0.3)) * 0.6 + vnoise(q * 4.3 - t * 0.7) * 0.4;
  float foam = 0.0;
  // whitecaps: the curling lip of breaking crests in the surf zone, a few on deep crests when it's windy
  float surf = smoothstep(0.15, 0.6, vBreak) * smoothstep(0.12, 0.5, depth); // where crests actually curl over
  foam = max(foam, step(0.9, vCrest + fn * 0.16) * surf);
  float caps = step(0.6, vnoise(wp * 0.045 + vec2(t * 0.03, -t * 0.02))) * step(0.5, vnoise(wp * 0.21 - t * 0.05));
  foam = max(foam, step(0.965, vCrest + fn * 0.08) * caps * vExpo * smoothstep(0.5, 1.2, uWindStrength) * (1.0 - vBreak));
  // bores: a ragged band of broken white water rolling in just behind each crest
  float back = fract(vPhase / 6.2831853 + 0.25);
  float bore = smoothstep(0.62, 0.7, back) * (1.0 - smoothstep(0.74, 0.86, back));
  float along = vnoise(q * vec2(0.35, 0.35) + vec2(t * 0.05, 0.0)); // breaks the bands up along the shore
  foam = max(foam, step(0.5, bore * (0.35 + fn * 0.7 + along * 0.5)) * vBreak * smoothstep(0.05, 0.3, depth));
  // fizzing streaks left behind on the water as it washes back
  foam = max(foam, step(0.8, fn + 0.25 * bore) * step(0.55, vnoise(q * 0.9 + vec2(-t * 0.2, t * 0.15))) * vBreak * 0.6);
  // lacy swash edge where the sheet of water thins out on the sand
  float edge = 1.0 - smoothstep(0.0, 0.018 + fn * 0.035, thick);
  foam = max(foam, edge * smoothstep(0.05, 0.3, vExpo) * step(0.35, fn + edge * 0.4));
  // calm water: a thin foam line hugs the banks
  float calmEdge = (1.0 - smoothstep(0.0, 0.03 + fn * 0.05, thick)) * (1.0 - vExpo);
  foam = max(foam, calmEdge * step(0.45, fn) * 0.85);
  foam = clamp(foam, 0.0, 1.0);
  vec3 foamCol = uFoam * (hemiAmbient(vec3(0, 1, 0)) * 1.05 + uSunColor * shadow * 0.85);
  col = mix(col, foamCol, foam * 0.92);

  col += pointLightsAt(vWorldPos, vec3(0.0, 1.0, 0.0), 0.3) * 0.25;
  gl_FragColor = vec4(col, 1.0);
  if (uDbg > 0.5) gl_FragColor = vec4(foam, vBreak, clamp(thick, 0.0, 1.0), 1.0);
  if (uDbg > 1.5) gl_FragColor = vec4(vCrest, vExpo, fract(vShoreD / 10.0), 1.0);
}
`;

// Grid offsets: 0.5 m squares near the camera growing geometrically towards the horizon
function gridCoords() {
  const c = [0];
  let x = 0, step = 0.5;
  while (x < 1300) {
    x += step;
    c.push(x);
    if (x > 26) step *= 1.07;
  }
  return [...c.slice(1).reverse().map((v) => -v), ...c];
}

function waterGrid() {
  const cs = gridCoords();
  const n = cs.length;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const o = (j * n + i) * 3;
    pos[o] = cs[i];
    pos[o + 2] = cs[j];
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx[k++] = a; idx[k++] = c; idx[k++] = b;
    idx[k++] = b; idx[k++] = c; idx[k++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

// Bake the sea field on the terrain's height grid: exposure, signed shore distance, shore direction
export function buildSeaTexture(terrain) {
  const n = terrain.n, H = terrain.h, R = (2 * L.WORLD_HALF) / (n - 1);
  const N = n * n;
  const wet = new Uint8Array(N);
  for (let i = 0; i < N; i++) wet[i] = H[i] < 0 ? 1 : 0;
  // chamfer distance (3-4) to the other medium
  const INF = 1e9;
  const dist = new Float32Array(N);
  const chamfer = (inside) => {
    const D = new Float32Array(N);
    for (let i = 0; i < N; i++) D[i] = wet[i] === inside ? INF : 0;
    const a = 1, b = Math.SQRT2;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const id = j * n + i;
      if (D[id] === 0) continue;
      let m = D[id];
      if (i > 0) m = Math.min(m, D[id - 1] + a);
      if (j > 0) {
        m = Math.min(m, D[id - n] + a);
        if (i > 0) m = Math.min(m, D[id - n - 1] + b);
        if (i < n - 1) m = Math.min(m, D[id - n + 1] + b);
      }
      D[id] = m;
    }
    for (let j = n - 1; j >= 0; j--) for (let i = n - 1; i >= 0; i--) {
      const id = j * n + i;
      if (D[id] === 0) continue;
      let m = D[id];
      if (i < n - 1) m = Math.min(m, D[id + 1] + a);
      if (j < n - 1) {
        m = Math.min(m, D[id + n] + a);
        if (i < n - 1) m = Math.min(m, D[id + n + 1] + b);
        if (i > 0) m = Math.min(m, D[id + n - 1] + b);
      }
      D[id] = m;
    }
    return D;
  };
  const dWater = chamfer(1), dLand = chamfer(0);
  for (let i = 0; i < N; i++) dist[i] = wet[i] ? (dWater[i] - 0.5) * R : -(dLand[i] - 0.5) * R;
  // smooth so crests come out as clean curves
  const tmp = new Float32Array(N);
  for (let it = 0; it < 3; it++) {
    tmp.set(dist);
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      const id = j * n + i;
      dist[id] = (tmp[id] * 4 + tmp[id - 1] + tmp[id + 1] + tmp[id - n] + tmp[id + n]) / 8;
    }
  }
  const cove = L.SEA.find((s) => s.box);
  const data = new Uint16Array(N * 4);
  const hf = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const id = j * n + i;
    const x = L.WORLD_X0 + i * R, z = L.WORLD_Z0 + j * R;
    // exposure: open sea & beaches get surf, the harbour a little, river & pond none
    const sd = seaSDF(x, z);
    let e = 1 - smoothstep(-4, 16, sd);
    if (cove) {
      const [x0, z0, x1, z1] = cove.box;
      const inCove = Math.min(x - x0, x1 - x, z - z0, z1 - z);
      e *= 1 - 0.72 * smoothstep(-10, 20, inCove);
    }
    e = Math.max(e * (0.75 + 0.25 * beachMask(x, z)), beachMask(x, z) * (1 - smoothstep(-4, 30, sd)));
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1), j0 = Math.max(0, j - 1), j1 = Math.min(n - 1, j + 1);
    let gx = (dist[j * n + i1] - dist[j * n + i0]) / ((i1 - i0) * R), gz = (dist[j1 * n + i] - dist[j0 * n + i]) / ((j1 - j0) * R);
    const gl = Math.hypot(gx, gz) || 1;
    data[id * 4] = hf(e);
    data[id * 4 + 1] = hf(Math.max(-40, Math.min(200, dist[id])));
    data[id * 4 + 2] = hf(-gx / gl);
    data[id * 4 + 3] = hf(-gz / gl);
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  SEA.uSeaTex.value = tex;
  return tex;
}
function smoothstep(a, b, v) {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function createWater(pipeline, terrain) {
  if (!SEA.uSeaTex.value && terrain) buildSeaTexture(terrain);
  const geo = waterGrid();
  const uniforms = worldUniforms({
    tRefl: pipeline.reflUniforms.tRefl,
    uReflMatrix: pipeline.reflUniforms.uReflMatrix,
    uDeep: { value: new THREE.Color(0x0b3446) },
    uShallow: { value: new THREE.Color(0x1d6e72) },
    uSandy: { value: new THREE.Color(0x5aa89c) },
    uWetSand: { value: new THREE.Color(0x6e6252) },
    uCalm: { value: new THREE.Color(0x163c38) },
    uFoam: { value: new THREE.Color(0xeef4ec) },
    uHorizon: SKY.uHorizon,
    uZenith: SKY.uZenith,
    uReflOn: { value: 1 },
    uRain: { value: 0 },
    uGridCenter: { value: new THREE.Vector2() },
    uWaveAmp: { value: 1 },
    uDbg: { value: 0 },
    ...SEA,
  });
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  mesh.layers.set(1);
  mesh.name = 'water';
  mesh.frustumCulled = false;
  // follow the camera, snapped to the finest grid step so near vertices never swim
  mesh.onBeforeRender = (r, s, camera) => {
    uniforms.uGridCenter.value.set(Math.round(camera.position.x * 2) / 2, Math.round(camera.position.z * 2) / 2);
  };
  return mesh;
}
