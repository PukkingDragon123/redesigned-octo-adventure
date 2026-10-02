// Terrain rendering: chunked meshes + a pixel-art splat shader.
import * as THREE from 'three';
import { G, worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, HEIGHT_GLSL } from '../render/shaderlib.js';
import { SEA, SEA_GLSL, buildSeaTexture } from './water.js';
import { pixTexture, dataTexture } from '../render/textures.js';
import { grassTex, dirtTex, litterTex, rockTex, sandTex, gravelTex } from '../art/groundtex.js';
import { H_RES } from './terrain.js';
import { WORLD_HALF, VILLAGE_FLAT } from './layout.js';

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
uniform sampler2D uSplatTex;
uniform vec4 uVillage;
varying vec3 vWorldPos;
varying vec3 vNormal;

vec3 tex(sampler2D t, vec2 uv) { return texture2D(t, uv).rgb; }

void main() {
  if (vWorldPos.y < uClipY) discard;
  vec3 n = normalize(vNormal);
  // texel-snapped world position: 16 texels per metre, 64px tile = 4m
  vec2 wp = vWorldPos.xz;
  vec2 texel = floor(wp * 16.0);
  vec2 uv = wp / 4.0;
  vec2 suv = (wp + uWorldHalf) / (2.0 * uWorldHalf);
  vec4 sp = texture2D(uSplatTex, suv);

  // coherent dither for crisp, organic material borders
  float dn = vnoise(texel * 0.09) * 0.55 + hash12(texel) * 0.45;

  float forest = smoothstep(0.1, 0.6, sp.a);
  vec3 col = mix(tex(tGrass, uv), tex(tGrass2, uv + 0.37), step(dn, forest));
  // big patches of colour variation (golden vs green meadows)
  float patchN = vnoise(wp / 38.0) * 0.7 + vnoise(wp / 11.0) * 0.3;
  col *= mix(vec3(1.08, 0.98, 0.82), vec3(0.9, 1.0, 0.94), patchN);

  if (sp.a > 0.25 + dn * 0.55) col = tex(tLitter, uv * 1.0 + 0.11);
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

  bool village = wp.x > uVillage.x && wp.x < uVillage.y && wp.y > uVillage.z && wp.y < uVillage.w;
  if (sp.r > 0.18 + dn * 0.62) col = village ? tex(tGravel, uv) : tex(tDirt, uv);

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
  // wet specular sheen
  vec3 v = normalize(uCamPos - vWorldPos);
  vec3 h = normalize(v + uSunDir);
  lit += uWet * uSunColor * pow(max(dot(n, h), 0.0), 60.0) * 0.6 * shadow;
  // wet sand: a soft glossy sheen and a little sky in it
  lit += wetSand * uSunColor * pow(max(dot(n, h), 0.0), 24.0) * 0.18 * shadow;
  lit += wetSand * 0.1 * hemiAmbient(vec3(0.0, 1.0, 0.0)) * pow(1.0 - max(dot(v, n), 0.0), 3.0);
  gl_FragColor = vec4(lit, 1.0);
}
`;

export function createTerrainMaterial() {
  const uniforms = worldUniforms({
    tGrass: { value: pixTexture(grassTex(0)) },
    tGrass2: { value: pixTexture(grassTex(1)) },
    tDirt: { value: pixTexture(dirtTex()) },
    tLitter: { value: pixTexture(litterTex()) },
    tRock: { value: pixTexture(rockTex()) },
    tSand: { value: pixTexture(sandTex()) },
    tGravel: { value: pixTexture(gravelTex()) },
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
  return { heightTex, splatTex, seaTex };
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
