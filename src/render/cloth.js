// Little verlet cloth pieces that hang off voxel characters: scarf tails,
// capes, apron strings, flags. Flat pixel-textured strips with real physics
// (gravity, wind, body collisions), so the 2D bits flutter in the 3D world.
import * as THREE from 'three';
import { createFlatMaterial } from './voxelMaterial.js';
import { G } from './shaderlib.js';

const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _m = new THREE.Matrix4();
const STEP = 1 / 60;

// cols x rows grid of particles; row 0 is pinned to `pins` (local points on an anchor object)
export class Cloth {
  constructor({ cols = 2, rows = 8, width = 0.12, length = 0.6, map, innerMap = null, pins = null, anchor = null, drag = 0.03, gravity = 7.5, wind = 1, stiff = 1, colliders = [], ground = null, castShadow = true, dir = [0, -1, 0] }) {
    this.cols = cols;
    this.rows = rows;
    this.n = cols * rows;
    this.anchor = anchor;
    this.drag = drag;
    this.gravity = gravity;
    this.windK = wind;
    this.stiff = stiff;
    this.colliders = colliders; // [{ obj: Object3D, offset: Vector3, r }]
    this.ground = ground; // fn(x, z) -> y
    this.p = new Float32Array(this.n * 3);
    this.q = new Float32Array(this.n * 3);
    this.dx = width / Math.max(1, cols - 1);
    this.dy = length / (rows - 1);
    // local pin points on the anchor (row 0); default: a line along local x
    this.pins = pins || Array.from({ length: cols }, (_, i) => new THREE.Vector3((i / Math.max(1, cols - 1) - 0.5) * width, 0, 0));
    this.dir = new THREE.Vector3(...dir).normalize(); // local rest direction of the strip
    // geometry
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(this.n * 3);
    const uv = new Float32Array(this.n * 2);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      uv[i * 2] = cols > 1 ? c / (cols - 1) : 0.5;
      uv[i * 2 + 1] = 1 - r / (rows - 1);
    }
    const idx = [];
    for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geometry = g;
    this.group = new THREE.Group();
    const front = createFlatMaterial(map, { side: innerMap ? THREE.FrontSide : THREE.DoubleSide, backShade: 0.72 });
    this.mesh = new THREE.Mesh(g, front);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = castShadow;
    this.mesh.receiveShadow = true;
    this.mesh.customDepthMaterial = front.userData.depth;
    this.group.add(this.mesh);
    this.materials = [front];
    if (innerMap) {
      const back = createFlatMaterial(innerMap, { side: THREE.BackSide, backShade: 0.85 });
      const m2 = new THREE.Mesh(g, back);
      m2.frustumCulled = false;
      m2.receiveShadow = true;
      this.group.add(m2);
      this.materials.push(back);
    }
    this.acc = 0;
    this.t = Math.random() * 10;
    this.inited = false;
    this.last = new THREE.Vector3();
    this.visible = true;
  }

  pinWorld(c, out) {
    return out.copy(this.pins[c]).applyMatrix4(this.anchor.matrixWorld);
  }

  reset() {
    this.anchor.updateWorldMatrix(true, false);
    const d = _b.copy(this.dir).transformDirection(this.anchor.matrixWorld);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      this.pinWorld(c, _a).addScaledVector(d, r * this.dy);
      const i = (r * this.cols + c) * 3;
      this.p[i] = this.q[i] = _a.x;
      this.p[i + 1] = this.q[i + 1] = _a.y;
      this.p[i + 2] = this.q[i + 2] = _a.z;
    }
    this.inited = true;
  }

  update(dt) {
    if (!this.anchor) return;
    this.anchor.updateWorldMatrix(true, false);
    _v.setFromMatrixPosition(this.anchor.matrixWorld);
    if (!this.inited || _v.distanceToSquared(this.last) > 4) this.reset();
    this.last.copy(_v);
    this.acc = Math.min(this.acc + dt, STEP * 4);
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.t += STEP;
      this.step(STEP);
    }
    this.writeGeometry();
  }

  step(h) {
    const { p, q, cols, rows } = this;
    const wx = G.uWind.value.x, wz = G.uWind.value.y;
    const ws = G.uWindStrength.value * this.windK;
    const gust = 0.6 + 0.4 * Math.sin(this.t * 2.1) * Math.sin(this.t * 0.73 + 1.2);
    const keep = 1 - this.drag;
    for (let i = cols; i < this.n; i++) {
      const k = i * 3;
      const flutter = Math.sin(this.t * 9 + i * 1.7) * 0.6;
      const ax = (wx * gust + flutter * 0.3 * wz) * ws * 2.2;
      const az = (wz * gust - flutter * 0.3 * wx) * ws * 2.2;
      for (let a = 0; a < 3; a++) {
        const cur = p[k + a];
        const acc = a === 1 ? -this.gravity : a === 0 ? ax : az;
        p[k + a] = cur + (cur - q[k + a]) * keep + acc * h * h;
        q[k + a] = cur;
      }
    }
    // pin row 0
    for (let c = 0; c < cols; c++) {
      this.pinWorld(c, _a);
      const k = c * 3;
      q[k] = p[k]; q[k + 1] = p[k + 1]; q[k + 2] = p[k + 2];
      p[k] = _a.x; p[k + 1] = _a.y; p[k + 2] = _a.z;
    }
    // the second row leans along the rest direction so strips leave the knot nicely
    const d = _b.copy(this.dir).transformDirection(this.anchor.matrixWorld);
    for (let it = 0; it < 4; it++) {
      for (let c = 0; c < cols; c++) {
        const k0 = c * 3, k1 = (cols + c) * 3;
        const tx = p[k0] + d.x * this.dy, ty = p[k0 + 1] + d.y * this.dy, tz = p[k0 + 2] + d.z * this.dy;
        const s = 0.5 * this.stiff;
        p[k1] += (tx - p[k1]) * s; p[k1 + 1] += (ty - p[k1 + 1]) * s; p[k1 + 2] += (tz - p[k1 + 2]) * s;
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        if (c < cols - 1) this.link(i, i + 1, this.dx, r === 0 ? 0 : 0.5);
        if (r < rows - 1) this.link(i, i + cols, this.dy, r === 0 ? 1 : 0.5);
        if (r < rows - 1 && c < cols - 1) this.link(i, i + cols + 1, Math.hypot(this.dx, this.dy), r === 0 ? 1 : 0.5, 0.3);
      }
      this.collide();
    }
  }

  // w = share of the correction applied to b (0..1); a gets the rest
  link(a, b, rest, wb = 0.5, k = 1) {
    const p = this.p;
    const ia = a * 3, ib = b * 3;
    const dx = p[ib] - p[ia], dy = p[ib + 1] - p[ia + 1], dz = p[ib + 2] - p[ia + 2];
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
    const diff = ((L - rest) / L) * k;
    const wa = a < this.cols ? 0 : 1 - wb;
    const wbb = b < this.cols ? 0 : wb;
    const norm = wa + wbb || 1;
    p[ia] += dx * diff * (wa / norm); p[ia + 1] += dy * diff * (wa / norm); p[ia + 2] += dz * diff * (wa / norm);
    p[ib] -= dx * diff * (wbb / norm); p[ib + 1] -= dy * diff * (wbb / norm); p[ib + 2] -= dz * diff * (wbb / norm);
  }

  collide() {
    const p = this.p;
    for (const col of this.colliders) {
      col.obj.updateWorldMatrix(true, false);
      _a.copy(col.offset).applyMatrix4(col.obj.matrixWorld);
      const r2 = col.r * col.r;
      for (let i = this.cols; i < this.n; i++) {
        const k = i * 3;
        const dx = p[k] - _a.x, dy = p[k + 1] - _a.y, dz = p[k + 2] - _a.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < r2 && d2 > 1e-8) {
          const s = col.r / Math.sqrt(d2);
          p[k] = _a.x + dx * s; p[k + 1] = _a.y + dy * s; p[k + 2] = _a.z + dz * s;
        }
      }
    }
    if (this.ground) {
      for (let i = this.cols; i < this.n; i++) {
        const k = i * 3;
        const gy = this.ground(p[k], p[k + 2]) + 0.02;
        if (p[k + 1] < gy) {
          p[k + 1] = gy;
          this.q[k] = p[k] - (p[k] - this.q[k]) * 0.5; // friction
          this.q[k + 2] = p[k + 2] - (p[k + 2] - this.q[k + 2]) * 0.5;
        }
      }
    }
  }

  writeGeometry() {
    // geometry lives in world space; the group sits at the origin of the scene
    const pos = this.geometry.attributes.position.array;
    pos.set(this.p);
    // single-column strips get width from the anchor's side axis
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.computeVertexNormals();
  }

  setVisible(v) {
    this.group.visible = v;
    if (v && !this.visible) this.inited = false;
    this.visible = v;
  }

  dispose() {
    this.geometry.dispose();
    for (const m of this.materials) { m.dispose(); m.userData.depth.dispose(); }
  }
}

// ---------------------------------------------------------------- pixel textures
function dataTex(w, h, fn) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = fn(x, y); // y = 0 at the top (pinned end)
    const i = ((h - 1 - y) * w + x) * 4;
    if (!c) continue;
    d[i] = (c >> 16) & 255; d[i + 1] = (c >> 8) & 255; d[i + 2] = c & 255; d[i + 3] = c >>> 24 ? (c >>> 24) : 255;
  }
  const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
const shade = (c, k) => {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return (f(r) << 16) | (f(g) << 8) | f(b);
};

// knitted scarf tail: stripes, knit texture, tassel fringe at the end
export function scarfTexture(color, stripe = null, { w = 8, h = 40 } = {}) {
  return dataTex(w, h, (x, y) => {
    if (y >= h - 4) return x % 2 === 0 ? shade(stripe ?? color, -0.1) : 0; // fringe
    let c = color;
    if (stripe != null && stripe !== color && (Math.floor(y / 5) % 2 === 1)) c = stripe;
    if (x === 0 || x === w - 1) c = shade(c, -0.18);
    if ((x + (y >> 1)) % 2 === 0) c = shade(c, -0.07); // knit rows
    if (y % 5 === 0) c = shade(c, 0.08);
    return c;
  });
}

// cape: soft folds + darker hem
export function capeTexture(color, trim = null, { w = 24, h = 32, star = false } = {}) {
  return dataTex(w, h, (x, y) => {
    let c = color;
    const fold = Math.sin(x * 0.9) * 0.08;
    c = shade(c, fold);
    if (y >= h - 2) c = trim ?? shade(color, -0.25);
    if (y === 0) c = shade(color, -0.2);
    if (star && Math.abs(x - w / 2) + Math.abs(y - h * 0.45) < 3) c = 0xf2c443;
    // ragged hem
    if (y === h - 1 && (x * 7) % 5 === 0) return 0;
    return c;
  });
}

// cloth flag / ribbon / bunting piece
export function stripeTexture(colors, { w = 4, h = 16 } = {}) {
  return dataTex(w, h, (x, y) => colors[Math.floor(y / 4) % colors.length]);
}
