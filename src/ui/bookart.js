// Hank's journal as pixel art, painted in code on its own art-pixel grid (shown at a
// whole number of device pixels per art pixel by book.js, never smoothed): a leather
// cover with a lit bevel, cream stitching and brass corner caps; cream pages with a
// dithered gutter and the edges of the page block showing under them; a red ribbon
// bookmark hanging out of the bottom. Lit from the top left like the rest of the kit.
import { Pix } from '../art/pixel.js';
import { C, TEX, BRASS, field, band, stepRect } from './kitart.js';

export const BOOK = { b: 9, s: 3, rib: 13, sh: 3 }; // cover margin, page-block edge, ribbon drop, shadow

const SHADOW = 0x120a0c;
const CAP = 14; // the brass corners, art px along each edge
const RED = [0xff9a7a, 0xe0482e, 0xc0301e, 0x8e1c14, 0x5a0e0c];

// the spread's geometry in art px: { W, H, cw, ch, pages: [{ x, y, w, h, gut }] }
// (gut: which side the spine is on, -1 left / +1 right)
export function bookGeom(pw, ph, single) {
  const { b, s, rib, sh } = BOOK;
  const cw = single ? b + 3 + pw + s + b : 2 * (b + s + pw);
  const ch = b + ph + s + b - 2;
  const pages = single
    ? [{ x: b + 3, y: b, w: pw, h: ph, gut: -1 }]
    : [{ x: b + s, y: b, w: pw, h: ph, gut: 1 }, { x: cw / 2, y: b, w: pw, h: ph, gut: -1 }];
  return { W: cw + sh, H: ch + Math.max(sh, rib), cw, ch, pages, single };
}

export function bookArt(G) {
  const { W, H, cw, ch, pages, single } = G;
  const { s, b } = BOOK;
  const p = new Pix(W, H);
  const cover = stepRect(0, 0, cw, ch, [3, 1, 1]);
  // the cover's outline with the brass caps squaring off its corners
  const shape = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && (cover(x, y) || Math.min(x, cw - 1 - x) + Math.min(y, ch - 1 - y) < CAP - 1);
  // a hard drop shadow (whole pixels, no blur)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!shape(x, y) && shape(x - BOOK.sh, y - BOOK.sh)) p.put(x, y, SHADOW, 120);
  // ---- the leather
  const f = field(cw, ch, cover, 6);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x, d = f.D[i];
    if (!d) continue;
    const bd = band(d), l = f.L[i];
    let c;
    if (bd === 0) c = C.ink;
    else if (bd === 1) c = l > 0.25 ? C.leaHi : l < -0.25 ? C.leaDD : C.leaL;
    else if (bd === 2) c = l > 0.25 ? C.leaL : l < -0.25 ? C.leaD : TEX.leather(x, y);
    else c = TEX.leather(x, y);
    // the spine of a two-page spread: a soft dark crease down the middle
    if (!single && bd > 0) {
      const k = Math.abs(x + 0.5 - cw / 2);
      if (k < 1) c = C.leaX;
      else if (k < 2) c = C.leaDD;
      else if (k < 4 && (x + y) % 2 === 0) c = C.leaD;
    }
    // a single page: the binding down the left, two raised bands of it lit
    if (single && bd > 1 && x < b - 2) {
      c = x === 2 || x === 3 ? C.leaL : x === b - 3 ? C.leaDD : (x + y) % 2 ? C.lea : C.leaD;
    }
    p.set(x, y, c);
  }
  // ---- cream stitching four pixels in, 3 on / 2 off, each stitch with a dark hole under it
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x;
    if (band(f.D[i]) !== 3) continue;
    const ix = Math.min(x, cw - 1 - x), iy = Math.min(y, ch - 1 - y);
    const along = iy <= ix ? x : y;
    if ((along + 1) % 5 >= 3) continue;
    const lit = f.L[i] > -0.25;
    p.set(x, y, lit ? C.parL : C.parD);
    // the stitch sinks into the leather on its shadow side
    const sx = iy <= ix ? 0 : 1, sy = iy <= ix ? 1 : 0;
    if (band(f.at(x + sx, y + sy)) === 4) p.set(x + sx, y + sy, C.leaDD);
  }
  // ---- brass corner caps: a triangle of brass over each corner (squaring it off),
  // lit along its outer edges, a dark bevel on the diagonal, a rivet in it
  const N = CAP;
  for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    // which edges face the light (top / left) for this corner
    const litX = !cx, litY = !cy;
    for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N - iy; ix++) {
      const x = cx ? cw - 1 - ix : ix, y = cy ? ch - 1 - iy : iy;
      const diag = ix + iy;
      let c;
      if (ix === 0 || iy === 0 || diag === N - 1) c = C.ink;
      else if (diag === N - 2) c = BRASS[5];
      else if (diag === N - 3) c = BRASS[4];
      else if (ix === 1) c = litX ? BRASS[0] : BRASS[4];
      else if (iy === 1) c = litY ? BRASS[0] : BRASS[4];
      else if (ix === 2) c = litX ? BRASS[1] : BRASS[3];
      else if (iy === 2) c = litY ? BRASS[1] : BRASS[3];
      else c = (ix + iy) % 2 && diag > N - 6 ? BRASS[3] : BRASS[2];
      p.set(x, y, c);
    }
    // a domed rivet
    const rx = cx ? cw - 6 : 4, ry = cy ? ch - 6 : 4;
    p.set(rx, ry, BRASS[0]);
    p.set(rx + 1, ry, BRASS[1]);
    p.set(rx, ry + 1, BRASS[1]);
    p.set(rx + 1, ry + 1, BRASS[4]);
  }
  // ---- the page block: its edges under and beside each page
  const EDGE = [C.parD, C.parL, C.parDD];
  for (const P of pages) {
    const outer = P.gut > 0 ? P.x - 1 : P.x + P.w; // the column just past the outer edge
    for (let k = 0; k < s; k++) {
      // under the page (the block narrows into the spine)
      for (let x = P.x; x < P.x + P.w; x++) {
        const g = P.gut > 0 ? P.x + P.w - 1 - x : x - P.x;
        if (g < k + 1 && !single) continue;
        p.set(x, P.y + P.h + k, EDGE[k]);
      }
      // beside it, and round the corner
      const cx = P.gut > 0 ? outer - k : outer + k;
      for (let y = P.y + 1 + k; y < P.y + P.h + k; y++) p.set(cx, y, EDGE[k]);
      p.set(cx, P.y + P.h + k, EDGE[k]);
    }
    // the shadow line under the block
    for (let x = P.x - (P.gut > 0 ? s : 0); x < P.x + P.w + (P.gut > 0 ? 0 : s); x++) p.set(x, P.y + P.h + s, C.leaX);
  }
  // ---- the pages: cream paper, the gutter dithered darker towards the spine
  for (const P of pages) {
    for (let y = P.y; y < P.y + P.h; y++) for (let x = P.x; x < P.x + P.w; x++) {
      const g = P.gut > 0 ? P.x + P.w - 1 - x : x - P.x; // distance from the spine
      const o = P.w - 1 - g; // from the outer edge
      const top = y - P.y, bot = P.y + P.h - 1 - y;
      // the paper dips into the spine at the top
      if (top === 0 && g < 3) continue;
      if (top === 1 && g < 1) continue;
      const chk = (x + y) % 2 === 0;
      let c = TEX.paperLight(x, y);
      if (g === 0) c = C.parX;
      else if (g === 1) c = C.parDD;
      else if (g === 2) c = chk ? C.parDD : C.parD;
      else if (g <= 4) c = C.parD;
      else if (g <= 6) c = chk ? C.parD : C.par;
      else if (g <= 9) c = C.par;
      else if (g <= 11) c = chk ? C.par : c;
      if (top === 0) c = g < 6 ? C.parD : C.parHi;
      if (o === 0) c = C.parD;
      else if (o === 1 && top > 0) c = mixEdge(c);
      if (bot === 0 && o > 0) c = g < 6 ? C.parDD : C.parD;
      p.set(x, y, c);
    }
    // the outer top corner lifts a little: a curl with a fold shadow under it
    const ox = P.gut > 0 ? P.x : P.x + P.w - 1, d = -P.gut;
    p.set(ox, P.y, C.parX);
    p.set(ox, P.y + 1, C.parD);
    p.set(ox - d, P.y, C.parD);
  }
  // ---- the ribbon bookmark, out of the bottom of the page by the spine
  const R = pages[pages.length - 1];
  const rx = single ? R.x + 14 : R.x + 12, rw = 7;
  const y0 = R.y + R.h - 7, y1 = ch + BOOK.rib - 2;
  for (let y = y0; y <= y1; y++) for (let k = 0; k < rw; k++) {
    // the end is cut into a swallowtail
    const fromEnd = y1 - y, mid = Math.abs(k - (rw - 1) / 2);
    if (fromEnd < 3 - mid) continue;
    const x = rx + k;
    let c;
    if (k === 0 || k === rw - 1 || fromEnd === Math.max(0, Math.ceil(3 - mid))) c = C.ink;
    else c = k === 1 ? RED[1] : k === rw - 2 ? RED[3] : RED[2];
    // a fold where it comes over the page edge, and a little sheen
    if (c !== C.ink && y === R.y + R.h) c = RED[4];
    if (c !== C.ink && y === R.y + R.h + 1) c = RED[3];
    if (c !== C.ink && k === 2 && (y - y0) % 9 === 3) c = RED[0];
    p.set(x, y, c);
  }
  for (let y = y0; y <= y1 + 1; y++) if (y > ch - 1 || y > y0) p.put(rx + rw, y + 1, SHADOW, p.alpha(rx + rw, y + 1) > 200 ? 255 : 120);
  for (let y = y0 + 1; y < y0 + 3; y++) for (let k = 1; k < rw - 1; k++) p.set(rx + k, y - 2, y === y0 + 1 ? C.parD : C.par);
  return p;
}
// the page's outer edge a shade darker (the paper turns away from the light)
function mixEdge(c) {
  return c === C.parL || c === C.parHi ? C.par : c;
}

// the little closed journal for the screen corner (tap it to open the menu): 20 x 26
export function iconArt() {
  const W = 22, H = 28;
  const p = new Pix(W, H);
  const body = stepRect(1, 1, 18, 23, [2, 1]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!body(x, y) && body(x - 2, y - 2)) p.put(x, y, SHADOW, 120);
  // the page block peeking out on the right and at the bottom
  for (let y = 3; y < 23; y++) { p.set(18, y, y % 2 ? C.parL : C.parD); p.set(19, y, C.parDD); }
  for (let x = 4; x < 19; x++) p.set(x, 23, x % 2 ? C.parL : C.parD);
  const f = field(W, H, (x, y) => body(x, y) && x < 18 && y < 23, 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, d = f.D[i];
    if (!d) continue;
    const bd = band(d), l = f.L[i];
    let c = bd === 0 ? C.ink : bd === 1 ? (l > 0.25 ? C.leaHi : l < -0.25 ? C.leaDD : C.leaL) : TEX.leather(x, y);
    if (bd > 0 && x <= 4) c = x === 3 ? C.leaL : x === 4 ? C.leaDD : C.lea; // the spine
    p.set(x, y, c);
  }
  // the outline round the page block too
  for (let y = 2; y < 24; y++) p.set(20, y, C.ink);
  for (let x = 2; x < 21; x++) p.set(x, 24, C.ink);
  // a gold-tooled skull with a cup under it, on the cover
  const skull = ['.###.', '#####', '#.#.#', '#####', '.#.#.'];
  skull.forEach((r, j) => [...r].forEach((ch, i) => ch === '#' && p.set(9 + i, 7 + j, j === 0 || i === 0 ? BRASS[0] : BRASS[2])));
  for (let x = 8; x < 15; x++) { p.set(x, 14, BRASS[3]); p.set(x, 15, BRASS[4]); }
  // brass corners
  for (const [x, y] of [[16, 2], [17, 3], [17, 2], [16, 21], [17, 21], [17, 20]]) p.set(x, y, BRASS[1]);
  // the ribbon
  for (let y = 22; y < 28; y++) { p.set(12, y, C.ink); p.set(13, y, RED[1]); p.set(14, y, RED[3]); p.set(15, y, C.ink); }
  p.set(13, 27, C.ink); p.set(14, 26, C.ink); p.set(14, 27, 0, 0);
  return p;
}

export function toCanvas(p, c = document.createElement('canvas')) {
  c.width = p.w;
  c.height = p.h;
  c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.data), p.w, p.h), 0, 0);
  return c;
}
