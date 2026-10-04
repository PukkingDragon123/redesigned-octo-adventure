// Hand-posed 2D street clutter for Maple Cove, in the same sculpted pixel-art
// style as the old 2D wildlife: picket and split-rail fences, trash
// cans and recycling bins, crates, barrels, sandwich boards, mailboxes, flower
// boxes, laundry lines, parked bikes, lobster traps, buoys, firewood, round hay
// bales, a friendly scarecrow, lamp posts, the harbour fish stall (with cod,
// salmon, mackerel and lobster that flop about), a maple-syrup & apple stand,
// a poutine cart, and the litter and bits that fly out when things get knocked
// over. Each piece is sculpted from boxes, tubes and ellipsoids (sculpt2d.js)
// and pixelled from up to five view angles into a sprite atlas.
//
// Local frame of every sculpt: feet at the origin, +x is the FRONT (what the
// 'front' view looks at), y up, z to the side. Frame names: `${kind}:${view}:${i}`.
import { Sculpt, ramp, renderSculpt, eye } from './sculpt2d.js';

const TAU = Math.PI * 2;
const INK = 0x1e1418;

export const VIEWS = {
  side: { yaw: 0 },
  front3: { yaw: -Math.PI / 4 },
  front: { yaw: -Math.PI / 2 },
  back3: { yaw: Math.PI / 4 },
  back: { yaw: Math.PI / 2 },
};
const ALL5 = ['side', 'front3', 'front', 'back3', 'back'];
const FRONT3 = ['side', 'front3', 'front'];

// ---------------------------------------------------------------- materials
const M = (hex, o = {}) => ({ ramp: o.ramp || ramp(hex, o), hi: o.hi ?? false, flat: o.flat ?? false, glow: o.glow ?? false, soft: o.soft ?? false, line: o.line });
const MATS = {
  paint: M(0xf0eadc, { ramp: [0x3a3038, 0xb8b0a4, 0xf0eadc, 0xfaf6ec, 0xffffff] }),
  paintD: M(0xc8c0b2, { ramp: [0x2e2830, 0x9a9286, 0xc8c0b2, 0xdcd4c6, 0xece6da] }),
  wood: M(0x9a6438, { ramp: [0x2a160c, 0x6a3e20, 0x9a6438, 0xbc8450, 0xd4a068] }),
  woodD: M(0x6e4424, { ramp: [0x1e0e08, 0x4a2a14, 0x6e4424, 0x8a5a32, 0xa06e40] }),
  woodL: M(0xc89a62, { ramp: [0x3a2414, 0x9a6e40, 0xc89a62, 0xdeb47c, 0xeccc98] }),
  grey: M(0x8a7c6a, { ramp: [0x241c18, 0x5e5246, 0x8a7c6a, 0xa49684, 0xbcb09c] }),
  greyD: M(0x6a5e50, { ramp: [0x1c1612, 0x463c32, 0x6a5e50, 0x847664, 0x9a8c78] }),
  bark: M(0x6a4a30, { ramp: [0x1c120a, 0x46301e, 0x6a4a30, 0x86603e, 0x9c744c] }),
  logEnd: M(0xd8b47c, { ramp: [0x3a2a16, 0xb08850, 0xd8b47c, 0xe8cc98, 0xf4e0b4] }),
  can: M(0x8a948e, { ramp: [0x1a1e1e, 0x5a6460, 0x8a948e, 0xaab4ac, 0xd0d8d0], hi: true }),
  canD: M(0x66706a, { ramp: [0x121616, 0x444c48, 0x66706a, 0x7e8882, 0x96a09a] }),
  dark: M(0x2a2428, { ramp: [0x0c080a, 0x1a1418, 0x2a2428, 0x3a3238, 0x4a4248] }),
  blue: M(0x2e6ab8, { ramp: [0x0c1a34, 0x1e4a8a, 0x2e6ab8, 0x4a8ad4, 0x7aaee8], hi: true }),
  green: M(0x3a7a4a, { ramp: [0x0e2014, 0x24562e, 0x3a7a4a, 0x52985e, 0x76b47a] }),
  red: M(0xc0302a, { ramp: [0x2a0808, 0x8a1e1a, 0xc0302a, 0xdc4a3a, 0xf07a5e], hi: true }),
  redD: M(0x8a2a24, { ramp: [0x200606, 0x5e1a16, 0x8a2a24, 0xa63a30, 0xbc4c3e] }),
  white: M(0xece6da, { ramp: [0x342c30, 0xb4ac9e, 0xece6da, 0xf8f4ec, 0xffffff] }),
  cream: M(0xe8d8b0, { ramp: [0x3a2e1e, 0xb4a07a, 0xe8d8b0, 0xf4e8c8, 0xfcf4e0] }),
  yellow: M(0xe8b830, { ramp: [0x3a2606, 0xb08418, 0xe8b830, 0xf4d058, 0xfce890] }),
  orange: M(0xe0701e, { ramp: [0x3a1606, 0xa84a12, 0xe0701e, 0xf08e3a, 0xf8b064] }),
  burgundy: M(0x8a2438, { ramp: [0x1e060c, 0x5e1426, 0x8a2438, 0xa83a50, 0xc45a6c] }),
  leaf: M(0x4a7a2e, { ramp: [0x0e1a08, 0x2e5418, 0x4a7a2e, 0x64983e, 0x86b456] }),
  iron: M(0x34303a, { ramp: [0x0a080c, 0x221e26, 0x34303a, 0x4a4652, 0x66626e], hi: true }),
  rope: M(0xd8c8a0, { ramp: [0x3a3020, 0xa8966e, 0xd8c8a0, 0xe8dcbc, 0xf4ecd4] }),
  straw: M(0xdcb85a, { ramp: [0x3a2a0a, 0xa8862e, 0xdcb85a, 0xecd282, 0xf8e8a8] }),
  strawD: M(0xb48e38, { ramp: [0x2a1e06, 0x82621e, 0xb48e38, 0xc8a24c, 0xd8b45e] }),
  sack: M(0xd4bc8c, { ramp: [0x3a2a1a, 0xa48a5e, 0xd4bc8c, 0xe4d0a6, 0xf0e2c0] }),
  denim: M(0x3e5a8a, { ramp: [0x0c1424, 0x2a3e64, 0x3e5a8a, 0x5476a6, 0x7096c0] }),
  plaidR: M(0xb83a2e, { ramp: [0x240808, 0x82241c, 0xb83a2e, 0xcc5444, 0xe07a64] }),
  plaidK: M(0x3a2224, { ramp: [0x0c0606, 0x261416, 0x3a2224, 0x4e3234, 0x644446] }),
  chalk: M(0x2e3c36, { ramp: [0x0a100e, 0x222e28, 0x2e3c36, 0x3a4a42, 0x46564e], flat: true }),
  glass: M(0x4a8a5a, { ramp: [0x0c1e12, 0x2e6a3e, 0x4a8a5a, 0x6aac78, 0xb4e8c0], hi: true }),
  syrup: M(0xc87a1e, { ramp: [0x2a1004, 0x9a520e, 0xc87a1e, 0xe09a3a, 0xf8d080], hi: true }),
  glow: M(0xffd27a, { ramp: [0x6a4a1a, 0xffc060, 0xffd27a, 0xffe6a8, 0xfff4d8], glow: true, flat: true }),
  tyre: M(0x26222a, { ramp: [0x08060a, 0x16121a, 0x26222a, 0x3a3640, 0x5a5662] }),
  steel: M(0xb8c0c8, { ramp: [0x22262c, 0x7e868e, 0xb8c0c8, 0xd4dce2, 0xf4f8fa], hi: true }),
  teal: M(0x2f8a86, { ramp: [0x081e1e, 0x1e5e5c, 0x2f8a86, 0x48a8a2, 0x78c8c0], hi: true }),
  leather: M(0x5a3420, { ramp: [0x140806, 0x3a1e12, 0x5a3420, 0x764a30, 0x906044], hi: true }),
  net: M(0x6a8a5a, { ramp: [0x101a0e, 0x4a6a3e, 0x6a8a5a, 0x84a472, 0x9ebc8a] }),
  ice: M(0xdcecf4, { ramp: [0x2a3a48, 0x9cbcd0, 0xdcecf4, 0xf0f8fc, 0xffffff], hi: true }),
  paper: M(0xf0ece0, { ramp: [0x3a3634, 0xc4bcae, 0xf0ece0, 0xfaf8f0, 0xffffff] }),
  newsprint: M(0xc8c4b8, { ramp: [0x2e2c2a, 0x9a968a, 0xc8c4b8, 0xdedad0, 0xf0ece4] }),
  apple: M(0xc8302a, { ramp: [0x2a0606, 0x8a1a16, 0xc8302a, 0xe25440, 0xf89070], hi: true }),
  appleG: M(0x8ab43c, { ramp: [0x1a2606, 0x5a8420, 0x8ab43c, 0xa8cc58, 0xc8e480], hi: true }),
  core: M(0xf0e2b8, { ramp: [0x3a2e1a, 0xc4b07e, 0xf0e2b8, 0xf8eed0, 0xfff8e8] }),
  peel: M(0xe8c840, { ramp: [0x3a2e08, 0xb09424, 0xe8c840, 0xf6e070, 0xfff0a0] }),
  // fish & seafood
  cod: M(0x8a845a, { ramp: [0x1e1c10, 0x5e5a3a, 0x8a845a, 0xa49e72, 0xbeb88c] }),
  codBelly: M(0xe8e2cc, { ramp: [0x34302a, 0xb8b29e, 0xe8e2cc, 0xf4f0e2, 0xffffff] }),
  salmon: M(0x6a8aa0, { ramp: [0x101a24, 0x48647a, 0x6a8aa0, 0x8aa8bc, 0xb0c8d8], hi: true }),
  salmonS: M(0xc8ccd4, { ramp: [0x2a2c34, 0x989ca8, 0xc8ccd4, 0xe0e4ea, 0xffffff], hi: true }),
  salmonP: M(0xe89a8a, { ramp: [0x3a1a18, 0xb86a60, 0xe89a8a, 0xf4b8a8, 0xffd8cc] }),
  mack: M(0x2e7a7a, { ramp: [0x061a1c, 0x1c5456, 0x2e7a7a, 0x46989a, 0x6ab8b8], hi: true }),
  mackS: M(0xd8dee4, { ramp: [0x2c3036, 0xa0a8b0, 0xd8dee4, 0xeef2f6, 0xffffff], hi: true }),
  lobster: M(0xc8321e, { ramp: [0x2a0604, 0x8e1e12, 0xc8321e, 0xe0543a, 0xf48a68], hi: true }),
  lobsterD: M(0x8a1e14, { ramp: [0x1e0402, 0x5e140c, 0x8a1e14, 0xa42a1e, 0xbc3c2c] }),
};
const sculpt = () => new Sculpt(MATS);

// small pixel painters for decals
const px = (c) => (put, x, y) => put(x, y, c);
function paintRows(rows, cols) {
  return (put, x, y) => {
    const h = rows.length, w = rows[0].length;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const ch = rows[j][i]; if (ch !== '.') put(x - (w >> 1) + i, y - (h >> 1) + j, cols[ch]); }
  };
}
const MAPLE = paintRows([
  '...r...',
  '.r.r.r.',
  '.rrrrr.',
  'rrrrrrr',
  '.rrrrr.',
  '..rrr..',
  '...r...',
], { r: 0xc8302a });

// a flat-ended cylinder: a tube with its round end caps cut away (fn returns nothing there) and
// flat discs for the ends. mat(n, p, u) for the side, top for the upper disc (null: open top).
function cyl(S, pts, radii, mat, top, o = {}) {
  const g = o.group ?? S.group();
  const fn = typeof mat === 'function' ? mat : () => mat;
  S.tube(pts, radii, (n, p, u) => (u <= 0.001 || u >= 0.999 ? null : fn(n, p, u)), { group: g });
  const a = pts[0], b = pts[pts.length - 1];
  const along = Math.abs(b[2] - a[2]) > Math.abs(b[1] - a[1]) ? 'z' : 'y';
  const disc = (c, r, m) => S.ell(c, along === 'z' ? [r, r, 0.012] : [r, 0.012, r], m, { group: g, line: o.line ?? true });
  if (top) disc(b, radii[radii.length - 1] * 0.995, top);
  disc(a, radii[0] * 0.995, o.bottom ?? (typeof mat === 'string' ? mat : top));
}

// ---------------------------------------------------------------- fences
function picketSculpt() {
  const S = sculpt();
  const rails = S.group();
  for (const y of [0.26, 0.68]) S.box([-0.05, y, 0], [0.02, 0.035, 0.98], 'paintD', { group: rails });
  for (const z of [-1, 1]) S.box([-0.04, 0.5, z * 0.99], [0.055, 0.5, 0.055], 'paint');
  for (let i = 0; i < 9; i++) {
    const z = -0.8 + i * 0.2, h = 0.4 + (i % 2) * 0.015;
    const g = S.group();
    S.box([0, h, z], [0.016, h, 0.042], (n) => (n[1] < -0.85 ? 'paintD' : 'paint'), { group: g });
    S.box([0, 2 * h, z], [0.016, 0.04, 0.04], 'paint', { rot: [0, 0, Math.PI / 4], group: g });
  }
  return S;
}
function railSculpt(seed = 0) {
  const S = sculpt();
  const R = rnd(seed + 3);
  for (const z of [-1.45, 1.45]) S.tube([[0, 0, z], [0.01, 0.6, z], [0, 1.12, z + 0.01]], [0.075, 0.07, 0.06], (n, p, u) => (u > 0.97 ? 'logEnd' : 'grey'));
  for (const y of [0.42, 0.86]) {
    const g = S.group();
    const w = R() * 0.04;
    S.tube([[0.02, y + w, -1.55], [0.03, y - 0.03, 0], [0.02, y + 0.02 - w, 1.55]], [0.055, 0.05, 0.055], (n, p, u) => (u <= 0.001 || u >= 0.999 ? 'logEnd' : n[1] > 0.5 ? 'grey' : 'greyD'), { group: g });
  }
  return S;
}

// ---------------------------------------------------------------- bins
function trashcanSculpt({ lid = true } = {}) {
  const S = sculpt();
  const body = S.group();
  cyl(S, [[0, 0.02, 0], [0, 0.4, 0], [0, 0.74, 0]], [0.23, 0.245, 0.255], (n, p, u) => (Math.floor(u * 9) % 3 === 1 ? 'canD' : 'can'), lid ? 'canD' : null, { group: body, bottom: 'canD' });
  S.ell([0, 0.74, 0], [0.262, 0.018, 0.262], 'canD', { group: body });
  for (const z of [-1, 1]) S.tube([[0, 0.6, z * 0.25], [0, 0.6, z * 0.29]], [0.025, 0.025], 'canD');
  if (lid) {
    const g = S.group();
    S.ell([0, 0.765, 0], [0.285, 0.028, 0.285], 'canD', { group: g });
    S.ell([0, 0.785, 0], [0.24, 0.035, 0.24], (n) => (n[1] > 0.75 ? 'can' : 'canD'), { group: g });
    S.tube([[-0.07, 0.84, 0], [0.07, 0.84, 0]], [0.018, 0.018], 'canD', { group: g });
  } else {
    S.ell([0, 0.75, 0], [0.22, 0.012, 0.22], 'dark', { line: false });
    S.ell([0.06, 0.77, -0.05], [0.07, 0.04, 0.06], 'paper');
    S.ell([-0.08, 0.76, 0.07], [0.06, 0.03, 0.05], 'newsprint');
  }
  return S;
}
function lidSculpt() {
  const S = sculpt();
  S.ell([0, 0.05, 0], [0.275, 0.05, 0.275], (n) => (n[1] > 0.7 ? 'can' : 'canD'));
  S.tube([[-0.07, 0.12, 0], [0.07, 0.12, 0]], [0.018, 0.018], 'canD');
  return S;
}
function recycleSculpt({ full = true } = {}) {
  const S = sculpt();
  S.box([0, 0.22, 0], [0.22, 0.22, 0.3], (n, p, face) => (face === 3 ? 'dark' : n[1] < -0.8 && face !== 2 ? 'blue' : 'blue'));
  S.box([0, 0.445, 0], [0.235, 0.012, 0.315], 'blue', { line: false });
  S.box([0, 0.44, 0], [0.2, 0.01, 0.28], 'dark', { line: false });
  if (full) {
    S.tube([[0.05, 0.38, -0.12], [0.08, 0.6, -0.16]], [0.04, 0.03], 'glass');
    S.tube([[-0.06, 0.4, 0.05], [-0.04, 0.53, 0.06]], [0.04, 0.04], 'red');
    S.box([0.02, 0.5, 0.15], [0.12, 0.06, 0.1], 'newsprint', { rot: [0.3, 0.2, 0.3] });
    S.box([-0.08, 0.48, -0.1], [0.08, 0.05, 0.07], 'cream', { rot: [-0.4, 0, -0.2] });
  }
  // the recycling arrows on the front and the sides
  const arrows = paintRows(['..w..', '.w.w.', 'w...w', 'wwwww'], { w: 0xf2f2f2 });
  S.decal([0.225, 0.22, 0], arrows, { tol: 0.05 });
  S.decal([-0.225, 0.22, 0], arrows, { tol: 0.05 });
  for (const z of [-1, 1]) S.decal([0, 0.22, z * 0.305], arrows, { tol: 0.05 });
  return S;
}

// ---------------------------------------------------------------- crates, barrels, firewood
function crateSculpt({ apples = true } = {}) {
  const S = sculpt();
  const slat = (n, p, face) => {
    const ax = face >> 1;
    let e = 0;
    for (let k = 0; k < 3; k++) if (k !== ax) e = Math.max(e, Math.abs(n[k]));
    if (e > 0.86) return 'woodD';
    if (ax === 1) return 'wood';
    const b = (n[1] + 1) * 2.5;
    return b % 1 < 0.12 ? 'woodD' : Math.floor(b) % 2 ? 'wood' : 'woodL';
  };
  S.box([0, 0.24, 0], [0.28, 0.24, 0.36], slat);
  S.box([0, 0.47, 0], [0.25, 0.01, 0.33], 'dark', { line: false });
  if (apples) {
    const R = rnd(7);
    for (let i = 0; i < 7; i++) {
      const x = (R() - 0.5) * 0.36, z = (R() - 0.5) * 0.5;
      S.ell([x, 0.5, z], [0.06, 0.055, 0.06], i % 3 === 2 ? 'appleG' : 'apple');
    }
  }
  return S;
}
function barrelSculpt() {
  const S = sculpt();
  cyl(S, [[0, 0.02, 0], [0, 0.44, 0], [0, 0.86, 0]], [0.25, 0.3, 0.25], (n, p, u) => {
    if (Math.abs(u - 0.14) < 0.035 || Math.abs(u - 0.86) < 0.035) return 'iron';
    const a = Math.atan2(n[2], n[0]);
    return Math.floor((a + TAU) * 3.2) % 2 ? 'wood' : 'woodD';
  }, 'woodL', { bottom: 'woodD' });
  return S;
}
function firewoodSculpt() {
  const S = sculpt();
  const end = (n, p, u) => (u <= 0.001 || u >= 0.999 ? 'logEnd' : n[1] > 0.4 ? 'bark' : 'woodD');
  const rows = [4, 3, 2];
  rows.forEach((cnt, r) => {
    for (let k = 0; k < cnt; k++) {
      const x = (k - (cnt - 1) / 2) * 0.19, y = 0.09 + r * 0.16;
      S.tube([[x, y, -0.42], [x, y, 0.42]], [0.085, 0.085], end);
    }
  });
  return S;
}
function logSculpt() {
  const S = sculpt();
  S.tube([[0, 0.08, -0.22], [0, 0.08, 0.22]], [0.08, 0.08], (n, p, u) => (u <= 0.001 || u >= 0.999 ? 'logEnd' : n[1] > 0.4 ? 'bark' : 'woodD'));
  return S;
}
function haySculpt() {
  const S = sculpt();
  const swirl = (n) => { const r = Math.hypot(n[0], n[1]), a = Math.atan2(n[1], n[0]); return r > 0.93 ? 'strawD' : ((r * 4 + a / TAU + 1) % 1) < 0.3 ? 'strawD' : 'straw'; };
  const g = S.group();
  S.tube([[0, 0.55, -0.42], [0, 0.55, 0.42]], [0.55, 0.55], (n, p, u) => (u <= 0.001 || u >= 0.999 ? null : Math.floor((Math.atan2(n[1], n[0]) + 4) * 5) % 3 === 0 ? 'strawD' : 'straw'), { group: g });
  for (const z of [-0.42, 0.42]) S.ell([0, 0.55, z], [0.548, 0.548, 0.03], swirl, { group: g });
  for (const z of [-0.2, 0.2]) S.tube([[0, 1.1, z], [0.45, 0.88, z], [0.56, 0.55, z]], [0.012, 0.012, 0.012], 'rope', { line: false });
  return S;
}

// ---------------------------------------------------------------- signs, mailboxes, planters
function sandwichSculpt() {
  const S = sculpt();
  for (const sd of [-1, 1]) {
    const g = S.group();
    S.box([sd * 0.11, 0.44, 0], [0.018, 0.45, 0.27], (n, p, face) => ((sd > 0 ? face === 1 : face === 0) && Math.abs(n[1]) < 0.86 && Math.abs(n[2]) < 0.82 ? 'chalk' : 'wood'), { rot: [0, sd * 0.24, 0], group: g });
  }
  // chalk: a cocoa mug with steam, and a squiggle of prices
  const mug = paintRows([
    '..w.w..',
    '.w.w...',
    '.......',
    'wwwww..',
    'wyyyww.',
    'wyyyw.w',
    'wyyyww.',
    '.www...',
    '.......',
    'ww.www.',
    '.......',
    'w.ww.ww',
  ], { w: 0xf2efe2, y: 0xe8b860 });
  S.decal([0.2, 0.5, 0], mug, { tol: 0.06 });
  S.decal([-0.2, 0.5, 0], mug, { tol: 0.06 });
  return S;
}
function mailboxSculpt({ color = 'dark' } = {}) {
  const S = sculpt();
  S.box([0, 0.5, 0], [0.045, 0.5, 0.045], 'woodD');
  S.box([0, 1.02, 0], [0.12, 0.02, 0.06], 'wood');
  const g = S.group();
  S.box([0, 1.12, 0], [0.24, 0.08, 0.11], color, { group: g });
  S.tube([[-0.24, 1.2, 0], [0.24, 1.2, 0]], [0.11, 0.11], (n, p, u) => (u >= 0.999 ? 'canD' : color), { group: g });
  S.box([-0.05, 1.27, 0.125], [0.012, 0.11, 0.012], 'red');
  S.box([-0.02, 1.36, 0.125], [0.05, 0.035, 0.008], 'red');
  return S;
}
function flowerboxSculpt(seed = 0) {
  const S = sculpt();
  const R = rnd(seed + 11);
  S.box([0, 0.13, 0], [0.16, 0.13, 0.48], (n) => (Math.abs(n[1]) > 0.8 ? 'woodD' : 'redD'));
  S.box([0, 0.26, 0], [0.13, 0.01, 0.45], 'bark', { line: false });
  const cols = [['orange', 'yellow'], ['burgundy', 'orange'], ['yellow', 'burgundy']][seed % 3];
  for (let i = 0; i < 9; i++) {
    const z = -0.38 + i * 0.095 + (R() - 0.5) * 0.03, y = 0.32 + R() * 0.08;
    if (i % 2) S.ell([(R() - 0.5) * 0.08, y - 0.03, z], [0.06, 0.05, 0.05], 'leaf');
    else S.ell([(R() - 0.5) * 0.1, y, z], [0.075, 0.06, 0.07], cols[(i >> 1) % 2], { line: true });
  }
  return S;
}
function yardSignSculpt() {
  const S = sculpt();
  for (const z of [-0.2, 0.2]) S.box([0, 0.35, z], [0.015, 0.35, 0.015], 'woodD');
  S.box([0, 0.72, 0], [0.018, 0.2, 0.32], (n, p, face) => (Math.abs(n[1]) > 0.88 || Math.abs(n[2]) > 0.92 ? 'redD' : 'white'));
  S.decal([0.022, 0.73, 0], MAPLE, { tol: 0.05 });
  S.decal([-0.022, 0.73, 0], MAPLE, { tol: 0.05 });
  return S;
}

// ---------------------------------------------------------------- yard life
function laundrySculpt(flap = 0) {
  const S = sculpt();
  for (const z of [-1.8, 1.8]) {
    const g = S.group();
    S.box([0, 0.9, z], [0.04, 0.9, 0.04], 'grey', { group: g });
    S.box([0, 1.78, z], [0.04, 0.035, 0.22], 'grey', { group: g });
  }
  for (const x of [-0.12, 0.12]) S.tube([[x, 1.76, -1.8], [x, 1.66, 0], [x, 1.76, 1.8]], [0.006, 0.006, 0.006], 'rope', { line: false });
  const hang = (z, w, h, mat, x = 0.12) => {
    const y = 1.74 - 0.1 * (1 - (z / 1.8) ** 2) - h;
    S.box([x, y, z], [0.012, h, w], mat, { rot: [0, 0, flap * (0.5 + (z * 7) % 0.3)] });
    S.box([x + 0.01, y + h - 0.01, z - w + 0.03], [0.015, 0.025, 0.008], 'woodL');
    S.box([x + 0.01, y + h - 0.01, z + w - 0.03], [0.015, 0.025, 0.008], 'woodL');
  };
  const plaid = (n) => ((Math.floor((n[1] + 1) * 4) + Math.floor((n[2] + 1) * 4)) % 2 ? 'plaidR' : 'plaidK');
  hang(-1.2, 0.26, 0.24, plaid);
  hang(-0.62, 0.08, 0.13, 'yellow');
  hang(-0.4, 0.08, 0.13, 'yellow');
  hang(0.15, 0.42, 0.36, 'white', -0.12);
  hang(0.9, 0.22, 0.3, 'denim');
  hang(1.4, 0.16, 0.2, 'teal');
  return S;
}
function bikeSculpt() {
  const S = sculpt();
  const wheel = (x) => {
    const g = S.group();
    S.ell([x, 0.33, 0], [0.33, 0.33, 0.02], (n) => {
      const r = Math.hypot(n[0], n[1]);
      if (r > 0.86) return 'tyre';
      if (r > 0.8) return 'steel';
      if (r < 0.12) return 'steel';
      const a = Math.atan2(n[1], n[0]);
      return Math.abs(Math.sin(a * 8)) < 0.16 * (1 / Math.max(0.3, r)) * 0.4 ? 'steel' : null;
    }, { group: g });
  };
  wheel(0.5);
  wheel(-0.5);
  const fr = S.group();
  const P = { bb: [0, 0.3, 0], seat: [-0.1, 0.78, 0], head: [0.36, 0.76, 0], rear: [-0.5, 0.33, 0], front: [0.5, 0.33, 0] };
  S.tube([P.bb, P.seat], [0.022, 0.022], 'teal', { group: fr });
  S.tube([P.seat, P.head], [0.02, 0.02], 'teal', { group: fr });
  S.tube([P.bb, P.head], [0.024, 0.022], 'teal', { group: fr });
  S.tube([P.bb, P.rear], [0.016, 0.016], 'teal', { group: fr });
  S.tube([P.seat, P.rear], [0.015, 0.015], 'teal', { group: fr });
  S.tube([P.head, [0.42, 0.9, 0], P.front], [0.018, 0.018, 0.016], 'steel', { group: fr });
  S.tube([[0.4, 0.92, -0.22], [0.42, 0.93, 0], [0.4, 0.92, 0.22]], [0.014, 0.014, 0.014], 'steel');
  S.ell([-0.12, 0.84, 0], [0.11, 0.035, 0.05], 'leather');
  // a wicker basket on the front
  S.box([0.56, 0.82, 0], [0.11, 0.08, 0.14], (n) => (Math.floor((n[1] + 1) * 3) % 2 ? 'woodL' : 'wood'));
  S.tube([[0.04, 0.3, 0.06], [-0.12, 0.02, 0.18]], [0.012, 0.012], 'steel');
  return S;
}
function trapSculpt() {
  const S = sculpt();
  const cage = (n, p, face) => {
    const ax = face >> 1;
    const u = ax === 0 ? n[2] : n[0], v = ax === 1 ? n[2] : n[1];
    if (Math.abs(u) > 0.9 || Math.abs(v) > 0.88) return 'wood';
    if (ax === 1 && n[1] < 0) return 'woodD';
    const fu = ((u + 1) * 5) % 1, fv = ((v + 1) * 3.5) % 1;
    return fu < 0.22 || fv < 0.22 ? 'net' : null;
  };
  S.box([0, 0.2, 0], [0.26, 0.2, 0.36], cage);
  S.box([0, 0.02, 0], [0.24, 0.015, 0.34], 'woodD');
  S.ell([0.05, 0.16, 0.05], [0.12, 0.1, 0.12], 'net', { line: false });
  S.ell([0, 0.52, 0.18], [0.07, 0.11, 0.07], (n) => (n[1] > 0.2 ? 'yellow' : 'orange'));
  S.tube([[0, 0.42, 0.18], [0, 0.66, 0.18]], [0.012, 0.012], 'woodL');
  return S;
}
function buoySculpt() {
  const S = sculpt();
  S.ell([0, 0.24, 0], [0.15, 0.24, 0.15], (n) => (n[1] > 0.45 ? 'red' : n[1] > -0.1 ? 'white' : 'red'));
  S.tube([[0, 0.46, 0], [0, 0.7, 0]], [0.016, 0.014], 'woodL');
  return S;
}
function scarecrowSculpt(flap = 0) {
  const S = sculpt();
  S.tube([[0, 0, 0], [0, 1.25, 0]], [0.04, 0.04], 'woodD');
  const plaid = (n) => ((Math.floor((n[1] + 2) * 3) + Math.floor((n[2] + 2) * 3)) % 2 ? 'plaidR' : 'plaidK');
  // arms on the crossbar, straw poking out of the cuffs
  S.tube([[0, 1.22, -0.58], [0, 1.24, 0], [0, 1.22, 0.58]], [0.055, 0.075, 0.055], plaid);
  for (const sd of [-1, 1]) {
    S.ell([0, 1.2 + flap * 0.02, sd * 0.66], [0.04, 0.07, 0.05], 'straw');
    S.ell([0, 1.13, sd * 0.64], [0.03, 0.06, 0.04], 'strawD');
  }
  S.ell([0, 1.12, 0], [0.13, 0.19, 0.17], plaid);
  S.ell([0, 0.88, 0], [0.13, 0.13, 0.16], 'denim');
  S.box([0.12, 1.02, 0], [0.012, 0.09, 0.07], 'denim');
  S.box([0.122, 0.86, 0.05], [0.012, 0.035, 0.035], 'yellow');
  for (const sd of [-1, 1]) S.ell([0.03, 0.72, sd * 0.07], [0.04, 0.08, 0.04], 'straw');
  S.ell([0, 1.44, 0], [0.13, 0.14, 0.13], 'sack');
  S.ell([0, 1.33, 0], [0.07, 0.03, 0.09], 'rope');
  // the straw hat
  S.ell([0, 1.55, 0], [0.26, 0.025, 0.26], 'straw');
  S.ell([0, 1.6, 0], [0.13, 0.07, 0.13], (n) => (n[1] < -0.2 ? 'red' : 'straw'));
  // a stitched smile and button eyes
  S.decal([0.13, 1.47, -0.045], eye(2, { iris: 0x2a1a14, glint: 0x8a6a4a }), { tol: 0.05 });
  S.decal([0.13, 1.47, 0.045], eye(2, { iris: 0x2a1a14, glint: 0x8a6a4a }), { tol: 0.05 });
  S.decal([0.13, 1.39, 0], paintRows(['k.....k', '.k...k.', '..kkk..'], { k: 0x4a2a1a }), { tol: 0.05 });
  S.decal([0.13, 1.43, 0.0], px(0xd88a5a), { tol: 0.05 });
  return S;
}
function lampSculpt() {
  const S = sculpt();
  S.tube([[0, 0, 0], [0, 2.5, 0]], [0.06, 0.045], 'iron');
  S.box([0, 0.08, 0], [0.09, 0.08, 0.09], 'iron');
  S.tube([[0, 2.42, 0], [0.32, 2.48, 0]], [0.02, 0.02], 'iron');
  const g = S.group();
  S.box([0.34, 2.24, 0], [0.09, 0.12, 0.09], (n) => (Math.abs(n[0]) > 0.75 && Math.abs(n[2]) > 0.75 ? 'iron' : Math.abs(n[1]) > 0.85 ? 'iron' : 'glow'), { group: g });
  S.box([0.34, 2.38, 0], [0.12, 0.02, 0.12], 'iron', { group: g });
  S.ell([0.34, 2.42, 0], [0.06, 0.05, 0.06], 'iron', { group: g });
  return S;
}

// ---------------------------------------------------------------- the market: fish stall, syrup stand, poutine cart
function stallFrame(S, { canopy = ['red', 'white'], w = 1.0, d = 0.5 } = {}) {
  // a plank table on trestles, four posts and a striped awning sloping to the front
  S.box([0, 0.82, 0], [d, 0.035, w], (n) => (Math.abs(n[1]) > 0.8 ? 'woodL' : 'wood'));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) S.box([sx * (d - 0.06), 0.4, sz * (w - 0.08)], [0.035, 0.4, 0.035], 'woodD');
  S.box([d - 0.02, 0.6, 0], [0.012, 0.2, w - 0.04], (n) => (Math.floor((n[1] + 1) * 3) % 2 ? 'wood' : 'woodD'));
  for (const sz of [-1, 1]) {
    S.box([d, 1.35, sz * (w + 0.02)], [0.03, 0.55, 0.03], 'woodD');
    S.box([-d, 1.5, sz * (w + 0.02)], [0.03, 0.7, 0.03], 'woodD');
  }
  const g = S.group();
  S.box([0.05, 2.0, 0], [d + 0.25, 0.018, w + 0.16], (n) => (Math.floor((n[2] + 1) * 5) % 2 ? canopy[0] : canopy[1]), { rot: [0, -0.28, 0], group: g });
  for (let k = 0; k < 9; k++) {
    const z = (k - 4) * ((w + 0.12) / 4.3);
    S.ell([d + 0.32, 1.83, z], [0.02, 0.07, 0.11], k % 2 ? canopy[0] : canopy[1], { group: g });
  }
}
function fishStallSculpt() {
  const S = sculpt();
  stallFrame(S, { canopy: ['blue', 'white'], w: 1.0, d: 0.5 });
  // a bed of crushed ice on the table
  S.box([0, 0.9, 0], [0.42, 0.05, 0.92], (n) => ((Math.floor(n[0] * 9) + Math.floor(n[2] * 17)) % 3 ? 'ice' : 'white'));
  for (let k = 0; k < 7; k++) S.ell([((k * 37) % 7) / 7 * 0.6 - 0.3, 0.95, -0.8 + k * 0.27], [0.08, 0.03, 0.09], 'ice', { line: false });
  // lemons and a sprig of parsley
  S.ell([0.3, 0.97, -0.85], [0.05, 0.04, 0.04], 'yellow');
  S.ell([0.32, 0.97, 0.86], [0.05, 0.04, 0.04], 'yellow');
  // the chalkboard hung on the front with a fish doodle
  S.box([0.53, 0.6, 0.45], [0.012, 0.13, 0.22], 'chalk');
  S.decal([0.545, 0.6, 0.45], paintRows(['.wwww..w', 'wwyw.www', 'wwwww.ww', '.wwww..w'], { w: 0xf2efe2, y: 0x2e3c36 }), { tol: 0.05 });
  // a crate of ice and a barrel beside the stall
  S.box([0.15, 0.2, -1.3], [0.22, 0.2, 0.22], (n) => (Math.floor((n[1] + 1) * 2.5) % 2 ? 'wood' : 'woodL'));
  S.ell([0.15, 0.41, -1.3], [0.19, 0.04, 0.19], 'ice');
  return S;
}
function syrupStandSculpt() {
  const S = sculpt();
  stallFrame(S, { canopy: ['red', 'cream'], w: 0.85, d: 0.45 });
  // baskets of apples and squash on the table, jars of maple syrup on a little shelf at the back
  const R = rnd(5);
  for (const [z, kind] of [[-0.5, 'apple'], [0, 'appleG'], [0.5, 'apple']]) {
    S.ell([0.12, 0.92, z], [0.18, 0.08, 0.2], (n) => (Math.floor((n[1] + 1) * 4) % 2 ? 'woodL' : 'wood'));
    for (let i = 0; i < 6; i++) S.ell([0.12 + (R() - 0.5) * 0.2, 0.98 + R() * 0.04, z + (R() - 0.5) * 0.24], [0.05, 0.048, 0.05], kind);
  }
  S.box([-0.3, 1.05, 0], [0.1, 0.02, 0.8], 'wood');
  for (let i = 0; i < 7; i++) {
    const z = -0.66 + i * 0.22, g = S.group();
    S.tube([[-0.3, 1.07, z], [-0.3, 1.24, z]], [0.06, 0.06], 'syrup', { group: g });
    S.tube([[-0.3, 1.24, z], [-0.3, 1.29, z]], [0.035, 0.035], 'cream', { group: g });
  }
  S.box([0.48, 2.12, 0], [0.012, 0.12, 0.5], 'cream', { rot: [0, -0.28, 0] });
  S.decal([0.52, 2.12, 0], MAPLE, { tol: 0.08 });
  return S;
}
function cartSculpt() {
  const S = sculpt();
  const body = (n, p, face) => (face >> 1 === 1 ? 'steel' : Math.abs(n[1]) > 0.85 ? 'redD' : n[1] > 0.25 ? 'cream' : 'red');
  S.box([0, 0.78, 0], [0.38, 0.32, 0.65], body);
  S.box([0, 1.12, 0], [0.4, 0.025, 0.68], 'steel');
  // wheels on either side, a handle to push it, and the striped umbrella
  for (const sd of [-1, 1]) {
    S.ell([0, 0.32, sd * 0.69], [0.3, 0.3, 0.035], (n) => (Math.hypot(n[0], n[1]) > 0.84 ? 'tyre' : Math.hypot(n[0], n[1]) < 0.18 ? 'steel' : Math.abs(Math.sin(Math.atan2(n[1], n[0]) * 4)) < 0.25 ? 'steel' : 'redD'), { rot: [0, 0, 0] });
  }
  S.tube([[0, 0.5, -0.65], [0, 0.4, -0.95], [0, 0.95, -1.0]], [0.018, 0.018, 0.018], 'steel');
  S.box([0, 0.15, 0.5], [0.04, 0.15, 0.04], 'steel');
  S.tube([[0, 1.12, 0.3], [0, 2.1, 0.3]], [0.022, 0.02], 'steel');
  S.ell([0, 2.08, 0.3], [0.85, 0.22, 0.85], (n) => (n[1] < 0.05 ? null : Math.floor((Math.atan2(n[2], n[0]) + TAU) * 8 / TAU * 1.0) % 2 ? 'yellow' : 'red'));
  S.ell([0, 2.3, 0.3], [0.04, 0.04, 0.04], 'yellow');
  // a steaming pot and a stack of paper boats
  S.tube([[0.05, 1.14, -0.3], [0.05, 1.32, -0.3]], [0.13, 0.13], 'can');
  S.ell([0.05, 1.32, -0.3], [0.12, 0.02, 0.12], 'core', { line: false });
  S.box([0.1, 1.2, 0.0], [0.08, 0.06, 0.1], 'paper');
  S.decal([0.385, 0.68, 0], paintRows([
    '.yyyyy.',
    'yy.y.yy',
    'yyyyyyy',
    '.y.y.y.',
  ], { y: 0xf4d058 }), { tol: 0.06 });
  return S;
}

// ---------------------------------------------------------------- fish & seafood (lying on the ice, flopping on the ground)
function fishSculpt(sp, bend) {
  const S = sculpt();
  const L = sp.len;
  const yAt = (x) => bend * (x * x / (L * L) - 0.02) * 0.6 * L;
  const slope = (x) => Math.atan(bend * x * 1.2 / L);
  const mat = (h) => sp.mat(h);
  const segs = [[0.45, [0.42, 0.24, 0.15]], [0.05, [0.5, 0.27, 0.17]], [-0.38, [0.36, 0.2, 0.14]], [-0.7, [0.22, 0.12, 0.09]]];
  for (const [fx, r] of segs) {
    const x = fx * L * 0.5;
    S.ell([x, yAt(x) + 0.03 * L, 0], r.map((v) => v * L * 0.5), mat, { rot: [0, slope(x), 0], group: 1 });
  }
  const tx = -0.48 * L, ty = yAt(tx) + 0.03 * L, ta = slope(tx);
  S.ell([tx, ty + 0.05 * L, 0], [0.09 * L, 0.05 * L, 0.012 * L], sp.fin, { rot: [0, ta + 0.8, 0], group: 2 });
  S.ell([tx, ty - 0.05 * L, 0], [0.09 * L, 0.05 * L, 0.012 * L], sp.fin, { rot: [0, ta - 0.8, 0], group: 2 });
  S.ell([0.02 * L, yAt(0) + 0.15 * L, 0], [0.12 * L, 0.04 * L, 0.01 * L], sp.fin, { rot: [0, -0.3, 0], group: 3 });
  if (sp.fin2) S.ell([-0.2 * L, yAt(-0.2 * L) + 0.12 * L, 0], [0.08 * L, 0.035 * L, 0.01 * L], sp.fin, { rot: [0, -0.3, 0], group: 3 });
  for (const sd of [-1, 1]) S.decal([0.36 * L, yAt(0.36 * L) + 0.05 * L, sd * 0.06 * L], eye(2, { ring: sp.ring }), { tol: 0.04 });
  if (sp.barbel) S.decal([0.47 * L, yAt(0.47 * L) - 0.03 * L, 0], (put, x, y) => { put(x, y, 0x5e5a3a); put(x - 1, y + 1, 0x5e5a3a); }, { tol: 0.05, always: true });
  return S;
}
const speckle = (h) => { const u = h[0] * 5.3 + h[2] * 3.1 + 9, v = h[1] * 4.7 + 3; return ((Math.sin(u * 7.1) * Math.sin(v * 9.3)) > 0.55); };
const FISH = {
  cod: { len: 0.62, mat: (h) => (h[1] < -0.25 ? 'codBelly' : speckle(h) ? 'greyD' : 'cod'), fin: 'cod', fin2: true, barbel: true, ring: null },
  salmon: { len: 0.7, mat: (h) => (h[1] > 0.4 ? (speckle(h) ? 'dark' : 'salmon') : h[1] > -0.1 ? 'salmonS' : h[1] > -0.4 ? 'salmonP' : 'salmonS'), fin: 'salmon', ring: null },
  mackerel: { len: 0.42, mat: (h) => (h[1] > 0.15 ? (Math.sin(h[0] * 14 + h[1] * 9) > 0.45 ? 'dark' : 'mack') : 'mackS'), fin: 'mack', fin2: true, ring: null },
};
function lobsterSculpt(snap = 0) {
  const S = sculpt();
  const body = S.group();
  for (let k = 0; k < 6; k++) {
    const x = -0.05 - k * 0.05;
    S.ell([x, 0.06 - k * 0.004, 0], [0.032, 0.035 - k * 0.003, 0.045 - k * 0.004], k % 2 ? 'lobster' : 'lobsterD', { group: body });
  }
  S.ell([-0.36, 0.04, 0], [0.04, 0.012, 0.06], 'lobster', { group: body });
  S.ell([0.06, 0.07, 0], [0.1, 0.055, 0.06], 'lobster', { group: body });
  S.tube([[0.15, 0.08, 0], [0.22, 0.1, 0]], [0.025, 0.012], 'lobster');
  for (const sd of [-1, 1]) {
    const g = S.group();
    S.tube([[0.1, 0.07, sd * 0.05], [0.2, 0.06, sd * 0.12], [0.28, 0.06, sd * 0.13]], [0.018, 0.022, 0.03], 'lobster', { group: g });
    const o = snap * 0.04;
    S.ell([0.36, 0.07 + o, sd * 0.13], [0.08, 0.03, 0.04], 'lobsterD', { group: g });
    S.ell([0.35, 0.04 - o, sd * 0.13], [0.065, 0.02, 0.03], 'lobster', { group: g });
    for (let k = 0; k < 3; k++) S.tube([[0.02 - k * 0.05, 0.05, sd * 0.05], [-0.02 - k * 0.05, 0.02, sd * 0.13], [-0.04 - k * 0.05, 0.0, sd * 0.16]], [0.008, 0.008, 0.006], 'lobsterD');
    S.tube([[0.18, 0.1, sd * 0.02], [0.3, 0.16, sd * 0.1], [0.42, 0.14, sd * 0.2]], [0.005, 0.004, 0.003], 'lobsterD', { line: false });
  }
  for (const sd of [-1, 1]) S.decal([0.15, 0.11, sd * 0.03], eye(1), { tol: 0.04 });
  return S;
}

// ---------------------------------------------------------------- litter & loose bits
function litterSculpt(kind) {
  const S = sculpt();
  switch (kind) {
    case 'paper':
      S.ell([0, 0.06, 0], [0.065, 0.058, 0.062], (n) => ((Math.floor(n[0] * 4 + n[1] * 3 + n[2] * 5) & 1) ? 'paper' : 'newsprint'));
      break;
    case 'peel':
      S.tube([[0, 0.02, 0], [0.04, 0.09, 0]], [0.025, 0.02], 'peel');
      S.tube([[0, 0.02, 0], [-0.08, 0.04, 0.02], [-0.12, 0.01, 0.03]], [0.02, 0.018, 0.012], 'peel');
      S.tube([[0, 0.02, 0], [0.09, 0.03, -0.02], [0.13, 0.0, -0.03]], [0.02, 0.018, 0.012], 'peel');
      S.ell([0.04, 0.1, 0], [0.012, 0.012, 0.012], 'dark');
      break;
    case 'core':
      S.tube([[0, 0.02, 0], [0, 0.11, 0]], [0.035, 0.035], 'core');
      S.ell([0, 0.025, 0], [0.045, 0.025, 0.045], 'apple');
      S.ell([0, 0.12, 0], [0.042, 0.022, 0.042], 'apple');
      S.tube([[0, 0.14, 0], [0.01, 0.17, 0]], [0.006, 0.006], 'bark');
      break;
    case 'can':
      S.tube([[-0.06, 0.035, 0], [0.06, 0.035, 0]], [0.034, 0.034], (n, p, u) => (u <= 0.001 || u >= 0.999 ? 'steel' : Math.abs(n[1]) < 0.3 && n[2] > 0 ? 'white' : 'red'));
      break;
    case 'bottle':
      S.tube([[-0.08, 0.035, 0], [0.03, 0.035, 0], [0.06, 0.03, 0], [0.1, 0.03, 0]], [0.035, 0.035, 0.016, 0.014], 'glass');
      break;
    case 'news':
      S.box([0, 0.012, 0], [0.11, 0.01, 0.14], (n) => (Math.floor((n[2] + 1) * 6) % 2 ? 'newsprint' : 'paper'), { rot: [0.4, 0.15, 0] });
      break;
    case 'apple':
      S.ell([0, 0.055, 0], [0.058, 0.055, 0.058], 'apple');
      S.tube([[0, 0.1, 0], [0.01, 0.13, 0]], [0.006, 0.006], 'bark');
      S.ell([0.02, 0.12, 0.01], [0.02, 0.006, 0.012], 'leaf');
      break;
    case 'appleG':
      S.ell([0, 0.055, 0], [0.058, 0.055, 0.058], 'appleG');
      S.tube([[0, 0.1, 0], [0.01, 0.13, 0]], [0.006, 0.006], 'bark');
      break;
    case 'jar':
      S.tube([[0, 0.0, 0], [0, 0.15, 0]], [0.055, 0.055], 'syrup');
      S.tube([[0, 0.15, 0], [0, 0.19, 0]], [0.035, 0.035], 'cream');
      break;
    case 'plank':
      S.box([0, 0.02, 0], [0.04, 0.012, 0.28], (n) => (n[1] > 0.5 ? 'woodL' : 'wood'), { rot: [0.3, 0, 0.1] });
      break;
    case 'picket':
      S.box([0, 0.02, 0], [0.4, 0.016, 0.042], 'paint', { rot: [0.5, 0, 0] });
      break;
    default:
      break;
  }
  return S;
}

// ---------------------------------------------------------------- catalogue
// kind -> { ppm, pitch, views, n, pose(i) -> Sculpt }
const one = (pose, ppm, views = ALL5, o = {}) => ({ ppm, pitch: 0.32, views, n: 1, pose: () => pose(), ...o });
export const DECO = {
  picket: one(() => picketSculpt(), 40),
  rail: one(() => railSculpt(0), 36),
  rail2: one(() => railSculpt(4), 36),
  trashcan: one(() => trashcanSculpt(), 48, ['side']),
  trashcanOpen: one(() => trashcanSculpt({ lid: false }), 48, ['side']),
  lid: one(() => lidSculpt(), 48, ['side']),
  recycle: one(() => recycleSculpt(), 48),
  recycleEmpty: one(() => recycleSculpt({ full: false }), 48),
  crate: one(() => crateSculpt(), 48),
  crateEmpty: one(() => crateSculpt({ apples: false }), 48),
  barrel: one(() => barrelSculpt(), 44, ['side']),
  firewood: one(() => firewoodSculpt(), 44),
  log: one(() => logSculpt(), 48, FRONT3),
  hay: one(() => haySculpt(), 36),
  sandwich: one(() => sandwichSculpt(), 48),
  mailbox: one(() => mailboxSculpt(), 44),
  mailboxRed: one(() => mailboxSculpt({ color: 'redD' }), 44),
  flowerbox: one(() => flowerboxSculpt(0), 48),
  flowerbox2: one(() => flowerboxSculpt(1), 48),
  yardsign: one(() => yardSignSculpt(), 48),
  laundry: { ppm: 32, pitch: 0.32, views: ALL5, n: 2, pose: (i) => laundrySculpt(i ? 0.18 : -0.1) },
  bike: one(() => bikeSculpt(), 44),
  trap: one(() => trapSculpt(), 44),
  buoy: one(() => buoySculpt(), 48, ['side']),
  scarecrow: { ppm: 36, pitch: 0.32, views: ALL5, n: 2, pose: (i) => scarecrowSculpt(i) },
  lamp: one(() => lampSculpt(), 32, FRONT3),
  fishstall: one(() => fishStallSculpt(), 34),
  syrupstand: one(() => syrupStandSculpt(), 34),
  cart: one(() => cartSculpt(), 36),
  cod: { ppm: 56, pitch: 0.55, views: ['side'], n: 3, pose: (i) => fishSculpt(FISH.cod, (i - 1) * 0.9) },
  salmon: { ppm: 56, pitch: 0.55, views: ['side'], n: 3, pose: (i) => fishSculpt(FISH.salmon, (i - 1) * 0.9) },
  mackerel: { ppm: 60, pitch: 0.55, views: ['side'], n: 3, pose: (i) => fishSculpt(FISH.mackerel, (i - 1) * 0.9) },
  lobster: { ppm: 64, pitch: 0.7, views: ['side'], n: 3, pose: (i) => lobsterSculpt([0, 1, 0.4][i]) },
};
for (const k of ['paper', 'peel', 'core', 'can', 'bottle', 'news', 'apple', 'appleG', 'jar', 'plank']) DECO[`bit_${k}`] = one(() => litterSculpt(k), 56, ['side']);
DECO.bit_picket = one(() => litterSculpt('picket'), 40, ['side']);

// paints frames into a SpriteAtlas; yields after each frame so the work can be spread over a few frames
export function* paintDecoGen(atlas, kinds = Object.keys(DECO)) {
  for (const kind of kinds) {
    const K = DECO[kind];
    for (let i = 0; i < K.n; i++) {
      const S = K.pose(i);
      for (const view of K.views) {
        const v = VIEWS[view];
        const r = renderSculpt(S, { yaw: v.yaw, pitch: K.pitch }, K.ppm, { contour: 2.2 });
        const f = atlas.add(`${kind}:${view}:${i}`, r.w, r.h, (pix, x, y) => blit(pix, x, y, r), r.ax, r.ay);
        f.ppm = r.ppm;
        yield kind;
      }
    }
  }
}
function blit(pix, x, y, r) {
  const d = pix.data;
  for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
    const k = (j * r.w + i) * 4;
    if (!r.rgba[k + 3]) continue;
    const o = ((y + j) * pix.w + (x + i)) * 4;
    d[o] = r.rgba[k]; d[o + 1] = r.rgba[k + 1]; d[o + 2] = r.rgba[k + 2];
    d[o + 3] = r.glow[j * r.w + i] ? 160 : 255; // alpha 160 = glowing pixel
  }
}

// tiny deterministic random
function rnd(seed) {
  let s = (seed * 9301 + 49297) % 233280 || 1;
  return () => (s = (s * 9301 + 49297) % 233280) / 233280;
}
export { INK };
// shared with the furniture art (furniture2d.js)
export { MATS, M as mat, cyl, paintRows, px, rnd, MAPLE, ALL5, FRONT3, blit };
