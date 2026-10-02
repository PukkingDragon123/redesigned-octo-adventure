// node tools/kitsheet.mjs out.png [scale] [what]
// Renders the UI kit pieces and icons to a PNG sheet without a browser, for quick
// art iteration. what = kit | icons | glyphs | all (default all).
import { writeFileSync } from 'fs';
import { deflateSync } from 'zlib';
import { Pix } from '../src/art/pixel.js';
import * as K from '../src/ui/kitart.js';

const [out = '/tmp/kitsheet.png', scaleArg = '3', what = 'all'] = process.argv.slice(2);
const SC = +scaleArg;

function png(p, scale) {
  const W = p.w * scale, H = p.h * scale;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const s = (Math.floor(y / scale) * p.w + Math.floor(x / scale)) * 4;
      const d = y * (W * 4 + 1) + 1 + x * 4;
      raw[d] = p.data[s]; raw[d + 1] = p.data[s + 1]; raw[d + 2] = p.data[s + 2]; raw[d + 3] = p.data[s + 3];
    }
  }
  const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
  const crc = (buf) => { let c = -1; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// draw a 9-slice of src into dst at (x, y) with size (w, h); slices [t, r, b, l]; edges/fill repeat
function nine(dst, src, x, y, w, h, [t, r, b, l]) {
  const sw = src.w, sh = src.h;
  const mapAxis = (v, size, a, bb, total) => {
    if (v < a) return v;
    if (v >= size - bb) return total - (size - v);
    const mid = total - a - bb;
    return a + ((v - a) % mid);
  };
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const sx = mapAxis(i, w, l, r, sw), sy = mapAxis(j, h, t, b, sh);
    const k = (sy * sw + sx) * 4;
    if (!src.data[k + 3]) continue;
    dst.set(x + i, y + j, (src.data[k] << 16) | (src.data[k + 1] << 8) | src.data[k + 2], src.data[k + 3]);
  }
}

const sheet = new Pix(640, 520);
sheet.rect(0, 0, sheet.w, sheet.h, 0x5a6a78);
// a checker so transparency reads
for (let y = 0; y < sheet.h; y += 8) for (let x = 0; x < sheet.w; x += 8) if (((x + y) >> 3) % 2) sheet.rect(x, y, 8, 8, 0x52626e);
let cx = 4, cy = 4, rowH = 0;
const place = (w, h) => {
  if (cx + w > sheet.w - 4) { cx = 4; cy += rowH + 6; rowH = 0; }
  const at = [cx, cy];
  cx += w + 6;
  rowH = Math.max(rowH, h);
  return at;
};
const put = (p) => { const [x, y] = place(p.w, p.h); sheet.blit(p, x, y); };
const putNine = (p, w, h, sl) => { const [x, y] = place(w, h); nine(sheet, p, x, y, w, h, sl); };
const nl = () => { cx = 4; cy += rowH + 8; rowH = 0; };

if (what === 'kit' || what === 'all') {
  for (const f of ['leather', 'parchment', 'dark', 'wood']) putNine(K.panelArt(f), 120, 72, [16, 16, 16, 16]);
  nl();
  for (const f of ['leather', 'parchment', 'dark', 'paper']) putNine(K.plateArt(f), 70, 24, [8, 8, 8, 8]);
  putNine(K.paperArt('note'), 80, 40, [10, 10, 10, 10]);
  putNine(K.paperArt('news'), 80, 40, [10, 10, 10, 10]);
  nl();
  for (const s of ['normal', 'hover', 'pressed', 'disabled']) putNine(K.buttonArt(s), 72, 30, K.BTN_SLICE);
  putNine(K.buttonArt('normal', 'red'), 60, 30, K.BTN_SLICE);
  putNine(K.buttonArt('normal', 'green'), 60, 30, K.BTN_SLICE);
  nl();
  for (const s of ['empty', 'filled', 'selected', 'locked']) put(K.slotArt(s));
  put(K.slotArt('filled', 30));
  put(K.slotArt('selected', 30));
  putNine(K.tabArt(true), 50, 20, [8, 8, 2, 8]);
  putNine(K.tabArt(false), 50, 20, [8, 8, 2, 8]);
  nl();
  putNine(K.wellArt('dark'), 80, 50, [8, 8, 8, 8]);
  putNine(K.wellArt('parchment'), 80, 50, [8, 8, 8, 8]);
  putNine(K.thumbArt(), 10, 40, [6, 4, 6, 4]);
  putNine(K.barArt(), 70, 12, [5, 5, 5, 5]);
  put(K.toggleArt(false)); put(K.toggleArt(true));
  put(K.knobArt(false)); put(K.knobArt(true));
  put(K.closeArt(false)); put(K.closeArt(true));
  nl();
  putNine(K.ribbonArt(), 140, 22, K.RIBBON_SLICE);
  putNine(K.ribbonArt(K.RAMP.green), 100, 22, K.RIBBON_SLICE);
  putNine(K.keyArt(), 16, 16, [5, 5, 7, 5]);
  putNine(K.keyArt(), 30, 16, [5, 5, 7, 5]);
  putNine(K.tipArt(), 60, 20, [5, 5, 5, 5]);
  put(K.tipTailArt());
  nl();
  putNine(K.pageArt('l'), 90, 60, [10, 10, 10, 10]);
  putNine(K.pageArt('r'), 90, 60, [10, 10, 10, 10]);
  put(K.filigree(true)); put(K.filigree(false));
  nl();
}
if (what === 'icons' || what === 'all') {
  const I = await import('../src/art/icons.js');
  const slot = K.slotArt('filled');
  for (const n of (I.ALL_ICON_NAMES || I.ICON_NAMES)) {
    const [x, y] = place(46, 46);
    sheet.blit(slot, x, y);
    sheet.blit(I.icon(n), x + 7, y + 7);
  }
  nl();
  if (I.GLYPH_NAMES) for (const n of I.GLYPH_NAMES) put(I.glyph(n));
}
if (what === 'glyphs') {
  const I = await import('../src/art/icons.js');
  const tile = K.plateArt('parchment');
  for (const n of I.GLYPH_NAMES) { const [x, y] = place(24, 24); nine(sheet, tile, x, y, 24, 24, [8, 8, 8, 8]); sheet.blit(I.glyph(n), x + 4, y + 4); }
}
if (what === 'food') {
  const F = await import('../src/art/foodsprites.js');
  for (const n of F.FOOD_ICONS) put(F.foodIcon(n));
}
writeFileSync(out, png(sheet, SC));
console.log('wrote', out);
