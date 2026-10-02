// Voxel props for Hank's prologue: his felling axe, the funeral (a coffin with
// a lid that opens, umbrellas, a hymn book, a bouquet, a wreath, his very own
// engraved headstone, the filled-in grave) and the lumber camp (stumps, a log
// pile, a chopping block). Characters scale: 0.05 m voxels.
import { Vox, tone, vhash } from '../vox.js';

const INK = 0x1e1418;
const WOOD = 0x8a5a32, WOOD_D = 0x6a4224, WOOD_L = 0xa8743e;
const STEEL = 0xb8c0c8, STEEL_D = 0x7a828c, STEEL_L = 0xe8eef2;

// the felling axe, held at the end of the handle (origin = grip, head hangs at -y)
export function axe() {
  const L = 20;
  const v = new Vox(9, L + 3, 5);
  const cx = 4, cz = 2;
  // hickory handle with a slight curve and a grip wrap
  for (let y = 2; y <= L + 1; y++) {
    const bend = Math.round(Math.sin((y / L) * Math.PI) * 0.6);
    v.set(cx + bend, y, cz, y > L - 3 ? 0x3a2418 : (y % 5 === 0 ? WOOD_D : WOOD));
    if (y < 7) v.set(cx + bend, y, cz + 1, WOOD_L);
  }
  // the head: a wedge with a bright honed edge, painted red cheeks
  v.fill(cx - 1, 0, cz - 1, cx + 1, 4, cz + 1, STEEL_D);
  v.fill(cx + 2, 0, cz - 1, cx + 3, 4, cz + 1, (x, y) => (y === 4 ? STEEL_L : STEEL));
  v.fill(cx + 4, -0 + 0, cz - 1, cx + 4, 4, cz + 1, STEEL_L);
  v.fill(cx - 3, 1, cz - 1, cx - 2, 3, cz + 1, 0xc8361f);
  v.set(cx - 4, 2, cz, 0xa82a18);
  return { vox: v, size: 0.05, origin: [cx + 0.5, L + 1, cz + 0.5] };
}

// a big black funeral umbrella, held from the handle (origin) with the canopy up
export function umbrella({ color = 0x24222c, trim = 0x3a3646 } = {}) {
  const R = 11, H = 26;
  const v = new Vox(R * 2 + 3, H + 2, R * 2 + 3);
  const c = R + 1;
  // shaft & crook handle
  for (let y = 2; y < H - 2; y++) v.set(c, y, c, y < 6 ? 0x6a4224 : 0x8a8a92);
  v.set(c + 1, 1, c, 0x6a4224); v.set(c + 2, 2, c, 0x6a4224); v.set(c + 2, 3, c, 0x6a4224);
  // canopy: a ribbed dome with scalloped panels
  for (let x = 0; x < R * 2 + 3; x++) for (let z = 0; z < R * 2 + 3; z++) {
    const dx = x - c, dz = z - c, r = Math.hypot(dx, dz);
    if (r > R + 0.5) continue;
    const ang = Math.atan2(dz, dx);
    const rib = Math.abs(Math.sin(ang * 4)) < 0.12;
    const scallop = r > R - 0.6 && Math.abs(Math.sin(ang * 4)) > 0.9;
    const y = Math.round(H - 2 - (r / R) ** 2 * 5) - (scallop ? 1 : 0);
    v.set(x, y, z, rib ? trim : r > R - 1 ? tone(color, -0.08) : color);
    if (r < R - 1) v.set(x, y + 1, z, rib ? trim : tone(color, 0.06));
  }
  v.fill(c, H - 1, c, c, H + 1, c, 0x8a8a92);
  return { vox: v, size: 0.05, origin: [c + 0.5, 3, c + 0.5] };
}

export function hymnBook() {
  const v = new Vox(6, 2, 8);
  v.fill(0, 0, 0, 5, 1, 7, 0x2a2232);
  v.fill(1, 0, 1, 5, 1, 6, 0xf2e6cc);
  v.fill(0, 1, 0, 5, 1, 7, 0x2a2232);
  v.set(2, 1, 3, 0xf2c443); v.set(3, 1, 3, 0xf2c443); v.set(2, 1, 4, 0xf2c443); v.set(2, 1, 2, 0xf2c443);
  return { vox: v, size: 0.05, origin: [3, 1, 1] };
}

// a bunch of flowers wrapped in paper (hangs from the hand, blooms up)
export function bouquet({ seed = 1 } = {}) {
  const v = new Vox(7, 12, 7);
  const cols = [0xf2c443, 0xe8503a, 0xf6f0e6, 0xb85ad0, 0xf08a2a];
  v.fill(2, 0, 2, 4, 5, 4, (x, y) => (y > 3 ? 0xe8dcc0 : 0xd8c8a0));
  v.fill(3, 5, 3, 3, 7, 3, 0x4a7a2e);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.4 + seed, r = i ? 1.6 + (i % 3) * 0.4 : 0;
    const x = Math.round(3 + Math.cos(a) * r), z = Math.round(3 + Math.sin(a) * r), y = 8 + (i % 2);
    v.set(x, y, z, cols[(i + seed) % cols.length]);
    v.set(x, y - 1, z, 0x5a8a34);
  }
  return { vox: v, size: 0.05, origin: [3.5, 4, 3.5] };
}

// a pine coffin: body and lid built separately so the lid can swing open
export function coffin({ part = 'body' } = {}) {
  const W = 14, L = 40, Hb = 9;
  // classic six-sided outline: widest at the shoulders
  const half = (z) => (z < 10 ? 4.5 + z * 0.25 : 7 - (z - 10) * 0.075);
  const wood = (x, y, z) => {
    const plank = (y + (z >> 3)) % 3 === 0;
    return vhash(x, y, z, 5) < 0.05 ? WOOD_D : plank ? 0x9a6436 : 0x8a5630;
  };
  if (part === 'lid') {
    const v = new Vox(W + 2, 3, L + 2);
    for (let z = 0; z < L; z++) {
      const hw = half(z);
      for (let x = 0; x < W; x++) {
        if (Math.abs(x - W / 2 + 0.5) > hw) continue;
        v.set(x + 1, 0, z + 1, wood(x, 0, z));
        if (Math.abs(x - W / 2 + 0.5) < hw - 1.2 && z > 1 && z < L - 2) v.set(x + 1, 1, z + 1, tone(0x9a6436, 0.06));
      }
    }
    // brass cross on the lid
    v.fill(W / 2, 2, 9, W / 2 + 1, 2, 23, 0xf2c443);
    v.fill(W / 2 - 3, 2, 13, W / 2 + 4, 2, 14, 0xf2c443);
    return { vox: v, size: 0.05, origin: [W / 2 + 1, 0, 1] }; // hinge along the head end
  }
  const v = new Vox(W + 2, Hb + 1, L + 2);
  for (let z = 0; z < L; z++) {
    const hw = half(z);
    for (let x = 0; x < W; x++) {
      const dx = Math.abs(x - W / 2 + 0.5);
      if (dx > hw) continue;
      for (let y = 0; y < Hb; y++) {
        const wall = dx > hw - 1 || z === 0 || z === L - 1 || y === 0;
        if (!wall) {
          // cream satin lining with a pillow at the head
          if (y === 1) v.set(x + 1, y, z + 1, z < 8 && z > 1 ? 0xfff4e0 : 0xe8d8e8);
          continue;
        }
        v.set(x + 1, y, z + 1, y === Hb - 1 ? WOOD_L : wood(x, y, z));
      }
    }
  }
  // rope handles
  for (const z of [10, 20, 30]) for (const s of [-1, 1]) {
    const x = Math.round(W / 2 + 0.5 + s * (half(z) + 1));
    v.set(x, 4, z + 1, 0xd8c8a0);
  }
  return { vox: v, size: 0.05, origin: [W / 2 + 1, 0, L / 2 + 1] };
}

// 3x5 pixel letters for engraving
const GLYPH = {
  H: ['#.#', '#.#', '###', '#.#', '#.#'], A: ['.#.', '#.#', '###', '#.#', '#.#'], N: ['#.#', '###', '###', '###', '#.#'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'], R: ['##.', '#.#', '##.', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'], E: ['###', '#..', '##.', '#..', '###'], S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'], Z: ['###', '..#', '.#.', '#..', '###'], ' ': ['...', '...', '...', '...', '...'],
};

// Hank's own headstone: a big rounded slab with his name, a crossed-axe motif and moss
export function hankStone() {
  const W = 22, H = 30, D = 6;
  const v = new Vox(W + 2, H + 3, D + 2);
  const cx = (W + 1) / 2;
  const stone = (x, y, z) => {
    const n = vhash(x, y, z, 9);
    return n < 0.08 ? 0x8a8a92 : n < 0.16 ? 0xb8b8c0 : y > H - 6 ? 0xb0b0b8 : 0xa0a0aa;
  };
  for (let x = 1; x <= W; x++) for (let y = 3; y <= H; y++) {
    const r = Math.hypot(x - cx, Math.max(0, y - (H - W / 2)));
    if (r > W / 2) continue;
    for (let z = 1; z <= D; z++) v.set(x, y, z, stone(x, y, z));
  }
  // plinth
  v.fill(0, 0, 0, W + 1, 2, D + 1, (x, y) => (y === 2 ? 0x9a9aa2 : 0x7a7a84));
  // engraving on the front (z = D): HANK, then RIP, then two crossed axes
  const carve = (text, y0) => {
    const w = text.length * 4 - 1;
    let x0 = Math.round(cx - w / 2 + 0.5);
    for (const ch of text) {
      const g = GLYPH[ch] || GLYPH[' '];
      g.forEach((row, ry) => [...row].forEach((p, rx) => { if (p === '#') v.set(x0 + rx, y0 - ry, D, 0x4a4a54); }));
      x0 += 4;
    }
  };
  carve('HANK', H - 6);
  carve('RIP', H - 13);
  for (let k = 0; k < 7; k++) {
    v.set(Math.round(cx - 3 + k), 6 + k, D, 0x5a4a3a);
    v.set(Math.round(cx + 3 - k), 6 + k, D, 0x5a4a3a);
  }
  v.fill(Math.round(cx - 5), 12, D, Math.round(cx - 3), 13, D, 0x7a7a84);
  v.fill(Math.round(cx + 3), 12, D, Math.round(cx + 5), 13, D, 0x7a7a84);
  // moss on the shoulders
  for (let x = 1; x <= W; x++) for (let y = H - 3; y <= H; y++) for (let z = 1; z <= D; z++) {
    if (v.get?.(x, y, z) && !v.get(x, y + 1, z) && vhash(x, y, z, 3) < 0.45) v.set(x, y, z, 0x5a7a34);
  }
  return { vox: v, size: 0.05, origin: [cx + 0.5, 0, D / 2 + 1] };
}

// a fresh, rounded grave mound (fits over the open hole)
export function graveMound({ snow = false, flowers = false } = {}) {
  const W = 26, L = 46;
  const v = new Vox(W, 9, L);
  for (let x = 0; x < W; x++) for (let z = 0; z < L; z++) {
    const dx = (x - W / 2 + 0.5) / (W / 2), dz = (z - L / 2 + 0.5) / (L / 2);
    const r = dx * dx + dz * dz;
    if (r > 1) continue;
    const h = Math.round((1 - r) * 6) + 1;
    for (let y = 0; y < h; y++) {
      const n = vhash(x, y, z, 4);
      let c = n < 0.2 ? 0x4a3020 : n < 0.5 ? 0x5a3a26 : 0x6a442c;
      if (y === h - 1 && snow) c = n < 0.3 ? 0xe8eef6 : 0xf6faff;
      v.set(x, y, z, c);
    }
    if (flowers && vhash(x, 0, z, 8) < 0.05 && r < 0.8) v.set(x, Math.round((1 - r) * 6) + 1, z, [0xf2c443, 0xe8503a, 0xf6f0e6, 0xb85ad0][(x + z) % 4]);
  }
  return { vox: v, size: 0.05, origin: [W / 2, 0.5, L / 2] };
}

// a wreath of autumn leaves on a little easel
export function wreath() {
  const v = new Vox(20, 30, 8);
  const cx = 9.5, cy = 20;
  for (let x = 0; x < 20; x++) for (let y = 10; y < 30; y++) {
    const r = Math.hypot(x - cx, y - cy);
    if (r < 5.5 || r > 9) continue;
    const n = vhash(x, y, 0, 2);
    v.set(x, y, 4, n < 0.3 ? 0xd8501e : n < 0.55 ? 0xf08a2a : n < 0.75 ? 0xe8b23a : 0x6a8a34);
    if (r > 6.5 && r < 8) v.set(x, y, 5, n < 0.5 ? 0xb8321e : 0xe8701e);
  }
  // ribbon & easel legs
  v.fill(8, 11, 6, 11, 13, 6, 0x2a2232);
  v.line(4, 0, 2, 7, 12, 4, WOOD);
  v.line(15, 0, 2, 12, 12, 4, WOOD);
  v.line(10, 0, 7, 10, 12, 4, WOOD_D);
  return { vox: v, size: 0.05, origin: [10, 0, 4] };
}

// a fresh-cut stump with rings and bark (lumber camp)
export function stump({ seed = 1, r = 7, h = 8 } = {}) {
  const v = new Vox(r * 2 + 5, h + 2, r * 2 + 5);
  const c = r + 2;
  for (let x = 0; x < r * 2 + 5; x++) for (let z = 0; z < r * 2 + 5; z++) {
    const d = Math.hypot(x - c, z - c);
    const ang = Math.atan2(z - c, x - c);
    const rr = r + Math.sin(ang * 5 + seed) * 0.6;
    // roots flaring out at the base
    const root = Math.abs(Math.sin(ang * 3 + seed)) > 0.82 && d < rr + 2.5;
    for (let y = 0; y <= h; y++) {
      const top = y === h;
      if (d <= rr) {
        let col;
        if (d > rr - 1.2) col = vhash(x, y, z, seed) < 0.3 ? 0x4a3020 : 0x5a3a26; // bark
        else if (top) col = Math.round(d) % 2 ? 0xe8c890 : 0xd8b070; // rings
        else col = 0xc89a5a;
        if (top && d < 0.8) col = 0xa87a42;
        v.set(x, y, z, col);
      } else if (root && y < 2 - (d - rr) * 0.6) v.set(x, y, z, 0x4a3020);
    }
  }
  return { vox: v, size: 0.05, origin: [c + 0.5, 0, c + 0.5] };
}

// a neat stack of split logs
export function logPile({ seed = 1 } = {}) {
  const v = new Vox(44, 22, 18);
  let row = 0;
  for (let y = 2; y < 20; y += 6, row++) {
    for (let x = 3 + (row % 2) * 3; x < 41 - row * 3; x += 6) {
      for (let z = 1; z < 17; z++) for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) {
        const d = Math.hypot(dx, dy);
        if (d > 2.9) continue;
        const end = z === 1 || z === 16;
        const col = end ? (d < 1.2 ? 0xa87a42 : Math.round(d) % 2 ? 0xe8c890 : 0xd8b070) : vhash(x + dx, y + dy, z, seed) < 0.25 ? 0x4a3020 : 0x6a4428;
        v.set(x + dx, y + dy, z, col);
      }
    }
  }
  return { vox: v, size: 0.05, origin: [22, 0, 9] };
}

// a log section lying on its side (pieces of the felled tree)
export function logSection({ len = 40, r = 6, seed = 1 } = {}) {
  const v = new Vox(len, r * 2 + 2, r * 2 + 2);
  const c = r + 1;
  for (let x = 0; x < len; x++) for (let y = 0; y < r * 2 + 2; y++) for (let z = 0; z < r * 2 + 2; z++) {
    const d = Math.hypot(y - c, z - c);
    if (d > r) continue;
    const end = x === 0 || x === len - 1;
    v.set(x, y, z, end ? (Math.round(d) % 2 ? 0xe8c890 : 0xd8b070) : d > r - 1.2 ? (vhash(x, y, z, seed) < 0.3 ? 0x4a3020 : 0x5a3a26) : 0xc89a5a);
  }
  return { vox: v, size: 0.05, origin: [len / 2, 0.5, c + 0.5] };
}

// a heap of raked maple leaves (Hank's last bed)
export function leafPile({ seed = 1 } = {}) {
  const W = 34, L = 44;
  const v = new Vox(W, 12, L);
  const cols = [0xd8501e, 0xf08a2a, 0xe8b23a, 0xb8321e, 0xc86a24, 0x8a5a2a];
  for (let x = 0; x < W; x++) for (let z = 0; z < L; z++) {
    const dx = (x - W / 2 + 0.5) / (W / 2), dz = (z - L / 2 + 0.5) / (L / 2);
    const r = dx * dx + dz * dz + (vhash(x, 0, z, seed) - 0.5) * 0.15;
    if (r > 1) continue;
    const h = Math.round((1 - r) * 8) + 1;
    for (let y = 0; y < h; y++) v.set(x, y, z, cols[Math.floor(vhash(x, y, z, seed + 3) * cols.length)]);
  }
  return { vox: v, size: 0.05, origin: [W / 2, 0.5, L / 2] };
}

export const PREVIEW = {
  leafPile: () => leafPile(),
  axe: () => axe(),
  umbrella: () => umbrella(),
  hymnBook: () => hymnBook(),
  bouquet: () => bouquet({ seed: 2 }),
  coffin: () => coffin(),
  coffinLid: () => coffin({ part: 'lid' }),
  hankStone: () => hankStone(),
  graveMound: () => graveMound({ flowers: true }),
  graveMoundSnow: () => graveMound({ snow: true }),
  wreath: () => wreath(),
  stump: () => stump({ seed: 2 }),
  logPile: () => logPile(),
  logSection: () => logSection(),
};

void INK;
