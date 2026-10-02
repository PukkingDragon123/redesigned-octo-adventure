// Living forest: deer, moose, songbirds, crows, Canada geese, squirrels, beavers, salmon.
import * as THREE from 'three';
import { Billboard, pickView } from '../render/sprites.js';
import { RNG } from '../core/noise.js';
import { angleDamp, clamp, damp } from '../core/math.js';
import * as L from '../world/layout.js';
import { P } from '../render/particles.js';

class Critter {
  constructor(game, kind, x, z, opt = {}) {
    this.game = game;
    this.kind = kind;
    this.bb = new Billboard(game.atlas, null, { castShadow: opt.shadow ?? true, upright: 0.9 });
    game.scene.add(this.bb.mesh);
    this.pos = new THREE.Vector3(x, 0, z);
    this.vel = new THREE.Vector3();
    this.yaw = opt.yaw ?? 0;
    this.anim = opt.anim ?? 'idle';
    this.t = Math.random() * 10;
    this.state = 'idle';
    this.timer = Math.random() * 4;
    this.home = new THREE.Vector3(x, 0, z);
    this.fly = opt.fly ?? false;
    this.alt = 0;
  }
  setFrame(anim, fps, n) {
    const f = Math.floor(this.t * fps) % n;
    const name = `${this.kind}:${anim}:side:${f}`;
    const { view, flip } = pickView(this.yaw, this.pos, this.game.camera.position);
    // animals only have side views: flip by which way they face on screen
    const rel = Math.atan2(this.game.camera.position.x - this.pos.x, this.game.camera.position.z - this.pos.z) - this.yaw;
    const s = Math.sin(rel);
    this.bb.setFrame(name, s > 0);
    void view; void flip;
  }
  ground() {
    return this.game.physics.groundAt(this.pos.x, this.pos.z, 1e9, 0).h;
  }
  remove() {
    this.game.scene.remove(this.bb.mesh);
  }
}

export class Wildlife {
  constructor(game) {
    this.game = game;
    this.rng = new RNG(555);
    this.list = [];
    this.flocks = [];
    this.geese = null;
    this.gooseTimer = 20;
    this.squirrelTimer = 8;
    this.salmonTimer = 6;
    const rng = this.rng;
    // deer herds in meadows & clearings
    const herds = [
      [L.POI.meadow1.x, L.POI.meadow1.z, 4],
      [L.POI.meadow2.x, L.POI.meadow2.z, 3],
      [-60, -200, 3],
      [150, -140, 2],
      [-230, 40, 2],
    ];
    for (const [hx, hz, n] of herds) {
      for (let i = 0; i < n; i++) {
        const d = new Critter(game, i === 0 && n > 2 ? 'buck' : 'deer', hx + rng.range(-8, 8), hz + rng.range(-8, 8), { yaw: rng.range(0, 6.28) });
        d.type = 'deer';
        this.list.push(d);
      }
    }
    // a moose who likes the marsh by the pond (and sometimes the road)
    const m = new Critter(game, 'moose', L.POI.pond.x - 14, L.POI.pond.z + 22, { yaw: 1 });
    m.type = 'moose';
    m.collider = game.physics.addCircle({ x: m.pos.x, z: m.pos.z, r: 1.3, kind: 'moose' });
    this.list.push(m);
    // crows on the dead tree in the graveyard
    for (const p of game.world.ctx.perches) {
      const c = new Critter(game, 'crow', p.x, p.z, { shadow: false });
      c.type = 'crow';
      c.perch = p.clone();
      c.pos.copy(p);
      this.list.push(c);
    }
    // a beaver near the dam
    if (game.world.ctx.beaverDam) {
      const dam = game.world.ctx.beaverDam;
      const b = new Critter(game, 'beaver', dam.x + 3, dam.z - 4, { shadow: false });
      b.type = 'beaver';
      this.list.push(b);
    }
    // songbird flocks will be spawned around the player
  }

  update(dt) {
    const g = this.game;
    const player = g.bike.pos;
    const speed = g.bike.speed;
    const rng = this.rng;
    for (const c of this.list) {
      c.t += dt;
      const d = Math.hypot(c.pos.x - player.x, c.pos.z - player.z);
      if (d > 220) {
        c.bb.mesh.visible = false;
        continue;
      }
      c.bb.mesh.visible = true;
      if (c.type === 'deer') this.deer(c, dt, d);
      else if (c.type === 'moose') this.moose(c, dt, d);
      else if (c.type === 'crow') this.crow(c, dt, d);
      else if (c.type === 'beaver') this.beaver(c, dt);
      if (!c.fly && c.type !== 'crow' && c.type !== 'beaver') c.pos.y = c.ground();
      c.bb.mesh.position.copy(c.pos);
    }
    this.updateFlocks(dt, player, speed);
    this.updateGeese(dt, player);
    this.updateSquirrels(dt, player);
    this.updateSalmon(dt, player);
  }

  deer(c, dt, d) {
    const player = this.game.bike.pos;
    if (c.state !== 'flee' && d < 16 + this.game.bike.speed * 0.8) {
      c.state = 'flee';
      c.timer = 6 + this.rng.range(0, 3);
      c.yaw = Math.atan2(c.pos.x - player.x, c.pos.z - player.z) + this.rng.range(-0.5, 0.5);
      if (this.rng.next() < 0.5) this.game.sfx?.('deer', c.pos);
    }
    c.timer -= dt;
    if (c.state === 'flee') {
      const sp = 9;
      c.pos.x += Math.sin(c.yaw) * sp * dt;
      c.pos.z += Math.cos(c.yaw) * sp * dt;
      c.bb.mesh.position.y = 0;
      c.setFrame('run', 6, 2);
      c.pos.y += Math.abs(Math.sin(c.t * 9)) * 0.3;
      if (c.timer < 0) { c.state = 'idle'; c.timer = 3; }
      return;
    }
    if (c.timer < 0) {
      const r = this.rng.next();
      c.state = r < 0.45 ? 'graze' : r < 0.75 ? 'idle' : 'walk';
      c.timer = this.rng.range(2, 6);
      if (c.state === 'walk') {
        // wander, but stay near home
        const toHome = Math.atan2(c.home.x - c.pos.x, c.home.z - c.pos.z);
        const far = Math.hypot(c.home.x - c.pos.x, c.home.z - c.pos.z) > 18;
        c.yaw = far ? toHome : c.yaw + this.rng.range(-1.2, 1.2);
      }
    }
    if (c.state === 'walk') {
      c.pos.x += Math.sin(c.yaw) * 1.1 * dt;
      c.pos.z += Math.cos(c.yaw) * 1.1 * dt;
      c.setFrame('walk', 6, 4);
    } else if (c.state === 'graze') c.setFrame('graze', 1.2, 2);
    else c.setFrame('idle', 1.5, 3);
  }

  moose(c, dt, d) {
    c.timer -= dt;
    if (c.timer < 0) {
      c.state = this.rng.next() < 0.6 ? 'idle' : 'walk';
      c.timer = this.rng.range(4, 10);
      if (c.state === 'walk') {
        const far = Math.hypot(c.home.x - c.pos.x, c.home.z - c.pos.z) > 25;
        c.yaw = far ? Math.atan2(c.home.x - c.pos.x, c.home.z - c.pos.z) : c.yaw + this.rng.range(-1, 1);
      }
      if (d < 30 && this.rng.next() < 0.4) this.game.sfx?.('moose', c.pos);
    }
    if (c.state === 'walk') {
      c.pos.x += Math.sin(c.yaw) * 0.8 * dt;
      c.pos.z += Math.cos(c.yaw) * 0.8 * dt;
      c.setFrame('walk', 3, 4);
    } else c.setFrame('idle', 0.8, 3);
    if (c.collider) {
      // move the collider along (it lives in a spatial hash; reinsert cheaply when it strays)
      c.collider.x = c.pos.x;
      c.collider.z = c.pos.z;
      if (!c.lastIns || Math.hypot(c.lastIns.x - c.pos.x, c.lastIns.z - c.pos.z) > 4) {
        this.game.physics.solids.insert(c.collider, c.pos.x, c.pos.z, 2);
        c.lastIns = c.pos.clone();
      }
    }
  }

  crow(c, dt, d) {
    if (c.state !== 'fly' && d < 12) {
      c.state = 'fly';
      c.timer = 6;
      c.vel.set(this.rng.range(-3, 3), this.rng.range(3, 5), this.rng.range(-3, 3));
      this.game.sfx?.('crow', c.pos);
    }
    if (c.state === 'fly') {
      c.timer -= dt;
      c.pos.addScaledVector(c.vel, dt);
      c.vel.y = damp(c.vel.y, 0.5, 1, dt);
      c.yaw = Math.atan2(c.vel.x, c.vel.z);
      c.setFrame('fly', 8, 2);
      if (c.timer < 0 && d > 18) {
        c.state = 'return';
      }
      return;
    }
    if (c.state === 'return') {
      const to = c.perch.clone().sub(c.pos);
      const l = to.length();
      if (l < 0.3) { c.state = 'idle'; c.pos.copy(c.perch); }
      else c.pos.addScaledVector(to.normalize(), Math.min(l, 6 * dt));
      c.yaw = Math.atan2(to.x, to.z);
      c.setFrame('fly', 8, 2);
      return;
    }
    c.setFrame('idle', 1, 2);
    if (this.rng.next() < dt * 0.05 && d < 40) this.game.sfx?.('crow', c.pos);
  }

  beaver(c, dt) {
    c.yaw += dt * 0.3;
    const dam = this.game.world.ctx.beaverDam;
    c.pos.set(dam.x + Math.sin(c.t * 0.3) * 5, 0.02, dam.z - 4 + Math.cos(c.t * 0.3) * 3);
    c.yaw = c.t * 0.3 + Math.PI / 2;
    c.setFrame('swim', 2, 2);
    if (this.rng.next() < dt * 0.08) {
      // tail slap!
      const fx = this.game.effects;
      for (let k = 0; k < 8; k++) fx.ps.spawn({ x: c.pos.x, y: 0.05, z: c.pos.z, vx: this.rng.range(-1, 1), vy: this.rng.range(2, 3.5), vz: this.rng.range(-1, 1), life: 0.8, size: 0.1, sprite: P.drop, color: [0.8, 0.9, 1], gravity: 9.8 });
      this.game.sfx?.('splash', c.pos, 0.5);
    }
  }

  // small flocks of robins/chickadees hop around near the rider and scatter
  updateFlocks(dt, player, speed) {
    const g = this.game;
    if (this.flocks.length < 2 && this.rng.next() < dt * 0.25) {
      const a = this.rng.range(0, Math.PI * 2);
      const fwd = g.bike.forward(new THREE.Vector3());
      const x = player.x + fwd.x * 25 + Math.cos(a) * 8, z = player.z + fwd.z * 25 + Math.sin(a) * 8;
      const h = g.physics.groundAt(x, z).h;
      if (h > 1) {
        const kind = this.rng.next() < 0.5 ? 'robin' : 'chickadee';
        const birds = [];
        for (let i = 0; i < this.rng.int(3, 6); i++) {
          const c = new Critter(g, kind, x + this.rng.range(-2, 2), z + this.rng.range(-2, 2), { shadow: false, yaw: this.rng.range(0, 6.28) });
          c.state = 'ground';
          c.hop = 0;
          birds.push(c);
        }
        this.flocks.push({ birds, life: 30 });
      }
    }
    for (const f of this.flocks) {
      f.life -= dt;
      for (const c of f.birds) {
        c.t += dt;
        const d = Math.hypot(c.pos.x - player.x, c.pos.z - player.z);
        if (c.state === 'ground') {
          c.pos.y = g.physics.groundAt(c.pos.x, c.pos.z).h;
          if (this.rng.next() < dt * 1.5) {
            c.hop = 0.25;
            c.yaw += this.rng.range(-1, 1);
          }
          if (c.hop > 0) {
            c.hop -= dt;
            c.pos.x += Math.sin(c.yaw) * dt * 1.2;
            c.pos.z += Math.cos(c.yaw) * dt * 1.2;
            c.pos.y += Math.sin((c.hop / 0.25) * Math.PI) * 0.12;
          }
          c.setFrame('idle', 2, 2);
          if (d < 7 + speed * 0.5) {
            c.state = 'fly';
            c.vel.set(this.rng.range(-3, 3), this.rng.range(4, 6), this.rng.range(-3, 3));
            if (c === f.birds[0]) g.sfx?.('chirp', c.pos);
          }
        } else {
          c.pos.addScaledVector(c.vel, dt);
          c.vel.y -= dt * 1.5;
          c.yaw = Math.atan2(c.vel.x, c.vel.z);
          c.setFrame('fly', 12, 2);
        }
        c.bb.mesh.position.copy(c.pos);
      }
      if (f.life < 0 || f.birds.every((c) => c.pos.y > 40 || Math.hypot(c.pos.x - player.x, c.pos.z - player.z) > 90)) {
        for (const c of f.birds) c.remove();
        f.dead = true;
      }
    }
    this.flocks = this.flocks.filter((f) => !f.dead);
  }

  // Canada geese in V formation honking overhead
  updateGeese(dt, player) {
    const g = this.game;
    this.gooseTimer -= dt;
    if (!this.geese && this.gooseTimer < 0) {
      this.gooseTimer = this.rng.range(60, 120);
      const a = this.rng.range(0, Math.PI * 2);
      const start = new THREE.Vector3(player.x + Math.cos(a) * 160, 0, player.z + Math.sin(a) * 160);
      const dir = new THREE.Vector3(-Math.cos(a), 0, -Math.sin(a));
      const birds = [];
      const n = this.rng.int(7, 11);
      for (let i = 0; i < n; i++) {
        const row = Math.ceil(i / 2), side = i % 2 ? 1 : -1;
        const c = new Critter(g, 'goose', 0, 0, { shadow: false });
        c.off = new THREE.Vector3(-dir.z * side * row * 2.2, 0, dir.x * side * row * 2.2).addScaledVector(dir, -row * 2.4);
        c.t = this.rng.range(0, 1);
        c.bb.setScale(1.6, 1.6);
        birds.push(c);
      }
      this.geese = { pos: start, dir, alt: player.y + 38, birds, t: 0, honk: 0 };
    }
    if (this.geese) {
      const G2 = this.geese;
      G2.t += dt;
      G2.pos.addScaledVector(G2.dir, 9 * dt);
      G2.honk -= dt;
      if (G2.honk < 0) {
        G2.honk = this.rng.range(1.5, 3.5);
        g.sfx?.('goose', G2.pos, 0.6);
      }
      for (const c of G2.birds) {
        c.t += dt;
        c.pos.copy(G2.pos).add(c.off);
        c.pos.y = G2.alt + Math.sin(c.t * 2 + c.off.x) * 0.3;
        c.yaw = Math.atan2(G2.dir.x, G2.dir.z);
        c.setFrame('fly', 3, 2);
        c.bb.mesh.position.copy(c.pos);
      }
      if (G2.t > 40) {
        for (const c of G2.birds) c.remove();
        this.geese = null;
      }
    }
  }

  // a squirrel occasionally dashes across the road in front of you
  updateSquirrels(dt, player) {
    const g = this.game;
    this.squirrelTimer -= dt;
    if (this.squirrel) {
      const s = this.squirrel;
      s.t += dt;
      s.life -= dt;
      s.pos.x += Math.sin(s.yaw) * 5 * dt;
      s.pos.z += Math.cos(s.yaw) * 5 * dt;
      s.pos.y = g.physics.groundAt(s.pos.x, s.pos.z).h + Math.abs(Math.sin(s.t * 14)) * 0.15;
      s.setFrame('run', 10, 2);
      s.bb.mesh.position.copy(s.pos);
      if (s.life < 0) {
        s.remove();
        this.squirrel = null;
      }
      return;
    }
    if (this.squirrelTimer < 0 && g.bike.speed > 4 && g.bike.surface === 'road') {
      this.squirrelTimer = this.rng.range(20, 45);
      const f = g.bike.forward(new THREE.Vector3());
      const side = this.rng.sign();
      const right = new THREE.Vector3(-f.z, 0, f.x).multiplyScalar(side);
      const x = player.x + f.x * 14 - right.x * 4, z = player.z + f.z * 14 - right.z * 4;
      const s = new Critter(g, 'squirrel', x, z, { shadow: false });
      s.yaw = Math.atan2(right.x, right.z);
      s.life = 2.2;
      this.squirrel = s;
    }
  }

  updateSalmon(dt, player) {
    const g = this.game;
    this.salmonTimer -= dt;
    if (this.fish) {
      const f = this.fish;
      f.t += dt;
      f.vel.y -= 9.8 * dt;
      f.pos.addScaledVector(f.vel, dt);
      f.setFrame('jump', 4, 2);
      f.bb.roll = Math.atan2(f.vel.y, 2) * 0.8;
      f.bb.mesh.position.copy(f.pos);
      if (f.pos.y < -0.2) {
        g.effects.ps.spawn({ x: f.pos.x, y: 0.04, z: f.pos.z, life: 0.8, size: 0.3, size1: 1.6, sprite: P.ring, color: [0.85, 0.95, 1], alpha: 0.7 });
        g.sfx?.('splash', f.pos, 0.4);
        f.remove();
        this.fish = null;
      }
      return;
    }
    if (this.salmonTimer < 0) {
      this.salmonTimer = this.rng.range(4, 10);
      // find water near the player
      for (let k = 0; k < 6; k++) {
        const x = player.x + this.rng.range(-30, 30), z = player.z + this.rng.range(-30, 30);
        if (g.world.terrain.heightAt(x, z) < -0.6) {
          const f = new Critter(g, 'salmon', x, z, { shadow: false, yaw: this.rng.range(0, 6.28) });
          f.pos.y = 0;
          f.vel.set(Math.sin(f.yaw) * 2, 4.5, Math.cos(f.yaw) * 2);
          this.fish = f;
          g.effects.ps.spawn({ x, y: 0.04, z, life: 0.6, size: 0.2, size1: 1.2, sprite: P.ring, color: [0.85, 0.95, 1], alpha: 0.6 });
          break;
        }
      }
    }
  }
}
