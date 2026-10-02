// Harold's old roadster, Bessie: voxel frame, steering front with the wicker basket,
// a crate on the rack, a brass lamp that lights up after dark, and a bell.
// The model is deliberately rubbery: it squashes on landings, stretches on pops,
// shimmies its handlebars, pivots on the back wheel for wheelies and on the front
// wheel for stoppies, and flops over in a crash.
import * as THREE from 'three';
import { Builder } from '../render/builder.js';
import { createPropMaterial, propMesh } from '../render/propMaterial.js';
import { damp, clamp } from '../core/math.js';
import { bikeFrame, bikeFront, bikeWheel, bikeCrate, bikeLamp } from '../voxel/models/bike.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

const R = 0.34; // wheel radius
const WB = 0.54; // half wheelbase
const SCALE = 0.86; // chibi riders: the roadster is scaled to fit the voxel villagers
const COL = { chrome: 0xdadde4, black: 0x1e1a1a };
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();

export class BikeModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'bike';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.mat = createPropMaterial(null, { side: THREE.DoubleSide });
    this.steer = 0;
    this.isMotor = false;
    this.t = 0;
    this.wheelSq = 1;
    this.stretch = 1;
    this.buildBicycle();
    this.voxelizeBicycle();
  }

  buildBicycle() {
    const g = new THREE.Group();
    this.bicycle = g;
    this.tip = new THREE.Group();
    this.body.add(this.tip);
    this.tip.add(g);
    const rearAx = [0, R, -WB];
    // (the frame and front are voxel meshes, see voxelizeBicycle; these anchors match them)
    const front = new THREE.Group();
    front.position.set(0, 0.66, 0.42);
    front.rotation.x = -0.28; // steering axis tilts back a bit
    g.add(front);
    this.front = front;
    const steerG = new THREE.Group();
    front.add(steerG);
    this.steerG = steerG;
    const ax = new THREE.Vector3(0, R - 0.66, WB - 0.42).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.28);
    const bz = ax.z + 0.12, by = 0.22;
    this.basketAnchor = new THREE.Object3D();
    this.basketAnchor.position.set(0, by + 0.03, bz);
    steerG.add(this.basketAnchor);
    // where the rider's hands go (+x is the rider's left)
    this.gripL = new THREE.Object3D();
    this.gripL.position.set(0.34, 0.39, -0.18);
    this.gripR = new THREE.Object3D();
    this.gripR.position.set(-0.34, 0.39, -0.18);
    steerG.add(this.gripL, this.gripR);
    // brass headlamp on the fork crown (voxels, see voxelizeBicycle); the lens only glows after dark

    // wheels (geometry swapped for voxels below)
    this.wheelF = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.wheelF.position.set(0, ax.y, ax.z);
    steerG.add(this.wheelF);
    this.wheelR = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.wheelR.position.set(...rearAx);
    g.add(this.wheelR);

    // crank & pedals
    const BB = [0, 0.3, -0.02];
    const crank = new THREE.Group();
    crank.position.set(...BB);
    g.add(crank);
    this.crank = crank;
    const cb = new Builder();
    cb.box([0.1, -0.075, 0], [0.018, 0.17, 0.03], { color: COL.chrome });
    cb.box([-0.1, 0.075, 0], [0.018, 0.17, 0.03], { color: COL.chrome });
    crank.add(propMesh(cb.build(), this.mat));
    this.pedals = [];
    for (const [x, y] of [[0.14, -0.155], [-0.14, 0.155]]) {
      const pb = new Builder();
      pb.box([0, 0, 0], [0.09, 0.025, 0.06], { color: COL.black });
      pb.box([0, 0.014, 0.022], [0.09, 0.006, 0.012], { color: COL.chrome });
      const p = propMesh(pb.build(), this.mat);
      p.position.set(x, y, 0);
      crank.add(p);
      this.pedals.push(p);
    }

    // the crate on the rear rack (voxels) holds the third cup, down inside it
    this.rearAnchor = new THREE.Object3D();
    this.rearAnchor.position.set(0, 0.85, -0.56);
    g.add(this.rearAnchor);
    this.nozzles = [];

    this.lampLight = new THREE.Object3D(); // position source for the game's light pool
    this.lampLight.position.set(0, 0.95, 1.4);
    g.add(this.lampLight);
    this.riderAnchor = new THREE.Object3D();
    this.riderAnchor.position.set(0, 0.96, -0.22);
    g.add(this.riderAnchor);
    g.scale.setScalar(SCALE);
  }

  // Bessie's frame, front end and wheels are voxel models (src/voxel/models/bike.js)
  voxelizeBicycle() {
    const mk = (r, jitter = 0.02) => voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin, jitter }), sharedVoxelMaterial());
    this.bicycle.add(mk(bikeFrame()));
    this.steerG.add(mk(bikeFront()));
    this.crateMesh = mk(bikeCrate(), 0.03);
    this.bicycle.add(this.crateMesh);
    this.lampMesh = mk(bikeLamp('body'), 0.01);
    this.lensOn = mk(bikeLamp('lit'), 0);
    this.lensOff = mk(bikeLamp('unlit'), 0);
    this.steerG.add(this.lampMesh, this.lensOn, this.lensOff);
    this.setLamp(false);
    const wheel = bikeWheel();
    const wg = meshVox(wheel.vox, { size: wheel.size, origin: wheel.origin, jitter: 0.02 });
    for (const w of [this.wheelF, this.wheelR]) {
      w.geometry = wg;
      w.material = sharedVoxelMaterial();
      w.customDepthMaterial = w.material.userData.depth;
      w.castShadow = true;
    }
  }

  get rider() {
    return this.riderAnchor;
  }
  get basket() {
    return this.basketAnchor;
  }

  setLamp(on) {
    this.lensOn.visible = on;
    this.lensOff.visible = !on;
  }

  // Bessie has no upgrades any more; kept so older callers don't break
  applyUpgrades() {}

  update(dt, bike, steerInput) {
    this.t += dt;
    this.root.position.copy(bike.pos);
    this.root.rotation.set(0, bike.yaw, 0);
    // attitude: slope pitch and lean about the contact patch (about the middle in the air), then
    // the wheelie / stoppie tip about whichever wheel is still on the ground
    const down = bike.grounded || bike.crash > 0;
    const tipA = bike.crash > 0 ? bike.pitch - bike.slopePitch : down ? bike.wheelie - bike.stoppie : 0;
    const wantY = down ? 0 : 0.5;
    this.pivY = dt > 0 ? damp(this.pivY ?? 0, wantY, 10, dt) : wantY;
    _e.set(-(bike.pitch - tipA), 0, bike.lean, 'YXZ');
    _q.setFromEuler(_e);
    this.body.quaternion.copy(_q);
    _p.set(0, this.pivY, 0).applyQuaternion(_q);
    this.body.position.set(-_p.x, this.pivY - _p.y, -_p.z);
    const pz = tipA >= 0 ? -WB * SCALE : WB * SCALE;
    this.tip.rotation.x = -tipA;
    this.tip.position.set(0, -pz * Math.sin(tipA), pz - pz * Math.cos(tipA));
    // squash on landings, stretch on pops, a jelly wobble while balancing
    const sq = bike.squash.value;
    const jelly = 1 + Math.sin(this.t * 31) * Math.min(0.04, Math.abs(bike.balance) * 0.6);
    this.body.scale.set(jelly / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    // the handlebars: steering, drift counter-steer, a shimmy when slow or knocked about
    const shimmy = bike.shimmy * 2.2 + (bike.grounded && bike.speed > 0.3 && bike.speed < 2 ? Math.sin(this.t * 11) * 0.06 * (2 - bike.speed) : 0);
    this.steer = damp(this.steer, -steerInput * 0.45 * Math.max(0.25, 1 - bike.speed / 14) + (bike.drifting ? bike.driftDir * 0.35 : 0) + (bike.dab > 0.5 ? -steerInput * 0.3 : 0), 10, dt);
    this.steerG.rotation.y = this.steer + clamp(shimmy, -0.35, 0.35);
    this.wheelF.rotation.x = bike.wheelAngle;
    this.wheelR.rotation.x = bike.wheelAngle;
    // tyres squish a little on hard landings
    this.wheelSq = damp(this.wheelSq, 1, 9, dt);
    if (sq < this.wheelSq) this.wheelSq = sq;
    const ws = 0.6 + this.wheelSq * 0.4;
    this.wheelF.scale.set(1, ws, 1 / Math.sqrt(ws));
    this.wheelR.scale.set(1, ws, 1 / Math.sqrt(ws));
    this.crank.rotation.x = bike.crank;
    for (const p of this.pedals) p.rotation.x = -bike.crank;
    // crash: the bike flops over and skids round
    if (bike.crash > 0) {
      this.root.rotation.y = bike.yaw + (1.9 - bike.crash) * bike.crashSpin * Math.max(0, bike.crash - 1) * 0.4;
    }
  }

  // world positions for effects
  worldOf(local, out = new THREE.Vector3()) {
    return out.copy(local).applyMatrix4(this.bicycle.matrixWorld);
  }
}
