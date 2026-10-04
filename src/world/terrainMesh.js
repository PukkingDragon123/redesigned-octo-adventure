// Terrain rendering: chunked meshes + a pixel-art splat shader.
import * as THREE from 'three';
import { G, worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, HEIGHT_GLSL } from '../render/shaderlib.js';
import { SEA, SEA_GLSL, buildSeaTexture } from './water.js';
import { pixTexture, dataTexture } from '../render/textures.js';
import { grassTex, dirtTex, litterTex, rockTex, sandTex, gravelTex, asphaltTex } from '../art/groundtex.js';
import { H_RES } from './terrain.js';
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

  // roads & paths: a crisp edge with a little wobble, a darker worn rim, lighter wheel-worn middle
  bool village = wp.x > uVillage.x && wp.x < uVillage.y && wp.y > uVillage.z && wp.y < uVillage.w;
  float re = sp.r - (0.4 + (dn - 0.5) * 0.16);
  if (re > 0.0) {
    col = village ? tex(tGravel, uv) : tex(tDirt, uv);
    col *= re < 0.09 ? 0.84 : (sp.r > 0.97 ? 1.04 : 1.0);
  } else if (re > -0.06) col *= 0.88; // grass trodden flat along the verge
  // village road paint: asphalt on Main Street, a dashed centre line, zebra crossings, stop lines
  vec2 puv = (wp - uPaintRect.xy) / (uPaintRect.zw - uPaintRect.xy);
  if (puv.x > 0.0 && puv.y > 0.0 && puv.x < 1.0 && puv.y < 1.0) {
    vec4 pt = texture2D(uPaint, puv);
    if (pt.b > 0.5) col = tex(tAsphalt, uv);
    float wear = vnoise(wp * 3.1) * 0.6 + hash12(floor(texel / 2.0)) * 0.4;
    if (pt.r > 0.5 && wear < 0.82) col = vec3(0.86, 0.85, 0.8);
    if (pt.g > 0.5 && wear < 0.85) col = vec3(0.88, 0.7, 0.22);
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
  return tex;
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
    uVillage: { value: new THREE.Vector4(VILLAGE_FLAT.x0 - 10, VILLAGE_FLAT.x1 + 10, VILLAGE_FLAT.z0 - 12, VILLAGE_FLAT.z1 + 10) },
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
  return { heightTex, splatTex, seaTex, paintTex: PAINT.value };
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
