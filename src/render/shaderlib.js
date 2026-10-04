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
  uHeightN: { value: 321 },
  uHRes: { value: 2 },
  uClipY: { value: -1e5 }, // reflection pass: discard fragments below this
  // camera see-through (game/camera.js drives these; SEE_GLSL reads them):
  // focus point (Hank, or a scene's subject) and how far the ring is open (0..1)
  uSee: { value: new THREE.Vector4(0, 0, 0, 0) },
  // ring radius at the focus, gap kept in front of the focus, bubble radius round the lens,
  // and the height below which nothing dissolves (the floor under the focus)
  uSeeP: { value: new THREE.Vector4(1.25, 0.75, 0.9, -1e5) },
  uSeePx: { value: 2 }, // dither cell size in screen pixels
  uSeeCamR: { value: 0.3 }, // ring radius at the lens end (wide when a building is in the way)
};

// Per-material light uniforms are cloned (three writes shadow maps into them),
// the G uniforms are shared by reference so one update drives every material.
// uSeeOK is each material's own: 0 keeps it solid whatever the camera does (Hank, Bessie).
export function worldUniforms(extra = {}) {
  return {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.lights),
    ...G,
    uSeeOK: { value: 1 },
    ...extra,
  };
}

// Exact texel-centre lookup into the terrain heightmap texture
export const HEIGHT_GLSL = /* glsl */ `
uniform sampler2D uHeightTex;
uniform float uWorldHalf;
uniform float uHeightN;
uniform float uHRes;
vec2 heightUV(vec2 xz) { return ((xz + uWorldHalf) / uHRes + 0.5) / uHeightN; }
float terrainHeight(vec2 xz) { return texture2D(uHeightTex, heightUV(xz)).r; }
`;

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

// Depth (shadow-caster) variants compile with DEPTH_PASS so they never reference
// three's light/shadow uniforms (which only lights:true materials get populated).
export const SHADOW_VERT = /* glsl */ `
#ifndef DEPTH_PASS
#include <shadowmap_vertex>
#endif
`;

export const LIGHT_PARS_VERT = /* glsl */ `
#include <common>
#ifndef DEPTH_PASS
#include <shadowmap_pars_vertex>
#endif
uniform float uTime;
uniform vec2 uWind;
uniform float uWindStrength;
uniform vec3 uSunDir;
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

// Camera see-through. Whatever stands between the lens and the focus (Hank, or the subject
// of a cutscene shot) dissolves in a ring around them, and anything pressed against the
// lens melts away: a cone from the camera to a little short of the focus (it widens towards
// the lens into a tunnel when a building is in the way), plus a bubble round the camera. The dissolve is an ordered dither in chunky screen pixels with a slow
// noise eating at its edge, and the pixels about to go glow like embers (seeRim). Only the
// colour pass calls it: shadows and the depth pass never see a hole.
// Include after LIGHT_PARS_FRAG and NOISE_GLSL; call seeThrough() after the shader's own
// discards and pass its result to seeRim() on the final colour.
export const SEE_GLSL = /* glsl */ `
uniform vec4 uSee;
uniform vec4 uSeeP;
uniform float uSeePx;
uniform float uSeeCamR;
uniform float uSeeOK;
float seeThrough(vec3 wp) {
  if (uSeeOK < 0.5) return 0.0;
  vec3 r = wp - uCamPos;
  float dc2 = dot(r, r);
  float m = 0.0;
  if (dc2 < uSeeP.z * uSeeP.z) m = 1.0 - smoothstep(uSeeP.z * 0.5, uSeeP.z, sqrt(dc2));
  vec3 ax = uSee.xyz - uCamPos;
  float L2 = dot(ax, ax);
  float along = dot(r, ax);
  // (most of the world is past the focus or behind the lens: one dot product and out)
  if (uSee.w > 0.0 && along > 0.0 && along < L2) {
    float L = sqrt(L2);
    along /= L;
    float perp = sqrt(max(dc2 - along * along, 0.0));
    // the ring opens (and grows) with uSee.w; full in its middle, dithered towards its edge
    float rad = mix(uSeeCamR, uSeeP.x, along / L) * (0.35 + 0.65 * uSee.w);
    float c = (1.0 - smoothstep(rad * 0.6, rad, perp))
      * (1.0 - smoothstep(L - uSeeP.y - 0.7, L - uSeeP.y, along))
      * smoothstep(uSeeP.w, uSeeP.w + 0.3, wp.y);
    m = max(m, c * uSee.w);
  }
  if (m < 0.004) return 0.0;
  // a burning edge: slow world-space noise eats the boundary unevenly
  float e = m * (1.0 - m) * 4.0;
  vec2 q = vec2(dot(wp.xz, vec2(2.1, 1.7)) + wp.y * 1.3, wp.y * 2.3 + dot(wp.xz, vec2(-0.9, 1.4)));
  m = clamp(m + (vnoise(q + uTime * vec2(0.35, -0.5)) - 0.5) * 0.8 * e, 0.0, 1.0);
  // ordered dither in chunky screen pixels: the wall goes pixel by pixel
  float th = bayer4(floor(gl_FragCoord.xy / uSeePx));
  if (th < m) discard;
  // the pixels about to go glow like embers
  return (1.0 - smoothstep(0.0, 0.16, th - m)) * smoothstep(0.03, 0.2, m);
}
vec3 seeRim(vec3 col, float rim) {
  return rim > 0.0 ? mix(col, vec3(2.6, 1.0, 0.3), rim * 0.8) : col;
}
`;
