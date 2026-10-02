// Harold's roadster bicycle as voxels (0.025 m): frame, steering front with
// wicker basket and bell, and spoked wheels. Coordinates follow BikeModel's
// local spaces so the parts drop straight into its groups.
import { Vox, tone } from '../vox.js';

const S = 0.025;
const FRAME = 0x2f6e52, FRAME_HI = 0x4a9a72, CREAM = 0xeadfc4, CHROME = 0xc8ccd4, SADDLE = 0x6a3a1e, TIRE = 0x241e1c, RIM = 0xb4b8c0, BLACK = 0x1e1a1a, WICKER = 0xb98a48, WICKER_D = 0x8a5e2c, LEATHER = 0x4a2a1a;

// a voxel grid laid over a metre-space box; line/point helpers take metres
function grid(x0, x1, y0, y1, z0, z1) {
  const w = Math.ceil((x1 - x0) / S), h = Math.ceil((y1 - y0) / S), d = Math.ceil((z1 - z0) / S);
  const v = new Vox(w, h, d);
  const P = (x, y, z) => [(x - x0) / S, (y - y0) / S, (z - z0) / S];
  const line = (a, b, c, r = 0.6) => {
    const A = P(...a), B = P(...b);
    v.line(A[0], A[1], A[2], B[0], B[1], B[2], c, r);
  };
  const box = (cx, cy, cz, sx, sy, sz, c) => {
    const a = P(cx - sx / 2, cy - sy / 2, cz - sz / 2), b = P(cx + sx / 2, cy + sy / 2, cz + sz / 2);
    v.fill(a[0], a[1], a[2], b[0] - 1, b[1] - 1, b[2] - 1, c);
  };
  const origin = [-x0 / S, -y0 / S, -z0 / S];
  return { v, P, line, box, origin };
}

export function bikeFrame() {
  const G = grid(-0.2, 0.2, 0.15, 1.1, -0.95, 0.6);
  const { line, box } = G;
  const BB = [0, 0.3, -0.02], seatTop = [0, 0.84, -0.2], headTop = [0, 0.88, 0.37], headBot = [0, 0.66, 0.42], rear = [0, 0.34, -0.54];
  line(BB, seatTop, FRAME, 0.9);
  line(seatTop, headTop, FRAME, 0.8);
  line(BB, headBot, FRAME, 1.0);
  line(headBot, headTop, FRAME_HI, 1.1);
  for (const sx of [-0.055, 0.055]) {
    line(BB, [sx, rear[1], rear[2]], FRAME, 0.6);
    line([sx * 0.4, 0.8, -0.21], [sx, rear[1], rear[2]], FRAME, 0.6);
  }
  // seat post & sprung leather saddle
  line(seatTop, [0, 0.95, -0.23], CHROME, 0.6);
  box(0, 0.985, -0.24, 0.17, 0.05, 0.25, SADDLE);
  box(0, 1.0, -0.17, 0.09, 0.04, 0.12, tone(SADDLE, 0.1));
  for (const sx of [-0.05, 0.05]) line([sx, 0.95, -0.31], [sx, 0.93, -0.33], CHROME, 0.5);
  // rear fender (cream arc over the wheel) and rack
  for (let a = -0.25; a < 2.15; a += 0.04) {
    const r = 0.38;
    G.v.ellipsoid(...G.P(0, rear[1] + Math.cos(a - 0.4) * r, rear[2] - Math.sin(a - 0.4) * r), 1.6, 0.6, 0.6, CREAM);
  }
  box(0, 0.8, -0.56, 0.16, 0.025, 0.36, BLACK);
  for (const sx of [-0.07, 0.07]) line([sx, 0.8, -0.72], [sx, rear[1], rear[2]], BLACK, 0.4);
  // chainring + chain + chain guard
  for (let a = 0; a < Math.PI * 2; a += 0.12) G.v.set(...G.P(0.075, BB[1] + Math.cos(a) * 0.1, BB[2] + Math.sin(a) * 0.1), CHROME);
  line([0.075, BB[1] + 0.1, BB[2]], [0.075, rear[1] + 0.04, rear[2]], 0x4a4a50, 0.3);
  line([0.075, BB[1] - 0.1, BB[2]], [0.075, rear[1] - 0.04, rear[2]], 0x4a4a50, 0.3);
  box(0.085, 0.31, -0.28, 0.025, 0.07, 0.5, CREAM);
  return { vox: G.v, size: S, origin: G.origin };
}

export function bikeFront() {
  // steer-local space (see BikeModel.front): axle at (0,-0.341,0.027)
  const G = grid(-0.43, 0.43, -0.78, 0.48, -0.3, 0.42);
  const { line, box } = G;
  const ax = [0, -0.341, 0.027];
  for (const sx of [-0.05, 0.05]) line([sx, 0.02, 0], [sx, ax[1], ax[2]], FRAME, 0.6);
  line([0, 0, 0], [0, 0.36, 0], CHROME, 0.7);
  line([0, 0.36, 0], [0, 0.36, -0.05], CHROME, 0.6);
  line([-0.3, 0.38, -0.16], [0, 0.36, -0.05], CHROME, 0.55);
  line([0.3, 0.38, -0.16], [0, 0.36, -0.05], CHROME, 0.55);
  line([-0.3, 0.38, -0.16], [-0.39, 0.38, -0.2], LEATHER, 0.9);
  line([0.3, 0.38, -0.16], [0.39, 0.38, -0.2], LEATHER, 0.9);
  // front fender
  for (let a = 0.55; a < 2.55; a += 0.05) G.v.ellipsoid(...G.P(0, ax[1] + Math.cos(a - 1.2) * 0.38, ax[2] + Math.sin(a - 1.2) * 0.38), 1.6, 0.6, 0.6, CREAM);
  // wicker basket on its little rack
  const bz = ax[2] + 0.12, by = 0.22;
  box(0, by, bz, 0.38, 0.03, 0.3, WICKER_D);
  for (let k = 0; k < 4; k++) {
    const y = by + 0.04 + k * 0.05;
    const c = k % 2 ? WICKER : WICKER_D;
    box(0, y, bz + 0.145, 0.38, 0.035, 0.025, c);
    box(0, y, bz - 0.145, 0.38, 0.035, 0.025, c);
    box(0.18, y, bz, 0.025, 0.035, 0.3, c);
    box(-0.18, y, bz, 0.025, 0.035, 0.3, c);
  }
  line([0, by, bz - 0.15], [0, 0.0, 0], BLACK, 0.4);
  // bell
  G.v.ellipsoid(...G.P(0.17, 0.4, -0.1), 1.4, 1, 1.4, 0xe8e8ec);
  return { vox: G.v, size: S, origin: G.origin };
}

export function bikeWheel(radius = 0.34) {
  const R = radius / S;
  const n = Math.ceil(R) + 2;
  const v = new Vox(4, n * 2, n * 2);
  const c = n - 0.5;
  for (let z = 0; z < n * 2; z++) for (let y = 0; y < n * 2; y++) {
    const d = Math.hypot(y - c, z - c);
    if (d > R + 0.4) continue;
    if (d > R - 1.3) { v.fill(0, y, z, 3, y, z, (y + z) % 3 === 0 ? tone(TIRE, 0.08) : TIRE); continue; } // fat tyre with tread
    if (d > R - 2.6 && d < R - 1.4) { v.set(1, y, z, RIM); v.set(2, y, z, RIM); }
  }
  // spokes
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI;
    v.line(1.5, c + Math.cos(a) * (R - 2.4), c + Math.sin(a) * (R - 2.4), 1.5, c - Math.cos(a) * (R - 2.4), c - Math.sin(a) * (R - 2.4), CHROME);
  }
  v.fill(0, Math.round(c) - 1, Math.round(c) - 1, 3, Math.round(c), Math.round(c), CHROME);
  return { vox: v, size: S, origin: [2, n, n] };
}

export const PREVIEW = {
  frame: bikeFrame,
  front: bikeFront,
  wheel: () => bikeWheel(),
};
