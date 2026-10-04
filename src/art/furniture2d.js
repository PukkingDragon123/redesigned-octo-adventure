// 2D furniture and odds and ends for Maple Cove, in the same sculpted pixel-art
// style as the street clutter (deco2d.js): porch and yard furniture (rocking
// chairs, porch swings, Muskoka chairs, side tables with cocoa, potted mums and
// ferns, wind chimes, boot racks, wood boxes, wheelbarrows,
// gnomes, bird baths, leaf piles and rakes), café terraces (bistro sets,
// umbrellas, menu easels, newspaper boxes, barrel planters, a phone booth,
// street-name signs), the harbour and the beach (deck chairs, coolers, fishing
// rods, nets, life rings, kayaks, picnic baskets, pails, beach balls), the park
// (picnic tables, benches, a music stand, flower beds, a little free library),
// flat things that lie on the ground (welcome mats, beach towels) and the
// goods shown in the shop windows (donuts, cakes, mugs, bread, tools, tins,
// parcels, fishing tackle).
//
// Same conventions as deco2d.js: feet at the origin, +x is the FRONT, y up, z to
// the side; frame names `${kind}:${view}:${i}`. Kinds with `flat` are drawn as
// cards lying on the ground or standing in a shop window instead of billboards.
import { Sculpt, ramp, eye } from './sculpt2d.js';
import { MATS as BASE, mat as M, cyl, paintRows, rnd, MAPLE, ALL5, FRONT3 } from './deco2d.js';

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- materials
const MATS = {
  ...BASE,
  terra: M(0xc0643a, { ramp: [0x2a0e06, 0x8a3e20, 0xc0643a, 0xd8804e, 0xeca06a] }),
  terraD: M(0x9a4a2a, { ramp: [0x200a04, 0x6a2e16, 0x9a4a2a, 0xb05e36, 0xc47446] }),
  stone: M(0xa8a49a, { ramp: [0x26242a, 0x7a766e, 0xa8a49a, 0xc2beb2, 0xdcd8cc] }),
  stoneD: M(0x7e7a72, { ramp: [0x1a181c, 0x5a5650, 0x7e7a72, 0x96928a, 0xaaa69c] }),
  marble: M(0xece4d4, { ramp: [0x38302c, 0xbab0a0, 0xece4d4, 0xf6f0e4, 0xffffff], hi: true }),
  bistro: M(0x2e5a40, { ramp: [0x08140c, 0x1e3e2a, 0x2e5a40, 0x447a58, 0x62a078], hi: true }),
  skin: M(0xf0b48a, { ramp: [0x4a2418, 0xd08a64, 0xf0b48a, 0xf8caa4, 0xffe0c4] }),
  beard: M(0xf2eee6, { ramp: [0x3a3438, 0xc4beb8, 0xf2eee6, 0xfaf8f2, 0xffffff] }),
  water: M(0x6aa8d0, { ramp: [0x10243a, 0x4a86b4, 0x6aa8d0, 0x92c6e4, 0xd0ecfa], hi: true }),
  leafR: M(0xc0381e, { ramp: [0x2a0804, 0x8a2410, 0xc0381e, 0xdc5a2e, 0xf08a4e] }),
  leafO: M(0xe0782a, { ramp: [0x3a1806, 0xb05418, 0xe0782a, 0xf09a44, 0xf8bc6a] }),
  leafY: M(0xe8b832, { ramp: [0x3a2a06, 0xb48a1a, 0xe8b832, 0xf4d058, 0xfce88e] }),
  leafB: M(0x9a5a2a, { ramp: [0x200e04, 0x6e3c18, 0x9a5a2a, 0xb4723a, 0xc88a4e] }),
  fern: M(0x5a8e34, { ramp: [0x0e1e06, 0x3a6a1e, 0x5a8e34, 0x76aa48, 0x98c460] }),
  cocoa: M(0x6a3a22, { ramp: [0x1a0a04, 0x4a2414, 0x6a3a22, 0x84502e, 0x9c6a42] }),
  wicker: M(0xc89a52, { ramp: [0x3a2410, 0x9a7034, 0xc89a52, 0xdcb470, 0xecd090] }),
  gingham: M(0xd8403a, { ramp: [0x2a0808, 0xa02a26, 0xd8403a, 0xe86a5e, 0xf49a8a] }),
  canvasR: M(0xc83a3a, { ramp: [0x2a0808, 0x902626, 0xc83a3a, 0xde5a52, 0xf08a7a] }),
  canvasB: M(0x2e6ab0, { ramp: [0x0a1830, 0x1e4a84, 0x2e6ab0, 0x4a88cc, 0x76aae4] }),
  kayakO: M(0xe8762a, { ramp: [0x3a1606, 0xb0521a, 0xe8762a, 0xf49448, 0xfcb874], hi: true }),
  kayakT: M(0x2aa0a0, { ramp: [0x06221e, 0x1a7472, 0x2aa0a0, 0x48bcb8, 0x80dcd4], hi: true }),
  pink: M(0xf08aa8, { ramp: [0x3a1424, 0xc0607e, 0xf08aa8, 0xf8aac2, 0xffd0de] }),
  dough: M(0xd89a52, { ramp: [0x3a2010, 0xa86e30, 0xd89a52, 0xe8b46c, 0xf4cc8c] }),
  choc: M(0x5a2e1a, { ramp: [0x140604, 0x3e1c10, 0x5a2e1a, 0x74402a, 0x8e5a3e], hi: true }),
  crust: M(0xc07a32, { ramp: [0x2e1406, 0x8e5220, 0xc07a32, 0xd8984a, 0xeab66a] }),
  sponge: M(0xf0d08a, { ramp: [0x3a2c12, 0xc4a462, 0xf0d08a, 0xf8e2a8, 0xfff2cc] }),
  book1: M(0x7a2a3a, { ramp: [0x1a0608, 0x541a26, 0x7a2a3a, 0x963e4e, 0xae5464] }),
  book2: M(0x2a4a7a, { ramp: [0x080e1a, 0x1a3054, 0x2a4a7a, 0x3e6294, 0x587eae] }),
  book3: M(0x3a6a3a, { ramp: [0x0a160a, 0x264a26, 0x3a6a3a, 0x528452, 0x6ea06e] }),
  copper: M(0xc87a4a, { ramp: [0x2e1408, 0x96522e, 0xc87a4a, 0xe09a64, 0xf4c08a], hi: true }),
  sand: M(0xe8d4a0, { ramp: [0x3a3018, 0xbaa46e, 0xe8d4a0, 0xf4e4bc, 0xfcf2d8] }),
  pegboard: M(0xc8a878, { ramp: [0x3a2c18, 0x9a7e52, 0xc8a878, 0xdcc094, 0xecd6b0], flat: true }),
  cardboard: M(0xc49a64, { ramp: [0x342410, 0x967040, 0xc49a64, 0xd8b27e, 0xe8c89a] }),
  pane: M(0x8ab4c8, { ramp: [0x1a2a34, 0x5e8aa0, 0x8ab4c8, 0xa8cad8, 0xd4ecf4], hi: true }),
  glowW: M(0xfff0c8, { ramp: [0x6a5a3a, 0xffe8b0, 0xfff0c8, 0xfff8e0, 0xffffff], glow: true, flat: true }),
};
const sculpt = () => new Sculpt(MATS);

// a 3x5 pixel font for the little signs (rows top to bottom)
const GLYPHS = {
  A: '.#.|#.#|###|#.#|#.#', B: '##.|#.#|##.|#.#|##.', C: '.##|#..|#..|#..|.##', D: '##.|#.#|#.#|#.#|##.', E: '###|#..|##.|#..|###',
  F: '###|#..|##.|#..|#..', G: '.##|#..|#.#|#.#|.##', H: '#.#|#.#|###|#.#|#.#', I: '###|.#.|.#.|.#.|###', K: '#.#|#.#|##.|#.#|#.#',
  L: '#..|#..|#..|#..|###', M: '#.#|###|###|#.#|#.#', N: '##.|#.#|#.#|#.#|#.#', O: '.#.|#.#|#.#|#.#|.#.', P: '##.|#.#|##.|#..|#..',
  R: '##.|#.#|##.|#.#|#.#', S: '.##|#..|.#.|..#|##.', T: '###|.#.|.#.|.#.|.#.', U: '#.#|#.#|#.#|#.#|###', V: '#.#|#.#|#.#|#.#|.#.',
  W: '#.#|#.#|###|###|#.#', Y: '#.#|#.#|.#.|.#.|.#.', 0: '###|#.#|#.#|#.#|###', 1: '.#.|##.|.#.|.#.|###', 2: '##.|..#|.#.|#..|###',
  3: '##.|..#|.#.|..#|##.', 4: '#.#|#.#|###|..#|..#', 5: '###|#..|##.|..#|##.', 6: '.##|#..|###|#.#|###', 7: '###|..#|.#.|.#.|.#.',
  8: '###|#.#|###|#.#|###', 9: '###|#.#|###|..#|##.', $: '.##|##.|.#.|.##|##.', '&': '.#.|#.#|.#.|#.#|.##', '.': '...|...|...|...|.#.', ' ': '...|...|...|...|...',
};
const FONT = Object.fromEntries(Object.entries(GLYPHS).map(([k, v]) => [k, v.replaceAll('|', '')]));
function textPainter(str, col, { shadow = null, gap = 1 } = {}) {
  const w = str.length * (3 + gap) - gap;
  return (put, x, y) => {
    let cx = x - (w >> 1);
    for (const ch of str) {
      const g = FONT[ch] || FONT[' '];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '#') {
        if (shadow != null) put(cx + i + 1, y - 2 + j + 1, shadow);
        put(cx + i, y - 2 + j, col);
      }
      cx += 3 + gap;
    }
  };
}
// decal painter that only stamps when the surface faces the viewer (normal along local +x or +z)
const facing = (axis, fn, lim = 0.75) => (put, x, y, view, info) => {
  const a = axis === 'x' ? Math.abs(Math.sin(view.yaw)) : Math.abs(Math.cos(view.yaw));
  if (a >= lim) fn(put, x, y, view, info);
};

const hash = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
const slatsZ = (k, a, b) => (n) => (Math.floor((n[2] + 1) * k) % 2 ? a : b);
const stripeY = (k, a, b) => (n) => (Math.floor((n[1] + 1) * k) % 2 ? a : b);

// ---------------------------------------------------------------- porch & yard
function rockerSculpt() {
  const S = sculpt();
  const fr = 'woodD', lean = [0, 0.2, 0];
  for (const sd of [-1, 1]) {
    const z = sd * 0.24;
    const g = S.group();
    S.tube([[-0.46, 0.1, z], [-0.22, 0.03, z], [0.1, 0.022, z], [0.36, 0.08, z]], [0.022, 0.025, 0.025, 0.02], fr, { group: g });
    S.box([0.16, 0.25, z], [0.022, 0.23, 0.022], fr, { group: g });
    S.box([-0.2, 0.25, z], [0.022, 0.23, 0.022], fr, { group: g });
    S.box([-0.27, 0.76, z], [0.024, 0.33, 0.024], fr, { rot: lean });
    S.box([0.0, 0.67, z], [0.23, 0.017, 0.04], 'wood');
    S.box([0.17, 0.58, z], [0.018, 0.09, 0.018], fr);
  }
  S.box([-0.02, 0.47, 0], [0.22, 0.025, 0.26], (n) => (Math.abs(n[1]) > 0.8 ? 'wood' : fr));
  for (let k = -2; k <= 2; k++) S.box([-0.275, 0.76, k * 0.085], [0.012, 0.29, 0.016], 'wood', { rot: lean });
  S.box([-0.34, 1.07, 0], [0.03, 0.045, 0.28], fr, { rot: lean });
  // a plaid cushion and a striped wool blanket over the back
  S.box([0.0, 0.51, 0], [0.19, 0.035, 0.21], (n) => ((Math.floor((n[0] + 1) * 3) + Math.floor((n[2] + 1) * 3)) % 2 ? 'plaidR' : 'plaidK'));
  S.box([-0.235, 0.86, 0.03], [0.022, 0.17, 0.17], stripeY(4, 'cream', 'burgundy'), { rot: lean });
  S.box([-0.2, 0.62, 0.07], [0.02, 0.13, 0.13], stripeY(4, 'cream', 'burgundy'), { rot: [0, 0.05, 0] });
  return S;
}
function swingSculpt(cushion = 'teal') {
  const S = sculpt();
  const L = 0.64, lean = [0, 0.24, 0];
  S.box([0, 0.47, 0], [0.24, 0.025, L], (n) => (Math.abs(n[1]) > 0.8 ? 'paint' : 'paintD'));
  for (let k = -5; k <= 5; k++) S.box([-0.24, 0.72, k * 0.115], [0.014, 0.23, 0.045], 'paint', { rot: lean });
  S.box([-0.3, 0.96, 0], [0.025, 0.035, L + 0.02], 'paintD', { rot: lean });
  for (const sd of [-1, 1]) {
    S.box([0.02, 0.66, sd * L], [0.24, 0.018, 0.035], 'paint');
    S.box([0.2, 0.57, sd * L], [0.018, 0.09, 0.018], 'paintD');
    S.box([0, 0.43, sd * (L - 0.03)], [0.25, 0.03, 0.025], 'paintD');
    // chains up to the porch ceiling
    S.tube([[0.2, 0.68, sd * L], [-0.02, 2.75, sd * (L - 0.04)]], [0.009, 0.009], 'iron', { line: false });
    S.tube([[-0.3, 0.98, sd * L], [-0.02, 2.75, sd * (L - 0.04)]], [0.009, 0.009], 'iron', { line: false });
  }
  // cushions and a throw pillow
  S.box([0.02, 0.51, -0.3], [0.2, 0.035, 0.29], cushion);
  S.box([0.02, 0.51, 0.3], [0.2, 0.035, 0.29], cushion);
  S.ell([-0.13, 0.66, 0.38], [0.07, 0.13, 0.13], (n) => (Math.abs(n[1]) < 0.25 ? 'cream' : 'burgundy'), { rot: [0, 0.3, 0] });
  return S;
}
function muskokaSculpt(col) {
  const S = sculpt();
  const dk = col === 'red' ? 'redD' : col === 'teal' ? 'canD' : col === 'yellow' ? 'strawD' : 'denim';
  S.box([0.02, 0.36, 0], [0.25, 0.022, 0.27], slatsZ(5, col, dk), { rot: [0, 0.16, 0] });
  for (let k = -3; k <= 3; k++) {
    const hh = 0.38 + (3 - Math.abs(k)) * 0.03;
    S.box([-0.33, 0.33 + hh * 0.9, k * 0.078], [0.016, hh, 0.033], col, { rot: [0, 0.48, k * 0.045] });
  }
  S.box([-0.29, 0.62, 0], [0.02, 0.025, 0.3], dk, { rot: [0, 0.48, 0] });
  for (const sd of [-1, 1]) {
    S.box([0.07, 0.6, sd * 0.33], [0.31, 0.018, 0.08], col);
    S.box([0.26, 0.3, sd * 0.3], [0.03, 0.3, 0.03], dk);
    S.box([-0.18, 0.18, sd * 0.27], [0.03, 0.18, 0.03], dk);
    S.box([0.27, 0.54, sd * 0.33], [0.025, 0.05, 0.03], dk);
  }
  return S;
}
function sideTableSculpt() {
  const S = sculpt();
  cyl(S, [[0, 0.5, 0], [0, 0.535, 0]], [0.24, 0.24], 'wood', 'woodL');
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.4; S.tube([[0, 0.5, 0], [Math.cos(a) * 0.18, 0.0, Math.sin(a) * 0.18]], [0.02, 0.018], 'woodD'); }
  cyl(S, [[0, 0.04, 0], [0, 0.5, 0]], [0.03, 0.03], 'woodD', null);
  // two mugs of cocoa with marshmallows, and a plate of maple cookies
  for (const [x, z, c] of [[0.06, -0.1, 'red'], [-0.08, 0.06, 'cream']]) {
    cyl(S, [[x, 0.535, z], [x, 0.635, z]], [0.042, 0.045], c, 'cocoa');
    S.tube([[x, 0.62, z + 0.045], [x + 0.01, 0.585, z + 0.08], [x, 0.555, z + 0.045]], [0.012, 0.012, 0.012], c);
    S.ell([x + 0.01, 0.64, z - 0.01], [0.015, 0.012, 0.015], 'white', { line: false });
  }
  S.ell([0.1, 0.545, 0.12], [0.08, 0.012, 0.08], 'white');
  for (const [dx, dz] of [[0, 0], [0.04, 0.03], [-0.03, 0.04]]) S.ell([0.1 + dx, 0.56, 0.12 + dz], [0.03, 0.01, 0.03], 'dough');
  return S;
}
const MUM = [['orange', 'leafO'], ['burgundy', 'redD'], ['yellow', 'leafY'], ['white', 'cream']];
function potSculpt(S, r0 = 0.13, r1 = 0.18, h = 0.3, m = 'terra') {
  cyl(S, [[0, 0.0, 0], [0, h * 0.85, 0]], [r0, r1 * 0.96], (n) => (n[0] < -0.3 ? 'terraD' : m), 'bark');
  cyl(S, [[0, h * 0.82, 0], [0, h, 0]], [r1, r1 + 0.012], m, 'bark');
}
function mumSculpt(v) {
  const S = sculpt();
  const [c, d] = MUM[v % MUM.length];
  potSculpt(S);
  S.ell([0, 0.36, 0], [0.24, 0.1, 0.24], 'leaf');
  S.ell([0, 0.43, 0], [0.25, 0.19, 0.25], (n) => (n[1] < -0.45 ? 'leaf' : hash(Math.floor(n[0] * 9), Math.floor(n[1] * 9), Math.floor(n[2] * 9)) > 0.72 ? d : c));
  return S;
}
function fernSculpt() {
  const S = sculpt();
  potSculpt(S, 0.12, 0.17, 0.32);
  const top = 0.3;
  const R = rnd(4);
  const n = 11;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + R() * 0.4, s = 0.8 + R() * 0.35;
    const dx = Math.cos(a), dz = Math.sin(a);
    const droop = -0.02;
    S.tube([[0, top, 0], [dx * 0.16 * s, top + 0.2 * s, dz * 0.16 * s], [dx * 0.36 * s, top + 0.14 * s + droop * 0.4, dz * 0.36 * s], [dx * 0.46 * s, top + droop, dz * 0.46 * s]],
      [0.03, 0.05, 0.038, 0.012], k % 2 ? 'fern' : 'leaf');
  }
  return S;
}
function bootRackSculpt() {
  const S = sculpt();
  S.box([0, 0.05, 0], [0.16, 0.025, 0.46], slatsZ(9, 'wood', 'woodD'));
  for (const sd of [-1, 1]) S.box([0, 0.025, sd * 0.44], [0.16, 0.025, 0.025], 'woodD');
  const boot = (z, col, tall, tilt = 0) => {
    const g = S.group();
    S.tube([[0.0, 0.08, z], [0.0, 0.08 + tall, z + tilt]], [0.055, 0.06], col, { group: g });
    S.ell([0.06, 0.11, z], [0.11, 0.05, 0.055], col, { group: g });
    S.ell([0.0, 0.08 + tall, z + tilt], [0.06, 0.012, 0.06], 'dark', { line: false });
  };
  boot(-0.34, 'yellow', 0.3); boot(-0.21, 'yellow', 0.3, 0.03);
  boot(-0.02, 'red', 0.26, -0.02); boot(0.11, 'red', 0.26);
  boot(0.3, 'leather', 0.12); boot(0.41, 'leather', 0.12);
  return S;
}
function woodBoxSculpt() {
  const S = sculpt();
  S.box([0, 0.28, 0], [0.24, 0.28, 0.42], (n, p, face) => (face >> 1 === 1 ? 'woodD' : Math.abs(n[1]) > 0.85 || Math.abs(n[2]) > 0.92 || Math.abs(n[0]) > 0.92 ? 'woodD' : Math.floor((n[1] + 1) * 3) % 2 ? 'wood' : 'woodL'));
  const R = rnd(21);
  for (const [y, cnt] of [[0.58, 5], [0.68, 4], [0.77, 2]]) for (let k = 0; k < cnt; k++) {
    const z = (k - (cnt - 1) / 2) * 0.13 + (R() - 0.5) * 0.03, y2 = y + (R() - 0.5) * 0.02;
    S.tube([[-0.2, y2, z], [0.22 + R() * 0.04, y2, z]], [0.06, 0.06], (n, p, u) => (u <= 0.001 || u >= 0.999 ? 'logEnd' : n[1] > 0.3 ? 'bark' : 'woodD'));
  }
  // an axe leaning on the side
  S.tube([[0.18, 0.02, 0.5], [0.06, 0.75, 0.46]], [0.016, 0.016], 'woodL');
  S.box([0.07, 0.72, 0.46], [0.07, 0.04, 0.012], (n) => (n[0] > 0.5 ? 'steel' : 'iron'), { rot: [0, -0.15, 0] });
  return S;
}
function chimesSculpt(sway = 0) {
  const S = sculpt();
  const top = 2.2;
  S.tube([[0, top + 0.2, 0], [0, top + 0.02, 0]], [0.006, 0.006], 'iron', { line: false });
  cyl(S, [[0, top - 0.02, 0], [0, top + 0.02, 0]], [0.1, 0.1], 'woodD', 'wood');
  const lens = [0.36, 0.3, 0.26, 0.32, 0.4];
  lens.forEach((l, k) => {
    const a = (k / lens.length) * TAU, x = Math.cos(a) * 0.075, z = Math.sin(a) * 0.075;
    const o = sway * (k % 2 ? 0.03 : -0.02);
    S.tube([[x, top - 0.06, z], [x + o, top - 0.06 - l, z + o * 0.5]], [0.013, 0.013], 'steel');
  });
  S.tube([[0, top - 0.02, 0], [sway * 0.04, top - 0.52, 0]], [0.004, 0.004], 'rope', { line: false });
  S.ell([sway * 0.03, top - 0.3, 0], [0.04, 0.012, 0.04], 'woodL');
  S.box([sway * 0.05, top - 0.6, 0], [0.045, 0.07, 0.006], 'wood', { rot: [0, 0, sway * 0.4] });
  return S;
}
function barrowSculpt(load = 'leaves') {
  const S = sculpt();
  const tray = (n, p, face) => (face === 3 ? 'dark' : n[1] < -0.6 ? 'redD' : 'red');
  S.box([0.08, 0.44, 0], [0.34, 0.13, 0.26], tray, { rot: [0, 0.06, 0] });
  S.ell([0.5, 0.17, 0], [0.17, 0.17, 0.035], (n) => (Math.hypot(n[0], n[1]) > 0.78 ? 'tyre' : Math.hypot(n[0], n[1]) < 0.25 ? 'steel' : 'red'));
  for (const sd of [-1, 1]) {
    S.tube([[0.5, 0.17, sd * 0.05], [0.2, 0.32, sd * 0.2], [-0.42, 0.42, sd * 0.24], [-0.74, 0.52, sd * 0.25]], [0.016, 0.018, 0.018, 0.02], 'woodD');
    S.box([-0.72, 0.52, sd * 0.25], [0.07, 0.025, 0.025], 'dark', { rot: [0, 0.15, 0] });
    S.box([-0.26, 0.17, sd * 0.21], [0.018, 0.17, 0.018], 'iron');
  }
  if (load === 'leaves') {
    S.ell([0.08, 0.57, 0], [0.33, 0.12, 0.25], (n) => ['leafR', 'leafO', 'leafY', 'leafB', 'leafO'][Math.floor(hash(Math.floor(n[0] * 7), Math.floor(n[1] * 5), Math.floor(n[2] * 7)) * 5)]);
  } else {
    S.ell([0.12, 0.62, -0.1], [0.14, 0.11, 0.14], (n) => (Math.floor((Math.atan2(n[2], n[0]) + 4) * 2.5) % 2 ? 'orange' : 'leafO'));
    S.ell([0.0, 0.6, 0.12], [0.12, 0.1, 0.12], (n) => (Math.floor((Math.atan2(n[2], n[0]) + 4) * 2.5) % 2 ? 'orange' : 'leafO'));
    S.ell([0.24, 0.58, 0.1], [0.09, 0.08, 0.09], 'leafY');
  }
  return S;
}
function gnomeSculpt() {
  const S = sculpt();
  for (const sd of [-1, 1]) S.ell([0.04, 0.035, sd * 0.05], [0.07, 0.035, 0.045], 'dark');
  S.ell([0, 0.15, 0], [0.11, 0.13, 0.12], 'denim');
  S.ell([0, 0.1, 0], [0.115, 0.03, 0.125], 'leather');
  S.ell([0.11, 0.1, 0], [0.012, 0.02, 0.02], 'yellow', { line: false });
  for (const sd of [-1, 1]) S.ell([0.04, 0.18, sd * 0.1], [0.04, 0.07, 0.035], 'denim', { rot: [0, 0, sd * 0.4] });
  S.ell([0.03, 0.29, 0], [0.085, 0.08, 0.09], 'skin');
  S.ell([0.07, 0.22, 0], [0.06, 0.1, 0.085], 'beard');
  S.ell([0.105, 0.28, 0], [0.025, 0.022, 0.024], 'pink');
  S.ell([0.02, 0.35, 0], [0.095, 0.025, 0.1], 'red');
  S.tube([[0.0, 0.36, 0], [-0.03, 0.47, 0], [-0.08, 0.55, 0]], [0.09, 0.05, 0.012], 'red');
  for (const sd of [-1, 1]) S.decal([0.1, 0.305, sd * 0.032], eye(1), { tol: 0.03 });
  // holding a little lantern
  S.ell([0.1, 0.13, 0.11], [0.03, 0.04, 0.03], 'glow');
  S.box([0.1, 0.18, 0.11], [0.025, 0.008, 0.025], 'iron');
  return S;
}
function birdbathSculpt() {
  const S = sculpt();
  cyl(S, [[0, 0, 0], [0, 0.08, 0]], [0.15, 0.15], 'stoneD', 'stone');
  S.tube([[0, 0.08, 0], [0, 0.3, 0], [0, 0.56, 0]], [0.07, 0.055, 0.08], (n) => (n[0] < -0.3 ? 'stoneD' : 'stone'));
  S.ell([0, 0.63, 0], [0.31, 0.075, 0.31], (n) => (n[1] > 0.3 ? 'stoneD' : 'stone'));
  S.ell([0, 0.685, 0], [0.26, 0.012, 0.26], 'water', { line: false });
  // a chickadee on the rim
  S.ell([0.06, 0.73, 0.24], [0.05, 0.04, 0.035], (n) => (n[1] < 0 ? 'cream' : 'grey'));
  S.ell([0.11, 0.765, 0.24], [0.028, 0.028, 0.026], (n) => (n[1] > -0.1 || n[0] < 0 ? 'dark' : 'white'));
  S.tube([[0.02, 0.74, 0.24], [-0.04, 0.76, 0.24]], [0.016, 0.006], 'grey');
  S.decal([0.13, 0.77, 0.245], (put, x, y) => put(x, y, 0xffffff), { tol: 0.04 });
  return S;
}
const leafMix = (n) => ['leafR', 'leafO', 'leafY', 'leafB', 'leafO', 'leafR'][Math.floor(hash(Math.floor(n[0] * 8), Math.floor(n[1] * 6), Math.floor(n[2] * 8)) * 6)];
function leafPileSculpt(seed = 0) {
  const S = sculpt();
  S.ell([0, 0.12, 0], [0.62, 0.26, 0.55], leafMix, { rot: [seed * 0.7, 0, 0] });
  const R = rnd(seed + 31);
  for (let k = 0; k < 7; k++) {
    const a = R() * TAU, d = 0.25 + R() * 0.35;
    S.ell([Math.cos(a) * d, 0.2 + R() * 0.1 - d * 0.25, Math.sin(a) * d], [0.14, 0.08, 0.12], leafMix, { line: false });
  }
  return S;
}
function rakeSculpt() {
  const S = sculpt();
  S.tube([[0.12, 0.08, 0], [-0.1, 1.45, 0]], [0.018, 0.016], 'woodL');
  S.box([0.14, 0.06, 0], [0.025, 0.02, 0.24], 'iron', { rot: [0, -0.16, 0] });
  for (let k = -5; k <= 5; k++) S.tube([[0.14, 0.06, k * 0.045], [0.2, -0.0, k * 0.05]], [0.006, 0.005], 'steel', { line: false });
  return S;
}
function matSculpt() {
  const S = sculpt();
  S.box([0, 0.012, 0], [0.32, 0.012, 0.52], (n) => (Math.abs(n[0]) > 0.8 || Math.abs(n[2]) > 0.88 ? 'strawD' : Math.floor((n[2] + 1) * 14) % 2 ? 'straw' : 'sack'));
  S.decal([0, 0.026, 0], MAPLE, { tol: 0.05 });
  return S;
}

// ---------------------------------------------------------------- café terraces & Main Street
function bistroTableSculpt({ umbrella = null } = {}) {
  const S = sculpt();
  cyl(S, [[0, 0.7, 0], [0, 0.74, 0]], [0.32, 0.32], 'marble', 'marble');
  S.tube([[0, 0.02, 0], [0, 0.7, 0]], [0.03, 0.025], 'bistro');
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; S.tube([[0, 0.12, 0], [Math.cos(a) * 0.22, 0.01, Math.sin(a) * 0.22]], [0.018, 0.016], 'bistro'); }
  cyl(S, [[0.08, 0.74, -0.1], [0.08, 0.82, -0.1]], [0.035, 0.035], 'white', 'cocoa');
  S.ell([0.08, 0.745, -0.1], [0.07, 0.008, 0.07], 'white', { line: false });
  cyl(S, [[-0.1, 0.74, 0.12], [-0.1, 0.88, 0.12]], [0.03, 0.022], 'glass', null);
  S.ell([-0.1, 0.92, 0.12], [0.045, 0.04, 0.045], 'orange');
  S.ell([-0.08, 0.94, 0.1], [0.03, 0.03, 0.03], 'burgundy');
  if (umbrella) {
    S.tube([[0, 0.74, 0], [0, 2.3, 0]], [0.022, 0.02], 'woodL');
    S.ell([0, 2.18, 0], [1.05, 0.3, 1.05], (n) => (n[1] < 0.05 ? null : Math.floor((Math.atan2(n[2], n[0]) + TAU) * 8 / TAU) % 2 ? umbrella[0] : umbrella[1]));
    for (let k = 0; k < 16; k++) { const a = ((k + 0.5) / 16) * TAU; S.ell([Math.cos(a) * 1.0, 2.15, Math.sin(a) * 1.0], [0.11, 0.06, 0.11], k % 2 ? umbrella[0] : umbrella[1], { line: false }); }
    S.ell([0, 2.5, 0], [0.04, 0.05, 0.04], 'woodD');
  }
  return S;
}
function bistroChairSculpt() {
  const S = sculpt();
  for (const [x, z] of [[0.17, 0.17], [0.17, -0.17], [-0.17, 0.17], [-0.17, -0.17]]) S.tube([[x * 0.9, 0.45, z * 0.9], [x * 1.15, 0.0, z * 1.15]], [0.016, 0.014], 'bistro');
  cyl(S, [[0, 0.44, 0], [0, 0.47, 0]], [0.21, 0.21], 'bistro', 'bistro');
  S.tube([[-0.17, 0.46, -0.17], [-0.24, 0.8, -0.17]], [0.016, 0.016], 'bistro');
  S.tube([[-0.17, 0.46, 0.17], [-0.24, 0.8, 0.17]], [0.016, 0.016], 'bistro');
  S.tube([[-0.24, 0.8, -0.17], [-0.25, 0.86, 0], [-0.24, 0.8, 0.17]], [0.02, 0.02, 0.02], 'bistro');
  for (let k = -1; k <= 1; k++) S.tube([[-0.2, 0.5, k * 0.08], [-0.235, 0.8, k * 0.085]], [0.01, 0.01], 'bistro', { line: false });
  S.tube([[-0.21, 0.62, -0.17], [-0.22, 0.64, 0], [-0.21, 0.62, 0.17]], [0.012, 0.012, 0.012], 'bistro');
  return S;
}
function easelSculpt(text = 'MENU') {
  const S = sculpt();
  S.tube([[0.12, 0.0, -0.26], [-0.02, 1.35, -0.12]], [0.02, 0.018], 'woodD');
  S.tube([[0.12, 0.0, 0.26], [-0.02, 1.35, 0.12]], [0.02, 0.018], 'woodD');
  S.tube([[-0.34, 0.0, 0], [-0.03, 1.3, 0]], [0.018, 0.016], 'woodD');
  S.box([0.08, 0.5, 0], [0.015, 0.02, 0.3], 'wood');
  S.box([0.055, 0.86, 0], [0.018, 0.33, 0.26], (n, p, face) => (face === 1 && Math.abs(n[1]) < 0.9 && Math.abs(n[2]) < 0.88 ? 'chalk' : 'wood'), { rot: [0, 0.1, 0] });
  S.decal([0.08, 1.08, 0], facing('x', textPainter(text, 0xf2efe2)), { tol: 0.06 });
  S.decal([0.08, 0.98, 0], facing('x', paintRows(['.y.....', 'yyy.www', '.y.....', '.......', '.p..ww.', 'ppp.www', '.p.....', '.......', '..c.ww.', '.ccc.ww'], { y: 0xf4d058, w: 0xf2efe2, p: 0xf0a0b8, c: 0xc8a070 })), { tol: 0.06 });
  return S;
}
const NEWS = [['red', 'redD'], ['blue', 'denim'], ['yellow', 'strawD']];
function newsboxSculpt(v) {
  const S = sculpt();
  const [c, d] = NEWS[v % NEWS.length];
  for (const sd of [-1, 1]) S.box([0, 0.15, sd * 0.17], [0.16, 0.15, 0.014], 'iron');
  S.box([0, 0.62, 0], [0.19, 0.32, 0.22], (n, p, face) => {
    if (face === 1 && n[1] > -0.05 && n[1] < 0.62 && Math.abs(n[2]) < 0.72) return n[1] > 0.5 || n[1] < 0.05 || Math.abs(n[2]) > 0.62 ? 'steel' : 'newsprint';
    return Math.abs(n[1]) > 0.9 ? d : c;
  });
  S.box([0.0, 0.95, 0], [0.2, 0.015, 0.23], d);
  S.box([0.2, 0.52, 0.14], [0.012, 0.04, 0.02], 'steel');
  S.decal([0.2, 0.8, 0], facing('x', (put, x, y) => { for (let i = -3; i <= 3; i++) put(x + i, y - 1, 0x2a2428); for (let i = -3; i <= 1; i++) put(x + i, y + 1, 0x5a5650); }), { tol: 0.05 });
  return S;
}
function barrelPlanterSculpt(v = 0) {
  const S = sculpt();
  cyl(S, [[0, 0.0, 0], [0, 0.22, 0], [0, 0.42, 0]], [0.3, 0.33, 0.32], (n, p, u) => {
    if (Math.abs(u - 0.18) < 0.05 || Math.abs(u - 0.82) < 0.05) return 'iron';
    return Math.floor((Math.atan2(n[2], n[0]) + TAU) * 3.4) % 2 ? 'wood' : 'woodD';
  }, 'bark');
  const [c, d] = MUM[v % MUM.length];
  S.ell([0, 0.5, 0], [0.31, 0.16, 0.31], (n) => (n[1] < -0.4 ? 'leaf' : hash(Math.floor(n[0] * 9), Math.floor(n[1] * 9), Math.floor(n[2] * 9)) > 0.72 ? d : c));
  // an ornamental cabbage and a sprig of grass
  S.ell([0.14, 0.62, 0.1], [0.1, 0.07, 0.1], (n) => (Math.hypot(n[0], n[2]) < 0.5 ? 'pink' : 'green'));
  for (let k = 0; k < 5; k++) S.tube([[-0.1, 0.55, -0.08], [-0.15 + k * 0.03, 0.95 + (k % 2) * 0.08, -0.12 - k * 0.02]], [0.012, 0.004], 'strawD', { line: false });
  return S;
}
function phoneBoothSculpt() {
  const S = sculpt();
  const hw = 0.42, hh = 1.12;
  S.box([0, 0.03, 0], [hw + 0.03, 0.03, hw + 0.03], 'greyD');
  // glass walls in an aluminium frame, a red roof with the TELEPHONE sign
  const wall = (n, p, face) => {
    const ax = face >> 1;
    if (ax === 1) return 'steel';
    const u = ax === 0 ? n[2] : n[0];
    if (Math.abs(u) > 0.9 || n[1] > 0.93 || n[1] < -0.9 || Math.abs(n[1] + 0.35) < 0.04) return 'steel';
    return n[1] < -0.35 ? 'canD' : Math.abs(u - n[1] * 0.6 - 0.2) < 0.08 ? 'ice' : 'pane';
  };
  S.box([0, 0.06 + hh, 0], [hw, hh, hw], wall);
  S.box([0, 2.38, 0], [hw + 0.04, 0.09, hw + 0.04], (n) => (Math.abs(n[1]) > 0.8 ? 'redD' : 'red'));
  S.box([0, 2.5, 0], [hw - 0.04, 0.03, hw - 0.04], 'redD');
  S.decal([hw + 0.05, 2.38, 0], facing('x', textPainter('PHONE', 0xffffff)), { tol: 0.08 });
  S.decal([0, 2.38, hw + 0.05], facing('z', textPainter('PHONE', 0xffffff)), { tol: 0.08 });
  // the phone inside (seen through the glass)
  S.box([-0.3, 1.3, 0], [0.08, 0.16, 0.12], 'iron');
  S.box([-0.21, 1.36, 0.06], [0.03, 0.08, 0.03], 'dark');
  S.box([-0.3, 1.05, 0], [0.1, 0.02, 0.2], 'steel');
  return S;
}
function streetSignSculpt(a = 'MAIN ST', b = 'RUE') {
  const S = sculpt();
  S.tube([[0, 0, 0], [0, 2.55, 0]], [0.035, 0.03], 'iron');
  S.ell([0, 2.56, 0], [0.04, 0.03, 0.04], 'iron');
  // blade A faces front/back (readable), blade B along the other street (lettered dashes)
  S.box([0, 2.38, 0], [0.014, 0.085, 0.46], (n) => (Math.abs(n[1]) > 0.8 || Math.abs(n[2]) > 0.96 ? 'white' : 'green'));
  S.box([0, 2.2, 0], [0.42, 0.075, 0.014], (n) => (Math.abs(n[1]) > 0.8 || Math.abs(n[0]) > 0.96 ? 'white' : 'green'));
  S.decal([0.02, 2.38, 0], facing('x', textPainter(a, 0xffffff), 0.8), { tol: 0.04 });
  S.decal([-0.02, 2.38, 0], facing('x', textPainter(a, 0xffffff), 0.8), { tol: 0.04 });
  S.decal([0, 2.2, 0.02], facing('z', (put, x, y) => { for (let i = -7; i <= 7; i++) if (i % 4) { put(x + i, y - 1, 0xffffff); if (i > -6 && i < 6) put(x + i, y + 1, 0xd8e8d8); } }, 0.8), { tol: 0.04 });
  void b;
  return S;
}
function benchSculpt(col = 'green') {
  const S = sculpt();
  const L = 0.78, dk = col === 'green' ? 'bistro' : 'woodD';
  for (const sd of [-1, 0.0, 1]) {
    if (sd === 0) continue;
    const z = sd * (L - 0.06);
    S.box([0.12, 0.22, z], [0.03, 0.22, 0.025], 'iron');
    S.box([-0.14, 0.22, z], [0.03, 0.22, 0.025], 'iron');
    S.box([-0.17, 0.62, z], [0.025, 0.2, 0.025], 'iron', { rot: [0, 0.2, 0] });
    S.box([0.0, 0.62, z], [0.17, 0.02, 0.03], 'iron');
  }
  for (let k = 0; k < 4; k++) S.box([0.13 - k * 0.085, 0.45, 0], [0.036, 0.02, L], col === 'green' ? 'green' : 'wood');
  for (let k = 0; k < 3; k++) S.box([-0.2 - k * 0.025, 0.58 + k * 0.11, 0], [0.012, 0.04, L], col === 'green' ? 'green' : 'wood', { rot: [0, 0.2, 0] });
  void dk;
  return S;
}

// ---------------------------------------------------------------- harbour & beach
function deckChairSculpt(v = 0) {
  const S = sculpt();
  const [a, b] = [['canvasR', 'white'], ['canvasB', 'white'], ['yellow', 'white']][v % 3];
  for (const sd of [-1, 1]) {
    const z = sd * 0.27;
    S.tube([[0.42, 0.0, z], [-0.3, 0.86, z]], [0.02, 0.02], 'woodL');
    S.tube([[-0.22, 0.0, z], [0.2, 0.5, z]], [0.02, 0.02], 'woodL');
    S.tube([[0.44, 0.3, z], [0.12, 0.36, z]], [0.016, 0.016], 'wood');
  }
  S.tube([[-0.3, 0.86, -0.27], [-0.3, 0.86, 0.27]], [0.02, 0.02], 'wood');
  S.tube([[0.33, 0.12, -0.27], [0.33, 0.12, 0.27]], [0.02, 0.02], 'wood');
  // the striped canvas sling
  S.box([0.0, 0.48, 0], [0.012, 0.42, 0.25], (n) => (Math.floor((n[2] + 1) * 3.5) % 2 ? a : b), { rot: [0, 0.82, 0] });
  return S;
}
function coolerSculpt(v = 0) {
  const S = sculpt();
  const c = ['red', 'blue'][v % 2];
  S.box([0, 0.19, 0], [0.2, 0.17, 0.33], (n) => (n[1] > 0.55 ? 'white' : c));
  S.box([0, 0.38, 0], [0.21, 0.035, 0.34], 'white');
  for (const sd of [-1, 1]) S.box([0, 0.3, sd * 0.345], [0.04, 0.025, 0.012], 'dark');
  S.decal([0.205, 0.2, 0], facing('x', (put, x, y) => { for (let i = -3; i <= 3; i++) put(x + i, y, 0xffffff); }), { tol: 0.05 });
  return S;
}
function rodsSculpt() {
  const S = sculpt();
  cyl(S, [[0, 0, 0], [0, 0.32, 0]], [0.15, 0.16], (n) => (n[0] < -0.3 ? 'canD' : 'can'), 'dark');
  const rods = [[0.3, -0.12, 'woodL'], [0.18, 0.12, 'dark'], [-0.06, 0.0, 'canvasB']];
  for (const [dx, dz, c] of rods) {
    S.tube([[0, 0.25, dz * 0.3], [dx * 0.6, 1.2, dz], [dx, 2.1, dz * 1.4]], [0.018, 0.014, 0.011], c);
    S.tube([[0, 0.25, dz * 0.3], [dx * 0.12, 0.5, dz * 0.4]], [0.022, 0.02], 'dark');
    S.ell([dx * 0.1, 0.45, dz * 0.4 + 0.03], [0.03, 0.03, 0.012], 'steel');
    S.tube([[dx, 2.1, dz * 1.4], [dx + 0.05, 1.5, dz * 1.4]], [0.007, 0.007], 'white', { line: false });
  }
  S.ell([0.35, 1.5, -0.17], [0.03, 0.04, 0.02], (n) => (n[1] > 0 ? 'red' : 'white'));
  return S;
}
function netPileSculpt() {
  const S = sculpt();
  S.ell([0, 0.1, 0], [0.62, 0.2, 0.48], (n) => ((Math.floor(n[0] * 14) + Math.floor(n[2] * 14)) % 2 ? 'net' : 'green'));
  S.ell([0.25, 0.22, 0.1], [0.3, 0.12, 0.26], (n) => ((Math.floor(n[0] * 12) + Math.floor(n[2] * 12)) % 2 ? 'green' : 'net'));
  for (const [x, z] of [[0.45, -0.2], [-0.3, 0.3], [0.1, 0.38], [-0.45, -0.15]]) S.ell([x, 0.17, z], [0.07, 0.05, 0.05], 'orange');
  S.tube([[-0.5, 0.05, -0.35], [-0.2, 0.2, -0.1], [0.3, 0.32, 0.0]], [0.02, 0.02, 0.02], 'rope');
  return S;
}
function lifeRingSculpt() {
  const S = sculpt();
  S.box([-0.02, 0.75, 0], [0.04, 0.75, 0.04], 'woodD');
  S.box([-0.02, 1.52, 0], [0.06, 0.03, 0.06], 'woodD');
  const ring = (n) => { const a = Math.atan2(n[1], n[2]); return Math.floor((a + TAU) * 4 / TAU * 2) % 2 ? 'red' : 'white'; };
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU, a2 = ((k + 1) / 16) * TAU;
    S.tube([[0.06, 1.12 + Math.sin(a) * 0.26, Math.cos(a) * 0.26], [0.06, 1.12 + Math.sin(a2) * 0.26, Math.cos(a2) * 0.26]], [0.065, 0.065], Math.floor(k / 2) % 2 ? 'red' : 'white', { group: 1 });
  }
  void ring;
  S.tube([[0.06, 1.38, 0], [0.0, 1.5, 0]], [0.01, 0.01], 'rope', { line: false });
  return S;
}
function kayakSculpt(v = 0) {
  const S = sculpt();
  const c = ['kayakO', 'kayakT'][v % 2];
  S.tube([[1.4, 0.16, 0], [0.9, 0.17, 0], [0, 0.17, 0], [-0.9, 0.17, 0], [-1.4, 0.16, 0]], [0.02, 0.2, 0.27, 0.2, 0.02], (n) => (n[1] < -0.2 ? 'white' : c));
  S.ell([0.0, 0.32, 0], [0.32, 0.06, 0.19], 'dark');
  S.ell([0.0, 0.33, 0], [0.34, 0.03, 0.21], c);
  S.ell([-0.05, 0.31, 0], [0.26, 0.02, 0.15], 'dark', { line: false });
  // a paddle laid across
  S.tube([[0.25, 0.42, -0.7], [0.1, 0.4, 0.7]], [0.014, 0.014], 'steel');
  for (const [x, z] of [[0.27, -0.82], [0.08, 0.82]]) S.ell([x, 0.42, z], [0.06, 0.012, 0.13], 'yellow');
  return S;
}
function basketSculpt() {
  const S = sculpt();
  S.box([0, 0.15, 0], [0.18, 0.15, 0.27], (n) => (Math.floor((n[1] + 1) * 4) % 2 ? 'wicker' : 'strawD'));
  S.box([0, 0.315, 0], [0.19, 0.02, 0.28], (n) => ((Math.floor((n[0] + 1) * 3) + Math.floor((n[2] + 1) * 4)) % 2 ? 'gingham' : 'white'));
  S.tube([[0, 0.32, -0.2], [0, 0.48, -0.1], [0, 0.5, 0.1], [0, 0.32, 0.2]], [0.016, 0.016, 0.016, 0.016], 'wicker');
  S.tube([[0.06, 0.3, 0.12], [0.14, 0.42, 0.18]], [0.03, 0.02], 'glass');
  return S;
}
function pailSculpt() {
  const S = sculpt();
  cyl(S, [[0, 0, 0], [0, 0.2, 0]], [0.1, 0.13], 'kayakO', 'sand');
  S.tube([[0, 0.2, -0.12], [0, 0.3, 0], [0, 0.2, 0.12]], [0.008, 0.008, 0.008], 'yellow', { line: false });
  S.tube([[0.18, 0.0, 0.14], [0.05, 0.3, 0.08]], [0.012, 0.012], 'kayakT');
  S.ell([0.2, 0.02, 0.15], [0.05, 0.015, 0.06], 'kayakT');
  S.ell([0.2, 0.03, -0.18], [0.12, 0.05, 0.1], 'sand');
  return S;
}
function beachBallSculpt() {
  const S = sculpt();
  S.ell([0, 0.2, 0], [0.2, 0.2, 0.2], (n) => (n[1] > 0.85 ? 'white' : ['red', 'white', 'blue', 'yellow', 'white', 'teal'][Math.floor(((Math.atan2(n[2], n[0]) + TAU) / TAU) * 6) % 6]));
  return S;
}
function towelSculpt(v = 0) {
  const S = sculpt();
  const [a, b] = [['canvasR', 'cream'], ['teal', 'yellow']][v % 2];
  S.box([0, 0.008, 0], [0.42, 0.008, 0.85], (n) => (Math.abs(n[2]) > 0.94 ? 'white' : Math.floor((n[2] + 1) * 6) % 2 ? a : b));
  return S;
}

// ---------------------------------------------------------------- the park
function picnicSculpt() {
  const S = sculpt();
  const L = 0.95;
  S.box([0, 0.74, 0], [0.38, 0.025, L], slatsZ(1, 'wood', 'wood'), {});
  for (let k = -2; k <= 2; k++) S.box([k * 0.15, 0.765, 0], [0.065, 0.004, L - 0.01], 'woodL', { line: false });
  for (const sd of [-1, 1]) {
    S.box([sd * 0.62, 0.44, 0], [0.12, 0.022, L], 'wood');
    for (const lz of [-1, 1]) {
      const z = lz * (L - 0.18);
      S.tube([[sd * 0.1, 0.74, z], [sd * 0.6, 0.0, z]], [0.03, 0.03], 'woodD');
      S.box([sd * 0.0, 0.42, z], [0.72, 0.022, 0.03], 'woodD');
    }
  }
  // a gingham cloth and a pie
  S.box([0, 0.77, 0.25], [0.3, 0.006, 0.36], (n) => ((Math.floor((n[0] + 1) * 4) + Math.floor((n[2] + 1) * 5)) % 2 ? 'gingham' : 'white'), { line: false });
  S.ell([0.0, 0.8, 0.3], [0.13, 0.03, 0.13], (n) => (Math.hypot(n[0], n[2]) > 0.8 ? 'crust' : (Math.floor((n[0] + 1) * 4) + Math.floor((n[2] + 1) * 4)) % 2 ? 'crust' : 'burgundy'));
  return S;
}
function musicStandSculpt() {
  const S = sculpt();
  for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU + 0.5; S.tube([[0, 0.2, 0], [Math.cos(a) * 0.25, 0.0, Math.sin(a) * 0.25]], [0.012, 0.012], 'iron'); }
  S.tube([[0, 0.0, 0], [0, 1.05, 0]], [0.016, 0.014], 'iron');
  S.box([0.02, 1.15, 0], [0.012, 0.16, 0.24], (n, p, face) => (face === 1 ? 'paper' : 'iron'), { rot: [0, 0.45, 0] });
  S.box([0.09, 1.01, 0], [0.04, 0.012, 0.25], 'iron');
  S.decal([0.06, 1.17, 0], facing('x', (put, x, y) => { for (let j = -2; j <= 3; j += 2) for (let i = -4; i <= 4; i++) put(x + i, y + j, 0x5a5650); put(x - 2, y - 3, 0x1e1418); put(x + 2, y + 1, 0x1e1418); put(x - 3, y + 3, 0x1e1418); }), { tol: 0.06 });
  return S;
}
function flowerBedSculpt(seed = 0) {
  const S = sculpt();
  const R = rnd(seed + 5);
  S.ell([0, 0.04, 0], [0.95, 0.06, 0.8], 'bark', {});
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * TAU;
    S.ell([Math.cos(a) * 0.95, 0.06, Math.sin(a) * 0.8], [0.13, 0.08, 0.11], k % 3 ? 'stone' : 'stoneD');
  }
  const cols = ['orange', 'burgundy', 'yellow', 'white', 'orange'];
  for (let k = 0; k < 11; k++) {
    const a = R() * TAU, d = Math.sqrt(R()) * 0.62;
    const x = Math.cos(a) * d, z = Math.sin(a) * d * 0.85;
    const c = cols[(k + seed) % cols.length];
    S.ell([x, 0.16, z], [0.17, 0.13, 0.17], (n) => (n[1] < -0.35 ? 'leaf' : hash(Math.floor(n[0] * 7), Math.floor(n[1] * 7), k) > 0.75 ? 'leaf' : c));
  }
  return S;
}
function librarySculpt() {
  const S = sculpt();
  S.box([0, 0.55, 0], [0.05, 0.55, 0.05], 'woodD');
  S.box([0, 1.12, 0], [0.24, 0.025, 0.3], 'wood');
  // the cabinet: a glass door on the front showing the books
  S.box([0, 1.36, 0], [0.22, 0.23, 0.28], (n, p, face) => (face === 1 && Math.abs(n[1]) < 0.82 && Math.abs(n[2]) < 0.84 ? null : Math.abs(n[1]) > 0.85 ? 'paintD' : 'red'));
  S.box([0.0, 1.36, 0], [0.1, 0.2, 0.24], 'dark', { line: false });
  const bk = ['book1', 'book2', 'book3', 'yellow', 'book2', 'cream', 'book1', 'book3'];
  for (let k = 0; k < 8; k++) S.box([0.16, 1.24 + (k > 3 ? 0.2 : 0) + (k % 2) * 0.01, -0.18 + (k % 4) * 0.12], [0.03, 0.075 + (k % 3) * 0.01, 0.045], bk[k]);
  S.box([0.16, 1.37, 0], [0.04, 0.01, 0.24], 'woodL');
  S.box([0.215, 1.36, 0], [0.008, 0.21, 0.255], (n) => (Math.abs(n[1]) > 0.9 || Math.abs(n[2]) > 0.92 ? 'paint' : null));
  // a gable roof
  for (const sd of [-1, 1]) S.box([0, 1.72, sd * 0.15], [0.27, 0.02, 0.2], (n) => (n[1] > 0.5 ? 'greyD' : 'grey'), { rot: [0, 0, sd * 0.62] });
  S.ell([0.22, 1.7, 0], [0.012, 0.09, 0.16], 'red');
  S.box([0, 1.6, 0], [0.22, 0.03, 0.27], 'red');
  S.decal([0.23, 1.62, 0], facing('x', textPainter('BOOKS', 0xf2efe2)), { tol: 0.1 });
  return S;
}

// ---------------------------------------------------------------- shop window displays (drawn as flat cards in the glass)
function shelf(S, w, y = 0.0, d = 0.12) {
  S.box([0, y + 0.02, 0], [d, 0.02, w], (n) => (n[1] > 0.5 ? 'woodL' : 'wood'));
}
function dispDonutsSculpt() {
  const S = sculpt();
  shelf(S, 0.42);
  const tops = ['pink', 'choc', 'syrup', 'white', 'pink', 'choc'];
  for (let tier = 0; tier < 2; tier++) {
    const y = 0.04 + tier * 0.22;
    if (tier) { S.box([0, y - 0.02, 0], [0.1, 0.012, 0.36], 'steel'); S.tube([[0, 0.04, 0], [0, y - 0.03, 0]], [0.012, 0.012], 'steel'); }
    for (let k = 0; k < (tier ? 4 : 5); k++) {
      const z = (k - (tier ? 1.5 : 2)) * 0.17, x = 0;
      S.ell([x, y + 0.04, z], [0.07, 0.035, 0.075], 'dough');
      S.ell([x + 0.004, y + 0.06, z], [0.062, 0.024, 0.066], tops[(k + tier * 3) % tops.length]);
      S.decal([x + 0.07, y + 0.065, z], (put, px, py) => { put(px, py, 0x7a4a2a); }, { tol: 0.06 });
      if ((k + tier) % 2) S.decal([x + 0.06, y + 0.07, z - 0.02], (put, px, py) => { put(px, py, 0xffe866); put(px + 2, py + 1, 0x7ad0e8); put(px - 2, py, 0xffffff); }, { tol: 0.06 });
    }
  }
  return S;
}
function dispCakeSculpt() {
  const S = sculpt();
  shelf(S, 0.38);
  cyl(S, [[0, 0.04, 0], [0, 0.14, 0]], [0.03, 0.03], 'white', null);
  cyl(S, [[0, 0.14, 0], [0, 0.16, 0]], [0.2, 0.2], 'white', 'white');
  cyl(S, [[0, 0.16, 0], [0, 0.32, 0]], [0.16, 0.16], (n, p, u) => (Math.abs(u - 0.5) < 0.1 ? 'cream' : 'choc'), 'cream');
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; S.ell([Math.cos(a) * 0.12, 0.34, Math.sin(a) * 0.12], [0.025, 0.022, 0.025], k % 2 ? 'red' : 'white'); }
  S.ell([0, 0.36, 0], [0.04, 0.035, 0.04], 'red');
  for (const z of [-0.3, 0.3]) {
    cyl(S, [[0, 0.04, z], [0, 0.1, z]], [0.04, 0.05], 'pink', null);
    S.ell([0, 0.12, z], [0.055, 0.04, 0.055], 'white');
    S.ell([0, 0.16, z], [0.015, 0.015, 0.015], 'red');
  }
  return S;
}
function dispMugsSculpt() {
  const S = sculpt();
  shelf(S, 0.42);
  shelf(S, 0.42, 0.26);
  const cols = ['red', 'cream', 'teal', 'yellow', 'white', 'burgundy'];
  for (let k = 0; k < 4; k++) {
    const z = (k - 1.5) * 0.2;
    cyl(S, [[0, 0.04, z], [0, 0.15, z]], [0.045, 0.048], cols[k], 'cocoa');
    S.tube([[0, 0.13, z + 0.05], [0.0, 0.1, z + 0.08], [0, 0.07, z + 0.05]], [0.012, 0.012, 0.012], cols[k]);
  }
  // a coffee pot and a bag of beans up top
  cyl(S, [[0, 0.3, -0.18], [0, 0.48, -0.18]], [0.07, 0.06], 'steel', 'iron');
  S.tube([[0, 0.44, -0.13], [0, 0.48, -0.08]], [0.015, 0.01], 'steel');
  S.box([0, 0.39, 0.12], [0.06, 0.1, 0.09], 'sack');
  S.decal([0.065, 0.39, 0.12], MAPLE, { tol: 0.06 });
  cyl(S, [[0, 0.3, 0.32], [0, 0.4, 0.32]], [0.045, 0.048], 'red', null);
  return S;
}
function dispBreadSculpt() {
  const S = sculpt();
  shelf(S, 0.44);
  S.box([0, 0.12, -0.24], [0.08, 0.08, 0.13], (n) => (Math.floor((n[1] + 1) * 4) % 2 ? 'wicker' : 'strawD'));
  for (let k = 0; k < 4; k++) S.tube([[0.0, 0.14, -0.3 + k * 0.04], [0.0, 0.44 + (k % 2) * 0.05, -0.32 + k * 0.06]], [0.028, 0.026], 'crust');
  for (const [z, s] of [[0.0, 1], [0.15, 0.85]]) {
    S.ell([0, 0.04 + 0.07 * s, z], [0.08 * s, 0.07 * s, 0.08 * s], 'crust');
    S.decal([0.07 * s, 0.04 + 0.1 * s, z], (put, x, y) => { put(x - 1, y, 0xf0d08a); put(x, y - 1, 0xf0d08a); put(x + 1, y - 2, 0xf0d08a); }, { tol: 0.06 });
  }
  for (const z of [0.3, 0.38]) S.tube([[0, 0.05, z - 0.06], [0.02, 0.09, z], [0, 0.05, z + 0.06]], [0.02, 0.04, 0.02], 'dough');
  return S;
}
function dispPieSculpt() {
  const S = sculpt();
  shelf(S, 0.4);
  for (const [z, f] of [[-0.2, 'burgundy'], [0.2, 'syrup']]) {
    cyl(S, [[0, 0.04, z], [0, 0.1, z]], [0.15, 0.17], 'crust', f);
    for (let k = 0; k < 4; k++) S.box([0, 0.105, z + (k - 1.5) * 0.07], [0.15, 0.006, 0.01], 'crust', { line: false });
  }
  S.tube([[0, 0.04, 0], [0, 0.3, 0]], [0.012, 0.012], 'steel');
  cyl(S, [[0, 0.3, 0], [0, 0.32, 0]], [0.12, 0.12], 'white', 'white');
  for (const z of [-0.05, 0.05]) S.ell([0, 0.36, z], [0.045, 0.04, 0.045], 'sponge');
  return S;
}
function dispToolsSculpt() {
  const S = sculpt();
  S.box([-0.03, 0.45, 0], [0.01, 0.42, 0.42], 'pegboard');
  // a saw, a hammer, a wrench, a level hung on the pegboard
  S.box([0.0, 0.66, -0.18], [0.008, 0.08, 0.16], 'steel', { rot: [0, 0, 0.1] });
  S.box([0.0, 0.66, -0.36], [0.012, 0.05, 0.03], 'red');
  S.tube([[0, 0.78, 0.04], [0, 0.48, 0.04]], [0.016, 0.016], 'woodL');
  S.box([0, 0.79, 0.04], [0.014, 0.022, 0.07], 'iron');
  S.tube([[0, 0.78, 0.22], [0, 0.52, 0.24]], [0.014, 0.012], 'steel');
  S.ell([0, 0.79, 0.22], [0.012, 0.035, 0.035], 'steel');
  S.box([0, 0.36, 0.0], [0.01, 0.025, 0.3], 'yellow');
  S.decal([0.012, 0.36, 0], (put, x, y) => put(x, y, 0x76c870), { tol: 0.06 });
  // paint cans stacked on the floor and a red toolbox
  for (const [z, y, c] of [[-0.28, 0, 'red'], [-0.12, 0, 'blue'], [-0.2, 0.17, 'yellow']]) cyl(S, [[0.04, y, z], [0.04, y + 0.16, z]], [0.07, 0.07], c, 'steel');
  S.box([0.05, 0.08, 0.22], [0.08, 0.08, 0.15], (n) => (n[1] > 0.6 ? 'redD' : 'red'));
  S.tube([[0.05, 0.17, 0.14], [0.05, 0.22, 0.22], [0.05, 0.17, 0.3]], [0.01, 0.01, 0.01], 'iron');
  return S;
}
function dispTinsSculpt() {
  const S = sculpt();
  shelf(S, 0.44);
  const lab = ['red', 'yellow', 'green', 'blue', 'red', 'orange'];
  let k = 0;
  for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) {
    const z = -0.12 + (i - (3 - row) / 2) * 0.1, y = 0.04 + row * 0.11;
    const lc = lab[k % lab.length];
    cyl(S, [[0, y, z], [0, y + 0.1, z]], [0.045, 0.045], (n, p, u) => (u < 0.15 || u > 0.85 ? 'steel' : lc), 'steel');
    k++;
  }
  // a cereal box and jars of maple syrup
  S.box([0, 0.2, 0.22], [0.035, 0.16, 0.08], (n) => (n[1] > 0.3 ? 'yellow' : 'red'));
  S.decal([0.04, 0.24, 0.22], MAPLE, { tol: 0.06 });
  for (const z of [0.35, 0.42]) { cyl(S, [[0, 0.04, z], [0, 0.17, z]], [0.035, 0.035], 'syrup', null); cyl(S, [[0, 0.17, z], [0, 0.2, z]], [0.025, 0.025], 'cream', 'cream'); }
  return S;
}
function dispApplesSculpt() {
  const S = sculpt();
  S.box([0, 0.1, 0], [0.12, 0.1, 0.3], (n) => (Math.floor((n[1] + 1) * 2.5) % 2 ? 'wood' : 'woodL'));
  const R = rnd(13);
  for (let i = 0; i < 9; i++) S.ell([(R() - 0.5) * 0.1 + 0.04, 0.22 + R() * 0.03, (R() - 0.5) * 0.5], [0.05, 0.048, 0.05], i % 3 === 1 ? 'appleG' : 'apple');
  // a sack of flour and a pumpkin
  S.ell([0, 0.16, 0.42], [0.08, 0.16, 0.1], 'sack');
  S.ell([0, 0.33, 0.42], [0.05, 0.04, 0.07], 'rope');
  S.ell([0.02, 0.09, -0.44], [0.1, 0.09, 0.11], (n) => (Math.floor((Math.atan2(n[2], n[0]) + 4) * 2.5) % 2 ? 'orange' : 'leafO'));
  S.tube([[0.02, 0.17, -0.44], [0.0, 0.22, -0.42]], [0.012, 0.01], 'leaf');
  return S;
}
function dispParcelsSculpt() {
  const S = sculpt();
  shelf(S, 0.4);
  for (const [y, z, w, h] of [[0.04, -0.15, 0.14, 0.09], [0.04, 0.12, 0.12, 0.12], [0.22, -0.12, 0.1, 0.07], [0.28, 0.12, 0.08, 0.06]]) {
    S.box([0, y + h, z], [0.08, h, w], 'cardboard');
    S.box([0.001, y + h, z], [0.082, h + 0.002, 0.01], 'rope', { line: false });
    S.box([0.001, y + h, z], [0.082, 0.01, w + 0.002], 'rope', { line: false });
  }
  S.box([0, 0.5, 0.32], [0.008, 0.08, 0.06], 'white');
  S.decal([0.01, 0.52, 0.32], (put, x, y) => { put(x, y, 0xc8302a); put(x + 1, y, 0xc8302a); put(x, y + 1, 0xc8302a); put(x + 1, y + 1, 0xc8302a); }, { tol: 0.05 });
  return S;
}
function dispTackleSculpt() {
  const S = sculpt();
  shelf(S, 0.44);
  // a tackle box, lures on a card, a coiled line and a little net
  S.box([0.02, 0.1, -0.2], [0.08, 0.07, 0.17], (n) => (n[1] > 0.4 ? 'greyD' : 'green'));
  S.tube([[0.02, 0.18, -0.26], [0.02, 0.22, -0.2], [0.02, 0.18, -0.14]], [0.01, 0.01, 0.01], 'iron');
  S.box([-0.02, 0.42, 0.05], [0.01, 0.16, 0.12], 'paper');
  for (const [y, z, c] of [[0.5, 0.0, 'red'], [0.46, 0.1, 'yellow'], [0.36, 0.02, 'teal'], [0.33, 0.1, 'orange']]) { S.ell([0, y, z], [0.012, 0.035, 0.012], c); S.ell([0, y - 0.04, z], [0.008, 0.008, 0.008], 'steel', { line: false }); }
  cyl(S, [[0, 0.04, 0.32], [0, 0.1, 0.32]], [0.07, 0.07], 'dark', 'teal');
  S.tube([[0, 0.04, 0.2], [0, 0.55, 0.42]], [0.012, 0.012], 'woodL');
  S.ell([0, 0.62, 0.45], [0.012, 0.1, 0.09], (n) => ((Math.floor(n[1] * 6) + Math.floor(n[2] * 6)) % 2 ? 'net' : null));
  return S;
}
function dispOpenSculpt() {
  const S = sculpt();
  S.tube([[0, 0.38, -0.08], [0, 0.48, 0], [0, 0.38, 0.08]], [0.004, 0.004, 0.004], 'iron', { line: false });
  S.box([0, 0.3, 0], [0.01, 0.075, 0.24], (n) => (Math.abs(n[1]) > 0.8 || Math.abs(n[2]) > 0.9 ? 'redD' : 'white'));
  S.decal([0.012, 0.3, 0], textPainter('OUVERT', 0xc0302a), { tol: 0.06 });
  return S;
}

// ---------------------------------------------------------------- loose bits
function bitSculpt(kind) {
  const S = sculpt();
  switch (kind) {
    case 'mug':
      cyl(S, [[0, 0.0, 0], [0, 0.1, 0]], [0.042, 0.045], 'red', 'cocoa');
      S.tube([[0, 0.085, 0.045], [0, 0.05, 0.08], [0, 0.02, 0.045]], [0.012, 0.012, 0.012], 'red');
      break;
    case 'cup':
      cyl(S, [[0, 0.0, 0], [0, 0.07, 0]], [0.03, 0.036], 'white', 'cocoa');
      break;
    case 'leafR': case 'leafO': case 'leafY':
      S.box([0, 0.01, 0], [0.06, 0.006, 0.05], kind, { rot: [0.5, 0, 0.3] });
      S.tube([[0.06, 0.01, 0], [0.09, 0.012, 0.01]], [0.006, 0.004], 'bark', { line: false });
      break;
    case 'dirt':
      S.ell([0, 0.035, 0], [0.06, 0.035, 0.05], 'bark');
      break;
    case 'flower':
      S.ell([0, 0.04, 0], [0.06, 0.04, 0.06], 'orange');
      S.ell([0, 0.02, 0.05], [0.04, 0.012, 0.03], 'leaf');
      break;
    case 'book':
      S.box([0, 0.02, 0], [0.07, 0.02, 0.1], (n, p, face) => (face === 3 ? 'paper' : 'book2'), { rot: [0.4, 0.2, 0] });
      break;
    case 'boot':
      S.tube([[0, 0.05, 0], [0.16, 0.06, 0]], [0.05, 0.05], 'yellow');
      S.ell([-0.02, 0.05, 0], [0.06, 0.05, 0.05], 'yellow');
      break;
    case 'lure':
      S.ell([0, 0.02, 0], [0.04, 0.012, 0.012], 'red');
      break;
    default:
      break;
  }
  return S;
}

// ---------------------------------------------------------------- catalogue
// kind -> { ppm, pitch, views, n, pose(i) -> Sculpt } (as DECO in deco2d.js), plus
//   vary: n is a set of looks (an item keeps one, chosen at placement) instead of animation frames
//   sym: the back views repeat the front views mirrored (symmetric things)
//   flat: 'ground' (a card lying on the ground) | 'window' (a card standing in a shop window)
const one = (pose, ppm, views = ALL5, o = {}) => ({ ppm, pitch: 0.32, views, n: 1, pose: () => pose(), ...o });
const vary = (n, pose, ppm, views = ALL5, o = {}) => ({ ppm, pitch: 0.32, views, n, pose, vary: true, ...o });
const SIDE = ['side'];
const TOP = { yaw: -Math.PI / 2, pitch: Math.PI / 2 };
const SHOP = { yaw: -Math.PI / 2, pitch: 0.14 };
export const FURN = {
  // porch & yard
  rocker: one(() => rockerSculpt(), 44),
  swing: vary(2, (i) => swingSculpt(['teal', 'burgundy'][i]), 38, ALL5),
  muskoka: vary(3, (i) => muskokaSculpt(['red', 'teal', 'yellow'][i]), 44),
  sidetable: one(() => sideTableSculpt(), 52, SIDE),
  mum: vary(4, (i) => mumSculpt(i), 52, SIDE),
  fern: one(() => fernSculpt(), 48, SIDE),
  bootrack: one(() => bootRackSculpt(), 48, FRONT3, { sym: true }),
  woodbox: one(() => woodBoxSculpt(), 44, FRONT3),
  chimes: { ppm: 52, pitch: 0.32, views: SIDE, n: 2, pose: (i) => chimesSculpt(i ? 1 : -1) },
  barrow: vary(2, (i) => barrowSculpt(i ? 'pumpkins' : 'leaves'), 42),
  gnome: one(() => gnomeSculpt(), 60),
  birdbath: one(() => birdbathSculpt(), 48, SIDE),
  leafpile: vary(2, (i) => leafPileSculpt(i), 40, SIDE),
  rake: one(() => rakeSculpt(), 44, FRONT3, { sym: true }),
  mat: one(() => matSculpt(), 40, [TOP], { flat: 'ground' }),
  // café terraces & Main Street
  bistrotable: one(() => bistroTableSculpt(), 48, SIDE),
  umbrellatable: vary(2, (i) => bistroTableSculpt({ umbrella: [['green', 'cream'], ['red', 'cream']][i] }), 34, SIDE),
  bistrochair: one(() => bistroChairSculpt(), 48),
  easel: one(() => easelSculpt(), 44, FRONT3),
  newsbox: vary(3, (i) => newsboxSculpt(i), 48, FRONT3),
  barrelplanter: vary(3, (i) => barrelPlanterSculpt(i), 44, SIDE),
  phonebooth: one(() => phoneBoothSculpt(), 34, FRONT3, { sym: true }),
  streetsign: vary(3, (i) => streetSignSculpt(['MAIN ST', 'WHARF ST', 'PARK LN'][i]), 40, ALL5),
  bench2d: vary(2, (i) => benchSculpt(i ? 'wood' : 'green'), 40),
  // harbour & beach
  deckchair: vary(3, (i) => deckChairSculpt(i), 44),
  cooler: vary(2, (i) => coolerSculpt(i), 48, FRONT3, { sym: true }),
  rods: one(() => rodsSculpt(), 40, FRONT3, { sym: true }),
  netpile: one(() => netPileSculpt(), 40, SIDE),
  lifering: one(() => lifeRingSculpt(), 44, FRONT3, { sym: true }),
  kayak: vary(2, (i) => kayakSculpt(i), 36),
  basket: one(() => basketSculpt(), 52, FRONT3, { sym: true }),
  pail: one(() => pailSculpt(), 56, SIDE),
  beachball: one(() => beachBallSculpt(), 52, SIDE),
  towel: vary(2, (i) => towelSculpt(i), 36, [TOP], { flat: 'ground' }),
  // the park
  picnic2d: one(() => picnicSculpt(), 36, FRONT3, { sym: true }),
  musicstand: one(() => musicStandSculpt(), 48, FRONT3),
  flowerbed: vary(2, (i) => flowerBedSculpt(i), 38, SIDE),
  library: one(() => librarySculpt(), 44, FRONT3),
  // shop windows
  win_donuts: one(() => dispDonutsSculpt(), 56, [SHOP], { flat: 'window' }),
  win_cake: one(() => dispCakeSculpt(), 56, [SHOP], { flat: 'window' }),
  win_mugs: one(() => dispMugsSculpt(), 56, [SHOP], { flat: 'window' }),
  win_bread: one(() => dispBreadSculpt(), 56, [SHOP], { flat: 'window' }),
  win_pie: one(() => dispPieSculpt(), 56, [SHOP], { flat: 'window' }),
  win_tools: one(() => dispToolsSculpt(), 52, [SHOP], { flat: 'window' }),
  win_tins: one(() => dispTinsSculpt(), 56, [SHOP], { flat: 'window' }),
  win_apples: one(() => dispApplesSculpt(), 56, [SHOP], { flat: 'window' }),
  win_parcels: one(() => dispParcelsSculpt(), 56, [SHOP], { flat: 'window' }),
  win_tackle: one(() => dispTackleSculpt(), 56, [SHOP], { flat: 'window' }),
  win_open: one(() => dispOpenSculpt(), 56, [SHOP], { flat: 'window' }),
};
for (const k of ['mug', 'cup', 'leafR', 'leafO', 'leafY', 'dirt', 'flower', 'book', 'boot', 'lure']) FURN[`bit_${k}`] = one(() => bitSculpt(k), 56, SIDE);
export { MATS as FURN_MATS, textPainter };
void ramp;
