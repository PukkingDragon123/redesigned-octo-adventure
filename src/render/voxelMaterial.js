// Lit material for voxel meshes (characters, props, buildings, trees).
// Vertex colour carries baked AO in rgb and an emissive amount in alpha.
import * as THREE from 'three';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL } from './shaderlib.js';

// Posed creatures (render/voxelRig.js): every vertex names its part ("bone"); each instance
// row of uBones holds a fade texel, then one 3x4 world matrix (three texels) per bone.
const RIG_PARS = /* glsl */ `
#ifdef VOX_RIG
attribute float bone;
uniform highp sampler2D uBones;
varying float vRigFade;
#endif
`;
const RIG_VERT = /* glsl */ `
#ifdef VOX_RIG
  {
    int b = 1 + int(bone + 0.5) * 3;
    vec4 r0 = texelFetch(uBones, ivec2(b, gl_InstanceID), 0);
    vec4 r1 = texelFetch(uBones, ivec2(b + 1, gl_InstanceID), 0);
    vec4 r2 = texelFetch(uBones, ivec2(b + 2, gl_InstanceID), 0);
    M = mat4(r0.x, r1.x, r2.x, 0.0, r0.y, r1.y, r2.y, 0.0, r0.z, r1.z, r2.z, 0.0, r0.w, r1.w, r2.w, 1.0);
    vRigFade = texelFetch(uBones, ivec2(0, gl_InstanceID), 0).x;
  }
#endif
`;

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
attribute vec4 color4;
attribute vec4 detail;
varying vec3 vDetail;
uniform float uSway;      // wind sway amount per metre of height (trees)
uniform float uSwayY0;    // height (model space) where sway starts
uniform float uWobble;    // jelly wobble (squash bounce on props)
varying vec4 vColor;
varying vec3 vWorldPos;
varying vec3 vNormal;
${RIG_PARS}
void main() {
  vColor = color4;
  vDetail = detail.xyz;
  vec3 p = position;
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
  M = modelMatrix * instanceMatrix;
  #endif
  ${RIG_VERT}
  vec4 worldPosition = M * vec4(p, 1.0);
  if (uSway > 0.0) {
    float k = max(p.y - uSwayY0, 0.0) * uSway;
    vec3 base = (M * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    float ph = dot(base.xz, vec2(0.37, 0.61));
    float t = uTime * 1.3 + ph;
    worldPosition.x += (sin(t) * 0.6 + sin(t * 2.3 + 1.7) * 0.25) * k * uWindStrength * (0.6 + uWind.x * 0.4);
    worldPosition.z += (cos(t * 0.8) * 0.5 + sin(t * 1.9) * 0.2) * k * uWindStrength * (0.6 + uWind.y * 0.4);
  }
  vWorldPos = worldPosition.xyz;
  vNormal = normalize(mat3(M) * normal);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = (viewMatrix * vec4(vNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  ${SHADOW_VERT}
}
`;

const FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
uniform vec3 uTint;
uniform float uFade;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uHighlight;
uniform sampler2D uDetailMap;
varying vec4 vColor;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vDetail;
#ifdef VOX_RIG
varying float vRigFade;
#endif
// pixel-art surface detail: 4 texels per voxel, 16x16-texel tiles (4x4 voxels) from a 4x4 atlas,
// point sampled; fades to flat once a texel gets smaller than a screen pixel (no shimmer)
float surfaceDetail() {
  float id = floor(vDetail.z + 0.5);
  if (id < 0.5) return 1.0;
  vec2 g = vDetail.xy;
  vec2 fw = fwidth(g);
  float fade = 1.0 - smoothstep(0.14, 0.3, max(fw.x, fw.y));
  if (fade <= 0.0) return 1.0;
  vec2 blk = floor(g * 0.25);
  float h = hash12(blk + id * 17.0);
  vec2 t = floor(mod(g * 4.0, 16.0));
  // mirror some blocks so the tiling doesn't read (grain keeps running along u)
  if (h > 0.5) t.x = 15.0 - t.x;
  if (fract(h * 7.31) > 0.5 && id != 2.0 && id != 5.0) t.y = 15.0 - t.y;
  vec2 cell = vec2(mod(id, 4.0), floor(id * 0.25));
  float m = texture2D(uDetailMap, (cell * 16.0 + t + 0.5) / 64.0).r * 2.0;
  return mix(1.0, m, fade);
}
void main() {
  if (vWorldPos.y < uClipY) discard;
  if (uFade > 0.0 && bayer4(gl_FragCoord.xy) < uFade) discard;
  #ifdef VOX_RIG
  if (vRigFade > 0.0 && bayer4(gl_FragCoord.xy) < vRigFade) discard;
  #endif
  vec3 albedo = vColor.rgb * uTint * surfaceDetail();
  vec3 n = normalize(vNormal);
  // snow settles on upward faces
  if (uSnow > 0.0 && n.y > 0.6) {
    float h = hash12(floor(vWorldPos.xz * 8.0));
    if (h < uSnow * 1.1 - 0.05) albedo = mix(albedo, h > uSnow * 0.9 ? vec3(0.72, 0.78, 0.92) : vec3(0.92, 0.94, 0.99), 0.92);
  }
  albedo *= mix(1.0, 0.75, uWet * step(0.5, n.y));
  float shadow = getShadowMask();
  float ndl = dot(n, uSunDir);
  // soft clay light: wrapped diffuse with a gentle step, so voxel faces read clearly
  float diff = clamp(ndl * 0.75 + 0.25, 0.0, 1.0);
  diff = mix(diff, smoothstep(0.15, 0.85, diff), 0.35) * shadow;
  vec3 light = hemiAmbient(n) * 1.05 + uSunColor * diff * 0.95 + pointLightsAt(vWorldPos, n, 0.35);
  vec3 col = albedo * light;
  // back-lit rim from the sun
  vec3 v = normalize(uCamPos - vWorldPos);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * max(dot(-v, uSunDir), 0.0) * shadow;
  // (only on upright faces: soil, mounds and floors stay matte)
  col += albedo * uSunColor * rim * 0.12 * (1.0 - smoothstep(0.3, 0.7, n.y));
  float em = vColor.a;
  if (em > 0.75) col = mix(col, albedo * (1.6 + uNight * 1.6), 0.85);
  else if (em > 0.25) {
    // window glass: dark sheen by day, warm lamp light at night (a gentle drift of tint from window
    // to window, never a seam across one); rooms with the light off (em 0.375) stay dark
    float wid = 0.5 + 0.5 * sin(dot(vWorldPos.xz, vec2(0.31, 0.43)) + vWorldPos.y * 0.37);
    vec3 warm = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.8, 0.5), wid) * (0.8 + uNight * 1.3);
    float fres = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0);
    vec3 day = col * 0.55 + uSkyAmb * (0.12 + fres * 0.6);
    col = mix(day, warm * (0.75 + 0.5 * albedo), clamp(uNight * 1.4 + 0.04, 0.0, 1.0) * step(0.44, em));
  }
  col += uHighlight * vec3(0.18, 0.15, 0.08) * (0.6 + 0.4 * sin(uTime * 6.0));
  col = mix(col, uFlashColor, uFlash);
  gl_FragColor = vec4(col, 1.0);
}
`;

const DEPTH_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
uniform float uSway;
uniform float uSwayY0;
${RIG_PARS}
void main() {
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
  M = modelMatrix * instanceMatrix;
  #endif
  ${RIG_VERT}
  vec4 wp = M * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const DEPTH_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`;

// ---- the pixel-art detail atlas: 4x4 tiles of 16x16 texels, red = brightness x 0.5
// tiles: 0 none, 1 dither, 2 wood grain, 3 brick clay, 4 stone, 5 paint, 6 foliage, 7 fabric, 8 metal
let detailTex = null;
function detailAtlas() {
  if (detailTex) return detailTex;
  const S = 64, data = new Uint8Array(S * S * 4);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
  const tiles = [];
  const tile = (fn) => {
    const t = new Float32Array(256).fill(1);
    fn(t, (x, y) => ((y & 15) << 4) | (x & 15));
    tiles.push(t);
  };
  tile(() => {}); // 0 none
  tile((t) => { for (let i = 0; i < 256; i++) { const r = rnd(); t[i] = r < 0.18 ? 0.92 : r > 0.86 ? 1.06 : 1; } }); // 1 dither
  tile((t, I) => { // 2 wood: grain streaks along u, a knot, darker plank edge every 8 texels
    for (let y = 0; y < 16; y++) {
      const base = (y % 8 === 7) ? 0.86 : (y % 8 === 0 ? 1.06 : 1);
      for (let x = 0; x < 16; x++) t[I(x, y)] = base;
    }
    for (let k = 0; k < 9; k++) {
      let y = Math.floor(rnd() * 16), x = Math.floor(rnd() * 16);
      const len = 4 + Math.floor(rnd() * 9), dk = rnd() < 0.6 ? 0.9 : 1.07;
      for (let j = 0; j < len; j++) { if (y % 8 !== 7) t[I(x + j, y)] = dk; if (rnd() < 0.15) y = (y + (rnd() < 0.5 ? 1 : 15)) % 16; }
    }
    const kx = 3 + Math.floor(rnd() * 10), ky = 2 + Math.floor(rnd() * 4);
    t[I(kx, ky)] = 0.78; t[I(kx + 1, ky)] = 0.84; t[I(kx - 1, ky)] = 0.92; t[I(kx, ky + 1)] = 0.9;
  });
  tile((t) => { for (let i = 0; i < 256; i++) { const r = rnd(); t[i] = r < 0.12 ? 0.86 : r < 0.3 ? 0.94 : r > 0.9 ? 1.08 : 1; } }); // 3 brick clay pits
  tile((t, I) => { // 4 stone: speckle, flat chips, a hairline crack
    for (let i = 0; i < 256; i++) { const r = rnd(); t[i] = r < 0.1 ? 0.9 : r > 0.88 ? 1.07 : 1; }
    for (let k = 0; k < 4; k++) { const x = Math.floor(rnd() * 15), y = Math.floor(rnd() * 15), v = rnd() < 0.5 ? 0.94 : 1.05; t[I(x, y)] = t[I(x + 1, y)] = t[I(x, y + 1)] = t[I(x + 1, y + 1)] = v; }
    let x = Math.floor(rnd() * 16), y = 0;
    for (; y < 9; y++) { t[I(x, y + 4)] = 0.82; if (rnd() < 0.5) x += rnd() < 0.5 ? 1 : -1; }
  });
  tile((t, I) => { // 5 paint: faint brush strokes along u, a little chipping
    for (let y = 0; y < 16; y++) { const v = (y % 4 === 3) ? 0.96 : 1; for (let x = 0; x < 16; x++) t[I(x, y)] = v; }
    for (let k = 0; k < 6; k++) { const y = Math.floor(rnd() * 16), x = Math.floor(rnd() * 16), l = 3 + Math.floor(rnd() * 6); for (let j = 0; j < l; j++) t[I(x + j, y)] = 1.04; }
    for (let k = 0; k < 3; k++) t[I(Math.floor(rnd() * 16), Math.floor(rnd() * 16))] = 0.86;
  });
  tile((t, I) => { // 6 foliage: clumped light/dark speckles
    for (let i = 0; i < 256; i++) t[i] = 1;
    for (let k = 0; k < 22; k++) { const x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16), v = rnd() < 0.55 ? 0.84 : 1.12; t[I(x, y)] = v; if (rnd() < 0.5) t[I(x + 1, y)] = v; if (rnd() < 0.4) t[I(x, y + 1)] = v; }
  });
  tile((t, I) => { // 7 fabric: a fine 2x2 weave with a seam every 8 texels
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) t[I(x, y)] = ((x >> 1) + (y >> 1)) & 1 ? 0.95 : 1.03;
    for (let x = 0; x < 16; x++) t[I(x, 15)] = 0.9;
  });
  tile((t, I) => { // 8 metal: smooth, a few bright scratches and rivet glints
    for (let i = 0; i < 256; i++) t[i] = rnd() < 0.06 ? 0.94 : 1;
    for (let k = 0; k < 3; k++) { const x = Math.floor(rnd() * 12), y = Math.floor(rnd() * 16); for (let j = 0; j < 4; j++) t[I(x + j, y + (j >> 1))] = 1.12; }
  });
  tiles.forEach((t, id) => {
    const cx = (id & 3) * 16, cy = (id >> 2) * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const o = ((cy + y) * S + cx + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = Math.max(0, Math.min(255, Math.round(t[(y << 4) | x] * 128)));
      data[o + 3] = 255;
    }
  });
  for (let id = tiles.length; id < 16; id++) { // unused slots: neutral
    const cx = (id & 3) * 16, cy = (id >> 2) * 16;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const o = ((cy + y) * S + cx + x) * 4; data[o] = data[o + 1] = data[o + 2] = 128; data[o + 3] = 255; }
  }
  detailTex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  detailTex.magFilter = detailTex.minFilter = THREE.NearestFilter;
  detailTex.generateMipmaps = false;
  detailTex.needsUpdate = true;
  return detailTex;
}

export function createVoxelMaterial(opts = {}) {
  const uniforms = worldUniforms({
    uDetailMap: { value: detailAtlas() },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.98, 0.9) },
    uHighlight: { value: 0 },
    uSway: { value: opts.sway ?? 0 },
    uSwayY0: { value: opts.swayY0 ?? 0 },
    uWobble: { value: 0 },
    ...(opts.rig ? { uBones: { value: opts.rig } } : {}),
  });
  const rig = opts.rig ? { VOX_RIG: '' } : {};
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true, side: opts.side ?? THREE.FrontSide, defines: { ...rig } });
  const depth = new THREE.ShaderMaterial({ uniforms, vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, defines: { DEPTH_PASS: '', ...rig } });
  mat.userData.depth = depth;
  return mat;
}

// one shared material for static voxel things; per-object materials only when they need their own fade/flash
let shared = null;
export function sharedVoxelMaterial() {
  return shared || (shared = createVoxelMaterial());
}

export function voxMesh(geometry, material = sharedVoxelMaterial(), { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (material.userData.depth) m.customDepthMaterial = material.userData.depth;
  return m;
}

// Flat textured pieces that live next to voxels: face decals, cloth ribbons, capes, paper.
// Texture alpha: >0.75 lit paint, 0.3..0.75 glowing paint, below that discarded.
const FLAT_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = (viewMatrix * vec4(vNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  ${SHADOW_VERT}
}
`;
const FLAT_FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
uniform sampler2D map;
uniform vec3 uTint;
uniform float uFade;
uniform float uFlash;
uniform vec3 uFlashColor;
uniform float uShade;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  if (vWorldPos.y < uClipY) discard;
  vec4 tex = texture2D(map, vUv);
  if (tex.a < 0.3) discard;
  if (uFade > 0.0 && bayer4(gl_FragCoord.xy) < uFade) discard;
  vec3 albedo = tex.rgb * uTint;
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) { n = -n; albedo *= uShade; }
  float shadow = getShadowMask();
  float ndl = dot(n, uSunDir);
  float diff = clamp(ndl * 0.75 + 0.25, 0.0, 1.0);
  diff = mix(diff, smoothstep(0.15, 0.85, diff), 0.35) * shadow;
  vec3 col = albedo * (hemiAmbient(n) * 1.05 + uSunColor * diff * 0.95 + pointLightsAt(vWorldPos, n, 0.35));
  if (tex.a < 0.75) col = albedo * (1.5 + uNight * 1.4);
  col = mix(col, uFlashColor, uFlash);
  gl_FragColor = vec4(col, 1.0);
}
`;
const FLAT_DEPTH_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0); }
`;
const FLAT_DEPTH_FRAG = /* glsl */ `
uniform sampler2D map;
varying vec2 vUv;
void main() { if (texture2D(map, vUv).a < 0.3) discard; gl_FragColor = vec4(1.0); }
`;

export function createFlatMaterial(map, opts = {}) {
  const uniforms = worldUniforms({
    map: { value: map },
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.98, 0.9) },
    uShade: { value: opts.backShade ?? 0.8 },
  });
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: FLAT_VERT, fragmentShader: FLAT_FRAG, lights: true, side: opts.side ?? THREE.FrontSide });
  mat.userData.depth = new THREE.ShaderMaterial({ uniforms, vertexShader: FLAT_DEPTH_VERT, fragmentShader: FLAT_DEPTH_FRAG, defines: { DEPTH_PASS: '' }, side: THREE.DoubleSide });
  return mat;
}
