// Pixel particles: falling leaves, dust, smoke, steam, sparks, rain, snow, fizz,
// hearts, coins, bones... CPU-simulated, drawn as dithered point sprites.
import * as THREE from 'three';
import { Pix, RNG, shade } from '../art/pixel.js';
import { pixTexture } from './textures.js';
import { G, NOISE_GLSL } from './shaderlib.js';
import { LEAF_COLORS } from '../art/groundtex.js';

const CELL = 16, N = 8; // 8x8 atlas of 16px sprites
export const P = {
  leaf0: 0, leaf1: 1, leaf2: 2, leaf3: 3, needle: 4, maple: 5,
  dust: 8, puff: 9, smoke: 10, steam: 11, spark: 12, star: 13, glow: 14, mote: 15,
  rain: 16, snow: 17, drop: 18, bubble: 19, foam: 20, dirt: 21, chip: 22, ring: 23,
  heart: 24, coin: 25, note: 26, bone: 27, skull: 28, magic: 29, confetti: 30, frost: 31,
  flame: 32, ember: 33, feather: 34, splash: 35, zap: 36, cocoa: 37, cross: 38, cloud: 39,
};

function paintAtlas() {
  const p = new Pix(CELL * N, CELL * N);
  const rng = new RNG(9);
  const at = (i) => [(i % N) * CELL, Math.floor(i / N) * CELL];
  const c = (i) => {
    const [x, y] = at(i);
    return [x + 8, y + 8];
  };
  const W = 0xffffff;
  // leaves are white-ish value sprites tinted per particle
  const leafShape = (i, pts) => {
    const [x, y] = at(i);
    p.poly(pts.map(([a, b]) => [x + a, y + b]), 0xf0f0f0);
    p.line(x + pts[0][0], y + pts[0][1], x + 8, y + 9, 0xa8a8a8);
    p.outline(0x8a8a8a, { region: [x, y, CELL, CELL] });
  };
  leafShape(P.leaf0, [[8, 2], [12, 6], [11, 11], [8, 13], [5, 11], [4, 6]]);
  leafShape(P.leaf1, [[8, 3], [13, 8], [8, 13], [3, 8]]);
  leafShape(P.leaf2, [[4, 4], [12, 5], [12, 10], [6, 12]]);
  leafShape(P.leaf3, [[8, 2], [10, 6], [14, 6], [11, 9], [12, 13], [8, 11], [4, 13], [5, 9], [2, 6], [6, 6]]);
  {
    const [x, y] = at(P.needle);
    p.line(x + 4, y + 12, x + 12, y + 4, 0xd0d0d0);
  }
  leafShape(P.maple, [[8, 1], [9, 5], [12, 3], [11, 7], [15, 7], [12, 10], [13, 13], [9, 11], [8, 15], [7, 11], [3, 13], [4, 10], [1, 7], [5, 7], [4, 3], [7, 5]]);
  // soft round puffs (alpha encodes density for dithering)
  const puff = (i, r, col, lumpy) => {
    const [x, y] = at(i);
    for (let j = 0; j < CELL; j++) for (let k = 0; k < CELL; k++) {
      const d = Math.hypot(k + 0.5 - 8, j + 0.5 - 8) / r + (lumpy ? (rng.next() - 0.5) * 0.25 : 0);
      if (d > 1) continue;
      const a = Math.round((1 - d * d) * 255);
      const v = j < 7 ? shade(col, 0.15) : col;
      p.put(x + k, y + j, v, Math.max(8, a));
    }
  };
  puff(P.dust, 5, 0xc8a878, true);
  puff(P.puff, 7, 0xf0f0f0, true);
  puff(P.smoke, 7.5, 0xd8d8dc, true);
  puff(P.steam, 4, 0xffffff, false);
  puff(P.glow, 6, 0xffffff, false);
  puff(P.cloud, 7.8, 0xffffff, true);
  puff(P.foam, 4.5, 0xffffff, true);
  {
    const [x, y] = c(P.spark);
    p.put(x, y, W);
    p.put(x - 1, y, 0xffe0a0, 200);
    p.put(x + 1, y, 0xffe0a0, 200);
    p.put(x, y - 1, 0xffe0a0, 200);
    p.put(x, y + 1, 0xffe0a0, 200);
  }
  {
    const [x, y] = c(P.star);
    for (let k = -3; k <= 3; k++) { p.put(x + k, y, W, 255 - Math.abs(k) * 50); p.put(x, y + k, W, 255 - Math.abs(k) * 50); }
    p.put(x - 1, y - 1, W, 150); p.put(x + 1, y + 1, W, 150); p.put(x - 1, y + 1, W, 150); p.put(x + 1, y - 1, W, 150);
  }
  {
    const [x, y] = c(P.mote);
    p.put(x, y, W);
    p.put(x + 1, y, W, 120);
    p.put(x, y + 1, W, 120);
  }
  {
    const [x, y] = at(P.rain);
    for (let j = 1; j < 15; j++) p.put(x + 8, y + j, 0xd8e8ff, 120 + j * 8);
  }
  {
    const [x, y] = c(P.snow);
    p.put(x, y, W);
    for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.put(x + a, y + b, W, 210);
    for (const [a, b] of [[-2, -2], [2, 2], [-2, 2], [2, -2]]) p.put(x + a, y + b, W, 120);
  }
  {
    const [x, y] = c(P.drop);
    p.rect(x - 1, y - 1, 2, 3, 0xc8e0ff);
    p.put(x - 1, y - 1, W);
  }
  {
    const [x, y] = c(P.bubble);
    p.ring(x, y, 3.5, 0xf0e0c8);
    p.put(x - 1, y - 2, W);
  }
  {
    const [x, y] = c(P.dirt);
    p.rect(x - 2, y - 1, 4, 3, 0x6a4a2e);
    p.put(x - 2, y - 1, 0x8a6a46);
  }
  {
    const [x, y] = c(P.chip);
    p.rect(x - 2, y, 5, 2, 0xd8b080);
    p.put(x + 2, y, 0xa87a48);
  }
  {
    const [x, y] = c(P.ring);
    p.ring(x, y, 7, W);
  }
  {
    const [x, y] = c(P.heart);
    p.rect(x - 4, y - 3, 3, 3, 0xe83a5a);
    p.rect(x + 1, y - 3, 3, 3, 0xe83a5a);
    p.rect(x - 4, y - 1, 8, 2, 0xe83a5a);
    p.rect(x - 3, y + 1, 6, 1, 0xe83a5a);
    p.rect(x - 2, y + 2, 4, 1, 0xe83a5a);
    p.rect(x - 1, y + 3, 2, 1, 0xe83a5a);
    p.put(x - 3, y - 2, 0xffa0b0);
    p.outline(0x6a1020, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.coin);
    p.circle(x, y, 4.5, 0xe8a820);
    p.circle(x, y, 3.5, 0xf8d050);
    p.vline(x, y - 2, y + 2, 0xb07818);
    p.put(x - 2, y - 2, 0xfff4b0);
    p.outline(0x6a4410, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.note);
    p.vline(x + 1, y - 5, y + 2, 0x2a1a2e);
    p.rect(x - 2, y + 1, 3, 3, 0x2a1a2e);
    p.hline(x + 1, x + 4, y - 5, 0x2a1a2e);
    p.put(x + 4, y - 4, 0x2a1a2e);
  }
  {
    const [x, y] = c(P.bone);
    p.rect(x - 4, y - 1, 8, 2, 0xf4eee0);
    p.rect(x - 6, y - 2, 2, 2, 0xf4eee0);
    p.rect(x - 6, y, 2, 2, 0xf4eee0);
    p.rect(x + 4, y - 2, 2, 2, 0xf4eee0);
    p.rect(x + 4, y, 2, 2, 0xf4eee0);
    p.outline(0x6a6050, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.skull);
    p.rect(x - 3, y - 3, 6, 5, 0xf4eee0);
    p.rect(x - 2, y + 2, 4, 2, 0xf4eee0);
    p.rect(x - 2, y - 1, 2, 2, 0x2a1a1e);
    p.rect(x + 1, y - 1, 2, 2, 0x2a1a1e);
    p.outline(0x6a6050, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.magic);
    for (let k = -4; k <= 4; k++) { p.put(x + k, y, 0xb0ffb0, 255 - Math.abs(k) * 40); p.put(x, y + k, 0xb0ffb0, 255 - Math.abs(k) * 40); }
    p.put(x, y, W);
  }
  {
    const [x, y] = c(P.confetti);
    p.rect(x - 2, y - 1, 4, 3, W);
  }
  {
    const [x, y] = c(P.frost);
    for (let k = -3; k <= 3; k++) { p.put(x + k, y, 0xd8f0ff); p.put(x, y + k, 0xd8f0ff); p.put(x + k, y + k, 0xa8d8f8, 180); p.put(x + k, y - k, 0xa8d8f8, 180); }
  }
  {
    const [x, y] = at(P.flame);
    p.ellipse(x + 8, y + 10, 4, 5.5, 0xff7a20);
    p.ellipse(x + 8, y + 7, 2.6, 4, 0xffb030);
    p.ellipse(x + 8, y + 10, 1.6, 2.6, 0xfff0a0);
    p.put(x + 8, y + 2, 0xffb030);
  }
  {
    const [x, y] = c(P.ember);
    p.rect(x - 1, y - 1, 2, 2, 0xffa040);
    p.put(x - 1, y - 1, 0xffe0a0);
  }
  {
    const [x, y] = c(P.feather);
    p.line(x - 4, y + 4, x + 4, y - 4, 0xd8d0c8);
    p.line(x - 3, y + 4, x + 4, y - 3, 0xf0e8e0);
    p.line(x - 4, y + 3, x + 3, y - 4, 0xf0e8e0);
  }
  {
    const [x, y] = c(P.splash);
    for (const [a, b] of [[-4, -3], [-2, -5], [0, -6], [2, -5], [4, -3], [-3, 0], [3, 0]]) p.rect(x + a, y + b, 2, 2, 0xe0f0ff);
  }
  {
    const [x, y] = c(P.zap);
    p.line(x - 2, y - 6, x + 1, y - 1, 0xfff080);
    p.line(x + 1, y - 1, x - 1, y + 1, 0xfff080);
    p.line(x - 1, y + 1, x + 2, y + 6, 0xfff080);
  }
  {
    const [x, y] = c(P.cocoa);
    p.rect(x - 3, y - 2, 6, 6, 0xf4ecdc);
    p.hline(x - 3, x + 2, y - 2, 0x6a3a1e);
    p.rect(x + 3, y - 1, 2, 3, 0xf4ecdc);
    p.outline(0x6a5a4a, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.cross);
    p.rect(x - 1, y - 4, 2, 8, W);
    p.rect(x - 4, y - 1, 8, 2, W);
  }
  return p;
}

const VERT = /* glsl */ `
attribute vec4 aData;   // size(m), sprite, alpha, rotation/flip phase
attribute vec4 aColor;  // rgb tint, emissive
uniform float uScale;
varying vec4 vColor;
varying float vSprite;
varying float vAlpha;
varying float vPhase;
varying float vLight;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float px = aData.x * uScale / max(0.1, -mv.z);
  gl_PointSize = clamp(floor(px + 0.5), 1.0, 96.0);
  vColor = aColor;
  vSprite = aData.y;
  vAlpha = aData.z;
  vPhase = aData.w;
  vLight = 1.0;
}
`;

const FRAG = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D tAtlas;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
varying vec4 vColor;
varying float vSprite;
varying float vAlpha;
varying float vPhase;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  // tumble: squash horizontally with the flip phase, rotate in 90 degree steps
  float flip = cos(vPhase);
  if (abs(flip) < 0.999) {
    pc.x /= max(0.18, abs(flip));
    if (abs(pc.x) > 0.5) discard;
  }
  float q = mod(floor(vPhase * 0.5), 4.0);
  if (q == 1.0) pc = vec2(-pc.y, pc.x);
  else if (q == 2.0) pc = -pc;
  else if (q == 3.0) pc = vec2(pc.y, -pc.x);
  vec2 cell = vec2(mod(vSprite, 8.0), floor(vSprite / 8.0));
  vec2 uv = (cell + pc + 0.5) / 8.0;
  vec4 tx = texture2D(tAtlas, uv);
  float a = tx.a * vAlpha;
  if (a < bayer4(gl_FragCoord.xy) * 0.98 + 0.01) discard;
  vec3 col = tx.rgb * vColor.rgb;
  // lit particles take the scene light, emissive ones glow
  vec3 lit = col * (uSkyAmb * 1.2 + uSunColor * 0.55);
  col = mix(lit, col * (1.0 + vColor.a * 2.0), clamp(vColor.a, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Particles {
  constructor(max = 4000) {
    this.max = max;
    this.count = 0;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ alive: false });
    this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
    const g = new THREE.BufferGeometry();
    this.aPos = new Float32Array(max * 3);
    this.aData = new Float32Array(max * 4);
    this.aColor = new Float32Array(max * 4);
    g.setAttribute('position', new THREE.BufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aData', new THREE.BufferAttribute(this.aData, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.aColor, 4).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = g;
    this.uniforms = {
      tAtlas: { value: pixTexture(paintAtlas(), { repeat: false, mips: false }) },
      uScale: { value: 300 },
      uSunColor: G.uSunColor,
      uSkyAmb: G.uSkyAmb,
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.layers.set(1);
    this.points.renderOrder = 10;
    this.rng = new RNG(1234);
    this.ground = null; // (x, z) => height
    this.wind = new THREE.Vector2();
  }

  // spawn: {x,y,z, vx,vy,vz, life, size, sprite, color:[r,g,b] or hex, emissive, gravity, drag, spin, flutter, grow, fade, ground}
  spawn(o) {
    if (!this.free.length) return null;
    const i = this.free.pop();
    const q = this.p[i];
    q.alive = true;
    q.x = o.x; q.y = o.y; q.z = o.z;
    q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0;
    q.life = 0;
    q.max = o.life ?? 2;
    q.size = o.size ?? 0.2;
    q.size1 = o.size1 ?? q.size;
    q.sprite = o.sprite ?? P.dust;
    const col = o.color ?? 0xffffff;
    if (Array.isArray(col)) { q.r = col[0]; q.g = col[1]; q.b = col[2]; }
    else { const c = new THREE.Color(col); q.r = c.r; q.g = c.g; q.b = c.b; }
    q.em = o.emissive ?? 0;
    q.grav = o.gravity ?? 0;
    q.drag = o.drag ?? 0.5;
    q.spin = o.spin ?? 0;
    q.phase = o.phase ?? this.rng.range(0, 6.28);
    q.flutter = o.flutter ?? 0;
    q.windK = o.wind ?? 0;
    q.alpha0 = o.alpha ?? 1;
    q.fadeIn = o.fadeIn ?? 0.05;
    q.groundHit = o.ground ?? false;
    q.rest = o.rest ?? 0;
    q.resting = false;
    q.blink = o.blink ?? 0;
    q.seed = this.rng.next();
    return q;
  }

  burst(n, fn) {
    for (let k = 0; k < n; k++) this.spawn(fn(k, this.rng));
  }

  update(dt) {
    let n = 0;
    const wx = this.wind.x, wz = this.wind.y;
    for (let i = 0; i < this.max; i++) {
      const q = this.p[i];
      if (!q.alive) continue;
      q.life += dt;
      if (q.life >= q.max) {
        q.alive = false;
        this.free.push(i);
        continue;
      }
      if (!q.resting) {
        q.vy -= q.grav * dt;
        const d = Math.exp(-q.drag * dt);
        q.vx = q.vx * d + wx * q.windK * dt;
        q.vz = q.vz * d + wz * q.windK * dt;
        q.vy *= q.grav > 0 ? 1 : d;
        let fx = 0, fz = 0;
        if (q.flutter) {
          const t = q.life * 2.3 + q.seed * 10;
          fx = Math.sin(t) * q.flutter;
          fz = Math.cos(t * 0.7) * q.flutter;
        }
        q.x += (q.vx + fx) * dt;
        q.y += q.vy * dt;
        q.z += (q.vz + fz) * dt;
        q.phase += q.spin * dt;
        if (q.groundHit && this.ground) {
          const h = this.ground(q.x, q.z) + 0.03;
          if (q.y < h) {
            q.y = h;
            if (q.rest > 0) {
              q.resting = true;
              q.max = Math.min(q.max, q.life + q.rest);
              q.phase = Math.round(q.phase / Math.PI) * Math.PI + 0.001;
            } else {
              q.vy = -q.vy * 0.35;
              q.vx *= 0.6;
              q.vz *= 0.6;
            }
          }
        }
      }
      const t = q.life / q.max;
      let a = q.alpha0;
      if (q.life < q.fadeIn) a *= q.life / q.fadeIn;
      if (t > 0.7) a *= 1 - (t - 0.7) / 0.3;
      if (q.blink) a *= 0.5 + 0.5 * Math.sin(q.life * q.blink + q.seed * 20);
      const size = q.size + (q.size1 - q.size) * t;
      this.aPos[n * 3] = q.x;
      this.aPos[n * 3 + 1] = q.y;
      this.aPos[n * 3 + 2] = q.z;
      this.aData[n * 4] = size;
      this.aData[n * 4 + 1] = q.sprite;
      this.aData[n * 4 + 2] = a;
      this.aData[n * 4 + 3] = q.phase;
      this.aColor[n * 4] = q.r;
      this.aColor[n * 4 + 1] = q.g;
      this.aColor[n * 4 + 2] = q.b;
      this.aColor[n * 4 + 3] = q.em;
      n++;
    }
    this.count = n;
    this.geo.setDrawRange(0, n);
    for (const k of ['position', 'aData', 'aColor']) {
      const attr = this.geo.attributes[k];
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  // camera-dependent point scale: pixels per metre at distance 1
  setViewport(heightPx, fovDeg) {
    this.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
}

export function leafColor(rng) {
  return rng.pick(LEAF_COLORS);
}
