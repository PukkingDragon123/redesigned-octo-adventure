// Getting villagers around Maple Cove without a navmesh: a small hand-laid graph
// of sidewalk lanes, crosswalks, the wharf, the boardwalk and the green; straight
// lines wherever nothing is in the way; and a cover finder that picks the best
// thing to hide behind (a building corner, a tree, a crate, their own front door).
import { MAIN_ST, CROSSWALKS } from '../world/layout.js';

const hyp = Math.hypot;
const M = MAIN_ST;
export const LANE_N = M.z - M.road / 2 - M.walk / 2;
export const LANE_S = M.z + M.road / 2 + M.walk / 2;

// ---------------------------------------------------------------- the graph
const NODES = [];
const byId = new Map();
function node(id, x, z, o = {}) {
  const n = { id, x, z, nb: [], i: NODES.length, ...o };
  NODES.push(n);
  byId.set(id, n);
  return n;
}
function link(a, b, o = {}) {
  const A = byId.get(a), B = byId.get(b);
  if (!A || !B) return;
  A.nb.push({ n: B, ...o });
  B.nb.push({ n: A, ...o });
}
(function build() {
  const xs = new Set([M.x0 + 1, ...CROSSWALKS, 132, 186, 252]);
  for (let x = M.x0 + 6; x < M.x1 - 2; x += 7) xs.add(x);
  const lane = [...xs].sort((a, b) => a - b);
  for (const [side, z] of [['N', LANE_N], ['S', LANE_S]]) {
    lane.forEach((x, i) => {
      node(`${side}${x}`, x, z, { lane: side });
      if (i) link(`${side}${lane[i - 1]}`, `${side}${x}`);
    });
  }
  for (const x of CROSSWALKS) link(`N${x}`, `S${x}`, { cross: true });
  // Wharf Street down to the boardwalk, and the two yard gangways
  node('W1', 166, 66); node('W2', 166, 76); link('S166', 'W1'); link('W1', 'W2');
  node('Y132a', 132, 66); node('Y132b', 132, 76); link('S132', 'Y132a'); link('Y132a', 'Y132b');
  node('Y252a', 252, 66); node('Y252b', 252, 76); link('S252', 'Y252a'); link('Y252a', 'Y252b');
  const bw = [132, 140, 150, 158, 166, 175, 184, 190, 198, 205, 215, 226, 235, 244, 252, 260];
  bw.forEach((x, i) => { node(`B${x}`, x, 86); if (i) link(`B${bw[i - 1]}`, `B${x}`); });
  link('W2', 'B166'); link('Y132b', 'B132'); link('Y252b', 'B252');
  // the town green, round the gazebo, and on to the rink
  node('G1', 186, 37); node('GW', 177, 30); node('GE', 195, 30); node('GS', 186, 15);
  link('N186', 'G1'); link('G1', 'GW'); link('G1', 'GE'); link('GW', 'GS'); link('GE', 'GS');
  node('R0', 205, 28); node('R1', 214, 25.5); node('R2', 226, 25.5); node('R3', 238, 25.5);
  link('GE', 'R0'); link(`N${CROSSWALKS[2]}`, 'R0'); link('R0', 'R1'); link('R1', 'R2'); link('R2', 'R3');
  // the bike park lane
  node('P1', 118, 30); link(`N${CROSSWALKS[0]}`, 'P1');
})();

export const VILLAGE_BOX = { x0: M.x0 - 8, x1: M.x1 + 8, z0: 0, z1: 96 };
const inVillage = (p) => p.x > VILLAGE_BOX.x0 && p.x < VILLAGE_BOX.x1 && p.z > VILLAGE_BOX.z0 && p.z < VILLAGE_BOX.z1;
// does a straight walk cross Main Street's carriageway (jaywalking)?
const crossesRoad = (a, b) => (a.z - M.z) * (b.z - M.z) < 0 && Math.min(a.x, b.x) < M.x1 + 2 && Math.max(a.x, b.x) > M.x0 - 2 && Math.abs(a.z - b.z) > 3;

export class Nav {
  constructor(physics) {
    this.ph = physics;
  }
  gy(p) {
    return this.ph.groundAt(p.x, p.z, (p.y ?? 50) + 1).h;
  }
  // true when nothing tall (a building wall) blocks the straight line, and it
  // doesn't step off a ledge (the boardwalk, a dock, a bank) on the way
  clear(a, b) {
    const ya = this.gy(a), yb = this.gy(b);
    if (this.ph.segmentHit(a.x, ya + 1, a.z, b.x, yb + 1, b.z, 0.2) < 0.999) return false;
    const n = Math.min(6, Math.ceil(hyp(b.x - a.x, b.z - a.z) / 4));
    for (let i = 1; i < n; i++) {
      const t = i / n, yi = ya + (yb - ya) * t;
      if (Math.abs(this.ph.groundAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, yi + 0.6).h - yi) > 0.7) return false;
    }
    return true;
  }
  nearestNode(p) {
    let list = NODES.map((n) => ({ n, d: hyp(n.x - p.x, n.z - p.z) })).sort((a, b) => a.d - b.d);
    list = list.slice(0, 8);
    for (const { n } of list) if (this.clear(p, n) && !crossesRoad(p, n)) return n;
    return list[0]?.n;
  }
  // a list of points {x, z, cross?} from a to b
  route(a, b) {
    const direct = [{ x: b.x, z: b.z }];
    const far = hyp(a.x - b.x, a.z - b.z);
    if (!inVillage(a) && !inVillage(b)) return direct;
    if (far < 30 && !crossesRoad(a, b) && this.clear(a, b)) return direct;
    const s = this.nearestNode(a), e = this.nearestNode(b);
    if (!s || !e) return direct;
    // Dijkstra over the little graph
    const N = NODES.length;
    const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), via = new Array(N), done = new Uint8Array(N);
    dist[s.i] = 0;
    for (;;) {
      let u = -1, best = Infinity;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === e.i) break;
      done[u] = 1;
      const U = NODES[u];
      for (const ed of U.nb) {
        const v = ed.n, w = hyp(v.x - U.x, v.z - U.z) * (ed.cross ? 1.3 : 1);
        if (dist[u] + w < dist[v.i]) { dist[v.i] = dist[u] + w; prev[v.i] = u; via[v.i] = ed; }
      }
    }
    if (!isFinite(dist[e.i])) return direct;
    const pts = [];
    for (let i = e.i; i >= 0; i = prev[i]) pts.unshift({ x: NODES[i].x, z: NODES[i].z, cross: !!via[i]?.cross, id: NODES[i].id });
    // skip graph nodes we can cut past
    while (pts.length > 1 && this.clear(a, pts[1]) && !crossesRoad(a, pts[1]) && !pts[1].cross) pts.shift();
    while (pts.length > 1 && this.clear(pts[pts.length - 2], b) && !crossesRoad(pts[pts.length - 2], b) && !pts[pts.length - 1].cross) pts.pop();
    pts.push({ x: b.x, z: b.z });
    return pts;
  }

  // Somewhere to hide from Hank (at H) for a villager at A. Returns
  // { kind: 'door'|'wall'|'tree'|'low'|'open', x, z, yaw, side, pose, peekPose, path }
  cover(A, H, { door = null, preferDoor = false, avoid = null, minFromH = 5 } = {}) {
    const ph = this.ph;
    const out = [];
    const hx = H.x, hz = H.z;
    const away = (x, z) => { const dx = x - hx, dz = z - hz, d = hyp(dx, dz) || 1; return [dx / d, dz / d]; };
    const free = (x, z) => {
      const p = { x, y: ph.groundAt(x, z).h, z };
      ph.resolve(p, 0.24, 1.6);
      return hyp(p.x - x, p.z - z) < 0.12;
    };
    // buildings: hug the side wall just round the corner from Hank
    ph.solids.query(A.x, A.z, 20, (o) => {
      if (o.type === 'box') {
        const area = o.hw * o.hl;
        const ax = [o.c, -o.s], az = [o.s, o.c];
        if (o.kind === 'wall' && area > 2.5) {
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            const cx = o.x + ax[0] * o.hw * sx + az[0] * o.hl * sz, cz = o.z + ax[1] * o.hw * sx + az[1] * o.hl * sz;
            const nX = [ax[0] * sx, ax[1] * sx], nZ = [az[0] * sz, az[1] * sz];
            const dX = nX[0] * (hx - cx) + nX[1] * (hz - cz), dZ = nZ[0] * (hx - cx) + nZ[1] * (hz - cz);
            // the hidden face looks away from Hank, the other one towards him
            let nF, nO;
            if (dX < 0 && dZ >= 0) { nF = nX; nO = nZ; } else if (dZ < 0 && dX >= 0) { nF = nZ; nO = nX; } else continue;
            const x = cx + nF[0] * 0.55 - nO[0] * 0.8, z = cz + nF[1] * 0.55 - nO[1] * 0.8;
            const yaw = Math.atan2(nF[0], nF[1]);
            const side = Math.sign(nO[0] * Math.cos(yaw) - nO[1] * Math.sin(yaw)) || 1;
            out.push({ kind: 'wall', x, z, yaw, side, pose: 'wallHide', peekPose: 'peek', corner: { x: cx + (nF[0] + nO[0]) * 0.9, z: cz + (nF[1] + nO[1]) * 0.9 } });
          }
        } else if (o.y1 - o.y0 > 1.2 && area > 0.1 && o.kind !== 'railing') {
          const [dx, dz] = away(o.x, o.z);
          const sup = o.hw * Math.abs(dx * ax[0] + dz * ax[1]) + o.hl * Math.abs(dx * az[0] + dz * az[1]);
          out.push({ kind: 'low', x: o.x + dx * (sup + 0.45), z: o.z + dz * (sup + 0.45), yaw: Math.atan2(-dx, -dz), pose: 'cower', peekPose: 'peekLow' });
        }
      } else if (o.r >= 0.3) {
        const [dx, dz] = away(o.x, o.z);
        const tall = o.r > 0.9;
        out.push({ kind: tall ? 'tree' : 'low', x: o.x + dx * (o.r + 0.42), z: o.z + dz * (o.r + 0.42), yaw: Math.atan2(-dx, -dz), pose: tall ? 'hug' : 'cower', peekPose: tall ? 'peek' : 'peekLow' });
      }
    });
    ph.trees?.query(A.x, A.z, 16, (t) => {
      if (t.type !== 'circle' || t.r < 0.12) return;
      const [dx, dz] = away(t.x, t.z);
      out.push({ kind: 'tree', x: t.x + dx * (t.r + 0.38), z: t.z + dz * (t.r + 0.38), yaw: Math.atan2(-dx, -dz), pose: 'hug', peekPose: 'peek' });
    });
    if (door) out.push({ kind: 'door', x: door.x + door.nx * 0.25, z: door.z + door.nz * 0.25, yaw: door.yaw });
    // score: close to us, far from Hank, not past Hank
    const tH = [hx - A.x, hz - A.z], dAH = hyp(tH[0], tH[1]) || 1;
    let best = null, bestS = Infinity;
    for (const c of out) {
      const dA = hyp(c.x - A.x, c.z - A.z), dH = hyp(c.x - hx, c.z - hz);
      if (dH < minFromH || dA > 40) continue;
      if (avoid && hyp(c.x - avoid.x, c.z - avoid.z) < 1.5) continue;
      const toward = ((c.x - A.x) * tH[0] + (c.z - A.z) * tH[1]) / (dA * dAH || 1);
      let s = dA * (c.kind === 'door' ? 0.7 : 1) - Math.min(dH, 18) * 0.35;
      if (toward > 0.2 && dA > 2) s += 25 * toward;
      if (c.kind === 'door' && preferDoor) s -= 12;
      if (c.kind === 'low') s += 2;
      if (s >= bestS) continue;
      // can we get there, and is it really out of sight?
      if (c.kind === 'wall' && ph.segmentHit(hx, (H.y ?? this.gy(H)) + 1.2, hz, c.x, this.gy(c) + 1.0, c.z, 0.05) > 0.97) continue;
      if (c.kind !== 'door' && !free(c.x, c.z)) continue;
      let path = null;
      if (this.clear(A, c) && !crossesRoad(A, c)) path = [{ x: c.x, z: c.z }];
      else if (c.corner && this.clear(A, c.corner) && this.clear(c.corner, c)) path = [c.corner, { x: c.x, z: c.z }];
      else if (c.kind === 'door' && dA < 45) path = this.route(A, c);
      if (!path) continue;
      c.path = path;
      best = c;
      bestS = s;
    }
    if (best) return best;
    // nothing to hide behind: just get away and curl up
    const [dx, dz] = away(A.x, A.z);
    const x = A.x + dx * 9, z = A.z + dz * 9;
    return { kind: 'open', x, z, yaw: Math.atan2(-dx, -dz), pose: 'cower', peekPose: 'eyes', path: [{ x, z }] };
  }
}
