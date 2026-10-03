// The 2D street clutter coming to life: ride or walk into a trash can, a fence
// panel, a crate or a sign and it tips over (a little 2D rigid body: it slides,
// bounces, tips past its balance point and slams down, or wobbles back up if
// the bump was gentle), lids fly off, litter and apples scatter, barrels and
// hay bales roll, firewood stacks burst into logs, and bumping the fish stall
// sends cod, salmon, mackerel and lobsters flopping across the street. Things
// put themselves back once they have been down a while and nobody is looking.
//
// Placement lives in src/world/deco2d.js (world.deco2d.items); the art in
// src/art/deco2d.js. Everything is drawn by one instanced SpriteBatch from an
// atlas painted over the first frames.
import * as THREE from 'three';
import { SpriteAtlas, SpriteBatch } from '../render/sprites.js';
import { paintDecoGen, DECO } from '../art/deco2d.js';
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
  laundry: { mode: 'fixed', sound: 'paper' },
  scarecrow: { mode: 'fixed', sound: 'wobble' },
  lamp: { mode: 'fixed', sound: 'cup' },
  fishstall: { mode: 'fixed', stall: true, sound: 'crash', vol: 0.35 },
  syrupstand: { mode: 'fixed', stall: true, sound: 'cup' },
  cart: { mode: 'fixed', stall: true, sound: 'crash', vol: 0.3, bits: ['bit_paper', 'bit_paper', 'bit_news'], nBits: 3 },
};
// draw distances
const FAR = { picket: 110, rail: 120, rail2: 120, laundry: 110, lamp: 130, fishstall: 120, syrupstand: 120, cart: 110, scarecrow: 110, hay: 120 };
const SMALL = 55;
const ANIM = { laundry: 1.6, scarecrow: 0.5 };

const _right = new THREE.Vector3(), _fwd = new THREE.Vector3(), _p = new THREE.Vector3();

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
      it.home = { x: it.x, y: it.y, z: it.z, yaw: it.yaw };
      it.st = 0; it.vx = 0; it.vy = 0; it.vz = 0; it.tip = 0; it.tipV = 0; it.tdx = 0; it.tdz = 1; it.spin = 0; it.wob = 0; it.kt = 0; it.cool = 0;
      it.ph = (it.x * 1.7 + it.z * 0.9) % 7;
      if (!it.goods) this.hash.insert(it, it.x, it.z, (it.len || 0) + it.r + 0.5);
    }
    this.atlas = new SpriteAtlas(1024);
    this.painter = paintDecoGen(this.atlas);
    this.ready = false;
    this.paintMs = 0;
    if (game.params?.has('frames')) this.paint(1e9);
  }

  // paint atlas frames for up to budget ms, then build the batch
  paint(budget) {
    const t0 = performance.now();
    let done = false;
    while (performance.now() - t0 < budget) if (this.painter.next().done) { done = true; break; }
    this.paintMs += performance.now() - t0;
    if (!done) return;
    this.atlas.finalize();
    this.frames = {};
    for (const [kind, K] of Object.entries(DECO)) {
      const fk = (this.frames[kind] = {});
      for (const view of K.views) fk[view] = Array.from({ length: K.n }, (_, i) => this.atlas.get(`${kind}:${view}:${i}`));
      fk.front ||= fk.front3 || fk.side; fk.back ||= fk.back3 || fk.side;
      fk.front3 ||= fk.side; fk.back3 ||= fk.side;
    }
    this.batch = new SpriteBatch(this.atlas, 1400, { castShadow: true, upright: 0.9 });
    this.batch.mesh.name = 'deco2d';
    this.game.scene.add(this.batch.mesh);
    this.ready = true;
    console.log(`deco2d: ${this.items.length} pieces, ${this.atlas.frames.size} frames in ${this.paintMs.toFixed(0)}ms`);
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
    const D = DECO[kind];
    if (!D) return;
    this.bits.push({ kind, x, y, z, vx, vy, vz, spin: Math.random() * TAU, spinV: o.spinV ?? (Math.random() - 0.5) * 12, yaw: o.yaw ?? Math.random() * TAU, parent, t: 0, rest: false, ring: !!o.ring });
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.items.length) return;
    if (!this.ready) { this.paint(5); if (!this.ready) return; }
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
    let ground = false;
    if (it.y <= gr.h) {
      it.y = gr.h;
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
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    b.spin += b.spinV * dt;
    const gr = PH.groundAt(b.x, b.z, b.y + 0.4);
    if (b.y <= gr.h) {
      b.y = gr.h;
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
  draw() {
    const B = this.batch, cam = this.game.camera, cp = cam.position;
    cam.getWorldDirection(_fwd);
    const fx = _fwd.x, fy = _fwd.y, fz = _fwd.z;
    const rx = this.rx, rz = this.rz;
    B.begin();
    for (const it of this.items) {
      if (it.st === 3) continue;
      const dx = it.x - cp.x, dy = it.y - cp.y, dz = it.z - cp.z;
      const far = FAR[it.kind] ?? (it.goods ? SMALL : 90);
      const dd = dx * dx + dy * dy + dz * dz;
      if (dd > far * far) continue;
      if (dx * fx + dy * fy + dz * fz < -4 - (it.len || 0)) continue;
      const kind = it.st !== 0 && it.def.fallTo && it.tip > 0.5 ? it.def.fallTo : it.kind;
      const F = this.frames[kind];
      if (!F) continue;
      const toCam = Math.atan2(-dx, -dz);
      let rel = toCam - it.yaw;
      rel = Math.abs(Math.atan2(Math.sin(rel), Math.cos(rel)));
      const view = rel < Math.PI / 8 ? 'front' : rel < (3 * Math.PI) / 8 ? 'front3' : rel < (5 * Math.PI) / 8 ? 'side' : rel < (7 * Math.PI) / 8 ? 'back3' : 'back';
      const arr = F[view] || F.side;
      const l = Math.hypot(dx, dz) || 1;
      const flip = view !== 'front' && view !== 'back' && Math.sin(it.yaw) * (-dz / l) + Math.cos(it.yaw) * (dx / l) < 0;
      let fi = 0;
      if (arr.length > 1) {
        if (it.def.mode === 'flop') fi = it.st === 1 && this.t - it.kt < 11 ? (Math.floor(this.t * 10 + it.ph) % 2 ? 0 : 2) : 1;
        else fi = Math.floor((this.t + it.ph) * (ANIM[it.kind] || 1)) % arr.length;
      }
      const f = arr[fi];
      if (!f) continue;
      let roll = 0, sy = 1, sx = 1, y = it.y;
      if (it.tip > 0) {
        const fxl = dx / l, fzl = dz / l;
        const dr = it.tdx * rx + it.tdz * rz, df = it.tdx * fxl + it.tdz * fzl;
        roll = -it.tip * dr;
        sy = 1 - (1 - Math.cos(it.tip)) * Math.abs(df) * 0.72;
        y += Math.sin(it.tip) * Math.abs(dr) * (f.w / (f.ppm || 40)) * 0.32;
      } else if (it.spin) roll = it.spin;
      if (it.wob > 0) {
        const w = Math.sin(this.t * 28 + it.ph) * 0.07 * it.wob;
        sy *= 1 + w; sx = 1 - w * 0.6;
        if (it.def.mode === 'fixed') roll += Math.sin(this.t * 17 + it.ph) * 0.05 * it.wob;
      }
      B.push(f, it.x, y, it.z, { flip, roll, sx, sy });
    }
    for (const b of this.bits) {
      const dx = b.x - cp.x, dy = b.y - cp.y, dz = b.z - cp.z;
      if (dx * dx + dy * dy + dz * dz > SMALL * SMALL || dx * fx + dy * fy + dz * fz < -2) continue;
      const F = this.frames[b.kind];
      if (!F) continue;
      let arr = F.side;
      if (F.front && F.front !== F.side) { const rel = Math.abs(Math.atan2(Math.sin(Math.atan2(-dx, -dz) - b.yaw), Math.cos(Math.atan2(-dx, -dz) - b.yaw))); arr = rel < 0.5 || rel > 2.6 ? F.front : rel < 1.1 || rel > 2.0 ? F.front3 : F.side; }
      B.push(arr[0], b.x, b.y, b.z, { roll: b.spin, flip: (b.yaw % TAU) > Math.PI });
    }
    B.end();
  }
}
