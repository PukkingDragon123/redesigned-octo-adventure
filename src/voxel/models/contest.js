// Voxel props for the pumpkin carving contest on Main Street: trestle tables under
// checked cloths (bowls of guts and seeds, carving knives, scoops, little saws and
// markers), pumpkins half-way through (lid off, the face drawn on in marker), the
// judges' table with its rosettes, bunting, a stand for the finished entries and
// heaps of fallen leaves. (No painted signs: the contest speaks for itself, and Gus
// does the announcing.)
//
// Builders return { vox, size, origin, jitter, meta } like props.js: size is metres
// per voxel, origin the pivot in voxel units, meta lengths in metres (meta.top is a
// table's top surface).
import { Vox, tone, EMIT } from '../vox.js';
import * as PR from './props.js';

const FINE = 0.025, STD = 0.05;
const WOOD = 0x8a5a32, WOOD_D = 0x5e3a1e, WOOD_L = 0xab7642;
const METAL = 0xc4cad2, METAL_D = 0x8a909a;
const ROPE = 0xc8b088;
const GUTS = [0xe8862a, 0xf0a040, 0xd8701e], SEED = 0xf6ecd0, MARKER = 0x2a1a14;
const GINGHAM = {
  red: [0xf4ece0, 0xe89a90, 0xc8382e],
  orange: [0xf6eedc, 0xf2b070, 0xe0701e],
  green: [0xf2eee0, 0x9cc08a, 0x4a7a3a],
  blue: [0xf2eee8, 0x98b0d8, 0x3a5a9a],
};
export const BUNTING_COLORS = [0xe8781e, 0xf2e6c8, 0xc8382e, 0xe8b830, 0x5a8a3a, 0x8a4a2a];

const r3 = (x) => Math.round(x * 1000) / 1000;
// voxel index coords -> metres relative to a pivot (index coords too)
const metres = (size, o, x, y, z) => [r3((x + 0.5 - o[0]) * size), r3((y - o[1]) * size), r3((z + 0.5 - o[2]) * size)];

// ---------------------------------------------------------------- faces (rows top -> bottom)
export const FACES = {
  happy: [
    '.##......##.',
    '####....####',
    '............',
    '.....##.....',
    '............',
    '#..........#',
    '.##......##.',
    '..########..',
  ],
  maple: [
    '.....##.....',
    '..#..##..#..',
    '..########..',
    '#.########.#',
    '############',
    '.##########.',
    '...######...',
    '.....##.....',
    '.....##.....',
  ],
  cat: [
    '#..........#',
    '##........##',
    '###......###',
    '.#.#....#.#.',
    '............',
    '.....##.....',
    '..#..##..#..',
    '...##..##...',
  ],
  wink: [
    '.##.........',
    '####...####.',
    '............',
    '.....#......',
    '....###.....',
    '#..........#',
    '.#..####..#.',
    '..##....##..',
  ],
  owl: [
    '.###....###.',
    '#...#..#...#',
    '#.#.#..#.#.#',
    '.###....###.',
    '.....##.....',
    '......#.....',
    '............',
    '...######...',
  ],
  heart: [
    '.##.##..##.##',
    '#####..#####.',
    '.###....###..',
    '..#......#...',
    '.............',
    '.#.........#.',
    '..#########..',
  ],
};

// paint the frontmost (largest z) voxel at (x, y); returns its z or -1
function front(v, x, y, c) {
  for (let z = v.d - 1; z >= 0; z--) if (v.get(x, y, z)) { if (c) v.set(x, y, z, c); return z; }
  return -1;
}
// the outline of a face grid drawn in marker on the front of a pumpkin,
// mapped like props.js carves its faces (so a half-carved one lines up)
function sketchFace(v, rows, cx, fy, maxW, maxH, onlyRows = null) {
  const R = rows.length, C = Math.max(...rows.map((r) => r.length));
  const s = Math.max(1, Math.min(Math.floor(maxW / C), Math.floor(maxH / R)));
  const at = (gx, gy) => rows[gy]?.[gx] === '#';
  const w = C * s, h = R * s;
  const x0 = Math.round(cx - w / 2 + 0.5), yTop = Math.round(fy + h / 2 - 0.5);
  for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) {
    const gx = Math.floor(px / s), gy = Math.floor(py / s);
    if (!at(gx, gy) || (onlyRows && !onlyRows(gy))) continue;
    // outline only: a cell on the shape's edge (or the edge of a scaled-up cell)
    const edge = !at(Math.floor((px - 1) / s), gy) || !at(Math.floor((px + 1) / s), gy) || !at(gx, Math.floor((py - 1) / s)) || !at(gx, Math.floor((py + 1) / s));
    if (edge) front(v, x0 + px, yTop - py, MARKER);
  }
}

// ---------------------------------------------------------------- pumpkins in progress
const JACK = { small: [8, 7.5], medium: [11, 9.8], big: [13.5, 11.5] };
// stage 'sketch': face drawn on; 'lid': lid off and hollowed, face drawn on;
// 'half': the eyes carved, the mouth still in marker (unlit)
export function wipPumpkin({ kind = 'medium', seed = 1, face = 'happy', stage = 'lid', color = 'orange' } = {}) {
  const rows = FACES[face] || FACES.happy;
  if (stage === 'half') {
    const [rx, ry] = JACK[kind] || JACK.medium;
    const cut = Math.ceil(rows.length * 0.45);
    const eyes = rows.map((r, i) => (i < cut ? r : r.replace(/#/g, '.')));
    const res = PR.jackOLantern({ face: eyes, kind, seed, color, lit: false, hollow: false });
    sketchFace(res.vox, rows, res.origin[0] - 0.5, ry + ry * 0.06, Math.floor(rx * 1.4), Math.floor(ry * 1.25), (gy) => gy >= cut);
    return res;
  }
  const base = PR.pumpkin({ kind, seed, color, leaf: false, vine: false });
  const b = base.vox;
  const cx = base.origin[0] - 0.5, cz = base.origin[2] - 0.5;
  // measure the body: its top (away from the stem) and its half-width at mid height
  let top = 0, rx = 0;
  for (let z = 0; z < b.d; z++) for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
    if (!b.get(x, y, z)) continue;
    if (Math.hypot(x - cx, z - cz) >= 4.5) top = Math.max(top, y);
  }
  const ry = (top + 1) / 2;
  for (let x = 0; x < b.w; x++) if (b.get(x, Math.round(ry), Math.round(cz))) rx = Math.max(rx, Math.abs(x - cx));
  const pad = stage === 'lid' ? Math.ceil(rx * 1.3) + 2 : 0;
  const v = new Vox(b.w + pad, b.h, b.d);
  v.blit(b, 0, 0, 0);
  if (stage === 'lid') {
    const yCut = Math.round(top * 0.8), lr = rx * 0.48;
    const lid = [];
    for (let z = 0; z < v.d; z++) for (let y = yCut; y < v.h; y++) for (let x = 0; x < b.w; x++) {
      const c = v.get(x, y, z);
      if (!c) continue;
      const a = Math.atan2(z - cz, x - cx);
      if (Math.hypot(x - cx, z - cz) > lr + (Math.floor((a + Math.PI) * 2.2) % 2 ? 0.6 : -0.4)) continue;
      lid.push([x, y, z, c]);
      v.set(x, y, z, 0);
    }
    // hollow it out: the rind stays, the flesh shows, guts and seeds at the bottom
    const inside = (x, y, z) => ((x - cx) / (rx - 2.2)) ** 2 + ((y + 0.5 - ry) / (ry - 2)) ** 2 + ((z - cz) / (rx - 2.2)) ** 2 <= 1;
    for (let z = 0; z < v.d; z++) for (let y = 2; y < v.h; y++) for (let x = 0; x < b.w; x++) if (inside(x, y, z)) v.set(x, y, z, 0);
    for (let z = 0; z < v.d; z++) for (let y = 1; y < v.h; y++) for (let x = 0; x < b.w; x++) {
      if (!v.get(x, y, z)) continue;
      if (inside(x + 1, y, z) || inside(x - 1, y, z) || inside(x, y, z + 1) || inside(x, y, z - 1) || inside(x, y + 1, z)) {
        const h = (x * 7 + y * 13 + z * 5 + seed) % 9;
        v.set(x, y, z, h < 2 ? GUTS[h] : h === 4 ? SEED : 0xf6c062);
      }
    }
    for (let k = 0; k < 14; k++) {
      const a = k * 2.4, r = (k % 4) * 1.2;
      v.set(Math.round(cx + Math.cos(a) * r), 2 + (k % 2), Math.round(cz + Math.sin(a) * r), k % 3 ? GUTS[k % 3] : SEED);
    }
    // the lid sits beside it, stem up
    const dx = Math.round(b.w - cx + pad / 2 - 1), dy = -yCut;
    for (const [x, y, z, c] of lid) v.set(x + dx, y + dy, z, c);
  }
  sketchFace(v, rows, cx, ry * 1.04, Math.floor(rx * 1.3), Math.floor(ry * 1.1));
  return { vox: v, size: FINE, origin: base.origin, jitter: 0, meta: { radius: r3(rx * FINE), kind, stage } };
}

// ---------------------------------------------------------------- little things on the tables (FINE voxels)
function knife(v, x, y, z, flip = 1) {
  v.fill(x, y, z, x + 4 * flip, y, z + 1, 0x6a4224); // handle
  v.set(x + 5 * flip, y, z, METAL_D); v.set(x + 5 * flip, y, z + 1, METAL_D);
  v.fill(x + 6 * flip, y, z, x + 10 * flip, y, z, METAL); // blade
  v.set(x + 6 * flip, y, z + 1, METAL); v.set(x + 7 * flip, y, z + 1, METAL);
}
function spoon(v, x, y, z) {
  v.fill(x, y, z, x, y, z + 6, METAL_D);
  v.fill(x - 1, y, z + 7, x + 1, y, z + 9, METAL);
  v.set(x, y + 1, z + 8, METAL);
}
function saw(v, x, y, z) {
  v.fill(x, y, z, x + 2, y, z + 1, 0xe8b830); // yellow handle
  v.fill(x + 3, y, z, x + 9, y, z, METAL);
  for (let k = 0; k < 7; k += 2) v.set(x + 3 + k, y, z + 1, METAL_D);
}
function marker(v, x, y, z) {
  v.fill(x, y, z, x + 4, y, z, 0x2a2a30);
  v.set(x + 5, y, z, 0xf2f0ea);
}
function paper(v, x0, y, z0, w, d) {
  for (let z = z0; z < z0 + d; z++) for (let x = x0; x < x0 + w; x++) v.set(x, y, z, (z - z0) % 3 === 1 && x > x0 + 1 && x < x0 + w - 2 ? 0xb8b2a4 : 0xe8e2d2);
}
// a ceramic bowl heaped with stringy orange guts and pale seeds
function bowl(v, cx, y, cz, seeds = false) {
  for (let z = cz - 5; z <= cz + 5; z++) for (let x = cx - 5; x <= cx + 5; x++) {
    const d = Math.hypot(x - cx, z - cz);
    if (d > 5.2) continue;
    if (d > 3.9) { v.fill(x, y, z, x, y + 2, z, (x + z) % 2 ? 0x4a6aa8 : 0xe8e0d0); v.set(x, y + 3, z, 0x3a5a9a); }
    else {
      v.set(x, y, z, 0xe8e0d0);
      const h = Math.round(3.4 - d * 0.5);
      for (let k = 1; k <= h; k++) v.set(x, y + k, z, seeds ? ((x * 3 + z * 5 + k) % 3 ? SEED : 0xe8d8b0) : (x * 5 + z * 3 + k) % 4 ? GUTS[(x + z + k) % 3] : SEED);
    }
  }
}

// ---------------------------------------------------------------- trestle tables
function trestles(v, x0, x1, zc, H) {
  for (const tx of [x0 + 10, x1 - 10]) {
    for (const s of [-1, 1]) v.fill(tx - 1, 0, zc + s * 12 - 1, tx + 1, H - 3, zc + s * 12 + 1, WOOD);
    v.fill(tx - 1, 9, zc - 13, tx + 1, 10, zc + 13, WOOD_D);
  }
  v.fill(x0 + 10, 12, zc - 1, x1 - 10, 13, zc + 1, WOOD_D);
}
// a cloth over the top that hangs down all round; col(a, b) picks the colour
function cloth(v, x0, x1, z0, z1, H, drop, col, seed = 1) {
  v.fill(x0 - 1, H, z0 - 1, x1 + 1, H, z1 + 1, (x, y, z) => col(x, z));
  for (let y = H - drop; y < H; y++) {
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      v.set(x, y, z0 - 1, col(x, y));
      v.set(x, y, z1 + 1, col(x, y));
    }
    for (let z = z0 - 1; z <= z1 + 1; z++) { v.set(x0 - 1, y, z, col(z, y)); v.set(x1 + 1, y, z, col(z, y)); }
  }
}

// contestTable({ len, seed, cloth }) — a 0.9 m deep trestle table under a gingham cloth,
// two places set for carving (newspaper, a bowl of guts, knife, scoop, saw, marker).
// Local -z is the carvers' side, +z faces the crowd. meta.places: where their pumpkins go.
export function contestTable({ len = 3.6, seed = 1, cloth: cl = 'red', places = 2 } = {}) {
  const L = Math.round(len / FINE), D = 36, H = 31;
  const v = new Vox(L + 6, H + 8, D + 6);
  const x0 = 3, x1 = x0 + L - 1, z0 = 3, z1 = z0 + D - 1, zc = (z0 + z1) >> 1;
  trestles(v, x0, x1, zc, H);
  v.fill(x0, H - 2, z0, x1, H - 1, z1, WOOD_L);
  const pal = GINGHAM[cl] || GINGHAM.red;
  cloth(v, x0, x1, z0, z1, H, 9, (a, b) => { const p = Math.floor(a / 6) % 2, q = Math.floor(b / 6) % 2; return p && q ? pal[2] : p || q ? pal[1] : pal[0]; }, seed);
  const y = H + 1;
  const cx = (x0 + x1) / 2, origin = [cx + 0.5, 0, zc + 0.5];
  const spots = [];
  const R = PR.rng(seed * 11 + 5);
  const step = L / places;
  for (let i = 0; i < places; i++) {
    const px = Math.round(x0 + step * (i + 0.5));
    paper(v, px - 9, y, zc - 8, 18, 15);
    const side = i % 2 ? -1 : 1;
    bowl(v, px + side * 15, y, z0 + 8, R() < 0.4);
    knife(v, px - 6, y, z0 + 2, 1);
    spoon(v, px + side * 9, y, z0 + 1);
    if (R() < 0.6) saw(v, px - side * 14 - 4, y, z1 - 6);
    if (R() < 0.7) marker(v, px + 4, y, z1 - 4);
    // seeds and strings of guts scattered about
    for (let k = 0; k < 9; k++) v.set(px + Math.round((R() - 0.5) * 26), y, zc + Math.round((R() - 0.5) * 24), R() < 0.5 ? SEED : GUTS[k % 3]);
    const [mx, , mz] = metres(FINE, origin, px, 0, zc - 1);
    spots.push({ x: mx, z: mz });
  }
  return { vox: v, size: FINE, origin, jitter: 0, meta: { top: r3((y) * FINE), places: spots, box: [r3((L + 2) * FINE), r3((H + 1) * FINE), r3((D + 2) * FINE)] } };
}

// a rosette ribbon pinned to the front of a cloth (facing +z at plane z)
function rosette(v, cx, cy, z, col) {
  for (let y = -6; y <= 3; y++) for (let x = -3; x <= 3; x++) {
    const d = Math.hypot(x, y);
    if (y <= 0 && d <= 3.2) v.set(cx + x, cy + y, z, d < 1.4 ? 0xe8c050 : (Math.atan2(y, x) * 4) % 2 > 1 ? col : tone(col, -0.15));
  }
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) { v.set(cx + s * (1 + (k >> 2)), cy - 3 - k, z, col); if (k < 5) v.set(cx + s * (2 + (k >> 2)), cy - 3 - k, z, tone(col, -0.12)); }
}
// judgesTable({ len }) — a burgundy cloth with a gold fringe and three rosettes on
// the front; score cards, a pencil pot and a mug on top
export function judgesTable({ len = 2.8 } = {}) {
  const L = Math.round(len / FINE), D = 36, H = 31;
  const v = new Vox(L + 6, H + 8, D + 6);
  const x0 = 3, x1 = x0 + L - 1, z0 = 3, z1 = z0 + D - 1, zc = (z0 + z1) >> 1;
  trestles(v, x0, x1, zc, H);
  v.fill(x0, H - 2, z0, x1, H - 1, z1, WOOD_L);
  const BURG = 0x7a2a3a;
  cloth(v, x0, x1, z0, z1, H, 14, (a, b) => (b === H - 14 ? ((a & 1) ? 0xe0b040 : 0xc89a30) : (a % 9 === 0 ? tone(BURG, -0.06) : BURG)), 3);
  const fz = z1 + 2; // just proud of the front cloth
  const cx = (x0 + x1) / 2, origin = [cx + 0.5, 0, zc + 0.5];
  [[0x3a6ad0, -36], [0xc8382e, -26], [0xe8b830, -16]].forEach(([c, dx]) => rosette(v, Math.round(cx + dx), H - 3, fz, c));
  const y = H + 1;
  paper(v, Math.round(cx) - 30, y, zc - 6, 10, 8); paper(v, Math.round(cx) - 27, y + 1, zc - 5, 10, 8);
  for (let z = zc - 4; z <= zc - 1; z++) for (let x = Math.round(cx) + 22; x <= Math.round(cx) + 25; x++) v.fill(x, y, z, x, y + 3, z, (x + z) % 2 ? 0x3a5a9a : 0x4a6aa8); // pencil pot
  v.fill(Math.round(cx) + 23, y + 4, zc - 3, Math.round(cx) + 23, y + 6, zc - 3, 0xe8b830);
  v.fill(Math.round(cx) + 24, y + 4, zc - 2, Math.round(cx) + 24, y + 7, zc - 2, 0xe8b830);
  for (let z = zc + 4; z <= zc + 7; z++) for (let x = Math.round(cx) + 30; x <= Math.round(cx) + 33; x++) v.fill(x, y, z, x, y + 3, z, 0xc8382e); // a mug of cocoa
  return { vox: v, size: FINE, origin, jitter: 0, meta: { top: r3(y * FINE), trophy: metres(FINE, origin, Math.round(cx) - 4, y, zc + 2) } };
}

// entryStand({ len }) — two plank tiers on crates where the finished jack-o'-lanterns
// wait for the judges; meta.tiers: the heights (and z) of the two shelves
export function entryStand({ len = 2.8 } = {}) {
  const L = Math.round(len / STD);
  const v = new Vox(L + 2, 18, 18);
  const x0 = 1, x1 = L;
  for (const tx of [x0, (x0 + x1) >> 1, x1 - 2]) { v.fill(tx, 0, 2, tx + 2, 8, 8, (x, y) => (y % 4 === 0 ? WOOD_D : WOOD)); v.fill(tx, 0, 9, tx + 2, 14, 15, (x, y) => (y % 4 === 0 ? WOOD_D : WOOD)); }
  v.fill(x0, 9, 1, x1, 9, 8, (x) => (x % 6 ? WOOD_L : WOOD));
  v.fill(x0, 15, 9, x1, 15, 16, (x) => (x % 6 ? WOOD_L : WOOD));
  // a strip of bunting tacked along the front edge
  for (let x = x0; x <= x1; x++) { const k = Math.floor((x - x0) / 3); if ((x - x0) % 3 < 2) v.set(x, 8 - ((x - x0) % 3 === 1 ? 1 : 0), 0, BUNTING_COLORS[k % BUNTING_COLORS.length]); }
  return { vox: v, size: STD, origin: [(L + 2) / 2, 0, 9], jitter: 0, meta: { tiers: [{ y: 0.5, z: r3((4.5 - 9) * STD) }, { y: 0.8, z: r3((12.5 - 9) * STD) }] } };
}

// ---------------------------------------------------------------- bunting & poles
// bunting({ len, sag, seed }) — a sagging string of little triangle flags from (0,0,0)
// along +x; hang it from two poles of the same height
export function bunting({ len = 12, sag = 0.45, seed = 1 } = {}) {
  const n = Math.round(len / STD), sg = Math.max(1, Math.round(sag / STD));
  const yTop = sg + 9;
  const v = new Vox(n + 1, yTop + 1, 1);
  const yAt = (x) => yTop - Math.round(sg * 4 * (x / n) * (1 - x / n));
  for (let x = 0; x <= n; x++) v.set(x, yAt(x), 0, ROPE);
  let k = seed;
  for (let x = 3; x + 6 <= n - 2; x += 10, k++) {
    const c = BUNTING_COLORS[k % BUNTING_COLORS.length];
    const yb = yAt(x + 3);
    [3, 2, 1, 0].forEach((w, i) => v.fill(x + 3 - w, yb - 1 - i * 1.5, 0, x + 3 + w, yb - 2 - i * 1.5, 0, c));
  }
  return { vox: v, size: STD, origin: [0, yTop, 0.5], jitter: 0, meta: {} };
}

// pole({ h }) — a plain painted post for the bunting
export function pole({ h = 4.4 } = {}) {
  const n = Math.round(h / STD);
  const v = new Vox(5, n + 2, 5);
  v.fill(1, 0, 1, 3, n, 3, (x, y) => (y < 4 ? WOOD_D : Math.floor(y / 12) % 2 ? 0xf2ece0 : 0x2f6e4a));
  v.fill(0, n + 1, 0, 4, n + 1, 4, WOOD_D);
  return { vox: v, size: STD, origin: [2.5, 0, 2.5], jitter: 0, meta: { top: r3((n + 2) * STD) } };
}

// ---------------------------------------------------------------- leaves
// leafPile({ seed, r }) — a raked heap of red, orange, gold and brown maple leaves
export function leafPile({ seed = 1, r = 0.55 } = {}) {
  const R = PR.rng(seed * 19 + 2);
  const rx = Math.round(r / STD), rz = Math.round(rx * (0.75 + R() * 0.2)), hh = Math.max(3, Math.round(rx * 0.5));
  const v = new Vox(rx * 2 + 5, hh + 3, rz * 2 + 5);
  const cx = rx + 2, cz = rz + 2;
  const COLS = [0xc8382e, 0xe0701e, 0xe8b830, 0x9a5a2a, 0xd8862a, 0xb84a22];
  const col = (x, z) => COLS[(((Math.floor(x / 2) * 7 + Math.floor(z / 2) * 13 + seed * 5) * 2654435761) >>> 0) % COLS.length];
  const p1 = R() * 6, p2 = R() * 6;
  for (let z = 0; z < v.d; z++) for (let x = 0; x < v.w; x++) {
    const a = Math.atan2(z - cz, x - cx);
    const q = Math.hypot((x - cx) / rx, (z - cz) / rz) / (1 + 0.12 * Math.sin(a * 3 + p1) + 0.08 * Math.sin(a * 5 + p2));
    if (q > 1) continue;
    const h = Math.round(hh * Math.pow(1 - q * q, 0.7));
    v.fill(x, 0, z, x, h, z, col(x, z));
  }
  // a few loose leaves around the foot
  for (let i = 0; i < 10; i++) {
    const a = R() * 6.28, d = 1.05 + R() * 0.35;
    const x = Math.round(cx + Math.cos(a) * rx * d), z = Math.round(cz + Math.sin(a) * rz * d);
    if (!v.get(x, 0, z)) v.set(x, 0, z, COLS[i % COLS.length]);
  }
  return { vox: v, size: STD, origin: [cx + 0.5, 0, cz + 0.5], jitter: 0, meta: { radius: r3(rx * STD) } };
}

// simplePumpkin({ r, seed, color }) — a plain, cheap pumpkin for piles and hay tops
const SIMPLE = { orange: [0xe8781e, 0xc4601a, 0xf6993a], amber: [0xec9022, 0xbc6618, 0xf8b24c], white: [0xebe4d4, 0xbab4b2, 0xfff4e0], red: [0xd85a1c, 0xa23c16, 0xec7c34] };
export function simplePumpkin({ r = 0.22, seed = 1, color = 'orange' } = {}) {
  const pal = SIMPLE[color] || SIMPLE.orange;
  const rx = r / STD, ry = rx * 0.75;
  const W = Math.ceil(rx) * 2 + 3, c = (W - 1) / 2;
  const v = new Vox(W, Math.ceil(ry * 2) + 4, W);
  const ph = seed * 0.7;
  v.ellipsoid(c, ry, c, rx, ry, rx, (x, y, z) => (y > ry * 1.55 ? pal[2] : Math.floor(((Math.atan2(z - c, x - c) + Math.PI + ph) / (Math.PI * 2)) * 10) % 2 ? pal[0] : pal[1]));
  const top = Math.round(ry * 2);
  v.fill(Math.round(c), top - 1, Math.round(c), Math.round(c), top + 1, Math.round(c), 0x7a6a34);
  if (seed % 2) v.set(Math.round(c) + 1, top + 1, Math.round(c), 0x5f8a30);
  return { vox: v, size: STD, origin: [c + 0.5, 0, c + 0.5], jitter: 0, meta: { radius: r } };
}

// ---------------------------------------------------------------- tools held by the carvers
// (stick-like props: the grip at the origin, the business end pointing down the hand's -y)
export function carvingKnife() {
  const v = new Vox(2, 13, 2);
  v.fill(0, 7, 0, 1, 12, 1, 0x6a4224);
  v.fill(0, 6, 0, 1, 6, 1, METAL_D);
  v.fill(0, 0, 0, 0, 5, 1, METAL);
  v.set(0, 0, 1, 0);
  return { vox: v, size: 0.018, origin: [1, 10, 1] };
}
export function carvingScoop() {
  const v = new Vox(3, 13, 3);
  v.fill(1, 3, 1, 1, 12, 1, METAL_D);
  v.fill(0, 0, 0, 2, 2, 2, METAL);
  v.set(1, 2, 1, 0);
  v.set(1, 1, 1, GUTS[0]);
  return { vox: v, size: 0.018, origin: [1.5, 10, 1.5] };
}

// tinMegaphone() — Gus's dented tin bullhorn with a red band, held by its handle. An
// upright prop: the bell points along +z (the way he faces), the mouthpiece sits just
// behind the grip and the cone just above it.
export function tinMegaphone() {
  const L = 17, R0 = 1.3, R1 = 5.6;
  const v = new Vox(15, 15, L + 1);
  const cx = 7, cy = 8, TIN = 0xc8ccd2, TIN_D = 0x9aa0a8, TIN_L = 0xe8ecf0, BAND = 0xc8382e;
  for (let z = 0; z <= L; z++) {
    const r = R0 + (z / L) * (R1 - R0);
    for (let y = 0; y < v.h; y++) for (let x = 0; x < v.w; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > r + 0.35) continue;
      const shell = d > r - 1.0;
      if (!shell && z < L - 1 && z > 0) continue;
      let c = y > cy + 1 ? TIN_L : y < cy - 2 ? TIN_D : TIN;
      if (Math.abs(z - L * 0.58) < 1) c = BAND;
      if (z >= L - 1) c = shell ? TIN_L : 0x3a3a40; // the lip, and the dark inside of the bell
      if (z === 0) c = 0x2a2a30; // the mouthpiece
      if (((x * 5 + y * 3 + z * 7) % 23) === 0 && c === TIN) c = TIN_D; // dents
      v.set(x, y, z, c);
    }
  }
  // the handle hangs under the cone, a little in front of the mouthpiece
  v.fill(cx, 1, 5, cx, cy - 2, 6, 0x5a3a22);
  v.fill(cx, 1, 4, cx, 1, 7, 0x3a2418);
  return { vox: v, size: 0.02, origin: [cx + 0.5, 1, 5.5] };
}

// pennant({ color }) — a little cheering flag on a stick (a stick-like prop: the grip at
// the origin, the flag at the far end down the hand's -y, so it flies high on a raised arm)
export function pennant({ color = BUNTING_COLORS[0] } = {}) {
  const v = new Vox(9, 15, 2);
  v.fill(0, 0, 0, 0, 14, 0, WOOD_L);
  for (let y = 0; y < 7; y++) {
    const w = Math.round((1 - Math.abs(y - 3) / 3.5) * 8);
    if (w > 0) v.fill(1, y, 0, w, y, 0, y === 3 ? tone(color, 0.15) : color);
  }
  return { vox: v, size: 0.025, origin: [0.5, 14, 0.5] };
}

// carvedPumpkin({ mask, lit }) — Hank's entry: a hollow pumpkin with the face he carved in
// the mini-game cut right through it (src/game/carveScore.js: mask is n x n, row 0 at
// the top, 1 = cut; one grid cell is one voxel on the front, +z). Inside, a candle's
// glow; the cut walls show the lit flesh. With no mask it is a plain, uncut pumpkin.
export function carvedPumpkin({ mask = null, n = 32, cx = 16, cy = 17, rx = 15.5, ry = 13.5, rz = 13.5, lit = true, seed = 7 } = {}) {
  const P0 = 2, top = Math.ceil(cy + ry) - 1; // grid col c -> x = c + P0; row r -> y = top - r
  const W = n + P0 * 2, D = Math.ceil(rz * 2) + 4, H = top + 8;
  const v = new Vox(W, H, D);
  const X0 = cx + P0, Y0 = top + 1 - cy, Z0 = D / 2; // the centre, in voxel-edge units
  const ribs = 10, ph = seed * 0.37;
  const BASE = 0xe8781e, BASE2 = 0xdc6c1a, GROOVE = 0xb4501a, LIGHT = 0xf6993a, DEEP = 0x8a3a12;
  const shape = (x, y, z) => {
    const dx = (x + 0.5 - X0) / rx, dy = (y + 0.5 - Y0) / ry, dz = (z + 0.5 - Z0) / rz;
    const th = Math.atan2(dz, dx);
    const rib = Math.abs(Math.cos((th * ribs) / 2 + ph));
    const s = 1 - 0.05 * (1 - Math.sqrt(rib));
    return { q: (dx * dx + dz * dz) / (s * s) + dy * dy, rib, dy, k: Math.floor(((th + Math.PI) / (2 * Math.PI)) * ribs) };
  };
  for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const S = shape(x, y, z);
    if (S.q > 1) continue;
    let c = S.rib < 0.22 ? GROOVE : S.k % 2 ? BASE : BASE2;
    if (S.dy > 0.55 && S.rib >= 0.22) c = LIGHT;
    if (S.dy < -0.55) c = S.rib < 0.22 ? DEEP : tone(c, -0.12);
    v.set(x, y, z, c);
  }
  if (mask) {
    // hollow it out; the inner layer is flesh, glowing where the candle lights it
    const inCav = (x, y, z) => {
      const a = (x + 0.5 - X0) / (rx - 3), b = (y + 0.5 - Y0) / (ry - 3), c = (z + 0.5 - Z0) / (rz - 3);
      return a * a + b * b + c * c <= 1;
    };
    const glow = lit ? 0xffb43c | EMIT : 0x7a4a1e, glow2 = lit ? 0xffd070 | EMIT : 0x8a5a28;
    const flesh = lit ? 0xf8b048 | EMIT : 0xf2c070;
    for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inCav(x, y, z)) v.set(x, y, z, 0);
    const NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    const recol = [];
    for (let z = 0; z < D; z++) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!v.get(x, y, z)) continue;
      if (NB.some(([a, b, c]) => !v.get(x + a, y + b, z + c) && !inCav(x + a, y + b, z + c))) continue; // the skin
      const g = NB.some(([a, b, c]) => inCav(x + a, y + b, z + c));
      recol.push([x, y, z, g ? (y + 0.5 > Y0 + ry * 0.2 ? glow2 : glow) : flesh]);
    }
    for (const [x, y, z, c] of recol) v.set(x, y, z, c);
    // the candle on the floor of the hollow
    const fy = Math.ceil(Y0 - ry + 2.2), fx = Math.floor(X0), fz = Math.floor(Z0);
    v.fill(fx - 1, fy, fz - 1, fx, fy + 3, fz, 0xf6ecd0);
    if (lit) { v.set(fx, fy + 4, fz, 0xfff4c0 | EMIT); v.set(fx, fy + 5, fz, 0xffd060 | EMIT); }
    // cut the face straight in from the front, through the wall into the hollow
    const cut = new Set();
    for (let r = 0; r < n; r++) for (let col = 0; col < n; col++) {
      if (!mask[r * n + col]) continue;
      const x = col + P0, y = top - r;
      if (y < 0 || y >= H) continue;
      let z = D - 1;
      while (z >= 0 && !v.get(x, y, z)) z--;
      let k = 0, open = false;
      while (z >= 0 && k < 14) {
        if (!v.get(x, y, z) || inCav(x, y, z)) { open = true; break; }
        v.set(x, y, z, 0);
        z--; k++;
      }
      if (!open && z >= 0) v.set(x, y, z, glow);
      cut.add(x + ',' + y);
    }
    // a scorched rim round each cut on the skin
    for (const kk of cut) {
      const [x, y] = kk.split(',').map(Number);
      for (const [ddx, ddy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (cut.has(x + ddx + ',' + (y + ddy))) continue;
        let z = D - 1;
        while (z >= 0 && !v.get(x + ddx, y + ddy, z)) z--;
        if (z < 0) continue;
        const c = v.get(x + ddx, y + ddy, z);
        if (!(c & EMIT)) v.set(x + ddx, y + ddy, z, tone(c, -0.22));
      }
    }
  }
  // the stem, leaning a little
  const sx = Math.floor(X0) - 1, sz = Math.floor(Z0) - 1;
  let sy = H - 1;
  while (sy > 0 && !v.get(sx, sy, sz)) sy--;
  for (let k = 0; k < 6; k++) {
    const o = k > 3 ? 1 : 0;
    v.fill(sx + o, sy + k, sz, sx + 1 + o, sy + k, sz + 1, k > 4 ? 0x5f8a30 : k % 2 ? 0x6a5a2a : 0x7a6a34);
  }
  return { vox: v, size: 0.018, origin: [X0, Math.max(0, Math.floor(Y0 - ry)), Z0], jitter: 0, meta: { radius: r3(rx * 0.018) } };
}

// prizeRosette({ color }) — a prize ribbon lying on the table: a pleated rosette round a
// gold button, two tails trailing towards +z
export function prizeRosette({ color = 0xc8382e } = {}) {
  const v = new Vox(11, 2, 15);
  const cx = 5, cz = 5;
  for (let z = 0; z < 11; z++) for (let x = 0; x < 11; x++) {
    const d = Math.hypot(x - cx, z - cz);
    if (d > 5.2) continue;
    const pleat = Math.floor(((Math.atan2(z - cz, x - cx) + Math.PI) / (2 * Math.PI)) * 12) % 2;
    v.set(x, 0, z, d < 1.8 ? 0xe8c050 : pleat ? color : tone(color, -0.16));
    if (d < 1.4) v.set(x, 1, z, 0xf2d070);
  }
  for (const s of [-1, 1]) for (let k = 0; k < 6; k++) {
    v.set(cx + s * (1 + (k >> 1)), 0, cz + 5 + k, k === 5 ? tone(color, -0.25) : color);
    v.set(cx + s * (2 + (k >> 1)), 0, cz + 5 + k, tone(color, -0.1));
  }
  return { vox: v, size: FINE, origin: [cx + 0.5, 0, cz + 0.5], jitter: 0 };
}
