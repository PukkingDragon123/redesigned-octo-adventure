// Tiny async scripting helpers for cutscenes.
import * as THREE from 'three';
import { VoxelCharacter } from './vchar.js';
import { Billboard } from '../render/sprites.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

const v3 = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

export class Scene {
  constructor(game) {
    this.g = game;
    this.temp = [];
    this.actors = [];
    this.emotes = [];
    this.tickers = [];
    this.skip = false;
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
  async fade(to, dur = 0.6) {
    if (this.skip) dur = 0.01;
    await this.g.tween(this.g.pipeline.post.uFade, 'value', to, dur);
  }
  cam(pos, look, dur = 0, fov = 50) {
    const c = this.g.chase;
    if (dur <= 0 || this.skip) c.cut(v3(pos), v3(look), fov);
    else c.move(v3(pos), v3(look), dur, fov);
    return this.wait(dur);
  }
  // camera framing helper: look at an actor from an offset. The voxel cast holds up
  // well close to the lens, so shots sit a little tighter on their faces.
  frame(target, offset = [3, 1.6, 4], dur = 0, fov = 45, lookUp = 1.0) {
    const t = target.isVector3 ? target : target.pos;
    const k = 1.35;
    // aim a little low so the subject sits in the upper part of the frame, clear of the dialogue box
    const look = new THREE.Vector3(t.x, t.y + lookUp * 0.9 - 0.4, t.z);
    const pos = new THREE.Vector3(t.x + offset[0] * k, t.y + 0.6 + (offset[1] - 0.6) * k * 0.8, t.z + offset[2] * k);
    return this.cam(pos, look, dur, fov);
  }
  // a front-on shot of an actor's face, whichever way they're facing.
  // side > 0 slides the lens to their left; dist is how far out in front.
  faceShot(a, { dist = 2.3, side = 0.8, up = 0.12, dur = 0.8, fov = 40, lookDown = 0.22 } = {}) {
    a.root?.updateMatrixWorld?.(true);
    const yaw = a.targetYaw ?? a.yaw;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const head = a.headWorld ? a.headWorld() : new THREE.Vector3(a.pos.x, a.pos.y + 1.4, a.pos.z);
    const pos = new THREE.Vector3(a.pos.x + fx * dist + rx * side, head.y + up, a.pos.z + fz * dist + rz * side);
    const look = new THREE.Vector3(head.x + rx * side * 0.2, head.y - lookDown, head.z + rz * side * 0.2);
    return this.cam(pos, look, dur, fov);
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
    if (this.fill) this.g.lightPool.removeDynamic(this.fill);
    this.fill = null;
    for (const a of this.temp) a.remove();
    this.temp = [];
    this.actors = [];
    this.emotes = [];
    this.tickers = [];
  }
}
