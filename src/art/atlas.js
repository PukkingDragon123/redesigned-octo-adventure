// World texture atlas for buildings & props. Tiles register into builder.TILES.
// Alpha: 255 = solid, ~200 = glass (glows warm at night on window quads), 0 = cut-out.
import { Pix, RNG, shade, mix } from './pixel.js';
import { TILES, TILE_DENSITY } from '../render/builder.js';
import { drawText, textWidth } from './font.js';
import { LEAF_COLORS } from './groundtex.js';

const SIZE = 1024;
const rectRaw = (p, x, y, w, h, c, a) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) p.put(x + i, y + j, c, a); };
const GLASS = 200;

export const SIDING = {
  red: [0xb03e2a, 0x8a2c1e],
  teal: [0x3a8478, 0x286458],
  blue: [0x6a88aa, 0x4e6a8c],
  yellow: [0xe2b850, 0xb88c30],
  white: [0xece6d8, 0xc4bcae],
  green: [0x5e8c4c, 0x426c36],
  weathered: [0x8e7c68, 0x6a5a4a],
};

class TileAtlas {
  constructor() {
    this.pix = new Pix(SIZE, SIZE);
    this.x = 0;
    this.y = 0;
    this.rowH = 0;
    this.rng = new RNG(4321);
  }
  add(name, w, h, paint) {
    if (this.x + w > SIZE) {
      this.x = 0;
      this.y += this.rowH;
      this.rowH = 0;
    }
    const x = this.x, y = this.y;
    paint(this.pix, x, y, w, h, this.rng);
    // v is flipped so face-bottom (v=0) samples the tile's bottom row
    TILES[name] = [x / SIZE, (y + h) / SIZE, w / SIZE, -h / SIZE];
    // keep tiles on even texels so 2x-painted tiles downsample cleanly into mip 1
    this.x += w + (w & 1);
    this.rowH = Math.max(this.rowH, h + (h & 1));
  }
}

function siding(p, x, y, w, h, rng, [base, dark]) {
  const bh = 4;
  for (let row = 0; row < h / bh; row++) {
    const tint = rng.range(-0.05, 0.05);
    const c = tint > 0 ? shade(base, tint) : shade(base, tint);
    for (let i = 0; i < w; i++) {
      p.set(x + i, y + row * bh, shade(c, 0.12));
      p.set(x + i, y + row * bh + 1, c);
      p.set(x + i, y + row * bh + 2, c);
      p.set(x + i, y + row * bh + 3, dark);
    }
    // worn paint & nails
    for (let k = 0; k < 3; k++) if (rng.chance(0.5)) p.set(x + rng.int(0, w - 1), y + row * bh + rng.int(1, 2), shade(c, rng.chance(0.5) ? 0.2 : -0.15));
    if (rng.chance(0.3)) p.set(x + rng.int(0, w - 1), y + row * bh + 1, shade(dark, -0.3));
  }
}

function logs(p, x, y, w, h, rng) {
  const lh = 8;
  const cols = [0x9a6a3a, 0x8a5c30, 0xa8743e];
  for (let row = 0; row < h / lh; row++) {
    const base = rng.pick(cols);
    for (let j = 0; j < lh; j++) {
      const t = j / (lh - 1);
      let c = t < 0.15 ? shade(base, 0.22) : t < 0.5 ? shade(base, 0.06) : t < 0.85 ? base : shade(base, -0.35);
      for (let i = 0; i < w; i++) p.set(x + i, y + row * lh + j, c);
    }
    // bark streaks
    for (let k = 0; k < 10; k++) {
      const sx = x + rng.int(0, w - 6), sy = y + row * lh + rng.int(2, 5);
      p.hline(sx, sx + rng.int(2, 6), sy, shade(base, -0.18));
    }
    // chinking between logs
    p.hline(x, x + w - 1, y + row * lh + lh - 1, 0xd8c8a8);
  }
}

function shakes(p, x, y, w, h, rng, base = 0x8a7a66) {
  const rh = 8;
  for (let row = 0; row < h / rh; row++) {
    let cx = x - (row % 2) * 4;
    while (cx < x + w) {
      const sw = rng.int(5, 9);
      const c = shade(base, rng.range(-0.12, 0.1));
      for (let j = 0; j < rh; j++) for (let i = 0; i < sw; i++) {
        const px = cx + i;
        if (px < x || px >= x + w) continue;
        let cc = c;
        if (j === rh - 1) cc = shade(c, -0.4);
        else if (i === sw - 1) cc = shade(c, -0.25);
        else if (j === 0) cc = shade(c, 0.12);
        p.set(px, y + row * rh + j, cc);
      }
      cx += sw;
    }
  }
}

function boardBatten(p, x, y, w, h, rng, base = 0x8a3a26) {
  for (let i = 0; i < w; i++) {
    const b = Math.floor(i / 8);
    const c = shade(base, ((b * 37) % 7) / 60 - 0.05);
    for (let j = 0; j < h; j++) {
      let cc = c;
      if (i % 8 === 0) cc = shade(base, -0.4);
      else if (i % 8 === 1) cc = shade(base, 0.15);
      p.set(x + i, y + j, cc);
    }
  }
  for (let k = 0; k < 30; k++) p.set(x + rng.int(0, w - 1), y + rng.int(0, h - 1), shade(base, rng.range(-0.2, 0.2)));
}

function stone(p, x, y, w, h, rng) {
  p.rect(x, y, w, h, 0x5a524a);
  for (let k = 0; k < 40; k++) {
    const cx = x + rng.int(0, w), cy = y + rng.int(0, h);
    const rx = rng.range(3, 7), ry = rng.range(2.5, 5);
    const c = rng.pick([0x8a8278, 0x9a9084, 0x7a7068, 0xa8a090, 0x8a7a6a]);
    for (let j = -Math.ceil(ry); j <= Math.ceil(ry); j++) for (let i = -Math.ceil(rx); i <= Math.ceil(rx); i++) {
      if ((i * i) / (rx * rx) + (j * j) / (ry * ry) > 1) continue;
      const px = x + ((cx - x + i + w) % w), py = y + ((cy - y + j + h) % h);
      let cc = c;
      if (j < -ry * 0.4) cc = shade(c, 0.15);
      else if (j > ry * 0.5) cc = shade(c, -0.25);
      p.set(px, py, cc);
    }
  }
}

function roofShingles(p, x, y, w, h, rng, base, moss = 0) {
  const rh = 6;
  for (let row = 0; row < h / rh; row++) {
    let cx = x - (row % 2) * 5;
    while (cx < x + w) {
      const sw = rng.int(7, 11);
      const c = shade(base, rng.range(-0.1, 0.08));
      for (let j = 0; j < rh; j++) for (let i = 0; i < sw; i++) {
        const px = cx + i;
        if (px < x || px >= x + w) continue;
        let cc = c;
        if (j === rh - 1) cc = shade(c, -0.45);
        else if (i === 0) cc = shade(c, -0.2);
        else if (j === 0) cc = shade(c, 0.1);
        p.set(px, y + row * rh + j, cc);
      }
      cx += sw;
    }
  }
  if (moss) for (let k = 0; k < 24 * moss; k++) {
    const cx = x + rng.int(2, w - 3), cy = y + rng.int(2, h - 3);
    p.ellipse(cx, cy, rng.range(1, 3), rng.range(1, 2), rng.pick([0x5a7a32, 0x6a8a3a, 0x4a6a2a]));
  }
}

function corrugated(p, x, y, w, h, rng, base = 0x8a6a5a) {
  for (let i = 0; i < w; i++) {
    const k = i % 6;
    const c = k < 2 ? shade(base, 0.2) : k < 4 ? base : shade(base, -0.3);
    for (let j = 0; j < h; j++) p.set(x + i, y + j, c);
  }
  for (let k = 0; k < 14; k++) p.ellipse(x + rng.int(0, w), y + rng.int(0, h), rng.range(2, 6), rng.range(2, 5), rng.pick([0xa0502a, 0x8a4020, 0xb86a3a]));
  for (let j = 0; j < h; j += 16) p.hline(x, x + w - 1, y + j, shade(base, -0.4));
}

function windowTile(p, x, y, w, h, rng, { curtain = 0xc8402a, frame = 0xf4f0e6 } = {}) {
  p.rect(x, y, w, h, frame);
  // glass panes
  const gx = x + 3, gy = y + 3, gw = w - 6, gh = h - 7;
  for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
    const t = (i + (gh - j)) / (gw + gh);
    let c = mix(0x2a3a5a, 0x5a7aa0, t);
    if (Math.abs(i - j * 0.8 - 2) < 1.5 || Math.abs(i - j * 0.8 - 7) < 0.8) c = 0xa8c0d8;
    p.put(gx + i, gy + j, c, GLASS);
  }
  // curtains (inside)
  for (let j = 0; j < gh; j++) {
    const cw = 3 + Math.round(Math.sin(j * 0.5) * 0.6);
    for (let i = 0; i < cw; i++) {
      p.put(gx + i, gy + j, shade(curtain, (i % 2) * -0.15), GLASS);
      p.put(gx + gw - 1 - i, gy + j, shade(curtain, (i % 2) * -0.15), GLASS);
    }
  }
  // mullions
  p.rect(x + Math.floor(w / 2) - 1, y + 2, 2, h - 5, frame);
  p.rect(x + 2, y + Math.floor(h / 2) - 2, w - 4, 2, frame);
  // sill
  p.rect(x - 0, y + h - 4, w, 4, shade(frame, -0.2));
  p.hline(x, x + w - 1, y + h - 4, shade(frame, 0.1));
  // frame shading
  p.vline(x, y, y + h - 5, shade(frame, -0.15));
  p.hline(x, x + w - 1, y, shade(frame, 0.12));
}

function shopWindow(p, x, y, w, h, rng) {
  windowTile(p, x, y, w, h, rng, { curtain: 0xe8c860 });
  // display: cocoa mugs & a pie on the sill inside
  for (let k = 0; k < 3; k++) {
    const mx = x + 6 + k * 8, my = y + h - 11;
    rectRaw(p, mx, my, 4, 4, 0xf4ecdc, GLASS);
    p.hline(mx, mx + 3, my, 0x6a3a1e, GLASS, true);
  }
}

function door(p, x, y, w, h, rng) {
  const base = 0xd8d0c4; // tinted by vertex colour
  p.rect(x, y, w, h, shade(base, -0.25));
  p.rect(x + 2, y + 2, w - 4, h - 2, base);
  // panels
  for (const [px, py, pw, ph] of [[5, 22, 9, 16], [18, 22, 9, 16], [5, 42, 9, 18], [18, 42, 9, 18]]) {
    p.rect(x + px, y + py, pw, ph, shade(base, -0.1));
    p.hline(x + px, x + px + pw - 1, y + py, shade(base, -0.3));
    p.vline(x + px, y + py, y + py + ph - 1, shade(base, -0.3));
  }
  // small window
  for (let j = 0; j < 12; j++) for (let i = 0; i < w - 12; i++) p.put(x + 6 + i, y + 6 + j, mix(0x3a4a6a, 0x8aa0c0, (i + j) / 30), GLASS);
  p.vline(x + w / 2, y + 6, y + 17, base);
  // knob
  p.rect(x + w - 8, y + 38, 2, 2, 0xf2c443);
  p.set(x + w - 8, y + 38, 0xfff0a0);
}

function planks(p, x, y, w, h, rng, base = 0x9a8466) {
  for (let i = 0; i < w; i += 8) {
    const c = shade(base, rng.range(-0.12, 0.1));
    for (let j = 0; j < h; j++) for (let k = 0; k < 8; k++) {
      let cc = c;
      if (k === 7) cc = shade(base, -0.55);
      else if (k === 0) cc = shade(c, 0.1);
      p.set(x + i + k, y + j, cc);
    }
    // grain
    for (let g = 0; g < 6; g++) {
      const gy = y + rng.int(0, h - 6);
      p.vline(x + i + rng.int(2, 5), gy, gy + rng.int(2, 6), shade(c, -0.12));
    }
    // nails at plank ends
    p.set(x + i + 2, y + 2, 0x4a4a4a);
    p.set(x + i + 5, y + 2, 0x4a4a4a);
    // butt joint
    const jy = y + rng.int(10, h - 10);
    p.hline(x + i, x + i + 6, jy, shade(base, -0.5));
  }
}

function woodDark(p, x, y, w, h, rng) {
  for (let i = 0; i < w; i++) {
    const c = shade(0x5a4030, Math.sin(i * 0.9) * 0.06 + rng.range(-0.04, 0.04));
    for (let j = 0; j < h; j++) p.set(x + i, y + j, c);
  }
  for (let k = 0; k < 20; k++) {
    const gx = x + rng.int(0, w - 1), gy = y + rng.int(0, h - 8);
    p.vline(gx, gy, gy + rng.int(3, 8), 0x3a281c);
  }
  // barnacles / wet line near the bottom
  for (let i = 0; i < w; i++) if (rng.chance(0.5)) p.set(x + i, y + h - rng.int(1, 6), rng.pick([0x5a6a4a, 0x8a8a80]));
}

function crate(p, x, y, w, h, rng) {
  const base = 0xb08048;
  p.rect(x, y, w, h, base);
  for (let j = 0; j < h; j += 6) p.hline(x, x + w - 1, y + j, shade(base, -0.3));
  p.rect(x, y, w, 3, shade(base, -0.15));
  p.rect(x, y + h - 3, w, 3, shade(base, -0.15));
  p.rect(x, y, 3, h, shade(base, -0.15));
  p.rect(x + w - 3, y, 3, h, shade(base, -0.15));
  p.line(x + 3, y + 3, x + w - 4, y + h - 4, shade(base, -0.2));
  p.line(x + 3, y + 4, x + w - 4, y + h - 3, shade(base, -0.2));
  p.set(x + 1, y + 1, 0x4a4a4a);
  p.set(x + w - 2, y + 1, 0x4a4a4a);
}

function barrel(p, x, y, w, h, rng) {
  for (let i = 0; i < w; i++) {
    const t = Math.abs(i - w / 2) / (w / 2);
    const c = shade(0x9a6234, -t * 0.35 + (i % 5 === 0 ? -0.15 : 0));
    for (let j = 0; j < h; j++) p.set(x + i, y + j, c);
  }
  for (const hy of [3, h - 6]) for (let j = 0; j < 3; j++) p.hline(x, x + w - 1, y + hy + j, j === 0 ? 0x6a6a72 : 0x3a3a42);
}

function hay(p, x, y, w, h, rng) {
  p.rect(x, y, w, h, 0xc8a048);
  for (let k = 0; k < 160; k++) {
    const sx = x + rng.int(0, w - 1), sy = y + rng.int(0, h - 1);
    p.line(sx, sy, sx + rng.int(-3, 3), sy + rng.int(-1, 1), rng.pick([0xe8c868, 0xa88030, 0xd8b050, 0x987028]));
  }
  p.hline(x, x + w - 1, y + Math.floor(h / 3), 0x7a5a2a);
  p.hline(x, x + w - 1, y + Math.floor((2 * h) / 3), 0x7a5a2a);
}

function gravestone(p, x, y, w, h, rng) {
  const base = 0x8a8a8c;
  p.rect(x, y, w, h, base);
  for (let k = 0; k < 40; k++) p.set(x + rng.int(0, w - 1), y + rng.int(0, h - 1), shade(base, rng.range(-0.15, 0.12)));
  drawText(p, x + 6, y + 8, 'RIP', 0x4a4a4e, 1, 1, null);
  p.hline(x + 6, x + w - 7, y + 18, 0x5a5a5e);
  p.hline(x + 8, x + w - 9, y + 22, 0x5a5a5e);
  for (let k = 0; k < 10; k++) p.set(x + rng.int(0, w - 1), y + h - rng.int(1, 8), rng.pick([0x5a7a32, 0x6a8a3a]));
}

function flagCanada(p, x, y, w, h) {
  const red = 0xd52b1e;
  p.rect(x, y, w, h, 0xf8f6f2);
  p.rect(x, y, Math.floor(w / 4), h, red);
  p.rect(x + w - Math.floor(w / 4), y, Math.floor(w / 4), h, red);
  // maple leaf (stylised 11-point leaf)
  const cx = x + w / 2, cy = y + h / 2;
  const leaf = [[0, -9], [2, -5], [4, -6], [3, -1], [7, -4], [6, -1], [8, 0], [4, 3], [5, 5], [1, 4], [1, 8], [-1, 8], [-1, 4], [-5, 5], [-4, 3], [-8, 0], [-6, -1], [-7, -4], [-3, -1], [-4, -6], [-2, -5]];
  p.poly(leaf.map(([a, b]) => [cx + a * (h / 22), cy + b * (h / 22)]), red);
}

function signBoard(p, x, y, w, h, text, { bg = 0x5a3a22, fg = 0xf6e7c8, border = 0x3a2414 } = {}, s = 1) {
  p.rect(x, y, w, h, bg);
  p.rect(x, y, w, s, border);
  p.rect(x, y + h - s, w, s, border);
  p.rect(x, y, s, h, border);
  p.rect(x + w - s, y, s, h, border);
  p.rect(x + s, y + s, w - 2 * s, s, shade(bg, 0.15));
  const tw = textWidth(text, s);
  drawText(p, x + Math.floor((w - tw) / 2 / s) * s, y + Math.floor((h - 7 * s) / 2 / s) * s, text, fg, s, 1, shade(bg, -0.4));
}

function stained(p, x, y, w, h, rng) {
  p.rect(x, y, w, h, 0x2a2a2e);
  const cols = [0xd84a3a, 0xf2c443, 0x3a7ac8, 0x4aa060, 0xb05ac8];
  for (let j = 2; j < h - 2; j += 4) for (let i = 2; i < w - 2; i += 4) {
    const c = rng.pick(cols);
    rectRaw(p, x + i, y + j, 3, 3, c, GLASS);
  }
}

function quilt(p, x, y, w, h, rng) {
  const cols = [0xd8564a, 0xf0c060, 0x5a8ab0, 0xeadfc4, 0x7aa860, 0xc87ab0];
  for (let j = 0; j < h; j += 8) for (let i = 0; i < w; i += 8) {
    const c = rng.pick(cols);
    p.rect(x + i, y + j, 8, 8, c);
    p.hline(x + i, x + i + 7, y + j, shade(c, -0.25));
    if (rng.chance(0.4)) p.line(x + i + 1, y + j + 1, x + i + 6, y + j + 6, shade(c, 0.2));
  }
}

function leaves(p, x, y, w, h, rng) {
  p.rect(x, y, w, h, 0x6a3a1e);
  for (let k = 0; k < 220; k++) {
    const c = rng.pick(LEAF_COLORS);
    const lx = x + rng.int(0, w - 3), ly = y + rng.int(0, h - 2);
    p.rect(lx, ly, 2, 2, c);
    p.set(lx + 2, ly + 1, shade(c, -0.3));
  }
}

function chalkboard(p, x, y, w, h) {
  p.rect(x, y, w, h, 0x8a5a2a);
  p.rect(x + 2, y + 2, w - 4, h - 4, 0x2a3a30);
  drawText(p, x + 4, y + 4, 'COCOA', 0xf0ece0);
  drawText(p, x + 4, y + 14, '2$', 0xf2c443);
  p.rect(x + 22, y + 15, 5, 5, 0xf4ecdc);
  p.hline(x + 22, x + 26, y + 15, 0x6a3a1e);
}

function hull(p, x, y, w, h, rng, base = 0xf0ece4, stripe = 0xc8361f) {
  for (let j = 0; j < h; j++) {
    const row = Math.floor(j / 5);
    const c = shade(base, (row % 2) * -0.06 + (j % 5 === 4 ? -0.2 : 0));
    p.hline(x, x + w - 1, y + j, c);
  }
  p.rect(x, y + 6, w, 4, stripe);
  p.rect(x, y + h - 8, w, 8, 0x2a3a3a);
  for (let k = 0; k < 20; k++) p.set(x + rng.int(0, w - 1), y + h - rng.int(8, 12), 0x8a8a80);
}

function logEnd(p, x, y, w, h) {
  p.rect(x, y, w, h, 0x6a4a2a);
  const cx = x + w / 2, cy = y + h / 2;
  for (let r = w / 2 - 1; r > 0; r -= 2) p.ring(cx, cy, r, r % 4 < 2 ? 0xd8b080 : 0xc89a68);
  p.circle(cx, cy, 1.5, 0x8a5a30);
}

function metal(p, x, y, w, h, rng) {
  p.rect(x, y, w, h, 0x3a3c44);
  for (let k = 0; k < 20; k++) p.set(x + rng.int(0, w - 1), y + rng.int(0, h - 1), rng.pick([0x4a4c54, 0x2a2c34, 0x6a5040]));
}

function lampGlass(p, x, y, w, h) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const d = Math.hypot(i - w / 2, j - h / 2) / (w / 2);
    p.set(x + i, y + j, mix(0xfff6d0, 0xf0b040, Math.min(1, d)));
  }
}

function brick(p, x, y, w, h, rng) {
  p.rect(x, y, w, h, 0xc8bca8);
  for (let row = 0; row < h / 6; row++) {
    for (let i = -(row % 2) * 6; i < w; i += 12) {
      const c = rng.pick([0x9a3a2a, 0xa8442e, 0x8a3226]);
      for (let j = 0; j < 5; j++) for (let k = 0; k < 11; k++) {
        const px = x + i + k;
        if (px < x || px >= x + w) continue;
        p.set(px, y + row * 6 + j, j === 0 ? shade(c, 0.12) : c);
      }
    }
  }
}

let built = null;
export function buildWorldAtlas() {
  if (built) return built;
  const A = new TileAtlas();
  A.add('white', 16, 16, (p, x, y, w, h) => p.rect(x, y, w, h, 0xffffff));
  for (const [k, v] of Object.entries(SIDING)) A.add(`siding_${k}`, 64, 64, (p, x, y, w, h, r) => siding(p, x, y, w, h, r, v));
  A.add('logs', 64, 64, logs);
  A.add('shakes', 64, 64, (p, x, y, w, h, r) => shakes(p, x, y, w, h, r));
  A.add('battenRed', 64, 64, (p, x, y, w, h, r) => boardBatten(p, x, y, w, h, r, 0x8a3a26));
  A.add('battenGrey', 64, 64, (p, x, y, w, h, r) => boardBatten(p, x, y, w, h, r, 0x7a6e60));
  A.add('stone', 64, 64, stone);
  A.add('roof_dark', 64, 64, (p, x, y, w, h, r) => roofShingles(p, x, y, w, h, r, 0x3e3a40, 0.4));
  A.add('roof_red', 64, 64, (p, x, y, w, h, r) => roofShingles(p, x, y, w, h, r, 0x8a2a24, 0.2));
  A.add('roof_green', 64, 64, (p, x, y, w, h, r) => roofShingles(p, x, y, w, h, r, 0x2e5a3e, 0.3));
  A.add('roof_moss', 64, 64, (p, x, y, w, h, r) => roofShingles(p, x, y, w, h, r, 0x6a5a48, 1.4));
  A.add('roof_rust', 64, 64, (p, x, y, w, h, r) => corrugated(p, x, y, w, h, r));
  A.add('window', 32, 40, (p, x, y, w, h, r) => windowTile(p, x, y, w, h, r));
  A.add('windowBlue', 32, 40, (p, x, y, w, h, r) => windowTile(p, x, y, w, h, r, { curtain: 0x3a6ac8 }));
  A.add('windowCream', 32, 40, (p, x, y, w, h, r) => windowTile(p, x, y, w, h, r, { curtain: 0xf0e0b0, frame: 0xe8e0d0 }));
  A.add('windowShop', 48, 40, shopWindow);
  A.add('door', 32, 64, door);
  A.add('planks', 64, 64, (p, x, y, w, h, r) => planks(p, x, y, w, h, r));
  A.add('planksDark', 64, 64, (p, x, y, w, h, r) => planks(p, x, y, w, h, r, 0x6e5a46));
  A.add('woodDark', 32, 64, woodDark);
  A.add('crate', 32, 32, crate);
  A.add('barrel', 32, 32, barrel);
  A.add('hay', 32, 32, hay);
  A.add('gravestone', 32, 40, gravestone);
  A.add('flag', 48, 24, flagCanada);
  A.add('stained', 24, 40, stained);
  A.add('quilt', 64, 32, quilt);
  A.add('leaves', 32, 32, leaves);
  A.add('chalk', 34, 26, chalkboard);
  A.add('hull', 64, 32, hull);
  A.add('hullBlue', 64, 32, (p, x, y, w, h, r) => hull(p, x, y, w, h, r, 0x3a6a9a, 0xf0ece4));
  A.add('hullGreen', 64, 32, (p, x, y, w, h, r) => hull(p, x, y, w, h, r, 0x2e6a52, 0xf2c443));
  A.add('logEnd', 16, 16, logEnd);
  A.add('metal', 16, 16, metal);
  A.add('lamp', 16, 16, lampGlass);
  A.add('brick', 64, 64, brick);
  // painted signs
  const signs = {
    'CAFE ERABLE': { bg: 0x7a1e1e, fg: 0xf6e7c8 },
    'MOOSE & GOOSE': { bg: 0x2e4a36, fg: 0xf2c443 },
    POLICE: { bg: 0x22284a, fg: 0xf2c443 },
    CLINIC: { bg: 0xf0ece4, fg: 0xc8361f, border: 0x8a8a8a },
    SAWMILL: { bg: 0x5a3a22, fg: 0xf6e7c8 },
    "NANA'S COCOA": { bg: 0x6b3d22, fg: 0xffd8a0 },
    'MAPLE COVE': { bg: 0x2e4a36, fg: 0xf6e7c8 },
    'SUNSET LOOKOUT': { bg: 0x5a3a22, fg: 0xf6e7c8 },
    'MOOSE XING': { bg: 0xf2c443, fg: 0x1e1e1e, border: 0x1e1e1e },
    'BEAVER CREEK': { bg: 0x5a3a22, fg: 0xf6e7c8 },
    'OLD PINE CEMETERY': { bg: 0x3a3a3e, fg: 0xd8d8d8 },
    'FALL FAIR!': { bg: 0xc8361f, fg: 0xfff4dc },
    'BOAT HOUSE': { bg: 0x22284a, fg: 0xf6e7c8 },
    'GARAGE': { bg: 0x6b3d22, fg: 0xf6e7c8 },
  };
  for (const [text, opt] of Object.entries(signs)) {
    // painted at 2x: up close the letters stay crisp, and at a distance mip 1 is exactly the 1x lettering
    const w = textWidth(text) + 8;
    A.add(`sign:${text}`, w * 2, 26, (p, x, y, ww, hh) => signBoard(p, x, y, ww, hh, text, opt, 2));
    TILE_DENSITY[`sign:${text}`] = 2;
  }
  built = { pix: A.pix, size: SIZE };
  return built;
}
