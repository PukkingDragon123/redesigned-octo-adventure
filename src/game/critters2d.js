// 2D pixel-art wildlife living around the rider: grazing deer and fawns that
// bound away, hopping songbirds that flutter off, sky flocks, rabbits, foxes,
// squirrels that dash up trees, ducks, frogs, jumping fish, butterflies,
// dragonflies, bats, owls, a bin-raiding raccoon and graveyard wisps.
// Everything is pooled: creatures spawn in suitable spots near the player,
// react to Hank, and despawn when far away. Two instanced sprite batches draw
// the lot (ground creatures cast shadows, sky creatures don't).
import * as THREE from 'three';
import { SpriteAtlas, SpriteBatch } from '../render/sprites.js';
import { paintCritters, CRITTERS } from '../art/critters2d.js';
import { G } from '../render/shaderlib.js';
import { RNG } from '../core/noise.js';
import { clamp, wrapAngle, angleDamp, damp } from '../core/math.js';
import { riverInfo, villageMask, seaSDF } from '../world/terrain.js';
import * as L from '../world/layout.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();

export class Critters2D {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(4242);
    this.atlas = new SpriteAtlas(2048);
    const ms = paintCritters(this.atlas);
    this.atlas.finalize();
    console.log(`critters: ${this.atlas.frames.size} frames in ${ms.toFixed(0)}ms`);
    // frames[kind][anim][view] -> [frame, ...]
    this.frames = {};
    for (const [kind, K] of Object.entries(CRITTERS)) {
      const fk = (this.frames[kind] = {});
      for (const [anim, A] of Object.entries(K.anims)) {
        const fa = (fk[anim] = {});
        for (const view of A.views) fa[view] = Array.from({ length: A.n }, (_, i) => this.atlas.get(`${kind}:${anim}:${view}:${i}`));
      }
    }
    this.ground = new SpriteBatch(this.atlas, 360, { castShadow: true, upright: 0.88 });
    this.air = new SpriteBatch(this.atlas, 320, { castShadow: false, upright: 0.35 });
    game.scene.add(this.ground.mesh);
    game.scene.add(this.air.mesh);
    this.list = [];
    this.timers = { herd: 2 };
    this.enabled = true;
    // debug: ?critters=deer:3,fawn:2 places creatures in front of the camera; ?calm makes them tame
    this.calm = !!game.params?.has('calm');
    this.debug = game.params?.get('critters');
  }

  // place a creature of a kind with its usual behaviour
  place(kind, x, z, o = {}) {
    if (kind === 'deer' || kind === 'fawn' || kind === 'buck') {
      const herd = o.group || { x, z, alarm: 0, fleeYaw: 0 };
      const c = this.add(kind, x, z, { ai: deerAI, group: herd, state: o.state ?? (this.rng.next() < 0.5 ? 'graze' : 'idle'), ...o });
      if (!herd.lead || kind !== 'fawn') herd.lead = herd.lead || c;
      return c;
    }
    return null;
  }
  spawnDebug() {
    const g = this.game;
    const cam = g.camera;
    cam.getWorldDirection(_v);
    const yaw = Math.atan2(_v.x, _v.z);
    const group = { alarm: 0, fleeYaw: 0 };
    let k = 0;
    for (const part of this.debug.split(',')) {
      const [kind, n = 1, dist = 12] = part.split(':');
      for (let i = 0; i < +n; i++, k++) {
        const a = yaw + ((k % 5) - 2) * 0.22 + this.rng.range(-0.08, 0.08);
        const d = +dist + this.rng.range(-2, 3);
        const x = g.playerPos.x + Math.sin(a) * d, z = g.playerPos.z + Math.cos(a) * d;
        group.x = x; group.z = z;
        this.place(kind, x, z, { group: kind === 'deer' || kind === 'fawn' || kind === 'buck' ? group : undefined, yaw: this.rng.range(0, TAU) });
      }
    }
    this.debug = null;
  }

  // ---------------------------------------------------------------- world probes
  height(x, z) {
    return this.game.world.terrain.heightAt(x, z);
  }
  groundY(x, z) {
    return this.game.physics.groundAt(x, z, 1e9, 0).h;
  }
  treesNear(x, z, r) {
    let n = 0;
    this.game.world.forest?.colliders?.query(x, z, r, (it) => {
      if (it.tree && !it.tree.bush && Math.abs(it.x - x) < r && Math.abs(it.z - z) < r) n++;
    });
    return n;
  }
  nearestTree(x, z, r) {
    let best = null, bd = r;
    this.game.world.forest?.colliders?.query(x, z, r, (it) => {
      if (!it.tree || it.tree.bush) return;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bd) { bd = d; best = it; }
    });
    return best;
  }
  roadAt(x, z) {
    return this.game.world.terrain.splatAt(x, z).road;
  }
  // a random spot around the player, biased ahead of the camera
  around(minD, maxD, ahead = 0.7) {
    const g = this.game;
    const p = g.playerPos;
    const cam = g.camera;
    cam.getWorldDirection(_v);
    const base = Math.atan2(_v.x, _v.z);
    const a = this.rng.next() < ahead ? base + this.rng.range(-0.9, 0.9) : this.rng.range(0, TAU);
    const d = this.rng.range(minD, maxD);
    return { x: p.x + Math.sin(a) * d, z: p.z + Math.cos(a) * d };
  }
  find(minD, maxD, test, tries = 8, ahead = 0.7) {
    for (let k = 0; k < tries; k++) {
      const s = this.around(minD, maxD, ahead);
      if (Math.abs(s.x) > L.WORLD_HALF - 20 || Math.abs(s.z) > L.WORLD_HALF - 20) continue;
      const h = this.height(s.x, s.z);
      s.h = h;
      if (test(s.x, s.z, h)) return s;
    }
    return null;
  }
  // open grassland: dry, off the road, out of the village, few trees about
  isMeadow(x, z, h) {
    if (h < 1.2 || this.roadAt(x, z) > 0.2 || villageMask(x, z) > 0.2) return false;
    if (riverInfo(x, z).d < 10) return false;
    return this.treesNear(x, z, 7) <= 1;
  }

  // ---------------------------------------------------------------- creatures
  add(kind, x, z, o = {}) {
    const c = {
      kind, x, z, y: o.y ?? this.groundY(x, z), vx: 0, vy: 0, vz: 0, yaw: o.yaw ?? this.rng.range(0, TAU),
      anim: o.anim ?? 'idle', at: this.rng.range(0, 10), fps: o.fps ?? 4, frame: -1,
      state: o.state ?? 'idle', timer: o.timer ?? this.rng.range(1, 4), t: 0,
      air: o.air ?? false, fade: 1, fadeIn: true, dead: false, bob: 0, sx: o.scale ?? 1, roll: 0,
      ai: o.ai, data: o.data ?? {}, group: o.group ?? null, despawn: o.despawn ?? 150, emissive: o.emissive ?? 0,
    };
    this.list.push(c);
    return c;
  }
  kill(c) {
    c.dying = true;
  }
  count(fn) {
    let n = 0;
    for (const c of this.list) if (!c.dying && fn(c)) n++;
    return n;
  }
  threat() {
    const g = this.game;
    const sp = g.onFoot ? Math.hypot(g.walker.vel?.x || 0, g.walker.vel?.z || 0) : g.bike.speed;
    return sp;
  }
  // distance at which the player counts as "close" (tame creatures never notice)
  dist(c) {
    return this.calm ? 1e9 : c.d;
  }

  update(dt) {
    if (!this.enabled) return;
    const g = this.game;
    const p = g.playerPos;
    const night = G.uNight.value;
    this.night = night;
    this.hour = g.world.atmosphere.hour;
    this.p = p;
    this.speed = this.threat();
    for (const k in this.timers) this.timers[k] -= dt;
    if (this.debug && g.mode !== 'boot') this.spawnDebug();
    this.spawnAll(dt);
    for (const c of this.list) {
      c.t += dt;
      c.at += dt;
      const dx = c.x - p.x, dz = c.z - p.z;
      c.d = Math.hypot(dx, dz);
      if (c.fadeIn) { c.fade = Math.max(0, c.fade - dt * 2); if (c.fade <= 0) c.fadeIn = false; }
      if (c.dying) { c.fade += dt * 2; if (c.fade >= 1) c.dead = true; }
      if (c.d > c.despawn && !c.dying) this.kill(c);
      c.ai?.(c, dt, this);
    }
    if (this.list.some((c) => c.dead)) this.list = this.list.filter((c) => !c.dead);
    this.draw();
  }

  // ---------------------------------------------------------------- spawning
  spawnAll() {
    const T = this.timers;
    if (T.herd < 0) {
      T.herd = this.rng.range(6, 12);
      if (this.count((c) => c.kind === 'deer' || c.kind === 'fawn') < 5 && this.night < 0.7) this.spawnHerd();
    }
  }

  spawnHerd() {
    const s = this.find(55, 110, (x, z, h) => this.isMeadow(x, z, h), 10);
    if (!s) return;
    const herd = { x: s.x, z: s.z, alarm: 0, fleeYaw: 0 };
    const n = this.rng.int(1, 3);
    const lead = this.add(this.rng.next() < 0.15 ? 'buck' : 'deer', s.x, s.z, { ai: deerAI, group: herd, state: 'graze' });
    herd.lead = lead;
    for (let i = 0; i < n; i++) {
      const kind = i < 2 && this.rng.next() < 0.6 ? 'fawn' : 'deer';
      this.add(kind, s.x + this.rng.range(-5, 5), s.z + this.rng.range(-5, 5), { ai: deerAI, group: herd, state: this.rng.next() < 0.5 ? 'graze' : 'idle' });
    }
  }

  // ---------------------------------------------------------------- drawing
  draw() {
    const g = this.game;
    const cam = g.camera;
    const cp = cam.position;
    cam.getWorldDirection(_v);
    const fx = _v.x, fy = _v.y, fz = _v.z;
    this.ground.begin();
    this.air.begin();
    for (const c of this.list) {
      // cheap culling: behind the camera or very far
      const dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd > 260 * 260) continue;
      if (dx * fx + dy * fy + dz * fz < -4) continue;
      const F = this.frames[c.kind]?.[c.anim];
      if (!F) continue;
      // view from the angle between the creature's heading and the camera
      const toCam = Math.atan2(cp.x - c.x, cp.z - c.z);
      const rel = Math.abs(wrapAngle(toCam - c.yaw));
      let view = rel < Math.PI / 8 ? 'front' : rel < (3 * Math.PI) / 8 ? 'front3' : rel < (5 * Math.PI) / 8 ? 'side' : rel < (7 * Math.PI) / 8 ? 'back3' : 'back';
      if (c.forceView) view = c.forceView;
      let arr = F[view];
      if (!arr) arr = F.side || F[Object.keys(F)[0]];
      // screen-right of a viewer looking at the creature
      const l = Math.hypot(dx, dz) || 1;
      const rx = -dz / l, rz = dx / l;
      const flip = Math.sin(c.yaw) * rx + Math.cos(c.yaw) * rz < 0;
      const fi = c.frame >= 0 ? c.frame % arr.length : Math.floor(c.at * c.fps) % arr.length;
      const batch = c.air ? this.air : this.ground;
      batch.push(arr[fi], c.x, c.y + c.bob, c.z, { flip: c.noFlip ? false : flip, roll: c.roll, sx: c.sx, fade: c.fade, emissive: c.emissive, upright: c.upright });
    }
    this.ground.end();
    this.air.end();
  }
}

// ---------------------------------------------------------------- behaviours
function walkTo(c, dt, speed, M) {
  c.x += Math.sin(c.yaw) * speed * dt;
  c.z += Math.cos(c.yaw) * speed * dt;
  c.y = M.groundY(c.x, c.z);
}
function avoidWater(c, M, look = 4) {
  const ax = c.x + Math.sin(c.yaw) * look, az = c.z + Math.cos(c.yaw) * look;
  if (M.height(ax, az) < 0.4) c.yaw += Math.PI * 0.6;
}

function deerAI(c, dt, M) {
  const H = c.group;
  const p = M.p;
  const fawn = c.kind === 'fawn';
  const d = M.dist(c);
  // herd alarm: anyone spooked spooks everyone
  const scare = 20 + M.speed * 1.1;
  if (c.state !== 'flee' && c.state !== 'alert' && d < scare + 10) {
    c.state = 'alert';
    c.timer = M.rng.range(0.5, 1.1);
    c.yaw = angleDamp(c.yaw, Math.atan2(p.x - c.x, p.z - c.z), 30, 1);
    if (c === H.lead && M.rng.next() < 0.5) M.game.sfx?.('deer', { x: c.x, y: c.y, z: c.z });
  }
  if ((c.state === 'alert' && (c.timer < 0 || d < scare)) || (H.alarm > 0 && c.state !== 'flee')) {
    c.state = 'flee';
    if (!H.alarm) H.fleeYaw = Math.atan2(c.x - p.x, c.z - p.z) + M.rng.range(-0.5, 0.5);
    H.alarm = 8;
    c.timer = M.rng.range(5, 8);
    c.yaw = H.fleeYaw + M.rng.range(-0.25, 0.25);
    c.at = M.rng.range(0, 1);
  }
  c.timer -= dt;
  if (c.state === 'flee') {
    H.alarm = Math.max(0.01, H.alarm - dt);
    // keep running away from the player, bounding in arcs
    const away = Math.atan2(c.x - p.x, c.z - p.z);
    c.yaw = angleDamp(c.yaw, d < 30 ? away : H.fleeYaw, 1.5, dt);
    avoidWater(c, M, 6);
    walkTo(c, dt, fawn ? 8.5 : 9.5, M);
    c.anim = 'run';
    c.fps = 9;
    const ph = (c.at * c.fps / 4) % 1;
    c.bob = Math.max(0, Math.sin(ph * TAU)) * 0.35 * (fawn ? 0.7 : 1);
    if (c.timer < 0 && d > 45) { c.state = 'idle'; c.timer = M.rng.range(2, 4); H.alarm = 0; c.bob = 0; }
    return;
  }
  c.bob = damp(c.bob, 0, 10, dt);
  if (c.state === 'alert') {
    c.anim = 'alert';
    c.fps = 1;
    c.yaw = angleDamp(c.yaw, Math.atan2(p.x - c.x, p.z - c.z), 3, dt);
    return;
  }
  if (c.timer < 0) {
    const r = M.rng.next();
    c.state = r < 0.5 ? 'graze' : r < 0.72 ? 'idle' : 'walk';
    c.timer = M.rng.range(2.5, 7);
    if (c.state === 'walk') {
      // fawns tag along after mum; everyone stays near the herd
      const lead = H.lead;
      const tx = fawn && lead && lead !== c ? lead.x : H.x, tz = fawn && lead && lead !== c ? lead.z : H.z;
      const far = Math.hypot(tx - c.x, tz - c.z) > (fawn ? 4 : 12);
      c.yaw = far ? Math.atan2(tx - c.x, tz - c.z) : c.yaw + M.rng.range(-1.4, 1.4);
    }
  }
  if (c.state === 'walk') {
    avoidWater(c, M);
    walkTo(c, dt, fawn ? 1.3 : 1.1, M);
    c.anim = 'walk';
    c.fps = 5;
  } else if (c.state === 'graze') {
    c.anim = 'graze';
    c.fps = 1.6;
  } else {
    c.anim = 'idle';
    c.fps = 0.8;
  }
}
