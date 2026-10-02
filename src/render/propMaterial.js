// Lit material for merged static geometry (buildings, props, bike): atlas tile * vertex colour.
import * as THREE from 'three';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL } from './shaderlib.js';

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
attribute vec4 aColor;
attribute vec4 aTile;
varying vec4 vColor;
varying vec4 vTile;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vColor = aColor;
  vTile = aTile;
  vUv = uv;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = normalMatrix * normal;
  gl_Position = projectionMatrix * mvPosition;
  ${SHADOW_VERT}
}
`;

const FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
uniform sampler2D tAtlas;
uniform float uEmissiveBoost;
uniform float uSnowRoofs;
varying vec4 vColor;
varying vec4 vTile;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  if (vWorldPos.y < uClipY) discard;
  vec2 f = fract(vUv);
  vec2 auv = vTile.xy + clamp(f, 0.002, 0.998) * vTile.zw;
  vec4 tx = texture2D(tAtlas, auv);
  if (tx.a < 0.5) discard;
  vec3 albedo = tx.rgb * vColor.rgb;
  vec3 n = normalize(vNormal);
  if (!gl_FrontFacing) n = -n;
  // snow settles on upward faces
  if (uSnow > 0.0 && n.y > 0.6) {
    float h = hash12(floor(vWorldPos.xz * 16.0));
    if (h < uSnow * 1.1 - 0.05) albedo = h > uSnow * 0.9 ? vec3(0.72, 0.78, 0.92) : vec3(0.9, 0.93, 0.98);
  }
  albedo *= mix(1.0, 0.72, uWet * step(0.3, n.y));
  float shadow = getShadowMask();
  vec3 col = shadeWorld(albedo, n, vWorldPos, shadow, 1.0);
  // warm windows & lamps glow (more at night)
  float em = vColor.a;
  col += albedo * em * (0.6 + uNight * 2.2) * uEmissiveBoost;
  gl_FragColor = vec4(col, 1.0);
}
`;

const DEPTH_FRAG = /* glsl */ `
uniform sampler2D tAtlas;
varying vec4 vTile;
varying vec2 vUv;
void main() {
  vec2 auv = vTile.xy + clamp(fract(vUv), 0.002, 0.998) * vTile.zw;
  if (texture2D(tAtlas, auv).a < 0.5) discard;
  gl_FragColor = vec4(1.0);
}
`;

let whiteTex = null;
function white() {
  if (!whiteTex) {
    whiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    whiteTex.needsUpdate = true;
  }
  return whiteTex;
}

export function createPropMaterial(atlasTex = null, { side = THREE.FrontSide } = {}) {
  const uniforms = worldUniforms({
    tAtlas: { value: atlasTex || white() },
    uEmissiveBoost: { value: 1 },
    uSnowRoofs: { value: 1 },
  });
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true, side });
  const depth = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: DEPTH_FRAG, side, defines: { DEPTH_PASS: '' } });
  mat.userData.depth = depth;
  return mat;
}

export function propMesh(geometry, material, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.castShadow = cast;
  m.receiveShadow = receive;
  if (material.userData.depth) m.customDepthMaterial = material.userData.depth;
  return m;
}
