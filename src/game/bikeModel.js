// Harold's old roadster bicycle (and later his restored motorbike) as chunky low-poly 3D,
// shaded by the pixel pipeline. Upgrades show up as real parts on the bike.
import * as THREE from 'three';
import { Builder } from '../render/builder.js';
import { createPropMaterial, propMesh } from '../render/propMaterial.js';
import { damp } from '../core/math.js';
import { bikeFrame, bikeFront, bikeWheel } from '../voxel/models/bike.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

const R = 0.34; // wheel radius
const WB = 0.54; // half wheelbase
const COL = {
  frame: 0x2f6e52,
  frameHi: 0x4a9a72,
  cream: 0xeadfc4,
  saddle: 0x6a3a1e,
  tire: 0x241e1c,
  rim: 0xc4c6cc,
  chrome: 0xdadde4,
  chain: 0x4a4a50,
  wicker: 0xb98a48,
  wickerDark: 0x8a5e2c,
  crate: 0xa0703a,
  red: 0xc8361f,
  cola: 0x8a1e14,
  label: 0xf2ead8,
  quilt1: 0xd8564a,
  quilt2: 0xf0c060,
  quilt3: 0x5a8ab0,
  lamp: 0xfff2c0,
  black: 0x1e1a1a,
  motor: 0x8a2a22,
  motorDark: 0x4a1a16,
  leather: 0x4a2a1a,
};

function wheelGeometry(radius = R, motor = false) {
  const b = new Builder();
  const tire = new THREE.TorusGeometry(radius - 0.025, motor ? 0.045 : 0.028, 6, 22);
  tire.rotateY(Math.PI / 2);
  b.geom(tire, [0, 0, 0], null, [1, 1, 1], { color: COL.tire });
  const rim = new THREE.TorusGeometry(radius - 0.06, 0.012, 4, 22);
  rim.rotateY(Math.PI / 2);
  b.geom(rim, [0, 0, 0], null, [1, 1, 1], { color: motor ? COL.chrome : COL.rim });
  const spokes = motor ? 8 : 9;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI;
    const r = radius - 0.06;
    b.tube([0, Math.cos(a) * r, Math.sin(a) * r], [0, -Math.cos(a) * r, -Math.sin(a) * r], 0.008, 0.008, { color: COL.chrome }, 3);
  }
  b.tube([-0.05, 0, 0], [0.05, 0, 0], 0.025, 0.025, { color: COL.chrome }, 6);
  return b.build();
}

export class BikeModel {
  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'bike';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.mat = createPropMaterial(null, { side: THREE.DoubleSide });
    this.upgrades = {};
    this.steer = 0;
    this.flames = [];
    this.buildBicycle();
    this.voxelizeBicycle();
    this.buildMotor();
    this.setMotor(false);
  }

  buildBicycle() {
    const g = new THREE.Group();
    this.bicycle = g;
    this.body.add(g);
    const b = new Builder();
    const fr = { color: COL.frame };
    const BB = [0, 0.3, -0.02];
    const seatTop = [0, 0.84, -0.2];
    const headTop = [0, 0.88, 0.37];
    const headBot = [0, 0.66, 0.42];
    const rearAx = [0, R, -WB];
    // diamond frame
    b.tube(BB, seatTop, 0.026, 0.024, fr);
    b.tube(seatTop, headTop, 0.024, 0.024, fr);
    b.tube(BB, headBot, 0.028, 0.026, fr);
    b.tube(headBot, headTop, 0.032, 0.032, { color: COL.frameHi });
    for (const sx of [-0.055, 0.055]) {
      b.tube(BB, [sx, R, -WB], 0.016, 0.014, fr, 5);
      b.tube([sx * 0.4, 0.8, -0.21], [sx, R, -WB], 0.014, 0.014, fr, 5);
    }
    // seat post + sprung leather saddle
    b.tube(seatTop, [0, 0.95, -0.23], 0.016, 0.016, { color: COL.chrome }, 5);
    b.box([0, 0.985, -0.24], [0.17, 0.05, 0.25], { color: COL.saddle });
    b.box([0, 1.0, -0.17], [0.09, 0.04, 0.12], { color: COL.saddle });
    for (const sx of [-0.05, 0.05]) b.tube([sx, 0.95, -0.31], [sx, 0.93, -0.33], 0.012, 0.012, { color: COL.chrome }, 4);
    // rear fender & rack
    const fender = (z, start, len) => {
      const arc = new THREE.TorusGeometry(R + 0.04, 0.035, 3, 12, len);
      arc.rotateY(Math.PI / 2);
      arc.rotateX(start);
      b.geom(arc, [0, R, z], null, [1, 1, 1], { color: COL.cream });
    };
    fender(-WB, -0.25, 2.4);
    b.box([0, 0.8, -0.56], [0.16, 0.025, 0.36], { color: COL.black });
    for (const sx of [-0.07, 0.07]) b.tube([sx, 0.8, -0.72], [sx, R, -WB], 0.01, 0.01, { color: COL.black }, 3);
    // chainring + chain
    const ring = new THREE.CylinderGeometry(0.1, 0.1, 0.012, 14);
    ring.rotateZ(Math.PI / 2);
    b.geom(ring, [0.07, BB[1], BB[2]], null, [1, 1, 1], { color: COL.chrome });
    b.tube([0.075, BB[1] + 0.1, BB[2]], [0.075, R + 0.04, -WB], 0.008, 0.008, { color: COL.chain }, 3);
    b.tube([0.075, BB[1] - 0.1, BB[2]], [0.075, R - 0.04, -WB], 0.008, 0.008, { color: COL.chain }, 3);
    // chain guard
    b.box([0.085, 0.31, -0.28], [0.01, 0.07, 0.5], { color: COL.cream }, [0.08, 0, 0]);
    this.frameMesh = propMesh(b.build(), this.mat);
    g.add(this.frameMesh);

    // front assembly (steers)
    const front = new THREE.Group();
    front.position.set(0, 0.66, 0.42);
    // steering axis tilts back a bit
    front.rotation.x = -0.28;
    g.add(front);
    this.front = front;
    const steerG = new THREE.Group();
    front.add(steerG);
    this.steerG = steerG;
    const fb = new Builder();
    // fork legs down to the axle (in steer-local coords)
    const ax = new THREE.Vector3(0, R - 0.66, WB - 0.42).applyAxisAngle(new THREE.Vector3(1, 0, 0), 0.28);
    for (const sx of [-0.05, 0.05]) fb.tube([sx, 0.02, 0], [sx, ax.y, ax.z], 0.016, 0.013, fr, 5);
    // stem & swept-back handlebar
    fb.tube([0, 0.0, 0], [0, 0.36, 0], 0.018, 0.018, { color: COL.chrome }, 5);
    fb.tube([0, 0.36, 0], [0, 0.36, -0.05], 0.016, 0.016, { color: COL.chrome }, 4);
    fb.tube([-0.3, 0.38, -0.16], [0, 0.36, -0.05], 0.014, 0.014, { color: COL.chrome }, 4);
    fb.tube([0.3, 0.38, -0.16], [0, 0.36, -0.05], 0.014, 0.014, { color: COL.chrome }, 4);
    fb.tube([-0.3, 0.38, -0.16], [-0.38, 0.38, -0.2], 0.022, 0.022, { color: COL.leather }, 5);
    fb.tube([0.3, 0.38, -0.16], [0.38, 0.38, -0.2], 0.022, 0.022, { color: COL.leather }, 5);
    // front fender
    const arc = new THREE.TorusGeometry(R + 0.04, 0.035, 3, 12, 2.0);
    arc.rotateY(Math.PI / 2);
    arc.rotateX(0.55);
    fb.geom(arc, [0, ax.y, ax.z], null, [1, 1, 1], { color: COL.cream });
    // wicker basket on a little front rack
    const bz = ax.z + 0.12, by = 0.22;
    fb.box([0, by, bz], [0.38, 0.03, 0.3], { color: COL.wickerDark });
    for (const [x, z, w, d] of [[0, bz + 0.145, 0.38, 0.02], [0, bz - 0.145, 0.38, 0.02], [0.18, bz, 0.02, 0.3], [-0.18, bz, 0.02, 0.3]]) {
      for (let k = 0; k < 4; k++) fb.box([x, by + 0.04 + k * 0.05, z], [w, 0.035, d], { color: k % 2 ? COL.wicker : COL.wickerDark });
    }
    fb.tube([0, by, bz - 0.15], [0, 0.0, 0], 0.01, 0.01, { color: COL.black }, 3);
    this.frontMesh = propMesh(fb.build(), this.mat);
    steerG.add(this.frontMesh);
    this.basketAnchor = new THREE.Object3D();
    this.basketAnchor.position.set(0, by + 0.03, bz);
    steerG.add(this.basketAnchor);
    // where the rider's hands go (+x is the rider's left)
    this.gripL = new THREE.Object3D();
    this.gripL.position.set(0.34, 0.39, -0.18);
    this.gripR = new THREE.Object3D();
    this.gripR.position.set(-0.34, 0.39, -0.18);
    steerG.add(this.gripL, this.gripR);
    // bell
    const bell = new Builder();
    const dome = new THREE.SphereGeometry(0.035, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    bell.geom(dome, [0.17, 0.39, -0.1], null, [1, 1, 1], { color: COL.chrome });
    this.bellMesh = propMesh(bell.build(), this.mat);
    steerG.add(this.bellMesh);
    // headlamp (upgrade)
    const lamp = new Builder();
    lamp.tube([0, 0.25, 0.05], [0, 0.25, 0.14], 0.055, 0.045, { color: COL.chrome }, 8);
    lamp.tube([0, 0.25, 0.14], [0, 0.25, 0.15], 0.045, 0.045, { color: COL.lamp, emissive: 1.5 }, 8);
    this.lampMesh = propMesh(lamp.build(), this.mat);
    steerG.add(this.lampMesh);
    // suspension springs (upgrade)
    const spr = new Builder();
    for (const sx of [-0.05, 0.05]) {
      for (let k = 0; k < 7; k++) {
        const y = -0.05 - k * 0.035;
        spr.tube([sx - 0.025, y, 0.01], [sx + 0.025, y - 0.017, -0.01], 0.008, 0.008, { color: COL.red }, 3);
      }
    }
    this.springMesh = propMesh(spr.build(), this.mat);
    steerG.add(this.springMesh);

    // wheels
    const wgeo = wheelGeometry();
    this.wheelF = propMesh(wgeo, this.mat);
    this.wheelF.position.set(0, ax.y, ax.z);
    steerG.add(this.wheelF);
    this.wheelR = propMesh(wgeo, this.mat);
    this.wheelR.position.set(...rearAx);
    g.add(this.wheelR);

    // crank & pedals
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
      const p = propMesh(pb.build(), this.mat);
      p.position.set(x, y, 0);
      crank.add(p);
      this.pedals.push(p);
    }

    // ---- upgrade parts on the rear
    // cargo rack crate
    const crate = new Builder();
    crate.box([0, 0.9, -0.56], [0.36, 0.18, 0.34], { color: COL.crate });
    crate.box([0, 0.995, -0.56], [0.38, 0.02, 0.36], { color: 0x7a5228 });
    for (const sx of [-0.181, 0.181]) crate.box([sx, 0.9, -0.56], [0.01, 0.06, 0.3], { color: 0x6a4420 });
    this.crateMesh = propMesh(crate.build(), this.mat);
    g.add(this.crateMesh);
    this.rearAnchor = new THREE.Object3D();
    this.rearAnchor.position.set(0, 1.0, -0.56);
    g.add(this.rearAnchor);
    // cola rocket boosters
    const boost = new Builder();
    for (const sx of [-0.15, 0.15]) {
      boost.tube([sx, 0.72, -0.4], [sx, 0.72, -0.78], 0.05, 0.05, { color: COL.cola }, 7);
      boost.tube([sx, 0.72, -0.4], [sx, 0.72, -0.3], 0.05, 0.02, { color: COL.cola }, 7);
      boost.tube([sx, 0.72, -0.3], [sx, 0.72, -0.27], 0.02, 0.02, { color: COL.red }, 5);
      boost.tube([sx, 0.72, -0.55], [sx, 0.72, -0.66], 0.052, 0.052, { color: COL.label }, 7);
      boost.tube([sx, 0.72, -0.78], [sx, 0.72, -0.84], 0.035, 0.045, { color: COL.chrome }, 6);
      boost.tube([sx * 0.5, 0.8, -0.5], [sx, 0.75, -0.5], 0.008, 0.008, { color: COL.black }, 3);
    }
    this.boostMesh = propMesh(boost.build(), this.mat);
    g.add(this.boostMesh);
    this.nozzles = [new THREE.Vector3(-0.15, 0.72, -0.86), new THREE.Vector3(0.15, 0.72, -0.86)];
    // quilt glider: rolled up on the rack, unfurls into patchwork wings
    const roll = new Builder();
    roll.tube([-0.22, 0.86, -0.62], [0.22, 0.86, -0.62], 0.06, 0.06, { color: COL.quilt1 }, 7);
    roll.tube([-0.06, 0.86, -0.62], [0.06, 0.86, -0.62], 0.062, 0.062, { color: COL.quilt2 }, 7);
    this.gliderRoll = propMesh(roll.build(), this.mat);
    g.add(this.gliderRoll);
    const wing = new Builder();
    const patches = [COL.quilt1, COL.quilt2, COL.quilt3, 0xeadfc4, 0x7aa860, 0xc87ab0];
    for (let i = -4; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        const x = (i + 0.5) * 0.42, z = -0.1 - j * 0.32;
        const curve = -Math.abs(x) * 0.12;
        wing.box([x, 2.0 + curve, z], [0.41, 0.02, 0.31], { color: patches[(i * 7 + j * 3 + 20) % patches.length] }, [0, 0, x * 0.1]);
      }
    }
    for (const sx of [-1.2, 1.2]) wing.tube([sx, 1.95, -0.4], [sx * 0.1, 1.05, -0.2], 0.01, 0.01, { color: COL.black }, 3);
    wing.tube([0, 2.0, -0.4], [0, 1.0, -0.22], 0.015, 0.015, { color: COL.wickerDark }, 4);
    this.gliderWing = propMesh(wing.build(), this.mat);
    this.gliderWing.scale.set(0.01, 0.01, 0.01);
    g.add(this.gliderWing);
    this.gliderOpen = 0;

    this.lampLight = new THREE.Object3D(); // position source for the game's light pool
    this.lampLight.position.set(0, 0.95, 1.4);
    g.add(this.lampLight);
    this.riderAnchor = new THREE.Object3D();
    this.riderAnchor.position.set(0, 0.96, -0.22);
    g.add(this.riderAnchor);
    // chibi riders: the roadster is scaled to fit the voxel villagers
    g.scale.setScalar(0.86);
  }

  buildMotor() {
    // Harold's 1958 motorbike with a sidecar for the cat and the cocoa
    const g = new THREE.Group();
    this.motor = g;
    this.body.add(g);
    const b = new Builder();
    const MR = 0.38;
    const m = { color: COL.motor };
    b.box([0, 0.72, 0.05], [0.26, 0.2, 0.55], m); // tank
    b.box([0, 0.78, 0.05], [0.18, 0.06, 0.4], { color: 0xeadfc4 }); // stripe
    b.box([0, 0.42, -0.02], [0.28, 0.28, 0.36], { color: COL.motorDark }); // engine
    for (let k = 0; k < 4; k++) b.box([0, 0.33 + k * 0.06, 0.18], [0.3, 0.02, 0.06], { color: COL.chrome });
    b.box([0, 0.86, -0.36], [0.24, 0.08, 0.4], { color: COL.leather }); // seat
    b.tube([0.17, 0.32, 0.1], [0.2, 0.36, -0.75], 0.04, 0.05, { color: COL.chrome }, 6); // exhaust
    b.tube([0, 0.62, 0.36], [0, MR, 0.62], 0.035, 0.035, { color: COL.chrome }, 6);
    b.tube([0, 0.7, -0.2], [0, MR, -0.62], 0.035, 0.035, m, 6);
    b.tube([-0.34, 1.0, 0.3], [0.34, 1.0, 0.3], 0.018, 0.018, { color: COL.chrome }, 5);
    b.tube([0, 0.7, 0.36], [0, 1.0, 0.3], 0.025, 0.025, { color: COL.chrome }, 5);
    b.tube([0, 0.82, 0.48], [0, 0.82, 0.58], 0.09, 0.08, { color: COL.chrome }, 9);
    b.tube([0, 0.82, 0.58], [0, 0.82, 0.59], 0.08, 0.08, { color: COL.lamp, emissive: 2 }, 9);
    const fender = (z) => {
      const arc = new THREE.TorusGeometry(MR + 0.05, 0.06, 3, 12, 2.2);
      arc.rotateY(Math.PI / 2);
      arc.rotateX(-0.1);
      b.geom(arc, [0, MR, z], null, [1, 1, 1], m);
    };
    fender(0.62);
    fender(-0.62);
    // sidecar on the right (-x is the rider's right)
    b.box([-0.75, 0.5, -0.05], [0.5, 0.34, 1.1], { color: 0xeadfc4 });
    b.box([-0.75, 0.68, 0.38], [0.48, 0.06, 0.28], { color: COL.motor });
    b.box([-0.75, 0.6, -0.15], [0.42, 0.06, 0.6], { color: COL.leather });
    b.tube([-0.25, 0.35, 0.2], [-0.62, 0.35, 0.2], 0.025, 0.025, { color: COL.chrome }, 5);
    b.tube([-0.25, 0.35, -0.3], [-0.62, 0.35, -0.3], 0.025, 0.025, { color: COL.chrome }, 5);
    this.motorMesh = propMesh(b.build(), this.mat);
    g.add(this.motorMesh);
    const wgeo = wheelGeometry(MR, true);
    this.mWheelF = propMesh(wgeo, this.mat);
    this.mWheelF.position.set(0, MR, 0.62);
    this.mWheelR = propMesh(wgeo, this.mat);
    this.mWheelR.position.set(0, MR, -0.62);
    this.mWheelS = propMesh(wheelGeometry(0.3, true), this.mat);
    this.mWheelS.position.set(-1.02, 0.3, -0.05);
    g.add(this.mWheelF, this.mWheelR, this.mWheelS);
    this.mRiderAnchor = new THREE.Object3D();
    this.mRiderAnchor.position.set(0, 0.9, -0.32);
    g.add(this.mRiderAnchor);
    g.scale.setScalar(0.9);
    this.mBasketAnchor = new THREE.Object3D();
    this.mBasketAnchor.position.set(-0.75, 0.66, -0.15);
    g.add(this.mBasketAnchor);
    this.mExhaust = new THREE.Vector3(0.2, 0.36, -0.8);
    this.mLampLight = new THREE.Object3D();
    this.mLampLight.position.set(0, 1.0, 1.6);
    g.add(this.mLampLight);
  }

  // swap the roadster's frame, front end and wheels for voxel versions
  voxelizeBicycle() {
    const mk = (r) => voxMesh(meshVox(r.vox, { size: r.size, origin: r.origin, jitter: 0.02 }), sharedVoxelMaterial());
    const frame = mk(bikeFrame());
    this.frameMesh.visible = false;
    this.bicycle.add(frame);
    const front = mk(bikeFront());
    this.frontMesh.visible = false;
    this.steerG.add(front);
    const wheel = bikeWheel();
    const wg = meshVox(wheel.vox, { size: wheel.size, origin: wheel.origin, jitter: 0.02 });
    for (const w of [this.wheelF, this.wheelR]) {
      w.geometry = wg;
      w.material = sharedVoxelMaterial();
      w.customDepthMaterial = w.material.userData.depth;
    }
  }

  setMotor(on) {
    this.isMotor = on;
    this.bicycle.visible = !on;
    this.motor.visible = on;
  }

  get rider() {
    return this.isMotor ? this.mRiderAnchor : this.riderAnchor;
  }
  get basket() {
    return this.isMotor ? this.mBasketAnchor : this.basketAnchor;
  }

  applyUpgrades(stats, owned) {
    this.setMotor(!!stats.motor);
    this.crateMesh.visible = stats.capacity >= 4;
    this.boostMesh.visible = stats.boostCharges > 0;
    this.hasGlider = !!stats.glider;
    this.gliderRoll.visible = this.hasGlider;
    this.lampMesh.visible = stats.light;
    this.springMesh.visible = stats.suspension > 0;
    this.bellMesh.visible = true;
  }

  update(dt, bike, steerInput) {
    this.root.position.copy(bike.pos);
    this.root.rotation.set(0, bike.yaw, 0);
    // lean pivots on the contact patch, pitch follows the slope
    this.body.rotation.set(bike.pitch, 0, bike.lean, 'YXZ');
    const sq = bike.squash.value;
    this.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    this.steer = damp(this.steer, -steerInput * 0.45 * Math.max(0.25, 1 - bike.speed / 14) + (bike.drifting ? bike.driftDir * 0.35 : 0), 10, dt);
    if (this.isMotor) {
      this.mWheelF.rotation.x = bike.wheelAngle * (0.34 / 0.38);
      this.mWheelR.rotation.x = bike.wheelAngle * (0.34 / 0.38);
      this.mWheelS.rotation.x = bike.wheelAngle * (0.34 / 0.3);
    } else {
      this.steerG.rotation.y = this.steer;
      this.wheelF.rotation.x = bike.wheelAngle;
      this.wheelR.rotation.x = bike.wheelAngle;
      this.crank.rotation.x = bike.crank;
      for (const p of this.pedals) p.rotation.x = -bike.crank;
      // glider unfurls with a springy pop
      const want = bike.gliding ? 1 : 0;
      this.gliderOpen = damp(this.gliderOpen, want, want ? 9 : 5, dt);
      const s = Math.max(0.001, this.gliderOpen * (1 + Math.sin(this.gliderOpen * Math.PI) * 0.15));
      this.gliderWing.scale.set(s, s, s);
      this.gliderWing.visible = this.gliderOpen > 0.02;
      this.gliderRoll.visible = !!this.hasGlider && this.gliderOpen < 0.5;
    }
    // crash: the bike flops over and skids
    if (bike.crash > 0) {
      this.body.rotation.z = bike.lean;
      this.root.rotation.y = bike.yaw + (1.9 - bike.crash) * bike.crashSpin * Math.max(0, bike.crash - 1) * 0.4;
    }
  }

  // world positions for effects
  worldOf(local, out = new THREE.Vector3()) {
    return out.copy(local).applyMatrix4(this.bicycle.matrixWorld);
  }
}
