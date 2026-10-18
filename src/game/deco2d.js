// The 2D street clutter coming to life: ride or walk into a trash can, a fence
// panel, a crate or a sign and it tips over (a little 2D rigid body: it slides,
// bounces, tips past its balance point and slams down, or wobbles back up if
// the bump was gentle), lids fly off, litter and apples scatter, barrels and
// hay bales roll, firewood stacks burst into logs, and bumping the fish stall
// sends cod, salmon, mackerel and lobsters flopping across the street. Things
// put themselves back once they have been down a while and nobody is looking.
//
// The same goes for the furniture all over town (src/art/furniture2d.js):
// porch rockers tip back, café chairs and deck chairs fall over, mugs and books
// fly, leaf piles burst into leaves, beach balls roll, mums spill their dirt.
// Flat things (welcome mats, beach towels, the goods in the shop windows) are
// fixed voxel pieces on the ground or behind the glass.
//
// Placement lives in src/world/deco2d.js (world.deco2d.items / cards); the art in
// src/art/deco2d.js and furniture2d.js, sculpted pieces that are voxelised into real
// voxel models in a worker (voxel/models/clutter.js, art/decoVox.js). Every pose of every
// kind is one instanced voxel mesh; each frame the pieces in range are posed into them
// (tipping over about their foot, rolling, flopping, wobbling).
import * as THREE from 'three';
import { createVoxelMaterial } from '../render/voxelMaterial.js';
import { CATALOGUE } from '../art/decoPaint.js';
import { startDecoPaint, bakeDecoSync } from '../art/decoStart.js';
import { SpatialHash } from '../core/spatial.js';
import { clamp } from '../core/math.js';

const HALF_PI = Math.PI / 2;
const TAU = Math.PI * 2;
const DUST = [0.86, 0.8, 0.68];
const RESET_AFTER = 24; // seconds down before a knocked thing may tidy itself away
const MAX_BITS = 70;

// how each kind behaves: mode tip | ball | burst | flop | fixed; mass; crit = balance point (rad);
// fallTo = frame shown once it has tipped; bits = what spills out; text = the on-foot prompt
const KNOCK = {
  picket: { mode: 'tip', mass: 0.7, crit: 0.2, anchored: true, sound: 'land', bits: ['bit_picket'], nBits: 1, hard: 6 },
  rail: { mode: 'tip', mass: 0.9, crit: 0.22, anchored: true, sound: 'land' },
  rail2: { mode: 'tip', mass: 0.9, crit: 0.22, anchored: true, sound: 'land' },
  trashcan: { mode: 'tip', mass: 0.8, crit: 0.3, fallTo: 'trashcanOpen', lid: true, roll: true, sound: 'crash', vol: 0.45, bits: ['bit_paper', 'bit_peel', 'bit_core', 'bit_can', 'bit_news', 'bit_paper'], nBits: 5, text: 'Kick the trash can' },
  recycle: { mode: 'tip', mass: 0.6, crit: 0.35, fallTo: 'recycleEmpty', sound: 'cup', also: 'paper', bits: ['bit_bottle', 'bit_can', 'bit_news', 'bit_paper', 'bit_bottle'], nBits: 5, text: 'Kick the recycling bin' },
  crate: { mode: 'tip', mass: 1.2, crit: 0.4, fallTo: 'crateEmpty', sound: 'pumpkin_bonk', bits: ['bit_apple', 'bit_apple', 'bit_appleG'], nBits: 6, text: 'Kick the crate', breakAt: 8 },
  barrel: { mode: 'tip', mass: 1.6, crit: 0.35, roll: true, sound: 'pumpkin_bonk', text: 'Kick the barrel' },
  firewood: { mode: 'burst', mass: 2, sound: 'land', bits: ['log'], nBits: 7, text: 'Kick the woodpile' },
  hay: { mode: 'ball', mass: 3.2, sound: 'pumpkin_bonk', text: 'Push the hay bale', friction: 1.6 },
  sandwich: { mode: 'tip', mass: 0.5, crit: 0.22, sound: 'land', text: 'Kick the sign' },
  mailbox: { mode: 'tip', mass: 0.7, crit: 0.25, sound: 'crash', vol: 0.3, bits: ['bit_news', 'bit_paper'], nBits: 2, text: 'Kick the mailbox' },
  mailboxRed: { mode: 'tip', mass: 0.7, crit: 0.25, sound: 'crash', vol: 0.3, bits: ['bit_news', 'bit_paper'], nBits: 2, text: 'Kick the mailbox' },
  flowerbox: { mode: 'tip', mass: 0.8, crit: 0.4, sound: 'dirt', text: 'Kick the flower box' },
  flowerbox2: { mode: 'tip', mass: 0.8, crit: 0.4, sound: 'dirt', text: 'Kick the flower box' },
  yardsign: { mode: 'tip', mass: 0.4, crit: 0.2, anchored: true, sound: 'land', text: 'Kick the sign' },
  bike: { mode: 'tip', mass: 0.9, crit: 0.12, sound: 'crash', vol: 0.4, text: 'Knock the bike over' },
  trap: { mode: 'tip', mass: 0.8, crit: 0.45, sound: 'land', text: 'Kick the lobster trap' },
  buoy: { mode: 'ball', mass: 0.4, sound: 'pumpkin_bonk', text: 'Kick the buoy', friction: 0.9 },
  cod: { mode: 'flop', mass: 0.3, sound: 'squish' },
  salmon: { mode: 'flop', mass: 0.35, sound: 'squish' },
  mackerel: { mode: 'flop', mass: 0.2, sound: 'squish' },
  lobster: { mode: 'flop', mass: 0.3, sound: 'squish' },
  bit_apple: { mode: 'ball', mass: 0.15, sound: 'pumpkin_bonk', friction: 0.7 },
  bit_appleG: { mode: 'ball', mass: 0.15, sound: 'pumpkin_bonk', friction: 0.7 },
  bit_jar: { mode: 'tip', mass: 0.2, crit: 0.2, sound: 'cup' },
  // porch & yard furniture
  rocker: { mode: 'tip', mass: 1.1, crit: 0.35, sound: 'land', text: 'Kick the rocking chair' },
  muskoka: { mode: 'tip', mass: 1.3, crit: 0.4, sound: 'land', text: 'Kick the Muskoka chair' },
  sidetable: { mode: 'tip', mass: 0.6, crit: 0.25, sound: 'cup', bits: ['bit_mug', 'bit_mug', 'bit_paper'], nBits: 3, text: 'Kick the side table' },
  mum: { mode: 'tip', mass: 0.7, crit: 0.4, sound: 'dirt', bits: ['bit_dirt', 'bit_flower', 'bit_dirt'], nBits: 4, text: 'Kick the flower pot' },
  fern: { mode: 'tip', mass: 0.6, crit: 0.4, sound: 'dirt', bits: ['bit_dirt', 'bit_dirt'], nBits: 3, text: 'Kick the fern' },
  bootrack: { mode: 'burst', mass: 0.8, sound: 'land', bits: ['bit_boot', 'bit_boot', 'bit_plank'], nBits: 4, text: 'Kick the boots' },
  woodbox: { mode: 'tip', mass: 2.4, crit: 0.45, sound: 'land', text: 'Kick the wood box' },
  barrow: { mode: 'tip', mass: 1.4, crit: 0.3, sound: 'crash', vol: 0.35, bits: ['bit_leafR', 'bit_leafO', 'bit_leafY', 'bit_leafO'], nBits: 8, text: 'Tip the wheelbarrow' },
  gnome: { mode: 'tip', mass: 0.5, crit: 0.3, sound: 'pumpkin_bonk', text: 'Kick the gnome' },
  birdbath: { mode: 'tip', mass: 3, crit: 0.3, sound: 'crash', vol: 0.4, text: 'Kick the bird bath' },
  leafpile: { mode: 'burst', mass: 0.6, sound: 'dirt', bits: ['bit_leafR', 'bit_leafO', 'bit_leafY', 'bit_leafO', 'bit_leafR'], nBits: 16, text: 'Kick the leaf pile' },
  rake: { mode: 'tip', mass: 0.4, crit: 0.15, anchored: true, sound: 'land', text: 'Kick the rake' },
  // café terraces & Main Street
  bistrotable: { mode: 'tip', mass: 1.0, crit: 0.25, sound: 'cup', bits: ['bit_cup', 'bit_flower'], nBits: 2, text: 'Kick the café table' },
  bistrochair: { mode: 'tip', mass: 0.6, crit: 0.3, sound: 'land', text: 'Kick the chair' },
  easel: { mode: 'tip', mass: 0.6, crit: 0.2, sound: 'land', text: 'Kick the menu board' },
  newsbox: { mode: 'tip', mass: 1.4, crit: 0.3, sound: 'crash', vol: 0.4, bits: ['bit_news', 'bit_news', 'bit_paper'], nBits: 4, text: 'Kick the newspaper box' },
  barrelplanter: { mode: 'tip', mass: 2.6, crit: 0.4, sound: 'dirt', bits: ['bit_dirt', 'bit_flower', 'bit_dirt'], nBits: 5, text: 'Kick the planter' },
  // harbour & beach
  deckchair: { mode: 'tip', mass: 0.5, crit: 0.3, sound: 'land', text: 'Kick the deck chair' },
  cooler: { mode: 'tip', mass: 1.2, crit: 0.45, sound: 'crash', vol: 0.3, bits: ['bit_can', 'bit_can', 'bit_bottle'], nBits: 4, text: 'Kick the cooler' },
  rods: { mode: 'tip', mass: 0.6, crit: 0.2, sound: 'land', bits: ['bit_lure'], nBits: 2, text: 'Kick the fishing rods' },
  basket: { mode: 'tip', mass: 0.6, crit: 0.4, sound: 'land', bits: ['bit_apple', 'bit_appleG', 'bit_bottle'], nBits: 3, text: 'Kick the picnic basket' },
  pail: { mode: 'tip', mass: 0.3, crit: 0.3, sound: 'cup', text: 'Kick the pail' },
  beachball: { mode: 'ball', mass: 0.15, sound: 'pumpkin_bonk', friction: 0.5, text: 'Kick the beach ball' },
  // the park
  musicstand: { mode: 'tip', mass: 0.4, crit: 0.2, sound: 'cup', bits: ['bit_paper', 'bit_paper'], nBits: 2, text: 'Kick the music stand' },
  laundry: { mode: 'fixed', sound: 'paper' },
  scarecrow: { mode: 'fixed', sound: 'wobble' },
  lamp: { mode: 'fixed', sound: 'cup' },
  fishstall: { mode: 'fixed', stall: true, sound: 'crash', vol: 0.35 },
  syrupstand: { mode: 'fixed', stall: true, sound: 'cup' },
  cart: { mode: 'fixed', stall: true, sound: 'crash', vol: 0.3, bits: ['bit_paper', 'bit_paper', 'bit_news'], nBits: 3 },
  swing: { mode: 'fixed', sound: 'wobble' },
  chimes: { mode: 'fixed', sound: 'cup', vol: 0.25 },
  umbrellatable: { mode: 'fixed', sound: 'cup' },
  phonebooth: { mode: 'fixed', sound: 'crash', vol: 0.25 },
  streetsign: { mode: 'fixed', sound: 'cup' },
  bench2d: { mode: 'fixed', sound: 'land' },
  netpile: { mode: 'fixed', sound: 'paper' },
  lifering: { mode: 'fixed', sound: 'wobble' },
  kayak: { mode: 'fixed', sound: 'pumpkin_bonk' },
  picnic2d: { mode: 'fixed', sound: 'land' },
  flowerbed: { mode: 'fixed', sound: 'dirt' },
  library: { mode: 'fixed', sound: 'land' },
};
// draw distances
const FAR = {
  picket: 110, rail: 120, rail2: 120, laundry: 110, lamp: 130, fishstall: 120, syrupstand: 120, cart: 110, scarecrow: 110, hay: 120,
  umbrellatable: 110, phonebooth: 110, streetsign: 110, kayak: 100, picnic2d: 100, library: 95, swing: 90, bench2d: 95,
  gnome: 50, pail: 50, beachball: 55, chimes: 45, sidetable: 55, bootrack: 50, mum: 70, fern: 65,
};
const SMALL = 55;
const ANIM = { laundry: 1.6, scarecrow: 0.5, chimes: 1.3 };

const _right = new THREE.Vector3(), _fwd = new THREE.Vector3(), _p = new THREE.Vector3(), _ax = new THREE.Vector3();
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _q = new THREE.Quaternion();
const _o = { roll: 0, sx: 1, sy: 1, tip: 0, tdx: 0, tdz: 1, foot: 0, q: null, lift: 0 };
// porch pieces land on their deck's floor while they are over it (the physics may not have the deck)
const floorAt = (fl, x, z, h) => (fl && h < fl.y && fl.inside(x, z, 0) ? fl.y : h);

export class Deco2D {
  constructor(game) {
    this.game = game;
    this.items = game.world.deco2d?.items || [];
    this.bits = [];
    this.moving = new Set();
    this.knocked = new Set();
    this.t = 0;
    this.hash = new SpatialHash(8);
    for (const it of this.items) {
      it.def = KNOCK[it.kind] || { mode: 'fixed' };
      it.vary = !!CATALOGUE[it.kind]?.vary; it.v ||= 0;
      it.home = { x: it.x, y: it.y, z: it.z, yaw: it.yaw };
      it.st = 0; it.vx = 0; it.vy = 0; it.vz = 0; it.tip = 0; it.tipV = 0; it.tdx = 0; it.tdz = 1; it.spin = 0; it.wob = 0; it.kt = 0; it.cool = 0;
      it.ph = (it.x * 1.7 + it.z * 0.9) % 7;
      if (!it.goods) this.hash.insert(it, it.x, it.z, (it.len || 0) + it.r + 0.5);
    }
    this.cards = game.world.deco2d?.cards || [];
    this.ready = false;
    this.t0 = performance.now();
    if (game.params?.has('frames')) this.install(bakeDecoSync());
    else (game.world.deco2d?.paint || startDecoPaint()).then((models) => { this.pages = models; });
  }

  // the voxel models arrive: one instanced mesh per pose of each kind, made on first use
  install(models) {
    this.mat = createVoxelMaterial();
    this.models = new Map();
    for (const m of models) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3, true));
      geo.setAttribute('color4', new THREE.BufferAttribute(m.col, 4, true));
      geo.setAttribute('detail', new THREE.BufferAttribute(m.det, 4));
      geo.setAttribute('qbox', new THREE.BufferAttribute(m.qb, 4));
      geo.setIndex(new THREE.BufferAttribute(m.idx, 1));
      geo.computeBoundingSphere();
      this.models.set(m.key, { key: m.key, kind: m.kind, size: m.size, h: m.h, geo, im: null, n: 0, buf: new Float32Array(16 * 8), faces: m.faces });
    }
    this.group = new THREE.Group();
    this.group.name = 'deco-voxels';
    this.game.scene.add(this.group);
    // flat things: fixed pieces facing out of their window, or lying on the ground
    for (const c of this.cards) {
      c.yaw3 = c.flat === 'ground' ? (c.yaw || 0) + Math.PI : Math.atan2(c.nx, c.nz);
      c.model = this.models.get(`${c.kind}:${c.v || 0}`) || this.models.get(`${c.kind}:0`);
    }
    this.ready = true;
    const faces = [...this.models.values()].reduce((a, m) => a + m.faces, 0);
    console.log(`deco voxels: ${this.items.length} pieces, ${this.cards.length} fixed, ${this.models.size} models (${faces} faces), ready ${(performance.now() - this.t0).toFixed(0)}ms after start`);
  }

  // ---------------------------------------------------------------- knocking things over
  // the nearest thing Hank could kick (for the on-foot prompt)
  nearest(pos, r = 1.2) {
    let best = null, bd = r;
    this.hash.query(pos.x, pos.z, r + 1.5, (it) => {
      if (it.st !== 0 || !it.def.text) return;
      const d = this.dist(it, pos.x, pos.z) - it.r;
      if (d < bd && Math.abs(it.y - pos.y) < 1.5) { bd = d; best = it; }
    });
    return best ? { text: best.def.text, item: best } : null;
  }
  dist(it, x, z) {
    if (!it.len) return Math.hypot(x - it.x, z - it.z);
    const [ax, az] = it.axis === 'x' ? [Math.sin(it.yaw), Math.cos(it.yaw)] : [Math.cos(it.yaw), -Math.sin(it.yaw)];
    const t = clamp((x - it.x) * ax + (z - it.z) * az, -it.len, it.len);
    return Math.hypot(x - it.x - ax * t, z - it.z - az * t);
  }

  // Hank's kick: everything in a little cone in front of him goes flying
  kick(pos, yaw, power = 1) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let hit = null;
    const cand = [];
    this.hash.query(pos.x, pos.z, 3, (it) => cand.push(it));
    for (const it of this.knocked) if (it.st === 2) cand.push(it);
    for (const it of cand) {
      if (it.goods || it.st === 3) continue;
      const d = this.dist(it, pos.x, pos.z) - it.r;
      if (d > (it.def.stall ? 1.4 : 1.0) || Math.abs(it.y - pos.y) > 1.4) continue;
      const dx = it.x - pos.x, dz = it.z - pos.z, l = Math.hypot(dx, dz) || 1;
      if (!it.len && (dx * fx + dz * fz) / l < 0.2) continue;
      const sp = 5.5 * power;
      this.knock(it, fx * sp, fz * sp, sp, null);
      hit = it;
    }
    return hit;
  }

  knock(it, vx, vz, speed, actor) {
    const g = this.game, D = it.def;
    if (D.mode === 'fixed') {
      if (it.cool > 0) return;
      it.cool = 1.2;
      it.wob = 1;
      this.sfx(D.sound || 'wobble', it.x, it.y + 1, it.z, D.vol ?? 0.6);
      if (D.stall) this.spill(it, vx, vz, speed);
      return;
    }
    const k = 1 / Math.sqrt(D.mass || 1);
    const first = it.st === 0;
    it.kt = this.t;
    if (first) { this.knocked.add(it); g.state && (g.state.stats.knocked = (g.state.stats.knocked || 0) + 1); }
    it.st = 1;
    this.moving.add(it);
    const sp = Math.hypot(vx, vz) || 1;
    if (D.mode === 'burst') {
      it.st = 3;
      this.burst(it, vx, vz, speed);
    } else if (D.mode === 'tip' && D.anchored && it.tip > 1.2) {
      // a fence panel or sign already lying flat just gets ridden over (it doesn't stand back up)
    } else if (D.mode === 'tip') {
      let tx = vx / sp, tz = vz / sp;
      if (D.anchored) {
        // fences and staked signs fall flat away from whatever hit them
        const nx = Math.sin(it.yaw), nz = Math.cos(it.yaw);
        const s = Math.sign(tx * nx + tz * nz) || 1;
        tx = nx * s; tz = nz * s;
        it.vx += tx * 0.25; it.vz += tz * 0.25;
      } else {
        it.vx += vx * 0.5 * k; it.vz += vz * 0.5 * k;
        it.vy = Math.max(it.vy, Math.min(4, 0.6 + speed * 0.18 * k));
      }
      if (it.tip < 0.05) { it.tdx = tx; it.tdz = tz; }
      it.tipV += (1.2 + speed * 0.55) * k * (Math.sign(tx * it.tdx + tz * it.tdz) || 1);
      if (D.breakAt && speed > D.breakAt) { it.st = 3; this.burst(it, vx, vz, speed); }
    } else if (D.mode === 'ball') {
      it.vx += vx * 0.7 * k; it.vz += vz * 0.7 * k;
      it.vy = Math.max(it.vy, Math.min(3.5, 0.5 + speed * 0.15 * k));
    } else if (D.mode === 'flop') {
      it.vx += vx * 0.45 + (Math.random() - 0.5) * 2.4; it.vz += vz * 0.45 + (Math.random() - 0.5) * 2.4;
      it.vy = 3 + Math.random() * 2.5;
      it.spinV = (Math.random() - 0.5) * 16;
      it.flop = 0.3;
    }
    if (it.st === 3) this.moving.delete(it);
    if (first) {
      this.sfx(D.sound, it.x, it.y + 0.4, it.z, D.vol ?? 0.7, 0.9 + Math.random() * 0.25);
      if (D.also) this.sfx(D.also, it.x, it.y + 0.4, it.z, 0.5);
      if (D.mode !== 'flop' && D.mode !== 'burst' && D.bits) this.spillBits(it, vx, vz, speed);
      if (D.lid) this.addBit('lid', it.x, it.y + 0.85, it.z, vx * 0.4 + (Math.random() - 0.5) * 2, 3.5 + Math.random() * 2, vz * 0.4 + (Math.random() - 0.5) * 2, it, { spinV: (Math.random() - 0.5) * 18, ring: true });
      const fx = g.effects;
      if (fx && !it.goods) {
        fx.poof(it.x, it.y + 0.2, it.z, { scale: 0.45 + Math.min(0.4, speed * 0.04), color: DUST, count: 4 });
        if (speed > 5 && actor?.bike) fx.impact(it.x, it.y + Math.min(1, it.h * 0.6), it.z, Math.min(1.2, speed * 0.1));
      }
      g.quests?.event?.('knock', it);
    }
    // the bike feels it (heavy things more)
    if (actor?.bike && g.bike?.vel) {
      const m = D.mass || 1;
      g.bike.vel.multiplyScalar(1 - Math.min(0.3, 0.035 * m * (D.mode === 'ball' ? 1.6 : 1)));
      g.bike.wobble = Math.min(0.5, (g.bike.wobble || 0) + 0.06 * m);
    }
  }

  // a stall or the cart gets bumped: its goods jump off the table
  spill(st, vx, vz, speed) {
    const g = this.game;
    for (const it of st.stall || []) {
      if (it.st !== 0) continue;
      this.knock(it, vx * 0.4 + (Math.random() - 0.5) * 3, vz * 0.4 + (Math.random() - 0.5) * 3, speed, null);
    }
    if (st.def.bits) this.spillBits(st, vx, vz, speed);
    g.effects?.poof(st.x, st.y + 1, st.z, { scale: 0.6, color: DUST, count: 4 });
    if ((st.stall || []).length) this.sfx('squish', st.x, st.y + 1, st.z, 0.5);
  }

  spillBits(it, vx, vz, speed) {
    const D = it.def;
    const n = D.nBits || 3;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 0.8 + Math.random() * 1.8;
      this.addBit(D.bits[i % D.bits.length], it.x, it.y + it.h * 0.6, it.z, vx * 0.35 + Math.cos(a) * s, 2 + Math.random() * 2.5, vz * 0.35 + Math.sin(a) * s, it.st === 0 && D.mode === 'fixed' ? null : it);
    }
  }

  burst(it, vx, vz, speed) {
    const D = it.def, g = this.game;
    const n = D.nBits || 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = 1 + Math.random() * 2.2;
      this.addBit(D.bits ? D.bits[i % D.bits.length] : 'bit_plank', it.x + Math.cos(a) * 0.2, it.y + 0.2 + Math.random() * it.h, it.z + Math.sin(a) * 0.2, vx * 0.35 + Math.cos(a) * s, 2.5 + Math.random() * 3, vz * 0.35 + Math.sin(a) * s, it, { spinV: (Math.random() - 0.5) * 14, yaw: Math.random() * TAU });
    }
    if (it.kind === 'crate') {
      for (let i = 0; i < 4; i++) this.addBit('bit_plank', it.x, it.y + 0.3, it.z, vx * 0.3 + (Math.random() - 0.5) * 4, 3 + Math.random() * 3, vz * 0.3 + (Math.random() - 0.5) * 4, it, { spinV: (Math.random() - 0.5) * 20 });
      g.effects?.breakBits(it.x, it.y + 0.3, it.z, { colors: [0x9a6438, 0xc89a62, 0x6e4424], count: 10, power: 1, size: 0.08 });
    }
    g.effects?.poof(it.x, it.y + 0.3, it.z, { scale: 0.8, color: DUST, count: 6 });
  }

  addBit(kind, x, y, z, vx, vy, vz, parent, o = {}) {
    if (this.bits.length >= MAX_BITS) {
      const old = this.bits.findIndex((b) => !b.parent || b.parent.st === 0);
      if (old < 0) return;
      this.bits.splice(old, 1);
    }
    const D = CATALOGUE[kind];
    if (!D) return;
    this.bits.push({ kind, x, y, z, vx, vy, vz, spin: Math.random() * TAU, spinV: o.spinV ?? (Math.random() - 0.5) * 12, yaw: o.yaw ?? Math.random() * TAU, parent, t: 0, rest: false, ring: !!o.ring, leaf: kind.startsWith('bit_leaf') });
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.items.length) return;
    if (!this.ready) { if (!this.pages) return; this.install(this.pages); this.pages = null; }
    const g = this.game;
    this.t += dt;
    const cam = g.camera;
    _right.setFromMatrixColumn(cam.matrixWorld, 0);
    this.rx = _right.x; this.rz = _right.z;
    { const l = Math.hypot(this.rx, this.rz) || 1; this.rx /= l; this.rz /= l; }
    // actors: the bike (or Hank on foot)
    if (g.mode === 'ride') this.collide(g);
    for (const it of this.items) if (it.wob > 0 || it.cool > 0) { it.wob = Math.max(0, it.wob - dt * 1.6); it.cool -= dt; }
    for (const it of this.moving) this.step(it, dt);
    for (const b of this.bits) this.stepBit(b, dt);
    // tidy up whatever has been down a while, out of sight
    if ((this._tidy = (this._tidy || 0) - dt) <= 0) {
      this._tidy = 0.5;
      const cp = cam.position;
      cam.getWorldDirection(_fwd);
      for (const it of this.knocked) {
        if (this.t - it.kt < RESET_AFTER || it.st === 1) continue;
        const dx = it.x - cp.x, dz = it.z - cp.z, d = Math.hypot(dx, dz);
        const hx = it.home.x - cp.x, hz = it.home.z - cp.z, hd = Math.hypot(hx, hz);
        const seen = (x, z, dd) => dd < 70 && (x * _fwd.x + z * _fwd.z) / (dd || 1) > 0.25;
        if ((d < 22 || seen(dx, dz, d)) || (hd < 22 || seen(hx, hz, hd))) continue;
        this.reset(it);
      }
      if (this.bits.some((b) => (b.parent && b.parent.st === 0) || (!b.parent && b.t > 40))) this.bits = this.bits.filter((b) => !((b.parent && b.parent.st === 0) || (!b.parent && b.t > 40)));
    }
    this.draw();
  }

  collide(g) {
    let a;
    if (g.onFoot) { const W = g.walker; a = { x: W.pos.x, y: W.pos.y, z: W.pos.z, vx: W.vel.x, vz: W.vel.z, r: 0.3, bike: false }; }
    else { const B = g.bike; if (!B || B.crash > 0) return; a = { x: B.pos.x, y: B.pos.y, z: B.pos.z, vx: B.vel.x, vz: B.vel.z, r: 0.42, bike: true }; }
    const sp = Math.hypot(a.vx, a.vz);
    const touch = (it) => {
      if (it.goods || it.st === 3 || Math.abs(it.y - a.y) > Math.max(1.2, it.h)) return;
      const d = this.dist(it, a.x, a.z);
      const rr = it.r + a.r + (it.def.mode === 'fixed' ? 0.3 : 0);
      if (d >= rr) return;
      // closing speed: how fast the actor moves into the piece
      let nx = it.x - a.x, nz = it.z - a.z;
      if (it.len) { const [ax, az] = it.axis === 'x' ? [Math.sin(it.yaw), Math.cos(it.yaw)] : [Math.cos(it.yaw), -Math.sin(it.yaw)]; const t = clamp((a.x - it.x) * ax + (a.z - it.z) * az, -it.len, it.len); nx = it.x + ax * t - a.x; nz = it.z + az * t - a.z; }
      const nl = Math.hypot(nx, nz) || 1;
      const into = (a.vx * nx + a.vz * nz) / nl;
      const thr = it.def.mode === 'fixed' ? (a.bike ? 2.2 : 3.5) : 0.8 * Math.sqrt(it.def.mass || 1);
      if (into > thr || (it.st === 2 && into > 0.6)) this.knock(it, a.vx, a.vz, sp, a);
      else if (into > 0.2 && it.st === 0) it.wob = Math.max(it.wob, 0.6);
    };
    this.hash.query(a.x, a.z, 2.5, (it) => { if (it.st === 0) touch(it); });
    for (const it of this.knocked) if (it.st === 2 && Math.abs(it.x - a.x) < 2 && Math.abs(it.z - a.z) < 2) touch(it);
  }

  step(it, dt) {
    const g = this.game, PH = g.physics, D = it.def;
    it.vy -= 16 * dt;
    it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
    // walls, trees and posts push things back out
    if (it.vx * it.vx + it.vz * it.vz > 0.01) {
      _p.set(it.x, it.y, it.z);
      const hit = PH.resolve(_p, Math.min(0.3, it.r), Math.min(1, it.h));
      if (hit) {
        it.x = _p.x; it.z = _p.z;
        const vn = it.vx * hit.nx + it.vz * hit.nz;
        if (vn < 0) { it.vx -= hit.nx * vn * 1.5; it.vz -= hit.nz * vn * 1.5; if (vn < -2.5) this.sfx(D.sound, it.x, it.y, it.z, Math.min(0.6, -vn * 0.1)); }
      }
    }
    const gr = PH.groundAt(it.x, it.z, it.y + 0.5);
    const gh = floorAt(it.floor, it.x, it.z, gr.h);
    let ground = false;
    if (it.y <= gh) {
      it.y = gh;
      ground = true;
      if (it.vy < -3) this.sfx(D.mode === 'flop' ? 'squish' : D.sound, it.x, it.y, it.z, Math.min(0.5, -it.vy * 0.06), 1.1);
      it.vy = it.vy < -1.5 ? -it.vy * 0.28 : 0;
      const lying = D.mode === 'tip' && it.tip > 1.2;
      const fr = D.mode === 'ball' ? D.friction ?? 1 : D.mode === 'flop' ? 3 : lying ? (D.roll ? 1.1 : 5) : D.anchored ? 9 : 4;
      const e = Math.exp(-fr * dt);
      it.vx *= e; it.vz *= e;
      // roll downhill a little
      if (D.mode === 'ball' || (lying && D.roll)) { it.vx += gr.nx * 4 * dt; it.vz += gr.nz * 4 * dt; }
    }
    if (D.mode === 'tip') {
      const crit = D.crit ?? 0.3;
      const a = it.tip < crit ? -14 * (crit - it.tip) - 2 : 11 * Math.sin(it.tip);
      it.tipV += a * dt;
      it.tipV *= Math.exp(-0.6 * dt);
      it.tip += it.tipV * dt;
      if (it.tip >= HALF_PI) {
        it.tip = HALF_PI;
        if (it.tipV > 2.5) {
          this.sfx(D.sound, it.x, it.y, it.z, Math.min(0.7, it.tipV * 0.1), 0.85);
          g.effects?.poof(it.x + it.tdx * it.h * 0.6, it.y + 0.1, it.z + it.tdz * it.h * 0.6, { scale: 0.4, color: DUST, count: 3 });
        }
        it.tipV = it.tipV > 1.5 ? -it.tipV * 0.22 : 0;
      } else if (it.tip <= 0) {
        it.tip = 0;
        it.tipV = it.tipV < -1 ? -it.tipV * 0.2 : 0;
        it.wob = Math.max(it.wob, 0.5);
      }
    } else if (D.mode === 'ball') {
      // spin along the screen as it rolls
      it.spin -= ((it.vx * this.rx + it.vz * this.rz) / Math.max(0.1, it.r)) * dt;
    } else if (D.mode === 'flop') {
      it.flop -= dt;
      if (!ground) it.spin += (it.spinV || 0) * dt;
      else {
        it.spin *= Math.exp(-10 * dt);
        it.spinV = 0;
        if (this.t - it.kt < 11 && it.flop <= 0) {
          it.flop = 0.45 + Math.random() * 0.8;
          it.vy = 1.6 + Math.random() * 1.6;
          it.vx += (Math.random() - 0.5) * 1.6; it.vz += (Math.random() - 0.5) * 1.6;
          it.spinV = (Math.random() - 0.5) * 8;
          it.yaw += (Math.random() - 0.5) * 2;
          if (Math.random() < 0.5) this.sfx('squish', it.x, it.y, it.z, 0.25, 1.2 + Math.random() * 0.4);
        }
      }
    }
    // settled?
    const still = ground && Math.abs(it.vy) < 0.05 && it.vx * it.vx + it.vz * it.vz < 0.02;
    const rested = D.mode !== 'tip' || (Math.abs(it.tipV) < 0.05 && (it.tip === 0 || it.tip === HALF_PI));
    const flopping = D.mode === 'flop' && this.t - it.kt < 11;
    // (something still creeping down a slope after a long while just stops)
    const stale = ground && this.t - it.kt > 18;
    if (stale && !(still && rested)) { it.tip = D.mode === 'tip' ? (it.tip > 0.8 ? HALF_PI : 0) : it.tip; it.tipV = 0; }
    if ((still && rested && !flopping) || (stale && !flopping)) {
      it.vx = it.vz = it.vy = 0;
      this.moving.delete(it);
      const moved = Math.hypot(it.x - it.home.x, it.z - it.home.z) > 0.15 || Math.abs(it.y - it.home.y) > 0.1;
      if (it.tip === 0 && !moved && D.mode === 'tip') { it.st = 0; this.knocked.delete(it); }
      else it.st = it.st === 3 ? 3 : 2;
    }
    if (it.y < -20) this.reset(it);
  }

  stepBit(b, dt) {
    if (b.rest) { b.t += dt; return; }
    const PH = this.game.physics;
    b.t += dt;
    b.vy -= 15 * dt;
    if (b.leaf) {
      // leaves flutter: they fall slowly and drift side to side
      b.vy = Math.max(b.vy, -1.1);
      const sway = Math.sin(b.t * 4.2 + b.spin) * 1.6;
      b.vx += (sway * this.rz * 0.6 - b.vx * 1.2) * dt; b.vz += (-sway * this.rx * 0.6 - b.vz * 1.2) * dt;
      b.spinV = Math.sin(b.t * 3 + b.yaw) * 5;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.spin += b.spinV * dt;
    const gr = PH.groundAt(b.x, b.z, b.y + 0.4);
    const gh = floorAt(b.parent?.floor, b.x, b.z, gr.h);
    if (b.y <= gh) {
      b.y = gh;
      if (b.vy < -2.5 && b.kind === 'lid') this.sfx('plate', b.x, b.y, b.z, 0.35);
      b.vy = b.vy < -1.2 ? -b.vy * 0.3 : 0;
      const e = Math.exp(-(b.kind === 'bit_apple' || b.kind === 'bit_appleG' || b.kind === 'bit_can' || b.kind === 'lid' ? 1.2 : 5) * dt);
      b.vx *= e; b.vz *= e;
      b.spinV *= Math.exp(-6 * dt);
      if (b.kind === 'bit_apple' || b.kind === 'bit_appleG' || b.kind === 'bit_can' || b.kind === 'bit_bottle') b.spinV = -(b.vx * this.rx + b.vz * this.rz) / 0.06;
      else if (b.vy === 0) b.spin = b.spin * Math.exp(-12 * dt) + (b.ring ? 0 : 0);
      if (b.vy === 0 && b.vx * b.vx + b.vz * b.vz < 0.01) { b.rest = true; if (!b.ring && !/apple|can|bottle/.test(b.kind)) b.spin = 0; }
    }
    if (b.y < -20) b.rest = true;
  }

  reset(it) {
    Object.assign(it, { x: it.home.x, y: it.home.y, z: it.home.z, yaw: it.home.yaw, st: 0, vx: 0, vy: 0, vz: 0, tip: 0, tipV: 0, spin: 0, wob: 0 });
    this.moving.delete(it);
    this.knocked.delete(it);
  }

  sfx(name, x, y, z, vol = 1, pitch = 1) {
    const g = this.game;
    if (!name || !g.sound?.play) return;
    const cp = g.camera.position;
    const dx = x - cp.x, dy = y - cp.y, dz = z - cp.z, d = Math.hypot(dx, dy, dz);
    if (d > 50) return;
    const pan = clamp((dx * this.rx + dz * this.rz) / (d || 1), -1, 1);
    g.sound.play(name, { volume: vol * clamp(1 - d / 50, 0, 1), pitch, pan });
  }

  // ---------------------------------------------------------------- drawing
  // pose one instance of model M: at (x, y, z) turned by yaw; o.roll about its own front axis
  // round a point o.lift up; o.sx / o.sy squash; o.q a free rotation round that point (rolling);
  // o.tip tips it over towards (o.tdx, o.tdz) about its foot, o.foot metres out
  pose(M, x, y, z, yaw, o) {
    if ((M.n + 1) * 16 > M.buf.length) { const nb = new Float32Array(M.buf.length * 2); nb.set(M.buf); M.buf = nb; }
    const s = M.size, lift = o.lift || 0;
    _m1.makeScale(s * o.sx, s * o.sy, s * o.sx);
    if (lift) _m1.premultiply(_m2.makeTranslation(0, -lift, 0));
    if (o.roll) _m1.premultiply(_m2.makeRotationZ(o.roll));
    _m1.premultiply(_m2.makeRotationY(yaw));
    if (o.q) _m1.premultiply(_m2.makeRotationFromQuaternion(o.q));
    if (lift) _m1.premultiply(_m2.makeTranslation(0, lift, 0));
    if (o.tip) {
      const fx = o.tdx * o.foot, fz = o.tdz * o.foot;
      _ax.set(o.tdz, 0, -o.tdx).normalize();
      _m1.premultiply(_m2.makeTranslation(-fx, 0, -fz));
      _m1.premultiply(_m2.makeRotationAxis(_ax, o.tip));
      _m1.premultiply(_m2.makeTranslation(fx, 0, fz));
    }
    _m1.premultiply(_m2.makeTranslation(x, y, z));
    _m1.toArray(M.buf, M.n * 16);
    M.n++;
  }

  draw() {
    const cam = this.game.camera, cp = cam.position;
    cam.getWorldDirection(_fwd);
    const fx = _fwd.x, fy = _fwd.y, fz = _fwd.z;
    for (const M of this.models.values()) M.n = 0;
    const dtv = this._drawT == null ? 0 : Math.min(0.1, Math.max(0, this.t - this._drawT));
    this._drawT = this.t;
    const o = _o;
    const reset = () => { o.roll = 0; o.sx = 1; o.sy = 1; o.tip = 0; o.q = null; o.lift = 0; };
    for (const it of this.items) {
      if (it.st === 3 || it.fence3d) continue; // (the fences are voxel geometry: world/fences3d.js)
      const dx = it.x - cp.x, dy = it.y - cp.y, dz = it.z - cp.z;
      const far = FAR[it.kind] ?? (it.goods ? SMALL : 90);
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd > far * far) continue;
      if (dx * fx + dy * fy + dz * fz < -4 - (it.len || 0)) continue;
      const kind = it.st !== 0 && it.def.fallTo && it.tip > 0.5 ? it.def.fallTo : it.kind;
      const K = CATALOGUE[kind];
      if (!K) continue;
      let fi = 0;
      if (K.n > 1) {
        if (it.vary) fi = it.v % K.n;
        else if (it.def.mode === 'flop') fi = it.st === 1 && this.t - it.kt < 11 ? (Math.floor(this.t * 10 + it.ph) % 2 ? 0 : 2) : 1;
        else fi = Math.floor((this.t + it.ph) * (ANIM[it.kind] || 1)) % K.n;
      }
      const M = this.models.get(`${kind}:${fi}`);
      if (!M) continue;
      reset();
      if (it.wob > 0) {
        const w = Math.sin(this.t * 28 + it.ph) * 0.07 * it.wob;
        o.sy = 1 + w; o.sx = 1 - w * 0.6;
        if (it.def.mode === 'fixed') o.roll = Math.sin(this.t * 17 + it.ph) * 0.05 * it.wob;
      }
      if (it.tip > 0) {
        o.tip = it.tip; o.tdx = it.tdx; o.tdz = it.tdz; o.foot = Math.min(it.r, M.h * 0.5);
      } else if (it.def.mode === 'ball') {
        // roll for real: about the level axis across the way it is going
        const sp = Math.hypot(it.vx, it.vz);
        it.q3 ||= new THREE.Quaternion();
        if (sp > 0.02 && dtv > 0) {
          _ax.set(it.vz / sp, 0, -it.vx / sp);
          it.q3.premultiply(_q.setFromAxisAngle(_ax, (sp * dtv) / Math.max(0.12, it.r)));
        }
        o.q = it.q3; o.lift = M.h * 0.5;
      } else if (it.def.mode === 'flop') {
        // fish and lobsters flop about lying on their sides
        o.roll = Math.PI / 2 + (it.spin || 0); o.lift = 0.06;
      } else if (it.spin) o.roll = it.spin;
      this.pose(M, it.x, it.y, it.z, it.yaw, o);
    }
    // fixed flat things: mats, towels, shop-window displays
    for (const c of this.cards) {
      if (!c.model) continue;
      const dx = c.x - cp.x, dy = c.y - cp.y, dz = c.z - cp.z;
      if (dx * dx + dy * dy + dz * dz > 60 * 60 || dx * fx + dy * fy + dz * fz < -3) continue;
      reset();
      this.pose(c.model, c.x, c.y, c.z, c.yaw3, o);
    }
    // flying bits: litter, apples, lids, logs, leaves
    for (const b of this.bits) {
      const dx = b.x - cp.x, dy = b.y - cp.y, dz = b.z - cp.z;
      if (dx * dx + dy * dy + dz * dz > SMALL * SMALL || dx * fx + dy * fy + dz * fz < -2) continue;
      const M = this.models.get(`${b.kind}:0`);
      if (!M) continue;
      reset();
      o.roll = b.spin; o.lift = M.h * 0.5;
      this.pose(M, b.x, b.y, b.z, b.yaw, o);
    }
    for (const M of this.models.values()) this.flush(M);
  }

  // hand a model's instances to its mesh (made, or grown, as needed)
  flush(M) {
    if (!M.n) { if (M.im) M.im.visible = false; return; }
    if (!M.im || M.im.instanceMatrix.count < M.n) {
      if (M.im) { this.group.remove(M.im); M.im.dispose(); }
      const cap = Math.max(4, Math.ceil(M.n * 1.5));
      const im = new THREE.InstancedMesh(M.geo, this.mat, cap);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      // (small things - litter, apples, mats - throw no shadow worth the pass)
      im.castShadow = M.h > 0.22 && !M.kind.startsWith('bit_');
      im.receiveShadow = true;
      im.customDepthMaterial = this.mat.userData.depth;
      im.frustumCulled = false;
      im.matrixAutoUpdate = false;
      im.name = `deco:${M.key}`;
      this.group.add(im);
      M.im = im;
    }
    const im = M.im;
    im.visible = true;
    im.count = M.n;
    im.instanceMatrix.array.set(M.buf.subarray(0, M.n * 16));
    im.instanceMatrix.clearUpdateRanges();
    im.instanceMatrix.addUpdateRange(0, M.n * 16);
    im.instanceMatrix.needsUpdate = true;
  }
}
