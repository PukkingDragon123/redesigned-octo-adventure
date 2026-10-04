// Hank on foot: camera-relative walking/running, jumping, kicking things, and
// hopping on and off the bike. Exposes a bike-like shape (pos, yaw, speed, vel,
// grounded...) so the chase camera can follow either.
//
// He gets going over a step or two and skids to a stop (eased acceleration, quicker
// to brake than to speed up), turns at a limited rate (a quick pivot, never a snap),
// and collides in small sub-steps so a hiccup frame can't carry him through a fence;
// walls and corners slide him along instead of sticking. Kerbs and steps snap the
// physics height but the body eases over them (stepOffset) so it doesn't pop.
//
// The stick sets the pace (a gentle push ambles, a full one walks, Shift / RB / the stick
// pushed right out runs). Jumps are forgiving: a press just before landing still jumps when
// he touches down, a press just after stepping off an edge still counts, and letting go early
// makes a smaller hop.
import * as THREE from 'three';
import { clamp, damp, wrapAngle } from '../core/math.js';

const WALK = 2.6, RUN = 5.6; // top speeds (m/s)
const JUMP_V = 5.4;
const BUFFER = 0.15, COYOTE = 0.12; // seconds
const ACCEL = 14; // speeding up on the ground (m/s^2)
const DECEL = 20; // slowing down or turning against his own momentum
const AIR = 4.5; // a little steering in the air
const TURN = 10.5; // fastest turn (rad/s)
const RAD = 0.28, HGT = 1.5;
const ZERO = { mx: 0, mz: 0 };

export class Walker {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.yawRate = 0;
    this.speed = 0;
    this.fwdSpeed = 0;
    this.accel = 0; // smoothed forward acceleration (the body leans with it)
    this.grounded = true;
    this.crash = 0;
    this.lean = 0;
    this.boostTime = 0;
    this.drifting = false;
    this.airTime = 0;
    this.vy = 0;
    this.kickT = 0;
    this.jumpBuf = 0; // a jump pressed a moment ago, waiting to land
    this.offGround = 0; // seconds since he last stood on something
    this.jumpCut = false;
    this.stepOffset = 0; // visual height offset easing out a snapped step
    this.events = [];
    this.phys = null;
    this.frozen = false;
  }

  place(x, y, z, yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.yaw = yaw;
    this.yawRate = 0;
    this.accel = 0;
    this.stepOffset = 0;
    this.grounded = true;
    this.jumpBuf = 0;
    this.offGround = 0;
  }

  // c: { mx, mz } camera-relative stick (-1..1), run, jump (held), jumpPressed, kickPressed
  // phys: an optional stand-in physics (Nana's cabin has its own floor and walls);
  // frozen: no input (door transitions, sitting down)
  update(dt, c, camYaw) {
    const ph = this.phys || this.game.physics;
    if (this.frozen) c = ZERO;
    this.events.length = 0;
    if (dt <= 0) return this.events;
    // stick -> world direction (forward = away from the camera)
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let dx = fx * c.mz - fz * c.mx;
    let dz = fz * c.mz + fx * c.mx;
    const len = Math.hypot(dx, dz);
    const mag = Math.min(1, len);
    if (len > 1e-4) { dx /= len; dz /= len; }
    const top = (c.run ? RUN : WALK) * (this.surface === 'water' || this.wet ? 0.5 : 1);
    const want = mag * top;
    // ---- accelerate towards the wanted velocity (braking and turning back bite harder)
    const sp0 = Math.hypot(this.vel.x, this.vel.z);
    const ex = dx * want - this.vel.x, ez = dz * want - this.vel.z;
    const el = Math.hypot(ex, ez);
    if (el > 1e-5) {
      const against = this.vel.x * ex + this.vel.z * ez < 0 || want < sp0;
      const a = this.grounded ? (against ? DECEL : ACCEL) : AIR;
      const step = Math.min(el, a * dt);
      this.vel.x += (ex / el) * step;
      this.vel.z += (ez / el) * step;
    }
    // ---- face where he's going: eased, but never faster than TURN
    const prevYaw = this.yaw;
    if (mag > 0.05) {
      const diff = wrapAngle(Math.atan2(dx, dz) - this.yaw);
      const step = clamp(diff * (1 - Math.exp(-13 * dt)), -TURN * dt, TURN * dt);
      this.yaw = wrapAngle(this.yaw + step);
    }
    this.yawRate = damp(this.yawRate, wrapAngle(this.yaw - prevYaw) / dt, 10, dt);
    // jump: buffered a moment before landing, allowed a moment after stepping off an edge
    if (c.jumpPressed) this.jumpBuf = BUFFER;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (this.jumpBuf > 0 && (this.grounded || this.offGround < COYOTE) && this.vy <= 0.5) {
      this.vy = JUMP_V;
      this.grounded = false;
      this.offGround = COYOTE;
      this.jumpBuf = 0;
      this.jumpCut = false;
      this.events.push({ type: 'jump' });
    }
    // let go early on the way up: a smaller hop
    if (!this.grounded && !this.jumpCut && c.jump === false && this.vy > 1.5) {
      this.vy *= 0.55;
      this.jumpCut = true;
    }
    if (c.kickPressed && this.kickT <= 0) {
      this.kickT = 0.55;
      this.events.push({ type: 'kick' });
    }
    this.kickT -= dt;
    // ---- move in small steps, sliding along whatever he bumps into
    const move = Math.hypot(this.vel.x, this.vel.z) * dt;
    const n = Math.min(8, Math.max(1, Math.ceil(move / (RAD * 0.6))));
    const h = dt / n;
    const opt = this._opt || (this._opt = { px: 0, pz: 0 });
    const x0 = this.pos.x, z0 = this.pos.z;
    for (let i = 0; i < n; i++) {
      opt.px = this.pos.x;
      opt.pz = this.pos.z;
      this.pos.x += this.vel.x * h;
      this.pos.z += this.vel.z * h;
      const hit = ph.resolve(this.pos, RAD, HGT, opt);
      if (hit) this.slide(ph, hit);
    }
    // pinned (a corner, a crowd): keep no more speed than he really moved with, so he
    // doesn't run on the spot
    const ax = (this.pos.x - x0) / dt, az = (this.pos.z - z0) / dt;
    if (ax * ax + az * az < this.vel.x * this.vel.x + this.vel.z * this.vel.z) { this.vel.x = ax; this.vel.z = az; }
    this.vy -= 15 * dt;
    this.pos.y += this.vy * dt;
    const prevY = this.pos.y;
    const g = ph.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.6, 0.6);
    const wasGrounded = this.grounded;
    if (this.pos.y <= g.h + 0.01 || (this.grounded && this.vy <= 0 && this.pos.y - g.h < 0.35)) {
      if (!this.grounded && this.vy < -3) this.events.push({ type: 'land', impact: -this.vy });
      this.pos.y = g.h;
      this.vy = 0;
      this.grounded = true;
      this.airTime = 0;
      this.offGround = 0;
      // a kerb or a step (not just a slope): the body eases up (or down) over it instead of popping
      const snap = this.pos.y - prevY;
      const slope = 0.04 + Math.hypot(this.pos.x - x0, this.pos.z - z0) * 0.75;
      if (wasGrounded && Math.abs(snap) > slope && Math.abs(snap) < 1.3) this.stepOffset -= snap;
    } else {
      this.grounded = false;
      this.airTime += dt;
      this.offGround += dt;
    }
    this.stepOffset = clamp(damp(this.stepOffset, 0, 12, dt), -0.6, 0.6);
    // water: wade slowly
    this.surface = g.surface;
    this.wet = g.water;
    if (g.water) { this.vel.multiplyScalar(Math.exp(-3 * dt)); }
    const fwdPrev = this.fwdSpeed;
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.fwdSpeed = this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    this.accel = damp(this.accel, clamp((this.fwdSpeed - fwdPrev) / dt, -25, 25), 8, dt);
    return this.events;
  }

  // take the into-the-wall part off the velocity for every contact (corners too)
  slide(ph, hit) {
    const C = ph.contacts;
    const k = C && ph.contactCount ? ph.contactCount : 0;
    if (!k) {
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (vn < 0) { this.vel.x -= hit.nx * vn; this.vel.z -= hit.nz * vn; }
      return;
    }
    for (let i = 0; i < k; i++) {
      const vn = this.vel.x * C[i].nx + this.vel.z * C[i].nz;
      if (vn < 0) { this.vel.x -= C[i].nx * vn; this.vel.z -= C[i].nz * vn; }
    }
  }
}
