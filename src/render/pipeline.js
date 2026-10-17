// Render pipeline:
//   scene -> HDR target (with depth) -> contact AO (half res) -> bloom ->
//   composite (AO, fog, god rays, grading, cartoon outlines) -> canvas.
// Renders at device pixels (or a whole fraction of them, upscaled nearest);
// 'Retro' pixel sizes (>= 2) bring back the chunky dithered, posterised look.
import * as THREE from 'three';
import { G, NOISE_GLSL } from './shaderlib.js';
import { SKY } from './sky.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

// Sun shadows: three's basic lookup (one hard tap), patched so a light whose shadow.radius
// is 1 or more filters its edge instead: nine taps weighted by a quadratic B-spline over
// the texel grid, a smooth edge about three texels wide that stays continuous as the light
// moves (no dither noise, no stair steps). The quality setting picks by radius alone
// (phones keep the single tap) without recompiling a shader.
{
  const C = THREE.ShaderChunk;
  const src = C.shadowmap_pars_fragment;
  // (three's build strips the chunks' comments: find the basic lookup's one hard tap itself)
  const tap = 'float depth = texture2D( shadowMap, shadowCoord.xy ).r;';
  const b = src.indexOf(tap) === src.lastIndexOf(tap) ? src.indexOf(tap) : -1;
  const soft = /* glsl */ `if ( shadowRadius >= 0.5 ) {
					vec2 q = shadowCoord.xy * shadowMapSize;
					vec2 c = floor( q ) + 0.5;
					vec2 d = q - c;
					vec2 w0 = 0.5 * ( 0.5 - d ) * ( 0.5 - d ), w1 = 0.75 - d * d, w2 = 0.5 * ( 0.5 + d ) * ( 0.5 + d );
					vec2 ts = 1.0 / shadowMapSize;
					vec2 cu = c * ts;
					float acc = 0.0;
					for ( int j = -1; j <= 1; j ++ ) {
						float wy = j < 0 ? w0.y : ( j == 0 ? w1.y : w2.y );
						for ( int i = -1; i <= 1; i ++ ) {
							float wx = i < 0 ? w0.x : ( i == 0 ? w1.x : w2.x );
							float sd = texture2D( shadowMap, cu + vec2( float( i ), float( j ) ) * ts ).r;
							#ifdef USE_REVERSED_DEPTH_BUFFER
							acc += wx * wy * step( sd, shadowCoord.z );
							#else
							acc += wx * wy * step( shadowCoord.z, sd );
							#endif
						}
					}
					return mix( 1.0, acc, shadowIntensity );
				}
				`;
  if (b > 0) C.shadowmap_pars_fragment = src.slice(0, b) + soft + src.slice(b);
  else console.warn('pipeline: shadow chunk not patched');
}

// Contact ambient occlusion from the depth buffer, at half resolution: the dark seam where a
// house meets the ground, under the eaves, round a lamp post's foot, in the crooks of the
// voxels. Normal-oriented (from the neighbouring depths) so flat ground stays clean; 8 taps
// rotated through a 4x4 pattern that the composite's 4x4 depth-aware filter averages away.
const AO_FRAG = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D tDepth;
uniform vec4 uProj;   // 1/P00, 1/P11, near, far
uniform vec2 uTexel;  // full-res texel (uv)
uniform float uRadius;
varying vec2 vUv;
float viewZ(float d) { return (uProj.z * uProj.w) / ((uProj.w - uProj.z) * d - uProj.w); }
vec3 viewPos(vec2 uv) {
  float z = viewZ(texture2D(tDepth, uv).r);
  return vec3((uv * 2.0 - 1.0) * uProj.xy * -z, z);
}
void main() {
  float d = texture2D(tDepth, vUv).r;
  vec3 P = viewPos(vUv);
  float far = -P.z;
  if (d >= 0.99999 || far > 75.0) { gl_FragColor = vec4(1.0, far, 0.0, 1.0); return; }
  vec2 tx = uTexel * 2.0;
  vec3 pr = viewPos(vUv + vec2(tx.x, 0.0)), pl = viewPos(vUv - vec2(tx.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, tx.y)), pd = viewPos(vUv - vec2(0.0, tx.y));
  vec3 dx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
  vec3 dy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
  vec3 N = normalize(cross(dx, dy));
  // world radius -> uv radius (capped so a face against the lens doesn't fetch the whole screen)
  float R = uRadius * (1.0 + far * 0.012);
  vec2 ruv = min(R / (far * uProj.xy) * 0.5, vec2(0.08));
  float rot = bayer4(gl_FragCoord.xy) * 6.2831853;
  float occ = 0.0;
  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / 8.0);
    float th = fi * 2.3999632 + rot;
    vec3 S = viewPos(vUv + vec2(cos(th), sin(th)) * r * ruv);
    vec3 v = S - P;
    float L = length(v);
    float c = max(dot(v / max(L, 1e-4), N) - 0.12, 0.0);
    occ += c * (1.0 - smoothstep(R * 0.6, R * 1.4, L));
  }
  float ao = 1.0 - occ / 8.0 * 1.6;
  ao = clamp(ao, 0.0, 1.0);
  ao = mix(ao, 1.0, smoothstep(45.0, 75.0, far));
  gl_FragColor = vec4(ao, far, 0.0, 1.0);
}
`;

const FS_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BRIGHT_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) c += texture2D(tColor, vUv + vec2(x, y) * uTexel).rgb;
  c /= 9.0;
  // only real light sources bloom (lamps, the sun's disc, glints): sunlit white paint
  // tops out round 2 and stays crisp; a soft knee so lamps swell in rather than pop
  float l = max(max(c.r, c.g), c.b);
  float k = smoothstep(uThreshold, uThreshold * 1.8, l);
  gl_FragColor = vec4(c * k * k, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tColor, vUv).rgb * 0.227027;
  c += texture2D(tColor, vUv + uDir * 1.3846).rgb * 0.316216;
  c += texture2D(tColor, vUv - uDir * 1.3846).rgb * 0.316216;
  c += texture2D(tColor, vUv + uDir * 3.2308).rgb * 0.070270;
  c += texture2D(tColor, vUv - uDir * 3.2308).rgb * 0.070270;
  gl_FragColor = vec4(c, 1.0);
}
`;

// FXAA (the classic console variant): smooths voxel edges at native resolution
const FXAA_FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 uTexel;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 nw = texture2D(tColor, vUv + vec2(-1.0, -1.0) * uTexel).rgb;
  vec3 ne = texture2D(tColor, vUv + vec2(1.0, -1.0) * uTexel).rgb;
  vec3 sw = texture2D(tColor, vUv + vec2(-1.0, 1.0) * uTexel).rgb;
  vec3 se = texture2D(tColor, vUv + vec2(1.0, 1.0) * uTexel).rgb;
  vec3 m = texture2D(tColor, vUv).rgb;
  float lNW = lum(nw), lNE = lum(ne), lSW = lum(sw), lSE = lum(se), lM = lum(m);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.04, lMax * 0.12)) { gl_FragColor = vec4(m, 1.0); return; }
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcp, -8.0, 8.0) * uTexel;
  vec3 a = 0.5 * (texture2D(tColor, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tColor, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture2D(tColor, vUv - dir * 0.5).rgb + texture2D(tColor, vUv + dir * 0.5).rgb);
  float lB = lum(b);
  gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}
`;

const COMP_FRAG = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform sampler2D tBloom;
uniform vec2 uRes;
uniform mat4 uInvProj;
uniform mat4 uInvView;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uFogColor;
uniform vec3 uSunGlow;
uniform vec2 uSunScreen;
uniform float uSunVisible;
uniform float uFogDensity;
uniform float uFogScale;
uniform float uRaysOn;
uniform float uBloomOn;
uniform float uFogHeight;
uniform float uFogMax;
uniform float uRays;
uniform float uBloom;
uniform float uExposure;
uniform float uDayExp;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uVignette;
uniform float uLevels;
uniform float uDither;
uniform float uOutline;
uniform float uOutlineW;
uniform float uFade;
uniform vec3 uFadeColor;
uniform float uFlash;
uniform float uTime;
uniform float uCold;
uniform sampler2D tAO;
uniform float uAOOn;
uniform float uAO;
uniform vec2 uAOTexel;
uniform vec4 uProj;
uniform float uGrain;
uniform float uWarm;
uniform float uNightGrade;
uniform vec3 uVigTint;
varying vec2 vUv;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 worldFromDepth(vec2 uv, float d) {
  vec4 ndc = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  vec4 v = uInvProj * ndc;
  v /= v.w;
  return (uInvView * v).xyz;
}

vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec3 col = texture2D(tColor, uv).rgb;
  float depth = texture2D(tDepth, uv).r;
  bool sky = depth >= 0.99999;

  // --- contact AO: four bilinear taps cover a 4x4 block of the half-res AO (its 4x4
  // rotation pattern averages out), each weighted by how close its depth is to ours
  if (uAOOn > 0.0 && !sky) {
    float myF = -(uProj.z * uProj.w) / ((uProj.w - uProj.z) * depth - uProj.w);
    float s = 0.0, ws = 0.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = vec2(i == 0 || i == 2 ? -1.0 : 1.0, i < 2 ? -1.0 : 1.0);
      vec2 a = texture2D(tAO, uv + o * uAOTexel).rg;
      float w = max(0.01, 1.0 - abs(a.g - myF) / (myF * 0.06 + 0.05));
      s += a.r * w;
      ws += w;
    }
    float ao = s / ws;
    // the darkening sits mostly in the ambient light: full in shade, gentler in sunshine
    float lum = luma(col);
    col *= mix(1.0, ao, uAO * (1.0 - 0.35 * smoothstep(0.4, 1.6, lum)));
  }

  // --- atmospheric fog with sun in-scattering
  vec3 wp = worldFromDepth(uv, sky ? 0.9999 : depth);
  vec3 ray = wp - uCamPos;
  float dist = length(ray);
  vec3 rd = ray / max(dist, 1e-3);
  float sunAmt = pow(max(dot(rd, uSunDir), 0.0), 6.0);
  vec3 fogCol = mix(uFogColor, uSunGlow * 1.2 + uFogColor * 0.6, sunAmt);
  if (!sky) {
    float hgt = exp(-max(wp.y - 2.0, 0.0) * uFogHeight);
    float f = 1.0 - exp(-dist * uFogDensity * uFogScale * (0.55 + 0.45 * hgt));
    f = min(f, uFogMax);
    col = mix(col, fogCol, f);
  }

  // --- outlines from depth discontinuities (pixel-art edge darkening)
  if (uOutline > 0.0 && !sky) {
    float ld = dist;
    vec2 px = uOutlineW / uRes;
    float dmin = 1.0;
    for (int i = 0; i < 4; i++) {
      vec2 o = i == 0 ? vec2(px.x, 0.0) : i == 1 ? vec2(-px.x, 0.0) : i == 2 ? vec2(0.0, px.y) : vec2(0.0, -px.y);
      float nd = texture2D(tDepth, uv + o).r;
      vec3 nwp = worldFromDepth(uv + o, min(nd, 0.9999));
      float ndist = length(nwp - uCamPos);
      // neighbour is much further away -> we're on a silhouette edge
      if (ndist > ld * 1.18 + 0.6) dmin = min(dmin, 0.0);
    }
    float edgeK = (1.0 - dmin) * uOutline * (1.0 - smoothstep(30.0, 140.0, ld));
    col *= 1.0 - edgeK * 0.42;
  }

  // --- god rays: radial march of the bright sky towards the sun
  if (uRaysOn > 0.0 && uRays > 0.0 && uSunVisible > 0.0) {
    vec2 delta = (uSunScreen - uv);
    float dl = length(delta);
    // uRaysOn is the march's share of 24 steps (medium settings take 12, twice as long)
    const int N = 24;
    float n = floor(float(N) * uRaysOn + 0.5);
    vec2 stepv = delta / n * min(1.0, 0.85 / max(dl, 1e-3));
    float decay = pow(0.945, float(N) / n);
    vec2 p = uv;
    float acc = 0.0, w = 1.0;
    float jit = bayer4(gl_FragCoord.xy);
    p += stepv * jit;
    for (int i = 0; i < N; i++) {
      if (float(i) >= n) break;
      p += stepv;
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) break;
      float sd = texture2D(tDepth, p).r;
      if (sd >= 0.99999) {
        vec3 sc = texture2D(tColor, p).rgb;
        acc += w * smoothstep(0.6, 2.2, dot(sc, vec3(0.33)));
      }
      w *= decay;
    }
    acc /= n;
    float aspectFix = 1.0 - smoothstep(0.0, 1.1, dl);
    col += uSunColor * uSunGlow * acc * uRays * 2.6 * aspectFix * uSunVisible;
  }

  // --- bloom
  if (uBloomOn > 0.0) col += texture2D(tBloom, uv).rgb * uBloom;

  // --- exposure & filmic tonemap
  col *= uExposure * uDayExp;
  col = aces(col);

  // --- grading, LUT-style but analytic (in display space, where it reads evenly):
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  float l = luma(col);
  // split toning that keeps luminance: plum-blue shade, warm cream light
  vec3 sh = uShadowTint / luma(uShadowTint), hi = uHighTint / luma(uHighTint);
  col *= mix(vec3(1.0), sh, (1.0 - smoothstep(0.05, 0.5, l)) * 0.4);
  col *= mix(vec3(1.0), hi, smoothstep(0.4, 1.0, l) * 0.45);
  // the autumn palette: ambers and reds a touch richer, raw greens leaning to olive gold
  float mx = max(col.r, max(col.g, col.b)), mn = min(col.r, min(col.g, col.b));
  float sat = (mx - mn) / max(mx, 1e-3);
  float amber = clamp((col.r - col.b) / max(mx, 1e-3) * 1.4, 0.0, 1.0) * step(col.g, col.r);
  float green = clamp((col.g - max(col.r, col.b)) / max(mx, 1e-3) * 3.0, 0.0, 1.0);
  col = mix(col, col * vec3(1.05, 1.0, 0.93), amber * sat * uWarm);
  col.r = mix(col.r, col.g * 0.96, green * 0.28 * uWarm);
  // a soft S-curve round the mid grey (toe and shoulder, never a hard clip)
  vec3 sc = clamp(col, 0.0, 1.0);
  col = mix(sc, sc * sc * (3.0 - 2.0 * sc), uContrast - 1.0);
  l = luma(col);
  col = mix(vec3(l), col, uSaturation);
  // night vision: the moonlit world loses its colour towards a cool blue, while lamp-lit
  // and glowing things (the brighter pixels) keep theirs
  col = mix(col, l * vec3(0.78, 0.9, 1.18), uNightGrade * 0.3 * (1.0 - smoothstep(0.3, 0.75, l)));
  // cold, desaturated blue for the freezing intro
  col = mix(col, vec3(l * 0.75, l * 0.85, l * 1.15), uCold);

  // vignette: round (aspect-true), soft, sinking into a dusky plum rather than grey
  vec2 vc = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vr = length(vc) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);
  col *= mix(vec3(1.0), uVigTint, smoothstep(0.5, 1.1, vr) * uVignette);

  // film grain: fine, per pixel, mostly in the mid-tones (it never softens an edge)
  if (uGrain > 0.0) {
    float gn = hash12(gl_FragCoord.xy + fract(uTime * 7.31) * 517.0) - 0.5;
    col += gn * uGrain * (1.0 - abs(l - 0.5) * 1.6);
  }

  // fade & flash
  col = mix(col, pow(uFadeColor, vec3(1.0 / 2.2)), uFade);
  col = mix(col, vec3(1.0), uFlash);

  // --- ordered dither + quantise (pixel-art palette feel)
  col = clamp(col, 0.0, 1.0);
  float b = bayer4(gl_FragCoord.xy) - 0.5;
  col = floor(col * uLevels + 0.5 + b * uDither) / uLevels;
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Pipeline {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
    this.renderer.setPixelRatio(1);
    this.renderer.autoClear = true;
    this.renderer.shadowMap.enabled = true;
    // basic depth lookups; the sun's shadow.radius picks a soft filtered edge or one hard tap (see above)
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.pixelScale = 1;
    // FXAA softens the pixel art; off unless asked for (crisp edges win)
    this.fxaa = false;
    // pixel budget: phones are dense but small GPUs; desktops can afford more
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.touch = touch;
    this.maxPixels = touch ? 1.4e6 : 5.2e6;
    this.maxDpr = touch ? 1.5 : 3; // device pixels per CSS pixel we ever render
    this.reflections = !touch;
    this.bloom = !touch;
    this.rays = !touch;
    this.raySteps = 24; // god-ray march steps (12 or 24)
    this.ao = !touch; // contact AO (half-res depth pass)
    this.shadowEvery = touch ? 2 : 1; // shadow map refresh every N frames
    this._frame = 0;
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsGeo = new THREE.PlaneGeometry(2, 2);
    this.fsMesh = new THREE.Mesh(this.fsGeo);
    this.fsMesh.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.fsMesh);

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.9 } },
      vertexShader: FS_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
    });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, uDir: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
    });
    this.post = {
      uRes: { value: new THREE.Vector2() },
      uInvProj: { value: new THREE.Matrix4() },
      uInvView: { value: new THREE.Matrix4() },
      uCamPos: { value: new THREE.Vector3() },
      uSunDir: G.uSunDir,
      uSunColor: G.uSunColor,
      uFogColor: { value: new THREE.Color(0.8, 0.6, 0.7) },
      uSunGlow: SKY.uSunGlow,
      uSunScreen: { value: new THREE.Vector2(0.5, 0.5) },
      uSunVisible: { value: 0 },
      uFogDensity: { value: 0.006 },
      uFogScale: { value: 0.7 }, // thinner haze: the far hills and the cove read
      uRaysOn: { value: 1 },
      uBloomOn: { value: 1 },
      uFogHeight: { value: 0.04 },
      uFogMax: { value: 0.85 },
      uRays: { value: 1 },
      uBloom: { value: 0.6 },
      uExposure: { value: 1.0 },
      uDayExp: { value: 1.0 }, // the time of day's own exposure (atmosphere.js); uExposure is the scenes'
      uSaturation: { value: 1.12 },
      uContrast: { value: 1.28 },
      // split tones (normalised to keep luminance): blue-plum shade, warm cream light
      uShadowTint: { value: new THREE.Color(0.84, 0.82, 1.0) },
      uHighTint: { value: new THREE.Color(1.0, 0.96, 0.9) },
      uVignette: { value: 0.9 },
      uLevels: { value: 255 },
      uDither: { value: 0.5 },
      uOutline: { value: 1 },
      uOutlineW: { value: 1 },
      uFade: { value: 0 },
      // fades go to a warm dark plum-brown, never to pure black (sRGB hex, converted to linear)
      uFadeColor: { value: new THREE.Color(0x2c141c) },
      uFlash: { value: 0 },
      uTime: G.uTime,
      uCold: { value: 0 },
      tAO: { value: null },
      uAOOn: { value: 0 },
      uAO: { value: 0.75 },
      uAOTexel: { value: new THREE.Vector2() },
      uProj: { value: new THREE.Vector4(1, 1, 0.1, 2400) },
      uGrain: { value: 0 },
      uWarm: { value: 1 },
      uNightGrade: G.uNight,
      uVigTint: { value: new THREE.Color(0.74, 0.66, 0.74) },
      tColor: { value: null },
      tDepth: { value: null },
      tBloom: { value: null },
    };
    this.compMat = new THREE.ShaderMaterial({
      uniforms: this.post, vertexShader: FS_VERT, fragmentShader: COMP_FRAG, depthTest: false, depthWrite: false,
    });
    this.aoMat = new THREE.ShaderMaterial({
      uniforms: { tDepth: { value: null }, uProj: this.post.uProj, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 0.55 } },
      vertexShader: FS_VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false,
    });
    this.fxaaMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, uTexel: { value: new THREE.Vector2() } },
      vertexShader: FS_VERT, fragmentShader: FXAA_FRAG, depthTest: false, depthWrite: false,
    });
    this.reflCam = new THREE.PerspectiveCamera();
    this.reflUniforms = {
      tRefl: { value: null },
      uReflMatrix: { value: new THREE.Matrix4() },
    };
    this.resize();
  }

  makeTargets() {
    const { w, h } = this;
    this.sceneRT?.dispose();
    this.reflRT?.dispose();
    this.bloomA?.dispose();
    this.bloomB?.dispose();
    this.ldrRT?.dispose();
    this.aoRT?.dispose();
    const depthTexture = new THREE.DepthTexture(w, h);
    depthTexture.type = THREE.UnsignedIntType;
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture, depthBuffer: true,
    });
    // reflections don't need full resolution once the frame is HD
    const rk = this.retro ? 0.75 : 0.5;
    const rw = Math.max(2, Math.floor(w * rk)), rh = Math.max(2, Math.floor(h * rk));
    this.reflRT = new THREE.WebGLRenderTarget(rw, rh, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true });
    const bw = Math.max(2, Math.floor(w / 4)), bh = Math.max(2, Math.floor(h / 4));
    this.bloomA = new THREE.WebGLRenderTarget(bw, bh, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.bloomB = this.bloomA.clone();
    // contact AO at half resolution: r = occlusion, g = view distance (for the depth-aware filter)
    const aw = Math.max(2, Math.ceil(w / 2)), ah = Math.max(2, Math.ceil(h / 2));
    this.aoRT = new THREE.WebGLRenderTarget(aw, ah, { type: THREE.HalfFloatType, format: THREE.RGFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.post.tAO.value = this.aoRT.texture;
    this.post.uAOTexel.value.set(1 / aw, 1 / ah);
    this.aoMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.ldrRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.fxaaMat.uniforms.tColor.value = this.ldrRT.texture;
    this.fxaaMat.uniforms.uTexel.value.set(1 / w, 1 / h);
    this.reflUniforms.tRefl.value = this.reflRT.texture;
  }

  // pixelScale: 1 'HD' and 1.5 'Balanced' are DEVICE pixels per rendered pixel,
  // so phones and high-DPI screens render at their real sharpness (a CSS-pixel
  // canvas stretched over 2-3x as many device pixels looked smeared); 2 and 3
  // are the retro looks in CSS pixels (nearest upscale, dither, posterise).
  resize() {
    // the stage's real size: innerWidth/innerHeight are rounded to whole CSS pixels,
    // but a 1080-pixel-wide phone at 2.625 is 411.43 CSS pixels across
    const box = this.canvas.parentElement?.getBoundingClientRect?.();
    const W = box?.width || window.innerWidth, H = box?.height || window.innerHeight;
    let s = this.pixelScale;
    this.retro = s >= 2;
    if (this.retro) {
      // retro: s CSS pixels per rendered pixel, rounded to whole device pixels
      const dpr = Math.max(0.5, window.devicePixelRatio || 1);
      const devW = Math.round(W * dpr), devH = Math.round(H * dpr);
      const n = Math.max(1, Math.round(s * dpr));
      this.w = Math.max(2, Math.ceil(devW / n));
      this.h = Math.max(2, Math.ceil(devH / n));
      this.canvas.style.width = `${(this.w * n) / dpr}px`;
      this.canvas.style.height = `${(this.h * n) / dpr}px`;
      this.upscale = n;
    } else {
      // Device pixels, or a WHOLE fraction of them (1/2, 1/3...) when the pixel
      // budget or the 'Balanced' setting asks for less. Never above the screen's
      // own pixels: a supersampled canvas has to be filtered down by the browser
      // (bilinear), which smeared every edge of the picture. The canvas is then
      // sized in CSS so it covers exactly w*n by h*n device pixels and is
      // upscaled nearest-neighbour: every rendered pixel is an n x n hard block.
      const dpr = Math.max(0.5, window.devicePixelRatio || 1);
      const devW = Math.round(W * dpr), devH = Math.round(H * dpr);
      const want = Math.min(dpr, this.maxDpr) / dpr; // fraction of device pixels
      const budget = Math.sqrt(this.maxPixels / (devW * devH));
      const k = Math.min(1, want, budget) / (s > 1 ? s : 1);
      const n = Math.max(1, Math.ceil(1 / k - 0.02));
      this.w = Math.max(2, Math.ceil(devW / n));
      this.h = Math.max(2, Math.ceil(devH / n));
      this.canvas.style.width = `${(this.w * n) / dpr}px`;
      this.canvas.style.height = `${(this.h * n) / dpr}px`;
      this.crisp = true;
      this.upscale = n;
    }
    this.canvas.style.imageRendering = 'pixelated';
    this.renderer.setSize(this.w, this.h, false);
    this.post.uRes.value.set(this.w, this.h);
    const P = this.post;
    P.uLevels.value = this.retro ? 40 : 255;
    P.uDither.value = this.retro ? 0.85 : 0.5;
    P.uOutlineW.value = this.retro ? 1 : Math.max(1, Math.round(this.h / 620));
    P.uVignette.value = this.retro ? 1.0 : 0.8;
    // the see-through dissolve dithers in cells about as big as a retro pixel
    G.uSeePx.value = this.retro ? 1 : Math.max(1, Math.round(this.h / 400));
    this.makeTargets();
  }

  setPixelScale(s) {
    this.pixelScale = s;
    this.resize();
  }

  fs(material, target) {
    this.fsMesh.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.fsScene, this.fsCam);
  }

  renderReflection(scene, camera, waterY = 0) {
    const rc = this.reflCam;
    rc.copy(camera);
    // mirror camera across the water plane (same construction as three's Reflector)
    const p = _v1.copy(camera.position);
    const target = _v2.set(0, 0, -1).applyQuaternion(camera.quaternion).add(p);
    p.y = 2 * waterY - p.y;
    target.y = 2 * waterY - target.y;
    rc.position.copy(p);
    rc.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    rc.up.y = -rc.up.y;
    rc.lookAt(target);
    rc.scale.set(1, 1, 1);
    rc.updateMatrixWorld();
    rc.projectionMatrix.copy(camera.projectionMatrix);
    rc.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    // texture matrix: world -> refl uv
    const m = this.reflUniforms.uReflMatrix.value;
    m.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    m.multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
    G.uClipY.value = waterY - 0.05;
    // the mirrored lens sees no see-through ring or bubble
    const seeW = G.uSee.value.w, seeB = G.uSeeP.value.z;
    G.uSee.value.w = 0;
    G.uSeeP.value.z = 0;
    const prevMask = rc.layers.mask;
    rc.layers.set(0);
    rc.layers.enable(2); // reflection-visible extras
    rc.layers.disable(1); // no water, no grass in reflections
    this.renderer.setRenderTarget(this.reflRT);
    this.renderer.render(scene, rc);
    rc.layers.mask = prevMask;
    G.uClipY.value = -1e5;
    G.uSee.value.w = seeW;
    G.uSeeP.value.z = seeB;
  }

  render(scene, camera) {
    const r = this.renderer;
    camera.updateMatrixWorld();
    G.uCamPos.value.copy(camera.position);
    r.shadowMap.autoUpdate = false;
    if (this.reflections) {
      r.shadowMap.needsUpdate = false;
      this.renderReflection(scene, camera, 0);
    }
    this._frame++;
    r.shadowMap.needsUpdate = this.shadowEvery <= 1 || this._frame % this.shadowEvery === 0 || this._frame < 4;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    const P = this.post;
    P.uRaysOn.value = this.rays ? this.raySteps / 24 : 0;
    P.uBloomOn.value = this.bloom ? 1 : 0;
    P.uAOOn.value = this.ao ? 1 : 0;
    const pm = camera.projectionMatrix.elements;
    P.uProj.value.set(1 / pm[0], 1 / pm[5], camera.near, camera.far);
    if (this.ao) {
      this.aoMat.uniforms.tDepth.value = this.sceneRT.depthTexture;
      this.fs(this.aoMat, this.aoRT);
    }
    if (this.bloom) this.renderBloom();
    this.composite(camera);
  }

  renderBloom() {
    this.brightMat.uniforms.tColor.value = this.sceneRT.texture;
    this.brightMat.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
    this.fs(this.brightMat, this.bloomA);
    const bw = this.bloomA.width, bh = this.bloomA.height;
    for (let i = 0; i < 2; i++) {
      this.blurMat.uniforms.tColor.value = this.bloomA.texture;
      this.blurMat.uniforms.uDir.value.set((1 + i) / bw, 0);
      this.fs(this.blurMat, this.bloomB);
      this.blurMat.uniforms.tColor.value = this.bloomB.texture;
      this.blurMat.uniforms.uDir.value.set(0, (1 + i) / bh);
      this.fs(this.blurMat, this.bloomA);
    }
  }

  composite(camera) {
    const P = this.post;
    P.tColor.value = this.sceneRT.texture;
    P.tDepth.value = this.sceneRT.depthTexture;
    P.tBloom.value = this.bloomA.texture;
    P.uInvProj.value.copy(camera.projectionMatrixInverse);
    P.uInvView.value.copy(camera.matrixWorld);
    P.uCamPos.value.copy(camera.position);
    const sp = _v1.copy(camera.position).addScaledVector(G.uSunDir.value, 1000).project(camera);
    P.uSunScreen.value.set(sp.x * 0.5 + 0.5, sp.y * 0.5 + 0.5);
    const facing = _v2.set(0, 0, -1).applyQuaternion(camera.quaternion).dot(G.uSunDir.value);
    P.uSunVisible.value = Math.max(0, Math.min(1, (facing + 0.1) * 3)) * Math.max(0, Math.min(1, G.uSunDir.value.y * 8 + 0.4));
    if (this.fxaa && !this.retro) {
      this.fs(this.compMat, this.ldrRT);
      this.fs(this.fxaaMat, null);
    } else this.fs(this.compMat, null);
  }
}
