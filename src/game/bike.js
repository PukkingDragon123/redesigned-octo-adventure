// Arcade bicycle physics: smooth but slightly chaotic.
// Gears, hills, drifting, crest launches, bunny hops, gliding, cola boosts, crashes.
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle, Spring } from '../core/math.js';

const GRAV = 9.8;

export const BASE_STATS = {
  topSpeed: 9.2, // m/s in top gear (~33 km/h)
  power: 4.4, // pedal acceleration
  gears: 3,
  grip: 1,
  jump: 4.1,
  suspension: 0, // softer, safer landings
  boostCharges: 0,
  glider: false,
  capacity: 2,
  thermos: 1,
  light: false,
  bellType: 'bell',
  motor: false,
  lids: false,
};

const SURF = {
  road: { roll: 0.22, grip: 11, top: 1 },
  street: { roll: 0.2, grip: 11, top: 1 },
  wood: { roll: 0.18, grip: 10, top: 1 },
  dirt: { roll: 0.42, grip: 8.5, top: 0.95 },
  grass: { roll: 0.95, grip: 6.5, top: 0.82 },
  snow: { roll: 1.1, grip: 3.2, top: 0.75 },
  water: { roll: 3.2, grip: 2.5, top: 0.4 },
};

export class Bike {
  constructor(physics) {
    this.ph = physics;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.stats = { ...BASE_STATS };
    this.events = [];
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw, keepCharges = true) {
    const g = this.ph.groundAt(x, z);
    this.pos.set(x, g.h, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.yawRate = 0;
    this.grounded = true;
    this.airTime = 0;
    this.lean = 0;
    this.pitch = 0;
    this.wheelAngle = 0;
    this.crank = 0;
    this.gear = 1;
    this.cadence = 0;
    this.shiftTimer = 0;
    this.drifting = false;
    this.driftTime = 0;
    this.driftDir = 0;
    this.boostTime = 0;
    if (!keepCharges) this.boostCharges = this.stats.boostCharges;
    this.boostCharges ??= this.stats.boostCharges;
    this.gliding = false;
    this.crash = 0;
    this.crashSpin = 0;
    this.sinking = 0;
    this.slip = 0;
    this.wobblePhase = 0;
    this.wobble = 0;
    this.squash = new Spring(1, 300, 13);
    this.surface = g.surface;
    this.speed = 0;
    this.fwdSpeed = 0;
    this.lastSafe = { x, z, yaw };
    this.safeTimer = 0;
    this.throttleIn = 0;
    this.brakeIn = 0;
    this.steerIn = 0;
    this.pose = 'ride';
    this.inWater = 0;
    this.splashTimer = 0;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  gearTop(g = this.gear) {
    const s = this.stats;
    return s.topSpeed * (0.42 + 0.58 * (g / s.gears));
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  update(dt, c) {
    this.events.length = 0;
    const s = this.stats;
    this.throttleIn = c.throttle;
    this.brakeIn = c.brake;
    this.steerIn = c.steer;
    this.squash.update(dt);
    if (this.crash > 0) return this.updateCrash(dt);
    if (this.sinking > 0) {
      this.sinking += dt;
      this.vel.multiplyScalar(Math.exp(-3 * dt));
      this.pos.y -= dt * 0.6;
      return;
    }

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const g0 = this.ph.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const surf = SURF[g0.water ? 'water' : g0.surface] || SURF.grass;
    this.surface = g0.water ? 'water' : g0.surface;
    let speed = Math.hypot(this.vel.x, this.vel.z);
    let fwdSpeed = this.vel.x * fx + this.vel.z * fz;

    // ---- boost
    if (c.boostPressed && this.boostTime <= 0) {
      if (this.boostCharges > 0) {
        this.boostCharges--;
        this.boostTime = s.motor ? 2.2 : 1.7;
        this.emit('boost');
      } else this.emit('noBoost');
    }
    if (this.boostTime > 0) this.boostTime -= dt;

    if (this.grounded) {
      const n = this.normal.set(g0.nx, g0.ny, g0.nz);
      // gravity along the slope
      const k = GRAV * n.y;
      this.vel.x += n.x * k * dt * 0.9;
      this.vel.z += n.z * k * dt * 0.9;

      // pedalling / engine
      const top = (s.motor ? s.topSpeed : this.gearTop(s.gears)) * surf.top * (this.boostTime > 0 ? 1.55 : 1);
      if (c.throttle > 0 && fwdSpeed > -0.6) {
        const curve = clamp(1 - Math.pow(Math.max(0, fwdSpeed) / top, 2), 0, 1);
        const hes = this.shiftTimer > 0 ? 0.45 : 1;
        const a = s.power * c.throttle * curve * hes * (fwdSpeed < 3 ? 1.25 : 1);
        this.vel.x += fx * a * dt;
        this.vel.z += fz * a * dt;
      }
      if (this.boostTime > 0) {
        const a = s.motor ? 7 : 8.5;
        this.vel.x += fx * a * dt;
        this.vel.z += fz * a * dt;
      }
      // brakes & reverse
      if (c.brake > 0) {
        if (fwdSpeed > 0.5) {
          const dec = Math.min(speed, 10.5 * c.brake * dt);
          if (speed > 1e-4) {
            this.vel.x -= (this.vel.x / speed) * dec;
            this.vel.z -= (this.vel.z / speed) * dec;
          }
        } else if (fwdSpeed > -2.2) {
          this.vel.x -= fx * 3.2 * c.brake * dt;
          this.vel.z -= fz * 3.2 * c.brake * dt;
        }
      }
      // rolling resistance + air drag
      speed = Math.hypot(this.vel.x, this.vel.z);
      const drag = surf.roll * (c.throttle > 0 ? 0.6 : 1) + 0.011 * speed * speed;
      if (speed > 1e-4) {
        const dec = Math.min(speed, drag * dt);
        this.vel.x -= (this.vel.x / speed) * dec;
        this.vel.z -= (this.vel.z / speed) * dec;
      }

      // ---- steering
      speed = Math.hypot(this.vel.x, this.vel.z);
      fwdSpeed = this.vel.x * fx + this.vel.z * fz;
      const sp = Math.abs(fwdSpeed);
      const maxRate = lerp(2.5, s.motor ? 0.85 : 1.05, clamp(sp / (s.motor ? 22 : 14), 0, 1));
      let target = -c.steer * maxRate * clamp(sp / 1.2, 0, 1) * (fwdSpeed < -0.2 ? -1 : 1);
      if (this.drifting) target = target * 1.35 - this.driftDir * 0.75;
      this.yawRate = damp(this.yawRate, target, 9, dt);
      // a little handlebar chaos: wobbly at low speed and on rough ground
      this.wobblePhase += dt * (5 + sp * 0.5);
      const rough = this.surface === 'grass' || this.surface === 'dirt' ? 0.05 : 0.012;
      const chaos = (sp < 2.2 && sp > 0.2 ? (2.2 - sp) * 0.09 : 0) + rough * clamp(sp / 8, 0, 1.4) + this.wobble;
      this.yawRate += (Math.sin(this.wobblePhase * 1.7) + Math.sin(this.wobblePhase * 2.9) * 0.5) * chaos;
      this.wobble = Math.max(0, this.wobble - dt * 0.6);
      this.yaw += this.yawRate * dt;

      // ---- drift start/stop
      if (!this.drifting && c.drift && sp > 4.5 && Math.abs(c.steer) > 0.25) {
        this.drifting = true;
        this.driftDir = Math.sign(c.steer);
        this.driftTime = 0;
        this.emit('driftStart');
      }
      if (this.drifting) {
        this.driftTime += dt;
        if (!c.drift || sp < 2.5) {
          this.drifting = false;
          if (this.driftTime > 0.85) {
            this.boostTime = Math.max(this.boostTime, 0.35 + Math.min(0.5, (this.driftTime - 0.85) * 0.3));
            this.emit('driftBoost', { level: this.driftTime > 2 ? 2 : 1 });
          }
          this.emit('driftEnd');
        }
      }

      // ---- grip: rotate velocity towards the heading
      const grip = (this.drifting ? 1.5 : surf.grip) * s.grip;
      if (speed > 0.08) {
        let va = Math.atan2(this.vel.x, this.vel.z);
        const tgt = fwdSpeed >= 0 ? this.yaw : this.yaw + Math.PI;
        const slip = wrapAngle(tgt - va);
        va += slip * (1 - Math.exp(-grip * dt));
        const scrub = 1 - Math.min(0.5, Math.abs(Math.sin(slip)) * (this.drifting ? 0.55 : 1.2) * dt);
        const sp2 = speed * scrub;
        this.vel.x = Math.sin(va) * sp2;
        this.vel.z = Math.cos(va) * sp2;
        this.slip = slip;
      } else this.slip = 0;

      // stay on the ground plane
      this.vel.y = -(n.x * this.vel.x + n.z * this.vel.z) / Math.max(0.3, n.y);

      // ---- jump
      if (c.jumpPressed) {
        this.vel.y = Math.max(this.vel.y, 0) + s.jump * (s.motor ? 0.9 : 1);
        this.grounded = false;
        this.airTime = 0;
        this.squash.value = 0.7;
        this.emit('jump');
      }
      // ---- water
      if (g0.water) {
        const depth = -g0.h;
        this.inWater = depth;
        const sp3 = Math.hypot(this.vel.x, this.vel.z);
        this.vel.x *= Math.exp(-1.6 * dt);
        this.vel.z *= Math.exp(-1.6 * dt);
        this.splashTimer -= dt;
        if (this.splashTimer <= 0 && sp3 > 1) {
          this.splashTimer = 0.18;
          this.emit('splash', { big: false });
        }
        if (depth > 0.8) {
          this.sinking = 0.001;
          this.emit('sink');
        }
      } else this.inWater = 0;
    } else {
      // ---- airborne
      this.airTime += dt;
      let gScale = 1;
      if (s.glider && c.jump && this.vel.y < 0.5 && this.airTime > 0.25) {
        if (!this.gliding) this.emit('glideStart');
        this.gliding = true;
        gScale = 0.16;
        this.vel.y = Math.max(this.vel.y, -1.6);
        // gentle lift keeps the forward speed up
        const hs = Math.hypot(this.vel.x, this.vel.z);
        const want = Math.max(hs, 9);
        const va = Math.atan2(this.vel.x, this.vel.z);
        const nva = va + wrapAngle(this.yaw - va) * (1 - Math.exp(-2.5 * dt));
        const nhs = damp(hs, want, 0.6, dt);
        this.vel.x = Math.sin(nva) * nhs;
        this.vel.z = Math.cos(nva) * nhs;
      } else {
        if (this.gliding) this.emit('glideEnd');
        this.gliding = false;
      }
      this.vel.y -= GRAV * gScale * dt;
      // air control (spins!)
      this.yawRate = damp(this.yawRate, -c.steer * (this.gliding ? 1.4 : 2.8), 5, dt);
      this.yaw += this.yawRate * dt;
      if (this.boostTime > 0) {
        this.vel.x += fx * 6 * dt;
        this.vel.z += fz * 6 * dt;
      }
    }

    // ---- integrate
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // ---- solid collisions
    const hit = this.ph.resolve(this.pos, 0.42);
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      if (vn < 0) {
        const impact = -vn;
        this.vel.x -= hit.nx * vn * 1.35;
        this.vel.z -= hit.nz * vn * 1.35;
        if (impact > (s.motor ? 9 : 7.2) && hit.obj.kind !== 'boundary') {
          this.startCrash(impact, 'wall');
          return;
        } else if (impact > 1.8) {
          this.wobble = Math.min(0.5, this.wobble + impact * 0.05);
          this.emit('bonk', { impact, kind: hit.obj.kind, tree: hit.obj.tree });
        }
      }
    }

    // ---- ground contact
    const g1 = this.ph.groundAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.grounded) {
      const gap = this.pos.y - g1.h;
      if (gap > 0.14 && this.vel.y > -6) {
        // the ground fell away (crest, ramp lip, ledge)
        this.grounded = false;
        this.airTime = 0;
        this.emit('launch', { vy: this.vel.y });
      } else {
        this.pos.y = g1.h;
      }
    } else if (this.pos.y <= g1.h) {
      // landing
      const n = this.normal.set(g1.nx, g1.ny, g1.nz);
      const vn = this.vel.x * n.x + this.vel.y * n.y + this.vel.z * n.z;
      const impact = -vn;
      this.pos.y = g1.h;
      this.vel.x -= n.x * vn;
      this.vel.y -= n.y * vn;
      this.vel.z -= n.z * vn;
      this.grounded = true;
      this.gliding = false;
      const hs = Math.hypot(this.vel.x, this.vel.z);
      let mis = 0;
      if (hs > 2) {
        const va = Math.atan2(this.vel.x, this.vel.z);
        mis = Math.abs(wrapAngle(this.yaw - va));
        mis = Math.min(mis, Math.abs(wrapAngle(this.yaw + Math.PI - va)) + (hs > 4 ? 0.8 : 0));
      }
      const limit = (s.motor ? 13 : 10.5) + s.suspension * 3;
      if (impact > limit || (mis > 1.25 && hs > 5)) {
        this.startCrash(impact, 'landing');
        return;
      }
      // straighten out after a slightly crooked landing (bleeds speed)
      if (mis > 0.3) {
        const k = clamp((mis - 0.3) * 0.4, 0, 0.6);
        this.vel.x *= 1 - k;
        this.vel.z *= 1 - k;
        this.wobble = Math.min(0.6, this.wobble + mis * 0.25);
      }
      this.squash.value = clamp(1 - impact * (0.05 - s.suspension * 0.012), 0.55, 1);
      this.squash.vel = 0;
      this.emit('land', { impact, airTime: this.airTime });
      this.airTime = 0;
    }
    if (this.grounded) this.normal.set(g1.nx, g1.ny, g1.nz);

    // ---- bookkeeping
    speed = Math.hypot(this.vel.x, this.vel.z);
    fwdSpeed = this.vel.x * Math.sin(this.yaw) + this.vel.z * Math.cos(this.yaw);
    this.speed = speed;
    this.fwdSpeed = fwdSpeed;
    this.safeTimer += dt;
    if (this.grounded && !g1.water && g1.h > 0.4 && this.safeTimer > 0.5 && (g1.surface === 'road' || g1.platform)) {
      this.safeTimer = 0;
      this.lastSafe = { x: this.pos.x, z: this.pos.z, yaw: this.yaw };
    }

    // gears: automatic, with a derailleur hiccup
    if (!s.motor) {
      const ratio = Math.max(0, fwdSpeed) / this.gearTop();
      if (this.shiftTimer > 0) this.shiftTimer -= dt;
      else if (ratio > 0.9 && this.gear < s.gears && c.throttle > 0) {
        this.gear++;
        this.shiftTimer = 0.2;
        this.emit('gear', { dir: 1 });
      } else if (this.gear > 1 && ratio < 0.42) {
        this.gear--;
        this.shiftTimer = 0.12;
        this.emit('gear', { dir: -1 });
      }
      const cadTarget = this.grounded && c.throttle > 0 ? clamp(0.35 + ratio * 0.75, 0, 1.2) : 0;
      this.cadence = damp(this.cadence, cadTarget, 6, dt);
      this.crank += this.cadence * 9.5 * dt;
    } else {
      this.gear = Math.min(4, 1 + Math.floor(fwdSpeed / (s.topSpeed / 4)));
      this.cadence = damp(this.cadence, 0.25 + 0.75 * clamp(fwdSpeed / s.topSpeed, 0, 1) * (0.5 + 0.5 * c.throttle), 4, dt);
    }
    this.wheelAngle += (fwdSpeed / 0.34) * dt;

    // visual attitude
    const leanTarget = this.grounded ? clamp(-this.yawRate * clamp(Math.abs(fwdSpeed), 0, 14) * 0.065, -0.62, 0.62) * (fwdSpeed < 0 ? -1 : 1) : this.lean * 0.98;
    this.lean = damp(this.lean, leanTarget + (this.drifting ? -this.driftDir * 0.12 : 0), 8, dt);
    let pitchT = 0;
    if (this.grounded) {
      // slope along the heading
      const f = this.forward(_f);
      pitchT = -Math.atan2(f.x * this.normal.x + f.z * this.normal.z, this.normal.y);
      if (c.throttle > 0.5 && fwdSpeed < 2.5 && this.boostTime <= 0) pitchT -= 0.0;
    } else {
      const hs = Math.max(1, Math.hypot(this.vel.x, this.vel.z));
      pitchT = clamp(-Math.atan2(this.vel.y, hs) * 0.6, -0.6, 0.6);
    }
    this.pitch = damp(this.pitch, pitchT, this.grounded ? 14 : 4, dt);

    // rider pose
    if (!this.grounded) this.pose = this.gliding ? 'glide' : 'air';
    else if (this.drifting) this.pose = 'drift';
    else if (c.brake > 0 && fwdSpeed > 1) this.pose = 'brake';
    else if (c.throttle > 0 && (this.pitch < -0.12 || fwdSpeed < 2)) this.pose = 'stand';
    else if (c.throttle > 0) this.pose = 'pedal';
    else this.pose = speed > 0.5 ? 'coast' : 'idle';
  }

  startCrash(impact, why) {
    this.crash = 1.9;
    this.crashImpact = impact;
    this.crashSpin = (Math.random() < 0.5 ? -1 : 1) * (4 + impact * 0.4);
    this.drifting = false;
    this.gliding = false;
    this.grounded = true;
    const g = this.ph.groundAt(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y = g.h;
    this.vel.y = 0;
    this.vel.x *= 0.45;
    this.vel.z *= 0.45;
    this.emit('crash', { impact, why });
  }

  updateCrash(dt) {
    this.crash -= dt;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 1e-3) {
      const dec = Math.min(sp, 6 * dt);
      this.vel.x -= (this.vel.x / sp) * dec;
      this.vel.z -= (this.vel.z / sp) * dec;
    }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.ph.resolve(this.pos, 0.42);
    const g = this.ph.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5);
    this.pos.y = g.h;
    this.speed = sp;
    this.fwdSpeed = 0;
    this.cadence = 0;
    this.pose = 'crash';
    this.lean = damp(this.lean, 1.4 * Math.sign(this.crashSpin), 10, dt);
    if (this.crash <= 0) {
      this.crash = 0;
      this.vel.set(0, 0, 0);
      this.lean = 0;
      this.pitch = 0;
      this.yawRate = 0;
      this.squash.value = 0.6;
      this.emit('reassemble');
      // if we crashed in deep water, pop back to the last safe spot
      if (g.water && -g.h > 0.6) {
        this.reset(this.lastSafe.x, this.lastSafe.z, this.lastSafe.yaw);
      }
    }
  }
}

const _f = new THREE.Vector3();
