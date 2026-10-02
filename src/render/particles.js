// Pixel particles: falling leaves, dust, smoke, steam, sparks, rain, snow, fizz,
// hearts, coins, bones... plus cartoon effects: puffy outlined toon smoke that
// pops and breaks up in stepped frames, comic impact stars and speed bursts,
// splash crowns, glints and flat decals (ripples, skid marks). CPU-simulated,
// drawn as instanced camera-facing (or ground-flat) quads from one atlas.
import * as THREE from 'three';
import { Pix, RNG, shade } from '../art/pixel.js';
import { pixTexture } from './textures.js';
import { G, NOISE_GLSL } from './shaderlib.js';
import { LEAF_COLORS } from '../art/groundtex.js';

const CELL = 16, N = 8; // legacy 8x8 sheet of 16px sprites (painted, then doubled)
const C2 = 32, N2 = 16; // the real atlas: 16x16 cells of 32px
export const P = {
  leaf0: 0, leaf1: 1, leaf2: 2, leaf3: 3, needle: 4, maple: 5,
  dust: 8, puff: 9, smoke: 10, steam: 11, spark: 12, star: 13, glow: 14, mote: 15,
  rain: 16, snow: 17, drop: 18, bubble: 19, foam: 20, dirt: 21, chip: 22, ring: 23,
  heart: 24, coin: 25, note: 26, bone: 27, skull: 28, magic: 29, confetti: 30, frost: 31,
  flame: 32, ember: 33, feather: 34, splash: 35, zap: 36, cocoa: 37, cross: 38, cloud: 39,
  // cartoon effects
  toon: 40, impact: 41, burst: 42, crown: 43, glint: 44, chunk: 45, ripple: 46, sweat: 47, dizzy: 48, skid: 49, whoosh: 50, softDust: 51, softSmoke: 52, firefly: 53,
};

// the original 16px sprite sheet
function paintLegacy() {
  const p = new Pix(CELL * N, CELL * N);
  const rng = new RNG(9);
  const at = (i) => [(i % N) * CELL, Math.floor(i / N) * CELL];
  const c = (i) => {
    const [x, y] = at(i);
    return [x + 8, y + 8];
  };
  const W = 0xffffff;
  // leaves are white-ish value sprites tinted per particle
  const leafShape = (i, pts) => {
    const [x, y] = at(i);
    p.poly(pts.map(([a, b]) => [x + a, y + b]), 0xf0f0f0);
    p.line(x + pts[0][0], y + pts[0][1], x + 8, y + 9, 0xa8a8a8);
    p.outline(0x8a8a8a, { region: [x, y, CELL, CELL] });
  };
  leafShape(P.leaf0, [[8, 2], [12, 6], [11, 11], [8, 13], [5, 11], [4, 6]]);
  leafShape(P.leaf1, [[8, 3], [13, 8], [8, 13], [3, 8]]);
  leafShape(P.leaf2, [[4, 4], [12, 5], [12, 10], [6, 12]]);
  leafShape(P.leaf3, [[8, 2], [10, 6], [14, 6], [11, 9], [12, 13], [8, 11], [4, 13], [5, 9], [2, 6], [6, 6]]);
  {
    const [x, y] = at(P.needle);
    p.line(x + 4, y + 12, x + 12, y + 4, 0xd0d0d0);
  }
  leafShape(P.maple, [[8, 1], [9, 5], [12, 3], [11, 7], [15, 7], [12, 10], [13, 13], [9, 11], [8, 15], [7, 11], [3, 13], [4, 10], [1, 7], [5, 7], [4, 3], [7, 5]]);
  // soft round puffs (alpha encodes density for dithering)
  const puff = (i, r, col, lumpy) => {
    const [x, y] = at(i);
    for (let j = 0; j < CELL; j++) for (let k = 0; k < CELL; k++) {
      const d = Math.hypot(k + 0.5 - 8, j + 0.5 - 8) / r + (lumpy ? (rng.next() - 0.5) * 0.25 : 0);
      if (d > 1) continue;
      const a = Math.round((1 - d * d) * 255);
      const v = j < 7 ? shade(col, 0.15) : col;
      p.put(x + k, y + j, v, Math.max(8, a));
    }
  };
  puff(P.dust, 5, 0xc8a878, true);
  puff(P.puff, 7, 0xf0f0f0, true);
  puff(P.smoke, 7.5, 0xd8d8dc, true);
  puff(P.steam, 4, 0xffffff, false);
  puff(P.glow, 6, 0xffffff, false);
  puff(P.cloud, 7.8, 0xffffff, true);
  puff(P.foam, 4.5, 0xffffff, true);
  {
    const [x, y] = c(P.spark);
    p.put(x, y, W);
    p.put(x - 1, y, 0xffe0a0, 200);
    p.put(x + 1, y, 0xffe0a0, 200);
    p.put(x, y - 1, 0xffe0a0, 200);
    p.put(x, y + 1, 0xffe0a0, 200);
  }
  {
    const [x, y] = c(P.star);
    for (let k = -3; k <= 3; k++) { p.put(x + k, y, W, 255 - Math.abs(k) * 50); p.put(x, y + k, W, 255 - Math.abs(k) * 50); }
    p.put(x - 1, y - 1, W, 150); p.put(x + 1, y + 1, W, 150); p.put(x - 1, y + 1, W, 150); p.put(x + 1, y - 1, W, 150);
  }
  {
    const [x, y] = c(P.mote);
    p.put(x, y, W);
    p.put(x + 1, y, W, 120);
    p.put(x, y + 1, W, 120);
  }
  {
    const [x, y] = at(P.rain);
    for (let j = 1; j < 15; j++) p.put(x + 8, y + j, 0xd8e8ff, 120 + j * 8);
  }
  {
    const [x, y] = c(P.snow);
    p.put(x, y, W);
    for (const [a, b] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) p.put(x + a, y + b, W, 210);
    for (const [a, b] of [[-2, -2], [2, 2], [-2, 2], [2, -2]]) p.put(x + a, y + b, W, 120);
  }
  {
    const [x, y] = c(P.drop);
    p.rect(x - 1, y - 1, 2, 3, 0xc8e0ff);
    p.put(x - 1, y - 1, W);
  }
  {
    const [x, y] = c(P.bubble);
    p.ring(x, y, 3.5, 0xf0e0c8);
    p.put(x - 1, y - 2, W);
  }
  {
    const [x, y] = c(P.dirt);
    p.rect(x - 2, y - 1, 4, 3, 0x6a4a2e);
    p.put(x - 2, y - 1, 0x8a6a46);
  }
  {
    const [x, y] = c(P.chip);
    p.rect(x - 2, y, 5, 2, 0xd8b080);
    p.put(x + 2, y, 0xa87a48);
  }
  {
    const [x, y] = c(P.ring);
    p.ring(x, y, 7, W);
  }
  {
    const [x, y] = c(P.heart);
    p.rect(x - 4, y - 3, 3, 3, 0xe83a5a);
    p.rect(x + 1, y - 3, 3, 3, 0xe83a5a);
    p.rect(x - 4, y - 1, 8, 2, 0xe83a5a);
    p.rect(x - 3, y + 1, 6, 1, 0xe83a5a);
    p.rect(x - 2, y + 2, 4, 1, 0xe83a5a);
    p.rect(x - 1, y + 3, 2, 1, 0xe83a5a);
    p.put(x - 3, y - 2, 0xffa0b0);
    p.outline(0x6a1020, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.coin);
    p.circle(x, y, 4.5, 0xe8a820);
    p.circle(x, y, 3.5, 0xf8d050);
    p.vline(x, y - 2, y + 2, 0xb07818);
    p.put(x - 2, y - 2, 0xfff4b0);
    p.outline(0x6a4410, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.note);
    p.vline(x + 1, y - 5, y + 2, 0x2a1a2e);
    p.rect(x - 2, y + 1, 3, 3, 0x2a1a2e);
    p.hline(x + 1, x + 4, y - 5, 0x2a1a2e);
    p.put(x + 4, y - 4, 0x2a1a2e);
  }
  {
    const [x, y] = c(P.bone);
    p.rect(x - 4, y - 1, 8, 2, 0xf4eee0);
    p.rect(x - 6, y - 2, 2, 2, 0xf4eee0);
    p.rect(x - 6, y, 2, 2, 0xf4eee0);
    p.rect(x + 4, y - 2, 2, 2, 0xf4eee0);
    p.rect(x + 4, y, 2, 2, 0xf4eee0);
    p.outline(0x6a6050, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.skull);
    p.rect(x - 3, y - 3, 6, 5, 0xf4eee0);
    p.rect(x - 2, y + 2, 4, 2, 0xf4eee0);
    p.rect(x - 2, y - 1, 2, 2, 0x2a1a1e);
    p.rect(x + 1, y - 1, 2, 2, 0x2a1a1e);
    p.outline(0x6a6050, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.magic);
    for (let k = -4; k <= 4; k++) { p.put(x + k, y, 0xb0ffb0, 255 - Math.abs(k) * 40); p.put(x, y + k, 0xb0ffb0, 255 - Math.abs(k) * 40); }
    p.put(x, y, W);
  }
  {
    const [x, y] = c(P.confetti);
    p.rect(x - 2, y - 1, 4, 3, W);
  }
  {
    const [x, y] = c(P.frost);
    for (let k = -3; k <= 3; k++) { p.put(x + k, y, 0xd8f0ff); p.put(x, y + k, 0xd8f0ff); p.put(x + k, y + k, 0xa8d8f8, 180); p.put(x + k, y - k, 0xa8d8f8, 180); }
  }
  {
    const [x, y] = at(P.flame);
    p.ellipse(x + 8, y + 10, 4, 5.5, 0xff7a20);
    p.ellipse(x + 8, y + 7, 2.6, 4, 0xffb030);
    p.ellipse(x + 8, y + 10, 1.6, 2.6, 0xfff0a0);
    p.put(x + 8, y + 2, 0xffb030);
  }
  {
    const [x, y] = c(P.ember);
    p.rect(x - 1, y - 1, 2, 2, 0xffa040);
    p.put(x - 1, y - 1, 0xffe0a0);
  }
  {
    const [x, y] = c(P.feather);
    p.line(x - 4, y + 4, x + 4, y - 4, 0xd8d0c8);
    p.line(x - 3, y + 4, x + 4, y - 3, 0xf0e8e0);
    p.line(x - 4, y + 3, x + 3, y - 4, 0xf0e8e0);
  }
  {
    const [x, y] = c(P.splash);
    for (const [a, b] of [[-4, -3], [-2, -5], [0, -6], [2, -5], [4, -3], [-3, 0], [3, 0]]) p.rect(x + a, y + b, 2, 2, 0xe0f0ff);
  }
  {
    const [x, y] = c(P.zap);
    p.line(x - 2, y - 6, x + 1, y - 1, 0xfff080);
    p.line(x + 1, y - 1, x - 1, y + 1, 0xfff080);
    p.line(x - 1, y + 1, x + 2, y + 6, 0xfff080);
  }
  {
    const [x, y] = c(P.cocoa);
    p.rect(x - 3, y - 2, 6, 6, 0xf4ecdc);
    p.hline(x - 3, x + 2, y - 2, 0x6a3a1e);
    p.rect(x + 3, y - 1, 2, 3, 0xf4ecdc);
    p.outline(0x6a5a4a, { region: [x - 8, y - 8, 16, 16] });
  }
  {
    const [x, y] = c(P.cross);
    p.rect(x - 1, y - 4, 2, 8, W);
    p.rect(x - 4, y - 1, 8, 2, W);
  }
  return p;
}

// ---------------------------------------------------------------- cartoon sprites (32px cells)
const cxy = (c) => [(c % N2) * C2, Math.floor(c / N2) * C2];
export const CELLS = { toon: 48, glint: 72, chunk: 76, sweat: 77, dizzy: 78, skid: 79, ripple: 80, firefly: 84, impact: 96, burst: 102, whoosh: 106, crown: 128 };

// puffy cloud: union of bumps, banded light from the top left, dark outline.
// Frames pop in, swell, then break apart into wisps.
const PUFFS = [
  [[16, 18, 8], [10, 19, 6], [22, 19, 6.5], [13, 12, 6], [20, 12, 5.5]],
  [[16, 17, 9], [9, 20, 5.5], [23, 20, 6], [16, 10, 6]],
  [[15, 18, 7.5], [21, 16, 7], [11, 14, 6], [18, 11, 5], [9, 20, 5]],
];
function paintToon(p, rng) {
  const SC = [0.42, 0.74, 0.96, 1.0, 1.0, 0.9, 0.76, 0.56];
  const SPREAD = [1, 1, 1, 1.03, 1.1, 1.24, 1.42, 1.62];
  for (let v = 0; v < PUFFS.length; v++) {
    const holes = [];
    for (let k = 0; k < 4; k++) holes.push([rng.range(9, 23), rng.range(10, 22)]);
    for (let f = 0; f < 8; f++) {
      const [ox, oy] = cxy(CELLS.toon + v * 8 + f);
      const s = SC[f], sp = SPREAD[f];
      const blobs = PUFFS[v].map(([x, y, r], i) => [16 + (x - 16) * sp * (0.6 + 0.4 * s), 17 + (y - 17) * sp * (0.6 + 0.4 * s) - (f > 4 ? (f - 4) * 0.6 : 0), r * s * (f > 5 && i % 2 ? 0.75 : 1)]);
      const hs = f >= 4 ? holes.slice(0, f - 3).map(([x, y]) => [x, y, 2 + (f - 4) * 1.3]) : [];
      const inside = (x, y) => {
        let a = false;
        for (const [bx, by, r] of blobs) if ((x - bx) ** 2 + (y - by) ** 2 <= r * r) { a = true; break; }
        if (!a) return false;
        for (const [hx, hy, r] of hs) if ((x - hx) ** 2 + (y - hy) ** 2 <= r * r) return false;
        return true;
      };
      const sh = Math.max(1, Math.round(2.6 * s));
      for (let y = 0; y < C2; y++) for (let x = 0; x < C2; x++) {
        const px = x + 0.5, py = y + 0.5;
        if (inside(px, py)) {
          const hi = !inside(px - sh, py - sh), lo = !inside(px + sh, py + sh);
          p.put(ox + x, oy + y, hi && !lo ? 0xffffff : lo && !hi ? 0xa8a0bc : 0xe2dee8);
        }
      }
      p.outline(0x463e52, { region: [ox, oy, C2, C2] });
    }
  }
}

function paintImpact(p, rng) {
  for (let f = 0; f < 3; f++) {
    const [ox, oy] = cxy(CELLS.impact + f * 2);
    const cx = ox + 32, cy = oy + 32;
    const s = [0.55, 1.0, 1.06][f];
    const n = 9;
    const jit = Array.from({ length: n * 2 }, () => [rng.range(-0.08, 0.08), rng.range(0.82, 1.0)]);
    const star = (k) => Array.from({ length: n * 2 }, (_, i) => {
      const a = (i / (n * 2)) * Math.PI * 2 + jit[i][0] - Math.PI / 2;
      const r = (i % 2 ? 12.5 : 30 * jit[i][1]) * s * k;
      return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    });
    p.poly(star(1), 0xf05a26);
    p.poly(star(0.74), 0xffcc30);
    p.poly(star(0.46), 0xfff8e6);
    if (f === 2) for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) if (x * x + y * y < 64) p.put(cx + x, cy + y, 0, 0);
    p.outline(0x2a1418, { region: [ox, oy, 64, 64] });
  }
}

function paintBurst(p, rng) {
  for (let f = 0; f < 2; f++) {
    const [ox, oy] = cxy(CELLS.burst + f * 2);
    const cx = ox + 32, cy = oy + 32;
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rng.range(-0.12, 0.12);
      const r0 = (f ? 20 : 15) + rng.range(0, 4), r1 = (f ? 31 : 27) - rng.range(0, 3);
      const w = f ? 1.6 : 2.4;
      const ca = Math.cos(a), sa = Math.sin(a), na = -sa, nb = ca;
      const rm = r0 + (r1 - r0) * 0.35;
      p.poly([[cx + ca * r0, cy + sa * r0], [cx + ca * rm + na * w, cy + sa * rm + nb * w], [cx + ca * r1, cy + sa * r1], [cx + ca * rm - na * w, cy + sa * rm - nb * w]], 0xfff6e0);
    }
    p.outline(0x2a1a20, { region: [ox, oy, 64, 64] });
  }
}

function paintWhoosh(p) {
  for (let f = 0; f < 3; f++) {
    const [ox, oy] = cxy(CELLS.whoosh + f * 2);
    const cx = ox + 32, cy = oy + 32;
    for (const [r, a0, a1, w] of [[26, 0.2, 2.6, 2.6], [19, 0.6, 2.9, 2], [12, 1.0, 3.0, 1.6]]) {
      const span = [0.45, 1, 0.8][f];
      const st = a0 + (f === 2 ? (a1 - a0) * 0.45 : 0);
      for (let a = st; a < a0 + (a1 - a0) * span; a += 0.02) {
        const k = (a - st) / ((a1 - a0) * span);
        const ww = w * Math.sin(Math.min(1, k) * Math.PI) + 0.4;
        for (let t = -ww; t <= ww; t += 0.5) p.put(Math.round(cx + Math.cos(a) * (r + t)), Math.round(cy + Math.sin(a) * (r + t)), 0xfff6e8);
      }
    }
    p.outline(0x2a2030, { region: [ox, oy, 64, 64] });
  }
}

function paintCrown(p, rng) {
  const spikes = Array.from({ length: 7 }, (_, i) => [((i + 0.5) / 7) * 44 + 10 + rng.range(-1.5, 1.5), rng.range(0.75, 1.1)]);
  for (let f = 0; f < 4; f++) {
    const [ox, oy] = cxy(CELLS.crown + f * 2);
    const base = oy + 56;
    const H = [8, 20, 12, 0][f];
    const W = [16, 20, 22, 25][f];
    // water body
    p.ellipse(ox + 32, base, W, f === 3 ? 6 : 5, 0x8ac8ec);
    p.ellipse(ox + 32, base - 1, W - 3, 3, 0xc8ecff);
    if (f === 3) for (let y = -3; y <= 2; y++) for (let x = -(W - 7); x <= W - 7; x++) if ((x / (W - 7)) ** 2 + (y / 2.6) ** 2 < 1) p.put(ox + 32 + x, base - 1 + y, 0, 0);
    // crown spikes
    if (H > 0) for (const [sx, k] of spikes) {
      const x = ox + 32 + (sx - 32) * (W / 22);
      const h = H * k;
      p.poly([[x - 3, base - 2], [x + 3, base - 2], [x + 0.8, base - 2 - h], [x - 0.8, base - 2 - h]], 0xc8ecff);
      p.line(x - 1, base - 3, x - 0.5, base - 1 - h, 0xffffff);
      // droplets flying off the tips
      const dy = f === 1 ? 4 : f === 2 ? 10 : 0;
      if (f >= 1) p.circle(x + (sx - 32) * 0.08 * f, base - h - dy - 3, f === 2 ? 1.6 : 2, 0xe8f8ff);
    }
    if (f === 3) for (let k = 0; k < 5; k++) p.circle(ox + rng.range(14, 50), base - rng.range(5, 12), 1.4, 0xe8f8ff);
    p.outline(0x1e3a5a, { region: [ox, oy, 64, 64] });
  }
}

function paintSmallFx(p) {
  // glint twinkle
  for (let f = 0; f < 4; f++) {
    const [ox, oy] = cxy(CELLS.glint + f);
    const cx = ox + 16, cy = oy + 16;
    const L = [1, 4, 10, 5][f];
    for (let k = -L; k <= L; k++) {
      const c = Math.abs(k) < 2 ? 0xffffff : 0xfff0a8;
      p.put(cx + k, cy, c); p.put(cx, cy + k, c);
      if (L > 2 && Math.abs(k) < L - 2) { p.put(cx + k, cy - 1 + (k === 0 ? 0 : 1) * 0, c); }
    }
    if (f === 2) for (let k = -3; k <= 3; k++) { p.put(cx + k, cy + k, 0xfff0a8); p.put(cx + k, cy - k, 0xfff0a8); }
    p.rect(cx - 1, cy - 1, 2, 2, 0xffffff);
  }
  {
    const [ox, oy] = cxy(CELLS.chunk);
    p.rect(ox + 11, oy + 11, 10, 10, 0xd0d0d0);
    p.rect(ox + 11, oy + 11, 10, 2, 0xffffff);
    p.rect(ox + 11, oy + 13, 2, 8, 0xf0f0f0);
    p.rect(ox + 11, oy + 19, 10, 2, 0x9a9a9a);
    p.rect(ox + 19, oy + 11, 2, 10, 0xa8a8a8);
    p.outline(0x3a3438, { region: [ox, oy, C2, C2] });
  }
  {
    const [ox, oy] = cxy(CELLS.sweat);
    const cx = ox + 16;
    p.poly([[cx, oy + 6], [cx + 5, oy + 16], [cx - 5, oy + 16]], 0x8ad0ff);
    p.ellipse(cx, oy + 18, 5.5, 5, 0x8ad0ff);
    p.ellipse(cx + 1, oy + 19, 3, 2.6, 0x5aa8e8);
    p.rect(cx - 3, oy + 14, 2, 3, 0xffffff);
    p.outline(0x1e3a5a, { region: [ox, oy, C2, C2] });
  }
  {
    const [ox, oy] = cxy(CELLS.dizzy);
    const cx = ox + 16, cy = oy + 16;
    const pts = Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 4.5 : 11; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
    p.poly(pts, 0xffd23a);
    p.poly(pts.map(([x, y]) => [cx + (x - cx) * 0.55 - 1, cy + (y - cy) * 0.55 - 1]), 0xfff4b0);
    p.outline(0x3a2410, { region: [ox, oy, C2, C2] });
  }
  {
    const [ox, oy] = cxy(CELLS.skid);
    for (let y = 0; y < C2; y++) for (let x = 9; x < 23; x++) {
      const e = Math.min(x - 9, 22 - x);
      if (e < 2 && (x + y) % 2) continue;
      p.put(ox + x, oy + y, (x + Math.floor(y / 3)) % 5 === 0 ? 0x5a5a5a : 0x404040);
    }
  }
  {
    // firefly: a bright core with a soft halo
    const [ox, oy] = cxy(CELLS.firefly);
    for (let y = 0; y < C2; y++) for (let x = 0; x < C2; x++) {
      const d = Math.hypot(x + 0.5 - 16, y + 0.5 - 16);
      if (d < 3) p.put(ox + x, oy + y, 0xffffff);
      else if (d < 5) p.put(ox + x, oy + y, 0xe0ffa0);
      else if (d < 11) p.put(ox + x, oy + y, 0xb0ff60, Math.round(150 * (1 - (d - 5) / 6)) + 20);
    }
  }
  for (let f = 0; f < 4; f++) {
    const [ox, oy] = cxy(CELLS.ripple + f);
    p.ring(ox + 16, oy + 16, [6, 10, 13, 15][f], 0xffffff, f < 2 ? 2 : 1);
  }
}

// sprite table: id -> { cell, span (cells), frames, toon, flat }
const SPR = [];
for (let i = 0; i < 40; i++) SPR[i] = { cell: i, span: 1, frames: 1 };
const toonSpr = { cell: CELLS.toon, span: 1, frames: 8, toon: true, variants: 3 };
SPR[P.smoke] = toonSpr;
SPR[P.puff] = toonSpr;
SPR[P.dust] = toonSpr;
SPR[P.cloud] = toonSpr;
SPR[P.toon] = toonSpr;
SPR[P.impact] = { cell: CELLS.impact, span: 2, frames: 3, toon: true };
SPR[P.burst] = { cell: CELLS.burst, span: 2, frames: 2, toon: true };
SPR[P.whoosh] = { cell: CELLS.whoosh, span: 2, frames: 3, toon: true };
SPR[P.crown] = { cell: CELLS.crown, span: 2, frames: 4, toon: true };
SPR[P.glint] = { cell: CELLS.glint, span: 1, frames: 4, toon: true, pingpong: true };
SPR[P.chunk] = { cell: CELLS.chunk, span: 1, frames: 1 };
SPR[P.sweat] = { cell: CELLS.sweat, span: 1, frames: 1 };
SPR[P.dizzy] = { cell: CELLS.dizzy, span: 1, frames: 1 };
SPR[P.skid] = { cell: CELLS.skid, span: 1, frames: 1, flat: true };
SPR[P.ripple] = { cell: CELLS.ripple, span: 1, frames: 4, flat: true };
SPR[P.firefly] = { cell: CELLS.firefly, span: 1, frames: 1 };
SPR[P.softDust] = { cell: P.dust, span: 1, frames: 1 };
SPR[P.softSmoke] = { cell: P.smoke, span: 1, frames: 1 };
// smallest on-screen size (px) so tiny far-off sprites still read as a dot
const MIN_PX = { [P.mote]: 16, [P.spark]: 12, [P.ember]: 12, [P.glow]: 7, [P.star]: 7, [P.snow]: 8, [P.drop]: 7, [P.magic]: 8, [P.frost]: 7, [P.dirt]: 6, [P.chip]: 6, [P.chunk]: 6, [P.confetti]: 6, [P.rain]: 3, [P.glint]: 8, [P.firefly]: 9 };
for (let i = 0; i < SPR.length; i++) if (SPR[i]) SPR[i].minPx = MIN_PX[i] ?? 2;

export function paintAtlas() {
  const legacy = paintLegacy();
  const p = new Pix(C2 * N2, C2 * N2);
  // legacy 16px sprites, doubled into the first 40 cells
  for (let i = 0; i < 40; i++) {
    const sx = (i % N) * CELL, sy = Math.floor(i / N) * CELL;
    const [dx, dy] = cxy(i);
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
      const k = ((sy + y) * legacy.w + sx + x) * 4;
      const a = legacy.data[k + 3];
      if (!a) continue;
      const c = (legacy.data[k] << 16) | (legacy.data[k + 1] << 8) | legacy.data[k + 2];
      for (let j = 0; j < 2; j++) for (let q = 0; q < 2; q++) p.put(dx + x * 2 + q, dy + y * 2 + j, c, a);
    }
  }
  const rng = new RNG(77);
  paintToon(p, rng);
  paintImpact(p, rng);
  paintBurst(p, rng);
  paintWhoosh(p);
  paintCrown(p, rng);
  paintSmallFx(p);
  return p;
}

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iData;   // size(m), cell, alpha, rotation/flip phase
attribute vec4 iColor;  // rgb tint, emissive
attribute vec4 iExtra;  // span (cells), flat (0/1), length stretch, min pixel size
uniform float uPxScale; // pixels per metre at distance 1
varying vec4 vColor;
varying vec2 vUv;
varying vec2 vCell;
varying float vSpan;
varying float vAlpha;
varying float vPhase;
varying float vFlat;
void main() {
  float size = iData.x;
  vec2 corner = position.xy; // -0.5..0.5
  vec4 mv;
  if (iExtra.y > 0.5) {
    // flat on the ground / water, rotated by the phase (yaw), optionally stretched
    float c = cos(iData.w), s = sin(iData.w);
    vec2 q = vec2(corner.x, corner.y * iExtra.z) * size;
    vec3 wp = iPos + vec3(q.x * c + q.y * s, 0.0, -q.x * s + q.y * c);
    mv = viewMatrix * vec4(wp, 1.0);
  } else {
    mv = viewMatrix * vec4(iPos, 1.0);
    float px = size * uPxScale / max(0.1, -mv.z);
    size *= max(1.0, iExtra.w / max(px, 0.01));
    mv.xy += vec2(corner.x, corner.y * iExtra.z) * size;
  }
  gl_Position = projectionMatrix * mv;
  vColor = iColor;
  vUv = vec2(corner.x, -corner.y);
  vCell = vec2(mod(iData.y, ${N2}.0), floor(iData.y / ${N2}.0));
  vSpan = iExtra.x;
  // fade out right in front of the lens so stray leaves don't blot the screen
  vAlpha = iData.z * smoothstep(0.9, 2.6, -mv.z);
  vPhase = iExtra.y > 0.5 ? 0.0 : iData.w;
  vFlat = iExtra.y;
}
`;

const FRAG = /* glsl */ `
${NOISE_GLSL}
uniform sampler2D tAtlas;
uniform vec3 uSunColor;
uniform vec3 uSkyAmb;
varying vec4 vColor;
varying vec2 vUv;
varying vec2 vCell;
varying float vSpan;
varying float vAlpha;
varying float vPhase;
varying float vFlat;
void main() {
  vec2 pc = vUv;
  // tumble: squash horizontally with the flip phase, rotate in 90 degree steps
  float flip = cos(vPhase);
  if (abs(flip) < 0.999) {
    pc.x /= max(0.18, abs(flip));
    if (abs(pc.x) > 0.5) discard;
  }
  float q = mod(floor(vPhase * 0.5), 4.0);
  if (q == 1.0) pc = vec2(-pc.y, pc.x);
  else if (q == 2.0) pc = -pc;
  else if (q == 3.0) pc = vec2(pc.y, -pc.x);
  vec2 uv = (vCell + (pc + 0.5) * vSpan) / ${N2}.0;
  vec4 tx = texture2D(tAtlas, uv);
  float a = tx.a * vAlpha;
  if (a < bayer4(gl_FragCoord.xy) * 0.98 + 0.01) discard;
  vec3 col = tx.rgb * vColor.rgb;
  // lit particles take the scene light, emissive ones glow
  vec3 lit = col * (uSkyAmb * 1.2 + uSunColor * 0.55);
  col = mix(lit, col * (1.0 + vColor.a * 2.0), clamp(vColor.a, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Particles {
  constructor(max = 4000) {
    this.max = max;
    this.count = 0;
    this.p = [];
    for (let i = 0; i < max; i++) this.p.push({ alive: false });
    this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute('position', base.attributes.position);
    this.aPos = new Float32Array(max * 3);
    this.aData = new Float32Array(max * 4);
    this.aColor = new Float32Array(max * 4);
    this.aExtra = new Float32Array(max * 4);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.aPos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iData', new THREE.InstancedBufferAttribute(this.aData, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.aColor, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iExtra', new THREE.InstancedBufferAttribute(this.aExtra, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.geo = g;
    this.uniforms = {
      tAtlas: { value: pixTexture(paintAtlas(), { repeat: false, mips: false }) },
      uSunColor: G.uSunColor,
      uSkyAmb: G.uSkyAmb,
      uPxScale: { value: 400 },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG });
    this.points = new THREE.Mesh(g, this.mat); // (kept the old name: it's what effects add to the scene)
    this.points.frustumCulled = false;
    this.points.layers.set(1);
    this.points.renderOrder = 10;
    this.rng = new RNG(1234);
    this.ground = null; // (x, z) => height
    this.wind = new THREE.Vector2();
  }

  // spawn: {x,y,z, vx,vy,vz, life, size, size1, sprite, color:[r,g,b] or hex, emissive, gravity, drag, spin,
  //   flutter, wind, alpha, fadeIn, ground, rest, blink, phase, flat, stretch, fps, variant}
  spawn(o) {
    if (!this.free.length) return null;
    const i = this.free.pop();
    const q = this.p[i];
    q.alive = true;
    q.x = o.x; q.y = o.y; q.z = o.z;
    q.vx = o.vx || 0; q.vy = o.vy || 0; q.vz = o.vz || 0;
    q.life = 0;
    q.max = o.life ?? 2;
    q.size = o.size ?? 0.2;
    q.size1 = o.size1 ?? q.size;
    q.sprite = o.sprite ?? P.dust;
    const S = SPR[q.sprite] || SPR[0];
    q.cell = S.cell + (S.variants ? (o.variant ?? Math.floor(this.rng.next() * S.variants)) * S.frames : 0);
    q.frames = S.frames;
    q.span = S.span;
    q.toon = !!S.toon;
    q.pingpong = !!S.pingpong;
    q.flat = o.flat ?? !!S.flat;
    q.stretch = o.stretch ?? 1;
    q.fps = o.fps ?? 0;
    q.minPx = S.minPx;
    const col = o.color ?? 0xffffff;
    if (Array.isArray(col)) { q.r = col[0]; q.g = col[1]; q.b = col[2]; }
    else { const c = new THREE.Color(col); q.r = c.r; q.g = c.g; q.b = c.b; }
    q.em = o.emissive ?? 0;
    q.grav = o.gravity ?? 0;
    q.drag = o.drag ?? 0.5;
    q.spin = o.spin ?? 0;
    q.phase = o.phase ?? (q.toon && !q.flat ? 0 : this.rng.range(0, 6.28));
    q.flutter = o.flutter ?? 0;
    q.windK = o.wind ?? 0;
    q.alpha0 = o.alpha ?? 1;
    q.fadeIn = o.fadeIn ?? 0.05;
    q.groundHit = o.ground ?? false;
    q.rest = o.rest ?? 0;
    q.resting = false;
    q.blink = o.blink ?? 0;
    q.seed = o.seed ?? this.rng.next();
    return q;
  }

  burst(n, fn) {
    for (let k = 0; k < n; k++) this.spawn(fn(k, this.rng));
  }

  update(dt) {
    let n = 0;
    const wx = this.wind.x, wz = this.wind.y;
    for (let i = 0; i < this.max; i++) {
      const q = this.p[i];
      if (!q.alive) continue;
      q.life += dt;
      if (q.life >= q.max) {
        q.alive = false;
        this.free.push(i);
        continue;
      }
      if (!q.resting) {
        q.vy -= q.grav * dt;
        const d = Math.exp(-q.drag * dt);
        q.vx = q.vx * d + wx * q.windK * dt;
        q.vz = q.vz * d + wz * q.windK * dt;
        q.vy *= q.grav > 0 ? 1 : d;
        let fx = 0, fz = 0;
        if (q.flutter) {
          const t = q.life * 2.3 + q.seed * 10;
          fx = Math.sin(t) * q.flutter;
          fz = Math.cos(t * 0.7) * q.flutter;
        }
        q.x += (q.vx + fx) * dt;
        q.y += q.vy * dt;
        q.z += (q.vz + fz) * dt;
        q.phase += q.spin * dt;
        if (q.groundHit && this.ground) {
          const h = this.ground(q.x, q.z) + 0.03;
          if (q.y < h) {
            q.y = h;
            if (q.rest > 0) {
              q.resting = true;
              q.max = Math.min(q.max, q.life + q.rest);
              q.phase = Math.round(q.phase / Math.PI) * Math.PI + 0.001;
            } else {
              q.vy = -q.vy * 0.35;
              q.vx *= 0.6;
              q.vz *= 0.6;
            }
          }
        }
      }
      const t = q.life / q.max;
      let a = q.alpha0;
      if (q.life < q.fadeIn) a *= q.life / q.fadeIn;
      // toon sprites dissipate through their frames; the rest fade out
      if (!q.toon && t > 0.7) a *= 1 - (t - 0.7) / 0.3;
      if (q.blink) a *= 0.5 + 0.5 * Math.sin(q.life * q.blink + q.seed * 20);
      let frame = 0;
      if (q.frames > 1) {
        if (q.fps) frame = Math.floor(q.life * q.fps) % q.frames;
        else if (q.pingpong) { const k = Math.floor(t * (q.frames * 2 - 1)); frame = k < q.frames ? k : q.frames * 2 - 2 - k; }
        else frame = Math.min(q.frames - 1, Math.floor(t * q.frames));
      }
      const size = q.size + (q.size1 - q.size) * t;
      this.aPos[n * 3] = q.x;
      this.aPos[n * 3 + 1] = q.y;
      this.aPos[n * 3 + 2] = q.z;
      this.aData[n * 4] = size;
      this.aData[n * 4 + 1] = q.cell + frame * q.span;
      this.aData[n * 4 + 2] = a;
      this.aData[n * 4 + 3] = q.phase;
      this.aColor[n * 4] = q.r;
      this.aColor[n * 4 + 1] = q.g;
      this.aColor[n * 4 + 2] = q.b;
      this.aColor[n * 4 + 3] = q.em;
      this.aExtra[n * 4] = q.span;
      this.aExtra[n * 4 + 1] = q.flat ? 1 : 0;
      this.aExtra[n * 4 + 2] = q.stretch;
      this.aExtra[n * 4 + 3] = q.minPx;
      n++;
    }
    this.count = n;
    this.geo.instanceCount = n;
    for (const k of ['iPos', 'iData', 'iColor', 'iExtra']) {
      const attr = this.geo.attributes[k];
      attr.clearUpdateRanges();
      attr.addUpdateRange(0, n * attr.itemSize);
      attr.needsUpdate = true;
    }
  }

  // camera-dependent scale (pixels per metre at distance 1), for the minimum dot size
  setViewport(heightPx, fovDeg) {
    this.uniforms.uPxScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }
}

export function leafColor(rng) {
  return rng.pick(LEAF_COLORS);
}
