// Sky dome with pixel-banded clouds, sun, moon and stars + the far mountain ranges.
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
// Mountains: three ranges far beyond the play area, only on the land side (south-
// west round through the west and north to the north-east; the open sea to the east
// keeps a clear horizon). Rockies / Coast Mountains: the far range is tall, pale and
// snow-capped, the middle one blue slate with snow on its tops, the near foothills
// dark firs with gold larches and a few red maples. Each range is one low-poly strip
// of flat-shaded facets lit in hard bands, with chunky world-space texture cells; the
// pipeline's fog then fades them with distance like the rest of the world.
const MTN_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vWorldPos;
void main() {
  vN = normal;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const MTN_FRAG = /* glsl */ `
${NOISE_GLSL}
uniform vec3 uRock;
uniform vec3 uShade;
uniform vec3 uFir;
uniform vec3 uLarch;
uniform vec3 uMaple;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform float uHaze;
uniform float uSnowLine;
uniform float uTreeLine;
uniform float uForest;
uniform float uTop;
uniform float uPix;
uniform float uSeed;
uniform float uSnow;
uniform float uClipY;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uFogScale;
uniform float uFogHeight;
uniform float uFogMax;
varying vec3 vN;
varying vec3 vWorldPos;
void main() {
  vec3 p = vWorldPos;
  if (p.y < uClipY) discard;
  vec3 n = normalize(vN);
  // chunky world-space cells a few metres across: a crisp pixel texture that never shimmers
  vec3 cell = floor(p / uPix);
  float h1 = hash13(cell), h2 = hash13(cell + 17.0);
  // rock with sedimentary strata and the odd darker cell
  float strata = hash12(vec2(floor(p.y / (uPix * 1.6)), uSeed));
  vec3 alb = mix(uRock, uShade, step(0.6, strata) * 0.5 + step(0.82, h1) * 0.3);
  // forest below a ragged tree line: firs, gold larches, red maples low down
  float tl = uTreeLine + (h2 - 0.5) * uTop * 0.18;
  float tree = uForest * (1.0 - step(tl, p.y)) * step(0.12, n.y);
  vec3 trees = h1 < 0.6 ? uFir : h1 < 0.84 ? uLarch : (p.y < uTreeLine * 0.55 ? uMaple : uFir);
  alb = mix(alb, trees, tree);
  // snow caps with a jagged edge, a little lower on gentler faces and in a snowy spell
  float sl = uSnowLine - uSnow * uTop * 0.3 - n.y * uTop * 0.1 + (h1 - 0.5) * uPix * 3.0;
  float snow = step(sl, p.y) * step(0.06, n.y);
  alb = mix(alb, vec3(0.94, 0.95, 1.0), snow);
  // hard-banded light, like the rest of the world
  float ndl = clamp(dot(n, uSunDir), 0.0, 1.0);
  float band = step(0.06, ndl) * 0.55 + step(0.4, ndl) * 0.3 + step(0.78, ndl) * 0.15;
  vec3 light = mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5) + uSunColor * band;
  vec3 col = alb * light;
  // a warm rim towards the low sun
  vec3 d = normalize(p - cameraPosition);
  col += uSunGlow * pow(max(dot(d, uSunDir), 0.0), 4.0) * 0.2;
  // mist pooled along the foot of the range, then its own distance haze
  float mist = 1.0 - smoothstep(0.0, uTop * 0.5, p.y);
  col = mix(col, uHorizon, clamp(mist * 0.6 + uHaze, 0.0, 1.0));
  // so far off that the composite pass takes this for sky (depth ~1) and skips its fog:
  // fog it here the same way, so the range doesn't darken past that distance
  if (gl_FragCoord.z >= 0.99999) {
    float dist = length(p - cameraPosition);
    float hgt = exp(-max(p.y - 2.0, 0.0) * uFogHeight);
    float f = min(1.0 - exp(-dist * uFogDensity * uFogScale * (0.55 + 0.45 * hgt)), uFogMax);
    float sunAmt = pow(max(dot(d, uSunDir), 0.0), 6.0);
    col = mix(col, mix(uFogColor, uSunGlow * 1.2 + uFogColor * 0.6, sunAmt), f);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

// the land side as angles round the map centre (atan2(z, x): 0 east, PI/2 south, PI west, 3PI/2 north)
const LAND_ARC = [1.75, Math.PI * 2 - 0.62];
const TAPER = 0.55; // each end falls away to the sea over this much angle
const RANGES = [
  // far: the big snowy peaks, pale with distance
  { r: 1520, depth: 300, h0: 250, h1: 610, step: 10, wave: 400, snow: 305, tree: 0, forest: 0, pix: 8, haze: 0.16, rock: 0x9a9fd0, shade: 0x6c70a8, seed: 3 },
  // middle: blue-grey slate, snow on the tallest tops, larch gold low down
  { r: 1090, depth: 200, h0: 140, h1: 340, step: 9, wave: 250, snow: 230, tree: 110, forest: 0.6, pix: 6, haze: 0.07, rock: 0x66729e, shade: 0x464f7e, seed: 7 },
  // near: forested foothills
  { r: 730, depth: 130, h0: 55, h1: 180, step: 7, wave: 150, snow: 9999, tree: 140, forest: 1, pix: 4, haze: 0.02, rock: 0x4a5652, shade: 0x313b3a, seed: 11 },
];

const smooth01 = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// fog: the pipeline's composite uniforms (pipeline.post), shared so the far fragments match its fog
export function createMountains(fog = null) {
  const group = new THREE.Group();
  group.name = 'mountains';
  const sx = new Simplex(99);
  // ridged noise: sharp summits, rounded cols
  const ridge = (s, wave, seed) => {
    let h = 0, a = 1, f = 1 / wave, norm = 0;
    for (let o = 0; o < 4; o++) {
      const n = 1 - Math.abs(sx.noise(s * f + seed * 17.3, seed * 3.1 + o * 7.7));
      h += n * n * a;
      norm += a;
      a *= 0.5;
      f *= 2.1;
    }
    return h / norm;
  };
  const [a0, a1] = LAND_ARC;
  // cross-section rows from the foot (u = -1, sunk below the ground) over the crest (u = 0) to the back
  const ROWS = [-1, -0.62, -0.28, 0, 0.45, 1];
  const BASE = [0, 0.2, 0.58, 1, 0.7, 0.28];
  for (const R of RANGES) {
    const segs = Math.ceil(((a1 - a0) * R.r) / R.step);
    const cols = [];
    for (let i = 0; i <= segs; i++) {
      const th = a0 + ((a1 - a0) * i) / segs;
      const s = th * R.r; // metres along the range
      const taper = smooth01(a0, a0 + TAPER, th) * smooth01(a1, a1 - TAPER, th);
      const env = 0.62 + 0.38 * sx.noise(s / (R.wave * 5), R.seed + 50);
      const k = Math.min(1, Math.max(0, (ridge(s, R.wave, R.seed) - 0.22) / 0.6));
      const H = (R.h0 + (R.h1 - R.h0) * k * env) * Math.pow(taper, 0.8) - 40 * (1 - taper);
      const col = [];
      for (let j = 0; j < ROWS.length; j++) {
        let u = ROWS[j], y;
        if (j === 0) y = -70;
        else if (j === 3) {
          u = -0.05 + 0.18 * sx.noise(s / (R.wave * 0.8), R.seed + 9); // the crest wanders a little
          y = H;
        } else {
          // spurs and gullies running down from the crest
          const sp = ridge(s + 37 * j, R.wave * 0.55, R.seed + j) - 0.5;
          y = Math.max(-20, H * (BASE[j] + sp * 0.3));
        }
        const rr = R.r + u * R.depth + (j > 0 && j < 5 && j !== 3 ? sx.noise(s / 40, j * 13 + R.seed) * R.depth * 0.06 : 0);
        col.push([Math.cos(th) * rr, y, Math.sin(th) * rr]);
      }
      cols.push(col);
    }
    // flat-shaded facets: unindexed triangles, alternating diagonals; the winding makes the
    // front faces (foot to crest) face in towards the map
    const pos = new Float32Array(segs * (ROWS.length - 1) * 18);
    let o = 0;
    const put = (p) => { pos[o++] = p[0]; pos[o++] = p[1]; pos[o++] = p[2]; };
    const tri = (a, b, c) => { put(a); put(b); put(c); };
    for (let i = 0; i < segs; i++) {
      const A = cols[i], B = cols[i + 1];
      for (let j = 0; j < ROWS.length - 1; j++) {
        const p00 = A[j], p01 = A[j + 1], p10 = B[j], p11 = B[j + 1];
        if ((i + j) & 1) { tri(p00, p10, p11); tri(p00, p11, p01); }
        else { tri(p00, p10, p01); tri(p10, p11, p01); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), R.r + R.depth + R.h1);
    const C = (hex) => new THREE.Color(hex);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uRock: { value: C(R.rock) },
        uShade: { value: C(R.shade) },
        uFir: { value: C(0x23402f) },
        uLarch: { value: C(0xc8962a) },
        uMaple: { value: C(0xb4421c) },
        uHorizon: SKY.uHorizon,
        uSunGlow: SKY.uSunGlow,
        uSunDir: G.uSunDir,
        uSunColor: G.uSunColor,
        uSkyAmb: G.uSkyAmb,
        uGroundAmb: G.uGroundAmb,
        uHaze: { value: R.haze },
        uSnowLine: { value: R.snow },
        uTreeLine: { value: R.tree },
        uForest: { value: R.forest },
        uTop: { value: R.h1 },
        uPix: { value: R.pix },
        uSeed: { value: R.seed },
        uSnow: G.uSnow,
        uClipY: G.uClipY,
        uFogColor: fog?.uFogColor ?? { value: new THREE.Color() },
        uFogDensity: fog?.uFogDensity ?? { value: 0 },
        uFogScale: fog?.uFogScale ?? { value: 1 },
        uFogHeight: fog?.uFogHeight ?? { value: 0 },
        uFogMax: fog?.uFogMax ?? { value: 0 },
      },
      vertexShader: MTN_VERT,
      fragmentShader: MTN_FRAG,
      side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.matrixAutoUpdate = false;
    m.renderOrder = -50;
    m.name = `mountains:${R.r}`;
    m.userData.range = R;
    group.add(m);
  }
  return group;
}
