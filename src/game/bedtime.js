// Bedtime at Nana's: poses for lying on the sofa, tucking in and reaching for the lamp,
// plus two scene-only voxel props (Harold's folded pajamas and the quilt laid over a
// sleeping skeleton). The scene itself is Story.bedtime() in story.js.
import { extendVChar, POSE_KIT } from './vchar.js';
import { Vox, tone } from '../voxel/vox.js';
import './lorePoses.js'; // the 'yawn' pose

const { arm, leg, idleArms } = POSE_KIT;
const S = Math.sin;

extendVChar({
  poses: {
    // flat on his back along the sofa, head on the armrest, hands folded on his tummy,
    // breathing slow and the jaw dropping open with each snore
    sofaSleep(c, t, T) {
      const br = (S(t * 1.4) + 1) * 0.5;
      T.bodyRx -= 1.5;
      T.bodyY = -c.P.hipH + 0.14;
      arm(T, 'L', 0.6, -0.05, 1.55, 0.8);
      arm(T, 'R', 0.6, -0.05, 1.55, 0.8);
      leg(T, 'L', 0.12, 0.06, 0.12);
      leg(T, 'R', 0.2, 0.03, 0.32);
      T.headX += 0.45;
      T.headY += 0.15 + S(t * 0.37) * 0.05;
      T.sq = 1 + br * 0.03;
      T.jaw = br * 0.24;
    },
    // Nana bends over him and pats the quilt down
    tuck(c, t, T) {
      const pat = Math.max(0, S(t * 7)) * 0.14;
      arm(T, 'L', 1.05 + pat, 0.18, 0.35);
      arm(T, 'R', 1.05 - pat * 0.6, 0.18, 0.35);
      T.lean += 0.36;
      T.headX += 0.22;
      T.bodyY -= 0.03;
    },
    // a reach across to the lamp switch
    reach(c, t, T) {
      idleArms(c, t, T, 'loose');
      const k = Math.min(1, t * 3);
      arm(T, 'R', 1.25 * k, 0.12, 0.3 * k);
      T.lean += 0.14 * k;
      T.twist -= 0.15 * k;
    },
  },
});

// Harold's pajamas, folded in a neat stack with the nightcap's pompom on top
export function pajamaBundle({ color = 0x3e5e9e, stripe = 0xf2e6cc, piping = 0xb8322a, pom = 0xfff4e0 } = {}) {
  const v = new Vox(10, 7, 8);
  for (let y = 0; y < 5; y++) {
    v.fill(0, y, 0, 9, y, 7, (x, yy, z) => {
      if (z === 7 && y % 2) return tone(color, -0.2); // folded edges
      if (y === 4 && x === 0) return piping;
      return (x + (y >> 1)) % 3 === 0 ? stripe : color;
    });
  }
  v.ellipsoid(7, 5.6, 2, 1.6, 1.4, 1.6, (x, y, z) => ((x + y + z) % 2 ? pom : tone(pom, -0.08)));
  return { vox: v, size: 0.04, origin: [5, 2.5, 4] };
}

// Harold's patchwork quilt laid over someone lying on the sofa. Room-local layout: the quilt
// spans x0..x0+w across the seat (the back cushions at x0, the front edge at frontX, where it
// hangs down) and from the feet (z0) to the shoulders (z0 + len). Origin: bottom centre.
const PATCH = [0xb8322a, 0xd4a03a, 0x2e3e62, 0x7e9a78, 0xf2e6c8, 0x8a3a5a, 0xc86a2a];
const SEAM = 0xe8dcc0;
const hash = (a, b) => {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
export function sleepQuilt({ x0 = 1.86, z0 = -2.3, w = 0.65, len = 1.4, seatY = 0.47, frontX = 2.45, bodyX = 2.15, hipZ = -1.5, hemY = 0.2 } = {}) {
  const VS = 0.05;
  const W = Math.round(w / VS), D = Math.round(len / VS), H = 20;
  const v = new Vox(W, H, D);
  const quilt = (u, k) => {
    if (u % 4 === 0 || k % 4 === 0) return SEAM;
    const c = PATCH[Math.floor(hash(u >> 2, k >> 2) * PATCH.length)];
    return (u + k) % 2 === 0 && hash(k >> 2, u >> 2) < 0.3 ? tone(c, 0.2) : c;
  };
  // height of the quilt's top over the body, along it (feet bump, legs, tummy, chest)
  const topAt = (z) => {
    const d = z - hipZ; // + towards the head
    if (d > 0) return 0.8 - Math.max(0, d - 0.35) * 0.12;
    if (d > -0.62) return 0.7 + (d + 0.62) * 0.15;
    return 0.79 - Math.min(1, Math.abs(d + 0.72) / 0.12) * 0.12; // slippers poking up
  };
  const heights = [];
  for (let k = 0; k < D; k++) {
    const z = z0 + (k + 0.5) * VS;
    const top = topAt(z);
    const half = z - hipZ > 0 ? 0.25 : 0.2;
    for (let i = 0; i < W; i++) {
      const x = x0 + (i + 0.5) * VS;
      const dx = (x - bodyX) / half;
      let y = seatY + (top - seatY) * Math.sqrt(Math.max(0, 1 - dx * dx));
      if (x > frontX) y = seatY; // over the front edge (the drape is added below)
      heights[k * W + i] = Math.max(1, Math.round(y / VS));
    }
  }
  for (let k = 0; k < D; k++) {
    for (let i = 0; i < W; i++) {
      const yi = heights[k * W + i];
      // fill down to the lowest neighbour so the steep sides have no gaps
      let lo = yi - 1;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ii = i + di, kk = k + dk;
        if (ii < 0 || kk < 0 || ii >= W || kk >= D) continue;
        lo = Math.min(lo, heights[kk * W + ii]);
      }
      const edge = k === 0 || k === D - 1;
      for (let y = lo; y <= yi; y++) v.set(i, y, k, edge ? 0xa8281e : y < yi ? tone(quilt(i, k), -0.15) : quilt(i, k));
    }
    // the front drape hangs down over the edge of the seat
    const fi = W - 1, top = heights[k * W + fi];
    for (let y = Math.round(hemY / VS); y <= top; y++) v.set(fi, y, k, y === Math.round(hemY / VS) ? 0xa8281e : quilt(fi + (top - y), k));
  }
  return { vox: v, size: VS, origin: [W / 2, 0, D / 2], at: { x: x0 + w / 2, z: z0 + len / 2 } };
}
