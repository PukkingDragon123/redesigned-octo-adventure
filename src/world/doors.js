// Front doors on real hinges. Every house, shop, cabin and the chapel has its main door lifted out
// of the voxel model (meta.doors, see takeDoors in voxel/models/buildings.js): the near model has
// the doorway open with a little vestibule behind it, and each leaf is its own mesh, hung on its
// hinge inside the building's near LOD level (the far model keeps the door painted shut).
//
// The leaves swing inwards. Hank on foot opens a door as he comes up to it, Bessie flings it open,
// anyone leaning on a leaf pushes it round and anyone standing behind it stops it. A spring
// pulls the door shut again; it bounces off the frame (a thud or a slam) and off the vestibule wall.
// Each leaf is a thin box in the physics world that turns with it, and the building's wall box is
// notched for the doorway, so you can step through into the vestibule when the door is open.
import * as THREE from 'three';
import { Vox } from '../voxel/vox.js';
import { meshVox } from '../voxel/mesh.js';
import { voxMesh, sharedVoxelMaterial } from '../render/voxelMaterial.js';

const OPEN = 1.62; // the vestibule wall stops the leaf here (rad)
const SPRING = 7, DAMP = 1.5; // pulling shut, and the hinge friction
const _v = new THREE.Vector3();

export class Doors {
  constructor(world, { active = () => true } = {}) {
    this.world = world;
    this.list = []; // one entry per leaf
    this.byId = new Map();
    this.isActive = active; // (no swinging while the far models stand in: the 'low' detail setting)
  }

  // a building's doors, from its meta (local frame: matrix M, turned by yaw), and the wall boxes to notch
  add(id, M, yaw, meta, walls = []) {
    const PH = this.world.physics;
    const leaves = [];
    for (const d of meta.doors || []) {
      const group = [];
      for (const lf of d.leaves) {
        const hinge = new THREE.Vector3(lf.x, lf.y, lf.z).applyMatrix4(M);
        const Y = yaw + lf.yaw, s = lf.right ? -1 : 1;
        const L = {
          id, lf, hinge, Y, s, w: lf.w, h: lf.h, t: lf.t,
          e0: [s * Math.cos(Y), -s * Math.sin(Y)], n0: [Math.sin(Y), Math.cos(Y)],
          th: 0, om: 0, mesh: null, cool: 0, knockT: 0, group,
        };
        L.box = PH.addBox({ ...this.boxAt(L, 0), y0: hinge.y - 0.3, y1: hinge.y + lf.h + 0.1, kind: 'door' });
        group.push(L);
        leaves.push(L);
        this.list.push(L);
      }
      const Yf = yaw + (d.leaves[0]?.yaw || 0);
      if (notch(PH, walls, d.opening, M, Yf)) {
        // the vestibule's floor (and the threshold), so Hank steps up into it instead of sinking to the yard
        const o = d.opening, A = new THREE.Vector3(o.ax, o.y, o.az).applyMatrix4(M), B = new THREE.Vector3(o.bx, o.y, o.bz).applyMatrix4(M);
        const nx = Math.sin(Yf), nz = Math.cos(Yf), k = 0.2 - o.depth / 2;
        PH.addPlatform({ x: (A.x + B.x) / 2 + nx * k, z: (A.z + B.z) / 2 + nz * k, yaw: Yf, w: Math.hypot(B.x - A.x, B.z - A.z), l: o.depth + 0.4, y0: A.y, surface: 'wood', kind: 'floor' });
      }
    }
    this.byId.set(id, leaves);
  }

  // the building's near mesh has arrived: hang its leaves in it (they show and hide with it)
  attach(id, level) {
    const leaves = this.byId.get(id);
    if (!leaves?.length || !level) return;
    const sc = level.scale.x || 1;
    const pivot = new THREE.Object3D();
    pivot.scale.setScalar(1 / sc);
    pivot.name = 'doors';
    level.add(pivot);
    for (const L of leaves) {
      const { lf } = L;
      const v = new Vox(lf.vox.w, lf.vox.h, lf.vox.d);
      v.data.set(lf.vox.data);
      const geo = meshVox(v, { size: 1 / 16, origin: [lf.right ? v.w : 0, 0, 0], jitter: 0 });
      const m = voxMesh(geo, sharedVoxelMaterial());
      m.position.set(lf.x, lf.y, lf.z);
      m.rotation.y = lf.yaw;
      m.name = `door:${L.id}`;
      pivot.add(m);
      L.mesh = m;
      lf.vox = null; // (the voxels are in the mesh now)
      this.pose(L);
    }
  }

  // the collider of leaf L opened by th: a thin box from the hinge across the doorway
  boxAt(L, th) {
    const c = Math.cos(th), s = Math.sin(th);
    const ex = L.e0[0] * c - L.n0[0] * s, ez = L.e0[1] * c - L.n0[1] * s;
    const nx = L.n0[0] * c + L.e0[0] * s, nz = L.n0[1] * c + L.e0[1] * s;
    return { x: L.hinge.x + ex * L.w / 2 + nx * L.t / 2, z: L.hinge.z + ez * L.w / 2 + nz * L.t / 2, yaw: L.Y + L.s * th, w: L.w, l: L.t + 0.04 };
  }

  pose(L) {
    if (L.mesh) L.mesh.rotation.y = L.lf.yaw + L.s * L.th;
    this.world.physics.updateBox(L.box, this.boxAt(L, L.th));
  }

  // per frame: g is the game (Hank on foot or on Bessie)
  update(dt, g) {
    if (!this.list.length || dt <= 0) return;
    const actors = [];
    if (g.onFoot && g.walker) actors.push({ p: g.walker.pos, v: g.walker.vel, r: 0.28, foot: true });
    else if (g.bike && !(g.bike.crash > 0)) actors.push({ p: g.bike.pos, v: g.bike.vel, r: 0.42, bike: true });
    for (const L of this.list) {
      L.cool -= dt;
      const near = actors.some((a) => Math.abs(a.p.x - L.hinge.x) < 4.5 && Math.abs(a.p.z - L.hinge.z) < 4.5);
      if (!near && L.th === 0 && L.om === 0 && L.knockT <= 0) continue;
      if (!L.mesh || !this.isActive()) {
        if (L.th !== 0 || L.om !== 0) { L.th = 0; L.om = 0; this.pose(L); }
        continue;
      }
      const th0 = L.th;
      let rest = 0;
      if (L.knockT > 0 && (L.knockT -= dt) <= 0) { L.om = Math.max(L.om, 2.6); this.sfx(g, 'door_creak', L, 0.5); }
      for (const a of actors) {
        if (a.p.y > L.hinge.y + 1.6 || a.p.y < L.hinge.y - 1.2) continue;
        const qx = a.p.x - L.hinge.x, qz = a.p.z - L.hinge.z;
        const along = qx * L.e0[0] + qz * L.e0[1], out = qx * L.n0[0] + qz * L.n0[1];
        const vin = -(a.v.x * L.n0[0] + a.v.z * L.n0[1]);
        if (along > -0.45 && along < L.w + 0.45) {
          // walking up to it: the door swings open ahead of Hank (and stays open while he's in the doorway)
          if (a.foot && out < 1.2 && out > -L.w - 0.6 && ((out < 0.8 && vin > 0.25) || out < 0.5)) rest = OPEN * 0.82;
          // riding at it: Bessie's front wheel flings it open
          if (a.bike && out > 0 && out < 2.6 && vin > 1.4 && L.th < 1 && L.om < vin) {
            L.om = Math.min(14, vin * 1.7);
            if (L.cool <= 0) { this.sfx(g, 'door_slam', L, Math.min(0.6, vin * 0.06), 1.2); L.cool = 0.5; }
          }
        }
        // touching the leaf: pushed round from the front, held back from behind
        const c = Math.cos(L.th), s = Math.sin(L.th);
        const ex = L.e0[0] * c - L.n0[0] * s, ez = L.e0[1] * c - L.n0[1] * s;
        const nx = L.n0[0] * c + L.e0[0] * s, nz = L.n0[1] * c + L.e0[1] * s;
        const u = qx * ex + qz * ez, v = qx * nx + qz * nz - L.t / 2;
        const need = a.r + L.t / 2 + 0.05;
        if (u < -a.r || u > L.w + a.r || Math.abs(v) >= need + 0.03) continue;
        const k = Math.max(0.25, Math.min(L.w, u));
        if (v > 0) {
          const d = (need + 0.03 - v) / k;
          L.th += d;
          L.om = Math.max(L.om, Math.min(10, d / dt * 0.7));
        } else {
          const d = (need + 0.03 + v) / k;
          L.th -= d;
          L.om = Math.min(L.om, 0);
        }
      }
      // the spring shuts it, friction slows it
      L.om += (-SPRING * (L.th - rest) - DAMP * L.om) * dt;
      L.th += L.om * dt;
      if (L.th < 0) {
        // against the frame: a thud (a slam when it's flung), and a little bounce
        const hit = -L.om;
        L.th = 0;
        L.om = hit > 0.6 ? hit * 0.3 : 0;
        if (hit > 0.9 && L.cool <= 0) { this.sfx(g, 'door_slam', L, Math.min(0.75, 0.12 + hit * 0.07), hit > 3 ? 1 : 1.25); L.cool = 0.25; }
      } else if (L.th > OPEN) {
        // against the vestibule wall
        const hit = L.om;
        L.th = OPEN;
        L.om = hit > 0.5 ? -hit * 0.28 : 0;
        if (hit > 2.5 && L.cool <= 0) { this.sfx(g, 'land', L, Math.min(0.5, hit * 0.05), 0.8); L.cool = 0.25; }
      }
      // the creak as it starts to open
      if (th0 < 0.04 && L.th >= 0.04 && L.om > 0.3 && L.om < 6 && L.cool <= 0) { this.sfx(g, 'door_creak', L, 0.32, 0.95 + Math.random() * 0.15); L.cool = 1.2; }
      if (Math.abs(L.om) < 0.02 && Math.abs(L.th - rest) < 0.004) { L.om = 0; L.th = rest; }
      if (L.th !== th0) this.pose(L);
    }
  }

  // the closed door Hank is standing in front of (for the knock prompt)
  nearest(p) {
    let best = null, bd = 1.5;
    for (const L of this.list) {
      if (!L.mesh || L.th > 0.15 || L.knockT > 0 || Math.abs(p.y - L.hinge.y) > 1.2) continue;
      const qx = p.x - L.hinge.x, qz = p.z - L.hinge.z;
      const along = qx * L.e0[0] + qz * L.e0[1], out = qx * L.n0[0] + qz * L.n0[1];
      if (along < -0.3 || along > L.w + 0.3 || out < 0.2 || out > bd) continue;
      bd = out;
      best = L;
    }
    return best;
  }

  // knock knock: somebody inside lets the door swing open
  knock(L, g) {
    this.sfx(g, 'knock', L, 0.7);
    for (const o of L.group) o.knockT = 1.1;
  }

  sfx(g, name, L, vol = 1, pitch = 1) {
    if (!g.sound?.play || !g.camera) return;
    const cp = g.camera.position;
    const d = _v.set(L.hinge.x - cp.x, L.hinge.y + 1 - cp.y, L.hinge.z - cp.z).length();
    if (d > 40) return;
    g.sound.play(name, { volume: vol * Math.max(0, 1 - d / 40), pitch });
  }
}

// Cut the doorway out of the building's wall box (opening: its outer corners at the face, the
// vestibule depth; in the building frame M): the box shrinks, the rest of it becomes new boxes.
function notch(PH, walls, o, M, Y) {
  if (!o) return false;
  const A = new THREE.Vector3(o.ax, o.y, o.az).applyMatrix4(M), B = new THREE.Vector3(o.bx, o.y, o.bz).applyMatrix4(M);
  const nx = Math.sin(Y), nz = Math.cos(Y);
  const mx = (A.x + B.x) / 2 - nx * 0.3, mz = (A.z + B.z) / 2 - nz * 0.3;
  for (const box of walls) {
    const [lx, lz] = PH.toLocal(box, mx, mz);
    if (Math.abs(lx) > box.hw || Math.abs(lz) > box.hl) continue;
    const [ax, az] = PH.toLocal(box, A.x, A.z), [bx, bz] = PH.toLocal(box, B.x, B.z);
    const [ux, uz] = PH.toLocal(box, box.x + nx, box.z + nz); // the outward normal, in the box's frame
    let N;
    if (Math.abs(uz) > 0.9) {
      const f = (az + bz) / 2, edge = uz > 0 ? box.hl - f : f + box.hl;
      if (edge < -0.05 || edge > 0.8) continue;
      N = uz > 0 ? [Math.min(ax, bx), f - o.depth, Math.max(ax, bx), box.hl] : [Math.min(ax, bx), -box.hl, Math.max(ax, bx), f + o.depth];
    } else if (Math.abs(ux) > 0.9) {
      const f = (ax + bx) / 2, edge = ux > 0 ? box.hw - f : f + box.hw;
      if (edge < -0.05 || edge > 0.8) continue;
      N = ux > 0 ? [f - o.depth, Math.min(az, bz), box.hw, Math.max(az, bz)] : [-box.hw, Math.min(az, bz), f + o.depth, Math.max(az, bz)];
    } else continue;
    const parts = subtract([-box.hw, -box.hl, box.hw, box.hl], N);
    const world = (r) => {
      const cx = (r[0] + r[2]) / 2, cz = (r[1] + r[3]) / 2;
      return { x: box.x + cx * box.c + cz * box.s, z: box.z - cx * box.s + cz * box.c, yaw: box.yaw, w: r[2] - r[0], l: r[3] - r[1] };
    };
    if (!parts.length) continue;
    PH.updateBox(box, world(parts[0]));
    for (const r of parts.slice(1)) PH.addBox({ ...world(r), y0: box.y0, y1: box.y1, kind: box.kind });
    return true;
  }
  return false;
}

// rectangle R minus rectangle N (both [x0, z0, x1, z1]): up to four rectangles
function subtract(R, N) {
  const [rx0, rz0, rx1, rz1] = R;
  const nx0 = Math.max(N[0], rx0), nz0 = Math.max(N[1], rz0), nx1 = Math.min(N[2], rx1), nz1 = Math.min(N[3], rz1);
  if (nx0 >= nx1 || nz0 >= nz1) return [R];
  const out = [];
  if (nz0 > rz0) out.push([rx0, rz0, rx1, nz0]);
  if (nz1 < rz1) out.push([rx0, nz1, rx1, rz1]);
  if (nx0 > rx0) out.push([rx0, nz0, nx0, nz1]);
  if (nx1 < rx1) out.push([nx1, nz0, rx1, nz1]);
  return out.filter((r) => r[2] - r[0] > 0.02 && r[3] - r[1] > 0.02);
}
