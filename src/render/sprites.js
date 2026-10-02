// Sprite atlas + 2D pixel-art billboards living in the 3D world (HD-2D style).
import * as THREE from 'three';
import { Pix } from '../art/pixel.js';
import { pixTexture } from './textures.js';
import { worldUniforms, LIGHT_PARS_VERT, SHADOW_VERT, LIGHT_PARS_FRAG, NOISE_GLSL } from './shaderlib.js';

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
  finalize() {
    this.texture = pixTexture(this.pix, { repeat: false, mips: false });
    this.texture.name = 'spriteAtlas';
    return this.texture;
  }
  uv(f) {
    const s = this.size;
    return [f.x / s, f.y / s, (f.x + f.w) / s, (f.y + f.h) / s];
  }
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
uniform sampler2D tAtlas;
uniform vec3 uTint;
uniform float uFlash;
uniform float uFade;
uniform float uLit;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec4 tx = texture2D(tAtlas, vUv);
  if (tx.a < 0.5) discard;
  if (vWorldPos.y < uClipY) discard;
  if (uFade > 0.0 && bayer4(gl_FragCoord.xy) < uFade) discard;
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
  col = mix(col, vec3(1.0, 0.98, 0.9) * 1.6, uFlash);
  gl_FragColor = vec4(col, 1.0);
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
