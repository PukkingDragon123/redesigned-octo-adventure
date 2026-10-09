// Ground decals: tyre tracks, skid streaks, footprints and hoof prints pressed into soft
// ground. A ring buffer of small quads, one instanced draw, laid on the terrain's own
// triangles (exact height and slope, a hair above, polygon offset) and multiplied into the
// colour already there: dents darken it, the spoil pushed up round them (sand, mud, snow)
// lightens it. The pixel art is painted at 64 px a metre, twice the ground's, so a skeleton
// foot still shows its bony toes. Each decal keeps its birth time and life and the shader
// crumbles it away pixel by pixel as it ages, so nothing is touched after it's laid: adding
// one writes a single instance and uploads just that slot.
import * as THREE from 'three';
import { G, NOISE_GLSL } from './shaderlib.js';
import { H_RES } from '../world/terrain.js';
import { WORLD_HALF } from '../world/layout.js';

const PPM = 64; // atlas pixels per metre
// sprites, as ASCII: '#' a deep dent, '+' a shallow one, 'o' raised spoil ('.' nothing).
// Every dent pixel also gets a spoil rim around it where the sprite leaves room.
// Prints point up the page (the walker's forward), row 0 in front. The foot is drawn with its big
// toe on the left of the page, which laid down unmirrored makes a left foot (mirrored: a right one).
const SPRITES = {
  // a knobbly tyre: chevron lugs, one period (the quad tiles it along the track)
  tread: [
    'o#+..+#o',
    'o+#++#+o',
    'o.+##+.o',
    'o..##..o',
    'o#+..+#o',
    'o+#++#+o',
    'o.+##+.o',
    'o..##..o',
  ],
  // a skid: the tyre dragged, the lugs smeared into one dark streak
  skid: [
    'o+####+o',
    'o######o',
    'o+####+o',
    'o######o',
  ],
  // Hank's right foot: five bony toes in separate joints, the knuckles of the ball, the
  // metatarsals in lines, no arch (nothing there but air) and the round heel bone
  bones: [
    '.##.#.#....',
    '.##.#.#.#..',
    '...........',
    '.##.#.#.#..',
    '.##.#.#.#.#',
    '...........',
    '.+#+#+#+#+.',
    '.#########.',
    '..+#####+..',
    '..#.#.#.#..',
    '..#.#.#.#..',
    '..+#+#+#+..',
    '...........',
    '...........',
    '...+###+...',
    '..+#####+..',
    '..#######..',
    '..+#####+..',
    '...+###+...',
  ],
  // a villager's boot: a sole with tread bars and a heel
  boot: [
    '..++++..',
    '.+####+.',
    '+######+',
    '+#+#+#+#',
    '+######+',
    '+#+#+#+#',
    '+######+',
    '.+####+.',
    '..+##+..',
    '..+##+..',
    '.+####+.',
    '+#+##+#+',
    '+######+',
    '+#+##+#+',
    '.+####+.',
    '..++++..',
  ],
  // a cloven hoof (deer, moose): two teardrops, pointed in front
  hoof: [
    '.#...#.',
    '##...##',
    '##...##',
    '###.###',
    '###.###',
    '###.###',
    '.##.##.',
    '.+#.#+.',
    '..+.+..',
  ],
  // a paw (fox, dog, cat, raccoon): four toes and a pad
  paw: [
    '..#..#..',
    '..#..#..',
    '#......#',
    '#.+##+.#',
    '..####..',
    '.######.',
    '.######.',
    '..####..',
  ],
};
export const DECAL = { tread: 0, skid: 1, bones: 2, boot: 3, hoof: 4, paw: 5 };
const ORDER = ['tread', 'skid', 'bones', 'boot', 'hoof', 'paw'];

// pack the sprites side by side (each padded by a pixel for its spoil rim) into one strip
function paintAtlas() {
  const rects = [];
  let x = 0, H = 0;
  for (const k of ORDER) {
    const s = SPRITES[k];
    const w = s[0].length + (k === 'tread' || k === 'skid' ? 0 : 2), h = s.length + (k === 'tread' || k === 'skid' ? 0 : 2);
    rects.push([x, 0, w, h]);
    x += w + 1;
    H = Math.max(H, h);
  }
  const W = x, data = new Uint8Array(W * H * 4);
  ORDER.forEach((k, i) => {
    const s = SPRITES[k], [rx, , rw, rh] = rects[i];
    const pad = rw > s[0].length ? 1 : 0;
    const at = (cx, cy) => (cy * W + rx + cx) * 4;
    for (let y = 0; y < s.length; y++) for (let c = 0; c < s[y].length; c++) {
      const ch = s[y][c], o = at(c + pad, rh - 1 - (y + pad)); // (row 0 is the front: the top of the quad)
      if (ch === '#') data[o] = 255;
      else if (ch === '+') data[o] = 130;
      else if (ch === 'o') data[o + 1] = 200;
    }
    // spoil rim: empty pixels touching a dent
    if (pad) for (let y = 0; y < rh; y++) for (let c = 0; c < rw; c++) {
      const o = at(c, y);
      if (data[o] || data[o + 1]) continue;
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const cx = c + dx, cy = y + dy;
        if (cx >= 0 && cy >= 0 && cx < rw && cy < rh && data[at(cx, cy)] > 200) n++;
      }
      if (n) data[o + 1] = n > 1 ? 200 : 120;
    }
  });
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { tex, rects, W, H };
}

const VERT = /* glsl */ `
attribute vec4 a0; // x, y, z, yaw
attribute vec4 a1; // width (m; negative mirrors), length (m), normal x, normal z
attribute vec4 a2; // birth, life, sprite, strength
uniform float uTime;
uniform vec4 uRects[${ORDER.length}];
varying vec2 vUv;
varying vec4 vRect;
varying float vFade;
varying float vK;
varying float vTile;
varying float vSeed;
void main() {
  vec2 c = position.xy; // -0.5 .. 0.5
  float w = a1.x, l = a1.y;
  vec2 q = vec2(c.x * abs(w), c.y * l);
  float cs = cos(a0.w), sn = sin(a0.w);
  // forward (+v) is (sin yaw, cos yaw) on the ground, right is (cos yaw, -sin yaw)
  vec3 off = vec3(q.x * cs + q.y * sn, 0.0, -q.x * sn + q.y * cs);
  vec3 n = vec3(a1.z, sqrt(max(0.05, 1.0 - a1.z * a1.z - a1.w * a1.w)), a1.w);
  off.y = -(n.x * off.x + n.z * off.z) / n.y; // along the slope of the triangle it lies on
  vec3 wp = a0.xyz + off + n * 0.014;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  int s = int(a2.z + 0.5);
  vRect = uRects[s];
  vUv = vec2((w < 0.0 ? -c.x : c.x) + 0.5, c.y + 0.5);
  // tracks tile their sprite along their length (one period = the sprite's own height)
  vTile = s < 2 ? l * ${PPM.toFixed(1)} / vRect.w : 1.0;
  float age = uTime - a2.x;
  vFade = 1.0 - smoothstep(a2.y * 0.45, a2.y, age);
  vK = a2.w;
  vSeed = fract(a2.x * 7.31) * 97.0;
  if (vFade <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // long gone: no pixels at all
}
`;

const FRAG = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D tAtlas;
uniform vec2 uAtlas;
varying vec2 vUv;
varying vec4 vRect;
varying float vFade;
varying float vK;
varying float vTile;
varying float vSeed;
void main() {
  vec2 p = vec2(vUv.x, vTile > 1.0 ? fract(vUv.y * vTile) : vUv.y);
  vec2 px = floor(vRect.xy + p * vRect.zw);
  vec4 t = texture2D(tAtlas, (px + 0.5) / uAtlas);
  // crumbling away: each pixel of the print gives out at its own age
  float h = hash12(px + floor(vUv.y * vTile) * 17.0 + vSeed);
  if (t.r + t.g < 0.01 || h > vFade) discard;
  // multiplied into the ground: dents darker, spoil lighter (the scene buffer is float)
  float f = 1.0 - t.r * 0.62 * vK + t.g * 0.34 * vK;
  gl_FragColor = vec4(vec3(f), 1.0);
}
`;

const _n = { x: 0, y: 1, z: 0 };

export class Decals {
  constructor(game, max = 1600) {
    this.game = game;
    this.max = max;
    this.next = 0;
    this.count = 0;
    const A = paintAtlas();
    this.rects = A.rects;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    this.a0 = new Float32Array(max * 4);
    this.a1 = new Float32Array(max * 4);
    this.a2 = new Float32Array(max * 4);
    // (unused slots are born long ago and already gone)
    for (let i = 0; i < max; i++) { this.a2[i * 4] = -1e6; this.a2[i * 4 + 1] = 1; }
    for (const k of ['a0', 'a1', 'a2']) g.setAttribute(k, new THREE.InstancedBufferAttribute(this[k], 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: G.uTime,
        tAtlas: { value: A.tex },
        uAtlas: { value: new THREE.Vector2(A.W, A.H) },
        uRects: { value: A.rects.map(([x, y, w, h]) => new THREE.Vector4(x, y, w, h)) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.ZeroFactor,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.layers.set(1); // (not in the water's reflection)
    this.mesh.renderOrder = 1;
    this.mesh.name = 'decals';
    this.T = game.world?.terrain || null;
    this.pending = [];
  }

  // height and normal of the rendered terrain triangle under (x, z) (the mesh alternates its diagonals)
  ground(x, z, n = _n) {
    const T = this.T;
    if (!T) { n.x = 0; n.y = 1; n.z = 0; return 0; }
    const N = T.n, H = T.h;
    const fx = Math.min(N - 1.001, Math.max(0, (x + WORLD_HALF) / H_RES)), fz = Math.min(N - 1.001, Math.max(0, (z + WORLD_HALF) / H_RES));
    const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    const a = H[j * N + i], b = H[j * N + i + 1], c = H[(j + 1) * N + i], d = H[(j + 1) * N + i + 1];
    let gx, gz, h;
    if ((i + j) & 1) {
      if (tx + tz <= 1) { gx = b - a; gz = c - a; h = a + gx * tx + gz * tz; }
      else { gx = d - c; gz = d - b; h = d - gx * (1 - tx) - gz * (1 - tz); }
    } else if (tx >= tz) { gx = b - a; gz = d - b; h = a + gx * tx + gz * tz; }
    else { gx = d - c; gz = c - a; h = a + gz * tz + gx * tx; }
    gx /= H_RES; gz /= H_RES;
    const l = Math.hypot(gx, 1, gz);
    n.x = -gx / l; n.y = 1 / l; n.z = -gz / l;
    return h;
  }

  // lay a decal: sprite (DECAL.*), centre x, z (y: the ground, or a deck height), facing yaw,
  // width (m, negative to mirror) and length (m; prints use their sprite's own size when omitted),
  // strength (how deep: 0..1.5), life (s)
  add(sprite, x, z, yaw, { width, length, strength = 1, life = 45, y = null } = {}) {
    const r = this.rects[sprite];
    const w = width ?? (r[2] / PPM), l = length ?? (r[3] / PPM);
    const n = _n;
    const gy = this.ground(x, z, n);
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    this.count = Math.min(this.max, this.count + 1);
    const o = i * 4;
    this.a0[o] = x; this.a0[o + 1] = y ?? gy; this.a0[o + 2] = z; this.a0[o + 3] = yaw;
    this.a1[o] = w; this.a1[o + 1] = l; this.a1[o + 2] = y === null ? n.x : 0; this.a1[o + 3] = y === null ? n.z : 0;
    this.a2[o] = G.uTime.value; this.a2[o + 1] = life; this.a2[o + 2] = sprite; this.a2[o + 3] = strength;
    this.pending.push(i);
    return i;
  }

  // upload what was laid this frame (just those slots)
  update() {
    this.geo.instanceCount = this.count;
    if (!this.pending.length) return;
    let lo = this.max, hi = -1;
    for (const i of this.pending) { lo = Math.min(lo, i); hi = Math.max(hi, i); }
    this.pending.length = 0;
    for (const k of ['a0', 'a1', 'a2']) {
      const attr = this.geo.attributes[k];
      attr.clearUpdateRanges();
      // (a wrap-around in one frame uploads the span between: still only a frame's worth)
      attr.addUpdateRange(lo * 4, (hi - lo + 1) * 4);
      attr.needsUpdate = true;
    }
  }
}
