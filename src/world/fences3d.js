// The fences as real voxel geometry (models in voxel/models/fences.js), built with the world so
// they are there on the first frame, and drawn instanced: one mesh per panel kind and detail.
//
// Every fence piece runs post to post. Pieces whose ends meet (within half a metre) share the
// joint and its single post, so runs have no gaps, no doubled posts and no z-fighting where they
// meet. Each joint stands on the ground under it and the panel between two joints is sheared to
// match: the posts stay plumb, the rails and pickets follow the slope, nothing floats or sinks.
//
// Pieces come from the 2D clutter placement (deco2d.js items of kind picket / rail / rail2: those
// can be knocked over, see game/deco2d.js) and from fixed runs (places.js: vw.fenceRun()).
// A knocked-over piece tips about its foot along the line; the joint posts stay up while any of
// their panels stands, else they go down with the panel.
import * as THREE from 'three';
import { meshVox } from '../voxel/mesh.js';
import { sharedVoxelMaterial } from '../render/voxelMaterial.js';
import * as FM from '../voxel/models/fences.js';

const NEAR = 42, FAR = 210; // detailed panels within NEAR, coarse ones out to FAR
const SNAP = 0.5;
const KINDS = {
  picket: { family: 'picket', panel: (far) => FM.picketPanel({ far }), post: (far) => FM.picketPost({ far }) },
  rail: { family: 'rail', panel: (far) => FM.railPanel({ far, rails: 2 }), post: (far) => FM.railPost({ far }) },
  rail2: { family: 'rail', panel: (far) => FM.railPanel({ far, rails: 3, seed: 4 }), post: (far) => FM.railPost({ far }) },
};

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4(), _a = new THREE.Vector3(), _f = new THREE.Vector3();

export class Fences3D {
  // items: the 2D clutter (fence kinds are picked out); runs: [{ kind, ax, az, bx, bz }] fixed fences
  constructor(world, { items = [], runs = [] } = {}) {
    this.world = world;
    const PH = world.physics;
    this.pieces = [];
    for (const it of items) {
      if (!KINDS[it.kind]) continue;
      const ax = Math.cos(it.yaw), az = -Math.sin(it.yaw);
      this.pieces.push({ kind: it.kind, it, A: [it.x - ax * it.len, it.z - az * it.len], B: [it.x + ax * it.len, it.z + az * it.len] });
      it.fence3d = true;
    }
    for (const r of runs) {
      if (!KINDS[r.kind]) continue;
      const L = Math.hypot(r.bx - r.ax, r.bz - r.az), step = r.kind === 'picket' ? 2 : 3;
      const n = Math.max(1, Math.round(L / step));
      for (let k = 0; k < n; k++) {
        const t0 = k / n, t1 = (k + 1) / n;
        const kind = r.kind === 'rail' && k % 3 === 1 ? 'rail2' : r.kind;
        this.pieces.push({ kind, it: null, A: [r.ax + (r.bx - r.ax) * t0, r.az + (r.bz - r.az) * t0], B: [r.ax + (r.bx - r.ax) * t1, r.az + (r.bz - r.az) * t1] });
      }
    }
    // ---- joints: piece ends of the same family that (nearly) meet share one post
    this.joints = [];
    const grid = new Map();
    const key = (x, z) => `${Math.floor(x)},${Math.floor(z)}`;
    const joint = (p, fam, piece) => {
      let best = null, bd = SNAP;
      const cx = Math.floor(p[0]), cz = Math.floor(p[1]);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const J of grid.get(`${cx + i},${cz + j}`) || []) {
        if (J.family !== fam || J.pieces.includes(piece)) continue;
        const d = Math.hypot(J.x - p[0], J.z - p[1]);
        if (d < bd) { bd = d; best = J; }
      }
      if (best) {
        const n = best.pieces.length;
        best.x = (best.x * n + p[0]) / (n + 1); best.z = (best.z * n + p[1]) / (n + 1);
        best.pieces.push(piece);
        return best;
      }
      const J = { family: fam, x: p[0], z: p[1], y: 0, pieces: [piece], yaw: 0, m: new Float32Array(16) };
      this.joints.push(J);
      const k = key(p[0], p[1]);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(J);
      return J;
    };
    for (const P of this.pieces) {
      const fam = KINDS[P.kind].family;
      P.jA = joint(P.A, fam, P);
      P.jB = joint(P.B, fam, P);
    }
    // ---- ground under every joint, then each piece's matrix between its two joints
    const ground = (x, z, y) => PH.groundAt(x, z, y).h;
    for (const J of this.joints) {
      const P0 = J.pieces[0];
      J.y = ground(J.x, J.z, (P0.it?.y ?? PH.terrain.heightAt(J.x, J.z)) + 0.6);
      J.yaw = Math.atan2(-(P0.jB.z - P0.jA.z), P0.jB.x - P0.jA.x);
      _m.makeRotationY(J.yaw).setPosition(J.x, J.y - 0.06, J.z);
      _m.toArray(J.m);
    }
    for (const P of this.pieces) {
      const A = P.jA, B = P.jB;
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz) || 1;
      const L0 = P.kind === 'picket' ? 2 : 3;
      // the basis: x along the piece (with the slope), y plumb, z out of its face
      const nx = -dz / len, nz = dx / len;
      P.basis = new THREE.Matrix4().set(
        dx / L0, 0, nx, 0,
        (B.y - A.y) / L0, 1, 0, 0,
        dz / L0, 0, nz, 0,
        0, 0, 0, 1,
      );
      P.cx = (A.x + B.x) / 2; P.cz = (A.z + B.z) / 2; P.cy = (A.y + B.y) / 2 - 0.03;
      P.half = len / 2;
      P.m = new Float32Array(16);
      _m.copy(P.basis).setPosition(P.cx, P.cy, P.cz);
      _m.toArray(P.m);
      // the knockable piece now sits exactly where it is drawn
      const it = P.it;
      if (it) {
        it.x = P.cx; it.z = P.cz; it.y = P.cy + 0.03;
        it.yaw = Math.atan2(-dz, dx); it.len = len / 2;
      }
    }
    // ---- meshes: a panel and a post mesh per kind, near and far
    const mat = sharedVoxelMaterial();
    const count = { picket: 0, rail: 0, rail2: 0 };
    for (const P of this.pieces) count[P.kind]++;
    const posts = { picket: 0, rail: 0 };
    for (const J of this.joints) posts[J.family]++;
    this.meshes = [];
    const mk = (r, max, name, cast) => {
      const geo = meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0, ao: false });
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, max));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.castShadow = cast;
      m.receiveShadow = true;
      m.customDepthMaterial = mat.userData.depth;
      m.frustumCulled = false; // (culled per piece below)
      m.name = `fences:${name}`;
      m.matrixAutoUpdate = false;
      m.visible = false;
      this.meshes.push(m);
      return m;
    };
    this.panel = {};
    for (const k of Object.keys(KINDS)) if (count[k]) this.panel[k] = { near: mk(KINDS[k].panel(false), count[k], `${k}`, true), far: mk(KINDS[k].panel(true), count[k], `${k}:far`, false) };
    this.post = {};
    for (const f of ['picket', 'rail']) if (posts[f]) this.post[f] = { near: mk(KINDS[f].post(false), posts[f] + 64, `${f}Post`, true), far: mk(KINDS[f].post(true), posts[f] + 64, `${f}Post:far`, false) };
    this.group = new THREE.Group();
    this.group.name = 'fences';
    for (const m of this.meshes) this.group.add(m);
    this.knockable = this.pieces.filter((P) => P.it);
    this.last = null;
    this.down = 0;
    this.stats = { pieces: this.pieces.length, joints: this.joints.length };
  }

  // per frame: pick the pieces in range (detailed close by), and pose the knocked-over ones
  update(camera) {
    if (!this.pieces.length) return;
    const cp = camera.position;
    const L = this.last;
    // (redrawn when the camera has moved or turned, or a knocked piece is moving, falls or is put back)
    let mv = 0, dn = 0;
    for (const P of this.knockable) { const st = P.it.st; if (st !== 0) { dn++; if (st === 1) mv++; } }
    let dirty = !L || (cp.x - L.x) ** 2 + (cp.z - L.z) ** 2 > 4 || mv > 0 || dn !== this.down;
    camera.getWorldDirection(_f);
    const fl = Math.hypot(_f.x, _f.z) || 1, fx = _f.x / fl, fz = _f.z / fl;
    if (L && !dirty && (fx * L.fx + fz * L.fz) < 0.97) dirty = true;
    if (!dirty) return;
    this.last = { x: cp.x, z: cp.z, fx, fz };
    for (const m of this.meshes) m.count = 0;
    const far2 = FAR * FAR, near2 = NEAR * NEAR;
    const push = (mesh, arr) => { arr ? mesh.instanceMatrix.array.set(arr, mesh.count * 16) : _m.toArray(mesh.instanceMatrix.array, mesh.count * 16); mesh.count++; };
    for (const P of this.pieces) {
      const it = P.it;
      const fell = !!it && it.st !== 0;
      P.up = !fell || it.tip < 0.05;
      const x = fell ? it.x : P.cx, z = fell ? it.z : P.cz;
      const dx = x - cp.x, dz = z - cp.z, d2 = dx * dx + dz * dz;
      P.seen = d2 < far2 && dx * fx + dz * fz > -P.half - 3;
      if (!P.seen || (it && it.st === 3)) continue;
      const mesh = this.panel[P.kind][d2 < near2 ? 'near' : 'far'];
      if (!fell) { push(mesh, P.m); continue; }
      this.pose(P);
      push(mesh, null);
    }
    this.down = dn;
    for (const J of this.joints) {
      const dx = J.x - cp.x, dz = J.z - cp.z, d2 = dx * dx + dz * dz;
      if (d2 > far2 || dx * fx + dz * fz < -3) continue;
      const lod = d2 < near2 ? 'near' : 'far';
      if (J.pieces.some((P) => P.up)) { push(this.post[J.family][lod], J.m); continue; }
      // every panel at this joint is down: the post lies with the first of them
      const P = J.pieces[0];
      if (!P.it || P.it.st === 3) continue;
      this.pose(P);
      _r.makeRotationY(J.yaw).setPosition(J.x - P.cx, J.y - P.cy - 0.06, J.z - P.cz);
      _m.copy(this.tipM).multiply(_r);
      _m.elements[12] += P.it.x; _m.elements[13] += P.it.y + Math.sin(P.it.tip) * 0.07; _m.elements[14] += P.it.z;
      const mesh = this.post[J.family][lod];
      if (mesh.count < mesh.instanceMatrix.count) push(mesh, null);
    }
    for (const m of this.meshes) {
      m.visible = m.count > 0;
      if (m.count) { m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, m.count * 16); m.instanceMatrix.needsUpdate = true; }
    }
  }

  // a knocked piece's matrix (into _m): tipped over about its foot, where the knock left it
  pose(P) {
    const it = P.it;
    const tm = this.tipM || (this.tipM = new THREE.Matrix4());
    if (it.tip > 0.001) tm.makeRotationAxis(_a.set(it.tdz, 0, -it.tdx).normalize(), it.tip);
    else tm.identity();
    _m.copy(tm).multiply(P.basis);
    // (lifted by half its thickness as it goes down, so a fallen panel lies on the grass, not in it)
    _m.elements[12] = it.x; _m.elements[13] = it.y - 0.03 + Math.sin(it.tip) * (P.kind === 'picket' ? 0.045 : 0.08); _m.elements[14] = it.z;
  }
}
