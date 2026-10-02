// A tiny pixel-art painter working on raw RGBA arrays (no DOM needed).
// Colours are 0xRRGGBB numbers; alpha is separate.
import { RNG } from '../core/noise.js';

export function rgb(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
export function hex([r, g, b]) {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  return hex([0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * t)));
}
export function shade(c, f) {
  // f < 0 darken (towards a cool shadow), f > 0 lighten (towards warm light)
  if (f < 0) {
    const s = mix(c, 0x1a0f24, Math.min(1, -f));
    return s;
  }
  return mix(c, 0xfff4d0, Math.min(1, f));
}

export class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.wrap = false;
  }
  idx(x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (this.wrap) {
      x = ((x % this.w) + this.w) % this.w;
      y = ((y % this.h) + this.h) % this.h;
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return -1;
    return (y * this.w + x) * 4;
  }
  set(x, y, c, a = 255) {
    const i = this.idx(x, y);
    if (i < 0) return;
    const d = this.data;
    if (a >= 255) {
      d[i] = (c >> 16) & 255;
      d[i + 1] = (c >> 8) & 255;
      d[i + 2] = c & 255;
      d[i + 3] = 255;
    } else if (a > 0) {
      const t = a / 255;
      d[i] = d[i] * (1 - t) + ((c >> 16) & 255) * t;
      d[i + 1] = d[i + 1] * (1 - t) + ((c >> 8) & 255) * t;
      d[i + 2] = d[i + 2] * (1 - t) + (c & 255) * t;
      d[i + 3] = Math.max(d[i + 3], a);
    }
  }
  get(x, y) {
    const i = this.idx(x, y);
    if (i < 0) return null;
    const d = this.data;
    return { c: (d[i] << 16) | (d[i + 1] << 8) | d[i + 2], a: d[i + 3] };
  }
  alpha(x, y) {
    const i = this.idx(x, y);
    return i < 0 ? 0 : this.data[i + 3];
  }
  clear(x = 0, y = 0, w = this.w, h = this.h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      const k = this.idx(i, j);
      if (k >= 0) this.data[k + 3] = 0;
    }
  }
  fill(c) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c);
  }
  rect(x, y, w, h, c, a = 255) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c, a);
  }
  hline(x0, x1, y, c) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, c);
  }
  vline(x, y0, y1, c) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.set(x, y, c);
  }
  line(x0, y0, x1, y1, c, a = 255) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  // filled ellipse centred on (cx, cy) with radii rx, ry (pixel-perfect-ish)
  ellipse(cx, cy, rx, ry, c, a = 255) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
  }
  circle(cx, cy, r, c, a = 255) {
    this.ellipse(cx, cy, r, r, c, a);
  }
  ring(cx, cy, r, c, thick = 1) {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
        if (d <= r && d > r - thick) this.set(x, y, c);
      }
    }
  }
  // polygon fill (even-odd), pts = [[x,y],...]
  poly(pts, c, a = 255) {
    let minY = Infinity, maxY = -Infinity;
    for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const yy = y + 0.5;
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length];
        if ((y0 <= yy && y1 > yy) || (y1 <= yy && y0 > yy)) xs.push(x0 + ((yy - y0) / (y1 - y0)) * (x1 - x0));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.round(xs[k]); x < Math.round(xs[k + 1]); x++) this.set(x, y, c, a);
      }
    }
  }
  // Add an outline around opaque pixels. colorFn(neighbourColour) => outline colour
  outline(color = null, opts = {}) {
    const { diagonal = false, region = [0, 0, this.w, this.h], darken = 0.55 } = opts;
    const [rx, ry, rw, rh] = region;
    const src = new Uint8ClampedArray(this.data);
    const at = (x, y) => {
      if (x < rx || y < ry || x >= rx + rw || y >= ry + rh) return -1;
      return (y * this.w + x) * 4;
    };
    const nb = diagonal ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let y = ry; y < ry + rh; y++) {
      for (let x = rx; x < rx + rw; x++) {
        const i = at(x, y);
        if (src[i + 3] > 0) continue;
        for (const [dx, dy] of nb) {
          const j = at(x + dx, y + dy);
          if (j >= 0 && src[j + 3] > 127) {
            const nc = (src[j] << 16) | (src[j + 1] << 8) | src[j + 2];
            const oc = color ?? shade(nc, -darken);
            this.data[i] = (oc >> 16) & 255;
            this.data[i + 1] = (oc >> 8) & 255;
            this.data[i + 2] = oc & 255;
            this.data[i + 3] = 255;
            break;
          }
        }
      }
    }
  }
  // Copy another Pix into this at (dx, dy), optional horizontal flip
  blit(src, dx, dy, flip = false, sx = 0, sy = 0, sw = src.w, sh = src.h) {
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        const k = ((sy + y) * src.w + (sx + (flip ? sw - 1 - x : x))) * 4;
        const a = src.data[k + 3];
        if (!a) continue;
        const c = (src.data[k] << 16) | (src.data[k + 1] << 8) | src.data[k + 2];
        this.set(dx + x, dy + y, c, a);
      }
    }
  }
  // Noise speckle using palette
  speckle(rng, colors, density, x = 0, y = 0, w = this.w, h = this.h) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
      if (rng.next() < density) this.set(i, j, rng.pick(colors));
    }
  }
  toCanvas() {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = this.w;
    c.height = this.h;
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(this.data), this.w, this.h), 0, 0);
    return c;
  }
  toDataURL() {
    return this.toCanvas()?.toDataURL() ?? '';
  }
}

export { RNG };
