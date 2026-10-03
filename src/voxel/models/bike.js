// Harold's roadster bicycle, Bessie, as voxels (0.025 m): frame, steering front
// with wicker basket and bell, spoked wheels, the crate on the rear rack, and a
// finer (0.0125 m) brass headlamp. Coordinates follow BikeModel's local spaces so
// the parts drop straight into its groups.
import { Vox, tone, EMIT } from '../vox.js';
// (the wheels are smooth geometry now, built in BikeModel; bikeWheel stays for the voxel preview)

const S = 0.025;
const FRAME = 0x2f6e52, FRAME_HI = 0x4a9a72, CREAM = 0xeadfc4, CHROME = 0xc8ccd4, SADDLE = 0x6a3a1e, TIRE = 0x241e1c, RIM = 0xb4b8c0, BLACK = 0x1e1a1a, WICKER = 0xb98a48, WICKER_D = 0x8a5e2c, LEATHER = 0x4a2a1a;

// a voxel grid laid over a metre-space box; line/point helpers take metres
function grid(x0, x1, y0, y1, z0, z1, S = 0.025) {
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
  return { v, P, line, box, origin, S };
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
  // (the chainring, chain and cog are moving parts in BikeModel) a slim cream guard over the top run
  line([-0.1, BB[1] + 0.14, BB[2] - 0.02], [-0.1, rear[1] + 0.075, rear[2] + 0.1], CREAM, 0.55);
  line([-0.1, BB[1] + 0.14, BB[2] - 0.02], [-0.1, BB[1] + 0.1, BB[2] + 0.07], CREAM, 0.5);
  // bottom bracket shell, and the dropouts the axles bolt into
  for (let x = -0.05; x <= 0.05; x += 0.025) G.v.set(...G.P(x, BB[1], BB[2]), FRAME_HI);
  // a kickstand folded up along the chainstay
  line([0.06, BB[1] - 0.01, BB[2] - 0.1], [0.07, rear[1] - 0.03, rear[2] + 0.12], 0x3a3a40, 0.45);
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

// the wooden crate strapped to the rear rack (bike-local space; open top, the cups of cocoa ride in it)
export function bikeCrate() {
  const G = grid(-0.22, 0.22, 0.8, 1.05, -0.76, -0.36);
  const { v } = G;
  const WOOD = 0xa0703a, WOOD_D = 0x7a5228, POST = 0x5e3c1c, ROPE = 0xc8361f;
  const [x0, y0, z0] = G.P(-0.18, 0.81, -0.73).map(Math.round);
  const [x1, y1, z1] = G.P(0.18, 0.94, -0.39).map(Math.round);
  // floor, then plank walls with a gap between boards
  v.fill(x0, y0, z0, x1, y0, z1, WOOD_D);
  for (let y = y0 + 1; y <= y1; y++) {
    const band = (y - y0 - 1) % 3;
    if (band === 2 && y < y1) continue; // gap between planks
    const c = (x, z) => ((x * 7 + z * 3 + y) % 5 === 0 ? tone(WOOD, -0.08) : (y % 2 ? WOOD : tone(WOOD, 0.06)));
    for (let x = x0; x <= x1; x++) { v.set(x, y, z0, c(x, z0)); v.set(x, y, z1, c(x, z1)); }
    for (let z = z0; z <= z1; z++) { v.set(x0, y, z, c(x0, z)); v.set(x1, y, z, c(x1, z)); }
  }
  // corner posts poke up a voxel, a darker top rim
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) v.fill(x, y0, z, x, y1 + 1, z, POST);
  for (let x = x0; x <= x1; x++) { v.set(x, y1, z0, WOOD_D); v.set(x, y1, z1, WOOD_D); }
  for (let z = z0; z <= z1; z++) { v.set(x0, y1, z, WOOD_D); v.set(x1, y1, z, WOOD_D); }
  // a red bungee cord round the outside, because of course
  const zm = Math.round((z0 + z1) / 2);
  for (let y = y0 + 2; y <= y1; y++) { v.set(x0 - 1, y, zm, ROPE); v.set(x1 + 1, y, zm, ROPE); }
  for (let x = x0 - 1; x <= x1 + 1; x++) v.set(x, y0 + 2, z1 + 1, ROPE);
  // a stencilled maple leaf on the back board
  const lx = Math.round((x0 + x1) / 2), ly = y0 + 1;
  for (const [dx, dy] of [[0, 0], [0, 1], [0, 2], [-1, 1], [1, 1], [-2, 2], [2, 2], [-1, 3], [1, 3], [0, 3], [0, 4], [0, -1]]) v.set(lx + dx, ly + dy, z0 - 1, ROPE);
  return { vox: v, size: G.S, origin: G.origin };
}

// Harold's brass headlamp (steer-local space, finer voxels). part: 'body' | 'lit' | 'unlit'
export function bikeLamp(part = 'body') {
  const S = 0.0125;
  // bolted to the front of the wicker basket
  const G = grid(-0.07, 0.07, 0.22, 0.4, 0.29, 0.46, S);
  const { v, line } = G;
  const BRASS = 0xc8a050, BRASS_D = 0x8a6a2a, BRASS_HI = 0xf0d48a;
  const c = G.P(0, 0.3, 0.32).map(Math.round);
  const len = Math.round(0.1 / S);
  if (part === 'body') {
    // tapered brass can with a rolled rim, a highlight stripe and a little vent on top
    for (let t = 0; t < len; t++) {
      const r = 3.6 + (t / len) * 1.2;
      v.cylinder(c[0], c[1], c[2] + t, r, 1, (x, y) => (y > c[1] + r - 1.2 ? BRASS_HI : y < c[1] - r + 1.2 ? BRASS_D : BRASS), 'z');
    }
    v.cylinder(c[0], c[1], c[2] + len - 1, 5.2, 1, BRASS_D, 'z');
    v.fill(c[0] - 1, c[1] + 5, c[2] + 2, c[0] + 1, c[1] + 5, c[2] + 4, BRASS);
    v.fill(c[0] - 2, c[1] + 6, c[2] + 1, c[0] + 2, c[1] + 6, c[2] + 5, BRASS_D);
    // bracket back to the basket
    line([0, 0.3, 0.33], [0, 0.3, 0.295], 0x2a2420, 1);
    // carve the lens recess so the lens part sits flush
    v.carve((x, y, z) => z === c[2] + len - 1 && Math.hypot(x - c[0], y - c[1]) <= 4.1);
  } else {
    const lit = part === 'lit';
    v.cylinder(c[0], c[1], c[2] + len - 1, 4, 1, (x, y) => {
      const d = Math.hypot(x - c[0], y - c[1]);
      if (lit) return (d < 1.6 ? 0xfffbe8 : 0xffe9a0) | EMIT;
      return d < 1.6 ? 0xf4f0e0 : (x + y) % 3 === 0 ? 0xc8c4b8 : 0xdcd8c8;
    }, 'z');
  }
  return { vox: v, size: S, origin: G.origin };
}

export const PREVIEW = {
  frame: bikeFrame,
  front: bikeFront,
  wheel: () => bikeWheel(),
  crate: bikeCrate,
  lamp: () => bikeLamp('body'),
  lampLit: () => bikeLamp('lit'),
};
