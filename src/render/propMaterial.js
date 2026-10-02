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
  // mip level from the unwrapped uv, so tile repeats don't pick a tiny mip along every seam
  vec4 tx = textureGrad(tAtlas, auv, dFdx(vUv) * vTile.zw, dFdy(vUv) * vTile.zw);
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
  float em = vColor.a;
  if (tx.a < 0.9) {
    // glass (atlas alpha ~200): dark panes with a sky sheen by day,
    // lamp-light behind the curtains at night on lit windows (emissive 1)
    vec3 v = normalize(uCamPos - vWorldPos);
    float fres = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0);
    vec3 dayCol = col * 0.6 + uSkyAmb * (0.12 + fres * 0.6);
    float wid = hash12(floor(vWorldPos.xz * 0.6) + floor(vWorldPos.y * 0.4));
    vec3 warm = mix(vec3(1.0, 0.6, 0.26), vec3(1.0, 0.78, 0.46), wid);
    float flick = 0.94 + 0.06 * sin(uTime * (1.7 + wid * 2.0) + wid * 6.28);
    // curtains (saturated pixels) tint the light; bare panes glow plain warm
    float sat = max(tx.r, max(tx.g, tx.b)) - min(tx.r, min(tx.g, tx.b));
    vec3 lamp = mix(warm * (0.8 + 0.4 * tx.rgb), warm * (tx.rgb * 1.3 + 0.12), smoothstep(0.12, 0.35, sat));
    lamp *= flick * (0.8 + uNight * 1.2) * uEmissiveBoost;
    float on = clamp(em, 0.0, 1.0) * clamp(uNight * 1.4 + 0.06, 0.0, 1.0);
    col = mix(dayCol, lamp, on);
  } else if (em > 1.2) {
    // lamps, bulbs, the lighthouse lens
    col += albedo * em * (0.6 + uNight * 2.2) * uEmissiveBoost;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const DEPTH_FRAG = /* glsl */ `
uniform sampler2D tAtlas;
varying vec4 vTile;
varying vec2 vUv;
void main() {
  vec2 auv = vTile.xy + clamp(fract(vUv), 0.002, 0.998) * vTile.zw;
  if (textureLod(tAtlas, auv, 0.0).a < 0.5) discard;
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
