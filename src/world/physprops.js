// Kickable, rollable, smashable voxel props (harvest pumpkins, the lawn-bowling
// pins and ball, crates...). Each prop is a voxel mesh with a tiny rigid-body:
// gravity, bounces, rolling on the ground, pushes from Hank and the bike, and
// a satisfying burst into voxel chunks when it takes too much punishment.
import * as THREE from 'three';
import { meshVox, fragmentVox } from '../voxel/mesh.js';
import { Vox } from '../voxel/vox.js';
import { voxMesh, sharedVoxelMaterial, createVoxelMaterial } from '../render/voxelMaterial.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class PhysProps {
  constructor(game, scene, lights = []) {
    this.game = game;
    this.scene = scene;
    this.lights = lights; // static light list (moved along with the prop)
    this.list = [];
    this.debris = [];
    this.mat = sharedVoxelMaterial();
    this.fragMat = createVoxelMaterial();
    this.t = 0;
  }

  // res: a voxel builder result { vox, size, origin, meta }
  add(res, x, y, z, { yaw = 0, kind = 'pumpkin', hp = 3, mass = 1, round = true, respawn = 90, onSmash = null, lights = true } = {}) {
    const geo = res.geometry || meshVox(res.vox, { size: res.size, origin: res.origin, jitter: 0 });
    const mesh = voxMesh(geo, this.mat);
    const m = res.meta || {};
    const radius = m.radius ?? Math.max(res.vox.w, res.vox.d) * res.size * 0.5;
    const height = m.height ?? res.vox.h * res.size;
    // pivot at the centre of mass so it can tumble
    const cy = height * 0.45;
    const pivot = new THREE.Group();
    mesh.position.y = -cy;
    pivot.add(mesh);
    pivot.position.set(x, y + cy, z);
    pivot.rotation.y = yaw;
    this.scene.add(pivot);
    const p = {
      res, mesh, pivot, kind, round, mass, hp, maxHp: hp, radius: Math.max(0.08, radius * (round ? 0.9 : 1)), height, cy,
      vel: new THREE.Vector3(), w: new THREE.Vector3(), sleep: true, home: new THREE.Vector3(x, y, z), homeYaw: yaw,
      respawn, onSmash, gone: false, light: null, wobble: 0,
    };
    if (lights && m.lights?.length) {
      const L = m.lights[0];
      p.lightLocal = new THREE.Vector3(L.x, L.y - cy, L.z);
      p.light = { pos: new THREE.Vector3(x + L.x, y + L.y, z + L.z), color: L.color, radius: Math.min(5, L.radius * 0.8), kind: 'lamp', on: true };
      this.lights.push(p.light);
    }
    this.list.push(p);
    return p;
  }

  // Hank's kick (walker): everything in a little cone in front gets booted
  kick(pos, yaw, power = 1) {
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    let hit = null;
    for (const p of this.list) {
      if (p.gone) continue;
      const dx = p.pivot.position.x - pos.x, dz = p.pivot.position.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.0 + p.radius || Math.abs(p.pivot.position.y - pos.y) > 1.2) continue;
      const along = (dx * fx + dz * fz) / (d || 1);
      if (along < 0.3) continue;
      const k = (6.5 * power) / Math.sqrt(p.mass);
      this.impulse(p, _v.set(fx * k + dx * 0.5, 3.2 * power / Math.sqrt(p.mass), fz * k + dz * 0.5), 1);
      hit = p;
    }
    return hit;
  }

  impulse(p, dv, damage = 0) {
    p.vel.add(dv);
    // spin from the push (roll axis = up x push)
    _ax.set(dv.z, 0, -dv.x);
    p.w.addScaledVector(_ax, 2.5 / Math.max(0.1, p.radius));
    p.w.y += (Math.random() - 0.5) * 6;
    p.sleep = false;
    p.wobble = 1;
    const sp = dv.length();
    this.game?.sound?.play?.(p.kind === 'pin' ? 'kick' : 'pumpkin_bonk', { volume: Math.min(1, 0.3 + sp * 0.08), pitch: 0.9 + Math.random() * 0.25 });
    if (damage > 0) this.damage(p, damage, dv);
  }

  damage(p, n, dir) {
    p.hp -= n;
    p.mesh.material = p.mesh.material; // (kept shared)
    if (p.hp <= 0) this.smash(p, dir);
  }

  // burst into voxel chunks
  smash(p, dir = _v.set(0, 1, 0)) {
    if (p.gone) return;
    p.gone = true;
    p.pivot.visible = false;
    if (p.light) p.light.on = false;
    const frags = fragmentVox(p.res.vox, Math.max(3, Math.round(p.res.vox.w / 5)), Vox);
    const s = p.res.size, o = p.res.origin || [p.res.vox.w / 2, 0, p.res.vox.d / 2];
    p.pivot.updateMatrixWorld(true);
    const base = p.mesh.matrixWorld;
    for (const f of frags) {
      if (f.n < 2) continue;
      const g = meshVox(f.vox, { size: s, origin: [0, 0, 0], jitter: 0 });
      const m = voxMesh(g, this.fragMat, { cast: false, receive: true });
      const local = new THREE.Vector3((f.ox - o[0]) * s, (f.oy - o[1]) * s, (f.oz - o[2]) * s);
      m.position.copy(local.applyMatrix4(base));
      m.quaternion.setFromRotationMatrix(base);
      const c = _w.set((f.ox + f.vox.w / 2 - o[0]) * s, (f.oy + f.vox.h / 2 - o[1]) * s - p.height * 0.4, (f.oz + f.vox.d / 2 - o[2]) * s);
      const out = c.clone().normalize();
      const vel = new THREE.Vector3(out.x * 3 + dir.x * 0.35 + (Math.random() - 0.5) * 2, 2.5 + Math.random() * 3.5 + Math.max(0, out.y) * 2, out.z * 3 + dir.z * 0.35 + (Math.random() - 0.5) * 2);
      this.scene.add(m);
      this.debris.push({ m, vel, w: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), t: 0, life: 2.6 + Math.random() * 1.4, r: Math.max(f.vox.w, f.vox.h) * s * 0.5 });
    }
    const pos = p.pivot.position;
    this.game?.sound?.play?.('pumpkin_smash', { volume: 0.9 });
    const fx = this.game?.effects;
    if (fx?.burst) fx.burst(pos.x, pos.y, pos.z, p.kind);
    p.respawnT = p.respawn;
    p.onSmash?.(p);
    this.onSmash?.(p);
  }

  update(dt, actors) {
    this.t += dt;
    const ph = this.game.physics;
    for (const p of this.list) {
      if (p.gone) {
        if (p.respawn > 0 && (p.respawnT -= dt) <= 0) this.reset(p);
        continue;
      }
      // pushes from Hank (walking) and the bike
      for (const a of actors) {
        const dx = p.pivot.position.x - a.pos.x, dz = p.pivot.position.z - a.pos.z;
        const rr = p.radius + a.r;
        if (Math.abs(dx) > rr || Math.abs(dz) > rr) continue;
        const d = Math.hypot(dx, dz);
        if (d >= rr || Math.abs(p.pivot.position.y - p.cy - a.pos.y) > 1.3) continue;
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        const rel = (a.vel.x - p.vel.x) * nx + (a.vel.z - p.vel.z) * nz;
        p.pivot.position.x += nx * (rr - d);
        p.pivot.position.z += nz * (rr - d);
        if (rel > 0.2) {
          const hard = a.bike && rel > 7;
          this.impulse(p, _v.set(nx * rel * 1.25 / Math.sqrt(p.mass), rel * 0.3 + (a.bike ? 1.2 : 0.6), nz * rel * 1.25 / Math.sqrt(p.mass)), hard ? 99 : a.bike && rel > 3.5 ? 1 : 0);
          a.onHit?.(p, rel);
        }
      }
      if (p.sleep) {
        if (p.wobble > 0) this.wobble(p, dt);
        continue;
      }
      // integrate
      p.vel.y -= 16 * dt;
      const pos = p.pivot.position;
      pos.addScaledVector(p.vel, dt);
      const wl = p.w.length();
      if (wl > 1e-4) {
        _q.setFromAxisAngle(_ax.copy(p.w).divideScalar(wl), wl * dt);
        p.pivot.quaternion.premultiply(_q);
      }
      // walls & trees
      _w.set(pos.x, pos.y - p.cy, pos.z);
      const hit = ph.resolve(_w, p.radius, p.height);
      if (hit) {
        pos.x = _w.x; pos.z = _w.z;
        const vn = p.vel.x * hit.nx + p.vel.z * hit.nz;
        if (vn < 0) {
          p.vel.x -= hit.nx * vn * 1.6; p.vel.z -= hit.nz * vn * 1.6;
          if (-vn > 6) this.damage(p, 1, p.vel);
          if (-vn > 2) this.game?.sound?.play?.('pumpkin_bonk', { volume: Math.min(0.8, -vn * 0.1) });
        }
      }
      // ground
      const g = ph.groundAt(pos.x, pos.z, pos.y + 0.5);
      const floor = g.h + (p.round ? p.radius * 0.85 : p.cy);
      if (pos.y < floor) {
        pos.y = floor;
        if (p.vel.y < -4.5) {
          this.game?.sound?.play?.('pumpkin_bonk', { volume: Math.min(0.9, -p.vel.y * 0.08), pitch: 0.8 });
          if (p.vel.y < -11) this.damage(p, 1, p.vel);
        }
        p.vel.y = -p.vel.y * 0.32;
        if (Math.abs(p.vel.y) < 0.6) p.vel.y = 0;
        // slope: roll downhill a little
        p.vel.x += g.nx * 6 * dt;
        p.vel.z += g.nz * 6 * dt;
        const fr = p.round ? 0.6 : 3.5;
        p.vel.x *= Math.exp(-fr * dt);
        p.vel.z *= Math.exp(-fr * dt);
        if (p.round) {
          // rolling without slipping
          p.w.set(p.vel.z, p.w.y * Math.exp(-3 * dt), -p.vel.x).multiplyScalar(1 / Math.max(0.08, p.radius));
          if (p.vel.lengthSq() > 4) this.rollSound(p);
        } else p.w.multiplyScalar(Math.exp(-6 * dt));
        // settle upright-ish (pumpkins prefer sitting on their bottoms)
        if (p.vel.lengthSq() < 0.05 && wl < 0.6) {
          p.sleep = true;
          p.w.set(0, 0, 0);
          p.vel.set(0, 0, 0);
          // ease back to upright
          p.settle = 1;
        }
      }
      if (pos.y < -30) this.reset(p);
      this.syncLight(p);
    }
    for (const p of this.list) if (p.settle > 0 && !p.gone) this.uprite(p, dt);
    // debris
    for (const d of this.debris) {
      d.t += dt;
      d.vel.y -= 16 * dt;
      d.m.position.addScaledVector(d.vel, dt);
      const wl = d.w.length();
      if (wl > 1e-4) d.m.quaternion.premultiply(_q.setFromAxisAngle(_ax.copy(d.w).divideScalar(wl), wl * dt));
      const gh = ph.groundAt(d.m.position.x, d.m.position.z, d.m.position.y + 0.5).h + d.r * 0.4;
      if (d.m.position.y < gh) {
        d.m.position.y = gh;
        d.vel.y = -d.vel.y * 0.3;
        d.vel.x *= 0.6; d.vel.z *= 0.6; d.w.multiplyScalar(0.6);
      }
      const k = d.t > d.life - 0.6 ? Math.max(0.01, (d.life - d.t) / 0.6) : 1;
      d.m.scale.setScalar(k);
    }
    const dead = this.debris.filter((d) => d.t >= d.life);
    for (const d of dead) { this.scene.remove(d.m); d.m.geometry.dispose(); }
    if (dead.length) this.debris = this.debris.filter((d) => d.t < d.life);
  }

  rollSound(p) {
    if (this.t - (p.lastRoll || 0) < 0.35) return;
    p.lastRoll = this.t;
    this.game?.sound?.play?.('pumpkin_roll', { volume: Math.min(0.5, p.vel.length() * 0.05) });
  }

  // jelly wobble when bumped while asleep
  wobble(p, dt) {
    p.wobble = Math.max(0, p.wobble - dt * 2.2);
    const s = 1 + Math.sin(this.t * 30) * 0.08 * p.wobble;
    p.mesh.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
  }

  uprite(p, dt) {
    // slerp towards upright keeping the yaw
    _v.set(0, 1, 0).applyQuaternion(p.pivot.quaternion);
    if (_v.y > 0.995) { p.settle = 0; return; }
    _q.setFromUnitVectors(_v, UP);
    const t = 1 - Math.exp(-4 * dt);
    _q.slerp(new THREE.Quaternion(), 1 - t);
    p.pivot.quaternion.premultiply(_q);
    this.syncLight(p);
  }

  syncLight(p) {
    if (!p.light) return;
    p.light.pos.copy(p.lightLocal).applyQuaternion(p.pivot.quaternion).add(p.pivot.position);
  }

  reset(p) {
    p.gone = false;
    p.hp = p.maxHp;
    p.pivot.visible = true;
    p.pivot.position.set(p.home.x, p.home.y + p.cy, p.home.z);
    p.pivot.quaternion.setFromAxisAngle(UP, p.homeYaw);
    p.vel.set(0, 0, 0);
    p.w.set(0, 0, 0);
    p.sleep = true;
    p.mesh.scale.set(1, 1, 1);
    if (p.light) { p.light.on = true; this.syncLight(p); }
  }

  nearest(pos, r = 1.6) {
    let best = null, bd = r;
    for (const p of this.list) {
      if (p.gone) continue;
      const d = Math.hypot(p.pivot.position.x - pos.x, p.pivot.position.z - pos.z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
}
