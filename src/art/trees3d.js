// Real 3D trees for the forest (drawn by world/forest3d.js): a tapered trunk and
// branch skeleton carrying hundreds of small leaf cards, each card a pixel-art
// cluster of leaves (or a needle spray) painted in code.
//
// Everything is value-coded: the atlas holds a shade (R), a second-palette flag
// (G) and coverage (A); the shader turns shade + light into one of five tones
// of the tree's palette (LEAF_P / BARK from trees2d.js), so lighting stays in
// crisp pixel-art bands and every variant shares one texture.
//
// Every model of a class has the same topology (SEG tube segments, then CARDS
// leaf cards; unused ones collapse to a point), so the renderer can draw every
// species of a class in one instanced call, pulling the vertices of each
// instance's model out of a float texture by gl_VertexID.
//
// Per vertex, 16 floats (4 texels):
//   px py pz flex | nx ny nz ao | u v tile pal | ax ay az phase
//   flex: how far it bends (0 trunk .. 1 twig tips); n: lighting normal (for
//   leaves the crown/clump normal, so the crown shades like one soft volume);
//   ao: 0 deep inside .. 1 outside; u v: tile-local (bark repeats); tile: atlas
//   tile; pal: palette row + 64 * second palette row; a: the card centre (leaf
//   flutter pivot); phase: the limb's sway phase (shared by its leaves).
import { LEAF_P, BARK, SPRITES } from './trees2d.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- classes
export const CLASSES = {
  near: { seg: 34, sides: 5, cards: 280 },
  mid: { seg: 8, sides: 4, cards: 80 },
  small: { seg: 6, sides: 4, cards: 48 },
};
export const ROW_W = 1024; // texels per row of the vertex texture
for (const c of Object.values(CLASSES)) {
  c.segVerts = c.seg * 2 * (c.sides + 1);
  c.verts = c.segVerts + c.cards * 4;
  c.rows = Math.ceil((c.verts * 4) / ROW_W);
}

// species drawn in 3D, and the class of each
export const TREE3D = new Set(['maple', 'maple2', 'oak', 'birch', 'aspen', 'spruce', 'pine', 'tamarack']);
export const SMALL3D = new Set(['bushRed', 'bushOrange', 'sapling', 'fern']);
export const LEAFY3D = /^(maple|maple2|oak|birch|aspen|tamarack|bush|sapling)/;

// ---------------------------------------------------------------- palettes
export const PAL_NAMES = [...Object.keys(LEAF_P), ...Object.keys(BARK).map((k) => `bark_${k}`)];
const PAL = Object.fromEntries(PAL_NAMES.map((n, i) => [n, i]));
// RGBA8 sRGB, 5 tones x rows
export function rampData() {
  const rows = PAL_NAMES.length;
  const d = new Uint8Array(8 * rows * 4);
  PAL_NAMES.forEach((n, r) => {
    const P = n.startsWith('bark_') ? BARK[n.slice(5)] : LEAF_P[n];
    for (let k = 0; k < 8; k++) {
      const c = P[Math.min(4, k)];
      const o = (r * 8 + k) * 4;
      d[o] = (c >> 16) & 255; d[o + 1] = (c >> 8) & 255; d[o + 2] = c & 255; d[o + 3] = 255;
    }
  });
  return { data: d, w: 8, h: rows };
}

// ---------------------------------------------------------------- atlas tiles
export const TILE = 32;
export const ATLAS_N = 8; // tiles per side
export const ATLAS = TILE * ATLAS_N;
export const LEAF_TILE_MAX = 23; // tiles 0..23 are leaves, 24.. bark
const TILES = {
  maple: [0, 1, 2, 3], oak: [4, 5], birch: [6, 7], aspen: [8, 9], spruce: [10, 11], pine: [12, 13],
  tamarack: [14, 15], bush: [16, 17], fern: [18, 19], sapMaple: [20], sapBirch: [21], sapSpruce: [22], twig: [23],
};
const BARK_TILE = { maple: 24, oak: 25, birch: 26, aspen: 27, spruce: 28, pine: 29, tamarack: 30, stem: 31, dead: 25 };

function makeRng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, range: (lo, hi) => lo + (hi - lo) * next(), int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)), chance: (p) => next() < p, pick: (a) => a[Math.floor(next() * a.length)] };
}

// leaf outlines in leaf space: u 0 (stem) .. 1 (tip), v across (units of length)
const SHAPES = {
  maple(u, v) {
    const y = u - 0.52, x = v;
    const r = Math.hypot(x, y), th = Math.atan2(x, y);
    const lobe = Math.pow(Math.abs(Math.cos(th * 2.5)), 1.4);
    const rr = 0.5 * (0.46 + 0.54 * lobe) * (0.82 + 0.18 * Math.cos(th));
    return r < rr && !(y < -0.3 && Math.abs(x) < 0.07);
  },
  oak: (u, v) => u > 0.04 && u < 1 && Math.abs(v) < 0.3 * Math.pow(Math.sin(Math.PI * u), 0.6) * (0.66 + 0.34 * Math.cos(u * Math.PI * 7)),
  birch: (u, v) => u > 0.02 && u < 1 && Math.abs(v) < 0.34 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.75)), 0.9),
  aspen: (u, v) => Math.hypot(v, (u - 0.5) * 1.05) < 0.44 && u < 0.97,
  bush: (u, v) => u > 0.03 && u < 1 && Math.abs(v) < 0.24 * Math.pow(Math.sin(Math.PI * u), 0.75),
};

class TileCanvas {
  constructor() {
    this.val = new Float32Array(TILE * TILE).fill(-1);
    this.alt = new Uint8Array(TILE * TILE);
    this.id = new Int16Array(TILE * TILE).fill(-1);
  }
  set(x, y, v, alt, id, wrap = false) {
    x = Math.round(x); y = Math.round(y);
    if (wrap) { x = ((x % TILE) + TILE) % TILE; y = ((y % TILE) + TILE) % TILE; }
    if (x < 1 || y < 1 || x > TILE - 2 || y > TILE - 2) { if (!wrap) return; }
    const i = y * TILE + x;
    this.val[i] = v; this.alt[i] = alt; this.id[i] = id;
  }
  // a 1 px line of shade v0 -> v1
  line(x0, y0, x1, y1, v0, v1, alt, id) {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      this.set(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, v0 + (v1 - v0) * t, alt, id);
    }
  }
  // dark contour around every shape, and where a leaf lies over one behind it
  outline(inner = 0.6) {
    const { val, id } = this;
    const out = Float32Array.from(val);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const i = y * TILE + x;
      if (val[i] < 0) continue;
      let edge = false, over = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= TILE || Y >= TILE) { edge = true; continue; }
        const j = Y * TILE + X;
        if (val[j] < 0) edge = true;
        else if (id[j] >= 0 && id[j] < id[i] - 0) over = true;
      }
      if (edge) out[i] = 0.04;
      else if (over && inner > 0) out[i] = Math.min(val[i], val[i] * inner);
    }
    this.val = out;
  }
  blit(atlas, tile) {
    const tx = tile % ATLAS_N, ty = Math.floor(tile / ATLAS_N);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const i = y * TILE + x;
      const o = ((ty * TILE + (TILE - 1 - y)) * ATLAS + tx * TILE + x) * 4;
      const v = this.val[i];
      if (v < 0) continue;
      atlas[o] = Math.round(Math.max(0, Math.min(1, v)) * 255);
      atlas[o + 1] = this.alt[i] ? 255 : 0;
      atlas[o + 2] = 0;
      atlas[o + 3] = 255;
    }
  }
}

// a bunch of leaves around the tile centre, stems toward the middle
function leafCluster(c, R, { shape, n, len, spread, alt = 0.3, droop = 0, cx = 16, cy = 16 }) {
  const leaves = [];
  for (let k = 0; k < n; k++) {
    const a = R.range(0, TAU);
    const d = spread * Math.sqrt(R.range(0.05, 1));
    const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.9;
    let dir = a + R.range(-0.55, 0.55);
    // hang down a little
    const dx = Math.cos(dir), dy = Math.sin(dir) + droop;
    dir = Math.atan2(dy, dx);
    leaves.push({ px, py, dir, L: R.range(len[0], len[1]), z: R.next(), alt: R.chance(alt) ? 1 : 0, tone: R.range(-0.06, 0.06) });
  }
  leaves.sort((a, b) => a.z - b.z);
  const S = SHAPES[shape];
  leaves.forEach((lf, id) => {
    const ux = Math.cos(lf.dir), uy = Math.sin(lf.dir);
    // the leaf's base sits at (px,py) - half its length back toward the centre
    const bx = lf.px - ux * lf.L * 0.45, by = lf.py - uy * lf.L * 0.45;
    // petiole
    c.line(bx, by, bx - ux * 2.2, by - uy * 2.2, 0.16, 0.12, lf.alt, id);
    const back = 0.42 + lf.z * 0.18 + lf.tone;
    const r = lf.L * 0.75 + 1;
    for (let y = Math.floor(lf.py - r); y <= Math.ceil(lf.py + r); y++) for (let x = Math.floor(lf.px - r); x <= Math.ceil(lf.px + r); x++) {
      const qx = x - bx, qy = y - by;
      const u = (qx * ux + qy * uy) / lf.L, v = (-qx * uy + qy * ux) / lf.L;
      if (!S(u, v)) continue;
      // light from the upper left of the tile, a darker midrib, a bright tip
      let s = back + (-(x - lf.px) * 0.6 - (y - lf.py) * 0.8) / lf.L * 0.32;
      if (Math.abs(v * lf.L) < 0.55 && u > 0.12 && u < 0.86) s -= 0.12;
      s += u > 0.8 ? 0.05 : 0;
      c.set(x, y, Math.max(0.12, Math.min(0.98, s)), lf.alt, id);
    }
  });
  c.outline(0.62);
}

// a drooping spruce branchlet: a twig with needles brushed forward on both sides
function needleSpray(c, R, { sprays = 3, needle = 3.2, dense = 1, alt = 0.2, bright = 0 }) {
  let id = 0;
  for (let s = 0; s < sprays; s++) {
    const x0 = R.range(3, 7), y0 = 8 + (s + R.range(0.2, 0.8)) * 16 / sprays;
    const a = R.range(-0.25, 0.25), L = R.range(20, 26), bend = R.range(-0.012, 0.012);
    const al = R.chance(alt) ? 1 : 0;
    const steps = Math.ceil(L);
    let x = x0, y = y0, dir = a;
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const ux = Math.cos(dir), uy = Math.sin(dir);
      const nl = needle * (1 - t * 0.55) * R.range(0.8, 1.2);
      for (const side of [-1, 1]) {
        if (!R.chance(0.85 * dense)) continue;
        const na = dir + side * R.range(0.7, 1.1) - 0 * side;
        const ex = x + Math.cos(na) * nl + ux * nl * 0.5, ey = y + Math.sin(na) * nl + uy * nl * 0.5;
        // upper needles catch the light, lower ones are in shadow
        const lit = side * Math.sign(-ux || 1) < 0 ? 0.62 : 0.34;
        c.line(x, y, ex, ey, lit - 0.08 + bright, lit + 0.16 + bright, al, id);
      }
      c.set(x, y, 0.18, al, id);
      x += ux; y += uy; dir += bend;
    }
    id++;
  }
  // a few needle tips sparkle
  for (let k = 0; k < 18; k++) {
    const x = R.int(2, 29), y = R.int(2, 29), i = y * TILE + x;
    if (c.val[i] > 0.4) c.val[i] = Math.min(0.98, c.val[i] + 0.25);
  }
}

// white pine: fans of long soft needles from a few tuft centres
function pineTufts(c, R, { tufts = 5, len = [8, 12], alt = 0.2 }) {
  for (let t = 0; t < tufts; t++) {
    const cx = R.range(9, 23), cy = R.range(12, 24), al = R.chance(alt) ? 1 : 0;
    const n = R.int(13, 18);
    for (let k = 0; k < n; k++) {
      const a = -Math.PI / 2 + (k / (n - 1) - 0.5) * 2.8 + R.range(-0.1, 0.1);
      const L = R.range(len[0], len[1]);
      const ex = cx + Math.cos(a) * L, ey = cy + Math.sin(a) * L * 0.85;
      const up = -Math.sin(a);
      c.line(cx, cy, ex, ey, 0.25, 0.45 + up * 0.35, al, t);
    }
    c.set(cx, cy, 0.12, al, t);
    c.set(cx, cy + 1, 0.12, al, t);
  }
}

// tamarack: little golden rosettes of short needles
function rosettes(c, R, { n = 14, alt = 0.3 }) {
  for (let t = 0; t < n; t++) {
    const cx = R.range(6, 26), cy = R.range(6, 26), al = R.chance(alt) ? 1 : 0;
    const m = R.int(7, 11), L = R.range(2.6, 4.2);
    for (let k = 0; k < m; k++) {
      const a = (k / m) * TAU + R.range(-0.2, 0.2);
      const up = -Math.sin(a);
      c.line(cx, cy, cx + Math.cos(a) * L, cy + Math.sin(a) * L, 0.35, 0.55 + up * 0.3, al, t);
    }
    c.set(cx, cy, 0.2, al, t);
  }
  // the twig they sit on
  c.line(2, 28, 29, 6, 0.14, 0.2, 0, -1);
}

// a bracken frond from the bottom centre to the top
function frond(c, R, { alt = 0.3 }) {
  const al = R.chance(alt) ? 1 : 0;
  let x = 16 + R.range(-2, 2), y = 30;
  const bend = R.range(-0.05, 0.05);
  let dir = -Math.PI / 2 + R.range(-0.15, 0.15);
  for (let k = 0; k < 28; k++) {
    const t = k / 28;
    const ux = Math.cos(dir), uy = Math.sin(dir);
    c.set(x, y, 0.22, al, 0);
    if (k > 3 && k % 2 === 0) {
      const pl = (1 - t) * 9 + 1.5;
      for (const side of [-1, 1]) {
        const a = dir + side * 1.25;
        for (let j = 1; j <= pl; j++) {
          const px = x + Math.cos(a) * j + ux * j * 0.35, py = y + Math.sin(a) * j + uy * j * 0.35;
          c.set(px, py, 0.4 + (side < 0 ? 0.18 : 0) + (j / pl) * 0.2, al, 1);
          c.set(px + ux, py + uy, 0.3 + (side < 0 ? 0.12 : 0), al, 1);
        }
      }
    }
    x += ux; y += uy; dir += bend;
  }
  c.outline(0);
}

function barkTile(c, R, kind) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
    let v;
    const n = R.next() * 0.06;
    if (kind === 'birch' || kind === 'aspen') {
      v = 0.66 + n + (Math.sin(y * TAU / 32 * 3 + x) * 0.03);
    } else if (kind === 'spruce' || kind === 'tamarack' || kind === 'stem' || kind === 'pine') {
      // flaky plates: columns of uneven length, each column slid up or down
      const pine = kind === 'pine', cw = pine ? 8 : 4, ch = pine ? 11 : 6;
      const col = Math.floor(x / cw), sx = x % cw;
      const off = Math.floor(hashTile(col, 7) * ch);
      const yy = (y + off) % TILE, row = Math.floor(yy / ch), sy = yy % ch;
      const plate = hashTile(col * 13 + row, 3);
      const crack = sx === 0 || (sy === ch - 1 && hashTile(col, row) < 0.8);
      v = crack ? 0.1 : 0.34 + plate * 0.16 + (ch - 1 - sy) / ch * 0.12 + (sx === 1 ? 0.06 : 0) + n;
    } else {
      // maple / oak: wavy vertical furrows
      const w = x + Math.sin(y * TAU / 32 * 2 + Math.floor(x / 8)) * 1.5;
      const f = ((w % 8) + 8) % 8;
      v = f < 1.3 ? 0.08 : f < 2.2 ? 0.26 : 0.42 + (f / 8) * 0.22 + n;
    }
    c.set(x, y, v, 0, 0, true);
  }
  if (kind === 'birch' || kind === 'aspen') {
    // lenticels: short dark dashes across the white bark; aspen gets dark diamonds
    for (let k = 0; k < (kind === 'birch' ? 22 : 7); k++) {
      const x = R.int(0, 31), y = R.int(0, 31), L = kind === 'birch' ? R.int(2, 7) : 2;
      for (let j = 0; j < L; j++) c.set(x + j, y, 0.04, 0, 0, true);
      if (kind === 'aspen') { c.set(x + 1, y - 1, 0.1, 0, 0, true); c.set(x + 1, y + 1, 0.1, 0, 0, true); c.set(x + 3, y, 0.04, 0, 0, true); }
    }
    // a few dark patches
    for (let k = 0; k < 3; k++) {
      const x = R.int(0, 31), y = R.int(0, 31);
      for (let j = 0; j < 6; j++) c.set(x + R.int(-2, 2), y + R.int(-1, 1), 0.2, 0, 0, true);
    }
  }
}

function hashTile(a, b) {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x51ed27, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

let atlasCache = null;
// RGBA8: R shade, G second-palette flag, A coverage. Row 0 is the bottom (v = 0).
export function buildAtlas() {
  if (atlasCache) return atlasCache;
  const data = new Uint8Array(ATLAS * ATLAS * 4);
  const R = makeRng(4242);
  const paint = (tile, fn) => { const c = new TileCanvas(); fn(c); c.blit(data, tile); };
  TILES.maple.forEach((t, k) => paint(t, (c) => leafCluster(c, R, { shape: 'maple', n: 14 + k, len: [9, 12], spread: 9.5, alt: 0.35 })));
  TILES.oak.forEach((t) => paint(t, (c) => leafCluster(c, R, { shape: 'oak', n: 14, len: [10, 13], spread: 9, alt: 0.3 })));
  TILES.birch.forEach((t) => paint(t, (c) => leafCluster(c, R, { shape: 'birch', n: 26, len: [6, 8], spread: 10, alt: 0.3, droop: 0.9 })));
  TILES.aspen.forEach((t) => paint(t, (c) => leafCluster(c, R, { shape: 'aspen', n: 24, len: [6, 7.5], spread: 10, alt: 0.3, droop: 0.4 })));
  TILES.spruce.forEach((t, k) => paint(t, (c) => needleSpray(c, R, { sprays: 3 + k, needle: 4.6 })));
  TILES.pine.forEach((t) => paint(t, (c) => pineTufts(c, R, { tufts: 5 })));
  TILES.tamarack.forEach((t) => paint(t, (c) => rosettes(c, R, { n: 16 })));
  TILES.bush.forEach((t) => paint(t, (c) => leafCluster(c, R, { shape: 'bush', n: 18, len: [8, 11], spread: 9, alt: 0.35, droop: 0.2 })));
  TILES.fern.forEach((t) => paint(t, (c) => frond(c, R, {})));
  paint(TILES.sapMaple[0], (c) => leafCluster(c, R, { shape: 'maple', n: 6, len: [7, 9], spread: 8, alt: 0.2 }));
  paint(TILES.sapBirch[0], (c) => leafCluster(c, R, { shape: 'birch', n: 12, len: [5, 6], spread: 9, alt: 0.2, droop: 0.6 }));
  paint(TILES.sapSpruce[0], (c) => needleSpray(c, R, { sprays: 3, needle: 4 }));
  for (const [kind, t] of Object.entries(BARK_TILE)) if (kind !== 'dead') paint(t, (c) => barkTile(c, R, kind));
  atlasCache = { data, w: ATLAS, h: ATLAS };
  return atlasCache;
}

// ---------------------------------------------------------------- geometry builder
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const randUnit = (R) => {
  const z = R.range(-1, 1), a = R.range(0, TAU), s = Math.sqrt(1 - z * z);
  return [Math.cos(a) * s, z, Math.sin(a) * s];
};
const perpOf = (d) => norm(Math.abs(d[1]) < 0.9 ? cross(d, [0, 1, 0]) : cross(d, [1, 0, 0]));

class Builder {
  constructor(cls) {
    this.C = CLASSES[cls];
    this.segs = [];
    this.cards = [];
  }
  // a tapered tube from p0 (radius r0) to p1 (r1); v0 = bark length so far (m)
  seg(p0, r0, p1, r1, o) {
    if (this.segs.length < this.C.seg) this.segs.push({ p0, r0, p1, r1, ...o });
  }
  // a branch along points with radii; returns nothing
  branch(pts, radii, o) {
    let v = o.v0 || 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const L = len(sub(pts[k + 1], pts[k]));
      const t0 = k / (pts.length - 1), t1 = (k + 1) / (pts.length - 1);
      this.seg(pts[k], radii[k], pts[k + 1], radii[k + 1], { ...o, v0: v, v1: v + L, flex0: o.flex0 + (o.flex1 - o.flex0) * t0, flex1: o.flex0 + (o.flex1 - o.flex0) * t1 });
      v += L;
    }
  }
  // a leaf card: centre c, half extents U and V (vectors), light normal n
  card(c, U, V, o) {
    this.cards.push({ c, U, V, ...o });
  }
  finish() {
    const C = this.C, S = C.sides;
    const out = new Float32Array(C.rows * ROW_W * 4);
    let vi = 0;
    const put = (p, flex, n, ao, u, v, tile, pal, a, ph) => {
      out.set([p[0], p[1], p[2], flex, n[0], n[1], n[2], ao, u, v, tile, pal, a[0], a[1], a[2], ph], vi * 16);
      vi++;
    };
    for (let s = 0; s < C.seg; s++) {
      const g = this.segs[s];
      if (!g) {
        for (let k = 0; k < 2 * (S + 1); k++) put([0, -50, 0], 0, [0, 1, 0], 0, 0, 0, 24, 0, [0, -50, 0], 0);
        continue;
      }
      const d = norm(sub(g.p1, g.p0));
      const U = perpOf(d), V = cross(d, U);
      const circ = TAU * Math.max(g.r0, g.r1);
      const ku = Math.max(1, Math.round(circ / 0.9));
      for (const [p, r, f, v, ao] of [[g.p0, g.r0, g.flex0, g.v0, g.ao0 ?? g.ao ?? 1], [g.p1, g.r1, g.flex1, g.v1, g.ao1 ?? g.ao ?? 1]]) {
        for (let k = 0; k <= S; k++) {
          const a = (k / S) * TAU + (g.twist || 0);
          const nr = add(mul(U, Math.cos(a)), mul(V, Math.sin(a)));
          put(add(p, mul(nr, r)), f, nr, ao, (k / S) * ku, v / 0.9, g.tile, g.pal, p, g.phase || 0);
        }
      }
    }
    for (let k = 0; k < C.cards; k++) {
      const q = this.cards[k];
      if (!q) {
        for (let j = 0; j < 4; j++) put([0, -50, 0], 0, [0, 1, 0], 0, 0, 0, 0, 0, [0, -50, 0], 0);
        continue;
      }
      const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
      for (const [su, sv, u, v] of corners) {
        const p = add(q.c, add(mul(q.U, su), mul(q.V, sv)));
        const f = q.flexTop != null ? (v ? q.flexTop : q.flex) : q.flex;
        put(p, f, q.n, q.ao, u, v, q.tile, q.pal, q.c, q.phase || 0);
      }
    }
    return out;
  }
}

// a random card around point c: facing roughly `face`, half-size s, random roll
function cardAt(B, R, c, face, s, o) {
  const f = norm(face);
  const t0 = perpOf(f), t1 = cross(f, t0);
  const roll = R.range(0, TAU);
  const U = add(mul(t0, Math.cos(roll) * s), mul(t1, Math.sin(roll) * s));
  const V = add(mul(t0, -Math.sin(roll) * s), mul(t1, Math.cos(roll) * s));
  B.card(c, U, V, o);
}

const palCode = (a, b) => PAL[a] + 64 * PAL[b ?? a];

// Fill clumps with `count` cards. clumps: [{ c, r, ry, phase, pal, alt, tiles }];
// crown: { c, r: [rx, ry, rz] } for the soft whole-crown shading.
function fillClumps(B, R, clumps, crown, count, size, { hang = 0, up = 0.25, tiles } = {}) {
  const w = clumps.map((k) => k.r * k.r * (k.ry ?? k.r) / k.r);
  const tot = w.reduce((a, b) => a + b, 0);
  let left = count;
  clumps.forEach((k, ci) => {
    const n = ci === clumps.length - 1 ? left : Math.min(left, Math.round((count * w[ci]) / tot));
    left -= n;
    for (let j = 0; j < n; j++) {
      const d = randUnit(R);
      const rr = Math.pow(R.range(0.08, 1), 0.45);
      const p = add(k.c, [d[0] * k.r * rr, d[1] * (k.ry ?? k.r) * rr, d[2] * k.r * rr]);
      const toCrown = [(p[0] - crown.c[0]) / crown.r[0], (p[1] - crown.c[1]) / crown.r[1], (p[2] - crown.c[2]) / crown.r[2]];
      const dc = Math.min(1.3, len(toCrown));
      const n = norm(add(mul(norm(toCrown), 0.6), mul(d, 0.4)));
      const face = add(add(mul(d, 0.65), mul(randUnit(R), 0.45)), [0, up - hang, 0]);
      let ao = 0.22 + 0.5 * Math.pow(Math.min(1, dc), 1.5) + 0.28 * rr;
      ao *= 0.78 + 0.22 * Math.max(0, Math.min(1, (toCrown[1] + 1) * 0.75));
      const tl = (k.tiles || tiles);
      const flex = Math.min(1, 0.45 + 0.35 * Math.min(1, Math.hypot(p[0], p[2]) / Math.max(1, crown.r[0])) + 0.2 * rr);
      cardAt(B, R, p, face, size * R.range(0.8, 1.15), { n, ao: Math.min(1, ao), tile: R.pick(tl), pal: k.pal, phase: k.phase + R.range(-0.3, 0.3), flex });
    }
  });
}

// ---------------------------------------------------------------- species
// broadleaf: maple, maple2, oak
function broad(R, o, B, lod) {
  const H = o.H, oak = o.bark === 'oak';
  const trunkR = o.trunkR;
  const forkY = H * (o.fork + 0.06 + R.range(-0.03, 0.04));
  const lean = [R.range(-0.25, 0.25), 0, R.range(-0.25, 0.25)];
  const top = [lean[0], forkY, lean[2]];
  const bark = { tile: BARK_TILE[o.bark], pal: palCode(`bark_${o.bark}`), phase: 0 };
  B.branch([[0, -0.3, 0], [lean[0] * 0.2, forkY * 0.45, lean[2] * 0.2], top], [trunkR * 1.35, trunkR, trunkR * 0.86], { ...bark, flex0: 0, flex1: 0.05, ao: 0.9 });
  const C = [lean[0] * 0.6, H * o.crownY + 0.2, lean[2] * 0.6];
  const ry = (H - C[1]) * 0.98;
  const rx = H * o.crown[0] * 1.02;
  const crown = { c: C, r: [rx, ry, rx * R.range(0.88, 1)] };
  const nl = o.limbs + (oak ? 1 : 0);
  const clumps = [];
  const a0 = R.range(0, TAU);
  const limbs = [];
  for (let l = 0; l < nl; l++) {
    const az = a0 + (l / nl) * TAU + R.range(-0.35, 0.35);
    const el = oak ? R.range(0.15, 0.55) : R.range(0.45, 0.95);
    const dir = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
    const reach = R.range(0.62, 0.86);
    const end = add(C, [dir[0] * crown.r[0] * reach, (dir[1] * 0.9 - 0.15) * ry * reach + R.range(0, 0.6), dir[2] * crown.r[2] * reach]);
    const mid = add(lerp3(top, end, 0.5), [0, oak ? -0.2 : 0.5, 0]);
    const phase = R.range(0, TAU);
    limbs.push({ pts: [top, mid, end], phase });
    const lr = trunkR * (oak ? 0.62 : 0.55);
    B.branch([top, mid, end], [lr, lr * 0.6, lr * 0.22], { ...bark, flex0: 0.05, flex1: 0.45, phase, ao: 0.7 });
    clumps.push({ c: end, r: R.range(o.clumpR[0], o.clumpR[1]) * H / 9.5 * 1.05, phase, pal: 0 });
  }
  // a central leader
  const leadEnd = add(C, [R.range(-0.4, 0.4), ry * 0.55, R.range(-0.4, 0.4)]);
  const leadPh = R.range(0, TAU);
  B.branch([top, lerp3(top, leadEnd, 0.5), leadEnd], [trunkR * 0.55, trunkR * 0.35, trunkR * 0.12], { ...bark, flex0: 0.05, flex1: 0.4, phase: leadPh, ao: 0.6 });
  clumps.push({ c: leadEnd, r: o.clumpR[1] * H / 9.5, phase: leadPh, pal: 0 });
  // twigs off the limbs out to the crown surface, each ending in a clump
  const want = o.clumps + 2;
  let li = 0;
  while (clumps.length < want) {
    const L = limbs[li++ % limbs.length];
    const t = R.range(0.35, 0.95);
    const p = t < 0.5 ? lerp3(L.pts[0], L.pts[1], t * 2) : lerp3(L.pts[1], L.pts[2], (t - 0.5) * 2);
    const d = norm(add(randUnit(R), [0, 0.35, 0]));
    // push the end out to the crown shell
    const toC = sub(add(p, mul(d, 1.6)), C);
    const sh = len([toC[0] / crown.r[0], toC[1] / crown.r[1], toC[2] / crown.r[2]]) || 1;
    const f = R.range(0.68, 0.92) / sh;
    const end = add(C, mul(toC, f));
    const ph = L.phase + R.range(-0.5, 0.5);
    if (lod === 'near') B.branch([p, end], [0.07 * H / 9.5, 0.025], { ...bark, flex0: 0.35, flex1: 0.8, phase: ph, ao: 0.55 });
    clumps.push({ c: end, r: R.range(o.clumpR[0], o.clumpR[1]) * H / 9.5 * 0.9, phase: ph, pal: 0 });
  }
  // palette patches: most clumps the main colour, some the second
  for (const k of clumps) k.pal = R.chance(o.mix ?? 0.3) ? palCode(o.alt ?? o.leaf, o.leaf) : palCode(o.leaf, o.alt ?? o.leaf);
  const tiles = oak ? TILES.oak : TILES.maple;
  const n = B.C.cards;
  const size = (lod === 'near' ? 0.5 : 1.02) * (H / 9.5) * (oak ? 0.95 : 1);
  fillClumps(B, R, clumps, crown, n, size, { tiles });
  return { height: H, trunkR, crown };
}

// slender: birch, aspen (birch clumps of several stems)
function slim(R, o, B, lod) {
  const H = o.H, aspen = !!o.aspen;
  const stems = o.stems || 1;
  const bark = { tile: BARK_TILE[o.bark], pal: palCode(`bark_${o.bark}`), phase: 0 };
  const clumps = [];
  const rx = H * o.crownW * (aspen ? 1.25 : 1.5);
  const crownY0 = H * o.crownFrom;
  const crown = { c: [0, (crownY0 + H) / 2, 0], r: [rx + 0.4, (H - crownY0) / 2 + 0.3, rx + 0.4] };
  const sa = R.range(0, TAU);
  for (let s = 0; s < stems; s++) {
    const hs = H * (s === 0 ? 1 : R.range(0.78, 0.92));
    const la = sa + (s / stems) * TAU;
    const tilt = stems > 1 ? R.range(0.05, 0.12) : R.range(0, 0.04);
    const base = stems > 1 ? [Math.cos(la) * 0.18, -0.3, Math.sin(la) * 0.18] : [0, -0.3, 0];
    const lean = [Math.cos(la) * tilt * hs, 0, Math.sin(la) * tilt * hs];
    const wob = R.range(-0.25, 0.25);
    const pts = [0, 0.3, 0.6, 0.85, 1].map((t) => [base[0] + lean[0] * t * t + Math.sin(t * 5) * wob * 0.3, base[1] + (hs + 0.3) * t, base[2] + lean[2] * t * t + Math.cos(t * 4) * wob * 0.2]);
    const r0 = o.trunkR * (s === 0 ? 1 : 0.8);
    const stemPh = R.range(0, TAU);
    B.branch(lod === 'near' ? pts : [pts[0], pts[2], pts[4]], lod === 'near' ? [r0 * 1.2, r0, r0 * 0.75, r0 * 0.45, 0.03] : [r0 * 1.2, r0 * 0.75, 0.03], { ...bark, flex0: 0, flex1: 0.3, phase: stemPh, ao: 0.95 });
    // branches up the stem, birch tips drooping
    const nb = lod === 'near' ? (aspen ? 7 : 8) : 3;
    for (let b = 0; b < nb; b++) {
      const t = (o.crownFrom - 0.05) + (b / nb) * (0.95 - o.crownFrom) + R.range(-0.03, 0.03);
      const k = Math.min(3, Math.floor(t * 4));
      const p = lerp3(pts[k], pts[k + 1], t * 4 - k);
      const az = R.range(0, TAU);
      const reach = rx * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, (t - o.crownFrom) / (1 - o.crownFrom) * 0.9 + 0.15))) * R.range(0.75, 1.1);
      const out = [Math.cos(az), 0, Math.sin(az)];
      const m = add(p, add(mul(out, reach * 0.55), [0, reach * (aspen ? 0.7 : 0.5), 0]));
      const e = add(p, add(mul(out, reach), [0, reach * (aspen ? 0.6 : 0.2) - (o.droop || 0) * 0.8, 0]));
      const ph = R.range(0, TAU);
      if (lod === 'near') B.branch([p, m, e], [0.05, 0.03, 0.015], { ...bark, flex0: 0.2, flex1: 0.85, phase: ph, ao: 0.7 });
      else if (b < 2) B.branch([p, e], [0.05, 0.02], { ...bark, flex0: 0.2, flex1: 0.85, phase: ph, ao: 0.7 });
      const cr = R.range(o.clumpR[0], o.clumpR[1]) * 1.15;
      clumps.push({ c: lerp3(m, e, 0.55), r: cr, ry: cr * (aspen ? 1.0 : 1.35), phase: ph });
      clumps.push({ c: add(e, [0, -(o.droop || 0) * 0.3, 0]), r: cr * 0.85, ry: cr * (aspen ? 0.9 : 1.4), phase: ph });
    }
    clumps.push({ c: add(pts[4], [0, -0.3, 0]), r: o.clumpR[1] * 1.1, ry: o.clumpR[1] * 1.4, phase: stemPh });
  }
  for (const k of clumps) k.pal = R.chance(0.3) ? palCode(o.alt ?? o.leaf, o.leaf) : palCode(o.leaf, o.alt ?? o.leaf);
  const tiles = aspen ? TILES.aspen : TILES.birch;
  const size = lod === 'near' ? 0.4 : 0.8;
  fillClumps(B, R, clumps, crown, B.C.cards, size, { tiles, hang: aspen ? 0.1 : 0.35, up: 0.1 });
  return { height: H, trunkR: o.trunkR, crown };
}

// spruce and tamarack: whorls of drooping branches in a cone, bottle-brush sprays
function conifer(R, o, B, lod) {
  const H = o.H, tam = o.bark === 'tamarack';
  const bark = { tile: BARK_TILE[o.bark], pal: palCode(`bark_${o.bark}`), phase: 0 };
  const leaf = palCode(o.leaf, o.alt ?? o.leaf), leafAlt = palCode(o.alt ?? o.leaf, o.leaf);
  const tr = o.trunkR;
  const lean = [R.range(-0.15, 0.15), 0, R.range(-0.15, 0.15)];
  const tp = [0, 0.3, 0.6, 0.85, 1].map((t) => [lean[0] * t * t, -0.3 + (H + 0.3) * t, lean[2] * t * t]);
  B.branch(lod === 'near' ? tp : [tp[0], tp[2], tp[4]], lod === 'near' ? [tr * 1.3, tr, tr * 0.7, tr * 0.4, 0.03] : [tr * 1.3, tr * 0.7, 0.03], { ...bark, flex0: 0, flex1: 0.25, ao: 0.6 });
  const y0 = o.base, y1 = H - 0.4;
  const R0 = (o.R0 || 0.19) * H * 1.08;
  const tiers = o.tiers;
  const crown = { c: [0, (y0 + H) * 0.42, 0], r: [R0, (H - y0) * 0.6, R0] };
  const branches = [];
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = y0 + (y1 - y0) * Math.pow(f, 0.92) + R.range(-0.15, 0.15);
    const L = Math.max(0.35, R0 * Math.pow(1 - f, 0.95) * R.range(0.85, 1.12) + 0.25);
    const fans = Math.max(3, Math.round(o.fans * (0.65 + 0.35 * (1 - f))));
    const a0 = R.range(0, TAU);
    for (let b = 0; b < fans; b++) {
      const az = a0 + (b / fans) * TAU + R.range(-0.25, 0.25);
      const droop = (tam ? 0.18 : 0.32) + (o.droop || 0) * 0.5 + R.range(-0.08, 0.08);
      const out = [Math.cos(az), 0, Math.sin(az)];
      const p0 = add(lerp3(tp[0], tp[4], (y + 0.3) / (H + 0.3)), [0, 0, 0]);
      const Lb = L * R.range(0.85, 1.1);
      const e = add(p0, add(mul(out, Lb), [0, -droop * Lb + (f > 0.8 ? 0.2 : 0), 0]));
      const m = add(lerp3(p0, e, 0.5), [0, -droop * Lb * 0.15, 0]);
      branches.push({ p0, m, e, L: Lb, f, phase: R.range(0, TAU), out });
    }
  }
  // wood for the lower branches only (the budget is small; higher up the needles hide them)
  const woodB = lod === 'near' ? branches.filter((b) => b.f < 0.7) : [];
  for (const b of woodB) B.branch([b.p0, b.e], [0.045 + 0.03 * (1 - b.f), 0.012], { ...bark, flex0: 0.15, flex1: 0.75 + 0.2 * (1 - b.f), phase: b.phase, ao: 0.45 });
  // needle sprays along each branch, rolled around it so the tree is full from every side
  const total = B.C.cards;
  const shellN = Math.round(total * (lod === 'near' ? 0.5 : 0.65));
  const per = (total - shellN) / branches.length;
  let acc = 0, used = 0;
  const tiles = tam ? TILES.tamarack : TILES.spruce;
  const s0 = (lod === 'near' ? 0.52 : 0.95) * (H / 13) * (tam ? 0.95 : 1);
  for (const b of branches) {
    acc += per;
    let n = Math.floor(acc) - used;
    used += n;
    for (let j = 0; j < n; j++) {
      const t = (j + R.range(0.35, 0.9)) / n;
      const p = t < 0.5 ? lerp3(b.p0, b.m, Math.max(0.25, t) * 2) : lerp3(b.m, b.e, (t - 0.5) * 2);
      const along = norm(sub(b.e, b.p0));
      const side = cross(along, [0, 1, 0]);
      const roll = R.range(-1.2, 1.2) + (R.chance(0.5) ? 0 : Math.PI / 2);
      // card spans along the branch (V) and across it (U) at a roll about the branch
      const acrossDir = norm(add(mul(side, Math.cos(roll)), mul([0, 1, 0], Math.sin(roll))));
      const s = s0 * (0.7 + 0.5 * (1 - b.f)) * R.range(0.85, 1.15);
      const V = mul(along, s * 1.15);
      const U = mul(acrossDir, s * 0.95);
      const radial = norm([p[0], 0, p[2]]);
      const rr = Math.hypot(p[0], p[2]) / Math.max(0.3, b.L);
      const nn = norm(add(mul(radial, 0.75), [0, 0.55 + (tam ? 0.1 : 0), 0]));
      const ao = Math.min(1, (0.2 + 0.6 * rr) * (0.55 + 0.45 * b.f + 0.25) );
      B.card(add(p, mul(randUnit(R), 0.08)), U, V, { n: nn, ao, tile: R.pick(tiles), pal: R.chance(tam ? 0.35 : 0.2) ? leafAlt : leaf, phase: b.phase, flex: Math.min(1, 0.25 + 0.75 * rr * (1 - b.f * 0.3)) });
    }
  }
  // the outer skirt: sprays on the cone's surface facing out, so the silhouette is full
  for (let k = 0; k < shellN; k++) {
    const f = Math.pow(R.next(), 0.8);
    const y = y0 + (y1 + 0.3 - y0) * f;
    const rc = Math.max(0.25, R0 * Math.pow(Math.max(0, 1 - f), 0.95) + 0.2) * R.range(0.72, 1.0);
    const az = R.range(0, TAU);
    const radial = [Math.cos(az), 0, Math.sin(az)];
    const p = add(lerp3(tp[0], tp[4], (y + 0.3) / (H + 0.3)), add(mul(radial, rc), [0, -(tam ? 0.15 : 0.3) * rc, 0]));
    const nn = norm(add(mul(radial, 0.8), [0, 0.5, 0]));
    const face = add(add(mul(radial, 0.8), [0, 0.35, 0]), mul(randUnit(R), 0.4));
    const s = s0 * (0.85 + 0.45 * (1 - f)) * R.range(0.85, 1.2);
    cardAt(B, R, p, face, s, { n: nn, ao: Math.min(1, 0.55 + 0.35 * f + R.range(0, 0.15)), tile: R.pick(tiles), pal: R.chance(tam ? 0.35 : 0.2) ? leafAlt : leaf, phase: R.range(0, TAU), flex: 0.7 + 0.3 * R.next() });
  }
  return { height: H, trunkR: tr, crown };
}

// eastern white pine: tall bare trunk, a few long level limbs with flat tufts
function pine(R, o, B, lod) {
  const H = o.H;
  const bark = { tile: BARK_TILE.pine, pal: palCode('bark_pine'), phase: 0 };
  const leaf = palCode(o.leaf, o.leaf === 'pine' ? 'pineDeep' : 'pine');
  const tr = o.trunkR;
  const lean = [R.range(-0.35, 0.35), 0, R.range(-0.35, 0.35)];
  const tp = [0, 0.35, 0.65, 0.85, 1].map((t) => [lean[0] * t * t + Math.sin(t * 6) * 0.08, -0.3 + (H + 0.3) * t, lean[2] * t * t]);
  B.branch(tp, [tr * 1.35, tr, tr * 0.75, tr * 0.5, 0.05], { ...bark, flex0: 0, flex1: 0.2, ao: 0.85 });
  const levels = o.levels || 6;
  const clumps = [];
  const y0 = H * 0.45;
  for (let l = 0; l < levels; l++) {
    const f = l / (levels - 1);
    const y = y0 + (H - 0.8 - y0) * f;
    const k = Math.min(3, Math.floor(((y + 0.3) / (H + 0.3)) * 4));
    const p = lerp3(tp[k], tp[k + 1], ((y + 0.3) / (H + 0.3)) * 4 - k);
    const nb = l === levels - 1 ? 1 : R.int(1, 3);
    for (let b = 0; b < nb; b++) {
      const az = R.range(0, TAU);
      const L = (l === levels - 1 ? 0.6 : R.range(1.4, 2.8) * (1 - f * 0.5)) * H / 13;
      const out = [Math.cos(az), 0, Math.sin(az)];
      const e = add(p, add(mul(out, L), [0, L * 0.25 + 0.2, 0]));
      const m = add(lerp3(p, e, 0.5), [0, -0.15, 0]);
      const ph = R.range(0, TAU);
      B.branch([p, m, e], [0.13 * (1 - f * 0.5), 0.07, 0.03], { ...bark, flex0: 0.1, flex1: 0.6, phase: ph, ao: 0.6 });
      clumps.push({ c: add(e, [0, 0.15, 0]), r: R.range(1.0, 1.5) * H / 13, ry: R.range(0.45, 0.65), phase: ph });
      clumps.push({ c: add(m, [0, 0.25, 0]), r: R.range(0.7, 1.0) * H / 13, ry: 0.45, phase: ph });
    }
  }
  for (const k of clumps) k.pal = leaf;
  const crown = { c: [0, (y0 + H) / 2, 0], r: [2.6 * H / 13, (H - y0) / 2, 2.6 * H / 13] };
  fillClumps(B, R, clumps, crown, B.C.cards, (lod === 'near' ? 0.5 : 1.0) * H / 13, { tiles: TILES.pine, up: 0.6 });
  return { height: H, trunkR: tr, crown };
}

// ---- small plants (one class, drawn near only)
function bush(R, o, B) {
  const H = 1.25;
  const stem = { tile: BARK_TILE.stem, pal: palCode('bark_stem'), phase: 0 };
  const clumps = [];
  const n = R.int(4, 6);
  for (let k = 0; k < n; k++) {
    const az = (k / n) * TAU + R.range(-0.4, 0.4);
    const out = [Math.cos(az), 0, Math.sin(az)];
    const r = R.range(0.25, 0.55);
    const e = add(mul(out, r), [0, R.range(0.55, 0.95), 0]);
    const ph = R.range(0, TAU);
    B.branch([[0, -0.05, 0], e], [0.035, 0.012], { ...stem, flex0: 0.1, flex1: 0.9, phase: ph, ao: 0.4 });
    clumps.push({ c: e, r: R.range(0.32, 0.45), ry: R.range(0.28, 0.38), phase: ph });
  }
  clumps.push({ c: [0, 0.85, 0], r: 0.45, ry: 0.35, phase: R.range(0, TAU) });
  for (const k of clumps) k.pal = R.chance(0.3) ? palCode(o.alt ?? o.leaf, o.leaf) : palCode(o.leaf, o.alt ?? o.leaf);
  const crown = { c: [0, 0.6, 0], r: [0.75, 0.6, 0.75] };
  fillClumps(B, R, clumps, crown, B.C.cards, 0.24, { tiles: TILES.bush, up: 0.3 });
  for (const q of B.cards) q.flex = Math.min(1, 0.35 + q.c[1] * 0.6);
  return { height: H, trunkR: 0.05, crown };
}

function fern(R, o, B) {
  const n = B.C.cards;
  const fr = Math.min(n, R.int(9, 13));
  const pal = palCode(o.leaf, o.alt ?? o.leaf);
  for (let k = 0; k < fr; k++) {
    const az = (k / fr) * TAU + R.range(-0.3, 0.3);
    const out = [Math.cos(az), 0, Math.sin(az)];
    const el = R.range(0.5, 1.1);
    const L = R.range(0.55, 0.85);
    const along = norm(add(mul(out, Math.cos(el)), [0, Math.sin(el), 0]));
    const across = norm(cross(along, [0, 1, 0]));
    const c = mul(along, L * 0.5);
    const tilt = R.range(-0.4, 0.4);
    const U = mul(norm(add(across, mul([0, 1, 0], tilt))), L * 0.32);
    const V = mul(along, L * 0.5);
    const nrm = norm(add(mul(out, 0.6), [0, 0.8, 0]));
    B.card(c, U, V, { n: nrm, ao: 0.75, tile: R.pick(TILES.fern), pal: R.chance(0.3) ? palCode(o.alt ?? o.leaf, o.leaf) : pal, phase: R.range(0, TAU), flex: 0.05, flexTop: 0.95 });
  }
  return { height: 0.9, trunkR: 0.05, crown: { c: [0, 0.35, 0], r: [0.6, 0.4, 0.6] } };
}

function sapling(R, o, B) {
  const H = R.range(1.4, 1.9);
  const stem = { tile: BARK_TILE[o.type === 'birch' ? 'birch' : 'stem'], pal: palCode(o.type === 'birch' ? 'bark_birch' : 'bark_stem'), phase: 0 };
  const lean = [R.range(-0.1, 0.1), 0, R.range(-0.1, 0.1)];
  const top = [lean[0], H, lean[2]];
  B.branch([[0, -0.05, 0], [lean[0] * 0.3, H * 0.5, lean[2] * 0.3], top], [0.035, 0.025, 0.01], { ...stem, flex0: 0.05, flex1: 1, phase: R.range(0, TAU), ao: 0.7 });
  const clumps = [];
  const spruce = o.type === 'spruce';
  if (spruce) {
    // a little cone of sprays
    const crown = { c: [0, H * 0.5, 0], r: [0.45, H * 0.5, 0.45] };
    for (let k = 0; k < B.C.cards; k++) {
      const f = R.range(0.15, 0.95);
      const az = R.range(0, TAU);
      const r = 0.5 * (1 - f) + 0.08;
      const c = [Math.cos(az) * r * R.range(0.4, 1), H * f, Math.sin(az) * r * R.range(0.4, 1)];
      const n = norm([Math.cos(az), 0.6, Math.sin(az)]);
      cardAt(B, R, c, add(n, mul(randUnit(R), 0.5)), 0.17, { n, ao: 0.5 + 0.5 * f, tile: TILES.sapSpruce[0], pal: palCode(o.leaf, o.leaf), phase: R.range(0, TAU), flex: 0.3 + f * 0.7 });
    }
    return { height: H, trunkR: 0.04, crown };
  }
  for (let k = 0; k < 4; k++) {
    const t = R.range(0.45, 0.9), az = R.range(0, TAU);
    const p = [lean[0] * t, H * t, lean[2] * t];
    const e = add(p, [Math.cos(az) * 0.4, 0.25, Math.sin(az) * 0.4]);
    const ph = R.range(0, TAU);
    B.branch([p, e], [0.012, 0.006], { ...stem, flex0: 0.5, flex1: 1, phase: ph, ao: 0.7 });
    clumps.push({ c: e, r: 0.26, ry: 0.22, phase: ph });
  }
  clumps.push({ c: top, r: 0.28, ry: 0.24, phase: R.range(0, TAU) });
  for (const k of clumps) k.pal = palCode(o.leaf, o.leaf);
  const crown = { c: [0, H * 0.75, 0], r: [0.5, 0.45, 0.5] };
  fillClumps(B, R, clumps, crown, B.C.cards, 0.17, { tiles: o.type === 'birch' ? TILES.sapBirch : TILES.sapMaple });
  for (const q of B.cards) q.flex = Math.min(1, 0.4 + q.c[1] / H * 0.6);
  return { height: H, trunkR: 0.04, crown };
}

const BUILD = { maple: broad, maple2: broad, oak: broad, birch: slim, aspen: slim, spruce: conifer, tamarack: conifer, pine, bushRed: bush, bushOrange: bush, fern, sapling };

// species + palette variant + class -> { data: Float32Array (rows * ROW_W * 4), meta }
export function buildModel(species, seed, cls) {
  const spec = SPRITES[species];
  const v = spec.variants[seed % spec.variants.length];
  const o = { H: spec.H, ...spec.base, ...v };
  // the same shape for every LOD of one variant
  const R = makeRng(seed * 7919 + species.length * 131 + species.charCodeAt(0) * 17 + 3);
  const B = new Builder(cls);
  const meta = BUILD[species](R, o, B, cls);
  return { data: B.finish(), meta: { ...meta, segs: B.segs.length, cards: Math.min(B.cards.length, B.C.cards) } };
}

// index buffer shared by every model of a class
export function classIndex(cls) {
  const C = CLASSES[cls], S = C.sides;
  const idx = [];
  for (let s = 0; s < C.seg; s++) {
    const b = s * 2 * (S + 1);
    for (let k = 0; k < S; k++) {
      const a = b + k, c = b + k + 1, d = b + S + 1 + k, e = b + S + 1 + k + 1;
      idx.push(a, d, c, c, d, e);
    }
  }
  for (let q = 0; q < C.cards; q++) {
    const b = C.segVerts + q * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return idx;
}
