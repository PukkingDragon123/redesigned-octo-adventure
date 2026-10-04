// Voxel wildlife living around the rider: grazing deer and fawns that bound
// away, hopping songbirds that flutter off, geese in Vs, crow swirls, circling
// gulls by the sea, rabbits, foxes that pounce on mice, squirrels and chipmunks
// that dash up trees, paddling ducks, frogs, jumping trout and salmon,
// butterflies and dragonflies by day; bats and owls by night; a cheeky raccoon
// raiding a bin in the village after dark; and the residents (wildlife.js):
// the meadow herds, the marsh moose, the graveyard crows and the dam's beaver.
//
// Creatures spawn in suitable spots near the player, react to Hank, and
// despawn when far away. Each is a little voxel puppet (voxel/models/animals.js)
// posed procedurally every frame (critterAnim.js); all creatures of a species
// are drawn by one instanced call (render/voxelRig.js). Off-screen and far
// creatures are not posed at all, and distant ones are posed at a lower rate.
import * as THREE from 'three';
import { G } from '../render/shaderlib.js';
import { RNG } from '../core/noise.js';
import { angleDamp, damp, wrapAngle } from '../core/math.js';
import { riverInfo, villageMask, seaSDF } from '../world/terrain.js';
import { P as PX } from '../render/particles.js';
import * as L from '../world/layout.js';
import { SPECIES, rigDef } from '../voxel/models/animals.js';
import { RigSpecies, PS, MS, composePose } from '../render/voxelRig.js';
import { poseCritter } from './critterAnim.js';

const TAU = Math.PI * 2;
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _pm = new THREE.Matrix4();
const _fr = new THREE.Frustum();
const _sph = new THREE.Sphere();
const DEER = new Set(['deer', 'fawn', 'buck']);
const SONGBIRDS = ['robin', 'chickadee', 'bluejay', 'sparrow'];
// instance capacity per species, and who casts a shadow (small and flying things don't)
const RIG = {
  deer: [14, 1], fawn: [8, 1], buck: [6, 1], moose: [2, 1], fox: [3, 1], raccoon: [2, 1], bin: [2, 1], rabbit: [8, 1],
  squirrel: [8, 0], chipmunk: [8, 0], mouse: [3, 0], robin: [12, 0], chickadee: [12, 0], bluejay: [12, 0], sparrow: [12, 0],
  crow: [26, 0], gull: [12, 0], goose: [14, 0], mallard: [8, 0], duckHen: [8, 0], owl: [2, 0], bat: [12, 0], frog: [5, 0],
  trout: [2, 0], salmon: [2, 0], monarch: [10, 0], sulphur: [10, 0], dragonfly: [3, 0], beaver: [1, 0], duchess: [1, 1], biscuit: [1, 1],
};
// species built a few frames apart after start-up, most common first, so the first spawn of each doesn't hitch
const WARM = ['deer', 'fawn', 'rabbit', 'squirrel', 'chipmunk', 'robin', 'chickadee', 'sparrow', 'bluejay', 'crow', 'goose', 'gull', 'mallard', 'duckHen',
  'monarch', 'sulphur', 'fox', 'frog', 'trout', 'salmon', 'dragonfly', 'mouse', 'bat', 'owl', 'raccoon', 'bin', 'buck', 'moose', 'beaver'];

export class Critters {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(4242);
    this.list = [];
    this.groups = [];
    this.rigs = new Map();
    this.pool = new Map();
    this.warm = WARM.slice();
    this.frame = 0;
    this.ids = 0;
    this.W = { px: 0, py: 0, pz: 0, h: (x, z) => game.world.terrain.heightAt(x, z) };
    this.timers = { herd: 1, rabbit: 2, fox: 8, squirrel: 1.5, songbird: 2, geese: 25, crows: 6, gulls: 3, ducks: 2, frog: 3, fish: 4, butterfly: 1, dragonfly: 2, bat: 1, owl: 3, raccoon: 4, road: 8 };
    this.enabled = true;
    // debug: ?critters=deer:3,fawn:2 places creatures in front of the camera; ?calm makes them tame
    this.calm = !!game.params?.has('calm');
    this.debug = game.params?.get('critters');
    // build the other species' meshes while the browser is idle (one at a time)
    if (typeof requestIdleCallback === 'function') {
      const next = (dl) => {
        if (this.warm.length && (dl.timeRemaining() > 8 || dl.didTimeout)) this.rig(this.warm.shift());
        if (this.warm.length) requestIdleCallback(next, { timeout: 4000 });
      };
      requestIdleCallback(next, { timeout: 4000 });
    }
  }

  // the instanced puppet for a species, built on first use
  rig(kind) {
    let sp = this.rigs.get(kind);
    if (sp) return sp;
    const i = this.warm.indexOf(kind);
    if (i >= 0) this.warm.splice(i, 1);
    const r = SPECIES[kind]();
    const [max, shadow] = RIG[kind] || [6, 0];
    sp = new RigSpecies(kind, rigDef(r), { max, shadow: !!shadow });
    sp.arch = r.arch;
    sp.meta = r.meta;
    this.rigs.set(kind, sp);
    this.game.scene.add(sp.mesh);
    return sp;
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
    const sp = this.rig(kind);
    const free = this.pool.get(kind);
    const buf = free?.pop() || { P: new Float32Array(sp.nb * PS), M: new Float32Array(sp.nb * MS) };
    const c = {
      kind, x, z, y: o.y ?? this.groundY(x, z), vx: 0, vy: 0, vz: 0, yaw: o.yaw ?? this.rng.range(0, TAU),
      anim: o.anim ?? 'idle', state: o.state ?? 'idle', timer: o.timer ?? this.rng.range(1, 4), t: this.rng.range(0, 10),
      air: o.air ?? false, fade: 1, fadeIn: true, dead: false, bob: 0, sx: o.scale ?? 1,
      ai: o.ai, group: o.group ?? null, despawn: o.despawn ?? 150, maxDraw: o.maxDraw ?? 200,
      home: { x, z }, cat: o.cat ?? kind, d: 1e9, resident: !!o.resident,
      id: this.ids++, sp, P: buf.P, M: buf.M, buf, A: {}, pdt: 0, posed: false,
    };
    this.list.push(c);
    return c;
  }
  kill(c) {
    if (!c.resident) c.dying = true;
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
    else fx?.ps.spawn({ x, y: 0.04, z, life: 0.7, size: 0.3 * big, size1: 1.4 * big, sprite: PX.ring, color: [0.85, 0.95, 1], alpha: 0.7 });
  }

  update(dt) {
    if (!this.enabled) return;
    const g = this.game;
    this.p = g.playerPos;
    this.night = G.uNight.value;
    this.hour = ((g.world.atmosphere.hour % 24) + 24) % 24;
    const sp = g.onFoot ? Math.hypot(g.walker.vel?.x || 0, g.walker.vel?.z || 0) : g.bike.speed;
    this.speed = sp || 0;
    for (const k in this.timers) this.timers[k] -= dt;
    if (this.warm.length && this.frame % 8 === 0 && typeof requestIdleCallback !== 'function') this.rig(this.warm.shift());
    if (this.debug && g.mode !== 'boot') this.spawnDebug();
    if (g.mode !== 'title') this.spawnAll();
    const p = this.p;
    let dead = false;
    for (const c of this.list) {
      c.d = Math.hypot(c.x - p.x, c.z - p.z);
      if (c.fadeIn) { c.fade = Math.max(0, c.fade - dt * 2); if (c.fade <= 0) c.fadeIn = false; }
      if (c.dying) { c.fade = Math.min(1, c.fade + dt * 2); if (c.fade >= 1) c.dead = true; }
      if (c.d > c.despawn && !c.dying) this.kill(c);
      // residents doze when nobody is near
      if (c.resident && c.d > 220) continue;
      c.t += dt;
      if (!c.dead) c.ai?.(c, dt, this);
      dead ||= c.dead;
    }
    for (const gr of this.groups) gr.update?.(dt, this);
    if (dead) {
      for (const c of this.list) if (c.dead) { let f = this.pool.get(c.kind); if (!f) this.pool.set(c.kind, (f = [])); f.push(c.buf); }
      this.list = this.list.filter((c) => !c.dead);
      this.groups = this.groups.filter((gr) => gr.members.some((c) => !c.dead));
    }
    this.draw(dt);
  }

  // ---------------------------------------------------------------- spawning
  // a spawn timer ran out: rewind it and say so
  due(k, a, b) {
    if (this.timers[k] > 0) return false;
    this.timers[k] = this.rng.range(a, b);
    return true;
  }
  spawnAll() {
    const R = this.rng, n = this.night, h = this.hour;
    const day = n < 0.35, dusk = (h > 17 && h < 21) || (h > 5 && h < 8.5);
    const p = this.p;
    if (this.due('herd', 6, 12) && n < 0.7 && this.count((c) => DEER.has(c.kind) && !c.resident) < 5) this.spawnHerd();
    if (this.due('rabbit', 4, 8) && n < 0.8 && this.countCat('rabbit') < 4) this.spawnRabbits();
    if (this.due('fox', 14, 26) && (dusk || (day && R.next() < 0.4)) && this.countCat('fox') < 1) this.spawnFox();
    if (this.due('squirrel', 3, 6) && n < 0.6 && this.countCat('squirrel') < 5) this.spawnSquirrel();
    if (this.due('road', 20, 45) && n < 0.6 && this.countCat('roadSquirrel') < 1) this.spawnRoadSquirrel();
    if (this.due('songbird', 3, 7) && day && this.groups.filter((gr) => gr.kind === 'songbird').length < 2) this.spawnSongbirds();
    if (this.due('geese', 50, 100) && n < 0.6 && !this.groups.some((gr) => gr.kind === 'geese')) this.spawnGeese();
    if (this.due('crows', 20, 40) && n < 0.75 && !this.groups.some((gr) => gr.kind === 'crows')) this.spawnCrows();
    if (this.due('gulls', 6, 12) && n < 0.6 && seaSDF(p.x, p.z) < 90 && this.countCat('gull') < 7) this.spawnGulls();
    if (this.due('ducks', 5, 10) && n < 0.6 && this.countCat('duck') < 5) this.spawnDucks();
    if (this.due('frog', 3, 7) && this.countCat('frog') < 4) this.spawnFrog();
    if (this.due('fish', 4, 9) && n < 0.8 && this.countCat('fish') < 1) this.spawnFish();
    if (this.due('butterfly', 2, 5) && day && this.countCat('butterfly') < 7) this.spawnButterflies();
    if (this.due('dragonfly', 3, 6) && day && this.countCat('dragonfly') < 3) this.spawnDragonfly();
    if (this.due('bat', 3, 6) && n > 0.45 && this.countCat('bat') < 7) this.spawnBats();
    if (this.due('owl', 10, 20) && n > 0.45 && this.countCat('owl') < 2) this.spawnOwl();
    if (this.due('raccoon', 10, 20) && (n > 0.35 || h > 18.5) && this.countCat('raccoon') < 1) this.spawnRaccoon();
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
  // a squirrel dashing across the road in front of the bike
  spawnRoadSquirrel() {
    const g = this.game;
    if (g.onFoot || g.bike.speed < 4 || g.bike.surface !== 'road') return;
    const f = g.bike.forward(_v);
    const side = this.rng.sign();
    const rx = -f.z * side, rz = f.x * side;
    const x = this.p.x + f.x * 14 - rx * 4, z = this.p.z + f.z * 14 - rz * 4;
    const c = this.add('squirrel', x, z, { anim: 'run', ai: squirrelAI, state: 'dash', cat: 'roadSquirrel', maxDraw: 70, despawn: 60, scale: 1.15 });
    c.yaw = Math.atan2(rx, rz);
    c.dash = 2.2;
    c.fade = 0; c.fadeIn = false;
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
      const c = this.add('goose', start.x, start.z, { y: gr.alt, air: true, anim: 'fly', ai: gooseAI, group: gr, despawn: 400, cat: 'goose', yaw: Math.atan2(dir.x, dir.z), scale: 1.5, maxDraw: 320 });
      c.off = { side: sd * row * 2.6, back: row * 2.9 };
      // wingbeats ripple back along the V
      c.fph = row * 0.13;
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
      const c = this.add('crow', s.x, s.z, { y: gr.alt, air: true, anim: 'fly', ai: swirlAI, group: gr, despawn: 220, cat: 'crow', scale: 1.35 });
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
      const c = this.add('gull', s.x, s.z, { y: this.rng.range(7, 16), air: true, anim: 'glide', ai: swirlAI, group: gr, cat: 'gull', scale: 1.3 });
      c.orbit = { a: this.rng.range(0, TAU), r: this.rng.range(7, 16), w: this.rng.range(0.2, 0.4) * this.rng.sign(), ph: this.rng.range(0, TAU), h: this.rng.range(3, 10), glide: true };
      gr.members.push(c);
    }
    this.groups.push(gr);
    const beach = this.find(15, 50, (x, z, h) => h > 0.05 && h < 1.8 && seaSDF(x, z) < 14, 10, 0.8);
    if (beach) for (let i = 0, n = this.rng.int(1, 3); i < n; i++) this.add('gull', beach.x + this.rng.range(-2, 2), beach.z + this.rng.range(-2, 2), { anim: 'idle', ai: loafAI, cat: 'gull', maxDraw: 90 });
  }
  spawnDucks() {
    const s = this.find(18, 60, (x, z, h) => h < -0.8 && seaSDF(x, z) > 30, 10, 0.7);
    if (!s) return;
    const gr = { kind: 'ducks', members: [], scared: 0 };
    for (let i = 0, n = this.rng.int(2, 4); i < n; i++) {
      const c = this.add(i === 0 ? 'mallard' : this.rng.next() < 0.5 ? 'duckHen' : 'mallard', s.x + this.rng.range(-2, 2), s.z + this.rng.range(-2, 2), { y: 0, anim: 'swim', ai: duckAI, group: gr, cat: 'duck', maxDraw: 110 });
      if (this.water(c.x, c.z)) gr.members.push(c);
      else c.dead = true;
    }
    this.groups.push(gr);
  }
  spawnFrog() {
    const s = this.find(10, 35, (x, z, h) => this.isShore(x, z, h), 12, 0.8);
    if (s) this.add('frog', s.x, s.z, { anim: 'idle', ai: frogAI, cat: 'frog', maxDraw: 45, despawn: 70 });
  }
  spawnFish() {
    const s = this.find(10, 40, (x, z, h) => h < -0.9, 10, 0.8);
    if (!s) return;
    const c = this.add(this.rng.next() < 0.35 ? 'salmon' : 'trout', s.x, s.z, { y: -0.1, anim: 'jump', ai: fishAI, cat: 'fish', maxDraw: 80 });
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
      const c = this.add(this.rng.next() < 0.6 ? 'monarch' : 'sulphur', s.x + this.rng.range(-2, 2), s.z + this.rng.range(-2, 2), { anim: 'fly', air: true, ai: butterflyAI, cat: 'butterfly', maxDraw: 45, despawn: 70, scale: 1.3 });
      c.y += this.rng.range(0.4, 1.4);
    }
  }
  spawnDragonfly() {
    const s = this.find(8, 30, (x, z, h) => h > -0.6 && h < 0.8 && this.waterDirAt(x, z, 4) !== null, 10, 0.8);
    if (!s) return;
    const c = this.add('dragonfly', s.x, s.z, { anim: 'fly', air: true, ai: dragonflyAI, cat: 'dragonfly', maxDraw: 40, despawn: 60, scale: 1.3 });
    c.y = Math.max(0, this.height(s.x, s.z)) + 0.8;
  }
  spawnBats() {
    const gy = L.POI.graveyard;
    const s = Math.hypot(this.p.x - gy.x, this.p.z - gy.z) < 80 && this.rng.next() < 0.6 ? { x: gy.x + this.rng.range(-15, 15), z: gy.z + this.rng.range(-15, 15) } : this.around(15, 45, 0.8);
    const gr = { kind: 'bats', members: [], x: s.x, z: s.z };
    for (let i = 0, n = this.rng.int(2, 4); i < n; i++) {
      const c = this.add('bat', s.x, s.z, { y: Math.max(0, this.height(s.x, s.z)) + this.rng.range(4, 8), anim: 'fly', air: true, ai: batAI, group: gr, cat: 'bat', despawn: 120, maxDraw: 90, scale: 1.4 });
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
    this.perchOwl(this.add('owl', t.x, t.z, { anim: 'idle', ai: owlAI, cat: 'owl', maxDraw: 80 }), t);
  }
  // on the side of the trunk facing the player, looking out
  perchOwl(c, t) {
    c.tree = t;
    c.perchH = (t ? this.groundY(t.x, t.z) : c.y) + this.rng.range(2.4, 3.6);
    if (!t) return;
    const a = Math.atan2(this.p.x - t.x, this.p.z - t.z) + this.rng.range(-0.6, 0.6);
    const r = (t.r || 0.4) + 0.2;
    c.x = t.x + Math.sin(a) * r;
    c.z = t.z + Math.cos(a) * r;
    c.yaw = a;
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
      this.binAndRaccoon(x, z, a + 1.4);
      return;
    }
  }
  binAndRaccoon(x, z, a) {
    const bin = this.add('bin', x, z, { anim: 'idle', cat: 'raccoon', maxDraw: 80, despawn: 90, yaw: this.rng.range(0, TAU) });
    const c = this.add('raccoon', x + Math.sin(a) * 0.5, z + Math.cos(a) * 0.5, { anim: 'rummage', ai: raccoonAI, state: 'rummage', cat: 'raccoon', maxDraw: 80, despawn: 90 });
    c.yaw = Math.atan2(x - c.x, z - c.z);
    c.bin = bin;
    bin.rum = 1;
    return c;
  }

  // place a creature of a kind with its usual behaviour
  place(kind, x, z, o = {}) {
    if (DEER.has(kind)) {
      const herd = o.group || { x, z, alarm: 0, fleeYaw: 0 };
      const c = this.add(kind, x, z, { ai: deerAI, group: herd, state: this.rng.next() < 0.5 ? 'graze' : 'idle', cat: 'deer', ...o });
      herd.lead ||= c;
      return c;
    }
    if (kind === 'rabbit') return this.add(kind, x, z, { anim: 'idle', ai: rabbitAI, cat: 'rabbit', maxDraw: 90, ...o });
    if (kind === 'fox') return this.add(kind, x, z, { anim: 'walk', ai: foxAI, state: 'trot', cat: 'fox', ...o });
    if (kind === 'squirrel' || kind === 'chipmunk') return this.add(kind, x, z, { anim: 'idle', ai: squirrelAI, state: 'forage', cat: 'squirrel', maxDraw: 70, despawn: 90, scale: 1.15, ...o });
    if (SONGBIRDS.includes(kind)) return this.add(kind, x, z, { anim: 'peck', ai: songbirdAI, state: 'ground', cat: 'songbird', maxDraw: 60, despawn: 90, scale: 1.25, ...o, group: o.group || { kind: 'songbird', members: [], scared: 0 } });
    if (kind === 'owl') { const c = this.add(kind, x, z, { anim: 'idle', ai: owlAI, cat: 'owl', ...o }); this.perchOwl(c, this.nearestTree(x, z, 12)); return c; }
    if (kind === 'bat') { const gr = { x, z }; const c = this.add(kind, x, z, { anim: 'fly', air: true, ai: batAI, group: gr, cat: 'bat', scale: 1.4, ...o }); c.orbit = { a: 0, r: 3, w: 1.6, ph: 0, h: 3 }; c.y += 3; return c; }
    if (kind === 'monarch' || kind === 'sulphur') { const c = this.add(kind, x, z, { anim: 'fly', air: true, ai: butterflyAI, cat: 'butterfly', scale: 1.3, ...o }); c.y += 0.8; return c; }
    if (kind === 'frog') return this.add(kind, x, z, { anim: 'idle', ai: frogAI, cat: 'frog', ...o });
    if (kind === 'raccoon') return this.binAndRaccoon(x + 0.5, z, -Math.PI / 2);
    if (kind === 'mallard' || kind === 'duckHen') return this.add(kind, x, z, { y: 0, anim: 'swim', ai: duckAI, cat: 'duck', maxDraw: 110, ...o, group: o.group || { kind: 'ducks', members: [], scared: 0 } });
    if (kind === 'mouse') return this.add(kind, x, z, { anim: 'run', ai: mouseAI, cat: 'mouse', maxDraw: 40, despawn: 50, ...o });
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
      if (!SPECIES[kind]) continue;
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
  draw(dt) {
    const cam = this.game.camera;
    const cp = cam.position;
    cam.updateMatrixWorld();
    _pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    _fr.setFromProjectionMatrix(_pm);
    for (const sp of this.rigs.values()) sp.begin();
    const W = this.W, p = this.p;
    W.px = p.x; W.py = p.y + 1.1; W.pz = p.z;
    const frame = ++this.frame;
    for (const c of this.list) {
      if (c.dead || c.hidden) continue;
      c.pdt += dt;
      const dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z;
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd > c.maxDraw * c.maxDraw) continue;
      const r = c.sp.meta.radius * c.sx;
      _sph.center.set(c.x, c.y + c.bob + r * 0.5, c.z);
      _sph.radius = r + 0.4;
      if (!_fr.intersectsSphere(_sph)) continue;
      // pose: every frame up close, every 2nd frame in the middle distance, every 4th far away
      const rate = dd < 900 ? 1 : dd < 4900 ? 2 : 4;
      if (!c.posed || (frame + c.id) % rate === 0) {
        let pdt = c.pdt;
        if (pdt > 0.3) { c.lx = undefined; pdt = 0.05; } // back in view after a long while: don't sprint to catch up
        c.near = dd < 2025;
        poseCritter(c, pdt, W);
        composePose(c.sp, c.P, c.M);
        c.pdt = 0;
        c.posed = true;
      }
      // the drawn heading follows the AI's with a quick ease, so sudden turns don't snap
      const vdt = c.vt === undefined ? 1 : frame - c.vt > 2 ? 1 : dt;
      c.vt = frame;
      c.ry = vdt >= 1 ? c.yaw : c.ry + wrapAngle(c.yaw - c.ry) * (1 - Math.exp(-14 * vdt));
      c.sp.push(c.M, c.x, c.y + c.bob, c.z, c.ry, c.sx, c.fade);
    }
    for (const sp of this.rigs.values()) sp.end();
  }
}

// ---------------------------------------------------------------- behaviours
function walk(c, dt, speed, M) {
  c.x += Math.sin(c.yaw) * speed * dt;
  c.z += Math.cos(c.yaw) * speed * dt;
  c.y = M.height(c.x, c.z);
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
    if (c === H.lead && M.rng.next() < 0.5) M.sfx('deer', c);
  }
  if ((c.state === 'alert' && (c.timer < 0 || d < scare)) || (H.alarm > 0 && c.state !== 'flee')) {
    c.state = 'flee';
    if (!H.alarm) H.fleeYaw = awayFrom(c, p) + M.rng.range(-0.5, 0.5);
    H.alarm = 8;
    c.timer = M.rng.range(5, 8);
    c.fleeYaw = H.fleeYaw + M.rng.range(-0.25, 0.25);
    c.ph = M.rng.range(0, 1);
  }
  c.timer -= dt;
  if (c.state === 'flee') {
    H.alarm = Math.max(0.01, H.alarm - dt);
    // spin round on the spot first, then bound away
    c.fleeYaw = angleDamp(c.fleeYaw, d < 30 ? awayFrom(c, p) : H.fleeYaw, 1.5, dt);
    c.yaw = angleDamp(c.yaw, c.fleeYaw, 7, dt);
    avoidWater(c, M, 6);
    c.spd = damp(c.spd || 0, fawn ? 8.5 : 9.5, 2.5, dt);
    walk(c, dt, c.spd, M);
    c.anim = 'run';
    if (c.timer < 0 && d > 45) { c.state = 'idle'; c.timer = M.rng.range(2, 4); H.alarm = 0; }
    return;
  }
  c.spd = damp(c.spd || 0, c.state === 'walk' ? (fawn ? 1.3 : 1.1) : 0, 3, dt);
  if (c.state === 'alert') {
    c.anim = 'alert';
    c.yaw = angleDamp(c.yaw, toward(c, p.x, p.z), 2.5, dt);
    walk(c, dt, c.spd, M);
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
      c.walkYaw = far ? toward(c, tx, tz) : c.yaw + M.rng.range(-1.4, 1.4);
    }
  }
  if (c.state === 'walk') {
    c.yaw = angleDamp(c.yaw, c.walkYaw ?? c.yaw, 2, dt);
    avoidWater(c, M);
    c.anim = 'walk';
  } else c.anim = c.state === 'graze' ? 'graze' : 'idle';
  walk(c, dt, c.spd, M);
}

// rabbits nibble, sit up when they hear you, then zig-zag away in big hops
function rabbitAI(c, dt, M) {
  const d = M.dist(c), p = M.p;
  c.timer -= dt;
  if (c.state === 'hop' || c.state === 'flee') {
    c.hopT += dt;
    const dur = c.state === 'flee' ? 0.34 : 0.45, len = c.state === 'flee' ? 1.9 : 0.6;
    const k = Math.min(1, c.hopT / dur);
    // a crouch, a spring, an arc, a landing: the body leaves the ground between 0.12 and 0.9
    const air = Math.max(0, Math.min(1, (k - 0.12) / 0.78));
    c.x += Math.sin(c.yaw) * (len / (dur * 0.78)) * dt * (air > 0 && air < 1 ? 1 : 0);
    c.z += Math.cos(c.yaw) * (len / (dur * 0.78)) * dt * (air > 0 && air < 1 ? 1 : 0);
    c.y = M.height(c.x, c.z);
    c.bob = Math.sin(air * Math.PI) * (c.state === 'flee' ? 0.38 : 0.12);
    c.anim = 'hop';
    c.hopK = k;
    if (k >= 1) {
      c.hopT = 0;
      c.hops--;
      if (c.state === 'flee') c.yaw = awayFrom(c, p) + (c.hops % 2 ? 0.6 : -0.6) * M.rng.range(0.6, 1.2);
      avoidWater(c, M, 2);
      if (c.hops <= 0 && (c.state !== 'flee' || d > 30)) { c.state = 'idle'; c.timer = M.rng.range(1, 3); c.bob = 0; }
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
  c.anim = c.state === 'nibble' ? 'nibble' : 'idle';
}

// foxes trot about, stop to listen, crouch with a wiggle and pounce nose-first into the grass
function foxAI(c, dt, M) {
  const d = M.dist(c), p = M.p;
  c.timer -= dt;
  if (c.state !== 'flee' && d < 16 + M.speed * 0.9) {
    c.state = 'flee';
    c.timer = M.rng.range(4, 6);
    c.bob = 0;
  }
  if (c.state === 'flee') {
    c.yaw = angleDamp(c.yaw, awayFrom(c, p), 4, dt);
    avoidWater(c, M, 4);
    c.spd = damp(c.spd || 0, 8, 3, dt);
    walk(c, dt, c.spd, M);
    c.anim = 'run';
    if (c.timer < 0 && d > 40) { c.state = 'trot'; c.timer = 3; }
    return;
  }
  if (c.state === 'crouch') {
    c.crT += dt;
    c.crK = Math.min(1, c.crT / 0.9);
    c.anim = 'crouch';
    if (c.crT > 0.9) { c.state = 'pounce'; c.pT = 0; }
    return;
  }
  if (c.state === 'pounce') {
    c.pT += dt;
    const k = Math.min(1, c.pT / 0.75);
    c.pK = k;
    c.x += Math.sin(c.yaw) * 2.2 * dt;
    c.z += Math.cos(c.yaw) * 2.2 * dt;
    c.y = M.height(c.x, c.z);
    c.bob = Math.sin(k * Math.PI) * 0.75;
    c.anim = 'pounce';
    if (k >= 1) {
      c.state = 'idle'; c.timer = M.rng.range(1, 2.5); c.bob = 0; c.pK = 0;
      const nx = c.x + Math.sin(c.yaw) * 0.35, nz = c.z + Math.cos(c.yaw) * 0.35;
      M.game.effects?.poof?.(nx, c.y + 0.1, nz, { scale: 0.45, color: [0.82, 0.74, 0.55], count: 4 });
      M.game.effects?.spawnLeaf && [0, 1, 2].forEach(() => M.game.effects.spawnLeaf(c.x, c.y + 0.2, c.z, { vx: M.rng.range(-1, 1), vy: M.rng.range(1.5, 2.5), vz: M.rng.range(-1, 1), gravity: 3, life: 3, rest: 1.5 }));
      // missed! the mouse scampers off through the grass
      if (M.rng.next() < 0.5 && M.countCat('mouse') < 2) {
        const mo = M.place('mouse', nx, nz, { yaw: c.yaw + M.rng.range(-1.2, 1.2) });
        mo.fade = 0; mo.fadeIn = false;
      }
    }
    return;
  }
  if (c.timer < 0) {
    const r = M.rng.next();
    if (c.state === 'listen' && r < 0.6) { c.state = 'crouch'; c.crT = 0; return; }
    c.state = r < 0.45 ? 'trot' : r < 0.75 ? 'listen' : 'sit';
    c.timer = M.rng.range(2, 5);
    if (c.state === 'trot') c.trotYaw = c.yaw + M.rng.range(-1.2, 1.2);
  }
  c.spd = damp(c.spd || 0, c.state === 'trot' ? 1.7 : 0, 4, dt);
  if (c.state === 'trot') { c.yaw = angleDamp(c.yaw, c.trotYaw ?? c.yaw, 3, dt); avoidWater(c, M); c.anim = 'walk'; }
  else c.anim = c.state === 'sit' ? 'sit' : 'listen';
  walk(c, dt, c.spd, M);
}

// mice: a frantic zig-zag through the grass, then gone
function mouseAI(c, dt, M) {
  c.timer -= dt;
  if (c.timer < 0) { c.timer = M.rng.range(0.2, 0.5); c.yaw += M.rng.range(-0.9, 0.9); }
  walk(c, dt, 2.2, M);
  c.anim = 'run';
  if (c.t > 2.5) M.kill(c);
}

// squirrels and chipmunks forage, then sprint to the nearest trunk and up it
function squirrelAI(c, dt, M) {
  const d = M.dist(c), p = M.p;
  c.timer -= dt;
  if (c.state === 'dash') {
    // the road-crossing squirrel: straight across in front of the bike, then off into the trees
    c.dash -= dt;
    walk(c, dt, 5, M);
    c.anim = 'run';
    if (c.dash < 0) { c.state = 'forage'; c.timer = 1; }
    return;
  }
  if (c.state === 'forage') {
    if (d < 9 + M.speed * 0.5) {
      const t = M.nearestTree(c.x, c.z, 14);
      if (t) { c.state = 'toTree'; c.tree = t; } else { c.state = 'flee'; c.timer = 3; c.yaw = awayFrom(c, p); }
      M.sfx('chirp', c, 0.4);
      return;
    }
    if (c.dash > 0) {
      c.dash -= dt;
      walk(c, dt, 4, M);
      c.anim = 'run';
      return;
    }
    if (c.timer < 0) {
      const r = M.rng.next();
      if (r < 0.35) { c.dash = M.rng.range(0.25, 0.6); c.yaw += M.rng.range(-2, 2); }
      c.anim = r < 0.7 ? 'eat' : 'idle';
      c.timer = M.rng.range(1, 3);
    }
    return;
  }
  if (c.state === 'toTree' || c.state === 'flee') {
    if (c.state === 'toTree') {
      const t = c.tree;
      const r = (t.r || 0.4) + 0.08;
      c.yaw = angleDamp(c.yaw, toward(c, t.x, t.z), 12, dt);
      if (Math.hypot(t.x - c.x, t.z - c.z) < r + 0.15) {
        c.state = 'climb'; c.ch = 0; c.baseY = c.y; c.top = Math.min(4.5, (t.tree?.H || 8) * 0.4) + M.rng.range(0, 1);
        // up the side facing the camera, so it can be seen
        const cam = M.game.camera.position;
        c.climbA = Math.atan2(cam.x - t.x, cam.z - t.z) + M.rng.range(-0.5, 0.5);
      }
    } else if (c.timer < 0) c.state = 'forage';
    walk(c, dt, 6.5, M);
    c.anim = 'run';
    return;
  }
  // climbing: belly to the bark, nose up
  const t = c.tree;
  const r = (t.r || 0.4) + 0.03;
  c.x = t.x + Math.sin(c.climbA) * r;
  c.z = t.z + Math.cos(c.climbA) * r;
  c.yaw = c.climbA + Math.PI;
  if (c.state === 'climb') {
    c.ch += dt * 2.6;
    c.y = c.baseY + Math.min(c.ch, c.top);
    c.anim = 'climb';
    if (c.ch >= c.top) { c.state = 'perch'; c.timer = M.rng.range(2, 5); }
  } else c.anim = 'perch';
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
        c.yaw = awayFrom(c, p) + M.rng.range(-0.7, 0.7);
        c.vy = M.rng.range(3.5, 5);
        c.spd = M.rng.range(5, 7);
        c.flyT = 0;
        c.bob = 0;
        M.game.effects?.feathers?.(c.x, c.y + 0.1, c.z, 2);
      }
    }
    c.timer -= dt;
    if (c.hopT > 0) {
      c.hopT -= dt;
      c.x += Math.sin(c.yaw) * 1.1 * dt;
      c.z += Math.cos(c.yaw) * 1.1 * dt;
      c.y = M.height(c.x, c.z);
      c.hopK = 1 - Math.max(0, c.hopT) / 0.22;
      c.bob = Math.sin(c.hopK * Math.PI) * 0.1;
      c.anim = 'hop';
      if (c.hopT <= 0) { c.bob = 0; c.anim = 'idle'; }
      return;
    }
    if (c.timer < 0) {
      const r = M.rng.next();
      if (r < 0.4) { c.hopT = 0.22; c.yaw += M.rng.range(-1.2, 1.2); }
      c.anim = r < 0.75 ? 'peck' : 'idle';
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
  c.yaw += Math.sin(c.t * 3 + c.id) * 0.6 * dt;
  c.anim = 'fly';
  if (c.flyT > 7 || c.d > 70) M.kill(c);
}

function gooseAI(c, dt) {
  const gr = c.group;
  const rx = gr.dir.z, rz = -gr.dir.x;
  c.x = gr.x + rx * c.off.side - gr.dir.x * c.off.back;
  c.z = gr.z + rz * c.off.side - gr.dir.z * c.off.back;
  c.y = gr.alt + Math.sin(c.t * 1.3 + c.off.side) * 0.4;
  c.yaw = Math.atan2(gr.dir.x, gr.dir.z);
  // they glide now and then, the whole V together
  c.glide = Math.sin(gr.t * 0.4 + c.off.back * 0.05) > 0.7;
  c.anim = 'fly';
}

// crows and gulls circle a slowly drifting centre, rising and falling
function swirlAI(c, dt, M) {
  const gr = c.group, o = c.orbit;
  if (o.scared) c.y += 4 * dt;
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
  c.anim = Math.cos(c.t * 0.9 + o.ph) > 0.3 || o.scared ? 'fly' : 'glide';
}

// gulls loafing on the sand: they look about, and take off if you ride at them
function loafAI(c, dt, M) {
  const d = M.dist(c);
  if (c.state !== 'fly' && d < 9 + M.speed * 0.4) {
    c.state = 'fly'; c.air = true; c.anim = 'fly'; c.vy = 3; c.yaw = awayFrom(c, M.p); c.flyT = 0;
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
  if (c.timer < 0) { c.turnTo = c.yaw + M.rng.range(-1.5, 1.5); c.timer = M.rng.range(1.5, 4); }
  if (c.turnTo !== undefined) c.yaw = angleDamp(c.yaw, c.turnTo, 5, dt);
  c.anim = 'idle';
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
      c.state = 'fly'; c.air = true; c.anim = 'fly'; c.vy = 3.2; c.flyT = 0; c.yaw = awayFrom(c, p) + M.rng.range(-0.5, 0.5);
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
    c.swimYaw = c.yaw + M.rng.range(-1, 1);
  }
  if (c.state === 'swim') {
    const nx = c.x + Math.sin(c.yaw) * 1.5, nz = c.z + Math.cos(c.yaw) * 1.5;
    if (!M.water(nx, nz)) c.swimYaw = c.yaw + Math.PI * 0.7;
    else { c.x += Math.sin(c.yaw) * 0.35 * dt; c.z += Math.cos(c.yaw) * 0.35 * dt; }
    c.yaw = angleDamp(c.yaw, c.swimYaw ?? c.yaw, 1.5, dt);
    c.anim = 'swim';
  } else c.anim = 'dabble';
  c.y = 0.0 + Math.sin(c.t * 2 + c.x) * 0.015;
}

// frogs sit and puff, then plop into the water
function frogAI(c, dt, M) {
  const d = M.dist(c);
  if (c.state === 'leap') {
    c.lT += dt;
    const k = Math.min(1, c.lT / 0.55);
    c.lK = k;
    c.x += Math.sin(c.yaw) * 2.6 * dt;
    c.z += Math.cos(c.yaw) * 2.6 * dt;
    c.y = Math.max(M.height(c.x, c.z), 0);
    c.bob = Math.sin(k * Math.PI) * 0.45;
    c.anim = 'leap';
    if (k >= 1) {
      if (M.water(c.x, c.z)) { M.splash(c.x, c.z, 0.3); M.sfx('splash', c, 0.25); c.dead = true; }
      else { c.state = 'idle'; c.bob = 0; c.timer = 1; c.anim = 'idle'; }
    }
    return;
  }
  if (d < 4.5 + M.speed * 0.35) {
    const a = M.waterDirAt(c.x, c.z, 2.5);
    c.yaw = a ?? awayFrom(c, M.p);
    c.state = 'leap'; c.lT = 0;
    return;
  }
  c.anim = 'idle';
}

function fishAI(c, dt, M) {
  c.vy -= 9.8 * dt;
  c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
  c.yaw = Math.atan2(c.vx, c.vz);
  c.anim = 'jump';
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
    c.y = damp(c.y, ground + 0.05, 6, dt);
    if (c.timer < 0 || M.dist(c) < 2.5) { c.state = 'idle'; c.timer = 0; }
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
      c.yaw = M.dist(c) < 3 ? awayFrom(c, M.p) : M.rng.range(0, TAU);
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
  c.bankAdd = Math.sin(c.t * 4 + o.ph) * 0.25;
  // drift the colony towards the player a little so they stay in view
  gr.x += (M.p.x - gr.x) * 0.02 * dt;
  gr.z += (M.p.z - gr.z) * 0.02 * dt;
  if (M.rng.next() < dt * 0.05 && c.d < 20) M.sfx('bat_flutter', c, 0.5);
}

// owls sit against the trunk, turn their heads to watch you, and glide off when you get close
function owlAI(c, dt, M) {
  const d = M.dist(c);
  if (c.state === 'fly') {
    c.flyT += dt;
    c.yaw = angleDamp(c.yaw, c.flyYaw, 3, dt);
    c.x += Math.sin(c.yaw) * 6 * dt;
    c.z += Math.cos(c.yaw) * 6 * dt;
    c.y += 1.2 * dt;
    c.anim = 'fly';
    if (c.flyT > 8) M.kill(c);
    return;
  }
  c.y = c.perchH;
  c.timer -= dt;
  if (d < 7 + M.speed * 0.4) {
    c.state = 'fly'; c.flyT = 0; c.air = true; c.flyYaw = awayFrom(c, M.p);
    M.sfx('owl', c, 0.8);
    M.game.effects?.feathers?.(c.x, c.y + 0.3, c.z, 4);
    return;
  }
  if (d < 22) { c.state = 'look'; c.anim = 'look'; }
  else {
    c.state = 'idle'; c.anim = 'idle';
    if (c.timer < 0) { c.timer = M.rng.range(3, 7); if (c.d < 45) M.sfx('owl', c, 0.5); }
  }
}

// the raccoon raids a bin, freezes when you show up, then waddles off fast
function raccoonAI(c, dt, M) {
  const d = M.dist(c);
  if (c.state === 'run') {
    c.yaw = angleDamp(c.yaw, awayFrom(c, M.p), 3, dt);
    c.spd = damp(c.spd || 0, 5.5, 3, dt);
    walk(c, dt, c.spd, M);
    c.anim = 'run';
    c.timer -= dt;
    if (c.timer < 0) M.kill(c);
    return;
  }
  if (c.state === 'freeze') {
    c.timer -= dt;
    c.anim = 'freeze';
    c.yaw = angleDamp(c.yaw, toward(c, M.p.x, M.p.z), 6, dt);
    if (c.timer < 0 || d < 5) {
      c.state = 'run'; c.timer = 8; M.sfx('chirp', c, 0.4);
      if (c.bin) { c.bin.tipped = 1; M.sfx('crash', c.bin, 0.25); }
    }
    return;
  }
  c.anim = 'rummage';
  if (c.bin) c.bin.rum = 1;
  if (d < 10 + M.speed * 0.4) { c.state = 'freeze'; c.timer = 0.9; if (c.bin) c.bin.rum = 0; }
}

// ---------------------------------------------------------------- residents (placed by wildlife.js)
// the moose wanders the marsh, grumbling now and then
export function mooseAI(c, dt, M) {
  c.timer -= dt;
  if (c.timer < 0) {
    c.state = M.rng.next() < 0.45 ? 'idle' : M.rng.next() < 0.5 ? 'graze' : 'walk';
    c.timer = M.rng.range(4, 10);
    if (c.state === 'walk') {
      const far = Math.hypot(c.home.x - c.x, c.home.z - c.z) > 25;
      c.walkYaw = far ? toward(c, c.home.x, c.home.z) : c.yaw + M.rng.range(-1, 1);
    }
    if (c.d < 30 && M.rng.next() < 0.4) M.sfx('moose', c);
  }
  c.spd = damp(c.spd || 0, c.state === 'walk' ? 0.8 : 0, 2, dt);
  if (c.state === 'walk') c.yaw = angleDamp(c.yaw, c.walkYaw ?? c.yaw, 1, dt);
  c.anim = c.state;
  walk(c, dt, c.spd, M);
  if (c.collider) {
    // move the collider along (it lives in a spatial hash; reinsert cheaply when it strays)
    c.collider.x = c.x;
    c.collider.z = c.z;
    if (!c.lastIns || Math.hypot(c.lastIns.x - c.x, c.lastIns.z - c.z) > 4) {
      M.game.physics.solids.insert(c.collider, c.x, c.z, 2);
      c.lastIns = { x: c.x, z: c.z };
    }
  }
}

// crows on the dead tree in the graveyard: they caw, scatter when you come close, and come back
export function perchCrowAI(c, dt, M) {
  const d = M.dist(c);
  if (c.state !== 'fly' && c.state !== 'return' && d < 12) {
    c.state = 'fly';
    c.timer = 6;
    c.vx = M.rng.range(-3, 3); c.vy = M.rng.range(3, 5); c.vz = M.rng.range(-3, 3);
    c.flyT = 0;
    M.sfx('crow', c);
  }
  if (c.state === 'fly') {
    c.timer -= dt;
    c.flyT += dt;
    c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    c.vy = damp(c.vy, 0.5, 1, dt);
    c.yaw = angleDamp(c.yaw, Math.atan2(c.vx, c.vz), 5, dt);
    c.anim = 'fly';
    if (c.timer < 0 && d > 18) c.state = 'return';
    return;
  }
  if (c.state === 'return') {
    const p = c.perch;
    const tx = p.x - c.x, ty = p.y - c.y, tz = p.z - c.z;
    const l = Math.hypot(tx, ty, tz);
    if (l < 0.3) { c.state = 'idle'; c.x = p.x; c.y = p.y; c.z = p.z; }
    else { const s = Math.min(l, 6 * dt) / l; c.x += tx * s; c.y += ty * s; c.z += tz * s; }
    c.yaw = angleDamp(c.yaw, Math.atan2(tx, tz), 5, dt);
    c.anim = l < 1.2 ? 'glide' : 'fly';
    return;
  }
  c.anim = 'idle';
  c.timer -= dt;
  if (c.timer < 0) { c.timer = M.rng.range(1, 3); c.turnTo = c.yaw + M.rng.range(-1.2, 1.2); }
  if (c.turnTo !== undefined) c.yaw = angleDamp(c.yaw, c.turnTo, 6, dt);
  if (M.rng.next() < dt * 0.05 && d < 40) { M.sfx('crow', c); c.cawK = 1; }
}

// the beaver paddles circles by its dam and slaps its tail
export function beaverAI(c, dt, M) {
  const dam = c.dam;
  c.x = dam.x + Math.sin(c.t * 0.3) * 5;
  c.z = dam.z - 4 + Math.cos(c.t * 0.3) * 3;
  c.y = 0.02;
  c.yaw = Math.atan2(Math.cos(c.t * 0.3) * 5, -Math.sin(c.t * 0.3) * 3);
  c.anim = 'swim';
  if (c.slapK > 0) {
    const was = c.slapK;
    c.slapK = Math.max(0, c.slapK - dt / 0.8);
    // ...and down it comes: splash!
    if (was > 0.4 && c.slapK <= 0.4) {
      const fx = M.game.effects;
      const tx = c.x - Math.sin(c.yaw) * 0.5, tz = c.z - Math.cos(c.yaw) * 0.5;
      for (let k = 0; k < 8; k++) fx.ps.spawn({ x: tx, y: 0.05, z: tz, vx: M.rng.range(-1, 1), vy: M.rng.range(2, 3.5), vz: M.rng.range(-1, 1), life: 0.8, size: 0.1, sprite: PX.drop, color: [0.8, 0.9, 1], gravity: 9.8 });
      M.sfx('splash', c, 0.5);
    }
  } else if (M.rng.next() < dt * 0.08) c.slapK = 1;
}
