// Tileable 64x64 pixel-art ground textures.
import { Pix, RNG, mix, shade } from './pixel.js';
import { hash2 } from '../core/noise.js';

const S = 64;

// tileable value noise with integer period
function tnoise(x, y, period, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const h = (a, b) => hash2(((a % period) + period) % period, ((b % period) + period) % period, seed);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function tfbm(x, y, seed) {
  // x,y in pixels of a 64 tile
  return (
    tnoise(x / 16, y / 16, 4, seed) * 0.5 +
    tnoise(x / 8, y / 8, 8, seed + 1) * 0.3 +
    tnoise(x / 4, y / 4, 16, seed + 2) * 0.2
  );
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => (BAYER[(x & 3) + (y & 3) * 4] + 0.5) / 16;

function bandFill(p, pal, seed, contrast = 1) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = tfbm(x, y, seed);
    v = 0.5 + (v - 0.5) * contrast;
    v += (bayer(x, y) - 0.5) * 0.18;
    const k = Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)));
    p.set(x, y, pal[k]);
  }
}

export const LEAF_COLORS = [0xc8361f, 0xe2622a, 0xf09a2e, 0xe8c143, 0x9e3b1b, 0xb84a22, 0xd47a2a];

function leaf(p, rng, x, y, col, size = 1) {
  const dark = shade(col, -0.35), light = shade(col, 0.25);
  if (size === 0) {
    p.set(x, y, col);
    p.set(x + 1, y, dark);
    return;
  }
  const dir = rng.int(0, 3);
  if (dir === 0) {
    p.hline(x, x + 2, y, col); p.hline(x + 1, x + 3, y + 1, col); p.set(x + 1, y + 2, dark);
    p.set(x + 1, y, light); p.set(x + 3, y + 1, dark);
  } else if (dir === 1) {
    p.vline(x, y, y + 2, col); p.vline(x + 1, y + 1, y + 3, col); p.set(x + 2, y + 1, dark);
    p.set(x, y, light); p.set(x + 1, y + 3, dark);
  } else if (dir === 2) {
    p.set(x + 1, y, col); p.hline(x, x + 2, y + 1, col); p.set(x + 1, y + 2, dark); p.set(x, y + 1, light); p.set(x + 1, y + 1, light);
  } else {
    p.hline(x, x + 3, y, col); p.hline(x + 1, x + 2, y + 1, dark); p.set(x, y, light);
  }
}

function pebble(p, rng, x, y, base, w = 2, h = 2) {
  p.rect(x, y, w, h, base);
  p.set(x, y, shade(base, 0.3));
  p.set(x + w, y + h - 1, shade(base, -0.5));
  p.set(x + w - 1, y + h, shade(base, -0.5));
}

export function grassTex(variant = 0) {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(11 + variant);
  const pal = variant === 1
    ? [0x3a3c1e, 0x4a4c22, 0x5e5e2a, 0x726e30] // shady forest grass
    : [0x484a22, 0x5a5c27, 0x6e6c2c, 0x868034];
  bandFill(p, pal, 3 + variant, 1.2);
  const tips = variant === 1 ? [0x84783a, 0x948638] : [0xa8903e, 0xbca04a, 0x9c8a3a, 0xccb058];
  const mids = variant === 1 ? [0x545628, 0x62622c] : [0x66682a, 0x76762e, 0x868234];
  for (let i = 0; i < 420; i++) {
    const x = rng.int(0, S - 1), y = rng.int(0, S - 1);
    const len = rng.int(2, 4);
    const slant = rng.pick([-1, 0, 0, 1]);
    for (let k = 0; k < len; k++) {
      const c = k === len - 1 ? rng.pick(tips) : rng.pick(mids);
      p.set(x + (k === len - 1 ? slant : 0), y - k, c);
    }
    p.set(x + 1, y, shade(pal[0], -0.2));
  }
  for (let i = 0; i < 12; i++) leaf(p, rng, rng.int(0, S), rng.int(0, S), rng.pick(LEAF_COLORS), rng.chance(0.5) ? 0 : 1);
  for (let i = 0; i < 6; i++) {
    const x = rng.int(0, S), y = rng.int(0, S);
    const c = rng.pick([0xf2ead0, 0xf5d860, 0xd9a0d8]);
    p.set(x, y, c); p.set(x + 1, y + 1, shade(c, -0.3));
  }
  return p;
}

export function dirtTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(21);
  bandFill(p, [0x48342a, 0x584032, 0x684c3a, 0x7a5c46], 7, 1.1);
  // compacted lighter streaks
  for (let i = 0; i < 40; i++) {
    const x = rng.int(0, S), y = rng.int(0, S), l = rng.int(3, 9);
    p.hline(x, x + l, y, rng.pick([0x8a6a4c, 0x806246]));
  }
  for (let i = 0; i < 70; i++) pebble(p, rng, rng.int(0, S), rng.int(0, S), rng.pick([0x9a8c78, 0x8a7d6b, 0xa89b84, 0x6f6458]), rng.int(1, 2), rng.int(1, 2));
  for (let i = 0; i < 10; i++) {
    const x = rng.int(0, S), y = rng.int(0, S);
    p.line(x, y, x + rng.int(-4, 4), y + rng.int(1, 3), 0x3b2516);
  }
  for (let i = 0; i < 8; i++) leaf(p, rng, rng.int(0, S), rng.int(0, S), rng.pick(LEAF_COLORS), 0);
  return p;
}

export function litterTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(31);
  bandFill(p, [0x2e1d14, 0x3a2418, 0x4a2e1c, 0x583822], 9, 1.0);
  for (let i = 0; i < 30; i++) {
    // pine needles
    const x = rng.int(0, S), y = rng.int(0, S), dx = rng.int(-3, 3), dy = rng.int(-3, 3);
    p.line(x, y, x + dx, y + dy, rng.pick([0x7a4a24, 0x8c5a2a, 0x5a3a1c]));
  }
  for (let i = 0; i < 230; i++) leaf(p, rng, rng.int(0, S), rng.int(0, S), rng.pick(LEAF_COLORS), rng.chance(0.25) ? 0 : 1);
  for (let i = 0; i < 6; i++) {
    const x = rng.int(0, S), y = rng.int(0, S);
    p.line(x, y, x + rng.int(4, 8), y + rng.int(-2, 2), 0x2a1a10);
  }
  return p;
}

export function rockTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(41);
  bandFill(p, [0x4b4846, 0x5d5a57, 0x716c66, 0x868077, 0x9a9388], 13, 1.4);
  // cracks
  for (let i = 0; i < 9; i++) {
    let x = rng.int(0, S), y = rng.int(0, S);
    const n = rng.int(6, 16);
    for (let k = 0; k < n; k++) {
      p.set(x, y, 0x2f2c2c);
      p.set(x + 1, y + 1, 0xa8a094);
      x += rng.int(-1, 1);
      y += rng.chance(0.7) ? 1 : 0;
    }
  }
  // lichen & moss
  for (let i = 0; i < 14; i++) {
    const x = rng.int(0, S), y = rng.int(0, S);
    const c = rng.pick([0xc9922f, 0xd6a840, 0x6b7a33, 0x7f8c3a, 0x5c6b2c]);
    p.ellipse(x, y, rng.range(1, 2.5), rng.range(1, 2), c);
    p.set(x, y - 1, shade(c, 0.25));
  }
  return p;
}

export function sandTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(51);
  bandFill(p, [0x9a8666, 0xa89474, 0xb6a280, 0xc2ae8a], 17, 1.0);
  // a few warm pebbles and pale shell bits (not too many: sand should read as smooth)
  for (let i = 0; i < 26; i++) pebble(p, rng, rng.int(0, S), rng.int(0, S), rng.pick([0x8c7c64, 0x9e8c70, 0x7e705c, 0xb0a084]), 1, 1);
  for (let i = 0; i < 10; i++) {
    const x = rng.int(0, S), y = rng.int(0, S);
    p.set(x, y, 0xf0e6d2); p.set(x + 1, y, 0xe0d4bc);
  }
  return p;
}

export function gravelTex() {
  const p = new Pix(S, S);
  p.wrap = true;
  const rng = new RNG(61);
  bandFill(p, [0x5d554c, 0x6c6359, 0x7a7065, 0x887d70], 19, 0.9);
  for (let i = 0; i < 260; i++) pebble(p, rng, rng.int(0, S), rng.int(0, S), rng.pick([0x9a9084, 0x8a8174, 0xaea595, 0x786e62, 0xb9ae9c]), 1, 1);
  for (let i = 0; i < 6; i++) leaf(p, rng, rng.int(0, S), rng.int(0, S), rng.pick(LEAF_COLORS), 0);
  return p;
}

export { mix };
