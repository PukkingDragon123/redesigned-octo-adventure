// Generated pixel-art 9-slice frames for CSS border-image (wood + gold corners).
import { Pix, shade } from '../art/pixel.js';

const cache = new Map();

function corner(p, x, y, fx, fy, gold, goldDark) {
  // little filigree ornament in a 7x7 corner
  const pts = [[1, 1], [2, 1], [3, 1], [1, 2], [1, 3], [3, 3], [4, 2], [2, 4], [5, 1], [1, 5], [4, 4], [5, 5]];
  for (const [a, b] of pts) {
    const px = fx ? x + 7 - a : x + a, py = fy ? y + 7 - b : y + b;
    p.set(px, py, gold);
  }
  const dk = [[2, 2], [5, 2], [2, 5], [3, 4], [4, 3]];
  for (const [a, b] of dk) p.set(fx ? x + 7 - a : x + a, fy ? y + 7 - b : y + b, goldDark);
}

// style: 'wood' (dark wood, gold corners, parchment fill) | 'dark' (HUD) | 'paper' | 'button' | 'buttonHot'
export function frameURL(style = 'wood') {
  if (cache.has(style)) return cache.get(style);
  const S = 24;
  const p = new Pix(S, S);
  const P = {
    wood: { outer: 0x2a160c, rim: 0x6b3d22, rimHi: 0x8a5432, rimDk: 0x4a2a16, fill: 0xf3e2bc, fillDk: 0xe6cf9e, gold: 0xf2c443, goldDk: 0xa86d1c },
    dark: { outer: 0x1a0e0a, rim: 0x5a3220, rimHi: 0x7a4a2e, rimDk: 0x3a1e12, fill: 0x2e1c18, fillDk: 0x24140f, gold: 0xf2c443, goldDk: 0xa86d1c },
    paper: { outer: 0x5a3a22, rim: 0xd8bc88, rimHi: 0xf0dcae, rimDk: 0xb89a66, fill: 0xf6e8c8, fillDk: 0xecd8ae, gold: 0xc8361f, goldDk: 0x8a2214 },
    button: { outer: 0x2a160c, rim: 0x8a5432, rimHi: 0xb07a48, rimDk: 0x5a321c, fill: 0x6b3d22, fillDk: 0x5a321c, gold: 0xf2c443, goldDk: 0xa86d1c },
    buttonHot: { outer: 0x2a160c, rim: 0xd8a040, rimHi: 0xffe08a, rimDk: 0x8a5a1c, fill: 0x8a5432, fillDk: 0x7a4a2e, gold: 0xfff0a0, goldDk: 0xd8a040 },
    order: { outer: 0x3a2a1e, rim: 0xe8d8b0, rimHi: 0xfff4d8, rimDk: 0xc8b488, fill: 0xfdf4dc, fillDk: 0xf2e6c4, gold: 0xc8361f, goldDk: 0x8a2214 },
  }[style];
  p.rect(0, 0, S, S, P.fill);
  // a few parchment flecks; the centre tile repeats at pixel scale (border-image-repeat: round)
  for (const [a, b] of [[1, 2], [5, 5], [6, 1]]) p.set(8 + a, 8 + b, P.fillDk);
  // frame bands
  p.rect(0, 0, S, 1, P.outer); p.rect(0, S - 1, S, 1, P.outer); p.rect(0, 0, 1, S, P.outer); p.rect(S - 1, 0, 1, S, P.outer);
  p.rect(1, 1, S - 2, 5, P.rim); p.rect(1, S - 6, S - 2, 5, P.rim); p.rect(1, 1, 5, S - 2, P.rim); p.rect(S - 6, 1, 5, S - 2, P.rim);
  p.rect(1, 1, S - 2, 1, P.rimHi); p.rect(1, 1, 1, S - 2, P.rimHi);
  p.rect(1, S - 2, S - 2, 1, P.rimDk); p.rect(S - 2, 1, 1, S - 2, P.rimDk);
  p.rect(6, 6, S - 12, 1, P.outer); p.rect(6, S - 7, S - 12, 1, P.outer); p.rect(6, 6, 1, S - 12, P.outer); p.rect(S - 7, 6, 1, S - 12, P.outer);
  // wood grain on the rim
  for (let i = 3; i < S - 3; i += 4) { p.set(i, 3, P.rimDk); p.set(i + 2, S - 4, P.rimDk); p.set(3, i + 1, P.rimDk); p.set(S - 4, i, P.rimDk); }
  // gold corner filigree
  corner(p, 0, 0, false, false, P.gold, P.goldDk);
  corner(p, S - 8, 0, true, false, P.gold, P.goldDk);
  corner(p, 0, S - 8, false, true, P.gold, P.goldDk);
  corner(p, S - 8, S - 8, true, true, P.gold, P.goldDk);
  const url = p.toDataURL();
  cache.set(style, url);
  return url;
}

// Slot frame like the reference inventory: dark wood tile with gold scroll corners
export function slotURL(hot = false) {
  const key = `slot:${hot}`;
  if (cache.has(key)) return cache.get(key);
  const S = 24;
  const p = new Pix(S, S);
  const gold = hot ? 0xfff0a0 : 0xf2c443, gd = hot ? 0xd8a040 : 0xa86d1c;
  p.rect(0, 0, S, S, 0x2a160c);
  p.rect(1, 1, S - 2, S - 2, gold);
  p.rect(3, 3, S - 6, S - 6, 0x2a160c);
  p.rect(4, 4, S - 8, S - 8, 0x7a4a26);
  p.rect(4, 4, S - 8, 1, 0x9a6234);
  p.rect(4, 4, 1, S - 8, 0x9a6234);
  p.rect(4, S - 5, S - 8, 1, 0x5a321a);
  p.rect(S - 5, 4, 1, S - 8, 0x5a321a);
  for (const [cx, cy] of [[2, 2], [S - 3, 2], [2, S - 3], [S - 3, S - 3]]) {
    p.rect(cx - 1, cy - 1, 3, 3, gold);
    p.set(cx, cy, gd);
  }
  p.set(1, 1, 0x2a160c); p.set(S - 2, 1, 0x2a160c); p.set(1, S - 2, 0x2a160c); p.set(S - 2, S - 2, 0x2a160c);
  const url = p.toDataURL();
  cache.set(key, url);
  return url;
}
