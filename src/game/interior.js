// Inside Nana's cabin: in and out through the front door, walking around with the room's own
// collisions, a close indoor camera that stays inside the walls, things to look at and use
// (the sofa by the fire, the hearth, Harold's photos, the books, the clock, the cocoa pot),
// and Nana herself, who comes in when Hank does.
import * as THREE from 'three';
import { CabinInterior, SPOTS, CAM_BOX } from '../world/cabinInterior.js';
import { ROOM } from '../voxel/models/interior.js';
import { VoxelCharacter, extendVChar, POSE_KIT } from './vchar.js';
import { input } from '../core/input.js';
import { clamp, damp, angleDamp, wrapAngle } from '../core/math.js';
import { P } from '../render/particles.js';
import * as FOOD from '../voxel/models/food.js';

const _v = new THREE.Vector3();

// seated variants of a few poses, so Hank can sip, eat, shiver and doze on the sofa or at the table
{
  const { POSES, arm } = POSE_KIT;
  const seated = (k) => (c, t, T) => { POSES.sit(c, t, T); POSES[k](c, t, T); };
  extendVChar({
    poses: {
      sitSip: seated('sip'),
      sitEat: seated('eat'),
      sitSleep: seated('sleep'),
      sitShiver: (c, t, T) => {
        POSES.sit(c, t, T);
        arm(T, 'L', 0.9, 0.5, 1.9, 0.6); arm(T, 'R', 0.9, 0.5, 1.9, 0.6);
        T.lean += 0.05 + Math.sin(t * 40) * 0.015; T.headX -= 0.06;
      },
      sitWarm: (c, t, T) => { POSES.sit(c, t, T); arm(T, 'L', 1.1, 0.15, 0.4, -0.1); arm(T, 'R', 1.1, 0.15, 0.4, -0.1); T.lean += 0.08; },
    },
    held: { sitSip: { fn: FOOD.cocoaMaple, scale: 1, upright: true } },
  });
}

const PHOTO_LINES = [
  [['hank', 'Nana and Harold on their wedding day. He\'s wearing the toque. The same toque.', 'happy'], ['hank', '...It has held up better than he did. Better than I did, too.', 'sheepish']],
  [['hank', 'Harold with a fish. A very small fish. He looks prouder than a moose.', 'happy']],
  [['hank', 'Harold and Bessie, brand new. Not a scratch on her. Not a scratch on him.', 'happy'], ['hank', 'I\'ll take care of her, Harold. Mostly.', 'determined']],
  [['hank', 'The lighthouse at sunset. Someone wrote on the back: "M + H, our spot."', 'neutral']],
  [['hank', 'A baby with enormous cheeks. On the back: "Lou, age one. Already eating everything."', 'laugh']],
];
const BOOK_LINES = [
  ['hank', '"Knitting for the Recently Bereaved." ...There\'s a bookmark on the chapter about toques.', 'neutral'],
  ['hank', '"One Hundred Cocoas." Every page has notes in the margin. Page 47 just says "NO. NEVER AGAIN."', 'laugh'],
  ['hank', '"Birds of the Maritimes," with Harold\'s ticks. He saw a puffin once. He underlined it three times.', 'happy'],
  ['hank', '"So You\'ve Been Buried Alive." ...Oh. No. It\'s "So You\'ve Bought a Bicycle." Close, though.', 'sheepish'],
  ['hank', 'A pressed maple leaf falls out of a cookbook. Somebody kept a lot of autumns in here.', 'neutral'],
];
const FIRE_LINES = [
  ['hank', 'Ahh. Warm right down to the marrow. ...I don\'t have marrow. Warm right down to the bone, then.', 'happy'],
  ['hank', 'The fire pops and crackles. Something in my ribs crackles back. We\'re friends now.', 'happy'],
  ['hank', 'I could stand here all day. I\'d probably fall asleep. And we know how that goes.', 'sheepish'],
];

export class Interior {
  constructor(game) {
    this.g = game;
    this.active = false; // Hank is walking around inside
    this.staged = false; // a scene is using the room (camera inside)
    this.busy = false;
    this.camYaw = 0;
    this.camPitch = 0.4;
    this.idle = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.sitting = null;
    this.beat = null;
    this.hint = null;
    this.room = new CabinInterior(game.world);
    game.world.cabinInterior = this.room;
    const room = this.room;
    // the walker's physics while inside: the floor, the walls and the furniture
    this.phys = {
      groundAt: (x, z, y, step) => {
        _v.set(x, room.floorY, z);
        if (room.inside(_v, 0.2)) return { h: room.floorY, nx: 0, ny: 1, nz: 0, surface: 'wood', platform: null, water: false };
        return game.physics.groundAt(x, z, y, step);
      },
      resolve: (pos, r) => {
        const l = room.toLocal(pos);
        const hit = room.resolveLocal(l, r);
        if (!hit) return null;
        const w = room.wp(l.x, l.y, l.z);
        pos.x = w.x;
        pos.z = w.z;
        const c = Math.cos(room.yaw), s = Math.sin(room.yaw);
        return { nx: hit.nx * c + hit.nz * s, nz: -hit.nx * s + hit.nz * c, depth: hit.depth, obj: { kind: 'wall' } };
      },
    };
  }

  get indoors() {
    return this.active || this.staged;
  }

  // a scene wants the room (lit and visible) without Hank walking around in it
  stage(on) {
    this.staged = on;
    this.room.show(on || this.active, this.g.lightPool);
    if (!on && !this.active) this.room.setDoor(0);
  }

  // world position of the door threshold, just outside on the porch
  doorOutside() {
    return this.room.wp(0, 0, 4.9);
  }
  nearDoorOutside(p, r = 1.7) {
    const d = this.doorOutside();
    return Math.hypot(p.x - d.x, p.z - d.z) < r && Math.abs(p.y - d.y) < 1.2;
  }

  fade(to, dur) {
    return this.g.tween(this.g.pipeline.post.uFade, 'value', to, dur);
  }

  // put Hank on his feet (inside the cabin), with or without the bike nearby
  footMode() {
    const g = this.g, r = g.rider;
    g.onFoot = true;
    r.hop = null;
    if (r.mounted) r.dismount();
    r.onFoot = true;
    r.visible = true;
    r.ch.groundSnap = false;
  }

  // walk in through the front door (fade, door sounds, Nana follows)
  async enter({ fade = true, at = SPOTS.entry } = {}) {
    const g = this.g;
    if (this.active || this.busy) return;
    this.busy = true;
    g.ui.prompt(null);
    g.walker.frozen = true;
    g.sound.play('door_creak', { volume: 0.7 });
    if (fade) await this.fade(1, 0.35);
    this.footMode();
    this.room.show(true, g.lightPool);
    const p = this.room.wp(at.x, 0, at.z);
    g.walker.place(p.x, this.room.floorY, p.z, this.room.wyaw(at.yaw));
    g.walker.phys = this.phys;
    this.active = true;
    this.camYaw = at.yaw;
    this.camPitch = 0.4;
    this.updateCamera(0, true);
    this.moveNana(true);
    g.sound.play('door', { volume: 0.5 });
    if (fade) await this.fade(0, 0.45);
    g.walker.frozen = false;
    this.busy = false;
  }

  // out onto the porch
  async leave({ fade = true } = {}) {
    const g = this.g;
    if (!this.active || this.busy) return;
    this.busy = true;
    g.ui.prompt(null);
    this.stand(true);
    g.walker.frozen = true;
    g.sound.play('door_creak', { volume: 0.7 });
    if (fade) await this.fade(1, 0.35);
    this.exitNow();
    g.sound.play('door', { volume: 0.5 });
    if (fade) await this.fade(0, 0.45);
    g.walker.frozen = false;
    this.busy = false;
  }

  exitNow() {
    const g = this.g;
    this.stand(true);
    this.active = false;
    g.walker.phys = null;
    const p = this.room.wp(SPOTS.porch.x, 0, SPOTS.porch.z);
    g.walker.place(p.x, g.physics.groundAt(p.x, p.z, this.room.floorY + 1).h, p.z, this.room.wyaw(SPOTS.porch.yaw));
    this.room.show(this.staged, g.lightPool);
    this.moveNana(false);
    g.chase.release();
    g.chase.yaw = g.walker.yaw;
    g.chase.orbitYaw = 0;
    g.chase.snap(g.walker);
  }

  // back to normal riding (story flow: after a night in, before a morning out): no fade, Hank on Bessie
  reset() {
    const g = this.g;
    this.beat = null;
    this.hint = null;
    if (this.active) this.exitNow();
    this.stand(true);
    this.moveNana(false);
    g.walker.frozen = false;
    g.walker.phys = null;
    if (g.onFoot) {
      g.onFoot = false;
      const r = g.rider;
      r.hop = null;
      r.onFoot = false;
      r.mount(g.bikeModel);
    }
    this.staged = false;
    this.room.show(false, g.lightPool);
    this.room.setDoor(0);
  }

  // Nana comes in with Hank (and goes back to her porch when he leaves)
  moveNana(inside) {
    const N = this.g.villagers?.get('grandma');
    if (!N) return;
    if (inside) {
      if (!this.nanaPorch) this.nanaPorch = { pos: N.homePos.clone(), yaw: N.homeYaw };
      const h = SPOTS.nanaHome;
      const p = this.room.wp(h.x, 0, h.z);
      N.path = null;
      N.pos.set(p.x, this.room.floorY, p.z);
      N.homePos = N.pos.clone();
      N.homeYaw = this.room.wyaw(h.yaw);
      N.strollT = 1e9;
      N.face(N.homeYaw);
      N.play('idle');
    } else if (this.nanaPorch) {
      N.path = null;
      N.pos.copy(this.nanaPorch.pos);
      N.homePos = this.nanaPorch.pos.clone();
      N.homeYaw = this.nanaPorch.yaw;
      N.strollT = 6;
      N.snapGround?.();
      this.nanaPorch = null;
    }
  }

  // ---------------------------------------------------------------- sitting on the sofa
  sit() {
    const g = this.g;
    if (this.sitting) return;
    const s = SPOTS.sofa.seat;
    const p = this.room.wp(s.x, 0, s.z);
    const ch = new VoxelCharacter(g, g.state.outfit || 'hank', { x: p.x, z: p.z, y: this.room.floorY, yaw: this.room.wyaw(s.yaw), anim: 'sit' });
    this.sitting = ch;
    g.rider.visible = false;
    g.walker.frozen = true;
    this.sitT = 0;
    // Harold's quilt over his knees
    const q = this.room.lapQuilt;
    q.position.set(s.x, 0, s.z);
    q.rotation.set(0, s.yaw, 0);
    q.scale.setScalar(1);
    q.visible = true;
    g.sound.play('land_foot', { volume: 0.3 });
    g.effects?.poof?.(p.x, this.room.floorY + 0.5, p.z, { scale: 0.6, color: [0.9, 0.82, 0.7], count: 3 });
  }
  stand(silent = false) {
    const g = this.g;
    if (!this.sitting) return;
    this.sitting.remove();
    this.sitting.dispose?.();
    this.sitting = null;
    this.room.lapQuilt.visible = false;
    g.rider.visible = true;
    g.walker.frozen = false;
    const s = SPOTS.sofa.stand;
    const p = this.room.wp(s.x, 0, s.z);
    g.walker.place(p.x, this.room.floorY, p.z, this.room.wyaw(Math.PI / 2));
    if (!silent) this.camYaw = Math.PI * 0.75;
  }

  // ---------------------------------------------------------------- the story beat: look around, then sit by the fire
  freeRoam({ hint = 'Sit by the fire', toast = null, at = { x: SPOTS.entry.x, z: SPOTS.entry.z - 0.4, yaw: Math.PI } } = {}) {
    const g = this.g;
    return new Promise((res) => {
      this.beat = { res, t: 0, nudged: false };
      this.hint = hint;
      if (!this.active) {
        this.footMode();
        this.room.show(true, g.lightPool);
        const p = this.room.wp(at.x, 0, at.z);
        g.walker.place(p.x, this.room.floorY, p.z, this.room.wyaw(at.yaw));
        g.walker.phys = this.phys;
        g.walker.frozen = false;
        this.active = true;
        this.staged = false;
        g.rider.visible = true;
        this.camYaw = at.yaw;
        this.updateCamera(0, true);
      }
      g.mode = 'ride';
      g.ui.showHUD(true);
      if (toast) g.ui.pop(toast, { expr: 'happy', ms: 6000 });
    });
  }
  finishBeat() {
    const b = this.beat;
    if (!b) return;
    this.beat = null;
    this.hint = null;
    this.g.ui.prompt(null);
    this.g.ui.showHUD(false);
    this.g.mode = 'cutscene';
    // the story takes it from here (the room stays lit for the scene)
    this.active = false;
    this.staged = true;
    b.res();
  }

  async talk(lines) {
    const g = this.g;
    g.mode = 'menu';
    try {
      for (const [who, text, expr] of lines) await g.ui.say(who, text, { expr });
    } finally {
      if (g.mode === 'menu') g.mode = 'ride';
    }
  }

  // what E does inside right now
  action() {
    const g = this.g;
    if (this.busy) return { text: '', fn: () => {}, passive: true };
    if (this.sitting) return { text: 'Stand up', fn: () => this.stand() };
    const L = this.room.toLocal(g.walker.pos);
    const near = (s, r = s.r) => Math.hypot(L.x - s.x, L.z - s.z) < r;
    const N = g.villagers?.get('grandma');
    if (N && N.visible && !N.scripted && N.pos.distanceTo(g.walker.pos) < 1.9) {
      if (this.beat) return { text: 'Talk to Nana', fn: () => this.talk([['grandma', 'Go on, sit yourself down by the fire, dear. I\'ll be right there.', 'happy']]) };
      return { text: 'Talk to Nana', fn: () => g.story.homeTalk() };
    }
    if (near(SPOTS.doorIn)) {
      if (this.beat) return { text: 'Go outside', fn: () => this.talk([['grandma', 'Not back out into that cold, dear! The sofa\'s right there by the fire.', 'surprised']]) };
      return { text: 'Go outside', fn: () => this.leave() };
    }
    // nearest of the rest
    const opts = [
      ['fire', 'Warm your bones', () => this.warmUp()],
      ['sofa', 'Sit by the fire', () => (this.beat ? this.finishBeat() : this.sit())],
      ['photos', 'Look at the photos', () => this.photos()],
      ['books', 'Browse the bookshelf', () => this.talk([BOOK_LINES[Math.floor(Math.random() * BOOK_LINES.length)]])],
      ['clock', 'Check the clock', () => this.clock()],
      ['stove', 'Peek in the cocoa pot', () => this.stove()],
    ];
    let best = null, bd = Infinity;
    for (const [k, text, fn] of opts) {
      const s = SPOTS[k];
      const d = Math.hypot(L.x - s.x, L.z - s.z);
      if (d < s.r && d < bd) { bd = d; best = { text, fn }; }
    }
    return best;
  }

  warmUp() {
    const g = this.g;
    const f = this.room.fireAt;
    for (let k = 0; k < 14; k++) g.effects.ps.spawn({ x: f.x + (Math.random() - 0.5) * 0.4, y: f.y + 0.3, z: f.z + (Math.random() - 0.5) * 0.4, vx: (Math.random() - 0.5) * 0.6, vy: 1.5 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 0.6, life: 1.4, size: 0.04, sprite: P.ember, color: [1, 0.7, 0.3], emissive: 1, drag: 0.6, blink: 8 });
    g.sound.play('lantern_whoomp', { volume: 0.35 });
    this.fireN = (this.fireN || 0) + 1;
    return this.talk([FIRE_LINES[(this.fireN - 1) % FIRE_LINES.length]]);
  }
  photos() {
    this.photoN = (this.photoN || 0) + 1;
    this.g.sound.play('page_flip', { volume: 0.4 });
    return this.talk(PHOTO_LINES[(this.photoN - 1) % PHOTO_LINES.length]);
  }
  clock() {
    const hr = this.g.world.atmosphere.hour;
    const hh = Math.floor(hr) % 24, mm = Math.floor((hr - Math.floor(hr)) * 60);
    const t = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'in the morning' : hh < 18 ? 'in the afternoon' : 'at night'}`;
    const late = hr > 21 ? ' Past my bedtime. I used to have a bedtime.' : hr < 9 ? ' Plenty of day left for cocoa.' : '';
    return this.talk([['hank', `Tick... tock. It's ${t}.${late}`, 'neutral']]);
  }
  stove() {
    const g = this.g;
    g.sound.play('cook_sizzle', { volume: 0.3 });
    const lines = [
      ['hank', 'Mmm. Cocoa, cinnamon and a little maple. I can\'t smell a thing, but I can tell.', 'happy'],
      ['hank', 'The kettle\'s singing. Nana says a kettle that sings is a kettle that\'s happy.', 'happy'],
      ['grandma', 'Hands out of the pot, dear! It\'s for the customers.', 'smug'],
    ];
    this.stoveN = (this.stoveN || 0) + 1;
    return this.talk([lines[(this.stoveN - 1) % lines.length]]);
  }

  // ---------------------------------------------------------------- per frame (before the chase camera)
  update(dt) {
    const g = this.g;
    if (this.room.shown) this.room.update(dt, g);
    if (this.sitting) {
      this.sitting.update(dt, g.camera.position);
      this.sitT += dt;
      // any movement gets him up again
      if (this.sitT > 0.6 && g.mode === 'ride' && !g.ui.dialogueTick && (Math.abs(input.steer()) > 0.3 || Math.abs(input.moveY()) > 0.3)) this.stand();
    }
    if (!this.active || g.mode === 'cutscene') return;
    if (this.beat && g.mode === 'ride') {
      this.beat.t += dt;
      if (!this.beat.nudged && this.beat.t > 40) {
        this.beat.nudged = true;
        g.ui.pop('That sofa by the fire looks awfully cozy...', { expr: 'sleepy' });
      }
    }
    // late at night indoors: Nana's put the kettle on, no forced trip home
    const A = g.world.atmosphere;
    if (A.hour > 23.85) A.hour = 23.85;
    this.updateCamera(dt);
  }

  // the indoor camera: behind and above Hank, kept inside the room box, turning towards the
  // middle of the room when a wall is in the way; mouse drag / right stick still orbit
  updateCamera(dt, snap = false) {
    const g = this.g, room = this.room;
    if (this.sitting) {
      // a three-quarter shot across the rug: Hank, the quilt and the fire
      const pos = room.wp(3.3, 1.9, 1.35), look = room.wp(2.1, 0.85, -1.4);
      if (snap) { this.camPos.copy(pos); this.camLook.copy(look); }
      else {
        const k = 1 - Math.exp(-dt * 3);
        this.camPos.lerp(pos, k);
        this.camLook.lerp(look, k);
      }
      g.chase.cut(this.camPos, this.camLook, 52);
      return;
    }
    const W = g.walker;
    const L = room.toLocal(W.pos);
    const free = g.mode === 'ride' && !g.ui.dialogueTick && !g.ui.menuStack.length;
    const look = free ? input.look() : { x: 0, y: 0 };
    if (Math.abs(look.x) + Math.abs(look.y) > 0.001) {
      this.camYaw -= look.x * 2.2;
      this.camPitch = clamp(this.camPitch + look.y * 1.2, 0.2, 0.95);
      this.idle = 0;
    } else this.idle += dt;
    const heading = room.lyaw(W.yaw);
    if (W.speed > 0.6 && this.idle > 0.8) {
      const diff = wrapAngle(heading - this.camYaw);
      if (Math.abs(diff) < 2.3) this.camYaw = angleDamp(this.camYaw, heading, 1.4 * Math.min(1, W.speed / 2.6), dt);
    }
    const B = CAM_BOX;
    const dist = 3.1, ty = 1.0;
    // how far back the lens can go along a yaw before it leaves the room box
    const room2 = (yaw) => {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      let t = 9;
      const px = clamp(L.x, B.x0, B.x1), pz = clamp(L.z, B.z0, B.z1);
      if (fx > 1e-4) t = Math.min(t, (B.x1 - px) / fx);
      if (fx < -1e-4) t = Math.min(t, (B.x0 - px) / fx);
      if (fz > 1e-4) t = Math.min(t, (B.z1 - pz) / fz);
      if (fz < -1e-4) t = Math.min(t, (B.z0 - pz) / fz);
      return Math.max(0.3, t);
    };
    const want = Math.cos(this.camPitch) * dist;
    let hd = Math.min(want, room2(this.camYaw));
    if (hd < want - 0.4 && this.idle > 0.6 && !snap) {
      // squeezed against a wall: drift round to look from the middle of the room towards Hank
      const mid = Math.atan2(L.x - 0.2, L.z);
      this.camYaw = angleDamp(this.camYaw, mid, Math.min(2, (want - hd) * 1.2), dt);
      hd = Math.min(want, room2(this.camYaw));
    }
    const px = clamp(L.x, B.x0, B.x1), pz = clamp(L.z, B.z0, B.z1);
    const cx = px - Math.sin(this.camYaw) * hd, cz = pz - Math.cos(this.camYaw) * hd;
    // a short lens distance means a higher lens looking down at him
    const cy = clamp(ty + Math.sqrt(Math.max(0, dist * dist - hd * hd)) * (hd < want ? 0.85 : 1), B.y0, B.y1);
    const close = Math.max(0, 1.5 - hd);
    const pos = room.wp(cx, cy, cz);
    const lk = room.wp(L.x + Math.sin(this.camYaw) * close * 0.5, ty - close * 0.2, L.z + Math.cos(this.camYaw) * close * 0.5);
    if (snap || dt <= 0) {
      this.camPos.copy(pos);
      this.camLook.copy(lk);
    } else {
      this.camPos.x = damp(this.camPos.x, pos.x, 7, dt);
      this.camPos.y = damp(this.camPos.y, pos.y, 7, dt);
      this.camPos.z = damp(this.camPos.z, pos.z, 7, dt);
      this.camLook.x = damp(this.camLook.x, lk.x, 10, dt);
      this.camLook.y = damp(this.camLook.y, lk.y, 10, dt);
      this.camLook.z = damp(this.camLook.z, lk.z, 10, dt);
    }
    g.chase.cut(this.camPos, this.camLook, 58);
    // walking is camera-relative: the walker reads the chase yaw
    g.chase.yaw = room.wyaw(this.camYaw);
    g.chase.orbitYaw = 0;
  }
}

export { ROOM };
