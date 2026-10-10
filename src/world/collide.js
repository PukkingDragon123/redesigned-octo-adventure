// Collision world: terrain + walkable platforms (bridge, boardwalk, docks, ramps)
// + solid obstacles (tree trunks, buildings, railings, props).
//
// Bodies (Hank on foot, Bessie, villagers, props) are upright capsules: a circle in
// plan between their feet and the top of their head. resolve() pushes one out of
// every solid it overlaps, a few passes so corners and crowded spots settle, and
// leaves the contacts in `contacts` so movers can slide along walls instead of
// grinding into them. Give it the body's previous position too and a thin fence or
// post it skipped clean past in one long step still stops it on the near side.
//
// Colliders can change at runtime (hinged doors, carts, animals): addBox / addCircle
// return the collider, updateBox / updateCircle move, turn or resize it in place,
// and removeBox / removeCircle (or removeSolid) take it out of the world.
import { SpatialHash } from '../core/spatial.js';
import { clamp } from '../core/math.js';
import { WORLD_X0, WORLD_X1, WORLD_Z0, WORLD_Z1 } from './layout.js';

const MAX_CONTACTS = 8;
const PASSES = 4;

export class PhysicsWorld {
  constructor(terrain, treeHash) {
    this.terrain = terrain;
    this.trees = treeHash;
    this.platforms = new SpatialHash(16);
    this.solids = new SpatialHash(8);
    this.platformList = [];
    this._n = { x: 0, y: 1, z: 0 };
    // resolve() scratch. `contacts[0 .. contactCount)` holds every solid the last resolve()
    // touched (read them straight after the call); the returned hit object is reused too.
    this.contacts = Array.from({ length: MAX_CONTACTS }, () => ({ nx: 0, nz: 0, depth: 0, obj: null }));
    this.contactCount = 0;
    this._cand = [];
    this._hit = { nx: 0, nz: 0, depth: 0, obj: null, px: 0, pz: 0, count: 0 };
    this._bound = { kind: 'boundary' };
    this._q = { top: 0, foot: 0 };
    this._collect = (o) => {
      if (o.removed || this._q.top < o.y0 || this._q.foot > o.y1) return;
      this._cand.push(o);
    };
    this._collectTree = (t) => {
      if (t.type === 'circle') this._cand.push(t);
    };
    // groundAt() scratch (no closure or array per call: it runs hundreds of times a frame)
    this._g = { x: 0, z: 0, lim: 0, h: 0, plat: null };
    this._platCb = (p) => {
      const g = this._g;
      const ph = this.platformHeight(p, g.x, g.z);
      if (ph === null) return;
      if (ph <= g.lim && ph > g.h - 0.01) {
        g.h = ph;
        g.plat = p;
      }
    };
    this._s = { ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, pad: 0, best: 1 };
    this._segCb = (o) => this._segBox(o);
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
    this._insert(b);
    return b;
  }

  addCircle({ x, z, r, y0 = -100, y1 = 100, kind = 'post' }) {
    const c = { type: 'circle', x, z, r, y0, y1, kind };
    this._insert(c);
    return c;
  }

  // ---- colliders that move (doors swinging on their hinges, carts, animals)
  // updateBox(box, { x, z, yaw, w, l, y0, y1 }): any field left out keeps its value
  updateBox(b, { x = b.x, z = b.z, yaw = b.yaw, w = b.hw * 2, l = b.hl * 2, y0 = b.y0, y1 = b.y1 } = {}) {
    if (b.removed) return b;
    this._remove(b);
    b.x = x; b.z = z; b.yaw = yaw; b.c = Math.cos(yaw); b.s = Math.sin(yaw);
    b.hw = w / 2; b.hl = l / 2; b.y0 = y0; b.y1 = y1;
    this._insert(b);
    return b;
  }
  updateCircle(c, { x = c.x, z = c.z, r = c.r, y0 = c.y0, y1 = c.y1 } = {}) {
    if (c.removed) return c;
    this._remove(c);
    c.x = x; c.z = z; c.r = r; c.y0 = y0; c.y1 = y1;
    this._insert(c);
    return c;
  }
  // move / turn either kind (yaw only matters for boxes)
  moveSolid(o, x, z, yaw = o.yaw) {
    return o.type === 'box' ? this.updateBox(o, { x, z, yaw }) : this.updateCircle(o, { x, z });
  }
  removeSolid(o) {
    if (!o || o.removed) return;
    this._remove(o);
    o.removed = true;
  }
  removeBox(b) { this.removeSolid(b); }
  removeCircle(c) { this.removeSolid(c); }
  _insert(o) {
    o._hx = o.x;
    o._hz = o.z;
    o._hr = o.type === 'box' ? Math.hypot(o.hw, o.hl) : o.r;
    this.solids.insert(o, o._hx, o._hz, o._hr);
  }
  _remove(o) {
    this.solids.remove(o, o._hx ?? o.x, o._hz ?? o.z, o._hr ?? (o.type === 'box' ? Math.hypot(o.hw, o.hl) : o.r));
  }

  // First hit (0..1) of the segment a->b against buildings (big 'wall' boxes), padded.
  // Used to keep the chase camera out of walls.
  segmentHit(ax, ay, az, bx, by, bz, pad = 0.35) {
    const S = this._s;
    S.ax = ax; S.ay = ay; S.az = az; S.bx = bx; S.by = by; S.bz = bz; S.pad = pad; S.best = 1;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const r = Math.hypot(bx - ax, bz - az) / 2 + pad;
    this.solids.query(mx, mz, r, this._segCb);
    return S.best;
  }
  _segBox(o) {
    if (o.type !== 'box' || o.kind !== 'wall' || o.removed || o.hw * o.hl < 1.5) return;
    const S = this._s;
    let dx = S.ax - o.x, dz = S.az - o.z;
    const lax = dx * o.c - dz * o.s, laz = dx * o.s + dz * o.c;
    dx = S.bx - o.x; dz = S.bz - o.z;
    const lbx = dx * o.c - dz * o.s, lbz = dx * o.s + dz * o.c;
    let t0 = 0, t1 = 1;
    // x slab
    let p0 = lax, d = lbx - lax, h = o.hw + S.pad;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p0) > h) return;
    } else {
      let ta = (-h - p0) / d, tb = (h - p0) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return;
    }
    // z slab
    p0 = laz; d = lbz - laz; h = o.hl + S.pad;
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(p0) > h) return;
    } else {
      let ta = (-h - p0) / d, tb = (h - p0) / d;
      if (ta > tb) { const t = ta; ta = tb; tb = t; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return;
    }
    const y = S.ay + (S.by - S.ay) * t0;
    if (y < o.y0 || y > o.y1) return;
    if (t0 < S.best) S.best = t0;
  }

  toLocal(p, x, z) {
    const dx = x - p.x, dz = z - p.z;
    // inverse of rotation.y = yaw : local x = dx*c - dz*s, local z = dx*s + dz*c
    return [dx * p.c - dz * p.s, dx * p.s + dz * p.c];
  }

  platformHeight(p, x, z) {
    const dx = x - p.x, dz = z - p.z;
    const lx = dx * p.c - dz * p.s, lz = dx * p.s + dz * p.c;
    if (Math.abs(lx) > p.hw || Math.abs(lz) > p.hl) return null;
    const t = (lz + p.hl) / (2 * p.hl);
    return p.y0 + (p.y1 - p.y0) * t;
  }

  // Ground under (x, z) for something currently at height y. Pass `out` to fill an
  // object of your own instead of getting a new one (hot loops: feet, cameras).
  groundAt(x, z, y = 1e9, stepUp = 0.75, out = null) {
    const T = this.terrain;
    const g = this._g;
    g.x = x; g.z = z; g.lim = y + stepUp; g.h = T.heightAt(x, z); g.plat = null;
    this.platforms.query(x, z, 0.1, this._platCb);
    const plat = g.plat;
    let nx, ny, nz;
    if (plat) { nx = plat.nx; ny = plat.ny; nz = plat.nz; } else {
      const n = T.normalAt(x, z, this._n);
      nx = n.x; ny = n.y; nz = n.z;
    }
    const o = out || {};
    o.h = g.h; o.nx = nx; o.ny = ny; o.nz = nz;
    o.surface = plat ? plat.surface : T.surfaceAt(x, z);
    o.platform = plat;
    o.water = !plat && g.h < -0.2;
    return o;
  }

  // Push an upright body (a circle of radius r in plan, from its feet at pos.y up to
  // pos.y + hgt) out of the solids. Returns the deepest contact (or null); all of them
  // are in this.contacts. opt: { px, pz } where the body was before this move (stops
  // fast movers skipping through thin things), minTop (solids whose top is lower than
  // pos.y + minTop are stepped over; default 0.25).
  // The returned object is reused: read it before the next call.
  resolve(pos, r, hgt = 1.6, opt = null) {
    const y = pos.y;
    const minTop = opt?.minTop ?? 0.25;
    const hasPrev = opt != null && opt.px != null;
    const px = hasPrev ? opt.px : pos.x, pz = hasPrev ? opt.pz : pos.z;
    const ox = pos.x, oz = pos.z;
    const segX = pos.x - px, segZ = pos.z - pz;
    const segLen = Math.hypot(segX, segZ);
    const sweep = hasPrev && segLen > r * 0.9;
    // everything near the swept circle
    const cand = this._cand;
    cand.length = 0;
    this._q.top = y + hgt;
    this._q.foot = y + minTop;
    const mx = (pos.x + px) / 2, mz = (pos.z + pz) / 2, qr = r + segLen / 2 + 0.3;
    this.solids.query(mx, mz, qr, this._collect);
    if (this.trees) this.trees.query(mx, mz, qr + 0.6, this._collectTree);
    this.contactCount = 0;
    for (let pass = 0; pass < PASSES && cand.length; pass++) {
      let moved = false;
      for (let i = 0; i < cand.length; i++) {
        const o = cand[i];
        if (o.type === 'circle') {
          const R = r + o.r;
          let dx = pos.x - o.x, dz = pos.z - o.z;
          if (pass === 0 && sweep && this._sweepCircle(o, pos, px, pz, r)) { moved = true; continue; }
          const d2 = dx * dx + dz * dz;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2);
          let nx = 1, nz = 0;
          if (d > 1e-4) { nx = dx / d; nz = dz / d; } else if (hasPrev) {
            // dead centre: back out the way it came
            dx = px - o.x; dz = pz - o.z;
            const l = Math.hypot(dx, dz);
            if (l > 1e-4) { nx = dx / l; nz = dz / l; }
          }
          const depth = R - d;
          pos.x += nx * depth;
          pos.z += nz * depth;
          this._contact(o, nx, nz, depth);
          moved = true;
        } else {
          if (pass === 0 && sweep && this._sweepBox(o, pos, px, pz, r)) { moved = true; continue; }
          let dx = pos.x - o.x, dz = pos.z - o.z;
          const lx = dx * o.c - dz * o.s, lz = dx * o.s + dz * o.c;
          const cx = clamp(lx, -o.hw, o.hw), cz = clamp(lz, -o.hl, o.hl);
          let ex = lx - cx, ez = lz - cz;
          const d2 = ex * ex + ez * ez;
          if (d2 >= r * r) continue;
          let depth;
          if (d2 > 1e-10) {
            const d = Math.sqrt(d2);
            depth = r - d;
            ex /= d;
            ez /= d;
          } else {
            // centre inside: leave by the side it came in from (else the shallowest side)
            let sx = lx, sz = lz;
            if (hasPrev) {
              dx = px - o.x; dz = pz - o.z;
              const plx = dx * o.c - dz * o.s, plz = dx * o.s + dz * o.c;
              const outX = Math.abs(plx) - o.hw, outZ = Math.abs(plz) - o.hl;
              if (outX > 0 || outZ > 0) {
                if (outX / o.hw >= outZ / o.hl) { ex = Math.sign(plx) || 1; ez = 0; depth = o.hw - lx * ex + r; } else { ez = Math.sign(plz) || 1; ex = 0; depth = o.hl - lz * ez + r; }
                sx = null;
              }
            }
            if (sx !== null) {
              const qx = o.hw - Math.abs(sx), qz = o.hl - Math.abs(sz);
              if (qx < qz) { ex = Math.sign(sx) || 1; ez = 0; depth = qx + r; } else { ez = Math.sign(sz) || 1; ex = 0; depth = qz + r; }
            }
          }
          // local -> world (rotation.y = yaw)
          const nx = ex * o.c + ez * o.s, nz = -ex * o.s + ez * o.c;
          pos.x += nx * depth;
          pos.z += nz * depth;
          this._contact(o, nx, nz, depth);
          moved = true;
        }
      }
      if (!moved) break;
    }
    // world boundary
    const lim = 6;
    if (pos.x < WORLD_X0 + lim || pos.x > WORLD_X1 - lim || pos.z < WORLD_Z0 + lim || pos.z > WORLD_Z1 - lim) {
      const bx = clamp(pos.x, WORLD_X0 + lim, WORLD_X1 - lim), bz = clamp(pos.z, WORLD_Z0 + lim, WORLD_Z1 - lim);
      const nx = Math.sign(bx - pos.x), nz = Math.sign(bz - pos.z);
      pos.x = bx;
      pos.z = bz;
      const l = Math.hypot(nx, nz) || 1;
      this._contact(this._bound, nx / l, nz / l, 0.1);
    }
    if (!this.contactCount) return null;
    let best = this.contacts[0];
    for (let i = 1; i < this.contactCount; i++) if (this.contacts[i].depth > best.depth) best = this.contacts[i];
    const H = this._hit;
    H.nx = best.nx; H.nz = best.nz; H.depth = best.depth; H.obj = best.obj;
    H.px = pos.x - ox; H.pz = pos.z - oz; H.count = this.contactCount;
    return H;
  }

  _contact(obj, nx, nz, depth) {
    const C = this.contacts;
    for (let i = 0; i < this.contactCount; i++) {
      if (C[i].obj !== obj) continue;
      C[i].nx = nx; C[i].nz = nz; C[i].depth += depth;
      return;
    }
    if (this.contactCount >= MAX_CONTACTS) return;
    const c = C[this.contactCount++];
    c.nx = nx; c.nz = nz; c.depth = depth; c.obj = obj;
  }

  // a fast mover whose path crossed a post or trunk: stop it where it first touched
  _sweepCircle(o, pos, px, pz, r) {
    const R = r + o.r;
    const dx = pos.x - px, dz = pos.z - pz;
    const l2 = dx * dx + dz * dz;
    const fx = px - o.x, fz = pz - o.z;
    if (fx * fx + fz * fz < R * R * 0.96) return false; // it started touching: the normal push handles it
    // closest approach of the path to the centre
    const t = clamp(-(fx * dx + fz * dz) / l2, 0, 1);
    const cx = fx + dx * t, cz = fz + dz * t;
    if (cx * cx + cz * cz > o.r * o.r) return false; // grazed it at most
    // first touch: |f + d t| = R
    const a = l2, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - R * R;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const t0 = clamp((-b - Math.sqrt(disc)) / (2 * a), 0, 1);
    const hx = fx + dx * t0, hz = fz + dz * t0;
    const hl = Math.hypot(hx, hz) || 1;
    const nx = hx / hl, nz = hz / hl;
    const ox = pos.x, oz = pos.z;
    pos.x = o.x + nx * (R + 0.002);
    pos.z = o.z + nz * (R + 0.002);
    this._contact(o, nx, nz, Math.hypot(pos.x - ox, pos.z - oz));
    return true;
  }

  // a fast mover whose path went right through a box (a fence, a door, a thin wall): put
  // it back against the face it came in by, keeping its slide along that face
  _sweepBox(o, pos, px, pz, r) {
    let dx = px - o.x, dz = pz - o.z;
    const ax = dx * o.c - dz * o.s, az = dx * o.s + dz * o.c;
    // it has to start outside the solid core
    if (Math.abs(ax) <= o.hw && Math.abs(az) <= o.hl) return false;
    dx = pos.x - o.x; dz = pos.z - o.z;
    const bx = dx * o.c - dz * o.s, bz = dx * o.s + dz * o.c;
    // does the path cross the core at all, and through which face did it come in?
    const face = slabHit(ax, az, bx, bz, o.hw, o.hl);
    if (!face) return false;
    let lx = bx, lz = bz, nlx = 0, nlz = 0;
    if (face === 1) { nlx = Math.sign(ax) || 1; lx = nlx * (o.hw + r + 0.002); } else { nlz = Math.sign(az) || 1; lz = nlz * (o.hl + r + 0.002); }
    // local -> world
    const wx = o.x + lx * o.c + lz * o.s, wz = o.z - lx * o.s + lz * o.c;
    const nx = nlx * o.c + nlz * o.s, nz = -nlx * o.s + nlz * o.c;
    const depth = Math.hypot(wx - pos.x, wz - pos.z);
    pos.x = wx;
    pos.z = wz;
    this._contact(o, nx, nz, depth);
    return true;
  }
}

// does the segment a -> b (box-local, starting outside) pass through the box |x| <= hw,
// |z| <= hl? 0 = no, 1 = it came in through an x face, 2 = through a z face
function slabHit(ax, az, bx, bz, hw, hl) {
  let t0 = -1e9, t1 = 1, face = 0;
  let d = bx - ax;
  if (Math.abs(d) < 1e-9) { if (Math.abs(ax) > hw) return 0; } else {
    let ta = (-hw - ax) / d, tb = (hw - ax) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) { t0 = ta; face = 1; }
    if (tb < t1) t1 = tb;
  }
  d = bz - az;
  if (Math.abs(d) < 1e-9) { if (Math.abs(az) > hl) return 0; } else {
    let ta = (-hl - az) / d, tb = (hl - az) / d;
    if (ta > tb) { const t = ta; ta = tb; tb = t; }
    if (ta > t0) { t0 = ta; face = 2; }
    if (tb < t1) t1 = tb;
  }
  if (t0 < 0 || t0 > t1 || t0 > 1) return 0;
  return face;
}
