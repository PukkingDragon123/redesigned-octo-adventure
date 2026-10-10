// Where the lens goes for Hank's first ride into Maple Cove (Story.townEntry), worked out
// from where everyone stands, with no three.js (tools/crowdtest.mjs checks them): every
// shot sits out in the open street, between the two rows of carving tables, clear of the
// tables, the bunting poles and anyone standing about, with nobody between the lens and
// the face it is about.
import { CONTEST } from '../world/contest.js';
import { MAIN_ST } from '../world/layout.js';

const hyp = Math.hypot;
const NK = MAIN_ST.z - MAIN_ST.road / 2, SK = MAIN_ST.z + MAIN_ST.road / 2;

// Bessie rolls in along the road from Nana's and stops just short of the bunting
export const ENTRY = {
  start: { x: CONTEST.entry.x - 10.5, z: MAIN_ST.z - 0.7 },
  stop: { x: CONTEST.entry.x + 3.5, z: MAIN_ST.z },
  // the crowd freezes as she passes the corn sheaves
  freezeX: CONTEST.entry.x - 2.5,
};
ENTRY.yaw = Math.atan2(ENTRY.stop.x - ENTRY.start.x, ENTRY.stop.z - ENTRY.start.z);

// the open street: Main Street's roadway between the kerbs (and the road coming in from
// the west), with a margin off the tables on either side
export const STREET = { x0: ENTRY.start.x - 8, x1: 160, z0: NK + 0.55, z1: SK - 0.55 };
export function inStreet(x, z) {
  return x >= STREET.x0 && x <= STREET.x1 && z >= STREET.z0 && z <= STREET.z1;
}

// the things in the street a lens must stay out of: table tops (as boxes) and poles
export function obstacles() {
  const C = CONTEST, out = [];
  const box = (x, z, yaw, w, d, h) => out.push({ x, z, yaw, w, d, h });
  for (const t of C.tables) box(t.x, t.z, t.yaw, 3.7, 0.98, 0.86);
  box(C.hank.x, C.hank.z, C.hank.yaw, 1.9, 0.98, 0.86);
  box(C.judges.x, C.judges.z, 0, C.judges.len + 0.1, 0.98, 0.86);
  box(C.entries.x, C.entries.z, Math.PI, C.entries.len + 0.1, 0.95, 0.9);
  for (const x of [C.west, 133.6, 146.3, 158.9]) for (const z of [MAIN_ST.z - 6, MAIN_ST.z + 6]) out.push({ x, z, r: 0.35, h: 5 });
  return out;
}
const OBST = obstacles();

// is (x, z) at height y (above the ground) inside a table or a pole, or too close to one?
export function blocked(x, z, y = 1.5, pad = 0.15) {
  for (const o of OBST) {
    if (o.r != null) { if (hyp(x - o.x, z - o.z) < o.r + pad) return true; continue; }
    if (y > o.h + 0.45) continue; // well above a table top
    const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
    const lx = (x - o.x) * c - (z - o.z) * s, lz = (x - o.x) * s + (z - o.z) * c;
    if (Math.abs(lx) < o.w / 2 + pad && Math.abs(lz) < o.d / 2 + pad) return true;
  }
  return false;
}

// nobody standing within r of the point
export function roomAt(x, z, people, r = 0.6) {
  for (const p of people) if (hyp(p.x - x, p.z - z) < r) return false;
  return true;
}

// nobody standing on the line from the lens (cx, cz) to the subject (tx, tz)
export function clearLine(cx, cz, tx, tz, people, r = 0.34) {
  const dx = tx - cx, dz = tz - cz, L = hyp(dx, dz) || 1;
  for (const p of people) {
    const k = ((p.x - cx) * dx + (p.z - cz) * dz) / (L * L);
    if (k <= 0.02 || k >= 1) continue;
    // (right beside the subject doesn't count: that's who they're hiding behind)
    if ((1 - k) * L < 0.45) continue;
    const qx = cx + dx * k, qz = cz + dz * k;
    if (hyp(p.x - qx, p.z - qz) < r) return false;
  }
  return true;
}

// a close-up of a frightened face: the lens out in front of them, on the line to Hank
// (they're staring at him, so they stare down the lens), swung round a little at a time
// until the spot is out in the open street with nobody in the way. head: { x, y, z } of
// their head (y above sea level), ground: the street's height there. people: everyone
// else standing about ({ x, z }), self left out. Returns { x, y, z } or null.
export function faceSpot(head, hank, people, { dist = 2.1, ground = 0, up = 0.05, swing = [0, 0.3, -0.3, 0.6, -0.6, 0.9, -0.9, 1.2, -1.2] } = {}) {
  const base = Math.atan2(hank.x - head.x, hank.z - head.z);
  for (const d of [dist, dist * 1.3]) {
    for (const off of swing) {
      const a = base + off;
      const x = head.x + Math.sin(a) * d, z = head.z + Math.cos(a) * d;
      const y = head.y + up;
      if (!inStreet(x, z) || blocked(x, z, y - ground) || !roomAt(x, z, people) || !clearLine(x, z, head.x, head.z, people)) continue;
      return { x, y, z };
    }
  }
  return null;
}

// the fixed shots, from where Bessie stops (y: the street's height there)
export function fixedShots(y = 0) {
  const s = ENTRY.stop;
  return {
    // Hank stopping, seen from the crowd's end of the street
    reverse: { pos: [s.x + 5.8, y + 1.35, s.z + 1.25], look: [s.x, y + 1.15, s.z], fov: 40 },
    // over his shoulder down the whole frozen street, pushing in a little
    wide: { pos: [s.x - 2.9, y + 2.25, s.z - 1.2], to: [s.x - 1.9, y + 2.05, s.z - 1.0], look: [s.x + 15.5, y + 0.9, s.z + 0.4], fov: 50 },
    // Hank again, closer: the carrier of cocoa in the crate
    hank: { pos: [s.x + 2.9, y + 1.45, s.z + 1.55], look: [s.x - 0.2, y + 0.95, s.z], fov: 42 },
  };
}

// the tracking shot as she rolls in: behind and to the right, looking up the street
export function followShot(bike, y) {
  return { pos: [bike.x - 4.6, y + 1.8, bike.z + 1.5], look: [bike.x + 9, y + 0.95, bike.z - 0.2], fov: 48 };
}
