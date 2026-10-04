// The pumpkin carving mini-game's rules, with no DOM or three.js (so node can check
// them): the face grid, the carve mask and how it is saved, the bits that fall in, the
// stencils, and how the judges score a face.
//
// The pumpkin is a 32 x 32 grid seen from the front (row 0 at the top). BODY is the
// pumpkin's silhouette, CARVABLE the face inside its rim. A mask is a Uint8Array(N * N)
// with 1 where Hank has cut through; saved as 128 bytes of bits in base64.

export const N = 32;
export const CX = 16, CY = 17, RX = 15.5, RY = 13.5; // the silhouette (cell units, edges at integers)
const KX = 0.86, KY = 0.88; // the carvable face, inside a rim of solid pumpkin
export const BODY = new Uint8Array(N * N);
export const CARVABLE = new Uint8Array(N * N);
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  const dx = (x + 0.5 - CX) / RX, dy = (y + 0.5 - CY) / RY;
  if (dx * dx + dy * dy <= 1) BODY[y * N + x] = 1;
  const ex = (x + 0.5 - CX) / (RX * KX), ey = (y + 0.5 - CY) / (RY * KY);
  if (ex * ex + ey * ey <= 1) CARVABLE[y * N + x] = 1;
}
export const CARVABLE_N = CARVABLE.reduce((s, v) => s + v, 0);
export const inFace = (x, y) => x >= 0 && y >= 0 && x < N && y < N && CARVABLE[y * N + x] === 1;

export const emptyMask = () => new Uint8Array(N * N);
export const countCarved = (m) => { let n = 0; for (let i = 0; i < m.length; i++) if (m[i] && CARVABLE[i]) n++; return n; };
export const mirrorX = (m) => { const o = new Uint8Array(N * N); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) o[y * N + x] = m[y * N + (N - 1 - x)]; return o; };

// ---------------------------------------------------------------- saving
const b64 = {
  enc: (bytes) => (typeof btoa === 'function' ? btoa(String.fromCharCode(...bytes)) : Buffer.from(bytes).toString('base64')),
  dec: (s) => (typeof atob === 'function' ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : new Uint8Array(Buffer.from(s, 'base64'))),
};
export function encodeMask(m) {
  const bytes = new Uint8Array((N * N) / 8);
  for (let i = 0; i < N * N; i++) if (m[i] && CARVABLE[i]) bytes[i >> 3] |= 1 << (i & 7);
  return b64.enc(bytes);
}
export function decodeMask(s) {
  if (typeof s !== 'string' || !s) return null;
  try {
    const bytes = b64.dec(s);
    if (bytes.length !== (N * N) / 8) return null;
    const m = new Uint8Array(N * N);
    for (let i = 0; i < N * N; i++) m[i] = (bytes[i >> 3] >> (i & 7)) & 1 && CARVABLE[i] ? 1 : 0;
    return m;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- the pumpkin's wall
// The solid parts of the face, in 4-connected pieces: { cells, n, rim } (rim: it still
// joins the solid rim round the face, so it holds; a piece that doesn't is loose and drops in)
function solidPieces(m) {
  const seen = new Uint8Array(N * N);
  const out = [];
  const stack = [];
  for (let i = 0; i < N * N; i++) {
    if (!CARVABLE[i] || m[i] || seen[i]) continue;
    const cells = [];
    let rim = false;
    seen[i] = 1;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop();
      cells.push(j);
      const x = j % N, y = (j / N) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) { rim = true; continue; }
        const k = ny * N + nx;
        if (!CARVABLE[k]) { rim = true; continue; }
        if (m[k] || seen[k]) continue;
        seen[k] = 1;
        stack.push(k);
      }
    }
    out.push({ cells, n: cells.length, rim });
  }
  return out;
}
// carve a ring round a bit of pumpkin and it falls in: those cells become holes too.
// Returns how many cells dropped.
export function dropLoose(m) {
  let n = 0;
  for (const p of solidPieces(m)) if (!p.rim) { for (const j of p.cells) m[j] = 1; n += p.n; }
  return n;
}
// cut right across the face, rim to rim, and it comes apart in two big halves
export function isSplit(m) {
  const held = solidPieces(m).filter((p) => p.rim).map((p) => p.n).sort((a, b) => b - a);
  if (held.length < 2) return false;
  const total = held.reduce((s, n) => s + n, 0);
  return held[1] >= Math.max(24, total * 0.22);
}

// ---------------------------------------------------------------- what's been carved
// the holes, in 8-connected pieces (a diagonal knife line is one cut)
function holes(m) {
  const seen = new Uint8Array(N * N);
  const out = [];
  for (let i = 0; i < N * N; i++) {
    if (!m[i] || !CARVABLE[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let n = 0, sx = 0, sy = 0, x0 = N, x1 = -1, y0 = N, y1 = -1;
    while (stack.length) {
      const j = stack.pop();
      const x = j % N, y = (j / N) | 0;
      n++; sx += x + 0.5; sy += y + 0.5;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
        const k = ny * N + nx;
        if (m[k] && CARVABLE[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    out.push({ n, cx: sx / n, cy: sy / n, x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}

export function analyze(m) {
  const carved = countCarved(m);
  const area = carved / CARVABLE_N;
  const comps = holes(m);
  const used = new Set();
  // eyes: up top, one each side (a band across both counts as a pair: a bandit mask)
  const upper = comps.filter((c) => c.cy < CY - 1.5 && c.n >= 3);
  let left = upper.filter((c) => c.cx < CX - 1).sort((a, b) => b.n - a.n)[0];
  let right = upper.filter((c) => c.cx > CX + 1).sort((a, b) => b.n - a.n)[0];
  const band = upper.find((c) => c.x0 < CX - 2 && c.x1 > CX + 1 && c.w >= 8);
  if (band && (!left || !right)) { left = left || band; right = right || band; }
  for (const c of [left, right]) if (c) used.add(c);
  let eyes = (left ? 1 : 0) + (right ? 1 : 0);
  // a wink: one eye, and a little slit on the other side
  const wink = eyes === 1 && comps.some((c) => !used.has(c) && c.cy < CY - 0.5 && c.n <= 6 && c.h <= 2 && (left ? c.cx > CX + 1 : c.cx < CX - 1));
  // the mouth: the widest cut low down
  const mouth = comps.filter((c) => !used.has(c) && c.cy > CY + 1.5 && c.w >= 5).sort((a, b) => b.w - a.w)[0] || null;
  if (mouth) used.add(mouth);
  const lowBits = comps.some((c) => !used.has(c) && c.cy > CY + 1.5);
  const nose = comps.find((c) => !used.has(c) && Math.abs(c.cx - CX) < 2.6 && c.cy > CY - 3 && c.cy < CY + 2.8 && c.n <= 16) || null;
  if (nose) used.add(nose);
  const extras = comps.filter((c) => !used.has(c) && c.n >= 2).length;
  // teeth: a wide mouth that isn't one solid slot
  const teeth = !!mouth && mouth.w >= 7 && mouth.h >= 3 && mouth.n / (mouth.w * mouth.h) < 0.72;
  // symmetry: the face against its mirror image (overlap / union)
  const mir = mirrorX(m);
  let both = 0, any = 0;
  for (let i = 0; i < N * N; i++) {
    if (!CARVABLE[i]) continue;
    const a = m[i], b = mir[i];
    if (a && b) both++;
    if (a || b) any++;
  }
  const sym = any ? both / any : 0;
  const split = isSplit(m);
  return { carved, area, comps: comps.length, eyes, wink, mouth: !!mouth, lowBits, nose: !!nose, teeth, extras, sym, split, collapse: split || area > 0.5, empty: area < 0.01 };
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
// the prizes (kit: the UI ribbon's colour; color: the rosette on Hank's table)
export const RIBBONS = {
  first: { name: '1st Prize', kit: 'red', color: 0xc8382e },
  second: { name: '2nd Prize', kit: 'blue', color: 0x3a6ad0 },
  third: { name: '3rd Prize', kit: 'green', color: 0xf2eee4 },
  part: { name: 'Honourable Mention', kit: 'green', color: 0x5a8a3a },
};
// ribbon thresholds on the 0-100 score
export const RIBBON_AT = { first: 76, second: 60, third: 44 };
export function ribbonFor(score) {
  return score >= RIBBON_AT.first ? 'first' : score >= RIBBON_AT.second ? 'second' : score >= RIBBON_AT.third ? 'third' : 'part';
}

// the judges' score: eyes 26, mouth 22, nose 6, symmetry 24, a sensible amount cut 12, style 10
export function scoreCarving(m) {
  const A = analyze(m);
  const parts = {};
  parts.eyes = A.eyes === 2 ? 26 : A.wink ? 20 : A.eyes === 1 ? 12 : 0;
  parts.mouth = A.mouth ? 22 : A.lowBits ? 8 : 0;
  parts.nose = A.nose ? 6 : 0;
  parts.sym = Math.round(24 * clamp01((A.sym - 0.3) / 0.55));
  const a = A.area;
  parts.area = Math.round(a < 0.02 ? 0 : a < 0.07 ? (12 * (a - 0.02)) / 0.05 : a <= 0.3 ? 12 : 12 * clamp01(1 - (a - 0.3) / 0.2));
  parts.style = Math.min(10, (A.teeth ? 4 : 0) + Math.min(2, A.extras) * 1.5 + (A.eyes === 2 && A.mouth && A.nose ? 3 : 0));
  let score = Object.values(parts).reduce((s, v) => s + v, 0);
  if (A.empty) score = 0;
  else if (A.collapse) score = Math.min(score, 12);
  score = Math.round(Math.max(0, Math.min(100, score)));
  return { score, ribbon: A.collapse || A.empty ? 'part' : ribbonFor(score), parts, ...A };
}

// ---------------------------------------------------------------- stencils (faint marker lines to follow)
function cut(m, x, y) { if (inFace(x, y)) m[y * N + x] = 1; }
// draw the left half with f(m) and mirror it across
function sym(f) {
  const m = emptyMask();
  f(m);
  const r = mirrorX(m);
  for (let i = 0; i < m.length; i++) m[i] |= r[i];
  return m;
}
export const STENCILS = {
  // triangle eyes and nose, a toothy grin
  classic: sym((m) => {
    for (let r = 0; r < 4; r++) for (let x = 11 - r; x <= 12 + r; x++) cut(m, x - 1, 9 + r);
    for (let r = 0; r < 3; r++) for (let x = 15 - r; x <= 15; x++) cut(m, x, 15 + r);
    for (let x = 7; x <= 15; x++) {
      const k = (15.5 - (x + 0.5)) / 8.5;
      const bot = 24 - Math.round(k * k * 3), th = 3 - Math.round(k * 1.4);
      for (let y = bot - th + 1; y <= bot; y++) cut(m, x, y);
    }
    for (const [x, y] of [[11, 21], [11, 22], [15, 24]]) m[y * N + x] = 0; // teeth
  }),
  // round eyes, a big happy U
  happy: sym((m) => {
    for (let y = 8; y <= 13; y++) for (let x = 7; x <= 13; x++) if (Math.hypot(x + 0.5 - 10.5, y + 0.5 - 11) <= 2.6) cut(m, x, y);
    for (let x = 6; x <= 15; x++) {
      const k = (15.5 - (x + 0.5)) / 9.5;
      const bot = 25 - Math.round(k * k * 5);
      for (let y = bot - 2; y <= bot; y++) cut(m, x, y);
    }
  }),
  // slanted cat eyes, a little nose and a "w" mouth
  cat: sym((m) => {
    for (let i = 0; i < 6; i++) { cut(m, 8 + i, 10 + (i >> 1)); cut(m, 8 + i, 11 + (i >> 1)); }
    cut(m, 13, 14); cut(m, 12, 13);
    cut(m, 15, 17); cut(m, 14, 17); cut(m, 15, 18);
    // the "w": down from the cheek, up to the middle
    [[9, 20], [10, 21], [11, 22], [12, 22], [13, 21], [14, 21], [15, 22]].forEach(([x, y]) => { cut(m, x, y); cut(m, x, y + 1); });
  }),
};
export const STENCIL_NAMES = Object.keys(STENCILS);
