// Harold's old 3-speed roadster. Arcade-y and a bit janky on purpose, but every
// move comes from input timing and balance: momentum and pedal rhythm, rubbery
// lean, tyres that let go when you corner too hard on loose ground, wheelies and
// manuals, stoppies and nose manuals, crouch-and-pop bunny hops, spins and flips,
// landings that have to match the slope, foot dabs, curb bumps and comic bails.
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle, Spring } from '../core/math.js';

const GRAV = 9.8;
const TAU = Math.PI * 2;

// Bessie's fixed specs. There are no upgrades: progression is riding skill (skills.js).
export const STATS = {
  topSpeed: 10.2, // m/s gearing limit in top gear; holding the pedal cruises ~8 m/s on a road, rhythm sprints ~9
  power: 3.6, // pedal acceleration from a standstill
  pedalPower: 8, // sustained effort (accel x speed): hills slow you right down
  gears: 3,
  grip: 1,
  jump: 4.3, // a perfectly timed bunny hop (m/s)
  capacity: 3, // two cups in the basket, one in the crate
  thermos: 1,
  light: true, // the lamp switches on by itself after dark
  bellType: 'bell',
  // legacy fields that older HUD code still reads
  boostCharges: 0,
  motor: false,
};
export const BASE_STATS = STATS;

// mu: sideways grip (fraction of g before the tyres let go); loose: how much it slides and wobbles
const SURF = {
  road: { roll: 0.2, grip: 10, mu: 0.95, top: 1, loose: 0 },
  street: { roll: 0.2, grip: 10, mu: 0.95, top: 1, loose: 0 },
  wood: { roll: 0.17, grip: 9, mu: 0.85, top: 1, loose: 0.15 },
  dirt: { roll: 0.42, grip: 7.5, mu: 0.68, top: 0.95, loose: 0.6 },
  sand: { roll: 1.4, grip: 5, mu: 0.5, top: 0.72, loose: 1 },
  grass: { roll: 0.85, grip: 6.2, mu: 0.56, top: 0.86, loose: 0.8 },
  snow: { roll: 1.1, grip: 3.2, mu: 0.32, top: 0.75, loose: 1 },
  water: { roll: 3.2, grip: 2.5, mu: 0.3, top: 0.4, loose: 1 },
};

// wheelie / stoppie balance (radians and rad/s^2)
const WB_POINT = 0.7; // front-up balance point (~40 degrees)
const WB_LOOP = 1.2; // past this Hank loops out onto his back
const ST_POINT = 0.72; // rear-up balance point
const ST_ENDO = 1.08; // past this he goes over the bars

export class Bike {
  constructor(physics) {
    this.ph = physics;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.stats = { ...STATS };
    this.events = [];
    this.t = 0;
    this.posing = 0; // set by Tricks while a mid-air pose is held
    this.reset(0, 0, 0);
  }

  reset(x, z, yaw) {
    const g = this.ph.groundAt(x, z);
    this.pos.set(x, g.h, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.yawRate = 0;
    this.grounded = true;
    this.airTime = 0;
    this.launchT = 9;
    this.lean = 0;
    this.leanVel = 0;
    this.pitch = 0; // visual nose-up pitch: slope + wheelie - stoppie on the ground, free in the air
    this.slopePitch = 0;
    this.wheelie = 0;
    this.wheelieVel = 0;
    this.wheelieT = 0;
    this.wheeliePedalT = 0;
    this.stoppie = 0;
    this.stoppieVel = 0;
    this.stoppieT = 0;
    this.stoppieBrakeT = 0;
    this.airPitch = 0;
    this.airPitchVel = 0;
    this.airFlip = 0;
    this.airSpin = 0;
    this.flipsDone = 0;
    this.spinsDone = 0;
    this.stopT = 0;
    this.crouchT = -1; // >= 0 while Space is held down on the ground
    this.jumpHeld = false;
    this.popT = 9;
    this.wheelAngle = 0;
    this.crank = 0;
    this.strokes = 0;
    this.gear = 1;
    this.cadence = 0;
    this.shiftTimer = 0;
    this.rhythm = 0; // 0..1, builds when the pedal is tapped in a steady rhythm
    this.lastTap = -9;
    this.tapIv = 0;
    this.tapDrive = 0;
    this.thrHeld = false;
    this.mash = 0;
    this.slipT = 0;
    this.drifting = false;
    this.driftTime = 0;
    this.driftDir = 0;
    this.boostTime = 0; // short speed burst (perfect landings, drift release)
    this.crash = 0;
    this.crashSpin = 0;
    this.crashKind = 'tumble';
    this.sinking = 0;
    this.slip = 0;
    this.slideT = 0;
    this.skidding = false;
    this.wobblePhase = 0;
    this.wobble = 0;
    this.shimmy = 0; // handlebar wobble for the model
    this.balance = 0; // wheelie/stoppie wobble for the model and rider
    this.dab = 0;
    this.dabSide = 1;
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
    this.perfectStreak = 0;
    this.takeoff = null;
    this.peakY = 0;
    this.roughT = 1;
  }

  forward(out = new THREE.Vector3()) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  gearTop(g = this.gear) {
    const s = this.stats;
    return s.topSpeed * (0.45 + 0.55 * (g / s.gears));
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  // c: { throttle, brake, steer, jump (held), drift, leanBack, leanFwd (0..1), assist }
  update(dt, c) {
    this.events.length = 0;
    this.t += dt;
    const s = this.stats;
    this.throttleIn = c.throttle;
    this.brakeIn = c.brake;
    this.steerIn = c.steer;
    this.squash.update(dt);
    this.popT += dt;
    if (this.crash > 0) return this.updateCrash(dt);
    if (this.sinking > 0) {
      this.sinking += dt;
      this.vel.multiplyScalar(Math.exp(-3 * dt));
      this.pos.y -= dt * 0.6;
      return;
    }
    const back = clamp(c.leanBack || 0, 0, 1), fwdL = clamp(c.leanFwd || 0, 0, 1);
    const assist = !!c.assist;
    const jumpDown = c.jump ?? c.jumpPressed;

    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const g0 = this.ph.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const surf = SURF[g0.water ? 'water' : g0.surface] || SURF.grass;
    this.surface = g0.water ? 'water' : g0.surface;
    let speed = Math.hypot(this.vel.x, this.vel.z);
    let fwdSpeed = this.vel.x * fx + this.vel.z * fz;

    this.pedalInput(dt, c);
    const thr = this.slipT > 0 ? 0 : Math.max(c.throttle, this.tapDrive > 0 ? 1 : 0);
    if (this.boostTime > 0) this.boostTime -= dt;

    if (this.grounded) {
      const n = this.normal.set(g0.nx, g0.ny, g0.nz);
      this.slopePitch = Math.atan2(-(fx * n.x + fz * n.z), n.y);
      // gravity along the slope: coast downhill, grind uphill
      const k = GRAV * n.y;
      this.vel.x += n.x * k * dt;
      this.vel.z += n.z * k * dt;

      // ---- pedalling (power-limited, a surge on every downstroke, rhythm sprints)
      const sprint = this.rhythm;
      const top = this.gearTop(s.gears) * surf.top * (1 + 0.13 * sprint);
      if (thr > 0 && fwdSpeed > -0.6 && this.stoppie < 0.05) {
        const v = Math.max(0, fwdSpeed);
        const effort = Math.min(s.power, (s.pedalPower * (1 + 0.32 * sprint)) / Math.max(v, 0.5));
        const curve = clamp(1 - Math.pow(v / top, 4), 0, 1);
        const hes = this.shiftTimer > 0 ? 0.35 : 1;
        const surge = 0.55 + 0.9 * Math.pow(Math.abs(Math.sin(this.crank)), 2);
        const a = effort * thr * curve * hes * surge * (this.wheelie > 0.1 ? 0.8 : 1);
        this.vel.x += fx * a * dt;
        this.vel.z += fz * a * dt;
      }
      // ---- speed burst (perfect landings, drift release)
      if (this.boostTime > 0 && fwdSpeed < top * 1.25) {
        this.vel.x += fx * 4.5 * dt;
        this.vel.z += fz * 4.5 * dt;
      }
      // ---- brakes & reverse (old rim brakes: they bite, slowly)
      if (c.brake > 0) {
        if (fwdSpeed > 0.5) {
          const dec = Math.min(speed, (this.stoppie > 0.1 ? 5.4 : this.wheelie > 0.1 ? 3 : 6.6) * (1 - surf.loose * 0.25) * c.brake * dt);
          if (speed > 1e-4) {
            this.vel.x -= (this.vel.x / speed) * dec;
            this.vel.z -= (this.vel.z / speed) * dec;
          }
          // a hard grab on loose ground locks the back wheel
          if (c.brake > 0.7 && speed > 4.5 && surf.loose > 0.3 && !this.skidding && this.stoppie < 0.1) {
            this.skidding = true;
            this.emit('skid', { speed });
          }
        } else if (fwdSpeed > -1.8 && (this.stopT += dt) > 0.35) {
          // stopped and still holding the brake: walk it backwards
          this.vel.x -= fx * 2.4 * c.brake * dt;
          this.vel.z -= fz * 2.4 * c.brake * dt;
        }
      }
      if (c.brake <= 0 || fwdSpeed > 0.5) this.stopT = 0;
      // rolling resistance + air drag
      speed = Math.hypot(this.vel.x, this.vel.z);
      const manualDrag = this.wheelie > 0.1 && thr <= 0 ? 1.4 : this.stoppie > 0.1 && c.brake <= 0 ? 1.6 : 1;
      const drag = surf.roll * manualDrag * (thr > 0 ? 0.7 : 1) + 0.0075 * speed * speed;
      if (speed > 1e-4) {
        const dec = Math.min(speed, drag * dt);
        this.vel.x -= (this.vel.x / speed) * dec;
        this.vel.z -= (this.vel.z / speed) * dec;
      }

      // ---- steering: the bars turn the bike, the bike leans (rubbery) into the turn
      speed = Math.hypot(this.vel.x, this.vel.z);
      fwdSpeed = this.vel.x * fx + this.vel.z * fz;
      const sp = Math.abs(fwdSpeed);
      const maxRate = lerp(2.3, 0.95, clamp(sp / 12, 0, 1));
      let target = -c.steer * maxRate * clamp(sp / 1.0, 0, 1) * (fwdSpeed < -0.2 ? -1 : 1);
      if (this.wheelie > 0.15) target *= 0.5;
      if (this.stoppie > 0.1) target *= 0.3;
      if (this.drifting) target = target * 1.3 - this.driftDir * 0.8;
      // at walking pace Hank dabs a foot and shuffles the bike round
      if (this.dab > 0.5) target = -c.steer * 1.3;
      this.yawRate = damp(this.yawRate, target, assist ? 8 : 6.5, dt);
      // handlebar chaos: wobbly when slow, on rough ground and after knocks
      this.wobblePhase += dt * (5 + sp * 0.5);
      const rough = surf.loose * 0.045 + 0.01;
      const slow = sp < 1.8 && sp > 0.15 && this.dab < 0.5 ? (1.8 - sp) * 0.14 : 0;
      const chaos = slow + rough * clamp(sp / 8, 0, 1.4) + this.wobble;
      const w = (Math.sin(this.wobblePhase * 1.7) + Math.sin(this.wobblePhase * 2.9) * 0.5) * chaos;
      this.shimmy = w;
      this.yawRate += w * dt * 40;
      this.wobble = Math.max(0, this.wobble - dt * 0.6);
      this.yaw += this.yawRate * dt;

      // ---- foot dab when it gets too slow to balance
      const wantDab = sp < 0.85 && thr <= 0 && this.wheelie < 0.1 && this.stoppie < 0.1;
      const was = this.dab;
      this.dab = damp(this.dab, wantDab ? 1 : 0, wantDab ? 9 : 6, dt);
      if (was < 0.5 && this.dab >= 0.5) {
        this.dabSide = this.lean > 0.02 ? 1 : this.lean < -0.02 ? -1 : -this.dabSide;
        this.emit('dab', { side: this.dabSide });
      }

      // ---- drift: Shift + steer at speed, release for a little kick
      if (!this.drifting && c.drift && sp > 4.5 && Math.abs(c.steer) > 0.25 && this.wheelie < 0.1 && this.stoppie < 0.1) {
        this.drifting = true;
        this.driftDir = Math.sign(c.steer);
        this.driftTime = 0;
        this.emit('driftStart');
      }
      if (this.drifting) {
        this.driftTime += dt;
        if (!c.drift || sp < 2.5) {
          this.drifting = false;
          if (this.driftTime > 0.9) {
            this.boostTime = Math.max(this.boostTime, 0.25 + Math.min(0.35, (this.driftTime - 0.9) * 0.2));
            this.emit('driftBoost', { level: this.driftTime > 2.2 ? 2 : 1 });
          }
          this.emit('driftEnd', { time: this.driftTime });
        }
      }

      // ---- grip: rotate velocity towards the heading; corner too hard and it slides
      const aLat = Math.abs(this.yawRate) * sp;
      const aMax = surf.mu * GRAV * s.grip * (this.wheelie > 0.15 ? 0.8 : 1);
      const over = this.drifting ? 0 : aLat / aMax;
      let grip = (this.drifting ? 1.5 : surf.grip) * s.grip;
      if (over > 1) {
        grip *= clamp(1 / (over * over * over), 0.12, 1);
        this.slideT += dt * (over - 1) * 2.5;
        this.wobble = Math.min(0.45, this.wobble + (over - 1) * dt * 1.2);
        if (!this.skidding && over > 1.12 && sp > 3) {
          this.skidding = true;
          this.emit('skid', { speed: sp });
        }
        if (this.slideT > 0.55 && surf.loose >= 0.5 && sp > 6.5 && !assist) {
          this.startCrash(sp, 'slideout');
          return;
        }
      } else {
        this.slideT = Math.max(0, this.slideT - dt * 2);
        if (this.skidding && over < 0.9 && !(c.brake > 0.7 && surf.loose > 0.3 && sp > 2)) this.skidding = false;
      }
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

      // ---- wheelie / manual and stoppie / nose manual
      this.updateBalance(dt, c, thr, back, fwdL, sp, surf, assist);
      if (this.crash > 0) return;

      // ---- bunny hop: hold to crouch, let go to pop
      if (jumpDown && !this.jumpHeld) this.crouchT = 0;
      if (this.crouchT >= 0) this.crouchT += dt;
      if (!jumpDown && this.jumpHeld && this.crouchT >= 0) {
        this.pop(this.crouchT, g0.platform?.kind === 'ramp');
        this.crouchT = -1;
      }
      if (!jumpDown) this.crouchT = -1;
      this.squash.target = this.crouchT >= 0 && this.grounded ? 0.84 : 1;
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
      this.launchT += dt;
      this.vel.y -= GRAV * dt;
      this.peakY = Math.max(this.peakY, this.pos.y);
      // a pop just after rolling off a lip still counts (and it's the best moment to pop)
      if (!jumpDown && this.jumpHeld && this.crouchT >= 0 && this.launchT < 0.14 && !this.takeoff?.hop) this.pop(this.crouchT, true, true);
      if (!jumpDown) this.crouchT = -1;
      else if (this.crouchT >= 0) this.crouchT += dt;
      this.squash.target = 1;
      // spins: A / D
      const spinIn = -c.steer;
      this.yawRate = damp(this.yawRate, spinIn * 6.4, Math.abs(spinIn) > 0.1 ? 6 : 5.5, dt);
      this.yaw += this.yawRate * dt;
      this.airSpin += this.yawRate * dt;
      // flips: lean back / forward
      const flipIn = back - fwdL;
      if (Math.abs(flipIn) > 0.05) this.airPitchVel = damp(this.airPitchVel, flipIn * 6.6, 5.5, dt);
      else {
        // no input: rotation bleeds off and the nose drifts towards the flight path
        this.airPitchVel = damp(this.airPitchVel, 0, assist ? 7 : 4.5, dt);
        const wrapped = wrapAngle(this.airPitch);
        if (Math.abs(wrapped) < 1.3) {
          const hs = Math.max(1, Math.hypot(this.vel.x, this.vel.z));
          const path = assist ? this.slopePitch * 0.5 : Math.atan2(this.vel.y, hs) * 0.35;
          this.airPitch += wrapAngle(path - wrapped) * (1 - Math.exp(-(assist ? 4 : 1.1) * dt));
        }
      }
      this.airPitch += this.airPitchVel * dt;
      this.airFlip += this.airPitchVel * dt;
      const nf = Math.floor((Math.abs(this.airFlip) + 0.9) / TAU);
      if (nf > this.flipsDone) {
        this.flipsDone = nf;
        this.emit('flip', { dir: this.airFlip > 0 ? 'back' : 'front', count: nf });
      }
      const ns = Math.floor((Math.abs(this.airSpin) + 0.45) / Math.PI);
      if (ns > this.spinsDone) {
        this.spinsDone = ns;
        this.emit('spin', { deg: ns * 180 });
      }
      this.wheelie = this.stoppie = 0;
      this.wheelieVel = this.stoppieVel = 0;
      this.dab = damp(this.dab, 0, 10, dt);
      this.shimmy = 0;
    }
    this.jumpHeld = !!jumpDown;

    // ---- integrate
    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.y += this.vel.y * dt;
    this.pos.z += this.vel.z * dt;

    // ---- solid collisions
    const hit = this.ph.resolve(this.pos, 0.42);
    if (hit) {
      const vn = this.vel.x * hit.nx + this.vel.z * hit.nz;
      const low = hit.obj.y1 != null && hit.obj.y1 - prevY < 0.5 && hit.obj.kind !== 'boundary';
      if (vn < 0) {
        const impact = -vn;
        if (low && this.grounded && impact > 1.5) {
          // rocks, logs and kerbs: ride up and over with a jolt (smoother with the front wheel up)
          this.grounded = false;
          this.airTime = 0;
          this.launchT = 0;
          this.vel.y = Math.min(3.2, 1.2 + impact * 0.3);
          this.vel.x *= this.wheelie > 0.2 ? 0.95 : 0.8;
          this.vel.z *= this.wheelie > 0.2 ? 0.95 : 0.8;
          this.pos.x -= hit.nx * hit.depth;
          this.pos.z -= hit.nz * hit.depth;
          this.beginAir(false);
          if (this.wheelie < 0.2) this.wobble = Math.min(0.5, this.wobble + 0.25);
          this.squash.value = 0.78;
          this.emit('bump', { size: 0.3, kind: hit.obj.kind });
        } else {
          this.vel.x -= hit.nx * vn * 1.35;
          this.vel.z -= hit.nz * vn * 1.35;
          if (impact > 6.6 && hit.obj.kind !== 'boundary') {
            this.startCrash(impact, 'wall');
            return;
          } else if (impact > 1.8) {
            this.wobble = Math.min(0.5, this.wobble + impact * 0.06);
            this.squash.value = Math.min(this.squash.value, 1 - impact * 0.03);
            this.emit('bonk', { impact, kind: hit.obj.kind, tree: hit.obj.tree });
          }
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
        this.launchT = 0;
        this.beginAir(false);
        this.emit('launch', { vy: this.vel.y });
      } else {
        const up = g1.h - this.pos.y;
        this.pos.y = g1.h;
        if (up > 0.05 && speed > 1.2) {
          this.kerb(up, speed, assist);
          if (this.crash > 0) return;
        } else this.roughGround(dt, surf, speed);
      }
    } else if (this.pos.y <= g1.h) {
      if (this.land(g1, assist)) return;
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
    const ratio = Math.max(0, fwdSpeed) / this.gearTop();
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    else if (ratio > 0.92 && this.gear < s.gears && thr > 0) {
      this.gear++;
      this.shiftTimer = 0.22;
      this.emit('gear', { dir: 1 });
    } else if (this.gear > 1 && ratio < 0.45) {
      this.gear--;
      this.shiftTimer = 0.12;
      this.emit('gear', { dir: -1 });
    }
    const cadTarget = this.grounded && thr > 0 ? clamp(0.4 + ratio * 0.75, 0, 1.25) * (1 + this.rhythm * 0.3) : this.slipT > 0 ? 1.6 : 0;
    this.cadence = damp(this.cadence, cadTarget, 6, dt);
    this.crank += this.cadence * 9.5 * dt;
    const st = Math.floor(this.crank / Math.PI);
    if (st !== this.strokes) {
      this.strokes = st;
      if (thr > 0 && this.grounded) this.emit('pedalStroke', { rhythm: this.rhythm, gear: this.gear });
    }
    this.wheelAngle += (fwdSpeed / 0.34) * dt * (this.stoppie > 0.1 ? 0.2 : 1);

    // ---- visual attitude: a rubbery spring lean, pitch from slope / balance / air
    const leanTarget = this.grounded
      ? clamp(Math.atan((-this.yawRate * clamp(Math.abs(fwdSpeed), 0, 14)) / GRAV) * 1.15, -0.72, 0.72) * (fwdSpeed < 0 ? -1 : 1) + (this.drifting ? -this.driftDir * 0.14 : 0) + this.dab * this.dabSide * 0.16 + this.balance * 0.35
      : clamp(c.steer * 0.15, -0.2, 0.2);
    this.leanVel += (95 * (leanTarget - this.lean) - 11 * this.leanVel) * dt;
    this.lean += this.leanVel * dt;
    if (this.grounded) this.pitch = damp(this.pitch, this.slopePitch + this.wheelie - this.stoppie, 30, dt);
    else this.pitch = this.airPitch;

    this.pose = this.pickPose(thr, c, fwdSpeed);
  }

  // Rhythm pedalling: tapping the pedal in a steady beat (2-4 taps a second) is a sprint;
  // holding it is a steady cruise; mashing like a maniac slips a foot off the pedal.
  pedalInput(dt, c) {
    const down = this.thrHeld ? c.throttle > 0.35 : c.throttle > 0.6;
    if (down && !this.thrHeld) {
      const iv = this.t - this.lastTap;
      this.lastTap = this.t;
      if (iv < 0.13) {
        if (++this.mash >= 3 && this.grounded && this.speed > 1 && this.slipT <= 0) {
          this.slipT = 0.55;
          this.rhythm = 0;
          this.mash = 0;
          this.emit('pedalSlip');
        }
      } else {
        this.mash = 0;
        if (iv >= 0.2 && iv <= 0.6) {
          const steady = this.tapIv >= 0.2 && this.tapIv <= 0.6 ? 1 - Math.min(1, Math.abs(iv - this.tapIv) / (this.tapIv * 0.4)) : 0.3;
          this.rhythm = clamp(this.rhythm + 0.08 + 0.2 * steady, 0, 1);
        } else this.rhythm *= 0.5;
      }
      this.tapIv = iv;
      this.tapDrive = 0.34;
    }
    this.thrHeld = down;
    this.tapDrive -= dt;
    this.slipT -= dt;
    // holding the pedal (or not pedalling) lets the rhythm fade
    if (this.t - this.lastTap > 0.62) this.rhythm = Math.max(0, this.rhythm - dt * 0.7);
  }

  pop(crouch, lip, late = false) {
    // quick taps give a little hop; a deliberate crouch (~0.3 s) gives the full pop
    let k = crouch < 0.08 ? 0.62 : crouch < 0.28 ? lerp(0.62, 1, (crouch - 0.08) / 0.2) : crouch < 0.45 ? 1 : Math.max(0.86, 1 - (crouch - 0.45) * 0.3);
    const perfect = crouch >= 0.26 && crouch <= 0.4;
    if (perfect) k *= 1.1;
    if (lip) k *= 1.18; // popping right at a ramp lip
    const vy = this.stats.jump * k * (this.inWater > 0.3 ? 0.6 : 1);
    if (late) this.vel.y += vy * 0.75;
    else this.vel.y = Math.max(this.vel.y, 0) + vy;
    if (!late) {
      this.grounded = false;
      this.airTime = 0;
      this.launchT = 9;
      this.beginAir(true);
    }
    if (this.takeoff) {
      this.takeoff.hop = true;
      this.takeoff.ramp = !!lip;
    }
    // a crouch-and-pop with the front lifted carries the wheelie into the air
    this.airPitch += 0.12;
    this.airPitchVel += 0.6;
    this.squash.value = 1.32;
    this.squash.vel = 0;
    this.squash.target = 1;
    this.popT = 0;
    this.emit('jump', { power: k, perfect, lip: !!lip });
  }

  beginAir(hop) {
    this.airPitch = this.pitch;
    this.airPitchVel = (this.wheelieVel - this.stoppieVel) * 0.4;
    this.airFlip = 0;
    this.airSpin = 0;
    this.flipsDone = this.spinsDone = 0;
    this.drifting = false;
    this.takeoff = { x: this.pos.x, z: this.pos.z, y: this.pos.y, hop, wheelie: this.wheelie, ramp: false };
    this.peakY = this.pos.y;
  }

  // ---- wheelie / manual (front up) and stoppie / nose manual (back up): inverted pendulums
  updateBalance(dt, c, thr, back, fwdL, sp, surf, assist) {
    const pedalling = thr > 0.3;
    const t = this.t;
    const noise = (Math.sin(t * 7.3) + Math.sin(t * 13.1 + 1.3) * 0.6 + Math.sin(t * 3.1 + 0.4) * 0.5) * (1 + surf.loose * 0.8);
    // front wheel up
    if (this.stoppie <= 0.001 && (this.fwdSpeed > 0.6 || this.wheelie > 0)) {
      let th = this.wheelie, om = this.wheelieVel;
      // pedal-power wheelie, or a manual (weight shift only) with enough speed
      const L = back * (pedalling ? 10.5 : sp > 2.5 ? 9.4 : 0) * (1 - th / 1.6);
      let tau = L - 9 * Math.sin(WB_POINT - th) + (pedalling && th > 0.05 ? 0.8 : 0);
      if (th > 0.02) {
        // a gentle hand near the balance point (stronger with assists), wobble that grows the longer you hold it
        const zone = Math.abs(th - WB_POINT) < 0.2 ? (assist ? 9 : 3) : assist ? 4 : 0;
        tau += zone * (WB_POINT - 0.06 - th);
        tau += noise * (1.4 + Math.min(1.6, this.wheelieT * 0.1));
        tau -= c.brake * 15; // tap the back brake to stop a loop-out
        tau -= fwdL * 8;
      }
      om += (tau - 3.6 * om) * dt;
      th += om * dt;
      if (th <= 0) {
        if (this.wheelie > 0.02 && om < -2.4) {
          this.squash.value = Math.min(this.squash.value, clamp(1 + om * 0.04, 0.72, 1));
          this.emit('frontSlam', { power: -om });
        }
        th = 0;
        om = Math.max(0, om);
      }
      this.wheelie = th;
      this.wheelieVel = om;
      if (th > WB_LOOP) {
        this.startCrash(Math.max(3, sp), 'loopout');
        return;
      }
    } else if (this.wheelie > 0) {
      this.wheelie = Math.max(0, this.wheelie - dt * 3);
      this.wheelieVel = 0;
    }
    const inW = this.wheelie > 0.12;
    if (inW && this.wheelieT === 0) this.emit('wheelieStart', { manual: !pedalling });
    if (inW) {
      this.wheelieT += dt;
      if (pedalling) this.wheeliePedalT += dt;
    } else if (this.wheelieT > 0 && this.wheelie < 0.04) {
      this.emit('wheelieEnd', { time: this.wheelieT, manual: this.wheeliePedalT < this.wheelieT * 0.15 });
      this.wheelieT = this.wheeliePedalT = 0;
    }

    // back wheel up
    if (this.wheelie <= 0.001 && (this.fwdSpeed > 0.5 || this.stoppie > 0)) {
      let th = this.stoppie, om = this.stoppieVel;
      const braking = c.brake > 0.2;
      const decel = braking ? clamp(this.fwdSpeed / 3, 0, 1.4) * c.brake : 0;
      const L = fwdL * (braking && this.fwdSpeed > 0.5 ? 7 + decel * 6 : sp > 3.2 ? 8.6 : 0) * (1 - th / 1.5);
      let tau = L - 8 * Math.sin(ST_POINT - th);
      if (th > 0.02) {
        const zone = Math.abs(th - ST_POINT) < 0.18 ? (assist ? 8 : 2.5) : assist ? 3 : 0;
        tau += zone * (ST_POINT - 0.08 - th);
        tau += noise * (1.1 + Math.min(1.4, this.stoppieT * 0.12));
        tau -= back * 9;
        if (braking && fwdL < 0.05) tau -= 2;
      }
      om += (tau - 3.2 * om) * dt;
      th += om * dt;
      if (th <= 0) {
        if (this.stoppie > 0.02 && om < -2.4) {
          this.squash.value = Math.min(this.squash.value, clamp(1 + om * 0.04, 0.74, 1));
          this.emit('rearSlam', { power: -om });
        }
        th = 0;
        om = Math.max(0, om);
      }
      this.stoppie = th;
      this.stoppieVel = om;
      if (th > ST_ENDO) {
        this.startCrash(Math.max(4, sp), 'endo');
        return;
      }
    } else if (this.stoppie > 0) {
      this.stoppie = Math.max(0, this.stoppie - dt * 3);
      this.stoppieVel = 0;
    }
    const inS = this.stoppie > 0.1;
    if (inS && this.stoppieT === 0) this.emit('stoppieStart', { nose: c.brake < 0.2 });
    if (inS) {
      this.stoppieT += dt;
      if (c.brake > 0.2) this.stoppieBrakeT += dt;
    } else if (this.stoppieT > 0 && this.stoppie < 0.04) {
      this.emit('stoppieEnd', { time: this.stoppieT, nose: this.stoppieBrakeT < this.stoppieT * 0.2 });
      this.stoppieT = this.stoppieBrakeT = 0;
    }
    // the wobble you see on the bike and rider while balancing
    this.balance = inW || inS ? noise * 0.05 * (inW ? 1 : 0.7) : this.balance * 0.9;
  }

  // a kerb, step or platform edge under the front wheel
  kerb(up, speed, assist) {
    const lifted = this.wheelie > 0.25;
    if (up > 0.45 && speed > 7.5 && !lifted && !assist) {
      this.startCrash(speed * 0.8, 'kerb');
      return;
    }
    const k = Math.min(1, speed / 6);
    this.squash.value = Math.min(this.squash.value, 1 - Math.min(0.3, up * (lifted ? 0.4 : 1.2)));
    if (!lifted) {
      this.wobble = Math.min(0.5, this.wobble + up * 0.9 * k);
      const loss = 1 - Math.min(0.3, up * 0.8);
      this.vel.x *= loss;
      this.vel.z *= loss;
    }
    if (up > 0.16 && speed > 3) {
      this.grounded = false;
      this.airTime = 0;
      this.launchT = 9;
      this.vel.y = Math.min(3, up * 7) * k;
      this.beginAir(false);
    }
    this.emit('bump', { size: up, lifted });
  }

  // roots, stones and ruts on dirt and grass
  roughGround(dt, surf, speed) {
    if (surf.loose < 0.5 || speed < 3) return;
    this.roughT -= dt * speed;
    if (this.roughT > 0) return;
    this.roughT = 1.5 + Math.abs(Math.sin(this.pos.x * 12.9898 + this.pos.z * 78.233) * 43758.5) % 4;
    const size = 0.04 + (speed / 10) * 0.05 * surf.loose;
    this.squash.value = Math.min(this.squash.value, 1 - size * 1.6);
    if (this.wheelie < 0.2) this.wobble = Math.min(0.4, this.wobble + size * 0.8);
    this.emit('bump', { size, rough: true });
  }

  // touchdown: returns true if it turned into a bail
  land(g1, assist) {
    const n = this.normal.set(g1.nx, g1.ny, g1.nz);
    const vn = this.vel.x * n.x + this.vel.y * n.y + this.vel.z * n.z;
    const impact = -vn;
    const airTime = this.airTime;
    this.pos.y = g1.h;
    this.vel.x -= n.x * vn;
    this.vel.y -= n.y * vn;
    this.vel.z -= n.z * vn;
    this.grounded = true;
    this.crouchT = -1;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    const slope = Math.atan2(-(fx * n.x + fz * n.z), n.y);
    this.slopePitch = slope;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    // pitch error (+ = nose high, rear wheel first) and heading vs travel
    const pe = wrapAngle(this.airPitch - slope);
    let mis = 0, fakie = false;
    if (hs > 2) {
      const va = Math.atan2(this.vel.x, this.vel.z);
      mis = Math.abs(wrapAngle(this.yaw - va));
      if (mis > Math.PI - 0.7) {
        fakie = true;
        mis = Math.PI - mis;
      }
    }
    const tol = assist ? 1.5 : 1;
    const flips = Math.round(this.airFlip / TAU);
    const spinDeg = Math.round(Math.abs(this.airSpin) / Math.PI) * 180;
    let why = null;
    if (this.posing > 0.25) why = 'trick';
    else if (impact > (assist ? 14.5 : 12.5)) why = 'flat';
    else if (pe > 0.78 * tol) why = 'looped';
    else if (pe < -0.52 * tol) why = 'nose';
    else if (mis > 0.95 * tol && hs > 3.5) why = 'sideways';
    else if (fakie && hs > 6.5 && !assist) why = 'fakie';
    if (why) {
      this.startCrash(Math.max(impact, 5), why);
      return true;
    }
    const sketchy = Math.abs(pe) > 0.3 * tol || mis > 0.35 * tol || fakie || impact > 10.5;
    const perfect = !sketchy && Math.abs(pe) < 0.16 * tol && mis < 0.18 * tol && airTime > 0.45;
    if (fakie) {
      // landed backwards: skid round to face the way you're going
      this.yaw = Math.atan2(this.vel.x, this.vel.z);
      this.yawRate = 0;
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
      this.skidding = true;
      this.emit('skid', { speed: hs });
    } else if (mis > 0.3) {
      // straighten out after a crooked landing (bleeds speed)
      const k = clamp((mis - 0.3) * 0.5, 0, 0.5);
      this.vel.x *= 1 - k;
      this.vel.z *= 1 - k;
      this.wobble = Math.min(0.6, this.wobble + mis * 0.3);
    }
    if (sketchy) {
      this.perfectStreak = 0;
      const k = clamp((Math.abs(pe) - 0.3) * 0.6, 0, 0.3);
      this.vel.x *= 1 - k;
      this.vel.z *= 1 - k;
      this.wobble = Math.min(0.6, this.wobble + 0.25);
      this.emit('sketchyLand', { pitch: pe, mis, impact });
    }
    // land nose-high and you roll away in a manual; nose-low and you're on the front wheel
    if (pe > 0.06) {
      this.wheelie = Math.min(pe, WB_POINT);
      this.wheelieVel = Math.min(0, this.airPitchVel * 0.3) - 1;
    } else if (pe < -0.06) {
      this.stoppie = Math.min(-pe, 0.4);
      this.stoppieVel = -1;
    }
    this.squash.value = clamp(1 - impact * 0.05, 0.55, 1);
    this.squash.vel = 0;
    const T = this.takeoff;
    const dist = T ? Math.hypot(this.pos.x - T.x, this.pos.z - T.z) : 0;
    const height = T ? Math.max(0, this.peakY - T.y) : 0;
    if (perfect) {
      this.perfectStreak++;
      this.boostTime = Math.max(this.boostTime, 0.45);
      this.emit('perfectLand', { streak: this.perfectStreak, airTime });
    }
    const wheelieDrop = !!(T && !T.hop && T.wheelie > 0.25 && pe > 0.04 && pe < 0.65 && airTime > 0.25);
    this.emit('land', { impact, airTime, dist, height, hop: !!T?.hop, ramp: !!T?.ramp, flips, spin: spinDeg, perfect, sketchy, fakie, wheelieDrop });
    this.airTime = 0;
    this.airFlip = this.airSpin = 0;
    this.takeoff = null;
    return false;
  }

  pickPose(thr, c, fwdSpeed) {
    if (this.crouchT >= 0 && this.grounded) return 'crouch';
    if (!this.grounded) return this.popT < 0.18 ? 'pop' : Math.abs(this.airPitchVel) > 2.5 ? 'flip' : 'air';
    if (this.wheelie > 0.12) return thr > 0.3 ? 'wheelie' : 'manual';
    if (this.stoppie > 0.08) return c.brake > 0.2 ? 'stoppie' : 'nose';
    if (this.slipT > 0) return 'slip';
    if (this.dab > 0.5) return 'dab';
    if (this.drifting) return 'drift';
    if (c.brake > 0 && fwdSpeed > 1) return 'brake';
    if (thr > 0 && (this.rhythm > 0.45 || this.slopePitch > 0.1 || fwdSpeed < 2)) return 'stand';
    if (thr > 0) return 'pedal';
    return this.speed > 0.5 ? 'coast' : 'idle';
  }

  startCrash(impact, why) {
    const soft = impact < 6.5 && ['loopout', 'endo', 'slideout', 'nose', 'looped', 'sideways', 'fakie', 'trick', 'kerb'].includes(why);
    this.crashKind = why === 'loopout' || why === 'looped' ? 'loopout' : why === 'endo' || why === 'nose' || why === 'kerb' ? 'endo' : 'tumble';
    this.crash = soft ? 1.5 : 1.9;
    this.crashT = 0;
    this.crashImpact = impact;
    this.crashSpin = (Math.random() < 0.5 ? -1 : 1) * (4 + impact * 0.4);
    this.crashPitch = this.pitch;
    this.drifting = false;
    this.skidding = false;
    this.grounded = true;
    this.wheelie = this.stoppie = this.wheelieVel = this.stoppieVel = 0;
    this.wheelieT = this.stoppieT = this.wheeliePedalT = this.stoppieBrakeT = 0;
    this.crouchT = -1;
    this.perfectStreak = 0;
    this.takeoff = null;
    this.airTime = 0;
    const g = this.ph.groundAt(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y = g.h;
    this.vel.y = 0;
    this.vel.x *= 0.45;
    this.vel.z *= 0.45;
    this.emit('bail', { why, impact, soft, kind: this.crashKind });
    this.emit('crash', { impact, why, soft, kind: this.crashKind });
  }

  updateCrash(dt) {
    this.crash -= dt;
    this.crashT = (this.crashT || 0) + dt;
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
    this.rhythm = 0;
    this.pose = 'crash';
    this.lean = damp(this.lean, 1.4 * Math.sign(this.crashSpin), 10, dt);
    this.leanVel = 0;
    // loop-outs tip over backwards, endos pitch over the front wheel
    const k = Math.min(1, this.crashT / 0.35);
    const pk = this.crashKind === 'loopout' ? 1.5 : this.crashKind === 'endo' ? -1.2 : 0;
    this.pitch = lerp(this.crashPitch, pk, k) * (this.crashT > 0.45 ? Math.max(0, 1 - (this.crashT - 0.45) * 3) : 1);
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
