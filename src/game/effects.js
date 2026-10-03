// Drives the particle system from the world state: ambient leaves, motes,
// fireflies, toon chimney smoke, fire, weather, and every bike reaction, plus
// the cartoon effects API other systems call:
//   poof(x,y,z,{scale,color,count})            puffy outlined smoke cluster
//   impact(x,y,z,power)                        comic impact star + speed burst
//   breakBits(x,y,z,{colors,count,power,size}) chunky voxel debris that bounces and settles
//   speedLines(on, strength)                   anime speed lines over the screen
//   chimneySmoke(x,y,z,{color,scale})          one rising toon puff
//   splashCrown(x,y,z,scale), splashDrops(x,y,z,n), glint(x,y,z,o), feathers(x,y,z,n),
//   leafBurst(x,y,z,n,power), skid(x,z,yaw,o), dustKick(x,y,z,o), sweat(x,y,z), dizzy(x,y,z)
// Existing helpers (burst, magic, dirtBurst, frost, hearts, coins, confetti, ps.spawn) keep working.
import * as THREE from 'three';
import { Particles, P } from '../render/particles.js';
import { LEAF_COLORS } from '../art/groundtex.js';
import { forestNoise } from '../world/terrain.js';
import { G, LIGHT_PARS_VERT, LIGHT_PARS_FRAG, SHADOW_VERT, worldUniforms } from '../render/shaderlib.js';
import { clamp, damp } from '../core/math.js';

const LEAF_SPRITES = [P.leaf0, P.leaf1, P.leaf2, P.leaf3, P.maple, P.maple];
const _v = new THREE.Vector3();
const SMOKE = [0.86, 0.84, 0.88];
const DUST = [0.82, 0.7, 0.54];

export class Effects {
  constructor(game) {
    this.game = game;
    this.ps = new Particles(4500);
    game.scene.add(this.ps.points);
    const T = game.world.terrain;
    this.ps.ground = (x, z) => game.physics.groundAt(x, z, 1e9, 0).h;
    this.acc = { leaves: 0, motes: 0, flies: 0, rain: 0, snow: 0, smoke: 0, fire: 0, dust: 0, steam: 0, boost: 0, cauldron: 0, pedal: 0, splash: 0 };
    this.terrain = T;
    this.smoke = game.world.ctx.smoke;
    this.fires = game.world.ctx.fires;
    this.rng = this.ps.rng;
    this.cups = [];
    this.debris = new Debris(game);
    this.lines = new SpeedLines();
    this.lineKick = 0;
    this.lineExt = { strength: 0, until: -1 };
    this.skidT = 0;
    this.lastSkid = null;
    this.wheelie = false;
    this.stoppie = false;
    this.leafPiles = []; // optional { x, z, r } spots that burst into leaves when ridden through
    this.cauldron = null;
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

  // ---------------------------------------------------------------- cartoon effects API
  // a cluster of puffy toon smoke balls that pop, swell and break apart
  poof(x, y, z, { scale = 1, color = SMOKE, count = 6, rise = 0.5, spread = 1, life = 0.9, emissive = 0 } = {}) {
    const r = this.rng;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + r.range(-0.4, 0.4);
      const d = r.range(0.1, 0.45) * scale * spread;
      const s = r.range(0.55, 0.95) * scale;
      this.ps.spawn({
        x: x + Math.cos(a) * d, y: y + r.range(-0.1, 0.25) * scale, z: z + Math.sin(a) * d,
        vx: Math.cos(a) * r.range(0.8, 2) * scale * spread, vy: r.range(0.2, 1) * rise + 0.3, vz: Math.sin(a) * r.range(0.8, 2) * scale * spread,
        life: life * r.range(0.8, 1.25), size: s * 0.8, size1: s * 1.35, sprite: P.toon, color, drag: 3.2, wind: 0.3, emissive,
      });
    }
  }

  // comic impact: a jagged star, a ring of speed marks, dizzy stars and a dust poof
  impact(x, y, z, power = 1) {
    const r = this.rng;
    const k = clamp(power, 0.3, 2.5);
    // the star sits a little towards the lens so the smoke never swallows it
    const cp = this.game.camera.position;
    const dx = cp.x - x, dy = cp.y - y, dz = cp.z - z, dl = Math.hypot(dx, dy, dz) || 1, o = Math.min(0.8, dl * 0.3);
    const sx = x + (dx / dl) * o, sy = y + (dy / dl) * o, sz = z + (dz / dl) * o;
    this.ps.spawn({ x: sx, y: sy, z: sz, life: 0.32, size: 1.1 * k, size1: 1.6 * k, sprite: P.impact, color: [1, 1, 1], emissive: 0.6 });
    this.ps.spawn({ x: sx, y: sy, z: sz, life: 0.28, size: 1.6 * k, size1: 2.8 * k, sprite: P.burst, color: [1, 1, 1], emissive: 0.4 });
    for (let i = 0, n = Math.round(3 + k * 2); i < n; i++) {
      const a = r.range(0, Math.PI * 2);
      this.ps.spawn({ x, y: y + 0.1, z, vx: Math.cos(a) * r.range(2, 4) * k, vy: r.range(2, 4), vz: Math.sin(a) * r.range(2, 4) * k, life: r.range(0.6, 0.9), size: r.range(0.18, 0.28) * Math.sqrt(k), sprite: P.dizzy, color: [1, 1, 1], emissive: 0.5, gravity: 7, drag: 1, spin: r.range(6, 12) * r.sign() });
    }
    this.poof(x, y - 0.2 * k, z, { scale: 0.7 * k, color: DUST, count: Math.round(4 + k * 2) });
    this.game.chase?.shake?.(0.25 * k);
  }

  // chunky debris cubes in the given colours, bouncing and settling
  breakBits(x, y, z, { colors = [0xe0701e, 0xf08a2a, 0xc85a14], count = 12, power = 1, size = 0.1 } = {}) {
    this.debris.burst(x, y, z, colors, count, power, size);
    // and a sprinkle of pixel chips for the small stuff
    const r = this.rng;
    for (let k = 0; k < Math.round(count * 0.6); k++) {
      const c = new THREE.Color(colors[k % colors.length]);
      this.ps.spawn({ x, y, z, vx: r.range(-3, 3) * power, vy: r.range(2, 5) * power, vz: r.range(-3, 3) * power, life: r.range(0.9, 1.5), size: r.range(0.07, 0.12), sprite: P.chunk, color: [c.r, c.g, c.b], gravity: 11, drag: 0.4, spin: r.range(-10, 10), ground: true, rest: 0.8 });
    }
  }

  // anime speed lines: callers can force them on for a moment
  // (once the game starts driving them, the built-in speed rule steps aside)
  speedLines(on, strength = 1) {
    this.lineDriven = true;
    this.lineExt.strength = on ? clamp(strength, 0, 1) : 0;
    this.lineExt.until = on ? (this.game.time || 0) + 0.25 : -1;
  }

  chimneySmoke(x, y, z, { color = SMOKE, scale = 1 } = {}) {
    const r = this.rng;
    return this.ps.spawn({ x: x + r.range(-0.12, 0.12), y, z: z + r.range(-0.12, 0.12), vx: r.range(-0.1, 0.1), vy: r.range(0.8, 1.1), vz: r.range(-0.1, 0.1), life: r.range(5, 6.5), size: 0.5 * scale, size1: 2.0 * scale, sprite: P.toon, color, drag: 0.25, wind: 0.32, flutter: 0.18, fadeIn: 0.2 });
  }

  splashCrown(x, y, z, scale = 1) {
    const r = this.rng;
    this.ps.spawn({ x, y: y + 0.38 * scale, z, life: 0.45, size: 1.0 * scale, size1: 1.25 * scale, sprite: P.crown, color: [1, 1, 1], emissive: 0.15 });
    this.ps.spawn({ x, y: y + 0.01, z, life: 0.9, size: 0.6 * scale, size1: 2.2 * scale, sprite: P.ripple, color: [0.9, 0.97, 1], alpha: 0.9, phase: r.range(0, 6) });
    this.ps.spawn({ x, y: y + 0.01, z, life: 1.3, size: 0.4 * scale, size1: 3.0 * scale, sprite: P.ripple, color: [0.85, 0.95, 1], alpha: 0.7, phase: r.range(0, 6) });
    this.splashDrops(x, y + 0.1, z, Math.round(6 + scale * 6), scale);
  }
  splashDrops(x, y, z, n = 8, scale = 1) {
    const r = this.rng;
    for (let k = 0; k < n; k++) {
      const a = r.range(0, Math.PI * 2), s = r.range(1, 2.4) * scale;
      this.ps.spawn({ x, y, z, vx: Math.cos(a) * s, vy: r.range(2.5, 4.5) * Math.sqrt(scale), vz: Math.sin(a) * s, life: 0.9, size: r.range(0.09, 0.15), sprite: P.drop, color: [0.85, 0.95, 1], gravity: 9.8, drag: 0.3 });
    }
  }
  glint(x, y, z, { color = [1, 0.96, 0.8], size = 0.35, life = 0.5 } = {}) {
    return this.ps.spawn({ x, y, z, life, size, sprite: P.glint, color, emissive: 1 });
  }
  feathers(x, y, z, n = 3, color = [0.9, 0.86, 0.8]) {
    const r = this.rng;
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: r.range(-0.8, 0.8), vy: r.range(0.5, 1.5), vz: r.range(-0.8, 0.8), life: r.range(2, 3), size: 0.14, sprite: P.feather, color, gravity: 0.6, drag: 2, flutter: 0.6, spin: r.range(-3, 3), ground: true, rest: 1 });
  }
  leafBurst(x, y, z, n = 14, power = 1) {
    const r = this.rng;
    for (let k = 0; k < n; k++) this.spawnLeaf(x + r.range(-0.3, 0.3), y + 0.1, z + r.range(-0.3, 0.3), { vx: r.range(-2.2, 2.2) * power, vy: r.range(2, 4.5) * power, vz: r.range(-2.2, 2.2) * power, gravity: 2.6, life: 6, rest: 2.5 });
  }
  // a flat skid streak on the ground, aligned with yaw
  skid(x, z, yaw, { width = 0.11, length = 0.32, color = [0.22, 0.18, 0.16], life = 7 } = {}) {
    const y = this.game.physics.groundAt(x, z, 1e9, 0).h + 0.025;
    return this.ps.spawn({ x, y, z, life, size: width, stretch: length / width, sprite: P.skid, color, alpha: 0.85, phase: yaw, fadeIn: 0.01 });
  }
  dustKick(x, y, z, { color = DUST, scale = 0.5, vx = 0, vz = 0 } = {}) {
    const r = this.rng;
    return this.ps.spawn({ x: x + r.range(-0.1, 0.1), y, z: z + r.range(-0.1, 0.1), vx: vx + r.range(-0.4, 0.4), vy: r.range(0.3, 0.8), vz: vz + r.range(-0.4, 0.4), life: r.range(0.5, 0.75), size: 0.45 * scale, size1: 0.95 * scale, sprite: P.toon, color, drag: 3 });
  }
  sweat(x, y, z, n = 3) {
    const r = this.rng;
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: r.range(-1.2, 1.2), vy: r.range(1.5, 2.5), vz: r.range(-1.2, 1.2), life: 0.7, size: 0.18, sprite: P.sweat, color: [1, 1, 1], gravity: 7, drag: 0.5 });
  }
  dizzy(x, y, z, n = 4) {
    const r = this.rng;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.ps.spawn({ x: x + Math.cos(a) * 0.3, y, z: z + Math.sin(a) * 0.3, vx: -Math.sin(a) * 1.2, vy: 0.1, vz: Math.cos(a) * 1.2, life: 1.4, size: 0.2, sprite: P.dizzy, color: [1, 1, 1], emissive: 0.6, drag: 0.6, spin: 6 });
    }
  }

  // ---------------------------------------------------------------- per frame
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
      this.acc.flies += dt * 14 * night * (atm.weather.rain > 0.3 ? 0.1 : 1);
      while (this.acc.flies > 1) {
        this.acc.flies -= 1;
        const x = focus.x + rng.range(-17, 17), z = focus.z + rng.range(-17, 17);
        const h = this.terrain.heightAt(x, z);
        if (h < 0.3) continue;
        // a firefly: a lime glow and its bright little tail light, drifting and blinking
        const o = { x, y: h + rng.range(0.4, 2.2), z, vx: rng.range(-0.4, 0.4), vy: rng.range(-0.1, 0.2), vz: rng.range(-0.4, 0.4), life: rng.range(3, 6), drag: 0.1, fadeIn: 0.8, flutter: 0.25, blink: rng.range(3, 6), seed: rng.next() };
        ps.spawn({ ...o, size: 0.16, sprite: P.firefly, color: [0.9, 1, 0.6], emissive: 1 });
      }
    }
    // --- chimney smoke & campfires
    this.acc.smoke += dt * 1.6;
    while (this.acc.smoke > 1) {
      this.acc.smoke -= 1;
      for (const s of this.smoke) {
        if (Math.abs(s.x - cam.position.x) > 160 || Math.abs(s.z - cam.position.z) > 160) continue;
        this.chimneySmoke(s.x, s.y, s.z);
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
        else if (kind < 0.9) ps.spawn({ x: f.x, y: f.y + 0.6, z: f.z, vy: 0.8, life: 3, size: 0.4, size1: 1.4, sprite: P.toon, color: [0.62, 0.6, 0.64], drag: 0.3, wind: 0.5 });
      }
    }
    this.updateCauldron(dt, cam);
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
    this.updateSpeedLines(dt);
    this.debris.update(dt);
    ps.update(dt);
  }

  // the witch's cauldron on the plaza bubbles over with green toon steam
  updateCauldron(dt, cam) {
    if (this.cauldron === null) this.cauldron = this.game.world.voxel?.spots?.find((s) => s.action === 'cauldron') || false;
    const c = this.cauldron;
    if (!c || Math.abs(c.x - cam.position.x) > 70 || Math.abs(c.z - cam.position.z) > 70) return;
    this.acc.cauldron += dt * 3;
    const y = (c.y ?? this.game.physics.groundAt(c.x, c.z, 1e9, 0).h) + 1.0;
    while (this.acc.cauldron > 1) {
      this.acc.cauldron -= 1;
      const r = this.rng;
      if (r.next() < 0.45) this.ps.spawn({ x: c.x + r.range(-0.3, 0.3), y: y + 0.4, z: c.z + r.range(-0.3, 0.3), vx: r.range(-0.1, 0.1), vy: r.range(0.5, 0.8), vz: r.range(-0.1, 0.1), life: r.range(2, 3), size: 0.35, size1: 1.0, sprite: P.toon, color: [0.62, 0.95, 0.55], emissive: 0.35, drag: 0.6, wind: 0.4 });
      this.ps.spawn({ x: c.x + r.range(-0.35, 0.35), y: y + 0.25, z: c.z + r.range(-0.35, 0.35), vy: r.range(0.3, 0.7), life: r.range(0.6, 1.1), size: r.range(0.1, 0.18), sprite: P.bubble, color: [0.7, 1, 0.55], emissive: 0.8, drag: 1 });
    }
  }

  updateBike(dt) {
    const g = this.game;
    const b = g.bike;
    if (!b) return;
    const ps = this.ps;
    const rng = this.rng;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const rearX = b.pos.x - fx * 0.55, rearZ = b.pos.z - fz * 0.55;
    const frontX = b.pos.x + fx * 0.55, frontZ = b.pos.z + fz * 0.55;
    const visible = g.bikeModel?.root?.visible !== false && !g.onFoot;
    const surf = b.surface;
    // dust & kicked-up leaves behind the rear wheel
    if (visible && b.grounded && b.crash <= 0 && b.speed > 2.5 && surf !== 'water') {
      const rate = (b.speed - 2) * (b.drifting ? 5 : 1.2) * (surf === 'road' ? 0.5 : 1);
      this.acc.dust += dt * rate;
      const litter = this.terrain.splatAt(b.pos.x, b.pos.z).litter;
      while (this.acc.dust > 1) {
        this.acc.dust -= 1;
        if (litter > 0.5 && rng.next() < 0.6) {
          this.spawnLeaf(rearX, b.pos.y + 0.1, rearZ, { vx: -fx * rng.range(1, 3) + rng.range(-1, 1), vy: rng.range(1.5, 3.2), vz: -fz * rng.range(1, 3) + rng.range(-1, 1), gravity: 3, life: 5, rest: 2 });
          continue;
        }
        const col = surf === 'grass' ? [0.66, 0.66, 0.46] : surf === 'wood' ? [0.78, 0.68, 0.54] : DUST;
        this.dustKick(rearX, b.pos.y + 0.12, rearZ, { color: col, scale: 0.42 + Math.min(0.3, b.speed * 0.02), vx: -fx * 0.8, vz: -fz * 0.8 });
        if (b.drifting && rng.next() < 0.4) ps.spawn({ x: rearX, y: b.pos.y + 0.1, z: rearZ, vx: rng.range(-2, 2), vy: rng.range(1.5, 3), vz: rng.range(-2, 2), life: 1.2, size: 0.09, sprite: P.dirt, color: [1, 1, 1], gravity: 9, drag: 0.5, ground: true, rest: 0.3 });
      }
      // leaf piles: big leafy explosions
      if (litter > 0.75 && b.speed > 6 && rng.next() < dt * 2.5) this.leafBurst(b.pos.x, b.pos.y, b.pos.z, 8, 0.8 + b.speed * 0.03);
      for (const pile of this.leafPiles) {
        const d = Math.hypot(pile.x - b.pos.x, pile.z - b.pos.z);
        if (d < (pile.r || 1.5) && (g.time || 0) - (pile.last || -9) > 2) { pile.last = g.time || 0; this.leafBurst(pile.x, b.pos.y, pile.z, 26, 1 + b.speed * 0.05); }
      }
    }
    // skid marks while drifting, skidding, braking hard or nose-wheeling
    this.skidT = Math.max(0, this.skidT - dt);
    const braking = b.skidding ?? (b.brakeIn > 0.6 && b.fwdSpeed > 4);
    const skidding = visible && b.grounded && b.crash <= 0 && surf !== 'water' && (b.drifting || this.skidT > 0 || braking || this.stoppie);
    if (skidding) {
      const wx = this.stoppie ? frontX : rearX, wz = this.stoppie ? frontZ : rearZ;
      const last = this.lastSkid;
      if (!last) this.lastSkid = { x: wx, z: wz };
      else {
        const dx = wx - last.x, dz = wz - last.z, d = Math.hypot(dx, dz);
        if (d > 0.22) {
          this.skid((wx + last.x) / 2, (wz + last.z) / 2, Math.atan2(dx, dz), { length: d + 0.06, color: surf === 'grass' ? [0.2, 0.24, 0.12] : [0.2, 0.16, 0.14] });
          this.lastSkid = { x: wx, z: wz };
          if (rng.next() < 0.5) this.dustKick(wx, b.pos.y + 0.1, wz, { color: surf === 'road' ? [0.78, 0.74, 0.7] : DUST, scale: 0.55 });
        }
        if (d > 2) this.lastSkid = { x: wx, z: wz };
      }
    } else this.lastSkid = null;
    // splashing through shallow water
    if (visible && b.inWater > 0 && b.speed > 2) {
      this.acc.splash += dt * b.speed * 1.5;
      while (this.acc.splash > 1) {
        this.acc.splash -= 1;
        this.splashDrops(rearX, 0.05, rearZ, 2, 0.6);
        if (rng.next() < 0.15) ps.spawn({ x: b.pos.x, y: 0.02, z: b.pos.z, life: 1, size: 0.5, size1: 1.8, sprite: P.ripple, color: [0.9, 0.97, 1], alpha: 0.8 });
      }
    }
    // cola boost: foamy jets + fizz (if the bike still has one)
    if (b.boostTime > 0 && b.stats?.boostCharges > 0 && g.bikeModel?.nozzles) {
      this.acc.boost += dt * 150;
      g.chase.shake(0.12);
      const m = g.bikeModel;
      while (this.acc.boost > 1) {
        this.acc.boost -= 1;
        const n = m.nozzles[Math.floor(rng.next() * 2)];
        const w = n.clone().applyMatrix4(m.bicycle.matrixWorld);
        ps.spawn({ x: w.x, y: w.y, z: w.z, vx: -fx * rng.range(3, 6) + b.vel.x * 0.5, vy: rng.range(-0.2, 0.8), vz: -fz * rng.range(3, 6) + b.vel.z * 0.5, life: rng.range(0.5, 0.95), size: 0.24, size1: 0.95, sprite: rng.next() < 0.55 ? P.foam : P.bubble, color: rng.next() < 0.5 ? [0.55, 0.32, 0.18] : [0.97, 0.9, 0.78], drag: 2.2, gravity: 1, ground: true });
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

  updateSpeedLines(dt) {
    const g = this.game;
    const b = g.bike;
    this.lineKick = Math.max(0, this.lineKick - dt * 1.6);
    let s = 0;
    if (g.mode === 'ride' && !g.onFoot && b && b.crash <= 0 && !(g.ui?.menuStack?.length)) {
      if (!this.lineDriven) {
        const top = b.stats?.topSpeed || 12;
        s = clamp((b.speed - top * 0.62) / (top * 0.38), 0, 1);
        if (!b.grounded && b.speed > top * 0.4) s = Math.max(s, 0.35);
      }
      s = Math.max(s, this.lineKick);
    }
    if ((g.time || 0) < this.lineExt.until) s = Math.max(s, this.lineExt.strength);
    this.lineLevel = damp(this.lineLevel || 0, s, s > (this.lineLevel || 0) ? 8 : 4, dt);
    this.lines.update(dt, this.lineLevel);
  }

  // ---- one-shot reactions (unknown events are ignored)
  onBikeEvent(e) {
    const g = this.game;
    const b = g.bike;
    const ps = this.ps;
    const rng = this.rng;
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const y = b.pos.y;
    const water = b.surface === 'water' || b.inWater > 0;
    switch (e.type) {
      case 'jump':
        if (!water) this.poof(b.pos.x - fx * 0.5, y + 0.1, b.pos.z - fz * 0.5, { scale: 0.5, color: DUST, count: 3 });
        break;
      case 'launch':
        this.lineKick = Math.max(this.lineKick, 0.5);
        break;
      case 'land': {
        const k = e.impact ?? 0;
        if (k > 2.5 && !water) {
          const n = Math.min(10, Math.round(k * 1.2));
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2;
            this.dustKick(b.pos.x + Math.cos(a) * 0.35, y + 0.08, b.pos.z + Math.sin(a) * 0.35, { scale: 0.45 + k * 0.03, vx: Math.cos(a) * 2.2, vz: Math.sin(a) * 2.2 });
          }
          if (this.terrain.splatAt(b.pos.x, b.pos.z).litter > 0.4) this.leafBurst(b.pos.x, y, b.pos.z, 10, 0.9);
        }
        if (k > 8) this.impact(b.pos.x, y + 0.25, b.pos.z, 0.55 + (k - 8) * 0.05);
        break;
      }
      case 'perfectLand':
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this.glint(b.pos.x + Math.cos(a) * 0.8, y + rng.range(0.3, 1.2), b.pos.z + Math.sin(a) * 0.8, { size: 0.4 });
        }
        ps.spawn({ x: b.pos.x, y: y + 0.6, z: b.pos.z, life: 0.3, size: 1.4, size1: 2.6, sprite: P.burst, color: [1, 0.95, 0.7], emissive: 0.6 });
        this.lineKick = Math.max(this.lineKick, 0.6);
        break;
      case 'sketchyLand':
        this.poof(b.pos.x, y + 0.1, b.pos.z, { scale: 0.55, color: DUST, count: 4 });
        this.sweat(b.pos.x, y + 1.7, b.pos.z, 3);
        break;
      case 'splash':
        this.splashCrown(b.pos.x, 0.02, b.pos.z, e.big ? 1 : 0.6);
        break;
      case 'sink':
        this.splashCrown(b.pos.x, 0.02, b.pos.z, 1.3);
        break;
      case 'bail':
        // (the bike sends 'bail' and 'crash' together; the crash carries the show)
        break;
      case 'crash': {
        const hx = b.pos.x, hz = b.pos.z;
        if (e.soft) {
          // a flop: a dusty sit-down rather than a wreck
          this.poof(hx, y + 0.3, hz, { scale: 0.8, color: water ? [0.85, 0.95, 1] : DUST, count: 5 });
          this.dizzy(hx, y + 1.3, hz, 3);
          break;
        }
        this.impact(hx, y + 0.8, hz, clamp((e.impact ?? 10) / 10, 0.7, 1.3));
        this.poof(hx, y + 0.4, hz, { scale: 1.3, color: [0.9, 0.86, 0.82], count: 8 });
        this.breakBits(hx, y + 0.5, hz, { colors: [0xc8361f, 0xf4eee0, 0x2a2428, 0xe8a830], count: 10, power: 1, size: 0.09 });
        for (let k = 0; k < 7; k++) ps.spawn({ x: hx, y: y + 1, z: hz, vx: rng.range(-3, 3), vy: rng.range(3, 6), vz: rng.range(-3, 3), life: 2.2, size: 0.28, sprite: P.bone, color: [1, 1, 1], gravity: 12, drag: 0.4, spin: rng.range(-12, 12), ground: true, rest: 1.2 });
        this.dizzy(hx, y + 1.5, hz, 4);
        break;
      }
      case 'frontSlam':
      case 'rearSlam': {
        // a wheel slapping back down out of a wheelie / stoppie
        const k = clamp((e.power ?? 3) / 6, 0.2, 1.2);
        const w = e.type === 'frontSlam' ? frontPos(b, 0.55) : frontPos(b, -0.55);
        if (!water) this.poof(w.x, y + 0.06, w.z, { scale: 0.35 + k * 0.3, color: DUST, count: 3 + Math.round(k * 2) });
        else this.splashDrops(w.x, 0.05, w.z, 5, 0.6);
        if (k > 0.8) this.ps.spawn({ x: w.x, y: y + 0.25, z: w.z, life: 0.22, size: 0.6 * k, size1: 1.0 * k, sprite: P.burst, color: [1, 0.96, 0.85], emissive: 0.4 });
        break;
      }
      case 'bump': {
        const sz = e.size ?? 0.2;
        if (water || sz < 0.12) break;
        const w = frontPos(b, 0.5);
        this.dustKick(w.x, y + 0.08, w.z, { scale: 0.3 + Math.min(0.4, sz), color: DUST });
        if (e.rough) for (let k = 0; k < 4; k++) ps.spawn({ x: w.x, y: y + 0.1, z: w.z, vx: rng.range(-1.5, 1.5), vy: rng.range(1.5, 3), vz: rng.range(-1.5, 1.5), life: 1, size: 0.08, sprite: P.dirt, color: [1, 1, 1], gravity: 10, drag: 0.4, ground: true, rest: 0.4 });
        break;
      }
      case 'pedalSlip':
        // rear wheel spinning out: a spray of dirt and a little puff
        if (!water) {
          const r = frontPos(b, -0.55);
          for (let k = 0; k < 5; k++) ps.spawn({ x: r.x, y: y + 0.08, z: r.z, vx: -fx * rng.range(1.5, 3) + rng.range(-0.6, 0.6), vy: rng.range(1, 2.5), vz: -fz * rng.range(1.5, 3) + rng.range(-0.6, 0.6), life: 0.9, size: 0.08, sprite: P.dirt, color: [1, 1, 1], gravity: 10, drag: 0.4, ground: true, rest: 0.4 });
          this.dustKick(r.x, y + 0.08, r.z, { scale: 0.5, vx: -fx, vz: -fz });
        }
        break;
      case 'dab': {
        // a foot dabbed down to catch a wobble
        const sd = e.side ?? 1;
        const dx = Math.cos(b.yaw) * 0.45 * sd, dz = -Math.sin(b.yaw) * 0.45 * sd;
        if (!water) this.dustKick(b.pos.x + dx, y + 0.05, b.pos.z + dz, { scale: 0.4 });
        else this.splashDrops(b.pos.x + dx, 0.05, b.pos.z + dz, 4, 0.5);
        break;
      }
      case 'reassemble':
        this.magic(b.pos.x, y + 0.8, b.pos.z, 24);
        this.poof(b.pos.x, y + 0.5, b.pos.z, { scale: 0.9, color: [0.85, 1, 0.85], count: 6, emissive: 0.3 });
        break;
      case 'boost':
        for (let k = 0; k < 20; k++) ps.spawn({ x: b.pos.x, y: y + 0.7, z: b.pos.z, vx: rng.range(-2, 2), vy: rng.range(0, 2), vz: rng.range(-2, 2), life: 0.7, size: 0.16, sprite: P.bubble, color: [0.95, 0.85, 0.7], drag: 2 });
        this.lineKick = 1;
        break;
      case 'driftStart':
        this.poof(b.pos.x - fx * 0.5, y + 0.1, b.pos.z - fz * 0.5, { scale: 0.5, color: DUST, count: 3 });
        break;
      case 'driftBoost':
        for (let k = 0; k < 10; k++) ps.spawn({ x: b.pos.x, y: y + 0.3, z: b.pos.z, vx: rng.range(-1.5, 1.5), vy: rng.range(1, 2.5), vz: rng.range(-1.5, 1.5), life: 0.6, size: 0.14, sprite: P.spark, color: e.level > 1 ? [0.6, 0.85, 1] : [1, 0.75, 0.3], emissive: 1, gravity: 4, drag: 1 });
        ps.spawn({ x: b.pos.x - fx * 0.6, y: y + 0.4, z: b.pos.z - fz * 0.6, life: 0.25, size: 1.0, size1: 1.8, sprite: P.burst, color: e.level > 1 ? [0.7, 0.9, 1] : [1, 0.85, 0.5], emissive: 0.8 });
        this.lineKick = Math.max(this.lineKick, 0.8);
        break;
      case 'skid':
        this.skidT = Math.max(this.skidT, 0.35 + Math.min(0.6, (e.speed ?? 6) * 0.04));
        this.poof(b.pos.x - fx * 0.5, y + 0.1, b.pos.z - fz * 0.5, { scale: 0.5, color: DUST, count: 3 });
        break;
      case 'wheelieStart':
        this.wheelie = true;
        this.dustKick(b.pos.x - fx * 0.55, y + 0.1, b.pos.z - fz * 0.55, { scale: 0.6, vx: -fx, vz: -fz });
        break;
      case 'wheelieEnd':
        this.wheelie = false;
        if (!water) this.poof(frontPos(b, 0.6).x, y + 0.08, frontPos(b, 0.6).z, { scale: 0.45, color: DUST, count: 3 });
        break;
      case 'stoppieStart':
        this.stoppie = true;
        this.skidT = Math.max(this.skidT, 0.4);
        break;
      case 'stoppieEnd':
        this.stoppie = false;
        if (!water) this.poof(b.pos.x - fx * 0.55, y + 0.08, b.pos.z - fz * 0.55, { scale: 0.45, color: DUST, count: 3 });
        break;
      case 'flip':
      case 'spin':
        ps.spawn({ x: b.pos.x, y: y + 1.0, z: b.pos.z, life: 0.35, size: 1.8, size1: 2.4, sprite: P.whoosh, color: [1, 1, 1], emissive: 0.5, phase: e.dir === 'front' || e.dir < 0 ? Math.PI * 2 : 0 });
        for (let k = 0; k < 4; k++) this.glint(b.pos.x + rng.range(-0.8, 0.8), y + rng.range(0.5, 1.6), b.pos.z + rng.range(-0.8, 0.8), { size: 0.3 });
        this.lineKick = Math.max(this.lineKick, 0.5);
        break;
      case 'pedalStroke':
        if (b.grounded && b.speed < 5 && b.surface !== 'road' && !water && rng.next() < 0.5) this.dustKick(b.pos.x - fx * 0.55, y + 0.08, b.pos.z - fz * 0.55, { scale: 0.35, vx: -fx * 0.6, vz: -fz * 0.6 });
        break;
      case 'bonk': {
        if (e.tree) {
          // shaking a tree drops a flurry of leaves
          const t = e.tree;
          for (let k = 0; k < 16; k++) this.spawnLeaf(t.x + rng.range(-2, 2), t.y + t.H * rng.range(0.5, 0.9), t.z + rng.range(-2, 2), { vy: rng.range(-0.5, 0.5) });
        }
        if ((e.impact ?? 0) > 3) this.impact(b.pos.x + fx * 0.6, y + 0.7, b.pos.z + fz * 0.6, 0.4 + Math.min(0.6, e.impact * 0.05));
        break;
      }
      default:
        break;
    }
  }

  magic(x, y, z, n = 20, color = [0.6, 1, 0.6]) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.ps.spawn({ x: x + Math.cos(a) * 0.8, y: y + this.rng.range(-0.6, 0.8), z: z + Math.sin(a) * 0.8, vx: -Math.sin(a) * 1.5, vy: this.rng.range(0.5, 1.5), vz: Math.cos(a) * 1.5, life: this.rng.range(0.8, 1.4), size: 0.2, sprite: P.magic, color, emissive: 1, drag: 1.5, blink: 10 });
    }
    if (n >= 12) this.poof(x, y - 0.4, z, { scale: 0.7, color: color.map((c) => 0.55 + c * 0.45), count: 4, emissive: 0.4 });
  }
  hearts(x, y, z, n = 6) {
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-0.8, 0.8), vy: this.rng.range(1.2, 2.2), vz: this.rng.range(-0.8, 0.8), life: 1.6, size: 0.28, sprite: P.heart, color: [1, 1, 1], emissive: 0.4, drag: 1.2, flutter: 0.3 });
  }
  coins(x, y, z, n = 8) {
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-1.5, 1.5), vy: this.rng.range(3, 5), vz: this.rng.range(-1.5, 1.5), life: 1.4, size: 0.24, sprite: P.coin, color: [1, 1, 1], emissive: 0.5, gravity: 9, drag: 0.3, spin: this.rng.range(8, 14), ground: true, rest: 0.4 });
    for (let k = 0; k < Math.ceil(n / 3); k++) this.glint(x + this.rng.range(-0.4, 0.4), y + this.rng.range(0.2, 0.8), z + this.rng.range(-0.4, 0.4), { size: 0.3 });
  }
  confetti(x, y, z, n = 40) {
    const cols = [[1, 0.3, 0.3], [1, 0.8, 0.2], [0.3, 0.7, 1], [0.4, 0.9, 0.4], [1, 0.5, 0.9]];
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-3, 3), vy: this.rng.range(3, 6), vz: this.rng.range(-3, 3), life: 2.5, size: 0.12, sprite: P.confetti, color: cols[k % cols.length], emissive: 0.3, gravity: 3, drag: 1.5, spin: this.rng.range(-10, 10), flutter: 0.6, ground: true, rest: 1 });
  }
  dirtBurst(x, y, z, n = 20) {
    for (let k = 0; k < n; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-2, 2), vy: this.rng.range(2, 5), vz: this.rng.range(-2, 2), life: 1.6, size: 0.12, sprite: P.dirt, color: [1, 1, 1], gravity: 10, drag: 0.4, ground: true, rest: 0.8 });
    if (n >= 10) this.poof(x, y, z, { scale: 0.6, color: [0.62, 0.5, 0.38], count: 3 });
  }
  // pumpkin guts, seeds, chunks and candle sparks when a prop is smashed
  burst(x, y, z, kind = 'pumpkin') {
    const pumpkin = kind === 'pumpkin' || kind === 'jack';
    for (let k = 0; k < 18; k++) {
      const seed = k % 3 === 0;
      this.ps.spawn({ x, y, z, vx: this.rng.range(-3, 3), vy: this.rng.range(2, 6), vz: this.rng.range(-3, 3), life: this.rng.range(0.9, 1.6), size: seed ? 0.07 : 0.13, sprite: seed ? P.chip : P.dirt, color: pumpkin ? (seed ? [1, 0.95, 0.8] : [1, 0.55, 0.15]) : [0.9, 0.8, 0.7], gravity: 11, drag: 0.4, spin: this.rng.range(-12, 12), ground: true, rest: 0.6 });
    }
    const colors = pumpkin ? [0xe0701e, 0xf49a3a, 0xb8501a, 0x5a8a2a] : kind === 'pin' ? [0xf4eee0, 0xc8361f, 0xe8e0d0] : [0xa87a4a, 0x8a5a32, 0xc89a62];
    this.breakBits(x, y, z, { colors, count: 9, power: 0.9, size: 0.08 });
    this.poof(x, y, z, { scale: 0.75, color: pumpkin ? [1, 0.86, 0.66] : [0.9, 0.84, 0.76], count: 5 });
    this.ps.spawn({ x, y: y + 0.2, z, life: 0.25, size: 0.9, size1: 1.3, sprite: P.impact, color: [1, 1, 1], emissive: 0.5 });
    if (kind === 'jack') for (let k = 0; k < 10; k++) this.ps.spawn({ x, y, z, vx: this.rng.range(-2, 2), vy: this.rng.range(1, 4), vz: this.rng.range(-2, 2), life: 0.8, size: 0.1, sprite: P.ember, color: [1, 0.7, 0.3], emissive: 1, gravity: 2, drag: 1, blink: 8 });
  }
  frost(x, y, z, n = 10) {
    for (let k = 0; k < n; k++) this.ps.spawn({ x: x + this.rng.range(-0.4, 0.4), y: y + this.rng.range(0, 1.6), z: z + this.rng.range(-0.4, 0.4), vx: this.rng.range(-0.3, 0.3), vy: this.rng.range(0.1, 0.5), vz: this.rng.range(-0.3, 0.3), life: 1.5, size: 0.14, sprite: P.frost, color: [0.8, 0.95, 1], emissive: 0.6, drag: 1 });
  }
}

function frontPos(b, d) {
  return { x: b.pos.x + Math.sin(b.yaw) * d, z: b.pos.z + Math.cos(b.yaw) * d };
}

// ---------------------------------------------------------------- debris cubes
const DEB_VERT = /* glsl */ `
${LIGHT_PARS_VERT}
varying vec3 vCol;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  mat4 M = modelMatrix * instanceMatrix;
  vec4 worldPosition = M * vec4(position, 1.0);
  vWorldPos = worldPosition.xyz;
  vNormal = normalize(mat3(M) * normal);
  #ifdef USE_INSTANCING_COLOR
  vCol = instanceColor;
  #else
  vCol = vec3(1.0);
  #endif
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = (viewMatrix * vec4(vNormal, 0.0)).xyz;
  gl_Position = projectionMatrix * mvPosition;
  ${SHADOW_VERT}
}
`;
const DEB_FRAG = /* glsl */ `
${LIGHT_PARS_FRAG}
varying vec3 vCol;
varying vec3 vWorldPos;
varying vec3 vNormal;
void main() {
  vec3 n = normalize(vNormal);
  float shadow = getShadowMask();
  float diff = clamp(dot(n, uSunDir) * 0.75 + 0.25, 0.0, 1.0) * shadow;
  vec3 light = hemiAmbient(n) * 1.05 + uSunColor * diff * 0.95 + pointLightsAt(vWorldPos, n, 0.35);
  gl_FragColor = vec4(vCol * light * (n.y > 0.5 ? 1.12 : 1.0), 1.0);
}
`;

class Debris {
  constructor(game, max = 160) {
    this.game = game;
    this.max = max;
    const mat = new THREE.ShaderMaterial({ uniforms: worldUniforms(), vertexShader: DEB_VERT, fragmentShader: DEB_FRAG, lights: true });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < max; i++) this.mesh.setColorAt(i, black);
    game.scene.add(this.mesh);
    this.list = [];
    this.next = 0;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.ax = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.c = new THREE.Color();
  }
  burst(x, y, z, colors, n, power, size) {
    const r = this.game.effects?.rng || { range: (a, b) => a + Math.random() * (b - a), next: Math.random };
    for (let k = 0; k < n; k++) {
      const slot = this.next;
      this.next = (this.next + 1) % this.max;
      const a = r.range(0, Math.PI * 2), sp = r.range(1.5, 3.5) * power;
      const d = {
        slot, x, y, z, vx: Math.cos(a) * sp, vy: r.range(2.5, 5.5) * power, vz: Math.sin(a) * sp,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(r.range(0, 6), r.range(0, 6), r.range(0, 6))),
        w: new THREE.Vector3(r.range(-12, 12), r.range(-12, 12), r.range(-12, 12)), size: size * r.range(0.7, 1.4), t: 0, life: r.range(2.5, 4), rest: false,
      };
      this.list = this.list.filter((o) => o.slot !== slot);
      this.list.push(d);
      this.c.set(colors[k % colors.length]);
      this.c.offsetHSL(0, 0, r.range(-0.05, 0.05));
      this.mesh.setColorAt(slot, this.c);
    }
    this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = this.max;
  }
  update(dt) {
    if (!this.list.length) return;
    const ph = this.game.physics;
    for (const d of this.list) {
      d.t += dt;
      if (!d.rest) {
        d.vy -= 16 * dt;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        const wl = d.w.length();
        if (wl > 1e-3) d.q.premultiply(this.q.setFromAxisAngle(this.ax.copy(d.w).divideScalar(wl), wl * dt));
        const gh = ph.groundAt(d.x, d.z, d.y + 0.5).h + d.size * 0.5;
        if (d.y < gh) {
          d.y = gh;
          d.vy = -d.vy * 0.38;
          d.vx *= 0.62; d.vz *= 0.62;
          d.w.multiplyScalar(0.55);
          if (Math.abs(d.vy) < 0.6 && Math.hypot(d.vx, d.vz) < 0.4) d.rest = true;
        }
      }
      const k = d.t > d.life - 0.5 ? Math.max(0, (d.life - d.t) / 0.5) : 1;
      this.m.compose(this.s.set(d.x, d.y, d.z), d.q, this.ax.setScalar(d.size * k));
      this.mesh.setMatrixAt(d.slot, this.m);
    }
    const dead = this.list.filter((d) => d.t >= d.life);
    for (const d of dead) this.mesh.setMatrixAt(d.slot, this.m.makeScale(0, 0, 0));
    if (dead.length) this.list = this.list.filter((d) => d.t < d.life);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!this.list.length) this.mesh.count = 0;
  }
}

// ---------------------------------------------------------------- anime speed lines
// A 2D canvas over the game: radial streaks from the screen edges that flicker
// in stepped beats and crowd in harder with speed.
class SpeedLines {
  constructor() {
    this.cv = null;
    this.level = 0;
    this.t = 0;
    this.shown = false;
  }
  ensure() {
    if (this.cv || typeof document === 'undefined') return !!this.cv;
    const cv = document.createElement('canvas');
    cv.className = 'speedlines';
    Object.assign(cv.style, { position: 'fixed', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', display: 'none' });
    const stage = document.getElementById('stage');
    (stage || document.body).appendChild(cv);
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    return true;
  }
  update(dt, level) {
    if (level < 0.02) {
      if (this.shown) { this.cv.style.display = 'none'; this.shown = false; }
      return;
    }
    if (!this.ensure()) return;
    if (!this.shown) { this.cv.style.display = 'block'; this.shown = true; this.t = 1; }
    this.t += dt;
    if (this.t < 1 / 15) return; // stepped, like hand-drawn frames
    this.t = 0;
    const W = Math.max(2, Math.round(window.innerWidth / 2)), H = Math.max(2, Math.round(window.innerHeight / 2));
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    const cx = W * 0.5, cy = H * 0.56;
    const R = Math.hypot(W, H) * 0.55;
    const n = Math.round(18 + 72 * level);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = R * (0.74 - 0.34 * level + Math.random() * 0.18);
      const w = (1.4 + Math.random() * 4) * (0.55 + level * 0.9) * (W / 480);
      const ca = Math.cos(a), sa = Math.sin(a);
      const r1 = R * 1.05;
      const k = (0.35 + Math.random() * 0.5) * Math.min(1, level * 1.4);
      // mostly cream streaks, a few dark plum ones so they read on bright skies too
      c.fillStyle = i % 6 === 0 ? `rgba(46, 30, 42, ${k * 0.55})` : `rgba(255, 249, 238, ${k})`;
      c.beginPath();
      c.moveTo(cx + ca * r0, cy + sa * r0);
      c.lineTo(cx + ca * r1 - sa * w, cy + sa * r1 + ca * w);
      c.lineTo(cx + ca * r1 + sa * w, cy + sa * r1 - ca * w);
      c.closePath();
      c.fill();
    }
  }
}
