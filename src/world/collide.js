// Collision world: terrain + walkable platforms (bridge, boardwalk, docks, ramps)
// + solid obstacles (tree trunks, buildings, railings, props).
import { SpatialHash } from '../core/spatial.js';
import { clamp } from '../core/math.js';
import { WORLD_HALF } from './layout.js';

export class PhysicsWorld {
  constructor(terrain, treeHash) {
    this.terrain = terrain;
    this.trees = treeHash;
    this.platforms = new SpatialHash(16);
    this.solids = new SpatialHash(8);
    this.platformList = [];
    this._n = { x: 0, y: 1, z: 0 };
  }

  // A walkable oriented rectangle whose height goes y0 -> y1 along its local z
  addPlatform({ x, z, yaw = 0, w, l, y0, y1 = y0, surface = 'wood', kind = 'deck', bottom = null }) {
    const p = { x, z, yaw, c: Math.cos(yaw), s: Math.sin(yaw), hw: w / 2, hl: l / 2, y0, y1, surface, kind, bottom };
    // slope normal
    const slope = (y1 - y0) / l;
    const nl = Math.hypot(slope, 1);
    // local +z in world = (sin yaw, cos yaw)
    p.nx = (-slope * Math.sin(yaw)) / nl;
    p.ny = 1 / nl;
    p.nz = (-slope * Math.cos(yaw)) / nl;
    this.platforms.insert(p, x, z, Math.hypot(w, l) / 2);
    this.platformList.push(p);
    return p;
  }

  // A solid oriented box (blocks the rider between y0..y1)
  addBox({ x, z, yaw = 0, w, l, y0 = -100, y1 = 100, kind = 'wall', soft = false }) {
    const b = { type: 'box', x, z, yaw, c: Math.cos(yaw), s: Math.sin(yaw), hw: w / 2, hl: l / 2, y0, y1, kind, soft };
    this.solids.insert(b, x, z, Math.hypot(w, l) / 2);
    return b;
  }

  addCircle({ x, z, r, y0 = -100, y1 = 100, kind = 'post' }) {
    const c = { type: 'circle', x, z, r, y0, y1, kind };
    this.solids.insert(c, x, z, r);
    return c;
  }

  toLocal(p, x, z) {
    const dx = x - p.x, dz = z - p.z;
    // inverse of rotation.y = yaw : local x = dx*c - dz*s, local z = dx*s + dz*c
    return [dx * p.c - dz * p.s, dx * p.s + dz * p.c];
  }

  platformHeight(p, x, z) {
    const [lx, lz] = this.toLocal(p, x, z);
    if (Math.abs(lx) > p.hw || Math.abs(lz) > p.hl) return null;
    const t = (lz + p.hl) / (2 * p.hl);
    return p.y0 + (p.y1 - p.y0) * t;
  }

  // Ground under (x, z) for something currently at height y.
  groundAt(x, z, y = 1e9, stepUp = 0.75) {
    const T = this.terrain;
    let h = T.heightAt(x, z);
    let surface = null;
    let plat = null;
    const n = T.normalAt(x, z, this._n);
    let nx = n.x, ny = n.y, nz = n.z;
    this.platforms.query(x, z, 0.1, (p) => {
      const ph = this.platformHeight(p, x, z);
      if (ph === null) return;
      if (ph <= y + stepUp && ph > h - 0.01) {
        h = ph;
        plat = p;
        nx = p.nx; ny = p.ny; nz = p.nz;
      }
    });
    if (plat) surface = plat.surface;
    else surface = T.surfaceAt(x, z);
    return { h, nx, ny, nz, surface, platform: plat, water: !plat && h < -0.2 };
  }

  // Push a circle (x, z, r) at height [y, y+hgt] out of solids. Returns contacts.
  resolve(pos, r, hgt = 1.6) {
    let hit = null;
    const y = pos.y;
    const test = (o) => {
      if (y + hgt < o.y0 || y + 0.25 > o.y1) return;
      let nx = 0, nz = 0, depth = 0;
      if (o.type === 'circle' || o.tree) {
        const dx = pos.x - o.x, dz = pos.z - o.z;
        const d = Math.hypot(dx, dz);
        const rr = r + o.r;
        if (d >= rr) return;
        depth = rr - d;
        nx = d > 1e-4 ? dx / d : 1;
        nz = d > 1e-4 ? dz / d : 0;
      } else {
        const [lx, lz] = this.toLocal(o, pos.x, pos.z);
        const cx = clamp(lx, -o.hw, o.hw), cz = clamp(lz, -o.hl, o.hl);
        let dx = lx - cx, dz = lz - cz;
        let d = Math.hypot(dx, dz);
        if (d >= r) return;
        if (d < 1e-5) {
          // centre inside: push along the shallowest axis
          const px = o.hw - Math.abs(lx), pz = o.hl - Math.abs(lz);
          if (px < pz) { dx = Math.sign(lx) || 1; dz = 0; depth = px + r; }
          else { dz = Math.sign(lz) || 1; dx = 0; depth = pz + r; }
        } else {
          depth = r - d;
          dx /= d;
          dz /= d;
        }
        // local -> world (rotation.y = yaw)
        nx = dx * o.c + dz * o.s;
        nz = -dx * o.s + dz * o.c;
      }
      pos.x += nx * depth;
      pos.z += nz * depth;
      if (!hit || depth > hit.depth) hit = { nx, nz, depth, obj: o };
    };
    this.solids.query(pos.x, pos.z, r + 2, test);
    if (this.trees) {
      this.trees.query(pos.x, pos.z, r + 2, (t) => {
        if (t.type !== 'circle') return;
        const o = { type: 'circle', x: t.x, z: t.z, r: t.r, y0: -100, y1: 100, tree: t.tree };
        test(o);
        if (hit && hit.obj === o) hit.obj = t;
      });
    }
    // world boundary
    const lim = WORLD_HALF - 6;
    if (Math.abs(pos.x) > lim || Math.abs(pos.z) > lim) {
      const ox = clamp(pos.x, -lim, lim), oz = clamp(pos.z, -lim, lim);
      const nx = Math.sign(ox - pos.x), nz = Math.sign(oz - pos.z);
      pos.x = ox;
      pos.z = oz;
      hit = { nx, nz, depth: 0.1, obj: { kind: 'boundary' } };
    }
    return hit;
  }
}
