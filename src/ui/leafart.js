// Pixel-art autumn leaves for the interface (flourishes, gusts and the leaf-wipe
// screen transitions in leaves.js), painted in code like the rest of the kit.
//
// Each leaf kind (a shape and a 4-tone ramp) is rasterised into a strip of frames:
// 8 turns (45 degrees apart) x 6 tumble states (face-on, tipping, edge-on, the
// darker back side). Animation picks whole frames - a leaf never rotates or
// scales smoothly, so it stays crisp pixel art at any speed.
//
//   const A = leafAtlas('m')   // 'm' 15px cells, 'b' 30px cells for the wipes
//   ctx.drawImage(A.canvas, A.sx(turn, tumble), A.sy(kind), A.cell, A.cell, x, y, A.cell, A.cell)

// ramps: light, base, dark, outline
const MAPLE_RED = [0xffa04a, 0xe2522a, 0xb8301c, 0x5e1410];
const MAPLE_GOLD = [0xffe07a, 0xf4aa28, 0xc87618, 0x6a3a0e];
const MAPLE_DEEP = [0xf4704a, 0xc8361f, 0x8e2216, 0x4a0e0c];
const OAK_BROWN = [0xe0a060, 0xb87036, 0x8a4c22, 0x48240e];
const OAK_ORANGE = [0xffbe5c, 0xe88a2a, 0xb05e18, 0x5a2c0c];
const BIRCH = [0xfff4a0, 0xffd84a, 0xd8a028, 0x6e5014];
const ASPEN = [0xffd88a, 0xf2b040, 0xc07e22, 0x664010];

export const LEAF_KINDS = [
  { shape: 'maple', ramp: MAPLE_RED, len: 0.86 },
  { shape: 'maple', ramp: MAPLE_GOLD, len: 0.86 },
  { shape: 'maple', ramp: MAPLE_DEEP, len: 0.86 },
  { shape: 'oak', ramp: OAK_BROWN, len: 0.84 },
  { shape: 'oak', ramp: OAK_ORANGE, len: 0.84 },
  { shape: 'birch', ramp: BIRCH, len: 0.66 },
  { shape: 'aspen', ramp: ASPEN, len: 0.6 },
  { shape: 'birch', ramp: MAPLE_GOLD, len: 0.66 },
];
// the big leaves in the wipes are the showy ones
export const BIG_KINDS = [0, 1, 2, 3, 4];
export const TURNS = 8;
// tumble states: how much of the leaf's face shows (negative: the back)
const TUMBLE = [1, 0.62, 0.22, -0.22, -0.62, -1];
export const TUMBLES = TUMBLE.length;
// tumble state for a flip angle (radians)
export function tumbleOf(phase) {
  const c = Math.cos(phase);
  let best = 0, d = 9;
  for (let i = 0; i < TUMBLE.length; i++) {
    const e = Math.abs(TUMBLE[i] - c);
    if (e < d) { d = e; best = i; }
  }
  return best;
}

// ---------------------------------------------------------------- shapes
// leaf space: y runs from the stem (-0.5) to the tip (+0.5), x across.
// returns 0 outside, 1 leaf, 2 vein / stem
const TAU = Math.PI * 2;
function maple(x, y) {
  if (Math.abs(x) < 0.035 && y < -0.08 && y > -0.5) return 2; // stem
  const cy = -0.02, dx = x, dy = y - cy;
  const r = Math.hypot(dx, dy), a = Math.atan2(dx, dy); // 0 = up
  // five pointed lobes (up, two up the sides, two low), a notch where the stem joins
  let R = 0.4 * (0.45 + 0.55 * Math.pow(Math.abs(Math.cos(2.5 * a)), 0.9));
  if (Math.abs(a) > 2.7) R *= 0.45;
  // little teeth along the edge
  R *= 1 + 0.07 * Math.cos(a * 15);
  if (r > R) return 0;
  for (const k of [0, 1, -1, 2, -2]) {
    const la = (k * TAU) / 5;
    const along = dx * Math.sin(la) + dy * Math.cos(la);
    const across = Math.abs(dx * Math.cos(la) - dy * Math.sin(la));
    if (along > 0 && across < 0.03 && along < R * 0.8) return 2;
  }
  return 1;
}
function oak(x, y) {
  if (Math.abs(x) < 0.03 && y < -0.38 && y > -0.5) return 2;
  const v = (y + 0.4) / 0.88;
  if (v < 0 || v > 1) return 0;
  const w = 0.25 * Math.pow(Math.sin(Math.PI * Math.min(1, v * 1.05)), 0.55) * (0.74 + 0.3 * Math.cos(v * TAU * 3.2 + 0.4));
  if (Math.abs(x) > w) return 0;
  if (Math.abs(x) < 0.028 && v < 0.9) return 2;
  return 1;
}
function birch(x, y) {
  if (Math.abs(x) < 0.03 && y < -0.36 && y > -0.5) return 2;
  const v = (y + 0.4) / 0.86;
  if (v < 0 || v > 1) return 0;
  const w = 0.33 * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.72)), 0.9) * (1 + 0.07 * Math.sin(v * 46));
  if (Math.abs(x) > w) return 0;
  if (Math.abs(x) < 0.028 && v < 0.85) return 2;
  return 1;
}
function aspen(x, y) {
  if (Math.abs(x) < 0.03 && y < -0.32 && y > -0.5) return 2;
  const v = (y + 0.36) / 0.76;
  if (v < 0 || v > 1) return 0;
  const w = 0.4 * Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2)) * (v > 0.8 ? 1 - (v - 0.8) * 1.6 : 1);
  if (Math.abs(x) > w) return 0;
  if (Math.abs(x) < 0.028 && v < 0.8) return 2;
  return 1;
}
const SHAPES = { maple, oak, birch, aspen };

// ---------------------------------------------------------------- rasterising
function frame(data, stride, ox, oy, cell, kind, turn, flip) {
  const { shape, ramp, len } = kind;
  const f = SHAPES[shape];
  const L = cell * len;
  const a = (turn / TURNS) * TAU + 0.12;
  const ca = Math.cos(a), sa = Math.sin(a);
  const back = flip < 0, w = Math.abs(flip);
  const mask = new Int8Array(cell * cell);
  for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) {
    const px = i + 0.5 - cell / 2, py = j + 0.5 - cell / 2;
    // into leaf space: undo the turn, then the tumble (which narrows the leaf across its axis)
    const lx = (px * ca + py * sa) / L, ly = (px * sa - py * ca) / L;
    const x = lx / Math.max(0.12, w);
    let m = f(x, ly);
    // edge-on: at least the midrib shows as a line
    if (!m && w < 0.3 && Math.abs(lx) < 0.5 / L + 0.02 && f(0, ly)) m = 2;
    if (!m) continue;
    let tone;
    if (m === 2) tone = back ? 1 : 2;
    else if (back) tone = x * (flip < 0 ? -1 : 1) < 0 ? 1 : 2;
    else tone = x < 0 ? 0 : 1;
    // edge-on leaves read darker
    if (w < 0.3 && tone === 0) tone = 1;
    mask[j * cell + i] = tone + 1;
  }
  for (let j = 0; j < cell; j++) for (let i = 0; i < cell; i++) {
    let m = mask[j * cell + i], c;
    if (m) c = ramp[m - 1];
    else {
      // a 1px outline in the leaf's own darkest tone
      const n = (i > 0 && mask[j * cell + i - 1]) || (i < cell - 1 && mask[j * cell + i + 1]) || (j > 0 && mask[(j - 1) * cell + i]) || (j < cell - 1 && mask[(j + 1) * cell + i]);
      if (!n) continue;
      c = ramp[3];
    }
    const o = ((oy + j) * stride + ox + i) * 4;
    data[o] = (c >> 16) & 255;
    data[o + 1] = (c >> 8) & 255;
    data[o + 2] = c & 255;
    data[o + 3] = 255;
  }
}

const ATLAS = {};
// cell size 15 ('m') or 30 ('b'); kinds are rows, turn x tumble are columns
export function leafAtlas(size = 'm') {
  if (ATLAS[size]) return ATLAS[size];
  const cell = size === 'b' ? 30 : 15;
  const kinds = size === 'b' ? BIG_KINDS : LEAF_KINDS.map((_, i) => i);
  const cols = TURNS * TUMBLES;
  const W = cols * cell, H = kinds.length * cell;
  const data = new Uint8ClampedArray(W * H * 4);
  kinds.forEach((k, row) => {
    for (let t = 0; t < TURNS; t++) for (let s = 0; s < TUMBLES; s++) frame(data, W, (t * TUMBLES + s) * cell, row * cell, cell, LEAF_KINDS[k], t, TUMBLE[s]);
  });
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.getContext('2d').putImageData(new ImageData(data, W, H), 0, 0);
  const rows = new Map(kinds.map((k, i) => [k, i]));
  ATLAS[size] = {
    canvas, cell, kinds,
    // source rect of a frame: kind (index into LEAF_KINDS), turn 0..7, tumble 0..5
    sx: (turn, tumble) => (((turn % TURNS) + TURNS) % TURNS * TUMBLES + tumble) * cell,
    sy: (kind) => (rows.get(kind) ?? 0) * cell,
  };
  return ATLAS[size];
}
