// Render pipeline:
//   scene -> HDR target (with depth) -> bloom -> composite (fog, god rays,
//   grading, cartoon outlines) -> FXAA -> canvas.
// Renders at native resolution by default (or above it on high-DPI screens);
// 'Retro' pixel sizes (>= 2) bring back the chunky dithered, posterised look.
import * as THREE from 'three';
import { G, NOISE_GLSL } from './shaderlib.js';
import { SKY } from './sky.js';

const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

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
  float l = max(max(c.r, c.g), c.b);
  float k = smoothstep(uThreshold, uThreshold + 0.6, l);
  gl_FragColor = vec4(c * k, 1.0);
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
varying vec2 vUv;

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
    const int N = 24;
    vec2 stepv = delta / float(N) * min(1.0, 0.85 / max(dl, 1e-3));
    vec2 p = uv;
    float acc = 0.0, w = 1.0;
    float jit = bayer4(gl_FragCoord.xy);
    p += stepv * jit;
    for (int i = 0; i < N; i++) {
      p += stepv;
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) break;
      float sd = texture2D(tDepth, p).r;
      if (sd >= 0.99999) {
        vec3 sc = texture2D(tColor, p).rgb;
        acc += w * smoothstep(0.6, 2.2, dot(sc, vec3(0.33)));
      }
      w *= 0.945;
    }
    acc /= float(N);
    float aspectFix = 1.0 - smoothstep(0.0, 1.1, dl);
    col += uSunColor * uSunGlow * acc * uRays * 2.6 * aspectFix * uSunVisible;
  }

  // --- bloom
  if (uBloomOn > 0.0) col += texture2D(tBloom, uv).rgb * uBloom;

  // --- exposure & tonemap
  col *= uExposure;
  col = aces(col);

  // --- grading: split toning, contrast, saturation
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, col * uShadowTint * 1.4, (1.0 - smoothstep(0.0, 0.45, l)) * 0.55);
  col = mix(col, col * uHighTint, smoothstep(0.45, 1.0, l) * 0.6);
  col = (col - 0.5) * uContrast + 0.5;
  l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  // cold, desaturated blue for the freezing intro
  col = mix(col, vec3(l * 0.75, l * 0.85, l * 1.15), uCold);

  // vignette
  vec2 vc = uv - 0.5;
  col *= 1.0 - dot(vc, vc) * uVignette;

  // fade & flash
  col = mix(col, uFadeColor, uFade);
  col = mix(col, vec3(1.0), uFlash);

  // --- linear -> sRGB, then ordered dither + quantise (pixel-art palette feel)
  col = clamp(col, 0.0, 1.0);
  col = pow(col, vec3(1.0 / 2.2));
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
    this.supersample = 1; // set by the graphics quality (game.applySettings)
    this.reflections = !touch;
    this.bloom = !touch;
    this.rays = !touch;
    this.shadowEvery = touch ? 2 : 1; // shadow map refresh every N frames
    this._frame = 0;
    this.fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.fsGeo = new THREE.PlaneGeometry(2, 2);
    this.fsMesh = new THREE.Mesh(this.fsGeo);
    this.fsMesh.frustumCulled = false;
    this.fsScene = new THREE.Scene();
    this.fsScene.add(this.fsMesh);

    this.brightMat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 0.95 } },
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
      uSaturation: { value: 1.12 },
      uContrast: { value: 1.06 },
      uShadowTint: { value: new THREE.Color(0.75, 0.62, 0.95) },
      uHighTint: { value: new THREE.Color(1.06, 0.98, 0.88) },
      uVignette: { value: 0.9 },
      uLevels: { value: 255 },
      uDither: { value: 0.5 },
      uOutline: { value: 1 },
      uOutlineW: { value: 1 },
      uFade: { value: 0 },
      uFadeColor: { value: new THREE.Color(0, 0, 0) },
      uFlash: { value: 0 },
      uTime: G.uTime,
      uCold: { value: 0 },
      tColor: { value: null },
      tDepth: { value: null },
      tBloom: { value: null },
    };
    this.compMat = new THREE.ShaderMaterial({
      uniforms: this.post, vertexShader: FS_VERT, fragmentShader: COMP_FRAG, depthTest: false, depthWrite: false,
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
    const W = window.innerWidth, H = window.innerHeight;
    let s = this.pixelScale;
    this.retro = s >= 2;
    if (this.retro) {
      this.w = Math.ceil(W / s);
      this.h = Math.ceil(H / s);
      this.canvas.style.width = `${this.w * s}px`;
      this.canvas.style.height = `${this.h * s}px`;
    } else {
      // native device pixels, capped by a pixel budget for very large or very dense screens
      // HD supersamples above the screen's pixels where the budget allows (crisper
      // edges on voxels, leaves and wires), then the browser filters it down
      // Below the screen's own density we drop by WHOLE device pixels (2x2, 3x3)
      // and upscale nearest, so the picture stays sharp instead of smeared.
      const dpr = Math.max(0.5, window.devicePixelRatio || 1);
      const ss = s <= 1 ? this.supersample : 1;
      const devW = W * dpr, devH = H * dpr;
      const want = Math.min(dpr * ss, this.maxDpr) / dpr; // fraction of device pixels
      const budget = Math.sqrt(this.maxPixels / (devW * devH));
      let k = Math.min(want, budget) / (s > 1 ? s : 1);
      let crisp = true;
      if (k > 1.01) crisp = false; // supersampled: the browser filters it down
      else if (k < 0.99) k = 1 / Math.ceil(1 / k - 0.02);
      else k = 1;
      this.w = Math.max(2, Math.round(devW * k));
      this.h = Math.max(2, Math.round(devH * k));
      this.canvas.style.width = `${W}px`;
      this.canvas.style.height = `${H}px`;
      this.crisp = crisp;
    }
    this.canvas.style.imageRendering = this.retro || this.crisp ? 'pixelated' : 'auto';
    this.renderer.setSize(this.w, this.h, false);
    this.post.uRes.value.set(this.w, this.h);
    const P = this.post;
    P.uLevels.value = this.retro ? 40 : 255;
    P.uDither.value = this.retro ? 0.85 : 0.5;
    P.uOutlineW.value = this.retro ? 1 : Math.max(1, Math.round(this.h / 620));
    P.uVignette.value = this.retro ? 0.9 : 0.55;
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
    const prevMask = rc.layers.mask;
    rc.layers.set(0);
    rc.layers.enable(2); // reflection-visible extras
    rc.layers.disable(1); // no water, no grass in reflections
    this.renderer.setRenderTarget(this.reflRT);
    this.renderer.render(scene, rc);
    rc.layers.mask = prevMask;
    G.uClipY.value = -1e5;
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
    P.uRaysOn.value = this.rays ? 1 : 0;
    P.uBloomOn.value = this.bloom ? 1 : 0;
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
