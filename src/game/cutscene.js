// Tiny async scripting helpers for cutscenes.
import * as THREE from 'three';
import { Actor } from './actor.js';
import { Billboard } from '../render/sprites.js';

const v3 = (a) => (a.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

export class Scene {
  constructor(game) {
    this.g = game;
    this.temp = [];
    this.skip = false;
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
  // camera framing helper: look at an actor from an offset
  frame(target, offset = [3, 1.6, 4], dur = 0, fov = 45, lookUp = 1.0) {
    const t = target.isVector3 ? target : target.pos;
    const look = new THREE.Vector3(t.x, t.y + lookUp, t.z);
    const pos = new THREE.Vector3(t.x + offset[0], t.y + offset[1], t.z + offset[2]);
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
    const a = new Actor(this.g, char, { x, z, yaw, anim });
    a.scripted = true;
    this.temp.push(a);
    return a;
  }
  emote(name, pos, seconds = 2) {
    const b = new Billboard(this.g.atlas, `emote:${name}`, { castShadow: false, lit: 0.3 });
    b.mesh.position.copy(pos);
    this.g.scene.add(b.mesh);
    const obj = { b, until: this.g.time + seconds };
    this.temp.push({ remove: () => this.g.scene.remove(b.mesh) });
    this.g.wait(seconds).then(() => this.g.scene.remove(b.mesh));
    return obj;
  }
  sfx(name, opts) {
    this.g.sound.play(name, opts);
  }
  music(m) {
    this.g.sound.music(m);
  }
  cleanup() {
    for (const a of this.temp) a.remove();
    this.temp = [];
  }
}
