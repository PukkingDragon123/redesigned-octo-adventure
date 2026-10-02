// Foliage clump atlas: 4x4 cells of 64x64 greyscale "value" sprites.
// R = shade value (0 dark .. 1 bright), A = coverage. Colour comes from per-species ramps.
import { Pix, RNG } from './pixel.js';

export const CELL = 64;
export const ATLAS_N = 4;

// Atlas cell indices
export const CLUMP = {
  broad: [0, 1, 2, 3], // round leafy clusters (maple, oak)
  small: [4, 5, 6, 7], // small-leaf clusters (birch, aspen)
  tier: [8, 9, 10, 11], // conifer tiers (spruce, tamarack)
  bush: [12, 13], // low shrubs
  fern: [14, 15], // ferns / tall grass clumps
};

function setV(p, x, y, v, a = 255) {
  v = Math.max(0, Math.min(1, v));
  const c = Math.round(v * 255);
  p.set(x, y, (c << 16) | (c << 8) | c, a);
}

function leafMark(p, ox, oy, x, y, v, rng, big) {
  const s = big ? rng.int(1, 2) : 1;
  const shape = rng.int(0, 3);
  const dv = v;
  if (shape === 0) {
    setV(p, ox + x, oy + y, dv);
    setV(p, ox + x + 1, oy + y, dv - 0.08);
    setV(p, ox + x, oy + y + 1, dv - 0.12);
    if (s > 1) setV(p, ox + x + 1, oy + y + 1, dv - 0.2);
  } else if (shape === 1) {
    setV(p, ox + x, oy + y, dv + 0.06);
    setV(p, ox + x - 1, oy + y + 1, dv - 0.05);
    setV(p, ox + x + 1, oy + y + 1, dv - 0.1);
    setV(p, ox + x, oy + y + 1, dv);
    if (s > 1) setV(p, ox + x, oy + y + 2, dv - 0.18);
  } else if (shape === 2) {
    setV(p, ox + x, oy + y, dv);
    setV(p, ox + x + 1, oy + y + 1, dv - 0.1);
  } else {
    setV(p, ox + x, oy + y, dv + 0.04);
    setV(p, ox + x, oy + y + 1, dv - 0.08);
    setV(p, ox + x + 1, oy + y, dv - 0.04);
  }
}

// A blobby round cluster made of overlapping lobes, densely covered in leaf marks
function drawBroad(p, ox, oy, rng, { lobes = 6, leafDensity = 1, small = false } = {}) {
  const R = CELL / 2;
  const blobs = [];
  for (let i = 0; i < lobes; i++) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, R * 0.42);
    blobs.push({ x: R + Math.cos(a) * d, y: R + Math.sin(a) * d * 0.85, r: rng.range(R * 0.32, R * 0.5) });
  }
  blobs.push({ x: R, y: R, r: R * 0.5 });
  const inside = (x, y) => {
    let m = 0;
    for (const b of blobs) {
      const dd = Math.hypot(x - b.x, y - b.y) / b.r;
      m = Math.max(m, 1 - dd);
    }
    return m; // >0 inside
  };
  // body with form shading (lit from top-left)
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const m = inside(x + 0.5, y + 0.5);
      if (m <= 0) continue;
      // ragged edge holes
      if (m < 0.12 && rng.chance(0.55)) continue;
      const nx = (x - R) / R, ny = (y - R) / R;
      let v = 0.42 - nx * 0.16 - ny * 0.26 + m * 0.12;
      v += (rng.next() - 0.5) * 0.08;
      // interior darkness pockets
      if (rng.chance(0.03)) v -= 0.25;
      setV(p, ox + x, oy + y, v);
    }
  }
  // leaf marks
  const n = Math.round((small ? 520 : 380) * leafDensity);
  for (let i = 0; i < n; i++) {
    const x = rng.int(2, CELL - 3), y = rng.int(2, CELL - 3);
    const m = inside(x, y);
    if (m <= 0.02) continue;
    const nx = (x - R) / R, ny = (y - R) / R;
    let v = 0.55 - nx * 0.2 - ny * 0.32 + rng.range(-0.12, 0.18);
    if (m < 0.2) v += 0.08; // edges catch light
    leafMark(p, ox, oy, x, y, v, rng, !small);
  }
  // stray leaves sticking out of the silhouette
  for (let i = 0; i < (small ? 40 : 26); i++) {
    const a = rng.range(0, Math.PI * 2);
    const b = blobs[rng.int(0, blobs.length - 1)];
    const x = Math.round(b.x + Math.cos(a) * (b.r + rng.range(0, 3)));
    const y = Math.round(b.y + Math.sin(a) * (b.r + rng.range(0, 3)));
    if (x < 1 || y < 1 || x > CELL - 3 || y > CELL - 3) continue;
    leafMark(p, ox, oy, x, y, 0.5 - (y - R) / R * 0.3, rng, false);
  }
  // a few twig hints
  for (let i = 0; i < 3; i++) {
    const x0 = R + rng.range(-6, 6), y0 = R + rng.range(4, 14);
    const x1 = x0 + rng.range(-12, 12), y1 = y0 + rng.range(-10, -2);
    p.line(ox + x0, oy + y0, ox + x1, oy + y1, 0x161616);
  }
}

// Conifer tier: a wide, drooping "skirt" of needled boughs (lit on top, dark below)
function drawTier(p, ox, oy, rng, { airy = false } = {}) {
  const cx = CELL / 2;
  const top = 6;
  const halfW = airy ? 27 : 30;
  const phase = rng.range(0, 6);
  const boughs = airy ? 5 : 7;
  for (let x = -halfW; x <= halfW; x++) {
    const ax = Math.abs(x) / halfW;
    const yt = top + Math.abs(x) * 0.62 + (airy ? rng.range(-1, 1) : 0);
    let thick = 9 + (1 - ax) * 9 + ax * ax * 5;
    // scalloped bough tips along the bottom edge
    const sc = Math.abs(Math.sin((x / halfW) * boughs * 1.57 + phase));
    thick -= sc * 4;
    const yb = yt + thick;
    for (let y = Math.floor(yt); y <= Math.ceil(yb); y++) {
      if (y < 0 || y >= CELL) continue;
      const k = (y - yt) / Math.max(1, thick); // 0 top surface .. 1 underside
      if (airy && rng.chance(0.42)) continue;
      if (!airy && k > 0.85 && rng.chance(0.4)) continue;
      // bough striation: darker grooves between boughs
      const groove = Math.abs(Math.sin((x / halfW) * boughs * 1.57 + phase + k * 0.8)) < 0.18 ? -0.16 : 0;
      let v = 0.66 - k * 0.5 + groove + rng.range(-0.07, 0.07);
      if (k < 0.12) v += 0.12; // sky-lit top edge
      setV(p, ox + cx + x, oy + y, v);
    }
    // needle tufts poking out of the bottom edge, pointing outward & down
    if (rng.chance(airy ? 0.5 : 0.65)) {
      const dir = Math.sign(x) || 1;
      const l = rng.int(2, airy ? 5 : 4);
      for (let q = 1; q <= l; q++) setV(p, ox + cx + x + (q > 1 ? dir * Math.floor(q / 2) : 0), oy + yb + q, 0.3 - q * 0.04);
    }
    // tufts on the upper surface
    if (rng.chance(0.3)) {
      const dir = Math.sign(x) || 1;
      setV(p, ox + cx + x + dir, oy + yt - 1, 0.78);
    }
  }
  // shadowed inner core under the apex (gaps between tiers read as dense, dark interior)
  if (!airy) {
    for (let x = -Math.round(halfW * 0.55); x <= Math.round(halfW * 0.55); x++) {
      const ax = Math.abs(x) / (halfW * 0.55);
      const y0 = top + Math.abs(x) * 0.62 + 12;
      const y1 = y0 + (1 - ax) * 16;
      for (let y = Math.floor(y0); y <= y1 && y < CELL; y++) {
        if (p.alpha(ox + cx + x, oy + y) > 0) continue;
        if (rng.chance(0.8)) setV(p, ox + cx + x, oy + y, 0.1 + rng.range(0, 0.1));
      }
    }
  }
  // drooping tip ends
  for (const dir of [-1, 1]) {
    for (let q = 0; q < 5; q++) setV(p, ox + cx + dir * (halfW + 1 + q * 0.6), oy + top + halfW * 0.62 + 8 + q, 0.38 - q * 0.04);
  }
  // little leader at the top
  setV(p, ox + cx, oy + top - 1, 0.82);
  setV(p, ox + cx, oy + top - 2, 0.74);
  setV(p, ox + cx, oy + top - 3, 0.6);
}

function drawBush(p, ox, oy, rng) {
  const R = CELL / 2;
  const blobs = [];
  for (let i = 0; i < 5; i++) blobs.push({ x: R + rng.range(-14, 14), y: R + 8 + rng.range(-6, 8), r: rng.range(10, 16) });
  for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) {
    let m = 0;
    for (const b of blobs) m = Math.max(m, 1 - Math.hypot(x - b.x, (y - b.y) * 1.2) / b.r);
    if (m <= 0 || y > CELL - 4) continue;
    if (m < 0.15 && rng.chance(0.5)) continue;
    setV(p, ox + x, oy + y, 0.35 - (y - R) / R * 0.25 + rng.range(-0.06, 0.06));
  }
  for (let i = 0; i < 300; i++) {
    const x = rng.int(2, CELL - 3), y = rng.int(10, CELL - 5);
    if (p.alpha(ox + x, oy + y) === 0) continue;
    leafMark(p, ox, oy, x, y, 0.62 - (y - R) / R * 0.3 + rng.range(-0.1, 0.15), rng, false);
  }
  // berries
  for (let i = 0; i < 10; i++) {
    const x = rng.int(8, CELL - 8), y = rng.int(20, CELL - 10);
    if (p.alpha(ox + x, oy + y) === 0) continue;
    setV(p, ox + x, oy + y, 0.98);
  }
}

function drawFern(p, ox, oy, rng) {
  const cx = CELL / 2, base = CELL - 2;
  const fronds = rng.int(7, 10);
  for (let f = 0; f < fronds; f++) {
    const t = f / (fronds - 1);
    const ang = -Math.PI / 2 + (t - 0.5) * 2.4 + rng.range(-0.15, 0.15);
    const len = rng.range(24, 34) * (1 - Math.abs(t - 0.5) * 0.5);
    let x = cx + rng.range(-2, 2), y = base;
    let dx = Math.cos(ang), dy = Math.sin(ang);
    for (let s = 0; s < len; s++) {
      const k = s / len;
      x += dx;
      y += dy;
      dy += 0.035; // gentle arch under gravity
      const v = 0.4 + k * 0.35 + rng.range(-0.05, 0.05);
      setV(p, ox + x, oy + y, v);
      if (s % 2 === 0 && s > 1) {
        const pl = Math.round((1 - k) * 4.5) + 1;
        const nx = -dy, ny = dx;
        for (let q = 1; q <= pl; q++) {
          setV(p, ox + x + nx * q * 0.9, oy + y + ny * q * 0.9 + q * 0.5, v - q * 0.05);
          setV(p, ox + x - nx * q * 0.9, oy + y - ny * q * 0.9 + q * 0.5, v - q * 0.08);
        }
      }
    }
  }
}

export function buildFoliageAtlas() {
  const N = ATLAS_N;
  const p = new Pix(CELL * N, CELL * N);
  const rng = new RNG(777);
  for (let i = 0; i < 16; i++) {
    const ox = (i % N) * CELL, oy = Math.floor(i / N) * CELL;
    if (CLUMP.broad.includes(i)) drawBroad(p, ox, oy, rng, { lobes: rng.int(5, 8) });
    else if (CLUMP.small.includes(i)) drawBroad(p, ox, oy, rng, { lobes: rng.int(4, 6), small: true, leafDensity: 1.1 });
    else if (CLUMP.tier.includes(i)) drawTier(p, ox, oy, rng, { airy: i >= 10 });
    else if (CLUMP.bush.includes(i)) drawBush(p, ox, oy, rng);
    else drawFern(p, ox, oy, rng);
  }
  return p;
}

// Bark textures: 3 columns of 32x64 (generic, birch, conifer)
export function buildBarkAtlas() {
  const W = 32, H = 64;
  const p = new Pix(W * 4, H);
  const rng = new RNG(99);
  // generic broadleaf bark: grey-brown with vertical fissures
  const cols = [
    [0x3a2c24, 0x4a382c, 0x5c4636, 0x6e5644, 0x2a1e18],
    [0xd8d2c4, 0xe8e2d4, 0xc4bcae, 0xf4f0e6, 0x2a2420],
    [0x4a2a1c, 0x5e3624, 0x6e4430, 0x804e36, 0x2e1a12],
    [0x2e2620, 0x3a3028, 0x4a3e32, 0x5a4c3e, 0x1e1814],
  ];
  for (let k = 0; k < 4; k++) {
    const c = cols[k];
    const ox = k * W;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = rng.next();
      p.set(ox + x, y, v < 0.5 ? c[1] : v < 0.8 ? c[0] : c[2]);
    }
    if (k === 1) {
      // birch: horizontal black lenticels & dark patches
      for (let i = 0; i < 26; i++) {
        const x = rng.int(0, W - 6), y = rng.int(0, H - 1), l = rng.int(2, 7);
        p.hline(ox + x, ox + Math.min(W - 1, x + l), y, rng.chance(0.7) ? c[4] : 0x6a6058);
      }
      for (let i = 0; i < 5; i++) p.ellipse(ox + rng.int(4, W - 4), rng.int(4, H - 4), rng.range(1.5, 3), rng.range(1, 2), c[4]);
      for (let i = 0; i < 30; i++) p.set(ox + rng.int(0, W - 1), rng.int(0, H - 1), c[3]);
    } else {
      // fissures
      for (let i = 0; i < 9; i++) {
        let x = rng.int(0, W - 1);
        for (let y = 0; y < H; y++) {
          p.set(ox + x, y, c[4]);
          if (rng.chance(0.5)) p.set(ox + ((x + 1) % W), y, c[3]);
          if (rng.chance(0.25)) x = (x + rng.int(-1, 1) + W) % W;
        }
      }
      if (k === 0 || k === 3) for (let i = 0; i < 12; i++) p.ellipse(ox + rng.int(2, W - 3), rng.int(2, H - 3), rng.range(1, 2.4), rng.range(1, 2.4), rng.pick([0x6b7a33, 0x7f8c3a, 0xc9922f]));
    }
  }
  return p;
}

// Species ramps (sRGB): 6 colours from deep shadow to sunlit highlight.
export const SPECIES = {
  maple: { ramp: [0x2e0a10, 0x5e1414, 0x96241a, 0xc8401e, 0xec6a28, 0xffa64a], bark: 0 },
  maple2: { ramp: [0x3a1010, 0x6e1c12, 0xa8341a, 0xdc5a1e, 0xf58a2c, 0xffc05a], bark: 0 },
  birch: { ramp: [0x2e1e0a, 0x5a3e10, 0x8e6a16, 0xc49a20, 0xecc63a, 0xfff07a], bark: 1 },
  aspen: { ramp: [0x2a200a, 0x544414, 0x86701c, 0xbaa024, 0xe4cc3e, 0xfaf08a], bark: 1 },
  oak: { ramp: [0x22140c, 0x442814, 0x6e421c, 0x9c5e24, 0xc8822e, 0xeeb04c], bark: 3 },
  spruce: { ramp: [0x08120e, 0x112018, 0x1c3222, 0x2a462c, 0x3e5e36, 0x5e7e48], bark: 2 },
  pine: { ramp: [0x0e140c, 0x1a2414, 0x2a3a1c, 0x3e5226, 0x566c30, 0x7a8a40], bark: 2 },
  tamarack: { ramp: [0x2a1608, 0x5a320e, 0x8e5414, 0xc27e1e, 0xe8aa34, 0xffd86a], bark: 2 },
  bushRed: { ramp: [0x26080c, 0x501016, 0x86181c, 0xb82a22, 0xe0482c, 0xff7a4a], bark: 0 },
  bushOrange: { ramp: [0x2a1208, 0x5a2a0e, 0x8e4614, 0xc2661e, 0xe88a30, 0xffb456], bark: 0 },
  fern: { ramp: [0x2a1608, 0x4e2c10, 0x7a4618, 0xa86624, 0xd08a34, 0xf0b250], bark: 0 },
};
export const SPECIES_LIST = Object.keys(SPECIES);
