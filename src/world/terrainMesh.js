// Terrain rendering: chunked meshes + a pixel-art splat shader.
import * as THREE from 'three';
import { G, worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, HEIGHT_GLSL } from '../render/shaderlib.js';
import { SEA, SEA_GLSL, buildSeaTexture } from './water.js';
import { pixTexture, dataTexture } from '../render/textures.js';
import { grassTex, dirtTex, litterTex, rockTex, sandTex, gravelTex, asphaltTex } from '../art/groundtex.js';
import { H_RES, ROAD_SPAN } from './terrain.js';
import { WORLD_HALF, VILLAGE_FLAT, MAIN_ST, CROSSWALKS, SIDE_STREETS } from './layout.js';

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
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
${HEIGHT_GLSL}
${SEA_GLSL}
uniform sampler2D tGrass;
uniform sampler2D tGrass2;
uniform sampler2D tDirt;
uniform sampler2D tLitter;
uniform sampler2D tRock;
uniform sampler2D tSand;
uniform sampler2D tGravel;
uniform sampler2D tAsphalt;
uniform sampler2D uPaint;
uniform vec4 uPaintRect;
uniform sampler2D uSplatTex;
uniform sampler2D uRoadTex;
uniform vec4 uVillage;
varying vec3 vWorldPos;
varying vec3 vNormal;

vec3 tex(sampler2D t, vec2 uv) { return texture2D(t, uv).rgb; }

void main() {
  if (vWorldPos.y < uClipY) discard;
  vec3 n = normalize(vNormal);
  // texel-snapped world position: 32 texels per metre, 128 px tile = 4 m
  vec2 wp = vWorldPos.xz;
  vec2 texel = floor(wp * 32.0);
  vec2 uv = wp / 4.0;
  // break up tiling: big wobbly regions use a rotated, offset copy of each texture
  float region = vnoise(wp / 13.0 + 3.7) + (vnoise(wp / 3.1) - 0.5) * 0.18;
  if (region > 0.5) uv = vec2(uv.y, -uv.x) + vec2(0.37, 0.61);
  if (vnoise(wp / 17.0 - 5.1) > 0.55) uv = vec2(-uv.x, uv.y) + vec2(0.5, 0.25);
  vec2 suv = (wp + uWorldHalf) / (2.0 * uWorldHalf);
  vec4 sp = texture2D(uSplatTex, suv);

  // coherent noise for crisp, organic material borders: wobbly blob edges, not pixel static
  vec2 tq = texel / 32.0;
  float dn = vnoise(tq * 1.1) * 0.55 + vnoise(tq * 3.7 + 7.3) * 0.33 + hash12(floor(texel / 2.0)) * 0.12;

  float forest = smoothstep(0.1, 0.6, sp.a);
  vec3 col = mix(tex(tGrass, uv), tex(tGrass2, uv + 0.37), step(dn, forest));
  // big patches of colour variation (golden vs green meadows), in a few soft steps
  float patchN = vnoise(wp / 38.0) * 0.7 + vnoise(wp / 11.0) * 0.3;
  patchN = floor(patchN * 4.0 + 0.5) / 4.0;
  col *= mix(vec3(1.08, 0.98, 0.82), vec3(0.9, 1.0, 0.94), patchN);

  // leaf litter in drifts under the trees, with a soft dark rim where it meets the grass
  float lit0 = sp.a - (0.25 + dn * 0.55);
  if (lit0 > 0.0) col = tex(tLitter, uv * 1.0 + 0.11);
  else if (lit0 > -0.05) col *= 0.86;
  float wetSand = 0.0;
  if (sp.b > 0.2 + dn * 0.6) {
    col = tex(tSand, uv);
    // wet sand below the swash line: dark, glossy, the line creeps up and down with the waves
    vec4 si = seaInfo(wp);
    if (si.r > 0.05 && si.g > -16.0 && si.g < 2.0) {
      float run = 0.8 + 2.2 * (0.5 + 0.5 * sin(shorePhase(si.g, uTime) + 1.1));
      wetSand = (1.0 - smoothstep(run, run + 1.2 + dn * 1.5, -si.g)) * smoothstep(0.05, 0.4, si.r);
      // the damp band left higher up by the last big wave
      wetSand = max(wetSand, 0.4 * (1.0 - smoothstep(4.0, 5.5 + dn * 2.0, -si.g)) * smoothstep(0.05, 0.4, si.r));
      col *= mix(vec3(1.0), vec3(0.56, 0.55, 0.58), wetSand);
    }
  }

  // rock uses the dominant projection axis for cliffs
  vec3 an = abs(n);
  vec2 ruv = an.x > an.z ? vWorldPos.zy / 4.0 : vWorldPos.xy / 4.0;
  if (an.y > 0.75) ruv = uv;
  if (sp.g > 0.2 + dn * 0.6) col = tex(tRock, ruv);

  // roads & paths. The road frame (signed distance across the nearest road, its style) is read
  // at the texel centre, so tracks and grooves come out as whole pixels running along the road.
  bool village = wp.x > uVillage.x && wp.x < uVillage.y && wp.y > uVillage.z && wp.y < uVillage.w;
  float re = sp.r - (0.4 + (dn - 0.5) * 0.16);
  vec2 wq = (texel + 0.5) / 32.0;
  float across = 99.0, style = 0.0, rut = 0.0, bare = 0.0;
  if (re > -0.08) {
    vec2 rf = texture2D(uRoadTex, (wq + uWorldHalf) / (2.0 * uWorldHalf)).rg;
    if (rf.r < 0.985) { across = (rf.r * 255.0 - 128.0) / 127.0 * ${ROAD_SPAN.toFixed(1)}; style = rf.g; }
  }
  bool framed = across < 50.0;
  float ad = abs(across);
  if (re > 0.0) {
    bare = 1.0;
    float h1 = hash12(floor(texel / 2.0) + 7.0), h2 = hash12(texel + 1.7);
    vec3 dirt = tex(tDirt, uv);
    // gravel in the village and on the country roads, dirt on the trails, pale grit on footpaths
    col = (village || style > 0.9) ? tex(tGravel, uv) : dirt;
    if (framed && style < 0.15) col = mix(dirt, vec3(0.24, 0.19, 0.13), 0.4); // (scene colours are linear)
    float lum = dot(dirt, vec3(0.3, 0.55, 0.15));
    vec3 pk = mix(dirt, vec3(lum) * vec3(1.12, 0.94, 0.76), 0.55) * 0.86;
    if (framed) {
      // wheel tracks: two ruts on lanes and roads, one worn line down the middle of a trail or path
      bool twin = style > 0.5;
      float rw = style > 0.9 ? 1.05 : 0.8;
      float tc = twin ? abs(ad - rw) : ad;
      float thw = twin ? 0.32 : (style < 0.15 ? 0.34 : 0.4);
      float edge = thw + (h1 - 0.5) * 0.09;
      if (tc < edge) {
        rut = 1.0 - smoothstep(edge - 0.12, edge, tc);
        // packed soil (a footpath's worn line is pale and smooth instead)
        col = style < 0.15 ? mix(col, vec3(lum) * vec3(1.25, 1.1, 0.9), 0.45) : pk;
        // tyre grooves: whole-pixel lines along the track, broken where the tread skipped
        float k = floor(across * 32.0);
        float g = hash12(vec2(k, 3.1 + style * 7.0));
        float run = vnoise(wq * vec2(1.3, 1.1) + k * 0.37);
        if (g > 0.7 && run > 0.32) col *= 0.74;
        else if (g < 0.1 && run > 0.45) col *= 1.12;
        // the bank of the track: a pixel of darker spoil along its rim
        if (tc > edge - 0.05) col *= 0.82;
      } else if (twin && ad < rw - thw) {
        // the crown between the ruts: loose stones, and a ragged strip of grass on the country roads
        if (style > 0.9 && vnoise(wq * 2.2 + 5.0) * 0.6 + h1 * 0.4 > 0.58 - (rw - thw - ad) * 0.4) col = tex(tGrass, uv) * 0.92;
        else if (h2 > 0.93) col *= 1.18;
      }
    }
    // the edge: loose stones and a darker worn rim, grass tufts reaching in, leaves blown off the forest floor
    if (re < 0.1) {
      col *= 0.86;
      float cell = hash12(floor(texel / 2.0) + 3.3);
      if (cell > 0.9) { vec2 q = mod(texel, 2.0); col = vec3(0.26, 0.24, 0.21) * (q.y < 0.5 ? (q.x < 0.5 ? 1.3 : 1.0) : 0.55); }
    }
    float blade = hash12(vec2(texel.x, floor(texel.y / 3.0)) + 11.0);
    if (re < 0.075 && blade > 0.35 + re * 7.0) col = tex(tGrass, uv) * (blade > 0.8 ? 1.15 : 0.95);
    float leafy = smoothstep(0.04, 0.3, sp.a);
    if (leafy > 0.0 && re < 0.05 + 0.22 * leafy && vnoise(wq * 3.1 + 2.0) * 0.7 + h1 * 0.3 > 0.62 - re) col = tex(tLitter, uv + 0.23);
    // a granite edging along the village lanes
    if (village && framed && style > 0.5 && style < 0.9 && re < 0.05) col = h2 > 0.2 ? vec3(0.36, 0.35, 0.33) : vec3(0.17, 0.16, 0.15);
  } else if (re > -0.06) col *= 0.88; // grass trodden flat along the verge
  // village road paint: asphalt on Main Street, a dashed centre line, zebra crossings, stop lines
  vec2 puv = (wp - uPaintRect.xy) / (uPaintRect.zw - uPaintRect.xy);
  if (puv.x > 0.0 && puv.y > 0.0 && puv.x < 1.0 && puv.y < 1.0) {
    vec4 pt = texture2D(uPaint, puv);
    if (pt.b > 0.5) {
      col = tex(tAsphalt, uv);
      bare = 1.0;
      // the lanes' wheel paths, polished a shade darker, an oil drip down the middle of each lane
      if (framed) {
        float tc = min(abs(ad - 1.15), abs(ad - 2.85));
        if (tc < 0.4) col *= 0.9;
        if (abs(ad - 2.0) < 0.12 && hash12(floor(texel / 2.0) + 7.0) > 0.82) col *= 0.7;
        rut = 0.6 * (1.0 - step(0.45, abs(ad - 3.6))); // (puddles gather along the gutters)
      }
    }
    float wear = vnoise(wp * 3.1) * 0.6 + hash12(floor(texel / 2.0)) * 0.4;
    if (pt.r > 0.5 && wear < 0.82) col = vec3(0.86, 0.85, 0.8);
    if (pt.g > 0.5 && wear < 0.85) col = vec3(0.88, 0.7, 0.22);
  }
  // puddles after rain: in the ruts and hollows of roads, lanes and yards, growing with the wet;
  // matte (they take the sky's colour, no shine), a dark wet rim, rain rings popping on them
  if (bare > 0.0 && uWet > 0.04) {
    float pn = vnoise(wq * 0.85 + 3.3) * 0.62 + vnoise(wq * 2.6 - 1.1) * 0.38;
    float thr = 1.0 - uWet * (0.2 + 0.24 * rut);
    if (pn > thr) {
      col = mix(col * 0.3, uSkyAmb * 0.45 + vec3(0.02, 0.025, 0.035), 0.6);
      if (pn < thr + 0.02) col *= 0.75;
      else if (hash12(texel + floor(uTime * 7.0) * 1.31) > 0.994) col += vec3(0.25, 0.27, 0.3);
      col /= mix(1.0, 0.62, uWet); // (the wet darkening below is already in the water's colour)
    } else if (pn > thr - 0.035) col *= 0.82; // the damp ring round it
  }

  // wet ground darkens + gets a sky sheen
  col *= mix(1.0, 0.62, uWet);

  // snow settles on flat surfaces
  float snowMask = smoothstep(0.55, 0.9, n.y) * uSnow;
  if (snowMask > dn * 0.9 + 0.05) {
    float s = hash12(texel + 3.1);
    col = s > 0.85 ? vec3(0.78, 0.84, 0.95) : (s > 0.15 ? vec3(0.92, 0.94, 0.98) : vec3(0.7, 0.76, 0.9));
  }

  float shadow = getShadowMask();
  vec3 lit = shadeWorld(col, n, vWorldPos, shadow, 1.0);
  // the ground is matte: rain only darkens it (wet sand reads a touch darker too)
  lit *= 1.0 - wetSand * 0.12;
  gl_FragColor = vec4(lit, 1.0);
}
`;

// ---- road paint for the village (4 texels per metre): r white, g yellow, b asphalt
const PAINT_RECT = [VILLAGE_FLAT.x0 - 6, VILLAGE_FLAT.z0 - 6, VILLAGE_FLAT.x1 + 6, VILLAGE_FLAT.z1 + 2];
const PAINT = { value: null };
const ROADTEX = { value: null };
function buildPaintTexture() {
  const [x0, z0, x1, z1] = PAINT_RECT, K = 4;
  const w = Math.round((x1 - x0) * K), h = Math.round((z1 - z0) * K);
  const d = new Uint8Array(w * h * 4);
  const put = (ax, az, bx, bz, ch) => {
    for (let j = Math.max(0, Math.floor((az - z0) * K)); j < Math.min(h, Math.ceil((bz - z0) * K)); j++)
      for (let i = Math.max(0, Math.floor((ax - x0) * K)); i < Math.min(w, Math.ceil((bx - x0) * K)); i++) d[(j * w + i) * 4 + ch] = 255;
  };
  const M = MAIN_ST, hw = M.road / 2;
  put(M.x0 - 2, M.z - hw - 0.3, M.x1 + 2, M.z + hw + 0.3, 2); // asphalt
  for (const s of SIDE_STREETS) put(s.x - s.w / 2, s.side < 0 ? M.z - hw - M.walk - 9 : M.z + hw, s.x + s.w / 2, s.side < 0 ? M.z - hw : M.z + hw + M.walk + 9, 2);
  for (let x = M.x0 + 2; x < M.x1 - 2; x += 6) if (!CROSSWALKS.some((c) => Math.abs(c - x - 1.5) < 3.5)) put(x, M.z - 0.09, x + 3, M.z + 0.09, 1); // centre dashes
  for (const c of CROSSWALKS) for (let z = M.z - hw + 0.35; z < M.z + hw - 0.3; z += 1.0) put(c - 1.6, z, c + 1.6, z + 0.5, 0);
  for (const s of SIDE_STREETS) { const z = s.side < 0 ? M.z - hw - M.walk - 0.9 : M.z + hw + M.walk + 0.5; put(s.x - s.w / 2 + 0.3, z, s.x + s.w / 2 - 0.3, z + 0.4, 0); }
  const tex = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  PAINT_DATA = { d, w, h };
  return tex;
}
let PAINT_DATA = null;
const K_PAINT = 4;
// Main Street's (and its side streets') asphalt at (x, z), as the terrain shader paints it
export function isAsphalt(x, z) {
  const P = PAINT_DATA;
  if (!P) return false;
  const i = Math.floor((x - PAINT_RECT[0]) * K_PAINT), j = Math.floor((z - PAINT_RECT[1]) * K_PAINT);
  return i >= 0 && j >= 0 && i < P.w && j < P.h && P.d[(j * P.w + i) * 4 + 2] > 127;
}
// inside the village, where the roads are gravel lanes rather than dirt
const VBOX = [VILLAGE_FLAT.x0 - 10, VILLAGE_FLAT.x1 + 10, VILLAGE_FLAT.z0 - 12, VILLAGE_FLAT.z1 + 10];
export function inVillage(x, z) {
  return x > VBOX[0] && x < VBOX[1] && z > VBOX[2] && z < VBOX[3];
}

export function createTerrainMaterial() {
  const uniforms = worldUniforms({
    tGrass: { value: pixTexture(grassTex(0)) },
    tGrass2: { value: pixTexture(grassTex(1)) },
    tDirt: { value: pixTexture(dirtTex()) },
    tLitter: { value: pixTexture(litterTex()) },
    tRock: { value: pixTexture(rockTex()) },
    tSand: { value: pixTexture(sandTex()) },
    tGravel: { value: pixTexture(gravelTex()) },
    tAsphalt: { value: pixTexture(asphaltTex()) },
    uPaint: PAINT,
    uPaintRect: { value: new THREE.Vector4(...PAINT_RECT) },
    uRoadTex: ROADTEX,
    uVillage: { value: new THREE.Vector4(...VBOX) },
    ...SEA,
  });
  return new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true });
}

// Build shared height & splat textures for shaders (grass placement, water depth...)
export function createWorldTextures(terrain) {
  const n = terrain.n;
  const half = new Uint16Array(n * n);
  for (let i = 0; i < n * n; i++) half[i] = THREE.DataUtils.toHalfFloat(terrain.h[i]);
  const heightTex = dataTexture(half, n, n, { format: THREE.RedFormat, type: THREE.HalfFloatType, linear: true });
  const splatTex = dataTexture(new Uint8Array(terrain.splat.buffer.slice(0)), terrain.sn, terrain.sn, { linear: true });
  G.uHeightTex.value = heightTex;
  G.uSplatTex.value = splatTex;
  G.uWorldHalf.value = WORLD_HALF;
  G.uHeightN.value = n;
  G.uHRes.value = H_RES;
  const seaTex = buildSeaTexture(terrain);
  PAINT.value = buildPaintTexture();
  ROADTEX.value = dataTexture(terrain.roadInfo, terrain.rn, terrain.rn, { format: THREE.RGFormat, linear: true });
  return { heightTex, splatTex, seaTex, paintTex: PAINT.value, roadTex: ROADTEX.value };
}

export function createTerrainMeshes(terrain, material, chunkCells = 40) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const n = terrain.n;
  const cells = n - 1;
  const chunks = Math.ceil(cells / chunkCells);
  for (let cj = 0; cj < chunks; cj++) {
    for (let ci = 0; ci < chunks; ci++) {
      const i0 = ci * chunkCells, j0 = cj * chunkCells;
      const i1 = Math.min(cells, i0 + chunkCells), j1 = Math.min(cells, j0 + chunkCells);
      const w = i1 - i0 + 1, h = j1 - j0 + 1;
      const pos = new Float32Array(w * h * 3);
      const nor = new Float32Array(w * h * 3);
      let k = 0;
      let minY = Infinity, maxY = -Infinity;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = -WORLD_HALF + i * H_RES, z = -WORLD_HALF + j * H_RES;
          const y = terrain.h[j * n + i];
          pos[k * 3] = x;
          pos[k * 3 + 1] = y;
          pos[k * 3 + 2] = z;
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          const hl = terrain.h[j * n + Math.max(0, i - 1)], hr = terrain.h[j * n + Math.min(n - 1, i + 1)];
          const hd = terrain.h[Math.max(0, j - 1) * n + i], hu = terrain.h[Math.min(n - 1, j + 1) * n + i];
          const nx = hl - hr, nz = hd - hu, ny = 2 * H_RES;
          const l = Math.hypot(nx, ny, nz);
          nor[k * 3] = nx / l;
          nor[k * 3 + 1] = ny / l;
          nor[k * 3 + 2] = nz / l;
          k++;
        }
      }
      const idx = [];
      for (let j = 0; j < h - 1; j++) {
        for (let i = 0; i < w - 1; i++) {
          const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
          // alternate diagonal for nicer shading
          if ((i + j) & 1) idx.push(a, c, b, b, c, d);
          else idx.push(a, c, d, a, d, b);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setIndex(idx);
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      mesh.matrixAutoUpdate = false;
      if (maxY < -0.5) mesh.userData.underwater = true;
      group.add(mesh);
    }
  }
  return group;
}
