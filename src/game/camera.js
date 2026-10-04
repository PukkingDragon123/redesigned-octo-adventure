// Chase camera with springy lag, speed FOV, look-ahead, shake, anime punch-ins, and cinematic shots.
// It sits well back so the road ahead reads, follows a smoothed ride height (bumps don't bob it),
// leans the boom with the slope, eases in past walls quickly and back out slowly.
// It follows on critically damped springs (no jerk when Hank stops dead against a wall or
// sets off), tracks the bike's interpolated pose (bike.view) so it glides at any frame rate,
// and eases the player's orbit (mouse, stick, a thumb dragged on the screen) instead of
// jumping with every pointer event.
// Whatever gets between the lens and Hank (or a cutscene shot's subject) dissolves in a
// ring around him with a glowing ember edge (render/shaderlib.js SEE_GLSL; updateSee drives
// it), so walls, roofs, trees, fences and villagers never block the view; the boom only
// slides in when the camera would end up inside a building.
import * as THREE from 'three';
import { clamp, damp, angleDamp, lerp, wrapAngle, easeInOut } from '../core/math.js';
import { input } from '../core/input.js';
import { G } from '../render/shaderlib.js';
import { LIVE } from './vchar.js';

// player zoom (mouse wheel, pinch): distance factor range, log scale
const ZOOM_MIN = Math.log(0.42), ZOOM_MAX = Math.log(2.4);

const _v = new THREE.Vector3();
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _f = new THREE.Vector3();

// critically damped spring step (no overshoot): moves s.x towards target, s.v is its speed.
// omega ~ 2x the rate of an equivalent damp(); returns the new value.
function spring(s, k, target, omega, dt) {
  const x = omega * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = s[k] - target;
  const tmp = (s.v[k] + omega * ch) * dt;
  s.v[k] = (s.v[k] - omega * tmp) * e;
  s[k] = target + (ch + tmp) * e;
  return s[k];
}

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
    this.kick = 0; // FOV punch (degrees): negative zooms in on a big moment, positive widens
    this.kickVel = 0;
    this.lift = 0;
    this.ahead = new THREE.Vector3(); // smoothed look-ahead offset along the travel direction
    this.by = null; // smoothed ride height
    this.boom = 1; // fraction of the boom left after walls pull it in
    this.zoomT = 0; // player zoom target (log of the distance factor)
    this.zoomS = 0; // ...smoothed
    this.orbitYawT = 0; // player orbit targets (the orbit eases towards them)
    this.orbitPitchT = 0;
    // spring states for the camera position and the look point
    this.sp = { x: 0, y: 0, z: 0, v: { x: 0, y: 0, z: 0 } };
    this.sl = { x: 0, y: 0, z: 0, v: { x: 0, y: 0, z: 0 } };
    // see-through: a cutscene's running Scene (cutscene.js sets it) and its shot's subject
    // (a character, a point, or null: the character nearest the middle of the frame)
    this.scene = null;
    this.subject = null;
    this.see = { k: 0, who: null, focus: new THREE.Vector3(), last: new THREE.Vector3(), floor: -1e5, rad: 1.25, gap: 0.75, wide: 0.3 };
  }

  snap(bike) {
    this.yaw = bike.yaw;
    this.update(0, bike, { x: 0, y: 0 }, true);
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a * 0.75);
  }

  // a springy FOV kick for impact frames, flips and perfect landings
  punch(deg) {
    deg *= 0.55; // kept subtle: a nudge, not a lurch
    this.kick = Math.abs(deg) > Math.abs(this.kick) ? deg : this.kick + deg * 0.3;
    this.kickVel = 0;
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
    this.subject = null;
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
      this.updateSee(dt, bike);
      this.apply(dt);
      return;
    }
    const speed = bike.speed;
    // the bike is drawn between physics steps; follow what's drawn
    const BP = bike.view ? bike.view.pos : bike.pos;
    const byaw = bike.view ? bike.view.yaw : bike.yaw;
    // player zoom: wheel / pinch, eased so it glides
    this.zoomT = clamp(this.zoomT + input.takeZoom(), ZOOM_MIN, ZOOM_MAX);
    this.zoomS = instant ? this.zoomT : damp(this.zoomS, this.zoomT, 8, dt);
    const zf = Math.exp(this.zoomS);
    // user orbit (mouse drag / right stick / a dragged thumb), eased, drifts back when idle
    if (Math.abs(lookIn.x) + Math.abs(lookIn.y) > 0.001) {
      this.orbitYawT = clamp(this.orbitYawT - lookIn.x * 2.2, -Math.PI, Math.PI);
      this.orbitPitchT = clamp(this.orbitPitchT + lookIn.y * 1.2, -0.25, 0.7);
      this.orbitIdle = 0;
    } else {
      this.orbitIdle += dt;
      if (this.orbitIdle > 3) {
        this.orbitYawT = damp(this.orbitYawT, 0, 2.2, dt);
        this.orbitPitchT = damp(this.orbitPitchT, 0, 2.2, dt);
      }
    }
    // (something else may have set the orbit directly)
    if (this._oy !== undefined && this.orbitYaw !== this._oy) this.orbitYawT = this.orbitYaw;
    if (this._op !== undefined && this.orbitPitch !== this._op) this.orbitPitchT = this.orbitPitch;
    this.orbitYaw = instant ? this.orbitYawT : damp(this.orbitYaw, this.orbitYawT, 16, dt);
    this.orbitPitch = instant ? this.orbitPitchT : damp(this.orbitPitch, this.orbitPitchT, 16, dt);
    this._oy = this.orbitYaw;
    this._op = this.orbitPitch;
    // follow the heading, partly the velocity when drifting/sliding
    let want = byaw;
    let rate = bike.grounded ? 2.8 : 1.5;
    if (speed > 2) {
      const va = Math.atan2(bike.vel.x, bike.vel.z);
      const backwards = bike.fwdSpeed < -0.5;
      want = backwards ? byaw : byaw + wrapAngle(va - byaw) * (bike.drifting ? 0.55 : 0.3);
      // in the air follow the flight, not the spinning bike
      if (!bike.grounded && !this.walk && bike.airTime > 0.1) want = va;
    }
    if (bike.crash > 0) want = this.yaw;
    if (this.walk) {
      // on foot the camera swings round behind Hank lazily, more the faster he goes, and not
      // at all while he walks towards it (no whirling round when he comes back to the camera)
      want = byaw;
      const toward = Math.cos(wrapAngle(byaw - this.yaw));
      rate = 1.1 * clamp(speed / 2.6, 0, 1.4) * clamp(toward + 0.35, 0, 1);
    }
    this.yaw = instant ? want : angleDamp(this.yaw, want, rate, dt);
    const yaw = this.yaw + this.orbitYaw;
    const walk = this.walk ? 1 : 0;
    const sp = clamp(speed, 0, 25);
    const grounded = bike.grounded ?? true;
    // ride height, smoothed so rough ground and kerbs don't bob the view
    if (this.by == null || instant) this.by = BP.y;
    else this.by = damp(this.by, BP.y, grounded ? 5 : 2.6, dt);
    if (Math.abs(this.by - BP.y) > 3) this.by = BP.y;
    const by = this.by;
    // slope: downhill lifts the boom to see down the hill, uphill lowers it and looks up the road
    const slope = walk ? 0 : clamp(bike.slopePitch || 0, -0.4, 0.4);
    const ds = this.distScale;
    // wide by default: well back and up, so the village and the road ahead read
    const dist = (10.5 + sp * 0.1 - walk * 2.2) * ds * zf;
    // a wheelie or stoppie lifts the boom a touch so the whole bike stays in frame
    this.lift = damp(this.lift, walk ? 0 : clamp((bike.wheelie || 0) + (bike.stoppie || 0), 0, 1) * 0.5, 4, dt);
    const hgt = (4.9 + sp * 0.03 - walk * 1.0) * (0.55 + ds * 0.45) * Math.pow(zf, 0.95) + this.orbitPitch * 3 * Math.sqrt(zf) + this.lift - Math.sin(slope) * dist * 0.45;
    // look ahead along the way Hank is actually travelling
    const la = clamp(speed * 0.16, 0, 2.8) * (walk ? 0.4 : 1);
    let dx = Math.sin(this.yaw), dz = Math.cos(this.yaw);
    if (speed > 1 && bike.vel && !(bike.fwdSpeed < -0.5)) {
      dx = bike.vel.x / speed;
      dz = bike.vel.z / speed;
    }
    if (instant) this.ahead.set(dx * la, 0, dz * la);
    else {
      this.ahead.x = damp(this.ahead.x, dx * la, 2.2, dt);
      this.ahead.z = damp(this.ahead.z, dz * la, 2.2, dt);
    }
    const target = _t.set(BP.x + this.ahead.x, by + 1.0 + Math.min(0.6, (zf - 1) * 0.4 + 0.3) + Math.sin(slope) * (la + 2) * 0.55, BP.z + this.ahead.z);
    const desired = _v.set(BP.x - Math.sin(yaw) * dist, by + hgt, BP.z - Math.cos(yaw) * dist);
    // keep above ground
    const gh = this.ph.groundAt(desired.x, desired.z, desired.y).h;
    desired.y = Math.max(desired.y, gh + 1.1);
    // ...and out of buildings. A wall between Hank and the camera melts away (updateSee), so the
    // boom only slides in (softly) when the camera itself would be inside a building, and
    // eases back out once it's clear
    const hit = this.ph.segmentHit(target.x, target.y, target.z, desired.x, desired.y, desired.z);
    const inside = hit < 1 && this.ph.segmentHit(desired.x, desired.y, desired.z, desired.x, desired.y, desired.z, 0.5) < 1;
    const boomT = inside ? Math.max(0.2, hit - 0.05) : 1;
    this.boom = instant ? boomT : damp(this.boom, boomT, boomT < this.boom ? 7 : 1.6, dt);
    if (this.boom < 0.999) desired.lerpVectors(target, desired, this.boom);
    const SP = this.sp, SL = this.sl;
    // a cut, a teleport or a long hitch: jump rather than swoop across the map
    if (!instant && (this.pos.distanceToSquared(desired) > 6400 || dt > 0.25)) instant = true;
    if (instant) {
      this.pos.copy(desired);
      this.look.copy(target);
      SP.v.x = SP.v.y = SP.v.z = SL.v.x = SL.v.y = SL.v.z = 0;
    } else if (dt > 0) {
      // the springs pick up from wherever the camera is (cuts and shots move it too)
      SP.x = this.pos.x; SP.y = this.pos.y; SP.z = this.pos.z;
      SL.x = this.look.x; SL.y = this.look.y; SL.z = this.look.z;
      // omega = 2x the old damp rates: the same trailing distance at a steady speed
      const k = grounded ? 11 : 8;
      this.pos.x = spring(SP, 'x', desired.x, k, dt);
      this.pos.z = spring(SP, 'z', desired.z, k, dt);
      this.pos.y = spring(SP, 'y', desired.y, grounded ? 8 : 5, dt);
      this.look.x = spring(SL, 'x', target.x, 18, dt);
      this.look.y = spring(SL, 'y', target.y, grounded ? 12 : 7, dt);
      this.look.z = spring(SL, 'z', target.z, 18, dt);
    }
    const gh2 = this.ph.groundAt(this.pos.x, this.pos.z, this.pos.y).h;
    this.pos.y = Math.max(this.pos.y, gh2 + 0.7);
    // the damped position can lag into a wall too (just behind one is fine: it melts away)
    const P = this.pos;
    if (this.ph.segmentHit(P.x, P.y, P.z, P.x, P.y, P.z, 0.2) < 1) {
      const hit2 = this.ph.segmentHit(this.look.x, this.look.y, this.look.z, P.x, P.y, P.z);
      if (hit2 < 1) P.lerpVectors(this.look, P, Math.max(0.2, hit2 - 0.05));
    }
    // upright phones get a taller field of view so the road ahead still fits
    const aspect = this.cam.aspect || 1.6;
    const base = aspect < 1 ? Math.min(80, 55 / Math.pow(aspect, 0.55)) : 55;
    const fovT = (base + clamp(speed - 4, 0, 22) * 0.5 + (bike.boostTime > 0 ? 4 : 0)) * (this.zoom ?? 1);
    this.fov = instant ? fovT : damp(this.fov, fovT, 3, dt);
    // the punch springs back with a little overshoot
    this.kickVel += (-90 * this.kick - 9 * this.kickVel) * dt;
    this.kick += this.kickVel * dt;
    if (instant) this.kick = this.kickVel = 0;
    this.roll = damp(this.roll, (bike.lean || 0) * 0.06, 3, dt);
    this.updateSee(dt, bike);
    this.apply(dt);
  }

  // ---- see-through: open the dissolve ring between the lens and the focus (render/shaderlib.js)
  // Riding or walking it's Hank; in a cutscene the shot's subject (who the shot was framed on,
  // else whoever is nearest the middle of the frame, a speaker first), and whoever shares the
  // shot with them stays solid. The ring opens over a moment after every cut or new subject
  // (the walls melt away rather than pop) and widens into a tunnel towards the lens when a
  // building is in the way, so its near wall goes entirely.
  updateSee(dt, player) {
    const S = this.see, cam = this.pos;
    let have = false, who = null, floor = -1e5, rad = 1.25, gap = 0.75, bubble = 0.9;
    const f = _f;
    if (this.mode === 'chase' || !this.scene) {
      const P = player?.view ? player.view.pos : player?.pos;
      if (P) {
        f.set(P.x, P.y + (this.walk ? 0.95 : 1.15), P.z);
        floor = P.y + 0.15;
        // (a shot outside a cutscene, indoors or on the title, only when he's in it)
        have = this.mode === 'chase' || this.inView(f, 30);
      }
    } else {
      rad = 0.9;
      gap = 1.0;
      bubble = 0.55;
      let s = this.subject;
      if (s && !s.isVector3 && (s.visible === false || (s.root && !s.root.parent) || !s.pos)) s = null;
      if (!s) s = this.pickSubject();
      if (s?.isVector3) {
        f.copy(s);
        floor = s.y - 1.1;
        have = true;
      } else if (s) {
        // a character: its chest (a cat or a critter: just above its back)
        who = s;
        const y = s.pos.y + (s.yOffset || 0), P = s.P;
        f.set(s.pos.x, y + (P ? P.hipH + P.torsoH * 0.45 + (s.hop || 0) : 0.4), s.pos.z);
        floor = y + 0.12;
        have = true;
      }
    }
    // who shares the shot stays solid (in a cutscene); in play anyone may melt (never Hank)
    const scene = this.mode !== 'chase' && !!this.scene && have;
    for (const ch of LIVE) ch.setSeeThrough(!(scene && ch === who) && !(scene && Math.hypot(ch.pos.x - f.x, ch.pos.z - f.z) < 1.5));
    // a cut, a jump or a new subject: close the ring and let it open again
    if (have && (who !== S.who || S.last.distanceToSquared(cam) > 4 || S.focus.distanceToSquared(f) > 9)) S.k = 0;
    S.who = who;
    S.last.copy(cam);
    S.k = have ? Math.min(1, S.k + dt / 0.3) : Math.max(0, S.k - dt / 0.2);
    // the lens inside a building (Nana's cabin, or pressed into a wall): its walls are seen
    // from inside (culled), so only the near plane needs clearing
    const indoors = this.ph.segmentHit(cam.x, cam.y, cam.z, cam.x, cam.y, cam.z, 0.05) < 1;
    if (indoors) bubble = 0.3;
    let wide = 0.3;
    if (have) {
      S.focus.copy(f);
      S.floor = floor;
      S.rad = rad;
      S.gap = gap;
      // a building between them (not one they're both in): a tunnel through its near wall
      const hit = indoors ? 1 : this.ph.segmentHit(f.x, f.y, f.z, cam.x, cam.y, cam.z, 0.2);
      if (hit > 0.001 && hit < 1) wide = 2.4;
    }
    S.wide = damp(S.wide, wide, 6, dt);
    const e = S.k * S.k * (3 - 2 * S.k);
    G.uSee.value.set(S.focus.x, S.focus.y, S.focus.z, e);
    G.uSeeP.value.set(S.rad, S.gap, bubble, S.floor);
    G.uSeeCamR.value = S.wide;
  }
  // the character a cutscene shot is looking at: nearest the middle of the frame (someone
  // talking counts a little nearer), not too far off it
  pickSubject() {
    const cam = this.pos;
    const d = _d.subVectors(this.look, cam).normalize();
    let best = null, bs = 0.3;
    for (const ch of LIVE) {
      if (!ch.visible || !ch.root.parent) continue;
      const x = ch.pos.x - cam.x, y = ch.pos.y + ch.P.hipH + 0.3 - cam.y, z = ch.pos.z - cam.z;
      const along = x * d.x + y * d.y + z * d.z;
      if (along < 0.6 || along > 28) continue;
      const sc = (Math.sqrt(Math.max(0, x * x + y * y + z * z - along * along)) / along) * (ch.talking > 0 ? 0.6 : 1);
      if (sc < bs) { bs = sc; best = ch; }
    }
    return best;
  }
  inView(p, maxD) {
    const cam = this.pos;
    const d = _d.subVectors(this.look, cam).normalize();
    const x = p.x - cam.x, y = p.y - cam.y, z = p.z - cam.z;
    const along = x * d.x + y * d.y + z * d.z;
    if (along < 0.5 || along > maxD) return false;
    return Math.sqrt(Math.max(0, x * x + y * y + z * z - along * along)) / along < Math.tan((this.fov * Math.PI) / 360);
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
    const fov = this.mode === 'chase' ? this.fov + this.kick : this.fov;
    if (Math.abs(c.fov - fov) > 0.01) {
      c.fov = fov;
      c.updateProjectionMatrix();
    }
  }
}
