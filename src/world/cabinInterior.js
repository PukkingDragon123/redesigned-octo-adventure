// Nana's cabin, inside. The room is built from voxel models (src/voxel/models/interior.js) and
// sits exactly inside the real cabin building. The building is a solid voxel model whose faces
// all point outwards, so from inside its volume the shell is invisible: the camera sees this
// room, and through its windows and open door the real porch, yard and woods.
//
// Room-local frame (metres): the building's own frame, origin at the floor centre, +z towards
// the front door, +x towards the fireplace gable. wp() / toLocal() convert to and from the world.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, createVoxelMaterial } from '../render/voxelMaterial.js';
import * as IM from '../voxel/models/interior.js';
import { BUILDINGS } from './layout.js';
import { P } from '../render/particles.js';

const R = IM.ROOM;
const Q = Math.PI / 2;
const FIRE_Z = -1.31; // the stone chimney outside sits behind this point

// furniture: model, options, position (room-local), yaw (front +z turned to (sin yaw, cos yaw)),
// y lift, collider (box [x0, z0, x1, z1] or circle { r }) and an optional key for later lookups
const LAYOUT = [
  { m: 'fireplace', x: R.x1, z: FIRE_Z, yaw: -Q, key: 'fireplace', box: [4.3, FIRE_Z - 1.0, R.x1, FIRE_Z + 1.0] },
  { m: 'braidedRug', o: { w: 2.5, d: 1.75 }, x: 3.2, z: FIRE_Z, yaw: Q },
  { m: 'sofa', x: 2.0, z: FIRE_Z, yaw: Q, key: 'sofa', box: [1.55, FIRE_Z - 1.05, 2.45, FIRE_Z + 1.05] },
  { m: 'armchair', x: 3.55, z: 0.95, yaw: 2.55, key: 'armchair', r: 0.45 },
  { m: 'rocker', x: 3.5, z: -3.4, yaw: 0.5, key: 'rocker', r: 0.42 },
  { m: 'knittingBasket', x: 2.75, z: -3.75, yaw: 0.3, r: 0.22 },
  { m: 'floorLamp', x: 4.55, z: 1.8, yaw: 0, key: 'floorLamp', r: 0.2 },
  { m: 'sideTable', x: 2.0, z: 0.12, yaw: 0, key: 'sideTable', r: 0.28 },
  { m: 'tableLamp', x: 2.0, z: 0.12, y: 0.6, yaw: 0, key: 'tableLamp' },
  { m: 'woodBox', x: 4.85, z: FIRE_Z - 1.45, yaw: -Q, box: [4.5, FIRE_Z - 1.8, R.x1, FIRE_Z - 1.1] },
  { m: 'fireTools', x: 4.95, z: FIRE_Z + 1.3, yaw: -Q, r: 0.15 },
  { m: 'photo', o: { kind: 'wedding', w: 0.5, h: 0.6, frame: 'gold' }, x: R.x1 - 0.4, z: FIRE_Z, y: 2.05, yaw: -Q },
  { m: 'bookshelf', x: 1.6, z: R.z0, yaw: 0, key: 'bookshelf', box: [0.9, R.z0, 2.3, R.z0 + 0.4] },
  { m: 'plant', o: { kind: 'snake' }, x: -0.05, z: R.z0 + 0.3, yaw: 0, r: 0.25 },
  { m: 'sideboard', x: -1.5, z: R.z0, yaw: 0, key: 'sideboard', box: [-2.25, R.z0, -0.75, R.z0 + 0.5] },
  { m: 'photo', o: { kind: 'fishing', w: 0.4, h: 0.32, frame: 'wood' }, x: -2.0, z: R.z0, y: 1.3, yaw: 0 },
  { m: 'photo', o: { kind: 'bike', w: 0.36, h: 0.44, frame: 'gold' }, x: -1.45, z: R.z0, y: 1.42, yaw: 0 },
  { m: 'photo', o: { kind: 'baby', w: 0.28, h: 0.34, frame: 'wood' }, x: -0.98, z: R.z0, y: 1.3, yaw: 0 },
  { m: 'photo', o: { kind: 'cove', w: 0.5, h: 0.36, frame: 'wood' }, x: -1.5, z: R.z0, y: 1.92, yaw: 0 },
  { m: 'counter', o: { w: 2.6, sinkAt: 0.75 }, x: -3.9, z: R.z0, yaw: 0, key: 'counter', box: [R.x0, R.z0, -2.6, R.z0 + 0.62] },
  { m: 'wallShelf', o: { w: 1.25 }, x: -4.5, z: R.z0, y: 1.45, yaw: 0 },
  { m: 'cookstove', o: { pipe: 4.55 }, x: R.x0, z: -2.6, yaw: Q, key: 'stove', box: [R.x0, -3.07, -4.55, -2.13] },
  { m: 'woodBox', x: -4.9, z: -1.55, yaw: Q, box: [R.x0, -1.85, -4.55, -1.25] },
  { m: 'grandfatherClock', x: R.x0, z: 3.0, yaw: Q, key: 'clock', box: [R.x0, 2.7, -4.82, 3.3] },
  { m: 'plant', o: { kind: 'fern' }, x: -4.85, z: 0.05, yaw: 0, r: 0.3 },
  { m: 'braidedRug', o: { w: 2.3, d: 1.7, palette: [0x2e3e62, 0xd4a03a, 0xf2e6c8, 0x7e9a78, 0xb8322a], seed: 4 }, x: -3.0, z: 1.9, yaw: 0 },
  { m: 'diningTable', x: -3.0, z: 1.9, yaw: 0, key: 'table', box: [-3.7, 1.45, -2.3, 2.35] },
  { m: 'chair', x: -3.4, z: 1.22, yaw: 0, r: 0.24 },
  { m: 'chair', x: -2.6, z: 1.22, yaw: 0, key: 'hankChair', r: 0.24 },
  { m: 'chair', x: -4.05, z: 1.9, yaw: Q, key: 'nanaChair', r: 0.24 },
  { m: 'chair', x: -1.95, z: 1.9, yaw: -Q, r: 0.24 },
  { m: 'braidedRug', o: { w: 1.3, d: 0.75, oval: false, palette: [0xb8322a, 0xf2e6c8, 0x7e9a78], seed: 9 }, x: 0, z: 3.55, yaw: 0 },
  { m: 'bootBench', x: -1.0, z: R.z1, yaw: Math.PI, box: [-1.42, 3.8, -0.58, R.z1] },
  { m: 'coatPegs', x: 1.0, z: R.z1, y: 1.0, yaw: Math.PI },
  { m: 'snowshoes', x: 0, z: R.z1, y: 2.3, yaw: Math.PI },
  { m: 'blanketChest', x: 1.95, z: R.z1, yaw: Math.PI, box: [1.45, 3.7, 2.45, R.z1] },
  { m: 'quiltRack', x: 2.95, z: R.z1, yaw: Math.PI, box: [2.5, 3.8, 3.4, R.z1] },
  { m: 'plant', o: { kind: 'fern', seed: 5 }, x: 4.75, z: 3.75, yaw: 0, r: 0.32 },
];

// things to look at / use, with where Hank stands (room-local)
export const SPOTS = {
  doorIn: { x: 0, z: 3.75, r: 0.95 },
  sofa: { x: 2.0, z: FIRE_Z, r: 1.35, seat: { x: 1.98, z: FIRE_Z, yaw: Q }, stand: { x: 2.85, z: FIRE_Z + 0.2 } },
  fire: { x: 3.95, z: FIRE_Z, r: 0.85 },
  photos: { x: -1.5, z: -3.45, r: 1.0 },
  books: { x: 1.6, z: -3.5, r: 0.85 },
  clock: { x: -4.5, z: 3.0, r: 0.85 },
  stove: { x: -4.15, z: -2.6, r: 0.9 },
  nanaHome: { x: -3.75, z: -2.35, yaw: -Q },
  entry: { x: 0, z: 3.25, yaw: Math.PI },
  porch: { x: 0, z: 5.5, yaw: 0 },
};

// camera box (room-local): clear of walls, the chimney breast and the beams
export const CAM_BOX = { x0: -4.85, x1: 4.1, z0: -3.85, z1: 3.85, y0: 1.25, y1: 2.85 };

// faces the camera can never see (outer sides of walls, top of the ceiling) are dropped
function dropOutward(geo) {
  const P3 = geo.attributes.position.array, N = geo.attributes.normal.array, I = geo.index.array;
  const keep = [];
  for (let q = 0; q < I.length; q += 6) {
    const a = I[q];
    let cx = 0, cy = 0, cz = 0;
    for (let k = 0; k < 4; k++) { cx += P3[(a + k) * 3] / 4; cy += P3[(a + k) * 3 + 1] / 4; cz += P3[(a + k) * 3 + 2] / 4; }
    const nx = N[a * 3], ny = N[a * 3 + 1], nz = N[a * 3 + 2];
    const out = (nx < 0 && cx < R.x0 - 0.05) || (nx > 0 && cx > R.x1 + 0.05) || (nz < 0 && cz < R.z0 - 0.05) || (nz > 0 && cz > R.z1 + 0.05) || (ny > 0 && cy > R.ceilAt(cz) + 0.05) || (ny < 0 && cy < -0.05);
    if (!out) for (let k = 0; k < 6; k++) keep.push(I[q + k]);
  }
  geo.setIndex(keep);
  return geo;
}

export class CabinInterior {
  constructor(world) {
    this.world = world;
    this.built = false;
    this.shown = false;
    const b = BUILDINGS.find((x) => x.id === 'nana');
    this.spec = b;
    const at = world.buildings?.nana;
    this.yaw = b.facing || 0;
    this.floorY = at?.y0 ?? world.terrain.heightAt(b.x, b.z) + 0.45;
    this.root = new THREE.Group();
    this.root.position.set(b.x, this.floorY, b.z);
    this.root.rotation.y = this.yaw;
    this.root.updateMatrixWorld(true);
    this.inv = this.root.matrixWorld.clone().invert();
    this.root.visible = false;
    this.colliders = [];
    this.parts = {};
    this.lights = [];
    this.fx = 0;
    // the floor is walkable for everyone (actors snap to it); the walls are solid only for Hank
    // indoors (game/interior.js), the building's own box keeps the bike out
    const c = this.wp(0, 0, 0);
    world.physics?.addPlatform({ x: c.x, z: c.z, yaw: this.yaw, w: R.x1 - R.x0, l: R.z1 - R.z0, y0: this.floorY, surface: 'wood', kind: 'floor' });
  }

  // room-local metres -> world
  wp(x, y = 0, z = 0) {
    return new THREE.Vector3(x, y, z).applyMatrix4(this.root.matrixWorld);
  }
  toLocal(v) {
    return new THREE.Vector3(v.x, v.y, v.z).applyMatrix4(this.inv);
  }
  wyaw(localYaw) {
    return localYaw + this.yaw;
  }
  lyaw(worldYaw) {
    return worldYaw - this.yaw;
  }
  inside(v, pad = 0) {
    const l = this.toLocal(v);
    return l.x > R.x0 - pad && l.x < R.x1 + pad && l.z > R.z0 - pad && l.z < R.z1 + pad && l.y > -0.6 && l.y < 4;
  }

  build() {
    if (this.built) return;
    this.built = true;
    const t0 = performance.now();
    this.mat = createVoxelMaterial();
    const geos = [];
    const place = (res, x, y, z, yaw) => {
      const g = meshVox(res.vox, { size: res.size, origin: res.origin, jitter: 0 });
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1)));
      return g;
    };
    const shell = IM.cabinShell();
    geos.push(dropOutward(meshVox(shell.vox, { size: shell.size, origin: shell.origin, jitter: 0 })));
    // windows: casing, mullions, curtains (sill plants on two of them)
    let wi = 0;
    for (const w of R.windows) {
      const res = IM.windowDressing({ w: w.w, h: w.h, curtains: !w.gable, sillPlant: wi === 4 || wi === 1, seed: 17 + wi });
      if (w.wall === 'back') geos.push(place(res, w.c, w.y, R.z0, 0));
      if (w.wall === 'front') geos.push(place(res, w.c, w.y, R.z1, Math.PI));
      if (w.wall === 'left') geos.push(place(res, R.x0, w.y, w.c, Q));
      wi++;
    }
    const meta = {};
    for (const it of LAYOUT) {
      const res = IM[it.m](it.o || {});
      geos.push(place(res, it.x, it.y || 0, it.z, it.yaw));
      if (it.key) meta[it.key] = { it, meta: res.meta };
      if (it.box) this.colliders.push({ type: 'box', x0: it.box[0], z0: it.box[1], x1: it.box[2], z1: it.box[3] });
      else if (it.r) this.colliders.push({ type: 'circle', x: it.x, z: it.z, r: it.r });
    }
    this.meta = meta;
    const merged = mergeGeometries(geos, false);
    for (const g of geos) g.dispose();
    merged.computeBoundingSphere();
    const mesh = voxMesh(merged, this.mat, { cast: false, receive: true });
    this.root.add(mesh);
    // moving parts: the door, the clock's pendulum, the quilts
    const mk = (res, parent = this.root) => {
      const m = voxMesh(meshVox(res.vox, { size: res.size, origin: res.origin, jitter: 0 }), this.mat, { cast: false, receive: true });
      parent.add(m);
      return m;
    };
    const d = R.door;
    this.door = new THREE.Group();
    this.door.position.set(d.c - d.w / 2, 0, R.z1 + 0.06);
    this.root.add(this.door);
    mk(IM.doorLeaf({ w: d.w, h: d.h }), this.door);
    this.doorOpen = 0;
    this.doorTarget = 0;
    this.pendulum = mk(IM.pendulum());
    this.pendulum.position.set(R.x0 + 0.38, 1.4, 3.0);
    this.pendulum.rotation.y = Q;
    this.lapQuilt = mk(IM.lapQuilt());
    this.lapQuilt.visible = false;
    this.foldedQuilt = mk(IM.foldedQuilt());
    this.foldedQuilt.visible = false;
    // the stove top: kettle and a pot of cocoa, steaming
    const st = { x: -4.55 + 0.04, y: 0.85, z: -2.6 };
    this.kettle = mk(IM.kettle());
    this.kettle.position.set(st.x - 0.2, st.y, st.z - 0.2);
    this.kettle.rotation.y = Q;
    this.pot = mk(IM.cocoaPot());
    this.pot.position.set(st.x - 0.2, st.y, st.z + 0.2);
    this.pot.rotation.y = 2.4;
    this.steam = [this.wp(st.x - 0.1, 1.1, st.z - 0.2), this.wp(st.x - 0.2, 1.0, st.z + 0.2)];
    // lights: the hearth, two lamps, the stove, the dining table window and daylight through the glass
    const L = (x, y, z, color, radius, intensity, kind = 'lamp') => {
      const l = { pos: this.wp(x, y, z), color, radius, intensity, base: intensity, kind, on: true };
      this.lights.push(l);
      return l;
    };
    this.fireLight = L(4.6, 0.55, FIRE_Z, [1.0, 0.5, 0.2], 9, 1.9, 'fire');
    L(2.0, 1.0, 0.12, [1.0, 0.72, 0.42], 4.5, 1.0);
    L(4.55, 1.55, 1.8, [1.0, 0.7, 0.4], 5.5, 1.0);
    L(-4.2, 0.6, -2.6, [1.0, 0.45, 0.18], 3.2, 0.9, 'fire');
    this.dayFront = L(-2.0, 1.8, 3.4, [0.8, 0.86, 1.0], 6.5, 0, 'day');
    this.dayBack = L(-1.5, 1.8, -3.3, [0.8, 0.86, 1.0], 6.0, 0, 'day');
    this.fireAt = this.wp(4.75, 0.3, FIRE_Z);
    this.root.updateMatrixWorld(true);
    this.world.scene.add(this.root);
    console.log(`cabin interior: ${(merged.index.count / 3) | 0} tris in ${(performance.now() - t0).toFixed(0)}ms`);
  }

  // show the room (and its lights) while someone is inside or a scene is staged there
  show(on, lightPool) {
    if (on) this.build();
    if (on === this.shown) return;
    this.shown = on;
    this.root.visible = on;
    for (const l of this.lights) (on ? lightPool.addDynamic(l) : lightPool.removeDynamic(l));
  }

  // door: 0 shut .. 1 swung open into the room
  setDoor(k) {
    this.doorTarget = k;
  }

  // push a circle (room-local x, z, radius) out of the walls and furniture; returns the push
  resolveLocal(p, r) {
    let hit = null;
    const push = (nx, nz, depth) => {
      p.x += nx * depth;
      p.z += nz * depth;
      if (!hit || depth > hit.depth) hit = { nx, nz, depth };
    };
    // walls (the doorway is closed: leaving happens through the door prompt)
    if (p.x < R.x0 + r) push(1, 0, R.x0 + r - p.x);
    if (p.x > R.x1 - r) push(-1, 0, p.x - (R.x1 - r));
    if (p.z < R.z0 + r) push(0, 1, R.z0 + r - p.z);
    if (p.z > R.z1 - r) push(0, -1, p.z - (R.z1 - r));
    for (const c of this.colliders) {
      if (c.type === 'circle') {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz);
        if (d < r + c.r) push(d > 1e-4 ? dx / d : 1, d > 1e-4 ? dz / d : 0, r + c.r - d);
      } else {
        const cx = Math.max(c.x0, Math.min(c.x1, p.x)), cz = Math.max(c.z0, Math.min(c.z1, p.z));
        const dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz);
        if (d >= r) continue;
        if (d > 1e-5) push(dx / d, dz / d, r - d);
        else {
          const px = Math.min(p.x - c.x0, c.x1 - p.x), pz = Math.min(p.z - c.z0, c.z1 - p.z);
          if (px < pz) push(p.x - c.x0 < c.x1 - p.x ? -1 : 1, 0, px + r);
          else push(0, p.z - c.z0 < c.z1 - p.z ? -1 : 1, pz + r);
        }
      }
    }
    return hit;
  }

  update(dt, game) {
    if (!this.shown) return;
    const A = game.world.atmosphere;
    this.fx += dt;
    // daylight through the windows, warm lamps always
    const day = Math.max(0, Math.min(1, A.sunDir.y * 3 + 0.2));
    this.dayFront.intensity = day * 0.9;
    this.dayBack.intensity = day * 0.6;
    this.dayFront.on = this.dayBack.on = day > 0.02;
    // a warmer, dimmer room by day so the fire still reads; plain at night
    const k = 1 - day * 0.12;
    this.mat.uniforms.uTint.value.setRGB(k, k * (0.97 - day * 0.03), k * (0.92 - day * 0.06));
    // door swing and the pendulum
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 5);
    this.door.rotation.y = this.doorOpen * 1.6;
    this.pendulum.rotation.x = Math.sin(this.fx * Math.PI) * 0.12;
    if (this.lapQuilt.visible && this.lapQuilt.userData.breathe) this.lapQuilt.scale.y = 1 + Math.sin(this.fx * 1.6) * 0.012;
    // the hearth: flames, embers and the odd glow pulse (no smoke; that goes up the chimney)
    const ps = game.effects?.ps;
    if (!ps) return;
    const f = this.fireAt;
    this.acc = (this.acc || 0) + dt * 26;
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw); // room +x in world
    const sx = Math.sin(this.yaw), sz = Math.cos(this.yaw); // room +z in world
    while (this.acc > 1) {
      this.acc -= 1;
      const r = Math.random();
      const along = (Math.random() - 0.5) * 0.6, depth = (Math.random() - 0.5) * 0.18;
      const x = f.x + sx * along + rx * depth, z = f.z + sz * along + rz * depth;
      if (r < 0.07) ps.spawn({ x: f.x - rx * 0.15, y: f.y + 0.2, z: f.z - rz * 0.15, life: 0.35, size: 1.1, size1: 0.9, sprite: P.glow, color: [1, 0.55, 0.2], emissive: 1, alpha: 0.3 });
      else if (r < 0.75) ps.spawn({ x, y: f.y + 0.05, z, vy: 0.5 + Math.random() * 0.5, life: 0.35 + Math.random() * 0.3, size: 0.2 + Math.random() * 0.22, size1: 0.05, sprite: P.flame, color: [1, 0.9, 0.7], emissive: 1, drag: 1, phase: 0 });
      else ps.spawn({ x, y: f.y + 0.15, z, vx: -rx * 0.25 + (Math.random() - 0.5) * 0.2, vy: 0.8 + Math.random() * 0.9, vz: -rz * 0.25 + (Math.random() - 0.5) * 0.2, life: 0.7 + Math.random() * 0.6, size: 0.035, sprite: P.ember, color: [1, 0.7, 0.3], emissive: 1, drag: 0.8, blink: 12 });
    }
    // the cocoa pot and kettle steam
    for (const s of this.steam) if (Math.random() < dt * 4) ps.spawn({ x: s.x + (Math.random() - 0.5) * 0.04, y: s.y, z: s.z + (Math.random() - 0.5) * 0.04, vx: (Math.random() - 0.5) * 0.06, vy: 0.3 + Math.random() * 0.15, vz: (Math.random() - 0.5) * 0.06, life: 1.4, size: 0.05, size1: 0.18, sprite: P.steam, color: [1, 1, 1], alpha: 0.45, drag: 0.6, flutter: 0.4 });
  }
}
