// Shared GLSL for the pixel-art world: lighting, shadows, noise, wind.
import * as THREE from 'three';

// Global uniforms shared (by reference) across every world material.
export const G = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.8, 0.6) },
  uSkyAmb: { value: new THREE.Color(0.35, 0.38, 0.5) },
  uGroundAmb: { value: new THREE.Color(0.22, 0.16, 0.12) },
  uWind: { value: new THREE.Vector2(1, 0.3) },
  uWindStrength: { value: 0.5 },
  uWet: { value: 0 },
  uSnow: { value: 0 },
  uNight: { value: 0 },
  uPL: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -999, 0, 1)) },
  uPLc: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, 0)) },
  uPlayer: { value: new THREE.Vector3() },
  uCamPos: { value: new THREE.Vector3() },
  uHeightTex: { value: null },
  uSplatTex: { value: null },
  uWorldHalf: { value: 320 },
  uClipY: { value: -1e5 }, // reflection pass: discard fragments below this
};

// Per-material light uniforms are cloned (three writes shadow maps into them),
// the G uniforms are shared by reference so one update drives every material.
export function worldUniforms(extra = {}) {
  return {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
    ...G,
    ...extra,
  };
}

export const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[i]) + 0.5) / 16.0;
}
`;

// Wind displacement for foliage/grass. h = height factor (0 at root), p = world pos
export const WIND_GLSL = /* glsl */ `
vec3 windOffset(vec3 p, float h, float phase) {
  float t = uTime;
  float gust = 0.6 + 0.4 * sin(t * 0.7 + p.x * 0.02 + p.z * 0.015) * sin(t * 0.31 + p.z * 0.03);
  float sway = sin(t * 1.9 + phase + p.x * 0.11 + p.z * 0.07) * 0.6 + sin(t * 3.3 + phase * 1.7) * 0.25;
  float s = uWindStrength * gust * (0.5 + sway) * h;
  return vec3(uWind.x, 0.0, uWind.y) * s;
}
`;

export const LIGHT_PARS_VERT = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
uniform float uTime;
uniform vec2 uWind;
uniform float uWindStrength;
`;

export const LIGHT_PARS_FRAG = /* glsl */ `
#include <common>
#include <packing>
uniform bool receiveShadow;
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
uniform vec3 uGroundAmb;
uniform float uTime;
uniform float uWet;
uniform float uSnow;
uniform float uNight;
uniform vec4 uPL[8];
uniform vec3 uPLc[8];
uniform vec3 uCamPos;
uniform float uClipY;

vec3 hemiAmbient(vec3 n) {
  return mix(uGroundAmb, uSkyAmb, n.y * 0.5 + 0.5);
}

// Posterised diffuse: a few crisp bands, pixel-art style.
float bandDiffuse(float ndl) {
  float d = clamp(ndl, 0.0, 1.0);
  return smoothstep(0.0, 0.08, d) * 0.55 + smoothstep(0.35, 0.45, d) * 0.3 + smoothstep(0.75, 0.82, d) * 0.15;
}

vec3 pointLightsAt(vec3 p, vec3 n, float wrap) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    vec3 d = uPL[i].xyz - p;
    float r = uPL[i].w;
    float dist = length(d);
    float att = clamp(1.0 - dist / r, 0.0, 1.0);
    att = att * att;
    float ndl = mix(max(dot(n, d / max(dist, 1e-3)), 0.0), 1.0, wrap);
    acc += uPLc[i] * att * ndl;
  }
  return acc;
}

// Generic lit colour for opaque world surfaces.
vec3 shadeWorld(vec3 albedo, vec3 n, vec3 wp, float shadow, float ao) {
  float ndl = dot(n, uSunDir);
  float direct = bandDiffuse(ndl) * shadow;
  vec3 light = hemiAmbient(n) * ao + uSunColor * direct + pointLightsAt(wp, n, 0.2);
  return albedo * light;
}
`;

export function clipDiscard() {
  return 'if (vWorldPos.y < uClipY) discard;';
}
