// 32x32 pixel-art icons: Harold's keepsakes, upgrades, HUD glyphs.
import { Pix, shade } from './pixel.js';

const INK = 0x2a1a14;
const S = 32;

function fin(p) {
  // shade top-left / bottom-right edges and add a dark selective outline
  const src = new Uint8ClampedArray(p.data);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 4;
    if (src[i + 3] < 255) continue;
    const a = (xx, yy) => (xx < 0 || yy < 0 || xx >= S || yy >= S ? 0 : src[(yy * S + xx) * 4 + 3]);
    const c = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
    let n = c;
    if (!a(x + 1, y) || !a(x, y + 1)) n = shade(c, -0.2);
    if (!a(x, y - 1) && a(x, y + 1)) n = shade(c, 0.16);
    p.data[i] = (n >> 16) & 255;
    p.data[i + 1] = (n >> 8) & 255;
    p.data[i + 2] = n & 255;
  }
  p.outline(INK, { region: [0, 0, S, S] });
  return p;
}

const ICONS = {
  // ---- keepsakes (after the reference inventory sheet)
  cane(p) {
    p.line(9, 27, 22, 6, 0x8a5a2a);
    p.line(10, 27, 23, 6, 0xb07a3a);
    p.ellipse(23, 6, 3, 2.4, 0xd8c8a0);
    p.set(22, 5, 0xfff4dc);
    p.rect(8, 26, 3, 3, 0x3a3a3a);
  },
  spyglass(p) {
    p.rect(4, 13, 8, 6, 0x9a6a2a);
    p.rect(12, 12, 8, 8, 0xc8902a);
    p.rect(20, 11, 7, 10, 0xe0b040);
    p.rect(27, 12, 2, 8, 0xf0f0f0);
    for (const x of [11, 19, 26]) p.vline(x, 11, 20, 0x6a4a1a);
    p.hline(13, 18, 13, 0xf8e080);
  },
  pack(p) {
    p.rect(8, 8, 16, 19, 0x6a5a3a);
    p.rect(10, 10, 12, 6, 0x8a7a50);
    p.rect(7, 18, 18, 8, 0x5a4a2e);
    p.rect(14, 12, 4, 3, 0xd8b050);
    p.vline(9, 6, 9, 0x8a6a40);
    p.vline(22, 6, 9, 0x8a6a40);
    p.hline(9, 22, 5, 0x8a6a40);
    p.rect(10, 20, 4, 4, 0x8a7a50);
    p.rect(18, 20, 4, 4, 0x8a7a50);
  },
  clock(p) {
    p.rect(6, 20, 20, 8, 0x8a4a22);
    p.ellipse(16, 15, 10, 9, 0x9a5a2a);
    p.circle(16, 14, 6.5, 0xf6efe0);
    p.ring(16, 14, 6.5, 0xd8b050);
    p.line(16, 14, 16, 9, INK);
    p.line(16, 14, 19, 16, INK);
    p.rect(10, 23, 12, 2, 0xd8b050);
    p.rect(5, 27, 4, 2, 0x5a2a12);
    p.rect(23, 27, 4, 2, 0x5a2a12);
  },
  coat(p) {
    p.poly([[9, 6], [23, 6], [27, 28], [5, 28]], 0x9a2a1e);
    for (let y = 8; y < 28; y += 4) p.hline(7, 25, y, 0x6a1a12);
    for (let x = 8; x < 26; x += 4) p.vline(x, 7, 27, 0x6a1a12);
    p.poly([[13, 6], [19, 6], [16, 13]], 0xf0e0c8);
    p.vline(16, 13, 27, 0x4a120c);
    p.rect(2, 9, 5, 14, 0x9a2a1e);
    p.rect(25, 9, 5, 14, 0x9a2a1e);
  },
  medbag(p) {
    p.rect(5, 12, 22, 15, 0x2a2a30);
    p.rect(6, 13, 20, 4, 0x3a3a44);
    p.ring(16, 11, 4, 0xa0a0a8);
    p.rect(14, 18, 4, 7, 0xf0f0f0);
    p.rect(12, 20, 8, 3, 0xf0f0f0);
    p.rect(14, 19, 4, 5, 0xd8301e);
    p.rect(13, 20, 6, 3, 0xd8301e);
    // potion poking out
    p.rect(22, 5, 3, 8, 0x5ad040);
    p.rect(22, 3, 3, 2, 0xd8c8a0);
  },
  suitcase(p) {
    p.rect(4, 11, 24, 16, 0x8a5226);
    p.rect(5, 12, 22, 5, 0xa8683a);
    p.rect(13, 7, 6, 4, 0x5a3416);
    p.rect(14, 8, 4, 2, 0);
    p.data[(8 * S + 14) * 4 + 3] = 0; p.data[(8 * S + 15) * 4 + 3] = 0; p.data[(8 * S + 16) * 4 + 3] = 0; p.data[(8 * S + 17) * 4 + 3] = 0;
    for (const x of [9, 22]) p.rect(x, 11, 2, 16, 0x5a3416);
    p.rect(14, 17, 4, 3, 0xd8b050);
  },
  keys(p) {
    p.ring(10, 10, 5, 0xc8c8d0, 2);
    p.rect(13, 13, 14, 2, 0xc8c8d0);
    p.rect(23, 15, 2, 4, 0xc8c8d0);
    p.rect(20, 15, 2, 3, 0xc8c8d0);
    p.ring(14, 20, 4, 0xd8a840, 2);
    p.rect(17, 22, 11, 2, 0xd8a840);
    p.rect(25, 24, 2, 3, 0xd8a840);
  },
  books(p) {
    p.rect(4, 19, 23, 7, 0x2a4a8a);
    p.rect(4, 19, 23, 1, 0x4a6aaa);
    p.rect(26, 20, 2, 5, 0xe8e0d0);
    p.rect(5, 12, 22, 7, 0xb82a24);
    p.rect(26, 13, 2, 5, 0xe8e0d0);
    p.rect(5, 12, 22, 1, 0xd84a3a);
    p.hline(8, 22, 15, 0xd8b050);
    // pressed leaf poking out
    p.rect(17, 9, 3, 3, 0xe8701e);
    p.set(19, 8, 0xe8701e);
  },
  map(p) {
    p.rect(4, 7, 24, 19, 0xe8d8a8);
    for (let x = 4; x < 28; x += 8) p.vline(x, 7, 25, 0xc8b480);
    p.line(7, 20, 12, 13, 0x8a6a3a);
    p.line(12, 13, 18, 17, 0x8a6a3a);
    p.line(18, 17, 24, 10, 0x8a6a3a);
    p.line(21, 18, 24, 21, 0xd8301e);
    p.line(24, 18, 21, 21, 0xd8301e);
    p.rect(2, 6, 3, 21, 0xd8c890);
    p.rect(27, 6, 3, 21, 0xd8c890);
  },
  lantern(p) {
    p.rect(13, 3, 6, 3, 0x6a4a1a);
    p.ring(16, 4, 3, 0x8a6a2a);
    p.rect(10, 7, 12, 3, 0x8a5a1a);
    p.rect(11, 10, 10, 13, 0xf8e8b0);
    p.rect(13, 13, 6, 8, 0xffb040);
    p.rect(15, 15, 2, 4, 0xfff4c0);
    for (const x of [11, 20]) p.vline(x, 10, 22, 0x8a5a1a);
    p.rect(9, 23, 14, 4, 0x8a5a1a);
  },
  bottles(p) {
    const b = (x, w, h, c, cap) => {
      p.rect(x, 28 - h, w, h, c);
      p.rect(x + Math.floor(w / 2) - 1, 28 - h - 4, 3, 4, c);
      p.rect(x + Math.floor(w / 2) - 1, 28 - h - 6, 3, 2, cap);
      p.rect(x + 1, 28 - h + 3, w - 2, 4, 0xf0e8d0);
    };
    b(3, 8, 13, 0xc87a2a, 0xd8301e);
    b(12, 7, 17, 0x9a3a1e, 0x2a2a2a);
    b(20, 9, 11, 0xe0a030, 0x3a6a4a);
  },
  // ---- upgrades
  basket(p) {
    p.poly([[5, 12], [27, 12], [24, 27], [8, 27]], 0xb98a48);
    for (let y = 14; y < 27; y += 3) p.hline(6, 26, y, 0x8a5e2c);
    for (let x = 8; x < 26; x += 4) p.vline(x, 12, 26, 0xa07038);
    p.ring(16, 12, 9, 0x8a5e2c, 2);
    p.rect(10, 7, 4, 5, 0xf4ecdc);
    p.rect(18, 7, 4, 5, 0xf4ecdc);
    p.hline(10, 13, 7, 0x6a3a1e);
    p.hline(18, 21, 7, 0x6a3a1e);
  },
  rack(p) {
    p.rect(4, 8, 24, 12, 0xa0703a);
    p.rect(4, 20, 24, 8, 0x8a5a2a);
    for (let x = 4; x < 28; x += 6) p.vline(x, 8, 27, 0x6a4420);
    p.hline(4, 27, 14, 0x6a4420);
    p.line(5, 9, 27, 19, 0x6a4420);
  },
  tires(p) {
    p.ring(16, 16, 12, 0x2a2428, 4);
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      p.rect(Math.round(16 + Math.cos(a) * 13) - 1, Math.round(16 + Math.sin(a) * 13) - 1, 2, 2, 0x3a3438);
    }
    p.ring(16, 16, 8, 0xc4c6cc, 1);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI; p.line(16 + Math.cos(a) * 7, 16 + Math.sin(a) * 7, 16 - Math.cos(a) * 7, 16 - Math.sin(a) * 7, 0xc4c6cc); }
  },
  gears(p) {
    const gear = (cx, cy, r, c) => {
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        p.rect(Math.round(cx + Math.cos(a) * r) - 1, Math.round(cy + Math.sin(a) * r) - 1, 3, 3, c);
      }
      p.circle(cx, cy, r - 1, c);
      p.circle(cx, cy, r * 0.35, 0);
    };
    gear(12, 13, 8, 0xc4c6cc);
    gear(23, 22, 6, 0xd8b050);
    // punch holes
    for (const [cx, cy, r] of [[12, 13, 2.5], [23, 22, 2]]) for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) if (x * x + y * y <= r * r) p.data[((cy + y) * S + cx + x) * 4 + 3] = 0;
  },
  lamp(p) {
    p.rect(6, 11, 12, 11, 0x4a4a52);
    p.ellipse(18, 16, 4, 6, 0xfff2b0);
    p.ellipse(18, 16, 2, 4, 0xffffff);
    for (const [x2, y2] of [[30, 8], [31, 16], [30, 24]]) p.line(23, 16, x2, y2, 0xffe080);
  },
  cola(p) {
    const bottle = (x) => {
      p.rect(x, 10, 7, 17, 0x8a1e14);
      p.rect(x + 2, 4, 3, 6, 0x8a1e14);
      p.rect(x + 2, 2, 3, 2, 0xd8301e);
      p.rect(x, 15, 7, 5, 0xf2ead8);
      p.set(x + 2, 17, 0xd8301e); p.set(x + 4, 17, 0xd8301e);
    };
    bottle(7);
    bottle(18);
    p.rect(9, 27, 3, 3, 0xffb030);
    p.rect(20, 27, 3, 3, 0xffb030);
    p.set(10, 30, 0xfff0a0);
    p.set(21, 30, 0xfff0a0);
  },
  glider(p) {
    const cols = [0xd8564a, 0xf0c060, 0x5a8ab0, 0xeadfc4, 0x7aa860, 0xc87ab0];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) p.rect(2 + i * 5, 6 + j * 4 + Math.abs(i - 2.5) | 0, 5, 4, cols[(i + j * 2) % 6]);
    p.line(4, 18, 16, 28, 0x3a2a1a);
    p.line(28, 18, 16, 28, 0x3a2a1a);
  },
  thermos(p) {
    p.rect(10, 7, 12, 21, 0x2f6e52);
    p.rect(9, 4, 14, 4, 0xc4c6cc);
    p.rect(10, 13, 12, 6, 0xeadfc4);
    p.rect(13, 15, 6, 2, 0xc8361f);
    p.rect(22, 11, 3, 10, 0x2f6e52);
    p.set(14, 1, 0xd8d8d8); p.set(17, 0, 0xd8d8d8); p.set(18, 2, 0xd8d8d8);
  },
  horn(p) {
    p.poly([[4, 13], [16, 9], [16, 23], [4, 19]], 0xd8b050);
    p.ellipse(19, 16, 4, 8, 0xd8b050);
    p.ellipse(19, 16, 2.4, 6, 0x8a6a2a);
    p.circle(7, 16, 4, 0x2a2a2a);
    // antlers on the horn :)
    p.line(10, 10, 7, 4, 0xc8b48a);
    p.line(8, 6, 4, 5, 0xc8b48a);
    p.line(13, 9, 15, 3, 0xc8b48a);
  },
  springs(p) {
    for (let k = 0; k < 6; k++) {
      p.line(9, 6 + k * 4, 23, 8 + k * 4, 0xc8361f);
      p.line(23, 8 + k * 4, 9, 10 + k * 4, 0xa82a18);
    }
    p.rect(8, 3, 16, 3, 0x6a6a72);
    p.rect(8, 28, 16, 3, 0x6a6a72);
  },
  motorbike(p) {
    p.ring(8, 22, 6, 0x2a2428, 2);
    p.ring(24, 22, 6, 0x2a2428, 2);
    p.rect(10, 13, 12, 6, 0x8a2a22);
    p.rect(12, 11, 7, 3, 0xeadfc4);
    p.rect(6, 12, 6, 3, 0x4a2a1a);
    p.line(22, 13, 26, 8, 0xc4c6cc);
    p.rect(25, 7, 4, 2, 0xc4c6cc);
    p.rect(13, 18, 6, 4, 0x4a1a16);
  },
  // ---- HUD glyphs
  coin(p) {
    p.circle(16, 16, 12, 0xe8a820);
    p.circle(16, 16, 9.5, 0xf8d050);
    p.rect(15, 9, 2, 14, 0xb07818);
    p.rect(12, 11, 8, 2, 0xb07818);
    p.rect(12, 19, 8, 2, 0xb07818);
    p.rect(12, 13, 2, 3, 0xb07818);
    p.rect(18, 16, 2, 3, 0xb07818);
    p.rect(12, 15, 8, 2, 0xb07818);
    p.set(10, 9, 0xfff4b0); p.set(11, 8, 0xfff4b0);
  },
  cocoa(p) {
    p.rect(7, 11, 15, 16, 0xf4ecdc);
    p.rect(8, 11, 13, 3, 0x6a3a1e);
    p.set(10, 12, 0xfff4dc); p.set(15, 12, 0xfff4dc);
    p.ring(24, 18, 4, 0xf4ecdc, 2);
    p.rect(9, 19, 11, 3, 0xc8361f);
    p.set(11, 7, 0xe8e0d8); p.set(12, 5, 0xe8e0d8); p.set(15, 7, 0xe8e0d8); p.set(16, 4, 0xe8e0d8); p.set(19, 6, 0xe8e0d8);
  },
  home(p) {
    p.poly([[4, 15], [16, 4], [28, 15]], 0x8a2a24);
    p.rect(7, 15, 18, 13, 0x9a6a3a);
    p.rect(13, 19, 6, 9, 0x3a6a4a);
    p.rect(8, 17, 4, 4, 0xffd870);
    p.rect(20, 17, 4, 4, 0xffd870);
    p.rect(21, 5, 3, 7, 0x8a8278);
  },
  star(p) {
    p.poly([[16, 3], [20, 12], [29, 12], [22, 18], [25, 28], [16, 22], [7, 28], [10, 18], [3, 12], [12, 12]], 0xf8d050);
    p.set(14, 9, 0xfff4c0);
  },
  leaf(p) {
    p.poly([[16, 2], [18, 9], [24, 6], [22, 13], [30, 13], [24, 19], [26, 26], [18, 23], [16, 31], [14, 23], [6, 26], [8, 19], [2, 13], [10, 13], [8, 6], [14, 9]], 0xe8501e);
    p.line(16, 8, 16, 28, 0xa8341c);
  },
  cat(p) {
    p.ellipse(16, 20, 9, 8, 0xe08a3a);
    p.poly([[8, 16], [9, 6], [14, 12]], 0xe08a3a);
    p.poly([[18, 12], [23, 6], [24, 16]], 0xe08a3a);
    p.rect(11, 17, 3, 3, 0x6ad050);
    p.rect(19, 17, 3, 3, 0x6ad050);
    p.set(12, 18, INK); p.set(20, 18, INK);
    p.rect(15, 21, 2, 2, 0xe07080);
    p.ellipse(16, 25, 4, 2.4, 0xf8f0e4);
  },
  clockface(p) {
    p.circle(16, 16, 13, 0xf6efe0);
    p.ring(16, 16, 13, 0x8a5a2a, 2);
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; p.set(Math.round(16 + Math.cos(a) * 10), Math.round(16 + Math.sin(a) * 10), 0x8a5a2a); }
  },
  sun(p) {
    p.circle(16, 16, 7, 0xffd050);
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; p.rect(Math.round(16 + Math.cos(a) * 11) - 1, Math.round(16 + Math.sin(a) * 11) - 1, 3, 3, 0xffb030); }
  },
  moon(p) {
    p.circle(16, 16, 10, 0xf0e8c8);
    p.circle(21, 12, 8, 0);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; if (p.data[i] === 0 && p.data[i + 1] === 0 && p.data[i + 2] === 0) p.data[i + 3] = 0; }
  },
  rain(p) {
    p.ellipse(16, 11, 11, 6, 0xb8c0d0);
    p.ellipse(11, 12, 6, 5, 0xc8d0e0);
    for (const [x, y] of [[9, 20], [15, 23], [21, 20], [12, 27], [19, 27]]) p.rect(x, y, 2, 3, 0x5a90d0);
  },
  snowflake(p) {
    for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI; p.line(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12, 16 - Math.cos(a) * 12, 16 - Math.sin(a) * 12, 0xd8f0ff); }
    p.circle(16, 16, 3, 0xffffff);
  },
  fog(p) {
    for (let k = 0; k < 4; k++) p.rect(4 + (k % 2) * 3, 8 + k * 5, 22, 3, 0xc8c8d0);
  },
  bell(p) {
    p.ellipse(16, 15, 9, 9, 0xd8b050);
    p.rect(7, 15, 18, 6, 0xd8b050);
    p.rect(5, 21, 22, 3, 0xb08a30);
    p.circle(16, 26, 2.5, 0x8a6a2a);
    p.set(12, 10, 0xfff0b0);
  },
};

const cache = new Map();
export function icon(name) {
  if (cache.has(name)) return cache.get(name);
  const p = new Pix(S, S);
  const fn = ICONS[name];
  if (fn) fn(p);
  fin(p);
  cache.set(name, p);
  return p;
}

export function iconURL(name) {
  const key = `url:${name}`;
  if (cache.has(key)) return cache.get(key);
  const url = icon(name).toDataURL();
  cache.set(key, url);
  return url;
}

export const ICON_NAMES = Object.keys(ICONS);
