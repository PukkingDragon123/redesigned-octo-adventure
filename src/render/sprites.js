// Sprite atlas + 2D pixel-art billboards living in the 3D world (HD-2D style).
import * as THREE from 'three';
import { Pix } from '../art/pixel.js';
import { pixTexture } from './textures.js';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL, SEE_GLSL } from './shaderlib.js';

export const PPM = 25.6; // sprite pixels per metre

export class SpriteAtlas {
  constructor(size = 2048) {
    this.size = size;
    this.pix = new Pix(size, size);
    this.frames = new Map();
    this.shelfX = 0;
    this.shelfY = 0;
    this.shelfH = 0;
    this.texture = null;
  }
  alloc(w, h) {
    const pad = 1;
    if (this.shelfX + w + pad > this.size) {
      this.shelfX = 0;
      this.shelfY += this.shelfH + pad;
      this.shelfH = 0;
    }
    if (this.shelfY + h > this.size) throw new Error('sprite atlas full');
    const r = { x: this.shelfX, y: this.shelfY };
    this.shelfX += w + pad;
    this.shelfH = Math.max(this.shelfH, h);
    return r;
  }
  // paint(pix, x, y) draws a w x h frame at (x, y); anchor in frame pixels
  add(name, w, h, paint, ax = w / 2, ay = h) {
    if (this.frames.has(name)) return this.frames.get(name);
    const { x, y } = this.alloc(w, h);
    paint(this.pix, x, y);
    const f = { name, x, y, w, h, ax, ay };
    this.frames.set(name, f);
    return f;
  }
  get(name) {
    return this.frames.get(name);
  }
  // mips: coverage-keeping mip levels (frames must sit 4 px apart on a 4 px grid, see decoPaint.js),
  // so sprites far away neither shimmer nor thin out, and glowing pixels stay glowing
  finalize({ mips = false } = {}) {
    this.texture = pixTexture(this.pix, { repeat: false, mips: false });
    if (mips) {
      const t = this.texture;
      t.mipmaps = coverMips(t.image.data, this.size, this.size);
      t.minFilter = THREE.NearestMipmapNearestFilter;
    }
    this.texture.name = 'spriteAtlas';
    return this.texture;
  }
  uv(f) {
    const s = this.size;
    return [f.x / s, f.y / s, (f.x + f.w) / s, (f.y + f.h) / s];
  }
}

// Mip chain for alpha-tested pixel art: a texel is solid when at least 2 of its 4 children are,
// takes their mean colour and the alpha of the first one (alpha marks glowing pixels).
export function coverMips(data, w, h) {
  const out = [{ data, width: w, height: h }];
  let src = data, sw = w, sh = h;
  while (sw > 1 || sh > 1) {
    const dw = Math.max(1, sw >> 1), dh = Math.max(1, sh >> 1);
    const dst = new Uint8Array(dw * dh * 4);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      let n = 0, r = 0, g = 0, b = 0, a = 0;
      for (let q = 0; q < 4; q++) {
        const o = (Math.min(sh - 1, 2 * y + (q >> 1)) * sw + Math.min(sw - 1, 2 * x + (q & 1))) * 4;
        if (src[o + 3] < 128) continue;
        if (!n) a = src[o + 3];
        n++; r += src[o]; g += src[o + 1]; b += src[o + 2];
      }
      if (n < 2) continue;
      const o = (y * dw + x) * 4;
      dst[o] = r / n; dst[o + 1] = g / n; dst[o + 2] = b / n; dst[o + 3] = a;
    }
    out.push({ data: dst, width: dw, height: dh });
    src = dst; sw = dw; sh = dh;
  }
  return out;
}

const VERT = /* glsl */ `
${LIGHT_PARS_VERT}
uniform vec4 uRect;     // atlas uv rect (u0, v0, u1, v1)
uniform vec2 uSize;     // world size (m)
uniform vec2 uAnchor;   // anchor in [0,1] of the frame (x from left, y from top)
uniform float uFlip;
uniform float uRoll;
uniform vec2 uScale;    // squash & stretch
uniform float uUpright;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec3 center = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vec3 fwd;
  if (projectionMatrix[3][3] == 1.0) fwd = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
  else fwd = normalize(cameraPosition - center);
  vec3 up0 = vec3(0.0, 1.0, 0.0);
  vec3 f2 = normalize(vec3(fwd.x, 0.0, fwd.z) + vec3(0.0, 0.0, 1e-5));
  vec3 right = normalize(cross(up0, f2));
  // mostly upright billboards (HD-2D), with a touch of tilt towards the camera
  vec3 tilt = normalize(mix(fwd, f2, uUpright));
  vec3 up = normalize(cross(tilt, right));
  // local quad coords relative to the anchor, in metres
  vec2 q = vec2(position.x + 0.5 - uAnchor.x, position.y + 0.5 - (1.0 - uAnchor.y)) * uSize * uScale;
  float c = cos(uRoll), s = sin(uRoll);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec3 wp = center + right * q.x + up * q.y;
  vWorldPos = wp;
  vNormal = normalize(mix(tilt, up0, 0.35));
  vec2 luv = vec2(position.x + 0.5, 0.5 - position.y);
  if (uFlip > 0.5) luv.x = 1.0 - luv.x;
  vUv = mix(uRect.xy, uRect.zw, luv);
  vec4 worldPosition = vec4(wp, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = (viewMatrix * vec4(vNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  worldPosition.xyz += uSunDir * 0.35;
  ${SHADOW_VERT}
}
`;

const FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
${SEE_GLSL}
uniform sampler2D tAtlas;
uniform vec3 uTint;
uniform float uFlash;
uniform float uFade;
uniform float uLit;
uniform float uTexel;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec4 tx = texture2D(tAtlas, vUv);
  if (tx.a < 0.5) discard;
  if (vWorldPos.y < uClipY) discard;
  if (uFade > 0.0 && bayer4(gl_FragCoord.xy) < uFade) discard;
  float seeR = seeThrough(vWorldPos);
  vec3 albedo = tx.rgb * uTint;
  vec3 n = normalize(vNormal);
  float shadow = getShadowMask();
  float ndl = max(dot(n, uSunDir), 0.0) * 0.6 + 0.4;
  vec3 light = hemiAmbient(n) * 1.15 + uSunColor * shadow * ndl * 0.75 + pointLightsAt(vWorldPos, n, 0.7);
  vec3 col = mix(albedo, albedo * light, uLit);
  // warm rim when the sun is behind the sprite
  vec3 v = normalize(uCamPos - vWorldPos);
  float back = pow(max(dot(-v, uSunDir), 0.0), 3.0) * shadow;
  col += albedo * uSunColor * back * 0.35;
  // moonlit rim: at night the silhouette's edge pixels catch a cool light,
  // so dark hair and robes still read against a dark forest
  if (uNight > 0.05) {
    vec2 t = vec2(uTexel, 0.0);
    float e = step(texture2D(tAtlas, vUv + t.xy).a, 0.5) + step(texture2D(tAtlas, vUv - t.xy).a, 0.5)
            + step(texture2D(tAtlas, vUv + t.yx).a, 0.5) + step(texture2D(tAtlas, vUv - t.yx).a, 0.5);
    col += (albedo * 0.7 + 0.06) * vec3(0.42, 0.52, 0.95) * min(e, 1.0) * uNight * uLit;
  }
  col = mix(col, vec3(1.0, 0.98, 0.9) * 1.6, uFlash);
  gl_FragColor = vec4(seeRim(col, seeR), 1.0);
}
`;

const DEPTH_FRAG = /* glsl */ `
uniform sampler2D tAtlas;
varying vec2 vUv;
void main() { if (texture2D(tAtlas, vUv).a < 0.5) discard; gl_FragColor = vec4(1.0); }
`;

const quad = new THREE.PlaneGeometry(1, 1);

export class Billboard {
  constructor(atlas, frameName, { castShadow = true, lit = 1, upright = 0.8 } = {}) {
    this.atlas = atlas;
    this.uniforms = worldUniforms({
      tAtlas: { value: atlas.texture },
      uRect: { value: new THREE.Vector4() },
      uSize: { value: new THREE.Vector2(1, 1) },
      uAnchor: { value: new THREE.Vector2(0.5, 1) },
      uFlip: { value: 0 },
      uRoll: { value: 0 },
      uScale: { value: new THREE.Vector2(1, 1) },
      uUpright: { value: upright },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uFlash: { value: 0 },
      uFade: { value: 0 },
      uLit: { value: lit },
      uTexel: { value: 1 / atlas.size },
    });
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, lights: true, side: THREE.DoubleSide });
    this.depth = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: DEPTH_FRAG, side: THREE.DoubleSide, defines: { DEPTH_PASS: '' } });
    this.mesh = new THREE.Mesh(quad, this.material);
    this.mesh.customDepthMaterial = this.depth;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(2);
    this.frame = null;
    if (frameName) this.setFrame(frameName);
  }
  setFrame(name, flip = false) {
    const f = typeof name === 'string' ? this.atlas.get(name) : name;
    if (!f) return false;
    if (f !== this.frame) {
      this.frame = f;
      const [u0, v0, u1, v1] = this.atlas.uv(f);
      this.uniforms.uRect.value.set(u0, v0, u1, v1);
      this.uniforms.uSize.value.set(f.w / PPM, f.h / PPM);
      this.uniforms.uAnchor.value.set(f.ax / f.w, f.ay / f.h);
    }
    this.uniforms.uFlip.value = flip ? 1 : 0;
    return true;
  }
  set roll(v) { this.uniforms.uRoll.value = v; }
  get roll() { return this.uniforms.uRoll.value; }
  setScale(x, y) { this.uniforms.uScale.value.set(x, y); }
  set flash(v) { this.uniforms.uFlash.value = v; }
  set fade(v) { this.uniforms.uFade.value = v; }
  get object() { return this.mesh; }
}

// Pick a view from the angle between the character's facing and the camera
export function pickView(facingYaw, pos, camPos) {
  const toCam = Math.atan2(camPos.x - pos.x, camPos.z - pos.z);
  let rel = toCam - facingYaw;
  rel = Math.atan2(Math.sin(rel), Math.cos(rel));
  const a = Math.abs(rel);
  if (a < Math.PI * 0.27) return { view: 'front', flip: false, rel };
  if (a > Math.PI * 0.73) return { view: 'back', flip: false, rel };
  // side: sprite faces right by default; flip if the character faces screen-left
  return { view: 'side', flip: rel > 0, rel };
}

// ---------------------------------------------------------------- instanced billboards
// Many sprites from one atlas in one draw call (wildlife, flocks). Fill it each
// frame: batch.begin(); batch.push(frame, x, y, z, opts) ...; batch.end().
// Texture alpha: >= 0.8 lit pixel, 0.3..0.8 glowing pixel, below discarded.
const BATCH_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
attribute vec4 iPos;   // anchor xyz, roll
attribute vec4 iRect;  // atlas uv rect
attribute vec4 iSize;  // world w, h, anchor x, anchor y (0..1, y from top)
attribute vec4 iMisc;  // flip, upright, emissive, fade
attribute vec4 iTint;  // rgb tint, flash
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vTint;
varying vec2 vMisc;
void main() {
  vec3 center = iPos.xyz;
  vec3 fwd;
  if (projectionMatrix[3][3] == 1.0) fwd = normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]));
  else fwd = normalize(cameraPosition - center);
  vec3 up0 = vec3(0.0, 1.0, 0.0);
  vec3 f2 = normalize(vec3(fwd.x, 0.0, fwd.z) + vec3(0.0, 0.0, 1e-5));
  vec3 right = normalize(cross(up0, f2));
  vec3 tilt = normalize(mix(fwd, f2, iMisc.y));
  vec3 up = normalize(cross(tilt, right));
  vec2 q = vec2(position.x + 0.5 - iSize.z, position.y + 0.5 - (1.0 - iSize.w)) * iSize.xy;
  float c = cos(iPos.w), s = sin(iPos.w);
  q = vec2(q.x * c - q.y * s, q.x * s + q.y * c);
  vec3 wp = center + right * q.x + up * q.y;
  vWorldPos = wp;
  vNormal = normalize(mix(tilt, up0, 0.35));
  vec2 luv = vec2(position.x + 0.5, 0.5 - position.y);
  if (iMisc.x > 0.5) luv.x = 1.0 - luv.x;
  vUv = mix(iRect.xy, iRect.zw, luv);
  vTint = iTint;
  vMisc = iMisc.zw;
  vec4 worldPosition = vec4(wp, 1.0);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = (viewMatrix * vec4(vNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  #if defined(FLAT_DEPTH) && !defined(DEPTH_PASS)
  // the whole card takes the depth of a point just in front of its anchor (props stand on their
  // spot like a cut-out: they never dig into the slope under them or the wall behind them)
  vec4 cc = projectionMatrix * viewMatrix * vec4(center + normalize(cameraPosition - center) * min(0.45, 0.3 * iSize.x), 1.0);
  if (cc.w > 0.2) gl_Position.z = clamp(cc.z / cc.w, -1.0, 1.0) * gl_Position.w;
  #endif
  worldPosition.xyz += uSunDir * 0.35;
  ${SHADOW_VERT}
}
`;

const BATCH_FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
${NOISE_GLSL}
${SEE_GLSL}
uniform sampler2D tAtlas;
uniform float uTexel;
uniform float uMoonRim;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec4 vTint;
varying vec2 vMisc;
void main() {
  vec4 tx = texture2D(tAtlas, vUv);
  if (tx.a < 0.3) discard;
  if (vWorldPos.y < uClipY) discard;
  if (vMisc.y > 0.0 && bayer4(gl_FragCoord.xy) < vMisc.y) discard;
  float seeR = seeThrough(vWorldPos);
  vec3 albedo = tx.rgb * vTint.rgb;
  float shadow = getShadowMask();
  // the sprites carry their own banded shading, so the scene light is kept flatter than on voxels
  #ifdef STEADY_LIGHT
  // ...and the same from every side (no brightening and darkening as the camera goes round):
  // as if each card half faced the sky and half the sun
  vec2 sh = normalize(uSunDir.xz + vec2(1e-4, 0.0));
  vec3 n = normalize(vec3(sh.x * 0.8, 0.6, sh.y * 0.8));
  float ndl = 0.74;
  #else
  vec3 n = normalize(vNormal);
  float ndl = max(dot(n, uSunDir), 0.0) * 0.5 + 0.5;
  #endif
  vec3 light = hemiAmbient(n) * 1.0 + uSunColor * shadow * ndl * 0.62 + pointLightsAt(vWorldPos, n, 0.7);
  vec3 col = albedo * light;
  vec3 v = normalize(uCamPos - vWorldPos);
  float back = pow(max(dot(-v, uSunDir), 0.0), 3.0) * shadow;
  col += albedo * uSunColor * back * 0.3;
  if (uNight > 0.05) {
    vec2 t = vec2(uTexel, 0.0);
    float e = step(texture2D(tAtlas, vUv + t.xy).a, 0.3) + step(texture2D(tAtlas, vUv - t.xy).a, 0.3)
            + step(texture2D(tAtlas, vUv + t.yx).a, 0.3) + step(texture2D(tAtlas, vUv - t.yx).a, 0.3);
    col += (albedo * 0.7 + 0.06) * vec3(0.42, 0.52, 0.95) * min(e, 1.0) * uNight * uMoonRim;
  }
  // glowing pixels (eyes, wisps, firefly tails) and whole-sprite glow
  float glow = max(step(tx.a, 0.8), vMisc.x);
  col = mix(col, albedo * (1.25 + uNight * 0.9), glow);
  col = mix(col, vec3(1.0, 0.98, 0.9) * 1.6, vTint.a);
  gl_FragColor = vec4(seeRim(col, seeR), 1.0);
}
`;

const BATCH_DEPTH_FRAG = /* glsl */ `
uniform sampler2D tAtlas;
varying vec2 vUv;
varying vec2 vMisc;
void main() { if (texture2D(tAtlas, vUv).a < 0.3) discard; gl_FragColor = vec4(1.0); }
`;

// opts: flatDepth (cards drawn at their anchor's depth), steadyLight (lit alike from every side),
// moonRim (strength of the cool silhouette rim at night)
export class SpriteBatch {
  constructor(atlas, max = 256, { castShadow = true, upright = 0.85, flatDepth = false, steadyLight = false, moonRim = 1 } = {}) {
    this.atlas = atlas;
    this.max = max;
    this.upright = upright;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    g.setAttribute('uv', base.attributes.uv);
    this.arrays = {};
    for (const k of ['iPos', 'iRect', 'iSize', 'iMisc', 'iTint']) {
      const a = new Float32Array(max * 4);
      this.arrays[k] = a;
      g.setAttribute(k, new THREE.InstancedBufferAttribute(a, 4).setUsage(THREE.DynamicDrawUsage));
    }
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = g;
    this.uniforms = worldUniforms({ tAtlas: { value: atlas.texture }, uTexel: { value: 1 / atlas.size }, uMoonRim: { value: moonRim } });
    const defines = {};
    if (flatDepth) defines.FLAT_DEPTH = '';
    if (steadyLight) defines.STEADY_LIGHT = '';
    this.material = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: BATCH_VERT, fragmentShader: BATCH_FRAG, lights: true, side: THREE.DoubleSide, defines });
    this.depth = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: BATCH_VERT, fragmentShader: BATCH_DEPTH_FRAG, side: THREE.DoubleSide, defines: { DEPTH_PASS: '' } });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.customDepthMaterial = this.depth;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(2);
    this.n = 0;
  }
  begin() {
    this.n = 0;
  }
  // f: atlas frame (f.ppm = its pixels per metre); o: { flip, roll, sx, sy, upright, emissive, fade, tint:[r,g,b], flash }
  push(f, x, y, z, o = {}) {
    if (!f || this.n >= this.max) return false;
    const i = this.n++ * 4;
    const A = this.arrays;
    const s = this.atlas.size;
    const ppm = f.ppm || PPM;
    A.iPos[i] = x; A.iPos[i + 1] = y; A.iPos[i + 2] = z; A.iPos[i + 3] = o.roll || 0;
    A.iRect[i] = f.x / s; A.iRect[i + 1] = f.y / s; A.iRect[i + 2] = (f.x + f.w) / s; A.iRect[i + 3] = (f.y + f.h) / s;
    const fl = !!o.flip;
    A.iSize[i] = (f.w / ppm) * (o.sx ?? 1); A.iSize[i + 1] = (f.h / ppm) * (o.sy ?? o.sx ?? 1);
    A.iSize[i + 2] = fl ? 1 - f.ax / f.w : f.ax / f.w; A.iSize[i + 3] = f.ay / f.h;
    A.iMisc[i] = fl ? 1 : 0; A.iMisc[i + 1] = o.upright ?? this.upright; A.iMisc[i + 2] = o.emissive || 0; A.iMisc[i + 3] = o.fade || 0;
    const t = o.tint;
    A.iTint[i] = t ? t[0] : 1; A.iTint[i + 1] = t ? t[1] : 1; A.iTint[i + 2] = t ? t[2] : 1; A.iTint[i + 3] = o.flash || 0;
    return true;
  }
  end() {
    const n = this.n;
    this.geo.instanceCount = n;
    for (const k in this.arrays) {
      const attr = this.geo.attributes[k];
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * 4);
      attr.needsUpdate = true;
    }
  }
}
