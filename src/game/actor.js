// Animated 2D characters in the 3D world: view selection, squash & stretch,
// emotes, walking along paths, talking. Plus the rider sitting on the bike.
import * as THREE from 'three';
import { Billboard, pickView } from '../render/sprites.js';
import { frameName } from '../art/sheets.js';
import { damp, angleDamp, Spring, clamp } from '../core/math.js';

const ANIM_FPS = { idle: 2, walk: 8, talk: 7, wave: 4, scared: 8, cheer: 5, sip: 1.5, shiver: 12, crawl: 3, eat: 3, aim: 10, gun: 2, float: 2, lantern: 2, 'walk+lantern': 8, 'walk+hold': 8, 'walk+shiver': 8, knit: 4, hockey: 3, handsup: 6 };

export class Actor {
  constructor(game, charId, { x = 0, z = 0, yaw = 0, anim = 'idle', shadow = true } = {}) {
    this.game = game;
    this.char = charId;
    this.atlas = game.atlas;
    this.bb = new Billboard(this.atlas, null, { castShadow: shadow });
    this.mesh = this.bb.mesh;
    this.pos = new THREE.Vector3(x, 0, z);
    this.yaw = yaw;
    this.targetYaw = yaw;
    this.anim = anim;
    this.expr = 'neutral';
    this.t = Math.random() * 3;
    this.frameIdx = 0;
    this.squash = new Spring(1, 220, 11);
    this.hop = 0;
    this.hopV = 0;
    this.path = null;
    this.speed = 1.4;
    this.emote = null;
    this.emoteT = 0;
    this.talking = 0;
    this.visible = true;
    this.lockView = null;
    this.blinkT = 2 + Math.random() * 3;
    this.floatY = 0;
    this.yOffset = 0;
    this.groundSnap = true;
    game.scene.add(this.mesh);
    this.snapGround();
  }

  snapGround() {
    if (!this.groundSnap) return;
    const g = this.game.physics.groundAt(this.pos.x, this.pos.z, this.pos.y + 1.5);
    this.pos.y = g.h;
  }

  play(anim, expr) {
    if (anim !== this.anim) {
      this.anim = anim;
      this.t = 0;
    }
    if (expr) this.expr = expr;
    return this;
  }
  face(yaw) {
    this.targetYaw = yaw;
    return this;
  }
  faceTowards(x, z) {
    this.targetYaw = Math.atan2(x - this.pos.x, z - this.pos.z);
    return this;
  }
  say(seconds = 2) {
    this.talking = seconds;
  }
  bounce(amount = 0.7) {
    this.squash.value = amount;
    this.squash.vel = 0;
  }
  jump(v = 3) {
    this.hopV = v;
    this.squash.value = 1.25;
  }
  showEmote(name, seconds = 2) {
    if (!this.emote) {
      this.emote = new Billboard(this.atlas, `emote:${name}`, { castShadow: false, lit: 0.3, upright: 0.5 });
      this.game.scene.add(this.emote.mesh);
    } else this.emote.setFrame(`emote:${name}`);
    this.emoteName = name;
    this.emoteT = seconds;
    this.emotePop = 0;
  }
  walkTo(points, speed = 1.4, anim = 'walk') {
    this.path = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], 0, p[1])));
    this.speed = speed;
    this.walkAnim = anim;
    return new Promise((res) => (this.onArrive = res));
  }
  remove() {
    this.game.scene.remove(this.mesh);
    if (this.emote) this.game.scene.remove(this.emote.mesh);
  }

  frameFor(view) {
    const A = this.atlas;
    let anim = this.anim;
    if (this.talking > 0 && (anim === 'idle')) anim = 'talk';
    const fps = ANIM_FPS[anim] ?? 3;
    let n = 1;
    while (A.get(frameName(this.char, anim, view, n))) n++;
    let f = Math.floor(this.t * fps) % n;
    let expr = this.expr;
    if (expr === 'neutral' && (anim === 'idle' || anim === 'talk') && this.blinkT < 0.12) expr = 'blink';
    const tryNames = [
      frameName(this.char, anim, view, f, expr),
      frameName(this.char, anim, view, f),
      frameName(this.char, anim, view === 'back' ? 'side' : 'front', f),
      frameName(this.char, 'idle', view, 0),
      frameName(this.char, 'idle', 'front', 0),
    ];
    for (const nm of tryNames) {
      const fr = A.get(nm);
      if (fr) return { fr, usedView: nm.split(':')[2] };
    }
    return null;
  }

  update(dt, camPos) {
    this.t += dt;
    this.blinkT -= dt;
    if (this.blinkT < 0) this.blinkT = 2.5 + Math.random() * 3.5;
    if (this.talking > 0) this.talking -= dt;
    // path following
    if (this.path && this.path.length) {
      const tgt = this.path[0];
      const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.08) {
        this.path.shift();
        if (!this.path.length) {
          this.path = null;
          if (this.anim === this.walkAnim) this.play(this.walkAnim === 'walk+lantern' ? 'lantern' : this.walkAnim === 'walk+shiver' ? 'shiver' : 'idle');
          const cb = this.onArrive;
          this.onArrive = null;
          cb?.();
        }
      } else {
        const step = Math.min(d, this.speed * dt);
        this.pos.x += (dx / d) * step;
        this.pos.z += (dz / d) * step;
        this.targetYaw = Math.atan2(dx, dz);
        if (this.anim !== this.walkAnim) this.play(this.walkAnim);
      }
    }
    this.yaw = angleDamp(this.yaw, this.targetYaw, 10, dt);
    this.snapGround();
    // hop
    if (this.hopV !== 0 || this.hop > 0) {
      this.hopV -= 14 * dt;
      this.hop += this.hopV * dt;
      if (this.hop <= 0) {
        this.hop = 0;
        if (this.hopV < -1) this.squash.value = 0.72;
        this.hopV = 0;
      }
    }
    this.squash.update(dt);
    const view = this.lockView ? { view: this.lockView, flip: false } : pickView(this.yaw, this.pos, camPos);
    const res = this.frameFor(view.view);
    // a back view that falls back to a side frame still has to face the right way
    if (res) this.bb.setFrame(res.fr, res.usedView === 'side' ? (view.view === 'side' ? view.flip : (view.rel ?? 0) > 0) : false);
    const walkBob = this.anim.startsWith('walk') ? Math.abs(Math.sin(this.t * 8 * Math.PI / 2)) * 0.04 : 0;
    this.mesh.position.set(this.pos.x, this.pos.y + this.hop + walkBob + this.yOffset + this.floatY, this.pos.z);
    const sq = this.squash.value;
    this.bb.setScale(1 / Math.sqrt(Math.max(0.3, sq)), sq);
    this.mesh.visible = this.visible;
    // emote bubble
    if (this.emote) {
      this.emoteT -= dt;
      this.emotePop = Math.min(1, this.emotePop + dt * 6);
      const pop = this.emotePop < 1 ? 1 + Math.sin(this.emotePop * Math.PI) * 0.4 : 1;
      const h = (this.bb.frame ? this.bb.frame.h / 25.6 : 1.8) * sq + 0.15;
      this.emote.mesh.position.set(this.pos.x, this.pos.y + this.hop + h + Math.sin(this.t * 3) * 0.04, this.pos.z);
      this.emote.setScale(pop, pop);
      this.emote.mesh.visible = this.visible && this.emoteT > 0;
    }
  }
}

// Hank on the bicycle
export class Rider {
  constructor(game, charId = 'hank') {
    this.game = game;
    this.char = charId;
    this.bb = new Billboard(game.atlas, null, { castShadow: true, upright: 0.85 });
    this.mesh = this.bb.mesh;
    game.scene.add(this.mesh);
    this.cat = null;
    this.visible = true;
    this._v = new THREE.Vector3();
    this._c = new THREE.Vector3();
  }

  setOutfit(charId) {
    this.char = charId;
  }

  enableCat(on) {
    if (on && !this.cat) {
      this.cat = new Billboard(this.game.atlas, 'cat:basket:back:0', { castShadow: false, upright: 0.85 });
      this.game.scene.add(this.cat.mesh);
      this.catT = 0;
    }
    if (this.cat) this.cat.mesh.visible = on;
    this.catOn = on;
  }

  update(dt, bike, model, camPos) {
    const A = this.game.atlas;
    const anchor = model.rider.getWorldPosition(this._v);
    const { view, flip } = pickView(bike.yaw, bike.pos, camPos);
    let pose = bike.pose;
    let n = { pedal: 8, stand: 4 }[pose] || 1;
    let idx = 0;
    if (n > 1) idx = Math.floor((((bike.crank / (Math.PI * 2)) % 1) + 1) % 1 * n) % n;
    if (pose === 'crash') pose = 'coast';
    if (model.isMotor) { pose = bike.grounded ? 'coast' : 'air'; idx = 0; }
    const name = `${this.char}:ride:${pose}:${view}:${idx}`;
    const fr = A.get(name) || A.get(`${this.char}:ride:coast:${view}:0`);
    this.bb.setFrame(fr, view === 'side' ? flip : false);
    // sit slightly in front of the frame so tubes don't slice through the sprite
    const toCam = this._c.copy(camPos).sub(anchor);
    toCam.y = 0;
    toCam.normalize();
    this.mesh.position.copy(anchor).addScaledVector(toCam, 0.16);
    // lean shows from behind/in front, pitch from the side
    let roll = 0;
    if (view === 'back') roll = -bike.lean;
    else if (view === 'front') roll = bike.lean;
    else roll = (flip ? 1 : -1) * bike.pitch;
    this.bb.roll = roll;
    const sq = bike.squash.value;
    this.bb.setScale(1 / Math.sqrt(sq), sq);
    this.mesh.visible = this.visible && bike.crash <= 0;
    // cat in the basket
    if (this.cat && this.catOn) {
      this.catT += dt;
      const b = model.basket.getWorldPosition(this._v);
      const catView = view === 'back' ? 'back' : 'front';
      const blink = Math.floor(this.catT * 1.3) % 6 === 0 ? 1 : 0;
      const happy = bike.airTime > 0.3 || bike.boostTime > 0;
      const fname = catView === 'back' ? 'cat:basket:back:0' : `cat:basket:front:${happy ? 2 : blink}`;
      this.cat.setFrame(fname);
      this.cat.mesh.position.copy(b).addScaledVector(toCam, 0.1);
      this.cat.mesh.position.y += 0.02 + Math.max(0, Math.sin(this.catT * 9)) * Math.min(0.06, bike.speed * 0.004);
      this.cat.roll = roll;
      this.cat.mesh.visible = this.visible && bike.crash <= 0;
    }
  }
}
