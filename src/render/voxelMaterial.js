// Lit material for voxel meshes (characters, props, buildings, trees).
// Vertex colour carries baked AO in rgb and an emissive amount in alpha.
import * as THREE from 'three';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL } from './shaderlib.js';

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
attribute vec4 color4;
uniform float uSway;      // wind sway amount per metre of height (trees)
uniform float uSwayY0;    // height (model space) where sway starts
uniform float uWobble;    // jelly wobble (squash bounce on props)
varying vec4 vColor;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vColor = color4;
  vec3 p = position;
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
  M = modelMatrix * instanceMatrix;
  #endif
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
varying vec4 vColor;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  if (vWorldPos.y < uClipY) discard;
  if (uFade > 0.0 && bayer4(gl_FragCoord.xy) < uFade) discard;
  vec3 albedo = vColor.rgb * uTint;
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
  col += albedo * uSunColor * rim * 0.4;
  float em = vColor.a;
  if (em > 0.75) col = mix(col, albedo * (1.6 + uNight * 1.6), 0.85);
  else if (em > 0.25) {
    // window glass: dark sheen by day, warm lamp light at night
    float wid = hash12(floor(vWorldPos.xz * 0.8) + floor(vWorldPos.y * 0.5));
    vec3 warm = mix(vec3(1.0, 0.62, 0.28), vec3(1.0, 0.8, 0.5), wid) * (0.8 + uNight * 1.3);
    float fres = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0);
    vec3 day = col * 0.55 + uSkyAmb * (0.12 + fres * 0.6);
    col = mix(day, warm * (0.75 + 0.5 * albedo), clamp(uNight * 1.4 + 0.04, 0.0, 1.0));
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
void main() {
  mat4 M = modelMatrix;
  #ifdef USE_INSTANCING
  M = modelMatrix * instanceMatrix;
  #endif
  vec4 wp = M * vec4(position, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const DEPTH_FRAG = /* glsl */ `void main() { gl_FragColor = vec4(1.0); }`;

export function createVoxelMaterial(opts = {}) {
  const uniforms = worldUniforms({
    uTint: { value: new THREE.Color(1, 1, 1) },
    uFade: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 0.98, 0.9) },
    uHighlight: { value: 0 },
    uSway: { value: opts.sway ?? 0 },
    uSwayY0: { value: opts.swayY0 ?? 0 },
    uWobble: { value: 0 },
  });
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true, side: opts.side ?? THREE.FrontSide });
  const depth = new THREE.ShaderMaterial({ uniforms, vertexShader: DEPTH_VERT, fragmentShader: DEPTH_FRAG, defines: { DEPTH_PASS: '' } });
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
