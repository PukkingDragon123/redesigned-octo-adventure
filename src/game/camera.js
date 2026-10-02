// Chase camera with springy lag, speed FOV, look-ahead, shake, and cinematic shots.
import * as THREE from 'three';
import { clamp, damp, angleDamp, lerp, wrapAngle, easeInOut } from '../core/math.js';

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();

export class ChaseCamera {
  constructor(camera, physics) {
    this.cam = camera;
    this.ph = physics;
    this.yaw = 0;
    this.pitch = 0.2;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.orbitIdle = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.shakeAmt = 0;
    this.fov = 55;
    this.mode = 'chase';
    this.shot = null;
    this.distScale = 1;
    this.time = 0;
    this.roll = 0;
  }

  snap(bike) {
    this.yaw = bike.yaw;
    this.update(0, bike, { x: 0, y: 0 }, true);
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  // cinematic: move to (pos, look) over `dur` seconds
  cut(pos, look, fov = 50) {
    this.mode = 'shot';
    this.shot = { from: null, pos: pos.clone(), look: look.clone(), dur: 0, t: 1, fov };
    this.pos.copy(pos);
    this.look.copy(look);
    this.fov = fov;
  }
  move(pos, look, dur = 2, fov = 50) {
    this.mode = 'shot';
    this.shot = { fromPos: this.pos.clone(), fromLook: this.look.clone(), fromFov: this.fov, pos: pos.clone(), look: look.clone(), dur, t: 0, fov };
  }
  release() {
    this.mode = 'chase';
    this.shot = null;
  }

  update(dt, bike, lookIn, instant = false) {
    this.time += dt;
    if (this.mode === 'shot' && this.shot) {
      const s = this.shot;
      if (s.dur > 0 && s.t < 1) {
        s.t = Math.min(1, s.t + dt / s.dur);
        const e = easeInOut(s.t);
        this.pos.lerpVectors(s.fromPos, s.pos, e);
        this.look.lerpVectors(s.fromLook, s.look, e);
        this.fov = lerp(s.fromFov, s.fov, e);
      } else {
        this.pos.copy(s.pos);
        this.look.copy(s.look);
        this.fov = s.fov;
      }
      this.apply(dt);
      return;
    }
    const speed = bike.speed;
    // user orbit (mouse drag / right stick), drifts back when idle
    if (Math.abs(lookIn.x) + Math.abs(lookIn.y) > 0.001) {
      this.orbitYaw = clamp(this.orbitYaw - lookIn.x * 2.2, -Math.PI, Math.PI);
      this.orbitPitch = clamp(this.orbitPitch + lookIn.y * 1.2, -0.25, 0.7);
      this.orbitIdle = 0;
    } else {
      this.orbitIdle += dt;
      if (this.orbitIdle > 1.6) {
        this.orbitYaw = damp(this.orbitYaw, 0, 2.2, dt);
        this.orbitPitch = damp(this.orbitPitch, 0, 2.2, dt);
      }
    }
    // follow the heading, partly the velocity when drifting/sliding
    let want = bike.yaw;
    if (speed > 2) {
      const va = Math.atan2(bike.vel.x, bike.vel.z);
      const backwards = bike.fwdSpeed < -0.5;
      want = backwards ? bike.yaw : bike.yaw + wrapAngle(va - bike.yaw) * (bike.drifting ? 0.55 : 0.3);
    }
    if (bike.crash > 0) want = this.yaw;
    if (this.walk) want = speed > 0.5 ? bike.yaw : this.yaw;
    this.yaw = instant ? want : angleDamp(this.yaw, want, this.walk ? 1.1 : bike.grounded ? 3.2 : 1.6, dt);
    const yaw = this.yaw + this.orbitYaw;
    const walk = this.walk ? 1 : 0;
    const dist = (5.1 + clamp(speed, 0, 25) * 0.085 - walk * 1.3) * this.distScale;
    const hgt = 1.95 + clamp(speed, 0, 25) * 0.025 + this.orbitPitch * 3 - walk * 0.35;
    const target = _t.copy(bike.pos);
    target.y += 1.15 - walk * 0.2;
    // look ahead in the direction of travel
    target.x += Math.sin(this.yaw) * clamp(speed * 0.12, 0, 2.2);
    target.z += Math.cos(this.yaw) * clamp(speed * 0.12, 0, 2.2);
    const desired = _v.set(bike.pos.x - Math.sin(yaw) * dist, bike.pos.y + hgt, bike.pos.z - Math.cos(yaw) * dist);
    // keep above ground
    const gh = this.ph.groundAt(desired.x, desired.z, desired.y).h;
    desired.y = Math.max(desired.y, gh + 0.9);
    // ...and out of buildings: slide in along the boom when a wall is in the way
    const hit = this.ph.segmentHit(target.x, target.y, target.z, desired.x, desired.y, desired.z);
    if (hit < 1) desired.lerpVectors(target, desired, Math.max(0.2, hit - 0.05));
    if (instant) {
      this.pos.copy(desired);
      this.look.copy(target);
    } else {
      const k = bike.grounded ? 7 : 4.5;
      this.pos.x = damp(this.pos.x, desired.x, k, dt);
      this.pos.z = damp(this.pos.z, desired.z, k, dt);
      this.pos.y = damp(this.pos.y, desired.y, bike.grounded ? 5 : 2.5, dt);
      this.look.x = damp(this.look.x, target.x, 12, dt);
      this.look.y = damp(this.look.y, target.y, bike.grounded ? 9 : 4, dt);
      this.look.z = damp(this.look.z, target.z, 12, dt);
    }
    const gh2 = this.ph.groundAt(this.pos.x, this.pos.z, this.pos.y).h;
    this.pos.y = Math.max(this.pos.y, gh2 + 0.7);
    // the damped position can lag into a wall too
    const hit2 = this.ph.segmentHit(this.look.x, this.look.y, this.look.z, this.pos.x, this.pos.y, this.pos.z);
    if (hit2 < 1) this.pos.lerpVectors(this.look, this.pos, Math.max(0.2, hit2 - 0.05));
    // upright phones get a taller field of view so the road ahead still fits
    const aspect = this.cam.aspect || 1.6;
    const base = aspect < 1 ? Math.min(80, 55 / Math.pow(aspect, 0.55)) : 55;
    const fovT = (base + clamp(speed - 4, 0, 22) * 0.75 + (bike.boostTime > 0 ? 8 : 0)) * (this.zoom ?? 1);
    this.fov = instant ? fovT : damp(this.fov, fovT, 3, dt);
    this.roll = damp(this.roll, bike.lean * 0.12, 4, dt);
    this.apply(dt);
  }

  apply(dt) {
    const c = this.cam;
    c.position.copy(this.pos);
    if (this.shakeAmt > 0.001) {
      const t = this.time * 38;
      const a = this.shakeAmt;
      c.position.x += (Math.sin(t * 1.3) + Math.sin(t * 2.7)) * 0.05 * a;
      c.position.y += (Math.sin(t * 1.9) + Math.sin(t * 3.1)) * 0.05 * a;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    c.up.set(0, 1, 0);
    c.lookAt(this.look);
    if (this.mode === 'chase') c.rotateZ(this.roll);
    if (Math.abs(c.fov - this.fov) > 0.01) {
      c.fov = this.fov;
      c.updateProjectionMatrix();
    }
  }
}
