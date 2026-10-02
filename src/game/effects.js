// Drives the particle system from the world state: ambient leaves, motes,
// fireflies, smoke, fire, weather, and every bike reaction.
import * as THREE from 'three';
import { Particles, P } from '../render/particles.js';
import { LEAF_COLORS } from '../art/groundtex.js';
import { forestNoise } from '../world/terrain.js';
import { G } from '../render/shaderlib.js';
import { clamp } from '../core/math.js';

const LEAF_SPRITES = [P.leaf0, P.leaf1, P.leaf2, P.leaf3, P.maple, P.maple];
const _v = new THREE.Vector3();

export class Effects {
  constructor(game) {
    this.game = game;
    this.ps = new Particles(4500);
    game.scene.add(this.ps.points);
    const T = game.world.terrain;
    this.ps.ground = (x, z) => game.physics.groundAt(x, z, 1e9, 0).h;
    this.acc = { leaves: 0, motes: 0, flies: 0, rain: 0, snow: 0, smoke: 0, fire: 0, dust: 0, steam: 0, boost: 0 };
    this.terrain = T;
    this.smoke = game.world.ctx.smoke;
    this.fires = game.world.ctx.fires;
    this.rng = this.ps.rng;
    this.cups = [];
  }

  leafColor() {
    return new THREE.Color(LEAF_COLORS[Math.floor(this.rng.next() * LEAF_COLORS.length)]);
  }

  spawnLeaf(x, y, z, opt = {}) {
    const c = this.leafColor();
    return this.ps.spawn({
      x, y, z, vx: opt.vx ?? 0, vy: opt.vy ?? -0.4, vz: opt.vz ?? 0,
      life: opt.life ?? 14, size: opt.size ?? this.rng.range(0.3, 0.44), sprite: LEAF_SPRITES[Math.floor(this.rng.next() * LEAF_SPRITES.length)],
      color: [c.r, c.g, c.b], gravity: opt.gravity ?? 0.55, drag: 1.4, spin: this.rng.range(2.5, 6) * this.rng.sign(),
      flutter: this.rng.range(0.4, 1.1), wind: 1.4, ground: true, rest: opt.rest ?? 3.5,
    });
  }

  update(dt, cam) {
    const ps = this.ps;
    const W = G.uWind.value;
    const ws = G.uWindStrength.value;
    ps.wind.set(W.x * ws * 2.2, W.y * ws * 2.2);
    const atm = this.game.world.atmosphere;
    const night = G.uNight.value;
    const focus = this.game.focus();
    const rng = this.rng;

    // --- falling leaves where there are trees around the camera
    this.acc.leaves += dt * (14 + ws * 22);
    while (this.acc.leaves > 1) {
      this.acc.leaves -= 1;
      const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * 26;
      const fwd = cam.getWorldDirection(_v);
      const x = cam.position.x + fwd.x * 10 + Math.cos(a) * d, z = cam.position.z + fwd.z * 10 + Math.sin(a) * d;
      const dens = forestNoise(x, z);
      if (rng.next() > dens * 1.2) continue;
      const h = this.terrain.heightAt(x, z);
      if (h < 0.5) continue;
      this.spawnLeaf(x, h + rng.range(5, 13), z);
    }
    // --- golden motes floating in sunbeams (day) / fireflies (night)
    if (night < 0.5) {
      this.acc.motes += dt * 7;
      while (this.acc.motes > 1) {
        this.acc.motes -= 1;
        const x = focus.x + rng.range(-12, 12), z = focus.z + rng.range(-12, 12);
        const h = this.terrain.heightAt(x, z);
        ps.spawn({ x, y: h + rng.range(0.5, 4), z, vx: rng.range(-0.2, 0.2), vy: rng.range(-0.05, 0.12), vz: rng.range(-0.2, 0.2), life: rng.range(4, 7), size: 0.06, sprite: P.mote, color: [1, 0.85, 0.55], emissive: 0.8, drag: 0.2, wind: 0.2, fadeIn: 1, blink: 3 });
      }
    } else {
      this.acc.flies += dt * 6 * night * (atm.weather.rain > 0.3 ? 0.1 : 1);
      while (this.acc.flies > 1) {
        this.acc.flies -= 1;
        const x = focus.x + rng.range(-22, 22), z = focus.z + rng.range(-22, 22);
        const h = this.terrain.heightAt(x, z);
        if (h < 1) continue;
        ps.spawn({ x, y: h + rng.range(0.4, 2.5), z, vx: rng.range(-0.4, 0.4), vy: rng.range(-0.1, 0.2), vz: rng.range(-0.4, 0.4), life: rng.range(3, 6), size: 0.1, sprite: P.glow, color: [0.75, 1, 0.35], emissive: 1, drag: 0.1, fadeIn: 0.8, blink: 5 });
      }
    }
    // --- chimney smoke & campfires
    this.acc.smoke += dt * 3;
    while (this.acc.smoke > 1) {
      this.acc.smoke -= 1;
      for (const s of this.smoke) {
        if (Math.abs(s.x - cam.position.x) > 160 || Math.abs(s.z - cam.position.z) > 160) continue;
        ps.spawn({ x: s.x + rng.range(-0.15, 0.15), y: s.y, z: s.z + rng.range(-0.15, 0.15), vx: rng.range(-0.1, 0.1), vy: rng.range(0.7, 1.1), vz: rng.range(-0.1, 0.1), life: rng.range(5, 7.5), size: 0.5, size1: 2.4, sprite: P.smoke, color: [0.82, 0.8, 0.84], drag: 0.25, wind: 0.6, alpha: 0.75, fadeIn: 0.4 });
      }
    }
    this.acc.fire += dt * 30;
    while (this.acc.fire > 1) {
      this.acc.fire -= 1;
      for (const f of this.fires) {
        if (f.distanceToSquared(cam.position) > 80 * 80) continue;
        const kind = rng.next();
        if (kind < 0.08) ps.spawn({ x: f.x, y: f.y + 0.25, z: f.z, life: 0.35, size: 1.5, size1: 1.2, sprite: P.glow, color: [1, 0.55, 0.2], emissive: 1, alpha: 0.35 });
        else if (kind < 0.62) ps.spawn({ x: f.x + rng.range(-0.3, 0.3), y: f.y, z: f.z + rng.range(-0.3, 0.3), vy: rng.range(0.7, 1.3), life: rng.range(0.45, 0.8), size: rng.range(0.4, 0.75), size1: 0.1, sprite: P.flame, color: [1, 0.9, 0.7], emissive: 1, drag: 1, phase: 0 });
        else if (kind < 0.85) ps.spawn({ x: f.x, y: f.y + 0.2, z: f.z, vx: rng.range(-0.5, 0.5), vy: rng.range(1.5, 3), vz: rng.range(-0.5, 0.5), life: rng.range(0.8, 1.6), size: 0.06, sprite: P.ember, color: [1, 0.7, 0.3], emissive: 1, drag: 0.8, wind: 0.5, blink: 12 });
        else ps.spawn({ x: f.x, y: f.y + 0.6, z: f.z, vy: 0.8, life: 3, size: 0.3, size1: 1.2, sprite: P.smoke, color: [0.6, 0.58, 0.6], drag: 0.3, wind: 0.5, alpha: 0.6 });
      }
    }
    // --- weather
    const rain = atm.weather.rain, snow = atm.weather.snow;
    if (rain > 0.05) {
      // most drops fall in front of the lens, where they're actually seen
      cam.getWorldDirection(this._fwd || (this._fwd = cam.position.clone()));
      const fx = this._fwd.x, fz = this._fwd.z;
      this.acc.rain += dt * 1300 * rain;
      while (this.acc.rain > 1) {
        this.acc.rain -= 1;
        const ahead = rng.range(-4, 22), side = rng.range(-14, 14);
        const x = cam.position.x + fx * ahead - fz * side, z = cam.position.z + fz * ahead + fx * side;
        ps.spawn({ x, y: cam.position.y + rng.range(2, 10), z, vx: W.x * 2, vy: -15, vz: W.y * 2, life: 1.3, size: 0.46, sprite: P.rain, color: [0.78, 0.84, 0.95], drag: 0, ground: true, rest: 0.03, alpha: 0.85, phase: 0 });
      }
    }
    if (snow > 0.05) {
      this.acc.snow += dt * 160 * snow;
      while (this.acc.snow > 1) {
        this.acc.snow -= 1;
        const x = cam.position.x + rng.range(-20, 20), z = cam.position.z + rng.range(-20, 20);
        ps.spawn({ x, y: cam.position.y + rng.range(3, 10), z, vy: -1.1, life: 9, size: 0.09, sprite: P.snow, color: [1, 1, 1], drag: 0.6, flutter: 0.5, wind: 1.2, ground: true, rest: 1.5, emissive: 0.3 });
      }
    }
    this.updateBike(dt);
    ps.update(dt);
  }

  updateBike(dt) {
    const g = this.game;
    const b = g.bike;
    if (!b) return;
    const ps = this.ps;
    const rng = this.rng;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const rearX = b.pos.x - fx * 0.55, rearZ = b.pos.z - fz * 0.55;
    // dust & kicked-up leaves behind the rear wheel
    if (b.grounded && b.crash <= 0 && b.speed > 2.5) {
      const surf = b.surface;
      const rate = (b.speed - 2) * (b.drifting ? 9 : 2.2) * (surf === 'road' ? 0.6 : 1);
      this.acc.dust += dt * rate;
      const litter = this.terrain.splatAt(b.pos.x, b.pos.z).litter;
      while (this.acc.dust > 1) {
        this.acc.dust -= 1;
        if (surf === 'water') continue;
        if (litter > 0.5 && rng.next() < 0.6) {
          this.spawnLeaf(rearX, b.pos.y + 0.1, rearZ, { vx: -fx * rng.range(1, 3) + rng.range(-1, 1), vy: rng.range(1.5, 3.2), vz: -fz * rng.range(1, 3) + rng.range(-1, 1), gravity: 3, life: 5, rest: 2 });
          continue;
        }
        const col = surf === 'grass' ? [0.55, 0.5, 0.3] : surf === 'wood' ? [0.7, 0.6, 0.48] : [0.66, 0.52, 0.38];
        ps.spawn({ x: rearX + rng.range(-0.2, 0.2), y: b.pos.y + 0.1, z: rearZ + rng.range(-0.2, 0.2), vx: -fx * 0.8 + rng.range(-0.4, 0.4), vy: rng.range(0.3, 0.9), vz: -fz * 0.8 + rng.range(-0.4, 0.4), life: rng.range(0.7, 1.3), size: 0.25, size1: 0.9, sprite: P.dust, color: col, drag: 2, alpha: 0.7 });
        if (b.drifting && rng.next() < 0.4) ps.spawn({ x: rearX, y: b.pos.y + 0.1, z: rearZ, vx: rng.range(-2, 2), vy: rng.range(1.5, 3), vz: rng.range(-2, 2), life: 1.2, size: 0.09, sprite: P.dirt, color: [1, 1, 1], gravity: 9, drag: 0.5, ground: true, rest: 0.3 });
      }
    }
    // cola boost: foamy jets + fizz
    if (b.boostTime > 0 && b.stats.boostCharges > 0) {
      this.acc.boost += dt * 150;
      g.chase.shake(0.12);
      const m = g.bikeModel;
      while (this.acc.boost > 1) {
        this.acc.boost -= 1;
        const n = m.nozzles[Math.floor(rng.next() * 2)];
        const w = n.clone().applyMatrix4(m.bicycle.matrixWorld);
        ps.spawn({ x: w.x, y: w.y, z: w.z, vx: -fx * rng.range(3, 6) + b.vel.x * 0.5, vy: rng.range(-0.2, 0.8), vz: -fz * rng.range(3, 6) + b.vel.z * 0.5, life: rng.range(0.5, 0.95), size: 0.24, size1: 0.95, sprite: rng.next() < 0.55 ? P.foam : P.bubble, color: rng.next() < 0.5 ? [0.55, 0.32, 0.18] : [0.97, 0.9, 0.78], drag: 2.2, gravity: 1, ground: true });
        if (rng.next() < 0.3) ps.spawn({ x: w.x, y: w.y, z: w.z, vx: rng.range(-1, 1), vy: rng.range(0.5, 2), vz: rng.range(-1, 1), life: 0.5, size: 0.12, sprite: P.star, color: [1, 0.9, 0.6], emissive: 1, drag: 1 });
      }
    }
    // steam off the cocoa cups
    this.acc.steam += dt * 3;
    while (this.acc.steam > 1) {
      this.acc.steam -= 1;
      for (const c of this.cups) {
        if (!c.visible) continue;
        const w = c.getWorldPosition(_v);
        ps.spawn({ x: w.x + rng.range(-0.03, 0.03), y: w.y + 0.1, z: w.z, vy: rng.range(0.25, 0.45), life: 1.6, size: 0.08, size1: 0.22, sprite: P.steam, color: [1, 1, 1], drag: 0.5, wind: 0.25, alpha: 0.55, fadeIn: 0.3, flutter: 0.1 });
      }
    }
  }

  // ---- one-shot reactions
  onBikeEvent(e) {
    const b = this.game.bike;
    const ps = this.ps;
    const rng = this.rng;
    if (e.type === 'land' && e.impact > 2.5) {
      const n = Math.min(18, Math.round(e.impact * 2));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        ps.spawn({ x: b.pos.x + Math.cos(a) * 0.3, y: b.pos.y + 0.05, z: b.pos.z + Math.sin(a) * 0.3, vx: Math.cos(a) * rng.range(1.5, 3), vy: rng.range(0.2, 0.8), vz: Math.sin(a) * rng.range(1.5, 3), life: 0.9, size: 0.3, size1: 1.0, sprite: P.dust, color: [0.66, 0.55, 0.42], drag: 3, alpha: 0.75 });
      }
      if (this.terrain.splatAt(b.pos.x, b.pos.z).litter > 0.4) for (let k = 0; k < 8; k++) this.spawnLeaf(b.pos.x, b.pos.y + 0.1, b.pos.z, { vx: rng.range(-2, 2), vy: rng.range(2, 4), vz: rng.range(-2, 2), gravity: 3, life: 5, rest: 2 });
    }
    if (e.type === 'splash' || e.type === 'sink') {
      const n = e.type === 'sink' ? 30 : 6;
      for (let k = 0; k < n; k++) ps.spawn({ x: b.pos.x + rng.range(-0.4, 0.4), y: 0.05, z: b.pos.z + rng.range(-0.4, 0.4), vx: rng.range(-1.5, 1.5) + b.vel.x * 0.3, vy: rng.range(2, 4.5), vz: rng.range(-1.5, 1.5) + b.vel.z * 0.3, life: 1, size: 0.12, sprite: P.drop, color: [0.8, 0.9, 1], gravity: 9.8, drag: 0.3 });
      ps.spawn({ x: b.pos.x, y: 0.04, z: b.pos.z, life: 0.8, size: 0.4, size1: 2.2, sprite: P.ring, color: [0.85, 0.95, 1], alpha: 0.7 });
    }
    if (e.type === 'crash') {
      for (let k = 0; k < 7; k++) ps.spawn({ x: b.pos.x, y: b.pos.y + 1, z: b.pos.z, vx: rng.range(-3, 3), vy: rng.range(3, 6), vz: rng.range(-3, 3), life: 2.2, size: 0.28, sprite: P.bone, color: [1, 1, 1], gravity: 12, drag: 0.4, spin: rng.range(-12, 12), ground: true, rest: 1.2 });
      for (let k = 0; k < 14; k++) ps.spawn({ x: b.pos.x, y: b.pos.y + 0.3, z: b.pos.z, vx: rng.range(-2, 2), vy: rng.range(0.3, 1.5), vz: rng.range(-2, 2), life: 1.2, size: 0.4, size1: 1.3, sprite: P.dust, color: [0.7, 0.6, 0.48], drag: 2.5, alpha: 0.8 });
      for (let k = 0; k < 4; k++) ps.spawn({ x: b.pos.x, y: b.pos.y + 1.4, z: b.pos.z, vx: rng.range(-1, 1), vy: rng.range(1, 2), vz: rng.range(-1, 1), life: 1.4, size: 0.22, sprite: P.star, color: [1, 0.95, 0.6], emissive: 1, gravity: 2, drag: 1 });
    }
    if (e.type === 'reassemble') this.magic(b.pos.x, b.pos.y + 0.8, b.pos.z, 24);
    if (e.type === 'boost') for (let k = 0; k < 20; k++) ps.spawn({ x: b.pos.x, y: b.pos.y + 0.7, z: b.pos.z, vx: rng.range(-2, 2), vy: rng.range(0, 2), vz: rng.range(-2, 2), life: 0.7, size: 0.16, sprite: P.bubble, color: [0.95, 0.85, 0.7], drag: 2 });
    if (e.type === 'driftBoost') for (let k = 0; k < 10; k++) ps.spawn({ x: b.pos.x, y: b.pos.y + 0.3, z: b.pos.z, vx: rng.range(-1.5, 1.5), vy: rng.range(1, 2.5), vz: rng.range(-1.5, 1.5), life: 0.6, size: 0.14, sprite: P.spark, color: e.level > 1 ? [0.6, 0.85, 1] : [1, 0.75, 0.3], emissive: 1, gravity: 4, drag: 1 });
    if (e.type === 'bonk' && e.tree) {
      // shaking a tree drops a flurry of leaves
      const t = e.tree;
      for (let k = 0; k < 16; k++) this.spawnLeaf(t.x + rng.range(-2, 2), t.y + t.H * rng.range(0.5, 0.9), t.z + rng.range(-2, 2), { vy: rng.range(-0.5, 0.5) });
    }
  }

  magic(x, y, z, n = 20, color = [0.6, 1, 0.6]) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.ps.spawn({ x: x + Math.cos(a) * 0.8, y: y + this.rng.range(-0.6, 0.8), z: z + Math.sin(a) * 0.8, vx: -Math.sin(a) * 1.5, vy: this.rng.range(0.5, 1.5), vz: Math.cos(a) * 1.5, life: this.rng.range(0.8, 1.4), size: 0.2, sprite: P.magic, color, emissive: 1, drag: 1.5, blink: 10 });
    }
  }
  hearts(x, y, z, n = 6) {
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-0.8, 0.8), vy: this.rng.range(1.2, 2.2), vz: this.rng.range(-0.8, 0.8), life: 1.6, size: 0.28, sprite: P.heart, color: [1, 1, 1], emissive: 0.4, drag: 1.2, flutter: 0.3 });
  }
  coins(x, y, z, n = 8) {
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-1.5, 1.5), vy: this.rng.range(3, 5), vz: this.rng.range(-1.5, 1.5), life: 1.4, size: 0.24, sprite: P.coin, color: [1, 1, 1], emissive: 0.5, gravity: 9, drag: 0.3, spin: this.rng.range(8, 14), ground: true, rest: 0.4 });
  }
  confetti(x, y, z, n = 40) {
    const cols = [[1, 0.3, 0.3], [1, 0.8, 0.2], [0.3, 0.7, 1], [0.4, 0.9, 0.4], [1, 0.5, 0.9]];
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-3, 3), vy: this.rng.range(3, 6), vz: this.rng.range(-3, 3), life: 2.5, size: 0.12, sprite: P.confetti, color: cols[k % cols.length], emissive: 0.3, gravity: 3, drag: 1.5, spin: this.rng.range(-10, 10), flutter: 0.6, ground: true, rest: 1 });
  }
  dirtBurst(x, y, z, n = 20) {
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-2, 2), vy: this.rng.range(2, 5), vz: this.rng.range(-2, 2), life: 1.6, size: 0.12, sprite: P.dirt, color: [1, 1, 1], gravity: 10, drag: 0.4, ground: true, rest: 0.8 });
  }
  // pumpkin guts, seeds and candle sparks when a prop is smashed
  burst(x, y, z, kind = 'pumpkin') {
    const pumpkin = kind === 'pumpkin' || kind === 'jack';
    for (let k = 0; k < 26; k++) {
      const seed = k % 3 === 0;
      this.ps.spawn({ x, y, z, vx: this.rng.range(-3, 3), vy: this.rng.range(2, 6), vz: this.rng.range(-3, 3), life: this.rng.range(0.9, 1.6), size: seed ? 0.07 : 0.13, sprite: seed ? P.chip : P.dirt, color: pumpkin ? (seed ? [1, 0.95, 0.8] : [1, 0.55, 0.15]) : [0.9, 0.8, 0.7], gravity: 11, drag: 0.4, spin: this.rng.range(-12, 12), ground: true, rest: 0.6 });
    }
    for (let k = 0; k < 8; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-1, 1), vy: this.rng.range(0.5, 1.5), vz: this.rng.range(-1, 1), life: 0.9, size: 0.35, size1: 0.7, sprite: P.puff, color: [1, 0.85, 0.7], drag: 2 });
    if (kind === 'jack') for (let k = 0; k < 10; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-2, 2), vy: this.rng.range(1, 4), vz: this.rng.range(-2, 2), life: 0.8, size: 0.1, sprite: P.ember, color: [1, 0.7, 0.3], emissive: 1, gravity: 2, drag: 1, blink: 8 });
  }
  frost(x, y, z, n = 10) {
    for (let k = 0; k < n; k++) this.ps.spawn({ x: x + this.rng.range(-0.4, 0.4), y: y + this.rng.range(0, 1.6), z: z + this.rng.range(-0.4, 0.4), vx: this.rng.range(-0.3, 0.3), vy: this.rng.range(0.1, 0.5), vz: this.rng.range(-0.3, 0.3), life: 1.5, size: 0.14, sprite: P.frost, color: [0.8, 0.95, 1], emissive: 0.6, drag: 1 });
  }
}
