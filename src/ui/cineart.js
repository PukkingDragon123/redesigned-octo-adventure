// Pixel art for the cutscene furniture (cine.js): the narrator's parchment scroll, its
// maple-leaf seal and "more" arrow, and the little wooden skip tag. Painted in code on
// a native pixel grid (no DOM, so tools can render it in node too) and shown at a whole
// number of device pixels per art pixel.
//
// The scroll and the tag are 9-slices whose stretchy middles are built to stretch
// invisibly: every edge strip is the same pixel row (or column) all the way along and
// the middle is one flat colour, so a box of any size stays razor sharp.
import { Pix } from '../art/pixel.js';

export const INK = 0x3e2218; // outlines and the words
const SHADOW = 0x1e0e0a, SHADOW_A = 120;
const PAR = { hi: 0xfffbea, l: 0xfaecc8, m: 0xf2dcaa, d: 0xdcbc80, dd: 0xb08a52, x: 0x7e5a34 };
const LEAF = { k: 0x5e1210, L: 0xffb04a, O: 0xf07a1e, D: 0xb04a10, V: 0xffdc52, b: 0x6e3a0e, R: 0xd23a24 };

// a little bitmap from strings: one char a pixel, '.' clear
function bitmap(rows, pal) {
  const p = new Pix(rows[0].length, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (pal[ch] != null) p.set(x, y, pal[ch]); }));
  return p;
}

// ---------------------------------------------------------------- the narrator's scroll
// A parchment sheet between two rolled ends, a ruled frame inside it with a tiny amber
// rosette at each corner, and a hard pixel shadow (1 right, 2 down).
// 41 x 30, slice: top 8, right 14, bottom 12, left 13 (layout border = the slice).
export const PLATE = { w: 41, h: 30, t: 8, r: 14, b: 12, l: 13 };
export function plateArt() {
  const { w: W, h: H } = PLATE;
  const p = new Pix(W, H);
  const RB = H - 4; // the rolls' bottom row (they stand 2 px proud of the sheet top and bottom)
  const SY0 = 2, SY1 = H - 6; // the sheet's top and bottom outline rows
  const LX = 0, RX = W - 9; // the rolls' left columns (8 wide)
  const roll = (x, y) => {
    for (const x0 of [LX, RX]) {
      const lx = x - x0;
      if (lx < 0 || lx > 7 || y < 0 || y > RB) continue;
      const cut = y === 0 || y === RB ? 2 : y === 1 || y === RB - 1 ? 1 : 0;
      if (lx >= cut && lx <= 7 - cut) return true;
    }
    return false;
  };
  const sheet = (x, y) => x >= LX + 7 && x <= RX && y >= SY0 && y <= SY1;
  const inside = (x, y) => roll(x, y) || sheet(x, y);
  // the hard shadow
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!inside(x, y) && inside(x - 1, y - 2)) p.put(x, y, SHADOW, SHADOW_A);
  // the sheet: outline, a lit top row, a shaded row above the bottom
  for (let y = SY0; y <= SY1; y++) for (let x = LX + 7; x <= RX; x++) {
    let c = PAR.m;
    if (y === SY0 || y === SY1) c = INK;
    else if (y === SY0 + 1) c = PAR.l;
    else if (y === SY1 - 1) c = PAR.d;
    p.set(x, y, c);
  }
  // the ruled frame (left and right rules just in from the rolls)
  const r0 = 10, r1 = W - 1 - r0 - 1, t0 = 5, t1 = H - 9;
  for (let x = r0; x <= r1; x++) { p.set(x, t0, PAR.d); p.set(x, t1, PAR.d); }
  for (let y = t0; y <= t1; y++) { p.set(r0, y, PAR.d); p.set(r1, y, PAR.d); }
  // the rolls: a lit cylinder, an end face with a curl at the top, rounded underneath
  const shadeX = [INK, PAR.l, PAR.hi, PAR.l, PAR.m, PAR.d, PAR.dd, INK];
  for (const x0 of [LX, RX]) for (let y = 0; y <= RB; y++) for (let lx = 0; lx < 8; lx++) {
    const x = x0 + lx;
    if (!roll(x, y)) continue;
    const edge = !roll(x - 1, y) || !roll(x + 1, y) || !roll(x, y - 1) || !roll(x, y + 1);
    let c = shadeX[lx];
    if (edge) c = INK;
    else if (y === 1) c = lx === 3 || lx === 4 ? PAR.x : PAR.dd; // the end face, curled
    else if (y === 2) c = lx === 3 ? PAR.x : lx === 4 ? PAR.dd : PAR.d;
    else if (y === 3) c = PAR.dd; // the face's lower rim
    else if (y === RB - 1) c = lx < 4 ? PAR.d : PAR.dd; // round underneath
    p.set(x, y, c);
  }
  // amber rosettes where the rules cross
  const ros = bitmap(['..k..', '.kOk.', 'kOVOk', '.kDk.', '..k..'], { k: LEAF.D, O: LEAF.O, V: LEAF.V, D: LEAF.D });
  for (const [cx, cy] of [[r0, t0], [r1, t0], [r0, t1], [r1, t1]]) p.blit(ros, cx - 2, cy - 2);
  return p;
}

// a maple-leaf seal pinned to the top of the scroll (13 x 13)
export function leafArt() {
  return bitmap([
    '......k......',
    '.....kLk.....',
    '..k..kLOk..k.',
    '.kLk.kLOk.kOk',
    '.kLLkkLOkkOOk',
    'kLLLLOVOOOOOk',
    '.kLLOOVOOOOk.',
    '..kOOOVOOOk..',
    '.kOOOOVOOODk.',
    'kOOOkkVkkDDDk',
    '.kkk..V..kkk.',
    '......b......',
    '......b......',
  ], LEAF);
}

// the "more to read" arrow, gold with an ink outline (7 x 5)
export function arrowArt() {
  return bitmap(['kkkkkkk', 'kYGGGGk', '.kGGDk.', '..kDk..', '...k...'], { k: INK, Y: 0xfff7c2, G: 0xf0ae26, D: 0xb86e12 });
}

// ---------------------------------------------------------------- the skip tag
// A little honey-wood luggage tag: a clipped end with a twine hole on the left, a groove
// along the bottom that fills with gold as skip is held. Drawn 19 tall; slices left 9,
// right 5, nothing top and bottom (it never stretches up or down).
export const TAG = { w: 20, h: 19, l: 9, r: 5, grooveY: 14, grooveX0: 6, grooveX1: 16 };
const WOOD = { hi: 0xfadaa0, l: 0xf2c47e, m: 0xe0a860, g: 0xd49a54, d: 0xb07438, x: 0x8a5428, gr: 0x5e3418 };
const WOOD_HOT = { hi: 0xfff0c8, l: 0xffdc96, m: 0xf6c27a, g: 0xeab26a, d: 0xc8884a, x: 0x9a6230, gr: 0x5e3418 };
export function tagArt(hot = false) {
  const { w: W, h: H, grooveY: GY, grooveX0: G0, grooveX1: G1 } = TAG;
  const P = hot ? WOOD_HOT : WOOD;
  const p = new Pix(W, H);
  const B = H - 2; // bottom outline row
  const shape = (x, y) => {
    if (x < 2 || x > W - 2 || y < 0 || y > B) return false;
    if (x < 6) { const cut = 6 - x; if (y < cut || y > B - cut) return false; } // the clipped end
    if (x === W - 2 && (y === 0 || y === B)) return false; // a round corner
    return true;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!shape(x, y) && shape(x - 1, y - 1)) p.put(x, y, SHADOW, SHADOW_A);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!shape(x, y)) continue;
    const edge = !shape(x - 1, y) || !shape(x + 1, y) || !shape(x, y - 1) || !shape(x, y + 1);
    let c = P.m;
    if (edge) c = INK;
    else if (y === 1 || (x < 7 && !shape(x - 1, y - 1))) c = P.hi;
    else if (y === 2) c = P.l;
    else if (y === 6 || y === 10) c = P.g; // grain
    else if (y === B - 1) c = P.d;
    else if ((y === GY || y === GY + 1) && x >= G0 && x <= G1) c = y === GY ? P.gr : P.x; // the groove
    p.set(x, y, c);
  }
  // the twine hole (a ring with a hole right through) and a loop of red twine
  const hx = 4, hy = 8;
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1], [1, 1], [-1, 1], [1, -1]]) p.set(hx + dx, hy + dy, P.x);
  p.put(hx, hy, 0, 0);
  for (const [x, y] of [[4, 7], [3, 6], [2, 5], [1, 4], [1, 3], [0, 2]]) p.set(x, y, 0xc8361f);
  p.set(2, 4, 0x962018);
  return p;
}
// the skip glyph: two little arrowheads (7 x 5)
export function ffArt(col = INK) {
  return bitmap(['x...x..', 'xx..xx.', 'xxx.xxx', 'xx..xx.', 'x...x..'], { x: col });
}
