// 2D pixel-art wildlife living around the rider: grazing deer and fawns that
// bound away, hopping songbirds that flutter off, geese in Vs, crow swirls,
// circling gulls by the sea, rabbits, foxes that pounce on mice, squirrels and
// chipmunks that dash up trees, paddling ducks, frogs, jumping trout,
// butterflies and dragonflies by day; bats and owls by night;
// and a cheeky raccoon raiding a bin in the village after dark.
// Everything is pooled: creatures spawn in suitable spots near the player,
// react to Hank, and despawn when far away. The sprite atlas is painted over
// the first frames, then two instanced batches draw the lot (ground creatures
// cast shadows, sky creatures don't).
import * as THREE from 'three';
import { SpriteAtlas, SpriteBatch } from '../render/sprites.js';
import { paintCrittersGen, CRITTERS } from '../art/critters2d.js';
import { G } from '../render/shaderlib.js';
import { RNG } from '../core/noise.js';
import { wrapAngle, angleDamp, damp } from '../core/math.js';
import { riverInfo, villageMask, seaSDF } from '../world/terrain.js';
import { P } from '../render/particles.js';
import * as L from '../world/layout.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const DEER = new Set(['deer', 'fawn', 'buck']);
const SONGBIRDS = ['robin', 'chickadee', 'bluejay', 'sparrow'];

export class Critters2D {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(4242);
    this.atlas = new SpriteAtlas(2048);
    // (the old graveyard wisps are not painted: the town is dressed for the harvest, not Halloween)
    this.painter = paintCrittersGen(this.atlas, Object.keys(CRITTERS).filter((k) => !k.startsWith('wisp')));
    this.ready = false;
    this.paintMs = 0;
    this.list = [];
    this.groups = [];
    this.timers = { herd: 1, rabbit: 2, fox: 8, squirrel: 1.5, songbird: 2, geese: 25, crows: 6, gulls: 3, ducks: 2, frog: 3, fish: 4, butterfly: 1, dragonfly: 2, bat: 1, owl: 3, wisp: 1, raccoon: 4 };
    this.enabled = true;
    // debug: ?critters=deer:3,fawn:2 places creatures in front of the camera; ?calm makes them tame
    this.calm = !!game.params?.has('calm');
    this.debug = game.params?.get('critters');
    // tests and screenshots want everything at once; normal play paints it over a few frames
    if (game.params?.has('frames') || this.debug) this.paint(1e9);
  }

  // paint atlas frames for up to budget ms; finishes the atlas when done
  paint(budget) {
    const t0 = performance.now();
    let done = false;
    while (performance.now() - t0 < budget) {
      if (this.painter.next().done) { done = true; break; }
    }
    this.paintMs += performance.now() - t0;
    if (done) this.finish();
  }
  finish() {
    this.atlas.finalize();
    console.log(`critters: ${this.atlas.frames.size} frames in ${this.paintMs.toFixed(0)}ms`);
    // frames[kind][anim][view] -> [frame, ...]
    this.frames = {};
    for (const [kind, K] of Object.entries(CRITTERS)) {
      const fk = (this.frames[kind] = {});
      for (const [anim, A] of Object.entries(K.anims)) {
        const fa = (fk[anim] = {});
        for (const view of A.views) fa[view] = Array.from({ length: A.n }, (_, i) => this.atlas.get(`${kind}:${anim}:${view}:${i}`));
        fa.front ||= fa.front3 || fa.side;
        fa.back ||= fa.back3 || fa.side;
        fa.front3 ||= fa.side;
        fa.back3 ||= fa.side;
      }
    }
    this.ground = new SpriteBatch(this.atlas, 400, { castShadow: true, upright: 0.88 });
    this.air = new SpriteBatch(this.atlas, 360, { castShadow: false, upright: 0.3 });
    this.game.scene.add(this.ground.mesh);
    this.game.scene.add(this.air.mesh);
    this.ready = true;
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
      if (!it.tree || it.tree.bush || !it.tree.trunk) return;
      const d = Math.hypot(it.x - x, it.z - z);
      if (d < bd) { bd = d; best = it; }
    });
    return best;
  }
  roadAt(x, z) {
    return this.game.world.terrain.splatAt(x, z).road;
  }
  water(x, z) {
    return this.height(x, z) < -0.35;
  }
  // a random spot around the player, biased ahead of the camera
  around(minD, maxD, ahead = 0.7) {
    const p = this.p;
    this.game.camera.getWorldDirection(_v);
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
  isGrass(x, z, h) {
    return h > 0.8 && this.roadAt(x, z) < 0.3 && villageMask(x, z) < 0.5 && this.treesNear(x, z, 4) <= 2;
  }
  isForest(x, z, h) {
    return h > 0.8 && this.roadAt(x, z) < 0.2 && this.treesNear(x, z, 9) >= 3;
  }
  // a dry spot within a step or two of open water
  isShore(x, z, h) {
    if (h < 0.0 || h > 0.9) return false;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      if (this.water(x + Math.sin(a) * 2.5, z + Math.cos(a) * 2.5)) return true;
    }
    return false;
  }
  waterDirAt(x, z, r = 3) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      if (this.water(x + Math.sin(a) * r, z + Math.cos(a) * r)) return a;
    }
    return null;
  }

  // ---------------------------------------------------------------- creatures
  add(kind, x, z, o = {}) {
    const c = {
      kind, x, z, y: o.y ?? this.groundY(x, z), vx: 0, vy: 0, vz: 0, yaw: o.yaw ?? this.rng.range(0, TAU),
      anim: o.anim ?? Object.keys(CRITTERS[kind].anims)[0], at: this.rng.range(0, 10), fps: o.fps ?? 4, frame: -1,
      state: o.state ?? 'idle', timer: o.timer ?? this.rng.range(1, 4), t: 0,
      air: o.air ?? false, fade: 1, fadeIn: true, dead: false, bob: 0, sx: o.scale ?? 1, roll: 0, nose: 0,
      ai: o.ai, group: o.group ?? null, despawn: o.despawn ?? 150, emissive: o.emissive ?? 0, maxDraw: o.maxDraw ?? 200,
      home: { x, z }, cat: o.cat ?? kind, d: 1e9,
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
  countCat(cat) {
    return this.count((c) => c.cat === cat);
  }
  // distance at which the player counts as "close" (tame creatures never notice)
  dist(c) {
    return this.calm ? 1e9 : c.d;
  }
  sfx(name, c, vol = 1) {
    this.game.sfx?.(name, _s.set(c.x, c.y, c.z), vol);
  }
  splash(x, z, big = 0.5) {
    const fx = this.game.effects;
    if (fx?.splashCrown) fx.splashCrown(x, 0.02, z, big);
    else fx?.ps.spawn({ x, y: 0.04, z, life: 0.7, size: 0.3 * big, size1: 1.4 * big, sprite: P.ring, color: [0.85, 0.95, 1], alpha: 0.7 });
  }

  update(dt) {
    if (!this.enabled) return;
    if (!this.ready) {
      this.paint(6);
      if (!this.ready) return;
    }
    const g = this.game;
    this.p = g.playerPos;
    this.night = G.uNight.value;
    this.hour = ((g.world.atmosphere.hour % 24) + 24) % 24;
    const sp = g.onFoot ? Math.hypot(g.walker.vel?.x || 0, g.walker.vel?.z || 0) : g.bike.speed;
    this.speed = sp || 0;
    for (const k in this.timers) this.timers[k] -= dt;
    if (this.debug && g.mode !== 'boot') this.spawnDebug();
    if (g.mode !== 'title') this.spawnAll();
    const p = this.p;
    for (const c of this.list) {
      c.t += dt;
      c.at += dt;
      c.d = Math.hypot(c.x - p.x, c.z - p.z);
      if (c.fadeIn) { c.fade = Math.max(0, c.fade - dt * 2); if (c.fade <= 0) c.fadeIn = false; }
      if (c.dying) { c.fade = Math.min(1, c.fade + dt * 2); if (c.fade >= 1) c.dead = true; }
      if (c.d > c.despawn && !c.dying) this.kill(c);
      if (!c.dead) c.ai?.(c, dt, this);
    }
    for (const gr of this.groups) gr.update?.(dt, this);
    if (this.list.some((c) => c.dead)) this.list = this.list.filter((c) => !c.dead);
    this.groups = this.groups.filter((gr) => gr.members.some((c) => !c.dead));
    this.draw();
  }

  // ---------------------------------------------------------------- spawning
  spawnAll() {
    const T = this.timers, R = this.rng, n = this.night, h = this.hour;
    const day = n < 0.35, dusk = (h > 17 && h < 21) || (h > 5 && h < 8.5);
    const due = (k, a, b) => {
      if (T[k] > 0) return false;
      T[k] = R.range(a, b);
      return true;
    };
    const p = this.p;
    if (due('herd', 6, 12) && n < 0.7 && this.count((c) => DEER.has(c.kind)) < 5) this.spawnHerd();
    if (due('rabbit', 4, 8) && n < 0.8 && this.countCat('rabbit') < 4) this.spawnRabbits();
    if (due('fox', 14, 26) && (dusk || (day && R.next() < 0.4)) && this.countCat('fox') < 1) this.spawnFox();
    if (due('squirrel', 3, 6) && n < 0.6 && this.countCat('squirrel') < 5) this.spawnSquirrel();
    if (due('songbird', 3, 7) && day && this.groups.filter((gr) => gr.kind === 'songbird').length < 2) this.spawnSongbirds();
    if (due('geese', 50, 100) && n < 0.6 && !this.groups.some((gr) => gr.kind === 'geese')) this.spawnGeese();
    if (due('crows', 20, 40) && n < 0.75 && !this.groups.some((gr) => gr.kind === 'crows')) this.spawnCrows();
    if (due('gulls', 6, 12) && n < 0.6 && seaSDF(p.x, p.z) < 90 && this.countCat('gull') < 7) this.spawnGulls();
    if (due('ducks', 5, 10) && n < 0.6 && this.countCat('duck') < 5) this.spawnDucks();
    if (due('frog', 3, 7) && this.countCat('frog') < 4) this.spawnFrog();
    if (due('fish', 4, 9) && n < 0.8) this.spawnFish();
    if (due('butterfly', 2, 5) && day && this.countCat('butterfly') < 7) this.spawnButterflies();
    if (due('dragonfly', 3, 6) && day && this.countCat('dragonfly') < 3) this.spawnDragonfly();
    if (due('bat', 3, 6) && n > 0.45 && this.countCat('bat') < 7) this.spawnBats();
    if (due('owl', 10, 20) && n > 0.45 && this.countCat('owl') < 2) this.spawnOwl();
    if (due('raccoon', 10, 20) && (n > 0.35 || h > 18.5) && this.countCat('raccoon') < 1) this.spawnRaccoon();
  }

  spawnHerd(s) {
    s ||= this.find(55, 110, (x, z, h) => this.isMeadow(x, z, h), 10);
    if (!s) return;
    const herd = { x: s.x, z: s.z, alarm: 0, fleeYaw: 0 };
    const lead = this.place(this.rng.next() < 0.15 ? 'buck' : 'deer', s.x, s.z, { group: herd });
    herd.lead = lead;
    for (let i = 0, n = this.rng.int(1, 3); i < n; i++) this.place(i < 2 && this.rng.next() < 0.6 ? 'fawn' : 'deer', s.x + this.rng.range(-5, 5), s.z + this.rng.range(-5, 5), { group: herd });
  }
  spawnRabbits() {
    const s = this.find(25, 60, (x, z, h) => this.isGrass(x, z, h), 6);
    if (!s) return;
    for (let i = 0, n = this.rng.int(1, 2); i < n; i++) this.place('rabbit', s.x + this.rng.range(-3, 3), s.z + this.rng.range(-3, 3));
  }
  spawnFox() {
    const s = this.find(35, 70, (x, z, h) => this.isGrass(x, z, h) && this.treesNear(x, z, 14) >= 2, 8);
    if (s) this.place('fox', s.x, s.z);
  }
  spawnSquirrel() {
    const s = this.find(16, 45, (x, z, h) => this.isForest(x, z, h), 6, 0.8);
    if (s) this.place(this.rng.next() < 0.5 ? 'squirrel' : 'chipmunk', s.x, s.z);
  }
  spawnSongbirds() {
    const s = this.find(18, 40, (x, z, h) => h > 0.8 && villageMask(x, z) < 0.9 && this.treesNear(x, z, 3) === 0, 8, 0.9);
    if (!s) return;
    const kind = this.rng.pick(SONGBIRDS);
    const gr = { kind: 'songbird', members: [], scared: 0 };
    for (let i = 0, n = this.rng.int(3, 6); i < n; i++) gr.members.push(this.place(kind, s.x + this.rng.range(-2.5, 2.5), s.z + this.rng.range(-2.5, 2.5), { group: gr }));
    this.groups.push(gr);
  }
  spawnGeese(o = {}) {
    const p = this.p;
    const a = this.rng.range(0, TAU);
    const dir = o.dir || { x: -Math.sin(a), z: -Math.cos(a) };
    const side = this.rng.range(-30, 30);
    const start = o.start || { x: p.x + Math.sin(a) * 170 + dir.z * side, z: p.z + Math.cos(a) * 170 - dir.x * side };
    const gr = { kind: 'geese', members: [], dir, x: start.x, z: start.z, alt: o.alt ?? Math.max(this.height(p.x, p.z), 2) + this.rng.range(30, 42), t: 0, honk: 1 };
    const n = this.rng.int(7, 13);
    for (let i = 0; i < n; i++) {
      const row = Math.ceil(i / 2), sd = i % 2 ? 1 : -1;
      const c = this.add('goose', start.x, start.z, { y: gr.alt, air: true, anim: 'fly', fps: 3.2, ai: gooseAI, group: gr, despawn: 400, cat: 'goose', yaw: Math.atan2(dir.x, dir.z), scale: 1.5, maxDraw: 320 });
      c.off = { side: sd * row * 2.6, back: row * 2.9 };
      gr.members.push(c);
    }
    gr.update = (dt) => {
      gr.t += dt;
      gr.x += gr.dir.x * 10 * dt;
      gr.z += gr.dir.z * 10 * dt;
      if ((gr.honk -= dt) < 0 && gr.members[0]) { gr.honk = this.rng.range(1.2, 3); this.sfx('goose', gr.members[0], 0.7); }
      if (gr.t > 38) for (const c of gr.members) this.kill(c);
    };
    this.groups.push(gr);
  }
  spawnCrows(at = null) {
    // a swirl of crows over an open field or the old cemetery
    const gy = L.POI.graveyard;
    const nearYard = Math.hypot(this.p.x - gy.x, this.p.z - gy.z) < 110;
    const s = at || (nearYard ? { x: gy.x + this.rng.range(-10, 10), z: gy.z + this.rng.range(-10, 10) } : this.find(40, 90, (x, z, h) => this.isMeadow(x, z, h), 8));
    if (!s) return;
    const gr = { kind: 'crows', members: [], x: s.x, z: s.z, alt: s.alt ?? this.height(s.x, s.z) + this.rng.range(12, 20), t: 0, caw: 2 };
    for (let i = 0, n = this.rng.int(8, 14); i < n; i++) {
      const c = this.add('crow', s.x, s.z, { y: gr.alt, air: true, anim: 'fly', fps: 9, ai: swirlAI, group: gr, despawn: 220, cat: 'crow', scale: 1.35 });
      c.orbit = { a: this.rng.range(0, TAU), r: this.rng.range(5, 14), w: this.rng.range(0.35, 0.7) * this.rng.sign(), ph: this.rng.range(0, TAU), h: this.rng.range(-3, 3) };
      gr.members.push(c);
    }
    gr.update = (dt) => {
      gr.t += dt;
      gr.x += Math.sin(gr.t * 0.07) * dt * 1.5;
      gr.z += Math.cos(gr.t * 0.05) * dt * 1.5;
      if ((gr.caw -= dt) < 0 && gr.members[0]) { gr.caw = this.rng.range(2, 5); this.sfx('crow', gr.members[this.rng.int(0, gr.members.length - 1)], 0.6); }
      if (gr.t > 90) for (const c of gr.members) this.kill(c);
    };
    this.groups.push(gr);
  }
  spawnGulls() {
    // circling over the shore, and a few loafing on the sand or the docks
    const s = this.find(25, 80, (x, z, h) => { const d = seaSDF(x, z); return d < 25 && d > -40; }, 10, 0.6);
    if (!s) return;
    const gr = { kind: 'gulls', members: [], x: s.x, z: s.z, alt: 6, t: 0 };
    for (let i = 0, n = this.rng.int(2, 4); i < n; i++) {
      const c = this.add('gull', s.x, s.z, { y: this.rng.range(7, 16), air: true, anim: 'glide', fps: 8, ai: swirlAI, group: gr, cat: 'gull', scale: 1.3 });
      c.orbit = { a: this.rng.range(0, TAU), r: this.rng.range(7, 16), w: this.rng.range(0.2, 0.4) * this.rng.sign(), ph: this.rng.range(0, TAU), h: this.rng.range(3, 10), glide: true };
      gr.members.push(c);
    }
    this.groups.push(gr);
    const beach = this.find(15, 50, (x, z, h) => h > 0.05 && h < 1.8 && seaSDF(x, z) < 14, 10, 0.8);
    if (beach) for (let i = 0, n = this.rng.int(1, 3); i < n; i++) this.add('gull', beach.x + this.rng.range(-2, 2), beach.z + this.rng.range(-2, 2), { anim: 'idle', fps: 0.7, ai: loafAI, cat: 'gull', maxDraw: 90 });
  }
  spawnDucks() {
    const s = this.find(18, 60, (x, z, h) => h < -0.8 && seaSDF(x, z) > 30, 10, 0.7);
    if (!s) return;
    const gr = { kind: 'ducks', members: [], scared: 0 };
    for (let i = 0, n = this.rng.int(2, 4); i < n; i++) {
      const c = this.add(i === 0 ? 'mallard' : this.rng.next() < 0.5 ? 'duckHen' : 'mallard', s.x + this.rng.range(-2, 2), s.z + this.rng.range(-2, 2), { y: 0, anim: 'swim', fps: 2, ai: duckAI, group: gr, cat: 'duck', maxDraw: 110 });
      if (this.water(c.x, c.z)) gr.members.push(c);
      else c.dead = true;
    }
    this.groups.push(gr);
  }
  spawnFrog() {
    const s = this.find(10, 35, (x, z, h) => this.isShore(x, z, h), 12, 0.8);
    if (s) this.add('frog', s.x, s.z, { anim: 'idle', fps: 1.5, ai: frogAI, cat: 'frog', maxDraw: 45, despawn: 70 });
  }
  spawnFish() {
    const s = this.find(10, 40, (x, z, h) => h < -0.9, 10, 0.8);
    if (!s) return;
    const c = this.add('trout', s.x, s.z, { y: -0.1, anim: 'jump', ai: fishAI, cat: 'fish', maxDraw: 80 });
    const sp = this.rng.range(1.2, 2.2);
    c.vx = Math.sin(c.yaw) * sp; c.vz = Math.cos(c.yaw) * sp; c.vy = this.rng.range(4, 5.5);
    c.fade = 0; c.fadeIn = false;
    this.splash(s.x, s.z, 0.35);
    this.sfx('splash', c, 0.35);
  }
  spawnButterflies() {
    const s = this.find(10, 35, (x, z, h) => h > 0.8 && this.roadAt(x, z) < 0.5 && this.treesNear(x, z, 4) <= 1, 6, 0.8);
    if (!s) return;
    for (let i = 0, n = this.rng.int(1, 3); i < n; i++) {
      const c = this.add(this.rng.next() < 0.6 ? 'monarch' : 'sulphur', s.x + this.rng.range(-2, 2), s.z + this.rng.range(-2, 2), { anim: 'fly', fps: 11, air: true, ai: butterflyAI, cat: 'butterfly', maxDraw: 45, despawn: 70 });
      c.y += this.rng.range(0.4, 1.4);
    }
  }
  spawnDragonfly() {
    const s = this.find(8, 30, (x, z, h) => h > -0.6 && h < 0.8 && this.waterDirAt(x, z, 4) !== null, 10, 0.8);
    if (!s) return;
    const c = this.add('dragonfly', s.x, s.z, { anim: 'fly', fps: 22, air: true, ai: dragonflyAI, cat: 'dragonfly', maxDraw: 40, despawn: 60 });
    c.y = Math.max(0, this.height(s.x, s.z)) + 0.8;
  }
  spawnBats() {
    const gy = L.POI.graveyard;
    const s = Math.hypot(this.p.x - gy.x, this.p.z - gy.z) < 80 && this.rng.next() < 0.6 ? { x: gy.x + this.rng.range(-15, 15), z: gy.z + this.rng.range(-15, 15) } : this.around(15, 45, 0.8);
    const gr = { kind: 'bats', members: [], x: s.x, z: s.z };
    for (let i = 0, n = this.rng.int(2, 4); i < n; i++) {
      const c = this.add('bat', s.x, s.z, { y: Math.max(0, this.height(s.x, s.z)) + this.rng.range(4, 8), anim: 'fly', fps: 13, air: true, ai: batAI, group: gr, cat: 'bat', despawn: 120, maxDraw: 90 });
      c.orbit = { a: this.rng.range(0, TAU), r: this.rng.range(3, 7), w: this.rng.range(1.2, 2.2) * this.rng.sign(), ph: this.rng.range(0, TAU), h: this.rng.range(2.5, 6) };
      gr.members.push(c);
    }
    this.groups.push(gr);
  }
  spawnOwl() {
    const s = this.find(18, 45, (x, z, h) => this.isForest(x, z, h), 8, 0.85);
    if (!s) return;
    const t = this.nearestTree(s.x, s.z, 8);
    if (!t) return;
    const c = this.add('owl', t.x, t.z, { anim: 'idle', fps: 0.6, ai: owlAI, cat: 'owl', maxDraw: 80 });
    c.tree = t;
    c.perchH = this.groundY(t.x, t.z) + this.rng.range(2.4, 3.6);
  }
  spawnWisps() {
    const gy = L.POI.graveyard;
    if (Math.hypot(this.p.x - gy.x, this.p.z - gy.z) > 90) return;
    for (let i = 0, n = this.rng.int(1, 2); i < n; i++) {
      const x = gy.x + this.rng.range(-(gy.r || 24), gy.r || 24), z = gy.z + this.rng.range(-(gy.r || 24), gy.r || 24);
      const c = this.add(this.rng.next() < 0.65 ? 'wisp' : 'wispBlue', x, z, { anim: 'float', fps: 5, ai: wispAI, cat: 'wisp', emissive: 0.55, despawn: 110, maxDraw: 100 });
      c.base = this.groundY(x, z) + this.rng.range(0.3, 1.0);
    }
  }
  spawnRaccoon() {
    const p = this.p;
    if (villageMask(p.x, p.z) < 0.3) return;
    const houses = L.BUILDINGS.filter((b) => Math.hypot(b.x - p.x, b.z - p.z) < 60 && Math.hypot(b.x - p.x, b.z - p.z) > 12);
    if (!houses.length) return;
    const b = this.rng.pick(houses);
    for (let k = 0; k < 6; k++) {
      const a = this.rng.range(0, TAU), r = Math.max(b.w, b.d) * 0.5 + 1.4;
      const x = b.x + Math.sin(a) * r, z = b.z + Math.cos(a) * r;
      const h = this.height(x, z);
      if (h < 0.5 || this.roadAt(x, z) > 0.6) continue;
      const bin = this.add('bin', x, z, { anim: 'idle', cat: 'raccoon', maxDraw: 80, despawn: 90 });
      bin.noFlip = true;
      const c = this.add('raccoon', x + Math.sin(a + 1.4) * 0.55, z + Math.cos(a + 1.4) * 0.55, { anim: 'rummage', fps: 3, ai: raccoonAI, cat: 'raccoon', maxDraw: 80, despawn: 90 });
      c.yaw = Math.atan2(x - c.x, z - c.z);
      c.bin = bin;
      return;
    }
  }

  // place a creature of a kind with its usual behaviour
  place(kind, x, z, o = {}) {
    if (DEER.has(kind)) {
      const herd = o.group || { x, z, alarm: 0, fleeYaw: 0 };
      const c = this.add(kind, x, z, { ai: deerAI, group: herd, state: this.rng.next() < 0.5 ? 'graze' : 'idle', cat: 'deer', ...o });
      herd.lead ||= c;
      return c;
    }
    if (kind === 'rabbit') return this.add(kind, x, z, { anim: 'idle', fps: 1, ai: rabbitAI, cat: 'rabbit', maxDraw: 90, ...o });
    if (kind === 'fox') return this.add(kind, x, z, { anim: 'walk', fps: 6, ai: foxAI, state: 'trot', cat: 'fox', ...o });
    if (kind === 'squirrel' || kind === 'chipmunk') return this.add(kind, x, z, { anim: 'idle', fps: 1.5, ai: squirrelAI, state: 'forage', cat: 'squirrel', maxDraw: 70, despawn: 90, ...o });
    if (SONGBIRDS.includes(kind)) return this.add(kind, x, z, { anim: 'peck', fps: 3, ai: songbirdAI, state: 'ground', cat: 'songbird', maxDraw: 60, despawn: 90, ...o });
    if (kind === 'owl') { const c = this.add(kind, x, z, { anim: 'idle', fps: 0.6, ai: owlAI, cat: 'owl', ...o }); c.tree = this.nearestTree(x, z, 12); c.perchH = (c.tree ? this.groundY(c.tree.x, c.tree.z) : c.y) + 2.6; return c; }
    if (kind === 'wisp' || kind === 'wispBlue') { const c = this.add(kind, x, z, { anim: 'float', fps: 5, ai: wispAI, cat: 'wisp', emissive: 0.55, ...o }); c.base = c.y + 0.6; return c; }
    if (kind === 'bat') { const gr = { x, z }; const c = this.add(kind, x, z, { anim: 'fly', fps: 13, air: true, ai: batAI, group: gr, cat: 'bat', ...o }); c.orbit = { a: 0, r: 3, w: 1.6, ph: 0, h: 3 }; c.y += 3; return c; }
    if (kind === 'monarch' || kind === 'sulphur') { const c = this.add(kind, x, z, { anim: 'fly', fps: 11, air: true, ai: butterflyAI, cat: 'butterfly', ...o }); c.y += 0.8; return c; }
    if (kind === 'frog') return this.add(kind, x, z, { anim: 'idle', fps: 1.5, ai: frogAI, cat: 'frog', ...o });
    if (kind === 'raccoon') { const c = this.add(kind, x, z, { anim: 'rummage', fps: 3, ai: raccoonAI, cat: 'raccoon', ...o }); c.bin = this.add('bin', x + 0.6, z, { anim: 'idle', cat: 'raccoon' }); c.yaw = Math.PI / 2; return c; }
    return this.add(kind, x, z, o);
  }
  spawnDebug() {
    const g = this.game;
    g.camera.getWorldDirection(_v);
    const yaw = Math.atan2(_v.x, _v.z);
    const herd = { alarm: 0, fleeYaw: 0 };
    const flock = { kind: 'songbird', members: [], scared: 0 };
    let k = 0;
    for (const part of this.debug.split(',')) {
      const [kind, n = 1, dist = 12] = part.split(':');
      // flocks: geese cross the view, crows swirl ahead
      const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
      const ahead = { x: g.playerPos.x + fwd.x * +dist, z: g.playerPos.z + fwd.z * +dist };
      if (kind === 'geese') { this.spawnGeese({ start: { x: ahead.x - fwd.z * 25, z: ahead.z + fwd.x * 25 }, dir: { x: fwd.z, z: -fwd.x }, alt: g.playerPos.y + +n }); continue; }
      if (kind === 'crows') { this.spawnCrows({ ...ahead, alt: g.playerPos.y + +n }); continue; }
      for (let i = 0; i < +n; i++, k++) {
        const a = yaw + ((k % 5) - 2) * 0.22 + this.rng.range(-0.08, 0.08);
        const d = +dist + this.rng.range(-1.5, 2);
        const x = g.playerPos.x + Math.sin(a) * d, z = g.playerPos.z + Math.cos(a) * d;
        herd.x = x; herd.z = z;
        const o = { yaw: this.rng.range(0, TAU) };
        if (DEER.has(kind)) o.group = herd;
        if (SONGBIRDS.includes(kind)) o.group = flock;
        const c = this.place(kind, x, z, o);
        if (SONGBIRDS.includes(kind)) flock.members.push(c);
      }
    }
    if (flock.members.length) this.groups.push(flock);
    this.debug = null;
  }

  // ---------------------------------------------------------------- drawing
  draw() {
    const cam = this.game.camera;
    const cp = cam.position;
    cam.getWorldDirection(_v);
    const fx = _v.x, fy = _v.y, fz = _v.z;
    this.ground.begin();
    this.air.begin();
    for (const c of this.list) {
      const dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd > c.maxDraw * c.maxDraw) continue;
      if (dx * fx + dy * fy + dz * fz < -3) continue;
      const F = this.frames[c.kind]?.[c.anim];
      if (!F) continue;
      // the view comes from the angle between the creature's heading and the camera
      const toCam = Math.atan2(cp.x - c.x, cp.z - c.z);
      const rel = Math.abs(wrapAngle(toCam - c.yaw));
      const view = c.forceView || (rel < Math.PI / 8 ? 'front' : rel < (3 * Math.PI) / 8 ? 'front3' : rel < (5 * Math.PI) / 8 ? 'side' : rel < (7 * Math.PI) / 8 ? 'back3' : 'back');
      const arr = F[view] || F.side;
      // screen-right of a viewer looking at the creature
      const l = Math.hypot(dx, dz) || 1;
      const flip = c.noFlip ? false : c.flipLock ?? Math.sin(c.yaw) * (-dz / l) + Math.cos(c.yaw) * (dx / l) < 0;
      const fi = c.frame >= 0 ? c.frame % arr.length : Math.floor(c.at * c.fps) % arr.length;
      let roll = c.roll;
      if (c.climb) roll += flip ? -Math.PI / 2 : Math.PI / 2;
      if (c.nose) roll += flip ? -c.nose : c.nose;
      (c.air ? this.air : this.ground).push(arr[fi], c.x, c.y + c.bob, c.z, { flip, roll, sx: c.sx, fade: c.fade, emissive: c.emissive, upright: c.upright });
    }
    this.ground.end();
    this.air.end();
  }
}

// ---------------------------------------------------------------- behaviours
function walk(c, dt, speed, M) {
  c.x += Math.sin(c.yaw) * speed * dt;
  c.z += Math.cos(c.yaw) * speed * dt;
  c.y = M.groundY(c.x, c.z);
}
function avoidWater(c, M, look = 4) {
  if (M.height(c.x + Math.sin(c.yaw) * look, c.z + Math.cos(c.yaw) * look) < 0.4) c.yaw += Math.PI * 0.6;
}
const awayFrom = (c, p) => Math.atan2(c.x - p.x, c.z - p.z);
const toward = (c, x, z) => Math.atan2(x - c.x, z - c.z);

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
    c.yaw = toward(c, p.x, p.z);
    if (c === H.lead && M.rng.next() < 0.5) M.sfx('deer', c);
  }
  if ((c.state === 'alert' && (c.timer < 0 || d < scare)) || (H.alarm > 0 && c.state !== 'flee')) {
    c.state = 'flee';
    if (!H.alarm) H.fleeYaw = awayFrom(c, p) + M.rng.range(-0.5, 0.5);
    H.alarm = 8;
    c.timer = M.rng.range(5, 8);
    c.yaw = H.fleeYaw + M.rng.range(-0.25, 0.25);
    c.at = M.rng.range(0, 1);
  }
  c.timer -= dt;
  if (c.state === 'flee') {
    H.alarm = Math.max(0.01, H.alarm - dt);
    c.yaw = angleDamp(c.yaw, d < 30 ? awayFrom(c, p) : H.fleeYaw, 1.5, dt);
    avoidWater(c, M, 6);
    walk(c, dt, fawn ? 8.5 : 9.5, M);
    c.anim = 'run';
    c.fps = 9;
    const ph = ((c.at * c.fps) / 4) % 1;
    c.bob = Math.max(0, Math.sin(ph * TAU)) * 0.35 * (fawn ? 0.7 : 1);
    if (c.timer < 0 && d > 45) { c.state = 'idle'; c.timer = M.rng.range(2, 4); H.alarm = 0; c.bob = 0; }
    return;
  }
  c.bob = damp(c.bob, 0, 10, dt);
  if (c.state === 'alert') {
    c.anim = 'alert';
    c.yaw = angleDamp(c.yaw, toward(c, p.x, p.z), 3, dt);
    return;
  }
  if (c.timer < 0) {
    const r = M.rng.next();
    c.state = r < 0.5 ? 'graze' : r < 0.72 ? 'idle' : 'walk';
    c.timer = M.rng.range(2.5, 7);
    if (c.state === 'walk') {
      // fawns tag along after mum; everyone stays near the herd
      const lead = H.lead && H.lead !== c && !H.lead.dead ? H.lead : null;
      const tx = fawn && lead ? lead.x : H.x, tz = fawn && lead ? lead.z : H.z;
      const far = Math.hypot(tx - c.x, tz - c.z) > (fawn ? 4 : 12);
      c.yaw = far ? toward(c, tx, tz) : c.yaw + M.rng.range(-1.4, 1.4);
    }
  }
  if (c.state === 'walk') {
    avoidWater(c, M);
    walk(c, dt, fawn ? 1.3 : 1.1, M);
    c.anim = 'walk';
    c.fps = 5;
  } else if (c.state === 'graze') { c.anim = 'graze'; c.fps = 1.6; } else { c.anim = 'idle'; c.fps = 0.8; }
}

// rabbits nibble, sit up when they hear you, then zig-zag away in big hops
function rabbitAI(c, dt, M) {
  const d = M.dist(c), p = M.p;
  c.timer -= dt;
  if (c.state === 'hop' || c.state === 'flee') {
    c.hopT += dt;
    const dur = c.state === 'flee' ? 0.34 : 0.45, len = c.state === 'flee' ? 1.9 : 0.6;
    const k = Math.min(1, c.hopT / dur);
    c.x += Math.sin(c.yaw) * (len / dur) * dt;
    c.z += Math.cos(c.yaw) * (len / dur) * dt;
    c.y = M.groundY(c.x, c.z);
    c.bob = Math.sin(k * Math.PI) * (c.state === 'flee' ? 0.38 : 0.12);
    c.anim = 'hop';
    c.frame = Math.min(3, Math.floor(k * 4));
    if (k >= 1) {
      c.hopT = 0;
      c.hops--;
      if (c.state === 'flee') c.yaw = awayFrom(c, p) + (c.hops % 2 ? 0.6 : -0.6) * M.rng.range(0.6, 1.2);
      avoidWater(c, M, 2);
      if (c.hops <= 0 && (c.state !== 'flee' || d > 30)) { c.state = 'idle'; c.timer = M.rng.range(1, 3); c.frame = -1; c.bob = 0; }
      if (c.hops <= 0 && c.state === 'flee') c.hops = 3;
    }
    return;
  }
  if (c.state === 'alert') {
    c.anim = 'alert';
    c.yaw = angleDamp(c.yaw, toward(c, p.x, p.z), 4, dt);
    if (c.timer < 0 || d < 8 + M.speed * 0.3) { c.state = 'flee'; c.hops = 4; c.hopT = 0; c.yaw = awayFrom(c, p); }
    return;
  }
  if (d < 14 + M.speed * 0.6) { c.state = 'alert'; c.timer = M.rng.range(0.3, 0.7); return; }
  if (c.timer < 0) {
    const r = M.rng.next();
    if (r < 0.3) { c.state = 'hop'; c.hops = M.rng.int(1, 3); c.hopT = 0; c.yaw += M.rng.range(-1.5, 1.5); return; }
    c.state = r < 0.7 ? 'nibble' : 'idle';
    c.timer = M.rng.range(1.5, 4);
  }
  c.frame = -1;
  c.anim = c.state === 'nibble' ? 'nibble' : 'idle';
  c.fps = c.state === 'nibble' ? 3 : 0.7;
}

// foxes trot about, stop to listen, and pounce nose-first into the grass
function foxAI(c, dt, M) {
  const d = M.dist(c), p = M.p;
  c.timer -= dt;
  if (c.state !== 'flee' && d < 16 + M.speed * 0.9) {
    c.state = 'flee';
    c.timer = M.rng.range(4, 6);
    c.yaw = awayFrom(c, p);
    c.bob = 0;
  }
  if (c.state === 'flee') {
    c.yaw = angleDamp(c.yaw, awayFrom(c, p), 2, dt);
    avoidWater(c, M, 4);
    walk(c, dt, 8, M);
    c.anim = 'run'; c.fps = 11; c.frame = -1;
    c.bob = Math.max(0, Math.sin(((c.at * c.fps) / 4) * TAU)) * 0.12;
    if (c.timer < 0 && d > 40) { c.state = 'trot'; c.timer = 3; }
    return;
  }
  if (c.state === 'pounce') {
    c.pT += dt;
    const k = Math.min(1, c.pT / 0.7);
    c.x += Math.sin(c.yaw) * 2.2 * dt;
    c.z += Math.cos(c.yaw) * 2.2 * dt;
    c.y = M.groundY(c.x, c.z);
    c.bob = Math.sin(k * Math.PI) * 0.9;
    c.anim = 'pounce'; c.frame = k < 0.45 ? 0 : 1;
    if (k >= 1) {
      c.state = 'idle'; c.timer = M.rng.range(1, 2.5); c.frame = -1; c.bob = 0;
      M.game.effects?.poof?.(c.x + Math.sin(c.yaw) * 0.35, c.y + 0.1, c.z + Math.cos(c.yaw) * 0.35, { scale: 0.45, color: [0.82, 0.74, 0.55], count: 4 });
      M.game.effects?.spawnLeaf && [0, 1, 2].forEach(() => M.game.effects.spawnLeaf(c.x, c.y + 0.2, c.z, { vx: M.rng.range(-1, 1), vy: M.rng.range(1.5, 2.5), vz: M.rng.range(-1, 1), gravity: 3, life: 3, rest: 1.5 }));
    }
    return;
  }
  if (c.timer < 0) {
    const r = M.rng.next();
    if (c.state === 'listen' && r < 0.6) { c.state = 'pounce'; c.pT = 0; return; }
    c.state = r < 0.45 ? 'trot' : r < 0.75 ? 'listen' : 'sit';
    c.timer = M.rng.range(2, 5);
    if (c.state === 'trot') c.yaw += M.rng.range(-1.2, 1.2);
  }
  c.frame = -1;
  if (c.state === 'trot') { avoidWater(c, M); walk(c, dt, 1.7, M); c.anim = 'walk'; c.fps = 7; }
  else if (c.state === 'sit') { c.anim = 'sit'; }
  else { c.anim = 'idle'; c.fps = 0.8; }
}

// squirrels and chipmunks forage, then sprint to the nearest trunk and up it
function squirrelAI(c, dt, M) {
  const d = M.dist(c), p = M.p;
  c.timer -= dt;
  if (c.state === 'forage') {
    c.frame = -1;
    if (d < 9 + M.speed * 0.5) {
      const t = M.nearestTree(c.x, c.z, 14);
      if (t) { c.state = 'toTree'; c.tree = t; } else { c.state = 'flee'; c.timer = 3; c.yaw = awayFrom(c, p); }
      M.sfx('chirp', c, 0.4);
      return;
    }
    if (c.dash > 0) {
      c.dash -= dt;
      walk(c, dt, 4, M);
      c.anim = 'run'; c.fps = 14;
      return;
    }
    if (c.timer < 0) {
      const r = M.rng.next();
      if (r < 0.35) { c.dash = M.rng.range(0.25, 0.6); c.yaw += M.rng.range(-2, 2); }
      c.anim = r < 0.7 ? 'eat' : 'idle';
      c.fps = c.anim === 'eat' ? 4 : 1.5;
      c.timer = M.rng.range(1, 3);
    }
    return;
  }
  if (c.state === 'toTree' || c.state === 'flee') {
    if (c.state === 'toTree') {
      const t = c.tree;
      const r = (t.r || 0.4) + 0.08;
      c.yaw = toward(c, t.x, t.z);
      if (Math.hypot(t.x - c.x, t.z - c.z) < r + 0.15) { c.state = 'climb'; c.ch = 0; c.baseY = c.y; c.top = Math.min(4.5, (t.tree?.H || 8) * 0.4) + M.rng.range(0, 1); }
    } else if (c.timer < 0) c.state = 'forage';
    walk(c, dt, 6.5, M);
    c.anim = 'run'; c.fps = 16;
    return;
  }
  // climbing: stuck to the trunk on the side facing the camera, head up
  const t = c.tree;
  const cam = M.game.camera.position;
  const a = Math.atan2(cam.x - t.x, cam.z - t.z) + 0.5;
  const r = (t.r || 0.4) + 0.05;
  c.x = t.x + Math.sin(a) * r;
  c.z = t.z + Math.cos(a) * r;
  c.yaw = a + Math.PI / 2;
  c.forceView = 'side';
  c.climb = true;
  if (c.state === 'climb') {
    c.ch += dt * 2.6;
    c.y = c.baseY + Math.min(c.ch, c.top);
    c.anim = 'run'; c.fps = 14;
    if (c.ch >= c.top) { c.state = 'perch'; c.timer = M.rng.range(2, 5); }
  } else {
    c.anim = 'idle'; c.fps = 2;
  }
}

// little birds hop and peck on the ground, then burst into the air together
function songbirdAI(c, dt, M) {
  const gr = c.group;
  const d = M.dist(c), p = M.p;
  if (c.state === 'ground') {
    if (d < 6 + M.speed * 0.7 && !gr.scared) { gr.scared = 1; M.sfx('chirp', c, 0.8); }
    if (gr.scared && (c.delay ??= M.rng.range(0, 0.35)) >= 0) {
      c.delay -= dt;
      if (c.delay < 0) {
        c.state = 'fly';
        c.air = true;
        c.upright = 0.5;
        c.yaw = awayFrom(c, p) + M.rng.range(-0.7, 0.7);
        c.vy = M.rng.range(3.5, 5);
        c.spd = M.rng.range(5, 7);
        c.flyT = 0;
        c.frame = -1;
        M.game.effects?.feathers?.(c.x, c.y + 0.1, c.z, 2);
      }
    }
    c.timer -= dt;
    if (c.hopT > 0) {
      c.hopT -= dt;
      c.x += Math.sin(c.yaw) * 1.1 * dt;
      c.z += Math.cos(c.yaw) * 1.1 * dt;
      c.y = M.groundY(c.x, c.z);
      c.bob = Math.sin((1 - c.hopT / 0.22) * Math.PI) * 0.1;
      c.anim = 'hop'; c.frame = 1;
      if (c.hopT <= 0) { c.bob = 0; c.frame = -1; }
      return;
    }
    if (c.timer < 0) {
      const r = M.rng.next();
      if (r < 0.4) { c.hopT = 0.22; c.yaw += M.rng.range(-1.2, 1.2); }
      c.anim = r < 0.75 ? 'peck' : 'idle';
      c.fps = c.anim === 'peck' ? 5 : 1.2;
      c.timer = M.rng.range(0.4, 1.4);
    }
    return;
  }
  // flying away: flutter up, then level off and leave
  c.flyT += dt;
  c.vy = damp(c.vy, c.flyT > 1.2 ? 0.6 : 2.5, 2, dt);
  c.x += Math.sin(c.yaw) * c.spd * dt;
  c.z += Math.cos(c.yaw) * c.spd * dt;
  c.y += c.vy * dt;
  c.yaw += Math.sin(c.t * 3 + c.at) * 0.6 * dt;
  c.anim = 'fly'; c.fps = 15;
  c.bob = Math.sin(c.t * 15) * 0.04;
  if (c.flyT > 7 || c.d > 70) M.kill(c);
}

function gooseAI(c, dt, M) {
  const gr = c.group;
  const rx = gr.dir.z, rz = -gr.dir.x;
  c.x = gr.x + rx * c.off.side - gr.dir.x * c.off.back;
  c.z = gr.z + rz * c.off.side - gr.dir.z * c.off.back;
  c.y = gr.alt + Math.sin(c.t * 1.3 + c.off.side) * 0.4;
  c.yaw = Math.atan2(gr.dir.x, gr.dir.z);
  // they glide now and then
  const g = Math.sin(c.t * 0.4 + c.off.back) > 0.7;
  c.frame = g ? 1 : -1;
}

// crows and gulls circle a slowly drifting centre, rising and falling
function swirlAI(c, dt, M) {
  const gr = c.group, o = c.orbit;
  if (o.scared) {
    c.y += 4 * dt;
  }
  const near = M.dist(c) < 12 && c.y - M.p.y < 6;
  if (near && !o.scared) { o.scared = true; o.w *= 1.8; M.sfx(c.kind === 'gull' ? 'chirp' : 'crow', c, 0.6); }
  o.a += o.w * dt;
  const r = o.r + Math.sin(c.t * 0.6 + o.ph) * 3;
  const x = gr.x + Math.sin(o.a) * r, z = gr.z + Math.cos(o.a) * r;
  const base = gr.alt + o.h;
  const y = (c.kind === 'gull' ? Math.max(M.height(x, z), 0) + o.h + 4 : base) + Math.sin(c.t * 0.9 + o.ph) * 2;
  c.yaw = o.w > 0 ? o.a + Math.PI / 2 : o.a - Math.PI / 2;
  c.x = x; c.z = z;
  c.y = o.scared ? Math.max(c.y, y) : damp(c.y, y, 2, dt);
  // flap when climbing, glide otherwise
  const climbing = Math.cos(c.t * 0.9 + o.ph) > 0.3;
  c.anim = climbing || !CRITTERS[c.kind].anims.glide ? 'fly' : 'glide';
  c.fps = c.kind === 'gull' ? 7 : 9;
  c.roll = (o.w > 0 ? -1 : 1) * 0.15;
}

// gulls loafing on the sand: they look about, and take off if you ride at them
function loafAI(c, dt, M) {
  const d = M.dist(c);
  if (c.state !== 'fly' && d < 9 + M.speed * 0.4) {
    c.state = 'fly'; c.air = true; c.anim = 'fly'; c.fps = 9; c.vy = 3; c.yaw = awayFrom(c, M.p); c.flyT = 0;
    M.sfx('chirp', c, 0.5);
  }
  if (c.state === 'fly') {
    c.flyT += dt;
    c.x += Math.sin(c.yaw) * 6 * dt;
    c.z += Math.cos(c.yaw) * 6 * dt;
    c.vy = damp(c.vy, 0.8, 1, dt);
    c.y += c.vy * dt;
    if (c.flyT > 8) M.kill(c);
    return;
  }
  c.timer -= dt;
  if (c.timer < 0) { c.yaw += M.rng.range(-1.5, 1.5); c.timer = M.rng.range(1.5, 4); }
}

// ducks paddle about, tip up to feed, and splash off the water when startled
function duckAI(c, dt, M) {
  const gr = c.group;
  const d = M.dist(c), p = M.p;
  if (c.state !== 'fly' && (d < 9 + M.speed * 0.4 || gr.scared)) {
    if (!gr.scared) gr.scared = 1;
    c.delay ??= M.rng.range(0, 0.4);
    c.delay -= dt;
    if (c.delay < 0) {
      c.state = 'fly'; c.air = true; c.anim = 'fly'; c.fps = 12; c.vy = 3.2; c.flyT = 0; c.yaw = awayFrom(c, p) + M.rng.range(-0.5, 0.5);
      M.splash(c.x, c.z, 0.5);
      M.game.effects?.splashDrops?.(c.x, 0.05, c.z, 8);
      M.sfx('splash', c, 0.4);
    }
  }
  if (c.state === 'fly') {
    c.flyT += dt;
    c.x += Math.sin(c.yaw) * 7 * dt;
    c.z += Math.cos(c.yaw) * 7 * dt;
    c.vy = damp(c.vy, 1.2, 1.2, dt);
    c.y += c.vy * dt;
    if (c.flyT > 9) M.kill(c);
    return;
  }
  c.timer -= dt;
  if (c.timer < 0) {
    c.state = M.rng.next() < 0.25 ? 'dabble' : 'swim';
    c.timer = c.state === 'dabble' ? M.rng.range(1.5, 3) : M.rng.range(2, 6);
    c.yaw += M.rng.range(-1, 1);
  }
  if (c.state === 'swim') {
    const nx = c.x + Math.sin(c.yaw) * 1.5, nz = c.z + Math.cos(c.yaw) * 1.5;
    if (!M.water(nx, nz)) c.yaw += Math.PI * 0.7 * dt * 4;
    else { c.x += Math.sin(c.yaw) * 0.35 * dt; c.z += Math.cos(c.yaw) * 0.35 * dt; }
    c.anim = 'swim'; c.fps = 1.5;
  } else { c.anim = 'dabble'; c.fps = 2; }
  c.y = 0.0 + Math.sin(c.t * 2 + c.x) * 0.015;
}

// frogs sit and puff, then plop into the water
function frogAI(c, dt, M) {
  const d = M.dist(c);
  if (c.state === 'leap') {
    c.lT += dt;
    const k = Math.min(1, c.lT / 0.55);
    c.x += Math.sin(c.yaw) * 2.6 * dt;
    c.z += Math.cos(c.yaw) * 2.6 * dt;
    c.y = Math.max(M.groundY(c.x, c.z), 0);
    c.bob = Math.sin(k * Math.PI) * 0.45;
    c.anim = 'leap'; c.frame = Math.min(2, Math.floor(k * 3));
    if (k >= 1) {
      if (M.water(c.x, c.z)) { M.splash(c.x, c.z, 0.3); M.sfx('splash', c, 0.25); c.dead = true; }
      else { c.state = 'idle'; c.frame = -1; c.bob = 0; c.timer = 1; }
    }
    return;
  }
  if (d < 4.5 + M.speed * 0.35) {
    const a = M.waterDirAt(c.x, c.z, 2.5);
    c.yaw = a ?? awayFrom(c, M.p);
    c.state = 'leap'; c.lT = 0;
    return;
  }
  c.anim = 'idle'; c.fps = 1.6;
}

function fishAI(c, dt, M) {
  c.vy -= 9.8 * dt;
  c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
  c.yaw = Math.atan2(c.vx, c.vz);
  c.forceView = 'side';
  c.anim = 'jump';
  c.frame = c.vy > 1.5 ? 0 : c.vy > -1.5 ? 1 : 2;
  c.nose = Math.atan2(c.vy, Math.hypot(c.vx, c.vz)) * 0.7;
  if (c.y < -0.15 && c.vy < 0) {
    M.splash(c.x, c.z, 0.4);
    M.sfx('splash', c, 0.3);
    c.dead = true;
  }
}

function butterflyAI(c, dt, M) {
  c.timer -= dt;
  const ground = Math.max(M.height(c.x, c.z), 0);
  if (c.state === 'rest') {
    c.frame = 0; c.y = ground + 0.05;
    if (c.timer < 0 || M.dist(c) < 2.5) { c.state = 'idle'; c.frame = -1; c.timer = 0; }
    return;
  }
  if (c.timer < 0 || !c.tx) {
    const flee = M.dist(c) < 3;
    const a = flee ? awayFrom(c, M.p) + M.rng.range(-0.6, 0.6) : M.rng.range(0, TAU);
    const r = flee ? 4 : M.rng.range(0.8, 3);
    c.tx = (flee ? c.x : c.home.x) + Math.sin(a) * r;
    c.tz = (flee ? c.z : c.home.z) + Math.cos(a) * r;
    c.ty = M.rng.range(0.35, 1.8) + (flee ? 1 : 0);
    c.timer = M.rng.range(1, 2.6);
    if (!flee && M.rng.next() < 0.12) { c.state = 'rest'; c.timer = M.rng.range(2, 4); return; }
  }
  const dx = c.tx - c.x, dz = c.tz - c.z;
  const l = Math.hypot(dx, dz) || 1;
  const sp = Math.min(1.4, l * 1.5);
  c.x += (dx / l) * sp * dt + Math.sin(c.t * 5) * 0.3 * dt;
  c.z += (dz / l) * sp * dt + Math.cos(c.t * 4) * 0.3 * dt;
  c.yaw = angleDamp(c.yaw, Math.atan2(dx, dz), 4, dt);
  c.y = damp(c.y, ground + c.ty, 1.5, dt) + Math.sin(c.t * 9) * 0.01;
}

function dragonflyAI(c, dt, M) {
  c.timer -= dt;
  if (c.timer < 0) {
    if (c.state === 'dart') { c.state = 'hover'; c.timer = M.rng.range(0.4, 1.5); }
    else {
      c.state = 'dart'; c.timer = M.rng.range(0.25, 0.5);
      const a = M.dist(c) < 3 ? awayFrom(c, M.p) : M.rng.range(0, TAU);
      c.yaw = a;
    }
  }
  const ground = Math.max(M.height(c.x, c.z), 0);
  if (c.state === 'dart') {
    c.x += Math.sin(c.yaw) * 5 * dt;
    c.z += Math.cos(c.yaw) * 5 * dt;
    if (Math.hypot(c.x - c.home.x, c.z - c.home.z) > 6) c.yaw = toward(c, c.home.x, c.home.z);
  }
  c.y = damp(c.y, ground + 0.6 + Math.sin(c.t * 0.7) * 0.4, 3, dt);
  c.bob = Math.sin(c.t * 18) * 0.015;
}

// bats flit around in tight, jittery loops, swooping low now and then
function batAI(c, dt, M) {
  const gr = c.group, o = c.orbit;
  o.a += o.w * dt * (1 + Math.sin(c.t * 2.3 + o.ph) * 0.5);
  const r = o.r + Math.sin(c.t * 1.7 + o.ph) * 2;
  const x = gr.x + Math.sin(o.a) * r, z = gr.z + Math.cos(o.a) * r;
  const ground = Math.max(M.height(x, z), 0);
  const swoop = Math.max(0, Math.sin(c.t * 0.5 + o.ph)) ** 6 * (o.h - 1.2);
  c.yaw = o.w > 0 ? o.a + Math.PI / 2 : o.a - Math.PI / 2;
  c.x = x; c.z = z;
  c.y = ground + o.h - swoop + Math.sin(c.t * 5 + o.ph) * 0.4;
  c.roll = Math.sin(c.t * 4 + o.ph) * 0.25;
  // drift the colony towards the player a little so they stay in view
  gr.x += (M.p.x - gr.x) * 0.02 * dt;
  gr.z += (M.p.z - gr.z) * 0.02 * dt;
  if (M.rng.next() < dt * 0.05 && c.d < 20) M.sfx('bat_flutter', c, 0.5);
}

// owls sit on a branch in front of the trunk, turn their heads at you, and glide off when you get close
function owlAI(c, dt, M) {
  const d = M.dist(c);
  if (c.state === 'fly') {
    c.flyT += dt;
    c.x += Math.sin(c.yaw) * 6 * dt;
    c.z += Math.cos(c.yaw) * 6 * dt;
    c.y += 1.2 * dt;
    c.anim = 'fly'; c.fps = 6;
    if (c.flyT > 8) M.kill(c);
    return;
  }
  if (c.tree) {
    const cam = M.game.camera.position, t = c.tree;
    const a = Math.atan2(cam.x - t.x, cam.z - t.z);
    const r = (t.r || 0.4) + 0.18;
    c.x = t.x + Math.sin(a) * r;
    c.z = t.z + Math.cos(a) * r;
    c.yaw = a + (c.state === 'look' ? 0 : 0.35);
  }
  c.y = c.perchH;
  c.timer -= dt;
  if (d < 7 + M.speed * 0.4) {
    c.state = 'fly'; c.flyT = 0; c.air = true; c.yaw = awayFrom(c, M.p);
    M.sfx('owl', c, 0.8);
    M.game.effects?.feathers?.(c.x, c.y + 0.3, c.z, 4);
    return;
  }
  if (d < 22) { c.state = 'look'; c.anim = 'look'; c.forceView = 'side'; }
  else {
    c.state = 'idle'; c.anim = 'idle'; c.forceView = null;
    if (c.timer < 0) { c.timer = M.rng.range(3, 7); if (c.d < 45) M.sfx('owl', c, 0.5); }
  }
  // blink now and then
  c.frame = c.anim === 'idle' ? (Math.sin(c.t * 1.3) > 0.97 ? 1 : 0) : -1;
}

// shy little ghosts drift around the gravestones, bobbing, and back off if you come too close
function wispAI(c, dt, M) {
  const d = M.dist(c);
  c.timer -= dt;
  if (c.timer < 0 || !c.tx) {
    const a = M.rng.range(0, TAU);
    c.tx = c.home.x + Math.sin(a) * M.rng.range(1, 6);
    c.tz = c.home.z + Math.cos(a) * M.rng.range(1, 6);
    c.timer = M.rng.range(3, 6);
  }
  let tx = c.tx, tz = c.tz, sp = 0.6;
  if (d < 6) {
    const a = awayFrom(c, M.p);
    tx = c.x + Math.sin(a) * 3; tz = c.z + Math.cos(a) * 3; sp = 1.6;
    if (!c.giggled && M.rng.next() < 0.5) { M.sfx('ghost_ooo', c, 0.5); }
    c.giggled = true;
  }
  const dx = tx - c.x, dz = tz - c.z, l = Math.hypot(dx, dz) || 1;
  c.x += (dx / l) * Math.min(sp, l) * dt;
  c.z += (dz / l) * Math.min(sp, l) * dt;
  // always half-turned to the viewer, swaying
  const cam = M.game.camera.position;
  c.yaw = Math.atan2(cam.x - c.x, cam.z - c.z) + Math.sin(c.t * 0.8) * 0.9;
  c.base = damp(c.base, M.groundY(c.x, c.z) + 0.5, 0.5, dt);
  c.y = c.base + Math.sin(c.t * 1.6 + c.home.x) * 0.18;
  // fade with daylight and when spooked
  const want = (1 - Math.min(1, M.night * 1.6)) * 0.9 + (d < 4 ? 0.45 : 0);
  if (!c.fadeIn && !c.dying) c.fade = damp(c.fade, Math.min(0.85, want), 2, dt);
  c.emissive = 0.6 + Math.sin(c.t * 3) * 0.12;
}

// the raccoon raids a bin, freezes when you show up, then waddles off fast
function raccoonAI(c, dt, M) {
  const d = M.dist(c);
  if (c.state === 'run') {
    c.yaw = angleDamp(c.yaw, awayFrom(c, M.p), 2, dt);
    walk(c, dt, 5.5, M);
    c.anim = 'run'; c.fps = 12;
    c.timer -= dt;
    if (c.timer < 0) M.kill(c);
    return;
  }
  if (c.state === 'freeze') {
    c.timer -= dt;
    c.anim = 'idle'; c.fps = 0;
    c.yaw = angleDamp(c.yaw, toward(c, M.p.x, M.p.z), 6, dt);
    if (c.timer < 0 || d < 5) { c.state = 'run'; c.timer = 8; c.yaw = awayFrom(c, M.p); M.sfx('chirp', c, 0.4); }
    return;
  }
  c.anim = 'rummage'; c.fps = 3;
  if (d < 10 + M.speed * 0.4) { c.state = 'freeze'; c.timer = 0.9; }
}
