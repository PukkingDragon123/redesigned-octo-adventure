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
