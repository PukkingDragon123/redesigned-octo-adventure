// Tiny async scripting helpers for cutscenes.
import * as THREE from 'three';
import { VoxelCharacter } from './vchar.js';
import { Billboard } from '../render/sprites.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';
import { screenFade } from '../ui/leaves.js';

const v3 = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));
const _a = new THREE.Vector3(), _b = new THREE.Vector3();

// easings for camera moves (Scene.cam's o.ease takes these by name)
export const EASE = {
  inOut: (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2),
  glide: (k) => 0.5 - Math.cos(k * Math.PI) / 2, // a slow dolly: sine in-out
  out: (k) => 1 - Math.pow(1 - k, 3), // arrive and settle
  in: (k) => k * k * k, // gather speed and go
  whip: (k) => (k < 0.5 ? 16 * k ** 5 : 1 - Math.pow(-2 * k + 2, 5) / 2), // snap through the middle
  linear: (k) => k,
};

export class Scene {
  constructor(game) {
    this.g = game;
    this.temp = [];
    this.actors = [];
    this.emotes = [];
    this.tickers = [];
    this.skip = false;
    // the camera's see-through melts whatever stands between the lens and each shot's subject
    if (game.chase) {
      game.chase.scene = this;
      game.chase.subject = null;
    }
  }
  // run fn(dt) every frame until it returns true or the scene ends
  every(fn) {
    this.tickers.push(fn);
    return () => (this.tickers = this.tickers.filter((f) => f !== fn));
  }
  // animate k: 0 -> 1 over dur seconds with fn(k); instant when skipping
  anim(dur, fn, ease = (k) => k) {
    if (this.skip || dur <= 0) { fn(1); return Promise.resolve(); }
    return new Promise((res) => {
      let t = 0;
      this.every((dt) => {
        t += dt;
        const k = Math.min(1, t / dur);
        fn(ease(k));
        if (k >= 1) { res(); return true; }
        return false;
      });
    });
  }
  // a voxel model placed in the world for this scene only
  prop(res, x, z, { yaw = 0, scale = 1, y = null, parent = null } = {}) {
    const geo = meshVox(res.vox, { size: res.size, origin: res.origin, greedy: true });
    const m = voxMesh(geo, sharedVoxelMaterial());
    m.position.set(x, y ?? this.g.physics.groundAt(x, z).h, z);
    m.rotation.y = yaw;
    m.scale.setScalar(scale);
    (parent || this.g.scene).add(m);
    this.temp.push({ remove: () => { m.parent?.remove(m); geo.dispose(); } });
    return m;
  }
  update(dt) {
    const cam = this.g.camera.position;
    if (this.tickers.length) this.tickers = this.tickers.filter((f) => !f(dt));
    for (const a of this.actors) a.update(dt, cam);
    // a soft moonlight fill from the lens at night, so faces stay readable
    const night = this.g.world.atmosphere.sunDir.y < -0.05;
    if (night && !this.fill) this.fill = this.g.lightPool.addDynamic({ pos: cam.clone(), color: [0.42, 0.46, 0.62], radius: 10, intensity: 1 });
    if (!night && this.fill) {
      this.g.lightPool.removeDynamic(this.fill);
      this.fill = null;
    }
    if (this.fill) this.fill.pos.set(cam.x, cam.y + 0.8, cam.z);
    for (const e of this.emotes) {
      e.t += dt;
      const pop = e.t < 0.25 ? 1 + Math.sin((e.t / 0.25) * Math.PI) * 0.4 : 1;
      e.b.setScale(pop, pop);
      e.b.mesh.position.y = e.y + Math.sin(e.t * 3) * 0.05;
    }
  }
  get ui() {
    return this.g.ui;
  }
  wait(s) {
    if (this.skip) return Promise.resolve();
    return this.g.wait(s);
  }
  // short fades are autumn leaf wipes, long ones stay soft (see ui/leaves.js)
  async fade(to, dur = 0.6) {
    if (this.skip) dur = 0.01;
    await screenFade(this.g, to, dur);
  }
  // subject: who (or what point) the shot is about; whatever gets between them and the lens
  // melts away. Left out, the camera picks whoever is nearest the middle of the frame.
  // Every shot lives a little: once it holds, the lens creeps in (o.creep, a fraction of the
  // way to what it looks at) and floats a touch (o.breath, metres); o.roll is a dutch tilt,
  // o.ease an easing name (EASE) or function, o.path a curved move (see camera.js).
  cam(pos, look, dur = 0, fov = 50, subject = null, o = {}) {
    const c = this.g.chase;
    const opts = { creep: 0.04, breath: 0.012, ...o, ease: typeof o.ease === 'string' ? EASE[o.ease] : o.ease };
    if (dur <= 0 || this.skip) {
      if (opts.path) {
        // (a curved move cut short: straight to where it ends)
        opts.path(1, _a, _b);
        pos = _a.clone();
        look = _b.clone();
        opts.path = null;
      }
      c.cut(v3(pos), v3(look), fov, opts);
    } else c.move(v3(pos), v3(look), dur, fov, opts);
    c.subject = subject;
    return this.wait(dur);
  }

  // ------------------------------------------------------------ the shot vocabulary
  // (all cheap: a shot is a start, an end and an easing; the see-through melts what's
  // in the way, and clear() keeps the lens itself out of walls and out of the ground)
  // where a target's head is (an actor, a cat, or a point taken as the head)
  head(t) {
    if (t.isVector3) return t.clone();
    t.root?.updateMatrixWorld?.(true);
    if (t.headWorld) return t.headWorld(new THREE.Vector3());
    return new THREE.Vector3(t.pos.x, t.pos.y + 1.4, t.pos.z);
  }
  // the lens out of buildings (slid in towards what it looks at) and above the ground
  clear(pos, look, minUp = 0.25) {
    const ph = this.g.physics;
    // (a shot inside a building, Nana's cabin, is left be: the lens belongs in there)
    const indoors = ph.segmentHit(look.x, look.y, look.z, look.x, look.y, look.z, 0.05) < 1;
    if (!indoors && ph.segmentHit(pos.x, pos.y, pos.z, pos.x, pos.y, pos.z, 0.25) < 1) {
      const hit = ph.segmentHit(look.x, look.y, look.z, pos.x, pos.y, pos.z);
      if (hit < 1) pos.lerpVectors(look, pos, Math.max(0.15, hit - 0.08));
    }
    const gh = ph.groundAt(pos.x, pos.z, pos.y + 0.5).h;
    if (pos.y < gh + minUp) pos.y = gh + minUp;
    return pos;
  }
  // a dutch tilt on whatever the lens is doing (eases over dur)
  dutch(roll = 0.12, dur = 0.6) {
    const c = this.g.chase;
    c.move(c.pos, c.look, this.skip ? 0.01 : dur, c.fov, { roll, creep: 0.03, breath: 0.012 });
    return this.wait(dur);
  }
  // dolly straight in (k > 0) or back out (k < 0) along the line of sight, narrowing the lens a touch
  push(k = 0.3, dur = 2, fov = null, o = {}) {
    const c = this.g.chase;
    const pos = c.pos.clone().lerp(c.look, k);
    this.clear(pos, c.look);
    return this.cam(pos, c.look.clone(), dur, fov ?? c.fov * (1 - k * 0.25), c.subject, { ease: 'glide', roll: c.shotRoll, creep: 0.02, ...o });
  }
  // a fast whip pan to a new framing: the move snaps through the middle (and a whoosh)
  whip(pos, look, fov = 45, subject = null, o = {}) {
    this.sfx('whoosh', { volume: 0.35, pitch: 1.3 });
    return this.cam(pos, look, 0.32, fov, subject, { ease: 'whip', ...o });
  }
  // low on the ground looking up at someone (a hero shot); yaw: where round them the lens sits
  // (default: in front of them), tilt: a dutch roll
  low(a, { dist = 2.6, yaw = null, side = 0.35, h = 0.3, fov = 46, dur = 0, roll = 0, subject = a } = {}) {
    const p = a.isVector3 ? a : a.pos;
    const hd = this.head(a);
    const y = yaw ?? (a.targetYaw ?? a.yaw ?? 0);
    const fx = Math.sin(y), fz = Math.cos(y), rx = Math.cos(y), rz = -Math.sin(y);
    const pos = new THREE.Vector3(p.x + fx * dist + rx * side, 0, p.z + fz * dist + rz * side);
    pos.y = this.g.physics.groundAt(pos.x, pos.z, hd.y).h + h;
    const look = new THREE.Vector3(hd.x, hd.y - 0.05, hd.z);
    this.clear(pos, look, Math.min(h, 0.2));
    return this.cam(pos, look, dur, fov, subject, { roll });
  }
  // over the shoulder of `over`, onto `at`'s face (side: which shoulder, +1 their right)
  ots(over, at, { side = 1, back = 0.85, up = 0.2, fov = 38, dur = 0, roll = 0 } = {}) {
    const ho = this.head(over), ha = this.head(at);
    const d = new THREE.Vector3(ha.x - ho.x, 0, ha.z - ho.z);
    if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
    d.normalize();
    const r = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(side * 0.42);
    const pos = new THREE.Vector3(ho.x - d.x * back + r.x, ho.y + up, ho.z - d.z * back + r.z);
    const look = new THREE.Vector3(ha.x, ha.y - 0.15, ha.z);
    this.clear(pos, look);
    return this.cam(pos, look, dur, fov, at.isVector3 ? look : at, { roll });
  }
  // round a subject on an arc: from angle a0 to a1 (radians, world yaw of the lens about them),
  // at radius r and height h above their feet; the look stays on their chest/head (lookUp)
  orbit(t, { r = 4, h = 1.6, a0 = 0, a1 = Math.PI / 2, dur = 3, fov = 45, lookUp = 1.0, h1 = null, r1 = null, roll = 0, ease = 'glide', subject = t } = {}) {
    const P = t.isVector3 ? t : t.pos;
    const cx = P.x, cz = P.z, gy = P.y, ly = gy + lookUp;
    const ph = this.g.physics;
    // (shrink the arc while any of it would sit inside a building)
    for (let i = 0; i < 4; i++) {
      let inside = false;
      for (let s = 0; s <= 4 && !inside; s++) {
        const a = a0 + ((a1 - a0) * s) / 4, rr = r + ((r1 ?? r) - r) * (s / 4);
        const x = cx + Math.sin(a) * rr, z = cz + Math.cos(a) * rr, y = gy + h;
        inside = ph.segmentHit(x, y, z, x, y, z, 0.3) < 1;
      }
      if (!inside) break;
      r *= 0.75;
      if (r1 != null) r1 *= 0.75;
    }
    const path = (e, pos, look) => {
      const a = a0 + (a1 - a0) * e, rr = r + ((r1 ?? r) - r) * e, hh = h + ((h1 ?? h) - h) * e;
      pos.set(cx + Math.sin(a) * rr, 0, cz + Math.cos(a) * rr);
      pos.y = Math.max(gy + hh, ph.groundAt(pos.x, pos.z, gy + hh + 1).h + 0.3);
      look.set(cx, ly, cz);
    };
    // the arc starts where it starts (a cut to its first frame), then sweeps
    path(0, _a, _b);
    this.g.chase.cut(_a.clone(), _b.clone(), fov, { roll, creep: 0, breath: 0.01 });
    this.g.chase.subject = subject;
    return this.cam(_a, _b, dur, fov, subject, { path, ease, roll, creep: 0.02 });
  }
  // a crane: from low by the subject up and back over them (or down, when rise < 0) while the
  // look climbs from their feet to their head, a reveal of where they are
  crane(t, { yaw = 0, dist = 3.5, low = 0.5, high = 5, dur = 3.5, fov = 48, back = 1.8, lookUp = 1.0, roll = 0, subject = t } = {}) {
    const P = t.isVector3 ? t : t.pos;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const from = new THREE.Vector3(P.x + fx * dist, P.y + low, P.z + fz * dist);
    const to = new THREE.Vector3(P.x + fx * (dist + back), P.y + high, P.z + fz * (dist + back));
    const l0 = new THREE.Vector3(P.x, P.y + Math.min(lookUp, low + 0.4), P.z), l1 = new THREE.Vector3(P.x, P.y + lookUp * 0.6, P.z);
    this.clear(from, l0, 0.3);
    this.clear(to, l1, 0.3);
    this.g.chase.cut(from, l0, fov, { roll, breath: 0.01 });
    this.g.chase.subject = subject;
    return this.cam(to, l1, dur, fov, subject, { ease: 'glide', roll: 0, creep: 0.02 });
  }
  // a wide establishing shot of a place: high and back, drifting slowly sideways and down
  establish(center, { yaw = 0, dist = 18, high = 9, drop = 3, drift = 0.35, dur = 4, fov = 50, lookUp = 1.2 } = {}) {
    const c = center.isVector3 ? center : new THREE.Vector3(center.x, center.y ?? this.g.physics.groundAt(center.x, center.z).h, center.z);
    return this.orbit(c, { r: dist, h: high, h1: high - drop, a0: yaw - drift / 2, a1: yaw + drift / 2, dur, fov, lookUp, subject: c.clone().setY(c.y + lookUp) });
  }
  // a tight close-up on a face (a reaction)
  closeUp(a, o = {}) {
    return this.faceShot(a, { dist: 1.45, side: 0.35, up: 0.06, fov: 32, dur: 0, lookDown: 0.12, ...o });
  }
  // camera framing helper: look at an actor from an offset. The voxel cast holds up
  // well close to the lens, so shots sit a little tighter on their faces.
  frame(target, offset = [3, 1.6, 4], dur = 0, fov = 45, lookUp = 1.0) {
    const t = target.isVector3 ? target : target.pos;
    const k = 1.35;
    // aim a little low so the subject sits in the upper part of the frame, clear of the dialogue box
    const look = new THREE.Vector3(t.x, t.y + lookUp * 0.9 - 0.4, t.z);
    const pos = new THREE.Vector3(t.x + offset[0] * k, t.y + 0.6 + (offset[1] - 0.6) * k * 0.8, t.z + offset[2] * k);
    return this.cam(pos, look, dur, fov, target.isVector3 ? look : target);
  }
  // a front-on shot of an actor's face, whichever way they're facing.
  // side > 0 slides the lens to their left; dist is how far out in front.
  // roll: a dutch tilt; ease / creep as cam()
  faceShot(a, { dist = 2.3, side = 0.8, up = 0.12, dur = 0.8, fov = 40, lookDown = 0.22, roll = 0, ease, creep } = {}) {
    a.root?.updateMatrixWorld?.(true);
    const yaw = a.targetYaw ?? a.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const head = a.headWorld ? a.headWorld() : new THREE.Vector3(a.pos.x, a.pos.y + 1.4, a.pos.z);
    const pos = new THREE.Vector3(a.pos.x + fx * dist + rx * side, head.y + up, a.pos.z + fz * dist + rz * side);
    const look = new THREE.Vector3(head.x + rx * side * 0.2, head.y - lookDown, head.z + rz * side * 0.2);
    this.clear(pos, look);
    const o = { roll };
    if (ease) o.ease = ease;
    if (creep != null) o.creep = creep;
    return this.cam(pos, look, dur, fov, a.pos ? a : null, o);
  }
  async say(who, text, opts = {}) {
    if (this.skip && !opts.choices) return undefined;
    if (this.skip && opts.choices) return 0;
    const speaker = opts.actor;
    if (speaker) speaker.say(Math.min(4, text.length / 30));
    return this.ui.say(who, text, opts);
  }
  narrate(text, opts = {}) {
    return this.say(null, text, { name: '', ...opts });
  }
  actor(char, x, z, yaw = 0, anim = 'idle') {
    const a = new VoxelCharacter(this.g, char, { x, z, yaw, anim });
    a.scripted = true;
    this.temp.push(a);
    this.actors.push(a);
    return a;
  }
  emote(name, pos, seconds = 2) {
    const b = new Billboard(this.g.atlas, `emote:${name}`, { castShadow: false, lit: 0.3 });
    b.mesh.position.copy(pos);
    this.g.scene.add(b.mesh);
    const obj = { b, t: 0, y: pos.y };
    this.emotes.push(obj);
    const gone = () => {
      this.g.scene.remove(b.mesh);
      this.emotes = this.emotes.filter((e) => e !== obj);
    };
    this.temp.push({ remove: gone });
    this.g.wait(seconds).then(gone);
    return obj;
  }
  sfx(name, opts) {
    this.g.sound.play(name, opts);
  }
  music(m) {
    this.g.sound.music(m);
  }
  cleanup() {
    const c = this.g.chase;
    if (c?.scene === this) {
      c.scene = null;
      c.subject = null;
    }
    if (this.fill) this.g.lightPool.removeDynamic(this.fill);
    this.fill = null;
    for (const a of this.temp) a.remove();
    this.temp = [];
    this.actors = [];
    this.emotes = [];
    this.tickers = [];
  }
}
