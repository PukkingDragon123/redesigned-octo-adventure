// Hank on foot: camera-relative walking/running, jumping, kicking things, and
// hopping on and off the bike. Exposes a bike-like shape (pos, yaw, speed, vel,
// grounded...) so the chase camera can follow either.
import * as THREE from 'three';
import { clamp, damp, angleDamp } from '../core/math.js';

export class Walker {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.fwdSpeed = 0;
    this.grounded = true;
    this.crash = 0;
    this.lean = 0;
    this.boostTime = 0;
    this.drifting = false;
    this.airTime = 0;
    this.vy = 0;
    this.kickT = 0;
    this.events = [];
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.yaw = yaw;
    this.grounded = true;
  }

  // c: { mx, mz } camera-relative stick (-1..1), run, jumpPressed, kickPressed
  update(dt, c, camYaw) {
    const ph = this.game.physics;
    this.events.length = 0;
    // stick -> world direction (forward = away from the camera)
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let dx = fx * c.mz - fz * c.mx;
    let dz = fz * c.mz + fx * c.mx;
    const mag = Math.min(1, Math.hypot(dx, dz));
    if (mag > 0.01) { dx /= Math.hypot(dx, dz); dz /= Math.hypot(dx, dz) || 1; }
    const top = c.run ? 5.6 : 2.6;
    const want = mag * top;
    const accel = this.grounded ? 16 : 5;
    this.vel.x = damp(this.vel.x, dx * want, accel * 0.5, dt);
    this.vel.z = damp(this.vel.z, dz * want, accel * 0.5, dt);
    if (mag > 0.05) this.yaw = angleDamp(this.yaw, Math.atan2(dx, dz), 12, dt);
    // jump
    if (c.jumpPressed && this.grounded) {
      this.vy = 5.4;
      this.grounded = false;
      this.events.push({ type: 'jump' });
    }
    if (c.kickPressed && this.kickT <= 0) {
      this.kickT = 0.55;
      this.events.push({ type: 'kick' });
    }
    this.kickT -= dt;
    // integrate
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.vy -= 15 * dt;
    this.pos.y += this.vy * dt;
    const hit = ph.resolve(this.pos, 0.28, 1.5);
    if (hit && hit.obj?.kind !== 'boundary') {
      // slide along walls
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (vn < 0) { this.vel.x -= hit.nx * vn; this.vel.z -= hit.nz * vn; }
    }
    const g = ph.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 0.6);
    if (this.pos.y <= g.h + 0.01 || (this.grounded && this.vy <= 0 && this.pos.y - g.h < 0.35)) {
      if (!this.grounded && this.vy < -3) this.events.push({ type: 'land', impact: -this.vy });
      this.pos.y = g.h;
      this.vy = 0;
      this.grounded = true;
      this.airTime = 0;
    } else {
      this.grounded = false;
      this.airTime += dt;
    }
    // water: wade slowly
    this.surface = g.surface;
    if (g.water) { this.vel.multiplyScalar(Math.exp(-3 * dt)); }
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.fwdSpeed = this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    return this.events;
  }
}
