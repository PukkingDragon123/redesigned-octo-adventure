// Reflective pixel water for the cove, river and pond (all at sea level).
import * as THREE from 'three';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, HEIGHT_GLSL } from '../render/shaderlib.js';
import { SKY } from '../render/sky.js';

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
uniform mat4 uReflMatrix;
varying vec3 vWorldPos;
varying vec4 vRefl;
void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vRefl = uReflMatrix * worldPosition;
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = normalMatrix * normal;
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
uniform vec3 uFoam;
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform float uReflOn;
uniform vec2 uWind;
uniform float uRain;
varying vec3 vWorldPos;
varying vec4 vRefl;

void main() {
  vec2 wp = vWorldPos.xz;
  // pixel-snapped sampling space: 8 px / metre
  vec2 q = floor(wp * 8.0) / 8.0;
  float t = uTime;
  float terrH = terrainHeight(wp);
  float depth = max(0.0, -terrH);

  // ripples
  vec2 flow = uWind * 0.25;
  float r1 = vnoise(q * vec2(0.55, 1.6) + vec2(t * 0.35, t * 0.1) + flow * t);
  float r2 = vnoise(q * vec2(1.4, 0.5) - vec2(t * 0.22, t * 0.31));
  vec2 nrm = vec2(r1 - 0.5, r2 - 0.5);
  // rain rings
  if (uRain > 0.0) {
    vec2 cell = floor(q * 1.2);
    float rh = hash12(cell + floor(t * 2.0));
    vec2 c = (cell + 0.5) / 1.2;
    float d = length(q - c);
    float ph = fract(t * 2.0 + rh);
    float ring = smoothstep(0.06, 0.0, abs(d - ph * 0.35)) * (1.0 - ph) * step(0.6, rh);
    nrm += ring * uRain * 0.8;
  }

  vec3 n = normalize(vec3(nrm.x * 0.35, 1.0, nrm.y * 0.35));
  vec3 v = normalize(uCamPos - vWorldPos);
  float fres = 0.12 + 0.88 * pow(1.0 - max(dot(v, vec3(0.0, 1.0, 0.0)), 0.0), 4.0);

  // water body colour by depth
  float dk = smoothstep(0.0, 4.5, depth);
  vec3 body = mix(uShallow, uDeep, dk);
  float shadow = getShadowMask();
  body *= hemiAmbient(vec3(0.0, 1.0, 0.0)) * 1.1 + uSunColor * 0.25 * shadow;

  // reflection
  vec3 refl;
  vec4 rc = vRefl;
  rc.xy += nrm * 0.045 * rc.w * (0.4 + dk);
  if (uReflOn > 0.5) refl = texture2DProj(tRefl, rc).rgb;
  else refl = mix(uHorizon, uZenith, 0.4);
  vec3 col = mix(body, refl, clamp(fres * 0.92 + 0.12, 0.0, 0.92));

  // sun glitter (pixel sparkles)
  vec3 h = normalize(v + uSunDir);
  float spec = pow(max(dot(n, h), 0.0), 220.0);
  float spark = step(0.55, spec) * step(0.5, hash12(q * 8.0 + floor(t * 6.0)));
  col += uSunColor * (spec * 1.5 + spark * 2.5) * shadow;

  // shoreline foam
  float foamN = vnoise(q * 1.8 + vec2(t * 0.6, -t * 0.4));
  float foam = step(depth, 0.18 + foamN * 0.22 + 0.06 * sin(t * 1.5 + wp.x * 0.3));
  col = mix(col, uFoam * (hemiAmbient(vec3(0, 1, 0)) + uSunColor * shadow * 0.8), foam * 0.85);

  col += pointLightsAt(vWorldPos, vec3(0.0, 1.0, 0.0), 0.3) * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`;

export function createWater(pipeline) {
  const geo = new THREE.PlaneGeometry(2400, 2400, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const uniforms = worldUniforms({
    tRefl: pipeline.reflUniforms.tRefl,
    uReflMatrix: pipeline.reflUniforms.uReflMatrix,
    uDeep: { value: new THREE.Color(0x0b1e1c) },
    uShallow: { value: new THREE.Color(0x2c5a52) },
    uFoam: { value: new THREE.Color(0xd8e8e0) },
    uHorizon: SKY.uHorizon,
    uZenith: SKY.uZenith,
    uReflOn: { value: 1 },
    uRain: { value: 0 },
  });
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0;
  mesh.receiveShadow = true;
  mesh.layers.set(1);
  mesh.name = 'water';
  mesh.frustumCulled = false;
  return mesh;
}
