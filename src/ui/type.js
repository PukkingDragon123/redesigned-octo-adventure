// The game's typeface. Every word is set in Pixelify Sans (by Stefie Justprince, SIL Open
// Font License 1.1, bundled in src/ui/fonts with its licence): a soft, rounded, cosy pixel
// face that reads easily at a glance. Its pixels are about 1/11 of the em, so it is drawn
// at a whole multiple of 11 px (CSS: 11 * --u, see kit.css) to keep its pixels square.
// 'Pixelify' is the regular weight, 'PixelifyBold' the bold (separate families so a canvas
// can ask for either by name); Monogram stays behind them for the odd missing symbol.
export const FONT = "Pixelify, Monogram, monospace";
export const FONT_BOLD = "PixelifyBold, Pixelify, Monogram, monospace";
export const EM = 11; // art pixels to the em

// a canvas font string: px in canvas pixels
export const cfont = (px, bold = false) => `${Math.round(px)}px ${bold ? FONT_BOLD : FONT}`;

// resolves once both weights are in (never rejects)
let ready = null;
export function fontsReady() {
  if (!ready) {
    const f = document.fonts;
    ready = f?.load ? Promise.all([f.load(`${EM * 2}px Pixelify`), f.load(`${EM * 2}px PixelifyBold`)]).then(() => true, () => false) : Promise.resolve(false);
  }
  return ready;
}

// the width of a line in art pixels at the native size (for boxes sized to their words)
let mctx = null;
export function artWidth(text, bold = false) {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  mctx.font = cfont(EM, bold);
  return Math.ceil(mctx.measureText(text).width);
}

// true once the bold weight is in (cheap: callers that cache drawn text key on it)
let ok = false;
export function fontsOK() {
  if (!ok) ok = !!document.fonts?.check?.(`${EM * 2}px PixelifyBold`) && !!document.fonts?.check?.(`${EM * 2}px Pixelify`);
  return ok;
}

// A line of text as a 1-bit pixel mask at px (canvas pixels): { w, h, base, on(x, y) },
// trimmed to its inked pixels; base is the baseline row (for lining lines up). The 3D
// title cloud and the painted signpost build their letters from these.
export function textMask(text, px, bold = true) {
  const pad = 4;
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = cfont(px, bold);
  const tw = Math.ceil(g.measureText(text).width);
  const W = tw + pad * 2, H = Math.ceil(px * 1.6) + pad * 2, base = Math.ceil(px * 1.1) + pad;
  c.width = W;
  c.height = H;
  g.font = cfont(px, bold);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#fff';
  g.fillText(text, pad, base);
  const d = g.getImageData(0, 0, W, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 127) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  if (x1 < 0) return { w: 0, h: 0, base: 0, on: () => false };
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) bits[y * w + x] = d[((y + y0) * W + x + x0) * 4 + 3] > 127 ? 1 : 0;
  return { w, h, base: base - y0, bits, on: (x, y) => x >= 0 && y >= 0 && x < w && y < h && bits[y * w + x] === 1 };
}
