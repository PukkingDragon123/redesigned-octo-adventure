// Voxel wildlife: deer, moose, crows, robins, chickadees, geese, beavers,
// squirrels and salmon, each a few voxel parts with simple procedural motion
// (legs trot, wings flap, tails slap). Drop-in for the old animal billboards:
// exposes mesh / setFrame / setScale / roll like a Billboard.
import * as THREE from 'three';
import { Vox, tone } from '../voxel/vox.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

const CACHE = new Map();
const geo = (key, fn) => {
  let g = CACHE.get(key);
  if (!g) {
    const r = fn();
    g = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.04, seed: key.length });
    CACHE.set(key, g);
  }
  return g;
};

// ---------------------------------------------------------------- builders (all face +z)
function quadBody({ len, h, w, col, belly, hump = 0, tail = 0xf6f0e6 }) {
  const v = new Vox(w + 4, h + 4 + hump, len + 4);
  const cx = (w + 4) / 2 - 0.5, cy = h / 2 + 1, cz = (len + 4) / 2 - 0.5;
  v.ellipsoid(cx, cy, cz, w / 2, h / 2, len / 2, (x, y, z) => (y < cy - h * 0.25 && belly ? belly : (x + y + z) % 5 === 0 ? tone(col, -0.08) : col));
  if (hump) v.ellipsoid(cx, cy + h * 0.35, cz + len * 0.22, w / 2 - 0.5, hump, len * 0.22, tone(col, -0.05));
  v.ellipsoid(cx, cy + 0.5, 1.2, 1.2, 1.4, 1.2, tail); // tail tuft at the back
  return { vox: v, origin: [cx + 0.5, 0, cz + 0.5] };
}
function quadHead({ len, w, col, nose = 0x1e1418, ears = true, antlers = null, muzzle = null, dewlap = false }) {
  const v = new Vox(w + 16, 18, len + 4);
  const cx = (w + 16) / 2 - 0.5;
  v.ellipsoid(cx, 4, 3, w / 2, 3, 3, col); // skull at the neck end
  v.fill(cx - w / 2 + 1, 2, 3, cx + w / 2 - 1, 5, len + 1, (x, y, z) => (z > len - 1 && y < 4 ? (muzzle ?? tone(col, 0.1)) : col)); // long face
  v.fill(cx - 1, 3, len + 1, cx, 4, len + 2, nose);
  v.set(cx - w / 2, 5, 4, 0x1e1418); v.set(cx + w / 2 - 1, 5, 4, 0x1e1418); // eyes
  if (ears) { v.fill(cx - w / 2 - 1, 6, 2, cx - w / 2, 8, 3, tone(col, -0.1)); v.fill(cx + w / 2 - 1, 6, 2, cx + w / 2, 8, 3, tone(col, -0.1)); }
  if (dewlap) v.fill(cx - 1, -0, 4, cx, 1, 6, tone(col, -0.15));
  if (antlers === 'deer') {
    for (const s of [-1, 1]) {
      const bx = cx + s * 2;
      v.line(bx, 7, 3, bx + s * 3, 12, 2, 0xe8d8b8);
      v.line(bx + s * 3, 12, 2, bx + s * 4, 15, 4, 0xe8d8b8);
      v.line(bx + s * 2, 10, 2.5, bx + s * 1, 13, 4, 0xe8d8b8);
    }
  }
  if (antlers === 'moose') {
    for (const s of [-1, 1]) {
      const bx = cx + s * 3;
      v.line(bx, 7, 3, bx + s * 4, 9, 3, 0xd8c8a0, 0.6);
      v.fill(Math.min(bx + s * 4, bx + s * 8), 9, 1, Math.max(bx + s * 4, bx + s * 8), 10, 5, 0xd8c8a0);
      for (let k = 0; k < 4; k++) v.set(bx + s * (5 + k), 11, 1 + k, 0xe8d8b0);
    }
  }
  return { vox: v, origin: [cx + 0.5, 2, 3] };
}
function leg(len, col, hoof = 0x2a1a14) {
  const v = new Vox(2, len, 2);
  v.fill(0, 0, 0, 1, len - 1, 1, (x, y) => (y < 1 ? hoof : y > len - 3 ? tone(col, 0.05) : col));
  return { vox: v, origin: [1, len, 1] };
}
function birdBody({ col, belly, head, beak = 0x2a2a2a, cap = null, cheek = null, len = 8, neck = 0 }) {
  const v = new Vox(7, 9 + neck, len + 5);
  const cx = 3;
  v.ellipsoid(cx, 3, len / 2 + 1, 2.6, 2.4, len / 2, (x, y, z) => (y < 2.5 && z > 2 ? belly : col));
  v.fill(cx, 2, 0, cx, 3, 2, tone(col, -0.15)); // tail
  if (neck) v.fill(cx - 1, 4, len, cx, 4 + neck, len, head);
  const hy = 5 + neck, hz = len + (neck ? 1 : 0);
  v.ellipsoid(cx, hy, hz, 1.8, 1.7, 1.7, head);
  if (cap) v.ellipsoid(cx, hy + 0.8, hz - 0.2, 1.8, 1.1, 1.8, cap);
  if (cheek) { v.set(cx - 2, hy, hz, cheek); v.set(cx + 2, hy, hz, cheek); }
  v.set(cx - 1, hy + 0.5, hz + 1, 0x101010); v.set(cx + 1, hy + 0.5, hz + 1, 0x101010);
  v.fill(cx, hy - 0.5, hz + 2, cx, hy - 0.5, hz + 3, beak);
  return { vox: v, origin: [cx + 0.5, 0, len / 2 + 1] };
}
function wing(len, col, tip) {
  const v = new Vox(len, 1, 5);
  v.fill(0, 0, 0, len - 1, 0, 4, (x, y, z) => (x > len - 3 ? tip : (x + z) % 3 === 0 ? tone(col, -0.1) : col));
  v.clear(len - 1, 0, 0, len - 1, 0, 1);
  return { vox: v, origin: [0, 0.5, 2.5] };
}

const KINDS = {
  deer: { size: 0.05, parts: () => quad({ col: 0xa8703e, belly: 0xf0e0c8, len: 22, h: 10, w: 8, legLen: 13, neck: 0xa8703e, head: { len: 8, w: 5, col: 0xa8703e, muzzle: 0xe8d8c0 } }) },
  buck: { size: 0.055, parts: () => quad({ col: 0x9a6034, belly: 0xf0e0c8, len: 22, h: 10, w: 8, legLen: 13, head: { len: 8, w: 5, col: 0x9a6034, muzzle: 0xe8d8c0, antlers: 'deer' } }) },
  moose: { size: 0.08, parts: () => quad({ col: 0x4a3020, belly: 0x5a3a28, len: 24, h: 13, w: 10, legLen: 16, hump: 3, leg: 0x6a5040, head: { len: 10, w: 6, col: 0x4a3020, muzzle: 0x5a3a2a, antlers: 'moose', dewlap: true } }) },
  crow: { size: 0.035, bird: true, parts: () => bird({ col: 0x2a2630, belly: 0x2a2630, head: 0x24202a, beak: 0x3a3640, wing: 0x2a2630, tip: 0x1e1a22 }) },
  robin: { size: 0.03, bird: true, parts: () => bird({ col: 0x6a5a50, belly: 0xe8702a, head: 0x3a3230, beak: 0xe8b030, wing: 0x6a5a50, tip: 0x4a3e38 }) },
  chickadee: { size: 0.028, bird: true, parts: () => bird({ col: 0x8a8a90, belly: 0xe8d8c0, head: 0xf0ece4, cap: 0x1e1a1e, cheek: 0xf8f6f0, beak: 0x2a2a2a, wing: 0x7a7a82, tip: 0x5a5a62 }) },
  goose: { size: 0.05, bird: true, parts: () => bird({ col: 0x8a7258, belly: 0xd8ccb8, head: 0x1e1a1e, cheek: 0xf6f2ea, beak: 0x2a2a2a, wing: 0x7a6248, tip: 0x3a3028, len: 12, neck: 4 }) },
  beaver: { size: 0.04, parts: () => beaver() },
  squirrel: { size: 0.03, parts: () => squirrel() },
  salmon: { size: 0.035, parts: () => salmon() },
};

function quad(o) {
  const body = quadBody(o);
  const head = quadHead(o.head);
  const lg = leg(o.legLen, o.leg ?? o.col);
  return { body, head, leg: lg, o };
}
function bird(o) {
  return { body: birdBody(o), wing: wing(o.len ? 9 : 6, o.wing, o.tip), o };
}
function beaver() {
  const v = new Vox(10, 8, 16);
  v.ellipsoid(4.5, 3.5, 8, 4, 3.4, 6, (x, y, z) => ((x + z) % 4 === 0 ? 0x5a3a24 : 0x6a4428));
  v.ellipsoid(4.5, 4, 14, 2.8, 2.6, 2.2, 0x6a4428);
  v.fill(4, 3, 16, 5, 3, 16, 0xf6f0d0); // buck teeth
  v.set(3, 5, 15, 0x101010); v.set(6, 5, 15, 0x101010);
  const t = new Vox(6, 1, 8);
  t.fill(0, 0, 0, 5, 0, 7, (x, z) => ((x + z) % 2 ? 0x2a2a30 : 0x3a3a40));
  return { body: { vox: v, origin: [5, 0, 8] }, tail: { vox: t, origin: [3, 0.5, 8] } };
}
function squirrel() {
  const v = new Vox(6, 8, 10);
  v.ellipsoid(2.5, 3, 4.5, 2.2, 2.6, 3, 0xb85a2a);
  v.ellipsoid(2.5, 5.5, 7, 1.8, 1.8, 1.8, 0xb85a2a);
  v.set(1, 7, 7, 0xb85a2a); v.set(4, 7, 7, 0xb85a2a);
  v.set(1, 6, 8, 0x101010); v.set(4, 6, 8, 0x101010);
  v.fill(2, 1, 5, 3, 3, 6, 0xf0e0c8);
  const t = new Vox(5, 10, 5);
  t.ellipsoid(2, 5, 2, 2, 4.6, 2, (x, y, z) => (y > 7 ? 0xd8783a : 0xc8642e));
  return { body: { vox: v, origin: [3, 0, 5] }, tail: { vox: t, origin: [2.5, 0, 4] } };
}
function salmon() {
  const v = new Vox(4, 6, 18);
  v.ellipsoid(1.5, 3, 9, 1.6, 2.6, 8, (x, y, z) => (y > 3.5 ? 0x5a6a6a : y > 2 ? 0xd8483a : 0xe8d8c8));
  v.set(0, 3.5, 15, 0x101010); v.set(3, 3.5, 15, 0x101010);
  v.fill(1, 1, 0, 2, 5, 1, 0x8a4a4a);
  return { body: { vox: v, origin: [2, 3, 9] } };
}

// ---------------------------------------------------------------- the animated critter
export function hasVoxelAnimal(kind) {
  return !!KINDS[kind];
}

export class VoxCritter {
  constructor(kind, { shadow = true } = {}) {
    this.kind = kind;
    const K = KINDS[kind];
    const P = K.parts();
    const s = K.size;
    const mat = sharedVoxelMaterial();
    const mk = (key, r, parent) => {
      const g = geo(`${kind}:${key}`, () => ({ ...r, size: s }));
      const m = voxMesh(g, mat, { cast: shadow, receive: true });
      parent.add(m);
      return m;
    };
    this.mesh = new THREE.Group();
    this.inner = new THREE.Group();
    this.mesh.add(this.inner);
    this.parts = {};
    if (P.leg) {
      const o = P.o;
      const legH = o.legLen * s;
      this.body = new THREE.Group();
      this.body.position.y = legH;
      this.inner.add(this.body);
      mk('body', P.body, this.body);
      this.neck = new THREE.Group();
      this.neck.position.set(0, (o.h * 0.75 + 1) * s, (o.len / 2) * s);
      this.body.add(this.neck);
      mk('head', P.head, this.neck);
      this.neck.rotation.x = -0.5;
      this.legs = [];
      for (const [x, z] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        const hip = new THREE.Group();
        hip.position.set(x * (o.w / 2 - 1.2) * s, legH + 1.5 * s, z * (o.len / 2 - 3) * s);
        this.inner.add(hip);
        mk('leg', P.leg, hip);
        this.legs.push(hip);
      }
    } else if (P.wing) {
      this.body = new THREE.Group();
      this.inner.add(this.body);
      mk('body', P.body, this.body);
      this.wings = [];
      for (const side of [-1, 1]) {
        const w = new THREE.Group();
        w.position.set(side * 2 * s, 3.6 * s, 0);
        this.body.add(w);
        const m = mk('wing', P.wing, w);
        if (side < 0) m.scale.x = -1;
        w.userData.side = side;
        this.wings.push(w);
      }
    } else {
      this.body = new THREE.Group();
      this.inner.add(this.body);
      mk('body', P.body, this.body);
      if (P.tail) {
        this.tail = new THREE.Group();
        this.tail.position.set(0, kind === 'squirrel' ? 2 * s : 1.5 * s, kind === 'squirrel' ? 1 * s : 1.5 * s);
        this.body.add(this.tail);
        mk('tail', P.tail, this.tail);
      }
    }
    this.t = Math.random() * 10;
    this.anim = 'idle';
    this.fps = 2;
    this.roll = 0;
    this.scaleK = 1;
  }

  // Billboard-compatible
  setFrame(name) {
    // "kind:anim:view:frame" -> just the anim
    const a = String(name || '').split(':')[1];
    if (a) this.anim = a;
  }
  setScale(s) {
    this.scaleK = s;
  }

  // called each frame by the critter with its facing
  pose(dt, yaw, anim, fps) {
    this.t += dt;
    this.anim = anim || this.anim;
    const t = this.t * (fps || 4);
    this.inner.rotation.set(0, yaw, this.roll);
    this.inner.scale.setScalar(this.scaleK > 1.2 ? 1.25 : 1);
    const a = this.anim;
    if (this.legs) {
      const moving = a === 'walk' || a === 'run';
      const amp = a === 'run' ? 0.75 : 0.4;
      this.legs.forEach((l, i) => (l.rotation.x = moving ? Math.sin(t * 1.6 + (i === 0 || i === 3 ? 0 : Math.PI)) * amp : 0));
      this.body.position.y = this.legs[0].position.y - 1.5 * KINDS[this.kind].size + (moving ? Math.abs(Math.sin(t * 1.6)) * 0.03 : Math.sin(this.t * 1.5) * 0.004);
      const graze = a === 'graze';
      this.neck.rotation.x = graze ? 0.9 + Math.sin(this.t * 2) * 0.08 : -0.45 + Math.sin(this.t * 0.7) * 0.06;
      this.neck.rotation.y = graze ? 0 : Math.sin(this.t * 0.4) * 0.3;
      this.body.rotation.x = a === 'run' ? Math.sin(t * 1.6) * 0.06 : 0;
    }
    if (this.wings) {
      const flying = a === 'fly';
      for (const w of this.wings) {
        const sd = w.userData.side;
        w.rotation.z = flying ? sd * (Math.sin(t * 2.2) * 1.0 + 0.2) : sd * -0.15;
        w.rotation.y = flying ? 0 : sd * 0.3;
      }
      this.body.rotation.x = flying ? -0.1 : a === 'idle' ? Math.sin(this.t * 3) * 0.05 : 0;
      this.body.position.y = !flying && a === 'idle' ? Math.max(0, Math.sin(this.t * 2.3)) * 0.01 : 0;
    }
    if (this.tail) {
      if (this.kind === 'beaver') this.tail.rotation.x = a === 'swim' ? Math.sin(t * 2) * 0.4 : Math.sin(this.t * 1.3) * 0.1;
      else this.tail.rotation.x = -0.4 + Math.sin(this.t * 3) * 0.15 + (a === 'run' ? Math.sin(t * 3) * 0.3 : 0);
    }
    if (this.kind === 'salmon') this.body.rotation.y = Math.sin(this.t * 14) * 0.3;
  }
}
